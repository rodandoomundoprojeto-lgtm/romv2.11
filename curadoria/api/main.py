"""API de Inteligência — Rodando o Mundo (FastAPI + PostgreSQL).

Rodar local:
    uvicorn curadoria.api.main:app --reload --port 8000
"""
import os
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Optional

from pathlib import Path

import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from ..agente.schemas import MAPA_ROTAS_EDITORIA, CategoriaType, CuradoriaPayload
from api.routes_v2 import router as router_v2, verificar_admin_token

try:
    from pathlib import Path

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

app = FastAPI(title="API de Inteligência - Rodando o Mundo")
app.include_router(router_v2)

# CORS para permitir acesso seguro a partir do portal e dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://www.rodandoomundo.com.br",
        "https://rodandoomundo.com.br",
        "http://localhost:3000",
        "http://localhost:5500",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("CURADORIA_DATABASE_URL", "postgresql://usuario:senha@localhost:5432/rodandoomundo")
API_SECRET_TOKEN = os.getenv("CURADORIA_SECRET_TOKEN", "").strip()
ADMIN_PASSWORD = (os.getenv("ADMIN_PASSWORD") or os.getenv("ADMIN_SENHA") or "").strip()

CAMPOS_PUBLICOS = """
    slug, titulo_tema, status, categoria_primaria, categorias_cruzadas,
    relevancia_score, palavras_chave_busca, gatilho_vitrine, sintese_nerd
"""


# ---------------------------------------------------------------------
# Segurança, Rate Limit e Cache Headers
# ---------------------------------------------------------------------

RATE_LIMIT_MAX_REQ = 60
RATE_LIMIT_WINDOW_S = 60.0
_rate_buckets: dict[str, deque] = defaultdict(deque)


def verificar_rate_limit(request: Request) -> None:
    ip = (request.client.host if request.client else "anon") or "anon"
    agora = time.monotonic()
    fila = _rate_buckets[ip]
    while fila and agora - fila[0] > RATE_LIMIT_WINDOW_S:
        fila.popleft()
    if len(fila) >= RATE_LIMIT_MAX_REQ:
        raise HTTPException(status_code=429, detail="Limite de requisições excedido. Tente novamente em instantes.")
    fila.append(agora)


def aplicar_cache_headers(response: Response, _t: Optional[str] = None, refresh: Optional[str] = None) -> None:
    if _t is not None or str(refresh) == "1":
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    else:
        response.headers["Cache-Control"] = "public, max-age=120, s-maxage=300"


def verificar_token(
    authorization: Optional[str] = Header(default=None),
    x_admin_user: Optional[str] = Header(default=None, alias="X-Admin-User"),
) -> None:
    verificar_admin_token(authorization=authorization, x_admin_user=x_admin_user)


def get_db():
    try:
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row, connect_timeout=5, prepare_threshold=None)
    except psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail="Banco de dados indisponível") from e
    with conn:
        yield conn


# ---------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------

@app.get("/health")
def health():
    return {"ok": True}


@app.get("/admin", include_in_schema=False)
@app.get("/admin/", include_in_schema=False)
def admin_lite_page():
    admin_html = Path(__file__).resolve().parents[2] / "admin" / "index.html"
    if admin_html.is_file():
        return FileResponse(admin_html)
    return Response(status_code=404)


