// GET /api/pesquisa?q=termo&lang=pt&period=all&topic=politica
// Pesquisa em tempo real com um modelo da Perplexity (busca na web) via Netlify AI Gateway.
import { IDIOMAS, MAX_TERMO, limparTermo, json, chat, extrairJSON, chaveURL, dominio } from '../lib/ia.mjs';

const MODELO = process.env.MODELO_PESQUISA || 'perplexity/sonar-pro';
const SEM_CACHE = { 'Cache-Control': 'no-store' };
const CACHE_15MIN = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=900',
  'Netlify-Vary': 'query=q|lang|period|topic',
};

function hojeISO() { return new Date().toISOString().slice(0, 10); }

function prompt(idioma, periodo, topico) {
  const instrucaoPeriodo = periodo === 'all'
    ? 'Abranja todo o período relevante (matérias recentes E histórico/contexto estrutural, trazendo ampla variedade de veículos).'
    : 'Prefira matérias dos últimos 30 dias, priorizando fatos recentes e verificáveis.';
  const instrucaoTopico = topico
    ? `Priorize o recorte temático de "${topico}" ao selecionar notícias e sugestões de pesquisa.`
    : 'Traga variedade temática cobrindo política, economia, tecnologia, sociedade e geopolítica.';

  return [
    'Você é um assistente de pesquisa jornalística estritamente neutro e factual.',
    'Hoje é ' + hojeISO() + '.',
    '',
    'REGRAS OBRIGATÓRIAS',
    '1. ESCOPO DO SITE: Política, geopolítica, economia, relações internacionais, tecnologia, saúde, cultura, esportes e notícias do mundo.',
    '   Se o termo for claramente fora desse escopo (ex.: receitas culinárias, dietas/emagrecimento pessoal, fofocas de celebridades, código de programação, lição de matemática/física, diagnósticos médicos pessoais):',
    '   NÃO responda sobre o tema e NÃO devolva erro técnico. Devolva IMEDIATAMENTE o JSON:',
    '   {"fora_do_escopo": true, "mensagem": "Não sou uma IA treinada nem interessada nesse assunto. O foco do Rodando o Mundo é política, geopolítica e economia internacional.", "sugestoes": ["sugestão geopolítica/econômica 1", "sugestão 2", "sugestão 3"]}',
    '2. Não opine, não julgue, não use adjetivos valorativos e não tome partido. Apenas relate o que as fontes dizem, atribuindo cada informação ("segundo o veículo X").',
    '3. Use somente informações das páginas que você realmente consultou na busca. Nunca invente notícias, citações, datas, veículos ou links. Cada "url" deve ser exatamente o endereço de uma página consultada.',
    '4. Identifique o tipo de entidade pesquisada em "tipo_entidade": "lugar" (se for país, cidade ou região), "pessoa" (se for pessoa pública, líder, governante) ou "tema" (outros temas jornalísticos).',
    '5. Se for PESSOA: informe "pessoa": {"nome": "Nome Completo", "foto_url": "URL confiável de foto em domínio público Wikimedia ou do veículo", "foto_credito": "Crédito da foto"}. Se não houver foto confiável, deixe foto_url vazio "".',
    '6. Em "noticias": classifique cada notícia em um dos tópicos: "politica", "economia", "esportes", "tecnologia", "saude", "cultura" ou "mundo". Indique também "pais" se aplicável. Diversifique os veículos de imprensa.',
    '7. Citações: apenas frases literais entre aspas na fonte. Podem ser da pessoa ("da_pessoa") ou sobre ela ("sobre"). Indique "idioma": "es"|"en"|"pt"|"fr"|etc., "texto" e "texto_original".',
    '8. ' + instrucaoPeriodo + ' ' + instrucaoTopico + ' Escreva TODO o texto em ' + idioma + '.',
    '9. Se o termo tiver erro de digitação, devolva a grafia correta em "termo_corrigido". Se não encontrar nada verificável, devolva "encontrado": false.',
    '10. O resumo deve ter de 4 a 6 frases densas e informativas sobre quem é/o que é e o contexto atual. Inclua também "sugestoes": 5 sugestões ricas de pesquisas relacionadas ao tema/tópico.',
    '',
    'Responda APENAS com JSON válido:',
    '{"fora_do_escopo":false,"tipo_entidade":"lugar|pessoa|tema","termo_corrigido":"","encontrado":true,"resumo":"","sugestoes":["","","","",""],"pessoa":{"nome":"","foto_url":"","foto_credito":""},"noticias":[{"titulo":"","veiculo":"","topico":"politica","pais":"","data":"AAAA-MM-DD","url":""}],"citacoes":[{"texto":"","texto_original":"","idioma":"pt","autor":"","tipo":"da_pessoa","onde":"","data":"AAAA-MM-DD","url":"","traduzida":false}]}',
    'Traga até 16 notícias variadas e até 8 citações.',
  ].join('\n');
}

