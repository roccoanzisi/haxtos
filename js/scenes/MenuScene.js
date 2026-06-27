class MenuScene extends Phaser.Scene {
    constructor() { super('MenuScene'); }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        // Background field preview
        this._drawField();

        // Title
        this.add.text(W / 2, 110, 'HAXTOS', {
            fontSize: '72px', fontFamily: 'Arial Black, Impact, sans-serif',
            color: '#ffffff', stroke: '#000000', strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(W / 2, 175, 'Fútbol de Mesa Online', {
            fontSize: '20px', fontFamily: 'Arial, sans-serif',
            color: '#cccccc'
        }).setOrigin(0.5);

        // Buttons
        this._button(W / 2, 290, '⚽  LOCAL 1 vs 1', '#2255ee', () => {
            this.scene.start('GameScene', { mode: 'local' });
        });

        this._button(W / 2, 370, '🌐  ONLINE (próximamente)', '#555555', null);

        // Controls hint
        this.add.text(W / 2, 480, 'Azul: WASD  |  Rojo: ↑ ↓ ← →', {
            fontSize: '15px', fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa'
        }).setOrigin(0.5);
    }

    _button(x, y, label, color, cb) {
        const bg = this.add.rectangle(x, y, 340, 60, Phaser.Display.Color.HexStringToColor(color.replace('#', '')).color, 1)
            .setStrokeStyle(2, 0xffffff, cb ? 1 : 0.3)
            .setInteractive(cb ? {} : { useHandCursor: false });

        const text = this.add.text(x, y, label, {
            fontSize: '22px', fontFamily: 'Arial, sans-serif',
            color: cb ? '#ffffff' : '#777777'
        }).setOrigin(0.5);

        if (cb) {
            bg.on('pointerover', () => bg.setFillStyle(0x4488ff));
            bg.on('pointerout', () => bg.setFillStyle(Phaser.Display.Color.HexStringToColor(color.replace('#', '')).color));
            bg.on('pointerdown', cb);
        }
    }

    _drawField() {
        const g = this.add.graphics();
        g.fillStyle(0x2d7a2d, 1);
        g.fillRect(0, 0, 900, 540);
        g.fillStyle(0x287028, 1);
        for (let i = 0; i < 8; i++) {
            if (i % 2 === 0) g.fillRect(i * 113, 0, 113, 540);
        }
        g.alpha = 0.4;
    }
}
