// Cloudflare Pages Function: /api/teste-envio
// Endpoint HTTP aberto para testar o envio de e-mail via Resend e verificar a API Key

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

function getResendKey(env = {}) {
  if (env.RESEND_API_KEY) return env.RESEND_API_KEY;
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('re_')) return k;
    if (typeof v === 'string' && v.startsWith('re_')) return v;
  }
  return null;
}

export async function onRequestGet(context) {
  const req = context.request;
  const env = context.env || {};
  const url = new URL(req.url);
  const testEmail = url.searchParams.get('email') || url.searchParams.get('teste');

  const apiKey = getResendKey(env);
  const envKeys = Object.keys(env);

  if (!apiKey) {
    return new Response(JSON.stringify({
      status: 'erro_configuracao',
      mensagem: 'A variável RESEND_API_KEY não foi detectada no Cloudflare Pages.',
      variaveis_disponiveis_no_ambiente: envKeys,
      dica: 'Configure a variável RESEND_API_KEY em Settings > Environment variables do projeto no Cloudflare Pages.'
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
    });
  }

  if (!testEmail) {
    return new Response(JSON.stringify({
      status: 'chave_encontrada',
      mensagem: 'A chave RESEND_API_KEY está configurada no Cloudflare Pages! Para testar o envio, passe seu e-mail na URL.',
      exemplo_url: '/api/teste-envio?email=seu-email@gmail.com'
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
    });
  }

  const fromEmail = env.RESEND_FROM_EMAIL || 'Rodando o Mundo <onboarding@resend.dev>';

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
        html: `
          <div style="font-family:sans-serif;padding:20px;background:#0d1117;color:#c9d1d9;border-radius:8px;">
            <h2 style="color:#58a6ff;">Rodando o Mundo — E-mail de Teste</h2>
            <p>Se você está lendo isso, a integração com o <strong>Resend</strong> via <strong>Cloudflare Pages Functions</strong> está funcionando com sucesso!</p>
            <p>Horário do teste: ${new Date().toLocaleString('pt-BR')}</p>
          </div>
        `
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
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      status: 'erro_execucao',
      erro: err.message
    }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
