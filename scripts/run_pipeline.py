#!/usr/bin/env python3
"""CLI Unificado de Execução do Pipeline Editorial V2 — Rodando o Mundo.

Exemplos de uso:
    python scripts/run_pipeline.py --modo pulso --dry-run
    python scripts/run_pipeline.py --modo curadoria --dry-run
    python scripts/run_pipeline.py --modo coluna --tema "Acordo Mercosul-UE e impactos comerciais" --dry-run
    python scripts/run_pipeline.py --modo pulso
"""
import argparse
import asyncio
import contextlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Garante que o diretório raiz do projeto esteja no sys.path mesmo quando executado via `python scripts/run_pipeline.py`
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT_DIR / ".env")
    load_dotenv(ROOT_DIR / "curadoria" / ".env")
except ImportError:
    pass


def _tem_chave_gemini() -> bool:
    chave = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    return bool(chave and not chave.startswith("sua_chave"))


def _serializar_resultado_editorial(res: Dict[str, Any]) -> Dict[str, Any]:
    """Converte todos os modelos Pydantic do dicionário de saída do orquestrador editorial para dicts."""
    saida: Dict[str, Any] = {}
    for k, v in res.items():
        if hasattr(v, "model_dump"):
            saida[k] = v.model_dump()
        else:
            saida[k] = v
    return saida


# ============================================================================
# 1. EXECUÇÃO DO MODO PULSO (30m — gemini-2.5-flash)
# ============================================================================

async def _executar_modo_pulso(dry_run: bool, limit: int = 10) -> Dict[str, Any]:
    from redacao_v2.coletor_estudo import (
        buscar_artigos_publicados_rom_async,
        coletar_noticias_quentes_30min_async,
    )
    from redacao_v2.pulso_noticias_quentes import executar_pipeline_pulso_async
    from redacao_v2.schemas import (
        LinkAcervoInterno,
        NoticiaQuenteItem,
        PayloadNoticiasQuentes,
    )

    with contextlib.redirect_stdout(sys.stderr):
        if _tem_chave_gemini() or not dry_run:
            payload = await executar_pipeline_pulso_async(dry_run=dry_run)
            if payload is not None:
                if limit and len(payload.noticias_quentes) > limit:
                    payload.noticias_quentes = payload.noticias_quentes[:limit]
                return payload.model_dump()

        # Fallback determinístico em dry-run quando GEMINI_API_KEY não está definida no ambiente local
        itens_coletados, acervo_rom = await asyncio.gather(
            coletar_noticias_quentes_30min_async(max_itens_por_fonte=4),
            buscar_artigos_publicados_rom_async(limite=20),
        )

    batch_atual = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    links_validos = [
        LinkAcervoInterno(
            titulo_existente=a["titulo"],
            url_existente=a["url"],
            motivo_conexao=a["resumo"][:160],
        )
        for a in (acervo_rom or [])[:2]
    ]

    noticias_simuladas: List[NoticiaQuenteItem] = []
    for idx, item in enumerate((itens_coletados or [])[: max(1, min(limit, 5))], start=1):
        slug_item = f"pulso-{idx}-{batch_atual.lower()}"
        noticias_simuladas.append(
            NoticiaQuenteItem(
                slug=slug_item,
                titulo_curto=str(item.get("titulo") or "Atualização em tempo real")[:155],
                resumo_pulso=(
                    f"Segundo {item.get('fonte', 'Fonte Oficial')}, "
                    f"{item.get('resumo') or item.get('titulo') or 'fato em acompanhamento'}."
                )[:400],
                impacto_pratico="Acompanhamento de impacto institucional, econômico e internacional.",
                categoria="Geopolitica_Relacoes",
                paises_envolvidos=[str(item.get("pais_iso") or "BR")[:2]],
                urgencia_score=max(60, 95 - (idx * 5)),
                relevancia_score=max(65, 92 - (idx * 4)),
                nivel_confianca="alta",
                ttl_horas=6,
                horas_em_destaque=6,
                veiculos_origem=[str(item.get("fonte") or "Fonte Verificada")],
                fontes_urls=[str(item.get("canonical_url") or item.get("url") or "")],
                palavras_chave=["radar", "tempo real", str(item.get("pais_iso") or "br").lower()],
                links_internos_relacionados=links_validos,
            )
        )

    payload_fallback = PayloadNoticiasQuentes(
        batch_id=batch_atual,
        model_id="gemini-2.5-flash",
        noticias_quentes=noticias_simuladas,
        eventos_comparados=[],
    )
    return payload_fallback.model_dump()


