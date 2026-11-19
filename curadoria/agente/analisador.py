"""Cérebro analisador: Gemini + Structured Outputs validados por Pydantic."""
import json
import os
import time
from datetime import datetime, timezone
from typing import List

import requests
from google import genai
from google.genai import types
from google.genai.errors import APIError

from .prompt import SYSTEM_PROMPT
from .schemas import CuradoriaPayload, InsightItem, PautaSugerida

_RAW_CURADORIA_MODEL = os.getenv("CURADORIA_MODEL", "gemini-2.5-flash").strip()
MODELO_PADRAO = (
    "gemini-2.5-flash"
    if (not _RAW_CURADORIA_MODEL or _RAW_CURADORIA_MODEL.startswith("gemini-3"))
    else _RAW_CURADORIA_MODEL
)
MODELOS_FALLBACK = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
]


def _construir_fallback_deterministico(batch_atual: str, lote_filtrado: List[dict]) -> CuradoriaPayload:
    """Fallback heurístico para manter o pipeline de curadoria resiliente quando chaves de IA falham."""
    insights_fb: List[InsightItem] = []
    for idx, item in enumerate((lote_filtrado or [])[:3], start=1):
        titulo_base = str(item.get("titulo") or f"Tendência Global {idx}").strip()[:120]
        fonte_nome = str(item.get("origem") or item.get("fonte") or "Radar Global").strip()
        resumo_base = str(item.get("resumo") or titulo_base).strip()
        insights_fb.append(
            InsightItem(
                slug=f"curadoria-auto-{idx}-{batch_atual.lower()}",
                titulo_tema=titulo_base,
                status="em_alta",
                categoria_primaria="Geopolitica_Radar",
                categorias_cruzadas=["Economia", "Cultura"],
                relevancia_score=max(70, 95 - (idx * 5)),
                ttl_horas=24,
                palavras_chave_busca=["geopolítica", "economia", "viagens", "mundo"],
                gatilho_vitrine="Destacar cobertura internacional e impactos práticos",
                sintese_nerd=f"Síntese automática de contingência ({fonte_nome}): {resumo_base}."[:300],
                sugestao_pauta_gap=PautaSugerida(
                    titulo_seo=f"Entenda os impactos de: {titulo_base}"[:140],
                    angulo_editorial="Cruzamento entre cenário internacional, economia e mobilidade.",
                    formato_ideal="Analise Geopolitica",
                ),
            )
        )
    return CuradoriaPayload(batch_id=batch_atual, insights=insights_fb)


def executar_agente_analisador(noticias_brutas: List[dict], temas_recentes_enviados: List[str]) -> CuradoriaPayload:
    batch_atual = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")

    # Prioriza itens RSS mais recentes por data_publicacao antes de fatiar o lote (evita que Politica sufoque outras editorias)
    trends = [it for it in noticias_brutas if isinstance(it, dict) and "google trends" in str(it.get("origem", "")).lower()]
    rss = [it for it in noticias_brutas if isinstance(it, dict) and "google trends" not in str(it.get("origem", "")).lower()]
    rss.sort(key=lambda it: str(it.get("data_publicacao") or ""), reverse=True)
    trends_lote = trends[:10]
    rss_lote = rss[: max(0, 35 - len(trends_lote))]
    lote_filtrado = (trends_lote + rss_lote)[:35]

    prompt_usuario = f"""
BATCH_ID ATUAL: {batch_atual}

TEMAS_RECENTES_ENVIADOS (Evite repetir, a menos que haja atualização relevante):
{json.dumps(temas_recentes_enviados, ensure_ascii=False, indent=2)}

LOTE DE NOTÍCIAS E TENDÊNCIAS BRUTAS COLETADAS:
{json.dumps(lote_filtrado, ensure_ascii=False, indent=2)}

Analise os dados acima, faça os cruzamentos interdisciplinares e gere o payload estruturado.
"""

    chave_gemini = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if chave_gemini.startswith("sua_chave"):
        chave_gemini = ""

    response = None
    ultimo_erro = None

    if chave_gemini:
        try:
            client = genai.Client(api_key=chave_gemini, http_options=types.HttpOptions(timeout=45_000))
            modelos_para_tentar = [MODELO_PADRAO] + [m for m in MODELOS_FALLBACK if m != MODELO_PADRAO]

            for mod in modelos_para_tentar:
                for tentativa in range(1, 3):
                    try:
                        print(f"[curadoria] Enviando para {mod} (tentativa {tentativa})...")
                        response = client.models.generate_content(
                            model=mod,
                            contents=prompt_usuario,
                            config=types.GenerateContentConfig(
                                system_instruction=SYSTEM_PROMPT,
                                response_mime_type="application/json",
                                response_schema=CuradoriaPayload,
                                temperature=0.2,
                            ),
                        )
                        if response:
                            break
                    except APIError as e:
                        ultimo_erro = e
                        print(f"[Aviso] Erro na API com {mod} (tentativa {tentativa}): {e}. Aguardando retry...")
                        time.sleep(3 * tentativa)
                    except Exception as e:
                        ultimo_erro = e
                        print(f"[Aviso] Falha inesperada com {mod}: {e}")
                        break
                if response:
                    break
        except Exception as e:
            ultimo_erro = e
            print(f"[Aviso] Cliente Gemini indisponível: {e}")
    else:
        print("[Aviso] GEMINI_API_KEY ausente; acionando contingência Zelador Grok / fallback determinístico.")

    if response:
        payload = response.parsed
        if payload is None:
            payload = CuradoriaPayload.model_validate_json(response.text)
        payload.batch_id = batch_atual
        payload.insights.sort(key=lambda i: i.relevancia_score, reverse=True)
        return payload

    # Contingência 1: Zelador Grok / Groq (XAI_API_KEY)
    try:
        from scripts.vigia_grok import gerar_json_zelador_ia

        schema_exemplo = json.dumps(CuradoriaPayload.model_json_schema(), ensure_ascii=False)
        raw_zelador = gerar_json_zelador_ia(
            prompt_sistema=(
                f"{SYSTEM_PROMPT}\n\n"
                f"Siga estritamente o JSON Schema de CuradoriaPayload:\n{schema_exemplo}"
            ),
            prompt_usuario=prompt_usuario,
            timeout=40,
        )
        if raw_zelador:
            payload = CuradoriaPayload.model_validate_json(raw_zelador)
            payload.batch_id = batch_atual
            payload.insights.sort(key=lambda i: i.relevancia_score, reverse=True)
            print("[curadoria] Payload gerado com sucesso via Zelador Grok (contingência).")
            return payload
    except Exception as exc_zel:
        print(f"[Aviso] Contingência Zelador Grok falhou ou indisponível: {exc_zel}")

    # Contingência 2: Fallback determinístico para não quebrar o workflow agendado
    print(f"[Aviso] Utilizando fallback determinístico de curadoria (último erro IA: {ultimo_erro}).")
    return _construir_fallback_deterministico(batch_atual, lote_filtrado)


def enviar_para_backend(payload: CuradoriaPayload, webhook_url: str, api_token: str) -> None:
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_token}"}
    resp = requests.post(webhook_url, json=payload.model_dump(), headers=headers, timeout=15)
    resp.raise_for_status()
    print(f"[curadoria] Backend atualizou {len(payload.insights)} insights. Status: {resp.status_code}")

