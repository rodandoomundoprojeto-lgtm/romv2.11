// GET /api/noticias
// Agrega manchetes de edições nacionais da Currents News API.
import { json } from '../lib/ia.mjs';

const API_URL = 'https://api.currentsapi.services/v1/latest-news';
const EDICOES = [
  { country: 'BR', language: 'pt', name: 'Brasil' },
  { country: 'US', language: 'en', name: 'Estados Unidos' },
  { country: 'GB', language: 'en', name: 'Reino Unido' },
  { country: 'MX', language: 'es', name: 'México' },
  { country: 'IN', language: 'en', name: 'Índia' },
  { country: 'JP', language: 'ja', name: 'Japão' },
  { country: 'ZA', language: 'en', name: 'África do Sul' },
  { country: 'AU', language: 'en', name: 'Austrália' },
];

// O plano gratuito aceita até 250 chamadas/dia. Uma chamada por edição por hora
// usa nominalmente 192 chamadas/dia; o cache reduz chamadas em acessos repetidos.
const CACHE_1H = {
  'Cache-Control': 'public, max-age=600, stale-while-revalidate=60',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=3600, stale-while-revalidate=60',
  'X-Content-Type-Options': 'nosniff',
};
const SEM_CACHE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function texto(valor, limite) {
  return String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim().slice(0, limite);
}

function urlHttps(valor) {
  try {
    const u = new URL(String(valor || ''));
    if (u.protocol !== 'https:' || u.username || u.password) return '';
    return u.href;
  } catch {
    return '';
  }
}

function dataValida(valor) {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '' : data.toISOString();
}

function nomeDaFonte(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\d*\./, '').replace(/^m\./, '');
  } catch {
    return '';
  }
}

async function buscarEdicao(edicao, apiKey) {
  const url = new URL(API_URL);
  url.searchParams.set('country', edicao.country);
  url.searchParams.set('language', edicao.language);
  url.searchParams.set('page_size', '10');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const resposta = await fetch(url, {
      headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!resposta.ok) return { ok: false, artigos: [] };
    const dados = await resposta.json();
    const noticias = Array.isArray(dados.news) ? dados.news : [];
    return {
      ok: true,
      artigos: noticias.map((noticia) => {
        const link = urlHttps(noticia.url);
        return {
          titulo: texto(noticia.title, 260),
          fonte: nomeDaFonte(link),
          url: link,
          imagem: urlHttps(noticia.image),
          publicadoEm: dataValida(noticia.published),
          pais: edicao.name,
          codigoPais: edicao.country.toLowerCase(),
        };
      }).filter((artigo) => artigo.titulo && artigo.fonte && artigo.url && artigo.imagem),
    };
  } catch {
    return { ok: false, artigos: [] };
  } finally {
    clearTimeout(timeout);
  }
}

export default async (req) => {
  if (req.method !== 'GET') return json({ erro: 'metodo' }, 405, SEM_CACHE);

  const apiKey = process.env.CURRENTS_API_KEY;
  if (!apiKey) {
    return json({
      erro: 'configuracao',
      mensagem: 'A fonte de notícias ainda não foi configurada.',
      artigos: [],
    }, 503, SEM_CACHE);
  }

  const resultados = await Promise.all(EDICOES.map((edicao) => buscarEdicao(edicao, apiKey)));
  const respostasValidas = resultados.filter((resultado) => resultado.ok);
  if (!respostasValidas.length) {
    return json({
      erro: 'fonte_indisponivel',
      mensagem: 'Não foi possível atualizar as notícias agora.',
      artigos: [],
    }, 502, SEM_CACHE);
  }

  const unicos = new Map();
  respostasValidas.flatMap((resultado) => resultado.artigos).forEach((artigo) => {
    const anterior = unicos.get(artigo.url);
    if (!anterior || (artigo.publicadoEm && artigo.publicadoEm > anterior.publicadoEm)) {
      unicos.set(artigo.url, artigo);
    }
  });
  const artigos = [...unicos.values()]
    .sort((a, b) => (b.publicadoEm || '').localeCompare(a.publicadoEm || ''))
    .slice(0, 32);

  return json({
    artigos,
    atualizadoEm: new Date().toISOString(),
    edicoes: respostasValidas.length,
  }, 200, CACHE_1H);
};

export const config = {
  path: '/api/noticias',
  method: 'GET',
};
