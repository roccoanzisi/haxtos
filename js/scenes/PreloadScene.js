window.TextureGenerator = {
    drawPlayerOnCanvas(canvas, r, angleDeg, colors, borderThickness, borderColor, avatarText, avatarColor) {
        const ctx = canvas.getContext('2d');
        const size = canvas.width;
        const cx = size / 2;

        ctx.clearRect(0, 0, size, size);

        // 1. Fill base circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cx, r, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.clip();

        const toCssColor = (c) => {
            if (typeof c === 'number') {
                return '#' + c.toString(16).padStart(6, '0');
            }
            if (typeof c === 'string') {
                if (c.startsWith('#')) return c;
                return '#' + c;
            }
            return '#000000';
        };

        const cssColors = colors.map(toCssColor);
        const cssBorderColor = toCssColor(borderColor);

        if (cssColors.length === 0) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, size, size);
        } else if (cssColors.length === 1) {
            ctx.fillStyle = cssColors[0];
            ctx.fillRect(0, 0, size, size);
        } else {
            // Draw stripes
            ctx.save();
            ctx.translate(cx, cx);
            ctx.rotate((-angleDeg * Math.PI) / 180);
            ctx.translate(-cx, -cx);

            const numStripes = cssColors.length;
            const diameter = r * 2;
            const stripeW = diameter / numStripes;
            const startX = cx - r;

            for (let i = 0; i < numStripes; i++) {
                ctx.fillStyle = cssColors[i];
                const x0 = startX + i * stripeW;
                const x1 = startX + (i + 1) * stripeW;
                ctx.fillRect(x0 - 0.5, cx - r, (x1 - x0) + 0.5, diameter);
            }
            ctx.restore();
        }

        ctx.restore();

        // 2. Draw border
        ctx.strokeStyle = cssBorderColor;
        ctx.lineWidth = borderThickness;
        ctx.beginPath();
        ctx.arc(cx, cx, r, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.stroke();

        // 3. Draw avatar text (Haxball style inside the circle)
        // Font verified from game-min.js: "900 34px 'Arial Black','Arial Bold',Gadget,sans-serif"
        // (34px is relative to Haxball's own disc canvas; scaled down to fit ours).
        if (avatarText) {
            ctx.font = "900 18px 'Arial Black', 'Arial Bold', Gadget, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = toCssColor(avatarColor || '#ffffff');
            ctx.fillText(avatarText, cx, cx);
        }
    }
};

class PreloadScene extends Phaser.Scene {
    constructor() { super('PreloadScene'); }

    create() {
        // Haxball colors verified by sampling pixels from a real haxball.com/play
        // screenshot: disc red is #E56E56 (not pure red) and ball is pure white.
        // Blue is cross-checked against the same game-min.js constant batch as red.
        this._makeBall('ball', 10, 2);
        // Normal: borde negro (Haxball default)
        this._makeCircle('player_blue', 15, 0x098BC3, 0x000000, 2);
        this._makeCircle('player_red',  15, 0xE56E56, 0x000000, 2);
        this._makeCircle('player_blue2',15, 0x076C97, 0x000000, 2);
        this._makeCircle('player_red2', 15, 0xB75845, 0x000000, 2);
        // Kicking: borde blanco grueso (Haxball kicking state)
        this._makeCircle('kick_blue',   15, 0x098BC3, 0xFFFFFF, 4);
        this._makeCircle('kick_red',    15, 0xE56E56, 0xFFFFFF, 4);
        this._makeCircle('kick_blue2',  15, 0x076C97, 0xFFFFFF, 4);
        this._makeCircle('kick_red2',   15, 0xB75845, 0xFFFFFF, 4);
        this.scene.start('MenuScene');
    }

    _makeBall(key, r, lineW) {
        const size = (r + lineW) * 2 + 2;
        const cx = size / 2;
        const g = this.make.graphics({ add: false });
        g.fillStyle(0xFFFFFF, 1);
        g.fillCircle(cx, cx, r);
        // Depth shadow — bottom-right (makes it look 3D like Haxball)
        g.fillStyle(0x444444, 0.18);
        g.fillCircle(cx + r * 0.22, cx + r * 0.22, r * 0.68);
        // Inner highlight — top-left
        g.fillStyle(0xFFFFFF, 0.55);
        g.fillCircle(cx - r * 0.27, cx - r * 0.3, r * 0.35);
        g.lineStyle(lineW, 0x000000, 1);
        g.strokeCircle(cx, cx, r);
        g.generateTexture(key, size, size);
        g.destroy();
    }

    _makeCircle(key, r, fill, stroke, lineW) {
        const size = (r + lineW) * 2 + 2;
        const texture = this.textures.createCanvas(key, size, size);
        window.TextureGenerator.drawPlayerOnCanvas(texture.canvas, r, 0, [fill], lineW, stroke);
        texture.refresh();
    }
}
