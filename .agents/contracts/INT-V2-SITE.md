# Contrato de Integração Full-Stack: INT-V2-SITE

## 1. Contexto e Objetivo
- **ID da Tarefa:** `INT-V2-SITE`
- **Resumo:** Integrar os recursos existentes do site (Pulso de Notícias Quentes no topo do Mapa `#map-hot-news-pill`, botão Atualizar do Radar `#btn-atualizar-radar` em `/radar`, Resumo do Dia `#resumo-do-dia` e Entenda o Assunto `#entenda-o-assunto` / `/entenda`) às rotas e snapshots do Motor V2 (`api/routes_v2.py`, `data/vitrine_ia.json`, `data/feed_output.json`), garantindo atualização em tempo real, detecção dinâmica de países (eliminando os códigos fixos `BR/US/UA`) e invalidação rigorosa de cache (`Cache-Control: no-store, no-cache`).
- **Arquivos Alvo (Backend — `backend-logic`):**
  - `netlify/functions/noticias-quentes.mjs` (novo) e `functions/api/noticias-quentes.js` (paridade Cloudflare/Netlify se aplicável)
  - `netlify/functions/radar.mjs` (novo)
  - `netlify/functions/entenda-assunto.mjs` (novo)
  - `netlify/functions/resumo.js` e `functions/api/resumo.js` (modificados para inferência dinâmica de país e suporte a `refresh=1` / `_t`)
- **Arquivos Alvo (Frontend — `frontend-ui`):**
  - `app.js`
  - `styles.css`
  - `index.html` e `200.html` (paridade estrita caso modificado)

---

## 2. Especificação dos Endpoints (Frontend -> Backend Proxy Netlify)

### 2.1. `GET /api/noticias-quentes`
Retorna as notícias quentes e países em alta do Motor V2 (`GET ${CURADORIA_BACKEND_URL}/v1/noticias-quentes`), com fallback automático para `data/vitrine_ia.json` + detecção semântica de países quando o backend Python não estiver acessível.

- **Query Params:**
  - `categoria` (opcional): filtra por categoria.
  - `pais` (opcional): filtra por código ISO-2 (`BR`, `US`, etc.).
  - `limite` (opcional, default `15`): máximo de itens.
  - `_t` (opcional): timestamp de cache-busting.
  - `refresh` (opcional): `1` força bypass de cache.
- **Headers de Resposta:**
  - Sempre que houver `_t` ou `refresh=1`: `Cache-Control: no-store, no-cache, must-revalidate`
- **Payload JSON de Resposta (200 OK):**
```json
{
  "ok": true,
  "cached": false,
  "source": "v2_api | vitrine_snapshot",
  "identificacao_editorial": "Síntese Rodando o Mundo",
  "atualizado_em": "Atualizado às 23h50",
  "updatedAt": "2026-11-14T02:50:00Z",
  "total": 5,
  "noticias_quentes": [
    {
      "slug": "faa-suspende-voos-eua-falha-comunicacao-sistemas",
      "titulo_curto": "Paralisação Total dos Voos nos EUA por Falha Crítica de Comunicação",
      "resumo_pulso": "Colapso de comunicação na aviação dos EUA gera efeito cascata no transporte aéreo e comércio global.",
      "impacto_pratico": "A ordem de paralisação em solo decretada pela FAA devido a uma falha em sistemas de comunicação expõe a vulnerabilidade...",
      "categoria": "geopolitica",
      "paises_envolvidos": ["US"],
      "urgencia_score": 93,
      "relevancia_score": 93,
      "veiculos_origem": ["Curadoria IA · Pulso V2"],
      "fontes_urls": [],
      "palavras_chave": ["faa voos eua", "paralisacao aviacao americana"],
      "atualizado_em": "Atualizado às 23h50",
      "updated_at": "2026-11-14T00:55:57Z"
    }
  ],
  "paises_em_alta": [
    {
      "a2": "US",
      "countryName": "Estados Unidos",
      "title": "Paralisação Total dos Voos nos EUA por Falha Crítica de Comunicação",
      "source": "Síntese Rodando o Mundo · V2",
      "category": "Radar",
      "url": "/radar",
      "summary": "Colapso de comunicação na aviação dos EUA gera efeito cascata no transporte aéreo e comércio global.",
      "termoBusca": "faa voos eua",
      "urgencia_score": 93
    }
  ],
  "eventos_principais": []
}
```

