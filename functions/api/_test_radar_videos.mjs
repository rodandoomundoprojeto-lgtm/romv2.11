import { onRequestGet } from './radar.js';
import fs from 'node:fs';

const localFeed = JSON.parse(fs.readFileSync('data/feed_output.json', 'utf8'));
const localVitrine = JSON.parse(fs.readFileSync('data/vitrine_ia.json', 'utf8'));

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/v1/estado/feed_output')) {
    return { ok: true, json: async () => ({ ok: true, chave: 'feed_output', origem: 'db', payload: localFeed }) };
  }
  if (u.includes('/v1/estado/vitrine_ia')) {
    return { ok: true, json: async () => ({ ok: true, chave: 'vitrine_ia', origem: 'db', payload: localVitrine }) };
  }
  throw new Error('unexpected url: ' + u);
};

const fileYt = localFeed.filter((c) => /youtube/i.test(String(c.fonte_url || '')));
console.log('local feed_output.json YouTube cards:', fileYt.length);
const vitryo = [];
(localVitrine.temas_ativos || []).forEach((t) => {
  (t.fontes_urls || []).forEach((u) => { if (/youtube/i.test(u)) vitryo.push(String(t.titulo_curso || t.titulo_tema || '').slice(0, 40)); });
});
console.log('local vitrine_ia.json YouTube themes:', vitryo.length);

const req = new Request('https://rodandoomundo.com.br/api/radar?refresh=1');
const resp = await onRequestGet({ request: req, env: { CURADORIA_BACKEND_URL: 'https://example.invalid' } });
const data = await resp.json();
const vids = (data.items || []).filter((i) => /youtube/i.test(String(i.fonte_url || '')) || String(i.formato || '') === 'video');
console.log('radar response video items:', vids.length);
const fileUrls = new Set(fileYt.map((c) => c.fonte_url));
vids.forEach((v) => {
  const inFile = fileUrls.has(v.fonte_url);
  console.log((inFile ? '[file]' : '[OTHER]'), String(v.titulo || '').slice(0, 55), '|', v.fonte_url);
});
