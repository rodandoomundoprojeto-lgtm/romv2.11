# Prompt para o Agente: Correções de UI/UX e Lógica de Dados

Analise os problemas de UI/UX e lógica de dados descritos abaixo e aplique as correções no projeto. Para cada item, considere o impacto na experiência do usuário e corrija a causa raiz no código:

---

### 1. Botão de fallback do Google desproporcional ("Balão muito grande")
* **O problema:** Na tela de estado vazio (quando não há resultados), o botão `"Ver notícias sobre [assunto] no Google"` está renderizando em um formato de pílula gigante, ocupando uma área vertical desproporcional e com um ícone/seta quebrado ou mal dimensionado (um triângulo preto grande).
* **Por que corrigir:** Quebra completamente a hierarquia visual da página, empurra o rodapé para baixo e passa a impressão de erro de CSS/SVG não estilizado.
* **O que fazer:** Localize esse componente de botão de fallback e ajuste seu `padding`, `height`, `max-width` e o tamanho do ícone interno (`width`/`height` do SVG) para que ele tenha dimensões padrão de um botão CTA secundário.

---

### 2. Container de imagem vazio nos cards de notícias e investigação de imagens ausentes
* **O problema:** Quando uma notícia não possui imagem, o card continua reservando um espaço vertical enorme (um bloco vazio com um ícone/placeholder preto no meio) entre o título e o resumo. Além disso, aparentemente **nenhuma** matéria está carregando foto.
* **Por que corrigir:** Deixar um espaço vazio gigante polui o feed, exige rolagem desnecessária do usuário e destaca uma falha visual.
* **O que fazer:** 
  1. **Regra de layout:** Condicione a renderização do container de mídia (`<img>` / wrapper da imagem) para que ele **só exista no DOM se houver uma URL de imagem válida** (e trate o evento `onError` para ocultar o container caso a imagem falhe ao carregar). Se não houver foto, o texto do resumo deve subir logo abaixo do título.
  2. **Investigação:** Verifique o pipeline/scraper/API que busca as notícias para entender por que nenhuma matéria está vindo com imagem (ex: propriedade errada no JSON, bloqueio de CORS/hotlink, ou falta de fallback para `og:image`).

---

### 3. Botão "Ler matéria na íntegra" em conteúdos de vídeo
* **O problema:** Em cards onde a fonte é um canal de vídeo (ex: *Prof Ricardo Marcílio* / YouTube), o botão de ação principal ainda exibe o texto `"Ler matéria na íntegra"`.
* **Por que corrigir:** Gera inconsistência semântica e confunde o usuário, já que o link leva para um vídeo e não para um texto.
* **O que fazer:** Identifique no objeto da notícia se a fonte/link é um vídeo (ex: domínio do YouTube, tipo de mídia `video`, etc.). Nesses casos, altere dinamicamente o rótulo do botão para `"Assistir vídeo"` ou `"Ver vídeo"` (ou remova o texto "Ler matéria" conforme o padrão do componente).

---

### 4. Sugestões de busca e "Comparar cobertura" retornando zero resultados
* **O problema:** Tanto as tags de sugestão (ex: *Mercado de Trabalho*, *Bolsa de Valores*, *Atentado Polônia G20*) quanto o botão `"Comparar cobertura"` nos cards quase sempre levam a uma tela de `"Nenhum resultado encontrado neste período"`.
* **Por que corrigir:** Oferecer botões e sugestões clicáveis que levam a um beco sem saída frustra o leitor e destrói a confiança na ferramenta de busca.
* **O que fazer:** 
  1. **Sugestões:** Só exiba tags de sugestão e "Assuntos em alta" que tenham sido previamente validados ou gerados a partir de termos que **realmente possuem resultados** na base atual para aquele país/contexto.
  2. **Comparar cobertura:** Verifique a query enviada ao clicar em `"Comparar cobertura"`. Provavelmente ela está buscando pela frase exata do título ou usando filtros muito restritivos (como "Últimas 24 horas" ou filtro estrito de categoria). Torne a busca de comparação mais flexível (por palavras-chave principais, ampliando o período padrão para 7 ou 30 dias se necessário) e, se realmente não houver matérias relacionadas no banco, oculte o botão `"Comparar cobertura"` naquele card em vez de deixar o usuário clicar para ver um erro.

---

### 5. Sobreposição de controles no Mobile (Legenda e Linhas vs. Radar de Notícias)
* **O problema:** Na visualização mobile (telas menores), os botões/opções de **Legenda** e **Colocar linhas** ficam escondidos atrás do componente/painel do **Radar de Notícias**.
* **Por que corrigir:** Torna essas funcionalidades inacessíveis no celular, prejudicando a navegação e usabilidade mobile.
* **O que fazer:** Revise o posicionamento (`position: fixed/absolute`), o espaçamento inferior/superior (`margin`/`padding`) e a hierarquia de `z-index` entre os controles do mapa/gráfico (Legenda e Linhas) e o painel do Radar de Notícias em viewports mobile (`@media (max-width: 768px)`), garantindo que ambos fiquem visíveis e clicáveis sem sobreposição.