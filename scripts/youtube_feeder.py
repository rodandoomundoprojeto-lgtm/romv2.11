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
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import feedparser  # type: ignore
except ImportError:
    feedparser = None  # type: ignore

ROOT_DIR = Path(__file__).resolve().parents[1]
CONFIG_SOURCES = ROOT_DIR / "config" / "sources.json"
DEFAULT_OUT_PATH = ROOT_DIR / "data" / "noticias_youtube.json"
FEED_OUTPUT_PATH = ROOT_DIR / "data" / "feed_output.json"


def carregar_canais_youtube(config_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Carrega apenas as fontes com tipo 'youtube' de config/sources.json."""
    c_path = config_path or CONFIG_SOURCES
    if not c_path.is_file():
        return []
    try:
        dados = json.loads(c_path.read_text(encoding="utf-8"))
        if not isinstance(dados, list):
            return []
        canais = [s for s in dados if isinstance(s, dict) and str(s.get("tipo", "")).lower() == "youtube"]
        return canais
    except Exception as e:
        print(f"[!] Erro ao carregar fontes do YouTube: {e}", file=sys.stderr)
        return []


def resolver_url_feed_canal(id_ou_url: str) -> str:
    """Garante que o canal esteja no formato de feed XML oficial do YouTube."""
    bruto = str(id_ou_url or "").strip()
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


def coletar_canal(source: Dict[str, Any], max_por_canal: int = 3) -> List[Dict[str, Any]]:
    """Lê o feed RSS de um canal do YouTube e retorna os vídeos mais recentes normalizados."""
    if not feedparser:
        return []

    nome_canal = str(source.get("nome") or "Canal YouTube").strip()
    id_ou_url = str(source.get("id_ou_url") or "").strip()
    categoria = str(source.get("categoria") or "geopolitica").strip().lower()
    pais = str(source.get("pais_iso") or source.get("pais") or "BR").strip().upper()

    feed_url = resolver_url_feed_canal(id_ou_url)
    itens: List[Dict[str, Any]] = []

    try:
        parsed = feedparser.parse(feed_url)
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

            # Resumo do vídeo via descrição da mídia
            summary = getattr(entry, "summary", "") or getattr(entry, "description", "") or ""
            media_desc = getattr(entry, "media_description", "") or summary
            desc_limpa = re.sub(r"https?://\S+", "", str(media_desc)).strip()
            resumo = desc_limpa[:320].strip() if desc_limpa else f"Análise publicada pelo canal {nome_canal} no YouTube."

            thumb = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else ""

            itens.append({
                "id": f"yt-{video_id}" if video_id else f"yt-{len(itens)}",
                "video_id": video_id,
                "slug": f"yt-{video_id}" if video_id else f"yt-{len(itens)}",
                "titulo": titulo,
                "resumo": resumo,
                "analise": resumo,
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
            })
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


def gravar_payload_atomicamente(dados: Dict[str, Any], destino: Path) -> None:
    """Grava o dicionário JSON atomicamente no destino."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    temp_fd, temp_name = tempfile.mkstemp(dir=str(destino.parent), prefix="tmp_yt_", suffix=".json")
    try:
        with open(temp_fd, "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False, indent=2)
        os.replace(temp_name, str(destino))
    except Exception:
        if os.path.exists(temp_name):
            try:
                os.unlink(temp_name)
            except Exception:
                pass
        raise


def executar_bot_youtube(
    max_por_canal: int = 3,
    dry_run: bool = False,
    out_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Executa a varredura completa do bot de vídeos do YouTube e grava data/noticias_youtube.json."""
    t0 = datetime.datetime.now(datetime.timezone.utc)
    target_path = out_path or DEFAULT_OUT_PATH

    canais = carregar_canais_youtube()
    videos = varrer_todos_canais(max_por_canal=max_por_canal)
    t1 = datetime.datetime.now(datetime.timezone.utc)
    duracao_ms = int((t1 - t0).total_seconds() * 1000)

    resultado = {
        "ok": True,
        "status": "concluido",
        "job_nome": "bot_youtube_feeder",
        "duracao_ms": duracao_ms,
        "dry_run": dry_run,
        "canais_varridos": len(canais),
        "total_itens": len(videos),
        "atualizadoEm": t1.isoformat(),
        "items": videos,
    }

    if not dry_run and videos:
        gravar_payload_atomicamente(resultado, target_path)

    return resultado


import unicodedata


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


def buscar_videos_canal_especifico(termo_canal: str, limite: int = 6) -> Dict[str, Any]:
    """
    Busca os vídeos mais recentes de um canal específico cadastrado no YouTube via RSS.
    Checa se cada vídeo já existe em data/noticias_youtube.json para sinalizar status no feed.
    """
    termo = (termo_canal or "").strip()
    if not termo:
        raise ValueError("O nome ou identificador do canal deve ser informado.")

    canais = carregar_canais_youtube()
    canal_alvo = None
    termo_limpo = _remover_acentos(termo)

    # 1. Busca exata ou por ID (com remoção de acentos)
    for c in canais:
        nome_c = _remover_acentos(str(c.get("nome") or ""))
        id_c = _remover_acentos(str(c.get("id_ou_url") or ""))
        if termo_limpo == nome_c or termo_limpo == id_c:
            canal_alvo = c
            break

    # 2. Busca parcial / substring (com remoção de acentos)
    if not canal_alvo:
        for c in canais:
            nome_c = _remover_acentos(str(c.get("nome") or ""))
            if termo_limpo in nome_c or nome_c in termo_limpo:
                canal_alvo = c
                break

    # 3. Fallback: se não estiver em config/sources.json mas for um ID válido de canal do YouTube (UC...)
    if not canal_alvo and (termo.startswith("UC") or "youtube.com" in termo):
        canal_alvo = {
            "nome": termo,
            "id_ou_url": termo,
            "categoria": "geopolitica",
            "pais_iso": "BR"
        }

    if not canal_alvo:
        raise ValueError(f"Canal '{termo}' não encontrado entre os canais cadastrados.")

    # Limite entre 1 e 15
    limite = max(1, min(int(limite or 6), 15))

    # Coleta vídeos do canal
    videos_coletados = coletar_canal(canal_alvo, max_por_canal=limite)

    # Verifica quais já estão no feed (data/noticias_youtube.json)
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

    for v in videos_coletados:
        vid_id = str(v.get("video_id") or "").strip()
        v_url = str(v.get("url") or v.get("fonte_url") or "").strip()
        ja_pub = (vid_id in videos_publicados_ids) or (v_url in videos_publicados_urls)
        v["ja_publicado"] = bool(ja_pub)

    return {
        "ok": True,
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
    resumo = str(video_data.get("resumo") or video_data.get("analise") or f"Análise publicada pelo canal {canal} no YouTube.").strip()
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
        "analise": resumo,
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

    return {
        "ok": True,
        "mensagem": f"Vídeo '{titulo}' aprovado e publicado com sucesso no site!",
        "video": item_normalizado,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bot Alimentador de Vídeos do YouTube RSS.")
    parser.add_argument("--max-por-canal", type=int, default=3, help="Máximo de vídeos recentes por canal (padrão: 3)")
    parser.add_argument("--dry-run", action="store_true", help="Executa sem salvar no disco")
    args = parser.parse_args()

    res = executar_bot_youtube(max_por_canal=args.max_por_canal, dry_run=args.dry_run)
    print(f"[OK] Varredura concluída: {res['total_itens']} vídeos de {res['canais_varridos']} canais em {res['duracao_ms']}ms.")
