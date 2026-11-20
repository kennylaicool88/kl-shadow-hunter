// Weather and atmosphere. Keeps the shared atmosphere uniforms (sun direction, ground haze, in-scatter)
// in step with the current map, and drives rain: streaks animated entirely in the vertex shader
// around the camera (no per-frame CPU work), overcast lighting, wet materials and rain audio.
import * as THREE from 'three';
import { setAtmosphere } from '../render/Atmosphere.js';

const _dir = new THREE.Vector3();
const _sunCol = new THREE.Color();

const RAIN_BOX = 36; // m: streaks fill a box this wide around the viewer
const RAIN_HEIGHT = 22;

// Per-map haze settings (clear weather). Rain multiplies the density and kills the sun glow.
const HAZE = {
  'kl-day': { haze: 0.0022, falloff: 0.045, scatter: 0.55 },
  'kl-night': { haze: 0.004, falloff: 0.05, scatter: 0.12 },
  depot: { haze: 0.0016, falloff: 0.06, scatter: 0.5 },
};

class RainStreaks {
  constructor(scene) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector2(0.9, 0.35) },
        uColor: { value: new THREE.Color(0xb8c4d0) },
        uOpacity: { value: 0.32 },
      },
      vertexShader: /* glsl */`
        uniform vec3 uCam; uniform float uTime; uniform vec2 uWind;
        attribute vec4 seed; // x, z in box (0..1), phase (0..1), fall speed (m/s)
        attribute float tip; // 0 = head, 1 = tail of the streak
        varying float vFade;
        const float BOX = ${RAIN_BOX.toFixed(1)};
        const float H = ${RAIN_HEIGHT.toFixed(1)};
        void main() {
          // World-anchored drops wrapped into a box around the camera, so moving doesn't drag the rain.
          vec3 p;
          p.x = uCam.x + mod(seed.x * BOX - uCam.x + uWind.x * uTime, BOX) - BOX * 0.5;
          p.z = uCam.z + mod(seed.y * BOX - uCam.z + uWind.y * uTime, BOX) - BOX * 0.5;
          p.y = uCam.y + mod(seed.z * H - uTime * seed.w - uCam.y, H) - H * 0.5;
          vec3 vel = vec3(uWind.x, -seed.w, uWind.y);
          p -= normalize(vel) * tip * (0.35 + seed.w * 0.04);
          vec2 d = (p.xz - uCam.xz) / (BOX * 0.5);
          vFade = (1.0 - smoothstep(0.55, 1.0, length(d))) * (1.0 - tip * 0.85);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity; varying float vFade;
        void main() { gl_FragColor = vec4(uColor, uOpacity * vFade); }`,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.mesh = null;
    this.scene = scene;
    this.count = 0;
  }

  setCount(n) {
    if (n === this.count) return;
    this.count = n;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    if (!n) return;
    const seed = new Float32Array(n * 2 * 4);
    const tip = new Float32Array(n * 2);
    const pos = new Float32Array(n * 2 * 3); // unused by the shader; three needs a position attribute
    for (let i = 0; i < n; i++) {
      const s = [Math.random(), Math.random(), Math.random(), 9 + Math.random() * 4];
      seed.set(s, i * 8);
      seed.set(s, i * 8 + 4);
      tip[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
    this.mesh = new THREE.LineSegments(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'rain';
    this.scene.add(this.mesh);
  }

  update(camPos, time, visible) {
    if (!this.mesh) return;
    this.mesh.visible = visible;
    this.material.uniforms.uCam.value.copy(camPos);
    this.material.uniforms.uTime.value = time;
  }
}

export class WeatherSystem {
  constructor(game) {
    this.game = game;
    this.streaks = new RainStreaks(game.scene);
    this.raining = false;
    this.audible = false;
    this.time = 0;
    this.base = null; // the map's clear-weather lighting, captured before rain changes it
    this.wet = new Map(); // material -> { roughness, color } before wetting
  }

  get kind() { return this.game.settings.weather === 'rain' ? 'rain' : 'clear'; }

  // Call after a level loads, the time of day changes, or the weather / quality setting changes.
  // `fresh` = the map just reset its lighting (new level or time of day), so recapture the base.
  apply(fresh = false) {
    const g = this.game;
    const map = g.map;
    if (!map) return;
    if (fresh || !this.base || this.base.map !== map) this._capture(map);
    this._restore();
    this.raining = this.kind === 'rain';
    const q = g.quality;
    this.streaks.setCount(this.raining ? q.rain || 0 : 0);
    if (this.raining) this._makeRainy(map);
    this._syncAtmosphere();
  }

  _hazeKey() {
    const g = this.game;
    if (g.levelId === 'kl') return g.map.night ? 'kl-night' : 'kl-day';
    return 'depot';
  }

  _capture(map) {
    const s = this.game.scene;
    this.base = {
      map,
      fogNear: s.fog ? s.fog.near : 0,
      fogFar: s.fog ? s.fog.far : 0,
      fogColor: s.fog ? s.fog.color.clone() : null,
      sun: map.sun ? map.sun.intensity : 0,
      hemi: map.hemi ? map.hemi.intensity : 0,
      env: s.environmentIntensity,
      bg: s.backgroundIntensity,
      background: s.background,
      stars: map.stars ? map.stars.visible : null,
    };
  }

  // Overcast sky: equirect gradient, lighter at the horizon so the city melts into the rain haze.
  _overcast(fog, night) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const x = c.getContext('2d');
    const top = new THREE.Color(night ? 0x05070b : 0x5d666f);
    const hor = fog.clone().lerp(new THREE.Color(night ? 0x141a22 : 0xa7afb6), 0.35);
    const grd = x.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, `#${top.getHexString()}`);
    grd.addColorStop(0.5, `#${hor.getHexString()}`);
    grd.addColorStop(1, `#${fog.getHexString()}`);
    x.fillStyle = grd;
    x.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  _restore() {
    const b = this.base;
    const s = this.game.scene;
    if (s.fog && b.fogColor) { s.fog.near = b.fogNear; s.fog.far = b.fogFar; s.fog.color.copy(b.fogColor); }
    if (b.map.sun) b.map.sun.intensity = b.sun;
    if (b.map.hemi) b.map.hemi.intensity = b.hemi;
    s.environmentIntensity = b.env;
    s.backgroundIntensity = b.bg;
    if (s.background !== b.background) {
      if (s.background && s.background.isCanvasTexture) s.background.dispose();
      s.background = b.background;
    }
    if (b.stars !== null) b.map.stars.visible = b.stars;
    for (const [m, v] of this.wet) { m.roughness = v.roughness; m.color.copy(v.color); }
    this.wet.clear();
  }

  // Overcast tropical downpour: closer grey fog, weak sun, dim sky, wet (darker, glossier) surfaces.
  _makeRainy(map) {
    const s = this.game.scene;
    const b = this.base;
    const night = !!map.night;
    if (s.fog) {
      s.fog.near = b.fogNear * 0.45;
      s.fog.far = b.fogFar * 0.55;
      s.fog.color.lerp(new THREE.Color(night ? 0x0c1118 : 0x8c969e), 0.7);
    }
    if (map.sun) map.sun.intensity = b.sun * 0.28;
    if (map.hemi) map.hemi.intensity = b.hemi * 0.85;
    s.environmentIntensity = b.env * 0.75;
    if (s.fog) { s.background = this._overcast(s.fog.color, night); s.backgroundIntensity = 1; }
    if (map.stars) map.stars.visible = false;
    const u = this.streaks.material.uniforms;
    u.uOpacity.value = night ? 0.13 : 0.3;
    u.uColor.value.setHex(night ? 0x8a96a8 : 0xc4ccd4);
    const group = map.group || s;
    group.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || !m.isMeshStandardMaterial || this.wet.has(m) || m.transparent) continue;
        this.wet.set(m, { roughness: m.roughness, color: m.color.clone() });
        m.roughness = Math.max(0.12, m.roughness * 0.55);
        m.color.multiplyScalar(0.78);
      }
    });
  }

  _syncAtmosphere() {
    const g = this.game;
    const map = g.map;
    const h = HAZE[this._hazeKey()];
    const on = g.quality.atmosphere;
    if (map.sunDir) _dir.copy(map.sunDir);
    else if (map.sun) _dir.copy(map.sun.position).sub(map.sun.target.position).normalize();
    if (map.sun) _sunCol.copy(map.sun.color);
    setAtmosphere({
      sunDir: _dir,
      sunColor: _sunCol,
      haze: on ? h.haze * (this.raining ? 3 : 1) : 0,
      falloff: h.falloff,
      scatter: this.raining ? 0 : h.scatter,
    });
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    const p = g.camera.position;
    // No rain underground or inside lit interiors (maps raise exposure there).
    const indoors = p.y < -2 || (g.map.exposureAt && g.map.exposureAt(p) > 1.05);
    const audible = this.raining && g.state === 'playing' && !indoors;
    if (audible !== this.audible && g.audio.ready) { this.audible = audible; g.audio.setRain(audible); }
    if (this.raining) this.streaks.update(p, this.time, !indoors && g.equipment.vision !== 'thermal');
  }
}
