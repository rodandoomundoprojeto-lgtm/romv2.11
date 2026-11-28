# Contrato de Integração Full-Stack: DOSSIE-3-0

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `DOSSIE-3-0`
- **Resumo:** Evolução completa dos Dossiês do Rodando o Mundo para **Dossiê 3.0 — Hub Vivo de Inteligência Jornalística**, integrando:
  1. Camada Editorial Profunda (`editorial_briefing`: última mudança, atores-chave, números-chave, impactos práticos e perguntas em aberto/FAQ);
  2. Comparador de Cobertura (`coverage_stats` calculado de `dossie_materias` + `coverage_angles` editorial);
  3. Dossiê Vivo & Rigor de IA (classificador ponderado sem falsos positivos por país, pulso incremental com PostgreSQL Advisory Lock e `pending_update`, auditoria de isenção `audit_report` e validação determinística de URLs internas — Regra 11);
  4. Conexão validada com o acervo RoM (`related_rom_content`: `entenda` + `colunas`);
  5. Retenção no cliente (`localStorage`: `rom_followed_dossies`), SEO estruturado (`CollectionPage` + `FAQPage` em JSON-LD) e revisão/pulso 1-clique no Admin.
- **Modelos Gemini:** Respeitar `GEMINI_DOSSIER_MODEL` (default `gemini-3.5-flash` + cadeia de fallback existente) para geração/auditoria e `GEMINI_MODEL_PULSO` (default `gemini-3.5-flash` + fallback) para pulso incremental.
- **Arquivos Alvo (Backend — `backend-logic`):**
  - `migrations/011_dossies_3_0_hub_vivo.sql` (NOVO)
  - `src/classificador_dossies.py`
  - `src/dossies_pulso.py` (NOVO)
  - `scripts/run_pipeline.py`
  - `api/routes_dossies.py`
  - `tests/test_dossies_3_0.py` (NOVO)
- **Arquivos Alvo (Frontend — `frontend-ui`):**
  - `app.js`
  - `styles.css`
  - `admin/index.html`

---

## 2. Schema do Banco de Dados (`migrations/011_dossies_3_0_hub_vivo.sql`)

Adicionar 4 colunas JSONB idempotentes em `dossies` e recriar `view_dossies_com_status`:
- `editorial_briefing JSONB NOT NULL DEFAULT '{}'::jsonb`
- `coverage_angles JSONB NOT NULL DEFAULT '[]'::jsonb`
- `audit_report JSONB NOT NULL DEFAULT '{}'::jsonb`
- `pending_update JSONB NOT NULL DEFAULT '{}'::jsonb`

### 2.1. Estrutura dos Objetos JSONB

#### `editorial_briefing`
```json
{
  "latest_shift": {
    "summary": "Resumo factual de 1-2 frases do desdobramento mais recente.",
    "updated_at": "2026-11-28",
    "highlight_tag": "Última atualização"
  },
  "key_players": [
    {
      "name": "Nome do ator ou instituição",
      "role": "Cargo ou papel no tema",
      "country_iso": "BR",
      "stance_summary": "Posição ou atuação objetiva em 1 frase."
    }
  ],
  "key_numbers": [
    {
      "value": "US$ 12 bi",
      "label": "Rótulo curto da métrica",
      "source": "FMI / Banco Central",
      "context": "Explicação breve do porquê esse número importa."
    }
  ],
  "practical_impacts": [
    {
      "audience": "cidadaos_locais | viajantes_mobilidade | empresas_comercio | geral",
      "title": "Título curto do impacto",
      "summary": "Consequência prática direta em 1-2 frases."
    }
  ],
  "open_questions": [
    {
      "question": "Pergunta frequente ou ponto em aberto?",
      "answer": "Resposta clara, neutra e factual."
    }
  ]
}
```

#### `coverage_angles`
```json
[
  {
    "label": "Imprensa local vs. internacional",
    "region_or_scope": "BR / Europa",
    "summary": "Síntese comparada do enfoque predominante deste grupo de veículos.",
    "sample_outlets": ["Folha", "Reuters", "Le Monde"]
  }
]
```

#### `audit_report`
```json
{
  "approved": true,
  "nota_isencao": 92,
  "ressalvas_integradas": true,
  "avisos": ["Opcional: aviso editorial"],
  "urls_validadas": [],
  "urls_removidas": [],
  "audited_at": "ISO-8601"
}
```

