// GET /api/radar
// Endpoint unificado do Radar Editorial (/radar), mesclando itens em tempo real do Motor V2 com briefings de data/feed_output.json.
// Segue estritamente o contrato .agents/contracts/INT-V2-SITE.md.
import fs from 'node:fs/promises';
import path from 'node:path';
import { json } from '../lib/ia.mjs';
import { detectarPaisesNoTexto, formatarHoraCurta } from './noticias-quentes.mjs';

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
    sintese_nerd: 'A ordem de paralisação em solo decretada pela FAA devido a uma falha em sistemas de comunicação expõe a vulnerabilidade das infraestruturas críticas americanas. O incidente causa caos logístico imediato com potencial de impacto em conexões financeiras e de suprimentos globais.',
  },
  {
    slug: 'pane-global-microsoft-outlook-impacto-judiciario-brasil',
    titulo_tema: 'Apagão Tecnológico da Microsoft Causa Transtornos Globais e Paralisa Prazos no STF',
    categoria_primaria: 'Geopolitica_Radar',
    rota_editoria: '/radar',
    relevancia_score: 89,
    palavras_chave_busca: ['pane microsoft outlook', 'apagao cibernetico microsoft', 'cnj suspende prazos', 'stf falha microsoft'],
    gatilho_vitrine: 'Instabilidade em serviços da Microsoft atinge de tribunais brasileiros a empresas globais.',
    sintese_nerd: 'A pane prolongada nos servidores da Microsoft paralisou fluxos corporativos e forçou o CNJ a suspender prazos processuais no STF e instâncias federais. O episódio acende o alerta sobre a dependência excessiva do setor público e privado em monopólios de infraestrutura em nuvem.',
  },
  {
    slug: 'lula-filipinas-brasil-parceiro-dialogo-asean',
    titulo_tema: 'Brasil Busca Aproximação Estratégica com a ASEAN durante Visita às Filipinas',
    categoria_primaria: 'Geopolitica_Radar',
    rota_editoria: '/radar',
    relevancia_score: 86,
    palavras_chave_busca: ['lula filipinas', 'brasil asean parceiro dialogo', 'cupula asean manila'],
    gatilho_vitrine: 'Brasil formaliza ofensiva comercial e geopolítica com bloco do Sudeste Asiático.',
    sintese_nerd: 'A presença do governo brasileiro na Cúpula da ASEAN busca diversificar parceiros comerciais fora do eixo tradicional ocidental, mirando um mercado consumidor em rápida expansão. A mudança de status para Parceiro de Diálogo pode facilitar acordos tarifários estratégicos para commodities e tecnologia.',
  },
  {
    slug: 'ajuste-fiscal-senado-placar-alerta-governo-pecs-2027',
    titulo_tema: 'Placar Estreito no Ajuste Fiscal no Senado Sinaliza Entrave para PECs Estruturais',
    categoria_primaria: 'Politica',
    rota_editoria: '/politica',
    relevancia_score: 84,
    palavras_chave_busca: ['ajuste fiscal senado', 'governo lula articulacao senado', 'meta fiscal brasil 2027'],
    gatilho_vitrine: 'Placar de 45 votos no Senado evidencia margem apertada para reformas constitucionais.',
    sintese_nerd: 'Embora o governo tenha aprovado a matéria ordinária do ajuste fiscal com 45 votos, o resultado ficou abaixo da fasquia de 49 votos exigida para alterar a Constituição. O mapa de votação acena para a necessidade de maior concessão política ao centro caso o Planalto queira votar novas PECs.',
  },
  {
    slug: 'stf-camara-regras-transicao-escala-trabalho-5x2',
    titulo_tema: 'STF Forma Maioria pela Escala 5x2 Enquanto Câmara Questiona Interferência',
    categoria_primaria: 'Politica',
    rota_editoria: '/politica',
    relevancia_score: 82,
    palavras_chave_busca: ['escala 5x2 stf', 'camara dos deputados stf 5x2', 'reforma trabalhista jornada'],
    gatilho_vitrine: 'STF e Câmara divergem sobre o ritmo e os critérios da transição para a escala 5x2.',
    sintese_nerd: 'O avanço de votos no STF para manter o início da transição da jornada em 16 de dezembro reacendeu a fricção institucional com o Legislativo, que argumenta usurpação de competência. A controvérsia gera incerteza jurídica para empregadores e trabalhadores no planejamento das escalas de fim de ano.',
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

function construirHeadersCache(isRefresh) {
  if (isRefresh) {
    return {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      ...CORS_HEADERS,
    };
  }
  return {
    'Cache-Control': 'public, max-age=60, s-maxage=180',
    'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=180, stale-while-revalidate=60',
    'X-Content-Type-Options': 'nosniff',
    ...CORS_HEADERS,
  };
}

async function lerArquivoJsonLocalOuCdn(relPath, request) {
  try {
    const filePath = path.resolve(process.cwd(), ...relPath.split('/'));
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    // Fallback para fetch via URL da CDN
  }
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
    // Ignora falha
  }
  return null;
}

