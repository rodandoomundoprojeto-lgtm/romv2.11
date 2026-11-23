// Cloudflare Worker Dedicado: Resumo do Dia
// Executa via Cron Trigger às 07:00 da manhã (Brasília) / 10:00 UTC
// Também aceita requisição HTTP para testes ou disparo manual sob demanda

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
    tipoNoticia: 'politica'
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
    tipoNoticia: 'politica'
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
    tipoNoticia: 'economia'
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
    tipoNoticia: 'mundo'
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
    tipoNoticia: 'tecnologia'
  }
];

const CORES_POR_RELEVANCIA = {
  1: '#388bfd',
  2: '#2ea043',
  3: '#d29922',
  4: '#f85149',
  5: '#a371f7'
};

const CATALOGO_PAISES_RESUMO = [
  { codigoPais: 'US', pais: 'Estados Unidos', continente: 'norte', termos: ['estados unidos', 'eua', 'trump', 'biden', 'casa branca', 'washington', 'pentagono', 'faa', 'wall street', 'nova york', 'california', 'texas', 'florida'] },
  { codigoPais: 'PH', pais: 'Filipinas', continente: 'asia', termos: ['filipinas', 'manila', 'filipino', 'marcos jr'] },
  { codigoPais: 'CN', pais: 'China', continente: 'asia', termos: ['china', 'chines', 'chinesa', 'pequim', 'beijing', 'xi jinping', 'xangai', 'taiwan'] },
  { codigoPais: 'AR', pais: 'Argentina', continente: 'sul', termos: ['argentina', 'argentino', 'buenos aires', 'milei', 'casa rosada'] },
  { codigoPais: 'FR', pais: 'França', continente: 'europa', termos: ['franca', 'frances', 'francesa', 'paris', 'macron'] },
  { codigoPais: 'DE', pais: 'Alemanha', continente: 'europa', termos: ['alemanha', 'alemao', 'alema', 'berlim', 'scholz', 'merz', 'bundestag'] },
  { codigoPais: 'GB', pais: 'Reino Unido', continente: 'europa', termos: ['reino unido', 'inglaterra', 'londres', 'britanico', 'britanica', 'starmer', 'escocia'] },
  { codigoPais: 'PT', pais: 'Portugal', continente: 'europa', termos: ['portugal', 'portugues', 'portuguesa', 'lisboa', 'porto'] },
  { codigoPais: 'UA', pais: 'Ucrânia', continente: 'europa', termos: ['ucrania', 'ucraniano', 'ucraniana', 'kiev', 'kyiv', 'zelensky', 'donbass'] },
  { codigoPais: 'RU', pais: 'Rússia', continente: 'europa', termos: ['russia', 'russo', 'russa', 'moscou', 'kremlin', 'putin'] },
  { codigoPais: 'IL', pais: 'Israel', continente: 'asia', termos: ['israel', 'israelense', 'tel aviv', 'jerusalem', 'netanyahu', 'mossad', 'gaza', 'hamas', 'hezbollah'] },
  { codigoPais: 'IR', pais: 'Irã', continente: 'asia', termos: ['ira', 'iraniano', 'iraniana', 'teera', 'khamenei', 'persa'] },
  { codigoPais: 'JP', pais: 'Japão', continente: 'asia', termos: ['japao', 'japones', 'japonesa', 'toquio', 'tokyo'] },
  { codigoPais: 'IN', pais: 'Índia', continente: 'asia', termos: ['india', 'indiano', 'indiana', 'nova delhi', 'modi'] },
  { codigoPais: 'MX', pais: 'México', continente: 'norte', termos: ['mexico', 'mexicano', 'mexicana', 'cidade do mexico', 'sheinbaum'] },
  { codigoPais: 'ES', pais: 'Espanha', continente: 'europa', termos: ['espanha', 'espanhol', 'espanhola', 'madri', 'madrid', 'barcelona', 'sanchez'] },
  { codigoPais: 'IT', pais: 'Itália', continente: 'europa', termos: ['italia', 'italiano', 'italiana', 'roma', 'meloni', 'vaticano', 'papa'] },
  { codigoPais: 'CA', pais: 'Canadá', continente: 'norte', termos: ['canada', 'canadense', 'ottawa', 'trudeau', 'toronto'] },
  { codigoPais: 'ZA', pais: 'África do Sul', continente: 'africa', termos: ['africa do sul', 'sul-africano', 'pretoria', 'joanesburgo'] },
  { codigoPais: 'CO', pais: 'Colômbia', continente: 'sul', termos: ['colombia', 'colombiano', 'bogota', 'petro'] },
  { codigoPais: 'CL', pais: 'Chile', continente: 'sul', termos: ['chile', 'chileno', 'santiago', 'boric'] },
  { codigoPais: 'VE', pais: 'Venezuela', continente: 'sul', termos: ['venezuela', 'venezuelano', 'caracas', 'maduro'] },
  { codigoPais: 'PY', pais: 'Paraguai', continente: 'sul', termos: ['paraguai', 'paraguaio', 'assuncao'] },
  { codigoPais: 'UY', pais: 'Uruguai', continente: 'sul', termos: ['uruguai', 'uruguaio', 'montevideu'] },
  { codigoPais: 'PE', pais: 'Peru', continente: 'sul', termos: ['peru', 'peruano', 'lima'] },
  { codigoPais: 'KR', pais: 'Coreia do Sul', continente: 'asia', termos: ['coreia do sul', 'sul-coreano', 'seul'] },
  { codigoPais: 'KP', pais: 'Coreia do Norte', continente: 'asia', termos: ['coreia do norte', 'norte-coreano', 'pyongyang', 'kim jong'] },
  { codigoPais: 'BR', pais: 'Brasil', continente: 'sul', termos: ['brasil', 'brasileiro', 'brasileira', 'brasilia', 'lula', 'stf', 'senado', 'camara', 'planalto', 'congresso', 'sao paulo', 'rio de janeiro'] }
];

