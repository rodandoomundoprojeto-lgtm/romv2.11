// Cloudflare Worker Dedicado: Resumo do Dia
// Executa via Cron Trigger às 07:00 da manhã (Brasília) / 10:00 UTC
// Também aceita requisição HTTP para testes ou disparo manual sob demanda

const RSS_FEEDS = [
  {
    relevancia: 1,
    categoria: 'Geopolítica & Global',
    url: 'https://feeds.bbci.co.uk/portuguese/rss.xml',
    fonte: 'BBC News Brasil',
    pais: 'Estados Unidos'
  },
  {
    relevancia: 2,
    categoria: 'Brasil · Política & Congresso',
    url: 'https://g1.globo.com/rss/g1/politica/',
    fonte: 'g1 Política',
    pais: 'Brasil'
  },
  {
    relevancia: 3,
    categoria: 'Economia & Mercados',
    url: 'https://g1.globo.com/rss/g1/economia/',
    fonte: 'g1 Economia',
    pais: 'Brasil'
  },
  {
    relevancia: 4,
    categoria: 'Segurança Internacional',
    url: 'https://g1.globo.com/rss/g1/mundo/',
    fonte: 'g1 Mundo',
    pais: 'Internacional'
  },
  {
    relevancia: 5,
    categoria: 'Clima & Tecnologia',
    url: 'https://g1.globo.com/rss/g1/tecnologia/',
    fonte: 'g1 Tecnologia & Ciência',
    pais: 'Brasil'
  }
];

function cleanHtml(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFirstRssItem(xml) {
  if (!xml) return null;
  const itemMatch = xml.match(/<item[\s>](.*?)<\/item>/s);
  if (!itemMatch) return null;
  const itemXml = itemMatch[1];
  const titleMatch = itemXml.match(/<title[\s>](.*?)<\/title>/s);
  const linkMatch = itemXml.match(/<link[\s>](.*?)<\/link>/s);
  const descMatch = itemXml.match(/<description[\s>](.*?)<\/description>/s);

  const title = cleanHtml(titleMatch ? titleMatch[1] : '');
  let link = cleanHtml(linkMatch ? linkMatch[1] : '');
  let desc = cleanHtml(descMatch ? descMatch[1] : '');
  if (desc.length > 220) {
    desc = desc.slice(0, 215).replace(/[,.;:\s]+$/, '') + '…';
  }
  return { titulo: title, url: link, resumo: desc };
}

async function coletarResumoDoDia() {
  const items = await Promise.all(
    RSS_FEEDS.map(async (f) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(f.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RodandoOMundoBot/2.12; +https://www.rodandoomundo.com.br)' },
          signal: ctrl.signal
        });
        clearTimeout(t);
        if (!res.ok) return null;
        const xml = await res.text();
        const parsed = parseFirstRssItem(xml);
        if (!parsed || !parsed.titulo) return null;
        return {
          relevancia: f.relevancia,
          categoria: f.categoria,
          fonte: f.fonte,
          pais: f.pais,
          titulo: parsed.titulo,
          url: parsed.url,
          resumo: parsed.resumo
        };
      } catch {
        return null;
      }
    })
  );
  return items.filter(Boolean).sort((a, b) => a.relevancia - b.relevancia);
}

