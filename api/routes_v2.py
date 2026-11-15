"""Rotas FastAPI do Motor Editorial V2 e Pulso de 30 Minutos — Rodando o Mundo.

Implementa as rotas oficiais definidas no plano arquitetural (`docs/arquitetura_v2.md`):
  - `GET  /v1/noticias-quentes`          : Lista notícias quentes e eventos ativos ordenados por `urgencia_score DESC`.
  - `POST /v1/noticias-quentes/executar` : Disparo manual do pipeline de pulso (30m) com Session-Level Advisory Lock.
  - `POST /v2/gerar-coluna`              : Dispara o pipeline de 4 agentes (`gemini-2.5-pro`) em `BackgroundTasks`.
  - `GET  /v2/colunas`                   : Lista colunas analíticas geradas (mais recentes primeiro).
  - `GET  /v2/entenda-o-assunto/{slug}`  : Retorna o dossiê contextual completo e o Painel Único de Verificação (404 se ausente).
"""
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

import psycopg
from fastapi import APIRouter, BackgroundTasks, Body, Depends, Header, HTTPException, Query, Response
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from redacao_v2.coletor_estudo import advisory_lock
from redacao_v2.orquestrador_editorial import executar_orquestrador_editorial_async
from redacao_v2.pulso_noticias_quentes import (
    LOCK_PULSO_KEY,
    executar_pipeline_pulso_async,
    registrar_auditoria_execucao,
    selecionar_coberturas_destaque_isoladas,
    verificar_kill_switch_publicacao,
)
from redacao_v2.schemas import (
    CoberturaPublica,
    CoberturaVeiculoItem,
    EventoPaginaPrincipal,
    EvidenciaResolvidaPublica,
    PainelVerificacaoEvento,
)
from src.publisher import sortir_cards_rodizio_amplo

router = APIRouter(tags=["Motor Editorial V2 & Pulso 30m"])


# ============================================================================
# 1. DEPENDÊNCIA DE BANCO DE DADOS E CABEÇALHOS DE CACHE (REGRA 7 GEMINI.md)
# ============================================================================

def obter_database_url() -> str:
    """Resolve a URL de conexão PostgreSQL a partir das variáveis de ambiente."""
    return (
        os.getenv("DATABASE_URL")
        or os.getenv("CURADORIA_DATABASE_URL")
        or ""
    ).strip()


def get_db():
    """Dependência FastAPI para conexão com PostgreSQL (sobreponível via dependency_overrides)."""
    db_url = obter_database_url()
    if not db_url or "[YOUR-PASSWORD]" in db_url:
        yield None
        return

    try:
        conn = psycopg.connect(
            db_url,
            row_factory=dict_row,
            connect_timeout=5,
            prepare_threshold=None,
        )
    except Exception:  # noqa: BLE001
        yield None
        return

    with conn:
        yield conn


def aplicar_no_cache_headers(response: Response) -> None:
    """Aplica invalidação rigorosa de cache (Regra 7 do GEMINI.md)."""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"


def _formatar_horario_editorial(dt: Optional[Any] = None) -> str:
    """Formata o carimbo editorial 'Atualizado às HHhMM' (Seção 1 de docs/arquitetura_v2.md)."""
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:  # noqa: BLE001
            dt = datetime.now(timezone.utc)
    elif not isinstance(dt, datetime):
        dt = datetime.now(timezone.utc)
    return f"Atualizado às {dt.strftime('%Hh%M')}"


def _serializar_valor_temporal(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)


def _decodificar_jsonb(val: Any, default: Any) -> Any:
    if val is None:
        return default
    if isinstance(val, (list, dict)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:  # noqa: BLE001
            return default
    return default


# ============================================================================
# 2. MODELOS DE REQUISIÇÃO (PYDANTIC V2)
# ============================================================================

class ExecutarPulsoRequest(BaseModel):
    """Parâmetros opcionais para disparo manual do pipeline de pulso (30m)."""
    dry_run: bool = Field(
        default=False,
        description="Se True, coleta e processa no Gemini sem gravar no PostgreSQL",
    )


class GerarColunaRequest(BaseModel):
    """Parâmetros de entrada para geração de coluna analítica (4 agentes — gemini-2.5-pro)."""
    tema: Optional[str] = Field(
        default=None,
        max_length=240,
        description="Tema central ou pauta prioritária para a análise aprofundada",
    )
    slug: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Slug sugerido ou do evento de origem",
    )
    event_id: Optional[int] = Field(
        default=None,
        description="ID opcional do evento consolidado em ai_eventos",
    )
    fontes_urls: List[str] = Field(
        default_factory=list,
        description="Lista opcional de URLs de referência adicionais para estudo",
    )
    dry_run: bool = Field(
        default=False,
        description="Executar sem persistir no banco de dados",
    )
    sincrono: bool = Field(
        default=False,
        description="Se True, aguarda a conclusão do pipeline antes de responder",
    )


# ============================================================================
# 3. AUXILIARES DE GOVERNANÇA: EXIBIÇÃO PERMITIDA E ISOLAMENTO DE FONTES
# ============================================================================

def _aplicar_politica_exibicao_cobertura(
    cob_row: Dict[str, Any],
    eh_fallback_oficial: bool = False,
) -> CoberturaPublica:
    """Garante que `manchete_original` só seja exposta se `exibicao_permitida == 'manchete_sintese_e_link'`
    (Seções 1, 4 e 6 de docs/arquitetura_v2.md).
    """
    exibicao = (cob_row.get("exibicao_permitida") or "sintese_e_link").strip()
    manchete = cob_row.get("manchete_original") if exibicao == "manchete_sintese_e_link" else None
    fonte_tipo_raw = (cob_row.get("fonte_tipo") or "veiculo_imprensa").strip()
    if fonte_tipo_raw not in ("veiculo_imprensa", "fonte_primaria", "instituicao_pesquisa"):
        fonte_tipo_raw = "fonte_primaria" if fonte_tipo_raw == "youtube_rss" else "veiculo_imprensa"

    return CoberturaPublica(
        veiculo_nome=str(cob_row.get("veiculo_nome") or "Fonte Verificada"),
        pais_veiculo=str(cob_row.get("pais_veiculo") or "BR")[:2],
        fonte_tipo=fonte_tipo_raw,  # type: ignore[arg-type]
        eh_fallback_oficial=eh_fallback_oficial,
        manchete_original=manchete,
        enfoque_identificado=str(cob_row.get("enfoque_identificado") or ""),
        url_original=str(cob_row.get("url_original") or ""),
    )


