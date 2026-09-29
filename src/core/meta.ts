const STORAGE_KEY = 'iron-corridor/meta/v1';

export interface MetaSave {
  runs: number;
  bestDepth: number;
  bestKills: number;
  totalKills: number;
  totalShots: number;
  totalHits: number;
  totalPlaytime: number;
  scrap: number;
  upgrades: Record<string, number>;
  volumes: { master: number; music: number; sfx: number };
}

const DEFAULT_META: MetaSave = {
  runs: 0,
  bestDepth: 0,
  bestKills: 0,
  totalKills: 0,
  totalShots: 0,
  totalHits: 0,
  totalPlaytime: 0,
  scrap: 0,
  upgrades: {},
  volumes: { master: 0.8, music: 0.55, sfx: 0.8 },
};

function read(): MetaSave {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_META, upgrades: {}, volumes: { ...DEFAULT_META.volumes } };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_META, upgrades: {}, volumes: { ...DEFAULT_META.volumes } };
    const parsed = JSON.parse(raw) as Partial<MetaSave>;
    return {
      ...DEFAULT_META,
      ...parsed,
      upgrades: { ...(parsed.upgrades ?? {}) },
      volumes: { ...DEFAULT_META.volumes, ...(parsed.volumes ?? {}) },
    };
  } catch {
    return { ...DEFAULT_META, upgrades: {}, volumes: { ...DEFAULT_META.volumes } };
  }
}

let cache: MetaSave | null = null;

export function meta(): MetaSave {
  if (!cache) cache = read();
  return cache;
}

export function saveMeta(patch: Partial<MetaSave> = {}): void {
  const current = meta();
  cache = { ...current, ...patch, volumes: patch.volumes ?? current.volumes, upgrades: patch.upgrades ?? current.upgrades };
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* storage disabled — meta simply stays in memory */
  }
}

export interface MetaUpgradeDef {
  id: string;
  name: string;
  desc: (level: number) => string;
  max: number;
  cost: (level: number) => number;
  icon: string;
}

export const META_UPGRADES: readonly MetaUpgradeDef[] = [
  {
    id: 'hull',
    name: '复合装甲',
    max: 5,
    icon: '🛡',
    desc: (l) => `坦克生命上限 +${(l + 1) * 20}`,
    cost: (l) => 60 + l * 70,
  },
  {
    id: 'barrel',
    name: '强化炮管',
    max: 5,
    icon: '🔩',
    desc: (l) => `炮弹伤害 +${(l + 1) * 2}`,
    cost: (l) => 55 + l * 65,
  },
  {
    id: 'loader',
    name: '自动装填',
    max: 5,
    icon: '⚡',
    desc: (l) => `装填时间 -${Math.min(45, (l + 1) * 7)}%`,
    cost: (l) => 50 + l * 60,
  },
  {
    id: 'engine',
    name: '引擎调校',
    max: 5,
    icon: '🔥',
    desc: (l) => `移动速度 +${(l + 1) * 4}%`,
    cost: (l) => 45 + l * 55,
  },
  {
    id: 'salvage',
    name: '战场拾荒',
    max: 5,
    icon: '💰',
    desc: (l) => `击杀获得废料 +${(l + 1) * 20}%`,
    cost: (l) => 50 + l * 50,
  },
  {
    id: 'repair',
    name: '应急维修',
    max: 3,
    icon: '🩹',
    desc: (l) => `每层开始回复 ${(l + 1) * 6}% 生命`,
    cost: (l) => 90 + l * 110,
  },
];
