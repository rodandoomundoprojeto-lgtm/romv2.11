// GET / POST /api/busca-assunto
// Busca notícias por palavra-chave respeitando continente, país e tipo de notícia,
// consultando feeds RSS (Bing News RSS + Google News RSS) para os veículos cadastrados,
// filtrando, ordenando por data e agrupando os resultados em carrosséis por veículo.
import { json, limparTermo } from '../lib/ia.js';
import {
  isRefreshRequest,
  newsResponseHeaders,
  parseTimestampIso,
  compareIsoDesc,
  parseFeedItems,
} from '../lib/rss.js';

const MAX_POR_VEICULO_PADRAO = 12;
const MAX_POR_VEICULO_30D = 16;
const MAX_POR_VEICULO_ALL = 24; // "Todo o período" abrange muito mais matérias por veículo
const MAX_VEICULOS_PAIS = 36;   // Abrange todos os veículos de países grandes (ex: EUA = 34, BR = 31)
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos em memória no servidor
const CACHE_MEMORIA = new Map();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
};

const CACHE_HEADERS = newsResponseHeaders({ isRefresh: false, isFallback: false, corsHeaders: CORS_HEADERS });
const SEM_CACHE = newsResponseHeaders({ isRefresh: true, isFallback: true, corsHeaders: CORS_HEADERS });

// Vocabulário semântico por tópico para enriquecer a busca e ranquear melhor cada editoria
const TERMOS_CONTEXTO_TOPICO = {
  politica: ['política', 'governo', 'congresso', 'senado', 'parlamento', 'eleições', 'presidente', 'stf', 'suprema corte', 'politics', 'government', 'election', 'congress', 'senate'],
  economia: ['economia', 'mercado', 'inflação', 'juros', 'pib', 'dólar', 'emprego', 'comércio', 'tarifas', 'bolsa', 'orçamento', 'economy', 'market', 'inflation', 'trade', 'fed', 'business'],
  tecnologia: ['tecnologia', 'inteligência artificial', 'ia', 'cibersegurança', 'chips', 'semicondutores', 'big tech', 'inovação', 'digital', 'startups', 'technology', 'ai', 'cyber', 'tech'],
  cultura: ['cultura', 'cinema', 'música', 'festival', 'arte', 'literatura', 'teatro', 'streaming', 'oscar', 'patrimônio', 'culture', 'arts', 'entertainment', 'film', 'music'],
  mundo: ['internacional', 'geopolítica', 'diplomacia', 'guerra', 'conflito', 'onu', 'otan', 'sanções', 'fronteira', 'acordo', 'world', 'foreign policy', 'diplomacy', 'nato', 'un'],
  esportes: ['esportes', 'futebol', 'copa', 'olimpíadas', 'campeonato', 'liga', 'fórmula 1', 'nba', 'nfl', 'atleta', 'sports', 'football', 'soccer', 'league', 'championship'],
  saude: ['saúde', 'medicina', 'vacina', 'hospital', 'sus', 'fda', 'oms', 'epidemia', 'tratamento', 'pesquisa clínica', 'health', 'medicine', 'healthcare', 'vaccine', 'clinical']
};

function limiteArtigosPorPeriodo(periodo) {
  if (periodo === 'all') return MAX_POR_VEICULO_ALL;
  if (periodo === '30d') return MAX_POR_VEICULO_30D;
  return MAX_POR_VEICULO_PADRAO;
}

function normalizar(str) {
  return String(str == null ? '' : str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizarFonetico(str) {
  const s = normalizar(str);
  if (!s) return '';
  return s
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/y/g, 'i')
    .replace(/w/g, 'v')
    .replace(/qu([ei])/g, 'k$1')
    .replace(/qu/g, 'k')
    .replace(/c([aou])/g, 'k$1')
    .replace(/c([ei])/g, 's$1')
    .replace(/g([ei])/g, 'j$1')
    .replace(/gu([ei])/g, 'g$1')
    .replace(/ch|sh/g, 'x')
    .replace(/ss|sc|sç|xc|z/g, 's')
    .replace(/m(?=[pb]|$)/g, 'n')
    .replace(/([aeou])l(?=$|[^aeiou])/g, '$1u')
    .replace(/([a-z0-9])\1+/g, '$1');
}

function distanciaEdicao(a, b) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (!la) return lb;
  if (!lb) return la;
  if (Math.abs(la - lb) > 4) return Math.abs(la - lb);

  const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = val;
    }
  }
  return dp[la][lb];
}

function ehSubsequenciaOrdenada(menor, maior) {
  if (!menor || !maior || menor.length > maior.length) return false;
  let i = 0;
  for (let j = 0; j < maior.length && i < menor.length; j++) {
    if (menor[i] === maior[j]) i++;
  }
  return i === menor.length;
}

function palavrasSimilares(qRaw, cRaw) {
  const q = normalizar(qRaw);
  const c = normalizar(cRaw);
  if (!q || !c) return { match: false, score: 0 };
  if (q === c) return { match: true, score: 1 };
  const minLen = Math.min(q.length, c.length);
  const maxLen = Math.max(q.length, c.length);
  if (minLen <= 4 || Math.abs(q.length - c.length) > 2) return { match: false, score: 0 };

  const qFon = normalizarFonetico(q);
  const cFon = normalizarFonetico(c);
  if (qFon && qFon === cFon) return { match: true, score: 0.95 };

  const d = distanciaEdicao(q, c);
  const dp = qFon && cFon ? distanciaEdicao(qFon, cFon) : d;
  const mesmaInicial = q[0] === c[0] || (qFon && cFon && qFon[0] === cFon[0]);
  const mesmaFinal = q[q.length - 1] === c[c.length - 1] || (qFon && cFon && qFon[qFon.length - 1] === cFon[cFon.length - 1]);
  const subseq = ehSubsequenciaOrdenada(q, c) || ehSubsequenciaOrdenada(c, q);

  if (d === 1 || dp === 1) {
    if (!mesmaInicial) return { match: false, score: 0 };
    return { match: true, score: 0.92 };
  }
  if (d === 2 || dp === 2) {
    if (minLen >= 5 && mesmaInicial && (mesmaFinal || subseq)) {
      return { match: true, score: subseq ? 0.85 : 0.82 };
    }
    if (maxLen >= 7 && mesmaInicial) {
      return { match: true, score: 0.81 };
    }
  }
  if (d === 3 && maxLen >= 9 && mesmaInicial && (mesmaFinal || subseq)) {
    return { match: true, score: 0.77 };
  }
  return { match: false, score: 0 };
}

const STOPWORDS_BUSCA = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'o', 'a', 'os', 'as',
  'para', 'pra', 'com', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'que', 'se', 'um', 'uma', 'uns', 'umas',
  'sobre', 'sob', 'ao', 'aos', 'aqui', 'ali', 'como', 'mais', 'mas', 'ou', 'seus', 'suas', 'seu', 'sua',
  'antes', 'apos', 'entre', 'contra', 'desde', 'durante', 'ate', 'sem', 'disse', 'diz', 'fala', 'veja',
  'novo', 'nova', 'novos', 'novas', 'hoje', 'ontem', 'agora', 'onde', 'quando', 'porque', 'isso', 'aquilo',
  'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela',
  'the', 'of', 'and', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about',
  'la', 'el', 'los', 'las', 'del', 'al', 'en', 'con', 'un', 'una',
  'le', 'les', 'des', 'du', 'et', 'und', 'mit', 'von'
]);

const ENTIDADES_COMPOSTAS = [
  'Flávio Bolsonaro', 'Jair Bolsonaro', 'Eduardo Bolsonaro', 'Carlos Bolsonaro', 'Michelle Bolsonaro', 'Renan Bolsonaro',
  'Luiz Inácio Lula da Silva', 'Fernando Haddad', 'Tarcísio de Freitas', 'Alexandre de Moraes', 'Geraldo Alckmin',
  'Davi Alcolumbre', 'Hugo Motta', 'Arthur Lira', 'Rodrigo Pacheco', 'Flávio Dino', 'Gilmar Mendes',
  'Luís Roberto Barroso', 'Cristiano Zanin', 'André Mendonça', 'Cármen Lúcia', 'Dias Toffoli', 'Edson Fachin', 'Luiz Fux',
  'Roberto Campos Neto', 'Gabriel Galípolo', 'Guilherme Boulos', 'Pablo Marçal', 'Ricardo Nunes', 'Nikolas Ferreira',
  'Ronaldo Caiado', 'Romeu Zema', 'Eduardo Leite', 'Rui Costa', 'Gleisi Hoffmann', 'Simone Tebet', 'Marina Silva',
  'Ciro Gomes', 'Michel Temer', 'Dilma Rousseff', 'Paulo Guedes', 'João Campos', 'Helder Barbalho', 'Ratinho Júnior',
  'Donald Trump', 'Joe Biden', 'Kamala Harris', 'Elon Musk', 'Marco Rubio', 'JD Vance', 'Jerome Powell',
  'Vladimir Putin', 'Volodymyr Zelensky', 'Xi Jinping', 'Emmanuel Macron', 'Keir Starmer', 'Olaf Scholz',
  'Friedrich Merz', 'Giorgia Meloni', 'Pedro Sánchez', 'Javier Milei', 'Nicolás Maduro', 'Gustavo Petro',
  'Gabriel Boric', 'Claudia Sheinbaum', 'Nayib Bukele', 'Benjamin Netanyahu', 'Narendra Modi', 'Recep Erdogan',
  'António Guterres', 'Luís Montenegro', 'Supremo Tribunal Federal', 'Congresso Nacional', 'Banco Central',
  'Federal Reserve', 'Suprema Corte', 'Casa Branca', 'Wall Street', 'Vale do Silício', 'Arcabouço Fiscal',
  'Reforma Tributária', 'Inteligência Artificial', 'Transição Energética', 'Aquecimento Global', 'Direitos Humanos',
  'União Europeia', 'Estados Unidos', 'Coreia do Sul', 'Coreia do Norte', 'África do Sul', 'Arábia Saudita', 'Reino Unido'
];