@app.post("/v1/curadoria", dependencies=[Depends(verificar_token)])
def receber_curadoria(payload: CuradoriaPayload, conn=Depends(get_db)):
    agora = datetime.now(timezone.utc)
    query_upsert = """
        INSERT INTO ai_curadoria_insights (
            slug, batch_id, titulo_tema, status, categoria_primaria,
            categorias_cruzadas, relevancia_score, ttl_horas,
            palavras_chave_busca, gatilho_vitrine, sintese_nerd,
            sugestao_pauta_gap, updated_at, expires_at
        ) VALUES (
            %(slug)s, %(batch_id)s, %(titulo_tema)s, %(status)s, %(categoria_primaria)s,
            %(categorias_cruzadas)s, %(relevancia_score)s, %(ttl_horas)s,
            %(palavras_chave_busca)s, %(gatilho_vitrine)s, %(sintese_nerd)s,
            %(sugestao_pauta_gap)s, %(updated_at)s, %(expires_at)s
        )
        ON CONFLICT (slug) DO UPDATE SET
            batch_id = EXCLUDED.batch_id,
            titulo_tema = EXCLUDED.titulo_tema,
            status = EXCLUDED.status,
            categoria_primaria = EXCLUDED.categoria_primaria,
            categorias_cruzadas = EXCLUDED.categorias_cruzadas,
            relevancia_score = EXCLUDED.relevancia_score,
            ttl_horas = EXCLUDED.ttl_horas,
            palavras_chave_busca = EXCLUDED.palavras_chave_busca,
            gatilho_vitrine = EXCLUDED.gatilho_vitrine,
            sintese_nerd = EXCLUDED.sintese_nerd,
            sugestao_pauta_gap = EXCLUDED.sugestao_pauta_gap,
            updated_at = EXCLUDED.updated_at,
            expires_at = EXCLUDED.expires_at;
    """
    with conn.cursor() as cur:
        for item in payload.insights:
            cur.execute(query_upsert, {
                **item.model_dump(exclude={"sugestao_pauta_gap", "palavras_chave_busca"}),
                "batch_id": payload.batch_id,
                "palavras_chave_busca": [kw.lower().strip() for kw in item.palavras_chave_busca],
                "sugestao_pauta_gap": Jsonb(item.sugestao_pauta_gap.model_dump()),
                "updated_at": agora,
                "expires_at": agora + timedelta(hours=item.ttl_horas),
            })
        conn.commit()
    return {"status": "ok", "batch_id": payload.batch_id, "itens_salvos": len(payload.insights)}


