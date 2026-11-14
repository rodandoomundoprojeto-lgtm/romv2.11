# Plano de Implementação: Hubs de Dossiês (Permanentes e Especiais)
**Projeto:** Rodando o Mundo — Atlas Jornalístico  
**Objetivo:** Implementar a nova arquitetura de dados, componentes de interface e catálogo de conteúdo para os **Dossiês Permanentes** (24 temas) e **Dossiês Especiais** (12 eventos temporários com ciclo de vida).

---

## 1. Instruções para o Agente de Desenvolvimento
> **Prompt sugerido para colar no seu agente (Cursor, Lovable, Bolt, Windsurf, etc.):**
> *"Leia o arquivo `plano_implementacao_dossies.md` e implemente a estrutura de dados e a atualização visual da página/seção de Dossiês do 'Rodando o Mundo'. Mantenha o design system atual (fundos claros/escuros, bordas sutis arredondadas `rounded-xl`, tipografia limpa), adicionando a seção superior de 'Dossiês Especiais' com badges de status dinâmicos (`Ao vivo`, `Em breve`, `Arquivo`) e expandindo a grade de 'Dossiês Permanentes' com filtros por categoria."*

---

## 2. Estrutura de Dados (Schema / JSON)
Crie ou atualize o arquivo de dados (ex: `src/data/dossies.ts` ou `dossies.json`) seguindo esta tipagem:

```typescript
export type DossieType = 'permanente' | 'especial';
export type DossieStatus = 'ao_vivo' | 'em_breve' | 'arquivo' | 'ativo';

export interface Dossie {
  id: string;
  slug: string;
  tipo: DossieType;
  categoria: 'Geopolítica' | 'Economia' | 'Tecnologia' | 'Clima e Ciência' | 'Sociedade' | 'Eventos';
  titulo: string;
  descricao: string;
  iconeOuBandeira: string; // Código ISO da bandeira (ex: 'BR', 'US', 'UN') ou nome do ícone (Lucide)
  status: DossieStatus;
  metaInfo: string; // Ex: "12 veículos · Atualizado hoje" ou "11 jun – 19 jul 2026"
  veiculosCount: number;
  ctaText: string; // Ex: "Acessar dossiê completo →" ou "Acompanhar cobertura →"
}
```

---

## 3. Regras de Interface (UI/UX)

### A. Seção Superior: Dossiês Especiais (Cobertura Temporária)
* **Cabeçalho da Seção:**
  * Eyebrow (texto superior azul/destaque): `COBERTURA TEMPORÁRIA · EVENTOS EM DESTAQUE`
  * Título: `Dossiês Especiais`
  * Subtítulo: `Acompanhamento intensivo em tempo real de grandes eventos globais, cimeiras, eleições e marcos culturais.`
* **Diferenciação Visual nos Cards:**
  * **Ícone Temático:** Usar ícones minimalistas (ex: `Trophy`, `Globe`, `Vote`, `Award`, `Rocket` do `lucide-react`) no canto superior esquerdo em vez de bandeiras.
  * **Badge de Status (Canto superior direito):**
    * `ao_vivo`: Fundo verde suave (`bg-emerald-50 text-emerald-700 border-emerald-200`) + ponto pulsante `● Ao vivo · {veiculosCount} veículos`
    * `em_breve`: Fundo âmbar/azul suave (`bg-amber-50 text-amber-700 border-amber-200`) + `⏳ {metaInfo}`
    * `arquivo`: Fundo neutro (`bg-slate-100 text-slate-600 border-slate-200`) + `✓ Arquivo · {metaInfo}`
  * **Período do Evento:** Exibir datas logo abaixo do título em fonte `text-xs text-slate-500`.

### B. Seção Principal: Dossiês Permanentes (Hubs Temáticos)
* **Cabeçalho da Seção:**
  * Manter o padrão atual: `COBERTURA PERMANENTE · HUBS TEMÁTICOS` / `Dossiês Permanentes`.
  * Adicionar **pílulas de filtro por categoria** (`Todos`, `Geopolítica`, `Economia`, `Tecnologia`, `Clima e Ciência`, `Sociedade`) acima da grade de cards.
* **Grid:**
  * Exibir 3 ou 6 cards em destaque na home e todos os 24 na página `/dossies` (ou ao clicar em *"Ver todos os 24 dossiês →"*).

---

## 4. Catálogo Completo para Popular o Banco / Arquivo de Dados

