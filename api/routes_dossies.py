"""Rotas de Dossiês (Permanentes e Especiais) com status dinâmico — Fase 2.

  - GET    /v2/dossies               : agrupa em permanentes / especiais (ao_vivo, em_breve, arquivo).
  - GET    /v2/dossies/{slug}        : detalhe + matérias vinculadas.
  - GET    /v2/admin/dossies         : listagem administrativa com contagens e materias_count.
  - POST   /v2/admin/dossies         : criação de dossiê especial.
  - PATCH  /v2/admin/dossies/{slug}  : edição parcial de dossiê.
  - DELETE /v2/admin/dossies/{slug}  : remoção de dossiê especial.

Status (especiais): em_breve (agora < data_inicio) | ao_vivo | arquivo (agora > data_fim).
Sem banco, cai no espelho data/dossies.json calculando o mesmo status em Python.
"""
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator, model_validator

from api.routes_v2 import aplicar_no_cache_headers, get_db, verificar_admin_token

router = APIRouter(tags=["Dossiês"])

ESPELHO_JSON = Path(__file__).resolve().parents[1] / "data" / "dossies.json"
_DATE_ONLY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _parse_data_flex(valor: Any, fim_do_dia: bool = False) -> Optional[datetime]:
    """Converte YYYY-MM-DD ou ISO-8601 para datetime UTC; string vazia vira None."""
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor if valor.tzinfo is not None else valor.replace(tzinfo=timezone.utc)
    if isinstance(valor, str):
        texto = valor.strip()
        if not texto:
            return None
        if _DATE_ONLY_RE.match(texto):
            sufixo = "T23:59:59+00:00" if fim_do_dia else "T00:00:00+00:00"
            return datetime.fromisoformat(texto + sufixo)
        if texto.endswith("Z"):
            texto = texto[:-1] + "+00:00"
        dt = datetime.fromisoformat(texto)
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
    raise ValueError("Formato de data inválido. Use YYYY-MM-DD ou ISO-8601.")


def _normalizar_regras(valor: Any) -> Dict[str, List[str]]:
    if valor is None:
        return {"palavras_chave": [], "paises": []}
    if not isinstance(valor, dict):
        raise ValueError("regras_classificacao deve ser um objeto JSON.")
    kws = [str(x).strip() for x in (valor.get("palavras_chave") or []) if str(x).strip()]
    paises = [str(x).strip().upper() for x in (valor.get("paises") or []) if str(x).strip()]
    return {"palavras_chave": kws, "paises": paises}


class DossieUpdatePayload(BaseModel):
    titulo: Optional[str] = Field(default=None, min_length=1, max_length=255)
    subtitulo: Optional[str] = Field(default=None, min_length=1)
    categoria: Optional[str] = Field(default=None, min_length=1, max_length=50)
    icone_ou_bandeira: Optional[str] = Field(default=None, min_length=1, max_length=50)
    data_inicio: Optional[datetime] = None
    data_fim: Optional[datetime] = None
    meta_info: Optional[str] = Field(default=None, max_length=120)
    regras_classificacao: Optional[Dict[str, Any]] = None
    workflow_status: Optional[str] = Field(default=None, pattern=r"^(draft|review|published)$")
    executive_summary: Optional[Dict[str, Any]] = None
    timeline: Optional[List[Dict[str, Any]]] = None

    @field_validator("data_inicio", mode="before")
    @classmethod
    def _val_inicio(cls, v: Any) -> Optional[datetime]:
        return _parse_data_flex(v, fim_do_dia=False)

    @field_validator("data_fim", mode="before")
    @classmethod
    def _val_fim(cls, v: Any) -> Optional[datetime]:
        return _parse_data_flex(v, fim_do_dia=True)

    @field_validator("regras_classificacao", mode="before")
    @classmethod
    def _val_regras(cls, v: Any) -> Optional[Dict[str, List[str]]]:
        if v is None:
            return None
        return _normalizar_regras(v)

    @field_validator("executive_summary", mode="before")
    @classmethod
    def _val_executive_summary(cls, v: Any) -> Optional[Dict[str, Any]]:
        if v is None:
            return None
        if not isinstance(v, dict):
            raise ValueError("executive_summary deve ser um objeto JSON.")
        return v

    @field_validator("timeline", mode="before")
    @classmethod
    def _val_timeline(cls, v: Any) -> Optional[List[Dict[str, Any]]]:
        if v is None:
            return None
        if not isinstance(v, list):
            raise ValueError("timeline deve ser uma lista JSON.")
        return v

    @model_validator(mode="after")
    def _val_intervalo(self) -> "DossieUpdatePayload":
        if self.data_inicio is not None and self.data_fim is not None:
            if self.data_fim < self.data_inicio:
                raise ValueError("data_fim deve ser maior ou igual a data_inicio.")
        return self


