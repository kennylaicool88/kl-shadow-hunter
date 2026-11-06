// Pure progress model for the fictional drilling cinematic (depth display up to 300 ft).
// Not a physical penetration model: each stratum simply scrolls by at a presentation rate.

export const MAX_DEPTH_FT = 300;

// Fictionalised KL ground profile (top → bottom).
export const STRATA = [
  { name: 'Fill & topsoil', toFt: 15, hardness: 0.6, color: '#7a5a3a' },
  { name: 'Alluvial clay', toFt: 50, hardness: 0.85, color: '#9b7b52' },
  { name: 'Kenny Hill sandstone', toFt: 125, hardness: 1.3, color: '#b0835a' },
  { name: 'Weathered limestone', toFt: 210, hardness: 1.7, color: '#a9a49a' },
  { name: 'Karst limestone', toFt: MAX_DEPTH_FT, hardness: 2.1, color: '#8d8b86' },
];

export function stratumAt(depthFt) {
  return STRATA.find((s) => depthFt < s.toFt) || STRATA[STRATA.length - 1];
}

export class DrillModel {
  constructor(targetFt, { rate = 120, breachHold = 1.6 } = {}) {
    this.targetFt = Math.min(MAX_DEPTH_FT, Math.max(0, targetFt));
    this.rate = rate; // ft per second in soft ground
    this.breachHold = breachHold;
    this.depth = 0;
    this.time = 0;
    this.breached = false;
    this.holdTime = 0;
    this.done = false;
    this.layer = STRATA[0];
  }

  get progress() {
    return this.targetFt > 0 ? this.depth / this.targetFt : 1;
  }

  /** Returns events: [{type:'layer', layer}] | [{type:'breach'}] | [{type:'done'}] */
  update(dt) {
    const events = [];
    if (this.done) return events;
    this.time += dt;
    if (!this.breached) {
      const layer = stratumAt(this.depth);
      this.depth = Math.min(this.targetFt, this.depth + (this.rate / layer.hardness) * dt);
      const now = stratumAt(this.depth);
      if (now !== this.layer) {
        this.layer = now;
        events.push({ type: 'layer', layer: now });
      }
      if (this.depth >= this.targetFt) {
        this.breached = true;
        events.push({ type: 'breach' });
      }
    } else {
      this.holdTime += dt;
      if (this.holdTime >= this.breachHold) {
        this.done = true;
        events.push({ type: 'done' });
      }
    }
    return events;
  }
}
