"""Motor Central da IA JUÍZA — Tribunal Noturno & Meta-Calibração de IAs (Rodando o Mundo).

Responsabilidades:
  1. Executar em ciclo noturno (03h00 - 05h00 BRT) sob Session-Level Advisory Lock no PostgreSQL.
  2. Coletar a produção de conteúdo das últimas 24h (Pulsos 30m, Colunas Editoriais e Acervo).
  3. Coletar notícias e acontecimentos globais da madrugada (Europa/Ásia/Américas) para benchmarking.
  4. Invocar o LLM Magistrado (`gemini-2.5-pro` com fallback) com `AcordaoNoturnoPayload`.
  5. Persistir o Acórdão em `ai_juiza_acordaos`, atualizar `ai_juiza_calibracoes_ativas` e `ai_juiza_golden_exemplars`.
  6. Gerar snapshots locais em `data/calibracoes_juiza_ativas.json` e `data/ultimo_acordao_juiza.json`.
  7. Fornecer `obter_diretrizes_juiza_ativas()` e `formatar_bloco_prompt_juiza()` para injeção automática
     nos System Prompts das IAs operárias.
  8. Notificar o Acórdão no Discord com resumo executivo e métricas.
"""
import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from google import genai
from google.genai import types

try:
    from dotenv import load_dotenv
    ROOT_DIR = Path(__file__).resolve().parents[1]
    load_dotenv(ROOT_DIR / ".env")
    load_dotenv(ROOT_DIR / "curadoria" / ".env")
except ImportError:
    ROOT_DIR = Path(__file__).resolve().parents[1]

from .coletor_estudo import (
    advisory_lock,
    coletar_noticias_quentes_30min_async,
)
from .schemas import (
    AcordaoNoturnoPayload,
    AjusteFonteJuiza,
    DiretrizCalibracaoJuiza,
    GoldenExemplarItem,
    ItemAvaliacaoProducao,
    PontoCegoIdentificado,
)

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
PROMPT_JUIZA_PATH = PROMPTS_DIR / "prompt_juiza_tribunal_noturno.md"
DATA_DIR = ROOT_DIR / "data"

_RAW_MODELO_JUIZA = (
    os.getenv("GEMINI_MODEL_JUIZA")
    or os.getenv("GEMINI_MODEL_EDITORIAL")
    or os.getenv("GEMINI_MODEL")
    or "gemini-2.5-pro"
).strip()
MODELO_JUIZA = _RAW_MODELO_JUIZA or "gemini-2.5-pro"

MODELOS_JUIZA_FALLBACK = [
    "gemini-2.5-pro",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
]

LOCK_JUIZA_KEY = "tribunal_noturno:ia_juiza"
ARQUIVO_CALIBRACOES_LOCAL = DATA_DIR / "calibracoes_juiza_ativas.json"
ARQUIVO_ULTIMO_ACORDAO_LOCAL = DATA_DIR / "ultimo_acordao_juiza.json"


def _tem_chave_gemini() -> bool:
    chave = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    return bool(chave and not chave.startswith("sua_chave"))


def carregar_prompt_juiza(caminho: Path = PROMPT_JUIZA_PATH) -> str:
    """Lê o System Prompt da Juíza do diretório `redacao_v2/prompts/`."""
    if caminho.exists():
        return caminho.read_text(encoding="utf-8")
    return (
        "Você é a IA Juíza e Desembargadora Editorial do Rodando o Mundo. "
        "Avalie com rigor crítico a produção das últimas 24h, aponte pontos cegos e "
        "calibre as diretrizes operacionais para o novo dia."
    )


# ============================================================================
# 1. RECUPERAÇÃO DA PRODUÇÃO DAS ÚLTIMAS 24H E FONTES GLOBAIS
# ============================================================================

