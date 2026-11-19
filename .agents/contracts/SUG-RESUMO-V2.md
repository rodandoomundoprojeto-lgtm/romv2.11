# Contrato de Integração Full-Stack: SUG-RESUMO-V2

> **Instrução aos Subagentes (`backend-logic` e `frontend-ui`):** Sigam rigorosamente as interfaces, nomes de campos JSON, parâmetros de URL e seletores DOM definidos neste contrato. Respeitem o isolamento estrito de contexto: cada subagente deve ler e editar apenas os arquivos de sua respectiva camada.

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `SUG-RESUMO-V2`
- **Resumo:** Reformulação da curadoria, deduplicação com agrupamento de fontes, limpeza de créditos fotográficos, extração de mini-thumbnail `64x64`, layout **Editorial Clean** e deep-link direto de **Comparar perspectivas** no **Resumo do Dia** (tanto no E-mail via Cloudflare Worker quanto na página `/resumo-do-dia` no site).
- **Arquivos Alvo (Backend):**
  - `functions/api/resumo.js`
  - `functions/lib/rss.js`
  - `workers/resumo-diario/index.js`
- **Arquivos Alvo (Frontend):**
  - `app.js`
  - `styles.css`

---

## 2. Especificação da Requisição (Frontend / Worker -> Backend)
- **Endpoint:** `/api/resumo`
- **Método HTTP:** `GET`
- **Query Params:**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `_t` | `number` | Quando Refresh / Worker | Timestamp (`Date.now()`) para cache-busting e invalidação de cache |
  | `refresh` | `string` | Opcional (`"1"`) | Força atualização ignorando caches intermediários |

- **Parâmetros de Deep-Link na Rota do Site (`/resumo-do-dia`):**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `item` | `number` (`1..5`) | Opcional | Número da notícia no Resumo do Dia (`1` a `5`, correspondente a `relevancia`) |
  | `comparar` | `string` (`"1"`) | Opcional | Quando `"1"`, abre diretamente a comparação de perspectivas para a notícia indicada |
  | `q` | `string` | Opcional | Termo de busca contextual (`termoBusca` / título da notícia) |
  | `pais` | `string` | Opcional | Código ISO do país (`BR`, `US`, `IL`, etc.) |
  | `cont` | `string` | Opcional | Chave do continente (`sul`, `norte`, `europa`, `asia`, `africa`, `oceania`) |
  | `topico` | `string` | Opcional | Chave do tópico (`politica`, `economia`, `seguranca`, `tecnologia`, etc.) |

---

## 3. Especificação da Resposta (Backend -> Frontend & Worker)

### 3.1. Headers Obrigatórios
- `Content-Type: application/json; charset=utf-8`
- Em requisições com `_t` ou `refresh=1`: `Cache-Control: no-store, no-cache, must-revalidate`

### 3.2. Payload de Sucesso (HTTP 200)
```json
{
  "atualizadoEm": "2026-11-18T22:50:00.000Z",
  "dataEdicao": "18/11/2026",
  "total": 5,
  "fallback": false,
  "items": [
    {
      "relevancia": 1,
      "categoria": "Geopolítica & Global",
      "corEditoria": "#388bfd",
      "fonte": "BBC News Brasil",
      "fontesAgrupadas": ["BBC News Brasil", "g1 Política"],
      "dominio": "bbc.com",
      "pais": "Global",
      "codigoPais": "BR",
      "bandeiraEmoji": "🌍",
      "continente": "europa",
      "tipoNoticia": "politica",
      "paginaTematica": "/geopolitica",
      "labelTematica": "Geopolítica",
      "titulo": "Título limpo da notícia",
      "resumo": "Resumo limpo sem créditos fotográficos (ex: sem 'Marcello Casal Jr/Agência Brasil') e truncado em palavra inteira…",
      "resumoCurto": "Resumo limpo sem créditos fotográficos (ex: sem 'Marcello Casal Jr/Agência Brasil') e truncado em palavra inteira…",
      "url": "https://www.bbc.com/portuguese/articles/...",
      "urlMateriaOriginal": "https://www.bbc.com/portuguese/articles/...",
      "imagemUrl": "https://ichef.bbci.co.uk/news/...",
      "publicadoEm": "2026-11-18T21:15:00.000Z",
      "termoBusca": "Título ou palavras-chave para busca de perspectivas",
      "urlCompararSite": "https://www.rodandoomundo.com.br/resumo-do-dia?item=1&comparar=1&pais=BR&cont=europa&topico=politica&q=..."
    }
  ]
}
```

