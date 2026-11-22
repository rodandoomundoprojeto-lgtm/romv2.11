# Contrato de Dados: ADMIN-RADAR-DISPARO-CONTEXTUAL

## 1. Objetivo
Adicionar botões contextuais de disparo manual de coleta de Vídeos do YouTube e DuckDuckGo News diretamente nas respectivas abas da seção **Radar Editorial** (`admin/index.html`) e blindar a varredura geral do YouTube (`scripts/youtube_feeder.py`) para preservar todos os vídeos aprovados manualmente ou capturados pela Busca em Tempo Real (`aprovado_manualmente: true`, `captura_tempo_real: true`, `recem_lancado: true`).

---

## 2. Endpoints Utilizados (Backend)

### 2.1. Varredura Geral de Vídeos do YouTube
- **Rota:** `POST /v2/admin/bot/youtube/executar`
- **Headers:** `Cache-Control: no-store, no-cache`, `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "max_por_canal": 3,
    "dry_run": false
  }
  ```
- **Regra de Blindagem (`scripts/youtube_feeder.py` -> `executar_bot_youtube`):**
  - Antes de gravar `data/noticias_youtube.json`, ler o arquivo existente (se houver).
  - Preservar todos os vídeos já existentes no arquivo, dando prioridade aos itens com `aprovado_manualmente == True`, `origem_manual == True`, `captura_tempo_real == True` ou `recem_lancado == True`.
  - Se um vídeo recém-coletado no RSS tiver o mesmo `video_id` ou `url` de um item já aprovado manualmente (`aprovado_manualmente == True`), manter os metadados e flags de aprovação manual (`aprovado_manualmente: True`, `origem_manual: True`, `urgencia_score`, `nivel_relevancia`).
  - Se um vídeo aprovado manualmente ou capturado em tempo real ainda não constar na coleta RSS (por atraso do feed XML ou por ser de link direto avulso), mantê-lo na lista mesclada sem apagá-lo.
- **Response JSON:**
  ```json
  {
    "ok": true,
    "status": "concluido",
    "job_nome": "bot_youtube_feeder",
    "duracao_ms": 1200,
    "dry_run": false,
    "canais_varridos": 19,
    "total_itens": 57,
    "preservados_tempo_real": 2,
    "atualizadoEm": "2026-11-22T18:55:00+00:00",
    "items": [...]
  }
  ```

### 2.2. Coleta DuckDuckGo News
- **Rota:** `POST /v2/admin/bot/ddg/executar`
- **Headers:** `Cache-Control: no-store, no-cache`, `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "query": null,
    "dry_run": false
  }
  ```
- **Response JSON:**
  ```json
  {
    "ok": true,
    "status": "concluido",
    "total_itens": 25,
    "enfileirados_banco": 10,
    "duracao_ms": 2300
  }
  ```

---

## 3. Especificação de Interface (`admin/index.html`)

### 3.1. Aba `🎬 Vídeos` (`data-radar-tab="video"`)
- Dentro de `#radar-video-lookup-box`:
  - Adicionar o botão `#btn-radar-varrer-todos-videos` (`🎬 Varredura Geral (Todos os Canais)`) ao lado de `#btn-buscar-canal-video`.
  - Ao clicar:
    1. Desabilitar o botão e exibir texto `"Varrendo canais..."` + status em `#radar-video-lookup-status`.
    2. Disparar `POST /v2/admin/bot/youtube/executar` com `{ max_por_canal: 3, dry_run: false }`.
    3. Exibir banner de sucesso em `#radar-video-lookup-status` e toast informativo.
    4. Chamar `await carregarRadar()` e `carregarStatusYoutube()` para atualizar imediatamente a tabela e contadores do Radar.
    5. Caso `state.videoLookupResultados` esteja aberto na tela, atualizar os badges de `"✓ Já no Feed do Site"` dos vídeos correspondentes.

### 3.2. Aba `🦆 DuckDuckGo` (`data-radar-tab="ddg_news"`)
- Adicionar o container contextual `#radar-ddg-lookup-box` (exibido automaticamente quando `state.radarTab === 'ddg_news'`, ocultado nas demais abas):
  - Campo opcional `#radar-ddg-query-input` (placeholder: `"Vazio = varredura global ou digite tema específico (ex: Brasil economia)..."`).
  - Botão `#btn-radar-disparar-ddg` (`🦆 Disparar Coleta DuckDuckGo`).
  - Container de status `#radar-ddg-lookup-status`.
  - Ao clicar:
    1. Desabilitar o botão e exibir `"Coletando DDG..."` + banner de progresso em `#radar-ddg-lookup-status`.
    2. Disparar `POST /v2/admin/bot/ddg/executar` com `{ query: queryVal || null, dry_run: false }`.
    3. Exibir banner de conclusão com total coletado e tempo de execução.
    4. Chamar `await carregarRadar()`, `carregarStatusDdg()` e `carregarEventos()` para atualizar a lista e os contadores na hora.
