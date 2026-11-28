#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bot Alimentador de Vídeos do YouTube RSS — Rodando o Mundo.

Varre os feeds XML oficiais dos canais de YouTube cadastrados em config/sources.json
sem necessidade de chave de API externa ou consumo de cota do Google Cloud.
Deduplica por video_id e link, extrai metadados essenciais (título, canal, link, data ISO, thumbnail)
e grava atomicamente em data/noticias_youtube.json, além de sincronizar com data/feed_output.json.
"""
import argparse
import concurrent.futures
import datetime
import html as html_lib
import json
import os
import re
import sys
import tempfile
import unicodedata
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import feedparser  # type: ignore
except ImportError:
    feedparser = None  # type: ignore

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

try:
    from sinal_agente import agente_ativo
except ImportError:
    try:
        from scripts.sinal_agente import agente_ativo
    except ImportError:
        from contextlib import nullcontext as agente_ativo

CONFIG_SOURCES = ROOT_DIR / "config" / "sources.json"
DEFAULT_OUT_PATH = ROOT_DIR / "data" / "noticias_youtube.json"
FEED_OUTPUT_PATH = ROOT_DIR / "data" / "feed_output.json"


def carregar_canais_youtube(config_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Carrega as fontes de YouTube de config/sources.json e mescla com fontes ativas do banco se disponíveis."""
    c_path = config_path or CONFIG_SOURCES
    canais: List[Dict[str, Any]] = []
    ids_vistos = set()

    if c_path.is_file():
        try:
            dados = json.loads(c_path.read_text(encoding="utf-8"))
            if isinstance(dados, list):
                for s in dados:
                    if isinstance(s, dict) and str(s.get("tipo", "")).lower() == "youtube":
                        cid = str(s.get("id_ou_url") or "").strip()
                        m_uc = re.search(r"UC[A-Za-z0-9_-]{20,}", cid)
                        chave = m_uc.group(0) if m_uc else cid.lower()
                        if chave:
                            ids_vistos.add(chave)
                        canais.append(s)
        except Exception as e:
            print(f"[!] Erro ao carregar fontes do YouTube de {c_path}: {e}", file=sys.stderr)

    # Se chamado com caminho padrão, tenta complementar dinamicamente com canais ativos do banco ai_fontes_referencia
    if config_path is None:
        try:
            from api.routes_v2 import get_db
            gen = get_db()
            conn = next(gen)
            if conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT id, nome, url, tipo_fonte, ativo, pais_iso, regiao, referencia_condicoes_uso 
                        FROM ai_fontes_referencia 
                        WHERE (tipo_fonte IN ('youtube_rss', 'youtube') OR url ILIKE '%youtube%') AND ativo = TRUE
                        ORDER BY id
                    """)
                    for r in cur.fetchall():
                        r_url = str(r.get("url") or "").strip()
                        m = re.search(r"UC[A-Za-z0-9_-]{20,}", r_url)
                        if not m:
                            continue
                        cid = m.group(0)
                        if cid in ids_vistos:
                            continue
                        ids_vistos.add(cid)
                        nome_db = str(r.get("nome") or "Canal YouTube").strip()
                        canais.append({
                            "nome": nome_db,
                            "tipo": "youtube",
                            "id_ou_url": cid,
                            "categoria": "geopolitica",
                            "pais": str(r.get("pais_iso") or "BR")[:2],
                            "aliases": ["sobrevivendo ao brasil", "sobrevivendo no brasil", "sobrevivendo"] if "sobreviva" in nome_db.lower() else []
                        })
        except Exception:
            pass

    return canais


def resolver_url_feed_canal(id_ou_url: str) -> str:
    """Garante que o canal esteja no formato de feed XML oficial do YouTube."""
    bruto = str(id_ou_url or "").strip()
    if "feeds/videos.xml?channel_id=" in bruto:
        return bruto
    m = re.search(r"UC[A-Za-z0-9_-]{20,}", bruto)
    if m:
        return f"https://www.youtube.com/feeds/videos.xml?channel_id={m.group(0)}"
    if bruto.startswith("http://") or bruto.startswith("https://"):
        return bruto
    return f"https://www.youtube.com/feeds/videos.xml?channel_id={bruto}"


def extrair_video_id(entry: Any) -> str:
    """Extrai o ID do vídeo a partir de yt_videoid, id ou link."""
    yt_vid = getattr(entry, "yt_videoid", None)
    if isinstance(yt_vid, str) and re.fullmatch(r"[A-Za-z0-9_-]{11}", yt_vid.strip()):
        return yt_vid.strip()

    item_id = getattr(entry, "id", None)
    if isinstance(item_id, str) and item_id.startswith("yt:video:"):
        vid = item_id.removeprefix("yt:video:").strip()
        if re.fullmatch(r"[A-Za-z0-9_-]{11}", vid):
            return vid

    link = getattr(entry, "link", "") or ""
    m = re.search(r"(?:v=|\/embed\/|\/watch\?v=|\/v\/|youtu\.be\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})", link)
    if m:
        return m.group(1)
    return ""


def parsear_data_publicacao_iso(entry: Any) -> str:
    """Retorna data de publicação em ISO 8601 UTC ou momento atual como fallback."""
    for attr in ("published", "updated"):
        val = getattr(entry, attr, None)
        if isinstance(val, str) and val.strip():
            try:
                dt = datetime.datetime.fromisoformat(val.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=datetime.timezone.utc)
                return dt.astimezone(datetime.timezone.utc).isoformat()
            except Exception:
                pass
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


_RE_URL_YT = re.compile(
    r"https?://\S+|www\.\S+|\b[a-z0-9][a-z0-9.-]*\.(?:com\.br|com|org|net|gov\.br|ly|be|me)/\S*",
    re.IGNORECASE,
)
_RE_EMAIL_YT = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b", re.IGNORECASE)
_RE_RUIDO_HASH_YT = re.compile(r"#{2,}[0-9A-Za-z_À-ÿ]*")
_RE_HASHTAG_YT = re.compile(r"(?:^|\s)#[A-Za-z0-9_À-ÿ]+")
_RE_SEP_YT = re.compile(r"[-=_*~•·]{3,}")
_RE_PREFIXO_PROMO_YT = re.compile(
    r"^(?:"
    r"(?:aula\s+ao\s+vivo\s*:\s*)?o\s+novo\s+ciclo\s+brasil\b[^:\n]{0,90}?(?:inscreva-se\s+gratuitamente\s*:|:\s*)|"
    r"inscreva-se\s+(?:gratuitamente|no\s+canal|aqui|j[áa])\s*[:!.-]*\s*|"
    r"participe\s+da\s+confraria[^:\n]{0,60}:\s*|"
    r"seja\s+membro\s+(?:deste|do)\s+canal(?:\s+e\s+ganhe\s+benef[íi]cios)?\s*[:!.-]*\s*|"
    r"cupom\s+(?:de\s+desconto)?\s*:\s*\S+\s*"
    r")",
    re.IGNORECASE,
)
_RE_INLINE_PROMO_YT = re.compile(
    r"(?:"
    r"entrevista\s+completa\s+no\s+canal\s+@\S+\s+no\s+youtube!?|"
    r"seja\s+membro\s+(?:deste|do)\s+canal(?:\s+e\s+ganhe\s+benef[íi]cios)?\s*[:!.]*|"
    r"inscreva-se\s+(?:gratuitamente|no\s+canal)\s*[:!.]*|"
    r"cupom\s+de\s+desconto\s*:\s*\S+|"
    r"\bsiga-nos\s+tamb[ée]m\b.*$|"
    r"\bol[áa],\s*tudo\s+bem\?\s*se\s+voc[êe]\s+curte\s+o\s+nosso\s+trabalho\b.*$"
    r")",
    re.IGNORECASE,
)
_RE_LINHA_PROMO_YT = re.compile(
    r"(?:"
    r"\binscreva-se\b|\bseja\s+membro\b|\bapoie\s+o\s+canal\b|\bcolabore\s+com\s+o\s+canal\b|"
    r"\bajude\s+o\s+canal\b|\bcontribui[çc](?:[õo]es|ao)\s+(?:pelo|via)\s+pix\b|\bchave\s+pix\b|"
    r"\bpix\s*[:\-]?\s*(?:\d{3}[.\-]?\d{3}|\S+@\S+|\(?\d{2}\)?\s*\d{4,5})\b|"
    r"\blink\s+(?:para\s+(?:membros|apoiar|o\s+x|o\s+v[íi]deo|inscri[çc][ãa]o)|do\s+v[íi]deo)\b|"
    r"\bcupom\s+de\s+desconto\b|\buse\s+o\s+cupom\b|\bganhe\s+a\s+\d+ª\s+mensalidade\b|"
    r"\b(?:ganhe\s+at[ée]|ganhar[ãa]o)[^.\n]*cashback\b|\babra\s+agora\s+sua\s+conta\b|"
    r"\babrirem\s+(?:a\s+)?conta\s+com\s+o\s+meu\s+c[óo]digo\b|\bjoin\s+revolut\b|"
    r"\btenha\s+acesso\s+a\s+nomad\b|\bcontabilizei\b|\baprenda\s+a\s+investir\s+comigo\b|"
    r"\bentrevista\s+completa\s+no\s+canal\b|\benvie\s+sua\s+pergunta\b|"
    r"\bdeixe\s+(?:o\s+)?seu\s+like\b|\bative\s+o\s+sininho\b|\bcompartilhe\s+(?:este|esse)\s+v[íi]deo\b|"
    r"\bcomunidade\s+no\s+telegram\b|\bcontato\b.*\banuncie\b|"
    r"\bse\s+voc[êe]\s+curte\s+o\s+nosso\s+trabalho\b|"
    r"\bbem[-\s]?vindo\s+ao\b.*\bsua\s+fonte\s+di[áa]ria\b|"
    r"\bsomos\s+o\s+canal\b.*\bcom\s+o\s+intuito\b|"
    r"\btemos\s+o\s+prop[óo]sito\s+de\s+manter\b|"
    r"\bseja\s+bem[-\s]?vindo\(a\)\s+ao\s+canal\b|\bfique\s+atento\s+aos\s+sinais\b|"
    r"\bescute\s+meu\s+[áa]lbum\b|\bgalera,\s*d[áa]\s+uma\s+for[çc]a\b|\bse\s+quiser\s+ir\s+no\s+show\b|"
    r"\bparticipe\s+da\s+confraria\b|\baula\s+ao\s+vivo\s*:|\bo\s+novo\s+ciclo\s+brasil\b|"
    r"\bcompre\s+(?:meu|o)\s+livro\b|meu\s+livro\s*:|\bmeu\s+outro\s+canal\b|\bemail\s+comercial\b|\bredes\s+sociais\b|"
    r"\bepis[óo]dio\s+completo\b|\bcursos?\s+(?:do|e|online|gratuito)\b|^\s*(?:[\W_]*\s*)?cursos?\b|"
    r"^\s*sobre(?:\s+o\s+canal)?\s*:"
    r")",
    re.IGNORECASE,
)
_RE_ROTULO_CURTO_YT = re.compile(
    r"^(?:link(?:\s+do\s+v[íi]deo)?|instagram|twitter(?:/x)?|facebook|tiktok|telegram|whatsapp|"
    r"playlist[^:]*|sobre|redes\s+sociais|epis[óo]dio\s+completo|cupom(?:\s+de\s+desconto)?)\s*:?\s*$",
    re.IGNORECASE,
)
_CONECTORES_FINAIS_YT = {
    "a", "e", "o", "as", "os", "de", "do", "da", "dos", "das",
    "em", "no", "na", "nos", "nas", "para", "com", "por", "que", "um", "uma", "ou",
}


def _normalizar_comparacao_yt(texto: str) -> str:
    """Normaliza string para comparação tolerante entre linha e título."""
    t = unicodedata.normalize("NFD", str(texto or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def limpar_descricao_youtube(desc_bruta: str, titulo: str = "", nome_canal: str = "YouTube") -> str:
    """Higieniza descrições cruas do YouTube removendo URLs, hashtags, CTAs, bios e truncamentos."""
    canal_ref = str(nome_canal or "YouTube").strip() or "YouTube"
    fallback = f"Análise e cobertura em vídeo publicada pelo canal {canal_ref} no YouTube."
    raw = (
        html_lib.unescape(str(desc_bruta or ""))
        .replace("\ufffc", " ")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .strip()
    )
    if not raw:
        return fallback

    texto = _RE_URL_YT.sub("", raw)
    texto = _RE_EMAIL_YT.sub("", texto)
    texto = _RE_RUIDO_HASH_YT.sub(" ", texto)
    texto = _RE_HASHTAG_YT.sub(" ", texto)
    texto = _RE_SEP_YT.sub("\n", texto)

    tit_norm = _normalizar_comparacao_yt(titulo)
    linhas_limpas: List[str] = []

    for linha_bruta in texto.split("\n"):
        linha = re.sub(r"[ \t]+", " ", linha_bruta).strip()
        if not linha:
            continue
        linha_nfkc = unicodedata.normalize("NFKC", linha)
        linha = _RE_PREFIXO_PROMO_YT.sub("", linha_nfkc).strip()
        linha = _RE_INLINE_PROMO_YT.sub("", linha).strip()
        linha = re.sub(r"^[\s\-:|–—]+|[\s\-:|–—]+$", "", linha).strip()
        if not linha or _RE_ROTULO_CURTO_YT.match(linha):
            continue
        if _RE_LINHA_PROMO_YT.search(linha):
            continue
        if re.fullmatch(r"[@\W_0-9]+", linha):
            continue

        linha_norm = _normalizar_comparacao_yt(linha)
        if tit_norm and len(tit_norm) >= 12:
            if linha_norm == tit_norm:
                continue
            if linha_norm.startswith(tit_norm) and len(linha_norm) > len(tit_norm) + 8:
                # Remove repetição exata do título colada no início do parágrafo
                idx_sep = max(linha.find("?"), linha.find("!"), linha.find("."))
                if 0 < idx_sep <= len(titulo) + 5:
                    linha = linha[idx_sep + 1:].strip()
                    linha_norm = _normalizar_comparacao_yt(linha)
                    if not linha or linha_norm == tit_norm:
                        continue

        linhas_limpas.append(linha)

    partes_unidas: List[str] = []
    for idx_l, linha_atual in enumerate(linhas_limpas):
        if idx_l > 0 and partes_unidas:
            anterior = partes_unidas[-1]
            if not anterior.endswith((".", "!", "?", ":", ";", "…")) and re.match(r"^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]", linha_atual):
                partes_unidas[-1] = anterior + "."
        partes_unidas.append(linha_atual)

    combinado = re.sub(r"\s+", " ", " ".join(partes_unidas)).strip()
    if not combinado or len(combinado) < 25:
        return fallback
    if tit_norm and _normalizar_comparacao_yt(combinado) == tit_norm:
        return fallback

    def _ultima_sentenca_completa(texto_in: str, min_idx: int = 60) -> str:
        """Retorna até o último ponto final de sentença válido, ignorando abreviações curtas."""
        matches = list(re.finditer(r"(?<!\b[nNdDrRsS])(?<!\b[A-Za-z])[.!?](?=\s|$)", texto_in))
        for m in reversed(matches):
            pos = m.start()
            if pos >= min_idx:
                return texto_in[: pos + 1].strip()
        return ""

    veio_truncado = combinado.endswith(("...", "…")) or (len(raw) >= 315 and not combinado.endswith((".", "!", "?")))
    if veio_truncado:
        combinado = re.sub(r"(?:\.{2,}|…)+\s*$", "", combinado).strip()
        sentenca = _ultima_sentenca_completa(combinado, min_idx=60)
        if sentenca:
            combinado = sentenca
        else:
            return fallback

    if len(combinado) > 420:
        corte = combinado[:420]
        sentenca = _ultima_sentenca_completa(corte, min_idx=60)
        if sentenca:
            combinado = sentenca
        else:
            return fallback

    if not combinado.endswith((".", "!", "?")):
        sentenca = _ultima_sentenca_completa(combinado, min_idx=60)
        if sentenca:
            combinado = sentenca
        elif len(raw) < 315:
            combinado = combinado.rstrip(",;:- ") + "."
        else:
            return fallback

    if not combinado or len(combinado) < 25:
        return fallback
    return combinado


def _limpar_analise_youtube(analise: Any, resumo: str, resumo_bruto: str = "") -> str:
    """Preserva apenas análise editorial distinta; remove cópias de resumo ou fallback genérico."""
    cand = str(analise or "").strip()
    if not cand:
        return ""
    if cand == resumo or (resumo_bruto and cand == str(resumo_bruto).strip()):
        return ""
    if cand.startswith("Tendência com forte aceleração de interesse"):
        return ""
    return cand


def _normalizar_item_video(
    video_id: str,
    titulo: str,
    resumo: str,
    nome_canal: str,
    link: str,
    data_pub: str,
    categoria: str = "geopolitica",
    pais: str = "BR",
    indice_fallback: int = 0,
    tempo_relativo_youtube: str = "",
    captura_tempo_real: bool = False,
    recem_lancado: bool = False,
    analise: str = "",
) -> Dict[str, Any]:
    """Monta o dicionário normalizado padrão de um vídeo do YouTube."""
    thumb = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else ""
    analise_limpa = _limpar_analise_youtube(analise, resumo)
    item: Dict[str, Any] = {
        "id": f"yt-{video_id}" if video_id else f"yt-{indice_fallback}",
        "video_id": video_id,
        "slug": f"yt-{video_id}" if video_id else f"yt-{indice_fallback}",
        "titulo": titulo,
        "resumo": resumo,
        "analise": analise_limpa,
        "canal": nome_canal,
        "fonte_nome": nome_canal,
        "fonte_url": link,
        "url": link,
        "thumbnail": thumb,
        "imagem_url": thumb,
        "data_publicacao": data_pub,
        "publicado_em": data_pub,
        "published_at": data_pub,
        "formato": "video",
        "categoria": categoria,
        "origem": "video",
        "origem_video": True,
        "origem_manual": False,
        "origem_v2": False,
        "urgencia_score": 78,
        "nivel_relevancia": 3,
        "paises_envolvidos": [pais] if pais else ["BR"],
    }
    if tempo_relativo_youtube:
        item["tempo_relativo_youtube"] = tempo_relativo_youtube
    if captura_tempo_real:
        item["captura_tempo_real"] = True
    if recem_lancado:
        item["recem_lancado"] = True
    return item


def coletar_canal(source: Dict[str, Any], max_por_canal: int = 3) -> List[Dict[str, Any]]:
    """Lê o feed RSS de um canal do YouTube e retorna os vídeos mais recentes normalizados."""
    if not feedparser:
        return []

    nome_canal = str(source.get("nome") or "Canal YouTube").strip()
    id_ou_url = str(source.get("id_ou_url") or "").strip()
    categoria = str(source.get("categoria") or "geopolitica").strip().lower()
    pais = str(source.get("pais_iso") or source.get("pais") or "BR").strip().upper()

    feed_url = resolver_url_feed_canal(id_ou_url)
    sep = "&" if "?" in feed_url else "?"
    feed_url_live = f"{feed_url}{sep}_t={int(datetime.datetime.now(datetime.timezone.utc).timestamp())}"
    itens: List[Dict[str, Any]] = []

    try:
        parsed = feedparser.parse(feed_url_live)
        if not getattr(parsed, "entries", None):
            return []

        entries = list(parsed.entries)
        for entry in entries[:max_por_canal]:
            titulo = str(getattr(entry, "title", "") or "").strip()
            if not titulo:
                continue

            video_id = extrair_video_id(entry)
            link = str(getattr(entry, "link", "") or "").strip()
            if not link and video_id:
                link = f"https://www.youtube.com/watch?v={video_id}"

            if not link:
                continue

            data_pub = parsear_data_publicacao_iso(entry)

            # Resumo do vídeo via descrição da mídia higienizada
            summary = getattr(entry, "summary", "") or getattr(entry, "description", "") or ""
            media_desc = getattr(entry, "media_description", "") or summary
            resumo = limpar_descricao_youtube(str(media_desc), titulo=titulo, nome_canal=nome_canal)

            itens.append(
                _normalizar_item_video(
                    video_id=video_id,
                    titulo=titulo,
                    resumo=resumo,
                    nome_canal=nome_canal,
                    link=link,
                    data_pub=data_pub,
                    categoria=categoria,
                    pais=pais,
                    indice_fallback=len(itens),
                )
            )
    except Exception as e:
        print(f"[!] Falha ao processar canal '{nome_canal}': {e}", file=sys.stderr)

    return itens


def varrer_todos_canais(max_por_canal: int = 3, max_workers: int = 8) -> List[Dict[str, Any]]:
    """Varre em paralelo todos os canais de YouTube cadastrados e retorna lista ordenada por data."""
    canais = carregar_canais_youtube()
    if not canais:
        return []

    todos_videos: List[Dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futuros = {executor.submit(coletar_canal, c, max_por_canal): c for c in canais}
        for fut in concurrent.futures.as_completed(futuros):
            try:
                vids = fut.result()
                if vids:
                    todos_videos.extend(vids)
            except Exception as e:
                c_info = futuros[fut]
                print(f"[!] Erro no worker para {c_info.get('nome')}: {e}", file=sys.stderr)

    # Ordenação por data decrescente
    def _ts(x: Dict[str, Any]) -> float:
        raw = x.get("data_publicacao") or ""
        try:
            return datetime.datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
        except Exception:
            return 0.0

    todos_videos.sort(key=_ts, reverse=True)

    # Deduplicação por video_id ou link
    vistos = set()
    unicos: List[Dict[str, Any]] = []
    for v in todos_videos:
        chave = v.get("video_id") or v.get("fonte_url") or v.get("titulo")
        if not chave or chave in vistos:
            continue
        vistos.add(chave)
        unicos.append(v)

    return unicos


def gravar_payload_atomicamente(dados: Any, destino: Path) -> None:
    """Grava o dicionário ou lista JSON atomicamente no destino (com fallback para locks do Windows/OneDrive)."""
    import time

    destino.parent.mkdir(parents=True, exist_ok=True)
    conteudo = json.dumps(dados, ensure_ascii=False, indent=2)
    temp_fd, temp_name = tempfile.mkstemp(dir=str(destino.parent), prefix="tmp_yt_", suffix=".json")
    try:
        with open(temp_fd, "w", encoding="utf-8") as f:
            f.write(conteudo)
        ultimo_erro: Optional[Exception] = None
        for tentativa in range(4):
            try:
                os.replace(temp_name, str(destino))
                return
            except PermissionError as err:
                ultimo_erro = err
                time.sleep(0.15 * (tentativa + 1))
        # Fallback de escrita direta quando o OneDrive/Windows bloqueia rename atômico
        destino.write_text(conteudo, encoding="utf-8")
        if os.path.exists(temp_name):
            try:
                os.unlink(temp_name)
            except Exception:
                pass
    except Exception:
        if os.path.exists(temp_name):
            try:
                os.unlink(temp_name)
            except Exception:
                pass
        raise


def _sincronizar_videos_com_feed_output(
    videos: List[Dict[str, Any]],
    feed_path: Optional[Path] = None,
    max_items: int = 120,
) -> int:
    """
    Sincroniza vídeos de data/noticias_youtube.json com data/feed_output.json (suportando list ou dict na raiz)
    e também com a chave 'feed_output' no PostgreSQL via src.estado_db.atualizar_estado.
    Garante que vídeos aprovados manualmente ou de canais monitorados sempre constem no feed_output.
    """
    if not videos:
        return 0

    f_path = feed_path or FEED_OUTPUT_PATH
    sincronizar_db = os.path.abspath(str(f_path)) == os.path.abspath(str(FEED_OUTPUT_PATH))

    def _normalizar_para_card_feed(v: Dict[str, Any]) -> Dict[str, Any]:
        vid = str(v.get("video_id") or "").strip()
        link = str(v.get("fonte_url") or v.get("url") or "").strip()
        if not link and vid:
            link = f"https://www.youtube.com/watch?v={vid}"
        canal = str(v.get("fonte_nome") or v.get("canal") or "YouTube").strip()
        titulo = str(v.get("titulo") or "").strip()
        resumo_bruto = str(v.get("resumo") or v.get("analise") or "").strip()
        resumo = limpar_descricao_youtube(resumo_bruto, titulo=titulo, nome_canal=canal)
        analise = _limpar_analise_youtube(v.get("analise"), resumo, resumo_bruto)
        data_pub = str(v.get("data_publicacao") or v.get("published_at") or v.get("publicado_em") or "").strip()
        slug = str(v.get("slug") or (f"yt-{vid}" if vid else "")).strip()
        thumb = str(v.get("thumbnail") or v.get("imagem_url") or (f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if vid else "")).strip()
        card: Dict[str, Any] = {
            "id": str(v.get("id") or slug or f"yt-{vid}"),
            "video_id": vid,
            "slug": slug,
            "titulo": titulo,
            "resumo": resumo,
            "analise": analise,
            "categoria": str(v.get("categoria") or "geopolitica").strip().lower(),
            "fonte_nome": canal,
            "canal": canal,
            "fonte_url": link,
            "url": link,
            "thumbnail": thumb,
            "imagem_url": thumb,
            "data_publicacao": data_pub,
            "formato": "video",
            "origem": "video",
            "origem_video": True,
            "origem_manual": bool(v.get("origem_manual") or v.get("aprovado_manualmente")),
            "origem_v2": False,
            "urgencia_score": int(v.get("urgencia_score") or (82 if v.get("aprovado_manualmente") else 78)),
            "nivel_relevancia": int(v.get("nivel_relevancia") or 3),
            "paises_envolvidos": list(v.get("paises_envolvidos") or ["BR"]),
        }
        if v.get("aprovado_manualmente"):
            card["aprovado_manualmente"] = True
        return card

    cards_videos = [
        _normalizar_para_card_feed(v)
        for v in videos
        if isinstance(v, dict) and str(v.get("titulo") or "").strip()
    ]
    if not cards_videos:
        return 0

    adicionados_count = [0]

    def _mesclar_em_lista(lista_atual: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        atuais = [dict(x) for x in (lista_atual or []) if isinstance(x, dict)]
        por_url: Dict[str, int] = {}
        por_vid: Dict[str, int] = {}
        for idx, item in enumerate(atuais):
            u = str(item.get("fonte_url") or item.get("url") or "").strip()
            vid = str(item.get("video_id") or "").strip()
            if not vid and u:
                m = re.search(r"(?:v=|/shorts/|youtu\.be/)([A-Za-z0-9_-]{11})", u)
                if m:
                    vid = m.group(1)
            if u:
                por_url[u] = idx
            if vid:
                por_vid[vid] = idx

        novos: List[Dict[str, Any]] = []
        for cv in cards_videos:
            u = cv["fonte_url"]
            vid = cv["video_id"]
            idx_existente = (por_vid.get(vid) if vid in por_vid else None)
            if idx_existente is None and u in por_url:
                idx_existente = por_url[u]

            if idx_existente is not None:
                existente = atuais[idx_existente]
                existente["formato"] = "video"
                existente["origem_video"] = True
                if not existente.get("origem") or existente.get("origem") == "rss":
                    existente["origem"] = "video"
                res_existente = str(existente.get("resumo") or "").strip()
                res_eh_generico = not res_existente or res_existente.startswith("Análise publicada pelo canal") or res_existente.startswith("Análise e cobertura em vídeo")
                if cv.get("resumo") and res_eh_generico:
                    existente["resumo"] = cv["resumo"]
                existente["analise"] = _limpar_analise_youtube(
                    existente.get("analise"),
                    existente.get("resumo") or "",
                ) or cv.get("analise", "")
                if cv.get("aprovado_manualmente"):
                    existente["aprovado_manualmente"] = True
                    existente["origem_manual"] = True
                    existente["urgencia_score"] = max(int(existente.get("urgencia_score") or 0), int(cv.get("urgencia_score") or 82))
                if cv.get("thumbnail") and not existente.get("thumbnail"):
                    existente["thumbnail"] = cv["thumbnail"]
                    existente["imagem_url"] = cv["thumbnail"]
            else:
                novos.append(cv)
                if u:
                    por_url[u] = -1
                if vid:
                    por_vid[vid] = -1

        adicionados_count[0] = len(novos)
        combinados = novos + atuais

        def _ts_item(it: Dict[str, Any]) -> float:
            raw = str(it.get("data_publicacao") or it.get("published_at") or it.get("publicado_em") or "").strip()
            if not raw:
                return 0.0
            try:
                return datetime.datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
            except Exception:
                return 0.0

        combinados.sort(key=_ts_item, reverse=True)
        if len(combinados) > max_items:
            protegidos = [it for it in combinados if it.get("aprovado_manualmente") or it.get("fixado")]
            ids_prot = {id(it) for it in protegidos}
            restantes = [it for it in combinados if id(it) not in ids_prot]
            combinados = (protegidos + restantes)[:max_items]
            combinados.sort(key=_ts_item, reverse=True)
        return combinados

    # 1. Lê arquivo local (suportando list ou dict com "items")
    raw_file: Any = []
    is_dict_wrapper = False
    if f_path.is_file():
        try:
            raw_file = json.loads(f_path.read_text(encoding="utf-8"))
            if isinstance(raw_file, dict) and isinstance(raw_file.get("items"), list):
                is_dict_wrapper = True
        except Exception:
            raw_file = []

    lista_base = raw_file["items"] if is_dict_wrapper else (raw_file if isinstance(raw_file, list) else [])

    # 2. Atualiza no PostgreSQL se for o caminho canônico e o banco estiver disponível
    lista_final: Optional[List[Dict[str, Any]]] = None
    if sincronizar_db:
        try:
            from src.estado_db import atualizar_estado, banco_disponivel

            if banco_disponivel():
                def _transformar_db(atual: Any) -> List[Dict[str, Any]]:
                    base_db = atual.get("items") if isinstance(atual, dict) and isinstance(atual.get("items"), list) else (atual if isinstance(atual, list) else lista_base)
                    # Garante união entre banco e arquivo local antes de mesclar os vídeos
                    unidos = list(base_db)
                    urls_db = {str(x.get("fonte_url") or "") for x in unidos if isinstance(x, dict)}
                    for item_arq in lista_base:
                        if isinstance(item_arq, dict) and str(item_arq.get("fonte_url") or "") not in urls_db:
                            unidos.append(item_arq)
                    return _mesclar_em_lista(unidos)

                res_db = atualizar_estado("feed_output", _transformar_db, default=lista_base)
                if isinstance(res_db, list):
                    lista_final = res_db
        except Exception as err_db:
            print(f"[!] Aviso ao sincronizar feed_output no banco: {err_db}", file=sys.stderr)

    if lista_final is None:
        lista_final = _mesclar_em_lista(lista_base)

    # 3. Persiste no arquivo local preservando o formato raiz (list canônica ou dict wrapper)
    try:
        if is_dict_wrapper and isinstance(raw_file, dict):
            raw_file["items"] = lista_final
            raw_file["atualizadoEm"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            gravar_payload_atomicamente(raw_file, f_path)
        else:
            gravar_payload_atomicamente(lista_final, f_path)
    except Exception as err_file:
        print(f"[!] Erro ao gravar data/feed_output.json: {err_file}", file=sys.stderr)

    return adicionados_count[0]


def executar_bot_youtube(
    max_por_canal: int = 3,
    dry_run: bool = False,
    out_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Executa a varredura completa do bot de vídeos do YouTube e grava data/noticias_youtube.json."""
    with agente_ativo("feeder_youtube"):
        return _executar_bot_youtube_impl(
            max_por_canal=max_por_canal,
            dry_run=dry_run,
            out_path=out_path,
        )


