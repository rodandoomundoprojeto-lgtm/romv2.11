// GET /api/entenda-o-assunto
// Proxy / Fallback Cloudflare Pages Function para a vitrine e os artigos completos de "Entenda o assunto" (/entenda e /entenda/{slug}).
import { json } from '../lib/ia.js';
import {
  isRefreshRequest,
  newsResponseHeaders,
  resolverBackendUrl,
} from '../lib/rss.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
};

const MAPA_LABEL_CATEGORIA = {
  Geopolitica_Relacoes: 'Geopolítica & Relações',
  Geopolitica_Radar: 'Geopolítica & Infraestrutura',
  Politica: 'Política & Instituições',
  Economia_Comercio: 'Economia & Comércio',
  Economia: 'Economia & Mercados',
  Cultura: 'Sociedade & Cultura',
  Sociedade_Cultura: 'Sociedade & Cultura',
  Eleicoes: 'Eleições & Democracia',
  Resumo_Ultimas: 'Panorama Global',
};

function limparSlugEntenda(slugRaw) {
  return String(slugRaw || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
    .replace(/^entenda-/, '');
}

async function fetchJsonTimeout(url, timeoutMs = 8000, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      signal: ctrl.signal,
    });
    const text = await resp.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { status: resp.status, ok: resp.ok, data };
  } catch {
    return { status: 0, ok: false, data: null };
  } finally {
    clearTimeout(timer);
  }
}

async function carregarAssetJson(relPath, request, env) {
  try {
    const assetUrl = new URL('/' + relPath.replace(/^\/+/, ''), request.url);
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const res = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
      if (res && res.ok) {
        return await res.json();
      }
    }
    const r = await fetchJsonTimeout(assetUrl.toString(), 3000);
    if (r.ok && r.data) return r.data;
  } catch {
    // Fallback silencioso
  }
  return null;
}

async function carregarEstadoEntendaBackend(backendUrl, isRefresh) {
  if (!backendUrl) return null;
  const sufixo = isRefresh ? `?_t=${Date.now()}&refresh=1` : '';
  const res = await fetchJsonTimeout(`${backendUrl}/v1/estado/entenda_v2${sufixo}`, 8000, {
    'X-ROM-Edge-Proxy': '1',
    'X-Rom-Edge-Hop': '1',
  });
  if (res.ok && res.data) {
    const payload = res.data.payload || res.data;
    if (payload && typeof payload === 'object') return payload;
  }
  return null;
}

function encontrarArtigoPorSlug(lista, slugAlvo) {
  if (!Array.isArray(lista) || !slugAlvo) return null;
  const limpoAlvo = limparSlugEntenda(slugAlvo);
  const brutoAlvo = String(slugAlvo).trim().toLowerCase();
  return (
    lista.find((it) => {
      if (!it || typeof it !== 'object') return false;
      const s1 = String(it.slug || '').trim().toLowerCase();
      const s2 = String(it.entenda_slug || '').trim().toLowerCase();
      return (
        s1 === brutoAlvo ||
        s2 === brutoAlvo ||
        limparSlugEntenda(s1) === limpoAlvo ||
        limparSlugEntenda(s2) === limpoAlvo
      );
    }) || null
  );
}

