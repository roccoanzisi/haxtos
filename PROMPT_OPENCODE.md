# Haxtos — Prompt completo para OpenCode

## Qué es el proyecto

**Haxtos** es un clon de Haxball (juego de fútbol online) construido con Phaser 3 y Node.js.
- **URL en vivo:** https://haxtos.vercel.app
- **Repo:** https://github.com/roccoanzisi/haxtos
- **Local:** `npm start` → http://[IP-WSL]:3000

---

## Stack técnico

- **Frontend:** Phaser 3.60 cargado desde CDN, sin bundler, sin módulos ES
- **Backend:** Node.js + Express + WebSocket (`ws`) para modo online
- **Deploy:** Vercel (solo estático — `server.js` NO corre en Vercel)

---

## ⚠️ REGLAS CRÍTICAS — leer antes de tocar cualquier archivo

### 1. Sin módulos ES — todo es global
El proyecto NO usa `import`/`export`. Todos los archivos se cargan con `<script src>` en `index.html`. Cada `const`/`let`/`var` en scope global es compartida por TODOS los archivos.

**ROMPE EL JUEGO (pantalla negra):** declarar la misma `const` en dos archivos distintos causa `SyntaxError` silencioso — Phaser nunca arranca.

### 2. Constantes globales — dónde vive cada una

| Constante | Archivo | NO redeclarar en |
|-----------|---------|-----------------|
| `GAME_W`, `GAME_H` | `js/main.js` | ningún otro archivo |
| `F` (objeto de campo) | `js/main.js` | ningún otro archivo |
| `soundManager` | `js/main.js` | ningún otro archivo |
| `STADIUMS` | `js/scenes/ConfigScene.js` | ningún otro archivo |
| `P_RADIUS`, `B_RADIUS` | `js/scenes/GameScene.js` | ningún otro archivo |
| `P_ACCEL`, `P_DAMPING` | `js/scenes/GameScene.js` | ningún otro archivo |
| `P_MASS`, `P_BOUNCE` | `js/scenes/GameScene.js` | ningún otro archivo |
| `PK_ACCEL`, `PK_DAMPING` | `js/scenes/GameScene.js` | ningún otro archivo |
| `KICK_POWER`, `KICK_BACK`, `KICK_COOLDOWN` | `js/scenes/GameScene.js` | ningún otro archivo |
| `B_DAMPING`, `B_MASS`, `B_BOUNCE`, `B_MAX_SPEED` | `js/scenes/GameScene.js` | ningún otro archivo |
| `SCORE_WIN`, `GAME_TIME` | `js/scenes/GameScene.js` | ningún otro archivo |
| `WALL_BOUNCE`, `POST_BOUNCE` | `js/scenes/GameScene.js` | ningún otro archivo |

### 3. Orden de carga de scripts en `index.html` (NO cambiar el orden)
```html
<script src="js/utils/SoundManager.js"></script>
<script src="js/scenes/PreloadScene.js"></script>
<script src="js/scenes/MenuScene.js"></script>
<script src="js/scenes/ConfigScene.js"></script>
<script src="js/scenes/OnlineScene.js"></script>
<script src="js/scenes/GameScene.js"></script>
<script src="js/scenes/GoalScene.js"></script>
<script src="js/scenes/WinScene.js"></script>
<script src="js/main.js"></script>   ← SIEMPRE ÚLTIMO
```

Si agregás un archivo JS nuevo: añadirlo en `index.html` ANTES de `main.js`, y si es una escena nueva registrarla en el array `scene: [...]` de `main.js`.

### 4. Causas más comunes de pantalla negra
1. `const` duplicada entre archivos → SyntaxError silencioso
2. Script nuevo no agregado en `index.html`
3. Error en `PreloadScene.create()` → Phaser no avanza a MenuScene
4. `soundManager` referenciado antes de que `main.js` cargue

---

## Estructura de archivos actual

