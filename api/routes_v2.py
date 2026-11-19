"""Rotas FastAPI do Motor Editorial V2 e Pulso de 30 Minutos — Rodando o Mundo.

Implementa as rotas oficiais definidas no plano arquitetural (`docs/arquitetura_v2.md`):
  - `GET  /v1/noticias-quentes`          : Lista notícias quentes e eventos ativos ordenados por `urgencia_score DESC`.
  - `POST /v1/noticias-quentes/executar` : Disparo manual do pipeline de pulso (30m) com Session-Level Advisory Lock.
  - `POST /v2/gerar-coluna`              : Dispara o pipeline de 4 agentes (`gemini-2.5-pro`) em `BackgroundTasks`.
  - `GET  /v2/colunas`                   : Lista colunas analíticas geradas (mais recentes primeiro).
  - `GET  /v2/entenda-o-assunto/{slug}`  : Retorna o dossiê contextual completo e o Painel Único de Verificação (404 se ausente).
"""
import hashlib
import json
import os
import re
import secrets
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

import psycopg
from fastapi import APIRouter, BackgroundTasks, Body, Depends, Header, HTTPException, Query, Response
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from redacao_v2.coletor_estudo import advisory_lock
from redacao_v2.orquestrador_editorial import (
    MODELO_EDITORIAL,
    executar_orquestrador_editorial_async,
)
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
from src.publisher import (
    _ler_feed_existente,
    _timestamp_publicacao,
    atualizar_card_manual,
    atualizar_card_radar,
    fixar_card_radar,
    listar_cards_manuais,
    listar_todos_cards_radar,
    normalizar_card_manual,
    normalizar_fonte_key,
    publicar_card_manual,
    remover_card_manual,
    remover_card_radar,
    sortir_cards_rodizio_amplo,
)

router = APIRouter(tags=["Motor Editorial V2 & Pulso 30m"])


# ============================================================================
# 1. DEPENDÊNCIA DE BANCO DE DADOS E CABEÇALHOS DE CACHE (REGRA 7 GEMINI.md)
# ============================================================================

_MARCADORES_URL_INVALIDA = ("[YOUR-PASSWORD]", "[POOLER-HOST]")


def obter_database_url() -> str:
    """Resolve a URL de conexão PostgreSQL a partir das variáveis de ambiente.

    Mesmo critério de `src.estado_db.obter_database_url`: URLs com placeholders
    de configuração são tratadas como ausentes, evitando tentativas de conexão
    com host/senha inválidos.
    """
    url = (
        os.getenv("DATABASE_URL")
        or os.getenv("CURADORIA_DATABASE_URL")
        or ""
    ).strip()
    if not url or any(marcador in url for marcador in _MARCADORES_URL_INVALIDA):
        return ""
    return url


def get_db():
    """Dependência FastAPI para conexão com PostgreSQL (sobreponível via dependency_overrides)."""
    db_url = obter_database_url()
    if not db_url:
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


def _obter_cursor(conn: Any):
    """Obtém cursor com row_factory=dict_row com fallback seguro para conexões mock em testes."""
    try:
        return conn.cursor(row_factory=dict_row)
    except (TypeError, ValueError):
        return conn.cursor()


def _row_to_dict(cur: Any, row: Any) -> Dict[str, Any]:
    """Converte linha de cursor para dict de forma tolerante a tuplas e dicts."""
    if isinstance(row, dict):
        return row
    if hasattr(cur, "description") and cur.description:
        colnames = [d.name if hasattr(d, "name") else d[0] for d in cur.description]
        return dict(zip(colnames, row))
    try:
        return dict(row)
    except Exception:
        return {}


def aplicar_no_cache_headers(response: Response) -> None:
    """Aplica invalidação rigorosa de cache (Regra 7 do GEMINI.md)."""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"


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
    Autenticação Bearer para rotas administrativas:

    1. Bearer `<token de máquina>` (CURADORIA_SECRET_TOKEN / ADMIN_SECRET_TOKEN);
    2. Bearer `<senha>` quando bate com ADMIN_PASSWORD / ADMIN_SENHA ou com algum admin em ADMIN_USERS;
    3. Bearer `<senha>` + X-Admin-User `<user>` com admin/senha em ADMIN_USERS.

    Erros: `401` sem credencial; `403` com credencial inválida.
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

    credencial: Optional[str] = None
    if authorization:
        esquema, _, valor = authorization.partition(" ")
        if esquema.strip().lower() == "bearer" and valor.strip():
            credencial = valor.strip()
    if not credencial:
        raise HTTPException(
            status_code=401,
            detail="Credencial ausente ou malformada. Envie: `Authorization: Bearer <token-ou-senha>`.",
        )

    # 1. Token de máquina (Dashboard / scripts / cron)
    if token_esperado and secrets.compare_digest(credencial, token_esperado):
        return

    # 2. Senha pura (ADMIN_PASSWORD / ADMIN_SENHA) ou senha de algum admin em ADMIN_USERS
    if senha_esperada and secrets.compare_digest(credencial, senha_esperada):
        return
    if admins:
        usuario = (x_admin_user or "").strip()
        senha_admin = admins.get(usuario) if usuario else None
        if senha_admin and secrets.compare_digest(credencial, senha_admin):
            return
        if not usuario:
            for _nome_admin, senha_admin_candidata in admins.items():
                if senha_admin_candidata and secrets.compare_digest(credencial, senha_admin_candidata):
                    return

    # 3. Sem credencial válida
    raise HTTPException(status_code=403, detail="Credencial administrativa inválida ou sem permissão.")


def _require_db(conn: Any) -> Any:
    if conn is None:
        raise HTTPException(status_code=503, detail="Banco de dados PostgreSQL indisponível.")
    return conn


def _formatar_horario_editorial(dt: Optional[Any] = None) -> str:
    """Formata o carimbo editorial 'Atualizado às HHhMM' (Seção 1 de docs/arquitetura_v2.md) no fuso editorial de Brasília."""
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:  # noqa: BLE001
            dt = datetime.now(timezone.utc)
    elif not isinstance(dt, datetime):
        dt = datetime.now(timezone.utc)
    try:
        from zoneinfo import ZoneInfo
        tz_br = ZoneInfo("America/Sao_Paulo")
    except Exception:  # ambientes sem tzdata (ex.: python:3.12-slim)
        tz_br = timezone(timedelta(hours=-3))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(tz_br)
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


