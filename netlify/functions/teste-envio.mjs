// Netlify Function: /api/teste-envio
// Endpoint HTTP aberto para testar o envio de e-mail via Resend e verificar a API Key

function getResendKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('re_')) return k;
    if (typeof v === 'string' && v.startsWith('re_')) return v;
  }
  return null;
}

export async function handler(event) {
  const queryParams = event.queryStringParameters || {};
  const testEmail = queryParams.email || queryParams.teste;

  const apiKey = getResendKey();
  const envKeys = Object.keys(process.env).filter(k => !k.startsWith('AWS_') && !k.startsWith('LAMBDA_') && !k.startsWith('_'));

  if (!apiKey) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        status: 'erro_configuracao',
        mensagem: 'A variável RESEND_API_KEY não foi detectada pela Netlify.',
        variaveis_disponiveis_na_funcao: envKeys,
        dica: 'Verifique se o nome está exatamente RESEND_API_KEY e se o escopo de Functions está marcado.'
      }, null, 2)
    };
  }

  if (!testEmail) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        status: 'chave_encontrada',
        mensagem: 'A chave RESEND_API_KEY está configurada! Para testar o envio, passe seu e-mail na URL.',
        exemplo_url: '/api/teste-envio?email=seu-email@gmail.com'
      }, null, 2)
    };
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Rodando o Mundo <onboarding@resend.dev>';

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
        subject: 'Teste de Envio — Rodando o Mundo',
        html: `
          <div style="font-family:sans-serif;padding:20px;background:#0d1117;color:#c9d1d9;border-radius:8px;">
            <h2 style="color:#58a6ff;">Rodando o Mundo — E-mail de Teste</h2>
            <p>Se você está lendo isso, a integração com o <strong>Resend</strong> e a <strong>Netlify</strong> está funcionando com sucesso!</p>
            <p>Horário do teste: ${new Date().toLocaleString('pt-BR')}</p>
          </div>
        `
      })
    });

    const resJson = await res.json();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        status: res.ok ? 'sucesso' : 'erro_resend',
        codigo_http_resend: res.status,
        resposta_resend: resJson,
        destinatario: testEmail,
        remetente: fromEmail
      }, null, 2)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        status: 'erro_execucao',
        erro: err.message
      }, null, 2)
    };
  }
}
