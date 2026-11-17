# Contrato de Integração Full-Stack: ADMIN-REBUILD-MODERNO-2026-11

> **Instrução ao Orquestrador:** Este contrato foi criado antes da implementação do novo painel `/admin`, endpoints CRUD e correções de bug (Tarefa: reestruturação completa do painel `/admin` + Dashboard desktop).

---

## 1. Contexto e Objetivo

- **ID da Tarefa:** `ADMIN-REBUILD-MODERNO-2026-11`
- **Resumo:** Reestruturação completa do painel administrativo (`/admin` — "Dashboard Admin") do Rodando o Mundo: novo layout accordion minimizável (mobile-first), CRUD total (Radar, Notícias Quentes, Dossiês, Curadoria, Fontes, Controle Rápido), login simplificado (só usuário/senha), correção de persistência do Radar e de curadoria.
- **Arquivos Alvo (Backend):** `main.py`, `src/*.py`, `api/*.py`, `redacao_v2/*.py`, `migrations/*.sql`, `data/*.json`, `config/sources.json`, `_redirects`.
- **Arquivos Alvo (Frontend):** `admin/index.html`, `styles.css`, `app.js`, `noticias.js`, páginas estáticas.

---

## 2. Regras de Bugs Críticos (Não Negociáveis)

### 2.1 Sumiço de Notícias Novas do Radar
- **Fonte da verdade:** PostgreSQL (Supabase) via `src.estado_db` (`ai_pipeline_state` JSONB; chaves `feed_output`, `vitrine_ia`, `history`) com espelho em `data/*.json` (fallback).
- Toda escrita de feed/notícias/quentes DEVE passar por `src.estado_db.gravar_estado` / `src.publisher._persistir_feed` / `src.estado_db.atualizar_estado`.
- Nenhum cache de feed em memória/módulo global pode ser a fonte de leitura do Radar.
- `src.publisher.publish_cards` deve manter merge por `fonte_url` + título normalizado e `ON CONFLICT` por slug onde aplicável.
- `expires_at` sempre em UTC (`TIMESTAMPTZ`), TTL mínimo 1h.
- Deduplicação de history via `SELECT ... FOR UPDATE` (atomic).

### 2.2 Análise em Tempo Real / Curadoria
- Falhas de pipeline NÃO podem ser silenciosas: registrar em `ai_execucoes_pipeline` com `status` (`em_execucao`, `concluido`, `falha`, `ignorado_lock_ocupado`).
- Kill Switch: `publicacao_automatica_ativa` (`ativo`/`aguardando_revisao`) em `ai_config_operacional`.
- Endpoints de execução devem reaproveitar advisory lock (`pg_try_advisory_lock`) e auditoria.

---

## 3. Contrato de Autenticação (Simplificada — Só Senha)

- Endpoints protegidos: todos sob `/v2/admin/*` (via `dependencies=[Depends(verificar_admin_token)]`).
- Header: `Authorization: Bearer <senha>` (+ opcional `X-Admin-User: <user>` para admins em `ADMIN_USERS`).
- Aceitação válida:
  1. `CURADORIA_SECRET_TOKEN` / `ADMIN_SECRET_TOKEN` (token de máquina);
  2. `ADMIN_PASSWORD` / `ADMIN_SENHA` (senha pura via Bearer);
  3. `ADMIN_USERS` (JSON `{"user":"senha"}` ou `user:senha,user2:senha2`) — com ou sem `X-Admin-User`.
- Erros: `401` sem credencial; `403` senha/token inválida.

---

## 4. Contrato de Endpoints Backend ↔ Frontend

### 4.1 Kill Switch
| Método | Path | Body | Resposta 200 |
|---|---|---|---|
| GET | `/v2/admin/config/kill-switch` | — | `{ok: true, publicacao_automatica_ativa: bool, updated_at: string\|null}` |
| POST | `/v2/admin/config/kill-switch` | `{ativo: bool}` | `{ok: true, publicacao_automatica_ativa: bool, updated_at: string}` |

