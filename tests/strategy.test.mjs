// Tests de estrategia básica. Corre con: node tests/strategy.test.mjs
// Las tablas esperadas están escritas a mano (copiadas del brief), una por cada combinación de reglas.
import { bestAction, insuranceAdvice, chartRows, handTotal } from '../strategy.js';
import { TABLES, rulesOf } from '../config.js';

let pass = 0;
let fail = 0;
const failures = [];
function check(name, got, want) {
  if (got === want) pass++;
  else {
    fail++;
    failures.push(`${name}: esperaba ${want}, obtuve ${got}`);
  }
}
function ok(name, cond) {
  check(name, !!cond, true);
}

const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const CODE_ACTION = { H: 'hit', S: 'stand', D: 'double', Ds: 'double', P: 'split', Rh: 'surrender', Rs: 'surrender', Rp: 'surrender' };

function parse(block) {
  const out = {};
  for (const line of block.trim().split('\n')) {
    const [k, ...codes] = line.trim().split(/\s+/);
    if (codes.length !== 10) throw new Error(`Fila mal escrita: ${line}`);
    out[k] = codes;
  }
  return out;
}

// ---------- Tablas esperadas (columnas: 2 3 4 5 6 7 8 9 10 A) ----------

const EXPECTED = {
  // Mesa Ávila: S17, DAS, rendición
  avila: {
    hard: parse(`
      4-8   H  H  H  H  H  H  H  H  H  H
      9     H  D  D  D  D  H  H  H  H  H
      10    D  D  D  D  D  D  D  D  H  H
      11    D  D  D  D  D  D  D  D  D  H
      12    H  H  S  S  S  H  H  H  H  H
      13    S  S  S  S  S  H  H  H  H  H
      14    S  S  S  S  S  H  H  H  H  H
      15    S  S  S  S  S  H  H  H  Rh H
      16    S  S  S  S  S  H  H  Rh Rh Rh
      17    S  S  S  S  S  S  S  S  S  S
      18+   S  S  S  S  S  S  S  S  S  S`),
    soft: parse(`
      A2    H  H  H  D  D  H  H  H  H  H
      A3    H  H  H  D  D  H  H  H  H  H
      A4    H  H  D  D  D  H  H  H  H  H
      A5    H  H  D  D  D  H  H  H  H  H
      A6    H  D  D  D  D  H  H  H  H  H
      A7    S  Ds Ds Ds Ds S  S  H  H  H
      A8    S  S  S  S  S  S  S  S  S  S
      A9    S  S  S  S  S  S  S  S  S  S`),
    pair: parse(`
      2,2   P  P  P  P  P  P  H  H  H  H
      3,3   P  P  P  P  P  P  H  H  H  H
      4,4   H  H  H  P  P  H  H  H  H  H
      5,5   D  D  D  D  D  D  D  D  H  H
      6,6   P  P  P  P  P  H  H  H  H  H
      7,7   P  P  P  P  P  P  H  H  H  H
      8,8   P  P  P  P  P  P  P  P  P  P
      9,9   P  P  P  P  P  S  P  P  S  S
      10,10 S  S  S  S  S  S  S  S  S  S
      A,A   P  P  P  P  P  P  P  P  P  P`),
  },
  // Mesa Los Roques: H17, DAS, sin rendición
  roques: {
    hard: parse(`
      4-8   H  H  H  H  H  H  H  H  H  H
      9     H  D  D  D  D  H  H  H  H  H
      10    D  D  D  D  D  D  D  D  H  H
      11    D  D  D  D  D  D  D  D  D  D
      12    H  H  S  S  S  H  H  H  H  H
      13    S  S  S  S  S  H  H  H  H  H
      14    S  S  S  S  S  H  H  H  H  H
      15    S  S  S  S  S  H  H  H  H  H
      16    S  S  S  S  S  H  H  H  H  H
      17    S  S  S  S  S  S  S  S  S  S
      18+   S  S  S  S  S  S  S  S  S  S`),
    soft: parse(`
      A2    H  H  H  D  D  H  H  H  H  H
      A3    H  H  H  D  D  H  H  H  H  H
      A4    H  H  D  D  D  H  H  H  H  H
      A5    H  H  D  D  D  H  H  H  H  H
      A6    H  D  D  D  D  H  H  H  H  H
      A7    Ds Ds Ds Ds Ds S  S  H  H  H
      A8    S  S  S  S  Ds S  S  S  S  S
      A9    S  S  S  S  S  S  S  S  S  S`),
    pair: parse(`
      2,2   P  P  P  P  P  P  H  H  H  H
      3,3   P  P  P  P  P  P  H  H  H  H
      4,4   H  H  H  P  P  H  H  H  H  H
      5,5   D  D  D  D  D  D  D  D  H  H
      6,6   P  P  P  P  P  H  H  H  H  H
      7,7   P  P  P  P  P  P  H  H  H  H
      8,8   P  P  P  P  P  P  P  P  P  P
      9,9   P  P  P  P  P  S  P  P  S  S
      10,10 S  S  S  S  S  S  S  S  S  S
      A,A   P  P  P  P  P  P  P  P  P  P`),
  },
  // Mesa Mérida: S17, sin DAS, sin rendición
  merida: {
    hard: parse(`
      4-8   H  H  H  H  H  H  H  H  H  H
      9     H  D  D  D  D  H  H  H  H  H
      10    D  D  D  D  D  D  D  D  H  H
      11    D  D  D  D  D  D  D  D  D  H
      12    H  H  S  S  S  H  H  H  H  H
      13    S  S  S  S  S  H  H  H  H  H
      14    S  S  S  S  S  H  H  H  H  H
      15    S  S  S  S  S  H  H  H  H  H
      16    S  S  S  S  S  H  H  H  H  H
      17    S  S  S  S  S  S  S  S  S  S
      18+   S  S  S  S  S  S  S  S  S  S`),
    soft: parse(`
      A2    H  H  H  D  D  H  H  H  H  H
      A3    H  H  H  D  D  H  H  H  H  H
      A4    H  H  D  D  D  H  H  H  H  H
      A5    H  H  D  D  D  H  H  H  H  H
      A6    H  D  D  D  D  H  H  H  H  H
      A7    S  Ds Ds Ds Ds S  S  H  H  H
      A8    S  S  S  S  S  S  S  S  S  S
      A9    S  S  S  S  S  S  S  S  S  S`),
    pair: parse(`
      2,2   H  H  P  P  P  P  H  H  H  H
      3,3   H  H  P  P  P  P  H  H  H  H
      4,4   H  H  H  H  H  H  H  H  H  H
      5,5   D  D  D  D  D  D  D  D  H  H
      6,6   H  P  P  P  P  H  H  H  H  H
      7,7   P  P  P  P  P  P  H  H  H  H
      8,8   P  P  P  P  P  P  P  P  P  P
      9,9   P  P  P  P  P  S  P  P  S  S
      10,10 S  S  S  S  S  S  S  S  S  S
      A,A   P  P  P  P  P  P  P  P  P  P`),
  },
  // Mesa Canaima: H17, DAS, rendición
  canaima: {
    hard: parse(`
      4-8   H  H  H  H  H  H  H  H  H  H
      9     H  D  D  D  D  H  H  H  H  H
      10    D  D  D  D  D  D  D  D  H  H
      11    D  D  D  D  D  D  D  D  D  D
      12    H  H  S  S  S  H  H  H  H  H
      13    S  S  S  S  S  H  H  H  H  H
      14    S  S  S  S  S  H  H  H  H  H
      15    S  S  S  S  S  H  H  H  Rh Rh
      16    S  S  S  S  S  H  H  Rh Rh Rh
      17    S  S  S  S  S  S  S  S  S  Rs
      18+   S  S  S  S  S  S  S  S  S  S`),
    soft: parse(`
      A2    H  H  H  D  D  H  H  H  H  H
      A3    H  H  H  D  D  H  H  H  H  H
      A4    H  H  D  D  D  H  H  H  H  H
      A5    H  H  D  D  D  H  H  H  H  H
      A6    H  D  D  D  D  H  H  H  H  H
      A7    Ds Ds Ds Ds Ds S  S  H  H  H
      A8    S  S  S  S  Ds S  S  S  S  S
      A9    S  S  S  S  S  S  S  S  S  S`),
    pair: parse(`
      2,2   P  P  P  P  P  P  H  H  H  H
      3,3   P  P  P  P  P  P  H  H  H  H
      4,4   H  H  H  P  P  H  H  H  H  H
      5,5   D  D  D  D  D  D  D  D  H  H
      6,6   P  P  P  P  P  H  H  H  H  H
      7,7   P  P  P  P  P  P  H  H  H  H
      8,8   P  P  P  P  P  P  P  P  P  Rp
      9,9   P  P  P  P  P  S  P  P  S  S
      10,10 S  S  S  S  S  S  S  S  S  S
      A,A   P  P  P  P  P  P  P  P  P  P`),
  },
};