function montarRespostaDetalheDeArtigo(artigo, source) {
  return {
    ok: true,
    slug: artigo.slug,
    source,
    identificacao_editorial: artigo.identificacao_editorial || 'Síntese Rodando o Mundo',
    artigo,
    entenda_o_assunto: {
      slug: artigo.entenda_slug || `entenda-${artigo.slug}`,
      titulo_assunto: artigo.titulo,
      pergunta_central: artigo.pergunta_central || artigo.subtitulo || '',
      resumo_executivo: artigo.resumo || '',
      contexto_historico: artigo.contexto_historico || artigo.tese_central || '',
      categoria: artigo.categoria || 'Geopolitica_Relacoes',
      paises_relacionados: Array.isArray(artigo.paises_relacionados) ? artigo.paises_relacionados : [],
      tags: Array.isArray(artigo.tags) ? artigo.tags : [],
      impactos_praticos: Array.isArray(artigo.impactos_praticos) ? artigo.impactos_praticos : [],
      perguntas_frequentes: Array.isArray(artigo.perguntas_frequentes) ? artigo.perguntas_frequentes : [],
      fontes_referencia: Array.isArray(artigo.fontes_referencia) ? artigo.fontes_referencia : [],
      links_acervo_interno: Array.isArray(artigo.links_acervo_interno) ? artigo.links_acervo_interno : [],
      atualizado_em: artigo.atualizado_em || '',
      updated_at: artigo.updated_at || '',
    },
    coluna_editorial: {
      slug: artigo.slug,
      titulo: artigo.titulo_coluna || artigo.titulo,
      subtitulo: artigo.subtitulo || '',
      tese_central: artigo.tese_central || artigo.contexto_historico || '',
      corpo_markdown: artigo.corpo_markdown || '',
      categoria: artigo.categoria || 'Geopolitica_Relacoes',
      paises_abordados: Array.isArray(artigo.paises_relacionados) ? artigo.paises_relacionados : [],
      tags: Array.isArray(artigo.tags) ? artigo.tags : [],
      tempo_leitura_min: Number(artigo.tempo_leitura_min || 5),
      impactos_praticos: Array.isArray(artigo.impactos_praticos) ? artigo.impactos_praticos : [],
      fontes_citadas: Array.isArray(artigo.fontes_referencia) ? artigo.fontes_referencia : [],
      links_acervo_interno: Array.isArray(artigo.links_acervo_interno) ? artigo.links_acervo_interno : [],
      atualizado_em: artigo.atualizado_em || '',
      published_at: artigo.published_at || '',
      updated_at: artigo.updated_at || '',
    },
    painel_verificacao: null,
  };
}

