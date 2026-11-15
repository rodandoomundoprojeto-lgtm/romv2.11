# Contrato de Integração Full-Stack: SUG-ULTIMAS-MANCHETES

## 1. Contexto e Objetivo
- **ID da Tarefa:** `SUG-ULTIMAS-MANCHETES`
- **Resumo:** Renomear a seção "Manchetes ao vivo" para "Últimas manchetes" no painel de país e garantir que todas as manchetes de países estrangeiros venham traduzidas para o português por padrão, com botão para alternar para o idioma original.
- **Arquivos Alvo (Backend):** `functions/api/atlas-pais.js`
- **Arquivos Alvo (Frontend):** `app.js`

## 2. Especificação da Requisição (Frontend -> Backend)
- **Endpoint:** `/api/atlas-pais`
- **Método HTTP:** `GET`
- **Query Params:** `pais`, `nome`, `refresh`, `_t` (conforme `ATLAS-VIVO.md`)

## 3. Especificação da Resposta (Backend -> Frontend)
- **Payload de Sucesso (HTTP 200):**
  - `items`: array de objetos `{ id, titlePt, titleOriginal, url, source, publishedAt, score, country }`
  - Para países não lusófonos (`!['BR','PT','AO','MZ','CV','GW','ST','TL'].includes(pais)`), o backend deve traduzir `titlePt` em paralelo (`Promise.all`) sem pular títulos iniciados por `"A "` (bug anterior do regex `/^(o|a|...)/i`).

## 4. Elementos DOM e Comportamento (Frontend)
- **Título da Seção (`#atlas-live-heading`):** `"Últimas manchetes · " + esc(cName)` (substituindo `"Manchetes ao vivo · "`).
- **Tradução garantida no cliente:** Caso `/api/atlas-pais` retorne itens sem tradução (`titlePt === titleOriginal`) ou o `fallbackRssBrowser()` seja acionado em países não lusófonos, o frontend deve usar `translateTextsMap(..., 'pt')` para traduzir os títulos para português antes/logo após renderizar, atualizando `titlePt` e o cache `localStorage`.
- **Botão de alternância:** Exibir `titlePt` (em português) por padrão e manter o botão `.atlas-lang-toggle` com texto `"Ver original"` (alternando para `"Ver em português"` quando o original estiver visível).
