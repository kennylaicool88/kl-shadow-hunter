// "Terrorist tracker": the player's fictional intelligence sensor suite.
// - Hostile contacts come from the game simulation: CONFIRMED only with line of sight,
//   SUSPECTED from gunfire picked up by the (satellite/acoustic) uplink. Nothing is revealed for free.
// - A local subsurface scanner detects facilities when the player is close (cannot confirm them).
// - Uplink signal degrades underground, indoors and near the landmark towers.

export const RADAR_RANGE = 80;
const SCAN_RANGE = 24;
const SUBSURFACE_RANGE = 60;

export class TerroristTracker {
  constructor(mission, collision, level) {
    this.mission = mission;
    this.collision = collision;
    this.level = level;
    this.contacts = new Map(); // bot -> contact
    this.signal = 1;
    this.signalLost = false;
    this.signalReason = '';
    this.scanBunker = null;
    this.subsurface = 0; // 0..1 strength of the nearest facility signal
    this.designated = null; // { kind, id, name }
    this.lockStatus = 'NO TARGET';
    this.time = 0;
    this._eye = { x: 0, y: 0, z: 0 };
    this._tp = { x: 0, y: 0, z: 0 };
  }

  _uplinkQuality(player) {
    const p = player.body.pos;
    if (p.y < -3) return [0.12, 'UNDERGROUND · UPLINK LOST'];
    // Roof overhead? (mall, lobby, garage floors, pavilion)
    const roof = this.collision.raycast(p.x, p.y + 1.7, p.z, 0, 1, 0, 30);
    let q = 1, reason = '';
    if (roof) { q = 0.55; reason = 'INDOORS · SIGNAL DEGRADED'; }
    for (const t of this.level.towers) {
      if (Math.hypot(p.x - t.x, p.z - t.z) < 38) { q = Math.min(q, 0.6); reason = 'TOWER INTERFERENCE'; }
    }
    return [q, reason];
  }

  update(dt, player, bots) {
    this.time += dt;
    const [q, reason] = this._uplinkQuality(player);
    this.signal += (q - this.signal) * Math.min(1, dt * 3);
    this.signalLost = this.signal < 0.3;
    this.signalReason = reason;
    player.getEyePosition(this._eye);
    const e = this._eye;

    // Contacts
    for (const bot of bots) {
      if (bot.team === player.team) continue;
      let c = this.contacts.get(bot);
      if (!bot.alive) {
        if (c && c.status !== 'neutralized') { c.status = 'neutralized'; c.time = this.time; }
        continue;
      }
      const d = Math.hypot(bot.body.pos.x - e.x, bot.body.pos.z - e.z);
      let seen = false;
      if (d < RADAR_RANGE) {
        bot.getAimPoint(this._tp, 'body');
        seen = this.collision.lineClear(e.x, e.y, e.z, this._tp.x, this._tp.y, this._tp.z);
      }
      const heard = !this.signalLost && bot.weapon.sinceLastShot < 0.6 && d < 160;
      if (seen) {
        if (!c) { c = { bot, status: 'confirmed', pos: { x: 0, z: 0 }, time: 0 }; this.contacts.set(bot, c); }
        c.status = 'confirmed';
        c.pos.x = bot.body.pos.x; c.pos.z = bot.body.pos.z;
        c.y = bot.body.pos.y;
        c.time = this.time;
        this.mission.reportContact();
      } else if (heard) {
        if (!c) { c = { bot, status: 'suspected', pos: { x: 0, z: 0 }, time: 0 }; this.contacts.set(bot, c); }
        if (c.status !== 'confirmed' || this.time - c.time > 2) {
          c.status = 'suspected';
          // Acoustic fix is imprecise.
          c.pos.x = bot.body.pos.x + (Math.random() - 0.5) * 8;
          c.pos.z = bot.body.pos.z + (Math.random() - 0.5) * 8;
          c.y = bot.body.pos.y;
          c.time = this.time;
        }
      }
      if (c) {
        if (c.status === 'confirmed' && this.time - c.time > 3) c.status = 'suspected';
        if (c.status === 'suspected' && this.time - c.time > 10) this.contacts.delete(bot);
      }
    }
    for (const [bot, c] of this.contacts) {
      if (c.status === 'neutralized' && this.time - c.time > 4) this.contacts.delete(bot);
    }

    // Subsurface scanner (local sensor: works underground too).
    const near = this.mission.bunkers.nearest(player.body.pos.x, player.body.pos.z, (b) => b.status !== 'DESTROYED');
    this.subsurface = near ? Math.max(0, 1 - near.distance / SUBSURFACE_RANGE) : 0;
    this.scanBunker = near && near.distance < SCAN_RANGE ? near.bunker : null;
    if (this.scanBunker) this.mission.scan(this.scanBunker.id, dt * 14);

    // Designated-target lock status for the HUD.
    if (!this.designated) this.lockStatus = 'NO TARGET';
    else this.lockStatus = this.signalLost ? 'DESIGNATED · SIGNAL LOST' : 'DESIGNATED';
  }

  // Contact reported by the player's sensors (sensor grenade, binocular / rangefinder tag).
  reveal(bot) {
    if (!bot.alive) return;
    let c = this.contacts.get(bot);
    if (!c) { c = { bot, status: 'confirmed', pos: { x: 0, z: 0 }, time: 0 }; this.contacts.set(bot, c); }
    c.status = 'confirmed';
    c.pos.x = bot.body.pos.x; c.pos.z = bot.body.pos.z; c.y = bot.body.pos.y;
    c.time = this.time;
  }

  confirmedContacts() {
    return [...this.contacts.values()].filter((c) => c.status === 'confirmed' && c.bot.alive);
  }

  list() {
    return [...this.contacts.values()];
  }

  reset() {
    this.contacts.clear();
    this.designated = null;
    this.signal = 1;
  }
}
