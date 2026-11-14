# Protocolo de Interação, Governança e Regras de Desenvolvimento (RoM V2)

Sempre que interagirmos (especialmente por voz ou transcrição de áudio), siga rigorosamente os 4 itens abaixo:

---

### 1. Pausa de Silêncio e Não Interrupção Prematura
* Respeite o tempo de raciocínio e pausas naturais na fala (regra dos 3 segundos de silêncio).
* Se a frase transcrita estiver incompleta, hesitante ou com ideia inacabada (ex: sem predicado ou cortada no meio), não tente adivinhar ou disparar ações precipitadas; aguarde a conclusão da ideia.

---

### 2. Comandos de Disparo Rápido (Inglês)
* **Gatilhos:** `"go go go"`, `"let's go"` / `"lets go"`, `"let's do it"` / `"lets do it"`, `"start this shit"`.
* Ao identificar qualquer uma dessas expressões no final da fala, responda e execute a instrução **imediatamente**, dispensando qualquer tempo de espera.

---

### 3. Finalização Explícita (Português)
* **Gatilhos:** `"ok ia confirmado"`, `"confirmado"`, `"pode responder"`, `"câmbio"`.
* Ao detectar esses termos, entenda que a frase foi 100% finalizada. Responda na hora com fluidez e objetividade, sem aguardar tempo de silêncio extra.

---

### 4. Modo ELI5 ("Élí Cinco" / "ELI5")
* **Gatilhos:** `"eli5"`, `"élí cinco"`, `"eli 5"`, `"eli-5"` (falado ou digitado).
* Ao detectar esse comando, explique o tópico imediatamente no estilo **Explain Like I'm 5 (ELI5)**:
  * Linguagem super simples, direta e acessível;
  * Use analogias cotidianas e metáforas visuais práticas;
  * Evite termos técnicos e jargões complicados (ou explique-os de maneira lúdica se forem essenciais);
  * Mantenha a clareza conceitual sem complicação.

---

### 5. Controle de Versão pelo Nome da Pasta do Deploy
* **Regra mandatória de versionamento:** O número da versão atual do site é **sempre** extraído do nome da pasta raiz do projeto/deploy (ex: pasta `ROM V2.9` -> versão `v2.9`; próxima pasta `ROM V2.10` -> versão `v2.10`).
* Manter a versão atual do site sempre marcada:
  1. Na aba/página **Sobre** (`sobre.html` e `/sobre`), destacada no chip/badge de apresentação;
  2. No **rodapé** (`.footer-credit` via tag `.footer-version`), junto aos créditos de direitos autorais.
  *(Não exibir versão no cabeçalho/topbar).*

---

### 6. Armazenamento Centralizado de Backups
* **Regra obrigatória:** NUNCA criar arquivos ou pastas soltas de backup (`_backup_*`, `*.backup*`) diretamente na raiz do projeto ou na pasta `data/`.
* Todo e qualquer backup preventivo antes de alterações (BUGs, Sugestões ou dados) deve ser salvo **obrigatoriamente dentro da pasta `_backups/`** (ex: `_backups/BUG-XX/` ou `_backups/SUG-XX/`).

---

### 7. Padrão Universal de Busca e Assuntos do Momento
* **Busca Contextual e Abrangência Semântica:**
  * Em **todos os campos de pesquisa** e para **todos os países do site**, nunca utilizar filtros eliminadores rígidos que exijam 100% dos tokens literais na manchete curta (como `tokens.every(...)`), pois os agregadores RSS costumam resumir títulos enquanto o motor indexa o corpo completo.
  * Utilizar sempre **pontuação ponderada de relevância** (frase exata > todos os termos > termos centrais/contexto > bônus de recência), garantindo que buscas por frases, contextos e expressões compostas tragam cobertura real sem telas vazias.
* **Captura Contínua de Assuntos do Momento:**
  * Priorizar sempre a detecção dinâmica de tendências e notícias quentes da hora para o país aberto, atualizando sugestões de pesquisa com o que está em alta no exato momento, sem depender apenas de listas estáticas ou histórico residual do navegador.
* **Invalidação Rigorosa de Cache em Atualizações (Refresh):**
  * Todo botão ou comando de "Atualizar" notícias em tempo real deve enviar parâmetros de cache-busting (`_t=`), limpar caches locais (`localStorage`) e responder no backend com cabeçalhos `Cache-Control: no-store, no-cache`, impedindo que navegadores ou o CDN do Netlify entreguem respostas antigas em cache.

