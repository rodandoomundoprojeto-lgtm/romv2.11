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
  'sobre', 'sob', 'ao', 'aos', 'aqui', 'ali', 'como', 'mais', 'menos', 'quase', 'cerca', 'mas', 'ou', 'seus', 'suas', 'seu', 'sua',
  'antes', 'apos', 'entre', 'contra', 'desde', 'durante', 'ate', 'sem', 'disse', 'diz', 'dizem', 'fala', 'veja', 'saiba', 'entenda',
  'pega', 'pegou', 'pegam', 'deixa', 'deixou', 'deixam', 'faz', 'fez', 'fazem', 'fica', 'ficou', 'ficam',
  'leva', 'levou', 'levam', 'causa', 'causou', 'causam', 'provoca', 'provocou', 'registra', 'registrou',
  'atinge', 'atingiu', 'chega', 'chegou', 'passa', 'passou', 'vira', 'virou', 'entra', 'entrou', 'sai', 'saiu',
  'segue', 'seguiu', 'pode', 'podem', 'deve', 'devem', 'vai', 'vao', 'foi', 'foram', 'esta', 'estao', 'tem', 'teve',
  'afirma', 'afirmou', 'anuncia', 'anunciou', 'aponta', 'apontou', 'mostra', 'mostrou', 'revela', 'revelou', 'pede', 'pediu', 'cobra', 'cobrou',
  'novo', 'nova', 'novos', 'novas', 'hoje', 'ontem', 'agora', 'onde', 'quando', 'porque', 'isso', 'aquilo',
  'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela',
  'the', 'of', 'and', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'from', 'into', 'over', 'after', 'amid', 'least', 'more', 'than',
  'leaves', 'left', 'catches', 'caught', 'says', 'said', 'has', 'have', 'had', 'was', 'were', 'are', 'is', 'been', 'will', 'would', 'could',
  'la', 'el', 'los', 'las', 'del', 'al', 'en', 'con', 'un', 'una', 'tras', 'ante', 'bajo',
  'le', 'les', 'des', 'du', 'et', 'dans', 'sur', 'avec', 'pour', 'par', 'plus', 'moins', 'apres',
  'und', 'mit', 'von', 'auf', 'fur', 'uber', 'nach', 'bei', 'aus', 'einem', 'einer', 'mindestens',
  'في', 'فى', 'من', 'على', 'إلى', 'الى', 'عن', 'مع', 'بعد', 'قبل', 'أقل', 'اقل', 'أكثر', 'اكثر', 'نحو', 'ما', 'لا', 'يقل', 'شخصا', 'شخصًا'
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
  'inflacao', 'orcamento', 'eleicao', 'eleicoes', 'sancoes', 'tarifa', 'tarifas', 'tarifaco', 'acordos', 'tratado',
  'exercito', 'marinha', 'aeronautica', 'armas', 'nuclear', 'espaco', 'satelite', 'satelites', 'internet', 'acoes',
  'bolsa', 'bolsas', 'investimento', 'investimentos', 'divida', 'pib', 'credito', 'financas', 'trabalho', 'salario',
  'greve', 'protesto', 'protestos', 'manifestacao', 'crise', 'ataque', 'ataques', 'paz', 'cessar-fogo', 'tregua',
  'caminhao', 'tanque', 'caminhao-tanque', 'combustivel', 'fogo', 'incendio', 'chamas', 'explosao', 'acidente', 'colisao',
  'morte', 'mortes', 'mortos', 'feridos', 'vitimas', 'terremoto', 'sismo', 'enchente', 'inundacao', 'bombardeio', 'misseis', 'drones', 'refens',
  'primeiro-ministro', 'porta-avioes', 'vice-presidente', 'meio-ambiente',
  'fronteiras', 'imigrantes', 'refugiados', 'mulheres', 'jovens', 'infancia', 'moradia', 'transporte',
  'antes', 'apos', 'sobre', 'entre', 'contra', 'desde', 'durante', 'ate', 'sem', 'sob', 'disse', 'diz',
  'fala', 'veja', 'novo', 'nova', 'hoje', 'ontem', 'agora', 'como', 'onde', 'quando', 'porque', 'isso', 'aquilo'
].map((x) => normalizar(x)));

function ehTokenCJK(str) {
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(String(str || ''));
}

function ehTokenNumericoPuro(str) {
  const s = String(str || '').trim();
  if (!s) return false;
  return /^\d+(?:[.,]\d+)?(?:mn|bn|m|b|k|mil|bi|tri|%|º|ª|th|st|nd|rd)?$/i.test(s);
}

const ALIASES_PAIS_BUSCA = {
  CL: ['chile', 'chileno', 'chilena', 'chilenos', 'chilenas'],
  BR: ['brasil', 'brazil', 'brasileiro', 'brasileira', 'brasileiros', 'brasileiras', 'brazilian'],
  US: ['estados unidos', 'eua', 'usa', 'united states', 'americano', 'americana', 'americanos', 'americanas', 'american', 'norte americano', 'norte americana'],
  AR: ['argentina', 'argentino', 'argentinos', 'argentinas', 'argentine'],
  DE: ['alemanha', 'germany', 'deutschland', 'alemao', 'alema', 'alemaes', 'alemas', 'german', 'deutsche', 'deutschen'],
  FR: ['franca', 'france', 'frances', 'francesa', 'franceses', 'francesas', 'french', 'francais', 'francaise'],
  GB: ['reino unido', 'united kingdom', 'uk', 'inglaterra', 'england', 'britanico', 'britanica', 'britanicos', 'britanicas', 'british'],
  ES: ['espanha', 'spain', 'espana', 'espanhol', 'espanhola', 'espanhois', 'espanholas', 'spanish'],
  IT: ['italia', 'italy', 'italiano', 'italiana', 'italianos', 'italianas', 'italian'],
  PT: ['portugal', 'portugues', 'portuguesa', 'portugueses', 'portuguesas', 'portuguese'],
  JP: ['japao', 'japan', 'japones', 'japonesa', 'japoneses', 'japonesas', 'japanese', '日本'],
  CN: ['china', 'chines', 'chinesa', 'chineses', 'chinesas', 'chinese', '中国', '中國'],
  KR: ['coreia do sul', 'south korea', 'sul coreano', 'sul coreana', 'coreano', 'coreana', 'korean', '한국'],
  KP: ['coreia do norte', 'north korea', 'norte coreano', 'norte coreana', '북한'],
  RU: ['russia', 'russo', 'russa', 'russos', 'russas', 'russian', 'россия', 'российский'],
  UA: ['ucrania', 'ukraine', 'ucraniano', 'ucraniana', 'ucranianos', 'ucranianas', 'ukrainian', 'україна', 'украина'],
  IL: ['israel', 'israelense', 'israelenses', 'israeli', 'ישראל', 'إسرائيل'],
  PS: ['palestina', 'palestine', 'palestino', 'palestinos', 'palestinian', 'فلسطين'],
  IR: ['ira', 'iran', 'iraniano', 'iraniana', 'iranianos', 'iranianas', 'iranian', 'ایران', 'إيران'],
  IQ: ['iraque', 'iraq', 'iraquiano', 'iraqi', 'العراق'],
  LB: ['libano', 'lebanon', 'libanes', 'lebanese', 'لبنان'],
  SY: ['siria', 'syria', 'sirio', 'syrian', 'سوريا'],
  JO: ['jordania', 'jordan', 'jordaniano', 'jordanian', 'الأردن'],
  YE: ['iemen', 'yemen', 'iemenita', 'yemeni', 'اليمن'],
  AE: ['emirados arabes', 'emirados', 'uae', 'emirati', 'الإمارات'],
  QA: ['catar', 'qatar', 'catari', 'qatari', 'قطر'],
  KW: ['kuwait', 'koweit', 'الكويت'],
  OM: ['oma', 'oman', 'عمان'],
  BH: ['bahrein', 'bahrain', 'البحرين'],
  MX: ['mexico', 'mexicano', 'mexicana', 'mexicanos', 'mexicanas', 'mexican'],
  CO: ['colombia', 'colombiano', 'colombiana', 'colombianos', 'colombianas', 'colombian'],
  VE: ['venezuela', 'venezuelano', 'venezuelana', 'venezuelanos', 'venezuelanas', 'venezuelan'],
  PE: ['peru', 'peruano', 'peruana', 'peruanos', 'peruanas', 'peruvian'],
  UY: ['uruguai', 'uruguay', 'uruguaio', 'uruguaia', 'uruguaios', 'uruguaias', 'uruguayan'],
  PY: ['paraguai', 'paraguay', 'paraguaio', 'paraguaia', 'paraguaios', 'paraguaias'],
  EC: ['equador', 'ecuador', 'equatoriano', 'equatoriana', 'equatorianos', 'equatorianas'],
  BO: ['bolivia', 'boliviano', 'boliviana', 'bolivianos', 'bolivianas', 'bolivian'],
  CA: ['canada', 'canadense', 'canadenses', 'canadian'],
  AU: ['australia', 'australiano', 'australiana', 'australianos', 'australianas', 'australian'],
  IN: ['india', 'indiano', 'indiana', 'indianos', 'indianas', 'indian', 'भारत'],
  ZA: ['africa do sul', 'south africa', 'sul africano', 'sul africana', 'south african'],
  TR: ['turquia', 'turkey', 'turkiye', 'turco', 'turca', 'turcos', 'turcas', 'turkish'],
  SA: ['arabia saudita', 'saudi arabia', 'saudita', 'sauditas', 'saudi', 'السعودية'],
  EG: ['egito', 'egypt', 'egipcio', 'egipcia', 'egipcios', 'egipcias', 'egyptian', 'مصر', 'مصري', 'مصرية'],
  SD: ['sudao', 'sudan', 'sudanes', 'sudanese', 'السودان'],
  LY: ['libia', 'libya', 'libio', 'libyan', 'ليبيا'],
  TN: ['tunisia', 'tunisiano', 'tunisian', 'تونس'],
  DZ: ['argelia', 'algeria', 'argelino', 'algerian', 'الجزائر'],
  PL: ['polonia', 'poland', 'polska', 'polones', 'polonesa', 'poloneses', 'polonesas', 'polish'],
  NL: ['paises baixos', 'holanda', 'netherlands', 'holland', 'holandes', 'holandesa', 'dutch'],
  BE: ['belgica', 'belgium', 'belga', 'belgas', 'belgian'],
  CH: ['suica', 'switzerland', 'suico', 'suica', 'suicos', 'swiss', 'schweiz', 'suisse'],
  SE: ['suecia', 'sweden', 'sueco', 'sueca', 'suecos', 'swedish', 'sverige'],
  NO: ['noruega', 'norway', 'noruegues', 'norueguesa', 'noruegueses', 'norwegian', 'norge'],
  DK: ['dinamarca', 'denmark', 'dinamarques', 'dinamarquesa', 'danish', 'danmark'],
  FI: ['finlandia', 'finland', 'finlandes', 'finlandesa', 'finnish', 'suomi'],
  GR: ['grecia', 'greece', 'grego', 'grega', 'gregos', 'greek', 'ελλάδα'],
  CZ: ['republica tcheca', 'tchequia', 'czechia', 'czech republic', 'tcheco', 'tcheca'],
  HU: ['hungria', 'hungary', 'hungaro', 'hungara', 'hungarian'],
  RO: ['romenia', 'romania', 'romeno', 'romena', 'romanian'],
  AT: ['austria', 'austriaco', 'austriaca', 'austrian', 'osterreich'],
  IE: ['irlanda', 'ireland', 'irlandes', 'irlandesa', 'irish'],
  NZ: ['nova zelandia', 'new zealand', 'neozelandes', 'neozelandesa'],
  ID: ['indonesia', 'indonesio', 'indonesia', 'indonesian'],
  MY: ['malasia', 'malaysia', 'malaio', 'malaysian'],
  SG: ['singapura', 'cingapura', 'singapore', 'singaporean'],
  TH: ['tailandia', 'thailand', 'tailandes', 'tailandesa', 'thai', 'ไทย'],
  VN: ['vietna', 'vietnam', 'vietnamita', 'vietnamese'],
  PH: ['filipinas', 'philippines', 'filipino', 'filipina', 'filipinos'],
  TW: ['taiwan', 'taiwanes', 'taiwanesa', 'taiwanese', '台灣', '台湾'],
  HK: ['hong kong', '香港'],
  PK: ['paquistao', 'pakistan', 'paquistanes', 'paquistanesa', 'pakistani', 'پاکستان'],
  BD: ['bangladesh', 'banglades', 'bengali', 'বাংলাদেশ'],
  NG: ['nigeria', 'nigeriano', 'nigeriana', 'nigerianos', 'nigerian'],
  KE: ['quenia', 'kenya', 'queniano', 'queniana', 'kenyan'],
  MA: ['marrocos', 'morocco', 'marroquino', 'marroquina', 'moroccan', 'maroc', 'المغرب'],
};

