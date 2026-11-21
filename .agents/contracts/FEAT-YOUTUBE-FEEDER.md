# Contrato de Integração Full-Stack: FEAT-YOUTUBE-FEEDER

## 1. Contexto e Objetivo
- **ID da Tarefa:** `FEAT-YOUTUBE-FEEDER`
- **Resumo:** Adição da aba dedicada **🎬 Vídeos** no Radar Editorial da Curadoria do Admin (`admin/index.html`), criação do **Bot Feeder de Vídeos do YouTube RSS** (`scripts/youtube_feeder.py`), endpoints administrativos de status e execução sob demanda (`/v2/admin/bot/youtube/*`), e garantia de cota mínima de retenção para que os vídeos analíticos não sejam expurgados pelo alto fluxo de notícias de jornais de texto.
- **Artefato de dados produzido:** `data/noticias_youtube.json`.

---

## 2. Endpoints Backend (`api/routes_v2.py`)

### 2.1. Status do Bot de Vídeos (YouTube RSS)
- **Endpoint:** `GET /v2/admin/bot/youtube/status`
- **Auth:** `Depends(verificar_admin_token)`
- **Cabeçalhos:** `Cache-Control: no-store, no-cache`
- **Response Schema:**
```json
{
  "ok": true,
  "canais_configurados": 19,
  "arquivo": {
    "existe": true,
    "atualizadoEm": "2026-11-21T12:00:00Z",
    "idade_minutos": 5,
    "total_itens": 15,
    "amostra_itens": [
      {
        "titulo": "Exemplo de Análise",
        "canal": "Professor HOC",
        "url": "https://www.youtube.com/watch?v=...",
        "published_at": "2026-11-21T03:00:00+00:00"
      }
    ]
  }
}
```

### 2.2. Execução Sob Demanda do Bot de Vídeos
- **Endpoint:** `POST /v2/admin/bot/youtube/executar`
- **Auth:** `Depends(verificar_admin_token)`
- **Body Schema (opcional):**
```json
{
  "max_por_canal": 3,
  "dry_run": false
}
```
- **Response Schema:**
```json
{
  "ok": true,
  "status": "concluido",
  "job_nome": "bot_youtube_feeder",
  "duracao_ms": 1850,
  "dry_run": false,
  "canais_varridos": 19,
  "total_itens": 15,
  "novos_inseridos": 3,
  "atualizadoEm": "2026-11-21T12:05:00Z",
  "items": []
}
```

### 2.3. Radar Editorial Feed (`GET /v2/admin/radar/feed`)
- **Query Params:** `origem: Optional[str]` (agora suporta `"video"` além de `"all"`, `"manual"`, `"rss"`, `"pulso_v2"`, `"ddg_news"`).
- **Contadores Retornados:**
```json
{
  "total": 85,
  "manuais": 0,
  "rss": 45,
  "pulso_v2": 20,
  "ddg_news": 6,
  "video": 14
}
```
- **Campos do Item de Vídeo:**
  - `formato`: `"video"`
  - `origem`: `"video"`
  - `origem_video`: `true`
  - `origem_manual`: `false`
  - `origem_v2`: `false`
  - `fonte_url`: `"https://www.youtube.com/watch?v=..."`
  - `fonte_nome`: Nome do canal (ex: `"Professor HOC"`, `"Canal Top 10"`)

---

## 3. Frontend Admin (`admin/index.html`)

### 3.1. Abas do Radar (`#radar-tabs`)
- Nova aba adicionada ao lado de `ddg_news`:
```html
<button class="admin-tab" type="button" role="tab" aria-selected="false" data-radar-tab="video">
  🎬 Vídeos <span id="radar-count-tab-video">0</span>
</button>
```

### 3.2. Badge na Tabela (`tbody-radar`)
- Na coluna Origem, itens de vídeo recebem:
```html
<span class="badge badge-video" title="Vídeo de análise do YouTube">🎬 YouTube · {Canal}</span>
```

### 3.3. Painel de Disparos dos Bots (`#curadoria-disparos`)
- Novo card: **Bot de Vídeos (YouTube RSS)**:
  - Botão `#btn-rodar-youtube`: "Disparar Varredura de Vídeos"
  - Botão `#btn-ver-youtube-payload`: "Ver Dados"
  - Metadados: status dos canais e tempo desde a última execução.

---

## 4. Retenção e Cota de Vídeos (`src/publisher.py` e `functions/api/radar.js`)
- Garantir retenção mínima de 12 a 15 vídeos de YouTube, protegidos contra expulsão por matérias de alto volume de imprensa.
