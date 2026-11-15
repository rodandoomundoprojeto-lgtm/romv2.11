# Contrato de Integração Full-Stack: ATLAS-VIVO

> **Regra 8 (`GEMINI.md`):** Contrato de Dados oficial (Contract-First) para transformar o Rodando o Mundo em um Atlas de Notícias Real e Vivo com cobertura global contínua.

---

## 1. Contexto e Objetivo (5 Partes)
- **ID da Tarefa:** `ATLAS-VIVO`
- **Resumo:** Garantir notícias sempre atualizadas e cobertura completa dos 190+ países e territórios do mapa, combinando Cron Triggers na borda (pulso agregado por continente), coleta on-demand por país com tradução em lote para PT-BR e persistência única no PostgreSQL.
- **Divisão em 5 Partes:**
  1. **Parte 1 — Schema & Persistência PostgreSQL:** Tabelas para cache vivo por país/continente e tradução persistida (PT-BR + original).
  2. **Parte 2 — Worker Cron Agregado por Continente:** Cloudflare Worker com Cron Trigger (`*/10 * * * *`) coletando grandes feeds regionais e atualizando o pulso global no PostgreSQL.
  3. **Parte 3 — API On-Demand por País & Tradução em Lote (`/api/atlas-pais`):** Endpoint serverless que entrega o cache se fresco (<15 min) ou coleta multi-motor (veículos cadastrados + Google/Bing News RSS + fallback GDELT), traduz em lote para PT-BR e grava no PostgreSQL.
  4. **Parte 4 — Pulso Global Dinâmico (`/api/noticias-quentes`):** Remover limitação estática de ~20 países e alimentar o mapa/ticker com todos os países ativos no PostgreSQL.
  5. **Parte 5 — Interface de Atlas Vivo (`app.js`, `styles.css`, `index.html`, `200.html`):** Feed ao vivo em todos os países (eliminando telas vazias), ticker global, marcadores pulsantes no mapa, carimbos relativos e auto-refresh silencioso + botão manual sem cache.

- **Arquivos Alvo (Backend):** `migrations/`, `workers/atlas-pulso/`, `functions/api/atlas-pais.js`, `functions/api/noticias-quentes.js`, `functions/api/busca-assunto.js`
- **Arquivos Alvo (Frontend):** `app.js`, `styles.css`, `index.html`, `200.html`

---

## 2. Especificação da Requisição (Frontend -> Backend)

### 2.1. Endpoint: `/api/atlas-pais`
- **Método HTTP:** `GET`
- **Query Params:**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `pais` | `string` | Sim | Código ISO Alpha-2 (`BR`, `JP`, `US`, etc.) |
  | `nome` | `string` | Não | Nome do país/território para fallback de busca |
  | `lang` | `string` | Não | Idioma alvo da tradução (padrão `pt`) |
  | `refresh` | `string` | Não | `1` para forçar coleta ao vivo ignorando TTL |
  | `_t` | `number` | Quando Refresh | Timestamp (`Date.now()`) para cache-busting (Regra 7) |

### 2.2. Endpoint: `/api/noticias-quentes`
- **Método HTTP:** `GET`
- **Query Params:**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `limite` | `number` | Não | Máximo de destaques (padrão `24`) |
  | `continente` | `string` | Não | Filtro opcional por continente |
  | `refresh` / `_t` | `string/number` | Quando Refresh | Força leitura limpa sem cache |

---

## 3. Especificação da Resposta (Backend -> Frontend)

### 3.1. Headers Obrigatórios
- Requisições normais: `Content-Type: application/json; charset=utf-8` + `Cache-Control: public, max-age=120, stale-while-revalidate=60`
- Requisições com `_t` ou `refresh=1`: `Cache-Control: no-store, no-cache, must-revalidate`

### 3.2. Payload de Sucesso — `/api/atlas-pais` (HTTP 200)
```json
{
  "ok": true,
  "cached": true,
  "source": "postgres_cache | live_hybrid",
  "country": "JP",
  "countryName": "Japão",
  "updatedAt": "2026-11-14T23:45:00Z",
  "ttlMinutes": 15,
  "items": [
    {
      "id": "hash_url",
      "titlePt": "Título traduzido para português",
      "titleOriginal": "Original headline in local language",
      "originalLang": "ja",
      "url": "https://...",
      "source": "NHK World / Asahi Shimbun",
      "category": "politica",
      "publishedAt": "2026-11-14T23:38:00Z",
      "score": 95,
      "isRegisteredOutlet": true
    }
  ]
}
```

### 3.3. Payload de Erro / Fallback (HTTP 200 degradado ou 5xx)
```json
{
  "ok": false,
  "error": "Mensagem descritiva para log/UI",
  "country": "JP",
  "items": []
}
```

---

## 4. Schema PostgreSQL (Parte 1)
- **`atlas_pais_noticias`**:
  - `country_code VARCHAR(8) PRIMARY KEY`
  - `country_name VARCHAR(120)`
  - `items_json JSONB NOT NULL` (array com `titlePt`, `titleOriginal`, `originalLang`, `url`, `source`, `publishedAt`, `score`, `isRegisteredOutlet`)
  - `source_mode VARCHAR(32)` (`hybrid_rss`, `gdelt_fallback`, `continent_pulse`)
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **`atlas_pulso_continental`**:
  - `continent_key VARCHAR(32) PRIMARY KEY` (`america_sul`, `america_norte`, `europa`, `asia`, `africa`, `oceania`)
  - `headlines_json JSONB NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

---

## 5. Elementos DOM e Estados Visuais (Frontend — Parte 5)
- **Container no Painel do País:** `#atlas-live-news-feed` dentro de `renderCountry()` (exibido inclusive quando `cMed.outlets` estiver vazio, eliminando telas sem cobertura).
- **Ticker Global:** `#atlas-global-ticker` alimentado pelo pulso continental.
- **Estado de Loading:** Skeleton discreto com classe `.is-loading`.
- **Chave de Cache Local (`localStorage`):** `rom_atlas_pais_<A2>` (limpar obrigatoriamente no botão Atualizar com `_t=`).
- **Toggle de Idioma no Card:** Exibir `titlePt` por padrão com opção discreta de ver `titleOriginal`.