def _carregar_eventos_ativos_comparados(
    conn: Any,
    categoria: Optional[str] = None,
    pais: Optional[str] = None,
    limite: int = 10,
) -> List[Dict[str, Any]]:
    """Carrega eventos ativos de `ai_eventos` aplicando isolamento de fontes primárias e `exibicao_permitida`."""
    try:
        filtros = ["e.destaque_ate > NOW()", "e.status IN ('ativo', 'publicado', 'aguardando_revisao')"]
        params: List[Any] = []

        if categoria:
            filtros.append("e.categoria = %s")
            params.append(categoria)
        if pais:
            filtros.append("%s = ANY(e.paises_envolvidos)")
            params.append(pais.upper())

        params.append(limite)
        where_sql = " AND ".join(filtros)

        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    e.id, e.slug, e.titulo_evento, e.categoria, e.paises_envolvidos,
                    e.urgencia_score, e.relevancia_score, e.nivel_confianca,
                    e.aviso_correcao_material, e.destaque_ate, e.status, e.updated_at,
                    (
                        SELECT cg.payload_json->>'sintese_com_ressalvas'
                        FROM ai_conteudos_gerados cg
                        WHERE cg.event_id = e.id
                        ORDER BY cg.versao DESC
                        LIMIT 1
                    ) AS sintese_com_ressalvas,
                    EXISTS(
                        SELECT 1 FROM ai_entenda_o_assunto ea
                        WHERE ea.slug = e.slug OR ea.slug = ('entenda-' || e.slug)
                    ) AS tem_contexto_disponivel
                FROM ai_eventos e
                WHERE {where_sql}
                ORDER BY e.urgencia_score DESC, e.relevancia_score DESC, e.updated_at DESC
                LIMIT %s;
                """,
                tuple(params),
            )
            eventos_rows = cur.fetchall()

            eventos_publicos: List[Dict[str, Any]] = []
            for ev in eventos_rows:
                ev_id = ev["id"]
                cur.execute(
                    """
                    SELECT
                        c.documento_id, c.veiculo_nome, c.pais_veiculo, c.fonte_tipo,
                        c.peso_confianca, c.manchete_original, c.enfoque_identificado,
                        c.url_original, c.published_at,
                        COALESCE(f.exibicao_permitida, 'sintese_e_link') AS exibicao_permitida
                    FROM ai_coberturas_por_veiculo c
                    LEFT JOIN ai_documentos_coletados d ON d.id = c.documento_id
                    LEFT JOIN ai_fontes_referencia f ON f.id = d.source_id
                    WHERE c.event_id = %s
                    ORDER BY c.peso_confianca DESC, c.published_at DESC NULLS LAST;
                    """,
                    (ev_id,),
                )
                coberturas_db = cur.fetchall()

                itens_internos: List[CoberturaVeiculoItem] = []
                mapa_exibicao: Dict[str, str] = {}
                total_imprensa = 0
                total_primarias = 0

                for idx, cob in enumerate(coberturas_db, start=1):
                    ft = (cob.get("fonte_tipo") or "veiculo_imprensa").strip()
                    if ft == "veiculo_imprensa":
                        total_imprensa += 1
                        ft_valido = "veiculo_imprensa"
                    elif ft in ("fonte_primaria", "youtube_rss"):
                        total_primarias += 1
                        ft_valido = "fonte_primaria"
                    else:
                        ft_valido = "instituicao_pesquisa"

                    url_orig = str(cob.get("url_original") or "")
                    mapa_exibicao[url_orig] = str(cob.get("exibicao_permitida") or "sintese_e_link")

                    itens_internos.append(
                        CoberturaVeiculoItem(
                            documento_id=int(cob.get("documento_id") or idx),
                            veiculo_nome=str(cob.get("veiculo_nome") or "Fonte"),
                            pais_veiculo=str(cob.get("pais_veiculo") or "BR")[:2],
                            fonte_tipo=ft_valido,  # type: ignore[arg-type]
                            manchete_original=str(cob.get("manchete_original") or ""),
                            enfoque_identificado=str(cob.get("enfoque_identificado") or ""),
                            url_original=url_orig,
                        )
                    )

                destaque_cards = selecionar_coberturas_destaque_isoladas(itens_internos, max_cards=3)
                # Aplica política de exibicao_permitida (remove manchete_original se for apenas sintese_e_link)
                for card in destaque_cards:
                    if mapa_exibicao.get(card.url_original, "sintese_e_link") != "manchete_sintese_e_link":
                        card.manchete_original = None

                pagina_ev = EventoPaginaPrincipal(
                    slug=ev["slug"],
                    categoria=ev["categoria"],
                    titulo_evento=ev["titulo_evento"],
                    identificacao_editorial="Síntese Rodando o Mundo",
                    atualizado_em=_formatar_horario_editorial(ev.get("updated_at")),
                    sintese_com_ressalvas=ev.get("sintese_com_ressalvas") or ev["titulo_evento"],
                    aviso_correcao_material=ev.get("aviso_correcao_material"),
                    coberturas_destaque=destaque_cards,
                    total_coberturas_imprensa=total_imprensa,
                    total_fontes_primarias=total_primarias,
                    tem_contexto_disponivel=bool(ev.get("tem_contexto_disponivel")),
                )
                eventos_publicos.append(pagina_ev.model_dump())

            return eventos_publicos
    except Exception:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        return []


# ============================================================================
# 4. ROTA 1: GET /v1/noticias-quentes
# ============================================================================

@router.get("/v1/noticias-quentes")
def listar_noticias_quentes(
    response: Response,
    categoria: Optional[str] = Query(None, description="Filtrar por categoria do Atlas"),
    pais: Optional[str] = Query(None, description="Filtrar por código ISO-2 do país (ex: BR, US)"),
    limit: int = Query(15, ge=1, le=50, description="Limite máximo de notícias retornadas"),
    limite: Optional[int] = Query(None, ge=1, le=50, description="Alias opcional para limit"),
    _t: Optional[str] = Query(None, description="Parâmetro de cache-busting"),
    refresh: Optional[str] = Query(None, description="Flag de atualização em tempo real"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Retorna as notícias quentes e eventos ativos (`destaque_ate > NOW()` e `expires_at > NOW()`)
    ordenados por `urgencia_score DESC, relevancia_score DESC, updated_at DESC`.
    """
    aplicar_no_cache_headers(response)
    qtd_limite = limite if limite is not None else limit
    agora_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if conn is None:
        return {
            "ok": True,
            "cached": False,
            "source": "fallback_sem_banco",
            "identificacao_editorial": "Síntese Rodando o Mundo",
            "atualizado_em": _formatar_horario_editorial(),
            "updatedAt": agora_iso,
            "total": 0,
            "noticias_quentes": [],
            "eventos_principais": [],
        }

    filtros = [
        "expires_at > NOW()",
        "destaque_ate > NOW()",
        "status IN ('ativo', 'publicado', 'aguardando_revisao')",
    ]
    params: List[Any] = []

    if categoria:
        filtros.append("categoria = %s")
        params.append(categoria)
    if pais:
        filtros.append("%s = ANY(paises_envolvidos)")
        params.append(pais.upper())

    params.append(qtd_limite)
    where_clause = " AND ".join(filtros)

    query = f"""
        SELECT
            slug, batch_id, titulo_curto, resumo_pulso, impacto_pratico,
            categoria, paises_envolvidos, urgencia_score, relevancia_score,
            nivel_confianca, ttl_horas, horas_em_destaque, veiculos_origem,
            fontes_urls, palavras_chave, links_internos_relacionados,
            status, destaque_ate, expires_at, updated_at
        FROM ai_noticias_quentes
        WHERE {where_clause}
        ORDER BY urgencia_score DESC, relevancia_score DESC, updated_at DESC
        LIMIT %s;
    """

    noticias: List[Dict[str, Any]] = []
    try:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

        for r in rows:
            row_dict = dict(r)
            noticias.append({
                "slug": row_dict.get("slug"),
                "batch_id": row_dict.get("batch_id"),
                "titulo_curto": row_dict.get("titulo_curto"),
                "resumo_pulso": row_dict.get("resumo_pulso"),
                "impacto_pratico": row_dict.get("impacto_pratico"),
                "categoria": row_dict.get("categoria"),
                "paises_envolvidos": list(row_dict.get("paises_envolvidos") or []),
                "urgencia_score": int(row_dict.get("urgencia_score") or 0),
                "relevancia_score": int(row_dict.get("relevancia_score") or 0),
                "nivel_confianca": row_dict.get("nivel_confianca") or "alta",
                "ttl_horas": int(row_dict.get("ttl_horas") or 6),
                "horas_em_destaque": int(row_dict.get("horas_em_destaque") or 6),
                "veiculos_origem": list(row_dict.get("veiculos_origem") or []),
                "fontes_urls": list(row_dict.get("fontes_urls") or []),
                "palavras_chave": list(row_dict.get("palavras_chave") or []),
                "links_internos_relacionados": _decodificar_jsonb(
                    row_dict.get("links_internos_relacionados"), []
                ),
                "identificacao_editorial": "Síntese Rodando o Mundo",
                "atualizado_em": _formatar_horario_editorial(row_dict.get("updated_at")),
                "destaque_ate": _serializar_valor_temporal(row_dict.get("destaque_ate")),
                "expires_at": _serializar_valor_temporal(row_dict.get("expires_at")),
                "updated_at": _serializar_valor_temporal(row_dict.get("updated_at")),
            })
    except Exception as e:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        print(f"[Aviso] Erro ao consultar ai_noticias_quentes: {e}")

    eventos_principais = _carregar_eventos_ativos_comparados(
        conn,
        categoria=categoria,
        pais=pais,
        limite=qtd_limite,
    )

    return {
        "ok": True,
        "cached": False,
        "source": "database",
        "identificacao_editorial": "Síntese Rodando o Mundo",
        "atualizado_em": _formatar_horario_editorial(),
        "updatedAt": agora_iso,
        "total": len(noticias),
        "noticias_quentes": noticias,
        "eventos_principais": eventos_principais,
    }


# ============================================================================
# 5. ROTA 2: POST /v1/noticias-quentes/executar
# ============================================================================