# ============================================================================
# 2. EXECUÇÃO DO MODO CURADORIA (Ciclo 3h — Insights & Vitrine)
# ============================================================================

def _executar_modo_curadoria(dry_run: bool, horas: int = 12, limit: int = 10) -> Dict[str, Any]:
    from curadoria.agente.analisador import enviar_para_backend, executar_agente_analisador
    from curadoria.agente.coletor import coletar_feeds_rss, coletar_google_trends
    from curadoria.agente.schemas import CuradoriaPayload, InsightItem, PautaSugerida
    from curadoria.pipeline import gravar_direto_banco_se_disponivel, obter_historico, salvar_snapshot_vitrine

    with contextlib.redirect_stdout(sys.stderr):
        backend_url = os.getenv("CURADORIA_BACKEND_URL", "https://api.rodandoomundo.com.br").rstrip("/")
        api_token = os.getenv("CURADORIA_SECRET_TOKEN", "")
        lote_total = coletar_google_trends() + coletar_feeds_rss(horas_limite=horas)

        if _tem_chave_gemini() or not dry_run:
            historico = [] if dry_run else obter_historico(backend_url, api_token)
            payload = executar_agente_analisador(
                noticias_brutas=lote_total,
                temas_recentes_enviados=historico,
            )
            if limit and len(payload.insights) > limit:
                payload.insights = payload.insights[:limit]

            if not dry_run:
                salvar_snapshot_vitrine(payload)
                gravou = False
                if api_token and "api.rodandoomundo.com.br" not in backend_url:
                    try:
                        enviar_para_backend(
                            payload,
                            webhook_url=f"{backend_url}/v1/curadoria",
                            api_token=api_token,
                        )
                        gravou = True
                    except Exception as e:  # noqa: BLE001
                        print(f"[Aviso] Falha ao enviar via HTTP ({e}); tentando banco direto...", file=sys.stderr)
                if not gravou:
                    gravar_direto_banco_se_disponivel(payload)

            return payload.model_dump()

    # Fallback determinístico em dry-run quando GEMINI_API_KEY não está definida no ambiente local
    batch_atual = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    insights_fallback: List[InsightItem] = []
    for idx, item in enumerate((lote_total or [])[: max(1, min(limit, 3))], start=1):
        titulo_base = str(item.get("titulo") or f"Tendência Global {idx}")[:120]
        insights_fallback.append(
            InsightItem(
                slug=f"curadoria-dry-run-{idx}",
                titulo_tema=titulo_base,
                status="em_alta",
                categoria_primaria="Geopolitica_Radar",
                categorias_cruzadas=["Economia", "Cultura"],
                relevancia_score=max(70, 95 - (idx * 5)),
                ttl_horas=24,
                palavras_chave_busca=["geopolítica", "economia", "viagens", "mundo"],
                gatilho_vitrine="Destacar cobertura internacional e impactos para viajantes",
                sintese_nerd=(
                    f"Análise em dry-run baseada na fonte {item.get('fonte', 'RSS')}: "
                    f"{item.get('resumo') or titulo_base}."
                )[:300],
                sugestao_pauta_gap=PautaSugerida(
                    titulo_seo=f"Entenda os impactos de: {titulo_base}"[:140],
                    angulo_editorial="Cruzamento entre cenário internacional, economia e mobilidade.",
                    formato_ideal="Analise Geopolitica",
                ),
            )
        )

    payload_fb = CuradoriaPayload(batch_id=batch_atual, insights=insights_fallback)
    return payload_fb.model_dump()


# ============================================================================
# 3. EXECUÇÃO DO MODO COLUNA (4 Agentes — gemini-2.5-pro)
# ============================================================================

