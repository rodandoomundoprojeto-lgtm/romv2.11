# Contrato de Integração Full-Stack: BUG-RADAR-VIDEOS

## 1. Contexto e Objetivo
- **ID da Tarefa:** `BUG-RADAR-VIDEOS`
- **Resumo:** Garantir que todos os vídeos aprovados e marcados como "Já no Feed" (ex: canais Parabólica, José Kobori e demais canais do YouTube em `data/noticias_youtube.json`) sejam sincronizados com `data/feed_output.json` e PostgreSQL (`feed_output`), retornados por `/api/radar` e `/v2/admin/radar/feed` com os campos de vídeo completos (`formato: "video"`, `origem_video: true`, `fonte_nome` do canal preservado), e que a aba Radar no Frontend (`app.js` e `admin/index.html`) recarregue e exiba os vídeos sem ocultá-los sob rótulos genéricos de síntese ou cache estagnado.
- **Arquivos Alvo (Backend):** `scripts/youtube_feeder.py`, `api/routes_v2.py`, `_worker.js`, `functions/api/radar.js`, `src/publisher.py`, `data/feed_output.json`
- **Arquivos Alvo (Frontend):** `app.js`, `admin/index.html`

---

## 2. Especificação da Requisição (Frontend -> Backend)
- **Endpoint Público:** `GET /api/radar`
- **Endpoint Admin:** `GET /v2/admin/radar/feed`
- **Query Params:**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `refresh` | `string` | Não (`1` no refresh) | Força leitura sem cache |
  | `_t` | `number` | Sim | Timestamp (`Date.now()`) para cache-busting |

---

## 3. Especificação da Resposta (Backend -> Frontend)

### 3.1. Headers Obrigatórios
- `Content-Type: application/json; charset=utf-8`
- `Cache-Control: no-store, no-cache, must-revalidate`

### 3.2. Regras de Negócio e Campos Obrigatórios de Itens de Vídeo (`items` / `cards`)
1. **Sincronização de `noticias_youtube.json` com `feed_output.json` e Banco (`ai_pipeline_state`):**
   - `data/feed_output.json` é uma **lista JSON (`[...]`)** na raiz (ou dict com `items`, suportar ambos).
   - Sempre que `aprovar_video_manual_youtube`, `adicionar_fonte_e_coletar_para_radar` ou `executar_bot_youtube` gravarem vídeos em `data/noticias_youtube.json`, devem sincronizar imediatamente esses vídeos para `data/feed_output.json` e para a chave `feed_output` no PostgreSQL (`src.estado_db.atualizar_estado("feed_output", ...)`).
   - Sincronizar imediatamente os vídeos atuais de `data/noticias_youtube.json` (incluindo os vídeos de **Parabólica** e **José Kobori**) dentro de `data/feed_output.json` e no banco.
2. **Mesclagem Direta em Todos os Endpoints `/api/radar` (`_worker.js`, `functions/api/radar.js`, `api/routes_v2.py`) e `/v2/admin/radar/feed` (`api/routes_v2.py`):**
   - `obter_feed_radar` (`api/routes_v2.py`), `handleRadarHybrid` (`_worker.js`) e `functions/api/radar.js` devem carregar e mesclar `data/noticias_youtube.json` junto com `vitrine_ia` e `feed_output`.
   - Todo item de vídeo deve conter explicitamente:
     - `"formato": "video"`
     - `"origem_video": true`
     - `"fonte_nome"`: nome real do canal (ex: `"Parabólica"`, `"José Kobori"`). **Importante:** Quando um vídeo de canal específico (de `noticias_youtube.json` ou `feed_output.json`) também tiver sido agrupado num card de `vitrine_ia.json` cujo `fonte_nome` virou `"Síntese Rodando o Mundo · Pulso V2"`, o card individual do canal do YouTube (com `fonte_nome: "Parabólica"`, título do vídeo, etc.) **NÃO deve ser descartado pela deduplicação de URL**, ou deve preservar o card original do canal para que o vídeo do canal apareça claramente no Radar Editorial -> Vídeos!
3. **Classificação no Admin (`api/routes_v2.py` e `src/publisher.py`):**
   - Em `admin_listar_radar_feed` (`api/routes_v2.py`) e `listar_todos_cards_radar` (`src/publisher.py`), vídeos aprovados manualmente (`origem_manual: true` e `eh_vid: true`) devem ter `formato: "video"`, `origem_video: true`, e ser contabilizados e exibidos na aba de Vídeos (`origem = "video"` ou reconhecidos pelo filtro de vídeo sem serem engolidos apenas como `manual`).

---

## 4. Elementos DOM e Comportamento (Frontend)
- Em `app.js`:
  - `isRadarVideoItem(item)` deve passar `item.fonte_url || item.url` para `isVideoContent(...)` além de checar `item.formato === 'video'` ou `item.origem_video === true`.
  - Ao alternar da sub-aba `Curadoria` ou `Colunas` para a sub-aba `Radar` (`applyRadarHubTabUI` / clique na aba Radar), deve chamar `loadRadarCards(true, false)` (ou invalidar `radarLastFetchAt = 0`) para buscar imediatamente novos vídeos recém-aprovados sem ficar preso no cache em memória de 5 minutos.
  - No botão Atualizar do Radar (`refresh=1`), limpar qualquer cache local relacionado e forçar `_t=${Date.now()}`.
- Em `admin/index.html`:
  - Na função `renderRadar`, garantir que a aba `🎬 Vídeos` (`tab === 'video'`) exiba todos os itens onde `c.origem === 'video' || String(c.formato || '').toLowerCase() === 'video' || c.origem_video`, mesmo que `c.origem_manual` seja `true`.