```
haxtos/
├── index.html
├── package.json
├── server.js              ← WebSocket server (solo local/Railway)
├── vercel.json            ← sirve estáticos, ignora server.js
├── Procfile               ← para deploy en Railway
├── railway.json           ← config Railway
├── CLAUDE.md              ← reglas del proyecto (este resumen)
└── js/
    ├── main.js            ← config Phaser + constantes globales F, GAME_W, GAME_H
    ├── utils/
    │   └── SoundManager.js
    └── scenes/
        ├── PreloadScene.js   ← genera texturas programáticamente
        ├── MenuScene.js      ← menú principal → va a ConfigScene
        ├── ConfigScene.js    ← selector de estadio/goles/tiempo + const STADIUMS
        ├── OnlineScene.js    ← sala online con código de 4 letras
        ├── GameScene.js      ← lógica principal del juego
        ├── GoalScene.js      ← overlay de gol
        └── WinScene.js       ← pantalla de fin
```

---

## Estado actual del juego (lo que YA funciona)

- ✅ Local 1v1 (WASD vs flechas)
- ✅ Local 2v2 (WASD + TGFH vs flechas + IJKL)
- ✅ Patada: ESPACIO (azul) / SHIFT (rojo) + botones clickeables en pantalla
- ✅ Visuals Haxball: campo verde `#718C5A`, rayas, pelota blanca/negra, porterías coloreadas por equipo con red dibujada
- ✅ Números de jugador encima de cada círculo
- ✅ Chat en juego (Enter para abrir): `/extrapolation`, `/avatar`, `/zoom`, `/handicap`, `/fps`, `/help`
- ✅ Detección de gol correcta (trigger al cruzar la línea, no el fondo)
- ✅ Pelota no escapa del mapa (clamp de posición + cap de velocidad manual)
- ✅ Física a 120fps
- ✅ Sonidos procedurales (silbato, gol, patada, rebote)
- ✅ Modo online scaffoldeado (WebSocket, salas con código)
- ✅ Deploy en Vercel con CI/CD (cada push redeploya automáticamente)

---

## Constantes de campo (objeto `F` en `main.js`)

```javascript
const F = {
    X: 60,      // margen izquierdo del campo
    Y: 45,      // margen superior
    W: 880,     // ancho del campo
    H: 470,     // alto del campo
    GOAL_H: 140, // alto del arco
    GOAL_D: 65,  // profundidad del arco
    WALL_T: 22,  // grosor de paredes
};
// Calculados automáticamente:
// F.CX = F.X + F.W/2 = 500  (centro X)
// F.CY = F.Y + F.H/2 = 280  (centro Y)
// F.GOAL_TOP = F.CY - F.GOAL_H/2 = 210
// F.GOAL_BOT = F.CY + F.GOAL_H/2 = 350
```

---

## Constantes de física (en `GameScene.js`)

Física basada en Haxball .hbs — multiplicativa (damping × velocidad cada frame), no drag de Phaser:

```javascript
// Jugador
const P_ACCEL   = 0.0403;  // px/frame a 120fps → terminal ~240 px/s
const P_DAMPING = 0.9798;  // × vel cada frame (0.96^(60/120))
const P_MASS    = 2;       // invMass=0.5 en Haxball
const P_BOUNCE  = 0.5;     // bCoef

// Jugador pateando
const PK_ACCEL   = 0.0283; // menos aceleración al patear
const PK_DAMPING = 0.9798; // igual
const KICK_POWER = 480;    // impulso (kickStrength=5 convertido)
const KICK_BACK  = 0.1;    // retroceso del jugador

// Pelota
const B_DAMPING   = 0.995; // × vel cada frame (0.99^(60/120))
const B_MASS      = 1;     // invMass=1 en Haxball
const B_BOUNCE    = 0.5;   // bCoef
const B_MAX_SPEED = 700;   // cap anti-tunneling

// Rebotes
const WALL_BOUNCE = 0.5;   // ballArea bCoef
const POST_BOUNCE = 0.5;   // goalPost bCoef
const SCORE_WIN = 7;
const GAME_TIME = 3 * 60;
const KICK_COOLDOWN = 400;
```

---

## Física Haxball real (de los stadiums .hbs — para referenciar)

