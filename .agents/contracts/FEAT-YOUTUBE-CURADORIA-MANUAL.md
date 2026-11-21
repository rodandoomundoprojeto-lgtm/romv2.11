# Contrato de Integração Full-Stack: FEAT-YOUTUBE-CURADORIA-MANUAL

## 1. Contexto e Objetivo
- **ID da Tarefa:** `FEAT-YOUTUBE-CURADORIA-MANUAL`
- **Solicitante / Usuário:** No Radar Editorial da curadoria do feed (`admin/index.html`), na aba de Vídeos, ter um espaço onde o editor pode selecionar/inserir manualmente o nome de um canal (dentre os canais cadastrados), clicar para buscar em tempo real os últimos vídeos desse canal e aprovar individualmente se cada vídeo vai para o site (especialmente caso o ciclo automático de coleta ainda não tenha rodado).
- **Camadas Envolvidas:**
  - **Backend:** `scripts/youtube_feeder.py` + `api/routes_v2.py` (FastAPI).
  - **Frontend:** `admin/index.html` (aba Radar Editorial / Vídeos).
  - **Dados Persistidos:** `data/noticias_youtube.json` (consumido pelo Radar Editorial e pelo feed do site).

---

## 2. Endpoints Backend (`api/routes_v2.py`)

### 2.1. Listar Canais Cadastrados
- **Endpoint:** `GET /v2/admin/bot/youtube/canais`
- **Auth:** `Depends(verificar_admin_token)`
- **Cache-Control:** `no-store, no-cache`
- **Response Schema:**
```json
{
  "ok": true,
  "total": 19,
  "canais": [
    {
      "nome": "Prof Ricardo Marcílio",
      "id_ou_url": "UCT6Imb3GXhF8GmjpIk6y2lg",
      "categoria": "geopolitica",
      "pais_iso": "BR"
    }
  ]
}
```

### 2.2. Buscar Vídeos Recentes de um Canal Específico
- **Endpoint:** `GET /v2/admin/bot/youtube/buscar-canal`
- **Query Params:**
  - `canal` (str, obrigatório): Nome ou ID do canal (ex.: "Prof Ricardo Marcílio" ou "UCT6Imb3GXhF8GmjpIk6y2lg").
  - `limite` (int, opcional, default 6, min 1, max 15): Quantidade de vídeos recentes a consultar no RSS.
- **Auth:** `Depends(verificar_admin_token)`
- **Cache-Control:** `no-store, no-cache`
- **Comportamento:**
  - Localiza o canal em `config/sources.json` por correspondência de texto ou ID.
  - Conecta ao feed oficial do canal no YouTube (`https://www.youtube.com/feeds/videos.xml?channel_id=...`).
  - Extrai os vídeos mais recentes.
  - Compara com `data/noticias_youtube.json` para definir a flag booleana `ja_publicado` (True se o vídeo já estiver no feed do site, False se for inédito).
- **Response Schema:**
```json
{
  "ok": true,
  "canal": {
    "nome": "Prof Ricardo Marcílio",
    "id_ou_url": "UCT6Imb3GXhF8GmjpIk6y2lg",
    "categoria": "geopolitica",
    "pais_iso": "BR"
  },
  "total_encontrados": 6,
  "videos": [
    {
      "video_id": "ABC12345678",
      "slug": "yt-ABC12345678",
      "titulo": "Título do Vídeo Recente",
      "resumo": "Sinopse limpa do vídeo...",
      "canal": "Prof Ricardo Marcílio",
      "fonte_nome": "Prof Ricardo Marcílio",
      "fonte_url": "https://www.youtube.com/watch?v=ABC12345678",
      "url": "https://www.youtube.com/watch?v=ABC12345678",
      "thumbnail": "https://i.ytimg.com/vi/ABC12345678/hqdefault.jpg",
      "data_publicacao": "2026-11-21T10:30:00+00:00",
      "categoria": "geopolitica",
      "formato": "video",
      "ja_publicado": false
    }
  ]
}
```

### 2.3. Aprovar Vídeo para Publicação no Site
- **Endpoint:** `POST /v2/admin/bot/youtube/aprovar`
- **Auth:** `Depends(verificar_admin_token)`
- **Body Schema:**
```json
{
  "video_id": "ABC12345678",
  "titulo": "Título do Vídeo",
  "resumo": "Sinopse...",
  "canal": "Prof Ricardo Marcílio",
  "url": "https://www.youtube.com/watch?v=ABC12345678",
  "thumbnail": "https://i.ytimg.com/vi/ABC12345678/hqdefault.jpg",
  "data_publicacao": "2026-11-21T10:30:00+00:00",
  "categoria": "geopolitica",
  "paises_envolvidos": ["BR"]
}
```
- **Response Schema:**
```json
{
  "ok": true,
  "mensagem": "Vídeo aprovado e publicado com sucesso no site!",
  "video": { ... }
}
```

---

## 3. Comportamento no Frontend (`admin/index.html`)
1. **Espaço na Seção Radar Editorial:**
   - Na aba **🎬 Vídeos**, exibe a caixa de curadoria manual de canal:
     - Dropdown / Datalist com todos os canais cadastrados.
     - Botão "Buscar Vídeos do Canal".
   - Enquanto busca, exibe indicador de progresso ("Consultando YouTube...").
2. **Exibição dos Vídeos:**
   - Cards com miniatura, título, data relativa, resumo, link externo e status.
   - Vídeos não publicados exibem botão destacado: `✓ Aprovar e Publicar no Site`.
   - Vídeos já publicados exibem badge: `✓ Já no feed do site`.
3. **Ao Aprovar:**
   - Envia requisição para `/v2/admin/bot/youtube/aprovar`.
   - Exibe toast de sucesso e badge `✓ Aprovado e Publicado no Site!`.
   - Atualiza `carregarRadar()` automaticamente para sincronizar a lista e os contadores do feed.
