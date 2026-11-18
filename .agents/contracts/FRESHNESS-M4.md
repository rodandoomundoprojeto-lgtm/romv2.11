# Contrato de Integração Full-Stack: FRESHNESS-M4

## 1. Contexto e Objetivo
- **ID da Tarefa:** `FRESHNESS-M4`
- **Resumo:** Garantir que todas as notícias que alimentam Radar, Notícias Quentes, Vitrine IA, Resumo do Dia, Últimas Notícias, Atlas Vivo e Colunas V2 permaneçam sempre exibindo os itens mais recentes, sem regressão a itens antigos após atualizações, novas coletas ou recarregamentos, e garantir aprovação de 100% da suíte E2E (`python tests/e2e/run_e2e.py --offline`).
- **Arquivos Alvo (Backend):** `api/routes_v2.py`, `curadoria/api/main.py`, `redacao_v2/pulso_noticias_quentes.py`, `curadoria/pipeline.py`, `src/*.py`, `_worker.js`, `functions/api/*.js`, `functions/lib/*.js`, `tests/e2e/test_freshness_cycles.py`
- **Arquivos Alvo (Frontend):** `app.js`, `index.html`, `200.html`, `*/index.html`, `tests/e2e/test_edge_and_frontend_e2e.mjs`

---

## 2. Especificação da Requisição (Frontend -> Backend)
- **Endpoints:** `/api/radar`, `/api/noticias-quentes`, `/api/vitrine-em-alta`, `/api/ultimas-noticias`, `/api/atlas-pais`, `/api/resumo`, `/api/busca-assunto`, `/api/noticias`, `/api/entenda-o-assunto`, `/v1/noticias-quentes`, `/v1/vitrine/em-alta`, `/v2/sugestoes-contextuais`
- **Método HTTP:** `GET`
- **Query Params:**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `_t` | `number` | Sim (feeds ao vivo) | Timestamp (`Date.now()`) para cache-busting |
  | `refresh` | `string` | Quando Refresh (`1`) | Força bypass de cache em memória e CDN |
  | `force` | `string` | Opcional (`1`) | Força revalidação no backend |

---

## 3. Especificação da Resposta (Backend -> Frontend)

### 3.1. Headers Obrigatórios
- Em requisições com `_t`, `refresh=1` ou `force=1`: `Cache-Control: no-store, no-cache, must-revalidate`
- Em qualquer resposta de fallback/degradação (banco indisponível ou vazio lendo snapshot `data/vitrine_ia.json` ou `data/feed_output.json`): `Cache-Control: no-store, no-cache, must-revalidate` com HTTP 200 (nunca 503 se houver snapshot local válido).
- Em `/api/noticias`: quando `_t` ou `refresh=1` é informado e `CURRENTS_API_KEY` falhar/502 no upstream ou estiver em modo offline/teste, retornar fallback seguro HTTP 200 com `Cache-Control: no-store, no-cache, must-revalidate` ou tratar Currents/RSS conforme esperado pela suíte E2E.

### 3.2. Ordenação Canônica e Timestamps
- `data_publicacao`: ISO-8601 UTC imutável da publicação original.
- `updated_at`: ISO-8601 UTC da última atualização.
- Ordenação primária sempre por `data_publicacao DESC, updated_at DESC` (com `urgencia_score` / `relevancia_score` apenas como desempate secundário).
- Itens RSS sem data jamais recebem `now()` como `data_publicacao`; possuem `publishedAt: ""` e ordenam após itens datados.

---

## 4. Elementos DOM e Estados Visuais (Frontend)
- **Notícias Quentes / Pulsando Agora:** `#map-hot-news-pill`, `#hot-news-country-list`, `v2HotNewsByCountry` (nunca sobrescrever título ao vivo com `curatedPulsingDefaults.shortTitle`).
- **Radar Editorial:** `#radar-grid`, `#btn-atualizar-radar`, `radarFeedCache` (auto-refresh com erro 502 não deve sobrescrever cache mais recente com `/data/feed_output.json` antigo).
- **Vitrine IA:** `#vitrine-ia-grid`, `rom_cache_vitrine_ia` (TTL estrito, ordenação mais recente primeiro).
- **Resumo do Dia:** `#resumo-container`, `rom_resumo_cache` (revalidar mesmo no mesmo dia, sincronizar `checkHotNewsOnMap(true)`).
- **Últimas Notícias:** `#ultimas-noticias-grid`, `rom_ultimas_noticias` (não bloquear fetch inicial com cache antigo).
- **Atlas Vivo:** `#country-news`, `rom_atlas_pais_<A2>` (revalidar e traduzir top 4 após ordenação `orderedItems.slice(0, 4)`).
- **Colunas V2:** `#radar-v2-colunas-wrap` (suporte a `#colunas` no hash routing e TTL no cache).
