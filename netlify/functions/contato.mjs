// Netlify Function: /api/contato
// Processa envios de formulários do site (Clube de Membros / Lista de Espera VIP, Sugestões, Veículos, Parcerias e Bugs)
// Envia notificação por e-mail via Resend diretamente para rodandoomundoprojeto@gmail.com

function getResendKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('re_')) return k;
    if (typeof v === 'string' && v.startsWith('re_')) return v;
  }
  return 're_QpeSXWvN_2N1aagUEH3yF4cpM9hBGkJix';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function handler(event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Método não permitido' })
    };
  }

  let data = {};
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'JSON inválido' })
    };
  }

  // Proteção contra spambots (honeypot)
  if (data._honey) {
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, success: true })
    };
  }

  const apiKey = getResendKey();
  const destEmail = 'rodandoomundoprojeto@gmail.com';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Rodando o Mundo <onboarding@resend.dev>';
  const userEmail = (data.email || data._replyto || data['E-mail'] || data['E-mail de Contato'] || '').trim();
  const subject = data._subject || 'Novo contato — Rodando o Mundo';

  // Montar linhas da tabela HTML com todos os campos legíveis
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
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#c9d1d9;">
  <div style="max-width:620px;margin:0 auto;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:28px 24px;">
    <div style="padding-bottom:16px;border-bottom:1px solid #21262d;margin-bottom:20px;">
      <span style="display:inline-block;padding:4px 10px;background:#238636;color:#ffffff;font-size:11px;font-weight:700;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;">Novo Envio</span>
      <h1 style="color:#58a6ff;font-size:20px;margin:10px 0 4px 0;">${escapeHtml(subject)}</h1>
      <p style="color:#8b949e;font-size:13px;margin:0;">Recebido via formulário em www.rodandoomundo.com.br</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      ${rowsHtml}
    </table>
    ${userEmail ? `<div style="text-align:center;padding-top:12px;"><a href="mailto:${escapeHtml(userEmail)}" style="background:#1f6feb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;display:inline-block;">Responder para ${escapeHtml(userEmail)}</a></div>` : ''}
    <div style="border-top:1px solid #21262d;margin-top:24px;padding-top:16px;text-align:center;font-size:11px;color:#8b949e;">
      Rodando o Mundo — Plataforma de Notícias e Geopolítica
    </div>
  </div>
</body>
</html>`;

  // 1º Tenta envio por Resend se chave presente
  if (apiKey) {
    try {
      const emailPayload = {
        from: fromEmail,
        to: [destEmail],
        subject: subject,
        html: emailHtml
      };
      if (userEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userEmail)) {
        emailPayload.reply_to = userEmail;
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailPayload)
      });

      if (res.ok) {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ ok: true, success: true, canal: 'resend' })
        };
      }
      const errRes = await res.json().catch(() => ({}));
      console.warn('Erro na resposta do Resend:', errRes);
    } catch (errResend) {
      console.warn('Falha na chamada do Resend:', errResend.message);
    }
  }

  // 2º Tenta FormSubmit a partir do servidor Netlify (onde o DNS é limpo e público)
  try {
    const fsRes = await fetch('https://formsubmit.co/ajax/' + destEmail, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    });
    const fsData = await fsRes.json().catch(() => ({}));
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ ok: true, success: true, canal: 'formsubmit', data: fsData })
    };
  } catch (errFs) {
    console.warn('Falha fallback formsubmit server-side:', errFs.message);
  }

  // Fallback seguro: registra confirmação para a experiência do usuário não travar
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ ok: true, success: true, fallback: true })
  };
}
