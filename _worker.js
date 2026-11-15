/**
 * Cloudflare Pages Worker (_worker.js)
 * 1. Despacha rotas /api/* para os módulos em functions/api/* (evitando sombreamento)
 * 2. Faz proxy das rotas FastAPI (/v1/*, /v2/*) para CURADORIA_BACKEND_URL
 * 3. Garante roteamento nativo de SPA (Single Page Application) sem erros 404
 */
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

const API_FUNCTION_ROUTES = {
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
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization'
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
  if (!backendUrl) {
    return new Response(JSON.stringify({
      ok: false,
      detail: 'Backend FastAPI não configurado no Cloudflare Pages (variável CURADORIA_BACKEND_URL ausente). Preencha "URL da API FastAPI" no painel Admin com o endereço do servidor Python.'
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

  // Evita loop recursivo caso CURADORIA_BACKEND_URL aponte para o próprio domínio estático
  if (targetUrl.hostname === url.hostname) {
    return new Response(JSON.stringify({
      ok: false,
      detail: 'CURADORIA_BACKEND_URL aponta para o próprio domínio estático. Configure a URL pública do backend FastAPI.'
    }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete('host');

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

async function handleRadarFeed(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const feedReq = new Request(new URL('/data/feed_output.json', request.url), { method: 'GET' });
  const assetRes = await env.ASSETS.fetch(feedReq);
  if (!assetRes.ok) {
    return new Response(JSON.stringify({ ok: false, items: [], error: 'Feed indisponível' }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
  const items = await assetRes.json().catch(() => []);
  const url = new URL(request.url);
  const categoriaFiltro = (url.searchParams.get('categoria') || '').trim().toLowerCase();
  const baseLista = Array.isArray(items) ? items : [];
  const filtrada = categoriaFiltro && categoriaFiltro !== 'todos'
    ? baseLista.filter((it) => String(it?.categoria || '').trim().toLowerCase() === categoriaFiltro)
    : baseLista;
  const lista = sortirCardsRodizioAmplo(filtrada, 2);
  let ultimaData = new Date().toISOString();
  let maxTs = 0;
  for (const it of lista) {
    const ts = Date.parse(it?.data_publicacao || '') || 0;
    if (ts > maxTs && it?.data_publicacao) {
      maxTs = ts;
      ultimaData = it.data_publicacao;
    }
  }
  return new Response(JSON.stringify({
    ok: true,
    source: 'feed_output',
    atualizado_em: ultimaData,
    total: lista.length,
    items: lista
  }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function handleEntendaOAssunto(request, env, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const backendUrl = String((env && env.CURADORIA_BACKEND_URL) || '').trim().replace(/\/+$/, '');
  const acao = url.searchParams.get('acao') || '';
  const slug = url.searchParams.get('slug') || '';
  const targetPath = slug
    ? `/v2/entenda-o-assunto/${encodeURIComponent(slug)}`
    : (acao === 'colunas' ? '/v2/colunas' : '/v2/colunas');

  if (backendUrl && /^https?:\/\//i.test(backendUrl) && !backendUrl.includes('api.rodandoomundo.com.br')) {
    const proxyUrl = new URL(targetPath + url.search, backendUrl);
    if (proxyUrl.hostname !== url.hostname) {
      try {
        const res = await fetch(proxyUrl.toString(), { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
          });
        }
      } catch (e) {
        // fallback para resposta offline limpa
      }
    }
  }

  return new Response(JSON.stringify({ ok: false, colunas: [], source: 'offline' }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
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

    // Rota /api/radar: serve /data/feed_output.json no formato esperado por app.js sem cache
    if (url.pathname === '/api/radar') {
      return handleRadarFeed(request, env);
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