function decodificarEntidades(str) {
  if (!str) return '';
  return String(str)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(Number(dec));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function cleanHtml(raw) {
  if (!raw) return '';
  return decodificarEntidades(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ehSegmentoCreditoFotografico(seg) {
  if (!seg) return false;
  const s = String(seg).trim();
  if (!s) return true;
  if (s.length > 130) return false;

  if (/^(?:foto|cr[eé]dito|imagem|legenda|reprodu[cç][aã]o|divulga[cç][aã]o|arquivo|arte|ilustra[cç][aã]o|montagem)\s*[:\/\-]/i.test(s)) {
    return true;
  }

  if (
    /^[A-ZÀ-Ú0-9][A-Za-zÀ-ÿ0-9\s.,'()-]{1,75}\/\s*(?:Ag[êe]ncia\s+[A-Za-zÀ-ÿ\s]+|Reuters|AFP|AP(?:\s+Photo)?|EFE|TV\s+Globo|GloboNews|Globo|G1|g1|Divulga[cç][aã]o|Reprodu[cç][aã]o|Arquivo(?:\s+Pessoal)?|Futurah|Estad[aã]o(?:\s+Conte[úu]do)?|Folhapress|Getty(?:\s+Images)?|Bloomberg|Frame|Fotoarena|Brazil\s+Photo\s+Press|C[âa]mara(?:\s+dos\s+Deputados)?|Senado|STF|Planalto|PR|Gov\.br|Instagram|Redes\s+Sociais|X|Twitter|YouTube)\b/i.test(
      s
    )
  ) {
    return true;
  }

  if (s.length <= 75 && !/[.!?]$/.test(s) && /\b[A-Za-zÀ-ÿ.]+\s*\/\s*[A-ZÀ-Úa-zà-ú]{2,}/.test(s)) {
    return true;
  }

  return false;
}

function limparResumoEditorial(raw, maxLen = 195) {
  if (!raw) return '';
  let html = decodificarEntidades(String(raw))
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ');

  const partesBr = html
    .split(/<br\s*\/?>|<\/p>|<\/div>|\r?\n/i)
    .map((p) => p.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (partesBr.length >= 3 && ehSegmentoCreditoFotografico(partesBr[1])) {
    partesBr.splice(0, 2);
  }
  while (partesBr.length > 1 && ehSegmentoCreditoFotografico(partesBr[0])) {
    partesBr.shift();
  }

  let texto = (partesBr.length ? partesBr.join(' ') : html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

  texto = texto
    .replace(
      /^([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú.'-]+){0,4}\s*\/\s*(?:Ag[êe]ncia\s+Brasil|Ag[êe]ncia\s+Senado|Ag[êe]ncia\s+C[âa]mara|Reuters|AFP|AP(?:\s+Photo)?|EFE|TV\s+Globo|GloboNews|G1|g1|Divulga[cç][aã]o|Reprodu[cç][aã]o|Arquivo(?:\s+Pessoal)?|Futurah|Estad[aã]o(?:\s+Conte[úu]do)?|Folhapress|Getty(?:\s+Images)?|Bloomberg|Fotoarena)\s*)+/i,
      ''
    )
    .replace(
      /^(?:Foto|Cr[eé]dito|Imagem|Legenda|Reprodu[cç][aã]o|Divulga[cç][aã]o|Arquivo)\s*[:\/]\s*[^\n.]{2,60}?(?=\s+[A-ZÀ-Ú])/i,
      ''
    )
    .replace(/^\((?:Foto|Cr[eé]dito|Imagem)\s*:[^)]+\)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (maxLen > 0 && texto.length > maxLen) {
    const corte = texto.slice(0, maxLen);
    const ultimoEspaco = corte.lastIndexOf(' ');
    const base = ultimoEspaco > Math.floor(maxLen * 0.6) ? corte.slice(0, ultimoEspaco) : corte;
    return base.replace(/[,.;:\-–—\s]+$/, '') + '…';
  }

  return texto;
}

function extrairImagemRssItem(itemXml, rawDesc = '', rawContent = '') {
  if (!itemXml && !rawDesc && !rawContent) return null;
  const srcBloco = String(itemXml || '');
  const candidatos = [];

  const mThumb = srcBloco.match(/<media:thumbnail\b[^>]*\burl=["']([^"']+)["'][^>]*\/?>/i);
  if (mThumb && mThumb[1]) candidatos.push(mThumb[1]);

  const mMedia = srcBloco.match(/<media:content\b(?![^>]*\bmedium=["']video["'])[^>]*\burl=["']([^"']+)["'][^>]*\/?>/i);
  if (mMedia && mMedia[1]) candidatos.push(mMedia[1]);

  const mEncImg = srcBloco.match(
    /<enclosure\b(?=[^>]*\btype=["']image\/[^"']*["'])[^>]*\burl=["']([^"']+)["'][^>]*\/?>/i
  );
  if (mEncImg && mEncImg[1]) candidatos.push(mEncImg[1]);

  const mEncExt = srcBloco.match(
    /<enclosure\b[^>]*\burl=["']([^"']+\.(?:jpe?g|png|webp|gif|avif)(?:\?[^"']*)?)["'][^>]*\/?>/i
  );
  if (mEncExt && mEncExt[1]) candidatos.push(mEncExt[1]);

  const htmlFontes = [rawDesc, rawContent, srcBloco];
  for (const fonteHtml of htmlFontes) {
    if (!fonteHtml) continue;
    const decodificado = decodificarEntidades(String(fonteHtml));
    const mImg = decodificado.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
    if (mImg && mImg[1]) {
      candidatos.push(mImg[1]);
      break;
    }
  }

  for (const bruta of candidatos) {
    let url = decodificarEntidades(String(bruta || '')).trim();
    if (!url || /^data:|^javascript:/i.test(url)) continue;
    if (/feedburner|doubleclick|1x1|pixel/i.test(url)) continue;
    if (url.startsWith('//')) {
      url = 'https:' + url;
    } else if (/^http:\/\//i.test(url)) {
      url = url.replace(/^http:\/\//i, 'https://');
    }
    if (/^https:\/\//i.test(url)) {
      return url;
    }
  }

  return null;
}

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
      pais: feedDefault.pais || 'Global',
      codigoPais: feedDefault.codigoPais || 'BR',
      continente: feedDefault.continente || 'europa',
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
      explicitCountry: true
    };
  }

  return {
    pais: feedDefault.pais || 'Global',
    codigoPais: feedDefault.codigoPais || 'BR',
    continente: feedDefault.continente || 'europa',
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

function parseRssItems(xml, maxItems = 15) {
  if (!xml) return [];
  const results = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && results.length < maxItems) {
    const itemXml = match[1];
    const titleMatch = itemXml.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i);
    const descMatch = itemXml.match(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i);
    const contentMatch = itemXml.match(/<content:encoded(?:\s[^>]*)?>([\s\S]*?)<\/content:encoded>/i);

    const title = cleanHtml(titleMatch ? titleMatch[1] : '');
    const link = cleanHtml(linkMatch ? linkMatch[1] : '');
    const rawDesc = descMatch ? descMatch[1] : '';
    const rawContent = contentMatch ? contentMatch[1] : '';
    const desc = limparResumoEditorial(rawDesc, 195);
    const imagemUrl = extrairImagemRssItem(itemXml, rawDesc, rawContent);

    if (!title || !link) continue;
    results.push({ titulo: title, url: link, resumo: desc, imagemUrl });
  }
  return results;
}

function normalizarItemResumo(item, index = 0) {
  const relevancia = Number(item.relevancia) || index + 1;
  const corEditoria = item.corEditoria || CORES_POR_RELEVANCIA[relevancia] || '#388bfd';
  const fonte = item.fonte || 'Redação';
  const fontesAgrupadas =
    Array.isArray(item.fontesAgrupadas) && item.fontesAgrupadas.length > 0
      ? item.fontesAgrupadas
      : [fonte];
  const resumo = limparResumoEditorial(item.resumo || item.resumoCurto || '', 195);
  const pais = item.pais || 'Global';
  const codigoPais = item.codigoPais || 'BR';
  const continente = item.continente || 'europa';
  const tipoNoticia = item.tipoNoticia || 'politica';
  const termoBusca =
    item.termoBusca ||
    extrairTituloBase(item.titulo || '').slice(0, 60).trim() ||
    String(item.titulo || '').slice(0, 50).trim();
  const bandeiraEmoji =
    item.bandeiraEmoji || codigoPaisParaBandeiraEmoji(codigoPais, pais, relevancia, pais !== 'Global');
  const urlCompararSite =
    item.urlCompararSite ||
    construirUrlCompararSite({
      relevancia,
      codigoPais,
      continente,
      tipoNoticia,
      termoBusca,
    });

  return {
    ...item,
    relevancia,
    corEditoria,
    fonte,
    fontesAgrupadas,
    resumo,
    pais,
    codigoPais,
    continente,
    tipoNoticia,
    termoBusca,
    bandeiraEmoji,
    imagemUrl: item.imagemUrl || null,
    urlCompararSite,
  };
}

async function coletarResumoDoDiaLocal() {
  const feedsComCandidatos = await Promise.all(
    RSS_FEEDS.map(async (f) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(f.url, {
          cache: 'no-store',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RodandoOMundoBot/2.12; +https://www.rodandoomundo.com.br)',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache'
          },
          signal: ctrl.signal
        });
        clearTimeout(t);
        if (!res.ok) return { feed: f, candidatos: [] };
        const xml = await res.text();
        return { feed: f, candidatos: parseRssItems(xml, 15) };
      } catch {
        return { feed: f, candidatos: [] };
      }
    })
  );

  feedsComCandidatos.sort((a, b) => a.feed.relevancia - b.feed.relevancia);

  const selecionados = [];
  for (const { feed: f, candidatos } of feedsComCandidatos) {
    if (!candidatos.length) continue;

    let escolhido = null;

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

    if (!escolhido) {
      for (const cand of candidatos) {
        const colidiu = verificarEAgruparDuplicata(cand, f.fonte, selecionados);
        if (!colidiu) {
          escolhido = cand;
          break;
        }
      }
    }

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

    if (!escolhido) continue;

    const paisInferido = inferirPaisDaManchete(escolhido.titulo, escolhido.resumo, f);
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
      fonte: f.fonte,
      fontesAgrupadas: [f.fonte],
      pais: paisInferido.pais,
      codigoPais: paisInferido.codigoPais,
      bandeiraEmoji,
      continente: paisInferido.continente,
      tipoNoticia: f.tipoNoticia,
      termoBusca,
      titulo: escolhido.titulo,
      url: escolhido.url,
      resumo: limparResumoEditorial(escolhido.resumo, 195),
      imagemUrl: escolhido.imagemUrl || null,
      urlCompararSite: construirUrlCompararSite({
        relevancia: f.relevancia,
        codigoPais: paisInferido.codigoPais,
        continente: paisInferido.continente,
        tipoNoticia: f.tipoNoticia,
        termoBusca,
      }),
    };

    selecionados.push(itemObj);
  }

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

  return selecionados;
}

async function coletarNoticias() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const apiUrl = `https://www.rodandoomundo.com.br/api/resumo?_t=${Date.now()}&refresh=1`;
    const res = await fetch(apiUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'User-Agent': 'Mozilla/5.0 (compatible; RodandoOMundoWorker/2.1; +https://www.rodandoomundo.com.br)'
      },
      signal: ctrl.signal
    });
    clearTimeout(t);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.items) && data.items.length >= 3 && !data.fallback) {
        return data.items.map((item, idx) => normalizarItemResumo(item, idx));
      }
    }
  } catch (err) {
    console.warn('Fallback para coletor RSS local no Worker:', err.message);
  }

  return coletarResumoDoDiaLocal();
}

