/**
 * API Serverless /api/patrocinadores
 * Retorna os patrocinadores e cotas comerciais com fallback para data/patrocinadores.json.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma, Authorization, X-Requested-With',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // 1. Tentar ler do backend FastAPI se configurado
  const backendUrl = String((env && env.CURADORIA_BACKEND_URL) || '').trim().replace(/\/+$/, '');
  if (backendUrl && !backendUrl.includes('api.rodandoomundo.com.br')) {
    try {
      const resp = await fetch(`${backendUrl}/v2/patrocinadores`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(2500)
      });
      if (resp.ok) {
        const data = await resp.json();
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      }
    } catch {
      // Falha no backend: cai no fallback estático
    }
  }

  // 2. Fallback para asset local data/patrocinadores.json
  try {
    const assetUrl = new URL('/data/patrocinadores.json', request.url);
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const res = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
      if (res && res.ok) {
        const dados = await res.json();
        return new Response(JSON.stringify(dados), {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      }
    }
    const res = await fetch(assetUrl.toString(), { cache: 'no-store' });
    if (res && res.ok) {
      const dados = await res.json();
      return new Response(JSON.stringify(dados), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }
  } catch {
    // Falha silenciosa
  }

  return new Response(JSON.stringify({
    ok: true,
    fallback: true,
    cotas: {
      cota_master: [],
      dossie_tematico: [],
      resumo_dia: [],
      gaveta_contextual: []
    }
  }), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}
