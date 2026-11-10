# Blackjack Coach

PWA para aprender estrategia básica de blackjack jugando en el teléfono, sin conexión. HTML, CSS y JavaScript (módulos ES), sin framework ni build.

## Correr en local

```bash
cd blackjack-coach
python3 -m http.server 8000
# abre http://localhost:8000
```

El service worker solo funciona servido por `http://localhost` o `https`. Tras la primera carga, la app abre y se juega sin conexión.

Para instalarla en el teléfono: publícala en cualquier hosting estático (por ejemplo GitHub Pages; usa rutas relativas, funciona bajo subcarpeta) y en Safari usa "Compartir → Agregar a inicio".

## Tests

Requieren Node 18 o superior. Sin dependencias.

```bash
node tests/strategy.test.mjs   # todas las celdas de las 4 mesas + respaldos
node tests/engine.test.mjs     # pagos, peek, seguro, dividir, DAS, H17/S17, recarga, mano sombra, storage
node tests/simulate.mjs        # 1.000.000 de manos por mesa (unos 6 s). Acepta otro número: node tests/simulate.mjs 10000000
node tests/qa-strategy-reference.mjs  # QA: estrategia contra la transcripción de Wizard of Odds
```

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura de la página, metas de PWA e íconos. |
| `styles.css` | Todo el diseño (modo oscuro, mesa, cartas, botones, tabla). |
| `app.js` | Interfaz y estado: pantallas, modos, fichas, rachas, estadísticas, desbloqueos. |
| `engine.js` | Motor sin DOM: zapato (Fisher-Yates con `crypto.getRandomValues`), reparto, jugadas, crupier, pagos, mano sombra, economía. |
| `strategy.js` | Estrategia básica sin DOM: tablas por reglas, `bestAction(hand, dealerUp, rules, available)`, explicaciones. |
| `config.js` | **Mesas, reglas, umbrales de desbloqueo, economía, rachas y tiempo de Contrarreloj.** |
| `storage.js` | `localStorage` siempre en try/catch (clave `bjcoach.v1`); si falla, sigue en memoria y avisa. |
| `sw.js` | Service worker: precache (saltando el caché HTTP), cache-first, cache `bjcoach-v2`. |
| `manifest.webmanifest`, `icons/` | Datos de instalación e íconos (180, 192, 512). |
| `tests/` | Tests y simulación. |
| `docs/capturas/` | Capturas de cada pantalla a 375×812. |

## Dónde se edita

- **Mesas y reglas** (mazos, H17/S17, DAS, rendición, apuesta mínima y máxima): `TABLES` en `config.js`.
- **Umbrales de desbloqueo** (fichas y precisión): campo `unlock` de cada mesa en `config.js`.
- **Ventana de precisión** (últimas 50 manos de Práctica): `ACCURACY_WINDOW`.
- **Multiplicadores de racha**: `STREAK_TIERS`.
- **Fichas iniciales y recarga**: `ECONOMY`.
- **Penetración del zapato** (re-baraja al 75%): `SHOE.penetration`.

Si cambias reglas de una mesa, actualiza las tablas esperadas en `tests/strategy.test.mjs` y la referencia en `tests/simulate.mjs`.

**Al publicar cambios**, sube la versión del cache en `sw.js` (`bjcoach-v2` → `bjcoach-v3`) para que los teléfonos que ya la tienen instalada bajen la nueva.

## Publicación

La app está publicada en GitHub Pages desde la rama `main`, carpeta raíz:

**https://valentino-crecia.github.io/blackjack-coach/**

### Instalarla en el teléfono

- **iPhone:** abre la URL en Safari → botón Compartir → "Agregar a inicio".
- **Android:** abre la URL en Chrome → menú ⋮ → "Instalar app" (o "Agregar a la pantalla principal").

Prueba rápida: ábrela una vez con red, activa el modo avión y ábrela desde el ícono. Debe abrir y dejar jugar.

### Publicar una versión nueva

1. Sube la versión del cache en `sw.js` (`bjcoach-v2` → `bjcoach-v3`, y así). Sin esto, los teléfonos que ya la tienen siguen con la versión vieja.
2. `git commit` y `git push` a `main`. GitHub Pages publica solo en uno o dos minutos (estado en la pestaña Actions del repo).
3. En el teléfono, abre la app con red: la versión nueva se descarga y queda activa la siguiente vez que la abras.

Para revertir: `git revert <commit>`, sube otra vez la versión del cache y haz push.

## Reglas de la app que conviene saber

- La apuesta se cobra al repartir. Si sales a mitad de mano (botón ← o Estadísticas) pierdes lo apostado, incluido lo doblado, dividido o el seguro, y las decisiones ya tomadas cuentan para Práctica. Si cierras o recargas la página a mitad de mano, al volver esa mano se cierra como abandonada.
- El bono de racha solo se paga en manos de Práctica con al menos una decisión (un blackjack natural no lo da).

## Simulación vs. referencia

Estrategia perfecta, apuesta fija, 1.000.000 de manos por mesa. Referencia: ventaja de la casa de la [calculadora de Wizard of Odds](https://wizardofodds.com/games/blackjack/calculator/), columna "Basic strategy with cut card", con 3:2, peek, dividir hasta 4 manos, sin re-dividir ni pedir sobre ases divididos y doblar con cualquier par de cartas.

| Mesa | Reglas | Referencia (retorno) |
|---|---|---|
| Ávila | 6 mazos, S17, DAS, rendición | −0,354% |
| Los Roques | 8 mazos, H17, DAS, sin rendición | −0,661% |
| Mérida | 4 mazos, S17, sin DAS, sin rendición | −0,529% |
| Canaima | 6 mazos, H17, DAS, rendición | −0,551% |

Con 1.000.000 de manos el error estándar es de unos ±0,11 pp, así que la simulación acepta hasta 0,3 pp de diferencia. Resultado con 10.000.000 de manos por mesa: Ávila −0,355%, Los Roques −0,729%, Mérida −0,534%, Canaima −0,580%.

## Fuente de la estrategia

Tablas de estrategia básica de Wizard of Odds para 4 a 8 mazos, por total (no por composición), con los cambios por H17, sin DAS y sin rendición.
