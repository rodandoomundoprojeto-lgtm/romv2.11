# Plano de Refatoração: Substituição do Card "Destaque ao Vivo" pela Faixa "Pulsando Agora" + Comparação Direta

## Contexto e Problema

Atualmente, na página inicial (`/`), existe um card estático **"Destaque ao Vivo • Brasil em Foco"** posicionado entre os atalhos de continente e o título `"OU EXPLORE POR CONTINENTES NO MAPA:"`.
Ele apresenta três problemas principais:

1. **Quebra de expectativa:** O botão `"Comparar cobertura (X veículos)"` não leva para uma comparação real de manchetes/vieses sobre o tema anunciado.
2. **Inconsistência de dados:** O texto exibe `"31 veículos cobrindo"` enquanto o CTA exibe `"34 veículos"`.
3. **Poluição visual no mobile:** Ocupa muito espaço vertical logo abaixo do mapa e duplica o contexto de navegação por continentes.

## Objetivos da Implementação

1. Remover o card estático grande da Home e substituí-lo por um **carrossel horizontal compacto ("Pulsando Agora")** sincronizado com os países que possuem pulso âmbar no mapa.
2. Garantir **consistência numérica** (uma única fonte de verdade para a contagem de veículos).
3. Conectar o clique do destaque diretamente à **Comparação de Cobertura Editorial** (filtrada pelo País + Tema) ou, caso não haja agrupamento por espectro disponível, focar o país no mapa e abrir sua gaveta (`<aside>`) de veículos.

---

## Guia de Execução Multiagente e Seleção de Modelos

### Opção 1: Execução Automatizada (Recomendada)
* **Modelo:** `Orchestrator (Argon)`
* **Como usar:** Passe este arquivo (`plano_refatoracao_destaque_ao_vivo.md`) diretamente para o Orchestrator. Ele quebrará as subtarefas e coordenará as alterações de HTML, CSS e JS sem conflitos de arquivo.

### Opção 2: Divisão Manual por Camada (Sem conflito de arquivos)

| Agente | Responsabilidade | Etapas do Plano | Modelo Recomendado | Justificativa |
| :--- | :--- | :--- | :--- | :--- |
| **Agente 1 (Lógica & Dados)** | Unificar contagem de veículos, criar `getDestaquesPulsando()` e conectar o clique ao zoom do mapa + filtro de espectro. | Etapas 2, 3 e 4 | **`Gemini 4 Argon` (Medium)** *(ou `Claude Sonnet 5.5`)* | Alta precisão para rastrear o estado do mapa SVG e rotas sem quebrar o pulso de 5 min. |
| **Agente 2 (UI & Layout)** | Remover o card estático antigo, criar o container `#pulsando-agora-track` e aplicar CSS responsivo + dark mode. | Etapas 1 e 5 | **`Gemini 3.8 Flash` (Medium)** *(ou `Gemini 4 Hydrogen`)* | Rápido e econômico para estrutura HTML, `scroll-snap` horizontal e tokens de tema claro/escuro. |
| **Agente 3 (QA & Revisão)** | Validar cenários de fallback (*"Comparar cobertura"* vs *"Ver no mapa"*), mobile e consistência numérica. | Critérios de Aceite | **`Gemini 4 Argon` (Medium)** *(ou `Claude Opus 5.5`)* | Revisão crítica de edge cases e regressões visuais antes do deploy. |

### Prompts Prontos para Disparar os Agentes

* **Prompt para o Orchestrator (`Orchestrator (Argon)`):**
  > *"Leia o arquivo `plano_refatoracao_destaque_ao_vivo.md` e execute todas as etapas (1 a 5), garantindo o cumprimento de todos os critérios de aceite ao final."*

* **Prompt para o Agente 1 (`Gemini 4 Argon`):**
  > *"Leia `plano_refatoracao_destaque_ao_vivo.md` e execute apenas as Etapas 2, 3 e 4 (camada de dados, contagem única de veículos, renderização dinâmica e integração com o mapa SVG / Comparação de Cobertura Editorial). Não altere folhas de estilo CSS."*

* **Prompt para o Agente 2 (`Gemini 3.8 Flash`):**
  > *"Leia `plano_refatoracao_destaque_ao_vivo.md` e execute apenas as Etapas 1 e 5 (remover o card 'Brasil em Foco', inserir a estrutura HTML de `#pulsando-agora-track` e estilizar o carrossel horizontal mobile-first respeitando os temas claro e escuro do projeto)."*

---

## Tarefas para Execução no Código

### 1. Mapeamento e Limpeza (HTML / Templates)

