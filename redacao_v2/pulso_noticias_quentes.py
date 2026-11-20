"""Pipeline de Pulso de Notícias Quentes (Cadência 30m — gemini-2.5-flash).

Responsabilidades (docs/arquitetura_v2.md — Seções 3, 4 e 5):
  1. Carregar o System Prompt 0 (`redacao_v2/prompts/prompt_0_pulso_noticias_quentes.md`).
  2. Buscar notícias ativas no banco (`SELECT ... FROM ai_noticias_quentes WHERE expires_at > NOW()`)
     para deduplicação semântica e temporal.
  3. Coletar feeds de pulso (`FONTES_NOTICIAS_QUENTES_30MIN`) e o acervo real (`buscar_artigos_publicados_rom_async`).
  4. Chamar `gemini-2.5-flash` via SDK `google-genai` com `response_schema=PayloadNoticiasQuentes`.
  5. Validar URLs internas (`links_internos_relacionados`) contra o acervo real antes de persistir (Regra 11).
  6. Executar `UPSERT` (`ON CONFLICT (slug) DO UPDATE`) em `ai_noticias_quentes` calculando `expires_at` via `ttl_horas`,
     protegido por PostgreSQL Session-Level Advisory Lock (`advisory_lock`).
"""
import argparse
import asyncio
import json
import os
import re
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from google import genai
from google.genai import types

from .coletor_estudo import (
    FONTES_NOTICIAS_QUENTES_30MIN,
    advisory_lock,
    buscar_artigos_publicados_rom_async,
    coletar_noticias_quentes_30min_async,
    validar_urls_internas,
)
from .schemas import (
    CoberturaPublica,
    CoberturaVeiculoItem,
    EventoComparado,
    LinkAcervoInterno,
    NoticiaQuenteItem,
    PayloadNoticiasQuentes,
)

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
PROMPT_0_PATH = PROMPTS_DIR / "prompt_0_pulso_noticias_quentes.md"
_RAW_MODELO_PULSO = (
    os.getenv("GEMINI_MODEL_PULSO") or os.getenv("GEMINI_MODEL") or "gemini-3.5-flash"
).strip()
MODELO_PULSO = _RAW_MODELO_PULSO or "gemini-3.5-flash"
MODELOS_PULSO_FALLBACK = [
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
]
LOCK_PULSO_KEY = "pipeline_pulso:noticias_quentes_30m"

_STOPWORDS_DEDUP: Set[str] = {
    "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas",
    "o", "a", "os", "as", "e", "ou", "para", "pra", "com", "por",
    "que", "se", "um", "uma", "uns", "umas", "ao", "aos", "sobre",
    "apos", "ante", "ate", "como", "mais", "menos", "entre", "pode",
    "vai", "foi", "sao", "sera", "esta", "estao", "tem", "ter",
}


def _tokens_titulo_normalizados(titulo: str) -> Set[str]:
    """Extrai tokens relevantes (sem acentos nem stopwords) para deduplicação semântica."""
    if not titulo:
        return set()
    norm = unicodedata.normalize("NFKD", titulo.lower()).encode("ascii", "ignore").decode("ascii")
    palavras = re.findall(r"[a-z0-9]{3,}", norm)
    return {p for p in palavras if p not in _STOPWORDS_DEDUP}


def _titulos_sao_similares(tit_a: str, tit_b: str, limiar: float = 0.58) -> bool:
    """Detecta se dois títulos cobrem o mesmo fato mesmo com redação diferente entre modelos."""
    if not tit_a or not tit_b:
        return False
    a_low = tit_a.lower().strip()
    b_low = tit_b.lower().strip()
    if a_low == b_low:
        return True
    tok_a = _tokens_titulo_normalizados(a_low)
    tok_b = _tokens_titulo_normalizados(b_low)
    if len(tok_a) < 2 or len(tok_b) < 2:
        return False
    inter = tok_a & tok_b
    if len(inter) < 2:
        return False
    jaccard = len(inter) / max(1, len(tok_a | tok_b))
    overlap = len(inter) / max(1, min(len(tok_a), len(tok_b)))
    return jaccard >= limiar or (len(inter) >= 3 and overlap >= 0.72)


def _eh_conteudo_editorial_rico(item: Optional[Dict[str, Any]]) -> bool:
    """Retorna True se o item já possui enriquecimento editorial/Pro que o pulso não deve rebaixar."""
    if not isinstance(item, dict):
        return False
    origem = str(item.get("origem_pipeline") or "").lower().strip()
    if origem in ("editorial", "curadoria", "coluna", "pro"):
        return True
    if item.get("artigo_completo") or item.get("entenda_contexto"):
        return True
    return False


def carregar_prompt_pulso(caminho: Path = PROMPT_0_PATH) -> str:
    """Lê o System Prompt 0 do diretório `redacao_v2/prompts/`."""
    if caminho.exists():
        return caminho.read_text(encoding="utf-8").strip()
    arquivos = sorted(PROMPTS_DIR.glob("prompt_0*.md"))
    if arquivos:
        return arquivos[0].read_text(encoding="utf-8").strip()
    raise FileNotFoundError(f"System Prompt 0 não encontrado em {caminho}")


def _obter_db_url(db_url: Optional[str] = None) -> str:
    return (
        db_url
        or os.getenv("DATABASE_URL")
        or os.getenv("CURADORIA_DATABASE_URL")
        or ""
    ).strip()


ROOT_DIR = Path(__file__).resolve().parents[1]
SNAPSHOT_VITRINE_PATH = ROOT_DIR / "data" / "vitrine_ia.json"

MAPA_CATEGORIA_PARA_PRIMARIA = {
    "Geopolitica_Relacoes": "Geopolitica_Radar",
    "Economia_Comercio": "Economia",
    "Sociedade_Cultura": "Cultura",
    "Mobilidade_Fronteiras": "Geopolitica_Radar",
    "Ciencia_Clima": "Geopolitica_Radar",
}

MAPA_ROTAS_EDITORIA_PULSO = {
    "Geopolitica_Radar": "/radar",
    "Politica": "/politica",
    "Economia": "/economia",
    "Cultura": "/cultura",
    "Eleicoes": "/eleicoes",
    "Resumo_Ultimas": "/ultimas-noticias",
}


def _parse_iso_dt_utc(raw: Any) -> Optional[datetime]:
    """Converte string ISO-8601 ou datetime para datetime aware UTC."""
    if isinstance(raw, datetime):
        dt = raw
    elif isinstance(raw, str) and raw.strip():
        try:
            dt = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
        except Exception:
            return None
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_iso_ts(raw: Any) -> float:
    """Extrai timestamp numérico UTC (0.0 quando ausente/inválido)."""
    dt = _parse_iso_dt_utc(raw)
    return dt.timestamp() if dt is not None else 0.0


def _item_nao_expirado_pulso(item: Dict[str, Any], agora: datetime) -> bool:
    """Retorna True se o item ainda não expirou (poda itens vencidos ou legados antigos sem expires_at)."""
    exp_dt = _parse_iso_dt_utc(item.get("expires_at"))
    if exp_dt is not None:
        return exp_dt > agora
    ref_dt = _parse_iso_dt_utc(
        item.get("updated_at")
        or item.get("data_publicacao")
        or item.get("created_at")
        or item.get("publicado_em")
    )
    if ref_dt is not None:
        ttl_horas = max(1, int(item.get("ttl_horas") or item.get("horas_em_destaque") or 6))
        return (ref_dt + timedelta(hours=ttl_horas)) > agora
    return True


