"""Orquestrador do Pipeline Editorial Sequencial (Ciclo 3h / Biblioteca V2 — gemini-2.5-pro).

Fluxo Sequencial (docs/arquitetura_v2.md — Seções 4 e 5):
  1. Etapa 1 — Pesquisador Factual (Prompt 1 -> `DossiePesquisaFactual`)
  2. Etapa 2 — Advogado do Diabo (Prompt 2 -> `ParecerAdvogadoDiabo`)
  3. Etapa 3 — Colunista Nerd (Prompt 3 -> `ColunaEditorial` + `BlocoEntendaOAssunto`)
  4. Validação Determinística em Python (Regra 11):
     Antes de chamar o LLM Auditor, valida se todas as URLs em `artigos_existentes_para_linkar`
     existem no acervo real retornado pelo coletor (`buscar_artigos_publicados_rom_async`).
  5. Etapa 4 — Auditor / Fact-Checker (Prompt 4 -> `ResultadoAuditoria`)
  6. Loop de Reescrita (até 2 tentativas):
     Caso `aprovado == False` ou `nota_isencao < 85`, envia `problemas_encontrados` de volta ao
     Colunista Nerd para reescrita e reauditoria.
  7. Persistência no PostgreSQL:
     Salva o resultado aprovado em `ai_colunas_editoriais` (com status `rascunho_auditado`)
     e atualiza `ai_entenda_o_assunto`.
"""
import argparse
import asyncio
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from google import genai
from google.genai import types

from .coletor_estudo import (
    advisory_lock,
    buscar_artigos_publicados_rom_async,
    coletar_fontes_estudo_v2_async,
    validar_urls_internas,
)
from .schemas import (
    BlocoEntendaOAssunto,
    ColunaEditorial,
    DossiePesquisaFactual,
    LinkAcervoInterno,
    ParecerAdvogadoDiabo,
    PerguntaFrequenteItem,
    ResultadoAuditoria,
)

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
PROMPT_1_PATH = PROMPTS_DIR / "prompt_1_pesquisador_factual.md"
PROMPT_2_PATH = PROMPTS_DIR / "prompt_2_advogado_do_diabo.md"
PROMPT_3_PATH = PROMPTS_DIR / "prompt_3_colunista_nerd.md"
PROMPT_4_PATH = PROMPTS_DIR / "prompt_4_auditor_fact_checker.md"

MODELO_EDITORIAL = os.getenv("GEMINI_MODEL_EDITORIAL", "gemini-3.5-flash-lite").strip() or "gemini-3.5-flash-lite"
MODELOS_EDITORIAL_FALLBACK = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
    "gemini-3.1-flash-lite",
]
NOTA_ISENCAO_MINIMA = 85
MAX_TENTATIVAS_REESCRITA = 2
STATUS_RASCUNHO_AUDITADO = "rascunho_auditado"


def _gerar_com_fallback(
    gemini_client: Any,
    model: str,
    contents: str,
    config: types.GenerateContentConfig,
) -> Tuple[Any, str]:
    """Executa generate_content com fallback automático entre modelos Gemini disponíveis."""
    candidatos = [model] + [m for m in MODELOS_EDITORIAL_FALLBACK if m != model]
    ultimo_erro: Optional[Exception] = None
    for candidato in candidatos:
        try:
            resp = gemini_client.models.generate_content(
                model=candidato,
                contents=contents,
                config=config,
            )
            return resp, candidato
        except Exception as exc:  # noqa: BLE001
            ultimo_erro = exc
            msg = str(exc).upper()
            if any(k in msg for k in ("404", "NOT_FOUND", "503", "UNAVAILABLE", "504", "DEADLINE_EXCEEDED", "TIMEOUT", "429", "RESOURCE_EXHAUSTED")):
                print(f"[editorial_v2] Modelo {candidato} indisponível ({msg[:80]}), tentando fallback...")
                continue
            raise
    raise RuntimeError(f"Nenhum modelo Gemini disponível para editorial: {ultimo_erro}")


def carregar_prompt(caminho: Path, prefixo_fallback: str) -> str:
    """Lê o arquivo Markdown de System Prompt em `redacao_v2/prompts/`."""
    if caminho.exists():
        return caminho.read_text(encoding="utf-8").strip()
    candidatos = sorted(PROMPTS_DIR.glob(f"{prefixo_fallback}*.md"))
    if candidatos:
        return candidatos[0].read_text(encoding="utf-8").strip()
    raise FileNotFoundError(f"System Prompt não encontrado em {caminho}")