* Localizar o componente/bloco HTML que renderiza `DESTAQUE AO VIVO` / `Brasil em Foco` (logo abaixo de `<nav aria-label="Atalhos rápidos por continente">`).
* Remover esse bloco estático e o título redundante `"OU EXPLORE POR CONTINENTES NO MAPA:"` caso ele esteja duplicando os botões de continente logo acima.
* Criar no mesmo espaço um container leve:

```html
<section class="pulsando-agora-container" aria-label="Países com notícias quentes agora">
  <div class="pulsando-agora-header">
    <span class="pulso-indicador" aria-hidden="true"></span>
    <span>Pulsando agora no mapa</span>
  </div>
  <div id="pulsando-agora-track" class="pulsando-agora-track" role="list">
    <!-- Renderizado dinamicamente via JS -->
  </div>
</section>
```

### 2. Sincronização de Dados e Contagem Única (JavaScript / State)

* Localizar a lógica que alimenta o status `"Pulso suave: países com notícias de última hora (atualizado a cada 5 min)"` e os dados do destaque atual.
* Criar uma função unificada `getDestaquesPulsando()` que retorna um array de objetos padronizados:

```js
{
  paisIso: 'BR',
  paisNome: 'Brasil',
  bandeira: '🇧🇷',
  temaTitulo: 'Congresso e Planalto buscam consenso sobre metas fiscais...',
  temaSlug: 'metas-fiscais-2026',
  veiculosCount: veiculosFiltrados.length, // Fonte única de verdade (elimina 31 vs 34)
  temComparacaoEspectro: Boolean(manchetesAgrupadas && manchetesAgrupadas.length >= 2),
  espectrosDisponiveis: ['Esquerda', 'Centro', 'Direita'] // dinâmico conforme veículos ativos
}
```

### 3. Renderização dos Mini-Cards e Fallback Inteligente

* Renderizar até 4–5 cards horizontais no `#pulsando-agora-track`:
  * **Cabeçalho do mini-card:** Bandeira + Nome do País + Badge com `veiculosCount` (`31 veículos`).
  * **Corpo:** Título curto do tema (máx. 2 linhas com `line-clamp: 2`).
  * **Rodapé / Ação explícita:**
    * Se `temComparacaoEspectro === true`: exibir pílulas de espectro (`Esquerda • Centro • Direita`) + link `"Comparar cobertura →"`.
    * Se `temComparacaoEspectro === false`: exibir `"Ver no mapa →"` (nunca prometer comparação se o destino não tiver comparação pronta).

### 4. Correção da Rota e Integração com Mapa / Comparação Editorial

* Ao clicar em um mini-card:
  1. **Sincronizar o mapa:** Chamar a função existente de seleção/zoom de país no SVG do mapa (`selecionarPais(item.paisIso)`), centralizando o país e destacando-o visualmente.
  2. **Direcionar para a visão prometida:**
     * Se `item.temComparacaoEspectro === true`: abrir/exibir a `<section aria-label="Comparação de Cobertura Editorial">` (removendo `hidden`), pré-filtrada por `paisIso` e `temaSlug`, exibindo as manchetes divididas por espectro editorial (*Esquerda*, *Imparcial / Centro*, *Direita*), e fazer scroll suave até ela (ou abrir dentro do `<aside>` lateral no desktop / bottom-sheet no mobile).
     * Se `item.temComparacaoEspectro === false`: abrir diretamente a gaveta `<aside>` do país mostrando os `veiculosCount` veículos e suas manchetes recentes.

### 5. Estilização Responsiva (CSS Mobile-First)

* Aplicar no `.pulsando-agora-track`:

```css
.pulsando-agora-track {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding: 0.5rem 1rem;
  scrollbar-width: none; /* Firefox */
}

.pulsando-agora-track::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.pulsando-card {
  min-width: 260px;
  max-width: 290px;
  scroll-snap-align: start;
}

@media (min-width: 768px) {
  .pulsando-agora-track {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    overflow-x: visible;
  }
  .pulsando-card {
    max-width: none;
  }
}
```

* Manter os tokens de cores atuais do projeto (fundo creme/bege claro, acentos em verde-petróleo `#0b5563` e suporte completo ao tema escuro).

## Critérios de Aceite (Checklist para o Agente)

* [ ] O card grande `"Brasil em Foco"` foi removido da primeira dobra no mobile.
* [ ] Não existe mais divergência numérica entre texto e botão (`31` vs `34`).
* [ ] Clicar em qualquer item da faixa `"Pulsando agora"` centraliza o país correspondente no mapa-múndi.
* [ ] O CTA `"Comparar cobertura"` só aparece quando há manchetes de diferentes espectros prontas para exibição e leva diretamente para essa visualização filtrada.
* [ ] O layout mantém total compatibilidade com o modo claro e escuro (botão Sol/Lua no header).