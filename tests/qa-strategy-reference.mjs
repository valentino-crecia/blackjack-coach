// QA: estrategia básica contra la fuente externa (Wizard of Odds, 4–8 mazos).
// Corre con: node tests/qa-strategy-reference.mjs
//
// Fuente: https://wizardofodds.com/games/blackjack/strategy/4-decks/
//   Gráficos "4-8 Decks, Dealer Stands on Soft 17" (bj_4d_s17.gif) y
//   "4-8 Decks, Dealer Hits on Soft 17" (bj_4d_h17.gif), transcritos tal cual,
//   con sus códigos: H, S, Dh (doblar si se puede, si no pedir), Ds (doblar si se puede,
//   si no plantarse), P, Ph (dividir si hay DAS, si no pedir), Rh / Rs / Rp (rendirse si
//   se puede, si no pedir / plantarse / dividir).
//   Regla de la página para pares que no se pueden dividir: se juegan por su total.
//
// Este archivo NO importa las tablas de la app: solo llama a bestAction().
import { bestAction } from '../strategy.js';
import { TABLES, rulesOf } from '../config.js';

const SRC = 'https://wizardofodds.com/games/blackjack/strategy/4-decks/';
const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const UP_LABEL = (u) => (u === 11 ? 'A' : String(u));

function chart(text) {
  const out = {};
  for (const line of text.trim().split('\n')) {
    const [k, ...codes] = line.trim().split(/\s+/);
    if (codes.length !== 10) throw new Error(`Fila mal transcrita: ${line}`);
    out[k] = codes;
  }
  return out;
}

// ---------- Transcripción de los gráficos de Wizard of Odds ----------
const WOO = {
  s17: {
    hard: chart(`
      4-8  H  H  H  H  H  H  H  H  H  H
      9    H  Dh Dh Dh Dh H  H  H  H  H
      10   Dh Dh Dh Dh Dh Dh Dh Dh H  H
      11   Dh Dh Dh Dh Dh Dh Dh Dh Dh H
      12   H  H  S  S  S  H  H  H  H  H
      13   S  S  S  S  S  H  H  H  H  H
      14   S  S  S  S  S  H  H  H  H  H
      15   S  S  S  S  S  H  H  H  Rh H
      16   S  S  S  S  S  H  H  Rh Rh Rh
      17+  S  S  S  S  S  S  S  S  S  S`),
    soft: chart(`
      13   H  H  H  Dh Dh H  H  H  H  H
      14   H  H  H  Dh Dh H  H  H  H  H
      15   H  H  Dh Dh Dh H  H  H  H  H
      16   H  H  Dh Dh Dh H  H  H  H  H
      17   H  Dh Dh Dh Dh H  H  H  H  H
      18   S  Ds Ds Ds Ds S  S  H  H  H
      19+  S  S  S  S  S  S  S  S  S  S`),
    pair: chart(`
      2    Ph Ph P  P  P  P  H  H  H  H
      3    Ph Ph P  P  P  P  H  H  H  H
      4    H  H  H  Ph Ph H  H  H  H  H
      6    Ph P  P  P  P  H  H  H  H  H
      7    P  P  P  P  P  P  H  H  H  H
      8    P  P  P  P  P  P  P  P  P  P
      9    P  P  P  P  P  S  P  P  S  S
      11   P  P  P  P  P  P  P  P  P  P`),
  },
  h17: {
    hard: chart(`
      4-8  H  H  H  H  H  H  H  H  H  H
      9    H  Dh Dh Dh Dh H  H  H  H  H
      10   Dh Dh Dh Dh Dh Dh Dh Dh H  H
      11   Dh Dh Dh Dh Dh Dh Dh Dh Dh Dh
      12   H  H  S  S  S  H  H  H  H  H
      13   S  S  S  S  S  H  H  H  H  H
      14   S  S  S  S  S  H  H  H  H  H
      15   S  S  S  S  S  H  H  H  Rh Rh
      16   S  S  S  S  S  H  H  Rh Rh Rh
      17   S  S  S  S  S  S  S  S  S  Rs
      18+  S  S  S  S  S  S  S  S  S  S`),
    soft: chart(`
      13   H  H  H  Dh Dh H  H  H  H  H
      14   H  H  H  Dh Dh H  H  H  H  H
      15   H  H  Dh Dh Dh H  H  H  H  H
      16   H  H  Dh Dh Dh H  H  H  H  H
      17   H  Dh Dh Dh Dh H  H  H  H  H
      18   Ds Ds Ds Ds Ds S  S  H  H  H
      19   S  S  S  S  Ds S  S  S  S  S
      20+  S  S  S  S  S  S  S  S  S  S`),
    pair: chart(`
      2    Ph Ph P  P  P  P  H  H  H  H
      3    Ph Ph P  P  P  P  H  H  H  H
      4    H  H  H  Ph Ph H  H  H  H  H
      6    Ph P  P  P  P  H  H  H  H  H
      7    P  P  P  P  P  P  H  H  H  H
      8    P  P  P  P  P  P  P  P  P  Rp
      9    P  P  P  P  P  S  P  P  S  S
      11   P  P  P  P  P  P  P  P  P  P`),
  },
};