class DossieCreatePayload(BaseModel):
    slug: str = Field(..., min_length=2, max_length=120)
    titulo: str = Field(..., min_length=1, max_length=255)
    subtitulo: str = Field(..., min_length=1)
    categoria: str = Field(default="Eventos", min_length=1, max_length=50)
    icone_ou_bandeira: str = Field(default="Globe", min_length=1, max_length=50)
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    meta_info: Optional[str] = Field(default=None, max_length=120)
    regras_classificacao: Dict[str, Any] = Field(
        default_factory=lambda: {"palavras_chave": [], "paises": []}
    )
    workflow_status: Optional[Literal["draft", "review", "published"]] = "draft"
    executive_summary: Optional[Dict[str, Any]] = None
    timeline: Optional[List[Dict[str, Any]]] = None
    ai_metadata: Optional[Dict[str, Any]] = None

    @field_validator("slug", mode="before")
    @classmethod
    def _val_slug(cls, v: Any) -> str:
        s = str(v or "").strip().lower()
        if not _SLUG_RE.match(s):
            raise ValueError("Slug inválido. Use apenas letras minúsculas, números e hífens.")
        return s

    @field_validator("data_inicio", mode="before")
    @classmethod
    def _val_inicio(cls, v: Any) -> datetime:
        dt = _parse_data_flex(v, fim_do_dia=False)
        if dt is None:
            raise ValueError("data_inicio é obrigatória para dossiês especiais.")
        return dt

    @field_validator("data_fim", mode="before")
    @classmethod
    def _val_fim(cls, v: Any) -> Optional[datetime]:
        return _parse_data_flex(v, fim_do_dia=True)

    @field_validator("regras_classificacao", mode="before")
    @classmethod
    def _val_regras(cls, v: Any) -> Dict[str, List[str]]:
        return _normalizar_regras(v)

    @field_validator("executive_summary", mode="before")
    @classmethod
    def _val_executive_summary(cls, v: Any) -> Optional[Dict[str, Any]]:
        if v is None:
            return None
        if not isinstance(v, dict):
            raise ValueError("executive_summary deve ser um objeto JSON.")
        return v

    @field_validator("timeline", mode="before")
    @classmethod
    def _val_timeline(cls, v: Any) -> Optional[List[Dict[str, Any]]]:
        if v is None:
            return None
        if not isinstance(v, list):
            raise ValueError("timeline deve ser uma lista JSON.")
        return v

    @field_validator("ai_metadata", mode="before")
    @classmethod
    def _val_ai_metadata(cls, v: Any) -> Optional[Dict[str, Any]]:
        if v is None:
            return None
        if not isinstance(v, dict):
            raise ValueError("ai_metadata deve ser um objeto JSON.")
        return v

    @model_validator(mode="after")
    def _val_intervalo(self) -> "DossieCreatePayload":
        if self.data_fim is not None and self.data_fim < self.data_inicio:
            raise ValueError("data_fim deve ser maior ou igual a data_inicio.")
        return self


def calcular_status(tipo: str, data_inicio: Optional[datetime], data_fim: Optional[datetime],
                    agora: Optional[datetime] = None) -> str:
    """Espelha a CASE da view `view_dossies_com_status`."""
    if tipo == "permanente":
        return "permanente"
    agora = agora or datetime.now(timezone.utc)
    if data_inicio and agora < data_inicio:
        return "em_breve"
    if data_fim and agora > data_fim:
        return "arquivo"
    return "ao_vivo"


def _iso(v: Any) -> Optional[str]:
    if v is None:
        return None
    return v.isoformat() if isinstance(v, datetime) else str(v)


def _normalizar(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row.get("id"),
        "slug": row["slug"], "titulo": row["titulo"], "subtitulo": row["subtitulo"],
        "tipo": row["tipo"], "categoria": row["categoria"],
        "icone_ou_bandeira": row["icone_ou_bandeira"],
        "data_inicio": _iso(row.get("data_inicio")), "data_fim": _iso(row.get("data_fim")),
        "meta_info": row.get("meta_info"), "rota": row.get("rota"),
        "status": row["status"],
        "workflow_status": row.get("workflow_status") or "published",
        "executive_summary": row.get("executive_summary") or {},
        "timeline": row.get("timeline") or [],
        "ai_metadata": row.get("ai_metadata") or {},
        "veiculos_count": int(row.get("veiculos_count") or 0),
        "materias_count": int(row.get("materias_count") or 0),
        "regras_classificacao": row.get("regras_classificacao") or {},
        "ultima_atualizacao": _iso(row.get("ultima_atualizacao")),
    }


def _carregar_espelho() -> List[Dict[str, Any]]:
    if not ESPELHO_JSON.is_file():
        return []
    dados = json.loads(ESPELHO_JSON.read_text(encoding="utf-8")).get("dossies", [])
    out = []
    for idx, d in enumerate(dados, start=1):
        ini = datetime.fromisoformat(d["data_inicio"]) if d.get("data_inicio") else None
        fim = datetime.fromisoformat(d["data_fim"]) if d.get("data_fim") else None
        out.append({
            **d,
            "id": d.get("id", idx),
            "status": calcular_status(d["tipo"], ini, fim),
            "veiculos_count": 0,
            "materias_count": 0,
            "ultima_atualizacao": None,
        })
    return out


def listar_dossies_com_status(conn: Any, incluir_materias_count: bool = False) -> tuple:
    """Retorna (lista normalizada, fonte)."""
    if conn is not None:
        try:
            with conn.cursor() as cur:
                if incluir_materias_count:
                    cur.execute(
                        """SELECT v.*,
                                  COALESCE((SELECT COUNT(*) FROM dossie_materias m WHERE m.dossie_id = v.id), 0)::int AS materias_count
                           FROM view_dossies_com_status v
                           ORDER BY v.ordem, v.id;"""
                    )
                else:
                    cur.execute("SELECT * FROM view_dossies_com_status ORDER BY ordem, id;")
                rows = cur.fetchall()
            if rows:
                return [_normalizar(r) for r in rows], "banco"
        except Exception:  # noqa: BLE001 — view ausente ou erro transitório: usa espelho
            pass
    return [_normalizar(r) for r in _carregar_espelho()], "espelho"


def _buscar_dossie_view(conn: Any, slug: str) -> Optional[Dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """SELECT v.*,
                      COALESCE((SELECT COUNT(*) FROM dossie_materias m WHERE m.dossie_id = v.id), 0)::int AS materias_count
               FROM view_dossies_com_status v
               WHERE v.slug = %s;""",
            (slug,),
        )
        row = cur.fetchone()
    return _normalizar(row) if row else None


