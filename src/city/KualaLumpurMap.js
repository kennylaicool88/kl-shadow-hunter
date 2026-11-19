// Renderable Kuala Lumpur-inspired city. Assembles: PBR walkable architecture and detailed facades
// (BuildingManager / FacadeBuilder), the Twin Towers, KLCC Park (vegetation, reflective lake, fountain),
// street furniture and traffic (StreetDressing), the B1 tunnel dressing (lazy-loaded), HDRI day/night
// lighting with a following sun shadow, and mission props (intel, bunker surface clues, launch pad).
// Built from klLevelData, which is shared with collision and navigation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BuildingManager } from './BuildingManager.js';
import { StreetDressing } from './StreetDressing.js';
import { Vegetation } from './Vegetation.js';
import { TunnelDressing, TUNNEL_MODELS } from './TunnelDressing.js';
import { createCityTextures, createGlowTexture, createSignTexture } from './cityTextures.js';
import { applyEnvironment } from '../render/geometryUtils.js';
import { QUALITY } from '../render/RenderPipeline.js';

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();

const CITY_TEXTURES = ['asphalt', 'sidewalk', 'pavers', 'concrete', 'facade_tiles', 'facade_panels', 'grass', 'granite', 'metal_plate', 'corrugated', 'tunnel_tiles', 'hangar_floor', 'slab_wall', 'plaster', 'dirt'];
const CITY_MODELS = ['street_lamp', 'covered_car', 'aircon', 'utility_box', 'utility_box_2', 'trash_can', 'street_seating', 'planter', 'shrub'];

const LIGHTING = {
  day: { sun: 0xfff0d8, sunI: 3.4, hemi: 0.7, env: 1.0, bg: 1.0, fog: 0xbfcad3, fogNear: 160, fogFar: 650 },
  night: { sun: 0x8fa6d8, sunI: 0.25, hemi: 0.12, env: 0.55, bg: 0.22, fog: 0x0e1420, fogNear: 80, fogFar: 460 },
};

export class KualaLumpurMap {
  // Loads everything the city needs before construction (tunnel props are loaded later, lazily).
  static async preload(assets) {
    await Promise.all([
      assets.loadTextureSets(CITY_TEXTURES),
      assets.loadHDRI('day'),
      assets.loadHDRI('night'),
      assets.loadModels(CITY_MODELS),
    ]);
  }

  constructor(scene, data, { quality = 'high', renderer, timeOfDay = 'day', assets, onReady = null } = {}) {
    this.scene = scene;
    this.data = data;
    this.qName = quality;
    this.q = QUALITY[quality] || QUALITY.high;
    this.renderer = renderer;
    this.assets = assets;
    this.group = new THREE.Group();
    this.group.name = 'map-kl';
    this.textures = createCityTextures(this.q.aniso);
    this.glowTex = createGlowTexture();
    this.time = 0;
    this.night = timeOfDay === 'night';
    this.intelMeshes = new Map();
    this.vents = [];
    this.impactMarks = [];
    this.sky = new THREE.Object3D(); // anchor moved by Game (HDRI background replaces the old sky dome)
    this.stars = new THREE.Object3D(); // night state flag kept for compatibility (stars come from the night HDRI)
    const hdri = assets.hdri.get('day');
    this.envMap = hdri ? hdri.env : null;

    this.buildings = new BuildingManager(this.group, data, this.textures, this.envMap, assets);
    this.buildings.buildStatic(assets.hasModel('street_seating'));
    const rooftop = this.buildings.buildFacades();
    this.buildings.buildTwinTowers();
    this.buildings.buildSkyline();
    this._buildGroundSurfaces();
    this._buildPark();
    this.vegetation = new Vegetation(this.group, quality);
    this.vegetation.build(data.trees, data.palms || []);
    this.dressing = new StreetDressing(this.group, data, assets, this.q);
    this.dressing.build(rooftop, this.envMap);
    this._buildSigns();
    this._buildBunkerClues();
    this._buildLaunchPad();
    this._buildLights();
    for (const it of data.intel) this.addIntel(it);
    scene.add(this.group);
    this.setTimeOfDay(timeOfDay);

    // Underground zone: load and build the tunnel dressing after the city is on screen.
    this.tunnel = null;
    this.onReady = onReady;
    assets.loadModels(TUNNEL_MODELS).then(() => {
      if (this.disposed) return;
      this.tunnel = new TunnelDressing(this.group, assets, this.tunnelLights);
      this.tunnel.build();
      if (this.onReady) this.onReady();
    });
  }