#### `pending_update`
```json
{
  "status": "pending | applied | dismissed",
  "generated_at": "ISO-8601",
  "model": "gemini-3.5-flash",
  "new_articles_count": 5,
  "proposed_latest_shift": {
    "summary": "...",
    "updated_at": "YYYY-MM-DD",
    "highlight_tag": "Pulso recente"
  },
  "proposed_timeline_item": {
    "date": "YYYY-MM-DD",
    "display_date": "28 Nov 2026",
    "title": "...",
    "summary": "...",
    "type": "past | turning_point | upcoming",
    "source_name": "Reuters",
    "source_url": "https://..."
  }
}
```

#### `timeline` (enriquecimento retrocompatível de cada item)
Cada item de `timeline` mantém `date`, `display_date`, `title`, `summary`, `type` e aceita opcionalmente:
- `source_name`: `string | null`
- `source_url`: `string | null`

---

## 3. Especificação das Rotas Backend (`api/routes_dossies.py`)

Todas as rotas devem aplicar `Cache-Control: no-store, no-cache, must-revalidate` (Regra 7). Rotas `/v2/admin/*` exigem `Depends(verificar_admin_token)`.

### 3.1. `GET /v2/dossies?_t=<ts>`
- Mantém o contrato anterior, adicionando no objeto de cada dossiê (quando disponíveis): `editorial_briefing`, `coverage_angles`, `audit_report`, `materias_count`.

### 3.2. `GET /v2/dossies/{slug}?_t=<ts>`
Resposta `200 OK`:
```json
{
  "ok": true,
  "fonte": "banco | espelho",
  "dossie": {
    "slug": "...",
    "titulo": "...",
    "subtitulo": "...",
    "tipo": "permanente | especial",
    "categoria": "...",
    "icone_ou_bandeira": "...",
    "status": "permanente | ao_vivo | em_breve | arquivo",
    "workflow_status": "published",
    "executive_summary": { "context": "...", "pillars": [] },
    "timeline": [],
    "editorial_briefing": {},
    "coverage_angles": [],
    "audit_report": {},
    "ai_metadata": {},
    "veiculos_count": 0,
    "materias_count": 0,
    "regras_classificacao": { "palavras_chave": [], "paises": [] },
    "ultima_atualizacao": "ISO-8601"
  },
  "materias": [
    {
      "materia_titulo": "...",
      "materia_url": "https://...",
      "veiculo_nome": "...",
      "pais_veiculo": "BR",
      "vies": "centro",
      "publicado_em": "ISO-8601"
    }
  ],
  "coverage_stats": {
    "total_materias": 12,
    "total_veiculos": 8,
    "primary_sources_count": 2,
    "by_country": [{ "pais": "BR", "count": 6, "pct": 50 }],
    "by_bias": [{ "vies": "centro", "count": 5, "pct": 42 }]
  },
  "related_rom_content": {
    "entenda": [
      { "slug": "entenda-...", "titulo": "...", "resumo": "...", "url": "/entenda/..." }
    ],
    "colunas": [
      { "slug": "...", "titulo": "...", "subtitulo": "...", "url": "/colunas/..." }
    ]
  }
}
```
> **Regra 11 (Anti-404):** `related_rom_content` só pode conter URLs comprovadamente existentes e publicadas no banco (`ai_entenda_o_assunto`, `ai_colunas_editoriais`) ou em `sitemap.xml`.

### 3.3. Rotas Administrativas
- `GET /v2/admin/dossies`: inclui `editorial_briefing`, `coverage_angles`, `audit_report`, `pending_update` em cada item + `contagens.pending_updates` (total de dossiês com `pending_update.status == 'pending'`).
- `PATCH /v2/admin/dossies/{slug}` e `POST /v2/admin/dossies`: aceitam `editorial_briefing`, `coverage_angles`, `audit_report`.
- `POST /v2/admin/dossies/suggest-ai`: gera também `editorial_briefing`, `coverage_angles` e `audit_report` (validando URLs internas).
- `POST /v2/admin/dossies/{slug}/generate`: gera camada 3.0 completa (`executive_summary`, `timeline` com fontes, `editorial_briefing`, `coverage_angles`) + executa auditoria de isenção (`audit_report`) + validação determinística de URLs, gravando `workflow_status = 'review'`.
- `POST /v2/admin/dossies/{slug}/pulse-update`: executa pulso incremental (`src/dossies_pulso.py`) sob demanda para o slug e retorna `{"ok": true, "dossie": ..., "pending_update": ...}`.
- `POST /v2/admin/dossies/{slug}/apply-pulse`: aplica `pending_update` ao dossiê (atualiza `editorial_briefing.latest_shift` e acrescenta `proposed_timeline_item` na `timeline` deduplicado/ordenado por `date`), marca `pending_update.status = 'applied'`, retorna `{"ok": true, "dossie": ...}`.
- `POST /v2/admin/dossies/{slug}/dismiss-pulse`: marca `pending_update.status = 'dismissed'`, retorna `{"ok": true, "dossie": ...}`.