// Manos representativas de 2 cartas por fila (sin pares en duras).
const HARD_HANDS = {
  '4-8': [['2', '3'], ['2', '4'], ['2', '5'], ['2', '6'], ['3', '5']],
  9: [['2', '7'], ['4', '5']],
  10: [['2', '8'], ['4', '6']],
  11: [['2', '9'], ['5', '6']],
  12: [['2', '10'], ['3', '9'], ['5', '7']],
  13: [['3', '10'], ['4', '9']],
  14: [['4', '10'], ['5', '9']],
  15: [['5', '10'], ['7', '8']],
  16: [['6', '10'], ['7', '9']],
  17: [['7', '10'], ['8', '9']],
  '18+': [['8', '10'], ['9', '10'], ['5', '5', '10'], ['5', '6', '10']],
};
const SOFT_HANDS = { A2: ['A', '2'], A3: ['A', '3'], A4: ['A', '4'], A5: ['A', '5'], A6: ['A', '6'], A7: ['A', '7'], A8: ['A', '8'], A9: ['A', '9'] };
const PAIR_HANDS = {
  '2,2': [['2', '2']],
  '3,3': [['3', '3']],
  '4,4': [['4', '4']],
  '5,5': [['5', '5']],
  '6,6': [['6', '6']],
  '7,7': [['7', '7']],
  '8,8': [['8', '8']],
  '9,9': [['9', '9']],
  '10,10': [['10', '10'], ['J', 'K'], ['Q', '10']],
  'A,A': [['A', 'A']],
};

