import { createGame, roll, move, skipTurn, COLOR_NAMES, META } from './game.js';
import { createBoard, HEX } from './board.js';
import { hostRoom, joinRoom, send } from './net.js';

const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
};

const myId = store.get('parchis.id') || (() => {
  const id = Math.random().toString(36).slice(2, 10);
  store.set('parchis.id', id);
  return id;
})();

const app = {
  mode: null, // 'host' | 'guest' | 'local'
  code: null,
  net: null,
  lobby: [], // [{ id, name, connected }]
  conns: new Map(), // id -> conn (solo anfitrión)
  game: null,
  autoSeq: -1,
  lastSeenSeq: -1,
};

// ---------- Utilidades de interfaz ----------
function show(id) {
  document.querySelectorAll('.pantalla').forEach((s) => s.classList.toggle('activa', s.id === id));
}

let avisoTimer;
function aviso(text, ms = 3000) {
  const a = $('#aviso');
  a.textContent = text;
  a.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => (a.hidden = true), ms);
}

const myName = () => ($('#nombre').value.trim() || 'Jugador').slice(0, 14);
const randomCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
const rollDie = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 6) + 1;
};
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Tablero ----------
const board = createBoard($('#tablero'), (color, idx) => {
  const g = app.game;
  if (!g || !isMyTurn() || (g.phase !== 'move' && g.phase !== 'bonus')) return;
  if (g.colors[g.turn] !== color) return;
  act({ type: 'move', idx });
});

function isMyTurn() {
  const g = app.game;
  if (!g || g.phase === 'ended') return false;
  return app.mode === 'local' || g.players[g.turn].id === myId;
}

// ---------- Acciones ----------
function act(action) {
  if (app.mode === 'guest') app.net?.send({ type: 'action', action });
  else hostApply(app.mode === 'local' ? app.game?.players[app.game.turn].id : myId, action);
}

function hostApply(playerId, action) {
  if (action.type === 'restart') {
    if (playerId !== myId && app.mode !== 'local') return;
    app.game = createGame(app.game.players, app.game.options);
    return publish();
  }
  const g = app.game;
  if (!g) return;
  const current = g.players[g.turn];
  let next = null;
  if (action.type === 'skip') {
    if (playerId === myId && !current.connected) next = skipTurn(g);
  } else if (current.id === playerId || app.mode === 'local') {
    if (action.type === 'roll') next = roll(g, rollDie());
    else if (action.type === 'move') next = move(g, action.idx);
  }
  if (next) {
    app.game = next;
    publish();
  }
}

function publish() {
  if (app.mode === 'host') {
    for (const conn of app.conns.values()) send(conn, { type: 'state', state: app.game });
    store.set('parchis.host', { code: app.code, game: app.game, lobby: app.lobby, t: Date.now() });
  }
  renderGame();
}

// ---------- Anfitrión ----------
function startHost(code = randomCode(), retries = 0) {
  app.mode = 'host';
  app.code = code;
  app.net?.destroy();
  app.net = hostRoom(code, {
    onOpen() {
      if (app.game) {
        show('partida');
        renderGame();
        aviso('Sala recuperada. Los demás pueden volver a unirse.');
      } else {
        show('sala');
        renderLobby();
      }
    },
    onData: hostOnData,
    onClose(conn) {
      const id = conn.playerId;
      if (!id || app.conns.get(id) !== conn) return;
      app.conns.delete(id);
      if (app.game) {
        const p = app.game.players.find((x) => x.id === id);
        if (p) p.connected = false;
        aviso(`${p?.name ?? 'Alguien'} se ha desconectado`);
        publish();
      } else {
        app.lobby = app.lobby.filter((x) => x.id !== id);
        broadcastLobby();
      }
    },
    onError(err) {
      if (err.type === 'unavailable-id') {
        // Código ocupado (o la sala anterior aún no se ha liberado).
        if (app.game && retries < 6) return setTimeout(() => startHost(code, retries + 1), 2500);
        if (!app.game) return startHost(randomCode());
      }
      aviso('Error de conexión: ' + (err.type || err.message));
    },
  });
}

function hostOnData(conn, msg) {
  if (msg?.type === 'join') {
    const id = String(msg.id).slice(0, 20);
    const name = String(msg.name || 'Jugador').slice(0, 14);
    if (app.game) {
      const p = app.game.players.find((x) => x.id === id);
      if (!p) return send(conn, { type: 'error', msg: 'La partida ya ha empezado' });
      p.connected = true;
      conn.playerId = id;
      app.conns.set(id, conn);
      aviso(`${p.name} ha vuelto`);
      return publish();
    }
    let p = app.lobby.find((x) => x.id === id);
    if (!p) {
      if (app.lobby.length >= 4) return send(conn, { type: 'error', msg: 'La sala está llena' });
      p = { id, name, connected: true };
      app.lobby.push(p);
    }
    p.name = name;
    conn.playerId = id;
    app.conns.set(id, conn);
    return broadcastLobby();
  }
  if (msg?.type === 'action' && conn.playerId) hostApply(conn.playerId, msg.action || {});
}