const coletarResumoDoDia = coletarNoticias;

const ROTAS_PUBLICAS_VALIDAS_WORKER = new Set([
  '/',
  '/resumo-do-dia',
  '/parcerias',
  '/radar',
  '/dossies',
  '/sobre',
  '/clube',
  '/entenda',
  '/ultimas-noticias',
  '/comparar',
  '/economia',
  '/geopolitica',
  '/tecnologia',
  '/clima',
  '/cultura',
  '/saude',
  '/eleicoes'
]);

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getHojeYmdBrasiliaWorker(now = new Date()) {
  const dt = now instanceof Date ? now : new Date(now);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(dt);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function isCotaEmVigenciaWorker(cota, hojeYmd = getHojeYmdBrasiliaWorker()) {
  if (!cota || cota.ativo !== true) return false;
  const temNome = typeof cota.nome === 'string' && cota.nome.trim().length > 0;
  const temLogo = typeof cota.logo_url === 'string' && cota.logo_url.trim().length > 0;
  const temNomeImg = typeof cota.nome_imagem_url === 'string' && cota.nome_imagem_url.trim().length > 0;
  if (!temNome && !temLogo && !temNomeImg) return false;

  const dataInicio = typeof cota.data_inicio === 'string' ? cota.data_inicio.trim() : '';
  const dataFim = typeof cota.data_fim === 'string' ? cota.data_fim.trim() : '';
  if (dataInicio && hojeYmd < dataInicio) return false;
  if (dataFim && hojeYmd > dataFim) return false;

  return true;
}

function filtrarCotasAtivasWorker(cotaRaw, hojeYmd = getHojeYmdBrasiliaWorker()) {
  if (!cotaRaw) return [];
  const lista = Array.isArray(cotaRaw) ? cotaRaw : [cotaRaw];
  return lista.filter((item) => isCotaEmVigenciaWorker(item, hojeYmd));
}

function resolverUrlImagemPatrocinadorWorker(
  rawImgUrl,
  { cota = 'resumo_dia', id = '', media = 'logo', idx = 0, updatedAt = '' } = {}
) {
  if (!rawImgUrl || typeof rawImgUrl !== 'string') return null;
  const trimmed = rawImgUrl.trim();
  if (!trimmed) return null;

  if (/^https:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^http:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith('/')) {
    return `https://www.rodandoomundo.com.br${trimmed}`;
  }
  if (/^data:image\//i.test(trimmed)) {
    const resolvedId = id !== undefined && id !== null && String(id).trim() !== ''
      ? String(id).trim()
      : String(idx);
    const vParam = updatedAt ? `&v=${encodeURIComponent(String(updatedAt).slice(0, 19))}` : '';
    return `https://www.rodandoomundo.com.br/api/patrocinadores?media=${encodeURIComponent(media)}&cota=${encodeURIComponent(cota)}&id=${encodeURIComponent(resolvedId)}${vParam}`;
  }

  return null;
}

function resolverUrlCtaWorker(linkUrl) {
  if (!linkUrl || typeof linkUrl !== 'string') return null;
  const trimmed = linkUrl.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname) {
        return trimmed;
      }
    } catch {
      return null;
    }
    return null;
  }

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    try {
      const parsed = new URL(trimmed, 'https://www.rodandoomundo.com.br');
      if (parsed.origin !== 'https://www.rodandoomundo.com.br') return null;
      const pathname = parsed.pathname.length > 1
        ? parsed.pathname.replace(/\/+$/, '')
        : parsed.pathname;
      if (ROTAS_PUBLICAS_VALIDAS_WORKER.has(pathname)) {
        return `https://www.rodandoomundo.com.br${trimmed}`;
      }
    } catch {
      return null;
    }
    return null;
  }

  return null;
}

