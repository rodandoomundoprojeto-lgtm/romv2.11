// Cloudflare Pages Function: /api/resumo
// Atualização automática diária do Resumo do Dia para o Rodando o Mundo
// Agrega e seleciona as 5 principais manchetes por relevância editorial com suporte a refresh em tempo real (_t / refresh=1 / force=1)
import {
  isRefreshRequest,
  newsResponseHeaders,
  compareIsoDesc,
  parseFeedItems,
  limparResumoEditorial,
  extrairImagemRssItem,
} from '../lib/rss.js';

const RSS_FEEDS = [
  {
    relevancia: 1,
    categoria: 'Geopolítica & Global',
    corEditoria: '#388bfd',
    url: 'https://feeds.bbci.co.uk/portuguese/rss.xml',
    fonte: 'BBC News Brasil',
    dominio: 'bbc.com',
    pais: 'Global',
    codigoPais: 'BR',
    continente: 'europa',
    tipoNoticia: 'politica',
    paginaTematica: '/geopolitica',
    labelTematica: 'Política & Diplomacia Global',
    explicacaoId: 'como-funcionam-as-eleicoes-nos-eua'
  },
  {
    relevancia: 2,
    categoria: 'Brasil · Política & Congresso',
    corEditoria: '#2ea043',
    url: 'https://g1.globo.com/rss/g1/politica/',
    fonte: 'g1 Política',
    dominio: 'g1.globo.com',
    pais: 'Brasil',
    codigoPais: 'BR',
    continente: 'sul',
    tipoNoticia: 'politica',
    paginaTematica: '/politica/brasil',
    labelTematica: 'Política no Brasil',
    explicacaoId: 'o-que-e-o-orcamento'
  },
  {
    relevancia: 3,
    categoria: 'Economia & Mercados',
    corEditoria: '#d29922',
    url: 'https://g1.globo.com/rss/g1/economia/',
    fonte: 'g1 Economia',
    dominio: 'g1.globo.com',
    pais: 'Brasil',
    codigoPais: 'BR',
    continente: 'sul',
    tipoNoticia: 'economia',
    paginaTematica: '/economia/brasil',
    labelTematica: 'Economia no Brasil',
    explicacaoId: 'o-que-e-inflacao'
  },
  {
    relevancia: 4,
    categoria: 'Segurança Internacional',
    corEditoria: '#f85149',
    url: 'https://g1.globo.com/rss/g1/mundo/',
    fonte: 'g1 Mundo',
    dominio: 'g1.globo.com',
    pais: 'Global',
    codigoPais: 'BR',
    continente: 'europa',
    tipoNoticia: 'mundo',
    paginaTematica: '/radar',
    labelTematica: 'Geopolítica & Segurança Internacional',
    explicacaoId: 'o-que-e-sancao-internacional'
  },
  {
    relevancia: 5,
    categoria: 'Clima & Tecnologia',
    corEditoria: '#a371f7',
    url: 'https://g1.globo.com/rss/g1/tecnologia/',
    fonte: 'g1 Tecnologia & Ciência',
    dominio: 'g1.globo.com',
    pais: 'Brasil',
    codigoPais: 'BR',
    continente: 'sul',
    tipoNoticia: 'tecnologia',
    paginaTematica: '/tecnologia',
    labelTematica: 'Tecnologia & Inovação',
    explicacaoId: 'o-que-e-a-cop30'
  }
];

