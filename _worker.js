/**
 * Cloudflare Pages Worker (_worker.js)
 * 1. Processa envios de formulários (/api/contato) com Resend e fallback FormSubmit
 * 2. Garante roteamento nativo de SPA (Single Page Application) sem erros 404
 *    ao recarregar (F5/Refresh) ou acessar diretamente URLs limpas como /clube, /Sul, etc.
 */

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
      // Serve o index.html com status 200 para a SPA assumir a rota no client-side
      const indexRequest = new Request(new URL('/index.html', request.url), request);
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      return new Response(indexResponse.body, {
        status: 200,
        headers: indexResponse.headers
      });
    }

    // Arquivos estáticos reais inexistentes (ex: imagem.png faltando) continuam com 404
    return response;
  }
};
