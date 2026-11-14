// Utilitários compartilhados pelas funções de IA do Rodando o Mundo (Cloudflare Pages Functions).

export const IDIOMAS = {
  pt: 'português do Brasil',
  en: 'inglês',
  es: 'espanhol',
  fr: 'francês',
  it: 'italiano',
};

export const MAX_TERMO = 100;

export function limparTermo(s) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f<>{}\[\]`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TERMO);
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...headers,
    },
  });
}

function gateway(env = {}) {
  const base = env.OPENAI_BASE_URL || env.OPENROUTER_BASE_URL;
  const key = env.OPENAI_API_KEY || env.OPENROUTER_API_KEY;
  if (!base || !key) return null;
  return { url: base.replace(/\/+$/, '') + '/chat/completions', key };
}

// Chamada no formato Chat Completions (OpenAI SDK compatível).
export async function chat(payload, env = {}, timeoutMs = 50000) {
  const gw = gateway(env);
  if (!gw) {
    const e = new Error('AI Gateway indisponível (chaves OPENAI_API_KEY / OPENROUTER_API_KEY não configuradas)');
    e.code = 'sem_gateway';
    throw e;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(gw.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + gw.key },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const txt = await r.text();
    if (!r.ok) {
      const e = new Error('Gateway respondeu ' + r.status + ': ' + txt.slice(0, 300));
      e.code = r.status === 429 ? 'limite' : 'gateway';
      throw e;
    }
    return JSON.parse(txt);
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('Tempo esgotado');
      e.code = 'tempo';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

// Extrai o primeiro objeto JSON de um texto.
export function extrairJSON(texto) {
  if (!texto) return null;
  const s = String(texto).replace(/```(?:json)?/gi, '');
  const ini = s.indexOf('{');
  const fim = s.lastIndexOf('}');
  if (ini < 0 || fim <= ini) return null;
  try { return JSON.parse(s.slice(ini, fim + 1)); } catch { return null; }
}

// Normaliza URL para comparar links da resposta com as fontes realmente consultadas.
export function chaveURL(u) {
  try {
    const x = new URL(String(u).trim());
    if (!/^https?:$/.test(x.protocol)) return null;
    x.hash = '';
    [...x.searchParams.keys()].forEach((k) => { if (/^(utm_|fbclid|gclid|ref$|amp$)/i.test(k)) x.searchParams.delete(k); });
    const host = x.hostname.toLowerCase().replace(/^www\d*\./, '').replace(/^m\./, '');
    const path = x.pathname.replace(/\/amp\/?$/, '/').replace(/\/+$/, '');
    return host + path + (x.search || '');
  } catch { return null; }
}

export function dominio(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\d*\./, ''); } catch { return ''; }
}
