// Netlify Function: /api/ultimas-noticias
// Agrega as últimas notícias do Brasil divididas por macrorregiões e veículos
// com cache em memória (10 minutos) e fallback resiliente.
import { json, limparTermo } from '../lib/ia.mjs';

const CACHE_TTL_MS = 6 * 60 * 1000; // 6 minutos para frescor de notícias em tempo real
let cacheMemoria = null;
let cacheTimestamp = 0;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=120, stale-while-revalidate=60',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=180, stale-while-revalidate=60',
  'X-Content-Type-Options': 'nosniff',
  ...CORS_HEADERS,
};

const SEM_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  'X-Content-Type-Options': 'nosniff',
  ...CORS_HEADERS,
};

// Fontes categorizadas por macrorregião brasileira
const FONTES_BRASIL = [
  // MANCHETES DE ÚLTIMA HORA / BRASIL EM TEMPO REAL
  {
    nome: 'Destaques Nacionais (Google Notícias)',
    regiao: 'nacional',
    regiaoLabel: 'Nacional',
    estado: 'Brasil',
    url: 'https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419',
    tipo: 'google',
  },
  // NACIONAL / SUDESTE
  {
    nome: 'Agência Brasil',
    regiao: 'nacional',
    regiaoLabel: 'Nacional',
    estado: 'DF/Brasil',
    url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml',
    tipo: 'direto',
  },
  {
    nome: 'g1 Brasil',
    regiao: 'sudeste',
    regiaoLabel: 'Sudeste / Nacional',
    estado: 'SP/Brasil',
    url: 'https://g1.globo.com/rss/g1/',
    tipo: 'direto',
  },
  {
    nome: 'Folha de S.Paulo',
    regiao: 'sudeste',
    regiaoLabel: 'Sudeste',
    estado: 'SP',
    url: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml',
    tipo: 'direto',
  },
  {
    nome: 'Nexo Jornal',
    regiao: 'sudeste',
    regiaoLabel: 'Sudeste',
    estado: 'SP',
    url: 'https://www.nexojornal.com.br/rss.xml',
    tipo: 'direto',
  },
  {
    nome: 'CartaCapital',
    regiao: 'sudeste',
    regiaoLabel: 'Sudeste',
    estado: 'SP',
    url: 'https://www.cartacapital.com.br/feed/',
    tipo: 'direto',
  },

  // CENTRO-OESTE
  {
    nome: 'Metrópoles',
    regiao: 'centro-oeste',
    regiaoLabel: 'Centro-Oeste',
    estado: 'DF',
    url: 'https://www.metropoles.com/feed',
    tipo: 'direto',
  },
  {
    nome: 'Correio Braziliense',
    regiao: 'centro-oeste',
    regiaoLabel: 'Centro-Oeste',
    estado: 'DF',
    url: 'https://www.correiobraziliense.com.br/rss/noticia/brasil/rss.xml',
    tipo: 'direto',
  },

  // SUL
  {
    nome: 'Gazeta do Povo',
    regiao: 'sul',
    regiaoLabel: 'Sul',
    estado: 'PR',
    url: 'https://www.gazetadopovo.com.br/feed/rss/brasil.xml',
    tipo: 'direto',
  },
  {
    nome: 'Imprensa do Sul (RS/SC/PR)',
    regiao: 'sul',
    regiaoLabel: 'Sul',
    estado: 'RS/SC/PR',
    url: 'https://news.google.com/rss/search?q=(Paran%C3%A1+OR+%22Rio+Grande+do+Sul%22+OR+%22Santa+Catarina%22)+when:2d&hl=pt-BR&gl=BR&ceid=BR:pt-419',
    tipo: 'google',
  },

  // NORDESTE
  {
    nome: 'Imprensa do Nordeste',
    regiao: 'nordeste',
    regiaoLabel: 'Nordeste',
    estado: 'Nordeste',
    url: 'https://news.google.com/rss/search?q=(Bahia+OR+Pernambuco+OR+Cear%C3%A1+OR+Maranh%C3%A3o+OR+Para%C3%ADba)+when:2d&hl=pt-BR&gl=BR&ceid=BR:pt-419',
    tipo: 'google',
  },

  // NORTE
  {
    nome: 'Amazônia Real',
    regiao: 'norte',
    regiaoLabel: 'Norte',
    estado: 'AM/Amazônia',
    url: 'https://amazoniareal.com.br/feed/',
    tipo: 'direto',
  },
  {
    nome: 'Imprensa do Norte',
    regiao: 'norte',
    regiaoLabel: 'Norte',
    estado: 'Norte / Amazônia',
    url: 'https://news.google.com/rss/search?q=(Amazonas+OR+Par%C3%A1+OR+Manaus+OR+Bel%C3%A9m+OR+Rond%C3%B4nia)+when:2d&hl=pt-BR&gl=BR&ceid=BR:pt-419',
    tipo: 'google',
  },
];

