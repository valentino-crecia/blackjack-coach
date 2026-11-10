// Motor del juego: zapato, reparto, jugadas, crupier, pagos y economía.
// Módulo puro: no toca el DOM (Node lo importa en los tests y la simulación).
import { cardValue, handTotal, isBlackjack, isPair, bestAction, insuranceAdvice } from './strategy.js';
import { SHOE, ECONOMY, STREAK_TIERS, ACCURACY_WINDOW, MAX_HANDS } from './config.js';

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['S', 'H', 'D', 'C'];

// ---------- Azar ----------

function makeCryptoRandInt() {
  const buf = new Uint32Array(512);
  let i = buf.length;
  return function randInt(n) {
    // Muestreo por rechazo para evitar sesgo de módulo.
    const limit = 0x100000000 - (0x100000000 % n);
    for (;;) {
      if (i >= buf.length) {
        globalThis.crypto.getRandomValues(buf);
        i = 0;
      }
      const x = buf[i++];
      if (x < limit) return x % n;
    }
  };
}

export const cryptoRandInt = makeCryptoRandInt();

// Fisher-Yates
export function shuffleInPlace(arr, randInt = cryptoRandInt) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export function buildDecks(decks) {
  const cards = [];
  let id = 0;
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit, id: id++ });
  }
  return cards;
}

function parseCard(c, i) {
  if (typeof c === 'object') return { rank: c.rank, suit: c.suit || SUITS[i % 4], id: c.id ?? i };
  return { rank: String(c), suit: SUITS[i % 4], id: i };
}

// ---------- Zapato ----------

export class Shoe {
  constructor(decks = 6, opts = {}) {
    this.decks = decks;
    this.randInt = opts.randInt || cryptoRandInt;
    this.penetration = opts.penetration ?? SHOE.penetration;
    if (opts.cards) {
      this.cards = opts.cards.map(parseCard);
      this.fixed = true;
    } else {
      this.cards = shuffleInPlace(buildDecks(decks), this.randInt);
      this.fixed = false;
    }
    this.pos = 0;
  }
  get cutCard() {
    return Math.floor(this.cards.length * this.penetration);
  }
  needsShuffle() {
    return !this.fixed && this.pos >= this.cutCard;
  }
  shuffle() {
    shuffleInPlace(this.cards, this.randInt);
    this.pos = 0;
  }
  draw() {
    if (this.pos >= this.cards.length) {
      if (this.fixed) throw new Error('El zapato de prueba se quedó sin cartas');
      this.shuffle();
    }
    return this.cards[this.pos++];
  }
  clone() {
    const s = Object.create(Shoe.prototype);
    s.decks = this.decks;
    s.randInt = this.randInt;
    s.penetration = this.penetration;
    s.cards = this.cards.slice();
    s.fixed = this.fixed;
    s.pos = this.pos;
    return s;
  }
}

// ---------- Mano ----------

function makeHand(cards, bet) {
  return { cards, bet, done: false, busted: false, doubled: false, surrendered: false, fromSplit: false, splitAces: false, net: 0, outcome: null };
}

const NO_ACTIONS = { hit: false, stand: false, double: false, split: false, surrender: false };

export class Round {
  constructor({ shoe, rules, bet, bankroll = Infinity }) {
    if (!(bet > 0)) throw new Error('La apuesta debe ser mayor que cero');
    if (bet > bankroll) throw new Error('No puedes apostar más de lo que tienes');
    this.shoe = shoe;
    this.rules = rules;
    this.bet = bet;
    this.bankroll = bankroll;
    this.hands = [];
    this.dealer = [];
    this.active = 0;
    this.phase = 'new';
    this.insuranceOffered = false;
    this.insuranceTaken = false;
    this.insuranceBet = 0;
    this.insuranceNet = 0;
    this.actionsTaken = 0;
    this.peeked = false;
    this.dealerBlackjack = false;
    this.dealerPlayed = false;
    this.net = 0;
  }

