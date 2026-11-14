// GET /api/entenda-o-assunto
// Proxy / Fallback Serverless para o dossiê contextual e colunas analíticas do Motor V2 (/v2/entenda-o-assunto/{slug} e /v2/colunas).
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

const MAPA_LABEL_CATEGORIA = {
  Geopolitica_Radar: 'Geopolítica & Infraestrutura',
  Politica: 'Política & Instituições',
  Economia: 'Economia & Mercados',
  Cultura: 'Sociedade & Cultura',
  Eleicoes: 'Eleições & Democracia',
  Resumo_Ultimas: 'Panorama Global',
};

const MAPA_ROTAS_EDITORIA = {
  Politica: '/politica',
  Economia: '/economia',
  Cultura: '/cultura',
  Eleicoes: '/eleicoes',
  Geopolitica_Radar: '/radar',
  Resumo_Ultimas: '/ultimas-noticias',
};

const FALLBACK_SNAPSHOT = {
  updatedAt: '2026-11-14T00:55:57Z',
  temas_ativos: [
    {
      slug: 'faa-suspende-voos-eua-falha-comunicacao-sistemas',
      titulo_tema: 'Paralisação Total dos Voos nos EUA por Falha Crítica de Comunicação',
      categoria_primaria: 'Geopolitica_Radar',
      rota_editoria: '/radar',
      relevancia_score: 93,
      palavras_chave_busca: [
        'faa voos eua',
        'paralisacao aviacao americana',
        'telecommunication outage faa',
        'voos cancelados eua',
      ],
      gatilho_vitrine: 'Colapso de comunicação na aviação dos EUA gera efeito cascata no transporte aéreo e comércio global.',
      sintese_nerd: 'A ordem de paralisação em solo decretada pela FAA devido a uma falha em sistemas de comunicação expõe a vulnerabilidade das infraestruturas críticas americanas. O incidente causa caos logístico imediato com potencial de impacto em conexões financeiras e de suprimentos globais.',
    },
    {
      slug: 'pane-global-microsoft-outlook-impacto-judiciario-brasil',
      titulo_tema: 'Apagão Tecnológico da Microsoft Causa Transtornos Globais e Paralisa Prazos no STF',
      categoria_primaria: 'Geopolitica_Radar',
      rota_editoria: '/radar',
      relevancia_score: 89,
      palavras_chave_busca: [
        'pane microsoft outlook',
        'apagao cibernetico microsoft',
        'cnj suspende prazos',
        'stf falha microsoft',
      ],
      gatilho_vitrine: 'Instabilidade em serviços da Microsoft atinge de tribunais brasileiros a empresas globais.',
      sintese_nerd: 'A pane prolongada nos servidores da Microsoft paralisou fluxos corporativos e forçou o CNJ a suspender prazos processuais no STF e instâncias federais. O episódio acende o alerta sobre a dependência excessiva do setor público e privado em monopólios de infraestrutura em nuvem.',
    },
    {
      slug: 'lula-filipinas-brasil-parceiro-dialogo-asean',
      titulo_tema: 'Brasil Busca Aproximação Estratégica com a ASEAN durante Visita às Filipinas',
      categoria_primaria: 'Geopolitica_Radar',
      rota_editoria: '/radar',
      relevancia_score: 86,
      palavras_chave_busca: [
        'lula filipinas',
        'brasil asean parceiro dialogo',
        'comercio sudeste asiatico',
        'cupula asean manila',
      ],
      gatilho_vitrine: 'Brasil formaliza ofensiva comercial e geopolítica com bloco do Sudeste Asiático.',
      sintese_nerd: 'A presença do governo brasileiro na Cúpula da ASEAN busca diversificar parceiros comerciais fora do eixo tradicional ocidental, mirando um mercado consumidor em rápida expansão. A mudança de status para Parceiro de Diálogo pode facilitar acordos tarifários estratégicos para commodities e tecnologia.',
    },
    {
      slug: 'ajuste-fiscal-senado-placar-alerta-governo-pecs-2027',
      titulo_tema: 'Placar Estreito no Ajuste Fiscal no Senado Sinaliza Entrave para PECs Estruturais',
      categoria_primaria: 'Politica',
      rota_editoria: '/politica',
      relevancia_score: 84,
      palavras_chave_busca: [
        'ajuste fiscal senado',
        'votação ajuste fiscal 45 votos',
        'governo lula articulacao senado',
        'meta fiscal brasil 2027',
      ],
      gatilho_vitrine: 'Placar de 45 votos no Senado evidencia margem apertada para reformas constitucionais.',
      sintese_nerd: 'Embora o governo tenha aprovado a matéria ordinária do ajuste fiscal com 45 votos, o resultado ficou abaixo da fasquia de 49 votos exigida para alterar a Constituição. O mapa de votação acena para a necessidade de maior concessão política ao centro caso o Planalto queira votar novas PECs.',
    },
    {
      slug: 'stf-camara-regras-transicao-escala-trabalho-5x2',
      titulo_tema: 'STF Forma Maioria pela Escala 5x2 Enquanto Câmara Questiona Interferência',
      categoria_primaria: 'Politica',
      rota_editoria: '/politica',
      relevancia_score: 82,
      palavras_chave_busca: [
        'escala 5x2 stf',
        'decisao flavio dino escala',
        'camara dos deputados stf 5x2',
        'reforma trabalhista jornada',
      ],
      gatilho_vitrine: 'STF e Câmara divergem sobre o ritmo e os critérios da transição para a escala 5x2.',
      sintese_nerd: 'O avanço de votos no STF para manter o início da transição da jornada em 16 de dezembro reacendeu a fricção institucional com o Legislativo, que argumenta usurpação de competência. A controvérsia gera incerteza jurídica para empregadores e trabalhadores no planejamento das escalas de fim de ano.',
    },
  ],
};

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
    'Cache-Control': 'public, max-age=120, s-maxage=300',
    'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=300, stale-while-revalidate=60',
    'X-Content-Type-Options': 'nosniff',
    ...CORS_HEADERS,
  };
}

