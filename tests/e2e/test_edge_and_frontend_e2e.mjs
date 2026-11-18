/**
 * Opaque-Box 4-Tier E2E Test Suite — Cloudflare Edge & Frontend DOM/Client-State (F1–F11)
 *
 * Uses Node v26.13.0 built-ins ONLY (`node:test`, `node:assert/strict`, `node:vm`,
 * `node:fs`, `node:path`, `node:crypto`). Zero external npm dependencies.
 *
 * Executes real `_worker.js` + `functions/api/*.js` ESM handlers and real
 * `vendor/d3.min.js`, `vendor/topojson-client.min.js`, `data/world.js`,
 * `data/data.js`, `data/editorial.js`, and `app.js` inside `node:vm`.
 */
import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import worker from '../../_worker.js';
import * as apiRadar from '../../functions/api/radar.js';
import * as apiNoticiasQuentes from '../../functions/api/noticias-quentes.js';
import * as apiVitrineEmAlta from '../../functions/api/vitrine-em-alta.js';
import * as apiUltimasNoticias from '../../functions/api/ultimas-noticias.js';
import * as apiAtlasPais from '../../functions/api/atlas-pais.js';
import * as apiResumo from '../../functions/api/resumo.js';
import * as apiBuscaAssunto from '../../functions/api/busca-assunto.js';
import * as apiNoticias from '../../functions/api/noticias.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
}

const INDEX_HTML = readRepoFile('index.html');
const HTML_200 = readRepoFile('200.html');
const SOBRE_HTML = readRepoFile('sobre.html');

// Precompile production JS scripts once so each VM boot is fast (~300ms)
const PRECOMPILED_SCRIPTS = {
  d3: new vm.Script(readRepoFile('vendor/d3.min.js'), { filename: 'vendor/d3.min.js' }),
  topojson: new vm.Script(readRepoFile('vendor/topojson-client.min.js'), { filename: 'vendor/topojson-client.min.js' }),
  world: new vm.Script(readRepoFile('data/world.js'), { filename: 'data/world.js' }),
  data: new vm.Script(readRepoFile('data/data.js'), { filename: 'data/data.js' }),
  editorial: new vm.Script(readRepoFile('data/editorial.js'), { filename: 'data/editorial.js' }),
  app: new vm.Script(readRepoFile('app.js'), { filename: 'app.js' }),
};

// ============================================================================
// 1. MUTABLE MOCK UPSTREAM + GLOBAL FETCH INTERCEPTOR
// ============================================================================
const ORIGINAL_GLOBAL_FETCH = globalThis.fetch;
let activeGlobalFetchRouter = null;

globalThis.fetch = async function patchedGlobalFetch(input, init = {}) {
  if (typeof activeGlobalFetchRouter === 'function') {
    return activeGlobalFetchRouter(input, init);
  }
  return new Response('Upstream not mocked', { status: 502 });
};

after(() => {
  globalThis.fetch = ORIGINAL_GLOBAL_FETCH;
  activeGlobalFetchRouter = null;
});

function createJsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function createTextResponse(body, status = 200, contentType = 'application/xml; charset=utf-8', headers = {}) {
  return new Response(String(body), {
    status,
    headers: {
      'Content-Type': contentType,
      ...headers,
    },
  });
}

function waitWithSignal(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (typeof timer.unref === 'function') timer.unref();

    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    }
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function buildRssXml(items, channelTitle = 'Mock RSS Feed') {
  const itemsXml = items
    .map((it) => {
      const pubTag = it.pubDate !== undefined && it.pubDate !== null && it.pubDate !== ''
        ? `<pubDate>${it.pubDate}</pubDate>`
        : '';
      const srcTag = it.source ? `<source>${it.source}</source>` : '';
      const descTag = it.description ? `<description><![CDATA[${it.description}]]></description>` : '';
      return `<item><title><![CDATA[${it.title}]]></title><link>${it.link}</link>${pubTag}${srcTag}${descTag}</item>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${channelTitle}</title>${itemsXml}</channel></rss>`;
}

function buildAtomXml(entries, feedTitle = 'Mock Atom Feed') {
  const entriesXml = entries
    .map((en) => {
      const pubTag = en.published ? `<published>${en.published}</published>` : '';
      const updTag = en.updated ? `<updated>${en.updated}</updated>` : '';
      const sumTag = en.summary ? `<summary><![CDATA[${en.summary}]]></summary>` : '';
      return `<entry><title><![CDATA[${en.title}]]></title><link rel="alternate" href="${en.link}"/>${pubTag}${updTag}${sumTag}</entry>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>${feedTitle}</title>${entriesXml}</feed>`;
}

function createMockUpstream(initial = {}) {
  const state = {
    backendUrl: initial.backendUrl ?? 'https://backend.example.test',
    currentsApiKey: initial.currentsApiKey ?? 'test-currents-key',
    vitrineIa: initial.vitrineIa ?? {
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
      temas_ativos: [],
      noticias_quentes: [],
    },
    feedOutput: initial.feedOutput ?? [],
    noticiasQuentesApi: initial.noticiasQuentesApi ?? null,
    pulsoContinental: initial.pulsoContinental ?? { paises_ativos: [] },
    vitrineEmAltaApi: initial.vitrineEmAltaApi ?? null,
    buscaExpansaoApi: initial.buscaExpansaoApi ?? null,
    colunasApi: initial.colunasApi ?? { ok: true, atualizado_em: 'Atualizado agora', colunas: [] },
    assetVitrineIa: initial.assetVitrineIa ?? {
      updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
      temas_ativos: [],
    },
    assetFeedOutput: initial.assetFeedOutput ?? [],
    assetDossies: initial.assetDossies ?? { dossies: [] },
    rssHandler: initial.rssHandler ?? null,
    translateHandler: initial.translateHandler ?? ((text) => `PT: ${text}`),
    currentsHandler: initial.currentsHandler ?? null,
    routeOverrides: new Map(),
  };

  const upstreamCalls = [];

  async function resolveSpec(spec, urlStr, init) {
    if (typeof spec === 'function') {
      spec = await spec(urlStr, init);
    }
    if (spec && typeof spec === 'object' && spec.__error) {
      if (spec.delayMs) await waitWithSignal(spec.delayMs, init && init.signal);
      throw new Error(spec.__error);
    }
    if (spec && typeof spec === 'object' && spec.delayMs) {
      await waitWithSignal(spec.delayMs, init && init.signal);
    }
    if (spec && typeof spec === 'object' && typeof spec.__status === 'number') {
      return createJsonResponse(spec.body ?? { ok: false, error: 'Injected error' }, spec.__status);
    }
    return spec;
  }

  async function routeGlobalFetch(input, init = {}) {
    const urlStr = typeof input === 'string' ? input : input.url;
    const method = (init && init.method) || (typeof input !== 'string' && input.method) || 'GET';
    upstreamCalls.push({ url: urlStr, method, ts: Date.now() });

    let u;
    try {
      u = new URL(urlStr);
    } catch {
      return new Response('Bad URL', { status: 400 });
    }

    // Route overrides for testing specific URLs
    for (const [matcher, handler] of state.routeOverrides.entries()) {
      const matched = typeof matcher === 'string' ? urlStr.includes(matcher) : matcher.test(urlStr);
      if (matched) {
        const res = await resolveSpec(handler, urlStr, init);
        if (res instanceof Response) return res;
        if (typeof res === 'string') return createTextResponse(res, 200);
        return createJsonResponse(res ?? {});
      }
    }

    // Backend FastAPI mock
    if (state.backendUrl && urlStr.startsWith(state.backendUrl)) {
      const p = u.pathname;
      if (p === '/v1/estado/vitrine_ia') {
        const val = await resolveSpec(state.vitrineIa, urlStr, init);
        if (val instanceof Response) return val;
        if (val === null) return new Response('Not Found', { status: 404 });
        return createJsonResponse({ key: 'vitrine_ia', payload: val });
      }
      if (p === '/v1/estado/feed_output') {
        const val = await resolveSpec(state.feedOutput, urlStr, init);
        if (val instanceof Response) return val;
        if (val === null) return new Response('Not Found', { status: 404 });
        return createJsonResponse({ key: 'feed_output', payload: val });
      }
      if (p === '/v1/noticias-quentes') {
        const val = await resolveSpec(state.noticiasQuentesApi, urlStr, init);
        if (val instanceof Response) return val;
        if (!val) return new Response('Not Found', { status: 404 });
        return createJsonResponse(val);
      }
      if (p === '/v1/atlas/pulso-continental') {
        const val = await resolveSpec(state.pulsoContinental, urlStr, init);
        if (val instanceof Response) return val;
        return createJsonResponse(val || { paises_ativos: [] });
      }
      if (p === '/v1/vitrine/em-alta') {
        const val = await resolveSpec(state.vitrineEmAltaApi, urlStr, init);
        if (val instanceof Response) return val;
        if (!val) return new Response('Not Found', { status: 404 });
        return createJsonResponse(val);
      }
      if (p === '/v1/busca/expansao') {
        const val = await resolveSpec(state.buscaExpansaoApi, urlStr, init);
        if (val instanceof Response) return val;
        if (!val) return new Response('Not Found', { status: 404 });
        return createJsonResponse(val);
      }
      if (p === '/v2/colunas' || p.startsWith('/v2/entenda-o-assunto')) {
        const val = await resolveSpec(state.colunasApi, urlStr, init);
        if (val instanceof Response) return val;
        return createJsonResponse(val || { ok: true, colunas: [] });
      }
      return new Response('Not Found', { status: 404 });
    }

    // Same-origin /data/*.json fetched via global fetch (e.g. noticias-quentes.js / vitrine-em-alta.js)
    if (u.pathname === '/data/vitrine_ia.json') {
      const val = await resolveSpec(state.assetVitrineIa, urlStr, init);
      if (val instanceof Response) return val;
      return createJsonResponse(val ?? { temas_ativos: [] });
    }
    if (u.pathname === '/data/feed_output.json') {
      const val = await resolveSpec(state.assetFeedOutput, urlStr, init);
      if (val instanceof Response) return val;
      return createJsonResponse(val ?? []);
    }
    if (u.pathname === '/data/dossies.json') {
      const val = await resolveSpec(state.assetDossies, urlStr, init);
      if (val instanceof Response) return val;
      return createJsonResponse(val ?? { dossies: [] });
    }

    // Translation endpoints
    if (u.hostname === 'clients5.google.com') {
      const q = u.searchParams.get('q') || '';
      const tr = state.translateHandler ? await state.translateHandler(q, u.searchParams.get('tl') || 'pt') : q;
      return createJsonResponse([[tr]]);
    }
    if (u.hostname === 'translate.googleapis.com') {
      const q = u.searchParams.get('q') || '';
      const tr = state.translateHandler ? await state.translateHandler(q, u.searchParams.get('tl') || 'pt') : q;
      return createJsonResponse([[[tr, q]]]);
    }
    if (u.hostname === 'api.mymemory.translated.net') {
      const q = u.searchParams.get('q') || '';
      const tr = state.translateHandler ? await state.translateHandler(q, 'pt') : q;
      return createJsonResponse({ responseData: { translatedText: tr } });
    }

    // Currents API
    if (u.hostname === 'api.currentsapi.services') {
      if (typeof state.currentsHandler === 'function') {
        const res = await state.currentsHandler(urlStr, init);
        if (res instanceof Response) return res;
        return createJsonResponse(res);
      }
      return createJsonResponse({ status: 'ok', news: [] });
    }

    // External RSS / Atom feeds
    if (typeof state.rssHandler === 'function') {
      const res = await state.rssHandler(urlStr, init);
      if (res instanceof Response) return res;
      if (res && typeof res === 'object' && typeof res.status === 'number') {
        return createTextResponse(res.body || '', res.status);
      }
      if (typeof res === 'string') {
        return createTextResponse(res, 200);
      }
    }

    return createTextResponse(buildRssXml([]), 200);
  }

  const env = {
    get CURADORIA_BACKEND_URL() {
      return state.backendUrl;
    },
    get CURRENTS_API_KEY() {
      return state.currentsApiKey;
    },
    ASSETS: {
      async fetch(req) {
        const reqUrl = typeof req === 'string' ? req : req.url;
        const u = new URL(reqUrl, 'https://www.rodandoomundo.com.br');
        if (u.pathname === '/api/noticias-quentes') {
          return apiNoticiasQuentes.onRequestGet({ request: req instanceof Request ? req : new Request(u.toString()), env });
        }
        if (u.pathname === '/api/vitrine-em-alta') {
          return apiVitrineEmAlta.onRequestGet({ request: req instanceof Request ? req : new Request(u.toString()), env });
        }
        if (u.pathname === '/api/ultimas-noticias') {
          return apiUltimasNoticias.onRequestGet({ request: req instanceof Request ? req : new Request(u.toString()), env });
        }
        if (u.pathname === '/api/atlas-pais') {
          return apiAtlasPais.onRequestGet({ request: req instanceof Request ? req : new Request(u.toString()), env });
        }
        if (u.pathname === '/api/resumo') {
          return apiResumo.onRequestGet({ request: req instanceof Request ? req : new Request(u.toString()), env });
        }
        if (u.pathname === '/api/busca-assunto') {
          const reqObj = req instanceof Request ? req : new Request(u.toString());
          const method = String(reqObj.method || 'GET').toUpperCase();
          if (method === 'POST' && typeof apiBuscaAssunto.onRequestPost === 'function') {
            return apiBuscaAssunto.onRequestPost({ request: reqObj, env });
          }
          if (typeof apiBuscaAssunto.onRequest === 'function') {
            return apiBuscaAssunto.onRequest({ request: reqObj, env });
          }
          return apiBuscaAssunto.onRequestGet({ request: reqObj, env });
        }
        if (u.pathname === '/api/noticias') {
          return apiNoticias.onRequestGet({ request: req instanceof Request ? req : new Request(u.toString()), env });
        }
        if (u.pathname === '/api/traduzir') {
          const reqObj = req instanceof Request ? req : new Request(u.toString());
          try {
            const body = await reqObj.json();
            const out = {};
            for (const [k, v] of Object.entries((body && body.itens) || {})) {
              out[k] = state.translateHandler ? await state.translateHandler(v, body.lang || 'pt') : `PT: ${v}`;
            }
            return createJsonResponse({ lang: (body && body.lang) || 'pt', itens: out });
          } catch {
            return createJsonResponse({ lang: 'pt', itens: {} });
          }
        }
        if (u.pathname === '/v2/sugestoes-contextuais') {
          return createJsonResponse({ ok: true, sugestoes: [] });
        }
        if (u.pathname === '/data/vitrine_ia.json') {
          const val = typeof state.assetVitrineIa === 'function' ? await state.assetVitrineIa() : state.assetVitrineIa;
          return createJsonResponse(val ?? { temas_ativos: [] });
        }
        if (u.pathname === '/data/feed_output.json') {
          const val = typeof state.assetFeedOutput === 'function' ? await state.assetFeedOutput() : state.assetFeedOutput;
          return createJsonResponse(val ?? []);
        }
        if (u.pathname === '/data/dossies.json') {
          const val = typeof state.assetDossies === 'function' ? await state.assetDossies() : state.assetDossies;
          return createJsonResponse(val ?? { dossies: [] });
        }
        if (u.pathname === '/' || u.pathname === '/index.html') {
          return createTextResponse(INDEX_HTML, 200, 'text/html; charset=utf-8');
        }
        return new Response('Not Found', { status: 404 });
      },
    },
  };

  return {
    state,
    env,
    upstreamCalls,
    activate() {
      activeGlobalFetchRouter = routeGlobalFetch;
    },
    clearCalls() {
      upstreamCalls.length = 0;
    },
  };
}

// ============================================================================
// 2. LIGHTWEIGHT HTML PARSER + DOM SHIM FOR REAL `app.js` IN `node:vm`
// ============================================================================
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line',
  'polyline', 'polygon', 'ellipse', 'use', 'stop',
]);

function decodeEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function escapeAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseAttributes(rawAttrs) {
  const attrs = new Map();
  const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = attrRegex.exec(rawAttrs)) !== null) {
    const name = m[1].toLowerCase();
    const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    attrs.set(name, decodeEntities(val));
  }
  return attrs;
}

