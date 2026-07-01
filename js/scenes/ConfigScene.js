const STADIUMS = {
    classic: {
        name: 'Classic',
        canvasW: 1000, canvasH: 560,
        W: 740, H: 340, GOAL_H: 128, GOAL_D: 30,
        camW: 420, camH: 200,
        bgColor: 0x718C5A, goalBgColor: 0x718C5A,
        grass1: 0x718C5A, grass2: 0x839E6A,
        lineColor: 0xC7E6BD,
        goalColor1: 0xFFCCCC, goalColor2: 0xCCCCFF,
    },
    big: {
        name: 'Big',
        canvasW: 1200, canvasH: 600,
        W: 1100, H: 480, GOAL_H: 180, GOAL_D: 30,
        camW: 600, camH: 300,
        bgColor: 0x718C5A, goalBgColor: 0x718C5A,
        grass1: 0x718C5A, grass2: 0x839E6A,
        lineColor: 0xC7E6BD,
        goalColor1: 0xFFCCCC, goalColor2: 0xCCCCFF,
    },
    hockey: {
        name: 'Hockey',
        canvasW: 1000, canvasH: 560,
        W: 740, H: 340, GOAL_H: 136, GOAL_D: 30,
        camW: 420, camH: 204,
        bgColor: 0x1a1a1a, goalBgColor: 0x222222,
        grass1: 0x555555, grass2: 0x505050,
        lineColor: 0xE9CC6E,
        goalColor1: 0xFFCCCC, goalColor2: 0xCCCCFF,
    },
    big_hockey: {
        name: 'Big Hockey',
        canvasW: 1200, canvasH: 600,
        W: 1100, H: 480, GOAL_H: 180, GOAL_D: 60,
        camW: 600, camH: 300,
        bgColor: 0x1a1a1a, goalBgColor: 0x222222,
        grass1: 0x555555, grass2: 0x505050,
        lineColor: 0xE9CC6E,
        goalColor1: 0xFFCCCC, goalColor2: 0xCCCCFF,
    },
    rounded: {
        name: 'Rounded',
        canvasW: 1000, canvasH: 560,
        W: 740, H: 340, GOAL_H: 128, GOAL_D: 30,
        camW: 420, camH: 200,
        bgColor: 0x718C5A, goalBgColor: 0x718C5A,
        grass1: 0x718C5A, grass2: 0x839E6A,
        lineColor: 0xC7E6BD,
        goalColor1: 0xFFCCCC, goalColor2: 0xCCCCFF,
        cornerRadius: 50,
    },
};

class ConfigScene extends Phaser.Scene {
    constructor() { super('ConfigScene'); }

    init(data) {
        this.mode = (data && data.mode) || 'local1v1';
        this.hbsMode = !!(data && data.hbs) && !!(window._hbsData);
        this.selectedStadium = this.hbsMode ? 'hbs' : ((data && data.stadium) || 'classic');
        this.selectedGoals = (data && data.goals !== undefined) ? data.goals : 7;
        this.selectedTime  = (data && data.time  !== undefined) ? data.time  : 3 * 60;
        this.goalOptions = [
            { label: '3',     value: 3 },
            { label: '5',     value: 5 },
            { label: '7',     value: 7 },
            { label: '∞',    value: 0 },
        ];
        this.timeOptions = [
            { label: '2 min', value: 2 * 60 },
            { label: '3 min', value: 3 * 60 },
            { label: '5 min', value: 5 * 60 },
            { label: '∞',    value: 0 },
        ];
    }

    create() {
        const W = window.innerWidth;
        const H = window.innerHeight;

        this._drawBackground(W, H);
        this._drawLayout(W, H);
    }

    // ── Background (same dark style as MenuScene) ──────────────────────────
    _drawBackground(W, H) {
        const bg = this.add.graphics();
        bg.fillStyle(0x07071a, 1);
        bg.fillRect(0, 0, W, H);

        const g = this.add.graphics();
        g.lineStyle(1, 0x3355aa, 0.09);
        const fw = Math.min(W * 0.72, 680), fh = Math.min(H * 0.5, 280);
        const fx = (W - fw) / 2, fy = (H - fh) / 2;
        g.strokeRect(fx, fy, fw, fh);
        g.strokeCircle(W / 2, H / 2, fh * 0.28);
        g.moveTo(W / 2, fy); g.lineTo(W / 2, fy + fh); g.strokePath();

        const lb = this.add.graphics();
        lb.fillStyle(0x1133cc, 1); lb.fillRect(0, 0, 4, H); lb.setAlpha(0.7);
        const rb = this.add.graphics();
        rb.fillStyle(0xcc1111, 1); rb.fillRect(W - 4, 0, 4, H); rb.setAlpha(0.7);
    }