const MAPA_CORRECOES_DIRETAS = {
  favo: 'Flávio',
  flavo: 'Flávio',
  flavio: 'Flávio',
  bolsonro: 'Bolsonaro',
  bosonaro: 'Bolsonaro',
  bousonaro: 'Bolsonaro',
  bolsonar: 'Bolsonaro',
  lulla: 'Lula',
  hadad: 'Haddad',
  radad: 'Haddad',
  tarciso: 'Tarcísio',
  tarsisio: 'Tarcísio',
  tarcisio: 'Tarcísio',
  alkmin: 'Alckmin',
  alckim: 'Alckmin',
  alcolunbre: 'Alcolumbre',
  aucolumbre: 'Alcolumbre',
  morais: 'Moraes',
  marcal: 'Marçal',
  galipolo: 'Galípolo',
  nikolas: 'Nikolas',
  trunp: 'Trump',
  tramp: 'Trump',
  donaud: 'Donald',
  zelenski: 'Zelensky',
  zelensqui: 'Zelensky',
  netaniahu: 'Netanyahu',
  milei: 'Milei',
  millei: 'Milei',
  inflassao: 'inflação',
  inflacao: 'inflação',
  inflasao: 'inflação',
  impechment: 'impeachment',
  impichment: 'impeachment',
  impeachement: 'impeachment',
  orcamento: 'orçamento',
  orssamento: 'orçamento',
  eleissoes: 'eleições',
  eleicoes: 'eleições',
  eleicao: 'eleição',
  congreso: 'Congresso',
  previdencia: 'Previdência',
  amazonia: 'Amazônia',
  sancoes: 'sanções',
  sansoes: 'sanções',
  ucrania: 'Ucrânia',
  russia: 'Rússia'
};

const VOCABULARIO_CANONICO = (() => {
  const mapa = new Map();
  const adicionar = (palavra) => {
    const p = String(palavra || '').trim();
    const n = normalizar(p);
    if (n.length >= 3 && !STOPWORDS_BUSCA.has(n) && !mapa.has(n)) {
      mapa.set(n, p);
    }
  };
  ENTIDADES_COMPOSTAS.forEach((ent) => ent.split(/\s+/).forEach(adicionar));
  Object.values(MAPA_CORRECOES_DIRETAS).forEach(adicionar);
  [
    'Lula', 'Bolsonaro', 'Flávio', 'Jair', 'Eduardo', 'Carlos', 'Michelle', 'Haddad', 'Tarcísio', 'Moraes',
    'Alckmin', 'Alcolumbre', 'Motta', 'Lira', 'Pacheco', 'Dino', 'Mendes', 'Barroso', 'Zanin', 'Mendonça',
    'Toffoli', 'Fachin', 'Fux', 'Boulos', 'Marçal', 'Nunes', 'Caiado', 'Zema', 'Leite', 'Tebet', 'Marina',
    'Ciro', 'Temer', 'Dilma', 'Guedes', 'Trump', 'Biden', 'Kamala', 'Musk', 'Putin', 'Zelensky', 'Macron',
    'Starmer', 'Scholz', 'Meloni', 'Milei', 'Maduro', 'Petro', 'Boric', 'Bukele', 'Netanyahu', 'Modi', 'Erdogan',
    'Política', 'Economia', 'Tecnologia', 'Cultura', 'Internacional', 'Eleições', 'Inflação', 'Orçamento',
    'Impeachment', 'Congresso', 'Senado', 'Câmara', 'Supremo', 'Planalto', 'Itamaraty', 'Juros', 'Selic',
    'Dólar', 'Câmbio', 'Petrobras', 'Reforma', 'Tributária', 'Previdência', 'Anistia', 'Segurança', 'Amazônia',
    'Clima', 'Desmatamento', 'Energia', 'Semicondutores', 'Tarifas', 'Sanções', 'Ucrânia', 'Rússia', 'Israel',
    'Palestina', 'China', 'Europa', 'Democracia', 'Governo', 'Oposição', 'Parlamento', 'Corrupção', 'Agronegócio',
    'Exportações', 'Imigração', 'Fronteira', 'Defesa', 'Guerra', 'Conflito', 'Diplomacia', 'Petróleo'
  ].forEach(adicionar);
  return mapa;
})();

const PALAVRAS_COMUNS_INTACTAS = new Set([
  'clima', 'economia', 'politica', 'tecnologia', 'cultura', 'mundo', 'juros', 'dolar', 'cambio', 'energia',
  'governo', 'congresso', 'senado', 'camara', 'supremo', 'reforma', 'imposto', 'impostos', 'emprego', 'saude',
  'educacao', 'esporte', 'musica', 'cinema', 'arte', 'turismo', 'comercio', 'defesa', 'guerra', 'acordo',
  'partido', 'partidos', 'votacao', 'voto', 'lider', 'banco', 'central', 'dados', 'redes', 'sociais', 'agua',
  'fome', 'pobreza', 'riqueza', 'petroleo', 'gas', 'ouro', 'soja', 'carne', 'cafe', 'crime',
  'policia', 'justica', 'lei', 'leis', 'direito', 'direitos', 'estado', 'estados', 'pais', 'paises', 'cidade',
  'empresa', 'empresas', 'mercado', 'mercados', 'industria', 'comércio', 'ciencia', 'ambiente', 'floresta',
  'inflacao', 'orcamento', 'eleicao', 'eleicoes', 'sancoes', 'tarifa', 'tarifas', 'acordos', 'tratado',
  'exercito', 'marinha', 'aeronautica', 'armas', 'nuclear', 'espaco', 'satelite', 'internet', 'acoes',
  'bolsa', 'investimento', 'investimentos', 'divida', 'pib', 'credito', 'financas', 'trabalho', 'salario',
  'greve', 'protesto', 'protestos', 'manifestacao', 'crise', 'ataque', 'ataques', 'paz', 'cessar-fogo',
  'fronteiras', 'imigrantes', 'refugiados', 'mulheres', 'jovens', 'infancia', 'moradia', 'transporte',
  'antes', 'apos', 'sobre', 'entre', 'contra', 'desde', 'durante', 'ate', 'sem', 'sob', 'disse', 'diz',
  'fala', 'veja', 'novo', 'nova', 'hoje', 'ontem', 'agora', 'como', 'onde', 'quando', 'porque', 'isso', 'aquilo'
].map((x) => normalizar(x)));

function tokenJaEhConhecidoOuIntacto(tok) {
  const n = normalizar(tok);
  if (!n || n.length < 3) return true;
  if (STOPWORDS_BUSCA.has(n)) return true;
  if (PALAVRAS_COMUNS_INTACTAS.has(n)) return true;
  if (VOCABULARIO_CANONICO.has(n)) return true;
  return false;
}

function extrairTermoResilienteConsulta(termo) {
  if (!termo) return '';
  const limpo = String(termo || '')
    .replace(/[«»""''„”]/g, '')
    .replace(/[-–—|:,;!?()]/g, ' ')
    .trim();
  const palavras = limpo.split(/\s+/).filter(Boolean);

  if (palavras.length <= 3) return limpo;

  const significativas = palavras.filter((p) => {
    const n = normalizar(p);
    return n.length >= 3 && !STOPWORDS_BUSCA.has(n);
  });

  if (significativas.length <= 3 && significativas.length > 0) {
    return significativas.join(' ');
  }

  const pontuadas = significativas.map((p, idx) => {
    const n = normalizar(p);
    let peso = 0;
    if (/^[A-ZÀ-Ý]/.test(p)) peso += 5;
    if (VOCABULARIO_CANONICO.has(n)) peso += 6;
    if (/^[A-Z0-9]{2,5}$/.test(p)) peso += 7;
    if (n.length >= 6) peso += 3;
    else if (n.length >= 4) peso += 1;
    if (idx < 3) peso += 2;
    return { palavra: p, peso, idx };
  });

  pontuadas.sort((a, b) => b.peso - a.peso);
  const escolhidas = pontuadas.slice(0, 4);
  escolhidas.sort((a, b) => a.idx - b.idx);

  const res = escolhidas.map((e) => e.palavra).join(' ');
  return res || limpo;
}