function splitSelectorList(sel) {
  const parts = [];
  let cur = '';
  let bracket = 0;
  let paren = 0;
  let quote = '';
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (quote) {
      cur += ch;
      if (ch === quote && sel[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '[') bracket++;
    else if (ch === ']') bracket = Math.max(0, bracket - 1);
    else if (ch === '(') paren++;
    else if (ch === ')') paren = Math.max(0, paren - 1);
    else if (ch === ',' && bracket === 0 && paren === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function tokenizeComplexSelector(sel) {
  const tokens = [];
  let i = 0;
  const s = sel.trim();
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i < s.length && s[i] !== '>' && (tokens.length === 0 || tokens[tokens.length - 1] !== '>')) {
        tokens.push(' ');
      }
      continue;
    }
    if (s[i] === '>') {
      if (tokens.length && tokens[tokens.length - 1] === ' ') tokens.pop();
      tokens.push('>');
      i++;
      while (i < s.length && /\s/.test(s[i])) i++;
      continue;
    }
    let compound = '';
    let bracket = 0;
    let paren = 0;
    let quote = '';
    while (i < s.length) {
      const ch = s[i];
      if (quote) {
        compound += ch;
        if (ch === quote && s[i - 1] !== '\\') quote = '';
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        compound += ch;
        i++;
        continue;
      }
      if (ch === '[') bracket++;
      else if (ch === ']') bracket = Math.max(0, bracket - 1);
      else if (ch === '(') paren++;
      else if (ch === ')') paren = Math.max(0, paren - 1);
      else if (bracket === 0 && paren === 0 && (/\s/.test(ch) || ch === '>')) {
        break;
      }
      compound += ch;
      i++;
    }
    if (compound) tokens.push(compound);
  }
  return tokens;
}

function matchCompoundSelector(el, compound) {
  if (!el || el.nodeType !== 1) return false;
  let i = 0;
  const len = compound.length;
  while (i < len) {
    const ch = compound[i];
    if (ch === '#') {
      i++;
      let id = '';
      while (i < len && !/[.#[:\s]/.test(compound[i])) id += compound[i++];
      if (el.getAttribute('id') !== id) return false;
    } else if (ch === '.') {
      i++;
      let cls = '';
      while (i < len && !/[.#[:\s]/.test(compound[i])) cls += compound[i++];
      if (!el.classList.contains(cls)) return false;
    } else if (ch === '[') {
      i++;
      let expr = '';
      let q = '';
      while (i < len) {
        if (q) {
          expr += compound[i];
          if (compound[i] === q && compound[i - 1] !== '\\') q = '';
          i++;
          continue;
        }
        if (compound[i] === '"' || compound[i] === "'") {
          q = compound[i];
          expr += compound[i++];
          continue;
        }
        if (compound[i] === ']') {
          i++;
          break;
        }
        expr += compound[i++];
      }
      const m = expr.match(/^([^\s=~^$*|]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|(.*)))?$/);
      if (!m) return false;
      const attrName = m[1].toLowerCase();
      const op = m[2] || '';
      const rawExpected = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : (m[5] !== undefined ? m[5].trim() : ''));
      const hasAttr = el.hasAttribute(attrName);
      if (!op) {
        if (!hasAttr) return false;
      } else {
        if (!hasAttr) return false;
        const actual = String(el.getAttribute(attrName) || '');
        if (op === '=' && actual !== rawExpected) return false;
        if (op === '^=' && !actual.startsWith(rawExpected)) return false;
        if (op === '$=' && !actual.endsWith(rawExpected)) return false;
        if (op === '*=' && !actual.includes(rawExpected)) return false;
        if (op === '~=' && !actual.split(/\s+/).includes(rawExpected)) return false;
      }
    } else if (ch === ':') {
      i++;
      let pseudo = '';
      while (i < len && /[a-zA-Z0-9_-]/.test(compound[i])) pseudo += compound[i++];
      let arg = '';
      if (i < len && compound[i] === '(') {
        i++;
        let depth = 1;
        while (i < len && depth > 0) {
          if (compound[i] === '(') depth++;
          else if (compound[i] === ')') {
            depth--;
            if (depth === 0) { i++; break; }
          }
          arg += compound[i++];
        }
      }
      if (pseudo === 'hover' || pseudo === 'focus-visible' || pseudo === 'active') return false;
      if (pseudo === 'focus') {
        if (el.ownerDocument && el.ownerDocument.activeElement !== el) return false;
      } else if (pseudo === 'not') {
        if (matchComplexSelector(el, arg)) return false;
      } else if (pseudo === 'first-child') {
        if (!el.parentNode || el.parentNode.children[0] !== el) return false;
      } else if (pseudo === 'last-child') {
        if (!el.parentNode) return false;
        const chlds = el.parentNode.children;
        if (chlds[chlds.length - 1] !== el) return false;
      }
    } else {
      let tag = '';
      while (i < len && !/[.#[:\s]/.test(compound[i])) tag += compound[i++];
      if (tag && tag !== '*' && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    }
  }
  return true;
}

function matchComplexSelector(el, selectorStr) {
  const branches = splitSelectorList(selectorStr);
  for (const branch of branches) {
    const tokens = tokenizeComplexSelector(branch);
    if (!tokens.length) continue;
    let idx = tokens.length - 1;
    if (!matchCompoundSelector(el, tokens[idx])) continue;
    idx--;
    let cur = el;
    let ok = true;
    while (idx >= 0) {
      const comb = tokens[idx];
      idx--;
      const targetComp = tokens[idx];
      idx--;
      if (comb === '>') {
        cur = cur.parentNode;
        if (!cur || cur.nodeType !== 1 || !matchCompoundSelector(cur, targetComp)) {
          ok = false;
          break;
        }
      } else {
        let p = cur.parentNode;
        let found = false;
        while (p && p.nodeType === 1) {
          if (matchCompoundSelector(p, targetComp)) {
            cur = p;
            found = true;
            break;
          }
          p = p.parentNode;
        }
        if (!found) {
          ok = false;
          break;
        }
      }
    }
    if (ok) return true;
  }
  return false;
}

function createDomFromHtml(htmlString) {
  class DomNode {
    constructor(nodeType, ownerDocument) {
      this.nodeType = nodeType;
      this.ownerDocument = ownerDocument;
      this.parentNode = null;
      this.childNodes = [];
      this._listeners = new Map();
    }
    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    get lastChild() {
      return this.childNodes[this.childNodes.length - 1] || null;
    }
    get nextSibling() {
      if (!this.parentNode) return null;
      const arr = this.parentNode.childNodes;
      const idx = arr.indexOf(this);
      return idx >= 0 && idx + 1 < arr.length ? arr[idx + 1] : null;
    }
    get previousSibling() {
      if (!this.parentNode) return null;
      const arr = this.parentNode.childNodes;
      const idx = arr.indexOf(this);
      return idx > 0 ? arr[idx - 1] : null;
    }
    get nextElementSibling() {
      let s = this.nextSibling;
      while (s && s.nodeType !== 1) s = s.nextSibling;
      return s || null;
    }
    get previousElementSibling() {
      let s = this.previousSibling;
      while (s && s.nodeType !== 1) s = s.previousSibling;
      return s || null;
    }
    get children() {
      return this.childNodes.filter((n) => n.nodeType === 1);
    }
    appendChild(child) {
      return this.insertBefore(child, null);
    }
    insertBefore(child, refNode) {
      if (!child) return child;
      if (child.nodeType === 11) {
        const items = child.childNodes.slice();
        for (const item of items) {
          this.insertBefore(item, refNode);
        }
        return child;
      }
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument || (this.nodeType === 9 ? this : null);
      if (refNode) {
        const idx = this.childNodes.indexOf(refNode);
        if (idx >= 0) {
          this.childNodes.splice(idx, 0, child);
          return child;
        }
      }
      this.childNodes.push(child);
      return child;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    replaceChild(newChild, oldChild) {
      this.insertBefore(newChild, oldChild);
      this.removeChild(oldChild);
      return oldChild;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    contains(other) {
      let cur = other;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    compareDocumentPosition(other) {
      if (!other || this === other) return 0;
      if (this.contains(other)) return 20; // CONTAINED_BY + FOLLOWING
      if (other.contains(this)) return 10; // CONTAINS + PRECEDING
      const root = this.ownerDocument || this;
      const order = [];
      (function walk(n) {
        order.push(n);
        for (const c of n.childNodes) walk(c);
      })(root);
      const ia = order.indexOf(this);
      const ib = order.indexOf(other);
      if (ia === -1 || ib === -1) return 1;
      return ia < ib ? 4 : 2;
    }
    addEventListener(type, fn) {
      if (typeof fn !== 'function') return;
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      const list = this._listeners.get(type);
      if (!list.includes(fn)) list.push(fn);
    }
    removeEventListener(type, fn) {
      const list = this._listeners.get(type);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    }
    dispatchEvent(event) {
      const ev = typeof event === 'string' ? { type: event, bubbles: true, cancelable: true } : { ...event };
      if (!ev.target) ev.target = this;
      ev.defaultPrevented = !!ev.defaultPrevented;
      let stopped = false;
      let immediateStopped = false;
      ev.preventDefault = () => { ev.defaultPrevented = true; };
      ev.stopPropagation = () => { stopped = true; };
      ev.stopImmediatePropagation = () => { stopped = true; immediateStopped = true; };

      let cur = this;
      while (cur) {
        ev.currentTarget = cur;
        const listeners = cur._listeners ? cur._listeners.get(ev.type) : null;
        if (listeners && listeners.length) {
          for (const fn of listeners.slice()) {
            fn.call(cur, ev);
            if (immediateStopped) break;
          }
        }
        if (stopped || ev.bubbles === false) break;
        if (cur === this.ownerDocument && this.ownerDocument && this.ownerDocument.defaultView) {
          cur = this.ownerDocument.defaultView;
        } else {
          cur = cur.parentNode || null;
        }
      }
      return !ev.defaultPrevented;
    }
  }

  class DomText extends DomNode {
    constructor(data, ownerDocument) {
      super(3, ownerDocument);
      this.nodeName = '#text';
      this._data = String(data ?? '');
    }
    get data() { return this._data; }
    set data(v) { this._data = String(v ?? ''); }
    get nodeValue() { return this._data; }
    set nodeValue(v) { this._data = String(v ?? ''); }
    get textContent() { return this._data; }
    set textContent(v) { this._data = String(v ?? ''); }
    cloneNode() { return new DomText(this._data, this.ownerDocument); }
  }

  class DomFragment extends DomNode {
    constructor(ownerDocument) {
      super(11, ownerDocument);
      this.nodeName = '#document-fragment';
    }
    cloneNode(deep) {
      const f = new DomFragment(this.ownerDocument);
      if (deep) {
        for (const c of this.childNodes) f.appendChild(c.cloneNode(true));
      }
      return f;
    }
  }

  class DomElement extends DomNode {
    constructor(tagName, ownerDocument, namespaceURI = 'http://www.w3.org/1999/xhtml') {
      super(1, ownerDocument);
      this.tagName = tagName.toUpperCase();
      this.nodeName = this.tagName;
      this.namespaceURI = namespaceURI;
      this._attrs = new Map();
      this._value = undefined;
      this._checked = false;
      this._selected = false;
      const self = this;
      this.style = new Proxy({}, {
        get(target, prop) {
          if (prop === 'setProperty') return (k, v) => { target[k] = String(v ?? ''); };
          if (prop === 'getPropertyValue') return (k) => target[k] ?? '';
          if (prop === 'removeProperty') return (k) => { delete target[k]; };
          return target[prop] ?? '';
        },
        set(target, prop, val) {
          target[prop] = val == null ? '' : String(val);
          return true;
        },
      });
      this.dataset = new Proxy({}, {
        get(_, prop) {
          const attrName = 'data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
          return self.getAttribute(attrName) ?? undefined;
        },
        set(_, prop, val) {
          const attrName = 'data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
          self.setAttribute(attrName, String(val));
          return true;
        },
      });
      this.classList = {
        _classes() {
          const raw = self.getAttribute('class') || '';
          return raw ? raw.trim().split(/\s+/).filter(Boolean) : [];
        },
        _save(arr) {
          if (arr.length) self.setAttribute('class', arr.join(' '));
          else self.removeAttribute('class');
        },
        add(...tokens) {
          const arr = this._classes();
          for (const t of tokens) {
            if (t && !arr.includes(t)) arr.push(t);
          }
          this._save(arr);
        },
        remove(...tokens) {
          const arr = this._classes().filter((c) => !tokens.includes(c));
          this._save(arr);
        },
        toggle(token, force) {
          const has = this.contains(token);
          const want = force !== undefined ? !!force : !has;
          if (want && !has) this.add(token);
          else if (!want && has) this.remove(token);
          return want;
        },
        contains(token) {
          return this._classes().includes(token);
        },
        replace(oldCls, newCls) {
          if (!this.contains(oldCls)) return false;
          this.remove(oldCls);
          this.add(newCls);
          return true;
        },
        toString() {
          return self.getAttribute('class') || '';
        },
      };
    }
    get attributes() {
      return Array.from(this._attrs.entries()).map(([name, value]) => ({ name, value }));
    }
    hasAttribute(name) {
      return this._attrs.has(String(name).toLowerCase());
    }
    getAttribute(name) {
      const k = String(name).toLowerCase();
      return this._attrs.has(k) ? this._attrs.get(k) : null;
    }
    setAttribute(name, value) {
      this._attrs.set(String(name).toLowerCase(), String(value ?? ''));
    }
    removeAttribute(name) {
      this._attrs.delete(String(name).toLowerCase());
    }
    setAttributeNS(_, name, value) {
      this.setAttribute(name, value);
    }
    getAttributeNS(_, name) {
      return this.getAttribute(name);
    }
    removeAttributeNS(_, name) {
      this.removeAttribute(name);
    }
    get id() { return this.getAttribute('id') || ''; }
    set id(v) { this.setAttribute('id', String(v ?? '')); }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', String(v ?? '')); }
    get hidden() { return this.hasAttribute('hidden'); }
    set hidden(v) {
      if (v) this.setAttribute('hidden', '');
      else this.removeAttribute('hidden');
    }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v) {
      if (v) this.setAttribute('disabled', '');
      else this.removeAttribute('disabled');
    }
    get href() { return this.getAttribute('href') || ''; }
    set href(v) { this.setAttribute('href', String(v ?? '')); }
    get src() { return this.getAttribute('src') || ''; }
    set src(v) { this.setAttribute('src', String(v ?? '')); }
    get title() { return this.getAttribute('title') || ''; }
    set title(v) { this.setAttribute('title', String(v ?? '')); }
    get type() { return this.getAttribute('type') || ''; }
    set type(v) { this.setAttribute('type', String(v ?? '')); }
    get name() { return this.getAttribute('name') || ''; }
    set name(v) { this.setAttribute('name', String(v ?? '')); }
    get value() {
      if (this._value !== undefined) return this._value;
      if (this.tagName === 'SELECT') {
        const opt = this.options.find((o) => o.selected) || this.options[0];
        return opt ? opt.value : '';
      }
      if (this.tagName === 'OPTION') {
        return this.hasAttribute('value') ? this.getAttribute('value') : this.textContent;
      }
      return this.getAttribute('value') || '';
    }
    set value(v) {
      this._value = String(v ?? '');
      if (this.tagName === 'INPUT' || this.tagName === 'OPTION') {
        this.setAttribute('value', this._value);
      }
    }
    get options() {
      return this.querySelectorAll('option');
    }
    get selectedIndex() {
      const opts = this.options;
      const idx = opts.findIndex((o) => o.selected || o.value === this.value);
      return idx >= 0 ? idx : 0;
    }
    get selected() { return this._selected || this.hasAttribute('selected'); }
    set selected(v) {
      this._selected = !!v;
      if (v) this.setAttribute('selected', '');
      else this.removeAttribute('selected');
    }
    get checked() { return this._checked || this.hasAttribute('checked'); }
    set checked(v) {
      this._checked = !!v;
      if (v) this.setAttribute('checked', '');
      else this.removeAttribute('checked');
    }
    get textContent() {
      return this.childNodes
        .map((c) => (c.nodeType === 3 ? c.data : c.textContent))
        .join('');
    }
    set textContent(v) {
      this.childNodes = [];
      if (v !== null && v !== undefined && String(v) !== '') {
        this.appendChild(new DomText(String(v), this.ownerDocument));
      }
    }
    get innerText() { return this.textContent; }
    set innerText(v) { this.textContent = v; }
    get innerHTML() {
      return this.childNodes.map(serializeNode).join('');
    }
    set innerHTML(html) {
      this.childNodes = [];
      parseHtmlIntoParent(String(html ?? ''), this, this.ownerDocument);
    }
    get outerHTML() {
      return serializeNode(this);
    }
    matches(sel) {
      return matchComplexSelector(this, sel);
    }
    closest(sel) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (matchComplexSelector(cur, sel)) return cur;
        cur = cur.parentNode;
      }
      return null;
    }
    querySelectorAll(sel) {
      const out = [];
      (function walk(node) {
        for (const c of node.childNodes) {
          if (c.nodeType === 1) {
            if (matchComplexSelector(c, sel)) out.push(c);
            walk(c);
          }
        }
      })(this);
      return out;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    getElementsByTagName(tag) {
      const t = String(tag).toUpperCase();
      return this.querySelectorAll(t === '*' ? '*' : tag);
    }
    getElementsByClassName(cls) {
      return this.querySelectorAll('.' + String(cls).trim().split(/\s+/).join('.'));
    }
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 900, bottom: 600, width: 900, height: 600, x: 0, y: 0 };
    }
    getBBox() {
      return { x: 0, y: 0, width: 900, height: 500 };
    }
    getScreenCTM() {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) };
    }
    scrollIntoView() {}
    focus() {
      if (this.ownerDocument) this.ownerDocument.activeElement = this;
    }
    blur() {
      if (this.ownerDocument && this.ownerDocument.activeElement === this) {
        this.ownerDocument.activeElement = this.ownerDocument.body;
      }
    }
    click() {
      if (this.disabled) return;
      this.dispatchEvent({ type: 'click', bubbles: true, cancelable: true, button: 0 });
    }
    cloneNode(deep) {
      const clone = new DomElement(this.tagName, this.ownerDocument, this.namespaceURI);
      for (const [k, v] of this._attrs.entries()) clone._attrs.set(k, v);
      if (deep) {
        for (const c of this.childNodes) clone.appendChild(c.cloneNode(true));
      }
      return clone;
    }
  }

  function serializeNode(node) {
    if (node.nodeType === 3) return escapeHtmlText(node.data);
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    let attrStr = '';
    for (const [k, v] of node._attrs.entries()) {
      attrStr += v === '' ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`;
    }
    if (VOID_TAGS.has(tag)) return `<${tag}${attrStr}>`;
    return `<${tag}${attrStr}>${node.childNodes.map(serializeNode).join('')}</${tag}>`;
  }

  function parseHtmlIntoParent(html, parent, doc) {
    const cleaned = String(html)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const stack = [parent];
    const tokenRegex = /(<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^<>]*?)?\s*\/?>)|([^<]+)/g;
    let m;
    while ((m = tokenRegex.exec(cleaned)) !== null) {
      const curParent = stack[stack.length - 1];
      if (m[2] !== undefined) {
        if (m[2]) curParent.appendChild(new DomText(decodeEntities(m[2]), doc));
        continue;
      }
      const tagToken = m[1];
      if (tagToken.startsWith('</')) {
        const closeTag = tagToken.slice(2, -1).trim().toLowerCase();
        for (let k = stack.length - 1; k >= 1; k--) {
          if (stack[k].tagName.toLowerCase() === closeTag) {
            stack.length = k;
            break;
          }
        }
        continue;
      }
      const selfClosing = tagToken.endsWith('/>');
      const inner = tagToken.slice(1, selfClosing ? -2 : -1).trim();
      const spaceIdx = inner.search(/\s/);
      const tagName = (spaceIdx === -1 ? inner : inner.slice(0, spaceIdx)).toLowerCase();
      const rawAttrs = spaceIdx === -1 ? '' : inner.slice(spaceIdx + 1);
      const ns = (tagName === 'svg' || curParent.namespaceURI === 'http://www.w3.org/2000/svg')
        ? 'http://www.w3.org/2000/svg'
        : 'http://www.w3.org/1999/xhtml';
      const el = new DomElement(tagName, doc, ns);
      const attrs = parseAttributes(rawAttrs);
      for (const [k, v] of attrs.entries()) el.setAttribute(k, v);
      curParent.appendChild(el);
      if (!selfClosing && !VOID_TAGS.has(tagName)) {
        stack.push(el);
      }
    }
  }

  const doc = new DomNode(9, null);
  doc.ownerDocument = doc;
  doc.nodeName = '#document';
  doc.readyState = 'complete';
  doc.visibilityState = 'visible';
  doc.hidden = false;
  doc.cookie = '';
  doc.title = '';
  doc.defaultView = null;

  const htmlEl = new DomElement('html', doc);
  const headEl = new DomElement('head', doc);
  const bodyEl = new DomElement('body', doc);
  htmlEl.appendChild(headEl);
  htmlEl.appendChild(bodyEl);
  doc.appendChild(htmlEl);
  doc.documentElement = htmlEl;
  doc.head = headEl;
  doc.body = bodyEl;
  doc.activeElement = bodyEl;

  const headMatch = htmlString.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) parseHtmlIntoParent(headMatch[1], headEl, doc);
  const bodyMatch = htmlString.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) parseHtmlIntoParent(bodyMatch[1], bodyEl, doc);

  doc.createElement = (tag) => new DomElement(tag, doc);
  doc.createElementNS = (ns, tag) => new DomElement(tag, doc, ns);
  doc.createTextNode = (txt) => new DomText(txt, doc);
  doc.createDocumentFragment = () => new DomFragment(doc);
  doc.querySelectorAll = (sel) => htmlEl.querySelectorAll(sel);
  doc.querySelector = (sel) => htmlEl.querySelector(sel);
  doc.getElementById = (id) => {
    const s = String(id || '');
    let found = null;
    (function walk(node) {
      if (found) return;
      for (const c of node.childNodes) {
        if (c.nodeType === 1) {
          if (c.getAttribute('id') === s) {
            found = c;
            return;
          }
          walk(c);
          if (found) return;
        }
      }
    })(htmlEl);
    return found;
  };
  doc.getElementsByTagName = (tag) => htmlEl.getElementsByTagName(tag);
  doc.getElementsByClassName = (cls) => htmlEl.getElementsByClassName(cls);

  return { document: doc, DomElement, DomNode };
}

function createMemoryStorage(backingMap = new Map()) {
  return {
    get length() { return backingMap.size; },
    key(idx) {
      const keys = Array.from(backingMap.keys());
      return idx >= 0 && idx < keys.length ? keys[idx] : null;
    },
    getItem(k) {
      const key = String(k);
      return backingMap.has(key) ? backingMap.get(key) : null;
    },
    setItem(k, v) {
      backingMap.set(String(k), String(v));
    },
    removeItem(k) {
      backingMap.delete(String(k));
    },
    clear() {
      backingMap.clear();
    },
    _dump() {
      return Object.fromEntries(backingMap.entries());
    },
  };
}

// ============================================================================
// 3. FRONTEND VM RUNNER WIRED TO REAL `_worker.js`
// ============================================================================
async function bootFrontendApp({
  url = 'https://www.rodandoomundo.com.br/',
  storageMap = new Map(),
  sessionMap = new Map(),
  mockUpstream = null,
  fetchHandler = null,
  innerWidth = 1280,
  innerHeight = 800,
  initialClockOffsetMs = 0,
} = {}) {
  const { document, DomElement, DomNode } = createDomFromHtml(INDEX_HTML);
  const localStorage = createMemoryStorage(storageMap);
  const sessionStorage = createMemoryStorage(sessionMap);

  let currentUrl = new URL(url, 'https://www.rodandoomundo.com.br');
  let clockOffsetMs = initialClockOffsetMs;
  const pageErrors = [];
  const consoleErrors = [];
  const fetchCalls = [];
  const historyStack = [{ state: null, url: currentUrl.pathname + currentUrl.search + currentUrl.hash }];
  let historyIdx = 0;

  const RealDate = Date;
  function FakeDate(...args) {
    if (!new.target) {
      return new RealDate(RealDate.now() + clockOffsetMs).toString();
    }
    if (args.length === 0) {
      return new RealDate(RealDate.now() + clockOffsetMs);
    }
    return new RealDate(...args);
  }
  FakeDate.now = () => RealDate.now() + clockOffsetMs;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.prototype = RealDate.prototype;

  const locationObj = {
    get href() { return currentUrl.href; },
    set href(v) { currentUrl = new URL(String(v), currentUrl.origin); },
    get origin() { return currentUrl.origin; },
    get protocol() { return currentUrl.protocol; },
    get host() { return currentUrl.host; },
    get hostname() { return currentUrl.hostname; },
    get port() { return currentUrl.port; },
    get pathname() { return currentUrl.pathname; },
    set pathname(v) { currentUrl.pathname = String(v); },
    get search() { return currentUrl.search; },
    set search(v) { currentUrl.search = String(v); },
    get hash() { return currentUrl.hash; },
    set hash(v) { currentUrl.hash = String(v); },
    assign(v) { currentUrl = new URL(String(v), currentUrl.origin); },
    replace(v) { currentUrl = new URL(String(v), currentUrl.origin); },
  };

  const historyObj = {
    get state() { return historyStack[historyIdx] ? historyStack[historyIdx].state : null; },
    get length() { return historyStack.length; },
    pushState(st, _title, targetUrl) {
      if (targetUrl !== undefined && targetUrl !== null) {
        currentUrl = new URL(String(targetUrl), currentUrl.origin);
      }
      historyStack.splice(historyIdx + 1);
      historyStack.push({ state: st ?? null, url: currentUrl.pathname + currentUrl.search + currentUrl.hash });
      historyIdx = historyStack.length - 1;
    },
    replaceState(st, _title, targetUrl) {
      if (targetUrl !== undefined && targetUrl !== null) {
        currentUrl = new URL(String(targetUrl), currentUrl.origin);
      }
      historyStack[historyIdx] = { state: st ?? null, url: currentUrl.pathname + currentUrl.search + currentUrl.hash };
    },
    back() {
      if (historyIdx > 0) {
        historyIdx--;
        currentUrl = new URL(historyStack[historyIdx].url, currentUrl.origin);
        sandbox.dispatchEvent({ type: 'popstate', bubbles: false, state: historyStack[historyIdx].state });
      }
    },
  };

  let nextTimerId = 1;
  const timeouts = new Map();
  const intervals = new Map();

  function trackedSetTimeout(fn, ms = 0, ...args) {
    const id = nextTimerId++;
    const delay = Number(ms) || 0;
    const rec = { id, fn, ms: delay, args, cleared: false, handle: null };
    timeouts.set(id, rec);
    if (delay <= 200) {
      rec.handle = setTimeout(() => {
        if (rec.cleared) return;
        timeouts.delete(id);
        try {
          fn(...args);
        } catch (err) {
          pageErrors.push(err);
        }
      }, delay);
      if (typeof rec.handle.unref === 'function') rec.handle.unref();
    }
    return id;
  }

  function trackedClearTimeout(id) {
    const rec = timeouts.get(id);
    if (rec) {
      rec.cleared = true;
      if (rec.handle) clearTimeout(rec.handle);
      timeouts.delete(id);
    }
  }

  function trackedSetInterval(fn, ms = 0, ...args) {
    const id = nextTimerId++;
    intervals.set(id, { id, fn, ms: Number(ms) || 0, args, cleared: false });
    return id;
  }

  function trackedClearInterval(id) {
    const rec = intervals.get(id);
    if (rec) {
      rec.cleared = true;
      intervals.delete(id);
    }
  }

  const windowListeners = new Map();
  const sandbox = {
    innerWidth,
    innerHeight,
    scrollY: 0,
    pageYOffset: 0,
    location: locationObj,
    history: historyObj,
    localStorage,
    sessionStorage,
    document,
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NodeE2E/26',
      platform: 'Win32',
      language: 'pt-BR',
      languages: ['pt-BR', 'pt', 'en'],
    },
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    getSelection: () => ({ rangeCount: 0, isCollapsed: true, anchorNode: null }),
    scrollTo() {},
    requestAnimationFrame: (cb) => trackedSetTimeout(() => cb(FakeDate.now()), 0),
    cancelAnimationFrame: (id) => trackedClearTimeout(id),
    addEventListener(type, fn) {
      if (typeof fn !== 'function') return;
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = windowListeners.get(type);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    },
    dispatchEvent(ev) {
      const list = windowListeners.get(ev.type) || [];
      for (const fn of list.slice()) {
        try {
          fn.call(sandbox, ev);
        } catch (err) {
          pageErrors.push(err);
        }
      }
      return true;
    },
    HTMLElement: DomElement,
    Element: DomElement,
    SVGElement: DomElement,
    Node: DomNode,
    Date: FakeDate,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    AbortController,
    Intl,
    setTimeout: trackedSetTimeout,
    clearTimeout: trackedClearTimeout,
    setInterval: trackedSetInterval,
    clearInterval: trackedClearInterval,
    console: {
      log: () => {},
      info: () => {},
      warn: () => {},
      error: (...args) => { consoleErrors.push(args.map(String).join(' ')); },
    },
  };
  document.defaultView = sandbox;

  let vmContext = null;
  const inFlightFetches = new Set();

  async function dispatchFetch(input, init = {}) {
    const rawUrl = typeof input === 'string' ? input : input.url;
    const resolvedUrl = new URL(rawUrl, currentUrl.origin).toString();
    const method = String((init && init.method) || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    let parsedBody = null;
    if (init && init.body) {
      try { parsedBody = JSON.parse(String(init.body)); } catch { parsedBody = String(init.body); }
    }
    fetchCalls.push({
      url: rawUrl,
      resolvedUrl,
      method,
      cache: init && init.cache ? init.cache : undefined,
      headers: init && init.headers ? { ...init.headers } : {},
      body: parsedBody,
      ts: FakeDate.now(),
    });

    let realRes;
    if (typeof fetchHandler === 'function') {
      realRes = await fetchHandler(resolvedUrl, init, rawUrl);
    } else if (mockUpstream) {
      mockUpstream.activate();
      const req = new Request(resolvedUrl, init);
      realRes = await worker.fetch(req, mockUpstream.env);
    } else {
      realRes = new Response('Not Mocked', { status: 502 });
    }

      const bodyText = await realRes.text();
    const resHeaders = new Headers(realRes.headers);
    return {
      ok: realRes.ok,
      status: realRes.status,
      statusText: realRes.statusText,
      headers: resHeaders,
      url: resolvedUrl,
      async text() {
        return bodyText;
      },
      async json() {
        return vm.runInContext('JSON.parse(' + JSON.stringify(bodyText) + ')', vmContext);
      },
    };
  }

  function trackedFetch(input, init) {
    const p = dispatchFetch(input, init);
    inFlightFetches.add(p);
    p.finally(() => inFlightFetches.delete(p));
    return p;
  }

  sandbox.fetch = trackedFetch;
  vmContext = vm.createContext(sandbox);
  vmContext.window = vmContext;
  vmContext.self = vmContext;
  vmContext.global = vmContext;
  vmContext.globalThis = vmContext;

  try {
    PRECOMPILED_SCRIPTS.d3.runInContext(vmContext);
    PRECOMPILED_SCRIPTS.topojson.runInContext(vmContext);
    PRECOMPILED_SCRIPTS.world.runInContext(vmContext);
    PRECOMPILED_SCRIPTS.data.runInContext(vmContext);
    PRECOMPILED_SCRIPTS.editorial.runInContext(vmContext);
    PRECOMPILED_SCRIPTS.app.runInContext(vmContext);
  } catch (err) {
    pageErrors.push(err);
  }

  async function settle(extraTicks = 4) {
    for (let round = 0; round < 10; round++) {
      if (inFlightFetches.size > 0) {
        await Promise.allSettled(Array.from(inFlightFetches));
      }
      for (let t = 0; t < extraTicks; t++) {
        await new Promise((r) => setImmediate(r));
      }
      if (inFlightFetches.size === 0) break;
    }
  }

  await settle();

  return {
    window: vmContext,
    document,
    location: locationObj,
    history: historyObj,
    localStorage,
    sessionStorage,
    fetchCalls,
    pageErrors,
    consoleErrors,
    settle,
    advanceClock(ms) {
      clockOffsetMs += ms;
    },
    setClockOffset(ms) {
      clockOffsetMs = ms;
    },
    async fireIntervals(minMs = 0, maxMs = Infinity) {
      for (const rec of Array.from(intervals.values())) {
        if (!rec.cleared && rec.ms >= minMs && rec.ms <= maxMs) {
          try {
            rec.fn(...rec.args);
          } catch (err) {
            pageErrors.push(err);
          }
        }
      }
      await settle();
    },
    async fireTimeouts(maxMs = Infinity) {
      for (const rec of Array.from(timeouts.values())) {
        if (!rec.cleared && rec.ms <= maxMs) {
          trackedClearTimeout(rec.id);
          try {
            rec.fn(...rec.args);
          } catch (err) {
            pageErrors.push(err);
          }
        }
      }
      await settle();
    },
    async triggerVisibilityVisible() {
      document.hidden = true;
      document.visibilityState = 'hidden';
      document.dispatchEvent({ type: 'visibilitychange', bubbles: false });
      document.hidden = false;
      document.visibilityState = 'visible';
      document.dispatchEvent({ type: 'visibilitychange', bubbles: false });
      await settle();
    },
    cleanup() {
      for (const id of Array.from(timeouts.keys())) trackedClearTimeout(id);
      for (const id of Array.from(intervals.keys())) trackedClearInterval(id);
    },
  };
}

function isoMinutesAgo(mins, baseMs = Date.now()) {
  return new Date(baseMs - mins * 60_000).toISOString();
}

function isoHoursAgo(hours, baseMs = Date.now()) {
  return new Date(baseMs - hours * 3_600_000).toISOString();
}

function rfc2822HoursAgo(hours, baseMs = Date.now()) {
  return new Date(baseMs - hours * 3_600_000).toUTCString();
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

// ============================================================================
// TIER 1 — FEATURE COVERAGE (F1–F11, >= 5 Assertions / Cases per Feature)
// ============================================================================
describe('Tier 1 — Edge & Frontend Feature Coverage (F1–F11)', () => {
  test('T1-F1: Notícias Quentes / Pulsando Agora displays live titles, avoids curatedPulsingDefaults masking, and cleans stale countries', async () => {
    const now = Date.now();
    const storageMap = new Map([
      ['rom_cache_vitrine_ia', JSON.stringify({
        ts: now - 3_600_000,
        updatedAt: isoHoursAgo(1, now),
        temas_ativos: [
          {
            slug: 'stale-cache-tema',
            titulo_tema: 'STALE CACHE BRASIL OVERWRITE',
            categoria_primaria: 'Politica',
            paises_envolvidos: ['BR'],
            data_publicacao: isoHoursAgo(1, now),
          },
        ],
      })],
    ]);

    const upstream = createMockUpstream({
      noticiasQuentesApi: {
        ok: true,
        atualizado_em: 'Atualizado agora',
        updatedAt: new Date(now).toISOString(),
        noticias_quentes: [
          {
            slug: 'br-live-breaking',
            titulo_curto: 'BRASIL LIVE BREAKING 2026',
            resumo_pulso: 'Nova medida econômica anunciada em Brasília.',
            categoria: 'economia',
            paises_envolvidos: ['BR'],
            urgencia_score: 90,
            data_publicacao: isoMinutesAgo(3, now),
            updated_at: isoMinutesAgo(3, now),
            veiculos_origem: ['Agência Brasil'],
          },
          {
            slug: 'jp-live-breaking',
            titulo_curto: 'JAPÃO LIVE BREAKING 2026',
            resumo_pulso: 'Banco do Japão anuncia decisão.',
            categoria: 'economia',
            paises_envolvidos: ['JP'],
            urgencia_score: 85,
            data_publicacao: isoMinutesAgo(5, now),
            updated_at: isoMinutesAgo(5, now),
          },
          {
            slug: 'de-live-breaking',
            titulo_curto: 'ALEMANHA LIVE BREAKING 2026',
            resumo_pulso: 'Berlim aprova orçamento industrial.',
            categoria: 'geopolitica',
            paises_envolvidos: ['DE'],
            urgencia_score: 80,
            data_publicacao: isoMinutesAgo(8, now),
            updated_at: isoMinutesAgo(8, now),
          },
        ],
        paises_em_alta: [
          { a2: 'BR', countryName: 'Brasil', title: 'BRASIL LIVE BREAKING 2026', category: 'Economia', url: '/radar' },
          { a2: 'JP', countryName: 'Japão', title: 'JAPÃO LIVE BREAKING 2026', category: 'Economia', url: '/radar' },
          { a2: 'DE', countryName: 'Alemanha', title: 'ALEMANHA LIVE BREAKING 2026', category: 'Radar', url: '/radar' },
        ],
      },
    });

    const app = await bootFrontendApp({ url: 'https://www.rodandoomundo.com.br/', storageMap, mockUpstream: upstream });
    try {
      assert.equal(app.pageErrors.length, 0, `Unexpected boot pageErrors: ${app.pageErrors.map((e) => e.message).join('; ')}`);

      // 1. Fetch URL includes _t=
      const hotFetch = app.fetchCalls.find((c) => c.url.includes('/api/noticias-quentes'));
      assert.ok(hotFetch, 'Initial boot must fetch /api/noticias-quentes');
      assert.ok(hotFetch.url.includes('_t='), 'Fetch to /api/noticias-quentes must include _t=');

      // 2. #map-hot-news-pill visible with live country names
      const pill = app.document.getElementById('map-hot-news-pill');
      const pillText = app.document.getElementById('map-hot-news-text');
      assert.equal(pill.hidden, false, '#map-hot-news-pill must be visible');
      assert.ok(pillText.textContent.includes('Brasil'), 'Pill must show Brasil');
      assert.ok(pillText.textContent.includes('Japão'), 'Pill must show Japão');

      // 3. Live BR title rendered WITHOUT curatedPulsingDefaults.shortTitle masking
      const brCardTitle = app.document.querySelector('#pulsando-agora-track .pulsando-card[data-country-iso="BR"] .pulsando-card-title');
      assert.ok(brCardTitle, 'BR card must be rendered in #pulsando-agora-track');
      assert.equal(
        brCardTitle.textContent.trim(),
        'BRASIL LIVE BREAKING 2026',
        'Live BR title must not be overwritten by curatedPulsingDefaults.shortTitle ("Meta fiscal e pacote de corte de gastos")'
      );

      // 4. Stale rom_cache_vitrine_ia did not mask live BR title
      assert.ok(!app.document.getElementById('pulsando-agora-track').textContent.includes('STALE CACHE BRASIL OVERWRITE'));

      // 5. Cycle 2 returns ONLY France (FR) -> BR/JP/DE cleared from v2HotNewsByCountry UI
      upstream.state.noticiasQuentesApi = {
        ok: true,
        atualizado_em: 'Atualizado agora',
        updatedAt: new Date(now + 120_000).toISOString(),
        noticias_quentes: [
          {
            slug: 'fr-cycle-2',
            titulo_curto: 'FRANÇA CICLO 2 BREAKING',
            resumo_pulso: 'Paris anuncia pacote energético.',
            categoria: 'geopolitica',
            paises_envolvidos: ['FR'],
            urgencia_score: 92,
            data_publicacao: isoMinutesAgo(1, now + 120_000),
            updated_at: isoMinutesAgo(1, now + 120_000),
          },
        ],
        paises_em_alta: [
          { a2: 'FR', countryName: 'França', title: 'FRANÇA CICLO 2 BREAKING', category: 'Radar', url: '/radar' },
        ],
      };

      await app.fireIntervals(300_000, 400_000);
      const frCardTitle = app.document.querySelector('#pulsando-agora-track .pulsando-card[data-country-iso="FR"] .pulsando-card-title');
      assert.ok(frCardTitle, 'FR card must appear on Cycle 2');
      assert.equal(frCardTitle.textContent.trim(), 'FRANÇA CICLO 2 BREAKING');
      const brCardAfter = app.document.querySelector('#pulsando-agora-track .pulsando-card[data-country-iso="BR"] .pulsando-card-title');
      assert.ok(
        !brCardAfter || brCardAfter.textContent.trim() !== 'BRASIL LIVE BREAKING 2026',
        'Previous Cycle-1 BR live title must be evicted from v2HotNewsByCountry when Cycle 2 only has FR'
      );
    } finally {
      app.cleanup();
    }
  });

  test('T1-F2: Radar Editorial renders #btn-atualizar-radar, parses fallback date fields, and protects radarFeedCache during auto-refresh', async () => {
    const now = Date.now();
    const upstream = createMockUpstream({
      vitrineIa: {
        updatedAt: isoMinutesAgo(2, now),
        temas_ativos: [
          {
            slug: 'radar-fresh-1',
            titulo_tema: 'RADAR FRESH ITEM 1',
            categoria_primaria: 'Geopolitica_Radar',
            gatilho_vitrine: 'Resumo radar 1',
            sintese_nerd: 'Análise radar 1',
            data_publicacao: isoMinutesAgo(2, now),
            urgencia_score: 88,
          },
        ],
      },
      feedOutput: [
        {
          id: 'feed-updated-only',
          titulo: 'RADAR UPDATED_AT ONLY ITEM',
          resumo: 'Resumo updated_at',
          analise: 'Análise updated_at',
          categoria: 'economia',
          fonte_nome: 'Canal Economia',
          fonte_url: 'https://economia.example/1',
          updated_at: isoMinutesAgo(10, now),
          urgencia_score: 75,
        },
        {
          id: 'feed-publicado-only',
          titulo: 'RADAR PUBLICADO_EM ONLY ITEM',
          resumo: 'Resumo publicado_em',
          analise: 'Análise publicado_em',
          categoria: 'politica',
          fonte_nome: 'Canal Política',
          fonte_url: 'https://politica.example/2',
          publicado_em: isoMinutesAgo(20, now),
          urgencia_score: 70,
        },
      ],
      assetFeedOutput: [
        {
          id: 'asset-stale-1',
          titulo: 'STALE FEED_OUTPUT ASSET 72H OLD',
          resumo: 'Velho asset',
          analise: 'Velho asset',
          categoria: 'geopolitica',
          fonte_nome: 'Fonte Antiga',
          fonte_url: 'https://antiga.example/old',
          data_publicacao: isoHoursAgo(72, now),
        },
      ],
    });

    const app = await bootFrontendApp({ url: 'https://www.rodandoomundo.com.br/radar', mockUpstream: upstream });
    try {
      // 1. #btn-atualizar-radar exists in DOM
      const btnAtualizar = app.document.getElementById('btn-atualizar-radar');
      assert.ok(btnAtualizar, '#btn-atualizar-radar button must exist in #radar-editorial-view');

      // 2. Initial load fetches /api/radar?_t= with cache: 'no-store' and renders newest first
      const radarFetch1 = app.fetchCalls.find((c) => c.url.includes('/api/radar'));
      assert.ok(radarFetch1 && radarFetch1.url.includes('_t='), 'Initial /radar load must call /api/radar?_t=');
      assert.equal(radarFetch1.cache, 'no-store', 'Initial /api/radar fetch must pass cache: no-store');

      const cards = app.document.querySelectorAll('#radar-cards-list .radar-card');
      assert.ok(cards.length >= 2, 'Radar cards must be rendered');
      assert.equal(cards[0].querySelector('.radar-card-title').textContent.trim(), 'RADAR FRESH ITEM 1');

      // 3. Items with only updated_at or publicado_em render <time class="radar-pub-date">
      const times = app.document.querySelectorAll('#radar-cards-list time.radar-pub-date');
      assert.equal(times.length, cards.length, 'Every radar card with data_publicacao, updated_at, or publicado_em must render <time class="radar-pub-date">');

      // 4. Click #btn-atualizar-radar -> calls /api/radar?refresh=1&_t= with cache: 'no-store'
      app.fetchCalls.length = 0;
      upstream.state.vitrineIa = {
        updatedAt: new Date(now + 60_000).toISOString(),
        temas_ativos: [
          {
            slug: 'radar-manual-refresh',
            titulo_tema: 'RADAR MANUAL REFRESH ITEM',
            categoria_primaria: 'Geopolitica_Radar',
            gatilho_vitrine: 'Novo pulso',
            data_publicacao: isoMinutesAgo(1, now + 60_000),
            urgencia_score: 90,
          },
        ],
      };
      btnAtualizar.click();
      await app.settle();
      const manualFetch = app.fetchCalls.find((c) => c.url.includes('/api/radar'));
      assert.ok(manualFetch && manualFetch.url.includes('refresh=1') && manualFetch.url.includes('_t='), 'Manual refresh must call /api/radar?refresh=1&_t=');
      assert.equal(manualFetch.cache, 'no-store');
      assert.equal(app.document.querySelector('#radar-cards-list .radar-card .radar-card-title').textContent.trim(), 'RADAR MANUAL REFRESH ITEM');

      // 5. During auto-refresh when /api/radar fails and /data/feed_output.json has 72h-old items,
      // radarFeedCache MUST NOT be overwritten with stale asset items!
      const appFailure = await bootFrontendApp({
        url: 'https://www.rodandoomundo.com.br/radar',
        fetchHandler: async (resolvedUrl) => {
          const u = new URL(resolvedUrl);
          if (u.pathname === '/api/radar') {
            if (appFailureCallCount === 0) {
              appFailureCallCount++;
              return createJsonResponse({
                ok: true,
                atualizado_em: 'Atualizado agora',
                items: [
                  {
                    id: 'live-radar-before-502',
                    titulo: 'RADAR LIVE FRESHER THAN ASSET',
                    resumo: 'Fresco',
                    analise: 'Fresco',
                    categoria: 'geopolitica',
                    fonte_nome: 'Pulso V2',
                    fonte_url: 'https://live.example/1',
                    data_publicacao: isoMinutesAgo(2, now),
                    origem_v2: true,
                  },
                ],
              });
            }
            return new Response('Bad Gateway', { status: 502 });
          }
          if (u.pathname === '/data/feed_output.json') {
            return createJsonResponse([
              {
                id: 'stale-disk-fallback',
                titulo: 'STALE 72H FEED_OUTPUT FALLBACK',
                resumo: 'Antigo',
                analise: 'Antigo',
                categoria: 'geopolitica',
                fonte_nome: 'Fonte Antiga',
                fonte_url: 'https://stale.example/old',
                data_publicacao: isoHoursAgo(72, now),
              },
            ]);
          }
          return worker.fetch(new Request(resolvedUrl), upstream.env);
        },
      });
      var appFailureCallCount;
      appFailure.cleanup();
    } finally {
      app.cleanup();
    }
  });

  test('T1-F2.5: Radar auto-refresh 502 never overwrites fresher radarFeedCache with older /data/feed_output.json', async () => {
    const now = Date.now();
    const upstream = createMockUpstream();
    let radarCalls = 0;
    const app = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/radar',
      fetchHandler: async (resolvedUrl, init) => {
        const u = new URL(resolvedUrl);
        if (u.pathname === '/api/radar') {
          radarCalls++;
          if (radarCalls === 1) {
            return createJsonResponse({
              ok: true,
              atualizado_em: 'Atualizado agora',
              items: [
                {
                  id: 'fresh-radar-1',
                  titulo: 'RADAR FRESCO PRESERVADO',
                  resumo: 'Resumo fresco',
                  analise: 'Análise fresca',
                  categoria: 'geopolitica',
                  fonte_nome: 'Pulso V2',
                  fonte_url: 'https://live.example/fresh',
                  data_publicacao: isoMinutesAgo(2, now),
                  origem_v2: true,
                },
              ],
            });
          }
          return new Response('Bad Gateway', { status: 502 });
        }
        if (u.pathname === '/data/feed_output.json') {
          return createJsonResponse([
            {
              id: 'stale-feed-json',
              titulo: 'FEED_OUTPUT ANTIGO SOBRESCRITO',
              resumo: 'Velho',
              analise: 'Velho',
              categoria: 'geopolitica',
              fonte_nome: 'Fonte Velha',
              fonte_url: 'https://stale.example/old',
              data_publicacao: isoHoursAgo(72, now),
            },
          ]);
        }
        upstream.activate();
        return worker.fetch(new Request(resolvedUrl, init), upstream.env);
      },
    });
    try {
      assert.equal(
        app.document.querySelector('#radar-cards-list .radar-card .radar-card-title').textContent.trim(),
        'RADAR FRESCO PRESERVADO'
      );
      await app.fireIntervals(300_000, 360_000);
      const listText = app.document.getElementById('radar-cards-list').textContent;
      assert.ok(listText.includes('RADAR FRESCO PRESERVADO'), 'Fresher radar cards must remain rendered after 502 auto-refresh');
      assert.ok(!listText.includes('FEED_OUTPUT ANTIGO SOBRESCRITO'), 'Older /data/feed_output.json must NOT overwrite fresher radarFeedCache');
    } finally {
      app.cleanup();
    }
  });

  test('T1-F3: Curadoria / Vitrine IA enforces TTL, sends ?_t= & no-store, exposes refresh, and sorts newest-first', async () => {
    const now = Date.now();
    const expiredStorage = new Map([
      ['rom_cache_vitrine_ia', JSON.stringify({
        ts: now - 10 * 60_000, // expired (10 min > 2 min TTL)
        updatedAt: isoMinutesAgo(10, now),
        temas_ativos: [
          {
            slug: 'expired-vitrine-item',
            titulo_tema: 'EXPIRED VITRINE CACHE ITEM',
            categoria_primaria: 'Economia',
            relevancia_score: 99,
            data_publicacao: isoMinutesAgo(10, now),
          },
        ],
      })],
    ]);

    const upstream = createMockUpstream({
      vitrineEmAltaApi: {
        ok: true,
        updatedAt: new Date(now).toISOString(),
        temas_ativos: [
          {
            slug: 'vitrine-older-high-score',
            titulo_tema: 'VITRINE OLDER HIGH SCORE',
            categoria_primaria: 'Economia',
            relevancia_score: 99,
            data_publicacao: isoHoursAgo(8, now),
            palavras_chave_busca: ['juros'],
          },
          {
            slug: 'vitrine-newest-item',
            titulo_tema: 'VITRINE NEWEST ITEM',
            categoria_primaria: 'Economia',
            relevancia_score: 75,
            data_publicacao: isoMinutesAgo(4, now),
            palavras_chave_busca: ['cambio'],
          },
        ],
      },
    });

    const app = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/radar#curadoria',
      storageMap: expiredStorage,
      mockUpstream: upstream,
    });
    try {
      // 1. Initial fetch sends ?_t= and cache: 'no-store'
      const vFetch = app.fetchCalls.find((c) => c.url.includes('/api/vitrine-em-alta'));
      assert.ok(vFetch, 'Must fetch /api/vitrine-em-alta');
      assert.ok(vFetch.url.includes('_t='), 'Initial /api/vitrine-em-alta fetch must include _t=');
      assert.equal(vFetch.cache, 'no-store', 'Initial /api/vitrine-em-alta fetch must use cache: no-store');

      // 2. Expired rom_cache_vitrine_ia was bypassed and live cards render newest-first
      const titles = app.document.querySelectorAll('#vitrine-ia-grid .vitrine-card-title').map((el) => el.textContent.trim());
      assert.ok(!titles.includes('EXPIRED VITRINE CACHE ITEM'), 'Expired cache must not overwrite/mask live fetch');
      assert.equal(titles[0], 'VITRINE NEWEST ITEM', 'Vitrine IA cards must be ordered newest-first');

      // 3. Advance clock past TTL (10 minutes), verify category chip does NOT serve expired vitrineIaMemoryTemas
      app.advanceClock(10 * 60_000);
      app.fetchCalls.length = 0;
      upstream.state.vitrineEmAltaApi = {
        ok: true,
        updatedAt: new Date(now + 10 * 60_000).toISOString(),
        temas_ativos: [
          {
            slug: 'vitrine-after-ttl',
            titulo_tema: 'VITRINE AFTER TTL REFRESH',
            categoria_primaria: 'Economia',
            relevancia_score: 90,
            data_publicacao: isoMinutesAgo(1, now + 10 * 60_000),
          },
        ],
      };

      const ecoChip = app.document.querySelector('#vitrine-ia-chips .vitrine-ia-chip[data-cat="Economia"]');
      assert.ok(ecoChip, 'Economia chip must exist');
      ecoChip.click();
      await app.settle();
      const postTtlFetch = app.fetchCalls.find((c) => c.url.includes('/api/vitrine-em-alta'));
      assert.ok(postTtlFetch, 'Category chip click after TTL expiration must re-fetch /api/vitrine-em-alta rather than serving expired memory cache');

      // 4. Refresh button exists in #vitrine-ia and triggers refresh=1&_t=
      const refreshBtn = app.document.getElementById('btn-refresh-vitrine-ia') ||
        app.document.querySelector('#vitrine-ia [data-action="refresh-vitrine"]');
      assert.ok(refreshBtn, '#btn-refresh-vitrine-ia refresh button must exist in #vitrine-ia');
      app.fetchCalls.length = 0;
      refreshBtn.click();
      await app.settle();
      const btnFetch = app.fetchCalls.find((c) => c.url.includes('/api/vitrine-em-alta'));
      assert.ok(btnFetch && btnFetch.url.includes('_t='), 'Clicking Vitrine refresh button must fetch /api/vitrine-em-alta?_t=');
    } finally {
      app.cleanup();
    }
  });

  test('T1-F4: Resumo do Dia revalidates despite rom_resumo_date === today, syncs checkHotNewsOnMap(true), and exposes refresh control', async () => {
    const now = Date.now();
    const todayStr = new Date(now).toISOString().slice(0, 10);
    const storageMap = new Map([
      ['rom_resumo_date', todayStr],
      ['rom_resumo_items', JSON.stringify([
        { relevancia: 1, categoria: 'Brasil', titulo: 'STALE TODAY LOCKED RESUMO 1', resumo: 'Antigo', fonte: 'Fonte', url: 'https://old.example/1', codigoPais: 'BR' },
        { relevancia: 2, categoria: 'Mundo', titulo: 'STALE TODAY LOCKED RESUMO 2', resumo: 'Antigo', fonte: 'Fonte', url: 'https://old.example/2', codigoPais: 'US' },
        { relevancia: 3, categoria: 'Economia', titulo: 'STALE TODAY LOCKED RESUMO 3', resumo: 'Antigo', fonte: 'Fonte', url: 'https://old.example/3', codigoPais: 'BR' },
      ])],
    ]);

    const cycle1Items = [
      { relevancia: 1, categoria: 'Geopolítica', titulo: 'LIVE RESUMO CYCLE 1 HEADLINE', resumo: 'Resumo live 1', fonte: 'BBC', url: 'https://bbc.example/1', codigoPais: 'GB', publicadoEm: isoMinutesAgo(5, now) },
      { relevancia: 2, categoria: 'Economia', titulo: 'LIVE RESUMO CYCLE 1 B', resumo: 'Resumo live 2', fonte: 'G1', url: 'https://g1.example/2', codigoPais: 'BR', publicadoEm: isoMinutesAgo(10, now) },
      { relevancia: 3, categoria: 'Política', titulo: 'LIVE RESUMO CYCLE 1 C', resumo: 'Resumo live 3', fonte: 'Agência Brasil', url: 'https://agbr.example/3', codigoPais: 'BR', publicadoEm: isoMinutesAgo(15, now) },
      { relevancia: 4, categoria: 'Mundo', titulo: 'LIVE RESUMO CYCLE 1 D', resumo: 'Resumo live 4', fonte: 'AP', url: 'https://ap.example/4', codigoPais: 'US', publicadoEm: isoMinutesAgo(20, now) },
      { relevancia: 5, categoria: 'Cultura', titulo: 'LIVE RESUMO CYCLE 1 E', resumo: 'Resumo live 5', fonte: 'Folha', url: 'https://folha.example/5', codigoPais: 'BR', publicadoEm: isoMinutesAgo(25, now) },
    ];

    const upstream = createMockUpstream();
    let resumoPhase = 1;
    const app = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/',
      storageMap,
      fetchHandler: async (resolvedUrl, init) => {
        const u = new URL(resolvedUrl);
        if (u.pathname === '/api/resumo') {
          const items = resumoPhase === 1
            ? cycle1Items
            : cycle1Items.map((it, idx) => idx === 0 ? { ...it, titulo: 'LIVE RESUMO CYCLE 2 SYNCED', publicadoEm: isoMinutesAgo(1, now + 360_000) } : it);
          return createJsonResponse({ dataEdicao: todayStr, atualizadoEm: new Date(now).toISOString(), items });
        }
        upstream.activate();
        return worker.fetch(new Request(resolvedUrl, init), upstream.env);
      },
    });
    try {
      // 1 & 2. Even with rom_resumo_date === today, initial load MUST fetch /api/resumo?_t= with cache: 'no-store'
      const resumoFetch1 = app.fetchCalls.find((c) => c.url.includes('/api/resumo'));
      assert.ok(resumoFetch1, 'Initial load must revalidate /api/resumo even when rom_resumo_date === today');
      assert.ok(resumoFetch1.url.includes('_t='), '/api/resumo fetch must include _t=');
      assert.equal(resumoFetch1.cache, 'no-store', '/api/resumo fetch must use cache: no-store');

      // 3. DOM renders Cycle-1 live items instead of stale locked items
      const resumoText = app.document.getElementById('resumo-do-dia').textContent;
      assert.ok(resumoText.includes('LIVE RESUMO CYCLE 1 HEADLINE'), 'Resumo DOM must show fresh API headline');
      assert.ok(!resumoText.includes('STALE TODAY LOCKED RESUMO 1'), 'Stale cached resumo must be replaced');

      // 4. Refresh control exists in #resumo-do-dia and triggers ?refresh=1&_t=
      const refreshResumoBtn = app.document.getElementById('btn-refresh-resumo-dia') ||
        app.document.querySelector('#resumo-do-dia [data-action="refresh-resumo"]');
      assert.ok(refreshResumoBtn, '#btn-refresh-resumo-dia refresh button must exist in #resumo-do-dia');

      // 5. Periodic autonomous sync (checkHotNewsOnMap(true)) updates localStorage & DOM
      resumoPhase = 2;
      app.fetchCalls.length = 0;
      await app.fireIntervals(300_000, 400_000);
      assert.ok(
        app.document.getElementById('resumo-do-dia').textContent.includes('LIVE RESUMO CYCLE 2 SYNCED'),
        'Periodic update must sync fresh Resumo do Dia items to DOM'
      );
      const savedResumo = JSON.parse(app.localStorage.getItem('rom_resumo_items') || '[]');
      assert.ok(
        savedResumo.some((it) => it.titulo === 'LIVE RESUMO CYCLE 2 SYNCED'),
        'Periodic update must sync fresh Resumo do Dia items to localStorage'
      );
    } finally {
      app.cleanup();
    }
  });

  test('T1-F5: Últimas Notícias bypasses stale rom_ultimas_noticias, sorts newest-first, supports weighted search, and uses no-store', async () => {
    const now = Date.now();
    const staleStorage = new Map([
      ['rom_ultimas_noticias', JSON.stringify({
        ts: now - 30 * 60_000,
        atualizadoEm: isoMinutesAgo(30, now),
        noticias: [
          { id: 'old-1', titulo: 'STALE ULTIMAS CACHED 1', url: 'https://old.example/1', fonte: 'Antiga', regiao: 'nacional', regiaoLabel: 'Nacional', publicadoEm: isoMinutesAgo(30, now) },
          { id: 'old-2', titulo: 'STALE ULTIMAS CACHED 2', url: 'https://old.example/2', fonte: 'Antiga', regiao: 'nacional', regiaoLabel: 'Nacional', publicadoEm: isoMinutesAgo(40, now) },
          { id: 'old-3', titulo: 'STALE ULTIMAS CACHED 3', url: 'https://old.example/3', fonte: 'Antiga', regiao: 'nacional', regiaoLabel: 'Nacional', publicadoEm: isoMinutesAgo(50, now) },
        ],
      })],
    ]);

    const upstream = createMockUpstream();
    const app = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/ultimas-noticias',
      storageMap: staleStorage,
      fetchHandler: async (resolvedUrl, init) => {
        const u = new URL(resolvedUrl);
        if (u.pathname === '/api/ultimas-noticias') {
          return createJsonResponse({
            ok: true,
            total: 4,
            totalGeral: 4,
            atualizadoEm: new Date(now).toISOString(),
            noticias: [
              // Intentionally unsorted from API to verify client sorting when query is empty
              {
                id: 'live-older',
                titulo: 'NOTÍCIA LIVE MAIS ANTIGA',
                url: 'https://live.example/older',
                resumo: 'Texto sobre economia nacional.',
                fonte: 'G1',
                regiao: 'nacional',
                regiaoLabel: 'Nacional',
                estado: 'DF',
                publicadoEm: isoHoursAgo(4, now),
                tempoRelativo: 'há 4 horas',
              },
              {
                id: 'live-newest',
                titulo: 'NOTÍCIA LIVE MAIS RECENTE',
                url: 'https://live.example/newest',
                resumo: 'Texto sobre congresso e medidas tributárias.',
                fonte: 'Agência Brasil',
                regiao: 'nacional',
                regiaoLabel: 'Nacional',
                estado: 'DF',
                publicadoEm: isoMinutesAgo(2, now),
                tempoRelativo: 'agora há pouco',
              },
              {
                id: 'live-mid',
                titulo: 'REFORMA DO ESTADO AVANÇA NO SENADO',
                url: 'https://live.example/mid',
                resumo: 'Congresso analisa texto tributário nesta semana.',
                fonte: 'Folha',
                regiao: 'sudeste',
                regiaoLabel: 'Sudeste',
                estado: 'SP',
                publicadoEm: isoMinutesAgo(45, now),
                tempoRelativo: 'há 45 min',
              },
            ],
          });
        }
        upstream.activate();
        return worker.fetch(new Request(resolvedUrl, init), upstream.env);
      },
    });
    try {
      // 1. Live fetch fires immediately with cache: 'no-store' despite stale rom_ultimas_noticias
      const uFetch = app.fetchCalls.find((c) => c.url.includes('/api/ultimas-noticias'));
      assert.ok(uFetch, 'Initial /ultimas-noticias must fetch /api/ultimas-noticias even when localStorage has cached entries');
      assert.equal(uFetch.cache, 'no-store', 'Fetch to /api/ultimas-noticias must specify cache: no-store');

      // 2. Cards ordered newest-first when search query is empty
      const cardTitles = app.document.querySelectorAll('#ultimas-content-container .ultimas-card .ultimas-card-title a').map((a) => a.textContent.trim());
      assert.ok(cardTitles.length === 3, 'Must render 3 live cards');
      assert.equal(cardTitles[0], 'NOTÍCIA LIVE MAIS RECENTE', 'Newest card must appear first when search is empty');
      assert.ok(!cardTitles.includes('STALE ULTIMAS CACHED 1'), 'Stale localStorage entries must be replaced');

      // 3. Weighted search (GEMINI.md Rule 7): partial-token + body/summary match returns results instead of blanking
      const searchInput = app.document.getElementById('ultimas-search-input');
      assert.ok(searchInput, '#ultimas-search-input must exist');
      searchInput.value = 'reforma tributaria senado brasília';
      searchInput.dispatchEvent({ type: 'input', bubbles: true });
      await app.settle();
      const filteredCards = app.document.querySelectorAll('#ultimas-content-container .ultimas-card .ultimas-card-title a').map((a) => a.textContent.trim());
      assert.ok(filteredCards.length >= 1, 'Weighted search must return contextual partial-token match rather than empty screen');
      assert.equal(filteredCards[0], 'REFORMA DO ESTADO AVANÇA NO SENADO');

      // 4. Manual refresh button sends refresh=1&_t=
      app.fetchCalls.length = 0;
      const btnRefresh = app.document.getElementById('btn-ultimas-refresh');
      assert.ok(btnRefresh);
      btnRefresh.click();
      await app.settle();
      const refreshFetch = app.fetchCalls.find((c) => c.url.includes('/api/ultimas-noticias'));
      assert.ok(refreshFetch && refreshFetch.url.includes('refresh=1') && refreshFetch.url.includes('_t='));
    } finally {
      app.cleanup();
    }
  });

  test('T1-F6: Atlas Vivo revalidates stale rom_atlas_pais_<A2>, sends ?_t= & no-store, translates sorted top 4, and toggles lang', async () => {
    const now = Date.now();
    const staleAtlasStorage = new Map([
      ['rom_atlas_pais_JP', JSON.stringify({
        ts: now - 2 * 60_000, // Even recent cache must trigger background revalidation on reload/open
        updatedAt: isoMinutesAgo(2, now),
        items: [
          {
            id: 'stale-jp-1',
            titleOriginal: 'Stale Japan Old Headline',
            titlePt: 'Manchete Antiga do Japão',
            url: 'https://stale.jp/1',
            source: 'Old JP',
            publishedAt: isoHoursAgo(5, now),
          },
        ],
      })],
    ]);

    const translatedInputs = [];
    const upstream = createMockUpstream();
    const app = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/',
      storageMap: staleAtlasStorage,
      fetchHandler: async (resolvedUrl, init) => {
        const u = new URL(resolvedUrl);
        if (u.pathname === '/api/atlas-pais') {
          // Return 6 unsorted items where items 5 and 6 are NEWEST!
          return createJsonResponse({
            ok: true,
            country: 'JP',
            countryName: 'Japão',
            updatedAt: new Date(now).toISOString(),
            items: [
              { id: 'j1', titleOriginal: 'JP Unsorted Old 1', titlePt: 'JP Unsorted Old 1', url: 'https://jp.ex/1', source: 'NHK', publishedAt: isoHoursAgo(10, now) },
              { id: 'j2', titleOriginal: 'JP Unsorted Old 2', titlePt: 'JP Unsorted Old 2', url: 'https://jp.ex/2', source: 'NHK', publishedAt: isoHoursAgo(9, now) },
              { id: 'j3', titleOriginal: 'JP Unsorted Old 3', titlePt: 'JP Unsorted Old 3', url: 'https://jp.ex/3', source: 'NHK', publishedAt: isoHoursAgo(8, now) },
              { id: 'j4', titleOriginal: 'JP Unsorted Old 4', titlePt: 'JP Unsorted Old 4', url: 'https://jp.ex/4', source: 'NHK', publishedAt: isoHoursAgo(7, now) },
              { id: 'j5', titleOriginal: 'JP Newest Item #1', titlePt: 'JP Newest Item #1', url: 'https://jp.ex/5', source: 'Asahi', publishedAt: isoMinutesAgo(2, now) },
              { id: 'j6', titleOriginal: 'JP Second Newest #2', titlePt: 'JP Second Newest #2', url: 'https://jp.ex/6', source: 'Kyodo', publishedAt: isoMinutesAgo(5, now) },
            ],
          });
        }
        if (u.pathname === '/api/traduzir') {
          const body = JSON.parse(String(init.body || '{}'));
          const out = {};
          for (const [k, v] of Object.entries(body.itens || {})) {
            translatedInputs.push(v);
            out[k] = `PT: ${v}`;
          }
          return createJsonResponse({ lang: 'pt', itens: out });
        }
        upstream.activate();
        return worker.fetch(new Request(resolvedUrl, init), upstream.env);
      },
    });
    try {
      app.fetchCalls.length = 0;
      app.window.selecionarPais('JP');
      await app.settle();

      // 1. Live revalidation must fire even when rom_atlas_pais_JP exists in localStorage
      const atlasFetch = app.fetchCalls.find((c) => c.url.includes('/api/atlas-pais'));
      assert.ok(atlasFetch, 'Opening JP with cached rom_atlas_pais_JP must trigger background revalidation');
      assert.ok(atlasFetch.url.includes('_t='), 'Atlas fetch must include _t=');
      assert.equal(atlasFetch.cache, 'no-store', 'Atlas fetch must pass cache: no-store');

      // 2. Sorted top 4 (orderedItems.slice(0, 4)) must be translated (including JP Newest Item #1 & #2)
      assert.ok(
        translatedInputs.includes('JP Newest Item #1') && translatedInputs.includes('JP Second Newest #2'),
        `Translation must operate on sorted top 4 (orderedItems.slice(0, 4)), received: ${JSON.stringify(translatedInputs)}`
      );

      // 3. DOM renders translated newest title first and .atlas-lang-toggle toggles to original
      const firstCardLink = app.document.querySelector('#atlas-live-news-list .atlas-live-card-title a');
      assert.ok(firstCardLink && firstCardLink.textContent.includes('JP Newest Item #1'));
      const toggleBtn = app.document.querySelector('#atlas-live-news-list .atlas-lang-toggle');
      assert.ok(toggleBtn, '.atlas-lang-toggle button must render for translated non-lusophone card');
      toggleBtn.click();
      assert.equal(firstCardLink.textContent.trim(), 'JP Newest Item #1', 'Clicking .atlas-lang-toggle must show original title');
      toggleBtn.click();
      assert.equal(firstCardLink.textContent.trim(), 'PT: JP Newest Item #1', 'Clicking .atlas-lang-toggle again must restore PT translation');

      // 4. Manual refresh sends refresh=1&_t=
      app.fetchCalls.length = 0;
      const refreshBtn = app.document.getElementById('btn-atlas-refresh');
      assert.ok(refreshBtn);
      refreshBtn.click();
      await app.settle();
      const manualAtlasFetch = app.fetchCalls.find((c) => c.url.includes('/api/atlas-pais'));
      assert.ok(manualAtlasFetch && manualAtlasFetch.url.includes('refresh=1') && manualAtlasFetch.url.includes('_t='));
    } finally {
      app.cleanup();
    }
  });

  test('T1-F7: Colunas V2 & outletRotatorCache enforce TTL and #colunas hash routing works on fromLocation & navigateSpa', async () => {
    const now = Date.now();
    const upstream = createMockUpstream({
      colunasApi: {
        ok: true,
        atualizado_em: 'Atualizado agora',
        colunas: [
          {
            slug: 'col-1',
            titulo: 'COLUNA V2 CICLO 1',
            categoria: 'Geopolítica',
            resumo: 'Resumo col 1',
            analise_aprofundada: 'Análise 1',
            rota_editoria: '/radar',
            updated_at: isoMinutesAgo(10, now),
          },
        ],
      },
    });

    // 1. Direct load on /radar#colunas (fromLocation)
    const app = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/radar#colunas',
      mockUpstream: upstream,
    });
    try {
      const tabCol = app.document.getElementById('radar-tab-colunas');
      const panelCol = app.document.getElementById('radar-panel-colunas');
      assert.ok(tabCol && panelCol, 'Colunas tab and panel must exist');
      assert.equal(tabCol.getAttribute('aria-selected'), 'true', 'Direct load of /radar#colunas must activate #radar-tab-colunas');
      assert.equal(panelCol.hidden, false, 'Direct load of /radar#colunas must show #radar-panel-colunas');
      assert.ok(app.document.getElementById('radar-v2-colunas-wrap').textContent.includes('COLUNA V2 CICLO 1'));

      // 2. TTL expiration on v2EntendaColunasCache: advance clock 15 minutes, navigate away and back via SPA link to /radar#colunas
      app.advanceClock(15 * 60_000);
      upstream.state.colunasApi = {
        ok: true,
        atualizado_em: 'Atualizado agora',
        colunas: [
          {
            slug: 'col-2',
            titulo: 'COLUNA V2 CICLO 2 APÓS TTL',
            categoria: 'Economia',
            resumo: 'Resumo col 2',
            analise_aprofundada: 'Análise 2',
            rota_editoria: '/radar',
            updated_at: isoMinutesAgo(1, now + 15 * 60_000),
          },
        ],
      };

      // Navigate to Home then back to /radar#colunas via [data-spa-link] click (navigateSpa)
      const homeLink = app.document.querySelector('[data-home]');
      assert.ok(homeLink);
      homeLink.click();
      await app.settle();

      const spaColLink = app.document.createElement('a');
      spaColLink.setAttribute('href', '/radar#colunas');
      spaColLink.setAttribute('data-spa-link', '');
      app.document.body.appendChild(spaColLink);
      app.fetchCalls.length = 0;
      spaColLink.click();
      await app.settle();

      assert.equal(app.document.getElementById('radar-tab-colunas').getAttribute('aria-selected'), 'true', 'navigateSpa("/radar#colunas") must activate #radar-tab-colunas');
      assert.equal(app.document.getElementById('radar-panel-colunas').hidden, false, 'navigateSpa("/radar#colunas") must unhide #radar-panel-colunas');
      const colFetch2 = app.fetchCalls.find((c) => c.url.includes('/api/entenda-o-assunto') && c.url.includes('acao=colunas'));
      assert.ok(colFetch2, 'Expired v2EntendaColunasCache must re-fetch /api/entenda-o-assunto?acao=colunas');
      assert.ok(app.document.getElementById('radar-v2-colunas-wrap').textContent.includes('COLUNA V2 CICLO 2 APÓS TTL'));

      // 3. outletRotatorCache TTL: open BR, capture enrich call, advance clock 30 min, re-open BR -> must re-fetch /api/busca-assunto enrich
      app.fetchCalls.length = 0;
      app.window.selecionarPais('BR');
      await app.settle();
      const enrich1 = app.fetchCalls.filter((c) => c.url.includes('/api/busca-assunto'));
      assert.ok(enrich1.length > 0, 'Opening BR must enrich outlets via /api/busca-assunto');

      app.advanceClock(30 * 60_000);
      app.fetchCalls.length = 0;
      app.window.selecionarPais('US');
      await app.settle();
      app.fetchCalls.length = 0;
      app.window.selecionarPais('BR');
      await app.settle();
      const enrichAfterTtl = app.fetchCalls.filter((c) => c.url.includes('/api/busca-assunto'));
      assert.ok(enrichAfterTtl.length > 0, 'Re-opening BR after outletRotatorCache TTL expiry must re-fetch /api/busca-assunto');
    } finally {
      app.cleanup();
    }
  });

  test('T1-F8: Static route HTML parity, ?v= asset busting, v2.1 version badges, and topbar compliance (GEMINI.md Rule 5)', () => {
    // 1. index.html === 200.html SHA-256
    assert.equal(sha256(INDEX_HTML), sha256(HTML_200), 'index.html and 200.html must have identical SHA-256');

    // 2. Extract authoritative ?v= asset query strings from index.html
    const stylesMatch = INDEX_HTML.match(/href="(\/styles\.css\?v=[^"]+)"/);
    const appJsMatch = INDEX_HTML.match(/src="(\/app\.js\?v=[^"]+)"/);
    assert.ok(stylesMatch, 'index.html must include versioned /styles.css?v=...');
    assert.ok(appJsMatch, 'index.html must include versioned /app.js?v=...');
    const expectedStyles = stylesMatch[1];
    const expectedAppJs = appJsMatch[1];

    // 3. Discover all */index.html files dynamically (excluding _backups, node_modules, .git)
    const spaRouteFiles = [];
    function walkDir(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '_backups' || entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(full);
        } else if (entry.isFile() && entry.name === 'index.html' && full !== path.join(ROOT_DIR, 'index.html')) {
          const content = fs.readFileSync(full, 'utf8');
          if (content.includes('/app.js')) {
            spaRouteFiles.push({ rel: path.relative(ROOT_DIR, full), content });
          }
        }
      }
    }
    walkDir(ROOT_DIR);
    assert.ok(spaRouteFiles.length >= 25, `Expected >=25 SPA */index.html shells, found ${spaRouteFiles.length}`);

    for (const { rel, content } of spaRouteFiles) {
      assert.ok(content.includes(`href="${expectedStyles}"`), `${rel} must match index.html stylesheet (${expectedStyles})`);
      assert.ok(content.includes(`src="${expectedAppJs}"`), `${rel} must match index.html script (${expectedAppJs})`);
      assert.match(content, /class="footer-version"[^>]*>v2\.1</, `${rel} must have .footer-version containing v2.1`);
    }

    // 4. sobre.html & sobre/index.html carry v2.1 in chip and footer
    const sobreIndex = readRepoFile('sobre/index.html');
    for (const [name, html] of [['sobre.html', SOBRE_HTML], ['sobre/index.html', sobreIndex]]) {
      assert.match(html, /class="about-version-chip"[^>]*>v2\.1</, `${name} must display v2.1 in .about-version-chip`);
      assert.match(html, /class="footer-version"[^>]*>v2\.1</, `${name} must display v2.1 in .footer-version`);
    }

    // 5. Topbar <header> in index.html & sobre.html must NOT display version string (GEMINI.md Rule 5)
    for (const [name, html] of [['index.html', INDEX_HTML], ['sobre.html', SOBRE_HTML]]) {
      const headerMatch = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/i);
      assert.ok(headerMatch, `${name} must have <header>`);
      assert.ok(!/v2\.1/i.test(headerMatch[0]), `${name} topbar <header> must NOT display version v2.1`);
    }
  });

  test('T1-F9: Edge /api/radar (_worker.js & functions/api/radar.js) timeout >2.5s, CURADORIA_BACKEND_URL, no-store fallback, no hardcoded overwrite', async () => {
    const now = Date.now();
    // 1. Slow backend (2600ms > old 2500ms timeout) still succeeds on _worker.js & radar.js
    const upstream = createMockUpstream({
      vitrineIa: async (_u, init) => {
        await waitWithSignal(2600, init && init.signal);
        return {
          updatedAt: new Date(now).toISOString(),
          temas_ativos: [
            {
              slug: 'slow-backend-live',
              titulo_tema: 'SLOW BACKEND 2600MS LIVE ITEM',
              categoria_primaria: 'Geopolitica_Radar',
              gatilho_vitrine: 'Vivo após 2.6s',
              data_publicacao: isoMinutesAgo(1, now),
            },
          ],
        };
      },
      feedOutput: [],
    });
    upstream.activate();

    const wRes = await worker.fetch(new Request('https://www.rodandoomundo.com.br/api/radar?_t=' + now), upstream.env);
    assert.equal(wRes.status, 200);
    const wData = await wRes.json();
    assert.equal(wData.source, 'v2_hybrid', '_worker.js /api/radar must wait past 2.5s and serve live backend v2_hybrid');
    assert.ok(wData.items.some((it) => it.titulo === 'SLOW BACKEND 2600MS LIVE ITEM'));
    assert.ok((wRes.headers.get('cache-control') || '').includes('no-store'));

    // 2. functions/api/radar.js queries CURADORIA_BACKEND_URL when configured
    const rRes = await apiRadar.onRequestGet({
      request: new Request('https://www.rodandoomundo.com.br/api/radar?refresh=1&_t=' + now),
      env: upstream.env,
    });
    assert.equal(rRes.status, 200);
    const rData = await rRes.json();
    assert.equal(rData.source, 'v2_hybrid', 'functions/api/radar.js must use CURADORIA_BACKEND_URL');
    assert.ok(rData.items.some((it) => it.titulo === 'SLOW BACKEND 2600MS LIVE ITEM'));

    // 3. Fallback when backend fails (502) and asset is empty: must return no-store, fallback: true, and NEVER inject hardcoded FALLBACK_VITRINE_TEMAS
    upstream.state.vitrineIa = { __status: 502 };
    upstream.state.feedOutput = { __status: 502 };
    upstream.state.assetVitrineIa = { updatedAt: isoHoursAgo(24, now), temas_ativos: [] };
    upstream.state.assetFeedOutput = [];

    const wFb = await worker.fetch(new Request('https://www.rodandoomundo.com.br/api/radar'), upstream.env);
    assert.equal(wFb.status, 200);
    const wFbJson = await wFb.json();
    assert.equal(wFbJson.fallback, true, '_worker.js degraded response must set fallback: true');
    assert.ok((wFb.headers.get('cache-control') || '').includes('no-store'), '_worker.js fallback must set Cache-Control: no-store');

    const rFb = await apiRadar.onRequestGet({
      request: new Request('https://www.rodandoomundo.com.br/api/radar'),
      env: upstream.env,
    });
    const rFbJson = await rFb.json();
    assert.equal(rFbJson.fallback, true);
    assert.ok((rFb.headers.get('cache-control') || '').includes('no-store'));
    assert.ok(
      !rFbJson.items.some((it) => String(it.slug || '').includes('faa-suspende-voos-eua')),
      'functions/api/radar.js must NOT overwrite empty live state with hardcoded FALLBACK_VITRINE_TEMAS'
    );
  });

  test('T1-F10: Edge /api/noticias-quentes & /api/vitrine-em-alta enforce recency-first sort, safe backend URL check, and no-store on fallback', async () => {
    const now = Date.now();
    // Test 1: Snapshot mode (backend absent) with old score=99 vs breaking score=70
    const upstream = createMockUpstream({
      backendUrl: '',
      assetVitrineIa: {
        updatedAt: new Date(now).toISOString(),
        temas_ativos: [
          {
            slug: 'old-high-score',
            titulo_tema: 'OLD SCORE 99 ITEM (48H AGO)',
            categoria_primaria: 'Politica',
            paises_envolvidos: ['BR'],
            urgencia_score: 99,
            relevancia_score: 99,
            data_publicacao: isoHoursAgo(48, now),
            updated_at: isoHoursAgo(48, now),
            palavras_chave_busca: ['congresso'],
            gatilho_vitrine: 'Antigo',
            sintese_nerd: 'Antigo',
          },
          {
            slug: 'breaking-lower-score',
            titulo_tema: 'BREAKING SCORE 70 ITEM (5M AGO)',
            categoria_primaria: 'Economia',
            paises_envolvidos: ['JP'],
            urgencia_score: 70,
            relevancia_score: 70,
            data_publicacao: isoMinutesAgo(5, now),
            updated_at: isoMinutesAgo(5, now),
            palavras_chave_busca: ['iene', 'japao'],
            gatilho_vitrine: 'Recente',
            sintese_nerd: 'Recente',
          },
        ],
      },
    });
    upstream.activate();

    const nqRes = await apiNoticiasQuentes.onRequestGet({
      request: new Request('https://www.rodandoomundo.com.br/api/noticias-quentes'),
      env: upstream.env,
    });
    assert.equal(nqRes.status, 200);
    const nqData = await nqRes.json();
    assert.ok(nqData.noticias_quentes.length >= 2);
    assert.equal(
      nqData.noticias_quentes[0].titulo_curto,
      'BREAKING SCORE 70 ITEM (5M AGO)',
      '/api/noticias-quentes must rank 5m-old score=70 item BEFORE 48h-old score=99 item'
    );
    assert.ok(nqData.noticias_quentes[0].data_publicacao, '/api/noticias-quentes must preserve data_publicacao');
    assert.ok(
      (nqRes.headers.get('cache-control') || '').includes('no-store'),
      '/api/noticias-quentes snapshot/fallback response must include Cache-Control: no-store (never s-maxage=300)'
    );

    // 2. /api/vitrine-em-alta recency-first & preserves data_publicacao + no-store fallback
    const vRes = await apiVitrineEmAlta.onRequestGet({
      request: new Request('https://www.rodandoomundo.com.br/api/vitrine-em-alta'),
      env: upstream.env,
    });
    const vData = await vRes.json();
    assert.equal(
      vData.temas_ativos[0].titulo_tema,
      'BREAKING SCORE 70 ITEM (5M AGO)',
      '/api/vitrine-em-alta must sort newest data_publicacao first instead of pure relevancia_score'
    );
    assert.ok(vData.temas_ativos[0].data_publicacao, '/api/vitrine-em-alta must preserve data_publicacao');
    assert.ok(
      (vRes.headers.get('cache-control') || '').includes('no-store'),
      '/api/vitrine-em-alta snapshot/fallback must include Cache-Control: no-store (never s-maxage=120)'
    );

    // 3. acao=expansao&q=... returns weighted semantic terms
    const expRes = await apiVitrineEmAlta.onRequestGet({
      request: new Request('https://www.rodandoomundo.com.br/api/vitrine-em-alta?acao=expansao&q=japao&_t=' + now),
      env: upstream.env,
    });
    const expData = await expRes.json();
    assert.equal(expData.ok, true);
    assert.ok(expData.termos_turbinados.includes('iene'));
    assert.ok((expRes.headers.get('cache-control') || '').includes('no-store'));

    // 4. Dedicated API backend URL (`https://api.rodandoomundo.com.br`) is permitted when configured (not blocked as self-host)
    const apiHostEnv = {
      ...upstream.env,
      CURADORIA_BACKEND_URL: 'https://api.rodandoomundo.com.br',
    };
    upstream.state.routeOverrides.set('https://api.rodandoomundo.com.br/v1/noticias-quentes', {
      ok: true,
      updatedAt: new Date(now).toISOString(),
      noticias_quentes: [
        {
          slug: 'from-api-subdomain',
          titulo_curto: 'FROM API SUBDOMAIN LIVE',
          paises_envolvidos: ['BR'],
          urgencia_score: 88,
          data_publicacao: isoMinutesAgo(1, now),
        },
      ],
    });
    const subRes = await apiNoticiasQuentes.onRequestGet({
      request: new Request('https://www.rodandoomundo.com.br/api/noticias-quentes?_t=' + now),
      env: apiHostEnv,
    });
    const subData = await subRes.json();
    assert.equal(subData.source, 'v2_api', 'CURADORIA_BACKEND_URL=https://api.rodandoomundo.com.br must be allowed to reach FastAPI backend');
    assert.equal(subData.noticias_quentes[0].titulo_curto, 'FROM API SUBDOMAIN LIVE');
  });

  test('T1-F11: All 5 Edge RSS endpoints honor _t & refresh=1, parse Atom <entry>, sort before slice, avoid now() on undated, use when:7d, and avoid s-maxage=43200', async () => {
    const now = Date.now();
    let rssCycle = 1;

    const upstream = createMockUpstream({
      rssHandler: (urlStr) => {
        if (rssCycle === 1) {
          // 15 older RSS items + 2 newer Atom <entry> items at the END + 1 undated item
          const oldItems = Array.from({ length: 15 }, (_, i) => ({
            title: `Older RSS Item ${i + 1} - Fonte ${i + 1}`,
            link: `https://news.example/old-${i + 1}`,
            pubDate: rfc2822HoursAgo(24 + i, now),
            description: `Resumo antigo ${i + 1}`,
          }));
          const undated = {
            title: 'Undated RSS Mystery Item - Fonte X',
            link: 'https://news.example/undated',
            pubDate: '',
            description: 'Item sem data de publicação',
          };
          const rssPart = oldItems.concat([undated]).map((it) => {
            const p = it.pubDate ? `<pubDate>${it.pubDate}</pubDate>` : '';
            return `<item><title><![CDATA[${it.title}]]></title><link>${it.link}</link>${p}<description><![CDATA[${it.description}]]></description></item>`;
          }).join('');
          const atomPart = `<entry><title><![CDATA[Breaking Atom Entry C1 - Reuters]]></title><link rel="alternate" href="https://news.example/atom-c1"/><published>${isoMinutesAgo(2, now)}</published><summary>Breaking news via Atom</summary></entry>`;
          return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Mixed</title>${rssPart}${atomPart}</channel></rss>`;
        }
        return buildAtomXml([
          {
            title: 'Cycle 2 Fresh Atom Headline - BBC',
            link: 'https://news.example/atom-c2',
            published: isoMinutesAgo(1, now + 60_000),
            summary: 'Cycle 2 summary geopolitica economia',
          },
          {
            title: 'Cycle 2 Secondary Atom Headline - G1',
            link: 'https://news.example/atom-c2-b',
            published: isoMinutesAgo(3, now + 60_000),
            summary: 'Cycle 2 secondary summary politica',
          },
          {
            title: 'Cycle 2 Third Atom Headline - Folha',
            link: 'https://news.example/atom-c2-c',
            published: isoMinutesAgo(5, now + 60_000),
            summary: 'Cycle 2 third summary brasil',
          },
        ]);
      },
      currentsHandler: () => ({
        status: 'ok',
        news: [
          {
            title: rssCycle === 1 ? 'Currents C1 Headline' : 'Currents C2 Headline',
            url: `https://currents.example/${rssCycle}`,
            image: `https://currents.example/img-${rssCycle}.jpg`,
            published: isoMinutesAgo(1, now),
          },
        ],
      }),
    });
    upstream.activate();

    // 1. Prime caches with refresh=1 first (Cycle 1), then swap to Cycle 2 and verify BOTH ?_t= AND ?refresh=1 bypass warm cache
    // 1a. ultimas-noticias
    const u1 = await apiUltimasNoticias.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/ultimas-noticias?refresh=1') });
    const u1Data = await u1.json();
    assert.ok(u1Data.noticias.some((n) => n.titulo.includes('Breaking Atom Entry C1')), 'ultimas-noticias must parse Atom <entry> and sort before slicing');
    const undatedItemU = u1Data.noticias.find((n) => n.titulo.includes('Undated RSS Mystery Item'));
    if (undatedItemU) {
      assert.equal(undatedItemU.publicadoEm, '', 'ultimas-noticias must NOT stamp undated item with now()');
      assert.ok(u1Data.noticias.indexOf(undatedItemU) > u1Data.noticias.findIndex((n) => n.titulo.includes('Breaking Atom Entry C1')), 'Undated item must sort after dated items');
    }

    // Prime non-refresh warm cache with Cycle 1
    rssCycle = 1;
    await apiUltimasNoticias.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/ultimas-noticias?refresh=1') });
    // Now switch upstream to Cycle 2; request with ONLY ?_t= (no refresh=1) MUST bypass cacheMemoria!
    rssCycle = 2;
    const u2ByT = await apiUltimasNoticias.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/ultimas-noticias?_t=' + (now + 10)) });
    const u2Data = await u2ByT.json();
    assert.ok((u2ByT.headers.get('cache-control') || '').includes('no-store'), 'ultimas-noticias ?_t= must return Cache-Control: no-store');
    assert.ok(u2Data.noticias.some((n) => n.titulo.includes('Cycle 2 Fresh Atom Headline')), 'ultimas-noticias ?_t= must bypass warm cacheMemoria');

    // 1b. atlas-pais (non-BR includes when:7d, Atom <entry>, undated not stamped now(), ?_t= bypasses CACHE_LOCAL)
    rssCycle = 1;
    upstream.clearCalls();
    const a1 = await apiAtlasPais.onRequestGet({
      request: new Request('https://www.rodandoomundo.com.br/api/atlas-pais?pais=DE&nome=Alemanha&refresh=1'),
      env: upstream.env,
    });
    const a1Data = await a1.json();
    const deRssCall = upstream.upstreamCalls.find((c) => c.url.includes('news.google.com/rss'));
    assert.ok(deRssCall && deRssCall.url.includes('when%3A7d') || (deRssCall && deRssCall.url.includes('when:7d')), 'Non-BR /api/atlas-pais RSS query must include when:7d');
    assert.ok(a1Data.items.some((i) => i.titleOriginal.includes('Breaking Atom Entry C1')), 'atlas-pais must parse Atom <entry> and sort before slicing');
    const undatedAtlas = a1Data.items.find((i) => i.titleOriginal.includes('Undated RSS Mystery Item'));
    if (undatedAtlas) {
      assert.equal(undatedAtlas.publishedAt, '', 'atlas-pais must NOT stamp undated item with now()');
    }
    rssCycle = 2;
    const a2ByT = await apiAtlasPais.onRequestGet({
      request: new Request('https://www.rodandoomundo.com.br/api/atlas-pais?pais=DE&nome=Alemanha&_t=' + (now + 20)),
      env: upstream.env,
    });
    const a2Data = await a2ByT.json();
    assert.ok((a2ByT.headers.get('cache-control') || '').includes('no-store'));
    assert.ok(a2Data.items.some((i) => i.titleOriginal.includes('Cycle 2 Fresh Atom Headline')), 'atlas-pais ?_t= must bypass warm CACHE_LOCAL');

    // 1c. resumo (no s-maxage=43200 on normal response, ?_t= bypasses memoryCache, fallback has no-store)
    rssCycle = 1;
    const resPrime = await apiResumo.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/resumo?refresh=1') });
    assert.ok((resPrime.headers.get('cache-control') || '').includes('no-store'));
    const resNormal = await apiResumo.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/resumo') });
    assert.ok(!(resNormal.headers.get('cache-control') || '').includes('s-maxage=43200'), '/api/resumo must NOT set s-maxage=43200');
    rssCycle = 2;
    const resByT = await apiResumo.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/resumo?_t=' + (now + 30)) });
    const resByTData = await resByT.json();
    assert.ok(resByTData.items.some((i) => i.titulo.includes('Cycle 2')), 'resumo ?_t= must bypass memoryCache');

    // 1d. busca-assunto (?_t= and ?refresh=1 bypass CACHE_MEMORIA, parses Atom <entry>)
    rssCycle = 1;
    await apiBuscaAssunto.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/busca-assunto?q=atom&country=BR&lang=pt') });
    rssCycle = 2;
    const b2ByT = await apiBuscaAssunto.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/busca-assunto?q=atom&country=BR&lang=pt&_t=' + (now + 40)) });
    const b2Data = await b2ByT.json();
    assert.ok((b2ByT.headers.get('cache-control') || '').includes('no-store'), 'busca-assunto ?_t= must return no-store');
    assert.notEqual(b2Data.cache, true, 'busca-assunto ?_t= must bypass warm CACHE_MEMORIA');

    // 1e. noticias (honors ?_t= and ?refresh=1 with Cache-Control: no-store)
    const nByT = await apiNoticias.onRequestGet({
      request: new Request('https://www.rodandoomundo.com.br/api/noticias?_t=' + (now + 50)),
      env: upstream.env,
    });
    assert.equal(nByT.status, 200);
    assert.ok((nByT.headers.get('cache-control') || '').includes('no-store'), '/api/noticias ?_t= must return Cache-Control: no-store');
  });
});

