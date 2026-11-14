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
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

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
    if not dossie:
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

    colunas_permitidas = (
        "titulo",
        "subtitulo",
        "categoria",
        "icone_ou_bandeira",
        "data_inicio",
        "data_fim",
        "meta_info",
        "regras_classificacao",
    )
    sets: List[str] = []
    params: Dict[str, Any] = {"slug": slug_norm}
    for campo in colunas_permitidas:
        if campo not in fields:
            continue
        valor = getattr(payload, campo)
        if campo == "regras_classificacao":
            valor = Jsonb(_normalizar_regras(valor))
        sets.append(f"{campo} = %({campo})s")
        params[campo] = valor

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

    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO dossies (
                       slug, titulo, subtitulo, tipo, categoria, icone_ou_bandeira,
                       data_inicio, data_fim, regras_classificacao, meta_info, rota, ordem
                   )
                   VALUES (
                       %(slug)s, %(titulo)s, %(subtitulo)s, 'especial', %(categoria)s, %(icone_ou_bandeira)s,
                       %(data_inicio)s, %(data_fim)s, %(regras)s, %(meta_info)s, NULL,
                       COALESCE((SELECT MAX(ordem) FROM dossies), 0) + 1
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
    return {"ok": True, "deleted_slug": slug_norm}
