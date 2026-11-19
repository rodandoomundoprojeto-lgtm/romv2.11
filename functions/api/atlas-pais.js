// GET /api/atlas-pais
// API On-Demand por País com Busca Multi-Motor e Tradução em Lote (ATLAS-VIVO Parte 3)
// Contrato: .agents/contracts/ATLAS-VIVO.md
import { json } from '../lib/ia.js';
import {
  isRefreshRequest,
  newsResponseHeaders,
  compareIsoDesc,
  parseFeedItems,
} from '../lib/rss.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
};

const CACHE_TTL_MS = 8 * 60 * 1000; // 8 minutos em memória / cache para alta frescura
const CACHE_LOCAL = new Map();
const PT_COUNTRIES = new Set(['BR', 'PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL']);

// Edições Nativas Oficiais do Google News (Top Headlines direto de capa por país)
const GOOGLE_NEWS_EDITIONS = {
  US: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
  BR: { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' },
  GB: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
  UK: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
  FR: { hl: 'fr', gl: 'FR', ceid: 'FR:fr' },
  DE: { hl: 'de', gl: 'DE', ceid: 'DE:de' },
  IT: { hl: 'it', gl: 'IT', ceid: 'IT:it' },
  ES: { hl: 'es', gl: 'ES', ceid: 'ES:es-419' },
  PT: { hl: 'pt-PT', gl: 'PT', ceid: 'PT:pt-150' },
  AR: { hl: 'es-419', gl: 'AR', ceid: 'AR:es-419' },
  MX: { hl: 'es-419', gl: 'MX', ceid: 'MX:es-419' },
  CO: { hl: 'es-419', gl: 'CO', ceid: 'CO:es-419' },
  CL: { hl: 'es-419', gl: 'CL', ceid: 'CL:es-419' },
  PE: { hl: 'es-419', gl: 'PE', ceid: 'PE:es-419' },
  VE: { hl: 'es-419', gl: 'VE', ceid: 'VE:es-419' },
  CA: { hl: 'en-CA', gl: 'CA', ceid: 'CA:en' },
  AU: { hl: 'en-AU', gl: 'AU', ceid: 'AU:en' },
  IN: { hl: 'en-IN', gl: 'IN', ceid: 'IN:en' },
  JP: { hl: 'ja', gl: 'JP', ceid: 'JP:ja' },
  RU: { hl: 'ru', gl: 'RU', ceid: 'RU:ru' },
  ZA: { hl: 'en-ZA', gl: 'ZA', ceid: 'ZA:en' },
  NL: { hl: 'nl', gl: 'NL', ceid: 'NL:nl' },
  BE: { hl: 'fr', gl: 'BE', ceid: 'BE:fr' },
  CH: { hl: 'de-CH', gl: 'CH', ceid: 'CH:de' },
  AT: { hl: 'de-AT', gl: 'AT', ceid: 'AT:de' },
  SE: { hl: 'sv', gl: 'SE', ceid: 'SE:sv' },
  NO: { hl: 'no', gl: 'NO', ceid: 'NO:no' },
  DK: { hl: 'da', gl: 'DK', ceid: 'DK:da' },
  FI: { hl: 'fi', gl: 'FI', ceid: 'FI:fi' },
  PL: { hl: 'pl', gl: 'PL', ceid: 'PL:pl' },
  TR: { hl: 'tr', gl: 'TR', ceid: 'TR:tr' },
  GR: { hl: 'el', gl: 'GR', ceid: 'GR:el' },
  IL: { hl: 'he', gl: 'IL', ceid: 'IL:he' },
  SA: { hl: 'ar', gl: 'SA', ceid: 'SA:ar' },
  EG: { hl: 'ar', gl: 'EG', ceid: 'EG:ar' },
  AE: { hl: 'ar', gl: 'AE', ceid: 'AE:ar' },
  NG: { hl: 'en-NG', gl: 'NG', ceid: 'NG:en' },
  KE: { hl: 'en-KE', gl: 'KE', ceid: 'KE:en' },
  ID: { hl: 'id', gl: 'ID', ceid: 'ID:id' },
  TH: { hl: 'th', gl: 'TH', ceid: 'TH:th' },
  VN: { hl: 'vi', gl: 'VN', ceid: 'VN:vi' },
  PH: { hl: 'en-PH', gl: 'PH', ceid: 'PH:en' },
  KR: { hl: 'ko', gl: 'KR', ceid: 'KR:ko' },
  TW: { hl: 'zh-TW', gl: 'TW', ceid: 'TW:zh-Hant' },
  HK: { hl: 'zh-HK', gl: 'HK', ceid: 'HK:zh-Hant' },
  SG: { hl: 'en-SG', gl: 'SG', ceid: 'SG:en' },
  NZ: { hl: 'en-NZ', gl: 'NZ', ceid: 'NZ:en' },
  IE: { hl: 'en-IE', gl: 'IE', ceid: 'IE:en' },
  UY: { hl: 'es-419', gl: 'UY', ceid: 'UY:es-419' },
  CU: { hl: 'es-419', gl: 'CU', ceid: 'CU:es-419' },
  CZ: { hl: 'cs', gl: 'CZ', ceid: 'CZ:cs' },
  HU: { hl: 'hu', gl: 'HU', ceid: 'HU:hu' },
  RO: { hl: 'ro', gl: 'RO', ceid: 'RO:ro' },
  BG: { hl: 'bg', gl: 'BG', ceid: 'BG:bg' },
  UA: { hl: 'uk', gl: 'UA', ceid: 'UA:uk' },
  PK: { hl: 'en-PK', gl: 'PK', ceid: 'PK:en' },
  MA: { hl: 'fr', gl: 'MA', ceid: 'MA:fr' },
  SN: { hl: 'fr', gl: 'SN', ceid: 'SN:fr' },
  EC: { hl: 'es-419', gl: 'EC', ceid: 'EC:es-419' },
  PY: { hl: 'es-419', gl: 'PY', ceid: 'PY:es-419' },
  BO: { hl: 'es-419', gl: 'BO', ceid: 'BO:es-419' },
  CR: { hl: 'es-419', gl: 'CR', ceid: 'CR:es-419' },
  PA: { hl: 'es-419', gl: 'PA', ceid: 'PA:es-419' },
  DO: { hl: 'es-419', gl: 'DO', ceid: 'DO:es-419' },
  GT: { hl: 'es-419', gl: 'GT', ceid: 'GT:es-419' },
  HN: { hl: 'es-419', gl: 'HN', ceid: 'HN:es-419' },
  SV: { hl: 'es-419', gl: 'SV', ceid: 'SV:es-419' },
  NI: { hl: 'es-419', gl: 'NI', ceid: 'NI:es-419' },
};

// Nomes internacionais para busca inteligente quando o país não possui edição direta
const COUNTRY_INTL_NAMES = {
  US: 'United States',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  JP: 'Japan',
  RU: 'Russia',
  CN: 'China',
  KR: 'South Korea',
  KP: 'North Korea',
  IS: 'Iceland',
  UY: 'Uruguay',
  PY: 'Paraguay',
  BO: 'Bolivia',
  EC: 'Ecuador',
  AO: 'Angola',
  MZ: 'Mozambique',
  CV: 'Cabo Verde',
  GW: 'Guinea-Bissau',
  ST: 'Sao Tome and Principe',
  TL: 'Timor-Leste',
  AM: 'Armenia',
  GE: 'Georgia',
  AZ: 'Azerbaijan',
  KZ: 'Kazakhstan',
  UZ: 'Uzbekistan',
  MN: 'Mongolia',
  IR: 'Iran',
  IQ: 'Iraq',
  SY: 'Syria',
  LB: 'Lebanon',
  JO: 'Jordan',
  DZ: 'Algeria',
  TN: 'Tunisia',
  LY: 'Libya',
  SD: 'Sudan',
  ET: 'Ethiopia',
  GH: 'Ghana',
  CI: 'Ivory Coast',
  CM: 'Cameroon',
  CD: 'DR Congo',
  CG: 'Republic of the Congo',
  MG: 'Madagascar',
  ZW: 'Zimbabwe',
  ZM: 'Zambia',
  NA: 'Namibia',
  BW: 'Botswana',
};

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

// Tradução ultrarrápida via clients5 com fallback para translate.googleapis.com
async function traduzirTexto(texto, targetLang = 'pt') {
  const clean = String(texto || '').trim();
  if (!clean || clean.length < 3) return clean;

  const tl = encodeURIComponent(targetLang);
  const q = encodeURIComponent(clean);

  // 1. Tentativa primária: clients5.google.com
  const primaryUrl = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${tl}&q=${q}`;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(primaryUrl, { signal: ctrl.signal });
    clearTimeout(tid);
    if (resp.ok) {
      const data = await resp.json();
      let translated = '';
      if (Array.isArray(data)) {
        if (typeof data[0] === 'string') translated = data[0];
        else if (Array.isArray(data[0]) && typeof data[0][0] === 'string') translated = data[0][0];
      }
      if (translated && translated.trim() && translated.trim() !== clean) {
        return translated.trim();
      }
    }
  } catch {
    // Segue para fallback
  }

  // 2. Fallback: translate.googleapis.com (client=gtx)
  const fallbackUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${q}`;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(fallbackUrl, { signal: ctrl.signal });
    clearTimeout(tid);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0]
          .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
          .join('')
          .trim();
        if (translated) return translated;
      }
    }
  } catch {
    // Mantém original se fallback também falhar
  }

  return clean;
}

