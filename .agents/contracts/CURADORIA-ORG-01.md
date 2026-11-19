# Contrato de Integração Full-Stack: CURADORIA-ORG-01

## 1. Contexto e Objetivo
- **ID da Tarefa:** `CURADORIA-ORG-01`
- **Resumo:**
  1. Ao disparar o Bot DuckDuckGo News (`POST /v2/admin/bot/ddg/executar` com `dry_run=false`), além de atualizar `data/noticias_ddg.json`, enfileirar os itens coletados em `ai_eventos` com `status = 'aguardando_revisao'` (e `ai_conteudos_gerados` com `sintese_com_ressalvas` + fonte/URL) para que apareçam imediatamente na **Fila de eventos → Aguardando** para aprovação humana.
  2. Organizar a seção **Curadoria & Bot → Colunas Editoriais — aprovação humana** em abas separadas por status (`Rascunhos`, `Aprovados`, `Publicados`, `Rejeitados`, `Todas`) com contadores em tempo real e aba inicial em `Rascunhos` (sem misturar publicado/rascunho/rejeitado na mesma lista).
- **Arquivos Alvo (Backend):** `api/routes_v2.py`
- **Arquivos Alvo (Frontend):** `admin/index.html`

---

## 2. Especificação da Requisição (Frontend -> Backend)
- **Endpoint 1:** `/v2/admin/bot/ddg/executar`
- **Método HTTP:** `POST`
- **Body JSON:**
  ```json
  {
    "query": "string | null",
    "dry_run": false
  }
  ```

- **Endpoint 2:** `/v2/admin/eventos`
- **Método HTTP:** `GET`
- **Query Params:** `status` (`aguardando_revisao` | `publicado` | `arquivado` | `excluido`), `limite`

- **Endpoint 3:** `/v2/admin/colunas`
- **Método HTTP:** `GET`
- **Query Params:** `limite` (default `50` ou `100`), `status` (opcional)

---

## 3. Especificação da Resposta (Backend -> Frontend)

### 3.1. Headers Obrigatórios
- `Cache-Control: no-store, no-cache, must-revalidate` (via `aplicar_no_cache_headers(response)`).

### 3.2. Payload de Sucesso `POST /v2/admin/bot/ddg/executar` (HTTP 200)
```json
{
  "ok": true,
  "status": "concluido",
  "job_nome": "bot_ddg_news_feeder",
  "duracao_ms": 1400,
  "dry_run": false,
  "total_itens": 6,
  "eventos_enfileirados": 6,
  "fonteMotor": "DuckDuckGo News (ddgs)",
  "atualizadoEm": "2026-11-19T23:00:00Z",
  "ultimaQuery": "new start trump xi jipin",
  "items": []
}
```
- **Regras de persistência em `ai_eventos` (quando `not req.dry_run` e `conn` disponível):**
  - Slug determinístico por item: `ddg-<slug-limpo>-<hash8-url>` (prefixo `ddg-`, máx 200 chars).
  - `ON CONFLICT (slug) DO UPDATE` atualiza `titulo_evento`, `categoria`, `paises_envolvidos`, `urgencia_score`, `relevancia_score`, `updated_at`, **preservando** `ai_eventos.status` caso já exista (não regride `publicado`/`arquivado`/`excluido` para `aguardando_revisao`).
  - Novos registros entram com `status = 'aguardando_revisao'` e `nivel_confianca = 'media'`.
  - Insere versão inicial em `ai_conteudos_gerados` (se `event_id` ainda não tiver conteúdo) com `payload_json = {"sintese_com_ressalvas": "<resumo>\n\nFonte: <fonte> (<url>)", "fonte_url": "<url>", "fonte_nome": "<fonte>", "origem": "ddg_news"}`, `model_id = 'ddgs'`, `prompt_version = 'ddg_news_v1'`, `review_status = 'aguardando_revisao'`.

### 3.3. Contrato de UI (`admin/index.html`)
- **Colunas Editoriais (`#curadoria-colunas`):**
  - Adicionar `#colunas-tabs` (mesmo padrão `.admin-tabs` de `#eventos-tabs`) com abas:
    - `Rascunhos` (`data-col-status="rascunho"`, ativa por padrão, contador `#col-count-rascunho`)
    - `Aprovados` (`data-col-status="aprovado"`, contador `#col-count-aprovado`)
    - `Publicados` (`data-col-status="publicado"`, contador `#col-count-publicado`)
    - `Rejeitados` (`data-col-status="rejeitado"`, contador `#col-count-rejeitado`)
    - `Todas` (`data-col-status="all"`, contador `#col-count-all`)
  - Sincronizar `#col-status` (ou manter estado `state.colunaFiltro`) e `#kpi-colunas` (`data-goto-col-status`).
- **Bot DuckDuckGo (`#btn-rodar-ddg`):**
  - Após `POST /v2/admin/bot/ddg/executar`, atualizar `carregarEventos()` junto com `carregarStatusBotDdg()`, `carregarRadar()`, `carregarExecucoes()`.
  - Se `!dryRun` e `(res.eventos_enfileirados > 0 || res.total_itens > 0)`, ativar a aba `aguardando_revisao` em `#eventos-tabs` e recarregar `carregarEventos()` para exibir os itens coletados na Fila de eventos.
  - Exibir badge `🦆 DDG` na linha do evento em `#tbody-eventos` quando `String(ev.slug || '').startsWith('ddg-')`.