def _obter_db_url(db_url: Optional[str] = None) -> str:
    return (
        db_url
        or os.getenv("DATABASE_URL")
        or os.getenv("CURADORIA_DATABASE_URL")
        or ""
    ).strip()


# ============================================================================
# 1. VALIDAÇÃO DETERMINÍSTICA EM PYTHON DE URLs INTERNAS ANTES DO AUDITOR
# ============================================================================

def validar_artigos_existentes_para_linkar(
    coluna: ColunaEditorial,
    acervo_real: List[Dict[str, str]],
) -> Tuple[List[LinkAcervoInterno], List[str], List[str]]:
    """Valida em Python se todas as URLs em `artigos_existentes_para_linkar` existem no acervo real do coletor.

    Também remove links internos inválidos do bloco `entenda_o_assunto` e converte links internos
    inexistentes no `corpo_markdown` em texto puro descritivo (Regra 11 — Prevenção de 404).

    Retorna:
        `(links_validados_models, urls_validadas, urls_invalidas)`
    """
    links_candidatos = coluna.artigos_existentes_para_linkar or coluna.links_acervo_interno or []
    brutos = [item.model_dump() for item in links_candidatos]

    validados_dicts, urls_invalidas = validar_urls_internas(brutos, acervo_real)
    links_validados = [LinkAcervoInterno(**d) for d in validados_dicts]
    urls_validadas = [item.url_existente for item in links_validados]

    # Atualiza a coluna com a lista sanitizada
    coluna.artigos_existentes_para_linkar = list(links_validados)
    coluna.links_acervo_interno = list(links_validados)

    # Sanitiza links internos no bloco entenda_o_assunto, se presente
    if coluna.entenda_o_assunto and coluna.entenda_o_assunto.links_acervo_interno:
        brutos_entenda = [item.model_dump() for item in coluna.entenda_o_assunto.links_acervo_interno]
        val_entenda, inv_entenda = validar_urls_internas(brutos_entenda, acervo_real)
        coluna.entenda_o_assunto.links_acervo_interno = [LinkAcervoInterno(**d) for d in val_entenda]
        for u in inv_entenda:
            if u not in urls_invalidas:
                urls_invalidas.append(u)

    # Sanitiza links Markdown [texto](https://www.rodandoomundo.com.br/...) no corpo_markdown
    urls_acervo_set = {
        (a.get("url") or "").rstrip("/").lower()
        for a in acervo_real
        if a.get("url")
    }

    def _substituir_link_md(match: re.Match) -> str:
        ancora = match.group(1)
        url_md = match.group(2).strip()
        if "rodandoomundo.com.br" in url_md.lower():
            if url_md.rstrip("/").lower() not in urls_acervo_set:
                if url_md not in urls_invalidas:
                    urls_invalidas.append(url_md)
                return ancora  # Substitui por texto puro descritivo (Dead Link Prevention)
        return match.group(0)

    if coluna.corpo_markdown and urls_acervo_set:
        coluna.corpo_markdown = re.sub(
            r"\[([^\]]+)\]\((https?://[^\)]+)\)",
            _substituir_link_md,
            coluna.corpo_markdown,
        )

    return links_validados, urls_validadas, urls_invalidas


# ============================================================================
# 2. AS 4 ETAPAS DO PIPELINE SEQUENCIAL (gemini-2.5-pro)
# ============================================================================

def executar_pesquisador_factual(
    documentos_coletados: List[Dict[str, Any]],
    acervo_real: List[Dict[str, str]],
    tema_foco: Optional[str] = None,
    client: Optional[Any] = None,
    model: str = MODELO_EDITORIAL,
) -> DossiePesquisaFactual:
    """Etapa 1: Pesquisador Factual (Prompt 1 -> `DossiePesquisaFactual`)."""
    system_prompt = carregar_prompt(PROMPT_1_PATH, "prompt_1")
    gemini_client = client or genai.Client(http_options=types.HttpOptions(timeout=120_000))

    foco_str = f"TEMA PRIORITÁRIO SOLICITADO: {tema_foco}\n\n" if tema_foco else ""
    prompt_usuario = f"""
{foco_str}ACERVO_REAL_DISPONIVEL (Use somente estas URLs para artigos_acervo_candidatos):
{json.dumps(acervo_real[:60], ensure_ascii=False, indent=2)}

DOCUMENTOS_E_FONTES_COLETADAS:
{json.dumps(documentos_coletados[:35], ensure_ascii=False, indent=2)}

Extraia os fatos verificados, dados numéricos, fontes primárias, coberturas de imprensa e pontos incertos.
""".strip()

    response, _ = _gerar_com_fallback(
        gemini_client,
        model,
        prompt_usuario,
        types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=DossiePesquisaFactual,
            temperature=0.1,
        ),
    )
    dossie: Optional[DossiePesquisaFactual] = getattr(response, "parsed", None)
    if dossie is None:
        dossie = DossiePesquisaFactual.model_validate_json(response.text)
    return dossie


