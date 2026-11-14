// Netlify Function: /api/resumo
// Atualização automática diária do Resumo do Dia para o Rodando o Mundo
// Agrega e seleciona as 5 principais manchetes por relevância editorial com cache diário e suporte a refresh em tempo real (_t / refresh=1)

const RSS_FEEDS = [
  {
    relevancia: 1,
    categoria: 'Geopolítica & Global',
    url: 'https://feeds.bbci.co.uk/portuguese/rss.xml',
    fonte: 'BBC News Brasil',
    dominio: 'bbc.com',
    pais: 'Estados Unidos',
    codigoPais: 'US',
    continente: 'norte',
    tipoNoticia: 'politica',
    paginaTematica: '/politica/estados-unidos',
    labelTematica: 'Política & Diplomacia Global',
    explicacaoId: 'como-funcionam-as-eleicoes-nos-eua'
  },
  {
    relevancia: 2,
    categoria: 'Brasil · Política & Congresso',
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
    url: 'https://g1.globo.com/rss/g1/mundo/',
    fonte: 'g1 Mundo',
    dominio: 'g1.globo.com',
    pais: 'Ucrânia',
    codigoPais: 'UA',
    continente: 'europa',
    tipoNoticia: 'mundo',
    paginaTematica: '/radar',
    labelTematica: 'Geopolítica & Segurança Internacional',
    explicacaoId: 'o-que-e-sancao-internacional'
  },
  {
    relevancia: 5,
    categoria: 'Clima & Tecnologia',
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
      paginaTematica: feedDefault.paginaTematica
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
      paginaTematica: melhor.paginaTematica || feedDefault.paginaTematica
    };
  }

  return {
    pais: feedDefault.pais,
    codigoPais: feedDefault.codigoPais,
    continente: feedDefault.continente,
    paginaTematica: feedDefault.paginaTematica
  };
}

function cleanHtml(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFirstRssItem(xml) {
  if (!xml) return null;
  const itemMatch = xml.match(/<item[\s>](.*?)<\/item>/s);
  if (!itemMatch) return null;
  const itemXml = itemMatch[1];

  const titleMatch = itemXml.match(/<title[\s>](.*?)<\/title>/s);
  const linkMatch = itemXml.match(/<link[\s>](.*?)<\/link>/s);
  const descMatch = itemXml.match(/<description[\s>](.*?)<\/description>/s);
  const dateMatch = itemXml.match(/<pubDate[\s>](.*?)<\/pubDate>/s);

  const title = cleanHtml(titleMatch ? titleMatch[1] : '');
  let link = cleanHtml(linkMatch ? linkMatch[1] : '');
  let desc = cleanHtml(descMatch ? descMatch[1] : '');

  // Trunca resumo com elegância
  if (desc.length > 220) {
    desc = desc.slice(0, 215).replace(/[,.;:\s]+$/, '') + '…';
  }

  return {
    titulo: title,
    url: link,
    resumo: desc,
    data: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
  };
}

let memoryCache = {
  date: '',
  timestamp: 0,
  data: null
};

exports.handler = async function (event, context) {
  const now = new Date();
  const hojeStr = now.toISOString().slice(0, 10);

  const qs = (event && event.queryStringParameters) || {};
  const rawUrl = (event && event.rawUrl) || '';
  const isRefresh =
    Boolean(qs._t) ||
    String(qs.refresh || '') === '1' ||
    /[?&](_t=|refresh=1)/.test(rawUrl);

  const cacheControlHeader = isRefresh
    ? 'no-store, no-cache, must-revalidate'
    : 'public, max-age=1800, s-maxage=43200, stale-while-revalidate=86400';

  // Cache em memória na mesma instância por até 2 horas ou se for o mesmo dia (ignorado quando isRefresh)
  if (!isRefresh && memoryCache.data && memoryCache.date === hojeStr && (Date.now() - memoryCache.timestamp < 7200000)) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': cacheControlHeader,
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(memoryCache.data)
    };
  }

  const items = await Promise.all(
    RSS_FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RodandoOMundoBot/2.12; +https://www.rodandoomundo.com.br)',
            ...(isRefresh ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : {})
          },
          signal: AbortSignal.timeout(4500)
        });
        if (!res.ok) throw new Error('Status ' + res.status);
        const xml = await res.text();
        const parsed = parseFirstRssItem(xml);
        if (!parsed || !parsed.titulo || !parsed.url) {
          throw new Error('Item inválido');
        }

        const paisInferido = inferirPaisDaManchete(parsed.titulo, parsed.resumo, f);

        return {
          relevancia: f.relevancia,
          categoria: f.categoria,
          titulo: parsed.titulo,
          resumo: parsed.resumo || 'Acompanhe a cobertura deste tema na matéria original.',
          resumoCurto: parsed.resumo || 'Acompanhe a cobertura deste tema na matéria original.',
          fonte: f.fonte,
          dominio: f.dominio,
          termoBusca: parsed.titulo.slice(0, 50),
          url: parsed.url,
          urlMateriaOriginal: parsed.url,
          paginaTematica: paisInferido.paginaTematica,
          labelTematica: f.labelTematica,
          explicacaoId: f.explicacaoId,
          pais: paisInferido.pais,
          codigoPais: paisInferido.codigoPais,
          continente: paisInferido.continente,
          tipoNoticia: f.tipoNoticia,
          publicadoEm: parsed.data
        };
      } catch (err) {
        // Fallback em caso de falha individual do feed
        return {
          relevancia: f.relevancia,
          categoria: f.categoria,
          titulo: `Principais desdobramentos em ${f.categoria}`,
          resumo: 'Acompanhe os acontecimentos e a cobertura comparada do dia.',
          resumoCurto: 'Acompanhe os acontecimentos e a cobertura comparada do dia.',
          fonte: f.fonte,
          dominio: f.dominio,
          termoBusca: f.categoria,
          url: `https://${f.dominio}`,
          urlMateriaOriginal: `https://${f.dominio}`,
          paginaTematica: f.paginaTematica,
          labelTematica: f.labelTematica,
          explicacaoId: f.explicacaoId,
          pais: f.pais,
          codigoPais: f.codigoPais,
          continente: f.continente,
          tipoNoticia: f.tipoNoticia,
          publicadoEm: now.toISOString()
        };
      }
    })
  );

  const payload = {
    dataEdicao: hojeStr,
    atualizadoEm: now.toISOString(),
    items: items
  };

  memoryCache = {
    date: hojeStr,
    timestamp: Date.now(),
    data: payload
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControlHeader,
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(payload)
  };
};
