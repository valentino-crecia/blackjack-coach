// Interfaz y estado de la app. La lógica del juego vive en engine.js y strategy.js.
import { TABLES, ECONOMY, STORAGE_KEY, TIMED, ACCURACY_WINDOW, BASE_TABLE_ID, tableById, rulesOf } from './config.js';
import {
  Shoe,
  Round,
  shadowRound,
  streakMultiplier,
  streakBonus,
  needsReload,
  applyReload,
  clampBet,
  maxBetFor,
  accuracyOf,
  unlockStatus,
  fmt,
  fmtMult,
  cryptoRandInt,
  RANKS,
  SUITS,
  abandonRound,
  isInProgress,
  closePendingHand,
  pushPracticeHand,
} from './engine.js';
import { bestAction, ACTION_LABEL, chartRows, handTotal, isPair, defaultAvailable } from './strategy.js';
import { createStore } from './storage.js';

// ---------- Estado persistente ----------

const CATS = ['hard', 'soft', 'pair', 'insurance', 'surrender'];
const CAT_LABEL = { hard: 'Duras', soft: 'Blandas', pair: 'Pares', insurance: 'Seguro', surrender: 'Rendición' };

function defaultState() {
  return {
    v: 1,
    chips: ECONOMY.startChips,
    reloads: 0,
    unlocked: [TABLES[0].id],
    tableId: TABLES[0].id,
    mode: 'practice',
    bet: 10,
    streak: 0,
    bestStreak: 0,
    practiceHands: [], // [{ c, t }] últimas 50 manos de Práctica
    decisions: 0,
    correct: 0,
    errorCost: 0,
    byCat: Object.fromEntries(CATS.map((c) => [c, { c: 0, t: 0 }])),
    misses: {},
    timedBest: {},
    pending: null, // mano en juego (apuesta ya cobrada) para cerrarla si se recarga la página
  };
}

const store = createStore(STORAGE_KEY, () => window.localStorage, showStorageWarning);

function loadState() {
  const base = defaultState();
  const saved = store.load();
  if (!saved || typeof saved !== 'object') return base;
  const s = { ...base, ...saved };
  s.byCat = { ...base.byCat, ...(saved.byCat || {}) };
  if (!Array.isArray(s.practiceHands)) s.practiceHands = [];
  if (!Array.isArray(s.unlocked) || !s.unlocked.length) s.unlocked = base.unlocked;
  if (!Number.isFinite(s.chips)) s.chips = base.chips;
  return s;
}

let S = loadState();
const save = () => store.save(S);

function showStorageWarning() {
  const el = document.getElementById('storage-warning');
  if (el) el.hidden = false;
  document.body.classList.add('no-storage');
}

// ---------- Estado de sesión ----------

const ui = {
  screen: 'home',
  game: null,
  timed: null,
  chartTable: S.tableId,
  modal: null,
  lockUntil: 0, // ignora toques repetidos mientras se reparten las cartas
};
const shoes = new Map();
function shoeFor(table) {
  if (!shoes.has(table.id)) shoes.set(table.id, new Shoe(table.decks));
  return shoes.get(table.id);
}

// ---------- Utilidades ----------

const $ = (sel) => document.querySelector(sel);
const plural = (n, one, many) => (n === 1 ? one : many);
const pctText = (p) => (p === null || p === undefined ? '—' : `${Math.floor(p)}%`);

function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}

function vibrate(ms) {
  try {
    const active = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (navigator.vibrate && active) navigator.vibrate(ms);
  } catch {
    /* sin vibración */
  }
}

// ---------- Cartas ----------

const SUIT_PATH = {
  S: 'M12 2.2C9.2 6 3.6 9.3 3.6 13.7c0 2.6 2 4.5 4.5 4.5 1.4 0 2.6-.6 3.3-1.6-.2 1.9-.9 3.4-2.5 5h6.2c-1.6-1.6-2.3-3.1-2.5-5 .7 1 1.9 1.6 3.3 1.6 2.5 0 4.5-1.9 4.5-4.5 0-4.4-5.6-7.7-8.4-11.5z',
  H: 'M12 21.3S3 15.6 3 9.3C3 6.3 5.3 4 8.1 4c1.7 0 3 .8 3.9 2.2C12.9 4.8 14.2 4 15.9 4 18.7 4 21 6.3 21 9.3c0 6.3-9 12-9 12z',
  D: 'M12 2l7.6 10L12 22 4.4 12z',
  C: 'M12 2.4a4.3 4.3 0 0 0-4.1 5.7 4.3 4.3 0 1 0 2.9 7.3c-.2 2.2-1 3.9-2.6 5.9h7.6c-1.6-2-2.4-3.7-2.6-5.9a4.3 4.3 0 1 0 2.9-7.3A4.3 4.3 0 0 0 12 2.4z',
};
const SUIT_NAME = { S: 'picas', H: 'corazones', D: 'diamantes', C: 'tréboles' };
const RANK_NAME = { A: 'As', J: 'J', Q: 'Q', K: 'K' };

const suitSvg = (s) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SUIT_PATH[s]}"/></svg>`;

function cardHtml(card, opts = {}) {
  const { hidden = false, anim = '', delay = 0 } = opts;
  const style = anim ? ` style="animation-delay:${delay}ms"` : '';
  if (hidden) return `<div class="card back ${anim}"${style} aria-label="Carta oculta"></div>`;
  const red = card.suit === 'H' || card.suit === 'D';
  const label = `${RANK_NAME[card.rank] || card.rank} de ${SUIT_NAME[card.suit]}`;
  return `<div class="card ${red ? 'red' : ''} ${anim}"${style} role="img" aria-label="${label}">
    <span class="c-rank">${card.rank}</span><span class="c-suit">${suitSvg(card.suit)}</span>
    <span class="c-pip">${suitSvg(card.suit)}</span>
  </div>`;
}

const DEAL_STEP = 180; // ms entre carta y carta

// Anima solo las cartas nuevas de la ronda, una detrás de otra.
function makeAnimator(seen) {
  let n = 0;
  return {
    card(card, opts = {}) {
      const key = String(card.id) + (opts.hidden ? 'h' : '');
      let anim = '';
      let delay = 0;
      if (!seen.has(key)) {
        anim = !opts.hidden && seen.has(card.id + 'h') ? 'reveal' : 'deal';
        seen.add(key);
        delay = n++ * DEAL_STEP;
      }
      return cardHtml(card, { ...opts, anim, delay });
    },
    get last() {
      return n ? (n - 1) * DEAL_STEP + 360 : 0;
    },
  };
}