@router.get("/v2/dossies")
def listar_dossies(response: Response, conn: Any = Depends(get_db)):
    aplicar_no_cache_headers(response)
    itens, fonte = listar_dossies_com_status(conn)
    itens = [d for d in itens if (d.get("workflow_status") or "published") == "published"]
    permanentes = [d for d in itens if d["tipo"] == "permanente"]
    especiais = [d for d in itens if d["tipo"] == "especial"]
    ao_vivo = [d for d in especiais if d["status"] == "ao_vivo"]
    em_breve = sorted((d for d in especiais if d["status"] == "em_breve"), key=lambda d: d["data_inicio"] or "")
    arquivo = sorted((d for d in especiais if d["status"] == "arquivo"), key=lambda d: d["data_fim"] or "", reverse=True)
    return {
        "ok": True, "fonte": fonte,
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "contagens": {"permanentes": len(permanentes), "ao_vivo": len(ao_vivo),
                      "em_breve": len(em_breve), "arquivo": len(arquivo)},
        "permanentes": permanentes,
        "especiais": {"ao_vivo": ao_vivo, "em_breve": em_breve, "arquivo": arquivo},
    }


@router.get("/v2/dossies/{slug}")
def detalhar_dossie(slug: str, response: Response, conn: Any = Depends(get_db)):
    aplicar_no_cache_headers(response)
    itens, fonte = listar_dossies_com_status(conn)
    dossie = next((d for d in itens if d["slug"] == slug.strip().lower()), None)
    if not dossie or (dossie.get("workflow_status") or "published") != "published":
        raise HTTPException(status_code=404, detail=f"Dossiê '{slug}' não encontrado.")
    materias: List[Dict[str, Any]] = []
    if conn is not None and fonte == "banco":
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT m.materia_titulo, m.materia_url, m.veiculo_nome, m.pais_veiculo, m.vies, m.publicado_em
                       FROM dossie_materias m JOIN dossies d ON d.id = m.dossie_id
                       WHERE d.slug = %s ORDER BY m.publicado_em DESC LIMIT 50;""",
                    (dossie["slug"],),
                )
                materias = [{**r, "publicado_em": _iso(r["publicado_em"])} for r in cur.fetchall()]
        except Exception:  # noqa: BLE001
            materias = []
    return {"ok": True, "fonte": fonte, "dossie": dossie, "materias": materias}


# ---------------------------------------------------------------------------
# Rotas Administrativas (/v2/admin/dossies*)
# ---------------------------------------------------------------------------


@router.get("/v2/admin/dossies")
def admin_listar_dossies(
    response: Response,
    conn: Any = Depends(get_db),
    _: None = Depends(verificar_admin_token),
):
    aplicar_no_cache_headers(response)
    dossies, fonte = listar_dossies_com_status(conn, incluir_materias_count=True)
    permanentes = [d for d in dossies if d["tipo"] == "permanente"]
    especiais = [d for d in dossies if d["tipo"] == "especial"]
    return {
        "ok": True,
        "fonte": fonte,
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "contagens": {
            "total": len(dossies),
            "permanentes": len(permanentes),
            "ao_vivo": sum(1 for d in especiais if d["status"] == "ao_vivo"),
            "em_breve": sum(1 for d in especiais if d["status"] == "em_breve"),
            "arquivo": sum(1 for d in especiais if d["status"] == "arquivo"),
        },
        "dossies": dossies,
    }


@router.patch("/v2/admin/dossies/{slug}")
def admin_atualizar_dossie(
    slug: str,
    payload: DossieUpdatePayload,
    response: Response,
    conn: Any = Depends(get_db),
    _: None = Depends(verificar_admin_token),
):
    aplicar_no_cache_headers(response)
    if conn is None:
        raise HTTPException(status_code=503, detail="Banco de dados indisponível.")

    slug_norm = slug.strip().lower()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, tipo, data_inicio, data_fim FROM dossies WHERE slug = %s;",
            (slug_norm,),
        )
        atual = cur.fetchone()
    if not atual:
        raise HTTPException(status_code=404, detail=f"Dossiê '{slug_norm}' não encontrado.")

    fields = payload.model_fields_set
    eff_ini = payload.data_inicio if "data_inicio" in fields else atual["data_inicio"]
    eff_fim = payload.data_fim if "data_fim" in fields else atual["data_fim"]

    if atual["tipo"] == "especial" and eff_ini is None:
        raise HTTPException(status_code=422, detail="Dossiês especiais exigem data_inicio.")
    if eff_ini is not None and eff_fim is not None and eff_fim < eff_ini:
        raise HTTPException(status_code=422, detail="data_fim deve ser maior ou igual a data_inicio.")

    from psycopg.types.json import Jsonb

    # Campos editoriais 2.0: ai_metadata pode ser mesclado (ex.: reviewed_at ao publicar)
    with conn.cursor() as cur:
        cur.execute("SELECT ai_metadata FROM dossies WHERE slug = %s;", (slug_norm,))
        meta_row = cur.fetchone() or {}
    current_ai_meta = meta_row.get("ai_metadata") or {}

    colunas_permitidas = (
        "titulo",
        "subtitulo",
        "categoria",
        "icone_ou_bandeira",
        "data_inicio",
        "data_fim",
        "meta_info",
        "regras_classificacao",
        "workflow_status",
        "executive_summary",
        "timeline",
    )
    sets: List[str] = []
    params: Dict[str, Any] = {"slug": slug_norm}
    for campo in colunas_permitidas:
        if campo not in fields:
            continue
        valor = getattr(payload, campo)
        if campo == "regras_classificacao":
            valor = Jsonb(_normalizar_regras(valor))
        elif campo in ("executive_summary", "timeline"):
            valor = Jsonb(valor if valor is not None else ({} if campo == "executive_summary" else []))
        sets.append(f"{campo} = %({campo})s")
        params[campo] = valor

    if "workflow_status" in fields and payload.workflow_status == "published":
        merged_meta = {**current_ai_meta, "reviewed_at": datetime.now(timezone.utc).isoformat()}
        sets.append("ai_metadata = %(ai_metadata)s")
        params["ai_metadata"] = Jsonb(merged_meta)

    sets.append("ultima_atualizacao = NOW()")
    sql = f"UPDATE dossies SET {', '.join(sets)} WHERE slug = %(slug)s;"

    with conn.cursor() as cur:
        cur.execute(sql, params)
    conn.commit()

    atualizado = _buscar_dossie_view(conn, slug_norm)
    return {"ok": True, "dossie": atualizado}


@router.post("/v2/admin/dossies", status_code=201)
def admin_criar_dossie(
    payload: DossieCreatePayload,
    response: Response,
    conn: Any = Depends(get_db),
    _: None = Depends(verificar_admin_token),
):
    aplicar_no_cache_headers(response)
    if conn is None:
        raise HTTPException(status_code=503, detail="Banco de dados indisponível.")

    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM dossies WHERE slug = %s;", (payload.slug,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail=f"Já existe um dossiê com slug '{payload.slug}'.")

    from psycopg.errors import UniqueViolation
    from psycopg.types.json import Jsonb

    wf_status = payload.workflow_status or "draft"
    exec_summary = payload.executive_summary if payload.executive_summary is not None else {}
    timeline_data = payload.timeline if payload.timeline is not None else []
    ai_meta = dict(payload.ai_metadata or {})
    if wf_status == "published":
        ai_meta["reviewed_at"] = datetime.now(timezone.utc).isoformat()

    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO dossies (
                       slug, titulo, subtitulo, tipo, categoria, icone_ou_bandeira,
                       data_inicio, data_fim, regras_classificacao, meta_info, rota, ordem,
                       workflow_status, executive_summary, timeline, ai_metadata
                   )
                   VALUES (
                       %(slug)s, %(titulo)s, %(subtitulo)s, 'especial', %(categoria)s, %(icone_ou_bandeira)s,
                       %(data_inicio)s, %(data_fim)s, %(regras)s, %(meta_info)s, NULL,
                       COALESCE((SELECT MAX(ordem) FROM dossies), 0) + 1,
                       %(workflow_status)s, %(executive_summary)s, %(timeline)s, %(ai_metadata)s
                   );""",
                {
                    "slug": payload.slug,
                    "titulo": payload.titulo.strip(),
                    "subtitulo": payload.subtitulo.strip(),
                    "categoria": payload.categoria.strip(),
                    "icone_ou_bandeira": payload.icone_ou_bandeira.strip(),
                    "data_inicio": payload.data_inicio,
                    "data_fim": payload.data_fim,
                    "regras": Jsonb(payload.regras_classificacao),
                    "meta_info": payload.meta_info.strip() if payload.meta_info else None,
                    "workflow_status": wf_status,
                    "executive_summary": Jsonb(exec_summary),
                    "timeline": Jsonb(timeline_data),
                    "ai_metadata": Jsonb(ai_meta),
                },
            )
        conn.commit()
    except UniqueViolation as exc:
        conn.rollback()
        raise HTTPException(status_code=409, detail=f"Já existe um dossiê com slug '{payload.slug}'.") from exc

    criado = _buscar_dossie_view(conn, payload.slug)
    return {"ok": True, "dossie": criado}