def _executar_bot_youtube_impl(
    max_por_canal: int = 3,
    dry_run: bool = False,
    out_path: Optional[Path] = None,
) -> Dict[str, Any]:
    t0 = datetime.datetime.now(datetime.timezone.utc)
    target_path = out_path or DEFAULT_OUT_PATH

    canais = carregar_canais_youtube()
    videos = varrer_todos_canais(max_por_canal=max_por_canal)

    # Preserva itens aprovados manualmente ou capturados em tempo real já existentes no arquivo
    itens_existentes: List[Dict[str, Any]] = []
    if not dry_run and target_path.is_file():
        try:
            payload_antigo = json.loads(target_path.read_text(encoding="utf-8"))
            if isinstance(payload_antigo, dict) and isinstance(payload_antigo.get("items"), list):
                itens_existentes = [x for x in payload_antigo["items"] if isinstance(x, dict)]
        except Exception:
            itens_existentes = []

    def _eh_item_protegido(it: Dict[str, Any]) -> bool:
        return bool(
            it.get("aprovado_manualmente")
            or it.get("origem_manual")
            or it.get("captura_tempo_real")
            or it.get("recem_lancado")
        )

    # Mapeia itens existentes protegidos por video_id e url
    protegidos_por_id: Dict[str, Dict[str, Any]] = {}
    protegidos_por_url: Dict[str, Dict[str, Any]] = {}
    lista_protegidos: List[Dict[str, Any]] = []

    for old_it in itens_existentes:
        if _eh_item_protegido(old_it):
            vid = str(old_it.get("video_id") or "").strip()
            vurl = str(old_it.get("url") or old_it.get("fonte_url") or "").strip()
            if vid:
                protegidos_por_id[vid] = old_it
            if vurl:
                protegidos_por_url[vurl] = old_it
            lista_protegidos.append(old_it)

    # Mapeia traduções e análises editoriais existentes em feed_output.json ou itens anteriores
    traducoes_por_id: Dict[str, Dict[str, Any]] = {}
    traducoes_por_url: Dict[str, Dict[str, Any]] = {}
    if FEED_OUTPUT_PATH.is_file():
        try:
            feed_raw = json.loads(FEED_OUTPUT_PATH.read_text(encoding="utf-8"))
            if isinstance(feed_raw, list):
                for f in feed_raw:
                    if isinstance(f, dict):
                        f_url = str(f.get("fonte_url") or f.get("url") or "").strip()
                        f_vid = str(f.get("video_id") or "").strip()
                        if not f_vid and f_url:
                            m_v = re.search(r"(?:v=|/shorts/|youtu\.be/)([A-Za-z0-9_-]{11})", f_url)
                            if m_v:
                                f_vid = m_v.group(1)
                        if f_url and f_url != "/radar":
                            traducoes_por_url[f_url] = f
                        if f_vid:
                            traducoes_por_id[f_vid] = f
        except Exception:
            pass

    for old_it in itens_existentes:
        old_vid = str(old_it.get("video_id") or "").strip()
        old_url = str(old_it.get("url") or old_it.get("fonte_url") or "").strip()
        if old_it.get("analise") or (old_it.get("titulo") and any(c in old_it.get("titulo") for c in "áéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ")):
            if old_vid and old_vid not in traducoes_por_id:
                traducoes_por_id[old_vid] = old_it
            if old_url and old_url not in traducoes_por_url:
                traducoes_por_url[old_url] = old_it

    qtd_preservados = 0
    novos_enriquecidos: List[Dict[str, Any]] = []
    protegidos_ja_incluidos_ids = set()
    protegidos_ja_incluidos_urls = set()

    for v in videos:
        vid = str(v.get("video_id") or "").strip()
        vurl = str(v.get("url") or v.get("fonte_url") or "").strip()
        prot = (protegidos_por_id.get(vid) if vid else None) or (protegidos_por_url.get(vurl) if vurl else None)
        v_merged = dict(v)
        if prot is not None:
            for flag in ("aprovado_manualmente", "origem_manual", "captura_tempo_real", "recem_lancado", "tempo_relativo_youtube"):
                if flag in prot:
                    v_merged[flag] = prot[flag]
            v_merged["urgencia_score"] = max(
                int(v_merged.get("urgencia_score") or 0),
                int(prot.get("urgencia_score") or 0),
            )
            if prot.get("nivel_relevancia"):
                v_merged["nivel_relevancia"] = max(
                    int(v_merged.get("nivel_relevancia") or 0),
                    int(prot.get("nivel_relevancia") or 0),
                )
            if vid:
                protegidos_ja_incluidos_ids.add(vid)
            if vurl:
                protegidos_ja_incluidos_urls.add(vurl)
            qtd_preservados += 1

        # Enriquecimento com traduções em português se houver
        trad = (traducoes_por_id.get(vid) if vid else None) or (traducoes_por_url.get(vurl) if vurl else None)
        if trad is not None:
            if trad.get("titulo") and trad["titulo"] != v_merged.get("titulo"):
                v_merged["titulo"] = trad["titulo"]
            if trad.get("resumo") and trad["resumo"] != v_merged.get("resumo"):
                v_merged["resumo"] = trad["resumo"]
            if trad.get("analise") and not v_merged.get("analise"):
                v_merged["analise"] = trad["analise"]

        novos_enriquecidos.append(v_merged)

    # Itens protegidos que ainda não apareceram no RSS (ex: captura HTML em tempo real ou link direto avulso)
    protegidos_ausentes_no_rss: List[Dict[str, Any]] = []
    for prot in lista_protegidos:
        vid = str(prot.get("video_id") or "").strip()
        vurl = str(prot.get("url") or prot.get("fonte_url") or "").strip()
        if (vid and vid in protegidos_ja_incluidos_ids) or (vurl and vurl in protegidos_ja_incluidos_urls):
            continue
        prot_limpo = dict(prot)
        prot_canal = str(prot_limpo.get("canal") or prot_limpo.get("fonte_nome") or "YouTube").strip()
        prot_tit = str(prot_limpo.get("titulo") or "").strip()
        prot_res_bruto = str(prot_limpo.get("resumo") or prot_limpo.get("analise") or "").strip()
        prot_res_limpo = limpar_descricao_youtube(prot_res_bruto, titulo=prot_tit, nome_canal=prot_canal)
        prot_limpo["resumo"] = prot_res_limpo
        prot_limpo["analise"] = _limpar_analise_youtube(prot_limpo.get("analise"), prot_res_limpo, prot_res_bruto)
        protegidos_ausentes_no_rss.append(prot_limpo)
        qtd_preservados += 1

    # Mescla final deduplicada mantendo aprovados manualmente no topo e ordenados por data decrescente
    candidatos = protegidos_ausentes_no_rss + novos_enriquecidos
    vistos_ids = set()
    vistos_urls = set()
    videos_mesclados: List[Dict[str, Any]] = []

    for item in candidatos:
        vid = str(item.get("video_id") or "").strip()
        vurl = str(item.get("url") or item.get("fonte_url") or "").strip()
        if (vid and vid in vistos_ids) or (vurl and vurl in vistos_urls):
            continue
        if vid:
            vistos_ids.add(vid)
        if vurl:
            vistos_urls.add(vurl)
        videos_mesclados.append(item)

    videos_mesclados.sort(
        key=lambda x: (
            1 if x.get("aprovado_manualmente") else 0,
            str(x.get("data_publicacao") or x.get("published_at") or ""),
        ),
        reverse=True,
    )

    t1 = datetime.datetime.now(datetime.timezone.utc)
    duracao_ms = int((t1 - t0).total_seconds() * 1000)

    resultado = {
        "ok": True,
        "status": "concluido",
        "job_nome": "bot_youtube_feeder",
        "duracao_ms": duracao_ms,
        "dry_run": dry_run,
        "canais_varridos": len(canais),
        "total_itens": len(videos_mesclados),
        "preservados_tempo_real": qtd_preservados,
        "atualizadoEm": t1.isoformat(),
        "items": videos_mesclados,
    }

    if not dry_run and videos_mesclados:
        gravar_payload_atomicamente(resultado, target_path)
        if os.path.abspath(str(target_path)) == os.path.abspath(str(DEFAULT_OUT_PATH)):
            try:
                _sincronizar_videos_com_feed_output(videos_mesclados[:35])
            except Exception as err_sync:
                print(f"[!] Aviso ao sincronizar youtube_feeder com feed_output: {err_sync}", file=sys.stderr)

    return resultado


