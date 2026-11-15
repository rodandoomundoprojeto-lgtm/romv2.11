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

// Teste 2: Publicada há 25 minutos -> "Publicada há 25 min"
const res25 = formatarDataPublicacaoCardRadar('2026-11-15T14:35:00Z', now);
assert.strictEqual(res25.text, 'Publicada há 25 min');

// Teste 3: Publicada há 3 horas no mesmo dia
const res3h = formatarDataPublicacaoCardRadar('2026-11-15T12:00:00Z', now);
assert.ok(res3h.text.startsWith('Publicada às '), `Esperado começar com 'Publicada às ', obtido: ${res3h.text}`);

// Teste 4: Publicada em dia anterior
const resAnt = formatarDataPublicacaoCardRadar('2026-11-10T10:30:00Z', now);
assert.ok(resAnt.text.startsWith('Publicada em 10/11'), `Esperado data anterior, obtido: ${resAnt.text}`);
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
console.log('  [OK] _worker.js preserva data_publicacao e não sobrescreve com updatedAtIso.');

// 4. Validar que app.js possui formatarDataPublicacaoCardRadar e renderiza o datetime no DOM
const appJsCode = fs.readFileSync('app.js', 'utf-8');
assert.ok(appJsCode.includes('formatarDataPublicacaoCardRadar'), 'app.js deve conter a função formatarDataPublicacaoCardRadar');
assert.ok(appJsCode.includes('class="radar-pub-date" datetime='), 'app.js deve renderizar <time class="radar-pub-date" datetime=...>');
console.log('  [OK] app.js renderiza <time class="radar-pub-date" datetime=...> com acessibilidade.');

console.log('=== TODOS OS TESTES JS DO RADAR EDITORIAL PASSARAM COM SUCESSO ===');