    // ── Main layout ────────────────────────────────────────────────────────
    _drawLayout(W, H) {
        // ── Header ──
        // Back arrow
        const back = this.add.text(22, 18, '‹ Volver', {
            fontSize: '15px', fontFamily: 'Arial, sans-serif', color: '#5566aa'
        }).setInteractive({ useHandCursor: true });
        back.on('pointerover', () => back.setColor('#99aaff'));
        back.on('pointerout',  () => back.setColor('#5566aa'));
        back.on('pointerdown', () => this.scene.start('MenuScene'));

        // Title
        this.add.text(W / 2, 22, 'CONFIGURAR PARTIDA', {
            fontSize: '22px', fontFamily: 'Arial Black, sans-serif',
            color: '#ddeeff', stroke: '#0a0a30', strokeThickness: 5
        }).setOrigin(0.5, 0);

        // Divider
        const divG = this.add.graphics();
        divG.lineStyle(1, 0x1e2255, 1);
        divG.lineBetween(20, 70, W - 20, 70);

        // ── Two-column body ──
        const leftX  = W * 0.28;   // center of left column
        const rightX = W * 0.70;   // center of right column
        const bodyY  = 90;

        this._drawOptionsColumn(leftX, bodyY, W, H);
        this._drawPreviewColumn(rightX, bodyY, W, H);
    }

    // ── Left column: stadium / goals / time ───────────────────────────────
    _drawOptionsColumn(cx, startY, W, H) {
        let y = startY;

        // ── Mode ──
        this._sectionLabel(cx, y, 'MODO DE JUEGO');
        y += 38;
        const modeOptions = [
            { label: '1 vs 1', value: 'local1v1' },
            { label: '2 vs 2', value: 'local2v2' },
        ];
        const modePillW = 110, modePillH = 40, modeGap = 10;
        const mTotalW = modeOptions.length * modePillW + (modeOptions.length - 1) * modeGap;
        const mx = cx - mTotalW / 2;
        modeOptions.forEach((opt, i) => {
            const px = mx + i * (modePillW + modeGap) + modePillW / 2;
            this._optPill(px, y, modePillW, modePillH, opt.label, this.mode === opt.value, () => {
                this.scene.restart({ mode: opt.value, stadium: this.selectedStadium,
                    goals: this.selectedGoals, time: this.selectedTime });
            });
        });
        y += modePillH + 20;

        // ── Divider ──
        const dg0 = this.add.graphics();
        dg0.lineStyle(1, 0x1e2255, 1);
        dg0.lineBetween(cx - mTotalW / 2, y, cx + mTotalW / 2, y);
        y += 18;

        // ── Stadium ──
        this._sectionLabel(cx, y, 'ESTADIO');
        y += 38;

        if (this.hbsMode && window._hbsData) {
            const mapName = window._hbsData._fileName || window._hbsData.name || 'Mapa HBS';
            this._pill(cx, y, '🗺  ' + mapName, true, '#9955ee', () => {});
            y += 48;
            this._sectionLabel(cx, y, 'o elegí un estadio estándar:');
            y += 36;
        }

        const stadKeys = Object.keys(STADIUMS);
        const pillW = 116, pillH = 38, gap = 8;
        const totalW = stadKeys.length * pillW + (stadKeys.length - 1) * gap;
        const sx = cx - totalW / 2;

        stadKeys.forEach((key, i) => {
            const s      = STADIUMS[key];
            const active = this.selectedStadium === key;
            const px     = sx + i * (pillW + gap) + pillW / 2;
            this._stadPill(px, y, pillW, pillH, s, key, active);
        });
        y += pillH + 20;

        // ── Divider ──
        const dg = this.add.graphics();
        dg.lineStyle(1, 0x1e2255, 1);
        dg.lineBetween(cx - totalW / 2, y, cx + totalW / 2, y);
        y += 18;

        // ── Goals ──
        this._sectionLabel(cx, y, 'GOLES PARA GANAR');
        y += 38;
        const goalPillW = 80, goalPillH = 42;
        const gTotalW = this.goalOptions.length * goalPillW + (this.goalOptions.length - 1) * gap;
        const gx = cx - gTotalW / 2;
        this.goalOptions.forEach((opt, i) => {
            const px = gx + i * (goalPillW + gap) + goalPillW / 2;
            this._optPill(px, y, goalPillW, goalPillH, opt.label, this.selectedGoals === opt.value, () => {
                this.scene.restart({ mode: this.mode, stadium: this.selectedStadium,
                    goals: opt.value, time: this.selectedTime, hbs: this.hbsMode });
            });
        });
        y += goalPillH + 20;

        // ── Divider ──
        const dg2 = this.add.graphics();
        dg2.lineStyle(1, 0x1e2255, 1);
        dg2.lineBetween(cx - totalW / 2, y, cx + totalW / 2, y);
        y += 18;

        // ── Time ──
        this._sectionLabel(cx, y, 'DURACIÓN');
        y += 38;
        const timePillW = 80;
        const tTotalW = this.timeOptions.length * timePillW + (this.timeOptions.length - 1) * gap;
        const tx = cx - tTotalW / 2;
        this.timeOptions.forEach((opt, i) => {
            const px = tx + i * (timePillW + gap) + timePillW / 2;
            this._optPill(px, y, timePillW, goalPillH, opt.label, this.selectedTime === opt.value, () => {
                this.scene.restart({ mode: this.mode, stadium: this.selectedStadium,
                    goals: this.selectedGoals, time: opt.value, hbs: this.hbsMode });
            });
        });
        y += goalPillH + 28;

        // ── JUGAR button ──
        this._playBtn(cx, y);

        // ── Camera hint ──
        this.add.text(cx, H - 14, 'En partida: teclas 1 / 2 / 3 cambian el ángulo de cámara', {
            fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#2d3a5a'
        }).setOrigin(0.5, 1);
    }

