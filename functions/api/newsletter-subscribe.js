// Cloudflare Pages Function: /api/newsletter-subscribe
// Registra o inscrito no Resend e envia e-mail de confirmação

import {
  carregarDadosPatrocinadores,
  filtrarCotasAtivas,
  montarHtmlPatrocinadoresEmail
} from './patrocinadores.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

export async function onRequestPost(context) {
  const req = context.request;
  const env = context.env || {};

  try {
    const data = await req.json().catch(() => ({}));
    const email = (data.email || '').trim().toLowerCase();
    const nome = (data.nome || '').trim();
    const topico = (data.topico || 'Resumo do dia').trim();

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Endereço de e-mail inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    }

    const apiKey = getResendKey(env);
    const fromEmail = env.RESEND_FROM_EMAIL || 'Rodando o Mundo <contato@rodandoomundo.com.br>';
    const audienceId = env.RESEND_AUDIENCE_ID;

    let emailStatus = null;
    let resendResult = null;

    if (apiKey) {
      // 1. Salva contato no Resend
      try {
        const contactEndpoint = audienceId
          ? `https://api.resend.com/audiences/${audienceId}/contacts`
          : 'https://api.resend.com/contacts';

        await fetch(contactEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: email,
            first_name: nome || undefined,
            unsubscribed: false
          })
        });
      } catch (errContact) {
        console.warn('Erro ao salvar contato no Resend:', errContact.message);
      }

      // 2. Dispara e-mail de boas-vindas
      try {
        let sponsorHtml = '';
        try {
          const dadosPat = await carregarDadosPatrocinadores(req, env);
          const ativosResumo = filtrarCotasAtivas(dadosPat?.cotas?.resumo_dia);
          sponsorHtml = montarHtmlPatrocinadoresEmail(ativosResumo, {
            updatedAt: dadosPat?.atualizado_em || ''
          });
        } catch (errSponsor) {
          console.warn('Erro ao carregar patrocinadores do resumo:', errSponsor.message);
          sponsorHtml = '';
        }

        const saudacao = nome ? `Olá, ${nome}!` : 'Olá!';
        const welcomeHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Inscrição Confirmada — Rodando o Mundo</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#c9d1d9;">
  <div style="max-width:600px;margin:0 auto;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:32px 28px;">
    <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #21262d;">
      <h1 style="color:#58a6ff;font-size:22px;margin:0 0 6px 0;letter-spacing:0.5px;">Rodando o Mundo</h1>
      <p style="color:#8b949e;font-size:13px;margin:0;text-transform:uppercase;letter-spacing:1px;">Jornalismo Global & Cobertura Comparada</p>
    </div>
    <div style="padding:28px 0;">
      <h2 style="color:#f0f6fc;font-size:18px;margin:0 0 14px 0;">${saudacao}</h2>
      <p style="color:#c9d1d9;font-size:15px;line-height:1.6;margin:0 0 16px 0;">
        Sua inscrição no <strong>${topico}</strong> foi confirmada com sucesso!
      </p>
      <p style="color:#8b949e;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
        Todos os dias pela manhã, você receberá nossa curadoria com as 5 principais notícias do mundo, contextualizadas e com links diretos para as fontes originais e análises comparadas.
      </p>
      ${sponsorHtml}
      <div style="text-align:center;margin:30px 0;">
        <a href="https://www.rodandoomundo.com.br/resumo-do-dia" style="background:#238636;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;display:inline-block;">Acessar o Resumo de Hoje</a>
      </div>
    </div>
    <div style="border-top:1px solid #21262d;padding-top:20px;text-align:center;font-size:12px;color:#8b949e;">
      <p style="margin:0 0 8px 0;">Rodando o Mundo — Observatório de Notícias Globais</p>
      <p style="margin:0;"><a href="https://www.rodandoomundo.com.br" style="color:#58a6ff;text-decoration:none;">www.rodandoomundo.com.br</a></p>
    </div>
  </div>
</body>
</html>`;

        const emailResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: `Confirmação de Inscrição — ${topico} | Rodando o Mundo`,
            html: welcomeHtml
          })
        });
        emailStatus = emailResp.status;
        resendResult = await emailResp.json().catch(() => null);
      } catch (errEmail) {
        console.warn('Erro ao disparar boas-vindas pelo Resend:', errEmail.message);
        resendResult = { error: errEmail.message };
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      message: 'Inscrição registrada com sucesso!',
      email: email,
      hasApiKey: !!apiKey,
      resendStatusCode: emailStatus,
      resendResponse: resendResult
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Erro interno ao processar inscrição',
      details: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
