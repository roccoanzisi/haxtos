const P_RADIUS = 22;
const B_RADIUS = 14;
const P_SPEED  = 260;
const P_DRAG   = 600;
const SCORE_WIN = 7;
const GAME_TIME = 3 * 60;
const KICK_COOLDOWN = 400;
const KICK_POWER = 650;
const WALL_BOUNCE = 0.55;
const POST_BOUNCE = 0.82;

class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    init(data) {
        this.mode = (data && data.mode) || 'local1v1';
        this.score = { blue: 0, red: 0 };
        this.timeLeft = GAME_TIME;
        this.paused = false;
        this.goalLock = false;
        this.is2v2 = this.mode === 'local2v2';

        this.isOnline = this.mode === 'online';
        this.ws = data && data.ws ? data.ws : null;
        this.playerIndex = data && data.playerIndex !== undefined ? data.playerIndex : 0;
        this.isHost = this.playerIndex === 0;
        this.lastKickTime = { blue: 0, red: 0, blue2: 0, red2: 0 };
        this.ballSpin = 0;

        this.serverState = null;
        this.stateHistory = [];
    }

    create() {
        this._forceKick = false;
        this._forceKickRed = false;
        soundManager.startAmbient();
        soundManager.whistle();

        this._drawField();
        this._buildWalls();
        this._spawnEntities();
        this._setupInput();
        this._setupCollisions();
        this._buildHUD();

        this.timerEvent = this.time.addEvent({
            delay: 1000,
            repeat: GAME_TIME - 1,
            callback: () => {
                if (this.paused || this.isOnline && !this.isHost) return;
                this.timeLeft = Math.max(0, this.timeLeft - 1);
                this._updateHUD();
                if (this.timeLeft === 0) this._endGame();
            }
        });

        if (this.isOnline && !this.isHost) {
            this._setupOnlineGuest();
        }
        if (this.isOnline && this.isHost) {
            this._setupOnlineHost();
        }
    }

    _drawField() {
        const g = this.add.graphics();

        for (let i = 0; i < 8; i++) {
            g.fillStyle(i % 2 === 0 ? 0x2e7c2e : 0x2a722a, 1);
            g.fillRect(F.X, F.Y + i * (F.H / 8), F.W, F.H / 8);
        }

        g.fillStyle(0x247024, 1);
        g.fillRect(F.X - F.GOAL_D, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
        g.fillRect(F.X + F.W, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);

        g.lineStyle(3, 0xffffff, 0.9);
        g.strokeRect(F.X, F.Y, F.W, F.H);

        g.lineStyle(2, 0xffffff, 0.7);
        g.lineBetween(F.CX, F.Y, F.CX, F.Y + F.H);
        g.strokeCircle(F.CX, F.CY, 65);
        g.fillStyle(0xffffff, 0.8);
        g.fillCircle(F.CX, F.CY, 4);

        g.lineStyle(2, 0xffffff, 0.5);
        g.strokeCircle(F.X + 80, F.CY, 50);
        g.strokeCircle(F.X + F.W - 80, F.CY, 50);

        g.lineStyle(4, 0x4466ff, 1);
        g.lineBetween(F.X - F.GOAL_D, F.GOAL_TOP, F.X - F.GOAL_D, F.GOAL_BOT);
        g.lineStyle(4, 0xff4444, 1);
        g.lineBetween(F.X + F.W + F.GOAL_D, F.GOAL_TOP, F.X + F.W + F.GOAL_D, F.GOAL_BOT);

        g.lineStyle(4, 0xffffff, 1);
        g.strokeRect(F.X - F.GOAL_D, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
        g.strokeRect(F.X + F.W, F.GOAL_TOP, F.GOAL_D, F.GOAL_H);
    }

    _buildWalls() {
        this.walls = this.physics.add.staticGroup();
        this.postWalls = this.physics.add.staticGroup();

        const addWall = (x, y, w, h, isPost) => {
            const r = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0);
            this.physics.add.existing(r, true);
            (isPost ? this.postWalls : this.walls).add(r);
        };

        const T = F.WALL_T;
        const R = F.X + F.W;

        addWall(F.X - T, F.Y - T, F.W + T * 2, T, false);
        addWall(F.X - T, F.Y + F.H, F.W + T * 2, T, false);
        addWall(F.X - T, F.Y - T, T, F.GOAL_TOP - F.Y + T, false);
        addWall(F.X - T, F.GOAL_BOT, T, (F.Y + F.H) - F.GOAL_BOT, false);
        addWall(R, F.Y - T, T, F.GOAL_TOP - F.Y + T, false);
        addWall(R, F.GOAL_BOT, T, (F.Y + F.H) - F.GOAL_BOT, false);

        addWall(F.X - F.GOAL_D - T, F.GOAL_TOP, T, F.GOAL_H, true);
        addWall(F.X - F.GOAL_D - T, F.GOAL_TOP - T, F.GOAL_D + T, T, true);
        addWall(F.X - F.GOAL_D - T, F.GOAL_BOT, F.GOAL_D + T, T, true);
        addWall(R + F.GOAL_D, F.GOAL_TOP, T, F.GOAL_H, true);
        addWall(R, F.GOAL_TOP - T, F.GOAL_D + T, T, true);
        addWall(R, F.GOAL_BOT, F.GOAL_D + T, T, true);

        this.postBodies = [];
        this.postWalls.getChildren().forEach(w => this.postBodies.push(w.body));
    }

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
        this.players = {};

        this.players.blue = this._makePlayer(F.X + 150, F.CY, 'player_blue');
        this.players.red = this._makePlayer(F.X + F.W - 150, F.CY, 'player_red');

        if (this.is2v2) {
            this.players.blue2 = this._makePlayer(F.X + 70, F.CY - 80, 'player_blue2');
            this.players.red2 = this._makePlayer(F.X + F.W - 70, F.CY + 80, 'player_red2');
        }
    }

    _makePlayer(x, y, key) {
        const p = this.physics.add.image(x, y, key);
        p.setCircle(P_RADIUS, 1, 1);
        p.setBounce(0.2);
        p.setDrag(P_DRAG);
        p.setMaxVelocity(P_SPEED);
        p.setDepth(5);
        p._kickTexture = key.replace('player_', 'kick_');
        return p;
    }

    _setupInput() {
        const kb = this.input.keyboard;

        this.keys1 = kb.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' });
        this.keys2 = kb.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' });
        this.kick1 = kb.addKey('SPACE');
        this.kick2 = kb.addKey('SHIFT');

        if (this.is2v2) {
            this.keys3 = kb.addKeys({ up: 'T', down: 'G', left: 'F', right: 'H' });
            this.keys4 = kb.addKeys({ up: 'I', down: 'K', left: 'J', right: 'L' });
        }

        kb.on('keydown-ESCAPE', () => {
            if (this.isOnline && this.ws) this.ws.close();
            this.scene.start('MenuScene');
        });
    }

    _setupCollisions() {
        this.physics.add.collider(this.ball, this.walls, () => this._wallBounce());
        this.physics.add.collider(this.ball, this.postWalls, () => this._postBounce());

        const allPlayers = Object.values(this.players);
        allPlayers.forEach(p => {
            this.physics.add.collider(p, this.walls);
            this.physics.add.collider(p, this.postWalls);
        });

        for (let i = 0; i < allPlayers.length; i++) {
            for (let j = i + 1; j < allPlayers.length; j++) {
                this.physics.add.collider(allPlayers[i], allPlayers[j]);
            }
        }
    }

    _wallBounce() {
        const v = Math.sqrt(this.ball.body.velocity.x ** 2 + this.ball.body.velocity.y ** 2);
        if (v > 30) soundManager.wallHit(v);
    }

    _postBounce() {
        const v = Math.sqrt(this.ball.body.velocity.x ** 2 + this.ball.body.velocity.y ** 2);
        if (v > 30) soundManager.postHit(v);
    }

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

        this.hudTime = this.add.text(F.CX, GAME_H - 35, this._fmt(this.timeLeft), {
            fontSize: '20px', fontFamily: 'Arial, sans-serif', color: '#eeeeee', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5, 0).setDepth(20);

        this.add.text(F.X + 20, 8, 'AZUL', {
            fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#88aaff', stroke: '#000', strokeThickness: 3
        }).setDepth(20);
        this.add.text(F.X + F.W - 20, 8, 'ROJO', {
            fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#ff8888', stroke: '#000', strokeThickness: 3
        }).setOrigin(1, 0).setDepth(20);

        this.shootBlueBtn = this.add.text(15, GAME_H - 35, '⚡SHOOT (ESPACIO)', {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#88aaff', backgroundColor: '#1a2244', padding: { x: 6, y: 3 }
        }).setDepth(20).setInteractive({ useHandCursor: true });
        this.shootBlueBtn.on('pointerdown', () => { this._forceKick = true; });
        this.shootBlueBtn.on('pointerup', () => { this._forceKick = false; });

        this.shootRedBtn = this.add.text(GAME_W - 15 - 105, GAME_H - 35, '⚡SHOOT (SHIFT)', {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#ff8888', backgroundColor: '#2a1a1a', padding: { x: 6, y: 3 }
        }).setDepth(20).setInteractive({ useHandCursor: true });
        this.shootRedBtn.on('pointerdown', () => { this._forceKickRed = true; });
        this.shootRedBtn.on('pointerup', () => { this._forceKickRed = false; });

        let hint = 'ESC: Menú';
        if (this.is2v2) hint = 'A/D: Az1 | F/H: Az2 | ←→: Rj1 | J/L: Rj2 | ESPACIO/SHIFT: Patada';
        this.add.text(GAME_W - 8, 8, hint, {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#888888'
        }).setOrigin(1, 0).setDepth(20);

        if (this.isOnline) {
            const roomLabel = 'Sala: ' + (this.scene.get('OnlineScene') && this.scene.get('OnlineScene').roomCode ? this.scene.get('OnlineScene').roomCode : '—');
            this.add.text(8, GAME_H - 55, roomLabel, {
                fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#66aa66'
            }).setOrigin(0, 0).setDepth(20);
        }
    }

    _updateHUD() {
        this.hudBlue.setText(String(this.score.blue));
        this.hudRed.setText(String(this.score.red));
        this.hudTime.setText(this._fmt(this.timeLeft));

        if (this.shootBlueBtn) {
            this.shootBlueBtn.setAlpha(this.players && this.players.blue && this.players.blue._isKicking ? 0.5 : 1);
        }
        if (this.shootRedBtn) {
            this.shootRedBtn.setAlpha(this.players && this.players.red && this.players.red._isKicking ? 0.5 : 1);
        }
    }

    _fmt(secs) {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    _getInputKeys() {
        const result = {};
        const mapKeys = (keys, prefix) => {
            result[prefix + '_up'] = keys.up.isDown;
            result[prefix + '_down'] = keys.down.isDown;
            result[prefix + '_left'] = keys.left.isDown;
            result[prefix + '_right'] = keys.right.isDown;
        };
        mapKeys(this.keys1, 'k1');
        mapKeys(this.keys2, 'k2');
        if (this.is2v2) {
            mapKeys(this.keys3, 'k3');
            mapKeys(this.keys4, 'k4');
        }
        result.kick1 = this.kick1.isDown;
        result.kick2 = this.kick2.isDown;
        return result;
    }

    update() {
        if (this.paused) return;

        if (this.isOnline) {
            if (this.isHost) {
                this._updateHost();
            } else {
                this._updateGuest();
            }
            return;
        }

        this._movePlayer(this.players.blue, this.keys1, 'blue');
        this.players.blue._isKicking = this.kick1.isDown || this._forceKick;
        this._handleBallContact(this.players.blue, 'blue');

        this._movePlayer(this.players.red, this.keys2, 'red');
        this.players.red._isKicking = this.kick2.isDown || this._forceKickRed;
        this._handleBallContact(this.players.red, 'red');

        if (this.is2v2) {
            this._movePlayer(this.players.blue2, this.keys3, 'blue2');
            this.players.blue2._isKicking = this.kick1.isDown || this._forceKick;
            this._handleBallContact(this.players.blue2, 'blue2');

            this._movePlayer(this.players.red2, this.keys4, 'red2');
            this.players.red2._isKicking = this.kick2.isDown || this._forceKickRed;
            this._handleBallContact(this.players.red2, 'red2');
        }

        this._updateBallSpin();
        this._checkGoal();
    }

    _updateHost() {
        this._movePlayer(this.players.blue, this.keys1, 'blue');
        this.players.blue._isKicking = this.kick1.isDown;
        this._handleBallContact(this.players.blue, 'blue');

        this._movePlayer(this.players.red, this.keys2, 'red');
        this.players.red._isKicking = this.kick2.isDown;
        this._handleBallContact(this.players.red, 'red');

        this._updateBallSpin();
        this._checkGoal();

        this._sendState();
    }

    _updateGuest() {
        const keys = this._getInputKeys();
        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify({ type: 'input', keys }));
        }

        if (this.serverState) {
            this.ball.x = this.serverState.ballX;
            this.ball.y = this.serverState.ballY;
            this.ball.body.velocity.x = this.serverState.ballVX;
            this.ball.body.velocity.y = this.serverState.ballVY;
            this.ball.rotation = this.serverState.ballRot || 0;

            const s = this.serverState.players;
            Object.keys(s).forEach(key => {
                if (this.players[key]) {
                    this.players[key].x = s[key].x;
                    this.players[key].y = s[key].y;
                    this.players[key].body.velocity.x = s[key].vx;
                    this.players[key].body.velocity.y = s[key].vy;
                }
            });
        }

        this._checkGoal();
    }

    _setupOnlineGuest() {
        if (!this.ws) return;
        this.ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'state') {
                this.serverState = msg.data;
            }
            if (msg.type === 'opponent_left') {
                this.status && this.status.setText('El rival se desconectó');
                this.time.delayedCall(1500, () => {
                    this.ws && this.ws.close();
                    this.scene.start('MenuScene');
                });
            }
        };
    }

    _setupOnlineHost() {
        this._guestInputs = {};
        if (!this.ws) return;
        this.ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'input') {
                this._guestInputs = msg.keys;
            }
        };
    }

    _applyGuestInputs() {
        if (!this._guestInputs || Object.keys(this._guestInputs).length === 0) return;
        const g = this._guestInputs;

        const guestPlayer = this.playerIndex === 0 ? 'red' : 'blue';
        const guestPlayer2 = this.playerIndex === 0 ? 'red2' : 'blue2';

        if (this.players[guestPlayer]) {
            const gk = {
                up: g['k2_up'] || false,
                down: g['k2_down'] || false,
                left: g['k2_left'] || false,
                right: g['k2_right'] || false,
            };
            this._movePlayer(this.players[guestPlayer], gk, guestPlayer);
            this.players[guestPlayer]._isKicking = g.kick2 || false;
            this._handleBallContact(this.players[guestPlayer], guestPlayer);
        }

        if (this.is2v2 && this.players[guestPlayer2]) {
            const gk2 = {
                up: g['k4_up'] || false,
                down: g['k4_down'] || false,
                left: g['k4_left'] || false,
                right: g['k4_right'] || false,
            };
            this._movePlayer(this.players[guestPlayer2], gk2, guestPlayer2);
            this.players[guestPlayer2]._isKicking = g.kick2 || false;
            this._handleBallContact(this.players[guestPlayer2], guestPlayer2);
        }
    }

    _sendState() {
        if (!this.ws || this.ws.readyState !== 1) return;
        const state = {
            ballX: this.ball.x,
            ballY: this.ball.y,
            ballVX: this.ball.body.velocity.x,
            ballVY: this.ball.body.velocity.y,
            ballRot: this.ball.rotation,
            players: {}
        };
        Object.keys(this.players).forEach(key => {
            const p = this.players[key];
            state.players[key] = { x: p.x, y: p.y, vx: p.body.velocity.x, vy: p.body.velocity.y };
        });
        this.ws.send(JSON.stringify({ type: 'state', data: state }));
    }

    _movePlayer(player, keys, id) {
        const k = (k) => k && k.isDown !== undefined ? k.isDown : !!k;
        const vx = (k(keys.right) ? 1 : 0) - (k(keys.left) ? 1 : 0);
        const vy = (k(keys.down) ? 1 : 0) - (k(keys.up) ? 1 : 0);

        if (vx !== 0 || vy !== 0) {
            const len = Math.sqrt(vx * vx + vy * vy);
            player.body.velocity.x += (vx / len) * P_SPEED * 0.15;
            player.body.velocity.y += (vy / len) * P_SPEED * 0.15;
        }
    }

    _handleBallContact(player, id) {
        const dx = this.ball.x - player.x;
        const dy = this.ball.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = P_RADIUS + B_RADIUS + 2;

        if (dist < minDist && dist > 0.1) {
            const nx = dx / dist;
            const ny = dy / dist;
            this.ball.x = player.x + nx * (minDist + 1);
            this.ball.y = player.y + ny * (minDist + 1);

            const rvx = this.ball.body.velocity.x - player.body.velocity.x;
            const rvy = this.ball.body.velocity.y - player.body.velocity.y;
            const relV = rvx * nx + rvy * ny;

            if (relV < 0) {
                const restitution = player._isKicking ? 1.3 : 0.7;
                const kickBoost = player._isKicking ? KICK_POWER : 0;
                const impulse = -(1 + restitution) * relV + kickBoost;
                const ballMass = 0.3, playerMass = 1;
                const total = ballMass + playerMass;

                this.ball.body.velocity.x += (impulse * playerMass / total) * nx;
                this.ball.body.velocity.y += (impulse * playerMass / total) * ny;
                player.body.velocity.x -= (impulse * ballMass / total) * nx;
                player.body.velocity.y -= (impulse * ballMass / total) * ny;

                const ballSpeed = Math.sqrt(this.ball.body.velocity.x ** 2 + this.ball.body.velocity.y ** 2);
                if (ballSpeed > 50) soundManager.kick(ballSpeed);
            }
        }
    }

    _updateBallSpin() {
        const vx = this.ball.body.velocity.x;
        const vy = this.ball.body.velocity.y;
        const speed = Math.sqrt(vx * vx + vy * vy);
        this.ballSpin = vx * 0.003;
        this.ball.rotation += this.ballSpin;
    }

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

        soundManager.goal();

        if (this.score[team] >= SCORE_WIN) {
            this.time.delayedCall(600, () => this._endGame());
            return;
        }

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

        this.players.blue.setPosition(F.X + 150, F.CY);
        this.players.blue.body.reset(F.X + 150, F.CY);

        this.players.red.setPosition(F.X + F.W - 150, F.CY);
        this.players.red.body.reset(F.X + F.W - 150, F.CY);

        if (this.is2v2) {
            this.players.blue2.setPosition(F.X + 70, F.CY - 80);
            this.players.blue2.body.reset(F.X + 70, F.CY - 80);

            this.players.red2.setPosition(F.X + F.W - 70, F.CY + 80);
            this.players.red2.body.reset(F.X + F.W - 70, F.CY + 80);
        }
    }

    _endGame() {
        this.paused = true;
        this.timerEvent.remove();
        this.scene.stop('GoalScene');
        soundManager.stopAmbient();

        const winner = this.score.blue > this.score.red ? 'blue' : this.score.red > this.score.blue ? 'red' : null;
        if (winner) soundManager.win();

        this.scene.start('WinScene', { score: { ...this.score }, time: this.timeLeft });
    }
}