    // ── Right column: preview ─────────────────────────────────────────────
    _drawPreviewColumn(cx, startY, W, H) {
        this._sectionLabel(cx, startY, 'VISTA PREVIA');

        const boxY  = startY + 26;
        const boxW  = Math.min(W * 0.38, 360);
        const boxH  = H - boxY - 30;

        // Container border
        const frame = this.add.graphics();
        frame.lineStyle(1, 0x1e2255, 1);
        frame.fillStyle(0x0a0a1a, 1);
        frame.fillRoundedRect(cx - boxW / 2, boxY, boxW, boxH, 8);
        frame.strokeRoundedRect(cx - boxW / 2, boxY, boxW, boxH, 8);

        this._previewField(cx, boxY, boxW, boxH);
    }

    // ── Section label ──────────────────────────────────────────────────────
    _sectionLabel(x, y, text) {
        this.add.text(x, y, text, {
            fontSize: '12px', fontFamily: 'Arial, sans-serif',
            color: '#7788bb', letterSpacing: 2
        }).setOrigin(0.5, 0);
    }

    // ── Stadium pill ───────────────────────────────────────────────────────
    _stadPill(x, y, pw, ph, stadiumCfg, key, active) {
        const grassColor = stadiumCfg.grass1;
        const lineColor  = stadiumCfg.lineColor;

        const g = this.add.graphics();
        const draw = (hover) => {
            g.clear();
            g.fillStyle(hover || active ? 0x141428 : 0x0c0c1e, 1);
            g.fillRoundedRect(x - pw / 2, y - ph / 2, pw, ph, 6);
            // Grass color swatch (3px left bar)
            g.fillStyle(grassColor, 1);
            g.fillRoundedRect(x - pw / 2, y - ph / 2, 4, ph, { tl: 6, bl: 6, tr: 0, br: 0 });
            // Border
            g.lineStyle(active ? 2 : 1, active ? lineColor : 0x2a2a55, active ? 1 : 0.7);
            g.strokeRoundedRect(x - pw / 2, y - ph / 2, pw, ph, 6);
        };
        draw(false);

        const label = this.add.text(x + 3, y, stadiumCfg.name, {
            fontSize: '12px', fontFamily: 'Arial, sans-serif',
            color: active ? '#ffffff' : '#667799'
        }).setOrigin(0.5);

        const hit = this.add.rectangle(x, y, pw, ph, 0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => { draw(true); label.setColor('#aabbdd'); });
        hit.on('pointerout',  () => { draw(false); label.setColor(active ? '#ffffff' : '#667799'); });
        hit.on('pointerdown', () => {
            this.selectedStadium = key;
            this.hbsMode = false;
            this.scene.restart({ mode: this.mode, stadium: key,
                goals: this.selectedGoals, time: this.selectedTime, hbs: false });
        });
    }

