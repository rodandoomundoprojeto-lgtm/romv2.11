# Contrato de Integração Full-Stack: SUG-ULTIMAS-MANCHETES

## 1. Contexto e Objetivo
- **ID da Tarefa:** `SUG-ULTIMAS-MANCHETES`
- **Resumo:** Garantir frescor absoluto e alta relevância na seção "Últimas manchetes" no painel de país. Elimina notícias defasadas (5h a 8h atrás) e irrelevantes (como notas consulares) consumindo diretamente os feeds oficiais de **Top Headlines** das edições nacionais do Google News para mais de 80 países e busca inteligente com janela de 24h para países menores, com tradução instantânea para português e botão para alternar para o idioma original.
- **Arquivos Alvo (Backend):** `functions/api/atlas-pais.js`, `api/routes_v2.py`
- **Arquivos Alvo (Frontend):** `app.js`

## 2. Especificação da Requisição (Frontend -> Backend)
- **Endpoint:** `/api/atlas-pais`
- **Método HTTP:** `GET`
- **Query Params:** `pais`, `nome`, `refresh`, `_t` (conforme `ATLAS-VIVO.md`)

## 3. Especificação da Resposta (Backend -> Frontend)
- **Estratégia de Coleta em Cascata:**
  1. **Edições Nativas Oficiais (`GOOGLE_NEWS_EDITIONS`):** Para países com edição nacional (ex: `US`, `GB`, `FR`, `DE`, `IT`, `ES`, `PT`, `AR`, `MX`, `JP`, etc.), consome o feed oficial de Top Headlines (`/rss?hl={hl}&gl={gl}&ceid={ceid}`), trazendo as manchetes principais da hora atual (CNN, NYT, Politico, BBC, Le Monde, etc.).
  2. **Países sem edição direta:** Busca por nome internacional/local (`COUNTRY_INTL_NAMES`) com janela estrita de `when:24h` (com fallback para `when:2d` e `when:7d` apenas se vazio).
  3. **TTL:** Cache de 8 minutos em memória/PostgreSQL, com bypass obrigatório quando `_t=` ou `refresh=1` forem enviados (Regra 7 do `GEMINI.md`).
- **Payload de Sucesso (HTTP 200):**
  - `items`: array de objetos `{ id, titlePt, titleOriginal, url, source, publishedAt, score, country }`
  - Para países não lusófonos (`!['BR','PT','AO','MZ','CV','GW','ST','TL'].includes(pais)`), o backend deve traduzir `titlePt` em paralelo (`Promise.all`).

## 4. Elementos DOM e Comportamento (Frontend)
- **Título da Seção (`#atlas-live-heading`):** `"Últimas manchetes · " + esc(cName)`.
- **Tradução garantida no cliente:** Caso `/api/atlas-pais` retorne itens sem tradução (`titlePt === titleOriginal`) ou o `fallbackRssBrowser()` seja acionado em países não lusófonos, o frontend deve usar `translateTextsMap(..., 'pt')` para traduzir os títulos para português antes/logo após renderizar, atualizando `titlePt` e o cache `localStorage`.
- **Botão de alternância:** Exibir `titlePt` (em português) por padrão e manter o botão `.atlas-lang-toggle` com texto `"Ver original"` (alternando para `"Ver em português"` quando o original estiver visível).
- **Botão de Atualizar:** Dispara requisição com `_t=Date.now()&refresh=1`, limpa `localStorage` e exibe estado de loading/refreshing.
