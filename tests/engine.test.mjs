// Tests del motor. Corre con: node tests/engine.test.mjs
// Zapatos fijos: el orden de reparto es jugador, crupier (visible), jugador, crupier (oculta) y luego cada carta pedida.
import {
  Shoe,
  Round,
  shadowRound,
  streakMultiplier,
  streakBonus,
  applyReload,
  needsReload,
  maxBetFor,
  clampBet,
  accuracyOf,
  unlockStatus,
  fmt,
  buildDecks,
  abandonRound,
  isInProgress,
  chipsDuringHand,
  closePendingHand,
  pushPracticeHand,
} from '../engine.js';
import { TABLES, rulesOf } from '../config.js';
import { createStore } from '../storage.js';

let pass = 0;
let fail = 0;
const failures = [];
function check(name, got, want) {
  if (Object.is(got, want) || got === want) pass++;
  else {
    fail++;
    failures.push(`${name}: esperaba ${JSON.stringify(want)}, obtuve ${JSON.stringify(got)}`);
  }
}
function throws(name, fn) {
  try {
    fn();
    fail++;
    failures.push(`${name}: esperaba un error`);
  } catch {
    pass++;
  }
}

const [AVILA, ROQUES, MERIDA, CANAIMA] = TABLES;
const R = (t) => rulesOf(t);
const round = (cards, table = AVILA, bet = 10, bankroll = 1000) =>
  new Round({ shoe: new Shoe(6, { cards }), rules: R(table), bet, bankroll }).deal();

// Blackjack 3:2
let r = round(['A', '9', 'K', '7']);
check('Blackjack: mano terminada', r.phase, 'done');
check('Blackjack paga 3:2 (10 → +15)', r.net, 15);
check('Blackjack: resultado', r.hands[0].outcome, 'blackjack');

// Empate
r = round(['10', '10', '9', '9']);
r.act('stand');
check('Empate 19 contra 19', r.net, 0);
check('Empate: resultado', r.hands[0].outcome, 'push');

// Peek con As: se ofrece seguro y luego el crupier revisa
r = round(['10', 'A', '6', 'K']);
check('As visible: se ofrece seguro', r.phase, 'insurance');
check('Seguro: lo correcto es no tomarlo', r.advice().action, 'no');
r.insurance(false);
check('Peek con As: crupier con blackjack termina la mano', r.phase, 'done');
check('Peek con As: pierdes solo la apuesta original', r.net, -10);

// Peek con 10
r = round(['9', 'K', '8', 'A']);
check('Peek con 10: no se ofrece seguro', r.insuranceOffered, false);
check('Peek con 10: crupier con blackjack termina', r.phase, 'done');
check('Peek con 10: -10', r.net, -10);
r = round(['9', 'K', '8', '7']);
check('Peek con 10 sin blackjack: juegas', r.phase, 'player');

// Seguro paga 2:1
r = round(['10', 'A', '6', 'K']);
r.insurance(true);
check('Seguro con blackjack del crupier: -10 + 10 = 0', r.net, 0);
check('Seguro neto +10', r.insuranceNet, 10);
r = round(['10', 'A', '9', '7']);
r.insurance(true);
r.act('stand'); // 19 contra 18
check('Seguro perdido (-5) y mano ganada (+10)', r.net, 5);
// Dinero parejo
r = round(['A', 'A', 'K', '9']);
check('Blackjack contra As: se ofrece dinero parejo', r.evenMoney, true);
r.insurance(true);
check('Dinero parejo sin blackjack del crupier: +10', r.net, 10);
r = round(['A', 'A', 'K', 'Q']);
r.insurance(false);
check('Blackjack contra blackjack sin dinero parejo: empate', r.net, 0);

// Rendición
r = round(['10', '10', '6', '7']);
check('Rendición disponible en Ávila', r.available().surrender, true);
check('Lo correcto con 16 vs 10 en Ávila es rendirse', r.advice().action, 'surrender');
r.act('surrender');
check('Rendición devuelve la mitad (-5)', r.net, -5);
r = round(['10', '10', '6', '7'], ROQUES);
check('Sin rendición en Los Roques', r.available().surrender, false);
throws('Rendirse en Los Roques falla', () => r.act('surrender'));
r = round(['10', '10', '2', '7', '2']);
r.act('hit');
check('Rendición solo como primera decisión', r.available().surrender, false);

