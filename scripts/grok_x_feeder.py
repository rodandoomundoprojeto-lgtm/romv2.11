#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Motor de Alimentação Rodando o Mundo via Grok API (xAI Responses API + X/Web Search)
Busca notícias quentes e verificadas no X (antigo Twitter) e na web, valida citações
reais e rotas internas do sitemap.xml, e grava atomicamente em data/noticias_x.json.
"""

import argparse
import datetime
import json
import os
import re
import sys
import tempfile
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

# Tenta carregar python-dotenv se instalado, ou faz parser nativo do .env
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


RESPONSES_API_URL = "https://api.x.ai/v1/responses"
API_TIMEOUT_SECONDS = 180
MIN_VALID_ITEMS = 3


def load_env_fallback():
    """Carrega variáveis de arquivos .env locais sem depender de bibliotecas externas."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    possible_paths = [
        os.path.join(base_dir, ".env"),
        os.path.join(os.getcwd(), ".env"),
        os.path.join(os.path.dirname(base_dir), ".env"),
    ]
    for env_path in possible_paths:
        if os.path.isfile(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k and k not in os.environ:
                            os.environ[k] = v
            except Exception:
                pass


load_env_fallback()


def _is_placeholder_key(val):
    low = val.lower()
    if not low:
        return True
    placeholders = ("sua_chave", "your_key", "your_api_key", "xai-...", "coloque_aqui", "placeholder")
    return any(low.startswith(p) or low == p for p in placeholders)


def get_api_key():
    """Obtém a chave da xAI/Grok a partir do ambiente (priorizando XAI_API_KEY e GROK_API_KEY)."""
    for var_name in ("XAI_API_KEY", "GROK_API_KEY", "X_AI_API_KEY", "XAI_KEY", "GROK_KEY"):
        val = os.environ.get(var_name, "").strip()
        if val and not _is_placeholder_key(val):
            return val
    return None


SYSTEM_PROMPT = """Você é o editor-chefe internacional do portal jornalístico "Rodando o Mundo" (https://www.rodandoomundo.com.br).
Sua missão é realizar uma varredura em tempo real no X (antigo Twitter) e nas fontes jornalísticas globais para selecionar as notícias mais importantes, verificadas e relevantes das últimas 24 horas no Brasil e no mundo.

DIRETRIZES EDITORIAIS OBRIGATÓRIAS:
1. Priorize fatos de impacto real (geopolítica, decisões econômicas, tecnologia, ciência, eleições e políticas públicas) divulgados por grandes agências e veículos no X (@Reuters, @AP, @folha, @g1, @estadao, @ValorEconomico, @BBCWorld, @Bloomberg, @el_pais, @AJEnglish, @lemondefr).
2. Descarte boatos, memes, opinião partidária sem fato novo ou fofocas.
3. Redija todos os títulos (`titulo`) e resumos de contexto (`resumo`) em PORTUGUÊS DO BRASIL claro, neutro, jornalístico e imparcial.
4. Forneça entre 6 e 10 notícias diversificadas cobrindo Brasil, América do Norte, Europa, Ásia/Oriente Médio e demais regiões.
5. USE APENAS URLs reais encontradas nas buscas (x_search / web_search). Nunca invente links.
6. Para cada notícia, preencha rigorosamente:
   - "relevancia": número inteiro de 1 a 10 (1 = manchete mais importante do dia)
   - "categoria": rótulo curto (ex: "Brasil · Política & Fiscal", "Geopolítica & EUA", "Economia Global", "Europa & Diplomacia", "Tecnologia & IA", "Oriente Médio")
   - "titulo": manchete jornalística informativa (60 a 120 caracteres)
   - "resumo": contextualização completa em 1 ou 2 frases explicando o fato e seus impactos (140 a 260 caracteres)
   - "analise": 1 frase concisa explicando o impacto editorial, geopolítico ou econômico ("Por que importa", 100 a 220 caracteres) para o card do Radar
   - "fonte": nome do veículo ou perfil oficial no X (ex: "Reuters / @Reuters", "Folha de S.Paulo", "Associated Press", "g1 Economia")
   - "handleX": arroba da fonte no X (ex: "@Reuters", "@folha", "@AP")
   - "dominio": domínio principal do veículo (ex: "reuters.com", "folha.uol.com.br", "apnews.com", "g1.globo.com")
   - "termoBusca": 3 a 5 palavras-chave para comparar cobertura em outros jornais
   - "url": link direto verificado para a matéria original ou para o post oficial no X (https://...)
   - "pais": nome do país em português (ex: "Brasil", "Estados Unidos", "França", "China", "Argentina")
   - "codigoPais": código ISO de 2 letras em MAIÚSCULAS (ex: "BR", "US", "FR", "CN", "AR", "UA", "GB", "DE", "JP")
   - "continente": exatamente um dentre ["sul", "norte", "europa", "asia", "africa", "oceania"]
   - "tipoNoticia": exatamente um dentre ["politica", "economia", "tecnologia", "saude", "cultura", "esportes", "mundo"]
   - "topicosEmAlta": lista com 3 palavras-chave curtas em alta naquele país relacionadas à notícia

Retorne EXCLUSIVAMENTE um objeto JSON válido com a estrutura:
{
  "items": [ ... lista de notícias ... ]
}
Não adicione blocos markdown fora do JSON."""


def build_user_prompt(config):
    hoje_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    blocos = []
    for c in config.get("continentes", []):
        contas = ", ".join(c.get("contas_referencia", []))
        termos = "; ".join(c.get("termos", []))
        blocos.append(f"- {c['nome']} (continente='{c['id']}'): monitorar {contas} | temas: {termos}")
    guias = "\n".join(blocos)
    return (
        f"Data/Hora de referência: {hoje_str}.\n"
        f"Pesquise no X (Twitter) e na web os fatos mais quentes e verificados das últimas 24h segundo este roteiro:\n"
        f"{guias}\n\n"
        f"Selecione as {config.get('max_noticias_resumo', 8)} principais notícias globais e nacionais do momento "
        f"com URLs verificadas da busca e retorne o JSON estrito."
    )


def extract_json_from_text(text):
    """Extrai e faz parse de JSON mesmo se vier envolvido em blocos markdown."""
    text = (text or "").strip()
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
        if match:
            return json.loads(match.group(1))
        raise


def is_http_url(url):
    if not isinstance(url, str):
        return False
    u = url.strip()
    return u.startswith("https://") or u.startswith("http://")


def normalize_url(url):
    """Normaliza URL para comparação: host lowercase sem www, sem barra final e sem parâmetros utm_*."""
    if not is_http_url(url):
        return ""
    parsed = urllib.parse.urlparse(url.strip())
    host = (parsed.netloc or "").lower().strip()
    if host.startswith("www."):
        host = host[4:]
    if not host:
        return ""
    path = parsed.path or ""
    while path.endswith("/") and len(path) > 1:
        path = path[:-1]
    if path == "/":
        path = ""
    query_pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    filtered_pairs = [(k, v) for k, v in query_pairs if not k.lower().startswith("utm_")]
    query_str = urllib.parse.urlencode(filtered_pairs)
    return f"{host}{path}" + (f"?{query_str}" if query_str else "")


def extract_domain(url):
    """Extrai o domínio principal em lowercase sem www."""
    if not isinstance(url, str):
        return ""
    raw = url.strip()
    if not raw:
        return ""
    if "://" not in raw:
        raw = "https://" + raw
    try:
        host = (urllib.parse.urlparse(raw).netloc or "").lower().strip()
        if ":" in host:
            host = host.split(":", 1)[0]
        if host.startswith("www."):
            host = host[4:]
        return host
    except Exception:
        return ""


def parse_responses_api_output(response_data):
    """
    Função pura para extrair o texto final e as citações da xAI Responses API (/v1/responses).
    Retorna (text: str, citations: list[str]).
    """
    if not isinstance(response_data, dict):
        return "", []

    text_parts = []
    citations = []
    seen_citations = set()

    def _add_citation(candidate):
        if isinstance(candidate, str) and is_http_url(candidate):
            cleaned = candidate.strip()
            if cleaned not in seen_citations:
                seen_citations.add(cleaned)
                citations.append(cleaned)
        elif isinstance(candidate, dict):
            url_val = candidate.get("url")
            if isinstance(url_val, str) and is_http_url(url_val):
                cleaned = url_val.strip()
                if cleaned not in seen_citations:
                    seen_citations.add(cleaned)
                    citations.append(cleaned)

    # 1. Citações de topo (top-level "citations")
    top_citations = response_data.get("citations")
    if isinstance(top_citations, list):
        for c in top_citations:
            _add_citation(c)

    # 2. Itens em output[] (type == "message" -> content[] com type == "output_text")
    output_items = response_data.get("output")
    if isinstance(output_items, list):
        for out_item in output_items:
            if not isinstance(out_item, dict):
                continue
            if out_item.get("type") != "message":
                continue
            content_list = out_item.get("content")
            if not isinstance(content_list, list):
                continue
            for part in content_list:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "output_text":
                    part_text = part.get("text")
                    if isinstance(part_text, str) and part_text.strip():
                        text_parts.append(part_text)
                    annotations = part.get("annotations")
                    if isinstance(annotations, list):
                        for ann in annotations:
                            if isinstance(ann, dict) and ann.get("type") == "url_citation":
                                _add_citation(ann.get("url"))

    final_text = "\n".join(text_parts).strip()

    # 3. Fallback para campo top-level "output_text"
    if not final_text:
        top_text = response_data.get("output_text")
        if isinstance(top_text, str) and top_text.strip():
            final_text = top_text.strip()

    return final_text, citations


def load_allowed_routes_from_sitemap(sitemap_path):
    """Lê o sitemap.xml na raiz do projeto e retorna o conjunto de caminhos internos válidos (Regra 11)."""
    allowed = set()
    if not sitemap_path or not os.path.isfile(sitemap_path):
        return allowed
    try:
        tree = ET.parse(sitemap_path)
        root = tree.getroot()
        for elem in root.iter():
            tag = elem.tag
            if tag == "loc" or tag.endswith("}loc"):
                loc_text = (elem.text or "").strip()
                if not loc_text:
                    continue
                path = urllib.parse.urlparse(loc_text).path or "/"
                if len(path) > 1 and path.endswith("/"):
                    path = path[:-1]
                allowed.add(path)
    except Exception:
        return set()
    return allowed


def build_models_list(config):
    """Monta a lista ordenada e sem duplicatas de modelos a tentar (respeitando XAI_FEEDER_MODEL)."""
    models = []
    env_override = os.environ.get("XAI_FEEDER_MODEL", "").strip()
    if env_override:
        models.append(env_override)
    cfg_model = str(config.get("model") or "grok-4.7").strip()
    if cfg_model and cfg_model not in models:
        models.append(cfg_model)
    for m in config.get("fallback_models", ["grok-4", "grok-3"]):
        m_clean = str(m or "").strip()
        if m_clean and m_clean not in models:
            models.append(m_clean)
    return models


def call_grok_api(api_key, config):
    """
    Chama POST https://api.x.ai/v1/responses sempre com tools x_search e web_search.
    NUNCA faz fallback sem ferramentas de busca.
    """
    models_to_try = build_models_list(config)
    user_prompt = build_user_prompt(config)
    last_error = None

    for model_name in models_to_try:
        payload = {
            "model": model_name,
            "input": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "tools": [
                {"type": "x_search"},
                {"type": "web_search"},
            ],
            "temperature": config.get("temperature", 0.2),
        }

        req = urllib.request.Request(
            RESPONSES_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "RodandoOMundo-GrokFeeder/2.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=API_TIMEOUT_SECONDS) as resp:
                body = resp.read().decode("utf-8")
                data = json.loads(body)
                content, citations = parse_responses_api_output(data)
                if not content:
                    last_error = f"Resposta vazia ({model_name})"
                    continue
                parsed = extract_json_from_text(content)
                return parsed, model_name, citations
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8")
            except Exception:
                pass
            last_error = f"HTTP {e.code} ({model_name}): {err_body[:300]}"
            if e.code in (401, 403):
                raise RuntimeError(
                    f"Erro de autenticação na API xAI ({e.code}). Verifique sua chave no .env: {err_body}"
                )
            continue
        except Exception as e:
            last_error = f"{type(e).__name__} ({model_name}): {e}"
            continue

    raise RuntimeError(f"Não foi possível obter resposta da API xAI. Último erro: {last_error}")


def _strip_accents(text):
    raw = unicodedata.normalize("NFD", str(text or ""))
    return "".join(ch for ch in raw if unicodedata.category(ch) != "Mn")


def map_radar_category(tipo_noticia, codigo_pais, categoria_label):
    """Mapeia tipoNoticia/pais/categoria para uma das 4 categorias oficiais do Radar."""
    tipo = str(tipo_noticia or "").strip().lower()
    pais = str(codigo_pais or "").strip().upper()
    cat_norm = _strip_accents(categoria_label).lower()

    if tipo == "economia":
        return "economia"
    if tipo in ("cultura", "esportes", "saude"):
        return "cultura"

    geopol_keywords = (
        "geopol",
        "diplomacia",
        "guerra",
        "eua",
        "europa",
        "asia",
        "oriente",
        "global",
        "onu",
        "otan",
    )
    if (
        tipo == "mundo"
        or (pais != "BR" and tipo in ("politica", "tecnologia"))
        or any(kw in cat_norm for kw in geopol_keywords)
    ):
        return "geopolitica"

    return "politica"


def _resolve_cited_url(item_url, item_dominio, norm_to_citation, domain_to_citations):
    """
    Garante integridade de citações:
    1. Se a URL normalizada do item corresponder a uma citação real, retorna a citação.
    2. Senão, tenta substituir por uma citação cujo domínio coincida com `dominio` do item.
    3. Caso contrário, retorna None (item deve ser descartado).
    """
    if is_http_url(item_url):
        norm = normalize_url(item_url)
        if norm and norm in norm_to_citation:
            return norm_to_citation[norm]

    dom_clean = extract_domain(item_dominio) if item_dominio else ""
    if dom_clean and dom_clean in domain_to_citations:
        return domain_to_citations[dom_clean][0]

    return None


def enrich_and_validate_items(
    raw_data,
    config,
    citations=None,
    allowed_routes=None,
    require_citations=True,
):
    """
    Normaliza, valida citações reais, valida rotas internas contra sitemap.xml (Regra 11)
    e retorna (items, topicos_por_pais).
    """
    if isinstance(raw_data, list):
        items = raw_data
    elif isinstance(raw_data, dict):
        items = raw_data.get("items") or raw_data.get("noticias") or []
    else:
        items = []

    citations = citations or []
    allowed_routes = set(allowed_routes) if allowed_routes is not None else set()

    norm_to_citation = {}
    domain_to_citations = {}
    for c in citations:
        if not is_http_url(c):
            continue
        c_clean = c.strip()
        n = normalize_url(c_clean)
        if n and n not in norm_to_citation:
            norm_to_citation[n] = c_clean
        d = extract_domain(c_clean)
        if d:
            domain_to_citations.setdefault(d, []).append(c_clean)

    if require_citations and not norm_to_citation:
        return [], {}

    mapeamento = config.get("mapeamento_tematico", {})
    continentes_validos = {"sul", "norte", "europa", "asia", "africa", "oceania"}
    categorias_validas = set(
        config.get(
            "categorias_permitidas",
            ["politica", "economia", "tecnologia", "saude", "cultura", "esportes", "mundo"],
        )
    )

    normalized = []
    topicos_por_pais = {}

    for idx, item in enumerate(items, start=1):
        if not isinstance(item, dict) or not item.get("titulo"):
            continue

        raw_url = str(item.get("url") or "").strip()
        raw_dominio = str(item.get("dominio") or "").strip()

        if require_citations:
            verified_url = _resolve_cited_url(raw_url, raw_dominio, norm_to_citation, domain_to_citations)
            if not verified_url:
                continue
            url = verified_url
        else:
            if not is_http_url(raw_url):
                continue
            url = raw_url

        dominio = extract_domain(raw_dominio) or extract_domain(url) or "x.com"

        cod_pais = str(item.get("codigoPais") or "BR").strip().upper()[:2]
        if len(cod_pais) < 2:
            cod_pais = "BR"

        continente = str(item.get("continente") or "sul").strip().lower()
        if continente not in continentes_validos:
            continente = "sul"

        tipo = str(item.get("tipoNoticia") or "politica").strip().lower()
        if tipo not in categorias_validas:
            tipo = "politica"

        # Lookup temático específico (PAIS:tipo) com fallback para wildcard (*:tipo)
        vinculo = mapeamento.get(f"{cod_pais}:{tipo}") or mapeamento.get(f"*:{tipo}") or {}

        # Regra 11: validar paginaTematica contra sitemap.xml
        raw_pagina = item.get("paginaTematica") or vinculo.get("paginaTematica")
        pagina_tematica = None
        label_tematica = None
        if isinstance(raw_pagina, str) and raw_pagina.strip():
            cand_pagina = raw_pagina.strip()
            if len(cand_pagina) > 1 and cand_pagina.endswith("/"):
                cand_pagina = cand_pagina[:-1]
            if cand_pagina in allowed_routes:
                pagina_tematica = cand_pagina
                raw_label = item.get("labelTematica") or vinculo.get("labelTematica")
                label_tematica = str(raw_label).strip() if raw_label else None

        # Regra 11: validar explicacaoId contra /entenda/<slug> no sitemap.xml
        raw_explicacao = item.get("explicacaoId") or vinculo.get("explicacaoId")
        explicacao_id = None
        if isinstance(raw_explicacao, str) and raw_explicacao.strip():
            slug = raw_explicacao.strip()
            if slug.startswith("/entenda/"):
                slug = slug[len("/entenda/"):]
            slug = slug.strip("/")
            if slug and f"/entenda/{slug}" in allowed_routes:
                explicacao_id = slug

        topicos = item.get("topicosEmAlta")
        if isinstance(topicos, list) and topicos:
            topicos_por_pais.setdefault(cod_pais, [])
            for t in topicos:
                if isinstance(t, str) and t.strip() and t.strip() not in topicos_por_pais[cod_pais]:
                    topicos_por_pais[cod_pais].append(t.strip())

        resumo_str = str(item.get("resumo") or "").strip()
        analise_str = str(item.get("analise") or "").strip()
        categoria_str = str(item.get("categoria") or "Panorama Global").strip()
        try:
            relevancia = int(item.get("relevancia") or idx)
        except (TypeError, ValueError):
            relevancia = idx

        entry = {
            "relevancia": relevancia,
            "categoria": categoria_str,
            "titulo": str(item.get("titulo")).strip(),
            "resumo": resumo_str,
            "resumoCurto": resumo_str,
            "analise": analise_str,
            "fonte": str(item.get("fonte") or "Grok / X Search").strip(),
            "handleX": str(item.get("handleX") or "").strip(),
            "dominio": dominio,
            "termoBusca": str(item.get("termoBusca") or item.get("titulo")).strip(),
            "url": url,
            "urlMateriaOriginal": url,
            "paginaTematica": pagina_tematica,
            "labelTematica": label_tematica,
            "explicacaoId": explicacao_id,
            "pais": str(item.get("pais") or "Brasil").strip(),
            "codigoPais": cod_pais,
            "continente": continente,
            "tipoNoticia": tipo,
            "categoriaRadar": map_radar_category(tipo, cod_pais, categoria_str),
            "origemGrokX": True,
            "publicadoEm": item.get("publicadoEm")
            or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        normalized.append(entry)

    normalized.sort(key=lambda x: x["relevancia"])
    for i, it in enumerate(normalized, start=1):
        it["relevancia"] = i

    return normalized, topicos_por_pais


def write_json_atomic(payload, out_path):
    """Grava JSON de forma atômica (arquivo temporário no mesmo diretório + os.replace)."""
    out_dir = os.path.dirname(os.path.abspath(out_path))
    os.makedirs(out_dir, exist_ok=True)
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=out_dir,
            prefix=".tmp_noticias_x_",
            suffix=".json",
            delete=False,
        ) as tmp_file:
            tmp_path = tmp_file.name
            json.dump(payload, tmp_file, ensure_ascii=False, indent=2)
            tmp_file.write("\n")
            tmp_file.flush()
            os.fsync(tmp_file.fileno())
        os.replace(tmp_path, out_path)
    except Exception:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        raise


def get_seed_items():
    """Retorna um conjunto inicial realista de notícias estruturadas para modo --mock."""
    agora = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return [
        {
            "relevancia": 1,
            "categoria": "Brasil · Política & Fiscal",
            "titulo": "Congresso e Equipe Econômica avançam na votação do pacote fiscal e regras de emendas",
            "resumo": "Lideranças da Câmara e do Senado discutem ajustes no arcabouço fiscal e cronograma de liberação de emendas parlamentares sob monitoramento do mercado financeiro.",
            "analise": "A aprovação das medidas fiscais define a credibilidade das contas públicas e influencia diretamente a curva de juros futuros e o câmbio no Brasil.",
            "fonte": "Folha de S.Paulo · @folha",
            "handleX": "@folha",
            "dominio": "folha.uol.com.br",
            "termoBusca": "pacote fiscal orçamento congresso emendas",
            "url": "https://www.folha.uol.com.br/poder/",
            "pais": "Brasil",
            "codigoPais": "BR",
            "continente": "sul",
            "tipoNoticia": "politica",
            "topicosEmAlta": ["Arcabouço Fiscal", "Congresso", "Orçamento"],
            "publicadoEm": agora,
        },
        {
            "relevancia": 2,
            "categoria": "Geopolítica & EUA",
            "titulo": "Casa Branca detalha novas diretrizes de comércio exterior e tarifas sobre cadeias estratégicas",
            "resumo": "Medidas anunciadas em Washington impactam negociações bilaterais com União Europeia, China e parceiros latino-americanos nos setores industrial e tecnológico.",
            "analise": "Mudanças tarifárias americanas redesenham fluxos de exportação globais e pressionam cadeias de suprimentos industriais na Europa, Ásia e América Latina.",
            "fonte": "Associated Press · @AP",
            "handleX": "@AP",
            "dominio": "apnews.com",
            "termoBusca": "White House trade tariffs economy",
            "url": "https://apnews.com/hub/economy",
            "pais": "Estados Unidos",
            "codigoPais": "US",
            "continente": "norte",
            "tipoNoticia": "politica",
            "topicosEmAlta": ["Tarifas", "Casa Branca", "Comércio Global"],
            "publicadoEm": agora,
        },
        {
            "relevancia": 3,
            "categoria": "Economia & Juros",
            "titulo": "Banco Central avalia cenário de inflação e volatilidade cambial para próximos passos da Selic",
            "resumo": "Boletim Focus e dados de atividade econômica guiam expectativas de analistas sobre o ciclo de juros no Brasil diante do fortalecimento global do dólar.",
            "analise": "A sinalização do Copom baliza o custo do crédito, os investimentos produtivos e a atratividade de capitais estrangeiros no mercado doméstico.",
            "fonte": "Valor Econômico · @ValorEconomico",
            "handleX": "@ValorEconomico",
            "dominio": "valor.globo.com",
            "termoBusca": "Banco Central Selic inflação dólar",
            "url": "https://valor.globo.com/financas/",
            "pais": "Brasil",
            "codigoPais": "BR",
            "continente": "sul",
            "tipoNoticia": "economia",
            "topicosEmAlta": ["Taxa Selic", "Dólar", "Inflação"],
            "publicadoEm": agora,
        },
        {
            "relevancia": 4,
            "categoria": "Europa & Diplomacia",
            "titulo": "União Europeia articula novo plano conjunto de segurança energética e defesa continental",
            "resumo": "Ministros reunidos em Bruxelas definem metas de investimento em infraestrutura crítica, transição energética e cooperação militar entre os blocos europeus.",
            "analise": "A integração de defesa e energia reduz vulnerabilidades estratégicas da Europa diante de tensões no Leste Europeu e da volatilidade de gás e eletricidade.",
            "fonte": "Reuters · @Reuters",
            "handleX": "@Reuters",
            "dominio": "reuters.com",
            "termoBusca": "European Union defense energy diplomacy",
            "url": "https://www.reuters.com/world/europe/",
            "pais": "França",
            "codigoPais": "FR",
            "continente": "europa",
            "tipoNoticia": "politica",
            "topicosEmAlta": ["União Europeia", "Defesa", "Energia"],
            "publicadoEm": agora,
        },
        {
            "relevancia": 5,
            "categoria": "Tecnologia & IA",
            "titulo": "Disputa global por semicondutores e modelos de IA em tempo real acelera investimentos",
            "resumo": "Empresas dos Estados Unidos e da Ásia ampliam data centers e integração de agentes autônomos conectados a redes sociais e fluxos financeiros em tempo real.",
            "analise": "O controle de chips avançados e infraestrutura de IA tornou-se ativo central de soberania tecnológica e competitividade econômica entre potências.",
            "fonte": "Bloomberg Tech · @technology",
            "handleX": "@technology",
            "dominio": "bloomberg.com",
            "termoBusca": "AI semiconductors data centers tech",
            "url": "https://www.bloomberg.com/technology",
            "pais": "Estados Unidos",
            "codigoPais": "US",
            "continente": "norte",
            "tipoNoticia": "tecnologia",
            "topicosEmAlta": ["Inteligência Artificial", "Semicondutores", "Big Techs"],
            "publicadoEm": agora,
        },
        {
            "relevancia": 6,
            "categoria": "Ásia & Comércio",
            "titulo": "China anuncia estímulos à indústria de alta tecnologia e expansão de rotas comerciais",
            "resumo": "Pequim reforça incentivos ao consumo doméstico e parcerias de exportação de veículos elétricos e equipamentos industriais com mercados emergentes.",
            "analise": "O ritmo de crescimento chinês e sua ofensiva exportadora impactam diretamente preços de commodities e o comércio exterior de parceiros como o Brasil.",
            "fonte": "South China Morning Post · @SCMPNews",
            "handleX": "@SCMPNews",
            "dominio": "scmp.com",
            "termoBusca": "China economy EV trade stimulus",
            "url": "https://www.scmp.com/economy",
            "pais": "China",
            "codigoPais": "CN",
            "continente": "asia",
            "tipoNoticia": "economia",
            "topicosEmAlta": ["Comércio Exterior", "Carros Elétricos", "PIB China"],
            "publicadoEm": agora,
        },
    ]


def persist_edition(items, topicos_por_pais, used_model, out_path, is_mock=False):
    """Valida mínimo de itens e grava o arquivo JSON atomicamente. Retorna True se gravou, False se abortou."""
    if len(items) < MIN_VALID_ITEMS:
        print(
            f"[ERRO] Apenas {len(items)} item(ns) válido(s) (mínimo exigido: {MIN_VALID_ITEMS}). "
            f"Arquivo de saída preservado sem sobrescrita: {out_path}",
            file=sys.stderr,
        )
        return False

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    payload_saida = {
        "atualizadoEm": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dataEdicao": now_utc.strftime("%Y-%m-%d"),
        "fonteMotor": f"Grok ({used_model}) · X Search",
        "mock": bool(is_mock),
        "total": len(items),
        "topicosEmAltaPorPais": topicos_por_pais,
        "items": items,
    }

    write_json_atomic(payload_saida, out_path)
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Alimentador de notícias do Rodando o Mundo via Grok / X Search"
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Gera arquivo com dados de simulação (mock=true) sem consumir a API; exige --out",
    )
    parser.add_argument(
        "--force-mock-default",
        action="store_true",
        help="Permite usar --mock gravando no caminho padrão data/noticias_x.json",
    )
    parser.add_argument("--config", default=None, help="Caminho para config_grok.json")
    parser.add_argument("--out", default=None, help="Caminho de saída para data/noticias_x.json")
    parser.add_argument("--sitemap", default=None, help="Caminho para sitemap.xml (padrão: raiz do repo)")
    args = parser.parse_args(argv)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(script_dir)
    config_path = args.config or os.path.join(script_dir, "config_grok.json")
    default_out = os.path.join(root_dir, "data", "noticias_x.json")
    out_path = args.out or default_out
    sitemap_path = args.sitemap or os.path.join(root_dir, "sitemap.xml")

    if args.mock and not args.out and not args.force_mock_default:
        print(
            "[ERRO] O modo --mock exige --out <caminho> para evitar sobrescrever data/noticias_x.json de produção "
            "(ou passe --force-mock-default conscientemente).",
            file=sys.stderr,
        )
        sys.exit(1)

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    allowed_routes = load_allowed_routes_from_sitemap(sitemap_path)
    citations = []

    if args.mock:
        print("[INFO] Executando em modo --mock (simulação)...")
        raw_data = {"items": get_seed_items()}
        used_model = "grok-mock"
        require_citations = False
    else:
        api_key = get_api_key()
        if not api_key:
            print(
                "[ERRO] Nenhuma chave XAI_API_KEY ou GROK_API_KEY válida encontrada no ambiente ou no arquivo .env!",
                file=sys.stderr,
            )
            print(
                "       Verifique se o seu arquivo .env na raiz do projeto contém: XAI_API_KEY=sua_chave_aqui",
                file=sys.stderr,
            )
            sys.exit(1)

        print("[INFO] Conectando à Responses API da xAI (Grok) com x_search + web_search...")
        raw_data, used_model, citations = call_grok_api(api_key, config)
        if not citations:
            print(
                "[ERRO] A API não retornou nenhuma citação verificável (zero citations). Abortando sem sobrescrever.",
                file=sys.stderr,
            )
            sys.exit(2)
        require_citations = True

    items, topicos_por_pais = enrich_and_validate_items(
        raw_data,
        config,
        citations=citations,
        allowed_routes=allowed_routes,
        require_citations=require_citations,
    )

    if not persist_edition(items, topicos_por_pais, used_model, out_path, is_mock=args.mock):
        sys.exit(2)

    print(f"[SUCESSO] {len(items)} notícias verificadas salvas em: {out_path}")
    for it in items[:5]:
        print(f"  #{it['relevancia']} [{it['codigoPais']}] {it['titulo']} ({it['fonte']})")


if __name__ == "__main__":
    main()
