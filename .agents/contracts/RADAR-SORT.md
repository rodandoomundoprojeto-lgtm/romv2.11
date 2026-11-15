# Contrato de Integração Full-Stack: RADAR-SORT

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `RADAR-SORT`
- **Resumo:** Garantir sortimento e rodízio amplo de veículos/mídias no Radar Editorial (`/radar` e `/api/radar`), impedindo sequências de 3 ou mais cards consecutivos da mesma mídia (`fonte_nome`).
- **Arquivos Alvo (Backend):** `src/publisher.py`, `functions/api/radar.js`, `_worker.js`, `api/routes_v2.py`, `data/feed_output.json`
- **Arquivos Alvo (Frontend):** `app.js`

---

## 2. Regra de Sortimento (Camada Dupla)
1. **Destaques Pulso V2:** Até **2** cards de síntese própria (`origem_v2 === true` ou `fonte_nome` contendo `"Pulso V2"`) podem permanecer fixados no topo da listagem. Excedentes V2 entram no fluxo geral.
2. **Normalização de Mídia (`fonteKey`):** Chave normalizada de `fonte_nome` (lowercase, sem acentos, espaços colapsados; fallback `'desconhecida'`).
3. **Teto Consecutivo:** Máximo de **2 cards consecutivos** com a mesma `fonteKey`.
4. **Rodízio Amplo (Broad Rotation):**
   - Partindo da lista ordenada por `data_publicacao` decrescente:
   - A cada posição, calcula-se a janela de recência de veículo `windowSize = min(3, fontesDistintasRestantes - 1)`.
   - Seleciona-se o item mais recente do pool restante cuja `fonteKey`:
     1. Não viole o teto consecutivo (`consecCount >= 2` -> `fonteKey !== consecFonte`); E
     2. Não tenha aparecido nos últimos `windowSize` cards já posicionados.
   - Se nenhum candidato satisfizer a janela de rodízio amplo, relaxa-se a janela de rodízio e escolhe-se o item mais recente que respeite `fonteKey !== consecFonte` (quando `consecCount >= 2`).
   - Se restar apenas uma única fonte no pool (esgotamento de alternativas), os excedentes são adicionados ao final da lista em ordem cronológica decrescente.

---

## 3. Especificação da Requisição e Resposta (`/api/radar`)
- **Endpoint:** `/api/radar` (ou fallback `/data/feed_output.json`)
- **Método HTTP:** `GET`
- **Query Params:** `categoria` (opcional), `_t` (cache-busting), `refresh=1`
- **Headers Obrigatórios:**
  - `Content-Type: application/json; charset=utf-8`
  - Em refresh (`_t` ou `refresh=1`): `Cache-Control: no-store, no-cache, must-revalidate`
- **Payload de Sucesso (HTTP 200):**
```json
{
  "ok": true,
  "cached": false,
  "source": "v2_hybrid",
  "atualizado_em": "Atualizado agora",
  "updatedAt": "2026-11-14T23:00:00Z",
  "total": 50,
  "items": [
    {
      "id": "string",
      "titulo": "string",
      "resumo": "string",
      "analise": "string",
      "categoria": "geopolitica|politica|economia|cultura",
      "fonte_nome": "string",
      "fonte_url": "string",
      "data_publicacao": "ISO-8601",
      "origem_v2": false
    }
  ]
}
```

---

## 4. Comportamento no Frontend (`app.js`)
- **Container Alvo:** `#radar-editorial-view` / `#radar-cards-list`
- **Chave de Cache Local:** `rom_radar_cache` (limpa ao clicar em `#btn-atualizar-radar`)
- Ao renderizar `renderRadarCardsList(preserveExpanded)`, **após** aplicar o filtro de categoria (`radarCategoryFilter`), o frontend deve aplicar a mesma função de rodízio amplo sobre `filtered` para que nenhuma aba de categoria exiba 3+ cards consecutivos da mesma mídia.