---

### 8. Arquitetura de Orquestração Multi-Agente e Isolamento de Contexto
* **Isolamento de Contexto por Camada:**
  * Cada subagente opera em uma janela de contexto independente, lendo **apenas** os arquivos da sua respectiva área (evitando poluir a conversa principal com milhares de tokens de código alheio).
* **Divisão Oficial dos 3 Subagentes (`.agents/agents/`):**
  1. **`frontend-ui` (Frontend & UI):** Cuida exclusivamente de telas, componentes visuais, HTML (`index.html`, `200.html`, `sobre.html`, rotas estáticas), CSS (`styles.css`) e interações DOM (`app.js`, `noticias.js`). Proibido ler `functions/**`, `workers/**`, `src/**` ou `data/feed_output.json`.
  2. **`backend-logic` (Backend & Lógica):** Cuida exclusivamente de APIs Serverless (`functions/api/*`, `functions/lib/*`), Workers (`workers/*`), coletores Python (`main.py`, `src/*`), regras de negócio e persistência de dados (`data/*`, `config/*`). Proibido ler `styles.css` ou arquivos HTML de interface.
  3. **`qa-integrator` (QA & Integrador):** Valida se a mudança não quebrou outras partes através de checagem de sintaxe (`node -c`, `python -m py_compile`), conformidade com o contrato de dados, paridade `index.html`/`200.html` e auditoria automatizada (`.agents/skills/multi-agent-orchestrator/scripts/qa_check.ps1`).
* **Padrão de Prevenção de Conflitos (Contract-First):**
  * Para tarefas que exigem ambos (Frontend e Backend), o Orquestrador coordena a entrega definindo primeiro um **Contrato de Dados** em `.agents/contracts/<ID>.md` (interfaces, endpoints, query params e JSON schema) antes da implementação em si.

---

### 9. Stack Tecnológica Oficial (Motor V2)
* **Linguagem & Runtime:** Python 3.11+
* **Framework Web / API:** FastAPI
* **Banco de Dados Relacional & Locks:** PostgreSQL (com controle explícito de concorrência via Session-Level Advisory Locks: `pg_try_advisory_lock` / `pg_advisory_unlock`)
* **Validação e Contratos de Dados:** Pydantic v2 (modelos fortemente tipados, validação estrita e schemas de saída limpos)
* **SDK de Inteligência Artificial:** `google-genai` (SDK unificado do Google Gemini para chamadas de API estruturadas)

---

### 10. Alocação e Especialização de Modelos Gemini
* **`gemini-2.5-flash` (Pipeline de Pulso e Operações em Tempo Real):**
  * Dedicado ao pipeline de pulso (cadência de 30m), ingestão rápida de fontes, agrupamento de documentos em eventos, extração pontual de evidências/afirmações factuais e rotulagem temática.
* **`gemini-2.5-pro` (Pipeline Editorial e Sínteses Aprofundadas):**
  * Dedicado à síntese jornalística comparada definitiva com ressalvas integradas, contextualização histórica/geopolítica ("Entenda o contexto") e geração de análises analíticas aprofundadas com revisão humana.

---

### 11. Validação Obrigatória de URLs Internas (Prevenção de 404 e Alucinações)
* **Regra Mandatória de Integridade de Rotas:**
  * Toda e qualquer URL interna gerada, sugerida ou vinculada pela IA (ex.: conexões de acervo, links entre eventos, seções temáticas ou páginas de países do Atlas) **DEVE ser estritamente validada** antes de ser gravada no banco ou exibida ao público.
  * **Fontes de Validação:**
    1. **Banco de Dados:** Existência confirmada do slug ativo e publicado em `ai_eventos.slug` ou tabela de eventos correspondente;
    2. **Sitemap / Rotas Estáticas:** Validação contra o `sitemap.xml` oficial ou catálogo de rotas registradas da aplicação.
  * **Tratamento de Falhas (Dead Link Prevention):**
    * Links que não existam comprovadamente no banco ou sitemap jamais devem ser publicados como links clicáveis. Devem ser descartados ou substituídos por texto puro descritivo, impedindo qualquer ocorrência de erro 404 ou alucinação de navegação para usuários e buscadores.
