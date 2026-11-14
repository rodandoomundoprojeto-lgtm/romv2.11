# Contrato de Dados e Roteamento: BUG-ROTAS-DOMINIO

## 1. Escopo e Diagnóstico
1. **Domínio Canônico Ativo (`https://www.rodandoomundo.com.br`):**
   - O subdomínio `www.rodandoomundo.com.br` possui CNAME para `rodandoomundo.pages.dev` na Hostinger, enquanto `rodandoomundo.com.br` (sem `www`) não possui registro DNS `A`/`CNAME` ativo.
   - Todas as referências de URL de produção em `app.js` (`PRODUCTION_DOMAIN`, fallbacks de fetch da API, links de newsletter), `functions/api/newsletter-subscribe.js`, `functions/api/resumo.js`, `workers/newsletter-cron/index.js`, `index.html`, `200.html`, `sobre.html`, `sitemap.xml` e `robots.txt` devem utilizar `https://www.rodandoomundo.com.br`.
2. **Redirecionamento e Recuperação de Rotas Internas (Cloudflare Pages + SPA):**
   - `_redirects`: Adicionar redirecionamento de `https://rodandoomundo.com.br/*` para `https://www.rodandoomundo.com.br/:splat 301!` (para quando o registro DNS raiz for apontado no Cloudflare) e manter `/* /index.html 200`.
   - `404.html`: Ao recuperar rotas dinâmicas no Cloudflare Pages, redirecionar para `/#/` + rota limpa (`window.location.replace('/#/' + p.replace(/^\/+/, '') + ...)`), garantindo que `parseRoute` no `app.js` sempre identifique como rota SPA (`hash.indexOf('#/') === 0`) e nunca confunda com âncora de rolagem (`#resumo-do-dia`).
   - Sincronizar todos os arquivos `index.html` das subpastas de rotas estáticas (`resumo-do-dia/index.html`, `temas/index.html`, `radar/index.html`, `ultimas-noticias/index.html`, `cadastrar-veiculo/index.html`, `metodologia/index.html`, `parcerias/index.html`, `aplicacao-parceiros/index.html`, `privacidade/index.html`, `termos/index.html`, `clima/index.html`, `cultura/index.html`, `eleicoes/index.html`, `esportes/index.html`, `guerra-ucrania/index.html`, `saude/index.html`, `tecnologia/index.html`, `economia/brasil/index.html`, `politica/brasil/index.html`, `politica/estados-unidos/index.html`, `entenda/**/index.html`) e criar `entenda/index.html`, `clube/index.html` e `comparar/index.html` com a estrutura atualizada do `index.html` V2.12.

## 2. Fronteiras de Agentes
- **`backend-logic`**: Atualiza `functions/api/newsletter-subscribe.js`, `functions/api/resumo.js`, `workers/newsletter-cron/index.js` e `_redirects`.
- **`frontend-ui`**: Atualiza `app.js`, `index.html`, `200.html`, `404.html`, `sobre.html`, `sobre/index.html`, `sitemap.xml`, `robots.txt` e sincroniza os `index.html` das subpastas de rotas estáticas.
- **`qa-integrator`**: Executa auditoria cruzada (`qa_check.ps1`), validação de sintaxe e paridade `index.html` / `200.html`.
