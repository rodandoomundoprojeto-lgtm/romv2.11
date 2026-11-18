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
| GET | `/v2/admin/colunas` | Query `status?`, `limite?` (default 50) | `{ok, colunas: [{slug,titulo,subtitulo,categoria,tempo_leitura_min,auditoria_aprovada,model_id,status,review_status,reviewed_by,published_at,created_at,updated_at,nota_isencao,score_qualidade}], contagens}` |
| PATCH | `/v2/admin/colunas/{slug}/status` | Body `{status: "rascunho_auditado"\|"aprovado"\|"publicado"\|"rejeitado"}` | `{ok, slug, status, review_status, published_at, updated_at}` |
| DELETE | `/v2/admin/colunas/{slug}` | — | `{ok, slug}` |

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
- `POST /v2/admin/fontes/sugerir` body `{tema, quantidade?, categoria?}` → `{ok, sugestoes:[{nome,url,tipo_fonte,cadencia,pais_iso,justificativa,ja_cadastrada}]}`

### 4.5 Eventos / Curadoria (existentes)
- `GET /v2/admin/eventos?status=&limite=60` (`status?` opcional; `limite` default 30, UI usa 60) → `{ok, eventos:[{id,slug,titulo_evento,categoria,nivel_confianca,status,aviso_correcao_material,updated_at,sintese_com_ressalvas}], contagens:{aguardando_revisao?,publicado?,arquivado?,excluido?,total}}`
- `PATCH /v2/admin/eventos/{event_id}/status` body `{status:"aguardando_revisao"|"publicado"|"arquivado"|"excluido"}` → `{ok, id, status, updated_at}`
- `PATCH /v2/admin/eventos/{event_id}/sintese` body `{sintese_com_ressalvas, tipo_alteracao, errata?}` → `{ok, event_id, versao, tipo_alteracao, aviso_correcao_material}`
- `DELETE /v2/admin/eventos/{event_id}` → `{ok, id, status:"excluido", updated_at}` (exclusão lógica restaurável via `PATCH .../status`)

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

### 4.10 Entenda o Assunto — Tendências (Functions)
- `GET /api/busca-assunto?mode=trending&country=BR&lang=pt&_t=...` (`cache: 'no-store'`) → `{country, lang, topicosEmAlta:[{titulo|title|nome|termo, tema?, volume?}], atualizadoEm, cache?}`

---

## 5. Contrato Frontend (`/admin/index.html` ↔ Backend)

### 5.1 Autenticação (Login simplificado)
- Campos: `#admin-user` (opcional quando usar senha/token global; enviado no header `X-Admin-User` se preenchido) + `#admin-password` (Senha ou token, `type=password`, enviado como `Authorization: Bearer <senha>`) + botões `#btn-conectar` / `#btn-sair` (além de `#btn-nav-sair` na navegação lateral).
- Persistência & auto-login: chaves `rom_admin_token`, `rom_admin_user` (removida quando usuário estiver vazio) e `rom_admin_api` (fallback oculto) em `localStorage`/`sessionStorage`; no carregamento, preenche `#admin-user` e `#admin-password` com os valores salvos e executa `conectar()` automaticamente se `rom_admin_token` existir.
- Estado conectado: ao autenticar com sucesso, aplica `#admin-auth-card.is-connected` (`display: none`), exibe `#admin-panels` e `#btn-sair`, preenche `#nav-user-label` (`Conectado: <user>` ou `Conectado`) e executa `marcarAtualizado()` + `atualizarNavPorScroll()`. Em erro ou em `sair()`, remove `.is-connected`, limpa `#nav-user-label` e oculta `#admin-panels` / `#btn-sair`.
- Sem `#admin-token` ou `#api-base` visíveis na UI.

### 5.2 Accordion
- Cada `.admin-card[data-admin-section]` (7 seções) é minimizável via `.admin-collapse-btn` (alvo tátil `>= 44x44px`).
- Chave localStorage: `rom_admin_acc_<sectionId>` (`'1'` / `'0'`), tendo prioridade sobre o estado padrão.
- Estado inicial padrão (quando `rom_admin_acc_<sectionId>` não existe): seções prioritárias de análise (`#admin-group-analise`: `noticias-quentes`, `curadoria`, `radar`) iniciam expandidas; demais seções (`dossies`, `entenda`, `controle-rapido`, `fontes`) possuem `data-default-collapsed="1"` e iniciam colapsadas.
- Estado visual e acessibilidade: classe `.collapsed` no card e `aria-expanded` no botão.

### 5.3 Cache / Refresh
- Toda chamada deve usar `?_t=${Date.now()}` (já existente) e backend com `Cache-Control: no-store, no-cache, must-revalidate`.

### 5.4 Navegação Rápida Sticky (`#admin-nav`)
- Barra sticky horizontal em mobile/tablet (`top: 56px` em `<= 768px` para alinhar com `.topbar.header-single`) e sidebar sticky em desktop (`>= 1100px`, `220px`).
- Elementos obrigatórios: `#btn-ir-analise`, 7 âncoras `.admin-nav-link[data-nav-target]` com `scroll-spy` (`.active` + `aria-current="true"`), 6 contadores vivos (`#nav-count-quentes`, `#nav-count-curadoria`, `#nav-count-radar`, `#nav-count-dossies`, `#nav-count-controle`, `#nav-count-fontes`), `#btn-recolher-demais` ("Focar na análise"), `#btn-nav-sair` e `#nav-user-label`.

### 5.5 Visão Geral (`#admin-section-visao-geral`)
- Topo do painel conectado com `#overview-updated` (atualizado por `marcarAtualizado()`), `#btn-atualizar-tudo` e 6 KPIs clicáveis (`.admin-kpi[data-goto]`): `#kpi-eventos`, `#kpi-colunas`, `#kpi-quentes`, `#kpi-radar`, `#kpi-autopub`, `#kpi-execucao`.
- Clicar em um KPI expande a seção alvo (se colapsada), rola até `data-goto` e aplica tab/filtro quando especificado (`data-goto-ev-status`, `data-goto-col-status`).

### 5.6 Barras de Filtro (`.admin-filterbar`) e IDs das 7 Seções
- Todas as 4 listas de análise (`nq`, `ev`, `col`, `radar`) possuem `.admin-filterbar` persistente com busca contextual (`combinaBusca`), selects, contador `#<prefix>-resultado`, classe `.is-filtered` e botão `[data-clear-filters]`.
- Desambiguação de IDs em Notícias Quentes: a barra de filtro usa `#nq-filtro-status` e `#nq-filtro-categoria`, mantendo `#nq-status` e `#nq-categoria` exclusivos do modal `#modal-noticias-quente`.
- IDs das 7 seções (`data-admin-section` / `#admin-section-<id>`):
  - Grupo `analise` (`#admin-group-analise`): `noticias-quentes` (`#admin-section-noticias-quentes`), `curadoria` (`#admin-section-curadoria`), `radar` (`#admin-section-radar`).
  - Grupo `conteudo` (`#admin-group-conteudo`): `dossies` (`#admin-section-dossies`), `entenda` (`#admin-section-entenda`).
  - Grupo `operacao` (`#admin-group-operacao`): `controle-rapido` (`#admin-section-controle-rapido`), `fontes` (`#admin-section-fontes`).

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