@router.delete("/v2/admin/dossies/{slug}")
def admin_remover_dossie(
    slug: str,
    response: Response,
    conn: Any = Depends(get_db),
    _: None = Depends(verificar_admin_token),
):
    aplicar_no_cache_headers(response)
    if conn is None:
        raise HTTPException(status_code=503, detail="Banco de dados indisponível.")

    slug_norm = slug.strip().lower()
    with conn.cursor() as cur:
        cur.execute("SELECT id, tipo FROM dossies WHERE slug = %s;", (slug_norm,))
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Dossiê '{slug_norm}' não encontrado.")
    if row["tipo"] != "especial":
        raise HTTPException(status_code=403, detail="Dossiês permanentes não podem ser removidos.")

    with conn.cursor() as cur:
        cur.execute("DELETE FROM dossies WHERE slug = %s;", (slug_norm,))
    conn.commit()
    return {"ok": True, "slug": slug_norm}


# ---------------------------------------------------------------------------
# Dossiês 2.0 — Sugestão de novo dossiê por IA (assuntos do momento) + geração editorial
# ---------------------------------------------------------------------------

class DossierPillarModel(BaseModel):
    title: str = Field(description="Título curto do pilar (máx. 35 caracteres).")
    description: str = Field(description="Análise objetiva do impacto em 2 linhas (110 a 160 caracteres).")
    category: Literal["politica", "economia", "geopolitica", "seguranca", "sociedade"] = Field(
        description="Categoria visual para definição de ícone e cor de destaque."
    )


class DossierExecutiveSummaryModel(BaseModel):
    context: str = Field(
        description="Parágrafo único e denso (350 a 500 caracteres) explicando a raiz geopolítica/histórica do tema e por que ele importa agora."
    )
    pillars: List[DossierPillarModel] = Field(
        description="Exatamente 3 pilares estratégicos que resumem o que está em jogo."
    )


