# Contrato de Dados & Especificação: BUG-COMPARE-COBERTURA

## 1. Problema Identificado
1. Em `functions/api/noticias-quentes.js` (`construirPaisesEmAlta`) e `app.js`, `termoBusca` recebia cegamente `kws[0]` — que frequentemente era apenas o nome do país (ex: `"Chile"`).
2. Ao clicar em **"Comparar cobertura"** no card de Notícia Quente Agora, `executeTopicSearch` enviava o termo e, se a busca local nos jornais do país não retornava resultados imediatos, um fallback em `app.js` substituía silenciosamente a pesquisa pelo nome do país (`"Chile"`).
3. Pesquisas como `"PIB do Chile"`, `"inflação no Japão"` ou `"PIB na Alemanha"` falhavam nos veículos locais por múltiplos fatores:
   - O nome do país e preposições (`"do Chile"`, `"no Japão"`) eram enviados nas queries `site:<domínio>` e exigidos no título das manchetes locais;
   - `parseRssItems` não preservava `<source>` / `source url` do Google News RSS para casar domínios em `buscarArtigosAgregadosPais`;
   - `combinaComTermo`, `deduplicarEOrdenar` e `combinaTextoFuzzy` descartavam siglas curtas (`PIB`, `GDP`, `BIP`, `IA`, `AI`, `FED`) e caracteres não-latinos (`replace(/[^a-z0-9]/g, '')`).
4. Durante o carregamento, o UI exibia `"Buscando matérias sobre ... em ..."` e um banner prematuro com textos internos intermediários.

## 2. Contrato de Dados — `/api/noticias-quentes`
Em `paises_em_alta[]`:
- `termoBusca`: sempre gerado por `selecionarTermoBuscaPais(kws, titulo, nomePais, a2)` contendo apenas o núcleo factual curto (máx. 3 palavras, sem o nome do país/gentílicos/regiões genéricas, e sem verbos jornalísticos vazios). Só recorre a `nomePais` se não existir absolutamente nenhum termo factual nem nas keywords nem no título.
- `palavras_chave`: array de strings original preservado para extração contextual no cliente.

## 3. Contrato de Dados — `/api/busca-assunto`
- **Desacoplamento universal de país (`desacoplarPaisDaConsulta`)**: remove preposição + nome do país / gentílico / aliases locais antes de traduzir e montar queries RSS, mantendo trava de segurança para não esvaziar buscas cujo único termo seja o país.
- **Tradução + micro-dicionário universal (`DICIONARIO_SIGLAS_TERMOS`)**: traduz o termo já desacoplado do país para o idioma nativo (`lang`) e inglês (`en`), cobrindo siglas macroeconômicas e políticas (`PIB` -> `GDP`/`BIP`/`ВВП`/`الناتج المحلي الإجمالي`, `IA` -> `AI`/`KI`/`ИИ`, `Banco Central`, `inflação`, `eleições`, `juros`, `ONU`, `OTAN`, `FMI`, `BCE`).
- **Matching multilíngue Unicode (`\p{L}\p{N}`) e siglas curtas**:
  - `combinaComTermo`, `deduplicarEOrdenar` e `imagensPorTitulo` usam `\p{L}\p{N}` (preservando japonês, chinês, coreano, árabe, cirílico, grego, hebraico, etc.);
  - Tokens curtos (`<= 3` chars não-CJK) casam por fronteira exata de palavra (`palavrasAlvo.includes(tk)`); tokens CJK casam por substring;
  - Em consultas com `>= 2` tokens, ao menos 1 token substantivo não-país aceita a entrada para ranqueamento ponderado em `calcularRelevanciaArtigo` (usando termos locais, traduzidos, em inglês e originais).
- **`parseRssItems` & Agregados**: retorna `{ titulo, resumo, imagem, url, veiculo, sourceUrl, publicadoEm }` para que `coletarPorPeriodo` case domínios por `url` ou `sourceUrl` ou nome do veículo.
- **Remoção do Fallback 4**: `buscarPorVeiculo` não faz fallback com `site:${dom}` sem nenhum termo de pesquisa.

## 4. Comportamento no Cliente (`app.js`)
- **`state.searchFromHotCompare`**: controla que o clique em "Comparar cobertura" mantenha o formulário manual recolhido (`showFallbackOpen`) e oculte mensagens intermediárias (`fallbackLongNote`).
- **`extrairTermoHotParaPais(hotItem, countryName, a2)`**: extrai até 3 palavras factuais sem o nome do país nem verbos vazios (usando `palavras_chave`, `termoBusca` se não for apenas o país, e `title`).
- **Loading limpo (`renderTopicSearchResults`)**: durante `state.searchLoading === true`, omite `dynBanner` e exibe apenas o spinner + `<p>Comparando cobertura…</p>`.
- **Sem fallback para o nome do país**: remove a substituição automática do termo por `cName` em `executeTopicSearch`.
