/**
 * Cloudflare Pages Worker (_worker.js)
 * 1. Despacha rotas /api/* para os módulos em functions/api/* (evitando sombreamento)
 * 2. Faz proxy das rotas FastAPI (/v1/*, /v2/*) para CURADORIA_BACKEND_URL
 * 3. Garante roteamento nativo de SPA (Single Page Application) sem erros 404
 */
import * as apiAtlasPais from './functions/api/atlas-pais.js';
import * as apiBuscaAssunto from './functions/api/busca-assunto.js';
import * as apiNewsletterSubscribe from './functions/api/newsletter-subscribe.js';
import * as apiNoticiasQuentes from './functions/api/noticias-quentes.js';
import * as apiNoticias from './functions/api/noticias.js';
import * as apiPesquisa from './functions/api/pesquisa.js';
import * as apiResumo from './functions/api/resumo.js';
import * as apiTraduzir from './functions/api/traduzir.js';
import * as apiUltimasNoticias from './functions/api/ultimas-noticias.js';
import * as apiVitrineEmAlta from './functions/api/vitrine-em-alta.js';
import { sortirCardsRodizioAmplo } from './functions/api/radar.js';
import {
  isRefreshRequest,
  newsResponseHeaders,
  parseTimestampIso,
  resolverBackendUrl,
  STATIC_SITE_HOSTS,
} from './functions/lib/rss.js';

const API_FUNCTION_ROUTES = {
  '/api/atlas-pais': apiAtlasPais,
  '/api/busca-assunto': apiBuscaAssunto,
  '/api/newsletter-subscribe': apiNewsletterSubscribe,
  '/api/noticias-quentes': apiNoticiasQuentes,
  '/api/noticias': apiNoticias,
  '/api/pesquisa': apiPesquisa,
  '/api/resumo': apiResumo,
  '/api/traduzir': apiTraduzir,
  '/api/ultimas-noticias': apiUltimasNoticias,
  '/api/vitrine-em-alta': apiVitrineEmAlta,
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Admin-User'
};

function getResendKey(env = {}) {
  if (env.RESEND_API_KEY) return env.RESEND_API_KEY;
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('re_')) return k;
    if (typeof v === 'string' && v.startsWith('re_')) return v;
  }
  return 're_QpeSXWvN_2N1aagUEH3yF4cpM9hBGkJix';
}

async function handleTesteEnvio(request, env, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'Método não permitido' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const testEmail = url.searchParams.get('email') || url.searchParams.get('teste');
  const apiKey = (env && env.RESEND_API_KEY) || getResendKey(env);

  if (!apiKey) {
    return new Response(JSON.stringify({
      status: 'erro_configuracao',
      mensagem: 'A variável RESEND_API_KEY não foi detectada no Cloudflare Pages.'
    }, null, 2), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  if (!testEmail) {
    return new Response(JSON.stringify({
      status: 'chave_encontrada',
      mensagem: 'A chave RESEND_API_KEY está configurada no Cloudflare Pages! Para testar o envio, passe seu e-mail na URL.',
      exemplo_url: '/api/teste-envio?email=seu-email@gmail.com'
    }, null, 2), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const fromEmail = (env && env.RESEND_FROM_EMAIL) || 'Rodando o Mundo <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [testEmail],
        subject: 'Teste de Envio — Rodando o Mundo (Cloudflare Pages)',
        html: `<div style="font-family:sans-serif;padding:20px;background:#0d1117;color:#c9d1d9;border-radius:8px;">
          <h2 style="color:#58a6ff;">Rodando o Mundo — E-mail de Teste</h2>
          <p>A integração com o <strong>Resend</strong> via <strong>Cloudflare Pages</strong> está funcionando com sucesso.</p>
          <p>Horário do teste: ${escapeHtml(new Date().toLocaleString('pt-BR'))}</p>
        </div>`
      })
    });
    const resJson = await res.json().catch(() => ({}));
    return new Response(JSON.stringify({
      status: res.ok ? 'sucesso' : 'erro_resend',
      codigo_http_resend: res.status,
      resposta_resend: resJson,
      destinatario: testEmail,
      remetente: fromEmail
    }, null, 2), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: 'erro_execucao', erro: err.message }, null, 2), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