const CATALOGO_PAISES_RESUMO = [
  {
    codigoPais: 'US',
    pais: 'Estados Unidos',
    continente: 'norte',
    paginaTematica: '/politica/estados-unidos',
    termos: ['estados unidos', 'eua', 'trump', 'biden', 'casa branca', 'washington', 'pentagono', 'faa', 'wall street', 'nova york', 'california', 'texas', 'florida']
  },
  {
    codigoPais: 'PH',
    pais: 'Filipinas',
    continente: 'asia',
    paginaTematica: '/radar',
    termos: ['filipinas', 'manila', 'filipino', 'marcos jr']
  },
  {
    codigoPais: 'CN',
    pais: 'China',
    continente: 'asia',
    paginaTematica: '/economia/china',
    termos: ['china', 'chines', 'chinesa', 'pequim', 'beijing', 'xi jinping', 'xangai', 'taiwan']
  },
  {
    codigoPais: 'AR',
    pais: 'Argentina',
    continente: 'sul',
    paginaTematica: '/politica/argentina',
    termos: ['argentina', 'argentino', 'buenos aires', 'milei', 'casa rosada']
  },
  {
    codigoPais: 'FR',
    pais: 'França',
    continente: 'europa',
    paginaTematica: '/politica/franca',
    termos: ['franca', 'frances', 'francesa', 'paris', 'macron']
  },
  {
    codigoPais: 'DE',
    pais: 'Alemanha',
    continente: 'europa',
    paginaTematica: '/economia/alemanha',
    termos: ['alemanha', 'alemao', 'alema', 'berlim', 'scholz', 'merz', 'bundestag']
  },
  {
    codigoPais: 'GB',
    pais: 'Reino Unido',
    continente: 'europa',
    paginaTematica: '/politica/reino-unido',
    termos: ['reino unido', 'inglaterra', 'londres', 'britanico', 'britanica', 'starmer', 'escocia']
  },
  {
    codigoPais: 'PT',
    pais: 'Portugal',
    continente: 'europa',
    paginaTematica: '/ultimas-noticias',
    termos: ['portugal', 'portugues', 'portuguesa', 'lisboa', 'porto']
  },
  {
    codigoPais: 'UA',
    pais: 'Ucrânia',
    continente: 'europa',
    paginaTematica: '/guerra-ucrania',
    termos: ['ucrania', 'ucraniano', 'ucraniana', 'kiev', 'kyiv', 'zelensky', 'donbass']
  },
  {
    codigoPais: 'RU',
    pais: 'Rússia',
    continente: 'europa',
    paginaTematica: '/guerra-ucrania',
    termos: ['russia', 'russo', 'russa', 'moscou', 'kremlin', 'putin']
  },
  {
    codigoPais: 'IL',
    pais: 'Israel',
    continente: 'asia',
    paginaTematica: '/radar',
    termos: ['israel', 'israelense', 'tel aviv', 'jerusalem', 'netanyahu', 'mossad', 'gaza', 'hamas', 'hezbollah']
  },
  {
    codigoPais: 'IR',
    pais: 'Irã',
    continente: 'asia',
    paginaTematica: '/radar',
    termos: ['ira', 'iraniano', 'iraniana', 'teera', 'khamenei', 'persa']
  },
  {
    codigoPais: 'JP',
    pais: 'Japão',
    continente: 'asia',
    paginaTematica: '/economia',
    termos: ['japao', 'japones', 'japonesa', 'toquio', 'tokyo']
  },
  {
    codigoPais: 'IN',
    pais: 'Índia',
    continente: 'asia',
    paginaTematica: '/economia',
    termos: ['india', 'indiano', 'indiana', 'nova delhi', 'modi']
  },
  {
    codigoPais: 'MX',
    pais: 'México',
    continente: 'norte',
    paginaTematica: '/ultimas-noticias',
    termos: ['mexico', 'mexicano', 'mexicana', 'cidade do mexico', 'sheinbaum']
  },
  {
    codigoPais: 'ES',
    pais: 'Espanha',
    continente: 'europa',
    paginaTematica: '/ultimas-noticias',
    termos: ['espanha', 'espanhol', 'espanhola', 'madri', 'madrid', 'barcelona', 'sanchez']
  },
  {
    codigoPais: 'IT',
    pais: 'Itália',
    continente: 'europa',
    paginaTematica: '/ultimas-noticias',
    termos: ['italia', 'italiano', 'italiana', 'roma', 'meloni', 'vaticano', 'papa']
  },
  {
    codigoPais: 'CA',
    pais: 'Canadá',
    continente: 'norte',
    paginaTematica: '/ultimas-noticias',
    termos: ['canada', 'canadense', 'ottawa', 'trudeau', 'toronto']
  },
  {
    codigoPais: 'ZA',
    pais: 'África do Sul',
    continente: 'africa',
    paginaTematica: '/ultimas-noticias',
    termos: ['africa do sul', 'sul-africano', 'pretoria', 'joanesburgo']
  },
  {
    codigoPais: 'CO',
    pais: 'Colômbia',
    continente: 'sul',
    paginaTematica: '/ultimas-noticias',
    termos: ['colombia', 'colombiano', 'bogota', 'petro']
  },
  {
    codigoPais: 'CL',
    pais: 'Chile',
    continente: 'sul',
    paginaTematica: '/ultimas-noticias',
    termos: ['chile', 'chileno', 'santiago', 'boric']
  },
  {
    codigoPais: 'VE',
    pais: 'Venezuela',
    continente: 'sul',
    paginaTematica: '/ultimas-noticias',
    termos: ['venezuela', 'venezuelano', 'caracas', 'maduro']
  },
  {
    codigoPais: 'PY',
    pais: 'Paraguai',
    continente: 'sul',
    paginaTematica: '/ultimas-noticias',
    termos: ['paraguai', 'paraguaio', 'assuncao']
  },
  {
    codigoPais: 'UY',
    pais: 'Uruguai',
    continente: 'sul',
    paginaTematica: '/ultimas-noticias',
    termos: ['uruguai', 'uruguaio', 'montevideu']
  },
  {
    codigoPais: 'PE',
    pais: 'Peru',
    continente: 'sul',
    paginaTematica: '/ultimas-noticias',
    termos: ['peru', 'peruano', 'lima']
  },
  {
    codigoPais: 'KR',
    pais: 'Coreia do Sul',
    continente: 'asia',
    paginaTematica: '/tecnologia',
    termos: ['coreia do sul', 'sul-coreano', 'seul']
  },
  {
    codigoPais: 'KP',
    pais: 'Coreia do Norte',
    continente: 'asia',
    paginaTematica: '/radar',
    termos: ['coreia do norte', 'norte-coreano', 'pyongyang', 'kim jong']
  },
  {
    codigoPais: 'BR',
    pais: 'Brasil',
    continente: 'sul',
    paginaTematica: '/politica/brasil',
    termos: ['brasil', 'brasileiro', 'brasileira', 'brasilia', 'lula', 'stf', 'senado', 'camara', 'planalto', 'congresso', 'sao paulo', 'rio de janeiro']
  }
];