let cells = 0;
for (const table of TABLES) {
  const rules = rulesOf(table);
  const exp = EXPECTED[table.id];
  const groups = [
    ['hard', HARD_HANDS],
    ['soft', Object.fromEntries(Object.entries(SOFT_HANDS).map(([k, v]) => [k, [v]]))],
    ['pair', PAIR_HANDS],
  ];
  for (const [kind, hands] of groups) {
    for (const [rowKey, list] of Object.entries(hands)) {
      const codes = exp[kind][rowKey];
      if (!codes) throw new Error(`Falta fila ${kind} ${rowKey} en ${table.id}`);
      UPS.forEach((up, i) => {
        const code = codes[i];
        for (const cards of list) {
          // Con 3 cartas no hay doblar ni rendición: el código esperado aplica igual porque 18+ es siempre S.
          const r = bestAction(cards, up, rules);
          const want = cards.length > 2 ? 'stand' : CODE_ACTION[code];
          check(`${table.name} ${kind} ${cards.join(',')} vs ${up}`, r.action, want);
          ok(`${table.name} ${cards.join(',')} vs ${up} tiene porqué`, r.reason && !r.reason.includes('undefined') && r.reason.length > 10);
          cells++;
        }
      });
    }
  }
  // La tabla mostrada en pantalla coincide con la esperada.
  const chart = chartRows(rules);
  const pairKeys = ['2,2', '3,3', '4,4', '5,5', '6,6', '7,7', '8,8', '9,9', '10,10', 'A,A'];
  chart.pair.forEach((r, i) => check(`${table.name} tabla pares ${r.label}`, r.codes.join(' '), exp.pair[pairKeys[i]].join(' ')));
  chart.soft.forEach((r, i) => check(`${table.name} tabla blandas ${r.label}`, r.codes.join(' '), exp.soft[`A${i + 2}`].join(' ')));
  const hardKeys = ['4-8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18+'];
  chart.hard.forEach((r, i) => check(`${table.name} tabla duras ${r.label}`, r.codes.join(' '), exp.hard[hardKeys[i]].join(' ')));
}