function montarBlocoPatrocinadoresNewsletter(listaAtivos, { updatedAt = '' } = {}) {
  if (!Array.isArray(listaAtivos) || listaAtivos.length === 0) return '';

  return listaAtivos
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return '';
      const nomeTexto = typeof item.nome === 'string' ? item.nome.trim() : '';
      const fraseTexto = typeof item.frase === 'string' ? item.frase.trim() : '';
      const logoUrl = resolverUrlImagemPatrocinadorWorker(item.logo_url, {
        cota: 'resumo_dia',
        id: item.id || '',
        media: 'logo',
        idx,
        updatedAt
      });
      const nomeImgUrl = resolverUrlImagemPatrocinadorWorker(item.nome_imagem_url, {
        cota: 'resumo_dia',
        id: item.id || '',
        media: 'nome_imagem',
        idx,
        updatedAt
      });
      const ctaUrl = resolverUrlCtaWorker(item.link_url);
      const ctaTexto =
        (typeof item.cta_texto === 'string' && item.cta_texto.trim()) || 'Saiba mais';

      const logoCellHtml = logoUrl
        ? `<td width="46" valign="middle" style="padding-right:10px;">
            <img src="${escapeHtml(logoUrl)}" width="36" height="36" alt="${escapeHtml(nomeTexto || 'Patrocinador')}" style="width:36px;height:36px;border-radius:6px;object-fit:contain;display:block;border:1px solid #30363d;background:#0d1117;" />
          </td>`
        : '';

      let marcaHtml = '';
      if (nomeImgUrl) {
        marcaHtml = `<img src="${escapeHtml(nomeImgUrl)}" alt="${escapeHtml(nomeTexto || 'Patrocinador')}" style="max-height:24px;width:auto;display:block;border:0;" />`;
      } else if (nomeTexto) {
        marcaHtml = `<strong style="color:#f0f6fc;font-size:15px;font-weight:700;line-height:1.3;">${escapeHtml(nomeTexto)}</strong>`;
      }

      const fraseHtml = fraseTexto
        ? `<tr>
            <td style="padding-top:8px;">
              <p style="margin:0;color:#c9d1d9;font-size:13px;line-height:1.45;">${escapeHtml(fraseTexto)}</p>
            </td>
          </tr>`
        : '';

      const ctaCellHtml = ctaUrl !== null
        ? `<td valign="middle" align="right" style="padding-left:12px;white-space:nowrap;">
            <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:rgba(210,153,34,0.16);border:1px solid rgba(210,153,34,0.5);color:#d29922;text-decoration:none;font-size:12px;font-weight:700;padding:6px 14px;border-radius:6px;white-space:nowrap;">${escapeHtml(ctaTexto)}</a>
          </td>`
        : '';

      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;background:#161b22;border:1px solid rgba(210,153,34,0.45);border-left:3px solid #d29922;border-radius:10px;padding:14px 18px;margin-bottom:18px;">
  <tr>
    <td style="padding-bottom:8px;">
      <span style="color:#d29922;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">OFERECIMENTO</span>
    </td>
  </tr>
  <tr>
    <td>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          ${logoCellHtml}
          <td valign="middle" align="left">
            ${marcaHtml}
          </td>
          ${ctaCellHtml}
        </tr>
      </table>
    </td>
  </tr>
  ${fraseHtml}
</table>`;
    })
    .filter(Boolean)
    .join('\n');
}

async function coletarPatrocinadoresResumo(env = {}) {
  const endpoints = [
    `https://www.rodandoomundo.com.br/api/patrocinadores?_t=${Date.now()}`,
    `https://www.rodandoomundo.com.br/v2/patrocinadores?_t=${Date.now()}`,
    `https://www.rodandoomundo.com.br/data/patrocinadores.json?_t=${Date.now()}`
  ];

  for (const url of endpoints) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4500);
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'User-Agent': 'Mozilla/5.0 (compatible; RodandoOMundoWorker/2.1; +https://www.rodandoomundo.com.br)'
        },
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!res || !res.ok) continue;
      const data = await res.json();
      if (data && data.cotas && !data.fallback) {
        return {
          ativos: filtrarCotasAtivasWorker(data.cotas.resumo_dia),
          updatedAt: String(data.atualizado_em || '')
        };
      }
    } catch {
      // Tenta próximo endpoint na sequência
    }
  }

  return { ativos: [], updatedAt: '' };
}