// Dividir Ases: una carta cada uno, 21 no es blackjack
r = round(['A', '6', 'A', '10', 'K', '9', '4']);
r.act('split');
check('Ases divididos: mano terminada sin decidir', r.phase, 'done');
check('Ases divididos: 2 manos', r.hands.length, 2);
check('Ases divididos: una carta cada uno', r.hands.map((h) => h.cards.length).join(','), '2,2');
check('A+K tras dividir es 21 (gana 1:1, no 3:2)', r.hands[0].net, 10);
// crupier 6+10 = 16, pide 4 = 20. Mano 2: A+9 = 20 → empate
check('A+9 contra 20: empate', r.hands[1].net, 0);
check('Ases divididos: neto +10', r.net, 10);
r = round(['A', '6', 'A', '10', 'A', '9', '4']);
r.act('split');
check('Ases no se re-dividen', r.phase, 'done');

// Dividir hasta 4 manos
r = round(['8', '6', '8', '10', '8', '8', '8', '3', '2', '9', '10', '5', '5', '5', '10']);
r.act('split'); // mano 1: 8+8
check('Re-dividir: disponible con 2 manos', r.available().split, true);
r.act('split'); // mano 1: 8+8 de nuevo
r.act('split'); // 4 manos
check('Dividir hasta 4 manos', r.hands.length, 4);
check('Con 4 manos no se puede dividir más', r.available().split, false);
check('Con 4 manos y 8,8 vs 6 lo correcto es plantarse', r.advice().action, 'stand');

// DAS sí / no
r = round(['8', '6', '8', '10', '3']);
r.act('split');
check('DAS en Ávila: doblar tras dividir', r.available().double, true);
r = round(['8', '6', '8', '10', '3'], MERIDA);
r.act('split');
check('Sin DAS en Mérida: no se dobla tras dividir', r.available().double, false);

// Doblar solo con 2 cartas
r = round(['2', '6', '3', '10', '2', '5']);
check('Doblar con 2 cartas', r.available().double, true);
r.act('hit');
check('Doblar con 3 cartas no', r.available().double, false);

// Doblar: apuesta doble y una carta
r = round(['6', '6', '5', '10', '10', '9']);
r.act('double'); // 21; crupier 16 pide 9 → 25
check('Doblar 11 y ganar: +20', r.net, 20);
check('Doblar: una sola carta', r.hands[0].cards.length, 3);

// Crupier H17 / S17 con 17 blando
r = round(['10', '6', '8', 'A', '4']);
r.act('stand'); // 18 contra A+6
check('S17: el crupier se planta con 17 blando', r.dealer.length, 2);
check('S17: 18 le gana a 17', r.net, 10);
r = round(['10', '6', '8', 'A', '4'], ROQUES);
r.act('stand');
check('H17: el crupier pide con 17 blando', r.dealer.length, 3);
check('H17: el crupier llega a 21 y gana', r.net, -10);

// El crupier no juega si todas tus manos se pasaron
r = round(['10', '6', '6', '10', 'K']);
r.act('hit');
check('Te pasaste: el crupier no pide', r.dealerPlayed, false);
check('Te pasaste: -10', r.net, -10);

// Apuesta mayor que las fichas
throws('No puedes apostar más de lo que tienes', () => new Round({ shoe: new Shoe(6), rules: R(AVILA), bet: 50, bankroll: 40 }));
r = round(['5', '6', '6', '10'], AVILA, 30, 50);
check('Sin fichas para doblar: doblar no disponible', r.available().double, false);
check('Sin fichas para doblar: lo correcto pasa a pedir', r.advice().action, 'hit');
r = round(['8', '6', '8', '10'], AVILA, 30, 50);
check('Sin fichas para dividir: dividir no disponible', r.available().split, false);
r = round(['10', 'A', '6', '7'], AVILA, 10, 14);
check('Sin fichas para el seguro', r.canAffordInsurance(), false);
throws('Tomar seguro sin fichas falla', () => r.insurance(true));

