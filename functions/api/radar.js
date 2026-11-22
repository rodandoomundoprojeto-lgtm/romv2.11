// GET /api/radar
// Endpoint unificado do Radar Editorial (/radar), mesclando itens em tempo real do Motor V2 com briefings de data/feed_output.json.
// Segue estritamente o contrato .agents/contracts/INT-V2-SITE.md.
import { json } from '../lib/ia.js';
import {
  isRefreshRequest,
  newsResponseHeaders,
  parseTimestampIso,
  resolverBackendUrl,
} from '../lib/rss.js';
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

const MAX_V2_PROMOTE_LAG_MS = 2 * 60 * 60 * 1000;
const MAX_ROTATION_LAG_MS = 12 * 60 * 60 * 1000;
const MAX_ROTATION_LOOKAHEAD = 12;

function normalizar(str) {
  return String(str == null ? '' : str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizarFonteKey(fonteNome) {
  const limpo = normalizar(fonteNome).replace(/\s+/g, ' ').trim();
  return limpo || 'desconhecida';
}

function ehDestaquePulsoV2(item) {
  if (!item) return false;
  if (item.origem_v2 === true) return true;
  return normalizarFonteKey(item.fonte_nome).includes('pulso v2');
}

function detectarFormatoRadar(fonteUrl, fonteNome) {
  const u = String(fonteUrl || '').toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|twitch\.tv|rumble\.com|odysee\.com/.test(u)) {
    return 'video';
  }
  const f = normalizar(fonteNome);
  if (f.includes('youtube')) {
    return 'video';
  }
  return 'materia';
}

function timestampPublicacao(item) {
  const t = Date.parse((item && item.data_publicacao) || '');
  return Number.isNaN(t) ? 0 : t;
}

function nivelRelevanciaValido(item) {
  const nivel = Number(item && item.nivel_relevancia);
  if (Number.isFinite(nivel)) {
    return Math.min(5, Math.max(1, nivel));
  }
  return 3;
}

function prioridadeParaOrdenacao(item) {
  const urgencia = Number(item && item.urgencia_score) || 0;
  const nivel = nivelRelevanciaValido(item);
  return urgencia * (nivel / 3);
}

export function sortirCardsRodizioAmplo(itens, maxV2Topo = 2) {
  const validItens = (itens || []).filter((it) => it && typeof it === 'object');
  if (validItens.length === 0) return [];

  const ordenados = [...validItens].sort((a, b) => {
    const ta = timestampPublicacao(a);
    const tb = timestampPublicacao(b);
    if (ta > 0 && tb > 0) {
      if (tb !== ta) return tb - ta;
      return prioridadeParaOrdenacao(b) - prioridadeParaOrdenacao(a);
    }
    if (ta !== tb) return ta > 0 ? -1 : 1;
    return prioridadeParaOrdenacao(b) - prioridadeParaOrdenacao(a);
  });

  const newestTs = timestampPublicacao(ordenados[0]);
  const topV2 = [];
  const pool = [];

  for (const item of ordenados) {
    const ts = timestampPublicacao(item);
    const dentroJanelaTopo = newestTs === 0 || (ts > 0 && newestTs - ts <= MAX_V2_PROMOTE_LAG_MS);
    if (ehDestaquePulsoV2(item) && topV2.length < maxV2Topo && dentroJanelaTopo) {
      topV2.push(item);
    } else {
      pool.push(item);
    }
  }

  const resultado = [...topV2];
  const recentes = [];
  let consecFonte = null;
  let consecCount = 0;

  for (const item of topV2) {
    const fk = normalizarFonteKey(item.fonte_nome);
    recentes.push(fk);
    if (fk === consecFonte) {
      consecCount += 1;
    } else {
      consecFonte = fk;
      consecCount = 1;
    }
  }

  while (pool.length > 0) {
    const fontesDistintas = new Set(pool.map((it) => normalizarFonteKey(it.fonte_nome))).size;
    if (fontesDistintas <= 1) {
      resultado.push(...pool);
      break;
    }

    const windowSize = Math.min(3, fontesDistintas - 1);
    const janelaRecente = windowSize > 0 ? new Set(recentes.slice(-windowSize)) : new Set();
    const refTs = timestampPublicacao(pool[0]);
    const dentroJanelaRotacao = (cand) => {
      if (refTs === 0) return true;
      const candTs = timestampPublicacao(cand);
      return candTs > 0 && refTs - candTs <= MAX_ROTATION_LAG_MS;
    };

    let escolhidoIdx = -1;

    // 1ª passada: respeita teto consecutivo (<= 2), janela de rodízio e limite de recência
    for (let i = 0; i < pool.length && i < MAX_ROTATION_LOOKAHEAD; i++) {
      if (!dentroJanelaRotacao(pool[i])) continue;
      const fk = normalizarFonteKey(pool[i].fonte_nome);
      if (consecCount >= 2 && fk === consecFonte) continue;
      if (janelaRecente.has(fk)) continue;
      escolhidoIdx = i;
      break;
    }

    // 2ª passada: relaxa janela de rodízio, mantendo teto consecutivo e limite de recência
    if (escolhidoIdx === -1) {
      for (let i = 0; i < pool.length && i < MAX_ROTATION_LOOKAHEAD; i++) {
        if (!dentroJanelaRotacao(pool[i])) continue;
        const fk = normalizarFonteKey(pool[i].fonte_nome);
        if (consecCount >= 2 && fk === consecFonte) continue;
        escolhidoIdx = i;
        break;
      }
    }

    // 3ª passada (esgotamento): pega o mais recente disponível
    if (escolhidoIdx === -1) {
      escolhidoIdx = 0;
    }

    const [escolhido] = pool.splice(escolhidoIdx, 1);
    const fkEscolhido = normalizarFonteKey(escolhido.fonte_nome);
    resultado.push(escolhido);
    recentes.push(fkEscolhido);
    if (fkEscolhido === consecFonte) {
      consecCount += 1;
    } else {
      consecFonte = fkEscolhido;
      consecCount = 1;
    }
  }

  return resultado;
}

function limparPrefixoGatilho(str) {
  return String(str || '')
    .replace(/^Síntese automática de contingência\s*\([^)]*\):\s*/i, '')
    .replace(/^Análise em dry-run baseada na fonte\s*[^:]*:\s*/i, '')
    .replace(/^Contexto associado nas buscas:\s*/i, '')
    .replace(/^[A-Z0-9_]{3,30}:\s*/, '')
    .trim();
}