function decodificarEntidades(s) {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCharCode(Number(dec)); } catch { return ''; }
    });
}

function limparHtml(s) {
  if (!s) return '';
  const semTags = s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1').replace(/<[^>]+>/g, ' ');
  return decodificarEntidades(semTags).replace(/\s+/g, ' ').trim();
}

function extrairTag(bloco, tag) {
  const mCdata = bloco.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>`, 'is'));
  if (mCdata && mCdata[1]) return mCdata[1].trim();
  const mNormal = bloco.match(new RegExp(`<${tag}[^>]*>(.*?)<\\/${tag}>`, 'is'));
  if (mNormal && mNormal[1]) return mNormal[1].trim();
  return '';
}

function extrairImagem(bloco) {
  // 1. Tag <enclosure url="..." type="image/...">
  const mEnc = bloco.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
  if (mEnc && mEnc[1]) return mEnc[1];

  // 2. Tag <media:content url="..."
  const mMed = bloco.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*>/i);
  if (mMed && mMed[1]) return mMed[1];

  // 3. Tag <media:thumbnail url="..."
  const mThumb = bloco.match(/<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*>/i);
  if (mThumb && mThumb[1]) return mThumb[1];

  // 4. Imagem dentro da description: <img src="..."
  const mImg = bloco.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (mImg && mImg[1]) return mImg[1];

  return '';
}

function calcularTempoRelativo(isoString) {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const agora = Date.now();
    const diffMin = Math.round((agora - d.getTime()) / (60 * 1000));
    if (diffMin < 2) return 'agora há pouco';
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffHoras = Math.round(diffMin / 60);
    if (diffHoras < 24) return `há ${diffHoras} ${diffHoras === 1 ? 'hora' : 'horas'}`;
    const diffDias = Math.round(diffHoras / 24);
    if (diffDias === 1) return 'ontem';
    if (diffDias < 7) return `há ${diffDias} dias`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

async function buscarFeedXml(fonte) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);

  try {
    const resp = await fetch(fonte.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 RodandoOMundo/2.9',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: ctrl.signal,
    });

    if (!resp.ok) return [];
    const xml = await resp.text();
    const itens = [];

    const rawItems = xml.match(/<item[\s>].*?<\/item>/gis) || [];
    for (let i = 0; i < Math.min(rawItems.length, 10); i++) {
      const bloco = rawItems[i];
      let titulo = limparHtml(extrairTag(bloco, 'title'));
      let link = extrairTag(bloco, 'link');

      // Se o link for uma tag vazia com href: <link href="..." />
      if (!link) {
        const mHref = bloco.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
        if (mHref) link = mHref[1];
      }
      link = limparHtml(link);

      const pubDate = extrairTag(bloco, 'pubDate') || extrairTag(bloco, 'dc:date');
      let dataIso = '';
      try {
        const parsedD = new Date(pubDate);
        if (!isNaN(parsedD.getTime())) dataIso = parsedD.toISOString();
      } catch {}

      let resumo = limparHtml(extrairTag(bloco, 'description'));
      const imagem = extrairImagem(bloco);

      // Determinar veículo real se for Google News RSS
      let nomeVeiculo = fonte.nome;
      if (fonte.tipo === 'google') {
        const partes = titulo.split(/\s+[-–—|]\s+/);
        if (partes.length > 1) {
          nomeVeiculo = partes.pop().trim();
          titulo = partes.join(' - ').trim();
        }
      }

      // Evita itens vazios ou sem título consistente
      if (titulo && titulo.length > 6 && link) {
        itens.push({
          id: Buffer.from(link || titulo).toString('base64').slice(0, 32),
          titulo,
          url: link,
          resumo: resumo && resumo.length > 15 ? resumo.slice(0, 220) + (resumo.length > 220 ? '…' : '') : '',
          imagem: imagem || '',
          fonte: nomeVeiculo,
          regiao: fonte.regiao,
          regiaoLabel: fonte.regiaoLabel,
          estado: fonte.estado,
          publicadoEm: dataIso || new Date().toISOString(),
          tempoRelativo: calcularTempoRelativo(dataIso || new Date()),
        });
      }
    }
    return itens;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Fallback resiliente caso todos os feeds falhem ou não haja conexão externa
function obterNoticiasFallback() {
  const agora = new Date().toISOString();
  return [
    {
      id: 'fb-1',
      titulo: 'Congresso e Planalto debatem pautas econômicas e prioridades orçamentárias da semana',
      url: 'https://agenciabrasil.ebc.com.br/politica',
      resumo: 'Líderes partidários na Câmara e no Senado realizam reuniões de alinhamento com a equipe econômica para destravar votações prioritárias.',
      imagem: '',
      fonte: 'Agência Brasil',
      regiao: 'nacional',
      regiaoLabel: 'Nacional',
      estado: 'DF/Brasil',
      publicadoEm: agora,
      tempoRelativo: 'há 30 min',
    },
    {
      id: 'fb-2',
      titulo: 'Inflação e taxa Selic: mercado financeiro ajusta projeções e impacto no consumo',
      url: 'https://www.folha.uol.com.br/mercado/',
      resumo: 'Boletim do mercado financeiro e analistas indicam tendências sobre inflação, taxas de juros e desempenho do comércio varejista.',
      imagem: '',
      fonte: 'Folha de S.Paulo',
      regiao: 'sudeste',
      regiaoLabel: 'Sudeste',
      estado: 'SP',
      publicadoEm: agora,
      tempoRelativo: 'há 1 hora',
    },
    {
      id: 'fb-3',
      titulo: 'Governos estaduais do Sul articulam ações conjuntas para defesa civil e infraestrutura',
      url: 'https://www.gazetadopovo.com.br/brasil/',
      resumo: 'Paraná, Santa Catarina e Rio Grande do Sul coordenam projetos de resiliência climática, reforço de diques e logística de transportes.',
      imagem: '',
      fonte: 'Gazeta do Povo',
      regiao: 'sul',
      regiaoLabel: 'Sul',
      estado: 'PR/Sul',
      publicadoEm: agora,
      tempoRelativo: 'há 2 horas',
    },
    {
      id: 'fb-4',
      titulo: 'Transição energética e polo de hidrogênio verde atraem novos investimentos no Nordeste',
      url: 'https://g1.globo.com/economia/',
      resumo: 'Complexos portuários e parques eólicos e solares do Ceará, Bahia e Pernambuco avançam em acordos de cooperação internacional.',
      imagem: '',
      fonte: 'Imprensa do Nordeste',
      regiao: 'nordeste',
      regiaoLabel: 'Nordeste',
      estado: 'Nordeste',
      publicadoEm: agora,
      tempoRelativo: 'há 3 horas',
    },
    {
      id: 'fb-5',
      titulo: 'Agronegócio e logística ferroviária impulsionam escoamento de safras no Centro-Oeste',
      url: 'https://www.metropoles.com/brasil',
      resumo: 'Produtores de Mato Grosso, Goiás e Mato Grosso do Sul registram produtividade em alta e avanços na malha ferroviária Centro-Norte.',
      imagem: '',
      fonte: 'Metrópoles',
      regiao: 'centro-oeste',
      regiaoLabel: 'Centro-Oeste',
      estado: 'DF/Centro-Oeste',
      publicadoEm: agora,
      tempoRelativo: 'há 4 horas',
    },
    {
      id: 'fb-6',
      titulo: 'Bioeconomia e monitoramento ambiental ganham protagonismo nas capitais da Amazônia',
      url: 'https://amazoniareal.com.br',
      resumo: 'Pesquisadores de instituições do Amazonas e Pará apresentam soluções inovadoras de bioeconomia sustentável e conservação florestal.',
      imagem: '',
      fonte: 'Amazônia Real',
      regiao: 'norte',
      regiaoLabel: 'Norte',
      estado: 'AM/Norte',
      publicadoEm: agora,
      tempoRelativo: 'há 5 horas',
    },
  ];
}

const STOPWORDS_BUSCA = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'o', 'a', 'os', 'as', 'para', 'com', 'por', 'e', 'se', 'um', 'uma', 'sobre', 'que', 'ao', 'aos']);

function normalizarTexto(str) {
  return String(str == null ? '' : str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function extrairTokensBusca(termo) {
  const norm = normalizarTexto(termo);
  if (!norm) return [];
  return norm
    .split(/[^a-z0-9]+/)
    .filter((tk) => tk.length >= 2);
}

function calcularRelevanciaUltimas(item, termoNorm, tokens) {
  const titNorm = normalizarTexto(item.titulo || '');
  const resNorm = normalizarTexto(item.resumo || '');
  const fonNorm = normalizarTexto(item.fonte || '');
  const estNorm = normalizarTexto(item.estado || '');
  const regNorm = normalizarTexto(item.regiaoLabel || '');
  const combo = `${titNorm} ${fonNorm} ${estNorm} ${regNorm} ${resNorm}`;

  let score = 0;

  // Frase exata
  if (termoNorm && titNorm.includes(termoNorm)) {
    score += 120;
  } else if (termoNorm && fonNorm.includes(termoNorm)) {
    score += 70;
  } else if (termoNorm && resNorm.includes(termoNorm)) {
    score += 45;
  } else if (termoNorm && combo.includes(termoNorm)) {
    score += 30;
  }

  // Tokens relevantes
  const relTokens = (tokens || []).filter((tk) => tk.length >= 2 && !STOPWORDS_BUSCA.has(tk));
  const tokensValidos = relTokens.length > 0 ? relTokens : tokens;

  if (tokensValidos.length > 0) {
    let matchesTit = 0;
    let matchesRes = 0;
    let matchesOutros = 0;

    for (const tk of tokensValidos) {
      if (titNorm.includes(tk)) matchesTit++;
      else if (fonNorm.includes(tk) || estNorm.includes(tk)) matchesOutros++;
      else if (resNorm.includes(tk)) matchesRes++;
    }

    if (matchesTit === tokensValidos.length) score += 80;
    else score += matchesTit * 25;

    if (matchesRes === tokensValidos.length) score += 25;
    else score += matchesRes * 8;

    score += matchesOutros * 15;
  }

  // Bônus de recência
  if (item.publicadoEm) {
    const ts = new Date(item.publicadoEm).getTime();
    if (!Number.isNaN(ts)) {
      const horasAtras = Math.max(0, (Date.now() - ts) / (3600 * 1000));
      if (horasAtras <= 3) score += 15;
      else if (horasAtras <= 12) score += 10;
      else if (horasAtras <= 24) score += 5;
    }
  }

  return score;
}

function itemCorrespondeBusca(item, termoNorm, tokens) {
  if (!termoNorm) return true;
  const titNorm = normalizarTexto(item.titulo || '');
  const resNorm = normalizarTexto(item.resumo || '');
  const fonNorm = normalizarTexto(item.fonte || '');
  const estNorm = normalizarTexto(item.estado || '');
  const regNorm = normalizarTexto(item.regiaoLabel || '');
  const combo = `${titNorm} ${fonNorm} ${estNorm} ${regNorm} ${resNorm}`;

  // Se a frase inteira consta no texto agregado
  if (combo.includes(termoNorm)) return true;

  const relTokens = (tokens || []).filter((tk) => tk.length >= 2 && !STOPWORDS_BUSCA.has(tk));
  const tokensValidos = relTokens.length > 0 ? relTokens : tokens;

  // Termos curtos de 1 palavra (ex: "lula", "stf", "pib", "g1")
  if (tokensValidos.length === 1 && tokensValidos[0].length <= 4) {
    return combo.includes(tokensValidos[0]);
  }

  let casados = 0;
  for (const tk of tokensValidos) {
    if (combo.includes(tk)) casados++;
  }

  if (casados === tokensValidos.length) return true;
  if (tokensValidos.length === 2) {
    return casados >= 1 && tokensValidos.some((tk) => tk.length >= 4 && combo.includes(tk));
  }
  if (tokensValidos.length >= 3) {
    return casados >= Math.max(2, Math.ceil(tokensValidos.length * 0.4));
  }

  return false;
}

export default async (req) => {
  if (req.method !== 'GET') {
    return json({ erro: 'metodo', mensagem: 'Apenas GET é aceito.' }, 405);
  }

  const u = new URL(req.url);
  const regiaoFiltro = (u.searchParams.get('regiao') || 'todas').toLowerCase().trim();
  const termoBusca = limparTermo(u.searchParams.get('q') || '').toLowerCase().trim();
  const forcarAtualizacao = u.searchParams.has('refresh') || u.searchParams.get('force') === '1';

  if (forcarAtualizacao) {
    cacheMemoria = null;
    cacheTimestamp = 0;
  }

  const agora = Date.now();
  let todasNoticias = [];

  // Se cache em memória for válido e não forçado refresh
  if (!forcarAtualizacao && cacheMemoria && agora - cacheTimestamp < CACHE_TTL_MS) {
    todasNoticias = cacheMemoria;
  } else {
    // Buscar em paralelo todos os feeds com limite de espera
    const promessas = FONTES_BRASIL.map((fonte) => buscarFeedXml(fonte));
    const resultados = await Promise.allSettled(promessas);

    const agregadas = [];
    const titulosVistos = new Set();

    resultados.forEach((res) => {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        res.value.forEach((item) => {
          const chaveTitulo = item.titulo.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 45);
          if (chaveTitulo && !titulosVistos.has(chaveTitulo)) {
            titulosVistos.add(chaveTitulo);
            agregadas.push(item);
          }
        });
      }
    });

    if (agregadas.length >= 3) {
      // Ordenar por data (mais recentes primeiro)
      agregadas.sort((a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm));
      cacheMemoria = agregadas;
      cacheTimestamp = agora;
      todasNoticias = agregadas;
    } else if (cacheMemoria && cacheMemoria.length) {
      todasNoticias = cacheMemoria;
    } else {
      todasNoticias = obterNoticiasFallback();
    }
  }

  // Filtragem opcional por região
  let filtradas = todasNoticias;
  if (regiaoFiltro && regiaoFiltro !== 'todas') {
    filtradas = filtradas.filter((item) => {
      if (regiaoFiltro === 'nacional') return item.regiao === 'nacional';
      if (regiaoFiltro === 'sudeste') return item.regiao === 'sudeste' || item.regiao === 'nacional';
      return item.regiao === regiaoFiltro;
    });
  }

  // Filtragem e ordenação por precisão e relevância caso haja termo de busca
  if (termoBusca && termoBusca.length >= 2) {
    const termoNorm = normalizarTexto(termoBusca);
    const tokens = extrairTokensBusca(termoBusca);

    // 1. Filtrar itens que correspondem estritamente à busca (todos os tokens presentes)
    let correspondentes = filtradas.filter((item) => itemCorrespondeBusca(item, termoNorm, tokens));

    // 2. Fallback inteligente: se não encontrou nada com todos os tokens juntos (AND),
    // buscar notícias que casem com pelo menos um dos tokens principais
    if (correspondentes.length === 0 && tokens.length > 1) {
      const relTokens = tokens.filter((tk) => !STOPWORDS_BUSCA.has(tk));
      if (relTokens.length > 0) {
        correspondentes = filtradas.filter((item) => {
          const combo = normalizarTexto(`${item.titulo} ${item.fonte} ${item.estado} ${item.regiaoLabel} ${item.resumo || ''}`);
          return relTokens.some((tk) => combo.includes(tk));
        });
      }
    }

    // 3. Ordenar por score de relevância decrescente (com desempate por data)
    filtradas = correspondentes
      .map((item) => ({ item, score: calcularRelevanciaUltimas(item, termoNorm, tokens) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.item.publicadoEm) - new Date(a.item.publicadoEm);
      })
      .map((entry) => entry.item);
  }

  return json(
    {
      ok: true,
      total: filtradas.length,
      totalGeral: todasNoticias.length,
      atualizadoEm: new Date(cacheTimestamp || agora).toISOString(),
      regiaoSelecionada: regiaoFiltro,
      termoBusca,
      noticias: filtradas,
    },
    200,
    forcarAtualizacao ? SEM_CACHE : CACHE_HEADERS
  );
};

export const config = {
  path: '/api/ultimas-noticias',
  method: ['GET'],
};
