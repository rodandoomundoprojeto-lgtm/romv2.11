"""
Módulo de Análise: Utiliza a API oficial do Google Gemini (google-genai)
para gerar resumos estruturados e realizar deduplicação semântica.
"""
import json
import os
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from google import genai
from google.genai import types

FEED_OUTPUT_PATH_PADRAO = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "feed_output.json")
FEED_OUTPUT_PATH = FEED_OUTPUT_PATH_PADRAO


def _timestamp_item(item: Dict[str, Any]) -> float:
    raw = str(item.get("data_publicacao") or item.get("published_at") or item.get("created_at") or "").strip()
    if not raw:
        return 0.0
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return 0.0


def get_recent_titles(limit: int = 10) -> List[str]:
    """Retorna os títulos mais recentes já publicados para deduplicação semântica."""
    dados: Any = None
    if os.path.abspath(FEED_OUTPUT_PATH) == os.path.abspath(FEED_OUTPUT_PATH_PADRAO):
        try:
            from src.estado_db import ler_estado

            estado = ler_estado("feed_output")
            if isinstance(estado, list) and estado:
                dados = estado
        except Exception:
            dados = None

    if dados is None and os.path.exists(FEED_OUTPUT_PATH):
        try:
            with open(FEED_OUTPUT_PATH, "r", encoding="utf-8") as f:
                dados = json.load(f)
        except Exception:
            dados = None

    if not isinstance(dados, list):
        return []

    itens_validos = [it for it in dados if isinstance(it, dict) and it.get("titulo")]
    itens_validos.sort(key=_timestamp_item, reverse=True)
    return [str(item.get("titulo", "")) for item in itens_validos[:limit] if item.get("titulo")]


def _parse_resposta_analise(raw_json: str, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    parsed = json.loads(raw_json)
    if parsed.get("duplicado") is True:
        return {"duplicado": True, "item_id": item.get("item_id")}
    return {
        "duplicado": False,
        "item_id": item.get("item_id"),
        "titulo": parsed.get("titulo", "")[:120].strip(),
        "resumo": parsed.get("resumo", "").strip(),
        "analise": parsed.get("analise", "").strip(),
        "categoria": item.get("categoria"),
        "fonte_nome": item.get("fonte_nome"),
        "fonte_url": item.get("fonte_url"),
        "data_publicacao": item.get("data_publicacao"),
    }


def analyze_item(item: Dict[str, Any], api_key: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Submete o item coletado para o Gemini com JSON Schema estrito e verificação de duplicidade.
    Se o Gemini estiver indisponível, aciona o Zelador Grok (XAI_API_KEY) como contingência.
    """
    key = (api_key or os.getenv("GEMINI_API_KEY") or "").strip()
    if key.startswith("sua_chave"):
        key = ""

    recent_titles = get_recent_titles(10)
    titles_context = "\n".join([f"- {t}" for t in recent_titles]) if recent_titles else "(Nenhum item recente no feed)"

    prompt = f"""Você é um editor sênior de inteligência editorial e briefing internacional.
Analise o conteúdo abaixo e extraia um briefing objetivo seguindo as regras.

TÍTULOS COBERTOS RECENTEMENTE NO RADAR:
{titles_context}

NOVO CONTEÚDO PARA ANALISAR:
Fonte: {item.get('fonte_nome')}
Categoria: {item.get('categoria')}
{item.get('texto_conteudo')}

INSTRUÇÕES E REGRAS MANDATÓRIAS:
1. DEDUPLICAÇÃO SEMÂNTICA: Verifique se o conteúdo trata EXATAMENTE do mesmo fato ou acontecimento central já coberto em algum dos "TÍTULOS COBERTOS RECENTEMENTE".
   - Se for o mesmo fato substancial (apenas dito por outra fonte), retorne:
     {{"duplicado": true, "titulo": "", "resumo": "", "analise": ""}}
2. SE NÃO FOR DUPLICADO, preencha:
   - "duplicado": false
   - "titulo": Manchete direta, informativa e atraente (máximo de 80 caracteres).
   - "resumo": Síntese factual objetiva do que aconteceu ou foi dito (2 a 3 frases).
   - "analise": Análise curta de contexto e impacto ("Por que isso importa" na categoria {item.get('categoria')}, de 2 a 3 frases, tom analítico, isento e sóbrio).
"""

    last_err = None
    if key:
        client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=35_000))
        modelo_env = (os.getenv("GEMINI_MODEL_RADAR") or os.getenv("GEMINI_MODEL") or "").strip()
        if modelo_env.startswith("gemini-3"):
            modelo_env = ""
        modelos = ([modelo_env] if modelo_env else []) + ["gemini-2.5-flash", "gemini-2.5-pro"]
        vistos_m = set()
        modelos = [m for m in modelos if not (m in vistos_m or vistos_m.add(m))]

        for idx_m, modelo in enumerate(modelos):
            for tentativa in range(1, 3):
                try:
                    # Chamada com resposta JSON estruturada
                    response = client.models.generate_content(
                        model=modelo,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            temperature=0.2,
                        ),
                    )

                    return _parse_resposta_analise(response.text.strip(), item)

                except Exception as e:
                    last_err = e
                    msg = str(e).upper()
                    eh_rate_limit = any(k in msg for k in ("429", "RESOURCE_EXHAUSTED", "503", "UNAVAILABLE", "504", "TIMEOUT"))
                    eh_not_found = any(k in msg for k in ("404", "NOT_FOUND"))
                    if eh_rate_limit:
                        espera = min(3 * tentativa + idx_m * 2, 12)
                        print(f"[!] Rate limit/instabilidade em {modelo} para '{item.get('fonte_nome')}' (tentativa {tentativa}). Aguardando {espera}s...")
                        time.sleep(espera)
                        continue
                    if eh_not_found:
                        print(f"[!] Modelo {modelo} indisponível para '{item.get('fonte_nome')}', tentando fallback...")
                        break
                    print(f"[!] Erro ao analisar item com Gemini ({item.get('fonte_nome')}): {e}")
                    break
    else:
        print("[!] GEMINI_API_KEY não configurada no ambiente ou .env; acionando Zelador Grok se disponível.")

    # Contingência via Zelador Grok / Groq (XAI_API_KEY)
    try:
        from scripts.vigia_grok import gerar_json_zelador_ia

        raw_zelador = gerar_json_zelador_ia(
            prompt_sistema="Você é o editor de contingência do portal Rodando o Mundo. Retorne apenas JSON válido.",
            prompt_usuario=prompt,
        )
        if raw_zelador:
            return _parse_resposta_analise(raw_zelador, item)
    except Exception as exc_zel:
        print(f"[!] Contingência Zelador Grok indisponível para '{item.get('fonte_nome')}': {exc_zel}")

    if last_err:
        print(f"[!] Todos os modelos falharam para '{item.get('fonte_nome')}': {last_err}")
    return None
