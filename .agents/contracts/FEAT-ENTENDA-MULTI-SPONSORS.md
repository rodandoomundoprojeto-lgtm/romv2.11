# Contrato de Integração: FEAT-ENTENDA-MULTI-SPONSORS (Carrossel Multi-Patrocinadores em Entenda o Assunto)

- **ID da Tarefa:** `FEAT-ENTENDA-MULTI-SPONSORS`
- **Data:** 2026-11-22
- **Escopo:** Frontend / UI (`app.js`, `styles.css`)
- **Objetivo:** Permitir que múltiplos patrocinadores ativos na Cota 04 (ou atribuídos ao Entenda) sejam exibidos na seção "Entenda o assunto" através de um carrossel dinâmico com rotação automática suave a cada 6 segundos, pausa ao passar o mouse (`pause-on-hover`), e indicadores de navegação manual por bolinhas (*dots*).

## 1. Regras de Seleção de Patrocinadores para o Entenda
1. `selectContextualSponsorsList(listDrawer, countryCode, fallbackCode)`:
   - Se `countryCode` for informado (guia didático específico com país):
     - Patrocinadores específicos para o país informado.
     - Patrocinadores com fallback ou globais (`todos`).
   - Se `countryCode` for vazio (Hub geral `/entenda`):
     - Todos os patrocinadores ativos de `listDrawer` são elegíveis (com ordenação: globais `todos` / `BR` primeiro, seguidos dos demais ativos).
   - Retorna um array `Array<CotaPatrocinioItem>`. Se vazio, retorna `[]`.

## 2. Especificação do Componente Carrossel no DOM
- Container: `.sponsor-slot-entenda` (tanto `#slot-sponsor-entenda-hub` quanto `#slot-sponsor-entenda-guide`).
- Se `sponsors.length === 0`:
  - `slot.hidden = true`.
- Se `sponsors.length === 1`:
  - Renderização direta estática (sem dots, sem timer de rotação).
  - `slot.hidden = false`.
- Se `sponsors.length > 1`:
  - Container `.sponsor-carousel-track` com `.sponsor-carousel-slide` para cada patrocinador.
  - O slide ativo recebe a classe `.active`.
  - Navegador inferior `.sponsor-carousel-dots` contendo botões `.sponsor-dot` (`aria-label="Ir para patrocinador X"`), com a classe `.active` no dot atual.
  - Timer de rotação a cada 6000ms com transição CSS suave de opacidade (`opacity: 0 -> 1`).
  - Eventos de mouse: `mouseenter` pausa a rotação; `mouseleave` retoma a rotação.
  - Eventos de touch/foco: interação direta pausa a rotação e permite trocar o slide clicando no dot.
  - Limpeza de timer anterior ao re-renderizar para evitar memory leak ou timers fantasmas.

## 3. Conformidade com GEMINI.md
- Validação de sintaxe com `node -c app.js`.
- Manter acessibilidade (`aria-label`, `button[type="button"]`, contraste e suporte aos temas escuro e claro).