function corrigirTermoEstatico(rawQ) {
  const limpo = String(rawQ || '').trim();
  if (!limpo) return '';
  const palavrasOrig = limpo.split(/\s+/);
  const palavrasNorm = palavrasOrig.map((p) => normalizar(p));

  // Frase longa (manchetes completas / mais de 3 palavras): não muta termos comuns nem força entidades inteiras
  if (palavrasOrig.length > 3) {
    const corrigidas = palavrasOrig.map((pal, idx) => {
      const n = palavrasNorm[idx];
      if (!n || n.length < 3 || STOPWORDS_BUSCA.has(n) || PALAVRAS_COMUNS_INTACTAS.has(n)) return pal;
      if (/^[A-ZÀ-Ý0-9]{2,6}$/.test(pal)) return pal;
      if (MAPA_CORRECOES_DIRETAS[n]) return MAPA_CORRECOES_DIRETAS[n];
      if (VOCABULARIO_CANONICO.has(n)) return VOCABULARIO_CANONICO.get(n) || pal;
      return pal;
    });
    return corrigidas.join(' ');
  }

  for (const entidade of ENTIDADES_COMPOSTAS) {
    const entPartes = entidade.split(/\s+/);
    const entSignificativas = entPartes.filter((p) => !STOPWORDS_BUSCA.has(normalizar(p)));
    const usrSignificativas = palavrasOrig.filter((p) => !STOPWORDS_BUSCA.has(normalizar(p)));

    if (usrSignificativas.length >= 2 && usrSignificativas.length === entSignificativas.length) {
      let todasCombinam = true;
      let temForte = false;
      for (let i = 0; i < usrSignificativas.length; i++) {
        const sim = palavrasSimilares(usrSignificativas[i], entSignificativas[i]);
        if (!sim.match) {
          todasCombinam = false;
          break;
        }
        if (sim.score >= 0.88) temForte = true;
      }
      if (todasCombinam && temForte) {
        return entidade;
      }
    }
  }

  if (palavrasOrig.length >= 2) {
    const resultado = [...palavrasOrig];
    for (let i = 0; i < resultado.length - 1; i++) {
      const w1 = resultado[i];
      const w2 = resultado[i + 1];
      let melhorPar = null;
      let melhorScore = 0;
      for (const entidade of ENTIDADES_COMPOSTAS) {
        const ep = entidade.split(/\s+/).filter((p) => !STOPWORDS_BUSCA.has(normalizar(p)));
        if (ep.length !== 2) continue;
        const s1 = palavrasSimilares(w1, ep[0]);
        const s2 = palavrasSimilares(w2, ep[1]);
        if (s1.match && s2.match && (s1.score >= 0.88 || s2.score >= 0.88)) {
          const media = (s1.score + s2.score) / 2;
          if (media > melhorScore) {
            melhorScore = media;
            melhorPar = ep;
          }
        }
      }
      if (melhorPar) {
        resultado[i] = melhorPar[0];
        resultado[i + 1] = melhorPar[1];
        i++;
      }
    }
    if (normalizar(resultado.join(' ')) !== normalizar(limpo)) {
      return resultado.join(' ');
    }
  }

  const corrigidas = palavrasOrig.map((pal, idx) => {
    const n = palavrasNorm[idx];
    if (!n || n.length < 3 || STOPWORDS_BUSCA.has(n) || PALAVRAS_COMUNS_INTACTAS.has(n)) return pal;
    if (/^[A-ZÀ-Ý0-9]{2,6}$/.test(pal)) return pal;

    if (MAPA_CORRECOES_DIRETAS[n]) {
      return MAPA_CORRECOES_DIRETAS[n];
    }
    if (VOCABULARIO_CANONICO.has(n)) {
      return VOCABULARIO_CANONICO.get(n) || pal;
    }

    let melhor = pal;
    let melhorScore = 0;
    for (const [, canon] of VOCABULARIO_CANONICO.entries()) {
      const sim = palavrasSimilares(n, canon);
      if (sim.match && sim.score >= 0.84 && sim.score > melhorScore) {
        melhorScore = sim.score;
        melhor = canon;
      }
    }
    return melhor;
  });

  return corrigidas.join(' ');
}

function descobrirCorrecaoEmTitulos(qOriginal, itens) {
  if (!qOriginal || !Array.isArray(itens) || itens.length === 0) return '';
  const tokensUsr = String(qOriginal).trim().split(/\s+/).filter((t) => t.length >= 2);
  if (!tokensUsr.length) return '';

  if (tokensUsr.every((t) => tokenJaEhConhecidoOuIntacto(t))) return '';

  const tokensExatosNosTitulos = new Set();
  let fraseExataEncontrada = false;

  for (const it of itens) {
    const palavrasTitulo = String(it.titulo || '')
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    const normTituloSet = new Set(palavrasTitulo.map((w) => normalizar(w)));
    for (const uTok of tokensUsr) {
      const uNorm = normalizar(uTok);
      if (normTituloSet.has(uNorm)) tokensExatosNosTitulos.add(uNorm);
    }
    if (palavrasTitulo.length >= tokensUsr.length) {
      for (let i = 0; i <= palavrasTitulo.length - tokensUsr.length; i++) {
        let todosIguais = true;
        for (let j = 0; j < tokensUsr.length; j++) {
          if (normalizar(tokensUsr[j]) !== normalizar(palavrasTitulo[i + j])) {
            todosIguais = false;
            break;
          }
        }
        if (todosIguais) {
          fraseExataEncontrada = true;
          break;
        }
      }
    }
  }

  if (fraseExataEncontrada) return '';

  const contagemFrases = new Map();
  const formaOriginal = new Map();

  for (const it of itens) {
    const palavrasTitulo = String(it.titulo || '')
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);

    if (palavrasTitulo.length < tokensUsr.length) continue;

    for (let i = 0; i <= palavrasTitulo.length - tokensUsr.length; i++) {
      let ok = true;
      let algumDiferente = false;
      const trecho = [];
      for (let j = 0; j < tokensUsr.length; j++) {
        const uTok = tokensUsr[j];
        const tTok = palavrasTitulo[i + j];
        const uNorm = normalizar(uTok);
        const tNorm = normalizar(tTok);

        if (tokenJaEhConhecidoOuIntacto(uTok) || tokensExatosNosTitulos.has(uNorm)) {
          if (uNorm !== tNorm) {
            ok = false;
            break;
          }
          trecho.push(tTok);
          continue;
        }

        const sim = palavrasSimilares(uTok, tTok);
        if (!sim.match || sim.score < 0.85) {
          ok = false;
          break;
        }
        if (uNorm !== tNorm) algumDiferente = true;
        trecho.push(tTok);
      }
      if (ok && algumDiferente) {
        const chave = normalizar(trecho.join(' '));
        contagemFrases.set(chave, (contagemFrases.get(chave) || 0) + 1);
        if (!formaOriginal.has(chave)) formaOriginal.set(chave, trecho.join(' '));
      }
    }
  }

  let melhorChave = '';
  let maiorFreq = 0;
  for (const [k, freq] of contagemFrases.entries()) {
    if (freq > maiorFreq) {
      maiorFreq = freq;
      melhorChave = k;
    }
  }
  return maiorFreq >= 2 ? (formaOriginal.get(melhorChave) || '') : '';
}

function decodificarEntidades(str) {
  if (!str) return '';
  return String(str)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function limparHtml(str, limite = 220) {
  const s = decodificarEntidades(str)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= limite) return s;
  return s.slice(0, limite - 1).trim() + '…';
}

function limparTitulo(rawTitle, nomeVeiculo) {
  let t = limparHtml(rawTitle, 240);
  if (!t) return '';
  const partes = t.split(/\s+[-–—|]\s+/);
  if (partes.length > 1) {
    const ultimo = normalizar(partes[partes.length - 1]);
    const veicNorm = normalizar(nomeVeiculo);
    if (
      ultimo.length < 35 &&
      (veicNorm.includes(ultimo) || ultimo.includes(veicNorm) || partes[partes.length - 1].length <= 22)
    ) {
      partes.pop();
      t = partes.join(' - ').trim();
    }
  }
  return t;
}

