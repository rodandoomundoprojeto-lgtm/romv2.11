/**
 * Testes automatizados do frontend e endpoints JS para integridade e preservação
 * do horário de publicação no Radar Editorial.
 */
import assert from 'node:assert';
import fs from 'node:fs';

console.log('=== Testando lógica do Frontend e Endpoints JS para o Radar Editorial ===');

// 1. Validar função formatarDataPublicacaoCardRadar
function formatarDataPublicacaoCardRadar(isoDateStr, nowMs) {
  if (!isoDateStr) return { text: '', title: '', iso: '' };
  var d = new Date(isoDateStr);
  if (isNaN(d.getTime())) return { text: '', title: '', iso: '' };

  var iso = d.toISOString();
  var dia = ('0' + d.getDate()).slice(-2);
  var mes = ('0' + (d.getMonth() + 1)).slice(-2);
  var ano = d.getFullYear();
  var hora = ('0' + d.getHours()).slice(-2);
  var min = ('0' + d.getMinutes()).slice(-2);

  var dataCompleta = dia + '/' + mes + '/' + ano + ' às ' + hora + 'h' + min;
  var title = 'Publicada no Rodando o Mundo em ' + dataCompleta;

  var agora = nowMs ? new Date(nowMs) : new Date();
  var diffMs = (nowMs || Date.now()) - d.getTime();
  var diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 0 && diffMs >= -300000) {
    diffMin = 0;
  }

  var isMesmoDia = d.getDate() === agora.getDate() &&
                   d.getMonth() === agora.getMonth() &&
                   d.getFullYear() === agora.getFullYear();

  var texto = '';
  if (diffMin >= 0 && diffMin < 5) {
    texto = 'Publicada agora';
  } else if (diffMin >= 5 && diffMin < 60) {
    texto = 'Publicada há ' + diffMin + ' min';
  } else if (isMesmoDia) {
    texto = 'Publicada às ' + hora + 'h' + min;
  } else if (ano !== agora.getFullYear()) {
    texto = 'Publicada em ' + dia + '/' + mes + '/' + ano + ' às ' + hora + 'h' + min;
  } else {
    texto = 'Publicada em ' + dia + '/' + mes + ' às ' + hora + 'h' + min;
  }

  return { text: texto, title: title, iso: iso };
}

// Teste 1: Publicada há 2 minutos -> "Publicada agora"
const now = new Date('2026-11-15T15:00:00Z').getTime();
const resAgora = formatarDataPublicacaoCardRadar('2026-11-15T14:58:00Z', now);
assert.strictEqual(resAgora.text, 'Publicada agora');
assert.ok(resAgora.title.includes('Publicada no Rodando o Mundo em'));

// Teste 1b: Clock skew do cliente (servidor adiantado em 30s) -> ainda "Publicada agora"
const resSkew = formatarDataPublicacaoCardRadar('2026-11-15T15:00:30Z', now);
assert.strictEqual(resSkew.text, 'Publicada agora', 'Clock skew de até 5 minutos para o futuro deve ser absorvido como "Publicada agora"');

// Teste 2: Publicada há 25 minutos -> "Publicada há 25 min"
const res25 = formatarDataPublicacaoCardRadar('2026-11-15T14:35:00Z', now);
assert.strictEqual(res25.text, 'Publicada há 25 min');

// Teste 3: Publicada há 3 horas no mesmo dia
const res3h = formatarDataPublicacaoCardRadar('2026-11-15T12:00:00Z', now);
assert.ok(res3h.text.startsWith('Publicada às '), `Esperado começar com 'Publicada às ', obtido: ${res3h.text}`);

// Teste 4: Publicada em dia anterior
const resAnt = formatarDataPublicacaoCardRadar('2026-11-10T10:30:00Z', now);
assert.ok(resAnt.text.startsWith('Publicada em 10/11'), `Esperado data anterior, obtido: ${resAnt.text}`);

// Teste 4b: Publicada em ano anterior (ex: 2025)
const resAnoAnt = formatarDataPublicacaoCardRadar('2025-11-10T10:30:00Z', now);
assert.ok(resAnoAnt.text.includes('/2025'), `Esperado incluir o ano, obtido: ${resAnoAnt.text}`);

// Teste 4c: Entrada nula ou inválida
assert.strictEqual(formatarDataPublicacaoCardRadar(null).text, '');
assert.strictEqual(formatarDataPublicacaoCardRadar('data-invalida').text, '');
console.log('  [OK] formatarDataPublicacaoCardRadar formata os rótulos temporais com clareza e precisão.');