function montarHtmlNewsletter(noticias, dataHoje, patrocinadoresInfo = { ativos: [], updatedAt: '' }) {
  const listaPatrocinadores = Array.isArray(patrocinadoresInfo)
    ? patrocinadoresInfo
    : (Array.isArray(patrocinadoresInfo?.ativos) ? patrocinadoresInfo.ativos : []);
  const updatedAtPat = !Array.isArray(patrocinadoresInfo) && patrocinadoresInfo?.updatedAt
    ? String(patrocinadoresInfo.updatedAt)
    : '';
  const blocoPatrocinadoresHtml = montarBlocoPatrocinadoresNewsletter(listaPatrocinadores, {
    updatedAt: updatedAtPat
  });
  const cardsHtml = noticias
    .map((rawItem, idx) => {
      const n = normalizarItemResumo(rawItem, idx);
      const cor = n.corEditoria || '#388bfd';
      const listaFontes =
        Array.isArray(n.fontesAgrupadas) && n.fontesAgrupadas.length > 0
          ? n.fontesAgrupadas
          : [n.fonte].filter(Boolean);
      const labelFontes =
        listaFontes.length > 1
          ? `Fontes: ${listaFontes.join(' + ')}`
          : `Fonte: ${listaFontes[0] || n.fonte || 'Redação'}`;
      const thumbCellHtml = n.imagemUrl
        ? `<td width="64" valign="top" align="right" style="padding-left:14px;">
            <img src="${n.imagemUrl}" width="64" height="64" alt="" style="width:64px;height:64px;border-radius:8px;object-fit:cover;display:block;border:1px solid #30363d;" />
          </td>`
        : '';

      return `
    <div style="background:#161b22;border:1px solid #30363d;border-left:3px solid ${cor};border-radius:10px;padding:16px 18px;margin-bottom:14px;">
      <!-- Linha 1: Topo em 1 linha (Badge + Categoria à esquerda, Bandeira + País à direita) -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:10px;">
        <tr>
          <td valign="middle" align="left">
            <span style="display:inline-block;background:${cor};color:#ffffff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;margin-right:8px;vertical-align:middle;">#${n.relevancia}</span>
            <span style="color:${cor};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;vertical-align:middle;">${n.categoria}</span>
          </td>
          <td valign="middle" align="right" style="white-space:nowrap;padding-left:8px;">
            <span style="display:inline-block;background:#0d1117;border:1px solid #30363d;color:#c9d1d9;font-size:11px;font-weight:600;padding:2px 9px;border-radius:12px;white-space:nowrap;">${n.bandeiraEmoji || '🌍'} ${n.pais || 'Global'}</span>
          </td>
        </tr>
      </table>

      <!-- Linha 2: Corpo (Título + Resumo à esquerda, Mini-Thumbnail 64x64 à direita) -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:12px;">
        <tr>
          <td valign="top" align="left">
            <h3 style="margin:0 0 6px 0;font-size:16px;line-height:1.38;font-weight:600;">
              <a href="${n.url}" style="color:#f0f6fc;text-decoration:none;font-weight:600;" target="_blank" rel="noopener noreferrer">${n.titulo}</a>
            </h3>
            <p style="margin:0;color:#8b949e;font-size:13px;line-height:1.5;">${n.resumo}</p>
          </td>
          ${thumbCellHtml}
        </tr>
      </table>

      <!-- Linha 3: Rodapé (Pílula de Fontes + Ações com white-space:nowrap) -->
      <div style="border-top:1px solid #21262d;padding-top:10px;font-size:12px;">
        <div style="margin-bottom:8px;">
          <span style="display:inline-block;background:#0d1117;border:1px solid #30363d;color:#8b949e;font-size:11px;font-weight:500;padding:2px 9px;border-radius:10px;">${labelFontes}</span>
        </div>
        <div>
          <a href="${n.urlCompararSite}" style="display:inline-block;background:rgba(56,139,253,0.14);border:1px solid rgba(56,139,253,0.4);color:#58a6ff;text-decoration:none;font-size:12px;font-weight:600;padding:5px 11px;border-radius:6px;white-space:nowrap;margin-right:12px;" target="_blank" rel="noopener noreferrer">⚖️ Comparar perspectivas</a>
          <a href="${n.url}" style="display:inline-block;color:#8b949e;text-decoration:none;font-size:12px;font-weight:500;white-space:nowrap;" target="_blank" rel="noopener noreferrer">Ler original &#8599;</a>
        </div>
      </div>
    </div>`;
    })
    .join('');

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Resumo do Dia — Rodando o Mundo</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#c9d1d9;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="text-align:center;padding:24px 0 20px 0;border-bottom:1px solid #21262d;margin-bottom:24px;">
      <h1 style="color:#58a6ff;font-size:24px;margin:0 0 6px 0;letter-spacing:0.5px;">Rodando o Mundo</h1>
      <p style="color:#f0f6fc;font-size:15px;margin:0 0 4px 0;font-weight:600;">Resumo do Dia &bull; Edição de ${dataHoje}</p>
      <p style="color:#8b949e;font-size:13px;margin:0;">As 5 principais notícias apuradas por relevância editorial com contexto global.</p>
    </div>

    ${blocoPatrocinadoresHtml}

    <div>
      ${cardsHtml}
    </div>

    <div style="text-align:center;margin:32px 0;">
      <a href="https://www.rodandoomundo.com.br/resumo-do-dia" style="background:#238636;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;display:inline-block;">Acessar o Painel Interativo Completo</a>
    </div>

    <div style="border-top:1px solid #21262d;padding-top:20px;text-align:center;font-size:12px;color:#8b949e;line-height:1.6;">
      <p style="margin:0 0 6px 0;">Você recebeu esta mensagem porque se inscreveu no Resumo do Dia em <strong>Rodando o Mundo</strong>.</p>
      <p style="margin:0;"><a href="https://www.rodandoomundo.com.br" style="color:#58a6ff;text-decoration:none;">www.rodandoomundo.com.br</a></p>
    </div>
  </div>
</body>
</html>`;
}

function getResendKey(env = {}) {
  if (env.RESEND_API_KEY) return env.RESEND_API_KEY;
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('re_')) return k;
    if (typeof v === 'string' && v.startsWith('re_')) return v;
  }
  return null;
}

async function executarEnvioResumo(env, testEmail = null) {
  const apiKey = getResendKey(env);
  if (!apiKey) {
    console.error('RESEND_API_KEY não configurada no ambiente do Cloudflare Worker.');
    return { ok: false, error: 'RESEND_API_KEY não configurada.' };
  }

  const fromEmail = env.RESEND_FROM_EMAIL || 'Rodando o Mundo <onboarding@resend.dev>';
  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const [noticias, patrocinadoresInfo] = await Promise.all([
    coletarResumoDoDia(),
    coletarPatrocinadoresResumo(env)
  ]);
  if (!noticias || noticias.length === 0) {
    console.error('Nenhuma notícia pôde ser coletada hoje para o envio.');
    return { ok: false, error: 'Nenhuma notícia coletada.' };
  }

  const emailHtml = montarHtmlNewsletter(noticias, dataHoje, patrocinadoresInfo);
  const emailSubject = `Resumo do Dia — 5 destaques globais (${dataHoje})`;
  const patrocinadoresAtivos = (patrocinadoresInfo?.ativos || []).map((p) => p.nome || p.id);

  if (testEmail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [testEmail],
        subject: `[TESTE] ${emailSubject}`,
        html: emailHtml
      })
    });
    const result = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      modo: 'teste',
      destinatario: testEmail,
      patrocinadoresAtivos,
      resendResponse: result
    };
  }

  let destinatarios = [];
  try {
    const audienceId = env.RESEND_AUDIENCE_ID;
    const contactsEndpoint = audienceId
      ? `https://api.resend.com/audiences/${audienceId}/contacts`
      : 'https://api.resend.com/contacts';

    const resp = await fetch(contactsEndpoint, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      const list = data.data || [];
      destinatarios = list.filter((c) => !c.unsubscribed).map((c) => c.email);
    }
  } catch (errContacts) {
    console.warn('Erro ao buscar contatos do Resend:', errContacts.message);
  }

  if (destinatarios.length === 0) {
    return {
      ok: true,
      patrocinadoresAtivos,
      message: 'Nenhum inscrito ativo na lista do Resend para envio hoje.'
    };
  }

  const envios = await Promise.allSettled(
    destinatarios.map(async (dest) => {
      return fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [dest],
          subject: emailSubject,
          html: emailHtml
        })
      });
    })
  );

  const enviados = envios.filter((e) => e.status === 'fulfilled').length;

  return {
    ok: true,
    totalInscritos: destinatarios.length,
    enviados: enviados,
    data: dataHoje,
    patrocinadoresAtivos
  };
}

export {
  montarHtmlNewsletter,
  filtrarCotasAtivasWorker,
  coletarPatrocinadoresResumo,
  resolverUrlImagemPatrocinadorWorker,
  resolverUrlCtaWorker
};

export default {
  // Handler executado automaticamente pelo Cron Trigger da Cloudflare
  async scheduled(event, env, ctx) {
    ctx.waitUntil(executarEnvioResumo(env));
  },

  // Handler HTTP para testes manuais no browser ou via curl
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const testEmail = url.searchParams.get('teste') || url.searchParams.get('email');
    const resultado = await executarEnvioResumo(env, testEmail);

    return new Response(JSON.stringify(resultado, null, 2), {
      status: resultado.ok ? 200 : 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
