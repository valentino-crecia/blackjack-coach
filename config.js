// Configuración editable: mesas, umbrales de desbloqueo, economía y rachas.
// Cambia aquí las reglas o los requisitos; el resto de la app los lee de este archivo.

export const TABLES = [
  {
    id: 'avila',
    name: 'Mesa Ávila',
    decks: 6,
    h17: false, // false = el crupier se planta con 17 blando (S17)
    das: true, // doblar después de dividir
    surrender: true, // rendición tardía
    minBet: 10,
    maxBet: 50,
    unlock: null, // abierta desde el inicio
  },
  {
    id: 'roques',
    name: 'Mesa Los Roques',
    decks: 8,
    h17: true,
    das: true,
    surrender: false,
    minBet: 10,
    maxBet: 100,
    unlock: { chips: 1500, accuracy: 80 },
  },
  {
    id: 'merida',
    name: 'Mesa Mérida',
    decks: 4,
    h17: false,
    das: false,
    surrender: false,
    minBet: 10,
    maxBet: 150,
    unlock: { chips: 2500, accuracy: 85 },
  },
  {
    id: 'canaima',
    name: 'Mesa Canaima',
    decks: 6,
    h17: true,
    das: true,
    surrender: true,
    minBet: 10,
    maxBet: 200,
    unlock: { chips: 4000, accuracy: 90 },
  },
];

// Reglas de referencia para marcar en la Tabla las celdas que cambian.
export const BASE_TABLE_ID = 'avila';

export const ECONOMY = {
  startChips: 1000,
  reloadTo: 1000, // la recarga deja el saldo en este valor (no suma)
  minToPlay: 10, // por debajo de esto aparece "Recargar"
  betStep: 10,
};

export const SHOE = {
  penetration: 0.75, // se re-baraja al pasar este porcentaje del zapato
};

export const MAX_HANDS = 4; // dividir hasta 4 manos

// Precisión para desbloquear: últimas N manos de Práctica.
export const ACCURACY_WINDOW = 50;

// Multiplicador de racha (de mayor a menor).
export const STREAK_TIERS = [
  { from: 50, mult: 3 },
  { from: 25, mult: 2 },
  { from: 10, mult: 1.5 },
  { from: 0, mult: 1 },
];

export const TIMED = { seconds: 60 };

export const STORAGE_KEY = 'bjcoach.v1';

export function tableById(id) {
  return TABLES.find((t) => t.id === id) || TABLES[0];
}

export function rulesOf(table) {
  return { h17: !!table.h17, das: !!table.das, surrender: !!table.surrender };
}
