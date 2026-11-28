# Contrato de Integração Full-Stack: SUG-EMAIL-PROFISSIONAL

## 1. Contexto e Objetivo
- **ID da Tarefa:** `SUG-EMAIL-PROFISSIONAL`
- **Resumo:** Atualização do e-mail institucional oficial do site para `contato@rodandoomundo.com.br` no rodapé ("Contato: contato@rodandoomundo.com.br"), nos canais e fluxos de Parcerias (`/parcerias` e `/aplicacao-parceiros`), e nos endpoints/workers de envio e recebimento de e-mails (`functions/api/*`, `_worker.js`, `workers/resumo-diario/index.js`).
- **Arquivos Alvo (Backend):**
  - `functions/api/contato.js`
  - `functions/api/newsletter-subscribe.js`
  - `functions/api/teste-envio.js`
  - `workers/resumo-diario/index.js`
  - `_worker.js`
- **Arquivos Alvo (Frontend):**
  - `index.html`, `200.html`, `404.html`, `sobre.html`
  - `app.js`
  - Todas as páginas estáticas de rotas (`aplicacao-parceiros/index.html`, `parcerias/index.html`, `cadastrar-veiculo/index.html`, `clima/index.html`, `clube/index.html`, `comparar/index.html`, `cultura/index.html`, `dossies/index.html`, `economia/brasil/index.html`, `eleicoes/index.html`, `entenda/**/index.html`, `esportes/index.html`, `guerra-ucrania/index.html`, `metodologia/index.html`, `politica/**/index.html`, `privacidade/index.html`, `radar/index.html`, `resumo-do-dia/index.html`, `saude/index.html`, `sobre/index.html`, `tecnologia/index.html`, `temas/index.html`, `termos/index.html`, `ultimas-noticias/index.html`, `materiais-investidores/deck_investidores.html`)

---

## 2. Especificação de E-mail Institucional (Frontend & Backend)
- **Novo E-mail Oficial:** `contato@rodandoomundo.com.br`
- **Remetente Padrão (Resend `fromEmail`):** `Rodando o Mundo <contato@rodandoomundo.com.br>` (mantendo fallback de variável de ambiente `env.RESEND_FROM_EMAIL || 'Rodando o Mundo <contato@rodandoomundo.com.br>'`)
- **Destinatário Oficial de Contato/Parcerias (`destEmail`):** `contato@rodandoomundo.com.br`
- **Endpoint Fallback FormSubmit (`FB_ENDPOINT`):** `https://formsubmit.co/ajax/contato@rodandoomundo.com.br`

---

## 3. Especificação da Requisição e Resposta (`/api/contato`)
- **Endpoint:** `/api/contato`
- **Método HTTP:** `POST`
- **Payload de Sucesso (HTTP 200):**
```json
{
  "ok": true,
  "success": true,
  "canal": "resend_cloudflare"
}
```

---

## 4. Elementos DOM e Exibição Visual (Frontend)
- **Rodapé (`.footer-contact`):**
  `<div class="footer-contact"><a href="mailto:contato@rodandoomundo.com.br">Contato: contato@rodandoomundo.com.br</a></div>`
- **Aba Parcerias (`#parcerias-view` e `#aplicacao-parceiros-view`) e Modal (`#parceria-lead-dialog`):**
  - E-mail institucional de contato e confirmação exibido ao cliente/parceiro: `contato@rodandoomundo.com.br`
  - No modal `#parceria-lead-dialog` e na seção `#contato-parcerias` / `#aplicacao-parceiros-view`, exibir e utilizar `contato@rodandoomundo.com.br` como canal oficial de envio e atendimento de parcerias.
- **Paridade SPA:** `index.html` e `200.html` devem permanecer 100% idênticos (mesmo hash SHA-256).
