// Conexión entre móviles con WebRTC (PeerJS). El servidor gratuito de PeerJS solo
// sirve para que los móviles se encuentren; después los datos van directos entre ellos.
const PREFIX = 'parchis3-apd-';
const PeerCtor = () => {
  if (!window.Peer) throw new Error('No se ha podido cargar PeerJS. ¿Hay conexión a internet?');
  return window.Peer;
};

/** Crea una sala. handlers: onOpen(), onConnection(conn), onData(conn, msg), onClose(conn), onError(err) */
export function hostRoom(code, handlers) {
  const Peer = PeerCtor();
  const peer = new Peer(PREFIX + code, { debug: 1 });
  peer.on('open', () => handlers.onOpen?.());
  peer.on('connection', (conn) => {
    conn.on('open', () => handlers.onConnection?.(conn));
    conn.on('data', (msg) => handlers.onData?.(conn, msg));
    conn.on('close', () => handlers.onClose?.(conn));
    conn.on('error', () => handlers.onClose?.(conn));
  });
  peer.on('disconnected', () => {
    // Se ha perdido el servidor de señalización, pero las conexiones siguen vivas.
    if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1000);
  });
  peer.on('error', (err) => handlers.onError?.(err));
  return {
    destroy: () => peer.destroy(),
  };
}

/** Se une a una sala. handlers: onOpen(send), onData(msg), onClose(), onError(err) */
export function joinRoom(code, handlers) {
  const Peer = PeerCtor();
  const peer = new Peer({ debug: 1 });
  let conn = null;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    handlers.onClose?.();
  };
  peer.on('open', () => {
    conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
    conn.on('open', () => handlers.onOpen?.());
    conn.on('data', (msg) => handlers.onData?.(msg));
    conn.on('close', close);
    conn.on('error', close);
  });
  peer.on('error', (err) => handlers.onError?.(err));
  return {
    send: (msg) => conn?.open && conn.send(msg),
    destroy: () => {
      closed = true;
      peer.destroy();
    },
  };
}

export function send(conn, msg) {
  if (conn?.open) conn.send(msg);
}