function desacoplarPaisDaConsulta(termo, countryCode, countryName) {
  const raw = String(termo || '').trim();
  const emptyResult = { termoLocal: raw, countryTokensSet: new Set() };
  if (!raw) return emptyResult;

  const up = String(countryCode || '').toUpperCase().trim();
  const cNameNorm = normalizar(countryName || '');
  const frasesPais = new Set();

  if (cNameNorm) frasesPais.add(cNameNorm);
  const aliases = ALIASES_PAIS_BUSCA[up];
  if (Array.isArray(aliases)) {
    for (const al of aliases) {
      const n = normalizar(al);
      if (n) frasesPais.add(n);
    }
  }
  if (!frasesPais.size && !up) return emptyResult;

  const countryTokensSet = new Set();
  for (const fp of frasesPais) {
    countryTokensSet.add(fp);
    fp.split(/\s+/).forEach((part) => {
      if (part.length >= 3 && !STOPWORDS_BUSCA.has(part)) {
        countryTokensSet.add(part);
      }
    });
  }

  const preposicoes = new Set([
    'do', 'da', 'dos', 'das', 'de', 'no', 'na', 'nos', 'nas', 'em', 'sobre', 'para',
    'in', 'of', 'on', 'en', 'del', 'du', 'des', 'im', 'la', 'los', 'las', 'der',
  ]);
  const palavras = raw.replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const restantes = [];

  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i];
    const pClean = normalizar(p.replace(/[^\p{L}\p{N}-]/gu, '').replace(/-/g, ' '));
    if (!pClean) continue;

    let pulouMulti = false;
    for (const span of [3, 2]) {
      if (i + span <= palavras.length) {
        const cand = normalizar(
          palavras
            .slice(i, i + span)
            .join(' ')
            .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
            .replace(/-/g, ' ')
            .replace(/\s+/g, ' ')
        );
        if (frasesPais.has(cand)) {
          while (restantes.length > 0 && preposicoes.has(normalizar(restantes[restantes.length - 1]))) {
            restantes.pop();
          }
          i += span - 1;
          pulouMulti = true;
          break;
        }
      }
    }
    if (pulouMulti) continue;

    const ehPreposicaoAntesCodigo =
      up.length >= 2 &&
      pClean === normalizar(up) &&
      restantes.length > 0 &&
      preposicoes.has(normalizar(restantes[restantes.length - 1]));

    if (frasesPais.has(pClean) || ehPreposicaoAntesCodigo) {
      while (restantes.length > 0 && preposicoes.has(normalizar(restantes[restantes.length - 1]))) {
        restantes.pop();
      }
      continue;
    }

    restantes.push(p);
  }

  while (restantes.length > 0 && preposicoes.has(normalizar(restantes[0]))) {
    restantes.shift();
  }
  while (restantes.length > 0 && preposicoes.has(normalizar(restantes[restantes.length - 1]))) {
    restantes.pop();
  }

  const significativosRestantes = restantes.filter((w) => {
    const wn = normalizar(w).replace(/[^\p{L}\p{N}]/gu, '');
    return wn.length >= 2 && !STOPWORDS_BUSCA.has(wn);
  });

  if (significativosRestantes.length === 0) {
    return { termoLocal: raw, countryTokensSet: new Set() };
  }

  return {
    termoLocal: restantes.join(' ').trim(),
    countryTokensSet,
  };
}

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
    .replace(/(^|\s)-+(\s|$)/g, ' ')
    .replace(/[–—|:,;!?()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const palavras = limpo.split(/\s+/).filter(Boolean);

  if (palavras.length <= 4) {
    const semStop = palavras.filter((p) => {
      const n = normalizar(p);
      return n && !STOPWORDS_BUSCA.has(n) && !ehTokenNumericoPuro(n);
    });
    return semStop.length > 0 ? semStop.join(' ') : limpo;
  }

  const significativas = palavras.filter((p) => {
    const n = normalizar(p);
    if (!n || STOPWORDS_BUSCA.has(n) || ehTokenNumericoPuro(n)) return false;
    if (/^[A-Z0-9]{2,5}$/.test(p) || ehTokenCJK(p)) return n.length >= 2;
    return n.length >= 2;
  });

  if (significativas.length <= 4 && significativas.length > 0) {
    return significativas.join(' ');
  }

  const pontuadas = significativas.map((p, idx) => {
    const n = normalizar(p);
    let peso = 0;
    if (/\p{L}-\p{L}/u.test(p)) peso += 6;
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
      if (!n || n.length < 3 || /\p{L}-\p{L}/u.test(pal) || STOPWORDS_BUSCA.has(n) || PALAVRAS_COMUNS_INTACTAS.has(n)) return pal;
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
    if (!n || n.length < 3 || /\p{L}-\p{L}/u.test(pal) || STOPWORDS_BUSCA.has(n) || PALAVRAS_COMUNS_INTACTAS.has(n)) return pal;
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
    const bloco = entry.rawBlock || '';
    const sourceNome = nomeVeiculo || entry.source || '';
    const sourceUrl = extrairAtributo(bloco, 'source', 'url') || '';

    const titulo = limparTitulo(entry.title, sourceNome);
    if (!titulo) continue;

    const url = extrairUrlReal(entry.link);
    if (!url) continue;

    const pubDate = entry.pubDateIso || '';
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
      veiculo: sourceNome,
      sourceUrl,
      publicadoEm: pubDate,
    });
  }
  return items;
}