def executar_advogado_do_diabo(
    dossie: DossiePesquisaFactual,
    client: Optional[Any] = None,
    model: str = MODELO_EDITORIAL,
) -> ParecerAdvogadoDiabo:
    """Etapa 2: Advogado do Diabo (Prompt 2 -> `ParecerAdvogadoDiabo`)."""
    system_prompt = carregar_prompt(PROMPT_2_PATH, "prompt_2")
    gemini_client = client or genai.Client(http_options=types.HttpOptions(timeout=120_000))

    prompt_usuario = f"""
DOSSIE_PESQUISA_FACTUAL (Etapa 1):
{dossie.model_dump_json(indent=2)}

Questione teses frágeis, aponte vieses das fontes, previna falsa simetria e defina as ressalvas obrigatórias.
""".strip()

    response, _ = _gerar_com_fallback(
        gemini_client,
        model,
        prompt_usuario,
        types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=ParecerAdvogadoDiabo,
            temperature=0.2,
        ),
    )
    parecer: Optional[ParecerAdvogadoDiabo] = getattr(response, "parsed", None)
    if parecer is None:
        parecer = ParecerAdvogadoDiabo.model_validate_json(response.text)
    return parecer


def garantir_bloco_entenda_o_assunto(
    coluna: ColunaEditorial,
    dossie: DossiePesquisaFactual,
) -> BlocoEntendaOAssunto:
    """Garante que `coluna.entenda_o_assunto` esteja preenchido e consistente com a coluna aprovada."""
    if coluna.entenda_o_assunto is not None:
        if not coluna.entenda_o_assunto.links_acervo_interno and coluna.artigos_existentes_para_linkar:
            coluna.entenda_o_assunto.links_acervo_interno = list(coluna.artigos_existentes_para_linkar)
        return coluna.entenda_o_assunto

    slug_entenda = coluna.slug if coluna.slug.startswith("entenda-") else f"entenda-{coluna.slug}"
    bloco = BlocoEntendaOAssunto(
        slug=slug_entenda[:200],
        titulo_assunto=f"Entenda: {coluna.titulo}"[:220],
        pergunta_central=f"O que está em jogo em {dossie.tema_central} e quais os impactos práticos?"[:255],
        resumo_executivo=coluna.subtitulo or coluna.tese_central,
        contexto_historico=coluna.tese_central,
        categoria=coluna.categoria,
        paises_relacionados=list(coluna.paises_abordados or dossie.paises_envolvidos),
        tags=list(coluna.tags),
        impactos_praticos=list(coluna.impactos_praticos),
        perguntas_frequentes=[
            PerguntaFrequenteItem(
                pergunta=f"Qual é o ponto central sobre {dossie.tema_central}?",
                resposta=coluna.tese_central,
            )
        ],
        fontes_referencia=list(coluna.fontes_citadas or dossie.fontes_primarias_identificadas),
        links_acervo_interno=list(coluna.artigos_existentes_para_linkar),
        relevancia_score=90,
    )
    coluna.entenda_o_assunto = bloco
    return bloco