---

## 4. Regras de Interface (Frontend — `app.js`, `styles.css`, `admin/index.html`)

### 4.1. Página de Detalhe do Dossiê (`app.js` + `styles.css`)
Renderizar de forma **retrocompatível** (só exibe cada bloco se houver dados):
1. **Hero:**
   - Botão `.btn-follow-dossie` (`data-follow-dossie="<slug>"`) usando `localStorage['rom_followed_dossies']` (JSON `{ [slug]: { followed_at, last_seen_at, last_count } }`).
   - Badge `.dossie-audit-badge` quando `audit_report.approved && audit_report.nota_isencao >= 85` (ex.: `✓ Auditado · Isenção 92/100`).
2. **Bloco `.dossie-latest-shift`** (*"O que mudou recentemente"*): exibe `editorial_briefing.latest_shift`.
3. **Bloco `.dossie-exec-summary`** (existente) + **`.dossie-numbers-strip`** (`editorial_briefing.key_numbers`).
4. **Bloco `.dossie-players-section`** (`editorial_briefing.key_players`) + **`.dossie-impacts-section`** (`editorial_briefing.practical_impacts`).
5. **Bloco `.dossie-coverage-radar`** (*"Como o mundo está cobrindo"*):
   - Termômetro visual (`.dossie-thermometer-bar`) de `coverage_stats.by_country` e `coverage_stats.by_bias` (com fallback calculado no cliente a partir de `materias` se `coverage_stats` vier ausente).
   - Cards `.dossie-angles-grid` para `coverage_angles`.
   - Filtros clicáveis na lista de matérias (`.dossie-coverage-filters`): Todos / por País / por Viés.
6. **Bloco `.dossie-timeline`** (enriquecido):
   - Filtros `.dossie-tl-filters` (`all`, `past`, `turning_point`, `upcoming`).
   - Exibição de `source_name` (com link externo seguro se `source_url`) e botão `"Ver cobertura deste marco"` (`.dossie-tl-search-btn`) que dispara `fetchDossieLiveNews` com o título/termo do marco.
7. **Bloco `.dossie-related-rom`** (*"Aprofunde no Acervo RoM"*): cards SPA para `related_rom_content.entenda` e `related_rom_content.colunas`.
8. **Bloco `.dossie-faq`** (*"Perguntas em aberto"*): `<details class="dossie-faq-item"><summary>...</summary><p>...</p></details>`.
9. **SEO Dinâmico:** injetar/atualizar `<script id="dossie-jsonld" type="application/ld+json">` com `CollectionPage` (+ `FAQPage` se `open_questions.length > 0`), removendo-o ao sair da view de dossiê.
10. **Cards na Home / `/dossies`:** se o usuário segue o dossiê (`rom_followed_dossies[slug]`) e `materias_count > last_count`, exibir badge discreto `+{diff} novas`.

### 4.2. Painel Admin (`admin/index.html`)
- Na tabela `#tbody-dossies`: exibir badge `⚡ Pulso pendente` se `d.pending_update && d.pending_update.status === 'pending'`.
- Em `#dossie-ai-section` dentro de `#modal-dossie`:
  - Exibir card `#dossie-audit-summary` (`nota_isencao`, status de aprovação e avisos).
  - Exibir painel `#dossie-pending-pulse-box` quando houver `pending_update.status === 'pending'` com prévia + botões `#btn-aplicar-pulso-dossie` (`POST .../apply-pulse`) e `#btn-descartar-pulso-dossie` (`POST .../dismiss-pulse`).
  - Botão `#btn-checar-pulso-dossie` (`POST .../pulse-update`) ao lado de `#btn-gerar-ia-dossie`.
  - Campos editáveis para `editorial_briefing` (latest_shift, atores-chave, números-chave, impactos práticos, perguntas em aberto) e `coverage_angles` salvos no `PATCH`/`POST`.
