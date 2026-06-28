class GoalScene extends Phaser.Scene {
    constructor() { super('GoalScene'); }

    init(data) {
        this.team = data.team;
        this.score = data.score;
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const isBlue = this.team === 'blue';

        const overlayColor = isBlue ? 0x001155 : 0x550000;
        const teamHex      = isBlue ? '#88aaff' : '#ff8888';
        const label        = isBlue ? 'Equipo AZUL' : 'Equipo ROJO';

        // Team-colored overlay (fades in)
        const overlay = this.add.rectangle(W / 2, H / 2, W, H, overlayColor, 0)
            .setScrollFactor(0).setDepth(40);
        this.tweens.add({ targets: overlay, alpha: 0.72, duration: 180, ease: 'Sine.easeOut' });

        // "¡GOL!" — scales in from center
        const goalText = this.add.text(W / 2, H / 2 - 58, '¡GOL!', {
            fontSize: '92px', fontFamily: 'Arial Black, Impact, sans-serif',
            color: '#ffffff', stroke: '#000000', strokeThickness: 11
        }).setOrigin(0.5).setScale(0.15).setAlpha(0).setScrollFactor(0).setDepth(41);

        this.tweens.add({
            targets: goalText, scaleX: 1, scaleY: 1, alpha: 1,
            duration: 300, ease: 'Back.easeOut'
        });

        // Team name fades in
        const teamText = this.add.text(W / 2, H / 2 + 26, label, {
            fontSize: '26px', fontFamily: 'Arial, sans-serif',
            color: teamHex, stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setAlpha(0).setScrollFactor(0).setDepth(41);
        this.tweens.add({ targets: teamText, alpha: 1, duration: 280, delay: 120 });

        // Score
        const scoreText = this.add.text(W / 2, H / 2 + 72,
            `${this.score.blue}  –  ${this.score.red}`, {
            fontSize: '40px', fontFamily: 'Arial Black, Impact, sans-serif',
            color: '#ffffff', stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5).setAlpha(0).setScrollFactor(0).setDepth(41);
        this.tweens.add({ targets: scoreText, alpha: 1, duration: 280, delay: 220 });
    }
}
