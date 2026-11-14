// GET /api/radar
// Endpoint unificado do Radar Editorial (/radar), mesclando itens em tempo real do Motor V2 com briefings de data/feed_output.json.
// Segue estritamente o contrato .agents/contracts/INT-V2-SITE.md.
import { json } from '../lib/ia.js';
import { detectarPaisesNoTexto } from './noticias-quentes.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
};

const MAPA_CATEGORIA_RADAR = {
  Geopolitica_Radar: 'geopolitica',
  Politica: 'politica',
  Economia: 'economia',
  Cultura: 'cultura',
  Eleicoes: 'politica',
  Resumo_Ultimas: 'geopolitica',
};

const MAPA_ROTAS_EDITORIA = {
  Politica: '/politica',
  Economia: '/economia',
  Cultura: '/cultura',
  Eleicoes: '/eleicoes',
  Geopolitica_Radar: '/radar',
  Resumo_Ultimas: '/ultimas-noticias',
};

const FALLBACK_VITRINE_TEMAS = [
  {
    slug: 'faa-suspende-voos-eua-falha-comunicacao-sistemas',
    titulo_tema: 'Paralisação Total dos Voos nos EUA por Falha Crítica de Comunicação',
    categoria_primaria: 'Geopolitica_Radar',
    rota_editoria: '/radar',
    relevancia_score: 93,
    palavras_chave_busca: ['faa voos eua', 'paralisacao aviacao americana', 'telecommunication outage faa'],
    gatilho_vitrine: 'Colapso de comunicação na aviação dos EUA gera efeito cascata no transporte aéreo e comércio global.',
    sintese_nerd: 'A ordem de paralisação em solo decretada pela FAA devido a uma falha em sistemas de comunicação expõe a vulnerabilidade das infraestruturas críticas americanas.',
  },
];

