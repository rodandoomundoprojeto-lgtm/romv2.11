# Rodando o Mundo (V2.12)

Site estático (HTML + CSS + JS puro), sem build e sem servidor. Funciona em qualquer hospedagem gratuita.

---

## 🌟 Novidades da Versão 2.12 (V2.12)

1. **Design Edge-to-Edge & Desmolduramento:**
   - Remoção de molduras confinantes no mapa: aproveitamento de 100% da largura útil da tela (viewport).
   - Substituição do painel flutuante por uma **Gaveta Lateral Contínua (Right Drawer)** no desktop e um **Bottom Sheet fluido** no mobile.
   - Navegação limpa no globo sem encobrir o centro do mapa durante a leitura.

2. **Modo Dual de Navegação (Mapa vs. Feed por País):**
   - Alternador rápido na barra superior: permite alternar com 1 clique entre o Globo/Mapa Interativo e uma interface em **Feed / Lista de Países**.
   - Campo de busca instantânea filtrando por nome do país, continente ou veículos.
   - Chips de atalho rápido para os países mais visitados (Brasil, EUA, Reino Unido, Japão, etc.).

3. **Redução da Barreira de Idioma & Transparência:**
   - Botão **[Traduzir 🌐]** integrado nos cards de veículos estrangeiros, abrindo a página traduzida para português via Google Tradutor em 1 clique.
   - Badges visuais explícitas de **Assinatura** (paywall) para veículos com paywall rígido ou cota limitada de artigos.

4. **Topbar Despoluída:**
   - Interface mais limpa e focada: Marca, Alternador de Modo, Pesquisa Instantânea, Favoritos e Alternador de Tema.

---

## Como publicar de graça

**GitHub Pages**
1. Crie um repositório e envie todos os arquivos desta pasta.
2. Em *Settings → Pages*, escolha a branch `main` e a pasta `/ (root)`.
3. O site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

**Netlify / Vercel / Cloudflare Pages**
Arraste esta pasta para o painel (Netlify Drop: https://app.netlify.com/drop) ou conecte o repositório. Não há comando de build; a pasta de publicação é a raiz.

Também abre direto no navegador (duplo clique em `index.html`).

## Estrutura
- `index.html` – página
- `styles.css` – estilos (modo claro e escuro)
- `app.js` – mapa e navegação
- `sobre.html` – página “Sobre o Rodando o Mundo”
- `noticias.js` – faixa automática de notícias
- `paypal-qr.png` – QR code de doação (PayPal)
- `data/data.js` – países e veículos (edite aqui para adicionar veículos)
- `data/world.js` – fronteiras (Natural Earth via world-atlas)
- `vendor/` – D3 e topojson-client

## Adicionar ou editar veículos
Em `data/data.js`, dentro de `media`, cada país (código ISO de 2 letras) tem:
```
"BR": { "lang": "pt", "outlets": [
  { "n": "Nome", "u": "https://site.com", "b": "E|I|D", "s": { "esportes": "https://site.com/esporte/" } }
]}
```
`b`: E = esquerda, I = imparcial, D = direita. Em `s` ficam os links diretos das seções
(politica, economia, esportes, saude, moda, tecnologia, cultura, mundo). Temas sem link direto
viram uma busca dentro do próprio site.

## Resumo do Dia Automático

O site atualiza automaticamente o **Resumo do Dia** a cada novo dia:
- `GET /api/resumo` — Netlify Function que agrega em tempo real as principais notícias dos feeds oficiais (BBC News, g1 Política, g1 Economia, g1 Mundo e Tecnologia) organizadas por relevância editorial (1 a 5).
- Responde com cache de borda de 24 horas (`s-maxage=43200`) para não sobrecarregar as fontes.
- No navegador, o script sincroniza a data local do leitor com o cache (`localStorage`), garantindo que o resumo sempre reflita as principais manchetes do início de cada dia.

## Pesquisa em tempo real por IA (Netlify)

A barra "Pesquisa em tempo real" chama funções serverless em `netlify/functions/`:

- `GET /api/pesquisa?q=termo&lang=pt` — usa o Netlify AI Gateway com o modelo `perplexity/sonar-pro`. Retorna resumo, notícias dos últimos 30 dias, citações e fontes. Notícias e citações cujo link não aparece nas fontes reais da busca são descartadas (nada inventado).
- `POST /api/traduzir` — traduz o resultado já exibido para outro idioma, sem sair da página.

## Faixa de notícias

A faixa usa a função `GET /api/noticias`, que agrega manchetes com imagem da Currents News API nas edições do Brasil, Estados Unidos, Reino Unido, México, Índia, Japão, África do Sul e Austrália. O país exibido indica a edição consultada; não necessariamente o local do acontecimento. A página verifica o feed a cada 10 minutos; o CDN da Netlify mantém o resultado em cache por 1 hora, para limitar o consumo a cerca de 192 chamadas por dia.

Para ativar no site publicado:

1. [Cadastre-se na Currents API](https://currentsapi.services/en/register) e obtenha uma chave de API.
2. Em **Netlify → Site configuration → Environment variables**, configure `CURRENTS_API_KEY` com a chave. A chave é lida somente pela função serverless e nunca deve ser colocada no HTML ou no JavaScript do navegador.
3. Publique novamente o site.

O plano gratuito da Currents permite até 250 chamadas por dia e uso comercial com atribuição ao serviço e link para a matéria original. O site já inclui a atribuição “Powered by Currents News API” e mantém o link do veículo em cada manchete. A imagem pode não estar disponível em todas as matérias; direitos sobre ela continuam sendo do editor original. Sem `CURRENTS_API_KEY`, a faixa mostra que aguarda configuração e não busca notícias.

Como ativar:

1. Publique a pasta na Netlify (arrastar a pasta em app.netlify.com/drop não inclui funções; use "Import from Git" ou `netlify deploy --prod`).
2. A conta precisa de um plano com créditos (o plano Free atual da Netlify inclui créditos). O AI Gateway só é ativado após o primeiro deploy de produção. Não é preciso chave de API: a Netlify injeta as variáveis automaticamente.
3. Opcional: variáveis `MODELO_PESQUISA` (padrão `perplexity/sonar-pro`) e `MODELO_TRADUCAO` (padrão `gpt-5-mini`).

Cache: resultados repetidos ficam 15 min no CDN da Netlify e no navegador. Limite: 8 pesquisas por minuto por visitante.

Em GitHub Pages, Cloudflare Pages estático ou outros hosts sem funções, o site funciona normalmente, mas a pesquisa por IA mostra a mensagem "indisponível".

## Clube de Membros (/clube)

O site conta com um Clube de Membros oficial estruturado em 2 níveis de apoio independente, sem anúncios invasivos:
- **🧭 Explorador (R$ 9,90/mês ou R$ 99/ano):** Acesso ao briefing quinzenal *Radar Global*, votação mensal de pautas, selo digital de apoiador e nome no Mural de Membros.
- **🌐 Correspondente (R$ 24,90/mês ou R$ 249/ano):** Todos os benefícios do Explorador mais acesso antecipado a novos dossiês temáticos, canal VIP no Telegram ("Sala de Situação") e fila prioritária de curadoria (48h).

A rota SPA `/clube` oferece alternador dinâmico de cobrança mensal/anual (com 2 meses grátis), chave PIX Copia e Cola oficial do favorecido Sávio Anderson Lourenço D. e formulário de adesão direta com registro de e-mail.