def executar_colunista_nerd(
    dossie: DossiePesquisaFactual,
    parecer: ParecerAdvogadoDiabo,
    acervo_real: List[Dict[str, str]],
    problemas_encontrados: Optional[List[str]] = None,
    rascunho_anterior: Optional[ColunaEditorial] = None,
    client: Optional[Any] = None,
    model: str = MODELO_EDITORIAL,
) -> ColunaEditorial:
    """Etapa 3: Colunista Nerd (Prompt 3 -> `ColunaEditorial`).

    Suporta tanto a redação inicial quanto a reescrita guiada por `problemas_encontrados` do Auditor.
    """
    system_prompt = carregar_prompt(PROMPT_3_PATH, "prompt_3")
    gemini_client = client or genai.Client(http_options=types.HttpOptions(timeout=120_000))

    bloco_reescrita = ""
    if problemas_encontrados:
        rascunho_json = rascunho_anterior.model_dump_json(indent=2) if rascunho_anterior else "{}"
        bloco_reescrita = f"""
====================================================================
MODO DE REESCRITA OBRIGATÓRIA (REPROVADO PELA AUDITORIA ANTERIOR)
====================================================================
PROBLEMAS_ENCONTRADOS_NA_AUDITORIA_ANTERIOR (Corrija TODOS os itens abaixo):
{json.dumps(problemas_encontrados, ensure_ascii=False, indent=2)}

RASCUNHO_ANTERIOR_PARA_CORRECAO:
{rascunho_json}
====================================================================
"""

    prompt_usuario = f"""
{bloco_reescrita}
DOSSIE_PESQUISA_FACTUAL (Etapa 1):
{dossie.model_dump_json(indent=2)}

PARECER_ADVOGADO_DO_DIABO (Etapa 2 — Integre todas as ressalvas obrigatórias no texto):
{parecer.model_dump_json(indent=2)}

ACERVO_REAL_DISPONIVEL (Use EXCLUSIVAMENTE URLs desta lista em artigos_existentes_para_linkar):
{json.dumps(acervo_real[:60], ensure_ascii=False, indent=2)}

Redija a ColunaEditorial completa e o bloco entenda_o_assunto correspondente.
""".strip()

    response, modelo_usado = _gerar_com_fallback(
        gemini_client,
        model,
        prompt_usuario,
        types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=ColunaEditorial,
            temperature=0.25,
        ),
    )
    coluna: Optional[ColunaEditorial] = getattr(response, "parsed", None)
    if coluna is None:
        coluna = ColunaEditorial.model_validate_json(response.text)

    coluna.model_id = modelo_usado
    garantir_bloco_entenda_o_assunto(coluna, dossie)
    return coluna


def executar_auditor_fact_checker(
    dossie: DossiePesquisaFactual,
    parecer: ParecerAdvogadoDiabo,
    coluna: ColunaEditorial,
    urls_validas: List[str],
    urls_invalidas: List[str],
    client: Optional[Any] = None,
    model: str = MODELO_EDITORIAL,
) -> ResultadoAuditoria:
    """Etapa 4: Auditor / Fact-Checker (Prompt 4 -> `ResultadoAuditoria`).

    Recebe o resultado da validação prévia em Python de `artigos_existentes_para_linkar`.
    """
    system_prompt = carregar_prompt(PROMPT_4_PATH, "prompt_4")
    gemini_client = client or genai.Client(http_options=types.HttpOptions(timeout=120_000))

    relatorio_urls_python = {
        "todas_urls_validas_no_acervo": len(urls_invalidas) == 0,
        "urls_internas_validadas": urls_validas,
        "urls_internas_invalidas_detectadas": urls_invalidas,
    }

    prompt_usuario = f"""
DOSSIE_PESQUISA_FACTUAL (Etapa 1):
{dossie.model_dump_json(indent=2)}

PARECER_ADVOGADO_DO_DIABO (Etapa 2):
{parecer.model_dump_json(indent=2)}

VALIDACAO_DETERMINISTICA_URLS_PYTHON (Executada antes desta auditoria):
{json.dumps(relatorio_urls_python, ensure_ascii=False, indent=2)}

COLUNA_EDITORIAL_PARA_AUDITORIA (Etapa 3):
{coluna.model_dump_json(indent=2)}

Audite rigorosamente a precisão factual, a integração das ressalvas e atribua nota_isencao (0 a 100).
""".strip()

    response, _ = _gerar_com_fallback(
        gemini_client,
        model,
        prompt_usuario,
        types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=ResultadoAuditoria,
            temperature=0.1,
        ),
    )
    auditoria: Optional[ResultadoAuditoria] = getattr(response, "parsed", None)
    if auditoria is None:
        auditoria = ResultadoAuditoria.model_validate_json(response.text)

    # Mescla o resultado determinístico de URLs em Python na auditoria
    auditoria.urls_internas_validadas = list(urls_validas)
    auditoria.urls_internas_invalidas_removidas = list(urls_invalidas)

    if urls_invalidas:
        for u_inv in urls_invalidas:
            msg = f"URL interna inexistente no acervo real do coletor foi sugerida e precisou ser removida: {u_inv}"
            if msg not in auditoria.problemas_encontrados:
                auditoria.problemas_encontrados.append(msg)

    if auditoria.nota_isencao < NOTA_ISENCAO_MINIMA:
        auditoria.aprovado = False
        if not auditoria.problemas_encontrados:
            auditoria.problemas_encontrados.append(
                f"Nota de isenção ({auditoria.nota_isencao}) abaixo do mínimo exigido ({NOTA_ISENCAO_MINIMA}). "
                "Reforce a neutralidade, remova adjetivações e integre todas as ressalvas do Advogado do Diabo."
            )

    if not auditoria.aprovado and not auditoria.problemas_encontrados:
        auditoria.problemas_encontrados.append(
            "O Auditor reprovou a coluna por falta de aderência estrita às evidências ou às ressalvas obrigatórias."
        )

    auditoria.erros_criticos = list(auditoria.problemas_encontrados)
    return auditoria


