const STADIUMS = {
    classic: {
        name: 'Classic',
        canvasW: 1000, canvasH: 560,
        W: 740, H: 340, GOAL_H: 128, GOAL_D: 30,
        camW: 420, camH: 200,
        bgColor: 0x4a6741, goalBgColor: 0x3a5530,
        grass1: 0x718C5A, grass2: 0x7A9660,
        lineColor: 0xC7E6BD,
        goalColor1: 0xCCCCFF, goalColor2: 0xFFCCCC,
    },
    big: {
        name: 'Big',
        canvasW: 1200, canvasH: 600,
        W: 1100, H: 480, GOAL_H: 180, GOAL_D: 30,
        camW: 600, camH: 300,
        bgColor: 0x4a6741, goalBgColor: 0x3a5530,
        grass1: 0x718C5A, grass2: 0x7A9660,
        lineColor: 0xC7E6BD,
        goalColor1: 0xCCCCFF, goalColor2: 0xFFCCCC,
    },
    hockey: {
        name: 'Hockey',
        canvasW: 1000, canvasH: 560,
        W: 740, H: 340, GOAL_H: 136, GOAL_D: 30,
        camW: 420, camH: 204,
        bgColor: 0x1a1a1a, goalBgColor: 0x222222,
        grass1: 0x555555, grass2: 0x505050,
        lineColor: 0xE9CC6E,
        goalColor1: 0xCCCCFF, goalColor2: 0xFFCCCC,
    },
    big_hockey: {
        name: 'Big Hockey',
        canvasW: 1200, canvasH: 600,
        W: 1100, H: 480, GOAL_H: 180, GOAL_D: 60,
        camW: 600, camH: 300,
        bgColor: 0x1a1a1a, goalBgColor: 0x222222,
        grass1: 0x555555, grass2: 0x505050,
        lineColor: 0xE9CC6E,
        goalColor1: 0xCCCCFF, goalColor2: 0xFFCCCC,
    },
    rounded: {
        name: 'Rounded',
        canvasW: 1000, canvasH: 560,
        W: 740, H: 340, GOAL_H: 128, GOAL_D: 30,
        camW: 420, camH: 200,
        bgColor: 0x4a6741, goalBgColor: 0x3a5530,
        grass1: 0x718C5A, grass2: 0x7A9660,
        lineColor: 0xC7E6BD,
        goalColor1: 0xCCCCFF, goalColor2: 0xFFCCCC,
        cornerRadius: 50,
    },
};

class ConfigScene extends Phaser.Scene {
    constructor() { super('ConfigScene'); }