    // ── Option pill (goals / time) ─────────────────────────────────────────
    _optPill(x, y, pw, ph, label, active, cb) {
        const g = this.add.graphics();
        const ACTIVE_C = 0x1a6628;
        const draw = (hover) => {
            g.clear();
            if (active) {
                g.fillStyle(ACTIVE_C, 1);
                g.fillRoundedRect(x - pw / 2, y - ph / 2, pw, ph, 8);
                g.lineStyle(2, 0x44ee66, 0.9);
                g.strokeRoundedRect(x - pw / 2, y - ph / 2, pw, ph, 8);
            } else {
                g.fillStyle(hover ? 0x141428 : 0x0c0c1e, 1);
                g.fillRoundedRect(x - pw / 2, y - ph / 2, pw, ph, 8);
                g.lineStyle(1, hover ? 0x445588 : 0x1e2255, 1);
                g.strokeRoundedRect(x - pw / 2, y - ph / 2, pw, ph, 8);
            }
        };
        draw(false);

        const txt = this.add.text(x, y, label, {
            fontSize: '16px', fontFamily: 'Arial Black, sans-serif',
            color: active ? '#ffffff' : '#445577'
        }).setOrigin(0.5);

        const hit = this.add.rectangle(x, y, pw, ph, 0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => { draw(true); if (!active) txt.setColor('#8899bb'); });
        hit.on('pointerout',  () => { draw(false); if (!active) txt.setColor('#445577'); });
        hit.on('pointerdown', cb);
    }

    // ── Generic pill (for HBS map name) ───────────────────────────────────
    _pill(x, y, label, active, colorHex, cb) {
        const pw = 280, ph = 36;
        const c = Phaser.Display.Color.HexStringToColor(colorHex.replace('#', '')).color;
        const g = this.add.graphics();
        g.fillStyle(0x0c0c1e, 1);
        g.fillRoundedRect(x - pw / 2, y - ph / 2, pw, ph, 8);
        g.lineStyle(active ? 2 : 1, c, active ? 0.9 : 0.3);
        g.strokeRoundedRect(x - pw / 2, y - ph / 2, pw, ph, 8);
        g.fillStyle(c, 1);
        g.fillRoundedRect(x - pw / 2, y - ph / 2, 4, ph, { tl: 8, bl: 8, tr: 0, br: 0 });
        this.add.text(x + 4, y, label, {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#ccaaff'
        }).setOrigin(0.5);
    }

