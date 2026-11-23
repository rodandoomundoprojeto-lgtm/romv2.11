# Contrato de Integração Full-Stack: FEAT-COTA04-CONTINENTES

## 1. Contexto e Objetivo
- **ID da Tarefa:** `FEAT-COTA04-CONTINENTES`
- **Resumo:** Transição da Cota 04 (Território & Contexto) da segmentação por país para segmentação por Continente (`continentes_alvo`). Implementação do Carrossel Dinâmico de Apoio Educacional no `/entenda` alternando entre os patrocinadores dos diferentes continentes ativos. Atualização do Mídia Kit e do painel Admin.
- **Camadas Envolvidas:**
  - Backend: `api/routes_v2.py` (suporte a `continentes_alvo`, normalização e validação Pydantic v2).
  - Frontend: `app.js`, `styles.css` (lógica de casamento por continente, carrossel dinâmico no `/entenda` com dots, auto-rotação e pausa no hover).
  - Admin: `admin/index.html` (seletor em grade de continentes, detecção de conflitos de vigência).
  - Páginas Públicas: `parcerias/index.html`, `index.html`, `200.html` (comunicação da cota continental).

---

## 2. Especificação do Backend & Modelo de Dados

### 2.1. Endpoints
- `GET /v2/patrocinadores` (Público, sem auth, `Cache-Control: no-store, no-cache`)
- `PUT /v2/admin/patrocinadores` (Admin, `Depends(verificar_admin_token)`)

### 2.2. Schema de Item Cota 04 (`CotaPatrocinioItem`)
- `continentes_alvo`: `str` (default `"todos"`, max 200 chars). Valores válidos: lista separada por vírgula contendo uma ou mais chaves:
  - `todos`: Cobre o planeta inteiro
  - `sul`: América do Sul
  - `norte`: América do Norte
  - `central`: América Central e Caribe
  - `europa`: Europa
  - `asia`: Ásia
  - `africa`: África
  - `oceania`: Oceania
- `paises_alvo`: `str` (default `"todos"`, mantido para retrocompatibilidade; se `continentes_alvo` não for informado ou for vazio, normaliza a partir deste).

---

## 3. Especificação do Frontend

### 3.1. Gaveta de Veículos do País
- Ao abrir um país (`country.c` ou `cont`), busca patrocinador ativo com `continentes_alvo` correspondente (ou `todos`).
- Selo de topo: `Apoio Regional · {Continente}` (ex: `Apoio Regional · Europa`) com logo do parceiro.
- Rodapé da gaveta: Mensagem com `{pais}` dinâmico mantida (ex: *"Soluções financeiras para suas conexões com a França"*).

### 3.2. Carrossel no `/entenda`
- Seleciona todos os patrocinadores vigentes da Cota 04.
- Se houver >= 2 patrocinadores: renderiza carrossel com rotação a cada 7 segundos, indicadores clicáveis (dots), e pausa automática no hover (`mouseenter`/`mouseleave`).
- Cada slide exibe:
  - Tag: `Apoio Educacional · {Nome do Continente}`
  - Nome/Logo do patrocinador
  - Frase e botão CTA (rastreado e com segurança)
- Se houver apenas 1 patrocinador: exibe card estático padrão.

---

## 4. Checklist de Consistência
- [x] Backups preventivos em `_backups/FEAT-COTA04-CONTINENTES`.
- [ ] Backend validado com `python -m py_compile api/routes_v2.py`.
- [ ] Frontend validado com `node -c app.js`.
- [ ] Paridade estrita mantida entre `index.html` e `200.html`.
- [ ] Auditoria de QA concluída com sucesso.
