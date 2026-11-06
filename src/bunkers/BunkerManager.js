// Registry of facilities for the current mission. No rendering; views read from here.
import { Bunker } from './Bunker.js';
import { addEvidence, BUNKER_TYPES } from '../tracking/TargetClassification.js';

export class BunkerManager {
  constructor(defs) {
    this.list = defs.map((d) => new Bunker(d));
    this.byId = new Map(this.list.map((b) => [b.id, b]));
    if (this.byId.size !== this.list.length) throw new Error('Duplicate bunker id');
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  discovered() {
    return this.list.filter((b) => b.discovered);
  }

  // Evidence from intelligence (can confirm the classification).
  addIntel(id, amount) {
    const b = this.get(id);
    if (!b) return null;
    return { bunker: b, ...addEvidence(b, amount) };
  }

  // Evidence from the tracker's subsurface scan (capped; cannot confirm on its own).
  addScan(id, amount) {
    const b = this.get(id);
    if (!b) return null;
    return { bunker: b, ...addEvidence(b, amount, { scan: true }) };
  }

  hostiles() {
    return this.list.filter((b) => b.trueType === BUNKER_TYPES.HOSTILE);
  }

  allHostilesDestroyed() {
    return this.hostiles().every((b) => b.status === 'DESTROYED');
  }

  nearest(x, z, filter = () => true) {
    let best = null, bd = Infinity;
    for (const b of this.list) {
      if (!filter(b)) continue;
      const d = b.distanceTo(x, z);
      if (d < bd) { bd = d; best = b; }
    }
    return best ? { bunker: best, distance: bd } : null;
  }
}