function hardCode(c, total, i) {
  if (total <= 8) return c.hard['4-8'][i];
  if (total >= 17 && c.hard['17+']) return c.hard['17+'][i];
  if (total >= 18 && c.hard['18+']) return c.hard['18+'][i];
  return c.hard[String(total)][i];
}
function softCode(c, total, i) {
  if (total === 12) return 'H'; // A,A sin poder dividir: 12 blando, "otherwise hit" (nota de la página)
  if (total === 21) return 'S';
  if (c.soft[String(total)]) return c.soft[String(total)][i];
  return (c.soft['19+'] || c.soft['20+'])[i];
}

// Código de WoO -> jugada, según lo que la mesa y la mano permiten.
function resolveWoo(code, { das, canDouble, canSurrender, canSplit }, fallback) {
  switch (code) {
    case 'H':
      return 'hit';
    case 'S':
      return 'stand';
    case 'Dh':
      return canDouble ? 'double' : 'hit';
    case 'Ds':
      return canDouble ? 'double' : 'stand';
    case 'P':
      return canSplit ? 'split' : fallback();
    case 'Ph':
      return canSplit ? (das ? 'split' : 'hit') : fallback();
    case 'Rh':
      return canSurrender ? 'surrender' : 'hit';
    case 'Rs':
      return canSurrender ? 'surrender' : 'stand';
    case 'Rp':
      return canSurrender ? 'surrender' : canSplit ? 'split' : fallback();
    default:
      throw new Error(`Código desconocido ${code}`);
  }
}

// ---------- Manos de ejemplo ----------
// Duras de 2 cartas sin As y sin par, por total.
const HARD2 = { 5: ['2', '3'], 6: ['2', '4'], 7: ['2', '5'], 8: ['2', '6'], 9: ['2', '7'], 10: ['2', '8'], 11: ['2', '9'], 12: ['10', '2'], 13: ['10', '3'], 14: ['10', '4'], 15: ['10', '5'], 16: ['10', '6'], 17: ['10', '7'], 18: ['10', '8'], 19: ['10', '9'] };
// Duras de 3 cartas, por total.
const HARD3 = { 6: ['2', '2', '2'], 7: ['2', '2', '3'], 8: ['2', '2', '4'], 9: ['2', '3', '4'], 10: ['2', '3', '5'], 11: ['2', '4', '5'], 12: ['3', '4', '5'], 13: ['3', '4', '6'], 14: ['4', '5', '5'], 15: ['10', '2', '3'], 16: ['10', '2', '4'], 17: ['10', '2', '5'], 18: ['10', '2', '6'], 19: ['10', '2', '7'], 20: ['10', '2', '8'], 21: ['10', '2', '9'] };
// Blandas de 2 y 3 cartas (total blando).
const SOFT2 = { 13: ['A', '2'], 14: ['A', '3'], 15: ['A', '4'], 16: ['A', '5'], 17: ['A', '6'], 18: ['A', '7'], 19: ['A', '8'], 20: ['A', '9'] };
// (A,A,A = 13 blando se prueba aparte abajo.)
const SOFT3_REAL = { 14: ['A', 'A', '2'], 15: ['A', '2', '2'], 16: ['A', '2', '3'], 17: ['A', '2', '4'], 18: ['A', '3', '4'], 19: ['A', '4', '4'], 20: ['A', '4', '5'], 21: ['A', '4', '6'] };
const PAIR_RANK = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'A' };

