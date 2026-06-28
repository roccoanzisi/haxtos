class MenuScene extends Phaser.Scene {
    constructor() { super('MenuScene'); }

    create() {
        soundManager.stopAmbient();

        const W = window.innerWidth;
        const H = window.innerHeight;

        this._drawField();

        this.add.text(W / 2, 85, 'HAXTOS', {
            fontSize: '72px', fontFamily: 'Arial Black, Impact, sans-serif',
            color: '#ffffff', stroke: '#000000', strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(W / 2, 140, 'Fútbol de Mesa Online', {
            fontSize: '20px', fontFamily: 'Arial, sans-serif',
            color: '#cccccc'
        }).setOrigin(0.5);

        this._button(W / 2, 230, '⚽  LOCAL 1 vs 1', '#2255ee', () => {
            this.scene.start('ConfigScene', { mode: 'local1v1' });
        });

        this._button(W / 2, 300, '⚽⚽  LOCAL 2 vs 2', '#1a4499', () => {
            this.scene.start('ConfigScene', { mode: 'local2v2' });
        });

        this._button(W / 2, 370, '🌐  ONLINE', '#338833', () => {
            this.scene.start('OnlineScene');
        });

        this._button(W / 2, 440, '🗺️  CARGAR MAPA (.hbs)', '#664400', () => this._loadHBS());

        this.add.text(W / 2, 510, 'Azul 1: WASD  |  Azul 2: TGFH  |  Rojo 1: ↑↓←→  |  Rojo 2: IJKL', {
            fontSize: '13px', fontFamily: 'Arial, sans-serif',
            color: '#999999'
        }).setOrigin(0.5);

        this.add.text(W / 2, 535, 'Patada: ESPACIO (Azul) / SHIFT (Rojo)', {
            fontSize: '13px', fontFamily: 'Arial, sans-serif',
            color: '#777777'
        }).setOrigin(0.5);

        this.soundBtn = this._soundToggle(W - 30, 20);
    }

    _loadHBS() {
        let input = document.getElementById('_hbsFileInput');
        if (!input) {
            input = document.createElement('input');
            input.type = 'file';
            input.accept = '.hbs';
            input.id = '_hbsFileInput';
            input.style.display = 'none';
            document.body.appendChild(input);
        }
        input.value = '';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    window._hbsData = HBSLoader.load(ev.target.result);
                    window._hbsData._fileName = file.name;
                    this.scene.start('ConfigScene', { mode: 'local1v1', hbs: true });
                } catch (err) {
                    console.error('Error al cargar HBS:', err);
                    alert('Error al leer el archivo: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    _soundToggle(x, y) {
        const txt = this.add.text(x, y, '\u{1F50A}', {
            fontSize: '22px'
        }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(50);
        txt.on('pointerdown', () => {
            const on = soundManager.toggle();
            txt.setText(on ? '\u{1F50A}' : '\u{1F507}');
        });
        return txt;
    }

    _button(x, y, label, color, cb) {
        const bg = this.add.rectangle(x, y, 340, 55, Phaser.Display.Color.HexStringToColor(color.replace('#', '')).color, 1)
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
        const W = window.innerWidth;
        const H = window.innerHeight;
        const g = this.add.graphics();
        g.fillStyle(0x2d7a2d, 1);
        g.fillRect(0, 0, W, H);
        g.fillStyle(0x287028, 1);
        for (let i = 0; i < 8; i++) {
            if (i % 2 === 0) g.fillRect(i * (W / 8), 0, W / 8, H);
        }
        g.alpha = 0.4;
    }
}