# ============================================================================
# 3. PERSISTÊNCIA EM ai_colunas_editoriais E ai_entenda_o_assunto
# ============================================================================

UPSERT_COLUNA_EDITORIAL_SQL = """
INSERT INTO ai_colunas_editoriais (
    slug, titulo, subtitulo, tese_central, corpo_markdown, resumo_seo,
    categoria, paises_abordados, tags, tempo_leitura_min,
    impactos_praticos, fontes_citadas, links_acervo_interno,
    auditoria_resultado, auditoria_aprovada, model_id,
    status, review_status, updated_at
) VALUES (
    %(slug)s, %(titulo)s, %(subtitulo)s, %(tese_central)s, %(corpo_markdown)s, %(resumo_seo)s,
    %(categoria)s, %(paises_abordados)s, %(tags)s, %(tempo_leitura_min)s,
    %(impactos_praticos)s::jsonb, %(fontes_citadas)s::jsonb, %(links_acervo_interno)s::jsonb,
    %(auditoria_resultado)s::jsonb, %(auditoria_aprovada)s, %(model_id)s,
    %(status)s, %(review_status)s, %(updated_at)s
)
ON CONFLICT (slug) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    subtitulo = EXCLUDED.subtitulo,
    tese_central = EXCLUDED.tese_central,
    corpo_markdown = EXCLUDED.corpo_markdown,
    resumo_seo = EXCLUDED.resumo_seo,
    categoria = EXCLUDED.categoria,
    paises_abordados = EXCLUDED.paises_abordados,
    tags = EXCLUDED.tags,
    tempo_leitura_min = EXCLUDED.tempo_leitura_min,
    impactos_praticos = EXCLUDED.impactos_praticos,
    fontes_citadas = EXCLUDED.fontes_citadas,
    links_acervo_interno = EXCLUDED.links_acervo_interno,
    auditoria_resultado = EXCLUDED.auditoria_resultado,
    auditoria_aprovada = EXCLUDED.auditoria_aprovada,
    model_id = EXCLUDED.model_id,
    status = EXCLUDED.status,
    review_status = EXCLUDED.review_status,
    updated_at = EXCLUDED.updated_at;
"""

UPSERT_ENTENDA_O_ASSUNTO_SQL = """
INSERT INTO ai_entenda_o_assunto (
    slug, titulo_assunto, pergunta_central, resumo_executivo, contexto_historico,
    categoria, paises_relacionados, tags, impactos_praticos, perguntas_frequentes,
    fontes_referencia, links_acervo_interno, relevancia_score, model_id, status, updated_at
) VALUES (
    %(slug)s, %(titulo_assunto)s, %(pergunta_central)s, %(resumo_executivo)s, %(contexto_historico)s,
    %(categoria)s, %(paises_relacionados)s, %(tags)s, %(impactos_praticos)s::jsonb, %(perguntas_frequentes)s::jsonb,
    %(fontes_referencia)s::jsonb, %(links_acervo_interno)s::jsonb, %(relevancia_score)s, %(model_id)s, %(status)s, %(updated_at)s
)
ON CONFLICT (slug) DO UPDATE SET
    titulo_assunto = EXCLUDED.titulo_assunto,
    pergunta_central = EXCLUDED.pergunta_central,
    resumo_executivo = EXCLUDED.resumo_executivo,
    contexto_historico = EXCLUDED.contexto_historico,
    categoria = EXCLUDED.categoria,
    paises_relacionados = EXCLUDED.paises_relacionados,
    tags = EXCLUDED.tags,
    impactos_praticos = EXCLUDED.impactos_praticos,
    perguntas_frequentes = EXCLUDED.perguntas_frequentes,
    fontes_referencia = EXCLUDED.fontes_referencia,
    links_acervo_interno = EXCLUDED.links_acervo_interno,
    relevancia_score = EXCLUDED.relevancia_score,
    model_id = EXCLUDED.model_id,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at;
"""