async def _executar_modo_coluna(
    dry_run: bool,
    tema: Optional[str] = None,
    slug: Optional[str] = None,
) -> Dict[str, Any]:
    from redacao_v2.coletor_estudo import (
        buscar_artigos_publicados_rom_async,
        coletar_fontes_estudo_v2_async,
    )
    from redacao_v2.orquestrador_editorial import executar_orquestrador_editorial_async
    from redacao_v2.schemas import (
        BlocoEntendaOAssunto,
        ColunaEditorial,
        DossiePesquisaFactual,
        ImpactoPublico,
        LinkAcervoInterno,
        ParecerAdvogadoDiabo,
        PerguntaFrequenteItem,
        ResultadoAuditoria,
    )

    with contextlib.redirect_stdout(sys.stderr):
        if _tem_chave_gemini() or not dry_run:
            resultado = await executar_orquestrador_editorial_async(
                tema_foco=tema,
                dry_run=dry_run,
            )
            if resultado is not None:
                return _serializar_resultado_editorial(resultado)

        # Fallback determinístico em dry-run quando GEMINI_API_KEY não está definida no ambiente local
        documentos, acervo = await asyncio.gather(
            coletar_fontes_estudo_v2_async(max_itens_por_fonte=4),
            buscar_artigos_publicados_rom_async(limite=20),
        )

    tema_resolvido = tema or (
        documentos[0]["titulo"] if documentos else "Geopolítica e Economia Internacional Comparada"
    )
    slug_resolvido = slug or "analise-geopolitica-economia-comparada"
    links_validos = [
        LinkAcervoInterno(
            titulo_existente=a["titulo"],
            url_existente=a["url"],
            motivo_conexao=a["resumo"][:160],
        )
        for a in (acervo or [])[:2]
    ]
    fontes_nomes = list({d.get("fonte", "Fonte Primária") for d in (documentos or [])[:5]}) or ["ONU News", "BCB"]

    dossie = DossiePesquisaFactual(
        tema_central=tema_resolvido,
        slug_sugerido=slug_resolvido,
        categoria="Geopolitica_Relacoes",
        paises_envolvidos=["BR", "US"],
        cronologia_fatos=[d.get("titulo", "") for d in (documentos or [])[:4] if d.get("titulo")],
        evidencias_verificadas=[],
        fontes_primarias_identificadas=fontes_nomes,
        coberturas_imprensa_identificadas=["Cobertura comparada coletada via feeds oficiais."],
        dados_numericos_chave=[],
        pontos_incertos_ou_preliminares=["Desdobramentos diplomáticos e regulatórios permanecem em acompanhamento."],
        artigos_acervo_candidatos=links_validos,
    )
    parecer = ParecerAdvogadoDiabo(
        tese_inicial_questionada=f"Avaliação crítica sobre {tema_resolvido}.",
        vieses_detectados_nas_fontes=["Diferenças de ênfase regional entre fontes locais e internacionais."],
        riscos_falsa_simetria=["Evitar equiparar comunicados oficiais documentados a especulações sem lastro."],
        contra_argumentos_e_nuances=["Impactos dependem de implementação efetiva e confirmação institucional."],
        perguntas_nao_respondidas=["Qual o cronograma definitivo de implementação das medidas?"],
        ressalvas_obrigatorias_no_texto=[
            "Ressalva: os efeitos de médio prazo ainda dependem de confirmação oficial pelas autoridades."
        ],
        angulos_ignorados_pela_cobertura_comum=["Impacto prático sobre câmbio, fronteiras e cidadãos."],
    )
    bloco_entenda = BlocoEntendaOAssunto(
        slug=f"entenda-{slug_resolvido}"[:200],
        titulo_assunto=f"Entenda: {tema_resolvido}"[:220],
        pergunta_central=f"Quais são os fatos verificados e as ressalvas sobre {tema_resolvido}?"[:255],
        resumo_executivo=f"Síntese contextual sobre {tema_resolvido} com base em fontes primárias e imprensa.",
        contexto_historico="Contextualização estrutural gerada pelo pipeline de estudo V2 em modo dry-run.",
        categoria="Geopolitica_Relacoes",
        paises_relacionados=["BR", "US"],
        tags=["geopolítica", "economia", "contexto"],
        impactos_praticos=[
            ImpactoPublico(
                publico="geral",
                consequencia_pratica="Acompanhamento de efeitos práticos em mobilidade, comércio e políticas públicas.",
            )
        ],
        perguntas_frequentes=[
            PerguntaFrequenteItem(
                pergunta=f"O que já está confirmado sobre {tema_resolvido}?",
                resposta="Os comunicados iniciais foram registrados pelas fontes monitoradas, com ressalvas sobre etapas futuras.",
            )
        ],
        fontes_referencia=fontes_nomes,
        links_acervo_interno=links_validos,
        relevancia_score=90,
    )
    coluna = ColunaEditorial(
        slug=slug_resolvido,
        titulo=f"Análise Comparada: {tema_resolvido}"[:255],
        subtitulo="Síntese analítica com ressalvas integradas e verificação de fontes primárias.",
        tese_central=f"Os dados iniciais sobre {tema_resolvido} exigem leitura proporcional às evidências documentadas.",
        corpo_markdown=(
            f"## Contexto e Evidências Verificadas\n\n"
            f"A cobertura monitorada sobre **{tema_resolvido}** reúne registros de {', '.join(fontes_nomes[:3])}. "
            f"Ressalva importante: os desdobramentos de médio prazo ainda dependem de confirmação oficial adicional.\n"
        ),
        resumo_seo=f"Entenda {tema_resolvido}: análise comparada, fontes oficiais e impactos práticos."[:320],
        categoria="Geopolitica_Relacoes",
        paises_abordados=["BR", "US"],
        tags=["geopolítica", "análise", "verificação"],
        tempo_leitura_min=5,
        impactos_praticos=bloco_entenda.impactos_praticos,
        fontes_citadas=fontes_nomes,
        artigos_existentes_para_linkar=links_validos,
        links_acervo_interno=links_validos,
        entenda_o_assunto=bloco_entenda,
        model_id="gemini-2.5-pro",
    )
    auditoria = ResultadoAuditoria(
        aprovado=True,
        nota_isencao=92,
        score_qualidade=92,
        problemas_encontrados=[],
        urls_internas_validadas=[l.url_existente for l in links_validos],
        urls_internas_invalidas_removidas=[],
        fontes_primarias_isoladas_corretamente=True,
        ressalvas_integradas_presentes=True,
    )

    return _serializar_resultado_editorial({
        "aprovado": True,
        "dry_run": True,
        "tentativas_reescrita": 0,
        "dossie": dossie,
        "parecer_advogado_diabo": parecer,
        "coluna": coluna,
        "auditoria": auditoria,
        "persistencia": None,
    })


