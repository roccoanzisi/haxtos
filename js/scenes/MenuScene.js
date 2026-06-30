class MenuScene extends Phaser.Scene {
    constructor() { super('MenuScene'); }

    create() {
        soundManager.stopAmbient();
        const W = window.innerWidth;
        const H = window.innerHeight;

        this._drawBackground(W, H);
        this._drawTitle(W, H);
        this._drawButtons(W, H);
        this._drawControls(W, H);
        this.soundBtn = this._soundToggle(W - 18, 18);
    }

    _drawBackground(W, H) {
        // Base dark background
        const bg = this.add.graphics();
        bg.fillStyle(0x07071a, 1);
        bg.fillRect(0, 0, W, H);

        // Ghosted field decoration
        const g = this.add.graphics();
        g.lineStyle(1, 0x3355aa, 0.12);

        const fw = Math.min(W * 0.75, 700);
        const fh = Math.min(H * 0.52, 300);
        const fx = (W - fw) / 2;
        const fy = (H - fh) / 2;

        g.strokeRect(fx, fy, fw, fh);
        g.strokeCircle(W / 2, H / 2, fh * 0.28);
        g.moveTo(W / 2, fy);
        g.lineTo(W / 2, fy + fh);
        g.strokePath();

        // Left penalty area
        const paW = fw * 0.14, paH = fh * 0.52;
        g.strokeRect(fx, H / 2 - paH / 2, paW, paH);
        // Right penalty area
        g.strokeRect(fx + fw - paW, H / 2 - paH / 2, paW, paH);

        // Center dot
        g.fillStyle(0x3355aa, 0.18);
        g.fillCircle(W / 2, H / 2, 3);

        // Blue left stripe
        const lb = this.add.graphics();
        lb.fillStyle(0x1133cc, 1);
        lb.fillRect(0, 0, 4, H);
        lb.setAlpha(0.7);

        // Red right stripe
        const rb = this.add.graphics();
        rb.fillStyle(0xcc1111, 1);
        rb.fillRect(W - 4, 0, 4, H);
        rb.setAlpha(0.7);

        // Top vignette fade (very subtle)
        const vg = this.add.graphics();
        vg.fillGradientStyle(0x000000, 0x000000, 0x07071a, 0x07071a, 0.6, 0.6, 0, 0);
        vg.fillRect(0, 0, W, H * 0.28);

        // Floating ghost balls
        for (let i = 0; i < 4; i++) {
            const bx = Phaser.Math.Between(60, W - 60);
            const by = Phaser.Math.Between(60, H - 60);
            const r  = Phaser.Math.Between(5, 11);
            const ball = this.add.circle(bx, by, r, 0xffffff).setAlpha(0.04);
            this.tweens.add({
                targets: ball,
                x: Phaser.Math.Between(60, W - 60),
                y: Phaser.Math.Between(60, H - 60),
                duration: Phaser.Math.Between(5000, 9000),
                ease: 'Sine.easeInOut',
                yoyo: true,
                repeat: -1,
                delay: i * 1500
            });
        }
    }

    _drawTitle(W, H) {
        const ty = H * 0.17;

        // Drop shadow
        this.add.text(W / 2 + 3, ty + 3, 'HAXTOS', {
            fontSize: '82px', fontFamily: 'Arial Black, Impact, sans-serif',
            color: '#000000'
        }).setOrigin(0.5).setAlpha(0.55);

        // Main title
        const title = this.add.text(W / 2, ty, 'HAXTOS', {
            fontSize: '82px', fontFamily: 'Arial Black, Impact, sans-serif',
            color: '#ffffff',
            stroke: '#2244cc', strokeThickness: 4
        }).setOrigin(0.5).setAlpha(0);

        // Additive glow layer
        const glow = this.add.text(W / 2, ty, 'HAXTOS', {
            fontSize: '82px', fontFamily: 'Arial Black, Impact, sans-serif',
            color: '#99bbff'
        }).setOrigin(0.5).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);

        this.tweens.add({ targets: title, alpha: 1, duration: 550, ease: 'Power2' });
        this.tweens.add({
            targets: glow, alpha: 0.18,
            duration: 1100, ease: 'Sine.easeInOut',
            yoyo: true, repeat: -1, delay: 400
        });

        // Subtitle
        this.add.text(W / 2, ty + 54, 'Fútbol de Mesa Online', {
            fontSize: '17px', fontFamily: 'Arial, sans-serif',
            color: '#6677aa'
        }).setOrigin(0.5);

        // Blue / Red divider line
        const dg = this.add.graphics();
        dg.fillStyle(0x2255ee, 1);
        dg.fillRect(W / 2 - 104, ty + 78, 100, 2);
        dg.fillStyle(0xcc2222, 1);
        dg.fillRect(W / 2 + 4, ty + 78, 100, 2);
    }

    _drawButtons(W, H) {
        this._cardIndex = 0;
        const startY = H * 0.46;
        const gap    = 84;

        const items = [
            { icon: '⚽',  label: 'LOCAL',   sub: 'Partida en el mismo equipo',  color: '#1e4fcc', cb: () => this.scene.start('ConfigScene', { mode: 'local1v1' }) },
            { icon: '🌐',  label: 'ONLINE',  sub: 'Partidas en línea',            color: '#1a6628', cb: () => this.scene.start('OnlineScene') },
        ];

        items.forEach(({ icon, label, sub, color, cb }, i) => {
            this._card(W / 2, startY + i * gap, icon, label, sub, color, cb);
        });
    }

    _card(x, y, icon, label, sub, colorHex, cb) {
        const CW = 400, CH = 62;
        const c = Phaser.Display.Color.HexStringToColor(colorHex.replace('#', '')).color;

        const container = this.add.container(x - 30, y).setAlpha(0);

        // Base bg (coords relative to container center)
        const base = this.add.graphics();
        const drawBase = (bright) => {
            base.clear();
            base.fillStyle(bright ? 0x141428 : 0x0e0e22, 1);
            base.fillRoundedRect(-CW / 2, -CH / 2, CW, CH, 8);
        };
        drawBase(false);

        // Colored left accent bar
        const accent = this.add.graphics();
        accent.fillStyle(c, 1);
        accent.fillRoundedRect(-CW / 2, -CH / 2, 5, CH, { tl: 8, bl: 8, tr: 0, br: 0 });

        // Border
        const border = this.add.graphics();
        const drawBorder = (bright) => {
            border.clear();
            border.lineStyle(1, c, bright ? 0.85 : 0.25);
            border.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, 8);
        };
        drawBorder(false);

        const iconTxt  = this.add.text(-CW / 2 + 26, 0, icon, { fontSize: '20px' }).setOrigin(0.5);
        const labelTxt = this.add.text(-CW / 2 + 48, -9, label, {
            fontSize: '17px', fontFamily: 'Arial Black, sans-serif', color: '#e8eeff'
        }).setOrigin(0, 0.5);
        const subTxt   = this.add.text(-CW / 2 + 48, 12, sub, {
            fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#556688'
        }).setOrigin(0, 0.5);
        const arrow    = this.add.text(CW / 2 - 16, 0, '›', {
            fontSize: '22px', fontFamily: 'Arial, sans-serif', color: colorHex
        }).setOrigin(0.5).setAlpha(0);

        // Invisible hit zone on top
        const hit = this.add.rectangle(0, 0, CW, CH, 0x000000, 0).setInteractive({ useHandCursor: true });

        container.add([base, accent, border, iconTxt, labelTxt, subTxt, arrow, hit]);

        hit.on('pointerover', () => {
            drawBase(true);
            drawBorder(true);
            labelTxt.setColor('#ffffff');
            this.tweens.add({ targets: arrow, alpha: 1, x: CW / 2 - 11, duration: 150 });
        });
        hit.on('pointerout', () => {
            drawBase(false);
            drawBorder(false);
            labelTxt.setColor('#e8eeff');
            this.tweens.add({ targets: arrow, alpha: 0, x: CW / 2 - 16, duration: 150 });
        });
        hit.on('pointerdown', () => {
            this.cameras.main.flash(100, 255, 255, 255, false);
            this.time.delayedCall(70, cb);
        });

        // Slide-in
        this.tweens.add({
            targets: container,
            x: x,
            alpha: 1,
            duration: 280,
            delay: 80 + this._cardIndex * 55,
            ease: 'Power2.easeOut'
        });
        this._cardIndex++;
    }

    _drawControls(W, H) {
        const y = H - 26;
        this.add.text(W / 2, y, 'Azul: WASD + Espacio  ·  Rojo: ↑↓←→ + Shift  ·  2v2 añade TGFH e IJKL', {
            fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#334466'
        }).setOrigin(0.5);
    }

    _soundToggle(x, y) {
        const txt = this.add.text(x, y, '\u{1F50A}', {
            fontSize: '20px'
        }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(50).setAlpha(0.6);
        txt.on('pointerover', () => txt.setAlpha(1));
        txt.on('pointerout',  () => txt.setAlpha(0.6));
        txt.on('pointerdown', () => {
            const on = soundManager.toggle();
            txt.setText(on ? '\u{1F50A}' : '\u{1F507}');
        });
        return txt;
    }
}
