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
    return semTags.slice(0, maxLen - 1).replace(/[,.;:\s]+$/, '') + '…';
  }
  return semTags;
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

    items.push({
      title,
      link,
      pubDateIso,
      description: limparHtmlTexto(rawDesc),
      rawDescription: rawDesc,
      rawContent,
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
