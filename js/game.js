// Lógica pura del parchís (sin DOM ni red). Todas las funciones devuelven un estado nuevo.
//
// Cada ficha guarda su "paso" dentro de su propio recorrido:
//   -1      → en casa
//   0..63   → recorrido común (0 = casilla de salida, 63 = casilla de entrada al pasillo)
//   64..70  → pasillo de su color (7 casillas)
//   71      → meta

export const COLORS = ['amarillo', 'azul', 'rojo', 'verde'];
export const COLOR_NAMES = { amarillo: 'Amarillo', azul: 'Azul', rojo: 'Rojo', verde: 'Verde' };
export const SALIDA = { amarillo: 5, azul: 22, rojo: 39, verde: 56 };
export const SEGUROS = new Set([5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68]);

export const CASA = -1;
export const ULTIMA_CASILLA = 63;
export const META = 71;
export const BONUS_COMER = 20;
export const BONUS_META = 10;

const COLORES_POR_JUGADORES = {
  2: ['amarillo', 'rojo'],
  3: ['amarillo', 'azul', 'rojo'],
  4: COLORS,
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Número de casilla (1..68) del recorrido común, o null si está en casa/pasillo/meta. */
export function trackSquare(color, step) {
  if (step < 0 || step > ULTIMA_CASILLA) return null;
  return ((SALIDA[color] - 1 + step) % 68) + 1;
}

/** Clave única de la posición física en el tablero. */
export function locKey(color, step) {
  if (step === CASA) return `C:${color}`;
  if (step === META) return `M:${color}`;
  if (step > ULTIMA_CASILLA) return `P:${color}:${step - ULTIMA_CASILLA}`;
  return `T:${trackSquare(color, step)}`;
}

export function piecesAt(state, key) {
  const out = [];
  for (const c of state.colors) {
    state.pieces[c].forEach((s, i) => {
      if (locKey(c, s) === key) out.push({ color: c, idx: i });
    });
  }
  return out;
}

const isBarrier = (occ) => occ.length === 2 && occ[0].color === occ[1].color;

export function createGame(players, options = {}) {
  const colors = COLORES_POR_JUGADORES[players.length];
  if (!colors) throw new Error('El parchís es de 2 a 4 jugadores');
  return {
    colors,
    players: players.map((p, i) => ({ id: p.id, name: p.name, color: colors[i], connected: p.connected ?? true })),
    pieces: Object.fromEntries(colors.map((c) => [c, [CASA, CASA, CASA, CASA]])),
    turn: 0,
    phase: 'roll', // roll | move | bonus | ended
    dice: null,
    value: null,
    sixes: 0,
    extraRoll: false,
    lastMoved: null,
    legal: [],
    winner: null,
    lastAction: null,
    seq: 0,
    log: ['¡Empieza la partida!'],
    options: { sixIsSeven: options.sixIsSeven ?? true },
  };
}

function nameOf(state, color) {
  return state.players.find((p) => p.color === color)?.name ?? COLOR_NAMES[color];
}

function log(state, text) {
  state.log.push(text);
  if (state.log.length > 40) state.log.shift();
}

/** Comprueba si una ficha puede avanzar n casillas. Devuelve el movimiento o null. */
export function checkMove(state, color, idx, n) {
  const pos = state.pieces[color][idx];
  if (pos === META) return null;

  if (pos === CASA) {
    if (n !== 5) return null;
    const occ = piecesAt(state, locKey(color, 0));
    if (occ.length < 2) return { color, idx, from: CASA, to: 0, eat: null };
    const enemies = occ.filter((o) => o.color !== color);
    if (!enemies.length) return null; // barrera propia en la salida
    // Al salir con la salida ocupada por dos fichas, se come a una rival.
    return { color, idx, from: CASA, to: 0, eat: enemies[enemies.length - 1] };
  }

  const to = pos + n;
  if (to > META) return null; // hay que entrar justo

  for (let s = pos + 1; s < to; s++) {
    if (isBarrier(piecesAt(state, locKey(color, s)))) return null;
  }
  if (to === META) return { color, idx, from: pos, to, eat: null };

  const occ = piecesAt(state, locKey(color, to));
  if (occ.length >= 2) return null;
  if (occ.length === 1 && occ[0].color !== color) {
    const sq = trackSquare(color, to);
    if (sq !== null && !SEGUROS.has(sq)) return { color, idx, from: pos, to, eat: occ[0] };
  }
  return { color, idx, from: pos, to, eat: null };
}

export function legalMoves(state, color, n, { bonus = false, rawDice = null } = {}) {
  let moves = [0, 1, 2, 3].map((i) => checkMove(state, color, i, n)).filter(Boolean);
  if (bonus) return moves.filter((m) => m.from !== CASA);

  // Con un 5 es obligatorio sacar ficha si se puede.
  if (n === 5) {
    const exits = moves.filter((m) => m.from === CASA);
    if (exits.length) return exits;
  }

  // Con un 6 es obligatorio abrir barrera si se puede.
  if (rawDice === 6) {
    const barrierIdx = new Set();
    state.pieces[color].forEach((s, i) => {
      if (s >= 0 && s <= ULTIMA_CASILLA && isBarrier(piecesAt(state, locKey(color, s)))) barrierIdx.add(i);
    });
    const opening = moves.filter((m) => barrierIdx.has(m.idx));
    if (opening.length) return opening;
  }
  return moves;
}

function endTurn(s) {
  s.turn = (s.turn + 1) % s.players.length;
  s.phase = 'roll';
  s.sixes = 0;
  s.extraRoll = false;
  s.lastMoved = null;
  s.legal = [];
  s.value = null;
  return s;
}

function afterMove(s) {
  if (s.extraRoll) {
    s.phase = 'roll';
    s.legal = [];
    s.value = null;
    log(s, `${nameOf(s, s.colors[s.turn])} vuelve a tirar.`);
    return s;
  }
  return endTurn(s);
}

/** Tira el dado con el valor d (1..6). El azar lo pone quien llama (el anfitrión). */
export function roll(state, d) {
  if (state.phase !== 'roll') return null;
  const s = clone(state);
  const color = s.colors[s.turn];
  const who = nameOf(s, color);
  s.seq++;
  s.lastAction = 'roll';
  s.dice = d;

  if (d === 6) s.sixes++;
  if (d === 6 && s.sixes === 3) {
    const lm = s.lastMoved;
    const pos = lm ? s.pieces[lm.color][lm.idx] : null;
    if (lm && pos >= 0 && pos <= ULTIMA_CASILLA) {
      s.pieces[lm.color][lm.idx] = CASA;
      log(s, `¡Tres seises! La última ficha que movió ${who} vuelve a casa.`);
    } else {
      log(s, `¡Tres seises! ${who} pierde el turno.`);
    }
    return endTurn(s);
  }

  const allOut = !s.pieces[color].includes(CASA);
  s.value = d === 6 && s.options.sixIsSeven && allOut ? 7 : d;
  s.extraRoll = d === 6;
  s.legal = legalMoves(s, color, s.value, { rawDice: d });

  log(s, `${who} saca un ${d}${s.value !== d ? ` (cuenta ${s.value})` : ''}.`);
  if (!s.legal.length) {
    log(s, `${who} no puede mover.`);
    if (s.extraRoll) {
      s.phase = 'roll';
      return s;
    }
    return endTurn(s);
  }
  s.phase = 'move';
  return s;
}

/** Mueve la ficha idx del jugador en turno (fase move o bonus). */
export function move(state, idx) {
  if (state.phase !== 'move' && state.phase !== 'bonus') return null;
  const m = state.legal.find((x) => x.idx === idx);
  if (!m) return null;
  const s = clone(state);
  const color = s.colors[s.turn];
  const who = nameOf(s, color);
  s.seq++;
  s.lastAction = 'move';

  s.pieces[color][idx] = m.to;
  s.lastMoved = { color, idx };
  let bonus = 0;

  if (m.eat) {
    s.pieces[m.eat.color][m.eat.idx] = CASA;
    bonus = BONUS_COMER;
    log(s, `¡${who} se come una ficha de ${nameOf(s, m.eat.color)}! Cuenta 20.`);
  }
  if (m.to === META) {
    bonus = BONUS_META;
    log(s, `${who} mete una ficha en la meta. Cuenta 10.`);
  }

  if (s.pieces[color].every((p) => p === META)) {
    s.phase = 'ended';
    s.winner = color;
    s.legal = [];
    log(s, `🏆 ¡${who} gana la partida!`);
    return s;
  }

  if (bonus) {
    const lm = legalMoves(s, color, bonus, { bonus: true });
    if (lm.length) {
      s.phase = 'bonus';
      s.value = bonus;
      s.legal = lm;
      return s;
    }
    log(s, `${who} no puede usar las ${bonus}.`);
  }
  return afterMove(s);
}

/** Pasa el turno del jugador actual (por ejemplo, si se ha desconectado). */
export function skipTurn(state) {
  if (state.phase === 'ended') return null;
  const s = clone(state);
  s.seq++;
  s.lastAction = 'skip';
  log(s, `Se salta el turno de ${nameOf(s, s.colors[s.turn])}.`);
  return endTurn(s);
}
