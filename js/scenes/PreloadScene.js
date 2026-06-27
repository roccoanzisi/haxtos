class PreloadScene extends Phaser.Scene {
    constructor() { super('PreloadScene'); }

    create() {
        this._makeCircle('ball', 15, 0xeeeeee, 0x999999, 2);
        this._makeCircle('player_blue', 22, 0x2255ee, 0xffffff, 3);
        this._makeCircle('player_red', 22, 0xee2222, 0xffffff, 3);
        this._makeCircle('player_blue2', 22, 0x1133aa, 0xaaaaff, 3);
        this._makeCircle('player_red2', 22, 0xaa1111, 0xffaaaa, 3);

        this._makeCircle('kick_blue', 24, 0x4477ff, 0xffffff, 2);
        this._makeCircle('kick_red', 24, 0xff4444, 0xffffff, 2);
        this._makeCircle('kick_blue2', 24, 0x3355cc, 0xaaaaff, 2);
        this._makeCircle('kick_red2', 24, 0xcc3333, 0xffaaaa, 2);

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