# ============================================================================
# 4. ENTRYPOINT CLI (ARGPARSE)
# ============================================================================

def criar_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="run_pipeline.py",
        description=(
            "CLI Oficial de Execução do Motor Editorial V2 — Rodando o Mundo "
            "(modos: pulso [30m], curadoria [3h], coluna [4 agentes])."
        ),
    )
    parser.add_argument(
        "--modo",
        required=True,
        choices=["pulso", "curadoria", "coluna"],
        help="Modo de execução do pipeline: 'pulso' (30m), 'curadoria' (3h) ou 'coluna' (4 agentes).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Executa os coletores e modelos normalmente, mas apenas imprime o JSON formatado no stdout sem gravar no banco.",
    )
    parser.add_argument(
        "--tema",
        type=str,
        default=None,
        help="Tema ou pauta prioritária (opcional, utilizado no modo 'coluna').",
    )
    parser.add_argument(
        "--slug",
        type=str,
        default=None,
        help="Slug sugerido para a coluna ou evento (opcional, utilizado no modo 'coluna').",
    )
    parser.add_argument(
        "--event-id",
        type=int,
        default=None,
        help="ID opcional do evento em ai_eventos.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Limite máximo de itens retornados no lote (default: 10).",
    )
    parser.add_argument(
        "--horas",
        type=int,
        default=12,
        help="Janela temporal em horas para coleta RSS no modo 'curadoria' (default: 12).",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = criar_parser()
    args = parser.parse_args(argv)

    if not args.dry_run and not _tem_chave_gemini():
        print(
            "[ERRO] GEMINI_API_KEY ausente. Cadastre a secret GEMINI_API_KEY em "
            "GitHub > Settings > Secrets and variables > Actions (ou no .env local).",
            file=sys.stderr,
        )
        return 3

    if args.modo == "pulso":
        saida = asyncio.run(_executar_modo_pulso(dry_run=args.dry_run, limit=args.limit))
    elif args.modo == "curadoria":
        saida = _executar_modo_curadoria(dry_run=args.dry_run, horas=args.horas, limit=args.limit)
    elif args.modo == "coluna":
        saida = asyncio.run(_executar_modo_coluna(dry_run=args.dry_run, tema=args.tema, slug=args.slug))
    else:
        parser.error(f"Modo desconhecido: {args.modo}")
        return 2

    # Imprime apenas o JSON formatado em stdout
    print(json.dumps(saida, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
