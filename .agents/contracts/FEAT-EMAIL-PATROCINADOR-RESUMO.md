# Contrato de Integração Full-Stack: FEAT-EMAIL-PATROCINADOR-RESUMO

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `FEAT-EMAIL-PATROCINADOR-RESUMO`
- **Resumo:** Exibir o(s) patrocinador(es) ativo(s) da **Cota 03 (`resumo_dia`)** nos e-mails do **Resumo do Dia** (tanto no disparo diário do Cloudflare Worker `workers/resumo-diario/index.js` quanto no e-mail de boas-vindas de `functions/api/newsletter-subscribe.js`), servindo imagens base64 por endpoint público HTTP (`GET /api/patrocinadores?media=...`), respeitando vigência de datas no fuso `America/Sao_Paulo`, e garantindo prevenção de links quebrados (`GEMINI.md` Regra 11).
- **Arquivos Alvo (Backend):**
  - `functions/api/patrocinadores.js`
  - `functions/api/newsletter-subscribe.js`
  - `workers/resumo-diario/index.js`
  - `data/patrocinadores.json`
  - `tests/e2e/test_resumo_email_sponsor.mjs`
- **Arquivos Alvo (Frontend):**
  - `admin/index.html`

---

## 2. Especificação da Requisição (Clientes de E-mail / Worker -> Backend)

### 2.1. Endpoint Público de Mídia de Patrocinador
- **Endpoint:** `/api/patrocinadores`
- **Método HTTP:** `GET`
- **Query Params:**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `media` | `string` | Sim (para mídia) | `logo` (usa `logo_url`) ou `nome_imagem` (usa `nome_imagem_url`) |
  | `cota` | `string` | Não | Chave da cota (ex.: `resumo_dia`, `cota_master`, `dossie_tematico`, `gaveta_contextual`). Se omitido, busca em todas as cotas. |
  | `id` | `string` | Não | ID do patrocinador (`item.id`) ou índice numérico na lista (`0`, `1`, ...). |
  | `v` | `string` | Não | Token opcional de cache-busting baseado em `atualizado_em`. |

### 2.2. Endpoint JSON de Patrocinadores (consumido pelo Worker)
- Ordem de consulta no Worker (`workers/resumo-diario/index.js`) com `cache: 'no-store'`, `Cache-Control: no-cache` e `?_t=${Date.now()}`:
  1. `https://www.rodandoomundo.com.br/api/patrocinadores?_t=${Date.now()}`
  2. `https://www.rodandoomundo.com.br/v2/patrocinadores?_t=${Date.now()}`
  3. `https://www.rodandoomundo.com.br/data/patrocinadores.json?_t=${Date.now()}`

---

## 3. Especificação da Resposta e Regras de Negócio

### 3.1. Resposta de Mídia (`?media=logo|nome_imagem`)
- **Quando `data:image/(png|jpeg|jpg|webp|gif|svg+xml);base64,...`:**
  - Bloquear SVG que contenha `<script` ou atributos `onload`/`onerror` após decode.
  - Decodificar base64 para `Uint8Array` e responder HTTP `200` com:
    - `Content-Type`: MIME da imagem (ex.: `image/png`)
    - `Cache-Control: public, max-age=900, s-maxage=900`
- **Quando URL `https://`, `http://` ou `/...`:**
  - Responder HTTP `302` redirect para a URL absoluta correspondente.
- **Quando não encontrado / inválido:**
  - Responder HTTP `404`.

### 3.2. Resposta JSON padrão (sem `media`)
- Mantém inalterado: `Content-Type: application/json; charset=utf-8` e `Cache-Control: no-store, no-cache, must-revalidate`.

### 3.3. Regra de Vigência (`isCotaEmVigenciaEmail(item, hojeYmd)`)
- `item && item.ativo === true`
- Ao menos um campo de marca preenchido: `(item.nome && item.nome.trim()) || (item.logo_url && item.logo_url.trim()) || (item.nome_imagem_url && item.nome_imagem_url.trim())`
- `hojeYmd` calculado no fuso `America/Sao_Paulo` (`YYYY-MM-DD`).
- Se `data_inicio` preenchido (`YYYY-MM-DD`) e `hojeYmd < data_inicio` -> inativo.
- Se `data_fim` preenchido (`YYYY-MM-DD`) e `hojeYmd > data_fim` -> inativo.

### 3.4. Regra de CTA / Prevenção de Links Quebrados (`resolverUrlCtaEmail(linkUrl)` — Regra 11 GEMINI.md)
- Se `linkUrl` iniciar com `https://` ou `http://` válido -> retorna `linkUrl.trim()`.
- Se `linkUrl` iniciar com `/` e corresponder a uma rota pública válida (`/`, `/resumo-do-dia`, `/parcerias`, `/radar`, `/dossies`, `/sobre`, `/clube`, `/entenda`, `/ultimas-noticias`, `/comparar`, `/economia`, `/geopolitica`, `/tecnologia`, `/clima`, `/cultura`, `/saude`, `/eleicoes`) -> retorna `https://www.rodandoomundo.com.br${linkUrl.trim()}`.
- Caso contrário (string vazia `""` ou rota inexistente) -> retorna `null`, e o template HTML **omite o botão de CTA clicável** (não gera `<a href=""` nem link quebrado), mantendo marca e frase institucional em texto puro/imagem.

### 3.5. Resolução de URL de Imagem para E-mail
- `https://...` -> própria URL.
- `http://...` -> convertida para `https://...`.
- `/...` -> `https://www.rodandoomundo.com.br${rawImgUrl}`.
- `data:image/...` -> `https://www.rodandoomundo.com.br/api/patrocinadores?media=${media}&cota=${cota}&id=${id}` (+ `&v=...` se houver `atualizado_em`).
- Nunca inserir `data:image/...` diretamente no `<img src>` do HTML de e-mail.

---

## 4. Layout do Card de Patrocinador no E-mail & Ajustes no Admin

### 4.1. Bloco HTML no E-mail (compatível com Gmail / Outlook / Apple Mail)
- Baseado em `<table>` e estilos inline:
  - Card com `background:#161b22;border:1px solid rgba(210,153,34,0.45);border-left:3px solid #d29922;border-radius:10px;padding:14px 18px;margin-bottom:18px;`
  - Eyebrow: `OFERECIMENTO` (`color:#d29922;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;`)
  - Marca: `<img src="..." width="36" height="36" ...>` quando houver `logo_url`, acompanhada de `nome_imagem_url` ou `<strong style="color:#f0f6fc;font-size:15px;font-weight:700;">${nome}</strong>`.
  - Frase institucional (`frase`), se houver.
  - Botão CTA (`cta_texto || 'Saiba mais'`) renderizado somente quando `ctaUrl !== null`.
- Posição:
  - Em `workers/resumo-diario/index.js`: logo após o cabeçalho (`Resumo do Dia • Edição de ${dataHoje}`) e imediatamente acima de `${cardsHtml}`.
  - Em `functions/api/newsletter-subscribe.js`: logo abaixo do parágrafo de confirmação e antes do botão `"Acessar o Resumo de Hoje"`.

### 4.2. Painel Admin (`admin/index.html`)
- Encoder de upload de imagens de cotas usa `canvas.toDataURL('image/png')` (com fallback para `image/jpeg`, 0.9 se `dataUri.length > 220000`) em vez de `image/webp`.
- Descrição da `resumo_dia` em `COTAS_META`: `'Oferecimento no topo do Resumo do Dia (site e e-mail matinal). Suporta co-patrocínio entre marcas.'`.
