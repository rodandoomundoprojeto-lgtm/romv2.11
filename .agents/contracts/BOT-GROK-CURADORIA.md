# Contrato de Integração Full-Stack: BOT-GROK-CURADORIA

## 1. Contexto e Objetivo
- **ID da Tarefa:** `BOT-GROK-CURADORIA`
- **Resumo:** Integração do novo **Bot Grok (xAI · X & Web Search)** no Painel Administrativo (`/admin` e `/admin/index.html`) e no ecossistema de Curadoria e Radar do Rodando o Mundo.
- **Camadas Envolvidas:**
  1. **Backend / API (`api/routes_v2.py`, `curadoria/agente/coletor.py`, `curadoria/pipeline.py`):**
     - Endpoint `POST /v2/admin/bot/grok/executar`: Executa o bot Grok (`scripts/grok_x_feeder.py`), suportando dry-run, atualizando `data/noticias_x.json` e registrando telemetria em `ai_execucoes_pipeline`.
     - Endpoint `GET /v2/admin/bot/grok/status`: Retorna o status de integridade do Bot Grok (chave configurada, última edição, modelo utilizado, quantidade de notícias e tópicos por país).
     - Integração no `GET /v2/admin/radar/feed`: Inclusão dos itens de `data/noticias_x.json` com `origem: "grok_x"` e contador dedicado `contadores["grok_x"]`.
     - Integração na Curadoria (`curadoria/agente/coletor.py` e `pipeline.py`): Leitura de `data/noticias_x.json` como fonte qualificada em tempo real.
  2. **Frontend & UI (`admin/index.html`):**
     - Bloco visual moderno para o **Bot Grok (xAI · X & Web Search)** dentro da seção "Curadoria & Bot" (`#admin-section-curadoria`), com botão de disparo, switch dry-run, indicador de status ao vivo, e modal/inspeção do último payload.
     - Badge `.badge-grok` (estilo preto/chumbo com logo/ícone 𝕏) na listagem de cards do Radar.
     - Filtro por origem `grok_x` no Radar Editorial do admin.

---

## 2. Especificação dos Endpoints

### 2.1. Execução do Bot Grok
- **Endpoint:** `POST /v2/admin/bot/grok/executar`
- **Auth:** Bearer Token via `Depends(verificar_admin_token)`
- **Body Request (opcional):**
```json
{
  "dry_run": false,
  "force_mock": false
}
```
- **Response Success (200 OK):**
```json
{
  "ok": true,
  "status": "concluido",
  "job_nome": "bot_grok_x_feeder",
  "modelo": "grok-4.7",
  "total_itens": 6,
  "atualizadoEm": "2026-11-19T22:00:00Z",
  "dry_run": false,
  "topicos_paises": ["BR", "US"],
  "items": [
    {
      "relevancia": 1,
      "categoria": "Brasil · Política & Fiscal",
      "titulo": "...",
      "fonte": "Folha de S.Paulo",
      "handleX": "@folha"
    }
  ]
}
```

### 2.2. Status do Bot Grok
- **Endpoint:** `GET /v2/admin/bot/grok/status`
- **Auth:** Bearer Token via `Depends(verificar_admin_token)`
- **Response Success (200 OK):**
```json
{
  "ok": true,
  "chave_configurada": true,
  "modelo_padrao": "grok-4.7",
  "tem_arquivo": true,
  "atualizadoEm": "2026-11-19T22:00:00Z",
  "idade_minutos": 15,
  "total_itens": 6,
  "mock": false,
  "topicosEmAltaPorPais": { "BR": ["..."], "US": ["..."] }
}
```

---

## 3. UI / Visual no Admin
- **Seção:** `#curadoria-disparos` expandida com card visual dedicado ao Bot Grok.
- **Badge:** `.badge-grok` estilizada (`background: #000; color: #fff; border: 1px solid #333;`).
- **Filtro Radar:** Opção `<option value="grok_x">𝕏 Grok (xAI / X)</option>`.