async function acionarPulsoBackend(backendUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const alvo = new URL('v1/noticias-quentes/executar', backendUrl.endsWith('/') ? backendUrl : backendUrl + '/');
    await fetch(alvo.toString(), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
  } catch {
    // Ignora timeout ou lock de concorrência
  } finally {
    clearTimeout(timer);
  }
}

async function consultarNoticiasQuentesBackend(backendUrl, isRefresh) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const alvo = new URL('v1/noticias-quentes', backendUrl.endsWith('/') ? backendUrl : backendUrl + '/');
    if (isRefresh) {
      alvo.searchParams.set('refresh', '1');
      alvo.searchParams.set('_t', String(Date.now()));
    }
    const resp = await fetch(alvo.toString(), {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const isRefresh = url.searchParams.has('_t') || url.searchParams.get('refresh') === '1';
  const forceExec = url.searchParams.get('refresh') === '1';
  const headers = construirHeadersCache(isRefresh);

  const categoriaFiltro = normalizar(url.searchParams.get('categoria') || 'todos');

  const backendUrl = String(process.env.CURADORIA_BACKEND_URL || '').trim();
  const temBackendAtivo =
    backendUrl &&
    /^https?:\/\//i.test(backendUrl) &&
    !backendUrl.includes('api.rodandoomundo.com.br');

  try {
    let itensV2Backend = [];
    let backendUpdatedAt = null;

    if (temBackendAtivo) {
      if (forceExec) {
        await acionarPulsoBackend(backendUrl);
      }
      const respExt = await consultarNoticiasQuentesBackend(backendUrl, isRefresh);
      if (respExt && Array.isArray(respExt.noticias_quentes) && respExt.noticias_quentes.length > 0) {
        backendUpdatedAt = respExt.updatedAt || new Date().toISOString();
        itensV2Backend = respExt.noticias_quentes.map((n) => mapearItemV2ParaRadar(n, backendUpdatedAt));
      }
    }

    const [vitrineSnap, feedOutput] = await Promise.all([
      lerArquivoJsonLocalOuCdn('data/vitrine_ia.json', request),
      lerArquivoJsonLocalOuCdn('data/feed_output.json', request),
    ]);

    const updatedAtIso = isRefresh
      ? new Date().toISOString()
      : backendUpdatedAt || (vitrineSnap && vitrineSnap.updatedAt) || new Date().toISOString();

    const carimboHora = formatarHoraCurta(updatedAtIso);

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

    // Combina itens V2 no topo + itens do feed_output.json deduplicando por título normalizado
    const titulosVistos = new Set();
    const combinados = [];

    for (const item of [...itensV2Backend, ...itensV2Snapshot, ...cardsFeed]) {
      const chaveTitulo = normalizar(item.titulo);
      if (!chaveTitulo || titulosVistos.has(chaveTitulo)) continue;
      titulosVistos.add(chaveTitulo);
      combinados.push(item);
    }

    const filtrados =
      categoriaFiltro && categoriaFiltro !== 'todos'
        ? combinados.filter((item) => normalizar(item.categoria) === categoriaFiltro)
        : combinados;

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
  } catch (err) {
    const fallbackIso = new Date().toISOString();
    const carimbo = formatarHoraCurta(fallbackIso);
    const fallbackItems = FALLBACK_VITRINE_TEMAS.map((t) => mapearItemV2ParaRadar(t, fallbackIso));
    return json(
      {
        ok: true,
        cached: false,
        source: 'v2_hybrid',
        atualizado_em: carimbo,
        updatedAt: fallbackIso,
        total: fallbackItems.length,
        items: fallbackItems,
      },
      200,
      headers
    );
  }
};

export const config = {
  path: '/api/radar',
  method: ['GET', 'OPTIONS'],
};