function normalizar(str) {
  return String(str == null ? '' : str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function limparPrefixoGatilho(str) {
  return String(str || '')
    .replace(/^[A-Z0-9_]{3,30}:\s*/, '')
    .trim();
}

function formatarHoraCurta(isoDateStr) {
  try {
    const dt = isoDateStr ? new Date(isoDateStr) : new Date();
    const d = Number.isNaN(dt.getTime()) ? new Date() : dt;
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const h = partes.find((p) => p.type === 'hour')?.value || '00';
    const m = partes.find((p) => p.type === 'minute')?.value || '00';
    return `Atualizado às ${h}h${m}`;
  } catch {
    return 'Atualizado agora';
  }
}

function formatarRotuloRelativo(isoDateStr) {
  try {
    const dt = isoDateStr ? new Date(isoDateStr) : new Date();
    const t = dt.getTime();
    if (isNaN(t)) return 'Atualizado agora';
    const diffMin = Math.floor((Date.now() - t) / 60000);
    if (diffMin < 5) return 'Atualizado agora';
    if (diffMin < 60) return `Atualizado há ${diffMin} min`;
    return formatarHoraCurta(isoDateStr);
  } catch {
    return 'Atualizado agora';
  }
}

function construirHeadersCache(isRefresh) {
  if (isRefresh) {
    return {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      ...CORS_HEADERS,
    };
  }
  return {
    'Cache-Control': 'public, max-age=60, s-maxage=180, stale-while-revalidate=60',
    'X-Content-Type-Options': 'nosniff',
    ...CORS_HEADERS,
  };
}

async function carregarAssetJson(relPath, request) {
  try {
    const assetUrl = new URL('/' + relPath.replace(/^\/+/, ''), request.url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const resp = await fetch(assetUrl.toString(), { signal: ctrl.signal });
    clearTimeout(timer);
    if (resp.ok) {
      return await resp.json();
    }
  } catch {
    // Ignora falha de leitura
  }
  return null;
}

function mapearItemV2ParaRadar(item, fallbackDateIso) {
  const catRaw = item.categoria || item.categoria_primaria || 'Geopolitica_Radar';
  const catNorm = MAPA_CATEGORIA_RADAR[catRaw] || normalizar(catRaw) || 'geopolitica';
  const slug = item.slug || normalizar(item.titulo_tema || item.titulo_curto || '').replace(/[^a-z0-9]+/g, '-');
  const titulo = item.titulo_tema || item.titulo_curto || item.titulo || '';
  const resumo = limparPrefixoGatilho(item.gatilho_vitrine || item.resumo_pulso || item.resumo || '');
  const analise = item.sintese_nerd || item.impacto_pratico || item.analise || resumo;
  const kws = Array.isArray(item.palavras_chave_busca)
    ? item.palavras_chave_busca
    : Array.isArray(item.palavras_chave)
    ? item.palavras_chave
    : [];
  const urlsFontes = Array.isArray(item.fontes_urls) ? item.fontes_urls : [];
  const rotaPadrao = item.rota_editoria || MAPA_ROTAS_EDITORIA[catRaw] || '/radar';
  const fonteUrl = urlsFontes[0] || item.fonte_url || rotaPadrao;
  const paises =
    Array.isArray(item.paises_envolvidos) && item.paises_envolvidos.length > 0
      ? item.paises_envolvidos
      : detectarPaisesNoTexto(`${titulo} ${resumo} ${analise}`, kws);

  const score = Number(item.urgencia_score || item.relevancia_score || 85);

  return {
    id: `v2-${slug}`,
    slug,
    titulo,
    resumo,
    analise,
    categoria: ['geopolitica', 'politica', 'economia', 'cultura'].includes(catNorm) ? catNorm : 'geopolitica',
    fonte_nome: 'Síntese Rodando o Mundo · Pulso V2',
    fonte_url: fonteUrl,
    data_publicacao: item.updated_at || item.data_publicacao || fallbackDateIso,
    origem_v2: true,
    urgencia_score: score,
    paises_envolvidos: paises,
    palavras_chave: kws,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const isRefresh = url.searchParams.has('_t') || url.searchParams.get('refresh') === '1';
  const headers = construirHeadersCache(isRefresh);
  const categoriaFiltro = normalizar(url.searchParams.get('categoria') || 'todos');

  try {
    const [vitrineSnap, feedOutput] = await Promise.all([
      carregarAssetJson('data/vitrine_ia.json', request),
      carregarAssetJson('data/feed_output.json', request),
    ]);

    const updatedAtIso = isRefresh
      ? new Date().toISOString()
      : (vitrineSnap && vitrineSnap.updatedAt) || new Date().toISOString();

    const temasVitrine =
      vitrineSnap && Array.isArray(vitrineSnap.temas_ativos) && vitrineSnap.temas_ativos.length > 0
        ? vitrineSnap.temas_ativos
        : FALLBACK_VITRINE_TEMAS;

    const itensV2Snapshot = temasVitrine.map((t) =>
      mapearItemV2ParaRadar(t, (vitrineSnap && vitrineSnap.updatedAt) || updatedAtIso)
    );

    const cardsFeed = Array.isArray(feedOutput)
      ? feedOutput.map((card, idx) => {
          const textoCard = `${card.titulo || ''} ${card.resumo || ''} ${card.analise || ''}`;
          return {
            id: card.id || `feed-${idx + 1}`,
            slug: card.slug || '',
            titulo: card.titulo || '',
            resumo: card.resumo || '',
            analise: card.analise || '',
            categoria: normalizar(card.categoria || 'geopolitica') || 'geopolitica',
            fonte_nome: card.fonte_nome || 'Radar Editorial',
            fonte_url: card.fonte_url || '/radar',
            data_publicacao: card.data_publicacao || updatedAtIso,
            origem_v2: false,
            urgencia_score: Number(card.urgencia_score || 70),
            paises_envolvidos: Array.isArray(card.paises_envolvidos)
              ? card.paises_envolvidos
              : detectarPaisesNoTexto(textoCard, []),
            palavras_chave: Array.isArray(card.palavras_chave) ? card.palavras_chave : [],
          };
        })
      : [];

    const titulosVistos = new Set();
    const combinados = [];

    for (const item of [...itensV2Snapshot, ...cardsFeed]) {
      const chaveTitulo = normalizar(item.titulo);
      if (!chaveTitulo || titulosVistos.has(chaveTitulo)) continue;
      titulosVistos.add(chaveTitulo);
      combinados.push(item);
    }

    const filtrados =
      categoriaFiltro && categoriaFiltro !== 'todos'
        ? combinados.filter((item) => normalizar(item.categoria) === categoriaFiltro)
        : combinados;

    let maisRecenteIso = updatedAtIso;
    if (filtrados.length > 0 && filtrados[0].data_publicacao) {
      maisRecenteIso = filtrados[0].data_publicacao;
    }
    const carimboHora = formatarRotuloRelativo(maisRecenteIso);

    return json(
      {
        ok: true,
        cached: !isRefresh,
        source: 'v2_hybrid',
        atualizado_em: carimboHora,
        updatedAt: updatedAtIso,
        total: filtrados.length,
        items: filtrados,
      },
      200,
      headers
    );
  } catch {
    const fallbackIso = new Date().toISOString();
    const fallbackItems = FALLBACK_VITRINE_TEMAS.map((t) => mapearItemV2ParaRadar(t, fallbackIso));
    return json(
      {
        ok: true,
        cached: false,
        source: 'v2_hybrid',
        atualizado_em: formatarRotuloRelativo(fallbackIso),
        updatedAt: fallbackIso,
        total: fallbackItems.length,
        items: fallbackItems,
      },
      200,
      headers
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
