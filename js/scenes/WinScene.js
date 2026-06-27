class WinScene extends Phaser.Scene {
    constructor() { super('WinScene'); }

    init(data) {
        this.score = data.score;
        this.time  = data.time;
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75);

        let winner, color;
        if (this.score.blue > this.score.red) {
            winner = 'Equipo AZUL';
            color  = '#5588ff';
        } else if (this.score.red > this.score.blue) {
            winner = 'Equipo ROJO';
            color  = '#ff5555';
        } else {
            winner = '¡EMPATE!';
            color  = '#ffffff';
        }

        this.add.text(W / 2, H / 2 - 110, 'FIN DEL PARTIDO', {
            fontSize: '42px', fontFamily: 'Arial Black, Impact, sans-serif',
            color: '#ffffff', stroke: '#000000', strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(W / 2, H / 2 - 40, winner, {
            fontSize: '52px', fontFamily: 'Arial Black, Impact, sans-serif',
            color, stroke: '#000000', strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(W / 2, H / 2 + 40, `${this.score.blue}  –  ${this.score.red}`, {
            fontSize: '42px', fontFamily: 'Arial Black, Impact, sans-serif',
            color: '#ffffff', stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5);

        this._btn(W / 2 - 110, H / 2 + 125, 'Revancha', 0x226622, () => {
            soundManager.whistle();
            this.scene.start('GameScene', { mode: 'local1v1' });
        });
        this._btn(W / 2 + 110, H / 2 + 125, 'Menú', 0x444444, () => {
            this.scene.start('MenuScene');
        });
    }

    _btn(x, y, label, fill, cb) {
        const bg = this.add.rectangle(x, y, 180, 52, fill)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive();
        this.add.text(x, y, label, {
            fontSize: '22px', fontFamily: 'Arial, sans-serif', color: '#ffffff'
        }).setOrigin(0.5);

        bg.on('pointerover',  () => bg.setAlpha(0.8));
        bg.on('pointerout',   () => bg.setAlpha(1));
        bg.on('pointerdown',  cb);
    }
}