function broadcastLobby() {
  for (const conn of app.conns.values()) send(conn, { type: 'lobby', players: app.lobby, code: app.code });
  renderLobby();
}

// ---------- Invitado ----------
function startGuest(code) {
  app.mode = 'guest';
  app.code = code;
  app.net?.destroy();
  aviso('Conectando…', 8000);
  const net = joinRoom(code, {
    onOpen() {
      net.send({ type: 'join', id: myId, name: myName() });
      $('#aviso').hidden = true;
    },
    onData(msg) {
      if (msg.type === 'lobby') {
        app.lobby = msg.players;
        show('sala');
        renderLobby();
      } else if (msg.type === 'state') {
        app.game = msg.state;
        show('partida');
        renderGame();
      } else if (msg.type === 'error') {
        aviso(msg.msg);
        salir();
      }
    },
    onClose() {
      if (app.mode !== 'guest') return;
      aviso('Se ha perdido la conexión. Reintentando…', 4000);
      setTimeout(() => app.mode === 'guest' && app.code === code && startGuest(code), 2500);
    },
    onError(err) {
      if (err.type === 'peer-unavailable') {
        aviso(app.game ? 'El anfitrión no responde. Reintentando…' : 'No existe ninguna sala con ese código');
        if (app.game) return setTimeout(() => app.mode === 'guest' && startGuest(code), 4000);
        return salir(false);
      }
      aviso('Error de conexión: ' + (err.type || err.message));
    },
  });
  app.net = net;
}

// ---------- Local (un solo móvil) ----------
function startLocal() {
  app.mode = 'local';
  const base = myName();
  app.game = createGame([
    { id: 'l1', name: base },
    { id: 'l2', name: 'Jugador 2' },
    { id: 'l3', name: 'Jugador 3' },
  ]);
  show('partida');
  renderGame();
}

function salir(goHome = true) {
  const wasHost = app.mode === 'host';
  app.net?.destroy();
  Object.assign(app, { mode: null, code: null, net: null, lobby: [], game: null });
  app.conns.clear();
  if (wasHost) store.del('parchis.host');
  $('#final').hidden = true;
  history.replaceState(null, '', location.pathname);
  show('inicio');
  refreshRecuperar();
}

// ---------- Render ----------
function renderLobby() {
  const isHost = app.mode === 'host';
  $('#codigoSala').textContent = app.code;
  const colores = { 2: ['amarillo', 'rojo'], 3: ['amarillo', 'azul', 'rojo'], 4: ['amarillo', 'azul', 'rojo', 'verde'] }[app.lobby.length] || ['amarillo'];
  $('#jugadores').innerHTML = app.lobby
    .map((p, i) => {
      const c = colores[i] || 'amarillo';
      return `<li><span class="punto" style="background:${HEX[c]}"></span>${esc(p.name)}${p.id === myId ? ' <em>(tú)</em>' : ''}${i === 0 ? ' 👑' : ''}</li>`;
    })
    .join('') + (app.lobby.length < 3 ? `<li class="hueco">Esperando jugadores… (${app.lobby.length}/3)</li>` : '');
  $('#empezar').hidden = !isHost;
  $('#opcionSiete').hidden = !isHost;
  $('#compartir').hidden = false;
  $('#esperando').hidden = isHost;
  $('#empezar').disabled = app.lobby.length < 2;
  $('#empezar').textContent = app.lobby.length < 3 ? `Empezar con ${app.lobby.length}` : 'Empezar';
}

const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
function renderDice(d) {
  const dice = $('#dado');
  dice.innerHTML = Array.from({ length: 9 }, (_, i) => `<i class="${d && PIPS[d].includes(i + 1) ? 'on' : ''}"></i>`).join('');
}