def salvar_resultado_editorial_aprovado(
    conn: Any,
    coluna: ColunaEditorial,
    auditoria: ResultadoAuditoria,
    dossie: Optional[DossiePesquisaFactual] = None,
    status_coluna: str = STATUS_RASCUNHO_AUDITADO,
) -> Dict[str, str]:
    """Salva a coluna aprovada em `ai_colunas_editoriais` (com status `rascunho_auditado`)
    e atualiza `ai_entenda_o_assunto`.
    """
    if not auditoria.aprovado or auditoria.nota_isencao < NOTA_ISENCAO_MINIMA:
        raise ValueError(
            f"Tentativa de salvar coluna não aprovada (aprovado={auditoria.aprovado}, "
            f"nota_isencao={auditoria.nota_isencao})."
        )

    agora = datetime.now(timezone.utc)
    bloco_entenda = coluna.entenda_o_assunto
    if bloco_entenda is None and dossie is not None:
        bloco_entenda = garantir_bloco_entenda_o_assunto(coluna, dossie)
    elif bloco_entenda is None:
        bloco_entenda = BlocoEntendaOAssunto(
            slug=f"entenda-{coluna.slug}"[:200],
            titulo_assunto=f"Entenda: {coluna.titulo}"[:220],
            pergunta_central=f"Por que {coluna.titulo} é relevante?"[:255],
            resumo_executivo=coluna.subtitulo,
            contexto_historico=coluna.tese_central,
            categoria=coluna.categoria,
            paises_relacionados=list(coluna.paises_abordados),
            tags=list(coluna.tags),
            impactos_praticos=list(coluna.impactos_praticos),
            perguntas_frequentes=[],
            fontes_referencia=list(coluna.fontes_citadas),
            links_acervo_interno=list(coluna.artigos_existentes_para_linkar),
            relevancia_score=90,
        )

    links_validados_json = json.dumps(
        [l.model_dump() for l in coluna.artigos_existentes_para_linkar],
        ensure_ascii=False,
    )

    params_coluna = {
        "slug": coluna.slug[:200],
        "titulo": coluna.titulo[:255],
        "subtitulo": coluna.subtitulo,
        "tese_central": coluna.tese_central,
        "corpo_markdown": coluna.corpo_markdown,
        "resumo_seo": coluna.resumo_seo[:320],
        "categoria": coluna.categoria,
        "paises_abordados": list(coluna.paises_abordados),
        "tags": list(coluna.tags),
        "tempo_leitura_min": max(1, min(60, int(coluna.tempo_leitura_min or 5))),
        "impactos_praticos": json.dumps(
            [i.model_dump() for i in coluna.impactos_praticos],
            ensure_ascii=False,
        ),
        "fontes_citadas": json.dumps(list(coluna.fontes_citadas), ensure_ascii=False),
        "links_acervo_interno": links_validados_json,
        "auditoria_resultado": json.dumps(auditoria.model_dump(), ensure_ascii=False),
        "auditoria_aprovada": True,
        "model_id": coluna.model_id or MODELO_EDITORIAL,
        "status": status_coluna,
        "review_status": status_coluna,
        "updated_at": agora,
    }

    params_entenda = {
        "slug": bloco_entenda.slug[:200],
        "titulo_assunto": bloco_entenda.titulo_assunto[:220],
        "pergunta_central": bloco_entenda.pergunta_central[:255],
        "resumo_executivo": bloco_entenda.resumo_executivo,
        "contexto_historico": bloco_entenda.contexto_historico,
        "categoria": bloco_entenda.categoria,
        "paises_relacionados": list(bloco_entenda.paises_relacionados),
        "tags": list(bloco_entenda.tags),
        "impactos_praticos": json.dumps(
            [i.model_dump() for i in bloco_entenda.impactos_praticos],
            ensure_ascii=False,
        ),
        "perguntas_frequentes": json.dumps(
            [p.model_dump() for p in bloco_entenda.perguntas_frequentes],
            ensure_ascii=False,
        ),
        "fontes_referencia": json.dumps(list(bloco_entenda.fontes_referencia), ensure_ascii=False),
        "links_acervo_interno": json.dumps(
            [l.model_dump() for l in bloco_entenda.links_acervo_interno],
            ensure_ascii=False,
        ),
        "relevancia_score": bloco_entenda.relevancia_score,
        "model_id": coluna.model_id or MODELO_EDITORIAL,
        "status": status_coluna,
        "updated_at": agora,
    }

    with conn.cursor() as cur:
        # Garante compatibilidade da coluna status em bancos já inicializados
        try:
            cur.execute(
                "ALTER TABLE ai_colunas_editoriais ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'rascunho_auditado';"
            )
        except Exception:  # noqa: BLE001
            pass

        cur.execute(UPSERT_COLUNA_EDITORIAL_SQL, params_coluna)
        cur.execute(UPSERT_ENTENDA_O_ASSUNTO_SQL, params_entenda)

    conn.commit()
    return {
        "coluna_slug": params_coluna["slug"],
        "entenda_slug": params_entenda["slug"],
        "status": status_coluna,
    }


