const GAME_W = 1000;
const GAME_H = 560;

// Haxball Classic scaled (factor: 880/740 = 1.1892)
// Classic: ballArea 740x340, goal 128, kickoffRadius 75
const F = {
    X: 60, Y: 56,
    W: 880, H: 404,
    GOAL_H: 152,
    GOAL_D: 36,
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