function ehInstrucaoOuDebugRadar(txt) {
  if (!txt) return true;
  return /^(Destacar cobertura|Focar em|Análise em dry-run|Placeholder|TODO|Instrução|Prompt|Síntese automática de contingência)\b/i.test(txt);
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
    const diffMs = Date.now() - t;
    let diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 0 && diffMs >= -300000) {
      diffMin = 0;
    }
    if (diffMin >= 0 && diffMin < 5) return 'Atualizado agora';
    if (diffMin >= 5 && diffMin < 60) return `Atualizado há ${diffMin} min`;
    return formatarHoraCurta(isoDateStr);
  } catch {
    return 'Atualizado agora';
  }
}

function construirHeadersCache(isRefresh, isFallback = false) {
  return newsResponseHeaders({ isRefresh, isFallback, corsHeaders: CORS_HEADERS });
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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const resp = await fetch(assetUrl.toString(), {
        cache: 'no-store',
        signal: ctrl.signal,
      });
      if (resp && resp.ok) {
        return await resp.json();
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Ignora falha de leitura
  }
  return null;
}

const WORKER_STATE_MEMO = new Map();
const WORKER_STATE_MEMO_TTL_MS = 4 * 60 * 1000; // 4 minutos

async function carregarEstadoBackend(chave, request, env, isRefresh = false) {
  const backendUrl = resolverBackendUrl(env, request);
  if (!backendUrl) return null;

  if (!isRefresh && WORKER_STATE_MEMO.has(chave)) {
    const entry = WORKER_STATE_MEMO.get(chave);
    if (entry && (Date.now() - entry.ts < WORKER_STATE_MEMO_TTL_MS)) {
      return entry.data;
    }
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const sufixoRefresh = isRefresh ? `?_t=${Date.now()}&refresh=1` : '';
    const alvo = `${backendUrl}/v1/estado/${encodeURIComponent(chave)}${sufixoRefresh}`;
    const resp = await fetch(alvo, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-ROM-Edge-Proxy': '1',
        'X-Rom-Edge-Hop': '1',
      },
    });
    if (!resp || !resp.ok) {
      if (WORKER_STATE_MEMO.has(chave)) {
        return WORKER_STATE_MEMO.get(chave).data;
      }
      return null;
    }
    const data = await resp.json();
    const payload = data && Object.prototype.hasOwnProperty.call(data, 'payload') ? data.payload : data;
    if (!payload) return null;
    let res = null;
    if (Array.isArray(payload)) res = payload.length > 0 ? payload : null;
    else if (typeof payload === 'object') {
      if (Array.isArray(payload.temas_ativos) && payload.temas_ativos.length > 0) res = payload;
      else if (Array.isArray(payload.noticias_quentes) && payload.noticias_quentes.length > 0) res = payload;
    }
    if (res) {
      WORKER_STATE_MEMO.set(chave, { ts: Date.now(), data: res });
    }
    return res;
  } catch {
    if (WORKER_STATE_MEMO.has(chave)) {
      return WORKER_STATE_MEMO.get(chave).data;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function carregarEstadoOuAssetRadar(chave, relPath, request, env, isRefresh = false) {
  const estado = await carregarEstadoBackend(chave, request, env, isRefresh);
  if (estado) return { data: estado, fallback: false };
  const assetData = await carregarAssetJson(relPath, request, env);
  return { data: assetData, fallback: true };
}

function limparAnaliseRadar(analiseBruta, resumo) {
  const analise = String(analiseBruta || '').trim();
  if (
    !analise ||
    ehInstrucaoOuDebugRadar(analise) ||
    analise === String(resumo || '').trim() ||
    /^Tendência com forte aceleração de interesse/i.test(analise)
  ) {
    return '';
  }
  return analise;
}

function mapearItemV2ParaRadar(item, urlsVideosCanais = new Set()) {
  const catRaw = item.categoria || item.categoria_primaria || 'Geopolitica_Radar';
  let catNorm = MAPA_CATEGORIA_RADAR[catRaw] || normalizar(catRaw) || 'geopolitica';
  const slug = item.slug || normalizar(item.titulo_tema || item.titulo_curto || '').replace(/[^a-z0-9]+/g, '-');
  const titulo = item.titulo_tema || item.titulo_curto || item.titulo || '';

  const rawGatilho = limparPrefixoGatilho(item.gatilho_vitrine || item.resumo_pulso || item.resumo || '');
  const rawSintese = limparPrefixoGatilho(item.sintese_nerd || item.impacto_pratico || item.analise || '');

  let resumo = rawGatilho;
  let analise = rawSintese;

  if (ehInstrucaoOuDebugRadar(resumo)) {
    if (analise && !ehInstrucaoOuDebugRadar(analise)) {
      resumo = analise;
      analise = '';
    } else {
      resumo = titulo ? `Monitoramento informativo e desdobramentos em tempo real sobre ${titulo}.` : '';
      analise = '';
    }
  }

  analise = limparAnaliseRadar(analise, resumo);

  // Refina categorização para evitar que termos de clima, tempo ou trabalho fiquem como "geopolítica"
  if (catNorm === 'geopolitica') {
    const tLower = (titulo + ' ' + resumo).toLowerCase();
    if (/salário|décimo terceiro|economia|mercado|dólar|bolsa|imposto|inflação|selic/.test(tLower)) {
      catNorm = 'economia';
    } else if (/governo|stf|senado|câmara|eleições|presidente|ministro|prefeito|congresso/.test(tLower)) {
      catNorm = 'politica';
    } else if (/tempo|clima|chuva|show|cultura|turismo|viagem|música|filme|feriado|festival|caranguejo/.test(tLower)) {
      catNorm = 'cultura';
    }
  }
  const kws = Array.isArray(item.palavras_chave_busca)
    ? item.palavras_chave_busca
    : Array.isArray(item.palavras_chave)
    ? item.palavras_chave
    : [];
  const urlsFontes = Array.isArray(item.fontes_urls) ? item.fontes_urls.filter(Boolean) : [];
  const urlsNaoVideo = urlsFontes.filter(
    (u) => !urlsVideosCanais.has(String(u).trim()) && detectarFormatoRadar(u, '') !== 'video'
  );
  const rotaPadrao = item.rota_editoria || MAPA_ROTAS_EDITORIA[catRaw] || '/radar';
  const fonteUrl = urlsNaoVideo[0] || urlsFontes[0] || item.fonte_url || rotaPadrao;
  const formatoV2 = urlsNaoVideo.length > 0 ? 'materia' : detectarFormatoRadar(fonteUrl, 'Síntese Rodando o Mundo · Pulso V2');
  const paises =
    Array.isArray(item.paises_envolvidos) && item.paises_envolvidos.length > 0
      ? item.paises_envolvidos
      : detectarPaisesNoTexto(`${titulo} ${resumo} ${analise}`, kws);

  const score = Number(item.urgencia_score || item.relevancia_score || 85);
  const dataPubOrig = parseTimestampIso(
    item.data_publicacao ||
    item.created_at ||
    item.publicado_em ||
    item.updated_at ||
    ''
  );

  return {
    id: `v2-${slug}`,
    slug,
    titulo,
    resumo,
    analise,
    categoria: ['geopolitica', 'politica', 'economia', 'cultura'].includes(catNorm) ? catNorm : 'geopolitica',
    fonte_nome: 'Síntese Rodando o Mundo · Pulso V2',
    fonte_url: fonteUrl,
    formato: formatoV2,
    origem_video: formatoV2 === 'video',
    data_publicacao: dataPubOrig,
    origem_v2: true,
    urgencia_score: score,
    nivel_relevancia: nivelRelevanciaValido(item),
    paises_envolvidos: paises,
    palavras_chave: kws,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const isRefresh = isRefreshRequest(request);
  const categoriaFiltro = normalizar(url.searchParams.get('categoria') || 'todos');

  try {
    const [vitrineRes, feedRes, ytData] = await Promise.all([
      carregarEstadoOuAssetRadar('vitrine_ia', 'data/vitrine_ia.json', request, env, isRefresh),
      carregarEstadoOuAssetRadar('feed_output', 'data/feed_output.json', request, env, isRefresh),
      carregarAssetJson('data/noticias_youtube.json', request, env),
    ]);

    const vitrineSnap = vitrineRes.data;
    const feedOutput = feedRes.data;
    const usedFallback = Boolean(vitrineRes.fallback || feedRes.fallback);
    const headers = construirHeadersCache(isRefresh, usedFallback);

    const temasVitrine =
      vitrineSnap && Array.isArray(vitrineSnap.temas_ativos) && vitrineSnap.temas_ativos.length > 0
        ? vitrineSnap.temas_ativos.filter((t) => t && typeof t === 'object')
        : [];

    const cardsYt =
      ytData && Array.isArray(ytData.items)
        ? ytData.items
            .filter((item) => item && typeof item === 'object')
            .map((item, idx) => {
              const textoCard = `${item.titulo || ''} ${item.resumo || ''}`;
              const dataPub = parseTimestampIso(
                item.data_publicacao || item.published_at || item.publicado_em || ''
              );
              const canalNome = item.fonte_nome || item.canal || 'YouTube';
              const linkVideo = item.fonte_url || item.url || '/radar';
              const resumoYt = String(item.resumo || '').trim();
              const analiseYt = limparAnaliseRadar(item.analise, resumoYt);
              return {
                id: item.id || `yt-${idx + 1}`,
                video_id: item.video_id || '',
                slug: item.slug || `yt-${idx + 1}`,
                titulo: item.titulo || '',
                resumo: resumoYt,
                analise: analiseYt,
                categoria: normalizar(item.categoria || 'geopolitica') || 'geopolitica',
                fonte_nome: canalNome,
                canal: canalNome,
                fonte_url: linkVideo,
                url: linkVideo,
                thumbnail: item.thumbnail || item.imagem_url || '',
                imagem_url: item.imagem_url || item.thumbnail || '',
                formato: 'video',
                origem: 'video',
                origem_video: true,
                origem_manual: Boolean(item.origem_manual || item.aprovado_manualmente),
                aprovado_manualmente: Boolean(item.aprovado_manualmente),
                data_publicacao: dataPub,
                origem_v2: false,
                urgencia_score: Number(item.urgencia_score || (item.aprovado_manualmente ? 82 : 78)),
                nivel_relevancia: nivelRelevanciaValido(item),
                paises_envolvidos: Array.isArray(item.paises_envolvidos)
                  ? item.paises_envolvidos
                  : detectarPaisesNoTexto(textoCard, []),
                palavras_chave: Array.isArray(item.palavras_chave) ? item.palavras_chave : [canalNome, 'video', 'youtube'],
              };
            })
        : [];

    const urlsVideosCanais = new Set(
      cardsYt.map((v) => String(v.fonte_url || '').trim()).filter((u) => u && u !== '/radar')
    );

    const itensV2 = temasVitrine.map((t) => mapearItemV2ParaRadar(t, urlsVideosCanais));

    const cardsFeed = Array.isArray(feedOutput)
      ? feedOutput
          .filter((card) => card && typeof card === 'object')
          .map((card, idx) => {
            const textoCard = `${card.titulo || ''} ${card.resumo || ''} ${card.analise || ''}`;
            const dataPub = parseTimestampIso(
              card.data_publicacao ||
              card.created_at ||
              card.publicado_em ||
              card.updated_at ||
              ''
            );
            const fUrl = card.fonte_url || card.url || '/radar';
            const fNome = card.fonte_nome || card.canal || 'Radar Editorial';
            const fmt = card.formato === 'video' || card.origem_video ? 'video' : detectarFormatoRadar(fUrl, fNome);
            const resumoCard = String(card.resumo || '').trim();
            const analiseCard = limparAnaliseRadar(card.analise, resumoCard);

            return {
              id: card.id || `feed-${idx + 1}`,
              video_id: card.video_id || '',
              slug: card.slug || '',
              titulo: card.titulo || '',
              resumo: resumoCard,
              analise: analiseCard,
              categoria: normalizar(card.categoria || 'geopolitica') || 'geopolitica',
              fonte_nome: fNome,
              fonte_url: fUrl,
              thumbnail: card.thumbnail || card.imagem_url || '',
              imagem_url: card.imagem_url || card.thumbnail || '',
              formato: fmt,
              origem: fmt === 'video' ? 'video' : (card.origem || 'rss'),
              origem_video: fmt === 'video',
              origem_manual: Boolean(card.origem_manual || card.aprovado_manualmente),
              aprovado_manualmente: Boolean(card.aprovado_manualmente),
              data_publicacao: dataPub,
              origem_v2: false,
              urgencia_score: Number(card.urgencia_score || (fmt === 'video' ? 78 : 70)),
              nivel_relevancia: nivelRelevanciaValido(card),
              paises_envolvidos: Array.isArray(card.paises_envolvidos)
                ? card.paises_envolvidos
                : detectarPaisesNoTexto(textoCard, []),
              palavras_chave: Array.isArray(card.palavras_chave) ? card.palavras_chave : [],
            };
          })
      : [];

    const titulosVistos = new Set();
    const urlsVideosVistos = new Set();
    const combinados = [];

    for (const item of [...cardsYt, ...itensV2, ...cardsFeed]) {
      const chaveTitulo = normalizar(item.titulo);
      if (!chaveTitulo || titulosVistos.has(chaveTitulo)) continue;
      const ehVideoCanal = (item.formato === 'video' || item.origem_video) && !item.origem_v2;
      const urlItem = String(item.fonte_url || '').trim();
      if (ehVideoCanal && urlItem && urlItem !== '/radar') {
        if (urlsVideosVistos.has(urlItem)) continue;
        urlsVideosVistos.add(urlItem);
      }
      titulosVistos.add(chaveTitulo);
      combinados.push(item);
    }

    const paraOrdenar =
      categoriaFiltro && categoriaFiltro !== 'todos'
        ? combinados.filter((item) => normalizar(item.categoria) === categoriaFiltro)
        : combinados;

    const filtrados = sortirCardsRodizioAmplo(paraOrdenar, 2);

    let maisRecenteIso = (vitrineSnap && vitrineSnap.updatedAt) || '';
    let maxTs = 0;
    for (const item of filtrados) {
      const ts = timestampPublicacao(item);
      if (ts > maxTs && item.data_publicacao) {
        maxTs = ts;
        maisRecenteIso = item.data_publicacao;
      }
    }
    const updatedAtIso = (vitrineSnap && vitrineSnap.updatedAt) || maisRecenteIso || '';
    const carimboHora = maisRecenteIso ? formatarRotuloRelativo(maisRecenteIso) : '';

    return json(
      {
        ok: true,
        cached: !isRefresh && !usedFallback,
        fallback: usedFallback,
        source: itensV2.length > 0 ? 'v2_hybrid' : 'feed_output',
        atualizado_em: carimboHora,
        updatedAt: updatedAtIso,
        total: filtrados.length,
        items: filtrados,
      },
      200,
      headers
    );
  } catch {
    return json(
      {
        ok: false,
        cached: false,
        fallback: true,
        source: 'error_fallback',
        items: [],
        total: 0,
        error: 'Falha no processamento do radar híbrido',
      },
      200,
      construirHeadersCache(isRefresh, true)
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