let pass = 0;
const fails = [];
function check(desc, got, want) {
  if (got === want) pass++;
  else fails.push(`${desc}: Wizard of Odds dice ${want}, la app dice ${got}`);
}

for (const table of TABLES) {
  const rules = rulesOf(table);
  const c = rules.h17 ? WOO.h17 : WOO.s17;
  const T = `${table.name} (${table.decks}m ${rules.h17 ? 'H17' : 'S17'} ${rules.das ? 'DAS' : 'sinDAS'} ${rules.surrender ? 'rend' : 'sinRend'})`;

  UPS.forEach((up, i) => {
    const U = UP_LABEL(up);
    const base = { das: rules.das, canDouble: true, canSurrender: rules.surrender, canSplit: true };

    // 1) Duras de 2 cartas, mano inicial, todo disponible (disponibilidad por defecto de la app).
    for (const [tot, cards] of Object.entries(HARD2)) {
      const want = resolveWoo(hardCode(c, +tot, i), { ...base, canSplit: false }, () => null);
      check(`${T} dura ${tot} [${cards}] vs ${U}`, bestAction(cards, up, rules).action, want);
      // Sin fichas para doblar.
      const av = { hit: true, stand: true, double: false, split: false, surrender: rules.surrender };
      check(`${T} dura ${tot} [${cards}] vs ${U} sin poder doblar`, bestAction(cards, up, rules, av).action, resolveWoo(hardCode(c, +tot, i), { ...base, canDouble: false, canSplit: false }, () => null));
    }
    // 2) Duras de 3 cartas: ni doblar ni rendirse.
    for (const [tot, cards] of Object.entries(HARD3)) {
      const want = tot >= 21 ? 'stand' : resolveWoo(hardCode(c, +tot, i), { ...base, canDouble: false, canSurrender: false, canSplit: false }, () => null);
      check(`${T} dura ${tot} 3 cartas [${cards}] vs ${U}`, bestAction({ cards, firstDecision: false }, up, rules).action, want);
    }
    // 3) Blandas de 2 cartas.
    for (const [tot, cards] of Object.entries(SOFT2)) {
      check(`${T} blanda ${cards.join(',')} vs ${U}`, bestAction(cards, up, rules).action, resolveWoo(softCode(c, +tot, i), { ...base, canSplit: false }, () => null));
      const av = { hit: true, stand: true, double: false, split: false, surrender: rules.surrender };
      check(`${T} blanda ${cards.join(',')} vs ${U} sin poder doblar`, bestAction(cards, up, rules, av).action, resolveWoo(softCode(c, +tot, i), { ...base, canDouble: false, canSplit: false }, () => null));
    }
    // 4) Blandas de 3 cartas.
    for (const [tot, cards] of Object.entries(SOFT3_REAL)) {
      const want = resolveWoo(softCode(c, +tot, i), { ...base, canDouble: false, canSurrender: false, canSplit: false }, () => null);
      check(`${T} blanda ${tot} 3 cartas [${cards}] vs ${U}`, bestAction({ cards, firstDecision: false }, up, rules).action, want);
    }
    check(`${T} A,A,A (13 blando) vs ${U}`, bestAction({ cards: ['A', 'A', 'A'], firstDecision: false }, up, rules).action, resolveWoo(softCode(c, 13, i), { ...base, canDouble: false, canSurrender: false, canSplit: false }, () => null));

    // 5) Pares, mano inicial.
    for (const [v, r] of Object.entries(PAIR_RANK)) {
      const cards = [r, r];
      const total = +v * 2;
      const asTotal = (opts) => () => (+v === 11 ? resolveWoo(softCode(c, 12, i), opts, () => null) : resolveWoo(hardCode(c, total, i), opts, () => null));
      const row = c.pair[v];
      const code = row ? row[i] : null; // 5,5 y 10,10 no tienen fila: se juegan por total
      const want = code ? resolveWoo(code, base, asTotal({ ...base, canSplit: false })) : asTotal({ ...base, canSplit: false })();
      check(`${T} par ${r},${r} vs ${U}`, bestAction(cards, up, rules).action, want);

      // 5b) Par sin fichas para dividir ni doblar: se juega por total.
      const av = { hit: true, stand: true, double: false, split: false, surrender: rules.surrender };
      const o = { ...base, canDouble: false, canSplit: false };
      const want2 = code ? resolveWoo(code, o, asTotal(o)) : asTotal(o)();
      check(`${T} par ${r},${r} vs ${U} sin fichas`, bestAction(cards, up, rules, av).action, want2);

      // 5c) Par que sale de dividir (2 manos): sin rendición; doblar según DAS.
      const avs = { hit: true, stand: true, double: !!rules.das, split: true, surrender: false };
      const os = { ...base, canDouble: !!rules.das, canSurrender: false };
      const want3 = code ? resolveWoo(code, os, asTotal({ ...os, canSplit: false })) : asTotal({ ...os, canSplit: false })();
      check(`${T} par ${r},${r} vs ${U} tras dividir`, bestAction({ cards, fromSplit: true, handsCount: 2 }, up, rules, avs).action, want3);

      // 5d) Ya hay 4 manos: no se puede dividir más.
      const av4 = { hit: true, stand: true, double: !!rules.das, split: false, surrender: false };
      const o4 = { ...base, canDouble: !!rules.das, canSurrender: false, canSplit: false };
      const want4 = code ? resolveWoo(code, o4, asTotal(o4)) : asTotal(o4)();
      check(`${T} par ${r},${r} vs ${U} con 4 manos`, bestAction({ cards, fromSplit: true, handsCount: 4 }, up, rules, av4).action, want4);
    }

    // 6) Duras de 2 cartas tras dividir: doblar solo con DAS, nunca rendirse.
    for (const [tot, cards] of Object.entries(HARD2)) {
      const av = { hit: true, stand: true, double: !!rules.das, split: false, surrender: false };
      const want = resolveWoo(hardCode(c, +tot, i), { ...base, canDouble: !!rules.das, canSurrender: false, canSplit: false }, () => null);
      check(`${T} dura ${tot} tras dividir vs ${U}`, bestAction({ cards, fromSplit: true, handsCount: 2 }, up, rules, av).action, want);
      // Disponibilidad por defecto de la app para una mano dividida.
      check(`${T} dura ${tot} tras dividir vs ${U} (disp. por defecto)`, bestAction({ cards, fromSplit: true, handsCount: 2 }, up, rules).action, want);
    }
  });
}

const total = pass + fails.length;
console.log(`QA estrategia vs Wizard of Odds (${SRC})`);
console.log(`${total} comprobaciones, ${pass} OK, ${fails.length} diferencias.`);
if (fails.length) {
  for (const f of fails.slice(0, 60)) console.log('  FALLA ' + f);
  if (fails.length > 60) console.log(`  ... y ${fails.length - 60} más`);
  process.exit(1);
}
