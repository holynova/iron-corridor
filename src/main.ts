import Phaser from 'phaser';
import { VIEW } from './core/constants';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene, type GameCallbacks } from './scenes/GameScene';
import { DraftScene } from './scenes/DraftScene';
import { GameOverScene } from './scenes/GameOverScene';
import { RunState } from './systems/RunState';
import { installSession } from './session';

class IronCorridor extends Phaser.Game {
  constructor() {
    super({
      type: Phaser.AUTO,
      parent: 'app',
      width: VIEW.width,
      height: VIEW.height,
      backgroundColor: '#0b0f14',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, zoom: 1 },
      // hard pixels: no smoothing, no fractional scaling
      render: { antialias: false, pixelArt: true, roundPixels: true, mipmapFilter: 'NEAREST' },
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
      // BootScene is first so Phaser auto-boots it; it owns the AudioContext.
      scene: [BootScene, MenuScene, GameScene, DraftScene, GameOverScene],
      banner: false,
    });
  }
}

const game = new IronCorridor();

function goToMenu(): void {
  for (const key of ['game', 'draft', 'gameover'] as const) {
    if (game.scene.isActive(key) || game.scene.isPaused(key)) game.scene.stop(key);
  }
  game.scene.start('menu');
}

function stopMenu(): void {
  if (game.scene.isActive('menu')) game.scene.stop('menu');
}

function launchRun(run: RunState): void {
  // The menu keeps running underneath otherwise, and its full-screen hit
  // areas would swallow clicks meant for the battlefield.
  stopMenu();
  const callbacks: GameCallbacks = {
    onRunEnd: (finished, victory) => {
      const gameScene = game.scene.getScene('game');
      gameScene.scene.stop('game');
      gameScene.scene.start('gameover', {
        run: finished,
        victory,
        onRestart: () => launchRun(new RunState()),
        onMenu: () => goToMenu(),
      });
    },
    onDraft: (activeRun) => {
      if (!game.scene.isActive('game')) return;
      const gameScene = game.scene.getScene('game');
      game.scene.pause('game');
      gameScene.scene.launch('draft', {
        run: activeRun,
        returnTo: 'game',
        resolve: () => {
          /* GameScene.resumeFromDraft handles progression */
        },
      });
    },
  };
  game.scene.start('game', { run, callbacks });
}

installSession({ launch: launchRun, menu: goToMenu });

// Debug/automation hook: lets tooling inspect and drive a live run.
(window as unknown as Record<string, unknown>).__game = game;
