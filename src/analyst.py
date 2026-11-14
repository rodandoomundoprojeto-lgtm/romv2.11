"""
Módulo de Análise: Utiliza a API oficial do Google Gemini (google-genai)
para gerar resumos estruturados e realizar deduplicação semântica.
"""
import json
import os
from typing import Dict, Any, List, Optional
from google import genai
from google.genai import types

FEED_OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "feed_output.json")


def get_recent_titles(limit: int = 10) -> List[str]:
    """Retorna os títulos mais recentes já publicados para deduplicação semântica."""
    if not os.path.exists(FEED_OUTPUT_PATH):
        return []
    try:
        with open(FEED_OUTPUT_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return [item.get("titulo", "") for item in data[:limit] if item.get("titulo")]
    except Exception:
        return []


def analyze_item(item: Dict[str, Any], api_key: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Submete o item coletado para o Gemini com JSON Schema estrito e verificação de duplicidade.
    """
    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key:
        print("[!] GEMINI_API_KEY não configurada no ambiente ou .env.")
        return None

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

    client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=35_000))
    modelos = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.1-flash-lite"]

    last_err = None
    for modelo in modelos:
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

            raw_json = response.text.strip()
            parsed = json.loads(raw_json)

            # Se for duplicado semanticamente, avisamos o chamador
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
                "data_publicacao": item.get("data_publicacao")
            }

        except Exception as e:
            last_err = e
            msg = str(e).upper()
            if any(k in msg for k in ("404", "NOT_FOUND", "503", "UNAVAILABLE", "504", "TIMEOUT", "429", "RESOURCE_EXHAUSTED")):
                print(f"[!] Modelo {modelo} indisponível para '{item.get('fonte_nome')}', tentando fallback...")
                continue
            print(f"[!] Erro ao analisar item com Gemini ({item.get('fonte_nome')}): {e}")
            return None

    print(f"[!] Todos os modelos falharam para '{item.get('fonte_nome')}': {last_err}")
    return None
