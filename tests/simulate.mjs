// Simulación: estrategia perfecta, apuesta fija, N manos por mesa.
// Corre con: node tests/simulate.mjs [manos]   (por defecto 1.000.000)
// Compara el retorno con la ventaja de la casa de Wizard of Odds para esas reglas
// ("Basic strategy with cut card", https://wizardofodds.com/games/blackjack/calculator/).
import { Shoe, Round, playPerfect } from '../engine.js';
import { TABLES, rulesOf } from '../config.js';

const HANDS = Number(process.argv[2]) || 1_000_000;
const BET = 10;
const TOLERANCE_PP = 0.3;

// Ventaja de la casa (%) de Wizard of Odds: 3:2, peek, dividir hasta 4 manos,
// sin re-dividir ni pedir sobre ases divididos, doblar con cualquier par de cartas.
const REFERENCE = {
  avila: 0.3536, // 6 mazos, S17, DAS, rendición tardía
  roques: 0.6608, // 8 mazos, H17, DAS, sin rendición
  merida: 0.5291, // 4 mazos, S17, sin DAS, sin rendición
  canaima: 0.5505, // 6 mazos, H17, DAS, rendición tardía
};

let bugs = 0;
console.log(`Simulación: ${HANDS.toLocaleString('es-VE')} manos por mesa, apuesta fija de ${BET}.`);
console.log('Mesa               Retorno    Referencia  Diferencia  Error est.  Tiempo');
for (const table of TABLES) {
  const rules = rulesOf(table);
  const shoe = new Shoe(table.decks);
  let total = 0;
  let sumSq = 0;
  const t0 = Date.now();
  for (let i = 0; i < HANDS; i++) {
    if (shoe.needsShuffle()) shoe.shuffle();
    const r = playPerfect(new Round({ shoe, rules, bet: BET, bankroll: Infinity }));
    const x = r.net / BET;
    total += x;
    sumSq += x * x;
  }
  const mean = total / HANDS;
  const sd = Math.sqrt(sumSq / HANDS - mean * mean);
  const se = (sd / Math.sqrt(HANDS)) * 100;
  const ret = mean * 100;
  const ref = -REFERENCE[table.id];
  const diff = ret - ref;
  const flag = Math.abs(diff) > TOLERANCE_PP ? '  ← REVISAR' : '';
  if (flag) bugs++;
  const pct = (n) => (n >= 0 ? '+' : '') + n.toFixed(3) + '%';
  console.log(
    `${table.name.padEnd(18)} ${pct(ret).padStart(8)}   ${pct(ref).padStart(8)}   ${(diff >= 0 ? '+' : '') + diff.toFixed(3)} pp   ±${se.toFixed(3)} pp  ${((Date.now() - t0) / 1000).toFixed(1)} s${flag}`,
  );
}
if (bugs) {
  console.log(`\n${bugs} mesa(s) con diferencia mayor a ${TOLERANCE_PP} pp.`);
  process.exit(1);
}
console.log(`\nTodas las mesas dentro de ±${TOLERANCE_PP} pp de la referencia.`);
