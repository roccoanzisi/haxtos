// Haxball physics — converted from official .hbs parameters
// 60fps→120fps, Haxball units→pixels (scale: 880/550 = 1.6)
// Reference: github.com/haxball/haxball-issues wiki + issue #480

const P_RADIUS = 22;
const B_RADIUS = 16;

// Player (Haxball: acceleration=0.1, damping=0.96, bCoef=0.5, invMass=0.5)
// Terminal at 60fps: 0.1/(1-0.96)=2.5 u/f → ~240 px/s
// Damping per frame at 120fps: 0.96^(60/120) = 0.9798
// Phaser velocity is px/s, so accel per frame must be in px/s
// accel = v_terminal × (1 - damping) = 240 × 0.0202 = 4.85 px/s
const P_ACCEL   = 4.85;     // px/s per frame → terminal 240 px/s
const P_DAMPING = 0.9798;   // × vel (px/s) per frame (0.96^0.5)
const P_MASS    = 2;        // invMass=0.5 → mass=2
const P_BOUNCE  = 0.5;      // bCoef

// Player kicking — terminal 168 px/s: 168 × 0.0202 = 3.40 px/s
const PK_ACCEL   = 3.40;    // px/s per frame → terminal 168 px/s
const PK_DAMPING = 0.9798;  // same as normal
const KICK_POWER = 900;     // ~650 * 1.6 scale (Haxball kick strength)
const KICK_BACK  = 0.1;     // fraction of kick force reflected to player

// Ball (Haxball: damping=0.99, bCoef=0.5, invMass=1, radius=10)
// Damping per frame at 120fps: 0.99^(60/120) = 0.995
// Mass reduced to 0.5 for lighter feel (player=2, ball=0.5 → 4x lighter)
const B_DAMPING   = 0.995;  // per frame at 120fps
const B_MASS      = 0.5;    // invMass=2 → mass=0.5 (lighter than player)
const B_BOUNCE    = 0.5;    // bCoef
const B_MAX_SPEED = 700;    // cap to prevent tunneling at 120fps

