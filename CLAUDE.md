# Haxtos — Instrucciones para AI

## Arquitectura del proyecto

Juego de fútbol estilo Haxball. Frontend en Phaser 3 (sin bundler), backend Node.js + WebSockets.

```
index.html          ← carga los scripts en orden estricto
js/
  main.js           ← config de Phaser + constantes globales (GAME_W, GAME_H, F, soundManager)
  utils/
    SoundManager.js ← se carga ANTES que todo lo demás
  scenes/
    PreloadScene.js
    MenuScene.js
    OnlineScene.js
    GameScene.js    ← define sus propias constantes (P_RADIUS, B_RADIUS, etc.) y STADIUMS
    GoalScene.js
server.js           ← servidor WebSocket para modo online
```

## Reglas críticas — leer antes de tocar cualquier archivo

### 1. Sin módulos ES — todo es global
El proyecto NO usa `import`/`export` ni bundler. Todos los archivos se cargan con `<script src>` en `index.html`. Cada variable `const`/`let`/`var` declarada en el scope global es compartida por TODOS los archivos.

**Consecuencia directa:** declarar la misma `const` en dos archivos distintos causa `SyntaxError` y pantalla negra. El juego no arranca y no hay mensaje de error visible.

### 2. Constantes globales y dónde viven

| Constante | Archivo | Descripción |
|-----------|---------|-------------|
| `GAME_W`, `GAME_H` | `main.js` | Resolución del canvas |
| `F` | `main.js` | Dimensiones del campo (objeto) |
| `soundManager` | `main.js` | Instancia única del SoundManager |
| `STADIUMS` | `GameScene.js` | Objeto con configuraciones de estadios |
| `P_RADIUS`, `B_RADIUS` | `GameScene.js` | Radio jugador / pelota |
| `P_ACCEL`, `P_DAMPING` | `GameScene.js` | Aceleración (4.848 px/s por frame) y damping jugador |
| `P_MASS`, `P_BOUNCE` | `GameScene.js` | Masa (2) y rebote (0.5) del jugador |
| `PK_ACCEL`, `PK_DAMPING` | `GameScene.js` | Aceleración/fricción al patear |
| `KICK_POWER`, `KICK_BACK` | `GameScene.js` | Fuerza patada (5.0), retroceso (0) |
| `B_DAMPING`, `B_MASS`, `B_BOUNCE` | `GameScene.js` | Damping (0.99), masa (1), rebote (0.5). Sin cap de velocidad — igual que Haxball real |
| `SCORE_WIN`, `GAME_TIME` | `GameScene.js` | Goles para ganar, duración partida |
| `WALL_BOUNCE`, `POST_BOUNCE` | `GameScene.js` | Rebote pared y poste (ambos 0.5 = bCoef) |

**Nunca redeclarar estas constantes en otro archivo.**

### 3. Orden de carga de scripts (no cambiar)
```html
SoundManager.js     ← primero, soundManager se instancia en main.js
PreloadScene.js
MenuScene.js
OnlineScene.js
GameScene.js        ← define STADIUMS
GoalScene.js
main.js             ← último, instancia Phaser y soundManager
```

Si agregás un archivo nuevo, añadilo en `index.html` ANTES de `main.js`.

### 4. Pantalla negra — causas más comunes
- `const` duplicada entre archivos → SyntaxError silencioso
- Script nuevo no agregado en `index.html`
- Error en `PreloadScene.create()` → Phaser no pasa a MenuScene
- `soundManager` usado antes de que `main.js` cargue

### 5. Deploy
- `git push` → Vercel redeploya automáticamente (CI conectado)
- `server.js` NO corre en Vercel (es serverless, sin WebSockets persistentes)
- El modo online requiere un servidor separado (Railway, Render, etc.)
- `vercel.json` sirve los archivos estáticos directamente, no pasar por server.js

### 6. Antes de cualquier cambio
1. Verificar que la constante que vas a usar/crear no está ya definida en otro archivo
2. Si agregás una escena nueva, registrarla en el array `scene: [...]` de `main.js`
3. Testear en local con `npm start` + `http://[IP-WSL]:3000` antes de pushear

### 7. Errores comunes conocidos (no reintroducir)
- Teclas no funcionan: usar `keys.right.isDown`, nunca `keys.right` directamente
- Física arcade: usar damping multiplicativo (`vel *= damping`), no `setDrag` ni `setMaxVelocity`