function normalizarTexto(str) {
  return String(str == null ? '' : str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inferirPaisDaManchete(titulo, resumo, feedDefault) {
  const titNorm = normalizarTexto(titulo);
  const resNorm = normalizarTexto(resumo);
  const combinado = `${titNorm} ${resNorm}`.trim();

  if (!combinado) {
    return {
      pais: feedDefault.pais,
      codigoPais: feedDefault.codigoPais,
      continente: feedDefault.continente,
      paginaTematica: feedDefault.paginaTematica,
      explicitCountry: false
    };
  }

  let melhor = null;
  let maiorScore = 0;

  for (const item of CATALOGO_PAISES_RESUMO) {
    let score = 0;
    for (const termo of item.termos) {
      const rx = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(termo)}(?:$|[^a-z0-9])`, 'i');
      if (rx.test(titNorm)) score += 50;
      if (rx.test(resNorm)) score += 25;
    }
    if (score > maiorScore) {
      maiorScore = score;
      melhor = item;
    }
  }

  if (melhor && maiorScore > 0) {
    return {
      pais: melhor.pais,
      codigoPais: melhor.codigoPais,
      continente: melhor.continente,
      paginaTematica: melhor.paginaTematica || feedDefault.paginaTematica,
      explicitCountry: true
    };
  }

  return {
    pais: feedDefault.pais,
    codigoPais: feedDefault.codigoPais,
    continente: feedDefault.continente,
    paginaTematica: feedDefault.paginaTematica,
    explicitCountry: false
  };
}

function codigoPaisParaBandeiraEmoji(codigoPais, pais, relevancia = 0, explicitCountry = true) {
  if (!codigoPais || pais === 'Global' || pais === 'Internacional' || ((relevancia === 1 || relevancia === 4) && !explicitCountry)) {
    return '🌍';
  }
  const code = String(codigoPais).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🌍';
  return String.fromCodePoint(
    0x1F1E6 + (code.charCodeAt(0) - 65),
    0x1F1E6 + (code.charCodeAt(1) - 65)
  );
}

const TERMOS_GEOPOLITICA_INTERNACIONAL = [
  'guerra', 'onu', 'otan', 'eua', 'estados unidos', 'china', 'russia', 'ucrania',
  'oriente medio', 'israel', 'gaza', 'europa', 'uniao europeia', 'tarifas',
  'diplomacia', 'fronteira', 'tratado', 'cupula', 'g20', 'g7', 'brics',
  'internacional', 'global', 'mundo', 'trump', 'putin', 'xi jinping',
  'teera', 'iraniano', 'iraniana', 'khamenei'
];

function ehCandidatoGeopoliticaInternacional(cand, feedDefault) {
  const infoPais = inferirPaisDaManchete(cand.titulo, cand.resumo, feedDefault);
  if (infoPais.explicitCountry && infoPais.codigoPais !== 'BR') {
    return true;
  }

  const textoBruto = `${cand.titulo || ''} ${cand.resumo || ''}`;
  if (/\birã\b/i.test(textoBruto)) {
    return true;
  }

  const textoNorm = normalizarTexto(textoBruto);
  for (const termo of TERMOS_GEOPOLITICA_INTERNACIONAL) {
    const rx = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(termo)}(?:$|[^a-z0-9])`, 'i');
    if (rx.test(textoNorm)) {
      return true;
    }
  }

  return false;
}

function parseRssItems(xml, maxItems = 15) {
  if (!xml) return [];
  const parsed = parseFeedItems(xml);
  const results = [];

  for (const entry of parsed) {
    const title = entry.title || '';
    const link = entry.link || '';
    const rawDesc = entry.rawDescription || entry.description || '';
    const desc = limparResumoEditorial(rawDesc, 195);
    const imagemUrl =
      entry.imageUrl ||
      extrairImagemRssItem(entry.rawBlock || '', entry.rawDescription || '', entry.rawContent || '') ||
      null;

    if (!title || !link) continue;

    results.push({
      titulo: title,
      url: link,
      resumo: desc,
      imagemUrl,
      data: entry.pubDateIso || '',
    });
  }

  results.sort((a, b) => compareIsoDesc(a.data, b.data));
  return results.slice(0, maxItems);
}

const STOPWORDS_ASSUNTO = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'e', 'ou', 'mas',
  'que', 'se', 'por', 'para', 'com', 'sem', 'sob', 'sobre', 'entre',
  'apos', 'antes', 'ate', 'desde', 'contra', 'como', 'mais', 'menos',
  'muito', 'muita', 'muitos', 'muitas', 'ja', 'ainda', 'tambem', 'so',
  'apenas', 'nao', 'sim', 'ser', 'estar', 'ter', 'haver', 'fazer',
  'ir', 'vir', 'poder', 'dever', 'diz', 'disse', 'afirma', 'afirmou',
  'fala', 'falou', 'pede', 'pediu', 'veja', 'entenda', 'saiba', 'confira',
  'novo', 'nova', 'novos', 'novas', 'maior', 'menor', 'melhor', 'pior',
  'grande', 'primeiro', 'primeira', 'segundo', 'segunda', 'terceiro',
  'hoje', 'ontem', 'amanha', 'dia', 'dias', 'semana', 'mes', 'ano', 'anos',
  'brasil', 'brasileiro', 'brasileira', 'mundo', 'pais', 'paises', 'governo',
  'video', 'foto', 'fotos', 'ao', 'aos', 'pela', 'pelo', 'pelas', 'pelos',
  'num', 'numa', 'essa', 'esse', 'esta', 'este', 'isso', 'isto', 'aquele',
  'aquela', 'sua', 'seu', 'suas', 'seus', 'projeto', 'lei', 'medida',
  'plano', 'caso', 'crise', 'acao', 'acoes', 'reuniao', 'encontro',
  'decisao', 'relatorio', 'dados', 'pesquisa', 'estudo', 'the', 'and',
  'for', 'with', 'from', 'that', 'this'
]);