### 3.3. Regras de Negócio Obrigatórias no Backend (`functions/api/resumo.js` e `workers/resumo-diario/index.js`)
1. **Extração de Mini-Thumbnail (`imagemUrl`):**
   - Extrair do bloco `<item>` do RSS na seguinte ordem de prioridade:
     1. `<media:thumbnail ... url="https://..." />`
     2. `<media:content ... url="https://..." />`
     3. `<enclosure ... url="https://..." type="image/..." />`
     4. Primeiro `<img ... src="https://..." />` dentro de `<description>` ou `<content:encoded>`
   - Normalizar `http://` para `https://` em domínios conhecidos (`glbimg.com`, `bbci.co.uk`, `bbc.co.uk`) e retornar `null` se não houver URL válida de imagem.
2. **Limpeza de Créditos Fotográficos (`limparResumoEditorial`):**
   - Nos feeds do `g1`, o HTML bruto de `<description>` vem como `<img src="..." /><br />Crédito/Agência<br />Texto da notícia`.
   - Antes de converter `<br>` em espaço, remover tags `<img ...>` e descartar segmentos iniciais antes de `<br>` (ou no início do texto) que correspondam a créditos/legendas de imagem:
     - Padrões com barra de agência/veículo no início (ex.: `Marcello Casal Jr/Agência Brasil`, `Nome Sobrenome/Reuters`, `Reprodução/TV Globo`, `Divulgação/PF`, `Foto: ...`, `Crédito: ...`, `Imagem: ...`, `Arquivo/...`, `AP Photo/...`, `AFP/...`, `EFE/...`).
   - Se o texto restante começar pelo próprio crédito colado sem `<br>`, remover o prefixo de crédito via regex segura.
   - Truncar o resumo final em até ~195 caracteres **sem cortar palavras ao meio** (cortar no último espaço e adicionar `…`).
3. **Filtro Internacional no Slot `#1 Geopolítica & Global`:**
   - Para o feed `#1` (*BBC News Brasil*), avaliar os candidatos em 2 passadas:
     - **1ª passada (Preferência Internacional/Geopolítica):** Priorizar itens cujo país inferido seja internacional (`infoPais.explicitCountry === true && infoPais.codigoPais !== 'BR'`) OU que contenham palavras-chave de geopolítica/internacional (`guerra`, `onu`, `otan`, `eua`, `china`, `rússia`, `ucrânia`, `oriente médio`, `israel`, `irã`, `europa`, `união europeia`, `tarifas`, `diplomacia`, `fronteira`, `tratado`, `cúpula`, `g20`, `g7`, `brics`, `internacional`, `mundo`, `global`).
     - **2ª passada (Fallback):** Caso nenhum candidato inédito atenda ao critério internacional, aceitar o primeiro candidato inédito normal.
4. **Deduplicação Rigorosa com Agrupamento de Fontes (`fontesAgrupadas`):**
   - Normalizar títulos para comparação também comparando o **título-base antes de `:`** (e removendo trechos entre aspas no final, como `: 'Só quero por um ponto final nesta história'`), de modo que republicações da BBC no g1 sejam detectadas com 100% de precisão.
   - Quando um item candidato de um feed colidir (`mesmoAssunto === true`) com um item já selecionado em `noticias`:
     - Adicionar o nome da fonte atual (ex.: `"g1 Política"`) ao array `itemExistente.fontesAgrupadas` (evitando duplicatas no array) se ainda não estiver lá.
     - Se `itemExistente.imagemUrl` for `null` e o candidato duplicado possuir `imagemUrl` válida (muito comum quando a BBC não traz `<img>` no texto mas a republicação no g1 traz foto da matéria!), aproveitar `itemExistente.imagemUrl = cand.imagemUrl`.
     - Pular este candidato e testar o próximo `<item>` do feed atual para que todos os 5 slots (`#1` a `#5`) tenham notícias de assuntos distintos.
