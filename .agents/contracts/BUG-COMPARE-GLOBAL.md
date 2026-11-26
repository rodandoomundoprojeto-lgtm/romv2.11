# Contrato de Integração Full-Stack: BUG-COMPARE-GLOBAL

> **Regra 8 (`GEMINI.md`):** Contrato de Dados oficial (Contract-First) para correção universal do fluxo **"Comparar cobertura"** em todos os 190+ países e em todos os veículos cadastrados (multilíngues, bilíngues, latinos e não-latinos).

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `BUG-COMPARE-GLOBAL`
- **Resumo:** Garantir que ao clicar em **"⚖️ Comparar cobertura"** (em Notícias Quentes de qualquer país, Resumo do Dia, Radar ou busca manual) o sistema extraia corretamente o núcleo semântico da notícia (preservando substantivos compostos/hifenizados e descartando verbos auxiliares vazios), traduza com contexto completo para **todos os idiomas reais dos veículos daquele país** (incluindo países com imprensa mista em idioma nativo + inglês/francês/árabe/etc.), expanda sinônimos jornalísticos universais e aplique filtragem estrita de relevância sem vazar matérias antigas ou não relacionadas.
- **Arquivos Alvo (Backend):**
  - `functions/api/busca-assunto.js`
  - `functions/api/noticias-quentes.js`
  - `data/data.js` (auditoria/ajuste de `lang` onde aplicável sem quebrar compatibilidade)
- **Arquivos Alvo (Frontend):**
  - `app.js`

---

## 2. Especificação da Requisição (Frontend -> Backend)
- **Endpoint:** `/api/busca-assunto`
- **Método HTTP:** `POST` (com suporte preservado a `GET`)
- **Query Params:**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `_t` | `number` | Sim em Refresh / Comparar | Timestamp (`Date.now()`) para cache-busting (Regra 7) |
- **Body JSON (`POST`):**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `q` | `string` | Sim | Núcleo factual extraído (até 4 termos substantivos, preservando compostos hifenizados como `caminhão-tanque`, `cessar-fogo`, `primeiro-ministro`) |
  | `headlineContext` | `string` | Não | Manchete completa original (ex.: `"Caminhão-tanque pega fogo e deixa ao menos 30 mortos no Egito"`), usada no backend exclusivamente para tradução neural contextual precisa e extração de entidades/sinônimos locais |
  | `fromHotCompare` | `boolean` | Não | `true` quando disparado pelo botão "Comparar cobertura" de uma notícia quente/recente (restringe ampliação automática de período a no máximo `7d`/`30d`, nunca `all` de anos anteriores) |
  | `cont` | `string` | Não | Continente atual |
  | `country` | `string` | Não | Código ISO Alpha-2 do país (ex.: `EG`, `JP`, `DE`, `IL`, `IN`, `BR`, `US`) |
  | `countryName` | `string` | Não | Nome do país |
  | `topic` | `string` | Não | Chave do tópico |
  | `topicTerm` | `string` | Não | Rótulo do tópico |
  | `periodo` | `string` | Não | `24h`, `7d`, `30d` ou `all` |
  | `lang` | `string` | Não | Idioma primário enviado pelo cliente |
  | `outlets` | `array` | Não | Lista de veículos ativos `{ n, u, d, lang? }` |
  | `termosTurbinados` | `array` | Não | Termos auxiliares opcionais |

---

## 3. Regras de Negócio Obrigatórias — Frontend (`app.js`)