// ---------- Respaldos ----------
const avila = rulesOf(TABLES[0]);
const roques = rulesOf(TABLES[1]);
const merida = rulesOf(TABLES[2]);
const canaima = rulesOf(TABLES[3]);

// 3 cartas: D -> pedir, Ds -> plantarse
let r = bestAction(['A', '2', '2'], 5, avila);
check('A-2-2 (15 blando, fila A4) vs 5 con 3 cartas pide', r.action, 'hit');
check('A-2-2 categoría blanda', r.category, 'soft');
check('A-2-2 clave', r.key, 'A4 contra 5');
ok('A-2-2 explica que no se puede doblar', r.reason.includes('más de 2 cartas'));
r = bestAction(['A', '3', '4'], 4, avila);
check('A-3-4 (18 blando) vs 4 con 3 cartas se planta', r.action, 'stand');
r = bestAction(['2', '4', '5'], 6, avila);
check('11 de 3 cartas vs 6 pide', r.action, 'hit');
r = bestAction(['3', '2', '4'], 5, avila);
check('9 de 3 cartas vs 5 pide', r.action, 'hit');

// Rendición no permitida
r = bestAction(['6', '4', '6'], 10, avila);
check('16 de 3 cartas vs 10 pide (no hay rendición)', r.action, 'hit');
r = bestAction({ cards: ['10', '6'], fromSplit: true, handsCount: 2 }, 10, avila);
check('16 tras dividir vs 10 pide (no hay rendición)', r.action, 'hit');
r = bestAction({ cards: ['10', '6'], firstDecision: false }, 10, avila);
check('16 sin ser primera decisión vs 10 pide', r.action, 'hit');
r = bestAction(['10', '6'], 10, roques);
check('16 vs 10 en Los Roques (sin rendición) pide', r.action, 'hit');
ok('16 vs 10 en Los Roques explica la regla', r.reason.includes('no hay rendición'));
r = bestAction(['7', '5', '5'], 11, canaima);
check('17 duro de 3 cartas vs A en Canaima se planta', r.action, 'stand');
r = bestAction({ cards: ['8', '8'], fromSplit: true, handsCount: 2 }, 11, canaima);
check('8,8 tras dividir vs A en Canaima divide', r.action, 'split');
r = bestAction(['10', '6'], 10, avila, { hit: true, stand: true, double: true, split: false, surrender: false });
check('16 vs 10 con rendición no disponible pide', r.action, 'hit');

// Sin fichas para doblar / dividir
const noMoney = { hit: true, stand: true, double: false, split: false, surrender: true };
r = bestAction(['5', '6'], 6, avila, noMoney);
check('11 vs 6 sin fichas para doblar pide', r.action, 'hit');
ok('11 vs 6 sin fichas explica', r.reason.includes('fichas'));
r = bestAction(['A', '7'], 4, avila, noMoney);
check('A7 vs 4 sin fichas para doblar se planta', r.action, 'stand');
r = bestAction(['8', '8'], 6, avila, noMoney);
check('8,8 vs 6 sin fichas para dividir: 16 duro se planta', r.action, 'stand');
r = bestAction(['5', '5'], 6, avila, noMoney);
check('5,5 vs 6 sin fichas: pide', r.action, 'hit');

