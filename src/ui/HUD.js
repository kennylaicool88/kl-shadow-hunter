// Heads-up display. DOM is only touched when a displayed value actually changes.

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.root = $('hud');
    this.el = {
      crosshair: $('crosshair'),
      chTop: document.querySelector('#crosshair .ch-top'),
      chBottom: document.querySelector('#crosshair .ch-bottom'),
      chLeft: document.querySelector('#crosshair .ch-left'),
      chRight: document.querySelector('#crosshair .ch-right'),
      hitmarker: $('hitmarker'),
      scope: $('scope-overlay'),
      damageFlash: $('damage-flash'),
      damageInd: $('damage-indicators'),
      scoreA: $('score-a'),
      scoreB: $('score-b'),
      timer: $('round-timer'),
      roundInfo: $('round-info'),
      aliveInfo: $('alive-info'),
      center: $('center-message'),
      sub: $('sub-message'),
      killfeed: $('killfeed'),
      health: $('hud-health'),
      armor: $('hud-armor'),
      kills: $('hud-kill-count'),
      weaponName: $('hud-weapon-name'),
      mag: $('hud-mag'),
      reserve: $('hud-reserve'),
      ammoBox: document.querySelector('.hud-ammo'),
      reloadBar: $('reload-bar'),
      reloadFill: $('reload-fill'),
      slots: $('weapon-slots'),
      pickup: $('pickup-hint'),
      fps: $('fps-counter'),
      buy: $('buy-menu'),
      scoreboard: $('scoreboard'),
      icon: $('hud-weapon-icon'),
      fireMode: $('hud-firemode'),
      heat: $('hud-heat'),
      heatFill: $('hud-heat-fill'),
      grenades: $('hud-grenades'),
      equipment: $('hud-equipment'),
      objective: $('hud-objective'),
      detection: $('hud-detection'),
      markers: $('hud-markers'),
      wheel: $('weapon-wheel'),
      flash: $('flashbang'),
      vision: $('vision-label'),
      range: $('range-readout'),
    };
    this.cache = {};
    this.hitTimer = 0;
    this.damageAlpha = 0;
    this.messageTimer = 0;
    this.flashAlpha = 0;
    this.flashHold = 0;
    this.icons = null; // WeaponIcons (set by Game)
    this.onFlash = null;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  _set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  _toggle(key, el, cls, on) {
    if (this.cache[key] === on) return;
    this.cache[key] = on;
    el.classList.toggle(cls, on);
  }

  // gapPx: crosshair gap in pixels (derived from weapon spread so it's an honest indicator).
  setCrosshair(gapPx, visible) {
    this._toggle('chHidden', this.el.crosshair, 'hidden-ch', !visible);
    const g = Math.round(Math.max(3, Math.min(80, gapPx)));
    if (this.cache.chGap === g) return;
    this.cache.chGap = g;
    this.el.chTop.style.top = `${-g - 8}px`;
    this.el.chBottom.style.top = `${g}px`;
    this.el.chLeft.style.left = `${-g - 8}px`;
    this.el.chRight.style.left = `${g}px`;
  }

  showHitMarker(kind = 'hit') {
    const hm = this.el.hitmarker;
    hm.className = `show ${kind === 'kill' ? 'kill' : kind === 'head' ? 'head' : ''}`;
    this.hitTimer = kind === 'kill' ? 0.35 : 0.18;
  }

  // dirAngle: angle of the damage source relative to the view (radians, 0 = in front).
  showDamage(amount, dirAngle) {
    this.damageAlpha = Math.min(1, this.damageAlpha + amount / 40);
    if (dirAngle === null || dirAngle === undefined) return;
    const ind = document.createElement('div');
    ind.className = 'dmg-ind';
    ind.style.transform = `rotate(${dirAngle}rad)`;
    this.el.damageInd.appendChild(ind);
    setTimeout(() => { ind.style.opacity = '0'; }, 400);
    setTimeout(() => ind.remove(), 1100);
  }

  setVitals(health, armor, kills) {
    this._set('hp', this.el.health, String(Math.max(0, Math.ceil(health))));
    this._set('ar', this.el.armor, String(Math.max(0, Math.ceil(armor))));
    this._toggle('hpLow', this.el.health.parentElement, 'low', health <= 25);
    this._set('kills', this.el.kills, String(kills));
  }

  setWeapon(state) {
    this._set('wname', this.el.weaponName, state.name);
    if (this.icons && this.cache.iconId !== state.id) {
      this.cache.iconId = state.id;
      const url = this.icons.get(state.id);
      this.el.icon.src = url || '';
      this.el.icon.style.visibility = url ? 'visible' : 'hidden';
    }
    const fm = [state.fireMode ? state.fireMode.toUpperCase() : '', state.suppressed ? 'SUPP' : '', state.ads > 0.5 ? 'ADS' : ''].filter(Boolean).join(' · ');
    this._set('fmode', this.el.fireMode, fm);
    this._set('mag', this.el.mag, state.melee ? '–' : String(state.mag));
    this._set('reserve', this.el.reserve, state.melee ? '–' : String(state.reserve));
    this._toggle('empty', this.el.ammoBox, 'empty', !state.melee && state.mag === 0);
    this._toggle('low', this.el.ammoBox, 'low', !state.melee && state.magSize > 0 && state.mag > 0 && state.mag <= Math.ceil(state.magSize * 0.25));
    this._toggle('reloading', this.el.reloadBar, 'active', state.reloading);
    if (state.reloading) this._set('reloadPct', this.el.reloadFill.style, `${Math.round(state.reloadProgress * 100)}%`, 'width');
    const hasHeat = state.heat !== null && state.heat !== undefined;
    this._toggle('heatOn', this.el.heat, 'hidden', !hasHeat);
    if (hasHeat) {
      this._set('heatW', this.el.heatFill.style, `${Math.round(state.heat * 100)}%`, 'width');
      this._toggle('heatOver', this.el.heat, 'over', state.overheated);
    }
    const gKey = state.grenades.map((g) => `${g.type}:${g.count}:${g.active}`).join('|');
    if (this.cache.gren !== gKey) {
      this.cache.gren = gKey;
      this.el.grenades.innerHTML = state.grenades.map((g) => `<span class="gr ${g.active ? 'active' : ''} ${g.count ? '' : 'empty'}" title="${g.name}"><i>${g.icon}</i>${g.count}</span>`).join('');
    }
    this._setScope(state.scoped ? state.scopeType : null);
    this._setWheel(state.wheel);
    const slotsKey = state.slots.map((s) => `${s.name}:${s.active}`).join('|');
    if (this.cache.slots !== slotsKey) {
      this.cache.slots = slotsKey;
      this.el.slots.innerHTML = state.slots
        .filter((s) => s.name)
        .map((s) => `<div class="slot ${s.active ? 'active' : ''}"><b>${s.key}</b> ${s.name}</div>`)
        .join('');
    }
  }

  _setScope(type) {
    if (this.cache.scopeType === type) return;
    this.cache.scopeType = type;
    this.el.scope.classList.toggle('hidden', !type);
    this.el.scope.dataset.type = type || '';
  }

  _setWheel(w) {
    const key = w ? `${w.entries.length}:${w.choice}` : '';
    if (this.cache.wheel === key) return;
    this.cache.wheel = key;
    this.el.wheel.classList.toggle('hidden', !w);
    if (!w) return;
    const n = w.entries.length;
    this.el.wheel.innerHTML = w.entries.map((e, i) => {
      const a = (i / n) * Math.PI * 2;
      const x = Math.sin(a) * 190, y = -Math.cos(a) * 190;
      const img = this.icons && e.kind === 'slot' ? `<img src="${this.icons.get(e.id)}" alt="">` : '';
      return `<div class="wh-item ${i === w.choice ? 'sel' : ''} ${e.disabled ? 'off' : ''}" style="transform:translate(${x.toFixed(0)}px,${y.toFixed(0)}px)">${img}<span>${e.label}</span></div>`;
    }).join('') + `<div class="wh-center">${w.choice !== null && w.choice !== undefined ? w.entries[w.choice].label : 'Select'}</div>`;
  }

  // Equipment strip: [{ id, label, on, bat, count, emp }]
  setEquipment(items, vision) {
    const key = JSON.stringify(items) + vision;
    if (this.cache.equip === key) return;
    this.cache.equip = key;
    this.el.equipment.innerHTML = items.map((it) => {
      const count = it.count !== undefined ? `×${it.count}` : '';
      const bar = it.bat !== undefined && it.bat !== null ? `<em style="width:${it.bat}%"></em>` : '';
      return `<span class="eq ${it.on ? 'on' : ''} ${it.emp ? 'emp' : ''}" title="${it.id}"><i>${it.label}</i>${count}${bar}</span>`;
    }).join('');
    this.el.vision.classList.toggle('hidden', vision === 'none');
    this.el.vision.textContent = vision === 'nvg' ? 'NV · GEN III' : vision === 'thermal' ? 'THERMAL · WHITE HOT' : '';
  }

  setObjective(text) {
    this._set('obj', this.el.objective, text || '');
  }

  // level: clear | watched | suspicious | detected | engaged
  setDetection(level, text) {
    this._set('det', this.el.detection, text);
    if (this.cache.detLevel !== level) { this.cache.detLevel = level; this.el.detection.className = `det-${level}`; }
  }

  // Screen-space markers: [{ x, y, label, kind }]
  setMarkers(list) {
    const key = list.map((m) => `${Math.round(m.x / 3)},${Math.round(m.y / 3)},${m.label},${m.kind}`).join('|');
    if (this.cache.markers === key) return;
    this.cache.markers = key;
    this.el.markers.innerHTML = list.map((m) => `<div class="mk mk-${m.kind}" style="transform:translate(${m.x.toFixed(0)}px,${m.y.toFixed(0)}px)"><i></i><span>${m.label}</span></div>`).join('');
  }

  setRange(text) {
    this._toggle('rangeHidden', this.el.range, 'hidden', !text);
    if (text) this._set('rangeTxt', this.el.range, text);
  }

  // Flashbang whiteout (strength 0..1).
  flashbang(strength, duration) {
    this.flashAlpha = Math.min(1, Math.max(this.flashAlpha, strength * 1.2));
    this.flashHold = Math.max(this.flashHold, duration * 0.4);
    if (this.onFlash) this.onFlash(strength, duration);
  }

  setRound({ scoreA, scoreB, timeLeft, round, aliveA, aliveB, phase }) {
    this._set('sa', this.el.scoreA, String(scoreA));
    this._set('sb', this.el.scoreB, String(scoreB));
    const t = Math.max(0, Math.ceil(timeLeft));
    const txt = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this._set('timer', this.el.timer, txt);
    this._toggle('timerLow', this.el.timer, 'low', phase === 'live' && timeLeft < 15);
    this._set('round', this.el.roundInfo, phase === 'freeze' ? `Round ${round} · Buy time` : `Round ${round}`);
    this._set('alive', this.el.aliveInfo, `Alpha alive ${aliveA}  ·  Bravo alive ${aliveB}`);
  }

  message(text, sub = '', duration = 2.5) {
    this.el.center.textContent = text;
    this.el.sub.textContent = sub;
    this.messageTimer = duration;
  }

  clearMessage() {
    this.el.center.textContent = '';
    this.el.sub.textContent = '';
    this.messageTimer = 0;
  }

  killFeed(killerName, victimName, weaponName, headshot, involvesPlayer) {
    const e = document.createElement('div');
    e.className = `kf-entry ${involvesPlayer ? 'mine' : ''}`;
    const k = document.createElement('span');
    k.textContent = killerName;
    const w = document.createElement('span');
    w.className = 'kf-weapon';
    w.textContent = `[${weaponName}]`;
    const v = document.createElement('span');
    v.textContent = victimName;
    e.append(k, w, v);
    if (headshot) {
      const h = document.createElement('span');
      h.className = 'kf-hs';
      h.textContent = '◎';
      e.append(h);
    }
    this.el.killfeed.appendChild(e);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.firstChild.remove();
    setTimeout(() => e.remove(), 6000);
  }

  clearKillFeed() {
    this.el.killfeed.innerHTML = '';
  }

  setPickupHint(text) {
    this._toggle('pickupHidden', this.el.pickup, 'hidden', !text);
    if (text) this._set('pickupText', this.el.pickup, text);
  }

  setFps(visible, fps, resPct = 100) {
    this._toggle('fpsHidden', this.el.fps, 'hidden', !visible);
    if (visible) this._set('fps', this.el.fps, resPct < 100 ? `${fps} FPS · res ${resPct}%` : `${fps} FPS`);
  }

  setBuyMenu(visible) {
    this._toggle('buyHidden', this.el.buy, 'hidden', !visible);
  }

  setScoreboard(visible, data) {
    this._toggle('sbHidden', this.el.scoreboard, 'hidden', !visible);
    if (!visible || !data) return;
    const row = (c) => `<tr class="${c.alive ? '' : 'dead'} ${c.isPlayer ? 'me' : ''}"><td>${c.name}</td><td>${c.kills}</td><td>${c.deaths}</td><td>${c.alive ? '' : 'dead'}</td></tr>`;
    const html = (list) => list.sort((a, b) => b.kills - a.kills).map(row).join('');
    const key = JSON.stringify(data);
    if (this.cache.sb === key) return;
    this.cache.sb = key;
    document.getElementById('sb-a').innerHTML = html([...data.A]);
    document.getElementById('sb-b').innerHTML = html([...data.B]);
    document.getElementById('sb-score-a').textContent = data.scoreA;
    document.getElementById('sb-score-b').textContent = data.scoreB;
    document.getElementById('sb-mode').textContent = data.mode;
  }

  update(dt) {
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.el.hitmarker.className = '';
    }
    if (this.damageAlpha > 0) {
      this.damageAlpha = Math.max(0, this.damageAlpha - dt * 1.5);
      this.el.damageFlash.style.opacity = this.damageAlpha.toFixed(3);
      // Fully hide the full-screen layer when invisible so it isn't composited every frame.
      this.el.damageFlash.style.display = this.damageAlpha > 0.001 ? 'block' : 'none';
    }
    if (this.flashAlpha > 0) {
      if (this.flashHold > 0) this.flashHold -= dt;
      else this.flashAlpha = Math.max(0, this.flashAlpha - dt * 0.45);
      this.el.flash.style.opacity = this.flashAlpha.toFixed(3);
      this.el.flash.style.display = this.flashAlpha > 0.001 ? 'block' : 'none';
    }
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.clearMessage();
    }
  }

  reset() {
    this.clearKillFeed();
    this.clearMessage();
    this.damageAlpha = 0;
    this.flashAlpha = 0;
    this.flashHold = 0;
    this.el.flash.style.display = 'none';
    this.el.damageFlash.style.opacity = '0';
    this.el.damageInd.innerHTML = '';
    this.el.markers.innerHTML = '';
    this.cache = {};
  }
}