function extrairTag(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function extrairAtributo(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*?\\b${attr}=["']([^"']+)["'][^>]*>`, 'i');
  const m = xml.match(re);
  return m ? decodificarEntidades(m[1].trim()) : '';
}

function extrairUrlReal(rawLink) {
  const link = decodificarEntidades(rawLink).trim();
  if (!link) return '';
  try {
    const u = new URL(link);
    if (u.hostname.includes('bing.com') && u.searchParams.get('url')) {
      const real = u.searchParams.get('url');
      const ru = new URL(real);
      if (ru.protocol === 'https:' || ru.protocol === 'http:') return ru.href;
    }
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
  } catch {
    return '';
  }
  return '';
}

function normalizarImagem(rawImg) {
  if (!rawImg) return '';
  const limpo = decodificarEntidades(rawImg).trim();
  if (!limpo || /^(null|undefined|none|false)$/i.test(limpo) || limpo.startsWith('data:')) return '';
  const lower = limpo.toLowerCase();
  if (
    lower.includes('j6_cofbogxhri9im864nl_ligxvsqp2aupskei7z0cnnfdvgumwuy20nuhkreqyrpy4beeibuc') ||
    lower.includes('news.google.com/') ||
    lower.includes('/favicon') ||
    lower.includes('1x1.') ||
    lower.includes('pixel.') ||
    lower.includes('spacer.')
  ) {
    return '';
  }
  try {
    const u = new URL(limpo.startsWith('//') ? 'https:' + limpo : limpo);
    if (u.hostname.includes('bing.com') && u.pathname.startsWith('/th')) {
      u.protocol = 'https:';
      if (!u.searchParams.has('w')) u.searchParams.set('w', '480');
      if (!u.searchParams.has('h')) u.searchParams.set('h', '270');
      if (!u.searchParams.has('c')) u.searchParams.set('c', '14');
      return u.href;
    }
    if (u.protocol === 'http:') u.protocol = 'https:';
    if (u.protocol === 'https:') return u.href;
  } catch {
    return '';
  }
  return '';
}

function dataISO(rawDate) {
  if (!rawDate) return '';
  const d = new Date(decodificarEntidades(rawDate).trim());
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function parseRssItems(xml, nomeVeiculo) {
  if (!xml) return [];
  const parsed = parseFeedItems(xml);
  const items = [];
  for (const entry of parsed) {
    const titulo = limparTitulo(entry.title, nomeVeiculo);
    if (!titulo) continue;

    const url = extrairUrlReal(entry.link);
    if (!url) continue;

    const pubDate = entry.pubDateIso || '';
    const bloco = entry.rawBlock || '';
    const rawDesc = entry.rawDescription || '';
    const rawContent = entry.rawContent || '';

    const rawImg =
      extrairTag(bloco, 'News:Image') ||
      extrairAtributo(bloco, 'media:content', 'url') ||
      extrairAtributo(bloco, 'media:thumbnail', 'url') ||
      extrairAtributo(bloco, 'enclosure', 'url') ||
      extrairTag(bloco, 'image') ||
      extrairAtributo(decodificarEntidades(rawDesc), 'img', 'src') ||
      extrairAtributo(decodificarEntidades(rawContent), 'img', 'src');
    const imagem = normalizarImagem(rawImg);

    let resumo = limparHtml(rawDesc, 190);
    if (resumo && normalizar(resumo).startsWith(normalizar(titulo).slice(0, 35))) {
      resumo = '';
    }

    items.push({
      titulo,
      resumo,
      imagem,
      url,
      veiculo: nomeVeiculo,
      publicadoEm: pubDate,
    });
  }
  return items;
}

function tokenCombinaNoTexto(tk, alvo, palavrasAlvo) {
  if (!tk) return true;
  if (STOPWORDS_BUSCA.has(tk)) return true;
  if (alvo.includes(tk)) return true;
  if (tk.length < 5) return false;
  for (let i = 0; i < palavrasAlvo.length; i++) {
    const w = palavrasAlvo[i];
    if (w.length < 4) continue;
    if (w.startsWith(tk) || tk.startsWith(w)) {
      if (Math.min(w.length, tk.length) >= 5) return true;
    }
    if (palavrasSimilares(tk, w).match) return true;
  }
  return false;
}

function calcularRelevanciaArtigo(item, termoNorm, tokens, tokensOrig = [], topicKey = '') {
  const tituloNorm = normalizar(item.titulo || '');
  const resumoNorm = normalizar(item.resumo || '');
  let score = 0;

  if (termoNorm && tituloNorm.includes(termoNorm)) {
    score += 140;
  } else if (termoNorm && resumoNorm.includes(termoNorm)) {
    score += 55;
  }

  const relTokens = (tokens || []).filter((tk) => tk.length >= 2 && !STOPWORDS_BUSCA.has(tk));
  const baseTokens = relTokens.length > 0 ? relTokens : (tokens || []);
  if (baseTokens.length > 0) {
    let tTit = 0, tRes = 0;
    for (const tk of baseTokens) {
      if (tituloNorm.includes(tk)) tTit++;
      else if (resumoNorm.includes(tk)) tRes++;
    }
    const fracTit = tTit / baseTokens.length;
    const fracRes = tRes / baseTokens.length;

    if (tTit === baseTokens.length) score += 90;
    else score += Math.round(fracTit * 65);

    if (tRes === baseTokens.length) score += 30;
    else score += Math.round(fracRes * 20);
  }

  if (tokensOrig && tokensOrig.length > 0) {
    let tOrig = 0;
    for (const tk of tokensOrig) {
      if (tituloNorm.includes(tk)) tOrig++;
    }
    score += Math.round((tOrig / tokensOrig.length) * 20);
  }

  // Bônus de afinidade temática quando o utilizador está dentro de um tópico específico
  if (topicKey && TERMOS_CONTEXTO_TOPICO[topicKey]) {
    const textoCompleto = tituloNorm + ' ' + resumoNorm;
    const kws = TERMOS_CONTEXTO_TOPICO[topicKey];
    let matchesTopico = 0;
    for (const kw of kws) {
      if (textoCompleto.includes(normalizar(kw))) {
        matchesTopico++;
        if (matchesTopico >= 2) break;
      }
    }
    score += matchesTopico * 14;
  }

  if (item.publicadoEm) {
    const ts = new Date(item.publicadoEm).getTime();
    if (!Number.isNaN(ts)) {
      const horasAtras = Math.max(0, (Date.now() - ts) / (3600 * 1000));
      if (horasAtras <= 6) score += 35;
      else if (horasAtras <= 12) score += 25;
      else if (horasAtras <= 24) score += 15;
      else if (horasAtras <= 72) score += 8;
    }
  }

  return score;
}

function combinaComTermo(item, termoNorm, tokens) {
  if (!termoNorm) return true;
  const alvo = normalizar((item.titulo || '') + ' ' + (item.resumo || ''));
  if (!alvo) return false;

  if (alvo.includes(termoNorm)) return true;

  const tokensRelevantes = (tokens || []).filter((tk) => tk.length >= 2 && !STOPWORDS_BUSCA.has(tk));
  const listaTokens = tokensRelevantes.length > 0 ? tokensRelevantes : (tokens || []);
  if (listaTokens.length === 0) return true;

  if (listaTokens.length === 1 && listaTokens[0].length <= 4) {
    return alvo.includes(listaTokens[0]);
  }

  const palavrasAlvo = alvo.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  let casados = 0;
  for (const tk of listaTokens) {
    if (alvo.includes(tk) || tokenCombinaNoTexto(tk, alvo, palavrasAlvo)) {
      casados++;
    }
  }

  if (casados === listaTokens.length) return true;

  if (listaTokens.length === 2) {
    return casados >= 1 && listaTokens.some((tk) => tk.length >= 4 && (alvo.includes(tk) || tokenCombinaNoTexto(tk, alvo, palavrasAlvo)));
  }

  if (listaTokens.length >= 4) {
    return casados >= 2 || (casados >= 1 && listaTokens.some((tk) => tk.length >= 5 && (alvo.includes(tk) || tokenCombinaNoTexto(tk, alvo, palavrasAlvo))));
  }

  if (listaTokens.length === 3) {
    return casados >= 1;
  }

  return false;
}

async function fetchXml(url, timeoutMs = 4200, isRefresh = false) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RodandoOMundo/2.11)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        ...(isRefresh ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : {}),
      },
      signal: ctrl.signal,
    });
    if (!resp.ok) return '';
    return await resp.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function localeParams(lang, countryCode) {
  const l = String(lang || 'pt').toLowerCase();
  const c = String(countryCode || 'BR').toUpperCase();
  if (l === 'pt') {
    const ptPaises = ['PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL'];
    const isPtEur = ptPaises.includes(c);
    const gl = isPtEur ? 'PT' : 'BR';
    const hl = isPtEur ? 'pt-PT' : 'pt-BR';
    const ceid = isPtEur ? 'PT:pt-150' : 'BR:pt-419';
    const mkt = isPtEur ? 'pt-PT' : 'pt-BR';
    return { hl, gl, ceid, mkt };
  }
  if (l === 'es') {
    const gl = ['AR', 'CL', 'CO', 'MX', 'PE', 'ES', 'UY', 'VE', 'CU', 'DO', 'PA', 'CR', 'GT', 'HN', 'SV', 'NI', 'BO', 'PY', 'EC'].includes(c) ? c : 'ES';
    return { hl: 'es', gl, ceid: `${gl}:es`, mkt: 'es-ES' };
  }
  if (l === 'fr') {
    const frGl = ['FR', 'BE', 'CH', 'CA', 'SN', 'CI', 'CM', 'CD', 'CG', 'MA', 'DZ', 'TN', 'MG', 'HT', 'LU'].includes(c) ? c : 'FR';
    return { hl: 'fr', gl: frGl, ceid: `${frGl}:fr`, mkt: 'fr-FR' };
  }
  if (l === 'ar') {
    const arGl = ['EG', 'MA', 'DZ', 'TN', 'SA', 'AE', 'QA', 'KW', 'JO', 'LB', 'IQ', 'SY', 'YE', 'OM', 'LY', 'SD', 'PS'].includes(c) ? c : 'EG';
    return { hl: 'ar', gl: arGl, ceid: `${arGl}:ar`, mkt: 'ar-SA' };
  }
  if (l === 'de') {
    const deGl = ['DE', 'AT', 'CH'].includes(c) ? c : 'DE';
    return { hl: 'de', gl: deGl, ceid: `${deGl}:de`, mkt: 'de-DE' };
  }
  if (l === 'it') return { hl: 'it', gl: 'IT', ceid: 'IT:it', mkt: 'it-IT' };
  if (l === 'nl') {
    const nlGl = ['NL', 'BE', 'SR'].includes(c) ? c : 'NL';
    return { hl: 'nl', gl: nlGl, ceid: `${nlGl}:nl`, mkt: 'nl-NL' };
  }
  if (l === 'ru' || l === 'be') {
    const ruGl = ['RU', 'BY', 'KZ', 'KG'].includes(c) ? c : 'RU';
    return { hl: 'ru', gl: ruGl, ceid: `${ruGl}:ru`, mkt: 'ru-RU' };
  }
  if (l === 'uk') return { hl: 'uk', gl: 'UA', ceid: 'UA:uk', mkt: 'uk-UA' };
  if (l === 'pl') return { hl: 'pl', gl: 'PL', ceid: 'PL:pl', mkt: 'pl-PL' };
  if (l === 'tr' || l === 'az' || l === 'uz') {
    return { hl: 'tr', gl: 'TR', ceid: 'TR:tr', mkt: 'tr-TR' };
  }
  if (l === 'ja') return { hl: 'ja', gl: 'JP', ceid: 'JP:ja', mkt: 'ja-JP' };
  if (l === 'zh') {
    const isTwHk = ['TW', 'HK', 'MO'].includes(c);
    const gl = c === 'HK' ? 'HK' : 'TW';
    return { hl: isTwHk ? 'zh-TW' : 'zh-CN', gl, ceid: `${gl}:${isTwHk ? 'zh-Hant' : 'zh-Hans'}`, mkt: isTwHk ? 'zh-TW' : 'zh-CN' };
  }
  if (l === 'ko') return { hl: 'ko', gl: 'KR', ceid: 'KR:ko', mkt: 'ko-KR' };
  if (l === 'hi') return { hl: 'hi', gl: 'IN', ceid: 'IN:hi', mkt: 'en-IN' };
  if (l === 'bn') return { hl: 'bn', gl: c === 'IN' ? 'IN' : 'BD', ceid: `${c === 'IN' ? 'IN' : 'BD'}:bn`, mkt: 'en-IN' };
  if (l === 'id' || l === 'ms') {
    const idGl = c === 'MY' ? 'MY' : 'ID';
    return { hl: l === 'ms' ? 'ms' : 'id', gl: idGl, ceid: `${idGl}:${l === 'ms' ? 'ms' : 'id'}`, mkt: 'id-ID' };
  }
  if (l === 'sv') return { hl: 'sv', gl: 'SE', ceid: 'SE:sv', mkt: 'sv-SE' };
  if (l === 'no') return { hl: 'no', gl: 'NO', ceid: 'NO:no', mkt: 'nb-NO' };
  if (l === 'da' || l === 'fo') return { hl: 'da', gl: 'DK', ceid: 'DK:da', mkt: 'da-DK' };
  if (l === 'fi') return { hl: 'fi', gl: 'FI', ceid: 'FI:fi', mkt: 'fi-FI' };
  if (l === 'el') return { hl: 'el', gl: 'GR', ceid: 'GR:el', mkt: 'el-GR' };
  if (l === 'cs') return { hl: 'cs', gl: 'CZ', ceid: 'CZ:cs', mkt: 'cs-CZ' };
  if (l === 'sk') return { hl: 'sk', gl: 'SK', ceid: 'SK:sk', mkt: 'sk-SK' };
  if (l === 'hu') return { hl: 'hu', gl: 'HU', ceid: 'HU:hu', mkt: 'hu-HU' };
  if (l === 'ro') return { hl: 'ro', gl: 'RO', ceid: 'RO:ro', mkt: 'ro-RO' };
  if (l === 'bg') return { hl: 'bg', gl: 'BG', ceid: 'BG:bg', mkt: 'bg-BG' };
  if (l === 'sr' || l === 'hr' || l === 'bs' || l === 'cnr') return { hl: l === 'hr' ? 'hr' : 'sr', gl: c || 'RS', ceid: `${c || 'RS'}:${l === 'hr' ? 'hr' : 'sr'}`, mkt: 'en-US' };
  if (l === 'sl') return { hl: 'sl', gl: 'SI', ceid: 'SI:sl', mkt: 'sl-SI' };
  if (l === 'lt') return { hl: 'lt', gl: 'LT', ceid: 'LT:lt', mkt: 'lt-LT' };
  if (l === 'lv') return { hl: 'lv', gl: 'LV', ceid: 'LV:lv', mkt: 'lv-LV' };
  if (l === 'et') return { hl: 'et', gl: 'EE', ceid: 'EE:et', mkt: 'et-EE' };
  if (l === 'he') return { hl: 'he', gl: 'IL', ceid: 'IL:he', mkt: 'he-IL' };
  if (l === 'fa') return { hl: 'fa', gl: 'IR', ceid: 'IR:fa', mkt: 'en-US' };
  if (l === 'th') return { hl: 'th', gl: 'TH', ceid: 'TH:th', mkt: 'th-TH' };
  if (l === 'vi') return { hl: 'vi', gl: 'VN', ceid: 'VN:vi', mkt: 'vi-VN' };
  const gl = ['US', 'GB', 'CA', 'AU', 'IN', 'ZA', 'IE', 'NZ', 'NG', 'KE', 'GH', 'UG', 'TZ', 'ZW', 'ZM', 'NA', 'BW', 'RW', 'ET', 'PH', 'SG', 'PK'].includes(c) ? c : 'US';
  return { hl: 'en', gl, ceid: `${gl}:en`, mkt: 'en-US' };
}

async function traduzirTermoParaIdioma(q, lang) {
  const l = String(lang || 'pt').toLowerCase();
  if (!q || l === 'pt') return q;
  try {
    const url =
      'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=' +
      encodeURIComponent(l) +
      '&q=' +
      encodeURIComponent(q);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      const trad = (Array.isArray(j) && ((Array.isArray(j[0]) && j[0][0]) || (typeof j[0] === 'string' && j[0]))) || '';
      if (trad && typeof trad === 'string') return trad.trim() || q;
    }
  } catch { }
  try {
    const urlMm =
      'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent(q) +
      '&langpair=pt|' +
      encodeURIComponent(l);
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 2500);
    const r2 = await fetch(urlMm, { signal: ctrl2.signal });
    clearTimeout(t2);
    if (r2.ok) {
      const j2 = await r2.json();
      if (j2 && j2.responseData && j2.responseData.translatedText) {
        return j2.responseData.translatedText.trim() || q;
      }
    }
  } catch { }
  return q;
}

function deduplicarEOrdenar(lista, termoNorm, tokens, maxItens = MAX_POR_VEICULO_PADRAO, topicKey = '') {
  const mapa = new Map();
  for (const item of lista) {
    const chave = normalizar(item.titulo).replace(/[^a-z0-9]/g, '').slice(0, 58);
    if (!chave) continue;
    const rel = calcularRelevanciaArtigo(item, termoNorm, tokens, [], topicKey);
    const existente = mapa.get(chave);
    if (!existente) {
      mapa.set(chave, { ...item, relevancia: rel });
    } else {
      if (existente.url.includes('news.google.com') && !item.url.includes('news.google.com')) {
        existente.url = item.url;
      }
      if (!existente.imagem && item.imagem) existente.imagem = item.imagem;
      if (!existente.resumo && item.resumo) existente.resumo = item.resumo;
      if (!existente.publicadoEm && item.publicadoEm) existente.publicadoEm = item.publicadoEm;
      existente.relevancia = Math.max(existente.relevancia || 0, rel);
    }
  }

  return [...mapa.values()]
    .sort((a, b) => {
      const hasA = Boolean(parseTimestampIso(a.publicadoEm));
      const hasB = Boolean(parseTimestampIso(b.publicadoEm));
      if (hasA !== hasB) return hasA ? -1 : 1;
      const diffRel = (b.relevancia || 0) - (a.relevancia || 0);
      if (Math.abs(diffRel) >= 15) return diffRel;
      return compareIsoDesc(a.publicadoEm, b.publicadoEm);
    })
    .slice(0, maxItens);
}

function dentroDoPeriodo(publicadoEm, periodo) {
  if (!periodo || periodo === 'all') return true;
  if (!publicadoEm) return false;
  const ts = new Date(publicadoEm).getTime();
  if (Number.isNaN(ts)) return false;
  const diffMs = Math.max(0, Date.now() - ts);
  if (periodo === '24h') return diffMs <= 36 * 60 * 60 * 1000;
  if (periodo === '7d') return diffMs <= 8 * 24 * 60 * 60 * 1000;
  if (periodo === '30d') return diffMs <= 32 * 24 * 60 * 60 * 1000;
  return true;
}

async function descobrirTermoViaGoogleNews(q, loc, isRefresh = false) {
  if (!q || q.length < 3) return '';
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`;
    const xml = await fetchXml(url, 3200, isRefresh);
    if (!xml) return '';
    const itens = parseRssItems(xml, '');
    return descobrirCorrecaoEmTitulos(q, itens);
  } catch {
    return '';
  }
}