class ExecutarDdgRequest(BaseModel):
    """Parâmetros opcionais para disparo do Bot DuckDuckGo News (ddgs)."""
    query: Optional[str] = Field(
        default=None,
        max_length=160,
        description="Consulta específica (opcional; se vazio, roda varredura multi-editoria)",
    )
    region: str = Field(default="br-pt", max_length=12)
    timelimit: str = Field(default="d", max_length=4)
    max_results: int = Field(default=6, ge=1, le=25)
    dry_run: bool = Field(
        default=False,
        description="Se True, retorna os resultados sem sobrescrever data/noticias_ddg.json",
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
        filtros_comuns = ["e.status IN ('ativo', 'publicado', 'aguardando_revisao')"]
        params_comuns: List[Any] = []

        if categoria:
            filtros_comuns.append("e.categoria = %s")
            params_comuns.append(categoria)
        if pais:
            filtros_comuns.append("%s = ANY(e.paises_envolvidos)")
            params_comuns.append(pais.upper())

        def _exec_query(filtros_lista: List[str], params_lista: List[Any]) -> List[Dict[str, Any]]:
            where_sql = " AND ".join(filtros_lista)
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
                    ORDER BY e.updated_at DESC, e.urgencia_score DESC, e.relevancia_score DESC
                    LIMIT %s;
                    """,
                    tuple(params_lista + [limite]),
                )
                return cur.fetchall()

        eventos_rows = _exec_query(["e.destaque_ate > NOW()"] + filtros_comuns, params_comuns)
        if not eventos_rows:
            eventos_rows = _exec_query(filtros_comuns, params_comuns)

        with conn.cursor() as cur:

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

def _carregar_noticias_quentes_fallback_snapshot(
    categoria: Optional[str] = None,
    pais: Optional[str] = None,
    limite: int = 15,
) -> List[Dict[str, Any]]:
    """Lê notícias quentes ou temas ativos do snapshot `vitrine_ia.json` em caso de indisponibilidade/vazio do banco."""
    snap_data: Optional[Dict[str, Any]] = None
    caminhos_candidatos: List[Path] = []
    try:
        import redacao_v2.pulso_noticias_quentes as _pulso_mod
        snap_pulso = getattr(_pulso_mod, "SNAPSHOT_VITRINE_PATH", None)
        if snap_pulso:
            caminhos_candidatos.append(Path(snap_pulso))
    except Exception:
        pass
    try:
        import curadoria.pipeline as _cur_mod
        snap_cur = getattr(_cur_mod, "SNAPSHOT_VITRINE", None)
        if snap_cur:
            caminhos_candidatos.append(Path(snap_cur))
    except Exception:
        pass
    caminhos_candidatos.append(_caminho_arquivo_estado("vitrine_ia"))

    for cam in caminhos_candidatos:
        try:
            if cam and cam.is_file():
                raw = json.loads(cam.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    snap_data = raw
                    break
        except Exception:
            continue

    if not isinstance(snap_data, dict):
        return []

    brutos = snap_data.get("noticias_quentes")
    if not isinstance(brutos, list) or not brutos:
        brutos = snap_data.get("temas_ativos")
    if not isinstance(brutos, list):
        return []

    itens: List[Dict[str, Any]] = []
    for item in brutos:
        if not isinstance(item, dict):
            continue
        cat_item = str(item.get("categoria") or item.get("categoria_primaria") or "Geopolitica_Relacoes")
        paises_item = [str(p).upper() for p in (item.get("paises_envolvidos") or ["BR"])]
        if categoria and cat_item != categoria:
            continue
        if pais and pais.upper() not in paises_item:
            continue
        data_pub_val = (
            item.get("data_publicacao")
            or item.get("created_at")
            or item.get("updated_at")
            or snap_data.get("updatedAt")
        )
        upd_val = item.get("updated_at") or data_pub_val
        urg = int(item.get("urgencia_score") or item.get("relevancia_score") or 80)
        rel = int(item.get("relevancia_score") or urg)
        itens.append({
            "slug": item.get("slug") or "",
            "batch_id": item.get("batch_id") or snap_data.get("batch_id") or "snapshot",
            "titulo_curto": item.get("titulo_curto") or item.get("titulo_tema") or item.get("titulo") or "",
            "resumo_pulso": item.get("resumo_pulso") or item.get("gatilho_vitrine") or item.get("resumo") or "",
            "impacto_pratico": item.get("impacto_pratico") or item.get("sintese_nerd") or "",
            "categoria": cat_item,
            "paises_envolvidos": paises_item,
            "urgencia_score": urg,
            "relevancia_score": rel,
            "nivel_confianca": item.get("nivel_confianca") or "alta",
            "ttl_horas": int(item.get("ttl_horas") or 6),
            "horas_em_destaque": int(item.get("horas_em_destaque") or 6),
            "veiculos_origem": list(item.get("veiculos_origem") or []),
            "fontes_urls": list(item.get("fontes_urls") or []),
            "palavras_chave": list(item.get("palavras_chave") or item.get("palavras_chave_busca") or []),
            "links_internos_relacionados": list(item.get("links_internos_relacionados") or []),
            "identificacao_editorial": "Síntese Rodando o Mundo",
            "atualizado_em": _formatar_horario_editorial(upd_val),
            "data_publicacao": _serializar_valor_temporal(data_pub_val),
            "created_at": _serializar_valor_temporal(item.get("created_at") or data_pub_val),
            "destaque_ate": _serializar_valor_temporal(item.get("destaque_ate")),
            "expires_at": _serializar_valor_temporal(item.get("expires_at")),
            "updated_at": _serializar_valor_temporal(upd_val),
        })

    itens.sort(
        key=lambda x: (
            str(x.get("data_publicacao") or x.get("updated_at") or ""),
            int(x.get("urgencia_score") or 0),
            int(x.get("relevancia_score") or 0),
        ),
        reverse=True,
    )
    return itens[:limite]


@router.get("/v1/noticias-quentes")
def listar_noticias_quentes(
    response: Response,
    categoria: Optional[str] = Query(None, description="Filtrar por categoria do Atlas"),
    pais: Optional[str] = Query(None, description="Filtrar por código ISO-2 do país (ex: BR, US)"),
    limit: int = Query(15, ge=1, le=50, description="Limite máximo de notícias retornadas"),
    limite: Optional[int] = Query(None, ge=1, le=50, description="Alias opcional para limit"),
    _t: Optional[str] = Query(None, description="Parâmetro de cache-busting"),
    refresh: Optional[str] = Query(None, description="Flag de atualização em tempo real"),
    force: Optional[str] = Query(None, description="Flag opcional de revalidação forçada"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Retorna as notícias quentes e eventos ativos ordenados por recência (`updated_at DESC`) e urgência."""
    aplicar_no_cache_headers(response)
    qtd_limite = limite if limite is not None else limit
    agora_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if conn is None:
        noticias_fb = _carregar_noticias_quentes_fallback_snapshot(
            categoria=categoria,
            pais=pais,
            limite=qtd_limite,
        )
        return {
            "ok": True,
            "cached": False,
            "source": "fallback_sem_banco",
            "identificacao_editorial": "Síntese Rodando o Mundo",
            "atualizado_em": _formatar_horario_editorial(),
            "updatedAt": agora_iso,
            "total": len(noticias_fb),
            "noticias_quentes": noticias_fb,
            "eventos_principais": [],
        }

    filtros_comuns = ["status IN ('ativo', 'publicado', 'aguardando_revisao')"]
    params_comuns: List[Any] = []

    if categoria:
        filtros_comuns.append("categoria = %s")
        params_comuns.append(categoria)
    if pais:
        filtros_comuns.append("%s = ANY(paises_envolvidos)")
        params_comuns.append(pais.upper())

    def _montar_query(filtros_lista: List[str]) -> str:
        where_clause = " AND ".join(filtros_lista)
        return f"""
            SELECT
                slug, batch_id, titulo_curto, resumo_pulso, impacto_pratico,
                categoria, paises_envolvidos, urgencia_score, relevancia_score,
                nivel_confianca, ttl_horas, horas_em_destaque, veiculos_origem,
                fontes_urls, palavras_chave, links_internos_relacionados,
                status, destaque_ate, expires_at, created_at, updated_at
            FROM ai_noticias_quentes
            WHERE {where_clause}
            ORDER BY updated_at DESC, urgencia_score DESC, relevancia_score DESC
            LIMIT %s;
        """

    noticias: List[Dict[str, Any]] = []
    source_label = "database"
    try:
        with _obter_cursor(conn) as cur:
            filtros_ativos = ["expires_at > NOW()", "destaque_ate > NOW()"] + filtros_comuns
            cur.execute(_montar_query(filtros_ativos), tuple(params_comuns + [qtd_limite]))
            rows = cur.fetchall()
            if not rows:
                source_label = "database_recent_fallback"
                cur.execute(_montar_query(filtros_comuns), tuple(params_comuns + [qtd_limite]))
                rows = cur.fetchall()

        for r in rows:
            row_dict = dict(r)
            data_pub_val = row_dict.get("data_publicacao") or row_dict.get("created_at") or row_dict.get("updated_at")
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
                "data_publicacao": _serializar_valor_temporal(data_pub_val),
                "created_at": _serializar_valor_temporal(row_dict.get("created_at")),
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

    if not noticias:
        noticias = _carregar_noticias_quentes_fallback_snapshot(
            categoria=categoria,
            pais=pais,
            limite=qtd_limite,
        )
        if noticias:
            source_label = "snapshot_fallback"

    eventos_principais = _carregar_eventos_ativos_comparados(
        conn,
        categoria=categoria,
        pais=pais,
        limite=qtd_limite,
    )

    return {
        "ok": True,
        "cached": False,
        "source": source_label,
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

@router.post("/v1/noticias-quentes/executar", dependencies=[Depends(verificar_admin_token)])
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
                    "dry_run": modo_dry_run,
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
# 5.0. ESTADO DO PIPELINE: GET/PUT /v1/estado/{chave} (Nível 2B)
# ============================================================================

CHAVES_ESTADO_PUBLICAS = {"vitrine_ia", "feed_output", "entenda_v2"}
CHAVES_ESTADO_PROTEGIDAS = {"history"}
CHAVES_ESTADO_VALIDAS = CHAVES_ESTADO_PUBLICAS | CHAVES_ESTADO_PROTEGIDAS


def _caminho_arquivo_estado(chave: str) -> Path:
    return Path(__file__).resolve().parents[1] / "data" / f"{chave}.json"


def _ler_estado_arquivo(chave: str) -> Optional[Any]:
    caminho = _caminho_arquivo_estado(chave)
    if not caminho.is_file():
        return None
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except Exception:
        return None


@router.get("/v1/estado/{chave}")
def obter_estado_pipeline(
    chave: str,
    response: Response,
    authorization: Optional[str] = Header(default=None),
    x_admin_user: Optional[str] = Header(default=None, alias="X-Admin-User"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Retorna o estado de execução do pipeline (banco primeiro, arquivo como fallback).

    Chaves públicas: ``vitrine_ia`` e ``feed_output``. A chave ``history``
    contém IDs de deduplicação e exige token administrativo.
    """
    aplicar_no_cache_headers(response)
    chave_norm = (chave or "").strip().lower()
    if chave_norm not in CHAVES_ESTADO_VALIDAS:
        raise HTTPException(status_code=404, detail="Chave de estado desconhecida.")

    if chave_norm in CHAVES_ESTADO_PROTEGIDAS:
        verificar_admin_token(authorization=authorization, x_admin_user=x_admin_user)

    payload: Optional[Any] = None
    origem: Optional[str] = None

    if conn is not None:
        try:
            from src.estado_db import ler_estado

            payload = ler_estado(chave_norm, conn=conn)
            if payload is not None:
                origem = "db"
        except Exception:
            payload = None

    if payload is None:
        payload = _ler_estado_arquivo(chave_norm)
        if payload is not None:
            origem = "arquivo"

    if payload is None:
        raise HTTPException(status_code=404, detail="Estado ainda não gerado.")

    return {
        "ok": True,
        "chave": chave_norm,
        "origem": origem,
        "payload": payload,
    }


@router.put("/v1/estado/{chave}")
def gravar_estado_pipeline(
    chave: str,
    payload: Any = Body(...),
    authorization: Optional[str] = Header(default=None),
    x_admin_user: Optional[str] = Header(default=None, alias="X-Admin-User"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Grava/atualiza uma chave de estado no banco (rota administrativa)."""
    verificar_admin_token(authorization=authorization, x_admin_user=x_admin_user)

    chave_norm = (chave or "").strip().lower()
    if chave_norm not in CHAVES_ESTADO_VALIDAS:
        raise HTTPException(status_code=404, detail="Chave de estado desconhecida.")
    if not isinstance(payload, (dict, list)):
        raise HTTPException(status_code=422, detail="Payload deve ser objeto ou lista JSON.")
    if conn is None:
        raise HTTPException(status_code=503, detail="Banco de dados indisponível.")

    try:
        from src.estado_db import gravar_estado

        gravado = gravar_estado(chave_norm, payload, conn=conn)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao gravar estado: {exc}") from exc

    if not gravado:
        raise HTTPException(status_code=500, detail="Falha ao gravar estado no banco.")

    return {"ok": True, "chave": chave_norm, "origem": "db", "total": len(payload)}


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
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Retorna os briefings do Radar Editorial mesclando dados de feed_output.json e vitrine_ia.json."""
    aplicar_no_cache_headers(response)
    raiz = Path(__file__).resolve().parents[1]
    feed_path = raiz / "data" / "feed_output.json"
    vitrine_path = raiz / "data" / "vitrine_ia.json"

    # Banco primeiro; arquivo local como fallback durante a migração (Nível 2B).
    vitrine_raw: Optional[Any] = None
    feed_raw: Optional[Any] = None
    if conn is not None and hasattr(conn, "cursor"):
        try:
            from src.estado_db import ler_estado

            vitrine_raw = ler_estado("vitrine_ia", conn=conn)
            feed_raw = ler_estado("feed_output", conn=conn)
        except Exception:
            vitrine_raw = None
            feed_raw = None

    base_snapshot_iso = "2026-11-15T00:00:00Z"
    itens_v2: List[Dict[str, Any]] = []

    mapa_cat_radar = {
        "Geopolitica_Radar": "geopolitica",
        "Geopolitica_Relacoes": "geopolitica",
        "Politica": "politica",
        "Economia": "economia",
        "Economia_Comercio": "economia",
        "Cultura": "cultura",
        "Sociedade_Cultura": "cultura",
        "Ciencia_Clima": "geopolitica",
        "Mobilidade_Fronteiras": "geopolitica",
        "Eleicoes": "politica",
        "Resumo_Ultimas": "geopolitica",
    }

    if isinstance(vitrine_raw, dict) or vitrine_path.is_file():
        try:
            if not isinstance(vitrine_raw, dict) or not (
                vitrine_raw.get("temas_ativos") or vitrine_raw.get("noticias_quentes")
            ):
                if vitrine_path.is_file():
                    vitrine_raw = json.loads(vitrine_path.read_text(encoding="utf-8"))
            if isinstance(vitrine_raw, dict):
                agora_radar_utc = datetime.now(timezone.utc)
                temas = vitrine_raw.get("temas_ativos") or []
                if isinstance(temas, list):
                    for t in temas:
                        if not isinstance(t, dict):
                            continue
                        exp_dt = _parse_iso_utc(t.get("expires_at"))
                        if exp_dt is not None and exp_dt <= agora_radar_utc:
                            continue
                        cat_raw = t.get("categoria_primaria") or t.get("categoria") or "Geopolitica_Radar"
                        cat_norm = mapa_cat_radar.get(str(cat_raw), "geopolitica")
                        slug = str(t.get("slug") or "")
                        titulo = str(t.get("titulo_tema") or t.get("titulo_curto") or t.get("titulo") or "").strip()
                        resumo = str(t.get("gatilho_vitrine") or t.get("resumo_pulso") or t.get("resumo") or "").strip()
                        analise = str(t.get("sintese_nerd") or t.get("impacto_pratico") or t.get("analise") or resumo).strip()
                        kws = t.get("palavras_chave_busca") or t.get("palavras_chave") or []
                        urls = t.get("fontes_urls") or []
                        fonte_url = urls[0] if urls else (t.get("fonte_url") or t.get("rota_editoria") or "/radar")

                        # Preservação mandatória do horário de inclusão (sem carimbar com updatedAt do snapshot)
                        data_pub = (
                            t.get("data_publicacao")
                            or t.get("created_at")
                            or t.get("publicado_em")
                            or t.get("updated_at")
                            or ""
                        )

                        itens_v2.append({
                            "id": f"v2-{slug}",
                            "slug": slug,
                            "titulo": titulo,
                            "resumo": resumo,
                            "analise": analise,
                            "categoria": cat_norm,
                            "fonte_nome": "Síntese Rodando o Mundo · Pulso V2",
                            "fonte_url": fonte_url,
                            "data_publicacao": data_pub,
                            "origem_v2": True,
                            "urgencia_score": int(t.get("urgencia_score") or t.get("relevancia_score") or 85),
                            "paises_envolvidos": list(t.get("paises_envolvidos") or ["BR"]),
                            "palavras_chave": list(kws),
                        })
        except Exception:
            pass

    cards_feed: List[Dict[str, Any]] = []
    if isinstance(feed_raw, list) or feed_path.is_file():
        try:
            if not isinstance(feed_raw, list) or not feed_raw:
                if feed_path.is_file():
                    feed_raw = json.loads(feed_path.read_text(encoding="utf-8"))
            if isinstance(feed_raw, list):
                for idx, card in enumerate(feed_raw):
                    if not isinstance(card, dict):
                        continue
                    data_pub = (
                        card.get("data_publicacao")
                        or card.get("published_at")
                        or card.get("created_at")
                        or card.get("publicado_em")
                        or ""
                    )
                    cards_feed.append({
                        "id": card.get("id") or f"feed-{idx + 1}",
                        "slug": card.get("slug") or "",
                        "titulo": card.get("titulo") or "",
                        "resumo": card.get("resumo") or "",
                        "analise": card.get("analise") or "",
                        "categoria": str(card.get("categoria") or "geopolitica").lower(),
                        "fonte_nome": card.get("fonte_nome") or "Radar Editorial",
                        "fonte_url": card.get("fonte_url") or "/radar",
                        "data_publicacao": data_pub,
                        "origem_v2": False,
                        "urgencia_score": int(card.get("urgencia_score") or 70),
                        "paises_envolvidos": list(card.get("paises_envolvidos") or []),
                        "palavras_chave": list(card.get("palavras_chave") or []),
                    })
        except Exception:
            pass

    # Ordena cronologicamente (mais recentes primeiro) antes de deduplicar por título
    todos_candidatos = sorted(itens_v2 + cards_feed, key=_timestamp_publicacao, reverse=True)
    titulos_vistos = set()
    combinados: List[Dict[str, Any]] = []
    for item in todos_candidatos:
        tit_norm = normalizar_fonte_key(item.get("titulo"))
        if not tit_norm or tit_norm in titulos_vistos:
            continue
        titulos_vistos.add(tit_norm)
        combinados.append(item)

    combinados = sortir_cards_rodizio_amplo(combinados, max_v2_topo=2)

    if isinstance(categoria, str) and categoria.lower() != "todos":
        cat_norm = categoria.lower().strip()
        combinados = [it for it in combinados if str(it.get("categoria", "")).lower() == cat_norm]

    item_mais_recente = max(
        (it for it in combinados if it.get("data_publicacao")),
        key=_timestamp_publicacao,
        default=None,
    )
    mais_recente_iso = item_mais_recente.get("data_publicacao") if item_mais_recente else None

    agora_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    carimbo = "Atualizado agora"
    if mais_recente_iso:
        try:
            dt = datetime.fromisoformat(mais_recente_iso.replace("Z", "+00:00"))
            agora_dt = datetime.now(timezone.utc)
            diff_min = int((agora_dt - dt).total_seconds() / 60)
            if diff_min < 0 and (agora_dt - dt).total_seconds() >= -300:
                diff_min = 0
            if 0 <= diff_min < 5:
                carimbo = "Atualizado agora"
            elif 5 <= diff_min < 60:
                carimbo = f"Atualizado há {diff_min} min"
            else:
                carimbo = _formatar_horario_editorial(dt)
        except Exception:
            carimbo = _formatar_horario_editorial()

    return {
        "ok": True,
        "cached": False,
        "source": "v2_hybrid",
        "atualizado_em": carimbo,
        "updatedAt": agora_iso,
        "total": len(combinados),
        "items": combinados,
    }


# ============================================================================
# 6. ROTA 3: POST /v2/gerar-coluna
# ============================================================================

async def _tarefa_background_gerar_coluna(
    tema: Optional[str],
    recurso_chave: str,
    db_url: str,
    dry_run: bool = False,
    slug_alvo: Optional[str] = None,
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
            slug_alvo=slug_alvo,
        )
        if db_url and not dry_run and exec_id is not None:
            try:
                with psycopg.connect(db_url, connect_timeout=8, prepare_threshold=None) as conn:
                    aprovado = bool(res and res.get("aprovado"))
                    erro_msg: Optional[str] = None
                    if not aprovado:
                        if res is None:
                            erro_msg = "Nenhum documento ou pauta disponível para gerar o artigo."
                        else:
                            aud = res.get("auditoria")
                            nota = getattr(aud, "nota_isencao", None)
                            probs = list(getattr(aud, "problemas_encontrados", None) or [])
                            resumo_probs = "; ".join(str(p) for p in probs[:3])
                            erro_msg = (
                                f"Coluna reprovada na auditoria (nota_isencao={nota}): {resumo_probs}"
                                if resumo_probs
                                else "Coluna reprovada na auditoria de isenção/fatos."
                            )[:500]
                    registrar_auditoria_execucao(
                        conn,
                        job_nome="orquestrador_editorial_v2",
                        recurso_chave=recurso_chave,
                        status="concluido" if aprovado else "falha",
                        documentos_novos=1 if res else 0,
                        eventos_atualizados=1 if aprovado else 0,
                        erro_detalhe=erro_msg,
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


@router.post("/v2/gerar-coluna", status_code=202, dependencies=[Depends(verificar_admin_token)])
async def gerar_coluna_editorial(
    req: GerarColunaRequest,
    background_tasks: BackgroundTasks,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Dispara o pipeline editorial sequencial de 4 agentes em `BackgroundTasks`.

    Respeita o Kill Switch (`publicacao_automatica_ativa` em `ai_config_operacional`) e a
    validação estrita de URLs internas contra o banco/sitemap (Regra 11 do GEMINI.md).
    """
    aplicar_no_cache_headers(response)
    db_url = obter_database_url()

    slug_base = re.sub(
        r"[^a-z0-9]+", "-", (req.slug or req.tema or "analise-automatica").lower()
    ).strip("-")[:80] or "analise-automatica"
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
            slug_alvo=req.slug,
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
        req.slug,
    )

    return {
        "ok": True,
        "status": "agendado_em_background",
        "recurso_chave": recurso_chave,
        "tema": req.tema,
        "slug_alvo": slug_base,
        "event_id": req.event_id,
        "model_id": MODELO_EDITORIAL,
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
    if not status:
        # Aprovação humana: somente colunas publicadas/aprovadas aparecem publicamente.
        filtros.append("(status IN ('publicado', 'aprovado') OR review_status IN ('publicado', 'aprovado'))")
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
        with _obter_cursor(conn) as cur:
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
# 8. ROTA 5: GET /v2/entenda-o-assunto, /v2/entenda-o-assunto/{slug} & /api/entenda-o-assunto
# ============================================================================

_MAPA_LABEL_CATEGORIA_ENTENDA = {
    "Geopolitica_Relacoes": "Geopolítica & Relações",
    "Geopolitica_Radar": "Geopolítica & Radar",
    "Economia_Comercio": "Economia & Comércio",
    "Economia": "Economia",
    "Politica": "Política & Instituições",
    "Sociedade_Cultura": "Sociedade & Cultura",
    "Cultura": "Sociedade & Cultura",
    "Mobilidade_Fronteiras": "Mobilidade & Fronteiras",
    "Ciencia_Clima": "Ciência & Clima",
    "Eleicoes": "Eleições & Democracia",
    "Resumo_Ultimas": "Panorama Global",
}


def _normalizar_slug_entenda_limpo(slug_raw: Optional[str]) -> str:
    s = (slug_raw or "").strip().strip("/").lower()
    return s.removeprefix("entenda-") or s


def _montar_artigo_entenda_unificado(
    bloco_entenda: Optional[Dict[str, Any]] = None,
    coluna_associada: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Normaliza um registro unificado de Entenda o Assunto para vitrine, detalhe e espelho JSON."""
    if not bloco_entenda and not coluna_associada:
        return None
    be = bloco_entenda or {}
    col = coluna_associada or {}

    raw_slug = col.get("slug") or be.get("slug") or ""
    clean_slug = _normalizar_slug_entenda_limpo(raw_slug)
    entenda_slug = be.get("slug") or (f"entenda-{clean_slug}" if clean_slug else "")
    titulo = be.get("titulo_assunto") or col.get("titulo") or clean_slug
    titulo_coluna = col.get("titulo") or titulo
    subtitulo = col.get("subtitulo") or be.get("pergunta_central") or ""
    pergunta_central = be.get("pergunta_central") or subtitulo
    resumo = be.get("resumo_executivo") or col.get("subtitulo") or col.get("resumo_seo") or ""
    contexto_historico = be.get("contexto_historico") or col.get("tese_central") or ""
    tese_central = col.get("tese_central") or contexto_historico
    corpo_markdown = col.get("corpo_markdown") or ""
    categoria = be.get("categoria") or col.get("categoria") or "Geopolitica_Relacoes"
    categoria_label = _MAPA_LABEL_CATEGORIA_ENTENDA.get(categoria, str(categoria).replace("_", " "))
    paises = list(be.get("paises_relacionados") or col.get("paises_abordados") or [])
    tags = list(be.get("tags") or col.get("tags") or [])
    tempo_leitura = int(col.get("tempo_leitura_min") or 5)
    impactos = be.get("impactos_praticos") or col.get("impactos_praticos") or []
    faqs = be.get("perguntas_frequentes") or []
    fontes = be.get("fontes_referencia") or col.get("fontes_citadas") or []
    links = be.get("links_acervo_interno") or col.get("links_acervo_interno") or []
    updated_at = col.get("updated_at") or be.get("updated_at")
    published_at = col.get("published_at") or updated_at
    atualizado_em = col.get("atualizado_em") or be.get("atualizado_em") or _formatar_horario_editorial()

    return {
        "slug": clean_slug,
        "entenda_slug": entenda_slug,
        "titulo": titulo,
        "titulo_coluna": titulo_coluna,
        "subtitulo": subtitulo,
        "pergunta_central": pergunta_central,
        "resumo": resumo,
        "contexto_historico": contexto_historico,
        "tese_central": tese_central,
        "corpo_markdown": corpo_markdown,
        "categoria": categoria,
        "categoria_label": categoria_label,
        "paises_relacionados": paises,
        "tags": tags,
        "tempo_leitura_min": tempo_leitura,
        "impactos_praticos": impactos,
        "perguntas_frequentes": faqs,
        "fontes_referencia": fontes,
        "links_acervo_interno": links,
        "rota_editoria": f"/entenda/{clean_slug}" if clean_slug else "/entenda",
        "analise_aprofundada": tese_central or contexto_historico,
        "palavras_chave": tags,
        "identificacao_editorial": "Síntese Rodando o Mundo",
        "atualizado_em": atualizado_em,
        "published_at": published_at,
        "updated_at": updated_at,
        "origem_v2": True,
    }


def _coletar_entenda_publicados(
    conn: Any,
    limit: int = 60,
    categoria: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Consulta artigos publicados para `/entenda` pareando `ai_colunas_editoriais` e `ai_entenda_o_assunto`."""
    if conn is None:
        return []

    filtros_col = ["(c.status IN ('publicado', 'aprovado') OR c.review_status IN ('publicado', 'aprovado'))"]
    params_col: List[Any] = []
    filtros_ea = ["status IN ('publicado', 'aprovado')"]
    params_ea: List[Any] = []

    if categoria and categoria.strip():
        cat_clean = categoria.strip()
        filtros_col.append("c.categoria = %s")
        params_col.append(cat_clean)
        filtros_ea.append("categoria = %s")
        params_ea.append(cat_clean)

    params_col.append(int(limit))
    params_ea.append(int(limit))
    where_col = " AND ".join(filtros_col)
    where_ea = " AND ".join(filtros_ea)

    artigos: List[Dict[str, Any]] = []
    slugs_vistos: set[str] = set()

    try:
        with _obter_cursor(conn) as cur:
            cur.execute(
                f"""
                SELECT
                    c.id AS col_id, c.slug AS col_slug, c.titulo AS col_titulo, c.subtitulo AS col_subtitulo,
                    c.tese_central, c.corpo_markdown, c.resumo_seo, c.categoria AS col_categoria,
                    c.paises_abordados, c.tags AS col_tags, c.tempo_leitura_min,
                    c.impactos_praticos AS col_impactos, c.fontes_citadas, c.links_acervo_interno AS col_links,
                    c.aviso_correcao_material, c.published_at, c.created_at AS col_created_at, c.updated_at AS col_updated_at,
                    ea.slug AS ea_slug, ea.titulo_assunto, ea.pergunta_central, ea.resumo_executivo,
                    ea.contexto_historico, ea.categoria AS ea_categoria, ea.paises_relacionados,
                    ea.tags AS ea_tags, ea.impactos_praticos AS ea_impactos, ea.perguntas_frequentes,
                    ea.fontes_referencia, ea.links_acervo_interno AS ea_links, ea.relevancia_score,
                    ea.updated_at AS ea_updated_at
                FROM ai_colunas_editoriais c
                LEFT JOIN LATERAL (
                    SELECT *
                    FROM ai_entenda_o_assunto e
                    WHERE e.slug = c.slug
                       OR e.slug = ('entenda-' || c.slug)
                       OR (e.id = c.id AND ABS(EXTRACT(EPOCH FROM (e.created_at - c.created_at))) < 30)
                    ORDER BY
                        CASE
                            WHEN e.slug = ('entenda-' || c.slug) THEN 0
                            WHEN e.slug = c.slug THEN 1
                            ELSE 2
                        END,
                        e.updated_at DESC
                    LIMIT 1
                ) ea ON TRUE
                WHERE {where_col}
                ORDER BY COALESCE(c.published_at, c.created_at) DESC, c.updated_at DESC
                LIMIT %s;
                """,
                tuple(params_col),
            )
            for row in cur.fetchall():
                r = _row_to_dict(cur, row)
                col_dict = {
                    "slug": r.get("col_slug"),
                    "titulo": r.get("col_titulo"),
                    "subtitulo": r.get("col_subtitulo"),
                    "tese_central": r.get("tese_central"),
                    "corpo_markdown": r.get("corpo_markdown"),
                    "resumo_seo": r.get("resumo_seo"),
                    "categoria": r.get("col_categoria"),
                    "paises_abordados": list(r.get("paises_abordados") or []),
                    "tags": list(r.get("col_tags") or []),
                    "tempo_leitura_min": int(r.get("tempo_leitura_min") or 5),
                    "impactos_praticos": _decodificar_jsonb(r.get("col_impactos"), []),
                    "fontes_citadas": _decodificar_jsonb(r.get("fontes_citadas"), []),
                    "links_acervo_interno": _decodificar_jsonb(r.get("col_links"), []),
                    "atualizado_em": _formatar_horario_editorial(r.get("col_updated_at")),
                    "published_at": _serializar_valor_temporal(r.get("published_at")),
                    "updated_at": _serializar_valor_temporal(r.get("col_updated_at")),
                }
                be_dict = None
                if r.get("ea_slug") or r.get("titulo_assunto"):
                    be_dict = {
                        "slug": r.get("ea_slug"),
                        "titulo_assunto": r.get("titulo_assunto"),
                        "pergunta_central": r.get("pergunta_central"),
                        "resumo_executivo": r.get("resumo_executivo"),
                        "contexto_historico": r.get("contexto_historico"),
                        "categoria": r.get("ea_categoria"),
                        "paises_relacionados": list(r.get("paises_relacionados") or []),
                        "tags": list(r.get("ea_tags") or []),
                        "impactos_praticos": _decodificar_jsonb(r.get("ea_impactos"), []),
                        "perguntas_frequentes": _decodificar_jsonb(r.get("perguntas_frequentes"), []),
                        "fontes_referencia": _decodificar_jsonb(r.get("fontes_referencia"), []),
                        "links_acervo_interno": _decodificar_jsonb(r.get("ea_links"), []),
                        "relevancia_score": int(r.get("relevancia_score") or 85),
                        "atualizado_em": _formatar_horario_editorial(r.get("ea_updated_at")),
                        "updated_at": _serializar_valor_temporal(r.get("ea_updated_at")),
                    }
                art = _montar_artigo_entenda_unificado(bloco_entenda=be_dict, coluna_associada=col_dict)
                if art and art["slug"] and art["slug"] not in slugs_vistos:
                    slugs_vistos.add(art["slug"])
                    if be_dict and be_dict.get("slug"):
                        slugs_vistos.add(_normalizar_slug_entenda_limpo(be_dict["slug"]))
                    artigos.append(art)

            if len(artigos) < int(limit):
                cur.execute(
                    f"""
                    SELECT
                        slug AS ea_slug, titulo_assunto, pergunta_central, resumo_executivo,
                        contexto_historico, categoria AS ea_categoria, paises_relacionados,
                        tags AS ea_tags, impactos_praticos AS ea_impactos, perguntas_frequentes,
                        fontes_referencia, links_acervo_interno AS ea_links, relevancia_score,
                        updated_at AS ea_updated_at
                    FROM ai_entenda_o_assunto
                    WHERE {where_ea}
                    ORDER BY updated_at DESC
                    LIMIT %s;
                    """,
                    tuple(params_ea),
                )
                for row_ea in cur.fetchall():
                    e = _row_to_dict(cur, row_ea)
                    clean_ea = _normalizar_slug_entenda_limpo(e.get("ea_slug"))
                    if not clean_ea or clean_ea in slugs_vistos:
                        continue
                    be_only = {
                        "slug": e.get("ea_slug"),
                        "titulo_assunto": e.get("titulo_assunto"),
                        "pergunta_central": e.get("pergunta_central"),
                        "resumo_executivo": e.get("resumo_executivo"),
                        "contexto_historico": e.get("contexto_historico"),
                        "categoria": e.get("ea_categoria"),
                        "paises_relacionados": list(e.get("paises_relacionados") or []),
                        "tags": list(e.get("ea_tags") or []),
                        "impactos_praticos": _decodificar_jsonb(e.get("ea_impactos"), []),
                        "perguntas_frequentes": _decodificar_jsonb(e.get("perguntas_frequentes"), []),
                        "fontes_referencia": _decodificar_jsonb(e.get("fontes_referencia"), []),
                        "links_acervo_interno": _decodificar_jsonb(e.get("ea_links"), []),
                        "relevancia_score": int(e.get("relevancia_score") or 85),
                        "atualizado_em": _formatar_horario_editorial(e.get("ea_updated_at")),
                        "updated_at": _serializar_valor_temporal(e.get("ea_updated_at")),
                    }
                    art = _montar_artigo_entenda_unificado(bloco_entenda=be_only, coluna_associada=None)
                    if art and art["slug"]:
                        slugs_vistos.add(art["slug"])
                        artigos.append(art)
                        if len(artigos) >= int(limit):
                            break
    except Exception as exc:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        print(f"[Aviso] Erro ao coletar artigos publicados de Entenda o assunto: {exc}")

    return artigos[: int(limit)]


def _sincronizar_espelho_entenda_v2(conn: Any) -> Dict[str, Any]:
    """Atualiza o snapshot público `entenda_v2` em `ai_pipeline_state` e em `data/entenda_v2.json`."""
    artigos = _coletar_entenda_publicados(conn, limit=60)
    agora_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    snapshot = {
        "ok": True,
        "updatedAt": agora_iso,
        "atualizado_em": _formatar_horario_editorial(),
        "total": len(artigos),
        "artigos": artigos,
        "colunas": artigos,
    }
    try:
        from src.estado_db import gravar_estado

        gravar_estado("entenda_v2", snapshot, conn=conn)
    except Exception as exc:  # noqa: BLE001
        print(f"[Aviso] Erro ao gravar estado entenda_v2 no banco: {exc}")

    try:
        caminho = _caminho_arquivo_estado("entenda_v2")
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        print(f"[Aviso] Erro ao gravar espelho data/entenda_v2.json: {exc}")

    return snapshot


@router.get("/v2/entenda-o-assunto")
def listar_entenda_o_assunto(
    response: Response,
    categoria: Optional[str] = Query(None, description="Filtrar por categoria editorial"),
    limit: int = Query(60, ge=1, le=100, description="Quantidade máxima de artigos"),
    _t: Optional[str] = Query(None, description="Cache-busting timestamp"),
    refresh: Optional[str] = Query(None, description="Forçar refresh sem cache"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lista artigos publicados de Entenda o Assunto para a vitrine pública `/entenda`."""
    aplicar_no_cache_headers(response)
    agora_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    limit_int = int(limit) if isinstance(limit, int) else 60
    cat_val = categoria if isinstance(categoria, str) and categoria.strip() else None

    if conn is not None:
        artigos = _coletar_entenda_publicados(conn, limit=limit_int, categoria=cat_val)
        return {
            "ok": True,
            "source": "database",
            "identificacao_editorial": "Síntese Rodando o Mundo",
            "atualizado_em": _formatar_horario_editorial(),
            "updatedAt": agora_iso,
            "total": len(artigos),
            "artigos": artigos,
            "colunas": artigos,
        }

    snap = None
    try:
        from src.estado_db import ler_estado

        snap = ler_estado("entenda_v2")
    except Exception:  # noqa: BLE001
        snap = None
    if not isinstance(snap, dict):
        snap = _ler_estado_arquivo("entenda_v2")

    artigos_fb: List[Dict[str, Any]] = []
    if isinstance(snap, dict):
        brutos = snap.get("artigos") or snap.get("colunas") or []
        if isinstance(brutos, list):
            artigos_fb = [
                a for a in brutos
                if isinstance(a, dict) and (not cat_val or a.get("categoria") == cat_val)
            ][:limit_int]

    return {
        "ok": True,
        "source": "entenda_snapshot",
        "identificacao_editorial": "Síntese Rodando o Mundo",
        "atualizado_em": (snap or {}).get("atualizado_em") or _formatar_horario_editorial(),
        "updatedAt": (snap or {}).get("updatedAt") or agora_iso,
        "total": len(artigos_fb),
        "artigos": artigos_fb,
        "colunas": artigos_fb,
    }

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
        with _obter_cursor(conn) as cur:
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
                    id, slug, titulo, subtitulo, tese_central, corpo_markdown,
                    resumo_seo, categoria, paises_abordados, tags,
                    tempo_leitura_min, impactos_praticos, fontes_citadas,
                    links_acervo_interno, aviso_correcao_material,
                    status, review_status, published_at, created_at, updated_at
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
                if bloco_entenda is None and c.get("id") is not None and c.get("created_at") is not None:
                    cur.execute(
                        """
                        SELECT
                            slug, titulo_assunto, pergunta_central, resumo_executivo,
                            contexto_historico, categoria, paises_relacionados, tags,
                            impactos_praticos, perguntas_frequentes, fontes_referencia,
                            links_acervo_interno, relevancia_score, status, updated_at
                        FROM ai_entenda_o_assunto
                        WHERE id = %s AND ABS(EXTRACT(EPOCH FROM (created_at - %s))) < 30
                        LIMIT 1;
                        """,
                        (c.get("id"), c.get("created_at")),
                    )
                    row_legado = cur.fetchone()
                    if row_legado:
                        d_leg = dict(row_legado)
                        bloco_entenda = {
                            "slug": d_leg.get("slug"),
                            "titulo_assunto": d_leg.get("titulo_assunto"),
                            "pergunta_central": d_leg.get("pergunta_central"),
                            "resumo_executivo": d_leg.get("resumo_executivo"),
                            "contexto_historico": d_leg.get("contexto_historico"),
                            "categoria": d_leg.get("categoria"),
                            "paises_relacionados": list(d_leg.get("paises_relacionados") or []),
                            "tags": list(d_leg.get("tags") or []),
                            "impactos_praticos": _decodificar_jsonb(d_leg.get("impactos_praticos"), []),
                            "perguntas_frequentes": _decodificar_jsonb(d_leg.get("perguntas_frequentes"), []),
                            "fontes_referencia": _decodificar_jsonb(d_leg.get("fontes_referencia"), []),
                            "links_acervo_interno": _decodificar_jsonb(d_leg.get("links_acervo_interno"), []),
                            "relevancia_score": int(d_leg.get("relevancia_score") or 85),
                            "identificacao_editorial": "Síntese Rodando o Mundo",
                            "atualizado_em": _formatar_horario_editorial(d_leg.get("updated_at")),
                            "updated_at": _serializar_valor_temporal(d_leg.get("updated_at")),
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

    artigo_normalizado = _montar_artigo_entenda_unificado(
        bloco_entenda=bloco_entenda,
        coluna_associada=coluna_associada,
    )

    return {
        "ok": True,
        "slug": slug_limpo,
        "identificacao_editorial": "Síntese Rodando o Mundo",
        "artigo": artigo_normalizado,
        "entenda_o_assunto": bloco_entenda,
        "coluna_editorial": coluna_associada,
        "painel_verificacao": painel_verificacao.model_dump(),
    }


@router.get("/api/entenda-o-assunto")
def espelho_api_entenda_o_assunto(
    response: Response,
    slug: Optional[str] = Query(None, description="Slug opcional para consultar detalhe"),
    acao: Optional[str] = Query("entenda", description="entenda | colunas"),
    categoria: Optional[str] = Query(None, description="Filtrar por categoria editorial"),
    limit: int = Query(60, ge=1, le=100),
    _t: Optional[str] = Query(None, description="Cache-busting timestamp"),
    refresh: Optional[str] = Query(None, description="Forçar refresh sem cache"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Espelho FastAPI de `/api/entenda-o-assunto` para desenvolvimento local e proxy direto."""
    slug_clean = (slug or "").strip() if isinstance(slug, str) else ""
    if slug_clean:
        return obter_entenda_o_assunto_por_slug(
            slug=slug_clean,
            response=response,
            _t=_t,
            refresh=refresh,
            conn=conn,
        )
    return listar_entenda_o_assunto(
        response=response,
        categoria=categoria,
        limit=limit,
        _t=_t,
        refresh=refresh,
        conn=conn,
    )


# ============================================================================
# 9. ADMIN LITE — INTELIGÊNCIA & ATLAS (/v2/admin/*)
# ============================================================================

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


class AdminFonteAprovarRequest(BaseModel):
    aprovar: bool = True


class AdminFonteSugestaoRequest(BaseModel):
    tema: str = Field(min_length=2, max_length=300)
    categoria: Optional[str] = Field(default=None, max_length=60)
    quantidade: int = Field(default=3, ge=1, le=5)


class AdminColunaStatusRequest(BaseModel):
    status: Literal["publicado", "aprovado", "rejeitado", "rascunho_auditado"]


class AdminEventoStatusRequest(BaseModel):
    status: Literal["aguardando_revisao", "publicado", "arquivado", "excluido"]


class AdminEditarSinteseRequest(BaseModel):
    sintese_com_ressalvas: str = Field(min_length=10, max_length=8000)
    tipo_alteracao: Literal["ajuste_menor", "correcao_material"]
    errata: Optional[str] = Field(default=None, max_length=1000)


class AdminRadarManualCreateRequest(BaseModel):
    """Card manual criado via painel administrativo (Radar)."""
    slug: Optional[str] = Field(default=None, max_length=200)
    titulo: str = Field(min_length=3, max_length=255)
    resumo: Optional[str] = Field(default=None, max_length=2000)
    contexto: Optional[str] = Field(default=None, max_length=8000)
    categoria: Optional[str] = Field(default=None, max_length=50)
    urgencia_score: Optional[int] = Field(default=None, ge=0, le=100)
    fonte_nome: Optional[str] = Field(default=None, max_length=150)
    fonte_url: Optional[str] = Field(default=None, max_length=2000)
    pais_regiao: Optional[str] = Field(default=None, max_length=8)
    coordenadas_geojson: Optional[Dict[str, Any]] = None
    data_publicacao: Optional[str] = Field(default=None, max_length=40)
    origem_manual: Optional[bool] = Field(default=True)


class AdminRadarManualUpdateRequest(BaseModel):
    """Card manual ou feed do Radar atualizado via painel administrativo (PATCH parcial)."""
    titulo: Optional[str] = Field(default=None, max_length=255)
    resumo: Optional[str] = Field(default=None, max_length=2000)
    contexto: Optional[str] = Field(default=None, max_length=8000)
    categoria: Optional[str] = Field(default=None, max_length=50)
    urgencia_score: Optional[int] = Field(default=None, ge=0, le=100)
    fonte_nome: Optional[str] = Field(default=None, max_length=150)
    fonte_url: Optional[str] = Field(default=None, max_length=2000)
    pais_regiao: Optional[str] = Field(default=None, max_length=8)
    palavras_chave: Optional[List[str]] = Field(default=None, max_length=20)
    data_publicacao: Optional[str] = Field(default=None, max_length=40)
    fixado: Optional[bool] = None


class AdminNoticiasQuentesUpdateRequest(BaseModel):
    """Notícia quente atualizada via painel administrativo (PATCH parcial)."""
    titulo_curto: Optional[str] = Field(default=None, max_length=160)
    resumo_pulso: Optional[str] = Field(default=None, max_length=2000)
    impacto_pratico: Optional[str] = Field(default=None, max_length=2000)
    categoria: Optional[str] = Field(default=None, max_length=50)
    urgencia_score: Optional[int] = Field(default=None, ge=0, le=100)
    relevancia_score: Optional[int] = Field(default=None, ge=0, le=100)
    nivel_confianca: Optional[str] = Field(default=None, max_length=20)
    ttl_horas: Optional[int] = Field(default=None, ge=1, le=168)
    horas_em_destaque: Optional[int] = Field(default=None, ge=1, le=24)
    status: Optional[str] = Field(default=None, max_length=30)
    destaque_ate: Optional[str] = Field(default=None, max_length=40)
    expires_at: Optional[str] = Field(default=None, max_length=40)
    paises_envolvidos: Optional[List[str]] = Field(default=None)
    palavras_chave: Optional[List[str]] = Field(default=None)
    veiculos_origem: Optional[List[str]] = Field(default=None)
    fontes_urls: Optional[List[str]] = Field(default=None)


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


@router.get("/v2/admin/bot/ddg/status", dependencies=[Depends(verificar_admin_token)])
async def admin_status_bot_ddg(response: Response) -> Dict[str, Any]:
    """Retorna o status atual do Bot DuckDuckGo News (`ddgs`) e amostra de `data/noticias_ddg.json`."""
    aplicar_no_cache_headers(response)
    from scripts.ddg_news_feeder import MOTOR_LIB, ddgs_disponivel

    raiz = Path(__file__).resolve().parents[1]
    ddg_file = raiz / "data" / "noticias_ddg.json"

    status_arquivo: Dict[str, Any] = {
        "existe": False,
        "atualizadoEm": None,
        "idade_minutos": None,
        "total_itens": 0,
        "fonteMotor": None,
        "ultima_query": None,
        "amostra_itens": [],
    }

    if ddg_file.is_file():
        try:
            dados = json.loads(ddg_file.read_text(encoding="utf-8"))
            if isinstance(dados, dict):
                items = dados.get("items") or []
                status_arquivo["existe"] = True
                status_arquivo["atualizadoEm"] = dados.get("atualizadoEm")
                status_arquivo["fonteMotor"] = dados.get("fonteMotor") or f"DuckDuckGo News ({MOTOR_LIB or 'ddgs'})"
                status_arquivo["ultima_query"] = dados.get("ultimaQuery")
                status_arquivo["total_itens"] = len(items)

                if dados.get("atualizadoEm"):
                    try:
                        dt = datetime.fromisoformat(dados["atualizadoEm"].replace("Z", "+00:00"))
                        idade = int((datetime.now(timezone.utc) - dt).total_seconds() / 60)
                        status_arquivo["idade_minutos"] = max(0, idade)
                    except Exception:
                        pass

                status_arquivo["amostra_itens"] = [
                    {
                        "relevancia": it.get("relevancia"),
                        "codigoPais": it.get("codigoPais"),
                        "categoria": it.get("categoria"),
                        "titulo": it.get("titulo"),
                        "fonte": it.get("fonte"),
                        "url": it.get("url"),
                        "publicadoEm": it.get("publicadoEm"),
                    }
                    for it in items[:8]
                    if isinstance(it, dict)
                ]
        except Exception:
            pass

    return {
        "ok": True,
        "lib_disponivel": ddgs_disponivel(),
        "motor": MOTOR_LIB or "ddgs",
        "arquivo": status_arquivo,
    }


def _gerar_slug_ddg_deterministico(titulo: str, url: str) -> str:
    """Gera slug determinístico `ddg-<slug_limpo>-<hash8_url>` (máx. 200 chars)."""
    normalizado = unicodedata.normalize("NFKD", titulo or "").encode("ascii", "ignore").decode("ascii")
    slug_limpo = re.sub(r"[^a-z0-9]+", "-", normalizado.lower()).strip("-") or "noticia"
    hash8 = hashlib.sha256((url or "").encode("utf-8")).hexdigest()[:8]
    # Prefixo "ddg-" (4) + "-" (1) + hash8 (8) = 13 chars -> máx. 187 chars para slug_limpo
    return f"ddg-{slug_limpo[:187]}-{hash8}"


def _enfileirar_itens_ddg_eventos(
    conn: Any,
    items: List[Dict[str, Any]],
    ref_time: Optional[datetime] = None,
) -> int:
    """Faz upsert dos itens coletados pelo DDG em `ai_eventos` e `ai_conteudos_gerados`."""
    if conn is None or not hasattr(conn, "cursor") or not items:
        return 0

    ref = ref_time or datetime.now(timezone.utc)
    destaque_ate = ref + timedelta(hours=24)
    enfileirados = 0

    with conn.cursor() as cur:
        for idx, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            titulo = str(item.get("titulo") or "").strip()[:220]
            url = str(item.get("url") or "").strip()
            if not titulo or not url:
                continue

            slug = _gerar_slug_ddg_deterministico(titulo, url)
            resumo = str(item.get("resumo") or titulo).strip()
            fonte = str(item.get("fonte") or "DuckDuckGo News").strip()[:80]
            categoria = str(item.get("categoriaRadar") or item.get("categoria") or "geopolitica").strip()[:50]
            codigo_pais = str(item.get("codigoPais") or "GL").strip().upper()[:10]
            paises = [codigo_pais] if codigo_pais else ["GL"]

            try:
                pos = int(item.get("relevancia") or idx)
            except (TypeError, ValueError):
                pos = idx
            relevancia_score = max(60, min(95, 96 - pos * 2))
            urgencia_score = max(60, min(90, 88 - pos * 2))

            cur.execute(
                """
                INSERT INTO ai_eventos (
                    slug, titulo_evento, categoria, paises_envolvidos,
                    urgencia_score, relevancia_score, nivel_confianca,
                    destaque_ate, status, updated_at
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, %s, 'media',
                    %s, 'aguardando_revisao', %s
                )
                ON CONFLICT (slug) DO UPDATE SET
                    titulo_evento = EXCLUDED.titulo_evento,
                    categoria = EXCLUDED.categoria,
                    paises_envolvidos = EXCLUDED.paises_envolvidos,
                    urgencia_score = EXCLUDED.urgencia_score,
                    relevancia_score = EXCLUDED.relevancia_score,
                    updated_at = EXCLUDED.updated_at
                RETURNING id;
                """,
                (
                    slug,
                    titulo,
                    categoria,
                    paises,
                    urgencia_score,
                    relevancia_score,
                    destaque_ate,
                    ref,
                ),
            )
            ev_row = cur.fetchone()
            if not ev_row:
                continue
            ev_id = ev_row["id"] if isinstance(ev_row, dict) else ev_row[0]

            cur.execute(
                "SELECT 1 FROM ai_conteudos_gerados WHERE event_id = %s LIMIT 1;",
                (ev_id,),
            )
            if cur.fetchone() is None:
                sintese_texto = f"{resumo}\n\nFonte: {fonte} ({url})"
                payload_conteudo = {
                    "sintese_com_ressalvas": sintese_texto,
                    "fonte_url": url,
                    "fonte_nome": fonte,
                    "origem": "ddg_news",
                }
                cur.execute(
                    """
                    INSERT INTO ai_conteudos_gerados (
                        event_id, tipo_conteudo, versao, tipo_alteracao,
                        payload_json, evidence_ids, model_id, prompt_version, review_status
                    ) VALUES (
                        %s, 'sintese_comparada', 1, 'criacao',
                        %s, '{}', 'ddgs', 'ddg_news_v1', 'aguardando_revisao'
                    );
                    """,
                    (ev_id, Jsonb(payload_conteudo)),
                )

            enfileirados += 1

    if hasattr(conn, "commit"):
        conn.commit()
    return enfileirados


@router.post("/v2/admin/bot/ddg/executar", dependencies=[Depends(verificar_admin_token)])
async def admin_executar_bot_ddg(
    response: Response,
    payload_req: Optional[ExecutarDdgRequest] = Body(default=None),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Dispara a coleta em tempo real via DuckDuckGo News (`ddgs`), atualiza `data/noticias_ddg.json` e enfileira em `ai_eventos`."""
    import asyncio
    from scripts.ddg_news_feeder import ddgs_disponivel, executar_coleta_ddg

    aplicar_no_cache_headers(response)
    if not ddgs_disponivel():
        raise HTTPException(
            status_code=503,
            detail="Biblioteca 'ddgs' / 'duckduckgo-search' não instalada no servidor.",
        )

    req = payload_req or ExecutarDdgRequest()
    t0 = time.time()
    try:
        resultado = await asyncio.to_thread(
            executar_coleta_ddg,
            query=req.query,
            region=req.region,
            timelimit=req.timelimit,
            max_results=req.max_results,
            dry_run=req.dry_run,
        )
    except Exception as exc:
        duracao_ms = int((time.time() - t0) * 1000)
        if conn is not None and hasattr(conn, "cursor"):
            try:
                registrar_auditoria_execucao(
                    conn,
                    job_nome="bot_ddg_news_feeder",
                    recurso_chave=77112244,
                    status="erro",
                    documentos_novos=0,
                    eventos_atualizados=0,
                    latencia_ms=duracao_ms,
                )
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Falha ao executar DuckDuckGo News: {exc}")

    duracao_ms = int((time.time() - t0) * 1000)
    itens_coletados = resultado.get("items") or []
    total_itens = int(resultado.get("total") or len(itens_coletados))
    eventos_enfileirados = 0

    if not req.dry_run and conn is not None and hasattr(conn, "cursor") and itens_coletados:
        try:
            eventos_enfileirados = _enfileirar_itens_ddg_eventos(conn, itens_coletados)
        except Exception:
            if hasattr(conn, "rollback"):
                try:
                    conn.rollback()
                except Exception:
                    pass

    if conn is not None and hasattr(conn, "cursor"):
        try:
            registrar_auditoria_execucao(
                conn,
                job_nome="bot_ddg_news_feeder",
                recurso_chave=77112244,
                status="concluido",
                documentos_novos=total_itens,
                eventos_atualizados=eventos_enfileirados if not req.dry_run else total_itens,
                latencia_ms=duracao_ms,
            )
        except Exception:
            pass

    return {
        "ok": True,
        "status": "concluido",
        "job_nome": "bot_ddg_news_feeder",
        "duracao_ms": duracao_ms,
        "dry_run": req.dry_run,
        "total_itens": total_itens,
        "eventos_enfileirados": eventos_enfileirados,
        "fonteMotor": resultado.get("fonteMotor", "DuckDuckGo News (ddgs)"),
        "atualizadoEm": resultado.get("atualizadoEm"),
        "ultimaQuery": resultado.get("ultimaQuery"),
        "items": itens_coletados,
    }


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


def _normalizar_url_fonte(url: str) -> str:
    """Normaliza URL para comparação de duplicidade (sem esquema, www, query e barra final)."""
    valor = (url or "").strip().lower()
    valor = re.sub(r"^https?://", "", valor)
    valor = re.sub(r"^www\.", "", valor)
    valor = valor.split("#", 1)[0].split("?", 1)[0]
    return valor.rstrip("/")


def _dominio_url(url: str) -> str:
    normal = _normalizar_url_fonte(url)
    return normal.split("/", 1)[0]


@router.post("/v2/admin/fontes/sugerir", dependencies=[Depends(verificar_admin_token)])
def admin_sugerir_fonte(
    payload: AdminFonteSugestaoRequest,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Usa o Gemini para sugerir fontes (RSS/fonte primária) do segmento informado, evitando duplicatas."""
    aplicar_no_cache_headers(response)

    chave = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not chave or chave.startswith("sua_chave"):
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY não configurada no servidor; sugestão por IA indisponível.",
        )

    cadastradas: List[Dict[str, str]] = []
    if conn is not None:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT nome, url FROM ai_fontes_referencia ORDER BY nome;")
                cadastradas = [
                    {"nome": str(r.get("nome") or ""), "url": str(r.get("url") or "")}
                    for r in cur.fetchall()
                ]
        except Exception:  # noqa: BLE001
            cadastradas = []

    lista_atual = "\n".join(f"- {f['nome']} ({f['url']})" for f in cadastradas[:400]) or "- (nenhuma)"
    quantidade = int(payload.quantidade or 3)
    segmento = (payload.categoria or "").strip()

    prompt = f"""Você é curador de fontes do portal jornalístico Rodando o Mundo.
Tema/assunto pedido pelo editor: {payload.tema}
Segmento editorial: {segmento or 'livre'}

Fontes JÁ CADASTRADAS (NÃO repita nenhuma delas nem o mesmo domínio):
{lista_atual}

Sugira exatamente {quantidade} fonte(s) NOVAS e reais para cobrir esse tema.
Regras:
1. Priorize fontes primárias oficiais (governo, banco central, organismos internacionais, institutos de pesquisa) e imprensa de referência.
2. A URL deve ser um feed RSS/Atom real e estável OU a página oficial da fonte. Nunca invente URLs.
3. Se não tiver certeza de uma URL válida, escolha outra fonte que você conheça bem.
4. Responda SOMENTE com JSON válido, sem markdown, no formato:
{{"sugestoes":[{{"nome":"...","url":"https://...","tipo_fonte":"rss_feed|fonte_primaria|youtube_rss|artigo_avulso","cadencia":"pulso_30m|ciclo_3h","pais_iso":"BR","justificativa":"por que cobre o tema"}}]}}
"""

    modelo_env = (os.getenv("GEMINI_SUGESTAO_MODEL") or os.getenv("GEMINI_MODEL") or "").strip()
    modelos_tentar = [modelo_env] if modelo_env else []
    modelos_tentar += ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"]
    # remove duplicatas mantendo ordem
    vistos_modelo = set()
    modelos_tentar = [m for m in modelos_tentar if not (m in vistos_modelo or vistos_modelo.add(m))]

    texto = ""
    ultimo_erro = None
    for idx_m, modelo in enumerate(modelos_tentar):
        try:
            from google import genai
            from google.genai import types as genai_types

            client = genai.Client(http_options=genai_types.HttpOptions(timeout=45_000))
            resposta = client.models.generate_content(model=modelo, contents=prompt)
            texto = (getattr(resposta, "text", None) or "").strip()
            if texto:
                break
        except Exception as exc:  # noqa: BLE001
            ultimo_erro = exc
            texto = ""
            msg_err = str(exc).upper()
            if any(k in msg_err for k in ("429", "RESOURCE_EXHAUSTED", "503", "UNAVAILABLE")):
                time.sleep(min(2 * (idx_m + 1), 6))
            continue
    if not texto:
        raise HTTPException(status_code=502, detail=f"Falha ao consultar a IA: {ultimo_erro}") from ultimo_erro

    texto = re.sub(r"^```(?:json)?", "", texto).strip()
    texto = re.sub(r"```$", "", texto).strip()
    try:
        dados = json.loads(texto)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="A IA retornou um formato inválido.") from exc

    sugestoes_brutas = dados.get("sugestoes") if isinstance(dados, dict) else None
    if not isinstance(sugestoes_brutas, list):
        sugestoes_brutas = []

    urls_cadastradas = {_normalizar_url_fonte(f["url"]) for f in cadastradas}
    dominios_cadastrados = {_dominio_url(f["url"]) for f in cadastradas if f.get("url")}

    sugestoes: List[Dict[str, Any]] = []
    vistos: set[str] = set()
    for item in sugestoes_brutas:
        if not isinstance(item, dict):
            continue
        nome = str(item.get("nome") or "").strip()[:150]
        url = str(item.get("url") or "").strip()[:2000]
        if not nome or not url.lower().startswith("http"):
            continue
        chave_url = _normalizar_url_fonte(url)
        if chave_url in vistos:
            continue
        vistos.add(chave_url)
        ja_cadastrada = chave_url in urls_cadastradas or _dominio_url(url) in dominios_cadastrados
        tipo = str(item.get("tipo_fonte") or "rss_feed").strip()
        if tipo not in {"rss_feed", "fonte_primaria", "youtube_rss", "artigo_avulso"}:
            tipo = "rss_feed"
        cadencia = str(item.get("cadencia") or "pulso_30m").strip()
        if cadencia not in {"pulso_30m", "ciclo_3h"}:
            cadencia = "pulso_30m"
        sugestoes.append(
            {
                "nome": nome,
                "url": url,
                "tipo_fonte": tipo,
                "cadencia": cadencia,
                "pais_iso": str(item.get("pais_iso") or "BR").strip()[:2].upper(),
                "justificativa": str(item.get("justificativa") or "").strip()[:600],
                "ja_cadastrada": ja_cadastrada,
            }
        )

    return {"ok": True, "tema": payload.tema, "sugestoes": sugestoes[:quantidade]}


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


@router.patch("/v2/admin/fontes/{fonte_id}/aprovar", dependencies=[Depends(verificar_admin_token)])
def admin_aprovar_fonte(
    fonte_id: int,
    payload: AdminFonteAprovarRequest,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Aprova ou reverte para pendente uma fonte em `ai_fontes_referencia`."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    aprovar = True if payload.aprovar is None else bool(payload.aprovar)
    if aprovar:
        politica_status = "aprovada"
        coleta_permitida = True
        revisado_por = "Revisado por Equipe RoM"
        revisado_em = datetime.now(timezone.utc)
    else:
        politica_status = "pendente"
        coleta_permitida = False
        revisado_por = None
        revisado_em = None

    with db.cursor() as cur:
        cur.execute(
            """
            UPDATE ai_fontes_referencia
            SET politica_uso_status = %s,
                coleta_permitida = %s,
                revisado_por = %s,
                revisado_em = %s
            WHERE id = %s
            RETURNING id, politica_uso_status, coleta_permitida, revisado_por, revisado_em, ativo;
            """,
            (politica_status, coleta_permitida, revisado_por, revisado_em, fonte_id),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Fonte não encontrada.")
    db.commit()
    fonte = dict(row)
    if "revisado_em" in fonte:
        fonte["revisado_em"] = _serializar_valor_temporal(fonte["revisado_em"])
    return {"ok": True, "fonte": fonte}


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
    status: Optional[str] = Query(
        None,
        description="Filtra por status (aguardando_revisao/publicado/arquivado/excluido)",
    ),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lista os últimos eventos de `ai_eventos` com a síntese mais recente e contagens por status."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    status_norm = (status if isinstance(status, str) else "").strip().lower()
    limite_int = int(limite) if isinstance(limite, (int, str)) and str(limite).isdigit() else 30
    filtro_sql = "WHERE e.status = %s" if status_norm else ""
    params: List[Any] = [status_norm] if status_norm else []
    params.append(limite_int)
    with db.cursor() as cur:
        cur.execute(
            f"""
            SELECT
                e.id, e.slug, e.titulo_evento, e.categoria, e.nivel_confianca,
                e.status, e.aviso_correcao_material, e.created_at, e.updated_at,
                (
                    SELECT cg.payload_json->>'sintese_com_ressalvas'
                    FROM ai_conteudos_gerados cg
                    WHERE cg.event_id = e.id
                    ORDER BY cg.versao DESC
                    LIMIT 1
                ) AS sintese_com_ressalvas
            FROM ai_eventos e
            {filtro_sql}
            ORDER BY e.updated_at DESC, e.id DESC
            LIMIT %s;
            """,
            tuple(params),
        )
        rows = cur.fetchall()
        cur.execute("SELECT status, COUNT(*) AS total FROM ai_eventos GROUP BY status;")
        contagens_rows = cur.fetchall()
    eventos = [
        {
            **dict(r),
            "created_at": _serializar_valor_temporal(r.get("created_at")),
            "updated_at": _serializar_valor_temporal(r.get("updated_at")),
        }
        for r in rows
    ]
    contagens = {str(r["status"]): int(r["total"]) for r in contagens_rows}
    contagens["total"] = sum(contagens.values())
    return {"ok": True, "eventos": eventos, "contagens": contagens}


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


@router.delete("/v2/admin/eventos/{event_id}", dependencies=[Depends(verificar_admin_token)])
def admin_excluir_evento(
    event_id: int,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Exclusão lógica de evento (`status = 'excluido'`), preservando auditoria e permitindo restaurar."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    with db.cursor() as cur:
        cur.execute(
            """
            UPDATE ai_eventos
            SET status = 'excluido', updated_at = NOW()
            WHERE id = %s
            RETURNING id, status, updated_at;
            """,
            (event_id,),
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
# 16. ADMIN RADAR MANUAL & NOTÍCIAS QUENTES CRUD (CONTRATO ADMIN-REBUILD-MODERNO-2026-11)
# ============================================================================

def _serializar_card_manual_response(card: Dict[str, Any]) -> Dict[str, Any]:
    """Serializa um card manual para o contrato do Radar (Seção 4.7 do contrato da task)."""
    return {
        "id": str(card.get("id") or f"manual-{card.get('slug')}"),
        "slug": str(card.get("slug") or ""),
        "titulo": str(card.get("titulo") or ""),
        "resumo": str(card.get("resumo") or ""),
        "analise": str(card.get("analise") or ""),
        "categoria": str(card.get("categoria") or "geral").strip().lower(),
        "fonte_nome": str(card.get("fonte_nome") or ""),
        "fonte_url": str(card.get("fonte_url") or ""),
        "data_publicacao": str(card.get("data_publicacao") or ""),
        "urgencia_score": int(card.get("urgencia_score") or 80),
        "paises_envolvidos": list(card.get("paises_envolvidos") or []),
        "palavras_chave": list(card.get("palavras_chave") or []),
        "origem_v2": False,
    }


def _serializar_noticia_quente(row: Dict[str, Any]) -> Dict[str, Any]:
    """Serializa uma notícia quente (admin) no contrato de resposta de `/v2/admin/noticias-quentes`."""
    return {
        "slug": row.get("slug"),
        "batch_id": row.get("batch_id"),
        "titulo_curto": row.get("titulo_curto"),
        "resumo_pulso": row.get("resumo_pulso"),
        "impacto_pratico": row.get("impacto_pratico"),
        "categoria": row.get("categoria"),
        "paises_envolvidos": list(row.get("paises_envolvidos") or []),
        "urgencia_score": int(row.get("urgencia_score") or 0),
        "relevancia_score": int(row.get("relevancia_score") or 0),
        "nivel_confianca": row.get("nivel_confianca") or "alta",
        "ttl_horas": int(row.get("ttl_horas") or 6),
        "horas_em_destaque": int(row.get("horas_em_destaque") or 6),
        "veiculos_origem": list(row.get("veiculos_origem") or []),
        "fontes_urls": list(row.get("fontes_urls") or []),
        "palavras_chave": list(row.get("palavras_chave") or []),
        "links_internos_relacionados": _decodificar_jsonb(row.get("links_internos_relacionados"), []),
        "identificacao_editorial": "Síntese Rodando o Mundo",
        "atualizado_em": _formatar_horario_editorial(row.get("updated_at")),
        "data_publicacao": _serializar_valor_temporal(row.get("data_publicacao") or row.get("created_at") or row.get("updated_at")),
        "created_at": _serializar_valor_temporal(row.get("created_at")),
        "destaque_ate": _serializar_valor_temporal(row.get("destaque_ate")),
        "expires_at": _serializar_valor_temporal(row.get("expires_at")),
        "updated_at": _serializar_valor_temporal(row.get("updated_at")),
        "status": row.get("status"),
    }


def _parse_iso_utc(valor: Optional[str]) -> Optional[datetime]:
    """Converte string ISO-8601 (UTC) em datetime aware UTC para persistência em TIMESTAMPTZ."""
    if not valor:
        return None
    try:
        dt = datetime.fromisoformat(str(valor).strip().replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:  # noqa: BLE001
        return None


@router.get("/v2/admin/execucoes", dependencies=[Depends(verificar_admin_token)])
def admin_listar_execucoes(
    response: Response,
    limit: int = Query(20, ge=1, le=100),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lista as execuções de pipeline registradas em `ai_execucoes_pipeline` (mais recentes primeiro)."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT
                id, job_nome, recurso_chave, status, documentos_novos, eventos_atualizados,
                erro_detalhe, started_at, finished_at
            FROM ai_execucoes_pipeline
            ORDER BY started_at DESC, id DESC
            LIMIT %s;
            """,
            (limit,),
        )
        rows = cur.fetchall()

    execucoes: List[Dict[str, Any]] = []
    for r in rows:
        row = dict(r)
        execucoes.append({
            "id": row.get("id"),
            "job_nome": row.get("job_nome"),
            "recurso_chave": row.get("recurso_chave"),
            "status": row.get("status"),
            "documentos_novos": int(row.get("documentos_novos") or 0),
            "eventos_atualizados": int(row.get("eventos_atualizados") or 0),
            "erro_detalhe": row.get("erro_detalhe"),
            "started_at": _serializar_valor_temporal(row.get("started_at")),
            "finished_at": _serializar_valor_temporal(row.get("finished_at")),
        })
    return {"ok": True, "execucoes": execucoes}


@router.get("/v2/admin/radar/feed", dependencies=[Depends(verificar_admin_token)])
@router.get("/v2/admin/radar", dependencies=[Depends(verificar_admin_token)])
def admin_listar_radar_feed(
    response: Response,
    origem: Optional[str] = Query(None, description="Filtrar por origem: todos, manual, rss, pulso_v2"),
    categoria: Optional[str] = Query(None, description="Filtrar por categoria"),
    urgencia: Optional[str] = Query(None, description="Filtrar por urgência: alta, media, baixa"),
    q: Optional[str] = Query(None, description="Termo de busca textual"),
    limit: int = Query(100, ge=1, le=200),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lista o feed completo do Radar para o painel administrativo com curadoria integrada (manuais, RSS e Pulso V2)."""
    aplicar_no_cache_headers(response)
    limite_int = int(limit) if isinstance(limit, (int, str)) and str(limit).isdigit() else 100
    cards_feed = listar_todos_cards_radar(max_items=limite_int)

    itens_v2: List[Dict[str, Any]] = []
    raiz = Path(__file__).resolve().parents[1]
    vitrine_path = raiz / "data" / "vitrine_ia.json"
    vitrine_raw: Optional[Any] = None
    if conn is not None and hasattr(conn, "cursor"):
        try:
            from src.estado_db import ler_estado
            vitrine_raw = ler_estado("vitrine_ia", conn=conn)
        except Exception:
            vitrine_raw = None
    if not isinstance(vitrine_raw, dict) or not (
        vitrine_raw.get("temas_ativos") or vitrine_raw.get("noticias_quentes")
    ):
        if vitrine_path.is_file():
            try:
                vitrine_raw = json.loads(vitrine_path.read_text(encoding="utf-8"))
            except Exception:
                vitrine_raw = None

    mapa_cat_radar = {
        "Geopolitica_Radar": "geopolitica",
        "Geopolitica_Relacoes": "geopolitica",
        "Politica": "politica",
        "Economia": "economia",
        "Economia_Comercio": "economia",
        "Cultura": "cultura",
        "Sociedade_Cultura": "cultura",
        "Ciencia_Clima": "geopolitica",
        "Mobilidade_Fronteiras": "geopolitica",
        "Eleicoes": "politica",
        "Resumo_Ultimas": "geopolitica",
    }

    if isinstance(vitrine_raw, dict):
        agora_utc = datetime.now(timezone.utc)
        temas = vitrine_raw.get("temas_ativos") or []
        for t in temas:
            if not isinstance(t, dict):
                continue
            exp_dt = _parse_iso_utc(t.get("expires_at"))
            if exp_dt is not None and exp_dt <= agora_utc:
                continue
            slug = str(t.get("slug") or "")
            titulo = str(t.get("titulo_tema") or t.get("titulo_curto") or t.get("titulo") or "").strip()
            if not titulo:
                continue
            cat_raw = t.get("categoria_primaria") or t.get("categoria") or "Geopolitica_Radar"
            cat_norm = mapa_cat_radar.get(str(cat_raw), "geopolitica")
            resumo = str(t.get("gatilho_vitrine") or t.get("resumo_pulso") or t.get("resumo") or "").strip()
            analise = str(t.get("sintese_nerd") or t.get("impacto_pratico") or t.get("analise") or resumo).strip()
            urls = t.get("fontes_urls") or []
            fonte_url = urls[0] if urls else (t.get("fonte_url") or t.get("rota_editoria") or "/radar")
            data_pub = (
                t.get("data_publicacao")
                or t.get("created_at")
                or t.get("publicado_em")
                or t.get("updated_at")
                or ""
            )
            urgencia_score = int(t.get("urgencia_score") or t.get("relevancia_score") or 85)
            itens_v2.append({
                "id": f"v2-{slug}" if slug else f"v2-{os.urandom(3).hex()}",
                "slug": slug or f"v2-{os.urandom(3).hex()}",
                "titulo": titulo,
                "resumo": resumo,
                "analise": analise,
                "categoria": cat_norm,
                "fonte_nome": "Síntese Rodando o Mundo · Pulso V2",
                "fonte_url": fonte_url,
                "data_publicacao": data_pub,
                "urgencia_score": urgencia_score,
                "fixado": False,
                "paises_envolvidos": list(t.get("paises_envolvidos") or ["BR"]),
                "palavras_chave": list(t.get("palavras_chave_busca") or t.get("palavras_chave") or []),
                "origem": "pulso_v2",
                "origem_manual": False,
                "origem_v2": True,
            })

    # Integração do Bot DuckDuckGo News (ddgs) no feed do Radar
    itens_ddg: List[Dict[str, Any]] = []
    ddg_path = raiz / "data" / "noticias_ddg.json"
    if ddg_path.is_file():
        try:
            ddg_raw = json.loads(ddg_path.read_text(encoding="utf-8"))
            if isinstance(ddg_raw, dict):
                for idx_d, d in enumerate(ddg_raw.get("items") or [], start=1):
                    if not isinstance(d, dict):
                        continue
                    titulo_d = str(d.get("titulo") or "").strip()
                    if not titulo_d:
                        continue
                    resumo_d = str(d.get("resumo") or "").strip()
                    fonte_d = str(d.get("fonte") or "DuckDuckGo News").strip()
                    url_d = str(d.get("url") or "/radar").strip()
                    pais_cod = str(d.get("codigoPais") or "BR").upper()
                    cat_radar = str(d.get("categoriaRadar") or "geopolitica").lower()
                    if cat_radar not in ("geopolitica", "politica", "economia", "cultura"):
                        cat_radar = "geopolitica"
                    data_pub_d = str(d.get("publicadoEm") or ddg_raw.get("atualizadoEm") or "")
                    relev_d = int(d.get("relevancia") or idx_d)
                    urg_score_d = max(50, 92 - (relev_d * 3))
                    itens_ddg.append({
                        "id": f"ddg-{idx_d}-{relev_d}",
                        "slug": f"ddg-{idx_d}-{relev_d}",
                        "titulo": titulo_d,
                        "resumo": resumo_d,
                        "analise": resumo_d,
                        "categoria": cat_radar,
                        "fonte_nome": f"{fonte_d} (DuckDuckGo)",
                        "fonte_url": url_d,
                        "data_publicacao": data_pub_d,
                        "urgencia_score": urg_score_d,
                        "fixado": False,
                        "paises_envolvidos": [pais_cod],
                        "palavras_chave": [str(d.get("categoria") or "ddg")],
                        "origem": "ddg_news",
                        "origem_manual": False,
                        "origem_v2": False,
                        "origem_ddg_news": True,
                    })
        except Exception:
            pass

    todos_candidatos = sorted(itens_ddg + itens_v2 + cards_feed, key=_timestamp_publicacao, reverse=True)
    titulos_vistos = set()
    combinados: List[Dict[str, Any]] = []
    contadores = {"total": 0, "manuais": 0, "rss": 0, "pulso_v2": 0, "ddg_news": 0}

    for item in todos_candidatos:
        tit_norm = normalizar_fonte_key(item.get("titulo"))
        if not tit_norm or tit_norm in titulos_vistos:
            continue
        titulos_vistos.add(tit_norm)
        orig = item.get("origem") or ("manual" if item.get("origem_manual") else "rss")
        if orig == "manual":
            contadores["manuais"] += 1
        elif orig == "pulso_v2":
            contadores["pulso_v2"] += 1
        elif orig == "ddg_news":
            contadores["ddg_news"] += 1
        else:
            contadores["rss"] += 1
        combinados.append(item)

    contadores["total"] = len(combinados)

    resultado = combinados
    origem_str = origem if isinstance(origem, str) else None
    categoria_str = categoria if isinstance(categoria, str) else None
    urgencia_str = urgencia if isinstance(urgencia, str) else None
    q_str = q if isinstance(q, str) else None

    if origem_str and origem_str.lower() not in ("todos", "all"):
        orig_alvo = origem_str.lower().strip()
        resultado = [c for c in resultado if c.get("origem") == orig_alvo]
    if categoria_str and categoria_str.lower() not in ("todas", "all"):
        cat_alvo = categoria_str.lower().strip()
        resultado = [c for c in resultado if str(c.get("categoria") or "").lower() == cat_alvo]
    if urgencia_str and urgencia_str.lower() not in ("todas", "all"):
        u_alvo = urgencia_str.lower().strip()
        if u_alvo == "alta":
            resultado = [c for c in resultado if int(c.get("urgencia_score") or 0) >= 80]
        elif u_alvo == "media":
            resultado = [c for c in resultado if 50 <= int(c.get("urgencia_score") or 0) < 80]
        elif u_alvo == "baixa":
            resultado = [c for c in resultado if int(c.get("urgencia_score") or 0) < 50]
    if q_str and q_str.strip():
        termos = [t.lower() for t in q_str.strip().split() if len(t) >= 2]
        if termos:
            def _combina(c: Dict[str, Any]) -> bool:
                texto = f"{c.get('titulo', '')} {c.get('resumo', '')} {c.get('analise', '')} {c.get('fonte_nome', '')} {' '.join(c.get('paises_envolvidos', []))}".lower()
                return any(t in texto for t in termos)
            resultado = [c for c in resultado if _combina(c)]

    return {
        "ok": True,
        "total": len(resultado),
        "contadores": contadores,
        "cards": resultado,
    }


@router.patch("/v2/admin/radar/feed/{slug}", dependencies=[Depends(verificar_admin_token)])
def admin_atualizar_radar_feed(
    slug: str,
    response: Response,
    payload: AdminRadarManualUpdateRequest,
) -> Dict[str, Any]:
    """Atualiza campos parciais de qualquer notícia no feed do Radar (manual, RSS ou override)."""
    aplicar_no_cache_headers(response)
    card = atualizar_card_radar(slug, payload.model_dump(exclude_none=True))
    if card is None:
        raise HTTPException(status_code=404, detail="Notícia do Radar não encontrada.")
    return {"ok": True, "card": card}


@router.delete("/v2/admin/radar/feed/{slug}", dependencies=[Depends(verificar_admin_token)])
def admin_remover_radar_feed(slug: str, response: Response) -> Dict[str, Any]:
    """Remove uma notícia do feed do Radar (seja RSS ou manual)."""
    aplicar_no_cache_headers(response)
    removidos = remover_card_radar(slug)
    if slug.startswith("v2-") or removidos == 0:
        alvo_v2 = slug.removeprefix("v2-")
        try:
            from src.estado_db import atualizar_estado, banco_disponivel
            def _remove_v2(vit: Any) -> Any:
                if not isinstance(vit, dict):
                    return vit
                temas = [t for t in vit.get("temas_ativos", []) if str(t.get("slug") or "") != alvo_v2]
                vit["temas_ativos"] = temas
                return vit
            if banco_disponivel():
                atualizar_estado("vitrine_ia", _remove_v2)
            removidos += 1
        except Exception:
            pass
    return {"ok": True, "slug": slug, "removidos": removidos}


@router.post("/v2/admin/radar/feed/{slug}/fixar", dependencies=[Depends(verificar_admin_token)])
def admin_fixar_radar_feed(
    slug: str,
    response: Response,
    fixar: bool = Query(True, description="True para fixar no topo, False para desafixar"),
) -> Dict[str, Any]:
    """Fixa ou desafixa um card no topo do Radar (urgência máxima 99)."""
    aplicar_no_cache_headers(response)
    card = fixar_card_radar(slug, fixar=fixar)
    if card is None:
        raise HTTPException(status_code=404, detail="Notícia do Radar não encontrada.")
    return {"ok": True, "card": card, "fixado": fixar}


@router.get("/v2/admin/radar/manual", dependencies=[Depends(verificar_admin_token)])
def admin_listar_radar_manual(response: Response) -> Dict[str, Any]:
    """Lista os cards manuais do Radar (`origem_manual`) gerenciados pelo painel administrativo."""
    aplicar_no_cache_headers(response)
    cards = listar_cards_manuais()
    return {"ok": True, "cards": [_serializar_card_manual_response(c) for c in cards]}


@router.post("/v2/admin/radar/manual", dependencies=[Depends(verificar_admin_token)])
def admin_criar_radar_manual(
    response: Response,
    payload: AdminRadarManualCreateRequest,
) -> Dict[str, Any]:
    """Cria um card manual no feed do Radar (PostgreSQL via `src.estado_db` + fallback arquivo) e dispara webhook/notifier."""
    aplicar_no_cache_headers(response)
    card_in = {
        "slug": payload.slug,
        "titulo": payload.titulo,
        "resumo": payload.resumo,
        "contexto": payload.contexto,
        "categoria": payload.categoria,
        "urgencia_score": payload.urgencia_score,
        "fonte_nome": payload.fonte_nome,
        "fonte_url": payload.fonte_url,
        "pais_regiao": payload.pais_regiao,
        "coordenadas_geojson": payload.coordenadas_geojson,
        "data_publicacao": payload.data_publicacao,
        "origem_manual": payload.origem_manual,
    }
    card = publicar_card_manual(card_in)
    feed = _ler_feed_existente()
    return {
        "ok": True,
        "card": _serializar_card_manual_response(card),
        "total_feed": len(feed) if isinstance(feed, list) else 0,
    }


@router.patch("/v2/admin/radar/manual/{slug}", dependencies=[Depends(verificar_admin_token)])
def admin_atualizar_radar_manual(
    slug: str,
    response: Response,
    payload: AdminRadarManualUpdateRequest,
) -> Dict[str, Any]:
    """Atualiza campos parciais de um card manual do Radar (por slug)."""
    aplicar_no_cache_headers(response)
    card = atualizar_card_radar(slug, payload.model_dump(exclude_none=True))
    if card is None:
        raise HTTPException(status_code=404, detail="Card manual não encontrado.")
    return {"ok": True, "card": _serializar_card_manual_response(card)}


@router.delete("/v2/admin/radar/manual/{slug}", dependencies=[Depends(verificar_admin_token)])
def admin_remover_radar_manual(slug: str, response: Response) -> Dict[str, Any]:
    """Remove cards manuais do Radar pelo slug."""
    aplicar_no_cache_headers(response)
    removidos = remover_card_radar(slug)
    return {"ok": True, "slug": slug, "removidos": removidos}


@router.get("/v2/admin/noticias-quentes", dependencies=[Depends(verificar_admin_token)])
def admin_listar_noticias_quentes(
    response: Response,
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None, description="Filtrar por status (ativo/publicado/aguardando_revisao/expirado/arquivado)"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lista notícias quentes em `ai_noticias_quentes` para o painel administrativo (com filtro de status)."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)

    filtros = [
        "expires_at > NOW()",
        "destaque_ate > NOW()",
    ]
    params: List[Any] = []
    condicao_status = "status IN ('ativo', 'publicado', 'aguardando_revisao')"
    if status:
        condicao_status = "status = %s"
        params.append(status)
    filtros.append(condicao_status)
    params.append(limit)
    where_sql = " WHERE " + " AND ".join(filtros)

    query = f"""
        SELECT
            slug, batch_id, titulo_curto, resumo_pulso, impacto_pratico,
            categoria, paises_envolvidos, urgencia_score, relevancia_score,
            nivel_confianca, ttl_horas, horas_em_destaque, veiculos_origem,
            fontes_urls, palavras_chave, links_internos_relacionados,
            status, destaque_ate, expires_at, created_at, updated_at
        FROM ai_noticias_quentes
        {where_sql}
        ORDER BY updated_at DESC, urgencia_score DESC, relevancia_score DESC
        LIMIT %s;
    """

    noticias: List[Dict[str, Any]] = []
    try:
        with db.cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()
        for r in rows:
            noticias.append(_serializar_noticia_quente(dict(r)))
    except Exception as e:  # noqa: BLE001
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        print(f"[Aviso] Erro ao consultar ai_noticias_quentes (admin): {e}")

    return {"ok": True, "noticias": noticias}


@router.patch("/v2/admin/noticias-quentes/{slug}", dependencies=[Depends(verificar_admin_token)])
def admin_atualizar_noticia_quente(
    slug: str,
    response: Response,
    payload: AdminNoticiasQuentesUpdateRequest,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Atualiza campos parciais de uma notícia quente em `ai_noticias_quentes`."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=422, detail="Nenhum campo alterável informado para atualização.")

    assignments: List[str] = []
    params: List[Any] = []

    def _add(col: str, valor: Any) -> None:
        assignments.append(f"{col} = %s")
        params.append(valor)

    agora = datetime.now(timezone.utc)
    if "titulo_curto" in updates:
        _add("titulo_curto", updates["titulo_curto"])
    if "resumo_pulso" in updates:
        _add("resumo_pulso", updates["resumo_pulso"])
    if "impacto_pratico" in updates:
        _add("impacto_pratico", updates["impacto_pratico"])
    if "categoria" in updates:
        _add("categoria", updates["categoria"])
    if "urgencia_score" in updates:
        _add("urgencia_score", int(updates["urgencia_score"]))
    if "relevancia_score" in updates:
        _add("relevancia_score", int(updates["relevancia_score"]))
    if "nivel_confianca" in updates:
        _add("nivel_confianca", updates["nivel_confianca"])
    if "paises_envolvidos" in updates:
        _add("paises_envolvidos", list(updates["paises_envolvidos"] or []))
    if "palavras_chave" in updates:
        _add("palavras_chave", [str(k).lower().strip() for k in (updates["palavras_chave"] or []) if str(k).strip()])
    if "veiculos_origem" in updates:
        _add("veiculos_origem", list(updates["veiculos_origem"] or []))
    if "fontes_urls" in updates:
        _add("fontes_urls", list(updates["fontes_urls"] or []))
    if "status" in updates:
        _add("status", updates["status"])
    if "ttl_horas" in updates:
        ttl_valido = max(1, int(updates["ttl_horas"] or 6))
        _add("expires_at", agora + timedelta(hours=ttl_valido))
    if "horas_em_destaque" in updates:
        horas_validas = max(1, min(24, int(updates["horas_em_destaque"] or 6)))
        _add("destaque_ate", agora + timedelta(hours=horas_validas))
    if "destaque_ate" in updates:
        dt_dest = _parse_iso_utc(updates["destaque_ate"])
        if dt_dest is not None:
            _add("destaque_ate", dt_dest)
    if "expires_at" in updates:
        dt_exp = _parse_iso_utc(updates["expires_at"])
        if dt_exp is not None:
            _add("expires_at", dt_exp)

    if not assignments:
        raise HTTPException(status_code=422, detail="Nenhum campo alterável informado para atualização.")

    set_sql = ", ".join(assignments)
    with db.cursor() as cur:
        cur.execute(
            f"UPDATE ai_noticias_quentes SET {set_sql} WHERE slug = %s RETURNING slug, status;",
            (*params, slug),
        )
        row = cur.fetchone()
    db.commit()

    if not row:
        raise HTTPException(status_code=404, detail="Notícia quente não encontrada.")

    with db.cursor() as cur:
        cur.execute(
            """
            SELECT
                slug, batch_id, titulo_curto, resumo_pulso, impacto_pratico,
                categoria, paises_envolvidos, urgencia_score, relevancia_score,
                nivel_confianca, ttl_horas, horas_em_destaque, veiculos_origem,
                fontes_urls, palavras_chave, links_internos_relacionados,
                status, destaque_ate, expires_at, updated_at
            FROM ai_noticias_quentes
            WHERE slug = %s;
            """,
            (slug,),
        )
        row_atual = cur.fetchone()
    noticia = _serializar_noticia_quente(dict(row_atual)) if row_atual else {}

    return {"ok": True, "noticia": noticia}


@router.delete("/v2/admin/noticias-quentes/{slug}", dependencies=[Depends(verificar_admin_token)])
def admin_remover_noticia_quente(
    slug: str,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Remove uma notícia quente de `ai_noticias_quentes` pelo slug."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    with db.cursor() as cur:
        cur.execute("DELETE FROM ai_noticias_quentes WHERE slug = %s RETURNING slug;", (slug,))
        row = cur.fetchone()
    db.commit()
    removido = 1 if row else 0
    return {"ok": True, "slug": slug, "removido": removido}


# ============================================================================
# 14.1 COLUNAS EDITORIAIS — APROVAÇÃO HUMANA (/v2/admin/colunas)
# ============================================================================

@router.get("/v2/admin/colunas", dependencies=[Depends(verificar_admin_token)])
def admin_listar_colunas(
    response: Response,
    status: Optional[str] = Query(
        None,
        description="Filtra por status (rascunho_auditado/aguardando_revisao/aprovado/publicado/rejeitado)",
    ),
    limite: int = Query(50, ge=1, le=200),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lista colunas editoriais para revisão humana (rascunhos auditados, aprovadas e publicadas)."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    status_norm = (status if isinstance(status, str) else "").strip().lower()
    limite_int = int(limite) if isinstance(limite, (int, str)) and str(limite).isdigit() else 50
    filtro_sql = "WHERE (c.status = %s OR c.review_status = %s)" if status_norm else ""
    params: List[Any] = [status_norm, status_norm] if status_norm else []
    params.append(limite_int)
    with db.cursor() as cur:
        cur.execute(
            f"""
            SELECT
                c.slug, c.titulo, c.subtitulo, c.tese_central, c.corpo_markdown, c.resumo_seo,
                c.categoria, c.tempo_leitura_min, c.auditoria_aprovada, c.model_id,
                c.status, c.review_status, c.reviewed_by, c.published_at, c.created_at, c.updated_at,
                COALESCE(c.auditoria_resultado->>'nota_isencao', '') AS nota_isencao,
                COALESCE(c.auditoria_resultado->>'score_qualidade', '') AS score_qualidade,
                ea.slug AS entenda_slug,
                ea.titulo_assunto AS entenda_titulo
            FROM ai_colunas_editoriais c
            LEFT JOIN LATERAL (
                SELECT slug, titulo_assunto
                FROM ai_entenda_o_assunto e
                WHERE e.slug = c.slug
                   OR e.slug = ('entenda-' || c.slug)
                   OR (e.id = c.id AND ABS(EXTRACT(EPOCH FROM (e.created_at - c.created_at))) < 30)
                ORDER BY
                    CASE
                        WHEN e.slug = ('entenda-' || c.slug) THEN 0
                        WHEN e.slug = c.slug THEN 1
                        ELSE 2
                    END,
                    e.updated_at DESC
                LIMIT 1
            ) ea ON TRUE
            {filtro_sql}
            ORDER BY COALESCE(c.published_at, c.created_at) DESC, c.updated_at DESC
            LIMIT %s;
            """,
            tuple(params),
        )
        rows = cur.fetchall()
        cur.execute(
            "SELECT COALESCE(status, 'rascunho_auditado') AS status, COUNT(*) AS total "
            "FROM ai_colunas_editoriais GROUP BY 1;"
        )
        contagens_rows = cur.fetchall()
    colunas = [
        {
            **dict(r),
            "published_at": _serializar_valor_temporal(r.get("published_at")),
            "created_at": _serializar_valor_temporal(r.get("created_at")),
            "updated_at": _serializar_valor_temporal(r.get("updated_at")),
        }
        for r in rows
    ]
    contagens = {str(r["status"]): int(r["total"]) for r in contagens_rows}
    contagens["total"] = sum(contagens.values())
    return {"ok": True, "colunas": colunas, "contagens": contagens}


@router.patch("/v2/admin/colunas/{slug}/status", dependencies=[Depends(verificar_admin_token)])
def admin_atualizar_status_coluna(
    slug: str,
    payload: AdminColunaStatusRequest,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Aprova, publica, rejeita ou devolve uma coluna para rascunho (sincronizando `ai_entenda_o_assunto`)."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    status_novo = payload.status

    if status_novo == "publicado":
        set_sql = (
            "status = 'publicado', review_status = 'publicado', "
            "published_at = COALESCE(published_at, NOW()), updated_at = NOW()"
        )
        entenda_status = "publicado"
    elif status_novo == "aprovado":
        set_sql = "status = 'aprovado', review_status = 'aprovado', updated_at = NOW()"
        entenda_status = "aprovado"
    elif status_novo == "rejeitado":
        set_sql = "status = 'rejeitado', review_status = 'rejeitado', updated_at = NOW()"
        entenda_status = "rejeitado"
    else:
        set_sql = (
            "status = 'rascunho_auditado', review_status = 'rascunho_auditado', "
            "published_at = NULL, updated_at = NOW()"
        )
        entenda_status = "rascunho_auditado"

    with db.cursor() as cur:
        cur.execute(
            f"UPDATE ai_colunas_editoriais SET {set_sql} WHERE slug = %s "
            "RETURNING id, slug, status, review_status, published_at, created_at, updated_at;",
            (slug,),
        )
        row = cur.fetchone()
        if row:
            cur.execute(
                "UPDATE ai_entenda_o_assunto SET status = %s, updated_at = NOW() "
                "WHERE slug = %s OR slug = %s;",
                (entenda_status, f"entenda-{slug}", slug),
            )
            if cur.rowcount == 0 and row.get("id") is not None and row.get("created_at") is not None:
                cur.execute(
                    "UPDATE ai_entenda_o_assunto SET status = %s, updated_at = NOW() "
                    "WHERE id = %s AND ABS(EXTRACT(EPOCH FROM (created_at - %s))) < 30;",
                    (entenda_status, row["id"], row["created_at"]),
                )
    if not row:
        raise HTTPException(status_code=404, detail="Coluna não encontrada.")
    db.commit()
    try:
        _sincronizar_espelho_entenda_v2(db)
    except Exception as exc:  # noqa: BLE001
        print(f"[Aviso] Falha ao sincronizar espelho entenda_v2 após PATCH status: {exc}")
    return {
        "ok": True,
        "slug": row["slug"],
        "status": row["status"],
        "review_status": row["review_status"],
        "published_at": _serializar_valor_temporal(row.get("published_at")),
        "updated_at": _serializar_valor_temporal(row.get("updated_at")),
    }


@router.delete("/v2/admin/colunas/{slug}", dependencies=[Depends(verificar_admin_token)])
def admin_excluir_coluna(
    slug: str,
    response: Response,
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Remove permanentemente uma coluna editorial (e o bloco 'Entenda o Assunto' associado)."""
    aplicar_no_cache_headers(response)
    db = _require_db(conn)
    with db.cursor() as cur:
        cur.execute(
            "DELETE FROM ai_entenda_o_assunto WHERE slug = %s OR slug = %s;",
            (f"entenda-{slug}", slug),
        )
        cur.execute(
            "DELETE FROM ai_colunas_editoriais WHERE slug = %s RETURNING id, slug, created_at;",
            (slug,),
        )
        row = cur.fetchone()
        if row and row.get("id") is not None and row.get("created_at") is not None:
            cur.execute(
                "DELETE FROM ai_entenda_o_assunto WHERE id = %s AND ABS(EXTRACT(EPOCH FROM (created_at - %s))) < 30;",
                (row["id"], row["created_at"]),
            )
    if not row:
        db.rollback()
        raise HTTPException(status_code=404, detail="Coluna não encontrada.")
    db.commit()
    try:
        _sincronizar_espelho_entenda_v2(db)
    except Exception as exc:  # noqa: BLE001
        print(f"[Aviso] Falha ao sincronizar espelho entenda_v2 após DELETE coluna: {exc}")
    return {"ok": True, "slug": row["slug"]}


@router.get("/v2/admin/entenda/tendencias", dependencies=[Depends(verificar_admin_token)])
def admin_entenda_tendencias(
    response: Response,
    country: str = Query("BR", min_length=2, max_length=2, description="Código ISO-2 do país"),
    lang: str = Query("pt", min_length=2, max_length=10, description="Idioma"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Sugere assuntos do momento combinando Google Trends RSS, notícias quentes do banco e Google News RSS."""
    import urllib.request
    import xml.etree.ElementTree as ET

    aplicar_no_cache_headers(response)
    c_code = (country or "BR").strip().upper()[:2] or "BR"
    l_code = (lang or "pt").strip().lower() or "pt"

    topicos: List[Dict[str, Any]] = []
    vistos: set[str] = set()

    def _adicionar_topico(label: str, origem: str, volume: str = "") -> None:
        txt = re.sub(r"\s+", " ", (label or "")).strip()
        if not txt or len(txt) < 3:
            return
        chave = txt.lower()
        if chave in vistos:
            return
        vistos.add(chave)
        topicos.append({
            "label": txt,
            "tema": txt,
            "volume": volume,
            "origem": origem,
        })

    # 1. Google Trends RSS
    try:
        trends_url = f"https://trends.google.com/trending/rss?geo={c_code}"
        req = urllib.request.Request(
            trends_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; RodandoOMundoBot/2.2)"},
        )
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            xml_bytes = resp.read()
        root = ET.fromstring(xml_bytes)
        for item_el in root.findall(".//item"):
            title = ""
            traffic = ""
            for child in item_el:
                tag_name = child.tag.rsplit("}", 1)[-1]
                if tag_name == "title" and child.text:
                    title = child.text.strip()
                elif tag_name == "approx_traffic" and child.text:
                    traffic = child.text.strip()
            if title:
                _adicionar_topico(title, "google_trends", traffic)
            if len(topicos) >= 8:
                break
    except Exception:  # noqa: BLE001
        pass

    # 2. Notícias quentes ativas no banco
    if conn is not None:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT titulo_curto, categoria
                    FROM ai_noticias_quentes
                    WHERE (expires_at IS NULL OR expires_at > NOW())
                    ORDER BY urgencia_score DESC, updated_at DESC
                    LIMIT 8;
                    """
                )
                for r in cur.fetchall():
                    _adicionar_topico(str(r.get("titulo_curto") or ""), "noticias_quentes")
        except Exception:  # noqa: BLE001
            try:
                conn.rollback()
            except Exception:  # noqa: BLE001
                pass

    # 3. Fallback / complemento: Google News Top RSS
    if len(topicos) < 8:
        locale_map = {
            "BR": ("pt-BR", "BR", "BR:pt-419"),
            "PT": ("pt-PT", "PT", "PT:pt-150"),
            "US": ("en-US", "US", "US:en"),
            "GB": ("en-GB", "GB", "GB:en"),
            "AR": ("es-419", "AR", "AR:es-419"),
            "ES": ("es", "ES", "ES:es"),
            "FR": ("fr", "FR", "FR:fr"),
            "DE": ("de", "DE", "DE:de"),
        }
        hl, gl, ceid = locale_map.get(c_code, (f"{l_code}-{c_code}" if l_code else "pt-BR", c_code, f"{c_code}:{l_code}"))
        try:
            gnews_url = f"https://news.google.com/rss?hl={hl}&gl={gl}&ceid={ceid}"
            req = urllib.request.Request(
                gnews_url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; RodandoOMundoBot/2.2)"},
            )
            with urllib.request.urlopen(req, timeout=6.0) as resp:
                xml_bytes = resp.read()
            root = ET.fromstring(xml_bytes)
            for item_el in root.findall(".//item"):
                raw_t = (item_el.findtext("title") or "").strip()
                if " - " in raw_t:
                    raw_t = raw_t.rsplit(" - ", 1)[0].strip()
                _adicionar_topico(raw_t, "google_news")
                if len(topicos) >= 12:
                    break
        except Exception:  # noqa: BLE001
            pass

    return {
        "ok": True,
        "country": c_code,
        "lang": l_code,
        "topicos": topicos[:12],
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
    somente_ativos: bool = True,
) -> Tuple[str, List[Any]]:
    """Constrói cláusula WHERE determinística compartilhada entre sugestão e listagem de artigos."""
    conds = list(_ATIVOS_SQL) if somente_ativos else ["status IN ('ativo', 'publicado', 'aguardando_revisao')"]
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
    somente_ativos: bool = True,
) -> Tuple[str, List[Any]]:
    """Aplica o mesmo filtro de escopo + correspondência exata do termo nas matérias ativas."""
    where_escopo, params = _construir_where_escopo_pais(pais, escopo, categoria, somente_ativos=somente_ativos)
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
    _t: Optional[str] = Query(None, description="Timestamp de cache-busting"),
    refresh: Optional[str] = Query(None, description="Ignorar cache em memória"),
    force: Optional[str] = Query(None, description="Forçar bypass de cache"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Retorna de 3 a 4 sugestões quentes confirmadas no banco (`COUNT(*) > 0`) por país ou global."""
    aplicar_no_cache_headers(response)
    pais_norm = pais.strip().upper() if pais and pais.strip() else None
    cat_norm = categoria.strip() if categoria and categoria.strip() else None
    cache_key = f"{pais_norm or 'GLOBAL'}|{cat_norm or 'ALL'}|{limit}"
    is_refresh = bool(
        _t
        or (refresh and refresh.strip().lower() not in ("0", "false", ""))
        or (force and force.strip().lower() not in ("0", "false", ""))
    )

    if not is_refresh:
        cached = _SUGESTOES_CACHE.get(cache_key)
        if cached and time.monotonic() < cached[0]:
            return {**cached[1], "cached": True}

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
        with _obter_cursor(conn) as cur:
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
    if sugestoes:
        _SUGESTOES_CACHE[cache_key] = (time.monotonic() + _SUGESTOES_CACHE_TTL_SEC, payload)
    return payload


@router.get("/v2/artigos-por-assunto")
def listar_artigos_por_assunto(
    response: Response,
    termo: str = Query(..., min_length=1, description="Termo/tag selecionado no chip"),
    pais: Optional[str] = Query(None, description="Código ISO-2 do país (opcional)"),
    escopo: Literal["direto", "indireto", "global"] = Query("direto", description="Mesmo escopo validado na sugestão"),
    categoria: Optional[str] = Query(None, description="Filtrar por categoria do Atlas"),
    limit: int = Query(20, ge=1, le=50),
    _t: Optional[str] = Query(None, description="Timestamp de cache-busting"),
    refresh: Optional[str] = Query(None, description="Flag de atualização em tempo real"),
    conn: Any = Depends(get_db),
) -> Dict[str, Any]:
    """Lista matérias ativas aplicando exatamente o mesmo critério de filtro de `/v2/sugestoes-contextuais`."""
    aplicar_no_cache_headers(response)
    pais_norm = pais.strip().upper() if pais and pais.strip() else None
    escopo_efetivo = escopo if pais_norm else "global"

    if conn is None:
        return {"ok": True, "termo": termo, "pais": pais_norm, "escopo": escopo_efetivo, "total": 0, "artigos": []}

    def _montar_query_artigos(where_clause: str) -> str:
        return f"""
            SELECT
                slug, titulo_curto, resumo_pulso, impacto_pratico,
                categoria, paises_envolvidos, urgencia_score, relevancia_score,
                veiculos_origem, fontes_urls, palavras_chave, created_at, updated_at
            FROM ai_noticias_quentes
            WHERE {where_clause}
            ORDER BY updated_at DESC, urgencia_score DESC, relevancia_score DESC
            LIMIT %s;
        """

    artigos: List[Dict[str, Any]] = []
    try:
        with _obter_cursor(conn) as cur:
            where_sql, params = _construir_where_artigos_assunto(
                termo, pais_norm, escopo_efetivo, categoria, somente_ativos=True
            )
            cur.execute(_montar_query_artigos(where_sql), tuple(params + [limit]))
            rows = cur.fetchall()
            if not rows:
                where_fb, params_fb = _construir_where_artigos_assunto(
                    termo, pais_norm, escopo_efetivo, categoria, somente_ativos=False
                )
                cur.execute(_montar_query_artigos(where_fb), tuple(params_fb + [limit]))
                rows = cur.fetchall()

            for r in rows:
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
                    "data_publicacao": _serializar_valor_temporal(r.get("created_at") or r.get("updated_at")),
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
        with _obter_cursor(conn) as cur:
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


def _ts_ordenacao_atlas(item: Dict[str, Any]) -> Tuple[int, float]:
    raw = (
        item.get("publishedAt")
        or item.get("data_publicacao")
        or item.get("updated_at")
        or item.get("created_at")
        or ""
    )
    dt = _parse_iso_utc(str(raw) if raw else None)
    if dt is None:
        return (0, 0.0)
    return (1, dt.timestamp())


@router.get("/v1/atlas/pulso-continental")
def obter_pulso_continental(
    response: Response,
    continente: Optional[str] = Query(None),
    conn=Depends(get_db),
):
    """Retorna o pulso continental atualizado para o mapa e o ticker global."""
    aplicar_no_cache_headers(response)
    if not conn:
        return {"ok": False, "continentes": {}}

    try:
        with _obter_cursor(conn) as cur:
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
                h = [dict(it) if isinstance(it, dict) else it for it in (r["headlines_json"] or [])]
                h.sort(
                    key=lambda it: _ts_ordenacao_atlas(it) if isinstance(it, dict) else (0, 0.0),
                    reverse=True,
                )
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


def _parse_atlas_pub_date(raw_pub: str) -> str:
    """Converte data RSS/Atom em ISO-8601 UTC ou retorna '' quando ausente/inválida."""
    import email.utils

    texto = (raw_pub or "").strip()
    if not texto:
        return ""
    try:
        dt = email.utils.parsedate_to_datetime(texto)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        pass
    try:
        dt = datetime.fromisoformat(texto.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return ""


def _xml_child_text(elem: Any, *names: str) -> str:
    for child in elem:
        local = child.tag.rsplit("}", 1)[-1]
        if local in names and child.text:
            return child.text.strip()
    return ""


def _xml_atom_link(elem: Any) -> str:
    for child in elem:
        local = child.tag.rsplit("}", 1)[-1]
        if local == "link":
            href = (child.attrib.get("href") or "").strip()
            if href:
                return href
            if child.text and child.text.strip():
                return child.text.strip()
    return ""


@router.get("/api/atlas-pais")
def obter_atlas_pais_ao_vivo(
    response: Response,
    pais: str = Query("BR", min_length=2, max_length=8),
    nome: Optional[str] = Query(None),
    refresh: Optional[str] = Query(None),
    _t: Optional[str] = Query(None),
    force: Optional[str] = Query(None),
    conn=Depends(get_db),
):
    """Endpoint FastAPI espelho do /api/atlas-pais com cache persistido no PostgreSQL."""
    import hashlib
    import urllib.parse
    import urllib.request
    import xml.etree.ElementTree as ET

    c_code = pais.upper().strip()
    c_name = (nome or c_code).strip()
    is_refresh = bool(
        _t
        or (refresh and refresh.strip().lower() not in ("0", "false", ""))
        or (force and force.strip().lower() not in ("0", "false", ""))
    )

    aplicar_no_cache_headers(response)

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
                    cached_items = [dict(it) if isinstance(it, dict) else it for it in row["items_json"]]
                    cached_items.sort(
                        key=lambda it: _ts_ordenacao_atlas(it) if isinstance(it, dict) else (0, 0.0),
                        reverse=True,
                    )
                    return {
                        "ok": True,
                        "cached": True,
                        "source": "postgres_cache",
                        "country": c_code,
                        "countryName": c_name,
                        "updatedAt": _serializar_valor_temporal(row["updated_at"]),
                        "total": len(cached_items),
                        "items": cached_items,
                    }
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass

    # 2. Coleta ao vivo via Google News RSS (Edições Nativas Oficiais e Busca Inteligente 24h)
    google_news_editions = {
        "US": {"hl": "en-US", "gl": "US", "ceid": "US:en"},
        "BR": {"hl": "pt-BR", "gl": "BR", "ceid": "BR:pt-419"},
        "GB": {"hl": "en-GB", "gl": "GB", "ceid": "GB:en"},
        "UK": {"hl": "en-GB", "gl": "GB", "ceid": "GB:en"},
        "FR": {"hl": "fr", "gl": "FR", "ceid": "FR:fr"},
        "DE": {"hl": "de", "gl": "DE", "ceid": "DE:de"},
        "IT": {"hl": "it", "gl": "IT", "ceid": "IT:it"},
        "ES": {"hl": "es", "gl": "ES", "ceid": "ES:es-419"},
        "PT": {"hl": "pt-PT", "gl": "PT", "ceid": "PT:pt-150"},
        "AR": {"hl": "es-419", "gl": "AR", "ceid": "AR:es-419"},
        "MX": {"hl": "es-419", "gl": "MX", "ceid": "MX:es-419"},
        "CO": {"hl": "es-419", "gl": "CO", "ceid": "CO:es-419"},
        "CL": {"hl": "es-419", "gl": "CL", "ceid": "CL:es-419"},
        "PE": {"hl": "es-419", "gl": "PE", "ceid": "PE:es-419"},
        "VE": {"hl": "es-419", "gl": "VE", "ceid": "VE:es-419"},
        "CA": {"hl": "en-CA", "gl": "CA", "ceid": "CA:en"},
        "AU": {"hl": "en-AU", "gl": "AU", "ceid": "AU:en"},
        "IN": {"hl": "en-IN", "gl": "IN", "ceid": "IN:en"},
        "JP": {"hl": "ja", "gl": "JP", "ceid": "JP:ja"},
        "RU": {"hl": "ru", "gl": "RU", "ceid": "RU:ru"},
        "ZA": {"hl": "en-ZA", "gl": "ZA", "ceid": "ZA:en"},
        "NL": {"hl": "nl", "gl": "NL", "ceid": "NL:nl"},
        "BE": {"hl": "fr", "gl": "BE", "ceid": "BE:fr"},
        "CH": {"hl": "de-CH", "gl": "CH", "ceid": "CH:de"},
        "AT": {"hl": "de-AT", "gl": "AT", "ceid": "AT:de"},
        "SE": {"hl": "sv", "gl": "SE", "ceid": "SE:sv"},
        "NO": {"hl": "no", "gl": "NO", "ceid": "NO:no"},
        "DK": {"hl": "da", "gl": "DK", "ceid": "DK:da"},
        "FI": {"hl": "fi", "gl": "FI", "ceid": "FI:fi"},
        "PL": {"hl": "pl", "gl": "PL", "ceid": "PL:pl"},
        "TR": {"hl": "tr", "gl": "TR", "ceid": "TR:tr"},
        "GR": {"hl": "el", "gl": "GR", "ceid": "GR:el"},
        "IL": {"hl": "he", "gl": "IL", "ceid": "IL:he"},
        "SA": {"hl": "ar", "gl": "SA", "ceid": "SA:ar"},
        "EG": {"hl": "ar", "gl": "EG", "ceid": "EG:ar"},
        "AE": {"hl": "ar", "gl": "AE", "ceid": "AE:ar"},
        "NG": {"hl": "en-NG", "gl": "NG", "ceid": "NG:en"},
        "KE": {"hl": "en-KE", "gl": "KE", "ceid": "KE:en"},
        "ID": {"hl": "id", "gl": "ID", "ceid": "ID:id"},
        "TH": {"hl": "th", "gl": "TH", "ceid": "TH:th"},
        "VN": {"hl": "vi", "gl": "VN", "ceid": "VN:vi"},
        "PH": {"hl": "en-PH", "gl": "PH", "ceid": "PH:en"},
        "KR": {"hl": "ko", "gl": "KR", "ceid": "KR:ko"},
        "TW": {"hl": "zh-TW", "gl": "TW", "ceid": "TW:zh-Hant"},
        "HK": {"hl": "zh-HK", "gl": "HK", "ceid": "HK:zh-Hant"},
        "SG": {"hl": "en-SG", "gl": "SG", "ceid": "SG:en"},
        "NZ": {"hl": "en-NZ", "gl": "NZ", "ceid": "NZ:en"},
        "IE": {"hl": "en-IE", "gl": "IE", "ceid": "IE:en"},
        "UY": {"hl": "es-419", "gl": "UY", "ceid": "UY:es-419"},
        "CU": {"hl": "es-419", "gl": "CU", "ceid": "CU:es-419"},
        "CZ": {"hl": "cs", "gl": "CZ", "ceid": "CZ:cs"},
        "HU": {"hl": "hu", "gl": "HU", "ceid": "HU:hu"},
        "RO": {"hl": "ro", "gl": "RO", "ceid": "RO:ro"},
        "BG": {"hl": "bg", "gl": "BG", "ceid": "BG:bg"},
        "UA": {"hl": "uk", "gl": "UA", "ceid": "UA:uk"},
        "PK": {"hl": "en-PK", "gl": "PK", "ceid": "PK:en"},
        "MA": {"hl": "fr", "gl": "MA", "ceid": "MA:fr"},
        "SN": {"hl": "fr", "gl": "SN", "ceid": "SN:fr"},
        "EC": {"hl": "es-419", "gl": "EC", "ceid": "EC:es-419"},
        "PY": {"hl": "es-419", "gl": "PY", "ceid": "PY:es-419"},
        "BO": {"hl": "es-419", "gl": "BO", "ceid": "BO:es-419"},
        "CR": {"hl": "es-419", "gl": "CR", "ceid": "CR:es-419"},
        "PA": {"hl": "es-419", "gl": "PA", "ceid": "PA:es-419"},
        "DO": {"hl": "es-419", "gl": "DO", "ceid": "DO:es-419"},
        "GT": {"hl": "es-419", "gl": "GT", "ceid": "GT:es-419"},
        "HN": {"hl": "es-419", "gl": "HN", "ceid": "HN:es-419"},
        "SV": {"hl": "es-419", "gl": "SV", "ceid": "SV:es-419"},
        "NI": {"hl": "es-419", "gl": "NI", "ceid": "NI:es-419"},
    }
    country_intl_names = {
        "US": "United States", "GB": "United Kingdom", "DE": "Germany", "FR": "France",
        "ES": "Spain", "IT": "Italy", "JP": "Japan", "RU": "Russia", "CN": "China",
        "KR": "South Korea", "KP": "North Korea", "IS": "Iceland", "UY": "Uruguay",
        "PY": "Paraguay", "BO": "Bolivia", "EC": "Ecuador", "AO": "Angola", "MZ": "Mozambique",
        "CV": "Cabo Verde", "GW": "Guinea-Bissau", "ST": "Sao Tome and Principe", "TL": "Timor-Leste",
        "AM": "Armenia", "GE": "Georgia", "AZ": "Azerbaijan", "KZ": "Kazakhstan", "UZ": "Uzbekistan",
        "MN": "Mongolia", "IR": "Iran", "IQ": "Iraq", "SY": "Syria", "LB": "Lebanon",
        "JO": "Jordan", "DZ": "Algeria", "TN": "Tunisia", "LY": "Libya", "SD": "Sudan",
        "ET": "Ethiopia", "GH": "Ghana", "CI": "Ivory Coast", "CM": "Cameroon", "CD": "DR Congo",
        "CG": "Republic of the Congo", "MG": "Madagascar", "ZW": "Zimbabwe", "ZM": "Zambia",
        "NA": "Namibia", "BW": "Botswana",
    }
    lusophone_countries = {"BR", "PT", "AO", "MZ", "CV", "GW", "ST", "TL"}

    ed = google_news_editions.get(c_code)
    search_name = country_intl_names.get(c_code, c_name)

    if c_code == "BR":
        rss_url = "https://news.google.com/rss/headlines/section/geo/Brasil?hl=pt-BR&gl=BR&ceid=BR:pt-419"
    elif ed:
        rss_url = f"https://news.google.com/rss?hl={urllib.parse.quote(ed['hl'])}&gl={urllib.parse.quote(ed['gl'])}&ceid={urllib.parse.quote(ed['ceid'])}"
    else:
        search_lang = "pt-BR" if c_code in lusophone_countries else "en"
        lang_prefix = search_lang.split("-")[0]
        rss_url = (
            f"https://news.google.com/rss/search?q={urllib.parse.quote(search_name + ' when:24h')}"
            f"&hl={search_lang}&gl={urllib.parse.quote(c_code)}&ceid={urllib.parse.quote(c_code)}:{lang_prefix}"
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

        entries_xml = [
            el for el in root.iter()
            if el.tag.rsplit("}", 1)[-1] in ("item", "entry")
        ]
        candidatos: List[Dict[str, Any]] = []
        for item_el in entries_xml:
            raw_title = _xml_child_text(item_el, "title")
            raw_link = _xml_atom_link(item_el)
            raw_source = _xml_child_text(item_el, "source")
            raw_pub = _xml_child_text(item_el, "pubDate", "published", "updated", "date")
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

            iso_pub = _parse_atlas_pub_date(raw_pub)
            candidatos.append({
                "id": "h_" + hashlib.sha1(raw_link.encode("utf-8")).hexdigest()[:10],
                "titleOriginal": title_clean,
                "titlePt": title_clean,
                "url": raw_link,
                "source": detected_source or "Imprensa Internacional",
                "publishedAt": iso_pub,
                "score": 85,
                "country": c_code,
            })

        candidatos.sort(key=_ts_ordenacao_atlas, reverse=True)
        items = candidatos[:14]
        if c_code != "BR":
            for idx_tr, item_tr in enumerate(items[:10]):
                item_tr["titlePt"] = _traduzir_lote_rapido_pt(item_tr["titleOriginal"])
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