def _chave_ordenacao_vitrine(item: Dict[str, Any]) -> tuple:
    """Chave de ordenação decrescente: recência primária (`data_publicacao`), `updated_at` e score como desempate."""
    pub_raw = item.get("data_publicacao") or item.get("created_at") or item.get("publicado_em") or ""
    pub_ts = _parse_iso_ts(pub_raw)
    upd_ts = _parse_iso_ts(item.get("updated_at"))
    urg = int(item.get("urgencia_score") or 0)
    rel = int(item.get("relevancia_score") or 0)
    return (1 if pub_ts > 0 else 0, pub_ts, upd_ts, urg, rel)


def _ler_snapshot_pulso_arquivo(caminho: Path) -> Dict[str, Any]:
    """Lê o snapshot JSON apenas do arquivo local."""
    if caminho.exists():
        try:
            conteudo = json.loads(caminho.read_text(encoding="utf-8"))
            if isinstance(conteudo, dict):
                return conteudo
        except Exception as exc:
            import sys

            print(f"[pulso_30m] Aviso: falha ao ler snapshot existente ({exc}); iniciando novo.", file=sys.stderr)
    return {}


def _ler_snapshot_pulso_previo(caminho: Path) -> Dict[str, Any]:
    """Lê o snapshot anterior do banco (caminho canônico) ou do arquivo local."""
    if caminho == SNAPSHOT_VITRINE_PATH:
        try:
            from src.estado_db import ler_estado

            estado = ler_estado("vitrine_ia")
            if isinstance(estado, dict) and estado:
                return estado
        except Exception:
            pass

    return _ler_snapshot_pulso_arquivo(caminho)


def _gravar_snapshot_pulso_arquivo(caminho: Path, snapshot: Dict[str, Any]) -> None:
    """Grava apenas o arquivo JSON local."""
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")


def _gravar_snapshot_pulso(caminho: Path, snapshot: Dict[str, Any]) -> None:
    """Grava o snapshot no arquivo e espelha no banco quando disponível."""
    _gravar_snapshot_pulso_arquivo(caminho, snapshot)

    if caminho == SNAPSHOT_VITRINE_PATH:
        try:
            from src.estado_db import gravar_estado

            gravar_estado("vitrine_ia", snapshot)
        except Exception:
            pass


