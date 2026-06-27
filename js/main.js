const GAME_W = 1000;
const GAME_H = 560;

const F = {
    X: 60, Y: 45,
    W: 880, H: 470,
    GOAL_H: 140,
    GOAL_D: 65,
    WALL_T: 14,
};
F.CX = F.X + F.W / 2;
F.CY = F.Y + F.H / 2;
F.GOAL_TOP = F.CY - F.GOAL_H / 2;
F.GOAL_BOT = F.CY + F.GOAL_H / 2;

const soundManager = new SoundManager();

const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: GAME_W,
    height: GAME_H,
    backgroundColor: '#111111',
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: [PreloadScene, MenuScene, OnlineScene, GameScene, GoalScene, WinScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
});