def _remover_acentos(texto: str) -> str:
    """Remove acentos e caracteres diacríticos para busca tolerante."""
    t = str(texto or "").strip().lower()
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")


def listar_canais_cadastrados_youtube() -> List[Dict[str, Any]]:
    """Retorna lista simplificada e ordenada dos canais do YouTube cadastrados."""
    canais = carregar_canais_youtube()
    resultado = []
    for c in canais:
        resultado.append({
            "nome": str(c.get("nome") or "Canal YouTube").strip(),
            "id_ou_url": str(c.get("id_ou_url") or "").strip(),
            "categoria": str(c.get("categoria") or "geopolitica").strip().lower(),
            "pais_iso": str(c.get("pais_iso") or c.get("pais") or "BR").strip().upper(),
        })
    resultado.sort(key=lambda x: x["nome"].lower())
    return resultado


_YOUTUBE_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Cookie": "CONSENT=YES+cb",
}


def _baixar_html_youtube(url: str, timeout: int = 8) -> str:
    """Baixa HTML público do YouTube com headers de navegador e sem cache."""
    req = urllib.request.Request(url, headers=_YOUTUBE_HTTP_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def _converter_tempo_relativo_para_iso(texto_relativo: str) -> str:
    """Converte strings relativas do YouTube (ex: 'há 5 minutos') em ISO 8601 UTC aproximado."""
    agora = datetime.datetime.now(datetime.timezone.utc)
    texto = str(texto_relativo or "").strip().lower()
    if not texto:
        return agora.isoformat()

    if any(k in texto for k in ("agora", "just now", "ao vivo", "live", "momentos")):
        return agora.isoformat()

    m = re.search(
        r"(\d+)\s*(segundo|seg|second|sec|minuto|min|minute|hora|hour|dia|day|semana|week|m[eê]s|meses|month|ano|year)s?",
        texto,
    )
    if not m:
        return agora.isoformat()

    qtd = int(m.group(1))
    unidade = m.group(2)

    if unidade.startswith(("seg", "sec")):
        dt = agora - datetime.timedelta(seconds=qtd)
    elif unidade.startswith("min"):
        dt = agora - datetime.timedelta(minutes=qtd)
    elif unidade.startswith(("hora", "hour")):
        dt = agora - datetime.timedelta(hours=qtd)
    elif unidade.startswith(("dia", "day")):
        dt = agora - datetime.timedelta(days=qtd)
    elif unidade.startswith(("semana", "week")):
        dt = agora - datetime.timedelta(weeks=qtd)
    elif unidade.startswith(("mês", "mes", "month")):
        dt = agora - datetime.timedelta(days=qtd * 30)
    elif unidade.startswith(("ano", "year")):
        dt = agora - datetime.timedelta(days=qtd * 365)
    else:
        dt = agora

    return dt.isoformat()


def _marcar_videos_ja_publicados(videos: List[Dict[str, Any]]) -> None:
    """Marca `ja_publicado` nos vídeos comparando com data/noticias_youtube.json."""
    videos_publicados_ids = set()
    videos_publicados_urls = set()
    if DEFAULT_OUT_PATH.is_file():
        try:
            dados_atuais = json.loads(DEFAULT_OUT_PATH.read_text(encoding="utf-8"))
            if isinstance(dados_atuais, dict):
                for it in dados_atuais.get("items") or []:
                    if isinstance(it, dict):
                        if it.get("video_id"):
                            videos_publicados_ids.add(str(it["video_id"]).strip())
                        if it.get("url"):
                            videos_publicados_urls.add(str(it["url"]).strip())
                        if it.get("fonte_url"):
                            videos_publicados_urls.add(str(it["fonte_url"]).strip())
        except Exception:
            pass

    for v in videos:
        vid_id = str(v.get("video_id") or "").strip()
        v_url = str(v.get("url") or v.get("fonte_url") or "").strip()
        ja_pub = (vid_id in videos_publicados_ids) or (v_url in videos_publicados_urls)
        v["ja_publicado"] = bool(ja_pub)


def _canal_corresponde_ao_termo(termo_limpo: str, canais: List[Dict[str, Any]]) -> bool:
    """Verifica se o termo corresponde ao nome ou alias de algum canal cadastrado."""
    for c in canais:
        nome_c = _remover_acentos(str(c.get("nome") or ""))
        id_c = _remover_acentos(str(c.get("id_ou_url") or ""))
        aliases = [_remover_acentos(str(a)) for a in c.get("aliases", []) if a]
        if termo_limpo in (nome_c, id_c) or termo_limpo in aliases:
            return True
    return False


def obter_metadados_video_direto(termo: str, canais: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Detecta se o termo é URL direta de vídeo do YouTube ou ID puro de 11 caracteres
    (não correspondente a canal cadastrado) e extrai seus metadados em tempo real.
    """
    bruto = (termo or "").strip()
    if not bruto:
        return None

    video_id = ""
    if any(dom in bruto.lower() for dom in ("youtube.com", "youtu.be")):
        m = re.search(
            r"(?:v=|/embed/|/watch\?v=|/v/|youtu\.be/|/shorts/|/live/)([A-Za-z0-9_-]{11})",
            bruto,
        )
        if m:
            video_id = m.group(1)
    elif re.fullmatch(r"[A-Za-z0-9_-]{11}", bruto):
        if not _canal_corresponde_ao_termo(_remover_acentos(bruto), canais):
            video_id = bruto

    if not video_id:
        return None

    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    html_str = _baixar_html_youtube(watch_url, timeout=8)

    m_titulo = re.search(r'<meta\s+property=["\']og:title["\']\s+content=["\']([^"\']+)["\']', html_str)
    titulo = html_lib.unescape(m_titulo.group(1)).strip() if m_titulo else ""
    if not titulo:
        m_title_tag = re.search(r"<title>(.*?)</title>", html_str, re.IGNORECASE | re.DOTALL)
        if m_title_tag:
            cand = html_lib.unescape(m_title_tag.group(1)).strip()
            cand = re.sub(r"\s*-\s*YouTube\s*$", "", cand).strip()
            if cand and cand.lower() != "youtube":
                titulo = cand

    if not titulo:
        raise ValueError(f"Não foi possível extrair os metadados do vídeo '{video_id}' no YouTube.")

    m_desc = re.search(r'<meta\s+property=["\']og:description["\']\s+content=["\']([^"\']*)["\']', html_str)
    desc_bruta = html_lib.unescape(m_desc.group(1)).strip() if m_desc else ""

    m_canal = re.search(r'<link\s+itemprop=["\']name["\']\s+content=["\']([^"\']+)["\']', html_str)
    if not m_canal:
        m_canal = re.search(r'"ownerChannelName"\s*:\s*"([^"]+)"', html_str)
    nome_canal = html_lib.unescape(m_canal.group(1)).strip() if m_canal else "YouTube"

    m_data = re.search(
        r'<meta\s+itemprop=["\'](?:uploadDate|datePublished)["\']\s+content=["\']([^"\']+)["\']',
        html_str,
    )
    data_pub = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if m_data:
        raw_dt = m_data.group(1).strip()
        try:
            dt = datetime.datetime.fromisoformat(raw_dt.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
            data_pub = dt.astimezone(datetime.timezone.utc).isoformat()
        except Exception:
            pass

    categoria = "geopolitica"
    pais_iso = "BR"
    canal_id_ref = ""
    nome_canal_limpo = _remover_acentos(nome_canal)
    for c in canais:
        c_nome = _remover_acentos(str(c.get("nome") or ""))
        aliases = [_remover_acentos(str(a)) for a in c.get("aliases", []) if a]
        if nome_canal_limpo == c_nome or nome_canal_limpo in aliases or (c_nome and c_nome in nome_canal_limpo):
            categoria = str(c.get("categoria") or "geopolitica").strip().lower()
            pais_iso = str(c.get("pais_iso") or c.get("pais") or "BR").strip().upper()
            canal_id_ref = str(c.get("id_ou_url") or "").strip()
            break

    resumo = limpar_descricao_youtube(desc_bruta, titulo=titulo, nome_canal=nome_canal)
    item = _normalizar_item_video(
        video_id=video_id,
        titulo=titulo,
        resumo=resumo,
        nome_canal=nome_canal,
        link=watch_url,
        data_pub=data_pub,
        categoria=categoria,
        pais=pais_iso,
        captura_tempo_real=True,
        recem_lancado=True,
    )
    _marcar_videos_ja_publicados([item])

    return {
        "ok": True,
        "modo_varredura": "video_direto",
        "canal": {
            "nome": nome_canal,
            "id_ou_url": canal_id_ref or watch_url,
            "categoria": categoria,
            "pais_iso": pais_iso,
        },
        "total_encontrados": 1,
        "videos": [item],
    }


def _resolver_url_aba_videos(id_ou_url: str) -> str:
    """Resolve a URL pública da aba /videos de um canal do YouTube."""
    bruto = str(id_ou_url or "").strip()
    m_uc = re.search(r"UC[A-Za-z0-9_-]{20,}", bruto)
    if m_uc:
        return f"https://www.youtube.com/channel/{m_uc.group(0)}/videos"
    if bruto.startswith("@"):
        return f"https://www.youtube.com/{bruto}/videos"
    if "youtube.com" in bruto:
        base = bruto.split("?", 1)[0].rstrip("/")
        for sufixo in ("/videos", "/streams", "/shorts", "/featured"):
            if base.endswith(sufixo):
                base = base[: -len(sufixo)]
                break
        return f"{base}/videos"
    return f"https://www.youtube.com/channel/{bruto}/videos"


def _extrair_yt_initial_data(html_str: str) -> Optional[Dict[str, Any]]:
    """Extrai o objeto JSON ytInitialData do HTML de uma página do YouTube."""
    idx = html_str.find("ytInitialData")
    if idx == -1:
        return None
    brace_idx = html_str.find("{", idx)
    if brace_idx == -1:
        return None
    try:
        data, _ = json.JSONDecoder().raw_decode(html_str, brace_idx)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _extrair_video_de_lockup(lvm: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """Extrai video_id, título e tempo relativo de um lockupViewModel do YouTube."""
    vid = ""
    try:
        cmd_url = (
            lvm.get("rendererContext", {})
            .get("commandContext", {})
            .get("onTap", {})
            .get("innertubeCommand", {})
            .get("commandMetadata", {})
            .get("webCommandMetadata", {})
            .get("url", "")
        )
        m_url = re.search(r"[?&]v=([A-Za-z0-9_-]{11})", str(cmd_url))
        if m_url:
            vid = m_url.group(1)
    except Exception:
        pass

    if not vid:
        try:
            overlays = lvm.get("contentImage", {}).get("thumbnailViewModel", {}).get("overlays", [])
            for ov in overlays:
                badges = ov.get("thumbnailBottomOverlayViewModel", {}).get("badges", [])
                for b in badges:
                    target = b.get("thumbnailBadgeViewModel", {}).get("animationActivationTargetId", "")
                    if isinstance(target, str) and re.fullmatch(r"[A-Za-z0-9_-]{11}", target):
                        vid = target
                        break
                if vid:
                    break
        except Exception:
            pass

    if not vid:
        m_raw = re.search(r"/watch\?v=([A-Za-z0-9_-]{11})", json.dumps(lvm))
        if m_raw:
            vid = m_raw.group(1)

    if not vid:
        return None

    titulo = str(
        lvm.get("metadata", {})
        .get("lockupMetadataViewModel", {})
        .get("title", {})
        .get("content", "")
    ).strip()
    if not titulo:
        return None

    tempo_relativo = ""
    try:
        rows = (
            lvm.get("metadata", {})
            .get("lockupMetadataViewModel", {})
            .get("metadata", {})
            .get("contentMetadataViewModel", {})
            .get("metadataRows", [])
        )
        marcadores_tempo = (
            "há ", "ago", "minuto", "minute", "hora", "hour",
            "dia", "day", "semana", "week", "mês", "mes", "month",
            "ano", "year", "segundo", "second", "agora", "just now",
        )
        for row in rows:
            for part in row.get("metadataParts", []):
                txt = str(part.get("text", {}).get("content", "")).strip()
                txt_low = txt.lower()
                if txt and any(k in txt_low for k in marcadores_tempo):
                    tempo_relativo = txt
                    break
            if tempo_relativo:
                break
    except Exception:
        pass

    return {"video_id": vid, "titulo": titulo, "tempo_relativo": tempo_relativo}


def _extrair_video_de_renderer(vr: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """Extrai video_id, título e tempo relativo de um videoRenderer clássico do YouTube."""
    vid = str(vr.get("videoId") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", vid):
        return None

    title_obj = vr.get("title") or {}
    if isinstance(title_obj.get("runs"), list):
        titulo = "".join(str(r.get("text") or "") for r in title_obj["runs"]).strip()
    else:
        titulo = str(title_obj.get("simpleText") or "").strip()
    if not titulo:
        return None

    tempo_relativo = str((vr.get("publishedTimeText") or {}).get("simpleText") or "").strip()
    return {"video_id": vid, "titulo": titulo, "tempo_relativo": tempo_relativo}


def coletar_canal_tempo_real_html(source: Dict[str, Any], max_por_canal: int = 6) -> List[Dict[str, Any]]:
    """
    Faz varredura direta em tempo real na aba /videos do canal do YouTube (HTML/ytInitialData),
    eliminando atrasos de propagação do cache do feed XML RSS.
    """
    nome_canal = str(source.get("nome") or "Canal YouTube").strip()
    id_ou_url = str(source.get("id_ou_url") or "").strip()
    categoria = str(source.get("categoria") or "geopolitica").strip().lower()
    pais = str(source.get("pais_iso") or source.get("pais") or "BR").strip().upper()
    if not id_ou_url:
        return []

    url_videos = _resolver_url_aba_videos(id_ou_url)
    try:
        html_str = _baixar_html_youtube(url_videos, timeout=8)
    except Exception as exc:
        print(f"[!] Aviso: varredura HTML em tempo real indisponível para '{nome_canal}': {exc}", file=sys.stderr)
        return []

    data = _extrair_yt_initial_data(html_str)
    if not data:
        return []

    extraidos: List[Dict[str, str]] = []
    vistos = set()

    def _caminhar(obj: Any) -> None:
        if len(extraidos) >= max_por_canal:
            return
        if isinstance(obj, dict):
            parsed_item = None
            if "lockupViewModel" in obj and isinstance(obj["lockupViewModel"], dict):
                parsed_item = _extrair_video_de_lockup(obj["lockupViewModel"])
            elif "videoRenderer" in obj and isinstance(obj["videoRenderer"], dict):
                parsed_item = _extrair_video_de_renderer(obj["videoRenderer"])

            if parsed_item and parsed_item["video_id"] not in vistos:
                vistos.add(parsed_item["video_id"])
                extraidos.append(parsed_item)
                if len(extraidos) >= max_por_canal:
                    return

            for val in obj.values():
                _caminhar(val)
                if len(extraidos) >= max_por_canal:
                    return
        elif isinstance(obj, list):
            for elem in obj:
                _caminhar(elem)
                if len(extraidos) >= max_por_canal:
                    return

    _caminhar(data)

    itens: List[Dict[str, Any]] = []
    for idx, info in enumerate(extraidos[:max_por_canal]):
        vid = info["video_id"]
        tempo_rel = info["tempo_relativo"]
        data_pub = _converter_tempo_relativo_para_iso(tempo_rel)
        resumo = f"Análise publicada pelo canal {nome_canal} no YouTube ({tempo_rel})." if tempo_rel else (
            f"Análise publicada pelo canal {nome_canal} no YouTube."
        )
        itens.append(
            _normalizar_item_video(
                video_id=vid,
                titulo=info["titulo"],
                resumo=resumo,
                nome_canal=nome_canal,
                link=f"https://www.youtube.com/watch?v={vid}",
                data_pub=data_pub,
                categoria=categoria,
                pais=pais,
                indice_fallback=idx,
                tempo_relativo_youtube=tempo_rel,
                captura_tempo_real=True,
            )
        )

    return itens


def buscar_videos_canal_especifico(termo_canal: str, limite: int = 6) -> Dict[str, Any]:
    """
    Busca em tempo real os vídeos mais recentes de um canal do YouTube (varredura híbrida HTML + RSS)
    ou extrai metadados instantâneos quando informado link direto ou ID de vídeo.
    Checa se cada vídeo já existe em data/noticias_youtube.json para sinalizar status no feed.
    """
    termo = (termo_canal or "").strip()
    if not termo:
        raise ValueError("O nome ou identificador do canal deve ser informado.")

    canais = carregar_canais_youtube()

    # 0. Suporte a link direto ou ID puro de vídeo do YouTube
    resultado_direto = obter_metadados_video_direto(termo, canais)
    if resultado_direto is not None:
        return resultado_direto

    canal_alvo = None
    termo_limpo = _remover_acentos(termo)

    # 1. Busca exata ou por ID ou por Alias (com remoção de acentos)
    for c in canais:
        nome_c = _remover_acentos(str(c.get("nome") or ""))
        id_c = _remover_acentos(str(c.get("id_ou_url") or ""))
        aliases = [_remover_acentos(str(a)) for a in c.get("aliases", []) if a]
        if termo_limpo == nome_c or termo_limpo == id_c or termo_limpo in aliases:
            canal_alvo = c
            break

    # 2. Busca parcial / substring (com remoção de acentos)
    if not canal_alvo:
        for c in canais:
            nome_c = _remover_acentos(str(c.get("nome") or ""))
            aliases = [_remover_acentos(str(a)) for a in c.get("aliases", []) if a]
            if termo_limpo in nome_c or nome_c in termo_limpo:
                canal_alvo = c
                break
            if any(termo_limpo in a or a in termo_limpo for a in aliases if len(a) >= 3):
                canal_alvo = c
                break

    # 3. Aliases dinâmicos e sinônimos conhecidos
    if not canal_alvo:
        if "sobreviv" in termo_limpo or "sobreviva" in termo_limpo:
            for c in canais:
                if "sobreviva" in _remover_acentos(str(c.get("nome") or "")):
                    canal_alvo = c
                    break
        elif "parabol" in termo_limpo:
            for c in canais:
                if "parabol" in _remover_acentos(str(c.get("nome") or "")):
                    canal_alvo = c
                    break

    # 4. Fallback: se for ou contiver um ID válido de canal do YouTube (UC...)
    if not canal_alvo:
        m_uc = re.search(r"UC[A-Za-z0-9_-]{20,}", termo)
        if m_uc:
            cid = m_uc.group(0)
            canal_alvo = {
                "nome": termo,
                "id_ou_url": cid,
                "categoria": "geopolitica",
                "pais_iso": "BR"
            }

    # 5. Fallback inteligente para @handle ou URL do YouTube
    if not canal_alvo and (termo.startswith("@") or "youtube.com" in termo or "youtu.be" in termo):
        try:
            from api.routes_v2 import _resolver_url_youtube_feed
            feed_url, ref_canal = _resolver_url_youtube_feed(termo)
            m_feed = re.search(r"UC[A-Za-z0-9_-]{20,}", feed_url)
            cid = m_feed.group(0) if m_feed else feed_url
            canal_alvo = {
                "nome": termo,
                "id_ou_url": cid,
                "categoria": "geopolitica",
                "pais_iso": "BR"
            }
        except Exception:
            pass

    if not canal_alvo:
        raise ValueError(f"Canal '{termo}' não encontrado entre os canais cadastrados.")

    # Limite entre 1 e 15
    limite = max(1, min(int(limite or 6), 15))

    # Varredura híbrida paralela: HTML em tempo real (/videos) + RSS oficial
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        fut_html = executor.submit(coletar_canal_tempo_real_html, canal_alvo, limite)
        fut_rss = executor.submit(coletar_canal, canal_alvo, limite)
        try:
            videos_html = fut_html.result()
        except Exception:
            videos_html = []
        try:
            videos_rss = fut_rss.result()
        except Exception:
            videos_rss = []

    rss_por_id = {str(v.get("video_id") or "").strip(): v for v in videos_rss if v.get("video_id")}
    videos_coletados: List[Dict[str, Any]] = []
    ids_incluidos = set()

    for v_html in videos_html:
        vid_id = str(v_html.get("video_id") or "").strip()
        if not vid_id or vid_id in ids_incluidos:
            continue
        ids_incluidos.add(vid_id)

        if vid_id in rss_por_id:
            v_merged = dict(rss_por_id[vid_id])
            if v_html.get("tempo_relativo_youtube"):
                v_merged["tempo_relativo_youtube"] = v_html["tempo_relativo_youtube"]
            v_merged["captura_tempo_real"] = True
            videos_coletados.append(v_merged)
        else:
            v_novo = dict(v_html)
            v_novo["recem_lancado"] = True
            videos_coletados.append(v_novo)

    for v_rss in videos_rss:
        if len(videos_coletados) >= limite:
            break
        vid_id = str(v_rss.get("video_id") or "").strip()
        chave = vid_id or str(v_rss.get("url") or "")
        if not chave or chave in ids_incluidos:
            continue
        ids_incluidos.add(chave)
        videos_coletados.append(v_rss)

    videos_coletados = videos_coletados[:limite]
    _marcar_videos_ja_publicados(videos_coletados)

    return {
        "ok": True,
        "modo_varredura": "tempo_real_hibrida",
        "canal": {
            "nome": canal_alvo.get("nome"),
            "id_ou_url": canal_alvo.get("id_ou_url"),
            "categoria": canal_alvo.get("categoria", "geopolitica"),
            "pais_iso": canal_alvo.get("pais_iso", "BR"),
        },
        "total_encontrados": len(videos_coletados),
        "videos": videos_coletados,
    }


def aprovar_video_manual_youtube(video_data: Dict[str, Any], target_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Insere e aprova manualmente um vídeo recente do YouTube no feed oficial (data/noticias_youtube.json).
    Garante deduplicação e posicionamento no topo do feed.
    """
    dest = target_path or DEFAULT_OUT_PATH
    titulo = str(video_data.get("titulo") or "").strip()
    if not titulo:
        raise ValueError("O vídeo deve conter um título válido.")

    video_id = str(video_data.get("video_id") or "").strip()
    link = str(video_data.get("url") or video_data.get("fonte_url") or "").strip()
    if not link and video_id:
        link = f"https://www.youtube.com/watch?v={video_id}"

    if not link:
        raise ValueError("O vídeo deve possuir URL ou video_id válido.")

    canal = str(video_data.get("canal") or video_data.get("fonte_nome") or "YouTube").strip()
    resumo_bruto = str(video_data.get("resumo") or video_data.get("analise") or "").strip()
    resumo = limpar_descricao_youtube(resumo_bruto, titulo=titulo, nome_canal=canal)
    analise = _limpar_analise_youtube(video_data.get("analise"), resumo, resumo_bruto)
    thumb = str(video_data.get("thumbnail") or video_data.get("imagem_url") or "").strip()
    if not thumb and video_id:
        thumb = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

    data_pub = str(video_data.get("data_publicacao") or video_data.get("published_at") or "").strip()
    if not data_pub:
        data_pub = datetime.datetime.now(datetime.timezone.utc).isoformat()

    categoria = str(video_data.get("categoria") or "geopolitica").strip().lower()
    pais = str(video_data.get("pais") or video_data.get("pais_iso") or "BR").strip().upper()
    paises = list(video_data.get("paises_envolvidos") or [pais])

    slug = f"yt-{video_id}" if video_id else f"yt-{int(datetime.datetime.now(datetime.timezone.utc).timestamp())}"

    item_normalizado = {
        "id": slug,
        "video_id": video_id,
        "slug": slug,
        "titulo": titulo,
        "resumo": resumo,
        "analise": analise,
        "canal": canal,
        "fonte_nome": canal,
        "fonte_url": link,
        "url": link,
        "thumbnail": thumb,
        "imagem_url": thumb,
        "data_publicacao": data_pub,
        "publicado_em": data_pub,
        "published_at": data_pub,
        "formato": "video",
        "categoria": categoria,
        "origem": "video",
        "origem_video": True,
        "origem_manual": True,
        "origem_v2": False,
        "urgencia_score": int(video_data.get("urgencia_score") or 82),
        "nivel_relevancia": int(video_data.get("nivel_relevancia") or 3),
        "paises_envolvidos": paises,
        "aprovado_manualmente": True,
    }

    dados_arquivo = {
        "ok": True,
        "status": "concluido",
        "job_nome": "bot_youtube_feeder",
        "duracao_ms": 0,
        "dry_run": False,
        "canais_varridos": 0,
        "total_itens": 0,
        "atualizadoEm": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "items": [],
    }
    if dest.is_file():
        try:
            bruto = json.loads(dest.read_text(encoding="utf-8"))
            if isinstance(bruto, dict):
                dados_arquivo = bruto
        except Exception:
            pass

    itens_atuais = dados_arquivo.get("items") or []
    filtrados = []
    for it in itens_atuais:
        it_id = str(it.get("video_id") or "").strip()
        it_url = str(it.get("url") or it.get("fonte_url") or "").strip()
        if video_id and it_id == video_id:
            continue
        if link and it_url == link:
            continue
        filtrados.append(it)

    filtrados.insert(0, item_normalizado)

    dados_arquivo["items"] = filtrados
    dados_arquivo["total_itens"] = len(filtrados)
    dados_arquivo["atualizadoEm"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    gravar_payload_atomicamente(dados_arquivo, dest)
    if os.path.abspath(str(dest)) == os.path.abspath(str(DEFAULT_OUT_PATH)):
        try:
            _sincronizar_videos_com_feed_output([item_normalizado])
        except Exception as err_sync:
            print(f"[!] Aviso ao sincronizar vídeo aprovado com feed_output: {err_sync}", file=sys.stderr)

    return {
        "ok": True,
        "mensagem": f"Vídeo '{titulo}' aprovado e publicado com sucesso no site!",
        "video": item_normalizado,
    }


def adicionar_fonte_e_coletar_para_radar(
    nome: str,
    id_ou_url: str,
    categoria: str = "geopolitica",
    pais: str = "BR",
    max_videos: int = 5,
    out_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Adiciona ou sincroniza um canal do YouTube em config/sources.json,
    coleta imediatamente seus vídeos mais recentes e os mescla no topo de
    data/noticias_youtube.json para disponibilização instantânea no Radar.
    """
    nome_limpo = str(nome or "Canal YouTube").strip()
    alvo_bruto = str(id_ou_url or "").strip()

    # Extrai Channel ID (UC...) se presente
    m_uc = re.search(r"UC[A-Za-z0-9_-]{20,}", alvo_bruto)
    cid = m_uc.group(0) if m_uc else alvo_bruto

    # Se for @handle ou URL sem channel_id explícito, tenta resolver
    if not m_uc and (alvo_bruto.startswith("@") or "youtube.com" in alvo_bruto or "youtu.be" in alvo_bruto):
        try:
            from api.routes_v2 import _resolver_url_youtube_feed
            feed_url, _ = _resolver_url_youtube_feed(alvo_bruto)
            m_feed = re.search(r"UC[A-Za-z0-9_-]{20,}", feed_url)
            if m_feed:
                cid = m_feed.group(0)
        except Exception:
            pass

    # 1. Sincronizar em config/sources.json
    try:
        if CONFIG_SOURCES.is_file():
            dados_sources = json.loads(CONFIG_SOURCES.read_text(encoding="utf-8"))
            if isinstance(dados_sources, list):
                existe = False
                for s in dados_sources:
                    if isinstance(s, dict) and s.get("tipo") == "youtube":
                        s_id = str(s.get("id_ou_url") or "")
                        if cid in s_id or s_id in cid or s.get("nome", "").strip().lower() == nome_limpo.lower():
                            existe = True
                            break
                if not existe:
                    novo_canal_cfg = {
                        "nome": nome_limpo,
                        "tipo": "youtube",
                        "id_ou_url": cid,
                        "categoria": str(categoria or "geopolitica").strip().lower(),
                        "pais": str(pais or "BR").strip().upper(),
                    }
                    if "sobreviva" in nome_limpo.lower():
                        novo_canal_cfg["aliases"] = ["sobrevivendo ao brasil", "sobrevivendo no brasil", "sobrevivendo"]
                    dados_sources.append(novo_canal_cfg)
                    CONFIG_SOURCES.write_text(
                        json.dumps(dados_sources, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8",
                    )
    except Exception as err:
        print(f"[!] Erro ao atualizar config/sources.json para {nome_limpo}: {err}", file=sys.stderr)

    # 2. Coletar vídeos do canal
    canal_dict = {
        "nome": nome_limpo,
        "id_ou_url": cid,
        "categoria": categoria,
        "pais": pais,
    }
    novos_videos = coletar_canal(canal_dict, max_por_canal=max_videos)

    # 3. Carregar data/noticias_youtube.json existente e mesclar com deduplicação
    dest_path = out_path or DEFAULT_OUT_PATH
    itens_existentes: List[Dict[str, Any]] = []
    payload_atual: Dict[str, Any] = {}
    if dest_path.is_file():
        try:
            payload_atual = json.loads(dest_path.read_text(encoding="utf-8"))
            if isinstance(payload_atual, dict) and isinstance(payload_atual.get("items"), list):
                itens_existentes = list(payload_atual["items"])
        except Exception:
            itens_existentes = []

    vistos_ids = set()
    vistos_links = set()
    mesclados: List[Dict[str, Any]] = []
    videos_inseridos: List[Dict[str, Any]] = []

    for v in novos_videos:
        vid = str(v.get("video_id") or "").strip()
        link = str(v.get("url") or v.get("fonte_url") or "").strip()
        if vid:
            vistos_ids.add(vid)
        if link:
            vistos_links.add(link)
        mesclados.append(v)
        videos_inseridos.append(v)

    for old_v in itens_existentes:
        if not isinstance(old_v, dict):
            continue
        vid = str(old_v.get("video_id") or "").strip()
        link = str(old_v.get("url") or old_v.get("fonte_url") or "").strip()
        if (vid and vid in vistos_ids) or (link and link in vistos_links):
            continue
        mesclados.append(old_v)

    # 4. Gravar atomicamente noticias_youtube.json
    t_agora = datetime.datetime.now(datetime.timezone.utc).isoformat()
    novo_payload = {
        "ok": True,
        "status": "concluido",
        "job_nome": "bot_youtube_feeder_adicionar_fonte",
        "duracao_ms": 0,
        "dry_run": False,
        "canais_varridos": len(carregar_canais_youtube()),
        "total_itens": len(mesclados),
        "atualizadoEm": t_agora,
        "items": mesclados,
    }
    gravar_payload_atomicamente(novo_payload, dest_path)

    # 5. Sincronizar com data/feed_output.json e estado feed_output no PostgreSQL
    try:
        if videos_inseridos:
            _sincronizar_videos_com_feed_output(videos_inseridos)
    except Exception as err:
        print(f"[!] Erro ao sincronizar com data/feed_output.json: {err}", file=sys.stderr)

    return {
        "ok": True,
        "canal": nome_limpo,
        "channel_id": cid,
        "videos_coletados": len(novos_videos),
        "videos_adicionados": len(videos_inseridos),
        "total_videos_radar": len(mesclados),
        "videos": videos_inseridos,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bot Alimentador de Vídeos do YouTube RSS.")
    parser.add_argument("--max-por-canal", type=int, default=3, help="Máximo de vídeos recentes por canal (padrão: 3)")
    parser.add_argument("--dry-run", action="store_true", help="Executa sem salvar no disco")
    args = parser.parse_args()

    res = executar_bot_youtube(max_por_canal=args.max_por_canal, dry_run=args.dry_run)
    print(f"[OK] Varredura concluída: {res['total_itens']} vídeos de {res['canais_varridos']} canais em {res['duracao_ms']}ms.")
