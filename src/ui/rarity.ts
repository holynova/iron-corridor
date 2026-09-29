import type { Upgrade } from '../data/upgrades';

export const RARITY_COLOR: Record<Upgrade['rarity'], number> = {
  common: 0x8fa3b4,
  rare: 0x4dabf7,
  epic: 0xb07cf0,
  legendary: 0xffb028,
};
