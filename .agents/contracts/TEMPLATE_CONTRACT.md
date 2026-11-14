# Contrato de Integração Full-Stack: [ID-DA-TAREFA]

> **Instrução ao Orquestrador:** Preencha e salve uma cópia deste contrato em `.agents/contracts/<ID-DA-TAREFA>.md` **antes** de acionar os subagentes `backend-logic` e `frontend-ui` em tarefas que envolvam ambas as camadas.

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `BUG-XX` / `SUG-XX`
- **Resumo:** Breve descrição do fluxo ponta a ponta entre UI e Backend.
- **Arquivos Alvo (Backend):** `functions/api/...`
- **Arquivos Alvo (Frontend):** `app.js`, `index.html`, `200.html`, `styles.css`

---

## 2. Especificação da Requisição (Frontend -> Backend)
- **Endpoint:** `/api/<rota>`
- **Método HTTP:** `GET` | `POST`
- **Query Params / Body JSON:**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `pais` | `string` | Sim/Não | Código ISO ou slug do país |
  | `q` | `string` | Sim/Não | Termo de busca contextual |
  | `_t` | `number` | Quando Refresh | Timestamp (`Date.now()`) para cache-busting |

---

## 3. Especificação da Resposta (Backend -> Frontend)

### 3.1. Headers Obrigatórios
- Em requisições normais: `Content-Type: application/json; charset=utf-8`
- Em requisições com `_t` ou `refresh=1`: `Cache-Control: no-store, no-cache, must-revalidate`

### 3.2. Payload de Sucesso (HTTP 200)
```json
{
  "ok": true,
  "cached": false,
  "country": "BR",
  "updatedAt": "2026-11-12T17:35:00Z",
  "trendingTopics": ["string"],
  "items": [
    {
      "id": "string",
      "title": "string",
      "url": "string",
      "source": "string",
      "publishedAt": "string",
      "score": 100
    }
  ]
}
```

### 3.3. Payload de Erro / Fallback (HTTP 4xx / 5xx ou `ok: false`)
```json
{
  "ok": false,
  "error": "Mensagem descritiva para log/UI",
  "items": []
}
```

---

## 4. Elementos DOM e Estados Visuais (Frontend)
- **Container Alvo:** `#id-do-container`
- **Estado de Loading:** Classe `.is-loading` / skeleton
- **Estado Vazio / Erro:** Exibir mensagem amigável sem quebrar o layout da gaveta ou página.
- **Chave de Cache Local (`localStorage`):** `rom_cache_<chave>` (limpar obrigatoriamente no Refresh).