  deal() {
    const s = this.shoe;
    const p1 = s.draw();
    const d1 = s.draw();
    const p2 = s.draw();
    const d2 = s.draw();
    this.hands = [makeHand([p1, p2], this.bet)];
    this.dealer = [d1, d2];
    if (cardValue(d1) === 11) {
      this.phase = 'insurance';
      this.insuranceOffered = true;
    } else {
      this._afterInsurance();
    }
    return this;
  }

  get dealerUp() {
    return this.dealer[0];
  }
  get activeHand() {
    return this.hands[this.active];
  }
  get playerBlackjack() {
    return this.hands.length === 1 && !this.hands[0].fromSplit && isBlackjack(this.hands[0].cards);
  }
  get evenMoney() {
    return this.insuranceOffered && this.playerBlackjack;
  }
  committed() {
    let s = this.insuranceBet;
    for (const h of this.hands) s += h.bet;
    return s;
  }
  free() {
    return this.bankroll - this.committed();
  }
  canAffordInsurance() {
    return this.evenMoney || this.free() >= this.bet / 2;
  }

  insurance(take) {
    if (this.phase !== 'insurance') throw new Error('El seguro no está disponible ahora');
    if (take) {
      if (!this.canAffordInsurance()) throw new Error('No te alcanzan las fichas para el seguro');
      this.insuranceBet = this.bet / 2;
      this.insuranceTaken = true;
    }
    this._afterInsurance();
  }

  _afterInsurance() {
    const up = cardValue(this.dealerUp);
    if (up === 11 || up === 10) {
      this.peeked = true;
      if (isBlackjack(this.dealer)) {
        this.dealerBlackjack = true;
        this._finish();
        return;
      }
    }
    if (this.playerBlackjack) {
      this._finish();
      return;
    }
    this.phase = 'player';
    this.active = 0;
  }

  available() {
    if (this.phase !== 'player') return { ...NO_ACTIONS };
    const h = this.activeHand;
    const two = h.cards.length === 2;
    const free = this.free();
    return {
      hit: true,
      stand: true,
      double: two && (!h.fromSplit || !!this.rules.das) && free >= h.bet,
      split: two && isPair(h.cards) && this.hands.length < MAX_HANDS && !h.splitAces && free >= h.bet,
      surrender: !!this.rules.surrender && two && !h.fromSplit && this.hands.length === 1 && this.actionsTaken === 0,
    };
  }

  // Situación de la decisión actual (para calificarla).
  situation() {
    const h = this.activeHand;
    return { cards: h.cards.slice(), fromSplit: h.fromSplit, handsCount: this.hands.length, firstDecision: this.actionsTaken === 0 };
  }

  advice() {
    if (this.phase === 'insurance') return insuranceAdvice(this.evenMoney);
    if (this.phase !== 'player') return null;
    return bestAction(this.situation(), this.dealerUp, this.rules, this.available());
  }

  act(action) {
    if (this.phase !== 'player') throw new Error('No es tu turno');
    const av = this.available();
    if (!av[action]) throw new Error(`Jugada no disponible: ${action}`);
    const h = this.activeHand;
    this.actionsTaken++;
    switch (action) {
      case 'hit': {
        h.cards.push(this.shoe.draw());
        const t = handTotal(h.cards).total;
        if (t > 21) {
          h.busted = true;
          h.done = true;
        } else if (t === 21) h.done = true;
        break;
      }
      case 'stand':
        h.done = true;
        break;
      case 'double':
        h.bet *= 2;
        h.doubled = true;
        h.cards.push(this.shoe.draw());
        if (handTotal(h.cards).total > 21) h.busted = true;
        h.done = true;
        break;
      case 'split': {
        const [c1, c2] = h.cards;
        const h2 = makeHand([c2], h.bet);
        h.cards = [c1];
        h.fromSplit = true;
        h2.fromSplit = true;
        this.hands.splice(this.active + 1, 0, h2);
        if (cardValue(c1) === 11) {
          // Ases divididos: una carta cada uno y listo.
          h.splitAces = h2.splitAces = true;
          h.cards.push(this.shoe.draw());
          h.done = true;
          h2.cards.push(this.shoe.draw());
          h2.done = true;
        } else {
          h.cards.push(this.shoe.draw());
          if (handTotal(h.cards).total === 21) h.done = true;
        }
        break;
      }
      case 'surrender':
        h.surrendered = true;
        h.done = true;
        break;
      default:
        throw new Error(`Jugada desconocida: ${action}`);
    }
    this._advance();
  }