def _mesclar_snapshot_vitrine_pulso(
    conteudo_existente: Any,
    payload: Any,
    agora_dt: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Mescla de forma pura e determinística os itens de pulso no snapshot `vitrine_ia`."""
    agora = agora_dt or datetime.now(timezone.utc)
    agora_iso = agora.strftime("%Y-%m-%dT%H:%M:%SZ")

    if hasattr(payload, "noticias_quentes"):
        itens_brutos = payload.noticias_quentes
        batch_id = getattr(payload, "batch_id", "") or agora.strftime("%Y%m%d-%H%M")
    elif isinstance(payload, dict):
        itens_brutos = payload.get("noticias_quentes", [])
        batch_id = payload.get("batch_id") or agora.strftime("%Y%m%d-%H%M")
    elif isinstance(payload, list):
        itens_brutos = payload
        batch_id = agora.strftime("%Y%m%d-%H%M")
    else:
        itens_brutos = []
        batch_id = agora.strftime("%Y%m%d-%H%M")

    existente = conteudo_existente if isinstance(conteudo_existente, dict) else {}
    raw_temas = existente.get("temas_ativos")
    temas_existentes = [dict(t) for t in raw_temas if isinstance(t, dict)] if isinstance(raw_temas, list) else []
    raw_nq = existente.get("noticias_quentes")
    nq_existentes = [dict(n) for n in raw_nq if isinstance(n, dict)] if isinstance(raw_nq, list) else []

    mapa_temas_existentes: Dict[str, Dict[str, Any]] = {}
    for t_ex in temas_existentes:
        s_ex = str(t_ex.get("slug") or "").strip()
        tit_ex = str(t_ex.get("titulo_tema") or t_ex.get("titulo_curto") or t_ex.get("titulo") or "").lower().strip()
        if s_ex:
            mapa_temas_existentes[s_ex] = t_ex
        if tit_ex:
            mapa_temas_existentes[tit_ex] = t_ex

    mapa_nq_existentes: Dict[str, Dict[str, Any]] = {}
    for n_ex in nq_existentes:
        s_ex = str(n_ex.get("slug") or "").strip()
        tit_ex = str(n_ex.get("titulo_curto") or n_ex.get("titulo_tema") or n_ex.get("titulo") or "").lower().strip()
        if s_ex:
            mapa_nq_existentes[s_ex] = n_ex
        if tit_ex:
            mapa_nq_existentes[tit_ex] = n_ex

    novos_temas: List[Dict[str, Any]] = []
    novas_nq: List[Dict[str, Any]] = []

    for item in itens_brutos:
        d = item.model_dump() if hasattr(item, "model_dump") else (dict(item) if isinstance(item, dict) else {})
        if not d:
            continue

        slug = str(d.get("slug") or "").strip()
        titulo = str(d.get("titulo_curto") or d.get("titulo_tema") or d.get("titulo") or "").strip()
        if not titulo:
            continue

        cat_atlas = str(d.get("categoria") or "Geopolitica_Relacoes")
        cat_primaria = MAPA_CATEGORIA_PARA_PRIMARIA.get(cat_atlas, "Geopolitica_Radar")
        rota_ed = MAPA_ROTAS_EDITORIA_PULSO.get(cat_primaria, "/radar")

        resumo = str(d.get("resumo_pulso") or d.get("gatilho_vitrine") or d.get("resumo") or "").strip()
        impacto = str(d.get("impacto_pratico") or d.get("sintese_nerd") or resumo).strip()
        kws = [str(k).lower().strip() for k in (d.get("palavras_chave") or d.get("palavras_chave_busca") or [])]
        ttl_horas = max(1, int(d.get("ttl_horas") or d.get("horas_em_destaque") or 6))

        tema_pre = mapa_temas_existentes.get(slug) or mapa_temas_existentes.get(titulo.lower())
        if tema_pre is None:
            for t_ex in temas_existentes:
                tit_ex = str(t_ex.get("titulo_tema") or t_ex.get("titulo_curto") or t_ex.get("titulo") or "")
                if _titulos_sao_similares(titulo, tit_ex):
                    tema_pre = t_ex
                    break
        nq_pre = mapa_nq_existentes.get(slug) or mapa_nq_existentes.get(titulo.lower())
        if nq_pre is None:
            for n_ex in nq_existentes:
                tit_ex = str(n_ex.get("titulo_curto") or n_ex.get("titulo_tema") or n_ex.get("titulo") or "")
                if _titulos_sao_similares(titulo, tit_ex):
                    nq_pre = n_ex
                    break
        pre = tema_pre or nq_pre

        if pre:
            data_pub_original = (
                pre.get("data_publicacao")
                or pre.get("created_at")
                or pre.get("publicado_em")
                or pre.get("updated_at")
                or d.get("data_publicacao")
                or d.get("published_at")
                or agora_iso
            )
            exp_pre = _parse_iso_dt_utc(pre.get("expires_at"))
            if exp_pre is not None:
                expires_at_str = pre.get("expires_at")
            else:
                ref_dt = _parse_iso_dt_utc(pre.get("updated_at") or data_pub_original) or agora
                expires_at_str = (ref_dt + timedelta(hours=ttl_horas)).strftime("%Y-%m-%dT%H:%M:%SZ")

            pre_titulo = str(pre.get("titulo_tema") or pre.get("titulo_curto") or pre.get("titulo") or "").strip()
            pre_resumo = str(pre.get("resumo_pulso") or pre.get("gatilho_vitrine") or pre.get("resumo") or "").strip()
            pre_impacto = str(pre.get("impacto_pratico") or pre.get("sintese_nerd") or pre_resumo).strip()
            mudou_conteudo = (titulo != pre_titulo) or (resumo != pre_resumo) or (impacto != pre_impacto)
            updated_at_str = agora_iso if mudou_conteudo else (pre.get("updated_at") or agora_iso)
        else:
            data_pub_original = (
                d.get("data_publicacao")
                or d.get("published_at")
                or d.get("created_at")
                or d.get("publicado_em")
                or agora_iso
            )
            expires_at_str = (
                d.get("expires_at")
                if _parse_iso_dt_utc(d.get("expires_at")) is not None
                else (agora + timedelta(hours=ttl_horas)).strftime("%Y-%m-%dT%H:%M:%SZ")
            )
            updated_at_str = d.get("updated_at") or agora_iso

        # Blindagem de conteúdo rico: se o item já foi enriquecido pelo pipeline editorial/Pro,
        # o pulso rápido (Flash) preserva o texto completo e apenas atualiza relevância/frescor.
        if pre and _eh_conteudo_editorial_rico(pre):
            item_preservado = dict(pre)
            item_preservado["relevancia_score"] = max(
                int(pre.get("relevancia_score") or 85), int(d.get("relevancia_score") or 85)
            )
            item_preservado["urgencia_score"] = max(
                int(pre.get("urgencia_score") or 85), int(d.get("urgencia_score") or 85)
            )
            item_preservado["data_publicacao"] = data_pub_original
            item_preservado["expires_at"] = expires_at_str
            item_preservado["updated_at"] = pre.get("updated_at") or updated_at_str
            novos_temas.append(item_preservado)
        else:
            novos_temas.append({
                "slug": slug,
                "titulo_tema": titulo,
                "titulo_curto": titulo,
                "status": "novo",
                "origem_pipeline": "pulso",
                "categoria_primaria": cat_primaria,
                "categoria": cat_atlas,
                "categorias_cruzadas": ["Economia", "Resumo_Ultimas"],
                "rota_editoria": rota_ed,
                "relevancia_score": int(d.get("relevancia_score") or 85),
                "urgencia_score": int(d.get("urgencia_score") or 85),
                "ttl_horas": ttl_horas,
                "expires_at": expires_at_str,
                "palavras_chave_busca": kws,
                "palavras_chave": kws,
                "gatilho_vitrine": resumo,
                "resumo_pulso": resumo,
                "sintese_nerd": impacto,
                "impacto_pratico": impacto,
                "paises_envolvidos": list(d.get("paises_envolvidos") or ["BR"]),
                "veiculos_origem": list(d.get("veiculos_origem") or ["Síntese Rodando o Mundo · Pulso V2"]),
                "fontes_urls": list(d.get("fontes_urls") or []),
                "data_publicacao": data_pub_original,
                "updated_at": updated_at_str,
            })
        d_clone = dict(d)
        d_clone["data_publicacao"] = data_pub_original
        d_clone["ttl_horas"] = ttl_horas
        d_clone["expires_at"] = expires_at_str
        d_clone["updated_at"] = updated_at_str
        novas_nq.append(d_clone)

    vistos_slugs = set()
    vistos_titulos: List[str] = []
    temas_mesclados: List[Dict[str, Any]] = []

    for t in novos_temas:
        s = t.get("slug")
        tit = (t.get("titulo_tema") or "").lower().strip()
        if s and s in vistos_slugs:
            continue
        if tit and any(_titulos_sao_similares(tit, v) for v in vistos_titulos):
            continue
        if not _item_nao_expirado_pulso(t, agora):
            continue
        if s:
            vistos_slugs.add(s)
        if tit:
            vistos_titulos.append(tit)
        temas_mesclados.append(t)

    for t in temas_existentes:
        s = t.get("slug")
        tit = (t.get("titulo_tema") or t.get("titulo_curto") or "").lower().strip()
        if s and s in vistos_slugs:
            continue
        if tit and any(_titulos_sao_similares(tit, v) for v in vistos_titulos):
            continue
        if not _item_nao_expirado_pulso(t, agora):
            continue
        if not t.get("data_publicacao"):
            t["data_publicacao"] = (
                t.get("created_at")
                or t.get("publicado_em")
                or t.get("updated_at")
                or ""
            )
        if s:
            vistos_slugs.add(s)
        if tit:
            vistos_titulos.append(tit)
        temas_mesclados.append(t)

    temas_mesclados.sort(key=_chave_ordenacao_vitrine, reverse=True)
    temas_mesclados = temas_mesclados[:20]

    vistos_nq_slugs = set()
    vistos_nq_titulos: List[str] = []
    nq_mescladas: List[Dict[str, Any]] = []
    for item in novas_nq:
        s = item.get("slug")
        tit = (item.get("titulo_curto") or item.get("titulo_tema") or item.get("titulo") or "").lower().strip()
        if s and s in vistos_nq_slugs:
            continue
        if tit and any(_titulos_sao_similares(tit, v) for v in vistos_nq_titulos):
            continue
        if not _item_nao_expirado_pulso(item, agora):
            continue
        if s:
            vistos_nq_slugs.add(s)
        if tit:
            vistos_nq_titulos.append(tit)
        nq_mescladas.append(item)

    for item in nq_existentes:
        s = item.get("slug")
        tit = (item.get("titulo_curto") or item.get("titulo_tema") or item.get("titulo") or "").lower().strip()
        if s and s in vistos_nq_slugs:
            continue
        if tit and any(_titulos_sao_similares(tit, v) for v in vistos_nq_titulos):
            continue
        if not _item_nao_expirado_pulso(item, agora):
            continue
        if not item.get("data_publicacao"):
            item["data_publicacao"] = (
                item.get("created_at")
                or item.get("publicado_em")
                or item.get("updated_at")
                or ""
            )
        if s:
            vistos_nq_slugs.add(s)
        if tit:
            vistos_nq_titulos.append(tit)
        nq_mescladas.append(item)

    nq_mescladas.sort(key=_chave_ordenacao_vitrine, reverse=True)
    nq_mescladas = nq_mescladas[:20]

    snapshot: Dict[str, Any] = {
        "ok": True,
        "cached": False,
        "source": "snapshot",
        "updatedAt": agora_iso,
        "batch_id": batch_id,
        "temas_ativos": temas_mesclados,
        "noticias_quentes": nq_mescladas,
    }
    if isinstance(existente.get("temas_curadoria"), list):
        cur_ativos = [
            dict(c)
            for c in existente["temas_curadoria"]
            if isinstance(c, dict) and _item_nao_expirado_pulso(c, agora)
        ]
        cur_ativos.sort(key=_chave_ordenacao_vitrine, reverse=True)
        snapshot["temas_curadoria"] = cur_ativos[:20]
    return snapshot


def salvar_snapshot_vitrine_pulso(
    payload: Any,
    caminho: Optional[Path] = None,
) -> Path:
    """Sincroniza e mescla as notícias quentes ativas em `data/vitrine_ia.json`.

    Mantém o contrato estruturado compatível com `functions/api/noticias-quentes.js`,
    `functions/api/radar.js` e `functions/api/vitrine-em-alta.js`, atualizando `updatedAt`.
    """
    caminho_arquivo = caminho or SNAPSHOT_VITRINE_PATH
    snapshot: Optional[Dict[str, Any]] = None

    if caminho_arquivo == SNAPSHOT_VITRINE_PATH:
        try:
            from src.estado_db import atualizar_estado

            snapshot_db = atualizar_estado(
                "vitrine_ia",
                lambda atual: _mesclar_snapshot_vitrine_pulso(
                    atual if isinstance(atual, dict) and atual else _ler_snapshot_pulso_arquivo(caminho_arquivo),
                    payload,
                ),
                default={},
            )
            if isinstance(snapshot_db, dict) and snapshot_db:
                snapshot = snapshot_db
                _gravar_snapshot_pulso_arquivo(caminho_arquivo, snapshot)
        except Exception:
            snapshot = None

    if snapshot is None:
        conteudo_existente = _ler_snapshot_pulso_previo(caminho_arquivo)
        snapshot = _mesclar_snapshot_vitrine_pulso(conteudo_existente, payload)
        _gravar_snapshot_pulso_arquivo(caminho_arquivo, snapshot)

    temas_mesclados = snapshot.get("temas_ativos") or []
    print(f"[pulso_30m] Snapshot público sincronizado -> {caminho_arquivo} ({len(temas_mesclados)} temas)")
    return caminho_arquivo


# ============================================================================
# 1. DEDUPLICAÇÃO: BUSCA DE NOTÍCIAS ATIVAS NO BANCO (expires_at > NOW())
# ============================================================================

def buscar_noticias_ativas_banco(
    conn_or_url: Optional[Any] = None,
    limite: int = 50,
) -> List[Dict[str, Any]]:
    """Busca notícias quentes ativas (`expires_at > NOW()`) em `ai_noticias_quentes` para deduplicação.

    Aceita tanto uma conexão `psycopg` aberta quanto uma string `db_url` (ou lê do ambiente).
    """
    query = """
        SELECT slug, titulo_curto, resumo_pulso, categoria,
               urgencia_score, relevancia_score, ttl_horas, expires_at, created_at
        FROM ai_noticias_quentes
        WHERE expires_at > NOW()
        ORDER BY created_at DESC, urgencia_score DESC
        LIMIT %s;
    """

    def _executar(conn: Any) -> List[Dict[str, Any]]:
        with conn.cursor() as cur:
            cur.execute(query, (limite,))
            rows = cur.fetchall()
        ativas: List[Dict[str, Any]] = []
        for r in rows:
            if isinstance(r, dict):
                item = dict(r)
            else:
                col_names = [
                    "slug", "titulo_curto", "resumo_pulso", "categoria",
                    "urgencia_score", "relevancia_score", "ttl_horas", "expires_at", "created_at",
                ]
                item = dict(zip(col_names, r))
            if isinstance(item.get("expires_at"), datetime):
                item["expires_at"] = item["expires_at"].isoformat()
            if isinstance(item.get("created_at"), datetime):
                item["created_at"] = item["created_at"].isoformat()
            ativas.append(item)
        return ativas

    if conn_or_url is not None and hasattr(conn_or_url, "cursor"):
        return _executar(conn_or_url)

    db_url = _obter_db_url(conn_or_url if isinstance(conn_or_url, str) else None)
    if not db_url:
        return []

    try:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(db_url, connect_timeout=6, row_factory=dict_row, prepare_threshold=None) as conn:
            return _executar(conn)
    except Exception as e:  # noqa: BLE001
        print(f"[Aviso] Não foi possível buscar notícias ativas no banco: {e}")
        return []


# ============================================================================
# 2. CHAMADA AO GEMINI-2.5-FLASH COM RESPONSE_SCHEMA=PayloadNoticiasQuentes
# ============================================================================

def sanitizar_links_payload_pulso(
    payload: PayloadNoticiasQuentes,
    acervo_publicado: List[Dict[str, str]],
) -> PayloadNoticiasQuentes:
    """Valida todas as URLs internas sugeridas no lote de pulso contra o acervo real (Regra 11)."""
    for noticia in payload.noticias_quentes:
        if not noticia.links_internos_relacionados:
            continue
        brutos = [link.model_dump() for link in noticia.links_internos_relacionados]
        validados, _ = validar_urls_internas(brutos, acervo_publicado)
        noticia.links_internos_relacionados = [LinkAcervoInterno(**v) for v in validados]
    return payload


def selecionar_coberturas_destaque_isoladas(
    coberturas: List[CoberturaVeiculoItem],
    max_cards: int = 3,
) -> List[CoberturaPublica]:
    """Aplica a regra de isolamento de fontes primárias (Seção 1 e Seção 5 Etapa 2 de docs/arquitetura_v2.md).

    - Prioriza `veiculo_imprensa` combinando diversidade de país e ordem de relevância.
    - Se não houver nenhuma cobertura de imprensa para o evento, retorna no máximo 1 card de
      `fonte_primaria` marcado com `eh_fallback_oficial = True`.
    """
    imprensa = [c for c in coberturas if c.fonte_tipo == "veiculo_imprensa"]
    primarias = [c for c in coberturas if c.fonte_tipo == "fonte_primaria"]

    if imprensa:
        selecionadas: List[CoberturaVeiculoItem] = []
        paises_vistos = set()
        # 1ª passagem: garante diversidade de país
        for cob in imprensa:
            if cob.pais_veiculo not in paises_vistos and len(selecionadas) < max_cards:
                selecionadas.append(cob)
                paises_vistos.add(cob.pais_veiculo)
        # 2ª passagem: completa até max_cards
        for cob in imprensa:
            if cob not in selecionadas and len(selecionadas) < max_cards:
                selecionadas.append(cob)

        return [
            CoberturaPublica(
                veiculo_nome=c.veiculo_nome,
                pais_veiculo=c.pais_veiculo,
                fonte_tipo=c.fonte_tipo,
                eh_fallback_oficial=False,
                manchete_original=c.manchete_original,
                enfoque_identificado=c.enfoque_identificado,
                url_original=c.url_original,
            )
            for c in selecionadas
        ]

    if primarias:
        c = primarias[0]
        return [
            CoberturaPublica(
                veiculo_nome=c.veiculo_nome,
                pais_veiculo=c.pais_veiculo,
                fonte_tipo="fonte_primaria",
                eh_fallback_oficial=True,
                manchete_original=c.manchete_original,
                enfoque_identificado=c.enfoque_identificado,
                url_original=c.url_original,
            )
        ]

    return []


def selecionar_lote_balanceado_pulso(
    itens_coletados: List[Dict[str, Any]],
    limite: int = 30,
    max_por_fonte: int = 2,
    cota_youtube: int = 5,
) -> List[Dict[str, Any]]:
    """Seleciona um lote equilibrado para o Pulso V2 evitando monopólio de portais RSS
    e garantindo presença proporcional de canais do YouTube (`youtube_rss`) sem torná-los prioridade absoluta.
    """
    if not itens_coletados or limite <= 0:
        return []

    def _eh_youtube(it: Dict[str, Any]) -> bool:
        tipo = str(it.get("tipo_fonte") or "").strip().lower()
        url = str(it.get("url") or it.get("fonte_url") or "").strip().lower()
        return tipo == "youtube_rss" or "youtube.com" in url or "youtu.be" in url

    def _chave_fonte(it: Dict[str, Any]) -> str:
        return str(it.get("fonte") or it.get("fonte_nome") or "desconhecida").strip().lower()

    yt_itens = [it for it in itens_coletados if isinstance(it, dict) and _eh_youtube(it)]
    outros_itens = [it for it in itens_coletados if isinstance(it, dict) and not _eh_youtube(it)]

    selecionados: List[Dict[str, Any]] = []
    urls_vistas: set[str] = set()
    contagem_fonte: Dict[str, int] = {}

    def _adicionar(it: Dict[str, Any]) -> bool:
        url = str(it.get("canonical_url") or it.get("url") or it.get("titulo") or "").strip().lower()
        if url and url in urls_vistas:
            return False
        if url:
            urls_vistas.add(url)
        fk = _chave_fonte(it)
        contagem_fonte[fk] = contagem_fonte.get(fk, 0) + 1
        selecionados.append(it)
        return True

    # 1. Reserva cota equilibrada para YouTube (máximo 1 vídeo por canal)
    yt_adicionados = 0
    for it in yt_itens:
        if yt_adicionados >= cota_youtube or len(selecionados) >= limite:
            break
        fk = _chave_fonte(it)
        if contagem_fonte.get(fk, 0) >= 1:
            continue
        if _adicionar(it):
            yt_adicionados += 1

    # 2. Preenche o restante com notícias RSS/primárias respeitando teto por fonte
    for it in outros_itens:
        if len(selecionados) >= limite:
            break
        fk = _chave_fonte(it)
        if contagem_fonte.get(fk, 0) >= max_por_fonte:
            continue
        _adicionar(it)

    # 3. Fallback caso ainda haja vagas abertas no lote
    if len(selecionados) < limite:
        for it in outros_itens + yt_itens:
            if len(selecionados) >= limite:
                break
            _adicionar(it)

    return selecionados


def gerar_pulso_noticias_quentes(
    itens_coletados: List[Dict[str, Any]],
    noticias_ativas_banco: List[Dict[str, Any]],
    acervo_publicado: Optional[List[Dict[str, str]]] = None,
    client: Optional[Any] = None,
    model: str = MODELO_PULSO,
) -> PayloadNoticiasQuentes:
    """Chama `gemini-2.5-flash` com `response_schema=PayloadNoticiasQuentes` e deduplicação de ativos."""
    system_prompt = carregar_prompt_pulso()
    gemini_client = client or genai.Client(http_options=types.HttpOptions(timeout=60_000))
    batch_atual = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    acervo = acervo_publicado or []
    lote_balanceado = selecionar_lote_balanceado_pulso(itens_coletados, limite=30, max_por_fonte=2, cota_youtube=5)

    prompt_usuario = f"""
BATCH_ID ATUAL: {batch_atual}

NOTICIAS_ATIVAS_NO_BANCO (expires_at > NOW() — Deduplique contra estes itens; só reutilize o mesmo slug se houver fato novo relevante):
{json.dumps(noticias_ativas_banco, ensure_ascii=False, indent=2)}

ACERVO_REAL_DISPONIVEL (Use exclusivamente estas URLs em links_internos_relacionados):
{json.dumps(acervo[:25], ensure_ascii=False, indent=2)}

LOTE_DE_FEEDS_PULSO_30MIN:
{json.dumps(lote_balanceado, ensure_ascii=False, indent=2)}

Analise o lote (incluindo eventuais análises de canais do YouTube quando tratarem de assuntos do momento, mantendo equilíbrio com as notícias factuais urgentes), deduplique contra as notícias ativas no banco e retorne o JSON seguindo estritamente PayloadNoticiasQuentes.
""".strip()

    candidatos_modelo = [model] + [m for m in MODELOS_PULSO_FALLBACK if m != model]
    response = None
    modelo_usado = model
    ultimo_erro: Optional[Exception] = None

    for idx_cand, candidato in enumerate(candidatos_modelo):
        for tentativa in range(1, 3):
            try:
                response = gemini_client.models.generate_content(
                    model=candidato,
                    contents=prompt_usuario,
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        response_mime_type="application/json",
                        response_schema=PayloadNoticiasQuentes,
                        temperature=0.2,
                    ),
                )
                modelo_usado = candidato
                break
            except Exception as exc:  # noqa: BLE001
                ultimo_erro = exc
                msg = str(exc).upper()
                eh_rate_limit = any(k in msg for k in ("429", "RESOURCE_EXHAUSTED", "503", "UNAVAILABLE", "504", "DEADLINE_EXCEEDED", "TIMEOUT"))
                eh_not_found = any(k in msg for k in ("404", "NOT_FOUND"))
                if eh_rate_limit:
                    espera = min(3 * tentativa + idx_cand * 2, 12)
                    print(f"[pulso_30m] Rate limit/instabilidade em {candidato} (tentativa {tentativa}): {msg[:80]}. Aguardando {espera}s...")
                    time.sleep(espera)
                    continue
                if eh_not_found:
                    print(f"[pulso_30m] Modelo {candidato} indisponível ({msg[:80]}), tentando próximo fallback...")
                    break
                raise
        if response is not None:
            break

    if response is None:
        raise RuntimeError(f"Nenhum modelo Gemini disponível para pulso: {ultimo_erro}")

    payload: Optional[PayloadNoticiasQuentes] = getattr(response, "parsed", None)
    if payload is None:
        payload = PayloadNoticiasQuentes.model_validate_json(response.text)

    payload.batch_id = payload.batch_id or batch_atual
    payload.model_id = modelo_usado

    # Resolve data_publicacao deterministicamente (DB ativo -> URLs coletadas -> n.data_publicacao válida -> gerado_em)
    agora_ref = datetime.now(timezone.utc)
    limite_futuro = agora_ref + timedelta(minutes=15)
    mapa_db_pub: Dict[str, str] = {}
    for row_db in (noticias_ativas_banco or []):
        if isinstance(row_db, dict):
            s_db = str(row_db.get("slug") or "").strip()
            dp_db = row_db.get("data_publicacao") or row_db.get("created_at") or row_db.get("updated_at")
            if s_db and dp_db:
                mapa_db_pub[s_db] = str(dp_db)

    mapa_url_pub: Dict[str, str] = {}
    for col in (itens_coletados or []):
        if not isinstance(col, dict):
            continue
        pub_col = col.get("published_at") or col.get("data_publicacao")
        if not pub_col:
            continue
        for k_url in ("canonical_url", "url"):
            u = str(col.get(k_url) or "").strip().lower()
            if u and u not in mapa_url_pub:
                mapa_url_pub[u] = str(pub_col)

    for n in payload.noticias_quentes:
        s_item = str(n.slug or "").strip()
        if s_item and s_item in mapa_db_pub:
            n.data_publicacao = mapa_db_pub[s_item]
            continue

        candidatas: List[Tuple[float, str]] = []
        for u in (n.fontes_urls or []):
            u_norm = str(u or "").strip().lower()
            pub_match = mapa_url_pub.get(u_norm)
            if pub_match:
                dt_m = _parse_iso_dt_utc(pub_match)
                if dt_m is not None and dt_m <= limite_futuro:
                    candidatas.append((dt_m.timestamp(), dt_m.strftime("%Y-%m-%dT%H:%M:%SZ")))
        if candidatas:
            candidatas.sort(key=lambda pair: pair[0], reverse=True)
            n.data_publicacao = candidatas[0][1]
            continue

        dt_prop = _parse_iso_dt_utc(n.data_publicacao)
        if dt_prop is not None and dt_prop <= limite_futuro:
            n.data_publicacao = dt_prop.strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            dt_gerado = _parse_iso_dt_utc(payload.gerado_em) or agora_ref
            n.data_publicacao = dt_gerado.strftime("%Y-%m-%dT%H:%M:%SZ")

    payload.noticias_quentes.sort(
        key=lambda n: (
            1 if _parse_iso_ts(n.data_publicacao) > 0 else 0,
            _parse_iso_ts(n.data_publicacao),
            n.urgencia_score,
            n.relevancia_score,
        ),
        reverse=True,
    )

    if acervo:
        payload = sanitizar_links_payload_pulso(payload, acervo)

    return payload


# ============================================================================
# 3. UPSERT EM ai_noticias_quentes CALCULANDO expires_at VIA ttl_horas
# ============================================================================

UPSERT_NOTICIA_QUENTE_SQL = """
INSERT INTO ai_noticias_quentes (
    slug, batch_id, titulo_curto, resumo_pulso, impacto_pratico,
    categoria, paises_envolvidos, urgencia_score, relevancia_score,
    nivel_confianca, ttl_horas, horas_em_destaque, veiculos_origem,
    fontes_urls, palavras_chave, links_internos_relacionados,
    payload_json, model_id, status, data_publicacao, destaque_ate, expires_at, updated_at
) VALUES (
    %(slug)s, %(batch_id)s, %(titulo_curto)s, %(resumo_pulso)s, %(impacto_pratico)s,
    %(categoria)s, %(paises_envolvidos)s, %(urgencia_score)s, %(relevancia_score)s,
    %(nivel_confianca)s, %(ttl_horas)s, %(horas_em_destaque)s, %(veiculos_origem)s,
    %(fontes_urls)s, %(palavras_chave)s, %(links_internos_relacionados)s::jsonb,
    %(payload_json)s::jsonb, %(model_id)s, %(status)s, %(data_publicacao)s, %(destaque_ate)s, %(expires_at)s, %(updated_at)s
)
ON CONFLICT (slug) DO UPDATE SET
    batch_id = EXCLUDED.batch_id,
    titulo_curto = EXCLUDED.titulo_curto,
    resumo_pulso = EXCLUDED.resumo_pulso,
    impacto_pratico = EXCLUDED.impacto_pratico,
    categoria = EXCLUDED.categoria,
    paises_envolvidos = EXCLUDED.paises_envolvidos,
    urgencia_score = EXCLUDED.urgencia_score,
    relevancia_score = EXCLUDED.relevancia_score,
    nivel_confianca = EXCLUDED.nivel_confianca,
    ttl_horas = EXCLUDED.ttl_horas,
    horas_em_destaque = EXCLUDED.horas_em_destaque,
    veiculos_origem = EXCLUDED.veiculos_origem,
    fontes_urls = EXCLUDED.fontes_urls,
    palavras_chave = EXCLUDED.palavras_chave,
    links_internos_relacionados = EXCLUDED.links_internos_relacionados,
    payload_json = EXCLUDED.payload_json,
    model_id = EXCLUDED.model_id,
    status = EXCLUDED.status,
    data_publicacao = COALESCE(ai_noticias_quentes.data_publicacao, ai_noticias_quentes.created_at, EXCLUDED.data_publicacao),
    destaque_ate = LEAST(
        EXCLUDED.destaque_ate,
        COALESCE(ai_noticias_quentes.data_publicacao, ai_noticias_quentes.created_at, EXCLUDED.data_publicacao)
        + make_interval(hours => GREATEST(1, LEAST(24, EXCLUDED.horas_em_destaque)))
    ),
    expires_at = LEAST(
        EXCLUDED.expires_at,
        COALESCE(ai_noticias_quentes.data_publicacao, ai_noticias_quentes.created_at, EXCLUDED.data_publicacao)
        + make_interval(hours => GREATEST(1, LEAST(168, EXCLUDED.ttl_horas)))
    ),
    updated_at = CASE
        WHEN ai_noticias_quentes.titulo_curto IS DISTINCT FROM EXCLUDED.titulo_curto
          OR ai_noticias_quentes.resumo_pulso IS DISTINCT FROM EXCLUDED.resumo_pulso
        THEN EXCLUDED.updated_at
        ELSE ai_noticias_quentes.updated_at
    END;
"""


def calcular_expires_at(agora: datetime, ttl_horas: int) -> datetime:
    """Calcula `expires_at` somando `ttl_horas` (mínimo 1h) ao timestamp `agora`."""
    horas_validas = max(1, int(ttl_horas or 6))
    return agora + timedelta(hours=horas_validas)


def executar_upsert_noticias_quentes(
    conn: Any,
    payload: PayloadNoticiasQuentes,
    status_inicial: str = "ativo",
    agora: Optional[datetime] = None,
) -> int:
    """Executa UPSERT de cada `NoticiaQuenteItem` em `ai_noticias_quentes` calculando `expires_at` via `ttl_horas`."""
    ref_time = agora or datetime.now(timezone.utc)
    salvos = 0

    with conn.cursor() as cur:
        # Garante compatibilidade caso a tabela já exista sem as colunas ttl_horas ou data_publicacao
        try:
            cur.execute(
                "ALTER TABLE ai_noticias_quentes ADD COLUMN IF NOT EXISTS ttl_horas INTEGER NOT NULL DEFAULT 6;"
            )
            cur.execute(
                "ALTER TABLE ai_noticias_quentes ADD COLUMN IF NOT EXISTS data_publicacao TIMESTAMPTZ;"
            )
        except Exception:  # noqa: BLE001
            pass

        for item in payload.noticias_quentes:
            ttl = max(1, int(item.ttl_horas or item.horas_em_destaque or 6))
            horas_destaque = max(1, min(24, int(item.horas_em_destaque or ttl)))
            data_pub_dt = _parse_iso_dt_utc(getattr(item, "data_publicacao", None)) or ref_time
            expires_at = calcular_expires_at(data_pub_dt, ttl)
            destaque_ate = data_pub_dt + timedelta(hours=horas_destaque)

            params = {
                "slug": item.slug,
                "batch_id": payload.batch_id,
                "titulo_curto": item.titulo_curto[:160],
                "resumo_pulso": item.resumo_pulso,
                "impacto_pratico": item.impacto_pratico,
                "categoria": item.categoria,
                "paises_envolvidos": list(item.paises_envolvidos),
                "urgencia_score": item.urgencia_score,
                "relevancia_score": item.relevancia_score,
                "nivel_confianca": item.nivel_confianca,
                "ttl_horas": ttl,
                "horas_em_destaque": horas_destaque,
                "veiculos_origem": list(item.veiculos_origem),
                "fontes_urls": list(item.fontes_urls),
                "palavras_chave": [kw.lower().strip() for kw in item.palavras_chave if kw.strip()],
                "links_internos_relacionados": json.dumps(
                    [l.model_dump() for l in item.links_internos_relacionados],
                    ensure_ascii=False,
                ),
                "payload_json": json.dumps(item.model_dump(), ensure_ascii=False),
                "model_id": payload.model_id or MODELO_PULSO,
                "status": status_inicial,
                "data_publicacao": data_pub_dt,
                "destaque_ate": destaque_ate,
                "expires_at": expires_at,
                "updated_at": ref_time,
            }
            cur.execute(UPSERT_NOTICIA_QUENTE_SQL, params)

            # Alimenta também ai_eventos + ai_conteudos_gerados para a Fila de Eventos e Atlas V2
            status_evento = "publicado" if status_inicial == "ativo" else "aguardando_revisao"
            try:
                cur.execute(
                    """
                    INSERT INTO ai_eventos (
                        slug, titulo_evento, categoria, paises_envolvidos,
                        urgencia_score, relevancia_score, nivel_confianca,
                        destaque_ate, status, updated_at
                    ) VALUES (
                        %(slug)s, %(titulo_evento)s, %(categoria)s, %(paises_envolvidos)s,
                        %(urgencia_score)s, %(relevancia_score)s, %(nivel_confianca)s,
                        %(destaque_ate)s, %(status)s, %(updated_at)s
                    )
                    ON CONFLICT (slug) DO UPDATE SET
                        titulo_evento = EXCLUDED.titulo_evento,
                        categoria = EXCLUDED.categoria,
                        paises_envolvidos = EXCLUDED.paises_envolvidos,
                        urgencia_score = EXCLUDED.urgencia_score,
                        relevancia_score = EXCLUDED.relevancia_score,
                        nivel_confianca = EXCLUDED.nivel_confianca,
                        destaque_ate = LEAST(
                            EXCLUDED.destaque_ate,
                            ai_eventos.created_at + make_interval(hours => %(horas_em_destaque)s)
                        ),
                        updated_at = CASE
                            WHEN ai_eventos.titulo_evento IS DISTINCT FROM EXCLUDED.titulo_evento
                            THEN EXCLUDED.updated_at
                            ELSE ai_eventos.updated_at
                        END
                    RETURNING id;
                    """,
                    {
                        "slug": item.slug[:200],
                        "titulo_evento": item.titulo_curto[:220],
                        "categoria": item.categoria[:50],
                        "paises_envolvidos": list(item.paises_envolvidos),
                        "urgencia_score": item.urgencia_score,
                        "relevancia_score": item.relevancia_score,
                        "nivel_confianca": item.nivel_confianca,
                        "horas_em_destaque": horas_destaque,
                        "destaque_ate": destaque_ate,
                        "status": status_evento,
                        "updated_at": ref_time,
                    },
                )
                ev_row = cur.fetchone()
                if ev_row:
                    ev_id = ev_row["id"] if isinstance(ev_row, dict) else ev_row[0]
                    cur.execute(
                        "SELECT COALESCE(MAX(versao), 0) FROM ai_conteudos_gerados WHERE event_id = %s;",
                        (ev_id,),
                    )
                    max_v_row = cur.fetchone()
                    prox_versao = int((max_v_row["coalesce"] if isinstance(max_v_row, dict) else max_v_row[0]) or 0) + 1
                    cur.execute(
                        """
                        INSERT INTO ai_conteudos_gerados (
                            event_id, tipo_conteudo, versao, tipo_alteracao,
                            payload_json, evidence_ids, model_id, prompt_version, review_status
                        ) VALUES (
                            %s, 'sintese_comparada', %s, 'criacao',
                            %s::jsonb, '{}', %s, 'pulso_v2', %s
                        );
                        """,
                        (
                            ev_id,
                            prox_versao,
                            json.dumps({"sintese_com_ressalvas": item.resumo_pulso}, ensure_ascii=False),
                            payload.model_id or MODELO_PULSO,
                            status_evento,
                        ),
                    )
            except Exception as exc_ev:  # noqa: BLE001
                print(f"[Aviso] Não foi possível sincronizar ai_eventos para '{item.slug}': {exc_ev}")

            salvos += 1

    conn.commit()
    return salvos


# ============================================================================
# 4. ORQUESTRAÇÃO COMPLETA DO PIPELINE DE PULSO 30M
# ============================================================================

def registrar_auditoria_execucao(
    conn: Any,
    job_nome: str,
    recurso_chave: str,
    status: str,
    documentos_novos: int = 0,
    eventos_atualizados: int = 0,
    erro_detalhe: Optional[str] = None,
    execucao_id: Optional[int] = None,
) -> Optional[int]:
    """Registra ou atualiza telemetria em `ai_execucoes_pipeline` (Seção 2 e 3 de docs/arquitetura_v2.md)."""
    try:
        with conn.cursor() as cur:
            if execucao_id is not None:
                cur.execute(
                    """
                    UPDATE ai_execucoes_pipeline
                    SET status = %s,
                        documentos_novos = %s,
                        eventos_atualizados = %s,
                        erro_detalhe = %s,
                        finished_at = NOW()
                    WHERE id = %s;
                    """,
                    (status, documentos_novos, eventos_atualizados, erro_detalhe, execucao_id),
                )
                conn.commit()
                return execucao_id

            cur.execute(
                """
                INSERT INTO ai_execucoes_pipeline (
                    job_nome, recurso_chave, status,
                    documentos_novos, eventos_atualizados, erro_detalhe,
                    started_at, finished_at
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, NOW(),
                    CASE WHEN %s IN ('concluido', 'falha', 'ignorado_lock_ocupado') THEN NOW() ELSE NULL END
                )
                RETURNING id;
                """,
                (
                    job_nome,
                    recurso_chave,
                    status,
                    documentos_novos,
                    eventos_atualizados,
                    erro_detalhe,
                    status,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            if isinstance(row, dict):
                return int(list(row.values())[0])
            if row:
                return int(row[0])
    except Exception as e:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        print(f"[Aviso] Não foi possível registrar auditoria em ai_execucoes_pipeline: {e}")
    return None


def verificar_kill_switch_publicacao(conn: Any, default_status: str = "ativo") -> str:
    """Consulta `publicacao_automatica_ativa` em `ai_config_operacional`."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT valor FROM ai_config_operacional WHERE chave = 'publicacao_automatica_ativa' LIMIT 1;"
            )
            row = cur.fetchone()
            if row is not None:
                val = str(row["valor"] if isinstance(row, dict) else row[0]).strip().lower()
                return "ativo" if val in ("true", "1", "yes", "on") else "aguardando_revisao"
    except Exception:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
    return default_status