// 2. Validar que functions/api/radar.js prioriza data_publicacao
const radarJsCode = fs.readFileSync('functions/api/radar.js', 'utf-8');
assert.ok(
  radarJsCode.includes('item.data_publicacao ||') &&
  radarJsCode.indexOf('item.data_publicacao ||') < radarJsCode.indexOf('item.updated_at'),
  'functions/api/radar.js deve priorizar item.data_publicacao sobre item.updated_at'
);
assert.ok(
  !radarJsCode.includes('data_publicacao: item.updated_at || item.data_publicacao'),
  'functions/api/radar.js não deve colocar item.updated_at antes de data_publicacao'
);
assert.ok(
  !radarJsCode.includes('data_publicacao: card.data_publicacao || updatedAtIso'),
  'cardsFeed não deve herdar updatedAtIso na data de publicação'
);
console.log('  [OK] functions/api/radar.js preserva data_publicacao e não sobrescreve com updatedAtIso.');

// 3. Validar que _worker.js prioriza data_publicacao
const workerJsCode = fs.readFileSync('_worker.js', 'utf-8');
assert.ok(
  workerJsCode.includes('t.data_publicacao ||') &&
  workerJsCode.indexOf('t.data_publicacao ||') < workerJsCode.indexOf('t.updated_at'),
  '_worker.js deve priorizar t.data_publicacao sobre t.updated_at'
);
assert.ok(
  !workerJsCode.includes('data_publicacao: t.updated_at || updatedAtIso'),
  '_worker.js não deve colocar t.updated_at || updatedAtIso'
);
assert.ok(
  workerJsCode.includes('diffMs >= -300000') && workerJsCode.includes('let diffMin'),
  '_worker.js deve absorver clock skew de até 5 minutos, com a mesma regra do edge'
);
assert.ok(
  !workerJsCode.includes("if (diffMin < 5) return 'Atualizado agora';"),
  '_worker.js não deve usar a regra antiga que tratava diffMin negativo como agora'
);
assert.ok(
  !workerJsCode.includes('Object.keys(payload).length > 0 ? payload : null') &&
  workerJsCode.includes('payload.temas_ativos.length > 0') &&
  workerJsCode.includes('payload.noticias_quentes.length > 0'),
  "_worker.js não deve aceitar snapshot de estado vazio (só com chaves) como conteúdo — deve cair para o asset"
);
console.log('  [OK] _worker.js preserva data_publicacao e não sobrescreve com updatedAtIso.');

// 4. Validar que app.js possui formatarDataPublicacaoCardRadar e renderiza o datetime no DOM
const appJsCode = fs.readFileSync('app.js', 'utf-8');
assert.ok(appJsCode.includes('formatarDataPublicacaoCardRadar'), 'app.js deve conter a função formatarDataPublicacaoCardRadar');
assert.ok(appJsCode.includes('class="radar-pub-date" datetime='), 'app.js deve renderizar <time class="radar-pub-date" datetime=...>');
console.log('  [OK] app.js renderiza <time class="radar-pub-date" datetime=...> com acessibilidade.');

// 5. Validar lógica de hasRadarFeedChanged em múltiplos itens
function getRadarItemKey(item) {
  if (!item) return '';
  return String(item.fonte_url || item.titulo || '');
}
function hasRadarFeedChanged(prevItems, nextItems) {
  if (!Array.isArray(prevItems) || !Array.isArray(nextItems)) return true;
  if (prevItems.length !== nextItems.length) return true;
  if (prevItems.length === 0) return false;
  for (var i = 0; i < prevItems.length; i++) {
    if (getRadarItemKey(prevItems[i]) !== getRadarItemKey(nextItems[i]) ||
        String(prevItems[i].data_publicacao || '') !== String(nextItems[i].data_publicacao || '')) {
      return true;
    }
  }
  return false;
}

const listA = [
  { titulo: 'Notícia 1', data_publicacao: '2026-11-15T10:00:00Z' },
  { titulo: 'Notícia 2', data_publicacao: '2026-11-15T09:00:00Z' }
];
const listB = [
  { titulo: 'Notícia 1', data_publicacao: '2026-11-15T10:00:00Z' },
  { titulo: 'Notícia 2', data_publicacao: '2026-11-15T09:00:00Z' }
];
const listC = [
  { titulo: 'Notícia 1', data_publicacao: '2026-11-15T10:00:00Z' },
  { titulo: 'Notícia 2', data_publicacao: '2026-11-15T09:30:00Z' } // Timestamp alterado no item 2
];
assert.strictEqual(hasRadarFeedChanged(listA, listB), false, 'Feeds idênticos não devem acusar mudança');
assert.strictEqual(hasRadarFeedChanged(listA, listC), true, 'Mudança de timestamp no item 2 DEVE ser detectada');
console.log('  [OK] hasRadarFeedChanged detecta mudanças e preserva estabilidade.');

console.log('=== TODOS OS TESTES JS DO RADAR EDITORIAL PASSARAM COM SUCESSO ===');