### Parte 1: Dossiês Permanentes (24 Itens)

#### Eixo: Política e Geopolítica
1. **Política no Brasil** (`BR`)
   * *Descrição:* Acompanhe as decisões do Planalto, do Congresso Nacional e do STF sob a ótica de veículos de diferentes linhas editoriais.
2. **Política nos Estados Unidos** (`US`)
   * *Descrição:* Casa Branca, Congresso americano, Suprema Corte e o impacto global das decisões de Washington.
3. **Eleições e Democracia no Mundo** (`GLOBAL`)
   * *Descrição:* Cobertura eleitoral, sistemas de votação, pesquisas e disputas políticas no Brasil e no exterior.
4. **Conflitos no Médio Oriente** (`MIDEAST`)
   * *Descrição:* Acompanhe os desdobramentos militares, acordos diplomáticos, crises humanitárias e o impacto energético na região sob diferentes perspetivas internacionais.
5. **Guerra na Europa de Leste** (`UA`)
   * *Descrição:* Evolução do conflito entre Rússia e Ucrânia, sanções económicas, segurança da NATO e repercussões geopolíticas no continente europeu.
6. **Tensões no Indo-Pacífico e China** (`CN`)
   * *Descrição:* Disputas comerciais, tecnologia, a questão de Taiwan e o equilíbrio de poder entre Pequim, Washington e aliados asiáticos.
7. **União Europeia e Política Continental** (`EU`)
   * *Descrição:* Decisões de Bruxelas, crises migratórias, transição energética e o avanço de novas forças políticas nos parlamentos europeus.
8. **América Latina em Transformação** (`LATAM`)
   * *Descrição:* Cenários políticos, integração regional, crises institucionais e movimentos sociais nos países vizinhos ao Brasil.

#### Eixo: Economia e Trabalho
9. **Economia no Brasil** (`BR`)
   * *Descrição:* Inflação, taxa Selic, câmbio, mercado de trabalho, agronegócio e contas públicas em múltiplas fontes.
10. **Economia Global e Bancos Centrais** (`GLOBAL`)
    * *Descrição:* Taxas de juro, inflação mundial, decisões do Fed e do BCE, cadeias de suprimentos e riscos de recessão nos principais mercados.
11. **Transição Energética e Petróleo** (`ENERGY`)
    * *Descrição:* OPEP+, preços dos combustíveis, investimentos em energias renováveis, hidrogénio verde e a disputa global por minerais críticos.
12. **Comércio Internacional e Tarifas** (`TRADE`)
    * *Descrição:* Acordos comerciais, protecionismo, cadeias globais de produção e o papel de blocos como BRICS, Mercosul e G20.
13. **Futuro do Trabalho e Emprego** (`WORK`)
    * *Descrição:* Automação, trabalho remoto, reformas laborais, produtividade e o impacto das novas tecnologias nas profissões.
14. **Crise Habitacional e Custo de Vida** (`HOUSING`)
    * *Descrição:* Mercado imobiliário, especulação urbana, acesso à moradia e políticas públicas nas grandes metrópoles do mundo.

#### Eixo: Tecnologia e Sociedade Digital
15. **Inteligência Artificial e Regulação** (`AI`)
    * *Descrição:* Avanços dos grandes modelos de IA, impactos éticos, direitos de autor, corrida tecnológica e leis de controlo global.
16. **Big Tech, Redes Sociais e Privacidade** (`TECH`)
    * *Descrição:* Monopólios digitais, moderação de conteúdo, desinformação, segurança de dados e embates regulatórios com governos.
17. **Cibersegurança e Guerra Digital** (`CYBER`)
    * *Descrição:* Ataques a infraestruturas críticas, espionagem estatal, proteção de dados e a nova fronteira da defesa nacional.

#### Eixo: Clima, Ambiente e Ciência
18. **Crise Climática e Eventos Extremos** (`CLIMATE`)
    * *Descrição:* Acordos globais, metas de carbono, desastres ambientais, transição ecológica e os impactos económicos do aquecimento global.
19. **Amazónia e Meio Ambiente no Brasil** (`BR`)
    * *Descrição:* Desmatamento, bioeconomia, políticas de preservação, povos indígenas e o papel ambiental do Brasil no cenário externo.
20. **Saúde Global e Pandemias** (`HEALTH`)
    * *Descrição:* Vigilância epidemiológica, avanços na medicina, sistemas públicos de saúde, vacinas e preparação para emergências sanitárias.