# ============================================================================
# 4. PIPELINE ORQUESTRADOR COMPLETO COM LOOP DE ATÉ 2 REESCRITAS
# ============================================================================

def executar_pipeline_editorial_sequencial(
    documentos_coletados: List[Dict[str, Any]],
    acervo_real: List[Dict[str, str]],
    tema_foco: Optional[str] = None,
    max_tentativas_reescrita: int = MAX_TENTATIVAS_REESCRITA,
    client: Optional[Any] = None,
    model: str = MODELO_EDITORIAL,
    conn: Optional[Any] = None,
) -> Dict[str, Any]:
    """Executa o pipeline sequencial completo em `gemini-2.5-pro`:
      1. Pesquisador Factual -> `DossiePesquisaFactual`
      2. Advogado do Diabo -> `ParecerAdvogadoDiabo`
      3. Colunista Nerd -> `ColunaEditorial`
      4. Validação em Python de `artigos_existentes_para_linkar` contra `acervo_real`
      5. Auditor / Fact-Checker -> `ResultadoAuditoria`
      6. Loop de até `max_tentativas_reescrita` (2) tentativas de reescrita se
         `aprovado == False` ou `nota_isencao < 85`, enviando `problemas_encontrados` de volta ao Colunista.
      7. Se aprovado e `conn` fornecida, salva em `ai_colunas_editoriais` (`rascunho_auditado`)
         e atualiza `ai_entenda_o_assunto`.
    """
    gemini_client = client or genai.Client(http_options=types.HttpOptions(timeout=120_000))

    # Etapa 1: Pesquisador Factual
    print("[editorial_v2] Etapa 1/4: Executando Pesquisador Factual (gemini-2.5-pro)...")
    dossie = executar_pesquisador_factual(
        documentos_coletados=documentos_coletados,
        acervo_real=acervo_real,
        tema_foco=tema_foco,
        client=gemini_client,
        model=model,
    )

    # Etapa 2: Advogado do Diabo
    print("[editorial_v2] Etapa 2/4: Executando Advogado do Diabo (gemini-2.5-pro)...")
    parecer = executar_advogado_do_diabo(
        dossie=dossie,
        client=gemini_client,
        model=model,
    )

    # Etapa 3: Colunista Nerd (Redação inicial)
    print("[editorial_v2] Etapa 3/4: Executando Colunista Nerd (redação inicial)...")
    coluna = executar_colunista_nerd(
        dossie=dossie,
        parecer=parecer,
        acervo_real=acervo_real,
        problemas_encontrados=None,
        rascunho_anterior=None,
        client=gemini_client,
        model=model,
    )

    # Validação determinística em Python ANTES de chamar o LLM Auditor
    _, urls_validas, urls_invalidas = validar_artigos_existentes_para_linkar(coluna, acervo_real)

    # Etapa 4: Auditor / Fact-Checker (Auditoria inicial)
    print("[editorial_v2] Etapa 4/4: Executando Auditor / Fact-Checker...")
    auditoria = executar_auditor_fact_checker(
        dossie=dossie,
        parecer=parecer,
        coluna=coluna,
        urls_validas=urls_validas,
        urls_invalidas=urls_invalidas,
        client=gemini_client,
        model=model,
    )

    # Loop de até 2 tentativas de reescrita caso aprovado == False ou nota_isencao < 85
    tentativas_reescrita = 0
    while (
        not auditoria.aprovado or auditoria.nota_isencao < NOTA_ISENCAO_MINIMA
    ) and tentativas_reescrita < max_tentativas_reescrita:
        tentativas_reescrita += 1
        problemas = list(auditoria.problemas_encontrados)
        print(
            f"[editorial_v2] Reescrita {tentativas_reescrita}/{max_tentativas_reescrita} acionada "
            f"(aprovado={auditoria.aprovado}, nota_isencao={auditoria.nota_isencao}). "
            f"Enviando {len(problemas)} problema(s) de volta ao Colunista Nerd..."
        )

        coluna = executar_colunista_nerd(
            dossie=dossie,
            parecer=parecer,
            acervo_real=acervo_real,
            problemas_encontrados=problemas,
            rascunho_anterior=coluna,
            client=gemini_client,
            model=model,
        )

        # Revalida em Python todas as URLs em artigos_existentes_para_linkar antes de reauditar
        _, urls_validas, urls_invalidas = validar_artigos_existentes_para_linkar(coluna, acervo_real)

        auditoria = executar_auditor_fact_checker(
            dossie=dossie,
            parecer=parecer,
            coluna=coluna,
            urls_validas=urls_validas,
            urls_invalidas=urls_invalidas,
            client=gemini_client,
            model=model,
        )

    aprovado_final = bool(auditoria.aprovado and auditoria.nota_isencao >= NOTA_ISENCAO_MINIMA)
    persistencia_info: Optional[Dict[str, str]] = None

    if aprovado_final and conn is not None:
        persistencia_info = salvar_resultado_editorial_aprovado(
            conn=conn,
            coluna=coluna,
            auditoria=auditoria,
            dossie=dossie,
            status_coluna=STATUS_RASCUNHO_AUDITADO,
        )

    return {
        "aprovado": aprovado_final,
        "tentativas_reescrita": tentativas_reescrita,
        "dossie": dossie,
        "parecer_advogado_diabo": parecer,
        "coluna": coluna,
        "auditoria": auditoria,
        "persistencia": persistencia_info,
    }


