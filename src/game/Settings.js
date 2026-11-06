// User settings persisted to localStorage (silently falls back to defaults if storage is unavailable).

const STORAGE_KEY = 'depot-strike-settings-v1';

export const DEFAULT_SETTINGS = {
  sensitivity: 1.0, // multiplier, 0.1 – 4
  invertY: false,
  fov: 80,
  volume: 0.7,
  graphics: 'auto', // auto | low | medium | high | ultra
  renderScale: 1.0,
  dynamicRes: true, // lower render resolution automatically under load
  showFps: false,
  // Match setup
  mode: 'solo', // solo | team | mission
  difficulty: 'normal', // easy | normal | hard
  enemyCount: 5,
  allyCount: 3,
  roundsToWin: 5,
  roundTime: 120,
  primary: 'rifle', // mirrors loadout.primary (kept for older code paths)
  sandboxUnlock: false, // armory: ignore unlock requirements
  timeOfDay: 'day', // day | night (Kuala Lumpur mission)
  // Movement tuning
  moveSpeed: 1.0, // multiplier 0.7 – 1.3
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable – settings stay for this session only */
  }
}

// ------------------------------------------------------------------ loadout & unlock progress
const LOADOUT_KEY = 'kl-loadout-v1';
const PROGRESS_KEY = 'kl-progress-v1';

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

export function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const loadLoadoutRaw = () => loadJSON(LOADOUT_KEY, {});
export const saveLoadoutRaw = (l) => saveJSON(LOADOUT_KEY, l);
export const loadProgress = () => loadJSON(PROGRESS_KEY, { kills: 0, missions: 0 });
export const saveProgress = (p) => saveJSON(PROGRESS_KEY, p);