class DossierTimelineItemModel(BaseModel):
    date: str = Field(description="Data ISO para ordenação (YYYY-MM-DD).")
    display_date: str = Field(description="Data formatada para exibição (ex: 'Out 2026', '03 Nov 2026', 'Jan 2027').")
    title: str = Field(description="Título factual do marco (máx. 60 caracteres).")
    summary: str = Field(description="Resumo factual do ocorrido ou do que esperar (100 a 170 caracteres).")
    type: Literal["past", "turning_point", "upcoming"] = Field(
        description="'past' para eventos ocorridos, 'turning_point' para o momento decisivo central, 'upcoming' para próximos passos."
    )


class DossieSuggestPayload(BaseModel):
    country: str = Field(default="BR", min_length=2, max_length=10)
    lang: str = Field(default="pt", min_length=2, max_length=10)
    hint: Optional[str] = Field(default=None, max_length=240)


class DossieSuggestModel(BaseModel):
    slug: str = Field(description="Slug URL-friendly em minúsculas com hífens (sem acentos).")
    titulo: str = Field(description="Título curto e jornalístico do dossiê (máx. 90 caracteres).")
    subtitulo: str = Field(description="Descrição editorial objetiva em 1-2 frases (120 a 220 caracteres).")
    categoria: str = Field(description="Categoria principal (ex.: Política, Economia, Internacional, Tecnologia, Esportes, Clima, Segurança).")
    icone_ou_bandeira: str = Field(description="Emoji/bandeira ou nome curto de ícone (ex.: Globe, Trophy, 🇧🇷).")
    meta_info: str = Field(description="Período ou contexto curto para exibição (ex.: 'Atualizado em 2026', 'Abr–Mai 2026').")
    data_inicio: Optional[str] = Field(default=None, description="Data inicial sugerida no formato YYYY-MM-DD (use a data de referência se cobertura contínua).")
    data_fim: Optional[str] = Field(default=None, description="Data final sugerida no formato YYYY-MM-DD, ou null se não aplicável/cobertura contínua.")
    palavras_chave: List[str] = Field(description="5 a 10 palavras-chave ou entidades para classificação (PT-BR, minúsculas quando apropriado).")
    paises: List[str] = Field(description="Lista de códigos ISO-2 de países/blocos relevantes (ex.: BR, US). Pode ser vazia.")
    executive_summary: DossierExecutiveSummaryModel = Field(
        description="Síntese executiva com contexto e exatamente 3 pilares estratégicos baseados nos fatos."
    )
    timeline: List[DossierTimelineItemModel] = Field(
        description="Lista de 5 a 7 marcos factuais ordenados cronologicamente por date (YYYY-MM-DD)."
    )


def _extrair_trends_google_rss(country: str = "BR", limit: int = 10) -> List[str]:
    """Obtém títulos de assuntos em alta via Google Trends RSS (best-effort)."""
    try:
        import urllib.request
        import xml.etree.ElementTree as ET

        url = f"https://trends.google.com/trending/rss?geo={(country or 'BR').upper()}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (RodandoOMundoBot/1.0)"})
        with urllib.request.urlopen(req, timeout=12) as resp:  # nosec B310 - URL fixa de serviço público conhecido
            xml_data = resp.read()
        root = ET.fromstring(xml_data)
        titles: List[str] = []
        for item in root.findall(".//item/title"):
            txt = (item.text or "").strip()
            if txt and txt not in titles:
                titles.append(txt)
            if len(titles) >= limit:
                break
        return titles
    except Exception:  # noqa: BLE001
        return []


def _pesquisar_fatos_google_news_rss(query: str, country: str = "BR", limit: int = 12) -> List[Dict[str, str]]:
    """Pesquisa manchetes e datas reais no Google News RSS para embasar a IA (best-effort)."""
    termo = (query or "").strip()
    if not termo:
        return []

    pais = (country or "BR").strip().upper()
    locale_map = {
        "BR": ("pt-BR", "BR", "BR:pt-419"),
        "PT": ("pt-PT", "PT", "PT:pt-150"),
        "US": ("en-US", "US", "US:en"),
        "AR": ("es-419", "AR", "AR:es-419"),
    }
    hl, gl, ceid = locale_map.get(pais, ("pt-BR", "BR", "BR:pt-419"))

    try:
        from email.utils import parsedate_to_datetime
        import urllib.parse
        import urllib.request
        import xml.etree.ElementTree as ET

        q_enc = urllib.parse.quote_plus(termo)
        url = f"https://news.google.com/rss/search?q={q_enc}&hl={hl}&gl={gl}&ceid={ceid}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (RodandoOMundoBot/1.0)"})
        with urllib.request.urlopen(req, timeout=12) as resp:  # nosec B310 - URL fixa de serviço público conhecido
            xml_data = resp.read()
        root = ET.fromstring(xml_data)
        fatos: List[Dict[str, str]] = []
        for item in root.findall(".//item"):
            titulo = (item.findtext("title") or "").strip()
            if not titulo:
                continue
            source_el = item.find("source")
            fonte = (source_el.text or "").strip() if source_el is not None else ""
            if not fonte and " - " in titulo:
                partes = titulo.rsplit(" - ", 1)
                if len(partes) == 2 and partes[1].strip():
                    titulo, fonte = partes[0].strip(), partes[1].strip()
            pub_raw = (item.findtext("pubDate") or "").strip()
            data_iso = ""
            if pub_raw:
                try:
                    data_iso = parsedate_to_datetime(pub_raw).date().isoformat()
                except Exception:  # noqa: BLE001
                    data_iso = ""
            fatos.append({
                "titulo": titulo,
                "fonte": fonte or "Google News",
                "data": data_iso,
            })
            if len(fatos) >= limit:
                break
        return fatos
    except Exception:  # noqa: BLE001
        return []


