// Tablero de parchís en SVG. Rejilla de 19x19 unidades:
// casas de 8x8 en las esquinas, brazos de 3 casillas de ancho y meta de 3x3 en el centro.
import { COLORS, SEGUROS, SALIDA, CASA, META, ULTIMA_CASILLA, trackSquare, locKey } from './game.js';

const U = 40;
const SIZE = 19 * U;
const NS = 'http://www.w3.org/2000/svg';

export const HEX = { amarillo: '#f2c230', azul: '#2f7de1', rojo: '#e03c3c', verde: '#2ea44f' };
const LIGHT = { amarillo: '#fbe9a6', azul: '#b9d4f7', rojo: '#f6bcbc', verde: '#b6e3c3' };

// Casillas 1..68 del recorrido común (sentido antihorario). SEQ[n - 1] = [x, y].
const SEQ = (() => {
  const s = [];
  for (let y = 18; y >= 11; y--) s.push([10, y]); // 1..8
  for (let x = 11; x <= 18; x++) s.push([x, 10]); // 9..16
  s.push([18, 9]); // 17
  for (let x = 18; x >= 11; x--) s.push([x, 8]); // 18..25
  for (let y = 7; y >= 0; y--) s.push([10, y]); // 26..33
  s.push([9, 0]); // 34
  for (let y = 0; y <= 7; y++) s.push([8, y]); // 35..42
  for (let x = 7; x >= 0; x--) s.push([x, 8]); // 43..50
  s.push([0, 9]); // 51
  for (let x = 0; x <= 7; x++) s.push([x, 10]); // 52..59
  for (let y = 11; y <= 18; y++) s.push([8, y]); // 60..67
  s.push([9, 18]); // 68
  return s;
})();

const ENTRADA = { amarillo: 68, azul: 17, rojo: 34, verde: 51 };
const CASA_ORIGEN = { amarillo: [11, 11], azul: [11, 0], rojo: [0, 0], verde: [0, 11] };
const META_CENTRO = { amarillo: [9.5, 10.45], azul: [10.45, 9.5], rojo: [9.5, 8.55], verde: [8.55, 9.5] };
const META_TRI = {
  amarillo: [[8, 11], [11, 11], [9.5, 9.5]],
  azul: [[11, 8], [11, 11], [9.5, 9.5]],
  rojo: [[8, 8], [11, 8], [9.5, 9.5]],
  verde: [[8, 8], [8, 11], [9.5, 9.5]],
};

function pasilloCell(color, k) {
  switch (color) {
    case 'amarillo': return [9, 18 - k];
    case 'azul': return [18 - k, 9];
    case 'rojo': return [9, k];
    case 'verde': return [k, 9];
  }
}

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

/** Centro (en unidades) donde dibujar una ficha. */
function spot(color, idx, step, slot, total) {
  if (step === CASA) {
    const [x0, y0] = CASA_ORIGEN[color];
    const o = [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]][idx];
    return [x0 + 4 + o[0], y0 + 4 + o[1]];
  }
  if (step === META) {
    const [cx, cy] = META_CENTRO[color];
    const o = [[-0.3, -0.12], [0.3, -0.12], [-0.3, 0.18], [0.3, 0.18]][idx];
    const vertical = color === 'azul' || color === 'verde';
    return vertical ? [cx + o[1], cy + o[0]] : [cx + o[0], cy + o[1]];
  }
  let x, y;
  if (step > ULTIMA_CASILLA) [x, y] = pasilloCell(color, step - ULTIMA_CASILLA);
  else [x, y] = SEQ[trackSquare(color, step) - 1];
  let cx = x + 0.5, cy = y + 0.5;
  if (total > 1) {
    const d = slot === 0 ? -0.21 : 0.21;
    cx += d;
    cy += d;
  }
  return [cx, cy];
}

