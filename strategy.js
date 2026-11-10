// Estrategia básica por total (4 a 8 mazos). Módulo puro: no toca el DOM.
// Fuente: tablas de Wizard of Odds para 4–8 mazos, con cambios por H17, DAS y rendición.

// ---------- Cartas ----------

export function cardValue(card) {
  const r = typeof card === 'object' && card !== null ? card.rank : String(card);
  if (r === 'A') return 11;
  if (r === 'J' || r === 'Q' || r === 'K' || r === '10' || r === 'T') return 10;
  return Number(r);
}

export function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    if (v === 11) aces++;
    total += v;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards) {
  return cards.length === 2 && handTotal(cards).total === 21;
}

export function isPair(cards) {
  return cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);
}

function upValue(up) {
  return typeof up === 'number' ? up : cardValue(up);
}

export function upLabel(up) {
  const v = upValue(up);
  return v === 11 ? 'As' : String(v);
}

// ---------- Tablas ----------

// Columnas: crupier 2 3 4 5 6 7 8 9 10 A
const row = (s) => s.trim().split(/\s+/);

const BASE_HARD = {
  4: row('H  H  H  H  H  H  H  H  H  H'),
  5: row('H  H  H  H  H  H  H  H  H  H'),
  6: row('H  H  H  H  H  H  H  H  H  H'),
  7: row('H  H  H  H  H  H  H  H  H  H'),
  8: row('H  H  H  H  H  H  H  H  H  H'),
  9: row('H  D  D  D  D  H  H  H  H  H'),
  10: row('D  D  D  D  D  D  D  D  H  H'),
  11: row('D  D  D  D  D  D  D  D  D  H'),
  12: row('H  H  S  S  S  H  H  H  H  H'),
  13: row('S  S  S  S  S  H  H  H  H  H'),
  14: row('S  S  S  S  S  H  H  H  H  H'),
  15: row('S  S  S  S  S  H  H  H  Rh H'),
  16: row('S  S  S  S  S  H  H  Rh Rh Rh'),
  17: row('S  S  S  S  S  S  S  S  S  S'),
  18: row('S  S  S  S  S  S  S  S  S  S'),
  19: row('S  S  S  S  S  S  S  S  S  S'),
  20: row('S  S  S  S  S  S  S  S  S  S'),
  21: row('S  S  S  S  S  S  S  S  S  S'),
};

// Clave = total blando (A2 = 13 ... A9 = 20)
const BASE_SOFT = {
  13: row('H  H  H  D  D  H  H  H  H  H'),
  14: row('H  H  H  D  D  H  H  H  H  H'),
  15: row('H  H  D  D  D  H  H  H  H  H'),
  16: row('H  H  D  D  D  H  H  H  H  H'),
  17: row('H  D  D  D  D  H  H  H  H  H'),
  18: row('S  Ds Ds Ds Ds S  S  H  H  H'),
  19: row('S  S  S  S  S  S  S  S  S  S'),
  20: row('S  S  S  S  S  S  S  S  S  S'),
};

// Clave = valor de la carta del par (A = 11)
const BASE_PAIR = {
  2: row('P  P  P  P  P  P  H  H  H  H'),
  3: row('P  P  P  P  P  P  H  H  H  H'),
  4: row('H  H  H  P  P  H  H  H  H  H'),
  5: row('D  D  D  D  D  D  D  D  H  H'),
  6: row('P  P  P  P  P  H  H  H  H  H'),
  7: row('P  P  P  P  P  P  H  H  H  H'),
  8: row('P  P  P  P  P  P  P  P  P  P'),
  9: row('P  P  P  P  P  S  P  P  S  S'),
  10: row('S  S  S  S  S  S  S  S  S  S'),
  11: row('P  P  P  P  P  P  P  P  P  P'),
};

const A = 9; // índice de la columna del As
const col = (up) => up - 2;

function copyTable(t) {
  const out = {};
  for (const k of Object.keys(t)) out[k] = t[k].slice();
  return out;
}

