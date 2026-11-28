"""Motor de Pulso Incremental de Dossiês (Dossiê 3.0 — Hub Vivo).

Detecta novas matérias vinculadas a dossiês ativos e gera uma proposta
incremental (`pending_update`) usando `google-genai` + Pydantic v2,
com controle explícito de concorrência via PostgreSQL Session-Level
Advisory Lock (`pg_try_advisory_lock` / `pg_advisory_unlock`).
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger("rom.dossies_pulso")

# Chave numérica fixa para Session-Level Advisory Lock do lote de pulso de dossiês
DOSSIES_PULSO_ADVISORY_LOCK_KEY = 98230411

_GEMINI_PULSO_FALLBACK_CHAIN = (
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
)

_HTTP_URL_RE = re.compile(r"^https?://[^\s<>\"']+$", re.IGNORECASE)


class PulseLatestShiftModel(BaseModel):
    summary: str = Field(description="Resumo factual de 1-2 frases do desdobramento mais recente (máx. 260 caracteres).")
    updated_at: str = Field(description="Data do desdobramento no formato YYYY-MM-DD.")
    highlight_tag: str = Field(default="Pulso recente", description="Rótulo curto de destaque (ex: 'Pulso recente', 'Última atualização').")


class PulseTimelineItemModel(BaseModel):
    date: str = Field(description="Data ISO para ordenação (YYYY-MM-DD).")
    display_date: str = Field(description="Data formatada para exibição (ex: '28 Nov 2026').")
    title: str = Field(description="Título factual do novo marco (máx. 60 caracteres).")
    summary: str = Field(description="Resumo factual do ocorrido (100 a 170 caracteres).")
    type: Literal["past", "turning_point", "upcoming"] = Field(
        default="past",
        description="'past' para eventos ocorridos, 'turning_point' para ponto de virada, 'upcoming' para próximos passos.",
    )
    source_name: Optional[str] = Field(default=None, description="Nome do veículo/fonte principal que reportou o marco.")
    source_url: Optional[str] = Field(default=None, description="URL externa (https://) de uma das matérias fornecidas, ou null.")


class DossierPulseOutputModel(BaseModel):
    proposed_latest_shift: PulseLatestShiftModel = Field(
        description="Síntese factual do que mudou mais recentemente no dossiê."
    )
    proposed_timeline_item: Optional[PulseTimelineItemModel] = Field(
        default=None,
        description="Novo marco sugerido para a linha do tempo, se houver fato novo relevante.",
    )


def _row_to_dict(cur: Any, row: Any) -> Dict[str, Any]:
    if row is None:
        return {}
    if isinstance(row, dict):
        return dict(row)
    cols = [c.name for c in cur.description]
    return dict(zip(cols, row))


def _scalar(row: Any) -> Any:
    if row is None:
        return None
    if isinstance(row, dict):
        return next(iter(row.values()), None)
    return row[0]


def _parse_iso_dt(valor: Any) -> Optional[datetime]:
    if not valor:
        return None
    if isinstance(valor, datetime):
        return valor if valor.tzinfo is not None else valor.replace(tzinfo=timezone.utc)
    if isinstance(valor, str):
        txt = valor.strip()
        if not txt:
            return None
        try:
            if len(txt) == 10 and txt[4] == "-" and txt[7] == "-":
                return datetime.fromisoformat(txt + "T00:00:00+00:00")
            if txt.endswith("Z"):
                txt = txt[:-1] + "+00:00"
            dt = datetime.fromisoformat(txt)
            return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _sanitizar_url_externa(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    clean = str(url).strip()
    if _HTTP_URL_RE.match(clean):
        return clean
    return None


def _gerar_pulso_com_fallback(client: Any, prompt: str, config: Any, preferred_model: str = "") -> tuple[Any, str]:
    candidatos = [m.strip() for m in [preferred_model, *_GEMINI_PULSO_FALLBACK_CHAIN] if m and m.strip()]
    vistos: set[str] = set()
    modelos = [m for m in candidatos if not (m in vistos or vistos.add(m))]
    ultimo_erro: Optional[Exception] = None
    for modelo in modelos:
        try:
            res = client.models.generate_content(model=modelo, contents=prompt, config=config)
            return res, modelo
        except Exception as exc:  # noqa: BLE001
            ultimo_erro = exc
            logger.warning("Modelo %s falhou no pulso de dossiê: %s", modelo, exc)
            continue
    raise ultimo_erro or RuntimeError("Nenhum modelo Gemini disponível respondeu no pulso de dossiês.")


def _montar_prompt_pulso(dossie: Dict[str, Any], materias: List[Dict[str, Any]], today_iso: str) -> str:
    exec_sum = dossie.get("executive_summary") or {}
    briefing = dossie.get("editorial_briefing") or {}
    latest_atual = (briefing.get("latest_shift") or {}).get("summary") or "Nenhum resumo recente registrado."
    timeline_atual = dossie.get("timeline") or []
    ultimos_marcos = "\n".join(
        f"- [{item.get('date', '')}] {item.get('title', '')}"
        for item in timeline_atual[-4:]
        if isinstance(item, dict)
    ) or "- (nenhum marco anterior)"

    linhas_mat = []
    for idx, m in enumerate(materias[:20], 1):
        pub = m.get("publicado_em")
        pub_s = pub.isoformat()[:10] if isinstance(pub, datetime) else str(pub or "")[:10]
        fonte = m.get("veiculo_nome") or "Fonte"
        url = m.get("materia_url") or ""
        titulo = m.get("materia_titulo") or ""
        linhas_mat.append(f'{idx}. [{pub_s or "s/ data"}] {fonte}: "{titulo}" (url: {url})')
    materias_block = "\n".join(linhas_mat) or "- (nenhuma matéria recente vinculada)"

    return f"""Você é o editor de plantão (Pulso Incremental) do portal "Rodando o Mundo — Atlas Jornalístico".