---

### 2.2. `GET /api/radar`
Endpoint unificado do Radar Editorial (`/radar`), mesclando os itens em tempo real do Motor V2 (`/v1/noticias-quentes` + `data/vitrine_ia.json`) com os briefings de `data/feed_output.json`.

- **Query Params:**
  - `categoria` (opcional): `todos`, `geopolitica`, `politica`, `economia`, `cultura`.
  - `_t` (opcional): timestamp de cache-busting.
  - `refresh` (opcional): `1` força recarga sem cache e, se `CURADORIA_BACKEND_URL` estiver ativo, tenta acionar `POST ${CURADORIA_BACKEND_URL}/v1/noticias-quentes/executar` (com timeout curto de 2.5s sem bloquear em caso de lock/timeout) antes de ler `GET /v1/noticias-quentes`.
- **Headers de Resposta:**
  - Quando `_t` ou `refresh=1`: `Cache-Control: no-store, no-cache, must-revalidate`
- **Payload JSON de Resposta (200 OK):**
```json
{
  "ok": true,
  "cached": false,
  "source": "v2_hybrid",
  "atualizado_em": "Atualizado às 23h50",
  "updatedAt": "2026-11-14T02:50:00Z",
  "total": 12,
  "items": [
    {
      "id": "v2-faa-suspende-voos-eua-falha-comunicacao-sistemas",
      "slug": "faa-suspende-voos-eua-falha-comunicacao-sistemas",
      "titulo": "Paralisação Total dos Voos nos EUA por Falha Crítica de Comunicação",
      "resumo": "Colapso de comunicação na aviação dos EUA gera efeito cascata no transporte aéreo e comércio global.",
      "analise": "A ordem de paralisação em solo decretada pela FAA devido a uma falha em sistemas de comunicação expõe a vulnerabilidade das infraestruturas críticas americanas...",
      "categoria": "geopolitica",
      "fonte_nome": "Síntese Rodando o Mundo · Pulso V2",
      "fonte_url": "/radar",
      "data_publicacao": "2026-11-14T00:55:57Z",
      "origem_v2": true,
      "urgencia_score": 93,
      "paises_envolvidos": ["US"],
      "palavras_chave": ["faa voos eua", "paralisacao aviacao americana"]
    }
  ]
}
```

---

### 2.3. `GET /api/entenda-o-assunto`
Proxy para o dossiê contextual e colunas analíticas do Motor V2 (`GET /v2/entenda-o-assunto/{slug}` e `GET /v2/colunas`).

- **Query Params:**
  - `slug` (opcional): se informado, busca o dossiê específico em `GET ${CURADORIA_BACKEND_URL}/v2/entenda-o-assunto/{slug}` (ou sintetiza a partir do item correspondente em `data/vitrine_ia.json` quando sem banco).
  - `acao` (opcional): `colunas` (default quando sem `slug`) — retorna lista de colunas/análises V2.
  - `_t` / `refresh`: cache-busting (`Cache-Control: no-store, no-cache, must-revalidate`).
- **Payload JSON de Resposta (200 OK):**
```json
{
  "ok": true,
  "source": "v2_api | vitrine_snapshot",
  "atualizado_em": "Atualizado às 23h50",
  "colunas": [
    {
      "slug": "faa-suspende-voos-eua-falha-comunicacao-sistemas",
      "titulo": "Paralisação Total dos Voos nos EUA por Falha Crítica de Comunicação",
      "categoria": "Geopolítica & Infraestrutura",
      "resumo": "Colapso de comunicação na aviação dos EUA gera efeito cascata no transporte aéreo e comércio global.",
      "analise_aprofundada": "A ordem de paralisação em solo decretada pela FAA devido a uma falha em sistemas de comunicação expõe a vulnerabilidade...",
      "palavras_chave": ["faa voos eua", "paralisacao aviacao americana"],
      "rota_editoria": "/radar",
      "updated_at": "2026-11-14T00:55:57Z",
      "origem_v2": true
    }
  ],
  "dossie": null
}
```

