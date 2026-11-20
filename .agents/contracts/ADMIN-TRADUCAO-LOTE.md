# Contrato de Integração Full-Stack: ADMIN-TRADUCAO-LOTE

## 1. Contexto e Objetivo
- **ID da Tarefa:** `ADMIN-TRADUCAO-LOTE`
- **Resumo:**
  1. Garantir que todas as notícias/eventos/colunas retornadas ao painel administrativo (`/admin`) venham traduzidas para Português (PT-BR), com cache em memória e tradução paralela para textos em outros idiomas.
  2. Adicionar seleção múltipla (checkbox por linha + selecionar todos) e barra de ações em lote nas 4 tabelas de curadoria/notícias do painel admin (`Notícias Quentes`, `Fila de Eventos`, `Colunas Editoriais` e `Radar Editorial`), suportando aprovar/publicar/ativar, descartar/rejeitar/desativar, arquivar e excluir em massa.
- **Arquivos Alvo (Backend):** `api/routes_v2.py`
- **Arquivos Alvo (Frontend):** `admin/index.html`

---

## 2. Tradução Automática PT-BR nas Rotas Admin (`GET`)

As rotas abaixo devem aplicar tradução automática para PT-BR nos campos textuais principais quando detectado texto fora de PT-BR (com cache em memória `_TRADUCAO_CACHE` e execução paralela via `ThreadPoolExecutor` usando `_traduzir_lote_rapido_pt`, preservando fallback seguro):
- `GET /v2/admin/radar/feed` (e `/v2/admin/radar`): campos `titulo`, `resumo`, `analise`.
- `GET /v2/admin/eventos`: campos `titulo_evento`, `sintese_com_ressalvas`.
- `GET /v2/admin/noticias-quentes`: campos `titulo_curto`, `resumo_pulso`, `impacto_pratico`.
- `GET /v2/admin/colunas`: campos `titulo`, `subtitulo`.

---

## 3. Endpoints de Ações em Lote (`POST`)

Todos os endpoints exigem `Depends(verificar_admin_token)` e aplicam `aplicar_no_cache_headers(response)` (`Cache-Control: no-store, no-cache, must-revalidate`).

### 3.1. Eventos em Lote
- **Endpoint:** `POST /v2/admin/eventos/lote`
- **Body JSON:**
  ```json
  {
    "ids": [101, 102],
    "acao": "publicar"
  }
  ```
  - `acao` aceita: `"publicar"` (`status='publicado'`), `"arquivar"` (`status='arquivado'`), `"restaurar"` (`status='aguardando_revisao'`), `"excluir"` (`status='excluido'`).
- **Resposta (HTTP 200):**
  ```json
  {
    "ok": true,
    "acao": "publicar",
    "processados": 2,
    "ids": [101, 102]
  }
  ```

### 3.2. Colunas Editoriais em Lote
- **Endpoint:** `POST /v2/admin/colunas/lote`
- **Body JSON:**
  ```json
  {
    "slugs": ["slug-1", "slug-2"],
    "acao": "aprovar"
  }
  ```
  - `acao` aceita: `"aprovar"`, `"publicar"`, `"rejeitar"`, `"rascunho"`, `"excluir"`.
  - Deve sincronizar `ai_entenda_o_assunto` e `_sincronizar_espelho_entenda_v2(db)` exatamente como nas rotas unitárias.
- **Resposta (HTTP 200):**
  ```json
  {
    "ok": true,
    "acao": "aprovar",
    "processados": 2,
    "slugs": ["slug-1", "slug-2"]
  }
  ```

### 3.3. Notícias Quentes em Lote
- **Endpoint:** `POST /v2/admin/noticias-quentes/lote`
- **Body JSON:**
  ```json
  {
    "slugs": ["slug-1", "slug-2"],
    "acao": "ativar"
  }
  ```
  - `acao` aceita: `"ativar"` (`status='ativo'`), `"desativar"` (`status='aguardando_revisao'`), `"arquivar"` (`status='arquivado'`), `"excluir"` (remove de `ai_noticias_quentes`).
- **Resposta (HTTP 200):**
  ```json
  {
    "ok": true,
    "acao": "ativar",
    "processados": 2,
    "slugs": ["slug-1", "slug-2"]
  }
  ```

### 3.4. Radar Editorial em Lote
- **Endpoint:** `POST /v2/admin/radar/feed/lote`
- **Body JSON:**
  ```json
  {
    "slugs": ["slug-1", "slug-2"],
    "acao": "excluir"
  }
  ```
  - `acao` aceita: `"fixar"`, `"desafixar"`, `"excluir"`.
- **Resposta (HTTP 200):**
  ```json
  {
    "ok": true,
    "acao": "excluir",
    "processados": 2,
    "slugs": ["slug-1", "slug-2"]
  }
  ```

---

## 4. Contrato de UI (`admin/index.html`)
- Cada tabela (`#tbody-noticias-quentes`, `#tbody-eventos`, `#tbody-colunas`, `#tbody-radar`) deve possuir:
  - Coluna inicial de checkbox (`th` com checkbox "selecionar todos os visíveis" e `td` com checkbox por item usando `data-bulk-key`).
  - Barra de ações em lote (`#bulk-bar-nq`, `#bulk-bar-ev`, `#bulk-bar-col`, `#bulk-bar-radar`) exibindo contador de selecionados, botão de limpar seleção e botões de ação:
    - **Notícias Quentes (`nq`):** `Ativar`, `Desativar (Descartar)`, `Arquivar`, `Excluir`
    - **Eventos (`ev`):** `Publicar (Aprovar)`, `Arquivar`, `Restaurar`, `Excluir`
    - **Colunas (`col`):** `Aprovar`, `Publicar`, `Rejeitar (Descartar)`, `Excluir`
    - **Radar (`radar`):** `Fixar no topo`, `Desafixar`, `Excluir`
- Confirmação via `confirm(...)` antes de `excluir` ou `rejeitar`/`desativar` em lote.
- Após execução com sucesso, limpar seleção, recarregar a respectiva lista e exibir feedback no banner/toast.