async function buscarPorVeiculo(veiculo, q, topicTerm, loc, periodo = '24h', qTrad = '', topicTrad = '', qCorrigido = '', isEnrich = false, topicKey = '', isRefresh = false) {
  const dom = String(veiculo.d || '').trim().toLowerCase();
  if (!dom) return [];
  const maxArtigos = limiteArtigosPorPeriodo(periodo);

  if (isEnrich) {
    const qFoco = topicTerm ? `${topicTerm} site:${dom}` : (q ? `${q} site:${dom}` : `site:${dom}`);
    const bingUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(qFoco)}&format=rss&mkt=${encodeURIComponent(loc.mkt)}`;
    const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(qFoco)}&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`;

    const [bingXml, googleXml] = await Promise.all([fetchXml(bingUrl, 3800, isRefresh), fetchXml(googleUrl, 3800, isRefresh)]);
    let itensBing = parseRssItems(bingXml, veiculo.n);
    let itensGoogle = parseRssItems(googleXml, veiculo.n);

    if (!itensBing.length && !itensGoogle.length) {
      const bFall = `https://www.bing.com/news/search?q=${encodeURIComponent(`site:${dom}`)}&format=rss&mkt=${encodeURIComponent(loc.mkt)}`;
      const gFall = `https://news.google.com/rss/search?q=${encodeURIComponent(`site:${dom}`)}&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`;
      const [bfXml, gfXml] = await Promise.all([fetchXml(bFall, 3500, isRefresh), fetchXml(gFall, 3500, isRefresh)]);
      itensBing = parseRssItems(bfXml, veiculo.n);
      itensGoogle = parseRssItems(gfXml, veiculo.n);
    }

    const todos = [...itensBing, ...itensGoogle];
    return deduplicarEOrdenar(todos, '', [], maxArtigos, topicKey);
  }

  const qBase = qCorrigido && normalizar(qCorrigido) !== normalizar(q) ? qCorrigido : q;
  const qEfetivo = qTrad && normalizar(qTrad) !== normalizar(qBase) ? qTrad : qBase;
  const tEfetivo = topicTrad || topicTerm || '';

  const whenTag = periodo === '24h' ? ' when:1d' : (periodo === '7d' ? ' when:7d' : (periodo === '30d' ? ' when:30d' : ''));
  const bingInterval = periodo === '24h' ? '&qft=interval%3d%227%22' : (periodo === '7d' ? '&qft=interval%3d%228%22' : (periodo === '30d' ? '&qft=interval%3d%229%22' : ''));

  const termoNorm = normalizar(qBase);
  const tokens = termoNorm.split(/\s+/).filter((t) => t.length >= 2);
  const termoOrigNorm = normalizar(q);
  const tokensOrig = termoOrigNorm.split(/\s+/).filter((t) => t.length >= 2);
  const termoTradNorm = normalizar(qEfetivo);
  const tokensTrad = termoTradNorm.split(/\s+/).filter((t) => t.length >= 2);

  const qConsulta = extrairTermoResilienteConsulta(qEfetivo);
  const qBaseConsulta = extrairTermoResilienteConsulta(qBase);

  const requisicoes = [
    fetchXml(`https://www.bing.com/news/search?q=${encodeURIComponent(`${qConsulta} site:${dom}`)}&format=rss&mkt=${encodeURIComponent(loc.mkt)}${bingInterval}`, 4200, isRefresh),
    fetchXml(`https://news.google.com/rss/search?q=${encodeURIComponent(`${qConsulta} site:${dom}` + whenTag)}&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`, 4200, isRefresh),
  ];

  // Em "Todo o período" (ou quando há tópico ativo), executa queries adicionais de profundidade
  if (periodo === 'all') {
    if (tEfetivo && normalizar(tEfetivo) !== normalizar(qConsulta)) {
      requisicoes.push(
        fetchXml(`https://news.google.com/rss/search?q=${encodeURIComponent(`${qConsulta} ${tEfetivo} site:${dom}`)}&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`, 3800, isRefresh)
      );
    }
    if (normalizar(qBaseConsulta) !== normalizar(qConsulta)) {
      requisicoes.push(
        fetchXml(`https://news.google.com/rss/search?q=${encodeURIComponent(`${qBaseConsulta} site:${dom}`)}&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`, 3600, isRefresh)
      );
    }
  } else if (tEfetivo && normalizar(tEfetivo) !== normalizar(qConsulta)) {
    requisicoes.push(
      fetchXml(`https://news.google.com/rss/search?q=${encodeURIComponent(`${qConsulta} ${tEfetivo} site:${dom}` + whenTag)}&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`, 3500, isRefresh)
    );
  }

  const xmlList = await Promise.all(requisicoes);
  let todosBrutos = [];
  for (const xml of xmlList) {
    if (xml) todosBrutos.push(...parseRssItems(xml, veiculo.n));
  }

  if (todosBrutos.length === 0 && periodo === '24h') {
    const googleSemWhenUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`${qConsulta} site:${dom}`)}&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`;
    const fallbackXml = await fetchXml(googleSemWhenUrl, 4200, isRefresh);
    todosBrutos = parseRssItems(fallbackXml, veiculo.n);
  }

  const combinaQualquer = (it) =>
    combinaComTermo(it, termoNorm, tokens) ||
    combinaComTermo(it, termoTradNorm, tokensTrad) ||
    combinaComTermo(it, termoOrigNorm, tokensOrig);

  let combinados = todosBrutos
    .filter((it) => combinaQualquer(it) && dentroDoPeriodo(it.publicadoEm, periodo));

  if (combinados.length === 0 && todosBrutos.length > 0) {
    combinados = todosBrutos.filter((it) => dentroDoPeriodo(it.publicadoEm, periodo));
  }

  return deduplicarEOrdenar(combinados, termoNorm, tokens, maxArtigos, topicKey);
}

function limparCacheExpirado() {
  const agora = Date.now();
  for (const [k, v] of CACHE_MEMORIA.entries()) {
    if (v.expiraEm <= agora) CACHE_MEMORIA.delete(k);
  }
  if (CACHE_MEMORIA.size > 200) {
    const primeira = CACHE_MEMORIA.keys().next().value;
    if (primeira) CACHE_MEMORIA.delete(primeira);
  }
}

// Busca agregada em lotes de domínios para capturar muito mais matérias em "Todo o período"
async function buscarArtigosAgregadosPais(dominios, qBusca, loc, per, topicTrad = '', isRefresh = false) {
  if (!dominios || !dominios.length || !qBusca) return [];
  const whenTag = per === '24h' ? ' when:1d' : (per === '7d' ? ' when:7d' : (per === '30d' ? ' when:30d' : ''));
  const qConsulta = extrairTermoResilienteConsulta(qBusca);

  const lotes = [];
  const tamanhoLote = 9;
  for (let i = 0; i < Math.min(dominios.length, 36); i += tamanhoLote) {
    lotes.push(dominios.slice(i, i + tamanhoLote));
  }

  const consultas = [];
  const bingInterval = per === '24h' ? '&qft=interval%3d%227%22' : (per === '7d' ? '&qft=interval%3d%228%22' : (per === '30d' ? '&qft=interval%3d%229%22' : ''));
  consultas.push(
    fetchXml(`https://www.bing.com/news/search?q=${encodeURIComponent(qConsulta)}&format=rss&mkt=${encodeURIComponent(loc.mkt)}${bingInterval}`, 3800, isRefresh)
  );
  for (const lote of lotes) {
    const orClause = lote.map((d) => `site:${d}`).join(' OR ');
    const qPrincipal = `${qConsulta} (${orClause})${whenTag}`;
    consultas.push(
      fetchXml(`https://news.google.com/rss/search?q=${encodeURIComponent(qPrincipal)}&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`, 4200, isRefresh)
    );
    if (per === 'all' && topicTrad && normalizar(topicTrad) !== normalizar(qConsulta)) {
      const qTematica = `${qConsulta} ${topicTrad} (${orClause})`;
      consultas.push(
        fetchXml(`https://news.google.com/rss/search?q=${encodeURIComponent(qTematica)}&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`, 4000, isRefresh)
      );
    }
  }

  const xmls = await Promise.all(consultas);
  const todos = [];
  for (const xml of xmls) {
    if (xml) todos.push(...parseRssItems(xml, ''));
  }
  return todos.filter((it) => dentroDoPeriodo(it.publicadoEm, per));
}

