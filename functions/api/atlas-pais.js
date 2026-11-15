// GET /api/atlas-pais
// API On-Demand por País com Busca Multi-Motor e Tradução em Lote (ATLAS-VIVO Parte 3)
// Contrato: .agents/contracts/ATLAS-VIVO.md
import { json } from '../lib/ia.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
};

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos em memória / cache
const CACHE_LOCAL = new Map();

function cleanHtml(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
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

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return 'h_' + Math.abs(h).toString(36);
}

// Tradução ultrarrápida via clients5 (Google Dict / Chrome Ex API)
async function traduzirTexto(texto, targetLang = 'pt') {
  const clean = String(texto || '').trim();
  if (!clean || clean.length < 3) return clean;

  const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(targetLang)}&q=${encodeURIComponent(clean)}`;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!resp.ok) return clean;
    const data = await resp.json();
    if (Array.isArray(data)) {
      if (typeof data[0] === 'string') return data[0];
      if (Array.isArray(data[0]) && typeof data[0][0] === 'string') return data[0][0];
    }
    return clean;
  } catch {
    return clean;
  }
}

function parseRssXml(xmlText, countryCode) {
  const items = [];
  const itemRegex = /<item\b[^>]*>(.*?)<\/item>/gis;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const block = match[1];
    const titleM = block.match(/<title\b[^>]*>(.*?)<\/title>/is);
    const linkM = block.match(/<link\b[^>]*>(.*?)<\/link>/is) || block.match(/<guid\b[^>]*>(https?:\/\/[^<]+)<\/guid>/is);
    const sourceM = block.match(/<source\b[^>]*>(.*?)<\/source>/is);
    const pubM = block.match(/<pubDate\b[^>]*>(.*?)<\/pubDate>/is);

    if (titleM && linkM) {
      const rawTitle = cleanHtml(titleM[1]);
      const rawLink = cleanHtml(linkM[1]);
      const rawSource = sourceM ? cleanHtml(sourceM[1]) : '';
      const rawPub = pubM ? cleanHtml(pubM[1]) : '';

      if (rawTitle && rawLink && rawLink.startsWith('http')) {
        let isoPub;
        try {
          const d = new Date(rawPub);
          isoPub = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        } catch {
          isoPub = new Date().toISOString();
        }

        // Remove sufixo do veículo no título se presente (" - G1", " - BBC")
        let titleClean = rawTitle;
        const lastDash = titleClean.lastIndexOf(' - ');
        let detectedSource = rawSource;
        if (lastDash > 15) {
          if (!detectedSource) detectedSource = titleClean.slice(lastDash + 3).trim();
          titleClean = titleClean.slice(0, lastDash).trim();
        }

        items.push({
          id: hashString(rawLink),
          titleOriginal: titleClean,
          titlePt: titleClean,
          url: rawLink,
          source: detectedSource || 'Imprensa Internacional',
          publishedAt: isoPub,
          score: 85,
          country: countryCode,
        });
      }
    }
    if (items.length >= 15) break;
  }
  return items;
}

export async function handleAtlasPais(request, env = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const pais = String(url.searchParams.get('pais') || 'BR').toUpperCase().trim();
  const nomePais = String(url.searchParams.get('nome') || pais).trim();
  const isRefresh = url.searchParams.has('_t') || url.searchParams.get('refresh') === '1';

  const cacheKey = `atlas_${pais}`;
  const agora = Date.now();

  // Verifica cache em memória
  if (!isRefresh && CACHE_LOCAL.has(cacheKey)) {
    const entry = CACHE_LOCAL.get(cacheKey);
    if (agora - entry.timestamp < CACHE_TTL_MS) {
      return json({
        ok: true,
        cached: true,
        source: 'memory_cache',
        country: pais,
        countryName: nomePais,
        updatedAt: new Date(entry.timestamp).toISOString(),
        items: entry.items,
      }, 200, {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=180, stale-while-revalidate=60',
      });
    }
  }

  // 1. Busca Multi-Motor RSS para o país
  const rssUrl = pais === 'BR'
    ? 'https://news.google.com/rss/headlines/section/geo/Brasil?hl=pt-BR&gl=BR&ceid=BR:pt-419'
    : `https://news.google.com/rss/search?q=${encodeURIComponent(nomePais)}&hl=en&gl=${encodeURIComponent(pais)}&ceid=${encodeURIComponent(pais)}:en`;

  let items = [];
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000);
    const resp = await fetch(rssUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RodandoOMundoAtlas/2.1)' },
    });
    clearTimeout(tid);

    if (resp.ok) {
      const xml = await resp.text();
      items = parseRssXml(xml, pais);
    }
  } catch {
    items = [];
  }

  // 2. Tradução em lote para PT-BR se necessário
  const langTargets = ['pt', 'pt-BR', 'pt-PT'];
  for (let i = 0; i < Math.min(items.length, 12); i++) {
    const it = items[i];
    // Se o título aparenta ser em outro idioma (ex: caracteres não latinos ou termos estrangeiros)
    if (it.titleOriginal && !/^(o|a|os|as|um|uma|de|do|da|em|no|na|com|por)\b/i.test(it.titleOriginal)) {
      try {
        const traduzido = await traduzirTexto(it.titleOriginal, 'pt');
        if (traduzido && traduzido !== it.titleOriginal) {
          it.titlePt = traduzido;
        }
      } catch {
        // Mantém original se tradução falhar
      }
    }
  }

  // Salva no cache local
  CACHE_LOCAL.set(cacheKey, { timestamp: agora, items });

  const headers = isRefresh
    ? { ...CORS_HEADERS, 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    : { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=180, stale-while-revalidate=60' };

  return json({
    ok: true,
    cached: false,
    source: 'live_hybrid',
    country: pais,
    countryName: nomePais,
    updatedAt: new Date(agora).toISOString(),
    total: items.length,
    items,
  }, 200, headers);
}

export async function onRequestGet(context) {
  return handleAtlasPais(context.request, context.env || {});
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