@router.post("/v1/noticias-quentes/executar")
async def executar_noticias_quentes_manual(
    response: Response,
    payload_req: Optional[ExecutarPulsoRequest] = Body(default=None),
    dry_run_query: bool = Query(False, alias="dry_run", description="Executar em modo dry-run sem gravar no banco"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Disparo manual do pipeline de pulso (`pulso_noticias_quentes`).

    Utiliza exatamente a mesma função e Session-Level Advisory Lock (`LOCK_PULSO_KEY`)
    dos agendamentos automatizados, registrando telemetria em `ai_execucoes_pipeline`.
    """
    aplicar_no_cache_headers(response)
    modo_dry_run = bool(dry_run_query or (payload_req and payload_req.dry_run))
    db_url = obter_database_url()

    # Se não for dry_run e houver conexão aberta, verifica se o lock já está ocupado antes de invocar o LLM
    if not modo_dry_run and conn is not None:
        with advisory_lock(conn, LOCK_PULSO_KEY) as disponivel:
            if not disponivel:
                registrar_auditoria_execucao(
                    conn,
                    job_nome="pulso_noticias_quentes_30m",
                    recurso_chave=LOCK_PULSO_KEY,
                    status="ignorado_lock_ocupado",
                    documentos_novos=0,
                    eventos_atualizados=0,
                )
                return {
                    "ok": False,
                    "status": "ignorado_lock_ocupado",
                    "recurso_chave": LOCK_PULSO_KEY,
                    "detalhe": "Já existe uma execução ativa do pipeline de pulso segurando o Advisory Lock.",
                    "total_noticias": 0,
                    "noticias_quentes": [],
                }

    try:
        resultado = await executar_pipeline_pulso_async(
            db_url=db_url,
            dry_run=modo_dry_run,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao executar pipeline de coleta: {exc}",
        ) from exc

    if resultado is None:
        return {
            "ok": True,
            "status": "sem_itens",
            "recurso_chave": LOCK_PULSO_KEY,
            "dry_run": modo_dry_run,
            "total_noticias": 0,
            "noticias_quentes": [],
        }

    return {
        "ok": True,
        "status": "dry_run" if modo_dry_run else "concluido",
        "recurso_chave": LOCK_PULSO_KEY,
        "dry_run": modo_dry_run,
        "batch_id": resultado.batch_id,
        "gerado_em": resultado.gerado_em,
        "model_id": resultado.model_id,
        "total_noticias": len(resultado.noticias_quentes),
        "noticias_quentes": [item.model_dump() for item in resultado.noticias_quentes],
    }


# ============================================================================
# 5.1. ROTA RADAR EDITORIAL: GET /api/radar e GET /radar
# ============================================================================

@router.get("/api/radar")
@router.get("/radar")
def obter_feed_radar(
    response: Response,
    categoria: Optional[str] = Query(None, description="Filtrar por categoria do Radar"),
    _t: Optional[str] = Query(None, description="Timestamp de cache-busting"),
    refresh: Optional[str] = Query(None, description="Flag de atualização em tempo real"),
) -> Dict[str, Any]:
    """Retorna os briefings do Radar Editorial mesclando dados de feed_output.json e vitrine_ia.json."""
    aplicar_no_cache_headers(response)
    raiz = Path(__file__).resolve().parents[1]
    feed_path = raiz / "data" / "feed_output.json"

    items: List[Dict[str, Any]] = []
    if feed_path.is_file():
        try:
            feed_raw = json.loads(feed_path.read_text(encoding="utf-8"))
            if isinstance(feed_raw, list):
                items.extend(feed_raw)
        except Exception:
            pass

    if categoria and categoria.lower() != "todos":
        cat_norm = categoria.lower().strip()
        items = [it for it in items if str(it.get("categoria", "")).lower() == cat_norm]

    items = sortir_cards_rodizio_amplo(items, max_v2_topo=2)

    mais_recente_iso = max(
        (str(it.get("data_publicacao")) for it in items if it.get("data_publicacao")),
        default=None,
    )

    agora_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    carimbo = "Atualizado agora"
    if mais_recente_iso:
        try:
            dt = datetime.fromisoformat(mais_recente_iso.replace("Z", "+00:00"))
            agora_dt = datetime.now(timezone.utc)
            diff_min = int((agora_dt - dt).total_seconds() / 60)
            if diff_min < 5:
                carimbo = "Atualizado agora"
            elif diff_min < 60:
                carimbo = f"Atualizado há {diff_min} min"
            else:
                carimbo = _formatar_horario_editorial()
        except Exception:
            carimbo = _formatar_horario_editorial()

    return {
        "ok": True,
        "cached": False,
        "source": "v2_hybrid",
        "atualizado_em": carimbo,
        "updatedAt": agora_iso,
        "total": len(items),
        "items": items,
    }


# ============================================================================
# 6. ROTA 3: POST /v2/gerar-coluna
# ============================================================================

async def _tarefa_background_gerar_coluna(
    tema: Optional[str],
    recurso_chave: str,
    db_url: str,
    dry_run: bool = False,
) -> Optional[Dict[str, Any]]:
    """Executa o orquestrador editorial de 4 agentes em BackgroundTasks com auditoria de execução."""
    exec_id: Optional[int] = None
    if db_url and not dry_run:
        try:
            with psycopg.connect(db_url, connect_timeout=8, prepare_threshold=None) as conn:
                exec_id = registrar_auditoria_execucao(
                    conn,
                    job_nome="orquestrador_editorial_v2",
                    recurso_chave=recurso_chave,
                    status="em_execucao",
                )
        except Exception:  # noqa: BLE001
            pass

    try:
        res = await executar_orquestrador_editorial_async(
            tema_foco=tema,
            db_url=db_url,
            dry_run=dry_run,
        )
        if db_url and not dry_run and exec_id is not None:
            try:
                with psycopg.connect(db_url, connect_timeout=8, prepare_threshold=None) as conn:
                    aprovado = bool(res and res.get("aprovado"))
                    registrar_auditoria_execucao(
                        conn,
                        job_nome="orquestrador_editorial_v2",
                        recurso_chave=recurso_chave,
                        status="concluido" if aprovado else "falha",
                        documentos_novos=1 if res else 0,
                        eventos_atualizados=1 if aprovado else 0,
                        erro_detalhe=None if aprovado else "Coluna reprovada na auditoria de isenção/fatos.",
                        execucao_id=exec_id,
                    )
            except Exception:  # noqa: BLE001
                pass
        return res
    except Exception as exc:  # noqa: BLE001
        if db_url and not dry_run and exec_id is not None:
            try:
                with psycopg.connect(db_url, connect_timeout=8, prepare_threshold=None) as conn:
                    registrar_auditoria_execucao(
                        conn,
                        job_nome="orquestrador_editorial_v2",
                        recurso_chave=recurso_chave,
                        status="falha",
                        erro_detalhe=str(exc)[:500],
                        execucao_id=exec_id,
                    )
            except Exception:  # noqa: BLE001
                pass
        raise


@router.post("/v2/gerar-coluna", status_code=202)
async def gerar_coluna_editorial(
    req: GerarColunaRequest,
    background_tasks: BackgroundTasks,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Dispara o pipeline editorial sequencial de 4 agentes (`gemini-2.5-pro`) em `BackgroundTasks`.

    Respeita o Kill Switch (`publicacao_automatica_ativa` em `ai_config_operacional`) e a
    validação estrita de URLs internas contra o banco/sitemap (Regra 11 do GEMINI.md).
    """
    aplicar_no_cache_headers(response)
    db_url = obter_database_url()

    slug_base = req.slug or (
        re.sub(r"[^a-z0-9]+", "-", (req.tema or "analise-automatica").lower()).strip("-")[:80]
    )
    recurso_chave = f"evento_consolida:{slug_base}"

    status_kill_switch = "aguardando_revisao"
    if conn is not None:
        status_kill_switch = verificar_kill_switch_publicacao(conn, default_status="aguardando_revisao")

    publicacao_automatica_ativa = status_kill_switch == "ativo"

    if req.sincrono or req.dry_run:
        resultado = await _tarefa_background_gerar_coluna(
            tema=req.tema,
            recurso_chave=recurso_chave,
            db_url=db_url,
            dry_run=req.dry_run,
        )
        if not resultado:
            return {
                "ok": False,
                "status": "sem_documentos",
                "recurso_chave": recurso_chave,
                "tema": req.tema,
            }
        coluna_obj = resultado.get("coluna")
        auditoria_obj = resultado.get("auditoria")
        return {
            "ok": bool(resultado.get("aprovado")),
            "status": "concluido" if resultado.get("aprovado") else "reprovado_auditoria",
            "recurso_chave": recurso_chave,
            "tema": req.tema,
            "kill_switch_publicacao_automatica": publicacao_automatica_ativa,
            "status_revisao_inicial": "aguardando_revisao" if not publicacao_automatica_ativa else "publicado",
            "tentativas_reescrita": resultado.get("tentativas_reescrita", 0),
            "coluna": coluna_obj.model_dump() if hasattr(coluna_obj, "model_dump") else coluna_obj,
            "auditoria": auditoria_obj.model_dump() if hasattr(auditoria_obj, "model_dump") else auditoria_obj,
            "persistencia": resultado.get("persistencia"),
        }

    background_tasks.add_task(
        _tarefa_background_gerar_coluna,
        req.tema,
        recurso_chave,
        db_url,
        req.dry_run,
    )

    return {
        "ok": True,
        "status": "agendado_em_background",
        "recurso_chave": recurso_chave,
        "tema": req.tema,
        "slug_alvo": slug_base,
        "event_id": req.event_id,
        "model_id": "gemini-2.5-pro",
        "kill_switch_publicacao_automatica": publicacao_automatica_ativa,
        "status_revisao_inicial": "aguardando_revisao" if not publicacao_automatica_ativa else "publicado",
        "detalhe": (
            "Pipeline de 4 agentes (Pesquisador -> Advogado do Diabo -> Colunista -> Auditor) "
            "iniciado em BackgroundTasks."
        ),
    }


# ============================================================================
# 7. ROTA 4: GET /v2/colunas
# ============================================================================

@router.get("/v2/colunas")
def listar_colunas_editoriais(
    response: Response,
    status: Optional[str] = Query(None, description="Filtrar por status/review_status"),
    categoria: Optional[str] = Query(None, description="Filtrar por editoria do Atlas"),
    pais: Optional[str] = Query(None, description="Filtrar por código ISO ou nome do país"),
    limit: int = Query(20, ge=1, le=100, description="Quantidade máxima de colunas"),
    limite: Optional[int] = Query(None, ge=1, le=100, description="Alias para limit"),
    _t: Optional[str] = Query(None, description="Cache-busting timestamp"),
    refresh: Optional[str] = Query(None, description="Forçar refresh sem cache"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lista as colunas e análises geradas pelo pipeline editorial V2, ordenadas das mais recentes para as mais antigas."""
    aplicar_no_cache_headers(response)
    qtd_limite = limite if limite is not None else limit
    agora_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if conn is None:
        return {
            "ok": True,
            "cached": False,
            "source": "fallback_sem_banco",
            "identificacao_editorial": "Síntese Rodando o Mundo",
            "updatedAt": agora_iso,
            "total": 0,
            "colunas": [],
        }

    filtros: List[str] = []
    params: List[Any] = []

    if status:
        filtros.append("(status = %s OR review_status = %s)")
        params.extend([status, status])
    if categoria:
        filtros.append("categoria = %s")
        params.append(categoria)
    if pais:
        filtros.append("%s = ANY(paises_abordados)")
        params.append(pais.upper())

    params.append(qtd_limite)
    where_sql = f"WHERE {' AND '.join(filtros)}" if filtros else ""

    query = f"""
        SELECT
            slug, titulo, subtitulo, tese_central, corpo_markdown, resumo_seo,
            categoria, paises_abordados, tags, tempo_leitura_min,
            impactos_praticos, fontes_citadas, links_acervo_interno,
            auditoria_aprovada, aviso_correcao_material, model_id,
            status, review_status, published_at, created_at, updated_at
        FROM ai_colunas_editoriais
        {where_sql}
        ORDER BY COALESCE(published_at, created_at) DESC, updated_at DESC
        LIMIT %s;
    """

    colunas: List[Dict[str, Any]] = []
    try:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

        for r in rows:
            row_dict = dict(r)
            colunas.append({
                "slug": row_dict.get("slug"),
                "titulo": row_dict.get("titulo"),
                "subtitulo": row_dict.get("subtitulo"),
                "tese_central": row_dict.get("tese_central"),
                "corpo_markdown": row_dict.get("corpo_markdown"),
                "resumo_seo": row_dict.get("resumo_seo"),
                "categoria": row_dict.get("categoria"),
                "paises_abordados": list(row_dict.get("paises_abordados") or []),
                "tags": list(row_dict.get("tags") or []),
                "tempo_leitura_min": int(row_dict.get("tempo_leitura_min") or 5),
                "impactos_praticos": _decodificar_jsonb(row_dict.get("impactos_praticos"), []),
                "fontes_citadas": _decodificar_jsonb(row_dict.get("fontes_citadas"), []),
                "links_acervo_interno": _decodificar_jsonb(row_dict.get("links_acervo_interno"), []),
                "auditoria_aprovada": bool(row_dict.get("auditoria_aprovada", False)),
                "aviso_correcao_material": row_dict.get("aviso_correcao_material"),
                "identificacao_editorial": "Síntese Rodando o Mundo",
                "atualizado_em": _formatar_horario_editorial(row_dict.get("updated_at")),
                "status": row_dict.get("status") or row_dict.get("review_status"),
                "review_status": row_dict.get("review_status"),
                "published_at": _serializar_valor_temporal(row_dict.get("published_at")),
                "created_at": _serializar_valor_temporal(row_dict.get("created_at")),
                "updated_at": _serializar_valor_temporal(row_dict.get("updated_at")),
            })
    except Exception as e:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        print(f"[Aviso] Erro ao consultar ai_colunas_editoriais: {e}")

    return {
        "ok": True,
        "cached": False,
        "source": "database",
        "identificacao_editorial": "Síntese Rodando o Mundo",
        "updatedAt": agora_iso,
        "total": len(colunas),
        "colunas": colunas,
    }


# ============================================================================
# 8. ROTA 5: GET /v2/entenda-o-assunto/{slug}
# ============================================================================

def _montar_painel_verificacao_evento(
    conn: Any,
    slug_candidatos: List[str],
    bloco_entenda: Optional[Dict[str, Any]] = None,
    coluna_associada: Optional[Dict[str, Any]] = None,
) -> PainelVerificacaoEvento:
    """Constrói o `PainelVerificacaoEvento` (Camada 3 de `docs/arquitetura_v2.md`)
    separando estritamente `coberturas_imprensa` e `documentos_oficiais`,
    respeitando `exibicao_permitida` e sem expor IDs ou hashes internos.
    """
    slug_principal = slug_candidatos[0]
    afirmacoes: List[EvidenciaResolvidaPublica] = []
    coberturas_imprensa: List[CoberturaPublica] = []
    documentos_oficiais: List[CoberturaPublica] = []
    historico_alteracoes: List[str] = []

    if conn is not None:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, slug, aviso_correcao_material
                    FROM ai_eventos
                    WHERE slug = ANY(%s)
                    LIMIT 1;
                    """,
                    (slug_candidatos,),
                )
                ev_row = cur.fetchone()

                if ev_row:
                    ev_id = ev_row["id"]
                    if ev_row.get("aviso_correcao_material"):
                        historico_alteracoes.append(f"Errata / Correção Material: {ev_row['aviso_correcao_material']}")

                    # 1. Evidências resolvidas (sem expor id, documento_id ou content_hash)
                    cur.execute(
                        """
                        SELECT
                            ev.afirmacao_publicada,
                            ev.parafrase_suporte,
                            ev.fonte_atribuida,
                            ev.fonte_tipo,
                            d.published_at,
                            d.fetched_at,
                            COALESCE(d.canonical_url, '') AS url_original
                        FROM ai_evidencias ev
                        LEFT JOIN ai_documentos_coletados d ON d.id = ev.documento_id
                        WHERE ev.event_id = %s
                        ORDER BY ev.id ASC;
                        """,
                        (ev_id,),
                    )
                    for row_ev in cur.fetchall():
                        afirmacoes.append(
                            EvidenciaResolvidaPublica(
                                afirmacao_publicada=str(row_ev.get("afirmacao_publicada") or ""),
                                parafrase_suporte=str(row_ev.get("parafrase_suporte") or ""),
                                fonte_nome=str(row_ev.get("fonte_atribuida") or "Fonte Oficial"),
                                fonte_tipo=str(row_ev.get("fonte_tipo") or "veiculo_imprensa"),
                                publicado_em=_serializar_valor_temporal(row_ev.get("published_at")),
                                consultado_em=_serializar_valor_temporal(row_ev.get("fetched_at"))
                                or datetime.now(timezone.utc).isoformat(),
                                url_original=str(row_ev.get("url_original") or ""),
                            )
                        )

                    # 2. Coberturas separadas entre imprensa e documentos oficiais
                    cur.execute(
                        """
                        SELECT
                            c.veiculo_nome, c.pais_veiculo, c.fonte_tipo,
                            c.manchete_original, c.enfoque_identificado, c.url_original,
                            COALESCE(f.exibicao_permitida, 'sintese_e_link') AS exibicao_permitida
                        FROM ai_coberturas_por_veiculo c
                        LEFT JOIN ai_documentos_coletados d ON d.id = c.documento_id
                        LEFT JOIN ai_fontes_referencia f ON f.id = d.source_id
                        WHERE c.event_id = %s
                        ORDER BY c.peso_confianca DESC, c.published_at DESC NULLS LAST;
                        """,
                        (ev_id,),
                    )
                    for cob in cur.fetchall():
                        ft = (cob.get("fonte_tipo") or "veiculo_imprensa").strip()
                        cob_pub = _aplicar_politica_exibicao_cobertura(dict(cob), eh_fallback_oficial=False)
                        if ft in ("fonte_primaria", "youtube_rss"):
                            documentos_oficiais.append(cob_pub)
                        else:
                            coberturas_imprensa.append(cob_pub)

                    # 3. Histórico público de alterações
                    cur.execute(
                        """
                        SELECT nota_historico_publico, generated_at
                        FROM ai_conteudos_gerados
                        WHERE event_id = %s AND nota_historico_publico IS NOT NULL
                        ORDER BY versao DESC;
                        """,
                        (ev_id,),
                    )
                    for hist in cur.fetchall():
                        nota = (hist.get("nota_historico_publico") or "").strip()
                        if nota:
                            historico_alteracoes.append(nota)
        except Exception:  # noqa: BLE001
            try:
                conn.rollback()
            except Exception:  # noqa: BLE001
                pass

    return PainelVerificacaoEvento(
        slug=slug_principal,
        afirmacoes_verificadas=afirmacoes,
        coberturas_imprensa=coberturas_imprensa,
        documentos_oficiais=documentos_oficiais,
        historico_publico_alteracoes=historico_alteracoes,
    )


@router.get("/v2/entenda-o-assunto/{slug}")
def obter_entenda_o_assunto_por_slug(
    slug: str,
    response: Response,
    _t: Optional[str] = Query(None, description="Cache-busting timestamp"),
    refresh: Optional[str] = Query(None, description="Forçar refresh sem cache"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Retorna o dossiê contextual ('Entenda o Assunto' / 'Entenda o Contexto'), a coluna analítica
    relacionada e o Painel Único de Verificação (`coberturas_imprensa` vs. `documentos_oficiais`).

    Levanta 404 HTTPException caso o `{slug}` não exista no banco de dados.
    """
    aplicar_no_cache_headers(response)
    slug_limpo = slug.strip().strip("/")
    sem_prefixo = slug_limpo.removeprefix("entenda-")
    com_prefixo = f"entenda-{sem_prefixo}"
    slug_candidatos = list(dict.fromkeys([slug_limpo, com_prefixo, sem_prefixo]))

    if conn is None:
        raise HTTPException(
            status_code=404,
            detail=f"Assunto ou dossiê contextual '{slug_limpo}' não encontrado.",
        )

    bloco_entenda: Optional[Dict[str, Any]] = None
    coluna_associada: Optional[Dict[str, Any]] = None
    evento_associado: Optional[Dict[str, Any]] = None

    try:
        with conn.cursor() as cur:
            # 1. Busca em ai_entenda_o_assunto
            cur.execute(
                """
                SELECT
                    slug, titulo_assunto, pergunta_central, resumo_executivo,
                    contexto_historico, categoria, paises_relacionados, tags,
                    impactos_praticos, perguntas_frequentes, fontes_referencia,
                    links_acervo_interno, relevancia_score, status, updated_at
                FROM ai_entenda_o_assunto
                WHERE slug = ANY(%s)
                ORDER BY updated_at DESC
                LIMIT 1;
                """,
                (slug_candidatos,),
            )
            row_entenda = cur.fetchone()
            if row_entenda:
                d = dict(row_entenda)
                bloco_entenda = {
                    "slug": d.get("slug"),
                    "titulo_assunto": d.get("titulo_assunto"),
                    "pergunta_central": d.get("pergunta_central"),
                    "resumo_executivo": d.get("resumo_executivo"),
                    "contexto_historico": d.get("contexto_historico"),
                    "categoria": d.get("categoria"),
                    "paises_relacionados": list(d.get("paises_relacionados") or []),
                    "tags": list(d.get("tags") or []),
                    "impactos_praticos": _decodificar_jsonb(d.get("impactos_praticos"), []),
                    "perguntas_frequentes": _decodificar_jsonb(d.get("perguntas_frequentes"), []),
                    "fontes_referencia": _decodificar_jsonb(d.get("fontes_referencia"), []),
                    "links_acervo_interno": _decodificar_jsonb(d.get("links_acervo_interno"), []),
                    "relevancia_score": int(d.get("relevancia_score") or 85),
                    "identificacao_editorial": "Síntese Rodando o Mundo",
                    "atualizado_em": _formatar_horario_editorial(d.get("updated_at")),
                    "updated_at": _serializar_valor_temporal(d.get("updated_at")),
                }

            # 2. Busca coluna associada em ai_colunas_editoriais
            cur.execute(
                """
                SELECT
                    slug, titulo, subtitulo, tese_central, corpo_markdown,
                    resumo_seo, categoria, paises_abordados, tags,
                    tempo_leitura_min, impactos_praticos, fontes_citadas,
                    links_acervo_interno, aviso_correcao_material,
                    status, review_status, published_at, updated_at
                FROM ai_colunas_editoriais
                WHERE slug = ANY(%s)
                ORDER BY updated_at DESC
                LIMIT 1;
                """,
                (slug_candidatos,),
            )
            row_col = cur.fetchone()
            if row_col:
                c = dict(row_col)
                coluna_associada = {
                    "slug": c.get("slug"),
                    "titulo": c.get("titulo"),
                    "subtitulo": c.get("subtitulo"),
                    "tese_central": c.get("tese_central"),
                    "corpo_markdown": c.get("corpo_markdown"),
                    "resumo_seo": c.get("resumo_seo"),
                    "categoria": c.get("categoria"),
                    "paises_abordados": list(c.get("paises_abordados") or []),
                    "tags": list(c.get("tags") or []),
                    "tempo_leitura_min": int(c.get("tempo_leitura_min") or 5),
                    "impactos_praticos": _decodificar_jsonb(c.get("impactos_praticos"), []),
                    "fontes_citadas": _decodificar_jsonb(c.get("fontes_citadas"), []),
                    "links_acervo_interno": _decodificar_jsonb(c.get("links_acervo_interno"), []),
                    "aviso_correcao_material": c.get("aviso_correcao_material"),
                    "identificacao_editorial": "Síntese Rodando o Mundo",
                    "atualizado_em": _formatar_horario_editorial(c.get("updated_at")),
                    "published_at": _serializar_valor_temporal(c.get("published_at")),
                    "updated_at": _serializar_valor_temporal(c.get("updated_at")),
                }

            # 3. Verifica se existe evento direto em ai_eventos
            cur.execute(
                """
                SELECT slug, titulo_evento, categoria, paises_envolvidos,
                       urgencia_score, relevancia_score, nivel_confianca,
                       aviso_correcao_material, updated_at
                FROM ai_eventos
                WHERE slug = ANY(%s)
                LIMIT 1;
                """,
                (slug_candidatos,),
            )
            row_ev = cur.fetchone()
            if row_ev:
                evento_associado = dict(row_ev)
                evento_associado["updated_at"] = _serializar_valor_temporal(evento_associado.get("updated_at"))
    except Exception as e:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        print(f"[Aviso] Erro ao consultar entenda-o-assunto para '{slug_limpo}': {e}")

    if bloco_entenda is None and coluna_associada is None and evento_associado is None:
        raise HTTPException(
            status_code=404,
            detail=f"Assunto ou evento '{slug_limpo}' não encontrado.",
        )

    # Caso exista apenas coluna ou evento, sintetiza o bloco entenda_o_assunto correspondente
    if bloco_entenda is None and coluna_associada is not None:
        bloco_entenda = {
            "slug": coluna_associada["slug"],
            "titulo_assunto": f"Entenda: {coluna_associada['titulo']}",
            "pergunta_central": coluna_associada["subtitulo"],
            "resumo_executivo": coluna_associada["subtitulo"],
            "contexto_historico": coluna_associada["tese_central"],
            "categoria": coluna_associada["categoria"],
            "paises_relacionados": coluna_associada["paises_abordados"],
            "tags": coluna_associada["tags"],
            "impactos_praticos": coluna_associada["impactos_praticos"],
            "perguntas_frequentes": [],
            "fontes_referencia": coluna_associada["fontes_citadas"],
            "links_acervo_interno": coluna_associada["links_acervo_interno"],
            "relevancia_score": 90,
            "identificacao_editorial": "Síntese Rodando o Mundo",
            "atualizado_em": coluna_associada["atualizado_em"],
            "updated_at": coluna_associada["updated_at"],
        }
    elif bloco_entenda is None and evento_associado is not None:
        bloco_entenda = {
            "slug": evento_associado["slug"],
            "titulo_assunto": evento_associado["titulo_evento"],
            "pergunta_central": f"O que está acontecendo em: {evento_associado['titulo_evento']}",
            "resumo_executivo": evento_associado["titulo_evento"],
            "contexto_historico": evento_associado["titulo_evento"],
            "categoria": evento_associado["categoria"],
            "paises_relacionados": list(evento_associado.get("paises_envolvidos") or []),
            "tags": [],
            "impactos_praticos": [],
            "perguntas_frequentes": [],
            "fontes_referencia": [],
            "links_acervo_interno": [],
            "relevancia_score": int(evento_associado.get("relevancia_score") or 85),
            "identificacao_editorial": "Síntese Rodando o Mundo",
            "atualizado_em": _formatar_horario_editorial(evento_associado.get("updated_at")),
            "updated_at": evento_associado.get("updated_at"),
        }

    painel_verificacao = _montar_painel_verificacao_evento(
        conn,
        slug_candidatos=slug_candidatos,
        bloco_entenda=bloco_entenda,
        coluna_associada=coluna_associada,
    )

    return {
        "ok": True,
        "slug": slug_limpo,
        "identificacao_editorial": "Síntese Rodando o Mundo",
        "entenda_o_assunto": bloco_entenda,
        "coluna_editorial": coluna_associada,
        "painel_verificacao": painel_verificacao.model_dump(),
    }


# ============================================================================
# 9. ADMIN LITE — INTELIGÊNCIA & ATLAS (/v2/admin/*)
# ============================================================================

def _carregar_admins_configurados() -> Dict[str, str]:
    """
    Carrega o mapa {nome_admin: senha} a partir de ADMIN_USERS
    (aceita JSON '{"user":"senha"}' ou pares 'user:senha,user2:senha2').
    """
    raw = (os.getenv("ADMIN_USERS") or "").strip()
    if not raw:
        return {}
    if raw.startswith("{"):
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                return {
                    str(k).strip(): str(v).strip()
                    for k, v in data.items()
                    if str(k).strip() and str(v).strip()
                }
        except Exception:
            pass
    admins: Dict[str, str] = {}
    for item in raw.split(","):
        if ":" in item:
            user, pwd = item.split(":", 1)
            user, pwd = user.strip(), pwd.strip()
            if user and pwd:
                admins[user] = pwd
    return admins


def verificar_admin_token(
    authorization: Optional[str] = Header(default=None),
    x_admin_user: Optional[str] = Header(default=None, alias="X-Admin-User"),
) -> None:
    """
    Autenticação Bearer para rotas /v2/admin/*:
    - Aceita o token de máquina (CURADORIA_SECRET_TOKEN / ADMIN_SECRET_TOKEN) sem precisar de nome de usuário.
    - Aceita nome de admin + senha (X-Admin-User + Bearer <senha>) configurados em ADMIN_USERS.
    - Mantém fallback para ADMIN_PASSWORD / ADMIN_SENHA quando ADMIN_USERS não estiver definido.
    """
    token_esperado = (
        os.getenv("CURADORIA_SECRET_TOKEN")
        or os.getenv("ADMIN_SECRET_TOKEN")
        or ""
    ).strip()
    senha_esperada = (
        os.getenv("ADMIN_PASSWORD")
        or os.getenv("ADMIN_SENHA")
        or ""
    ).strip()
    admins = _carregar_admins_configurados()

    if not token_esperado and not senha_esperada and not admins:
        raise HTTPException(
            status_code=503,
            detail="Nenhuma credencial administrativa (CURADORIA_SECRET_TOKEN, ADMIN_USERS ou ADMIN_PASSWORD) configurada no servidor.",
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token ou senha Bearer ausente ou inválido.")

    credencial = authorization.removeprefix("Bearer ").strip()
    usuario = (x_admin_user or "").strip()

    if usuario:
        if admins:
            senha_usuario = admins.get(usuario, "")
            if senha_usuario and secrets.compare_digest(credencial, senha_usuario):
                return
            raise HTTPException(status_code=403, detail="Nome de admin ou senha incorretos.")
        valido_fallback = (
            (bool(token_esperado) and secrets.compare_digest(credencial, token_esperado))
            or (bool(senha_esperada) and secrets.compare_digest(credencial, senha_esperada))
        )
        if valido_fallback:
            return
        raise HTTPException(status_code=403, detail="Nome de admin ou senha incorretos.")

    # Sem X-Admin-User: aceita token de máquina (Dashboard / scripts / cron)
    if token_esperado and secrets.compare_digest(credencial, token_esperado):
        return

    # Sem X-Admin-User e sem ADMIN_USERS: aceita ADMIN_PASSWORD legado
    if not admins and senha_esperada and secrets.compare_digest(credencial, senha_esperada):
        return

    if admins:
        raise HTTPException(status_code=403, detail="Informe o nome do admin e a senha (ou o token oficial).")
    raise HTTPException(status_code=403, detail="Senha ou token não autorizado.")


def _require_db(conn: Any) -> Any:
    if conn is None:
        raise HTTPException(status_code=503, detail="Banco de dados PostgreSQL indisponível.")
    return conn


class AdminKillSwitchRequest(BaseModel):
    ativo: bool


class AdminFonteCreateRequest(BaseModel):
    nome: str = Field(min_length=2, max_length=150)
    url: str = Field(min_length=8, max_length=2000)
    tipo_fonte: Literal["rss_feed", "artigo_avulso", "fonte_primaria", "youtube_rss"]
    cadencia: Literal["pulso_30m", "ciclo_3h"]
    peso_confianca: int = Field(default=3, ge=1, le=5)
    aprovar_imediato: bool = False


class AdminFonteAtivoRequest(BaseModel):
    ativo: bool


class AdminEventoStatusRequest(BaseModel):
    status: Literal["aguardando_revisao", "publicado", "arquivado"]


class AdminEditarSinteseRequest(BaseModel):
    sintese_com_ressalvas: str = Field(min_length=10, max_length=8000)
    tipo_alteracao: Literal["ajuste_menor", "correcao_material"]
    errata: Optional[str] = Field(default=None, max_length=1000)


@router.get("/v2/admin/config/kill-switch", dependencies=[Depends(verificar_admin_token)])
def admin_obter_kill_switch(
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lê o estado atual do Kill Switch (`publicacao_automatica_ativa`) em `ai_config_operacional`."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT valor, updated_at
            FROM ai_config_operacional
            WHERE chave = 'publicacao_automatica_ativa'
            LIMIT 1;
            """
        )
        row = cur.fetchone()
    ativo = bool(row and str(row.get("valor") or "").strip().lower() == "true")
    return {
        "ok": True,
        "publicacao_automatica_ativa": ativo,
        "updated_at": _serializar_valor_temporal(row.get("updated_at")) if row else None,
    }


@router.post("/v2/admin/config/kill-switch", dependencies=[Depends(verificar_admin_token)])
def admin_atualizar_kill_switch(
    payload: AdminKillSwitchRequest,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Liga ou desliga `publicacao_automatica_ativa` em `ai_config_operacional`."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    valor_str = "true" if payload.ativo else "false"
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ai_config_operacional (chave, valor, updated_at)
            VALUES ('publicacao_automatica_ativa', %s, NOW())
            ON CONFLICT (chave) DO UPDATE
            SET valor = EXCLUDED.valor, updated_at = NOW()
            RETURNING updated_at;
            """,
            (valor_str,),
        )
        row = cur.fetchone()
    db.commit()
    return {
        "ok": True,
        "publicacao_automatica_ativa": payload.ativo,
        "updated_at": _serializar_valor_temporal(row.get("updated_at")) if row else None,
    }


@router.post("/v2/admin/coleta/executar", dependencies=[Depends(verificar_admin_token)])
async def admin_executar_coleta_agora(
    response: Response,
    payload_req: Optional[ExecutarPulsoRequest] = Body(default=None),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Dispara a coleta manual reutilizando exatamente a função protegida por `pg_try_advisory_lock`."""
    return await executar_noticias_quentes_manual(
        response=response,
        payload_req=payload_req,
        dry_run_query=False,
        conn=conn,
    )


def _coletar_fontes_codigo() -> List[Dict[str, Any]]:
    """Reúne todas as fontes configuradas em `coletor_estudo.py` e `config/sources.json`."""
    from pathlib import Path
    from redacao_v2.coletor_estudo import FONTES_ESTUDO_V2, FONTES_NOTICIAS_QUENTES_30MIN

    combinadas: Dict[str, Dict[str, Any]] = {}
    for item in list(FONTES_NOTICIAS_QUENTES_30MIN) + list(FONTES_ESTUDO_V2):
        url = str(item.get("url") or "").strip()
        if not url or url in combinadas:
            continue
        combinadas[url] = {
            "nome": str(item.get("nome") or "Fonte").strip(),
            "url": url,
            "pais_iso": str(item.get("pais_iso") or "BR").strip()[:2].upper(),
            "regiao": str(item.get("regiao") or "Global").strip(),
            "idioma": str(item.get("idioma") or "pt").strip(),
            "tipo_fonte": str(item.get("tipo_fonte") or "rss_feed").strip(),
            "cadencia": str(item.get("cadencia") or "ciclo_3h").strip(),
            "peso_confianca": int(item.get("peso_confianca") or 4),
            "politica_uso_status": str(item.get("politica_uso_status") or "aprovada").strip(),
            "coleta_permitida": bool(item.get("coleta_permitida", True)),
            "armazenamento_permitido": str(item.get("armazenamento_permitido") or "apenas_metadados").strip(),
            "exibicao_permitida": str(item.get("exibicao_permitida") or "sintese_e_link").strip(),
            "atribuicao_exigida": str(item.get("atribuicao_exigida") or item.get("nome") or "").strip(),
            "referencia_condicoes_uso": item.get("referencia_condicoes_uso"),
        }

    sources_json_path = Path(__file__).resolve().parents[1] / "config" / "sources.json"
    if sources_json_path.exists():
        try:
            raw_sources = json.loads(sources_json_path.read_text(encoding="utf-8"))
            for s in raw_sources:
                tipo = str(s.get("tipo") or "rss").strip().lower()
                id_ou_url = str(s.get("id_ou_url") or "").strip()
                if not id_ou_url:
                    continue
                if tipo == "youtube":
                    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={id_ou_url}"
                    tipo_fonte = "youtube_rss"
                else:
                    url = id_ou_url
                    tipo_fonte = "rss_feed"
                if url in combinadas:
                    continue
                nome = str(s.get("nome") or "Fonte").strip()
                categoria = str(s.get("categoria") or "geral").strip().lower()
                regiao = "Global" if categoria == "geopolitica" else "America_do_Sul"
                combinadas[url] = {
                    "nome": nome,
                    "url": url,
                    "pais_iso": "BR",
                    "regiao": regiao,
                    "idioma": "pt",
                    "tipo_fonte": tipo_fonte,
                    "cadencia": "ciclo_3h",
                    "peso_confianca": 4,
                    "politica_uso_status": "aprovada",
                    "coleta_permitida": True,
                    "armazenamento_permitido": "apenas_metadados",
                    "exibicao_permitida": "sintese_e_link",
                    "atribuicao_exigida": nome,
                    "referencia_condicoes_uso": s.get("url_canal"),
                }
        except Exception:  # noqa: BLE001
            pass

    return list(combinadas.values())


def sincronizar_fontes_sistema(db: Any) -> int:
    """Insere novas fontes do código em `ai_fontes_referencia` preservando registros existentes."""
    fontes = _coletar_fontes_codigo()
    inseridas = 0
    with db.cursor() as cur:
        for f in fontes:
            cur.execute(
                """
                INSERT INTO ai_fontes_referencia (
                    nome, url, pais_iso, regiao, idioma, tipo_fonte, cadencia,
                    peso_confianca, politica_uso_status, coleta_permitida,
                    armazenamento_permitido, exibicao_permitida, atribuicao_exigida,
                    referencia_condicoes_uso,
                    revisado_por, revisado_em, ativo
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s,
                    'Sistema RoM (Auto-Sync)', NOW(), TRUE
                )
                ON CONFLICT (url) DO NOTHING
                RETURNING id;
                """,
                (
                    f["nome"],
                    f["url"],
                    f["pais_iso"],
                    f["regiao"],
                    f["idioma"],
                    f["tipo_fonte"],
                    f["cadencia"],
                    f["peso_confianca"],
                    f["politica_uso_status"],
                    f["coleta_permitida"],
                    f["armazenamento_permitido"],
                    f["exibicao_permitida"],
                    f["atribuicao_exigida"],
                    f.get("referencia_condicoes_uso"),
                ),
            )
            if cur.fetchone():
                inseridas += 1
    if inseridas > 0:
        db.commit()
    return inseridas


@router.get("/v2/admin/fontes", dependencies=[Depends(verificar_admin_token)])
def admin_listar_fontes(
    response: Response,
    auto_sync: bool = Query(default=True),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lista fontes cadastradas em `ai_fontes_referencia`, sincronizando automaticamente novidades do código."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    novas_sincronizadas = 0
    if auto_sync:
        try:
            novas_sincronizadas = sincronizar_fontes_sistema(db)
        except Exception:  # noqa: BLE001
            db.rollback()

    with db.cursor() as cur:
        cur.execute(
            """
            SELECT id, nome, url, tipo_fonte, cadencia, peso_confianca,
                   politica_uso_status, coleta_permitida, ativo, revisado_por,
                   ultima_coleta_at, created_at
            FROM ai_fontes_referencia
            ORDER BY id DESC
            LIMIT 500;
            """
        )
        rows = cur.fetchall()
    fontes = [
        {
            **dict(r),
            "ultima_coleta_at": _serializar_valor_temporal(r.get("ultima_coleta_at")),
            "created_at": _serializar_valor_temporal(r.get("created_at")),
        }
        for r in rows
    ]
    return {"ok": True, "fontes": fontes, "novas_sincronizadas": novas_sincronizadas}


@router.post("/v2/admin/fontes/sincronizar", dependencies=[Depends(verificar_admin_token)])
def admin_sincronizar_fontes(
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Sincroniza manualmente as fontes de `coletor_estudo.py` e `config/sources.json` com `ai_fontes_referencia`."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    inseridas = sincronizar_fontes_sistema(db)
    return {"ok": True, "novas_inseridas": inseridas}


@router.post("/v2/admin/fontes", dependencies=[Depends(verificar_admin_token)])
def admin_criar_fonte(
    payload: AdminFonteCreateRequest,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Cadastra uma fonte em `ai_fontes_referencia` com opção de aprovação imediata."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    url_limpa = payload.url.strip()
    if not (url_limpa.startswith("http://") or url_limpa.startswith("https://")):
        raise HTTPException(status_code=422, detail="URL deve começar com http:// ou https://")

    politica_status = "aprovada" if payload.aprovar_imediato else "pendente"
    coleta_permitida = bool(payload.aprovar_imediato)
    revisado_por = "Revisado por Equipe RoM" if payload.aprovar_imediato else None
    revisado_em = datetime.now(timezone.utc) if payload.aprovar_imediato else None

    try:
        with db.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ai_fontes_referencia (
                    nome, url, tipo_fonte, cadencia, peso_confianca,
                    politica_uso_status, coleta_permitida, armazenamento_permitido,
                    exibicao_permitida, revisado_por, revisado_em, ativo
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, 'apenas_metadados',
                    'sintese_e_link', %s, %s, TRUE
                )
                RETURNING id, nome, url, tipo_fonte, cadencia, peso_confianca,
                          politica_uso_status, coleta_permitida, ativo, revisado_por, created_at;
                """,
                (
                    payload.nome.strip(),
                    url_limpa,
                    payload.tipo_fonte,
                    payload.cadencia,
                    payload.peso_confianca,
                    politica_status,
                    coleta_permitida,
                    revisado_por,
                    revisado_em,
                ),
            )
            row = cur.fetchone()
        db.commit()
    except psycopg.errors.UniqueViolation as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe uma fonte cadastrada com esta URL.") from exc

    fonte = dict(row) if row else {}
    if "created_at" in fonte:
        fonte["created_at"] = _serializar_valor_temporal(fonte["created_at"])
    return {"ok": True, "fonte": fonte}


@router.patch("/v2/admin/fontes/{fonte_id}/ativo", dependencies=[Depends(verificar_admin_token)])
def admin_alternar_fonte_ativo(
    fonte_id: int,
    payload: AdminFonteAtivoRequest,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Ativa ou desativa rapidamente uma fonte em `ai_fontes_referencia`."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    with db.cursor() as cur:
        cur.execute(
            """
            UPDATE ai_fontes_referencia
            SET ativo = %s
            WHERE id = %s
            RETURNING id, ativo;
            """,
            (payload.ativo, fonte_id),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Fonte não encontrada.")
    db.commit()
    return {"ok": True, "id": row["id"], "ativo": row["ativo"]}


@router.delete("/v2/admin/fontes/{fonte_id}", dependencies=[Depends(verificar_admin_token)])
def admin_excluir_fonte(
    fonte_id: int,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Exclui uma fonte de `ai_fontes_referencia`."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    try:
        with db.cursor() as cur:
            cur.execute(
                "DELETE FROM ai_fontes_referencia WHERE id = %s RETURNING id;",
                (fonte_id,),
            )
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Fonte não encontrada.")
        db.commit()
    except psycopg.errors.ForeignKeyViolation as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Fonte possui documentos coletados vinculados; desative-a em vez de excluir.",
        ) from exc
    return {"ok": True, "id": fonte_id}


@router.get("/v2/admin/eventos", dependencies=[Depends(verificar_admin_token)])
def admin_listar_eventos(
    response: Response,
    limite: int = Query(30, ge=1, le=100),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lista os últimos eventos de `ai_eventos` com a síntese mais recente."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT
                e.id, e.slug, e.titulo_evento, e.categoria, e.nivel_confianca,
                e.status, e.aviso_correcao_material, e.updated_at,
                (
                    SELECT cg.payload_json->>'sintese_com_ressalvas'
                    FROM ai_conteudos_gerados cg
                    WHERE cg.event_id = e.id
                    ORDER BY cg.versao DESC
                    LIMIT 1
                ) AS sintese_com_ressalvas
            FROM ai_eventos e
            ORDER BY e.updated_at DESC, e.id DESC
            LIMIT %s;
            """,
            (limite,),
        )
        rows = cur.fetchall()
    eventos = [
        {
            **dict(r),
            "updated_at": _serializar_valor_temporal(r.get("updated_at")),
        }
        for r in rows
    ]
    return {"ok": True, "eventos": eventos}


@router.patch("/v2/admin/eventos/{event_id}/status", dependencies=[Depends(verificar_admin_token)])
def admin_atualizar_status_evento(
    event_id: int,
    payload: AdminEventoStatusRequest,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Altera o status de um evento (`publicado`, `arquivado`, `aguardando_revisao`)."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    with db.cursor() as cur:
        cur.execute(
            """
            UPDATE ai_eventos
            SET status = %s, updated_at = NOW()
            WHERE id = %s
            RETURNING id, status, updated_at;
            """,
            (payload.status, event_id),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    db.commit()
    return {
        "ok": True,
        "id": row["id"],
        "status": row["status"],
        "updated_at": _serializar_valor_temporal(row.get("updated_at")),
    }


@router.patch("/v2/admin/eventos/{event_id}/sintese", dependencies=[Depends(verificar_admin_token)])
def admin_editar_sintese_evento(
    event_id: int,
    payload: AdminEditarSinteseRequest,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Salva nova versão da síntese em `ai_conteudos_gerados` e registra errata se `correcao_material`."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    errata_limpa = (payload.errata or "").strip()
    if payload.tipo_alteracao == "correcao_material" and not errata_limpa:
        raise HTTPException(
            status_code=422,
            detail="Informe o texto da errata quando selecionar 'correcao_material'.",
        )

    with db.cursor() as cur:
        cur.execute("SELECT id FROM ai_eventos WHERE id = %s LIMIT 1;", (event_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Evento não encontrado.")

        cur.execute(
            """
            SELECT tipo_conteudo, versao, payload_json, evidence_ids, model_id, prompt_version
            FROM ai_conteudos_gerados
            WHERE event_id = %s
            ORDER BY versao DESC
            LIMIT 1;
            """,
            (event_id,),
        )
        ultimo = cur.fetchone()

        nova_versao = int(ultimo["versao"]) + 1 if ultimo else 1
        tipo_conteudo = (ultimo.get("tipo_conteudo") if ultimo else None) or "sintese_comparada"
        payload_atual = _decodificar_jsonb(ultimo.get("payload_json") if ultimo else None, {})
        if not isinstance(payload_atual, dict):
            payload_atual = {}
        payload_atual["sintese_com_ressalvas"] = payload.sintese_com_ressalvas.strip()

        evidence_ids = list(ultimo.get("evidence_ids") or []) if ultimo else []
        model_id = (ultimo.get("model_id") if ultimo else None) or "manual_admin"
        prompt_version = (ultimo.get("prompt_version") if ultimo else None) or "admin_lite_v1"
        nota_publica = (
            f"Correção material: {errata_limpa}"
            if payload.tipo_alteracao == "correcao_material"
            else "Ajuste menor de redação"
        )

        cur.execute(
            """
            INSERT INTO ai_conteudos_gerados (
                event_id, tipo_conteudo, versao, tipo_alteracao,
                nota_historico_publico, payload_json, evidence_ids,
                model_id, prompt_version, review_status, reviewed_by
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, 'publicado', 'Equipe RoM'
            )
            RETURNING versao;
            """,
            (
                event_id,
                tipo_conteudo,
                nova_versao,
                payload.tipo_alteracao,
                nota_publica,
                Jsonb(payload_atual),
                evidence_ids,
                model_id,
                prompt_version,
            ),
        )

        if payload.tipo_alteracao == "correcao_material":
            cur.execute(
                """
                UPDATE ai_eventos
                SET aviso_correcao_material = %s, updated_at = NOW()
                WHERE id = %s;
                """,
                (errata_limpa, event_id),
            )
        else:
            cur.execute(
                "UPDATE ai_eventos SET updated_at = NOW() WHERE id = %s;",
                (event_id,),
            )

    db.commit()
    return {
        "ok": True,
        "event_id": event_id,
        "versao": nova_versao,
        "tipo_alteracao": payload.tipo_alteracao,
        "aviso_correcao_material": errata_limpa if payload.tipo_alteracao == "correcao_material" else None,
    }


# ============================================================================
# 15. BUSCA CONTEXTUAL POR PAÍS: /v2/sugestoes-contextuais & /v2/artigos-por-assunto
# ============================================================================

_SUGESTOES_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_SUGESTOES_CACHE_TTL_SEC = 120.0

_SIGLAS_PRESERVAR = {
    "mei", "stf", "tse", "eua", "usa", "faa", "pib", "onu", "un", "ia", "ai",
    "otan", "nato", "brics", "ue", "eu", "g7", "g20", "fmi", "oms", "bce",
    "fed", "ibge", "inss", "sus", "das", "pix", "cop", "asean", "mercosul",
}

_BLOCOS_POR_PAIS: Dict[str, Tuple[List[str], List[str]]] = {
    # ISO-2 -> (códigos de bloco/organização em paises_envolvidos, termos textuais indiretos)
    "BR": (["UN", "BRICS", "MERCOSUL", "LATAM"], ["brasil", "américa do sul", "américa latina", "mercosul", "brics", "g20"]),
    "AR": (["UN", "MERCOSUL", "LATAM"], ["argentina", "américa do sul", "américa latina", "mercosul", "g20"]),
    "UY": (["UN", "MERCOSUL", "LATAM"], ["uruguai", "américa do sul", "mercosul"]),
    "PY": (["UN", "MERCOSUL", "LATAM"], ["paraguai", "américa do sul", "mercosul"]),
    "CL": (["UN", "LATAM"], ["chile", "américa do sul", "américa latina"]),
    "CO": (["UN", "LATAM"], ["colômbia", "américa do sul", "américa latina"]),
    "PE": (["UN", "LATAM"], ["peru", "américa do sul", "américa latina"]),
    "EC": (["UN", "LATAM"], ["equador", "américa do sul", "américa latina"]),
    "BO": (["UN", "MERCOSUL", "LATAM"], ["bolívia", "américa do sul", "mercosul"]),
    "VE": (["UN", "LATAM"], ["venezuela", "américa do sul", "américa latina"]),
    "MX": (["UN", "LATAM"], ["méxico", "américa do norte", "américa latina", "usmca"]),
    "US": (["UN", "OTAN", "NATO", "G7"], ["estados unidos", "eua", "américa do norte", "otan", "g7", "g20"]),
    "CA": (["UN", "OTAN", "NATO", "G7"], ["canadá", "américa do norte", "otan", "g7", "g20"]),
    "FR": (["EU", "UN", "OTAN", "NATO", "G7"], ["frança", "união europeia", "europa", "eurozona", "otan", "g7"]),
    "DE": (["EU", "UN", "OTAN", "NATO", "G7"], ["alemanha", "união europeia", "europa", "eurozona", "otan", "g7"]),
    "IT": (["EU", "UN", "OTAN", "NATO", "G7"], ["itália", "união europeia", "europa", "eurozona", "otan", "g7"]),
    "ES": (["EU", "UN", "OTAN", "NATO"], ["espanha", "união europeia", "europa", "eurozona", "otan"]),
    "PT": (["EU", "UN", "OTAN", "NATO"], ["portugal", "união europeia", "europa", "eurozona", "otan"]),
    "GB": (["UN", "OTAN", "NATO", "G7"], ["reino unido", "europa", "otan", "g7"]),
    "UA": (["EU", "UN", "OTAN"], ["ucrânia", "europa", "otan", "união europeia"]),
    "RU": (["UN", "BRICS"], ["rússia", "brics", "eurásia"]),
    "CN": (["UN", "BRICS"], ["china", "brics", "ásia", "indo-pacífico", "g20"]),
    "JP": (["UN", "G7"], ["japão", "ásia", "indo-pacífico", "g7", "g20"]),
    "KR": (["UN"], ["coreia do sul", "ásia", "indo-pacífico", "g20"]),
    "IN": (["UN", "BRICS"], ["índia", "brics", "ásia", "indo-pacífico", "g20"]),
    "PH": (["UN", "ASEAN"], ["filipinas", "asean", "ásia", "indo-pacífico"]),
    "SG": (["UN", "ASEAN"], ["singapura", "cingapura", "asean", "ásia", "indo-pacífico"]),
    "AU": (["UN"], ["austrália", "oceania", "indo-pacífico", "g20"]),
    "ZA": (["UN", "BRICS"], ["áfrica do sul", "áfrica", "brics", "g20"]),
    "IL": (["UN"], ["israel", "oriente médio"]),
    "SA": (["UN", "BRICS"], ["arábia saudita", "oriente médio", "brics", "g20"]),
    "IR": (["UN", "BRICS"], ["irã", "oriente médio", "brics"]),
}

_ATIVOS_SQL = [
    "expires_at > NOW()",
    "destaque_ate > NOW()",
    "status IN ('ativo', 'publicado', 'aguardando_revisao')",
]


def _formatar_termo_sugestao(raw: str) -> str:
    """Formata a tag preservando siglas conhecidas e capitalizando termos em minúsculo."""
    limpo = " ".join(str(raw or "").strip().split())
    if not limpo:
        return ""
    if limpo != limpo.lower():
        return limpo
    preposicoes = {"de", "da", "do", "das", "dos", "e", "em", "na", "no", "para", "com", "a", "o"}
    palavras = limpo.split(" ")
    out: List[str] = []
    for idx, p in enumerate(palavras):
        low = p.lower()
        if low in _SIGLAS_PRESERVAR:
            out.append(low.upper())
        elif idx > 0 and low in preposicoes:
            out.append(low)
        else:
            out.append(low.capitalize())
    return " ".join(out)


def _construir_where_escopo_pais(
    pais: Optional[str],
    escopo: str,
    categoria: Optional[str] = None,
) -> Tuple[str, List[Any]]:
    """Constrói cláusula WHERE determinística compartilhada entre sugestão e listagem de artigos."""
    conds = list(_ATIVOS_SQL)
    params: List[Any] = []

    if categoria:
        conds.append("categoria = %s")
        params.append(categoria)

    pais_up = pais.strip().upper() if pais and pais.strip() else ""
    if escopo == "direto" and pais_up:
        conds.append("%s = ANY(paises_envolvidos)")
        params.append(pais_up)
    elif escopo == "indireto" and pais_up:
        blocos_iso, termos_texto = _BLOCOS_POR_PAIS.get(pais_up, (["UN"], [pais_up.lower()]))
        conds.append("NOT (%s = ANY(paises_envolvidos))")
        params.append(pais_up)

        like_patterns = [f"%{t}%" for t in termos_texto]
        conds.append(
            "("
            "paises_envolvidos && %s::text[] "
            "OR EXISTS (SELECT 1 FROM unnest(palavras_chave) kw WHERE LOWER(TRIM(kw)) = ANY(%s::text[])) "
            "OR titulo_curto ILIKE ANY(%s::text[]) "
            "OR resumo_pulso ILIKE ANY(%s::text[]) "
            "OR COALESCE(impacto_pratico, '') ILIKE ANY(%s::text[])"
            ")"
        )
        params.extend([blocos_iso, termos_texto, like_patterns, like_patterns, like_patterns])

    return " AND ".join(conds), params


def _construir_where_artigos_assunto(
    termo: str,
    pais: Optional[str],
    escopo: str,
    categoria: Optional[str] = None,
) -> Tuple[str, List[Any]]:
    """Aplica o mesmo filtro de escopo + correspondência exata do termo nas matérias ativas."""
    where_escopo, params = _construir_where_escopo_pais(pais, escopo, categoria)
    termo_limpo = termo.strip()
    like_termo = f"%{termo_limpo}%"
    where_full = (
        f"{where_escopo} AND ("
        "EXISTS (SELECT 1 FROM unnest(palavras_chave) AS kw WHERE LOWER(TRIM(kw)) = LOWER(TRIM(%s))) "
        "OR titulo_curto ILIKE %s "
        "OR resumo_pulso ILIKE %s"
        ")"
    )
    params.extend([termo_limpo, like_termo, like_termo])
    return where_full, params


def _consultar_sugestoes_por_escopo(
    cur: Any,
    pais: Optional[str],
    escopo: str,
    categoria: Optional[str],
    limite: int,
    excluir_norms: Optional[set] = None,
) -> List[Dict[str, Any]]:
    """Agrega tags reais de `ai_noticias_quentes` garantindo `COUNT(DISTINCT id) > 0`."""
    where_sql, params = _construir_where_escopo_pais(pais, escopo, categoria)
    excluir = list(excluir_norms or set())
    exclusao_sql = ""
    if excluir:
        exclusao_sql = "AND NOT (LOWER(TRIM(kw)) = ANY(%s::text[]))"
        params.append(excluir)

    params.append(limite)

    query = f"""
        WITH artigos_ativos AS (
            SELECT id, palavras_chave, urgencia_score, relevancia_score, updated_at
            FROM ai_noticias_quentes
            WHERE {where_sql}
        ),
        tags_expandidas AS (
            SELECT
                a.id AS artigo_id,
                LOWER(TRIM(kw)) AS tag_norm,
                TRIM(kw) AS tag_raw,
                a.urgencia_score,
                a.relevancia_score,
                a.updated_at
            FROM artigos_ativos a,
            LATERAL unnest(a.palavras_chave) AS kw
            WHERE LENGTH(TRIM(kw)) >= 2
              {exclusao_sql}
        )
        SELECT
            tag_norm,
            MIN(tag_raw) AS tag_display,
            COUNT(DISTINCT artigo_id)::int AS artigos_count,
            MAX(urgencia_score * 0.6 + relevancia_score * 0.4) AS score_max,
            MAX(updated_at) AS ultima_atualizacao
        FROM tags_expandidas
        GROUP BY tag_norm
        HAVING COUNT(DISTINCT artigo_id) > 0
        ORDER BY artigos_count DESC, score_max DESC, ultima_atualizacao DESC
        LIMIT %s;
    """
    cur.execute(query, tuple(params))
    rows = cur.fetchall()
    resultados: List[Dict[str, Any]] = []
    for r in rows:
        count = int(r["artigos_count"] or 0)
        if count <= 0:
            continue
        resultados.append({
            "termo": _formatar_termo_sugestao(r["tag_display"]),
            "termo_busca": str(r["tag_display"]).strip(),
            "prioridade": escopo,
            "count": count,
            "score": round(float(r["score_max"] or 0), 2),
            "ultima_atualizacao": _serializar_valor_temporal(r["ultima_atualizacao"]),
        })
    return resultados


@router.get("/v2/sugestoes-contextuais")
def obter_sugestoes_contextuais(
    response: Response,
    pais: Optional[str] = Query(None, description="Código ISO-2 do país (ex: BR, US). Omitir para fallback global."),
    categoria: Optional[str] = Query(None, description="Filtrar por categoria do Atlas"),
    limit: int = Query(4, ge=1, le=6, description="Quantidade de sugestões (padrão 4, retorna 3 a 4)"),
    refresh: Optional[str] = Query(None, description="Ignorar cache em memória"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Retorna de 3 a 4 sugestões quentes confirmadas no banco (`COUNT(*) > 0`) por país ou global."""
    pais_norm = pais.strip().upper() if pais and pais.strip() else None
    cat_norm = categoria.strip() if categoria and categoria.strip() else None
    cache_key = f"{pais_norm or 'GLOBAL'}|{cat_norm or 'ALL'}|{limit}"

    if not refresh:
        cached = _SUGESTOES_CACHE.get(cache_key)
        if cached and time.monotonic() < cached[0]:
            response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=60"
            return {**cached[1], "cached": True}

    aplicar_no_cache_headers(response)
    if conn is None:
        return {
            "ok": True,
            "cached": False,
            "source": "sem_banco",
            "pais": pais_norm,
            "sugestoes": [],
        }

    sugestoes: List[Dict[str, Any]] = []
    seen_norms: set = set()

    try:
        with conn.cursor() as cur:
            if pais_norm:
                # Prioridade 1 (Direto): artigos publicados vinculados diretamente ao país
                diretas = _consultar_sugestoes_por_escopo(
                    cur, pais_norm, "direto", cat_norm, limit, seen_norms
                )
                for item in diretas:
                    k = item["termo_busca"].lower().strip()
                    if k not in seen_norms:
                        seen_norms.add(k)
                        sugestoes.append(item)

                # Prioridade 2 (Indireto / Geopolítica): se < 3 diretas, complementa com impacto regional/blocos
                if len(sugestoes) < 3:
                    faltantes = max(0, limit - len(sugestoes))
                    if faltantes > 0:
                        indiretas = _consultar_sugestoes_por_escopo(
                            cur, pais_norm, "indireto", cat_norm, faltantes, seen_norms
                        )
                        for item in indiretas:
                            k = item["termo_busca"].lower().strip()
                            if k not in seen_norms and len(sugestoes) < limit:
                                seen_norms.add(k)
                                sugestoes.append(item)
            else:
                # Fallback Global (home sem país)
                globais = _consultar_sugestoes_por_escopo(
                    cur, None, "global", cat_norm, limit, seen_norms
                )
                sugestoes.extend(globais[:limit])
    except Exception as e:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        print(f"[Aviso] Erro ao gerar sugestões contextuais: {e}")

    payload = {
        "ok": True,
        "cached": False,
        "source": "database",
        "pais": pais_norm,
        "total": len(sugestoes),
        "sugestoes": sugestoes,
    }
    _SUGESTOES_CACHE[cache_key] = (time.monotonic() + _SUGESTOES_CACHE_TTL_SEC, payload)
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=60"
    return payload


@router.get("/v2/artigos-por-assunto")
def listar_artigos_por_assunto(
    response: Response,
    termo: str = Query(..., min_length=1, description="Termo/tag selecionado no chip"),
    pais: Optional[str] = Query(None, description="Código ISO-2 do país (opcional)"),
    escopo: Literal["direto", "indireto", "global"] = Query("direto", description="Mesmo escopo validado na sugestão"),
    categoria: Optional[str] = Query(None, description="Filtrar por categoria do Atlas"),
    limit: int = Query(20, ge=1, le=50),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lista matérias ativas aplicando exatamente o mesmo critério de filtro de `/v2/sugestoes-contextuais`."""
    aplicar_no_cache_headers(response)
    pais_norm = pais.strip().upper() if pais and pais.strip() else None
    escopo_efetivo = escopo if pais_norm else "global"

    if conn is None:
        return {"ok": True, "termo": termo, "pais": pais_norm, "escopo": escopo_efetivo, "total": 0, "artigos": []}

    where_sql, params = _construir_where_artigos_assunto(termo, pais_norm, escopo_efetivo, categoria)
    params.append(limit)

    query = f"""
        SELECT
            slug, titulo_curto, resumo_pulso, impacto_pratico,
            categoria, paises_envolvidos, urgencia_score, relevancia_score,
            veiculos_origem, fontes_urls, palavras_chave, updated_at
        FROM ai_noticias_quentes
        WHERE {where_sql}
        ORDER BY urgencia_score DESC, relevancia_score DESC, updated_at DESC
        LIMIT %s;
    """

    artigos: List[Dict[str, Any]] = []
    try:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            for r in cur.fetchall():
                artigos.append({
                    "slug": r["slug"],
                    "titulo": r["titulo_curto"],
                    "resumo": r["resumo_pulso"],
                    "impacto_pratico": r["impacto_pratico"],
                    "categoria": r["categoria"],
                    "paises_envolvidos": list(r["paises_envolvidos"] or []),
                    "veiculos_origem": list(r["veiculos_origem"] or []),
                    "fontes_urls": list(r["fontes_urls"] or []),
                    "palavras_chave": list(r["palavras_chave"] or []),
                    "urgencia_score": int(r["urgencia_score"] or 0),
                    "relevancia_score": int(r["relevancia_score"] or 0),
                    "atualizado_em": _formatar_horario_editorial(r["updated_at"]),
                    "updated_at": _serializar_valor_temporal(r["updated_at"]),
                })
    except Exception as e:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        print(f"[Aviso] Erro ao listar artigos por assunto: {e}")

    return {
        "ok": True,
        "termo": termo,
        "pais": pais_norm,
        "escopo": escopo_efetivo,
        "total": len(artigos),
        "artigos": artigos,
    }


# ============================================================================
# 11. ENDPOINTS ATLAS VIVO (CONTRATO ATLAS-VIVO.md — PARTES 1, 2 E 4)
# ============================================================================

@router.post("/v1/atlas/atualizar-pulso-continental")
def atualizar_pulso_continental(
    payload: Dict[str, Any] = Body(...),
    authorization: Optional[str] = Header(None),
    conn=Depends(get_db),
):
    """Persiste o pulso continental sincronizado pelo Worker Cron no PostgreSQL."""
    secret = (os.getenv("CURADORIA_SECRET_TOKEN") or "").strip()
    if secret:
        token = (authorization or "").replace("Bearer ", "").strip()
        if token != secret:
            raise HTTPException(status_code=401, detail="Token de autorização inválido.")

    if not conn:
        return {"ok": False, "mensagem": "PostgreSQL indisponível no momento."}

    continentes = payload.get("continentes") or {}
    try:
        with conn.cursor() as cur:
            for cont_key, data in continentes.items():
                headlines = data.get("headlines") or []
                active_paises = list({h.get("countryCode") for h in headlines if h.get("countryCode")})
                cur.execute(
                    """
                    INSERT INTO atlas_pulso_continental (continent_key, headlines_json, active_countries, updated_at)
                    VALUES (%s, %s, %s, NOW())
                    ON CONFLICT (continent_key) DO UPDATE
                    SET headlines_json = EXCLUDED.headlines_json,
                        active_countries = EXCLUDED.active_countries,
                        updated_at = NOW();
                    """,
                    (cont_key, Jsonb(headlines), Jsonb(active_paises)),
                )
        return {"ok": True, "continentes_atualizados": list(continentes.keys())}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return {"ok": False, "erro": str(e)}


@router.get("/v1/atlas/pulso-continental")
def obter_pulso_continental(
    continente: Optional[str] = Query(None),
    conn=Depends(get_db),
):
    """Retorna o pulso continental atualizado para o mapa e o ticker global."""
    if not conn:
        return {"ok": False, "continentes": {}}

    try:
        with conn.cursor() as cur:
            if continente:
                cur.execute(
                    "SELECT continent_key, headlines_json, active_countries, updated_at FROM atlas_pulso_continental WHERE continent_key = %s;",
                    (continente,),
                )
            else:
                cur.execute(
                    "SELECT continent_key, headlines_json, active_countries, updated_at FROM atlas_pulso_continental;"
                )
            rows = cur.fetchall()
            continentes_dict = {}
            paises_ativos = set()
            for r in rows:
                k = r["continent_key"]
                h = list(r["headlines_json"] or [])
                c = list(r["active_countries"] or [])
                paises_ativos.update(c)
                continentes_dict[k] = {
                    "headlines": h,
                    "active_countries": c,
                    "updated_at": _serializar_valor_temporal(r["updated_at"]),
                }
            return {
                "ok": True,
                "continentes": continentes_dict,
                "paises_ativos": sorted(paises_ativos),
            }
    except Exception as e:
        return {"ok": False, "erro": str(e), "continentes": {}}


def _traduzir_lote_rapido_pt(texto: str) -> str:
    """Traduz manchete curta para PT-BR via Google Dict API com fallback seguro."""
    import urllib.parse
    import urllib.request

    clean = (texto or "").strip()
    if not clean or len(clean) < 3:
        return clean
    url = (
        "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=pt&q="
        + urllib.parse.quote(clean)
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data, list) and data:
                if isinstance(data[0], str):
                    return data[0]
                if isinstance(data[0], list) and data[0] and isinstance(data[0][0], str):
                    return data[0][0]
    except Exception:
        pass
    return clean


@router.get("/api/atlas-pais")
def obter_atlas_pais_ao_vivo(
    response: Response,
    pais: str = Query("BR", min_length=2, max_length=8),
    nome: Optional[str] = Query(None),
    refresh: Optional[str] = Query(None),
    _t: Optional[str] = Query(None),
    conn=Depends(get_db),
):
    """Endpoint FastAPI espelho do /api/atlas-pais com cache persistido no PostgreSQL."""
    import email.utils
    import hashlib
    import urllib.parse
    import urllib.request
    import xml.etree.ElementTree as ET

    c_code = pais.upper().strip()
    c_name = (nome or c_code).strip()
    is_refresh = bool(_t or refresh == "1")

    if is_refresh:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    else:
        response.headers["Cache-Control"] = "public, max-age=180, stale-while-revalidate=60"

    # 1. Tenta ler cache fresco do PostgreSQL
    if conn and not is_refresh:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT items_json, updated_at
                      FROM atlas_pais_noticias
                     WHERE country_code = %s
                       AND item_count > 0
                       AND expires_at > NOW();
                    """,
                    (c_code,),
                )
                row = cur.fetchone()
                if row and row.get("items_json"):
                    return {
                        "ok": True,
                        "cached": True,
                        "source": "postgres_cache",
                        "country": c_code,
                        "countryName": c_name,
                        "updatedAt": _serializar_valor_temporal(row["updated_at"]),
                        "total": len(row["items_json"]),
                        "items": list(row["items_json"]),
                    }
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass

    # 2. Coleta ao vivo via Google News RSS (local/regional)
    if c_code == "BR":
        rss_url = "https://news.google.com/rss/headlines/section/geo/Brasil?hl=pt-BR&gl=BR&ceid=BR:pt-419"
    else:
        rss_url = (
            f"https://news.google.com/rss/search?q={urllib.parse.quote(c_name)}"
            f"&hl=en&gl={urllib.parse.quote(c_code)}&ceid={urllib.parse.quote(c_code)}:en"
        )

    items: List[Dict[str, Any]] = []
    try:
        req = urllib.request.Request(
            rss_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; RodandoOMundoAtlas/2.1)"},
        )
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            xml_bytes = resp.read()
        root = ET.fromstring(xml_bytes)
        for item_el in root.findall(".//item")[:14]:
            raw_title = (item_el.findtext("title") or "").strip()
            raw_link = (item_el.findtext("link") or "").strip()
            raw_source = (item_el.findtext("source") or "").strip()
            raw_pub = (item_el.findtext("pubDate") or "").strip()
            if not raw_title or not raw_link.startswith("http"):
                continue

            title_clean = raw_title
            detected_source = raw_source
            if " - " in title_clean:
                idx = title_clean.rfind(" - ")
                if idx > 15:
                    if not detected_source:
                        detected_source = title_clean[idx + 3 :].strip()
                    title_clean = title_clean[:idx].strip()

            try:
                dt = email.utils.parsedate_to_datetime(raw_pub)
                iso_pub = dt.astimezone(timezone.utc).isoformat()
            except Exception:
                iso_pub = datetime.now(timezone.utc).isoformat()

            title_pt = title_clean
            if c_code != "BR" and len(items) < 10:
                title_pt = _traduzir_lote_rapido_pt(title_clean)

            items.append({
                "id": "h_" + hashlib.sha1(raw_link.encode("utf-8")).hexdigest()[:10],
                "titleOriginal": title_clean,
                "titlePt": title_pt,
                "url": raw_link,
                "source": detected_source or "Imprensa Internacional",
                "publishedAt": iso_pub,
                "score": 85,
                "country": c_code,
            })
    except Exception:
        items = []

    now_iso = datetime.now(timezone.utc).isoformat()

    # 3. Persiste no PostgreSQL se houver itens
    if conn and items:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO atlas_pais_noticias (
                        country_code, country_name, items_json, source_mode, item_count, updated_at, expires_at
                    )
                    VALUES (%s, %s, %s, 'hybrid_rss', %s, NOW(), NOW() + INTERVAL '15 minutes')
                    ON CONFLICT (country_code) DO UPDATE SET
                        country_name = EXCLUDED.country_name,
                        items_json = EXCLUDED.items_json,
                        source_mode = EXCLUDED.source_mode,
                        item_count = EXCLUDED.item_count,
                        updated_at = NOW(),
                        expires_at = NOW() + INTERVAL '15 minutes';
                    """,
                    (c_code, c_name, Jsonb(items), len(items)),
                )
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass

    return {
        "ok": True,
        "cached": False,
        "source": "live_hybrid",
        "country": c_code,
        "countryName": c_name,
        "updatedAt": now_iso,
        "total": len(items),
        "items": items,
    }

