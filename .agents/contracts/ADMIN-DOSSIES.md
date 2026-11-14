# Contrato de Integração Full-Stack: ADMIN-DOSSIES

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `ADMIN-DOSSIES`
- **Resumo:** Implementação do gerenciamento de Dossiês (Permanentes e Especiais) no Dashboard Admin (`/admin` / `admin/index.html`) integrado às novas rotas administrativas no FastAPI (`api/routes_dossies.py`) e ajuste seguro do seed (`scripts/seed_dossies.py`).
- **Arquivos Alvo (Backend):** `api/routes_dossies.py`, `scripts/seed_dossies.py`
- **Arquivos Alvo (Frontend):** `admin/index.html`

---

## 2. Especificação das Rotas Backend (`api/routes_dossies.py`)

Todas as rotas `/v2/admin/dossies*` devem:
- Exigir `Depends(verificar_admin_token)` (Bearer Token de `api/routes_v2.py`).
- Aplicar `aplicar_no_cache_headers(response)` (`Cache-Control: no-store, no-cache, must-revalidate`).

### 2.1. `GET /v2/admin/dossies`
- **Fonte:** Consulta `view_dossies_com_status` no PostgreSQL (incluindo contagem de `materias_count` via subconsulta em `dossie_materias`), com fallback para `_carregar_espelho()` (`data/dossies.json`) caso `conn is None`.
- **Resposta `200 OK`:**
```json
{
  "ok": true,
  "fonte": "banco | espelho",
  "gerado_em": "ISO-8601",
  "contagens": {
    "total": 36,
    "permanentes": 24,
    "ao_vivo": 2,
    "em_breve": 5,
    "arquivo": 5
  },
  "dossies": [
    {
      "id": 1,
      "slug": "copa-do-mundo-2026",
      "titulo": "Copa do Mundo FIFA 2026",
      "subtitulo": "...",
      "tipo": "especial",
      "categoria": "Eventos",
      "icone_ou_bandeira": "Trophy",
      "data_inicio": "2026-06-11T00:00:00-03:00",
      "data_fim": "2026-07-19T23:59:59-03:00",
      "meta_info": "11 jun – 19 jul 2026",
      "rota": null,
      "status": "em_breve",
      "veiculos_count": 0,
      "materias_count": 0,
      "regras_classificacao": { "palavras_chave": ["copa", "fifa"], "paises": [] },
      "ultima_atualizacao": "ISO-8601"
    }
  ]
}
```

### 2.2. `PATCH /v2/admin/dossies/{slug}`
- **Body JSON (Pydantic v2 — campos opcionais):**
  - `titulo`: `Optional[str]`
  - `subtitulo`: `Optional[str]`
  - `categoria`: `Optional[str]`
  - `icone_ou_bandeira`: `Optional[str]`
  - `data_inicio`: `Optional[datetime]` (aceita `YYYY-MM-DD` ou ISO-8601; `None` se limpo)
  - `data_fim`: `Optional[datetime]` (aceita `YYYY-MM-DD` ou ISO-8601; `None` se limpo)
  - `meta_info`: `Optional[str]`
  - `regras_classificacao`: `Optional[dict]` (`{"palavras_chave": [...], "paises": [...]}`)
- **Regras:**
  - Exigir banco ativo (`conn is not None`, senão `503`).
  - Validar `data_fim >= data_inicio` quando ambos estiverem presentes (senão `422`).
  - Atualizar `ultima_atualizacao = NOW()` no PostgreSQL.
  - Retornar `{"ok": true, "dossie": { ...item atualizado de view_dossies_com_status... }}`.

### 2.3. `POST /v2/admin/dossies`
- **Body JSON (Pydantic v2):**
  - `slug`: `str` (normalizado em lowercase slug; `409` se já existir)
  - `titulo`: `str`
  - `subtitulo`: `str`
  - `categoria`: `str` (default `"Eventos"`)
  - `icone_ou_bandeira`: `str` (default `"Globe"`)
  - `data_inicio`: `datetime` (obrigatório para `tipo = 'especial'`)
  - `data_fim`: `Optional[datetime]`
  - `meta_info`: `Optional[str]`
  - `regras_classificacao`: `dict` (`{"palavras_chave": [...], "paises": [...]}`)
- **Regras:**
  - Cria exclusivamente dossiês `tipo = 'especial'`.
  - Valida `data_fim >= data_inicio` se `data_fim` informado (`422`).
  - Retorna `201 Created` com `{"ok": true, "dossie": { ... }}`.

### 2.4. `DELETE /v2/admin/dossies/{slug}`
- **Regras:**
  - Permite remover **apenas** dossiês com `tipo = 'especial'`.
  - Se `tipo == 'permanente'`, retornar `400` ou `403` (`"Dossiês permanentes não podem ser removidos."`).
  - Se não encontrado, retornar `404`.
  - Retorna `200 OK` com `{"ok": true, "deleted_slug": slug}`.

---

## 3. Ajuste em `scripts/seed_dossies.py`
- Alterar o comportamento padrão de `--seed` para usar `ON CONFLICT (slug) DO NOTHING` (preservando edições manuais da redação feitas via Dashboard), e adicionar flag explícita `--force-overwrite` caso alguém queira sobrescrever com `DO UPDATE` (ou suportar `--safe` como alias explícito).

---

## 4. Especificação da Interface (`admin/index.html`)
- Adicionar `<section class="admin-card" id="admin-dossies-card">` dentro de `#admin-panels`:
  - **Cabeçalho:** Título `"Dossiês Editoriais (Permanentes & Especiais)"`, badges de contagem (`Total`, `Ao Vivo`, `Em Breve`, `Arquivo`) e botão `"Novo Dossiê Especial"` (`#btn-novo-dossie`).
  - **Filtros Rápidos:** Botões para alternar entre:
    - `Todos` (`all`)
    - `Especiais (Ao Vivo / Em Breve)` (`especiais_ativos`)
    - `Especiais (Arquivo)` (`especiais_arquivo`)
    - `Permanentes` (`permanentes`)
  - **Tabela / Lista:** Colunas: Ícone/Bandeira, Título (e slug), Tipo, Status atual (ponto pulsante verde `.dossie-pulse-dot` em `ao_vivo`), Período configurado (`meta_info` / datas), Matérias vinculadas (`materias_count` / `veiculos_count`), Ações (`Editar` e, para `especial`, `Excluir`).
  - **Modal de Edição / Criação (`#modal-dossie`):**
    - Inputs: `titulo`, `subtitulo`, `categoria`, `icone_ou_bandeira`, `data_inicio` (`type="date"`), `data_fim` (`type="date"`), `meta_info`, `palavras_chave` (tags separadas por vírgula) e `paises` (códigos ISO separados por vírgula).
    - Em modo criação (`POST /v2/admin/dossies`): incluir campo `slug` (ou gerar automaticamente a partir do título com opção de editar).
    - Ao salvar: chama `PATCH /v2/admin/dossies/{slug}` (ou `POST /v2/admin/dossies`), exibe toast de sucesso e recarrega a lista/contadores instantaneamente sem recarregar a página.
