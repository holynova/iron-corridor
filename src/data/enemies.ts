/**
 * Enemy roster.
 *
 * The four hull classes line up with the classic console cast — a plain grey
 * tank, a fast white one, a green marksman and a pink armoured one — so the
 * silhouette alone tells you what you are about to fight.
 */

export type EnemyKind = 'scout' | 'gunner' | 'heavy' | 'sniper' | 'charger' | 'swarmer' | 'turret' | 'boss';

/** Which sprite sheet this unit uses. */
export type HullClass = 'basic' | 'fast' | 'power' | 'armor' | 'boss';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hull: HullClass;
  hp: number;
  speed: number;
  /** shells per trigger pull */
  burst: number;
  fireInterval: number;
  bulletSpeed: number;
  bulletDamage: number;
  range: number;
  preferredRange: number;
  turnRate: number;
  contactDamage: number;
  score: number;
  scrap: number;
  xp: number;
  bulletColor: number;
  behaviour: 'chase' | 'strafe' | 'rush' | 'snipe' | 'swarm' | 'hold';
  hpPerDepth: number;
  dmgPerDepth: number;
  weight: number;
  minDepth: number;
}

const D = Math.PI / 180;

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  scout: {
    kind: 'scout', name: '侦察兵', hull: 'basic', hp: 26, speed: 132,
    burst: 1, fireInterval: 1.5, bulletSpeed: 430, bulletDamage: 7,
    range: BLOCKS(9), preferredRange: BLOCKS(5), turnRate: 4.4,
    contactDamage: 8, score: 60, scrap: 3, xp: 4, bulletColor: 0xfcfcfc,
    behaviour: 'strafe', hpPerDepth: 4.5, dmgPerDepth: 0.9, weight: 100, minDepth: 1,
  },
  gunner: {
    kind: 'gunner', name: '炮手', hull: 'power', hp: 52, speed: 104,
    burst: 3, fireInterval: 1.9, bulletSpeed: 400, bulletDamage: 9,
    range: BLOCKS(10), preferredRange: BLOCKS(6), turnRate: 3.2,
    contactDamage: 11, score: 110, scrap: 5, xp: 7, bulletColor: 0xfcd424,
    behaviour: 'strafe', hpPerDepth: 7, dmgPerDepth: 1.2, weight: 78, minDepth: 1,
  },
  heavy: {
    kind: 'heavy', name: '重装', hull: 'armor', hp: 130, speed: 84,
    burst: 2, fireInterval: 2.3, bulletSpeed: 340, bulletDamage: 14,
    range: BLOCKS(9), preferredRange: BLOCKS(5), turnRate: 2.2,
    contactDamage: 18, score: 240, scrap: 11, xp: 14, bulletColor: 0xf8b8f8,
    behaviour: 'chase', hpPerDepth: 12, dmgPerDepth: 1.6, weight: 48, minDepth: 2,
  },
  sniper: {
    kind: 'sniper', name: '狙击手', hull: 'fast', hp: 40, speed: 124,
    burst: 1, fireInterval: 2.6, bulletSpeed: 700, bulletDamage: 18,
    range: BLOCKS(14), preferredRange: BLOCKS(11), turnRate: 3.6,
    contactDamage: 9, score: 170, scrap: 8, xp: 11, bulletColor: 0xbcfcfc,
    behaviour: 'snipe', hpPerDepth: 6, dmgPerDepth: 1.7, weight: 42, minDepth: 3,
  },
  charger: {
    kind: 'charger', name: '冲锋者', hull: 'fast', hp: 58, speed: 210,
    burst: 2, fireInterval: 2.1, bulletSpeed: 480, bulletDamage: 8,
    range: BLOCKS(6), preferredRange: BLOCKS(2.5), turnRate: 5,
    contactDamage: 15, score: 150, scrap: 7, xp: 10, bulletColor: 0xe45820,
    behaviour: 'rush', hpPerDepth: 7.5, dmgPerDepth: 1.3, weight: 58, minDepth: 2,
  },
  swarmer: {
    kind: 'swarmer', name: '蜂群', hull: 'basic', hp: 15, speed: 190,
    burst: 1, fireInterval: 2.6, bulletSpeed: 400, bulletDamage: 4,
    range: BLOCKS(5.5), preferredRange: BLOCKS(4), turnRate: 5.4,
    contactDamage: 5, score: 40, scrap: 2, xp: 3, bulletColor: 0xfce0a8,
    behaviour: 'swarm', hpPerDepth: 2.2, dmgPerDepth: 0.6, weight: 66, minDepth: 4,
  },
  turret: {
    kind: 'turret', name: '炮台', hull: 'power', hp: 96, speed: 0,
    burst: 4, fireInterval: 1.7, bulletSpeed: 380, bulletDamage: 8,
    range: BLOCKS(11), preferredRange: BLOCKS(9), turnRate: 2.6,
    contactDamage: 12, score: 130, scrap: 6, xp: 9, bulletColor: 0xfcd424,
    behaviour: 'hold', hpPerDepth: 8, dmgPerDepth: 1.1, weight: 34, minDepth: 5,
  },
  boss: {
    kind: 'boss', name: '钢铁霸主', hull: 'boss', hp: 900, speed: 76,
    burst: 5, fireInterval: 1.15, bulletSpeed: 420, bulletDamage: 14,
    range: BLOCKS(13), preferredRange: BLOCKS(7), turnRate: 1.8,
    contactDamage: 30, score: 1600, scrap: 70, xp: 120, bulletColor: 0xe45820,
    behaviour: 'chase', hpPerDepth: 150, dmgPerDepth: 2.2, weight: 0, minDepth: 1,
  },
};

void D;

/** Express a range in blocks. */
function BLOCKS(n: number): number {
  return n * 48;
}

export function enemyPool(depth: number): EnemyDef[] {
  return Object.values(ENEMIES).filter((e) => e.kind !== 'boss' && e.minDepth <= depth + 1);
}

export function bossForDepth(depth: number): EnemyDef {
  const base = ENEMIES.boss;
  if (depth < 10) return base;
  if (depth < 20) return { ...base, name: '钢铁霸主 II · 重装', hp: base.hp + 700, bulletDamage: base.bulletDamage + 4, speed: base.speed + 8 };
  return { ...base, name: '终焉协议 · 泰坦', hp: base.hp + 1900, bulletDamage: base.bulletDamage + 9, speed: base.speed + 16 };
}

export function scaledStats(def: EnemyDef, depth: number) {
  return {
    hp: Math.round(def.hp + def.hpPerDepth * (depth - 1)),
    bulletDamage: def.bulletDamage + def.dmgPerDepth * (depth - 1),
    contactDamage: def.contactDamage + def.dmgPerDepth * 0.6 * (depth - 1),
    fireInterval: Math.max(0.5, def.fireInterval - Math.min(0.6, depth * 0.03)),
  };
}
