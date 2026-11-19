import './styles.css';
import * as THREE from 'three';
import { Game } from './game/Game.js';
window.__THREE = THREE; // debugging / probes
import { loadSettings } from './game/Settings.js';

function showError(message) {
  const box = document.getElementById('error-box');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('hidden');
}

window.addEventListener('error', (e) => showError(`Error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => showError(`Error: ${e.reason?.message || e.reason}`));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// Standalone drilling cinematic (?drilltest[&depth=300]) – runs without the FPS scene.
async function runDrillTest(params) {
  const { DrillingSequence } = await import('./underground/DrillingSequence.js');
  const { TacticalHUD } = await import('./ui/TacticalHUD.js');
  const { buildKLData } = await import('./city/klLevelData.js');
  document.getElementById('main-menu').classList.add('hidden');
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const resize = () => renderer.setSize(window.innerWidth, window.innerHeight, false);
  window.addEventListener('resize', resize);
  resize();
  const level = buildKLData();
  const hud = new TacticalHUD(document.getElementById('game-root'), level);
  hud.show();
  hud.setMode('drilling');
  const depth = Number(params.get('depth') || 300);
  const seq = new DrillingSequence();
  const state = { done: false, maxDepth: 0, breached: false, layers: [] };
  window.__drill = state;
  const fakeBunker = { id: 'TEST', name: 'DRILL TEST', category: 'hostile', depthFt: depth };
  seq.start(depth, fakeBunker, () => { state.done = true; });
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    for (const e of seq.update(dt)) {
      if (e.type === 'breach') state.breached = true;
      if (e.type === 'layer') state.layers.push(e.layer.name);
    }
    state.maxDepth = Math.max(state.maxDepth, seq.model.depth);
    hud.updateDrill(seq.model, fakeBunker, [state.done ? 'Sequence complete' : 'Standalone drilling test']);
    seq.render(renderer, window.innerWidth / window.innerHeight);
  });
}

const params = new URLSearchParams(location.search);
if (!hasWebGL()) {
  showError('WebGL is not available. Enable hardware acceleration in your browser settings or try another browser.');
} else if (params.has('drilltest')) {
  runDrillTest(params).catch((err) => showError(`Drill test failed: ${err.message}`));
} else if (params.has('forge')) {
  import('./dev/forgeGallery.js').then((m) => m.runForgeGallery(params)).catch((err) => { console.error(err); showError(`Forge gallery failed: ${err.stack || err.message}`); });
} else {
  try {
    const game = new Game(document.getElementById('game-canvas'), loadSettings());
    game.init().then(() => {
      // Exposed for debugging and automated smoke tests (after assets are ready).
      window.__game = game;
    }).catch((err) => { console.error(err); showError(`Failed to load assets: ${err.message}`); });
  } catch (err) {
    console.error(err);
    showError(`Failed to start: ${err.message}`);
  }
}