function limparMancheteContexto(s) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f<>{}\[\]`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function ehScriptSemitico(str) {
  return /[\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(String(str || ''));
}

function normalizarRaizSemitica(w) {
  let s = String(w || '').trim();
  if (!s) return '';
  // Remove tashkeel/diacríticos árabes e hebraicos e tatweel
  s = s.replace(/[\u064b-\u065f\u0670\u0640\u0591-\u05c7]/gu, '');
  // Unifica alef/ya/ta-marbuta em árabe para comparação resiliente
  s = s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
  return s;
}

function removerCliticoSemitico(w) {
  let s = normalizarRaizSemitica(w);
  if (s.length < 4) return s;
  // Prefixos clíticos árabes comuns: وال، بال، كال، فال، لل، ال، و، ب، ل، ف
  if (/^(?:وال|بال|كال|فال)/.test(s) && s.length >= 6) s = s.slice(3);
  else if (/^(?:ال|لل)/.test(s) && s.length >= 5) s = s.slice(2);
  else if (/^[وبلفك]ال/.test(s) && s.length >= 6) s = s.slice(3);
  else if (/^[وبلف]/.test(s) && s.length >= 5) s = s.slice(1);
  // Prefixos clíticos hebraicos comuns: וה، בה، לה، מה، שה، ה، ו، ב، ל، מ، ש
  else if (/^(?:וה|בה|לה|מה|שה)/.test(s) && s.length >= 5) s = s.slice(2);
  else if (/^[הובלמשכ]/.test(s) && s.length >= 5) s = s.slice(1);
  // Sufixo feminino/plural leve em árabe (ة / ه)
  if (s.length >= 4 && /[ةه]$/.test(s)) s = s.slice(0, -1);
  return s;
}

function tokenCasaScriptSemitico(tkRaw, alvoNorm, palavrasAlvo) {
  const tk = normalizarRaizSemitica(tkRaw);
  if (!tk || tk.length < 2) return false;
  const alvoSem = normalizarRaizSemitica(alvoNorm);
  if (tk.includes(' ')) {
    if (alvoSem.includes(tk)) return true;
    const partes = tk.split(/\s+/).filter((p) => p.length >= 2);
    if (partes.length >= 2) {
      return partes.every((p) => tokenCasaScriptSemitico(p, alvoSem, palavrasAlvo));
    }
    return false;
  }
  const raizTk = removerCliticoSemitico(tk);
  for (let i = 0; i < palavrasAlvo.length; i++) {
    const w = normalizarRaizSemitica(palavrasAlvo[i]);
    if (!w) continue;
    if (w === tk || w === raizTk) return true;
    const raizW = removerCliticoSemitico(w);
    if (raizTk.length >= 3 && raizW === raizTk) return true;
    if (raizTk.length >= 4 && (raizW.startsWith(raizTk) || raizTk.startsWith(raizW))) return true;
  }
  return false;
}

function tokenCombinaNoTexto(tk, alvo, palavrasAlvo) {
  if (!tk) return false;
  if (STOPWORDS_BUSCA.has(tk) || ehTokenNumericoPuro(tk)) return false;
  if (ehScriptSemitico(tk)) {
    return tokenCasaScriptSemitico(tk, alvo, palavrasAlvo);
  }
  if (ehTokenCJK(tk)) {
    return alvo.includes(tk);
  }
  if (tk.includes(' ')) {
    const tkEspaco = tk.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    const alvoEspaco = alvo.replace(/-/g, ' ').replace(/\s+/g, ' ');
    return alvo.includes(tk) || alvoEspaco.includes(tkEspaco);
  }
  if (tk.includes('-')) {
    const semHifen = tk.replace(/-/g, ' ').trim();
    const colado = tk.replace(/-/g, '').trim();
    const alvoEspaco = alvo.replace(/-/g, ' ').replace(/\s+/g, ' ');
    if (alvo.includes(tk) || alvoEspaco.includes(semHifen) || (colado.length >= 5 && alvo.includes(colado))) {
      return true;
    }
    const partesHifen = semHifen.split(/\s+/).filter((p) => p.length >= 3 && !STOPWORDS_BUSCA.has(p));
    if (partesHifen.length >= 2 && partesHifen.every((p) => tokenCasaComLimite(p, alvo, palavrasAlvo))) {
      return true;
    }
    return false;
  }
  if (tk.length <= 3) {
    return palavrasAlvo.includes(tk);
  }
  if (palavrasAlvo.includes(tk)) return true;
  if (tk.length < 4) return false;
  for (let i = 0; i < palavrasAlvo.length; i++) {
    const w = palavrasAlvo[i];
    if (w.length < 4) continue;
    // Plural/flexão direta apenas (NUNCA usar palavrasSimilares fonético aqui para não gerar falsos positivos)
    if (
      w === tk + 's' ||
      tk === w + 's' ||
      w === tk + 'es' ||
      tk === w + 'es' ||
      w === tk + 'n' ||
      tk === w + 'n' ||
      w === tk + 'en' ||
      tk === w + 'en'
    ) {
      return true;
    }
    if ((w.startsWith(tk) || tk.startsWith(w)) && Math.min(w.length, tk.length) >= 5 && Math.abs(w.length - tk.length) <= 3) {
      return true;
    }
  }
  return false;
}

function tokenCasaComLimite(tkRaw, alvo, palavrasAlvo) {
  const tk = normalizar(tkRaw);
  if (!tk || ehTokenNumericoPuro(tk) || STOPWORDS_BUSCA.has(tk)) return false;
  if (ehScriptSemitico(tk)) {
    return tokenCasaScriptSemitico(tk, alvo, palavrasAlvo);
  }
  if (ehTokenCJK(tk)) {
    return alvo.includes(tk);
  }
  if (!tk.includes(' ') && !tk.includes('-') && tk.length <= 3) {
    return palavrasAlvo.includes(tk);
  }
  return tokenCombinaNoTexto(tk, alvo, palavrasAlvo);
}

// Modificadores genéricos secundários que não devem bloquear match de conceito único forte (ex: "Terremoto costa")
const MODIFICADORES_SECUNDARIOS = new Set([
  'costa', 'coast', 'coastal', 'norte', 'sul', 'leste', 'oeste', 'central', 'centro', 'capital', 'regiao', 'region',
  'interior', 'fronteira', 'alta', 'queda', 'recorde', 'record', 'nivel', 'level', 'taxa', 'rate',
  'plano', 'plan', 'medida', 'medidas', 'projeto', 'caso', 'setor', 'sistema', 'nacional', 'global', 'mundial',
  'alerta', 'risco', 'impacto', 'efeito', 'dados', 'relatorio', 'report', 'update', 'crise'
]);

// Palavras genéricas de tradução de manchete que não devem criar auxBuckets espúrios (ex: "30 people dead" -> "people")
const PALAVRAS_VAZIAS_CONTEXTO = new Set([
  'people', 'person', 'persons', 'pessoas', 'pessoa', 'individuos', 'officials', 'authorities', 'autoridades',
  'today', 'yesterday', 'years', 'year', 'anos', 'days', 'week', 'month', 'time', 'part', 'number', 'numbers',
  'group', 'state', 'states', 'country', 'countries', 'world', 'news', 'media', 'video', 'videos', 'photo', 'photos',
  'report', 'reports', 'according', 'amid', 'following', 'near', 'around', 'several', 'dozens', 'dezenas',
  'شخص', 'اشخاص', 'أشخاص', 'عام', 'اليوم', 'أمس', 'مصادر', 'تفاصيل', 'فيديو', 'صور'
]);

// Dicionário universal de conceitos e sinônimos jornalísticos (multilíngue) para cobrir variações reais da imprensa
const GRUPOS_SINONIMOS_UNIVERSAIS = [
  {
    id: 'fuel_truck',
    triggers: ['caminhao-tanque', 'caminhao tanque', 'carreta-tanque', 'caminhao de combustivel', 'tanker truck', 'fuel tanker', 'fuel truck', 'petrol tanker', 'oil truck'],
    queryByLang: {
      en: '("fuel truck" OR tanker OR "fuel tanker" OR "oil truck")',
      ar: '("مواد بترولية" OR "شاحنة وقود" OR صهريج OR شاحنة)',
      es: '("camión cisterna" OR "pipa de combustible")',
      fr: '("camion-citerne" OR "camion citerne")',
      de: '(Tanklastwagen OR Tankwagen)',
      ja: '(タンクローリー)',
    },
    matchTerms: [
      'fuel truck', 'tanker truck', 'tank truck', 'fuel tanker', 'petrol tanker', 'oil truck', 'oil tanker', 'tanker', 'tankers',
      'caminhao-tanque', 'caminhao tanque', 'carreta-tanque',
      'مواد بترولية', 'المواد البترولية', 'بترولية', 'شاحنة وقود', 'شاحنة صهريج', 'صهريج', 'ناقلة', 'شاحنة', 'タンクローリー', '유조차', 'מיכלית'
    ],
    matchTermsByLang: {
      es: ['camion cisterna', 'pipa de combustible'],
      fr: ['camion-citerne', 'camion citerne'],
      de: ['tanklastwagen', 'tankwagen'],
    },
  },
  {
    id: 'fire',
    triggers: ['fogo', 'incendio', 'incendios', 'chamas', 'pega fogo', 'pegou fogo', 'fire', 'wildfire', 'blaze', 'flames'],
    queryByLang: {
      en: '(fire OR blaze OR flames)',
      ar: '(حريق OR اشتعال OR نيران OR تفحم)',
      es: '(incendio OR fuego OR llamas)',
      fr: '(incendie OR feu OR flammes)',
      de: '(Brand OR Feuer OR Flammen)',
      ja: '(火災 OR 炎上 OR 火事)',
      ko: '(화재 OR 불)',
    },
    matchTerms: [
      'fire', 'fires', 'wildfire', 'wildfires', 'blaze', 'flames', 'inferno', 'burning', 'burned', 'ablaze',
      'fogo', 'incendio', 'incendios', 'chamas',
      'حريق', 'نيران', 'اشتعال', 'تفحم', 'اندلاع', 'שריפה', 'آتش', '火災', '炎上', '火事', '화재', '산불', 'пожар', 'возгорание'
    ],
    matchTermsByLang: {
      es: ['fuego', 'llamas'],
      fr: ['incendie', 'flammes'],
      de: ['brand', 'feuer', 'flammen'],
      tr: ['yangin'],
    },
  },
  {
    id: 'explosion',
    triggers: ['explosao', 'explosoes', 'explode', 'explodiu', 'explosion', 'blast', 'blasts'],
    queryByLang: {
      en: '(explosion OR blast)',
      ar: '(انفجار OR تفجير)',
      es: '(explosión OR estallido)',
      fr: '(explosion OR déflagration)',
      de: '(Explosion OR Detonation)',
      ja: '(爆発)',
    },
    matchTerms: [
      'explosion', 'explosions', 'blast', 'blasts', 'exploded', 'detonation',
      'explosao', 'explosoes',
      'انفجار', 'تفجير', 'פיצוץ', '爆発', '폭발', 'взрыв'
    ],
    matchTermsByLang: {
      es: ['estallido'],
      fr: ['deflagration'],
      tr: ['patlama'],
    },
  },
  {
    id: 'deaths',
    triggers: ['mortos', 'mortes', 'morte', 'morrem', 'morreu', 'vitimas', 'fatais', 'fatal', 'killed', 'dead', 'deaths', 'casualties', 'fatalities'],
    queryByLang: {
      en: '(killed OR dead OR deaths OR casualties)',
      ar: '(مصرع OR قتلى OR وفاة OR ضحايا OR مقتل)',
      es: '(muertos OR fallecidos OR víctimas)',
      fr: '(morts OR tués OR décès OR victimes)',
      de: '(Tote OR Todesopfer OR getötet)',
      ja: '(死亡 OR 死者 OR 犠牲者)',
      ko: '(사망 OR 사망자)',
    },
    matchTerms: [
      'killed', 'killing', 'kills', 'dead', 'death', 'deaths', 'deadly', 'fatal', 'fatalities', 'casualties', 'death toll',
      'mortos', 'mortes', 'morte', 'morrem', 'morreu', 'vitimas',
      'مصرع', 'قتلى', 'قتيل', 'وفاة', 'وفيات', 'ضحايا', 'مقتل', 'הרוגים', 'מותם', 'کشته', '死亡', '死者', '犠牲', '사망', '숨져', 'погибли', 'жертв'
    ],
    matchTermsByLang: {
      es: ['muertos', 'fallecidos'],
      fr: ['morts', 'tues', 'deces'],
      de: ['tote', 'toten', 'todesopfer', 'getotet', 'ums leben'],
      tr: ['olu', 'hayatini kaybetti'],
    },
  },
  {
    id: 'accident_crash',
    triggers: ['acidente', 'acidentes', 'colisao', 'capota', 'capotou', 'descarrilamento', 'engavetamento', 'accident', 'crash', 'collision', 'overturns', 'derailment'],
    queryByLang: {
      en: '(crash OR accident OR overturns OR collision)',
      ar: '(حادث OR تصادم OR انقلاب)',
      es: '(accidente OR choque OR colisión)',
      fr: '(accident OR collision)',
      de: '(Unfall OR Kollision OR Unglück)',
      ja: '(事故 OR 衝突)',
    },
    matchTerms: [
      'crash', 'crashes', 'crashed', 'accident', 'accidents', 'collision', 'overturns', 'overturned', 'derailment', 'pileup',
      'acidente', 'acidentes', 'colisao', 'capotamento',
      'حادث', 'تصادم', 'انقلاب', 'תאונה', 'حادثه', '事故', '衝突', '脱線', '사고', '충돌', 'авария', 'дтп', 'катастрофа'
    ],
    matchTermsByLang: {
      es: ['choque'],
      de: ['unfall', 'ungluck', 'kollision'],
      tr: ['kaza'],
    },
  },
  {
    id: 'ceasefire',
    triggers: ['cessar-fogo', 'cessar fogo', 'tregua', 'armisticio', 'ceasefire', 'truce'],
    queryByLang: {
      en: '(ceasefire OR truce)',
      ar: '("وقف إطلاق النار" OR هدنة)',
      he: '("הפסקת אש" OR עסקה)',
      ru: '(перемирие OR "прекращение огня")',
    },
    matchTerms: [
      'ceasefire', 'cease-fire', 'truce', 'armistice', 'cessar-fogo', 'tregua',
      'وقف إطلاق النار', 'وقف اطلاق النار', 'هدنة', 'הפסקת אש', 'آتش‌بس', '停戦', '休戦', '정전', '휴전', 'перемирие', 'прекращение огня'
    ],
    matchTermsByLang: {
      es: ['alto el fuego'],
      fr: ['cessez-le-feu'],
      de: ['waffenruhe', 'waffenstillstand'],
      tr: ['ateskes'],
    },
  },
  {
    id: 'earthquake',
    triggers: ['terremoto', 'terremotos', 'sismo', 'abalo sismico', 'earthquake', 'quake'],
    queryByLang: {
      en: '(earthquake OR quake OR seismic)',
      ja: '(地震 OR 震度)',
      ar: '(زلزال OR هزة أرضية)',
      tr: '(deprem)',
      es: '(terremoto OR sismo)',
      zh: '(地震)',
    },
    matchTerms: [
      'earthquake', 'earthquakes', 'quake', 'tremor', 'seismic', 'richter', 'terremoto', 'sismo',
      'زلزال', 'هزة', 'רעידת אדמה', 'زلزله', '地震', '震度', '지진', 'землетрясение'
    ],
    matchTermsByLang: {
      fr: ['seisme'],
      de: ['erdbeben'],
      tr: ['deprem'],
      id: ['gempa'],
    },
  },
  {
    id: 'flood',
    triggers: ['enchente', 'enchentes', 'inundacao', 'inundacoes', 'alagamento', 'flood', 'floods', 'flooding'],
    queryByLang: {
      en: '(flood OR floods OR flooding)',
      ar: '(فيضانات OR سيول)',
      es: '(inundaciones OR inundación)',
      de: '(Hochwasser OR Überschwemmung)',
      ja: '(洪水 OR 豪雨)',
    },
    matchTerms: [
      'flood', 'floods', 'flooding', 'flooded', 'deluge', 'flash flood', 'enchente', 'enchentes', 'inundacao',
      'فيضانات', 'سيول', 'שיטפונות', 'سیل', '洪水', '浸水', '홍수', '폭우', 'наводнение'
    ],
    matchTermsByLang: {
      es: ['inundaciones'],
      fr: ['inondation'],
      de: ['hochwasser', 'uberschwemmung'],
      id: ['banjir'],
      tr: ['sel'],
    },
  },
  {
    id: 'interest_rates',
    triggers: ['juros', 'taxa de juros', 'selic', 'corte de juros', 'alta de juros', 'interest rate', 'interest rates'],
    queryByLang: {
      en: '("interest rates" OR "interest rate" OR "rate cut" OR "rate hike")',
      ar: '("أسعار الفائدة" OR "سعر الفائدة" OR الفائدة)',
      de: '(Zinsen OR Leitzins)',
      fr: '("taux d\'intérêt" OR taux)',
      es: '("tasas de interés" OR "tipos de interés")',
      ja: '(金利 OR 利上げ OR 利下げ)',
      ko: '(금리 OR 기준금리)',
    },
    matchTerms: [
      'interest rate', 'interest rates', 'rate cut', 'rate hike', 'benchmark rate', 'policy rate', 'borrowing costs',
      'juros', 'selic',
      'أسعار الفائدة', 'سعر الفائدة', 'الفائدة', 'ריבית', '金利', '利上げ', '利下げ', '政策金利', '금리', '기준금리', 'ключевая ставка', 'ставка', '利率', '降息', '加息'
    ],
    matchTermsByLang: {
      es: ['tasas de interes', 'tipos de interes'],
      fr: ['taux'],
      de: ['zinsen', 'leitzins'],
      tr: ['faiz'],
    },
  },
  {
    id: 'tariffs',
    triggers: ['tarifa', 'tarifas', 'tarifaco', 'imposto de importacao', 'tariff', 'tariffs'],
    queryByLang: {
      en: '(tariffs OR tariff OR duties)',
      ar: '(رسوم جمركية OR تعريفات)',
      de: '(Zölle OR Strafzölle)',
      fr: '("droits de douane" OR tarifs)',
      es: '(aranceles OR tarifas)',
      ja: '(関税)',
      zh: '(关税 OR 關稅)',
      ko: '(관세)',
    },
    matchTerms: [
      'tariff', 'tariffs', 'duties', 'customs duties', 'trade war', 'levies',
      'tarifa', 'tarifas', 'tarifaco',
      'رسوم جمركية', 'تعريفات', 'جمركية', 'מכסים', 'تعرفه', '関税', '관세', '关税', '關稅', 'пошлины', 'тарифы'
    ],
    matchTermsByLang: {
      es: ['arancel', 'aranceles'],
      fr: ['droits de douane'],
      de: ['zolle', 'strafzolle'],
      tr: ['gumruk vergisi'],
    },
  },
  {
    id: 'inflation',
    triggers: ['inflacao', 'ipca', 'carestia', 'inflation'],
    queryByLang: {
      en: '(inflation OR CPI OR "consumer prices")',
      ar: '(التضخم OR تضخم)',
      de: '(Inflation OR Teuerung)',
      ja: '(インフレ OR 物価)',
      ko: '(인플레이션 OR 물가)',
      zh: '(通胀 OR 通貨膨脹 OR CPI)',
    },
    matchTerms: [
      'inflation', 'inflationary', 'cpi', 'consumer prices', 'cost of living',
      'inflacao', 'ipca',
      'التضخم', 'تضخم', 'אינפלציה', 'تورم', 'インフレ', '物価', '인플레이션', '물가', '通胀', '通貨膨脹', 'инфляция'
    ],
    matchTermsByLang: {
      es: ['inflacion'],
      de: ['teuerung'],
      tr: ['enflasyon'],
      id: ['inflasi'],
    },
  },
  {
    id: 'strike_labor',
    triggers: ['greve', 'greves', 'paralisacao', 'walkout'],
    queryByLang: {
      en: '(strike OR walkout OR stoppage)',
      fr: '(grève OR grèves)',
      de: '(Streik OR Warnstreik)',
      es: '(huelga OR paro)',
      ar: '(إضراب)',
    },
    matchTerms: [
      'strike', 'strikes', 'walkout', 'stoppage', 'industrial action',
      'greve', 'greves', 'paralisacao',
      'إضراب', 'اضراب', 'שביתה', 'اعتصاب', 'ストライキ', '파업', 'забастовка'
    ],
    matchTermsByLang: {
      es: ['huelga', 'paro'],
      de: ['streik', 'warnstreik'],
      tr: ['grev'],
    },
  },
  {
    id: 'protests',
    triggers: ['protesto', 'protestos', 'manifestacao', 'manifestacoes', 'protest', 'protests'],
    queryByLang: {
      en: '(protests OR protest OR demonstrations OR unrest)',
      ar: '(احتجاجات OR مظاهرات)',
      fr: '(manifestations OR protestations)',
      de: '(Proteste OR Demonstrationen)',
      es: '(protestas OR manifestaciones)',
    },
    matchTerms: [
      'protest', 'protests', 'protesters', 'demonstration', 'demonstrations', 'rally', 'rallies', 'unrest', 'riots',
      'protesto', 'protestos', 'manifestacao', 'manifestacoes',
      'احتجاجات', 'مظاهرات', 'تظاهرات', 'הפגנות', 'اعتراضات', 'デモ', '抗議', '시위', '집회', 'протесты', 'митинг'
    ],
    matchTermsByLang: {
      es: ['protestas', 'manifestaciones'],
      de: ['proteste', 'demonstrationen'],
      id: ['unjuk rasa'],
    },
  },
  {
    id: 'hostages',
    triggers: ['refem', 'refens', 'hostage', 'hostages'],
    queryByLang: {
      en: '(hostages OR hostage OR captives)',
      he: '(חטופים OR שבויים)',
      ar: '(رهائن OR أسرى OR محتجزين)',
    },
    matchTerms: [
      'hostage', 'hostages', 'captive', 'captives', 'abducted', 'kidnapped',
      'refem', 'refens',
      'رهائن', 'محتجزين', 'أسرى', 'חטופים', 'שבויים', 'گروگان', '人質', '인질', 'заложник'
    ],
    matchTermsByLang: {
      es: ['rehenes'],
      fr: ['otages'],
      de: ['geiseln'],
    },
  },
  {
    id: 'attack_military',
    triggers: ['ataque', 'ataques', 'bombardeio', 'bombardeios', 'misseis', 'missil', 'drones', 'airstrike', 'airstrikes'],
    queryByLang: {
      en: '(attack OR strike OR airstrike OR missiles OR drones)',
      ar: '(هجوم OR غارة OR قصف OR صواريخ OR مسيرات)',
      he: '(מתקפה OR תקיפה OR טילים OR כטב"ם)',
      uk: '(атака OR удар OR ракети OR дрони)',
      ru: '(атака OR удар OR ракеты OR беспилотники)',
    },
    matchTerms: [
      'attack', 'attacks', 'attacked', 'strike', 'strikes', 'airstrike', 'airstrikes', 'missile', 'missiles', 'drone', 'drones', 'shelling', 'bombardment', 'bombing',
      'ataque', 'ataques', 'bombardeio', 'misseis', 'missil',
      'هجوم', 'هجمات', 'غارة', 'غارات', 'قصف', 'صواريخ', 'صاروخ', 'مسيرات', 'مسيرة', 'מתקפה', 'תקיפה', 'טילים', 'حمله', 'موشک', '攻撃', 'ミサイル', '空爆', '공격', '미사일', 'атака', 'удар', 'ракет', 'дрон', 'беспилотник'
    ],
    matchTermsByLang: {
      de: ['angriff', 'luftangriff', 'raketen'],
      fr: ['attaque', 'frappe'],
      tr: ['saldiri'],
    },
  },
  {
    id: 'elections',
    triggers: ['eleicao', 'eleicoes', 'pleito', 'urnas', 'votacao', 'election', 'elections'],
    queryByLang: {
      en: '(election OR elections OR vote OR polls)',
      ar: '(انتخابات OR تصويت)',
      de: '(Wahl OR Wahlen)',
      fr: '(élection OR élections OR scrutin)',
      es: '(elecciones OR elección OR comicios)',
      ja: '(選挙 OR 投開票)',
      ko: '(선거 OR 대선 OR 총선)',
    },
    matchTerms: [
      'election', 'elections', 'electoral', 'vote', 'voting', 'ballot', 'polls', 'runoff',
      'eleicao', 'eleicoes', 'pleito', 'urnas', 'votacao',
      'انتخابات', 'تصويت', 'اقتراع', 'בחירות', '選挙', '投開票', '선거', '대선', '총선', 'выборы', 'голосование'
    ],
    matchTermsByLang: {
      es: ['elecciones', 'comicios'],
      fr: ['scrutin'],
      de: ['wahl', 'wahlen'],
      tr: ['secim'],
      id: ['pemilu'],
    },
  },
  {
    id: 'gdp',
    triggers: ['pib', 'gdp', 'produto interno bruto'],
    queryByLang: {
      en: '(GDP OR "economic growth")',
      de: '(BIP OR Wirtschaftswachstum)',
      ar: '("الناتج المحلي" OR "نمو اقتصادي")',
      ja: '(GDP OR 実質GDP OR 経済成長)',
      zh: '(GDP OR 经济增长)',
      ko: '(GDP OR 경제성장률)',
    },
    matchTerms: [
      'gdp', 'economic growth', 'gross domestic product', 'pib', 'ввп',
      'الناتج المحلي', 'نمو اقتصادي', 'תמ"ג', 'צמיחה', '実質gdp', '経済成長', '경제성장', '성장률', '经济增长'
    ],
    matchTermsByLang: {
      de: ['bip', 'wirtschaftswachstum'],
      it: ['pil'],
      nl: ['bbp'],
      pl: ['pkb'],
      tr: ['gsyh'],
    },
  },
];

// Idioma nativo primário de cada país (ISO Alpha-2) para cobertura universal dos 190+ países
const LOCALE_PRIMARIO_POR_PAIS = {
  BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt', CV: 'pt', GW: 'pt', ST: 'pt', TL: 'pt', MO: 'pt',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es', GT: 'es', CU: 'es',
  BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', GQ: 'es', PR: 'es',
  FR: 'fr', MC: 'fr', SN: 'fr', CI: 'fr', ML: 'fr', BF: 'fr', NE: 'fr', TG: 'fr', BJ: 'fr', GN: 'fr',
  GA: 'fr', CG: 'fr', CD: 'fr', CM: 'fr', CF: 'fr', TD: 'fr', DJ: 'fr', KM: 'fr', MG: 'fr', BI: 'fr',
  HT: 'fr', PF: 'fr', NC: 'fr', GF: 'fr', GP: 'fr', MQ: 'fr', RE: 'fr', YT: 'fr', MF: 'fr',
  EG: 'ar', SA: 'ar', AE: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', JO: 'ar', LB: 'ar', SY: 'ar',
  IQ: 'ar', YE: 'ar', PS: 'ar', LY: 'ar', TN: 'ar', DZ: 'ar', MA: 'ar', MR: 'ar', SD: 'ar',
  DE: 'de', AT: 'de', LI: 'de', CH: 'de', BE: 'fr', LU: 'fr',
  IT: 'it', SM: 'it', VA: 'it', NL: 'nl', SR: 'nl', AW: 'nl', CW: 'nl',
  PL: 'pl', UA: 'uk', RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
  CZ: 'cs', SK: 'sk', HU: 'hu', RO: 'ro', MD: 'ro', BG: 'bg',
  GR: 'el', CY: 'el', TR: 'tr', AZ: 'az', UZ: 'uz',
  SE: 'sv', AX: 'sv', NO: 'no', DK: 'da', FO: 'da', GL: 'da', FI: 'fi', IS: 'is',
  RS: 'sr', ME: 'sr', HR: 'hr', BA: 'bs', SI: 'sl', MK: 'mk', AL: 'sq', XK: 'sq',
  LT: 'lt', LV: 'lv', EE: 'et', GE: 'ka', AM: 'hy',
  IL: 'he', IR: 'fa', AF: 'fa',
  JP: 'ja', KR: 'ko', KP: 'ko', CN: 'zh-CN', TW: 'zh-TW', HK: 'zh-TW',
  IN: 'en', PK: 'en', BD: 'bn', LK: 'en', NP: 'ne',
  ID: 'id', MY: 'en', BN: 'ms', SG: 'en', PH: 'en',
  TH: 'th', VN: 'vi', MM: 'my', KH: 'km', LA: 'lo', MN: 'mn',
  ET: 'am', SO: 'so',
};

// Todos os idiomas reais da imprensa local por país (incluindo países bilíngues/multilíngues e edições em inglês)
const IDIOMAS_OFICIAIS_POR_PAIS = {
  EG: ['ar', 'en'], SA: ['ar', 'en'], AE: ['ar', 'en'], QA: ['ar', 'en'], KW: ['ar', 'en'],
  BH: ['ar', 'en'], OM: ['ar', 'en'], JO: ['ar', 'en'], SY: ['ar', 'en'], IQ: ['ar', 'en'],
  YE: ['ar', 'en'], PS: ['ar', 'en'], LY: ['ar', 'en'], SD: ['ar', 'en'],
  MA: ['fr', 'ar', 'en'], DZ: ['fr', 'ar', 'en'], TN: ['fr', 'ar', 'en'], LB: ['ar', 'fr', 'en'], MR: ['ar', 'fr', 'en'],
  IL: ['he', 'en', 'ar'], IR: ['fa', 'en'], AF: ['fa', 'en'], TR: ['tr', 'en'],
  JP: ['ja', 'en'], KR: ['ko', 'en'], KP: ['ko', 'en'],
  CN: ['zh-CN', 'en'], TW: ['zh-TW', 'en'], HK: ['zh-TW', 'en'], MO: ['pt', 'zh-TW', 'en'],
  IN: ['en', 'hi'], PK: ['en', 'ur'], BD: ['en', 'bn'], LK: ['en', 'si', 'ta'], NP: ['en', 'ne'],
  ID: ['id', 'en'], MY: ['en', 'ms', 'zh-CN'], SG: ['en', 'zh-CN', 'ms'], PH: ['en', 'tl'],
  TH: ['th', 'en'], VN: ['vi', 'en'], MM: ['en', 'my'], KH: ['en', 'km'], MN: ['mn', 'en'],
  CH: ['de', 'fr', 'it', 'en'], BE: ['fr', 'nl', 'en'], CA: ['en', 'fr'], LU: ['fr', 'de', 'en'],
  UA: ['uk', 'en', 'ru'], BY: ['ru', 'en'], KZ: ['ru', 'en'], KG: ['ru', 'en'], RU: ['ru', 'en'],
  ZA: ['en', 'af'], KE: ['en', 'sw'], TZ: ['en', 'sw'], ET: ['en', 'am'],
};

function normalizarCodigoIdioma(langRaw, countryCode = '') {
  const l = String(langRaw || '').trim();
  const lower = l.toLowerCase();
  const c = String(countryCode || '').toUpperCase().trim();
  if (!lower) return LOCALE_PRIMARIO_POR_PAIS[c] || 'en';
  if (lower === 'zh-tw' || lower === 'zh-hant' || lower === 'zh_tw') return 'zh-TW';
  if (lower === 'zh-cn' || lower === 'zh-hans' || lower === 'zh_cn') return 'zh-CN';
  if (lower === 'zh') return ['TW', 'HK', 'MO'].includes(c) ? 'zh-TW' : 'zh-CN';
  return lower.split('-')[0] || 'en';
}

function obterIdiomasPais(countryCode, clientLang = '') {
  const cc = String(countryCode || '').toUpperCase().trim();
  const lista = [];
  const add = (lg) => {
    const code = normalizarCodigoIdioma(lg, cc);
    if (code && !lista.includes(code)) lista.push(code);
  };
  if (IDIOMAS_OFICIAIS_POR_PAIS[cc]) {
    IDIOMAS_OFICIAIS_POR_PAIS[cc].forEach(add);
  } else if (LOCALE_PRIMARIO_POR_PAIS[cc]) {
    add(LOCALE_PRIMARIO_POR_PAIS[cc]);
  }
  if (clientLang) add(clientLang);
  add('en'); // Sempre garante tradução em inglês (qEn) para cobertura internacional/bilíngue
  return lista;
}

async function fetchXml(url, timeoutMs = 4200, isRefresh = false) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RodandoOMundo/2.12)',
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
  const raw = String(lang || 'pt').trim();
  const l = raw.toLowerCase();
  const c = String(countryCode || 'BR').toUpperCase();
  if (l === 'pt' || l.startsWith('pt-')) {
    const ptPaises = ['PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL'];
    const isPtEur = ptPaises.includes(c);
    const gl = isPtEur ? 'PT' : 'BR';
    const hl = isPtEur ? 'pt-PT' : 'pt-BR';
    const ceid = isPtEur ? 'PT:pt-150' : 'BR:pt-419';
    const mkt = isPtEur ? 'pt-PT' : 'pt-BR';
    return { hl, gl, ceid, mkt };
  }
  if (l === 'es' || l.startsWith('es-')) {
    const gl = ['AR', 'CL', 'CO', 'MX', 'PE', 'ES', 'UY', 'VE', 'CU', 'DO', 'PA', 'CR', 'GT', 'HN', 'SV', 'NI', 'BO', 'PY', 'EC'].includes(c) ? c : 'ES';
    return { hl: 'es', gl, ceid: `${gl}:es`, mkt: 'es-ES' };
  }
  if (l === 'fr' || l.startsWith('fr-')) {
    const frGl = ['FR', 'BE', 'CH', 'CA', 'SN', 'CI', 'CM', 'CD', 'CG', 'MA', 'DZ', 'TN', 'MG', 'HT', 'LU'].includes(c) ? c : 'FR';
    return { hl: 'fr', gl: frGl, ceid: `${frGl}:fr`, mkt: 'fr-FR' };
  }
  if (l === 'ar' || l.startsWith('ar-')) {
    const arGl = ['EG', 'MA', 'DZ', 'TN', 'SA', 'AE', 'QA', 'KW', 'JO', 'LB', 'IQ', 'SY', 'YE', 'OM', 'LY', 'SD', 'PS', 'BH', 'MR'].includes(c) ? c : 'EG';
    return { hl: 'ar', gl: arGl, ceid: `${arGl}:ar`, mkt: 'ar-SA' };
  }
  if (l === 'de' || l.startsWith('de-')) {
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
  if (l === 'zh-tw' || l === 'zh-hant' || (l === 'zh' && ['TW', 'HK', 'MO'].includes(c))) {
    const gl = c === 'HK' ? 'HK' : 'TW';
    return { hl: 'zh-TW', gl, ceid: `${gl}:zh-Hant`, mkt: 'zh-TW' };
  }
  if (l === 'zh-cn' || l === 'zh-hans' || l === 'zh') {
    return { hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans', mkt: 'zh-CN' };
  }
  if (l === 'ko') return { hl: 'ko', gl: 'KR', ceid: 'KR:ko', mkt: 'ko-KR' };
  if (l === 'hi') return { hl: 'hi', gl: 'IN', ceid: 'IN:hi', mkt: 'en-IN' };
  if (l === 'ur') return { hl: 'ur', gl: 'PK', ceid: 'PK:ur', mkt: 'en-US' };
  if (l === 'bn') return { hl: 'bn', gl: c === 'IN' ? 'IN' : 'BD', ceid: `${c === 'IN' ? 'IN' : 'BD'}:bn`, mkt: 'en-IN' };
  if (l === 'si') return { hl: 'si', gl: 'LK', ceid: 'LK:si', mkt: 'en-US' };
  if (l === 'ta') return { hl: 'ta', gl: c === 'LK' ? 'LK' : 'IN', ceid: `${c === 'LK' ? 'LK' : 'IN'}:ta`, mkt: 'en-IN' };
  if (l === 'tl' || l === 'fil') return { hl: 'en-PH', gl: 'PH', ceid: 'PH:en', mkt: 'en-PH' };
  if (l === 'id' || l === 'ms') {
    const idGl = c === 'MY' ? 'MY' : 'ID';
    return { hl: l === 'ms' ? 'ms' : 'id', gl: idGl, ceid: `${idGl}:${l === 'ms' ? 'ms' : 'id'}`, mkt: 'id-ID' };
  }
  if (l === 'sv') return { hl: 'sv', gl: 'SE', ceid: 'SE:sv', mkt: 'sv-SE' };
  if (l === 'no') return { hl: 'no', gl: 'NO', ceid: 'NO:no', mkt: 'nb-NO' };
  if (l === 'da' || l === 'fo') return { hl: 'da', gl: 'DK', ceid: 'DK:da', mkt: 'da-DK' };
  if (l === 'fi') return { hl: 'fi', gl: 'FI', ceid: 'FI:fi', mkt: 'fi-FI' };
  if (l === 'is') return { hl: 'is', gl: 'IS', ceid: 'IS:is', mkt: 'en-US' };
  if (l === 'el') return { hl: 'el', gl: 'GR', ceid: 'GR:el', mkt: 'el-GR' };
  if (l === 'cs') return { hl: 'cs', gl: 'CZ', ceid: 'CZ:cs', mkt: 'cs-CZ' };
  if (l === 'sk') return { hl: 'sk', gl: 'SK', ceid: 'SK:sk', mkt: 'sk-SK' };
  if (l === 'hu') return { hl: 'hu', gl: 'HU', ceid: 'HU:hu', mkt: 'hu-HU' };
  if (l === 'ro') return { hl: 'ro', gl: 'RO', ceid: 'RO:ro', mkt: 'ro-RO' };
  if (l === 'bg') return { hl: 'bg', gl: 'BG', ceid: 'BG:bg', mkt: 'bg-BG' };
  if (l === 'sr' || l === 'hr' || l === 'bs' || l === 'cnr') return { hl: l === 'hr' ? 'hr' : 'sr', gl: c || 'RS', ceid: `${c || 'RS'}:${l === 'hr' ? 'hr' : 'sr'}`, mkt: 'en-US' };
  if (l === 'sl') return { hl: 'sl', gl: 'SI', ceid: 'SI:sl', mkt: 'sl-SI' };
  if (l === 'sq') return { hl: 'sq', gl: 'AL', ceid: 'AL:sq', mkt: 'en-US' };
  if (l === 'mk') return { hl: 'mk', gl: 'MK', ceid: 'MK:mk', mkt: 'en-US' };
  if (l === 'lt') return { hl: 'lt', gl: 'LT', ceid: 'LT:lt', mkt: 'lt-LT' };
  if (l === 'lv') return { hl: 'lv', gl: 'LV', ceid: 'LV:lv', mkt: 'lv-LV' };
  if (l === 'et') return { hl: 'et', gl: 'EE', ceid: 'EE:et', mkt: 'et-EE' };
  if (l === 'ka') return { hl: 'ka', gl: 'GE', ceid: 'GE:ka', mkt: 'en-US' };
  if (l === 'hy') return { hl: 'hy', gl: 'AM', ceid: 'AM:hy', mkt: 'en-US' };
  if (l === 'he') return { hl: 'he', gl: 'IL', ceid: 'IL:he', mkt: 'he-IL' };
  if (l === 'fa') return { hl: 'fa', gl: 'IR', ceid: 'IR:fa', mkt: 'en-US' };
  if (l === 'th') return { hl: 'th', gl: 'TH', ceid: 'TH:th', mkt: 'th-TH' };
  if (l === 'vi') return { hl: 'vi', gl: 'VN', ceid: 'VN:vi', mkt: 'vi-VN' };
  if (l === 'af') return { hl: 'en-ZA', gl: 'ZA', ceid: 'ZA:en', mkt: 'en-ZA' };
  if (l === 'sw') return { hl: 'sw', gl: c === 'TZ' ? 'TZ' : 'KE', ceid: `${c === 'TZ' ? 'TZ' : 'KE'}:sw`, mkt: 'en-US' };
  if (l === 'am') return { hl: 'am', gl: 'ET', ceid: 'ET:am', mkt: 'en-US' };
  const gl = ['US', 'GB', 'CA', 'AU', 'IN', 'ZA', 'IE', 'NZ', 'NG', 'KE', 'GH', 'UG', 'TZ', 'ZW', 'ZM', 'NA', 'BW', 'RW', 'ET', 'PH', 'SG', 'PK', 'MY', 'IL'].includes(c) ? c : 'US';
  return { hl: 'en', gl, ceid: `${gl}:en`, mkt: 'en-US' };
}

const DICIONARIO_SIGLAS_TERMOS = {
  pib: {
    en: 'GDP', de: 'BIP', nl: 'bbp', it: 'PIL', pl: 'PKB', tr: 'GSYH',
    ru: 'ВВП', uk: 'ВВП', ja: 'GDP', 'zh-CN': 'GDP', 'zh-TW': 'GDP', zh: 'GDP', ko: 'GDP', ar: 'الناتج المحلي الإجمالي',
    es: 'PIB', fr: 'PIB', pt: 'PIB',
  },
  ia: {
    en: 'AI', de: 'KI', ja: 'AI', 'zh-CN': 'AI', 'zh-TW': 'AI', zh: 'AI', ko: 'AI', ru: 'ИИ', es: 'IA', fr: 'IA',
  },
  onu: {
    en: 'UN', de: 'UN', ru: 'ООН', ar: 'الأمم المتحدة', ja: '国連', es: 'ONU', fr: 'ONU',
  },
  otan: {
    en: 'NATO', de: 'NATO', ru: 'НАТО', ar: 'الناتو', ja: 'NATO', es: 'OTAN', fr: 'OTAN',
  },
  fmi: {
    en: 'IMF', de: 'IWF', ru: 'МВФ', ar: 'صندوق النقد الدولي', ja: 'IMF', es: 'FMI', fr: 'FMI',
  },
  bce: {
    en: 'ECB', de: 'EZB', ru: 'ЕЦБ', es: 'BCE', fr: 'BCE',
  },
  'banco central': {
    en: 'central bank', es: 'Banco Central', fr: 'banque centrale', de: 'Zentralbank',
    it: 'banca centrale', ja: '中央銀行', 'zh-CN': '央行', 'zh-TW': '央行', zh: '央行', ko: '중앙은행',
    ar: 'البنك المركزي', ru: 'центральный банк',
  },
  inflacao: {
    en: 'inflation', es: 'inflación', fr: 'inflation', de: 'Inflation',
    it: 'inflazione', ja: 'インフレ', 'zh-CN': '通胀', 'zh-TW': '通膨', zh: '通胀', ko: '인플레이션',
    ar: 'التضخم', ru: 'инфляция',
  },
  eleicoes: {
    en: 'elections', es: 'elecciones', fr: 'élections', de: 'Wahlen',
    it: 'elezioni', ja: '選挙', 'zh-CN': '选举', 'zh-TW': '選舉', zh: '选举', ko: '선거',
    ar: 'انتخابات', ru: 'выборы',
  },
  eleicao: {
    en: 'election', es: 'elección', fr: 'élection', de: 'Wahl',
    it: 'elezione', ja: '選挙', 'zh-CN': '选举', 'zh-TW': '選舉', zh: '选举', ko: '선거',
    ar: 'انتخابات', ru: 'выборы',
  },
  juros: {
    en: 'interest rates', es: 'tasas de interés', fr: "taux d'intérêt", de: 'Zinsen',
    it: 'tassi di interesse', ja: '金利', 'zh-CN': '利率', 'zh-TW': '利率', zh: '利率', ko: '금리',
    ar: 'أسعار الفائدة', ru: 'ключевая ставка',
  },
  'taxa de juros': {
    en: 'interest rate', es: 'tasa de interés', fr: "taux d'intérêt", de: 'Leitzins',
    it: 'tasso di interesse', ja: '政策金利', 'zh-CN': '利率', 'zh-TW': '利率', zh: '利率', ko: '기준금리',
    ar: 'سعر الفائدة', ru: 'ключевая ставка',
  },
};

function aplicarDicionarioNaFrase(texto, langCode) {
  let out = String(texto || '').trim();
  if (!out || !langCode) return out;
  const exato = DICIONARIO_SIGLAS_TERMOS[normalizar(out)];
  if (exato && (exato[langCode] || exato[langCode.split('-')[0]])) {
    return exato[langCode] || exato[langCode.split('-')[0]];
  }

  const chavesOrdenadas = Object.keys(DICIONARIO_SIGLAS_TERMOS).sort((a, b) => b.length - a.length);
  for (const chave of chavesOrdenadas) {
    const mapa = DICIONARIO_SIGLAS_TERMOS[chave];
    const dest = mapa && (mapa[langCode] || mapa[langCode.split('-')[0]]);
    if (!dest) continue;
    const rx = new RegExp(`(?:^|\\s)${chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|\\s)`, 'i');
    const outNorm = normalizar(out);
    if (rx.test(outNorm)) {
      const tokens = out.split(/\s+/);
      const chaveParts = chave.split(/\s+/);
      if (chaveParts.length === 1) {
        out = tokens.map((tk) => (normalizar(tk) === chave ? dest : tk)).join(' ');
      } else {
        const resTokens = [];
        for (let i = 0; i < tokens.length; i++) {
          if (i + chaveParts.length <= tokens.length) {
            const sliceNorm = normalizar(tokens.slice(i, i + chaveParts.length).join(' '));
            if (sliceNorm === chave) {
              resTokens.push(dest);
              i += chaveParts.length - 1;
              continue;
            }
          }
          resTokens.push(tokens[i]);
        }
        out = resTokens.join(' ');
      }
    }
  }
  return out;
}

async function traduzirTermoParaIdioma(q, lang) {
  const rawLang = String(lang || 'pt').trim();
  const l = rawLang === 'zh-TW' || rawLang === 'zh-CN' ? rawLang : rawLang.toLowerCase();
  if (!q) return '';
  if (l === 'pt' && /[ãõçêôà]/i.test(q)) return q;

  const qNorm = normalizar(q);
  const direto = DICIONARIO_SIGLAS_TERMOS[qNorm];
  if (direto && (direto[l] || direto[l.split('-')[0]])) {
    return direto[l] || direto[l.split('-')[0]];
  }

  let traduzido = '';
  try {
    const urlGtx =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
      encodeURIComponent(l) +
      '&dt=t&q=' +
      encodeURIComponent(q);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2600);
    const r = await fetch(urlGtx, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j) && Array.isArray(j[0])) {
        const joined = j[0]
          .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
          .join('')
          .trim();
        if (joined) traduzido = joined;
      }
    }
  } catch { }

  if (!traduzido) {
    try {
      const urlClients =
        'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=' +
        encodeURIComponent(l) +
        '&q=' +
        encodeURIComponent(q);
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 2500);
      const r2 = await fetch(urlClients, { signal: ctrl2.signal });
      clearTimeout(t2);
      if (r2.ok) {
        const j2 = await r2.json();
        const trad = (Array.isArray(j2) && ((Array.isArray(j2[0]) && j2[0][0]) || (typeof j2[0] === 'string' && j2[0]))) || '';
        if (trad && typeof trad === 'string' && trad.trim()) traduzido = trad.trim();
      }
    } catch { }
  }

  const baseFallback = traduzido || q;
  return aplicarDicionarioNaFrase(baseFallback, l);
}

async function traduzirLoteLinhasParaIdioma(linhas, lang) {
  const validas = (linhas || []).map((s) => String(s || '').replace(/\r?\n/g, ' ').trim());
  if (!validas.length) return [];
  const rawLang = String(lang || 'en').trim();
  const l = rawLang === 'zh-TW' || rawLang === 'zh-CN' ? rawLang : rawLang.toLowerCase();
  if (l === 'pt' && validas.some((v) => /[ãõçêôà]/i.test(v))) {
    return validas;
  }
  const bloco = validas.join('\n');
  const tradBloco = await traduzirTermoParaIdioma(bloco, l);
  if (!tradBloco) return validas;
  const partes = tradBloco.split(/\r?\n/).map((p) => aplicarDicionarioNaFrase(p.trim(), l));
  if (partes.length === validas.length) return partes;
  return validas.map((orig, idx) => partes[idx] || orig);
}

// Domínios estritamente em idioma nativo cujo nome no cadastro usa palavras inglesas (ex: "United Daily News" -> udn.com)
const DOMINIOS_NATIVOS_NAO_INGLES = new Set([
  'udn.com', 'chinatimes.com', 'twreporter.org',
  'mk.co.kr', 'donga.com', 'ohmynews.com',
  'yomiuri.co.jp', 'sankei.com', 'jcp.or.jp', 'kinyobi.co.jp',
  'maannews.net', 'alquds.com', 'al-akhbar.com', 'annahar.com', 'megaphone.news', 'daraj.media', 'raseef22.net',
  'youm7.com', 'almasryalyoum.com',
  'kompas.com', 'republika.co.id', 'tirto.id', 'bisnis.com', 'projectmultatuli.org', 'remotivi.or.id', 'konde.co',
  'cumhuriyet.com.tr', 'birgun.net', 'evrensel.net', 'gazeteduvar.com.tr', 'yenisafak.com', 'sabah.com.tr', 't24.com.tr',
  'now14.co.il',
]);

// Títulos de jornais em línguas românicas/germânicas que contêm palavras como "Monde"/"Mundo"/"Temps"/"Standard"
const PADRAO_NOME_NAO_INGLES_RE = /\b(le monde|le temps|le figaro|le parisien|le soir|le devoir|le360|le desk|la presse|l'economiste|l’economiste|el mundo|el tiempo|el pais|el universal|el comercio|el mercurio|el nacional|el espectador|el observador|il tempo|il messaggero|il sole|il giornale|der standard|die presse|die zeit|die welt|der spiegel|o globo|o pais|o estado|folha de|correio|diario de|jornal de)\b/i;

function ehVeiculoEmIngles(veiculo) {
  if (!veiculo) return false;
  if (veiculo.lang && String(veiculo.lang).toLowerCase().startsWith('en')) return true;
  if (veiculo.lang && !String(veiculo.lang).toLowerCase().startsWith('en')) return false;

  const nRaw = String(veiculo.n || '').trim();
  const n = normalizar(nRaw);
  const d = String(veiculo.d || '').trim().toLowerCase().replace(/^www\./, '');
  const u = String(veiculo.u || '').trim().toLowerCase();

  // Subdomínio ou path explicitamente em outro idioma (ex: fr.hespress.com, fr.le360.ma)
  if (/^(?:https?:\/\/)?(?:www\.)?(?:fr|es|pt|ar|de|it|ru|ja|ko|zh)\./i.test(u) || /^(?:fr|es|pt|ar|de|it|ru|ja|ko|zh)\./i.test(d)) {
    return false;
  }

  // Subdomínio ou path explicitamente em inglês (ex: english.ahram.org.eg, madamasr.com/en/, nhk.or.jp/nhkworld/en/, en.yna.co.kr, asahi.com/ajw/)
  if (
    /^(?:https?:\/\/)?(?:www\.)?(?:english|en|eng|world|asia|global|e\.vnexpress|today\.lorientlejour|japannews)\./i.test(u) ||
    /^(?:english|en|eng|world|asia|e\.vnexpress|today\.lorientlejour|japannews)\./i.test(d) ||
    /\/(?:en|english|ajw)(?:\/|$|-|_|\?)/i.test(u) ||
    /nhkworld\/en/i.test(u) ||
    /-english\b/i.test(u)
  ) {
    return true;
  }

  if (DOMINIOS_NATIVOS_NAO_INGLES.has(d)) return false;

  // Lista verificada de domínios internacionais anglófonos em países não-anglófonos
  if (
    d.includes('dailynewsegypt') ||
    d.includes('egyptindependent') ||
    d.includes('kyivindependent') ||
    d.includes('kyivpost') ||
    d.includes('ukrinform.net') ||
    d.includes('themoscowtimes') ||
    d.includes('japantimes') ||
    d.includes('japan-forward') ||
    d.includes('koreatimes') ||
    d.includes('koreaherald') ||
    d.includes('koreajoongangdaily') ||
    d.includes('chinadaily') ||
    d.includes('globaltimes.cn') ||
    d.includes('caixinglobal') ||
    d.includes('scmp.com') ||
    d.includes('taipeitimes') ||
    d.includes('focustaiwan') ||
    d.includes('newbloommag') ||
    d.includes('straitstimes') ||
    d.includes('channelnewsasia') ||
    d.includes('mothership.sg') ||
    d.includes('bangkokpost') ||
    d.includes('nationthailand') ||
    d.includes('prachataienglish') ||
    d.includes('vietnamnews') ||
    d.includes('tuoitrenews') ||
    d.includes('thejakartapost') ||
    d.includes('thestar.com.my') ||
    d.includes('malaysiakini') ||
    d.includes('freemalaysiatoday') ||
    d.includes('theedgemalaysia') ||
    d.includes('nst.com.my') ||
    d.includes('inquirer.net') ||
    d.includes('rappler.com') ||
    d.includes('manilatimes') ||
    d.includes('philstar') ||
    d.includes('timesofisrael') ||
    d.includes('jpost.com') ||
    d.includes('haaretz.com') ||
    d.includes('israelhayom.com') ||
    d.includes('israelnationalnews') ||
    d.includes('972mag.com') ||
    d.includes('palestinechronicle') ||
    d.includes('mondoweiss') ||
    d.includes('dailysabah') ||
    d.includes('hurriyetdailynews') ||
    d.includes('arabnews') ||
    d.includes('saudigazette') ||
    d.includes('thenationalnews') ||
    d.includes('gulfnews') ||
    d.includes('khaleejtimes') ||
    d.includes('arabianbusiness') ||
    d.includes('aljazeera.com') ||
    d.includes('thepeninsulaqatar') ||
    d.includes('gulf-times') ||
    d.includes('dohanews') ||
    d.includes('middleeasteye') ||
    d.includes('dailystar.com.lb') ||
    d.includes('tehrantimes') ||
    d.includes('presstv.ir') ||
    d.includes('dawn.com') ||
    d.includes('tribune.com.pk') ||
    d.includes('thenews.com.pk') ||
    d.includes('brecorder.com') ||
    d.includes('geo.tv') ||
    d.includes('thehindu.com') ||
    d.includes('indianexpress') ||
    d.includes('timesofindia') ||
    d.includes('hindustantimes') ||
    d.includes('scroll.in') ||
    d.includes('thewire.in') ||
    d.includes('livemint') ||
    d.includes('deccanherald') ||
    d.includes('tribuneindia') ||
    d.includes('business-standard') ||
    d.includes('firstpost') ||
    d.includes('republicworld') ||
    d.includes('opindia') ||
    d.includes('bne.eu') ||
    d.includes('balkaninsight') ||
    d.includes('thelocal.') ||
    d.includes('politico.eu') ||
    d.includes('euractiv.com') ||
    d.includes('dw.com') ||
    d.includes('france24.com') ||
    d.includes('reuters.com') ||
    d.includes('apnews.com') ||
    d.includes('bbc.com') ||
    d.includes('bbc.co.uk') ||
    d.includes('cnn.com') ||
    d.includes('batimes.com.ar') ||
    d.includes('mercopress') ||
    d.includes('brazilreports')
  ) {
    return true;
  }

  if (PADRAO_NOME_NAO_INGLES_RE.test(nRaw) || PADRAO_NOME_NAO_INGLES_RE.test(n)) {
    return false;
  }

  if (/\b(english|ahram online|nhk world|france 24|cna|scmp|mada masr)\b/.test(n)) {
    return true;
  }

  const tldRomanoGermanico = /\.(br|pt|ao|mz|cv|es|ar|mx|cl|co|pe|uy|py|bo|ec|ve|cr|pa|do|gt|fr|it|de|at|nl|pl|ru|ua|cz|sk|hu|ro|bg|gr|rs|hr|si)$/i.test(d);
  if (
    !tldRomanoGermanico &&
    /\b(independent|post|times|herald|daily|news|tribune|journal|voice|standard|gazette|express|monitor|world|guardian|telegraph|chronicle|observer|mirror|inquirer)\b/.test(n)
  ) {
    return true;
  }

  return false;
}

function detectarIdiomaPreferencialVeiculo(veiculo, countryCode, idiomasPais) {
  const u = String((veiculo && veiculo.u) || '').toLowerCase();
  const d = String((veiculo && veiculo.d) || '').toLowerCase().replace(/^www\./, '');
  const mSub = d.match(/^(fr|es|pt|ar|de|it|ru|ja|ko)\./) || u.match(/^https?:\/\/(?:www\.)?(fr|es|pt|ar|de|it|ru|ja|ko)\./);
  if (mSub && mSub[1]) return mSub[1];

  if (ehVeiculoEmIngles(veiculo)) return 'en';

  const lista = Array.isArray(idiomasPais) && idiomasPais.length > 0 ? idiomasPais : obterIdiomasPais(countryCode);
  const nativoNaoIngles = lista.find((lg) => lg !== 'en');
  return nativoNaoIngles || lista[0] || 'en';
}

function extrairConceitosAtomicosTexto(texto, countryTokensSet = null) {
  const limpo = String(texto || '')
    .replace(/[«»""''„”]/g, ' ')
    .replace(/(^|\s)-+(\s|$)/g, ' ')
    .replace(/[–—|:,;!?()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpo) return [];

  const normFull = normalizar(limpo);
  const conceitos = [];
  const intervalosConsumidos = [];

  // 1. Detecta grupos compostos conhecidos de GRUPOS_SINONIMOS_UNIVERSAIS (ex: caminhão-tanque, taxa de juros, cessar-fogo)
  for (const grp of GRUPOS_SINONIMOS_UNIVERSAIS) {
    for (const trig of grp.triggers) {
      const trigNorm = normalizar(trig);
      if (!trigNorm) continue;
      const rx = new RegExp(`(?:^|[^\\p{L}\\p{N}])${trigNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'iu');
      const m = rx.exec(normFull);
      if (m) {
        conceitos.push({ raw: trig, norm: trigNorm, groupId: grp.id, pos: m.index });
        intervalosConsumidos.push(...trigNorm.replace(/-/g, ' ').split(/\s+/).filter(Boolean));
        if (trigNorm.includes('-')) intervalosConsumidos.push(trigNorm);
        break;
      }
    }
  }

  // 2. Detecta entidades compostas conhecidas (ex: Donald Trump, Supremo Tribunal Federal, Casa Branca)
  for (const ent of ENTIDADES_COMPOSTAS) {
    const entNorm = normalizar(ent);
    if (!entNorm || (countryTokensSet && countryTokensSet.has(entNorm))) continue;
    const rx = new RegExp(`(?:^|[^\\p{L}\\p{N}])${entNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'iu');
    const m = rx.exec(normFull);
    if (m) {
      conceitos.push({ raw: ent, norm: entNorm, groupId: null, isEntity: true, pos: m.index });
      intervalosConsumidos.push(...entNorm.split(/\s+/).filter(Boolean));
    }
  }

  const consumidosSet = new Set(intervalosConsumidos);
  const palavras = limpo.split(/\s+/).filter(Boolean);

  // Se toda a consulta são apenas 2 nomes próprios em maiúscula (ex: "Nunes Marques", "Jude Bellingham"), mantém como 1 entidade única
  if (
    conceitos.length === 0 &&
    palavras.length === 2 &&
    /^[A-ZÀ-Ý][\p{L}'-]+$/u.test(palavras[0]) &&
    /^[A-ZÀ-Ý][\p{L}'-]+$/u.test(palavras[1]) &&
    !STOPWORDS_BUSCA.has(normalizar(palavras[0])) &&
    !STOPWORDS_BUSCA.has(normalizar(palavras[1])) &&
    !PALAVRAS_COMUNS_INTACTAS.has(normalizar(palavras[0])) &&
    !PALAVRAS_COMUNS_INTACTAS.has(normalizar(palavras[1]))
  ) {
    const joined = `${palavras[0]} ${palavras[1]}`;
    return [{ raw: joined, norm: normalizar(joined), groupId: null, isEntity: true, pos: 0 }];
  }

  palavras.forEach((pRaw, idx) => {
    const p = pRaw.replace(/^-+|-+$/g, '');
    const n = normalizar(p);
    if (!n || n.length < 2) return;
    if (STOPWORDS_BUSCA.has(n) || ehTokenNumericoPuro(n)) return;
    if (countryTokensSet && countryTokensSet.has(n)) return;
    if (consumidosSet.has(n)) return;
    if (n.includes('-')) {
      const subParts = n.split('-').filter(Boolean);
      if (subParts.every((sp) => consumidosSet.has(sp))) return;
    }
    consumidosSet.add(n);
    conceitos.push({
      raw: p,
      norm: n,
      groupId: null,
      isModifier: MODIFICADORES_SECUNDARIOS.has(n),
      pos: 1000 + idx,
    });
  });

  conceitos.sort((a, b) => a.pos - b.pos);
  return conceitos;
}

function extrairTokensSubstantivosIdioma(texto, countryTokensSet = null) {
  if (!texto) return [];
  const limpo = String(texto)
    .replace(/[«»""''„”()\[\]:,;!?|।،؛]/g, ' ')
    .replace(/(^|\s)-+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpo) return [];
  const out = [];
  for (const wRaw of limpo.split(/\s+/)) {
    const w = wRaw.replace(/^-+|-+$/g, '');
    const n = normalizar(w);
    if (!n || STOPWORDS_BUSCA.has(n) || ehTokenNumericoPuro(n)) continue;
    if (countryTokensSet && countryTokensSet.has(n)) continue;
    if (!ehTokenCJK(w) && !ehScriptSemitico(w) && n.length < 2) continue;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

async function construirPlanoSemanticoMultilingue({
  qLocal,
  qOriginal,
  headlineContext,
  termosTurbinados,
  country,
  countryName,
  clientLang,
}) {
  const idiomasPais = obterIdiomasPais(country, clientLang);
  const desacopladoQ = desacoplarPaisDaConsulta(qLocal || qOriginal, country, countryName);
  const countryTokensSet = new Set(desacopladoQ.countryTokensSet);

  const ctxBruto = headlineContext || (String(qOriginal || '').trim().split(/\s+/).length >= 5 ? qOriginal : '');
  const desacopladoCtx = ctxBruto
    ? desacoplarPaisDaConsulta(ctxBruto, country, countryName)
    : { termoLocal: '', countryTokensSet: new Set() };
  desacopladoCtx.countryTokensSet.forEach((tk) => countryTokensSet.add(tk));

  const qSemPais = desacopladoQ.termoLocal || qLocal || qOriginal || '';
  const ctxSemPais = desacopladoCtx.termoLocal || '';

  // Extrai números presentes na consulta/manchete apenas para desempate (JAMAIS aprovam artigo sozinhos)
  const numerosContexto = new Set();
  for (const fonteNum of [qOriginal, headlineContext]) {
    const matches = String(fonteNum || '').match(/\b\d{1,4}\b/g) || [];
    matches.forEach((num) => numerosContexto.add(num));
  }

  const conceitosCore = extrairConceitosAtomicosTexto(qSemPais, countryTokensSet).slice(0, 5);
  const conceitosCtx = ctxSemPais ? extrairConceitosAtomicosTexto(ctxSemPais, countryTokensSet) : [];

  // Enriquecimento por grupos de sinônimos detectados no contexto completo da manchete
  const idsCore = new Set(conceitosCore.map((c) => c.groupId).filter(Boolean));
  const normasCore = new Set(conceitosCore.map((c) => c.norm));
  const conceitosAux = [];
  for (const c of conceitosCtx) {
    if (c.groupId && !idsCore.has(c.groupId)) {
      idsCore.add(c.groupId);
      conceitosAux.push(c);
    } else if (!c.groupId && !normasCore.has(c.norm) && !c.isModifier) {
      normasCore.add(c.norm);
      conceitosAux.push(c);
    }
  }
  if (Array.isArray(termosTurbinados)) {
    for (const tb of termosTurbinados.slice(0, 4)) {
      const tbNorm = normalizar(tb);
      if (tbNorm && tbNorm.length >= 3 && !normasCore.has(tbNorm) && !STOPWORDS_BUSCA.has(tbNorm) && !ehTokenNumericoPuro(tbNorm)) {
        normasCore.add(tbNorm);
        conceitosAux.push({ raw: String(tb).trim(), norm: tbNorm, groupId: null, pos: 2000 });
      }
    }
  }

  // Monta lote único de linhas para traduzir em paralelo para TODOS os idiomas do país (sempre incluindo 'en')
  const linhasParaTraduzir = [
    qSemPais,
    ctxSemPais || qSemPais,
    ...conceitosCore.map((c) => c.raw),
    ...conceitosAux.slice(0, 3).map((c) => c.raw),
  ];

  const traducoesPorIdioma = {};
  await Promise.all(
    idiomasPais.map(async (lg) => {
      const resLinhas = await traduzirLoteLinhasParaIdioma(linhasParaTraduzir, lg);
      traducoesPorIdioma[lg] = {
        qTrad: resLinhas[0] || qSemPais,
        ctxTrad: resLinhas[1] || '',
        coreTrad: conceitosCore.map((_, idx) => resLinhas[2 + idx] || ''),
        auxTrad: conceitosAux.slice(0, 3).map((_, idx) => resLinhas[2 + conceitosCore.length + idx] || ''),
      };
    })
  );

  // Detecta também grupos universais acionados pela tradução em inglês do contexto (ex: "catches fire", "tanker truck")
  const ctxEnNorm = normalizar(
    `${(traducoesPorIdioma.en && traducoesPorIdioma.en.qTrad) || ''} ${(traducoesPorIdioma.en && traducoesPorIdioma.en.ctxTrad) || ''}`
  );
  for (const grp of GRUPOS_SINONIMOS_UNIVERSAIS) {
    if (idsCore.has(grp.id)) continue;
    const acionouEn = grp.triggers.some((trig) => {
      const tn = normalizar(trig);
      return tn && ctxEnNorm.includes(tn);
    });
    if (acionouEn) {
      idsCore.add(grp.id);
      conceitosAux.push({ raw: grp.triggers[0], norm: normalizar(grp.triggers[0]), groupId: grp.id, pos: 1500 });
    }
  }

  const montarBucket = (conceito, idx, isCore) => {
    const termos = new Set();
    const addTerm = (t) => {
      const clean = String(t || '').trim();
      if (!clean) return;
      const n = ehScriptSemitico(clean) ? normalizarRaizSemitica(clean) : normalizar(clean);
      if (!n || ehTokenNumericoPuro(n) || STOPWORDS_BUSCA.has(n) || PALAVRAS_VAZIAS_CONTEXTO.has(n)) return;
      if (countryTokensSet.has(n)) return;
      termos.add(n);
    };

    addTerm(conceito.raw);
    addTerm(conceito.norm);
    if (conceito.isEntity && conceito.norm.includes(' ')) {
      conceito.norm.split(/\s+/).filter((p) => p.length >= 4).forEach(addTerm);
    }

    const ehCompostoHifenOuFrase = Boolean(conceito.groupId || conceito.norm.includes('-') || conceito.norm.includes(' '));

    if (conceito.groupId) {
      const grp = GRUPOS_SINONIMOS_UNIVERSAIS.find((g) => g.id === conceito.groupId);
      if (grp) {
        grp.matchTerms.forEach(addTerm);
        if (grp.matchTermsByLang) {
          for (const lg of idiomasPais) {
            const lgBase = lg.split('-')[0];
            const extrasLg = grp.matchTermsByLang[lg] || grp.matchTermsByLang[lgBase];
            if (Array.isArray(extrasLg)) extrasLg.forEach(addTerm);
          }
        }
      }
    }

    for (const lg of idiomasPais) {
      const pacote = traducoesPorIdioma[lg];
      if (!pacote) continue;
      const tradItem = isCore ? pacote.coreTrad[idx] : pacote.auxTrad[idx];
      if (tradItem) {
        addTerm(tradItem);
        // Não fragmenta compostos ("Tank truck" -> "tank" + "truck") em palavras soltas ambíguas!
        if (!ehCompostoHifenOuFrase) {
          extrairTokensSubstantivosIdioma(tradItem, countryTokensSet).forEach(addTerm);
        }
      }
    }

    return {
      id: conceito.groupId || `c_${isCore ? 'core' : 'aux'}_${idx}_${conceito.norm}`,
      groupId: conceito.groupId || null,
      isCore,
      isEntity: Boolean(conceito.isEntity),
      isModifier: Boolean(conceito.isModifier),
      terms: [...termos],
    };
  };

  const coreBuckets = conceitosCore
    .map((c, idx) => montarBucket(c, idx, true))
    .filter((b) => b.terms.length > 0);

  const auxBuckets = conceitosAux
    .slice(0, 4)
    .map((c, idx) => montarBucket(c, idx, false))
    .filter((b) => b.terms.length > 0);

  // Tokens contextuais adicionais da frase traduzida completa (ex: "タンクローリー", "Todesopfer", "الوراق")
  for (const lg of idiomasPais) {
    const pacote = traducoesPorIdioma[lg];
    if (!pacote || !pacote.ctxTrad) continue;
    const toksCtx = extrairTokensSubstantivosIdioma(pacote.ctxTrad, countryTokensSet);
    const jaCobertos = new Set([...coreBuckets, ...auxBuckets].flatMap((b) => b.terms));
    const novos = toksCtx.filter(
      (tk) => tk.length >= 3 && !jaCobertos.has(tk) && !MODIFICADORES_SECUNDARIOS.has(tk) && !PALAVRAS_VAZIAS_CONTEXTO.has(tk)
    );
    if (novos.length > 0) {
      auxBuckets.push({
        id: `ctx_extra_${lg}`,
        groupId: null,
        isCore: false,
        isEntity: false,
        isModifier: false,
        terms: novos.slice(0, 6),
      });
    }
  }

  // Constrói queries RSS otimizadas por idioma (primária enxuta + booleana com sinônimos + fallback nuclear de >=2 conceitos)
  const queriesPorIdioma = {};
  for (const lg of idiomasPais) {
    const pacote = traducoesPorIdioma[lg] || { qTrad: qSemPais, ctxTrad: '', coreTrad: [] };
    const lgBase = lg.split('-')[0];
    const primaria = extrairTermoResilienteConsulta(pacote.qTrad || qSemPais);

    // Cláusula booleana por conceito para evitar perda por vocabulário divergente (ex: "fuel truck" vs "tanker", "blaze" vs "fire")
    const clausulasConceito = [];
    for (let i = 0; i < conceitosCore.length && clausulasConceito.length < 3; i++) {
      const c = conceitosCore[i];
      if (c.isModifier && conceitosCore.length >= 2) continue;
      if (c.groupId) {
        const grp = GRUPOS_SINONIMOS_UNIVERSAIS.find((g) => g.id === c.groupId);
        const synClause = grp && grp.queryByLang && (grp.queryByLang[lg] || grp.queryByLang[lgBase]);
        if (synClause) {
          clausulasConceito.push(synClause);
          continue;
        }
      }
      const tConceito = extrairTermoResilienteConsulta(pacote.coreTrad[i] || c.raw);
      if (tConceito) {
        clausulasConceito.push(tConceito.includes(' ') ? `"${tConceito}"` : tConceito);
      }
    }

    // Se houver 3 cláusulas de evento composto (ex: objeto + fogo + mortos), agrupa as 2 cláusulas de evento num OR: Objeto (Evento1 OR Evento2)
    let booleana = '';
    if (clausulasConceito.length >= 3) {
      const c0 = clausulasConceito[0];
      const limparParen = (s) => s.replace(/^\(|\)$/g, '').trim();
      booleana = `${c0} (${limparParen(clausulasConceito[1])} OR ${limparParen(clausulasConceito[2])})`;
    } else if (clausulasConceito.length === 2) {
      booleana = `${clausulasConceito[0]} ${clausulasConceito[1]}`;
    } else if (clausulasConceito.length === 1) {
      booleana = clausulasConceito[0];
    }

    // Query nuclear relaxada: NUNCA reduz evento multi-conceito a 1 única palavra comum isolada
    let relaxada = '';
    if (clausulasConceito.length >= 2) {
      relaxada = `${clausulasConceito[0]} ${clausulasConceito[1]}`;
    } else {
      const toksPrim = extrairTokensSubstantivosIdioma(primaria, countryTokensSet);
      relaxada = toksPrim.length >= 2 ? `${toksPrim[0]} ${toksPrim[1]}` : primaria;
    }

    queriesPorIdioma[lg] = {
      primaria: primaria || qSemPais,
      booleana,
      relaxada: relaxada || primaria || qSemPais,
      qTradBruto: pacote.qTrad || qSemPais,
    };
  }

  return {
    idiomasPais,
    qSemPais,
    ctxSemPais,
    countryTokensSet,
    numerosContexto,
    coreBuckets,
    auxBuckets,
    queriesPorIdioma,
    qEn: (queriesPorIdioma.en && queriesPorIdioma.en.qTradBruto) || '',
  };
}

const TERMOS_NAVAIS_PETROLEIRO_RE = /\b(seabed|hormuz|strait|shipping|vessel|vessels|fleet|maritime|navy|naval|port|ports|gulf|sea|ocean|pirates|somali|offshore|warship|warships)\b/i;
const TERMOS_RODOVIARIOS_CAMINHAO_RE = /\b(truck|trucks|lorry|road|highway|ring road|driver|overturns|overturned|crash|collision|blaze|fire|giza|warraq|cairo)\b/i;
const TERMOS_TANKER_AMBIGUOS = new Set(['tanker', 'tankers', 'oil tanker', 'ناقلة']);
const EXPRESSOES_TIRO_OU_METAFORA_FIRE_RE = /\b(opens?\s+fire|opened\s+fire|opening\s+fire|fires\s+(?:on|at|into|upon|missiles?|rockets?|drones?|shells?|shots?|rounds?|bullets?|artillery|mortars?|torpedoes|warning|back|minister|coach|manager|chief|head|director)|fired\s+(?:on|at|into|upon|missiles?|rockets?|drones?|shells?|shots?|rounds?|bullets?)|under\s+fire|returns?\s+fire|returned\s+fire|exchanges?\s+fire|exchanged\s+fire|friendly\s+fire|live\s+fire|cease-?fire|line\s+of\s+fire|abrir\s+fogo|abriu\s+fogo|abriram\s+fogo|sob\s+fogo|troca\s+de\s+tiros)\b/gi;
const TERMOS_FIRE_AMBIGUOS = new Set(['fire', 'fires', 'fogo']);

function bucketCasaEmTexto(bucket, textoNorm, palavrasTexto) {
  if (!bucket || !Array.isArray(bucket.terms) || !textoNorm) return false;
  let casouInambiguo = false;
  let casouApenasTanker = false;
  let casouApenasFire = false;

  for (const term of bucket.terms) {
    const matched = ehScriptSemitico(term)
      ? tokenCasaScriptSemitico(term, textoNorm, palavrasTexto)
      : tokenCasaComLimite(term, textoNorm, palavrasTexto);
    if (!matched) continue;

    if (bucket.groupId === 'fuel_truck' && TERMOS_TANKER_AMBIGUOS.has(term)) {
      casouApenasTanker = true;
      continue;
    }
    if (bucket.groupId === 'fire' && TERMOS_FIRE_AMBIGUOS.has(term)) {
      casouApenasFire = true;
      continue;
    }
    casouInambiguo = true;
    break;
  }

  if (casouInambiguo) return true;
  if (casouApenasTanker) {
    // Rejeita navios-petroleiros marítimos quando o contexto é caminhão-tanque rodoviário e não há nenhum indicador terrestre/incêndio
    if (TERMOS_NAVAIS_PETROLEIRO_RE.test(textoNorm) && !TERMOS_RODOVIARIOS_CAMINHAO_RE.test(textoNorm)) {
      return false;
    }
    return true;
  }
  if (casouApenasFire) {
    // Rejeita expressões militares/políticas de tiro ou demissão ("army fires on drones", "opens fire", "under fire", "ceasefire")
    const semTiros = textoNorm.replace(EXPRESSOES_TIRO_OU_METAFORA_FIRE_RE, ' ').trim();
    if (!semTiros) return false;
    const palavrasSemTiros = semTiros.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    return tokenCasaComLimite('fire', semTiros, palavrasSemTiros) || tokenCasaComLimite('fogo', semTiros, palavrasSemTiros);
  }
  return false;
}

function avaliarArtigoContraPlano(item, plano, topicKey = '') {
  if (!item || !item.titulo) return { aprovado: false, score: 0 };
  if (!plano) return { aprovado: true, score: 10 };

  const tituloRaw = String(item.titulo || '');
  const resumoRaw = String(item.resumo || '');
  const tituloNorm = normalizar(tituloRaw);
  const resumoNorm = normalizar(resumoRaw);
  const comboNorm = `${tituloNorm} ${resumoNorm}`.trim();
  if (!comboNorm) return { aprovado: false, score: 0 };

  const palavrasTit = tituloNorm.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const palavrasRes = resumoNorm.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const palavrasCombo = [...palavrasTit, ...palavrasRes];

  // Se o texto tem script semítico (árabe/hebraico), preserva palavras originais para análise de clíticos
  const palavrasSemTit = ehScriptSemitico(tituloRaw)
    ? tituloRaw.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
    : palavrasTit;
  const palavrasSemCombo = ehScriptSemitico(tituloRaw + ' ' + resumoRaw)
    ? `${tituloRaw} ${resumoRaw}`.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
    : palavrasCombo;
  const textoTitCheck = ehScriptSemitico(tituloRaw) ? `${tituloNorm} ${tituloRaw}` : tituloNorm;
  const textoComboCheck = ehScriptSemitico(tituloRaw + ' ' + resumoRaw) ? `${comboNorm} ${tituloRaw} ${resumoRaw}` : comboNorm;

  const coreBuckets = plano.coreBuckets || [];
  const auxBuckets = plano.auxBuckets || [];
  const obrigatorios = coreBuckets.filter((b) => !b.isModifier);
  const listaCoreRef = obrigatorios.length > 0 ? obrigatorios : coreBuckets;

  // Caso especial: o usuário pesquisou exclusivamente o nome do próprio país (ex: q = "Egito")
  if (listaCoreRef.length === 0) {
    const temPais = [...(plano.countryTokensSet || [])].some((ctk) =>
      ehScriptSemitico(ctk)
        ? tokenCasaScriptSemitico(ctk, textoComboCheck, palavrasSemCombo)
        : tokenCasaComLimite(ctk, comboNorm, palavrasCombo)
    );
    return { aprovado: temPais, score: temPais ? 60 : 0 };
  }

  let coreTit = 0;
  let coreCombo = 0;
  for (const b of listaCoreRef) {
    const mTit = bucketCasaEmTexto(b, textoTitCheck, palavrasSemTit);
    const mCombo = mTit || bucketCasaEmTexto(b, textoComboCheck, palavrasSemCombo);
    if (mTit) coreTit++;
    if (mCombo) coreCombo++;
  }

  let auxTit = 0;
  let auxCombo = 0;
  for (const b of auxBuckets) {
    const mTit = bucketCasaEmTexto(b, textoTitCheck, palavrasSemTit);
    const mCombo = mTit || bucketCasaEmTexto(b, textoComboCheck, palavrasSemCombo);
    if (mTit) auxTit++;
    if (mCombo) auxCombo++;
  }

  let aprovado = false;
  if (listaCoreRef.length === 1) {
    aprovado = coreCombo >= 1;
  } else {
    // Eventos com >= 2 conceitos distintos exigem >= 2 conceitos casados (core+core ou core+contexto da manchete),
    // impedindo que 1 único substantivo polissêmico isolado (ex: "tanker" no Golfo ou "Trump" em pauta alheia) vaze!
    aprovado = coreCombo >= 2 || (coreCombo >= 1 && auxCombo >= 1);
  }

  if (!aprovado) {
    return { aprovado: false, score: 0 };
  }

  let score = coreTit * 55 + (coreCombo - coreTit) * 26 + auxTit * 22 + (auxCombo - auxTit) * 10;
  if (coreCombo === listaCoreRef.length) score += 55;
  if (coreTit >= 2) score += 35;

  const qSemPaisNorm = normalizar(plano.qSemPais || '');
  if (qSemPaisNorm && qSemPaisNorm.length >= 4 && tituloNorm.includes(qSemPaisNorm)) {
    score += 90;
  }

  // Números da manchete ("30", "2027", etc.) SÓ entram como bônus de desempate APÓS aprovação lexical
  if (plano.numerosContexto && plano.numerosContexto.size > 0) {
    for (const num of plano.numerosContexto) {
      if (palavrasTit.includes(num)) {
        score += 12;
        break;
      }
      if (palavrasCombo.includes(num)) {
        score += 6;
        break;
      }
    }
  }

  if (topicKey && TERMOS_CONTEXTO_TOPICO[topicKey]) {
    const kws = TERMOS_CONTEXTO_TOPICO[topicKey];
    let matchesTopico = 0;
    for (const kw of kws) {
      if (comboNorm.includes(normalizar(kw))) {
        matchesTopico++;
        if (matchesTopico >= 2) break;
      }
    }
    score += matchesTopico * 12;
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

  return { aprovado: true, score };
}

function deduplicarEOrdenarComPlano(lista, plano = null, maxItens = MAX_POR_VEICULO_PADRAO, topicKey = '', isEnrich = false) {
  const mapa = new Map();
  for (const item of lista) {
    const chave = normalizar(item.titulo).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 58);
    if (!chave) continue;

    let rel = 20;
    if (!isEnrich && plano) {
      const aval = avaliarArtigoContraPlano(item, plano, topicKey);
      if (!aval.aprovado) continue;
      rel = aval.score;
    }

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
  const agora = Date.now();
  if (ts > agora + 24 * 60 * 60 * 1000) return false;
  const diffMs = Math.max(0, agora - ts);
  if (periodo === '24h') return diffMs <= 30 * 60 * 60 * 1000;
  if (periodo === '7d') return diffMs <= 7 * 24 * 60 * 60 * 1000 + 6 * 3600 * 1000;
  if (periodo === '30d') return diffMs <= 31 * 24 * 60 * 60 * 1000;
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

async function buscarPorVeiculo(
  veiculo,
  q,
  topicTerm,
  country,
  periodo = '24h',
  plano = null,
  topicTradMap = {},
  isEnrich = false,
  topicKey = '',
  isRefresh = false
) {
  const dom = String(veiculo.d || '').trim().toLowerCase();
  if (!dom) return [];
  const maxArtigos = limiteArtigosPorPeriodo(periodo);

  const idiomasPais = (plano && plano.idiomasPais) || obterIdiomasPais(country);
  const langVeic = detectarIdiomaPreferencialVeiculo(veiculo, country, idiomasPais);
  const locEfetivo = localeParams(langVeic, country);

  if (isEnrich) {
    const tFoco = topicTradMap[langVeic] || topicTerm || '';
    const qFoco = tFoco ? `${tFoco} site:${dom}` : (q ? `${q} site:${dom}` : `site:${dom}`);
    const bingUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(qFoco)}&format=rss&mkt=${encodeURIComponent(locEfetivo.mkt)}`;
    const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(qFoco)}&hl=${encodeURIComponent(locEfetivo.hl)}&gl=${encodeURIComponent(locEfetivo.gl)}&ceid=${encodeURIComponent(locEfetivo.ceid)}`;

    const [bingXml, googleXml] = await Promise.all([fetchXml(bingUrl, 3800, isRefresh), fetchXml(googleUrl, 3800, isRefresh)]);
    let itensBing = parseRssItems(bingXml, veiculo.n);
    let itensGoogle = parseRssItems(googleXml, veiculo.n);

    if (!itensBing.length && !itensGoogle.length) {
      const bFall = `https://www.bing.com/news/search?q=${encodeURIComponent(`site:${dom}`)}&format=rss&mkt=${encodeURIComponent(locEfetivo.mkt)}`;
      const gFall = `https://news.google.com/rss/search?q=${encodeURIComponent(`site:${dom}`)}&hl=${encodeURIComponent(locEfetivo.hl)}&gl=${encodeURIComponent(locEfetivo.gl)}&ceid=${encodeURIComponent(locEfetivo.ceid)}`;
      const [bfXml, gfXml] = await Promise.all([fetchXml(bFall, 3500, isRefresh), fetchXml(gFall, 3500, isRefresh)]);
      itensBing = parseRssItems(bfXml, veiculo.n);
      itensGoogle = parseRssItems(gfXml, veiculo.n);
    }

    const todos = [...itensBing, ...itensGoogle].filter((it) => dentroDoPeriodo(it.publicadoEm, periodo));
    return deduplicarEOrdenarComPlano(todos, null, maxArtigos, topicKey, true);
  }

  const queriesVeic = (plano && plano.queriesPorIdioma && (plano.queriesPorIdioma[langVeic] || plano.queriesPorIdioma.en)) || {
    primaria: extrairTermoResilienteConsulta(q),
    booleana: '',
    relaxada: extrairTermoResilienteConsulta(q),
  };
  const qConsulta = queriesVeic.primaria;
  const qBooleana = queriesVeic.booleana;
  const tEfetivo = topicTradMap[langVeic] || topicTerm || '';

  const whenTag = periodo === '24h' ? ' when:1d' : (periodo === '7d' ? ' when:7d' : (periodo === '30d' ? ' when:30d' : ''));
  const bingInterval = periodo === '24h' ? '&qft=interval%3d%227%22' : (periodo === '7d' ? '&qft=interval%3d%228%22' : (periodo === '30d' ? '&qft=interval%3d%229%22' : ''));

  const requisicoes = [
    fetchXml(`https://www.bing.com/news/search?q=${encodeURIComponent(`${qConsulta} site:${dom}`)}&format=rss&mkt=${encodeURIComponent(locEfetivo.mkt)}${bingInterval}`, 3800, isRefresh),
    fetchXml(`https://news.google.com/rss/search?q=${encodeURIComponent(`${qConsulta} site:${dom}` + whenTag)}&hl=${encodeURIComponent(locEfetivo.hl)}&gl=${encodeURIComponent(locEfetivo.gl)}&ceid=${encodeURIComponent(locEfetivo.ceid)}`, 3800, isRefresh),
  ];

  // Dispara também a variante booleana com sinônimos jornalísticos (ex: ("fuel truck" OR tanker) (fire OR blaze OR killed))
  if (qBooleana && normalizar(qBooleana) !== normalizar(qConsulta)) {
    requisicoes.push(
      fetchXml(`https://news.google.com/rss/search?q=${encodeURIComponent(`${qBooleana} site:${dom}` + whenTag)}&hl=${encodeURIComponent(locEfetivo.hl)}&gl=${encodeURIComponent(locEfetivo.gl)}&ceid=${encodeURIComponent(locEfetivo.ceid)}`, 3800, isRefresh)
    );
  }

  if (tEfetivo && normalizar(tEfetivo) !== normalizar(qConsulta)) {
    requisicoes.push(
      fetchXml(`https://news.google.com/rss/search?q=${encodeURIComponent(`${qConsulta} ${tEfetivo} site:${dom}` + (periodo === 'all' ? '' : whenTag))}&hl=${encodeURIComponent(locEfetivo.hl)}&gl=${encodeURIComponent(locEfetivo.gl)}&ceid=${encodeURIComponent(locEfetivo.ceid)}`, 3400, isRefresh)
    );
  }

  const xmlList = await Promise.all(requisicoes);
  let todosBrutos = [];
  for (const xml of xmlList) {
    if (xml) todosBrutos.push(...parseRssItems(xml, veiculo.n));
  }

  // Fallback 1: se o veículo nativo também tiver cobertura em inglês (ex: domínios bilíngues como madamasr.com), tenta em inglês (ou vice-versa)
  if (todosBrutos.length === 0 && plano && plano.queriesPorIdioma) {
    const langAlt = langVeic === 'en' ? idiomasPais.find((lg) => lg !== 'en') : 'en';
    if (langAlt && plano.queriesPorIdioma[langAlt]) {
      const locAlt = localeParams(langAlt, country);
      const qAlt = plano.queriesPorIdioma[langAlt].booleana || plano.queriesPorIdioma[langAlt].primaria;
      if (qAlt && normalizar(qAlt) !== normalizar(qConsulta)) {
        const fbAltXml = await fetchXml(
          `https://news.google.com/rss/search?q=${encodeURIComponent(`${qAlt} site:${dom}` + whenTag)}&hl=${encodeURIComponent(locAlt.hl)}&gl=${encodeURIComponent(locAlt.gl)}&ceid=${encodeURIComponent(locAlt.ceid)}`,
          3000,
          isRefresh
        );
        if (fbAltXml) todosBrutos.push(...parseRssItems(fbAltXml, veiculo.n));
      }
    }
  }

  // Fallback 2: relaxamento mantendo no mínimo o par nuclear de conceitos (NUNCA palavra comum única isolada e NUNCA sem filtro de período/relevância)
  if (todosBrutos.length === 0 && queriesVeic.relaxada && normalizar(queriesVeic.relaxada) !== normalizar(qConsulta)) {
    const fbRelaxXml = await fetchXml(
      `https://news.google.com/rss/search?q=${encodeURIComponent(`${queriesVeic.relaxada} site:${dom}` + whenTag)}&hl=${encodeURIComponent(locEfetivo.hl)}&gl=${encodeURIComponent(locEfetivo.gl)}&ceid=${encodeURIComponent(locEfetivo.ceid)}`,
      2800,
      isRefresh
    );
    if (fbRelaxXml) todosBrutos.push(...parseRssItems(fbRelaxXml, veiculo.n));
  }

  // Filtragem estrita de período e relevância temática (PROIBIDO retornar todosBrutos sem filtro!)
  const dentroJanela = todosBrutos.filter((it) => dentroDoPeriodo(it.publicadoEm, periodo));
  return deduplicarEOrdenarComPlano(dentroJanela, plano, maxArtigos, topicKey, false);
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

