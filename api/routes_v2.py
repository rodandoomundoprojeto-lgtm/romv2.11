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
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

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

def verificar_admin_token(authorization: Optional[str] = Header(default=None)) -> None:
    """Autenticação Bearer usando CURADORIA_SECRET_TOKEN (padrão do projeto)."""
    token_esperado = (
        os.getenv("CURADORIA_SECRET_TOKEN")
        or os.getenv("ADMIN_SECRET_TOKEN")
        or ""
    ).strip()
    if not token_esperado:
        raise HTTPException(
            status_code=503,
            detail="CURADORIA_SECRET_TOKEN não configurado no servidor.",
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token Bearer ausente ou inválido.")
    token = authorization.removeprefix("Bearer ").strip()
    if not secrets.compare_digest(token, token_esperado):
        raise HTTPException(status_code=403, detail="Token não autorizado.")


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


@router.get("/v2/admin/fontes", dependencies=[Depends(verificar_admin_token)])
def admin_listar_fontes(
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lista fontes cadastradas em `ai_fontes_referencia`."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT id, nome, url, tipo_fonte, cadencia, peso_confianca,
                   politica_uso_status, coleta_permitida, ativo, revisado_por, created_at
            FROM ai_fontes_referencia
            ORDER BY id DESC
            LIMIT 100;
            """
        )
        rows = cur.fetchall()
    fontes = [
        {
            **dict(r),
            "created_at": _serializar_valor_temporal(r.get("created_at")),
        }
        for r in rows
    ]
    return {"ok": True, "fontes": fontes}


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