const SIGLAS_VALIDAS = new Set(['ia', 'bc', 'pt', 'pl', 'pf', 'ue', 'onu', 'eua', 'stf', 'pib']);

function extrairTituloBase(titulo) {
  if (!titulo) return '';
  let t = String(titulo).trim();
  const idx = t.indexOf(':');
  if (idx > -1) {
    const antes = t.slice(0, idx).trim();
    const depois = t.slice(idx + 1).trim();
    if (antes.length >= 18) {
      t = antes;
    } else if (depois.length >= 18) {
      t = depois;
    }
  }
  return t.replace(/['"“”‘’][^'"“”‘’]{5,}['"“”‘’]\s*$/, '').trim();
}

function extrairTokensAssunto(texto) {
  const norm = normalizarTexto(texto);
  if (!norm) return [];
  const partes = norm.split(/[^a-z0-9]+/).filter(Boolean);
  const unicos = new Set();
  for (const tk of partes) {
    if ((tk.length >= 3 || SIGLAS_VALIDAS.has(tk)) && !STOPWORDS_ASSUNTO.has(tk)) {
      unicos.add(tk);
    }
  }
  return [...unicos];
}

function tokensSaoEquivalentes(a, b) {
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5)) return true;
  return false;
}

function contarTokensEmComum(tokensA, tokensB) {
  let count = 0;
  const usadosB = new Set();
  for (const a of tokensA) {
    for (let j = 0; j < tokensB.length; j++) {
      if (!usadosB.has(j) && tokensSaoEquivalentes(a, tokensB[j])) {
        count++;
        usadosB.add(j);
        break;
      }
    }
  }
  return count;
}