function converterVitrineParaColuna(tema, updatedAtIso) {
  const cat = tema.categoria_primaria || 'Geopolitica_Radar';
  return {
    slug: tema.slug || '',
    titulo: tema.titulo_tema || tema.titulo || '',
    categoria: MAPA_LABEL_CATEGORIA[cat] || 'Geopolítica & Contexto',
    resumo: String(tema.gatilho_vitrine || tema.resumo || '').replace(/^[A-Z0-9_]{3,30}:\s*/, '').trim(),
    analise_aprofundada: tema.sintese_nerd || tema.analise_aprofundada || '',
    palavras_chave: Array.isArray(tema.palavras_chave_busca) ? tema.palavras_chave_busca : [],
    rota_editoria: tema.rota_editoria || '/radar',
    updated_at: tema.updated_at || updatedAtIso,
    origem_v2: true,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const isRefresh = isRefreshRequest(request);
  const slug = String(url.searchParams.get('slug') || '').trim();
  const acao = String(url.searchParams.get('acao') || 'entenda').toLowerCase().trim();
  const limitParam = Number(url.searchParams.get('limit') || 60);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(100, limitParam) : 60;
  const backendUrl = resolverBackendUrl(env, request);

  if (slug) {
    if (backendUrl) {
      const qs = isRefresh ? `?_t=${Date.now()}&refresh=1` : '';
      const resExt = await fetchJsonTimeout(
        `${backendUrl}/v2/entenda-o-assunto/${encodeURIComponent(slug)}${qs}`,
        8000,
        { 'X-ROM-Edge-Proxy': '1', 'X-Rom-Edge-Hop': '1' }
      );
      if (resExt.ok && resExt.data) {
        return json(
          { ...resExt.data, source: 'v2_api' },
          200,
          newsResponseHeaders({ isRefresh, isFallback: false, corsHeaders: CORS_HEADERS })
        );
      }
      if (resExt.status === 404) {
        return json(
          { ok: false, error: 'not_found', detail: `Assunto '${slug}' não encontrado.` },
          404,
          newsResponseHeaders({ isRefresh: true, isFallback: true, corsHeaders: CORS_HEADERS })
        );
      }
    }

    const estadoDb = await carregarEstadoEntendaBackend(backendUrl, isRefresh);
    const listaEstado = estadoDb ? estadoDb.artigos || estadoDb.colunas || [] : [];
    const achadoEstado = encontrarArtigoPorSlug(listaEstado, slug);
    if (achadoEstado) {
      return json(
        montarRespostaDetalheDeArtigo(achadoEstado, 'estado_db'),
        200,
        newsResponseHeaders({ isRefresh, isFallback: true, corsHeaders: CORS_HEADERS })
      );
    }

    const snapLocal = await carregarAssetJson('data/entenda_v2.json', request, env);
    const listaSnap = snapLocal ? snapLocal.artigos || snapLocal.colunas || [] : [];
    const achadoSnap = encontrarArtigoPorSlug(listaSnap, slug);
    if (achadoSnap) {
      return json(
        montarRespostaDetalheDeArtigo(achadoSnap, 'entenda_snapshot'),
        200,
        newsResponseHeaders({ isRefresh, isFallback: true, corsHeaders: CORS_HEADERS })
      );
    }

    return json(
      { ok: false, error: 'not_found', detail: `Assunto '${slug}' não encontrado.` },
      404,
      newsResponseHeaders({ isRefresh: true, isFallback: true, corsHeaders: CORS_HEADERS })
    );
  }

  // Modo listagem
  if (backendUrl) {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (isRefresh) {
      params.set('_t', String(Date.now()));
      params.set('refresh', '1');
    }
    const resExt = await fetchJsonTimeout(
      `${backendUrl}/v2/entenda-o-assunto?${params.toString()}`,
      8000,
      { 'X-ROM-Edge-Proxy': '1', 'X-Rom-Edge-Hop': '1' }
    );
    if (resExt.ok && resExt.data && Array.isArray(resExt.data.artigos)) {
      return json(
        {
          ok: true,
          source: 'v2_api',
          identificacao_editorial: resExt.data.identificacao_editorial || 'Síntese Rodando o Mundo',
          atualizado_em: resExt.data.atualizado_em || '',
          updatedAt: resExt.data.updatedAt || new Date().toISOString(),
          total: resExt.data.artigos.length,
          artigos: resExt.data.artigos,
          colunas: resExt.data.colunas || resExt.data.artigos,
        },
        200,
        newsResponseHeaders({ isRefresh, isFallback: false, corsHeaders: CORS_HEADERS })
      );
    }
  }

  const estadoDb = await carregarEstadoEntendaBackend(backendUrl, isRefresh);
  if (estadoDb && Array.isArray(estadoDb.artigos) && estadoDb.artigos.length > 0) {
    const artigos = estadoDb.artigos.slice(0, limit);
    return json(
      {
        ok: true,
        source: 'estado_db',
        identificacao_editorial: 'Síntese Rodando o Mundo',
        atualizado_em: estadoDb.atualizado_em || '',
        updatedAt: estadoDb.updatedAt || new Date().toISOString(),
        total: artigos.length,
        artigos,
        colunas: artigos,
      },
      200,
      newsResponseHeaders({ isRefresh, isFallback: true, corsHeaders: CORS_HEADERS })
    );
  }

  const snapLocal = await carregarAssetJson('data/entenda_v2.json', request, env);
  if (snapLocal && Array.isArray(snapLocal.artigos) && snapLocal.artigos.length > 0) {
    const artigos = snapLocal.artigos.slice(0, limit);
    return json(
      {
        ok: true,
        source: 'entenda_snapshot',
        identificacao_editorial: 'Síntese Rodando o Mundo',
        atualizado_em: snapLocal.atualizado_em || '',
        updatedAt: snapLocal.updatedAt || new Date().toISOString(),
        total: artigos.length,
        artigos,
        colunas: artigos,
      },
      200,
      newsResponseHeaders({ isRefresh, isFallback: true, corsHeaders: CORS_HEADERS })
    );
  }

  if (acao === 'colunas') {
    const vitrine = await carregarAssetJson('data/vitrine_ia.json', request, env);
    const temas = vitrine && Array.isArray(vitrine.temas_ativos) ? vitrine.temas_ativos : [];
    const updatedAtIso = (vitrine && vitrine.updatedAt) || new Date().toISOString();
    const colunas = temas.slice(0, limit).map((t) => converterVitrineParaColuna(t, updatedAtIso));
    return json(
      {
        ok: true,
        source: 'vitrine_snapshot',
        identificacao_editorial: 'Síntese Rodando o Mundo',
        atualizado_em: '',
        updatedAt: updatedAtIso,
        total: colunas.length,
        artigos: [],
        colunas,
      },
      200,
      newsResponseHeaders({ isRefresh, isFallback: true, corsHeaders: CORS_HEADERS })
    );
  }

  return json(
    {
      ok: true,
      source: 'entenda_snapshot',
      identificacao_editorial: 'Síntese Rodando o Mundo',
      atualizado_em: '',
      updatedAt: new Date().toISOString(),
      total: 0,
      artigos: [],
      colunas: [],
    },
    200,
    newsResponseHeaders({ isRefresh, isFallback: true, corsHeaders: CORS_HEADERS })
  );
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