// Busca agregada em lotes de domínios agrupados por idioma real do veículo (nativo + inglês em países mistos)
async function buscarArtigosAgregadosPais(listaVeiculos, country, plano, per, isRefresh = false) {
  if (!listaVeiculos || !listaVeiculos.length || !plano) return [];
  const whenTag = per === '24h' ? ' when:1d' : (per === '7d' ? ' when:7d' : (per === '30d' ? ' when:30d' : ''));
  const bingInterval = per === '24h' ? '&qft=interval%3d%227%22' : (per === '7d' ? '&qft=interval%3d%228%22' : (per === '30d' ? '&qft=interval%3d%229%22' : ''));

  const dominiosPorIdioma = new Map();
  for (const v of listaVeiculos) {
    if (!v || !v.d) continue;
    const lg = detectarIdiomaPreferencialVeiculo(v, country, plano.idiomasPais);
    if (!dominiosPorIdioma.has(lg)) dominiosPorIdioma.set(lg, []);
    const arr = dominiosPorIdioma.get(lg);
    if (!arr.includes(v.d)) arr.push(v.d);
  }

  // Se o país possui múltiplos idiomas oficiais (ex: EG com ar + en, JP com ja + en), garante lote no idioma nativo primário também
  const nativoPrim = plano.idiomasPais[0];
  if (nativoPrim && !dominiosPorIdioma.has(nativoPrim)) {
    dominiosPorIdioma.set(nativoPrim, listaVeiculos.map((v) => v.d).filter(Boolean).slice(0, 9));
  }

  const consultas = [];
  const tamanhoLote = 9;

  for (const [lg, doms] of dominiosPorIdioma.entries()) {
    const qInfo = plano.queriesPorIdioma[lg] || plano.queriesPorIdioma.en;
    if (!qInfo || !doms.length) continue;
    const locLg = localeParams(lg, country);
    const qUso = qInfo.booleana || qInfo.primaria;

    const lotes = [];
    for (let i = 0; i < Math.min(doms.length, 36); i += tamanhoLote) {
      lotes.push(doms.slice(i, i + tamanhoLote));
    }

    for (const lote of lotes) {
      const orClause = lote.map((d) => `site:${d}`).join(' OR ');
      consultas.push(
        fetchXml(`https://news.google.com/rss/search?q=${encodeURIComponent(`${qUso} (${orClause})${whenTag}`)}&hl=${encodeURIComponent(locLg.hl)}&gl=${encodeURIComponent(locLg.gl)}&ceid=${encodeURIComponent(locLg.ceid)}`, 3800, isRefresh)
      );
      if (qInfo.primaria && qInfo.booleana && normalizar(qInfo.primaria) !== normalizar(qInfo.booleana)) {
        consultas.push(
          fetchXml(`https://www.bing.com/news/search?q=${encodeURIComponent(`${qInfo.primaria} (${orClause})`)}&format=rss&mkt=${encodeURIComponent(locLg.mkt)}${bingInterval}`, 3500, isRefresh)
        );
      }
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
      headlineContext: u.searchParams.get('headlineContext') || '',
      fromHotCompare: u.searchParams.get('fromHotCompare') === '1' || u.searchParams.get('fromHotCompare') === 'true',
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
      termosTurbinados: [],
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
  const fromHotCompare = Boolean(params.fromHotCompare || params.hotCompare);
  const headlineContext = limparMancheteContexto(params.headlineContext || '');
  const termosTurbinados = Array.isArray(params.termosTurbinados)
    ? params.termosTurbinados.map((t) => limparTermo(t)).filter(Boolean).slice(0, 6)
    : [];
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
        lang: o.lang ? String(o.lang).slice(0, 10) : '',
        pais: String(o.pais || country || '').toUpperCase().slice(0, 4),
      };
    })
    .filter((o) => o.n && o.d);

  if (!listaVeiculos.length && (country === 'BR' || country === '076' || !country)) {
    listaVeiculos = [
      { n: 'g1', u: 'https://g1.globo.com', d: 'g1.globo.com', b: 'I', ind: false, st: false, lang: 'pt', pais: 'BR' },
      { n: 'Folha de S.Paulo', u: 'https://www.folha.uol.com.br', d: 'folha.uol.com.br', b: 'I', ind: true, st: false, lang: 'pt', pais: 'BR' },
      { n: 'O Globo', u: 'https://oglobo.globo.com', d: 'oglobo.globo.com', b: 'I', ind: false, st: false, lang: 'pt', pais: 'BR' },
      { n: 'Estadão', u: 'https://www.estadao.com.br', d: 'estadao.com.br', b: 'D', ind: false, st: false, lang: 'pt', pais: 'BR' },
      { n: 'Agência Brasil', u: 'https://agenciabrasil.ebc.com.br', d: 'agenciabrasil.ebc.com.br', b: 'I', ind: false, st: true, lang: 'pt', pais: 'BR' },
      { n: 'CartaCapital', u: 'https://www.cartacapital.com.br', d: 'cartacapital.com.br', b: 'E', ind: true, st: false, lang: 'pt', pais: 'BR' },
      { n: 'Poder360', u: 'https://www.poder360.com.br', d: 'poder360.com.br', b: 'D', ind: true, st: false, lang: 'pt', pais: 'BR' },
      { n: 'CNN Brasil', u: 'https://www.cnnbrasil.com.br', d: 'cnnbrasil.com.br', b: 'I', ind: false, st: false, lang: 'pt', pais: 'BR' }
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
    isEnrich ? 'enrich' : (fromHotCompare ? 'hot' : 'search'),
    normalizar(q),
    normalizar(headlineContext),
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

  const idiomasPais = obterIdiomasPais(country, lang);
  const locPrimario = localeParams(idiomasPais[0] || lang, country);

  if (isTrendingMode) {
    const chaveCacheTrend = `trending|${(country || 'BR').toUpperCase()}|${(idiomasPais[0] || lang || 'pt').toLowerCase()}|${topic || 'all'}`;
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
    const topicosTrend = await buscarTopicosEmAltaPais(locPrimario, domsTrend, topicTerm, isRefresh);
    const isTrendFallback = topicosTrend.length === 0;
    const payloadTrend = {
      country: (country || 'BR').toUpperCase(),
      lang: idiomasPais[0] || lang || 'pt',
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
  const qBaseInicial = jaCorrigiuEstatico ? qCorrigido : q;

  let planoSemantico = null;
  const topicTradMap = {};
  let qDescoberto = '';

  if (!isEnrich) {
    const desacopladoTmp = desacoplarPaisDaConsulta(qBaseInicial, country, countryName);
    const termoDescoberta = desacopladoTmp.termoLocal || qBaseInicial;

    const [planoRes, descobertoRes, ...topicsTradRes] = await Promise.all([
      construirPlanoSemanticoMultilingue({
        qLocal: qBaseInicial,
        qOriginal: q,
        headlineContext,
        termosTurbinados,
        country,
        countryName,
        clientLang: lang,
      }),
      (jaCorrigiuEstatico || fromHotCompare || Boolean(headlineContext))
        ? Promise.resolve('')
        : descobrirTermoViaGoogleNews(termoDescoberta, locPrimario, isRefresh),
      ...(topicTerm ? idiomasPais.map((lg) => traduzirTermoParaIdioma(topicTerm, lg)) : []),
    ]);

    planoSemantico = planoRes;
    qDescoberto = descobertoRes || '';
    if (topicTerm) {
      idiomasPais.forEach((lg, idx) => {
        topicTradMap[lg] = topicsTradRes[idx] || topicTerm;
      });
    }
  } else if (topicTerm) {
    await Promise.all(
      idiomasPais.map(async (lg) => {
        topicTradMap[lg] = await traduzirTermoParaIdioma(topicTerm, lg);
      })
    );
  }

  if (!jaCorrigiuEstatico && qDescoberto && planoSemantico && normalizar(qDescoberto) !== normalizar(planoSemantico.qSemPais || q)) {
    qCorrigido = qDescoberto;
    planoSemantico = await construirPlanoSemanticoMultilingue({
      qLocal: qCorrigido,
      qOriginal: q,
      headlineContext,
      termosTurbinados,
      country,
      countryName,
      clientLang: lang,
    });
  }

  const termoCorrigidoFinal =
    !isEnrich &&
    planoSemantico &&
    normalizar(qCorrigido) !== normalizar(q) &&
    normalizar(qCorrigido) !== normalizar(planoSemantico.qSemPais)
      ? qCorrigido
      : '';
  const codigoBandeiraPadrao = String(country || '').toLowerCase();

  async function coletarPorPeriodo(per) {
    const maxArtigos = limiteArtigosPorPeriodo(per);

    const agregadosRawPromise = (!isEnrich && listaVeiculos.length > 0 && planoSemantico)
      ? buscarArtigosAgregadosPais(listaVeiculos, country, planoSemantico, per, isRefresh)
      : Promise.resolve([]);

    const [agregadosRaw, resultadosIndividuais] = await Promise.all([
      agregadosRawPromise,
      Promise.all(
        listaVeiculos.map(async (veic) => {
          const codigoPaisVeic = String(veic.pais || country || '').toUpperCase();
          const flagCode = codigoPaisVeic ? codigoPaisVeic.toLowerCase() : codigoBandeiraPadrao;
          const bandeiraUrl = flagCode ? `https://flagcdn.com/w80/${flagCode}.png` : '';
          const artigosRaw = await buscarPorVeiculo(
            veic,
            qBaseInicial,
            topicTerm,
            codigoPaisVeic || country,
            per,
            planoSemantico,
            topicTradMap,
            isEnrich,
            topic,
            isRefresh
          );
          return { veic, artigosRaw, codigoPaisVeic, bandeiraUrl };
        })
      )
    ]);

    const imagensPorTitulo = new Map();
    for (const art of agregadosRaw) {
      if (art && art.imagem && art.titulo) {
        const tk = normalizar(art.titulo).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 42);
        if (tk && !imagensPorTitulo.has(tk)) imagensPorTitulo.set(tk, art.imagem);
      }
    }

    const artigosPorDominio = new Map();
    for (const art of agregadosRaw) {
      if (!art || !art.url) continue;
      if (!dentroDoPeriodo(art.publicadoEm, per)) continue;
      if (planoSemantico && !avaliarArtigoContraPlano(art, planoSemantico, topic).aprovado) continue;

      let veicAlvo = null;
      let hostArt = '';
      let hostSource = '';
      try {
        hostArt = new URL(art.url).hostname.replace(/^www\./i, '').toLowerCase();
      } catch { }
      if (art.sourceUrl) {
        try {
          hostSource = new URL(art.sourceUrl).hostname.replace(/^www\./i, '').toLowerCase();
        } catch { }
      }
      const artVeicNorm = normalizar(art.veiculo || '');

      for (const v of listaVeiculos) {
        const vd = v.d.toLowerCase();
        const matchHostArt = Boolean(hostArt && (hostArt === vd || hostArt.endsWith('.' + vd)));
        const matchHostSrc = Boolean(hostSource && (hostSource === vd || hostSource.endsWith('.' + vd)));
        const vNomeNorm = normalizar(v.n || '');
        const matchNome = Boolean(
          artVeicNorm &&
          vNomeNorm &&
          vNomeNorm.length >= 3 &&
          artVeicNorm.length >= 3 &&
          (artVeicNorm.includes(vNomeNorm) || vNomeNorm.includes(artVeicNorm))
        );
        if (matchHostArt || matchHostSrc || matchNome) {
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

    const res = resultadosIndividuais.map(({ veic, artigosRaw, codigoPaisVeic, bandeiraUrl }) => {
      const extrasValidados = artigosPorDominio.get(veic.d) || [];
      // PROIBIDO injetar extras sem filtro: tanto artigosRaw quanto extrasValidados já passaram por dentroDoPeriodo + avaliarArtigoContraPlano
      const todos = [...artigosRaw, ...extrasValidados];
      const combinados = deduplicarEOrdenarComPlano(todos, planoSemantico, maxArtigos, topic, isEnrich);
      const artigos = combinados.map((art) => {
        let img = art.imagem || '';
        if (!img && art.titulo) {
          const tk = normalizar(art.titulo).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 42);
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
  const TEMPO_LIMITE_MS = 8500;

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

  // Em "Comparar cobertura" de notícia quente (fromHotCompare === true), NUNCA amplia para 'all' (anos anteriores); limita a '30d'
  const periodoMaximoFallback = fromHotCompare ? '30d' : 'all';
  if (
    !isEnrich &&
    totalInicial === 0 &&
    periodoEfetivo !== periodoMaximoFallback &&
    periodoEfetivo !== 'all' &&
    (Date.now() - inicioExecucao < TEMPO_LIMITE_MS - 1800)
  ) {
    const gruposMax = await coletarPorPeriodo(periodoMaximoFallback);
    if (gruposMax.reduce((acc, g) => acc + g.artigos.length, 0) > 0) {
      periodoEfetivo = periodoMaximoFallback;
      grupos = gruposMax;
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
}

export async function onRequestGet(context) {
  return handleBuscaAssunto(context.request);
}

export async function onRequestPost(context) {
  return handleBuscaAssunto(context.request);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}