export function createBoard(container, onPieceClick) {
  const svg = el('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'tablero', role: 'img', 'aria-label': 'Tablero de parchís' });
  container.appendChild(svg);

  el('rect', { x: 0, y: 0, width: SIZE, height: SIZE, rx: 18, fill: '#fdfaf2' }, svg);

  // Casas
  const casas = {};
  for (const c of COLORS) {
    const [x0, y0] = CASA_ORIGEN[c];
    const g = el('g', { class: 'casa', 'data-color': c }, svg);
    el('rect', { x: x0 * U + 4, y: y0 * U + 4, width: 8 * U - 8, height: 8 * U - 8, rx: 22, fill: HEX[c] }, g);
    el('circle', { cx: (x0 + 4) * U, cy: (y0 + 4) * U, r: 2.9 * U, fill: '#fdfaf2', opacity: 0.92 }, g);
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = spot(c, i, CASA);
      el('circle', { cx: cx * U, cy: cy * U, r: 0.42 * U, fill: LIGHT[c], stroke: HEX[c], 'stroke-width': 2 }, g);
    }
    casas[c] = g;
  }

  // Meta
  for (const c of COLORS) {
    el('polygon', { points: META_TRI[c].map(([x, y]) => `${x * U},${y * U}`).join(' '), fill: HEX[c], stroke: '#fdfaf2', 'stroke-width': 2 }, svg);
  }

  // Recorrido común
  const salidaDe = Object.fromEntries(Object.entries(SALIDA).map(([c, n]) => [n, c]));
  const entradaDe = Object.fromEntries(Object.entries(ENTRADA).map(([c, n]) => [n, c]));
  SEQ.forEach(([x, y], i) => {
    const n = i + 1;
    const c = salidaDe[n] || entradaDe[n];
    el('rect', {
      x: x * U + 1, y: y * U + 1, width: U - 2, height: U - 2, rx: 4,
      fill: salidaDe[n] ? HEX[c] : entradaDe[n] ? LIGHT[c] : '#ffffff',
      stroke: '#c9bfa8', 'stroke-width': 1,
    }, svg);
    if (SEGUROS.has(n)) {
      el('circle', { cx: (x + 0.5) * U, cy: (y + 0.5) * U, r: U * 0.36, fill: 'none', stroke: salidaDe[n] ? '#fff' : '#9a8f78', 'stroke-width': 2, 'stroke-dasharray': '3 3' }, svg);
    }
    const t = el('text', { x: x * U + 4, y: y * U + 12, class: 'num' }, svg);
    t.textContent = n;
  });

  // Pasillos
  for (const c of COLORS) {
    for (let k = 1; k <= 7; k++) {
      const [x, y] = pasilloCell(c, k);
      el('rect', { x: x * U + 1, y: y * U + 1, width: U - 2, height: U - 2, rx: 4, fill: LIGHT[c], stroke: HEX[c], 'stroke-width': 1 }, svg);
    }
  }

  const piecesLayer = el('g', { class: 'fichas' }, svg);
  let pieceEls = {};
  let currentColors = '';

  function buildPieces(colors) {
    piecesLayer.innerHTML = '';
    pieceEls = {};
    for (const c of colors) {
      pieceEls[c] = [0, 1, 2, 3].map((i) => {
        const g = el('g', { class: 'ficha', 'data-color': c, 'data-idx': i }, piecesLayer);
        el('circle', { r: 0.62 * U, class: 'aro' }, g);
        el('circle', { r: 0.33 * U, fill: HEX[c], stroke: '#fff', 'stroke-width': 3, class: 'cuerpo' }, g);
        el('circle', { r: 0.14 * U, fill: 'rgba(255,255,255,.55)' }, g);
        el('circle', { r: 0.62 * U, fill: 'transparent' }, g); // zona táctil grande
        g.addEventListener('click', () => onPieceClick(c, i));
        return g;
      });
    }
  }

  function update(state, { movable = [] } = {}) {
    if (state.colors.join() !== currentColors) {
      buildPieces(state.colors);
      currentColors = state.colors.join();
    }
    for (const c of COLORS) {
      casas[c].classList.toggle('inactiva', !state.colors.includes(c));
      casas[c].classList.toggle('turno', state.phase !== 'ended' && state.colors[state.turn] === c);
    }

    const groups = {};
    for (const c of state.colors) {
      state.pieces[c].forEach((s, i) => {
        const k = locKey(c, s);
        (groups[k] ||= []).push({ c, i });
      });
    }
    const turnColor = state.colors[state.turn];
    const movableSet = new Set(movable);
    for (const c of state.colors) {
      state.pieces[c].forEach((s, i) => {
        const g = pieceEls[c][i];
        const grp = groups[locKey(c, s)];
        const slot = grp.findIndex((p) => p.c === c && p.i === i);
        const [cx, cy] = spot(c, i, s, slot, s === CASA || s === META ? 1 : grp.length);
        const scale = s === META ? 0.62 : 1;
        g.style.transform = `translate(${cx * U}px, ${cy * U}px) scale(${scale})`;
        const canMove = c === turnColor && movableSet.has(i);
        g.classList.toggle('movible', canMove);
      });
    }
    // Las fichas que se pueden mover, encima de todo.
    for (const g of piecesLayer.querySelectorAll('.ficha.movible')) piecesLayer.appendChild(g);
  }

  return { update };
}