function parseRssXml(xmlText, countryCode) {
  const parsed = parseFeedItems(xmlText);
  const items = [];

  for (const entry of parsed) {
    const rawTitle = entry.title || '';
    const rawLink = entry.link || '';
    const rawSource = entry.source || '';

    if (rawTitle && rawLink && /^https?:\/\//i.test(rawLink)) {
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
        publishedAt: entry.pubDateIso || '',
        score: 85,
        country: countryCode,
      });
    }
  }

  items.sort((a, b) => compareIsoDesc(a.publishedAt, b.publishedAt));
  return items.slice(0, 15);
}

async function fetchRssAtlas(rssUrl, countryCode, isRefresh) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  try {
    const resp = await fetch(rssUrl, {
      cache: 'no-store',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RodandoOMundoAtlas/2.1)',
        ...(isRefresh ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : {}),
      },
    });
    if (!resp.ok) return { ok: false, items: [] };
    const xml = await resp.text();
    return { ok: true, items: parseRssXml(xml, countryCode) };
  } catch {
    return { ok: false, items: [] };
  } finally {
    clearTimeout(tid);
  }
}

export async function handleAtlasPais(request, env = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const pais = String(url.searchParams.get('pais') || 'BR').toUpperCase().trim();
  const nomePais = String(url.searchParams.get('nome') || pais).trim();
  const isRefresh = isRefreshRequest(request);

  const cacheKey = `atlas_${pais}`;
  const agora = Date.now();

  if (isRefresh) {
    CACHE_LOCAL.delete(cacheKey);
  }

  // Verifica cache em memória
  if (!isRefresh && CACHE_LOCAL.has(cacheKey)) {
    const entry = CACHE_LOCAL.get(cacheKey);
    if (entry && Array.isArray(entry.items) && entry.items.length > 0 && agora - entry.timestamp < CACHE_TTL_MS) {
      return json({
        ok: true,
        cached: true,
        fallback: false,
        source: 'memory_cache',
        country: pais,
        countryName: nomePais,
        updatedAt: new Date(entry.timestamp).toISOString(),
        items: entry.items,
      }, 200, newsResponseHeaders({ isRefresh: false, isFallback: false, corsHeaders: CORS_HEADERS }));
    }
  }

  // 1. Busca Multi-Motor RSS para o país com prioridade absoluta para Top Headlines Oficiais de Capa
  let rssUrl = '';
  const edition = GOOGLE_NEWS_EDITIONS[pais];
  const searchName = COUNTRY_INTL_NAMES[pais] || nomePais;

  if (pais === 'BR') {
    rssUrl = 'https://news.google.com/rss/headlines/section/geo/Brasil?hl=pt-BR&gl=BR&ceid=BR:pt-419';
  } else if (edition) {
    // Para países com edição nativa (US, GB, FR, DE, IT, ES, etc.): consome o feed oficial de Top Headlines
    rssUrl = `https://news.google.com/rss?hl=${encodeURIComponent(edition.hl)}&gl=${encodeURIComponent(edition.gl)}&ceid=${encodeURIComponent(edition.ceid)}`;
  } else {
    // Para países menores/sem edição direta: busca pelo nome internacional com janela estrita de 24h
    const searchLang = PT_COUNTRIES.has(pais) ? 'pt-BR' : 'en';
    const langPrefix = searchLang.split('-')[0];
    rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`${searchName} when:24h`)}&hl=${searchLang}&gl=${encodeURIComponent(pais)}&ceid=${encodeURIComponent(pais)}:${langPrefix}`;
  }

  let usedFallback = false;
  let resRss = await fetchRssAtlas(rssUrl, pais, isRefresh);
  let items = resRss.items;

  // Fallback 1: se o Top Headlines da edição nativa ou o when:24h retornar vazio, tenta busca com when:2d
  if (items.length === 0 && pais !== 'BR') {
    const searchLang = (edition && edition.hl) || (PT_COUNTRIES.has(pais) ? 'pt-BR' : 'en');
    const langPrefix = searchLang.split('-')[0];
    const fallbackUrl2d = `https://news.google.com/rss/search?q=${encodeURIComponent(`${searchName} when:2d`)}&hl=${searchLang}&gl=${encodeURIComponent(pais)}&ceid=${encodeURIComponent(pais)}:${langPrefix}`;
    const res2d = await fetchRssAtlas(fallbackUrl2d, pais, isRefresh);
    if (res2d.items.length > 0) {
      items = res2d.items;
      usedFallback = true;
    }
  }

  // Fallback 2: se ainda vazio, tenta busca expandida (when:7d) para microterritórios/ilhas isoladas
  if (items.length === 0 && pais !== 'BR') {
    const searchLang = (edition && edition.hl) || (PT_COUNTRIES.has(pais) ? 'pt-BR' : 'en');
    const langPrefix = searchLang.split('-')[0];
    const fallbackUrl7d = `https://news.google.com/rss/search?q=${encodeURIComponent(`${searchName} when:7d`)}&hl=${searchLang}&gl=${encodeURIComponent(pais)}&ceid=${encodeURIComponent(pais)}:${langPrefix}`;
    const res7d = await fetchRssAtlas(fallbackUrl7d, pais, isRefresh);
    if (res7d.items.length > 0) {
      items = res7d.items;
      usedFallback = true;
    }
  }

  // Ordena cronologicamente ANTES de selecionar os 4 itens mais recentes para tradução
  items.sort((a, b) => compareIsoDesc(a.publishedAt, b.publishedAt));

  // 2. Tradução em paralelo para PT-BR em países não lusófonos (4 itens mais recentes)
  if (!PT_COUNTRIES.has(pais) && items.length > 0) {
    const alvos = items.slice(0, 4);
    await Promise.all(
      alvos.map(async (it) => {
        if (!it.titleOriginal) return;
        try {
          const traduzido = await traduzirTexto(it.titleOriginal, 'pt');
          if (traduzido && traduzido !== it.titleOriginal) {
            it.titlePt = traduzido;
          }
        } catch {
          // Mantém original se tradução falhar
        }
      })
    );
  }

  const isFallback = usedFallback || items.length === 0;

  // Salva no cache local apenas quando há itens válidos da janela principal
  if (!isFallback) {
    CACHE_LOCAL.set(cacheKey, { timestamp: agora, items });
  }

  const headers = newsResponseHeaders({ isRefresh, isFallback, corsHeaders: CORS_HEADERS });

  return json({
    ok: true,
    cached: false,
    fallback: isFallback,
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
