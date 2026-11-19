# Contrato de Integração Full-Stack: BOT-DDG-NEWS

## 1. Contexto e Objetivo
- **ID da Tarefa:** `BOT-DDG-NEWS`
- **Resumo:** Integração do novo **Bot DuckDuckGo News (`ddgs` / `duckduckgo-search`)** na **Curadoria & Bot** e no **Radar Editorial** do Painel Admin (`/admin`), sem necessidade de chave de API externa.
- **Artefato produzido:** `data/noticias_ddg.json` gerado por `scripts/ddg_news_feeder.py`.

## 2. Endpoints Backend (`api/routes_v2.py`)

### 2.1. Status do Bot DuckDuckGo News
- **Endpoint:** `GET /v2/admin/bot/ddg/status`
- **Auth:** `Depends(verificar_admin_token)`
- **Response:**
```json
{
  "ok": true,
  "lib_disponivel": true,
  "motor": "ddgs",
  "arquivo": {
    "existe": true,
    "atualizadoEm": "2026-11-19T22:45:00Z",
    "idade_minutos": 2,
    "total_itens": 12,
    "fonteMotor": "DuckDuckGo News (ddgs)",
    "ultima_query": "varredura global",
    "amostra_itens": []
  }
}
```

### 2.2. Execução do Bot DuckDuckGo News
- **Endpoint:** `POST /v2/admin/bot/ddg/executar`
- **Auth:** `Depends(verificar_admin_token)`
- **Body:**
```json
{
  "query": null,
  "region": "br-pt",
  "timelimit": "d",
  "max_results": 8,
  "dry_run": false
}
```
- **Response:**
```json
{
  "ok": true,
  "status": "concluido",
  "job_nome": "bot_ddg_news_feeder",
  "duracao_ms": 1250,
  "dry_run": false,
  "total_itens": 12,
  "fonteMotor": "DuckDuckGo News (ddgs)",
  "atualizadoEm": "2026-11-19T22:45:00Z",
  "items": []
}
```

### 2.3. Radar Editorial (`GET /v2/admin/radar/feed`)
- Inclui itens de `data/noticias_ddg.json` com `origem: "ddg_news"`, `origem_ddg_news: true` e contador `contadores["ddg_news"]`.

## 3. Curadoria (`curadoria/agente/coletor.py` & `curadoria/pipeline.py`)
- `coletar_noticias_ddg_news(limite=15)` lê `data/noticias_ddg.json` e injeta no lote da curadoria antes da análise.
