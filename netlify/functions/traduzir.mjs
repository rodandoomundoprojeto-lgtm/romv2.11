// POST /api/traduzir  { lang: "en", itens: { "chave": "texto", ... } }
// Traduz os textos de um resultado já pesquisado, sem refazer a busca (mais barato).
// Links, datas e nomes de veículos não são enviados; só os textos.
import { IDIOMAS, json, chat, extrairJSON } from '../lib/ia.mjs';

const MODELO = process.env.MODELO_TRADUCAO || 'gpt-5-mini';
const SEM_CACHE = { 'Cache-Control': 'no-store' };
const MAX_CHARS = 32000;

async function traduzirTextoUnitario(texto, destino) {
  if (!texto || !texto.trim()) return texto;
  // 1. Tentar clients5 (Google Chrome Dict - não bloqueado e veloz)
  try {
    const url =
      'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=' +
      encodeURIComponent(destino) +
      '&q=' +
      encodeURIComponent(texto);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      const tr = (Array.isArray(j) && ((Array.isArray(j[0]) && j[0][0]) || (typeof j[0] === 'string' && j[0]))) || '';
      if (tr && typeof tr === 'string' && tr.trim()) {
        return tr.trim();
      }
    }
  } catch {}

  // 2. Fallback MyMemory
  try {
    const urlMm =
      'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent(texto) +
      '&langpair=autodetect|' +
      encodeURIComponent(destino);
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 4000);
    const r2 = await fetch(urlMm, { signal: ctrl2.signal });
    clearTimeout(t2);
    if (r2.ok) {
      const j2 = await r2.json();
      if (j2 && j2.responseData && j2.responseData.translatedText) {
        return j2.responseData.translatedText.trim() || texto;
      }
    }
  } catch {}

  return texto;
}

async function traduzirFallbackGoogle(limpos, lang) {
  const destino = lang === 'pt' ? 'pt' : lang;
  const entradas = Object.entries(limpos);
  const saida = {};
  const TAM_LOTE = 6;

  for (let i = 0; i < entradas.length; i += TAM_LOTE) {
    const fatia = entradas.slice(i, i + TAM_LOTE);
    const paresFatia = await Promise.all(
      fatia.map(async ([k, texto]) => {
        const trad = await traduzirTextoUnitario(texto, destino);
        return [k, trad || texto];
      })
    );
    for (const [k, v] of paresFatia) saida[k] = v;
  }
  return saida;
}

export default async (req) => {
  if (req.method !== 'POST') return json({ erro: 'metodo' }, 405, SEM_CACHE);
  let corpo;
  try { corpo = await req.json(); } catch { return json({ erro: 'formato' }, 400, SEM_CACHE); }
  const lang = corpo && IDIOMAS[corpo.lang] ? corpo.lang : null;
  const itens = corpo && corpo.itens && typeof corpo.itens === 'object' ? corpo.itens : null;
  if (!lang || !itens) return json({ erro: 'formato' }, 400, SEM_CACHE);

  const limpos = {};
  let total = 0;
  for (const [k, v] of Object.entries(itens).slice(0, 200)) {
    if (!/^[a-z0-9_]{1,24}$/i.test(k)) continue;
    const s = String(v == null ? '' : v).slice(0, 1200);
    if (total + s.length > MAX_CHARS) break;
    total += s.length;
    if (s) limpos[k] = s;
  }
  if (!Object.keys(limpos).length) return json({ itens: {} }, 200, SEM_CACHE);

  try {
    const resp = await chat({
      model: MODELO,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Você é um tradutor jornalístico. Traduza para ' + IDIOMAS[lang] + ' cada valor do objeto JSON recebido. ' +
            'Mantenha exatamente o sentido, sem acrescentar, remover, suavizar ou opinar. Preserve nomes próprios, siglas e números. ' +
            'Se um valor já estiver no idioma de destino, devolva-o igual. Responda apenas com um objeto JSON com as mesmas chaves.',
        },
        { role: 'user', content: JSON.stringify(limpos) },
      ],
    }, 45000);
    const conteudo = resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content;
    const dados = extrairJSON(conteudo);
    if (!dados) throw new Error('JSON inválido do modelo');
    const saida = {};
    Object.keys(limpos).forEach((k) => { saida[k] = typeof dados[k] === 'string' && dados[k].trim() ? dados[k].trim().slice(0, 1500) : limpos[k]; });
    return json({ lang, itens: saida }, 200, SEM_CACHE);
  } catch (err) {
    console.warn('[traduzir] usando fallback automático:', err && err.code, err && err.message);
    try {
      const saidaFallback = await traduzirFallbackGoogle(limpos, lang);
      return json({ lang, itens: saidaFallback, fallback: true }, 200, SEM_CACHE);
    } catch {
      if (err.code === 'limite') return json({ erro: 'limite' }, 429, SEM_CACHE);
      if (err.code === 'tempo') return json({ erro: 'tempo' }, 504, SEM_CACHE);
      return json({ erro: 'falha' }, 502, SEM_CACHE);
    }
  }
};

export const config = {
  path: '/api/traduzir',
  method: 'POST',
  rateLimit: { windowLimit: 15, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