Sua tarefa é analisar as novas manchetes vinculadas a um dossiê ativo e propor uma atualização incremental concisa e factual (padrão Reuters/AFP, em PT-BR).

DATA DE REFERÊNCIA: {today_iso}

DOSSIÊ:
- Título: {dossie.get("titulo", "")}
- Subtítulo: {dossie.get("subtitulo", "")}
- Contexto atual: {exec_sum.get("context", "")[:400]}
- Última mudança registrada: {latest_atual}

ÚLTIMOS MARCOS NA LINHA DO TEMPO ATUAL:
{ultimos_marcos}

NOVAS MANCHETES VINCULADAS AO DOSSIÊ:
{materias_block}

DIRETRIZES OBRIGATÓRIAS:
1. Em `proposed_latest_shift`, sintetize em 1-2 frases objetivas o que mudou mais recentemente com base nas manchetes acima.
2. Em `proposed_timeline_item`, proponha UM novo marco cronológico que ainda não conste na lista de marcos anteriores, preenchendo `source_name` e `source_url` exclusivamente com uma fonte/URL presente na lista acima (nunca invente URLs).
3. Mantenha neutralidade editorial rigorosa, sem adjetivos opinativos."""


def gerar_pulso_dossie(
    conn: Any,
    slug: str,
    min_novas: int = 1,
    force: bool = False,
) -> Dict[str, Any]:
    """Gera e persiste `pending_update` (status='pending') para um dossiê específico."""
    if conn is None:
        raise RuntimeError("Conexão com banco de dados indisponível.")

    slug_norm = (slug or "").strip().lower()
    with conn.cursor() as cur:
        cur.execute(
            """SELECT id, slug, titulo, subtitulo, tipo, executive_summary, timeline,
                      ai_metadata, editorial_briefing, pending_update
               FROM dossies
               WHERE slug = %s;""",
            (slug_norm,),
        )
        row = cur.fetchone()
        dossie = _row_to_dict(cur, row)

    if not dossie:
        return {"ok": False, "skipped": True, "reason": "not_found", "slug": slug_norm}

    # Determina timestamp de corte para contar matérias novas
    ai_meta = dossie.get("ai_metadata") or {}
    pending_atual = dossie.get("pending_update") or {}
    briefing = dossie.get("editorial_briefing") or {}
    corte_candidatos = [
        _parse_iso_dt(pending_atual.get("generated_at")),
        _parse_iso_dt(ai_meta.get("generated_at")),
        _parse_iso_dt((briefing.get("latest_shift") or {}).get("updated_at")),
    ]
    corte_validos = [dt for dt in corte_candidatos if dt is not None]
    corte_dt = max(corte_validos) if corte_validos else (datetime.now(timezone.utc) - timedelta(hours=72))

    with conn.cursor() as cur:
        cur.execute(
            """SELECT materia_titulo, materia_url, veiculo_nome, pais_veiculo, vies, publicado_em
               FROM dossie_materias
               WHERE dossie_id = %s AND publicado_em > %s
               ORDER BY publicado_em DESC NULLS LAST
               LIMIT 25;""",
            (dossie["id"], corte_dt),
        )
        novas = [_row_to_dict(cur, r) for r in cur.fetchall()]

    new_count = len(novas)
    materias_para_ia = list(novas)

    if new_count < min_novas and not force:
        return {
            "ok": True,
            "skipped": True,
            "reason": "insufficient_new_articles",
            "slug": slug_norm,
            "new_articles_count": new_count,
        }

    if not materias_para_ia and force:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT materia_titulo, materia_url, veiculo_nome, pais_veiculo, vies, publicado_em
                   FROM dossie_materias
                   WHERE dossie_id = %s
                   ORDER BY publicado_em DESC NULLS LAST
                   LIMIT 15;""",
                (dossie["id"],),
            )
            materias_para_ia = [_row_to_dict(cur, r) for r in cur.fetchall()]

    api_key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY não configurada no ambiente.")

    from google import genai
    from google.genai import types
    from psycopg.types.json import Jsonb

    today_iso = datetime.now(timezone.utc).date().isoformat()
    prompt = _montar_prompt_pulso(dossie, materias_para_ia, today_iso)
    preferred_model = os.getenv("GEMINI_MODEL_PULSO", "gemini-3.5-flash").strip()

    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=90_000))
    result, used_model = _gerar_pulso_com_fallback(
        client,
        prompt,
        types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=DossierPulseOutputModel,
            temperature=0.25,
        ),
        preferred_model=preferred_model,
    )
    parsed: Optional[DossierPulseOutputModel] = getattr(result, "parsed", None)
    if parsed is None:
        parsed = DossierPulseOutputModel.model_validate_json(result.text)

    data = parsed.model_dump()
    # Valida que source_url do marco proposto é URL externa válida (preferencialmente dentre as matérias)
    urls_materias = {str(m.get("materia_url") or "").strip() for m in materias_para_ia if m.get("materia_url")}
    tl_item = data.get("proposed_timeline_item")
    if isinstance(tl_item, dict):
        raw_url = _sanitizar_url_externa(tl_item.get("source_url"))
        if raw_url and urls_materias and raw_url not in urls_materias:
            # Evita alucinação de URL externa que não veio nas matérias
            tl_item["source_url"] = None
        else:
            tl_item["source_url"] = raw_url

    pending_update: Dict[str, Any] = {
        "status": "pending",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": used_model,
        "new_articles_count": new_count if new_count > 0 else len(materias_para_ia),
        "proposed_latest_shift": data.get("proposed_latest_shift") or {
            "summary": "",
            "updated_at": today_iso,
            "highlight_tag": "Pulso recente",
        },
        "proposed_timeline_item": tl_item,
    }

    with conn.cursor() as cur:
        cur.execute(
            """UPDATE dossies
               SET pending_update = %(pending_update)s,
                   ultima_atualizacao = NOW()
               WHERE slug = %(slug)s;""",
            {"slug": slug_norm, "pending_update": Jsonb(pending_update)},
        )
    conn.commit()

    return {
        "ok": True,
        "skipped": False,
        "slug": slug_norm,
        "pending_update": pending_update,
    }