def _pesquisar_fatos_banco(conn: Any, query: str, limit: int = 6) -> List[Dict[str, str]]:
    """Busca manchetes relacionadas ao tema em dossie_materias e noticias (best-effort)."""
    if conn is None:
        return []
    termos = [t.strip() for t in re.split(r"\s+", (query or "").strip()) if len(t.strip()) >= 3][:4]
    if not termos:
        return []

    resultados: List[Dict[str, str]] = []
    like_clauses_dm = " OR ".join("m.materia_titulo ILIKE %s" for _ in termos)
    params_dm = [f"%{t}%" for t in termos] + [limit]
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT m.materia_titulo AS titulo,
                           COALESCE(m.veiculo_nome, 'Atlas ROM') AS fonte,
                           m.publicado_em
                    FROM dossie_materias m
                    WHERE {like_clauses_dm}
                    ORDER BY m.publicado_em DESC NULLS LAST
                    LIMIT %s;""",
                params_dm,
            )
            for row in cur.fetchall():
                pub = _iso(row.get("publicado_em")) or ""
                resultados.append({
                    "titulo": str(row.get("titulo") or "").strip(),
                    "fonte": str(row.get("fonte") or "Atlas ROM").strip(),
                    "data": pub[:10] if pub else "",
                })
    except Exception:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass

    if len(resultados) < limit:
        restante = limit - len(resultados)
        like_clauses_n = " OR ".join("titulo ILIKE %s" for _ in termos)
        params_n = [f"%{t}%" for t in termos] + [restante]
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT titulo,
                               COALESCE(fonte_nome, 'Atlas ROM') AS fonte,
                               publicado_em
                        FROM noticias
                        WHERE {like_clauses_n}
                        ORDER BY publicado_em DESC NULLS LAST
                        LIMIT %s;""",
                    params_n,
                )
                for row in cur.fetchall():
                    pub = _iso(row.get("publicado_em")) or ""
                    resultados.append({
                        "titulo": str(row.get("titulo") or "").strip(),
                        "fonte": str(row.get("fonte") or "Atlas ROM").strip(),
                        "data": pub[:10] if pub else "",
                    })
        except Exception:  # noqa: BLE001
            try:
                conn.rollback()
            except Exception:  # noqa: BLE001
                pass

    return [r for r in resultados if r["titulo"]]


def _mesclar_fontes_pesquisadas(*listas: List[Dict[str, str]], limit: int = 15) -> List[Dict[str, str]]:
    """Deduplica fontes pesquisadas por título normalizado preservando a ordem."""
    vistos = set()
    saida: List[Dict[str, str]] = []
    for lista in listas:
        for item in lista:
            titulo = (item.get("titulo") or "").strip()
            chave = titulo.lower()
            if not titulo or chave in vistos:
                continue
            vistos.add(chave)
            saida.append({
                "titulo": titulo,
                "fonte": (item.get("fonte") or "Fonte").strip(),
                "data": (item.get("data") or "").strip(),
            })
            if len(saida) >= limit:
                return saida
    return saida


def _montar_prompt_sugestao_dossie(
    trends: List[str],
    fontes_pesquisadas: List[Dict[str, str]],
    today_iso: str,
    hint: Optional[str],
) -> str:
    trends_block = "\n".join(f"- {t}" for t in trends) if trends else "- (não utilizado; foco direto no tema sugerido)"
    if fontes_pesquisadas:
        fatos_block = "\n".join(
            f"{idx}. [{f.get('data') or 's/ data'}] {f.get('fonte') or 'Fonte'}: \"{f.get('titulo') or ''}\""
            for idx, f in enumerate(fontes_pesquisadas, 1)
        )
    else:
        fatos_block = "- (nenhuma manchete retornada pelo RSS; utilize rigor factual consolidado até a data de referência)"
    hint_block = (
        f"\nTEMA SUGERIDO PELO EDITOR (FOCO OBRIGATÓRIO): {hint}\n"
        if hint
        else "\nMODO AUTOMÁTICO: Escolha o assunto de maior relevância jornalística e geopolítica dentre os sinais/manchetes abaixo.\n"
    )
    return f"""Você é editor-chefe do portal "Rodando o Mundo — Atlas Jornalístico".
Sua tarefa é estruturar UM novo Dossiê Temático completo, embasado em fatos e datas reais pesquisadas.

DATA DE REFERÊNCIA: {today_iso}
{hint_block}
ASSUNTOS EM ALTA (Google Trends RSS):
{trends_block}

MANCHETES E FATOS RECENTES PESQUISADOS:
{fatos_block}

DIRETRIZES OBRIGATÓRIAS:
1. METADADOS DO DOSSIÊ:
   - Escreva em Português do Brasil (PT-BR), tom neutro, analítico e jornalístico (padrão Reuters/AFP).
   - Gere slug único em minúsculas com hífens, título claro (máx. 90 caracteres), subtítulo objetivo (120 a 220 caracteres), categoria, ícone/bandeira, meta_info, 5 a 10 palavras-chave e países ISO-2 aplicáveis.
   - Defina data_inicio (YYYY-MM-DD) coerente com o início do evento/cobertura (ou {today_iso} se cobertura contínua atual) e data_fim opcional (ou null se cobertura contínua).
2. SÍNTESE EXECUTIVA (executive_summary):
   - "context": parágrafo único e denso (350 a 500 caracteres) explicando a raiz geopolítica/histórica e por que importa agora.
   - "pillars": EXATAMENTE 3 pilares estratégicos complementares cobrindo o que está em jogo (category entre politica, economia, geopolitica, seguranca, sociedade).
3. LINHA DO TEMPO FACTUAL (timeline):
   - Gere entre 5 e 7 marcos factuais reais ordenados cronologicamente por "date" (YYYY-MM-DD), combinando antecedentes e os fatos recentes pesquisados.
   - Classifique cada marco em "past" (antes de {today_iso}), "turning_point" (ponto de inflexão central) ou "upcoming" (próximos marcos previstos após {today_iso})."""