@app.get("/v1/curadoria/historico", dependencies=[Depends(verificar_token)])
def obter_historico_recente(horas: int = Query(48, ge=1, le=720), conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT slug FROM ai_curadoria_insights
            WHERE updated_at >= NOW() - (%s * INTERVAL '1 hour')
            ORDER BY updated_at DESC;
            """,
            (horas,),
        )
        return {"slugs_recentes": [r["slug"] for r in cur.fetchall()]}


@app.get("/v1/vitrine/em-alta", dependencies=[Depends(verificar_rate_limit)])
def listar_temas_vitrine(
    response: Response,
    categoria: Optional[CategoriaType] = None,
    limite: int = Query(6, ge=1, le=20),
    _t: Optional[str] = Query(None),
    refresh: Optional[str] = Query(None),
    conn=Depends(get_db),
):
    aplicar_cache_headers(response, _t=_t, refresh=refresh)
    with conn.cursor() as cur:
        if categoria:
            cur.execute(
                f"""
                SELECT {CAMPOS_PUBLICOS} FROM ai_curadoria_insights
                WHERE expires_at > NOW()
                  AND (categoria_primaria = %s OR %s = ANY(categorias_cruzadas))
                ORDER BY relevancia_score DESC LIMIT %s;
                """,
                (categoria, categoria, limite),
            )
        else:
            cur.execute(
                f"""
                SELECT {CAMPOS_PUBLICOS} FROM ai_curadoria_insights
                WHERE expires_at > NOW()
                ORDER BY relevancia_score DESC LIMIT %s;
                """,
                (limite,),
            )
        rows = cur.fetchall()
        temas = [
            {
                **r,
                "rota_editoria": MAPA_ROTAS_EDITORIA.get(r["categoria_primaria"], "/ultimas-noticias"),
            }
            for r in rows
        ]
        return {
            "ok": True,
            "cached": False,
            "source": "api",
            "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "temas_ativos": temas,
        }


@app.get("/v1/gaps", dependencies=[Depends(verificar_token)])
def obter_content_gaps(conn=Depends(get_db)):
    """Retorna o radar de lacunas de conteúdo editorial cruzando IA com o acervo."""
    query_gaps = r"""
    WITH cobertura_atual AS (
        SELECT
            i.id AS insight_id, i.slug, i.titulo_tema, i.categoria_primaria,
            i.relevancia_score, i.palavras_chave_busca, i.sugestao_pauta_gap, i.expires_at,
            COUNT(DISTINCT c.id) AS total_artigos_no_site,
            COALESCE(ARRAY_AGG(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL), '{}') AS ids_artigos_existentes
        FROM ai_curadoria_insights i
        LEFT JOIN conteudos c
            ON (
                c.tags && i.palavras_chave_busca
                OR c.busca_vetor @@ plainto_tsquery('portuguese', i.titulo_tema)
                OR (
                    SELECT COUNT(DISTINCT tk)
                    FROM unnest(regexp_split_to_array(lower(array_to_string(i.palavras_chave_busca, ' ')), '\s+')) AS tk
                    WHERE length(tk) >= 4 AND tk = ANY(c.tags)
                ) >= 3
            )
        WHERE i.expires_at > NOW()
        GROUP BY i.id
    )
    SELECT
        slug, titulo_tema, categoria_primaria, relevancia_score, total_artigos_no_site,
        CASE
            WHEN total_artigos_no_site = 0 AND relevancia_score >= 80 THEN 'GAP_CRITICO'
            WHEN total_artigos_no_site <= 1 AND relevancia_score >= 65 THEN 'GAP_OPORTUNIDADE'
            ELSE 'COBERTO'
        END AS status_cobertura,
        CASE WHEN total_artigos_no_site <= 1 THEN sugestao_pauta_gap ELSE NULL END AS pauta_para_escrever,
        ids_artigos_existentes,
        expires_at
    FROM cobertura_atual
    ORDER BY (relevancia_score::float / (total_artigos_no_site + 1)) DESC;
    """
    with conn.cursor() as cur:
        cur.execute(query_gaps)
        return {"content_gaps": cur.fetchall()}


@app.get("/v1/busca/expansao", dependencies=[Depends(verificar_rate_limit)])
def expandir_termo_busca(
    response: Response,
    q: str = Query(..., min_length=2),
    _t: Optional[str] = Query(None),
    refresh: Optional[str] = Query(None),
    conn=Depends(get_db),
):
    aplicar_cache_headers(response, _t=_t, refresh=refresh)
    termo = q.lower().strip()
    tokens = [tk for tk in termo.split() if len(tk) >= 2]
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT titulo_tema, relevancia_score, palavras_chave_busca, gatilho_vitrine, sintese_nerd
            FROM ai_curadoria_insights
            WHERE expires_at > NOW()
            ORDER BY relevancia_score DESC LIMIT 20;
            """
        )
        candidatos = cur.fetchall()

    pontuados = []
    for r in candidatos:
        kws = [k.lower() for k in (r.get("palavras_chave_busca") or [])]
        tit = (r.get("titulo_tema") or "").lower()
        sint = (r.get("sintese_nerd") or "").lower()
        peso = 0
        if termo in kws:
            peso += 100
        if termo in tit:
            peso += 80
        elif termo in sint:
            peso += 40
        for tk in tokens:
            if any(tk in kw for kw in kws):
                peso += 35
            if tk in tit:
                peso += 25
            elif tk in sint:
                peso += 10
        if peso > 0:
            pontuados.append((peso + (r["relevancia_score"] * 0.2), r))

    pontuados.sort(key=lambda x: x[0], reverse=True)
    resultados = [
        {
            "titulo_tema": item["titulo_tema"],
            "relevancia_score": item["relevancia_score"],
            "palavras_chave_busca": item["palavras_chave_busca"],
            "gatilho_vitrine": item["gatilho_vitrine"],
        }
        for _, item in pontuados[:3]
    ]

    termos = {termo}
    for r in resultados:
        termos.update(r["palavras_chave_busca"])
    return {
        "ok": True,
        "termo_original": q,
        "termos_turbinados": sorted(termos),
        "contextos_relacionados": resultados,
    }

