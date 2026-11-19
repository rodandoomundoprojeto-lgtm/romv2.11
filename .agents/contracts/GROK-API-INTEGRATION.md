# Contrato de Dados — GROK-API-INTEGRATION

## Objetivo
Adicionar o Grok (xAI) com busca nativa no X como camada **complementar** do Resumo do Dia, sem substituir nem conflitar com `/api/resumo` (RSS BBC/g1, Cloudflare Pages Function), que permanece **intocado** e é o fallback garantido.

## Hospedagem
Cloudflare Pages (`_worker.js`). **Não** criar Netlify Functions nem alterar `_redirects`.

## Artefato produzido pelo backend
`data/noticias_x.json` — gerado por `scripts/grok_x_feeder.py` (local via `.bat` ou GitHub Actions a cada 3h). Arquivo estático servido em `/data/noticias_x.json`.

### Schema
```json
{
  "atualizadoEm": "2026-11-19T13:10:05Z",      // ISO UTC, obrigatório
  "dataEdicao": "2026-11-19",
  "fonteMotor": "Grok (grok-4.7) · X Search",
  "mock": false,                                 // true => frontend DEVE ignorar
  "total": 6,
  "topicosEmAltaPorPais": { "BR": ["..."], "US": ["..."] },  // chaves ISO-2 MAIÚSCULAS
  "items": [
    {
      "relevancia": 1,
      "categoria": "Brasil · Política & Fiscal",
      "titulo": "...", "resumo": "...", "resumoCurto": "...",
      "analise": "Impacto editorial/geopolítico em 1 frase (opcional, usado no Radar)",
      "fonte": "Folha de S.Paulo", "handleX": "@folha", "dominio": "folha.uol.com.br",
      "termoBusca": "...",
      "url": "https://...", "urlMateriaOriginal": "https://...",   // SEMPRE uma URL citada pela busca real
      "paginaTematica": "/politica/brasil" | null,                 // somente rotas do sitemap.xml (Regra 11)
      "labelTematica": "..." | null,
      "explicacaoId": "o-que-e-o-orcamento" | null,                // somente /entenda/* do sitemap.xml
      "pais": "Brasil", "codigoPais": "BR", "continente": "sul", "tipoNoticia": "politica",
      "categoriaRadar": "geopolitica" | "politica" | "economia" | "cultura",
      "origemGrokX": true,
      "publicadoEm": "ISO"
    }
  ]
}
```

### Regras de integridade (backend)
- Usar `POST https://api.x.ai/v1/responses` com `tools: [{type:"x_search"},{type:"web_search"}]`. O Live Search legado (`search_parameters`) retorna 410 e **não** deve ser usado.
- **Nunca** chamar o modelo sem ferramenta de busca como fallback (evita notícias inventadas).
- Item cuja `url` não esteja entre as citações reais retornadas pela busca é descartado.
- Se a resposta tiver menos de 3 itens válidos: **não sobrescrever** o arquivo (exit code ≠ 0).
- `--mock` grava com `"mock": true` e só em caminho explícito via `--out` ou mantém flag para o frontend ignorar.

## Consumo pelo frontend (`app.js`)
Ordem de cascata no Resumo do Dia:
1. `/data/noticias_x.json?_t=<ts>` (`cache:'no-store'`) — usado **somente** se `mock !== true`, `items.length >= 3` e `atualizadoEm` com até **6 h** de idade.
2. Caso contrário (ou erro/404): `/api/resumo?_t=<ts>` (fluxo atual, inalterado).
3. Caso ambos falhem: cache `localStorage` existente / conteúdo já renderizado (nunca limpar a tela).

Complemento independente: `topicosEmAltaPorPais` do arquivo Grok (se fresco) é injetado via `incorporarTopicosEmAlta(cc, lista, false)` mesmo quando o Resumo vier do RSS.

UI Resumo do Dia: badge `.badge-grok-live` no cabeçalho quando a edição exibida veio do Grok; tag `.resumo-x-tag` ("𝕏 Tempo Real") em itens com `origemGrokX`.

## Consumo complementar pelo Radar (`app.js`)
- `loadRadarCards()` busca `/data/noticias_x.json?_t=<ts>` em paralelo (sem bloquear nem falhar se 404/erro) junto com `/api/radar` (e também no fallback `/data/feed_output.json`).
- Se `grokDadosValidos(grokData)` for verdadeiro, converte os itens para o formato de card do Radar (`titulo`, `resumo`, `analise`, `categoria` via `categoriaRadar` em `geopolitica|politica|economia|cultura`, `fonte_nome`, `fonte_url`, `data_publicacao`, `origem_grok_x: true`) e **mescla** com os cards existentes do Radar (deduplicando por `fonte_url` ou `titulo` normalizado), sem nunca sobrescrever ou remover os briefings existentes.
- Se `/api/radar` e `/data/feed_output.json` falharem simultaneamente, mas houver cards válidos do Grok, exibe os cards do Grok em vez de tela de erro.
- UI Radar: nos cards com `item.origem_grok_x`, exibe `<span class="resumo-x-tag">𝕏 Grok / X</span>` em `.radar-card-meta`.

