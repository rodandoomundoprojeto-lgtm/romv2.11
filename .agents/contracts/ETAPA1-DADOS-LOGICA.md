# Contrato de Integração Full-Stack: ETAPA1-DADOS-LOGICA

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `ETAPA1-DADOS-LOGICA`
- **Resumo:** Correção da Etapa 1 focada exclusivamente na lógica de dados, API/pipeline de notícias e renderização condicional em JS (sem alterar o CSS geral de botões ou posicionamento mobile):
  1. **Imagens das matérias e container de mídia:** Investigar e corrigir no pipeline/API por que nenhuma matéria traz URL de imagem válida (`image` / `imageUrl` / `thumbnail` / `media:content` / `enclosure` / `<img src>` no RSS description / fallback `og:image`), garantindo que o JSON entregue URLs válidas (`https://...`), e renderizar condicionalmente no Frontend o container de imagem **apenas** quando houver URL válida (com handler `onerror` que oculta/remove o wrapper inteiro da imagem, fazendo o resumo subir imediatamente abaixo do título, sem exibir placeholder vazio).
  2. **Sugestões de busca ("Assuntos em alta" / tags) e "Comparar cobertura":**
     - Garantir que todas as tags de sugestão e "Assuntos em alta" (tanto no Backend quanto no Frontend) sejam extraídas ou validadas contra os itens reais disponíveis para aquele país/contexto, nunca exibindo tags que retornem 0 resultados.
     - Flexibilizar a query e os filtros de `"Comparar cobertura"` (usando palavras-chave principais/entidades em vez de exigir a frase exata do título ou filtros restritivos de período/tópico, ampliando o período padrão para `7d` ou `30d` / fallback automático se `24h` for vazio) e ocultar o botão `"Comparar cobertura"` no card caso não haja termos/matérias comparáveis.
- **Arquivos Alvo (Backend):** `functions/api/noticias.js`, `functions/api/noticias-quentes.js`, `functions/api/ultimas-noticias.js`, `functions/api/busca-assunto.js`, `functions/api/pesquisa.js`, `functions/api/vitrine-em-alta.js`, `netlify/functions/*.mjs`, `src/collector.py`, `data/feed_output.json`, `data/editorial.js`
- **Arquivos Alvo (Frontend):** `app.js`, `noticias.js` (Restrição Etapa 1: não alterar CSS geral de botões ou posicionamento mobile em `styles.css`).

---

## 2. Especificação da Requisição (Frontend -> Backend)
- **Endpoints:** `/api/noticias`, `/api/noticias-quentes`, `/api/ultimas-noticias`, `/api/busca-assunto`, `/api/pesquisa`, `/api/vitrine-em-alta`
- **Métodos HTTP:** `GET` | `POST`
- **Query Params / Body JSON:**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `pais` / `country` | `string` | Não | Código ISO ou slug do país |
  | `q` | `string` | Sim (em buscas) | Termo de busca contextual ou palavras-chave extraídas |
  | `periodo` | `string` | Não | `24h`, `7d`, `30d` ou `all` (em Comparar Cobertura usar `7d` ou `30d` como padrão/fallback para evitar zero resultados) |
  | `_t` | `number` | Quando Refresh | Timestamp (`Date.now()`) para cache-busting |

---

## 3. Especificação da Resposta (Backend -> Frontend)

### 3.1. Headers Obrigatórios
- Em requisições normais: `Content-Type: application/json; charset=utf-8`
- Em requisições com `_t` ou `refresh=1`: `Cache-Control: no-store, no-cache, must-revalidate`

### 3.2. Contrato de Imagem nos Itens de Notícia
Todo objeto de notícia retornado pelas APIs (`/api/noticias`, `/api/noticias-quentes`, `/api/ultimas-noticias`, `/api/busca-assunto`, `/api/pesquisa`, `/api/vitrine-em-alta`) ou presente em `data/feed_output.json` deve normalizar a imagem:
- Propriedade principal: `image` (string com URL `http(s)://` válida ou `null`/`""` se ausente) e alias compatível `imageUrl` / `thumbnail` se usado pelo cliente.
- **Extração no Backend/Scraper:**
  1. Extrair de `<media:content url="...">`, `<media:thumbnail url="...">`, `<enclosure url="..." type="image/...">`, `<image><url>...</url></image>`, ou tag `<img src="...">` dentro de `description` / `content:encoded`.
  2. Filtrar pixels de rastreamento, ícones de 1x1, logos genéricos do Google News (`lh3.googleusercontent.com/J6_coFbogxhRI9iM864NL_liGXvsQp2AupsKei7z0cNNfDvGUmWUy20nuUhkREQyrpY4bEeIBuc=s0-w300-rw` etc.) ou URLs quebradas.
  3. Quando o feed RSS for do Google News/Bing News ou não trouxer tag de mídia direta, usar `bing.com/th?id=OVFT...` quando presente no RSS do Bing, ou extrair/resolver `og:image` quando viável, mantendo `null` quando genuinamente não houver foto.

### 3.3. Contrato de Sugestões ("Assuntos em Alta") e Busca Comparada
- **`trendingTopics` / `suggestions`:**
  - Só retornar termos/tags que possuam correspondência comprovada nos itens carregados para aquele país/contexto.
  - No Frontend, as tags de sugestão exibidas na gaveta de busca ou no painel do país devem ser geradas/filtradas a partir dos títulos/assuntos realmente presentes na base/feed atual daquele país (ou validadas contra os itens), garantindo `> 0` resultados ao clicar.
- **`/api/busca-assunto` e `/api/pesquisa` (Regra 7 do GEMINI.md):**
  - Pontuação ponderada de relevância (frase exata > todos os termos > termos centrais/contexto > bônus de recência), nunca usando filtro eliminador rígido `tokens.every(...)`.
  - Se o período restrito (`24h`) retornar 0 resultados, ampliar automaticamente a busca ou aceitar artigos disponíveis no período estendido (`7d` / `30d` / `all`).

---

## 4. Elementos DOM e Comportamento Condicional (Frontend)
- **Container de Imagem nos Cards (`app.js` / `noticias.js`):**
  - **Proibido** renderizar placeholder vazio ou container `.news-card-media` / `.hot-news-img-wrap` / similar quando `item.image` (ou `item.imageUrl` / `item.thumbnail`) for nulo, vazio ou inválido.
  - Quando houver URL válida, renderizar o container com `<img ... referrerpolicy="no-referrer" loading="lazy" onerror="this.closest('<seletor-do-container>').style.display='none'">` (ou removendo/ocultando o container pai via handler `onerror`), garantindo que se a imagem falhar por CORS/hotlink/404, o bloco inteiro desapareça e o resumo suba logo abaixo do título.
- **Botão `"Comparar cobertura"` (`app.js` / `noticias.js`):**
  - Ao clicar em `"Comparar cobertura"`, enviar query flexibilizada (palavras-chave principais / entidades extraídas do título, sem pontuação ou verbos de manchete que restrinjam demais, e com período ampliado `7d`/`30d` e sem travar num tópico estrito que zere a busca).
  - Avaliar antes de exibir o botão no card (ou ocultar dinamicamente) caso o card não possua palavras-chave válidas para comparação ou caso a base local/contexto indique que não há cobertura comparável.
- **Chave de Cache Local (`localStorage`):** Limpar caches obsoletos de busca/notícias em refresh (`_t`).