const SURRENDER_FALLBACK = { Rh: 'H', Rs: 'S', Rp: 'P' };
const cache = new Map();

export function strategyTables(rules) {
  const key = `${rules.h17 ? 1 : 0}${rules.das ? 1 : 0}${rules.surrender ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const hard = copyTable(BASE_HARD);
  const soft = copyTable(BASE_SOFT);
  const pair = copyTable(BASE_PAIR);

  if (rules.h17) {
    hard[11][A] = 'D';
    soft[18][col(2)] = 'Ds';
    soft[19][col(6)] = 'Ds';
    if (rules.surrender) {
      hard[15][A] = 'Rh';
      hard[17][A] = 'Rs';
      pair[8][A] = 'Rp';
    }
  }
  if (!rules.das) {
    pair[2][col(2)] = 'H';
    pair[2][col(3)] = 'H';
    pair[3][col(2)] = 'H';
    pair[3][col(3)] = 'H';
    pair[4] = pair[4].map(() => 'H');
    pair[6][col(2)] = 'H';
  }
  if (!rules.surrender) {
    for (const t of [hard, soft, pair]) {
      for (const k of Object.keys(t)) t[k] = t[k].map((c) => SURRENDER_FALLBACK[c] || c);
    }
  }
  const tables = { hard, soft, pair };
  cache.set(key, tables);
  return tables;
}

// ---------- Textos ----------

export const ACTION_LABEL = {
  hit: 'Pedir',
  stand: 'Plantarse',
  double: 'Doblar',
  split: 'Dividir',
  surrender: 'Rendirse',
};

const PRIMARY = { H: 'hit', S: 'stand', D: 'double', Ds: 'double', P: 'split', Rh: 'surrender', Rs: 'surrender', Rp: 'surrender' };

function situationLabel(category, row) {
  if (category === 'pair') return row === 11 ? 'A,A' : `${row},${row}`;
  if (category === 'soft') {
    if (row === 12) return 'A,A';
    if (row >= 21) return '21 blando';
    return `A${row - 11}`;
  }
  return String(row);
}

const SURRENDER_TEXT = 'Pierdes la mitad en vez de jugar una mano que pierde la mayoría de las veces.';
const WEAK_TEXT = 'El crupier muestra carta débil y se pasa seguido: no te arriesgues tú.';

function reasonFor(category, row, up, action, total) {
  if (action === 'surrender') return SURRENDER_TEXT;
  if (category === 'pair') {
    const v = row;
    if (action === 'split') {
      if (v === 11) return 'Dos manos que arrancan en 11 valen mucho más que un 12.';
      if (v === 8) return '16 es la peor mano; dos manos desde 8 juegan mejor.';
      if (v === 9) return 'Dos manos desde 9 aprovechan mejor esta carta del crupier que un 18.';
      if (v === 4) return 'Contra 5 o 6 el crupier está débil: dos manos desde 4, que luego puedes doblar, rinden más que un 8.';
      return `El crupier no está fuerte: dos manos desde ${v} juegan mejor que un ${v * 2}.`;
    }
    if (v === 10 && action === 'stand') return '20 ya gana casi siempre: no lo rompas.';
    if (v === 9 && action === 'stand') {
      if (up === 7) return 'Tu 18 le gana a un probable 17.';
      return 'Contra 10 o As, dividir 9 empeora las cosas: quédate con 18.';
    }
    if (v === 5) {
      if (action === 'double') return 'Es un 10: dóblalo.';
      return 'Es un 10, pero contra 10 o As no conviene doblar: pide.';
    }
    if (v === 4) return 'Con 8 no te puedes pasar, y dividir 4 arma dos manos débiles: pide.';
    return 'Dividir aquí arma dos manos débiles contra carta fuerte: pide.';
  }
  if (category === 'soft') {
    if (action === 'double') return 'Con un As no te pasas al pedir una carta, y el crupier está débil: dobla.';
    if (action === 'hit') {
      if (total === 18) return '18 blando pierde seguido contra 9, 10 o As, y con un As no te pasas al pedir: pide.';
      return 'Con un As no te pasas al pedir una carta: pide para mejorar.';
    }
    if (total === 18) return '18 ya es buena mano contra esta carta: plántate.';
    return '19 o más ya es una mano ganadora: plántate.';
  }
  // Duras
  if (action === 'double') return `Con ${total} tienes buena base para 19–21: apuesta más cuando la ventaja es tuya.`;
  if (action === 'hit') {
    if (total <= 8) return 'Con 8 o menos no te puedes pasar: pide.';
    if (total <= 11) return `Con ${total} no te puedes pasar y contra esta carta no conviene doblar: pide.`;
    if (total === 12 && up <= 3) return '12 contra 2 o 3 sigue débil: pide, solo un 10 o una figura te pasa.';
    return `El crupier tiene carta fuerte y probablemente llegue a 17 o más: quedarte en ${total} pierde.`;
  }
  // Plantarse
  if (total >= 17) return 'Con 17 o más, pedir te pasa la mayoría de las veces: plántate.';
  return WEAK_TEXT;
}

const RULE_TEXT = {
  h17: 'En esta mesa el crupier pide con 17 blando (H17)',
  das: 'En esta mesa no puedes doblar después de dividir',
  surrender: 'En esta mesa no hay rendición',
};

function actionPhrase(action, label) {
  switch (action) {
    case 'double':
      return `sí se dobla ${label}`;
    case 'surrender':
      return `conviene rendirse con ${label}`;
    case 'split':
      return `se divide ${label}`;
    case 'stand':
      return `te plantas con ${label}`;
    default:
      return `se pide con ${label}`;
  }
}

// ---------- Decisión ----------

const AVILA_RULES = { h17: false, das: true, surrender: true };

function codeFor(rules, category, row, up) {
  const t = strategyTables(rules);
  const c = col(up);
  if (category === 'pair') return t.pair[row][c];
  if (category === 'soft') {
    if (row <= 12) return 'H';
    if (row >= 21) return 'S';
    return t.soft[row][c];
  }
  if (row <= 4) return t.hard[4][c];
  if (row >= 21) return 'S';
  return t.hard[row][c];
}

function resolve(code, av) {
  switch (code) {
    case 'H':
      return { action: 'hit' };
    case 'S':
      return { action: 'stand' };
    case 'D':
      return av.double ? { action: 'double' } : { action: 'hit', blocked: 'double' };
    case 'Ds':
      return av.double ? { action: 'double' } : { action: 'stand', blocked: 'double' };
    case 'P':
      return { action: 'split' };
    case 'Rh':
      return av.surrender ? { action: 'surrender' } : { action: 'hit' };
    case 'Rs':
      return av.surrender ? { action: 'surrender' } : { action: 'stand' };
    case 'Rp':
      return av.surrender ? { action: 'surrender' } : { action: 'split' };
    default:
      throw new Error(`Código desconocido: ${code}`);
  }
}

export function defaultAvailable(cards, rules, { fromSplit = false, handsCount = 1, firstDecision = true } = {}) {
  const two = cards.length === 2;
  return {
    hit: true,
    stand: true,
    double: two && (!fromSplit || !!rules.das),
    split: isPair(cards) && handsCount < 4,
    surrender: !!rules.surrender && two && !fromSplit && handsCount === 1 && firstDecision,
  };
}

/**
 * Mejor jugada disponible.
 * @param hand  arreglo de cartas o { cards, fromSplit, handsCount, firstDecision }
 * @param dealerUp carta visible del crupier (objeto, rango o valor 2..11)
 * @param rules { h17, das, surrender }
 * @param available { hit, stand, double, split, surrender } (opcional)
 * @returns { action, reason, category, key, code, label, ruleNote }
 */
export function bestAction(hand, dealerUp, rules, available) {
  const info = Array.isArray(hand) ? { cards: hand } : hand;
  const cards = info.cards;
  const fromSplit = !!info.fromSplit;
  const handsCount = info.handsCount ?? 1;
  const up = upValue(dealerUp);
  const av = available || defaultAvailable(cards, rules, { fromSplit, handsCount, firstDecision: info.firstDecision !== false });
  const { total, soft } = handTotal(cards);

  let category;
  let row;
  let prefix = '';
  if (isPair(cards) && av.split) {
    category = 'pair';
    row = cardValue(cards[0]);
  } else {
    if (isPair(cards)) {
      prefix = handsCount >= 4 ? 'Ya tienes 4 manos, no puedes dividir más. ' : 'No te alcanzan las fichas para dividir. ';
    }
    category = soft ? 'soft' : 'hard';
    row = total;
  }

  const code = codeFor(rules, category, row, up);
  const res = resolve(code, av);
  const action = res.action;

  if (res.blocked === 'double') {
    if (cards.length > 2) prefix += 'Con más de 2 cartas ya no puedes doblar. ';
    else if (fromSplit && !rules.das) prefix += 'En esta mesa no puedes doblar después de dividir. ';
    else prefix += 'No te alcanzan las fichas para doblar. ';
  }

  const label = situationLabel(category, row);
  const key = `${label} contra ${upLabel(up)}`;

  // ¿La jugada cambia por una regla de la mesa respecto de Mesa Ávila?
  let ruleNote = '';
  if (!res.blocked && action === PRIMARY[code]) {
    const baseAv = { ...av, surrender: av.surrender || (cards.length === 2 && !fromSplit && handsCount === 1 && info.firstDecision !== false) };
    const baseAction = resolve(codeFor(AVILA_RULES, category, row, up), baseAv).action;
    if (baseAction !== action) {
      let cause = 'surrender';
      const step1 = codeFor({ h17: rules.h17, das: true, surrender: true }, category, row, up);
      const step2 = codeFor({ h17: rules.h17, das: rules.das, surrender: true }, category, row, up);
      if (step1 !== codeFor(AVILA_RULES, category, row, up)) cause = 'h17';
      else if (step2 !== step1) cause = 'das';
      ruleNote = `${RULE_TEXT[cause]}, por eso aquí ${actionPhrase(action, label)} contra ${upLabel(up)}.`;
    }
  }

  const reason = ruleNote || prefix + reasonFor(category, row, up, action, total);
  const finalCategory = action === 'surrender' ? 'surrender' : category;
  return { action, reason, category: finalCategory, key, code, label, ruleNote };
}

export function insuranceAdvice(evenMoney = false) {
  return {
    action: 'no',
    reason: evenMoney
      ? 'Dinero parejo es lo mismo que el seguro: una apuesta aparte que pierde dinero a la larga si no cuentas cartas.'
      : 'El seguro es una apuesta aparte que pierde dinero a la larga si no cuentas cartas.',
    category: 'insurance',
    key: evenMoney ? 'Dinero parejo contra As' : 'Seguro contra As',
    code: 'N',
    label: evenMoney ? 'Dinero parejo' : 'Seguro',
    ruleNote: '',
  };
}

// Filas listas para mostrar en la pantalla Tabla.
export function chartRows(rules) {
  const t = strategyTables(rules);
  const hard = [
    { label: '5–8', codes: t.hard[8] },
    ...[9, 10, 11, 12, 13, 14, 15, 16, 17].map((n) => ({ label: String(n), codes: t.hard[n] })),
    { label: '18+', codes: t.hard[18] },
  ];
  const soft = [13, 14, 15, 16, 17, 18, 19, 20].map((n) => ({ label: `A,${n - 11}`, codes: t.soft[n] }));
  const pair = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => ({ label: n === 11 ? 'A,A' : `${n},${n}`, codes: t.pair[n] }));
  return { hard, soft, pair };
}
