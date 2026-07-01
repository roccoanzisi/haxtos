class MenuScene extends Phaser.Scene {
    constructor() { super('MenuScene'); }

    create() {
        soundManager.stopAmbient();
        const W = window.innerWidth;
        const H = window.innerHeight;

        this._drawGrass(W, H);
        this._drawPanel(W, H);
        this._soundToggle(W - 14, 14);
    }

    _drawGrass(W, H) {
        const bg = this.add.graphics();
        bg.fillStyle(0x5c7b41, 1);
        bg.fillRect(0, 0, W, H);

        // Diagonal stripes matching body CSS (repeating-linear-gradient 45deg)
        const sg = this.add.graphics();
        sg.fillStyle(0x6c8c4f, 1);
        const period = 80, half = 40;
        for (let x = -H; x < W + H; x += period) {
            sg.fillPoints([
                { x,          y: 0 },
                { x: x + half, y: 0 },
                { x: x + half + H, y: H },
                { x: x + H,   y: H }
            ], true);
        }
    }

    _drawPanel(W, H) {
        const PW = 400;
        const PH = 278;
        const px = Math.round((W - PW) / 2);
        const py = Math.round((H - PH) / 2);
        const cx = W / 2;

        // Drop shadow
        const sh = this.add.graphics();
        sh.fillStyle(0x000000, 0.45);
        sh.fillRoundedRect(px + 5, py + 5, PW, PH, 4);

        // Panel bg + border
        const panel = this.add.graphics();
        panel.fillStyle(0x1a202c, 1);
        panel.fillRoundedRect(px, py, PW, PH, 4);
        panel.lineStyle(1, 0x2d3748, 1);
        panel.strokeRoundedRect(px, py, PW, PH, 4);

        // --- Logo ---
        const logoY = py + 58;

        this.add.text(cx - 6, logoY, 'Hax', {
            fontSize: '54px', fontFamily: '"Arial Black", Arial, sans-serif',
            color: '#ff3333',
            stroke: '#ffffff', strokeThickness: 2
        }).setOrigin(1, 0.5);

        this.add.text(cx, logoY + 2, '⚽', {
            fontSize: '46px'
        }).setOrigin(0.5, 0.5);

        this.add.text(cx + 6, logoY, 'tos', {
            fontSize: '54px', fontFamily: '"Arial Black", Arial, sans-serif',
            color: '#3388ff',
            stroke: '#ffffff', strokeThickness: 2
        }).setOrigin(0, 0.5);

        // ⭐ top-right of logo
        this.add.text(cx + 98, logoY - 34, '⭐', {
            fontSize: '22px'
        }).setOrigin(0.5).setAngle(20);

        // Red accent line
        const lineY = logoY + 40;
        const acc = this.add.graphics();
        acc.fillStyle(0xe53e3e, 1);
        acc.fillRect(px + 14, lineY, PW - 28, 2);

        // Buttons
        const btn1Y = lineY + 22;
        const btn2Y = btn1Y + 62;

        this._button(cx, btn1Y, '⚽', 'LOCAL', 'Partida local en el mismo equipo', '#2b6cb0', '#3182ce',
            () => this.scene.start('GameScene', { mode: 'local1v1' }));

        this._button(cx, btn2Y, '🌐', 'ONLINE', 'Jugar en línea con otros jugadores', '#276749', '#38a169',
            () => { if (window.showHaxRoomList) window.showHaxRoomList(); });

        // Controls hint
        this.add.text(cx, py + PH - 13, 'Rojo: WASD + Espacio   ·   Azul: ↑↓←→ + Shift', {
            fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#4a5568'
        }).setOrigin(0.5, 1);

        // Slide-in animation
        const panelObjs = sh.list ? [sh, panel, acc] : [];
        panel.setAlpha(0); sh.setAlpha(0);
        this.tweens.add({ targets: [sh, panel], alpha: { from: 0, to: 1 }, duration: 200, ease: 'Power2' });
    }

    _button(cx, y, icon, label, sub, bgHex, borderHex, cb) {
        const BW = 368, BH = 50;
        const bx = cx - BW / 2;
        const by = y - BH / 2;
        const bc = Phaser.Display.Color.HexStringToColor(borderHex.replace('#','')).color;

        const bg   = this.add.graphics();
        const bord = this.add.graphics();

        const draw = (hover) => {
            bg.clear();
            bg.fillStyle(hover ? 0x1e2a38 : 0x14161d, 1);
            bg.fillRoundedRect(bx, by, BW, BH, 3);

            bord.clear();
            bord.lineStyle(1, bc, hover ? 1 : 0.35);
            bord.strokeRoundedRect(bx, by, BW, BH, 3);
        };
        draw(false);

        // Left accent bar
        const accG = this.add.graphics();
        accG.fillStyle(bc, 1);
        accG.fillRoundedRect(bx, by, 4, BH, { tl: 3, bl: 3, tr: 0, br: 0 });

        const iconT  = this.add.text(bx + 22, y, icon, { fontSize: '17px' }).setOrigin(0.5);
        const labelT = this.add.text(bx + 42, y - 8, label, {
            fontSize: '14px', fontFamily: '"Arial Black", Arial, sans-serif', color: '#e2e8f0'
        }).setOrigin(0, 0.5);
        const subT   = this.add.text(bx + 42, y + 10, sub, {
            fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#4a6080'
        }).setOrigin(0, 0.5);
        const arrow  = this.add.text(bx + BW - 14, y, '›', {
            fontSize: '22px', fontFamily: 'Arial, sans-serif', color: borderHex
        }).setOrigin(0.5).setAlpha(0);

        const hit = this.add.rectangle(cx, y, BW, BH, 0, 0).setInteractive({ useHandCursor: true });

        hit.on('pointerover', () => {
            draw(true);
            labelT.setColor('#ffffff');
            this.tweens.add({ targets: arrow, alpha: 1, x: bx + BW - 9, duration: 130 });
        });
        hit.on('pointerout', () => {
            draw(false);
            labelT.setColor('#e2e8f0');
            this.tweens.add({ targets: arrow, alpha: 0, x: bx + BW - 14, duration: 130 });
        });
        hit.on('pointerdown', () => {
            this.cameras.main.flash(70, 255, 255, 255, false);
            this.time.delayedCall(60, cb);
        });
    }

    _soundToggle(x, y) {
        const txt = this.add.text(x, y, '\u{1F50A}', { fontSize: '18px' })
            .setOrigin(1, 0).setDepth(50).setAlpha(0.5).setInteractive({ useHandCursor: true });
        txt.on('pointerover', () => txt.setAlpha(0.9));
        txt.on('pointerout',  () => txt.setAlpha(0.5));
        txt.on('pointerdown', () => {
            const on = soundManager.toggle();
            txt.setText(on ? '\u{1F50A}' : '\u{1F507}');
        });
        return txt;
    }
}
