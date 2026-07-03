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
        this.roomCode = (data && data.roomCode) || null;
        this.isHost = this.playerIndex === 0;
        this.isAdmin = this.isHost;
        if (window.HAXTOS_EXTRAPOLATION === undefined) window.HAXTOS_EXTRAPOLATION = 100;
        this.roomPlayers = [];
        this._customAvatars = {};
        this.serverState = null;
        this.stadium = (data && data.stadium) ? data.stadium : 'classic';
        this.hbsData = (data && data.hbs) || null;
        this.stadiumCfg = this.hbsData ? STADIUMS.classic : (STADIUMS[this.stadium] || STADIUMS.classic);
        this._hbsField = null;
        this._hbsGoals = null;
        this._stadCanvasW = (data && data.stadCanvasW) || GAME_W;
        this._stadCanvasH = (data && data.stadCanvasH) || GAME_H;
        this._chatOpen = false;
        this._chatInput = '';
        this._chatMessages = [];
        this._avatarOverrides = {};
        this._floatingMsg = null;
        this._kickoffActive = true;
        this._kickoffTeam = 'red'; // red (left team) always kicks off first
        this._overtime = false;
        this._teamTints = { blue: null, red: null, blue2: null, red2: null };
        this._originalTints = { blue: null, red: null, blue2: null, red2: null };
    }

    create() {
        this._forceKick = false;
        this._forceKickRed = false;
        this.physicsAccumulator = 0;
        const nav = document.getElementById('_haxNavBar');
        if (nav) nav.style.display = 'none';
        soundManager.startAmbient();
        soundManager.whistle();

        this._recalcF();
        this._cameraMode = 3;
        this._setupCamera();

        this._drawField();
        this._createGoalPosts();
        this._buildWalls();
        this._spawnEntities();
        this._applyHBSBallPhysics();
        this._setupInput();
        this._setupCollisions();
        this._buildHUD();

        // Draw numbers inside player jerseys (Haxball style)
        this._resetTeamColors();
        this._updatePlayerAvatarsFromNames();

        this._buildChatUI();
        this._buildEscPanel();
        this._setupUICamera();

        this.timerEvent = this.time.addEvent({
            delay: 1000,
            repeat: this.timeLimit > 0 ? this.timeLimit - 1 : 99999,
            callback: () => {
                if (this.timeLimit === 0) return;
                if (this.paused || this.goalLock || (this.isOnline && !this.isHost)) return;
                this.timeLeft = Math.max(0, this.timeLeft - 1);
                this._updateHUD();
                if (this.timeLeft === 0) this._endGame();
            }
        });

        if (this.isOnline && !this.isHost) this._setupOnlineGuest();
        if (this.isOnline && this.isHost)  this._setupOnlineHost();

        if (this.isOnline) {
            // Online: start in lobby — wait for "Start game"
            this.gameStarted = false;
            this.paused = true;
            this._despawnPlayers();
            this._showEscPanel();
            if (this.ws && this.ws.readyState === 1) {
                this.ws.send(JSON.stringify({ type: 'request_players' }));
            }

            // Real-time ping/pong timer
            this.pingTimer = this.time.addEvent({
                delay: 1500,
                loop: true,
                callback: () => {
                    if (!this.isHost) {
                        const now = Date.now();
                        if (this.isP2P && this.dataChannel && this.dataChannel.readyState === 'open') {
                            this.dataChannel.send(JSON.stringify({ type: 'ping', time: now }));
                        } else if (this.ws && this.ws.readyState === 1) {
                            this.ws.send(JSON.stringify({ type: 'ping', time: now }));
                        }
                    } else {
                        if (this.pingText) this.pingText.setText('Ping: 0 ms').setColor('#88ff88');
                    }
                }
            });
        } else {
            // Local: start in lobby too, using local nickname
            this.gameStarted = false;
            this.paused = true;
            this._despawnPlayers();
            
            const myNick = localStorage.getItem('haxNickname') || 'Player';
            this.roomPlayers = [{ index: 0, id: 1, name: myNick, admin: true, team: 'spec' }];
            
            this._showEscPanel();
        }
    }

    // Recalculate F using actual window dimensions so field is centered
    _recalcF() {
        if (this.hbsData) { this._applyHBSField(); return; }
        const cw = window.innerWidth;
        const ch = window.innerHeight;
        const s = this.stadiumCfg;
        F.W = s.W; F.H = s.H;
        F.X = Math.floor((cw - s.W) / 2);
        F.Y = Math.floor((ch - s.H) / 2);
        F.GOAL_H = s.GOAL_H; F.GOAL_D = s.GOAL_D; F.WALL_T = 22;
        F.CX = F.X + F.W / 2;
        F.CY = F.Y + F.H / 2;
        F.GOAL_TOP = F.CY - F.GOAL_H / 2;
        F.GOAL_BOT = F.CY + F.GOAL_H / 2;
        F.OUTER_X_MIN = F.X - F.GOAL_D;
        F.OUTER_X_MAX = F.X + F.W + F.GOAL_D;
        F.OUTER_Y_MIN = F.Y - F.GOAL_D;
        F.OUTER_Y_MAX = F.Y + F.H + F.GOAL_D;
    }

    _applyHBSField() {
        const fd = HBSLoader.getFieldData(this.hbsData);
        this._hbsField = fd;

        const cw = window.innerWidth;
        const ch = window.innerHeight;
        F.W = fd.W; F.H = fd.H;
        F.X = Math.floor((cw - fd.W) / 2);
        F.Y = Math.floor((ch - fd.H) / 2);
        F.GOAL_H = fd.GOAL_H; F.GOAL_D = fd.GOAL_D; F.WALL_T = 22;
        F.CX = F.X + F.W / 2;
        F.CY = F.Y + F.H / 2;

        // Derive GOAL_TOP/BOT from HBS goal line positions (y-up → y-down)
        if (fd.goals.length > 0) {
            const lg = fd.goals[0]; // left goal
            const gyMax = Math.max(lg.p0.y, lg.p1.y);
            const gyMin = Math.min(lg.p0.y, lg.p1.y);
            F.GOAL_TOP = F.CY - gyMax;
            F.GOAL_BOT = F.CY - gyMin;
        } else {
            F.GOAL_TOP = F.CY - fd.GOAL_H / 2;
            F.GOAL_BOT = F.CY + fd.GOAL_H / 2;
        }

        F.OUTER_X_MIN = F.CX - fd.camW;
        F.OUTER_X_MAX = F.CX + fd.camW;
        F.OUTER_Y_MIN = F.CY - fd.camH;
        F.OUTER_Y_MAX = F.CY + fd.camH;

        // Store HBS goal lines for detection (world coords)
        this._hbsGoals = fd.goals.map(g => ({
            worldX:  F.CX + g.p0.x,
            goalTop: F.CY - Math.max(g.p0.y, g.p1.y),
            goalBot: F.CY - Math.min(g.p0.y, g.p1.y),
            isLeft:  g.p0.x < 0,
            team:    g.team
        }));
    }

    _setupCamera() {
        const cw = window.innerWidth;
        const ch = window.innerHeight;
        const cam = this.cameras.main;
        cam.setBounds(0, 0, cw, ch);
        cam.stopFollow();
        cam.setZoom(1);
        cam.centerOn(F.CX, F.CY);
        window._gameZoom = 1;
        window._baseZoom = 1;
        this._baseZoom = 1;
    }

    // Dedicated zoom-1 camera for hudObjects (score bar, buttons, chat, ping, shoot
    // buttons...) so 1/2/3 camera-mode zoom/follow on cameras.main never scales or
    // shifts them off-screen. Must run once, after every initial object (world + HUD)
    // for this scene has been created.
    _setupUICamera() {
        const cw = window.innerWidth;
        const ch = window.innerHeight;
        this.uiCamera = this.cameras.add(0, 0, cw, ch, false);
        this.uiCamera.setScroll(0, 0);
        this.uiCamera.setZoom(1);
        this.cameras.main.ignore(this.hudObjects);
        this._refreshUICameraIgnore();
    }

    // Re-scan for world objects created after _setupUICamera() ran (respawned
    // players/labels, redrawn field on map change, etc.) and add them to uiCamera's
    // ignore list too — otherwise they'd render a second, undistorted "ghost" copy
    // through uiCamera on top of the correctly-zoomed mainCamera copy.
    _refreshUICameraIgnore() {
        if (!this.uiCamera) return;
        const worldObjects = this.children.list.filter(o => !this.hudObjects.includes(o));
        this.uiCamera.ignore(worldObjects);
    }

    _applyHBSBallPhysics() {
        if (!this.hbsData || !this._hbsField) return;
        let bp = this._hbsField.ballPhysics;
        if (!bp) return;

        // "disc0" → use first disc definition as ball template
        if (bp === 'disc0') bp = (this.hbsData.discs || [])[0] || null;
        if (!bp) return;

        if (bp.radius  != null) {
            this.ball._radius = bp.radius;
            // Update Phaser physics circle + scale sprite to match
            const scale = bp.radius / B_RADIUS;
            this.ball.setCircle(bp.radius, 1, 1);
            this.ball.setScale(scale);
        }
        if (bp.damping != null) this.ball._damping = bp.damping;
        if (bp.invMass != null) this.ball._invMass  = bp.invMass;
        if (bp.bCoef   != null) this.ball._bCoef    = bp.bCoef;
        if (bp.color   != null) {
            const c = HBSLoader.parseColor(bp.color);
            if (c !== null) this.ball.setTint(c);
        }
    }

    // ── Field (stadium-aware) ──────────────────────────────────────
    _drawField() {
        if (this.hbsData && this._hbsField) { this._drawHBSField(); return; }

        // Clean up any previously drawn field graphics (e.g. after a map change)
        if (this._fieldGfx) {
            this._fieldGfx.forEach(o => o && o.destroy());
        }
        this._fieldGfx = [];

        const s = this.stadiumCfg;
        const cr = s.cornerRadius || 0;

        // Background layer — full window bg + solid grass base
        const bg = this.add.graphics();
        bg.fillStyle(s.bgColor, 1);
        bg.fillRect(0, 0, window.innerWidth, window.innerHeight);
        bg.fillStyle(s.grass1, 1);
        bg.fillRect(F.X, F.Y, F.W, F.H);

        // Diagonal stripe overlay (Haxball look), clipped to the field rect
        const stripes = this.add.graphics();
        stripes.fillStyle(s.grass2, 1);
        const period = 80, half = 40;
        for (let sx = F.X - F.H; sx < F.X + F.W + F.H; sx += period) {
            stripes.fillPoints([
                { x: sx,              y: F.Y },
                { x: sx + half,       y: F.Y },
                { x: sx + half + F.H, y: F.Y + F.H },
                { x: sx + F.H,        y: F.Y + F.H }
            ], true);
        }
        const clipShape = this.make.graphics({ x: 0, y: 0 }, false);
        clipShape.fillRect(F.X, F.Y, F.W, F.H);
        stripes.setMask(clipShape.createGeometryMask());

        // Foreground layer — boundary lines, center circle, net, posts
        // (no separate goal-box background fill: the outer bgColor already shows through
        // behind the net, matching Haxball's uniform out-of-bounds area with no box artifact)
        const g = this.add.graphics();

        // Field boundary — four sides with a gap at each goal mouth (posts round the corners)
        g.lineStyle(3, s.lineColor, 1);
        g.beginPath();
        g.moveTo(F.X, F.GOAL_TOP);
        g.lineTo(F.X, F.Y + cr);
        g.arc(F.X + cr, F.Y + cr, cr, Math.PI, -Math.PI / 2, false);
        g.lineTo(F.X + F.W - cr, F.Y);
        g.arc(F.X + F.W - cr, F.Y + cr, cr, -Math.PI / 2, 0, false);
        g.lineTo(F.X + F.W, F.GOAL_TOP);
        g.strokePath();
        g.beginPath();
        g.moveTo(F.X, F.GOAL_BOT);
        g.lineTo(F.X, F.Y + F.H - cr);
        g.arc(F.X + cr, F.Y + F.H - cr, cr, Math.PI, Math.PI / 2, true);
        g.lineTo(F.X + F.W - cr, F.Y + F.H);
        g.arc(F.X + F.W - cr, F.Y + F.H - cr, cr, Math.PI / 2, 0, true);
        g.lineTo(F.X + F.W, F.GOAL_BOT);
        g.strokePath();

        g.lineStyle(3, s.lineColor, 1.0);
        g.lineBetween(F.CX, F.Y, F.CX, F.Y + F.H);
        g.strokeCircle(F.CX, F.CY, 75);

        g.fillStyle(s.lineColor, 1);
        g.fillCircle(F.CX, F.CY, 4);

        // Goal net cage — black bracket outline, rounded at the back, open at the posts (matching Haxball classic exactly)
        const netCr = Math.min(F.GOAL_D, F.GOAL_H / 2);
        g.lineStyle(3, 0x000000, 1.0);

        g.beginPath();
        g.moveTo(F.X, F.GOAL_TOP);
        g.lineTo(F.X - F.GOAL_D + netCr, F.GOAL_TOP);
        g.arc(F.X - F.GOAL_D + netCr, F.GOAL_TOP + netCr, netCr, -Math.PI / 2, Math.PI, true);
        g.lineTo(F.X - F.GOAL_D, F.GOAL_BOT - netCr);
        g.arc(F.X - F.GOAL_D + netCr, F.GOAL_BOT - netCr, netCr, Math.PI, Math.PI / 2, true);
        g.lineTo(F.X, F.GOAL_BOT);
        g.strokePath();

        g.beginPath();
        g.moveTo(F.X + F.W, F.GOAL_TOP);
        g.lineTo(F.X + F.W + F.GOAL_D - netCr, F.GOAL_TOP);
        g.arc(F.X + F.W + F.GOAL_D - netCr, F.GOAL_TOP + netCr, netCr, -Math.PI / 2, 0, false);
        g.lineTo(F.X + F.W + F.GOAL_D, F.GOAL_BOT - netCr);
        g.arc(F.X + F.W + F.GOAL_D - netCr, F.GOAL_BOT - netCr, netCr, 0, Math.PI / 2, false);
        g.lineTo(F.X + F.W, F.GOAL_BOT);
        g.strokePath();

        // Goal posts — team-colored discs matching Haxball physics discs (radius=8)
        g.lineStyle(2, 0x000000, 1.0);
        [
            { px: F.X,       color: s.goalColor1 },
            { px: F.X + F.W, color: s.goalColor2 },
        ].forEach(({ px, color }) => {
            g.fillStyle(color, 1);
            [F.GOAL_TOP, F.GOAL_BOT].forEach(py => {
                g.fillCircle(px, py, POST_RADIUS);
                g.strokeCircle(px, py, POST_RADIUS);
            });
        });

        this._fieldGfx = [bg, stripes, clipShape, g];
        this._refreshUICameraIgnore();
    }

    _drawHBSField() {
        const fd = this._hbsField;
        const g = this.add.graphics();
        const isHockey = fd.bgType.includes('hockey');

        // Full-window background
        const outerBg = isHockey ? 0x1a1a1a : 0x2d5a1e;
        g.fillStyle(outerBg, 1);
        g.fillRect(0, 0, window.innerWidth, window.innerHeight);

        // Field rectangle with horizontal stripes
        const stripe1 = isHockey ? 0x333333 : 0x4a7a3a;
        const stripe2 = isHockey ? 0x2a2a2a : 0x3d6b30;
        for (let i = 0; i < 8; i++) {
            g.fillStyle(i % 2 === 0 ? stripe1 : stripe2, 1);
            g.fillRect(F.X, F.Y + i * (F.H / 8), F.W, F.H / 8);
        }

        // Rounded corners mask (if any)
        if (fd.cornerRadius > 0) {
            const cr = fd.cornerRadius;
            g.fillStyle(outerBg, 1);
            g.beginPath(); g.moveTo(F.X, F.Y); g.lineTo(F.X + cr, F.Y);
            g.arc(F.X + cr, F.Y + cr, cr, -Math.PI / 2, Math.PI, true);
            g.closePath(); g.fillPath();
            g.beginPath(); g.moveTo(F.X + F.W, F.Y); g.lineTo(F.X + F.W - cr, F.Y);
            g.arc(F.X + F.W - cr, F.Y + cr, cr, -Math.PI / 2, 0, false);
            g.closePath(); g.fillPath();
            g.beginPath(); g.moveTo(F.X, F.Y + F.H); g.lineTo(F.X + cr, F.Y + F.H);
            g.arc(F.X + cr, F.Y + F.H - cr, cr, Math.PI / 2, Math.PI, false);
            g.closePath(); g.fillPath();
            g.beginPath(); g.moveTo(F.X + F.W, F.Y + F.H); g.lineTo(F.X + F.W - cr, F.Y + F.H);
            g.arc(F.X + F.W - cr, F.Y + F.H - cr, cr, 0, Math.PI / 2, false);
            g.closePath(); g.fillPath();
        }

        // Goal net backgrounds
        g.fillStyle(isHockey ? 0x222222 : 0x2a4a20, 1);
        g.fillRect(F.X - F.GOAL_D, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
        g.fillRect(F.X + F.W,      F.GOAL_TOP, F.GOAL_D, F.GOAL_H);

        // Draw all visible HBS segments
        const vtx = fd.vertexes;
        const lineColor = isHockey ? 0xE9CC6E : 0xC7E6BD;
        for (const seg of fd.segments) {
            if (seg.vis === false) continue;
            if (seg.v0 >= vtx.length || seg.v1 >= vtx.length) continue;
            const v0 = vtx[seg.v0];
            const v1 = vtx[seg.v1];
            // Convert HBS coords (y-up, origin=center) → world coords (y-down)
            const p0 = { x: F.CX + v0.x, y: F.CY - v0.y };
            const p1 = { x: F.CX + v1.x, y: F.CY - v1.y };
            const color = HBSLoader.parseColor(seg.color);
            g.lineStyle(2, color != null ? color : lineColor, 1);
            HBSLoader.drawSegment(g, p0, p1, seg.curve || 0);
        }

        // Goal post outlines
        g.lineStyle(2, 0xcccccc, 1);
        g.strokeRect(F.X - F.GOAL_D, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
        g.strokeRect(F.X + F.W,      F.GOAL_TOP, F.GOAL_D, F.GOAL_H);

        // Draw static discs (goal posts, etc.)
        for (const disc of fd.staticDiscs) {
            const wx = F.CX + disc.pos[0];
            const wy = F.CY - disc.pos[1];
            const r  = disc.radius || POST_RADIUS;
            const color = HBSLoader.parseColor(disc.color) || 0xffffff;
            g.fillStyle(color, 1);
            g.fillCircle(wx, wy, r);
            g.lineStyle(1, 0x000000, 0.5);
            g.strokeCircle(wx, wy, r);
        }

        // If no static discs from HBS, draw default goal posts
        if (fd.staticDiscs.length === 0) {
            g.fillStyle(0xffffff, 1);
            g.lineStyle(2, 0x000000, 1);
            [F.X, F.X + F.W].forEach(px => {
                [F.GOAL_TOP, F.GOAL_BOT].forEach(py => {
                    g.fillCircle(px, py, POST_RADIUS);
                    g.strokeCircle(px, py, POST_RADIUS);
                });
            });
        }
        this._refreshUICameraIgnore();
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
        // Per-ball physics (can be overridden by HBS ballPhysics)
        this.ball._radius  = B_RADIUS;
        this.ball._damping = B_DAMPING;
        this.ball._invMass = B_INV_M;
        this.ball._bCoef   = B_BOUNCE;

        // Collision groups/masks
        this.ball.cGroup = ['ball'];
        this.ball.cMask = ['all'];
    }

    _despawnPlayers() {
        Object.keys(this.players || {}).forEach(k => {
            if (this.players[k]) this.players[k].destroy();
        });
        this.players = {};
        if (this._playerLabels) {
            Object.keys(this._playerLabels).forEach(k => {
                if (this._playerLabels[k]) this._playerLabels[k].destroy();
            });
            this._playerLabels = {};
        }
        if (this.ball) this.ball.setVisible(false);
        if (this._guestGhost) {
            this._guestGhost.destroy();
            this._guestGhost = null;
        }
    }

    _applyMidGameTeamChanges(prevList, newList) {
        if (!this.gameStarted || !prevList || !newList) return;

        let anyChanged = false;
        for (const np of newList) {
            const op = prevList.find(p => p.index === np.index);
            if (op && op.team !== np.team) { anyChanged = true; break; }
        }
        for (const op of prevList) {
            const np = newList.find(p => p.index === op.index);
            if (!np) { anyChanged = true; break; }
        }
        if (!anyChanged) return;

        // Build playerIndex → sprite from old list
        const indexToSprite = {};
        for (const op of prevList) {
            if (op.team !== 'spec' && this.players[op.team]) {
                indexToSprite[op.index] = this.players[op.team];
            }
        }

        // Destroy old labels
        if (this._playerLabels) {
            Object.keys(this._playerLabels).forEach(k => {
                if (this._playerLabels[k]) this._playerLabels[k].destroy();
            });
            this._playerLabels = {};
        }

        const newPlayers = {};

        // Destroy sprites for players who went to spec or left
        for (const op of prevList) {
            const np = newList.find(p => p.index === op.index);
            if (op.team !== 'spec' && (!np || np.team === 'spec')) {
                const sprite = indexToSprite[op.index];
                if (sprite) sprite.destroy();
            }
        }

        // Spawn sprites for players who came from spec or change teams
        const texMap = { red: 'player_red', blue: 'player_blue', red2: 'player_red2', blue2: 'player_blue2' };
        for (const np of newList) {
            if (np.team === 'spec') continue;
            const op = prevList.find(p => p.index === np.index);
            const isFromSpec = !op || op.team === 'spec';
            
            if (isFromSpec) {
                const isBlue = np.team.includes('blue');
                const spawnX = isBlue ? F.CX + 200 : F.CX - 200;
                const spawnY = F.CY;
                const newKey = texMap[np.team];
                if (newKey) {
                    const sprite = this._makePlayer(spawnX, spawnY, newKey);
                    newPlayers[np.team] = sprite;
                }
            } else {
                const sprite = indexToSprite[np.index];
                if (sprite) {
                    const newKey = texMap[np.team];
                    if (newKey) {
                        sprite.setTexture(newKey);
                        sprite._normalTexture = newKey;
                        sprite._kickTexture   = newKey.replace('player_', 'kick_');
                        sprite.cGroup = np.team.includes('blue') ? ['blue'] : ['red'];
                    }
                    newPlayers[np.team] = sprite;
                }
            }
        }

        // Destroy any leftover player sprites that are no longer in newPlayers
        Object.keys(this.players).forEach(k => {
            const s = this.players[k];
            if (s && !Object.values(newPlayers).includes(s)) {
                s.destroy();
            }
        });

        this.players = newPlayers;
        this._buildPlayerLabels();
        this._refreshUICameraIgnore();
    }

    _spawnPlayers() {
        this._despawnPlayers();

        let hasBlue = false;
        let hasRed = false;

        if (this.isOnline) {
            const players = this.roomPlayers || [];
            hasBlue = players.some(p => p.team === 'blue');
            hasRed  = players.some(p => p.team === 'red');
        } else {
            hasBlue = true;
            hasRed = true;
        }

        if (hasBlue) {
            this.players.blue = this._makePlayer(F.CX + 200, F.CY, 'player_blue');
            if (this.is2v2) {
                this.players.blue2 = this._makePlayer(F.CX + 280, F.CY + 80, 'player_blue2');
            }
        }
        if (hasRed) {
            this.players.red  = this._makePlayer(F.CX - 200, F.CY, 'player_red');
            if (this.is2v2) {
                this.players.red2  = this._makePlayer(F.CX - 280, F.CY - 80, 'player_red2');
            }
        }
        this._buildPlayerLabels();
        if (this.ball) this.ball.setVisible(true);
        this._refreshUICameraIgnore();
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
        p._hasKicked = false;

        // Physics properties for generic collision resolution
        p._radius  = P_RADIUS;
        p._bCoef   = P_BOUNCE;
        p._invMass = P_INV_M;

        // Collision groups/masks
        p.cGroup = key.includes('blue') ? ['blue'] : ['red'];
        p.cMask = ['all'];

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
        // ESC via document listener (más fiable que Phaser kb para esta tecla)
        this._escKeyHandler = (e) => {
            if (e.key !== 'Escape') return;
            if (this._chatOpen) { this._closeChat(); return; }
            this._escVisible ? this._hideEscPanel() : this._showEscPanel();
        };
        document.addEventListener('keydown', this._escKeyHandler);
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
        const GW = window.innerWidth;
        const GH = window.innerHeight;
        // hudObjects is rendered by a dedicated zoom-1 uiCamera (see _setupUICamera) so it
        // never gets scaled/misplaced by the main camera's zoom/follow (1/2/3 camera modes).
        this.hudObjects = [];
        const track = (obj) => { this.hudObjects.push(obj); return obj; };
        const sf = (obj) => track(obj.setScrollFactor(0).setDepth(20));

        // ── Top bar (exact Haxball layout): score+timer panel (center) ──
        const barY = 8, barH = 32;
        const scoreW = Math.min(340, GW * 0.32);
        const scoreX = GW / 2 - scoreW / 2;

        const scoreBg = track(this.add.graphics().setScrollFactor(0).setDepth(19));
        scoreBg.fillStyle(0x1d2024, 1.0); // Exact Haxball top bar color
        scoreBg.fillRoundedRect(scoreX, barY, scoreW, barH, 4); // sharp-ish rounded corner (radius 4)

        const midY = barY + barH / 2;
        const sqSize = 16;

        // Red team square
        const redSqX = scoreX + 12;
        scoreBg.fillStyle(0xe53e3e, 1);
        scoreBg.fillRoundedRect(redSqX, midY - sqSize / 2, sqSize, sqSize, 3);

        this.hudRed = sf(this.add.text(redSqX + sqSize + 12, midY, '0', {
            fontSize: '16px', fontFamily: '"Arial Black", Arial, sans-serif', color: '#ffffff'
        }).setOrigin(0.5));

        sf(this.add.text(scoreX + 68, midY, '-', {
            fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#ffffff'
        }).setOrigin(0.5));

        this.hudBlue = sf(this.add.text(scoreX + 96, midY, '0', {
            fontSize: '16px', fontFamily: '"Arial Black", Arial, sans-serif', color: '#ffffff'
        }).setOrigin(0.5));

        // Blue team square
        const blueSqX = scoreX + 112;
        scoreBg.fillStyle(0x3182ce, 1);
        scoreBg.fillRoundedRect(blueSqX, midY - sqSize / 2, sqSize, sqSize, 3);

        this.hudTime = sf(this.add.text(scoreX + scoreW - 16, midY, this._fmt(this.timeLeft), {
            fontSize: '16px', fontFamily: '"Arial Black", Arial, sans-serif', color: '#ffffff'
        }).setOrigin(1, 0.5));

        // ── Top-right button panel: sound / menu / camera (exact Haxball layout) ──
        const btnH = 32, btnGap = 4, btnPad = 5;
        const soundW = 36, menuW = 84, gearW = 36;
        const panelW = btnPad * 2 + soundW + menuW + gearW + btnGap * 2;
        const panelX = GW - panelW - 8;

        const btnBg = track(this.add.graphics().setScrollFactor(0).setDepth(19));
        btnBg.fillStyle(0x1d2024, 1.0);
        btnBg.fillRoundedRect(panelX, barY, panelW, btnH, 4);

        let bx = panelX + btnPad;
        const mkBtn = (w) => {
            const bg = track(this.add.graphics().setScrollFactor(0).setDepth(20));
            bg.fillStyle(0x2c5577, 1);
            bg.fillRoundedRect(bx, barY + 3, w, btnH - 6, 5);
            const hit = track(this.add.rectangle(bx + w / 2, barY + btnH / 2, w, btnH - 6, 0, 0)
                .setScrollFactor(0).setDepth(21).setInteractive({ useHandCursor: true }));
            const cx = bx + w / 2;
            bx += w + btnGap;
            return { hit, cx };
        };

        const soundSlot = mkBtn(soundW);
        this._hudSoundIcon = sf(this.add.text(soundSlot.cx, barY + btnH / 2,
            soundManager.enabled ? '\u{1F50A}' : '\u{1F507}', { fontSize: '14px' }).setOrigin(0.5).setDepth(21));
        soundSlot.hit.on('pointerdown', () => {
            const on = soundManager.toggle();
            this._hudSoundIcon.setText(on ? '\u{1F50A}' : '\u{1F507}');
        });

        const menuSlot = mkBtn(menuW);
        sf(this.add.text(menuSlot.cx, barY + btnH / 2, '☰ Menú', {
            fontSize: '13px', fontFamily: '"Arial Black", Arial, sans-serif', color: '#ffffff'
        }).setOrigin(0.5).setDepth(21));
        menuSlot.hit.on('pointerdown', () => {
            this._escVisible ? this._hideEscPanel() : this._showEscPanel();
        });

        const gearSlot = mkBtn(gearW);
        this.hudCam = sf(this.add.text(gearSlot.cx, barY + btnH / 2, '⚙️', {
            fontSize: '14px'
        }).setOrigin(0.5).setDepth(21));
        gearSlot.hit.on('pointerdown', () => {
            this._setCameraMode((this._cameraMode % 3) + 1);
        });



        this.pingText = sf(this.add.text(GW - 20, 16, 'Ping: 0 ms', {
            fontSize: '13px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#88ff88', stroke: '#000', strokeThickness: 3
        }).setOrigin(1, 0));
        this.pingText.setVisible(this.isOnline);

        this.shootBlueBtn = this.add.text(12, GH - 26, '⚡ SHOOT (ESPACIO)', {
            fontSize: '11px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#ffaaaa', backgroundColor: '#330a0a', padding: { x: 5, y: 3 }
        }).setScrollFactor(0).setDepth(20).setInteractive({ useHandCursor: true });
        this.shootBlueBtn.on('pointerdown', () => { this._forceKick = true; });
        this.shootBlueBtn.on('pointerup',   () => { this._forceKick = false; });

        this.shootRedBtn = this.add.text(GW - 175, GH - 26, '⚡ SHOOT (SHIFT)', {
            fontSize: '11px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#aaaaff', backgroundColor: '#0a0a33', padding: { x: 5, y: 3 }
        }).setScrollFactor(0).setDepth(20).setInteractive({ useHandCursor: true });
        this.shootRedBtn.on('pointerdown', () => { this._forceKickRed = true; });
        this.shootRedBtn.on('pointerup',   () => { this._forceKickRed = false; });

        const hint = this.is2v2
            ? 'WASD:Rj1  F/H:Rj2  ←→:Az1  J/L:Az2  |  1/2/3: cámara  ENTER: chat'
            : 'WASD: Rojo   ↑↓←→: Azul   |   1/2/3: cámara   ENTER: chat   ESC: Menú';
        sf(this.add.text(GW / 2, GH - 42, hint, {
            fontSize: '11px', fontFamily: 'Verdana, Arial, sans-serif', color: '#888888'
        }).setOrigin(0.5, 0));

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
            }).setOrigin(0.5, 1).setDepth(15).setVisible(false); // Hidden! Avatar text is inside the circle
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
        const H = this._stadCanvasH;
        const LOG = 5;
        const track = (obj) => { this.hudObjects.push(obj); return obj; };
        this._chatLogBg = track(this.add.rectangle(0, H - 130, 440, LOG * 20 + 10, 0x000000, 0.55)
            .setOrigin(0, 0).setDepth(49).setScrollFactor(0).setVisible(false));
        this._chatLogTexts = [];
        for (let i = 0; i < LOG; i++) {
            this._chatLogTexts.push(
                track(this.add.text(8, H - 125 + i * 20, '', {
                    fontSize: '13px', fontFamily: 'Verdana, Arial, sans-serif', color: '#ffffff'
                }).setDepth(50).setScrollFactor(0).setVisible(false))
            );
        }
        this._chatInputBg = track(this.add.rectangle(0, H - 24, 440, 24, 0x111111, 0.92)
            .setOrigin(0, 0).setDepth(49).setScrollFactor(0).setVisible(false));
        this._chatInputText = track(this.add.text(8, H - 22, '', {
            fontSize: '13px', fontFamily: 'Verdana, Arial, sans-serif', color: '#ffff88'
        }).setDepth(50).setScrollFactor(0).setVisible(false));
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
        if (ev.ctrlKey && (ev.key === 'v' || ev.key === 'V')) {
            navigator.clipboard.readText().then(clipText => {
                this._chatInput += clipText;
                this._chatInputText.setText('> ' + this._chatInput + '|');
            }).catch(err => {
                console.error('Failed to read clipboard: ', err);
            });
            return;
        }
        if (ev.key === 'Backspace') {
            this._chatInput = this._chatInput.slice(0, -1);
        } else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey) {
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
        if (text.startsWith('/')) {
            this._runCommand(text.slice(1));
        } else {
            this._addChatMessage('» ' + text, '#ffffff');
            if (this.isOnline && this.ws && this.ws.readyState === 1) {
                this.ws.send(JSON.stringify({ type: 'chat', text: '» ' + text, color: '#ffffff' }));
            }
        }
    }

    _runCommand(cmd) {
        const parts = cmd.trim().split(/\s+/);
        const name  = parts[0].toLowerCase();
        const args  = parts.slice(1);
        switch (name) {
            case 'extrapolation': {
                if (this.isOnline) {
                    if (this.ws && this.ws.readyState === 1) {
                        this.ws.send(JSON.stringify({ type: 'command', text: '/' + name + (args.length > 0 ? ' ' + args.join(' ') : '') }));
                    }
                } else {
                    const ms = parseInt(args[0]);
                    if (!isNaN(ms) && ms >= 0) {
                        window.HAXTOS_EXTRAPOLATION = Math.min(250, ms);
                        this._addChatMessage(`Extrapolation: ${window.HAXTOS_EXTRAPOLATION}ms`, '#aaffaa');
                    } else this._addChatMessage('Uso: /extrapolation <0–250>', '#ffaaaa');
                }
                break;
            }
            case 'avatar': {
                const av = args.join(' ').slice(0, 3);
                let localKey = 'blue';
                if (this.isOnline) {
                    const myPlayerObj = this.roomPlayers.find(p => p.index === this.playerIndex);
                    localKey = myPlayerObj ? myPlayerObj.team : 'blue';
                    if (localKey === 'spec') localKey = 'blue';
                }
                if (!this._customAvatars) this._customAvatars = {};
                if (av) {
                    this._customAvatars[localKey] = av;
                    this._addChatMessage(`Avatar: "${av}"`, '#aaffaa');
                } else {
                    delete this._customAvatars[localKey];
                    this._addChatMessage(`Avatar reset`, '#aaffaa');
                }
                this._updatePlayerAvatarsFromNames();
                if (this.isOnline && this.ws && this.ws.readyState === 1) {
                    this.ws.send(JSON.stringify({ type: 'avatar', playerKey: localKey, avatar: av || '' }));
                }
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
            case 'help': {
                this._addChatMessage('Comandos disponibles:', '#ffffaa');
                this._addChatMessage('/help - Muestra esta ayuda', '#ffffaa');
                this._addChatMessage('/extrapolation <ms> - Configura la extrapolación (0-200)', '#ffffaa');
                this._addChatMessage('/avatar <texto> - Cambia tu avatar (máx 3 caracteres)', '#ffffaa');
                this._addChatMessage('/zoom <0.5-4> - Ajusta el zoom de cámara', '#ffffaa');
                this._addChatMessage('/fps - Muestra los FPS actuales', '#ffffaa');
                this._addChatMessage('/clear - Limpia el chat', '#ffffaa');
                this._addChatMessage('/colors <red|blue> <ángulo> <colorTexto> <color1> [color2] [color3] - Personaliza uniforme', '#ffffaa');
                if (this.isOnline && this.isAdmin) {
                    this._addChatMessage('/kick <id|nombre> - Expulsa a un jugador', '#ff8888');
                    this._addChatMessage('/ban <id|nombre> - Banea a un jugador', '#ff8888');
                    this._addChatMessage('/admin <id|nombre> - Promueve a administrador', '#ff8888');
                }
                if (this.isOnline) {
                    this._addChatMessage('/w <id|nombre> <msg> - Envía un susurro privado', '#ff88ff');
                }
                break;
            }
            case 'clear': {
                this._chatMessages = [];
                this._chatLogTexts.forEach(t => t.setText(''));
                this._addChatMessage('Chat limpiado', '#aaffaa');
                break;
            }
            case 'fps':
                this._addChatMessage(`FPS: ${Math.round(this.game.loop.actualFps)}`, '#aaffff');
                break;
            case 'colors': {
                const action = (args[0] || '').toLowerCase();
                if (action === 'reset') {
                    this._resetTeamColors();
                    this._addChatMessage('Colores y uniformes restaurados', '#aaffaa');
                    if (this.isOnline && this.ws && this.ws.readyState === 1) {
                        this.ws.send(JSON.stringify({ type: 'colors', action: 'reset' }));
                    }
                } else if (action === 'blue' || action === 'red') {
                    // /colors <team> <angle> <textColor> <color1> [color2] [color3]
                    if (args.length < 4) {
                        this._addChatMessage('Uso: /colors <red|blue> <ángulo> <colorTexto> <color1> [color2] [color3] (o /colors reset)', '#ffaaaa');
                        break;
                    }
                    const angle = parseInt(args[1]);
                    const textColor = args[2];
                    const colors = args.slice(3);

                    // Validate angle
                    if (isNaN(angle)) {
                        this._addChatMessage('Ángulo inválido. Debe ser un número.', '#ffaaaa');
                        break;
                    }

                    // Validate hex colors
                    const hexRegex = /^#?([0-9a-fA-F]{6})$/;
                    if (!hexRegex.test(textColor)) {
                        this._addChatMessage(`Color de texto inválido: ${textColor}`, '#ffaaaa');
                        break;
                    }

                    let valid = true;
                    for (const c of colors) {
                        if (!hexRegex.test(c)) {
                            this._addChatMessage(`Color de franja inválido: ${c}`, '#ffaaaa');
                            valid = false;
                            break;
                        }
                    }
                    if (!valid) break;

                    // Update textures and labels locally
                    this._updateTeamColors(action, angle, textColor, colors);
                    this._addChatMessage(`Uniforme ${action} personalizado aplicado!`, '#aaffaa');

                    // Synchronize over network if online
                    if (this.isOnline && this.ws && this.ws.readyState === 1) {
                        this.ws.send(JSON.stringify({
                            type: 'colors',
                            action: 'set',
                            team: action,
                            angle: angle,
                            textColor: textColor,
                            colors: colors
                        }));
                    }
                } else {
                    this._addChatMessage('Uso: /colors <red|blue> <ángulo> <colorTexto> <color1> [color2] [color3] (o /colors reset)', '#ffaaaa');
                }
                break;
            }
            case 'kick':
            case 'ban':
            case 'admin':
            case 'w': {
                if (this.isOnline) {
                    if (this.ws && this.ws.readyState === 1) {
                        this.ws.send(JSON.stringify({ type: 'command', text: '/' + name + (args.length > 0 ? ' ' + args.join(' ') : '') }));
                    }
                } else {
                    this._addChatMessage('Este comando solo funciona en salas online', '#ffaaaa');
                }
                break;
            }
            case 'help':
                this._addChatMessage('Comandos locales: /colors /avatar /zoom /extrapolation /fps /handicap', '#ffff88');
                this._addChatMessage('Comandos online: /kick <id|nombre> /ban <id|nombre> /admin <id|nombre> /w <id|nombre> <msg>', '#ffff88');
                break;
            default:
                this._addChatMessage(`Desconocido: /${name} — prueba /help`, '#ffaaaa');
        }
    }

    _redrawPlayerTexture(key) {
        const u = this._playerUniforms[key];
        if (!u) return;
        const r = P_RADIUS;

        // Update normal texture canvas
        const normKey = `player_${key}`;
        const normTexture = this.textures.get(normKey);
        if (normTexture && normTexture.canvas) {
            window.TextureGenerator.drawPlayerOnCanvas(normTexture.canvas, r, u.angle, u.colors, 2, 0x000000, u.avatar, u.textColor);
            normTexture.refresh();
        }

        // Update kick texture canvas
        const kickKey = `kick_${key}`;
        const kickTexture = this.textures.get(kickKey);
        if (kickTexture && kickTexture.canvas) {
            window.TextureGenerator.drawPlayerOnCanvas(kickTexture.canvas, r, u.angle, u.colors, 4, 0xFFFFFF, u.avatar, u.textColor);
            kickTexture.refresh();
        }
    }

    _updateTeamColors(team, angle, textColor, colors) {
        const keys = team === 'blue' ? ['blue', 'blue2'] : ['red', 'red2'];
        keys.forEach(k => {
            if (this._playerUniforms[k]) {
                this._playerUniforms[k].angle = angle;
                this._playerUniforms[k].textColor = textColor;
                this._playerUniforms[k].colors = colors;
                this._redrawPlayerTexture(k);
            }
        });
    }

    _updatePlayerAvatarsFromNames() {
        if (!this._playerUniforms) return;
        const slotToPlayer = {};
        if (this.isOnline) {
            const players = this.roomPlayers || [];
            players.forEach(p => {
                if (p.team !== 'spec') {
                    slotToPlayer[p.team] = p;
                }
            });
        } else {
            const myNick = localStorage.getItem('haxNickname') || 'Player';
            slotToPlayer.red = { name: myNick };
            slotToPlayer.blue = { name: 'Guest' };
            if (this.is2v2) {
                slotToPlayer.red2 = { name: 'Player 3' };
                slotToPlayer.blue2 = { name: 'Player 4' };
            }
        }

        if (!this._customAvatars) this._customAvatars = {};

        ['red', 'red2', 'blue', 'blue2'].forEach(slot => {
            const u = this._playerUniforms[slot];
            if (!u) return;
            const p = slotToPlayer[slot];
            if (p) {
                const defaultAvatar = p.name ? p.name.charAt(0).toUpperCase() : '';
                const newAvatar = this._customAvatars[slot] !== undefined ? this._customAvatars[slot] : defaultAvatar;
                if (u.avatar !== newAvatar) {
                    u.avatar = newAvatar;
                    this._redrawPlayerTexture(slot);
                }
            } else {
                if (u.avatar !== '') {
                    u.avatar = '';
                    this._redrawPlayerTexture(slot);
                }
            }
        });
    }

    _resetTeamColors() {
        this._playerUniforms = {
            blue:  { angle: 0, textColor: '#ffffff', colors: [0x0000F8], avatar: '' },
            blue2: { angle: 0, textColor: '#ffffff', colors: [0x0000C0], avatar: '' },
            red:   { angle: 0, textColor: '#ffffff', colors: [0xF00000], avatar: '' },
            red2:  { angle: 0, textColor: '#ffffff', colors: [0xC00000], avatar: '' }
        };
        Object.keys(this._playerUniforms).forEach(k => this._redrawPlayerTexture(k));
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

    // ── ESC Panel (room view, like Haxball) — DOM overlay ─────────
    _buildEscPanel() {
        this._escVisible = false;
        this._escPanel = null;
        try { this._buildEscPanelInner(); }
        catch(e) { console.error('[ESC Panel]', e); }
    }

    _buildEscPanelInner() {
        const old = document.getElementById('_haxEscPanel');
        if (old) old.remove();

        const div = document.createElement('div');
        div.id = '_haxEscPanel';
        div.style.cssText = `
            position:fixed;top:0;left:0;right:0;bottom:0;
            background:rgba(10,10,20,0.85);
            display:none;align-items:center;justify-content:center;
            z-index:9999;font-family:Arial,Helvetica,sans-serif;
        `;
        div.innerHTML = `
        <div style="background:#1a202c; border:1px solid #2d3748; border-radius:4px; width:800px; max-width:95vw; user-select:none; display:flex; flex-direction:column; box-shadow:0 10px 25px rgba(0,0,0,0.5); font-family:Arial, sans-serif;">
          <!-- Header Bar -->
          <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#2d3748; border-top-left-radius:3px; border-top-right-radius:3px;">
            <span style="color:#f7fafc; font-size:14px; font-weight:bold; font-family:Verdana, Geneva, sans-serif;">${this.roomCode ? this.roomCode + "'s room" : "Local Match"}</span>
            <div style="display:flex; gap:6px;">
              <button style="background:#718096; border:none; color:#fff; padding:4px 12px; font-size:12px; cursor:pointer; border-radius:3px; font-weight:bold;">● Rec</button>
              <button style="background:#2b6cb0; border:none; color:#fff; padding:4px 12px; font-size:12px; cursor:pointer; border-radius:3px; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="navigator.clipboard.writeText(window.location.href); alert('Room link copied!')">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .786 3.486L6.802 11.6a2 2 0 1 1-2.829-2.83l1.393-1.393a.5.5 0 0 0-.708-.708zm3.71-3.226a.5.5 0 0 0-.708.708l1.393 1.393a2 2 0 0 1-.786 3.486L6.802 7.1a2 2 0 0 1 2.829 2.83l1.393-1.393a3 3 0 1 0-4.243-4.242L4.914 6.126a1.002 1.002 0 0 0 .154-.199 2 2 0 0 1 .786-3.486L7.198 1.1a2 2 0 0 1 2.829 2.83l-1.393 1.393a.5.5 0 0 0 .708.708z"/></svg>Link
              </button>
              <button id="_escLeave" style="background:#2b6cb0; border:none; color:#fff; padding:4px 12px; font-size:12px; cursor:pointer; border-radius:3px; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:4px;">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/><path fill-rule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z"/></svg>Leave
              </button>
            </div>
          </div>
          <div style="height:2px; background:#cc2222;"></div>

          <!-- Main Layout: Sidebar & Player Columns -->
          <div style="display:flex; padding:15px 12px; gap:12px; background:#1a202c;">
            <!-- Left Sidebar buttons -->
            <div style="width:75px; display:flex; flex-direction:column; gap:6px;">
              <button id="_escAuto" style="background:#1f3a52; border:1px solid #2b4e6f; color:#fff; padding:5px 0; font-size:12px; cursor:pointer; border-radius:4px; font-weight:bold;">Auto</button>
              <button id="_escRand" style="background:#1f3a52; border:1px solid #2b4e6f; color:#fff; padding:5px 0; font-size:12px; cursor:pointer; border-radius:4px; font-weight:bold;">Rand</button>
              <button id="_escLock" style="background:#1f3a52; border:1px solid #2b4e6f; color:#fff; padding:5px 0; font-size:12px; cursor:pointer; border-radius:4px; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:4px; width:100%;">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M11 4.5A3.5 3.5 0 0 0 7.5 1 3.5 3.5 0 0 0 4 4.5V6H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5V4.5a2.5 2.5 0 0 1 5 0V6a.5.5 0 0 0 1 0V4.5z"/></svg>Unlock
              </button>
              <button id="_escReset" style="background:#1f3a52; border:1px solid #2b4e6f; color:#fff; padding:5px 0; cursor:pointer; font-size:12px; border-radius:4px; font-weight:bold;">Reset</button>
            </div>

            <!-- Player Columns Container -->
            <div style="flex:1; display:flex; gap:10px;">
              <!-- Red Column -->
              <div style="flex:1; display:flex; flex-direction:column;">
                <div style="display:flex; gap:4px; margin-bottom:6px;">
                  <button id="_joinRedTitleBtn" style="flex:1; background:#e53e3e; border:none; color:#fff; font-size:12px; font-weight:bold; padding:5px; border-radius:4px; cursor:pointer;">Red</button>
                  <button id="_joinRedBtn" style="background:#e53e3e; border:none; color:#fff; font-size:12px; font-weight:bold; padding:5px 10px; border-radius:4px; cursor:pointer;">▶</button>
                </div>
                <div id="_escRedPlayers" style="height:200px; background:#14161d; border:1px solid #282c37; border-radius:4px; overflow-y:auto; padding:4px;"></div>
              </div>

              <!-- Spectators Column -->
              <div style="flex:1; display:flex; flex-direction:column;">
                <div style="margin-bottom:6px;">
                  <button id="_joinSpecBtn" style="width:100%; background:#4a5568; border:none; color:#fff; font-size:12px; font-weight:bold; padding:5px; border-radius:4px; cursor:pointer;">Spectators</button>
                </div>
                <div id="_escSpecPlayers" style="height:200px; background:#14161d; border:1px solid #282c37; border-radius:4px; overflow-y:auto; padding:4px;"></div>
              </div>

              <!-- Blue Column -->
              <div style="flex:1; display:flex; flex-direction:column;">
                <div style="display:flex; gap:4px; margin-bottom:6px;">
                  <button id="_joinBlueBtn" style="background:#3182ce; border:none; color:#fff; font-size:12px; font-weight:bold; padding:5px 10px; border-radius:4px; cursor:pointer;">◀</button>
                  <button id="_joinBlueTitleBtn" style="flex:1; background:#3182ce; border:none; color:#fff; font-size:12px; font-weight:bold; padding:5px; border-radius:4px; cursor:pointer;">Blue</button>
                </div>
                <div id="_escBluePlayers" style="height:200px; background:#14161d; border:1px solid #282c37; border-radius:4px; overflow-y:auto; padding:4px;"></div>
              </div>
            </div>
          </div>

          <!-- Settings & Start Button Area (Centered) -->
          <div style="display:flex; flex-direction:column; align-items:center; padding:15px; border-top:1px solid #2d3748; background:#1a202c; gap:12px;">
            <!-- Settings layout -->
            <div style="display:flex; flex-direction:column; gap:8px; width:280px; font-family:Verdana, Geneva, sans-serif; font-size:13px; color:#cbd5e0;">
              <!-- Mode selection (Only if local, otherwise we can hide or display it) -->
              <div style="display:${this.isOnline ? 'none' : 'flex'}; align-items:center; justify-content:space-between;">
                <span>Mode:</span>
                <select id="_escModeSel" style="background:#14161d; border:1px solid #282c37; color:#fff; padding:3px 8px; border-radius:4px; width:120px; font-size:12px; cursor:pointer; font-weight:bold;"></select>
              </div>

              <!-- Time Limit -->
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <span>Time limit:</span>
                <select id="_escTimeSel" style="background:#14161d; border:1px solid #282c37; color:#fff; padding:3px 8px; border-radius:4px; width:120px; font-size:12px; cursor:pointer; font-weight:bold;"></select>
              </div>

              <!-- Score Limit -->
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <span>Score limit:</span>
                <select id="_escGoalSel" style="background:#14161d; border:1px solid #282c37; color:#fff; padding:3px 8px; border-radius:4px; width:120px; font-size:12px; cursor:pointer; font-weight:bold;"></select>
              </div>

              <!-- Stadium Selector -->
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <span>Stadium:</span>
                <div style="display:flex; align-items:center; gap:6px;">
                  <span id="_escStadVal" style="font-weight:bold; color:#fff;">Classic</span>
                  <button id="_escLoadMap" style="background:#1f3a52; border:1px solid #2b4e6f; color:#fff; padding:3px 10px; font-size:11px; cursor:pointer; border-radius:4px; font-weight:bold;">Pick</button>
                  <input type="file" id="_escMapFile" accept=".hbs" style="display:none;">
                </div>
              </div>
            </div>

            <!-- Start Game Controls -->
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px; width:100%;">
              <button id="_escStart" style="background:#48bb78; border:none; color:#fff; padding:8px 30px; font-size:14px; font-weight:bold; cursor:pointer; border-radius:4px; min-width:180px;">▶ Start game</button>
              <button id="_escStop" style="background:#f56565; border:none; color:#fff; padding:8px 30px; font-size:14px; font-weight:bold; cursor:pointer; border-radius:4px; min-width:180px; display:none;">■ Stop game</button>
              <button id="_escResume" style="background:#4a5568; border:none; color:#fff; padding:8px 30px; font-size:13px; font-weight:bold; cursor:pointer; border-radius:4px; min-width:180px; display:none;">Pause / Resume</button>
              <span id="_escWaitMsg" style="color:#718096; font-size:12px; display:none; padding:8px; background:#14161d; border-radius:4px; width:280px; text-align:center;">Waiting for Host to start the match...</span>
            </div>
          </div>
        </div>

        <!-- Stadium Selector Dialog Modal (Haxball Pick Popup) -->
        <div id="_haxStadiumDialog" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); align-items:center; justify-content:center; z-index:10005; font-family:Arial, sans-serif;">
          <div style="background:#1a202c; border:1px solid #2d3748; border-radius:4px; width:300px; padding:15px; box-shadow:0 10px 25px rgba(0,0,0,0.6);">
            <div style="color:#fff; font-size:14px; font-weight:bold; margin-bottom:12px; border-bottom:1px solid #2d3748; padding-bottom:6px;">Select Stadium</div>
            <div style="display:flex; flex-direction:column; gap:6px; max-height:200px; overflow-y:auto; margin-bottom:12px;" id="_stadiumListWrap"></div>
            <div style="display:flex; justify-content:space-between; gap:10px;">
              <button id="_stadiumLoadLocal" style="flex:1; background:#2b6cb0; border:none; color:#fff; padding:6px; font-size:12px; font-weight:bold; cursor:pointer; border-radius:3px;">Load .hbs</button>
              <button id="_stadiumCancel" style="background:#4a5568; border:none; color:#fff; padding:6px 12px; font-size:12px; cursor:pointer; border-radius:3px;">Cancel</button>
            </div>
          </div>
        </div>`;

        document.body.appendChild(div);
        this._escPanel = div;

        this._buildSettingsPills();

        div.addEventListener('click', (e) => {
            if (e.target === div && this.gameStarted) this._hideEscPanel();
        });

        document.getElementById('_escLeave').onclick = () => {
            this._hideEscPanel();
            if (this.isOnline && this.ws) this.ws.close();
            this.scene.start('MenuScene');
        };

        document.getElementById('_escReset').onclick = () => {
            if (this.isOnline && !this.isAdmin) return;
            this._hideEscPanel();
            this._reset();
            this.paused = false;
            this.goalLock = false;
        };

        document.getElementById('_escStop').onclick = () => {
            if (this.isOnline) {
                if (this.isAdmin) this.ws.send(JSON.stringify({ type: 'stop_game' }));
            } else {
                this.gameStarted = false;
                this._despawnPlayers();
                this._showEscPanel();
            }
        };

        document.getElementById('_escStart').onclick = () => {
            if (this.isOnline) {
                if (this.isAdmin) {
                    this.ws.send(JSON.stringify({ 
                        type: 'start_game', 
                        scoreWin: this.scoreWin, 
                        timeLimit: this.timeLimit 
                    }));
                }
            } else {
                this._recalcF();
                this.gameStarted = true;
                this.paused = false;
                this._hideEscPanel();
                this._spawnPlayers();
                this._reset();
            }
        };

        document.getElementById('_escResume').onclick = () => {
            if (this.isOnline) {
                if (this.isAdmin) this.ws.send(JSON.stringify({ type: 'resume_game' }));
                else this._hideEscPanel();
            } else {
                this._hideEscPanel();
            }
        };

        const requestMove = (team) => {
            if (this.isOnline && this.ws && this.ws.readyState === 1) {
                this.ws.send(JSON.stringify({ type: 'move_team', team }));
            } else if (!this.isOnline) {
                if (this.roomPlayers && this.roomPlayers[0]) {
                    this.roomPlayers[0].team = team;
                    this._updateLobbyPlayers();
                }
            }
        };

        document.getElementById('_joinRedBtn').onclick = () => requestMove('red');
        document.getElementById('_joinRedTitleBtn').onclick = () => requestMove('red');
        document.getElementById('_joinSpecBtn').onclick = () => requestMove('spec');
        document.getElementById('_joinBlueBtn').onclick = () => requestMove('blue');
        document.getElementById('_joinBlueTitleBtn').onclick = () => requestMove('blue');

        const autoBtn = document.getElementById('_escAuto');
        if (autoBtn) {
            autoBtn.onclick = () => {
                if (this.isOnline && !this.isAdmin) return;
                if (this.isOnline && this.ws && this.ws.readyState === 1) {
                    this.ws.send(JSON.stringify({ type: 'auto_teams' }));
                } else if (!this.isOnline) {
                    const active = this.roomPlayers.filter(p => p.team === 'red' || p.team === 'blue');
                    active.forEach((p, idx) => { p.team = idx % 2 === 0 ? 'red' : 'blue'; });
                    this._updateLobbyPlayers();
                }
            };
        }

        const randBtn = document.getElementById('_escRand');
        if (randBtn) {
            randBtn.onclick = () => {
                if (this.isOnline && !this.isAdmin) return;
                if (this.isOnline && this.ws && this.ws.readyState === 1) {
                    this.ws.send(JSON.stringify({ type: 'rand_teams' }));
                } else if (!this.isOnline) {
                    const active = this.roomPlayers.filter(p => p.team === 'red' || p.team === 'blue');
                    for (let i = active.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [active[i].team, active[j].team] = [active[j].team, active[i].team];
                    }
                    this._updateLobbyPlayers();
                }
            };
        }

        const lockBtn = document.getElementById('_escLock');
        if (lockBtn) {
            lockBtn.onclick = () => {
                if (this.isOnline && !this.isAdmin) return;
                if (this.isOnline && this.ws && this.ws.readyState === 1) {
                    this.ws.send(JSON.stringify({ type: 'lock_teams', locked: !this.teamsLocked }));
                } else if (!this.isOnline) {
                    this.teamsLocked = !this.teamsLocked;
                    this._updateLobbyPlayers();
                }
            };
        }
    }

    _buildSettingsPills() {
        const canEdit = !this.isOnline || this.isAdmin;

        // Mode select dropdown
        const modeSel = document.getElementById('_escModeSel');
        if (modeSel) {
            modeSel.innerHTML = `
                <option value="local1v1">1 vs 1</option>
                <option value="local2v2">2 vs 2</option>
            `;
            modeSel.value = this.mode;
            modeSel.disabled = !canEdit;
            modeSel.onchange = (e) => {
                if (this.gameStarted) return;
                this.scene.start('GameScene', {
                    mode: e.target.value, stadium: this.stadium, scoreWin: this.scoreWin,
                    timeLimit: this.timeLimit, hbs: this.hbsData || null
                });
            };
        }

        // Time Limit dropdown
        const timeSel = document.getElementById('_escTimeSel');
        if (timeSel) {
            timeSel.innerHTML = `
                <option value="0">None</option>
                <option value="60">1</option>
                <option value="120">2</option>
                <option value="180">3</option>
                <option value="300">5</option>
                <option value="600">10</option>
            `;
            timeSel.value = String(this.timeLimit);
            timeSel.disabled = !canEdit;
            timeSel.onchange = (e) => {
                const val = parseInt(e.target.value);
                this.timeLimit = val;
                this.timeLeft = val;
            };
        }

        // Score Limit dropdown
        const goalSel = document.getElementById('_escGoalSel');
        if (goalSel) {
            goalSel.innerHTML = `
                <option value="0">None</option>
                <option value="1">1</option>
                <option value="3">3</option>
                <option value="5">5</option>
                <option value="7">7</option>
                <option value="10">10</option>
            `;
            goalSel.value = String(this.scoreWin);
            goalSel.disabled = !canEdit;
            goalSel.onchange = (e) => {
                this.scoreWin = parseInt(e.target.value);
            };
        }

        // Stadium Selection popup dialog (Haxball style Pick)
        const pickBtn = document.getElementById('_escLoadMap');
        const dialog = document.getElementById('_haxStadiumDialog');
        const listWrap = document.getElementById('_stadiumListWrap');
        const cancelBtn = document.getElementById('_stadiumCancel');
        const loadLocalBtn = document.getElementById('_stadiumLoadLocal');
        const fileInput = document.getElementById('_escMapFile');

        if (pickBtn && dialog && listWrap) {
            pickBtn.onclick = () => {
                if (!canEdit) return;
                dialog.style.display = 'flex';
                listWrap.innerHTML = '';

                // Add active custom map if any
                if (this.hbsData) {
                    const btn = document.createElement('button');
                    btn.textContent = `⭐ ${this.hbsData._fileName || 'Custom Map'}`;
                    btn.style.cssText = 'background:#1a5228; border:1px solid #44cc66; color:#aaffbb; padding:6px; cursor:pointer; border-radius:3px; font-size:12px; font-weight:bold; text-align:left;';
                    btn.onclick = () => { dialog.style.display = 'none'; };
                    listWrap.appendChild(btn);
                }

                // Add built-in maps
                Object.keys(STADIUMS).forEach(k => {
                    const isActive = !this.hbsData && this.stadium === k;
                    const btn = document.createElement('button');
                    btn.textContent = STADIUMS[k].name;
                    btn.style.cssText = `background:${isActive ? '#1a5228' : '#2d3748'}; border:1px solid ${isActive ? '#44cc66' : '#4a5568'}; color:${isActive ? '#aaffbb' : '#fff'}; padding:6px; cursor:pointer; border-radius:3px; font-size:12px; text-align:left;`;
                    btn.onclick = () => {
                        dialog.style.display = 'none';
                        this.hbsData = null;
                        this._hbsField = null;
                        this._hbsGoals = null;
                        this.stadium = k;
                        this.stadiumCfg = STADIUMS[k];
                        
                        this._recalcF();
                        this._createGoalPosts();
                        this._buildWalls();
                        this._drawField();
                        this._reset();

                        const stadVal = document.getElementById('_escStadVal');
                        if (stadVal) stadVal.textContent = STADIUMS[k].name;

                        if (this.isOnline && this.isHost && this.ws && this.ws.readyState === 1) {
                            this.ws.send(JSON.stringify({ type: 'change_map', mapName: k }));
                        }
                    };
                    listWrap.appendChild(btn);
                });
            };
        }

        if (cancelBtn && dialog) {
            cancelBtn.onclick = () => { dialog.style.display = 'none'; };
        }

        if (loadLocalBtn && fileInput) {
            loadLocalBtn.onclick = () => { fileInput.click(); };
        }

        if (fileInput) {
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const hbs = JSON.parse(ev.target.result);
                        hbs._fileName = file.name.replace(/\.hbs$/i, '');
                        if (dialog) dialog.style.display = 'none';

                        if (this.isOnline && this.isAdmin && this.ws && this.ws.readyState === 1) {
                            this.ws.send(JSON.stringify({ type: 'set_map', hbs }));
                        } else if (!this.isOnline) {
                            this.hbsData = hbs;
                            this.stadiumCfg = STADIUMS.classic;
                            this._applyHBSField();
                            this._applyHBSBallPhysics();
                            this._createGoalPosts();
                            this._buildWalls();
                            this._drawField();
                            this._reset();

                            const stadVal = document.getElementById('_escStadVal');
                            if (stadVal) stadVal.textContent = hbs._fileName;
                        }
                    } catch (_) {}
                };
                reader.readAsText(file);
                e.target.value = '';
            };
        }
    }

    _updateLobbyPlayers() {
        const redDiv  = document.getElementById('_escRedPlayers');
        const specDiv = document.getElementById('_escSpecPlayers');
        const blueDiv = document.getElementById('_escBluePlayers');
        if (!redDiv || !specDiv || !blueDiv) return;

        redDiv.innerHTML  = '';
        specDiv.innerHTML = '';
        blueDiv.innerHTML = '';

        // Update Lock button state and style
        const lockBtn = document.getElementById('_escLock');
        if (lockBtn) {
            const lockSvg = `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="vertical-align: middle; display: inline-block; margin-right: 4px;"><path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-1.5V4.5A3.5 3.5 0 0 0 8 1zm2.5 5H5.5V4.5a2.5 2.5 0 0 1 5 0V6z"/></svg>`;
            const unlockSvg = `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="vertical-align: middle; display: inline-block; margin-right: 4px;"><path d="M11 4.5A3.5 3.5 0 0 0 7.5 1 3.5 3.5 0 0 0 4 4.5V6H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5V4.5a2.5 2.5 0 0 1 5 0V6a.5.5 0 0 0 1 0V4.5z"/></svg>`;
            if (this.isAdmin) {
                lockBtn.style.opacity = '1';
                lockBtn.style.cursor = 'pointer';
                lockBtn.style.background = this.teamsLocked ? '#883333' : '#2a3a4a';
                lockBtn.innerHTML = this.teamsLocked ? (lockSvg + 'Lock') : (unlockSvg + 'Unlock');
            } else {
                lockBtn.style.opacity = '0.5';
                lockBtn.style.cursor = 'default';
                lockBtn.style.background = '#2a3a4a';
                lockBtn.innerHTML = this.teamsLocked ? (lockSvg + 'Locked') : (unlockSvg + 'Unlocked');
            }
        }

        // Update Auto and Rand buttons
        const autoBtn = document.getElementById('_escAuto');
        if (autoBtn) {
            autoBtn.style.opacity = this.isAdmin ? '1' : '0.5';
            autoBtn.style.cursor = this.isAdmin ? 'pointer' : 'default';
        }
        const randBtn = document.getElementById('_escRand');
        if (randBtn) {
            randBtn.style.opacity = this.isAdmin ? '1' : '0.5';
            randBtn.style.cursor = this.isAdmin ? 'pointer' : 'default';
        }

        // Show/hide join buttons depending on lock status
        const canJoin = !this.teamsLocked || this.isAdmin;
        document.getElementById('_joinRedBtn').style.display = canJoin ? 'block' : 'none';
        document.getElementById('_joinSpecBtn').style.display = canJoin ? 'block' : 'none';
        document.getElementById('_joinBlueBtn').style.display = canJoin ? 'block' : 'none';

        const players = this.roomPlayers || [];
        players.forEach(p => {
            const isMe = p.index === this.playerIndex;
            const adminBadge = p.admin ? '<span style="color:#ffaa00;font-size:12px;margin-left:4px;" title="Admin">👑</span>' : '';
            const canDrag = this.isAdmin;
            
            let adminActions = '';
            if (this.isAdmin && !isMe && this.isOnline) {
                adminActions = `
                <div style="display:flex;gap:4px;margin-left:auto;align-items:center;">
                  <button class="_lobbyAdminBtn" data-index="${p.index}" data-action="admin" title="${p.admin ? 'Quitar Admin' : 'Dar Admin'}" style="background:#2a3a4a;border:1px solid #3a4a5a;color:#ffaa00;font-size:10px;cursor:pointer;padding:1px 4px;border-radius:2px;">👑</button>
                  <button class="_lobbyAdminBtn" data-index="${p.index}" data-action="kick" title="Expulsar" style="background:#cc2222;border:none;color:#fff;font-size:10px;cursor:pointer;padding:1px 4px;border-radius:2px;">❌</button>
                  <button class="_lobbyAdminBtn" data-index="${p.index}" data-action="ban" title="Banear" style="background:#660000;border:none;color:#fff;font-size:10px;cursor:pointer;padding:1px 4px;border-radius:2px;">🚫</button>
                </div>`;
            }

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;padding:4px 8px;font-size:13px;color:#ddd;border-bottom:1px solid #181826;min-height:28px;width:100%;' + (canDrag ? 'cursor:grab;' : '');
            row.innerHTML = `<span style="font-weight:bold;">${p.name}</span>${adminBadge}${adminActions}`;
            row.dataset.pidx = p.index;
            if (canDrag) {
                row.setAttribute('draggable', 'true');
                row.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', String(p.index));
                    setTimeout(() => { row.style.opacity = '0.4'; }, 0);
                });
                row.addEventListener('dragend', () => { row.style.opacity = ''; });
            }
            if (p.team === 'red') redDiv.appendChild(row);
            else if (p.team === 'blue') blueDiv.appendChild(row);
            else specDiv.appendChild(row);
        });

        // Bind admin actions on players list
        if (this.isAdmin) {
            const adminBtns = document.querySelectorAll('._lobbyAdminBtn');
            adminBtns.forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const targetIndex = parseInt(btn.getAttribute('data-index'));
                    const action = btn.getAttribute('data-action');
                    if (!isNaN(targetIndex)) {
                        if (this.isOnline && this.ws && this.ws.readyState === 1) {
                            if (action === 'admin') {
                                this.ws.send(JSON.stringify({ type: 'toggle_admin', playerIndex: targetIndex }));
                            } else if (action === 'kick') {
                                this.ws.send(JSON.stringify({ type: 'lobby_kick', playerIndex: targetIndex }));
                            } else if (action === 'ban') {
                                this.ws.send(JSON.stringify({ type: 'lobby_ban', playerIndex: targetIndex }));
                            }
                        }
                    }
                };
            });
        }

        if (this.isAdmin) {
            const highlight = (col, on) => { col.style.outline = on ? '2px dashed #5588ff' : ''; };

            [{ col: redDiv, team: 'red' }, { col: specDiv, team: 'spec' }, { col: blueDiv, team: 'blue' }]
                .forEach(({ col, team }) => {
                    // Use direct assignment (not addEventListener) to avoid handler accumulation on repeated calls
                    col.ondragover  = (e) => { e.preventDefault(); highlight(col, true); };
                    col.ondragleave = () => highlight(col, false);
                    col.ondrop      = (e) => {
                        e.preventDefault();
                        highlight(col, false);
                        const pidx = parseInt(e.dataTransfer.getData('text/plain'));
                        if (isNaN(pidx)) return;

                        const target = this.roomPlayers.find(p => p.index === pidx);
                        if (target && target.team !== team) {
                            const prevList = this.roomPlayers.map(p => Object.assign({}, p));
                            target.team = team;
                            this._applyMidGameTeamChanges(prevList, this.roomPlayers);
                            this._updateLobbyPlayers();
                        }

                        if (this.isOnline && this.ws && this.ws.readyState === 1) {
                            this.ws.send(JSON.stringify({ type: 'move_player_team', playerIndex: pidx, team }));
                        }
                    };
                });
        }
    }

    _showEscPanel() {
        if (!this._escPanel) return;
        this._escVisible = true;
        this._wasPaused = this.paused;
        this.paused = true;

        this._updateLobbyPlayers();

        const stopBtn   = document.getElementById('_escStop');
        const startBtn  = document.getElementById('_escStart');
        const resumeBtn = document.getElementById('_escResume');
        const waitMsg   = document.getElementById('_escWaitMsg');

        stopBtn.style.display   = 'none';
        startBtn.style.display  = 'none';
        resumeBtn.style.display = 'none';
        waitMsg.style.display   = 'none';

        if (this.isOnline) {
            if (!this.gameStarted) {
                if (this.isAdmin) {
                    startBtn.style.display = 'block';
                } else {
                    waitMsg.style.display = 'block';
                }
            } else {
                if (this.isAdmin) {
                    stopBtn.style.display = 'block';
                    resumeBtn.style.display = 'block';
                } else {
                    resumeBtn.style.display = 'block';
                }
            }
        } else {
            if (!this.gameStarted) {
                startBtn.style.display = 'block';
            } else {
                stopBtn.style.display = 'block';
                resumeBtn.style.display = 'block';
            }
        }

        const stadVal = document.getElementById('_escStadVal');
        if (stadVal) {
            stadVal.textContent = this.hbsData
                ? (this.hbsData._fileName || 'Custom Map')
                : (STADIUMS[this.stadium] ? STADIUMS[this.stadium].name : 'Classic');
        }

        const modeSel = document.getElementById('_escModeSel');
        if (modeSel) modeSel.value = this.mode;

        const timeSel = document.getElementById('_escTimeSel');
        if (timeSel) timeSel.value = String(this.timeLimit);

        const goalSel = document.getElementById('_escGoalSel');
        if (goalSel) goalSel.value = String(this.scoreWin);

        this._escPanel.style.display = 'flex';
    }

    _hideEscPanel() {
        if (!this._escPanel) return;
        this._escVisible = false;
        if (!this._wasPaused) this.paused = false;
        this._escPanel.style.display = 'none';
    }

    // ── Online ─────────────────────────────────────────────────────
    _getInputKeys() {
        const r = {};
        
        // Combine WASD and Arrow keys for our movement in online mode
        const up = this.keys1.up.isDown || this.keys2.up.isDown;
        const down = this.keys1.down.isDown || this.keys2.down.isDown;
        const left = this.keys1.left.isDown || this.keys2.left.isDown;
        const right = this.keys1.right.isDown || this.keys2.right.isDown;
        const kick = this.kick1.isDown || this.kick2.isDown;

        if (this.isOnline) {
            if (this.playerIndex === 1) {
                // Guest: send our combined inputs as 'k2' so Host applies them to red player
                r.k2_up = up;
                r.k2_down = down;
                r.k2_left = left;
                r.k2_right = right;
                r.kick2 = kick;
            } else {
                // Host: send our combined inputs as 'k1'
                r.k1_up = up;
                r.k1_down = down;
                r.k1_left = left;
                r.k1_right = right;
                r.kick1 = kick;
            }
        } else {
            // Local mode: keep separate
            r.k1_up = this.keys1.up.isDown;
            r.k1_down = this.keys1.down.isDown;
            r.k1_left = this.keys1.left.isDown;
            r.k1_right = this.keys1.right.isDown;
            r.kick1 = this.kick1.isDown;

            r.k2_up = this.keys2.up.isDown;
            r.k2_down = this.keys2.down.isDown;
            r.k2_left = this.keys2.left.isDown;
            r.k2_right = this.keys2.right.isDown;
            r.kick2 = this.kick2.isDown;
        }
        r.pingTime = Date.now();
        return r;
    }

    _setupOnlineGuest() {
        if (!this.ws) return;
        this.ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'state') {
                this._onStateReceived(msg.data);
            }
            if (msg.type === 'pong') {
                const lat = Date.now() - msg.time;
                if (this.pingText) {
                    this.pingText.setText(`Ping: ${lat} ms`);
                    if (lat < 50) this.pingText.setColor('#88ff88');
                    else if (lat < 120) this.pingText.setColor('#ffff88');
                    else this.pingText.setColor('#ff8888');
                }
            }
            if (msg.type === 'chat') this._addChatMessage(msg.text, msg.color);
            if (msg.type === 'colors') {
                if (msg.action === 'reset') {
                    this._resetTeamColors();
                    this._updatePlayerAvatarsFromNames();
                }
                else this._updateTeamColors(msg.team, msg.angle, msg.textColor, msg.colors);
            }
            if (msg.type === 'avatar') {
                if (!this._customAvatars) this._customAvatars = {};
                if (msg.avatar) {
                    this._customAvatars[msg.playerKey] = msg.avatar;
                } else {
                    delete this._customAvatars[msg.playerKey];
                }
                this._updatePlayerAvatarsFromNames();
            }
            if (msg.type === 'players_list') {
                const prevList = this.roomPlayers ? this.roomPlayers.map(p => Object.assign({}, p)) : [];
                this.roomPlayers = msg.list;
                this.teamsLocked = msg.teamsLocked || false;
                const me = msg.list.find(p => p.index === this.playerIndex);
                if (me) {
                    this.isAdmin = me.admin;
                }
                this._applyMidGameTeamChanges(prevList, msg.list);
                this._updateLobbyPlayers();
                this._updatePlayerAvatarsFromNames();
                if (this.roomPlayers.length === 2 && !this.peerConnection) {
                    this._initWebRTC();
                }
            }
            if (msg.type === 'start_game') {
                this.scoreWin = msg.scoreWin !== undefined ? msg.scoreWin : this.scoreWin;
                this.timeLimit = msg.timeLimit !== undefined ? msg.timeLimit : this.timeLimit;
                this.timeLeft = this.timeLimit;
                this._updateHUD();
                this.gameStarted = true;
                this.paused = false;
                this._hideEscPanel();
                this.ball.setVisible(true);
                this._spawnPlayers();
                this._reset();
            }
            if (msg.type === 'stop_game') {
                this.gameStarted = false;
                this.paused = true;
                this._despawnPlayers();
                this._showEscPanel();
            }
            if (msg.type === 'resume_game') {
                this._hideEscPanel();
            }
            if (msg.type === 'signal') {
                if (msg.sdp) {
                    this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp)).then(() => {
                        if (msg.sdp.type === 'offer') {
                            return this.peerConnection.createAnswer().then(answer => {
                                return this.peerConnection.setLocalDescription(answer);
                            }).then(() => {
                                if (this.ws && this.ws.readyState === 1) {
                                    this.ws.send(JSON.stringify({ type: 'signal', sdp: this.peerConnection.localDescription }));
                                }
                            });
                        }
                    }).catch(err => console.error('[WebRTC] remote sdp error:', err));
                } else if (msg.candidate) {
                    this.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate))
                        .catch(err => console.error('[WebRTC] add candidate error:', err));
                }
            }
            if (msg.type === 'map_changed') {
                this.scene.start('GameScene', {
                    mode: this.mode, ws: this.ws, playerIndex: this.playerIndex,
                    roomCode: this.roomCode, hbs: msg.hbs
                });
            }
            if (msg.type === 'opponent_left') {
                this._addChatMessage('El rival se desconectó', '#ffaaaa');
                this.time.delayedCall(1500, () => { this.ws && this.ws.close(); this.scene.start('MenuScene'); });
            }
            if (msg.type === 'set_extrapolation') {
                window.HAXTOS_EXTRAPOLATION = msg.ms;
            }
        };
    }

    _setupOnlineHost() {
        this._guestInputs = {};
        if (!this.ws) return;
        this.ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'input') {
                this._guestInputs = msg.keys;
                this._lastGuestSeq = msg.seq;
                if (msg.keys && msg.keys.pingTime) {
                    if (this.ws && this.ws.readyState === 1) {
                        this.ws.send(JSON.stringify({ type: 'pong', time: msg.keys.pingTime }));
                    }
                }
            }
            if (msg.type === 'ping') {
                if (this.ws && this.ws.readyState === 1) {
                    this.ws.send(JSON.stringify({ type: 'pong', time: msg.time }));
                }
            }
            if (msg.type === 'chat') this._addChatMessage(msg.text, msg.color);
            if (msg.type === 'colors') {
                if (msg.action === 'reset') {
                    this._resetTeamColors();
                    this._updatePlayerAvatarsFromNames();
                }
                else this._updateTeamColors(msg.team, msg.angle, msg.textColor, msg.colors);
            }
            if (msg.type === 'avatar') {
                if (!this._customAvatars) this._customAvatars = {};
                if (msg.avatar) {
                    this._customAvatars[msg.playerKey] = msg.avatar;
                } else {
                    delete this._customAvatars[msg.playerKey];
                }
                this._updatePlayerAvatarsFromNames();
            }
            if (msg.type === 'players_list') {
                const prevList = this.roomPlayers ? this.roomPlayers.map(p => Object.assign({}, p)) : [];
                this.roomPlayers = msg.list;
                this.teamsLocked = msg.teamsLocked || false;
                const me = msg.list.find(p => p.index === this.playerIndex);
                if (me) {
                    this.isAdmin = me.admin;
                }
                this._applyMidGameTeamChanges(prevList, msg.list);
                this._updateLobbyPlayers();
                this._updatePlayerAvatarsFromNames();
                if (this.roomPlayers.length === 2 && !this.peerConnection) {
                    this._initWebRTC();
                }
            }
            if (msg.type === 'start_game') {
                this.scoreWin = msg.scoreWin !== undefined ? msg.scoreWin : this.scoreWin;
                this.timeLimit = msg.timeLimit !== undefined ? msg.timeLimit : this.timeLimit;
                this.timeLeft = this.timeLimit;
                this._updateHUD();
                this.gameStarted = true;
                this.paused = false;
                this._hideEscPanel();
                this.ball.setVisible(true);
                this._spawnPlayers();
                this._reset();
            }
            if (msg.type === 'stop_game') {
                this.gameStarted = false;
                this.paused = true;
                this._despawnPlayers();
                this._showEscPanel();
            }
            if (msg.type === 'resume_game') {
                this._hideEscPanel();
            }
            if (msg.type === 'signal') {
                if (msg.sdp) {
                    this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp))
                        .catch(err => console.error('[WebRTC] remote sdp error:', err));
                } else if (msg.candidate) {
                    this.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate))
                        .catch(err => console.error('[WebRTC] add candidate error:', err));
                }
            }
            if (msg.type === 'map_changed') {
                this.scene.start('GameScene', {
                    mode: this.mode, ws: this.ws, playerIndex: this.playerIndex,
                    roomCode: this.roomCode, hbs: msg.hbs
                });
            }
            if (msg.type === 'set_extrapolation') {
                window.HAXTOS_EXTRAPOLATION = msg.ms;
            }
        };
    }

    _initWebRTC() {
        console.log('[WebRTC] Initializing connection...');
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(configuration);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.ws && this.ws.readyState === 1) {
                this.ws.send(JSON.stringify({ type: 'signal', candidate: event.candidate }));
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('[WebRTC] State:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                this._addChatMessage('Conexión P2P (WebRTC) Establecida (Ultra-bajo lag)', '#aaffaa');
                this.isP2P = true;
            } else if (this.peerConnection.connectionState === 'failed' || this.peerConnection.connectionState === 'closed') {
                this._addChatMessage('P2P desconectado. Usando WebSocket de respaldo.', '#ffaaaa');
                this.isP2P = false;
            }
        };

        if (this.isHost) {
            this.dataChannel = this.peerConnection.createDataChannel('physics', { ordered: false });
            this._setupDataChannel(this.dataChannel);

            this.peerConnection.createOffer().then(offer => {
                return this.peerConnection.setLocalDescription(offer);
            }).then(() => {
                if (this.ws && this.ws.readyState === 1) {
                    this.ws.send(JSON.stringify({ type: 'signal', sdp: this.peerConnection.localDescription }));
                }
            }).catch(err => console.error('[WebRTC] Offer error:', err));
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this._setupDataChannel(this.dataChannel);
            };
        }
    }

    _setupDataChannel(channel) {
        channel.onopen = () => {
            console.log('[WebRTC] DataChannel open!');
            this.isP2P = true;
        };
        channel.onclose = () => {
            console.log('[WebRTC] DataChannel closed');
            this.isP2P = false;
        };
        channel.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'input') {
                this._guestInputs = msg.keys;
                this._lastGuestSeq = msg.seq;
            } else if (msg.type === 'state') {
                this._onStateReceived(msg.data);
            } else if (msg.type === 'ping') {
                if (this.isHost && this.dataChannel && this.dataChannel.readyState === 'open') {
                    this.dataChannel.send(JSON.stringify({ type: 'pong', time: msg.time }));
                }
            } else if (msg.type === 'pong') {
                const lat = Date.now() - msg.time;
                if (this.pingText) {
                    this.pingText.setText(`Ping: ${lat} ms`);
                    if (lat < 50) this.pingText.setColor('#88ff88');
                    else if (lat < 120) this.pingText.setColor('#ffff88');
                    else this.pingText.setColor('#ff8888');
                }
            }
        };
    }

    _applyGuestInputs() {
        if (!this._guestInputs || !Object.keys(this._guestInputs).length) return;
        const g = this._guestInputs;
        const guestPlayerObj = this.roomPlayers.find(p => p.index === 1);
        const guestTeam = guestPlayerObj ? guestPlayerObj.team : 'spec';
        if (guestTeam !== 'spec' && this.players[guestTeam]) {
            const gp = guestTeam;
            this._movePlayer(this.players[gp], { up: g.k2_up, down: g.k2_down, left: g.k2_left, right: g.k2_right }, gp);
            this.players[gp]._isKicking = g.kick2 || false;
        }
    }

    // Ring buffer of the last 60 authoritative states received (~1s at the 60Hz tick
    // rate). Reconciliation always uses the freshest entry (this.serverState); the
    // buffer itself exists for desync auditing/debugging of the netcode.
    _onStateReceived(data) {
        if (!this._stateHistory) this._stateHistory = [];
        this._stateHistory.push({ receivedAt: Date.now(), ...data });
        if (this._stateHistory.length > 60) this._stateHistory.shift();
        this.serverState = data;
        this.newServerState = true;
    }

    _sendState() {
        const state = {
            ballX: this.ball.x, ballY: this.ball.y,
            ballVX: this.ball._vx, ballVY: this.ball._vy,
            ballRot: this.ball.rotation, players: {},
            // Last input sequence number from the guest reflected in this snapshot —
            // lets the guest know which of its buffered inputs to replay after a warp.
            guestAckSeq: this._lastGuestSeq || 0
        };
        Object.keys(this.players).forEach(k => {
            const p = this.players[k];
            if (p) state.players[k] = { x: p.x, y: p.y, vx: p._vx, vy: p._vy };
        });

        if (this.isP2P && this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({ type: 'state', data: state }));
        } else {
            if (this.ws && this.ws.readyState === 1) {
                this.ws.send(JSON.stringify({ type: 'state', data: state }));
            }
        }
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
    }

    // ── Goal posts (Haxball: 4 static discs radius=8, invMass=0) ──
    _createGoalPosts() {
        if (this.hbsData && this._hbsField) {
            const fd = this._hbsField;
            if (fd.staticDiscs.length > 0) {
                this._goalPosts = fd.staticDiscs.map(d => ({
                    x: F.CX + d.pos[0], y: F.CY - d.pos[1], _vx: 0, _vy: 0,
                    radius: d.radius != null ? d.radius : POST_RADIUS,
                    bCoef: d.bCoef != null ? d.bCoef : POST_BOUNCE,
                    cGroup: d.cGroup,
                    cMask: d.cMask
                }));
            } else {
                this._goalPosts = [
                    { x: F.X,       y: F.GOAL_TOP, _vx: 0, _vy: 0, radius: POST_RADIUS, bCoef: POST_BOUNCE },
                    { x: F.X,       y: F.GOAL_BOT, _vx: 0, _vy: 0, radius: POST_RADIUS, bCoef: POST_BOUNCE },
                    { x: F.X + F.W, y: F.GOAL_TOP, _vx: 0, _vy: 0, radius: POST_RADIUS, bCoef: POST_BOUNCE },
                    { x: F.X + F.W, y: F.GOAL_BOT, _vx: 0, _vy: 0, radius: POST_RADIUS, bCoef: POST_BOUNCE },
                ];
            }
            this._cornerDiscs = [];
            return;
        }

        this._goalPosts = [
            { x: F.X,       y: F.GOAL_TOP, _vx: 0, _vy: 0, radius: POST_RADIUS, bCoef: POST_BOUNCE },
            { x: F.X,       y: F.GOAL_BOT, _vx: 0, _vy: 0, radius: POST_RADIUS, bCoef: POST_BOUNCE },
            { x: F.X + F.W, y: F.GOAL_TOP, _vx: 0, _vy: 0, radius: POST_RADIUS, bCoef: POST_BOUNCE },
            { x: F.X + F.W, y: F.GOAL_BOT, _vx: 0, _vy: 0, radius: POST_RADIUS, bCoef: POST_BOUNCE },
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

    _canCollide(aGroups, aMasks, bGroups, bMasks) {
        // null/undefined mask = unspecified = collides with everything
        // []  empty mask      = explicitly no collision
        if (aMasks == null || bMasks == null) return true;

        const toArr = (v) => Array.isArray(v) ? v : (v != null ? [v] : []);
        const mA = toArr(aMasks);
        const mB = toArr(bMasks);
        const gA = toArr(aGroups);
        const gB = toArr(bGroups);

        if (mA.length === 0 || mB.length === 0) return false;

        const matches = (groups, mask) => {
            if (mask.includes('all')) return true;
            for (const g of groups) {
                if (mask.includes(g)) return true;
            }
            return false;
        };

        return matches(gB, mA) && matches(gA, mB);
    }

    _resolveDiscPlane(disc, plane) {
        if (!plane.normal || plane.dist == null) return;
        if (!this._canCollide(disc.cGroup, disc.cMask, plane.cGroup, plane.cMask)) return;

        const wnx = plane.normal[0];
        const wny = -plane.normal[1];
        const proj = (disc.x - F.CX) * wnx + (disc.y - F.CY) * wny - plane.dist;
        const radius = disc._radius || B_RADIUS;

        if (proj >= radius) return;

        const overlap = radius - proj;
        disc.x += wnx * overlap;
        disc.y += wny * overlap;

        const vn = disc._vx * wnx + disc._vy * wny;
        if (vn < 0) {
            const bounce = (disc._bCoef || 0.5) * (plane.bCoef != null ? plane.bCoef : 1.0);
            disc._vx -= (1 + bounce) * vn * wnx;
            disc._vy -= (1 + bounce) * vn * wny;
            if (disc === this.ball) {
                const speed = Math.hypot(disc._vx, disc._vy);
                if (speed > 30) soundManager.wallHit(speed);
            }
        }
    }

    _resolveDiscSegment(disc, seg) {
        const vtx = this._hbsField.vertexes;
        if (seg.v0 >= vtx.length || seg.v1 >= vtx.length) return;
        if (!this._canCollide(disc.cGroup, disc.cMask, seg.cGroup, seg.cMask)) return;

        const v0 = vtx[seg.v0];
        const v1 = vtx[seg.v1];
        const p0 = { x: F.CX + v0.x, y: F.CY - v0.y };
        const p1 = { x: F.CX + v1.x, y: F.CY - v1.y };

        const curve = seg.curve || 0;
        const radius = disc._radius || B_RADIUS;
        const bounce = (disc._bCoef || 0.5) * (seg.bCoef != null ? seg.bCoef : 1.0);

        let closestX, closestY;

        if (Math.abs(curve) < 0.1) {
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 0.0001) {
                closestX = p0.x;
                closestY = p0.y;
            } else {
                const t = ((disc.x - p0.x) * dx + (disc.y - p0.y) * dy) / lenSq;
                const tClamped = Math.max(0, Math.min(1, t));
                closestX = p0.x + tClamped * dx;
                closestY = p0.y + tClamped * dy;
            }
        } else {
            const theta = curve * Math.PI / 180;
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const chord = Math.hypot(dx, dy);
            if (chord < 0.01) return;

            const r = chord / (2 * Math.abs(Math.sin(theta / 2)));
            const px = -dy / chord;
            const py = dx / chord;
            const halfChord = chord / 2;
            const d = Math.sqrt(Math.max(0, r * r - halfChord * halfChord));

            const sign = theta > 0 ? -1 : 1;
            const cx = (p0.x + p1.x) / 2 + sign * px * d;
            const cy = (p0.y + p1.y) / 2 + sign * py * d;

            const pdx = disc.x - cx;
            const pdy = disc.y - cy;
            const pdist = Math.hypot(pdx, pdy);
            if (pdist < 0.0001) return;

            const projX = cx + (pdx / pdist) * r;
            const projY = cy + (pdy / pdist) * r;

            const startA = Math.atan2(p0.y - cy, p0.x - cx);
            const endA   = Math.atan2(p1.y - cy, p1.x - cx);
            const projA  = Math.atan2(projY - cy, projX - cx);

            let sweep = endA - startA;
            if (theta > 0) { if (sweep > 0) sweep -= 2 * Math.PI; }
            else           { if (sweep < 0) sweep += 2 * Math.PI; }

            let diff = projA - startA;
            if (theta > 0) {
                while (diff > 0) diff -= 2 * Math.PI;
                while (diff <= -2 * Math.PI) diff += 2 * Math.PI;
                if (diff >= sweep && diff <= 0) {
                    closestX = projX;
                    closestY = projY;
                }
            } else {
                while (diff < 0) diff += 2 * Math.PI;
                while (diff >= 2 * Math.PI) diff -= 2 * Math.PI;
                if (diff <= sweep && diff >= 0) {
                    closestX = projX;
                    closestY = projY;
                }
            }

            if (closestX === undefined) {
                const d0 = Math.hypot(disc.x - p0.x, disc.y - p0.y);
                const d1 = Math.hypot(disc.x - p1.x, disc.y - p1.y);
                if (d0 < d1) {
                    closestX = p0.x;
                    closestY = p0.y;
                } else {
                    closestX = p1.x;
                    closestY = p1.y;
                }
            }
        }

        const cdx = disc.x - closestX;
        const cdy = disc.y - closestY;
        const cdist = Math.hypot(cdx, cdy);

        if (cdist >= radius || cdist < 0.0001) return;

        const normalX = cdx / cdist;
        const normalY = cdy / cdist;
        const overlap = radius - cdist;

        disc.x += normalX * overlap;
        disc.y += normalY * overlap;

        const vn = disc._vx * normalX + disc._vy * normalY;
        if (vn < 0) {
            disc._vx -= (1 + bounce) * vn * normalX;
            disc._vy -= (1 + bounce) * vn * normalY;
            if (disc === this.ball) {
                const speed = Math.hypot(disc._vx, disc._vy);
                if (speed > 30) soundManager.wallHit(speed);
            }
        }
    }

    _resolveDiscVertex(disc, vtx) {
        if (!this._canCollide(disc.cGroup, disc.cMask, vtx.cGroup, vtx.cMask)) return;

        const vx = F.CX + vtx.x;
        const vy = F.CY - vtx.y;
        const dx = disc.x - vx;
        const dy = disc.y - vy;
        const dist = Math.hypot(dx, dy);
        const radius = disc._radius || B_RADIUS;

        if (dist >= radius || dist < 0.0001) return;

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = radius - dist;

        disc.x += nx * overlap;
        disc.y += ny * overlap;

        const vn = disc._vx * nx + disc._vy * ny;
        if (vn < 0) {
            const bounce = (disc._bCoef || 0.5) * (vtx.bCoef != null ? vtx.bCoef : 1.0);
            disc._vx -= (1 + bounce) * vn * nx;
            disc._vy -= (1 + bounce) * vn * ny;
            if (disc === this.ball) {
                const speed = Math.hypot(disc._vx, disc._vy);
                if (speed > 30) soundManager.postHit(speed);
            }
        }
    }

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

        // Field outer walls (top/bottom) — ballArea bCoef = 1.0 (perfect bounce)
        if (b.y < F.Y + r) {
            b.y = F.Y + r;
            if (b._vy < 0) b._vy = -b._vy * b._bCoef * WALL_BOUNCE;
        }
        if (b.y > F.Y + F.H - r) {
            b.y = F.Y + F.H - r;
            if (b._vy > 0) b._vy = -b._vy * b._bCoef * WALL_BOUNCE;
        }

        // Side walls — split above/below the goal mouth
        this._resolveSegmentWall(b, r, F.X, F.Y, F.X, F.GOAL_TOP, WALL_BOUNCE);
        this._resolveSegmentWall(b, r, F.X, F.GOAL_BOT, F.X, F.Y + F.H, WALL_BOUNCE);
        this._resolveSegmentWall(b, r, F.X + F.W, F.Y, F.X + F.W, F.GOAL_TOP, WALL_BOUNCE);
        this._resolveSegmentWall(b, r, F.X + F.W, F.GOAL_BOT, F.X + F.W, F.Y + F.H, WALL_BOUNCE);

        // Fail-safe side boundary clamps
        const inGoalY = b.y > F.GOAL_TOP - r && b.y < F.GOAL_BOT + r;
        if (!inGoalY) {
            // Outside the goal mouth Y range: cannot cross F.X or F.X + F.W
            if (b.x < F.X + r) {
                b.x = F.X + r;
                if (b._vx < 0) b._vx = -b._vx * b._bCoef * WALL_BOUNCE;
            }
            if (b.x > F.X + F.W - r) {
                b.x = F.X + F.W - r;
                if (b._vx > 0) b._vx = -b._vx * b._bCoef * WALL_BOUNCE;
            }
        } else {
            // Inside the goal mouth Y range: clamp to net boundaries
            if (b.x < F.X) {
                this._resolveSegmentWall(b, r, F.X, F.GOAL_TOP, F.X - F.GOAL_D, F.GOAL_TOP, NET_BOUNCE);
                this._resolveSegmentWall(b, r, F.X - F.GOAL_D, F.GOAL_TOP, F.X - F.GOAL_D, F.GOAL_BOT, NET_BOUNCE);
                this._resolveSegmentWall(b, r, F.X - F.GOAL_D, F.GOAL_BOT, F.X, F.GOAL_BOT, NET_BOUNCE);

                // Hard clamp to prevent tunneling through the left goal net
                const leftLimit = F.X - F.GOAL_D + r;
                if (b.x < leftLimit) {
                    b.x = leftLimit;
                    if (b._vx < 0) b._vx = -b._vx * NET_BOUNCE;
                }
                if (b.y < F.GOAL_TOP + r) {
                    b.y = F.GOAL_TOP + r;
                    if (b._vy < 0) b._vy = -b._vy * NET_BOUNCE;
                }
                if (b.y > F.GOAL_BOT - r) {
                    b.y = F.GOAL_BOT - r;
                    if (b._vy > 0) b._vy = -b._vy * NET_BOUNCE;
                }
            }
            if (b.x > F.X + F.W) {
                this._resolveSegmentWall(b, r, F.X + F.W, F.GOAL_TOP, F.X + F.W + F.GOAL_D, F.GOAL_TOP, NET_BOUNCE);
                this._resolveSegmentWall(b, r, F.X + F.W + F.GOAL_D, F.GOAL_TOP, F.X + F.W + F.GOAL_D, F.GOAL_BOT, NET_BOUNCE);
                this._resolveSegmentWall(b, r, F.X + F.W + F.GOAL_D, F.GOAL_BOT, F.X + F.W, F.GOAL_BOT, NET_BOUNCE);

                // Hard clamp to prevent tunneling through the right goal net
                const rightLimit = F.X + F.W + F.GOAL_D - r;
                if (b.x > rightLimit) {
                    b.x = rightLimit;
                    if (b._vx > 0) b._vx = -b._vx * NET_BOUNCE;
                }
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
    }

    // Generic point-to-segment disc collision (straight-line version of _resolveDiscSegment,
    // used for the classic/standard field boundary instead of an ad hoc AABB clamp)
    _resolveSegmentWall(disc, radius, x0, y0, x1, y1, bCoef) {
        const dx = x1 - x0, dy = y1 - y0;
        const lenSq = dx * dx + dy * dy;
        let cx, cy;
        if (lenSq < 0.0001) {
            cx = x0; cy = y0;
        } else {
            const t = ((disc.x - x0) * dx + (disc.y - y0) * dy) / lenSq;
            const tc = Math.max(0, Math.min(1, t));
            cx = x0 + tc * dx;
            cy = y0 + tc * dy;
        }

        const ndx = disc.x - cx;
        const ndy = disc.y - cy;
        const dist = Math.hypot(ndx, ndy);
        if (dist >= radius || dist < 0.0001) return;

        const nx = ndx / dist, ny = ndy / dist;
        const overlap = radius - dist;
        disc.x += nx * overlap;
        disc.y += ny * overlap;

        const vn = disc._vx * nx + disc._vy * ny;
        if (vn < 0) {
            const bounce = (disc._bCoef || 0.5) * bCoef;
            disc._vx -= (1 + bounce) * vn * nx;
            disc._vy -= (1 + bounce) * vn * ny;
            if (disc === this.ball) {
                const speed = Math.hypot(disc._vx, disc._vy);
                if (speed > 30) soundManager.wallHit(speed);
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

        // Deactivate kickoff if ball is kicked
        if (this._kickoffActive && Math.hypot(ball._vx, ball._vy) > 0.5) {
            this._kickoffActive = false;
        }

        // Dynamically update player collision masks for kickoff barriers
        for (const p of players) {
            const isLeftTeam = p.x < F.CX;
            const baseMask = ['ball', 'red', 'blue', 'wall'];
            if (this._kickoffActive) {
                p.cMask = baseMask.concat(isLeftTeam ? ['redKO'] : ['blueKO']);
            } else {
                p.cMask = baseMask;
            }
        }

        // 1. Acceleration only (damping applied AFTER move, like Haxball)
        for (const p of players) {
            const accel = p._isKicking ? PK_ACCEL : P_ACCEL;
            p._vx += p._inputDx * accel;
            p._vy += p._inputDy * accel;
        }

        // 2. Kick impulse to ball (fires once per kick activation when in range)
        for (const p of players) {
            if (p._isKicking) {
                if (!p._hasKicked && !this._chatOpen) {
                    const dx = ball.x - p.x;
                    const dy = ball.y - p.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist - P_RADIUS - ball._radius < 4 && dist > 0.1) {
                        const nx = dx / dist, ny = dy / dist;
                        ball._vx += nx * KICK_POWER * ball._invMass;
                        ball._vy += ny * KICK_POWER * ball._invMass;
                        p._hasKicked = true; // Mark as kicked so it only triggers once per press
                        if (!this._kickSoundPlayed) {
                            soundManager.kick(Math.hypot(ball._vx, ball._vy));
                            this._kickSoundPlayed = true;
                        }
                    }
                }
            } else {
                p._hasKicked = false; // Reset when kick button is released
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
        ball._vx *= ball._damping;
        ball._vy *= ball._damping;
        for (const p of players) {
            const damp = p._isKicking ? PK_DAMPING : P_DAMPING;
            p._vx *= damp;
            p._vy *= damp;
        }

        // 5. Collisions (Runs in 2 iterations for perfect constraint/squeeze stability, matching Haxball)
        for (let iter = 0; iter < 2; iter++) {
            this._resolveKickoffBarrier(players);

            // Player-to-player collision
            for (let i = 0; i < players.length; i++) {
                for (let j = i + 1; j < players.length; j++) {
                    this._resolveDiscDisc(players[i], players[j], P_RADIUS, P_RADIUS, P_INV_M, P_INV_M, P_BOUNCE, P_BOUNCE);
                }
            }

            // Player-to-ball collision (runs before static walls; uses P_INV_M so players are stopped by the ball)
            for (const p of players) {
                const isBlue = p._normalTexture.includes('blue');
                const isKicking = this._kickoffActive && this._kickoffTeam === (isBlue ? 'blue' : 'red');
                if (!this._kickoffActive || isKicking) {
                    this._resolveDiscDisc(p, ball, P_RADIUS, ball._radius, P_INV_M, ball._invMass, P_BOUNCE, ball._bCoef);
                }
            }

            // Static obstacle collisions (planes, segments, vertexes)
            if (this.hbsData && this._hbsField) {
                const fd = this._hbsField;

                // 1) Planes
                for (const plane of (fd.planes || [])) {
                    this._resolveDiscPlane(ball, plane);
                    for (const p of players) {
                        this._resolveDiscPlane(p, plane);
                    }
                }

                // 2) Segments
                for (const seg of (fd.segments || [])) {
                    this._resolveDiscSegment(ball, seg);
                    for (const p of players) {
                        this._resolveDiscSegment(p, seg);
                    }
                }

                // 3) Vertexes (only if they have a collision group)
                for (const v of (fd.vertexes || [])) {
                    if (v.cGroup && v.cGroup.length > 0) {
                        this._resolveDiscVertex(ball, v);
                        for (const p of players) {
                            this._resolveDiscVertex(p, v);
                        }
                    }
                }
            } else {
                // Standard fallback boundaries
                this._resolveBallWall(ball, ball._radius);
                for (const p of players) this._resolvePlayerWall(p);
                for (const cd of this._cornerDiscs) {
                    this._resolveDiscDisc(ball, cd, ball._radius, cd.r, ball._invMass, 0, ball._bCoef, WALL_BOUNCE);
                }
            }

            // Static discs / Goal posts (runs for both HBS and standard mode)
            for (const post of this._goalPosts) {
                if (this._canCollide(ball.cGroup, ball.cMask, post.cGroup, post.cMask)) {
                    this._resolveDiscDisc(ball, post, ball._radius, post.radius || POST_RADIUS, ball._invMass, 0, ball._bCoef, post.bCoef != null ? post.bCoef : POST_BOUNCE);
                }
                for (const p of players) {
                    if (this._canCollide(p.cGroup, p.cMask, post.cGroup, post.cMask)) {
                        this._resolveDiscDisc(p, post, P_RADIUS, post.radius || POST_RADIUS, P_INV_M, 0, P_BOUNCE, post.bCoef != null ? post.bCoef : POST_BOUNCE);
                    }
                }
            }
        }
    }

    _resolvePlayerWall(p) {
        const r = P_RADIUS;
        // Clamp to outer bounds (in Haxball, players can move freely outside the field lines up to the outer walls)
        if (p.y < F.OUTER_Y_MIN + r) { p.y = F.OUTER_Y_MIN + r; if (p._vy < 0) p._vy = 0; }
        if (p.y > F.OUTER_Y_MAX - r) { p.y = F.OUTER_Y_MAX - r; if (p._vy > 0) p._vy = 0; }
        if (p.x < F.OUTER_X_MIN + r) { p.x = F.OUTER_X_MIN + r; if (p._vx < 0) p._vx = 0; }
        if (p.x > F.OUTER_X_MAX - r) { p.x = F.OUTER_X_MAX - r; if (p._vx > 0) p._vx = 0; }
    }

    _resolveKickoffBarrier(players) {
        if (!this._kickoffActive || this.hbsData) return;
        if (Math.hypot(this.ball._vx, this.ball._vy) > 0.5) {
            this._kickoffActive = false;
            return;
        }
        const cx = F.CX, cy = F.CY;
        const CR = 75; // center circle radius (matches drawn circle)
        const r = P_RADIUS;

        for (const p of players) {
            const isBlue = p._normalTexture.includes('blue');
            const isKicking = this._kickoffTeam === (isBlue ? 'blue' : 'red');
            const dx = p.x - cx, dy = p.y - cy;
            const dist = Math.hypot(dx, dy);

            if (isKicking) {
                // Own half + full center circle. If in opponent's half AND outside circle → push to circle edge
                // Blue is on RIGHT, so blue's opponent half is LEFT (p.x < cx). Red on LEFT → opponent half is RIGHT.
                const inOpponentHalf = isBlue ? (p.x < cx) : (p.x > cx);
                if (inOpponentHalf && dist > CR - r && dist > 0.01) {
                    const sc = (CR - r) / dist;
                    p.x = cx + dx * sc; p.y = cy + dy * sc;
                    const nx = dx / dist, ny = dy / dist;
                    const vn = p._vx * nx + p._vy * ny;
                    if (vn > 0) { p._vx -= vn * nx; p._vy -= vn * ny; }
                }
            } else {
                // Non-kicking team: stay in own half + outside center circle
                // Blue on RIGHT → kept right of center. Red on LEFT → kept left of center.
                if (isBlue  && p.x < cx + r) { p.x = cx + r; if (p._vx < 0) p._vx = 0; }
                if (!isBlue && p.x > cx - r) { p.x = cx - r; if (p._vx > 0) p._vx = 0; }
                if (dist < CR + r && dist > 0.01) {
                    const sc = (CR + r) / dist;
                    p.x = cx + dx * sc; p.y = cy + dy * sc;
                    const nx = dx / dist, ny = dy / dist;
                    const vn = p._vx * nx + p._vy * ny;
                    if (vn < 0) { p._vx -= vn * nx; p._vy -= vn * ny; }
                }
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
    shutdown() {
        const nav = document.getElementById('_haxNavBar');
        if (nav) nav.style.display = 'flex';
        const p = document.getElementById('_haxEscPanel');
        if (p) p.remove();
        if (this._escKeyHandler) {
            document.removeEventListener('keydown', this._escKeyHandler);
            this._escKeyHandler = null;
        }
        if (this.pingTimer) {
            this.pingTimer.remove();
            this.pingTimer = null;
        }
    }

    update(time, delta) {
        // Apply mouse wheel zoom
        if (window._gameZoom !== this.cameras.main.zoom) {
            this.cameras.main.setZoom(window._gameZoom);
            if (this._cameraMode === 3) this.cameras.main.centerOn(F.CX, F.CY);
        }

        if (this.paused) return;

        if (this.physicsAccumulator === undefined) {
            this.physicsAccumulator = 0;
        }
        this.physicsAccumulator += delta;
        const timestep = 1000 / 60; // 16.667 ms per frame

        if (this.physicsAccumulator > 200) {
            this.physicsAccumulator = timestep;
        }

        while (this.physicsAccumulator >= timestep) {
            this._runPhysicsTick();
            this.physicsAccumulator -= timestep;
        }

        this._updateHostGuestGhost();
    }

    // Host-side visual-only extrapolation of the guest's disc: real Haxball applies
    // extrapolation symmetrically (everyone projects everyone else ahead by their own
    // setting), which is what makes fakes/amagues readable from both sides. The host
    // is physics authority for itself, so it can't extrapolate its own disc or the
    // ball (it always has the true value with zero delay) — the guest's disc is the
    // one entity the host doesn't control directly. Collisions/goals above already
    // resolved using the real position; this only offsets a separate ghost image for
    // display, so it can never desync the actual physics/collision outcome.
    _updateHostGuestGhost() {
        if (!(this.isOnline && this.isHost)) {
            if (this._guestGhost) this._guestGhost.setVisible(false);
            // Ensure all player objects are visible
            Object.keys(this.players).forEach(key => {
                if (this.players[key]) this.players[key].setVisible(true);
            });
            return;
        }

        const guestObj = this.roomPlayers && this.roomPlayers.find(p => p.index === 1);
        const gk = guestObj ? guestObj.team : null;
        const gp = gk && this.players[gk];
        const extFrames = (window.HAXTOS_EXTRAPOLATION || 0) / 16.667;

        // Ensure player objects that are NOT the extrapolated guest are visible
        Object.keys(this.players).forEach(key => {
            if (this.players[key] && key !== gk) {
                this.players[key].setVisible(true);
            }
        });

        if (!gp || extFrames <= 0) {
            if (this._guestGhost) this._guestGhost.setVisible(false);
            if (gp) gp.setVisible(true);
            return;
        }

        if (!this._guestGhost) {
            this._guestGhost = this.add.image(gp.x, gp.y, gp.texture.key).setDepth(gp.depth);
            this._refreshUICameraIgnore();
        }
        this._guestGhost.setTexture(gp.texture.key);
        this._guestGhost.setPosition(gp.x + gp._vx * extFrames, gp.y + gp._vy * extFrames);
        this._guestGhost.setVisible(true);
        gp.setVisible(false);

        const lbl = this._playerLabels[gk];
        if (lbl) { lbl.x = this._guestGhost.x; lbl.y = this._guestGhost.y - P_RADIUS - 2; }
    }

    _runPhysicsTick() {
        if (this.isOnline) {
            // Anti-cheat heartbeat: every ~90 ticks (1.5s at 60Hz) report our local
            // extrapolation value to the server so it can force-revert a patched client
            // that bypasses the /extrapolation command (see server.js). Driven from this
            // fixed-timestep loop rather than a Phaser this.time.addEvent — the latter
            // does not fire reliably for this scene's custom accumulator-driven update.
            this._extrapReportCounter = (this._extrapReportCounter || 0) + 1;
            if (this._extrapReportCounter >= 90) {
                this._extrapReportCounter = 0;
                if (this.ws && this.ws.readyState === 1) {
                    this.ws.send(JSON.stringify({ type: 'report_extrapolation', ms: window.HAXTOS_EXTRAPOLATION || 0 }));
                }
            }

            if (this.isHost) this._updateHost();
            else             this._updateGuest();
            return;
        }

        if (!this._chatOpen) {
            if (this.players.red) {
                this.players.red._isKicking = this.kick1.isDown || this._forceKick;
                this._movePlayer(this.players.red, this.keys1, 'red');
            }
            if (this.players.blue) {
                this.players.blue._isKicking = this.kick2.isDown || this._forceKickRed;
                this._movePlayer(this.players.blue, this.keys2, 'blue');
            }
            if (this.is2v2) {
                if (this.players.red2) {
                    this.players.red2._isKicking = this.kick1.isDown || this._forceKick;
                    this._movePlayer(this.players.red2, this.keys3, 'red2');
                }
                if (this.players.blue2) {
                    this.players.blue2._isKicking = this.kick2.isDown || this._forceKickRed;
                    this._movePlayer(this.players.blue2, this.keys4, 'blue2');
                }
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
        const hostPlayerObj = this.roomPlayers.find(p => p.index === 0);
        const hostTeam = hostPlayerObj ? hostPlayerObj.team : 'spec';
        if (!this._chatOpen && hostTeam !== 'spec' && this.players[hostTeam]) {
            const pObj = this.players[hostTeam];
            const up = this.keys1.up.isDown || this.keys2.up.isDown;
            const down = this.keys1.down.isDown || this.keys2.down.isDown;
            const left = this.keys1.left.isDown || this.keys2.left.isDown;
            const right = this.keys1.right.isDown || this.keys2.right.isDown;
            const kick = this.kick1.isDown || this.kick2.isDown;

            pObj._isKicking = kick;
            this._movePlayer(pObj, { up, down, left, right }, hostTeam);
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
        const seq = (this._inputSeq = (this._inputSeq || 0) + 1);
        if (this.isP2P && this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({ type: 'input', keys, seq }));
        } else {
            if (this.ws && this.ws.readyState === 1) {
                this.ws.send(JSON.stringify({ type: 'input', keys, seq }));
            }
        }

        // Local Client-Side Prediction for our own player (zero input delay!)
        const myPlayerObj = this.roomPlayers.find(p => p.index === this.playerIndex);
        const myTeam = myPlayerObj ? myPlayerObj.team : 'spec';
        if (myTeam !== 'spec' && this.players[myTeam] && !this._chatOpen) {
            const myKey = myTeam;
            const myPlayer = this.players[myKey];
            // Combine WASD and Arrow keys for our local prediction
            const up = this.keys1.up.isDown || this.keys2.up.isDown;
            const down = this.keys1.down.isDown || this.keys2.down.isDown;
            const left = this.keys1.left.isDown || this.keys2.left.isDown;
            const right = this.keys1.right.isDown || this.keys2.right.isDown;
            const kick = this.kick1.isDown || this.kick2.isDown;

            const myKeys = { up, down, left, right };
            this._movePlayer(myPlayer, myKeys, myKey);
            myPlayer._isKicking = kick;

            // Buffer this input (by seq) so it can be replayed on top of the host's
            // authoritative echo if a reconciliation warp is needed later this tick.
            if (!this._localInputBuffer) this._localInputBuffer = [];
            this._localInputBuffer.push({ seq, dx: myPlayer._inputDx, dy: myPlayer._inputDy, kicking: myPlayer._isKicking });
            if (this._localInputBuffer.length > 300) this._localInputBuffer.shift();

            const accel = myPlayer._isKicking ? PK_ACCEL : P_ACCEL;
            myPlayer._vx += myPlayer._inputDx * accel;
            myPlayer._vy += myPlayer._inputDy * accel;
            myPlayer.x += myPlayer._vx;
            myPlayer.y += myPlayer._vy;
            
            const damp = myPlayer._isKicking ? PK_DAMPING : P_DAMPING;
            myPlayer._vx *= damp;
            myPlayer._vy *= damp;
        }

        if (this.serverState) {
            // Velocity is in pixels per frame, so we convert extrapolation ms to frames
            // 1 frame = 16.667ms at 60 FPS
            const extFrames = (window.HAXTOS_EXTRAPOLATION || 0) / 16.667;

            if (this.newServerState) {
                // A new packet arrived! We update base positions with extrapolation
                this.ball.x = this.serverState.ballX + this.serverState.ballVX * extFrames;
                this.ball.y = this.serverState.ballY + this.serverState.ballVY * extFrames;
                this.ball._vx = this.serverState.ballVX;
                this.ball._vy = this.serverState.ballVY;
                this.ball.rotation = this.serverState.ballRot || 0;

                const myPlayerObj = this.roomPlayers.find(p => p.index === this.playerIndex);
                const myTeam = myPlayerObj ? myPlayerObj.team : '';
                Object.keys(this.serverState.players || {}).forEach(k => {
                    if (this.players[k]) {
                        const pState = this.serverState.players[k];
                        const isOurselves = (k === myTeam);
                        
                        if (!isOurselves) {
                            this.players[k].x = pState.x + pState.vx * extFrames;
                            this.players[k].y = pState.y + pState.vy * extFrames;
                            this.players[k]._vx = pState.vx;
                            this.players[k]._vy = pState.vy;
                        } else {
                            // Hard-warp + input replay: the host's echo of our own player is
                            // always ~1 RTT stale, so warping straight to it would reintroduce
                            // the input lag local prediction exists to avoid. Instead we discard
                            // the inputs the host has already acked, then if there's a genuine
                            // desync (a collision our naive local prediction doesn't simulate),
                            // we hard-warp to the authoritative snapshot and replay every
                            // still-unacked buffered input on top of it to land back at an
                            // accurate present-tick position — no lerp, no stale rubberbanding.
                            const ackSeq = this.serverState.guestAckSeq || 0;
                            this._localInputBuffer = (this._localInputBuffer || []).filter(e => e.seq > ackSeq);

                            const dx = pState.x - this.players[k].x;
                            const dy = pState.y - this.players[k].y;
                            if (Math.hypot(dx, dy) > 0.05) {
                                let x = pState.x, y = pState.y, vx = pState.vx, vy = pState.vy;
                                for (const inp of this._localInputBuffer) {
                                    const accel = inp.kicking ? PK_ACCEL : P_ACCEL;
                                    const damp = inp.kicking ? PK_DAMPING : P_DAMPING;
                                    vx += inp.dx * accel;
                                    vy += inp.dy * accel;
                                    x += vx;
                                    y += vy;
                                    vx *= damp;
                                    vy *= damp;
                                }
                                this.players[k].x = x;
                                this.players[k].y = y;
                                this.players[k]._vx = vx;
                                this.players[k]._vy = vy;
                            }
                        }
                    }
                });

                this.newServerState = false; // Reset flag
            } else {
                // No new packet. We let them glide naturally based on last known velocity!
                this.ball.x += this.ball._vx;
                this.ball.y += this.ball._vy;

                const myPlayerObj = this.roomPlayers.find(p => p.index === this.playerIndex);
                const myTeam = myPlayerObj ? myPlayerObj.team : '';
                Object.keys(this.players).forEach(k => {
                    const p = this.players[k];
                    const isOurselves = (k === myTeam);
                    if (p && !isOurselves) {
                        p.x += p._vx;
                        p.y += p._vy;
                    }
                });
            }

            // Sync Phaser bodies and stop Phaser's auto-movement
            this.ball.body.reset(this.ball.x, this.ball.y);
            this.ball.body.velocity.set(0, 0);

            Object.keys(this.players).forEach(k => {
                if (this.players[k]) {
                    this.players[k].body.reset(this.players[k].x, this.players[k].y);
                    this.players[k].body.velocity.set(0, 0);
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

        const br = this.ball._radius;
        if (this._hbsGoals) {
            for (const g of this._hbsGoals) {
                const inY = by > g.goalTop + br && by < g.goalBot - br;
                if (g.isLeft  && bx < g.worldX - br && inY) { this._goal(g.team); return; }
                if (!g.isLeft && bx > g.worldX + br && inY) { this._goal(g.team); return; }
            }
            return;
        }

        const inY = by > F.GOAL_TOP + br && by < F.GOAL_BOT - br;
        if (bx < F.X - br && inY) this._goal('blue');
        else if (bx > F.X + F.W + br && inY) this._goal('red');
    }

    _goal(team) {
        this.goalLock = true;
        this.score[team]++;
        this._kickoffTeam = team === 'blue' ? 'red' : 'blue'; // scored-against team kicks off
        this._updateHUD();
        soundManager.goal();

        const isGameOver = (this.scoreWin > 0 && this.score[team] >= this.scoreWin) || this._overtime;

        this.scene.launch('GoalScene', { team });
        this.time.delayedCall(3000, () => {
            this.scene.stop('GoalScene');
            if (isGameOver) {
                this._endGame();
            } else {
                this._reset();
                this.goalLock = false;
            }
        });
    }

    _reset() {
        const place = (obj, x, y) => {
            if (!obj) return;
            obj.x = x; obj.y = y;
            obj._vx = 0; obj._vy = 0;
            if (obj.body) obj.body.reset(x, y);
        };
        place(this.ball, F.CX, F.CY);

        // Use HBS spawnDistance if available, otherwise use default 150px
        const sd = (this._hbsField && this._hbsField.spawnDist) ? this._hbsField.spawnDist : 150;

        if (this.is2v2) {
            place(this.players.red,   F.CX - sd, F.CY - 55);
            place(this.players.red2,  F.CX - sd, F.CY + 55);
            place(this.players.blue,  F.CX + sd, F.CY - 55);
            place(this.players.blue2, F.CX + sd, F.CY + 55);
        } else {
            place(this.players.red,  F.CX - sd, F.CY);
            place(this.players.blue, F.CX + sd, F.CY);
        }

        for (const p of Object.values(this.players)) {
            if (p) p._isKicking = false;
        }
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
        const txt = this.add.text(GW / 2, GH / 2 - 50, 'OVERTIME!', {
            fontSize: '36px', fontFamily: 'Verdana, Arial Black, sans-serif',
            color: '#ffff00', stroke: '#000', strokeThickness: 6, align: 'center'
        }).setOrigin(0.5).setDepth(30).setScrollFactor(0);
        // Created after _setupUICamera's snapshot, so main camera must ignore it explicitly
        // to avoid a zoomed duplicate; uiCamera shows it by default (not in its ignore list).
        this.cameras.main.ignore(txt);
        this.time.delayedCall(3500, () => { if (txt && txt.active) txt.destroy(); });
        this.hudTime.setText('∞');
        soundManager.whistle();
    }
}