21. **Corrida Espacial e Exploração Científica** (`SPACE`)
    * *Descrição:* Missões lunares, satélites comerciais, agências estatais, empresas privadas e as novas fronteiras da ciência espacial.

#### Eixo: Direitos, Justiça e Sociedade
22. **Segurança Pública e Crime Organizado** (`SECURITY`)
    * *Descrição:* Narcotráfico internacional, violência urbana, políticas de encarceramento e cooperação policial transnacional.
23. **Migrações e Crises Humanitárias** (`MIGRATION`)
    * *Descrição:* Fluxos migratórios globais, políticas de fronteira, refugiados climáticos e os desafios de integração nos países de acolhimento.
24. **Direitos Humanos e Liberdade de Imprensa** (`RIGHTS`)
    * *Descrição:* Censura, perseguição a jornalistas, direitos civis, igualdade de género e o estado das liberdades individuais pelo mundo.

---

### Parte 2: Dossiês Especiais (12 Itens)

1. **Copa do Mundo FIFA 2026** (`status: 'arquivo'` ou `'ao_vivo'` conforme calendário)
   * *Descrição:* Acompanhe a fase de grupos, resultados, bastidores das seleções, impacto económico nas cidades-sede e a repercussão na imprensa internacional.
2. **Eleições Gerais no Brasil 2026** (`status: 'arquivo'` / `'ao_vivo'`)
   * *Descrição:* Pesquisas de intenção de voto, debates presidenciais, alianças partidárias, campanhas nos estados e cobertura comparada das redações brasileiras.
3. **Eleições Intercalares nos EUA (Midterms)** (`status: 'arquivo'` / `'ao_vivo'`)
   * *Descrição:* Disputa pelo controlo do Congresso americano, impacto na governação da Casa Branca e reflexos nos mercados internacionais.
4. **Conferência do Clima (COP)** (`status: 'ao_vivo'`)
   * *Descrição:* Negociações diplomáticas, metas de financiamento climático, protestos ambientais e compromissos assumidos pelas grandes potências.
5. **Cimeira do G20** (`status: 'em_breve'`)
   * *Descrição:* Encontros bilaterais, acordos comerciais, declarações conjuntas e os bastidores das decisões entre as maiores economias do planeta.
6. **Assembleia Geral da ONU** (`status: 'arquivo'`)
   * *Descrição:* Discursos dos chefes de Estado, resoluções sobre crises globais, votações no Conselho de Segurança e articulações diplomáticas em Nova Iorque.
7. **Fórum Económico Mundial (Davos)** (`status: 'em_breve'`)
   * *Descrição:* Tendências financeiras, debates sobre inteligência artificial, previsões de crescimento e a visão dos principais líderes empresariais e políticos.
8. **Jogos Olímpicos e Paralímpicos** (`status: 'em_breve'`)
   * *Descrição:* Quadro de medalhas, recordes, histórias dos atletas, organização do evento e cobertura comparada dos principais meios desportivos do mundo.
9. **Final da UEFA Champions League** (`status: 'em_breve'`)
   * *Descrição:* Análises táticas, movimentação de adeptos, impacto financeiro nos clubes europeus e cobertura pré e pós-jogo em múltiplas fontes.
10. **Temporada de Prémios e Óscares** (`status: 'em_breve'`)
    * *Descrição:* Indicados, críticas de cinema, bastidores da indústria audiovisual, bilheteiras e a receção cultural dos grandes vencedores.
11. **Prémios Nobel** (`status: 'arquivo'`)
    * *Descrição:* Anúncios diários em Medicina, Física, Química, Literatura, Paz e Economia, com o impacto científico e político de cada laureado.
12. **Missões Espaciais e Eclipses** (`status: 'ao_vivo'`)
    * *Descrição:* Lançamentos históricos, pouso de sondas, fenómenos astronómicos globais e a cobertura científica em tempo real.

---

## 5. Checklist de Entrega para o Agente
- [ ] Atualizar contadores dinâmicos na UI (ex: substituir `"Ver todos os 10 dossiês →"` por `"Ver todos os 24 dossiês →"`).
- [ ] Garantir suporte ao **Modo Escuro (Dark Mode)** já existente no botão do cabeçalho da plataforma.
- [ ] Garantir responsividade (1 coluna no mobile, 2 no tablet, 3 no desktop).
- [ ] Vincular a busca global (`Buscar país, veículo ou tema...`) para filtrar também os títulos e descrições dos novos dossiês.