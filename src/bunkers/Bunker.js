// A single underground facility. Pure data + small helpers (no rendering).
import { BUNKER_TYPES, knownType, displayCategory, confidence, discoveryState } from '../tracking/TargetClassification.js';

const FT = 0.3048;

export class Bunker {
  constructor(def) {
    if (!def.id) throw new Error('Bunker requires a unique id');
    if (!Object.values(BUNKER_TYPES).includes(def.type)) throw new Error(`Bunker ${def.id}: invalid type ${def.type}`);
    this.id = def.id;
    this.name = def.name;
    this.trueType = def.type; // the facility's real classification (hidden from the player until confirmed)
    this.depthFt = def.depthFt;
    this.surface = { x: def.surface[0], z: def.surface[1] };
    this.size = { w: def.size[0], d: def.size[1] }; // footprint (m)
    this.heat = def.heat ?? 0.5; // simulated thermal signature 0..1
    this.primary = !!def.primary;
    this.discovered = false;
    this.evidence = 0;
    this.status = 'INTACT'; // INTACT | DESTROYED | STRUCK (decoy / protected hit)
    this.scanTime = 0;
    this.sources = []; // intelligence sources that contributed evidence (dossier)
  }

  get depthM() {
    return this.depthFt * FT;
  }

  get knownType() {
    return knownType(this);
  }

  get category() {
    return displayCategory(this);
  }

  get confidence() {
    return confidence(this);
  }

  get discovery() {
    return discoveryState(this);
  }

  // Footprint rectangle on the surface.
  get rect() {
    return {
      x0: this.surface.x - this.size.w / 2, x1: this.surface.x + this.size.w / 2,
      z0: this.surface.z - this.size.d / 2, z1: this.surface.z + this.size.d / 2,
    };
  }

  // Does a circular surface effect (x, z, r) overlap this facility's footprint?
  intersectsCircle(x, z, r) {
    const R = this.rect;
    const cx = Math.max(R.x0, Math.min(x, R.x1));
    const cz = Math.max(R.z0, Math.min(z, R.z1));
    return (x - cx) ** 2 + (z - cz) ** 2 <= r * r;
  }

  distanceTo(x, z) {
    return Math.hypot(this.surface.x - x, this.surface.z - z);
  }
}