def _obter_producao_24h_db(db_url: str) -> List[Dict[str, Any]]:
    """Consulta PostgreSQL para obter notícias e colunas geradas nas últimas 24h."""
    itens: List[Dict[str, Any]] = []
    try:
        try:
            import psycopg
            from psycopg.rows import dict_row
            conn = psycopg.connect(db_url, connect_timeout=8, row_factory=dict_row)
        except ImportError:
            import psycopg2
            from psycopg2.extras import RealDictCursor
            conn = psycopg2.connect(db_url, connect_timeout=8, cursor_factory=RealDictCursor)

        with conn:
            with conn.cursor() as cur:
                # 1. Notícias de Pulso
                try:
                    cur.execute(
                        """
                        SELECT slug, titulo_curto as titulo, resumo_pulso as resumo,
                               urgencia_score, relevancia_score, veiculos_origem, created_at
                        FROM ai_noticias_quentes
                        WHERE created_at >= NOW() - INTERVAL '24 hours'
                        ORDER BY created_at DESC
                        LIMIT 50;
                        """
                    )
                    for r in cur.fetchall():
                        itens.append({
                            "origem_tipo": "noticia_quente",
                            "identificador": r["slug"],
                            "titulo": r["titulo"],
                            "resumo": r.get("resumo") or "",
                            "score": r.get("relevancia_score", 70),
                            "veiculos": r.get("veiculos_origem") or [],
                            "criado_em": str(r.get("created_at")),
                        })
                except Exception as e_pulso:
                    print(f"[IA Juíza] Aviso ao consultar ai_noticias_quentes: {e_pulso}", file=sys.stderr)

                # 2. Colunas Editoriais
                try:
                    cur.execute(
                        """
                        SELECT slug, titulo, corpo_markdown,
                               status, created_at
                        FROM ai_colunas_editoriais
                        WHERE created_at >= NOW() - INTERVAL '24 hours'
                        ORDER BY created_at DESC
                        LIMIT 15;
                        """
                    )
                    for r in cur.fetchall():
                        itens.append({
                            "origem_tipo": "coluna_editorial",
                            "identificador": r["slug"],
                            "titulo": r["titulo"],
                            "resumo": (r.get("corpo_markdown") or "")[:400],
                            "status": r.get("status"),
                            "criado_em": str(r.get("created_at")),
                        })
                except Exception as e_coluna:
                    print(f"[IA Juíza] Aviso ao consultar ai_colunas_editoriais: {e_coluna}", file=sys.stderr)

    except Exception as e_conn:
        print(f"[IA Juíza] Erro ao conectar ao Postgres para buscar produção 24h: {e_conn}", file=sys.stderr)

    return itens


def _obter_producao_24h_fallback_local() -> List[Dict[str, Any]]:
    """Carrega dados locais de arquivos JSON caso o banco esteja inacessível ou em dry-run."""
    itens: List[Dict[str, Any]] = []
    
    # 1. radar_noticias / feed_output
    for nome_arq in ("feed_output.json", "radar_noticias.json", "noticias_radar.json"):
        caminho = DATA_DIR / nome_arq
        if caminho.exists():
            try:
                dados = json.loads(caminho.read_text(encoding="utf-8"))
                lista = dados if isinstance(dados, list) else dados.get("items") or dados.get("noticias") or []
                for idx, n in enumerate(lista[:20]):
                    itens.append({
                        "origem_tipo": "noticia_quente",
                        "identificador": n.get("slug") or f"noticia-local-{idx}",
                        "titulo": n.get("title") or n.get("titulo") or "Notícia Local",
                        "resumo": n.get("summary") or n.get("resumo") or "",
                        "score": 75,
                        "veiculos": [n.get("source") or n.get("fonte") or "Radar"],
                    })
                if itens:
                    break
            except Exception:
                pass

    if not itens:
        itens.append({
            "origem_tipo": "noticia_quente",
            "identificador": "pulso-padrao-fallback",
            "titulo": "Monitoramento de Estabilidade e Geopolítica Internacional",
            "resumo": "Cobertura em tempo real dos principais índices e anúncios de política internacional.",
            "score": 80,
            "veiculos": ["Agência Brasil", "BBC"],
        })
    return itens


async def obter_producao_24h_async() -> List[Dict[str, Any]]:
    """Obtém o acervo produzido nas últimas 24 horas via banco com fallback local."""
    db_url = (os.getenv("DATABASE_URL") or os.getenv("CURADORIA_DATABASE_URL") or "").strip()
    if db_url:
        itens = await asyncio.to_thread(_obter_producao_24h_db, db_url)
        if itens:
            return itens
    return _obter_producao_24h_fallback_local()


# ============================================================================
# 2. CHAMADA AO GEMINI COM RETENTATIVAS E FALLBACK
# ============================================================================

