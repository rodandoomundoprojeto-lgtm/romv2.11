# Contrato de Integração Full-Stack: SUG-CURADORIA-IA

## 1. Contexto e Objetivo
- **ID da Tarefa:** `SUG-CURADORIA-IA`
- **Resumo:** O Agente de Curadoria IA coleta RSS + Google Trends + `config/sources.json`, cruza com o acervo real das seções do portal (`/politica`, `/economia`, `/cultura`, `/eleicoes`, `/radar`, `/resumo-do-dia`, `/ultimas-noticias`) na tabela `conteudos` do Supabase, gera insights estruturados nas editorias do site e abastece a vitrine da Home (`#vitrine-ia`) e a expansão semântica da busca via `/api/vitrine-em-alta`.
- **Fonte de verdade do schema Python:** `curadoria/agente/schemas.py`
- **Arquivos Alvo (Backend):**
  - `curadoria/agente/{schemas,prompt,fontes,coletor,analisador}.py`
  - `curadoria/db/{importar_acervo,limpar_expirados}.py`
  - `curadoria/api/main.py`, `curadoria/pipeline.py`, `curadoria/tests/test_schemas.py`
  - `functions/api/vitrine-em-alta.js`, `netlify/functions/vitrine-em-alta.mjs`
  - `data/vitrine_ia.json` (snapshot estático atualizado pelo pipeline para fallback imediato na CDN)
- **Arquivos Alvo (Frontend):**
  - `index.html`, `200.html` (paridade obrigatória)
  - `styles.css`
  - `app.js`

---

## 2. Mapeamento Oficial de Editorias (`CategoriaType`)

| Valor `CategoriaType` | Label UI | Rota no Site |
| :--- | :--- | :--- |
| `Politica` | Política | `/politica` |
| `Economia` | Economia & Câmbio | `/economia` |
| `Cultura` | Cultura & Sociedade | `/cultura` |
| `Eleicoes` | Eleições | `/eleicoes` |
| `Geopolitica_Radar` | Radar Geopolítico | `/radar` |
| `Resumo_Ultimas` | Resumo & Últimas | `/ultimas-noticias` |

Formatos editoriais (`FormatoType`): `"Analise Geopolitica"`, `"Guia Explicativo"`, `"Comparativo Internacional"`, `"Radar de Impacto"`.

---

## 3. Especificação da Requisição (Frontend -> Backend Proxy Netlify/Cloudflare)

### 3.1. Vitrine de Temas em Alta
- **Endpoint:** `/api/vitrine-em-alta`
- **Método HTTP:** `GET`
- **Query Params:**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `categoria` | `string` | Não | Filtra por `CategoriaType` (`Politica`, `Economia`, `Cultura`, `Eleicoes`, `Geopolitica_Radar`, `Resumo_Ultimas`) |
  | `limite` | `number` | Não | Máximo de itens (default `6`, máx `20`) |
  | `acao` | `string` | Não | Se `expansao`, executa expansão de termos para busca (`q`) |
  | `q` | `string` | Quando `acao=expansao` | Termo pesquisado pelo usuário (mín. 2 caracteres) |
  | `_t` | `number` | Quando Refresh | Timestamp (`Date.now()`) para cache-busting |
  | `refresh` | `string` | Opcional | `1` força bypass de cache |

---

## 4. Especificação da Resposta (Backend -> Frontend)

### 4.1. Headers Obrigatórios
- Sempre: `Content-Type: application/json; charset=utf-8`
- Quando houver `_t` ou `refresh=1`: `Cache-Control: no-store, no-cache, must-revalidate`
- Em leitura normal (sem `_t`): `Cache-Control: public, max-age=120, s-maxage=300`

### 4.2. Payload de Sucesso — Vitrine (`GET /api/vitrine-em-alta`)
```json
{
  "ok": true,
  "cached": false,
  "source": "api | snapshot",
  "updatedAt": "2026-11-13T23:50:00Z",
  "temas_ativos": [
    {
      "slug": "corte-juros-fed-impacto-dolar-brasil",
      "titulo_tema": "Decisão de juros nos EUA pressiona câmbio e mercados emergentes",
      "status": "em_alta",
      "categoria_primaria": "Economia",
      "categorias_cruzadas": ["Politica", "Geopolitica_Radar"],
      "rota_editoria": "/economia",
      "relevancia_score": 92,
      "palavras_chave_busca": ["juros eua", "fed", "dólar", "economia brasil"],
      "gatilho_vitrine": "Destacar cobertura econômica sobre câmbio e juros",
      "sintese_nerd": "A manutenção dos juros pelo Federal Reserve altera o fluxo cambial para emergentes e impacta a Selic no Brasil."
    }
  ]
}
```

### 4.3. Payload de Sucesso — Expansão de Busca (`GET /api/vitrine-em-alta?acao=expansao&q=...`)
```json
{
  "ok": true,
  "termo_original": "dólar",
  "termos_turbinados": ["dólar", "fed", "juros eua", "economia brasil"],
  "contextos_relacionados": [
    {
      "titulo_tema": "Decisão de juros nos EUA pressiona câmbio e mercados emergentes",
      "relevancia_score": 92,
      "palavras_chave_busca": ["juros eua", "fed", "dólar", "economia brasil"],
      "gatilho_vitrine": "Destacar cobertura econômica sobre câmbio e juros"
    }
  ]
}
```

### 4.4. Payload de Erro / Fallback (HTTP 200 gracioso ou 5xx)
```json
{
  "ok": false,
  "error": "Mensagem descritiva",
  "temas_ativos": [],
  "termos_turbinados": []
}
```

---

## 5. Especificação da API FastAPI + PostgreSQL (`curadoria/api/main.py`)
- `GET /health` -> `{ "ok": true }`
- `POST /v1/curadoria` (Bearer Auth) -> grava insights em `ai_curadoria_insights`
- `GET /v1/curadoria/historico?horas=48` (Bearer Auth) -> `{ "slugs_recentes": ["..."] }`
- `GET /v1/vitrine/em-alta?categoria=&limite=6&_t=` (Público, com `Cache-Control` dinâmico e rate-limit) -> `{ "temas_ativos": [...] }`
- `GET /v1/busca/expansao?q=&_t=` (Público, com `Cache-Control` dinâmico e rate-limit) -> `{ "termo_original": "...", "termos_turbinados": [...], "contextos_relacionados": [...] }`
- `GET /v1/gaps` (Bearer Auth) -> `{ "content_gaps": [...] }`

---

## 6. Elementos DOM e Estados Visuais (Frontend)
- **Container Alvo na Home (`index.html` e `200.html`):** `<section id="vitrine-ia" class="vitrine-ia-section" aria-label="Temas em Alta pela Curadoria IA">...</section>`
- **Filtro de Editorias na Vitrine:** chips para `Todos`, `Política`, `Economia`, `Cultura`, `Eleições`, `Radar`, `Resumo & Últimas`
- **Botão Atualizar:** `#btn-refresh-vitrine-ia` -> limpa `localStorage.removeItem('rom_cache_vitrine_ia')` e requisita `/api/vitrine-em-alta?_t=${Date.now()}`
- **Chave de Cache Local (`localStorage`):** `rom_cache_vitrine_ia` (TTL de 5 minutos em leitura normal)
- **Integração com a Busca Contextual (`app.js`):**
  - Ao buscar um termo no site, consultar os temas ativos (em memória/`rom_cache_vitrine_ia` ou `/api/vitrine-em-alta?acao=expansao&q=...`) e usar `termos_turbinados` para somar **bônus de relevância ponderada** nos resultados (NUNCA usar como filtro eliminador `tokens.every(...)`).