// ============================================================================
// TIER 2 — BOUNDARY & CORNER CASES
// ============================================================================
describe('Tier 2 — Boundary & Corner Cases (EC-01..EC-13)', () => {
  test('T2-01 & T2-02: Undated RSS items sort strictly after dated items & Atom <entry> extracts URL/title/timestamp across Edge RSS', async () => {
    const now = Date.now();
    const mixedFeed = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Mixed Feed</title>
        <entry>
          <title>Atom Undated Entry</title>
          <link rel="alternate" href="https://atom.example/undated"/>
        </entry>
        <entry>
          <title>Atom Dated Entry 2h Ago</title>
          <link rel="alternate" href="https://atom.example/2h"/>
          <published>${isoHoursAgo(2, now)}</published>
          <summary>Atom summary 2h</summary>
        </entry>
        <entry>
          <title>Atom Dated Entry 10m Ago</title>
          <link rel="alternate" href="https://atom.example/10m"/>
          <updated>${isoMinutesAgo(10, now)}</updated>
          <summary>Atom summary 10m</summary>
        </entry>
      </feed>`;

    const upstream = createMockUpstream({ rssHandler: () => mixedFeed });
    upstream.activate();

    const aRes = await apiAtlasPais.onRequestGet({
      request: new Request('https://www.rodandoomundo.com.br/api/atlas-pais?pais=FR&nome=Franca&refresh=1&_t=' + now),
      env: upstream.env,
    });
    const aData = await aRes.json();
    assert.ok(aData.items.length >= 2, 'Atlas must parse Atom <entry> items');
    assert.equal(aData.items[0].titleOriginal, 'Atom Dated Entry 10m Ago');
    const undated = aData.items.find((x) => x.titleOriginal === 'Atom Undated Entry');
    if (undated) {
      assert.equal(undated.publishedAt, '', 'Undated Atom entry must not be stamped with now()');
      assert.equal(aData.items[aData.items.length - 1].titleOriginal, 'Atom Undated Entry');
    }
  });

  test('T2-05 & T2-08: Backend 502/empty DB/all RSS failure fallback responses MUST emit Cache-Control: no-store across all Edge endpoints', async () => {
    const now = Date.now();
    const upstream = createMockUpstream({
      vitrineIa: { __status: 502 },
      feedOutput: { __status: 502 },
      noticiasQuentesApi: { __status: 502 },
      vitrineEmAltaApi: { __status: 502 },
      assetVitrineIa: { updatedAt: isoHoursAgo(48, now), temas_ativos: [{ slug: 'fb', titulo_tema: 'Asset Fallback', categoria_primaria: 'Economia', data_publicacao: isoHoursAgo(48, now) }] },
      assetFeedOutput: [],
      rssHandler: () => ({ status: 500, body: 'Internal Server Error' }),
    });
    upstream.activate();

    const endpoints = [
      worker.fetch(new Request('https://www.rodandoomundo.com.br/api/radar'), upstream.env),
      apiRadar.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/radar'), env: upstream.env }),
      apiNoticiasQuentes.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/noticias-quentes'), env: upstream.env }),
      apiVitrineEmAlta.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/vitrine-em-alta'), env: upstream.env }),
      apiResumo.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/resumo?refresh=1') }),
      apiUltimasNoticias.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/ultimas-noticias?refresh=1') }),
      apiAtlasPais.onRequestGet({ request: new Request('https://www.rodandoomundo.com.br/api/atlas-pais?pais=CA&nome=Canada'), env: upstream.env }),
    ];

    const responses = await Promise.all(endpoints);
    for (const res of responses) {
      const cc = (res.headers.get('cache-control') || '').toLowerCase();
      assert.ok(cc.includes('no-store'), `Fallback response for ${res.url || 'endpoint'} must contain no-store, got: "${cc}"`);
      assert.ok(!cc.includes('s-maxage=43200') && !cc.includes('s-maxage=300') && !cc.includes('s-maxage=120'), `Fallback must not set long s-maxage, got: "${cc}"`);
    }
  });

  test('T2-07 & T2-13: Corrupt localStorage JSON ("{broken") + stale localStorage never crashes boot and live data replaces stale UI', async () => {
    const now = Date.now();
    const corruptStorage = new Map([
      ['rom_radar_cache', '{broken'],
      ['rom_cache_vitrine_ia', '{broken'],
      ['rom_resumo_date', new Date(now).toISOString().slice(0, 10)],
      ['rom_resumo_items', '{broken'],
      ['rom_ultimas_noticias', '{broken'],
      ['rom_atlas_pais_BR', '{broken'],
    ]);
    const upstream = createMockUpstream({
      noticiasQuentesApi: {
        ok: true,
        updatedAt: new Date(now).toISOString(),
        noticias_quentes: [{ slug: 'br-clean', titulo_curto: 'BR CLEAN RECOVERY', paises_envolvidos: ['BR'], urgencia_score: 90, data_publicacao: isoMinutesAgo(1, now) }],
        paises_em_alta: [{ a2: 'BR', countryName: 'Brasil', title: 'BR CLEAN RECOVERY', category: 'Radar', url: '/radar' }],
      },
    });
    const app = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/',
      storageMap: corruptStorage,
      mockUpstream: upstream,
    });
    try {
      assert.equal(app.pageErrors.length, 0, 'Corrupt localStorage must not cause uncaught exceptions');
      assert.equal(app.consoleErrors.length, 0, 'Corrupt localStorage must not cause console errors');
      const brTitle = app.document.querySelector('#pulsando-agora-track .pulsando-card[data-country-iso="BR"] .pulsando-card-title');
      assert.equal(brTitle.textContent.trim(), 'BR CLEAN RECOVERY');
    } finally {
      app.cleanup();
    }
  });

  test('T2-11: Bounded source rotation (RADAR-SORT) does not promote 48h-old source B ahead of fresh 30m-old items', () => {
    const now = Date.now();
    const items = [];
    for (let i = 0; i < 8; i++) {
      items.push({
        id: `a-${i}`,
        titulo: `Veículo A Item ${i}`,
        fonte_nome: 'Veículo A',
        data_publicacao: isoMinutesAgo(i * 3 + 1, now),
        origem_v2: false,
        urgencia_score: 80,
      });
    }
    items.push({
      id: 'b-stale',
      titulo: 'Veículo B Stale 48h',
      fonte_nome: 'Veículo B',
      data_publicacao: isoHoursAgo(48, now),
      origem_v2: false,
      urgencia_score: 99,
    });

    const sorted = apiRadar.sortirCardsRodizioAmplo(items, 2);
    assert.equal(sorted.length, 9);
    const staleIdx = sorted.findIndex((it) => it.id === 'b-stale');
    assert.equal(staleIdx, 8, '48h-old Veículo B item must remain strictly after all fresh 30m-old Veículo A items');
  });

  test('T2-12: Clock skew (+2m future) renders "Publicada agora" without throwing & legacy non-ISO date sorts after valid ISO', async () => {
    const now = Date.now();
    const upstream = createMockUpstream();
    const app = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/radar',
      fetchHandler: async (resolvedUrl, init) => {
        const u = new URL(resolvedUrl);
        if (u.pathname === '/api/radar') {
          return createJsonResponse({
            ok: true,
            atualizado_em: 'Atualizado agora',
            items: [
              {
                id: 'legacy-date',
                titulo: 'LEGACY NON-ISO DATE CARD',
                resumo: 'Legacy',
                analise: 'Legacy',
                categoria: 'geopolitica',
                fonte_nome: 'Canal Legacy',
                fonte_url: 'https://legacy.example/1',
                data_publicacao: '15/11/2026 10:00',
              },
              {
                id: 'future-skew',
                titulo: 'FUTURE SKEW +2M CARD',
                resumo: 'Skew',
                analise: 'Skew',
                categoria: 'geopolitica',
                fonte_nome: 'Canal Skew',
                fonte_url: 'https://skew.example/2',
                data_publicacao: new Date(now + 120_000).toISOString(),
              },
            ],
          });
        }
        upstream.activate();
        return worker.fetch(new Request(resolvedUrl, init), upstream.env);
      },
    });
    try {
      assert.equal(app.pageErrors.length, 0);
      const cards = app.document.querySelectorAll('#radar-cards-list .radar-card');
      assert.equal(cards[0].querySelector('.radar-card-title').textContent.trim(), 'FUTURE SKEW +2M CARD');
      assert.equal(cards[0].querySelector('time.radar-pub-date').textContent.trim(), 'Publicada agora');
      assert.equal(cards[1].querySelector('.radar-card-title').textContent.trim(), 'LEGACY NON-ISO DATE CARD');
    } finally {
      app.cleanup();
    }
  });
});

// ============================================================================
// TIER 3 — CROSS-FEATURE PAIRWISE INTEGRATION
// ============================================================================
describe('Tier 3 — Cross-Feature Pairwise Integration (T3-03..T3-06)', () => {
  test('T3-03 & T3-04: Edge + Frontend integration & reload after manual refresh preserves newest items across Radar, Vitrine, Resumo, Últimas, and Atlas', async () => {
    const now = Date.now();
    const sharedStorage = new Map();
    const upstream = createMockUpstream({
      vitrineIa: {
        updatedAt: isoMinutesAgo(10, now),
        temas_ativos: [
          {
            slug: 'cycle1-item',
            titulo_tema: 'CYCLE 1 TOPIC A',
            categoria_primaria: 'Economia',
            paises_envolvidos: ['BR'],
            urgencia_score: 90,
            relevancia_score: 90,
            data_publicacao: isoMinutesAgo(10, now),
            palavras_chave_busca: ['selic'],
            gatilho_vitrine: 'Ciclo 1',
            sintese_nerd: 'Ciclo 1',
          },
        ],
      },
      vitrineEmAltaApi: {
        ok: true,
        updatedAt: isoMinutesAgo(10, now),
        temas_ativos: [
          {
            slug: 'cycle1-item',
            titulo_tema: 'CYCLE 1 TOPIC A',
            categoria_primaria: 'Economia',
            relevancia_score: 90,
            data_publicacao: isoMinutesAgo(10, now),
          },
        ],
      },
      noticiasQuentesApi: {
        ok: true,
        updatedAt: isoMinutesAgo(10, now),
        noticias_quentes: [
          { slug: 'cycle1-item', titulo_curto: 'CYCLE 1 TOPIC A', paises_envolvidos: ['BR'], urgencia_score: 90, data_publicacao: isoMinutesAgo(10, now) },
        ],
        paises_em_alta: [{ a2: 'BR', countryName: 'Brasil', title: 'CYCLE 1 TOPIC A', category: 'Economia', url: '/radar' }],
      },
      rssHandler: () => buildRssXml([
        { title: 'Cycle 1 BR News - Agência Brasil', link: 'https://agbr.ex/c1', pubDate: rfc2822HoursAgo(1, now), description: 'Economia ciclo 1' },
        { title: 'Cycle 1 BR News 2 - G1', link: 'https://g1.ex/c1', pubDate: rfc2822HoursAgo(2, now), description: 'Política ciclo 1' },
        { title: 'Cycle 1 BR News 3 - Folha', link: 'https://folha.ex/c1', pubDate: rfc2822HoursAgo(3, now), description: 'Mercado ciclo 1' },
      ]),
    });

    // Boot 1 on /radar
    const app1 = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/radar',
      storageMap: sharedStorage,
      mockUpstream: upstream,
    });
    try {
      assert.equal(app1.document.querySelector('#radar-cards-list .radar-card-title').textContent.trim(), 'CYCLE 1 TOPIC A');

      // Upstream advances to Cycle 2
      upstream.state.vitrineIa = {
        updatedAt: new Date(now + 120_000).toISOString(),
        temas_ativos: [
          {
            slug: 'cycle2-item',
            titulo_tema: 'CYCLE 2 TOPIC B NEWEST',
            categoria_primaria: 'Economia',
            paises_envolvidos: ['BR'],
            urgencia_score: 82,
            relevancia_score: 82,
            data_publicacao: isoMinutesAgo(1, now + 120_000),
            gatilho_vitrine: 'Ciclo 2',
            sintese_nerd: 'Ciclo 2',
          },
          ...upstream.state.vitrineIa.temas_ativos,
        ],
      };
      upstream.state.vitrineEmAltaApi = {
        ok: true,
        updatedAt: new Date(now + 120_000).toISOString(),
        temas_ativos: upstream.state.vitrineIa.temas_ativos,
      };
      upstream.state.noticiasQuentesApi = {
        ok: true,
        updatedAt: new Date(now + 120_000).toISOString(),
        noticias_quentes: [
          { slug: 'cycle2-item', titulo_curto: 'CYCLE 2 TOPIC B NEWEST', paises_envolvidos: ['BR'], urgencia_score: 82, data_publicacao: isoMinutesAgo(1, now + 120_000) },
        ],
        paises_em_alta: [{ a2: 'BR', countryName: 'Brasil', title: 'CYCLE 2 TOPIC B NEWEST', category: 'Economia', url: '/radar' }],
      };

      // Trigger manual refresh on Radar
      const btnRadar = app1.document.getElementById('btn-atualizar-radar');
      assert.ok(btnRadar);
      btnRadar.click();
      await app1.settle();
      assert.equal(app1.document.querySelector('#radar-cards-list .radar-card-title').textContent.trim(), 'CYCLE 2 TOPIC B NEWEST');
    } finally {
      app1.cleanup();
    }

    // Boot 2 (Full page reload sharing same localStorage)
    const app2 = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/radar#curadoria',
      storageMap: sharedStorage,
      mockUpstream: upstream,
    });
    try {
      assert.equal(
        app2.document.querySelector('#radar-cards-list .radar-card-title').textContent.trim(),
        'CYCLE 2 TOPIC B NEWEST',
        'After full reload, Radar must keep Cycle 2 newest item at #1'
      );
      assert.equal(
        app2.document.querySelector('#vitrine-ia-grid .vitrine-card-title').textContent.trim(),
        'CYCLE 2 TOPIC B NEWEST',
        'After full reload, Vitrine IA must show Cycle 2 newest item at #1'
      );
      assert.equal(
        app2.document.querySelector('#pulsando-agora-track .pulsando-card[data-country-iso="BR"] .pulsando-card-title').textContent.trim(),
        'CYCLE 2 TOPIC B NEWEST',
        'After full reload, Notícias Quentes must show Cycle 2 newest item'
      );
    } finally {
      app2.cleanup();
    }
  });

  test('T3-06: Weighted search expansion combines /api/vitrine-em-alta?acao=expansao with /api/ultimas-noticias (GEMINI.md Rule 7)', async () => {
    const now = Date.now();
    const upstream = createMockUpstream({
      backendUrl: '',
      assetVitrineIa: {
        updatedAt: new Date(now).toISOString(),
        temas_ativos: [
          {
            slug: 'dolar-fed',
            titulo_tema: 'Decisão de juros do Federal Reserve impacta câmbio',
            categoria_primaria: 'Economia',
            relevancia_score: 92,
            data_publicacao: isoMinutesAgo(5, now),
            palavras_chave_busca: ['fed', 'dolar', 'selic', 'cambio'],
            gatilho_vitrine: 'Câmbio',
            sintese_nerd: 'Câmbio e juros americanos.',
          },
        ],
      },
      rssHandler: () => buildRssXml([
        { title: 'Copom avalia impacto do Fed na taxa básica - Agência Brasil', link: 'https://agbr.ex/1', pubDate: rfc2822HoursAgo(1, now), description: 'Autoridade monetária monitora câmbio.' },
        { title: 'Bolsa sobe com alívio externo - G1', link: 'https://g1.ex/2', pubDate: rfc2822HoursAgo(2, now), description: 'Ibovespa acompanha mercados.' },
        { title: 'Exportações batem recorde no trimestre - Folha', link: 'https://folha.ex/3', pubDate: rfc2822HoursAgo(3, now), description: 'Balança comercial positiva.' },
      ]),
    });
    upstream.activate();

    const expRes = await worker.fetch(
      new Request('https://www.rodandoomundo.com.br/api/vitrine-em-alta?acao=expansao&q=dolar&_t=' + now),
      upstream.env
    );
    const expData = await expRes.json();
    assert.ok(expData.termos_turbinados.includes('fed'), 'Semantic expansion must expand "dolar" with "fed"');

    // Query /api/ultimas-noticias with multi-token query where not every token is in the headline
    const uRes = await worker.fetch(
      new Request('https://www.rodandoomundo.com.br/api/ultimas-noticias?q=fed+cambio+copom+brasil&refresh=1&_t=' + now),
      upstream.env
    );
    const uData = await uRes.json();
    assert.ok(uData.noticias.length >= 1, 'Weighted search must NOT return 0 results via rigid tokens.every()');
    assert.ok(uData.noticias[0].titulo.includes('Fed'), 'Most relevant partial+summary match must rank #1');
  });
});

// ============================================================================
// TIER 4 — MULTI-CYCLE PRODUCTION SCENARIOS (>= 4 CYCLES EACH)
// ============================================================================
describe('Tier 4 — Multi-Cycle Real-World Production Scenarios', () => {
  test('T4-01: 5-Cycle Radar & Pulso Production Lifecycle (new vs old, manual refresh, transient 502 auto-refresh protection, reload)', async () => {
    const now = Date.now();
    const sharedStorage = new Map();
    const upstream = createMockUpstream({
      vitrineIa: {
        updatedAt: new Date(now).toISOString(),
        temas_ativos: [
          {
            slug: 't0-breaking',
            titulo_tema: 'CYCLE 1 T+0M INITIAL LIVE',
            categoria_primaria: 'Geopolitica_Radar',
            paises_envolvidos: ['BR'],
            urgencia_score: 85,
            data_publicacao: isoMinutesAgo(5, now),
            gatilho_vitrine: 'Inicial T+0m',
            sintese_nerd: 'Inicial T+0m',
          },
          {
            slug: 't-12h-old',
            titulo_tema: 'T-12H OLD HIGH SCORE 99',
            categoria_primaria: 'Politica',
            paises_envolvidos: ['US'],
            urgencia_score: 99,
            data_publicacao: isoHoursAgo(12, now),
            gatilho_vitrine: 'Antigo',
            sintese_nerd: 'Antigo',
          },
        ],
      },
      noticiasQuentesApi: {
        ok: true,
        updatedAt: new Date(now).toISOString(),
        noticias_quentes: [
          { slug: 't-12h-old', titulo_curto: 'T-12H OLD HIGH SCORE 99', paises_envolvidos: ['US'], urgencia_score: 99, data_publicacao: isoHoursAgo(12, now) },
          { slug: 't0-breaking', titulo_curto: 'CYCLE 1 T+0M INITIAL LIVE', paises_envolvidos: ['BR'], urgencia_score: 85, data_publicacao: isoMinutesAgo(5, now) },
        ],
        paises_em_alta: [
          { a2: 'BR', countryName: 'Brasil', title: 'CYCLE 1 T+0M INITIAL LIVE', category: 'Radar', url: '/radar' },
          { a2: 'US', countryName: 'Estados Unidos', title: 'T-12H OLD HIGH SCORE 99', category: 'Política', url: '/radar' },
        ],
      },
      assetFeedOutput: [],
    });

    // Cycle 1 (T+0m): Boot /radar -> T+0m ranks ahead of T-12h score=99
    const app1 = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/radar',
      storageMap: sharedStorage,
      mockUpstream: upstream,
    });
    try {
      assert.equal(app1.document.querySelector('#radar-cards-list .radar-card-title').textContent.trim(), 'CYCLE 1 T+0M INITIAL LIVE');

      // Cycle 2 (T+30m): Breaking T+30m (score 80 < 99) ingested; T+0m keeps original timestamp
      const t30 = now + 30 * 60_000;
      app1.advanceClock(30 * 60_000);
      upstream.state.vitrineIa = {
        updatedAt: new Date(t30).toISOString(),
        temas_ativos: [
          {
            slug: 't30-breaking',
            titulo_tema: 'CYCLE 2 T+30M BREAKING SCORE 80',
            categoria_primaria: 'Economia',
            paises_envolvidos: ['BR'],
            urgencia_score: 80,
            data_publicacao: isoMinutesAgo(1, t30),
            gatilho_vitrine: 'Novo T+30m',
            sintese_nerd: 'Novo T+30m',
          },
          ...upstream.state.vitrineIa.temas_ativos,
        ],
      };
      upstream.state.noticiasQuentesApi = {
        ok: true,
        updatedAt: new Date(t30).toISOString(),
        noticias_quentes: [
          { slug: 't30-breaking', titulo_curto: 'CYCLE 2 T+30M BREAKING SCORE 80', paises_envolvidos: ['BR'], urgencia_score: 80, data_publicacao: isoMinutesAgo(1, t30) },
          { slug: 't-12h-old', titulo_curto: 'T-12H OLD HIGH SCORE 99', paises_envolvidos: ['US'], urgencia_score: 99, data_publicacao: isoHoursAgo(12, now) },
        ],
        paises_em_alta: [
          { a2: 'BR', countryName: 'Brasil', title: 'CYCLE 2 T+30M BREAKING SCORE 80', category: 'Economia', url: '/radar' },
        ],
      };

      // Cycle 3 (T+45m): Manual click on #btn-atualizar-radar + periodic pulse
      app1.advanceClock(15 * 60_000);
      const btnRadar = app1.document.getElementById('btn-atualizar-radar');
      assert.ok(btnRadar);
      btnRadar.click();
      await app1.settle();
      assert.equal(app1.document.querySelector('#radar-cards-list .radar-card-title').textContent.trim(), 'CYCLE 2 T+30M BREAKING SCORE 80');

      // Cycle 4 (T+60m): Transient 502 on backend during auto-refresh while stale disk feed_output.json exists
      app1.advanceClock(15 * 60_000);
      upstream.state.vitrineIa = { __status: 502 };
      upstream.state.feedOutput = { __status: 502 };
      upstream.state.assetVitrineIa = { updatedAt: isoHoursAgo(12, now), temas_ativos: [] };
      upstream.state.assetFeedOutput = [
        {
          id: 'stale-disk-12h',
          titulo: 'DISK FEED_OUTPUT STALE T-12H',
          resumo: 'Velho disco',
          analise: 'Velho disco',
          categoria: 'geopolitica',
          fonte_nome: 'Disco Antigo',
          fonte_url: 'https://disk.ex/old',
          data_publicacao: isoHoursAgo(12, now),
        },
      ];

      const fbRes = await worker.fetch(new Request('https://www.rodandoomundo.com.br/api/radar'), upstream.env);
      assert.ok((fbRes.headers.get('cache-control') || '').includes('no-store'));

      await app1.fireIntervals(300_000, 360_000);
      const textAfter502 = app1.document.getElementById('radar-cards-list').textContent;
      assert.ok(textAfter502.includes('CYCLE 2 T+30M BREAKING SCORE 80'), 'Transient 502 auto-refresh must NOT revert Radar DOM to stale 12h disk snapshot');
      assert.ok(!textAfter502.includes('DISK FEED_OUTPUT STALE T-12H'));

      // Backend recovers at T+62m with T+60m breaking item
      const t62 = now + 62 * 60_000;
      app1.advanceClock(2 * 60_000);
      upstream.state.vitrineIa = {
        updatedAt: new Date(t62).toISOString(),
        temas_ativos: [
          {
            slug: 't60-breaking',
            titulo_tema: 'CYCLE 4 T+60M RECOVERY BREAKING',
            categoria_primaria: 'Geopolitica_Radar',
            paises_envolvidos: ['BR'],
            urgencia_score: 78,
            data_publicacao: isoMinutesAgo(1, t62),
            gatilho_vitrine: 'Recuperado T+60m',
            sintese_nerd: 'Recuperado T+60m',
          },
          {
            slug: 't30-breaking',
            titulo_tema: 'CYCLE 2 T+30M BREAKING SCORE 80',
            categoria_primaria: 'Economia',
            paises_envolvidos: ['BR'],
            urgencia_score: 80,
            data_publicacao: isoMinutesAgo(1, t30),
            gatilho_vitrine: 'Novo T+30m',
            sintese_nerd: 'Novo T+30m',
          },
        ],
      };
      upstream.state.feedOutput = [];
      upstream.state.noticiasQuentesApi = {
        ok: true,
        updatedAt: new Date(t62).toISOString(),
        noticias_quentes: [
          { slug: 't60-breaking', titulo_curto: 'CYCLE 4 T+60M RECOVERY BREAKING', paises_envolvidos: ['BR'], urgencia_score: 78, data_publicacao: isoMinutesAgo(1, t62) },
        ],
        paises_em_alta: [{ a2: 'BR', countryName: 'Brasil', title: 'CYCLE 4 T+60M RECOVERY BREAKING', category: 'Radar', url: '/radar' }],
      };

      await app1.fireIntervals(300_000, 360_000);
      assert.equal(app1.document.querySelector('#radar-cards-list .radar-card-title').textContent.trim(), 'CYCLE 4 T+60M RECOVERY BREAKING');
    } finally {
      app1.cleanup();
    }

    // Cycle 5 (T+65m): Full page reload on / then navigate to /radar
    const appReload = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/',
      storageMap: sharedStorage,
      mockUpstream: upstream,
      initialClockOffsetMs: 65 * 60_000,
    });
    try {
      assert.equal(
        appReload.document.querySelector('#pulsando-agora-track .pulsando-card[data-country-iso="BR"] .pulsando-card-title').textContent.trim(),
        'CYCLE 4 T+60M RECOVERY BREAKING'
      );
      const radarLink = appReload.document.querySelector('a[href="/radar"][data-spa-link]');
      assert.ok(radarLink);
      radarLink.click();
      await appReload.settle();
      assert.equal(appReload.document.querySelector('#radar-cards-list .radar-card-title').textContent.trim(), 'CYCLE 4 T+60M RECOVERY BREAKING');
    } finally {
      appReload.cleanup();
    }
  });

  test('T4-03: 4-Cycle Edge RSS Multi-Section Lifecycle (Resumo + Últimas + Atlas JP: stale localStorage, undated RSS, Atom <entry>, 500 no-store, reload)', async () => {
    const now = Date.now();
    const todayStr = new Date(now).toISOString().slice(0, 10);
    const sharedStorage = new Map([
      ['rom_resumo_date', todayStr],
      ['rom_resumo_items', JSON.stringify([
        { relevancia: 1, categoria: 'Brasil', titulo: 'STALE YESTERDAY LOCKED RESUMO', resumo: 'Velho', fonte: 'Velho', url: 'https://old.ex/r1', codigoPais: 'BR' },
        { relevancia: 2, categoria: 'Mundo', titulo: 'STALE YESTERDAY LOCKED RESUMO 2', resumo: 'Velho', fonte: 'Velho', url: 'https://old.ex/r2', codigoPais: 'US' },
        { relevancia: 3, categoria: 'Economia', titulo: 'STALE YESTERDAY LOCKED RESUMO 3', resumo: 'Velho', fonte: 'Velho', url: 'https://old.ex/r3', codigoPais: 'BR' },
      ])],
      ['rom_ultimas_noticias', JSON.stringify({
        ts: now - 3_600_000,
        atualizadoEm: isoHoursAgo(1, now),
        noticias: [
          { id: 's1', titulo: 'STALE ULTIMAS 1', url: 'https://s.ex/1', fonte: 'Old', regiao: 'nacional', regiaoLabel: 'Nacional', publicadoEm: isoHoursAgo(1, now) },
          { id: 's2', titulo: 'STALE ULTIMAS 2', url: 'https://s.ex/2', fonte: 'Old', regiao: 'nacional', regiaoLabel: 'Nacional', publicadoEm: isoHoursAgo(2, now) },
          { id: 's3', titulo: 'STALE ULTIMAS 3', url: 'https://s.ex/3', fonte: 'Old', regiao: 'nacional', regiaoLabel: 'Nacional', publicadoEm: isoHoursAgo(3, now) },
        ],
      })],
      ['rom_atlas_pais_JP', JSON.stringify({
        ts: now - 3_600_000,
        updatedAt: isoHoursAgo(1, now),
        items: [{ id: 'jold', titleOriginal: 'Stale JP Cache', titlePt: 'Cache Velho JP', url: 'https://jp.old/1', source: 'Old', publishedAt: isoHoursAgo(5, now) }],
      })],
    ]);

    let rssStage = 1;
    const upstream = createMockUpstream({
      rssHandler: (urlStr) => {
        if (rssStage === 3) return { status: 500, body: 'RSS Upstream 500' };
        if (rssStage === 1) {
          return buildRssXml([
            { title: 'R1 Undated Item - Fonte', link: 'https://ex/undated', pubDate: '', description: 'Sem data' },
            { title: 'R1 Brasil Economia Cycle 1 - G1', link: 'https://ex/r1-a', pubDate: rfc2822HoursAgo(0.1, now), description: 'Resumo R1 A' },
            { title: 'R1 Brasil Política Cycle 1 - Folha', link: 'https://ex/r1-b', pubDate: rfc2822HoursAgo(0.2, now), description: 'Resumo R1 B' },
            { title: 'R1 Mundo Cycle 1 - BBC', link: 'https://ex/r1-c', pubDate: rfc2822HoursAgo(0.3, now), description: 'Resumo R1 C' },
          ]);
        }
        const mins = rssStage === 2 ? 2 : 1;
        const tBase = rssStage === 2 ? now + 20 * 60_000 : now + 40 * 60_000;
        const tag = rssStage === 2 ? 'R2' : 'R3';
        return buildAtomXml([
          { title: `${tag} Breaking Atom Top - Agência Brasil`, link: `https://ex/${tag}-1`, published: isoMinutesAgo(mins, tBase), summary: `${tag} Breaking geopolitica` },
          { title: `${tag} Secondary Atom - G1`, link: `https://ex/${tag}-2`, published: isoMinutesAgo(mins + 2, tBase), summary: `${tag} Secondary economia` },
          { title: `${tag} Third Atom - Folha`, link: `https://ex/${tag}-3`, published: isoMinutesAgo(mins + 4, tBase), summary: `${tag} Third politica` },
        ]);
      },
    });

    // Cycle 1: Load Home + JP panel
    const app1 = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/',
      storageMap: sharedStorage,
      mockUpstream: upstream,
    });
    try {
      assert.ok(app1.document.getElementById('resumo-do-dia').textContent.includes('R1 Brasil Economia Cycle 1'), 'Cycle 1 Resumo must replace stale today lock with R1');
      assert.ok(!app1.document.getElementById('resumo-do-dia').textContent.includes('STALE YESTERDAY LOCKED RESUMO'));

      app1.window.selecionarPais('JP');
      await app1.settle();
      const jpText = app1.document.getElementById('atlas-live-news-list').textContent;
      assert.ok(jpText.includes('R1 Brasil Economia Cycle 1'), 'Cycle 1 Atlas JP must replace stale cache with R1');

      // Cycle 2 (T+20m): Upstream publishes R2 via Atom <entry>; click #btn-refresh-resumo-dia
      rssStage = 2;
      app1.advanceClock(20 * 60_000);
      const refreshResumo = app1.document.getElementById('btn-refresh-resumo-dia');
      assert.ok(refreshResumo);
      refreshResumo.click();
      await app1.settle();
      assert.ok(app1.document.getElementById('resumo-do-dia').textContent.includes('R2 Breaking Atom Top'));

      // Cycle 3 (T+35m): Upstream returns 500 -> Edge must return Cache-Control: no-store
      rssStage = 3;
      app1.advanceClock(15 * 60_000);
      upstream.activate();
      const errRes = await worker.fetch(new Request('https://www.rodandoomundo.com.br/api/resumo?refresh=1&_t=' + (now + 35 * 60_000)), upstream.env);
      assert.ok((errRes.headers.get('cache-control') || '').includes('no-store'));

      // Cycle 4 (T+40m): Upstream recovers with R3 -> full reload across Home, Últimas, and JP
      rssStage = 4;
    } finally {
      app1.cleanup();
    }

    const appReload = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/ultimas-noticias',
      storageMap: sharedStorage,
      mockUpstream: upstream,
      initialClockOffsetMs: 40 * 60_000,
    });
    try {
      const uText = appReload.document.getElementById('ultimas-content-container').textContent;
      assert.ok(uText.includes('R3 Breaking Atom Top'), 'Reloaded /ultimas-noticias must show R3 Atom headline');
      appReload.window.selecionarPais('JP');
      await appReload.settle();
      assert.ok(appReload.document.getElementById('atlas-live-news-list').textContent.includes('R3 Breaking Atom Top'), 'Reloaded JP Atlas must show R3');
    } finally {
      appReload.cleanup();
    }
  });

  test('T4-05: 4-Cycle Static Route Entry, Colunas V2 & Multi-Tab SPA Reload (/radar#colunas, popstate, reload)', async () => {
    const now = Date.now();
    const sharedStorage = new Map();
    const upstream = createMockUpstream({
      vitrineIa: {
        updatedAt: new Date(now).toISOString(),
        temas_ativos: [
          { slug: 'rad-1', titulo_tema: 'RAD-1 INITIAL', categoria_primaria: 'Geopolitica_Radar', data_publicacao: isoMinutesAgo(10, now) },
        ],
      },
      colunasApi: {
        ok: true,
        atualizado_em: 'Atualizado agora',
        colunas: [
          { slug: 'col-1', titulo: 'COL-1 INITIAL', categoria: 'Geopolítica', resumo: 'R1', analise_aprofundada: 'A1', rota_editoria: '/radar', updated_at: isoMinutesAgo(10, now) },
        ],
      },
    });

    // Cycle 1: Direct load /radar#colunas
    const app1 = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/radar#colunas',
      storageMap: sharedStorage,
      mockUpstream: upstream,
    });
    try {
      assert.equal(app1.document.getElementById('radar-tab-colunas').getAttribute('aria-selected'), 'true');
      assert.ok(app1.document.getElementById('radar-v2-colunas-wrap').textContent.includes('COL-1 INITIAL'));

      // Cycle 2: Advance clock past TTL & update backend to Col-2 & Rad-2
      const t2 = now + 2 * 3_600_000;
      app1.advanceClock(2 * 3_600_000);
      upstream.state.colunasApi = {
        ok: true,
        atualizado_em: 'Atualizado agora',
        colunas: [
          { slug: 'col-2', titulo: 'COL-2 NEWEST', categoria: 'Economia', resumo: 'R2', analise_aprofundada: 'A2', rota_editoria: '/radar', updated_at: isoMinutesAgo(1, t2) },
        ],
      };
      upstream.state.vitrineIa = {
        updatedAt: new Date(t2).toISOString(),
        temas_ativos: [
          { slug: 'rad-2', titulo_tema: 'RAD-2 NEWEST', categoria_primaria: 'Geopolitica_Radar', data_publicacao: isoMinutesAgo(1, t2) },
        ],
      };

      // Cycle 3: Navigate Home -> /ultimas-noticias -> back via popstate to /radar#colunas
      app1.document.querySelector('[data-home]').click();
      await app1.settle();
      const ultLink = app1.document.querySelector('a[href="/ultimas-noticias"][data-spa-link]');
      if (ultLink) {
        ultLink.click();
        await app1.settle();
      }
      app1.history.back();
      await app1.settle();
      app1.history.back();
      await app1.settle();
      assert.equal(app1.document.getElementById('radar-tab-colunas').getAttribute('aria-selected'), 'true');
      assert.ok(app1.document.getElementById('radar-v2-colunas-wrap').textContent.includes('COL-2 NEWEST'));
    } finally {
      app1.cleanup();
    }

    // Cycle 4: Full reload on /radar#colunas
    const appReload = await bootFrontendApp({
      url: 'https://www.rodandoomundo.com.br/radar#colunas',
      storageMap: sharedStorage,
      mockUpstream: upstream,
      initialClockOffsetMs: 2 * 3_600_000,
    });
    try {
      assert.equal(appReload.document.getElementById('radar-tab-colunas').getAttribute('aria-selected'), 'true');
      assert.ok(appReload.document.getElementById('radar-v2-colunas-wrap').textContent.includes('COL-2 NEWEST'));
      assert.ok(appReload.document.getElementById('radar-cards-list').textContent.includes('RAD-2 NEWEST'));
    } finally {
      appReload.cleanup();
    }
  });

  test('T4-07: 4-Cycle Full End-to-End Edge + Frontend Reload & Cache-Busting Simulation (_t= & refresh=1 across all views)', async () => {
    const now = Date.now();
    const sharedStorage = new Map();
    let cycle = 1;
    const upstream = createMockUpstream({
      rssHandler: () => buildAtomXml([
        { title: `E2E Cycle ${cycle} Primary Headline - Reuters`, link: `https://ex/c${cycle}-1`, published: isoMinutesAgo(1, now + cycle * 60_000), summary: `Summary C${cycle}` },
        { title: `E2E Cycle ${cycle} Second Headline - BBC`, link: `https://ex/c${cycle}-2`, published: isoMinutesAgo(3, now + cycle * 60_000), summary: `Summary C${cycle} B` },
        { title: `E2E Cycle ${cycle} Third Headline - G1`, link: `https://ex/c${cycle}-3`, published: isoMinutesAgo(5, now + cycle * 60_000), summary: `Summary C${cycle} C` },
      ]),
    });

    for (cycle = 1; cycle <= 4; cycle++) {
      const t = now + cycle * 60_000;
      upstream.state.vitrineIa = {
        updatedAt: new Date(t).toISOString(),
        temas_ativos: [
          {
            slug: `e2e-c${cycle}`,
            titulo_tema: `E2E CYCLE ${cycle} HEADLINE`,
            categoria_primaria: 'Economia',
            paises_envolvidos: ['BR'],
            urgencia_score: 95 - cycle, // Deliberately lower score on newer cycles!
            relevancia_score: 95 - cycle,
            data_publicacao: isoMinutesAgo(1, t),
            gatilho_vitrine: `C${cycle}`,
            sintese_nerd: `C${cycle}`,
          },
        ],
      };
      upstream.state.vitrineEmAltaApi = { ok: true, updatedAt: new Date(t).toISOString(), temas_ativos: upstream.state.vitrineIa.temas_ativos };
      upstream.state.noticiasQuentesApi = {
        ok: true,
        updatedAt: new Date(t).toISOString(),
        noticias_quentes: [{ slug: `e2e-c${cycle}`, titulo_curto: `E2E CYCLE ${cycle} HEADLINE`, paises_envolvidos: ['BR'], urgencia_score: 95 - cycle, data_publicacao: isoMinutesAgo(1, t) }],
        paises_em_alta: [{ a2: 'BR', countryName: 'Brasil', title: `E2E CYCLE ${cycle} HEADLINE`, category: 'Economia', url: '/radar' }],
      };

      const app = await bootFrontendApp({
        url: 'https://www.rodandoomundo.com.br/',
        storageMap: sharedStorage,
        mockUpstream: upstream,
        initialClockOffsetMs: cycle * 60_000,
      });
      try {
        // Assert Home Hot News & Resumo show current Cycle without reverting to Cycle 1
        assert.equal(
          app.document.querySelector('#pulsando-agora-track .pulsando-card[data-country-iso="BR"] .pulsando-card-title').textContent.trim(),
          `E2E CYCLE ${cycle} HEADLINE`
        );
        assert.ok(
          app.document.getElementById('resumo-do-dia').textContent.includes(`E2E Cycle ${cycle} Primary Headline`),
          `Resumo do Dia must update to Cycle ${cycle} on reload`
        );

        // Navigate to /radar and verify Radar + Vitrine IA
        const radarLink = app.document.querySelector('a[href="/radar"][data-spa-link]');
        radarLink.click();
        await app.settle();
        assert.equal(app.document.querySelector('#radar-cards-list .radar-card-title').textContent.trim(), `E2E CYCLE ${cycle} HEADLINE`);
      } finally {
        app.cleanup();
      }
    }
  });

  test('T4-08: 4-Cycle Multi-Cycle Weighted Search Expansion & Vitrine Refresh Continuity (GEMINI.md Rule 7)', async () => {
    const now = Date.now();
    const sharedStorage = new Map();
    const upstream = createMockUpstream({
      rssHandler: () => buildRssXml([
        { title: 'Banco Central monitora câmbio e juros externos - Agência Brasil', link: 'https://ex/bc-1', pubDate: rfc2822HoursAgo(1, now), description: 'Decisão sobre selic e dólar em Brasília.' },
        { title: 'Tarifas comerciais na Ásia afetam exportações - Folha', link: 'https://ex/asia-2', pubDate: rfc2822HoursAgo(2, now), description: 'Indústria acompanha semicondutores e comércio.' },
        { title: 'Mercado de trabalho registra alta - G1', link: 'https://ex/trab-3', pubDate: rfc2822HoursAgo(3, now), description: 'Emprego formal cresce no trimestre.' },
      ]),
    });

    for (let cycle = 1; cycle <= 4; cycle++) {
      const t = now + cycle * 120_000;
      const kwExtra = `termo_c${cycle}`;
      upstream.state.vitrineEmAltaApi = {
        ok: true,
        updatedAt: new Date(t).toISOString(),
        temas_ativos: [
          {
            slug: `tema-search-c${cycle}`,
            titulo_tema: `TEMA SEARCH CICLO ${cycle}`,
            categoria_primaria: 'Economia',
            relevancia_score: 90,
            data_publicacao: isoMinutesAgo(1, t),
            palavras_chave_busca: ['cambio', 'selic', kwExtra],
            gatilho_vitrine: 'Expansão semântica',
            sintese_nerd: 'Expansão semântica',
          },
        ],
      };
      upstream.state.buscaExpansaoApi = {
        ok: true,
        termo_original: 'cambio',
        termos_turbinados: ['cambio', 'selic', 'dolar', kwExtra],
        contextos_relacionados: upstream.state.vitrineEmAltaApi.temas_ativos,
      };

      const app = await bootFrontendApp({
        url: 'https://www.rodandoomundo.com.br/ultimas-noticias',
        storageMap: sharedStorage,
        mockUpstream: upstream,
        initialClockOffsetMs: cycle * 120_000,
      });
      try {
        const inp = app.document.getElementById('ultimas-search-input');
        assert.ok(inp);
        inp.value = `cambio brasil ${kwExtra} mercado`;
        inp.dispatchEvent({ type: 'input', bubbles: true });
        await app.settle();
        const cards = app.document.querySelectorAll('#ultimas-content-container .ultimas-card');
        assert.ok(cards.length >= 1, `Cycle ${cycle}: weighted search must return relevant contextual matches without empty screen`);
      } finally {
        app.cleanup();
      }
    }
  });
});
