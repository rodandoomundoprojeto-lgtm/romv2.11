# Contrato de Dados: FEAT-PATROCINIOS-COTAS

## Endpoints
- `GET /v2/patrocinadores` (Público, `Cache-Control: no-store, no-cache`)
  - Retorna `{ "ok": true, "origem": "db|default", "atualizado_em": "...", "cotas": { ... } }`
- `PUT /v2/admin/patrocinadores` (Admin: `Depends(verificar_admin_token)`)
  - Recebe `{ "cotas": { "cota_master": {...}, "dossie_tematico": {...}, "resumo_dia": {...}, "gaveta_contextual": {...} } }`
  - Valida com Pydantic v2 e persiste em `estado_pipeline` (`chave = "patrocinadores"`).
  - Retorna `{ "ok": true, "origem": "db", "atualizado_em": "...", "cotas": { ... } }`

## Schema de Cota (`CotaPatrocinioItem`)
- `ativo`: `bool` (default `false`)
- `nome`: `str` (max 120 chars) — Nome escrito do patrocinador/apoiador
- `nome_imagem_url`: `str` (`https://`, `http://`, `/`, ou `data:image/(png|jpeg|webp|svg+xml);base64,...` sem scripts) — Arquivo/imagem tipográfica do nome do apoiador (opcional, substitui a exibição textual do nome mantendo `nome` como acessibilidade)
- `logo_url`: `str` (`https://`, `http://`, `/`, ou `data:image/(png|jpeg|webp|svg+xml);base64,...` sem scripts) — Ícone, foto ou símbolo da marca
- `frase`: `str` (max 280 chars; na `gaveta_contextual` aceita `{pais}`)
- `cta_texto`: `str` (max 60 chars)
- `link_url`: `str` (`https://`, `http://`, `/` ou vazio)
- `data_inicio`: `str` (`YYYY-MM-DD` ou vazio) — data de início do contrato
- `data_fim`: `str` (`YYYY-MM-DD` ou vazio) — data de término do contrato (`data_fim >= data_inicio`)
- `exibir_no_sobre`: `bool` (apenas `cota_master`, default `true`)
- `hub_alvo`: `str` (apenas `dossie_tematico`: `todos`, `economia`, `clima`, `tecnologia`, `eleicoes`)
- `paises_alvo`: `str` (apenas `gaveta_contextual`: `todos` ou lista ISO separada por vírgula, ex: `BR,US,PT`)