// Recarga
check('Con 5 fichas aparece recargar', needsReload(5), true);
check('Con 10 fichas no', needsReload(10), false);
let rl = applyReload(5, 2);
check('La recarga deja el saldo en 1.000', rl.chips, 1000);
check('La recarga suma 1 al contador', rl.reloads, 3);
rl = applyReload(500, 2);
check('No se recarga con saldo suficiente', rl.chips, 500);
check('Apuesta máxima limitada por fichas', maxBetFor(37, CANAIMA), 30);
check('Apuesta máxima limitada por mesa', maxBetFor(5000, AVILA), 50);
check('Ajustar apuesta a las fichas', clampBet(100, 45, ROQUES), 40);
check('Sin fichas no hay apuesta', clampBet(10, 5, AVILA), 0);

// Rachas
check('Racha 0 → ×1', streakMultiplier(0), 1);
check('Racha 9 → ×1', streakMultiplier(9), 1);
check('Racha 10 → ×1,5', streakMultiplier(10), 1.5);
check('Racha 25 → ×2', streakMultiplier(25), 2);
check('Racha 50 → ×3', streakMultiplier(50), 3);
check('Bono ×1,5 sobre +15 = +8', streakBonus(15, 1.5), 8);
check('Bono ×3 sobre +10 = +20', streakBonus(10, 3), 20);
check('Sin bono si pierdes', streakBonus(-10, 3), 0);

// Mano sombra con zapato fijo: 16 contra 10 en Mesa Ávila
const shoe = new Shoe(6, { cards: ['10', '10', '6', 'K', '5', '4'] });
const start = shoe.clone();
r = new Round({ shoe, rules: R(AVILA), bet: 10, bankroll: 1000 }).deal();
check('Real: 16 contra 10', r.advice().action, 'surrender');
r.act('stand');
check('Real: te plantaste, el crupier sacó 20', r.dealerTotal, 20);
check('Real: perdiste 10', r.net, -10);
const sh = shadowRound({ shoe: start, rules: R(AVILA), bet: 10, bankroll: 1000 });
check('Sombra: se rinde y pierde 5', sh.net, -5);
check('Ese error te costó 5 fichas', sh.net - r.net, 5);
// Sombra donde el crupier saca cartas distintas: Los Roques (sin rendición) la sombra pide
const shoe2 = new Shoe(8, { cards: ['10', '10', '6', '6', '5', '9'] });
const start2 = shoe2.clone();
r = new Round({ shoe: shoe2, rules: R(ROQUES), bet: 10, bankroll: 1000 }).deal();
r.act('stand'); // crupier 16 pide 5 → 21
check('Real en Los Roques: el crupier pide el 5 y llega a 21', r.dealerTotal, 21);
const sh2 = shadowRound({ shoe: start2, rules: R(ROQUES), bet: 10, bankroll: 1000 });
check('Sombra pide el 5 (21) y el crupier saca el 9 (25)', sh2.dealerTotal, 25);
check('Sombra gana 10', sh2.net, 10);

// Zapato real
const s = new Shoe(6);
check('6 mazos = 312 cartas', s.cards.length, 312);
check('Corte al 75%', s.cutCard, 234);
for (let i = 0; i < 234; i++) s.draw();
check('Al pasar el 75% pide re-barajar', s.needsShuffle(), true);
s.shuffle();
check('Tras barajar empieza de cero', s.pos, 0);
const counts = {};
for (const c of new Shoe(8).cards) counts[c.rank] = (counts[c.rank] || 0) + 1;
check('8 mazos: 32 ases', counts.A, 32);
check('Mazo de 52', buildDecks(1).length, 52);
const c1 = new Shoe(6);
const c2 = c1.clone();
check('El clon reparte lo mismo', [c1.draw(), c1.draw()].map((c) => c.id).join(), [c2.draw(), c2.draw()].map((c) => c.id).join());

// Precisión y desbloqueos
const hands = (n, c, t) => Array.from({ length: n }, () => ({ c, t }));
let st = unlockStatus(MERIDA, 2180, [...hands(42, 1, 1), ...hands(8, 0, 1)]);
check('Mesa bloqueada: lo que falta', st.text, 'Te faltan 320 fichas · Precisión 84% de 85%');
check('Mesa bloqueada', st.ok, false);
st = unlockStatus(ROQUES, 1500, hands(30, 1, 1));
check('Con menos de 50 manos', st.text, 'Te faltan 20 manos de Práctica');
st = unlockStatus(ROQUES, 1500, [...hands(40, 1, 1), ...hands(10, 0, 1)]);
check('Desbloqueo con 1.500 fichas y 80%', st.ok, true);
st = unlockStatus(ROQUES, 1499, hands(50, 1, 1));
check('Falta 1 ficha', st.text, 'Te faltan 1 ficha');
check('Precisión: últimas 50 manos', accuracyOf([...hands(10, 0, 1), ...hands(50, 1, 1)]).pct, 100);
check('Formato 1.000', fmt(1000), '1.000');
check('Formato 1.234,56', fmt(1234.56, 2), '1.234,56');