async function carregarSnapshotEstatico(request) {
  try {
    const filePath = path.resolve(process.cwd(), 'data', 'vitrine_ia.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.temas_ativos) && parsed.temas_ativos.length > 0) {
      return parsed;
    }
  } catch {
    // Tenta via URL da CDN
  }
  try {
    const assetUrl = new URL('/data/vitrine_ia.json', request.url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const resp = await fetch(assetUrl.toString(), { signal: ctrl.signal });
    clearTimeout(timer);
    if (resp.ok) {
      const data = await resp.json();
      if (data && Array.isArray(data.temas_ativos) && data.temas_ativos.length > 0) {
        return data;
      }
    }
  } catch {
    // Fallback embutido
  }
  return FALLBACK_SNAPSHOT;
}

async function consultarBackendExterno(backendUrl, caminho, searchParams) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const alvo = new URL(caminho, backendUrl.endsWith('/') ? backendUrl : backendUrl + '/');
    if (searchParams) {
      searchParams.forEach((v, k) => alvo.searchParams.set(k, v));
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

function converterTemaEmColuna(tema, updatedAtIso) {
  const catPrimaria = tema.categoria_primaria || 'Geopolitica_Radar';
  const labelCat = MAPA_LABEL_CATEGORIA[catPrimaria] || 'Geopolítica & Contexto';
  const rota = tema.rota_editoria || MAPA_ROTAS_EDITORIA[catPrimaria] || '/radar';
  const resumo = limparPrefixoGatilho(tema.gatilho_vitrine || tema.resumo || '');
  const analise = tema.sintese_nerd || tema.analise_aprofundada || resumo;
  const kws = Array.isArray(tema.palavras_chave_busca)
    ? tema.palavras_chave_busca
    : Array.isArray(tema.palavras_chave)
    ? tema.palavras_chave
    : [];
  const paises = detectarPaisesNoTexto(`${tema.titulo_tema || ''} ${resumo} ${analise}`, kws);

  return {
    slug: tema.slug || '',
    titulo: tema.titulo_tema || tema.titulo || '',
    categoria: labelCat,
    resumo,
    analise_aprofundada: analise,
    palavras_chave: kws,
    paises_envolvidos: paises,
    rota_editoria: rota,
    updated_at: tema.updated_at || updatedAtIso,
    origem_v2: true,
  };
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const isRefresh = url.searchParams.has('_t') || url.searchParams.get('refresh') === '1';
  const headers = construirHeadersCache(isRefresh);

  const slug = String(url.searchParams.get('slug') || '').trim();
  const acao = String(url.searchParams.get('acao') || 'colunas').toLowerCase().trim();

  const backendUrl = String(process.env.CURADORIA_BACKEND_URL || '').trim();
  const temBackendAtivo =
    backendUrl &&
    /^https?:\/\//i.test(backendUrl) &&
    !backendUrl.includes('api.rodandoomundo.com.br');

  try {
    if (temBackendAtivo) {
      const params = new URLSearchParams();
      if (isRefresh) params.set('_t', String(Date.now()));

      if (slug) {
        const dossieExt = await consultarBackendExterno(
          backendUrl,
          `v2/entenda-o-assunto/${encodeURIComponent(slug)}`,
          params
        );
        if (dossieExt) {
          const nowIso = new Date().toISOString();
          return json(
            {
              ok: true,
              source: 'v2_api',
              atualizado_em: formatarHoraCurta(nowIso),
              colunas: Array.isArray(dossieExt.colunas) ? dossieExt.colunas : [],
              dossie: dossieExt.dossie || dossieExt,
            },
            200,
            headers
          );
        }
      } else if (acao === 'colunas' || !acao) {
        const colunasExt = await consultarBackendExterno(backendUrl, 'v2/colunas', params);
        if (colunasExt && (Array.isArray(colunasExt.colunas) || Array.isArray(colunasExt))) {
          const lista = Array.isArray(colunasExt.colunas) ? colunasExt.colunas : colunasExt;
          const nowIso = new Date().toISOString();
          return json(
            {
              ok: true,
              source: 'v2_api',
              atualizado_em: formatarHoraCurta(nowIso),
              colunas: lista,
              dossie: null,
            },
            200,
            headers
          );
        }
      }
    }

    const snap = await carregarSnapshotEstatico(request);
    const updatedAtIso = isRefresh ? new Date().toISOString() : (snap.updatedAt || new Date().toISOString());
    const carimboHora = formatarHoraCurta(updatedAtIso);

    const temas = Array.isArray(snap.temas_ativos) ? snap.temas_ativos : FALLBACK_SNAPSHOT.temas_ativos;
    const colunas = temas.map((t) => converterTemaEmColuna(t, snap.updatedAt || updatedAtIso));

    let dossie = null;
    if (slug) {
      const encontrada = colunas.find((c) => c.slug === slug);
      if (encontrada) {
        dossie = {
          ...encontrada,
          identificacao_editorial: 'Síntese Rodando o Mundo · V2',
          contexto_historico: encontrada.analise_aprofundada,
        };
      }
    }

    return json(
      {
        ok: true,
        source: 'vitrine_snapshot',
        atualizado_em: carimboHora,
        colunas,
        dossie,
      },
      200,
      headers
    );
  } catch (err) {
    const fallbackIso = new Date().toISOString();
    const colunasFallback = FALLBACK_SNAPSHOT.temas_ativos.map((t) =>
      converterTemaEmColuna(t, FALLBACK_SNAPSHOT.updatedAt)
    );
    return json(
      {
        ok: true,
        source: 'vitrine_snapshot',
        atualizado_em: formatarHoraCurta(fallbackIso),
        colunas: colunasFallback,
        dossie: slug ? colunasFallback.find((c) => c.slug === slug) || null : null,
      },
      200,
      headers
    );
  }
};

export const config = {
  path: '/api/entenda-o-assunto',
  method: ['GET', 'OPTIONS'],
};
