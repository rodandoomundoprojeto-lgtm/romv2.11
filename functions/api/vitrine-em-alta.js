// GET /api/vitrine-em-alta
// Proxy / Fallback Serverless para a Vitrine de Temas em Alta e Expansão Semântica da Curadoria IA.
// Segue estritamente o contrato .agents/contracts/SUG-CURADORIA-IA.md.
import { json, limparTermo } from '../lib/ia.js';
import {
  isRefreshRequest,
  newsResponseHeaders,
  parseTimestampIso,
  compararRecenciaDesc,
  resolverBackendUrl,
} from '../lib/rss.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
};

const MAPA_ROTAS_EDITORIA = {
  Politica: '/politica',
  Economia: '/economia',
  Cultura: '/cultura',
  Eleicoes: '/eleicoes',
  Geopolitica_Radar: '/radar',
  Resumo_Ultimas: '/ultimas-noticias',
};

const CATEGORIAS_VALIDAS = new Set(Object.keys(MAPA_ROTAS_EDITORIA));

const FALLBACK_SNAPSHOT = {
  ok: true,
  cached: false,
  source: 'snapshot',
  updatedAt: '2026-11-14T00:55:57Z',
  temas_ativos: [
    {
      slug: 'faa-suspende-voos-eua-falha-comunicacao-sistemas',
      titulo_tema: 'Paralisação Total dos Voos nos EUA por Falha Crítica de Comunicação',
      status: 'novo',
      categoria_primaria: 'Geopolitica_Radar',
      categorias_cruzadas: ['Economia', 'Resumo_Ultimas'],
      rota_editoria: '/radar',
      relevancia_score: 93,
      palavras_chave_busca: [
        'faa voos eua',
        'paralisacao aviacao americana',
        'telecommunication outage faa',
        'voos cancelados eua',
        'seguranca cibernetica infraestrutura',
        'tráfego aereo global',
      ],
      gatilho_vitrine: 'Colapso de comunicação na aviação dos EUA gera efeito cascata no transporte aéreo e comércio global.',
      sintese_nerd: 'A ordem de paralisação em solo decretada pela FAA devido a uma falha em sistemas de comunicação expõe a vulnerabilidade das infraestruturas críticas americanas. O incidente causa caos logístico imediato com potencial de impacto em conexões financeiras e de suprimentos globais.',
    },
    {
      slug: 'pane-global-microsoft-outlook-impacto-judiciario-brasil',
      titulo_tema: 'Apagão Tecnológico da Microsoft Causa Transtornos Globais e Paralisa Prazos no STF',
      status: 'em_alta',
      categoria_primaria: 'Geopolitica_Radar',
      categorias_cruzadas: ['Politica', 'Economia', 'Cultura'],
      rota_editoria: '/radar',
      relevancia_score: 89,
      palavras_chave_busca: [
        'pane microsoft outlook',
        'apagao cibernetico microsoft',
        'cnj suspende prazos',
        'stf falha microsoft',
        'nuvem resiliencia infraestrutura',
        'indenizacao apagao tecnologico',
      ],
      gatilho_vitrine: 'Instabilidade em serviços da Microsoft atinge de tribunais brasileiros a empresas globais.',
      sintese_nerd: 'A pane prolongada nos servidores da Microsoft paralisou fluxos corporativos e forçou o CNJ a suspender prazos processuais no STF e instâncias federais. O episódio acende o alerta sobre a dependência excessiva do setor público e privado em monopólios de infraestrutura em nuvem.',
    },
    {
      slug: 'lula-filipinas-brasil-parceiro-dialogo-asean',
      titulo_tema: 'Brasil Busca Aproximação Estratégica com a ASEAN durante Visita às Filipinas',
      status: 'novo',
      categoria_primaria: 'Geopolitica_Radar',
      categorias_cruzadas: ['Politica', 'Economia'],
      rota_editoria: '/radar',
      relevancia_score: 86,
      palavras_chave_busca: [
        'lula filipinas',
        'brasil asean parceiro dialogo',
        'comercio sudeste asiatico',
        'diplomacia lula asia',
        'cupula asean manila',
        'agronegocio exportacao asia',
      ],
      gatilho_vitrine: 'Brasil formaliza ofensiva comercial e geopolítica com bloco do Sudeste Asiático.',
      sintese_nerd: 'A presença do governo brasileiro na Cúpula da ASEAN busca diversificar parceiros comerciais fora do eixo tradicional ocidental, mirando um mercado consumidor em rápida expansão. A mudança de status para Parceiro de Diálogo pode facilitar acordos tarifários estratégicos para commodities e tecnologia.',
    },
    {
      slug: 'ajuste-fiscal-senado-placar-alerta-governo-pecs-2027',
      titulo_tema: 'Placar Estreito no Ajuste Fiscal no Senado Sinaliza Entrave para PECs Estruturais',
      status: 'novo',
      categoria_primaria: 'Politica',
      categorias_cruzadas: ['Economia'],
      rota_editoria: '/politica',
      relevancia_score: 84,
      palavras_chave_busca: [
        'ajuste fiscal senado',
        'votação ajuste fiscal 45 votos',
        'governo lula articulacao senado',
        'aprovacao pec senado 49 votos',
        'pacote fiscal sustentabilidade',
        'meta fiscal brasil 2027',
      ],
      gatilho_vitrine: 'Placar de 45 votos no Senado evidencia margem apertada para reformas constitucionais.',
      sintese_nerd: 'Embora o governo tenha aprovado a matéria ordinária do ajuste fiscal com 45 votos, o resultado ficou abaixo da fasquia de 49 votos exigida para alterar a Constituição. O mapa de votação acena para a necessidade de maior concessão política ao centro caso o Planalto queira votar novas PECs.',
    },
    {
      slug: 'stf-camara-regras-transicao-escala-trabalho-5x2',
      titulo_tema: 'STF Forma Maioria pela Escala 5x2 Enquanto Câmara Questiona Interferência',
      status: 'em_alta',
      categoria_primaria: 'Politica',
      categorias_cruzadas: ['Economia', 'Cultura'],
      rota_editoria: '/politica',
      relevancia_score: 82,
      palavras_chave_busca: [
        'escala 5x2 stf',
        'decisao flavio dino escala',
        'camara dos deputados stf 5x2',
        'transicao escala 6x1',
        'reforma trabalhista jornada',
        'clt escala de trabalho',
      ],
      gatilho_vitrine: 'STF e Câmara divergem sobre o ritmo e os critérios da transição para a escala 5x2.',
      sintese_nerd: 'O avanço de votos no STF para manter o início da transição da jornada em 16 de dezembro reacendeu a fricção institucional com o Legislativo, que argumenta usurpação de competência. A controvérsia gera incerteza jurídica para empregadores e trabalhadores no planejamento das escalas de fim de ano.',
    },
  ],
};

