const STADIUMS = {
    classic: {
        name: 'Classic',
        W: 880, H: 470, GOAL_H: 140, GOAL_D: 65,
        grass1: 0x718C5A, grass2: 0x7A9660,
        lineColor: 0xC7E6BD,
        goalColor1: 0xCCCCFF, goalColor2: 0xFFCCCC,
    },
    big: {
        name: 'Big',
        W: 1100, H: 480, GOAL_H: 160, GOAL_D: 70,
        grass1: 0x718C5A, grass2: 0x7A9660,
        lineColor: 0xC7E6BD,
        goalColor1: 0xCCCCFF, goalColor2: 0xFFCCCC,
    },
    hockey: {
        name: 'Hockey',
        W: 880, H: 400, GOAL_H: 120, GOAL_D: 55,
        grass1: 0x555555, grass2: 0x505050,
        lineColor: 0xE9CC6E,
        goalColor1: 0xCCCCFF, goalColor2: 0xFFCCCC,
    },
};

class ConfigScene extends Phaser.Scene {
    constructor() { super('ConfigScene'); }

    init(data) {
        this.mode = (data && data.mode) || 'local1v1';
        this.selectedStadium = 'classic';
        this.selectedGoals = 7;
        this.selectedTime = 3 * 60;
        this.goalOptions = [
            { label: '3', value: 3 },
            { label: '5', value: 5 },
            { label: '7', value: 7 },
            { label: '\u221E', value: 0 },
        ];
        this.timeOptions = [
            { label: '2 min', value: 2 * 60 },
            { label: '3 min', value: 3 * 60 },
            { label: '5 min', value: 5 * 60 },
            { label: '\u221E', value: 0 },
        ];
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        this.add.rectangle(W / 2, H / 2, W, H, 0x111111, 0.92);

        this.add.text(W / 2, 30, 'CONFIGURAR PARTIDA', {
            fontSize: '28px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#ffffff', stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5);

        // Stadium selector
        this.add.text(W / 2, 75, 'Estadio', {
            fontSize: '16px', fontFamily: 'Verdana, Arial, sans-serif', color: '#aaa'
        }).setOrigin(0.5);

        const stadNames = Object.keys(STADIUMS);
        const stadY = 105;
        stadNames.forEach((key, i) => {
            const s = STADIUMS[key];
            this._stadBtn(W / 2 - 160 + i * 160, stadY, s.name, s.grass1, s.lineColor, key);
        });

        // Score selector
        this.add.text(W / 2, 160, 'Goles para ganar', {
            fontSize: '16px', fontFamily: 'Verdana, Arial, sans-serif', color: '#aaa'
        }).setOrigin(0.5);

        this.goalOptions.forEach((opt, i) => {
            this._selBtn(W / 2 - 180 + i * 120, 190, opt.label, 'goals', opt.value);
        });

        // Time selector
        this.add.text(W / 2, 245, 'Duraci\u00f3n', {
            fontSize: '16px', fontFamily: 'Verdana, Arial, sans-serif', color: '#aaa'
        }).setOrigin(0.5);

        this.timeOptions.forEach((opt, i) => {
            this._selBtn(W / 2 - 180 + i * 120, 275, opt.label, 'time', opt.value);
        });

        // Preview
        this.add.text(W / 2, 330, 'Vista previa del campo', {
            fontSize: '14px', fontFamily: 'Verdana, Arial, sans-serif', color: '#888'
        }).setOrigin(0.5);

        this._previewField();

        // Start button
        this._btn(W / 2, H - 60, 'JUGAR', '#228833', () => this._startGame());

        // Back
        this._btn(W / 2, H - 20, 'Volver al men\u00fa', '#444444', () => this.scene.start('MenuScene'));
    }

    _stadBtn(x, y, label, color, lineColor, key) {
        const bg = this.add.rectangle(x, y, 140, 36, Phaser.Display.Color.HexStringToColor(color.toString(16).padStart(6, '0')).color, 1)
            .setStrokeStyle(2, lineColor, 1)
            .setInteractive();
        this.add.text(x, y, label, {
            fontSize: '14px', fontFamily: 'Verdana, Arial, sans-serif', color: '#ffffff', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5);
        bg.on('pointerdown', () => {
            this.selectedStadium = key;
            this._previewField();
        });
        bg.on('pointerover', () => bg.setAlpha(0.7));
        bg.on('pointerout', () => bg.setAlpha(1));
    }

    _selBtn(x, y, label, type, value) {
        const isGoals = type === 'goals';
        const current = isGoals ? this.selectedGoals : this.selectedTime;
        const isActive = current === value;
        const fill = isActive ? 0x226622 : 0x333333;

        const bg = this.add.rectangle(x, y, 105, 32, fill)
            .setStrokeStyle(2, isActive ? 0x44ff44 : 0x666666)
            .setInteractive();
        this.add.text(x, y, label, {
            fontSize: '14px', fontFamily: 'Verdana, Arial, sans-serif',
            color: isActive ? '#ffffff' : '#888888'
        }).setOrigin(0.5);

        bg.on('pointerdown', () => {
            if (isGoals) this.selectedGoals = value;
            else this.selectedTime = value;
            this.scene.restart({ mode: this.mode, stadium: this.selectedStadium, goals: this.selectedGoals, time: this.selectedTime });
        });
        bg.on('pointerover', () => bg.setAlpha(0.7));
        bg.on('pointerout', () => bg.setAlpha(1));
    }

    _previewField() {
        if (this._preview) this._preview.destroy();

        const s = STADIUMS[this.selectedStadium];
        const scale = 0.4;
        const pw = s.W * scale;
        const ph = s.H * scale;
        const px = this.scale.width / 2 - pw / 2;
        const py = 355;

        this._preview = this.add.graphics();

        // Grass stripes
        for (let i = 0; i < 8; i++) {
            this._preview.fillStyle(i % 2 === 0 ? s.grass1 : s.grass2, 1);
            this._preview.fillRect(px, py + i * (ph / 8), pw, ph / 8);
        }

        // Lines
        this._preview.lineStyle(2, s.lineColor, 0.9);
        this._preview.strokeRect(px, py, pw, ph);
        this._preview.lineStyle(1, s.lineColor, 0.6);
        this._preview.lineBetween(px + pw / 2, py, px + pw / 2, py + ph);
        this._preview.strokeCircle(px + pw / 2, py + ph / 2, 20);

        // Goal boxes
        const gh = s.GOAL_H * scale;
        const gd = s.GOAL_D * scale;
        const cy = py + ph / 2;
        this._preview.fillStyle(0x3a5530, 1);
        this._preview.fillRect(px - gd, cy - gh / 2, gd, gh);
        this._preview.fillRect(px + pw, cy - gh / 2, gd, gh);
        this._preview.lineStyle(2, s.goalColor1, 0.8);
        this._preview.strokeRect(px - gd, cy - gh / 2, gd, gh);
        this._preview.lineStyle(2, s.goalColor2, 0.8);
        this._preview.strokeRect(px + pw, cy - gh / 2, gd, gh);
    }

    _btn(x, y, label, color, cb) {
        const bg = this.add.rectangle(x, y, 200, 40, Phaser.Display.Color.HexStringToColor(color.replace('#', '')).color, 1)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive();
        this.add.text(x, y, label, {
            fontSize: '18px', fontFamily: 'Verdana, Arial, sans-serif', color: '#ffffff'
        }).setOrigin(0.5);
        bg.on('pointerover', () => bg.setAlpha(0.8));
        bg.on('pointerout', () => bg.setAlpha(1));
        bg.on('pointerdown', cb);
    }

    _startGame() {
        const s = STADIUMS[this.selectedStadium];

        // Update F for the selected stadium
        F.W = s.W;
        F.H = s.H;
        F.GOAL_H = s.GOAL_H;
        F.GOAL_D = s.GOAL_D;
        F.CX = F.X + F.W / 2;
        F.CY = F.Y + F.H / 2;
        F.GOAL_TOP = F.CY - F.GOAL_H / 2;
        F.GOAL_BOT = F.CY + F.GOAL_H / 2;

        // Resize canvas for Big stadium
        if (this.selectedStadium === 'big') {
            game.scale.resize(1200, 600);
        } else {
            game.scale.resize(GAME_W, GAME_H);
        }

        soundManager.whistle();
        this.scene.start('GameScene', {
            mode: this.mode,
            scoreWin: this.selectedGoals,
            timeLimit: this.selectedTime,
            stadium: this.selectedStadium,
        });
    }
}
