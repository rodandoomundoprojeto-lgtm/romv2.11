// GET /api/noticias-quentes
// Proxy / Fallback Serverless (Cloudflare Pages Function) para o Pulso de Notícias Quentes e Países em Alta no Mapa (Motor V2).
// Segue estritamente o contrato .agents/contracts/INT-V2-SITE.md.
import { json } from '../lib/ia.js';
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

const MAPA_CATEGORIA_V2 = {
  Geopolitica_Radar: 'geopolitica',
  Politica: 'politica',
  Economia: 'economia',
  Cultura: 'cultura',
  Eleicoes: 'politica',
  Resumo_Ultimas: 'geral',
};

const MAPA_LABEL_EDITORIA = {
  Geopolitica_Radar: 'Radar',
  Politica: 'Política',
  Economia: 'Economia',
  Cultura: 'Cultura',
  Eleicoes: 'Eleições',
  Resumo_Ultimas: 'Últimas Notícias',
};

const MAPA_ROTAS_EDITORIA = {
  Politica: '/politica',
  Economia: '/economia',
  Cultura: '/cultura',
  Eleicoes: '/eleicoes',
  Geopolitica_Radar: '/radar',
  Resumo_Ultimas: '/ultimas-noticias',
};

const CATALOGO_PAISES = [
  {
    a2: 'US',
    countryName: 'Estados Unidos',
    termos: [
      'estados unidos', 'eua', 'faa', 'washington', 'trump', 'biden', 'casa branca',
      'pentagono', 'wall street', 'reserva federal', 'departamento de estado',
      'congresso dos estados unidos', 'aviacao americana', 'infraestruturas criticas americanas',
      'nova york', 'california', 'texas', 'florida',
    ],
  },
  {
    a2: 'PH',
    countryName: 'Filipinas',
    termos: ['filipinas', 'manila', 'filipino', 'filipina', 'marcos jr', 'cupula asean manila'],
  },
  {
    a2: 'CN',
    countryName: 'China',
    termos: [
      'china', 'chines', 'chinesa', 'chineses', 'pequim', 'beijing', 'xi jinping',
      'xangai', 'shanghai', 'shenzhen', 'partido comunista chines', 'taiwan',
    ],
  },
  {
    a2: 'AR',
    countryName: 'Argentina',
    termos: ['argentina', 'argentino', 'argentinos', 'buenos aires', 'milei', 'casa rosada', 'patagonia'],
  },
  {
    a2: 'FR',
    countryName: 'França',
    termos: ['franca', 'frances', 'francesa', 'paris', 'macron', 'eliseu'],
  },
  {
    a2: 'DE',
    countryName: 'Alemanha',
    termos: ['alemanha', 'alemao', 'alema', 'berlim', 'scholz', 'merz', 'bundestag', 'frankfurt'],
  },
  {
    a2: 'GB',
    countryName: 'Reino Unido',
    termos: ['reino unido', 'inglaterra', 'londres', 'britanico', 'britanica', 'starmer', 'escocia', 'downing street'],
  },
  {
    a2: 'PT',
    countryName: 'Portugal',
    termos: ['portugal', 'portugues', 'portuguesa', 'lisboa', 'porto'],
  },
  {
    a2: 'UA',
    countryName: 'Ucrânia',
    termos: ['ucrania', 'ucraniano', 'ucraniana', 'kiev', 'kyiv', 'zelensky', 'donbass', 'kharkiv'],
  },
  {
    a2: 'RU',
    countryName: 'Rússia',
    termos: ['russia', 'russo', 'russa', 'moscou', 'kremlin', 'putin', 'sovietica', 'uniao sovietica'],
  },
  {
    a2: 'IL',
    countryName: 'Israel',
    termos: ['israel', 'israelense', 'tel aviv', 'jerusalem', 'netanyahu', 'mossad', 'faixa de gaza', 'idf'],
  },
  {
    a2: 'IR',
    countryName: 'Irã',
    termos: ['ira', 'iraniano', 'iraniana', 'teera', 'khamenei', 'persa', 'uranio enriquecido'],
  },
  {
    a2: 'JP',
    countryName: 'Japão',
    termos: ['japao', 'japones', 'japonesa', 'toquio', 'tokyo', 'iene'],
  },
  {
    a2: 'IN',
    countryName: 'Índia',
    termos: ['india', 'indiano', 'indiana', 'nova delhi', 'modi', 'mumbai'],
  },
  {
    a2: 'MX',
    countryName: 'México',
    termos: ['mexico', 'mexicano', 'mexicana', 'cidade do mexico', 'sheinbaum'],
  },
  {
    a2: 'ES',
    countryName: 'Espanha',
    termos: ['espanha', 'espanhol', 'espanhola', 'madri', 'madrid', 'barcelona', 'sanchez'],
  },
  {
    a2: 'IT',
    countryName: 'Itália',
    termos: ['italia', 'italiano', 'italiana', 'roma', 'meloni', 'milao'],
  },
  {
    a2: 'CA',
    countryName: 'Canadá',
    termos: ['canada', 'canadense', 'ottawa', 'trudeau', 'toronto', 'vancouver'],
  },
  {
    a2: 'ZA',
    countryName: 'África do Sul',
    termos: ['africa do sul', 'sul-africano', 'sul-africana', 'pretoria', 'joanesburgo', 'cidade do cabo'],
  },
  {
    a2: 'CO',
    countryName: 'Colômbia',
    termos: ['colombia', 'colombiano', 'colombiana', 'bogota', 'gustavo petro'],
  },
  {
    a2: 'CL',
    countryName: 'Chile',
    termos: ['chile', 'chileno', 'chilena', 'santiago', 'boric'],
  },
  {
    a2: 'VE',
    countryName: 'Venezuela',
    termos: ['venezuela', 'venezuelano', 'venezuelana', 'caracas', 'maduro'],
  },
  {
    a2: 'PY',
    countryName: 'Paraguai',
    termos: ['paraguai', 'paraguaio', 'assuncao', 'itaipu'],
  },
  {
    a2: 'UY',
    countryName: 'Uruguai',
    termos: ['uruguai', 'uruguaio', 'montevideu'],
  },
  {
    a2: 'PE',
    countryName: 'Peru',
    termos: ['peru', 'peruano', 'lima'],
  },
  {
    a2: 'KR',
    countryName: 'Coreia do Sul',
    termos: ['coreia do sul', 'sul-coreano', 'seul'],
  },
  {
    a2: 'KP',
    countryName: 'Coreia do Norte',
    termos: ['coreia do norte', 'norte-coreano', 'pyongyang', 'kim jong'],
  },
  {
    a2: 'SA',
    countryName: 'Arábia Saudita',
    termos: ['arabia saudita', 'saudita', 'riad'],
  },
  {
    a2: 'TR',
    countryName: 'Turquia',
    termos: ['turquia', 'turco', 'ancara', 'istambul', 'erdogan'],
  },
  {
    a2: 'EG',
    countryName: 'Egito',
    termos: ['egito', 'egipcio', 'cairo', 'suez'],
  },
  {
    a2: 'AU',
    countryName: 'Austrália',
    termos: ['australia', 'australiano', 'camberra', 'sydney', 'melbourne'],
  },
  {
    a2: 'NZ',
    countryName: 'Nova Zelândia',
    termos: ['nova zelandia', 'neozelandes', 'wellington', 'auckland'],
  },
  {
    a2: 'EC',
    countryName: 'Equador',
    termos: ['equador', 'equatoriano', 'quito', 'guayaquil', 'noboa'],
  },
  {
    a2: 'BO',
    countryName: 'Bolívia',
    termos: ['bolivia', 'boliviano', 'la paz', 'sucre', 'arce'],
  },
  {
    a2: 'PL',
    countryName: 'Polônia',
    termos: ['polonia', 'polones', 'varsovia', 'tusk'],
  },
  {
    a2: 'SE',
    countryName: 'Suécia',
    termos: ['suecia', 'sueco', 'estocolmo'],
  },
  {
    a2: 'NO',
    countryName: 'Noruega',
    termos: ['noruega', 'noruegues', 'oslo'],
  },
  {
    a2: 'NL',
    countryName: 'Países Baixos',
    termos: ['paises baixos', 'holanda', 'holandes', 'amsterda', 'haia'],
  },
  {
    a2: 'CH',
    countryName: 'Suíça',
    termos: ['suica', 'suico', 'berna', 'genebra', 'zurique'],
  },
  {
    a2: 'NG',
    countryName: 'Nigéria',
    termos: ['nigeria', 'nigeriano', 'abuja', 'lagos', 'tinubu'],
  },
  {
    a2: 'KE',
    countryName: 'Quênia',
    termos: ['quenia', 'queniano', 'nairobi', 'ruto'],
  },
  {
    a2: 'AO',
    countryName: 'Angola',
    termos: ['angola', 'angolano', 'luanda', 'lourenco'],
  },
  {
    a2: 'MZ',
    countryName: 'Moçambique',
    termos: ['mocambique', 'mocambicano', 'maputo', 'chapog'],
  },
  {
    a2: 'CU',
    countryName: 'Cuba',
    termos: ['cuba', 'cubano', 'havana', 'diaz-canel'],
  },
  {
    a2: 'BR',
    countryName: 'Brasil',
    termos: [
      'brasil', 'brasileiro', 'brasileira', 'brasileiros', 'brasilia', 'lula',
      'stf', 'supremo tribunal federal', 'senado', 'camara dos deputados',
      'congresso nacional', 'planalto', 'cnj', 'stj', 'itamaraty', 'petrobras',
      'banco central do brasil', 'ibge', 'policia federal', 'defesa civil',
      'sao paulo', 'rio de janeiro', 'tocantins', 'minas gerais', 'bahia',
    ],
  },
];