async function buscarTopicosEmAltaPais(loc, dominios = [], topicTerm = '', isRefresh = false) {
  try {
    const urlHeadlines = topicTerm
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(topicTerm + ' when:7d')}&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`
      : `https://news.google.com/rss?hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`;
    let xml = await fetchXml(urlHeadlines, 3800, isRefresh);
    let itens = parseRssItems(xml, '');

    if (!itens.length && dominios.length > 0) {
      const orClause = dominios.slice(0, 8).map((d) => `site:${d}`).join(' OR ');
      const urlFall = `https://news.google.com/rss/search?q=${encodeURIComponent(`(${orClause}) when:7d`)}&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`;
      xml = await fetchXml(urlFall, 3800, isRefresh);
      itens = parseRssItems(xml, '');
    }

    if (!itens.length) return [];
    itens.sort((a, b) => compareIsoDesc(a.publicadoEm, b.publicadoEm));
    return extrairTopicosEmAlta([{ artigos: itens }], '');
  } catch {
    return [];
  }
}

const STOPWORDS_TRENDING = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'o', 'a', 'os', 'as',
  'para', 'com', 'por', 'que', 'se', 'um', 'uma', 'sobre', 'sem', 'diz', 'tem', 'ao', 'aos',
  'ante', 'apos', 'sob', 'entre', 'como', 'mais', 'mas', 'nao', 'vai', 'foi', 'ser', 'ate',
  'folha', 'globo', 'estadao', 'brasil', 'uol', 'noticias', 'veja', 'opiniao', 'coluna', 'g1',
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'new', 'news', 'after', 'over', 'says'
]);