Valores del **Classic stadium** de Haxball oficial (de issue #480 + wiki):
```json
"playerPhysics": {
  "bCoef": 0.5,
  "invMass": 0.5,
  "damping": 0.96,
  "acceleration": 0.1,
  "kickingAcceleration": 0.07,
  "kickingDamping": 0.96,
  "kickStrength": 5,
  "kickback": 0
}
"ballPhysics": {
  "radius": 10,
  "bCoef": 0.5,
  "invMass": 1,
  "damping": 0.99
}
```

Haxball corre a **60fps** y usa unidades internas (1 unidad ≈ 1.6px en Haxtos Classic). La conversión es:
- **Damping**: `damping^(60/fps_haxtos)` → a 120fps: `0.96^0.5 = 0.9798`, `0.99^0.5 = 0.995`
- **Aceleración**: se aplica por frame en Haxball. Terminal speed = `accel/(1-damping)`. Jugador normal: 2.5 u/f ≈ 240 px/s
- **Kick**: `kickStrength` se suma directo a la velocidad del balón en la dirección del contacto
- **Masa**: `invMass` es masa inversa. Jugador = 2 (1/0.5), Pelota = 1 (1/1.0)
- **Colisión**: impulso basado en masa, no rebote elástico simple

---

## Colores Haxball oficiales (del editor público haxpuck)

| Elemento | Hex |
|----------|-----|
| Campo (grass) | `#718C5A` |
| Raya alternada | `#7A9660` |
| Líneas blancas | `#C7E6BD` |
| Poste arco izquierdo | `#CCCCFF` (azul) |
| Poste arco derecho | `#FFCCCC` (rojo) |
| Jugador azul | `#0000F8` |
| Jugador rojo | `#F00000` |
| Pelota | `#FFFFFF` con borde `#000000` |

---

## Comandos de chat disponibles (implementados)

| Comando | Descripción |
|---------|-------------|
| `/extrapolation <ms>` | Predicción de input para online (0-200ms) |
| `/avatar <texto>` | Cambia el número del jugador (máx 3 chars) |
| `/zoom <valor>` | Zoom de cámara (0.5-4) |
| `/handicap <ms>` | Delay de input propio (0-500ms) |
| `/fps` | Muestra FPS actual |
| `/help` | Lista los comandos |

---

## Lo que falta implementar (backlog)

### Alta prioridad
1. ~~**Estadios múltiples**~~ ✅ — Classic, Big, Hockey con ConfigScene

2. ~~**Sistema de colores de equipo**~~ ✅ — comando `/colors` con setTint()

3. ~~**Selección de límite de goles y tiempo**~~ ✅ — ConfigScene

4. **Barrera de kick-off mejorada** — la barrera actual se destruye al primer toque de pelota (OK), pero no bloquea a los jugadores del lado contrario antes del toque. Requiere collider activo contra los jugadores del equipo contrario.

### Media prioridad
5. **Online funcional con servidor persistente** — deployar `server.js` en Railway o Render (Vercel no soporta WebSockets)

6. **Más comandos de chat:**
   - `/set_password <clave>` — sala con contraseña
   - `/clear_bans`
   - `/colors <team> clear` — restaurar colores

### Baja prioridad
7. **Efectos visuales:** partículas en el gol, animación de la pelota al entrar
8. **Marcador persistente** — localStorage para partidas seguidas
9. **Modo espectador** — tercera conexión online que solo observa

---

## Workflow de deploy

```bash
# Hacer cambios locales
git add <archivos>
git commit -m "descripción"
git push   # ← Vercel redeploya automáticamente en ~30 segundos
```

Para probar en local antes de pushear:
```bash
npm start   # → http://172.17.204.178:3000 (IP de WSL)
```

---

## Errores conocidos resueltos (no reintroducir)

| Error | Causa | Fix aplicado |
|-------|-------|-------------|
| Pantalla negra | `const` duplicadas entre `main.js` y `GameScene.js` | Eliminadas las duplicadas de `main.js` |
| Gol no detectado | Threshold en el fondo del arco — física bouncea antes | Threshold movido a la línea del arco (`F.X - B_RADIUS`) |
| Pelota escapa mapa | `setMaxVelocity` no aplica en el mismo frame del impulso | Cap manual de 700px/s + `_clampBall()` basado en posición |
| `Cannot GET /` en Vercel | `vercel.json` enrutaba todo a `server.js` | `vercel.json` sirve estáticos directamente |
