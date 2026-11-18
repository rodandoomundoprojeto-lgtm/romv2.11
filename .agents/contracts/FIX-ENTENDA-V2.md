# Contrato de Integração Full-Stack: FIX-ENTENDA-V2

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `FIX-ENTENDA-V2`
- **Resumo:** Corrigir os modelos Gemini descontinuados (`404 NOT_FOUND` em `gemini-2.5-pro`/`gemini-2.5-flash`), implementar coleta direcionada por `tema_foco` e pareamento determinístico de slugs 1:1 entre `ai_colunas_editoriais` e `ai_entenda_o_assunto`, sincronizar publicação/exclusão e espelho `entenda_v2`, criar a Cloudflare Pages Function `/api/entenda-o-assunto`, e integrar a vitrine pública `/entenda` + detalhe `/entenda/{slug}` + UX completa no Painel Admin (`/admin`).
- **Arquivos Alvo (Backend):**
  - `redacao_v2/coletor_estudo.py`
  - `redacao_v2/orquestrador_editorial.py`
  - `redacao_v2/pulso_noticias_quentes.py`
  - `src/analyst.py`
  - `src/estado_db.py`
  - `api/routes_v2.py`
  - `functions/api/entenda-o-assunto.js` (novo)
  - `data/entenda_v2.json` (espelho estático gerado)
- **Arquivos Alvo (Frontend & Admin):**
  - `app.js`
  - `styles.css`
  - `index.html`, `200.html`, `entenda/index.html`
  - `admin/index.html`

---

## 2. Especificação dos Endpoints

### 2.1. `GET /v2/entenda-o-assunto` e `GET /api/entenda-o-assunto` (Listagem)
- **Query Params:**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `acao` | `string` | Não | `entenda` (default) ou `colunas` |
  | `categoria` | `string` | Não | Filtro opcional por editoria |
  | `limit` | `number` | Não | Máximo de itens (default 60) |
  | `_t` | `number` | Quando Refresh | Timestamp cache-busting |
  | `refresh` | `string` | Quando Refresh | `1` força bypass de cache |
- **Headers Obrigatórios:**
  - `Content-Type: application/json; charset=utf-8`
  - `Cache-Control: no-store, no-cache, must-revalidate` (em FastAPI sempre e em Cloudflare Function sempre que `_t`/`refresh=1` ou fallback).
- **Payload JSON (HTTP 200):**
```json
{
  "ok": true,
  "source": "database | v2_api | estado_db | entenda_snapshot | vitrine_snapshot",
  "identificacao_editorial": "Síntese Rodando o Mundo",
  "atualizado_em": "Atualizado às 20h30",
  "updatedAt": "2026-11-18T23:30:00Z",
  "total": 8,
  "artigos": [
    {
      "slug": "chokepoints-pontos-de-estrangulamento",
      "entenda_slug": "entenda-chokepoints-pontos-de-estrangulamento",
      "titulo": "Título do assunto",
      "titulo_coluna": "Título analítico",
      "subtitulo": "Linha fina",
      "pergunta_central": "Pergunta central",
      "resumo": "Resumo executivo",
      "contexto_historico": "Contexto histórico",
      "tese_central": "Tese central",
      "corpo_markdown": "## Seção\nTexto...",
      "categoria": "Geopolitica_Relacoes",
      "categoria_label": "Geopolítica & Relações",
      "paises_relacionados": ["BR"],
      "tags": ["geopolitica"],
      "tempo_leitura_min": 5,
      "impactos_praticos": [],
      "perguntas_frequentes": [],
      "fontes_referencia": [],
      "links_acervo_interno": [],
      "rota_editoria": "/entenda/chokepoints-pontos-de-estrangulamento",
      "analise_aprofundada": "Tese ou contexto",
      "palavras_chave": ["geopolitica"],
      "identificacao_editorial": "Síntese Rodando o Mundo",
      "atualizado_em": "Atualizado às 20h30",
      "published_at": "2026-11-18T23:30:00Z",
      "updated_at": "2026-11-18T23:30:00Z",
      "origem_v2": true
    }
  ],
  "colunas": ["...mesma lista de artigos para retrocompatibilidade..."]
}
```

### 2.2. `GET /v2/entenda-o-assunto/{slug}` e `GET /api/entenda-o-assunto?slug={slug}` (Detalhe)
- **Payload JSON (HTTP 200):**
```json
{
  "ok": true,
  "slug": "chokepoints-pontos-de-estrangulamento",
  "source": "database | v2_api | estado_db | entenda_snapshot",
  "identificacao_editorial": "Síntese Rodando o Mundo",
  "artigo": { "...item normalizado..." },
  "entenda_o_assunto": { "...bloco ai_entenda_o_assunto..." },
  "coluna_editorial": { "...bloco ai_colunas_editoriais..." },
  "painel_verificacao": { "...opcional ou null em fallback..." }
}
```
- **HTTP 404:** `{ "ok": false, "error": "not_found", "detail": "..." }` quando inexistente.

### 2.3. `GET /v2/admin/entenda/tendencias` (Admin Auth)
- **Query Params:** `country=BR`, `lang=pt`
- **Headers:** `Cache-Control: no-store, no-cache, must-revalidate`
- **Payload JSON (HTTP 200):**
```json
{
  "ok": true,
  "country": "BR",
  "lang": "pt",
  "topicos": [
    {
      "label": "Assunto em alta",
      "tema": "Assunto em alta",
      "volume": "50K+",
      "origem": "google_trends | noticias_quentes | google_news"
    }
  ]
}
```

---

## 3. Elementos DOM e Estados Visuais (Frontend & Admin)
- **Vitrine `/entenda` (`app.js` / `styles.css`):**
  - Container principal: `#entenda-o-assunto`
  - Botão atualizar: `#btn-refresh-entenda`
  - Carimbo de atualização: `#entenda-last-updated`
  - Seções internas: `.entenda-v2-section-label`, `.entenda-cards-grid`
- **Detalhe `/entenda/{slug}` (`app.js` / `styles.css`):**
  - Renderizado em `#thematic-hub-view`
  - Classes: `.entenda-page-container`, `.entenda-full-article`, `.entenda-v2-summary-box`, `.entenda-v2-markdown`, `.entenda-v2-impactos-grid`, `.entenda-v2-faq-item`, `.entenda-v2-sources-list`
- **Painel Admin (`admin/index.html`):**
  - Card gerador: `#admin-section-entenda`
  - Banner de feedback: `#entenda-banner`
  - Lista de tendências: `#entenda-assuntos-lista`
  - Tabela de artigos de Entenda o assunto: `#tbody-entenda-artigos`
  - Tabela de colunas em Curadoria & Bot: `#tbody-colunas` (mantida 100% sincronizada)