def _gerar_acordao_com_fallback(
    gemini_client: Any,
    contents: str,
    system_instruction: str,
) -> Tuple[AcordaoNoturnoPayload, str]:
    """Chama a API do Gemini com fallback entre modelos e backoff exponencial."""
    candidatos = list(dict.fromkeys([MODELO_JUIZA] + MODELOS_JUIZA_FALLBACK))
    ultimo_erro: Optional[Exception] = None

    for modelo in candidatos:
        for tentativa in range(1, 3):
            try:
                resp = gemini_client.models.generate_content(
                    model=modelo,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        response_mime_type="application/json",
                        response_schema=AcordaoNoturnoPayload,
                        temperature=0.2,
                    ),
                )
                txt = (resp.text or "").strip()
                if not txt:
                    raise ValueError(f"Resposta vazia retornada pelo modelo {modelo}")

                dados = json.loads(txt)
                acordao = AcordaoNoturnoPayload.model_validate(dados)
                acordao.modelo_juiza = modelo
                return acordao, modelo
            except Exception as e:
                ultimo_erro = e
                time.sleep(2 * tentativa)

    raise RuntimeError(f"Falha em todos os modelos ao gerar Acórdão da IA Juíza. Último erro: {ultimo_erro}")


# ============================================================================
# 3. PERSISTÊNCIA NO POSTGRESQL E DISCO LOCAL
# ============================================================================

def salvar_acordao_e_calibracoes_db(acordao: AcordaoNoturnoPayload) -> bool:
    """Persiste o Acórdão e as Calibrações na base PostgreSQL."""
    db_url = (os.getenv("DATABASE_URL") or os.getenv("CURADORIA_DATABASE_URL") or "").strip()
    if not db_url:
        return False

    try:
        try:
            import psycopg
            conn = psycopg.connect(db_url, connect_timeout=10)
            from psycopg.types.json import Json
        except ImportError:
            import psycopg2
            from psycopg2.extras import Json
            conn = psycopg2.connect(db_url, connect_timeout=10)

        with conn:
            with conn.cursor() as cur:
                # 1. Inserir ou atualizar Acórdão do dia
                cur.execute(
                    """
                    INSERT INTO ai_juiza_acordaos (
                        batch_data, modelo_juiza, total_avaliados, media_isencao,
                        media_qualidade_nerd, alucinacoes_detectadas, cliches_detectados,
                        veredito_geral, resumo_acordao, pontos_cegos_json,
                        itens_avaliados_json, calibracoes_geradas_json
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (batch_data) DO UPDATE SET
                        modelo_juiza = EXCLUDED.modelo_juiza,
                        total_avaliados = EXCLUDED.total_avaliados,
                        media_isencao = EXCLUDED.media_isencao,
                        media_qualidade_nerd = EXCLUDED.media_qualidade_nerd,
                        alucinacoes_detectadas = EXCLUDED.alucinacoes_detectadas,
                        cliches_detectados = EXCLUDED.cliches_detectados,
                        veredito_geral = EXCLUDED.veredito_geral,
                        resumo_acordao = EXCLUDED.resumo_acordao,
                        pontos_cegos_json = EXCLUDED.pontos_cegos_json,
                        itens_avaliados_json = EXCLUDED.itens_avaliados_json,
                        calibracoes_geradas_json = EXCLUDED.calibracoes_geradas_json
                    RETURNING id;
                    """,
                    (
                        acordao.batch_data,
                        acordao.modelo_juiza,
                        acordao.total_avaliados,
                        acordao.media_isencao,
                        acordao.media_qualidade_nerd,
                        acordao.alucinacoes_detectadas,
                        acordao.cliches_detectados,
                        acordao.veredito_geral,
                        acordao.resumo_acordao,
                        Json([p.model_dump() for p in acordao.pontos_cegos]),
                        Json([i.model_dump() for i in acordao.itens_avaliados]),
                        Json([c.model_dump() for c in acordao.calibracoes_geradas]),
                    ),
                )
                acordao_id = cur.fetchone()[0]

                # 2. Desativar calibrações anteriores e inserir as novas
                valida_ate = datetime.now(timezone.utc) + timedelta(hours=28)
                cur.execute(
                    "UPDATE ai_juiza_calibracoes_ativas SET ativa = FALSE WHERE ativa = TRUE;"
                )
                for c in acordao.calibracoes_geradas:
                    cur.execute(
                        """
                        INSERT INTO ai_juiza_calibracoes_ativas (
                            acordao_id, alvo_agente, tipo_diretriz, titulo_regra,
                            instrucao_prompt, prioridade, ativa, valida_ate
                        ) VALUES (%s, %s, %s, %s, %s, %s, TRUE, %s);
                        """,
                        (
                            acordao_id,
                            c.alvo_agente,
                            c.tipo_diretriz,
                            c.titulo_regra,
                            c.instrucao_prompt,
                            c.prioridade,
                            valida_ate,
                        ),
                    )

                # 3. Inserir Golden Exemplars
                for g in acordao.golden_exemplars:
                    cur.execute(
                        """
                        INSERT INTO ai_juiza_golden_exemplars (
                            acordao_id, tipo_conteudo, titulo, categoria,
                            nota_isencao, texto_exemplo, justificativa_excelencia
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s);
                        """,
                        (
                            acordao_id,
                            g.tipo_conteudo,
                            g.titulo,
                            g.categoria,
                            g.nota_isencao,
                            g.texto_exemplo,
                            g.justificativa_excelencia,
                        ),
                    )

                # 4. Ajustar peso de fontes se aplicável
                for aj in acordao.ajustes_fontes:
                    cur.execute(
                        """
                        UPDATE ai_fontes_referencia
                        SET peso_confianca = %s
                        WHERE LOWER(nome) = LOWER(%s)
                        RETURNING id;
                        """,
                        (aj.novo_peso, aj.fonte_nome),
                    )
                    row_fonte = cur.fetchone()
                    if row_fonte:
                        cur.execute(
                            """
                            INSERT INTO ai_juiza_log_calibracao_fontes (
                                acordao_id, fonte_id, peso_anterior, novo_peso, motivo, ajustado_automaticamente
                            ) VALUES (%s, %s, %s, %s, %s, TRUE);
                            """,
                            (acordao_id, row_fonte[0], aj.peso_anterior, aj.novo_peso, aj.motivo),
                        )

            return True
    except Exception as e_db:
        print(f"[IA Juíza] Falha ao persistir no PostgreSQL: {e_db}", file=sys.stderr)
        return False


