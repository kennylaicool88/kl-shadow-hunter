// Armory / loadout screen: 9 categories, live 3D preview, stats, unlock status, attachments,
// grenade + equipment packing. Used from the main menu, the pause menu and in-round (B, buy time).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CATEGORIES, ARSENAL, COMPAT, DEFAULT_ATTACHMENTS, isUnlocked, unlockText } from '../weapons/arsenal.js';
import { getWeaponConfig, weaponRatings } from '../weapons/weaponConfigs.js';
import { ATTACHMENTS, ATTACHMENT_SLOTS, SLOT_LABEL, attachmentSummary, applyAttachments, sanitizeAttachments } from '../weapons/attachmentData.js';
import { THROWABLES, EQUIPMENT, GRENADE_CAPACITY, EQUIPMENT_CAPACITY } from '../weapons/equipmentData.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { buildGrenadeModel, buildEquipmentModel } from '../weapons/forge/equipmentModels.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class LoadoutMenu {
  constructor(game) {
    this.game = game;
    this.root = $('loadout-menu');
    this.cat = 'ar';
    this.selected = 'rifle';
    this.mode = 'menu';
    this.onClose = null;
    this._bind();
  }

  get loadout() { return this.game.loadout; }

  _bind() {
    $('lo-cats').innerHTML = CATEGORIES.map((c, i) => `<button data-cat="${c.id}"><b>${i + 1}</b>${c.label}</button>`).join('');
    $('lo-cats').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.selectCategory(b.dataset.cat); });
    $('lo-list').addEventListener('click', (e) => { const r = e.target.closest('[data-id]'); if (r) this.select(r.dataset.id); });
    $('lo-attach').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-slot]');
      if (!b) return;
      this.setAttachment(this.selected, b.dataset.slot, b.dataset.att || null);
    });
    $('lo-actions').addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b) this.action(b.dataset.act); });
    $('lo-close').addEventListener('click', () => this.close());
    $('lo-sandbox').addEventListener('change', (e) => { this.game.settings.sandboxUnlock = e.target.checked; this.game.saveSettings(); this.render(); });
    window.addEventListener('keydown', (e) => {
      if (this.root.classList.contains('hidden')) return;
      if (e.code === 'Escape') { e.preventDefault(); this.close(); }
    });
  }

  open(mode = 'menu', onClose = null) {
    this.mode = mode;
    this.onClose = onClose;
    this.root.classList.remove('hidden');
    $('lo-sub').textContent = mode === 'armory' ? 'Buy time · choices apply immediately' : mode === 'pause' ? (this.game.mission && this.game.mission.active ? 'Field resupply · choices apply immediately' : 'Changes apply next round') : 'Pre-mission loadout';
    $('lo-sandbox').checked = !!this.game.settings.sandboxUnlock;
    const cur = getWeaponConfig(this.loadout.primary);
    this.selectCategory(cur.category || 'ar', this.loadout.primary);
    this._startPreview();
  }

  close() {
    if (this.root.classList.contains('hidden')) return;
    this.root.classList.add('hidden');
    this._stopPreview();
    this.game.saveLoadout();
    const cb = this.onClose;
    this.onClose = null;
    if (cb) cb();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }

  selectCategory(cat, pick = null) {
    this.cat = cat;
    for (const b of $('lo-cats').children) b.classList.toggle('active', b.dataset.cat === cat);
    const items = this._items(cat);
    this.selected = pick && items.some((i) => i.id === pick) ? pick : items[0].id;
    this.render();
  }

  select(id) {
    this.selected = id;
    this.render();
  }

  _items(cat) {
    if (cat === 'grenade') return Object.entries(THROWABLES).map(([id, t]) => ({ id, name: t.name, cls: t.kind === 'lethal' ? 'Lethal' : 'Tactical', gear: 'grenade' }));
    if (cat === 'equipment') return Object.entries(EQUIPMENT).map(([id, e]) => ({ id, name: e.name, cls: e.kind, gear: 'equipment' }));
    return ARSENAL.filter((w) => w.category === cat).map((w) => ({ id: w.id, name: w.name, cls: w.inspired, entry: w }));
  }

  _unlocked(entry) {
    return isUnlocked(entry, this.game.progress, !!this.game.settings.sandboxUnlock);
  }

  attachmentsFor(id) {
    const cfg = getWeaponConfig(id);
    const stored = this.loadout.attachments[id];
    return sanitizeAttachments(COMPAT[cfg.category], stored !== undefined ? stored : DEFAULT_ATTACHMENTS[id] || {});
  }

  setAttachment(id, slot, att) {
    const cur = { ...this.attachmentsFor(id) };
    if (att) cur[slot] = att; else delete cur[slot];
    this.loadout.attachments[id] = cur;
    this.game.saveLoadout();
    this.game.onLoadoutChanged(this.mode, 'attachment', id);
    this.render();
  }

  action(act) {
    const id = this.selected;
    const L = this.loadout;
    if (act === 'primary' || act === 'secondary') {
      L[act] = id;
      if (act === 'primary') this.game.settings.primary = id;
      this.game.onLoadoutChanged(this.mode, act, id);
    } else if (act === 'grenade') {
      const i = L.grenades.indexOf(id);
      if (i >= 0) L.grenades.splice(i, 1);
      else if (L.grenades.length < GRENADE_CAPACITY) L.grenades.push(id);
      this.game.onLoadoutChanged(this.mode, 'grenades');
    } else if (act === 'equipment') {
      const i = L.equipment.indexOf(id);
      if (i >= 0) L.equipment.splice(i, 1);
      else if (L.equipment.length < EQUIPMENT_CAPACITY) L.equipment.push(id);
      this.game.onLoadoutChanged(this.mode, 'equipment');
    }
    this.game.saveLoadout();
    this.render();
  }

  // ------------------------------------------------------------------ rendering
  render() {
    const items = this._items(this.cat);
    const L = this.loadout;
    $('lo-list').innerHTML = items.map((it) => {
      const locked = it.entry && !this._unlocked(it.entry);
      const tags = [];
      if (it.id === L.primary) tags.push('PRIMARY');
      if (it.id === L.secondary) tags.push('SIDEARM');
      if (it.gear === 'grenade' && L.grenades.includes(it.id)) tags.push('PACKED');
      if (it.gear === 'equipment' && (L.equipment.includes(it.id) || EQUIPMENT[it.id].always)) tags.push('PACKED');
      return `<div class="lo-item ${it.id === this.selected ? 'sel' : ''} ${locked ? 'locked' : ''}" data-id="${it.id}">
        <div class="lo-item-name">${locked ? '🔒 ' : ''}${esc(it.name)}</div>
        <div class="lo-item-cls">${esc(it.cls)}</div>
        ${tags.length ? `<div class="lo-tags">${tags.map((t) => `<span>${t}</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
    const it = items.find((i) => i.id === this.selected);
    if (it.gear) this._renderGear(it); else this._renderWeapon(it);
    this._renderSummary();
    this._previewDirty = true;
  }

  _bar(label, value, max, text) {
    const pct = Math.max(2, Math.min(100, (value / max) * 100));
    return `<div class="lo-stat"><span>${label}</span><div class="lo-bar"><i style="width:${pct}%"></i></div><b>${text ?? value}</b></div>`;
  }

  _renderWeapon(it) {
    const e = it.entry;
    const att = this.attachmentsFor(e.id);
    const base = getWeaponConfig(e.id);
    const cfg = applyAttachments(base, att);
    const r = weaponRatings(cfg);
    const unlocked = this._unlocked(e);
    $('lo-info').innerHTML = `
      <div class="lo-title">${esc(cfg.name)}</div>
      <div class="lo-insp">${esc(e.inspired)} · <i>original model</i></div>
      <div class="lo-class">${esc(cfg.cls)} · Fire modes: ${cfg.modes.map((m) => m.toUpperCase()).join(' / ')}${cfg.suppressed ? ' · SUPPRESSED' : ''}</div>
      <div class="lo-stats">
        ${this._bar('Magazine', cfg.magSize, 100, cfg.magSize)}
        ${this._bar('Reserve', cfg.reserveMax, 200, cfg.reserveMax)}
        ${this._bar('Damage', r.damage, 100)}
        ${this._bar('Fire rate', r.fireRate, 1100, `${r.fireRate} rpm`)}
        ${this._bar('Accuracy', r.accuracy, 100)}
        ${this._bar('Recoil', r.recoil, 100)}
        ${this._bar('Range', r.range, 280, `${r.range} m`)}
        ${this._bar('Mobility', r.mobility, 105, `${r.mobility}%`)}
      </div>
      <div class="lo-unlock ${unlocked ? 'ok' : 'no'}">${unlocked ? 'UNLOCKED' : `LOCKED · requires ${unlockText(e)} (you: ${this.game.progress.kills} kills, ${this.game.progress.missions} missions)`}</div>
      <div class="muted small">Gameplay values are fictional balance numbers.</div>`;
    const compat = COMPAT[e.category] || {};
    $('lo-attach').innerHTML = `<div class="lo-h">Attachments</div>` + ATTACHMENT_SLOTS.filter((s) => compat[s]).map((s) => `
      <div class="lo-slot"><span>${SLOT_LABEL[s]}</span>
        <button data-slot="${s}" class="${!att[s] ? 'on' : ''}">None</button>
        ${compat[s].map((a) => `<button data-slot="${s}" data-att="${a}" class="${att[s] === a ? 'on' : ''}" title="${esc(ATTACHMENTS[a].desc)} — ${esc(attachmentSummary(a).join(', '))}">${esc(ATTACHMENTS[a].name)}</button>`).join('')}
      </div>`).join('') + (Object.keys(att).length ? `<div class="lo-attsum">${Object.values(att).map((a) => `<b>${esc(ATTACHMENTS[a].name)}</b>: ${esc(attachmentSummary(a).join(', ') || ATTACHMENTS[a].desc)}`).join('<br>')}</div>` : '');
    const slot = base.slot;
    const isEquipped = (slot === 'primary' && this.loadout.primary === e.id) || (slot === 'secondary' && this.loadout.secondary === e.id);
    $('lo-actions').innerHTML = unlocked
      ? `<button class="btn primary" data-act="${slot}" ${isEquipped ? 'disabled' : ''}>${isEquipped ? 'Equipped' : `Equip as ${slot === 'secondary' ? 'sidearm' : 'primary'}`}</button>`
      : '<button class="btn" disabled>Locked</button>';
  }

  _renderGear(it) {
    const L = this.loadout;
    if (it.gear === 'grenade') {
      const t = THROWABLES[it.id];
      const packed = L.grenades.includes(it.id);
      $('lo-info').innerHTML = `<div class="lo-title">${t.icon} ${esc(t.name)}</div><div class="lo-insp">${esc(t.inspired)} · <i>original model</i></div>
        <div class="lo-class">${t.kind === 'lethal' ? 'Lethal' : 'Tactical'} throwable · carried: ${t.count} · fuse ${t.fuse}s · radius ${t.radius} m${t.duration ? ` · lasts ${t.duration}s` : ''}</div>
        <p>${esc(t.desc)}</p><div class="lo-unlock ok">UNLOCKED</div>`;
      $('lo-attach').innerHTML = `<div class="lo-h">Grenade pouch (${L.grenades.length}/${GRENADE_CAPACITY})</div><div class="muted small">5 selects grenades (press again to cycle type) · LMB overhand · RMB underhand · hold Q for the wheel</div>`;
      $('lo-actions').innerHTML = `<button class="btn primary" data-act="grenade" ${!packed && L.grenades.length >= GRENADE_CAPACITY ? 'disabled' : ''}>${packed ? 'Remove from pouch' : 'Pack'}</button>`;
    } else {
      const e = EQUIPMENT[it.id];
      const packed = L.equipment.includes(it.id) || e.always;
      $('lo-info').innerHTML = `<div class="lo-title">${esc(e.name)}</div><div class="lo-class">${e.kind === 'toggle' ? 'Toggle gear' : e.kind === 'melee' ? 'Melee' : 'Held device (slot 6)'}</div>
        <p>${esc(e.desc)}</p><div class="lo-unlock ok">UNLOCKED</div>`;
      $('lo-attach').innerHTML = `<div class="lo-h">Equipment (${L.equipment.length}/${EQUIPMENT_CAPACITY})</div><div class="muted small">N night vision · J thermal · L flashlight · 6 held devices (press again to cycle)</div>`;
      $('lo-actions').innerHTML = e.always ? '<button class="btn" disabled>Always carried</button>'
        : `<button class="btn primary" data-act="equipment" ${!packed && L.equipment.length >= EQUIPMENT_CAPACITY ? 'disabled' : ''}>${packed ? 'Remove' : 'Pack'}</button>`;
    }
  }

  _renderSummary() {
    const L = this.loadout;
    const p = getWeaponConfig(L.primary), s = getWeaponConfig(L.secondary);
    const att = (id) => { const a = this.attachmentsFor(id); const n = Object.values(a).map((x) => ATTACHMENTS[x].name); return n.length ? ` <i>(${esc(n.join(', '))})</i>` : ''; };
    $('lo-summary').innerHTML = `
      <div><span>Primary</span><b>${esc(p.name)}</b>${att(L.primary)}</div>
      <div><span>Sidearm</span><b>${esc(s.name)}</b>${att(L.secondary)}</div>
      <div><span>Grenades</span><b>${L.grenades.map((g) => `${THROWABLES[g].icon} ${esc(THROWABLES[g].name)}`).join(' · ') || '—'}</b></div>
      <div><span>Equipment</span><b>${L.equipment.map((e) => esc(EQUIPMENT[e].name)).join(' · ') || '—'}</b></div>`;
  }

  // ------------------------------------------------------------------ 3D preview (own renderer, created while open)
  _startPreview() {
    const canvas = $('lo-preview');
    if (!this.renderer) {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      } catch (err) {
        console.warn('[armory] 3D preview unavailable:', err.message);
        return;
      }
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.scene = new THREE.Scene();
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.7;
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(-1, 2, 2);
      this.scene.add(key);
      this.camera = new THREE.PerspectiveCamera(28, 1.6, 0.01, 20);
      this.holder = new THREE.Group();
      this.scene.add(this.holder);
    }
    this._previewDirty = true;
    this.t0 = performance.now();
    const loop = () => {
      if (!this.isOpen) return;
      this._raf = requestAnimationFrame(loop);
      this._drawPreview();
    };
    cancelAnimationFrame(this._raf);
    loop();
  }

  _stopPreview() {
    cancelAnimationFrame(this._raf);
  }

  _drawPreview() {
    const canvas = $('lo-preview');
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || !this.renderer) return;
    if (canvas.width !== w || canvas.height !== h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    if (this._previewDirty) {
      this._previewDirty = false;
      this.holder.clear();
      const it = this._items(this.cat).find((i) => i.id === this.selected);
      let m;
      if (it.gear === 'grenade') m = buildGrenadeModel(it.id);
      else if (it.gear === 'equipment') m = it.id === 'knife' ? buildWeaponModel('knife') : ['binoculars', 'rangefinder', 'detector', 'shield', 'medkit', 'ammopack', 'flashlight'].includes(it.id) ? buildEquipmentModel(it.id) : null;
      else m = buildWeaponModel(it.id, { attachments: this.attachmentsFor(it.id) });
      if (!m) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0x3a3f33, roughness: 0.6 }))); // goggles / light housing stand-in
        m = g;
      }
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      m.position.sub(c);
      this.holder.add(m);
      // Fit the model's length to ~80% of the preview width (its long axis faces the camera side-on).
      const len = Math.max(size.x, size.z), hgt = size.y;
      const vf = (this.camera.fov * Math.PI) / 360;
      const hf = Math.atan(Math.tan(vf) * this.camera.aspect);
      this.camDist = Math.max((len * 0.62) / Math.tan(hf), (hgt * 0.75) / Math.tan(vf)) + 0.03;
    }
    const t = (performance.now() - this.t0) / 1000;
    this.holder.rotation.y = -Math.PI / 2 + Math.sin(t * 0.4) * 0.6;
    this.camera.position.set(0, this.camDist * 0.18, this.camDist);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