1. **Extração Semântica Universal (`extrairTermoAssuntoBusca` & `extrairTermoHotParaPais`):**
   - **Preservação de compostos hifenizados:** NÃO substituir hífens internos entre letras (`\p{L}-\p{L}`, ex.: `caminhão-tanque`, `cessar-fogo`, `primeiro-ministro`, `porta-aviões`, `vice-presidente`, `meio-ambiente`, `Al-Ahram`, `El-Sisi`) por espaço durante a tokenização; mantê-los como **1 único token coeso**.
   - **Stopwords de verbos de manchete e quantificadores:** Incluir na lista `ignorar` todos os verbos auxiliares/jornalísticos genéricos e quantificadores vazios (`pega`, `pegou`, `deixa`, `deixou`, `deixam`, `faz`, `fez`, `fica`, `ficou`, `leva`, `levou`, `causa`, `causou`, `provoca`, `provocou`, `registra`, `registrou`, `atinge`, `atingiu`, `sobe`, `cai`, `chega`, `chegou`, `passa`, `vira`, `entra`, `sai`, `segue`, `pode`, `podem`, `deve`, `devem`, `vai`, `vao`, `foi`, `foram`, `esta`, `estao`, `tem`, `teve`, `diz`, `disse`, `dizem`, `afirma`, `afirmou`, `anuncia`, `anunciou`, `aponta`, `mostra`, `revela`, `pede`, `cobra`, `veja`, `saiba`, `entenda`, `menos`, `mais`, `quase`, `cerca`, `pelo`, `pelos`, `pela`, `pelas`, `apos`, `antes`, `durante`, `contra`, `sobre`, `entre`, `hoje`, `ontem`, `agora`, `novo`, `nova`).
   - **Orçamento de até 4 conceitos factuais:** Permitir até **4 tokens substantivos** (`significativos.slice(0, 4)`) para nunca amputar o evento central (ex.: `"Caminhão-tanque pega fogo e deixa ao menos 30 mortos no Egito"` -> **`"Caminhão-tanque fogo mortos"`**).
2. **Envio de `headlineContext` e `fromHotCompare`:**
   - No card `.panel-hot-news-banner` (`renderCountry`), armazenar no botão `.panel-hot-compare-btn` tanto `data-hot-compare-term="<hotTerm>"` quanto `data-hot-headline="<hotTitle>"`.
   - No clique, passar `{ initialPeriod: '7d', ignoreTopic: true, fromHotCompareBtn: true, headlineContext: hotHeadline }` para `executeTopicSearch`.
   - Incluir `headlineContext` e `fromHotCompare: !!opts.fromHotCompareBtn` no JSON enviado a `POST /api/busca-assunto` (e usar no `clientSideRssFallback` caso ocorra erro de rede).
3. **Remoção do Fallback Destrutivo de Palavra Única Genérica e `all` em Hot Compare:**
   - Quando `opts.fromHotCompareBtn` for `true`, **NÃO ampliar automaticamente para `all`** (evitando puxar artigos de 2009–2024 para uma notícia quente de hoje; limitar a janela a `7d` ou no máximo `30d`).
   - Remover a redução cega para apenas `capWord` (1ª palavra com inicial maiúscula da manchete, ex.: `"Caminhão"`), que gerava falsos positivos genéricos em qualquer país. Se houver redução de fallback, manter no mínimo **2 tokens factuais** (salvo quando toda a consulta original do usuário já era de 1 palavra/entidade própria).
4. **Tradução e Matching no `clientSideRssFallback`:**
   - Se `headlineContext` estiver disponível, traduzir a frase completa para extrair os tokens no idioma do veículo, preservando compostos e exigindo match lexical real (números isolados nunca validam um artigo sozinhos).

---

## 4. Regras de Negócio Obrigatórias — Backend (`functions/api/busca-assunto.js`, `functions/api/noticias-quentes.js`, `data/data.js`)

