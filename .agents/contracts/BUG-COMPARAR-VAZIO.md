# Contrato de Integração Full-Stack: BUG-COMPARAR-VAZIO

---

## 1. Contexto e Objetivo
- **ID da Tarefa:** `BUG-COMPARAR-VAZIO`
- **Resumo:** Ao clicar no botão "⚖️ Comparar cobertura" no card de notícia quente / destaque, a busca passava a manchete inteira bruta ("Veja o que Lula disse sobre contas públicas antes..."). O corretor ortográfico corrompia "antes" para "Artes" e os motores RSS (Google/Bing) retornavam 0 matérias com frases longas combinadas com `site:dominio`. O objetivo é garantir que o leitor sempre encontre matérias para comparar a cobertura jornalística, com extração inteligente de assunto/entidades, correção ortográfica sem mutações espúrias e busca resiliente conforme a Regra 7 do GEMINI.md.
- **Arquivos Alvo (Backend):** `functions/api/busca-assunto.js`, `netlify/functions/busca-assunto.mjs`
- **Arquivos Alvo (Frontend):** `app.js`

---

## 2. Especificação da Requisição (Frontend -> Backend)
- **Endpoint:** `/api/busca-assunto`
- **Método HTTP:** `POST`
- **Body JSON:**
  | Parâmetro | Tipo | Obrigatório | Descrição |
  | :--- | :--- | :--- | :--- |
  | `q` | `string` | Sim | Termo de busca ou assunto |
  | `cont` | `string` | Não | Continente atual |
  | `country` | `string` | Não | Código ISO do país (ex: `BR`) |
  | `countryName` | `string` | Não | Nome do país |
  | `topic` | `string` | Não | Tópico selecionado (ex: `politica`) |
  | `periodo` | `string` | Não | `24h`, `7d`, `30d` ou `all` |
  | `outlets` | `array` | Não | Lista de veículos ativos |

---

## 3. Especificação da Resposta e Regras de Negócio

### 3.1. Tratamento e Sanitização de Termo
- `PALAVRAS_COMUNS_INTACTAS` e `STOPWORDS_BUSCA` devem incluir preposições, advérbios e verbos comuns de manchetes (`antes`, `apos`, `sobre`, `entre`, `contra`, `desde`, `durante`, `ate`, `sem`, `sob`, `disse`, `diz`, `fala`, `veja`, `novo`, `nova`, `hoje`, `ontem`, `agora`).
- Proibido mutar palavras comuns em substantivos alheios (ex: "antes" jamais pode virar "Artes").

### 3.2. Extração de Consulta para Agregadores RSS
- Quando `q` recebido for uma frase longa (> 4 palavras ou estilo manchete), o backend e o frontend devem extrair os tokens centrais/entidades para envio ao Bing/Google News RSS, impedindo que a exigência de 10 palavras literais gere 0 resultados.

### 3.3. Conformidade com a Regra 7 do GEMINI.md
- O agregador já pesquisa o corpo completo da notícia. `combinaComTermo` deve ranquear por relevância e não descartar severamente matérias que os motores selecionaram para o veículo.

---

## 4. Assinaturas e Status
- **Orquestrador:** Antigravity Coordinator
- **Status:** Contrato Validado -> Em Execução