### 4.2 Coleta / Pulso / Coluna
| Método | Path | Query/Body | Resposta |
|---|---|---|---|
| POST | `/v2/admin/coleta/executar` | Body opcional `{dry_run?: bool}` | `{ok, status: "concluido"\|"ignorado_lock_ocupado"\|"sem_itens", recurso_chave, dry_run, total_noticias, noticias_quentes?[]}` |
| POST | `/v1/noticias-quentes/executar` | Query `dry_run`, Body opcional `{dry_run}` | `{ok, status, batch_id, gerado_em, model_id, total_noticias, noticias_quentes: [...]}` |
| POST | `/v2/gerar-coluna` | Body `{tema?, slug?, event_id?, fontes_urls?, dry_run?, sincrono?}` | 202 `{ok, status:"agendado_em_background", ...}` ou sync `{ok, status:"concluido"\|"reprovado_auditoria", coluna, auditoria, persistencia}` |
| GET | `/v2/colunas` | Query `status?`, `categoria?`, `pais?`, `limit?`, `_t?`, `refresh?` | `{ok, colunas: [{slug,titulo,subtitulo,tese_central,corpo_markdown,resumo_seo,categoria,paises_abordados,tags,tempo_leitura_min,impactos_praticos,fontes_citadas,links_acervo_interno,auditoria_aprovada,aviso_correcao_material,model_id,status,review_status,published_at,created_at,updated_at}]}` |

### 4.3 Execuções de Pipeline (NOVO)
| Método | Path | Query | Resposta |
|---|---|---|---|
| GET | `/v2/admin/execucoes` | `limit?` (default 20) | `{ok: true, execucoes: [{id, job_nome, recurso_chave, status, documentos_novos, eventos_atualizados, erro_detalhe, started_at, finished_at}]}` |

### 4.4 Fontes (existentes)
- `GET /v2/admin/fontes` → `{ok, fontes:[{id,nome,url,tipo_fonte,cadencia,peso_confianca,politica_uso_status,coleta_permitida,ativo,revisado_por,ultima_coleta_at,created_at}], novas_sincronizadas}`
- `POST /v2/admin/fontes` body `{nome,url,tipo_fonte,cadencia,peso_confianca,aprovar_imediato}` → `{ok, fonte}`
- `PATCH /v2/admin/fontes/{fonte_id}/ativo` body `{ativo}` → `{ok, id, ativo}`
- `DELETE /v2/admin/fontes/{fonte_id}` → `{ok, id}`
- `POST /v2/admin/fontes/sincronizar` → `{ok, novas_inseridas}`

### 4.5 Eventos / Curadoria (existentes)
- `GET /v2/admin/eventos?limite=30` → `{ok, eventos:[{id,slug,titulo_evento,categoria,nivel_confianca,status,aviso_correcao_material,updated_at,sintese_com_ressalvas}]}`
- `PATCH /v2/admin/eventos/{event_id}/status` body `{status:"aguardando_revisao"|"publicado"|"arquivado"}` → `{ok, id, status, updated_at}`
- `PATCH /v2/admin/eventos/{event_id}/sintese` body `{sintese_com_ressalvas, tipo_alteracao, errata?}` → `{ok, event_id, versao, tipo_alteracao, aviso_correcao_material}`

### 4.6 Dossies (existentes + PATCH tema/assunto)
- `GET /v2/admin/dossies` → `{ok, dossies:[...], contagens:{total,permanentes,ao_vivo,em_breve,arquivo}}`
- `POST /v2/admin/dossies` body `{slug,titulo,subtitulo,categoria,icone_ou_bandeira,data_inicio,data_fim?,meta_info?,regras_classificacao?}` → `{ok, dossie}`
- `PATCH /v2/admin/dossies/{slug}` body parcial `{titulo?,subtitulo?,categoria?,icone_ou_bandeira?,data_inicio?,data_fim?,meta_info?,regras_classificacao?,workflow_status?,executive_summary?,timeline?}` → `{ok, dossie}`
- `DELETE /v2/admin/dossies/{slug}` → `{ok, slug}`
- `POST /v2/admin/dossies/{slug}/generate` → `{ok, dossie}`
- `POST /v2/admin/dossies/suggest-ai` body `{country?, lang?, hint?}` → `{ok, sugestao:{...}, fonte_trends?}`

