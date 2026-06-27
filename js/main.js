const GAME_W = 1000;
const GAME_H = 560;

// Haxball Classic exact dimensions (pixels = Haxball units)
// ballArea: 740x340, goal: 128, post radius: 8
const F = {
    X: 130, Y: 110,
    W: 740, H: 340,
    GOAL_H: 128,
    GOAL_D: 30,
    WALL_T: 22,
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
    input: { keyboard: true },
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false, fps: 120 }
    },
    scene: [PreloadScene, MenuScene, ConfigScene, OnlineScene, GameScene, GoalScene, WinScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
});
