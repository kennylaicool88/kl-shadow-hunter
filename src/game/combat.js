// Shared combat math: hitboxes, damage multipliers, armor absorption. No Three.js dependency.
import { rayAabb } from '../physics/CollisionSystem.js';

export const HIT_MULTIPLIER = { head: 4.0, body: 1.0, legs: 0.75 };

// Standing character proportions (metres). Rendered bot models are built to match these.
export const HEAD_SIZE = 0.34;
export const BODY_HALF_WIDTH = 0.3;

const _min = [0, 0, 0];
const _max = [0, 0, 0];

/**
 * Ray test against a character's head and body boxes.
 * pos = feet position, height = current (standing or crouched) height.
 * Returns { dist, part } or null.
 */
export function hitTestCharacter(pos, height, ox, oy, oz, dx, dy, dz, maxDist) {
  const top = pos.y + height;
  const hs = HEAD_SIZE / 2;
  let best = null;

  // Head
  _min[0] = pos.x - hs; _min[1] = top - HEAD_SIZE; _min[2] = pos.z - hs;
  _max[0] = pos.x + hs; _max[1] = top; _max[2] = pos.z + hs;
  let t = rayAabb(ox, oy, oz, dx, dy, dz, _min, _max, maxDist);
  if (t >= 0) best = { dist: t, part: 'head' };

  // Torso + legs
  const bw = BODY_HALF_WIDTH;
  _min[0] = pos.x - bw; _min[1] = pos.y; _min[2] = pos.z - bw;
  _max[0] = pos.x + bw; _max[1] = top - HEAD_SIZE; _max[2] = pos.z + bw;
  t = rayAabb(ox, oy, oz, dx, dy, dz, _min, _max, maxDist);
  if (t >= 0 && (!best || t < best.dist)) {
    const hitY = oy + dy * t;
    const legLine = pos.y + height * 0.42;
    best = { dist: t, part: hitY < legLine ? 'legs' : 'body' };
  }
  return best;
}

/**
 * Applies armor absorption (classic-shooter style).
 * armorRatio: fraction of damage that still reaches health when armored (weapon armor penetration).
 * Returns { health, armor } damage to subtract.
 */
export function computeDamage(rawDamage, armor, armorRatio, part) {
  if (armor <= 0 || part === 'legs') return { health: Math.round(rawDamage), armor: 0 };
  let healthDmg = rawDamage * armorRatio;
  let armorDmg = (rawDamage - healthDmg) * 0.5;
  if (armorDmg > armor) {
    // Not enough armor: overflow goes to health.
    healthDmg += (armorDmg - armor) * 2;
    armorDmg = armor;
  }
  return { health: Math.round(healthDmg), armor: Math.round(armorDmg) };
}

// Damage falloff with distance: full damage until `range`, then linear down to 50% at 2x range.
export function rangeFalloff(dist, range) {
  if (dist <= range) return 1;
  return Math.max(0.5, 1 - 0.5 * ((dist - range) / range));
}
