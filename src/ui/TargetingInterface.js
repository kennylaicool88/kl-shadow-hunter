// Target-selection interface for the Deep Strike uplink (keyboard driven, pointer stays locked).
//   W/S or ↑/↓ or wheel : choose target          M : warhead (unitary / cluster)
//   C : cluster spread (tight / wide)              T : seeker (auto-trace / heat-trace)
//   Enter / Space / LMB : select → launch          Q / Backspace / RMB : back / close
// Risky launches (protected facility in the effect area, or an unidentified target) need a second confirmation.
import { CATEGORY_STYLE } from '../tracking/TargetClassification.js';
import { TRACK_MODES } from '../tracking/TrackingModes.js';

export class TargetingInterface {
  constructor(root) {
    this.root = document.createElement('div');
    this.root.className = 'tac-targeting hidden';
    root.appendChild(this.root);
    this.open = false;
    this.index = 0;
    this.selected = null;
    this.warhead = 'unitary';
    this.spread = 'tight';
    this.trackMode = TRACK_MODES.AUTO_TRACE;
    this.confirmPending = false;
    this.targets = [];
    this.onLaunch = null;
    this.onSelect = null;
    this.onClose = null;
  }

  show(targets) {
    this.targets = targets;
    this.index = Math.min(this.index, Math.max(0, targets.length - 1));
    this.selected = null;
    this.confirmPending = false;
    this.open = true;
    this.root.classList.remove('hidden');
  }

  hide() {
    this.open = false;
    this.selected = null;
    this.root.classList.add('hidden');
  }

  get current() {
    return this.targets[this.index] || null;
  }

  /** Handles input for one frame. preview(target) -> { protectedRisk, unidentified, affected }. Returns an action string or null. */
  handleInput(input, preview) {
    if (!this.open) return null;
    const pressed = (c) => input.wasPressed(c);
    const wheel = input.consumeWheel();
    if (!this.selected) {
      if (pressed('KeyW') || pressed('ArrowUp') || wheel < 0) this.index = (this.index - 1 + this.targets.length) % Math.max(1, this.targets.length);
      if (pressed('KeyS') || pressed('ArrowDown') || wheel > 0) this.index = (this.index + 1) % Math.max(1, this.targets.length);
      if ((pressed('Enter') || pressed('Space') || input.mouseWasPressed(0)) && this.current) {
        this.selected = this.current;
        this.confirmPending = false;
        if (this.onSelect) this.onSelect(this.selected);
        return 'select';
      }
      if (pressed('KeyQ') || pressed('Backspace') || input.mouseWasPressed(2)) {
        if (this.onClose) this.onClose();
        return 'close';
      }
      return null;
    }
    // Target selected: configure and launch.
    if (pressed('KeyM')) { this.warhead = this.warhead === 'unitary' ? 'cluster' : 'unitary'; this.confirmPending = false; }
    if (pressed('KeyC') && this.warhead === 'cluster') { this.spread = this.spread === 'tight' ? 'wide' : 'tight'; this.confirmPending = false; }
    if (pressed('KeyT')) { this.trackMode = this.trackMode === TRACK_MODES.AUTO_TRACE ? TRACK_MODES.HEAT_TRACE : TRACK_MODES.AUTO_TRACE; }
    if (pressed('KeyQ') || pressed('Backspace') || input.mouseWasPressed(2)) {
      this.selected = null;
      this.confirmPending = false;
      return 'back';
    }
    if (pressed('Enter') || pressed('Space') || pressed('KeyL') || input.mouseWasPressed(0)) {
      const p = preview(this.selected, this.warhead, this.spread);
      if ((p.protectedRisk || p.unidentified) && !this.confirmPending) {
        this.confirmPending = true;
        return 'confirm-required';
      }
      if (this.onLaunch) this.onLaunch({ target: this.selected, warhead: this.warhead, spread: this.spread, trackMode: this.trackMode });
      return 'launch';
    }
    return null;
  }

  render(mission, preview, strikesRemaining) {
    if (!this.open) return;
    const rows = this.targets.map((t, i) => {
      if (t.kind === 'bunker') {
        const b = t.bunker;
        const st = CATEGORY_STYLE[b.category];
        return `<div class="tg-row ${i === this.index ? 'cur' : ''}"><b style="color:${st.color}">${st.icon} ${b.id} ${b.name}</b>
          <span>${st.label}</span><span>${b.depthFt} ft</span><span>${Math.round(b.confidence * 100)}%</span></div>`;
      }
      return `<div class="tg-row ${i === this.index ? 'cur' : ''}"><b style="color:#e5483b">● ${t.label}</b><span>CONFIRMED HOSTILE CONTACT</span><span>surface</span><span>—</span></div>`;
    }).join('') || '<div class="tg-empty">No targets. Discover facilities with intel and the tracker first.</div>';

    let detail = '';
    const t = this.selected || this.current;
    if (t && t.kind === 'bunker') {
      const b = t.bunker;
      detail = `<div class="tg-dossier"><div class="tac-title">DOSSIER · ${b.id} ${b.name}</div>
        <div>Classification: <b style="color:${CATEGORY_STYLE[b.category].color}">${CATEGORY_STYLE[b.category].label}</b></div>
        <div>Depth: <b>${b.depthFt} ft</b> · Footprint ${b.size.w}×${b.size.d} m · Thermal ${Math.round(b.heat * 100)}%</div>
        <div>Confidence: <b>${Math.round(b.confidence * 100)}%</b></div>
        <div>Sources: ${b.sources.join(' · ') || '—'}</div></div>`;
    }
    let config = '';
    if (this.selected) {
      const p = preview(this.selected, this.warhead, this.spread);
      const warn = [];
      if (p.protectedRisk) warn.push('⚠ PROTECTED FACILITY INSIDE THE EFFECT AREA — STRIKE WILL FAIL THE MISSION');
      if (p.unidentified) warn.push('⚠ TARGET NOT POSITIVELY IDENTIFIED — UNCERTAINTY PENALTY APPLIES');
      config = `<div class="tg-config">
        <div><span>[M] WARHEAD</span><b>${this.warhead.toUpperCase()}</b></div>
        <div class="${this.warhead === 'cluster' ? '' : 'dim'}"><span>[C] SPREAD</span><b>${this.spread.toUpperCase()}</b></div>
        <div><span>[T] SEEKER</span><b>${this.trackMode.replace('_', '-')}</b></div>
        <div><span>EFFECT AREA</span><b>${p.affected.length ? p.affected.map((a) => a.id).join(', ') : 'no known facility'}</b></div>
        ${warn.map((w) => `<div class="tg-warn">${w}</div>`).join('')}
        <div class="tg-launch">${this.confirmPending ? 'PRESS [ENTER] AGAIN TO CONFIRM LAUNCH' : '[ENTER] LAUNCH · [Q] BACK'}</div></div>`;
    }
    const html = `<div class="tac-title">DEEP STRIKE UPLINK · TARGET SELECTION <span class="dim">strikes remaining ${strikesRemaining}</span></div>
      <div class="tg-list">${rows}</div>${detail}${config}
      <div class="tg-help">${this.selected ? '' : '[W/S] choose · [ENTER] select · [Q] close'}</div>`;
    if (html !== this._html) {
      this._html = html;
      this.root.innerHTML = html;
    }
  }
}
