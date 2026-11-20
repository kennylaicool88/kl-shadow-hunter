// Main / pause / settings / controls / end screens. Pure DOM wiring; game logic lives in Game.js.
import { saveSettings } from '../game/Settings.js';

const $ = (id) => document.getElementById(id);

export class Menu {
  constructor(settings) {
    this.settings = settings;
    this.screens = {
      main: $('main-menu'),
      pause: $('pause-menu'),
      settings: $('settings-menu'),
      controls: $('controls-menu'),
      end: $('end-screen'),
    };
    this.current = 'main';
    this.returnTo = 'main';
    this.handlers = {
      play: () => {}, resume: () => {}, restart: () => {}, quit: () => {}, settingsChanged: () => {}, loadout: () => {},
    };
    this._bindMatchOptions();
    this._bindSettings();
    this._bindButtons();
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  show(name) {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== name);
    this.current = name;
  }

  hideAll() {
    this.show(null);
  }

  setLoadoutSummary(text) {
    $('opt-loadout-summary').textContent = text;
  }

  setResumeHint(text) {
    $('resume-hint').textContent = text || '';
  }

  setLoading(text) {
    $('loading-status').textContent = text || '';
    $('btn-play').disabled = !!text; // can't start while assets/levels are loading
  }

  showEnd(victory, summaryHtml) {
    const title = $('end-title');
    title.textContent = victory ? 'Victory' : 'Defeat';
    title.className = victory ? 'win' : 'lose';
    $('end-summary').innerHTML = summaryHtml;
    this.show('end');
  }

  _bindRange(id, key, fmt, parse = parseFloat) {
    const input = $(id);
    const label = $(`${id}-val`);
    input.value = this.settings[key];
    const update = () => {
      this.settings[key] = parse(input.value);
      if (label) label.textContent = fmt(this.settings[key]);
    };
    update();
    input.addEventListener('input', () => {
      update();
      saveSettings(this.settings);
      this.handlers.settingsChanged(this.settings, key);
    });
  }

  _bindSelect(id, key, parse = (v) => v) {
    const el = $(id);
    el.value = String(this.settings[key]);
    el.addEventListener('change', () => {
      this.settings[key] = parse(el.value);
      saveSettings(this.settings);
      this.handlers.settingsChanged(this.settings, key);
      if (key === 'mode') this._updateModeRows();
    });
  }

  _bindCheck(id, key) {
    const el = $(id);
    el.checked = !!this.settings[key];
    el.addEventListener('change', () => {
      this.settings[key] = el.checked;
      saveSettings(this.settings);
      this.handlers.settingsChanged(this.settings, key);
    });
  }

  _bindMatchOptions() {
    this._bindSelect('opt-mode', 'mode');
    this._bindSelect('opt-difficulty', 'difficulty');
    this._bindRange('opt-enemies', 'enemyCount', (v) => v, (v) => parseInt(v, 10));
    this._bindRange('opt-allies', 'allyCount', (v) => v, (v) => parseInt(v, 10));
    this._bindRange('opt-rounds', 'roundsToWin', (v) => v, (v) => parseInt(v, 10));
    this._bindSelect('opt-roundtime', 'roundTime', (v) => parseInt(v, 10));
    this._bindSelect('opt-timeofday', 'timeOfDay');
    this._bindSelect('opt-weather', 'weather');
    this._updateModeRows();
  }

  _updateModeRows() {
    const mission = this.settings.mode === 'mission';
    $('ally-row').classList.toggle('hidden', this.settings.mode !== 'team');
    // Round-based options don't apply to the mission; time of day only applies to the city.
    for (const id of ['enemies-row', 'rounds-row', 'roundtime-row']) $(id).classList.toggle('hidden', mission);
    $('tod-row').classList.toggle('hidden', !mission);
  }

  _bindSettings() {
    this._bindRange('set-sens', 'sensitivity', (v) => v.toFixed(2));
    this._bindRange('set-fov', 'fov', (v) => `${v}°`, (v) => parseInt(v, 10));
    this._bindRange('set-vol', 'volume', (v) => `${Math.round(v * 100)}%`);
    this._bindRange('set-move', 'moveSpeed', (v) => `${Math.round(v * 100)}%`);
    this._bindRange('set-scale', 'renderScale', (v) => `${Math.round(v * 100)}%`);
    this._bindSelect('set-graphics', 'graphics');
    this._bindCheck('set-invert', 'invertY');
    this._bindCheck('set-fps', 'showFps');
    this._bindCheck('set-drs', 'dynamicRes');
  }

  _bindButtons() {
    $('btn-play').addEventListener('click', () => this.handlers.play());
    $('btn-loadout-main').addEventListener('click', () => this.handlers.loadout('menu'));
    $('btn-loadout-pause').addEventListener('click', () => this.handlers.loadout('pause'));
    $('btn-settings-main').addEventListener('click', () => this.openSettings('main'));
    $('btn-settings-pause').addEventListener('click', () => this.openSettings('pause'));
    $('btn-settings-back').addEventListener('click', () => this.show(this.returnTo));
    $('btn-controls').addEventListener('click', () => this.show('controls'));
    $('btn-controls-back').addEventListener('click', () => this.show('main'));
    $('btn-resume').addEventListener('click', () => this.handlers.resume());
    $('btn-restart-pause').addEventListener('click', () => this.handlers.restart());
    $('btn-restart-end').addEventListener('click', () => this.handlers.restart());
    $('btn-quit').addEventListener('click', () => this.handlers.quit());
    $('btn-menu-end').addEventListener('click', () => this.handlers.quit());
  }

  openSettings(returnTo) {
    this.returnTo = returnTo;
    this.show('settings');
  }
}