async function handleBackendProxy(request, env, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const backendUrl = String((env && env.CURADORIA_BACKEND_URL) || '').trim().replace(/\/+$/, '');
  if (!backendUrl || backendUrl.includes('api.rodandoomundo.com.br')) {
    return new Response(JSON.stringify({
      ok: false,
      detail: 'O backend FastAPI (Motor V2 em Python) roda localmente no seu computador. Inicie o servidor (iniciar_servidor_fastapi.bat) e acesse o painel pelo endereço: http://127.0.0.1:8000/admin'
    }), {
      status: 503,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  let targetUrl;
  try {
    targetUrl = new URL(url.pathname + url.search, backendUrl);
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      detail: 'CURADORIA_BACKEND_URL inválida no Cloudflare Pages.'
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  // Evita loop recursivo caso CURADORIA_BACKEND_URL aponte para o próprio domínio estático ou cabeçalho de salto
  if (
    request.headers.get('X-ROM-Edge-Proxy') === '1' ||
    request.headers.get('X-Rom-Edge-Hop') === '1' ||
    targetUrl.hostname === url.hostname ||
    STATIC_SITE_HOSTS.has(targetUrl.hostname.toLowerCase())
  ) {
    return new Response(JSON.stringify({
      ok: false,
      detail: 'CURADORIA_BACKEND_URL aponta para o próprio domínio estático. Configure a URL pública do backend FastAPI.'
    }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  // Previne chamadas loopback a partir do Cloudflare Edge (que causam 502 nativo no runtime)
  if (['127.0.0.1', 'localhost', '0.0.0.0', '::1', '[::1]'].includes(targetUrl.hostname)) {
    return new Response(JSON.stringify({
      ok: false,
      detail: 'CURADORIA_BACKEND_URL aponta para endereço local (' + targetUrl.hostname + '), inacessível pelo Cloudflare Edge. Configure no painel Admin (/admin) a URL da API FastAPI ou utilize um túnel público.'
    }), {
      status: 503,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete('host');
  forwardHeaders.set('X-ROM-Edge-Proxy', '1');
  forwardHeaders.set('X-Rom-Edge-Hop', '1');

  const init = {
    method: request.method,
    headers: forwardHeaders
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  try {
    const upstreamRes = await fetch(targetUrl.toString(), init);
    const respHeaders = new Headers(upstreamRes.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      respHeaders.set(k, v);
    }
    respHeaders.set('Cache-Control', 'no-store');

    // Se o upstream falhou com 502/503/504 (ex: proxy intermediário ou servidor desligado)
    if (upstreamRes.status === 502 || upstreamRes.status === 503 || upstreamRes.status === 504) {
      const upstreamText = await upstreamRes.text().catch(() => '');
      return new Response(JSON.stringify({
        ok: false,
        detail: `Backend FastAPI retornou status ${upstreamRes.status} (${upstreamRes.statusText || 'Bad Gateway'}). O servidor Python pode estar fora do ar ou reiniciando.`,
        upstream_error: upstreamText ? upstreamText.slice(0, 300) : null
      }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: respHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      detail: 'Falha ao conectar no backend FastAPI (' + (err && err.message ? err.message : 'erro de rede') + ').'
    }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
}

async function handleContato(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método não permitido' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  let data = {};
  try {
    data = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'JSON inválido' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  // Honeypot anti-spam
  if (data._honey) {
    return new Response(JSON.stringify({ ok: true, success: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  const destEmail = 'rodandoomundoprojeto@gmail.com';
  const apiKey = (env && env.RESEND_API_KEY) || 're_QpeSXWvN_2N1aagUEH3yF4cpM9hBGkJix';
  const userEmail = (data.email || data._replyto || data['E-mail'] || data['E-mail de Contato'] || '').trim();
  const subject = data._subject || 'Novo contato — Rodando o Mundo';

  // 1º Tenta envio via Resend se RESEND_API_KEY estiver configurada nas variáveis do Cloudflare Pages
  if (apiKey) {
    try {
      let rowsHtml = '';
      for (const [k, v] of Object.entries(data)) {
        if (k.startsWith('_') || k === 'email' || k === 'origem_endpoint') continue;
        rowsHtml += `
          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid #30363d;color:#8b949e;font-size:13px;font-weight:600;width:35%;vertical-align:top;">${escapeHtml(k)}</td>
            <td style="padding:10px 14px;border-bottom:1px solid #30363d;color:#f0f6fc;font-size:14px;line-height:1.5;">${escapeHtml(String(v)).replace(/\n/g, '<br>')}</td>
          </tr>`;
      }

      const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:24px 16px;background-color:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#c9d1d9;">
  <div style="max-width:620px;margin:0 auto;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:28px 24px;">
    <h1 style="color:#58a6ff;font-size:20px;margin:0 0 16px 0;">${escapeHtml(subject)}</h1>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">${rowsHtml}</table>
    ${userEmail ? `<div style="text-align:center;"><a href="mailto:${escapeHtml(userEmail)}" style="background:#1f6feb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;display:inline-block;">Responder para ${escapeHtml(userEmail)}</a></div>` : ''}
  </div>
</body>
</html>`;

      const emailPayload = {
        from: (env && env.RESEND_FROM_EMAIL) || 'Rodando o Mundo <onboarding@resend.dev>',
        to: [destEmail],
        subject: subject,
        html: emailHtml
      };
      if (userEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userEmail)) {
        emailPayload.reply_to = userEmail;
      }

      const resResend = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailPayload)
      });

      if (resResend.ok) {
        return new Response(JSON.stringify({ ok: true, success: true, canal: 'resend_cloudflare' }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }
    } catch (e) {
      // continua para fallback
    }
  }

  // 2º Fallback server-side via FormSubmit (com DNS e IP públicos limpos a partir do Cloudflare Edge)
  try {
    const fsRes = await fetch('https://formsubmit.co/ajax/' + destEmail, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://www.rodandoomundo.com.br',
        'Referer': 'https://www.rodandoomundo.com.br/clube'
      },
      body: JSON.stringify(data)
    });
    const fsData = await fsRes.json().catch(() => ({}));
    return new Response(JSON.stringify({ ok: true, success: true, canal: 'formsubmit_server', data: fsData }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  } catch (errFs) {
    return new Response(JSON.stringify({ ok: false, error: 'Falha no envio de contato' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
}

async function dispatchApiFunction(mod, request, env) {
  const method = request.method.toUpperCase();
  const handler =
    (method === 'GET' && mod.onRequestGet) ||
    (method === 'POST' && mod.onRequestPost) ||
    (method === 'OPTIONS' && mod.onRequestOptions) ||
    mod.onRequest;
  if (typeof handler === 'function') {
    return handler({ request, env });
  }
  return new Response(JSON.stringify({ ok: false, error: 'Método não permitido' }), {
    status: 405,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

const MAPA_CATEGORIA_RADAR_WORKER = {
  Geopolitica_Radar: 'geopolitica',
  Politica: 'politica',
  Economia: 'economia',
  Cultura: 'cultura',
  Eleicoes: 'politica',
  Resumo_Ultimas: 'geopolitica',
  Geopolitica_Relacoes: 'geopolitica',
  Economia_Comercio: 'economia',
  Sociedade_Cultura: 'cultura',
  Mobilidade_Fronteiras: 'geopolitica',
  Ciencia_Clima: 'geopolitica',
};

function normalizarRadar(str) {
  return String(str == null ? '' : str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function limparPrefixoGatilhoWorker(str) {
  return String(str || '')
    .replace(/^Síntese automática de contingência\s*\([^)]*\):\s*/i, '')
    .replace(/^Análise em dry-run baseada na fonte\s*[^:]*:\s*/i, '')
    .replace(/^Contexto associado nas buscas:\s*/i, '')
    .replace(/^[A-Z0-9_]{3,30}:\s*/, '')
    .trim();
}

function ehInstrucaoOuDebugWorker(txt) {
  if (!txt) return true;
  return /^(Destacar cobertura|Focar em|Análise em dry-run|Placeholder|TODO|Instrução|Prompt|Síntese automática de contingência)\b/i.test(txt);
}

function formatarHoraCurtaWorker(isoDateStr) {
  try {
    const dt = isoDateStr ? new Date(isoDateStr) : new Date();
    const d = Number.isNaN(dt.getTime()) ? new Date() : dt;
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const h = partes.find((p) => p.type === 'hour')?.value || '00';
    const m = partes.find((p) => p.type === 'minute')?.value || '00';
    return `Atualizado às ${h}h${m}`;
  } catch {
    return 'Atualizado agora';
  }
}

function formatarRotuloRelativoWorker(isoDateStr) {
  try {
    const dt = isoDateStr ? new Date(isoDateStr) : new Date();
    const t = dt.getTime();
    if (isNaN(t)) return 'Atualizado agora';
    const diffMs = Date.now() - t;
    let diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 0 && diffMs >= -300000) {
      diffMin = 0;
    }
    if (diffMin >= 0 && diffMin < 5) return 'Atualizado agora';
    if (diffMin >= 5 && diffMin < 60) return `Atualizado há ${diffMin} min`;
    return formatarHoraCurtaWorker(isoDateStr);
  } catch {
    return 'Atualizado agora';
  }
}

async function carregarAssetWorker(path, request, env) {
  try {
    const assetUrl = new URL(path.startsWith('/') ? path : '/' + path, request.url);
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const res = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
      if (res && res.ok) {
        return await res.json();
      }
    }
    const res = await fetch(assetUrl.toString(), { cache: 'no-store' });
    if (res && res.ok) {
      return await res.json();
    }
  } catch {
    // Falha silenciosa
  }
  return null;
}

const WORKER_STATE_MEMO = new Map();
const WORKER_STATE_MEMO_TTL_MS = 4 * 60 * 1000; // 4 minutos

async function carregarEstadoWorker(chave, request, env, isRefresh = false) {
  const backendUrl = resolverBackendUrl(env, request);
  if (!backendUrl) return null;

  if (!isRefresh && WORKER_STATE_MEMO.has(chave)) {
    const entry = WORKER_STATE_MEMO.get(chave);
    if (entry && (Date.now() - entry.ts < WORKER_STATE_MEMO_TTL_MS)) {
      return entry.data;
    }
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 14000);
  try {
    const sufixoRefresh = isRefresh ? `?_t=${Date.now()}&refresh=1` : '';
    const alvo = `${backendUrl}/v1/estado/${encodeURIComponent(chave)}${sufixoRefresh}`;
    const resp = await fetch(alvo, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-ROM-Edge-Proxy': '1',
        'X-Rom-Edge-Hop': '1',
      },
    });
    if (!resp || !resp.ok) {
      if (WORKER_STATE_MEMO.has(chave)) {
        return WORKER_STATE_MEMO.get(chave).data;
      }
      return null;
    }
    const data = await resp.json();
    const payload = data && Object.prototype.hasOwnProperty.call(data, 'payload') ? data.payload : data;
    if (!payload) return null;
    let res = null;
    if (Array.isArray(payload)) res = payload.length > 0 ? payload : null;
    else if (typeof payload === 'object') {
      // Espelha a regra do backend (api/routes_v2.py): snapshot sem temas_ativos
      // e sem noticias_quentes é "sem conteúdo" — cai para o asset versionado.
      if (Array.isArray(payload.temas_ativos) && payload.temas_ativos.length > 0) res = payload;
      else if (Array.isArray(payload.noticias_quentes) && payload.noticias_quentes.length > 0) res = payload;
    }
    if (res) {
      WORKER_STATE_MEMO.set(chave, { ts: Date.now(), data: res });
    }
    return res;
  } catch {
    if (WORKER_STATE_MEMO.has(chave)) {
      return WORKER_STATE_MEMO.get(chave).data;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function carregarEstadoOuAssetWorker(chave, path, request, env, isRefresh = false) {
  const estado = await carregarEstadoWorker(chave, request, env, isRefresh);
  if (estado) return { data: estado, fallback: false };
  const assetData = await carregarAssetWorker(path, request, env);
  return { data: assetData, fallback: true };
}

async function handleRadarHybrid(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const isRefresh = isRefreshRequest(request);
  const categoriaFiltro = normalizarRadar(url.searchParams.get('categoria') || 'todos');

  try {
    const [vitrineRes, feedRes] = await Promise.all([
      carregarEstadoOuAssetWorker('vitrine_ia', 'data/vitrine_ia.json', request, env, isRefresh),
      carregarEstadoOuAssetWorker('feed_output', 'data/feed_output.json', request, env, isRefresh),
    ]);

    const vitrineSnap = vitrineRes.data;
    const feedOutput = feedRes.data;
    const usedFallback = Boolean(vitrineRes.fallback || feedRes.fallback);
    const headers = newsResponseHeaders({ isRefresh, isFallback: usedFallback, corsHeaders: CORS_HEADERS });

    const temasVitrine =
      vitrineSnap && Array.isArray(vitrineSnap.temas_ativos) && vitrineSnap.temas_ativos.length > 0
        ? vitrineSnap.temas_ativos.filter((t) => t && typeof t === 'object')
        : [];

    const itensV2 = temasVitrine.map((t) => {
      const catRaw = t.categoria || t.categoria_primaria || 'Geopolitica_Radar';
      let catNorm = MAPA_CATEGORIA_RADAR_WORKER[catRaw] || normalizarRadar(catRaw) || 'geopolitica';
      const slug = t.slug || normalizarRadar(t.titulo_tema || t.titulo_curto || '').replace(/[^a-z0-9]+/g, '-');
      const titulo = t.titulo_tema || t.titulo_curto || t.titulo || '';

      const rawGatilho = limparPrefixoGatilhoWorker(t.gatilho_vitrine || t.resumo_pulso || t.resumo || '');
      const rawSintese = limparPrefixoGatilhoWorker(t.sintese_nerd || t.impacto_pratico || t.analise || '');

      let resumo = rawGatilho;
      let analise = rawSintese;

      if (ehInstrucaoOuDebugWorker(resumo)) {
        if (analise && !ehInstrucaoOuDebugWorker(analise)) {
          resumo = analise;
          analise = 'Tendência com forte aceleração de interesse monitorada pela curadoria em tempo real.';
        } else {
          resumo = titulo ? `Monitoramento informativo e desdobramentos em tempo real sobre ${titulo}.` : '';
          analise = 'Acompanhamento editorial e impactos práticos em avaliação pela equipe.';
        }
      }

      if (!analise || ehInstrucaoOuDebugWorker(analise) || analise === resumo) {
        analise = 'Tendência com forte aceleração de interesse monitorada pela curadoria em tempo real.';
      }

      if (catNorm === 'geopolitica') {
        const tLower = (titulo + ' ' + resumo).toLowerCase();
        if (/salário|décimo terceiro|economia|mercado|dólar|bolsa|imposto|inflação|selic/.test(tLower)) {
          catNorm = 'economia';
        } else if (/governo|stf|senado|câmara|eleições|presidente|ministro|prefeito|congresso/.test(tLower)) {
          catNorm = 'politica';
        } else if (/tempo|clima|chuva|show|cultura|turismo|viagem|música|filme|feriado|festival|caranguejo/.test(tLower)) {
          catNorm = 'cultura';
        }
      }
      const kws = Array.isArray(t.palavras_chave_busca)
        ? t.palavras_chave_busca
        : (Array.isArray(t.palavras_chave) ? t.palavras_chave : []);
      const paises = Array.isArray(t.paises_envolvidos) && t.paises_envolvidos.length > 0
        ? t.paises_envolvidos
        : ['BR'];
      const score = Number(t.urgencia_score || t.relevancia_score || 85);
      const urlsFontes = Array.isArray(t.fontes_urls) ? t.fontes_urls : [];
      const fonteUrl = urlsFontes[0] || t.fonte_url || t.rota_editoria || '/radar';
      const dataPub = parseTimestampIso(
        t.data_publicacao ||
        t.created_at ||
        t.publicado_em ||
        t.updated_at ||
        ''
      );

      return {
        id: `v2-${slug}`,
        slug,
        titulo,
        resumo,
        analise,
        categoria: ['geopolitica', 'politica', 'economia', 'cultura'].includes(catNorm) ? catNorm : 'geopolitica',
        fonte_nome: 'Síntese Rodando o Mundo · Pulso V2',
        fonte_url: fonteUrl,
        data_publicacao: dataPub,
        origem_v2: true,
        urgencia_score: score,
        paises_envolvidos: paises,
        palavras_chave: kws,
      };
    });

    const cardsFeed = Array.isArray(feedOutput)
      ? feedOutput
          .filter((card) => card && typeof card === 'object')
          .map((card, idx) => ({
            id: card.id || `feed-${idx + 1}`,
            slug: card.slug || '',
            titulo: card.titulo || '',
            resumo: card.resumo || '',
            analise: card.analise || '',
            categoria: normalizarRadar(card.categoria || 'geopolitica') || 'geopolitica',
            fonte_nome: card.fonte_nome || 'Radar Editorial',
            fonte_url: card.fonte_url || '/radar',
            data_publicacao: parseTimestampIso(
              card.data_publicacao ||
              card.created_at ||
              card.publicado_em ||
              card.updated_at ||
              ''
            ),
            origem_v2: false,
            urgencia_score: Number(card.urgencia_score || 70),
            paises_envolvidos: Array.isArray(card.paises_envolvidos) ? card.paises_envolvidos : [],
            palavras_chave: Array.isArray(card.palavras_chave) ? card.palavras_chave : [],
          }))
      : [];

    const titulosVistos = new Set();
    const combinados = [];

    for (const item of [...itensV2, ...cardsFeed]) {
      if (!item || typeof item !== 'object') continue;
      const chave = normalizarRadar(item.titulo);
      if (!chave || titulosVistos.has(chave)) continue;
      titulosVistos.add(chave);
      combinados.push(item);
    }

    const paraOrdenar = (categoriaFiltro && categoriaFiltro !== 'todos')
      ? combinados.filter((it) => normalizarRadar(it.categoria) === categoriaFiltro)
      : combinados;
    const filtrados = sortirCardsRodizioAmplo(paraOrdenar, 2);

    let maisRecenteIso = (vitrineSnap && vitrineSnap.updatedAt) || '';
    let maxTs = 0;
    for (const it of filtrados) {
      const ts = Date.parse(it?.data_publicacao || '') || 0;
      if (ts > maxTs && it?.data_publicacao) {
        maxTs = ts;
        maisRecenteIso = it.data_publicacao;
      }
    }
    const updatedAtIso = (vitrineSnap && vitrineSnap.updatedAt) || maisRecenteIso || '';

    return new Response(JSON.stringify({
      ok: true,
      cached: !isRefresh && !usedFallback,
      fallback: usedFallback,
      source: itensV2.length > 0 ? 'v2_hybrid' : 'feed_output',
      atualizado_em: maisRecenteIso ? formatarRotuloRelativoWorker(maisRecenteIso) : '',
      updatedAt: updatedAtIso,
      total: filtrados.length,
      items: filtrados,
    }), {
      status: 200,
      headers,
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      cached: false,
      fallback: true,
      source: 'error_fallback',
      items: [],
      total: 0,
      error: 'Falha no processamento do radar híbrido',
    }), {
      status: 200,
      headers: newsResponseHeaders({ isRefresh, isFallback: true, corsHeaders: CORS_HEADERS }),
    });
  }
}

async function handleEntendaOAssunto(request, env, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const backendUrl = resolverBackendUrl(env, request);
  const acao = url.searchParams.get('acao') || '';
  const slug = url.searchParams.get('slug') || '';
  const targetPath = slug
    ? `/v2/entenda-o-assunto/${encodeURIComponent(slug)}`
    : (acao === 'colunas' ? '/v2/colunas' : '/v2/colunas');

  if (backendUrl) {
    const proxyUrl = new URL(targetPath + url.search, backendUrl);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 14000);
    try {
      const res = await fetch(proxyUrl.toString(), {
        signal: ctrl.signal,
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'X-ROM-Edge-Proxy': '1',
          'X-Rom-Edge-Hop': '1',
        },
      });
      if (res.ok) {
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' }
        });
      }
    } catch (e) {
      // fallback para resposta offline limpa
    } finally {
      clearTimeout(timer);
    }
  }

  // Fallback resiliente: carregar snapshot do asset data/entenda_v2.json
  const snapLocal = await carregarAssetWorker('data/entenda_v2.json', request, env);
  if (snapLocal && Array.isArray(snapLocal.colunas || snapLocal.artigos)) {
    const colunas = snapLocal.colunas || snapLocal.artigos;
    if (colunas.length > 0) {
      if (slug) {
        const limpo = slug.trim().toLowerCase().replace(/^entenda-/, '');
        const achado = colunas.find((c) => {
          const s = String(c.slug || '').trim().toLowerCase().replace(/^entenda-/, '');
          return s === limpo;
        });
        if (achado) {
          return new Response(JSON.stringify({
            ok: true,
            fallback: true,
            source: 'entenda_snapshot',
            artigo: achado,
            coluna: achado,
            coluna_editorial: achado
          }), {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' }
          });
        }
      } else {
        return new Response(JSON.stringify({
          ok: true,
          fallback: true,
          source: 'entenda_snapshot',
          updatedAt: snapLocal.updatedAt || '',
          atualizado_em: snapLocal.atualizado_em || '',
          total: colunas.length,
          colunas: colunas,
          artigos: colunas
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' }
        });
      }
    }
  }

  return new Response(JSON.stringify({ ok: false, fallback: true, colunas: [], source: 'offline' }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Redirecionamento canônico 301 do domínio raiz (sem www) para www.rodandoomundo.com.br
    if (url.hostname === 'rodandoomundo.com.br') {
      return Response.redirect('https://www.rodandoomundo.com.br' + url.pathname + url.search, 301);
    }

    // Rota da API de Contato / Formulários
    if (url.pathname === '/api/contato') {
      return handleContato(request, env);
    }

    // Rota da API de Teste de Envio (Resend via Cloudflare)
    if (url.pathname === '/api/teste-envio') {
      return handleTesteEnvio(request, env, url);
    }

    // Proxy das rotas FastAPI (Motor V2 e V1) para CURADORIA_BACKEND_URL — evita fallback SPA (HTML/405)
    if (url.pathname.startsWith('/v2/') || url.pathname.startsWith('/v1/')) {
      return handleBackendProxy(request, env, url);
    }

    // Despacha rotas /api/* para os handlers em functions/api/*.js
    const apiMod = API_FUNCTION_ROUTES[url.pathname];
    if (apiMod) {
      return dispatchApiFunction(apiMod, request, env);
    }

    // Rota /api/radar: serve conteúdo dinâmico e fresco com rodízio amplo e suporte a refresh
    if (url.pathname === '/api/radar') {
      return handleRadarHybrid(request, env);
    }

    // Rota /api/entenda-o-assunto: proxy para /v2/colunas ou /v2/entenda-o-assunto/{slug}
    if (url.pathname === '/api/entenda-o-assunto') {
      return handleEntendaOAssunto(request, env, url);
    }

    // Repassar outras chamadas /api/ normalmente
    if (url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    // Bloqueia acesso público a arquivos internos, scripts, documentações e modelos sensíveis
    const blockedPaths = [
      /^\/(\.agents|\.antigravity|\.github|\.pytest_cache|config|curadoria|docs|functions|migrations|redacao_v2|src|workers|_backups)(\/|$)/i,
      /\.(md|py|toml|zip|sql|ya?ml)$/i,
      /^\/(GEMINI\.md|PLANO_DEFINITIVO_V2\.md|LEIA-ME\.txt|requirements\.txt|\.env|\.assetsignore)$/i
    ];
    if (blockedPaths.some(rx => rx.test(url.pathname))) {
      return new Response('Not Found', { status: 404 });
    }

    // Tentar servir o arquivo estático existente (HTML, CSS, JS, SVG, imagens, etc.)
    const response = await env.ASSETS.fetch(request);

    // Se o arquivo estático foi encontrado com sucesso, retorna-o
    if (response.status !== 404) {
      return response;
    }

    // Se retornou 404 e é uma rota SPA (sem extensão de arquivo como .js, .css, .png, etc.)
    const isStaticFileWithExt = /\.[a-zA-Z0-9]+$/.test(url.pathname);
    if (!isStaticFileWithExt) {
      // Serve a raiz / para obter o index.html renderizado nativamente pelo Cloudflare Assets
      const rootRequest = new Request(new URL('/', request.url), request);
      const rootResponse = await env.ASSETS.fetch(rootRequest);

      // Sanitiza cabeçalhos: remove qualquer Location residual de redirect e assegura HTML UTF-8
      const headers = new Headers(rootResponse.headers);
      headers.delete('Location');
      headers.set('Content-Type', 'text/html; charset=utf-8');
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate');

      return new Response(rootResponse.body, {
        status: 200,
        headers: headers
      });
    }

    // Arquivos estáticos reais inexistentes (ex: imagem.png faltando) continuam com 404
    return response;
  }
};
