import type { Rng } from '../core/rng';

export type UpgradeKind = 'stat' | 'weapon' | 'trait';

export interface PlayerStats {
  maxHp: number;
  speed: number;
  damage: number;
  fireRate: number; // seconds between shots
  bulletSpeed: number;
  pierce: number;
  spread: number; // degrees, total
  bulletsPerShot: number;
  blastRadius: number; // 0 = single target
  critChance: number;
  critMult: number;
  dashCooldown: number;
  dashCharges: number;
  dashInvuln: number;
  regen: number; // hp/sec
  lifesteal: number; // chance to heal 1 on kill
  ricochet: number; // wall bounce chance
  magnet: number; // pickup radius bonus
  scrapBonus: number;
  thorns: number; // reflect fraction
  critChain: number; // extra crits on kill
  overdrive: number; // fire rate gain while at low hp
  explosiveShells: number;
  homing: number;
  slowAura: number;
  timeSlowOnKill: number;
}

export function baseStats(): PlayerStats {
  return {
    maxHp: 120,
    speed: 268,
    damage: 16,
    fireRate: 0.42,
    bulletSpeed: 1020,
    pierce: 0,
    spread: 0,
    bulletsPerShot: 1,
    blastRadius: 0,
    critChance: 0.05,
    critMult: 2,
    dashCooldown: 2.4,
    dashCharges: 1,
    dashInvuln: 0.28,
    regen: 0,
    lifesteal: 0,
    ricochet: 0,
    magnet: 70,
    scrapBonus: 0,
    thorns: 0,
    critChain: 0,
    overdrive: 0,
    explosiveShells: 0,
    homing: 0,
    slowAura: 0,
    timeSlowOnKill: 0,
  };
}

export interface Upgrade {
  id: string;
  name: string;
  nameEn: string;
  desc: string;
  kind: UpgradeKind;
  icon: string;
  color: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  max: number;
  weight: number;
  requires?: string;
  apply: (s: PlayerStats) => void;
}

const RARITY_WEIGHT: Record<Upgrade['rarity'], number> = {
  common: 100,
  rare: 46,
  epic: 18,
  legendary: 6,
};

function up(u: Omit<Upgrade, 'weight'> & { weight?: number }): Upgrade {
  return { weight: u.weight ?? RARITY_WEIGHT[u.rarity], ...u };
}