1. **Roteamento Multilíngue Universal por País e por Veículo (`IDIOMAS_POR_PAIS` + `detectarIdiomasVeiculo`):**
   - **Sempre gerar tradução em Inglês (`qEn`):** Corrigir `precisaTraducaoEn` — sempre que a consulta (`q` / `headlineContext`) não estiver em inglês (inclusive quando `lang === 'pt'`!), gerar `qEn` em inglês, pois quase todos os países possuem veículos em inglês ou edições internacionais.
   - **Mapa universal de idiomas jornalísticos por país (`IDIOMAS_OFICIAIS_POR_PAIS`):** Mapear países bilíngues/multilíngues e não-latinos para todos os idiomas reais da imprensa local (ex.: Mundo Árabe `EG, SA, AE, QA, MA, DZ, TN, LB, IQ, JO, KW, OM, BH, YE, PS, SD, LY` -> `['ar', 'en']` / `+ 'fr'` no Magrebe/Líbano; `IL` -> `['he', 'en', 'ar']`; `IN` -> `['en', 'hi']`; `PK` -> `['en', 'ur']`; `BD` -> `['en', 'bn']`; `CH` -> `['de', 'fr', 'it', 'en']`; `BE` -> `['fr', 'nl', 'en']`; `CA` -> `['en', 'fr']`; `UA` -> `['uk', 'en', 'ru']`; `BY, KZ` -> `['ru', 'en']`; `CN` -> `['zh-CN', 'en']`; `HK, TW` -> `['zh-TW', 'en']`; `SG, MY` -> `['en', 'zh-CN', 'ms']`; `PH` -> `['en', 'tl']`; `ZA` -> `['en', 'af']`; além do idioma primário de `LOCALE_POR_PAIS` para todos os demais países como `JP->ja`, `KR->ko`, `DE->de`, `FR->fr`, `IT->it`, `RU->ru`, `TR->tr`, `IR->fa`, `GR->el`, `TH->th`, `VN->vi`, `ID->id`, `PL->pl`, `NL->nl`, `SE->sv`, `NO->no`, `DK->da`, `FI->fi`, `CZ->cs`, `HU->hu`, `RO->ro`, etc.).
   - **Detecção precisa de idioma por veículo (`ehVeiculoEmIngles` / `obterIdiomasVeiculo`):**
     - Reconhecer veículos em inglês por subdomínio/caminho de URL (`^english\.`, `^en\.`, `/en(/|$)`, `/english(/|$)`, `-english`) e por marcadores de nome (`Ahram Online`, `Daily News`, `Independent`, `Times`, `Herald`, `Post`, `Guardian`, `Telegraph`, `Chronicle`, `Tribune`, `Gazette`, `Standard`, `Monitor`, `Observer`, `Mirror`, `Express`, `NHK World`, `DW`, `France 24`, `Kyiv Independent`, `Moscow Times`, `SCMP`, `CNA`, `Middle East Eye`, `Al Jazeera` etc., sem confundir com francês/espanhol como `Le Monde`, `Le Temps`, `El Mundo`, `El Tiempo`).
     - Para veículos locais em idioma nativo não-inglês (ex.: `Youm7`, `Al-Masry Al-Youm` em `ar`; `Yomiuri`, `Asahi` em `ja`; `Der Spiegel` em `de`; `Ynet` em `he`), consultar RSS com a query traduzida no **idioma nativo (`qNativo`)** e locale nativo (`hl`/`gl`/`ceid`).
     - Para veículos em inglês num país não-anglófono (ex.: `Ahram Online`, `Daily News Egypt`, `Japan Times`, `Korea Herald`, `Hurriyet Daily News`), consultar RSS com **`qEn`** e locale compatível em inglês (`hl=en`).
     - Para veículos bilíngues ou ambíguos (ex.: `madamasr.com`), aceitar/consultar tanto `qEn` quanto `qNativo`.
2. **Tradução Contextual via `headlineContext` + Sinônimos Jornalísticos Universais:**
   - Se `headlineContext` for enviado, traduzir também a frase completa (desacoplada do nome do país) para `en` e para o(s) idioma(s) nativo(s) do país, extraindo os substantivos/verbos de evento reais gerados pela tradução contextual (ex.: `"Caminhão-tanque pega fogo e deixa ao menos 30 mortos"` -> EN produz `"fuel truck"` / `"tanker"` + `"fire"` / `"blaze"` + `"killed"` / `"dead"`; AR produz `"حريق"` + `"شاحنة"` / `"سيارة"` + `"وقود"` / `"بترولية"` + `"مصرع"` / `"قتلى"`).
   - Expandir vocabulário jornalístico universal em inglês/multilíngue para evitar perda por sinônimo estrito (`caminhão-tanque` / `tanker truck` <-> `fuel truck`, `fuel tanker`, `oil truck`; `fogo`/`incêndio` <-> `fire`, `blaze`, `flames`; `mortos`/`vítimas` <-> `killed`, `dead`, `deaths`, `casualties`; `acidente`/`colisão` <-> `crash`, `accident`, `collision`, `overturns`; `cessar-fogo` <-> `ceasefire`, `truce`; `terremoto` <-> `earthquake`, `quake`; `enchente` <-> `flood`, `flooding`; `juros` <-> `interest rates`; `tarifas` <-> `tariffs`; `greve` <-> `strike`; `reféns` <-> `hostages`; `ataque`/`mísseis` <-> `attack`, `strike`, `missiles`, `drones`).
