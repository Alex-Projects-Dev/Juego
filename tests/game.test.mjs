import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, roll, move, checkMove, trackSquare, CASA, META } from '../js/game.js';

const players = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Bea' },
  { id: 'c', name: 'Carlos' },
];
const nueva = () => createGame(players);
// Paso de un color para llegar a una casilla concreta del recorrido común.
const stepFor = (color, sq) => (sq - { amarillo: 5, azul: 22, rojo: 39, verde: 56 }[color] + 68) % 68;

test('3 jugadores usan amarillo, azul y rojo', () => {
  assert.deepEqual(nueva().colors, ['amarillo', 'azul', 'rojo']);
});

test('casillas del recorrido', () => {
  assert.equal(trackSquare('amarillo', 0), 5);
  assert.equal(trackSquare('amarillo', 63), 68);
  assert.equal(trackSquare('azul', 0), 22);
  assert.equal(trackSquare('azul', 63), 17);
  assert.equal(trackSquare('rojo', 63), 34);
});

test('sin un 5 no se sale y pasa el turno', () => {
  const s = roll(nueva(), 3);
  assert.equal(s.turn, 1);
  assert.equal(s.phase, 'roll');
});

test('con un 5 se sale de casa', () => {
  let s = roll(nueva(), 5);
  assert.equal(s.phase, 'move');
  s = move(s, 0);
  assert.equal(s.pieces.amarillo[0], 0);
  assert.equal(s.turn, 1);
});

test('con un 6 sin poder mover se vuelve a tirar', () => {
  const s = roll(nueva(), 6);
  assert.equal(s.turn, 0);
  assert.equal(s.phase, 'roll');
});

test('comer da 20 de bonus', () => {
  let s = nueva();
  s.pieces.amarillo = [2, CASA, CASA, CASA]; // casilla 7
  s.pieces.amarillo[1] = 10;
  s.pieces.azul = [stepFor('azul', 9), CASA, CASA, CASA]; // casilla 9, no es seguro
  s = roll(s, 2);
  s = move(s, 0);
  assert.equal(s.pieces.azul[0], CASA);
  assert.equal(s.phase, 'bonus');
  assert.equal(s.value, 20);
  s = move(s, 1);
  assert.equal(s.pieces.amarillo[1], 30);
  assert.equal(s.turn, 1);
});

test('no se come en un seguro', () => {
  const s = nueva();
  s.pieces.amarillo = [2, CASA, CASA, CASA];
  s.pieces.azul = [stepFor('azul', 12), CASA, CASA, CASA]; // 12 es seguro
  const m = checkMove(s, 'amarillo', 0, 5);
  assert.ok(m);
  assert.equal(m.eat, null);
});

test('una barrera no se puede pasar', () => {
  const s = nueva();
  s.pieces.amarillo = [2, 4, CASA, CASA]; // casillas 7 y 9
  s.pieces.azul = [stepFor('azul', 8), stepFor('azul', 8), CASA, CASA];
  assert.equal(checkMove(s, 'amarillo', 0, 3), null); // pasar por ella
  assert.equal(checkMove(s, 'amarillo', 0, 1), null); // caer en ella
  assert.ok(checkMove(s, 'amarillo', 1, 3)); // la que ya está delante sí avanza
});

test('con un 6 es obligatorio abrir barrera', () => {
  let s = nueva();
  s.pieces.amarillo = [10, 10, 30, CASA];
  s = roll(s, 6);
  assert.deepEqual(s.legal.map((m) => m.idx).sort(), [0, 1]);
});

test('el 6 cuenta 7 si no quedan fichas en casa', () => {
  let s = nueva();
  s.pieces.amarillo = [10, 20, 30, 40];
  s = roll(s, 6);
  assert.equal(s.value, 7);
});

test('a la meta hay que entrar justo y da 10', () => {
  let s = nueva();
  s.pieces.amarillo = [68, 20, CASA, CASA];
  assert.equal(checkMove(s, 'amarillo', 0, 4), null);
  s = roll(s, 3);
  s = move(s, 0);
  assert.equal(s.pieces.amarillo[0], META);
  assert.equal(s.phase, 'bonus');
  assert.equal(s.value, 10);
});

test('tres seises: la última ficha movida vuelve a casa', () => {
  let s = nueva();
  s.pieces.amarillo = [10, 20, 30, CASA];
  s = roll(s, 6); s = move(s, 0);
  s = roll(s, 6); s = move(s, 0);
  assert.equal(s.turn, 0);
  s = roll(s, 6);
  assert.equal(s.pieces.amarillo[0], CASA);
  assert.equal(s.turn, 1);
});

test('salir con la salida ocupada por dos rivales se come a una', () => {
  let s = nueva();
  const sq5Azul = stepFor('azul', 5);
  s.pieces.azul = [sq5Azul, CASA, CASA, CASA];
  s.pieces.rojo = [stepFor('rojo', 5), CASA, CASA, CASA];
  s = roll(s, 5);
  s = move(s, 0);
  assert.equal(s.pieces.amarillo[0], 0);
  assert.equal(s.pieces.rojo[0], CASA);
  assert.equal(s.phase, 'bonus');
});

test('gana quien mete las 4', () => {
  let s = nueva();
  s.pieces.amarillo = [META, META, META, 70];
  s = roll(s, 1);
  s = move(s, 3);
  assert.equal(s.phase, 'ended');
  assert.equal(s.winner, 'amarillo');
});
