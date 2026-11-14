# Plano de Tarefas — Agente de Curadoria IA (`SUG-CURADORIA-IA`)

> Base: [arquitetura_agente_ia_rodando_o_mundo.md](arquitetura_agente_ia_rodando_o_mundo.md) · Contrato: [.agents/contracts/SUG-CURADORIA-IA.md](.agents/contracts/SUG-CURADORIA-IA.md) · Código: [curadoria/](curadoria/README.md)

Legenda: `[x]` feito · `[ ]` pendente (ação externa do usuário) · **Dono** = subagente responsável (GEMINI.md §8)

---

## Fase 0 — Estrutura e Fundação ✅
| # | Tarefa | Dono | Status |
| :-- | :--- | :--- | :--- |
| 0.1 | Backup preventivo em `_backups/SUG-CURADORIA-IA/` | Orquestrador | [x] |
| 0.2 | Pacote `curadoria/` (agente, api, db, tests) isolado do radar | backend-logic | [x] |
| 0.3 | Contrato Pydantic único em `curadoria/agente/schemas.py` realinhado às editorias do portal | backend-logic | [x] |
| 0.4 | Contrato Full-Stack `.agents/contracts/SUG-CURADORIA-IA.md` | Orquestrador | [x] |
| 0.5 | `.env.example`, `requirements.txt`, README | backend-logic | [x] |
| 0.6 | Bloquear `/curadoria/*` como estático no `netlify.toml`; ignorar `curadoria/output/` | backend-logic | [x] |

## Fase 1 — Motor de Coleta + Cérebro (local, `--dry-run`) ✅
| # | Tarefa | Dono | Status |
| :-- | :--- | :--- | :--- |
| 1.1 | Rodar `pytest curadoria/tests` (8/8 OK) + dependências instaladas | qa-integrator | [x] |
| 1.2 | Validar feeds RSS e alinhar às seções reais (`/politica`, `/economia`, `/cultura`, `/eleicoes`, `/radar`, `/ultimas-noticias`) | backend-logic | [x] |
| 1.3 | Validar parsing do Google Trends RSS (`ht_approx_traffic`, `ht_news_item_title`) | backend-logic | [x] |
| 1.4 | Rodar `python -m curadoria.pipeline` e validar qualidade editorial dos insights | Orquestrador + usuário | [x] |
| 1.5 | Testar compatibilidade de schema com Gemini (`gemini-3.5-flash` / `gemini-3.5-flash-lite` com retry/fallback automático) | backend-logic | [x] |
| 1.6 | Limitar lote de coleta e tratar retry com backoff exponencial para evitar 503/429 | backend-logic | [x] |
| 1.7 | Reaproveitar `config/sources.json` do radar como fonte adicional em `coletor.py` | backend-logic | [x] |

## Fase 2 — Banco de Dados (PostgreSQL / Supabase) ✅
| # | Tarefa | Dono | Status |
| :-- | :--- | :--- | :--- |
| 2.1 | **Decisão:** provedor do Postgres → **Supabase** (projeto `eouybjxgxxzpbknblkii`) | Usuário | [x] |
| 2.2 | Migrações `001_init` + `002_rls` + `003_conteudos_unique` aplicadas no Supabase via Pooler | backend-logic | [x] |
| 2.3 | Popular `conteudos` com o estoque atual do site (`importar_acervo.py`: **205 conteúdos** de `data/editorial.js` e `data/feed_output.json`) | backend-logic | [x] |
| 2.4 | Rodar `busca_hibrida.sql` e `content_gaps.sql` com dados reais no Supabase (cruzamento validado) | qa-integrator | [x] |
| 2.5 | Script de limpeza de insights expirados (> 30 dias) em `curadoria/db/limpar_expirados.py` | backend-logic | [x] |

## Fase 3 — API Backend (FastAPI) ✅
| # | Tarefa | Dono | Status |
| :-- | :--- | :--- | :--- |
| 3.1 | **Decisão:** hospedagem externa (Dockerfile + `render.yaml` prontos) + snapshot `data/vitrine_ia.json` para CDN | Usuário / backend-logic | [x] |
| 3.2 | API local testada ponta a ponta: pipeline → POST → Supabase → vitrine/expansão/gaps (auth 403 OK) | qa-integrator | [x] |
| 3.3 | CORS restrito a `www.rodandoomundo.com.br` + headers `Cache-Control` conforme GEMINI.md §7 | backend-logic | [x] |
| 3.4 | Endpoint `/v1/gaps` expondo o Radar de Content Gaps (uso editorial, autenticado) | backend-logic | [x] |
| 3.5 | Rate limit em memória (`60 req/min` por IP) nos endpoints públicos | backend-logic | [x] |
| 3.6 | Deploy externo opcional da FastAPI (quando desejar subir no Render/Railway) | Usuário | [ ] |

## Fase 4 — Integração com o Site ✅
| # | Tarefa | Dono | Status |
| :-- | :--- | :--- | :--- |
| 4.1 | Proxy/fallback `functions/api/vitrine-em-alta.js` e `netlify/functions/vitrine-em-alta.mjs` (cache CDN curto, `no-store` com `_t`) | backend-logic | [x] |
| 4.2 | Bloco "Radar em Alta & Cruzamento Editorial" na Home (`#vitrine-ia`) com chips de editoria, botão Atualizar e fallback silencioso | frontend-ui | [x] |
| 4.3 | Busca: somar termos expandidos (`calcularBonusSemanticaIA`) na pontuação ponderada (nunca filtro rígido `tokens.every`) | frontend-ui | [x] |
| 4.4 | Paridade `index.html` / `200.html` + `qa_check.ps1` (`PASS` 5/5) | qa-integrator | [x] |

## Fase 5 — Automação e Operação ✅
| # | Tarefa | Dono | Status |
| :-- | :--- | :--- | :--- |
| 5.1 | Configurar secrets no GitHub (`GEMINI_API_KEY`, `CURADORIA_BACKEND_URL`, `CURADORIA_SECRET_TOKEN`) | Usuário | [ ] |
| 5.2 | Workflow `.github/workflows/curadoria.yml` pronto + correção de `actions/setup-python@v5` em `.github/workflows/radar.yml` | backend-logic | [x] |
| 5.3 | Alerta opcional de `GAP_CRITICO` via `src/notifier.py` integrado ao `curadoria/pipeline.py` | backend-logic | [x] |
| 5.4 | Controle de lote e fallback automático (`gemini-3.5-flash` -> `gemini-3.5-flash-lite`) ativo | backend-logic | [x] |