function renderGame() {
  const g = app.game;
  if (!g) return;
  const myTurn = isMyTurn();
  const turnPlayer = g.players[g.turn];
  const turnColor = turnPlayer.color;

  board.update(g, { movable: myTurn ? g.legal.map((m) => m.idx) : [] });

  // Marcador
  $('#marcador').innerHTML = g.players
    .map((p) => {
      const enMeta = g.pieces[p.color].filter((x) => x === META).length;
      const cls = ['jug', p.color === turnColor && g.phase !== 'ended' ? 'activo' : '', p.connected === false ? 'off' : ''].join(' ');
      return `<div class="${cls}" style="--c:${HEX[p.color]}"><span class="punto"></span>${esc(p.name)}${p.id === myId && app.mode !== 'local' ? ' (tú)' : ''}<small>${'●'.repeat(enMeta)}${'○'.repeat(4 - enMeta)}</small></div>`;
    })
    .join('');

  // Dado
  renderDice(g.dice);
  const dice = $('#dado');
  dice.style.setProperty('--c', HEX[turnColor]);
  dice.disabled = !(myTurn && g.phase === 'roll');
  dice.classList.toggle('listo', myTurn && g.phase === 'roll');
  if (g.seq !== app.lastSeenSeq && g.lastAction === 'roll') {
    dice.classList.remove('rodando');
    void dice.offsetWidth;
    dice.classList.add('rodando');
  }

  // Texto de turno
  const quien = app.mode === 'local' || !myTurn ? esc(turnPlayer.name) : 'Tu turno';
  let que = '';
  if (g.phase === 'roll') que = myTurn ? 'tira el dado' : 'está tirando…';
  else if (g.phase === 'move') que = myTurn ? `mueve ${g.value}` : `está moviendo ${g.value}…`;
  else if (g.phase === 'bonus') que = myTurn ? `¡cuenta ${g.value}! elige ficha` : `cuenta ${g.value}…`;
  $('#turno').innerHTML = `<span class="punto" style="background:${HEX[turnColor]}"></span><b>${quien}</b><span>${que}</span>`;

  // Registro
  $('#registro').innerHTML = g.log.slice(-3).reverse().map((l) => `<li>${esc(l)}</li>`).join('');

  // Saltar turno si el jugador actual está desconectado
  $('#saltar').hidden = !(app.mode === 'host' && turnPlayer.connected === false && g.phase !== 'ended');

  // Final
  $('#final').hidden = g.phase !== 'ended';
  if (g.phase === 'ended') {
    const w = g.players.find((p) => p.color === g.winner);
    $('#finalTexto').innerHTML = `<div class="trofeo">🏆</div><div>¡Gana <b style="color:${HEX[g.winner]}">${esc(w?.name ?? COLOR_NAMES[g.winner])}</b>!</div>`;
    $('#revancha').hidden = app.mode === 'guest';
  }

  // Avisar con vibración cuando empieza tu turno
  if (app.mode !== 'local' && myTurn && g.phase === 'roll' && g.seq !== app.lastSeenSeq) navigator.vibrate?.(60);
  app.lastSeenSeq = g.seq;

  // Si solo hay un movimiento posible, se hace solo.
  if (myTurn && (g.phase === 'move' || g.phase === 'bonus') && app.autoSeq !== g.seq) {
    const distintos = new Set(g.legal.map((m) => `${m.from}>${m.to}`));
    if (distintos.size === 1) {
      app.autoSeq = g.seq;
      const seq = g.seq;
      setTimeout(() => {
        if (app.game?.seq === seq) act({ type: 'move', idx: g.legal[0].idx });
      }, 750);
    }
  }
}

// ---------- Eventos ----------
$('#nombre').value = store.get('parchis.nombre') || '';
$('#nombre').addEventListener('change', () => store.set('parchis.nombre', myName()));

const params = new URLSearchParams(location.search);
if (params.get('sala')) $('#codigo').value = params.get('sala').toUpperCase().slice(0, 4);

$('#crear').addEventListener('click', () => {
  store.set('parchis.nombre', myName());
  app.lobby = [{ id: myId, name: myName(), connected: true }];
  app.game = null;
  try { startHost(); } catch (e) { aviso(e.message); }
});

$('#unirse').addEventListener('click', () => {
  const code = $('#codigo').value.trim().toUpperCase();
  if (code.length !== 4) return aviso('El código tiene 4 letras');
  store.set('parchis.nombre', myName());
  try { startGuest(code); } catch (e) { aviso(e.message); }
});
$('#codigo').addEventListener('keydown', (e) => e.key === 'Enter' && $('#unirse').click());

$('#local').addEventListener('click', startLocal);

function refreshRecuperar() {
  const saved = store.get('parchis.host');
  const ok = saved && saved.game && saved.game.phase !== 'ended' && Date.now() - saved.t < 6 * 3600e3;
  $('#recuperar').hidden = !ok;
  if (ok) $('#recuperar').textContent = `Recuperar partida (${saved.code})`;
}
refreshRecuperar();
$('#recuperar').addEventListener('click', () => {
  const saved = store.get('parchis.host');
  if (!saved) return;
  app.lobby = saved.lobby;
  app.game = saved.game;
  app.game.players.forEach((p) => (p.connected = p.id === myId));
  try { startHost(saved.code); } catch (e) { aviso(e.message); }
});

$('#compartir').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?sala=${app.code}`;
  const text = `¡Únete a mi partida de parchís! Código: ${app.code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Parchís a 3', text, url });
    else {
      await navigator.clipboard.writeText(url);
      aviso('Enlace copiado');
    }
  } catch { /* cancelado */ }
});

$('#empezar').addEventListener('click', () => {
  if (app.mode !== 'host' || app.lobby.length < 2) return;
  app.game = createGame(app.lobby, { sixIsSeven: $('#seisSiete').checked });
  show('partida');
  publish();
});

$('#dado').addEventListener('click', () => {
  if (isMyTurn() && app.game.phase === 'roll') act({ type: 'roll' });
});
$('#saltar').addEventListener('click', () => act({ type: 'skip' }));
$('#revancha').addEventListener('click', () => act({ type: 'restart' }));
document.querySelectorAll('.salir').forEach((b) =>
  b.addEventListener('click', () => {
    if (app.game && app.game.phase !== 'ended' && app.mode !== 'local' && !confirm('¿Seguro que quieres salir de la partida?')) return;
    salir();
  }),
);

renderDice(null);
