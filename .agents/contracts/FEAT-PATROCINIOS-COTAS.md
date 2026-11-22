# Contrato de Dados: FEAT-PATROCINIOS-COTAS (Suporte a Múltiplos Patrocinadores)

## Endpoints
- `GET /v2/patrocinadores` (Público, `Cache-Control: no-store, no-cache`)
  - Retorna `{ "ok": true, "origem": "db|default", "atualizado_em": "...", "cotas": { "cota_master": [...], "dossie_tematico": [...], "resumo_dia": [...], "gaveta_contextual": [...] } }`
  - Retrocompatibilidade: Se o cliente enviar um objeto único em vez de lista para uma cota, o backend normaliza para lista `[...]`.
- `PUT /v2/admin/patrocinadores` (Admin: `Depends(verificar_admin_token)`)
  - Recebe `{ "cotas": { "cota_master": [...], "dossie_tematico": [...], "resumo_dia": [...], "gaveta_contextual": [...] } }`
  - Valida com Pydantic v2 e persiste em `estado_pipeline` (`chave = "patrocinadores"`).
  - Retorna `{ "ok": true, "origem": "db", "atualizado_em": "...", "cotas": { ... } }`

## Schema de Item de Cota (`CotaPatrocinioItem`)
- `id`: `str` (opcional no envio; se vazio, gerado automaticamente como `pat_<timestamp>_<random>`)
- `ativo`: `bool` (default `false`)
- `nome`: `str` (max 120 chars) — Nome escrito do patrocinador/apoiador
- `nome_imagem_url`: `str` (`https://`, `http://`, `/`, ou `data:image/(png|jpeg|webp|svg+xml);base64,...` sem scripts) — Imagem tipográfica do nome
- `logo_url`: `str` (`https://`, `http://`, `/`, ou `data:image/(png|jpeg|webp|svg+xml);base64,...` sem scripts) — Ícone, foto ou símbolo da marca
- `frase`: `str` (max 280 chars; na `gaveta_contextual` aceita `{pais}`)
- `cta_texto`: `str` (max 60 chars)
- `link_url`: `str` (`https://`, `http://`, `/` ou vazio)
- `data_inicio`: `str` (`YYYY-MM-DD` ou vazio) — data de início do contrato
- `data_fim`: `str` (`YYYY-MM-DD` ou vazio) — data de término do contrato (`data_fim >= data_inicio`)
- `exibir_no_sobre`: `bool` (apenas `cota_master`, default `true`)
- `hub_alvo`: `str` (apenas `dossie_tematico`: `todos`, `economia`, `clima`, `tecnologia`, `eleicoes`, ou `dossie:<slug>`)
- `paises_alvo`: `str` (apenas `gaveta_contextual`: `todos` ou lista ISO separada por vírgula, ex: `BR,US,PT`)

## Regras de Multi-Patrocínio
1. **Cota 01 (Master):** Suporta 1 ou mais patrocinadores (geralmente exclusivo, com rotação se houver múltiplos).
2. **Cota 02 (Dossiês):** Suporta múltiplos patrocinadores segmentados por `hub_alvo` (ex: um em Economia, outro em Clima, outro em Tecnologia) ou cobrindo todos.
3. **Cota 03 (Resumo do Dia):** Suporta múltiplos patrocinadores (co-patrocínio ou rotação).
4. **Cota 04 (Contextual / Geo):** Suporta múltiplos parceiros segmentados por `paises_alvo` (ex: um para `BR`, outro para `PT,ES`, outro global `todos`).
