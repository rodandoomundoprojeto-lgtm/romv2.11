/* Rodando o Mundo — Sistema Editorial, Páginas Temáticas (Hubs),
   Explicações ("Entenda o assunto"), Linhas do Tempo e Resumo do Dia */
(function () {
  'use strict';

  var ASSUNTOS = {
    'politica-brasil': {
      id: 'politica-brasil',
      nome: 'Política no Brasil',
      palavrasChave: ['brasil', 'lula', 'bolsonaro', 'flavio', 'congresso', 'senado', 'camara', 'stf', 'planalto', 'brasilia', 'impeachment', 'orcamento', 'emendas', 'anistia', 'pec', 'moraes', 'tarcisio', 'haddad'],
      pais: 'BR',
      continente: 'sul',
      tipoNoticia: 'politica',
      paginaTematica: '/politica/brasil',
      explicacaoId: 'o-que-e-o-orcamento',
      linhaDoTempoId: 'politica-brasil'
    },
    'politica-eua': {
      id: 'politica-eua',
      nome: 'Política nos Estados Unidos',
      palavrasChave: ['trump', 'estados unidos', 'eua', 'casa branca', 'congresso americano', 'biden', 'republicanos', 'democratas', 'tarifas'],
      pais: 'US',
      continente: 'norte',
      tipoNoticia: 'politica',
      paginaTematica: '/politica/estados-unidos',
      explicacaoId: 'como-funcionam-as-eleicoes-nos-eua',
      linhaDoTempoId: 'politica-eua'
    },
    'economia-brasil': {
      id: 'economia-brasil',
      nome: 'Economia no Brasil',
      palavrasChave: ['economia', 'inflação', 'ipca', 'selic', 'banco central', 'dólar', 'pib', 'arcabouço fiscal', 'juros', 'orçamento'],
      pais: 'BR',
      continente: 'sul',
      tipoNoticia: 'economia',
      paginaTematica: '/economia/brasil',
      explicacaoId: 'o-que-e-inflacao',
      linhaDoTempoId: 'economia-brasil'
    },
    'eleicoes': {
      id: 'eleicoes',
      nome: 'Eleições e Democracia',
      palavrasChave: ['eleições', 'eleição', 'urnas', 'votação', 'segundo turno', 'colégio eleitoral', 'pesquisa eleitoral', 'candidatos'],
      pais: 'BR',
      continente: 'sul',
      tipoNoticia: 'politica',
      paginaTematica: '/eleicoes',
      explicacaoId: 'como-funcionam-as-eleicoes-nos-eua',
      linhaDoTempoId: 'eleicoes'
    },
    'clima': {
      id: 'clima',
      nome: 'Clima e Transição Energética',
      palavrasChave: ['clima', 'cop30', 'aquecimento global', 'amazônia', 'desmatamento', 'emissões', 'meio ambiente', 'transição energética', 'carbono'],
      pais: 'BR',
      continente: 'sul',
      tipoNoticia: 'mundo',
      paginaTematica: '/clima',
      explicacaoId: 'o-que-e-a-cop30',
      linhaDoTempoId: 'clima'
    },
    'tecnologia': {
      id: 'tecnologia',
      nome: 'Tecnologia e Inteligência Artificial',
      palavrasChave: ['tecnologia', 'inteligência artificial', 'ia', 'chips', 'semicondutores', 'big tech', 'regulação digital', 'redes sociais', 'cibersegurança'],
      pais: 'US',
      continente: 'norte',
      tipoNoticia: 'tecnologia',
      paginaTematica: '/tecnologia',
      explicacaoId: 'o-que-e-sancao-internacional',
      linhaDoTempoId: 'tecnologia'
    },
    'guerra-ucrania': {
      id: 'guerra-ucrania',
      nome: 'Guerra na Ucrânia',
      palavrasChave: ['ucrânia', 'rússia', 'zelensky', 'putin', 'otan', 'sanções', 'kiev', 'moscou', 'conflito', 'leste europeu'],
      pais: 'UA',
      continente: 'europa',
      tipoNoticia: 'mundo',
      paginaTematica: '/guerra-ucrania',
      explicacaoId: 'o-que-e-sancao-internacional',
      linhaDoTempoId: 'guerra-ucrania'
    }
  };

  var EXPLICACOES = [
    {
      id: 'o-que-e-impeachment',
      slug: 'o-que-e-impeachment',
      titulo: 'O que é impeachment?',
      resumo: 'Entenda como funciona o processo político-jurídico que pode afastar chefes do Executivo por crimes de responsabilidade e quais são suas etapas constitucionais.',
      atualizadoEm: '06 de novembro de 2026',
      termoBusca: 'impeachment congresso',
      paisContexto: 'BR',
      continenteContexto: 'sul',
      topicoContexto: 'politica',
      hubsRelacionados: ['/politica/brasil', '/politica/estados-unidos', '/eleicoes'],
      noticiasRelacionadas: [
        {
          titulo: 'Papel do Congresso e ritos constitucionais em processos de responsabilidade no presidencialismo',
          fonte: 'Agência Brasil',
          data: '2026-10-28',
          url: 'https://agenciabrasil.ebc.com.br/politica'
        },
        {
          titulo: 'A relação entre Executivo e Legislativo no equilíbrio de poderes no Brasil',
          fonte: 'Folha de S.Paulo',
          data: '2026-11-02',
          url: 'https://www.folha.uol.com.br/poder/'
        }
      ],
      paragrafos: [
        'O impeachment, também chamado de impedimento, é um instrumento previsto em regimes presidencialistas para apurar e julgar crimes de responsabilidade cometidos por altas autoridades do Estado, especialmente o presidente da República, governadores, prefeitos e ministros de tribunais superiores. Diferentemente de um processo penal comum conduzido exclusivamente pelo Poder Judiciário, o impeachment possui natureza político-jurídica e é decidido pelo Poder Legislativo.',
        'No Brasil, as regras do impeachment são definidas pela Constituição Federal de 1988 e pela Lei nº 1.079/1950. A legislação estabelece que constituem crimes de responsabilidade atos do presidente que atentem contra a existência da União, o livre exercício dos poderes constitucionais, a segurança interna do país, a probidade na administração, a lei orçamentária e o cumprimento das leis e das decisões judiciais.',
        'O procedimento começa com a apresentação de uma denúncia, que pode ser protocolada por qualquer cidadão em pleno gozo de seus direitos políticos. Cabe ao presidente da Câmara dos Deputados analisar os requisitos formais e decidir pelo recebimento ou arquivamento inicial do pedido. Caso a denúncia seja aceita, uma comissão especial com representantes proporcionais dos partidos analisa o mérito e elabora um parecer.',
        'Para que o processo seja formalmente instaurado, o parecer precisa ser aprovado por pelo menos dois terços dos deputados federais (342 dos 513 parlamentares). Se esse quórum for atingido, o processo segue para o Senado Federal, que atua como tribunal de julgamento sob a presidência do presidente do Supremo Tribunal Federal (STF), garantindo o direito ao contraditório e à ampla defesa.',
        'Uma vez admitida a acusação pelo Senado por maioria simples, o presidente da República fica suspenso de suas funções por até 180 dias enquanto ocorre a instrução probatória, com oitiva de testemunhas e perícia. Na sessão final de julgamento, a condenação exige novamente o voto favorável de dois terços dos senadores (54 dos 81 integrantes da Casa).',
        'Caso seja condenado, o governante perde imediatamente o mandato e fica inabilitado por oito anos para o exercício de qualquer função pública, sem prejuízo de eventuais ações na Justiça comum. Em outros países presidencialistas, como nos Estados Unidos, o mecanismo segue lógica semelhante: a Câmara dos Representantes aprova os artigos de acusação por maioria simples e o Senado julga o afastamento mediante maioria qualificada de dois terços. Por envolver tanto parâmetros legais quanto avaliação de governabilidade parlamentar, diferentes veículos de imprensa costumam enfatizar ora o rigor técnico-jurídico da tipificação do crime, ora a correlação de forças políticas no Congresso.',
        'Ao acompanhar notícias sobre pedidos de impeachment ou crises entre Executivo e Legislativo, vale observar como cada veículo enquadra o tema: jornais mais voltados ao direito constitucional costumam destacar a necessidade de configuração estrita do dolo e do crime de responsabilidade para evitar instabilidade institucional, enquanto análises políticas focam na perda de apoio parlamentar, nos índices de aprovação popular e no impacto sobre a agenda econômica do país.'
      ]
    },
    {
      id: 'o-que-e-inflacao',
      slug: 'o-que-e-inflacao',
      titulo: 'O que é inflação?',
      resumo: 'Compreenda por que os preços sobem de forma generalizada, como o IPCA é calculado e de que maneira os juros do Banco Central afetam o poder de compra.',
      atualizadoEm: '06 de novembro de 2026',
      termoBusca: 'inflação IPCA juros',
      paisContexto: 'BR',
      continenteContexto: 'sul',
      topicoContexto: 'economia',
      hubsRelacionados: ['/economia/brasil', '/politica/brasil'],
      noticiasRelacionadas: [
        {
          titulo: 'Acompanhamento de índices de preços, taxa Selic e mercado financeiro',
          fonte: 'Valor / g1 Economia',
          data: '2026-11-05',
          url: 'https://g1.globo.com/economia/'
        },
        {
          titulo: 'Indicadores econômicos, inflação de alimentos e metas do Banco Central',
          fonte: 'Estadão Economia',
          data: '2026-11-04',
          url: 'https://www.estadao.com.br/economia/'
        }
      ],
      paragrafos: [
        'A inflação é o nome dado ao aumento contínuo e generalizado dos preços de bens e serviços em uma economia durante determinado período. Quando há inflação, o dinheiro perde poder de compra: a mesma nota de cem reais ou de cem dólares passa a adquirir uma quantidade menor de alimentos, transporte, energia e moradia no mês seguinte. Por isso, a estabilidade de preços é considerada um dos pilares fundamentais do planejamento econômico das famílias e das empresas.',
        'Não basta que um único produto fique mais caro — por exemplo, o tomate subir após uma geada — para que se configure inflação. O fenômeno inflacionário ocorre quando a alta se espalha por diversos setores simultaneamente. No Brasil, o indicador oficial utilizado pelo sistema de metas do governo é o Índice Nacional de Preços ao Consumidor Amplo (IPCA), calculado mensalmente pelo Instituto Brasileiro de Geografia e Estatística (IBGE) a partir de uma cesta de consumo representativa das famílias urbanas.',
        'Os economistas costumam dividir as causas da inflação em quatro grandes grupos. O primeiro é a inflação de demanda, que acontece quando o consumo das famílias e os gastos na economia crescem mais rápido do que a capacidade das indústrias e do setor de serviços de produzir mercadorias. O segundo é a inflação de custos (ou de oferta), provocada pelo encarecimento de insumos essenciais, como petróleo, energia elétrica, frete marítimo, dólar ou quebras de safra agrícola decorrentes de eventos climáticos extremos.',
        'Há ainda a inflação inercial, ligada à indexação automática de contratos, aluguéis e tarifas com base na inflação passada, e o papel das expectativas: quando agentes econômicos antecipam que os preços vão subir, reajustam tabelas preventivamente, alimentando o próprio ciclo de alta. Para conter esse processo, os bancos centrais utilizam a política monetária, cujo principal instrumento é a taxa básica de juros — a Selic no Brasil ou os Fed Funds nos Estados Unidos.',
        'Ao elevar os juros básicos, o Banco Central torna o crédito mais caro e estimula a poupança, desaquecendo o consumo e reduzindo a pressão sobre os preços. Em contrapartida, juros muito altos também encarecem o investimento produtivo, desaceleram a geração de empregos e aumentam o custo da dívida pública. Por essa razão, o debate econômico na imprensa frequentemente contrapõe visões mais ortodoxas — que priorizam o controle estrito da inflação e o equilíbrio fiscal — e visões desenvolvimentistas, que alertam para o impacto social de juros elevados sobre o crescimento e o emprego.',
        'Para o cidadão comum, a inflação funciona na prática como um imposto invisível que penaliza sobretudo as famílias de menor renda, que destinam quase todo o seu orçamento mensal para alimentos, transporte público, gás de cozinha e energia elétrica e não dispõem de aplicações financeiras corrigidas pelos juros para proteger seu patrimônio. Por isso, comparar diferentes coberturas econômicas ajuda a compreender tanto os fatores técnicos da política monetária quanto seus efeitos concretos no custo de vida.'
      ]
    },
    {
      id: 'como-funcionam-as-eleicoes-nos-eua',
      slug: 'como-funcionam-as-eleicoes-nos-eua',
      titulo: 'Como funcionam as eleições nos EUA?',
      resumo: 'Saiba o que é o Colégio Eleitoral, por que os estados-pêndulo decidem a Casa Branca e como funciona o voto indireto nos Estados Unidos.',
      atualizadoEm: '06 de novembro de 2026',
      termoBusca: 'eleições Estados Unidos Trump',
      paisContexto: 'US',
      continenteContexto: 'norte',
      topicoContexto: 'politica',
      hubsRelacionados: ['/politica/estados-unidos', '/eleicoes'],
      noticiasRelacionadas: [
        {
          titulo: 'Cobertura da política norte-americana, Casa Branca e Congresso dos EUA',
          fonte: 'Associated Press',
          data: '2026-11-06',
          url: 'https://apnews.com/politics'
        },
        {
          titulo: 'Análises sobre eleições e disputas nos estados decisivos dos EUA',
          fonte: 'Reuters',
          data: '2026-11-05',
          url: 'https://www.reuters.com/world/us/'
        }
      ],
      paragrafos: [
        'Ao contrário do Brasil e da maioria das democracias contemporâneas, onde o presidente é eleito diretamente pela soma nacional dos votos populares, a eleição presidencial nos Estados Unidos ocorre de forma indireta por meio de um mecanismo criado na Constituição de 1787 chamado Colégio Eleitoral. Quando os cidadãos norte-americanos vão às urnas na primeira terça-feira depois da primeira segunda-feira de novembro, eles estão tecnicamente escolhendo delegados estaduais que, semanas depois, oficializam o voto para presidente e vice-presidente.',
        'O Colégio Eleitoral é composto por 538 delegados distribuídos entre os 50 estados e o Distrito de Colúmbia (Washington, D.C.). O número de delegados de cada estado corresponde exatamente à sua bancada no Congresso: dois senadores fixos por estado mais a quantidade de deputados na Câmara dos Representantes, que varia conforme o tamanho da população apurado pelo censo decenal. A Califórnia, estado mais populoso, possui 54 votos no Colégio Eleitoral, enquanto estados menos populosos, como Wyoming ou Vermont, contam com o mínimo de 3.',
        'Para vencer a presidência e chegar à Casa Branca, um candidato precisa conquistar a maioria absoluta de 270 delegados. Em 48 dos 50 estados e na capital federal, vigora a regra do “vencedor leva tudo” (winner-takes-all): o candidato que obtiver nem que seja um voto popular a mais dentro daquele estado conquista 100% dos delegados estaduais. Apenas Maine e Nebraska distribuem parte de seus delegados por distrito congressional.',
        'Esse desenho institucional explica por que um candidato pode ter mais votos na soma total do país e ainda assim perder a eleição caso o adversário vença por margens estreitas nos estados certos — algo que ocorreu cinco vezes na história americana, inclusive em 2000 e em 2016. Além disso, como estados tradicionalmente democratas (como Califórnia e Nova York) e estados solidamente republicanos (como Texas e Alabama) têm resultados previsíveis, as campanhas concentram quase todos os seus recursos nos chamados estados-pêndulo (swing states).',
        'Estados-pêndulo como Pensilvânia, Michigan, Wisconsin, Geórgia, Carolina do Norte, Arizona e Nevada costumam alternar preferência entre os dois grandes partidos e frequentemente decidem o pleito por diferenças inferiores a um ponto percentual. Antes da eleição geral de novembro, os próprios partidos realizam, no primeiro semestre do ano eleitoral, as primárias e os caucuses estaduais para escolher seus candidatos oficiais, culminando nas convenções nacionais de meio de ano. A cada dois anos, também ocorrem as eleições de meio de mandato (midterms), que renovam toda a Câmara dos Representantes e um terço do Senado, redefinindo a capacidade do presidente de aprovar leis.',
        'Outro aspecto singular do modelo norte-americano é a descentralização da administração eleitoral: não existe um tribunal único nacional equivalente ao TSE brasileiro; cada um dos 50 estados define suas próprias regras sobre voto pelo correio, votação antecipada, exigência de documento de identificação e prazos de contagem das cédulas. Na cobertura jornalística, veículos progressistas costumam enfatizar o direito de acesso ao voto e a representatividade do voto popular nacional, enquanto veículos conservadores destacam o equilíbrio federativo proporcionado pelo Colégio Eleitoral aos estados menos populosos.'
      ]
    },
    {
      id: 'o-que-e-sancao-internacional',
      slug: 'o-que-e-sancao-internacional',
      titulo: 'O que é uma sanção internacional?',
      resumo: 'Entenda como governos e organismos multilaterais usam restrições comerciais, financeiras e tecnológicas como instrumento de pressão geopolítica.',
      atualizadoEm: '06 de novembro de 2026',
      termoBusca: 'sanções internacionais geopolítica',
      paisContexto: 'UA',
      continenteContexto: 'europa',
      topicoContexto: 'mundo',
      hubsRelacionados: ['/guerra-ucrania', '/tecnologia', '/politica/estados-unidos'],
      noticiasRelacionadas: [
        {
          titulo: 'Relações internacionais, comércio exterior e diplomacia global',
          fonte: 'Le Monde Internacional',
          data: '2026-11-04',
          url: 'https://www.lemonde.fr/international/'
        },
        {
          titulo: 'Geopolítica, conflitos e sanções econômicas no cenário mundial',
          fonte: 'BBC News World',
          data: '2026-11-05',
          url: 'https://www.bbc.com/news/world'
        }
      ],
      paragrafos: [
        'Uma sanção internacional é uma medida restritiva — econômica, comercial, financeira, diplomática ou tecnológica — imposta por um país, por um bloco regional (como a União Europeia) ou por uma organização multilateral (como o Conselho de Segurança das Nações Unidas) contra outro Estado, empresas, setores econômicos ou indivíduos específicos. Seu objetivo declarado é pressionar governos a mudar condutas consideradas violações do direito internacional, agressões militares, proliferação de armas ou graves atentados aos direitos humanos, sem recorrer diretamente ao confronto armado.',
        'Existem diversas modalidades de sanções. As sanções comerciais incluem embargos à importação ou exportação de produtos estratégicos, como petróleo, gás natural, armamentos e semicondutores avançados, além da imposição de tarifas punitivas. Já as sanções financeiras são hoje as mais poderosas: envolvem o congelamento de reservas cambiais de bancos centrais no exterior, a exclusão de instituições bancárias do sistema internacional de mensagens financeiras (SWIFT) e a proibição de acesso a mercados de capitais em dólar ou euro.',
        'Também são muito comuns as chamadas sanções direcionadas (ou “inteligentes”), que atingem autoridades políticas, comandantes militares e empresários ligados a um governo por meio do bloqueio de bens, contas bancárias e proibição de emissão de vistos de viagem. Além disso, os Estados Unidos utilizam com frequência as chamadas sanções secundárias: regras que punem empresas de terceiros países caso elas continuem negociando com um alvo sancionado por Washington, valendo-se da centralidade do dólar no sistema financeiro global.',
        'Desde o início da guerra em larga escala na Ucrânia e do acirramento da disputa tecnológica entre Estados Unidos e China no setor de chips de inteligência artificial, o uso de sanções e controles de exportação atingiu níveis inéditos. No entanto, sua eficácia é tema de intenso debate entre diplomatas e economistas.',
        'Enquanto defensores das sanções argumentam que elas encarecem o esforço de guerra e restringem o acesso a tecnologias críticas no médio e longo prazo, críticos apontam que países sancionados frequentemente reorganizam suas rotas comerciais, criam sistemas alternativos de pagamento em moedas locais e recorrem a frotas paralelas de transporte. Na cobertura jornalística internacional, veículos ocidentais costumam focar nos mecanismos de fiscalização contra a evasão de sanções, ao passo que veículos do Sul Global e de países emergentes frequentemente destacam os efeitos colaterais dessas medidas sobre cadeias de suprimentos de alimentos, fertilizantes e energia.',
        'Do ponto de vista jurídico e diplomático, existe uma distinção relevante entre sanções multilaterais — aprovadas pelo Conselho de Segurança da ONU e de cumprimento obrigatório por todos os Estados-membros — e sanções unilaterais, aplicadas isoladamente por países ou blocos econômicos sem mandato das Nações Unidas. Países como o Brasil historicamente defendem na diplomacia que apenas sanções respaldadas pela ONU possuem plena legitimidade internacional, tema que frequentemente divide opiniões na cobertura geopolítica mundial.'
      ]
    },
    {
      id: 'o-que-e-o-orcamento',
      slug: 'o-que-e-o-orcamento',
      titulo: 'O que é o Orçamento?',
      resumo: 'Descubra como o dinheiro dos impostos é planejado e distribuído entre saúde, educação, investimentos, dívida pública e emendas parlamentares.',
      atualizadoEm: '06 de novembro de 2026',
      termoBusca: 'orçamento público arcabouço fiscal',
      paisContexto: 'BR',
      continenteContexto: 'sul',
      topicoContexto: 'politica',
      hubsRelacionados: ['/politica/brasil', '/economia/brasil'],
      noticiasRelacionadas: [
        {
          titulo: 'Acompanhamento do Orçamento da União, Congresso e contas públicas',
          fonte: 'Folha de S.Paulo — Mercado',
          data: '2026-11-05',
          url: 'https://www.folha.uol.com.br/mercado/'
        },
        {
          titulo: 'Debates sobre gastos sociais, emendas parlamentares e responsabilidade fiscal',
          fonte: 'CartaCapital',
          data: '2026-11-03',
          url: 'https://www.cartacapital.com.br/economia/'
        }
      ],
      paragrafos: [
        'O Orçamento Público é o instrumento legal pelo qual o Estado estima todas as receitas que irá arrecadar — principalmente por meio de impostos, contribuições e taxas pagas por cidadãos e empresas — e fixa todas as despesas que está autorizado a realizar ao longo de um ano para manter os serviços públicos funcionando e realizar investimentos. Mais do que uma peça contábil, o orçamento é o documento político mais importante de um país, pois revela na prática quais áreas recebem prioridade real de recursos.',
        'No sistema constitucional brasileiro, o ciclo orçamentário é organizado em três leis complementares entre si, todas de iniciativa do Poder Executivo e aprovadas pelo Congresso Nacional. A primeira é o Plano Plurianual (PPA), elaborado a cada quatro anos para definir as diretrizes e metas de médio prazo da administração federal. A segunda é a Lei de Diretrizes Orçamentárias (LDO), votada anualmente até o meio do ano para estabelecer as metas fiscais — isto é, quanto o governo deverá economizar antes do pagamento dos juros da dívida — e as regras para elaborar o orçamento do ano seguinte.',
        'Por fim, até o final de agosto de cada ano, o Executivo envia ao Congresso o projeto da Lei Orçamentária Anual (LOA), que detalha exatamente quanto cada ministério, órgão público, programa social e obra receberá no ano subsequente. Uma característica marcante do orçamento brasileiro é o alto grau de despesas obrigatórias: mais de 90% das receitas primárias já estão comprometidas por lei com aposentadorias da Previdência, salários de servidores, pisos constitucionais de saúde e educação, seguro-desemprego e benefícios assistenciais.',
        'A parcela restante constitui as chamadas despesas discricionárias, usadas para custear o funcionamento da máquina pública (bolsas de pesquisa, fiscalização ambiental, emissão de passaportes, manutenção de rodovias) e investimentos em infraestrutura. Nos últimos anos, ganhou grande protagonismo no debate público o crescimento das emendas parlamentares — fatia do orçamento que deputados e senadores direcionam para seus redutos eleitorais, muitas vezes de execução impositiva.',
        'Esse arranjo gera disputas constantes entre o Poder Executivo, que busca preservar capacidade de coordenação de políticas nacionais e cumprir as metas do arcabouço fiscal, o Congresso Nacional, que defende a prerrogativa de alocar recursos nos municípios, e o Supremo Tribunal Federal (STF), que tem cobrado critérios estritos de transparência e rastreabilidade no uso do dinheiro público.',
        'Além das receitas e despesas primárias, o orçamento envolve o acompanhamento do resultado primário — a diferença entre o que o governo arrecada e o que gasta, sem contar os juros da dívida. Quando as receitas superam os gastos, há superávit primário; quando ficam abaixo, há déficit primário. Acompanhar como diferentes jornais analisam a peça orçamentária permite enxergar tanto os argumentos de responsabilidade fiscal e controle do endividamento quanto as demandas por financiamento adequado da saúde pública, da educação e da infraestrutura.'
      ]
    },
    {
      id: 'o-que-e-a-cop30',
      slug: 'o-que-e-a-cop30',
      titulo: 'O que é a COP30?',
      resumo: 'Entenda o papel das Conferências do Clima da ONU, as metas do Acordo de Paris, o financiamento climático e a importância da Amazônia nas negociações globais.',
      atualizadoEm: '06 de novembro de 2026',
      termoBusca: 'COP30 clima Amazônia',
      paisContexto: 'BR',
      continenteContexto: 'sul',
      topicoContexto: 'mundo',
      hubsRelacionados: ['/clima', '/politica/brasil'],
      noticiasRelacionadas: [
        {
          titulo: 'Cobertura internacional sobre mudanças climáticas, florestas e transição energética',
          fonte: 'The Guardian Environment',
          data: '2026-11-04',
          url: 'https://www.theguardian.com/uk'
        },
        {
          titulo: 'Agenda climática brasileira, Amazônia e negociações diplomáticas',
          fonte: 'Agência Brasil',
          data: '2026-11-05',
          url: 'https://agenciabrasil.ebc.com.br/internacional'
        }
      ],
      paragrafos: [
        'A sigla COP significa Conferência das Partes (Conference of the Parties, em inglês) e designa o encontro anual de cúpula da Convenção-Quadro das Nações Unidas sobre a Mudança do Clima (UNFCCC), tratado assinado durante a Eco-92, no Rio de Janeiro, e que hoje reúne quase 200 países. A COP30, trigésima edição dessa conferência histórica sediada em Belém, no Pará, colocou pela primeira vez a Amazônia no centro geográfico e político das negociações climáticas mundiais.',
        'Nas reuniões da COP, chefes de Estado, diplomatas, cientistas do Painel Intergovernamental sobre Mudanças Climáticas (IPCC), lideranças indígenas, setor privado e organizações da sociedade civil negociam compromissos para reduzir a emissão de gases de efeito estufa — como o dióxido de carbono e o metano, resultantes da queima de combustíveis fósseis (petróleo, carvão e gás) e do desmatamento — e limitar o aquecimento médio do planeta.',
        'O marco principal dessas negociações é o Acordo de Paris, firmado na COP21 (em 2015), pelo qual os países se comprometeram a manter o aumento da temperatura global bem abaixo de 2 °C em relação aos níveis pré-industriais, envidando esforços para não ultrapassar o limite crítico de 1,5 °C. Para atingir esse objetivo, cada nação deve apresentar e atualizar periodicamente suas Contribuições Nacionalmente Determinadas (NDCs), que são os planos nacionais de corte de emissões e transição energética até 2030 e 2035.',
        'O ponto mais sensível das negociações contemporâneas gira em torno do financiamento climático e do princípio das “responsabilidades comuns, porém diferenciadas”. Países em desenvolvimento — onde vivem as populações mais vulneráveis a secas severas, enchentes e perda de biodiversidade — cobram que as nações industrializadas cumpram a promessa de aportar centenas de bilhões de dólares anuais para financiar tanto a transição para energias renováveis quanto os fundos de adaptação e de “perdas e danos”.',
        'Além disso, a preservação de florestas tropicais ganhou novos instrumentos econômicos, como propostas de remuneração internacional por serviços ecossistêmicos e mercados regulados de créditos de carbono. Na imprensa global, a cobertura das conferências climáticas costuma contrastar o otimismo diplomático dos comunicados oficiais com os alertas de cientistas e movimentos socioambientais sobre o ritmo ainda lento de substituição dos combustíveis fósseis na matriz energética mundial.',
        'Para o Brasil e a América do Sul, o legado da COP30 envolve ainda o desafio de conciliar bioeconomia e desenvolvimento sustentável para milhões de habitantes da região amazônica com o combate ao desmatamento ilegal e a transição energética justa. Ao comparar diferentes veículos de comunicação no país e no exterior, o leitor percebe como interesses econômicos, soberania nacional e compromissos ambientais se articulam nas negociações internacionais.'
      ]
    }
  ];

  var LINHAS_DO_TEMPO = {
    'politica-brasil': {
      id: 'politica-brasil',
      titulo: 'Linha do tempo: Política e relação entre Poderes no Brasil',
      eventos: [
        {
          data: 'Novembro de 2026',
          titulo: 'Negociação do Orçamento e regras de transparência para emendas',
          resumo: 'Governo federal, Congresso Nacional e STF debatem novos critérios de rastreabilidade para a execução de emendas parlamentares e metas fiscais.',
          fonte: 'Folha de S.Paulo',
          url: 'https://www.folha.uol.com.br/poder/',
          termoCobertura: 'orçamento emendas congresso'
        },
        {
          data: 'Outubro de 2026',
          titulo: 'Reconfiguração partidária e articulações no Legislativo',
          resumo: 'Lideranças da Câmara e do Senado redefinem prioridades da pauta econômica e institucional para o encerramento do ano legislativo.',
          fonte: 'g1 Política',
          url: 'https://g1.globo.com/politica/',
          termoCobertura: 'Câmara Senado articulação política'
        },
        {
          data: 'Agosto de 2026',
          titulo: 'Regulamentação da Reforma Tributária avança no Congresso',
          resumo: 'Parlamentares analisam as alíquotas de referência e os regimes diferenciados do novo sistema de imposto sobre valor agregado (IVA Dual).',
          fonte: 'Agência Brasil',
          url: 'https://agenciabrasil.ebc.com.br/politica',
          termoCobertura: 'reforma tributária congresso'
        },
        {
          data: 'Maio de 2026',
          titulo: 'Pautas de segurança pública e pacto federativo',
          resumo: 'Governadores e União discutem integração de inteligência policial e financiamento constitucional da segurança nos estados.',
          fonte: 'Estadão',
          url: 'https://www.estadao.com.br/politica/',
          termoCobertura: 'segurança pública governadores'
        }
      ]
    },
    'politica-eua': {
      id: 'politica-eua',
      titulo: 'Linha do tempo: Política nos Estados Unidos e governo Trump',
      eventos: [
        {
          data: 'Novembro de 2026',
          titulo: 'Mudanças na equipe da Casa Branca e diretrizes de imigração e comércio',
          resumo: 'Governo Trump anuncia reformulações no gabinete e reforça agenda de controle fronteiriço e revisão de tarifas comerciais.',
          fonte: 'Associated Press',
          url: 'https://apnews.com/politics',
          termoCobertura: 'Trump Casa Branca'
        },
        {
          data: 'Setembro de 2026',
          titulo: 'Disputas no Congresso americano sobre teto de gastos e tarifas',
          resumo: 'Republicanos e democratas debatem pacote orçamentário federal e o impacto das tarifas de importação sobre cadeias industriais.',
          fonte: 'Reuters',
          url: 'https://www.reuters.com/world/us/',
          termoCobertura: 'Trump tarifas congresso'
        },
        {
          data: 'Junho de 2026',
          titulo: 'Decisões da Suprema Corte dos EUA redesenham regulação federal',
          resumo: 'Julgamentos históricos delimitam o poder de agências reguladoras federais e temas de direitos civis nos estados.',
          fonte: 'The New York Times',
          url: 'https://www.nytimes.com/section/politics',
          termoCobertura: 'Supreme Court Trump politics'
        },
        {
          data: 'Janeiro de 2026',
          titulo: 'Prioridades diplomáticas e revisão de acordos multilaterais',
          resumo: 'Casa Branca recalibra relação com aliados da OTAN e negociações comerciais na Ásia e América Latina.',
          fonte: 'CNN Politics',
          url: 'https://edition.cnn.com/politics',
          termoCobertura: 'Trump foreign policy'
        }
      ]
    },
    'economia-brasil': {
      id: 'economia-brasil',
      titulo: 'Linha do tempo: Economia brasileira, inflação e juros',
      eventos: [
        {
          data: 'Novembro de 2026',
          titulo: 'Banco Central avalia trajetória do IPCA e cenário externo',
          resumo: 'Comitê de Política Monetária (Copom) monitora câmbio, atividade econômica aquecida e expectativas de inflação para calibrar a taxa Selic.',
          fonte: 'g1 Economia',
          url: 'https://g1.globo.com/economia/',
          termoCobertura: 'Banco Central Selic inflação'
        },
        {
          data: 'Setembro de 2026',
          titulo: 'Envio da proposta orçamentária e revisão de gastos públicos',
          resumo: 'Equipe econômica detalha medidas de contenção de despesas obrigatórias para cumprir a meta de resultado primário do arcabouço fiscal.',
          fonte: 'Folha de S.Paulo',
          url: 'https://www.folha.uol.com.br/mercado/',
          termoCobertura: 'arcabouço fiscal orçamento economia'
        },
        {
          data: 'Julho de 2026',
          titulo: 'Balança comercial impulsionada por exportações do agronegócio e energia',
          resumo: 'Superávit externo registra forte desempenho com embarques de grãos, petróleo e minério, ajudando a amortecer a volatilidade cambial.',
          fonte: 'Estadão Economia',
          url: 'https://www.estadao.com.br/economia/',
          termoCobertura: 'balança comercial exportações PIB'
        }
      ]
    },
    'eleicoes': {
      id: 'eleicoes',
      titulo: 'Linha do tempo: Eleições, urnas e democracias no mundo',
      eventos: [
        {
          data: 'Novembro de 2026',
          titulo: 'Balanço dos pleitos legislativos e presidenciais nas Américas e Europa',
          resumo: 'Eleitores vão às urnas sob forte debate sobre custo de vida, imigração, segurança pública e combate à desinformação digital.',
          fonte: 'Reuters World',
          url: 'https://www.reuters.com/world/',
          termoCobertura: 'eleições votação resultado'
        },
        {
          data: 'Outubro de 2026',
          titulo: 'Justiça Eleitoral reforça regras sobre uso de inteligência artificial em campanhas',
          resumo: 'Tribunais eleitorais aplicam restrições severas contra deepfakes e conteúdos sintéticos não rotulados na propaganda política.',
          fonte: 'O Globo Política',
          url: 'https://oglobo.globo.com/politica/',
          termoCobertura: 'eleições inteligência artificial TSE'
        },
        {
          data: 'Junho de 2026',
          titulo: 'Debates sobre sistemas eleitorais e participação de eleitores',
          resumo: 'Observatórios internacionais apontam polarização intensa e importância da transparência nos sistemas de apuração.',
          fonte: 'BBC News',
          url: 'https://www.bbc.com/news/world',
          termoCobertura: 'eleições democracia mundo'
        }
      ]
    },
    'clima': {
      id: 'clima',
      titulo: 'Linha do tempo: Emergência climática, Amazônia e pós-COP30',
      eventos: [
        {
          data: 'Novembro de 2026',
          titulo: 'Balanço das metas de financiamento climático e proteção de florestas tropicais',
          resumo: 'Países avaliam implementação dos compromissos assumidos na agenda da COP30 e o desembolso de fundos para transição energética.',
          fonte: 'Agência Brasil',
          url: 'https://agenciabrasil.ebc.com.br/internacional',
          termoCobertura: 'clima COP30 Amazônia'
        },
        {
          data: 'Agosto de 2026',
          titulo: 'Monitoramento de eventos extremos e adaptação de cidades',
          resumo: 'Ondas de calor e regimes severos de seca e chuva aceleram planos de infraestrutura resiliente na América do Sul e Europa.',
          fonte: 'Folha de S.Paulo',
          url: 'https://www.folha.uol.com.br/ambiente/',
          termoCobertura: 'mudanças climáticas seca calor'
        },
        {
          data: 'Março de 2026',
          titulo: 'Avanço do mercado regulado de carbono e energias renováveis',
          resumo: 'Novos leilões de transmissão e regras de certificação de créditos de carbono atraem investimentos em energia limpa.',
          fonte: 'CartaCapital',
          url: 'https://www.cartacapital.com.br/',
          termoCobertura: 'transição energética carbono'
        }
      ]
    },
    'tecnologia': {
      id: 'tecnologia',
      titulo: 'Linha do tempo: Inteligência artificial, chips e regulação digital',
      eventos: [
        {
          data: 'Novembro de 2026',
          titulo: 'Nova geração de agentes de IA e investimentos bilionários em data centers',
          resumo: 'Empresas de tecnologia ampliam capacidade computacional e enfrentam escrutínio sobre consumo de energia e direitos autorais.',
          fonte: 'The Verge / Folha Tec',
          url: 'https://www.folha.uol.com.br/tec/',
          termoCobertura: 'inteligência artificial tecnologia'
        },
        {
          data: 'Setembro de 2026',
          titulo: 'União Europeia e Brasil avançam em marcos legais para IA e plataformas',
          resumo: 'Legislações estabelecem classificação de risco para sistemas algorítmicos e deveres de transparência para grandes plataformas digitais.',
          fonte: 'g1 Tecnologia',
          url: 'https://g1.globo.com/tecnologia/',
          termoCobertura: 'regulação inteligência artificial big tech'
        },
        {
          data: 'Maio de 2026',
          titulo: 'Disputa geopolítica por semicondutores de última geração',
          resumo: 'Estados Unidos, Ásia e Europa ampliam subsídios industriais e controles de exportação na cadeia global de microchips.',
          fonte: 'Reuters Technology',
          url: 'https://www.reuters.com/technology/',
          termoCobertura: 'chips semicondutores IA'
        }
      ]
    },
    'guerra-ucrania': {
      id: 'guerra-ucrania',
      titulo: 'Linha do tempo: Guerra na Ucrânia e segurança europeia',
      eventos: [
        {
          data: 'Novembro de 2026',
          titulo: 'Impasse militar no leste ucraniano e debates sobre negociações e pacotes de ajuda',
          resumo: 'Mudanças políticas em Washington e nas capitais europeias reacendem discussões sobre o futuro do apoio financeiro e militar a Kiev.',
          fonte: 'The Kyiv Independent / BBC',
          url: 'https://kyivindependent.com',
          termoCobertura: 'Ucrânia Rússia guerra'
        },
        {
          data: 'Agosto de 2026',
          titulo: 'Ataques com drones de longo alcance e proteção de infraestrutura energética',
          resumo: 'Ambos os lados intensificam o uso de sistemas autônomos e defesas antiaéreas antes do inverno no hemisfério norte.',
          fonte: 'Reuters World',
          url: 'https://www.reuters.com/world/',
          termoCobertura: 'Ucrânia drones energia'
        },
        {
          data: 'Abril de 2026',
          titulo: 'Novas rodadas de sanções econômicas e uso de ativos congelados',
          resumo: 'G7 e União Europeia destinam rendimentos de ativos russos bloqueados para financiar a reconstrução e defesa ucraniana.',
          fonte: 'Le Monde',
          url: 'https://www.lemonde.fr/international/',
          termoCobertura: 'sanções Rússia Ucrânia Europa'
        }
      ]
    },
    'esportes': {
      id: 'esportes',
      titulo: 'Linha do tempo: Grandes marcos e competições do esporte',
      eventos: [
        {
          data: 'Novembro de 2026',
          titulo: 'Finais e definições em competições continentais e nacionais',
          resumo: 'Clubes disputam títulos e vagas decisivas em copas e ligas com grande audiência internacional.',
          fonte: 'ge',
          url: 'https://ge.globo.com/',
          termoCobertura: 'campeonatos futebol decisões'
        },
        {
          data: 'Outubro de 2026',
          titulo: 'Reta final da temporada da Fórmula 1 e ligas globais',
          resumo: 'Provas decisivas e calendário esportivo movimentam rankings mundiais de pilotos e equipes.',
          fonte: 'Estadão Esportes',
          url: 'https://www.estadao.com.br/esportes/',
          termoCobertura: 'formula 1 automobilismo'
        }
      ]
    },
    'saude': {
      id: 'saude',
      titulo: 'Linha do tempo: Saúde pública, imunização e avanços médicos',
      eventos: [
        {
          data: 'Novembro de 2026',
          titulo: 'Campanhas de reforço e atualização do calendário vacinal',
          resumo: 'SUS mobiliza postos e ações comunitárias para fortalecer proteção coletiva contra patógenos sazonais.',
          fonte: 'Agência Brasil',
          url: 'https://agenciabrasil.ebc.com.br/saude',
          termoCobertura: 'vacinação SUS saúde pública'
        },
        {
          data: 'Outubro de 2026',
          titulo: 'Regulação de novas tecnologias em terapias avançadas',
          resumo: 'Anvisa e comitês de bioética estabelecem diretrizes para inovação farmacêutica e segurança clínica.',
          fonte: 'g1 Saúde',
          url: 'https://g1.globo.com/saude/',
          termoCobertura: 'Anvisa medicamentos terapias'
        }
      ]
    },
    'cultura': {
      id: 'cultura',
      titulo: 'Linha do tempo: Festivais, artes e patrimônio cultural',
      eventos: [
        {
          data: 'Novembro de 2026',
          titulo: 'Premiações internacionais e circuito de mostras culturais',
          resumo: 'Cinema, teatro e literatura recebem reconhecimento crítico e mobilizam público nos palcos e salas.',
          fonte: 'Folha de S.Paulo — Ilustrada',
          url: 'https://www.folha.uol.com.br/ilustrada/',
          termoCobertura: 'cinema artes premiações festivais'
        },
        {
          data: 'Outubro de 2026',
          titulo: 'Feiras literárias e difusão de patrimônio imaterial',
          resumo: 'Bienais e eventos regionais celebram a literatura, a diversidade linguística e as tradições artísticas.',
          fonte: 'O Globo — Cultura',
          url: 'https://oglobo.globo.com/cultura/',
          termoCobertura: 'literatura livros patrimônio cultural'
        }
      ]
    }
  };

  var PAGINAS_TEMATICAS = {
    '/politica/brasil': {
      rota: '/politica/brasil',
      slug: 'politica-brasil',
      titulo: 'Política no Brasil',
      subtitulo: 'Acompanhe as decisões do Planalto, do Congresso Nacional e do STF sob a ótica de veículos de diferentes linhas editoriais.',
      metaTitle: 'Política no Brasil — Cobertura comparada e perspectivas | Rodando o Mundo',
      metaDescription: 'Compare como jornais de esquerda, direita e imparciais cobrem a política no Brasil: Congresso, Governo Federal, STF, Orçamento e eleições.',
      resumoEditorial: 'A política brasileira é marcada pelo presidencialismo de coalizão, no qual o Poder Executivo precisa construir maiorias em um Congresso fragmentado, enquanto o Supremo Tribunal Federal exerce papel central no controle de constitucionalidade. Nesta página temática, você compara em tempo real como veículos de diferentes perfis editoriais noticiam as disputas em Brasília.',
      pais: 'BR',
      nomePais: 'Brasil',
      continente: 'sul',
      tipoNoticia: 'politica',
      termoBusca: 'governo congresso STF política',
      linhaDoTempoId: 'politica-brasil',
      explicacoesRelacionadas: ['o-que-e-o-orcamento', 'o-que-e-impeachment'],
      paginasRelacionadas: ['/economia/brasil', '/eleicoes', '/politica/estados-unidos', '/clima'],
      perguntasFrequentes: [
        {
          pergunta: 'Como o Rodando o Mundo classifica a linha editorial dos veículos brasileiros em Política?',
          resposta: 'A classificação em Esquerda, Imparcial e Direita é indicativa e baseia-se no posicionamento editorial predominante de cada veículo e em referências públicas de análise de mídia, permitindo ao leitor comparar a mesma notícia por diferentes ângulos.'
        },
        {
          pergunta: 'Por que o Orçamento e as emendas parlamentares geram tantos debates em Brasília?',
          resposta: 'Porque definem quem decide a alocação dos recursos públicos nos municípios e como conciliar investimentos sociais com o equilíbrio das contas públicas.'
        },
        {
          pergunta: 'Como comparar um tema específico dentro da política brasileira?',
          resposta: 'Use o bloco "Comparar perspectivas" logo abaixo para pesquisar qualquer termo (como "STF", "reforma tributária" ou "anistia") e filtrar por período de 24 horas ou últimos 7 dias.'
        }
      ],
      noticiasDestaque: [
        {
          titulo: 'Congresso e Planalto negociam prioridades da pauta econômica e votação do Orçamento',
          resumo: 'Articulação política busca destravar projetos estruturantes e calibrar execução de emendas parlamentares.',
          fonte: 'Folha de S.Paulo',
          data: '2026-11-06',
          url: 'https://search.folha.uol.com.br/?q=congresso+planalto+orcamento+emendas&site=todos'
        },
        {
          titulo: 'STF analisa regras de transparência e limites constitucionais entre os Poderes',
          resumo: 'Corte mantém acompanhamento sobre rastreabilidade de recursos públicos e prerrogativas institucionais.',
          fonte: 'g1 Política',
          data: '2026-11-06',
          url: 'https://g1.globo.com/busca/?q=STF+transparencia+emendas+congresso'
        },
        {
          titulo: 'Oposição e base governista disputam narrativas sobre gastos públicos e segurança',
          resumo: 'Debates na Câmara e no Senado refletem polarização em torno de prioridades fiscais e sociais.',
          fonte: 'Estadão',
          data: '2026-11-05',
          url: 'https://busca.estadao.com.br/?q=congresso+gastos+publicos+orcamento'
        },
        {
          titulo: 'Movimentos sociais e parlamentares debatem investimentos em saúde, educação e transição ecológica',
          resumo: 'Bancadas defendem preservação de pisos constitucionais e ampliação de programas estratégicos.',
          fonte: 'CartaCapital',
          data: '2026-11-05',
          url: 'https://www.cartacapital.com.br/?s=orcamento+saude+educacao'
        }
      ]
    },
    '/politica/estados-unidos': {
      rota: '/politica/estados-unidos',
      slug: 'politica-estados-unidos',
      titulo: 'Política nos Estados Unidos',
      subtitulo: 'Casa Branca, Congresso americano, Suprema Corte e o impacto global das decisões de Washington.',
      metaTitle: 'Política nos Estados Unidos — Casa Branca, Congresso e perspectivas | Rodando o Mundo',
      metaDescription: 'Acompanhe a política nos Estados Unidos, governo Trump, democratas e republicanos comparando a cobertura de Associated Press, Reuters, NYT, Fox News e WSJ.',
      resumoEditorial: 'As decisões tomadas em Washington reverberam diretamente no comércio internacional, nas alianças militares e na economia global. O sistema bipartidário norte-americano, dividido entre democratas e republicanos, reflete visões distintas sobre tarifas comerciais, imigração, impostos e política externa. Compare abaixo como a imprensa americana e internacional cobre os acontecimentos.',
      pais: 'US',
      nomePais: 'Estados Unidos',
      continente: 'norte',
      tipoNoticia: 'politica',
      termoBusca: 'Trump White House Congress politics',
      linhaDoTempoId: 'politica-eua',
      explicacoesRelacionadas: ['como-funcionam-as-eleicoes-nos-eua', 'o-que-e-impeachment', 'o-que-e-sancao-internacional'],
      paginasRelacionadas: ['/eleicoes', '/politica/brasil', '/guerra-ucrania', '/tecnologia'],
      perguntasFrequentes: [
        {
          pergunta: 'Quais são os principais veículos dos EUA disponíveis para comparação?',
          resposta: 'Você pode comparar agências como Associated Press e Reuters, jornais e emissoras de linha progressista/liberal como The New York Times, CNN e NPR, e veículos conservadores como Fox News, The Wall Street Journal e New York Post.'
        },
        {
          pergunta: 'Como as decisões da Casa Branca afetam o Brasil e a América Latina?',
          resposta: 'Políticas tarifárias, taxas de juros do Federal Reserve (Fed) e diretrizes diplomáticas dos EUA impactam diretamente o câmbio, as exportações brasileiras e os fluxos de investimento.'
        }
      ],
      noticiasDestaque: [
        {
          titulo: 'Casa Branca anuncia novos nomes para o gabinete e detalha prioridades em imigração e comércio',
          resumo: 'Governo Trump reforça equipe estratégica para implementar agenda fronteiriça e tarifária.',
          fonte: 'Associated Press',
          data: '2026-11-06',
          url: 'https://apnews.com/politics'
        },
        {
          titulo: 'Mercados e aliados internacionais avaliam impacto da política comercial norte-americana',
          resumo: 'Parceiros na Europa, Ásia e América Latina acompanham medidas sobre tarifas e cadeias industriais.',
          fonte: 'Reuters',
          data: '2026-11-06',
          url: 'https://www.reuters.com/world/us/'
        },
        {
          titulo: 'Disputa entre republicanos e democratas no Congresso molda agenda legislativa em Washington',
          resumo: 'Votações sobre orçamento federal, impostos e energia concentram embates no Capitólio.',
          fonte: 'The Wall Street Journal',
          data: '2026-11-05',
          url: 'https://www.wsj.com/politics'
        }
      ]
    },
    '/economia/brasil': {
      rota: '/economia/brasil',
      slug: 'economia-brasil',
      titulo: 'Economia no Brasil',
      subtitulo: 'Inflação, taxa Selic, câmbio, mercado de trabalho, agronegócio e contas públicas em múltiplas fontes.',
      metaTitle: 'Economia no Brasil — Inflação, Juros, PIB e cobertura comparada | Rodando o Mundo',
      metaDescription: 'Acompanhe notícias sobre a economia brasileira, IPCA, taxa Selic, dólar, reforma tributária e arcabouço fiscal nos principais veículos do país.',
      resumoEditorial: 'O cenário econômico brasileiro combina a força exportadora de alimentos, energia e minerais com desafios históricos de produtividade, equilíbrio fiscal e custo de crédito. Acompanhe os indicadores de inflação (IPCA), as decisões de juros do Banco Central e o debate sobre o orçamento público nos principais veículos de imprensa.',
      pais: 'BR',
      nomePais: 'Brasil',
      continente: 'sul',
      tipoNoticia: 'economia',
      termoBusca: 'economia inflação juros dólar PIB',
      linhaDoTempoId: 'economia-brasil',
      explicacoesRelacionadas: ['o-que-e-inflacao', 'o-que-e-o-orcamento'],
      paginasRelacionadas: ['/politica/brasil', '/clima', '/tecnologia'],
      perguntasFrequentes: [
        {
          pergunta: 'Por que a taxa Selic influencia tanto a economia brasileira?',
          resposta: 'A Selic é a taxa básica de juros da economia. Quando sobe, encarece o crédito para conter a inflação, mas também aumenta o custo da dívida pública e pode desacelerar investimentos.'
        },
        {
          pergunta: 'O que é o arcabouço fiscal?',
          resposta: 'É o conjunto de regras que limita o crescimento real das despesas do governo a uma proporção do aumento da arrecadação e estabelece metas anuais de resultado primário.'
        }
      ],
      noticiasDestaque: [
        {
          titulo: 'Banco Central e mercado financeiro acompanham inflação de serviços, câmbio e metas fiscais',
          resumo: 'Expectativas para o IPCA e o ritmo da atividade econômica pautam decisões sobre a taxa Selic.',
          fonte: 'g1 Economia',
          data: '2026-11-06',
          url: 'https://g1.globo.com/busca/?q=Banco+Central+inflacao+Selic+IPCA'
        },
        {
          titulo: 'Implementação da Reforma Tributária e medidas de revisão de gastos avançam em Brasília',
          resumo: 'Setores produtivos e Fazenda discutem regulamentação do novo sistema de impostos sobre consumo.',
          fonte: 'Folha de S.Paulo — Mercado',
          data: '2026-11-06',
          url: 'https://search.folha.uol.com.br/?q=reforma+tributaria+gastos+fazenda&site=todos'
        },
        {
          titulo: 'Emprego, renda das famílias e financiamento industrial entram no centro do debate econômico',
          resumo: 'Economistas avaliam equilíbrio entre controle inflacionário e estímulo ao investimento produtivo.',
          fonte: 'Estadão Economia',
          data: '2026-11-05',
          url: 'https://busca.estadao.com.br/?q=emprego+renda+inflacao+industria'
        }
      ]
    },
    '/eleicoes': {
      rota: '/eleicoes',
      slug: 'eleicoes',
      titulo: 'Eleições e Democracia no Mundo',
      subtitulo: 'Cobertura eleitoral, sistemas de votação, pesquisas e disputas políticas no Brasil e no exterior.',
      metaTitle: 'Eleições — Cobertura nacional e internacional comparada | Rodando o Mundo',
      metaDescription: 'Acompanhe eleições no Brasil, nos Estados Unidos, na América Latina e na Europa com comparação entre veículos, linha do tempo e explicações.',
      resumoEditorial: 'Processos eleitorais definem os rumos políticos e econômicos das nações e colocam à prova as instituições democráticas diante da polarização e da desinformação digital. Explore a cobertura de eleições presidenciais e legislativas em diferentes países e entenda como funcionam os sistemas de votação.',
      pais: 'BR',
      nomePais: 'Brasil',
      continente: 'sul',
      tipoNoticia: 'politica',
      termoBusca: 'eleições votação candidatos pesquisas',
      linhaDoTempoId: 'eleicoes',
      explicacoesRelacionadas: ['como-funcionam-as-eleicoes-nos-eua', 'o-que-e-impeachment'],
      paginasRelacionadas: ['/politica/brasil', '/politica/estados-unidos'],
      perguntasFrequentes: [
        {
          pergunta: 'Qual a principal diferença entre o sistema eleitoral do Brasil e o dos Estados Unidos?',
          resposta: 'No Brasil, o presidente é eleito por voto popular direto em até dois turnos, com apuração eletrônica nacional pelo TSE. Nos EUA, a eleição é indireta, decidida por 538 delegados estaduais no Colégio Eleitoral.'
        }
      ],
      noticiasDestaque: [
        {
          titulo: 'Cenário eleitoral e articulações partidárias movimentam disputas políticas no Brasil e nas Américas',
          resumo: 'Partidos calibram alianças regionais e nacionais de olho nas próximas disputas majoritárias e proporcionais.',
          fonte: 'O Globo Política',
          data: '2026-11-06',
          url: 'https://oglobo.globo.com/politica/'
        },
        {
          titulo: 'Repercussão internacional das eleições americanas redesenha alianças diplomáticas',
          resumo: 'Governos da Europa, Ásia e América Latina analisam impactos políticos e econômicos do resultado nos EUA.',
          fonte: 'Folha de S.Paulo — Mundo',
          data: '2026-11-06',
          url: 'https://www.folha.uol.com.br/mundo/'
        }
      ]
    },
    '/clima': {
      rota: '/clima',
      slug: 'clima',
      titulo: 'Clima, Amazônia e Transição Energética',
      subtitulo: 'Mudanças climáticas, legado da COP30, preservação de biomas e metas de descarbonização global.',
      metaTitle: 'Clima e COP30 — Notícias, linha do tempo e perspectivas | Rodando o Mundo',
      metaDescription: 'Acompanhe notícias sobre mudanças climáticas, Amazônia, COP30, transição energética e mercado de carbono nos veículos do Brasil e do mundo.',
      resumoEditorial: 'A crise climática deixou de ser uma projeção futura para se tornar um tema central da economia, da geopolítica e da segurança alimentar. Da proteção da Amazônia ao financiamento da transição energética discutido na COP30, veja como a imprensa nacional e estrangeira acompanha a agenda ambiental.',
      pais: 'BR',
      nomePais: 'Brasil',
      continente: 'sul',
      tipoNoticia: 'mundo',
      termoBusca: 'clima Amazônia meio ambiente transição energética',
      linhaDoTempoId: 'clima',
      explicacoesRelacionadas: ['o-que-e-a-cop30'],
      paginasRelacionadas: ['/politica/brasil', '/economia/brasil', '/tecnologia'],
      perguntasFrequentes: [
        {
          pergunta: 'O que são as metas NDCs no Acordo de Paris?',
          resposta: 'São as Contribuições Nacionalmente Determinadas, ou seja, os compromissos oficiais que cada país apresenta à ONU indicando quanto vai reduzir suas emissões de gases de efeito estufa.'
        },
        {
          pergunta: 'Por que o Brasil tem papel estratégico nas negociações climáticas?',
          resposta: 'Por abrigar a maior parte da Amazônia, possuir uma matriz elétrica majoritariamente renovável e ser, ao mesmo tempo, uma potência agroambiental.'
        }
      ],
      noticiasDestaque: [
        {
          titulo: 'Financiamento climático e metas de redução de desmatamento concentram negociações internacionais',
          resumo: 'Países em desenvolvimento cobram cumprimento de aportes financeiros para preservação florestal e adaptação.',
          fonte: 'Agência Brasil',
          data: '2026-11-06',
          url: 'https://agenciabrasil.ebc.com.br/internacional'
        },
        {
          titulo: 'Investimentos em energia solar, eólica e biocombustíveis aceleram transição energética no Brasil',
          resumo: 'Novos projetos de hidrogênio de baixo carbono e mercado regulado atraem capital privado.',
          fonte: 'g1 Natureza / Economia',
          data: '2026-11-05',
          url: 'https://g1.globo.com/economia/'
        }
      ]
    },
    '/tecnologia': {
      rota: '/tecnologia',
      slug: 'tecnologia',
      titulo: 'Tecnologia e Inteligência Artificial',
      subtitulo: 'Inovação, IA generativa, semicondutores, cibersegurança e o debate sobre regulação das plataformas.',
      metaTitle: 'Tecnologia e Inteligência Artificial — Cobertura global | Rodando o Mundo',
      metaDescription: 'Explore notícias sobre inteligência artificial, semicondutores, regulação digital e ciência nos principais veículos de tecnologia do Brasil e do mundo.',
      resumoEditorial: 'A rápida evolução da inteligência artificial e a disputa global por semicondutores avançados transformaram a tecnologia em um dos principais vetores geopolíticos e econômicos do século XXI. Compare a cobertura sobre inovação, regulação digital e o impacto da automação no trabalho.',
      pais: 'BR',
      nomePais: 'Brasil',
      continente: 'sul',
      tipoNoticia: 'tecnologia',
      termoBusca: 'tecnologia inteligência artificial digital',
      linhaDoTempoId: 'tecnologia',
      explicacoesRelacionadas: ['o-que-e-sancao-internacional'],
      paginasRelacionadas: ['/politica/estados-unidos', '/economia/brasil', '/clima'],
      perguntasFrequentes: [
        {
          pergunta: 'Por que os semicondutores (chips) se tornaram uma questão geopolítica?',
          resposta: 'Porque são componentes indispensáveis para treinar modelos de inteligência artificial, supercomputadores, telecomunicações e sistemas de defesa, com produção altamente concentrada na Ásia e tecnologia projetada nos EUA e na Europa.'
        }
      ],
      noticiasDestaque: [
        {
          titulo: 'Avanço de modelos de inteligência artificial impulsiona demanda por data centers e energia limpa',
          resumo: 'Gigantes de tecnologia ampliam infraestrutura global enquanto governos discutem regras de direitos autorais e segurança.',
          fonte: 'Folha de S.Paulo — Tec',
          data: '2026-11-06',
          url: 'https://www.folha.uol.com.br/tec/'
        },
        {
          titulo: 'Regulação de plataformas digitais e cibersegurança entram na pauta de parlamentos e reguladores',
          resumo: 'Debate equilibra liberdade de expressão, proteção de dados pessoais e responsabilidade sobre conteúdos ilegais.',
          fonte: 'g1 Tecnologia',
          data: '2026-11-05',
          url: 'https://g1.globo.com/tecnologia/'
        }
      ]
    },
    '/guerra-ucrania': {
      rota: '/guerra-ucrania',
      slug: 'guerra-ucrania',
      titulo: 'Guerra na Ucrânia e Geopolítica Europeia',
      subtitulo: 'Cobertura do conflito no Leste Europeu, diplomacia internacional, OTAN e impactos econômicos globais.',
      metaTitle: 'Guerra na Ucrânia — Cobertura internacional, linha do tempo e contexto | Rodando o Mundo',
      metaDescription: 'Acompanhe as últimas notícias sobre a Guerra na Ucrânia, Rússia, OTAN, sanções internacionais e negociações diplomáticas em múltiplas fontes.',
      resumoEditorial: 'O conflito entre Rússia e Ucrânia redesenhou a arquitetura de segurança da Europa, alterou fluxos globais de energia e grãos e desencadeou o maior pacote de sanções econômicas da história recente. Compare como veículos ucranianos, europeus, norte-americanos e brasileiros cobrem os desdobramentos militares e diplomáticos.',
      pais: 'UA',
      nomePais: 'Ucrânia',
      continente: 'europa',
      tipoNoticia: 'mundo',
      termoBusca: 'Ukraine Russia war NATO',
      linhaDoTempoId: 'guerra-ucrania',
      explicacoesRelacionadas: ['o-que-e-sancao-internacional'],
      paginasRelacionadas: ['/politica/estados-unidos', '/politica/brasil', '/clima'],
      perguntasFrequentes: [
        {
          pergunta: 'Como comparar a cobertura de diferentes países sobre a Guerra na Ucrânia?',
          resposta: 'Você pode usar os carrosséis desta página temática ou navegar no mapa até Ucrânia (/Europa/UA), Reino Unido (/Europa/GB), França (/Europa/FR), Estados Unidos (/Norte/US) e Brasil (/Sul/BR) para contrastar diferentes perspectivas editoriais.'
        }
      ],
      noticiasDestaque: [
        {
          titulo: 'Líderes europeus e Kiev avaliam cenário diplomático e continuidade do apoio militar e financeiro',
          resumo: 'Capitais da União Europeia discutem fortalecimento da indústria de defesa do bloco e garantias de segurança.',
          fonte: 'The Kyiv Independent',
          data: '2026-11-06',
          url: 'https://kyivindependent.com'
        },
        {
          titulo: 'Impactos geopolíticos do conflito no Leste Europeu e o papel das potências emergentes nas negociações',
          resumo: 'Iniciativas diplomáticas buscam caminhos para proteção de infraestrutura civil e estabilidade energética.',
          fonte: 'BBC News / Le Monde',
          data: '2026-11-06',
          url: 'https://www.bbc.com/news/world'
        }
      ]
    },
    '/esportes': {
      rota: '/esportes',
      slug: 'esportes',
      titulo: 'Esportes e Futebol Mundial',
      subtitulo: 'Campeonatos nacionais, torneios continentais, transferências, automobilismo e esportes olímpicos.',
      metaTitle: 'Esportes e Futebol Mundial — Cobertura esportiva comparada | Rodando o Mundo',
      metaDescription: 'Acompanhe as últimas notícias do futebol brasileiro, Champions League, Libertadores, Fórmula 1 e grandes eventos esportivos nos principais jornais e portais.',
      resumoEditorial: 'O esporte transcende fronteiras ao conectar torcedores, atletas e nações em grandes celebrações e intensas disputas econômicas e estratégicas. Do calendário do futebol brasileiro e sul-americano às ligas europeias e esportes olímpicos, compare a cobertura factual e as análises das principais redações esportivas.',
      pais: 'BR',
      nomePais: 'Brasil',
      continente: 'sul',
      tipoNoticia: 'esportes',
      termoBusca: 'futebol esportes Brasileirão Libertadores Champions',
      linhaDoTempoId: 'esportes',
      explicacoesRelacionadas: [],
      paginasRelacionadas: ['/cultura', '/economia/brasil', '/politica/brasil'],
      perguntasFrequentes: [
        {
          pergunta: 'Como acompanhar a cobertura esportiva de veículos de outros países?',
          resposta: 'Você pode selecionar o tema "Esportes" ao navegar por qualquer país no mapa interativo (como Reino Unido, Espanha, França ou Argentina) para visualizar diretamente as seções esportivas dos veículos cadastrados.'
        },
        {
          pergunta: 'Quais competições são mais acompanhadas nos carrosséis esportivos?',
          resposta: 'O futebol nacional e internacional (Brasileirão, Copa do Brasil, Libertadores e Champions League), além de automobilismo (Fórmula 1), basquete (NBA) e grandes eventos do ciclo olímpico.'
        }
      ],
      noticiasDestaque: [
        {
          titulo: 'Clubes disputam rodadas decisivas nos campeonatos e avançam em negociações no mercado da bola',
          resumo: 'Classificação para torneios continentais e planejamento financeiro movimentam bastidores dos elencos.',
          fonte: 'ge (Globo Esporte)',
          data: '2026-11-08',
          url: 'https://ge.globo.com/'
        },
        {
          titulo: 'Champions League e torneios europeus concentram atenção com partidas de alto nível e recordes',
          resumo: 'Principais clubes do futebol internacional definem posições na fase classificatória.',
          fonte: 'Folha de S.Paulo — Esporte',
          data: '2026-11-08',
          url: 'https://www.folha.uol.com.br/esporte/'
        },
        {
          titulo: 'Fórmula 1 e esportes olímpicos aceleram preparação para novos circuitos e calendários globais',
          resumo: 'Pilotos e equipes técnicas ajustam estratégias mecânicas e aerodinâmicas para as próximas provas.',
          fonte: 'Estadão Esportes',
          data: '2026-11-07',
          url: 'https://www.estadao.com.br/esportes/'
        }
      ]
    },
    '/saude': {
      rota: '/saude',
      slug: 'saude',
      titulo: 'Saúde Pública, Ciência e Bem-Estar',
      subtitulo: 'Políticas do SUS, vacinação, vigilância epidemiológica, medicina preventiva e pesquisas globais.',
      metaTitle: 'Saúde Pública e Ciência Médica — Cobertura e pesquisas | Rodando o Mundo',
      metaDescription: 'Notícias sobre saúde pública, Sistema Único de Saúde (SUS), imunização, avanços médicos, Anvisa e bem-estar nos principais veículos do país e do mundo.',
      resumoEditorial: 'A saúde e a pesquisa biomédica são condições fundamentais para o desenvolvimento humano, a longevidade e a segurança coletiva. Das campanhas de imunização e fortalecimento do SUS até os avanços científicos contra doenças crônicas e regulação da Anvisa, compare o noticiário especializado em fontes confiáveis.',
      pais: 'BR',
      nomePais: 'Brasil',
      continente: 'sul',
      tipoNoticia: 'saude',
      termoBusca: 'saúde SUS vacinas medicina hospitais',
      linhaDoTempoId: 'saude',
      explicacoesRelacionadas: [],
      paginasRelacionadas: ['/tecnologia', '/clima', '/economia/brasil'],
      perguntasFrequentes: [
        {
          pergunta: 'Como o Rodando o Mundo seleciona fontes para o tema Saúde?',
          resposta: 'Privilegiamos veículos jornalísticos com editorias dedicadas à ciência, saúde pública e medicina, com rigor factual, checagem científica e consulta a órgãos oficiais como OMS, Ministério da Saúde, Fiocruz e Anvisa.'
        },
        {
          pergunta: 'Por que o SUS é um tema de destaque na cobertura médica brasileira?',
          resposta: 'Por ser um dos maiores sistemas públicos e universais de saúde do planeta, garantindo desde vacinação em massa e atenção primária até procedimentos de alta complexidade e transplantes.'
        }
      ],
      noticiasDestaque: [
        {
          titulo: 'Ministério da Saúde e Fiocruz ampliam campanhas de vacinação e monitoramento epidemiológico',
          resumo: 'Ações de busca ativa e reforço de imunizantes buscam elevar coberturas vacinais em todas as regiões.',
          fonte: 'Agência Brasil',
          data: '2026-11-08',
          url: 'https://agenciabrasil.ebc.com.br/saude'
        },
        {
          titulo: 'Novas terapias e estudos biomédicos ganham aval regulatório para tratamentos oncológicos',
          resumo: 'Avanços em imunoterapia e medicamentos biológicos oferecem opções inovadoras na rede de saúde.',
          fonte: 'g1 Saúde',
          data: '2026-11-08',
          url: 'https://g1.globo.com/saude/'
        },
        {
          titulo: 'Hospitais e pesquisadores debatem saúde mental, nutrição e qualidade de vida na atenção básica',
          resumo: 'Especialistas reforçam a importância de abordagens preventivas para redução de riscos cardiovasculares e metabólicos.',
          fonte: 'Folha de S.Paulo — Equilíbrio e Saúde',
          data: '2026-11-07',
          url: 'https://www.folha.uol.com.br/equilibrioesaude/'
        }
      ]
    },
    '/cultura': {
      rota: '/cultura',
      slug: 'cultura',
      titulo: 'Cultura, Artes e Sociedade',
      subtitulo: 'Cinema, literatura, artes visuais, música, patrimônio histórico e festivais internacionais.',
      metaTitle: 'Cultura, Cinema e Artes — Cobertura artística e crítica | Rodando o Mundo',
      metaDescription: 'Explore notícias, lançamentos e debates culturais sobre cinema, literatura, música, patrimônio e sociedade nos principais jornais e revistas.',
      resumoEditorial: 'A cultura reflete a diversidade, a memória e as transformações sociais de cada nação. Das grandes produções cinematográficas e lançamentos literários até a preservação do patrimônio histórico e os novos formatos de consumo digital, explore as manifestações artísticas do Brasil e do mundo com pluralidade crítica.',
      pais: 'BR',
      nomePais: 'Brasil',
      continente: 'sul',
      tipoNoticia: 'cultura',
      termoBusca: 'cultura cinema literatura música artes festivais',
      linhaDoTempoId: 'cultura',
      explicacoesRelacionadas: [],
      paginasRelacionadas: ['/tecnologia', '/politica/brasil', '/esportes'],
      perguntasFrequentes: [
        {
          pergunta: 'Como acompanhar a cobertura cultural internacional no Rodando o Mundo?',
          resposta: 'Selecione o filtro "Cultura" em qualquer país no mapa para descobrir as páginas e cadernos de literatura, cinema, música e artes plásticas dos veículos daquele território.'
        },
        {
          pergunta: 'O que a página temática de Cultura aborda?',
          resposta: 'Destaques do cinema nacional e internacional, premiações de arte, feiras literárias, exposições, festivais musicais e políticas de incentivo e preservação patrimonial.'
        }
      ],
      noticiasDestaque: [
        {
          titulo: 'Festivais internacionais de cinema e circuito nacional destacam produções independentes premiadas',
          resumo: 'Obras de diretores contemporâneos atraem público e crítica em mostras competitivas.',
          fonte: 'Folha de S.Paulo — Ilustrada',
          data: '2026-11-08',
          url: 'https://www.folha.uol.com.br/ilustrada/'
        },
        {
          titulo: 'Mercado editorial celebra crescimento de novas vozes na literatura e feiras de livros',
          resumo: 'Encontros literários impulsionam traduções e debates sobre autores consagrados e novos expoentes.',
          fonte: 'O Globo — Cultura',
          data: '2026-11-08',
          url: 'https://oglobo.globo.com/cultura/'
        },
        {
          titulo: 'Projetos de restauração e preservação do patrimônio histórico ganham novos investimentos',
          resumo: 'Museus e centros culturais modernizam acervos para ampliar acesso público e democratizar a história.',
          fonte: 'CartaCapital — Cultura',
          data: '2026-11-07',
          url: 'https://www.cartacapital.com.br/cultura/'
        }
      ]
    }
  };

  // Req 5: Resumo do dia — 5 principais notícias organizadas por relevância (1 a 5)
  var RESUMO_DO_DIA = [
    {
      relevancia: 1,
      categoria: 'Geopolítica & EUA',
      titulo: 'Transição e novas diretrizes em Washington mobilizam governos e mercados globais',
      resumo: 'Definições da equipe da Casa Branca sobre tarifas comerciais, imigração e política externa levam União Europeia, China e países da América Latina a recalibrar estratégias diplomáticas e econômicas.',
      fonte: 'Associated Press',
      dominio: 'apnews.com',
      termoBusca: 'Trump White House tariffs',
      url: 'https://apnews.com/hub/donald-trump',
      paginaTematica: '/politica/estados-unidos',
      labelTematica: 'Política nos EUA',
      comparacaoSlug: 'transicao-eua-tarifas',
      explicacaoId: 'como-funcionam-as-eleicoes-nos-eua',
      pais: 'Estados Unidos',
      codigoPais: 'us',
      continente: 'norte',
      tipoNoticia: 'politica'
    },
    {
      relevancia: 2,
      categoria: 'Brasil · Política & Fiscal',
      titulo: 'Planalto e Congresso negociam Orçamento, meta fiscal e regras para emendas parlamentares',
      resumo: 'Articulação entre Executivo e Legislativo busca equilibrar o cumprimento do arcabouço fiscal com a preservação de investimentos prioritários e novas exigências de transparência do STF.',
      fonte: 'Folha de S.Paulo',
      dominio: 'folha.uol.com.br',
      termoBusca: 'orçamento emendas congresso',
      url: 'https://search.folha.uol.com.br/?q=orcamento+emendas+congresso&site=todos',
      paginaTematica: '/politica/brasil',
      labelTematica: 'Política no Brasil',
      comparacaoSlug: 'orcamento-brasil-fiscal',
      explicacaoId: 'o-que-e-o-orcamento',
      pais: 'Brasil',
      codigoPais: 'br',
      continente: 'sul',
      tipoNoticia: 'politica'
    },
    {
      relevancia: 3,
      categoria: 'Economia & Juros',
      titulo: 'Banco Central monitora inflação e câmbio diante de incertezas no cenário internacional',
      resumo: 'Pressão do dólar e comportamento dos preços de alimentos e serviços mantêm atenção sobre a trajetória da taxa Selic e o poder de compra das famílias brasileiras.',
      fonte: 'g1 Economia',
      dominio: 'g1.globo.com',
      termoBusca: 'Banco Central inflação Selic dólar',
      url: 'https://g1.globo.com/busca/?q=Banco+Central+inflacao+Selic',
      paginaTematica: '/economia/brasil',
      labelTematica: 'Economia no Brasil',
      comparacaoSlug: 'banco-central-selic',
      explicacaoId: 'o-que-e-inflacao',
      pais: 'Brasil',
      codigoPais: 'br',
      continente: 'sul',
      tipoNoticia: 'economia'
    },
    {
      relevancia: 4,
      categoria: 'Segurança Internacional',
      titulo: 'Europa discute futuro do apoio à Ucrânia e segurança continental diante de novo quadro político',
      resumo: 'Governos da União Europeia e da OTAN avaliam financiamento de defesa, aplicação de sanções econômicas e perspectivas diplomáticas para o conflito no Leste Europeu.',
      fonte: 'BBC News',
      dominio: 'bbc.com',
      termoBusca: 'Ukraine Europe NATO war',
      url: 'https://www.bbc.com/news/war-in-ukraine',
      paginaTematica: '/guerra-ucrania',
      labelTematica: 'Guerra na Ucrânia',
      comparacaoSlug: 'guerra-ucrania-europa',
      explicacaoId: 'o-que-e-sancao-internacional',
      pais: 'Ucrânia',
      codigoPais: 'ua',
      continente: 'europa',
      tipoNoticia: 'mundo'
    },
    {
      relevancia: 5,
      categoria: 'Clima & Tecnologia',
      titulo: 'Financiamento da transição energética e demanda de energia por IA pautam agenda global',
      resumo: 'Expansão acelerada de data centers de inteligência artificial se cruza com os compromissos climáticos pós-COP30 por matrizes elétricas limpas e mercado de carbono.',
      fonte: 'Agência Brasil',
      dominio: 'agenciabrasil.ebc.com.br',
      termoBusca: 'COP30 clima transição energética',
      url: 'https://agenciabrasil.ebc.com.br/es/tags/cop30',
      paginaTematica: '/clima',
      labelTematica: 'Clima e COP30',
      comparacaoSlug: 'transicao-energetica-cop30',
      explicacaoId: 'o-que-e-a-cop30',
      pais: 'Brasil',
      codigoPais: 'br',
      continente: 'sul',
      tipoNoticia: 'mundo'
    }
  ];

  // Req: Página de Comparação de Cobertura Editorial — Casos Estruturados
  var COMPARACOES = {
    'transicao-eua-tarifas': {
      id: 'transicao-eua-tarifas',
      slug: 'transicao-eua-tarifas',
      paisIso: 'US',
      tituloNeutro: 'Diretrizes em Washington sobre comércio internacional: impactos e reações globais',
      categoria: 'Geopolítica & Economia',
      veiculosCount: 34,
      paisesCount: 19,
      atualizadoMin: 14,
      consenso: [
        'A Casa Branca formalizou a intenção de revisar alíquotas de importação para parceiros comerciais estratégicos.',
        'Mercados cambiais e de commodities registraram volatilidade imediata após os comunicados oficiais sobre barreiras comerciais.',
        'Governos da União Europeia, China e América Latina iniciaram consultas para definir medidas de resposta ou negociar acordos bilaterais.'
      ],
      sinteseEnquadramento: {
        todos: 'A cobertura global divide-se entre a meta de reindustrialização nos EUA e os temores de inflação e protecionismo comercial no restante do mundo.',
        eua: 'Enfoque doméstico na redução do déficit comercial, defesa do trabalhador americano e cumprimento de compromissos eleitorais.',
        brasil: 'Apreensão com exportações de aço, carne e commodities agrícolas, além do impacto cambial no custo de insumos e na inflação interna.',
        europa: 'Alerta contra guerra comercial e apelo ao multilateralismo da OMC, com preparação de tarifas retaliatórias proporcionais em caso de taxação arbitrária.',
        asia: 'Busca por rotas comerciais alternativas no Sul Global e ampliação do comércio intrarregional para contornar barreiras ocidentais.'
      },
      veiculosComparados: [
        {
          veiculo: 'Associated Press',
          pais: 'US',
          nomePais: 'Estados Unidos',
          regiao: 'eua',
          vies: 'I',
          perfil: 'Agência Internacional',
          tituloPT: 'Casa Branca prepara plano tarifário com foco em déficits bilaterais e reindustrialização',
          tituloOrig: 'White House prepares tariff plan targeting bilateral deficits and domestic manufacturing',
          idiomaOrig: 'en',
          enfoque: 'Enfatiza a justificativa do Executivo de recompor a base industrial e negociar termos mais vantajosos com parceiros.',
          url: 'https://apnews.com/hub/donald-trump',
          destaque: true
        },
        {
          veiculo: 'The New York Times',
          pais: 'US',
          nomePais: 'Estados Unidos',
          regiao: 'eua',
          vies: 'E',
          perfil: 'Jornal de Referência',
          tituloPT: 'Economistas alertam para risco de pressão inflacionária ao consumidor americano com novas tarifas',
          tituloOrig: 'Economists warn new tariffs could raise consumer prices and strain supply chains',
          idiomaOrig: 'en',
          enfoque: 'Analisa o custo potencial sobre famílias americanas e cadeias de varejo diante de sobretaxas generalizadas.',
          url: 'https://www.nytimes.com/',
          destaque: true
        },
        {
          veiculo: 'The Wall Street Journal',
          pais: 'US',
          nomePais: 'Estados Unidos',
          regiao: 'eua',
          vies: 'D',
          perfil: 'Imprensa Financeira Global',
          tituloPT: 'Estratégia tarifária busca alavancar acordos bilaterais e incentivar produção doméstica nos EUA',
          tituloOrig: 'Tariff strategy aims to boost leverage in bilateral trade talks and domestic output',
          idiomaOrig: 'en',
          enfoque: 'Foca no uso de tarifas como instrumento de negociação estratégica e reação dos mercados industriais.',
          url: 'https://www.wsj.com/',
          destaque: true
        },
        {
          veiculo: 'Fox News',
          pais: 'US',
          nomePais: 'Estados Unidos',
          regiao: 'eua',
          vies: 'D',
          perfil: 'Rede de Notícias',
          tituloPT: 'Casa Branca prioriza proteção da indústria americana e reciprocidade comercial com aliados',
          tituloOrig: 'White House prioritizes protecting American industry and trade reciprocity with allies',
          idiomaOrig: 'en',
          enfoque: 'Destaca o apoio de sindicatos industriais e parlamentares conservadores à proteção de fábricas locais.',
          url: 'https://www.foxnews.com/',
          destaque: false
        },
        {
          veiculo: 'The Guardian US',
          pais: 'US',
          nomePais: 'Estados Unidos',
          regiao: 'eua',
          vies: 'E',
          perfil: 'Jornal Internacional',
          tituloPT: 'Tarifas sobre importações podem elevar custo de vida e tensionar alianças históricas dos EUA',
          tituloOrig: 'Import tariffs risk raising cost of living and straining historic US alliances',
          idiomaOrig: 'en',
          enfoque: 'Aborda o impacto regressivo sobre famílias de menor renda e o risco de retaliações diplomáticas.',
          url: 'https://www.theguardian.com/us-news',
          destaque: false
        },
        {
          veiculo: 'Folha de S.Paulo',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'I',
          perfil: 'Jornal de Referência',
          tituloPT: 'Exportadores brasileiros alertam para risco de sobretaxa no aço e commodities agrícolas',
          tituloOrig: 'Exportadores brasileiros alertam para risco de sobretaxa no aço e commodities agrícolas',
          idiomaOrig: 'pt',
          enfoque: 'Destaca a vulnerabilidade de setores-chave do agronegócio e a pressão de industriais sobre o Itamaraty por negociação direta.',
          url: 'https://folha.uol.com.br/',
          destaque: true
        },
        {
          veiculo: 'Financial Times',
          pais: 'GB',
          nomePais: 'Reino Unido / Europa',
          regiao: 'europa',
          vies: 'I',
          perfil: 'Imprensa Econômica',
          tituloPT: 'Bruxelas prepara lista de retaliação comercial caso tarifas americanas sejam confirmadas',
          tituloOrig: 'Brussels readies retaliatory tariff package should US trade levies proceed',
          idiomaOrig: 'en',
          enfoque: 'Foca nos cálculos de impacto no PIB europeu e na mobilização coordenada entre Alemanha e França para conter o protecionismo.',
          url: 'https://www.ft.com/',
          destaque: true
        },
        {
          veiculo: 'South China Morning Post',
          pais: 'HK',
          nomePais: 'Hong Kong / Ásia',
          regiao: 'asia',
          vies: 'I',
          perfil: 'Mídia Regional Asiática',
          tituloPT: 'Pequim sinaliza fortalecimento de laços com mercados emergentes frente a restrições ocidentais',
          tituloOrig: 'Beijing signals deeper emerging market trade links amid Western trade scrutiny',
          idiomaOrig: 'en',
          enfoque: 'Sublinha a estratégia chinesa de redirecionar fluxos comerciais para países do Sudeste Asiático, Oriente Médio e América Latina.',
          url: 'https://www.scmp.com/',
          destaque: true
        },
        {
          veiculo: 'Le Monde',
          pais: 'FR',
          nomePais: 'França',
          regiao: 'europa',
          vies: 'I',
          perfil: 'Jornal de Referência',
          tituloPT: 'Ameaça de unilateralismo econômico divide capitais europeias sobre resposta estratégica',
          tituloOrig: 'La menace d\'un unilatéralisme économique divise les capitales européennes sur la riposte',
          idiomaOrig: 'fr',
          enfoque: 'Analisa o embate diplomático interno da UE entre partidários de conciliação rápida e defensores de retaliação firme.',
          url: 'https://www.lemonde.fr/',
          destaque: true
        },
        {
          veiculo: 'g1 Economia',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'I',
          perfil: 'Portal de Notícias',
          tituloPT: 'Dólar e juros futuros oscilam com receio de espiral protecionista internacional',
          tituloOrig: 'Dólar e juros futuros oscilam com receio de espiral protecionista internacional',
          idiomaOrig: 'pt',
          enfoque: 'Explica o efeito de curto prazo no bolso das famílias brasileiras e na taxa de câmbio.',
          url: 'https://g1.globo.com/economia/',
          destaque: false
        },
        {
          veiculo: 'Nikkei Asia',
          pais: 'JP',
          nomePais: 'Japão / Ásia',
          regiao: 'asia',
          vies: 'D',
          perfil: 'Imprensa Econômica',
          tituloPT: 'Montadoras asiáticas aceleram planos de contingência fabril diante de nova política tarifária',
          tituloOrig: 'Asian automakers fast-track contingency plans ahead of new tariff regime',
          idiomaOrig: 'en',
          enfoque: 'Aborda o impacto direto nas cadeias globais de suprimentos de semicondutores e veículos automotores.',
          url: 'https://asia.nikkei.com/',
          destaque: false
        }
      ],
      guiasRelacionados: ['o-que-e-sancao-internacional', 'o-que-e-inflacao']
    },
    'orcamento-brasil-fiscal': {
      id: 'orcamento-brasil-fiscal',
      slug: 'orcamento-brasil-fiscal',
      paisIso: 'BR',
      tituloNeutro: 'Negociação do Orçamento e regras de emendas parlamentares entre Executivo, Congresso e STF',
      categoria: 'Brasil · Política & Fiscal',
      veiculosCount: 31,
      paisesCount: 8,
      atualizadoMin: 22,
      consenso: [
        'Executivo e cúpula do Congresso buscam entendimento para adequar o Orçamento ao arcabouço fiscal.',
        'O Supremo Tribunal Federal estabeleceu parâmetros obrigatórios de rastreabilidade e transparência para emendas parlamentares.',
        'Existe pressão cruzada entre preservação de investimentos em saúde e educação e demanda de parlamentares por recursos de base eleitoral.'
      ],
      sinteseEnquadramento: {
        todos: 'O debate centraliza-se na disputa pelo controle dos gastos públicos: Executivo defende responsabilidade fiscal, Congresso preserva autonomia orçamentária e Judiciário exige controle republicano.',
        brasil: 'Foco intenso na correlação de forças entre Lula, Lira, Pacheco e ministros do STF na reta final do ano legislativo.',
        eua: 'Agências internacionais cobrem o tema sob a ótica de risco fiscal, credibilidade das contas públicas e impacto na dívida soberana.',
        europa: 'Analistas europeus comparam o modelo brasileiro de emendas com a governabilidade de coalizão e estabilidade institucional.'
      },
      veiculosComparados: [
        {
          veiculo: 'Folha de S.Paulo',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'I',
          perfil: 'Jornal de Referência',
          tituloPT: 'Congresso e Planalto negociam fórmula para destravar emendas respeitando teto do STF',
          tituloOrig: 'Congresso e Planalto negociam fórmula para destravar emendas respeitando teto do STF',
          idiomaOrig: 'pt',
          enfoque: 'Destaca os bastidores da negociação política e as concessões do Ministério da Fazenda para evitar paralisia legislativa.',
          url: 'https://folha.uol.com.br/',
          destaque: true
        },
        {
          veiculo: 'O Estado de S. Paulo',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'D',
          perfil: 'Jornal Tradicional',
          tituloPT: 'Especialistas alertam que brechas em nova regra de emendas podem enfraquecer transparência',
          tituloOrig: 'Especialistas alertam que brechas em nova regra de emendas podem enfraquecer transparência',
          idiomaOrig: 'pt',
          enfoque: 'Foco técnico na qualidade do gasto público e nas resistências do Congresso em abrir dados de beneficiários finais.',
          url: 'https://estadao.com.br/',
          destaque: true
        },
        {
          veiculo: 'Bloomberg Línea',
          pais: 'US',
          nomePais: 'Estados Unidos / Américas',
          regiao: 'eua',
          vies: 'I',
          perfil: 'Imprensa Econômica',
          tituloPT: 'Impasse fiscal no Brasil testa limites do arcabouço e paciência de investidores',
          tituloOrig: 'Impasse fiscal no Brasil testa limites do arcabouço e paciência de investidores',
          idiomaOrig: 'pt',
          enfoque: 'Analisa o sentimento do mercado financeiro e a percepção de risco para a meta de déficit zero.',
          url: 'https://bloomberglinea.com.br/',
          destaque: true
        },
        {
          veiculo: 'CartaCapital',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'E',
          perfil: 'Revista Crítica / Independente',
          tituloPT: 'Disputa pelo orçamento público testa prioridades de investimento social do governo',
          tituloOrig: 'Disputa pelo orçamento público testa prioridades de investimento social do governo',
          idiomaOrig: 'pt',
          enfoque: 'Crítica à captura orçamentária pelo Centrão e à restrição imposta a investimentos estruturantes.',
          url: 'https://cartacapital.com.br/',
          destaque: true
        },
        {
          veiculo: 'Reuters Brasil',
          pais: 'GB',
          nomePais: 'Reino Unido / Internacional',
          regiao: 'europa',
          vies: 'I',
          perfil: 'Agência Internacional',
          tituloPT: 'Fazenda reafirma compromisso com meta fiscal enquanto articula consenso orçamentário',
          tituloOrig: 'Fazenda reafirma compromisso com meta fiscal enquanto articula consenso orçamentário',
          idiomaOrig: 'pt',
          enfoque: 'Visão neutra sobre os prazos regimentais e o cronograma de votação na Comissão Mista de Orçamento.',
          url: 'https://reuters.com/',
          destaque: true
        },
        {
          veiculo: 'Poder360',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'D',
          perfil: 'Mídia Digital de Brasília',
          tituloPT: 'Placar das emendas: saiba quanto cada bancada partidária garantiu no texto preliminar',
          tituloOrig: 'Placar das emendas: saiba quanto cada bancada partidária garantiu no texto preliminar',
          idiomaOrig: 'pt',
          enfoque: 'Mapeamento quantitativo detalhado da distribuição de valores entre partidos da Câmara e do Senado.',
          url: 'https://poder360.com.br/',
          destaque: false
        },
        {
          veiculo: 'Brasil 247',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'E',
          perfil: 'Portal Progressista',
          tituloPT: 'Base governista defende blindagem de investimentos sociais diante de pressão fiscal do mercado',
          tituloOrig: 'Base governista defende blindagem de investimentos sociais diante de pressão fiscal do mercado',
          idiomaOrig: 'pt',
          enfoque: 'Ressalta a defesa dos pisos constitucionais da saúde e educação e critica exigências de austeridade.',
          url: 'https://www.brasil247.com/',
          destaque: false
        },
        {
          veiculo: 'Agência Brasil',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'I',
          perfil: 'Agência Pública',
          tituloPT: 'Governo envia parâmetros técnicos de rastreabilidade de emendas em cumprimento a decisão do STF',
          tituloOrig: 'Governo envia parâmetros técnicos de rastreabilidade de emendas em cumprimento a decisão do STF',
          idiomaOrig: 'pt',
          enfoque: 'Relato institucional sobre as normas técnicas de transparência e execução orçamentária.',
          url: 'https://agenciabrasil.ebc.com.br/',
          destaque: false
        }
      ],
      guiasRelacionados: ['o-que-e-o-orcamento', 'o-que-e-impeachment']
    },
    'banco-central-selic': {
      id: 'banco-central-selic',
      slug: 'banco-central-selic',
      paisIso: 'BR',
      tituloNeutro: 'Decisões sobre juros e inflação: Banco Central monitora câmbio e cenário global',
      categoria: 'Economia & Finanças',
      veiculosCount: 31,
      paisesCount: 11,
      atualizadoMin: 35,
      consenso: [
        'O Comitê de Política Monetária (Copom) acompanha a convergência da inflação em relação à meta oficial de 3%.',
        'A volatilidade do dólar e os custos de frete internacional adicionam pressão sobre preços de alimentos e energia.',
        'Divergências persistem entre analistas sobre a intensidade e a duração do ciclo de juros altos.'
      ],
      sinteseEnquadramento: {
        todos: 'Contraste direto entre a ortodoxia da autoridade monetária na contenção dos preços e as críticas do setor produtivo e governista aos custos sociais do crédito restrito.',
        brasil: 'Debate acirrado sobre o equilíbrio entre desaceleração da inflação e estímulo ao crescimento do emprego e do PIB.',
        eua: 'Foco no diferencial de juros (spread) entre Brasil e Federal Reserve e atratividade para fluxos de capital estrangeiro (carry trade).'
      },
      veiculosComparados: [
        {
          veiculo: 'Valor Econômico',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'I',
          perfil: 'Imprensa Econômica',
          tituloPT: 'Copom indica vigilância reforçada e sinaliza cautela diante de expectativas desancoradas',
          tituloOrig: 'Copom indica vigilância reforçada e sinaliza cautela diante de expectativas desancoradas',
          idiomaOrig: 'pt',
          enfoque: 'Analisa detalhadamente a ata do colegiado e a preocupação com o hiato do produto e mercado de trabalho aquecido.',
          url: 'https://valor.globo.com/',
          destaque: true
        },
        {
          veiculo: 'Wall Street Journal',
          pais: 'US',
          nomePais: 'Estados Unidos',
          regiao: 'eua',
          vies: 'D',
          perfil: 'Imprensa Financeira Global',
          tituloPT: 'Banco Central do Brasil mantém postura conservadora em contraste com cortes regionais',
          tituloOrig: 'Brazil’s Central Bank maintains hawkish stance contrasting regional easing cycle',
          idiomaOrig: 'en',
          enfoque: 'Contrasta a política do Brasil com a de outros emergentes latino-americanos que já começaram a afrouxar juros.',
          url: 'https://wsj.com/',
          destaque: true
        },
        {
          veiculo: 'Brasil de Fato',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'E',
          perfil: 'Imprensa Independente / Social',
          tituloPT: 'Juro alto eleva despesas financeiras públicas enquanto encarece crédito para famílias',
          tituloOrig: 'Juro alto eleva despesas financeiras públicas enquanto encarece crédito para famílias',
          idiomaOrig: 'pt',
          enfoque: 'Aborda o impacto social direto: endividamento das famílias, travamento do consumo e transferência de renda para o setor bancário.',
          url: 'https://brasildefato.com.br/',
          destaque: true
        },
        {
          veiculo: 'Financial Times',
          pais: 'GB',
          nomePais: 'Reino Unido / Europa',
          regiao: 'europa',
          vies: 'I',
          perfil: 'Imprensa Econômica',
          tituloPT: 'Transição na liderança monetária brasileira testa credibilidade de investidores',
          tituloOrig: 'Transition at Brazil’s central bank tests autonomy and investor sentiment',
          idiomaOrig: 'en',
          enfoque: 'Examina a percepção do mercado financeiro global sobre a consistência das metas inflacionárias no país.',
          url: 'https://ft.com/',
          destaque: true
        }
      ],
      guiasRelacionados: ['o-que-e-inflacao', 'o-que-e-o-orcamento']
    },
    'guerra-ucrania-europa': {
      id: 'guerra-ucrania-europa',
      slug: 'guerra-ucrania-europa',
      paisIso: 'UA',
      tituloNeutro: 'Segurança europeia, apoio militar e discussões diplomáticas sobre o conflito na Ucrânia',
      categoria: 'Segurança Internacional',
      veiculosCount: 8,
      paisesCount: 22,
      atualizadoMin: 41,
      consenso: [
        'Países europeus e membros da OTAN debatem novos pacotes de financiamento e defesa para Kiev.',
        'Governo russo mantém ofensiva no leste ucraniano e condiciona qualquer cessar-fogo à neutralidade da Ucrânia.',
        'Perspectiva de mudanças nas diretrizes de Washington eleva a pressão para a Europa assumir protagonismo nos custos do conflito.'
      ],
      sinteseEnquadramento: {
        todos: 'Disputa entre a necessidade de deter a expansão russa e a fadiga orçamentária dos governos ocidentais.',
        europa: 'Urgência na construção de autonomia estratégica de defesa e contenção de riscos às fronteiras leste da UE.',
        eua: 'Debate partidário acirrado no Congresso americano sobre corte de gastos militares no exterior.',
        brasil: 'Defesa de neutralidade ativa, canais de negociação diplomática e rejeição de sanções unilaterais que afetem o comércio global.'
      },
      veiculosComparados: [
        {
          veiculo: 'BBC News',
          pais: 'GB',
          nomePais: 'Reino Unido',
          regiao: 'europa',
          vies: 'I',
          perfil: 'Mídia Pública Internacional',
          tituloPT: 'Líderes europeus debatem plano emergencial para suprir eventual recuo militar dos EUA',
          tituloOrig: 'European leaders debate emergency funding to offset potential US aid scaleback',
          idiomaOrig: 'en',
          enfoque: 'Destaca a reunião de cúpula dos chefes de Estado da UE e o aumento do orçamento de defesa comunitário.',
          url: 'https://bbc.com/news/',
          destaque: true
        },
        {
          veiculo: 'The New York Times',
          pais: 'US',
          nomePais: 'Estados Unidos',
          regiao: 'eua',
          vies: 'E',
          perfil: 'Jornal de Referência',
          tituloPT: 'EUA e aliados recalibram inteligência e envio de equipamentos antes de transições políticas',
          tituloOrig: 'US and allies recalibrate intelligence and equipment shipments ahead of political transitions',
          idiomaOrig: 'en',
          enfoque: 'Foca nas decisões estratégicas do Pentágono para consolidar posições defensivas antes de reavaliações políticas.',
          url: 'https://nytimes.com/',
          destaque: true
        },
        {
          veiculo: 'Deutsche Welle',
          pais: 'DE',
          nomePais: 'Alemanha',
          regiao: 'europa',
          vies: 'I',
          perfil: 'Mídia Internacional',
          tituloPT: 'Alemanha reforça suporte à infraestrutura elétrica ucraniana danificada por bombardeios',
          tituloOrig: 'Germany steps up power grid support for Ukraine as winter challenges mount',
          idiomaOrig: 'en',
          enfoque: 'Aborda a dimensão humanitária, estabilidade energética e acolhimento de refugiados na Europa Central.',
          url: 'https://dw.com/',
          destaque: true
        },
        {
          veiculo: 'O Globo',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'I',
          perfil: 'Jornal de Referência',
          tituloPT: 'Brasil reitera proposta de grupo de paz e adverte contra isolamento do diálogo multilateral',
          tituloOrig: 'Brasil reitera proposta de grupo de paz e adverte contra isolamento do diálogo multilateral',
          idiomaOrig: 'pt',
          enfoque: 'Enfatiza a posição histórica da diplomacia brasileira por diálogo sem pré-condições que inviabilizem a paz.',
          url: 'https://oglobo.globo.com/',
          destaque: true
        }
      ],
      guiasRelacionados: ['o-que-e-sancao-internacional']
    },
    'transicao-energetica-cop30': {
      id: 'transicao-energetica-cop30',
      slug: 'transicao-energetica-cop30',
      paisIso: 'BR',
      tituloNeutro: 'Metas climáticas, transição energética e demanda de eletricidade por inteligência artificial',
      categoria: 'Clima & Tecnologia',
      veiculosCount: 31,
      paisesCount: 16,
      atualizadoMin: 50,
      consenso: [
        'A transição para fontes renováveis exige centenas de bilhões de dólares em financiamento para países em desenvolvimento.',
        'A proliferação global de novos centros de dados para inteligência artificial elevou abruptamente a projeção de consumo de energia.',
        'Negociações em fóruns climáticos internacionais enfrentam atritos entre nações produtoras de combustíveis fósseis e defensores de metas estritas.'
      ],
      sinteseEnquadramento: {
        todos: 'Confronto entre a urgência de cortes de emissões de carbono e a crescente voracidade energética da corrida tecnológica.',
        brasil: 'Brasil se posiciona como potência verde competitiva para abrigar data centers sustentáveis com matriz hidrelétrica e solar.',
        europa: 'Rigor regulatório, taxação de carbono na fronteira e metas de neutralidade até 2050.',
        eua: 'Busca por equilíbrio entre expansão nuclear/gás natural para IA e compromissos ambientais.'
      },
      veiculosComparados: [
        {
          veiculo: 'Agência Brasil',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'I',
          perfil: 'Agência Pública',
          tituloPT: 'Brasil apresenta potencial de energia limpa para atrair infraestrutura global de tecnologia',
          tituloOrig: 'Brasil apresenta potencial de energia limpa para atrair infraestrutura global de tecnologia',
          idiomaOrig: 'pt',
          enfoque: 'Destaca a vantagem comparativa do país com 88% de matriz elétrica renovável para atração de investimentos.',
          url: 'https://agenciabrasil.ebc.com.br/',
          destaque: true
        },
        {
          veiculo: 'Estadão',
          pais: 'BR',
          nomePais: 'Brasil',
          regiao: 'brasil',
          vies: 'D',
          perfil: 'Jornal Tradicional',
          tituloPT: 'Setor produtivo cobra segurança regulatória e leilões de transmissão para sustentar transição verde',
          tituloOrig: 'Setor produtivo cobra segurança regulatória e leilões de transmissão para sustentar transição verde',
          idiomaOrig: 'pt',
          enfoque: 'Destaca a visão empresarial sobre investimentos privados em redes elétricas e previsibilidade jurídica.',
          url: 'https://estadao.com.br/',
          destaque: true
        },
        {
          veiculo: 'The Guardian',
          pais: 'GB',
          nomePais: 'Reino Unido',
          regiao: 'europa',
          vies: 'E',
          perfil: 'Jornal de Referência',
          tituloPT: 'Demanda de energia para inteligência artificial tensiona metas climáticas corporativas',
          tituloOrig: 'AI power hunger risks derailing tech giants’ climate targets, experts warn',
          idiomaOrig: 'en',
          enfoque: 'Investigação crítica sobre a reativação de usinas fósseis para suprir a demanda contínua de data centers.',
          url: 'https://theguardian.com/',
          destaque: true
        },
        {
          veiculo: 'Bloomberg Green',
          pais: 'US',
          nomePais: 'Estados Unidos',
          regiao: 'eua',
          vies: 'I',
          perfil: 'Imprensa Especializada',
          tituloPT: 'Mercado de crédito de carbono e acordos de energia nuclear ganham fôlego corporativo',
          tituloOrig: 'Carbon markets and corporate nuclear energy deals gain fresh momentum',
          idiomaOrig: 'en',
          enfoque: 'Análise de mercado dos contratos de compra direta de energia de longo prazo por big techs.',
          url: 'https://bloomberg.com/green',
          destaque: true
        },
        {
          veiculo: 'El País América',
          pais: 'ES',
          nomePais: 'Espanha / Américas',
          regiao: 'europa',
          vies: 'E',
          perfil: 'Jornal Internacional',
          tituloPT: 'América Latina busca voz unificada sobre financiamento climático pré-COP30 no Pará',
          tituloOrig: 'América Latina busca voz unificada sobre financiamiento climático hacia la COP30',
          idiomaOrig: 'es',
          enfoque: 'Discute a mobilização dos países amazônicos para cobrar fundos de preservação prometidos pelas nações ricas.',
          url: 'https://elpais.com/america/',
          destaque: true
        }
      ],
      guiasRelacionados: ['o-que-e-a-cop30']
    }
  };

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function matchKeyword(textoNorm, kwNorm) {
    if (kwNorm.length <= 3) {
      return (' ' + textoNorm + ' ').replace(/[^a-z0-9]+/g, ' ').indexOf(' ' + kwNorm + ' ') > -1;
    }
    return textoNorm.indexOf(kwNorm) > -1;
  }

  function encontrarAssuntosPorTexto(texto, codigoPais, tipoNoticia) {
    var t = norm(texto);
    var cCode = (codigoPais || '').toUpperCase();
    var lista = [];

    var mencaoBrasil = matchKeyword(t, 'brasil') || matchKeyword(t, 'brasileira') || matchKeyword(t, 'brasileiro') ||
      matchKeyword(t, 'lula') || matchKeyword(t, 'bolsonaro') || matchKeyword(t, 'stf') ||
      matchKeyword(t, 'selic') || matchKeyword(t, 'ipca') || matchKeyword(t, 'copom') ||
      t.indexOf('arcabouco fiscal') > -1;

    var mencaoEUA = t.indexOf('estados unidos') > -1 || matchKeyword(t, 'eua') || matchKeyword(t, 'americano') ||
      matchKeyword(t, 'americana') || matchKeyword(t, 'trump') || matchKeyword(t, 'biden') ||
      t.indexOf('casa branca') > -1;

    var mencaoUcraniaRussia = matchKeyword(t, 'ucrania') || matchKeyword(t, 'ucraniana') || matchKeyword(t, 'ucraniano') ||
      matchKeyword(t, 'russia') || matchKeyword(t, 'russa') || matchKeyword(t, 'russo') ||
      matchKeyword(t, 'zelensky') || matchKeyword(t, 'putin') || matchKeyword(t, 'kiev') ||
      matchKeyword(t, 'moscou') || matchKeyword(t, 'otan');

    Object.keys(ASSUNTOS).forEach(function (k) {
      var a = ASSUNTOS[k];
      if (a.id === 'economia-brasil' || a.id === 'politica-brasil') {
        if (cCode && cCode !== 'BR' && !mencaoBrasil) return;
      } else if (a.id === 'politica-eua') {
        if (cCode && cCode !== 'US' && !mencaoEUA) return;
      } else if (a.id === 'guerra-ucrania') {
        if (cCode && cCode !== 'UA' && cCode !== 'RU' && !mencaoUcraniaRussia) return;
      }

      var matchPalavra = a.palavrasChave.some(function (p) {
        return matchKeyword(t, norm(p));
      });
      if (matchPalavra) {
        lista.push(a);
      }
    });

    if (!lista.length) {
      if (cCode === 'BR' && tipoNoticia === 'economia') lista.push(ASSUNTOS['economia-brasil']);
      else if (cCode === 'BR' && tipoNoticia === 'politica') lista.push(ASSUNTOS['politica-brasil']);
      else if (cCode === 'US' && tipoNoticia === 'politica') lista.push(ASSUNTOS['politica-eua']);
      else if ((cCode === 'UA' || cCode === 'RU') && (tipoNoticia === 'mundo' || tipoNoticia === 'politica')) lista.push(ASSUNTOS['guerra-ucrania']);
      else if (tipoNoticia === 'tecnologia') lista.push(ASSUNTOS['tecnologia']);
    }
    return lista;
  }

  function encontrarLinhaDoTempoPorTermo(termo, codigoPais, tipoNoticia) {
    var cCode = (codigoPais || '').toUpperCase();
    var assuntos = encontrarAssuntosPorTexto(termo, cCode, tipoNoticia);
    for (var i = 0; i < assuntos.length; i++) {
      var tlId = assuntos[i].linhaDoTempoId;
      if (tlId && LINHAS_DO_TEMPO[tlId]) {
        var t = norm(termo);
        if ((tlId === 'economia-brasil' || tlId === 'politica-brasil') && cCode && cCode !== 'BR') {
          var mencaoBrasil = t.indexOf('brasil') > -1 || t.indexOf('brasileir') > -1 || t.indexOf('lula') > -1 || t.indexOf('bolsonaro') > -1;
          if (!mencaoBrasil) continue;
        }
        if (tlId === 'politica-eua' && cCode && cCode !== 'US') {
          var mencaoEUA = t.indexOf('estados unidos') > -1 || t.indexOf('eua') > -1 || t.indexOf('trump') > -1 || t.indexOf('biden') > -1;
          if (!mencaoEUA) continue;
        }
        if (tlId === 'guerra-ucrania' && cCode && cCode !== 'UA' && cCode !== 'RU') {
          var mencaoUcrania = t.indexOf('ucrania') > -1 || t.indexOf('russia') > -1 || t.indexOf('zelensky') > -1 || t.indexOf('putin') > -1;
          if (!mencaoUcrania) continue;
        }
        return LINHAS_DO_TEMPO[tlId];
      }
    }
    return null;
  }

  function encontrarExplicacoesPorTermo(termo, codigoPais, tipoNoticia) {
    var t = norm(termo);
    if (!t || t.length < 3) return [];
    var cCode = (codigoPais || '').toUpperCase();
    var mencaoBrasil = t.indexOf('brasil') > -1 || t.indexOf('brasileir') > -1 || t.indexOf('lula') > -1 || t.indexOf('bolsonaro') > -1 || t.indexOf('stf') > -1 || t.indexOf('selic') > -1 || t.indexOf('ipca') > -1;
    var mencaoEUA = t.indexOf('estados unidos') > -1 || t.indexOf('eua') > -1 || t.indexOf('americano') > -1 || t.indexOf('trump') > -1 || t.indexOf('biden') > -1;

    var res = EXPLICACOES.filter(function (exp) {
      var expPais = (exp.pais || exp.paisContexto || '').toUpperCase();
      if (expPais === 'BR' && cCode && cCode !== 'BR' && !mencaoBrasil) return false;
      if (expPais === 'US' && cCode && cCode !== 'US' && !mencaoEUA) return false;

      var primeiraPalavra = norm(exp.termoBusca.split(' ')[0]);
      return norm(exp.titulo + ' ' + exp.resumo + ' ' + exp.termoBusca).indexOf(t) > -1 ||
        (primeiraPalavra.length >= 4 && t.indexOf(primeiraPalavra) > -1);
    });
    return res.slice(0, 3);
  }

  function encontrarHubsPorTermo(termo, codigoPais, tipoNoticia) {
    var assuntos = encontrarAssuntosPorTexto(termo, codigoPais, tipoNoticia);
    var hubs = [];
    assuntos.forEach(function (a) {
      var h = PAGINAS_TEMATICAS[a.paginaTematica];
      if (h && hubs.indexOf(h) === -1) hubs.push(h);
    });
    return hubs;
  }

  // Normaliza propriedades e cria mapa de explicações por slug
  var EXPLICACOES_MAP = {};
  EXPLICACOES.forEach(function (ex) {
    ex.resumoSimples = ex.resumoSimples || ex.resumo;
    ex.textoExplicativo = ex.textoExplicativo || ex.paragrafos || [];
    ex.pais = ex.pais || ex.paisContexto || 'BR';
    ex.continente = ex.continente || ex.continenteContexto || 'sul';
    ex.tipoNoticia = ex.tipoNoticia || ex.topicoContexto || 'politica';
    ex.paginasTematicas = ex.paginasTematicas || ex.hubsRelacionados || [];
    EXPLICACOES_MAP[ex.slug] = ex;
  });

  Object.keys(LINHAS_DO_TEMPO).forEach(function (k) {
    var tl = LINHAS_DO_TEMPO[k];
    (tl.eventos || []).forEach(function (ev) {
      ev.urlMateria = ev.urlMateria || ev.url;
      ev.tituloMateria = ev.tituloMateria || ('Ler matéria em ' + ev.fonte);
    });
  });

  Object.keys(PAGINAS_TEMATICAS).forEach(function (k) {
    var hb = PAGINAS_TEMATICAS[k];
    hb.seoTitle = hb.seoTitle || hb.metaTitle || (hb.titulo + ' | Rodando o Mundo');
    hb.seoDescription = hb.seoDescription || hb.metaDescription || hb.subtitulo;
    hb.termoBuscaPadrao = hb.termoBuscaPadrao || hb.termoBusca || hb.titulo;
    hb.ultimasNoticias = hb.ultimasNoticias || hb.noticiasDestaque || [];
    if (typeof hb.resumoEditorial === 'string') {
      hb.resumoEditorialTexto = hb.resumoEditorial;
      hb.resumoEditorial = [hb.resumoEditorial];
    }
    (hb.perguntasFrequentes || []).forEach(function (fq) {
      fq.p = fq.p || fq.pergunta;
      fq.r = fq.r || fq.resposta;
    });
  });

  RESUMO_DO_DIA.forEach(function (r) {
    r.resumoCurto = r.resumoCurto || r.resumo;
    r.urlMateriaOriginal = r.urlMateriaOriginal || r.url;
    r.labelPaginaTematica = r.labelPaginaTematica || r.labelTematica;
    r.explicacaoRelacionada = r.explicacaoRelacionada || r.explicacaoId;
  });

  // Req 6: Vincular cada matéria ou resultado de busca a país, continente, tipo de notícia, assuntos, página temática e explicação
  function vincularMateria(artigo, contexto) {
    contexto = contexto || {};
    var codigoPais = (contexto.pais || contexto.country || artigo.codigoPais || 'BR').toUpperCase();
    var continente = contexto.continente || contexto.cont || artigo.continente || 'sul';
    var tipoNoticia = contexto.tipoNoticia || contexto.topic || artigo.tipoNoticia || 'politica';
    var textoAlvo = (artigo.titulo || '') + ' ' + (artigo.resumo || '') + ' ' + (contexto.termoBusca || contexto.q || '');
    var assuntos = encontrarAssuntosPorTexto(textoAlvo, codigoPais, tipoNoticia);
    var principal = assuntos.length ? assuntos[0] : null;
    var vinculosObj = {
      pais: codigoPais,
      continente: continente,
      tipoNoticia: tipoNoticia,
      assuntos: assuntos.map(function (a) { return a.id; }),
      paginaTematica: principal ? principal.paginaTematica : null,
      explicacaoRelacionada: principal ? principal.explicacaoId : null
    };
    return {
      titulo: artigo.titulo,
      resumo: artigo.resumo || '',
      imagem: artigo.imagem || '',
      url: artigo.url,
      veiculo: artigo.veiculo || artigo.fonte || '',
      publicadoEm: artigo.publicadoEm || artigo.data || '',
      pais: codigoPais,
      continente: continente,
      tipoNoticia: tipoNoticia,
      assuntos: vinculosObj.assuntos,
      paginaTematica: vinculosObj.paginaTematica,
      explicacaoRelacionada: vinculosObj.explicacaoRelacionada,
      vinculos: vinculosObj
    };
  }

  window.ROM_INITIAL_HEADLINES = {"cartacapital.com.br|politica":[{"titulo":"Pesquisa mostra Kicillof à frente de Milei em projeção de 2º turno na Argentina","url":"https://news.google.com/rss/articles/CBMixAFBVV95cUxPRDIwdGRURFVGNXZ6ay15QU1CNjRoVzJBdUNrNHVtRDFHS0Fxa2JQOGtuZjJiWkxXY2V1enRfNEZTY3FnVzVDQkVsVUtEUXhIdE5TakdCQmtGZmV3Y0VHODFIMFVqdkRnbHpIMWdrWThwalVqRkJjb2NpSkJfMWlOTjFmQ3gxb1JjUzVVcWZHVnBzbkF4dHo0bFI2UXpNRzRZZWFreEd3VlhCc29GVEhuc01JNy1FOVdQQ19ncU9KSThPM3ln?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Vereador diz que metade dos advogados estuda para roubar pobres e é afastado","url":"https://news.google.com/rss/articles/CBMiugFBVV95cUxNMVdHR2VhMkMxYy1HWkp3amp4X2tBc0tQd3VIQlNTd2ZwN3MzNndBendhelZlRHNMUGttcVZQUFVudU9KUnBfNk9pTi1MOVVmUDBnQ1pHOEZVbkpnaGJIMXBrbUl2OVVMczJ1aGxDd2JaME9PSHhaa053UTNyaEhLRU9tcUd0aklGOW9KLXg3a2NLbXdsLUFkU2R6VzlNWkRJS2ZiUEE5WjBaSUV2M0F2Qmw1VDAzRWR4c1E?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Voto distrital misto pode ser analisado pela Câmara ainda em novembro","url":"https://news.google.com/rss/articles/CBMiqgFBVV95cUxQR0drVnRvSmZIaVBKVm9KRzhHZEJnMTJ0bDFic1lXb0NJby02c0hEVXR4RWN5NmwwN2gtTWwwUm1NaUJVb09ldHBHc3l5UDlSQm1JSk5xLWRiVVVoY0lmVGNhMENkTDkzWF9DXzAzTXlKcGVjWHNPOUVDWkYyb3o1ZGpENXZKWjB0YjVQemJIOUhBcVNDdmxwS2pMbG5nQndDeGhOaDI3TzZDQQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"O que se sabe sobre as ameaças recebidas pela deputada Ana Elisa","url":"https://news.google.com/rss/articles/CBMiqgFBVV95cUxORGZGWGoxWlJyOUhLakl1NHhrS05vQWlnd25OTEl3UEN5VENRSVNHYi1lVXVacUs4ODZxNUIyWnRudEc0eEVRX2gwVmREa2dlZUt6RlhYMDhlSFRTUk4tM3UxdGNHNDVqUVBtYWFOYV94UGlDSGV1cHlIdnpwZGh0S2JHd3dWZ0ZhQWJDNzNtLURjd25lMUg4ZTlaU0ctaUNPd2dRVjZ3VFdZdw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"‘Império em Transe’: André Singer e Reginaldo Nasser debatem implicações de eleições no Brasil, nos EUA e em Israel","url":"https://news.google.com/rss/articles/CBMi4gFBVV95cUxOdTloQmUzYk9VZklISnEtdHNfMl9iWlY1U0k3ZS02cGdVd2w2UWhBS0ZVdUY1YkdYZXFjVnFpc2MtVk9GdEhHa252UVh0LU9PdE9SclRCVWtFcm1TU0NHb09CNmxxb0ZiSjljdm5MeVZ0MlhMcXZjWXRuQk1zc2R1aFdNMlNoLUFhS1lyX0dtei10UXdDRWs5Yjd4TXlaT3NCcjBKc0RFZmIyUWFOemVPdGtIcGdTdFh6d3RWZ3dGMllVVkxCN21TQXhGUXhySk9QeVU5SFlOdmk1MVZXTXBtNllB?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Governo Lula diz a Fachin que voltou a cobrar EUA por silêncio sobre Paulo Figueiredo","url":"https://news.google.com/rss/articles/CBMixgFBVV95cUxQQnp0MG5paDJFQTkxN3lCVE1zcXRhcHRIZUo0S1lfU21POGVEQml5R0xjS3R5OXN3NTd5WTMyVGdvZE4tbTVTMWQwMTh0OEZndENzZlZkdFl5QVl6OG5PVFVRWW1rc0xzeWZyQ3dqblNCeXlFdmZZQnN2LXloQzRSSG1hcGxjT1p1cjRWSHhfVVF5LTZqODBFdVplZXZ1eTlVUm0yNzNQaDYtZHZ6bjhTbXdwVC1TdTFsREZZaHJKaEhxLUxhaWc?oc=5","imagem":"","topicKey":"politica"}],"cartacapital.com.br|all":[{"titulo":"Pesquisa mostra Kicillof à frente de Milei em projeção de 2º turno na Argentina","url":"https://news.google.com/rss/articles/CBMixAFBVV95cUxPRDIwdGRURFVGNXZ6ay15QU1CNjRoVzJBdUNrNHVtRDFHS0Fxa2JQOGtuZjJiWkxXY2V1enRfNEZTY3FnVzVDQkVsVUtEUXhIdE5TakdCQmtGZmV3Y0VHODFIMFVqdkRnbHpIMWdrWThwalVqRkJjb2NpSkJfMWlOTjFmQ3gxb1JjUzVVcWZHVnBzbkF4dHo0bFI2UXpNRzRZZWFreEd3VlhCc29GVEhuc01JNy1FOVdQQ19ncU9KSThPM3ln?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Vereador diz que metade dos advogados estuda para roubar pobres e é afastado","url":"https://news.google.com/rss/articles/CBMiugFBVV95cUxNMVdHR2VhMkMxYy1HWkp3amp4X2tBc0tQd3VIQlNTd2ZwN3MzNndBendhelZlRHNMUGttcVZQUFVudU9KUnBfNk9pTi1MOVVmUDBnQ1pHOEZVbkpnaGJIMXBrbUl2OVVMczJ1aGxDd2JaME9PSHhaa053UTNyaEhLRU9tcUd0aklGOW9KLXg3a2NLbXdsLUFkU2R6VzlNWkRJS2ZiUEE5WjBaSUV2M0F2Qmw1VDAzRWR4c1E?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Voto distrital misto pode ser analisado pela Câmara ainda em novembro","url":"https://news.google.com/rss/articles/CBMiqgFBVV95cUxQR0drVnRvSmZIaVBKVm9KRzhHZEJnMTJ0bDFic1lXb0NJby02c0hEVXR4RWN5NmwwN2gtTWwwUm1NaUJVb09ldHBHc3l5UDlSQm1JSk5xLWRiVVVoY0lmVGNhMENkTDkzWF9DXzAzTXlKcGVjWHNPOUVDWkYyb3o1ZGpENXZKWjB0YjVQemJIOUhBcVNDdmxwS2pMbG5nQndDeGhOaDI3TzZDQQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"O que se sabe sobre as ameaças recebidas pela deputada Ana Elisa","url":"https://news.google.com/rss/articles/CBMiqgFBVV95cUxORGZGWGoxWlJyOUhLakl1NHhrS05vQWlnd25OTEl3UEN5VENRSVNHYi1lVXVacUs4ODZxNUIyWnRudEc0eEVRX2gwVmREa2dlZUt6RlhYMDhlSFRTUk4tM3UxdGNHNDVqUVBtYWFOYV94UGlDSGV1cHlIdnpwZGh0S2JHd3dWZ0ZhQWJDNzNtLURjd25lMUg4ZTlaU0ctaUNPd2dRVjZ3VFdZdw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"‘Império em Transe’: André Singer e Reginaldo Nasser debatem implicações de eleições no Brasil, nos EUA e em Israel","url":"https://news.google.com/rss/articles/CBMi4gFBVV95cUxOdTloQmUzYk9VZklISnEtdHNfMl9iWlY1U0k3ZS02cGdVd2w2UWhBS0ZVdUY1YkdYZXFjVnFpc2MtVk9GdEhHa252UVh0LU9PdE9SclRCVWtFcm1TU0NHb09CNmxxb0ZiSjljdm5MeVZ0MlhMcXZjWXRuQk1zc2R1aFdNMlNoLUFhS1lyX0dtei10UXdDRWs5Yjd4TXlaT3NCcjBKc0RFZmIyUWFOemVPdGtIcGdTdFh6d3RWZ3dGMllVVkxCN21TQXhGUXhySk9QeVU5SFlOdmk1MVZXTXBtNllB?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Governo Lula diz a Fachin que voltou a cobrar EUA por silêncio sobre Paulo Figueiredo","url":"https://news.google.com/rss/articles/CBMixgFBVV95cUxQQnp0MG5paDJFQTkxN3lCVE1zcXRhcHRIZUo0S1lfU21POGVEQml5R0xjS3R5OXN3NTd5WTMyVGdvZE4tbTVTMWQwMTh0OEZndENzZlZkdFl5QVl6OG5PVFVRWW1rc0xzeWZyQ3dqblNCeXlFdmZZQnN2LXloQzRSSG1hcGxjT1p1cjRWSHhfVVF5LTZqODBFdVplZXZ1eTlVUm0yNzNQaDYtZHZ6bjhTbXdwVC1TdTFsREZZaHJKaEhxLUxhaWc?oc=5","imagem":"","topicKey":"politica"}],"brasildefato.com.br|politica":[{"titulo":"DF é o único estado do país não habilitado para receber novos recursos da Política Nacional Aldir Blanc","url":"https://news.google.com/rss/articles/CBMi4AFBVV95cUxPYmFsRWdQSFEzdXNYZEVpcWpYLV8tb19wZXc1V3BBTFg3VVBLdGRpQnAtUnh5NVBEa3NoODVpbUs5OFhONV9BMk5LXy0xdlZoT2s0eFpEaFBhaUduUnVzUGFtcDZ3VnhFdU9jSHVQOWxMcUc1Zm9vNEwtdzdfS1hiSk9RWWV2clc1eHdVUXNGS250VWRGTkluZ2NIa0tjU2hxYkl5SHRPbWlmTXlNVEtRRGVVai1VR2FRdVJpRHdRWktNTm1LQWtzdHl1eGRBTm0wYUgwVV9LX1N1eFQxVUxGMg?oc=5","imagem":"","topicKey":"politica"},{"titulo":"‘O Brasil tem sido o adulto na sala’, afirma jurista da USP sobre política internacional de Lula na COP31 e G20","url":"https://news.google.com/rss/articles/CBMi5wFBVV95cUxQbWZfdGZrNW5XcXNFWUNqN1pHNm1zaVR0Z1RTUHNZbmR6U19YeUl2SXNrSVdNbXdaaC1Id3lVazUwQ1RpX1hOX0FwcEVQdGtBMTNJQ0dMYlI1NmVTaG9mTV9qSDRmdm9HRC1QMU1US1VodWZKWkRUVVFiekRYU194RlhSRm9FSF81a3pYVklidzFBRnU4MUhSSlY3QVR0OTUtRkpmUEY4Q0JCNTlOTXFtb3NuTjBLV285ZHRzeWZ6bnFlNC1taVBSd3pFNjVSN0U5Uk9rdDFnNEVOQVh6aHJLSlZpcGFUeWc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Contra a ditadura do pensamento único","url":"https://news.google.com/rss/articles/CBMiiAFBVV95cUxPVG5OWDJjdzIwbDFlcWwxNEZWMTdjVXhvWGpvWm1XODFjQ3JjRTFOMk5VZUZaNW9QVjdveklPRjE1WS1mX21ITHpWZUNkZTdYRnJKQ0FINXJUZW51SUZRSjViNnd6V1ZnNHhSY3hRdG5KMkFicTFwMEV3X08yZ2pyQzI1aFpGa1N6?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Ato contra violência vai reunir povos indígenas do Paraná neste sábado (14), em Curitiba","url":"https://news.google.com/rss/articles/CBMi0wFBVV95cUxNYmVreHFzNnhIUTQ5MFpVYTV3YVgyNGdSbURCMi1ldFd5NnFoS0FiQ3hiN1lrS1hwb3ZUejJab1RTZExFVzZ6S2RFQ29IOVhGU3ItMnZ5eXZwY0dhNUg1eE5hc0Y3Q3YzQXoyNGR4OHd4dmZoMDRFZEhmUC1FcmtuU2JBdkV0SHBQZmJHdjdhRHhDYlp1WDFtV1BBQmxJcndYcmpDWU5hWE1vN0ZDZS1GU1FvWWdTU1VqNWh4MlZfRWpfNzJDNkxMbW1kZ25LTThOd1FZ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Rua e rede: a politização do debate econômico contra a hegemonia do parasitismo rentista","url":"https://news.google.com/rss/articles/CBMiywFBVV95cUxOZDhaSWRkVHZ4SEhJZVJUa0Fpb2NNY2w4aGpYd0VXeTYtZkQtUXBFY0ZPMDFocjhZQTd2MWNIbG04dnQwZzNWWlI5b3hGazRUSHhYNGxVUTBONG1sOXZzNW94QldLckhUcE5LUEduVk5fSTB6eVE3T01sSl9xc09zS0hSSjZUY0lrSFAwa0xGeUZXb05Kcy10QWhvMUxwSUctVlZqeUFQWXVWUGlGdVlFR0NFaDZiaHJCTV90cm1qVFIwRWdxVkN1ODhDaw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"‘Decisão de Fux é um freio de arrumação’, afirma cientista política sobre veto a ações sobre bets","url":"https://news.google.com/rss/articles/CBMi1AFBVV95cUxOVlNpV0lveFRoWlhHLW5pSXE2MEZRVm5kWmxJYnFRWGVMQkJmcWJvYW9XUGt1bkNNR3ZweTBnMm5NRDBpbDFlbXQwMFo5ZjBXVTIxZzB4T2xZZU0xM2oyQ0x4bXdYcXZBYTNTN1VmaWJQRnEwc045QjZWZ2xScnhzZTR2emZsRFRoOWNLNklWOEF2QTZFV1U2VVU1WWdUaFIyVndzN1BDbUVHT01fX2d1R0k0UDZpeEJNWVFGWWFBbWpxbnlDcTFqZ2RsVlRwcVdrWUstNQ?oc=5","imagem":"","topicKey":"politica"}],"brasildefato.com.br|all":[{"titulo":"DF é o único estado do país não habilitado para receber novos recursos da Política Nacional Aldir Blanc","url":"https://news.google.com/rss/articles/CBMi4AFBVV95cUxPYmFsRWdQSFEzdXNYZEVpcWpYLV8tb19wZXc1V3BBTFg3VVBLdGRpQnAtUnh5NVBEa3NoODVpbUs5OFhONV9BMk5LXy0xdlZoT2s0eFpEaFBhaUduUnVzUGFtcDZ3VnhFdU9jSHVQOWxMcUc1Zm9vNEwtdzdfS1hiSk9RWWV2clc1eHdVUXNGS250VWRGTkluZ2NIa0tjU2hxYkl5SHRPbWlmTXlNVEtRRGVVai1VR2FRdVJpRHdRWktNTm1LQWtzdHl1eGRBTm0wYUgwVV9LX1N1eFQxVUxGMg?oc=5","imagem":"","topicKey":"politica"},{"titulo":"‘O Brasil tem sido o adulto na sala’, afirma jurista da USP sobre política internacional de Lula na COP31 e G20","url":"https://news.google.com/rss/articles/CBMi5wFBVV95cUxQbWZfdGZrNW5XcXNFWUNqN1pHNm1zaVR0Z1RTUHNZbmR6U19YeUl2SXNrSVdNbXdaaC1Id3lVazUwQ1RpX1hOX0FwcEVQdGtBMTNJQ0dMYlI1NmVTaG9mTV9qSDRmdm9HRC1QMU1US1VodWZKWkRUVVFiekRYU194RlhSRm9FSF81a3pYVklidzFBRnU4MUhSSlY3QVR0OTUtRkpmUEY4Q0JCNTlOTXFtb3NuTjBLV285ZHRzeWZ6bnFlNC1taVBSd3pFNjVSN0U5Uk9rdDFnNEVOQVh6aHJLSlZpcGFUeWc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Contra a ditadura do pensamento único","url":"https://news.google.com/rss/articles/CBMiiAFBVV95cUxPVG5OWDJjdzIwbDFlcWwxNEZWMTdjVXhvWGpvWm1XODFjQ3JjRTFOMk5VZUZaNW9QVjdveklPRjE1WS1mX21ITHpWZUNkZTdYRnJKQ0FINXJUZW51SUZRSjViNnd6V1ZnNHhSY3hRdG5KMkFicTFwMEV3X08yZ2pyQzI1aFpGa1N6?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Ato contra violência vai reunir povos indígenas do Paraná neste sábado (14), em Curitiba","url":"https://news.google.com/rss/articles/CBMi0wFBVV95cUxNYmVreHFzNnhIUTQ5MFpVYTV3YVgyNGdSbURCMi1ldFd5NnFoS0FiQ3hiN1lrS1hwb3ZUejJab1RTZExFVzZ6S2RFQ29IOVhGU3ItMnZ5eXZwY0dhNUg1eE5hc0Y3Q3YzQXoyNGR4OHd4dmZoMDRFZEhmUC1FcmtuU2JBdkV0SHBQZmJHdjdhRHhDYlp1WDFtV1BBQmxJcndYcmpDWU5hWE1vN0ZDZS1GU1FvWWdTU1VqNWh4MlZfRWpfNzJDNkxMbW1kZ25LTThOd1FZ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Rua e rede: a politização do debate econômico contra a hegemonia do parasitismo rentista","url":"https://news.google.com/rss/articles/CBMiywFBVV95cUxOZDhaSWRkVHZ4SEhJZVJUa0Fpb2NNY2w4aGpYd0VXeTYtZkQtUXBFY0ZPMDFocjhZQTd2MWNIbG04dnQwZzNWWlI5b3hGazRUSHhYNGxVUTBONG1sOXZzNW94QldLckhUcE5LUEduVk5fSTB6eVE3T01sSl9xc09zS0hSSjZUY0lrSFAwa0xGeUZXb05Kcy10QWhvMUxwSUctVlZqeUFQWXVWUGlGdVlFR0NFaDZiaHJCTV90cm1qVFIwRWdxVkN1ODhDaw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"‘Decisão de Fux é um freio de arrumação’, afirma cientista política sobre veto a ações sobre bets","url":"https://news.google.com/rss/articles/CBMi1AFBVV95cUxOVlNpV0lveFRoWlhHLW5pSXE2MEZRVm5kWmxJYnFRWGVMQkJmcWJvYW9XUGt1bkNNR3ZweTBnMm5NRDBpbDFlbXQwMFo5ZjBXVTIxZzB4T2xZZU0xM2oyQ0x4bXdYcXZBYTNTN1VmaWJQRnEwc045QjZWZ2xScnhzZTR2emZsRFRoOWNLNklWOEF2QTZFV1U2VVU1WWdUaFIyVndzN1BDbUVHT01fX2d1R0k0UDZpeEJNWVFGWWFBbWpxbnlDcTFqZ2RsVlRwcVdrWUstNQ?oc=5","imagem":"","topicKey":"politica"}],"revistaforum.com.br|politica":[{"titulo":"Tríplex do Guarujá nunca pertenceu a Lula, confirma Justiça em decisão que derruba versão da Lava Jato","url":"https://news.google.com/rss/articles/CBMiggFBVV95cUxPTlpDVkdNWEVQZjVZaGJoNzlnSW9CUk4zbmlOUnJRSTlRZnJ4ZDFmYUhWSF9Vc2xpbEZ4WTVLazhwVnU2SUhzemdiekw1d1dNTnVXTkRvQ2t2MXRYQ09IQUZIblFqMWFHZkZkQ0dQVTY2bGptRXpaS0JRZlpMSFMyUklB?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Deputado aciona Moraes contra amigo de Flávio Bolsonaro por ilha de R$ 17 milhões","url":"https://news.google.com/rss/articles/CBMigwFBVV95cUxQOWg0QnVhektYSjRsRkRWQjY1MUl3VlNVdTg2SjdTbVp6dHZCVDNfYm5qbV9rVHpGMVRHSi1EMEh6bk5tLVBkdFhKZFdIOEFMcjRIMjQ2ZC1pd0Z0R3VLNkdWdnd6VkdZbm1PbG9ERjhocmRQV1UweXQwV0V0WnJhODZQcw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"A nova pressão que Alcolumbre e Motta põem em Lula logo após sua reeleição","url":"https://news.google.com/rss/articles/CBMidkFVX3lxTE83Q1B0OWplNGQ0VEMwTmdpTnhESFF3QW9ZS0RMcEZFd2hMNzFPTll4bzhiYURtRDc0TVgyU05YcndzUk1LcER4a3hjbG52dl8yQWRoRTdDX0NwdFB0ZHB3QUdISGRJNDJKcFNCNGQwdlNVdW9aTGc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Willer Tomaz: PF prende ex","url":"https://news.google.com/rss/articles/CBMijwFBVV95cUxPN2RJV2xBbml4aVJ4d1pZQS1femgwS0x1V0RQQUNNS3dtUWFDUGRleVdmVVJDam02VDctb3BfNDR2V3JKSkx1VEQ2VzhDcUx3VkFVMmVXYV9ubTk5M2FYMXAzZ3BRTGYtbTUzNXRtdHJyOERFWEItUTNpaGh1OGxQd3dNUHdtaXpzTDNYb3pmMA?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Governo aumenta pressão sobre big techs e Câmara retoma projeto rejeitado pela Apple","url":"https://news.google.com/rss/articles/CBMieEFVX3lxTE5BY2JNWkR2bnRQTzlqaXdOcnRlbnZ1WkpEbkszQVZKSGhiOU9DZ3Awb2dmZkhIMEJzUlNsODRDVm82YWdyQnJ1TDRKaF9ldy0tRUFPb3NwQUtHV3IyTEFfTlNMX3lkcTdtX2N1bzFubmxYQzJHUmJrSg?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Fachin rejeita pedido de Gonet e decide revelar arquivos do Inquérito das Fake News","url":"https://news.google.com/rss/articles/CBMibEFVX3lxTE85Y05KU1MxanY3WTRJWGY2M0VBYUVER2Z1RklxRDJ1czllX3hpZzNaSm9sNGZFdFN4MElnU1V5OGtuUHdyb2pfYS1tNjh5dXVpV3F5TC1LdmY2MXJsZWlreGpRQmF2MGNaUTBhTA?oc=5","imagem":"","topicKey":"politica"}],"revistaforum.com.br|all":[{"titulo":"Tríplex do Guarujá nunca pertenceu a Lula, confirma Justiça em decisão que derruba versão da Lava Jato","url":"https://news.google.com/rss/articles/CBMiggFBVV95cUxPTlpDVkdNWEVQZjVZaGJoNzlnSW9CUk4zbmlOUnJRSTlRZnJ4ZDFmYUhWSF9Vc2xpbEZ4WTVLazhwVnU2SUhzemdiekw1d1dNTnVXTkRvQ2t2MXRYQ09IQUZIblFqMWFHZkZkQ0dQVTY2bGptRXpaS0JRZlpMSFMyUklB?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Deputado aciona Moraes contra amigo de Flávio Bolsonaro por ilha de R$ 17 milhões","url":"https://news.google.com/rss/articles/CBMigwFBVV95cUxQOWg0QnVhektYSjRsRkRWQjY1MUl3VlNVdTg2SjdTbVp6dHZCVDNfYm5qbV9rVHpGMVRHSi1EMEh6bk5tLVBkdFhKZFdIOEFMcjRIMjQ2ZC1pd0Z0R3VLNkdWdnd6VkdZbm1PbG9ERjhocmRQV1UweXQwV0V0WnJhODZQcw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"A nova pressão que Alcolumbre e Motta põem em Lula logo após sua reeleição","url":"https://news.google.com/rss/articles/CBMidkFVX3lxTE83Q1B0OWplNGQ0VEMwTmdpTnhESFF3QW9ZS0RMcEZFd2hMNzFPTll4bzhiYURtRDc0TVgyU05YcndzUk1LcER4a3hjbG52dl8yQWRoRTdDX0NwdFB0ZHB3QUdISGRJNDJKcFNCNGQwdlNVdW9aTGc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Willer Tomaz: PF prende ex","url":"https://news.google.com/rss/articles/CBMijwFBVV95cUxPN2RJV2xBbml4aVJ4d1pZQS1femgwS0x1V0RQQUNNS3dtUWFDUGRleVdmVVJDam02VDctb3BfNDR2V3JKSkx1VEQ2VzhDcUx3VkFVMmVXYV9ubTk5M2FYMXAzZ3BRTGYtbTUzNXRtdHJyOERFWEItUTNpaGh1OGxQd3dNUHdtaXpzTDNYb3pmMA?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Governo aumenta pressão sobre big techs e Câmara retoma projeto rejeitado pela Apple","url":"https://news.google.com/rss/articles/CBMieEFVX3lxTE5BY2JNWkR2bnRQTzlqaXdOcnRlbnZ1WkpEbkszQVZKSGhiOU9DZ3Awb2dmZkhIMEJzUlNsODRDVm82YWdyQnJ1TDRKaF9ldy0tRUFPb3NwQUtHV3IyTEFfTlNMX3lkcTdtX2N1bzFubmxYQzJHUmJrSg?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Fachin rejeita pedido de Gonet e decide revelar arquivos do Inquérito das Fake News","url":"https://news.google.com/rss/articles/CBMibEFVX3lxTE85Y05KU1MxanY3WTRJWGY2M0VBYUVER2Z1RklxRDJ1czllX3hpZzNaSm9sNGZFdFN4MElnU1V5OGtuUHdyb2pfYS1tNjh5dXVpV3F5TC1LdmY2MXJsZWlreGpRQmF2MGNaUTBhTA?oc=5","imagem":"","topicKey":"politica"}],"intercept.com.br|politica":[{"titulo":"Derrota eleitoral de Trump no Congresso enfraquece plano dos Bolsonaro nos EUA","url":"https://news.google.com/rss/articles/CBMijgFBVV95cUxQWjRTOVRuNW1wM24xRmc1UWw0RDVvTW0xQ2J2M3V2dUdWeDNfS1dmbWNIQmxGWGdBVEVvcU9LUDdEUno3SFV3WldjYXZpUFEzX0RPQWNWckM4aEdvMkhXT1M2amdrdHpXTlpzbVRrVXpfUXNLd2lSUTRyN3VFLUE0Tjk2YXBRNmFhOV95UVBB?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Crise do Ueno Bank no Paraguai desmonta farsa do paraíso liberal bolsonarista","url":"https://news.google.com/rss/articles/CBMijgFBVV95cUxNRkNyYjV5ZzRtcWRXajRXRXRoUTl0ekd5TmFlR0xmMDJiZnYtbWQ2MzF2ajlfU3ZzajMybmItY1BUbHFsdGFkR3ZOYVdlOEpGeUN0RGJ5UEVSZ0NucnBiS1c0el9sajVqZ3hYcTFfSVY2V1hRSWJpX0h0blVqeXpTNExHb2xDMGYzeUNUSEhn?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Fuga de Flávio Bolsonaro repete roteiro de generais golpistas","url":"https://news.google.com/rss/articles/CBMinAFBVV95cUxNbkhwQms4aGxqTlBEZFRsWmI4M3NwR21Ndm1PYlBMQTlzWHdmX25ueFhlYnRmV3FReGxSVXlnNW0xVWloOVgtSmx1ekJpbmtiazdvTGtPVkFqLUs0d0d1akxHUGR4SVdaUzQxMzNGRks1VTFjX0FBSWJDclpSVG5ZY2FRM0QxMHZYY2xiZzd2V2d6LURBeG8tWGUwdmY?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Eleitores dos EUA mostraram que não querem mais data centers","url":"https://news.google.com/rss/articles/CBMihAFBVV95cUxNcERfTlNuZUhKaXJnQmh2NnlVcWVTdHB1T1VGdDlHS1c2TXMzb3gwczZVZFJ4WjMtQU1UUjd2b1dCR1Y0MUVjVERtZ0R4b1V5N3gxS2RvZ3VHMVR1bW1SUVBFWnZvaXRQbFpkcS13YnRla0Q2VnptR1R5OWVtYzdIelBNdXo?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Mineradora financiada por Trump quer explorar terras raras na região do paraíso natural de Abrolhos","url":"https://news.google.com/rss/articles/CBMihgFBVV95cUxOZUNwb0gyMDJGUVdEQmRlSjliVEVSaDYzNmh0TFp6cjJ6a2dnZUJ5YnBhOXp2TVR4WE9vMUk2ckY1M3pJbjdGRjVBYUhMTWlVWERoSFptWkxXU1BsMzlENEhTTGZBR0xaaFN0aUUxekZQeEVfZmFTb19BS1V5LXJQNEtMTmhjQQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Política de privacidade e proteção de dados pessoais","url":"https://news.google.com/rss/articles/CBMiY0FVX3lxTFBjamhGbV9ZZWF1ckJHT01KamlsVUNOWkt6WHltSldNX243OVJZdDNlUE1fV2gyNmljam1hWVQ3VThDdV9IYWJmbEVXZW5XUlFscERvLU1EQ08tc0ljSVVpNUJXWQ?oc=5","imagem":"","topicKey":"politica"}],"intercept.com.br|all":[{"titulo":"Derrota eleitoral de Trump no Congresso enfraquece plano dos Bolsonaro nos EUA","url":"https://news.google.com/rss/articles/CBMijgFBVV95cUxQWjRTOVRuNW1wM24xRmc1UWw0RDVvTW0xQ2J2M3V2dUdWeDNfS1dmbWNIQmxGWGdBVEVvcU9LUDdEUno3SFV3WldjYXZpUFEzX0RPQWNWckM4aEdvMkhXT1M2amdrdHpXTlpzbVRrVXpfUXNLd2lSUTRyN3VFLUE0Tjk2YXBRNmFhOV95UVBB?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Crise do Ueno Bank no Paraguai desmonta farsa do paraíso liberal bolsonarista","url":"https://news.google.com/rss/articles/CBMijgFBVV95cUxNRkNyYjV5ZzRtcWRXajRXRXRoUTl0ekd5TmFlR0xmMDJiZnYtbWQ2MzF2ajlfU3ZzajMybmItY1BUbHFsdGFkR3ZOYVdlOEpGeUN0RGJ5UEVSZ0NucnBiS1c0el9sajVqZ3hYcTFfSVY2V1hRSWJpX0h0blVqeXpTNExHb2xDMGYzeUNUSEhn?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Fuga de Flávio Bolsonaro repete roteiro de generais golpistas","url":"https://news.google.com/rss/articles/CBMinAFBVV95cUxNbkhwQms4aGxqTlBEZFRsWmI4M3NwR21Ndm1PYlBMQTlzWHdmX25ueFhlYnRmV3FReGxSVXlnNW0xVWloOVgtSmx1ekJpbmtiazdvTGtPVkFqLUs0d0d1akxHUGR4SVdaUzQxMzNGRks1VTFjX0FBSWJDclpSVG5ZY2FRM0QxMHZYY2xiZzd2V2d6LURBeG8tWGUwdmY?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Eleitores dos EUA mostraram que não querem mais data centers","url":"https://news.google.com/rss/articles/CBMihAFBVV95cUxNcERfTlNuZUhKaXJnQmh2NnlVcWVTdHB1T1VGdDlHS1c2TXMzb3gwczZVZFJ4WjMtQU1UUjd2b1dCR1Y0MUVjVERtZ0R4b1V5N3gxS2RvZ3VHMVR1bW1SUVBFWnZvaXRQbFpkcS13YnRla0Q2VnptR1R5OWVtYzdIelBNdXo?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Mineradora financiada por Trump quer explorar terras raras na região do paraíso natural de Abrolhos","url":"https://news.google.com/rss/articles/CBMihgFBVV95cUxOZUNwb0gyMDJGUVdEQmRlSjliVEVSaDYzNmh0TFp6cjJ6a2dnZUJ5YnBhOXp2TVR4WE9vMUk2ckY1M3pJbjdGRjVBYUhMTWlVWERoSFptWkxXU1BsMzlENEhTTGZBR0xaaFN0aUUxekZQeEVfZmFTb19BS1V5LXJQNEtMTmhjQQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Política de privacidade e proteção de dados pessoais","url":"https://news.google.com/rss/articles/CBMiY0FVX3lxTFBjamhGbV9ZZWF1ckJHT01KamlsVUNOWkt6WHltSldNX243OVJZdDNlUE1fV2gyNmljam1hWVQ3VThDdV9IYWJmbEVXZW5XUlFscERvLU1EQ08tc0ljSVVpNUJXWQ?oc=5","imagem":"","topicKey":"politica"}],"folha.uol.com.br|politica":[{"titulo":"Afastamento de delegados da PF tem contornos de extrema gravidade, diz Transparência Internacional","url":"https://news.google.com/rss/articles/CBMi4AFBVV95cUxNZUNIZjVTQm53cEFXUURiNThNamJDQnZCSm9IMVlpenhRLUkwTnZHbG5nQUs0Z3JkbXVYWTRDVnNDZ0U0THpuQWQzLWh2eWhXZ0hHaVV3N0V4bmhrejdvaE1kb1N5aTBGMzdxMEZIQVpKZFFOWFl6T0xheVNvNXlHVnJYWm8zMENqc1FFVGpZQkx3QzhUZGgzTG9zeUY4ekhCcXVLeFhRaE1CdW1UVmpyQUp1eTh3ZjdJTTdjN2lrWUhnckdEdUpJZ0lvUnFMdkJrZUtuSVFSOHR4WUdSbTY3Zg?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Ministério notifica Uber por relatos de motoristas que recusam passageiros por posição política","url":"https://news.google.com/rss/articles/CBMi4AFBVV95cUxPcmd3X1VRTU53M1Rpb3owbEd6dmpmNU4zTnZjZ0dfdC14ZEhjOTQ5Y0xiUi1TMGNoa0JVQ3Z4ZGcyaHoweFpHNC1iQm5SMzVndW03TnhmX2tfT1JMTU1ZeGs3VzNub3lZc1lMcGdEblk0S2RscnhuNUpZZFpfZTFhZzJnSzFncVNsX21vaHlhU3dVSVFCM3FXTDVUZnRXWnN4NEZvdVgwUFNVU0syYTJ3amVyZkpHTlFVcFN0a0ZwRVlXRElmcGFuQm9SOVgza1hMb2pfVUE1YW55bVZFT2ZQZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Diretor da PF pede desfiliação de associação após afastamento de delegados, e entidade diz haver retaliação","url":"https://news.google.com/rss/articles/CBMi2wFBVV95cUxONmhUOEJjVE5LZGtrbXdCRkI1QUptb3lJN2Mta3RsTlZJMVl3QXFja3BHS2YzMDhoXzU4ZVB4Vk14UXNkSjZYQjUwbkNfdXdKelhvZmhpb181bElXTWpjUWJYMS1pcWVFN1lOS0Jielc5Z09mYjBnaW03NldtNWlPQ2huSVBhSFVJNjMwY0M4ZFp0dXNHc2NNVFRZY0EyTUQ0elJUN2VBVV80MTVfNXBHNTdOMi0tRFVCY3ZEMmZMYzVPcnlheVE1bzYtVkU3eFBXTVFVcjRUVUpIUGs?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Partidos relatam a Hugo Motta falta de apoio e enterram proposta de voto distrital misto","url":"https://news.google.com/rss/articles/CBMi1AFBVV95cUxQeGY0ZkpubGtuTzRFakpwR0hyV1BLbkFZRzlJUlB4V01LS0dkQTRZcHlBaFNXTmowdkE4S2ZXOFBJSEd1aU5ZLU1ibXZiZW12T3RIYnVyekpHQTh6UnpHZkhEU08xZFYyWU8xWV9NNjV6TmswSWRFYVJVTENOZm14cGtrdWJLYmZiSmhKRTI0b2tFM0JDLWF6aHNfUXNzXzJaQmlVOFlhOF9rUldGWXhCeGNWRkVfa2VseDBkUDYwOHVTQ3p4QVdWc3dueGdxR2QwZkNmSg?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Flávio tem direito de disputar Presidência em 2030, diz Tarcísio após admitir possibilidade de concorrer","url":"https://news.google.com/rss/articles/CBMi6AFBVV95cUxQVTNPNmplRTVMVjNKY09WYVJlTTkwUVJSaWluSE1QV2JvNkZCLW5MZEpzcnItazZrcjFXNFBvMXlsZXo4d3pTSktOcTlCYmd3RmlndHp0UklpNVFZLTVhMFJ6VXJ6Z0I3cEVLaDJVMzFDUFo2enc5czZXUlZTSVRZRm8yb2h2T3NCRFRrS0ZqY3I0M2p1aERzQTdmUWdPc0N4MnM2b25IelRYSTVmVE9PbnY5RkFaT1p6T2wxUUUzaEZFNlU1Z1M0eFlrMDV4Z3VpaVhRN1BpU252bTZZZmpVd0MzazRBMVlj?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Antifeminismo cresce nas redes com discurso cristão e clubes exclusivos; conheça perfis","url":"https://news.google.com/rss/articles/CBMi0gFBVV95cUxQOHBGTkNPQk1VYlg5eVg5bnVzNFYxZFRWSTJvS214XzJnTV9hM1dLOXpkT243TjlpS2JTTTAwSWt4Q09pQ2RLdzU5cmttc2ZRcUVZZEFNS01HYS0xVXZ0V0pGcWxRTEoxSFVsWjB0Tzh0dk5LQTNtS1FneEQzMWlQd2hMVDBRMXF1QWswLS1QQ1lmckI2aV9PU0UzZURLY2Q3eE93UlVFRDg1U3QwX3B2R3NWMW40ZzJqSkRnMUpRZjhmRWVWTkxNYUJsSmFLSEpxd0E?oc=5","imagem":"","topicKey":"politica"}],"folha.uol.com.br|all":[{"titulo":"Afastamento de delegados da PF tem contornos de extrema gravidade, diz Transparência Internacional","url":"https://news.google.com/rss/articles/CBMi4AFBVV95cUxNZUNIZjVTQm53cEFXUURiNThNamJDQnZCSm9IMVlpenhRLUkwTnZHbG5nQUs0Z3JkbXVYWTRDVnNDZ0U0THpuQWQzLWh2eWhXZ0hHaVV3N0V4bmhrejdvaE1kb1N5aTBGMzdxMEZIQVpKZFFOWFl6T0xheVNvNXlHVnJYWm8zMENqc1FFVGpZQkx3QzhUZGgzTG9zeUY4ekhCcXVLeFhRaE1CdW1UVmpyQUp1eTh3ZjdJTTdjN2lrWUhnckdEdUpJZ0lvUnFMdkJrZUtuSVFSOHR4WUdSbTY3Zg?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Ministério notifica Uber por relatos de motoristas que recusam passageiros por posição política","url":"https://news.google.com/rss/articles/CBMi4AFBVV95cUxPcmd3X1VRTU53M1Rpb3owbEd6dmpmNU4zTnZjZ0dfdC14ZEhjOTQ5Y0xiUi1TMGNoa0JVQ3Z4ZGcyaHoweFpHNC1iQm5SMzVndW03TnhmX2tfT1JMTU1ZeGs3VzNub3lZc1lMcGdEblk0S2RscnhuNUpZZFpfZTFhZzJnSzFncVNsX21vaHlhU3dVSVFCM3FXTDVUZnRXWnN4NEZvdVgwUFNVU0syYTJ3amVyZkpHTlFVcFN0a0ZwRVlXRElmcGFuQm9SOVgza1hMb2pfVUE1YW55bVZFT2ZQZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Diretor da PF pede desfiliação de associação após afastamento de delegados, e entidade diz haver retaliação","url":"https://news.google.com/rss/articles/CBMi2wFBVV95cUxONmhUOEJjVE5LZGtrbXdCRkI1QUptb3lJN2Mta3RsTlZJMVl3QXFja3BHS2YzMDhoXzU4ZVB4Vk14UXNkSjZYQjUwbkNfdXdKelhvZmhpb181bElXTWpjUWJYMS1pcWVFN1lOS0Jielc5Z09mYjBnaW03NldtNWlPQ2huSVBhSFVJNjMwY0M4ZFp0dXNHc2NNVFRZY0EyTUQ0elJUN2VBVV80MTVfNXBHNTdOMi0tRFVCY3ZEMmZMYzVPcnlheVE1bzYtVkU3eFBXTVFVcjRUVUpIUGs?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Partidos relatam a Hugo Motta falta de apoio e enterram proposta de voto distrital misto","url":"https://news.google.com/rss/articles/CBMi1AFBVV95cUxQeGY0ZkpubGtuTzRFakpwR0hyV1BLbkFZRzlJUlB4V01LS0dkQTRZcHlBaFNXTmowdkE4S2ZXOFBJSEd1aU5ZLU1ibXZiZW12T3RIYnVyekpHQTh6UnpHZkhEU08xZFYyWU8xWV9NNjV6TmswSWRFYVJVTENOZm14cGtrdWJLYmZiSmhKRTI0b2tFM0JDLWF6aHNfUXNzXzJaQmlVOFlhOF9rUldGWXhCeGNWRkVfa2VseDBkUDYwOHVTQ3p4QVdWc3dueGdxR2QwZkNmSg?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Flávio tem direito de disputar Presidência em 2030, diz Tarcísio após admitir possibilidade de concorrer","url":"https://news.google.com/rss/articles/CBMi6AFBVV95cUxQVTNPNmplRTVMVjNKY09WYVJlTTkwUVJSaWluSE1QV2JvNkZCLW5MZEpzcnItazZrcjFXNFBvMXlsZXo4d3pTSktOcTlCYmd3RmlndHp0UklpNVFZLTVhMFJ6VXJ6Z0I3cEVLaDJVMzFDUFo2enc5czZXUlZTSVRZRm8yb2h2T3NCRFRrS0ZqY3I0M2p1aERzQTdmUWdPc0N4MnM2b25IelRYSTVmVE9PbnY5RkFaT1p6T2wxUUUzaEZFNlU1Z1M0eFlrMDV4Z3VpaVhRN1BpU252bTZZZmpVd0MzazRBMVlj?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Antifeminismo cresce nas redes com discurso cristão e clubes exclusivos; conheça perfis","url":"https://news.google.com/rss/articles/CBMi0gFBVV95cUxQOHBGTkNPQk1VYlg5eVg5bnVzNFYxZFRWSTJvS214XzJnTV9hM1dLOXpkT243TjlpS2JTTTAwSWt4Q09pQ2RLdzU5cmttc2ZRcUVZZEFNS01HYS0xVXZ0V0pGcWxRTEoxSFVsWjB0Tzh0dk5LQTNtS1FneEQzMWlQd2hMVDBRMXF1QWswLS1QQ1lmckI2aV9PU0UzZURLY2Q3eE93UlVFRDg1U3QwX3B2R3NWMW40ZzJqSkRnMUpRZjhmRWVWTkxNYUJsSmFLSEpxd0E?oc=5","imagem":"","topicKey":"politica"}],"oglobo.globo.com|politica":[{"titulo":"Cleitinho busca se aproximar de Lula e do PT em Minas após apoio a Flávio Bolsonaro na campanha","url":"https://news.google.com/rss/articles/CBMi6gFBVV95cUxPQnl3YzhnQjZUUGN2eXJ1X29jcVdsTGdqZTRkcmw3THV1WHUwTG5vck40X2xQVDFxYnNfRmpFaTF4Xy1CMjZJbUdmdGZWWXRkT1VJV2l2X0I0NUdyZjJseU5HcUpSQ19FMjZhNHF0XzVobzRpa1k3bW5iTi1ZcWhVb3ZLMFBnTDJYc2Q4NGN0cXJLTTc1NzhNN0NwSS16a1E2S3g3aEU1Sm5hdVpHbEtNLW5wWHdfZlA1YkZqQXZGYndrSllBWWJxVTJGZGZMT3VOa2pia25uOUVsem12Y3QyOXR1dElkQzJTTnfSAfgBQVVfeXFMTXZhMGhiSEk4aXF2eWRlWjMwS2JkOVFjSmhOek50NE40TTAzd0F1YmNCQi1Pdm9qUkdsdWp1eWxySG9YV3dXUkVoWmFmaUlGSmlLVXA3RzVOMV8zNkg1Rkl0MGU0eml1OTNmTWd4Ui05cW5RU3lrbWJockpUTG9vVk5aV2ttRV94bGVsLVpiSEFsZkhMcjZIWmJqMmZHdEQ4UDNUY0YzMXBnbFA4eXNQSGdFblh1OUpvU1RyY3oxaXF3NXN2NmhaNzdIZ2piSDdZOUtEMXJyUWNKRVp3YnZtc3FJdURUc2ladVJXeXRQVzlkNzQzeWdOeTA?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Após silêncio do PT, Freixo se posiciona a favor de segundo turno no Rio","url":"https://news.google.com/rss/articles/CBMiygFBVV95cUxQN0JydFNJUVVsbHZQX3dCQUN1X2JqMEF6Mk95REZQekp3RW03bVlpMmdJOXQzQmpzSHdNUEVnNzhiUTZSQnNEUjhOdy1tWG1XM29EUlVDQ0ZzR1lGc2g3YUJEZjZuNFV4dTdLN3FzVWtVMUNTSk5uSXlsM1NjVGRvQ0txc19SaGdpYm5YbXQ0TUtEandmQ21hdEtHc200NTVYQmQwR2liV0ZJMmduQnJpSW9yUGdIUWo2N01LVXlEU1U3clhmbHJha1Rn0gHYAUFVX3lxTE9pMXpfaEEwb1c1U2FMTnJvZVB4TTdVbXRDOXkwNUhURTJtSzJJck84Tlg2eUh4OXRIdVotVnR6MWFMWWZENHlURjRmTnpaUzVhTllkQUNRdVpvT01CbWt4Um1rQXVwRUhCUklnaWZOamFmMV9NSU5vTU9VSGFEc3ExeEFPVGhLQUhNdldMX2kyRjVpRGlwRHVBU0xuLVFkNldlVWdQV0N6cXFkS0ZQbTNab2ZJRnFUUkZSMVNuN01RamRGNGd0X3hiMFhPVkpKdjMya3dWMnI4Vg?oc=5","imagem":"","topicKey":"politica"},{"titulo":"PF abre investigação ordenada por Dino sobre suspeita de financiamento estrangeiro à campanha de Flávio Bolsonaro","url":"https://news.google.com/rss/articles/CBMiggJBVV95cUxObXl2NkUxdlJWemtZNC1TVmIxSWFhV29hcDZScHRjU1kxOEVZeHotRkU2ZmgtbzZCS2ptbmJBclBZZFQ3aUJuMVZHWUFUYWFCYWhKcEQ2aDltOUx5NmFicURuR1hJNy1zUHNPc3V2ZEhKNEc1WVFHNWtucUM3VWRlV2g5OGRQR0hIcXgwczlSMWRfMlZTYlEtWWJ6SElpa25ZTmg5c3ZIaXdSZVZfLVN3U0ZlZ19IN05LaTZwcU9QSmJjQlFsRWZhQjY3S2N4czdhdEhULXZSdWZIZERKdXQwMVNJbTVraFUzeE5YUGVLbmxyVmVCcExWUC1RNTFRVEwteEE?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Zanin recebe advogados de Paes para discutir segundo turno no Rio","url":"https://news.google.com/rss/articles/CBMiwgFBVV95cUxPeC04VWdrNE1aNU01TTVBRjhNWi1TX1NFVERSTnhSTVZwMjdIYUtfRE1mcFQ0TUplZ201a2otMGVLYzJKeURzdjllSHFSZkpySEtMaWF0QnZrOUVjN28tMnVrXzAxaHNKYkFGOHMwZDhhZ3lieXhOYUVXT2czVnFGRzJRc0dMNE55a0ZFZmtOWmY3UUhHR2FwR1ZVdFlVZHB0NGpSWU9NZjZWV1dfTzhGWTFhbWQ4VEZQSENLN0xmbE5XQdIB0AFBVV95cUxOT3VablVGZTR6czE4T0NhQTI1UzVjOHBrWldHR2ZmT2NSM2VTTk1ZbXppVXVBTzJmTHZjRHRmZjF3Wkd4UU1PRjJzQnZlTnJIcUZLQ3d6NzB4NFptSjFXLXVxSWxxQVk0dFVkS1gxZVZhZGFsS0dqemhrZ0RsSUoxeTV2WWdnNkdMYVhLNm9JNUZGYWJ1LWh4aVctc3NZMnRZVWg5LVc4V1dSbjdKWl9JYXBfbGxqZ010WEFjU2NTVEswZ1hxYktmY1F0S0JRa3l4?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Ala do PL vê Marinho com menos chance de ampliar apoio e defende fortalecimento de Tereza como nome da oposição","url":"https://news.google.com/rss/articles/CBMi8AFBVV95cUxNT3FwbFRVcXQ2UlRxVHVuNUt2SFVndzVWamxfOUxyYVFZODFmZngxTy12R3kzZnBLbDQzc1R0UGZfNm82TVc4ODBaNXh0M1pncTZKdHF1dUp5VzhUajREVTFIM1JEWVdPeFJSaVZfYkRydkhYcmJaczBoOFJCcXE4MFgxNGR2SGZrOGExci1DT0tlLTZXMVRITVcxbzdReFdhZF9xaFFVS1JTdGVVb1JxdEg3Ym5iOFcwSDllaGpmeGJDZFBRYkdVS21rYmJUdmpPdTJjVkxPOGNla040MjdrSk42V3RobVhMc2pOdWprSkbSAf8BQVVfeXFMTXlVMFNpbnFTZHU0U2F0SGg1WUxoZV9sNlBWek1mb3doMGZsb1o4VmkwZW1XWUIzZm5PdEYyZEw4V0VyaWV2NC1RRDkxS1dZNnNYR2RlajdLT2JUeXhzSUpGdHpsV3oxTmVDSjhQVC1uVHIzMFZxTTMwV2V3dUlQbTFLSjdGbzN4UnFkYTliTlEwYWYwalFScFk3VDZaZnprcTJqZ210NFBqZENWOTVjcV9LTUM0UllNUVRMZm56aGYxMU1ESXo3MUlPbllVVF9uRzNPMS1CbXlVYTRPMG54MmMwb2lram1GcmxBWm53eXdFSzdKaElJTnFXNzM0QlNn?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Transparência Internacional afirma que afastamento de delegados da PF tem 'contornos de extrema gravidade'","url":"https://news.google.com/rss/articles/CBMi9gFBVV95cUxOUnJMVW5TaHhIQ1ZqTXFaRVNQTk4tNWhfZk5HVkwxcWhWS1l1VDJSTlczRDFpZTRONUE1dnl5LTdqZkprX1hHc3BWSXlwbFpYdXBWeVgwdGtTb003Ym4xWXMwZVQ3ejdkVGpERXRhN3BaaVl5Zlp4LTN1SGRkcURmSlRROWJwQmtRekE0RmFSVlEwejNhX0Y0U1pkU2VvMlpFLWNiaF93Zm1TMmwwV2hTdDJwY3hqN0VyWFlUTkFBRktFcmo4OWlnUEQzc0t5QmFSN1IwMU1abVhmUXlVYzFUN3RGczZyX2h1N2NXVDNpS3d6OEJGVGfSAYQCQVVfeXFMTkpGYUtFQU1jaGw3UEM2eTFDcTRHWnpQRFdfVUN3SXhBcWk3clVJN1lvTEJDM0JiZjFWVkdJZmV5MW45QVpJekdrcUhIT2NiS3FGbnlnUUNPSDBiYXd3cGR4MDFCdGI5c0FhV2dTQzhkay16WGEwa0hkSmdCRFF6OVM4RFg0WVJsb05vZ3hoWDI4Ym5ndzRWV3habVV6MVpxX3pzeTBuRDZLYjc0UmctR21hTTl6dUlvYV9RdzdmaFA4N3Bid0FvRnZoLTFZUkgySkFvQUxMZmxnMUloN1hBNV90bDJSbF93OGNLLVJkM3dESm43LXp3Zm80NWxsN1lXU29paUs?oc=5","imagem":"","topicKey":"politica"}],"oglobo.globo.com|all":[{"titulo":"Cleitinho busca se aproximar de Lula e do PT em Minas após apoio a Flávio Bolsonaro na campanha","url":"https://news.google.com/rss/articles/CBMi6gFBVV95cUxPQnl3YzhnQjZUUGN2eXJ1X29jcVdsTGdqZTRkcmw3THV1WHUwTG5vck40X2xQVDFxYnNfRmpFaTF4Xy1CMjZJbUdmdGZWWXRkT1VJV2l2X0I0NUdyZjJseU5HcUpSQ19FMjZhNHF0XzVobzRpa1k3bW5iTi1ZcWhVb3ZLMFBnTDJYc2Q4NGN0cXJLTTc1NzhNN0NwSS16a1E2S3g3aEU1Sm5hdVpHbEtNLW5wWHdfZlA1YkZqQXZGYndrSllBWWJxVTJGZGZMT3VOa2pia25uOUVsem12Y3QyOXR1dElkQzJTTnfSAfgBQVVfeXFMTXZhMGhiSEk4aXF2eWRlWjMwS2JkOVFjSmhOek50NE40TTAzd0F1YmNCQi1Pdm9qUkdsdWp1eWxySG9YV3dXUkVoWmFmaUlGSmlLVXA3RzVOMV8zNkg1Rkl0MGU0eml1OTNmTWd4Ui05cW5RU3lrbWJockpUTG9vVk5aV2ttRV94bGVsLVpiSEFsZkhMcjZIWmJqMmZHdEQ4UDNUY0YzMXBnbFA4eXNQSGdFblh1OUpvU1RyY3oxaXF3NXN2NmhaNzdIZ2piSDdZOUtEMXJyUWNKRVp3YnZtc3FJdURUc2ladVJXeXRQVzlkNzQzeWdOeTA?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Após silêncio do PT, Freixo se posiciona a favor de segundo turno no Rio","url":"https://news.google.com/rss/articles/CBMiygFBVV95cUxQN0JydFNJUVVsbHZQX3dCQUN1X2JqMEF6Mk95REZQekp3RW03bVlpMmdJOXQzQmpzSHdNUEVnNzhiUTZSQnNEUjhOdy1tWG1XM29EUlVDQ0ZzR1lGc2g3YUJEZjZuNFV4dTdLN3FzVWtVMUNTSk5uSXlsM1NjVGRvQ0txc19SaGdpYm5YbXQ0TUtEandmQ21hdEtHc200NTVYQmQwR2liV0ZJMmduQnJpSW9yUGdIUWo2N01LVXlEU1U3clhmbHJha1Rn0gHYAUFVX3lxTE9pMXpfaEEwb1c1U2FMTnJvZVB4TTdVbXRDOXkwNUhURTJtSzJJck84Tlg2eUh4OXRIdVotVnR6MWFMWWZENHlURjRmTnpaUzVhTllkQUNRdVpvT01CbWt4Um1rQXVwRUhCUklnaWZOamFmMV9NSU5vTU9VSGFEc3ExeEFPVGhLQUhNdldMX2kyRjVpRGlwRHVBU0xuLVFkNldlVWdQV0N6cXFkS0ZQbTNab2ZJRnFUUkZSMVNuN01RamRGNGd0X3hiMFhPVkpKdjMya3dWMnI4Vg?oc=5","imagem":"","topicKey":"politica"},{"titulo":"PF abre investigação ordenada por Dino sobre suspeita de financiamento estrangeiro à campanha de Flávio Bolsonaro","url":"https://news.google.com/rss/articles/CBMiggJBVV95cUxObXl2NkUxdlJWemtZNC1TVmIxSWFhV29hcDZScHRjU1kxOEVZeHotRkU2ZmgtbzZCS2ptbmJBclBZZFQ3aUJuMVZHWUFUYWFCYWhKcEQ2aDltOUx5NmFicURuR1hJNy1zUHNPc3V2ZEhKNEc1WVFHNWtucUM3VWRlV2g5OGRQR0hIcXgwczlSMWRfMlZTYlEtWWJ6SElpa25ZTmg5c3ZIaXdSZVZfLVN3U0ZlZ19IN05LaTZwcU9QSmJjQlFsRWZhQjY3S2N4czdhdEhULXZSdWZIZERKdXQwMVNJbTVraFUzeE5YUGVLbmxyVmVCcExWUC1RNTFRVEwteEE?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Zanin recebe advogados de Paes para discutir segundo turno no Rio","url":"https://news.google.com/rss/articles/CBMiwgFBVV95cUxPeC04VWdrNE1aNU01TTVBRjhNWi1TX1NFVERSTnhSTVZwMjdIYUtfRE1mcFQ0TUplZ201a2otMGVLYzJKeURzdjllSHFSZkpySEtMaWF0QnZrOUVjN28tMnVrXzAxaHNKYkFGOHMwZDhhZ3lieXhOYUVXT2czVnFGRzJRc0dMNE55a0ZFZmtOWmY3UUhHR2FwR1ZVdFlVZHB0NGpSWU9NZjZWV1dfTzhGWTFhbWQ4VEZQSENLN0xmbE5XQdIB0AFBVV95cUxOT3VablVGZTR6czE4T0NhQTI1UzVjOHBrWldHR2ZmT2NSM2VTTk1ZbXppVXVBTzJmTHZjRHRmZjF3Wkd4UU1PRjJzQnZlTnJIcUZLQ3d6NzB4NFptSjFXLXVxSWxxQVk0dFVkS1gxZVZhZGFsS0dqemhrZ0RsSUoxeTV2WWdnNkdMYVhLNm9JNUZGYWJ1LWh4aVctc3NZMnRZVWg5LVc4V1dSbjdKWl9JYXBfbGxqZ010WEFjU2NTVEswZ1hxYktmY1F0S0JRa3l4?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Ala do PL vê Marinho com menos chance de ampliar apoio e defende fortalecimento de Tereza como nome da oposição","url":"https://news.google.com/rss/articles/CBMi8AFBVV95cUxNT3FwbFRVcXQ2UlRxVHVuNUt2SFVndzVWamxfOUxyYVFZODFmZngxTy12R3kzZnBLbDQzc1R0UGZfNm82TVc4ODBaNXh0M1pncTZKdHF1dUp5VzhUajREVTFIM1JEWVdPeFJSaVZfYkRydkhYcmJaczBoOFJCcXE4MFgxNGR2SGZrOGExci1DT0tlLTZXMVRITVcxbzdReFdhZF9xaFFVS1JTdGVVb1JxdEg3Ym5iOFcwSDllaGpmeGJDZFBRYkdVS21rYmJUdmpPdTJjVkxPOGNla040MjdrSk42V3RobVhMc2pOdWprSkbSAf8BQVVfeXFMTXlVMFNpbnFTZHU0U2F0SGg1WUxoZV9sNlBWek1mb3doMGZsb1o4VmkwZW1XWUIzZm5PdEYyZEw4V0VyaWV2NC1RRDkxS1dZNnNYR2RlajdLT2JUeXhzSUpGdHpsV3oxTmVDSjhQVC1uVHIzMFZxTTMwV2V3dUlQbTFLSjdGbzN4UnFkYTliTlEwYWYwalFScFk3VDZaZnprcTJqZ210NFBqZENWOTVjcV9LTUM0UllNUVRMZm56aGYxMU1ESXo3MUlPbllVVF9uRzNPMS1CbXlVYTRPMG54MmMwb2lram1GcmxBWm53eXdFSzdKaElJTnFXNzM0QlNn?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Transparência Internacional afirma que afastamento de delegados da PF tem 'contornos de extrema gravidade'","url":"https://news.google.com/rss/articles/CBMi9gFBVV95cUxOUnJMVW5TaHhIQ1ZqTXFaRVNQTk4tNWhfZk5HVkwxcWhWS1l1VDJSTlczRDFpZTRONUE1dnl5LTdqZkprX1hHc3BWSXlwbFpYdXBWeVgwdGtTb003Ym4xWXMwZVQ3ejdkVGpERXRhN3BaaVl5Zlp4LTN1SGRkcURmSlRROWJwQmtRekE0RmFSVlEwejNhX0Y0U1pkU2VvMlpFLWNiaF93Zm1TMmwwV2hTdDJwY3hqN0VyWFlUTkFBRktFcmo4OWlnUEQzc0t5QmFSN1IwMU1abVhmUXlVYzFUN3RGczZyX2h1N2NXVDNpS3d6OEJGVGfSAYQCQVVfeXFMTkpGYUtFQU1jaGw3UEM2eTFDcTRHWnpQRFdfVUN3SXhBcWk3clVJN1lvTEJDM0JiZjFWVkdJZmV5MW45QVpJekdrcUhIT2NiS3FGbnlnUUNPSDBiYXd3cGR4MDFCdGI5c0FhV2dTQzhkay16WGEwa0hkSmdCRFF6OVM4RFg0WVJsb05vZ3hoWDI4Ym5ndzRWV3habVV6MVpxX3pzeTBuRDZLYjc0UmctR21hTTl6dUlvYV9RdzdmaFA4N3Bid0FvRnZoLTFZUkgySkFvQUxMZmxnMUloN1hBNV90bDJSbF93OGNLLVJkM3dESm43LXp3Zm80NWxsN1lXU29paUs?oc=5","imagem":"","topicKey":"politica"}],"g1.globo.com|politica":[{"titulo":"Governo acerta com Congresso projeto de ajuste fiscal que pode chegar a R$ 80 bi em 2027","url":"https://news.google.com/rss/articles/CBMi4wFBVV95cUxNRXJqMG9jYnk0R1p6YWQ2TmtDUWFtWlM1emJpM1Q3SlZVQ2RqT1RnTFo4UGs3a3JFX0tPZFB3bGJPVUpDcUFmMTZoM2lMaUllVkR1bjJSdWk0U3ZBWE5WQ05hY0NOcDJfMUl5WEZBYXh0M1VfY3dwRlNzOVFSd3EyYzdhRUt6OXA5ZlBJT0dkUWxqV3JVdW9sczJQaEJYek5YcUExU3FVVFIySjZLYTN4VUtpRTJMTzAwNUYzeDR1cjB6cmo0ejlSOThXRUNjTXBZTkpmUU5mSWpmaTRpNnF4VHZGc9IB8gFBVV95cUxQMk9qMTgyYW02TkZTUTg2Ri1yME95YzRLS1VhY0VoQUx4NGNIeF8zb1FybGloaXg2MHplR1NRajVWQkYxb3Q1cmJfX2t5VzZjUGllZXRzN2o1cmdscGc4MHpqNFhmUHFpSDZ1TFVRbGhsUk9kNmltVkttbk16TTRrRkV6N1NQTEFYcGozLWY1TGNRUElVOFBtb25jcDZnc3hianB3QmZtZXhNc2dURXBycGYzWlVlYVdzYzlncVBqRGhZbWdCWUVMd0U5b0RsNkVTR0NvS3RZWEktZVFZQUtBa29feVB5d3pxaDVnbnUxMGxnUQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Relator atende agronegócio, e MP que renegocia dívidas rurais é aprovada na Câmara","url":"https://news.google.com/rss/articles/CBMi0gFBVV95cUxPZWVsNXRZMUd3Ym5qZk5EY0ZHaXdxenIwSzRuVV9PUkNpTTczc0NleUNOQ3pxN1BuZ1pPclN2MXd0b2R4bDBteWxJZjFnaGlqTXZJWUZRamdsdjJkQVZSb2JBTmpRMTd4NGhiaXRwYmRzMEdrVzB2MEJWRGxiYUlNZmVMSUhQVy1ucFhYX2lTUGpWVkg1bXp5SGxMRTJ5S0J0NldhVmxvNW02bGR1WGtaVmkwaVZCMDNtN0FMVWEwVlBOeC1oMllnWXRySzFDTV9mdEHSAeABQVVfeXFMTWVWYTdobS1nd3Frby1LVlg5ODdFWUFhOXczMGpfQVQ2aFp5WmFnMDEtM21Tek1IRnJzQWRvT1poVlVMTmFyRHNhcjN2Z2ZYcW1YaV9XMG8xYW5vTi1pWlJJSXpVaGhib1plLUQ2V1RaUnlRZzg5LXNYU0FMdnNYOEs0bFFITlN4QXdJQk85b1lZclJVYS1VRHN2bUU2aGdQdjFTc3Jqc2V0aWVTQllfRlQxeUVvQlk1RmowRUd6eS1lTVd6OG1hczJoREVqVE1nSVJKSWZfQnVVcGhTazFHNVU?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Senado prevê gasto de R$ 6 milhões com 95 iPhones 18 Pro e 330 outros celulares para parlamentares e servidores","url":"https://news.google.com/rss/articles/CBMi-AFBVV95cUxNZ2pIc1BWTzQyU3RVanR4M3R6R0RRTm1Cck9JdDJIWHZGa1NvaHJudGlwMThfZ05CRnRjeVJZWGh2M2FBNXNhRXpCbl9WbEllV3ZOenVvYjBsNHlTM19NNVp6S2NfZnhNQ1dpWVQxd3Ffbm53T2p4VTd3ek10UFFPY3hiWE96WlN1UzhBbVdIWnlaTjMxb2o3cmVRcU05QXA5cU9PZFFvdldONEx4RGZYOFlONXdUbG1md2pNcE5rbTdVaDU4MnNNT2dDUzdxZHpMSG05QW5SYkV6eVZQV0stem55Zk1MMHhtUTFSeVFyQTlUMDY0ZzZ5VtIBhwJBVV95cUxOLW92WDlzNEVFeF92aU9kbktKUWRjRHpUZUh6b2xFZUtCeDMzYlYyS2VSVjY4ODZEZXBLa0FuUV9WZUJtU09adWFqdHIyTVlDdi1YLUJTM3JEVEZBR3RDei15ekFBa1BSNlpWQXVRSUtBeDZzTlMzR0V0VEN1bWIxalNSLWktSlZuWnpjNW5QNU84dzN0VF96cGVPZlZWTWZsQktDZ3FQS1FIVnZzT3RKNWNIMk5YMGtVOVBVajFUT25IM0t3WFJ2UjhkaXU0SzFDdWx4Qy12d3R2eUkzNmV4c1NpUnltcUdSM1RMcHdmSDhaTTFJQzdpQWxZRXVEOXNocGFQX1BSVQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Diretor","url":"https://news.google.com/rss/articles/CBMi3gFBVV95cUxQOEVoV2JVYkVpV3pyaklxemo2MVRtMDYtamNBTWd3bXFGX3lGN2NfRmFPMDJ4b3pDOWxMSVdZWlppVDdRWXFFT1VRaVFxOWEzdTI5VEhIZHVoeEtjT2dVckJlVmVBaUNzdkJrazJpUGtMNDg1ci1GUThzU09kSGIxeFU5dlhVMFBVVlFyMDBaNmN0Mmtuakgwbk80YlNZRHhxYmJTekNCYXYxdE5KenNMb0hueWpuRXpvdDBVSWs4ZVdtWWhMZnJGNlJ1TXM4WWtHN2FyV09SaFV0UTlnQnfSAewBQVVfeXFMT29aN2VfeVlfc1ZQa0FSNUp2M1Y2ZVFWakxnOHNOTTdVM0ZYTjJoVzZfVXBfQjlndDRFY1ZaUlJyU2ZzYkI0V212VVBDRUp6cGQzQUpUell5ZmpmNm5JUHN3Ym80eFgyNjlUTHN0Y0NxMHIxZkNSSWsySnVfeWpxeGkyaWFNbnBweC1PLU5LWExEbmFrVjZXbUNoeHZmLWwzdXhEaG9INGtWTzJwYWUyVWJhT1NSWllpb0N2cUc5Mk9IZXNFOFR3X0lLejZsYU93VmVGSHVPUmVsRU9RalQxcC1IT243WmVkaEF2eDM?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Campanha de Lula recebeu R$ 1,9 milhão em doações depois do segundo turno; Flávio Bolsonaro obteve R$ 1 milhão","url":"https://news.google.com/rss/articles/CBMixAFBVV95cUxQM0xNeWVjYjdLel9XYU5HaGZxSlVWeTJwbzJWalQ0dEVxVXRCSjFIVFpGb0FoUk9TZ1UyLVNXWW53OEtqUkxuZ0Z6VE54OGZ4Uk5la2IzSjFFTEw4a2t2bDd4LUFpTG9FM2lJNU9GUFRVSmxKWjdpLVpXOGlxNDlzTWwxazlPVF9GZkxmN3JaTXFhZlhTU0JkUjFMODRSdF9INzlFV1FJRkc5MVZ3bVd2TmZnekRiUFRJS0ltdVFPZkdZWjFx0gHTAUFVX3lxTE1DWDU1TTJFdlhvd0hJd2hzX3QzWW5nRU9WLXdOQWY4bmhjX1JCeEdkUXZYU184VFA1OUFkNFJwNWtCeEJvbHBwVFQxd2NOUk9LNHdZX1EwTVQ0VFBFMmR3YWY3TFZxVkxyeVFyVU95SGxSWk1CSWxmeV9MMnF0bU1QemRmdDEwUU03ajhIc2Y3TE84dFlMS1dJcTNXY3RDQmdySzloRFZNM2p3S2VaVGhiSHdxNVhwSHkxVmR0M1JRUl9ZYmNtMDRnN3kxS1BIR2c1anc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Lula discute parceria em defesa com presidente turco, às margens da COP31 na Turquia","url":"https://news.google.com/rss/articles/CBMi1AFBVV95cUxNdTlPc0hnWWRFVS01dVRBbUFwVmJ0TDdpeXJRdmhfcFgzUFJBSENHNWdDYW83WHhjWVFLU3h1akktWERLb2t5ejJtZmFPbFFyUDZidUdWZnEwdWZ3emlKUk96X3kwcWNVaHlyNThMb3FkbGpYSTd5UXlTZlY5eHBzTnk3S3BPNGpUR05mT2t4MW1LaHJEZlJzbDR5Rng3TW1iQzNEZXRKTlA0RDIzejFwR1JES3pzQ2h3YVpld1dpUVdYZjUwQVNHdzh2ejhhTGFzeVJaZ9IB4wFBVV95cUxQWWdvQ2hNZkVWcC13Rk04MnIteW1VRzZWZ2RWMXlCVGFySGdNTFJreXQ1VTJfM0RlWUhNdS1meGRVa2thNjZmWEphcV90Wl9hNEJKMzczTFJJT2c1cUJ6dTBQTzNiQXF3Vjd2MXEyMXZKZGZtZTRFX3dnekw4bHFYM0xMclJhc0pqQWdhWk0yQUdJcEhTRjM0ejhmZTQzblM4TXJycW14MFpLSzd0RF9OMXVnZkJhQVlEdms0MG80UTNDc0dTZHVMeWxIYkI3REpYNnVDcUJuN0UxNTlrM1FveDdRcw?oc=5","imagem":"","topicKey":"politica"}],"g1.globo.com|all":[{"titulo":"Governo acerta com Congresso projeto de ajuste fiscal que pode chegar a R$ 80 bi em 2027","url":"https://news.google.com/rss/articles/CBMi4wFBVV95cUxNRXJqMG9jYnk0R1p6YWQ2TmtDUWFtWlM1emJpM1Q3SlZVQ2RqT1RnTFo4UGs3a3JFX0tPZFB3bGJPVUpDcUFmMTZoM2lMaUllVkR1bjJSdWk0U3ZBWE5WQ05hY0NOcDJfMUl5WEZBYXh0M1VfY3dwRlNzOVFSd3EyYzdhRUt6OXA5ZlBJT0dkUWxqV3JVdW9sczJQaEJYek5YcUExU3FVVFIySjZLYTN4VUtpRTJMTzAwNUYzeDR1cjB6cmo0ejlSOThXRUNjTXBZTkpmUU5mSWpmaTRpNnF4VHZGc9IB8gFBVV95cUxQMk9qMTgyYW02TkZTUTg2Ri1yME95YzRLS1VhY0VoQUx4NGNIeF8zb1FybGloaXg2MHplR1NRajVWQkYxb3Q1cmJfX2t5VzZjUGllZXRzN2o1cmdscGc4MHpqNFhmUHFpSDZ1TFVRbGhsUk9kNmltVkttbk16TTRrRkV6N1NQTEFYcGozLWY1TGNRUElVOFBtb25jcDZnc3hianB3QmZtZXhNc2dURXBycGYzWlVlYVdzYzlncVBqRGhZbWdCWUVMd0U5b0RsNkVTR0NvS3RZWEktZVFZQUtBa29feVB5d3pxaDVnbnUxMGxnUQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Relator atende agronegócio, e MP que renegocia dívidas rurais é aprovada na Câmara","url":"https://news.google.com/rss/articles/CBMi0gFBVV95cUxPZWVsNXRZMUd3Ym5qZk5EY0ZHaXdxenIwSzRuVV9PUkNpTTczc0NleUNOQ3pxN1BuZ1pPclN2MXd0b2R4bDBteWxJZjFnaGlqTXZJWUZRamdsdjJkQVZSb2JBTmpRMTd4NGhiaXRwYmRzMEdrVzB2MEJWRGxiYUlNZmVMSUhQVy1ucFhYX2lTUGpWVkg1bXp5SGxMRTJ5S0J0NldhVmxvNW02bGR1WGtaVmkwaVZCMDNtN0FMVWEwVlBOeC1oMllnWXRySzFDTV9mdEHSAeABQVVfeXFMTWVWYTdobS1nd3Frby1LVlg5ODdFWUFhOXczMGpfQVQ2aFp5WmFnMDEtM21Tek1IRnJzQWRvT1poVlVMTmFyRHNhcjN2Z2ZYcW1YaV9XMG8xYW5vTi1pWlJJSXpVaGhib1plLUQ2V1RaUnlRZzg5LXNYU0FMdnNYOEs0bFFITlN4QXdJQk85b1lZclJVYS1VRHN2bUU2aGdQdjFTc3Jqc2V0aWVTQllfRlQxeUVvQlk1RmowRUd6eS1lTVd6OG1hczJoREVqVE1nSVJKSWZfQnVVcGhTazFHNVU?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Senado prevê gasto de R$ 6 milhões com 95 iPhones 18 Pro e 330 outros celulares para parlamentares e servidores","url":"https://news.google.com/rss/articles/CBMi-AFBVV95cUxNZ2pIc1BWTzQyU3RVanR4M3R6R0RRTm1Cck9JdDJIWHZGa1NvaHJudGlwMThfZ05CRnRjeVJZWGh2M2FBNXNhRXpCbl9WbEllV3ZOenVvYjBsNHlTM19NNVp6S2NfZnhNQ1dpWVQxd3Ffbm53T2p4VTd3ek10UFFPY3hiWE96WlN1UzhBbVdIWnlaTjMxb2o3cmVRcU05QXA5cU9PZFFvdldONEx4RGZYOFlONXdUbG1md2pNcE5rbTdVaDU4MnNNT2dDUzdxZHpMSG05QW5SYkV6eVZQV0stem55Zk1MMHhtUTFSeVFyQTlUMDY0ZzZ5VtIBhwJBVV95cUxOLW92WDlzNEVFeF92aU9kbktKUWRjRHpUZUh6b2xFZUtCeDMzYlYyS2VSVjY4ODZEZXBLa0FuUV9WZUJtU09adWFqdHIyTVlDdi1YLUJTM3JEVEZBR3RDei15ekFBa1BSNlpWQXVRSUtBeDZzTlMzR0V0VEN1bWIxalNSLWktSlZuWnpjNW5QNU84dzN0VF96cGVPZlZWTWZsQktDZ3FQS1FIVnZzT3RKNWNIMk5YMGtVOVBVajFUT25IM0t3WFJ2UjhkaXU0SzFDdWx4Qy12d3R2eUkzNmV4c1NpUnltcUdSM1RMcHdmSDhaTTFJQzdpQWxZRXVEOXNocGFQX1BSVQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Diretor","url":"https://news.google.com/rss/articles/CBMi3gFBVV95cUxQOEVoV2JVYkVpV3pyaklxemo2MVRtMDYtamNBTWd3bXFGX3lGN2NfRmFPMDJ4b3pDOWxMSVdZWlppVDdRWXFFT1VRaVFxOWEzdTI5VEhIZHVoeEtjT2dVckJlVmVBaUNzdkJrazJpUGtMNDg1ci1GUThzU09kSGIxeFU5dlhVMFBVVlFyMDBaNmN0Mmtuakgwbk80YlNZRHhxYmJTekNCYXYxdE5KenNMb0hueWpuRXpvdDBVSWs4ZVdtWWhMZnJGNlJ1TXM4WWtHN2FyV09SaFV0UTlnQnfSAewBQVVfeXFMT29aN2VfeVlfc1ZQa0FSNUp2M1Y2ZVFWakxnOHNOTTdVM0ZYTjJoVzZfVXBfQjlndDRFY1ZaUlJyU2ZzYkI0V212VVBDRUp6cGQzQUpUell5ZmpmNm5JUHN3Ym80eFgyNjlUTHN0Y0NxMHIxZkNSSWsySnVfeWpxeGkyaWFNbnBweC1PLU5LWExEbmFrVjZXbUNoeHZmLWwzdXhEaG9INGtWTzJwYWUyVWJhT1NSWllpb0N2cUc5Mk9IZXNFOFR3X0lLejZsYU93VmVGSHVPUmVsRU9RalQxcC1IT243WmVkaEF2eDM?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Campanha de Lula recebeu R$ 1,9 milhão em doações depois do segundo turno; Flávio Bolsonaro obteve R$ 1 milhão","url":"https://news.google.com/rss/articles/CBMixAFBVV95cUxQM0xNeWVjYjdLel9XYU5HaGZxSlVWeTJwbzJWalQ0dEVxVXRCSjFIVFpGb0FoUk9TZ1UyLVNXWW53OEtqUkxuZ0Z6VE54OGZ4Uk5la2IzSjFFTEw4a2t2bDd4LUFpTG9FM2lJNU9GUFRVSmxKWjdpLVpXOGlxNDlzTWwxazlPVF9GZkxmN3JaTXFhZlhTU0JkUjFMODRSdF9INzlFV1FJRkc5MVZ3bVd2TmZnekRiUFRJS0ltdVFPZkdZWjFx0gHTAUFVX3lxTE1DWDU1TTJFdlhvd0hJd2hzX3QzWW5nRU9WLXdOQWY4bmhjX1JCeEdkUXZYU184VFA1OUFkNFJwNWtCeEJvbHBwVFQxd2NOUk9LNHdZX1EwTVQ0VFBFMmR3YWY3TFZxVkxyeVFyVU95SGxSWk1CSWxmeV9MMnF0bU1QemRmdDEwUU03ajhIc2Y3TE84dFlMS1dJcTNXY3RDQmdySzloRFZNM2p3S2VaVGhiSHdxNVhwSHkxVmR0M1JRUl9ZYmNtMDRnN3kxS1BIR2c1anc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Lula discute parceria em defesa com presidente turco, às margens da COP31 na Turquia","url":"https://news.google.com/rss/articles/CBMi1AFBVV95cUxNdTlPc0hnWWRFVS01dVRBbUFwVmJ0TDdpeXJRdmhfcFgzUFJBSENHNWdDYW83WHhjWVFLU3h1akktWERLb2t5ejJtZmFPbFFyUDZidUdWZnEwdWZ3emlKUk96X3kwcWNVaHlyNThMb3FkbGpYSTd5UXlTZlY5eHBzTnk3S3BPNGpUR05mT2t4MW1LaHJEZlJzbDR5Rng3TW1iQzNEZXRKTlA0RDIzejFwR1JES3pzQ2h3YVpld1dpUVdYZjUwQVNHdzh2ejhhTGFzeVJaZ9IB4wFBVV95cUxQWWdvQ2hNZkVWcC13Rk04MnIteW1VRzZWZ2RWMXlCVGFySGdNTFJreXQ1VTJfM0RlWUhNdS1meGRVa2thNjZmWEphcV90Wl9hNEJKMzczTFJJT2c1cUJ6dTBQTzNiQXF3Vjd2MXEyMXZKZGZtZTRFX3dnekw4bHFYM0xMclJhc0pqQWdhWk0yQUdJcEhTRjM0ejhmZTQzblM4TXJycW14MFpLSzd0RF9OMXVnZkJhQVlEdms0MG80UTNDc0dTZHVMeWxIYkI3REpYNnVDcUJuN0UxNTlrM1FveDdRcw?oc=5","imagem":"","topicKey":"politica"}],"agenciabrasil.ebc.com.br|politica":[{"titulo":"Presidente Lula se reúne com líder da Turquia, Tayyip Erdogan","url":"https://news.google.com/rss/articles/CBMi1AFBVV95cUxQSXRzUG5lNWo1R2x2QzhpRTRKdnFpSkVHWGYwY05KcDl5T1ZsWkw4VGxQd3hvSTgzbFpDSkQ3dDFQci1raGNoYWVncGlLSHF4T05XTTJocjdGaXRkVUJtcHc0dkZuc0poVnhzd0NSSWNVeGxQQkpGNDNjbkt0Zy1TZUxZczBxcV9QYy1yN3pYN3FKRVNNa0xtVFQyRlhRUldURkhjWkZxYUlzSmZqNkg3RE1FcEJUc2dWR0FMNUxrR21odmR6YXRFSXJIRGZ0LUluQ1U1Vw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Relator apresenta diretrizes da proposta de voto distrital misto","url":"https://news.google.com/rss/articles/CBMiwwFBVV95cUxNcWc4ZXM4MlV3dHhIMmVBMFh0SjdqM2JqbW15NFp0cHlNQ21JWV9wdWp1UGt5VXdTTUhiel95Zl9qaGFCb0ZHZ1BlTmtSczRYbXFJNldhaThkU1lhaTZVMnoza2lZWU5rNVhsNV9FTTZRX3F6QU1sc0N5VmhwYkVaQkp0RVMybHRlSExyQ3F4NVpuQUR4QUNzeWFPY19Gd1B0TzU1R2ttOXJMNEF3NG1GY0hGdFdYZ3FnSGZ0UHM0ejhaWTA?oc=5","imagem":"","topicKey":"politica"},{"titulo":"CLDF vota proposta que libera reeleição de membros da Mesa Diretora","url":"https://news.google.com/rss/articles/CBMiwwFBVV95cUxNUUhERTBMbEtSRW5lSjR6dWI1dzQwUklFa2I4X1NlOXNXWXhCYXEwRXVZWHoybDB6cG5PTUlmUTQ4YW9paVZaZ2dYMlBsT1lidXN0Z1paYzZLTUI0Sk9WVXZmVlhxWE14M2t5eXJzVVcwamxTQmVkVlBiSHdmVUZwdkowQlNFTzVEckpRbjNhTVNzcTAwMlF4RW9jV1dVakRkV0hhNmlVVzRQbmh2emN6SC1USm5xRzJZZlFpUUF2cEFtTEk?oc=5","imagem":"","topicKey":"politica"},{"titulo":"FBI investiga envolvimento de CEO da Nvidia com empresária chinesa","url":"https://news.google.com/rss/articles/CBMi4wFBVV95cUxOWXFoQTRYM2RVY3c1SFE4SWJxdDVFbVpKbTcyQ3hPMk1kTV9sN29Sci0xXzJTMlJrRzR4ejQya3p0dzRfc09JUm9HV1hhR1dCbXMwM3R5X1VrRXVWdzBtaHZaaVJ6TU9zREI5R2lhZjdMZVZaUWRza3hZOUFqeGNQdXV1R2VDcnE2T0xvaDBlRWF0SkptU0JXLWJ6S2xSUExYNTVxcW55anlNMFFIT2JZeG1qRUI0RGtDZmlwNDhVeVIzR3BLVDVnWkN4NGVJdEY2enJNNVZzVW5Pa0tNbW4wMDRKUQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Movimentações no Senado antecipam disputa pelo comando da Casa em 2027","url":"https://news.google.com/rss/articles/CBMixwFBVV95cUxORjBtb2U1SmdkZzdJVUNRRmpjYjRsOGk2aVZacTFNYmkxbFFJVGNqRE5nWXRuUlUySm1qazdVeDYzMENfUVUzekZGS2x4a2ZXNjYySTY5YXdyRWFsOWdleHdBMGdlNEZGX05nMzE3NVhoVlNUajFQUUNNUHdXeHJNWkxSVzNfa0xPOVlwMmluNVhWSEo5clRTTW9HR2VqaVhNeDVLUDlXbkRKbGRad25FQjV2WDRHMm8wMmhZdGhRek85R29rN0ZN?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Lula se compromete com responsabilidade fiscal e busca conciliação","url":"https://news.google.com/rss/articles/CBMiwgFBVV95cUxOdWdLMllGbzJySEN1ZmM2WnN3Qk1DU2g2bDE4cUdTTlRheWpkQWRNWG1YTkdWckJQVEk2MDV2S2VDYjVINDdTQU9CNnhpZGk3NWRVNXFqc19KNG0wZDF4SjFYNXV2M1B6OVU1OF95N1lJS2p6TnNVU09nRWh2U2l1cDdjbzNhYlhKVFBQeXNSenFjQ0I4R1lEV3Bxbmc5X1pLRkhqWVJ6SHlZaHdBdjVoVFZmbjdSOUpTR1B5VmFFTVkzUQ?oc=5","imagem":"","topicKey":"politica"}],"agenciabrasil.ebc.com.br|all":[{"titulo":"Presidente Lula se reúne com líder da Turquia, Tayyip Erdogan","url":"https://news.google.com/rss/articles/CBMi1AFBVV95cUxQSXRzUG5lNWo1R2x2QzhpRTRKdnFpSkVHWGYwY05KcDl5T1ZsWkw4VGxQd3hvSTgzbFpDSkQ3dDFQci1raGNoYWVncGlLSHF4T05XTTJocjdGaXRkVUJtcHc0dkZuc0poVnhzd0NSSWNVeGxQQkpGNDNjbkt0Zy1TZUxZczBxcV9QYy1yN3pYN3FKRVNNa0xtVFQyRlhRUldURkhjWkZxYUlzSmZqNkg3RE1FcEJUc2dWR0FMNUxrR21odmR6YXRFSXJIRGZ0LUluQ1U1Vw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Relator apresenta diretrizes da proposta de voto distrital misto","url":"https://news.google.com/rss/articles/CBMiwwFBVV95cUxNcWc4ZXM4MlV3dHhIMmVBMFh0SjdqM2JqbW15NFp0cHlNQ21JWV9wdWp1UGt5VXdTTUhiel95Zl9qaGFCb0ZHZ1BlTmtSczRYbXFJNldhaThkU1lhaTZVMnoza2lZWU5rNVhsNV9FTTZRX3F6QU1sc0N5VmhwYkVaQkp0RVMybHRlSExyQ3F4NVpuQUR4QUNzeWFPY19Gd1B0TzU1R2ttOXJMNEF3NG1GY0hGdFdYZ3FnSGZ0UHM0ejhaWTA?oc=5","imagem":"","topicKey":"politica"},{"titulo":"CLDF vota proposta que libera reeleição de membros da Mesa Diretora","url":"https://news.google.com/rss/articles/CBMiwwFBVV95cUxNUUhERTBMbEtSRW5lSjR6dWI1dzQwUklFa2I4X1NlOXNXWXhCYXEwRXVZWHoybDB6cG5PTUlmUTQ4YW9paVZaZ2dYMlBsT1lidXN0Z1paYzZLTUI0Sk9WVXZmVlhxWE14M2t5eXJzVVcwamxTQmVkVlBiSHdmVUZwdkowQlNFTzVEckpRbjNhTVNzcTAwMlF4RW9jV1dVakRkV0hhNmlVVzRQbmh2emN6SC1USm5xRzJZZlFpUUF2cEFtTEk?oc=5","imagem":"","topicKey":"politica"},{"titulo":"FBI investiga envolvimento de CEO da Nvidia com empresária chinesa","url":"https://news.google.com/rss/articles/CBMi4wFBVV95cUxOWXFoQTRYM2RVY3c1SFE4SWJxdDVFbVpKbTcyQ3hPMk1kTV9sN29Sci0xXzJTMlJrRzR4ejQya3p0dzRfc09JUm9HV1hhR1dCbXMwM3R5X1VrRXVWdzBtaHZaaVJ6TU9zREI5R2lhZjdMZVZaUWRza3hZOUFqeGNQdXV1R2VDcnE2T0xvaDBlRWF0SkptU0JXLWJ6S2xSUExYNTVxcW55anlNMFFIT2JZeG1qRUI0RGtDZmlwNDhVeVIzR3BLVDVnWkN4NGVJdEY2enJNNVZzVW5Pa0tNbW4wMDRKUQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Movimentações no Senado antecipam disputa pelo comando da Casa em 2027","url":"https://news.google.com/rss/articles/CBMixwFBVV95cUxORjBtb2U1SmdkZzdJVUNRRmpjYjRsOGk2aVZacTFNYmkxbFFJVGNqRE5nWXRuUlUySm1qazdVeDYzMENfUVUzekZGS2x4a2ZXNjYySTY5YXdyRWFsOWdleHdBMGdlNEZGX05nMzE3NVhoVlNUajFQUUNNUHdXeHJNWkxSVzNfa0xPOVlwMmluNVhWSEo5clRTTW9HR2VqaVhNeDVLUDlXbkRKbGRad25FQjV2WDRHMm8wMmhZdGhRek85R29rN0ZN?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Lula se compromete com responsabilidade fiscal e busca conciliação","url":"https://news.google.com/rss/articles/CBMiwgFBVV95cUxOdWdLMllGbzJySEN1ZmM2WnN3Qk1DU2g2bDE4cUdTTlRheWpkQWRNWG1YTkdWckJQVEk2MDV2S2VDYjVINDdTQU9CNnhpZGk3NWRVNXFqc19KNG0wZDF4SjFYNXV2M1B6OVU1OF95N1lJS2p6TnNVU09nRWh2U2l1cDdjbzNhYlhKVFBQeXNSenFjQ0I4R1lEV3Bxbmc5X1pLRkhqWVJ6SHlZaHdBdjVoVFZmbjdSOUpTR1B5VmFFTVkzUQ?oc=5","imagem":"","topicKey":"politica"}],"estadao.com.br|politica":[{"titulo":"Raquel Lyra exonera aliados do PL em meio a articulação do PSD por aproximação com Lula","url":"https://news.google.com/rss/articles/CBMiwgFBVV95cUxQRzJhcGs3cGNkT2s2c1d1ZjFQZlA3cE9YMUZic2RVak11Q1dwdWxlZ2JIOXNfbVhZUFBiaUo3U0gyTDM1N1J5enRmVjBlMURoVndXb3VMM0RGZThJWU4wbHRxTVFSdVBmeXRSb2xmZk1TWmxZbW1HU3Y2WERMVmViZmlKc3o3SW1iSC03cDFCSWE1NmEtYXh2YTlrZTRDaVYwNTE1R25xbmprTVo3bE1TWU9rMzhLYmVabzRDSkdyNmdUZ9IBxwFBVV95cUxPY1lzeC1pTzhfazNxa0pvOFA5a3V3eEhISnJNVUVaU0oxUjl3UUZYa2hENW81QmczdWNUaW53MllUekg0UkRLY3hINm51SWJBT1dVMUVNWGdZZFBGMTRvMDRrbk96SFgzVUx2MTNNTndvbWp4Z0xTdU5Wa1hFSTNTcC1Ja1VDUU82cjJQMUZHeTNxUlhPcVV5c2NseFNWQjh5dXY0MExnc09SZ2V0cUQ4ekRkc0s1VmR2UmQ0N2o5Ym5RY0RaNkRr?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Moraes exigiu dados de anúncios sobre STF e ministros em ano eleitoral no inquérito das fake news","url":"https://news.google.com/rss/articles/CBMi7AFBVV95cUxPb2VGRXVWOG52NjZ2M1EzUm45TTVUaU5uT3VlM3I4TTFseDZkNnZHLWR4QXlvVjJoa0FyQ3VFWHJJTG5aNExsMVJaa0xLckd6Zm9XYndEbjB1VW9CUi1ibGFHdHV2YjFJa1JLSmNhMnREekJlN0h1cHloSmNuWWJncG5Sd19nc2dUNDNnNnNGSGlFbEl6S0poRXpzNG9fZ0ZlYWptNjhVUU0xOUZIaXR4MTJEWDcwcGVtMmV1clU5U2hFRWota2s2enhrNEVUak90QjF3aVJOVzg4enp4QnJOaW52ZmNneHVsUUR2WNIB8gFBVV95cUxPT2FHVjlUUGV5UTdEZFhHTS1BbWFTcl9fLWFZR2doRUhkTDZ1b25INVNndExzUzh4Z0Y2YndCMkRKTlRtWlVIdlNtQm9ZZE1obUtZWl90MVY2MFRVNHpXdmRQdHdxaFdoeEhiUC1iZnFjSDktelBsczMydkZqdXV1c2FaZDFpenVlWVNOSjBncURBMmRxTHd4Nm5RbWs4M2R4VDE4eXBQTVh0LXEteldKRTMtV0pCbG9oT0dsMnVmVDFYVlNGUDNVY3JVVmpJM19OZmZ4OUpvakszZWF3NEpHOGlIcjFKakhYR051Y3hQRkpXUQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Filhos de FHC pedem busca e apreensão contra homem que filmou ex","url":"https://news.google.com/rss/articles/CBMisgFBVV95cUxNYU9PMW1EZFhlNXBzUTQxOGN3ZnFSbFZoN0ZMNlNReUNPbmsyM2VSRUZOejJDMGp2WkloNnNmWDdtSzhTQ3NNUEhNWWxxcUxadHpKTkZMaG5mN2N2bDZLYndsMXhrQkhRX3UyTDhUOVpBTElJSkRUbTV4UEVDazZuNE9NRXY1VTFNclZMOWFqNE5JaVlBSHZXRmtlM3JkQ05BenVDRUhENDVIMnRISzZqMUJR0gG3AUFVX3lxTE1nVTlES2JPQlQ4RXJIM3BzUXRxc25waTJoVW5ycXJKTmVhdmNsLTZQY01UMkpPTVpVckFvT29vaEgwLTV4TldXVXZScXpCa1hoSHJ2V0hWZzNTS2puSzZocjItamdDVVRGYXFxWDdkN211VWJsbDVabkhRbnlzdk5YTTYzS2V5MnU1TlZmMXZUYW91cjlEa0tSZVdDbjYwa2hmQU5iOE53bk5PbUJGUDB3Z19pX21ncw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Recado de Lula, sem disfarce, para Xandão, Toffoli e Nunes Marques","url":"https://news.google.com/rss/articles/CBMiugFBVV95cUxNX0tMMXY4TGF4WDBSdVJmdmw2cGRjendQUEVTYkpxME50WS1mMmRFaHU5c2ZyRXF0WGppQlotWHpBUGZYNUZ2OTNfNjZiWEFsal9IVHF0ZDNpV2otU1k2M0FHVnVHZFZuV1ZLbHdsR0JZSTB5Q1FGeWlCTHdrcnluRzE2MkRDVndjNEVoRlRzU25xcHYwVkxxYi1RR3Y5Ujd1NUpZUnVZei04OTRtTkpKaG40VEVzREtpYmfSAb8BQVVfeXFMT3pVeXNkWUNjRGFGMzNiUDh3U3AtdlJGUEtnQ2JOLXhYUWc0VDEyckh0ZUdMYmp0c0gzVG01Rzdjdl9qZ2VDc0htRzRybWFKS0o4N0k1ODgwa1lpU1hOZ0ppLXJtRGhTbk5fcDN5SFRHcWd3Q1U1OHViUkNkRkpVYWt2ZmtCcU4zWF9zN195Vm55MjNqUVltZmluTThzQnlELVZIaDJKVFBsZWI4aGp4UEZDRUVKSWM0OFZiTzRMZ2s?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Organizações lançam manifesto pelo combate aos supersalários como prioridade do governo e Congresso","url":"https://news.google.com/rss/articles/CBMi2AFBVV95cUxPRXJQLTdrQlBEU3RBTE1YVjVPVkx4Nk11Y2ZzWUJMZkF1NkxLaXBWVmVFYW1qNHNpclphWW5abzY2eGxCTk0tSW44X2U4UFpPdlZEUFJuTUVSWWFXMkE3dHMxcGVqV2JHNFhrc21LUUZRMndFR0h3U19NSFgtV2hFWHFydXFDdzFtdF9DTGgzUlJZVzNnNDdXblV2WDNGc1RJNjFJZUNieTU1cWFZR0xLYXlBM21MTlcyR2FDRmo3N3ZZcmYyRTdLdFRzR0s4N2VxSjBGNk1lZGXSAd4BQVVfeXFMTjBuU1ZwcGU4TmRHQXZFVDdkVzJZSVBESmhFd2Y5a3RzelA0VTZHM0Nvc0RmNXJKMldRcldqeGJ1RTFfd1NfSmFpUHZ4QmpLTjZiTEI4a3BjNU55SEN1NzRpR09QOF9MV3Y1M19lSXBOZEkwVXBVQXo3Y08wYVFuandzc09jbnN5eDE1TDY4RUtYcmNYYWVmR0licGlub3dncHJfRUVTM3pHMTA2d1VjQkwzM3dvQzNycnRnOHhuSFlHd0dUdjFSdjd2VkRVclhVQ2x5YmRJVlZIby04amd3?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Deputado quer votar projeto com incentivos ao Brasil desenvolver sua própria tecnologia digital","url":"https://news.google.com/rss/articles/CBMi5AFBVV95cUxOSndERzdUSVF2Qk5nZTZfR0ZicmdlNy16UjVnbDhrbHlKaEx6c09mM1Y4YnMyM1NIOU93M2tLeDNDZVF4X1RrMnFIWUs0eEZXVmNvc3ZVSUF1SGJPYy1URnhJT0l6WmUtaVg5VjdVVUZieVdpWGR5TVNvTUdGRTRnaS1IOG4zN2ZZZ0JyZVYxRkhvbGN5ZU9wcVBlTmJtajc0NldsekJpVEhzekc5dFljblloVWVIdm5ZeUxaZnFlREJfQm5NRl9uamxWVW8tdjUxVW5JdHJ6UkJPR3RfSTFScUs0TnDSAeoBQVVfeXFMUEMzVTRVRXQ2RFZoNXkwRVZfekFPUFZmZXp0cy1fNk9oSXRqX2w3MjdRUXd1LUh3MUcxQXIzUjBPM04tdXQ1TUMtV3RwWGR5VWxYZ2hRcGI3RDJDUXBhYjRyR1o2MmpOMndselVyTGp4TmhjX1JTNk5LSFlQZmlwZnMwREdWV3JpdXo0bGJtUzZMWmUweEhzRDhESkpUVVdhdFJUcTVPSGtIZ2VIajQ0cEFpMVd6TVZ5RWxNZlZJcUhEZHRMelI0QjAtRGNmVzRVYkpLb2xOQ05oOFVtWE4wOU5jMTlrYWl0VnVR?oc=5","imagem":"","topicKey":"politica"}],"estadao.com.br|all":[{"titulo":"Raquel Lyra exonera aliados do PL em meio a articulação do PSD por aproximação com Lula","url":"https://news.google.com/rss/articles/CBMiwgFBVV95cUxQRzJhcGs3cGNkT2s2c1d1ZjFQZlA3cE9YMUZic2RVak11Q1dwdWxlZ2JIOXNfbVhZUFBiaUo3U0gyTDM1N1J5enRmVjBlMURoVndXb3VMM0RGZThJWU4wbHRxTVFSdVBmeXRSb2xmZk1TWmxZbW1HU3Y2WERMVmViZmlKc3o3SW1iSC03cDFCSWE1NmEtYXh2YTlrZTRDaVYwNTE1R25xbmprTVo3bE1TWU9rMzhLYmVabzRDSkdyNmdUZ9IBxwFBVV95cUxPY1lzeC1pTzhfazNxa0pvOFA5a3V3eEhISnJNVUVaU0oxUjl3UUZYa2hENW81QmczdWNUaW53MllUekg0UkRLY3hINm51SWJBT1dVMUVNWGdZZFBGMTRvMDRrbk96SFgzVUx2MTNNTndvbWp4Z0xTdU5Wa1hFSTNTcC1Ja1VDUU82cjJQMUZHeTNxUlhPcVV5c2NseFNWQjh5dXY0MExnc09SZ2V0cUQ4ekRkc0s1VmR2UmQ0N2o5Ym5RY0RaNkRr?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Moraes exigiu dados de anúncios sobre STF e ministros em ano eleitoral no inquérito das fake news","url":"https://news.google.com/rss/articles/CBMi7AFBVV95cUxPb2VGRXVWOG52NjZ2M1EzUm45TTVUaU5uT3VlM3I4TTFseDZkNnZHLWR4QXlvVjJoa0FyQ3VFWHJJTG5aNExsMVJaa0xLckd6Zm9XYndEbjB1VW9CUi1ibGFHdHV2YjFJa1JLSmNhMnREekJlN0h1cHloSmNuWWJncG5Sd19nc2dUNDNnNnNGSGlFbEl6S0poRXpzNG9fZ0ZlYWptNjhVUU0xOUZIaXR4MTJEWDcwcGVtMmV1clU5U2hFRWota2s2enhrNEVUak90QjF3aVJOVzg4enp4QnJOaW52ZmNneHVsUUR2WNIB8gFBVV95cUxPT2FHVjlUUGV5UTdEZFhHTS1BbWFTcl9fLWFZR2doRUhkTDZ1b25INVNndExzUzh4Z0Y2YndCMkRKTlRtWlVIdlNtQm9ZZE1obUtZWl90MVY2MFRVNHpXdmRQdHdxaFdoeEhiUC1iZnFjSDktelBsczMydkZqdXV1c2FaZDFpenVlWVNOSjBncURBMmRxTHd4Nm5RbWs4M2R4VDE4eXBQTVh0LXEteldKRTMtV0pCbG9oT0dsMnVmVDFYVlNGUDNVY3JVVmpJM19OZmZ4OUpvakszZWF3NEpHOGlIcjFKakhYR051Y3hQRkpXUQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Filhos de FHC pedem busca e apreensão contra homem que filmou ex","url":"https://news.google.com/rss/articles/CBMisgFBVV95cUxNYU9PMW1EZFhlNXBzUTQxOGN3ZnFSbFZoN0ZMNlNReUNPbmsyM2VSRUZOejJDMGp2WkloNnNmWDdtSzhTQ3NNUEhNWWxxcUxadHpKTkZMaG5mN2N2bDZLYndsMXhrQkhRX3UyTDhUOVpBTElJSkRUbTV4UEVDazZuNE9NRXY1VTFNclZMOWFqNE5JaVlBSHZXRmtlM3JkQ05BenVDRUhENDVIMnRISzZqMUJR0gG3AUFVX3lxTE1nVTlES2JPQlQ4RXJIM3BzUXRxc25waTJoVW5ycXJKTmVhdmNsLTZQY01UMkpPTVpVckFvT29vaEgwLTV4TldXVXZScXpCa1hoSHJ2V0hWZzNTS2puSzZocjItamdDVVRGYXFxWDdkN211VWJsbDVabkhRbnlzdk5YTTYzS2V5MnU1TlZmMXZUYW91cjlEa0tSZVdDbjYwa2hmQU5iOE53bk5PbUJGUDB3Z19pX21ncw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Recado de Lula, sem disfarce, para Xandão, Toffoli e Nunes Marques","url":"https://news.google.com/rss/articles/CBMiugFBVV95cUxNX0tMMXY4TGF4WDBSdVJmdmw2cGRjendQUEVTYkpxME50WS1mMmRFaHU5c2ZyRXF0WGppQlotWHpBUGZYNUZ2OTNfNjZiWEFsal9IVHF0ZDNpV2otU1k2M0FHVnVHZFZuV1ZLbHdsR0JZSTB5Q1FGeWlCTHdrcnluRzE2MkRDVndjNEVoRlRzU25xcHYwVkxxYi1RR3Y5Ujd1NUpZUnVZei04OTRtTkpKaG40VEVzREtpYmfSAb8BQVVfeXFMT3pVeXNkWUNjRGFGMzNiUDh3U3AtdlJGUEtnQ2JOLXhYUWc0VDEyckh0ZUdMYmp0c0gzVG01Rzdjdl9qZ2VDc0htRzRybWFKS0o4N0k1ODgwa1lpU1hOZ0ppLXJtRGhTbk5fcDN5SFRHcWd3Q1U1OHViUkNkRkpVYWt2ZmtCcU4zWF9zN195Vm55MjNqUVltZmluTThzQnlELVZIaDJKVFBsZWI4aGp4UEZDRUVKSWM0OFZiTzRMZ2s?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Organizações lançam manifesto pelo combate aos supersalários como prioridade do governo e Congresso","url":"https://news.google.com/rss/articles/CBMi2AFBVV95cUxPRXJQLTdrQlBEU3RBTE1YVjVPVkx4Nk11Y2ZzWUJMZkF1NkxLaXBWVmVFYW1qNHNpclphWW5abzY2eGxCTk0tSW44X2U4UFpPdlZEUFJuTUVSWWFXMkE3dHMxcGVqV2JHNFhrc21LUUZRMndFR0h3U19NSFgtV2hFWHFydXFDdzFtdF9DTGgzUlJZVzNnNDdXblV2WDNGc1RJNjFJZUNieTU1cWFZR0xLYXlBM21MTlcyR2FDRmo3N3ZZcmYyRTdLdFRzR0s4N2VxSjBGNk1lZGXSAd4BQVVfeXFMTjBuU1ZwcGU4TmRHQXZFVDdkVzJZSVBESmhFd2Y5a3RzelA0VTZHM0Nvc0RmNXJKMldRcldqeGJ1RTFfd1NfSmFpUHZ4QmpLTjZiTEI4a3BjNU55SEN1NzRpR09QOF9MV3Y1M19lSXBOZEkwVXBVQXo3Y08wYVFuandzc09jbnN5eDE1TDY4RUtYcmNYYWVmR0licGlub3dncHJfRUVTM3pHMTA2d1VjQkwzM3dvQzNycnRnOHhuSFlHd0dUdjFSdjd2VkRVclhVQ2x5YmRJVlZIby04amd3?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Deputado quer votar projeto com incentivos ao Brasil desenvolver sua própria tecnologia digital","url":"https://news.google.com/rss/articles/CBMi5AFBVV95cUxOSndERzdUSVF2Qk5nZTZfR0ZicmdlNy16UjVnbDhrbHlKaEx6c09mM1Y4YnMyM1NIOU93M2tLeDNDZVF4X1RrMnFIWUs0eEZXVmNvc3ZVSUF1SGJPYy1URnhJT0l6WmUtaVg5VjdVVUZieVdpWGR5TVNvTUdGRTRnaS1IOG4zN2ZZZ0JyZVYxRkhvbGN5ZU9wcVBlTmJtajc0NldsekJpVEhzekc5dFljblloVWVIdm5ZeUxaZnFlREJfQm5NRl9uamxWVW8tdjUxVW5JdHJ6UkJPR3RfSTFScUs0TnDSAeoBQVVfeXFMUEMzVTRVRXQ2RFZoNXkwRVZfekFPUFZmZXp0cy1fNk9oSXRqX2w3MjdRUXd1LUh3MUcxQXIzUjBPM04tdXQ1TUMtV3RwWGR5VWxYZ2hRcGI3RDJDUXBhYjRyR1o2MmpOMndselVyTGp4TmhjX1JTNk5LSFlQZmlwZnMwREdWV3JpdXo0bGJtUzZMWmUweEhzRDhESkpUVVdhdFJUcTVPSGtIZ2VIajQ0cEFpMVd6TVZ5RWxNZlZJcUhEZHRMelI0QjAtRGNmVzRVYkpLb2xOQ05oOFVtWE4wOU5jMTlrYWl0VnVR?oc=5","imagem":"","topicKey":"politica"}],"gazetadopovo.com.br|politica":[{"titulo":"Acusações de que Petro concedia contratos em troca de sexo abalam política da Colômbia","url":"https://news.google.com/rss/articles/CBMirgFBVV95cUxQUmM5Tm44VWNVZERlWkdUZ1h4dWxaRENfR09UUEtHT0E1dFNpYUFEbDlabFB0SHVxNnRtRXpZLXFNZW9maktDeU9vU3BxaUxvMFNtQkd3YldFa3AyRkx5TUlYdkZ3UHlCZ1BEanpZRUxIdE91amVOTk5RbWlhbjhvdFNpeFVqS2Y2b1RjTk0tYklsTGdReFUyeFhpSTFEQmFJRmxCSTJzMVRYczd5bWc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Ex","url":"https://news.google.com/rss/articles/CBMiwwFBVV95cUxONmV2cnQ2T0pIbWV3cXZyYWlTOHJhU0lwNGRxSmhhTVBJcFhGVDJ0VkZVTWpuSTV0aFhqXzlaS0NLTUYxZDhOZENsakdRQUpWNGRzZzZuZE9ybW1PdXdIQWFpdDJSeGUwQ0I1Qk1MM0Y2SmxqS3JvVVBYVGwxYy1VSkJTbEMtU2tQRVlOci0xSEd4THd6cmRDdlpPd1hCQ0NDVjB3bWNPeVo2RHROcllTMmFJZ01wZXlnUERpVzBlSTI5YjA?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Irmão de Orbán é preso por acusações de tráfico de pessoas; ex","url":"https://news.google.com/rss/articles/CBMiuAFBVV95cUxQRXVHVGQ3M1BFREU2YzEyRE0zMjZySUFVdzhvRmQ4Q29SSFNqUFZtd2Q2NGx4czNlaktzQUVvQmVJV2phUHhXMEZOOGdzaFNKVjBjTDA5OGtfNl9CVWFkdzhpVE1id3I0TlJuTVZGRzJHOFhEaFBZMnNlNmdrUkN4b1lrb0hjemE5bGdibDNVcWhLTGNRc3lBdFlGZFdTUlMyb2VEWlNxWVRQQWtKMDJ2SkRNeWg5SGV3?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Gazeta Agora: perseguição política e captura do Judiciário tornam o Brasil parecido com a Venezuela","url":"https://news.google.com/rss/articles/CBMi3AFBVV95cUxOTWowTWNWdExUNGdUNS03a0pHaGktUjdfeFJqeGR6a3NnakVEeUgzdndhcHItQWRXcmNOdGZVT0dONFNUZHNwbkljcXAwSDNkOTZ3aHRNandkQ1VzRnVqR3J2MFVoZ09yQzVqSldXWnRKMENGN09weExOdU43M1J5bE1jSzBPUUR4NExmOXZZNXVxd09TRVpabThHNW12QWNiWERQZjdFTTFMN2NMTjVWTXJoa3JlUHpBeEg1NzJTMERSOGhmWEdsLVNnN0xQb3pnLW9rSEQ5U3g4bjJq?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Quem é o ex","url":"https://news.google.com/rss/articles/CBMiqAFBVV95cUxQV1g4ZVlXWHVWaFRyWmVrTUVmR0VqbHdjWHpLLTVLNmNSU2NPcnNDVWpLWE9kYldITmdhOXQwTlgxcDJrOFpqUlpuUFJoMkdpZjk1TkxYYWh6Vk84UWk4Z2E0dXdqNHJWZFpZNE8tZ2pibTNLdW5rWW9iSk12N1FaREo0dHYzT2h0VkJuM2lxc3dfVmdyU3lXNUdrZ19MUmtiSWtldUNVcGo?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Kassab diz que equilíbrio fiscal definirá apoio do PSD a Lula","url":"https://news.google.com/rss/articles/CBMipwFBVV95cUxQOHh0akhoQzhCaTdoUnRmcW1KS2hYZmR4Smw1TXUzYm8yOGhsbHQ3Zm5jS3FRRzllSENLTVdiQl9IVXhiVWxMTVRUSjBvTVVXRnFZdEg1QzNtbm13NE5FaU03UGRQRjdGbnMzTTYyQnlWR0RGeDAzM3dLbmRjRExYWGFib2x4M0pQc1hhdVlpQUJmYUJzeEpMWXZnTzY0ckZCbWdjV3NzYw?oc=5","imagem":"","topicKey":"politica"}],"gazetadopovo.com.br|all":[{"titulo":"Acusações de que Petro concedia contratos em troca de sexo abalam política da Colômbia","url":"https://news.google.com/rss/articles/CBMirgFBVV95cUxQUmM5Tm44VWNVZERlWkdUZ1h4dWxaRENfR09UUEtHT0E1dFNpYUFEbDlabFB0SHVxNnRtRXpZLXFNZW9maktDeU9vU3BxaUxvMFNtQkd3YldFa3AyRkx5TUlYdkZ3UHlCZ1BEanpZRUxIdE91amVOTk5RbWlhbjhvdFNpeFVqS2Y2b1RjTk0tYklsTGdReFUyeFhpSTFEQmFJRmxCSTJzMVRYczd5bWc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Ex","url":"https://news.google.com/rss/articles/CBMiwwFBVV95cUxONmV2cnQ2T0pIbWV3cXZyYWlTOHJhU0lwNGRxSmhhTVBJcFhGVDJ0VkZVTWpuSTV0aFhqXzlaS0NLTUYxZDhOZENsakdRQUpWNGRzZzZuZE9ybW1PdXdIQWFpdDJSeGUwQ0I1Qk1MM0Y2SmxqS3JvVVBYVGwxYy1VSkJTbEMtU2tQRVlOci0xSEd4THd6cmRDdlpPd1hCQ0NDVjB3bWNPeVo2RHROcllTMmFJZ01wZXlnUERpVzBlSTI5YjA?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Irmão de Orbán é preso por acusações de tráfico de pessoas; ex","url":"https://news.google.com/rss/articles/CBMiuAFBVV95cUxQRXVHVGQ3M1BFREU2YzEyRE0zMjZySUFVdzhvRmQ4Q29SSFNqUFZtd2Q2NGx4czNlaktzQUVvQmVJV2phUHhXMEZOOGdzaFNKVjBjTDA5OGtfNl9CVWFkdzhpVE1id3I0TlJuTVZGRzJHOFhEaFBZMnNlNmdrUkN4b1lrb0hjemE5bGdibDNVcWhLTGNRc3lBdFlGZFdTUlMyb2VEWlNxWVRQQWtKMDJ2SkRNeWg5SGV3?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Gazeta Agora: perseguição política e captura do Judiciário tornam o Brasil parecido com a Venezuela","url":"https://news.google.com/rss/articles/CBMi3AFBVV95cUxOTWowTWNWdExUNGdUNS03a0pHaGktUjdfeFJqeGR6a3NnakVEeUgzdndhcHItQWRXcmNOdGZVT0dONFNUZHNwbkljcXAwSDNkOTZ3aHRNandkQ1VzRnVqR3J2MFVoZ09yQzVqSldXWnRKMENGN09weExOdU43M1J5bE1jSzBPUUR4NExmOXZZNXVxd09TRVpabThHNW12QWNiWERQZjdFTTFMN2NMTjVWTXJoa3JlUHpBeEg1NzJTMERSOGhmWEdsLVNnN0xQb3pnLW9rSEQ5U3g4bjJq?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Quem é o ex","url":"https://news.google.com/rss/articles/CBMiqAFBVV95cUxQV1g4ZVlXWHVWaFRyWmVrTUVmR0VqbHdjWHpLLTVLNmNSU2NPcnNDVWpLWE9kYldITmdhOXQwTlgxcDJrOFpqUlpuUFJoMkdpZjk1TkxYYWh6Vk84UWk4Z2E0dXdqNHJWZFpZNE8tZ2pibTNLdW5rWW9iSk12N1FaREo0dHYzT2h0VkJuM2lxc3dfVmdyU3lXNUdrZ19MUmtiSWtldUNVcGo?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Kassab diz que equilíbrio fiscal definirá apoio do PSD a Lula","url":"https://news.google.com/rss/articles/CBMipwFBVV95cUxQOHh0akhoQzhCaTdoUnRmcW1KS2hYZmR4Smw1TXUzYm8yOGhsbHQ3Zm5jS3FRRzllSENLTVdiQl9IVXhiVWxMTVRUSjBvTVVXRnFZdEg1QzNtbm13NE5FaU03UGRQRjdGbnMzTTYyQnlWR0RGeDAzM3dLbmRjRExYWGFib2x4M0pQc1hhdVlpQUJmYUJzeEpMWXZnTzY0ckZCbWdjV3NzYw?oc=5","imagem":"","topicKey":"politica"}],"revistaoeste.com|politica":[{"titulo":"Lula pediu foto de cantora nua para advogado, diz agente da PF em livro","url":"https://news.google.com/rss/articles/CBMiqAFBVV95cUxPZV8wTGI3S0wwa1JpRHlpRFVUbVZibnpoUE9tMEFqQTJlX28yRFJUWlV1MGt0TVUxUDV4ODJXRzJJdy15ZWJkbG1zdXZtdDFCWkZ5cTFLdHViSm8yWjNhMXpIY3UwTHVlR2JtMTRXajNMV2JPX3h6LW55RTNCMEFldjBqU1pNR3dNRDcxVkNvNHRjbHdQM1BEa21HeGdxV0M5cGUzdTd5SUw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Governo adia decreto sobre fim da escala 6x1","url":"https://news.google.com/rss/articles/CBMihgFBVV95cUxNYm5kSHBpWU45eDEzeVN4aHJvTVgyRnFLMlA2RTR0QzhnUWN4anJVMmZVaHUwcVJBVUJRbmVaZzhBWklNbUFvajZUZXdxdmp3ZkdZZndIQldVNEdLellpaXpELU1VTExDQ0N0NVFvR3VsQjRYN0pPYjJja0NqV1ZjeUx1a0NJZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Tarcísio comenta possível candidatura de Flávio em 2030","url":"https://news.google.com/rss/articles/CBMilAFBVV95cUxPd21pTkFIWEVocWZXQ3JrVG4tMjVEYW1jcXlWMWtJVUdXRFhIbjRvT1h3S3dBQmV1eEFtbzRib3BEQm1ONTNwVG9GNjlrRVlsczFUN0xhYjJUOUM0UTlJUVZyQTFURTZqQnJsNTlIczlsNkVKbEtINmR2cUludHJzbE9abEY4OGRHNnA3UnNKYVVpSmxV?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Janones usou verba da Câmara para fazer campanha com Lula em Minas, diz site","url":"https://news.google.com/rss/articles/CBMiowFBVV95cUxQVmV4SDRTV2ltdk81T0M4WFJYLWk1czBRU1JGd1IxcVlqRndZVXFmUWJHc2h0YVF5S0VYZ09NaEFQeFRDT2M3aXFkUFFGVzJncnBzOFFHa3k3MlZ3TmE0SWcxZk5BUDhLS2dkRDlDZTJScEhOeU14YVd5RVVrNVJpd3ZnelZ6aTRUSng1a0JLN2lwVmlIUnVzTFFFME9RZTV5VUVj?oc=5","imagem":"","topicKey":"politica"},{"titulo":"PL reúne bancada para discutir apoio a Motta e cargos na Câmara","url":"https://news.google.com/rss/articles/CBMinwFBVV95cUxNVlhtWnVtdndOMFhCOVRBdGRNT2RqaUY2em1YMlAzeUd1WHhKM2tuOWMycEc0eU5oc2JiMXN3RFc4QUwtcVdYT05aODg0YWFfR1hVaktSeTdJWUpPUnNpTHZGc2QzSnVqNXBQNEwtNFVZMWZBdlZYU0N0OEpHQ09NSmRIQVRCSDR5ZHAtTHUtRmNsS3RxWkp1SzAtTXFXSFU?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Os mil dias de Filipe Martins na prisão","url":"https://news.google.com/rss/articles/CBMif0FVX3lxTE92cDUzbGVvN3dtcENGdE1ubkE3QWhNSURfcENqXzBTM0xvYTZvYXJIb213MUVId0F3LXdYcTRidXN1S3dPaFM2V0lJWlJ6dDk4dWJVTE9fWVYzWVBXdWQ4SmlnM0pxU3dlejQ1UlpHRHlkSnNOV3hJdXR6c0dYVlU?oc=5","imagem":"","topicKey":"politica"}],"revistaoeste.com|all":[{"titulo":"Lula pediu foto de cantora nua para advogado, diz agente da PF em livro","url":"https://news.google.com/rss/articles/CBMiqAFBVV95cUxPZV8wTGI3S0wwa1JpRHlpRFVUbVZibnpoUE9tMEFqQTJlX28yRFJUWlV1MGt0TVUxUDV4ODJXRzJJdy15ZWJkbG1zdXZtdDFCWkZ5cTFLdHViSm8yWjNhMXpIY3UwTHVlR2JtMTRXajNMV2JPX3h6LW55RTNCMEFldjBqU1pNR3dNRDcxVkNvNHRjbHdQM1BEa21HeGdxV0M5cGUzdTd5SUw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Governo adia decreto sobre fim da escala 6x1","url":"https://news.google.com/rss/articles/CBMihgFBVV95cUxNYm5kSHBpWU45eDEzeVN4aHJvTVgyRnFLMlA2RTR0QzhnUWN4anJVMmZVaHUwcVJBVUJRbmVaZzhBWklNbUFvajZUZXdxdmp3ZkdZZndIQldVNEdLellpaXpELU1VTExDQ0N0NVFvR3VsQjRYN0pPYjJja0NqV1ZjeUx1a0NJZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Tarcísio comenta possível candidatura de Flávio em 2030","url":"https://news.google.com/rss/articles/CBMilAFBVV95cUxPd21pTkFIWEVocWZXQ3JrVG4tMjVEYW1jcXlWMWtJVUdXRFhIbjRvT1h3S3dBQmV1eEFtbzRib3BEQm1ONTNwVG9GNjlrRVlsczFUN0xhYjJUOUM0UTlJUVZyQTFURTZqQnJsNTlIczlsNkVKbEtINmR2cUludHJzbE9abEY4OGRHNnA3UnNKYVVpSmxV?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Janones usou verba da Câmara para fazer campanha com Lula em Minas, diz site","url":"https://news.google.com/rss/articles/CBMiowFBVV95cUxQVmV4SDRTV2ltdk81T0M4WFJYLWk1czBRU1JGd1IxcVlqRndZVXFmUWJHc2h0YVF5S0VYZ09NaEFQeFRDT2M3aXFkUFFGVzJncnBzOFFHa3k3MlZ3TmE0SWcxZk5BUDhLS2dkRDlDZTJScEhOeU14YVd5RVVrNVJpd3ZnelZ6aTRUSng1a0JLN2lwVmlIUnVzTFFFME9RZTV5VUVj?oc=5","imagem":"","topicKey":"politica"},{"titulo":"PL reúne bancada para discutir apoio a Motta e cargos na Câmara","url":"https://news.google.com/rss/articles/CBMinwFBVV95cUxNVlhtWnVtdndOMFhCOVRBdGRNT2RqaUY2em1YMlAzeUd1WHhKM2tuOWMycEc0eU5oc2JiMXN3RFc4QUwtcVdYT05aODg0YWFfR1hVaktSeTdJWUpPUnNpTHZGc2QzSnVqNXBQNEwtNFVZMWZBdlZYU0N0OEpHQ09NSmRIQVRCSDR5ZHAtTHUtRmNsS3RxWkp1SzAtTXFXSFU?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Os mil dias de Filipe Martins na prisão","url":"https://news.google.com/rss/articles/CBMif0FVX3lxTE92cDUzbGVvN3dtcENGdE1ubkE3QWhNSURfcENqXzBTM0xvYTZvYXJIb213MUVId0F3LXdYcTRidXN1S3dPaFM2V0lJWlJ6dDk4dWJVTE9fWVYzWVBXdWQ4SmlnM0pxU3dlejQ1UlpHRHlkSnNOV3hJdXR6c0dYVlU?oc=5","imagem":"","topicKey":"politica"}],"brasilparalelo.com.br|politica":[{"titulo":"Brasil Paralelo","url":"https://news.google.com/rss/articles/CBMiSkFVX3lxTE5fYldLWDJGMzR0UHZZbmpnQUpjZ3lSaFdOamZSamtjdWk0ZXowbWZJakpIcXR4d0dNeHozU000TGFuV3czb25rNVRR?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Veja o que disse Flávio Bolsonaro em entrevista para o New York Times","url":"https://news.google.com/rss/articles/CBMinwFBVV95cUxPdWpwSmdITExUYVRBdHZ4engzc2lvdDY0TXY0a3N4bk5CMS0zeV9BcmRPckV4bnJINWZsMnJ5TUdVcFFOSE12UmFrWGR1SVVCTm9kaXJxNU5yMU9HZkw2RW5EWGtYckRCMTF4RkZFVnRWcTNYQ3o1SEIteThKeU1KRHBFWGtUTllrbExXM3VFNnFEOTJHclJzb182WG5lYk0?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Líder de gangue do Haiti pede que a ONU pare Bukele","url":"https://news.google.com/rss/articles/CBMimgFBVV95cUxPbUJPUk9WeVFZOGVIX3BPNWg3YlI2YnJ3a3dLblRpSHExU3ZuX3lvODFaOEhXdVhIRm5ya2thaEI4SlZLQmVGM1lBQjhkZmRXUnZjXy1WeEpwZVZPVmVBLVFsUmVxZHhkQi1Odlk0UnRFanZ3cG5QQXd4RjBlUHc1cXBXbUxpbFBwaHdqMXgxbTRqaExBNC1WZ3RB?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Entenda o esquema de espionagem contra o CEO da Nvidia","url":"https://news.google.com/rss/articles/CBMingFBVV95cUxQbUJDdkNNS0t0bjFoa0tYVURkazlCRHRzMVZvWXRUeXBrRVJiQnNWYWdEMTc0dE5VbDNRelh6WmgtbU1sdU1lVk9pWVloeXhMamVKT3ljSHk1Rzg3aU1vdFRkVlJsMWUtelo2MHlNWEF4VU9XOWFWSUl0eVF2WWVDRlBKakpaNW1oVzAwM2V3VHFlVWxyWmVyUFZlRlZFZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Questões do Enem 2026 elogiam MST e criticam agronegócio","url":"https://news.google.com/rss/articles/CBMiggFBVV95cUxPRWh6MDk3T2JyNTR0T0ZFamF2cXc2THBOcGlXZ1VXZnVlalNNUTJtUkYtWXpJRVZHU2N2Qjh6QV9hVXcwVFJadHF1N2paa1I2MTMzek1oX2RKWTlwSE4wUkFzLTdpSmc2dFZZT2pXUWU5R09kNHN3Z3RXaGYwMTIwUUtn?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Presidente do Paraguai sofre impeachment em meio a escândalo financeiro","url":"https://news.google.com/rss/articles/CBMiiwFBVV95cUxPTHBvXzEyTU1GY3VaYnJWektlS1pBSjNGZVJKRDdUWTQ4YUZJNmpvd1REOU9wOWZmRDRLZ1Y0Z3JXYzN5SmcxX1ZuVHFTSnRsakJ1ekszbmFNYWZPSzBfMFpXaUJfVDZGbG9fNGp0eXR3ODZtRDd0Mnl2RVBCMmd5cWhnYXl2ZVoxMV9B?oc=5","imagem":"","topicKey":"politica"}],"brasilparalelo.com.br|all":[{"titulo":"Brasil Paralelo","url":"https://news.google.com/rss/articles/CBMiSkFVX3lxTE5fYldLWDJGMzR0UHZZbmpnQUpjZ3lSaFdOamZSamtjdWk0ZXowbWZJakpIcXR4d0dNeHozU000TGFuV3czb25rNVRR?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Veja o que disse Flávio Bolsonaro em entrevista para o New York Times","url":"https://news.google.com/rss/articles/CBMinwFBVV95cUxPdWpwSmdITExUYVRBdHZ4engzc2lvdDY0TXY0a3N4bk5CMS0zeV9BcmRPckV4bnJINWZsMnJ5TUdVcFFOSE12UmFrWGR1SVVCTm9kaXJxNU5yMU9HZkw2RW5EWGtYckRCMTF4RkZFVnRWcTNYQ3o1SEIteThKeU1KRHBFWGtUTllrbExXM3VFNnFEOTJHclJzb182WG5lYk0?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Líder de gangue do Haiti pede que a ONU pare Bukele","url":"https://news.google.com/rss/articles/CBMimgFBVV95cUxPbUJPUk9WeVFZOGVIX3BPNWg3YlI2YnJ3a3dLblRpSHExU3ZuX3lvODFaOEhXdVhIRm5ya2thaEI4SlZLQmVGM1lBQjhkZmRXUnZjXy1WeEpwZVZPVmVBLVFsUmVxZHhkQi1Odlk0UnRFanZ3cG5QQXd4RjBlUHc1cXBXbUxpbFBwaHdqMXgxbTRqaExBNC1WZ3RB?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Entenda o esquema de espionagem contra o CEO da Nvidia","url":"https://news.google.com/rss/articles/CBMingFBVV95cUxQbUJDdkNNS0t0bjFoa0tYVURkazlCRHRzMVZvWXRUeXBrRVJiQnNWYWdEMTc0dE5VbDNRelh6WmgtbU1sdU1lVk9pWVloeXhMamVKT3ljSHk1Rzg3aU1vdFRkVlJsMWUtelo2MHlNWEF4VU9XOWFWSUl0eVF2WWVDRlBKakpaNW1oVzAwM2V3VHFlVWxyWmVyUFZlRlZFZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Questões do Enem 2026 elogiam MST e criticam agronegócio","url":"https://news.google.com/rss/articles/CBMiggFBVV95cUxPRWh6MDk3T2JyNTR0T0ZFamF2cXc2THBOcGlXZ1VXZnVlalNNUTJtUkYtWXpJRVZHU2N2Qjh6QV9hVXcwVFJadHF1N2paa1I2MTMzek1oX2RKWTlwSE4wUkFzLTdpSmc2dFZZT2pXUWU5R09kNHN3Z3RXaGYwMTIwUUtn?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Presidente do Paraguai sofre impeachment em meio a escândalo financeiro","url":"https://news.google.com/rss/articles/CBMiiwFBVV95cUxPTHBvXzEyTU1GY3VaYnJWektlS1pBSjNGZVJKRDdUWTQ4YUZJNmpvd1REOU9wOWZmRDRLZ1Y0Z3JXYzN5SmcxX1ZuVHFTSnRsakJ1ekszbmFNYWZPSzBfMFpXaUJfVDZGbG9fNGp0eXR3ODZtRDd0Mnl2RVBCMmd5cWhnYXl2ZVoxMV9B?oc=5","imagem":"","topicKey":"politica"}],"poder360.com.br|politica":[{"titulo":"\"Sei que será fiel ao povo\", disse Trump a Biden em carta","url":"https://news.google.com/rss/articles/CBMipgFBVV95cUxOa29ieVN6TmxNTFpsRTh2YlhCcUNHRm9tazlRQ3RqS05yX3NoUkpkdV96a3E1SW4xaGQ0U2ljQnE3VDNpREYxQU13Nzl6VW1XcE9zcDdIZ0Fsc2lYdVN6QkVONGRpZFVMSlBIdlZoMS1VU3BQTnNkU2NIWk9oNVpkRG9aQzBlNjdFZERSLXVDRVQydEZOSGU3T2lZeTQ0X281dmxNSVVn?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Lula corre para aprovar 5 propostas antes de novo Congresso","url":"https://news.google.com/rss/articles/CBMipAFBVV95cUxQX21qdS1yMU4tVXZKQ0U1TDVsRVVoTEpkUGVnMjJXV2NWdUxYdEtBS0hOT3FoU1EtSlZlcnlOTGJOTGgwWjY2OXp4UFkxT2F2cC0zMXpfRjZHWVQtSHdMV1JNYjdEQmdkUjdGMzJvT1hQMldyLTFzdVc1aVo2cDNnWU5JMHAyRWpfQW9CUm9VX0hpaXZ4ZFk0R2JLSFZ2c3B2TmEzRA?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Tarcísio minimiza críticas após falar em disputar o Planalto em 2030","url":"https://news.google.com/rss/articles/CBMirwFBVV95cUxPTnliSF9kT0dzWUZRNlF6Tm5wUUdBWnFTdzlRejRwS3hjOHlEUU04ZkxId3YwTHRRRWZKbFNYN0llYlpHM2Y1LWIzbGlKR05fV25aWnhNWTJrdHYySEYyby1scERjMG00aVdJdThZRkZwb3RPVS1JSmh6SnJNcUxhVWlnMmppcWdMckNmMU9pT0NpX3g0VUNoSnc1SmJiTDhXeDVOSS16OHM3TXB0bzc4?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Homem que filmou FHC diz que ex","url":"https://news.google.com/rss/articles/CBMiqwFBVV95cUxQMzdLRnNzdmNZTUJQNVVrRVJHT3F2dW9RRjI5cVg1alVoZFF0bUZzWUJpZk1oWGEzUGdZOVduY2NidEI3bEFYdmk5SXhTWlNfdi1MckJnQnlSMHZkajhPSDh1VV9WZ25oY0FLMURBbnprUVF2bTJxWm5ISTF3b1VUX0otSTYzQ3NUSktQMjhxOVY0djB3T2pyR0V0bVhOUWZITk9LU3pseWFlVWc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Efraim Filho coordenará campanha de Marinho à presidência do Senado","url":"https://news.google.com/rss/articles/CBMisgFBVV95cUxPeHQzcmNRYmY0dU92U3JOeGpTTG81SlFtdHFWaWRFNFhYWUkzWHRmcVdObkQtYmUta19XQllHR0Y3dl9MSVU1WmVFb2JNdnZkdGxBVHJ3cEh4cERXbFl6azRFV3paRTFOa1RRQ0hCX2l4TFd5R2hWYlJ6Q1JTMjlKenVEQ2Qybmg2NHhYdFdNMVlsUVJzVjVLTlZkb2VIejFlc0FJcWM4SFkxRlg1MkFFaU5R?oc=5","imagem":"","topicKey":"politica"},{"titulo":"PT quer aprovar Ministério da Segurança em 2026, mas prazo aperta","url":"https://news.google.com/rss/articles/CBMiqwFBVV95cUxQbGR5eVF5WlNJY2kyQlhJeHI0bVJUZXViWmZ4eEZJa2tWQXVULTB0cjVrTUZPQk1YdExpZEgwZl9wRzFRTVVfT1hIVFhQcmpNVkNRTzlISk1nbjgzOWhoa1QydGlFUjRUWlY5MU1kNkVRMHkySGlWWnFoYkJiaEtWeHpqalFnbmgtMTVlRFVxUk04dWd2TzNad2tDNTM0M0dCR0FXbm9SS2ZpTlE?oc=5","imagem":"","topicKey":"politica"}],"poder360.com.br|all":[{"titulo":"\"Sei que será fiel ao povo\", disse Trump a Biden em carta","url":"https://news.google.com/rss/articles/CBMipgFBVV95cUxOa29ieVN6TmxNTFpsRTh2YlhCcUNHRm9tazlRQ3RqS05yX3NoUkpkdV96a3E1SW4xaGQ0U2ljQnE3VDNpREYxQU13Nzl6VW1XcE9zcDdIZ0Fsc2lYdVN6QkVONGRpZFVMSlBIdlZoMS1VU3BQTnNkU2NIWk9oNVpkRG9aQzBlNjdFZERSLXVDRVQydEZOSGU3T2lZeTQ0X281dmxNSVVn?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Lula corre para aprovar 5 propostas antes de novo Congresso","url":"https://news.google.com/rss/articles/CBMipAFBVV95cUxQX21qdS1yMU4tVXZKQ0U1TDVsRVVoTEpkUGVnMjJXV2NWdUxYdEtBS0hOT3FoU1EtSlZlcnlOTGJOTGgwWjY2OXp4UFkxT2F2cC0zMXpfRjZHWVQtSHdMV1JNYjdEQmdkUjdGMzJvT1hQMldyLTFzdVc1aVo2cDNnWU5JMHAyRWpfQW9CUm9VX0hpaXZ4ZFk0R2JLSFZ2c3B2TmEzRA?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Tarcísio minimiza críticas após falar em disputar o Planalto em 2030","url":"https://news.google.com/rss/articles/CBMirwFBVV95cUxPTnliSF9kT0dzWUZRNlF6Tm5wUUdBWnFTdzlRejRwS3hjOHlEUU04ZkxId3YwTHRRRWZKbFNYN0llYlpHM2Y1LWIzbGlKR05fV25aWnhNWTJrdHYySEYyby1scERjMG00aVdJdThZRkZwb3RPVS1JSmh6SnJNcUxhVWlnMmppcWdMckNmMU9pT0NpX3g0VUNoSnc1SmJiTDhXeDVOSS16OHM3TXB0bzc4?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Homem que filmou FHC diz que ex","url":"https://news.google.com/rss/articles/CBMiqwFBVV95cUxQMzdLRnNzdmNZTUJQNVVrRVJHT3F2dW9RRjI5cVg1alVoZFF0bUZzWUJpZk1oWGEzUGdZOVduY2NidEI3bEFYdmk5SXhTWlNfdi1MckJnQnlSMHZkajhPSDh1VV9WZ25oY0FLMURBbnprUVF2bTJxWm5ISTF3b1VUX0otSTYzQ3NUSktQMjhxOVY0djB3T2pyR0V0bVhOUWZITk9LU3pseWFlVWc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Efraim Filho coordenará campanha de Marinho à presidência do Senado","url":"https://news.google.com/rss/articles/CBMisgFBVV95cUxPeHQzcmNRYmY0dU92U3JOeGpTTG81SlFtdHFWaWRFNFhYWUkzWHRmcVdObkQtYmUta19XQllHR0Y3dl9MSVU1WmVFb2JNdnZkdGxBVHJ3cEh4cERXbFl6azRFV3paRTFOa1RRQ0hCX2l4TFd5R2hWYlJ6Q1JTMjlKenVEQ2Qybmg2NHhYdFdNMVlsUVJzVjVLTlZkb2VIejFlc0FJcWM4SFkxRlg1MkFFaU5R?oc=5","imagem":"","topicKey":"politica"},{"titulo":"PT quer aprovar Ministério da Segurança em 2026, mas prazo aperta","url":"https://news.google.com/rss/articles/CBMiqwFBVV95cUxQbGR5eVF5WlNJY2kyQlhJeHI0bVJUZXViWmZ4eEZJa2tWQXVULTB0cjVrTUZPQk1YdExpZEgwZl9wRzFRTVVfT1hIVFhQcmpNVkNRTzlISk1nbjgzOWhoa1QydGlFUjRUWlY5MU1kNkVRMHkySGlWWnFoYkJiaEtWeHpqalFnbmgtMTVlRFVxUk04dWd2TzNad2tDNTM0M0dCR0FXbm9SS2ZpTlE?oc=5","imagem":"","topicKey":"politica"}],"cnnbrasil.com.br|politica":[{"titulo":"Dino decidirá até sexta (13) sobre regras de transição do fim da escala 6x1","url":"https://news.google.com/rss/articles/CBMisgFBVV95cUxNU0hwSHBCRXltTW1iSl80akt2ZjZFZVpkUl9SdkNtU01pbmtDRWFOMzhzNzRhRGxjM2FyalVqblg3eFlfMnd5SnBzM25fUzFwTkU5RExiLW8zLS1PZXFoX212Vm5WUmJhVWxGOE4zMkNXMkFyempnVWRaZlBybm16cmJwUjdGMXdJLUdqZFgyS0RRQmRFWS1RTURTeEtaZmFmSHZOakcwbFk5ei1FaC1wdlJB?oc=5","imagem":"","topicKey":"politica"},{"titulo":"PF instaura inquérito sobre uso de verba estrangeira na campanha de Flávio","url":"https://news.google.com/rss/articles/CBMiswFBVV95cUxOU0dTZ2hlOGVOdjNhRThSVXgxYUpMTFR1RGlEZ3BNZmc0SUF3TVZUV3FlVml0OFlETm5TNmM2MkFHWXhqbWZ2V3lPYXcwV0JIRkFDWnBORm5sR3ZCLTREaFlKWjlCNXF3NHo2NEtVQU9Sd1FmSEZQc1BJSksyTVh4QWdLWDRSVExORVVtZmIyanpmN3lzb01UR2tVeDVlYWU0V2tOWHhrUWJlTkYxMW8yZ1o4RQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Dino sinaliza flexibilização na distribuição de folgas após fim da 6x1","url":"https://news.google.com/rss/articles/CBMirgFBVV95cUxNaDg3cGFSTmc2UkoweDFWN3Awc2ZDZE1pQno1TXJLV28wWnhadmI1UzNoYnVzdW5vMnpJVEhrcVRkVkZjbXFGVlBlRjFwRkNIX0pHazMyeG5vVlRhVWRCMlRQMzdDRkh2V2wwWWJYU0oyQ0RkTWdYZ0E4cGlmTUVfcldyZGk0Mmh1TjVmNWF2MlV6dHVQSTZjVktmYnhCV2F5YXBhRWhIV0xMdE0xdEE?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Dino afasta redução imediata para 40h mesmo sem acordo sobre fim da 6x1","url":"https://news.google.com/rss/articles/CBMirwFBVV95cUxNaVRFaWRnZi1GdTNseWgwOV9RUkR1d0pWekc0U1hVbU5hNHB0dW5uc1psb01wTzYxVGhWRVlwNWh1QTN0ejM5RUZQLVp0YmlpWkhpWVhlZm8wMXhyZ2FIWjRaT1p5ejJuTE1XMXNWcGxJMGc5VkV4UDBFWFEtRVZrbDV0ZHlEWlRxc2hPRG9KekJkLXV6ZUR4bndPY3R5WGJiS1E1UndrNHNFWDdTMHA0?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Andrei Rodrigues se desfilia de associação dos delegados da PF","url":"https://news.google.com/rss/articles/CBMivAFBVV95cUxPZXdHVEx0SGRtQzlkeEJDQ2NvVzZIR2JObXk0MzhhY2Fjc1FvWTlvckV2Y2k1UDV0dThpYnBiTlYwZ2Ezc2dHemkzaE0yX1FjazJNOWxFZG1hREJiQm5jbnAtd0ZLWjBmaS04QzhkVlF4ajZlTWZIUlVoXzVhTEFMdjZONF9GSGF4TjhENGc5TFRuOUZoWl9kM19hUXRwbzRlaU12RXhpM29vUGctWE1VNTAydVdKQUhqWFdLcg?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Flávio tem o direito de concorrer em 2030, diz Tarcísio","url":"https://news.google.com/rss/articles/CBMimAFBVV95cUxPekVDMFk0a3lvWkF0cUlVdVF5RVhVdDVNRzZJUFlZSlprUEtWSURoRGFYeHFfTHU0V0YyUm1tZmZIazBXY1pVU3hTYURQTE8td003cUJrYjhjdjJpR0pWZlQ3UnBkUmJGNzJ4OXFmbXQ3OVNleFVnb1U2MzJSODlVaW4wNi1jdVR4UXFucWtKSXFZMjRxMVI3dQ?oc=5","imagem":"","topicKey":"politica"}],"cnnbrasil.com.br|all":[{"titulo":"Dino decidirá até sexta (13) sobre regras de transição do fim da escala 6x1","url":"https://news.google.com/rss/articles/CBMisgFBVV95cUxNU0hwSHBCRXltTW1iSl80akt2ZjZFZVpkUl9SdkNtU01pbmtDRWFOMzhzNzRhRGxjM2FyalVqblg3eFlfMnd5SnBzM25fUzFwTkU5RExiLW8zLS1PZXFoX212Vm5WUmJhVWxGOE4zMkNXMkFyempnVWRaZlBybm16cmJwUjdGMXdJLUdqZFgyS0RRQmRFWS1RTURTeEtaZmFmSHZOakcwbFk5ei1FaC1wdlJB?oc=5","imagem":"","topicKey":"politica"},{"titulo":"PF instaura inquérito sobre uso de verba estrangeira na campanha de Flávio","url":"https://news.google.com/rss/articles/CBMiswFBVV95cUxOU0dTZ2hlOGVOdjNhRThSVXgxYUpMTFR1RGlEZ3BNZmc0SUF3TVZUV3FlVml0OFlETm5TNmM2MkFHWXhqbWZ2V3lPYXcwV0JIRkFDWnBORm5sR3ZCLTREaFlKWjlCNXF3NHo2NEtVQU9Sd1FmSEZQc1BJSksyTVh4QWdLWDRSVExORVVtZmIyanpmN3lzb01UR2tVeDVlYWU0V2tOWHhrUWJlTkYxMW8yZ1o4RQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Dino sinaliza flexibilização na distribuição de folgas após fim da 6x1","url":"https://news.google.com/rss/articles/CBMirgFBVV95cUxNaDg3cGFSTmc2UkoweDFWN3Awc2ZDZE1pQno1TXJLV28wWnhadmI1UzNoYnVzdW5vMnpJVEhrcVRkVkZjbXFGVlBlRjFwRkNIX0pHazMyeG5vVlRhVWRCMlRQMzdDRkh2V2wwWWJYU0oyQ0RkTWdYZ0E4cGlmTUVfcldyZGk0Mmh1TjVmNWF2MlV6dHVQSTZjVktmYnhCV2F5YXBhRWhIV0xMdE0xdEE?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Dino afasta redução imediata para 40h mesmo sem acordo sobre fim da 6x1","url":"https://news.google.com/rss/articles/CBMirwFBVV95cUxNaVRFaWRnZi1GdTNseWgwOV9RUkR1d0pWekc0U1hVbU5hNHB0dW5uc1psb01wTzYxVGhWRVlwNWh1QTN0ejM5RUZQLVp0YmlpWkhpWVhlZm8wMXhyZ2FIWjRaT1p5ejJuTE1XMXNWcGxJMGc5VkV4UDBFWFEtRVZrbDV0ZHlEWlRxc2hPRG9KekJkLXV6ZUR4bndPY3R5WGJiS1E1UndrNHNFWDdTMHA0?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Andrei Rodrigues se desfilia de associação dos delegados da PF","url":"https://news.google.com/rss/articles/CBMivAFBVV95cUxPZXdHVEx0SGRtQzlkeEJDQ2NvVzZIR2JObXk0MzhhY2Fjc1FvWTlvckV2Y2k1UDV0dThpYnBiTlYwZ2Ezc2dHemkzaE0yX1FjazJNOWxFZG1hREJiQm5jbnAtd0ZLWjBmaS04QzhkVlF4ajZlTWZIUlVoXzVhTEFMdjZONF9GSGF4TjhENGc5TFRuOUZoWl9kM19hUXRwbzRlaU12RXhpM29vUGctWE1VNTAydVdKQUhqWFdLcg?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Flávio tem o direito de concorrer em 2030, diz Tarcísio","url":"https://news.google.com/rss/articles/CBMimAFBVV95cUxPekVDMFk0a3lvWkF0cUlVdVF5RVhVdDVNRzZJUFlZSlprUEtWSURoRGFYeHFfTHU0V0YyUm1tZmZIazBXY1pVU3hTYURQTE8td003cUJrYjhjdjJpR0pWZlQ3UnBkUmJGNzJ4OXFmbXQ3OVNleFVnb1U2MzJSODlVaW4wNi1jdVR4UXFucWtKSXFZMjRxMVI3dQ?oc=5","imagem":"","topicKey":"politica"}],"noticias.uol.com.br|politica":[{"titulo":"Sanches: Caso extraconjugal de CEO da Nvidia pode levar Trump a nova crise","url":"https://news.google.com/rss/articles/CBMi3AFBVV95cUxPaDgyWVdiSko0VkRiclJBM01JOTdyNTNVYWVqUWVYdmJzeU5VWUF6dGRPRk5TOU53amRfREc1UWtjZG1rUl9lMExSYWV2REF5TnpXblpKQ3lna1JwRnA4VHJJX1ZwZVBLbGxGSEx2Skh1QzNXY3JucUJlaDR5azU0WVFUSF83aW90U3JNcWJaaG9UNFJPSHdNSmdheDExOGhlczZBNExQcEpuTTRxTnRNOGJFR1VOeG9ZVmxTenlNcnJoUkNGbExzLV9OOF81anB1OVVFTzBSbklEQk9H?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Natália Portinari: PF faz buscas contra pais de deputado baiano e encontra valores em espécie","url":"https://news.google.com/rss/articles/CBMiqAFBVV95cUxOd1M2QkYtNVZKS1gya1EyQUROWjZmWE1kdUc4bzZVOE83TjhVQVYyX09xSDNKSkRyajBRWVpOMHdkY0xQWEpPNTAzMTV5UmNuVVBRNmlvM3lKTmRsMU5ERnpoanpLY3l6M3kweGRJTEFmWVg3VmNwbjJVbzZ4YTd3N3VXMUd6cTNkQzhubTNfUGJKLThjVmRjWHJuSDhERzBkeURvZ3J4ZUU?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Senado prevê 95 iPhones e 330 outros celulares a parlamentares e servidores","url":"https://news.google.com/rss/articles/CBMinAFBVV95cUxQLWRqSHRoVVcyR1RhR3dHOThNS0RjcUJ2WF9RSlpEUExVNFA0X0pmQUJQRC1Xb1UtMHRUdHRJWEtHaS05ZkV4el9ObjE0S0Vjc0haU25CNVRDMzdLWjNYZDZkS1p6VWxIelh0OUd5V1JMaFZpX1Y1ZWdhLThQbTc2Z3gyX3lpd0FwQ01rVXJYZTdjTWFmOTBVQUcwUEs?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Inquérito das fake news: o que acontece após arquivamento de Fachin","url":"https://news.google.com/rss/articles/CBMi0gFBVV95cUxQZk1FaExVSzVlVjZmalRzRElJeGp4VmFWZ0dGdzFJcDJzU1laZThRVVI0LTFGck5BdFhTekJ3cm02cXJuVXVOcjA4VDE4OGlrR1JnTGp1SVZjV29GUXhUOXk3aDRNbHR0U1UyT3R6cHJQb25xaDQ2UVQwcjdGakg5a2FVeXk0TXo4SEFoZ0EzeDM2SG9JSFZxSS1hVnc0NTM1UEdLc09LMUdGNTJ3SWtBVFpZNUtwaDY5UlB5Tm92WTJhY20zbHdmbzJYSlYyT05jOFE?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Moraes montou estrutura paralela no gabinete para inquérito das fake news","url":"https://news.google.com/rss/articles/CBMi2gFBVV95cUxNM3BDY09jTVZqTnRMTkF6cWVvT0NzMG5JckxqZUJ3cnNMVnotMEVMLWVKckVtU21jX1JxVm9ad19BLTdtVVI0bVhmd1RQaEVUSEtHSHlBTktqV0F2bElHeG9CZU8xWC1DWlVoWnN2elNScHFZN0prTGtJN2VXUjNsY2J5MTNaREJkMXZ5Vm4tVGZ5RG51RnpEN3UxMEE0X0VXYmJKbUZJWTdLUDUzMko0VWVJME11dXp2Rkh5ei1jSUh0ckQtdm84MFBoZndBWDRuWTc1X1UySjZDZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Judiciário recua de pedido extra de R$ 209 milhões para pagar penduricalhos","url":"https://news.google.com/rss/articles/CBMiuwFBVV95cUxOd0sxZVJDUnVjdXJjUXlfa0hQVVpkSUNVVnRwQVNSRDBXSGU2Ym5TdS1kOUlZYjB3RUF3Z1FrSGhIeHFtb0JvbFMycWhoY3NGZ0NGMEdGdjU0UTJ4c01NQnVfdE5EMnNycWtTR2puV0VESjVUUTJvZmJNSnNyRzJhQXpoNldUMXYzbEZWN3JlM0stNFFvMllkVlZQS0FwSUxEVmROQXROVG40UUpkNjJyeXFETGFwMlh0RkJr?oc=5","imagem":"","topicKey":"politica"}],"noticias.uol.com.br|all":[{"titulo":"Sanches: Caso extraconjugal de CEO da Nvidia pode levar Trump a nova crise","url":"https://news.google.com/rss/articles/CBMi3AFBVV95cUxPaDgyWVdiSko0VkRiclJBM01JOTdyNTNVYWVqUWVYdmJzeU5VWUF6dGRPRk5TOU53amRfREc1UWtjZG1rUl9lMExSYWV2REF5TnpXblpKQ3lna1JwRnA4VHJJX1ZwZVBLbGxGSEx2Skh1QzNXY3JucUJlaDR5azU0WVFUSF83aW90U3JNcWJaaG9UNFJPSHdNSmdheDExOGhlczZBNExQcEpuTTRxTnRNOGJFR1VOeG9ZVmxTenlNcnJoUkNGbExzLV9OOF81anB1OVVFTzBSbklEQk9H?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Natália Portinari: PF faz buscas contra pais de deputado baiano e encontra valores em espécie","url":"https://news.google.com/rss/articles/CBMiqAFBVV95cUxOd1M2QkYtNVZKS1gya1EyQUROWjZmWE1kdUc4bzZVOE83TjhVQVYyX09xSDNKSkRyajBRWVpOMHdkY0xQWEpPNTAzMTV5UmNuVVBRNmlvM3lKTmRsMU5ERnpoanpLY3l6M3kweGRJTEFmWVg3VmNwbjJVbzZ4YTd3N3VXMUd6cTNkQzhubTNfUGJKLThjVmRjWHJuSDhERzBkeURvZ3J4ZUU?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Senado prevê 95 iPhones e 330 outros celulares a parlamentares e servidores","url":"https://news.google.com/rss/articles/CBMinAFBVV95cUxQLWRqSHRoVVcyR1RhR3dHOThNS0RjcUJ2WF9RSlpEUExVNFA0X0pmQUJQRC1Xb1UtMHRUdHRJWEtHaS05ZkV4el9ObjE0S0Vjc0haU25CNVRDMzdLWjNYZDZkS1p6VWxIelh0OUd5V1JMaFZpX1Y1ZWdhLThQbTc2Z3gyX3lpd0FwQ01rVXJYZTdjTWFmOTBVQUcwUEs?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Inquérito das fake news: o que acontece após arquivamento de Fachin","url":"https://news.google.com/rss/articles/CBMi0gFBVV95cUxQZk1FaExVSzVlVjZmalRzRElJeGp4VmFWZ0dGdzFJcDJzU1laZThRVVI0LTFGck5BdFhTekJ3cm02cXJuVXVOcjA4VDE4OGlrR1JnTGp1SVZjV29GUXhUOXk3aDRNbHR0U1UyT3R6cHJQb25xaDQ2UVQwcjdGakg5a2FVeXk0TXo4SEFoZ0EzeDM2SG9JSFZxSS1hVnc0NTM1UEdLc09LMUdGNTJ3SWtBVFpZNUtwaDY5UlB5Tm92WTJhY20zbHdmbzJYSlYyT05jOFE?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Moraes montou estrutura paralela no gabinete para inquérito das fake news","url":"https://news.google.com/rss/articles/CBMi2gFBVV95cUxNM3BDY09jTVZqTnRMTkF6cWVvT0NzMG5JckxqZUJ3cnNMVnotMEVMLWVKckVtU21jX1JxVm9ad19BLTdtVVI0bVhmd1RQaEVUSEtHSHlBTktqV0F2bElHeG9CZU8xWC1DWlVoWnN2elNScHFZN0prTGtJN2VXUjNsY2J5MTNaREJkMXZ5Vm4tVGZ5RG51RnpEN3UxMEE0X0VXYmJKbUZJWTdLUDUzMko0VWVJME11dXp2Rkh5ei1jSUh0ckQtdm84MFBoZndBWDRuWTc1X1UySjZDZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Judiciário recua de pedido extra de R$ 209 milhões para pagar penduricalhos","url":"https://news.google.com/rss/articles/CBMiuwFBVV95cUxOd0sxZVJDUnVjdXJjUXlfa0hQVVpkSUNVVnRwQVNSRDBXSGU2Ym5TdS1kOUlZYjB3RUF3Z1FrSGhIeHFtb0JvbFMycWhoY3NGZ0NGMEdGdjU0UTJ4c01NQnVfdE5EMnNycWtTR2puV0VESjVUUTJvZmJNSnNyRzJhQXpoNldUMXYzbEZWN3JlM0stNFFvMllkVlZQS0FwSUxEVmROQXROVG40UUpkNjJyeXFETGFwMlh0RkJr?oc=5","imagem":"","topicKey":"politica"}],"metropoles.com|politica":[{"titulo":"Nikolas quer convocar ministro de Lula por \"agenda de esquerda\" no Enem","url":"https://news.google.com/rss/articles/CBMiuAFBVV95cUxNUDJYbnV3RWFMQ1VHbWhxby00OFJMbW1ibTRFaGNWSnFlUnFrLTRWdjF2VnVxSzF1ZXI5TnhWcW84V0tEX0Z0NmVLMmN5NGpSVnByTUhnQmdpRFNYaWl1LVYwYjRId0o3WnZxRE9Nbkp5eFpEYU4weC12VF9GQVEzcm5KS29sX3BYOFFOd2RsUmVFeGtUZENwYnVRZV9acTl1dnpfZHVVWGdXOG9IbjNZVXAtU3FtQ1N6?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Haddad e Tebet são cotados por diplomatas para chefiar o Itamaraty","url":"https://news.google.com/rss/articles/CBMiuAFBVV95cUxOeHk1TUJjWnliSFI4TjY4U0hBYzExaE1UbXdzVWk0Q1I0NEJLVUtNSlZ0M3hIbGJSZ0dTS2lHb21qbmp6UGk4WXJ4YUhaUE02MENBcHpmNnFJMnQ2algwVDNPRWdlVUZyRXdzbUdkRnFtU0N0RWkwWFZ2b2RWX1I0MlVHRzNtRG9WM0ZPUFBIbDdYUTNmTTdLVFB3NVAySWdBM2YwRy1nbnZ5Rjc3aTJZU0JSd1VZcndP?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Deputada do PT obtém medida protetiva contra colega do PL eleito pelo Ceará","url":"https://news.google.com/rss/articles/CBMirgFBVV95cUxPLTlYWXFvY0NEVGUxWVFDMHdLbjlYS0tGQ1hiSklyM3dHSEJUd2xWVkk2RVY0SnNiVnpaREozZXVCYnhQZ3BEdWw2bjl6czFoNzBaSGdJbURvOFo2WVJaY011dS1vS0d2WklJcjVObkQ0VnA5UEN2TUZrZUFvT1lHdy1JUlhpS3JMazhiS2xFZmExbnVhWVpmYy10ZGZBZFJoa2NDR252NjRTLXY3Mnc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Marcos Lisboa teme falta de agenda fiscal estruturada para Lula 4","url":"https://news.google.com/rss/articles/CBMitgFBVV95cUxNa3k4VTV0ZDhybE1JdERPZXEwV0pYZmJYZ0tBNWZsaXNYLWtDUmJiaXJ2cEpwLXpBT0hYaHBRZ0MxUjk3UlJrZjlHT0RMODd4WUhxV3QxX1JHZlRXa2VtcEh6NjlqOEloVmFFMjczZEI0VnFvVXo0X1Z6ei1BS2haRmtmRExkZm9ySGU5b3ktZ1psSi01ckdRMnNiZ2pkUHhObmdCSUpDTXQ5QjFhWHdISDg2R1IxZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"União Europeia sinaliza intenção de firmar cúpula com o Brasil em 2027","url":"https://news.google.com/rss/articles/CBMipgFBVV95cUxNb1ItaGJRSnphUDRSTDRuNGpyWWsyUGxhX0xqUVFNOUMyTlQ2SGlTamM3SWR4X1BRQThqbTJlQVB0V1o5T3Y5dk5kRTdabGM4REdxS1c5Q2pYcjJTTXZTM25iTmlXZkhVT1IwM2xJQ2RRX1dSY1pjZWp4dFVmNmotVW1SNFR0S0U5cm5qZUdZN2xNaDhxZGRiblN6ZmRIWTg1amxLLXVR?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Celso Portiolli ameaça processar internautas em meio à polêmica política","url":"https://news.google.com/rss/articles/CBMisgFBVV95cUxQaHI1YzRCRVFZTDZqZk1ISkc2UVlVY3lsX09qQnRFZk4ta1UxOWg1QUhCR3duajd3blduNWxBd19pRGtCbUVrU1hsYU5pZlVPRzJVaFUtZTIxaDZ1TVhTNVY2OVZIQkRkVlJnZWZjU3kxZ1NWRXBJbWZGclZybmRMVUlSOHNtd3N2RGZncDZMUy0ySUs2Sy1lTi1zcFlxSndzRW9fYXVneXhma19jZGJZZjR3?oc=5","imagem":"","topicKey":"politica"}],"metropoles.com|all":[{"titulo":"Nikolas quer convocar ministro de Lula por \"agenda de esquerda\" no Enem","url":"https://news.google.com/rss/articles/CBMiuAFBVV95cUxNUDJYbnV3RWFMQ1VHbWhxby00OFJMbW1ibTRFaGNWSnFlUnFrLTRWdjF2VnVxSzF1ZXI5TnhWcW84V0tEX0Z0NmVLMmN5NGpSVnByTUhnQmdpRFNYaWl1LVYwYjRId0o3WnZxRE9Nbkp5eFpEYU4weC12VF9GQVEzcm5KS29sX3BYOFFOd2RsUmVFeGtUZENwYnVRZV9acTl1dnpfZHVVWGdXOG9IbjNZVXAtU3FtQ1N6?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Haddad e Tebet são cotados por diplomatas para chefiar o Itamaraty","url":"https://news.google.com/rss/articles/CBMiuAFBVV95cUxOeHk1TUJjWnliSFI4TjY4U0hBYzExaE1UbXdzVWk0Q1I0NEJLVUtNSlZ0M3hIbGJSZ0dTS2lHb21qbmp6UGk4WXJ4YUhaUE02MENBcHpmNnFJMnQ2algwVDNPRWdlVUZyRXdzbUdkRnFtU0N0RWkwWFZ2b2RWX1I0MlVHRzNtRG9WM0ZPUFBIbDdYUTNmTTdLVFB3NVAySWdBM2YwRy1nbnZ5Rjc3aTJZU0JSd1VZcndP?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Deputada do PT obtém medida protetiva contra colega do PL eleito pelo Ceará","url":"https://news.google.com/rss/articles/CBMirgFBVV95cUxPLTlYWXFvY0NEVGUxWVFDMHdLbjlYS0tGQ1hiSklyM3dHSEJUd2xWVkk2RVY0SnNiVnpaREozZXVCYnhQZ3BEdWw2bjl6czFoNzBaSGdJbURvOFo2WVJaY011dS1vS0d2WklJcjVObkQ0VnA5UEN2TUZrZUFvT1lHdy1JUlhpS3JMazhiS2xFZmExbnVhWVpmYy10ZGZBZFJoa2NDR252NjRTLXY3Mnc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Marcos Lisboa teme falta de agenda fiscal estruturada para Lula 4","url":"https://news.google.com/rss/articles/CBMitgFBVV95cUxNa3k4VTV0ZDhybE1JdERPZXEwV0pYZmJYZ0tBNWZsaXNYLWtDUmJiaXJ2cEpwLXpBT0hYaHBRZ0MxUjk3UlJrZjlHT0RMODd4WUhxV3QxX1JHZlRXa2VtcEh6NjlqOEloVmFFMjczZEI0VnFvVXo0X1Z6ei1BS2haRmtmRExkZm9ySGU5b3ktZ1psSi01ckdRMnNiZ2pkUHhObmdCSUpDTXQ5QjFhWHdISDg2R1IxZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"União Europeia sinaliza intenção de firmar cúpula com o Brasil em 2027","url":"https://news.google.com/rss/articles/CBMipgFBVV95cUxNb1ItaGJRSnphUDRSTDRuNGpyWWsyUGxhX0xqUVFNOUMyTlQ2SGlTamM3SWR4X1BRQThqbTJlQVB0V1o5T3Y5dk5kRTdabGM4REdxS1c5Q2pYcjJTTXZTM25iTmlXZkhVT1IwM2xJQ2RRX1dSY1pjZWp4dFVmNmotVW1SNFR0S0U5cm5qZUdZN2xNaDhxZGRiblN6ZmRIWTg1amxLLXVR?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Celso Portiolli ameaça processar internautas em meio à polêmica política","url":"https://news.google.com/rss/articles/CBMisgFBVV95cUxQaHI1YzRCRVFZTDZqZk1ISkc2UVlVY3lsX09qQnRFZk4ta1UxOWg1QUhCR3duajd3blduNWxBd19pRGtCbUVrU1hsYU5pZlVPRzJVaFUtZTIxaDZ1TVhTNVY2OVZIQkRkVlJnZWZjU3kxZ1NWRXBJbWZGclZybmRMVUlSOHNtd3N2RGZncDZMUy0ySUs2Sy1lTi1zcFlxSndzRW9fYXVneXhma19jZGJZZjR3?oc=5","imagem":"","topicKey":"politica"}],"nexojornal.com.br|politica":[{"titulo":"Amazonas: rearranjo sob as lideranças tradicionais","url":"https://news.google.com/rss/articles/CBMikgFBVV95cUxOdEpGMWxYU2R5Z1RaenhPaVd5Y1FzaXNiZ1ZyNlRRdkxIczZobEIteXg0cFQxTlZVRTliSEJtUVBZN0lzNmh5R2J1cklfWEFBNUxzVkRURXMtT09UOGVPOW1CbnBCTm10Y0Q5WEhDVjB0UlFaQnUzZ3BpSlI0enVMNGtjYXpoc2tmQzNHcVNSbk5oZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"O que Lula mudou no Judiciário em 2004. E o que defende agora","url":"https://news.google.com/rss/articles/CBMimAFBVV95cUxOWFExalFHUm1FQ2JCY3Y4Nlh3SzhEc2s1TFU5bEd2MVFwXzJkcHhZQ01lMTJrU3c5d244aXZLMVFYQm1rZjBvSG94Q0VoZmNRbXBldGtyM2NQNE15NlltaVE0Y1dNeVVSMjg3MFY4dUlabFVMQzdkYjFXSXJpLXBSdmFIdlhyck9jb1RGWW1SczVNRWo0a0FwSw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"O que é a ‘cultura rato’, que une jovens da periferia de Recife","url":"https://news.google.com/rss/articles/CBMipwFBVV95cUxPLVI2UUtfSUNYWFozaTZQN0ZWVkJSSXZ5RnFrck9OQkpycGQtNTkyNHhLZVloNkxiLVZWYnRuVWpLOHcwQkJDZGlIQ1BvaWU0X0Q5RThjWi1BZ05zb2xyaW5OT3J2dWlBUWs4TksyOVQ0MUVKRWdvZkFzbTdiODFjcmdsczRUOUlMYVZJY1dKZTVCbTRrMW1QM25fQVFPbkpfYnZzM2ltYw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Adivinhe pela imagem de satélite como cada local votou no 2º turno","url":"https://news.google.com/rss/articles/CBMikwFBVV95cUxNRzNWbktCNjI5RnA3SGJKMVJZcWp5RTdMQlhlQVhqckpKRnNPWUtWLTN1S1FYUHZvejRhdHhQaXMzZU1nLVo3VjFqSUhsaTUwZ1BzUG8xRDd4cEYxcllkV0NSVmRreEVGYVduNDlLby1OLUVyTWZ5UldwLUtrVmtLb1hQSXhmUHdmSjg4dUNzUkYzT1k?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Por que o voto distrital sempre volta ao debate no Brasil","url":"https://news.google.com/rss/articles/CBMiqgFBVV95cUxPZjNvLU9ScWhvc2NRZWRRcXpLczZLUEdVUHp2aVhueDhoaktyUjN0MDI0U2VvUm1TYVgyQ0dWYnk4NXFpNTFwRThCWGJuWndKZVI5RnE0TU1MQlFEcS1iVGI0blBzbmRDdDd4aU5OTnRIZ1BITE10OXVzWE9vVUQ3b05FOGF0MlRCRkVFT0gwSEpHRHZtS1lMMHk2b0ktVEhoWWh2dFVpZjJ0UQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Como a América Latina chega à COP31, na Turquia","url":"https://news.google.com/rss/articles/CBMimgFBVV95cUxPQUVCVi1sRVNqT3hTOGJ2RG11MVZ5WFVCRWE1YXdEc05fVHRsR3JjV0tONHFuMDRna3NDckJnODRDYmZNdG15b2pzX19HdEU5Zm82QWk4ejhhdFM4YUdSTDVrNTVMaGVPenVxUDlVTEZxX1FLVmo4ZzlQdkExdUZFV1l1dlppUUtpNy01Sm4zSnlLVkF2eDVCVG1n?oc=5","imagem":"","topicKey":"politica"}],"nexojornal.com.br|all":[{"titulo":"Amazonas: rearranjo sob as lideranças tradicionais","url":"https://news.google.com/rss/articles/CBMikgFBVV95cUxOdEpGMWxYU2R5Z1RaenhPaVd5Y1FzaXNiZ1ZyNlRRdkxIczZobEIteXg0cFQxTlZVRTliSEJtUVBZN0lzNmh5R2J1cklfWEFBNUxzVkRURXMtT09UOGVPOW1CbnBCTm10Y0Q5WEhDVjB0UlFaQnUzZ3BpSlI0enVMNGtjYXpoc2tmQzNHcVNSbk5oZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"O que Lula mudou no Judiciário em 2004. E o que defende agora","url":"https://news.google.com/rss/articles/CBMimAFBVV95cUxOWFExalFHUm1FQ2JCY3Y4Nlh3SzhEc2s1TFU5bEd2MVFwXzJkcHhZQ01lMTJrU3c5d244aXZLMVFYQm1rZjBvSG94Q0VoZmNRbXBldGtyM2NQNE15NlltaVE0Y1dNeVVSMjg3MFY4dUlabFVMQzdkYjFXSXJpLXBSdmFIdlhyck9jb1RGWW1SczVNRWo0a0FwSw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"O que é a ‘cultura rato’, que une jovens da periferia de Recife","url":"https://news.google.com/rss/articles/CBMipwFBVV95cUxPLVI2UUtfSUNYWFozaTZQN0ZWVkJSSXZ5RnFrck9OQkpycGQtNTkyNHhLZVloNkxiLVZWYnRuVWpLOHcwQkJDZGlIQ1BvaWU0X0Q5RThjWi1BZ05zb2xyaW5OT3J2dWlBUWs4TksyOVQ0MUVKRWdvZkFzbTdiODFjcmdsczRUOUlMYVZJY1dKZTVCbTRrMW1QM25fQVFPbkpfYnZzM2ltYw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Adivinhe pela imagem de satélite como cada local votou no 2º turno","url":"https://news.google.com/rss/articles/CBMikwFBVV95cUxNRzNWbktCNjI5RnA3SGJKMVJZcWp5RTdMQlhlQVhqckpKRnNPWUtWLTN1S1FYUHZvejRhdHhQaXMzZU1nLVo3VjFqSUhsaTUwZ1BzUG8xRDd4cEYxcllkV0NSVmRreEVGYVduNDlLby1OLUVyTWZ5UldwLUtrVmtLb1hQSXhmUHdmSjg4dUNzUkYzT1k?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Por que o voto distrital sempre volta ao debate no Brasil","url":"https://news.google.com/rss/articles/CBMiqgFBVV95cUxPZjNvLU9ScWhvc2NRZWRRcXpLczZLUEdVUHp2aVhueDhoaktyUjN0MDI0U2VvUm1TYVgyQ0dWYnk4NXFpNTFwRThCWGJuWndKZVI5RnE0TU1MQlFEcS1iVGI0blBzbmRDdDd4aU5OTnRIZ1BITE10OXVzWE9vVUQ3b05FOGF0MlRCRkVFT0gwSEpHRHZtS1lMMHk2b0ktVEhoWWh2dFVpZjJ0UQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Como a América Latina chega à COP31, na Turquia","url":"https://news.google.com/rss/articles/CBMimgFBVV95cUxPQUVCVi1sRVNqT3hTOGJ2RG11MVZ5WFVCRWE1YXdEc05fVHRsR3JjV0tONHFuMDRna3NDckJnODRDYmZNdG15b2pzX19HdEU5Zm82QWk4ejhhdFM4YUdSTDVrNTVMaGVPenVxUDlVTEZxX1FLVmo4ZzlQdkExdUZFV1l1dlppUUtpNy01Sm4zSnlLVkF2eDVCVG1n?oc=5","imagem":"","topicKey":"politica"}],"brasil247.com|politica":[{"titulo":"Política","url":"https://news.google.com/rss/articles/CBMiWkFVX3lxTE1MekI2aFJGZU5aUTBzTzJTR1ZrTURnbWlFZ09WejlnLUI2Sl9yMG16T2x2SjE0aGlLMXd4YWMxMDdtQURET1hPTExBYXRaM19BZ0VpVWxYRjJvUQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Cleitinho busca apoio de Lula e abre diálogo com PT após apoiar Flávio Bolsonaro","url":"https://news.google.com/rss/articles/CBMitgFBVV95cUxQaXNOR0lSZm1CcEFkdldJdmg4V3RQTFJDYjRmOFBjaDluZ2lWRnNEaGd3ZGJ2R2dVbVgyRkFkcmtzRGo4b3ZQbTRQdjYxc1B2NHl2Vll5REdLUDAyYV81a2ZTUG9KdUJsTmFrcGRhb2hTZ3ZzVEQ4MVgySVNTbFBOVjd0Wm5fZXVjZWZ3R3o3YUU0OFZzZDV3c3hUbDdlcDNYckpVZkR4QnVpeXNpZEdfeEhEZTliZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"EUA ratificam Brasil como um país de eleições livres e isolam alegações de fraude da família Bolsonaro","url":"https://news.google.com/rss/articles/CBMi0gFBVV95cUxPZU1oY25lTDdWM00tS19Yc0NGdzljaEtfMEFLbEZBWFNtejVQUWxjM2syRldqWno1cWVwdTlpYUZJLVllMDBTRWljT1NlUTNhZnlIQUlScUJwSVhHTFB4Nl9YZERiX2JXTUR2UlZNYWxER05PdTVYQUZibm9lLVpxNWlHZHJ6TTg1MzlTNjNydmxyTkxHc3NJQ0h2ZGcteVpzNHd4TW1TQ1I5VkNzN2ZZRTU5LU9EbU5sVXpxRzJKTno2UEZ3aVAySDZMZlZ5Tkx1aWc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Política de tarifa zero impulsiona presença de produtos africanos na 9ª CIIE em Shanghai","url":"https://news.google.com/rss/articles/CBMivwFBVV95cUxOcXZPUUw4b25hYngyOFB2QU9pV01fYTJqd0pJWWE2emQ4UFFYQ2ttTnpkU3g1U3cxOGI4aXNVT0lWTXBHdFBhYnVvWUhHR2h4eThfRW9pbzJzZi12YjBzZzY3MEpWTWFlLWQ0WlRlaENGQ2F0RWhNUkdheWRsRklHUWJwalRyVVFmZE5UVXRhdjkwMnVXbVExZTBZbklXZFhmUGdMMVlxbExWZkU5eVNBdmdoQU1Jc3lGeG1NUkxPbw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Lula destaca recorde histórico de queda no desmatamento e afirma que ‘preservação é escolha política’","url":"https://news.google.com/rss/articles/CBMi1wFBVV95cUxOekFwNFJ3WVdaSUw1UHJiMDlPWVFrckNNeFhPWEhoZnRuZndDdm54TVJBcjNDSGdxVW1pcG1QRkxZaDVQNlBrbjY1Mk5YMGc2ZDltMmlRaldyRHh6cGstbGp0cUZ1c21lQVYxLWx5VFVpOUtFQUo3cms0QV9tNlNPaXdCM1dUSTJDSHRxbjVxUTQ5R2FfYzlWUVJXSi15UTR6MFhYQW9mNTVGaVpNcUVTelR6QWpFZmh1V0M5QWl1UjE1V0dCcEdWTVE2ekZISDZwTG5ZVVhTZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Justiça Eleitoral aplica medidas cautelares contra deputado eleito por violência de gênero","url":"https://news.google.com/rss/articles/CBMiwAFBVV95cUxOOVFlckMyalZlRmo3MHR5ZGNzWTZPdmhoaExaMDVqSTFWNU9FQlZDdTk3N2tDSW51S0xmTDhfbktETktJaEVudDlnVEtZSWNod0R4YWdmVTR4UlJZakx3azNDUDdwLUM1QUpkZnE5Zm5VSllMMlNHQVhBNDE0aW9Hd1ZXM2JwT1E5bHY5RHJIZXlGTWE5SWlHY201empBY3FsQTdzOHVTLXZ1NGo1WUlYZjh5dzViUXplOUtGdkpYQWI?oc=5","imagem":"","topicKey":"politica"}],"brasil247.com|all":[{"titulo":"Política","url":"https://news.google.com/rss/articles/CBMiWkFVX3lxTE1MekI2aFJGZU5aUTBzTzJTR1ZrTURnbWlFZ09WejlnLUI2Sl9yMG16T2x2SjE0aGlLMXd4YWMxMDdtQURET1hPTExBYXRaM19BZ0VpVWxYRjJvUQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Cleitinho busca apoio de Lula e abre diálogo com PT após apoiar Flávio Bolsonaro","url":"https://news.google.com/rss/articles/CBMitgFBVV95cUxQaXNOR0lSZm1CcEFkdldJdmg4V3RQTFJDYjRmOFBjaDluZ2lWRnNEaGd3ZGJ2R2dVbVgyRkFkcmtzRGo4b3ZQbTRQdjYxc1B2NHl2Vll5REdLUDAyYV81a2ZTUG9KdUJsTmFrcGRhb2hTZ3ZzVEQ4MVgySVNTbFBOVjd0Wm5fZXVjZWZ3R3o3YUU0OFZzZDV3c3hUbDdlcDNYckpVZkR4QnVpeXNpZEdfeEhEZTliZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"EUA ratificam Brasil como um país de eleições livres e isolam alegações de fraude da família Bolsonaro","url":"https://news.google.com/rss/articles/CBMi0gFBVV95cUxPZU1oY25lTDdWM00tS19Yc0NGdzljaEtfMEFLbEZBWFNtejVQUWxjM2syRldqWno1cWVwdTlpYUZJLVllMDBTRWljT1NlUTNhZnlIQUlScUJwSVhHTFB4Nl9YZERiX2JXTUR2UlZNYWxER05PdTVYQUZibm9lLVpxNWlHZHJ6TTg1MzlTNjNydmxyTkxHc3NJQ0h2ZGcteVpzNHd4TW1TQ1I5VkNzN2ZZRTU5LU9EbU5sVXpxRzJKTno2UEZ3aVAySDZMZlZ5Tkx1aWc?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Política de tarifa zero impulsiona presença de produtos africanos na 9ª CIIE em Shanghai","url":"https://news.google.com/rss/articles/CBMivwFBVV95cUxOcXZPUUw4b25hYngyOFB2QU9pV01fYTJqd0pJWWE2emQ4UFFYQ2ttTnpkU3g1U3cxOGI4aXNVT0lWTXBHdFBhYnVvWUhHR2h4eThfRW9pbzJzZi12YjBzZzY3MEpWTWFlLWQ0WlRlaENGQ2F0RWhNUkdheWRsRklHUWJwalRyVVFmZE5UVXRhdjkwMnVXbVExZTBZbklXZFhmUGdMMVlxbExWZkU5eVNBdmdoQU1Jc3lGeG1NUkxPbw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Lula destaca recorde histórico de queda no desmatamento e afirma que ‘preservação é escolha política’","url":"https://news.google.com/rss/articles/CBMi1wFBVV95cUxOekFwNFJ3WVdaSUw1UHJiMDlPWVFrckNNeFhPWEhoZnRuZndDdm54TVJBcjNDSGdxVW1pcG1QRkxZaDVQNlBrbjY1Mk5YMGc2ZDltMmlRaldyRHh6cGstbGp0cUZ1c21lQVYxLWx5VFVpOUtFQUo3cms0QV9tNlNPaXdCM1dUSTJDSHRxbjVxUTQ5R2FfYzlWUVJXSi15UTR6MFhYQW9mNTVGaVpNcUVTelR6QWpFZmh1V0M5QWl1UjE1V0dCcEdWTVE2ekZISDZwTG5ZVVhTZw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Justiça Eleitoral aplica medidas cautelares contra deputado eleito por violência de gênero","url":"https://news.google.com/rss/articles/CBMiwAFBVV95cUxOOVFlckMyalZlRmo3MHR5ZGNzWTZPdmhoaExaMDVqSTFWNU9FQlZDdTk3N2tDSW51S0xmTDhfbktETktJaEVudDlnVEtZSWNod0R4YWdmVTR4UlJZakx3azNDUDdwLUM1QUpkZnE5Zm5VSllMMlNHQVhBNDE0aW9Hd1ZXM2JwT1E5bHY5RHJIZXlGTWE5SWlHY201empBY3FsQTdzOHVTLXZ1NGo1WUlYZjh5dzViUXplOUtGdkpYQWI?oc=5","imagem":"","topicKey":"politica"}],"apublica.org|politica":[{"titulo":"Políticos, empresários e a Meta estão por trás dos boicotes a eleitores do PT nas redes","url":"https://news.google.com/rss/articles/CBMitwFBVV95cUxPNkU5QnRkWW94OEd3V1pVUFQ1cDRTSEJQeDFDMkZZeUUzSTdkUFd4c3VZRDdyUGlEa243eXlqYTlfN1AxNk1XX1JfcldoX01mNHRweXFZdHRRLTYxN0ZWZm9lM19DeTdvbmRJbE1aeG5MaGVxdkpvOUluMU96TUVuU1ZLRUNyMlYyVjFSTnhYYlJSQ3JjTjdLcWZvdDVTV2E4c3o5RVliRmhSSEp5S1FaeGppLWowbnfSAbwBQVVfeXFMTkVPR1ZMcTZhOEt6SjEybTNLd1pNV05SV1Vnb2pXZW5vZHpVaVVHMndoTUJyajNJWWtZdWUzcDlWckhTOVJ3UHlaZ3V0QUV6QnBGSmo3Z0FaR2NReWlGQkRnX3NMWU5aQ1d4TmtZR0xRdl9KVFBKN1BWODlqZXF6SXZPbUVDWWU2M3ctSGFyU0E4UktkeVF1RUotQnhERnhLMnF6MjRUYUNUaXgwRnItcnl5cWxSdkItSXdDeng?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Brasileiro eleito nos EUA: Trump ajuda Flávio, que foge da Justiça, e deporta domésticas","url":"https://news.google.com/rss/articles/CBMinwFBVV95cUxPX2pvZFR5RVZRZnBHQl80Zlp0THVRbE14bF8wWkh5NmtLa0pHeGNnYTRXYmNQS0UydDJnblNDdEpURGh1bm5ENFdpWl96bmo2cC1mOVAyUHRfR3NXOHdWTTE1c244Vkl0T2VwQklERjlnSGUxZWU3NlZyMjk4a0lvblBRcWxYYWlseS1iV0x2enc5ZVVER0xUaGFVaXdVMlHSAaQBQVVfeXFMT0l3c1djWmh1Qm8zbE83c1VQZGZmejREQ0RRS0ZzU08yTnV6dFBNZWpveHZZWlBCWG0xVmFGMVJ4cUJGV05IVDU1LWhydzZObWx5UmdVOGRRRDhQLTRWOHQ4Y2NGUEVKNUFoc0NXbFRtMnprckJ1MHpGOGl2dGdzLVB3OVFSMjdHZDhtN1pEdXo5NngzY043dE5vY2IyN1d0MERYc00?oc=5","imagem":"","topicKey":"politica"},{"titulo":"O Lula venceu. E agora, haverá ajuste?","url":"https://news.google.com/rss/articles/CBMifEFVX3lxTE5JekFPc3ZhbnVWaW1Ddi1scEhoa3JfMWFDZThVQmZianhkTW5VYWtPTEZxdGlCbHdxZDk3YUFfcW9USTVvcVUwczhZSHRuay04V29GVkY1V3REU1daam84R1VmN2dGMjZWVnhEWGFtSjBka2Z2VGFBOV9zOTHSAYIBQVVfeXFMTlBuUTdYUGlxd1JNaGtWYlk4NlIzYWQ3Mjc4QWFQRWpZUFVIV0s1OFV3dlE3YmQzSFBGaUJLc0hDOENic1ZfTE9NeGMzMkUxc3ItY25KcXlZWU9KLWs0NFJzMkNkTVlBb29qVkQ4RmxlR2dGOFlRS1l6c1BDZFNhVUctdw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Tsunami azul nas midterms: será o fim da era Trump?","url":"https://news.google.com/rss/articles/CBMihgFBVV95cUxOVW1YMWoxUnhWeTk1THVCeVFlY0FFakM1YXBXSzhsSHFPb1ozMUZjZUtWUS1nczdhWUhHVXFtMTRIbzJDeTJNcTU5eXFXOHRKcHBPcGNQZzRWekdrM0RDN3ZpNlFiY0FXYk9kMHJLVkV5eUd6dTJqVUtXSmZicDBUc20tLXNGZ9IBiwFBVV95cUxNdWZsdVFmYlVzQ0V5dUY1aTdJdmFWTnFWTEp1MWszNXNuVFluMzRRYUs0eWxyX2oyMXpESW0xTXJnRWpobTZ2NHBlelV3ZkFqQmVjejRKMkNnX01fMUVBbUYwczRmbGR3ZjlwZktRVXhqRGZyMWRrNWNtakFKaFVfdEMtblFacDdQSWJF?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Derrota dos Republicanos nos EUA tem mais a ver com economia que democracia, diz socióloga","url":"https://news.google.com/rss/articles/CBMimgFBVV95cUxPNlZjNi1BTzFPYjR5WkFxeVU4RC1hdkNBUHEyM1phUjRGTDUwT240VTkxTDA0bFNJUWNzREpZbzgxOEVoOE1nSzFvVjl0MktwYUdNUnpYV3VNX3BJdXNORWE1aXdRZDBQd2VBTG1GbkFwNm5wWDNjOV9mNWQ1WjBJNC1sdThIazdlOE5hNTNpTU1BLWFGdG5NNXRR0gGfAUFVX3lxTE1uWkVlT1BvUXZDaGp4ZlBJdk5xUngxdHAyUWwxVnc3TmRoYldkMEVtNVJEclJHTjJ3b29HdDhfdFBXTzlha0c0TXV6eWs2TFNibDBOMnVLb1RWLXpDbjlOVlA1SlQyazRtZ2l2RjNBTWRCUzdidVpDWURMOWJKQ01vaVhQZUgwWVU0d2ZqZTBya202SElsWG12Qk9LaEE2Yw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Jejum, ‘perseguição’ e racismo religioso: as redes pró Flávio antes e depois da fuga","url":"https://news.google.com/rss/articles/CBMirwFBVV95cUxQdzRTNzlfMDdVdk9WbkhBRnhIV2VFV3R2LWRnWHJXYjhIdzNlXzVoalpqbTEwRzBQY21BVEJ0TFhZVl94UUtnSEl5a2k0c1Z5aFJoMjZaa3ZLdmwwNjJYMERHSzlGUjVhUVFaazk4TnVkYUh2bkhqOWp5ZlB5ZUNfT2tjS0UwV3ZtWjVpS0NaUGFUWEY2TkdzdFFIZktRdGlPdzRhenVqYkktZlZISERV0gG0AUFVX3lxTE9adkZseDYxMDVONFhJV0tsc0JoNnlHMlI5MzB4QmhrYVVib29mRG44SjVxTGphdDBCUHZDYUtPMkdIWERORTFQamp5dWpvVkVxQUhQb1hnN3ZIR2ZFTnBoMzJPS3VFWXp6UzZPNmF4M20tellpLWs1TVBQa1g5MDZkUk1DTGlHUHdleTdFWElHaW9FUVNPMnowMWNXc2R4eWlubGVwR21mVUVjYmVHWXJNTEJUUg?oc=5","imagem":"","topicKey":"politica"}],"apublica.org|all":[{"titulo":"Políticos, empresários e a Meta estão por trás dos boicotes a eleitores do PT nas redes","url":"https://news.google.com/rss/articles/CBMitwFBVV95cUxPNkU5QnRkWW94OEd3V1pVUFQ1cDRTSEJQeDFDMkZZeUUzSTdkUFd4c3VZRDdyUGlEa243eXlqYTlfN1AxNk1XX1JfcldoX01mNHRweXFZdHRRLTYxN0ZWZm9lM19DeTdvbmRJbE1aeG5MaGVxdkpvOUluMU96TUVuU1ZLRUNyMlYyVjFSTnhYYlJSQ3JjTjdLcWZvdDVTV2E4c3o5RVliRmhSSEp5S1FaeGppLWowbnfSAbwBQVVfeXFMTkVPR1ZMcTZhOEt6SjEybTNLd1pNV05SV1Vnb2pXZW5vZHpVaVVHMndoTUJyajNJWWtZdWUzcDlWckhTOVJ3UHlaZ3V0QUV6QnBGSmo3Z0FaR2NReWlGQkRnX3NMWU5aQ1d4TmtZR0xRdl9KVFBKN1BWODlqZXF6SXZPbUVDWWU2M3ctSGFyU0E4UktkeVF1RUotQnhERnhLMnF6MjRUYUNUaXgwRnItcnl5cWxSdkItSXdDeng?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Brasileiro eleito nos EUA: Trump ajuda Flávio, que foge da Justiça, e deporta domésticas","url":"https://news.google.com/rss/articles/CBMinwFBVV95cUxPX2pvZFR5RVZRZnBHQl80Zlp0THVRbE14bF8wWkh5NmtLa0pHeGNnYTRXYmNQS0UydDJnblNDdEpURGh1bm5ENFdpWl96bmo2cC1mOVAyUHRfR3NXOHdWTTE1c244Vkl0T2VwQklERjlnSGUxZWU3NlZyMjk4a0lvblBRcWxYYWlseS1iV0x2enc5ZVVER0xUaGFVaXdVMlHSAaQBQVVfeXFMT0l3c1djWmh1Qm8zbE83c1VQZGZmejREQ0RRS0ZzU08yTnV6dFBNZWpveHZZWlBCWG0xVmFGMVJ4cUJGV05IVDU1LWhydzZObWx5UmdVOGRRRDhQLTRWOHQ4Y2NGUEVKNUFoc0NXbFRtMnprckJ1MHpGOGl2dGdzLVB3OVFSMjdHZDhtN1pEdXo5NngzY043dE5vY2IyN1d0MERYc00?oc=5","imagem":"","topicKey":"politica"},{"titulo":"O Lula venceu. E agora, haverá ajuste?","url":"https://news.google.com/rss/articles/CBMifEFVX3lxTE5JekFPc3ZhbnVWaW1Ddi1scEhoa3JfMWFDZThVQmZianhkTW5VYWtPTEZxdGlCbHdxZDk3YUFfcW9USTVvcVUwczhZSHRuay04V29GVkY1V3REU1daam84R1VmN2dGMjZWVnhEWGFtSjBka2Z2VGFBOV9zOTHSAYIBQVVfeXFMTlBuUTdYUGlxd1JNaGtWYlk4NlIzYWQ3Mjc4QWFQRWpZUFVIV0s1OFV3dlE3YmQzSFBGaUJLc0hDOENic1ZfTE9NeGMzMkUxc3ItY25KcXlZWU9KLWs0NFJzMkNkTVlBb29qVkQ4RmxlR2dGOFlRS1l6c1BDZFNhVUctdw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Tsunami azul nas midterms: será o fim da era Trump?","url":"https://news.google.com/rss/articles/CBMihgFBVV95cUxOVW1YMWoxUnhWeTk1THVCeVFlY0FFakM1YXBXSzhsSHFPb1ozMUZjZUtWUS1nczdhWUhHVXFtMTRIbzJDeTJNcTU5eXFXOHRKcHBPcGNQZzRWekdrM0RDN3ZpNlFiY0FXYk9kMHJLVkV5eUd6dTJqVUtXSmZicDBUc20tLXNGZ9IBiwFBVV95cUxNdWZsdVFmYlVzQ0V5dUY1aTdJdmFWTnFWTEp1MWszNXNuVFluMzRRYUs0eWxyX2oyMXpESW0xTXJnRWpobTZ2NHBlelV3ZkFqQmVjejRKMkNnX01fMUVBbUYwczRmbGR3ZjlwZktRVXhqRGZyMWRrNWNtakFKaFVfdEMtblFacDdQSWJF?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Derrota dos Republicanos nos EUA tem mais a ver com economia que democracia, diz socióloga","url":"https://news.google.com/rss/articles/CBMimgFBVV95cUxPNlZjNi1BTzFPYjR5WkFxeVU4RC1hdkNBUHEyM1phUjRGTDUwT240VTkxTDA0bFNJUWNzREpZbzgxOEVoOE1nSzFvVjl0MktwYUdNUnpYV3VNX3BJdXNORWE1aXdRZDBQd2VBTG1GbkFwNm5wWDNjOV9mNWQ1WjBJNC1sdThIazdlOE5hNTNpTU1BLWFGdG5NNXRR0gGfAUFVX3lxTE1uWkVlT1BvUXZDaGp4ZlBJdk5xUngxdHAyUWwxVnc3TmRoYldkMEVtNVJEclJHTjJ3b29HdDhfdFBXTzlha0c0TXV6eWs2TFNibDBOMnVLb1RWLXpDbjlOVlA1SlQyazRtZ2l2RjNBTWRCUzdidVpDWURMOWJKQ01vaVhQZUgwWVU0d2ZqZTBya202SElsWG12Qk9LaEE2Yw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Jejum, ‘perseguição’ e racismo religioso: as redes pró Flávio antes e depois da fuga","url":"https://news.google.com/rss/articles/CBMirwFBVV95cUxQdzRTNzlfMDdVdk9WbkhBRnhIV2VFV3R2LWRnWHJXYjhIdzNlXzVoalpqbTEwRzBQY21BVEJ0TFhZVl94UUtnSEl5a2k0c1Z5aFJoMjZaa3ZLdmwwNjJYMERHSzlGUjVhUVFaazk4TnVkYUh2bkhqOWp5ZlB5ZUNfT2tjS0UwV3ZtWjVpS0NaUGFUWEY2TkdzdFFIZktRdGlPdzRhenVqYkktZlZISERV0gG0AUFVX3lxTE9adkZseDYxMDVONFhJV0tsc0JoNnlHMlI5MzB4QmhrYVVib29mRG44SjVxTGphdDBCUHZDYUtPMkdIWERORTFQamp5dWpvVkVxQUhQb1hnN3ZIR2ZFTnBoMzJPS3VFWXp6UzZPNmF4M20tellpLWs1TVBQa1g5MDZkUk1DTGlHUHdleTdFWElHaW9FUVNPMnowMWNXc2R4eWlubGVwR21mVUVjYmVHWXJNTEJUUg?oc=5","imagem":"","topicKey":"politica"}],"diariodocentrodomundo.com.br|politica":[{"titulo":"Laura Jordão, Autor em Diário do Centro do Mundo","url":"https://news.google.com/rss/articles/CBMiekFVX3lxTE5CekRsblk5ZUtKZ1BZOUp4dnVzTjlPUEdUUTRfZ3lJWUxoUDI1TWxEX1hjUXpyREJlSzc0UDlXbF82NEJfbWE0ZS1TVHFjbm1kOGl4dGRHaGpoZUZZNmRIaGZReHRhV1RFSjAwZGgyd3RGb1diUEw0ZmR3?oc=5","imagem":"","topicKey":"politica"},{"titulo":"O que a inédita vitória de Lula revela sobre as pesquisas e a política","url":"https://news.google.com/rss/articles/CBMisgFBVV95cUxNRGc1WjB3aUtwZi0yZzFaUnBqSGM1N3FFNE1YSWNaeVJRRjNhLW1FMVVDVE1mYjdfM2NIVEZMS0pYSHRmanN1RGpIN0prN3ZuU0NSdV9DcnU2bXF4SWROckNQWGJqVG55MUdnQndrQzdmVFJ4WlVqaS15bGdYOGFjMmFSTjdYX01QUWxDck95RDczWGtrLVgtVE1pa0tUelZVaEdTVndSRUVDd1RyMzRKdll3?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Justiça social e justiça climática são inseparáveis, diz cientista política que abre seminário do DCM","url":"https://news.google.com/rss/articles/CBMi2gFBVV95cUxOejVvNi1jaGpKX2NnT2l1d29BUWJuTjlnU1p5anoyV2dFQW00eGdJRWRwSHdnYWNUQ3MzbVVadnZzanFrQ25XNTYxTE0zWEhlVnRUaUtWYlc3Q3c2aHZLc01CTmgydm1hdFNpWk9Od2JGdVZkbDJDczh5aUh6b3JGYTJsb1pGR1dPUkFQZzNkcXltWmxPWkNwMm52LXdSVW1sWm40ZTVEbFFaRF84elY2b3BQSGJlY2IzNjc3cjRYa01NZmVKcE82a1pVRGZBX3RLaXRxWVZuQkRjdw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Uber e outras cinco empresas são notificadas por possível discriminação política","url":"https://news.google.com/rss/articles/CBMivwFBVV95cUxQY0ZLX0lUY0VvQVFLM1dpYnBDeGxUSVlQTVVaYzZMZC0xa3BsOVloNzV2b1RlMzlqdG41NklMUmtsczEteTR0NDQyUkdKeU1MNEJ2WUtHR2V1alFXSl81OFNWenNiSmR1REtqQjJLX3JvUWl5RDV2NjFYUW4xd192SU1JQmw2dFI1cVczYW9GanhvODJOU1dJdkdjT3BUaFFjZzIyZmlGV1Y2MmxveW1NMlVmR2hIeThiRGpLbnlGRQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Trump admite que deportações foram “duras demais” após derrota nas eleições","url":"https://news.google.com/rss/articles/CBMijgFBVV95cUxPT19wTGdzVW5MQlVZS2JYNWQ2S2M4RjlBTWJ6ZDZnMzNXSmk0cU93QkVtRGxCTkZjNlpHd0xCSFNxbi11SEhncXZmZUxySGdWelpOdjJDUl9NTXJ1TkRXdVd5YkZKYVFxRE5kU2ZyUVozc3l6WHVKRm5wekZpS3NoV2RtUXZsUUVNQUhuV3Z3?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Como o mercado está transformando a batalha por juros altos em um terceiro turno da eleição","url":"https://news.google.com/rss/articles/CBMizgFBVV95cUxPUFZGU1lVdnhfS3Z4NVFCdVdaRFJTdHJaelR0MzFwN09ha3VhZFRXOVFTSzFGTHZMYWtKM1VXcUdyODY4NEt4X092ejBWM3dSWndUR25IU2ppSFB5dG5NYUdGb2FkWWxPUEFnWEVRdkhSQTM5TDUwSFRhTHcycEFQaWxjdmNsdGtVMmRsNTZyeEJtOUZfWkVGaWZsZm55Y0ZwZjNKdUZ1OHJhbkY3a1UtZFFFZHh3Rk9ZdV9fNnN5aFpGb1VxWExSYVR6VG9JUQ?oc=5","imagem":"","topicKey":"politica"}],"diariodocentrodomundo.com.br|all":[{"titulo":"Laura Jordão, Autor em Diário do Centro do Mundo","url":"https://news.google.com/rss/articles/CBMiekFVX3lxTE5CekRsblk5ZUtKZ1BZOUp4dnVzTjlPUEdUUTRfZ3lJWUxoUDI1TWxEX1hjUXpyREJlSzc0UDlXbF82NEJfbWE0ZS1TVHFjbm1kOGl4dGRHaGpoZUZZNmRIaGZReHRhV1RFSjAwZGgyd3RGb1diUEw0ZmR3?oc=5","imagem":"","topicKey":"politica"},{"titulo":"O que a inédita vitória de Lula revela sobre as pesquisas e a política","url":"https://news.google.com/rss/articles/CBMisgFBVV95cUxNRGc1WjB3aUtwZi0yZzFaUnBqSGM1N3FFNE1YSWNaeVJRRjNhLW1FMVVDVE1mYjdfM2NIVEZMS0pYSHRmanN1RGpIN0prN3ZuU0NSdV9DcnU2bXF4SWROckNQWGJqVG55MUdnQndrQzdmVFJ4WlVqaS15bGdYOGFjMmFSTjdYX01QUWxDck95RDczWGtrLVgtVE1pa0tUelZVaEdTVndSRUVDd1RyMzRKdll3?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Justiça social e justiça climática são inseparáveis, diz cientista política que abre seminário do DCM","url":"https://news.google.com/rss/articles/CBMi2gFBVV95cUxOejVvNi1jaGpKX2NnT2l1d29BUWJuTjlnU1p5anoyV2dFQW00eGdJRWRwSHdnYWNUQ3MzbVVadnZzanFrQ25XNTYxTE0zWEhlVnRUaUtWYlc3Q3c2aHZLc01CTmgydm1hdFNpWk9Od2JGdVZkbDJDczh5aUh6b3JGYTJsb1pGR1dPUkFQZzNkcXltWmxPWkNwMm52LXdSVW1sWm40ZTVEbFFaRF84elY2b3BQSGJlY2IzNjc3cjRYa01NZmVKcE82a1pVRGZBX3RLaXRxWVZuQkRjdw?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Uber e outras cinco empresas são notificadas por possível discriminação política","url":"https://news.google.com/rss/articles/CBMivwFBVV95cUxQY0ZLX0lUY0VvQVFLM1dpYnBDeGxUSVlQTVVaYzZMZC0xa3BsOVloNzV2b1RlMzlqdG41NklMUmtsczEteTR0NDQyUkdKeU1MNEJ2WUtHR2V1alFXSl81OFNWenNiSmR1REtqQjJLX3JvUWl5RDV2NjFYUW4xd192SU1JQmw2dFI1cVczYW9GanhvODJOU1dJdkdjT3BUaFFjZzIyZmlGV1Y2MmxveW1NMlVmR2hIeThiRGpLbnlGRQ?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Trump admite que deportações foram “duras demais” após derrota nas eleições","url":"https://news.google.com/rss/articles/CBMijgFBVV95cUxPT19wTGdzVW5MQlVZS2JYNWQ2S2M4RjlBTWJ6ZDZnMzNXSmk0cU93QkVtRGxCTkZjNlpHd0xCSFNxbi11SEhncXZmZUxySGdWelpOdjJDUl9NTXJ1TkRXdVd5YkZKYVFxRE5kU2ZyUVozc3l6WHVKRm5wekZpS3NoV2RtUXZsUUVNQUhuV3Z3?oc=5","imagem":"","topicKey":"politica"},{"titulo":"Como o mercado está transformando a batalha por juros altos em um terceiro turno da eleição","url":"https://news.google.com/rss/articles/CBMizgFBVV95cUxPUFZGU1lVdnhfS3Z4NVFCdVdaRFJTdHJaelR0MzFwN09ha3VhZFRXOVFTSzFGTHZMYWtKM1VXcUdyODY4NEt4X092ejBWM3dSWndUR25IU2ppSFB5dG5NYUdGb2FkWWxPUEFnWEVRdkhSQTM5TDUwSFRhTHcycEFQaWxjdmNsdGtVMmRsNTZyeEJtOUZfWkVGaWZsZm55Y0ZwZjNKdUZ1OHJhbkY3a1UtZFFFZHh3Rk9ZdV9fNnN5aFpGb1VxWExSYVR6VG9JUQ?oc=5","imagem":"","topicKey":"politica"}]};

  window.ROM_EDITORIAL = {
    assuntos: ASSUNTOS,
    explicacoes: EXPLICACOES_MAP,
    listaExplicacoes: EXPLICACOES,
    linhasDoTempo: LINHAS_DO_TEMPO,
    paginasTematicas: PAGINAS_TEMATICAS,
    resumoDoDia: RESUMO_DO_DIA.slice().sort(function (a, b) { return a.relevancia - b.relevancia; }),
    comparacoes: typeof COMPARACOES !== 'undefined' ? COMPARACOES : {},
    encontrarComparacaoPorSlug: function (slug) {
      if (!slug) return null;
      var clean = String(slug).toLowerCase().trim().replace(/^\/+|\/+$/g, '').replace(/^comparar\//, '');
      return (typeof COMPARACOES !== 'undefined' && COMPARACOES[clean]) || null;
    },
    registrarAssunto: function (id, dados) { ASSUNTOS[id] = Object.assign({ id: id }, dados); },
    registrarExplicacao: function (dados) {
      EXPLICACOES.push(dados);
      if (dados && (dados.slug || dados.id)) EXPLICACOES_MAP[dados.slug || dados.id] = dados;
    },
    registrarLinhaDoTempo: function (id, dados) { LINHAS_DO_TEMPO[id] = Object.assign({ id: id }, dados); },
    registrarPaginaTematica: function (rota, dados) { PAGINAS_TEMATICAS[rota] = Object.assign({ rota: rota }, dados); },
    encontrarAssuntosPorTexto: encontrarAssuntosPorTexto,
    encontrarLinhaDoTempoPorTermo: encontrarLinhaDoTempoPorTermo,
    encontrarExplicacoesPorTermo: encontrarExplicacoesPorTermo,
    encontrarHubsPorTermo: encontrarHubsPorTermo,
    vincularMateria: vincularMateria
  };
})();
