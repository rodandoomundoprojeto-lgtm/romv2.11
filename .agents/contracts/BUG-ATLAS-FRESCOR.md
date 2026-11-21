# Contrato de Integração Full-Stack: BUG-ATLAS-FRESCOR

## 1. Contexto e Diagnóstico do Problema
- **ID da Tarefa:** `BUG-ATLAS-FRESCOR`
- **Diagnóstico:** As últimas manchetes da Alemanha (e potencialmente outros países) ficaram congeladas no dia 16 de novembro de 2026 porque:
  1. No Edge (Cloudflare Pages), o fetch direto para `news.google.com` falhou ou sofreu restrição de IP/User-Agent, retornando `items: []`.
  2. O fallback do cliente (`fallbackRssBrowser()`) usava URL estática sem cache-busting para o `rss2json`, servindo dados em cache antigo.
  3. O `localStorage` mantinha dados antigos sem descarte por expiração cronológica absoluta.
- **Arquivos Alvo (Backend):** `functions/api/atlas-pais.js`, `api/routes_v2.py`
- **Arquivos Alvo (Frontend):** `app.js`

## 2. Especificação do Backend (`functions/api/atlas-pais.js` e `api/routes_v2.py`)
- **Headers HTTP Reais e Modernos:** Usar User-Agent de navegador moderno (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`), `Accept: application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8` e `Accept-Language: de,en;q=0.9,pt;q=0.8`.
- **Contingência em Camadas:**
  1. Fetch direto no feed oficial do Google News RSS com timeout de 7.5s.
  2. Caso o fetch direto retorne vazio ou falhe no Edge, acionar fallback via coletor estruturado (`https://api.rss2json.com/v1/api.json?rss_url=` com cache-busting do timestamp).
- **Ordenação e Frescor Estrito:** Garantir ordenação estrita por `publishedAt DESC` antes da seleção e tradução dos 4 itens principais.

## 3. Especificação do Frontend (`app.js`)
- **Cache-Busting no Fallback do Cliente:** Em `fallbackRssBrowser()`, incluir sempre `&_t=` no parâmetro `rss_url` do `rss2json` para forçar renovação em tempo real pelo proxy.
- **Detecção de Dados Defasados no `localStorage`:** Se os dados salvos em `rom_atlas_pais_<PAIS>` possuírem itens com mais de 24 horas de defasagem em relação ao relógio atual, ou `ts` superior a `ATLAS_PAIS_TTL_MS`, revalidar compulsoriamente via rede.
- **Invalidação Rigorosa em Refresh (Regra 7):** No clique do botão de Atualizar e no refresh periódico, limpar `localStorage` daquele país e garantir carregamento limpo.
