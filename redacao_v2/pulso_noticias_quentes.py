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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types

from .coletor_estudo import (
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
MODELO_PULSO = "gemini-2.5-flash"
LOCK_PULSO_KEY = "pipeline_pulso:noticias_quentes_30m"


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
               urgencia_score, relevancia_score, ttl_horas, expires_at
        FROM ai_noticias_quentes
        WHERE expires_at > NOW()
        ORDER BY urgencia_score DESC, relevancia_score DESC
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
                    "urgencia_score", "relevancia_score", "ttl_horas", "expires_at",
                ]
                item = dict(zip(col_names, r))
            if isinstance(item.get("expires_at"), datetime):
                item["expires_at"] = item["expires_at"].isoformat()
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


def gerar_pulso_noticias_quentes(
    itens_coletados: List[Dict[str, Any]],
    noticias_ativas_banco: List[Dict[str, Any]],
    acervo_publicado: Optional[List[Dict[str, str]]] = None,
    client: Optional[Any] = None,
    model: str = MODELO_PULSO,
) -> PayloadNoticiasQuentes:
    """Chama `gemini-2.5-flash` com `response_schema=PayloadNoticiasQuentes` e deduplicação de ativos."""
    system_prompt = carregar_prompt_pulso()
    gemini_client = client or genai.Client(http_options=types.HttpOptions(timeout=90_000))
    batch_atual = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    acervo = acervo_publicado or []

    prompt_usuario = f"""
BATCH_ID ATUAL: {batch_atual}

NOTICIAS_ATIVAS_NO_BANCO (expires_at > NOW() — Deduplique contra estes itens; só reutilize o mesmo slug se houver fato novo relevante):
{json.dumps(noticias_ativas_banco, ensure_ascii=False, indent=2)}

ACERVO_REAL_DISPONIVEL (Use exclusivamente estas URLs em links_internos_relacionados):
{json.dumps(acervo[:50], ensure_ascii=False, indent=2)}

LOTE_DE_FEEDS_PULSO_30MIN:
{json.dumps(itens_coletados[:40], ensure_ascii=False, indent=2)}

Analise o lote, deduplique contra as notícias ativas no banco e retorne o JSON seguindo estritamente PayloadNoticiasQuentes.
""".strip()

    response = gemini_client.models.generate_content(
        model=model,
        contents=prompt_usuario,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=PayloadNoticiasQuentes,
            temperature=0.2,
        ),
    )

    payload: Optional[PayloadNoticiasQuentes] = getattr(response, "parsed", None)
    if payload is None:
        payload = PayloadNoticiasQuentes.model_validate_json(response.text)

    payload.batch_id = payload.batch_id or batch_atual
    payload.model_id = model
    payload.noticias_quentes.sort(
        key=lambda n: (n.urgencia_score, n.relevancia_score),
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
    payload_json, model_id, status, destaque_ate, expires_at, updated_at
) VALUES (
    %(slug)s, %(batch_id)s, %(titulo_curto)s, %(resumo_pulso)s, %(impacto_pratico)s,
    %(categoria)s, %(paises_envolvidos)s, %(urgencia_score)s, %(relevancia_score)s,
    %(nivel_confianca)s, %(ttl_horas)s, %(horas_em_destaque)s, %(veiculos_origem)s,
    %(fontes_urls)s, %(palavras_chave)s, %(links_internos_relacionados)s::jsonb,
    %(payload_json)s::jsonb, %(model_id)s, %(status)s, %(destaque_ate)s, %(expires_at)s, %(updated_at)s
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
    destaque_ate = EXCLUDED.destaque_ate,
    expires_at = EXCLUDED.expires_at,
    updated_at = EXCLUDED.updated_at;
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
        # Garante compatibilidade caso a tabela já exista sem a coluna ttl_horas
        try:
            cur.execute(
                "ALTER TABLE ai_noticias_quentes ADD COLUMN IF NOT EXISTS ttl_horas INTEGER NOT NULL DEFAULT 6;"
            )
        except Exception:  # noqa: BLE001
            pass

        for item in payload.noticias_quentes:
            ttl = max(1, int(item.ttl_horas or item.horas_em_destaque or 6))
            horas_destaque = max(1, min(24, int(item.horas_em_destaque or ttl)))
            expires_at = calcular_expires_at(ref_time, ttl)
            destaque_ate = ref_time + timedelta(hours=horas_destaque)

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
                "destaque_ate": destaque_ate,
                "expires_at": expires_at,
                "updated_at": ref_time,
            }
            cur.execute(UPSERT_NOTICIA_QUENTE_SQL, params)
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


async def executar_pipeline_pulso_async(
    db_url: Optional[str] = None,
    dry_run: bool = False,
    client: Optional[Any] = None,
) -> Optional[PayloadNoticiasQuentes]:
    """Executa o ciclo completo de 30 minutos:
    1. Coleta feeds (`FONTES_NOTICIAS_QUENTES_30MIN`) e acervo publicado (`buscar_artigos_publicados_rom_async`);
    2. Busca notícias ativas no banco (`expires_at > NOW()`) para deduplicação;
    3. Chama `gemini-2.5-flash` com `response_schema=PayloadNoticiasQuentes`;
    4. Executa UPSERT em `ai_noticias_quentes` calculando `expires_at` via `ttl_horas`,
       protegido por `advisory_lock` e auditado em `ai_execucoes_pipeline`.
    """
    database_url = _obter_db_url(db_url)

    itens_coletados, acervo_rom = await asyncio.gather(
        coletar_noticias_quentes_30min_async(),
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
                    salvos = executar_upsert_noticias_quentes(conn, payload, status_inicial="ativo")
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

    total_salvos = await asyncio.to_thread(_persistir_com_lock)
    print(f"[pulso_30m] UPSERT concluído em ai_noticias_quentes: {total_salvos} registros atualizados.")
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