function extrairTopicosEmAlta(grupos, termoAtual) {
  if (!Array.isArray(grupos) || !grupos.length) return [];
  const contagem = new Map();
  const formasOriginais = new Map();
  const termoNorm = normalizar(termoAtual);

  for (const g of grupos) {
    for (const art of (g.artigos || [])) {
      const titLimpo = String(art.titulo || '').replace(/[-–—|].*$/, '').trim();
      const palavras = titLimpo.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
      for (let i = 0; i < palavras.length; i++) {
        const p = palavras[i];
        const n = normalizar(p);
        if (/^[A-ZÀ-Ý]/.test(p) && p.length >= 3 && !STOPWORDS_TRENDING.has(n) && n !== termoNorm) {
          contagem.set(n, (contagem.get(n) || 0) + 1);
          if (!formasOriginais.has(n)) formasOriginais.set(n, p);

          if (i < palavras.length - 1) {
            const p2 = palavras[i + 1];
            const n2 = normalizar(p2);
            if (/^[A-ZÀ-Ý]/.test(p2) && p2.length >= 3 && !STOPWORDS_TRENDING.has(n2)) {
              const par = p + ' ' + p2;
              const parNorm = normalizar(par);
              contagem.set(parNorm, (contagem.get(parNorm) || 0) + 2);
              if (!formasOriginais.has(parNorm)) formasOriginais.set(parNorm, par);
            }
          }
        }
      }
    }
  }

  return [...contagem.entries()]
    .filter(([k, count]) => count >= 2 && k.length >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => formasOriginais.get(k))
    .slice(0, 10);
}