function montarHtmlNewsletter(noticias, dataHoje) {
  const cardsHtml = noticias.map((n) => `
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:18px 20px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;margin-bottom:10px;">
        <span style="background:#1f6feb;color:#ffffff;font-size:12px;font-weight:700;padding:2px 8px;border-radius:12px;margin-right:10px;">#${n.relevancia}</span>
        <span style="color:#58a6ff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${n.categoria}</span>
        <span style="color:#8b949e;font-size:12px;margin-left:auto;">Fonte: ${n.fonte}</span>
      </div>
      <h3 style="margin:0 0 8px 0;font-size:17px;line-height:1.4;">
        <a href="${n.url}" style="color:#f0f6fc;text-decoration:none;font-weight:600;" target="_blank">${n.titulo}</a>
      </h3>
      <p style="margin:0 0 14px 0;color:#8b949e;font-size:14px;line-height:1.5;">${n.resumo}</p>
      <div style="font-size:13px;">
        <a href="${n.url}" style="color:#388bfd;text-decoration:none;font-weight:500;" target="_blank">Ler matéria original &rarr;</a>
        &nbsp;&bull;&nbsp;
        <a href="https://www.rodandoomundo.com.br/resumo-do-dia" style="color:#7ee787;text-decoration:none;" target="_blank">Comparar perspectivas no site</a>
      </div>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Resumo do Dia — Rodando o Mundo</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#c9d1d9;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="text-align:center;padding:24px 0 20px 0;border-bottom:1px solid #21262d;margin-bottom:24px;">
      <h1 style="color:#58a6ff;font-size:24px;margin:0 0 6px 0;letter-spacing:0.5px;">Rodando o Mundo</h1>
      <p style="color:#f0f6fc;font-size:15px;margin:0 0 4px 0;font-weight:600;">Resumo do Dia &bull; Edição de ${dataHoje}</p>
      <p style="color:#8b949e;font-size:13px;margin:0;">As 5 principais notícias apuradas por relevância editorial com contexto global.</p>
    </div>

    <div>
      ${cardsHtml}
    </div>

    <div style="text-align:center;margin:32px 0;">
      <a href="https://www.rodandoomundo.com.br/resumo-do-dia" style="background:#238636;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;display:inline-block;">Acessar o Painel Interativo Completo</a>
    </div>

    <div style="border-top:1px solid #21262d;padding-top:20px;text-align:center;font-size:12px;color:#8b949e;line-height:1.6;">
      <p style="margin:0 0 6px 0;">Você recebeu esta mensagem porque se inscreveu no Resumo do Dia em <strong>Rodando o Mundo</strong>.</p>
      <p style="margin:0;"><a href="https://www.rodandoomundo.com.br" style="color:#58a6ff;text-decoration:none;">www.rodandoomundo.com.br</a></p>
    </div>
  </div>
</body>
</html>`;
}

function getResendKey(env = {}) {
  if (env.RESEND_API_KEY) return env.RESEND_API_KEY;
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('re_')) return k;
    if (typeof v === 'string' && v.startsWith('re_')) return v;
  }
  return null;
}

async function executarEnvioResumo(env, testEmail = null) {
  const apiKey = getResendKey(env);
  if (!apiKey) {
    console.error('RESEND_API_KEY não configurada no ambiente do Cloudflare Worker.');
    return { ok: false, error: 'RESEND_API_KEY não configurada.' };
  }

  const fromEmail = env.RESEND_FROM_EMAIL || 'Rodando o Mundo <onboarding@resend.dev>';
  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const noticias = await coletarResumoDoDia();
  if (!noticias || noticias.length === 0) {
    console.error('Nenhuma notícia pôde ser coletada hoje para o envio.');
    return { ok: false, error: 'Nenhuma notícia coletada.' };
  }

  const emailHtml = montarHtmlNewsletter(noticias, dataHoje);
  const emailSubject = `Resumo do Dia — 5 destaques globais (${dataHoje})`;

  if (testEmail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [testEmail],
        subject: `[TESTE] ${emailSubject}`,
        html: emailHtml
      })
    });
    const result = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      modo: 'teste',
      destinatario: testEmail,
      resendResponse: result
    };
  }

  let destinatarios = [];
  try {
    const audienceId = env.RESEND_AUDIENCE_ID;
    const contactsEndpoint = audienceId
      ? `https://api.resend.com/audiences/${audienceId}/contacts`
      : 'https://api.resend.com/contacts';

    const resp = await fetch(contactsEndpoint, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      const list = data.data || [];
      destinatarios = list.filter((c) => !c.unsubscribed).map((c) => c.email);
    }
  } catch (errContacts) {
    console.warn('Erro ao buscar contatos do Resend:', errContacts.message);
  }

  if (destinatarios.length === 0) {
    return {
      ok: true,
      message: 'Nenhum inscrito ativo na lista do Resend para envio hoje.'
    };
  }

  const envios = await Promise.allSettled(
    destinatarios.map(async (dest) => {
      return fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [dest],
          subject: emailSubject,
          html: emailHtml
        })
      });
    })
  );

  const enviados = envios.filter((e) => e.status === 'fulfilled').length;

  return {
    ok: true,
    totalInscritos: destinatarios.length,
    enviados: enviados,
    data: dataHoje
  };
}

export default {
  // Handler executado automaticamente pelo Cron Trigger da Cloudflare
  async scheduled(event, env, ctx) {
    ctx.waitUntil(executarEnvioResumo(env));
  },

  // Handler HTTP para testes manuais no browser ou via curl
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const testEmail = url.searchParams.get('teste') || url.searchParams.get('email');
    const resultado = await executarEnvioResumo(env, testEmail);

    return new Response(JSON.stringify(resultado, null, 2), {
      status: resultado.ok ? 200 : 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
