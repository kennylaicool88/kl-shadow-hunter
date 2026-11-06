// Tactical mission HUD (DOM + 2D canvas). Display modes: city | targeting | flight | underground | drilling | result.
// Reads mission/tracker/projectile state; never changes game state itself (buttons call handlers).
import { CATEGORY_STYLE } from '../tracking/TargetClassification.js';
import { FLIGHT_STATES, MAX_MACH } from '../weapons/ProjectileStateMachine.js';
import { RADAR_RANGE } from '../tracking/TerroristTracker.js';

const STATE_LABEL = {
  READY: 'READY', TARGET_SELECTED: 'TGT SEL', LAUNCH: 'LAUNCH', ASCENT: 'ASCENT', HIGH_ALTITUDE_CINEMATIC: 'HI-ALT',
  CRUISE: 'CRUISE', AUTOPILOT: 'AUTOPILOT', TARGET_TRACKING: 'TRACKING', TERMINAL_APPROACH: 'TERMINAL',
  IMPACT: 'IMPACT', IMPACT_RESOLUTION: 'RESOLVE',
};

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class TacticalHUD {
  constructor(root, level) {
    this.level = level;
    this.mode = 'city';
    this.handlers = { restart: () => {}, menu: () => {} };
    this.root = el('div', 'tac hidden', root);
    this.root.id = 'tactical';
    this._buildCity();
    this._buildFlight();
    this._buildUnderground();
    this._buildDrill();
    this._buildResult();
    this.hint = el('div', 'tac-hint', this.root);
    this.toast = el('div', 'tac-toast', this.root);
    this.toastTimer = 0;
    this._panelTimer = 0;
    this._minimapBg = this._drawMinimapBackground();
    this.setMode('city');
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setMode(mode) {
    this.mode = mode;
    this.root.className = `tac tac-mode-${mode}${this.root.classList.contains('hidden') ? ' hidden' : ''}`;
  }

  setHint(text) {
    if (this._hint !== text) { this._hint = text; this.hint.innerHTML = text; }
  }

  flash(text, seconds = 3, kind = '') {
    this.toast.textContent = text;
    this.toast.className = `tac-toast show ${kind}`;
    this.toastTimer = seconds;
  }

  // ------------------------------------------------------------------ city mode panels
  _buildCity() {
    const left = el('div', 'tac-panel tac-left tac-city', this.root);
    this.minimap = el('canvas', 'tac-minimap', left);
    this.minimap.width = this.minimap.height = 200;
    const mission = el('div', 'tac-box', left);
    el('div', 'tac-title', mission, 'MISSION · OPERATION DEEP STRIKE');
    this.timerEl = el('div', 'tac-row', mission);
    this.alertEl = el('div', 'tac-alert', mission, '<span>ENEMY ALERT</span><div class="bar"><div></div></div><b>0%</b>');
    this.objEl = el('ul', 'tac-objectives', mission);

    const right = el('div', 'tac-panel tac-right tac-city', this.root);
    const trk = el('div', 'tac-box', right);
    el('div', 'tac-title', trk, 'TERRORIST TRACKER');
    this.radar = el('canvas', 'tac-radar', trk);
    this.radar.width = this.radar.height = 180;
    this.signalEl = el('div', 'tac-signal', trk);
    this.trackInfo = el('div', 'tac-trackinfo', trk);
    const bunk = el('div', 'tac-box', right);
    el('div', 'tac-title', bunk, 'FACILITY STATUS');
    this.bunkerEl = el('div', 'tac-bunkers', bunk);
    const log = el('div', 'tac-box tac-logbox', right);
    el('div', 'tac-title', log, 'INTELLIGENCE LOG');
    this.logEl = el('div', 'tac-log', log);
  }

  _drawMinimapBackground() {
    const c = document.createElement('canvas');
    c.width = c.height = 200;
    const g = c.getContext('2d');
    const L = this.level;
    const s = 200 / 200;
    const X = (x) => (x + 100) * s, Z = (z) => (z + 100) * s;
    g.fillStyle = '#1b2026'; g.fillRect(0, 0, 200, 200);
    g.fillStyle = '#353b42'; // roads
    g.fillRect(X(-96), Z(-82), 192 * s, 8 * s); g.fillRect(X(-96), Z(40), 192 * s, 12 * s);
    g.fillRect(X(-70), Z(-72), 12 * s, 110 * s); g.fillRect(X(58), Z(-72), 12 * s, 110 * s);
    g.fillStyle = '#2b4a2a'; g.fillRect(X(-56), Z(-30), 112 * s, 68 * s); // park
    g.fillStyle = '#24566a'; g.fillRect(X(-26), Z(-8), 52 * s, 24 * s); // lake
    g.fillStyle = '#4a5058';
    for (const b of L.buildings) g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    const G = L.garage, Lb = L.lobby, P = L.podium;
    g.fillStyle = '#5a6068';
    g.fillRect(X(G.x0), Z(G.z0), (G.x1 - G.x0) * s, (G.z1 - G.z0) * s);
    g.fillRect(X(Lb.x0), Z(Lb.z0), (Lb.x1 - Lb.x0) * s, (Lb.z1 - Lb.z0) * s);
    g.fillStyle = '#6b6f76'; g.fillRect(X(P.x0), Z(P.z0), (P.x1 - P.x0) * s, (P.z1 - P.z0) * s);
    g.fillStyle = '#d8dde2';
    for (const t of L.towers) { g.beginPath(); g.arc(X(t.x), Z(t.z), 9 * s, 0, 7); g.fill(); }
    g.fillStyle = '#c8cfd6'; g.font = '9px monospace';
    g.fillText('KLCC', X(-9), Z(-49));
    g.fillText('N', 95, 10);
    return c;
  }

  drawMinimap(player, tracker, mission) {
    const g = this.minimap.getContext('2d');
    g.drawImage(this._minimapBg, 0, 0);
    const X = (x) => x + 100, Z = (z) => z + 100;
    // Revealed entrances
    for (const e of this.level.entrances) {
      if (!mission.revealedEntrances.has(e.id)) continue;
      const [x0, z0, x1, z1] = e.rect;
      g.strokeStyle = '#46e08a'; g.lineWidth = 1;
      g.strokeRect(X(x0), Z(z0), x1 - x0, z1 - z0);
    }
    // Discovered facilities
    for (const b of mission.bunkers.list) {
      if (!b.discovered) continue;
      const st = CATEGORY_STYLE[b.category];
      g.strokeStyle = st.color; g.lineWidth = 2;
      const R = b.rect;
      g.strokeRect(X(R.x0), Z(R.z0), R.x1 - R.x0, R.z1 - R.z0);
      g.fillStyle = st.color; g.font = 'bold 9px monospace';
      g.fillText(b.id, X(R.x0), Z(R.z0) - 2);
    }
    // Contacts
    for (const c of tracker.list()) {
      if (c.status === 'neutralized') continue;
      g.fillStyle = c.status === 'confirmed' ? '#e5483b' : '#f0b429';
      g.beginPath(); g.arc(X(c.pos.x), Z(c.pos.z), c.status === 'confirmed' ? 2.5 : 3.5, 0, 7);
      if (c.status === 'confirmed') g.fill(); else { g.strokeStyle = '#f0b429'; g.stroke(); }
    }
    // Player arrow
    const p = player.body.pos;
    g.save();
    g.translate(X(p.x), Z(p.z));
    g.rotate(-player.yaw);
    g.fillStyle = p.y < -3 ? '#46e08a' : '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill();
    g.restore();
    if (p.y < -3) { g.fillStyle = '#46e08a'; g.font = '9px monospace'; g.fillText('B1 LEVEL', 4, 196); }
  }

  drawRadar(player, tracker, mission, t) {
    const g = this.radar.getContext('2d');
    const S = 180, C = S / 2, R = C - 6;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(10,22,16,0.85)';
    g.beginPath(); g.arc(C, C, R, 0, 7); g.fill();
    g.strokeStyle = 'rgba(70,224,138,0.35)'; g.lineWidth = 1;
    for (const f of [0.33, 0.66, 1]) { g.beginPath(); g.arc(C, C, R * f, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(C, C - R); g.lineTo(C, C + R); g.moveTo(C - R, C); g.lineTo(C + R, C); g.stroke();
    // Sweep
    const a = (t * 2.2) % (Math.PI * 2);
    const grd = g.createConicGradient ? g.createConicGradient(a - 0.6, C, C) : null;
    if (grd) {
      grd.addColorStop(0, 'rgba(70,224,138,0)');
      grd.addColorStop(0.09, 'rgba(70,224,138,0.28)');
      grd.addColorStop(0.1, 'rgba(70,224,138,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(C, C, R, 0, 7); g.fill();
    }
    const p = player.body.pos;
    const cos = Math.cos(player.yaw), sin = Math.sin(player.yaw);
    const toScreen = (x, z) => {
      // Rotate so the player's view direction points up.
      const dx = x - p.x, dz = z - p.z;
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      return [C + (rx / RADAR_RANGE) * R, C + (rz / RADAR_RANGE) * R, Math.hypot(dx, dz)];
    };
    // Facilities
    for (const b of mission.bunkers.list) {
      if (!b.discovered) continue;
      const [sx, sy, d] = toScreen(b.surface.x, b.surface.z);
      const st = CATEGORY_STYLE[b.category];
      const out = d > RADAR_RANGE;
      const k = out ? R / Math.hypot(sx - C, sy - C) : 1;
      const px = C + (sx - C) * k, py = C + (sy - C) * k;
      g.fillStyle = st.color; g.font = 'bold 11px monospace';
      g.fillText(st.icon, px - 4, py + 4);
      if (!out) { g.font = '8px monospace'; g.fillText(b.id, px + 5, py - 3); }
    }
    // Subsurface pulse
    if (tracker.subsurface > 0) {
      g.strokeStyle = `rgba(240,180,41,${0.2 + 0.5 * tracker.subsurface})`;
      g.beginPath(); g.arc(C, C, R * ((t * 0.8) % 1), 0, 7); g.stroke();
    }
    // Contacts
    for (const c of tracker.list()) {
      const [sx, sy, d] = toScreen(c.pos.x, c.pos.z);
      if (d > RADAR_RANGE) continue;
      if (c.status === 'confirmed') { g.fillStyle = '#e5483b'; g.beginPath(); g.arc(sx, sy, 3.5, 0, 7); g.fill(); }
      else if (c.status === 'suspected') { g.strokeStyle = '#f0b429'; g.beginPath(); g.arc(sx, sy, 5, 0, 7); g.stroke(); g.fillStyle = '#f0b429'; g.font = '8px monospace'; g.fillText('?', sx - 2, sy + 3); }
      else { g.strokeStyle = '#7a7f85'; g.beginPath(); g.moveTo(sx - 3, sy - 3); g.lineTo(sx + 3, sy + 3); g.moveTo(sx + 3, sy - 3); g.lineTo(sx - 3, sy + 3); g.stroke(); }
    }
    // Player
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(C, C - 5); g.lineTo(C + 4, C + 4); g.lineTo(C - 4, C + 4); g.fill();
    if (tracker.signalLost) {
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(C, C, R, 0, 7); g.fill();
      g.fillStyle = '#e5483b'; g.font = 'bold 12px monospace'; g.textAlign = 'center';
      g.fillText('SIGNAL LOST', C, C - 10); g.textAlign = 'left';
    }
  }

  updateCityPanels(dt, mission, tracker) {
    this._panelTimer -= dt;
    if (this._panelTimer > 0) return;
    this._panelTimer = 0.25;
    this.timerEl.innerHTML = `<span>MISSION TIME</span><b>${fmtTime(mission.time)}</b><span>STRIKES</span><b>${mission.strikesRemaining}/${mission.strikesTotal}</b><span>INTEL</span><b>${mission.intelPoints}</b>`;
    const al = Math.round(mission.alert);
    this.alertEl.querySelector('.bar div').style.width = `${al}%`;
    this.alertEl.querySelector('.bar div').className = al > 66 ? 'high' : al > 33 ? 'mid' : '';
    this.alertEl.querySelector('b').textContent = `${al}%`;
    this.objEl.innerHTML = mission.objectives().map((o) => `<li class="${o.constraint ? (o.violated ? 'violated' : 'constraint') : o.done ? 'done' : ''}">${o.constraint ? '⚠' : o.done ? '☑' : '☐'} ${o.text}</li>`).join('');
    // Tracker info
    const bars = Math.round(tracker.signal * 5);
    this.signalEl.innerHTML = `<span>SIGNAL</span><span class="bars">${'▮'.repeat(bars)}<i>${'▮'.repeat(5 - bars)}</i></span>${tracker.signalReason ? `<em class="${tracker.signalLost ? 'bad' : 'warn'}">${tracker.signalReason}</em>` : ''}`;
    const confirmed = tracker.list().filter((c) => c.status === 'confirmed').length;
    const suspected = tracker.list().filter((c) => c.status === 'suspected').length;
    const scan = tracker.scanBunker;
    const des = tracker.designated;
    const desB = des && des.kind === 'bunker' ? mission.bunkers.get(des.id) : null;
    this.trackInfo.innerHTML = `
      <div><span>CONTACTS</span><b class="red">${confirmed} confirmed</b> · <b class="amber">${suspected} suspected</b></div>
      <div><span>SUBSURFACE</span><b>${Math.round(tracker.subsurface * 100)}%</b>${scan ? ` · scanning <b>${scan.discovered ? scan.id : 'unknown'}</b> ${Math.round(scan.confidence * 100)}%` : ''}</div>
      <div><span>TARGET LOCK</span><b>${des ? (tracker.signalLost ? 'DESIGNATED · SIGNAL LOST' : 'DESIGNATED') : 'NO TARGET'}</b>${des ? ` · ${des.id}` : ''}</div>
      <div><span>CONFIDENCE</span><b>${desB ? Math.round(desB.confidence * 100) + '%' : '—'}</b></div>`;
    this.bunkerEl.innerHTML = mission.bunkers.list.map((b) => {
      const st = CATEGORY_STYLE[b.category];
      if (!b.discovered) return '<div class="bk undiscovered"><b>???</b><span>undetected signal</span></div>';
      return `<div class="bk" style="border-color:${st.color}"><b style="color:${st.color}">${st.icon} ${b.id} ${b.name}</b><span>${st.label} · ${b.depthFt} ft · ${Math.round(b.confidence * 100)}%</span></div>`;
    }).join('');
    const recent = mission.log.slice(-5);
    this.logEl.innerHTML = recent.map((e) => `<div class="lg ${e.kind}"><i>${fmtTime(e.t)}</i> ${e.text}</div>`).join('');
  }

  // ------------------------------------------------------------------ flight mode
  _buildFlight() {
    const f = el('div', 'tac-flight', this.root);
    this.ribbon = el('div', 'tac-ribbon', f);
    this.ribbonChips = FLIGHT_STATES.map((s) => el('span', '', this.ribbon, STATE_LABEL[s]));
    this.machCanvas = el('canvas', 'tac-gauge tac-gauge-left', f);
    this.altCanvas = el('canvas', 'tac-gauge tac-gauge-right', f);
    this.machCanvas.width = this.machCanvas.height = this.altCanvas.width = this.altCanvas.height = 190;
    this.flightInfo = el('div', 'tac-flightinfo', f);
    this.lockBox = el('div', 'tac-lockbox', f, '<div class="ring"></div><span></span>');
    this.flightWarn = el('div', 'tac-flightwarn', f);
    this.streaks = el('div', 'tac-streaks', f);
  }

  _dial(canvas, value, max, label, unit, fmt, warnFrom = Infinity) {
    const g = canvas.getContext('2d');
    const S = canvas.width, C = S / 2, R = C - 12;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(8,14,18,0.78)'; g.beginPath(); g.arc(C, C, R + 8, 0, 7); g.fill();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.arc(C, C, R, a0, a1); g.stroke();
    const f = Math.max(0, Math.min(1, value / max));
    g.strokeStyle = value >= warnFrom ? '#ff7a3d' : '#46e08a';
    g.beginPath(); g.arc(C, C, R, a0, a0 + (a1 - a0) * f); g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i <= 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10;
      g.beginPath(); g.moveTo(C + Math.cos(a) * (R - 12), C + Math.sin(a) * (R - 12)); g.lineTo(C + Math.cos(a) * (R - 4), C + Math.sin(a) * (R - 4)); g.stroke();
    }
    g.fillStyle = '#e4ecef'; g.textAlign = 'center';
    g.font = 'bold 30px Consolas, monospace'; g.fillText(fmt(value), C, C + 8);
    g.font = '11px Consolas, monospace'; g.fillStyle = '#9fb3bd';
    g.fillText(label, C, C - 26); g.fillText(unit, C, C + 30);
    g.textAlign = 'left';
  }

  updateFlight(tel, track, lockScreen) {
    FLIGHT_STATES.forEach((s, i) => {
      const chip = this.ribbonChips[i];
      const idx = FLIGHT_STATES.indexOf(tel.state);
      chip.className = s === tel.state ? 'active' : i < idx ? 'past' : '';
    });
    this._dial(this.machCanvas, tel.mach, MAX_MACH, 'SPEED (SIM)', 'MACH', (v) => v.toFixed(1), 9.5);
    this._dial(this.altCanvas, tel.altitudeFt, 110000, 'ALTITUDE', 'FT', (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)));
    this.flightInfo.innerHTML = `
      <div><span>STATE</span><b>${tel.state.replace(/_/g, ' ')}</b></div>
      <div><span>GUIDANCE</span><b>${tel.guidance}</b></div>
      <div><span>FLIGHT TIME</span><b>${fmtTime(tel.flightTimeDisplay)}</b> <i>(×${tel.compression} time compression)</i></div>
      <div><span>TARGET DIST</span><b>${tel.distanceKm.toFixed(1)} km</b></div>
      <div><span>TARGET</span><b>${tel.targetLabel}</b> · <b>${tel.warhead}</b></div>
      ${tel.progressLabel ? `<div><span>PROGRESS</span><b>${tel.progressLabel}</b></div>` : ''}
      ${track ? `<div><span>SEEKER</span><b>${track.mode.replace('_', '-')}</b> · ${track.state}</div>
      <div><span>LOCK</span><div class="mini"><div style="width:${Math.round(track.lockProgress * 100)}%"></div></div></div>
      <div><span>STABILITY</span><div class="mini"><div style="width:${Math.round(track.stability * 100)}%"></div></div></div>
      <div><span>CONFIDENCE</span><b>${Math.round(track.confidence * 100)}%</b></div>` : ''}`;
    const warns = [];
    if (track && track.decoyInterference) warns.push('DECOY INTERFERENCE');
    if (track && track.signalInterrupted) warns.push('SIGNAL INTERRUPTED');
    if (track && track.state === 'LOCK LOST') warns.push('LOCK LOST · REACQUIRING');
    if (tel.fallback) warns.push('NAV FALLBACK · DESIGNATED COORDINATES');
    this.flightWarn.innerHTML = warns.map((w) => `<div>${w}</div>`).join('');
    if (lockScreen && lockScreen.visible) {
      this.lockBox.style.display = 'block';
      this.lockBox.style.left = `${lockScreen.x}px`;
      this.lockBox.style.top = `${lockScreen.y}px`;
      this.lockBox.className = `tac-lockbox ${track && track.state === 'LOCKED' ? 'locked' : ''}`;
      this.lockBox.querySelector('.ring').style.setProperty('--p', `${Math.round((track ? track.lockProgress : 0) * 360)}deg`);
      this.lockBox.querySelector('span').textContent = lockScreen.label;
    } else {
      this.lockBox.style.display = 'none';
    }
    this.streaks.style.opacity = String(Math.max(0, (tel.mach - 3) / 7) * 0.8);
  }

  // ------------------------------------------------------------------ underground mode
  _buildUnderground() {
    const u = el('div', 'tac-underground', this.root);
    el('div', 'tac-title', u, 'TACTICAL CUTAWAY · SUBSURFACE');
    this.ugLegend = el('div', 'tac-legend', u, Object.entries(CATEGORY_STYLE)
      .map(([, s]) => `<div><b style="color:${s.color}">${s.icon}</b> ${s.label}</div>`).join(''));
    this.ugList = el('div', 'tac-uglist', u);
    this.ugLabels = el('div', 'tac-uglabels', this.root);
  }

  updateUnderground(mission, labels) {
    this.ugList.innerHTML = mission.bunkers.list.map((b) => {
      const st = CATEGORY_STYLE[b.category];
      if (!b.discovered) return '<div class="bk undiscovered"><b>???</b><span>undetected</span></div>';
      return `<div class="bk" style="border-color:${st.color}"><b style="color:${st.color}">${st.icon} ${b.id} ${b.name}</b>
        <span>${st.label}</span><span>depth ${b.depthFt} ft · confidence ${Math.round(b.confidence * 100)}% · ${b.status}</span>
        <span class="src">${b.sources.join(' · ') || 'no sources'}</span></div>`;
    }).join('') + `<div class="ug-count">${mission.bunkers.list.filter((b) => !b.discovered).length} undetected signal(s)</div>`;
    this.ugLabels.innerHTML = labels.map((l) => `<div class="uglabel" style="left:${l.x}px;top:${l.y}px;color:${l.color}">${l.text}</div>`).join('');
  }

  // ------------------------------------------------------------------ drilling mode
  _buildDrill() {
    const d = el('div', 'tac-drill', this.root);
    el('div', 'tac-title', d, 'SUBSURFACE PENETRATION · CINEMATIC');
    this.drillDepth = el('div', 'tac-drilldepth', d);
    this.drillBar = el('div', 'tac-drillbar', d, '<div class="fill"></div><div class="target"></div>');
    this.drillStatus = el('div', 'tac-drillstatus', d);
  }

  updateDrill(model, bunker, statusLines) {
    this.drillDepth.innerHTML = `<b>${Math.floor(model.depth)}</b> ft <span>/ ${model.targetFt} ft · max 300 ft</span><div>${model.layer.name.toUpperCase()}</div>`;
    this.drillBar.querySelector('.fill').style.height = `${(model.depth / 300) * 100}%`;
    this.drillBar.querySelector('.target').style.top = `${(model.targetFt / 300) * 100}%`;
    this.drillStatus.innerHTML = `<div class="tac-title">IMPACT STATUS</div>
      <div>TARGET <b>${bunker ? `${bunker.id} ${bunker.name}` : '—'}</b></div>
      ${statusLines.map((s) => `<div>${s}</div>`).join('')}`;
  }

  // ------------------------------------------------------------------ result screen
  _buildResult() {
    const r = el('div', 'tac-result', this.root);
    this.resultTitle = el('h1', '', r);
    this.resultBody = el('div', 'tac-resultbody', r);
    const btns = el('div', 'menu-buttons', r);
    const restart = el('button', 'btn primary', btns, 'Restart Mission');
    const menu = el('button', 'btn', btns, 'Main Menu');
    restart.id = 'btn-mission-restart';
    menu.id = 'btn-mission-menu';
    restart.addEventListener('click', () => this.handlers.restart());
    menu.addEventListener('click', () => this.handlers.menu());
  }

  showResult(victory, title, html) {
    this.resultTitle.textContent = title;
    this.resultTitle.className = victory ? 'win' : 'lose';
    this.resultBody.innerHTML = html;
    this.setMode('result');
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.className = 'tac-toast';
    }
  }
}
