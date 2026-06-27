class PreloadScene extends Phaser.Scene {
    constructor() { super('PreloadScene'); }

    create() {
        // Haxball colors: blue 0x0000F8, red 0xF00000, ball white
        this._makeCircle('ball',        14, 0xFFFFFF, 0x000000, 2);
        this._makeCircle('player_blue', 22, 0x0000F8, 0xFFFFFF, 3);
        this._makeCircle('player_red',  22, 0xF00000, 0xFFFFFF, 3);
        this._makeCircle('player_blue2',22, 0x0000C0, 0xCCCCFF, 3);
        this._makeCircle('player_red2', 22, 0xC00000, 0xFFCCCC, 3);
        this._makeCircle('kick_blue',   24, 0x3333FF, 0xFFFFFF, 2);
        this._makeCircle('kick_red',    24, 0xFF2222, 0xFFFFFF, 2);
        this._makeCircle('kick_blue2',  24, 0x2222DD, 0xCCCCFF, 2);
        this._makeCircle('kick_red2',   24, 0xDD2222, 0xFFCCCC, 2);
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
