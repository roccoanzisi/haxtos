// Haxball physics — exact Classic stadium values (1 pixel = 1 Haxball unit)
// Verified from Haxball game-min.js: physics runs 1 tick per frame at 60fps.
// The "2 sub-steps" in Haxball source are for joint/spring constraints only.

const P_RADIUS = 15;       // Haxball player radius (exact default)
const B_RADIUS = 10;       // Haxball ball radius (exact default)

// Player (Haxball: acceleration=0.1, damping=0.96, bCoef=0.5, invMass=0.5)
// Terminal: (v+0.1)*0.96 = v → v = 2.4 px/frame → 2.5 px/frame moved → 150 px/s
const P_ACCEL   = 0.1;     // px/frame (Haxball exact)
const P_DAMPING = 0.96;    // per frame (Haxball exact)
const P_INV_M   = 0.5;     // invMass (Haxball exact)
const P_MASS    = 2;       // mass = 1/invMass
const P_BOUNCE  = 0.5;     // bCoef

// Player kicking — Haxball exact
const PK_ACCEL   = 0.07;   // px/frame when kicking
const PK_DAMPING = 0.96;   // same as normal
const KICK_POWER = 5.0;    // Haxball kickStrength → ball gets +5 px/frame impulse
const KICK_BACK  = 0;      // Haxball kickback = 0

// Ball (Haxball: damping=0.99, bCoef=0.5, invMass=1, radius=10)
const B_DAMPING = 0.99;    // per frame (Haxball exact)
const B_INV_M   = 1.0;     // invMass (Haxball exact)
const B_MASS    = 1;       // mass = 1/invMass
const B_BOUNCE  = 0.5;     // bCoef

const SCORE_WIN  = 7;
const GAME_TIME  = 3 * 60;
const WALL_BOUNCE = 1.0;   // ballArea bCoef (Haxball exact)
const POST_BOUNCE   = 0.5;   // goalPost bCoef
const NET_BOUNCE    = 0.1;   // goalNet bCoef (back wall + crossbars)
const POST_RADIUS   = 8;     // goal post disc radius (Haxball exact)
const SUB_STEPS     = 1;     // 1 physics step per frame (Haxball exact, verified from source)