@router.post("/v2/admin/dossies/suggest-ai")
def admin_sugerir_dossie_ia(
    response: Response,
    payload: Optional[DossieSuggestPayload] = None,
    conn: Any = Depends(get_db),
    _: None = Depends(verificar_admin_token),
):
    aplicar_no_cache_headers(response)

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY não configurada no ambiente.")

    try:
        from google import genai
        from google.genai import types
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"SDK google-genai indisponível: {exc}") from exc

    body = payload or DossieSuggestPayload()
    hint_clean = (body.hint or "").strip() or None
    country_up = (body.country or "BR").strip().upper()

    if hint_clean:
        trends: List[str] = []
        fatos_rss = _pesquisar_fatos_google_news_rss(hint_clean, country=country_up, limit=12)
        fatos_db = _pesquisar_fatos_banco(conn, hint_clean, limit=6)
        fontes_pesquisadas = _mesclar_fontes_pesquisadas(fatos_rss, fatos_db, limit=15)
        fonte_trends = "google_news_rss" if fontes_pesquisadas else "indisponivel"
    else:
        trends = _extrair_trends_google_rss(country_up if country_up != "GLOBAL" else "BR", limit=12)
        fontes_pesquisadas = (
            _pesquisar_fatos_google_news_rss(trends[0], country=country_up, limit=12) if trends else []
        )
        fonte_trends = "google_trends_rss" if trends else ("google_news_rss" if fontes_pesquisadas else "indisponivel")

    today_iso = datetime.now(timezone.utc).date().isoformat()
    prompt = _montar_prompt_sugestao_dossie(trends, fontes_pesquisadas, today_iso, hint_clean)

    model_name = os.getenv("GEMINI_DOSSIER_MODEL", "gemini-2.5-flash")
    try:
        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=90_000))
        result = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=DossieSuggestModel,
                temperature=0.4,
            ),
        )
        generated: Optional[DossieSuggestModel] = getattr(result, "parsed", None)
        if generated is None:
            generated = DossieSuggestModel.model_validate_json(result.text)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Falha ao gerar sugestão com a IA: {exc}") from exc

    data = generated.model_dump()
    # Normalizações defensivas para o formulário admin
    slug = re.sub(r"[^a-z0-9]+", "-", str(data.get("slug") or "").lower()).strip("-") or f"dossie-{today_iso}"
    paises = [str(p).strip().upper() for p in (data.get("paises") or []) if str(p).strip()]
    palavras = [str(p).strip() for p in (data.get("palavras_chave") or []) if str(p).strip()]

    raw_inicio = str(data.get("data_inicio") or "").strip()
    data_inicio = raw_inicio if _DATE_ONLY_RE.match(raw_inicio) else today_iso
    raw_fim = str(data.get("data_fim") or "").strip()
    data_fim = raw_fim if _DATE_ONLY_RE.match(raw_fim) else None

    timeline = data.get("timeline") or []
    timeline.sort(key=lambda x: (x.get("date") or ""))

    executive_summary = data.get("executive_summary") or {"context": "", "pillars": []}
    ai_metadata = {
        "model": model_name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "articles_analyzed": len(fontes_pesquisadas),
        "tema_sugerido": hint_clean,
    }

    sugestao = {
        "slug": slug,
        "titulo": str(data.get("titulo") or "").strip(),
        "subtitulo": str(data.get("subtitulo") or "").strip(),
        "categoria": str(data.get("categoria") or "Eventos").strip() or "Eventos",
        "icone_ou_bandeira": str(data.get("icone_ou_bandeira") or "Globe").strip() or "Globe",
        "meta_info": str(data.get("meta_info") or "").strip(),
        "data_inicio": data_inicio,
        "data_fim": data_fim,
        "regras_classificacao": {"palavras_chave": palavras[:12], "paises": paises[:12]},
        "executive_summary": executive_summary,
        "timeline": timeline,
        "ai_metadata": ai_metadata,
    }
    return {
        "ok": True,
        "fonte_trends": fonte_trends,
        "trends": trends,
        "fontes_pesquisadas": fontes_pesquisadas,
        "sugestao": sugestao,
    }


# Dossiês 2.0 — Geração editorial por IA (Gemini) + revisão


class DossierGenerationModel(BaseModel):
    executive_summary: DossierExecutiveSummaryModel
    timeline: List[DossierTimelineItemModel]