function normalizarUrlComparacao(rawUrl) {
  if (!rawUrl) return '';
  return String(rawUrl)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .split('?')[0]
    .split('#')[0]
    .replace(/\/+$/, '');
}

function avaliarSimilaridadeAssunto(cand, sel) {
  const urlA = normalizarUrlComparacao(cand.url);
  const urlB = normalizarUrlComparacao(sel.url);
  if (urlA && urlB && urlA === urlB) {
    return { mesmoAssunto: true, score: 1.0 };
  }

  const baseA = normalizarTexto(extrairTituloBase(cand.titulo));
  const baseB = normalizarTexto(extrairTituloBase(sel.titulo));
  if (
    baseA &&
    baseB &&
    (baseA === baseB ||
      (baseA.length >= 20 && baseB.length >= 20 && (baseA.includes(baseB) || baseB.includes(baseA))))
  ) {
    return { mesmoAssunto: true, score: 1.0 };
  }

  const tokensBaseA = extrairTokensAssunto(baseA);
  const tokensBaseB = extrairTokensAssunto(baseB);
  const sharedBase = contarTokensEmComum(tokensBaseA, tokensBaseB);
  const minBase = Math.min(tokensBaseA.length, tokensBaseB.length);
  const overlapBase = minBase > 0 ? sharedBase / minBase : 0;
  if (sharedBase >= 2 && overlapBase >= 0.75) {
    return { mesmoAssunto: true, score: Math.max(overlapBase, 0.9) };
  }

  const titA = extrairTokensAssunto(cand.titulo);
  const titB = extrairTokensAssunto(sel.titulo);
  const sharedTitle = contarTokensEmComum(titA, titB);
  const minTitle = Math.min(titA.length, titB.length);
  const overlapTitle = minTitle > 0 ? sharedTitle / minTitle : 0;

  const combA = extrairTokensAssunto(`${cand.titulo} ${cand.resumo || ''}`);
  const combB = extrairTokensAssunto(`${sel.titulo} ${sel.resumo || ''}`);
  const sharedComb = contarTokensEmComum(combA, combB);
  const minComb = Math.min(combA.length, combB.length);
  const unionComb = combA.length + combB.length - sharedComb;
  const overlapComb = minComb > 0 ? sharedComb / minComb : 0;
  const jaccardComb = unionComb > 0 ? sharedComb / unionComb : 0;

  const mesmoAssunto =
    (sharedTitle >= 2 && (overlapTitle >= 0.3 || sharedTitle >= 3)) ||
    (sharedTitle >= 1 && sharedComb >= 4 && (overlapComb >= 0.45 || jaccardComb >= 0.25));

  const score = Math.max(overlapBase, overlapTitle, jaccardComb);
  return { mesmoAssunto, score };
}

function construirUrlCompararSite({ relevancia, codigoPais, continente, tipoNoticia, termoBusca }) {
  return (
    `https://www.rodandoomundo.com.br/resumo-do-dia` +
    `?item=${encodeURIComponent(relevancia)}` +
    `&comparar=1` +
    `&pais=${encodeURIComponent(codigoPais || 'BR')}` +
    `&cont=${encodeURIComponent(continente || 'sul')}` +
    `&topico=${encodeURIComponent(tipoNoticia || 'politica')}` +
    `&q=${encodeURIComponent(termoBusca || '')}`
  );
}