export const UPGRADES: readonly Upgrade[] = [
  up({ id: 'caliber', name: '大口径炮弹', nameEn: 'Heavy Caliber', desc: '炮弹伤害 +5', kind: 'stat', icon: '💥', color: 0xffb028, rarity: 'common', max: 8, apply: (s) => { s.damage += 5; } }),
  up({ id: 'loader', name: '快速装填', nameEn: 'Autoloader', desc: '装填时间 -9%', kind: 'stat', icon: '⚡', color: 0x6fe3b0, rarity: 'common', max: 8, apply: (s) => { s.fireRate *= 0.91; } }),
  up({ id: 'engine', name: '推进器', nameEn: 'Thruster', desc: '移动速度 +10%', kind: 'stat', icon: '💨', color: 0x6fe3b0, rarity: 'common', max: 6, apply: (s) => { s.speed *= 1.1; } }),
  up({ id: 'hull', name: '焊接装甲', nameEn: 'Welded Hull', desc: '生命上限 +20 并立即回复 20', kind: 'stat', icon: '🛡', color: 0x6fe3b0, rarity: 'common', max: 8, apply: (s) => { s.maxHp += 20; } }),
  up({ id: 'muzzle', name: '膛线加速', nameEn: 'Rifling', desc: '弹速 +15%', kind: 'stat', icon: '🚀', color: 0xe8eef3, rarity: 'common', max: 5, apply: (s) => { s.bulletSpeed *= 1.15; } }),
  up({ id: 'magnet', name: '磁力吸盘', nameEn: 'Magnet', desc: '拾取范围 +45%', kind: 'stat', icon: '🧲', color: 0xe8eef3, rarity: 'common', max: 4, apply: (s) => { s.magnet *= 1.45; } }),
  up({ id: 'regen', name: '纳米修复', nameEn: 'Nanorepair', desc: '每秒回复 0.7 生命', kind: 'stat', icon: '🩹', color: 0x6fe3b0, rarity: 'rare', max: 6, apply: (s) => { s.regen += 0.7; } }),
  up({ id: 'salvage', name: '拾荒者', nameEn: 'Salvager', desc: '废料获取 +35%', kind: 'stat', icon: '💰', color: 0xffb028, rarity: 'common', max: 5, apply: (s) => { s.scrapBonus += 0.35; } }),
  up({ id: 'thorns', name: '尖刺装甲', nameEn: 'Spiked Armour', desc: '反弹 30% 近战伤害', kind: 'stat', icon: '🪡', color: 0xe8eef3, rarity: 'rare', max: 4, apply: (s) => { s.thorns += 0.3; } }),

  up({ id: 'multishot', name: '分裂炮管', nameEn: 'Split Barrel', desc: '每次多发射 1 枚炮弹', kind: 'weapon', icon: '🔱', color: 0xffb028, rarity: 'rare', max: 4, apply: (s) => { s.bulletsPerShot += 1; s.spread = Math.max(s.spread, 9); } }),
  up({ id: 'spread', name: '霰弹', nameEn: 'Scatter', desc: '散射角度 +8°', kind: 'weapon', icon: '🌫', color: 0xffb028, rarity: 'rare', max: 4, apply: (s) => { s.spread += 8; } }),
  up({ id: 'pierce', name: '穿甲弹', nameEn: 'AP Shell', desc: '炮弹可多贯穿 1 个敌人', kind: 'weapon', icon: '🗡', color: 0xe0532a, rarity: 'rare', max: 4, apply: (s) => { s.pierce += 1; } }),
  up({ id: 'blast', name: '高爆弹', nameEn: 'HE Shell', desc: '炮弹命中产生爆炸（范围 +26）', kind: 'weapon', icon: '💣', color: 0xe0532a, rarity: 'epic', max: 4, apply: (s) => { s.explosiveShells += 1; s.blastRadius += 26; } }),
  up({ id: 'ricochet', name: '跳弹', nameEn: 'Ricochet', desc: '35% 概率墙壁反弹', kind: 'weapon', icon: '🏓', color: 0x6fe3b0, rarity: 'epic', max: 3, apply: (s) => { s.ricochet += 0.35; } }),
  up({ id: 'homing', name: '追踪弹头', nameEn: 'Seeker', desc: '炮弹轻微追踪敌人', kind: 'weapon', icon: '🎯', color: 0x6fe3b0, rarity: 'epic', max: 3, apply: (s) => { s.homing += 2.4; } }),
  up({ id: 'crit', name: '弱点分析', nameEn: 'Weakpoint', desc: '暴击率 +9%', kind: 'stat', icon: '🔺', color: 0xff4d5e, rarity: 'rare', max: 6, apply: (s) => { s.critChance += 0.09; } }),
  up({ id: 'critmult', name: '穿甲弱点', nameEn: 'Armour Piercer', desc: '暴击伤害 +0.5x', kind: 'stat', icon: '☠', color: 0xff4d5e, rarity: 'epic', max: 4, apply: (s) => { s.critMult += 0.5; } }),

  up({ id: 'dash', name: '冲刺充能', nameEn: 'Dash Recharge', desc: '冲刺冷却 -22%', kind: 'trait', icon: '💨', color: 0x6fe3b0, rarity: 'rare', max: 4, apply: (s) => { s.dashCooldown *= 0.78; } }),
  up({ id: 'dashcharges', name: '双段推进', nameEn: 'Twin Thrusters', desc: '冲刺次数 +1', kind: 'trait', icon: '🛫', color: 0x6fe3b0, rarity: 'epic', max: 2, apply: (s) => { s.dashCharges += 1; } }),
  up({ id: 'invuln', name: '相位护盾', nameEn: 'Phase Shield', desc: '冲刺无敌时间 +0.18s', kind: 'trait', icon: '🌀', color: 0x6fe3b0, rarity: 'rare', max: 3, apply: (s) => { s.dashInvuln += 0.18; } }),
  up({ id: 'lifesteal', name: '虹吸涂层', nameEn: 'Siphon Coat', desc: '击杀 22% 概率回复 2 生命', kind: 'trait', icon: '🩸', color: 0xff4d5e, rarity: 'epic', max: 4, apply: (s) => { s.lifesteal += 0.22; } }),
  up({ id: 'overdrive', name: '背水一战', nameEn: 'Overdrive', desc: '生命低于 40% 时装填速度 +22%', kind: 'trait', icon: '🔥', color: 0xe0532a, rarity: 'epic', max: 3, apply: (s) => { s.overdrive += 0.22; } }),
  up({ id: 'slowaura', name: '履带碾压', nameEn: 'Tread Crusher', desc: '周围敌人减速 22%', kind: 'trait', icon: '🪨', color: 0x6fe3b0, rarity: 'epic', max: 3, apply: (s) => { s.slowAura += 0.22; } }),
  up({ id: 'timeslow', name: '残像引擎', nameEn: 'Afterimage', desc: '击杀时 12% 概率时间减速 1.4s', kind: 'trait', icon: '⏳', color: 0x9b8cff, rarity: 'legendary', max: 3, apply: (s) => { s.timeSlowOnKill += 0.12; } }),
  up({ id: 'chain', name: '连锁反应', nameEn: 'Chain Reaction', desc: '暴击击杀时对周围敌人造成 60% 伤害', kind: 'trait', icon: '⛓', color: 0xff4d5e, rarity: 'legendary', max: 2, apply: (s) => { s.critChain += 0.6; } }),
];

const byId = new Map(UPGRADES.map((u) => [u.id, u]));

export function getUpgrade(id: string): Upgrade | undefined {
  return byId.get(id);
}

/** Draft `count` distinct offers, respecting max stacks, requirements and depth. */
export function draftUpgrades(rng: Rng, owned: Record<string, number>, count: number, depth: number): Upgrade[] {
  const pool = UPGRADES.filter((u) => {
    const have = owned[u.id] ?? 0;
    if (have >= u.max) return false;
    if (u.requires && (owned[u.requires] ?? 0) === 0) return false;
    return true;
  });

  const out: Upgrade[] = [];
  const takenIds = new Set<string>();
  for (let i = 0; i < count && out.length < pool.length; i++) {
    const candidates = pool.filter((u) => !takenIds.has(u.id));
    if (!candidates.length) break;
    const depthBoost = 1 + Math.min(0.9, depth * 0.035);
    const picked = rng.weighted(
      candidates.map((u) => {
        const w = u.weight * (u.rarity === 'common' ? Math.max(0.35, 1.25 - depth * 0.045) : depthBoost);
        return [u, Math.max(1, w)] as const;
      }),
    );
    takenIds.add(picked.id);
    out.push(picked);
  }
  return out;
}

export function applyUpgrades(stats: PlayerStats, ids: string[]): void {
  for (const id of ids) getUpgrade(id)?.apply(stats);
}
