# Contrato de Integração Full-Stack: ADMIN-ENTENDA-LOTE

## 1. Contexto e Objetivo
- **ID da Tarefa:** `ADMIN-ENTENDA-LOTE`
- **Resumo:**
  1. Adicionar seleção múltipla (checkboxes por linha + "selecionar todos" + barra de ações em lote `#bulk-bar-entenda`) na seção **Entenda o assunto** (`#admin-section-entenda` / `#tbody-entenda-artigos`) do painel administrativo (`admin/index.html`), permitindo publicar, despublicar (mover para rascunho), rejeitar ou excluir vários artigos simultaneamente.
  2. Corrigir o retorno de artigos excluídos em **Entenda o assunto** substituindo a exclusão física (`DELETE FROM`) por exclusão lógica (`status = 'excluido'`, `review_status = 'excluido'`) com proteção no `UPSERT` do pipeline editorial (`redacao_v2/orquestrador_editorial.py`) para que execuções automáticas ou em background não ressuscitem slugs excluídos, além de filtrar `'excluido'` na listagem e contagens do admin (`GET /v2/admin/colunas`) e sincronizar o espelho público `entenda_v2`.
- **Arquivos Alvo (Backend):**
  - `api/routes_v2.py`
  - `redacao_v2/orquestrador_editorial.py`
- **Arquivos Alvo (Frontend):**
  - `admin/index.html`

---

## 2. Especificação da Requisição (Frontend -> Backend)

### 2.1. Listagem de Artigos/Colunas
- **Endpoint:** `GET /v2/admin/colunas`
- **Query Params:**
  - `limite` (`int`, padrão 50, máx 200)
  - `status` (`string`, opcional)
  - `_t` (`number`, timestamp cache-busting adicionado por `apiFetch`)

### 2.2. Ação em Lote (Bulk)
- **Endpoint:** `POST /v2/admin/colunas/lote`
- **Body JSON:**
```json
{
  "slugs": ["slug-1", "slug-2"],
  "acao": "publicar" | "aprovar" | "rascunho" | "rejeitar" | "excluir"
}
```

### 2.3. Exclusão Individual
- **Endpoint:** `DELETE /v2/admin/colunas/{slug}`

---

## 3. Especificação da Resposta (Backend -> Frontend)

### 3.1. Headers Obrigatórios
- `Content-Type: application/json; charset=utf-8`
- `Cache-Control: no-store, no-cache, must-revalidate` (via `aplicar_no_cache_headers(response)`)

### 3.2. Payload de Sucesso — `GET /v2/admin/colunas` (HTTP 200)
- Deve **excluir** registros com `status = 'excluido'` ou `review_status = 'excluido'` tanto de `colunas` quanto de `contagens`.
```json
{
  "ok": true,
  "colunas": [
    {
      "slug": "string",
      "titulo": "string",
      "entenda_slug": "string|null",
      "entenda_titulo": "string|null",
      "categoria": "string",
      "status": "rascunho_auditado|aprovado|publicado|rejeitado",
      "review_status": "string",
      "created_at": "ISO-8601"
    }
  ],
  "contagens": {
    "rascunho_auditado": 0,
    "publicado": 0,
    "total": 0
  }
}
```

### 3.3. Payload de Sucesso — `POST /v2/admin/colunas/lote` (HTTP 200)
```json
{
  "ok": true,
  "acao": "excluir",
  "processados": 2,
  "slugs": ["slug-1", "slug-2"]
}
```

### 3.4. Regra de Não-Ressurreição (Backend)
- `DELETE /v2/admin/colunas/{slug}` e `POST /v2/admin/colunas/lote` (`acao == "excluir"`) realizam **soft-delete** (`status = 'excluido'`, `review_status = 'excluido'`, `published_at = NULL`, `updated_at = NOW()`) em `ai_colunas_editoriais` e `status = 'excluido', updated_at = NOW()` em `ai_entenda_o_assunto`, seguido de `_sincronizar_espelho_entenda_v2(db)`.
- Em `redacao_v2/orquestrador_editorial.py`, `UPSERT_COLUNA_EDITORIAL_SQL` e `UPSERT_ENTENDA_O_ASSUNTO_SQL` devem incluir cláusula `WHERE ... status IS DISTINCT FROM 'excluido'` no `ON CONFLICT (slug) DO UPDATE`, impedindo que qualquer execução automática ou em background sobrescreva um item excluído.

---

## 4. Elementos DOM e Estados Visuais (Frontend)
- **Seção Alvo:** `#admin-section-entenda`
- **Barra de Ações em Lote:** `#bulk-bar-entenda` (`.admin-bulk-bar`) com contador `#bulk-count-entenda`, botão `[data-bulk-clear="entenda"]` e botões `[data-bulk-group="entenda"][data-bulk-action="publicar|rascunho|rejeitar|excluir"]`.
- **Checkbox Geral (thead):** `#check-all-entenda` (`.admin-col-check`)
- **Tabela / Body:** `#tbody-entenda-artigos` (`colspan="7"` quando vazio)
- **Checkbox por Linha:** `<input type="checkbox" class="admin-bulk-check" data-bulk-group="entenda" data-bulk-key="${escapeHtml(c.slug)}" ... />`
- **Estado / Configuração JS:** `state.bulk.entenda = new Set()` e `BULK_CONFIG.entenda` apontando para `/v2/admin/colunas/lote` (`payloadKey: 'slugs'`, `bannerId: 'entenda-banner'`, `reload: () => carregarColunas()`).
- **Sincronização:** `renderEntendaArtigos(todas)` deve chamar `sincronizarBulkUI('entenda', lista.map((c) => String(c.slug)))`.
