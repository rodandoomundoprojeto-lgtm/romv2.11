# Contrato de Dados & Especificação: BUG-HOTNEWS-RADAR-LINK

## 1. Problema Identificado
No card de "Notícia Quente Agora" do painel lateral dos países (`panel-hot-news-banner`), o botão de ação principal exibia `"Ler matéria na íntegra ↗"` apontando para `/radar` quando a notícia não tinha link externo ou quando vinha via `paises_em_alta`, pois:
1. `functions/api/noticias-quentes.js` em `construirPaisesEmAlta` ignorava `item.fontes_urls` e forçava `url: item._rota_editoria || '/radar'`.
2. `app.js` fazia fallback cego para `'/radar'` em vez de preservar URLs externas reais ou indicar ausência de link externo.
3. `app.js` renderizava o botão `"Ler matéria na íntegra ↗"` incondicionalmente mesmo quando a URL era a rota interna `/radar`.

## 2. Decisão de Design e Comportamento
1. **Com link externo real (`http://` ou `https://`)**:
   - Botão: `"Ler matéria na íntegra ↗"` (ou `"Assistir vídeo ↗"` se for vídeo).
   - Ação: abre a matéria externa no veículo original (`target="_blank" rel="noopener noreferrer"`).
2. **Sem link externo, mas presente no Radar (`#curadoria`)**:
   - Botão: `"Ver no Radar ↗"`.
   - Ação: navegação suave interna via SPA (`data-spa-link` / `goSection('radar', { radarTab: 'curadoria' })`) para `/radar#curadoria`.
3. **Sem link externo e sem correspondência no Radar (`#curadoria`)**:
   - **Oculta o botão** completamente (não exibe botão de matéria).

## 3. Contrato de Dados da API Edge (`functions/api/noticias-quentes.js`)
Em `paises_em_alta`:
- `url`: deve ser a URL externa real de `item.fontes_urls[0]` ou `item.url` caso comece com `http://` ou `https://`. Se não houver URL externa, deve ser string vazia `""` ou rota interna explícita, nunca falsificada como link de matéria.
- `fontes_urls`: array de strings de URLs canônicas externas preservado.
- `slug`: string com o slug da notícia/tema preservado.
- `comparacaoSlug`: string ou null com o slug de comparação preservado.

## 4. Lógica no Cliente (`app.js`)
- Função auxiliar `verificarTemaExisteNaCuradoria(hotItem)`:
  - Checa se há correspondência com os temas ativos da Curadoria (`vitrine-ia`) via:
    1. Comparação de `slug` ou `comparacaoSlug`;
    2. Correspondência semântica de país e termos/palavras-chave com os temas ativos em cache/carregados (`lerCacheVitrineIA()`);
- No renderizador do card `panel-hot-news-banner`:
  - Se URL for externa válida (`/^https?:\/\//i.test(hotUrl)`): renderiza `"Ler matéria na íntegra ↗"` com `target="_blank"`.
  - Senão, se `verificarTemaExisteNaCuradoria(hotItem)` retornar true: renderiza `<a href="/radar#curadoria" class="btn btn-primary panel-hot-read-btn panel-hot-radar-spa-btn" data-spa-link>Ver no Radar ↗</a>`.
  - Senão: não renderiza botão de leitura/radar (oculto).
- Evento de clique para links SPA do banner garantir navegação para `/radar#curadoria`.
