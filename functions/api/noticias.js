// Cloudflare Pages Function: /api/noticias
// Agrega manchetes de edições nacionais da Currents News API.
import { json } from '../lib/ia.js';
import {
  isRefreshRequest,
  newsResponseHeaders,
  parseTimestampIso,
  compareIsoDesc,
} from '../lib/rss.js';

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

const CORS_ORIGIN = { 'Access-Control-Allow-Origin': '*' };
const CACHE_1H = newsResponseHeaders({ isRefresh: false, isFallback: false, corsHeaders: CORS_ORIGIN });
const SEM_CACHE = newsResponseHeaders({ isRefresh: true, isFallback: true, corsHeaders: CORS_ORIGIN });

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
  return parseTimestampIso(valor);
}

function nomeDaFonte(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\d*\./, '').replace(/^m\./, '');
  } catch {
    return '';
  }
}

async function buscarEdicao(edicao, apiKey, isRefresh = false) {
  const url = new URL(API_URL);
  url.searchParams.set('country', edicao.country);
  url.searchParams.set('language', edicao.language);
  url.searchParams.set('page_size', '10');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const resposta = await fetch(url.toString(), {
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        Accept: 'application/json',
        ...(isRefresh ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : {}),
      },
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

export async function onRequestGet(context) {
  const isRefresh = isRefreshRequest(context.request);
  const apiKey = context.env && context.env.CURRENTS_API_KEY;
  if (!apiKey) {
    return json({
      erro: 'configuracao',
      mensagem: 'A fonte de notícias ainda não foi configurada (CURRENTS_API_KEY ausente).',
      fallback: true,
      artigos: [],
    }, 503, SEM_CACHE);
  }

  const resultados = await Promise.all(EDICOES.map((edicao) => buscarEdicao(edicao, apiKey, isRefresh)));
  const respostasValidas = resultados.filter((resultado) => resultado.ok);
  if (!respostasValidas.length) {
    return json({
      erro: 'fonte_indisponivel',
      mensagem: 'Não foi possível atualizar as notícias agora.',
      fallback: true,
      artigos: [],
      atualizadoEm: new Date().toISOString(),
      edicoes: 0,
    }, isRefresh ? 200 : 502, SEM_CACHE);
  }

  const unicos = new Map();
  respostasValidas.flatMap((resultado) => resultado.artigos).forEach((artigo) => {
    const anterior = unicos.get(artigo.url);
    if (!anterior || compareIsoDesc(artigo.publicadoEm, anterior.publicadoEm) < 0) {
      unicos.set(artigo.url, artigo);
    }
  });
  const artigos = [...unicos.values()]
    .sort((a, b) => compareIsoDesc(a.publicadoEm, b.publicadoEm))
    .slice(0, 32);

  const isFallback = artigos.length === 0;
  return json({
    artigos,
    fallback: isFallback,
    atualizadoEm: new Date().toISOString(),
    edicoes: respostasValidas.length,
  }, 200, isRefresh || isFallback ? SEM_CACHE : CACHE_1H);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept'
    }
  });
}