    // ── JUGAR button ───────────────────────────────────────────────────────
    _playBtn(x, y) {
        const pw = 220, ph = 52;
        const container = this.add.container(x, y);

        const base = this.add.graphics();
        const drawBase = (hover) => {
            base.clear();
            base.fillStyle(hover ? 0x1d5a28 : 0x143d1b, 1);
            base.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 10);
            base.fillStyle(0x33dd55, 1);
            base.fillRoundedRect(-pw / 2, -ph / 2, 5, ph, { tl: 10, bl: 10, tr: 0, br: 0 });
            base.lineStyle(hover ? 2 : 1, 0x33dd55, hover ? 0.9 : 0.45);
            base.strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 10);
        };
        drawBase(false);

        const lbl = this.add.text(8, 0, '▶  JUGAR', {
            fontSize: '20px', fontFamily: 'Arial Black, sans-serif', color: '#aaffbb'
        }).setOrigin(0.5);

        const hit = this.add.rectangle(0, 0, pw, ph, 0, 0).setInteractive({ useHandCursor: true });
        container.add([base, lbl, hit]);

        hit.on('pointerover', () => { drawBase(true); lbl.setColor('#ffffff'); });
        hit.on('pointerout',  () => { drawBase(false); lbl.setColor('#aaffbb'); });
        hit.on('pointerdown', () => {
            this.cameras.main.flash(100, 255, 255, 255, false);
            this.time.delayedCall(70, () => this._startGame());
        });
    }

    // ── Field preview ──────────────────────────────────────────────────────
    _previewField(cx, boxY, boxW, boxH) {
        if (this._preview) this._preview.destroy();

        const pad  = 16;
        const maxW = boxW - pad * 2;
        const maxH = boxH - pad * 2;

        if (this.hbsMode && window._hbsData) {
            this._drawHBSPreview(cx, boxY, maxW, maxH, pad);
            return;
        }

        const s     = STADIUMS[this.selectedStadium];
        const scale = Math.min(maxW / s.W, maxH / s.H, 0.42);
        const pw    = s.W * scale;
        const ph    = s.H * scale;
        const px    = cx - pw / 2;
        const py    = boxY + pad + (maxH - ph) / 2;

        this._preview = this.add.graphics();

        for (let i = 0; i < 8; i++) {
            this._preview.fillStyle(i % 2 === 0 ? s.grass1 : s.grass2, 1);
            this._preview.fillRect(px, py + i * (ph / 8), pw, ph / 8);
        }

        this._preview.lineStyle(2, s.lineColor, 0.9);
        this._preview.strokeRect(px, py, pw, ph);
        this._preview.lineStyle(1, s.lineColor, 0.6);
        this._preview.lineBetween(px + pw / 2, py, px + pw / 2, py + ph);
        this._preview.strokeCircle(px + pw / 2, py + ph / 2, 18 * scale / 0.33);

        const gh = s.GOAL_H * scale;
        const gd = s.GOAL_D * scale;
        const cy = py + ph / 2;
        this._preview.fillStyle(s.goalBgColor, 1);
        this._preview.fillRect(px - gd, cy - gh / 2, gd, gh);
        this._preview.fillRect(px + pw, cy - gh / 2, gd, gh);
        this._preview.lineStyle(2, s.goalColor1, 0.8);
        this._preview.strokeRect(px - gd, cy - gh / 2, gd, gh);
        this._preview.lineStyle(2, s.goalColor2, 0.8);
        this._preview.strokeRect(px + pw, cy - gh / 2, gd, gh);

        if (s.cornerRadius) {
            const cr = s.cornerRadius * scale;
            this._preview.lineStyle(1, s.lineColor, 0.4);
            [
                [px + cr, py + cr], [px + pw - cr, py + cr],
                [px + cr, py + ph - cr], [px + pw - cr, py + ph - cr]
            ].forEach(([ex, ey]) => this._preview.strokeCircle(ex, ey, cr));
        }

        // Stadium name label inside preview
        this.add.text(cx, boxY + boxH - pad - 6, s.name, {
            fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#2d3a5a'
        }).setOrigin(0.5, 1);
    }

    _drawHBSPreview(cx, boxY, maxW, maxH, pad) {
        const fd    = HBSLoader.getFieldData(window._hbsData);
        const scale = Math.min(maxW / fd.W, maxH / fd.H, 0.42);
        const pw    = fd.W * scale;
        const ph    = fd.H * scale;
        const px    = cx - pw / 2;
        const py    = boxY + pad + (maxH - ph) / 2;

        this._preview = this.add.graphics();
        const isHockey = fd.bgType.includes('hockey');
        const bg1 = isHockey ? 0x333333 : 0x4a6741;
        const bg2 = isHockey ? 0x2e2e2e : 0x3a5530;
        const lc  = isHockey ? 0xE9CC6E  : 0xC7E6BD;

        for (let i = 0; i < 8; i++) {
            this._preview.fillStyle(i % 2 === 0 ? bg1 : bg2, 1);
            this._preview.fillRect(px, py + i * (ph / 8), pw, ph / 8);
        }
        this._preview.lineStyle(2, lc, 0.9);
        this._preview.strokeRect(px, py, pw, ph);
        this._preview.lineStyle(1, lc, 0.6);
        this._preview.lineBetween(px + pw / 2, py, px + pw / 2, py + ph);
        this._preview.strokeCircle(px + pw / 2, py + ph / 2, fd.kickOffRadius * scale);

        if (fd.goals.length >= 2) {
            const gh  = Math.abs(fd.goals[0].p1.y - fd.goals[0].p0.y) * scale;
            const gcy = py + ph / 2;
            const gd  = fd.GOAL_D * scale;
            this._preview.fillStyle(bg2, 1);
            this._preview.fillRect(px - gd, gcy - gh / 2, gd, gh);
            this._preview.fillRect(px + pw, gcy - gh / 2, gd, gh);
            this._preview.lineStyle(2, 0xCCCCFF, 0.8);
            this._preview.strokeRect(px - gd, gcy - gh / 2, gd, gh);
            this._preview.lineStyle(2, 0xFFCCCC, 0.8);
            this._preview.strokeRect(px + pw, gcy - gh / 2, gd, gh);
        }

        const vtx = fd.vertexes;
        const fcx = px + pw / 2, fcy = py + ph / 2;
        for (const seg of fd.segments) {
            if (seg.v0 >= vtx.length || seg.v1 >= vtx.length) continue;
            const color = HBSLoader.parseColor(seg.color) || lc;
            this._preview.lineStyle(1, color, 0.8);
            const p0 = { x: fcx + vtx[seg.v0].x * scale, y: fcy - vtx[seg.v0].y * scale };
            const p1 = { x: fcx + vtx[seg.v1].x * scale, y: fcy - vtx[seg.v1].y * scale };
            HBSLoader.drawSegment(this._preview, p0, p1, seg.curve || 0);
        }

        const mapName = window._hbsData._fileName || window._hbsData.name || 'HBS Map';
        this.add.text(cx, boxY + maxH + pad - 6, mapName, {
            fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#2d3a5a'
        }).setOrigin(0.5, 1);
    }

    // ── Start game ─────────────────────────────────────────────────────────
    _startGame() {
        if (this.hbsMode && window._hbsData) {
            const fd = HBSLoader.getFieldData(window._hbsData);
            const cw = window.innerWidth, ch = window.innerHeight;
            F.W = fd.W; F.H = fd.H;
            F.X = Math.floor((cw - fd.W) / 2);
            F.Y = Math.floor((ch - fd.H) / 2);
            F.GOAL_H = fd.GOAL_H; F.GOAL_D = fd.GOAL_D; F.WALL_T = 22;
            F.CX = F.X + F.W / 2; F.CY = F.Y + F.H / 2;
            F.GOAL_TOP = F.CY - F.GOAL_H / 2;
            F.GOAL_BOT = F.CY + F.GOAL_H / 2;
            F.OUTER_X_MIN = F.CX - fd.camW; F.OUTER_X_MAX = F.CX + fd.camW;
            F.OUTER_Y_MIN = F.CY - fd.camH; F.OUTER_Y_MAX = F.CY + fd.camH;
            soundManager.whistle();
            this.scene.start('GameScene', {
                mode: this.mode, scoreWin: this.selectedGoals,
                timeLimit: this.selectedTime, stadium: 'hbs',
                hbs: window._hbsData, stadCanvasW: cw, stadCanvasH: ch,
            });
            return;
        }

        const s = STADIUMS[this.selectedStadium];
        F.W = s.W; F.H = s.H;
        F.X = Math.floor((s.canvasW - s.W) / 2);
        F.Y = Math.floor((s.canvasH - s.H) / 2);
        F.GOAL_H = s.GOAL_H; F.GOAL_D = s.GOAL_D; F.WALL_T = 22;
        F.CX = F.X + F.W / 2; F.CY = F.Y + F.H / 2;
        F.GOAL_TOP = F.CY - F.GOAL_H / 2;
        F.GOAL_BOT = F.CY + F.GOAL_H / 2;
        F.OUTER_X_MIN = F.CX - s.camW; F.OUTER_X_MAX = F.CX + s.camW;
        F.OUTER_Y_MIN = F.CY - s.camH; F.OUTER_Y_MAX = F.CY + s.camH;
        soundManager.whistle();
        this.scene.start('GameScene', {
            mode: this.mode, scoreWin: this.selectedGoals,
            timeLimit: this.selectedTime, stadium: this.selectedStadium,
            stadCanvasW: s.canvasW, stadCanvasH: s.canvasH,
        });
    }
}