// ---------- Topbar ----------

function renderTopbar() {
  const acc = accuracyOf(S.practiceHands);
  const mult = streakMultiplier(S.streak);
  const back =
    ui.screen === 'home'
      ? `<div class="brand"><span class="brand-mark" aria-hidden="true">21</span><span>Blackjack Coach</span></div>`
      : `<button class="icon-btn" data-on="home" aria-label="Volver al inicio"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  $('#topbar').innerHTML = `
    ${back}
    <div class="pills">
      <div class="pill" title="Fichas"><span class="pill-k">Fichas</span><b><span class="chip-dot" aria-hidden="true"></span>${fmt(S.chips)}</b></div>
      <div class="pill" title="Precisión en tus últimas ${ACCURACY_WINDOW} manos de Práctica"><span class="pill-k">Precisión</span><b>${pctText(acc.pct)}</b></div>
      <div class="pill ${mult > 1 ? 'hot' : ''}" title="Racha actual y multiplicador"><span class="pill-k">Racha</span><b>${S.streak}<span class="mult">${fmtMult(mult)}</span></b></div>
    </div>
    ${ui.screen === 'stats' ? '<span class="icon-spacer" aria-hidden="true"></span>' : `<button class="icon-btn" data-on="stats" aria-label="Estadísticas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11M12 20V4M19 20v-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>`}
  `;
}

// ---------- Inicio ----------

const MODES = [
  { id: 'guide', name: 'Guía', desc: 'Te mostramos la jugada correcta y por qué, antes de que decidas. No cuenta para tu precisión.' },
  { id: 'practice', name: 'Práctica', desc: 'Juegas libre. Si te equivocas, te decimos qué era lo correcto. Cuenta para desbloquear mesas.' },
  { id: 'timed', name: 'Contrarreloj', desc: `${TIMED.seconds} segundos de situaciones sueltas. Acierta rápido y encadena rachas.` },
  { id: 'chart', name: 'Tabla', desc: 'La estrategia completa de la mesa, con colores.' },
];
const MODE_ICON = {
  guide: '<path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3zM9.5 20h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  practice: '<rect x="4" y="5" width="10" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 7.5l4.6 1.4a1.6 1.6 0 0 1 1 2l-2.6 8.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  timed: '<circle cx="12" cy="13" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l2.5 2M9.5 2.8h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  chart: '<rect x="3.5" y="4" width="17" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 9.5h17M3.5 15h17M9 4v16M14.5 4v16" stroke="currentColor" stroke-width="1.6"/>',
};

function rulesLine(t) {
  return [`${t.decks} mazos`, t.h17 ? 'H17' : 'S17', t.das ? 'DAS' : 'Sin DAS', t.surrender ? 'Rendición' : 'Sin rendición'];
}

function viewHome() {
  const mode = MODES.find((m) => m.id === S.mode) || MODES[1];
  const reload = needsReload(S.chips)
    ? `<div class="reload-card"><div><b>Te quedaste sin fichas</b><span>Recarga para seguir practicando.</span></div><button class="btn gold" data-on="reload">Recargar 1.000</button></div>`
    : '';
  const tables = TABLES.map((t) => {
    const open = S.unlocked.includes(t.id);
    const st = unlockStatus(t, S.chips, S.practiceHands);
    let foot;
    if (open) {
      const extra = S.mode === 'timed' ? `Récord: ${fmtScore(S.timedBest[t.id] || 0)}` : `Apuesta ${t.minBet}–${t.maxBet}`;
      foot = `<span class="t-state ok">Abierta</span><span class="t-extra">${extra}</span>`;
    } else {
      const chipsPct = Math.min(100, (S.chips / t.unlock.chips) * 100);
      const acc = accuracyOf(S.practiceHands);
      const accPct = acc.hands < ACCURACY_WINDOW ? (acc.hands / ACCURACY_WINDOW) * 100 : Math.min(100, ((acc.pct || 0) / t.unlock.accuracy) * 100);
      foot = `<span class="t-state lock"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>${st.text}</span>
        <span class="t-bars"><i style="--p:${chipsPct}%"></i><i style="--p:${accPct}%"></i></span>
        <span class="t-need">Necesitas ${fmt(t.unlock.chips)} fichas y ${t.unlock.accuracy}% de precisión</span>`;
    }
    return `<li><button class="table-card t-${t.id} ${open ? '' : 'locked'}" data-on="table" data-arg="${t.id}" ${open ? '' : 'aria-disabled="true"'}>
      <span class="t-name">${t.name}</span>
      <span class="t-rules">${rulesLine(t).map((r) => `<em>${r}</em>`).join('')}</span>
      <span class="t-foot">${foot}</span>
    </button></li>`;
  }).join('');

  return `<section class="home">
    <div class="hero">
      <div class="hero-cards" aria-hidden="true">${cardHtml({ rank: 'A', suit: 'S' })}${cardHtml({ rank: 'K', suit: 'H' })}</div>
      <div><h1>Aprende a jugar perfecto</h1><p>Estrategia básica de blackjack, mano a mano. Funciona sin conexión.</p></div>
    </div>
    ${reload}
    <h2 class="sec">Elige cómo jugar</h2>
    <div class="modes" role="radiogroup" aria-label="Modo de juego">
      ${MODES.map((m) => `<button class="mode ${m.id === S.mode ? 'on' : ''}" role="radio" aria-checked="${m.id === S.mode}" data-on="mode" data-arg="${m.id}"><svg viewBox="0 0 24 24" aria-hidden="true">${MODE_ICON[m.id]}</svg><span>${m.name}</span></button>`).join('')}
    </div>
    <p class="mode-desc">${mode.desc}</p>
    <h2 class="sec">Elige mesa</h2>
    <ul class="tables">${tables}</ul>
    <button class="link-btn" data-on="stats">Ver estadísticas</button>
  </section>`;
}

function fmtScore(n) {
  return fmt(Math.round(n));
}

// ---------- Juego (Guía y Práctica) ----------

function startGame(table, mode) {
  ui.game = { table, mode, round: null, decisions: [], feedback: null, end: null, seen: new Set(), shadowStart: null };
  S.bet = clampBet(S.bet, S.chips, table) || table.minBet;
  ui.screen = 'play';
}

function deal() {
  const g = ui.game;
  const t = g.table;
  if (needsReload(S.chips)) return;
  const bet = clampBet(S.bet, S.chips, t);
  if (!bet) return;
  S.bet = bet;
  const shoe = shoeFor(t);
  let shuffled = false;
  if (shoe.needsShuffle()) {
    shoe.shuffle();
    shuffled = true;
  }
  g.shadowStart = g.mode === 'practice' ? shoe.clone() : null;
  // La apuesta se cobra al repartir, como en un casino.
  g.chipsStart = S.chips;
  g.round = new Round({ shoe, rules: rulesOf(t), bet, bankroll: S.chips }).deal();
  g.decisions = [];
  g.feedback = null;
  g.end = null;
  g.seen = new Set();
  if (shuffled) toast('Se barajó el zapato');
  afterAction();
}

function decide(action) {
  const g = ui.game;
  const r = g.round;
  if (!r || (r.phase !== 'player' && r.phase !== 'insurance')) return;
  const adv = r.advice();
  let d;
  if (r.phase === 'insurance') {
    const take = action === 'yes';
    if (take && !r.canAffordInsurance()) return;
    d = { key: adv.key, category: 'insurance', action: take ? 'insurance' : 'no', best: 'no', correct: !take, reason: adv.reason };
    r.insurance(take);
  } else {
    if (!r.available()[action]) return;
    d = { key: adv.key, category: adv.category, action, best: adv.action, correct: action === adv.action, reason: adv.reason };
    r.act(action);
  }
  g.decisions.push(d);
  if (g.mode === 'practice') {
    recordDecision(d);
    if (d.correct) {
      S.streak++;
      S.bestStreak = Math.max(S.bestStreak, S.streak);
      g.feedback = { type: 'ok', text: `Correcto · racha ${S.streak}` };
    } else {
      S.streak = 0;
      g.feedback = { type: 'error', title: `Lo correcto era ${bestLabel(d.best)}`, text: d.reason };
      vibrate(40);
    }
  }
  afterAction();
}

function recordDecision(d) {
  S.decisions++;
  const cat = S.byCat[d.category] || (S.byCat[d.category] = { c: 0, t: 0 });
  cat.t++;
  if (d.correct) {
    S.correct++;
    cat.c++;
  } else {
    S.misses[d.key] = (S.misses[d.key] || 0) + 1;
  }
}

function bestLabel(action) {
  return action === 'no' ? 'No tomar el seguro' : ACTION_LABEL[action];
}

// Mientras la mano está en juego, lo apostado ya salió de tus fichas y queda guardado
// como mano pendiente: recargar la página no es una salida gratis.
function syncStake() {
  const g = ui.game;
  const r = g && g.round;
  if (!isInProgress(r)) return;
  S.chips = g.chipsStart - r.committed();
  S.pending = {
    tableId: g.table.id,
    practice: g.mode === 'practice',
    staked: r.committed(),
    c: g.decisions.filter((d) => d.correct).length,
    t: g.decisions.length,
  };
}

function afterAction() {
  const g = ui.game;
  if (g.round && g.round.phase === 'done' && !g.end) settle();
  else syncStake();
  save();
  render();
  // Evita que un doble toque juegue una decisión en la mano siguiente.
  ui.lockUntil = performance.now() + Math.max(400, ui.animMs || 0);
}

function handInProgress() {
  return ui.screen === 'play' && ui.game && isInProgress(ui.game.round);
}

// Sales a mitad de mano: pierdes lo apostado y las decisiones tomadas cuentan.
function abandonHand() {
  const g = ui.game;
  if (!g || !isInProgress(g.round)) return;
  syncStake();
  abandonRound(g.round);
  const p = S.pending;
  closePendingHand(S);
  g.round = null;
  g.end = null;
  save();
  if (p && p.staked) toast(`Abandonaste la mano: perdiste ${fmt(p.staked)} fichas`);
}

const PAST = { hit: 'Pediste', stand: 'Te plantaste', double: 'Doblaste', split: 'Dividiste', surrender: 'Te rendiste', insurance: 'Tomaste el seguro' };
const INF = { hit: 'pedir', stand: 'plantarte', double: 'doblar', split: 'dividir', surrender: 'rendirte', no: 'no tomar el seguro' };
const netPast = (n) => (n > 0 ? `ganaste ${fmt(n)}` : n < 0 ? `perdiste ${fmt(-n)}` : 'empataste');
const netInf = (n) => (n > 0 ? `ganar ${fmt(n)}` : n < 0 ? `perder ${fmt(-n)}` : 'empatar');

function dealerPhrase(r) {
  if (r.hands.every((h) => h.surrendered)) return '';
  if (r.hands.every((h) => h.busted || h.surrendered)) return 'te pasaste';
  if (r.dealerBlackjack) return 'el crupier tenía blackjack';
  if (r.dealerBust) return `el crupier se pasó con ${r.dealerTotal}`;
  return `el crupier sacó ${r.dealerTotal}`;
}

function costText(table, r, sh, errors, cost) {
  const first = errors[0];
  const dp = dealerPhrase(r);
  let s = `${first.key} en ${table.name}. ${PAST[first.action]}${dp ? `, ${dp}` : ''} y ${netPast(r.net)}. Lo perfecto era ${INF[first.best]} y ${netInf(sh.net)}. `;
  if (cost > 0) s += errors.length === 1 ? `Ese error te costó ${fmt(cost)} fichas.` : `Tus ${errors.length} errores te costaron ${fmt(cost)} fichas.`;
  else if (cost === 0) s += errors.length === 1 ? 'Esta vez el error no cambió el resultado, pero a la larga sí cuesta.' : 'Esta vez los errores no cambiaron el resultado, pero a la larga sí cuestan.';
  else s += `Esta vez ${errors.length === 1 ? 'tu error te hizo' : 'tus errores te hicieron'} ganar ${fmt(-cost)} fichas. Fue suerte: a la larga, jugar perfecto pierde menos.`;
  return s;
}

function settle() {
  const g = ui.game;
  const r = g.round;
  const end = { net: r.net, bonus: 0, cost: null };
  if (g.mode === 'practice') {
    const t = g.decisions.length;
    // El bono premia jugar bien: un blackjack natural sin decisiones no lo da.
    if (t > 0) end.bonus = streakBonus(r.net, streakMultiplier(S.streak));
    const c = g.decisions.filter((d) => d.correct).length;
    S.practiceHands = pushPracticeHand(S.practiceHands, { c, t });
    const errors = g.decisions.filter((d) => !d.correct);
    if (errors.length) {
      const sh = shadowRound({ shoe: g.shadowStart, rules: rulesOf(g.table), bet: r.bet, bankroll: r.bankroll });
      const cost = sh.net - r.net;
      S.errorCost += cost;
      end.cost = { value: cost, text: costText(g.table, r, sh, errors, cost) };
    }
  }
  S.chips = g.chipsStart + r.net + end.bonus;
  S.pending = null;
  g.end = end;
  if (g.mode === 'practice') checkUnlocks();
  if (r.net > 0) vibrate(20);
}

function checkUnlocks() {
  for (const t of TABLES) {
    if (S.unlocked.includes(t.id)) continue;
    if (unlockStatus(t, S.chips, S.practiceHands).ok) {
      S.unlocked.push(t.id);
      toast(`¡Desbloqueaste ${t.name}!`, 3500);
    }
  }
}

const OUTCOME = {
  blackjack: ['Blackjack', 'win'],
  win: ['Gana', 'win'],
  lose: ['Pierde', 'lose'],
  push: ['Empate', 'push'],
  bust: ['Te pasaste', 'lose'],
  surrender: ['Rendida', 'push'],
  'dealer-blackjack': ['Pierde', 'lose'],
};

function feltArc(table) {
  const rule = table.h17 ? 'EL CRUPIER PIDE CON 17 BLANDO' : 'EL CRUPIER SE PLANTA EN 17 BLANDO';
  return `<svg class="arc" viewBox="0 0 360 130" aria-hidden="true">
    <defs>
      <path id="arc-a" d="M40,14 Q180,84 320,14"/>
      <path id="arc-b" d="M14,36 Q180,128 346,36"/>
      <path id="arc-c" d="M80,70 Q180,124 280,70"/>
    </defs>
    <text class="arc-small"><textPath href="#arc-a" startOffset="50%" text-anchor="middle">${rule}</textPath></text>
    <text class="arc-big"><textPath href="#arc-b" startOffset="50%" text-anchor="middle">BLACKJACK PAGA 3 A 2</textPath></text>
    <text class="arc-small"><textPath href="#arc-c" startOffset="50%" text-anchor="middle">EL SEGURO PAGA 2 A 1</textPath></text>
  </svg>`;
}

function upText(card) {
  return card.rank === 'A' ? 'A' : String(handTotal([card]).total);
}

function totalBadge(cards, extra = '', live = false) {
  const { total, soft } = handTotal(cards);
  const txt = live && soft && total < 21 ? `${total - 10}/${total}` : String(total);
  return `<span class="total ${extra} ${total > 21 ? 'bust' : ''}">${txt}</span>`;
}

// Ancho de carta (px) y espacio máximo para las cartas de cada mano según cuántas manos hay.
// Calculado para que 4 manos quepan completas a 360 px.
const HAND_LAYOUT = {
  1: { w: 62, budget: 220 },
  2: { w: 52, budget: 130 },
  3: { w: 40, budget: 88 },
  4: { w: 34, budget: 64 },
};

function viewPlay() {
  const g = ui.game;
  const t = g.table;
  const r = g.round;
  const anim = makeAnimator(g.seen);
  const modeName = g.mode === 'guide' ? 'Guía' : 'Práctica';

  let dealerHtml = '<div class="cards empty"><div class="card ghost"></div><div class="card ghost"></div></div>';
  let playerHtml = '<div class="hands"><div class="hand"><div class="cards empty"><div class="card ghost"></div><div class="card ghost"></div></div></div></div>';
  let centerHtml = '';
  if (r) {
    const hideHole = r.phase === 'insurance' || r.phase === 'player';
    // Orden de animación: como se reparte.
    const p = r.hands[0].cards;
    const dealt = [];
    if (!g.seen.size) {
      // primera vez: jugador, crupier, jugador, crupier
      dealt.push(['p0', p[0]], ['d0', r.dealer[0]], ['p1', p[1]], ['d1', r.dealer[1]]);
    }
    const pre = {};
    for (const [k, c] of dealt) pre[k] = k === 'd1' && hideHole ? anim.card(c, { hidden: true }) : anim.card(c);
    const dCards = r.dealer
      .map((c, i) => {
        if (i === 0 && pre.d0) return pre.d0;
        if (i === 1 && pre.d1) return pre.d1;
        if (i === 1 && hideHole) return anim.card(c, { hidden: true });
        return anim.card(c);
      })
      .join('');
    const shownDealer = hideHole ? [r.dealer[0]] : r.dealer;
    dealerHtml = `<div class="cards">${dCards}</div>${hideHole ? `<span class="total dealer-total">${upText(r.dealer[0])}</span>` : totalBadge(shownDealer, 'dealer-total')}`;

    const nh = r.hands.length;
    const layout = HAND_LAYOUT[nh] || HAND_LAYOUT[4];
    playerHtml = `<div class="hands n${nh}">${r.hands
      .map((h, hi) => {
        const cards = h.cards
          .map((c, ci) => {
            if (hi === 0 && r.hands.length === 1 && ci < 2 && pre[`p${ci}`]) return pre[`p${ci}`];
            return anim.card(c);
          })
          .join('');
        const active = r.phase === 'player' && hi === r.active && r.hands.length > 1;
        const out = r.phase === 'done' && h.outcome ? OUTCOME[h.outcome] : null;
        // Solapa más las cartas cuando hay varias manos, para que todas quepan completas.
        const k = h.cards.length;
        const step = k > 1 ? Math.min(layout.w * 0.58, (layout.budget - layout.w) / (k - 1)) : 0;
        return `<div class="hand ${active ? 'active' : ''} ${h.done && r.phase === 'player' ? 'dim' : ''}">
          <div class="cards" style="--step:${step.toFixed(1)}px">${cards}</div>
          <div class="hand-meta">${totalBadge(h.cards, '', r.phase === 'player' && !h.done)}<span class="bet-chip" title="${h.doubled ? 'Apuesta doblada' : 'Apuesta'}">${fmt(h.bet)}</span></div>
          <span class="outcome-slot">${out ? `<span class="outcome ${out[1]}" style="animation-delay:${anim.last}ms">${out[0]}</span>` : ''}</span>
        </div>`;
      })
      .join('')}</div>`;

    if (r.phase === 'done' && g.end) {
      const n = g.end.net;
      const cls = n > 0 ? 'win' : n < 0 ? 'lose' : 'push';
      let title = n > 0 ? 'Ganaste' : n < 0 ? 'Perdiste' : 'Empate';
      if (r.playerBlackjack && !r.dealerBlackjack) title = 'Blackjack';
      else if (r.dealerBlackjack && !r.playerBlackjack) title = 'Blackjack del crupier';
      const ins = r.insuranceTaken ? `<small>Seguro ${r.insuranceNet > 0 ? '+' : '−'}${fmt(Math.abs(r.insuranceNet))}</small>` : '';
      centerHtml = `<div class="result ${cls}" style="animation-delay:${anim.last}ms">
        <span class="r-title">${title}</span><span class="r-net">${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}</span>${ins}
        ${g.end.bonus ? `<span class="r-bonus">+${fmt(g.end.bonus)} bono de racha</span>` : ''}
      </div>`;
    }
  }

  ui.animMs = anim.last;
  return `<section class="play">
    <div class="felt t-${t.id}">
      ${feltArc(t)}
      <div class="table-tag">${t.name} · ${modeName}</div>
      <div class="dealer-area" aria-label="Crupier">${dealerHtml}</div>
      <div class="center">${centerHtml}</div>
      <div class="player-area" aria-label="Tus manos">${playerHtml}</div>
    </div>
    <div class="coach" aria-live="polite">${coachHtml()}</div>
    <div class="controls">${controlsHtml()}</div>
  </section>`;
}

function coachHtml() {
  const g = ui.game;
  const r = g.round;
  if (!r) {
    return g.mode === 'guide'
      ? `<div class="hint neutral"><b>Modo Guía</b><span>Antes de cada jugada te marcamos la correcta y por qué.</span></div>`
      : `<div class="hint neutral"><b>Modo Práctica</b><span>Juega como quieras. Si te equivocas, te decimos qué era lo correcto.</span></div>`;
  }
  if (g.mode === 'guide' && (r.phase === 'player' || r.phase === 'insurance')) {
    const adv = r.advice();
    return `<div class="hint guide"><b>Mejor jugada: ${bestLabel(adv.action)}</b><span>${adv.reason}</span></div>`;
  }
  let html = '';
  let fb = g.feedback;
  if (r.phase === 'done') {
    const err = g.decisions.find((d) => !d.correct);
    if (err && g.mode === 'practice') fb = { type: 'error', title: `Lo correcto era ${bestLabel(err.best)}`, text: err.reason };
  }
  if (fb && fb.type === 'error') html += `<div class="hint error"><b>${fb.title}</b><span>${fb.text}</span></div>`;
  else if (fb && fb.type === 'ok' && r.phase !== 'done') html += `<div class="hint ok"><b>${fb.text}</b></div>`;
  if (r.phase === 'done' && g.end && g.end.cost) {
    const c = g.end.cost;
    html += `<div class="cost ${c.value > 0 ? 'bad' : c.value < 0 ? 'luck' : ''}">
      <p>${c.text}</p>
      <details><summary>¿Cómo se calcula?</summary>${HOW_COST}</details>
    </div>`;
  }
  if (!html && r.phase === 'done' && g.mode === 'practice' && g.decisions.length) {
    html = `<div class="hint ok"><b>Mano perfecta</b><span>Todas tus decisiones fueron correctas.</span></div>`;
  }
  if (!html && r.phase === 'player' && g.mode === 'practice') html = `<div class="hint neutral"><span>Tu turno: ¿qué haces con ${handTotal(r.activeHand.cards).total}?</span></div>`;
  return html;
}

const HOW_COST = `<p>Al empezar cada mano copiamos el zapato. Una mano sombra juega perfecto con tu misma apuesta y saca las cartas del mismo zapato, en el mismo orden (el crupier puede sacar otras si la sombra pide más o menos). Si te equivocaste, sumamos la diferencia entre lo que hizo la sombra y lo que hiciste tú. No cuenta bonos ni recargas.</p>
<p class="ex">Ejemplo: 16 contra 10 en Mesa Ávila. Te plantaste, el crupier sacó 20 y perdiste 10. Lo perfecto era rendirte y perder 5. Ese error te costó 5 fichas.</p>`;

const ACT_ORDER_TOP = ['double', 'split', 'surrender'];
const ACT_ORDER_BOTTOM = ['hit', 'stand'];

// En mesas sin rendición el botón Rendirse no aparece (quedan 4 botones).
function actionButtons(av, highlight, table, onName = 'act', disabledAll = false) {
  const btn = (a) =>
    `<button class="act act-${a} ${highlight === a ? 'recommended' : ''}" data-on="${onName}" data-arg="${a}" ${!av[a] || disabledAll ? 'disabled' : ''}>${ACTION_LABEL[a]}</button>`;
  const top = ACT_ORDER_TOP.filter((a) => a !== 'surrender' || table.surrender);
  return `<div class="actions"><div class="row3 n${top.length}">${top.map(btn).join('')}</div><div class="row2">${ACT_ORDER_BOTTOM.map(btn).join('')}</div></div>`;
}

function controlsHtml() {
  const g = ui.game;
  const r = g.round;
  if (r && r.phase === 'insurance') {
    const em = r.evenMoney;
    const rec = g.mode === 'guide' ? 'no' : '';
    return `<div class="insurance">
      <div class="ins-q"><b>${em ? '¿Dinero parejo?' : '¿Seguro?'}</b><span>${em ? 'Cobras 1 a 1 ahora en vez de arriesgar tu blackjack.' : `Cuesta ${fmt(r.bet / 2)} y paga 2 a 1 si el crupier tiene blackjack.`}</span></div>
      <div class="ins-btns">
        <button class="act act-no ${rec === 'no' ? 'recommended' : ''}" data-on="act" data-arg="no">No</button>
        <button class="act act-yes" data-on="act" data-arg="yes" ${r.canAffordInsurance() ? '' : 'disabled'}>Sí</button>
      </div>
    </div>`;
  }
  if (r && r.phase === 'player') {
    const hl = g.mode === 'guide' ? r.advice().action : null;
    return actionButtons(r.available(), hl, g.table);
  }
  // Apuesta (antes de repartir o al terminar la mano)
  const t = g.table;
  if (needsReload(S.chips)) {
    return `<div class="reload-card in-game"><div><b>Te quedaste sin fichas</b><span>Recarga para seguir practicando.</span></div><button class="btn gold" data-on="reload">Recargar 1.000</button></div>`;
  }
  const max = maxBetFor(S.chips, t);
  const bet = clampBet(S.bet, S.chips, t);
  return `<div class="betbar">
    <div class="bet-ctl">
      <button class="round-btn" data-on="bet" data-arg="-10" ${bet <= t.minBet ? 'disabled' : ''} aria-label="Bajar apuesta">−</button>
      <div class="bet-amount"><span class="chip-big" aria-hidden="true"></span><b>${fmt(bet)}</b><small>Apuesta ${t.minBet}–${max}</small></div>
      <button class="round-btn" data-on="bet" data-arg="10" ${bet >= max ? 'disabled' : ''} aria-label="Subir apuesta">+</button>
    </div>
    <button class="btn gold deal" data-on="deal">${r ? 'Otra mano' : 'Repartir'}</button>
  </div>`;
}

// ---------- Contrarreloj ----------

function startTimed(table) {
  ui.timed = { table, running: false, finished: false, score: 0, hits: 0, misses: 0, streak: 0, best: 0, cur: null, flash: null, lock: false, endAt: 0, newRecord: false };
  ui.screen = 'timed';
}

function randomCard() {
  return { rank: RANKS[cryptoRandInt(13)], suit: SUITS[cryptoRandInt(4)], id: cryptoRandInt(1e9) };
}

function randomSituation() {
  for (;;) {
    const cards = [randomCard(), randomCard()];
    const up = randomCard();
    const { total, soft } = handTotal(cards);
    const pair = isPair(cards);
    if (total === 21) continue; // blackjack: no hay decisión
    if (!soft && !pair && total >= 18) continue; // siempre plantarse: muy fácil
    if (!soft && !pair && total <= 7 && cryptoRandInt(10) < 6) continue;
    return { cards, up, seen: new Set() };
  }
}

function timedStart() {
  const T = ui.timed;
  Object.assign(T, { running: true, finished: false, score: 0, hits: 0, misses: 0, streak: 0, best: 0, flash: null, lock: false, newRecord: false });
  T.cur = randomSituation();
  T.endAt = Date.now() + TIMED.seconds * 1000;
  clearInterval(T.timer);
  T.timer = setInterval(timedTick, 100);
  render();
}

function timedTick() {
  const T = ui.timed;
  if (!T || !T.running) return;
  const left = Math.max(0, T.endAt - Date.now());
  const bar = document.getElementById('timer-fill');
  const txt = document.getElementById('timer-txt');
  if (bar) bar.style.transform = `scaleX(${left / (TIMED.seconds * 1000)})`;
  if (txt) txt.textContent = `${Math.ceil(left / 1000)} s`;
  if (bar) bar.parentElement.classList.toggle('low', left < 10000);
  if (left <= 0) timedEnd();
}

function timedEnd() {
  const T = ui.timed;
  clearInterval(T.timer);
  T.running = false;
  T.finished = true;
  const id = T.table.id;
  T.score = Math.round(T.score);
  if (T.score > (S.timedBest[id] || 0)) {
    S.timedBest[id] = T.score;
    T.newRecord = T.score > 0;
  }
  save();
  render();
}

function timedAnswer(action) {
  const T = ui.timed;
  if (!T || !T.running || T.lock) return;
  const rules = rulesOf(T.table);
  const av = defaultAvailable(T.cur.cards, rules);
  if (!av[action]) return;
  const adv = bestAction(T.cur.cards, T.cur.up, rules, av);
  const correct = action === adv.action;
  if (correct) {
    T.streak++;
    T.best = Math.max(T.best, T.streak);
    T.hits++;
    T.score += streakMultiplier(T.streak);
  } else {
    T.streak = 0;
    T.misses++;
    vibrate(40);
  }
  recordDecision({ key: adv.key, category: adv.category, correct });
  T.flash = { correct, best: adv.action, reason: adv.reason, picked: action };
  T.lock = true;
  save();
  render();
  setTimeout(
    () => {
      if (!ui.timed || ui.timed !== T) return;
      T.lock = false;
      T.flash = null;
      if (T.running) {
        T.cur = randomSituation();
        render();
      }
    },
    correct ? 450 : 1400,
  );
}

function viewTimed() {
  const T = ui.timed;
  const t = T.table;
  const record = S.timedBest[t.id] || 0;
  if (!T.running && !T.finished) {
    return `<section class="timed intro">
      <div class="panel">
        <span class="kicker">Contrarreloj · ${t.name}</span>
        <h1>${TIMED.seconds} segundos</h1>
        <p>Te mostramos tu mano y la carta del crupier. Toca la jugada correcta lo más rápido que puedas. Cada acierto suma según tu multiplicador de racha.</p>
        <ul class="rules-list">${rulesLine(t).map((r) => `<li>${r}</li>`).join('')}</ul>
        <p class="record">Récord en esta mesa: <b>${fmtScore(record)}</b></p>
        <button class="btn gold big" data-on="timed-start">Empezar</button>
      </div>
    </section>`;
  }
  if (T.finished) {
    const total = T.hits + T.misses;
    return `<section class="timed intro">
      <div class="panel">
        <span class="kicker">Contrarreloj · ${t.name}</span>
        <h1>${T.newRecord ? '¡Nuevo récord!' : 'Se acabó el tiempo'}</h1>
        <div class="score-big">${fmtScore(T.score)}<small>puntos</small></div>
        <div class="kv"><span>Aciertos</span><b>${T.hits} de ${total}</b></div>
        <div class="kv"><span>Mejor racha</span><b>${T.best}</b></div>
        <div class="kv"><span>Récord en esta mesa</span><b>${fmtScore(S.timedBest[t.id] || 0)}</b></div>
        <button class="btn gold big" data-on="timed-start">Otra vez</button>
        <button class="link-btn" data-on="home">Volver al inicio</button>
      </div>
    </section>`;
  }
  const left = Math.max(0, T.endAt - Date.now());
  const mult = streakMultiplier(T.streak);
  const anim = makeAnimator(T.cur.seen);
  const f = T.flash;
  const av = defaultAvailable(T.cur.cards, rulesOf(t));
  return `<section class="timed running">
    <div class="timer ${left < 10000 ? 'low' : ''}"><i id="timer-fill" style="transform:scaleX(${left / (TIMED.seconds * 1000)})"></i></div>
    <div class="timed-stats">
      <div><span>Tiempo</span><b id="timer-txt">${Math.ceil(left / 1000)} s</b></div>
      <div><span>Puntos</span><b>${fmtScore(T.score)}</b></div>
      <div class="${mult > 1 ? 'hot' : ''}"><span>Racha</span><b>${T.streak} <em>${fmtMult(mult)}</em></b></div>
    </div>
    <div class="felt compact t-${t.id} ${f ? (f.correct ? 'flash-ok' : 'flash-bad') : ''}">
      <div class="table-tag">${t.name}</div>
      <div class="dealer-area">${`<div class="cards">${anim.card(T.cur.up)}${cardHtml(T.cur.up, { hidden: true })}</div>`}<span class="total dealer-total">${upText(T.cur.up)}</span></div>
      <div class="center">${f ? `<div class="flash-msg ${f.correct ? 'ok' : 'bad'}">${f.correct ? '¡Bien!' : `Era ${bestLabel(f.best)}`}</div>` : ''}</div>
      <div class="player-area"><div class="hands"><div class="hand"><div class="cards">${T.cur.cards.map((c) => anim.card(c)).join('')}</div><div class="hand-meta">${totalBadge(T.cur.cards, '', true)}</div></div></div></div>
    </div>
    <div class="coach">${f && !f.correct ? `<div class="hint error"><b>Lo correcto era ${bestLabel(f.best)}</b><span>${f.reason}</span></div>` : ''}</div>
    <div class="controls">${actionButtons(av, f ? f.best : null, t, 'timed-act', !!f)}</div>
  </section>`;
}

// ---------- Tabla ----------

const CODE_SHORT = { H: 'P', S: 'Pl', D: 'D', Ds: 'Dp', P: 'Di', Rh: 'R', Rs: 'Rp', Rp: 'Rd' };
const LEGEND = [
  ['H', 'Pedir'],
  ['S', 'Plantarse'],
  ['D', 'Doblar; si no puedes, pedir'],
  ['Ds', 'Doblar; si no puedes, plantarse'],
  ['P', 'Dividir'],
  ['Rh', 'Rendirse; si no puedes, pedir'],
  ['Rs', 'Rendirse; si no puedes, plantarse'],
  ['Rp', 'Rendirse; si no puedes, dividir'],
];

function chartTableHtml(title, rows, baseRows) {
  const head = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'].map((h) => `<th scope="col">${h}</th>`).join('');
  const body = rows
    .map((row, ri) => {
      const cells = row.codes
        .map((c, ci) => {
          const diff = baseRows && baseRows[ri].codes[ci] !== c;
          return `<td class="cc c-${c} ${diff ? 'diff' : ''}" title="${LEGEND.find((l) => l[0] === c)[1]}">${CODE_SHORT[c]}</td>`;
        })
        .join('');
      return `<tr><th scope="row">${row.label}</th>${cells}</tr>`;
    })
    .join('');
  return `<h3 class="chart-title">${title}</h3>
  <div class="chart-wrap"><table class="chart"><thead><tr><th class="corner">Tú \\ Crupier</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function viewChart() {
  const t = tableById(ui.chartTable);
  const rows = chartRows(rulesOf(t));
  const base = t.id === BASE_TABLE_ID ? null : chartRows(rulesOf(tableById(BASE_TABLE_ID)));
  const tabs = TABLES.map((x) => `<button class="tab ${x.id === t.id ? 'on' : ''}" data-on="chart-table" data-arg="${x.id}" aria-pressed="${x.id === t.id}">${x.name.replace('Mesa ', '')}</button>`).join('');
  return `<section class="chart-screen">
    <div class="tabs" role="group" aria-label="Mesa">${tabs}</div>
    <p class="chart-rules">${rulesLine(t).join(' · ')}${base ? ' · <span class="dot-note"><i></i> cambia respecto de Mesa Ávila</span>' : ''}</p>
    ${chartTableHtml('Manos duras', rows.hard, base && base.hard)}
    ${chartTableHtml('Manos blandas (con As)', rows.soft, base && base.soft)}
    ${chartTableHtml('Pares', rows.pair, base && base.pair)}
    <div class="legend">${LEGEND.filter(([c]) => t.surrender || !c.startsWith('R'))
      .map(([c, l]) => `<div><span class="cc c-${c}">${CODE_SHORT[c]}</span>${l}</div>`)
      .join('')}</div>
    <p class="chart-foot">Con 3 cartas o más ya no se puede doblar ni rendirse: usa la jugada de respaldo. Un par que ya no puedes dividir se juega por su total.</p>
  </section>`;
}

// ---------- Estadísticas ----------

function viewStats() {
  const acc = accuracyOf(S.practiceHands);
  const life = S.decisions ? (S.correct / S.decisions) * 100 : null;
  const cats = CATS.map((c) => {
    const v = S.byCat[c] || { c: 0, t: 0 };
    const p = v.t ? (v.c / v.t) * 100 : null;
    return `<div class="cat-row"><span>${CAT_LABEL[c]}</span><span class="bar"><i style="width:${p ?? 0}%"></i></span><b>${pctText(p)}</b><small>${v.t ? `${v.c} de ${v.t}` : 'Sin datos'}</small></div>`;
  }).join('');
  const top = Object.entries(S.misses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const topHtml = top.length
    ? `<ol class="top">${top.map(([k, n]) => `<li><span>${k}</span><b>${n} ${plural(n, 'error', 'errores')}</b></li>`).join('')}</ol>`
    : `<p class="muted">Todavía no tienes errores registrados.</p>`;
  const cost = S.errorCost;
  const costNote =
    cost < 0
      ? `<p class="muted">En total tus errores te hicieron ganar ${fmt(-cost)} fichas. Fue suerte: a la larga, jugar perfecto pierde menos.</p>`
      : '';
  return `<section class="stats">
    <h1 class="page-title">Estadísticas</h1>
    <div class="tiles">
      <div class="tile"><span>Fichas</span><b>${fmt(S.chips)}</b></div>
      <div class="tile"><span>Precisión</span><b>${pctText(acc.pct)}</b><small>${acc.hands < ACCURACY_WINDOW ? `${acc.hands} de ${ACCURACY_WINDOW} manos` : `Últimas ${ACCURACY_WINDOW} manos`}</small></div>
      <div class="tile"><span>Racha actual</span><b>${S.streak} <em>${fmtMult(streakMultiplier(S.streak))}</em></b></div>
      <div class="tile"><span>Mejor racha</span><b>${S.bestStreak}</b></div>
      <div class="tile"><span>Recargas</span><b>${S.reloads}</b></div>
      <div class="tile"><span>Precisión total</span><b>${pctText(life)}</b><small>${fmt(S.decisions)} ${plural(S.decisions, 'decisión', 'decisiones')}</small></div>
    </div>
    <div class="card-block cost-block">
      <span class="kicker">Lo que te costaron tus errores</span>
      <b class="cost-num ${cost > 0 ? 'bad' : cost < 0 ? 'luck' : ''}">${cost < 0 ? '+' : ''}${fmt(Math.abs(cost))} fichas</b>
      ${costNote}
      <details><summary>¿Cómo se calcula?</summary>${HOW_COST}</details>
    </div>
    <div class="card-block"><span class="kicker">Aciertos por tipo</span>${cats}<p class="muted small">Práctica y Contrarreloj. La Guía no cuenta.</p></div>
    <div class="card-block"><span class="kicker">Situaciones que más fallas</span>${topHtml}</div>
    <button class="btn danger" data-on="reset-ask">Borrar progreso</button>
  </section>`;
}

function modalHtml() {
  if (ui.modal === 'leave') {
    const staked = ui.game && ui.game.round ? ui.game.round.committed() : 0;
    return `<div class="modal-bg" data-on="modal-close"></div>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <h2 id="m-title">¿Salir de la mano?</h2>
    <p>Si sales ahora pierdes la apuesta de esta mano (${fmt(staked)} fichas). Las decisiones que ya tomaste cuentan.</p>
    <div class="modal-btns"><button class="btn ghost" data-on="modal-close">Seguir jugando</button><button class="btn danger" data-on="leave-do">Salir</button></div>
  </div>`;
  }
  if (ui.modal !== 'reset') return '';
  return `<div class="modal-bg" data-on="modal-close"></div>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <h2 id="m-title">¿Borrar todo tu progreso?</h2>
    <p>Vuelves a 1.000 fichas, se borran tus estadísticas y las mesas desbloqueadas. No se puede deshacer.</p>
    <div class="modal-btns"><button class="btn ghost" data-on="modal-close">Cancelar</button><button class="btn danger" data-on="reset-do">Borrar</button></div>
  </div>`;
}

// Salir a mitad de mano pide confirmación: la apuesta ya está en la mesa.
function leaveTo(screen) {
  if (handInProgress()) {
    ui.leaveTarget = screen;
    ui.modal = 'leave';
    render();
    return;
  }
  go(screen);
}

// ---------- Render y eventos ----------

function render() {
  renderTopbar();
  let html = '';
  if (ui.screen === 'home') html = viewHome();
  else if (ui.screen === 'play') html = viewPlay();
  else if (ui.screen === 'timed') html = viewTimed();
  else if (ui.screen === 'chart') html = viewChart();
  else if (ui.screen === 'stats') html = viewStats();
  const view = $('#view');
  view.innerHTML = html;
  view.dataset.screen = ui.screen;
  $('#modal-root').innerHTML = modalHtml();
  if (ui.modal) $('#modal-root .btn.ghost')?.focus();
}

function go(screen) {
  if (ui.timed && ui.timed.timer && screen !== 'timed') {
    clearInterval(ui.timed.timer);
    ui.timed = null;
  }
  ui.screen = screen;
  render();
  window.scrollTo(0, 0);
}

const handlers = {
  home: () => leaveTo('home'),
  stats: () => leaveTo('stats'),
  'leave-do': () => {
    const to = ui.leaveTarget || 'home';
    ui.modal = null;
    abandonHand();
    go(to);
  },
  mode: (m) => {
    S.mode = m;
    save();
    render();
  },
  table: (id) => {
    const t = tableById(id);
    if (!S.unlocked.includes(id)) {
      const st = unlockStatus(t, S.chips, S.practiceHands);
      toast(`${t.name} está bloqueada. ${st.text}.`);
      return;
    }
    S.tableId = id;
    save();
    if (S.mode === 'chart') {
      ui.chartTable = id;
      go('chart');
    } else if (S.mode === 'timed') {
      startTimed(t);
      go('timed');
    } else {
      startGame(t, S.mode);
      go('play');
    }
  },
  deal: () => {
    if (performance.now() < ui.lockUntil) return;
    deal();
  },
  bet: (delta) => {
    const g = ui.game;
    S.bet = clampBet(S.bet + Number(delta), S.chips, g.table) || g.table.minBet;
    save();
    render();
  },
  act: (a) => {
    if (performance.now() < ui.lockUntil) return;
    decide(a);
  },
  reload: () => {
    const res = applyReload(S.chips, S.reloads);
    S.chips = res.chips;
    S.reloads = res.reloads;
    save();
    toast('Recargaste 1.000 fichas');
    render();
  },
  'timed-start': () => timedStart(),
  'timed-act': (a) => timedAnswer(a),
  'chart-table': (id) => {
    ui.chartTable = id;
    render();
  },
  'reset-ask': () => {
    ui.modal = 'reset';
    render();
  },
  'modal-close': () => {
    ui.modal = null;
    render();
  },
  'reset-do': () => {
    S = defaultState();
    store.clear();
    save();
    ui.modal = null;
    shoes.clear();
    toast('Progreso borrado');
    go('home');
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-on]');
  if (!el || el.disabled) return;
  const fn = handlers[el.dataset.on];
  if (fn) fn(el.dataset.arg);
});

// Atajos de teclado en web.
const KEYS = { p: 'hit', h: 'hit', s: 'stand', l: 'stand', d: 'double', v: 'split', r: 'surrender' };
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape' && ui.modal) return handlers['modal-close']();
  const a = KEYS[e.key.toLowerCase()];
  if (!a || ui.modal || performance.now() < ui.lockUntil) return;
  if (ui.screen === 'play' && ui.game?.round?.phase === 'player') decide(a);
  else if (ui.screen === 'timed' && ui.timed?.running) timedAnswer(a);
});

// ---------- Arranque ----------

// Si cerraste o recargaste la página a mitad de mano, esa mano se cierra como abandonada.
const closed = closePendingHand(S);
checkUnlocks();
save();
render();
if (closed && closed.lost) toast(`La mano que dejaste a medias se cerró: perdiste ${fmt(closed.lost)} fichas`, 4000);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* sin modo offline en este navegador */
    });
  });
}
