class GoalScene extends Phaser.Scene {
    constructor() { super('GoalScene'); }

    init(data) {
        this.team = data.team;
        this.score = data.score;
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.45);

        const color  = this.team === 'blue' ? '#5588ff' : '#ff5555';
        const label  = this.team === 'blue' ? 'AZUL' : 'ROJO';

        const goalText = this.add.text(W / 2, H / 2 - 60, '¡GOL!', {
            fontSize: '90px', fontFamily: 'Arial Black, Impact, sans-serif',
            color, stroke: '#000000', strokeThickness: 10
        }).setOrigin(0.5);

        this.tweens.add({
            targets: goalText,
            scaleX: 1.3, scaleY: 1.3,
            duration: 200, yoyo: true, ease: 'Sine.easeInOut'
        });

        this.add.text(W / 2, H / 2 + 30, `Equipo ${label}`, {
            fontSize: '30px', fontFamily: 'Arial, sans-serif',
            color: '#ffffff', stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5);

        this.add.text(W / 2, H / 2 + 80, `${this.score.blue}  –  ${this.score.red}`, {
            fontSize: '36px', fontFamily: 'Arial Black, Impact, sans-serif',
            color: '#ffffff', stroke: '#000000', strokeThickness: 6
        }).setOrigin(0.5);
    }
}
