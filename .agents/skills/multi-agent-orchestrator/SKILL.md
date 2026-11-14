---
name: multi-agent-orchestrator
description: >-
  Orquestra tarefas de desenvolvimento no projeto Rodando o Mundo (ROM) dividindo o trabalho entre 3 subagentes com isolamento estrito de contexto (frontend-ui, backend-logic e qa-integrator) e coordenando entregas Full-Stack via Contratos de Dados. Use esta skill sempre que executar tarefas que envolvam múltiplas camadas ou refatorações estruturadas.
---

# Orquestrador Multi-Agente (ROM)

Esta skill define o protocolo oficial do **Orquestrador Principal** para coordenar os 3 subagentes especializados mantendo **isolamento estrito de contexto** e **prevenção de conflitos por contrato**.

---

## 1. Os 3 Subagentes e Suas Fronteiras

| Subagente | Escopo Permitido | Escopo Bloqueado |
| :--- | :--- | :--- |
| **`frontend-ui`** | `*.html`, `styles.css`, `app.js`, `noticias.js`, pastas de rotas estáticas e SVGs/assets. | `functions/**`, `workers/**`, `src/**`, `main.py`, `data/feed_output.json`. |
| **`backend-logic`** | `functions/api/*.js`, `functions/lib/*.js`, `workers/**`, `src/*.py`, `main.py`, `data/*`, `config/*`, `_redirects`. | `styles.css`, `*.html`, rotas estáticas e assets visuais. |
| **`qa-integrator`** | Auditoria cruzada (`qa_check.ps1`), `node -c`, `python -m py_compile`, conformidade com contrato e regras do `GEMINI.md`. | Proibido alterar arquivos de negócio ou estilos diretamente. |

---

## 2. Passo a Passo de Execução do Orquestrador

### Passo 1: Classificação e Backup Preventivo
1. Identifique a natureza da tarefa:
   - **Apenas Frontend/UI:** Acione `frontend-ui` -> depois `qa-integrator`.
   - **Apenas Backend/Dados:** Acione `backend-logic` -> depois `qa-integrator`.
   - **Full-Stack (Frontend + Backend):** Execute obrigatoriamente o **Passo 2 (Contrato de Dados)** antes da implementação.
2. Crie o backup preventivo dos arquivos que serão modificados dentro de `_backups/<ID-DA-TAREFA>/` (nunca na raiz ou solto em `data/`).

### Passo 2: Contrato de Dados (Apenas Tarefas Full-Stack)
1. Antes de invocar `frontend-ui` ou `backend-logic`, crie um arquivo `.agents/contracts/<ID-DA-TAREFA>.md` baseado em [TEMPLATE_CONTRACT.md](../../contracts/TEMPLATE_CONTRACT.md).
2. Defina explicitamente:
   - URL do endpoint, método e query params (incluindo `_t` para cache-busting);
   - Formato exato do JSON de resposta (nomes dos campos e tipos);
   - Cabeçalhos de cache (`Cache-Control: no-store, no-cache` em refresh);
   - IDs/classes DOM e chave do `localStorage` no cliente.

### Passo 3: Disparo Isolado dos Subagentes (`invoke_subagent`)
- Caso os subagentes ainda não estejam registrados na sessão ativa, registre-os com `define_subagent` usando as instruções de:
  - [frontend-ui.md](../../agents/frontend-ui.md)
  - [backend-logic.md](../../agents/backend-logic.md)
  - [qa-integrator.md](../../agents/qa-integrator.md)
- Ao invocar cada subagente via `invoke_subagent`:
  - Passe no `Prompt` apenas a lista de arquivos da sua respectiva área e o caminho do contrato `.agents/contracts/<ID-DA-TAREFA>.md`.
  - Reforce que o subagente **não deve ler** arquivos fora do seu domínio.

### Passo 4: Validação pelo Subagente `qa-integrator`
1. Após a conclusão de `frontend-ui` e/ou `backend-logic`, invoque `qa-integrator`.
2. Instrua-o a rodar o script de verificação cruzada:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents/skills/multi-agent-orchestrator/scripts/qa_check.ps1
   ```
3. Se `qa-integrator` reportar `FAIL`, reabra apenas o subagente responsável pela camada com falha para correção pontual e revalide até obter `PASS`.
