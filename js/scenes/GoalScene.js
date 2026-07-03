class GoalScene extends Phaser.Scene {
    constructor() { super('GoalScene'); }

    init(data) {
        this.team = data.team;
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const isBlue = this.team === 'blue';

        // Draw a horizontal semi-transparent dark grey strip (matches Haxball's goal banner)
        this.add.rectangle(W / 2, H / 2, W, 86, 0x000000, 0.5)
            .setScrollFactor(0).setDepth(40).setOrigin(0.5);

        // Text "Red Scored!" or "Blue Scored!" in the middle of the strip
        const labelText = isBlue ? 'Blue Scored!' : 'Red Scored!';
        const labelColor = isBlue ? '#3182ce' : '#e53e3e';

        this.add.text(W / 2, H / 2, labelText, {
            fontSize: '40px',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontWeight: 'bold',
            color: labelColor,
            stroke: '#000000',
            strokeThickness: 5
        }).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    }
}
