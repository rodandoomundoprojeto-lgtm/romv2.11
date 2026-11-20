"""
Módulo de Análise: Utiliza a API oficial do Google Gemini (google-genai)
para gerar resumos estruturados e realizar deduplicação semântica.
"""
import json
import os
import time
import unicodedata
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from google import genai
from google.genai import types

FEED_OUTPUT_PATH_PADRAO = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "feed_output.json")
FEED_OUTPUT_PATH = FEED_OUTPUT_PATH_PADRAO

CATEGORIAS_VALIDAS = ("geopolitica", "politica", "economia", "cultura", "geral")
_SINONIMOS_CATEGORIA = {
    "sociedade": "cultura",
    "comportamento": "cultura",
    "curiosidades": "cultura",
    "curiosidade": "cultura",
    "entretenimento": "cultura",
    "viagem": "cultura",
    "viagens": "cultura",
    "ciencia": "cultura",
    "relacoes internacionais": "geopolitica",
    "defesa": "geopolitica",
    "financas": "economia",
    "mercados": "economia",
    "negocios": "economia",
}

TERMOS_HEURISTICA_CATEGORIA: Dict[str, List[str]] = {
    "geopolitica": [
        "guerra", "exercito", "exercitos", "militar", "militares", "missil", "misseis",
        "otan", "russia", "ucrania", "china", "taiwan", "ira", "israel", "gaza", "palestina",
        "estados unidos", "pentagono", "geopolitica", "fronteira", "fronteiras", "sancao",
        "sancoes", "diplomacia", "soberania", "conflito", "armas", "nuclear", "marinha",
        "aeronautica", "seguranca global", "aliados", "tropas", "invasao", "cessar-fogo",
    ],
    "economia": [
        "inflacao", "banco", "bancos", "juros", "selic", "dolar", "cambio", "bolsa",
        "ibovespa", "acoes", "investimento", "investimentos", "pib", "dividendo", "dividendos",
        "mercado financeiro", "recessao", "fed", "banco central", "renda fixa", "credito",
        "fmi", "deficit", "superavit", "tesouro",
    ],
    "politica": [
        "governo", "presidente", "lula", "bolsonaro", "trump", "stf", "supremo", "congresso",
        "senado", "camara", "deputado", "deputados", "senador", "planalto", "eleicao",
        "eleicoes", "partido", "ministro", "ministerio", "votacao", "projeto de lei", "pec",
        "constituicao", "parlamento", "oposicao",
    ],
    "cultura": [
        "a pe", "anos a pe", "caminhada", "viagem", "viagens", "turismo", "livro", "livros",
        "cultura", "arte", "cinema", "filme", "filmes", "musica", "historia humana", "curiosidade",
        "curiosidades", "misterio", "misterios", "sobrevivencia", "facanha", "expedicao",
        "expedicoes", "mae", "recorde", "guinness", "sociedade", "tradicao", "ancestral",
        "patrimonio", "descoberta", "arqueologia", "aventura",
    ],
}


def _classificar_categoria_heuristica(texto_completo: str, fallback: str = "geral") -> str:
    """Classifica a categoria por termos-chave quando a fonte é dinâmica ou a IA não devolveu categoria."""
    texto_norm = unicodedata.normalize("NFKD", str(texto_completo or "")).encode("ascii", "ignore").decode("ascii").lower()

    pontuacoes = {cat: 0 for cat in TERMOS_HEURISTICA_CATEGORIA}
    for cat, termos in TERMOS_HEURISTICA_CATEGORIA.items():
        for t in termos:
            peso = 2 if " " in t else 1
            if t in texto_norm:
                pontuacoes[cat] += peso

    melhor_cat, max_pts = max(pontuacoes.items(), key=lambda kv: kv[1])
    if max_pts > 0:
        return melhor_cat
    return fallback if fallback in CATEGORIAS_VALIDAS else "geral"