---

### 2.4. `GET /api/resumo` (Melhoria em `netlify/functions/resumo.js` e `functions/api/resumo.js`)
- Suporte a `?_t=...` e `?refresh=1`:
  - Ignora o cache de 24h em memória quando `refresh=1` ou `_t` estiver presente e responde com `Cache-Control: no-store, no-cache, must-revalidate`.
- Inferência dinâmica de país (`codigoPais` e `pais`):
  - Não usar `codigoPais: 'UA'` ou `codigoPais: 'US'` fixos quando a manchete do RSS (`g1 Mundo`, `BBC News Brasil`) tratar de outro país (ex.: China `CN`, França `FR`, Filipinas `PH`, Argentina `AR`, Israel `IL`, Rússia `RU`, Reino Unido `GB`, Alemanha `DE`, Japão `JP`, Brasil `BR`, etc.).

---

## 3. Regras de Interface e DOM (`frontend-ui`)

1. **Pulso de Notícias Quentes no Mapa (`#map-hot-news-pill` / `hotNewsByCountry` em `app.js`):**
   - `checkHotNewsOnMap(isPeriodic)` deve consultar `/api/noticias-quentes?_t=` + `Date.now()` (com `cache: 'no-store'` quando periódico ou manual) já na inicialização da página!
   - Armazenar a lista retornada em `v2HotNewsItems` / `v2HotCountriesMap`.
   - Em `buildHotNewsMapFromEditorial()`:
     - Prioridade 1: `v2HotCountriesMap` (vindo de `/api/noticias-quentes`).
     - Prioridade 2: Países inferidos dinamicamente de `vitrineIaMemoryTemas` (`lerCacheVitrineIA(true)`).
     - Prioridade 3: `radarFeedCache` e `EDITORIAL.resumoDoDia` (com inferência de país pelo título/resumo em vez de confiar em `UA` estático).
     - Só usar `fallbackHot` se absolutamente todas as fontes acima estiverem vazias.
   - Em `updateHotNewsPillUI()`, exibir os nomes reais dos países em alta e o carimbo `atualizado_em` se disponível.
2. **Radar Editorial (`#radar-editorial-view`, `#btn-atualizar-radar` em `app.js`):**
   - Ao clicar em `#btn-atualizar-radar`:
     - Desabilitar o botão (`disabled = true`), adicionar classe `.is-loading` e alterar o texto para `⏳ Atualizando radar...`.
     - Chamar `loadRadarCards(true)`.
   - Em `loadRadarCards(forceRefresh)`:
     - Consultar `/api/radar` (com `?refresh=1&_t=` + `Date.now()` e `{ cache: 'no-store' }` quando `forceRefresh` for `true`, ou `?_t=` + `Date.now()` no carregamento inicial), mantendo fallback automático para `/data/feed_output.json?_t=` + `Date.now()` caso `/api/radar` retorne erro.
     - Atualizar um elemento `#radar-last-updated` no cabeçalho do Radar com `data.atualizado_em` (ex.: `Atualizado às 23h50`).
     - Nos cards com `item.origem_v2 === true`, exibir badge discreta `<span class="radar-badge-v2">⚡ Pulso V2</span>`.
     - Também atualizar `triggerHotNewsPulseCycle()` após carregar os cards do Radar!
3. **Resumo do Dia (`#resumo-do-dia`) e Entenda o Assunto (`#entenda-o-assunto`):**
   - Em `renderResumoDoDiaDOM()`, incluir um botão discreto `#btn-refresh-resumo-dia` ("🔄 Atualizar resumo") no cabeçalho da seção que chama `atualizarResumoDoDiaAutomatico(true)` com `?refresh=1&_t=` + `Date.now()`, limpando `localStorage` (`rom_resumo_items`, `rom_resumo_date`) e aplicando `cache: 'no-store'`.
   - Em `#entenda-o-assunto`, buscar `/api/entenda-o-assunto?acao=colunas` de forma assíncrona e renderizar os cards de síntese analítica da V2 (com selo *"Síntese Rodando o Mundo · V2"*) integrados à grade de guias explicativos.
