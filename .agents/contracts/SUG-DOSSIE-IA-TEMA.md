# Contrato de Integração Full-Stack: SUG-DOSSIE-IA-TEMA

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `SUG-DOSSIE-IA-TEMA`
- **Resumo:** Na área de admin (`/admin`), ao criar um Dossiê com IA, abrir uma caixa para o editor sugerir o tema; a IA pesquisa fatos reais (Google News RSS / Google Trends / base local) e preenche todos os moldes do dossiê (metadados + Síntese Executiva + Linha do Tempo factual). O dossiê fica como rascunho/revisão no admin e só vai para o front público do site (`GET /v2/dossies`) se for aprovado (`workflow_status = 'published'`).
- **Arquivos Alvo (Backend):** `api/routes_dossies.py`
- **Arquivos Alvo (Frontend):** `admin/index.html`

---

## 2. Especificação das Rotas Backend (`api/routes_dossies.py`)

### 2.1. `POST /v2/admin/dossies/suggest-ai`
- **Auth:** `Depends(verificar_admin_token)`
- **Headers:** `Cache-Control: no-store, no-cache, must-revalidate`
- **Body JSON (`DossieSuggestPayload`):**
  ```json
  {
    "country": "BR",
    "lang": "pt",
    "hint": "Tema sugerido pelo editor (opcional)"
  }
  ```
- **Comportamento Backend:**
  1. Se `hint` for informado: pesquisa manchetes factuais recentes no Google News RSS (`https://news.google.com/rss/search?q=<hint>&hl=pt-BR&gl=BR&ceid=BR:pt-419`) e em `dossie_materias` / `noticias` (best-effort) para embasar a IA com fatos e datas reais.
  2. Se `hint` estiver vazio: consulta `_extrair_trends_google_rss()` e pesquisa manchetes do assunto principal no Google News RSS.
  3. Chama o Gemini (`google-genai`, structured output) para preencher **todos os moldes do dossiê**:
     - Metadados (`slug`, `titulo`, `subtitulo`, `categoria`, `icone_ou_bandeira`, `meta_info`, `data_inicio` YYYY-MM-DD — usando `today_iso` como fallback se não houver data específica —, `data_fim` opcional, `regras_classificacao`: `{"palavras_chave": [...], "paises": [...]}`).
     - `executive_summary`: `{"context": "...", "pillars": [{"title": "...", "description": "...", "category": "politica|economia|geopolitica|seguranca|sociedade"}]}` (exatamente 3 pilares).
     - `timeline`: lista de 5 a 7 marcos factuais ordenados por `date` (`YYYY-MM-DD`, `display_date`, `title`, `summary`, `type`: `past|turning_point|upcoming`).
- **Resposta `200 OK`:**
  ```json
  {
    "ok": true,
    "fonte_trends": "google_news_rss | google_trends_rss | indisponivel",
    "trends": ["..."],
    "fontes_pesquisadas": [
      { "titulo": "...", "fonte": "...", "data": "YYYY-MM-DD" }
    ],
    "sugestao": {
      "slug": "string",
      "titulo": "string",
      "subtitulo": "string",
      "categoria": "string",
      "icone_ou_bandeira": "string",
      "meta_info": "string",
      "data_inicio": "YYYY-MM-DD",
      "data_fim": "YYYY-MM-DD | null",
      "regras_classificacao": { "palavras_chave": ["string"], "paises": ["BR"] },
      "executive_summary": { "context": "string", "pillars": [] },
      "timeline": [],
      "ai_metadata": { "model": "string", "generated_at": "ISO-8601", "articles_analyzed": 0, "tema_sugerido": "string | null" }
    }
  }
  ```

### 2.2. `POST /v2/admin/dossies`
- **Alteração em `DossieCreatePayload`:**
  - Aceitar campos opcionais:
    - `workflow_status`: `Optional[Literal["draft", "review", "published"]] = "draft"`
    - `executive_summary`: `Optional[Dict[str, Any]] = None`
    - `timeline`: `Optional[List[Dict[str, Any]]] = None`
    - `ai_metadata`: `Optional[Dict[str, Any]] = None`
  - Se `workflow_status == "published"`, registrar `reviewed_at` em `ai_metadata`.
  - Persistir esses campos no `INSERT INTO dossies (...)`.

### 2.3. Publicação no Front Público (`GET /v2/dossies` e `GET /v2/dossies/{slug}`)
- **`GET /v2/dossies`:** Filtrar para retornar **apenas** dossiês com `(d.get("workflow_status") or "published") == "published"`. Dossiês em `draft` ou `review` **não** devem aparecer no front público.
- **`GET /v2/dossies/{slug}`:** Retornar `404` se `(dossie.get("workflow_status") or "published") != "published"`.
- **`GET /v2/admin/dossies`:** Continua retornando todos (`draft`, `review`, `published`) para gestão no painel admin.

---

## 3. Especificação da Interface (`admin/index.html`)

- **Botão no cabeçalho de Dossiês (`#admin-section-dossies`):**
  - Adicionar `#btn-novo-dossie-ia` ("✨ Criar Dossiê com IA") ao lado de `#btn-novo-dossie`.
- **Caixa/Modal de Sugestão de Tema (`#modal-dossie-tema-ia`):**
  - Aberta ao clicar em `#btn-novo-dossie-ia` ou em `#btn-sugerir-ia-dossie` dentro de `#modal-dossie`.
  - Contém:
    - Input/textarea `#ia-tema-input` para o editor digitar o tema desejado (ex: `"Acordo Mercosul e União Europeia"`, `"Crise energética na Europa"`), com instrução clara de que pode deixar em branco para a IA escolher dos assuntos do momento.
    - Select opcional de país/foco (`#ia-tema-pais`: `BR`, `US`, `PT`, `AR`, `GLOBAL`).
    - Botão `#btn-executar-pesquisa-ia` ("Pesquisar fatos e preencher dossiê") e `#btn-cancelar-tema-ia`.
- **Preenchimento e Revisão no `#modal-dossie`:**
  - Ao concluir `POST /v2/admin/dossies/suggest-ai`:
    - Fecha `#modal-dossie-tema-ia`, abre `#modal-dossie` (se ainda não aberto), exibe `#dossie-ai-section` (`setDossieAiSectionVisible(true)`), preenche todos os campos básicos **e** `executive_summary` + `timeline` + `ai_metadata`.
    - Habilita o botão `#btn-publicar-dossie-ia` ("Aprovar e Publicar no Portal") também no modo `create` (além de `edit`).
  - Se o editor clicar em **"Salvar Rascunho"** (`#btn-salvar-dossie`), cria/salva com `workflow_status: state.aiSuggestedMeta ? 'review' : 'draft'` (não vai para o front público).
  - Se o editor clicar em **"Aprovar e Publicar no Portal"** (`#btn-publicar-dossie-ia`), cria (se `create`) ou atualiza (se `edit`) com `workflow_status: 'published'`, publicando no front do site junto com os outros dossiês.
- **Tabela `#tbody-dossies`:**
  - Exibir badge de workflow (`Rascunho`, `Em Revisão`, `Publicado`) na coluna de Status para distinguir claramente os dossiês aprovados dos pendentes.
