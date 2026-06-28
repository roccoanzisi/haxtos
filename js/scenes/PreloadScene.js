class PreloadScene extends Phaser.Scene {
    constructor() { super('PreloadScene'); }

    create() {
        // Haxball colors: blue 0x0000F8, red 0xF00000, ball white
        this._makeCircle('ball',        10, 0xFFFFFF, 0x000000, 2);
        // Normal: borde negro (Haxball default)
        this._makeCircle('player_blue', 15, 0x0000F8, 0x000000, 2);
        this._makeCircle('player_red',  15, 0xF00000, 0x000000, 2);
        this._makeCircle('player_blue2',15, 0x0000C0, 0x000000, 2);
        this._makeCircle('player_red2', 15, 0xC00000, 0x000000, 2);
        // Kicking: borde blanco grueso (Haxball kicking state)
        this._makeCircle('kick_blue',   15, 0x0000F8, 0xFFFFFF, 4);
        this._makeCircle('kick_red',    15, 0xF00000, 0xFFFFFF, 4);
        this._makeCircle('kick_blue2',  15, 0x0000C0, 0xFFFFFF, 4);
        this._makeCircle('kick_red2',   15, 0xC00000, 0xFFFFFF, 4);
        this.scene.start('MenuScene');
    }

    _makeCircle(key, r, fill, stroke, lineW) {
        const size = (r + lineW) * 2 + 2;
        const cx = size / 2;
        const g = this.make.graphics({ add: false });
        g.fillStyle(fill, 1);
        g.fillCircle(cx, cx, r);
        g.lineStyle(lineW, stroke, 1);
        g.strokeCircle(cx, cx, r);
        g.generateTexture(key, size, size);
        g.destroy();
    }
}
