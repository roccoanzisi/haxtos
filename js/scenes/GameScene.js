// ─── Field constants ───────────────────────────────────────────────
const F = {
    X: 60, Y: 40,          // field top-left corner
    W: 780, H: 460,        // field size
    GOAL_H: 140,           // goal opening height
    GOAL_D: 65,            // goal depth (how far it sticks out)
    WALL_T: 14,            // wall thickness
};
F.CX = F.X + F.W / 2;
F.CY = F.Y + F.H / 2;
F.GOAL_TOP = F.CY - F.GOAL_H / 2;
F.GOAL_BOT = F.CY + F.GOAL_H / 2;

const P_RADIUS = 22;
const B_RADIUS = 14;
const P_SPEED  = 420;
const P_DRAG   = 700;
const SCORE_WIN = 7;
const GAME_TIME = 3 * 60; // seconds

// ─── GameScene ────────────────────────────────────────────────────
class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    init(data) {
        this.mode = (data && data.mode) || 'local';
        this.score = { blue: 0, red: 0 };
        this.timeLeft = GAME_TIME;
        this.paused = false;
        this.goalLock = false;
    }

    create() {
        this._drawField();
        this._buildWalls();
        this._spawnEntities();
        this._setupInput();
        this._setupCollisions();
        this._buildHUD();

        // Timer event
        this.timerEvent = this.time.addEvent({
            delay: 1000,
            repeat: GAME_TIME - 1,
            callback: () => {
                if (this.paused) return;
                this.timeLeft = Math.max(0, this.timeLeft - 1);
                this._updateHUD();
                if (this.timeLeft === 0) this._endGame();
            }
        });
    }

    // ── Field drawing ──────────────────────────────────────────────
    _drawField() {
        const g = this.add.graphics();

        // Pitch stripes
        for (let i = 0; i < 8; i++) {
            g.fillStyle(i % 2 === 0 ? 0x2e7c2e : 0x2a722a, 1);
            g.fillRect(F.X, F.Y + i * (F.H / 8), F.W, F.H / 8);
        }

        // Left goal box
        g.fillStyle(0x247024, 1);
        g.fillRect(F.X - F.GOAL_D, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);

        // Right goal box
        g.fillStyle(0x247024, 1);
        g.fillRect(F.X + F.W, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);

        // Field border
        g.lineStyle(3, 0xffffff, 0.9);
        g.strokeRect(F.X, F.Y, F.W, F.H);

        // Center line
        g.lineStyle(2, 0xffffff, 0.7);
        g.lineBetween(F.CX, F.Y, F.CX, F.Y + F.H);

        // Center circle
        g.strokeCircle(F.CX, F.CY, 65);

        // Center dot
        g.fillStyle(0xffffff, 0.8);
        g.fillCircle(F.CX, F.CY, 4);

        // Penalty arcs
        g.lineStyle(2, 0xffffff, 0.5);
        g.strokeCircle(F.X + 80, F.CY, 50);
        g.strokeCircle(F.X + F.W - 80, F.CY, 50);

        // Goal lines (colored)
        g.lineStyle(4, 0x4466ff, 1);
        g.lineBetween(F.X - F.GOAL_D, F.GOAL_TOP, F.X - F.GOAL_D, F.GOAL_BOT);
        g.lineStyle(4, 0xff4444, 1);
        g.lineBetween(F.X + F.W + F.GOAL_D, F.GOAL_TOP, F.X + F.W + F.GOAL_D, F.GOAL_BOT);

        // Goal post outlines
        g.lineStyle(4, 0xffffff, 1);
        // Left goal
        g.strokeRect(F.X - F.GOAL_D, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
        // Right goal
        g.strokeRect(F.X + F.W, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
    }

    // ── Static walls ───────────────────────────────────────────────
    _buildWalls() {
        this.walls = this.physics.add.staticGroup();

        const addWall = (x, y, w, h) => {
            const r = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0);
            this.physics.add.existing(r, true);
            this.walls.add(r);
        };

        const T = F.WALL_T;
        const R = F.X + F.W;  // right field edge x

        // Top wall (full width)
        addWall(F.X - T, F.Y - T, F.W + T * 2, T);
        // Bottom wall (full width)
        addWall(F.X - T, F.Y + F.H, F.W + T * 2, T);

        // Left wall – top segment (above goal)
        addWall(F.X - T, F.Y - T, T, F.GOAL_TOP - F.Y + T);
        // Left wall – bottom segment (below goal)
        addWall(F.X - T, F.GOAL_BOT, T, (F.Y + F.H) - F.GOAL_BOT);

        // Right wall – top segment
        addWall(R, F.Y - T, T, F.GOAL_TOP - F.Y + T);
        // Right wall – bottom segment
        addWall(R, F.GOAL_BOT, T, (F.Y + F.H) - F.GOAL_BOT);

        // Left goal – back wall
        addWall(F.X - F.GOAL_D - T, F.GOAL_TOP, T, F.GOAL_H);
        // Left goal – top post
        addWall(F.X - F.GOAL_D - T, F.GOAL_TOP - T, F.GOAL_D + T, T);
        // Left goal – bottom post
        addWall(F.X - F.GOAL_D - T, F.GOAL_BOT, F.GOAL_D + T, T);

        // Right goal – back wall
        addWall(R + F.GOAL_D, F.GOAL_TOP, T, F.GOAL_H);
        // Right goal – top post
        addWall(R, F.GOAL_TOP - T, F.GOAL_D + T, T);
        // Right goal – bottom post
        addWall(R, F.GOAL_BOT, F.GOAL_D + T, T);
    }

    // ── Entities ───────────────────────────────────────────────────
    _spawnEntities() {
        this._spawnBall();
        this._spawnPlayers();
    }

    _spawnBall() {
        this.ball = this.physics.add.image(F.CX, F.CY, 'ball');
        this.ball.setCircle(B_RADIUS, 1, 1);
        this.ball.setBounce(0.72);
        this.ball.setDrag(38);
        this.ball.setMaxVelocity(950);
        this.ball.setDepth(10);
    }

    _spawnPlayers() {
        this.p1 = this._makePlayer(F.X + 130, F.CY, 'player_blue');
        this.p2 = this._makePlayer(F.X + F.W - 130, F.CY, 'player_red');
    }

    _makePlayer(x, y, key) {
        const p = this.physics.add.image(x, y, key);
        p.setCircle(P_RADIUS, 1, 1);
        p.setBounce(0.2);
        p.setDrag(P_DRAG);
        p.setMaxVelocity(P_SPEED);
        p.setDepth(5);
        return p;
    }

    // ── Input ──────────────────────────────────────────────────────
    _setupInput() {
        const kb = this.input.keyboard;
        this.keys1 = kb.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' });
        this.keys2 = kb.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' });

        kb.on('keydown-ESCAPE', () => {
            this.scene.start('MenuScene');
        });
    }

    // ── Collisions ─────────────────────────────────────────────────
    _setupCollisions() {
        // Ball bounces off walls
        this.physics.add.collider(this.ball, this.walls);

        // Players bounce off walls
        this.physics.add.collider(this.p1, this.walls);
        this.physics.add.collider(this.p2, this.walls);

        // Players collide with each other
        this.physics.add.collider(this.p1, this.p2);
    }

    // ── HUD ────────────────────────────────────────────────────────
    _buildHUD() {
        const style = (color) => ({
            fontSize: '34px', fontFamily: 'Arial Black, Impact, sans-serif',
            color, stroke: '#000', strokeThickness: 5
        });

        this.hudBlue = this.add.text(F.CX - 80, 8, '0', style('#88aaff')).setOrigin(0.5, 0).setDepth(20);
        this.hudRed  = this.add.text(F.CX + 80, 8, '0', style('#ff8888')).setOrigin(0.5, 0).setDepth(20);

        this.add.text(F.CX, 8, '–', {
            fontSize: '28px', fontFamily: 'Arial, sans-serif', color: '#ffffff', stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5, 0).setDepth(20);

        this.hudTime = this.add.text(F.CX, 510, this._fmt(this.timeLeft), {
            fontSize: '20px', fontFamily: 'Arial, sans-serif', color: '#eeeeee', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5, 0).setDepth(20);

        // Team labels
        this.add.text(F.X + 20, 8, 'AZUL', {
            fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#88aaff', stroke: '#000', strokeThickness: 3
        }).setDepth(20);
        this.add.text(F.X + F.W - 20, 8, 'ROJO', {
            fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#ff8888', stroke: '#000', strokeThickness: 3
        }).setOrigin(1, 0).setDepth(20);

        // ESC hint
        this.add.text(900 - 8, 510, 'ESC: Menú', {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#888888'
        }).setOrigin(1, 0).setDepth(20);
    }

    _updateHUD() {
        this.hudBlue.setText(String(this.score.blue));
        this.hudRed.setText(String(this.score.red));
        this.hudTime.setText(this._fmt(this.timeLeft));
    }

    _fmt(secs) {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    // ── Update loop ────────────────────────────────────────────────
    update() {
        if (this.paused) return;

        this._movePlayer(this.p1, this.keys1);
        this._movePlayer(this.p2, this.keys2);
        this._handleBallContact(this.p1);
        this._handleBallContact(this.p2);
        this._checkGoal();
    }

    _movePlayer(player, keys) {
        const vx = (keys.right.isDown ? 1 : 0) - (keys.left.isDown ? 1 : 0);
        const vy = (keys.down.isDown  ? 1 : 0) - (keys.up.isDown   ? 1 : 0);

        if (vx !== 0 || vy !== 0) {
            const len = Math.sqrt(vx * vx + vy * vy);
            player.body.velocity.x += (vx / len) * P_SPEED * 0.18;
            player.body.velocity.y += (vy / len) * P_SPEED * 0.18;
        }
    }

    _handleBallContact(player) {
        const dx = this.ball.x - player.x;
        const dy = this.ball.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = P_RADIUS + B_RADIUS + 2;

        if (dist < minDist && dist > 0.1) {
            // Separate
            const nx = dx / dist;
            const ny = dy / dist;
            this.ball.x = player.x + nx * (minDist + 1);
            this.ball.y = player.y + ny * (minDist + 1);

            // Relative velocity along normal
            const rvx = this.ball.body.velocity.x - player.body.velocity.x;
            const rvy = this.ball.body.velocity.y - player.body.velocity.y;
            const relV = rvx * nx + rvy * ny;

            if (relV < 0) { // approaching
                const impulse = -(1 + 0.7) * relV; // restitution 0.7
                const ballMass = 0.3, playerMass = 1;
                const total = ballMass + playerMass;

                this.ball.body.velocity.x   += (impulse * playerMass / total) * nx;
                this.ball.body.velocity.y   += (impulse * playerMass / total) * ny;
                player.body.velocity.x      -= (impulse * ballMass / total) * nx;
                player.body.velocity.y      -= (impulse * ballMass / total) * ny;
            }
        }
    }

    // ── Goal detection ─────────────────────────────────────────────
    _checkGoal() {
        if (this.goalLock) return;
        const bx = this.ball.x;
        const by = this.ball.y;
        const inGoalY = by > F.GOAL_TOP + B_RADIUS && by < F.GOAL_BOT - B_RADIUS;

        const leftBack  = F.X - F.GOAL_D + B_RADIUS;
        const rightBack = F.X + F.W + F.GOAL_D - B_RADIUS;

        if (bx <= leftBack && inGoalY) {
            this._goal('red');
        } else if (bx >= rightBack && inGoalY) {
            this._goal('blue');
        }
    }

    _goal(team) {
        this.goalLock = true;
        this.paused = true;
        this.score[team]++;
        this._updateHUD();

        // Check win
        if (this.score[team] >= SCORE_WIN) {
            this.time.delayedCall(600, () => this._endGame());
            return;
        }

        // Show goal overlay
        this.scene.launch('GoalScene', { team, score: { ...this.score } });

        this.time.delayedCall(2200, () => {
            this.scene.stop('GoalScene');
            this._reset();
            this.paused = false;
            this.goalLock = false;
        });
    }

    _reset() {
        this.ball.setPosition(F.CX, F.CY);
        this.ball.body.reset(F.CX, F.CY);

        this.p1.setPosition(F.X + 130, F.CY);
        this.p1.body.reset(F.X + 130, F.CY);

        this.p2.setPosition(F.X + F.W - 130, F.CY);
        this.p2.body.reset(F.X + F.W - 130, F.CY);
    }

    _endGame() {
        this.paused = true;
        this.timerEvent.remove();
        this.scene.stop('GoalScene');
        this.scene.start('WinScene', { score: { ...this.score }, time: this.timeLeft });
    }
}