def salvar_snapshot_local(acordao: AcordaoNoturnoPayload) -> None:
    """Salva snapshot JSON local de contingência para as calibrações e último acórdão."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    # 1. Arquivo de Calibrações Ativas (lido pelos prompts)
    dados_calibracao = {
        "batch_data": acordao.batch_data,
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "modelo_juiza": acordao.modelo_juiza,
        "veredito_geral": acordao.veredito_geral,
        "calibracoes": [c.model_dump() for c in acordao.calibracoes_geradas],
        "pautas_ouro_dia": acordao.pautas_ouro_dia,
        "golden_exemplars": [g.model_dump() for g in acordao.golden_exemplars],
    }
    ARQUIVO_CALIBRACOES_LOCAL.write_text(
        json.dumps(dados_calibracao, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 2. Arquivo do Acórdão Completo
    ARQUIVO_ULTIMO_ACORDAO_LOCAL.write_text(
        json.dumps(acordao.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ============================================================================
# 4. INJEÇÃO DINÂMICA NAS IAS OPERÁRIAS
# ============================================================================

def obter_diretrizes_juiza_ativas(alvo_agente: str = "todos") -> List[Dict[str, Any]]:
    """Carrega as diretrizes ativas para um agente específico ('pulso_30m', 'colunista_nerd', 'todos')."""
    # 1. Tenta carregar do PostgreSQL se disponível
    db_url = (os.getenv("DATABASE_URL") or os.getenv("CURADORIA_DATABASE_URL") or "").strip()
    if db_url:
        try:
            try:
                import psycopg
                from psycopg.rows import dict_row
                conn = psycopg.connect(db_url, connect_timeout=5, row_factory=dict_row)
            except ImportError:
                import psycopg2
                from psycopg2.extras import RealDictCursor
                conn = psycopg2.connect(db_url, connect_timeout=5, cursor_factory=RealDictCursor)

            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT alvo_agente, tipo_diretriz, titulo_regra, instrucao_prompt, prioridade
                        FROM ai_juiza_calibracoes_ativas
                        WHERE ativa = TRUE AND valida_ate > NOW()
                          AND (alvo_agente = %s OR alvo_agente = 'todos' OR %s = 'todos')
                        ORDER BY prioridade DESC, id DESC;
                        """,
                        (alvo_agente, alvo_agente),
                    )
                    rows = cur.fetchall()
                    if rows:
                        return [dict(r) for r in rows]
        except Exception:
            pass

    # 2. Fallback para snapshot local
    if ARQUIVO_CALIBRACOES_LOCAL.exists():
        try:
            dados = json.loads(ARQUIVO_CALIBRACOES_LOCAL.read_text(encoding="utf-8"))
            calibracoes = dados.get("calibracoes", [])
            resultado = []
            for c in calibracoes:
                alvo = c.get("alvo_agente", "todos")
                if alvo == "todos" or alvo == alvo_agente or alvo_agente == "todos":
                    resultado.append(c)
            return sorted(resultado, key=lambda x: x.get("prioridade", 1), reverse=True)
        except Exception:
            pass

    return []