def _montar_prompt_geracao_dossie(dossie: Dict[str, Any], materias: List[Dict[str, Any]], today_iso: str) -> str:
    regras = dossie.get("regras_classificacao") or {}
    paises = regras.get("paises") or []
    tags = regras.get("palavras_chave") or []
    if not paises and dossie.get("icone_ou_bandeira"):
        ic = str(dossie.get("icone_ou_bandeira")).upper()
        if len(ic) == 2 and ic.isalpha():
            paises = [ic]

    def _fmt_artigo(i: int, a: Dict[str, Any]) -> str:
        pub = _iso(a.get("publicado_em")) or ""
        pub = pub[:10] if pub else "s/ data"
        fonte = a.get("veiculo_nome") or a.get("fonte_nome") or "Fonte"
        vies = a.get("vies") or a.get("editorial_bias")
        vies_txt = f" ({vies})" if vies else ""
        titulo = a.get("materia_titulo") or a.get("titulo") or ""
        return f'{i}. [{pub}] {fonte}{vies_txt}: "{titulo}"'

    articles_block = "\n".join(_fmt_artigo(i, a) for i, a in enumerate(materias, 1))
    period_label = dossie.get("meta_info") or (
        "Cobertura permanente" if dossie.get("tipo") == "permanente" else "Cobertura especial"
    )

    return f"""Você é o editor-chefe de geopolítica do portal "Rodando o Mundo — Atlas Jornalístico".
Sua missão é estruturar a camada analítica de um Dossiê Temático com rigor factual, neutralidade editorial (padrão agência de notícias como Reuters/AFP) e clareza visual.

DATA DE REFERÊNCIA ATUAL: {today_iso}

DADOS DO DOSSIÊ:
- Título: {dossie.get("titulo", "")}
- Escopo/Resumo: {dossie.get("subtitulo", "")}
- Janela Temporal: {period_label}
- Países/Blocos Principais: {", ".join(paises) if paises else "Não especificado"}
- Palavras-chave: {", ".join(tags) if tags else "Não especificadas"}

MANCHETES RECENTES COLETADAS NO ATLAS (multi-perspectiva):
{articles_block or "Nenhuma matéria recente vinculada; utilize o conhecimento histórico e geopolítico consolidado."}

DIRETRIZES OBRIGATÓRIAS:
1. SÍNTESE EXECUTIVA ("O que está em jogo"):
   - Escreva em Português do Brasil (PT-BR), tom analítico, direto e sem opinião partidária.
   - O campo "context" deve explicar em um único parágrafo coeso a raiz do tema e sua relevância atual.
   - Crie EXATAMENTE 3 pilares ("pillars") cobrindo dimensões complementares (ex: disputa política interna, impacto econômico/mercados e desdobramentos diplomáticos/geopolíticos).
2. LINHA DO TEMPO INTERATIVA:
   - Gere entre 5 e 7 marcos cronológicos ordenados do mais antigo para o mais recente/futuro.
   - Combine antecedentes estruturais recentes com os eventos das manchetes fornecidas e os próximos marcos decisivos previstos.
   - Classifique corretamente cada item em "past" (antes de {today_iso}), "turning_point" (o evento central/virada) ou "upcoming" (após {today_iso}).
3. RIGOR E CONCISÃO:
   - Respeite estritamente os limites de caracteres indicados no schema para não quebrar os cards da interface."""


@router.post("/v2/admin/dossies/{slug}/generate")
def admin_gerar_dossie_ia(
    slug: str,
    response: Response,
    conn: Any = Depends(get_db),
    _: None = Depends(verificar_admin_token),
):
    aplicar_no_cache_headers(response)
    if conn is None:
        raise HTTPException(status_code=503, detail="Banco de dados indisponível.")

    slug_norm = slug.strip().lower()
    dossie = _buscar_dossie_view(conn, slug_norm)
    if not dossie:
        raise HTTPException(status_code=404, detail=f"Dossiê '{slug_norm}' não encontrado.")

    materias: List[Dict[str, Any]] = []
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT m.materia_titulo, m.materia_url, m.veiculo_nome, m.pais_veiculo, m.vies, m.publicado_em
                   FROM dossie_materias m JOIN dossies d ON d.id = m.dossie_id
                   WHERE d.slug = %s
                   ORDER BY m.publicado_em DESC NULLS LAST
                   LIMIT 30;""",
                (slug_norm,),
            )
            materias = [dict(r) for r in cur.fetchall()]
    except Exception:  # noqa: BLE001
        materias = []

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY não configurada no ambiente.")

    try:
        from google import genai
        from google.genai import types
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"SDK google-genai indisponível: {exc}") from exc

    today_iso = datetime.now(timezone.utc).date().isoformat()
    prompt = _montar_prompt_geracao_dossie(dossie, materias, today_iso)

    model_name = os.getenv("GEMINI_DOSSIER_MODEL", "gemini-2.5-flash")
    try:
        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=120_000))
        result = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=DossierGenerationModel,
                temperature=0.3,
            ),
        )
        generated: Optional[DossierGenerationModel] = getattr(result, "parsed", None)
        if generated is None:
            generated = DossierGenerationModel.model_validate_json(result.text)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Falha ao gerar conteúdo com a IA: {exc}") from exc

    payload = generated.model_dump()
    timeline = payload.get("timeline") or []
    timeline.sort(key=lambda x: (x.get("date") or ""))

    ai_metadata = {
        "model": model_name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "articles_analyzed": len(materias),
    }

    from psycopg.types.json import Jsonb

    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE dossies
                   SET executive_summary = %(executive_summary)s,
                       timeline = %(timeline)s,
                       workflow_status = 'review',
                       ai_metadata = %(ai_metadata)s,
                       ultima_atualizacao = NOW()
                   WHERE slug = %(slug)s;""",
                {
                    "slug": slug_norm,
                    "executive_summary": Jsonb(payload.get("executive_summary") or {}),
                    "timeline": Jsonb(timeline),
                    "ai_metadata": Jsonb(ai_metadata),
                },
            )
        conn.commit()
    except Exception as exc:  # noqa: BLE001
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Falha ao salvar conteúdo gerado: {exc}") from exc

    atualizado = _buscar_dossie_view(conn, slug_norm)
    return {"ok": True, "dossie": atualizado}