  _advance() {
    while (this.active < this.hands.length && this.hands[this.active].done) {
      this.active++;
      const n = this.hands[this.active];
      if (n && n.cards.length === 1) {
        n.cards.push(this.shoe.draw());
        if (handTotal(n.cards).total === 21) n.done = true;
      }
    }
    if (this.active >= this.hands.length) {
      this.active = this.hands.length - 1;
      this._dealerPlay();
      this._finish();
    }
  }

  _dealerPlay() {
    const need = this.hands.some((h) => !h.busted && !h.surrendered);
    this.dealerPlayed = need;
    if (!need) return;
    for (;;) {
      const { total, soft } = handTotal(this.dealer);
      if (total < 17 || (this.rules.h17 && total === 17 && soft)) this.dealer.push(this.shoe.draw());
      else break;
    }
  }

  get dealerTotal() {
    return handTotal(this.dealer).total;
  }

  _finish() {
    this.phase = 'done';
    const d = this.dealerTotal;
    const dealerBust = d > 21;
    this.dealerBust = dealerBust;
    const pbj = this.playerBlackjack;
    let net = 0;
    for (const h of this.hands) {
      const t = handTotal(h.cards).total;
      if (h.surrendered) {
        h.net = -h.bet / 2;
        h.outcome = 'surrender';
      } else if (h.busted) {
        h.net = -h.bet;
        h.outcome = 'bust';
      } else if (pbj) {
        if (this.dealerBlackjack) {
          h.net = 0;
          h.outcome = 'push';
        } else {
          h.net = h.bet * 1.5;
          h.outcome = 'blackjack';
        }
      } else if (this.dealerBlackjack) {
        h.net = -h.bet;
        h.outcome = 'dealer-blackjack';
      } else if (dealerBust || t > d) {
        h.net = h.bet;
        h.outcome = 'win';
      } else if (t < d) {
        h.net = -h.bet;
        h.outcome = 'lose';
      } else {
        h.net = 0;
        h.outcome = 'push';
      }
      net += h.net;
    }
    if (this.insuranceTaken) {
      this.insuranceNet = this.dealerBlackjack ? this.insuranceBet * 2 : -this.insuranceBet;
      net += this.insuranceNet;
    }
    this.net = net;
  }
}

// ---------- Mano abandonada ----------

// La apuesta se cobra al repartir. Si sales a mitad de mano, pierdes todo lo apostado
// (apuesta original, lo doblado, lo dividido y el seguro).
export function isInProgress(round) {
  return !!round && (round.phase === 'insurance' || round.phase === 'player');
}

export function abandonRound(round) {
  if (!isInProgress(round)) return round ? round.net : 0;
  round.phase = 'abandoned';
  round.net = -round.committed();
  return round.net;
}

// Fichas que se muestran durante la mano: saldo inicial menos lo que está en la mesa.
export function chipsDuringHand(chipsAtStart, round) {
  return chipsAtStart - (round ? round.committed() : 0);
}

// Agrega una mano de Práctica ({ c, t }) y conserva solo las últimas N.
export function pushPracticeHand(hands, rec, window = ACCURACY_WINDOW) {
  if (!rec || !rec.t) return hands.slice(-window);
  return [...hands, { c: rec.c, t: rec.t }].slice(-window);
}