def executar_pulso_dossies_lote(conn: Any, min_novas: int = 3) -> Dict[str, Any]:
    """Executa pulso incremental em lote nos dossiês publicados ativos sob Session-Level Advisory Lock."""
    if conn is None:
        return {"ok": False, "locked": False, "error": "Banco de dados indisponível."}

    with conn.cursor() as cur:
        cur.execute("SELECT pg_try_advisory_lock(%s);", (DOSSIES_PULSO_ADVISORY_LOCK_KEY,))
        adquirido = bool(_scalar(cur.fetchone()))

    if not adquirido:
        logger.info("Advisory lock %d já ocupado; pulando lote de pulso de dossiês.", DOSSIES_PULSO_ADVISORY_LOCK_KEY)
        return {
            "ok": True,
            "locked": True,
            "processados": 0,
            "gerados": 0,
            "ignorados": 0,
            "erros": 0,
            "resultados": [],
        }

    resumo: Dict[str, Any] = {
        "ok": True,
        "locked": False,
        "processados": 0,
        "gerados": 0,
        "ignorados": 0,
        "erros": 0,
        "resultados": [],
    }
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT slug, pending_update
                   FROM view_dossies_com_status
                   WHERE COALESCE(workflow_status, 'published') = 'published'
                     AND status IN ('permanente', 'ao_vivo')
                   ORDER BY ordem, id;"""
            )
            elegiveis = [_row_to_dict(cur, r) for r in cur.fetchall()]

        agora = datetime.now(timezone.utc)
        for d in elegiveis:
            slug = d.get("slug") or ""
            if not slug:
                continue
            resumo["processados"] += 1
            pending = d.get("pending_update") or {}
            if isinstance(pending, dict) and pending.get("status") == "pending":
                gen_dt = _parse_iso_dt(pending.get("generated_at"))
                if gen_dt and (agora - gen_dt) < timedelta(hours=6):
                    resumo["ignorados"] += 1
                    resumo["resultados"].append({"slug": slug, "skipped": True, "reason": "recent_pending_exists"})
                    continue
            try:
                r = gerar_pulso_dossie(conn, slug, min_novas=min_novas, force=False)
                resumo["resultados"].append(r)
                if r.get("skipped"):
                    resumo["ignorados"] += 1
                else:
                    resumo["gerados"] += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("Falha no pulso incremental do dossiê '%s': %s", slug, exc)
                try:
                    conn.rollback()
                except Exception:  # noqa: BLE001
                    pass
                resumo["erros"] += 1
                resumo["resultados"].append({"slug": slug, "ok": False, "error": str(exc)[:240]})
    finally:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_unlock(%s);", (DOSSIES_PULSO_ADVISORY_LOCK_KEY,))
        except Exception as exc_unlock:  # noqa: BLE001
            logger.warning("Falha ao liberar advisory lock %d: %s", DOSSIES_PULSO_ADVISORY_LOCK_KEY, exc_unlock)

    return resumo