### 4.7 Radar — Notícias Manuais (NOVO)
- `POST /v2/admin/radar/manual` body:
```json
{
  "slug": "manual-20261117-abc123",
  "titulo": "string",
  "resumo": "string",
  "contexto": "string",
  "categoria": "geopolitica|politica|economia|cultura|geral",
  "urgencia_score": 0,
  "fonte_nome": "string",
  "fonte_url": "string",
  "pais_regiao": "BR",
  "coordenadas_geojson": {"type":"Point","coordinates":[...]} ,
  "data_publicacao": "ISO-8601",
  "origem_manual": true
}
```
→ `{ok: true, card: {...}, total_feed: int}`

- `DELETE /v2/admin/radar/manual/{slug}` → `{ok: true, slug, removidos: int}`
- `PATCH /v2/admin/radar/manual/{slug}` body parcial → `{ok: true, card: {...}}`
- `GET /v2/admin/radar/manual` → `{ok: true, cards: [card...]}`

Card retornado deve conter: `id, slug, titulo, resumo, analise, categoria, fonte_nome, fonte_url, data_publicacao, urgencia_score, paises_envolvidos, palavras_chave, origem_v2:false`.

### 4.8 Notícias Quentes — CRUD Admin (NOVO)
- `GET /v2/admin/noticias-quentes?limit=50&status=` → `{ok, noticias: [{slug,batch_id,titulo_curto,resumo_pulso,impacto_pratico,categoria,paises_envolvidos,urgencia_score,relevancia_score,nivel_confianca,ttl_horas,horas_em_destaque,veiculos_origem,fontes_urls,palavras_chave,links_internos_relacionados,identificacao_editorial,atualizado_em,destaque_ate,expires_at,updated_at,status}]}`
- `PATCH /v2/admin/noticias-quentes/{slug}` body parcial `{titulo_curto?,resumo_pulso?,impacto_pratico?,categoria?,urgencia_score?,relevancia_score?,ttl_horas?,horas_em_destaque?,status?,destaque_ate?,expires_at?,paises_envolvidos?,palavras_chave?,veiculos_origem?,fontes_urls?}` → `{ok, noticia}`
- `DELETE /v2/admin/noticias-quentes/{slug}` → `{ok, slug, removido}`

### 4.9 Radar público (referência frontend)
- `GET /api/radar` (ou `/radar`) → `{ok, cached, source, atualizado_em, updatedAt, total, items:[{id,slug,titulo,resumo,analise,categoria,fonte_nome,fonte_url,data_publicacao,origem_v2}]}`

---

## 5. Contrato Frontend (`/admin/index.html` ↔ Backend)

### 5.1 Autenticação (Login simplificado)
- Campos: **apenas** `#admin-password` (Senha, type=password) + botões `#btn-conectar` / `#btn-sair`.
- `Bearer <senha>` no `apiFetch`.
- Remover exigência de `#admin-user` / `#admin-token` / `#api-base` visível (manter fallback oculto/seletor para dev opcional).

### 5.2 Accordion
- Cada `.admin-card` é minimizável via `.admin-collapse-btn`.
- Chave localStorage: `rom_admin_acc_<sectionId>`.
- Estado visual: classe `.collapsed` no card; `aria-expanded`.

### 5.3 Cache / Refresh
- Toda chamada deve usar `?_t=${Date.now()}` (já existente) e backend com `Cache-Control: no-store, no-cache, must-revalidate`.

---

## 6. Ordem de Implementação Recomendada
1. Backend: correções de persistência/curadoria + novos endpoints (4.3, 4.7, 4.8).
2. Frontend: novo `/admin/index.html` accordion + login simplificado consumindo endpoints do contrato.
3. QA: `qa_check.ps1`, `py_compile`, `node -c`, paridade.

---

## 7. Definition of Done
- [ ] Radar persiste no Supabase independente do painel estar aberto.
- [ ] Curadoria/análise não fica travada (status + disparo manual + edição).
- [ ] `/admin` mobile-first com accordion minimizável (localStorage) e ≥44px targets.
- [ ] Login apenas usuário/senha (sem URL manual).
- [ ] CRUD completo: Radar manual, Quentes, Dossies, Fontes, Eventos, Kill Switch.
- [ ] Dashboard desktop (PC) com mesma UI/auth/lógica.