class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    init(data) {
        this.mode = (data && data.mode) || 'local1v1';
        this.score = { blue: 0, red: 0 };
        this.scoreWin = (data && data.scoreWin) ? data.scoreWin : SCORE_WIN;
        this.timeLimit = (data && data.timeLimit !== undefined) ? data.timeLimit : GAME_TIME;
        this.timeLeft = this.timeLimit;
        this.paused = false;
        this.goalLock = false;
        this.is2v2 = this.mode === 'local2v2';
        this.isOnline = this.mode === 'online';
        this.ws = (data && data.ws) ? data.ws : null;
        this.playerIndex = (data && data.playerIndex !== undefined) ? data.playerIndex : 0;
        this.isHost = this.playerIndex === 0;
        this.serverState = null;
        this.stadium = (data && data.stadium) ? data.stadium : 'classic';
        this.stadiumCfg = STADIUMS[this.stadium] || STADIUMS.classic;
        this._chatOpen = false;
        this._chatInput = '';
        this._chatMessages = [];
        this._avatarOverrides = {};
        this._floatingMsg = null;
        this._kickoffActive = true;
        this._overtime = false;
        this._teamTints = { blue: null, red: null, blue2: null, red2: null };
        this._originalTints = { blue: null, red: null, blue2: null, red2: null };
    }

    create() {
        soundManager.startAmbient();
        soundManager.whistle();

        // Camera setup — center on field
        const GW = this.scale.width;
        const GH = this.scale.height;
        this.cameras.main.setBounds(0, 0, GW, GH);
        this.cameras.main.centerOn(F.CX, F.CY);
        this._cameraMode = 3;
        window._gameZoom = 1;

        this._drawField();
        this._createGoalPosts();
        this._buildWalls();
        this._spawnEntities();
        this._setupInput();
        this._setupCollisions();
        this._buildHUD();
        this._buildPlayerLabels();
        this._buildChatUI();

        this.timerEvent = this.time.addEvent({
            delay: 1000,
            repeat: this.timeLimit > 0 ? this.timeLimit - 1 : 99999,
            callback: () => {
                if (this.timeLimit === 0) return;
                if (this.paused || (this.isOnline && !this.isHost)) return;
                this.timeLeft = Math.max(0, this.timeLeft - 1);
                this._updateHUD();
                if (this.timeLeft === 0) this._endGame();
            }
        });

        if (this.isOnline && !this.isHost) this._setupOnlineGuest();
        if (this.isOnline && this.isHost)  this._setupOnlineHost();
    }

    // ── Field (stadium-aware) ──────────────────────────────────────
    _drawField() {
        const g = this.add.graphics();
        const s = this.stadiumCfg;

        // Outer background (color of the area outside the field, like in Haxball)
        g.fillStyle(s.bgColor, 1);
        g.fillRect(0, 0, this.scale.width, this.scale.height);

        for (let i = 0; i < 8; i++) {
            g.fillStyle(i % 2 === 0 ? s.grass1 : s.grass2, 1);
            g.fillRect(F.X, F.Y + i * (F.H / 8), F.W, F.H / 8);
        }

        g.fillStyle(s.goalBgColor, 1);
        g.fillRect(F.X - F.GOAL_D, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
        g.fillRect(F.X + F.W,      F.GOAL_TOP, F.GOAL_D, F.GOAL_H);

        g.lineStyle(3, s.lineColor, 1);
        g.strokeRect(F.X, F.Y, F.W, F.H);

        g.lineStyle(2, s.lineColor, 0.9);
        g.lineBetween(F.CX, F.Y, F.CX, F.Y + F.H);
        g.strokeCircle(F.CX, F.CY, 75);

        g.fillStyle(s.lineColor, 1);
        g.fillCircle(F.CX, F.CY, 4);

        g.lineStyle(2, s.lineColor, 0.45);
        g.strokeCircle(F.X + 150,       F.CY, 55);
        g.strokeCircle(F.X + F.W - 150, F.CY, 55);

        g.lineStyle(3, s.goalColor1, 1);
        g.strokeRect(F.X - F.GOAL_D, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
        g.lineStyle(1, s.goalColor1, 0.28);
        for (let y = F.GOAL_TOP + 14; y < F.GOAL_BOT; y += 14)
            g.lineBetween(F.X - F.GOAL_D, y, F.X, y);
        for (let x = F.X - F.GOAL_D + 18; x < F.X; x += 18)
            g.lineBetween(x, F.GOAL_TOP, x, F.GOAL_BOT);

        g.lineStyle(3, s.goalColor2, 1);
        g.strokeRect(F.X + F.W, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
        g.lineStyle(1, s.goalColor2, 0.28);
        for (let y = F.GOAL_TOP + 14; y < F.GOAL_BOT; y += 14)
            g.lineBetween(F.X + F.W, y, F.X + F.W + F.GOAL_D, y);
        for (let x = F.X + F.W + 18; x < F.X + F.W + F.GOAL_D; x += 18)
            g.lineBetween(x, F.GOAL_TOP, x, F.GOAL_BOT);

        // Goal posts — circles matching Haxball physics discs (radius=8)
        g.fillStyle(0xffffff, 1);
        g.lineStyle(2, 0x000000, 1);
        [F.X, F.X + F.W].forEach(px => {
            [F.GOAL_TOP, F.GOAL_BOT].forEach(py => {
                g.fillCircle(px, py, POST_RADIUS);
                g.strokeCircle(px, py, POST_RADIUS);
            });
        });
    }

    // ── Walls (for player collision, not ball) ─────────────────────
    _buildWalls() {
        this.walls     = this.physics.add.staticGroup();
        this.postWalls = this.physics.add.staticGroup();

        const add = (x, y, w, h, isPost) => {
            const r = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0);
            this.physics.add.existing(r, true);
            (isPost ? this.postWalls : this.walls).add(r);
        };

        const T = F.WALL_T;
        const R = F.X + F.W;

        add(F.X - T,  F.Y - T,          F.W + T * 2, T, false);
        add(F.X - T,  F.Y + F.H,        F.W + T * 2, T, false);
        add(F.X - T,  F.Y - T,          T, F.GOAL_TOP - F.Y + T, false);
        add(F.X - T,  F.GOAL_BOT,       T, (F.Y + F.H) - F.GOAL_BOT, false);
        add(R,        F.Y - T,          T, F.GOAL_TOP - F.Y + T, false);
        add(R,        F.GOAL_BOT,       T, (F.Y + F.H) - F.GOAL_BOT, false);

        add(F.X - F.GOAL_D - T, F.GOAL_TOP,     T, F.GOAL_H, true);
        add(F.X - F.GOAL_D - T, F.GOAL_TOP - T, F.GOAL_D + T, T, true);
        add(F.X - F.GOAL_D - T, F.GOAL_BOT,     F.GOAL_D + T, T, true);
        add(R + F.GOAL_D,       F.GOAL_TOP,     T, F.GOAL_H, true);
        add(R,                  F.GOAL_TOP - T, F.GOAL_D + T, T, true);
        add(R,                  F.GOAL_BOT,     F.GOAL_D + T, T, true);
    }

    // ── Entities ───────────────────────────────────────────────────
    _spawnEntities() {
        this._spawnBall();
        this._spawnPlayers();
    }

    _spawnBall() {
        this.ball = this.physics.add.image(F.CX, F.CY, 'ball');
        this.ball.setCircle(B_RADIUS, 1, 1);
        this.ball.setBounce(0);
        this.ball.setDrag(0);
        this.ball.setCollideWorldBounds(false);
        this.ball.body.setAllowGravity(false);
        this.ball.setDepth(10);
        this.ball._vx = 0;
        this.ball._vy = 0;
    }

    _spawnPlayers() {
        this.players = {};
        this.players.blue = this._makePlayer(F.CX - 200, F.CY, 'player_blue');
        this.players.red  = this._makePlayer(F.CX + 200, F.CY, 'player_red');
        if (this.is2v2) {
            this.players.blue2 = this._makePlayer(F.CX - 280, F.CY - 80, 'player_blue2');
            this.players.red2  = this._makePlayer(F.CX + 280, F.CY + 80, 'player_red2');
        }
    }

    _makePlayer(x, y, key) {
        const p = this.physics.add.image(x, y, key);
        p.setCircle(P_RADIUS, 1, 1);
        p.setBounce(0);
        p.setDrag(0);
        p.setCollideWorldBounds(false);
        p.body.setAllowGravity(false);
        p.setDepth(5);
        p._normalTexture = key;
        p._kickTexture   = key.replace('player_', 'kick_');
        p._vx = 0;
        p._vy = 0;
        p._inputDx = 0;
        p._inputDy = 0;
        p._isKicking = false;
        return p;
    }

    // ── Input ──────────────────────────────────────────────────────
    _setupInput() {
        const kb = this.input.keyboard;
        this.keys1 = kb.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' });
        this.keys2 = kb.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' });
        this.kick1 = kb.addKey('SPACE');
        this.kick2 = kb.addKey('SHIFT');
        if (this.is2v2) {
            this.keys3 = kb.addKeys({ up: 'T', down: 'G', left: 'F', right: 'H' });
            this.keys4 = kb.addKeys({ up: 'I', down: 'K', left: 'J', right: 'L' });
        }
        kb.on('keydown-ESCAPE', () => {
            if (this._chatOpen) { this._closeChat(); return; }
            if (this.isOnline && this.ws) this.ws.close();
            this.scene.start('MenuScene');
        });
        kb.on('keydown', (ev) => this._handleChatKey(ev));
    }

    // ── Collisions (Phaser only for ball-wall overlap sounds) ──────
    _setupCollisions() {
        // Ball-wall sounds only (physics handled manually)
        this.physics.add.overlap(this.ball, this.walls, () => this._wallBounce());
        this.physics.add.overlap(this.ball, this.postWalls, () => this._postBounce());
        this._kickoffActive = true;
    }

    _wallBounce() {
        const v = Math.hypot(this.ball._vx, this.ball._vy);
        if (v > 30) soundManager.wallHit(v);
    }
    _postBounce() {
        const v = Math.hypot(this.ball._vx, this.ball._vy);
        if (v > 30) soundManager.postHit(v);
    }

    // ── HUD ────────────────────────────────────────────────────────
    _buildHUD() {
        const GW = this.scale.width;
        const GH = this.scale.height;
        const sf = (obj) => obj.setScrollFactor(0).setDepth(20);

        const scoreStyle = (color) => ({
            fontSize: '34px', fontFamily: 'Verdana, Arial Black, sans-serif',
            color, stroke: '#000', strokeThickness: 5
        });
        this.hudBlue = sf(this.add.text(GW / 2 - 80, 8, '0', scoreStyle('#8888ff')).setOrigin(0.5, 0));
        this.hudRed  = sf(this.add.text(GW / 2 + 80, 8, '0', scoreStyle('#ff4444')).setOrigin(0.5, 0));
        sf(this.add.text(GW / 2, 8, '–', {
            fontSize: '28px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#ffffff', stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5, 0));

        this.hudTime = sf(this.add.text(GW / 2, GH - 26, this._fmt(this.timeLeft), {
            fontSize: '17px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#eeeeee', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5, 0));

        sf(this.add.text(F.X + 20, 8, 'AZUL', {
            fontSize: '15px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#8888ff', stroke: '#000', strokeThickness: 3
        }));
        sf(this.add.text(F.X + F.W - 20, 8, 'ROJO', {
            fontSize: '15px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#ff4444', stroke: '#000', strokeThickness: 3
        }).setOrigin(1, 0));

        this.shootBlueBtn = this.add.text(12, GH - 26, '⚡ SHOOT (ESPACIO)', {
            fontSize: '11px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#aaaaff', backgroundColor: '#0a0a33', padding: { x: 5, y: 3 }
        }).setScrollFactor(0).setDepth(20).setInteractive({ useHandCursor: true });
        this.shootBlueBtn.on('pointerdown', () => {
            const b = this.players.blue;
            b._isKicking = !b._isKicking;
            if (this.is2v2 && this.players.blue2) this.players.blue2._isKicking = b._isKicking;
        });

        this.shootRedBtn = this.add.text(GW - 175, GH - 26, '⚡ SHOOT (SHIFT)', {
            fontSize: '11px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#ffaaaa', backgroundColor: '#330a0a', padding: { x: 5, y: 3 }
        }).setScrollFactor(0).setDepth(20).setInteractive({ useHandCursor: true });
        this.shootRedBtn.on('pointerdown', () => {
            const r = this.players.red;
            r._isKicking = !r._isKicking;
            if (this.is2v2 && this.players.red2) this.players.red2._isKicking = r._isKicking;
        });

        const hint = this.is2v2
            ? 'A/D:Az1  F/H:Az2  ←→:Rj1  J/L:Rj2  |  1/2/3: cámara  ENTER: chat'
            : 'WASD: Azul   ↑↓←→: Rojo   |   1/2/3: cámara   ENTER: chat   ESC: Menú';
        sf(this.add.text(GW / 2, GH - 42, hint, {
            fontSize: '11px', fontFamily: 'Verdana, Arial, sans-serif', color: '#888888'
        }).setOrigin(0.5, 0));

        // Camera mode indicator
        this.hudCam = sf(this.add.text(GW - 6, 8, '📷3', {
            fontSize: '11px', fontFamily: 'Verdana, Arial, sans-serif', color: '#888888'
        }).setOrigin(1, 0));

        if (this.isOnline) {
            const code = (this.scene.get('OnlineScene') || {}).roomCode || '—';
            sf(this.add.text(8, GH - 48, 'Sala: ' + code, {
                fontSize: '12px', fontFamily: 'Verdana, Arial, sans-serif', color: '#66aa66'
            }));
        }
    }

    _updateHUD() {
        this.hudBlue.setText(String(this.score.blue));
        this.hudRed.setText(String(this.score.red));
        this.hudTime.setText(this._fmt(this.timeLeft));
    }

    _fmt(secs) {
        if (secs <= 0 && this.timeLimit === 0) return '\u221E';
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    // ── Player labels ──────────────────────────────────────────────
    _buildPlayerLabels() {
        const colors = { blue: '#8888ff', red: '#ff5555', blue2: '#6666dd', red2: '#dd3333' };
        const nums = { blue: '1', red: '2', blue2: '3', red2: '4' };
        this._playerLabels = {};
        Object.keys(this.players).forEach(key => {
            this._playerLabels[key] = this.add.text(0, 0, nums[key], {
                fontSize: '12px', fontFamily: 'Verdana, Arial, sans-serif',
                color: colors[key] || '#ffffff', stroke: '#000000', strokeThickness: 3
            }).setOrigin(0.5, 1).setDepth(15);
        });
    }

    _updatePlayerLabels() {
        Object.keys(this.players).forEach(key => {
            const p   = this.players[key];
            const lbl = this._playerLabels[key];
            if (!lbl) return;
            lbl.x = p.x;
            lbl.y = p.y - P_RADIUS - 2;
            if (this._avatarOverrides[key]) lbl.setText(this._avatarOverrides[key].slice(0, 3));
        });
    }

    _updatePlayerTextures() {
        Object.keys(this.players).forEach(key => {
            const p = this.players[key];
            const target = p._isKicking ? p._kickTexture : p._normalTexture;
            if (p.texture.key !== target) p.setTexture(target);
        });
    }

    // ── Chat ───────────────────────────────────────────────────────
    _buildChatUI() {
        const H = GAME_H;
        const LOG = 5;
        this._chatLogBg = this.add.rectangle(0, H - 130, 440, LOG * 20 + 10, 0x000000, 0.55)
            .setOrigin(0, 0).setDepth(49).setVisible(false);
        this._chatLogTexts = [];
        for (let i = 0; i < LOG; i++) {
            this._chatLogTexts.push(
                this.add.text(8, H - 125 + i * 20, '', {
                    fontSize: '13px', fontFamily: 'Verdana, Arial, sans-serif', color: '#ffffff'
                }).setDepth(50).setVisible(false)
            );
        }
        this._chatInputBg = this.add.rectangle(0, H - 24, 440, 24, 0x111111, 0.92)
            .setOrigin(0, 0).setDepth(49).setVisible(false);
        this._chatInputText = this.add.text(8, H - 22, '', {
            fontSize: '13px', fontFamily: 'Verdana, Arial, sans-serif', color: '#ffff88'
        }).setDepth(50).setVisible(false);
    }

    _handleChatKey(ev) {
        if (ev.key === 'Enter') {
            if (!this._chatOpen) this._openChat();
            else this._submitChat();
            return;
        }
        if (!this._chatOpen) {
            if (ev.key === '1') { this._setCameraMode(1); return; }
            if (ev.key === '2') { this._setCameraMode(2); return; }
            if (ev.key === '3') { this._setCameraMode(3); return; }
            return;
        }
        if (ev.key === 'Backspace') {
            this._chatInput = this._chatInput.slice(0, -1);
        } else if (ev.key.length === 1) {
            this._chatInput += ev.key;
        }
        this._chatInputText.setText('> ' + this._chatInput + '|');
    }

    _openChat() {
        this._chatOpen = true;
        this._chatInput = '';
        this._chatInputText.setText('> |');
        this._chatInputBg.setVisible(true);
        this._chatInputText.setVisible(true);
        if (this._chatMessages.length > 0) {
            this._chatLogBg.setVisible(true);
            this._chatLogTexts.forEach(t => t.setVisible(true));
        }
    }

    _closeChat() {
        this._chatOpen = false;
        this._chatInput = '';
        this._chatInputBg.setVisible(false);
        this._chatInputText.setVisible(false);
        this._chatLogBg.setVisible(false);
        this._chatLogTexts.forEach(t => t.setVisible(false));
    }

    _submitChat() {
        const text = this._chatInput.trim();
        this._chatInput = '';
        this._chatInputText.setText('> |');
        if (!text) { this._closeChat(); return; }
        if (text.startsWith('/')) this._runCommand(text.slice(1));
        else this._addChatMessage('» ' + text, '#ffffff');
    }

    _runCommand(cmd) {
        const parts = cmd.trim().split(/\s+/);
        const name  = parts[0].toLowerCase();
        const args  = parts.slice(1);
        switch (name) {
            case 'extrapolation': {
                const ms = parseInt(args[0]);
                if (!isNaN(ms) && ms >= 0) {
                    window.HAXTOS_EXTRAPOLATION = Math.min(200, ms);
                    this._addChatMessage(`Extrapolation: ${window.HAXTOS_EXTRAPOLATION}ms`, '#aaffaa');
                } else this._addChatMessage('Uso: /extrapolation <0–200>', '#ffaaaa');
                break;
            }
            case 'avatar': {
                const av = args.join(' ').slice(0, 3);
                if (av) {
                    this._avatarOverrides['blue'] = av;
                    this._addChatMessage(`Avatar: "${av}"`, '#aaffaa');
                } else this._addChatMessage('Uso: /avatar <texto>', '#ffaaaa');
                break;
            }
            case 'zoom': {
                const z = parseFloat(args[0]);
                if (z > 0 && z <= 4) {
                    window._gameZoom = z;
                    this.cameras.main.setZoom(z);
                    if (this._cameraMode === 3) this.cameras.main.centerOn(F.CX, F.CY);
                    this._addChatMessage(`Zoom: ${z}x`, '#aaffaa');
                } else this._addChatMessage('Uso: /zoom <0.5–4>', '#ffaaaa');
                break;
            }
            case 'handicap': {
                const ms = parseInt(args[0]);
                if (!isNaN(ms) && ms >= 0) {
                    window.HAXTOS_HANDICAP = Math.min(500, ms);
                    this._addChatMessage(`Handicap: ${window.HAXTOS_HANDICAP}ms`, '#aaffaa');
                } else this._addChatMessage('Uso: /handicap <ms>', '#ffaaaa');
                break;
            }
            case 'fps':
                this._addChatMessage(`FPS: ${Math.round(this.game.loop.actualFps)}`, '#aaffff');
                break;
            case 'colors': {
                const action = (args[0] || '').toLowerCase();
                if (action === 'reset') {
                    Object.keys(this.players).forEach(k => {
                        this.players[k].clearTint();
                        this._teamTints[k] = null;
                    });
                    this._addChatMessage('Colores restaurados', '#aaffaa');
                } else if (action === 'blue' || action === 'red') {
                    const hex = args[1] || '';
                    const match = /^#?([0-9a-fA-F]{6})$/.exec(hex);
                    if (!match) this._addChatMessage('Uso: /colors <blue|red> #RRGGBB o /colors reset', '#ffaaaa');
                    else {
                        const color = parseInt(match[1], 16);
                        const keys = action === 'blue' ? ['blue', 'blue2'] : ['red', 'red2'];
                        keys.forEach(k => {
                            if (this.players[k]) {
                                this.players[k].setTint(color);
                                this._teamTints[k] = color;
                            }
                        });
                        this._addChatMessage(`Color ${action}: #${match[1].toUpperCase()}`, '#aaffaa');
                    }
                } else this._addChatMessage('Uso: /colors <blue|red> #RRGGBB o /colors reset', '#ffaaaa');
                break;
            }
            case 'help':
                this._addChatMessage('/extrapolation /avatar /zoom /handicap /fps /colors', '#ffff88');
                break;
            default:
                this._addChatMessage(`Desconocido: /${name} — prueba /help`, '#ffaaaa');
        }
    }

    _addChatMessage(text, color) {
        this._chatMessages.push({ text, color: color || '#ffffff' });
        if (this._chatMessages.length > 5) this._chatMessages.shift();
        this._chatMessages.forEach((m, i) => {
            if (this._chatLogTexts[i]) this._chatLogTexts[i].setText(m.text).setColor(m.color);
        });
        this._chatLogBg.setVisible(this._chatOpen);
        this._chatLogTexts.forEach(t => t.setVisible(this._chatOpen));
        this._showFloating(text, color);
    }

    _showFloating(text, color) {
        if (this._floatingMsg) { this._floatingMsg.destroy(); this._floatingMsg = null; }
        this._floatingMsg = this.add.text(F.CX, F.Y + F.H + 18, text, {
            fontSize: '13px', fontFamily: 'Verdana, Arial, sans-serif',
            color: color || '#ffffff', stroke: '#000', strokeThickness: 2,
            backgroundColor: '#00000077', padding: { x: 6, y: 3 }
        }).setOrigin(0.5, 0).setDepth(60);
        this.tweens.add({
            targets: this._floatingMsg,
            alpha: 0, delay: 2200, duration: 700,
            onComplete: () => { if (this._floatingMsg) { this._floatingMsg.destroy(); this._floatingMsg = null; } }
        });
    }

    // ── Online ─────────────────────────────────────────────────────
    _getInputKeys() {
        const r = {};
        const map = (keys, prefix) => {
            r[prefix + '_up']    = keys.up.isDown;
            r[prefix + '_down']  = keys.down.isDown;
            r[prefix + '_left']  = keys.left.isDown;
            r[prefix + '_right'] = keys.right.isDown;
        };
        map(this.keys1, 'k1');
        map(this.keys2, 'k2');
        if (this.is2v2) { map(this.keys3, 'k3'); map(this.keys4, 'k4'); }
        r.kick1 = this.kick1.isDown;
        r.kick2 = this.kick2.isDown;
        return r;
    }

    _setupOnlineGuest() {
        if (!this.ws) return;
        this.ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'state') this.serverState = msg.data;
            if (msg.type === 'opponent_left') {
                this._addChatMessage('El rival se desconectó', '#ffaaaa');
                this.time.delayedCall(1500, () => { this.ws && this.ws.close(); this.scene.start('MenuScene'); });
            }
        };
    }

    _setupOnlineHost() {
        this._guestInputs = {};
        if (!this.ws) return;
        this.ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'input') this._guestInputs = msg.keys;
        };
    }

    _applyGuestInputs() {
        if (!this._guestInputs || !Object.keys(this._guestInputs).length) return;
        const g = this._guestInputs;
        const gp  = this.playerIndex === 0 ? 'red'  : 'blue';
        const gp2 = this.playerIndex === 0 ? 'red2' : 'blue2';
        if (this.players[gp]) {
            this._movePlayer(this.players[gp], { up: g.k2_up, down: g.k2_down, left: g.k2_left, right: g.k2_right }, gp);
            this.players[gp]._isKicking = g.kick2 || false;
        }
        if (this.is2v2 && this.players[gp2]) {
            this._movePlayer(this.players[gp2], { up: g.k4_up, down: g.k4_down, left: g.k4_left, right: g.k4_right }, gp2);
            this.players[gp2]._isKicking = g.kick2 || false;
        }
    }

    _sendState() {
        if (!this.ws || this.ws.readyState !== 1) return;
        const state = {
            ballX: this.ball.x, ballY: this.ball.y,
            ballVX: this.ball._vx, ballVY: this.ball._vy,
            ballRot: this.ball.rotation, players: {}
        };
        Object.keys(this.players).forEach(k => {
            const p = this.players[k];
            state.players[k] = { x: p.x, y: p.y, vx: p._vx, vy: p._vy };
        });
        this.ws.send(JSON.stringify({ type: 'state', data: state }));
    }

    // ── Camera modes (1=close follow, 2=medium follow, 3=full field) ──
    _setCameraMode(mode) {
        this._cameraMode = mode;
        const cam = this.cameras.main;
        if (mode === 3) {
            cam.stopFollow();
            cam.setZoom(1);
            cam.centerOn(F.CX, F.CY);
            window._gameZoom = 1;
        } else if (mode === 2) {
            cam.startFollow(this.ball, true, 0.08, 0.08);
            cam.setZoom(1.35);
            window._gameZoom = 1.35;
        } else {
            cam.startFollow(this.ball, true, 0.12, 0.12);
            cam.setZoom(1.9);
            window._gameZoom = 1.9;
        }
        if (this.hudCam) this.hudCam.setText('📷' + mode);
    }

    // ── Goal posts (Haxball: 4 static discs radius=8, invMass=0) ──
    _createGoalPosts() {
        this._goalPosts = [
            { x: F.X,       y: F.GOAL_TOP, _vx: 0, _vy: 0 },
            { x: F.X,       y: F.GOAL_BOT, _vx: 0, _vy: 0 },
            { x: F.X + F.W, y: F.GOAL_TOP, _vx: 0, _vy: 0 },
            { x: F.X + F.W, y: F.GOAL_BOT, _vx: 0, _vy: 0 },
        ];
        this._cornerDiscs = [];
        const cr = this.stadiumCfg.cornerRadius;
        if (cr) {
            this._cornerDiscs = [
                { x: F.X + cr,       y: F.Y + cr,       _vx: 0, _vy: 0, r: cr },
                { x: F.X + F.W - cr, y: F.Y + cr,       _vx: 0, _vy: 0, r: cr },
                { x: F.X + cr,       y: F.Y + F.H - cr, _vx: 0, _vy: 0, r: cr },
                { x: F.X + F.W - cr, y: F.Y + F.H - cr, _vx: 0, _vy: 0, r: cr },
            ];
        }
    }

    // ── Custom Haxball Physics Engine ──────────────────────────────

    // Haxball disc-to-disc collision (exact impulse math)
    _resolveDiscDisc(a, b, rA, rB, invMA, invMB, bCoefA, bCoefB) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        const minDist = rA + rB;

        if (distSq >= minDist * minDist || distSq < 0.0001) return;

        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;

        // Position correction (push apart based on inverse mass)
        const totalInvMass = invMA + invMB;
        const overlap = minDist - dist;
        const corrA = overlap * (invMA / totalInvMass);
        const corrB = overlap * (invMB / totalInvMass);

        a.x -= nx * corrA;
        a.y -= ny * corrA;
        b.x += nx * corrB;
        b.y += ny * corrB;

        // Velocity impulse
        const dvx = a._vx - b._vx;
        const dvy = a._vy - b._vy;
        const relVn = dvx * nx + dvy * ny;

        if (relVn <= 0) return; // moving apart — no impulse needed

        const bounce = bCoefA * bCoefB;
        const impulse = (1 + bounce) * relVn / totalInvMass;

        a._vx -= impulse * invMA * nx;
        a._vy -= impulse * invMA * ny;
        b._vx += impulse * invMB * nx;
        b._vy += impulse * invMB * ny;
    }

    // Ball-to-wall collision with Haxball-exact bCoef per zone
    _resolveBallWall(b, radius) {
        const r = radius;

        // Field outer walls — ballArea bCoef = 1.0 (perfect bounce)
        if (b.y < F.Y + r) {
            b.y = F.Y + r;
            if (b._vy < 0) b._vy = -b._vy * WALL_BOUNCE;
        }
        if (b.y > F.Y + F.H - r) {
            b.y = F.Y + F.H - r;
            if (b._vy > 0) b._vy = -b._vy * WALL_BOUNCE;
        }

        const inGoalY = b.y > F.GOAL_TOP && b.y < F.GOAL_BOT;

        if (b.x < F.X - r && !inGoalY) {
            b.x = F.X - r;
            if (b._vx < 0) b._vx = -b._vx * WALL_BOUNCE;
        }
        if (b.x > F.X + F.W + r && !inGoalY) {
            b.x = F.X + F.W + r;
            if (b._vx > 0) b._vx = -b._vx * WALL_BOUNCE;
        }

        // Goal back wall — goalNet bCoef = 0.1 (ball slows down in goal)
        if (inGoalY) {
            const leftBack  = F.X - F.GOAL_D + r;
            const rightBack = F.X + F.W + F.GOAL_D - r;
            if (b.x < leftBack)  { b.x = leftBack;  if (b._vx < 0) b._vx = -b._vx * NET_BOUNCE; }
            if (b.x > rightBack) { b.x = rightBack; if (b._vx > 0) b._vx = -b._vx * NET_BOUNCE; }
        }

        // Goal net top/bottom (inside goal X range) — net bCoef = 0.1
        const inGoalXL = b.x < F.X - r;
        const inGoalXR = b.x > F.X + F.W + r;
        if (inGoalXL || inGoalXR) {
            if (b.y < F.GOAL_TOP + r) {
                b.y = F.GOAL_TOP + r;
                if (b._vy < 0) b._vy = -b._vy * NET_BOUNCE;
            }
            if (b.y > F.GOAL_BOT - r) {
                b.y = F.GOAL_BOT - r;
                if (b._vy > 0) b._vy = -b._vy * NET_BOUNCE;
            }
        }
    }

    // Player-to-wall (via Phaser collider, but we sync velocity)
    _syncPlayerVelocity(p) {
        // Phaser handles position via collider, but we track velocity ourselves
        if (p.body) {
            p._vx = p.body.velocity.x;
            p._vy = p.body.velocity.y;
        }
    }

    // Physics sub-step — Haxball exact order (verified from game-min.js):
    // 1. accel  2. kick  3. move (pre-damp)  4. damp  5. collide
    _physicsSubStep() {
        const ball = this.ball;
        const players = Object.values(this.players);

        // 1. Acceleration only (damping applied AFTER move, like Haxball)
        for (const p of players) {
            const accel = p._isKicking ? PK_ACCEL : P_ACCEL;
            p._vx += p._inputDx * accel;
            p._vy += p._inputDy * accel;
        }

        // 2. Kick impulse to ball (toggle auto-disables after contact)
        for (const p of players) {
            if (p._isKicking && !this._chatOpen) {
                const dx = ball.x - p.x;
                const dy = ball.y - p.y;
                const dist = Math.hypot(dx, dy);
                if (dist - P_RADIUS - B_RADIUS < 4 && dist > 0.1) {
                    const nx = dx / dist, ny = dy / dist;
                    ball._vx += nx * KICK_POWER * B_INV_M;
                    ball._vy += ny * KICK_POWER * B_INV_M;
                    if (!this._kickSoundPlayed) {
                        soundManager.kick(Math.hypot(ball._vx, ball._vy));
                        this._kickSoundPlayed = true;
                    }
                    p._isKicking = false; // toggle off after kick
                }
            }
        }

        // 3. Move with pre-damp velocity (Haxball moves BEFORE applying damping)
        ball.x += ball._vx;
        ball.y += ball._vy;
        for (const p of players) {
            p.x += p._vx;
            p.y += p._vy;
        }

        // 4. Damping applied after move (Haxball: vel = (vel + grav) * damp, grav=0)
        ball._vx *= B_DAMPING;
        ball._vy *= B_DAMPING;
        for (const p of players) {
            const damp = p._isKicking ? PK_DAMPING : P_DAMPING;
            p._vx *= damp;
            p._vy *= damp;
        }

        // 5. Collisions
        this._resolveKickoffBarrier(players);
        for (const p of players) this._resolvePlayerWall(p);
        for (let i = 0; i < players.length; i++)
            for (let j = i + 1; j < players.length; j++)
                this._resolveDiscDisc(players[i], players[j], P_RADIUS, P_RADIUS, P_INV_M, P_INV_M, P_BOUNCE, P_BOUNCE);
        this._resolveBallWall(ball, B_RADIUS);
        for (const post of this._goalPosts)
            this._resolveDiscDisc(ball, post, B_RADIUS, POST_RADIUS, B_INV_M, 0, B_BOUNCE, POST_BOUNCE);
        for (const cd of this._cornerDiscs) {
            this._resolveDiscDisc(ball, cd, B_RADIUS, cd.r, B_INV_M, 0, B_BOUNCE, WALL_BOUNCE);
            for (const p of players)
                this._resolveDiscDisc(p, cd, P_RADIUS, cd.r, P_INV_M, 0, P_BOUNCE, WALL_BOUNCE);
        }
        if (!this._kickoffActive) {
            for (const p of players)
                this._resolveDiscDisc(p, ball, P_RADIUS, B_RADIUS, P_INV_M, B_INV_M, P_BOUNCE, B_BOUNCE);
        }
    }

    _resolvePlayerWall(p) {
        const r = P_RADIUS;
        const b = P_BOUNCE * 0.1; // outer plane bCoef=0.1 → combined = 0.5×0.1 = 0.05
        if (p.y < F.OUTER_Y_MIN + r) { p.y = F.OUTER_Y_MIN + r; if (p._vy < 0) p._vy *= -b; }
        if (p.y > F.OUTER_Y_MAX - r) { p.y = F.OUTER_Y_MAX - r; if (p._vy > 0) p._vy *= -b; }
        if (p.x < F.OUTER_X_MIN + r) { p.x = F.OUTER_X_MIN + r; if (p._vx < 0) p._vx *= -b; }
        if (p.x > F.OUTER_X_MAX - r) { p.x = F.OUTER_X_MAX - r; if (p._vx > 0) p._vx *= -b; }
    }

    _resolveKickoffBarrier(players) {
        if (!this._kickoffActive) return;
        if (Math.hypot(this.ball._vx, this.ball._vy) > 0.5) {
            this._kickoffActive = false;
            return;
        }
        for (const p of players) {
            const isBlue = p._normalTexture.includes('blue');
            if (isBlue) {
                if (p.x > F.CX - P_RADIUS) { p.x = F.CX - P_RADIUS; if (p._vx > 0) p._vx = 0; }
            } else {
                if (p.x < F.CX + P_RADIUS) { p.x = F.CX + P_RADIUS; if (p._vx < 0) p._vx = 0; }
            }
        }
    }

    // Per-frame physics update
    _physicsStep() {
        const all = Object.values(this.players);
        this._kickSoundPlayed = false;
        for (let i = 0; i < SUB_STEPS; i++) {
            this._physicsSubStep();
        }
        this.ball.body.reset(this.ball.x, this.ball.y);
        this.ball.body.velocity.set(this.ball._vx, this.ball._vy);
        for (const p of all) {
            p.body.reset(p.x, p.y);
            p.body.velocity.set(p._vx, p._vy);
        }
    }

    // Player input → stores normalized direction (physics applied per sub-step)
    _movePlayer(player, keys, id) {
        if (!player) return;
        const isDown = (k) => k && k.isDown !== undefined ? k.isDown : !!k;
        const dx = (isDown(keys.right) ? 1 : 0) - (isDown(keys.left) ? 1 : 0);
        const dy = (isDown(keys.down)  ? 1 : 0) - (isDown(keys.up)   ? 1 : 0);
        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            player._inputDx = dx / len;
            player._inputDy = dy / len;
        } else {
            player._inputDx = 0;
            player._inputDy = 0;
        }
    }

    // ── Update ─────────────────────────────────────────────────────
    update() {
        // Apply mouse wheel zoom
        if (window._gameZoom !== this.cameras.main.zoom) {
            this.cameras.main.setZoom(window._gameZoom);
            if (this._cameraMode === 3) this.cameras.main.centerOn(F.CX, F.CY);
        }

        if (this.paused) return;

        if (this.isOnline) {
            if (this.isHost) this._updateHost();
            else             this._updateGuest();
            return;
        }

        if (!this._chatOpen) {
            if (Phaser.Input.Keyboard.JustDown(this.kick1)) {
                this.players.blue._isKicking = !this.players.blue._isKicking;
                if (this.is2v2 && this.players.blue2) this.players.blue2._isKicking = this.players.blue._isKicking;
            }
            if (Phaser.Input.Keyboard.JustDown(this.kick2)) {
                this.players.red._isKicking = !this.players.red._isKicking;
                if (this.is2v2 && this.players.red2) this.players.red2._isKicking = this.players.red._isKicking;
            }
            this._movePlayer(this.players.blue, this.keys1, 'blue');
            this._movePlayer(this.players.red, this.keys2, 'red');
            if (this.is2v2) {
                this._movePlayer(this.players.blue2, this.keys3, 'blue2');
                this._movePlayer(this.players.red2, this.keys4, 'red2');
            }
        }

        // Custom physics engine (replaces Phaser Arcade for ball/player-ball)
        this._physicsStep();

        this._updateBallSpin();
        this._checkGoal();
        this._updatePlayerLabels();
        this._updatePlayerTextures();
    }

    _updateHost() {
        if (!this._chatOpen) {
            if (Phaser.Input.Keyboard.JustDown(this.kick1)) this.players.blue._isKicking = !this.players.blue._isKicking;
            if (Phaser.Input.Keyboard.JustDown(this.kick2)) this.players.red._isKicking = !this.players.red._isKicking;
            this._movePlayer(this.players.blue, this.keys1, 'blue');
            this._movePlayer(this.players.red, this.keys2, 'red');
        }
        this._applyGuestInputs();
        this._physicsStep();
        this._updateBallSpin();
        this._checkGoal();
        this._sendState();
        this._updatePlayerLabels();
        this._updatePlayerTextures();
    }

    _updateGuest() {
        const keys = this._getInputKeys();
        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify({ type: 'input', keys }));
        }
        if (this.serverState) {
            const ext = (window.HAXTOS_EXTRAPOLATION || 0) / 1000;
            this.ball.x = this.serverState.ballX + this.serverState.ballVX * ext;
            this.ball.y = this.serverState.ballY + this.serverState.ballVY * ext;
            this.ball._vx = this.serverState.ballVX;
            this.ball._vy = this.serverState.ballVY;
            this.ball.rotation = this.serverState.ballRot || 0;
            this.ball.body.reset(this.ball.x, this.ball.y);
            this.ball.body.velocity.set(this.ball._vx, this.ball._vy);

            Object.keys(this.serverState.players || {}).forEach(k => {
                if (this.players[k]) {
                    this.players[k].x = this.serverState.players[k].x;
                    this.players[k].y = this.serverState.players[k].y;
                    this.players[k]._vx = this.serverState.players[k].vx;
                    this.players[k]._vy = this.serverState.players[k].vy;
                    this.players[k].body.reset(this.players[k].x, this.players[k].y);
                    this.players[k].body.velocity.set(this.players[k]._vx, this.players[k]._vy);
                }
            });
        }
        this._updatePlayerLabels();
        this._checkGoal();
    }

    _updateBallSpin() {
        this.ball.rotation += this.ball._vx * 0.003;
    }

    // ── Goal ───────────────────────────────────────────────────────
    _checkGoal() {
        if (this.goalLock) return;
        const bx = this.ball.x, by = this.ball.y;
        const inY = by > F.GOAL_TOP + B_RADIUS && by < F.GOAL_BOT - B_RADIUS;
        if (bx < F.X - B_RADIUS && inY) this._goal('red');
        else if (bx > F.X + F.W + B_RADIUS && inY) this._goal('blue');
    }

    _goal(team) {
        this.goalLock = true;
        this.paused = true;
        this.score[team]++;
        this._updateHUD();
        soundManager.goal();

        if ((this.scoreWin > 0 && this.score[team] >= this.scoreWin) || this._overtime) {
            this.time.delayedCall(600, () => this._endGame());
            return;
        }

        this.scene.launch('GoalScene', { team, score: { ...this.score } });
        this.time.delayedCall(2200, () => {
            this.scene.stop('GoalScene');
            this._reset();
            this.paused = false;
            this.goalLock = false;
        });
    }

    _reset() {
        const place = (obj, x, y) => {
            obj.x = x; obj.y = y;
            obj._vx = 0; obj._vy = 0;
            if (obj.body) obj.body.reset(x, y);
        };
        place(this.ball,         F.CX, F.CY);
        place(this.players.blue, F.CX - 200, F.CY);
        place(this.players.red,  F.CX + 200, F.CY);
        if (this.is2v2) {
            place(this.players.blue2, F.CX - 280, F.CY - 80);
            place(this.players.red2,  F.CX + 280, F.CY + 80);
        }
        for (const p of Object.values(this.players)) p._isKicking = false;
        this._kickoffActive = true;
    }

    _endGame() {
        this.paused = true;
        this.timerEvent.remove();
        this.scene.stop('GoalScene');

        if (this.timeLimit > 0 && this.score.blue === this.score.red && !this._overtime) {
            this._startOvertime();
            return;
        }

        soundManager.stopAmbient();
        const winner = this.score.blue > this.score.red ? 'blue'
                     : this.score.red > this.score.blue ? 'red' : null;
        if (winner) soundManager.win();
        this.scene.start('WinScene', { score: { ...this.score }, time: this.timeLeft });
    }

    _startOvertime() {
        this._overtime = true;
        this.paused = false;
        this.goalLock = false;
        this._reset();
        const GW = this.scale.width;
        const GH = this.scale.height;
        const txt = this.add.text(GW / 2, GH / 2 - 50, '¡PRÓRROGA!\nMuerte súbita', {
            fontSize: '36px', fontFamily: 'Verdana, Arial Black, sans-serif',
            color: '#ffff00', stroke: '#000', strokeThickness: 6, align: 'center'
        }).setOrigin(0.5).setDepth(30).setScrollFactor(0);
        this.time.delayedCall(3500, () => { if (txt && txt.active) txt.destroy(); });
        this.hudTime.setText('∞');
        soundManager.whistle();
    }
}
