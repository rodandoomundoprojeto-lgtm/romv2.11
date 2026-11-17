# Contrato de Integração Full-Stack: MK-COTAS-PARCERIAS

> **Instrução ao Orquestrador:** Preencha e salve uma cópia deste contrato em `.agents/contracts/MK-COTAS-PARCERIAS.md` **antes** de acionar os subagentes `backend-logic` e `frontend-ui` em tarefas que envolvam ambas as camadas.

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `MK-COTAS-PARCERIAS`
- **Resumo:** Solicitação de Mídia Kit via balão específico de cada cota (Founding Partner / Inteligência Setorial / Briefing Matinal / Território & Contexto) → modal de captura (`#parceria-lead-dialog`) com cota contextual → disparo do webhook (Make) com o campo `cota_selecionada` → time envia material específico + contrato por e-mail. Aproximadamente, atualização dos textos das cotas no catálogo B2B (`#parcerias-view`).
- **Arquivos Alvo (Backend):** Nenhuma rota/fonte alterada (webhook externo via Make permanece; payload ganha campo opcional).
- **Arquivos Alvo (Frontend):** `parcerias/index.html`, `aplicacao-parceiros/index.html`, `index.html`, `200.html`, `styles.css`, `app.js`.

---

## 2. Especificação da Requisição (Frontend -> Backend Proxy Netlify/Cloudflare)

### 2.1. Webhook de Lead — Parcerias (frontend -> Make)
- **Endpoint:** `WEBHOOK_URL` (Make, resolve via `resolveWebhookEndpoint()` no `app.js`)
- **Método HTTP:** `POST`
- **Headers:** `Content-Type: application/json`
- **Payload (aditivo — backward compatible):**
```json
{
  "nome": "string",
  "email": "string",
  "origem": "pagina-parcerias",
  "cota_selecionada": "string|null"
}
```
- **Regras de `cota_selecionada`:**
  - `cota_master` — Cota 01 — Founding Partner (Master)
  - `dossie_tematico` — Cota 02 — Inteligência Setorial (Dossiês)
  - `resumo_dia` — Cota 03 — Briefing Matinal (Resumo do Dia)
  - `gaveta_contextual` — Cota 04 — Território & Contexto (Geo)
  - `geral` — CTA geral "Solicitar Mídia Kit Completo" (sem cota específica)
- **Payload de erro:** `{ "ok": false, "error": "..." }` (via `enviarDadosFormulario`).

### 2.2. Endpoint de Leitura (não aplicável)
- N/A (sem endpoints de dados novos).

---

## 3. Especificação da Resposta (Backend -> Frontend)
- **N/A** (o backend não é consumido por esta tarefa; o webhook é outbound).

---

## 4. Elementos DOM e Estados Visuais (Frontend)
- **Container Alvo:** `#parcerias-view` (catálogo), `#parceria-lead-dialog` (modal), `#btn-solicitar-form-parceria` (CTA geral).
- **Botão por cota:** dentro de `.parceria-format-card`, atributo `data-open-parceria-modal="1"` + `data-cota="<KEY>"`; classes sugeridas: `btn btn-sm btn-primary parceria-cota-cta`.
- **Estado do modal:** título/subtítulo dinâmicos por `cota_selecionada` (fallback: texto padrão).
- **Estado Vazio / Erro:** validação nome/e-mail inalterada; status via `.bug-status`.
- **Chave de Cache Local:** N/A.

---

## 5. Regras de Navegação
- N/A.

---

## 6. Checklist de Consistência
- [ ] Paridade estrutural `index.html` <-> `200.html`.
- [ ] Nenhum backup solto fora de `_backups/`.
- [ ] Sintaxe Node.js válida (`node -c app.js`).
