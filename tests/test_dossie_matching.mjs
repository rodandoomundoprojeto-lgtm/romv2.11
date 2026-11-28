import fs from 'fs';
import assert from 'assert';

const feed = JSON.parse(fs.readFileSync('data/feed_output.json', 'utf8'));

function norm(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const STOPWORDS_FALLBACK = {
  'de': 1, 'do': 1, 'da': 1, 'dos': 1, 'das': 1, 'em': 1, 'no': 1, 'na': 1, 'nos': 1, 'nas': 1,
  'para': 1, 'por': 1, 'com': 1, 'sem': 1, 'sob': 1, 'sobre': 1, 'que': 1, 'uma': 1, 'um': 1,
  'uns': 1, 'umas': 1, 'seu': 1, 'sua': 1, 'seus': 1, 'suas': 1, 'este': 1, 'esta': 1, 'esse': 1,
  'essa': 1, 'aquele': 1, 'aquela': 1, 'the': 1, 'of': 1, 'and': 1, 'in': 1, 'to': 1, 'a': 1,
  'is': 1, 'for': 1, 'on': 1, 'with': 1, 'as': 1, 'by': 1, 'at': 1, 'deste': 1, 'desta': 1,
  'ai': 1
};

const GENERIC_TOKENS = {
  'adocao': 1, 'implementacao': 1, 'cupula': 1, 'seguranca': 1, 'acordo': 1, 'marco': 1,
  'fase': 1, 'ordem': 1, 'plano': 1, 'sistema': 1, 'ato': 1, 'lei': 1, 'final': 1,
  'primeiro': 1, 'segundo': 1, 'global': 1, 'nacional': 1, 'internacional': 1
};

const AI_CONTEXT_RE = /(artificial|\bia\b|algoritmo|algoritmos|modelo|modelos|genai|generativa|llm|chatgpt|openai|gemini|claude|deepseek|machine learning|deep learning|computacao|roboti|tech|tecnologia|software|dados|rede neural)/i;
const TECH_REG_RE = /(\bia\b|artificial|algoritmo|big tech|plataforma|digital|dados|privacidade|software|internet|rede social|tecnologia|tech|direito autoral)/i;

function matchLocalFeed(rawQ, isAiDossie, kws = []) {
  const scored = [];
  feed.forEach(it => {
    const text = norm((it.titulo || '') + ' ' + (it.resumo || '') + ' ' + (it.analise || ''));
    if (!text) return;
    if (isAiDossie && text.indexOf('inteligencia') !== -1 && !AI_CONTEXT_RE.test(text)) {
      return; // Rejeita inteligência militar/espionagem
    }
    let score = 0;
    if (rawQ) {
      const qNorm = norm(rawQ);
      if (text.indexOf(qNorm) !== -1) {
        score += 40;
      } else {
        const hasAiAct = /ai\s+act/i.test(qNorm);
        if (hasAiAct) {
          if (/ai\s+act/i.test(text) || ((/\bia\b/i.test(text) || text.indexOf('inteligencia artificial') !== -1) && /\b(regulacao|lei|marco|act)\b/i.test(text))) {
            score += 30;
          }
        } else {
          const rawTokens = qNorm.split(/\s+/).filter(Boolean);
          const meaningful = rawTokens.filter(t => t.length >= 3 && !STOPWORDS_FALLBACK[t] && !GENERIC_TOKENS[t]);
          if (meaningful.length >= 2) {
            let matches = 0;
            meaningful.forEach(tk => {
              const rx = new RegExp('\\b' + tk + '\\b', 'i');
              if (rx.test(text)) matches++;
            });
            const ratio = matches / meaningful.length;
            if (ratio >= 0.75) {
              score += Math.round(ratio * 25);
            }
          }
        }
      }
    } else {
      kws.forEach(k => {
        const nk = norm(k);
        if (!nk) return;
        if (nk === 'inteligencia artificial') {
          if (text.indexOf('inteligencia artificial') !== -1) score += 20;
        } else if (nk === 'ia' || nk === 'llm') {
          if (new RegExp('\\b' + nk + '\\b', 'i').test(text) && AI_CONTEXT_RE.test(text)) score += 12;
        } else if (nk === 'regulacao de ia') {
          if (text.indexOf('regulacao') !== -1 && TECH_REG_RE.test(text)) score += 16;
        } else if (text.indexOf(nk) !== -1) {
          score += 15;
        }
      });
    }
    if (score >= 20) {
      scored.push({ titulo: it.titulo, score });
    }
  });
  return scored;
}

// Teste 1: Marco "Adoção do AI Act da UE"
const resMarco = matchLocalFeed('Adoção do AI Act da UE', true);
console.log('Resultados para Adoção do AI Act da UE:', resMarco.length);
assert.strictEqual(resMarco.length, 0, 'Não deve encontrar artigos de guerra/bets para Adoção do AI Act da UE');

// Teste 2: Carga genérica do dossiê de IA
const resGenerico = matchLocalFeed('', true, ['inteligência artificial', 'regulação de ia']);
console.log('Resultados para Dossiê de IA genérico:', resGenerico.length);
const falsos = resGenerico.filter(r => /zelensky|bets|coreia do norte/i.test(r.titulo));
assert.strictEqual(falsos.length, 0, 'Dossiê genérico não pode incluir Zelensky, Bets ou Coreia do Norte');

console.log('TODOS OS TESTES DE VALIDAÇÃO PASSARAM COM SUCESSO!');