// Abandonar la mano: la apuesta se cobra al repartir y salir no es gratis
r = round(['5', '6', '6', '10', '10', '9']);
check('Al repartir quedan 10 fichas en la mesa', chipsDuringHand(1000, r), 990);
r.act('double');
check('Doblar: 20 en la mesa', r.committed(), 20);
r = round(['8', '6', '8', '10', '3', '2', '9']);
r.act('split');
r.act('double'); // mano 1: 8+3 doblada
check('Dividir y doblar: 30 en la mesa', r.committed(), 30);
check('Fichas visibles durante la mano', chipsDuringHand(1000, r), 970);
check('La mano sigue en juego', isInProgress(r), true);
check('Abandonar pierde todo lo apostado (−30)', abandonRound(r), -30);
check('Mano abandonada', r.phase, 'abandoned');
throws('No se puede jugar una mano abandonada', () => r.act('stand'));
r = round(['10', 'A', '6', '7']);
r.insurance(true);
check('Abandonar con seguro tomado pierde apuesta + seguro (−15)', abandonRound(r), -15);
r = round(['A', '9', 'K', '7']);
check('Una mano terminada no se abandona', abandonRound(r), 15);
check('Una mano terminada no está en juego', isInProgress(r), false);

const st1 = { chips: 970, practiceHands: hands(50, 1, 1), pending: { practice: true, staked: 30, c: 1, t: 2 } };
const closed = closePendingHand(st1);
check('Mano pendiente al reabrir: se cierra', st1.pending, null);
check('Mano pendiente: informa lo perdido', closed.lost, 30);
check('Mano pendiente: las fichas ya estaban descontadas', st1.chips, 970);
check('Mano pendiente: registra sus decisiones en Práctica', JSON.stringify(st1.practiceHands.at(-1)), '{"c":1,"t":2}');
check('Mano pendiente: conserva solo 50 manos', st1.practiceHands.length, 50);
check('Mano pendiente: cuenta en la precisión (50 de 51)', accuracyOf(st1.practiceHands).pct, (50 / 51) * 100);
const st2 = { chips: 990, practiceHands: [], pending: { practice: false, staked: 10, c: 0, t: 1 } };
closePendingHand(st2);
check('Mano pendiente de Guía: no cuenta para Práctica', st2.practiceHands.length, 0);
check('Sin mano pendiente: nada que cerrar', closePendingHand({ pending: null }), null);
check('Mano sin decisiones no suma a Práctica', pushPracticeHand([], { c: 0, t: 0 }).length, 0);

// Persistencia: si localStorage lanza error, la app sigue en memoria y avisa
const broken = {
  getItem() {
    throw new Error('bloqueado');
  },
  setItem() {
    throw new Error('bloqueado');
  },
  removeItem() {
    throw new Error('bloqueado');
  },
};
let warned = 0;
const store = createStore('bjcoach.v1', () => broken, () => warned++);
check('Storage roto: carga vacía', store.load(), null);
check('Storage roto: no persistente', store.persistent, false);
store.save({ chips: 900 });
check('Storage roto: guarda en memoria', store.load().chips, 900);
check('Storage roto: avisa', warned > 0, true);
const mem = new Map();
const good = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const store2 = createStore('bjcoach.v1', () => good, () => {});
store2.save({ chips: 1200 });
check('Storage normal: guarda en bjcoach.v1', JSON.parse(mem.get('bjcoach.v1')).chips, 1200);
check('Storage normal: persistente', store2.persistent, true);
const store3 = createStore('bjcoach.v1', () => {
  throw new Error('SecurityError');
}, () => warned++);
check('Acceder a localStorage lanza: sigue en memoria', store3.persistent, false);

console.log(`Motor: ${pass} pasaron, ${fail} fallaron.`);
if (fail) {
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
