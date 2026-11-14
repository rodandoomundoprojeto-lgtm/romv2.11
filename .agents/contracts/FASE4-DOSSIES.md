# Contrato de Integração Full-Stack: FASE4-DOSSIES

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `FASE4-DOSSIES`
- **Resumo:** Implementação da **Fase 4 (Frontend & Integração UI)** do plano de Hubs de Dossiês (`plano_de_implementa_o_dossi_s.md`), conectando a interface aos endpoints da Fase 2 (`GET /v2/dossies` e `GET /v2/dossies/{slug}` em `api/routes_dossies.py`) com fallback resiliente para `/data/dossies.json` (caso servido em ambiente estático/Netlify sem FastAPI).
- **Arquivos Alvo (Frontend):** `app.js`, `styles.css`, `index.html`, `200.html`
- **Arquivos de Referência (Backend já implementado na Fase 1–3):** `api/routes_dossies.py`, `data/dossies.json`

---

## 2. Especificação da Requisição (Frontend -> Backend)

### 2.1. Listagem de Dossiês
- **Endpoint Primário:** `GET /v2/dossies?_t=<timestamp>`
- **Fallback Estático:** `GET /data/dossies.json?_t=<timestamp>` (calculando `status` no cliente com a mesma regra: `permanente`, ou `especial` -> `em_breve` se `agora < data_inicio`, `arquivo` se `agora > data_fim`, senão `ao_vivo`).

### 2.2. Detalhe de Dossiê
- **Endpoint Primário:** `GET /v2/dossies/{slug}?_t=<timestamp>`
- **Fallback:** Localizar item em memória (`data/dossies.json`) e, se `materias` vier vazio ou indisponível, exibir matérias do `EDITORIAL.paginasTematicas[dossie.rota]` (se houver `rota`) ou buscar notícias ao vivo via `/api/busca-assunto` com as palavras-chave de `regras_classificacao.palavras_chave`.

---

## 3. Especificação da Resposta (Backend -> Frontend)

### 3.1. `GET /v2/dossies`
```json
{
  "ok": true,
  "fonte": "banco | espelho",
  "gerado_em": "ISO-8601",
  "contagens": {
    "permanentes": 24,
    "ao_vivo": 2,
    "em_breve": 5,
    "arquivo": 5
  },
  "permanentes": [
    {
      "slug": "politica-brasil",
      "titulo": "Política no Brasil",
      "subtitulo": "...",
      "tipo": "permanente",
      "categoria": "Geopolítica",
      "icone_ou_bandeira": "BR",
      "data_inicio": null,
      "data_fim": null,
      "meta_info": null,
      "rota": "/politica/brasil",
      "status": "permanente",
      "veiculos_count": 0,
      "regras_classificacao": { "palavras_chave": ["..."], "paises": ["BR"] },
      "ultima_atualizacao": null
    }
  ],
  "especiais": {
    "ao_vivo": [ /* ... */ ],
    "em_breve": [ /* ... */ ],
    "arquivo": [ /* ... */ ]
  }
}
```

### 3.2. `GET /v2/dossies/{slug}`
```json
{
  "ok": true,
  "fonte": "banco | espelho",
  "dossie": { /* mesmo objeto acima */ },
  "materias": [
    {
      "materia_titulo": "...",
      "materia_url": "https://...",
      "veiculo_nome": "...",
      "pais_veiculo": "BR",
      "vies": "centro",
      "publicado_em": "ISO-8601"
    }
  ]
}
```

---

## 4. Regras de Interface (UI/UX) e Elementos DOM (Frontend)

### 4.1. Seção `#temas-hubs` (Home e Página `/temas` ou `/dossies`)
1. **Seção Superior — Dossiês Especiais (Cobertura Temporária):**
   - Eyebrow: `COBERTURA TEMPORÁRIA · EVENTOS EM DESTAQUE`
   - Título: `Dossiês Especiais`
   - Subtítulo: `Acompanhamento intensivo em tempo real de grandes eventos globais, cimeiras, eleições e marcos culturais.`
   - Cards com:
     - **Ícone temático SVG** minimalista no canto superior esquerdo (baseado em `icone_ou_bandeira`: `Trophy`, `Globe`, `Vote`, `Award`, `Rocket`, `Leaf`, `Landmark`, `Film`).
     - **Badge de Status** no canto superior direito:
       - `ao_vivo`: verde suave + ponto pulsante `● Ao vivo` (e `· {veiculos_count} veículos` se `veiculos_count > 0`)
       - `em_breve`: âmbar/azul suave + `⏳ {meta_info || 'Em breve'}`
       - `arquivo`: neutro + `✓ Arquivo · {meta_info || 'Encerrado'}`
     - **Período do Evento:** exibir `meta_info` logo abaixo do título em fonte pequena (`12px` / `0.75rem`, cor secundária).
   - Na Home (`/`): exibir os destaques (ex: até 3 ou 6 cards priorizando `ao_vivo`, depois `em_breve`, depois `arquivo`) com link `"Ver todos os 12 especiais →"` para `/dossies` (ou `/temas`). Na página `/temas` ou `/dossies`: exibir todos os 12.

2. **Seção Principal — Dossiês Permanentes (Hubs Temáticos):**
   - Eyebrow: `COBERTURA PERMANENTE · HUBS TEMÁTICOS`
   - Título: `Dossiês Permanentes`
   - **Pílulas de Filtro por Categoria** acima da grade:
     - `Todos`, `Geopolítica`, `Economia`, `Tecnologia`, `Clima e Ciência`, `Sociedade`
   - **Grid Responsivo** (`.hubs-cards-grid`): 1 coluna no mobile, 2 no tablet, 3 no desktop.
   - **Contadores Dinâmicos:** Na Home exibir 3 ou 6 cards (filtráveis por categoria!) e botão `"Ver todos os 24 dossiês →"` (usando o total real retornado pela API/JSON). Em `/temas` e `/dossies`, exibir todos os 24 (filtrados pela pílula ativa).

### 4.2. Navegação & Prevenção de 404 (Regra 11 GEMINI.md)
- Rotas válidas no roteador SPA (`app.js`): `/temas`, `/temas-hubs`, `/dossies`, e `/dossies/<slug>`.
- Ao clicar em um card de Dossiê:
  - Se o dossiê tiver `rota` existente em `EDITORIAL.paginasTematicas` (ex: `/politica/brasil`), pode abrir a página temática rica OU a view unificada `/dossies/<slug>` (garantindo que nunca dê 404).
  - Para qualquer um dos 36 dossiês (incluindo os sem `rota` legada), `/dossies/<slug>` renderiza o detalhe do dossiê em `#thematic-hub-view` com badge de status, descrição, matérias vinculadas da API (ou busca ao vivo via `/api/busca-assunto` pelas palavras-chave) e botão Voltar.

### 4.3. Busca Global (`#busca` e `#busca-lista`)
- Indexar todos os 36 dossiês no índice de busca global (`getSearchIndex()`), permitindo buscar por título, descrição (`subtitulo`), categoria e palavras-chave.
- Exibir resultados com pill `Dossiê` (ou `Especial` / `Permanente`) no dropdown `#busca-lista` e navegar ao selecionar.

### 4.4. Dark Mode & Acessibilidade
- Suporte completo a `html[data-theme="dark"]` e `body.dark` (usando variáveis CSS `--surface`, `--border`, `--text`, `--text-muted` e variantes dark explícitas para os badges de status `ao_vivo`, `em_breve`, `arquivo`).
- Paridade estrita entre `index.html` e `200.html`.
