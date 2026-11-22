# 🎲 Parchís a 3

Parchís online para jugar cada uno desde su móvil, sin servidor propio y sin instalar nada.
Se aloja en **GitHub Pages** y los móviles se conectan entre ellos con **WebRTC** (vía [PeerJS](https://peerjs.com)).

## Cómo se juega

1. Uno pulsa **Crear sala** y comparte el código de 4 letras (o el enlace).
2. Los otros dos ponen el código y pulsan **Unirse**.
3. El anfitrión pulsa **Empezar**. También funciona con 2 o 4 jugadores.

¿Solo queréis probarlo? **Probar en un solo móvil** juega los 3 turnos en el mismo dispositivo.

## Reglas (parchís clásico español)

- Se sale de casa con un **5** (obligatorio si se puede).
- Con un **6** se vuelve a tirar. Si no te quedan fichas en casa, el 6 cuenta **7** (se puede desactivar).
- **Tres seises** seguidos: la última ficha que moviste vuelve a casa (salvo si ya está en el pasillo).
- **Comer** una ficha te da **20** casillas para otra ficha. En los seguros (casillas con círculo) no se come.
- Al salir, si tu salida está ocupada por dos fichas y alguna es rival, te la comes.
- Dos fichas del mismo color forman **barrera**: nadie puede pasar. Con un 6, si tienes barrera, hay que abrirla.
- A la **meta** se entra con la cuenta justa y da **10** casillas de premio.
- Gana quien mete antes sus 4 fichas.

## Cómo funciona por dentro

```
index.html
css/styles.css
js/game.js    Reglas puras (sin DOM): createGame, roll, move…
js/board.js   Tablero SVG y fichas animadas
js/net.js     Conexión P2P con PeerJS
js/main.js    Pantallas, sala y sincronización
tests/        Tests de las reglas (node --test)
```

- El **anfitrión** guarda la partida, tira los dados y valida cada movimiento. Los demás solo envían acciones (`roll`, `move`) y reciben el estado completo.
- Si un móvil se bloquea o pierde la conexión, vuelve a entrar solo con su mismo puesto. Si el anfitrión recarga la página, puede **Recuperar partida** y la sala vuelve con el mismo código.
- Si alguien se va, el anfitrión puede **Saltar turno**.

## Desarrollo

No hace falta compilar nada:

```bash
npm start      # sirve en http://localhost:8080
npm test       # tests de las reglas
```

## Publicar en GitHub Pages

En el repo: **Settings → Pages → Build and deployment → Deploy from a branch**, rama `main` y carpeta `/ (root)`.
En un par de minutos estará en `https://alex-projects-dev.github.io/Juego/`.
