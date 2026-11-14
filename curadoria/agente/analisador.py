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
from .schemas import CuradoriaPayload

MODELO_PADRAO = os.getenv("CURADORIA_MODEL", "gemini-3.5-flash")
MODELOS_FALLBACK = ["gemini-3.5-flash", "gemini-3.5-flash-lite"]


def executar_agente_analisador(noticias_brutas: List[dict], temas_recentes_enviados: List[str]) -> CuradoriaPayload:
    # lê GEMINI_API_KEY do ambiente; timeout (ms) evita travar o pipeline indefinidamente
    client = genai.Client(http_options=types.HttpOptions(timeout=90_000))
    batch_atual = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")

    # Limita o lote para manter a janela ágil e evitar estouro de tokens/timeout
    lote_filtrado = noticias_brutas[:35]

    prompt_usuario = f"""
BATCH_ID ATUAL: {batch_atual}

TEMAS_RECENTES_ENVIADOS (Evite repetir, a menos que haja atualização relevante):
{json.dumps(temas_recentes_enviados, ensure_ascii=False, indent=2)}

LOTE DE NOTÍCIAS E TENDÊNCIAS BRUTAS COLETADAS:
{json.dumps(lote_filtrado, ensure_ascii=False, indent=2)}

Analise os dados acima, faça os cruzamentos interdisciplinares e gere o payload estruturado.
"""

    modelos_para_tentar = [MODELO_PADRAO] + [m for m in MODELOS_FALLBACK if m != MODELO_PADRAO]
    response = None
    ultimo_erro = None

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

    if not response:
        raise RuntimeError(f"Não foi possível gerar curadoria após tentar modelos: {ultimo_erro}")

    payload = response.parsed
    if payload is None:
        payload = CuradoriaPayload.model_validate_json(response.text)

    payload.batch_id = batch_atual
    payload.insights.sort(key=lambda i: i.relevancia_score, reverse=True)
    return payload


def enviar_para_backend(payload: CuradoriaPayload, webhook_url: str, api_token: str) -> None:
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_token}"}
    resp = requests.post(webhook_url, json=payload.model_dump(), headers=headers, timeout=15)
    resp.raise_for_status()
    print(f"[curadoria] Backend atualizou {len(payload.insights)} insights. Status: {resp.status_code}")