async def executar_orquestrador_editorial_async(
    tema_foco: Optional[str] = None,
    db_url: Optional[str] = None,
    dry_run: bool = False,
    client: Optional[Any] = None,
) -> Optional[Dict[str, Any]]:
    """Coleta as fontes de estudo V2 e o acervo publicado, executa o pipeline sequencial
    e grava o resultado aprovado em `ai_colunas_editoriais` e `ai_entenda_o_assunto`.
    """
    database_url = _obter_db_url(db_url)

    documentos_coletados, acervo_real = await asyncio.gather(
        coletar_fontes_estudo_v2_async(),
        buscar_artigos_publicados_rom_async(db_url=database_url),
    )

    if not documentos_coletados:
        print("[editorial_v2] Nenhum documento coletado das fontes de estudo V2.")
        return None

    resultado = await asyncio.to_thread(
        executar_pipeline_editorial_sequencial,
        documentos_coletados,
        acervo_real,
        tema_foco,
        MAX_TENTATIVAS_REESCRITA,
        client,
        MODELO_EDITORIAL,
        None,
    )

    if not resultado["aprovado"]:
        print(
            f"[editorial_v2] Coluna reprovada após {resultado['tentativas_reescrita']} reescrita(s) "
            f"(nota_isencao={resultado['auditoria'].nota_isencao}). Não será gravada como aprovada."
        )
        return resultado

    if dry_run or not database_url:
        print(
            f"[editorial_v2] Coluna '{resultado['coluna'].slug}' aprovada "
            f"(nota_isencao={resultado['auditoria'].nota_isencao}) em modo dry-run/sem banco."
        )
        return resultado

    def _gravar_no_banco() -> Optional[Dict[str, str]]:
        import psycopg

        lock_key = f"evento_consolida:{resultado['coluna'].slug}"
        with psycopg.connect(database_url, connect_timeout=10, prepare_threshold=None) as conn:
            with advisory_lock(conn, lock_key) as adquirido:
                if not adquirido:
                    print(f"[editorial_v2] Lock ocupado ({lock_key}). Abortando gravação concorrente.")
                    return None
                return salvar_resultado_editorial_aprovado(
                    conn=conn,
                    coluna=resultado["coluna"],
                    auditoria=resultado["auditoria"],
                    dossie=resultado["dossie"],
                    status_coluna=STATUS_RASCUNHO_AUDITADO,
                )

    info_db = await asyncio.to_thread(_gravar_no_banco)
    resultado["persistencia"] = info_db
    return resultado


def executar_orquestrador_editorial(
    tema_foco: Optional[str] = None,
    db_url: Optional[str] = None,
    dry_run: bool = False,
    client: Optional[Any] = None,
) -> Optional[Dict[str, Any]]:
    """Wrapper síncrono para `executar_orquestrador_editorial_async`."""
    return asyncio.run(
        executar_orquestrador_editorial_async(
            tema_foco=tema_foco,
            db_url=db_url,
            dry_run=dry_run,
            client=client,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Orquestrador Editorial V2 (Pesquisador -> Advogado do Diabo -> Colunista -> Auditor)"
    )
    parser.add_argument("--tema", type=str, default=None, help="Tema prioritário opcional para a coluna")
    parser.add_argument("--dry-run", action="store_true", help="Executa sem gravar no PostgreSQL")
    args = parser.parse_args()

    res = executar_orquestrador_editorial(tema_foco=args.tema, dry_run=args.dry_run)
    if res:
        print(
            json.dumps(
                {
                    "aprovado": res["aprovado"],
                    "tentativas_reescrita": res["tentativas_reescrita"],
                    "coluna_slug": res["coluna"].slug,
                    "nota_isencao": res["auditoria"].nota_isencao,
                    "persistencia": res["persistencia"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
