// Cloudflare Worker: Pulso Continental Contínuo (ATLAS-VIVO Parte 2)
// Disparo via Cron Trigger (*/10 * * * *) ou sob demanda HTTP GET

const FEEDS_CONTINENTAIS = {
  america_sul: [
    { url: 'https://g1.globo.com/rss/g1/mundo/', fonte: 'g1 Mundo', pais: 'BR' },
    { url: 'https://feeds.bbci.co.uk/portuguese/rss.xml', fonte: 'BBC News Brasil', pais: 'BR' },
    { url: 'https://www.clarin.com/rss/lo-ultimo/', fonte: 'Clarín', pais: 'AR' },
    { url: 'https://www.emol.com/rss/todas.xml', fonte: 'El Mercurio', pais: 'CL' }
  ],
  america_norte: [
    { url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', fonte: 'BBC US & Canada', pais: 'US' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', fonte: 'The New York Times', pais: 'US' },
    { url: 'https://www.eluniversal.com.mx/rss.xml', fonte: 'El Universal', pais: 'MX' },
    { url: 'https://www.cbc.ca/cmlink/rss-world', fonte: 'CBC News', pais: 'CA' }
  ],
  europa: [
    { url: 'https://rss.dw.com/rdf/rss-br-all', fonte: 'Deutsche Welle Brasil', pais: 'DE' },
    { url: 'https://pt.euronews.com/rss?format=mrss&level=theme&name=news', fonte: 'Euronews PT', pais: 'FR' },
    { url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml', fonte: 'BBC Europe', pais: 'GB' },
    { url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', fonte: 'El País', pais: 'ES' },
    { url: 'https://feeds.feedburner.com/PublicoRSS', fonte: 'Público', pais: 'PT' }
  ],
  asia: [
    { url: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml', fonte: 'BBC Asia', pais: 'JP' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', fonte: 'Al Jazeera', pais: 'QA' },
    { url: 'https://www3.nhk.or.jp/nhkworld/en/news/stories.rss', fonte: 'NHK World News', pais: 'JP' },
    { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', fonte: 'Times of India', pais: 'IN' }
  ],
  africa: [
    { url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml', fonte: 'BBC Africa', pais: 'ZA' },
    { url: 'https://www.news24.com/news24/contenttypes/rss', fonte: 'News24 Africa', pais: 'ZA' },
    { url: 'https://www.dailymaverick.co.za/feed/', fonte: 'Daily Maverick', pais: 'ZA' }
  ],
  oceania: [
    { url: 'https://www.abc.net.au/news/feed/45910/rss.xml', fonte: 'ABC News Australia', pais: 'AU' },
    { url: 'https://www.rnz.co.nz/rss/national.xml', fonte: 'RNZ News', pais: 'NZ' }
  ]
};

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

function parseXmlRss(xmlText, feedInfo) {
  const items = [];
  const itemRegex = /<item\b[^>]*>(.*?)<\/item>/gis;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemBlock = match[1];
    const titleMatch = itemBlock.match(/<title\b[^>]*>(.*?)<\/title>/is);
    const linkMatch = itemBlock.match(/<link\b[^>]*>(.*?)<\/link>/is) || itemBlock.match(/<guid\b[^>]*>(https?:\/\/[^<]+)<\/guid>/is);
    const pubDateMatch = itemBlock.match(/<pubDate\b[^>]*>(.*?)<\/pubDate>/is);

    if (titleMatch && linkMatch) {
      const rawTitle = cleanHtml(titleMatch[1]);
      const rawLink = cleanHtml(linkMatch[1]);
      const rawPub = pubDateMatch ? cleanHtml(pubDateMatch[1]) : new Date().toISOString();

      if (rawTitle && rawLink && rawLink.startsWith('http')) {
        let isoDate;
        try {
          const d = new Date(rawPub);
          isoDate = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        } catch {
          isoDate = new Date().toISOString();
        }

        items.push({
          title: rawTitle,
          url: rawLink,
          source: feedInfo.fonte,
          countryCode: feedInfo.pais,
          publishedAt: isoDate
        });
      }
    }
    if (items.length >= 8) break;
  }
  return items;
}

export async function coletarPulsoContinentes(env = {}) {
  const resultados = {};
  const activeCountriesSet = new Set();
  const ctrlTimeout = 8000;

  for (const [continente, feeds] of Object.entries(FEEDS_CONTINENTAIS)) {
    const continentHeadlines = [];

    const promessas = feeds.map(async (feed) => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), ctrlTimeout);
      try {
        const resp = await fetch(feed.url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RodandoOMundoAtlas/2.1)' }
        });
        clearTimeout(tid);
        if (!resp.ok) return [];
        const xml = await resp.text();
        return parseXmlRss(xml, feed);
      } catch {
        clearTimeout(tid);
        return [];
      }
    });

    const parsedBatches = await Promise.allSettled(promessas);
    for (const batch of parsedBatches) {
      if (batch.status === 'fulfilled' && Array.isArray(batch.value)) {
        for (const item of batch.value) {
          continentHeadlines.push(item);
          if (item.countryCode) activeCountriesSet.add(item.countryCode);
        }
      }
    }

    // Ordena por data decrescente e limita a 20 notícias principais por continente
    continentHeadlines.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    resultados[continente] = {
      updatedAt: new Date().toISOString(),
      headlines: continentHeadlines.slice(0, 20),
      total: continentHeadlines.length
    };
  }

  const payloadSincronizacao = {
    updatedAt: new Date().toISOString(),
    activeCountries: Array.from(activeCountriesSet),
    continentes: resultados
  };

  // Se houver CURADORIA_BACKEND_URL configurada, despacha para persistência no PostgreSQL
  const backendUrl = env.CURADORIA_BACKEND_URL || env.BACKEND_URL;
  if (backendUrl && /^https?:\/\//i.test(backendUrl)) {
    const alvo = new URL('/v1/atlas/atualizar-pulso-continental', backendUrl.endsWith('/') ? backendUrl : backendUrl + '/');
    try {
      await fetch(alvo.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.CURADORIA_SECRET_TOKEN || ''}`
        },
        body: JSON.stringify(payloadSincronizacao)
      });
    } catch (err) {
      // Falha silenciosa no envio remoto para não interromper a borda
    }
  }

  return payloadSincronizacao;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(coletarPulsoContinentes(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const dados = await coletarPulsoContinentes(env);
    return new Response(JSON.stringify({ ok: true, dados }, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