  // ---------------------------------------------------------------- surfaces
  _plane(x0, z0, x1, z1, y = 0.012, repeat = 4) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / repeat, uv.getY(i) * (z1 - z0) / repeat);
    return g;
  }

  _decal(set, opts = {}) {
    const m = this.assets.pbr(set, { ...opts, key: `kl-decal-${set}-${opts.color ?? ''}` });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    return m;
  }

  _buildGroundSurfaces() {
    const add = (geos, mat, name) => {
      const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
      mesh.receiveShadow = true;
      mesh.name = name;
      this.group.add(mesh);
    };
    add([this._plane(-56, -30, 56, 38, 0.012, 4)], this._decal('grass'), 'park-grass');
    add([
      this._plane(-56, -72, 56, -66, 0.012, 3), this._plane(-56, -36, 56, -30, 0.012, 3),
      this._plane(-56, -66, -40, -36, 0.012, 3), this._plane(40, -66, 56, -36, 0.012, 3),
    ], this._decal('pavers'), 'plaza');
    add([
      this._plane(-34, -14, 34, -11, 0.02, 2.5), this._plane(-34, 19, 34, 22, 0.02, 2.5),
      this._plane(-34, -14, -31, 22, 0.02, 2.5), this._plane(31, -14, 34, 22, 0.02, 2.5),
      this._plane(-1.5, 22, 1.5, 38, 0.02, 2.5), this._plane(-1.5, -30, 1.5, -14, 0.02, 2.5), this._plane(26, 22, 30, 38, 0.02, 2.5),
    ], this._decal('sidewalk'), 'park-paths');
    add([this._plane(-42, 56, 0, 94, 0.012, 5)], this._decal('dirt'), 'yard');
    add([this._plane(2, 64, 22, 94, 0.012, 4), this._plane(58, 56, 96, 96, 0.012, 5)], this._decal('hangar_floor', { color: 0xb8b4ac }), 'lots');
    // Dashed centre lines
    const dashes = [];
    for (let x = -94; x < 94; x += 6) { dashes.push(this._plane(x, -78.1, x + 3, -77.9, 0.022, 1)); dashes.push(this._plane(x, 45.9, x + 3, 46.1, 0.022, 1)); }
    for (let z = -70; z < 32; z += 6) { dashes.push(this._plane(-64.1, z, -63.9, z + 3, 0.022, 1)); dashes.push(this._plane(63.9, z, 64.1, z + 3, 0.022, 1)); }
    add(dashes, new THREE.MeshStandardMaterial({ color: 0xe6e2cf, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }), 'lane-markings');
    // Outer ground + ring road beyond the playable area
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a5048, roughness: 1 }));
    outer.position.y = -0.06;
    outer.receiveShadow = true;
    this.group.add(outer);
    const ring = [];
    for (const [x0, z0, x1, z1] of [[-118, -118, 118, -104], [-118, 104, 118, 118], [-118, -104, -104, 104], [104, -104, 118, 104]]) ring.push(this._plane(x0, z0, x1, z1, -0.03, 6));
    add(ring, this.assets.pbr('asphalt', { key: 'kl-ring' }), 'ring-road');
  }

  // ---------------------------------------------------------------- park water & fountain
  _buildPark() {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(52, 24, 1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0x1d4652, metalness: 0, roughness: 0.04, transmission: 0, ior: 1.33, reflectivity: 0.9, envMapIntensity: 1.4, clearcoat: 1, clearcoatRoughness: 0.05 }),
    );
    const n = this.assets.textureSets.get('pavers');
    if (n) { water.material.normalMap = n.nor; water.material.normalScale.set(0.08, 0.08); }
    water.position.set(0, 0.25, 4);
    water.name = 'lake';
    this.group.add(water);
    this.water = water;
    const jetMat = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false, emissive: 0x223344 });
    this.jets = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.22, 1, 8).translate(0, 0.5, 0), jetMat, 14);
    this.jets.frustumCulled = false;
    this.group.add(this.jets);
  }

  // ---------------------------------------------------------------- signage
  _buildSigns() {
    this.signMats = [];
    const sign = (text, x, y, z, rotY, w = 6, h = 1.1, bg, fg, pole = false) => {
      const mat = new THREE.MeshStandardMaterial({ map: createSignTexture(text, bg, fg), roughness: 0.5, emissiveMap: null, emissive: 0x000000 });
      mat.emissiveMap = mat.map;
      this.signMats.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      this.group.add(m);
      if (pole) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, y, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f44, metalness: 0.8, roughness: 0.4 }));
        p.position.set(x, y / 2, z - 0.05);
        this.group.add(p);
      }
    };
    sign('JALAN CENDANA', -64, 4.5, 37, 0, 6, 1.1, '#1d5c3a', '#fff', true);
    sign('JALAN MERAK', 64, 4.5, 37, 0, 6, 1.1, '#1d5c3a', '#fff', true);
    sign('JALAN SERI KENANGA', 0, 4.5, 53.8, Math.PI, 8, 1.1, '#1d5c3a', '#fff', true);
    sign('STESEN · STATION', 28, 3.4, 27.6, 0, 4.2, 0.8, '#7a1f2b', '#fff');
    sign('PUSAT BELI-BELAH', 0, 9, -35.6, 0, 9, 1.4, '#20303d', '#f1d48a');
    sign('MENARA PEJABAT · LOBBY', 73.6, 4.2, 21, -Math.PI / 2, 7, 1, '#20303d', '#ffffff');
    sign('TAMAN KLCC', 0, 2.2, 37.6, 0, 5, 0.9, '#2e5e2a', '#fff', true);
    // Shophouse shop signs from the facade builder
    const names = ['KEDAI MAKAN', 'RESTORAN', 'FARMASI', 'KEDAI RUNCIT', 'KOPITIAM', 'KEDAI EMAS', 'DOBI'];
    this.buildings.facades.signs.forEach((s, i) => {
      const f = s.f;
      const x = f.ox + f.dx * s.u + f.nx * 0.05, z = f.oz + f.dz * s.u + f.nz * 0.05;
      const rot = Math.atan2(f.nx, f.nz);
      sign(names[i % names.length], x, s.y, z, rot, Math.min(3.6, s.w), 0.55, ['#a3241f', '#1f5a8a', '#2e6b3a', '#7a4a1f'][i % 4], '#f6ead0');
    });
    // Station canopy
    const steel = new THREE.MeshStandardMaterial({ color: 0x3b4146, metalness: 0.85, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x6c8a99, metalness: 0.6, roughness: 0.08, transparent: true, opacity: 0.55 });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.06, 5), glass);
    canopy.position.set(28, 3.25, 30);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5, 0.18, 0.12), steel);
    frame.position.set(28, 3.18, 27.6);
    this.group.add(canopy, frame);
    for (const [x, z] of [[25.8, 28], [30.2, 28], [25.8, 32.5], [30.2, 32.5]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 10), steel);
      p.position.set(x, 1.6, z);
      this.group.add(p);
    }
  }

  // ---------------------------------------------------------------- bunker surface clues
  _buildBunkerClues() {
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x5a6066, metalness: 0.85, roughness: 0.4 });
    const steamMat = new THREE.SpriteMaterial({ map: createGlowTexture('235,235,235'), transparent: true, depthWrite: false, opacity: 0.35 });
    for (const b of this.data.bunkers) {
      const [x, z] = b.surface;
      if (b.type === 'SURVEILLANCE_BUNKER') {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 16, 8), ventMat);
        mast.position.set(x, 8, z);
        const dish = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, side: THREE.DoubleSide, roughness: 0.4 }));
        dish.position.set(x + 0.6, 12, z);
        dish.rotation.z = -1.1;
        mast.castShadow = dish.castShadow = true;
        this.group.add(mast, dish);
        continue;
      }
      for (const [dx, dz] of [[-3, 0], [3, 1]]) {
        const v = new THREE.Group();
        v.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.2, 16), ventMat));
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16), ventMat);
        cap.position.y = 0.85;
        v.add(cap);
        v.position.set(x + dx, 0.6, z + dz);
        v.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.group.add(v);
        const puffs = [];
        for (let i = 0; i < 5; i++) {
          const sp = new THREE.Sprite(steamMat.clone());
          sp.position.set(x + dx, 1.3, z + dz);
          this.group.add(sp);
          puffs.push({ sp, t: i / 5 });
        }
        this.vents.push({ x: x + dx, z: z + dz, puffs, hot: b.type === 'DECOY_BUNKER' });
      }
    }
  }

  _buildLaunchPad() {
    const [x, , z] = this.data.launchPad;
    const g = new THREE.Group();
    g.name = 'launch-pad';
    const conc = this.assets.pbr('concrete', { key: 'kl-pad', color: 0xbab6ae });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 40), conc);
    pad.position.y = 1;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 34, 3), new THREE.MeshStandardMaterial({ color: 0xa33a2a, metalness: 0.6, roughness: 0.5 }));
    tower.position.set(-7, 17, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.4, 6, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x332200, emissive: 0xffc94a, emissiveIntensity: 2 }));
    ring.position.y = 2.1;
    g.add(pad, tower, ring);
    g.position.set(x, 0, z);
    this.group.add(g);
  }

  // ---------------------------------------------------------------- lights
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xdbe8ff, 0x857867, 0.7); // ground bounce (pure-sky HDRI has no ground)
    const sun = new THREE.DirectionalLight(0xfff1d6, 3.4);
    sun.castShadow = this.q.shadows;
    sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
    const sc = sun.shadow.camera;
    const R = this.q.shadowRange || 70;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 420;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.06;
    sun.shadow.radius = 3;
    this.sun = sun;
    this.group.add(this.hemi, sun, sun.target);
    // Interior practicals (mall, lobby) – shadowless, physically decaying
    for (const [x, y, z, i, d] of [[0, 10, -51, 90, 36], [85, 5, 21, 30, 18]]) {
      const l = new THREE.PointLight(0xffe2b8, i, d, 2);
      l.position.set(x, y, z);
      this.group.add(l);
    }
    // Tunnel lights are created now (the dressing arrives later) so the light count never changes.
    const points = [];
    for (let i = 0; i < 4; i++) {
      const p = new THREE.PointLight(0xe8f0ff, 0, 22, 2);
      p.position.set(0, -60, 0);
      this.group.add(p);
      points.push(p);
    }
    const spot = new THREE.SpotLight(0xff9a20, 0, 14, 0.45, 0.6, 2);
    spot.position.set(0, -60, 0);
    this.group.add(spot, spot.target);
    this.tunnelLights = { points, spot };
  }

  setTimeOfDay(tod) {
    this.night = tod === 'night';
    this.stars.visible = this.night;
    const L = this.night ? LIGHTING.night : LIGHTING.day;
    const hdri = this.assets.hdri.get(this.night ? 'night' : 'day') || this.assets.hdri.get('day');
    const sunDir = applyEnvironment(this.scene, hdri, { envIntensity: L.env, bgIntensity: L.bg });
    if (!hdri) { this.scene.background = new THREE.Color(this.night ? 0x0b1020 : 0x9fb8d0); this.scene.environment = null; }
    this.sunDir = this.night ? new THREE.Vector3(-0.3, 0.7, -0.4).normalize() : (sunDir || new THREE.Vector3(0.45, 0.75, 0.3).normalize());
    this.scene.fog = new THREE.Fog(L.fog, L.fogNear, L.fogFar);
    this.baseFog = { near: L.fogNear, far: L.fogFar };
    this.hemi.intensity = L.hemi;
    this.sun.intensity = L.sunI;
    this.sun.color.setHex(L.sun);
    this.buildings.setNight(this.night);
    this.dressing.setNight(this.night);
    for (const m of this.signMats) { m.emissive.setHex(this.night ? 0xffffff : 0x000000); m.emissiveIntensity = this.night ? 1.4 : 0; }
  }

  // Eye adaptation targets: brighter in tunnels and interiors, slightly lifted at night.
  exposureAt(p) {
    if (p.y < -3) return 1.5;
    const inMall = p.x > -40 && p.x < 40 && p.z > -66 && p.z < -36 && p.y < 11;
    const inLobby = p.x > 74 && p.z > 6 && p.z < 36 && p.y < 6;
    if (inMall || inLobby) return 1.3;
    return 1.0;
  }

  // ---------------------------------------------------------------- intel props
  addIntel(it) {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x23272b, metalness: 0.4, roughness: 0.5 });
    const screen = new THREE.MeshStandardMaterial({ color: 0x0a1a10, emissive: 0x46e08a, emissiveIntensity: 1.6 });
    if (it.kind === 'terminal') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.08), dark));
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.27), screen);
      s.position.z = 0.045;
      g.add(s);
    } else if (it.kind === 'laptop') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.28), dark));
      const lid = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.25), screen);
      lid.position.set(0, 0.13, -0.13);
      lid.rotation.x = -0.25;
      g.add(lid);
    } else if (it.kind === 'briefcase') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.12), new THREE.MeshStandardMaterial({ color: 0x3d2b1c, roughness: 0.55 })));
    } else {
      g.add(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf0ead6, roughness: 0.9 })));
    }
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: createGlowTexture('90,255,150'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    beacon.scale.setScalar(0.8);
    beacon.position.y = 0.3;
    g.add(beacon);
    g.userData.beacon = beacon;
    g.position.set(it.pos[0], it.pos[1], it.pos[2]);
    g.name = `intel-${it.id}`;
    this.group.add(g);
    this.intelMeshes.set(it.id, g);
    return g;
  }

  removeIntel(id) {
    const g = this.intelMeshes.get(id);
    if (!g) return;
    this.group.remove(g);
    g.traverse((o) => { if (o.isMesh || o.isSprite) { o.geometry?.dispose(); o.material?.dispose(); } });
    this.intelMeshes.delete(id);
  }

  markImpact(x, z, radius = 6) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: createGlowTexture('20,15,10'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    m.position.set(x, 0.05, z);
    this.group.add(m);
    this.impactMarks.push(m);
  }

  // ---------------------------------------------------------------- per-frame
  update(dt, camera) {
    this.time += dt;
    const c = camera.position;
    this.dressing.update(dt, c);
    if (this.tunnel) this.tunnel.update(dt, c);
    // Facade trim (mullions, sills, shutters) is distance-gated per chunk; 4 Hz is plenty.
    this._detailTimer = (this._detailTimer || 0) - dt;
    if (this._detailTimer <= 0) {
      this._detailTimer = 0.25;
      this.buildings.updateDetail(c, (this.q.facadeDetail || 90) + Math.max(0, c.y - 20) * 2);
    }
    // Sun/shadow camera follows the viewer so shadows stay sharp across the large map.
    const ground = Math.max(-10, Math.min(30, c.y));
    this.sun.target.position.set(c.x, ground, c.z);
    this.sun.position.set(c.x + this.sunDir.x * 200, ground + this.sunDir.y * 200, c.z + this.sunDir.z * 200);
    this.sun.target.updateMatrixWorld();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = i % 2 ? 6 : 3.5;
      const h = 2.5 + Math.sin(this.time * 2.2 + i) * 1.6 + (i % 2 ? 0 : 2.5);
      _q.identity();
      _m.compose(_p.set(Math.cos(a) * r, 0.25, 4 + Math.sin(a) * r), _q, _s.set(1, h, 1));
      this.jets.setMatrixAt(i, _m);
    }
    _s.set(1, 1, 1);
    this.jets.instanceMatrix.needsUpdate = true;
    for (const v of this.vents) {
      for (const p of v.puffs) {
        p.t = (p.t + dt * (v.hot ? 0.45 : 0.3)) % 1;
        p.sp.position.set(v.x + Math.sin(p.t * 6 + v.x) * 0.3, 1.3 + p.t * 4.5, v.z);
        p.sp.scale.setScalar(0.8 + p.t * 2.6);
        p.sp.material.opacity = (1 - p.t) * 0.35;
      }
    }
    for (const g of this.intelMeshes.values()) g.userData.beacon.material.opacity = 0.35 + Math.sin(this.time * 4) * 0.3;
  }

  setShadowQuality(quality) {
    const q = QUALITY[quality] || this.q;
    this.q = q;
    this.dressing.q = q;
    this.sun.castShadow = q.shadows;
    if (this.sun.shadow.mapSize.x !== q.shadowSize) {
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    const sc = this.sun.shadow.camera, R = q.shadowRange || 70;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R;
    sc.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    this.scene.remove(this.group);
    // Geometry is owned by the map; shared library materials/textures are kept for the next load.
    this.group.traverse((o) => { if (o.geometry && !o.isInstancedMesh) o.geometry.dispose(); });
    for (const t of Object.values(this.textures)) t.dispose();
    this.glowTex.dispose();
  }
}
