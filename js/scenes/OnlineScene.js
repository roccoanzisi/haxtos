class OnlineScene extends Phaser.Scene {
    constructor() { super('OnlineScene'); }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.8);

        this.add.text(W / 2, 80, 'ONLINE', {
            fontSize: '48px', fontFamily: 'Arial Black, Impact, sans-serif',
            color: '#ffffff', stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5);

        this.add.text(W / 2, 150, 'Crear o unirte a una sala', {
            fontSize: '18px', fontFamily: 'Arial, sans-serif',
            color: '#aaa'
        }).setOrigin(0.5);

        this.status = this.add.text(W / 2, 200, '', {
            fontSize: '16px', fontFamily: 'Arial, sans-serif',
            color: '#ffaa44'
        }).setOrigin(0.5);

        this.add.text(W / 2, 260, 'Código de sala (4 letras):', {
            fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#ccc'
        }).setOrigin(0.5);

        this.roomInput = this.add.text(W / 2, 295, '____', {
            fontSize: '36px', fontFamily: 'monospace', color: '#ffffff',
            backgroundColor: '#333333', padding: { x: 20, y: 8 }
        }).setOrigin(0.5);

        this.roomCode = '';
        this.input.keyboard.on('keydown', (ev) => {
            if (ev.key === 'Escape') {
                this._disconnect();
                this.scene.start('MenuScene');
                return;
            }
            if (this.waiting) return;
            if (/^[a-zA-Z]$/.test(ev.key) && this.roomCode.length < 4) {
                this.roomCode += ev.key.toUpperCase();
                this.roomInput.setText(this.roomCode.padEnd(4, '_'));
            }
            if (ev.key === 'Backspace') {
                this.roomCode = this.roomCode.slice(0, -1);
                this.roomInput.setText(this.roomCode.padEnd(4, '_'));
            }
            if (ev.key === 'Enter' && this.roomCode.length === 4) {
                this._joinRoom();
            }
        });

        this._btn(W / 2 - 120, 370, 'UNIRSE', '#2255ee', () => {
            if (this.roomCode.length === 4) this._joinRoom();
        });

        this._btn(W / 2 + 120, 370, 'CREAR', '#226622', () => {
            if (this.roomCode.length < 4) {
                this.roomCode = this._randomCode();
                this.roomInput.setText(this.roomCode);
            }
            this._joinRoom();
        });

        this._btn(W / 2, 440, 'Volver', '#444444', () => {
            this.scene.start('MenuScene');
        });

        this.ws = null;
        this.waiting = false;
        this.playerIndex = 0;

        this.add.text(W / 2, 510, 'ESC: Volver al menú', {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#666'
        }).setOrigin(0.5);
    }

    _randomCode() {
        const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        let r = '';
        for (let i = 0; i < 4; i++) r += c[Math.floor(Math.random() * c.length)];
        return r;
    }

    _joinRoom() {
        if (this.waiting) return;
        this.waiting = true;
        this.status.setText('Conectando...');

        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const host = isLocal ? location.host : 'haxtos.onrender.com';
        this.ws = new WebSocket(`${proto}//${host}`);

        this.ws.onopen = () => {
            const nick = localStorage.getItem('haxNickname') || '';
            this.ws.send(JSON.stringify({ type: 'join', room: this.roomCode, name: nick }));
        };

        this.ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'joined') {
                this.playerIndex = msg.index;
                this.status.setText(`Sala ${this.roomCode} — Esperando rival...`);
            }
            if (msg.type === 'start') {
                this.status.setText('¡Rival conectado!');
                this.time.delayedCall(500, () => {
                    this.scene.start('GameScene', {
                        mode: 'online',
                        ws: this.ws,
                        playerIndex: msg.index,
                        roomCode: this.roomCode
                    });
                });
            }
            if (msg.type === 'error') {
                this.status.setText(msg.text);
                this.waiting = false;
                this.ws.close();
            }
            if (msg.type === 'opponent_left') {
                this.status.setText('El rival se desconectó');
                this.waiting = false;
            }
        };

        this.ws.onclose = () => {
            if (!this.waiting) return;
            this.status.setText('Conexión cerrada');
            this.waiting = false;
        };
    }

    _disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    _btn(x, y, label, color, cb) {
        const bg = this.add.rectangle(x, y, 180, 48, Phaser.Display.Color.HexStringToColor(color.replace('#', '')).color, 1)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive();
        this.add.text(x, y, label, {
            fontSize: '18px', fontFamily: 'Arial, sans-serif', color: '#ffffff'
        }).setOrigin(0.5);
        bg.on('pointerover', () => bg.setAlpha(0.8));
        bg.on('pointerout', () => bg.setAlpha(1));
        bg.on('pointerdown', cb);
    }
}