// Cierra una mano pendiente guardada (por ejemplo, si recargaste la página a mitad de mano).
// Las fichas ya se descontaron al repartir; aquí solo se registran las decisiones tomadas.
export function closePendingHand(state) {
  const p = state.pending;
  if (!p) return null;
  if (p.practice) state.practiceHands = pushPracticeHand(state.practiceHands || [], p);
  state.pending = null;
  return { lost: p.staked, decisions: p.t };
}

// Juega una ronda completa con estrategia perfecta (nunca toma seguro).
export function playPerfect(round) {
  if (round.phase === 'new') round.deal();
  if (round.phase === 'insurance') round.insurance(false);
  while (round.phase === 'player') round.act(round.advice().action);
  return round;
}

// Mano sombra: misma apuesta, mismo zapato (clonado al empezar la mano), juego perfecto.
export function shadowRound({ shoe, rules, bet, bankroll }) {
  return playPerfect(new Round({ shoe, rules, bet, bankroll }));
}

// ---------- Economía ----------

export function streakMultiplier(streak) {
  for (const t of STREAK_TIERS) if (streak >= t.from) return t.mult;
  return 1;
}

export function streakBonus(net, mult) {
  return net > 0 && mult > 1 ? Math.round(net * (mult - 1)) : 0;
}

export function needsReload(chips) {
  return chips < ECONOMY.minToPlay;
}

// La recarga deja el saldo en 1.000 (no suma) y cuenta una recarga.
export function applyReload(chips, reloads) {
  if (!needsReload(chips)) return { chips, reloads };
  return { chips: ECONOMY.reloadTo, reloads: reloads + 1 };
}

export function maxBetFor(chips, table) {
  const step = ECONOMY.betStep;
  return Math.max(0, Math.min(table.maxBet, Math.floor(chips / step) * step));
}

export function clampBet(bet, chips, table) {
  const max = maxBetFor(chips, table);
  if (max < table.minBet) return 0;
  const step = ECONOMY.betStep;
  const b = Math.round(bet / step) * step;
  return Math.min(max, Math.max(table.minBet, b));
}

// ---------- Precisión y desbloqueos ----------

// hands: [{ c: correctas, t: tomadas }] de Práctica (las más recientes al final)
export function accuracyOf(hands, window = ACCURACY_WINDOW) {
  const last = hands.slice(-window);
  let c = 0;
  let t = 0;
  for (const h of last) {
    c += h.c;
    t += h.t;
  }
  return { correct: c, total: t, hands: last.length, pct: t ? (c / t) * 100 : null };
}

export function unlockStatus(table, chips, practiceHands) {
  if (!table.unlock) return { ok: true, parts: [], text: '' };
  const need = table.unlock;
  const acc = accuracyOf(practiceHands);
  const parts = [];
  const chipsOk = chips >= need.chips;
  if (!chipsOk) {
    const n = need.chips - chips;
    parts.push(`Te faltan ${fmt(n)} ${n === 1 ? 'ficha' : 'fichas'}`);
  }
  const handsOk = acc.hands >= ACCURACY_WINDOW;
  const pctShown = acc.pct === null ? 0 : Math.floor(acc.pct);
  const accOk = handsOk && acc.pct !== null && acc.pct >= need.accuracy;
  if (!handsOk) {
    const n = ACCURACY_WINDOW - acc.hands;
    parts.push(`Te faltan ${n} ${n === 1 ? 'mano' : 'manos'} de Práctica`);
  } else if (!accOk) parts.push(`Precisión ${pctShown}% de ${need.accuracy}%`);
  return { ok: chipsOk && accOk, chipsOk, accOk, handsOk, pct: acc.pct, parts, text: parts.join(' · ') };
}

// ---------- Formato ----------

// Formato venezolano: 1.234,56
export function fmt(n, decimals = 0) {
  const neg = n < 0;
  const abs = Math.abs(n);
  const fixed = abs.toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const withDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '−' : '') + withDots + (dec ? ',' + dec : '');
}

export function fmtMult(m) {
  return '×' + String(m).replace('.', ',');
}