function verificarEAgruparDuplicata(cand, fonteAtual, selecionados) {
  let colidiu = false;
  for (const sel of selecionados) {
    if (avaliarSimilaridadeAssunto(cand, sel).mesmoAssunto) {
      colidiu = true;
      if (fonteAtual && Array.isArray(sel.fontesAgrupadas) && !sel.fontesAgrupadas.includes(fonteAtual)) {
        sel.fontesAgrupadas.push(fonteAtual);
      }
      if (!sel.imagemUrl && cand.imagemUrl) {
        sel.imagemUrl = cand.imagemUrl;
      }
    }
  }
  return colidiu;
}

const RESUMO_MEMORY_TTL_MS = 5 * 60 * 1000;

let memoryCache = {
  date: '',
  timestamp: 0,
  data: null
};

export async function onRequestGet(context) {
  const now = new Date();
  const hojeStr = now.toISOString().slice(0, 10);
  const isRefresh = isRefreshRequest(context.request);

  if (isRefresh) {
    memoryCache = { date: '', timestamp: 0, data: null };
  }

  if (
    !isRefresh &&
    memoryCache.data &&
    !memoryCache.data.fallback &&
    memoryCache.date === hojeStr &&
    (Date.now() - memoryCache.timestamp < RESUMO_MEMORY_TTL_MS)
  ) {
    return new Response(JSON.stringify(memoryCache.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...newsResponseHeaders({
          isRefresh: false,
          isFallback: false,
          corsHeaders: { 'Access-Control-Allow-Origin': '*' },
        }),
      }
    });
  }

  const feedsComCandidatos = await Promise.all(
    RSS_FEEDS.map(async (f) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4500);
        const res = await fetch(f.url, {
          cache: 'no-store',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RodandoOMundoBot/2.12; +https://www.rodandoomundo.com.br)',
            ...(isRefresh ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : {})
          },
          signal: ctrl.signal
        });
        clearTimeout(t);
        if (!res.ok) throw new Error('Status ' + res.status);
        const xml = await res.text();
        const candidatos = parseRssItems(xml, 15);
        if (!candidatos.length) {
          throw new Error('Nenhum item válido');
        }
        return { feed: f, candidatos };
      } catch {
        return { feed: f, candidatos: [] };
      }
    })
  );

  feedsComCandidatos.sort((a, b) => a.feed.relevancia - b.feed.relevancia);

  const selecionados = [];
  let usedFallback = false;
  const items = feedsComCandidatos.map(({ feed: f, candidatos }) => {
    let escolhido = null;

    if (candidatos.length) {
      if (f.relevancia === 1) {
        // 1ª passada (Slot #1 Geopolítica & Global): prioriza notícia internacional ou geopolítica
        for (const cand of candidatos) {
          const colidiu = verificarEAgruparDuplicata(cand, f.fonte, selecionados);
          if (!colidiu && ehCandidatoGeopoliticaInternacional(cand, f)) {
            escolhido = cand;
            break;
          }
        }
      }

      // 2ª passada (ou seleção padrão para slots #2..#5): primeiro candidato inédito
      if (!escolhido) {
        for (const cand of candidatos) {
          const colidiu = verificarEAgruparDuplicata(cand, f.fonte, selecionados);
          if (!colidiu) {
            escolhido = cand;
            break;
          }
        }
      }

      // 3. Fallback: se todos tiverem alguma sobreposição, escolhe o de menor similaridade
      if (!escolhido) {
        let menorScore = Infinity;
        for (const cand of candidatos) {
          const maxSim = selecionados.reduce(
            (acc, sel) => Math.max(acc, avaliarSimilaridadeAssunto(cand, sel).score),
            0
          );
          if (maxSim < menorScore) {
            menorScore = maxSim;
            escolhido = cand;
          }
        }
      }
    }

    if (!escolhido) {
      usedFallback = true;
      const bandeiraFallback = codigoPaisParaBandeiraEmoji(f.codigoPais, f.pais, f.relevancia, false);
      return {
        relevancia: f.relevancia,
        categoria: f.categoria,
        corEditoria: f.corEditoria,
        titulo: `Principais desdobramentos em ${f.categoria}`,
        resumo: 'Acompanhe os acontecimentos e a cobertura comparada do dia.',
        resumoCurto: 'Acompanhe os acontecimentos e a cobertura comparada do dia.',
        fonte: f.fonte,
        fontesAgrupadas: [f.fonte],
        dominio: f.dominio,
        termoBusca: f.categoria,
        url: `https://${f.dominio}`,
        urlMateriaOriginal: `https://${f.dominio}`,
        imagemUrl: null,
        paginaTematica: f.paginaTematica,
        labelTematica: f.labelTematica,
        explicacaoId: f.explicacaoId,
        pais: f.pais,
        codigoPais: f.codigoPais,
        bandeiraEmoji: bandeiraFallback,
        continente: f.continente,
        tipoNoticia: f.tipoNoticia,
        publicadoEm: '',
        urlCompararSite: construirUrlCompararSite({
          relevancia: f.relevancia,
          codigoPais: f.codigoPais,
          continente: f.continente,
          tipoNoticia: f.tipoNoticia,
          termoBusca: f.categoria,
        }),
      };
    }

    const paisInferido = inferirPaisDaManchete(escolhido.titulo, escolhido.resumo, f);
    const resumoLimpo =
      limparResumoEditorial(escolhido.resumo, 195) ||
      'Acompanhe a cobertura deste tema na matéria original.';
    const termoBusca =
      extrairTituloBase(escolhido.titulo).slice(0, 60).trim() ||
      escolhido.titulo.slice(0, 50).trim();
    const bandeiraEmoji = codigoPaisParaBandeiraEmoji(
      paisInferido.codigoPais,
      paisInferido.pais,
      f.relevancia,
      paisInferido.explicitCountry
    );

    const itemObj = {
      relevancia: f.relevancia,
      categoria: f.categoria,
      corEditoria: f.corEditoria,
      titulo: escolhido.titulo,
      resumo: resumoLimpo,
      resumoCurto: resumoLimpo,
      fonte: f.fonte,
      fontesAgrupadas: [f.fonte],
      dominio: f.dominio,
      termoBusca,
      url: escolhido.url,
      urlMateriaOriginal: escolhido.url,
      imagemUrl: escolhido.imagemUrl || null,
      paginaTematica: paisInferido.paginaTematica,
      labelTematica: f.labelTematica,
      explicacaoId: f.explicacaoId,
      pais: paisInferido.pais,
      codigoPais: paisInferido.codigoPais,
      bandeiraEmoji,
      continente: paisInferido.continente,
      tipoNoticia: f.tipoNoticia,
      publicadoEm: escolhido.data || '',
      urlCompararSite: construirUrlCompararSite({
        relevancia: f.relevancia,
        codigoPais: paisInferido.codigoPais,
        continente: paisInferido.continente,
        tipoNoticia: f.tipoNoticia,
        termoBusca,
      }),
    };

    selecionados.push(itemObj);
    return itemObj;
  });

  // Passada cruzada para agrupar fontes e aproveitar imagem caso outra editoria também cubra o mesmo assunto
  for (const { feed: f, candidatos } of feedsComCandidatos) {
    for (const cand of candidatos) {
      for (const sel of selecionados) {
        if (avaliarSimilaridadeAssunto(cand, sel).mesmoAssunto) {
          if (f.fonte && !sel.fontesAgrupadas.includes(f.fonte)) {
            sel.fontesAgrupadas.push(f.fonte);
          }
          if (!sel.imagemUrl && cand.imagemUrl) {
            sel.imagemUrl = cand.imagemUrl;
          }
        }
      }
    }
  }

  const payload = {
    dataEdicao: hojeStr,
    atualizadoEm: now.toISOString(),
    total: items.length,
    fallback: usedFallback,
    items: items
  };

  if (!usedFallback && selecionados.length > 0) {
    memoryCache = {
      date: hojeStr,
      timestamp: Date.now(),
      data: payload
    };
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...newsResponseHeaders({
        isRefresh,
        isFallback: usedFallback,
        corsHeaders: { 'Access-Control-Allow-Origin': '*' },
      }),
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept'
    }
  });
}