const SCORE_WIN = 7;
const GAME_TIME = 3 * 60;
const KICK_COOLDOWN = 400;
const WALL_BOUNCE = 0.5;    // ballArea bCoef
const POST_BOUNCE = 0.5;    // goalPost bCoef

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
        this.lastKickTime = { blue: 0, red: 0, blue2: 0, red2: 0 };
        this.serverState = null;
        // stadium
        this.stadium = (data && data.stadium) ? data.stadium : 'classic';
        this.stadiumCfg = STADIUMS[this.stadium] || STADIUMS.classic;
        // chat
        this._chatOpen = false;
        this._chatInput = '';
        this._chatMessages = [];
        this._avatarOverrides = {};
        this._floatingMsg = null;
        // kick-off barrier
        this._kickoffBarrier = null;
        this._kickoffActive = true;
        // team colors
        this._teamTints = { blue: null, red: null, blue2: null, red2: null };
        this._originalTints = { blue: null, red: null, blue2: null, red2: null };
    }

    create() {
        this._forceKick = false;
        this._forceKickRed = false;
        soundManager.startAmbient();
        soundManager.whistle();

        this._drawField();
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
                if (this.timeLimit === 0) return; // no time limit
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

        // Grass stripes
        for (let i = 0; i < 8; i++) {
            g.fillStyle(i % 2 === 0 ? s.grass1 : s.grass2, 1);
            g.fillRect(F.X, F.Y + i * (F.H / 8), F.W, F.H / 8);
        }

        // Goal box background
        g.fillStyle(0x3a5530, 1);
        g.fillRect(F.X - F.GOAL_D, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
        g.fillRect(F.X + F.W,      F.GOAL_TOP, F.GOAL_D, F.GOAL_H);

        // Field border & lines
        g.lineStyle(3, s.lineColor, 1);
        g.strokeRect(F.X, F.Y, F.W, F.H);

        g.lineStyle(2, s.lineColor, 0.9);
        g.lineBetween(F.CX, F.Y, F.CX, F.Y + F.H);
        g.strokeCircle(F.CX, F.CY, 70);

        g.fillStyle(s.lineColor, 1);
        g.fillCircle(F.CX, F.CY, 4);

        g.lineStyle(2, s.lineColor, 0.45);
        g.strokeCircle(F.X + 85,         F.CY, 55);
        g.strokeCircle(F.X + F.W - 85,   F.CY, 55);

        // Left goal — blue posts + net
        g.lineStyle(3, s.goalColor1, 1);
        g.strokeRect(F.X - F.GOAL_D, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
        g.lineStyle(1, s.goalColor1, 0.28);
        for (let y = F.GOAL_TOP + 14; y < F.GOAL_BOT; y += 14) {
            g.lineBetween(F.X - F.GOAL_D, y, F.X, y);
        }
        for (let x = F.X - F.GOAL_D + 18; x < F.X; x += 18) {
            g.lineBetween(x, F.GOAL_TOP, x, F.GOAL_BOT);
        }

        // Right goal — red posts + net
        g.lineStyle(3, s.goalColor2, 1);
        g.strokeRect(F.X + F.W, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
        g.lineStyle(1, s.goalColor2, 0.28);
        for (let y = F.GOAL_TOP + 14; y < F.GOAL_BOT; y += 14) {
            g.lineBetween(F.X + F.W, y, F.X + F.W + F.GOAL_D, y);
        }
        for (let x = F.X + F.W + 18; x < F.X + F.W + F.GOAL_D; x += 18) {
            g.lineBetween(x, F.GOAL_TOP, x, F.GOAL_BOT);
        }
    }

    // ── Walls ──────────────────────────────────────────────────────
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

        // Field walls (gap for goal openings on left/right)
        add(F.X - T,  F.Y - T,          F.W + T * 2, T, false); // top
        add(F.X - T,  F.Y + F.H,        F.W + T * 2, T, false); // bottom
        add(F.X - T,  F.Y - T,          T, F.GOAL_TOP - F.Y + T,          false); // left-top
        add(F.X - T,  F.GOAL_BOT,       T, (F.Y + F.H) - F.GOAL_BOT,     false); // left-bot
        add(R,        F.Y - T,          T, F.GOAL_TOP - F.Y + T,          false); // right-top
        add(R,        F.GOAL_BOT,       T, (F.Y + F.H) - F.GOAL_BOT,     false); // right-bot

        // Goal posts (separate group → different bounce sound)
        add(F.X - F.GOAL_D - T, F.GOAL_TOP,     T, F.GOAL_H,      true); // left back
        add(F.X - F.GOAL_D - T, F.GOAL_TOP - T, F.GOAL_D + T, T,  true); // left top post
        add(F.X - F.GOAL_D - T, F.GOAL_BOT,     F.GOAL_D + T, T,  true); // left bot post
        add(R + F.GOAL_D,       F.GOAL_TOP,     T, F.GOAL_H,      true); // right back
        add(R,                  F.GOAL_TOP - T, F.GOAL_D + T, T,  true); // right top post
        add(R,                  F.GOAL_BOT,     F.GOAL_D + T, T,  true); // right bot post
    }

    // ── Entities ───────────────────────────────────────────────────
    _spawnEntities() {
        this._spawnBall();
        this._spawnPlayers();
    }

    _spawnBall() {
        this.ball = this.physics.add.image(F.CX, F.CY, 'ball');
        this.ball.setCircle(B_RADIUS, 1, 1);
        this.ball.setBounce(B_BOUNCE);
        this.ball.setDrag(0);      // manual damping
        this.ball.setMaxVelocity(0); // no Phaser cap — manual clamp
        this.ball.setDepth(10);
    }

    _spawnPlayers() {
        this.players = {};
        this.players.blue = this._makePlayer(F.X + 150,         F.CY,       'player_blue');
        this.players.red  = this._makePlayer(F.X + F.W - 150,   F.CY,       'player_red');
        if (this.is2v2) {
            this.players.blue2 = this._makePlayer(F.X + 70,         F.CY - 80, 'player_blue2');
            this.players.red2  = this._makePlayer(F.X + F.W - 70,   F.CY + 80, 'player_red2');
        }
    }

    _makePlayer(x, y, key) {
        const p = this.physics.add.image(x, y, key);
        p.setCircle(P_RADIUS, 1, 1);
        p.setBounce(P_BOUNCE);
        p.setDrag(0);       // manual damping (Haxball style)
        // No velocity cap — manual damping in _movePlayer
        p.setDepth(5);
        p._kickTexture = key.replace('player_', 'kick_');
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

    // ── Collisions ─────────────────────────────────────────────────
    _setupCollisions() {
        this.physics.add.collider(this.ball, this.walls,     () => this._wallBounce());
        this.physics.add.collider(this.ball, this.postWalls, () => this._postBounce());
        const all = Object.values(this.players);
        all.forEach(p => {
            this.physics.add.collider(p, this.walls);
            this.physics.add.collider(p, this.postWalls);
        });
        for (let i = 0; i < all.length; i++)
            for (let j = i + 1; j < all.length; j++)
                this.physics.add.collider(all[i], all[j]);

        this._createKickoffBarrier();
    }

    _createKickoffBarrier() {
        this._kickoffActive = true;

        // Ball bounces off barrier until kicked (destroy on contact)
        const bx = this.add.rectangle(F.CX, F.Y + F.H / 2, 2, F.H, 0x000000, 0);
        this.physics.add.existing(bx, true);
        this._kickoffBarrier = bx;

        this.physics.add.overlap(this.ball, bx, () => {
            if (!this._kickoffActive) return;
            this._kickoffActive = false;
            if (this._kickoffBarrier) {
                this._kickoffBarrier.destroy();
                this._kickoffBarrier = null;
            }
        });
    }

    _wallBounce() {
        const v = Math.hypot(this.ball.body.velocity.x, this.ball.body.velocity.y);
        if (v > 30) soundManager.wallHit(v);
    }
    _postBounce() {
        const v = Math.hypot(this.ball.body.velocity.x, this.ball.body.velocity.y);
        if (v > 30) soundManager.postHit(v);
    }

    // ── HUD ────────────────────────────────────────────────────────
    _buildHUD() {
        const s = (color) => ({
            fontSize: '34px', fontFamily: 'Verdana, Arial Black, sans-serif',
            color, stroke: '#000', strokeThickness: 5
        });

        this.hudBlue = this.add.text(F.CX - 80, 8, '0', s('#8888ff')).setOrigin(0.5, 0).setDepth(20);
        this.hudRed  = this.add.text(F.CX + 80, 8, '0', s('#ff4444')).setOrigin(0.5, 0).setDepth(20);
        this.add.text(F.CX, 8, '–', {
            fontSize: '28px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#ffffff', stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5, 0).setDepth(20);

        this.hudTime = this.add.text(F.CX, GAME_H - 26, this._fmt(this.timeLeft), {
            fontSize: '17px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#eeeeee', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5, 0).setDepth(20);

        this.add.text(F.X + 20, 8, 'AZUL', {
            fontSize: '15px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#8888ff', stroke: '#000', strokeThickness: 3
        }).setDepth(20);
        this.add.text(F.X + F.W - 20, 8, 'ROJO', {
            fontSize: '15px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#ff4444', stroke: '#000', strokeThickness: 3
        }).setOrigin(1, 0).setDepth(20);

        // Shoot buttons
        this.shootBlueBtn = this.add.text(12, GAME_H - 26, '⚡ SHOOT (ESPACIO)', {
            fontSize: '11px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#aaaaff', backgroundColor: '#0a0a33', padding: { x: 5, y: 3 }
        }).setDepth(20).setInteractive({ useHandCursor: true });
        this.shootBlueBtn.on('pointerdown', () => { this._forceKick = true; });
        this.shootBlueBtn.on('pointerup',   () => { this._forceKick = false; });

        this.shootRedBtn = this.add.text(GAME_W - 175, GAME_H - 26, '⚡ SHOOT (SHIFT)', {
            fontSize: '11px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#ffaaaa', backgroundColor: '#330a0a', padding: { x: 5, y: 3 }
        }).setDepth(20).setInteractive({ useHandCursor: true });
        this.shootRedBtn.on('pointerdown', () => { this._forceKickRed = true; });
        this.shootRedBtn.on('pointerup',   () => { this._forceKickRed = false; });

        // Control hint
        const hint = this.is2v2
            ? 'A/D:Az1  F/H:Az2  ←→:Rj1  J/L:Rj2  |  ENTER: chat'
            : 'WASD: Azul   ↑↓←→: Rojo   |   ENTER: chat   ESC: Menú';
        this.add.text(F.CX, F.Y + F.H + 5, hint, {
            fontSize: '11px', fontFamily: 'Verdana, Arial, sans-serif', color: '#888888'
        }).setOrigin(0.5, 0).setDepth(20);

        if (this.isOnline) {
            const code = (this.scene.get('OnlineScene') || {}).roomCode || '—';
            this.add.text(8, GAME_H - 48, 'Sala: ' + code, {
                fontSize: '12px', fontFamily: 'Verdana, Arial, sans-serif', color: '#66aa66'
            }).setDepth(20);
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
        const style = {
            fontSize: '12px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#ffffff', stroke: '#000000', strokeThickness: 3
        };
        const nums = { blue: '1', red: '2', blue2: '3', red2: '4' };
        this._playerLabels = {};
        Object.keys(this.players).forEach(key => {
            this._playerLabels[key] = this.add.text(0, 0, nums[key], style)
                .setOrigin(0.5, 1).setDepth(15);
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
        if (!this._chatOpen) return;
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
                } else {
                    this._addChatMessage('Uso: /extrapolation <0–200>', '#ffaaaa');
                }
                break;
            }
            case 'avatar': {
                const av = args.join(' ').slice(0, 3);
                if (av) {
                    this._avatarOverrides['blue'] = av;
                    this._addChatMessage(`Avatar: "${av}"`, '#aaffaa');
                } else {
                    this._addChatMessage('Uso: /avatar <texto>', '#ffaaaa');
                }
                break;
            }
            case 'zoom': {
                const z = parseFloat(args[0]);
                if (z > 0 && z <= 4) {
                    this.cameras.main.setZoom(z);
                    this._addChatMessage(`Zoom: ${z}x`, '#aaffaa');
                } else {
                    this._addChatMessage('Uso: /zoom <0.5–4>', '#ffaaaa');
                }
                break;
            }
            case 'handicap': {
                const ms = parseInt(args[0]);
                if (!isNaN(ms) && ms >= 0) {
                    window.HAXTOS_HANDICAP = Math.min(500, ms);
                    this._addChatMessage(`Handicap: ${window.HAXTOS_HANDICAP}ms`, '#aaffaa');
                } else {
                    this._addChatMessage('Uso: /handicap <ms>', '#ffaaaa');
                }
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
                    if (!match) {
                        this._addChatMessage('Uso: /colors <blue|red> #RRGGBB o /colors reset', '#ffaaaa');
                    } else {
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
                } else {
                    this._addChatMessage('Uso: /colors <blue|red> #RRGGBB o /colors reset', '#ffaaaa');
                }
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
            this._handleBallContact(this.players[gp], gp);
        }
        if (this.is2v2 && this.players[gp2]) {
            this._movePlayer(this.players[gp2], { up: g.k4_up, down: g.k4_down, left: g.k4_left, right: g.k4_right }, gp2);
            this.players[gp2]._isKicking = g.kick2 || false;
            this._handleBallContact(this.players[gp2], gp2);
        }
    }

    _sendState() {
        if (!this.ws || this.ws.readyState !== 1) return;
        const state = {
            ballX: this.ball.x, ballY: this.ball.y,
            ballVX: this.ball.body.velocity.x, ballVY: this.ball.body.velocity.y,
            ballRot: this.ball.rotation, players: {}
        };
        Object.keys(this.players).forEach(k => {
            const p = this.players[k];
            state.players[k] = { x: p.x, y: p.y, vx: p.body.velocity.x, vy: p.body.velocity.y };
        });
        this.ws.send(JSON.stringify({ type: 'state', data: state }));
    }

    // ── Update ─────────────────────────────────────────────────────
    update() {
        if (this.paused) return;

        if (this.isOnline) {
            if (this.isHost) this._updateHost();
            else             this._updateGuest();
            return;
        }

        if (!this._chatOpen) {
            this.players.blue._isKicking = this.kick1.isDown || this._forceKick;
            this._movePlayer(this.players.blue, this.keys1, 'blue');
            this.players.red._isKicking = this.kick2.isDown || this._forceKickRed;
            this._movePlayer(this.players.red, this.keys2, 'red');

            if (this.is2v2) {
                this.players.blue2._isKicking = this.kick1.isDown || this._forceKick;
                this._movePlayer(this.players.blue2, this.keys3, 'blue2');
                this.players.red2._isKicking = this.kick2.isDown || this._forceKickRed;
                this._movePlayer(this.players.red2, this.keys4, 'red2');
            }
        }

        Object.keys(this.players).forEach(k => this._handleBallContact(this.players[k], k));
        if (!this._chatOpen) {
            this._kickPlayer(this.players.blue, 'blue');
            this._kickPlayer(this.players.red, 'red');
            if (this.is2v2) {
                this._kickPlayer(this.players.blue2, 'blue2');
                this._kickPlayer(this.players.red2, 'red2');
            }
        }
        this._applyDamping();
        this._updateBallSpin();
        this._clampBall();
        this._checkGoal();
        this._updatePlayerLabels();

        // DEBUG
        if (this.keys1 && this.keys1.right) {
            console.log('W:', this.keys1.right.isDown, 'blue.x:', this.players.blue.x, 'blue.vx:', this.players.blue.body.velocity.x.toFixed(1));
        }
    }

    _updateHost() {
        if (!this._chatOpen) {
            this.players.blue._isKicking = this.kick1.isDown;
            this._movePlayer(this.players.blue, this.keys1, 'blue');
            this.players.red._isKicking = this.kick2.isDown;
            this._movePlayer(this.players.red, this.keys2, 'red');
        }
        this._applyGuestInputs();
        Object.keys(this.players).forEach(k => this._handleBallContact(this.players[k], k));
        if (!this._chatOpen) {
            this._kickPlayer(this.players.blue, 'blue');
            this._kickPlayer(this.players.red, 'red');
            if (this.is2v2) {
                this._kickPlayer(this.players.blue2, 'blue2');
                this._kickPlayer(this.players.red2, 'red2');
            }
        }
        this._applyDamping();
        this._updateBallSpin();
        this._clampBall();
        this._checkGoal();
        this._sendState();
        this._updatePlayerLabels();
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
            this.ball.body.velocity.x = this.serverState.ballVX;
            this.ball.body.velocity.y = this.serverState.ballVY;
            this.ball.rotation = this.serverState.ballRot || 0;

            Object.keys(this.serverState.players || {}).forEach(k => {
                if (this.players[k]) {
                    this.players[k].x = this.serverState.players[k].x;
                    this.players[k].y = this.serverState.players[k].y;
                    this.players[k].body.velocity.x = this.serverState.players[k].vx;
                    this.players[k].body.velocity.y = this.serverState.players[k].vy;
                }
            });
        }
        this._updatePlayerLabels();
        this._checkGoal();
    }

    // ── Physics helpers (Haxball) ──────────────────────────────────
    _movePlayer(player, keys, id) {
        if (!player || !player.body || !keys) return;
        const d = (k) => k && k.isDown !== undefined ? k.isDown : !!k;
        const vx = (d(keys.right) ? 1 : 0) - (d(keys.left) ? 1 : 0);
        const vy = (d(keys.down)  ? 1 : 0) - (d(keys.up)   ? 1 : 0);

        const damping = player._isKicking ? PK_DAMPING : P_DAMPING;
        player.body.velocity.x *= damping;
        player.body.velocity.y *= damping;

        if (vx !== 0 || vy !== 0) {
            const len = Math.sqrt(vx * vx + vy * vy);
            const accel = player._isKicking ? PK_ACCEL : P_ACCEL;
            player.body.velocity.x += (vx / len) * accel;
            player.body.velocity.y += (vy / len) * accel;
        }

        // DEBUG
        if (id === 'blue') {
            console.log(`W: ${d(keys.right)} blue.x: ${player.x.toFixed(1)} blue.vx: ${player.body.velocity.x.toFixed(1)}`);
        }
    }

    _kickPlayer(player, id) {
        if (!player._isKicking) return;
        const now = this.time.now;
        const last = this.lastKickTime[id] || 0;
        if (now - last < KICK_COOLDOWN) return;
        this.lastKickTime[id] = now;

        const dx = this.ball.x - player.x;
        const dy = this.ball.y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist < P_RADIUS + B_RADIUS + 20) {
            const nx = dx / (dist || 1);
            const ny = dy / (dist || 1);
            const impulse = KICK_POWER;

            // Apply kick impulse to ball
            this.ball.body.velocity.x += nx * impulse;
            this.ball.body.velocity.y += ny * impulse;

            // Kickback to player (Haxball: kickback × kickStrength / playerMass)
            player.body.velocity.x -= nx * impulse * KICK_BACK / P_MASS;
            player.body.velocity.y -= ny * impulse * KICK_BACK / P_MASS;

            soundManager.kick(Math.hypot(this.ball.body.velocity.x, this.ball.body.velocity.y));
        }
    }

    _handleBallContact(player, id) {
        const dx   = this.ball.x - player.x;
        const dy   = this.ball.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const min  = P_RADIUS + B_RADIUS + 2;

        if (dist < min && dist > 0.1) {
            const nx = dx / dist;
            const ny = dy / dist;

            // Separate
            this.ball.x = player.x + nx * (min + 1);
            this.ball.y = player.y + ny * (min + 1);

            const rvx  = this.ball.body.velocity.x - player.body.velocity.x;
            const rvy  = this.ball.body.velocity.y - player.body.velocity.y;
            const relV = rvx * nx + rvy * ny;

            if (relV < 0) {
                // Haxball mass-based collision (player=2, ball=1, bCoef=0.5)
                const total = B_MASS + P_MASS;
                const j = -(1 + B_BOUNCE) * relV / total;

                this.ball.body.velocity.x += j * P_MASS * nx;
                this.ball.body.velocity.y += j * P_MASS * ny;
                player.body.velocity.x  -= j * B_MASS * nx;
                player.body.velocity.y  -= j * B_MASS * ny;
            }
        }
    }

    _applyDamping() {
        // Ball damping every frame (Haxball: 0.99 per frame at 60fps → 0.995 at 120fps)
        this.ball.body.velocity.x *= B_DAMPING;
        this.ball.body.velocity.y *= B_DAMPING;
    }

    _updateBallSpin() {
        this.ball.rotation += this.ball.body.velocity.x * 0.003;
    }

    // Position-based boundary enforcement — works regardless of physics timing
    _clampBall() {
        const b = this.ball;
        const r = B_RADIUS;
        const inGoalY = b.y > F.GOAL_TOP && b.y < F.GOAL_BOT;

        // Speed cap (Haxball: no hard cap, but prevent tunneling)
        const spd = Math.hypot(b.body.velocity.x, b.body.velocity.y);
        if (spd > B_MAX_SPEED) {
            b.body.velocity.x = b.body.velocity.x / spd * B_MAX_SPEED;
            b.body.velocity.y = b.body.velocity.y / spd * B_MAX_SPEED;
        }

        // Top / bottom walls
        if (b.y < F.Y + r) {
            b.y = F.Y + r;
            if (b.body.velocity.y < 0) b.body.velocity.y *= -B_BOUNCE;
        }
        if (b.y > F.Y + F.H - r) {
            b.y = F.Y + F.H - r;
            if (b.body.velocity.y > 0) b.body.velocity.y *= -B_BOUNCE;
        }

        // Left side — only block if NOT in goal opening
        if (b.x < F.X - r && !inGoalY) {
            b.x = F.X - r;
            if (b.body.velocity.x < 0) b.body.velocity.x *= -B_BOUNCE;
        }
        // Right side — only block if NOT in goal opening
        if (b.x > F.X + F.W + r && !inGoalY) {
            b.x = F.X + F.W + r;
            if (b.body.velocity.x > 0) b.body.velocity.x *= -B_BOUNCE;
        }

        // Inside goal area: block at back wall and posts
        if (inGoalY) {
            const leftBack  = F.X - F.GOAL_D + r;
            const rightBack = F.X + F.W + F.GOAL_D - r;
            if (b.x < leftBack)  { b.x = leftBack;  if (b.body.velocity.x < 0) b.body.velocity.x *= -B_BOUNCE; }
            if (b.x > rightBack) { b.x = rightBack; if (b.body.velocity.x > 0) b.body.velocity.x *= -B_BOUNCE; }
        }

        // Goal posts top/bottom — prevent ball from going through the crossbar
        const inGoalXL = b.x < F.X - r;
        const inGoalXR = b.x > F.X + F.W + r;
        if (inGoalXL || inGoalXR) {
            if (b.y < F.GOAL_TOP + r) {
                b.y = F.GOAL_TOP + r;
                if (b.body.velocity.y < 0) b.body.velocity.y *= -B_BOUNCE;
            }
            if (b.y > F.GOAL_BOT - r) {
                b.y = F.GOAL_BOT - r;
                if (b.body.velocity.y > 0) b.body.velocity.y *= -B_BOUNCE;
            }
        }
    }

    // ── Goal ───────────────────────────────────────────────────────
    _checkGoal() {
        if (this.goalLock) return;
        const bx = this.ball.x, by = this.ball.y;
        const inY = by > F.GOAL_TOP + B_RADIUS && by < F.GOAL_BOT - B_RADIUS;
        // Goal when ball center crosses the field edge (not the back wall)
        if (bx < F.X - B_RADIUS && inY) this._goal('red');
        else if (bx > F.X + F.W + B_RADIUS && inY) this._goal('blue');
    }

    _goal(team) {
        this.goalLock = true;
        this.paused = true;
        this.score[team]++;
        this._updateHUD();
        soundManager.goal();

        if (this.scoreWin > 0 && this.score[team] >= this.scoreWin) {
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
        const place = (obj, x, y) => { obj.setPosition(x, y); obj.body.reset(x, y); };
        place(this.ball,         F.CX, F.CY);
        place(this.players.blue, F.X + 150,       F.CY);
        place(this.players.red,  F.X + F.W - 150, F.CY);
        if (this.is2v2) {
            place(this.players.blue2, F.X + 70,         F.CY - 80);
            place(this.players.red2,  F.X + F.W - 70,   F.CY + 80);
        }
        this._createKickoffBarrier();
    }

    _endGame() {
        this.paused = true;
        this.timerEvent.remove();
        this.scene.stop('GoalScene');
        soundManager.stopAmbient();
        const winner = this.score.blue > this.score.red ? 'blue' : this.score.red > this.score.blue ? 'red' : null;
        if (winner) soundManager.win();
        this.scene.start('WinScene', { score: { ...this.score }, time: this.timeLeft });
    }
}
