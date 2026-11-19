// Utilitários compartilhados de RSS, frescor temporal, cache-busting e segurança de proxy Edge (Milestone M2).

export const LOOPBACK_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

export const STATIC_SITE_HOSTS = new Set([
  'rodandoomundo.com.br',
  'www.rodandoomundo.com.br',
]);

/**
 * Reconhece sinalizadores de atualização/cache-busting em query string e body POST.
 */
export function isRefreshRequest(request, bodyParams = null) {
  try {
    const url = new URL(request.url);
    const refreshParam = url.searchParams.get('refresh');
    const forceParam = url.searchParams.get('force');
    if (
      url.searchParams.has('_t') ||
      refreshParam === '1' ||
      refreshParam === 'true' ||
      forceParam === '1' ||
      forceParam === 'true'
    ) {
      return true;
    }
  } catch {
    // URL inválida — verifica apenas bodyParams
  }

  if (bodyParams && typeof bodyParams === 'object') {
    if (
      (bodyParams._t !== undefined && bodyParams._t !== null && bodyParams._t !== '' && bodyParams._t !== false) ||
      bodyParams.refresh === 1 ||
      bodyParams.refresh === '1' ||
      bodyParams.refresh === true ||
      bodyParams.force === 1 ||
      bodyParams.force === '1' ||
      bodyParams.force === true
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Cabeçalhos HTTP padronizados para feeds dinâmicos e fallbacks (Contract 3).
 * Nunca permite que CDN ou navegador congele respostas de fallback ou de refresh.
 */
export function newsResponseHeaders({ isRefresh = false, isFallback = false, corsHeaders = {} } = {}) {
  if (isRefresh || isFallback) {
    return {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders,
    };
  }
  return {
    'Cache-Control': 'public, max-age=0, s-maxage=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders,
  };
}

export function decodificarEntidades(str) {
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

export function limparHtmlTexto(str, maxLen = 0) {
  if (!str) return '';
  const semTags = decodificarEntidades(str)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLen > 0 && semTags.length > maxLen) {
    const corte = semTags.slice(0, maxLen);
    const espaco = corte.lastIndexOf(' ');
    const base = espaco > Math.floor(maxLen * 0.6) ? corte.slice(0, espaco) : corte;
    return base.replace(/[,.;:\-–—\s]+$/, '') + '…';
  }
  return semTags;
}

/**
 * Verifica se um segmento curto extraído antes de <br /> corresponde a crédito ou legenda de foto.
 */
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

/**
 * Remove créditos fotográficos (ex: "Marcello Casal Jr/Agência Brasil" após <img><br /> no g1),
 * tags HTML e trunca o resumo editorial na última palavra inteira.
 */
export function limparResumoEditorial(raw, maxLen = 195) {
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

  // Regex de segurança para créditos colados no início do texto sem <br />
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

/**
 * Extrai a URL da imagem de um bloco <item> ou <entry> do RSS na ordem:
 * 1. <media:thumbnail url="..." />
 * 2. <media:content url="..." />
 * 3. <enclosure type="image/..." url="..." />
 * 4. Primeiro <img src="..."> em <description> ou <content:encoded>
 */
export function extrairImagemRssItem(bloco, rawDesc = '', rawContent = '') {
  if (!bloco && !rawDesc && !rawContent) return null;
  const srcBloco = String(bloco || '');

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
      if (/(?:glbimg\.com|globo\.com|bbci\.co\.uk|bbc\.co\.uk|bbc\.com|akamaized\.net|wikimedia\.org|wp\.com)/i.test(url)) {
        url = url.replace(/^http:\/\//i, 'https://');
      } else {
        url = url.replace(/^http:\/\//i, 'https://');
      }
    }
    if (/^https:\/\//i.test(url)) {
      return url;
    }
  }

  return null;
}

/**
 * Faz parsing seguro de datas RSS/Atom/ISO.
 * NUNCA inventa `now()` para itens sem data ou com data inválida — retorna ''.
 */
export function parseTimestampIso(rawDate) {
  if (!rawDate) return '';
  const limpo = decodificarEntidades(String(rawDate)).replace(/<[^>]+>/g, ' ').trim();
  if (!limpo) return '';
  const d = new Date(limpo);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

/**
 * Compara duas datas ISO/strings em ordem cronológica decrescente.
 * Itens sem data ('' ou inválidos) são ordenados estritamente DEPOIS de todos os itens datados.
 */
export function compareIsoDesc(isoA, isoB) {
  const ta = isoA ? Date.parse(String(isoA)) : NaN;
  const tb = isoB ? Date.parse(String(isoB)) : NaN;
  const hasA = Number.isFinite(ta);
  const hasB = Number.isFinite(tb);
  if (hasA && hasB) return tb - ta;
  if (hasA !== hasB) return hasA ? -1 : 1;
  return 0;
}

/**
 * Comparador canônico de recência primária com desempate por score (Contract 1).
 */
export function compararRecenciaDesc(a, b, campoScore = 'urgencia_score') {
  const isoA =
    (a && (a.data_publicacao || a.publicadoEm || a.publishedAt || a.updated_at || a.data)) || '';
  const isoB =
    (b && (b.data_publicacao || b.publicadoEm || b.publishedAt || b.updated_at || b.data)) || '';
  const cmp = compareIsoDesc(isoA, isoB);
  if (cmp !== 0) return cmp;
  const scoreB = Number((b && (b[campoScore] ?? b.relevancia_score ?? b.urgencia_score)) || 0);
  const scoreA = Number((a && (a[campoScore] ?? a.relevancia_score ?? a.urgencia_score)) || 0);
  return scoreB - scoreA;
}

function extrairTagBloco(bloco, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = bloco.match(re);
  return m ? m[1].trim() : '';
}

function extrairLinkBloco(bloco) {
  const mAlt = bloco.match(
    /<link\b(?=[^>]*\brel=["']alternate["'])[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i
  );
  if (mAlt && mAlt[1]) return decodificarEntidades(mAlt[1]).trim();

  const mHref = bloco.match(
    /<link\b(?![^>]*\brel=["'](?:self|enclosure|replies|edit|hub)["'])[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i
  );
  if (mHref && mHref[1]) return decodificarEntidades(mHref[1]).trim();

  const mTag = bloco.match(/<link(?:\s[^>]*)?>([^<]+)<\/link>/i);
  if (mTag && mTag[1]) {
    const cleaned = limparHtmlTexto(mTag[1]);
    if (cleaned) return cleaned;
  }

  const mGuid = bloco.match(/<guid(?:\s[^>]*)?>(https?:\/\/[^<]+)<\/guid>/i);
  if (mGuid && mGuid[1]) return decodificarEntidades(mGuid[1]).trim();

  const mId = bloco.match(/<id(?:\s[^>]*)?>(https?:\/\/[^<]+)<\/id>/i);
  if (mId && mId[1]) return decodificarEntidades(mId[1]).trim();

  return '';
}

/**
 * Faz parsing completo de feeds RSS 2.0 (<item>) e Atom 1.0 (<entry>).
 * NÃO fatia dentro do parser para permitir ordenação cronológica completa antes do corte.
 */
export function parseFeedItems(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') return [];
  const items = [];
  const regex = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = regex.exec(xmlText)) !== null) {
    const bloco = match[2];
    const rawTitle = extrairTagBloco(bloco, 'title');
    const title = limparHtmlTexto(rawTitle);
    const link = extrairLinkBloco(bloco);

    const rawDate =
      extrairTagBloco(bloco, 'pubDate') ||
      extrairTagBloco(bloco, 'dc:date') ||
      extrairTagBloco(bloco, 'published') ||
      extrairTagBloco(bloco, 'atom:published') ||
      extrairTagBloco(bloco, 'updated') ||
      extrairTagBloco(bloco, 'atom:updated');
    const pubDateIso = parseTimestampIso(rawDate);

    const rawDesc =
      extrairTagBloco(bloco, 'description') ||
      extrairTagBloco(bloco, 'summary') ||
      extrairTagBloco(bloco, 'content:encoded') ||
      extrairTagBloco(bloco, 'content');
    const rawContent = extrairTagBloco(bloco, 'content:encoded') || extrairTagBloco(bloco, 'content');
    const source = limparHtmlTexto(extrairTagBloco(bloco, 'source'));
    const imageUrl = extrairImagemRssItem(bloco, rawDesc, rawContent);

    items.push({
      title,
      link,
      pubDateIso,
      description: limparResumoEditorial(rawDesc, 0),
      rawDescription: rawDesc,
      rawContent,
      imageUrl,
      source,
      rawBlock: bloco,
    });
  }

  return items;
}

/**
 * Valida CURADORIA_BACKEND_URL com proteção contra self-loop, loopback e saltos recursivos.
 * Permite subdomínios de API dedicados (incluindo api.rodandoomundo.com.br) desde que não haja loop.
 */
export function resolverBackendUrl(env, request) {
  const raw = String((env && env.CURADORIA_BACKEND_URL) || '')
    .trim()
    .replace(/\/+$/, '');
  if (!raw || !/^https?:\/\//i.test(raw)) return null;

  try {
    if (request && request.headers) {
      if (
        request.headers.get('X-Rom-Edge-Hop') === '1' ||
        request.headers.get('X-ROM-Edge-Proxy') === '1'
      ) {
        return null;
      }
    }

    const parsed = new URL(raw);
    const alvoHost = parsed.hostname.toLowerCase();

    if (LOOPBACK_HOSTS.has(alvoHost)) return null;
    if (STATIC_SITE_HOSTS.has(alvoHost)) return null;

    if (request && request.url) {
      const reqUrl = new URL(request.url);
      if (alvoHost === reqUrl.hostname.toLowerCase()) return null;
    }

    return raw;
  } catch {
    return null;
  }
}