def _carregar_fontes_radar_tradicional() -> List[Dict[str, Any]]:
    """Converte as fontes de `config/sources.json` (Radar tradicional) para o formato do Pulso V2."""
    sources_path = ROOT_DIR / "config" / "sources.json"
    if not sources_path.exists():
        return []
    try:
        raw = json.loads(sources_path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            return []
    except Exception as exc:  # noqa: BLE001
        print(f"[Aviso] Falha ao ler config/sources.json: {exc}")
        return []

    fontes: List[Dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        tipo = str(item.get("tipo") or "").strip().lower()
        val = str(item.get("id_ou_url") or "").strip()
        if not val:
            continue
        if tipo == "youtube":
            url = f"https://www.youtube.com/feeds/videos.xml?channel_id={val}"
            tipo_fonte = "youtube_rss"
        else:
            url = val
            tipo_fonte = "rss_feed"
        fontes.append(
            {
                "nome": str(item.get("nome") or url).strip(),
                "url": url,
                "pais_iso": "BR",
                "regiao": "Global",
                "idioma": "pt",
                "tipo_fonte": tipo_fonte,
                "cadencia": "pulso_30m",
                "peso_confianca": 4,
                "politica_uso_status": "aprovada",
                "coleta_permitida": True,
                "armazenamento_permitido": "apenas_metadados",
                "exibicao_permitida": "manchete_sintese_e_link" if tipo_fonte == "youtube_rss" else "sintese_e_link",
            }
        )
    return fontes


def _carregar_fontes_pulso_com_banco(database_url: str) -> List[Dict[str, Any]]:
    """Combina FONTES_NOTICIAS_QUENTES_30MIN, fontes aprovadas em `ai_fontes_referencia` e `config/sources.json`."""
    fontes: List[Dict[str, Any]] = list(FONTES_NOTICIAS_QUENTES_30MIN)
    urls_vistas = {str(f.get("url") or "").strip() for f in fontes}
    if database_url:
        try:
            import psycopg

            with psycopg.connect(database_url, connect_timeout=5, prepare_threshold=None) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT nome, url, pais_iso, regiao, idioma, tipo_fonte, cadencia
                        FROM ai_fontes_referencia
                        WHERE ativo = TRUE
                          AND politica_uso_status = 'aprovada'
                          AND coleta_permitida = TRUE
                          AND tipo_fonte IN ('rss_feed', 'fonte_primaria', 'youtube_rss')
                        ORDER BY peso_confianca DESC, id DESC;
                        """
                    )
                    for row in cur.fetchall():
                        nome, url, pais_iso, regiao, idioma, tipo_fonte, cadencia = row
                        url_limpa = str(url or "").strip()
                        if not url_limpa or url_limpa in urls_vistas:
                            continue
                        urls_vistas.add(url_limpa)
                        fontes.append(
                            {
                                "nome": nome,
                                "url": url_limpa,
                                "pais_iso": pais_iso or "BR",
                                "regiao": regiao or "Global",
                                "idioma": idioma or "pt",
                                "tipo_fonte": tipo_fonte or "rss_feed",
                                "cadencia": cadencia or "pulso_30m",
                            }
                        )
        except Exception as exc:  # noqa: BLE001
            print(f"[Aviso] Falha ao carregar fontes extras de ai_fontes_referencia: {exc}")

    # Garante que todas as fontes do Radar tradicional (config/sources.json) também entrem no Pulso V2
    for f in _carregar_fontes_radar_tradicional():
        url_limpa = str(f.get("url") or "").strip()
        if not url_limpa or url_limpa in urls_vistas:
            continue
        urls_vistas.add(url_limpa)
        fontes.append(f)

    return fontes


async def executar_pipeline_pulso_async(
    db_url: Optional[str] = None,
    dry_run: bool = False,
    client: Optional[Any] = None,
) -> Optional[PayloadNoticiasQuentes]:
    """Executa o ciclo completo de 30 minutos:
    1. Coleta feeds (`FONTES_NOTICIAS_QUENTES_30MIN` + `ai_fontes_referencia` aprovadas) e acervo publicado;
    2. Busca notícias ativas no banco (`expires_at > NOW()`) para deduplicação;
    3. Chama Gemini Flash com `response_schema=PayloadNoticiasQuentes`;
    4. Executa UPSERT em `ai_noticias_quentes` e `ai_eventos` respeitando o Kill Switch,
       protegido por `advisory_lock` e auditado em `ai_execucoes_pipeline`.
    """
    database_url = _obter_db_url(db_url)
    fontes_pulso = await asyncio.to_thread(_carregar_fontes_pulso_com_banco, database_url)

    itens_coletados, acervo_rom = await asyncio.gather(
        coletar_noticias_quentes_30min_async(fontes_custom=fontes_pulso),
        buscar_artigos_publicados_rom_async(db_url=database_url),
    )

    if not itens_coletados:
        print("[pulso_30m] Nenhum item coletado dos feeds RSS.")
        return None

    noticias_ativas = await asyncio.to_thread(buscar_noticias_ativas_banco, database_url)
    print(
        f"[pulso_30m] Feeds coletados: {len(itens_coletados)} | "
        f"Notícias ativas no banco (expires_at > NOW()): {len(noticias_ativas)}"
    )

    payload = await asyncio.to_thread(
        gerar_pulso_noticias_quentes,
        itens_coletados,
        noticias_ativas,
        acervo_rom,
        client,
        MODELO_PULSO,
    )

    if dry_run or not database_url:
        print(f"[pulso_30m] Modo dry-run/sem banco: {len(payload.noticias_quentes)} notícias geradas.")
        if not dry_run:
            salvar_snapshot_vitrine_pulso(payload)
        return payload

    def _persistir_com_lock() -> int:
        import psycopg

        with psycopg.connect(database_url, connect_timeout=10, prepare_threshold=None) as conn:
            with advisory_lock(conn, LOCK_PULSO_KEY) as adquirido:
                if not adquirido:
                    print(f"[pulso_30m] Lock ocupado ({LOCK_PULSO_KEY}). Abortando execução concorrente.")
                    registrar_auditoria_execucao(
                        conn,
                        job_nome="pulso_noticias_quentes_30m",
                        recurso_chave=LOCK_PULSO_KEY,
                        status="ignorado_lock_ocupado",
                        documentos_novos=0,
                        eventos_atualizados=0,
                    )
                    return -1

                exec_id = registrar_auditoria_execucao(
                    conn,
                    job_nome="pulso_noticias_quentes_30m",
                    recurso_chave=LOCK_PULSO_KEY,
                    status="em_execucao",
                )
                try:
                    status_kill = verificar_kill_switch_publicacao(conn, default_status="aguardando_revisao")
                    salvos = executar_upsert_noticias_quentes(conn, payload, status_inicial=status_kill)
                    registrar_auditoria_execucao(
                        conn,
                        job_nome="pulso_noticias_quentes_30m",
                        recurso_chave=LOCK_PULSO_KEY,
                        status="concluido",
                        documentos_novos=len(itens_coletados),
                        eventos_atualizados=salvos,
                        execucao_id=exec_id,
                    )
                    return salvos
                except Exception as exc:
                    registrar_auditoria_execucao(
                        conn,
                        job_nome="pulso_noticias_quentes_30m",
                        recurso_chave=LOCK_PULSO_KEY,
                        status="falha",
                        documentos_novos=len(itens_coletados),
                        eventos_atualizados=0,
                        erro_detalhe=str(exc)[:500],
                        execucao_id=exec_id,
                    )
                    raise

    resultado_persistencia = await asyncio.to_thread(_persistir_com_lock)
    if resultado_persistencia is None or resultado_persistencia == -1:
        # Lock de execução ocupado (ou falha registrada): aborta SEM gravar snapshot nem expor estado.
        return None

    print(f"[pulso_30m] UPSERT concluído em ai_noticias_quentes: {resultado_persistencia} registros atualizados.")
    salvar_snapshot_vitrine_pulso(payload)
    return payload


def executar_pipeline_pulso(
    db_url: Optional[str] = None,
    dry_run: bool = False,
    client: Optional[Any] = None,
) -> Optional[PayloadNoticiasQuentes]:
    """Wrapper síncrono para `executar_pipeline_pulso_async`."""
    return asyncio.run(executar_pipeline_pulso_async(db_url=db_url, dry_run=dry_run, client=client))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pipeline de Pulso 30m — Notícias Quentes (gemini-2.5-flash)")
    parser.add_argument("--dry-run", action="store_true", help="Executa sem gravar no PostgreSQL")
    args = parser.parse_args()
    resultado = executar_pipeline_pulso(dry_run=args.dry_run)
    if resultado:
        print(resultado.model_dump_json(indent=2))