5. **Mapeamento de `corEditoria` e `bandeiraEmoji`:**
   - Cores por slot/categoria:
     - `#1 Geopolítica & Global`: `#388bfd`
     - `#2 Brasil · Política & Congresso`: `#2ea043`
     - `#3 Economia & Mercados`: `#d29922`
     - `#4 Segurança Internacional`: `#f85149`
     - `#5 Clima & Tecnologia`: `#a371f7`
   - `bandeiraEmoji`: converter `codigoPais` ISO-2 (ex.: `BR` -> `🇧🇷`, `US` -> `🇺🇸`) em Regional Indicator Symbols; quando a notícia for global sem país específico (`pais === 'Global'`), usar `🌍`.

---

## 4. Elementos DOM e Estados Visuais (Frontend & Template de E-mail)

### 4.1. Estrutura Visual do Card — Página `/resumo-do-dia` (`app.js` + `styles.css`)
- **Container Alvo:** `<ol class="resumo-dia-list">` dentro de `#resumo-do-dia`.
- **Card Individual (`<li class="resumo-dia-card" id="resumo-item-{idx}" style="--resumo-accent: {corEditoria}">`):**
  1. **Topo em 1 linha (`.resumo-card-header-line`):**
     - `.resumo-rank-badge`: `#1` a `#5`
     - `.resumo-card-top-tag`: Categoria (`Geopolítica & Global`, etc.) com cor/borda sutil `--resumo-accent`
     - `.resumo-country-chip`: Bandeira + País (`outletFlagImg(codigoPais, pais)` + nome do país ou `🌍 Global`) alinhado à direita na mesma linha.
  2. **Corpo com Mini-Thumbnail `64x64` à direita (`.resumo-card-main-row`):**
     - Coluna de texto (`.resumo-card-text-col`):
       - `<h3 class="resumo-item-title"><a ...>{titulo}</a></h3>`
       - `<p class="resumo-item-summary">{resumo}</p>`
     - Coluna de imagem (`.resumo-thumb-wrap`, renderizada apenas quando `item.imagemUrl` existir):
       - `<img class="resumo-thumb-64" src="{imagemUrl}" alt="" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentElement.style.display='none'">`
  3. **Rodapé sem quebras no mobile (`.resumo-card-footer-line`):**
     - Pílula de fonte(s) (`.resumo-sources-pill`):
       - Se `fontesAgrupadas.length > 1`: `Fontes: BBC News Brasil + g1 Política` (com destaque sutil de cobertura múltipla)
       - Caso contrário: `Fonte: {fonte}`
     - Grupo de ações compactas (`.resumo-actions-compact`):
       - Botão primário (`.btn-compare-primary`): `⚖️ Comparar perspectivas`
       - Link secundário (`.link-original-secondary`): `Ler original ↗`
       - Botões de ícone existentes (favoritar / compartilhar) preservados de forma limpa.

### 4.2. Deep-Link de `/resumo-do-dia?item=...&comparar=1` (`app.js`)
- Ao abrir a rota `/resumo-do-dia` (ou `/resumo`), **antes** de `history.replaceState` limpar a URL, capturar `window.location.search` (`URLSearchParams`):
  - Se `comparar=1`:
    - Identificar o item pelo parâmetro `item` (`1..5`, ou seja, `relevancia === Number(item)`) após carregar os dados do resumo (ou usar os parâmetros `q`, `pais`, `cont`, `topico` da query string).
    - Se o item tiver `comparacaoSlug`, abrir `showComparisonPage(item.comparacaoSlug)`.
    - Caso contrário, acionar `navigateToPerspectiveCoverage(cont, pais, topico, q)` para abrir imediatamente a comparação de perspectivas do tema no site.
  - Se houver `item=1..5` sem `comparar=1`:
    - Rolar suavemente até `#resumo-item-{Number(item) - 1}` e adicionar uma classe de destaque temporário (`.is-highlighted-card`).

### 4.3.Chaves de Cache Local (`localStorage`)
- `rom_resumo_items`, `rom_resumo_ts`, `rom_resumo_updated_at`, `rom_resumo_date` (limpar obrigatoriamente quando `atualizarResumoDoDiaAutomatico(true)` for chamado).
