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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept'
};

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

  // 2º Tenta repassar para a função Netlify (caso ativa)
  try {
    const netlifyRes = await fetch('https://rodandoomundo.netlify.app/api/contato', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    });
    if (netlifyRes.ok) {
      const netlifyJson = await netlifyRes.json().catch(() => ({}));
      if (netlifyJson && netlifyJson.ok !== false) {
        return new Response(JSON.stringify({ ok: true, success: true, canal: 'netlify_proxy' }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }
    }
  } catch (e) {
    // continua para fallback FormSubmit
  }

  // 3º Fallback server-side via FormSubmit (com DNS e IP públicos limpos a partir do Cloudflare Edge)
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

    // Proxy para testes de envio ou outras funções da API
    if (url.pathname === '/api/teste-envio') {
      return fetch('https://rodandoomundo.netlify.app/api/teste-envio' + url.search, {
        headers: request.headers
      });
    }

    // Repassar outras chamadas de API normalmente
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) {
      return env.ASSETS.fetch(request);
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