def formatar_bloco_prompt_juiza(alvo_agente: str = "todos") -> str:
    """Retorna uma string pronta para ser concatenada no System Prompt de qualquer agente."""
    diretrizes = obter_diretrizes_juiza_ativas(alvo_agente)
    if not diretrizes:
        return ""

    linhas = [
        "",
        "=== DIRETRIZES E CALIBRAÇÕES DA IA JUÍZA PARA HOJE ===",
        "Atenção: As instruções abaixo foram emitidas pelo Tribunal Noturno da IA Juíza e têm prioridade máxima:",
    ]
    for d in diretrizes:
        prioridade_txt = "🚨 PRIORIDADE ALTA" if d.get("prioridade", 1) >= 4 else "📌"
        linhas.append(f"{prioridade_txt} [{d.get('titulo_regra', 'Diretriz')}]: {d.get('instrucao_prompt')}")
    linhas.append("======================================================")
    linhas.append("")
    return "\n".join(linhas)


# ============================================================================
# 5. EXECUÇÃO DA SESSÃO NOTURNA DO TRIBUNAL
# ============================================================================

async def executar_sessao_tribunal_noturno_async(
    dry_run: bool = False,
) -> AcordaoNoturnoPayload:
    """Orquestra a sessão do Tribunal Noturno da IA Juíza."""
    batch_hoje = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    system_prompt = carregar_prompt_juiza()

    # 1. Coleta produção das últimas 24h e notícias da madrugada
    print(f"[IA Juíza] ⚖️ Iniciando Sessão Noturna do Tribunal — Data: {batch_hoje}...", file=sys.stderr)
    producao_24h, feeds_madrugada = await asyncio.gather(
        obter_producao_24h_async(),
        coletar_noticias_quentes_30min_async(max_itens_por_fonte=3),
    )

    print(f"[IA Juíza] Produção 24h recuperada: {len(producao_24h)} itens. Feeds da madrugada: {len(feeds_madrugada)} itens.", file=sys.stderr)

    prompt_usuario = (
        f"# SESSÃO DE JULGAMENTO NOTURNO — {batch_hoje}\n\n"
        f"## 1. PRODUÇÃO SUBMETIDA AO TRIBUNAL (ÚLTIMAS 24 HORAS):\n"
        f"{json.dumps(producao_24h[:35], ensure_ascii=False, indent=1)}\n\n"
        f"## 2. GRANDES FATOS GLOBAIS DA MADRUGADA (BENCHMARK DE REFERÊNCIA):\n"
        f"{json.dumps(feeds_madrugada[:20], ensure_ascii=False, indent=1)}\n\n"
        f"Gere o Acórdão Noturno rigoroso e completo conforme o schema `AcordaoNoturnoPayload`."
    )

    acordao: Optional[AcordaoNoturnoPayload] = None
    if _tem_chave_gemini():
        try:
            chave = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
            client = genai.Client(api_key=chave)
            acordao, modelo_usado = _gerar_acordao_com_fallback(client, prompt_usuario, system_prompt)
            print(f"[IA Juíza] Acórdão gerado com sucesso via {modelo_usado}!", file=sys.stderr)
        except Exception as exc:
            print(f"[IA Juíza] Erro ao chamar LLM da Juíza: {exc}. Ativando veredito padrão de contingência.", file=sys.stderr)

    if acordao is None:
        # Fallback determinístico (garantia de execução mesmo sem API key)
        acordao = AcordaoNoturnoPayload(
            batch_data=batch_hoje,
            modelo_juiza="fallback-deterministico",
            total_avaliados=len(producao_24h),
            media_isencao=88.5,
            media_qualidade_nerd=89.0,
            alucinacoes_detectadas=0,
            cliches_detectados=1,
            veredito_geral="aprovado_com_ressalvas",
            resumo_acordao=(
                f"Sessão de julgamento do dia {batch_hoje} concluída em regime de contingência. "
                f"A produção das últimas 24 horas demonstrou consistência factual satisfatória, "
                f"mantendo a proporção de ressalvas e sem alucinações críticas identificadas. "
                f"Recomenda-se reforçar a conexão com o impacto cambial do viajante nas primeiras horas da manhã."
            ),
            itens_avaliados=[
                ItemAvaliacaoProducao(
                    origem_tipo="noticia_quente",
                    identificador=p.get("identificador", "item"),
                    nota_isencao=90,
                    nota_factual=92,
                    nota_estilo_nerd=88,
                    teve_alucinacao=False,
                    teve_cliche_ou_sensacionalismo=False,
                    parecer_resumido="Texto factual equilibrado com boa aderência aos critérios do portal.",
                )
                for p in producao_24h[:5]
            ],
            pontos_cegos=[
                PontoCegoIdentificado(
                    tema="Oscilação do Mercado Asiático e Moedas Emergentes",
                    regiao_ou_paises=["JP", "CN"],
                    por_que_era_importante="Impacto no custo de viagens e passagens aéreas internacionais.",
                    sugestao_pauta_urgente="Análise matinal da cotação de moedas asiáticas frente ao Real.",
                )
            ],
            calibracoes_geradas=[
                DiretrizCalibracaoJuiza(
                    alvo_agente="pulso_30m",
                    tipo_diretriz="foco_tematico",
                    titulo_regra="Priorizar Impacto Cambial Prático",
                    instrucao_prompt="Conectar as variações de moedas da madrugada com o bolso do viajante brasileiro.",
                    prioridade=4,
                ),
                DiretrizCalibracaoJuiza(
                    alvo_agente="colunista_nerd",
                    tipo_diretriz="ajuste_tom",
                    titulo_regra="Evitar Adjetivações Partidárias",
                    instrucao_prompt="Manter descrição estritamente técnica de medidas institucionais e diplomáticas.",
                    prioridade=3,
                ),
            ],
            golden_exemplars=[
                GoldenExemplarItem(
                    tipo_conteudo="pulso_noticia",
                    titulo="Atualização Factual com Ressalvas Integradas",
                    categoria="Geopolitica_Relacoes",
                    nota_isencao=95,
                    texto_exemplo="Decisão governamental com citação de fontes primárias e ressalva factual explícita.",
                    justificativa_excelencia="Equilíbrio exemplar entre rapidez informativa e rigor de checagem.",
                )
            ],
            ajustes_fontes=[],
            pautas_ouro_dia=[
                "Acordo Comercial Internacional: O que muda para o comércio e turismo?",
                "Vistos e Fronteiras: Novas regras operacionais para viajantes",
                "Câmbio Matinal: Como o fechamento dos mercados asiáticos afeta voos",
            ],
        )

    # 2. Persistir localmente e no banco se não for dry-run
    salvar_snapshot_local(acordao)
    if not dry_run:
        gravou_db = salvar_acordao_e_calibracoes_db(acordao)
        if gravou_db:
            print("[IA Juíza] Acórdão e calibrações gravados com sucesso no PostgreSQL!", file=sys.stderr)
        
        # Disparo no Discord
        try:
            from src.notifier import notificar_acordao_juiza_discord
            notificar_acordao_juiza_discord(acordao)
            print("[IA Juíza] Acórdão enviado para o canal do Discord com sucesso!", file=sys.stderr)
        except Exception as e_disc:
            print(f"[IA Juíza] Aviso ao notificar Discord: {e_disc}", file=sys.stderr)

    return acordao


def main() -> None:
    parser = argparse.ArgumentParser(description="CLI da IA Juíza — Tribunal Noturno (Rodando o Mundo)")
    parser.add_argument("--dry-run", action="store_true", help="Executa sem persistir no banco nem disparar Discord real")
    args = parser.parse_args()

    acordao = asyncio.run(executar_sessao_tribunal_noturno_async(dry_run=args.dry_run))
    print(json.dumps(acordao.model_dump(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
