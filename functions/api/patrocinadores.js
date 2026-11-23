/**
 * API Serverless /api/patrocinadores
 * Retorna os patrocinadores e cotas comerciais com fallback para data/patrocinadores.json,
 * serve mídias base64/URL via HTTP GET (?media=logo|nome_imagem) e fornece helpers para e-mail.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma, Authorization, X-Requested-With',
};

const ROTAS_PUBLICAS_VALIDAS_EMAIL = new Set([
  '/',
  '/resumo-do-dia',
  '/parcerias',
  '/radar',
  '/dossies',
  '/sobre',
  '/clube',
  '/entenda',
  '/ultimas-noticias',
  '/comparar',
  '/economia',
  '/geopolitica',
  '/tecnologia',
  '/clima',
  '/cultura',
  '/saude',
  '/eleicoes'
]);

export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getHojeYmdBrasilia(now = new Date()) {
  const dt = now instanceof Date ? now : new Date(now);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(dt);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

export function isCotaEmVigenciaEmail(cota, hojeYmd = getHojeYmdBrasilia()) {
  if (!cota || cota.ativo !== true) return false;
  const temNome = typeof cota.nome === 'string' && cota.nome.trim().length > 0;
  const temLogo = typeof cota.logo_url === 'string' && cota.logo_url.trim().length > 0;
  const temNomeImg = typeof cota.nome_imagem_url === 'string' && cota.nome_imagem_url.trim().length > 0;
  if (!temNome && !temLogo && !temNomeImg) return false;

  const dataInicio = typeof cota.data_inicio === 'string' ? cota.data_inicio.trim() : '';
  const dataFim = typeof cota.data_fim === 'string' ? cota.data_fim.trim() : '';
  if (dataInicio && hojeYmd < dataInicio) return false;
  if (dataFim && hojeYmd > dataFim) return false;

  return true;
}

export function filtrarCotasAtivas(cotaRaw, hojeYmd = getHojeYmdBrasilia()) {
  if (!cotaRaw) return [];
  const lista = Array.isArray(cotaRaw) ? cotaRaw : [cotaRaw];
  return lista.filter((item) => isCotaEmVigenciaEmail(item, hojeYmd));
}

export function resolverUrlImagemPatrocinadorEmail(
  rawImgUrl,
  { cota = 'resumo_dia', id = '', media = 'logo', idx = 0, updatedAt = '' } = {}
) {
  if (!rawImgUrl || typeof rawImgUrl !== 'string') return null;
  const trimmed = rawImgUrl.trim();
  if (!trimmed) return null;

  if (/^https:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^http:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith('/')) {
    return `https://www.rodandoomundo.com.br${trimmed}`;
  }
  if (/^data:image\//i.test(trimmed)) {
    const resolvedId = id !== undefined && id !== null && String(id).trim() !== ''
      ? String(id).trim()
      : String(idx);
    const vParam = updatedAt ? `&v=${encodeURIComponent(String(updatedAt).slice(0, 19))}` : '';
    return `https://www.rodandoomundo.com.br/api/patrocinadores?media=${encodeURIComponent(media)}&cota=${encodeURIComponent(cota)}&id=${encodeURIComponent(resolvedId)}${vParam}`;
  }

  return null;
}

export function resolverUrlCtaEmail(linkUrl) {
  if (!linkUrl || typeof linkUrl !== 'string') return null;
  const trimmed = linkUrl.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname) {
        return trimmed;
      }
    } catch {
      return null;
    }
    return null;
  }

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    try {
      const parsed = new URL(trimmed, 'https://www.rodandoomundo.com.br');
      if (parsed.origin !== 'https://www.rodandoomundo.com.br') return null;
      const pathname = parsed.pathname.length > 1
        ? parsed.pathname.replace(/\/+$/, '')
        : parsed.pathname;
      if (ROTAS_PUBLICAS_VALIDAS_EMAIL.has(pathname)) {
        return `https://www.rodandoomundo.com.br${trimmed}`;
      }
    } catch {
      return null;
    }
    return null;
  }

  return null;
}

export function montarHtmlPatrocinadoresEmail(listaAtivos, { updatedAt = '' } = {}) {
  if (!Array.isArray(listaAtivos) || listaAtivos.length === 0) return '';

  return listaAtivos
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return '';
      const nomeTexto = typeof item.nome === 'string' ? item.nome.trim() : '';
      const fraseTexto = typeof item.frase === 'string' ? item.frase.trim() : '';
      const logoUrl = resolverUrlImagemPatrocinadorEmail(item.logo_url, {
        cota: 'resumo_dia',
        id: item.id || '',
        media: 'logo',
        idx,
        updatedAt
      });
      const nomeImgUrl = resolverUrlImagemPatrocinadorEmail(item.nome_imagem_url, {
        cota: 'resumo_dia',
        id: item.id || '',
        media: 'nome_imagem',
        idx,
        updatedAt
      });
      const ctaUrl = resolverUrlCtaEmail(item.link_url);
      const ctaTexto =
        (typeof item.cta_texto === 'string' && item.cta_texto.trim()) || 'Saiba mais';

      const logoCellHtml = logoUrl
        ? `<td width="46" valign="middle" style="padding-right:10px;">
            <img src="${escapeHtml(logoUrl)}" width="36" height="36" alt="${escapeHtml(nomeTexto || 'Patrocinador')}" style="width:36px;height:36px;border-radius:6px;object-fit:contain;display:block;border:1px solid #30363d;background:#0d1117;" />
          </td>`
        : '';

      let marcaHtml = '';
      if (nomeImgUrl) {
        marcaHtml = `<img src="${escapeHtml(nomeImgUrl)}" alt="${escapeHtml(nomeTexto || 'Patrocinador')}" style="max-height:24px;width:auto;display:block;border:0;" />`;
      } else if (nomeTexto) {
        marcaHtml = `<strong style="color:#f0f6fc;font-size:15px;font-weight:700;line-height:1.3;">${escapeHtml(nomeTexto)}</strong>`;
      }

      const fraseHtml = fraseTexto
        ? `<tr>
            <td style="padding-top:8px;">
              <p style="margin:0;color:#c9d1d9;font-size:13px;line-height:1.45;">${escapeHtml(fraseTexto)}</p>
            </td>
          </tr>`
        : '';

      const ctaCellHtml = ctaUrl !== null
        ? `<td valign="middle" align="right" style="padding-left:12px;white-space:nowrap;">
            <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:rgba(210,153,34,0.16);border:1px solid rgba(210,153,34,0.5);color:#d29922;text-decoration:none;font-size:12px;font-weight:700;padding:6px 14px;border-radius:6px;white-space:nowrap;">${escapeHtml(ctaTexto)}</a>
          </td>`
        : '';

      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;background:#161b22;border:1px solid rgba(210,153,34,0.45);border-left:3px solid #d29922;border-radius:10px;padding:14px 18px;margin-bottom:18px;">
  <tr>
    <td style="padding-bottom:8px;">
      <span style="color:#d29922;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">OFERECIMENTO</span>
    </td>
  </tr>
  <tr>
    <td>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          ${logoCellHtml}
          <td valign="middle" align="left">
            ${marcaHtml}
          </td>
          ${ctaCellHtml}
        </tr>
      </table>
    </td>
  </tr>
  ${fraseHtml}
</table>`;
    })
    .filter(Boolean)
    .join('\n');
}

export async function carregarDadosPatrocinadores(request, env) {
  // 1. Tentar ler do backend FastAPI se configurado
  const backendUrl = String((env && env.CURADORIA_BACKEND_URL) || '').trim().replace(/\/+$/, '');
  if (backendUrl && !backendUrl.includes('api.rodandoomundo.com.br')) {
    try {
      const resp = await fetch(`${backendUrl}/v2/patrocinadores`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(2500)
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch {
      // Falha no backend: cai no fallback estático
    }
  }

  // 2. Fallback para asset local data/patrocinadores.json
  try {
    const baseReqUrl = request && request.url ? request.url : 'https://www.rodandoomundo.com.br/';
    const assetUrl = new URL('/data/patrocinadores.json', baseReqUrl);
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

  return {
    ok: true,
    fallback: true,
    cotas: {
      cota_master: [],
      dossie_tematico: [],
      resumo_dia: [],
      gaveta_contextual: []
    }
  };
}

function encontrarPatrocinadorParaMedia(dados, cotaParam, idParam) {
  const cotasObj = dados && dados.cotas && typeof dados.cotas === 'object' ? dados.cotas : {};
  const normalizarLista = (raw) => (Array.isArray(raw) ? raw : (raw ? [raw] : []));

  if (cotaParam) {
    const lista = normalizarLista(cotasObj[cotaParam]);
    if (idParam !== '') {
      const porId = lista.find((item) => item && String(item.id || '') === idParam);
      if (porId) return porId;
      if (/^\d+$/.test(idParam)) {
        const idx = Number(idParam);
        if (idx >= 0 && idx < lista.length) return lista[idx];
      }
      return null;
    }
    return lista[0] || null;
  }

  const todas = [];
  for (const val of Object.values(cotasObj)) {
    for (const item of normalizarLista(val)) {
      if (item) todas.push(item);
    }
  }
  if (idParam !== '') {
    const porId = todas.find((item) => String(item.id || '') === idParam);
    if (porId) return porId;
    if (/^\d+$/.test(idParam)) {
      const idx = Number(idParam);
      if (idx >= 0 && idx < todas.length) return todas[idx];
    }
    return null;
  }
  return todas[0] || null;
}

function montarRespostaMidia(campo, requestUrl) {
  if (!campo || typeof campo !== 'string') {
    return new Response('Mídia não encontrada', {
      status: 404,
      headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' }
    });
  }

  const valor = campo.trim();
  if (!valor) {
    return new Response('Mídia não encontrada', {
      status: 404,
      headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' }
    });
  }

  const matchData = valor.match(/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (matchData) {
    let mimeSub = matchData[1].toLowerCase();
    if (mimeSub === 'jpg') mimeSub = 'jpeg';
    const base64Clean = matchData[2].replace(/\s+/g, '');

    try {
      const binary = atob(base64Clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      if (mimeSub === 'svg+xml') {
        const svgText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        if (/<script\b/i.test(svgText) || /\bon[a-z]+\s*=/i.test(svgText)) {
          return new Response('SVG bloqueado por política de segurança', {
            status: 403,
            headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' }
          });
        }
      }

      return new Response(bytes, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': `image/${mimeSub}`,
          'Cache-Control': 'public, max-age=900, s-maxage=900'
        }
      });
    } catch {
      return new Response('Imagem inválida', {
        status: 404,
        headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' }
      });
    }
  }

  if (/^https?:\/\//i.test(valor) || (valor.startsWith('/') && !valor.startsWith('//'))) {
    try {
      const absUrl = new URL(valor, requestUrl).toString();
      return Response.redirect(absUrl, 302);
    } catch {
      return new Response('URL de mídia inválida', {
        status: 404,
        headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' }
      });
    }
  }

  return new Response('Mídia não encontrada', {
    status: 404,
    headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const media = url.searchParams.get('media');

  if (media !== null && media !== '') {
    if (media !== 'logo' && media !== 'nome_imagem') {
      return new Response('Parâmetro media inválido', {
        status: 404,
        headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' }
      });
    }
    const dados = await carregarDadosPatrocinadores(request, env);
    const cotaParam = (url.searchParams.get('cota') || '').trim();
    const idParam = (url.searchParams.get('id') || '').trim();
    const item = encontrarPatrocinadorParaMedia(dados, cotaParam, idParam);
    if (!item) {
      return new Response('Patrocinador não encontrado', {
        status: 404,
        headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' }
      });
    }
    const campo = media === 'nome_imagem' ? item.nome_imagem_url : item.logo_url;
    return montarRespostaMidia(campo, request.url);
  }

  const dados = await carregarDadosPatrocinadores(request, env);
  return new Response(JSON.stringify(dados), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}