3. **Eliminação Total de Ruído / Bypass de Relevância (`PROIBIDO combinados = todosBrutos`):**
   - **Remover o bypass** em `buscarPorVeiculo` (`if (combinados.length === 0 && todosBrutos.length > 0) combinados = todosBrutos...`) e em `coletarPorPeriodo` (`poolPreferencial.length > 0 ? poolPreferencial : extras` sem filtro). **Nenhum artigo pode ser retornado ao usuário sem passar pelo filtro de relevância temática (`combinaQualquer` / `calcularRelevanciaArtigo`).**
   - **Números puros não validam artigos sozinhos:** Tokens exclusivamente numéricos (`30`, `2026`, `24`, `10`, `7`) **JAMAIS** contam como único token casado em `combinaComTermo` / `calcularRelevanciaArtigo` (impedindo que `"30 November"` ou `"30 listings"` validem matérias alheias). Números só somam bônus de score quando ao menos **1 conceito lexical substantivo** já casou.
   - **Proteção contra substantivo único polissêmico em eventos compostos:** Quando a consulta possui `>= 2` conceitos factuais distintos (ex.: `[veículo/entidade]` + `[incêndio/mortes]`), um único token polissêmico isolado (como apenas `"tanker"` sobre navios no Irã sem nenhum termo de `fire/blaze/crash/killed/truck/Giza/Egypt`, ou apenas `"market"`, `"president"`, `"minister"`, `"bank"`, `"police"`, `"world"`, `"state"`) **não** deve aprovar a matéria; exigir `>= 2` conceitos/sinônimos do evento (título + resumo) ou match de entidade nomeada específica/frase composta exata.
   - **Fallback relaxado coerente:** Em `extrairTermoCentralRelaxado`, nunca reduzir uma consulta de evento a 1 única palavra comum (`"Tanker"`). Manter par de conceitos (`entidade + evento` ou cláusula OR enxuta de 2 conceitos) e respeitar `fromHotCompare` (não escalar período para `all` de anos passados quando `fromHotCompare === true`).
4. **Extração em `functions/api/noticias-quentes.js` (`selecionarTermoBuscaPais`):**
   - Preservar palavras hifenizadas (`\p{L}-\p{L}`), filtrar verbos vazios (`pega`, `deixa`, `faz`, `fica`, `causa`, `sobe`, `cai`, etc.) e permitir até 4 palavras factuais para que `termoBusca` já venha limpo da API.

---

## 5. Critérios de Aceite (QA)
1. **Caso Egito (`EG`):** Clicar em "Comparar cobertura" para `"Caminhão-tanque pega fogo e deixa ao menos 30 mortos no Egito"` retorna matérias reais sobre o incêndio tanto em inglês (ex.: *Ahram Online*) quanto em árabe (ex.: *Youm7*, *Al-Masry Al-Youm*) e **zero** matérias alheias sobre Irã/Moçambique/Congo da *Daily News Egypt*.
2. **Caso Universal Multi-Países:** Testar consultas reais de notícias quentes em países de múltiplos idiomas e alfabetos (ex.: Japão `JP`, Alemanha `DE`, França `FR`, Índia `IN`, Israel `IL`, Estados Unidos `US`, Brasil `BR`) comprovando retorno pertinente nos veículos locais e zero vazamento de artigos antigos/sem relação.
3. **Integridade Geral:** `node -c` em todos os `.js` modificados + `qa_check.ps1` com `PASS`.