async function handleBuscaAssunto(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ erro: 'metodo', mensagem: 'Use GET ou POST.' }, 405, SEM_CACHE);
  }

  let params = {};
  if (req.method === 'POST') {
    try {
      params = (await req.json()) || {};
    } catch {
      return json({ erro: 'formato', mensagem: 'JSON inválido.' }, 400, SEM_CACHE);
    }
  } else {
    const u = new URL(req.url);
    params = {
      q: u.searchParams.get('q') || '',
      mode: u.searchParams.get('mode') || '',
      trending: u.searchParams.get('trending') === '1' || u.searchParams.get('mode') === 'trending',
      cont: u.searchParams.get('cont') || '',
      country: u.searchParams.get('country') || '',
      countryName: u.searchParams.get('countryName') || '',
      topic: u.searchParams.get('topic') || '',
      topicTerm: u.searchParams.get('topicTerm') || '',
      lang: u.searchParams.get('lang') || 'pt',
      periodo: u.searchParams.get('periodo') || '24h',
      outlets: [],
    };
    const rawOutlets = u.searchParams.get('outlets') || '';
    if (rawOutlets) {
      try {
        params.outlets = JSON.parse(rawOutlets);
      } catch {
        params.outlets = [];
      }
    }
  }

  const isRefresh = isRefreshRequest(req, req.method === 'POST' ? params : null);
  const isTrendingMode = Boolean(params.mode === 'trending' || params.trending);
  const isEnrich = Boolean(params.isEnrich || params.enrich);
  const q = limparTermo(params.q || params.assunto || '');
  if (!isTrendingMode && !isEnrich && q.length < 2) {
    return json({ erro: 'vazio', mensagem: 'Digite pelo menos 2 caracteres para buscar.' }, 400, SEM_CACHE);
  }

  const cont = String(params.cont || '').slice(0, 20);
  const country = String(params.country || params.pais || '').slice(0, 10);
  const countryName = String(params.countryName || params.paisNome || '').slice(0, 80);
  const topic = String(params.topic || '').slice(0, 30);
  const topicTerm = String(params.topicTerm || '').slice(0, 50);
  const lang = String(params.lang || 'pt').slice(0, 10);
  const periodo = ['24h', '7d', '30d', 'all'].includes(params.periodo) ? params.periodo : (isEnrich ? 'all' : '24h');

  const rawOutlets = Array.isArray(params.outlets)
    ? params.outlets
    : (Array.isArray(params.veiculos) ? params.veiculos : []);

  let listaVeiculos = rawOutlets
    .slice(0, MAX_VEICULOS_PAIS)
    .map((o) => {
      let d = String(o.d || '').replace(/^www\./i, '').trim();
      if (!d && o.u) {
        try {
          const uObj = new URL(o.u);
          d = uObj.hostname.replace(/^www\./i, '');
        } catch { }
      }
      return {
        n: String(o.n || '').slice(0, 80),
        u: String(o.u || '').slice(0, 200),
        d: d.slice(0, 120),
        b: String(o.b || 'I').slice(0, 2),
        ind: !!o.ind,
        st: !!o.st,
        pais: String(o.pais || country || '').toUpperCase().slice(0, 4),
      };
    })
    .filter((o) => o.n && o.d);

  if (!listaVeiculos.length && (country === 'BR' || country === '076' || !country)) {
    listaVeiculos = [
      { n: 'g1', u: 'https://g1.globo.com', d: 'g1.globo.com', b: 'I', ind: false, st: false, pais: 'BR' },
      { n: 'Folha de S.Paulo', u: 'https://www.folha.uol.com.br', d: 'folha.uol.com.br', b: 'I', ind: true, st: false, pais: 'BR' },
      { n: 'O Globo', u: 'https://oglobo.globo.com', d: 'oglobo.globo.com', b: 'I', ind: false, st: false, pais: 'BR' },
      { n: 'Estadão', u: 'https://www.estadao.com.br', d: 'estadao.com.br', b: 'D', ind: false, st: false, pais: 'BR' },
      { n: 'Agência Brasil', u: 'https://agenciabrasil.ebc.com.br', d: 'agenciabrasil.ebc.com.br', b: 'I', ind: false, st: true, pais: 'BR' },
      { n: 'CartaCapital', u: 'https://www.cartacapital.com.br', d: 'cartacapital.com.br', b: 'E', ind: true, st: false, pais: 'BR' },
      { n: 'Poder360', u: 'https://www.poder360.com.br', d: 'poder360.com.br', b: 'D', ind: true, st: false, pais: 'BR' },
      { n: 'CNN Brasil', u: 'https://www.cnnbrasil.com.br', d: 'cnnbrasil.com.br', b: 'I', ind: false, st: false, pais: 'BR' }
    ];
  }

  if (!listaVeiculos.length) {
    return json({
      termo: q,
      contexto: { cont, country, countryName, topic },
      grupos: [],
      totalArtigos: 0,
      fallback: true,
      atualizadoEm: new Date().toISOString(),
    }, 200, SEM_CACHE);
  }

  const chaveCache = [
    isEnrich ? 'enrich' : 'search',
    normalizar(q),
    cont,
    country,
    topic,
    lang,
    periodo,
    listaVeiculos.map((v) => v.d).join(','),
  ].join('|');

  limparCacheExpirado();
  if (isRefresh) {
    CACHE_MEMORIA.delete(chaveCache);
  } else {
    const emCache = CACHE_MEMORIA.get(chaveCache);
    if (emCache && emCache.expiraEm > Date.now()) {
      return json({ ...emCache.payload, cache: true, fallback: false }, 200, CACHE_HEADERS);
    }
  }

  const loc = localeParams(lang, country);

  if (isTrendingMode) {
    const chaveCacheTrend = `trending|${(country || 'BR').toUpperCase()}|${(lang || 'pt').toLowerCase()}|${topic || 'all'}`;
    limparCacheExpirado();
    if (isRefresh) {
      CACHE_MEMORIA.delete(chaveCacheTrend);
    } else {
      const emCacheTrend = CACHE_MEMORIA.get(chaveCacheTrend);
      if (emCacheTrend && emCacheTrend.expiraEm > Date.now()) {
        return json({ ...emCacheTrend.payload, cache: true, fallback: false }, 200, CACHE_HEADERS);
      }
    }
    const domsTrend = listaVeiculos.map((v) => v.d).filter(Boolean);
    const topicosTrend = await buscarTopicosEmAltaPais(loc, domsTrend, topicTerm, isRefresh);
    const isTrendFallback = topicosTrend.length === 0;
    const payloadTrend = {
      country: (country || 'BR').toUpperCase(),
      lang: lang || 'pt',
      topicosEmAlta: topicosTrend,
      fallback: isTrendFallback,
      atualizadoEm: new Date().toISOString(),
    };
    if (!isTrendFallback) {
      CACHE_MEMORIA.set(chaveCacheTrend, {
        expiraEm: Date.now() + CACHE_TTL_MS,
        payload: payloadTrend,
      });
    }
    return json(
      payloadTrend,
      200,
      newsResponseHeaders({ isRefresh, isFallback: isTrendFallback, corsHeaders: CORS_HEADERS })
    );
  }

  let qCorrigido = isEnrich ? q : corrigirTermoEstatico(q);
  const jaCorrigiuEstatico = !isEnrich && normalizar(qCorrigido) !== normalizar(q);

  let qTrad = '', topicTrad = '', qDescoberto = '';
  if (!isEnrich) {
    const res = await Promise.all([
      traduzirTermoParaIdioma(jaCorrigiuEstatico ? qCorrigido : q, lang),
      topicTerm ? traduzirTermoParaIdioma(topicTerm, lang) : Promise.resolve(''),
      jaCorrigiuEstatico ? Promise.resolve('') : descobrirTermoViaGoogleNews(q, loc, isRefresh),
    ]);
    qTrad = res[0] || '';
    topicTrad = res[1] || '';
    qDescoberto = res[2] || '';
  }

  if (!jaCorrigiuEstatico && qDescoberto && normalizar(qDescoberto) !== normalizar(q)) {
    qCorrigido = qDescoberto;
  }

  const termoCorrigidoFinal = normalizar(qCorrigido) !== normalizar(q) ? qCorrigido : '';
  const codigoBandeiraPadrao = String(country || '').toLowerCase();

  async function coletarPorPeriodo(per) {
    const maxArtigos = limiteArtigosPorPeriodo(per);
    const dominiosPais = listaVeiculos.map((v) => v.d).filter(Boolean);
    const qBaseEfetiva = jaCorrigiuEstatico ? qCorrigido : q;
    const qFinalBusca = qTrad && normalizar(qTrad) !== normalizar(qBaseEfetiva) ? qTrad : qBaseEfetiva;

    const agregadosRawPromise = (!isEnrich && dominiosPais.length > 0)
      ? buscarArtigosAgregadosPais(dominiosPais, qFinalBusca, loc, per, topicTrad || topicTerm, isRefresh)
      : Promise.resolve([]);

    const [agregadosRaw, resultadosIndividuais] = await Promise.all([
      agregadosRawPromise,
      Promise.all(
        listaVeiculos.map(async (veic) => {
          const codigoPaisVeic = String(veic.pais || country || '').toUpperCase();
          const flagCode = codigoPaisVeic ? codigoPaisVeic.toLowerCase() : codigoBandeiraPadrao;
          const bandeiraUrl = flagCode ? `https://flagcdn.com/w80/${flagCode}.png` : '';
          const artigosRaw = await buscarPorVeiculo(veic, q, topicTerm, loc, per, qTrad, topicTrad, termoCorrigidoFinal, isEnrich, topic, isRefresh);
          return { veic, artigosRaw, codigoPaisVeic, bandeiraUrl };
        })
      )
    ]);

    const imagensPorTitulo = new Map();
    for (const art of agregadosRaw) {
      if (art && art.imagem && art.titulo) {
        const tk = normalizar(art.titulo).replace(/[^a-z0-9]/g, '').slice(0, 42);
        if (tk && !imagensPorTitulo.has(tk)) imagensPorTitulo.set(tk, art.imagem);
      }
    }
    const artigosPorDominio = new Map();
    for (const art of agregadosRaw) {
      if (!art || !art.url) continue;
      let veicAlvo = null;
      let hostArt = '';
      try {
        hostArt = new URL(art.url).hostname.replace(/^www\./i, '').toLowerCase();
      } catch { }

      for (const v of listaVeiculos) {
        const vd = v.d.toLowerCase();
        if ((hostArt && (hostArt === vd || hostArt.endsWith('.' + vd))) || (art.veiculo && normalizar(art.veiculo).includes(normalizar(v.n)))) {
          veicAlvo = v;
          break;
        }
      }

      if (veicAlvo) {
        const chave = veicAlvo.d;
        if (!artigosPorDominio.has(chave)) artigosPorDominio.set(chave, []);
        artigosPorDominio.get(chave).push({ ...art, veiculo: veicAlvo.n });
      }
    }

    const termoNormTokens = normalizar(qBaseEfetiva).split(/\s+/).filter((t) => t.length >= 2);
    const res = resultadosIndividuais.map(({ veic, artigosRaw, codigoPaisVeic, bandeiraUrl }) => {
      const extras = artigosPorDominio.get(veic.d) || [];
      const todos = [...artigosRaw, ...extras];
      const combinados = deduplicarEOrdenar(todos, normalizar(qBaseEfetiva), termoNormTokens, maxArtigos, topic);
      const artigos = combinados.map((art) => {
        let img = art.imagem || '';
        if (!img && art.titulo) {
          const tk = normalizar(art.titulo).replace(/[^a-z0-9]/g, '').slice(0, 42);
          if (tk && imagensPorTitulo.has(tk)) img = imagensPorTitulo.get(tk);
        }
        return {
          ...art,
          imagem: img,
          image: img,
          pais: codigoPaisVeic,
          bandeira: bandeiraUrl,
        };
      });
      return {
        veiculo: veic.n,
        dominio: veic.d,
        urlVeiculo: veic.u,
        vies: veic.b,
        independente: veic.ind,
        estatal: veic.st,
        pais: codigoPaisVeic,
        bandeira: bandeiraUrl,
        artigos,
      };
    });

    return res.filter((g) => g.artigos.length > 0);
  }

  const inicioExecucao = Date.now();
  const TEMPO_LIMITE_MS = 8200;

  let periodoEfetivo = periodo;
  let grupos = await coletarPorPeriodo(periodoEfetivo);
  let totalInicial = grupos.reduce((acc, g) => acc + g.artigos.length, 0);

  if (!isEnrich && totalInicial < 3 && periodoEfetivo === '24h' && (Date.now() - inicioExecucao < TEMPO_LIMITE_MS - 2500)) {
    const grupos7d = await coletarPorPeriodo('7d');
    if (grupos7d.reduce((acc, g) => acc + g.artigos.length, 0) > totalInicial) {
      periodoEfetivo = '7d';
      grupos = grupos7d;
      totalInicial = grupos.reduce((acc, g) => acc + g.artigos.length, 0);
    }
  }

  if (!isEnrich && totalInicial === 0 && periodoEfetivo !== 'all' && (Date.now() - inicioExecucao < TEMPO_LIMITE_MS - 1800)) {
    const gruposAll = await coletarPorPeriodo('all');
    if (gruposAll.reduce((acc, g) => acc + g.artigos.length, 0) > 0) {
      periodoEfetivo = 'all';
      grupos = gruposAll;
      totalInicial = grupos.reduce((acc, g) => acc + g.artigos.length, 0);
    }
  }


  const totalArtigos = grupos.reduce((acc, g) => acc + g.artigos.length, 0);
  const topicosEmAlta = isEnrich ? [] : extrairTopicosEmAlta(grupos, q);
  const isFallback = totalArtigos === 0;

  const payload = {
    termo: q,
    termoCorrigido: termoCorrigidoFinal || '',
    periodo: periodoEfetivo,
    periodoSolicitado: periodo,
    contexto: { cont, country, countryName, topic },
    grupos,
    resultados: grupos,
    topicosEmAlta,
    totalArtigos,
    fallback: isFallback,
    atualizadoEm: new Date().toISOString(),
  };

  if (!isFallback) {
    CACHE_MEMORIA.set(chaveCache, {
      expiraEm: Date.now() + CACHE_TTL_MS,
      payload,
    });
  }

  return json(
    payload,
    200,
    newsResponseHeaders({ isRefresh, isFallback, corsHeaders: CORS_HEADERS })
  );
};

export async function onRequestGet(context) {
  return handleBuscaAssunto(context.request);
}

export async function onRequestPost(context) {
  return handleBuscaAssunto(context.request);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}