    init(data) {
        this.mode = (data && data.mode) || 'local1v1';
        this.selectedStadium = (data && data.stadium) || 'classic';
        this.selectedGoals = (data && data.goals !== undefined) ? data.goals : 7;
        this.selectedTime = (data && data.time !== undefined) ? data.time : 3 * 60;
        this.goalOptions = [
            { label: '3', value: 3 },
            { label: '5', value: 5 },
            { label: '7', value: 7 },
            { label: '∞', value: 0 },
        ];
        this.timeOptions = [
            { label: '2 min', value: 2 * 60 },
            { label: '3 min', value: 3 * 60 },
            { label: '5 min', value: 5 * 60 },
            { label: '∞', value: 0 },
        ];
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        this.add.rectangle(W / 2, H / 2, W, H, 0x111111, 0.92);

        this.add.text(W / 2, 28, 'CONFIGURAR PARTIDA', {
            fontSize: '26px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#ffffff', stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5);

        // Stadium selector — row 1: Classic, Big, Hockey / row 2: Big Hockey, Rounded
        this.add.text(W / 2, 62, 'Estadio', {
            fontSize: '15px', fontFamily: 'Verdana, Arial, sans-serif', color: '#aaa'
        }).setOrigin(0.5);

        const stadKeys = Object.keys(STADIUMS);
        const row1 = stadKeys.slice(0, 3);
        const row2 = stadKeys.slice(3);

        row1.forEach((key, i) => {
            const s = STADIUMS[key];
            this._stadBtn(W / 2 - 155 + i * 155, 88, s.name, s.grass1, s.lineColor, key);
        });
        row2.forEach((key, i) => {
            const s = STADIUMS[key];
            this._stadBtn(W / 2 - 78 + i * 155, 118, s.name, s.grass1, s.lineColor, key);
        });

        // Score selector
        this.add.text(W / 2, 152, 'Goles para ganar', {
            fontSize: '15px', fontFamily: 'Verdana, Arial, sans-serif', color: '#aaa'
        }).setOrigin(0.5);

        this.goalOptions.forEach((opt, i) => {
            this._selBtn(W / 2 - 175 + i * 115, 180, opt.label, 'goals', opt.value);
        });

        // Time selector
        this.add.text(W / 2, 220, 'Duración', {
            fontSize: '15px', fontFamily: 'Verdana, Arial, sans-serif', color: '#aaa'
        }).setOrigin(0.5);

        this.timeOptions.forEach((opt, i) => {
            this._selBtn(W / 2 - 175 + i * 115, 248, opt.label, 'time', opt.value);
        });

        // Preview
        this.add.text(W / 2, 285, 'Vista previa', {
            fontSize: '13px', fontFamily: 'Verdana, Arial, sans-serif', color: '#888'
        }).setOrigin(0.5);

        this._previewField();

        // Camera hint
        this.add.text(W / 2, H - 82, 'En juego: teclas 1 / 2 / 3 cambian el ángulo de cámara', {
            fontSize: '11px', fontFamily: 'Verdana, Arial, sans-serif', color: '#666'
        }).setOrigin(0.5);

        // Start button
        this._btn(W / 2, H - 55, 'JUGAR', '#228833', () => this._startGame());

        // Back
        this._btn(W / 2, H - 16, 'Volver al menú', '#444444', () => this.scene.start('MenuScene'));
    }

    _stadBtn(x, y, label, color, lineColor, key) {
        const isActive = this.selectedStadium === key;
        const hexColor = Phaser.Display.Color.HexStringToColor(
            color.toString(16).padStart(6, '0')
        ).color;
        const bg = this.add.rectangle(x, y, 138, 26, hexColor, 1)
            .setStrokeStyle(isActive ? 3 : 1, isActive ? 0xffffff : lineColor, 1)
            .setInteractive();
        this.add.text(x, y, label, {
            fontSize: '12px', fontFamily: 'Verdana, Arial, sans-serif',
            color: '#ffffff', stroke: '#000', strokeThickness: 3
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

        const bg = this.add.rectangle(x, y, 100, 28, fill)
            .setStrokeStyle(2, isActive ? 0x44ff44 : 0x666666)
            .setInteractive();
        this.add.text(x, y, label, {
            fontSize: '13px', fontFamily: 'Verdana, Arial, sans-serif',
            color: isActive ? '#ffffff' : '#888888'
        }).setOrigin(0.5);

        bg.on('pointerdown', () => {
            if (isGoals) this.selectedGoals = value;
            else this.selectedTime = value;
            this.scene.restart({
                mode: this.mode, stadium: this.selectedStadium,
                goals: this.selectedGoals, time: this.selectedTime
            });
        });
        bg.on('pointerover', () => bg.setAlpha(0.7));
        bg.on('pointerout', () => bg.setAlpha(1));
    }

    _previewField() {
        if (this._preview) this._preview.destroy();

        const s = STADIUMS[this.selectedStadium];
        const scale = 0.33;
        const pw = s.W * scale;
        const ph = s.H * scale;
        const px = this.scale.width / 2 - pw / 2;
        const py = 298;

        this._preview = this.add.graphics();

        for (let i = 0; i < 8; i++) {
            this._preview.fillStyle(i % 2 === 0 ? s.grass1 : s.grass2, 1);
            this._preview.fillRect(px, py + i * (ph / 8), pw, ph / 8);
        }

        this._preview.lineStyle(2, s.lineColor, 0.9);
        this._preview.strokeRect(px, py, pw, ph);
        this._preview.lineStyle(1, s.lineColor, 0.6);
        this._preview.lineBetween(px + pw / 2, py, px + pw / 2, py + ph);
        this._preview.strokeCircle(px + pw / 2, py + ph / 2, 16);

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

        // Corner radius indicator for rounded
        if (s.cornerRadius) {
            this._preview.lineStyle(1, s.lineColor, 0.4);
            const cr = s.cornerRadius * scale;
            this._preview.strokeCircle(px + cr, py + cr, cr);
            this._preview.strokeCircle(px + pw - cr, py + cr, cr);
            this._preview.strokeCircle(px + cr, py + ph - cr, cr);
            this._preview.strokeCircle(px + pw - cr, py + ph - cr, cr);
        }
    }

    _btn(x, y, label, color, cb) {
        const bg = this.add.rectangle(
            x, y, 200, 36,
            Phaser.Display.Color.HexStringToColor(color.replace('#', '')).color, 1
        ).setStrokeStyle(2, 0xffffff).setInteractive();
        this.add.text(x, y, label, {
            fontSize: '16px', fontFamily: 'Verdana, Arial, sans-serif', color: '#ffffff'
        }).setOrigin(0.5);
        bg.on('pointerover', () => bg.setAlpha(0.8));
        bg.on('pointerout', () => bg.setAlpha(1));
        bg.on('pointerdown', cb);
    }

    _startGame() {
        const s = STADIUMS[this.selectedStadium];

        // Resize canvas first
        game.scale.resize(s.canvasW, s.canvasH);

        // Recalculate F — margins = (canvas - field) / 2
        F.W = s.W;
        F.H = s.H;
        F.X = Math.floor((s.canvasW - s.W) / 2);
        F.Y = Math.floor((s.canvasH - s.H) / 2);
        F.GOAL_H = s.GOAL_H;
        F.GOAL_D = s.GOAL_D;
        F.WALL_T = 22;
        F.CX = F.X + F.W / 2;
        F.CY = F.Y + F.H / 2;
        F.GOAL_TOP = F.CY - F.GOAL_H / 2;
        F.GOAL_BOT = F.CY + F.GOAL_H / 2;
        F.OUTER_X_MIN = F.CX - s.camW;
        F.OUTER_X_MAX = F.CX + s.camW;
        F.OUTER_Y_MIN = F.CY - s.camH;
        F.OUTER_Y_MAX = F.CY + s.camH;

        soundManager.whistle();
        this.scene.start('GameScene', {
            mode: this.mode,
            scoreWin: this.selectedGoals,
            timeLimit: this.selectedTime,
            stadium: this.selectedStadium,
        });
    }
}