function normalizar(str) {
  return String(str == null ? '' : str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function construirHeadersCache(isRefresh, isFallback = false) {
  return newsResponseHeaders({ isRefresh, isFallback, corsHeaders: CORS_HEADERS });
}

function normalizarItemVitrine(item) {
  const cat = item.categoria_primaria || 'Resumo_Ultimas';
  const dataPub = parseTimestampIso(item.data_publicacao || item.publicado_em || item.created_at || '');
  const updatedAt = parseTimestampIso(item.updated_at || '') || dataPub;
  return {
    slug: item.slug || '',
    titulo_tema: item.titulo_tema || '',
    status: item.status || 'em_alta',
    categoria_primaria: cat,
    categorias_cruzadas: Array.isArray(item.categorias_cruzadas) ? item.categorias_cruzadas : [],
    rota_editoria: item.rota_editoria || MAPA_ROTAS_EDITORIA[cat] || '/ultimas-noticias',
    relevancia_score: Number(item.relevancia_score || 0),
    palavras_chave_busca: Array.isArray(item.palavras_chave_busca) ? item.palavras_chave_busca : [],
    gatilho_vitrine: item.gatilho_vitrine || '',
    sintese_nerd: item.sintese_nerd || '',
    data_publicacao: dataPub,
    updated_at: updatedAt,
    expires_at: item.expires_at || null,
  };
}

function itemNaoExpirado(item, nowMs = Date.now()) {
  if (!item || !item.expires_at) return true;
  const expMs = Date.parse(String(item.expires_at));
  if (Number.isNaN(expMs)) return true;
  return expMs > nowMs;
}

function filtrarExpiradosComResguardo(lista, nowMs = Date.now()) {
  const validos = (lista || []).filter((it) => it && typeof it === 'object');
  const naoExpirados = validos.filter((it) => itemNaoExpirado(it, nowMs));
  return naoExpirados.length > 0 ? naoExpirados : validos;
}

// Expansão semântica por pontuação ponderada (NUNCA usa tokens.every)
function expandirTermoLocal(qRaw, temasAtivos) {
  const termoOriginal = limparTermo(qRaw);
  const termoNorm = normalizar(termoOriginal);
  if (!termoNorm || termoNorm.length < 2) {
    return {
      ok: true,
      termo_original: termoOriginal,
      termos_turbinados: termoOriginal ? [termoOriginal] : [],
      contextos_relacionados: [],
    };
  }

  const tokens = termoNorm.split(/\s+/).filter((tk) => tk.length >= 2);
  const pontuados = [];

  for (const item of temasAtivos) {
    const kws = Array.isArray(item.palavras_chave_busca) ? item.palavras_chave_busca : [];
    const kwsNorm = kws.map((k) => normalizar(k));
    const titNorm = normalizar(item.titulo_tema || '');
    const sintNorm = normalizar(item.sintese_nerd || '');
    let peso = 0;

    if (kwsNorm.includes(termoNorm)) peso += 120;
    else if (kwsNorm.some((k) => k.includes(termoNorm) || termoNorm.includes(k))) peso += 90;

    if (titNorm.includes(termoNorm)) peso += 85;
    else if (sintNorm.includes(termoNorm)) peso += 45;

    for (const tk of tokens) {
      if (kwsNorm.some((k) => k.includes(tk))) peso += 35;
      if (titNorm.includes(tk)) peso += 25;
      else if (sintNorm.includes(tk)) peso += 12;
    }

    if (peso > 0) {
      const scoreTotal = peso + Number(item.relevancia_score || 0) * 0.2;
      pontuados.push({ scoreTotal, item });
    }
  }

  pontuados.sort((a, b) => b.scoreTotal - a.scoreTotal);
  const contextos = pontuados.slice(0, 3).map(({ item }) => ({
    titulo_tema: item.titulo_tema,
    relevancia_score: item.relevancia_score,
    palavras_chave_busca: item.palavras_chave_busca,
    gatilho_vitrine: item.gatilho_vitrine,
  }));

  const termosSet = new Set([termoOriginal.toLowerCase()]);
  for (const ctx of contextos) {
    for (const kw of ctx.palavras_chave_busca || []) {
      termosSet.add(String(kw).toLowerCase().trim());
    }
  }

  return {
    ok: true,
    termo_original: termoOriginal,
    termos_turbinados: Array.from(termosSet),
    contextos_relacionados: contextos,
  };
}

async function carregarSnapshotEstatico(request, env, isRefresh = false) {
  try {
    const assetUrl = new URL('/data/vitrine_ia.json', request.url);
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const respAsset = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
      if (respAsset && respAsset.ok) {
        const data = await respAsset.json();
        if (data && Array.isArray(data.temas_ativos) && data.temas_ativos.length > 0) {
          return data;
        }
      }
    }
    if (isRefresh) {
      assetUrl.searchParams.set('_t', String(Date.now()));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const resp = await fetch(assetUrl.toString(), {
        cache: 'no-store',
        signal: ctrl.signal,
      });
      if (resp && resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.temas_ativos) && data.temas_ativos.length > 0) {
          return data;
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Usa fallback embutido
  }
  return FALLBACK_SNAPSHOT;
}

async function consultarBackendExterno(backendUrl, caminho, searchParams, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const alvo = new URL(caminho, backendUrl.endsWith('/') ? backendUrl : backendUrl + '/');
    if (searchParams) {
      searchParams.forEach((v, k) => alvo.searchParams.set(k, v));
    }
    const resp = await fetch(alvo.toString(), {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-Rom-Edge-Hop': '1',
        'X-ROM-Edge-Proxy': '1',
      },
      signal: ctrl.signal,
    });
    if (!resp || !resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleVitrineEmAlta(request, env = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const isRefresh = isRefreshRequest(request);

  const acao = (url.searchParams.get('acao') || '').toLowerCase().trim();
  const q = url.searchParams.get('q') || '';
  const categoriaRaw = (url.searchParams.get('categoria') || '').trim();
  const categoria = CATEGORIAS_VALIDAS.has(categoriaRaw) ? categoriaRaw : '';
  const limiteParam = parseInt(url.searchParams.get('limite') || '6', 10);
  const limite = Number.isNaN(limiteParam) ? 6 : Math.min(20, Math.max(1, limiteParam));

  const backendUrl = resolverBackendUrl(env, request);

  try {
    if (acao === 'expansao') {
      if (backendUrl && q.trim().length >= 2) {
        const params = new URLSearchParams({ q: q.trim() });
        if (isRefresh) {
          params.set('refresh', '1');
          params.set('force', '1');
          params.set('_t', String(Date.now()));
        }
        const ext = await consultarBackendExterno(backendUrl, 'v1/busca/expansao', params, 9000);
        if (ext && Array.isArray(ext.termos_turbinados)) {
          return json(
            { ok: true, fallback: false, ...ext },
            200,
            construirHeadersCache(isRefresh, false)
          );
        }
      }
      const snap = await carregarSnapshotEstatico(request, env, isRefresh);
      const temas = filtrarExpiradosComResguardo((snap.temas_ativos || []).map(normalizarItemVitrine));
      return json(
        { ...expandirTermoLocal(q, temas), fallback: true },
        200,
        construirHeadersCache(isRefresh, true)
      );
    }

    if (backendUrl) {
      const params = new URLSearchParams({ limite: String(limite) });
      if (categoria) params.set('categoria', categoria);
      if (isRefresh) {
        params.set('refresh', '1');
        params.set('force', '1');
        params.set('_t', String(Date.now()));
      }
      const ext = await consultarBackendExterno(backendUrl, 'v1/vitrine/em-alta', params, 9000);
      if (ext && Array.isArray(ext.temas_ativos) && ext.temas_ativos.length > 0) {
        let temasApi = filtrarExpiradosComResguardo(ext.temas_ativos.map(normalizarItemVitrine));
        if (categoria) {
          temasApi = temasApi.filter(
            (t) =>
              t.categoria_primaria === categoria ||
              (Array.isArray(t.categorias_cruzadas) && t.categorias_cruzadas.includes(categoria))
          );
        }
        temasApi.sort((a, b) => compararRecenciaDesc(a, b, 'relevancia_score'));
        return json(
          {
            ok: true,
            cached: false,
            fallback: false,
            source: 'api',
            updatedAt: ext.updatedAt || '',
            temas_ativos: temasApi.slice(0, limite),
          },
          200,
          construirHeadersCache(isRefresh, false)
        );
      }

      // Fallback ao vivo para /v1/estado/vitrine_ia antes de usar o snapshot estático
      const estadoParams = isRefresh
        ? new URLSearchParams({ refresh: '1', _t: String(Date.now()) })
        : new URLSearchParams();
      const estadoRaw = await consultarBackendExterno(
        backendUrl,
        'v1/estado/vitrine_ia',
        estadoParams,
        9000
      );
      const estadoPayload =
        estadoRaw && Object.prototype.hasOwnProperty.call(estadoRaw, 'payload')
          ? estadoRaw.payload
          : estadoRaw;
      if (
        estadoPayload &&
        Array.isArray(estadoPayload.temas_ativos) &&
        estadoPayload.temas_ativos.length > 0
      ) {
        let temasEstado = filtrarExpiradosComResguardo(
          estadoPayload.temas_ativos.map(normalizarItemVitrine)
        );
        if (categoria) {
          temasEstado = temasEstado.filter(
            (t) =>
              t.categoria_primaria === categoria ||
              (Array.isArray(t.categorias_cruzadas) && t.categorias_cruzadas.includes(categoria))
          );
        }
        temasEstado.sort((a, b) => compararRecenciaDesc(a, b, 'relevancia_score'));
        return json(
          {
            ok: true,
            cached: false,
            fallback: false,
            source: 'api',
            updatedAt: estadoPayload.updatedAt || '',
            temas_ativos: temasEstado.slice(0, limite),
          },
          200,
          construirHeadersCache(isRefresh, false)
        );
      }
    }

    const snap = await carregarSnapshotEstatico(request, env, isRefresh);
    let temas = filtrarExpiradosComResguardo((snap.temas_ativos || []).map(normalizarItemVitrine));
    if (categoria) {
      temas = temas.filter(
        (t) =>
          t.categoria_primaria === categoria ||
          (Array.isArray(t.categorias_cruzadas) && t.categorias_cruzadas.includes(categoria))
      );
    }
    temas.sort((a, b) => compararRecenciaDesc(a, b, 'relevancia_score'));

    return json(
      {
        ok: true,
        cached: false,
        fallback: true,
        source: 'snapshot',
        updatedAt: snap.updatedAt || '',
        temas_ativos: temas.slice(0, limite),
      },
      200,
      construirHeadersCache(isRefresh, true)
    );
  } catch (err) {
    return json(
      {
        ok: false,
        fallback: true,
        error: err && err.message ? err.message : 'Erro ao carregar vitrine de curadoria IA',
        temas_ativos: [],
        termos_turbinados: [],
      },
      200,
      construirHeadersCache(isRefresh, true)
    );
  }
}

export async function onRequestGet(context) {
  return handleVitrineEmAlta(context.request, context.env || {});
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