const MAPA_PAIS_POR_A2 = Object.fromEntries(CATALOGO_PAISES.map((p) => [p.a2, p]));

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
    const hh = partes.find((p) => p.type === 'hour')?.value || '00';
    const mm = partes.find((p) => p.type === 'minute')?.value || '00';
    return `Atualizado às ${hh}h${mm}`;
  } catch {
    const d = new Date();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `Atualizado às ${hh}h${mm}`;
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectarPaisesNoTexto(texto, palavrasChave = []) {
  const kwJoined = Array.isArray(palavrasChave) ? palavrasChave.join(' ') : String(palavrasChave || '');
  const textoNorm = normalizar(texto);
  const kwNorm = normalizar(kwJoined);
  const combinado = `${textoNorm} ${kwNorm}`.trim();
  if (!combinado) return [];

  const pontuados = [];

  for (const pais of CATALOGO_PAISES) {
    let score = 0;
    for (const termo of pais.termos) {
      const rx = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(termo)}(?:$|[^a-z0-9])`, 'i');
      if (rx.test(kwNorm)) score += 45;
      if (rx.test(textoNorm)) score += 30;
    }
    if (score > 0) {
      const bonusEspecificidade = pais.a2 !== 'BR' ? 5 : 0;
      pontuados.push({ a2: pais.a2, score: score + bonusEspecificidade });
    }
  }

  pontuados.sort((a, b) => b.score - a.score);
  return pontuados.map((p) => p.a2);
}

function construirHeadersCache(isRefresh, isFallback = false) {
  return newsResponseHeaders({ isRefresh, isFallback, corsHeaders: CORS_HEADERS });
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

async function carregarSnapshotEstatico(request, env, isRefresh = false) {
  try {
    const assetUrl = new URL('/data/vitrine_ia.json', request.url);
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const respAsset = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
      if (respAsset && respAsset.ok) {
        const data = await respAsset.json();
        if (
          data &&
          ((Array.isArray(data.temas_ativos) && data.temas_ativos.length > 0) ||
            (Array.isArray(data.noticias_quentes) && data.noticias_quentes.length > 0))
        ) {
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
        if (
          data &&
          ((Array.isArray(data.temas_ativos) && data.temas_ativos.length > 0) ||
            (Array.isArray(data.noticias_quentes) && data.noticias_quentes.length > 0))
        ) {
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

function construirPaisesEmAlta(noticiasQuentes) {
  const mapaPaises = new Map();

  for (const item of noticiasQuentes) {
    const codigos = Array.isArray(item.paises_envolvidos) ? item.paises_envolvidos : [];
    for (const codigo of codigos) {
      const a2 = String(codigo || '').toUpperCase().trim();
      if (!a2 || mapaPaises.has(a2)) continue;
      const metaPais = MAPA_PAIS_POR_A2[a2];
      const nomePais = metaPais ? metaPais.countryName : a2;
      const kws = Array.isArray(item.palavras_chave) ? item.palavras_chave : [];
      mapaPaises.set(a2, {
        a2,
        countryName: nomePais,
        title: item.titulo_curto || '',
        source: 'Síntese Rodando o Mundo · V2',
        category: item._label_editoria || 'Radar',
        url: item._rota_editoria || '/radar',
        summary: item.resumo_pulso || '',
        termoBusca: kws[0] || item.titulo_curto || nomePais,
        urgencia_score: Number(item.urgencia_score || item.relevancia_score || 80),
        data_publicacao: item.data_publicacao || '',
        updated_at: item.updated_at || '',
      });
    }
  }

  return Array.from(mapaPaises.values()).sort((a, b) =>
    compararRecenciaDesc(a, b, 'urgencia_score')
  );
}

function normalizarNoticiaQuenteBruta(n, carimboHora) {
  const catPrimaria = n.categoria_primaria || n.categoria || 'Geopolitica_Radar';
  const categoria = MAPA_CATEGORIA_V2[catPrimaria] || normalizar(n.categoria || '') || 'geopolitica';
  const rotaEditoria = n._rota_editoria || n.rota_editoria || MAPA_ROTAS_EDITORIA[catPrimaria] || '/radar';
  const labelEditoria = n._label_editoria || MAPA_LABEL_EDITORIA[catPrimaria] || 'Radar';
  const titulo = n.titulo_curto || n.titulo_tema || n.titulo || '';
  const resumo = limparPrefixoGatilho(n.resumo_pulso || n.gatilho_vitrine || n.resumo || '');
  const impacto = n.impacto_pratico || n.sintese_nerd || resumo;
  const kws = Array.isArray(n.palavras_chave)
    ? n.palavras_chave
    : Array.isArray(n.palavras_chave_busca)
    ? n.palavras_chave_busca
    : [];
  const paises =
    Array.isArray(n.paises_envolvidos) && n.paises_envolvidos.length > 0
      ? n.paises_envolvidos
      : detectarPaisesNoTexto(`${titulo} ${resumo} ${impacto}`, kws);
  const score = Number(n.urgencia_score || n.relevancia_score || 80);
  const dataPub = parseTimestampIso(n.data_publicacao || n.publicado_em || n.created_at || '');
  const updatedAt = parseTimestampIso(n.updated_at || '') || dataPub;

  return {
    ...n,
    slug: n.slug || '',
    titulo_curto: titulo,
    resumo_pulso: resumo,
    impacto_pratico: impacto,
    categoria,
    paises_envolvidos: paises,
    urgencia_score: score,
    relevancia_score: Number(n.relevancia_score || score),
    veiculos_origem:
      Array.isArray(n.veiculos_origem) && n.veiculos_origem.length > 0
        ? n.veiculos_origem
        : ['Curadoria IA · Pulso V2'],
    fontes_urls: Array.isArray(n.fontes_urls) ? n.fontes_urls : [],
    palavras_chave: kws,
    atualizado_em: n.atualizado_em || carimboHora,
    data_publicacao: dataPub,
    updated_at: updatedAt,
    expires_at: n.expires_at || null,
    _rota_editoria: rotaEditoria,
    _label_editoria: labelEditoria,
  };
}

function converterTemasParaNoticiasQuentes(temasAtivos, updatedAtIso, carimboHora) {
  const listaValida = Array.isArray(temasAtivos)
    ? temasAtivos.filter((t) => t && typeof t === 'object')
    : [];
  return listaValida.map((tema) => {
    const catPrimaria = tema.categoria_primaria || 'Geopolitica_Radar';
    const categoria = MAPA_CATEGORIA_V2[catPrimaria] || 'geopolitica';
    const rotaEditoria = tema.rota_editoria || MAPA_ROTAS_EDITORIA[catPrimaria] || '/radar';
    const labelEditoria = MAPA_LABEL_EDITORIA[catPrimaria] || 'Radar';
    const titulo = tema.titulo_tema || tema.titulo_curto || '';
    const resumo = limparPrefixoGatilho(tema.gatilho_vitrine || tema.resumo_pulso || '');
    const impacto = tema.sintese_nerd || tema.impacto_pratico || resumo;
    const kws = Array.isArray(tema.palavras_chave_busca)
      ? tema.palavras_chave_busca
      : Array.isArray(tema.palavras_chave)
      ? tema.palavras_chave
      : [];

    const paisesDetectados =
      Array.isArray(tema.paises_envolvidos) && tema.paises_envolvidos.length > 0
        ? tema.paises_envolvidos
        : detectarPaisesNoTexto(`${titulo} ${resumo} ${impacto}`, kws);

    const score = Number(tema.urgencia_score || tema.relevancia_score || 80);
    const dataPub = parseTimestampIso(tema.data_publicacao || tema.publicado_em || tema.created_at || '');
    const updatedAt = parseTimestampIso(tema.updated_at || '') || dataPub;

    return {
      slug: tema.slug || '',
      titulo_curto: titulo,
      resumo_pulso: resumo,
      impacto_pratico: impacto,
      categoria,
      paises_envolvidos: paisesDetectados,
      urgencia_score: score,
      relevancia_score: score,
      veiculos_origem:
        Array.isArray(tema.veiculos_origem) && tema.veiculos_origem.length > 0
          ? tema.veiculos_origem
          : ['Curadoria IA · Pulso V2'],
      fontes_urls: Array.isArray(tema.fontes_urls) ? tema.fontes_urls : [],
      palavras_chave: kws,
      atualizado_em: carimboHora,
      data_publicacao: dataPub,
      updated_at: updatedAt,
      expires_at: tema.expires_at || null,
      _rota_editoria: rotaEditoria,
      _label_editoria: labelEditoria,
    };
  });
}

function mesclarNoticiasSnapshot(snap, carimboHora) {
  const deNoticias = Array.isArray(snap && snap.noticias_quentes)
    ? snap.noticias_quentes
        .filter((n) => n && typeof n === 'object')
        .map((n) => normalizarNoticiaQuenteBruta(n, carimboHora))
    : [];
  const deTemas = converterTemasParaNoticiasQuentes(
    Array.isArray(snap && snap.temas_ativos) ? snap.temas_ativos : [],
    (snap && snap.updatedAt) || '',
    carimboHora
  );

  const porChave = new Map();
  for (const item of [...deNoticias, ...deTemas]) {
    const chave = item.slug || normalizar(item.titulo_curto);
    if (!chave) continue;
    const prev = porChave.get(chave);
    if (!prev) {
      porChave.set(chave, item);
    } else if (compararRecenciaDesc(item, prev, 'urgencia_score') < 0) {
      porChave.set(chave, item);
    }
  }
  return Array.from(porChave.values());
}

function mesclarPulsoContinental(paisesEmAlta, extPulso) {
  if (!extPulso || !Array.isArray(extPulso.paises_ativos)) return paisesEmAlta;
  const existentes = new Set(paisesEmAlta.map((p) => p.a2));
  for (const cCode of extPulso.paises_ativos) {
    const a2 = String(cCode || '').toUpperCase().trim();
    if (a2 && !existentes.has(a2)) {
      existentes.add(a2);
      const meta = MAPA_PAIS_POR_A2[a2];
      paisesEmAlta.push({
        a2,
        countryName: meta ? meta.countryName : a2,
        title: `Cobertura ativa em ${meta ? meta.countryName : a2}`,
        source: 'Pulso Continental · RoM',
        category: 'Mundo',
        url: '/radar',
        summary: 'Novas manchetes registradas na região.',
        termoBusca: meta ? meta.countryName : a2,
        urgencia_score: 75,
        data_publicacao: '',
        updated_at: '',
      });
    }
  }
  return paisesEmAlta.sort((a, b) => compararRecenciaDesc(a, b, 'urgencia_score'));
}

export async function handleNoticiasQuentes(request, env = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const isRefresh = isRefreshRequest(request);

  const categoriaFiltro = normalizar(url.searchParams.get('categoria') || '');
  const paisFiltro = String(url.searchParams.get('pais') || '').toUpperCase().trim();
  const limiteParam = parseInt(url.searchParams.get('limite') || '15', 10);
  const limite = Number.isNaN(limiteParam) ? 15 : Math.min(50, Math.max(1, limiteParam));

  const backendUrl = resolverBackendUrl(env, request);

  try {
    if (backendUrl) {
      const params = new URLSearchParams({ limite: String(limite) });
      if (categoriaFiltro && categoriaFiltro !== 'todos') params.set('categoria', categoriaFiltro);
      if (paisFiltro) params.set('pais', paisFiltro);
      if (isRefresh) {
        params.set('refresh', '1');
        params.set('force', '1');
        params.set('_t', String(Date.now()));
      }

      const [resExt, resPulso] = await Promise.allSettled([
        consultarBackendExterno(backendUrl, 'v1/noticias-quentes', params, 9000),
        consultarBackendExterno(backendUrl, 'v1/atlas/pulso-continental', new URLSearchParams(), 5000),
      ]);

      const ext = resExt.status === 'fulfilled' ? resExt.value : null;
      const extPulso = resPulso.status === 'fulfilled' ? resPulso.value : null;

      if (ext && Array.isArray(ext.noticias_quentes) && ext.noticias_quentes.length > 0) {
        const refIso = ext.updatedAt || '';
        const carimbo = ext.atualizado_em || (refIso ? formatarHoraCurta(refIso) : '');
        let noticiasEnriquecidas = filtrarExpiradosComResguardo(
          ext.noticias_quentes.map((n) => normalizarNoticiaQuenteBruta(n, carimbo))
        );

        noticiasEnriquecidas.sort((a, b) => compararRecenciaDesc(a, b, 'urgencia_score'));

        let paisesEmAlta =
          Array.isArray(ext.paises_em_alta) && ext.paises_em_alta.length > 0
            ? ext.paises_em_alta
                .map((p) => ({
                  ...p,
                  data_publicacao: parseTimestampIso(p.data_publicacao || ''),
                  updated_at: parseTimestampIso(p.updated_at || '') || parseTimestampIso(p.data_publicacao || ''),
                }))
                .sort((a, b) => compararRecenciaDesc(a, b, 'urgencia_score'))
            : construirPaisesEmAlta(noticiasEnriquecidas);

        paisesEmAlta = mesclarPulsoContinental(paisesEmAlta, extPulso);

        const limpas = noticiasEnriquecidas
          .slice(0, limite)
          .map(({ _rota_editoria, _label_editoria, ...rest }) => rest);

        return json(
          {
            ok: true,
            cached: false,
            fallback: false,
            source: 'v2_api',
            identificacao_editorial: ext.identificacao_editorial || 'Síntese Rodando o Mundo',
            atualizado_em: carimbo,
            updatedAt: refIso,
            total: limpas.length,
            noticias_quentes: limpas,
            paises_em_alta: paisesEmAlta,
            eventos_principais: Array.isArray(ext.eventos_principais) ? ext.eventos_principais : [],
          },
          200,
          construirHeadersCache(isRefresh, false)
        );
      }

      // Tenta snapshot ao vivo no backend (/v1/estado/vitrine_ia) antes de cair para arquivo estático
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
        ((Array.isArray(estadoPayload.noticias_quentes) && estadoPayload.noticias_quentes.length > 0) ||
          (Array.isArray(estadoPayload.temas_ativos) && estadoPayload.temas_ativos.length > 0))
      ) {
        const refIso = estadoPayload.updatedAt || '';
        const carimbo = refIso ? formatarHoraCurta(refIso) : '';
        let noticiasEstado = filtrarExpiradosComResguardo(
          mesclarNoticiasSnapshot(estadoPayload, carimbo)
        );
        if (categoriaFiltro && categoriaFiltro !== 'todos') {
          noticiasEstado = noticiasEstado.filter(
            (n) => normalizar(n.categoria) === categoriaFiltro
          );
        }
        if (paisFiltro) {
          noticiasEstado = noticiasEstado.filter(
            (n) => Array.isArray(n.paises_envolvidos) && n.paises_envolvidos.includes(paisFiltro)
          );
        }
        noticiasEstado.sort((a, b) => compararRecenciaDesc(a, b, 'urgencia_score'));
        const paisesEmAlta = mesclarPulsoContinental(
          construirPaisesEmAlta(noticiasEstado),
          extPulso
        );
        const limpas = noticiasEstado
          .slice(0, limite)
          .map(({ _rota_editoria, _label_editoria, ...rest }) => rest);

        return json(
          {
            ok: true,
            cached: false,
            fallback: false,
            source: 'v2_api',
            identificacao_editorial: 'Síntese Rodando o Mundo',
            atualizado_em: carimbo,
            updatedAt: refIso,
            total: limpas.length,
            noticias_quentes: limpas,
            paises_em_alta: paisesEmAlta,
            eventos_principais: [],
          },
          200,
          construirHeadersCache(isRefresh, false)
        );
      }
    }

    const snap = await carregarSnapshotEstatico(request, env, isRefresh);
    const updatedAtIso = snap.updatedAt || '';
    const carimboHora = updatedAtIso ? formatarHoraCurta(updatedAtIso) : '';

    let noticiasInternas = filtrarExpiradosComResguardo(
      mesclarNoticiasSnapshot(snap, carimboHora)
    );

    if (categoriaFiltro && categoriaFiltro !== 'todos') {
      noticiasInternas = noticiasInternas.filter((n) => normalizar(n.categoria) === categoriaFiltro);
    }
    if (paisFiltro) {
      noticiasInternas = noticiasInternas.filter(
        (n) => Array.isArray(n.paises_envolvidos) && n.paises_envolvidos.includes(paisFiltro)
      );
    }

    noticiasInternas.sort((a, b) => compararRecenciaDesc(a, b, 'urgencia_score'));
    const paisesEmAlta = construirPaisesEmAlta(noticiasInternas);
    const noticiasFinais = noticiasInternas
      .slice(0, limite)
      .map(({ _rota_editoria, _label_editoria, ...rest }) => rest);

    return json(
      {
        ok: true,
        cached: false,
        fallback: true,
        source: 'vitrine_snapshot',
        identificacao_editorial: 'Síntese Rodando o Mundo',
        atualizado_em: carimboHora,
        updatedAt: updatedAtIso,
        total: noticiasFinais.length,
        noticias_quentes: noticiasFinais,
        paises_em_alta: paisesEmAlta,
        eventos_principais: [],
      },
      200,
      construirHeadersCache(isRefresh, true)
    );
  } catch {
    const fallbackIso = FALLBACK_SNAPSHOT.updatedAt;
    const carimboFallback = formatarHoraCurta(fallbackIso);
    let noticiasFallback = converterTemasParaNoticiasQuentes(
      FALLBACK_SNAPSHOT.temas_ativos,
      fallbackIso,
      carimboFallback
    );
    if (categoriaFiltro && categoriaFiltro !== 'todos') {
      noticiasFallback = noticiasFallback.filter((n) => normalizar(n.categoria) === categoriaFiltro);
    }
    if (paisFiltro) {
      noticiasFallback = noticiasFallback.filter(
        (n) => Array.isArray(n.paises_envolvidos) && n.paises_envolvidos.includes(paisFiltro)
      );
    }
    noticiasFallback.sort((a, b) => compararRecenciaDesc(a, b, 'urgencia_score'));
    const paisesFallback = construirPaisesEmAlta(noticiasFallback);
    const limpas = noticiasFallback
      .slice(0, limite)
      .map(({ _rota_editoria, _label_editoria, ...rest }) => rest);

    return json(
      {
        ok: true,
        cached: false,
        fallback: true,
        source: 'fallback_snapshot',
        identificacao_editorial: 'Síntese Rodando o Mundo',
        atualizado_em: carimboFallback,
        updatedAt: fallbackIso,
        total: limpas.length,
        noticias_quentes: limpas,
        paises_em_alta: paisesFallback,
        eventos_principais: [],
      },
      200,
      construirHeadersCache(isRefresh, true)
    );
  }
}

export async function onRequestGet(context) {
  return handleNoticiasQuentes(context.request, context.env || {});
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