// Límite de 4 manos
const four = { cards: ['8', '8'], fromSplit: true, handsCount: 4 };
r = bestAction(four, 6, avila);
check('8,8 con 4 manos vs 6 se juega como 16 duro: plantarse', r.action, 'stand');
ok('8,8 con 4 manos explica el límite', r.reason.includes('4 manos'));
r = bestAction({ cards: ['2', '2'], fromSplit: true, handsCount: 4 }, 4, avila);
check('2,2 con 4 manos vs 4 es 4 duro: pedir', r.action, 'hit');
check('2,2 con 4 manos categoría dura', r.category, 'hard');
r = bestAction({ cards: ['8', '8'], fromSplit: true, handsCount: 4 }, 11, canaima);
check('8,8 con 4 manos vs A en Canaima (sin rendición tras dividir): pedir', r.action, 'hit');
r = bestAction({ cards: ['9', '9'], fromSplit: true, handsCount: 4 }, 6, avila);
check('9,9 con 4 manos vs 6: 18 se planta', r.action, 'stand');
r = bestAction({ cards: ['A', 'A'] }, 6, avila, { hit: true, stand: true, double: true, split: false, surrender: false });
check('A,A sin poder dividir: pedir', r.action, 'hit');

// Doblar después de dividir
r = bestAction({ cards: ['5', '6'], fromSplit: true, handsCount: 2 }, 6, merida);
check('11 tras dividir en Mérida (sin DAS) pide', r.action, 'hit');
ok('11 tras dividir en Mérida explica DAS', r.reason.includes('después de dividir'));
r = bestAction({ cards: ['5', '6'], fromSplit: true, handsCount: 2 }, 6, avila);
check('11 tras dividir en Ávila (DAS) dobla', r.action, 'double');

// Notas por regla de mesa
r = bestAction(['5', '6'], 11, roques);
check('11 vs A en Los Roques dobla', r.action, 'double');
check(
  '11 vs A en Los Roques: nota H17',
  r.reason,
  'En esta mesa el crupier pide con 17 blando (H17), por eso aquí sí se dobla 11 contra As.',
);
r = bestAction(['5', '6'], 11, avila);
check('11 vs A en Ávila pide', r.action, 'hit');
ok('11 vs A en Ávila sin nota de regla', !r.ruleNote);
r = bestAction(['2', '2'], 3, merida);
check('2,2 vs 3 en Mérida pide', r.action, 'hit');
ok('2,2 vs 3 en Mérida: nota DAS', r.reason.startsWith('En esta mesa no puedes doblar después de dividir'));

// Categorías y claves
r = bestAction(['10', '6'], 10, avila);
check('16 vs 10 Ávila: rendirse', r.action, 'surrender');
check('16 vs 10 Ávila: categoría rendición', r.category, 'surrender');
check('16 vs 10 Ávila: clave', r.key, '16 contra 10');
check('Porqué rendirse', r.reason, 'Pierdes la mitad en vez de jugar una mano que pierde la mayoría de las veces.');
r = bestAction(['A', '7'], 9, avila);
check('Clave A7 contra 9', r.key, 'A7 contra 9');
r = bestAction(['8', '8'], 11, avila);
check('Clave 8,8 contra As', r.key, '8,8 contra As');
check('8,8 categoría pares', r.category, 'pair');

// Seguro
const ins = insuranceAdvice(false);
check('Seguro: nunca', ins.action, 'no');
check('Seguro categoría', ins.category, 'insurance');
check('Dinero parejo: nunca', insuranceAdvice(true).action, 'no');

// Totales
check('A,A,9 = 21 blando', `${handTotal(['A', 'A', '9']).total}${handTotal(['A', 'A', '9']).soft}`, '21true');
check('A,6,10 = 17 duro', `${handTotal(['A', '6', '10']).total}${handTotal(['A', '6', '10']).soft}`, '17false');

console.log(`Estrategia: ${TABLES.length} mesas × 290 celdas (duras, blandas y pares), ${cells} manos probadas contra la tabla escrita a mano.`);
console.log(`${pass} pasaron, ${fail} fallaron.`);
if (fail) {
  for (const f of failures.slice(0, 40)) console.log('  ✗ ' + f);
  process.exit(1);
}