def _normalizar_categoria(raw: Any, fallback: Optional[Any] = "geral") -> Optional[str]:
    """Normaliza o rótulo de categoria retornado pela IA ou herdado da fonte."""
    def _limpar(val: Any) -> str:
        texto = str(val or "").strip().lower()
        texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
        return " ".join(texto.split())

    cand = _limpar(raw)
    if cand in _SINONIMOS_CATEGORIA:
        cand = _SINONIMOS_CATEGORIA[cand]
    if cand in CATEGORIAS_VALIDAS:
        return cand

    if fallback is None:
        return None

    fb = _limpar(fallback)
    if fb in _SINONIMOS_CATEGORIA:
        fb = _SINONIMOS_CATEGORIA[fb]
    return fb if fb in CATEGORIAS_VALIDAS else "geral"


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

    cat_fonte = str(item.get("categoria") or "").strip().lower()
    eh_dinamica = cat_fonte in ("dinamica", "misto", "")

    titulo = parsed.get("titulo", "")[:120].strip()
    resumo = parsed.get("resumo", "").strip()
    analise = parsed.get("analise", "").strip()
    texto_contexto = f"{titulo} {resumo} {analise} {item.get('texto_conteudo', '')}"

    # 1. Tenta categoria retornada pela IA
    categoria_final = _normalizar_categoria(parsed.get("categoria"), fallback=None)

    # 2. Se IA não devolveu categoria válida ou se devolveu geral em fonte dinâmica, aplica heurística textual
    if not categoria_final or (categoria_final == "geral" and eh_dinamica):
        fb_base = "geral" if eh_dinamica else cat_fonte
        categoria_final = _classificar_categoria_heuristica(texto_contexto, fallback=fb_base)

    if not categoria_final:
        categoria_final = _normalizar_categoria(cat_fonte, fallback="geral")

    return {
        "duplicado": False,
        "item_id": item.get("item_id"),
        "titulo": titulo,
        "resumo": resumo,
        "analise": analise,
        "categoria": categoria_final,
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

    cat_fonte = str(item.get("categoria") or "geral").strip().lower()
    eh_fonte_dinamica = cat_fonte in ("dinamica", "misto")

    if eh_fonte_dinamica:
        contexto_categoria = (
            f"Fonte Multitemática: '{item.get('fonte_nome')}' publica conteúdos variados "
            f"(tanto geopolítica/defesa quanto curiosidades, cultura, sociedade e viagens). "
            f"Classifique a categoria ESTRITAMENTE pelo tema central deste conteúdo específico."
        )
    else:
        contexto_categoria = (
            f"Categoria editorial de referência da fonte: {cat_fonte} "
            f"(mantenha esta categoria salvo se o tema do conteúdo for comprovadamente de outra área)."
        )

    prompt = f"""Você é um editor sênior de inteligência editorial e briefing internacional.
Analise o conteúdo abaixo e extraia um briefing objetivo seguindo as regras.

TÍTULOS COBERTOS RECENTEMENTE NO RADAR:
{titles_context}

NOVO CONTEÚDO PARA ANALISAR:
Fonte: {item.get('fonte_nome')}
Contexto Editorial: {contexto_categoria}
{item.get('texto_conteudo')}

INSTRUÇÕES E REGRAS MANDATÓRIAS:
1. DEDUPLICAÇÃO SEMÂNTICA: Verifique se o conteúdo trata EXATAMENTE do mesmo fato ou acontecimento central já coberto em algum dos "TÍTULOS COBERTOS RECENTEMENTE".
   - Se for o mesmo fato substancial (apenas dito por outra fonte), retorne:
     {{"duplicado": true, "categoria": "geral", "titulo": "", "resumo": "", "analise": ""}}
2. SE NÃO FOR DUPLICADO, preencha:
   - "duplicado": false
   - "categoria": Classifique o assunto REAL do conteúdo em EXATAMENTE uma destas opções:
     * "geopolitica": conflitos armados, guerras, disputas territoriais, forças militares, relações internacionais, diplomacia, OTAN, alianças estratégicas e soberania global.
     * "politica": política doméstica, governos, eleições, parlamentos, judiciário, legislação.
     * "economia": mercados financeiros, bancos, inflação, política fiscal, comércio, negócios, macroeconomia.
     * "cultura": histórias humanas, feitos individuais, curiosidades, viagens, expedições, sociedade, arte, patrimônio ou entretenimento.
     * "geral": apenas se não se encaixar em nenhuma das anteriores.
   - "titulo": Manchete direta, informativa e atraente (máximo de 80 caracteres).
   - "resumo": Síntese factual objetiva do que aconteceu ou foi dito (2 a 3 frases).
   - "analise": Análise curta de contexto e impacto ("Por que isso importa") coerente com a categoria real classificada acima, de 2 a 3 frases, tom analítico, isento e sóbrio (sem forçar viés geopolítico em histórias humanas, curiosidades ou temas culturais).
"""

    last_err = None
    if key:
        client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=35_000))
        modelo_env = (os.getenv("GEMINI_MODEL_RADAR") or os.getenv("GEMINI_MODEL") or "").strip()
        modelos = ([modelo_env] if modelo_env else []) + ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
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