function coletarFontes(resp) {
  const lista = [];
  const add = (url, titulo, data) => { if (url && /^https?:\/\//.test(url)) lista.push({ url, titulo: titulo || '', data: data || '' }); };
  (resp.search_results || []).forEach((s) => add(s.url, s.title, s.date || s.last_updated));
  (resp.citations || []).forEach((c) => (typeof c === 'string' ? add(c) : add(c && c.url, c && c.title)));
  const msg = (resp.choices && resp.choices[0] && resp.choices[0].message) || {};
  (msg.annotations || []).forEach((a) => { const c = a && (a.url_citation || a); add(c.url, c.title); });
  (msg.citations || []).forEach((c) => (typeof c === 'string' ? add(c) : add(c && c.url, c && c.title)));
  const vistos = new Map();
  lista.forEach((f) => {
    const k = chaveURL(f.url);
    if (!k) return;
    const atual = vistos.get(k);
    if (!atual) vistos.set(k, { ...f, dominio: dominio(f.url) });
    else { if (!atual.titulo && f.titulo) atual.titulo = f.titulo; if (!atual.data && f.data) atual.data = f.data; }
  });
  return vistos;
}

function texto(v, max) { return String(v == null ? '' : v).replace(/\s*\[\d+(?:[,\s]*\d+)*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); }
function dataISO(v) { const m = String(v || '').match(/\d{4}-\d{2}-\d{2}/); return m ? m[0] : ''; }

function montar(dados, fontes, termoOriginal) {
  if (dados && dados.fora_do_escopo) {
    return {
      termo: termoOriginal,
      fora_do_escopo: true,
      mensagem: texto(dados.mensagem, 500) || 'Não sou uma IA treinada nem interessada nesse assunto — nosso foco aqui é política, geopolítica e economia internacional.',
      sugestoes: Array.isArray(dados.sugestoes) ? dados.sugestoes.map((s) => texto(s, 100)).slice(0, 5) : [],
      encontrado: false,
    };
  }
  const ok = (u) => { const k = chaveURL(u); return k && fontes.has(k) ? fontes.get(k).url : null; };
  const noticias = (Array.isArray(dados.noticias) ? dados.noticias : [])
    .map((n) => ({
      titulo: texto(n.titulo, 220),
      veiculo: texto(n.veiculo, 80),
      topico: texto(n.topico, 30) || 'politica',
      pais: texto(n.pais, 50),
      data: dataISO(n.data),
      url: ok(n.url),
    }))
    .filter((n) => n.url && n.titulo)
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    .slice(0, 16);
  const citacoes = (Array.isArray(dados.citacoes) ? dados.citacoes : [])
    .map((c) => ({
      texto: texto(c.texto, 500).replace(/^["“”«»']+|["“”«»']+$/g, ''),
      texto_original: texto(c.texto_original || c.texto, 500).replace(/^["“”«»']+|["“”«»']+$/g, ''),
      idioma: texto(c.idioma, 10) || 'pt',
      autor: texto(c.autor, 100),
      tipo: c.tipo === 'sobre' ? 'sobre' : 'da_pessoa',
      onde: texto(c.onde, 120),
      data: dataISO(c.data),
      url: ok(c.url),
      traduzida: !!c.traduzida,
    }))
    .filter((c) => c.url && c.texto && c.autor)
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    .slice(0, 8);
  const resumo = texto(dados.resumo, 1500);
  const sugestoes = Array.isArray(dados.sugestoes)
    ? dados.sugestoes.map((s) => texto(s, 100)).filter(Boolean).slice(0, 6)
    : [];
  const lista = [...fontes.values()].map((f) => ({
    url: f.url,
    titulo: texto(f.titulo, 200),
    dominio: f.dominio,
    data: dataISO(f.data),
  }));
  const pessoa = dados.pessoa && (dados.pessoa.foto_url || dados.pessoa.nome) ? {
    nome: texto(dados.pessoa.nome, 100),
    foto_url: dados.pessoa.foto_url ? String(dados.pessoa.foto_url) : '',
    foto_credito: texto(dados.pessoa.foto_credito, 100),
  } : null;

  const encontrado = dados.encontrado !== false && (lista.length > 0 || noticias.length > 0) && (!!resumo || noticias.length > 0);
  return {
    termo: termoOriginal,
    tipo_entidade: texto(dados.tipo_entidade, 20) || 'tema',
    termo_corrigido: texto(dados.termo_corrigido, MAX_TERMO) || termoOriginal,
    encontrado,
    resumo: encontrado ? resumo : '',
    sugestoes: encontrado ? sugestoes : [],
    pessoa: encontrado ? pessoa : null,
    noticias: encontrado ? noticias : [],
    citacoes: encontrado ? citacoes : [],
    fontes: encontrado ? lista : [],
    gerado_em: new Date().toISOString(),
    modelo: MODELO,
  };
}

export default async (req) => {
  if (req.method !== 'GET') return json({ erro: 'metodo', mensagem: 'Use GET.' }, 405, SEM_CACHE);
  const u = new URL(req.url);
  const bruto = u.searchParams.get('q') || '';
  if (bruto.length > MAX_TERMO * 2) return json({ erro: 'longo', mensagem: 'Use até ' + MAX_TERMO + ' caracteres.' }, 400, SEM_CACHE);
  const q = limparTermo(bruto);
  const lang = IDIOMAS[u.searchParams.get('lang')] ? u.searchParams.get('lang') : 'pt';
  const period = u.searchParams.get('period') || 'all';
  const topic = limparTermo(u.searchParams.get('topic') || '');
  if (q.length < 2) return json({ erro: 'vazio', mensagem: 'Digite um termo para pesquisar.' }, 400, SEM_CACHE);

  try {
    const resp = await chat({
      model: MODELO,
      temperature: 0.1,
      max_tokens: 3200,
      messages: [
        { role: 'system', content: prompt(IDIOMAS[lang], period, topic) },
        { role: 'user', content: 'Termo pesquisado: "' + q + '"' + (topic ? ' (Tópico em foco: ' + topic + ')' : '') },
      ],
    });
    const conteudo = resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content;
    const dados = extrairJSON(conteudo) || { encontrado: false };
    const fontes = coletarFontes(resp || {});
    const resultado = montar(dados, fontes, q);
    resultado.lang = lang;
    resultado.period = period;
    return json(resultado, 200, CACHE_15MIN);
  } catch (err) {
    console.error('[pesquisa]', err && err.code, err && err.message);
    if (err.code === 'limite') return json({ erro: 'limite', mensagem: 'Muitas pesquisas em pouco tempo.' }, 429, SEM_CACHE);
    if (err.code === 'tempo') return json({ erro: 'tempo', mensagem: 'A pesquisa demorou demais.' }, 504, SEM_CACHE);
    if (err.code === 'sem_gateway') return json({ erro: 'sem_gateway', mensagem: 'AI Gateway não configurado.' }, 503, SEM_CACHE);
    return json({ erro: 'falha', mensagem: 'Não foi possível concluir a pesquisa.' }, 502, SEM_CACHE);
  }
};

export const config = {
  path: '/api/pesquisa',
  method: 'GET',
  rateLimit: { windowLimit: 8, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};