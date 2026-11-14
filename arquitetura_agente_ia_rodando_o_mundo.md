# Plano Técnico: Agente de Inteligência Editorial & Curadoria Autônoma
**Portal:** [www.rodandoomundo.com.br](https://www.rodandoomundo.com.br)  
**Objetivo:** Criar um agente de IA multidisciplinar que monitora política, geopolítica, economia, viagens e cultura em tempo real, cruza informações e alimenta o backend com dados estruturados (JSON) para dinamizar a vitrine, turbinar a busca interna e identificar lacunas de conteúdo (*Content Gaps*).

---

## 1. Arquitetura Geral do Pipeline

O sistema funciona em um ciclo autônomo (executado via Cron Job ou GitHub Actions a cada 3 ou 4 horas) dividido em quatro pilares:

1. **Motor de Coleta (Ingestion):** Leitura paralela de feeds RSS de editorias estratégicas (turismo, geopolítica, economia, cultura) e do feed oficial do Google Trends Brasil, com limpeza de HTML e filtro de janela temporal.
2. **Memória e Deduplicação (Estado):** Consulta ao banco PostgreSQL para recuperar os `slugs` enviados nas últimas 48 horas, evitando repetições e identificando se um tema está evoluindo.
3. **Cérebro Analisador (Gemini 2.5 Pro + Structured Outputs):** O LLM processa o lote bruto aplicando cruzamento interdisciplinar (ex: *queda de moeda + série em alta = oportunidade de viagem*) e gera um JSON validado via Pydantic, incluindo sugestões de pautas inéditas.
4. **Backend & Banco de Dados (FastAPI + PostgreSQL):** Recebe o payload via Webhook, calcula o tempo de expiração (`expires_at`), atualiza os pesos da vitrine e do motor de busca (`tsvector` + arrays) e alerta sobre temas quentes sem cobertura no site.

---

## 2. System Prompt (Calibrado para o *Rodando o Mundo*)

Este prompt instrui o modelo a traduzir acontecimentos globais em sinais acionáveis para o viajante e explorador cultural:

```markdown
# IDENTIDADE E CONTEXTO DO PORTAL
Você é o Motor de Inteligência Editorial e Descoberta do portal **Rodando o Mundo** (www.rodandoomundo.com.br). Nosso foco é conectar o público brasileiro com destinos, culturas, história, geopolítica prática, câmbio/economia do viajante e curiosidades globais.

Seu papel é atuar como um analista erudito ("nerd" em geografia, geopolítica, economia global, história e turismo) que lê as notícias do dia e traduz o cenário mundial em sinais acionáveis para o nosso backend movimentar a Home e a Busca do site.

# LENTE DE CRUZAMENTO (A REGRA DE OURO DO RODANDO O MUNDO)
Para toda notícia de Política, Economia ou Geopolítica, você DEVE aplicar o filtro "Impacto no Explorador/Viajante":
1. **Câmbio & Custo de Vida:** Se uma moeda desvalorizou ou a inflação mudou em um país (ex: Peso Argentino, Iene, Euro), gere insights ligando Economia + Viagens (ex: destinos onde o Real rende mais agora).
2. **Fronteiras, Vistos & Rotas:** Mudanças em exigência de vistos (ex: ETIAS na Europa, isenção de visto na Ásia), novas rotas aéreas diretas ou alertas geopolíticos viram prioridade máxima (`relevancia_score` > 85).
3. **Cultura como Gatilho de Destino:** Se um filme, série, livro, festival ou evento esportivo global coloca um país/cidade em evidência, conecte Cultura + Viagens + História daquele local.
4. **Filtro de Ruído Local:** Descarte notícias policiais locais, política partidária doméstica sem impacto cambial/internacional ou fofocas de celebridades sem conexão com destinos ou cultura global.
5. **Deduplicação Temporal:** Você receberá uma lista de `TEMAS_RECENTES_ENVIADOS`. Se um assunto já foi enviado, só o inclua novamente se houver um fato novo relevante que altere o cenário (marque `status: "atualizacao"`).

# REGRAS DE PONTUAÇÃO E SAÍDA
- `relevancia_score` acima de 85 indica prioridade máxima (topo da Home e boost agressivo na busca).
- Ordene a lista `insights` de forma decrescente pelo `relevancia_score`.
- Preencha sempre `sugestao_pauta_gap` com uma ideia de artigo SEO pronta para o caso de o site ainda não cobrir o assunto.
```

---

## 3. Código do Agente Analisador (`agente_analisador.py`)

Utiliza a SDK oficial **`google-genai`** e **Pydantic** para garantir que a saída respeite rigorosamente o contrato de dados esperado pelo backend.

**Instalação:**
```bash
pip install google-genai pydantic requests
export GEMINI_API_KEY="sua_chave_api_aqui"
```

**Código:**
```python
import os
import json
from datetime import datetime, timezone
from typing import List, Literal
import requests
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# =====================================================================
# 1. CONTRATO DE DADOS (PYDANTIC MODELS)
# =====================================================================

CategoriaType = Literal[
    "Destinos_Viagens",
    "Cultura_Historia",
    "Geopolitica_Mundo",
    "Economia_Cambio",
    "Guias_Dicas"
]
StatusType = Literal["novo", "em_alta", "atualizacao"]


class PautaSugerida(BaseModel):
    titulo_seo: str = Field(
        description="Título otimizado para cliques e Google (ex: 'Como a queda do Iene deixa sua viagem ao Japão 25% mais barata')"
    )
    angulo_editorial: str = Field(
        description="Resumo em 2 frases da abordagem nerd/prática que o artigo do Rodando o Mundo deve ter"
    )
    formato_ideal: Literal["Guia Pratico", "Analise Geopolitica", "Roteiro Cultural", "Lista/Curiosidades"] = Field(
        description="Melhor formato de conteúdo para capturar o interesse do leitor"
    )


class InsightItem(BaseModel):
    slug: str = Field(
        description="Identificador amigável para URL/Cache (ex: queda-iene-turismo-japao)"
    )
    titulo_tema: str = Field(
        description="Nome claro, direto e conciso do tópico"
    )
    status: StatusType = Field(
        description="'novo' para assunto inédito, 'em_alta' para pico de busca, 'atualizacao' se já estava no histórico mas teve fato novo."
    )
    categoria_primaria: CategoriaType = Field(
        description="A editoria principal do portal relacionada ao fato"
    )
    categorias_cruzadas: List[CategoriaType] = Field(
        default_factory=list,
        description="Outras editorias do site afetadas indiretamente por este evento"
    )
    relevancia_score: int = Field(
        ge=0, le=100,
        description="Nota de 0 a 100 definindo o peso na vitrine do site"
    )
    ttl_horas: int = Field(
        ge=1, le=720,
        description="Tempo de validade sugerido em horas para manter o tema em destaque"
    )
    palavras_chave_busca: List[str] = Field(
        min_length=4, max_length=8,
        description="Termos exatos, sinônimos e variações coloquiais para impulsionar o motor de busca interno"
    )
    gatilho_vitrine: str = Field(
        description="Diretriz imperativa curta para o algoritmo selecionar artigos existentes relacionados"
    )
    sintese_nerd: str = Field(
        description="Explicação densa em 2 frases conectando causa macro e consequência prática para o viajante"
    )
    sugestao_pauta_gap: PautaSugerida = Field(
        description="Sugestão de artigo inédito caso o portal ainda não tenha cobertura suficiente sobre o tema"
    )


class CuradoriaPayload(BaseModel):
    batch_id: str = Field(
        description="Identificador único da execução no formato YYYYMMDD-HHMM"
    )
    insights: List[InsightItem] = Field(
        description="Lista ranqueada do maior para o menor score dos melhores insights extraídos"
    )


# =====================================================================
# 2. SYSTEM PROMPT
# =====================================================================

SYSTEM_PROMPT = """
# IDENTIDADE E CONTEXTO DO PORTAL
Você é o Motor de Inteligência Editorial e Descoberta do portal **Rodando o Mundo** (www.rodandoomundo.com.br). Nosso foco é conectar o público brasileiro com destinos, culturas, história, geopolítica prática, câmbio/economia do viajante e curiosidades globais.

Seu papel é atuar como um analista erudito ("nerd" em geografia, geopolítica, economia global, história e turismo) que lê as notícias do dia e traduz o cenário mundial em sinais acionáveis para o nosso backend movimentar a Home e a Busca do site.

# LENTE DE CRUZAMENTO (A REGRA DE OURO DO RODANDO O MUNDO)
Para toda notícia de Política, Economia ou Geopolítica, você DEVE aplicar o filtro "Impacto no Explorador/Viajante":
1. **Câmbio & Custo de Vida:** Se uma moeda desvalorizou ou a inflação mudou em um país, gere insights ligando Economia + Viagens.
2. **Fronteiras, Vistos & Rotas:** Mudanças em exigência de vistos, novas rotas aéreas diretas ou alertas geopolíticos viram prioridade máxima (`relevancia_score` > 85).
3. **Cultura como Gatilho de Destino:** Se um filme, série, livro ou evento coloca um país/cidade em evidência, conecte Cultura + Viagens + História daquele local.
4. **Filtro de Ruído Local:** Descarte notícias policiais locais ou política partidária doméstica sem impacto cambial/internacional.
5. **Deduplicação Temporal:** Você receberá `TEMAS_RECENTES_ENVIADOS`. Só repita um tema se houver fato novo relevante (`status: "atualizacao"`).

# REGRAS DE SAÍDA
- Ordene `insights` de forma decrescente pelo `relevancia_score`.
- Preencha sempre `sugestao_pauta_gap` para orientar a criação de novos artigos caso o site tenha lacuna no tema.
"""


# =====================================================================
# 3. FUNÇÃO PRINCIPAL DO AGENTE
# =====================================================================

def executar_agente_analisador(
    noticias_brutas: List[dict],
    temas_recentes_enviados: List[str]
) -> CuradoriaPayload:
    client = genai.Client()
    batch_atual = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")

    prompt_usuario = f"""
    BATCH_ID ATUAL: {batch_atual}

    TEMAS_RECENTES_ENVIADOS (Evite repetir, a menos que haja atualização relevante):
    {json.dumps(temas_recentes_enviados, ensure_ascii=False, indent=2)}

    LOTE DE NOTÍCIAS E TENDÊNCIAS BRUTAS COLETADAS:
    {json.dumps(noticias_brutas, ensure_ascii=False, indent=2)}

    Analise os dados acima, faça os cruzamentos interdisciplinares e gere o payload estruturado.
    """

    response = client.models.generate_content(
        model="gemini-2.5-pro",
        contents=prompt_usuario,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=CuradoriaPayload,
            temperature=0.2,
        ),
    )

    return response.parsed


def enviar_para_backend(payload: CuradoriaPayload, webhook_url: str, api_token: str):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_token}"
    }
    resp = requests.post(webhook_url, json=payload.model_dump(), headers=headers, timeout=15)
    resp.raise_for_status()
    print(f"Sucesso! Backend atualizou {len(payload.insights)} insights. Status: {resp.status_code}")
```

---

## 4. Script Coletor Automático (`coletor_pipeline.py`)

Captura notícias recentes de feeds RSS relevantes para o *Rodando o Mundo* e o feed oficial do Google Trends Brasil, limpa tags HTML e dispara o agente analisador.

**Instalação:**
```bash
pip install feedparser beautifulsoup4 requests
```

**Código:**
```python
import os
import re
import time
from datetime import datetime, timezone, timedelta
from typing import List, Dict
import feedparser
import requests
from bs4 import BeautifulSoup

from agente_analisador import executar_agente_analisador, enviar_para_backend

# =====================================================================
# 1. FONTES CURADAS PARA O RODANDO O MUNDO
# =====================================================================

FEEDS_RSS_RODANDO_O_MUNDO = {
    "Viagens_Rotas_Promocoes": [
        "https://www.melhoresdestinos.com.br/feed",
        "https://viagemeturismo.abril.com.br/feed/",
        "https://www.panrotas.com.br/rss/noticias.xml",
    ],
    "Geopolitica_Mundo": [
        "https://feeds.bbci.co.uk/portuguese/topics/c340q430z4vt/rss.xml",
        "https://www.aljazeera.com/xml/rss/all.xml",
    ],
    "Economia_Cambio": [
        "https://g1.globo.com/rss/g1/economia/",
        "https://www.infomoney.com.br/mercados/feed/",
    ],
    "Cultura_Historia_Global": [
        "https://www.omelete.com.br/rss/geral.xml",
        "https://super.abril.com.br/feed/",
    ]
}

GOOGLE_TRENDS_RSS = "https://trends.google.com/trending/rss?geo=BR"


# =====================================================================
# 2. LIMPEZA E PARSING
# =====================================================================

def limpar_html(texto_sujo: str) -> str:
    if not texto_sujo:
        return ""
    soup = BeautifulSoup(texto_sujo, "html.parser")
    texto_limpo = soup.get_text(separator=" ")
    texto_limpo = re.sub(r"\s+", " ", texto_limpo).strip()
    return texto_limpo[:450]


def dentro_da_janela_tempo(entry, horas_limite: int = 12) -> bool:
    if not hasattr(entry, "published_parsed") or not entry.published_parsed:
        return True
    data_pub = datetime.fromtimestamp(time.mktime(entry.published_parsed), tz=timezone.utc)
    limite = datetime.now(timezone.utc) - timedelta(hours=horas_limite)
    return data_pub >= limite


# =====================================================================
# 3. MOTORES DE COLETA
# =====================================================================

def coletar_feeds_rss(horas_limite: int = 12) -> List[Dict]:
    itens_coletados = []
    titulos_vistos = set()
    headers = {"User-Agent": "Mozilla/5.0 (RodandoOMundoBot/1.0)"}

    for nicho, urls in FEEDS_RSS_RODANDO_O_MUNDO.items():
        for url in urls:
            try:
                resp = requests.get(url, headers=headers, timeout=10)
                feed = feedparser.parse(resp.content)

                for entry in feed.entries[:10]:
                    titulo = limpar_html(entry.get("title", ""))
                    if not titulo or titulo.lower() in titulos_vistos:
                        continue
                    if not dentro_da_janela_tempo(entry, horas_limite):
                        continue

                    titulos_vistos.add(titulo.lower())
                    resumo = limpar_html(entry.get("summary", entry.get("description", "")))

                    itens_coletados.append({
                        "origem": f"RSS - {nicho}",
                        "fonte": feed.feed.get("title", url),
                        "titulo": titulo,
                        "resumo": resumo,
                        "link": entry.get("link", "")
                    })
            except Exception as e:
                print(f"[Aviso] Falha ao ler feed {url}: {e}")

    return itens_coletados


def coletar_google_trends() -> List[Dict]:
    tendencias = []
    try:
        feed = feedparser.parse(GOOGLE_TRENDS_RSS)
        for entry in feed.entries[:15]:
            termo = limpar_html(entry.get("title", ""))
            trafego = entry.get("ht_approx_traffic", "Alta")
            noticia_associada = limpar_html(entry.get("ht_news_item_title", ""))

            tendencias.append({
                "origem": "Google Trends (Buscas em Alta)",
                "fonte": "Google Trends BR",
                "titulo": f"Termo em alta: {termo} (Volume: {trafego})",
                "resumo": f"Contexto associado nas buscas: {noticia_associada}" if noticia_associada else "Pico repentino de pesquisas no Brasil.",
                "link": entry.get("link", "")
            })
    except Exception as e:
        print(f"[Aviso] Falha ao coletar Google Trends: {e}")

    return tendencias


# =====================================================================
# 4. ORQUESTRADOR DO PIPELINE
# =====================================================================

def rodar_pipeline_completo():
    backend_url = os.getenv("BACKEND_URL", "https://api.rodandoomundo.com.br")
    api_token = os.getenv("BACKEND_SECRET_TOKEN", "")

    noticias = coletar_feeds_rss(horas_limite=12)
    trends = coletar_google_trends()
    lote_total = trends + noticias

    if not lote_total:
        print("Nenhum dado novo encontrado nesta janela.")
        return

    # Busca histórico recente no backend para evitar duplicatas
    historico_recente = []
    if api_token:
        try:
            resp = requests.get(
                f"{backend_url}/v1/curadoria/historico?horas=48",
                headers={"Authorization": f"Bearer {api_token}"},
                timeout=10
            )
            if resp.status_code == 200:
                historico_recente = resp.json().get("slugs_recentes", [])
        except Exception as e:
            print(f"[Aviso] Não foi possível consultar histórico: {e}")

    payload_pronto = executar_agente_analisador(
        noticias_brutas=lote_total,
        temas_recentes_enviados=historico_recente
    )

    print(payload_pronto.model_dump_json(indent=2))

    if api_token:
        enviar_para_backend(
            payload=payload_pronto,
            webhook_url=f"{backend_url}/v1/curadoria",
            api_token=api_token
        )


if __name__ == "__main__":
    rodar_pipeline_completo()
```

**Automação via Crontab (Linux/VPS - roda a cada 3 horas):**
```bash
0 */3 * * * cd /caminho/do/projeto && /caminho/do/venv/bin/python coletor_pipeline.py >> pipeline.log 2>&1
```

---

## 5. Modelagem do Banco de Dados (PostgreSQL)

Inclui a tabela de insights gerados pela IA (com suporte a JSONB para sugestões de pauta) e a estrutura recomendada para a tabela de artigos/conteúdos do site com **Full-Text Search** nativo.

```sql
-- 1. Tabela de Insights da IA
CREATE TABLE ai_curadoria_insights (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(180) UNIQUE NOT NULL,
    batch_id VARCHAR(50) NOT NULL,
    titulo_tema VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('novo', 'em_alta', 'atualizacao')),
    categoria_primaria VARCHAR(50) NOT NULL,
    categorias_cruzadas TEXT[] DEFAULT '{}',
    relevancia_score INTEGER NOT NULL CHECK (relevancia_score >= 0 AND relevancia_score <= 100),
    ttl_horas INTEGER NOT NULL,
    palavras_chave_busca TEXT[] NOT NULL,
    gatilho_vitrine TEXT NOT NULL,
    sintese_nerd TEXT NOT NULL,
    sugestao_pauta_gap JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_insights_ativos_score ON ai_curadoria_insights (expires_at, relevancia_score DESC);
CREATE INDEX idx_insights_palavras_chave ON ai_curadoria_insights USING GIN (palavras_chave_busca);
CREATE INDEX idx_insights_categorias ON ai_curadoria_insights (categoria_primaria);

-- 2. Tabela de Conteúdos do Site (Exemplo com busca vetorial textual automática)
CREATE TABLE conteudos (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    resumo TEXT NOT NULL,
    corpo TEXT NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    tags TEXT[] DEFAULT '{}',
    publicado_em TIMESTAMPTZ DEFAULT NOW(),
    busca_vetor TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('portuguese', coalesce(titulo, '')), 'A') ||
        setweight(to_tsvector('portuguese', coalesce(resumo, '')), 'B') ||
        setweight(to_tsvector('portuguese', coalesce(corpo, '')), 'C')
    ) STORED
);

CREATE INDEX idx_conteudos_busca_vetor ON conteudos USING GIN (busca_vetor);
CREATE INDEX idx_conteudos_tags ON conteudos USING GIN (tags);
```

---

## 6. Queries SQL Inteligentes (Busca Turbinada & Content Gaps)

### A. Busca Híbrida do Site (Relevância Textual + Boost de Tendência da IA)
Esta query combina o que o usuário digitou (`:termo_usuario`) com as palavras-chave em alta capturadas pelo bot, somando pontos extras aos artigos conectados ao momento atual.

```sql
WITH insights_relevantes AS (
    SELECT 
        relevancia_score,
        palavras_chave_busca,
        categoria_primaria
    FROM ai_curadoria_insights
    WHERE expires_at > NOW()
      AND (
          lower(:termo_usuario) = ANY(palavras_chave_busca)
          OR titulo_tema ILIKE '%' || :termo_usuario || '%'
          OR sintese_nerd ILIKE '%' || :termo_usuario || '%'
      )
    ORDER BY relevancia_score DESC
    LIMIT 3
),
termos_expandidos AS (
    SELECT 
        COALESCE(MAX(relevancia_score), 0) AS max_score_ia,
        ARRAY(
            SELECT DISTINCT unnest(palavras_chave_busca) 
            FROM insights_relevantes
        ) AS lista_keywords_ia
    FROM insights_relevantes
)
SELECT 
    c.id,
    c.titulo,
    c.resumo,
    c.categoria,
    c.tags,
    ts_rank(c.busca_vetor, websearch_to_tsquery('portuguese', :termo_usuario)) AS score_texto,
    CASE 
        WHEN c.tags && te.lista_keywords_ia THEN (te.max_score_ia / 100.0) * 0.5
        ELSE 0
    END AS bonus_tendencia_ia,
    (
        ts_rank(c.busca_vetor, websearch_to_tsquery('portuguese', :termo_usuario)) +
        CASE WHEN c.tags && te.lista_keywords_ia THEN (te.max_score_ia / 100.0) * 0.5 ELSE 0 END
    ) AS score_final
FROM conteudos c
CROSS JOIN termos_expandidos te
WHERE 
    c.busca_vetor @@ websearch_to_tsquery('portuguese', :termo_usuario)
    OR (cardinality(te.lista_keywords_ia) > 0 AND c.tags && te.lista_keywords_ia)
ORDER BY 
    score_final DESC,
    c.publicado_em DESC
LIMIT 20;
```

### B. Radar de Content Gaps (Lacunas de Conteúdo)
Cruza os temas quentes da IA com o estoque de artigos do site para identificar oportunidades imediatas de pauta (`GAP_CRITICO` quando há 0 artigos e score >= 80).

```sql
WITH cobertura_atual AS (
    SELECT 
        i.id AS insight_id,
        i.slug,
        i.titulo_tema,
        i.categoria_primaria,
        i.relevancia_score,
        i.palavras_chave_busca,
        i.sugestao_pauta_gap,
        i.expires_at,
        COUNT(DISTINCT c.id) AS total_artigos_no_site,
        COALESCE(
            ARRAY_AGG(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL), 
            '{}'
        ) AS ids_artigos_existentes
    FROM ai_curadoria_insights i
    LEFT JOIN conteudos c 
        ON (
            c.tags && i.palavras_chave_busca
            OR c.busca_vetor @@ plainto_tsquery('portuguese', i.titulo_tema)
        )
    WHERE i.expires_at > NOW()
    GROUP BY i.id
)
SELECT 
    slug,
    titulo_tema,
    categoria_primaria,
    relevancia_score,
    total_artigos_no_site,
    CASE 
        WHEN total_artigos_no_site = 0 AND relevancia_score >= 80 THEN 'GAP_CRITICO'
        WHEN total_artigos_no_site <= 1 AND relevancia_score >= 65 THEN 'GAP_OPORTUNIDADE'
        ELSE 'COBERTO'
    END AS status_cobertura,
    CASE 
        WHEN total_artigos_no_site <= 1 THEN sugestao_pauta_gap
        ELSE NULL
    END AS pauta_para_escrever,
    ids_artigos_existentes,
    expires_at
FROM cobertura_atual
ORDER BY 
    (relevancia_score::float / (total_artigos_no_site + 1)) DESC;
```

---

## 7. API Backend em FastAPI (`backend_api.py`)

**Instalação:**
```bash
pip install fastapi uvicorn psycopg[binary]
```

**Código:**
```python
import os
import json
from datetime import datetime, timezone, timedelta
from typing import List, Literal, Optional
from fastapi import FastAPI, Header, HTTPException, Depends, Query
from pydantic import BaseModel, Field
import psycopg
from psycopg.rows import dict_row

app = FastAPI(title="API de Inteligência - Rodando o Mundo")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://usuario:senha@localhost:5432/rodandoomundo")
API_SECRET_TOKEN = os.getenv("BACKEND_SECRET_TOKEN", "troque-por-um-token-forte")


# =====================================================================
# 1. SCHEMAS PYDANTIC
# =====================================================================

CategoriaType = Literal[
    "Destinos_Viagens",
    "Cultura_Historia",
    "Geopolitica_Mundo",
    "Economia_Cambio",
    "Guias_Dicas"
]
StatusType = Literal["novo", "em_alta", "atualizacao"]


class PautaSugerida(BaseModel):
    titulo_seo: str
    angulo_editorial: str
    formato_ideal: Literal["Guia Pratico", "Analise Geopolitica", "Roteiro Cultural", "Lista/Curiosidades"]


class InsightItem(BaseModel):
    slug: str
    titulo_tema: str
    status: StatusType
    categoria_primaria: CategoriaType
    categorias_cruzadas: List[CategoriaType] = []
    relevancia_score: int = Field(ge=0, le=100)
    ttl_horas: int = Field(ge=1, le=720)
    palavras_chave_busca: List[str]
    gatilho_vitrine: str
    sintese_nerd: str
    sugestao_pauta_gap: PautaSugerida


class CuradoriaPayload(BaseModel):
    batch_id: str
    insights: List[InsightItem]


# =====================================================================
# 2. SEGURANÇA E CONEXÃO
# =====================================================================

def verificar_token(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Formato de token inválido")
    token = authorization.replace("Bearer ", "").strip()
    if token != API_SECRET_TOKEN:
        raise HTTPException(status_code=403, detail="Token não autorizado")


def get_db():
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        yield conn


# =====================================================================
# 3. ENDPOINTS
# =====================================================================

@app.post("/v1/curadoria", dependencies=[Depends(verificar_token)])
def receber_curadoria(payload: CuradoriaPayload, conn=Depends(get_db)):
    agora = datetime.now(timezone.utc)
    processados = 0

    query_upsert = """
        INSERT INTO ai_curadoria_insights (
            slug, batch_id, titulo_tema, status, categoria_primaria,
            categorias_cruzadas, relevancia_score, ttl_horas,
            palavras_chave_busca, gatilho_vitrine, sintese_nerd,
            sugestao_pauta_gap, updated_at, expires_at
        )
        VALUES (
            %(slug)s, %(batch_id)s, %(titulo_tema)s, %(status)s, %(categoria_primaria)s,
            %(categorias_cruzadas)s, %(relevancia_score)s, %(ttl_horas)s,
            %(palavras_chave_busca)s, %(gatilho_vitrine)s, %(sintese_nerd)s,
            %(sugestao_pauta_gap)s::jsonb, %(updated_at)s, %(expires_at)s
        )
        ON CONFLICT (slug) DO UPDATE SET
            batch_id = EXCLUDED.batch_id,
            titulo_tema = EXCLUDED.titulo_tema,
            status = EXCLUDED.status,
            categoria_primaria = EXCLUDED.categoria_primaria,
            categorias_cruzadas = EXCLUDED.categorias_cruzadas,
            relevancia_score = EXCLUDED.relevancia_score,
            ttl_horas = EXCLUDED.ttl_horas,
            palavras_chave_busca = EXCLUDED.palavras_chave_busca,
            gatilho_vitrine = EXCLUDED.gatilho_vitrine,
            sintese_nerd = EXCLUDED.sintese_nerd,
            sugestao_pauta_gap = EXCLUDED.sugestao_pauta_gap,
            updated_at = EXCLUDED.updated_at,
            expires_at = EXCLUDED.expires_at;
    """

    with conn.cursor() as cur:
        for item in payload.insights:
            expira_em = agora + timedelta(hours=item.ttl_horas)
            cur.execute(query_upsert, {
                "slug": item.slug,
                "batch_id": payload.batch_id,
                "titulo_tema": item.titulo_tema,
                "status": item.status,
                "categoria_primaria": item.categoria_primaria,
                "categorias_cruzadas": item.categorias_cruzadas,
                "relevancia_score": item.relevancia_score,
                "ttl_horas": item.ttl_horas,
                "palavras_chave_busca": [kw.lower() for kw in item.palavras_chave_busca],
                "gatilho_vitrine": item.gatilho_vitrine,
                "sintese_nerd": item.sintese_nerd,
                "sugestao_pauta_gap": json.dumps(item.sugestao_pauta_gap.model_dump(), ensure_ascii=False),
                "updated_at": agora,
                "expires_at": expira_em
            })
            processados += 1
        conn.commit()

    return {"status": "ok", "batch_id": payload.batch_id, "itens_salvos": processados}


@app.get("/v1/curadoria/historico", dependencies=[Depends(verificar_token)])
def obter_historico_recente(horas: int = 48, conn=Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT slug FROM ai_curadoria_insights
            WHERE updated_at >= NOW() - (%s * INTERVAL '1 hour')
            ORDER BY updated_at DESC;
        """, (horas,))
        rows = cur.fetchall()

    return {"slugs_recentes": [r["slug"] for r in rows]}


@app.get("/v1/vitrine/em-alta")
def listar_temas_vitrine(
    categoria: Optional[str] = None,
    limite: int = Query(6, le=20),
    conn=Depends(get_db)
):
    with conn.cursor() as cur:
        if categoria:
            cur.execute("""
                SELECT slug, titulo_tema, status, categoria_primaria, categorias_cruzadas,
                       relevancia_score, palavras_chave_busca, gatilho_vitrine, sintese_nerd
                FROM ai_curadoria_insights
                WHERE expires_at > NOW()
                  AND (categoria_primaria = %s OR %s = ANY(categorias_cruzadas))
                ORDER BY relevancia_score DESC
                LIMIT %s;
            """, (categoria, categoria, limite))
        else:
            cur.execute("""
                SELECT slug, titulo_tema, status, categoria_primaria, categorias_cruzadas,
                       relevancia_score, palavras_chave_busca, gatilho_vitrine, sintese_nerd
                FROM ai_curadoria_insights
                WHERE expires_at > NOW()
                ORDER BY relevancia_score DESC
                LIMIT %s;
            """, (limite,))
        return {"temas_ativos": cur.fetchall()}


@app.get("/v1/busca/expansao")
def expandir_termo_busca(q: str = Query(..., min_length=2), conn=Depends(get_db)):
    termo = q.lower().strip()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT titulo_tema, relevancia_score, palavras_chave_busca, gatilho_vitrine
            FROM ai_curadoria_insights
            WHERE expires_at > NOW()
              AND (
                  %s = ANY(palavras_chave_busca)
                  OR titulo_tema ILIKE %s
              )
            ORDER BY relevancia_score DESC
            LIMIT 3;
        """, (termo, f"%{termo}%"))
        resultados = cur.fetchall()

    termos_expandidos = set([termo])
    for r in resultados:
        termos_expandidos.update(r["palavras_chave_busca"])

    return {
        "termo_original": q,
        "termos_turbinados": list(termos_expandidos),
        "contextos_relacionados": resultados
    }
```