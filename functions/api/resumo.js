// Cloudflare Pages Function: /api/resumo
// Atualização automática diária do Resumo do Dia para o Rodando o Mundo
// Agrega e seleciona as 5 principais manchetes por relevância editorial com cache diário (24h)

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
    paginaTematica: '/guerra-ucrania',
    labelTematica: 'Guerra na Ucrânia & Geopolítica',
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

export async function onRequestGet(context) {
  const now = new Date();
  const hojeStr = now.toISOString().slice(0, 10);

  if (memoryCache.data && memoryCache.date === hojeStr && (Date.now() - memoryCache.timestamp < 7200000)) {
    return new Response(JSON.stringify(memoryCache.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=1800, s-maxage=43200, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const items = await Promise.all(
    RSS_FEEDS.map(async (f) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4500);
        const res = await fetch(f.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RodandoOMundoBot/2.12; +https://www.rodandoomundo.com.br)'
          },
          signal: ctrl.signal
        });
        clearTimeout(t);
        if (!res.ok) throw new Error('Status ' + res.status);
        const xml = await res.text();
        const parsed = parseFirstRssItem(xml);
        if (!parsed || !parsed.titulo || !parsed.url) {
          throw new Error('Item inválido');
        }

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
          paginaTematica: f.paginaTematica,
          labelTematica: f.labelTematica,
          explicacaoId: f.explicacaoId,
          pais: f.pais,
          codigoPais: f.codigoPais,
          continente: f.continente,
          tipoNoticia: f.tipoNoticia,
          publicadoEm: parsed.data
        };
      } catch (err) {
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

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=1800, s-maxage=43200, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*'
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
