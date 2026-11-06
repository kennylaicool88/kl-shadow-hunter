// Fictionalized Kuala Lumpur city-centre level ("KLCC district") as pure data.
// Same box format as the Training Depot so collision, navigation and hit detection are shared.
// Orientation: +X east, -Z north. Units: metres. The playable area is |x|,|z| <= 96.
//
//   North road (traffic, fenced)          z -84 .. -72
//   Twin Towers on a podium mall          z -66 .. -36
//   KLCC Park with lake                   z -30 ..  38
//   South avenue                          z  38 ..  54
//   South district (yard, compound, lots) z  54 ..  96
//   West / east districts                 |x| 72 .. 96
//   B1 service tunnels (y = -8)           under the south avenue
import { box, wallX, wallZ } from '../maps/mapData.js';

export const KL_HALF = 96;
export const TUNNEL_Y = -8;
export const FT_PER_M = 3.28084;

// Rectangle subtraction: returns pieces of [x0,z0,x1,z1] not covered by any hole.
function subtract(rect, holes) {
  let pieces = [rect];
  for (const h of holes) {
    const next = [];
    for (const [x0, z0, x1, z1] of pieces) {
      if (h[0] >= x1 || h[2] <= x0 || h[1] >= z1 || h[3] <= z0) { next.push([x0, z0, x1, z1]); continue; }
      const hx0 = Math.max(x0, h[0]), hx1 = Math.min(x1, h[2]);
      const hz0 = Math.max(z0, h[1]), hz1 = Math.min(z1, h[3]);
      if (hz0 > z0) next.push([x0, z0, x1, hz0]);
      if (hz1 < z1) next.push([x0, hz1, x1, z1]);
      if (hx0 > x0) next.push([x0, hz0, hx0, hz1]);
      if (hx1 < x1) next.push([hx1, hz0, x1, hz1]);
    }
    pieces = next;
  }
  return pieces;
}

// Descending stairs along Z: top edge at zTop (ground level), going `dir` (+1 south / -1 north) down to floorY.
function stairsDownZ(x0, x1, zTop, dir, steps, floorY, depth, mat) {
  const out = [];
  const rise = -floorY / steps;
  for (let i = 0; i < steps - 1; i++) {
    const za = zTop + dir * depth * i;
    const zb = zTop + dir * depth * (i + 1);
    out.push(box(x0, floorY, za, x1, -rise * (i + 1), zb, mat));
  }
  return out;
}

export function buildKLData() {
  const solids = [];
  const add = (b) => (Array.isArray(b) ? solids.push(...b) : solids.push(b));
  const H = KL_HALF;
  const T = TUNNEL_Y;

  // Stairwell openings in the street slab (public entrance E1, hidden entrance E2).
  const E1 = [26, 28, 30, 42];
  const E2 = [-38, 60, -34, 74];
  const holes = [E1, E2];

  // ---------------------------------------------------------------- ground
  for (const [x0, z0, x1, z1] of subtract([-112, -112, 112, 112], holes)) add(box(x0, -1, z0, x1, 0, z1, 'asphalt'));

  // Perimeter (behind the outer buildings)
  add(box(-H - 2, 0, -H - 2, H + 2, 8, -H, 'concrete'));
  add(box(-H - 2, 0, H, H + 2, 8, H + 2, 'concrete'));
  add(box(-H - 2, 0, -H, -H, 8, -84, 'concrete'));
  add(box(-H - 2, 0, -72, -H, 8, H, 'concrete'));
  add(box(H, 0, -H, H + 2, 8, -84, 'concrete'));
  add(box(H, 0, -72, H + 2, 8, H, 'concrete'));
  // Road exits at the north road ends are fenced (traffic passes visually only).
  add(box(-H - 0.3, 0, -84, -H, 3, -72, 'fence'));
  add(box(H, 0, -84, H + 0.3, 3, -72, 'fence'));

  // ---------------------------------------------------------------- sidewalks (raised 0.15 m)
  const SW = 0.15;
  const sidewalks = [
    [-H, -84, H, -82], [-H, -74, H, -72], // north road
    [-72, -72, -70, 38], [-58, -72, -56, 38], // west avenue
    [56, -72, 58, 38], [70, -72, 72, 38], // east avenue
    [-H, 38, H, 40], [-H, 52, H, 54], // south avenue
  ];
  for (const r of sidewalks) for (const [x0, z0, x1, z1] of subtract(r, holes)) add(box(x0, 0, z0, x1, SW, z1, 'paving'));

  // Jersey barriers keep the player out of the live traffic lanes on the north road.
  add(box(-H, 0, -82.0, H, 1.0, -81.6, 'barrier'));
  add(box(-H, 0, -74.4, H, 1.0, -74.0, 'barrier'));

  // ---------------------------------------------------------------- buildings
  // Plain high-rises (solid). style drives facade texture; h = height.
  const buildings = [
    // North row
    { x0: -96, z0: -96, x1: -60, z1: -84, h: 70, style: 'glass' },
    { x0: -56, z0: -96, x1: -20, z1: -84, h: 48, style: 'office' },
    { x0: -16, z0: -96, x1: 16, z1: -84, h: 58, style: 'glass' },
    { x0: 20, z0: -96, x1: 56, z1: -84, h: 44, style: 'office' },
    { x0: 60, z0: -96, x1: 96, z1: -84, h: 82, style: 'glass' },
    // West district
    { x0: -96, z0: -70, x1: -74, z1: -36, h: 95, style: 'glass' },
    { x0: -96, z0: 6, x1: -74, z1: 36, h: 60, style: 'office' },
    // East district
    { x0: 74, z0: -70, x1: 96, z1: -36, h: 120, style: 'glass' },
    { x0: 74, z0: -30, x1: 96, z1: 0, h: 80, style: 'office' },
    // South district
    { x0: -96, z0: 56, x1: -64, z1: 96, h: 75, style: 'glass' },
    { x0: -60, z0: 56, x1: -42, z1: 96, h: 14, style: 'shophouse' },
    { x0: 24, z0: 56, x1: 56, z1: 96, h: 55, style: 'office' },
  ];
  for (const b of buildings) add(box(b.x0, 0, b.z0, b.x1, b.h, b.z1, `bld-${b.style}`));

  // ---------------------------------------------------------------- Twin Towers podium mall (enterable)
  const PR = 12; // podium roof
  const podium = { x0: -40, z0: -66, x1: 40, z1: -36 };
  add(wallX(-40, 40, -36, PR, 0.6, [[-4, 4], [-30, -26], [26, 30]], 'mall', 4));
  add(wallX(-40, 40, -66, PR, 0.6, [], 'mall'));
  add(wallZ(-66.3, -35.7, -40, PR, 0.6, [[-54, -50]], 'mall', 4));
  add(wallZ(-66.3, -35.7, 40, PR, 0.6, [[-54, -50]], 'mall', 4));
  add(box(-40.3, PR - 0.6, -66.3, 40.3, PR, -35.7, 'mallroof'));
  // Interior: columns, kiosks, atrium planters, security office
  for (const x of [-30, -18, 18, 30]) for (const z of [-58, -44]) add(box(x - 0.6, 0, z - 0.6, x + 0.6, PR - 0.6, z + 0.6, 'mall'));
  add(box(-10, 0, -54, -4, 1.1, -48, 'planter'));
  add(box(4, 0, -54, 10, 1.1, -48, 'planter'));
  add(box(-34, 0, -50, -31, 1.2, -46, 'kiosk'));
  add(box(31, 0, -46, 34, 1.2, -42, 'kiosk'));
  add(box(-24, 0, -64, -12, 3.5, -60, 'shop'));
  add(box(12, 0, -64, 20, 3.5, -60, 'shop'));
  // Security office (x 26..39, z -65..-56) with a door on its west side
  add(wallZ(-65.7, -55.7, 26, 3.2, 0.3, [[-63.2, -59.6]], 'mall', 2.6));
  add(wallX(26, 39.7, -56, 3.2, 0.3, [], 'mall'));
  add(box(34, 0, -64, 38, 0.9, -62, 'desk'));
  // Twin Towers stand on the podium roof (collision approximates the star plan).
  const towers = [{ x: -15, z: -51 }, { x: 15, z: -51 }];
  for (const t of towers) add(box(t.x - 8, PR, t.z - 8, t.x + 8, 170, t.z + 8, 'tower'));

  // Plaza fountain in front of the podium
  add(box(-3, 0, -32, 3, 0.6, -29, 'planter'));

  // ---------------------------------------------------------------- KLCC Park
  // Lake railing (x -26..26, z -8..16) – water is not walkable.
  add(box(-26.2, 0, -8.2, 26.2, 1.0, -8, 'rail'));
  add(box(-26.2, 0, 16, 26.2, 1.0, 16.2, 'rail'));
  add(box(-26.2, 0, -8, -26, 1.0, 16, 'rail'));
  add(box(26, 0, -8, 26.2, 1.0, 16, 'rail'));
  // Hedges / benches / pavilion as cover
  const hedges = [[-44, -20, -36, -19], [36, -20, 44, -19], [-48, 22, -40, 23], [40, 22, 48, 23], [-12, 24, -4, 25], [4, 30, 12, 31]];
  for (const [x0, z0, x1, z1] of hedges) add(box(x0, 0, z0, x1, 1.1, z1, 'hedge'));
  for (const [x, z] of [[-34, 0], [34, 4], [-20, 28], [20, 24], [0, -20]]) add(box(x - 1, 0, z - 0.3, x + 1, 0.5, z + 0.3, 'bench'));
  // Pavilion (roof on four pillars)
  for (const [x, z] of [[-46, 4], [-40, 4], [-46, 10], [-40, 10]]) add(box(x - 0.3, 0, z - 0.3, x + 0.3, 3.4, z + 0.3, 'mall'));
  add(box(-47, 3.4, 3, -39, 3.8, 11, 'mallroof'));
  // Trees: trunks collide (canopies are visual)
  const trees = [];
  for (let i = 0; i < 46; i++) {
    const a = i * 2.39996;
    const r = 30 + (i % 7) * 3.2;
    const x = Math.cos(a) * r * 1.35;
    const z = 4 + Math.sin(a) * r * 0.85;
    if (x < -54 || x > 54 || z < -28 || z > 36) continue;
    if (x > -28 && x < 28 && z > -10 && z < 18) continue; // lake
    if (x > 24 && x < 32 && z > 26) continue; // E1 entrance
    trees.push([x, z, 0.8 + (i % 5) * 0.12]);
    add(box(x - 0.3, 0, z - 0.3, x + 0.3, 4, z + 0.3, 'trunk'));
  }

  // Royal palms lining the podium plaza and the park edges (trunks collide).
  const palms = [];
  for (const x of [-48, -40, -24, -16, 16, 24, 40, 48]) palms.push([x, -31.2]);
  for (let z = -22; z <= 30; z += 9) { palms.push([-53.5, z]); palms.push([53.5, z]); }
  for (const [x, z] of palms) add(box(x - 0.25, 0, z - 0.25, x + 0.25, 9, z + 0.25, 'trunk'));

  // ---------------------------------------------------------------- West district: parking garage (rooftop access)
  const G = { x0: -96, z0: -30, x1: -76, z1: 0 };
  for (const [y0, y1] of [[3.6, 4], [7.6, 8], [11.6, 12]]) add(box(G.x0, y0, G.z0, G.x1, y1, G.z1, 'garage'));
  for (const x of [-94, -86, -78]) for (const z of [-28, -15, -2]) add(box(x - 0.4, 0, z - 0.4, x + 0.4, 11.6, z + 0.4, 'garage'));
  add(box(G.x0, 0, G.z0, G.x0 + 0.5, 12, G.z1, 'garage')); // back wall
  // Upper-floor parapets (open on the stair side at the top)
  for (const y of [4, 8]) {
    add(box(G.x0, y, G.z0, G.x1, y + 1, G.z0 + 0.3, 'garage'));
    add(box(G.x0, y, G.z1 - 0.3, G.x1, y + 1, G.z1, 'garage'));
  }
  add(box(G.x0, 12, G.z0, G.x1, 13.1, G.z0 + 0.3, 'garage'));
  add(box(G.x0, 12, G.z1 - 0.3, G.x1, 13.1, G.z1, 'garage'));
  add(box(G.x1 - 0.3, 12, -18, G.x1, 13.1, G.z1, 'garage'));
  // Exterior staircase along the garage's east face: bottom at z = 0, roof (y = 12) at z = -22.
  {
    const steps = 40, depth = 0.55, top = 12, rise = top / (steps + 1);
    for (let i = 0; i < steps; i++) {
      const za = 0 - depth * i, zb = 0 - depth * (i + 1);
      add(box(-76, 0, Math.min(za, zb), -73, rise * (i + 1), Math.max(za, zb), 'stairs'));
    }
    add(box(-73, 0, -22.2, -72.7, 13.1, 0, 'garage')); // outer handrail wall
  }

  // ---------------------------------------------------------------- East district: office lobby (enterable ground floor)
  const L = { x0: 74, z0: 6, x1: 96, z1: 36, lobbyH: 6, h: 90 };
  add(wallZ(L.z0, L.z1, L.x0 + 0.3, L.lobbyH, 0.6, [[18, 24]], 'lobby', 3.2));
  add(wallX(L.x0, L.x1, L.z0 + 0.3, L.lobbyH, 0.6, [], 'lobby'));
  add(wallX(L.x0, L.x1, L.z1 - 0.3, L.lobbyH, 0.6, [], 'lobby'));
  add(box(L.x1 - 0.6, 0, L.z0, L.x1, L.lobbyH, L.z1, 'lobby'));
  add(box(L.x0, L.lobbyH, L.z0, L.x1, L.h, L.z1, 'bld-glass'));
  add(box(84, 0, 14, 90, 1.1, 16, 'desk')); // reception
  add(box(80, 0, 28, 82, 2.2, 30, 'planter'));
  add(box(86, 0, 28, 88, 2.2, 30, 'planter'));

  // ---------------------------------------------------------------- South district open lots
  // Construction yard (x -42..0, z 56..94) behind a hoarding with two gates.
  add(wallX(-42, 0, 56, 2.6, 0.3, [[-30, -26], [-8, -4]], 'hoarding'));
  add(wallZ(56, 94, 0, 2.6, 0.3, [], 'hoarding'));
  add(wallX(-42, 0, 94, 2.6, 0.3, [], 'hoarding'));
  add(box(-42.3, 0, 56, -42, 14, 94, 'bld-shophouse'));
  // Shipping containers & site huts (cover; also hide the E2 stairwell)
  add(box(-32, 0, 62, -26, 2.6, 64.5, 'container'));
  add(box(-32, 0, 76, -30, 2.6, 82, 'container'));
  add(box(-40, 0, 77, -36, 2.6, 79.5, 'container'));
  add(box(-14, 0, 64, -8, 2.6, 66.5, 'container'));
  add(box(-14, 2.6, 64, -8, 5.2, 66.5, 'container'));
  add(box(-10, 0, 82, -4, 3, 88, 'hut'));
  add(box(-13, 0, 84, -11, 0.9, 86, 'desk')); // foreman's table
  // E2 rails (open at the south end, z = 74)
  add(box(-38.3, 0, 60, -38, 1.1, 74, 'rail'));
  add(box(-34, 0, 60, -33.7, 1.1, 74, 'rail'));
  add(box(-38.3, 0, 59.7, -33.7, 1.1, 60, 'rail'));

  // Telecom compound (x 2..22, z 64..94) – cover story for the protected surveillance post.
  add(wallX(2, 22, 64, 2.4, 0.3, [[10, 14]], 'fence'));
  add(wallZ(64, 94, 2, 2.4, 0.3, [], 'fence'));
  add(wallZ(64, 94, 22, 2.4, 0.3, [], 'fence'));
  add(wallX(2, 22, 94, 2.4, 0.3, [], 'fence'));
  add(box(14, 0, 84, 20, 3.2, 90, 'hut'));
  add(box(5, 0, 74, 7, 1.4, 76, 'cabinet'));

  // East lot (x 58..96, z 56..96): parked trucks & containers.
  add(box(62, 0, 82, 70, 3.2, 85, 'container'));
  add(box(76, 0, 70, 79, 3.2, 78, 'truck'));
  add(box(88, 0, 82, 94, 2.6, 84.5, 'container'));
  add(box(70, 0, 90, 82, 2.6, 92.5, 'container'));

  // Parked cars & police barricades on the closed avenues (cover).
  const cars = [
    [-66, -40, 'z'], [-62, -10, 'z'], [-66, 20, 'z'], [64, -50, 'z'], [62, -6, 'z'], [66, 26, 'z'],
    [-40, 44, 'x'], [-6, 48, 'x'], [40, 44, 'x'], [10, 44, 'x'],
  ];
  for (const [x, z, axis] of cars) {
    if (axis === 'z') add(box(x - 1, 0, z - 2.2, x + 1, 1.5, z + 2.2, 'car'));
    else add(box(x - 2.2, 0, z - 1, x + 2.2, 1.5, z + 1, 'car'));
  }
  for (const [x0, z0, x1, z1] of [[-70, 30, -58, 30.6], [58, 30, 70, 30.6], [-50, 40.5, -48, 51.5], [48, 40.5, 50, 51.5]]) {
    add(box(x0, 0, z0, x1, 1.0, z1, 'barrier'));
  }

  // ---------------------------------------------------------------- E1 public entrance kiosk
  add(box(25.7, 0, 28, 26, 1.1, 42, 'rail'));
  add(box(30, 0, 28, 30.3, 1.1, 42, 'rail'));
  add(box(25.7, 0, 42, 30.3, 1.1, 42.3, 'rail'));

  // ---------------------------------------------------------------- B1 service tunnels (y = -8)
  add(box(-56, T - 1, 38, 56, T, 76, 'tunnelfloor'));
  add(stairsDownZ(26, 30, 28, 1, 26, T, 14 / 26, 'stairs')); // E1: z 28 -> 42 going south
  add(stairsDownZ(-38, -34, 74, -1, 26, T, 14 / 26, 'stairs')); // E2: z 74 -> 60 going north
  const TW = (x0, z0, x1, z1) => add(box(x0, T, z0, x1, -1, z1, 'tunnel'));
  // Stairwell side walls (underground part)
  TW(25.5, 28, 26, 42); TW(30, 28, 30.5, 42);
  TW(-38.5, 50.5, -38, 74); TW(-34, 50.5, -33.5, 74);
  // Main corridor z 42..50, x -50..50
  for (const [a, b] of [[-50.5, 26], [30, 50.5]]) TW(a, 41.5, b, 42);
  const southGaps = [[-47, -45], [-38, -34], [-22, -18], [14, 18]];
  {
    let cur = -50.5;
    for (const [g0, g1] of southGaps) { TW(cur, 50, g0, 50.5); cur = g1; }
    TW(cur, 50, 50.5, 50.5);
  }
  TW(-50.5, 41.5, -50, 50.5);
  TW(50, 41.5, 50.5, 50.5);
  // Rooms south of the corridor
  const room = (x0, x1, z1) => { TW(x0 - 0.5, 50.5, x0, z1 + 0.5); TW(x1, 50.5, x1 + 0.5, z1 + 0.5); TW(x0 - 0.5, z1, x1 + 0.5, z1 + 0.5); };
  room(-50, -40, 62); // generator room
  room(-28, -12, 64); // storage
  room(10, 32, 66); // control room
  // Room furniture / cover
  add(box(-48, T, 56, -44, T + 2.4, 60, 'generator'));
  add(box(-26, T, 58, -22, T + 1.6, 62, 'crate'));
  add(box(-18, T, 54, -14, T + 1.6, 56, 'crate'));
  add(box(22, T, 62, 30, T + 1.0, 64, 'desk'));
  add(box(12, T, 60, 14, T + 2.2, 65, 'server'));
  // Corridor cover
  add(box(-6, T, 44, -2, T + 1.2, 46, 'crate'));
  add(box(36, T, 46, 40, T + 1.2, 48, 'crate'));

  // ---------------------------------------------------------------- gameplay data
  return {
    id: 'kl',
    solids,
    bounds: { min: [-H, -10, -H], max: [H, 20, H] },
    navLevels: [{ from: 4.6, length: 6 }, { from: -1.5, length: 8 }],
    navSpacing: 2.5,
    spawns: { A: [[0, 0, 32]], B: [] },
    spawnYaw: { A: 0, B: Math.PI },
    buildings,
    podium,
    podiumRoof: PR,
    towers,
    garage: G,
    lobby: L,
    trees,
    palms,
    holes,
    sidewalks,
    entrances: [
      { id: 'E1', name: 'Public station entrance', rect: E1, hidden: false },
      { id: 'E2', name: 'Hidden service stairwell', rect: E2, hidden: true },
    ],
    // Hostile NPC placement by zone. courier = carries intel when killed.
    hostiles: [
      { zone: 'park', pos: [-30, 0, 24], weapon: 'rifle' },
      { zone: 'park', pos: [32, 0, -18], weapon: 'rifle' },
      { zone: 'park', pos: [-40, 0, -12], weapon: 'shotgun', minDifficulty: 'normal' },
      { zone: 'mall', pos: [-22, 0, -42], weapon: 'rifle' },
      { zone: 'mall', pos: [22, 0, -56], weapon: 'pistol' },
      { zone: 'yard', pos: [-30, 0, 70], weapon: 'rifle' },
      { zone: 'yard', pos: [-10, 0, 76], weapon: 'shotgun' },
      { zone: 'yard', pos: [-22, 0, 90], weapon: 'sniper', minDifficulty: 'normal' },
      { zone: 'tunnel', pos: [-40, T, 46], weapon: 'rifle' },
      { zone: 'tunnel', pos: [0, T, 46], weapon: 'shotgun' },
      { zone: 'tunnel', pos: [24, T, 58], weapon: 'rifle', courier: true },
      { zone: 'eastlot', pos: [70, 0, 76], weapon: 'rifle' },
      { zone: 'eastlot', pos: [90, 0, 66], weapon: 'rifle', minDifficulty: 'hard' },
    ],
    zones: {
      park: [[-30, 0, 24], [30, 0, -20], [-40, 0, -12], [40, 0, 20], [0, 0, 26], [-34, 0, -24], [34, 0, -26]],
      mall: [[-22, 0, -42], [22, 0, -58], [0, 0, -40], [-30, 0, -62], [30, 0, -40], [0, 0, -60]],
      yard: [[-30, 0, 70], [-10, 0, 76], [-22, 0, 90], [-36, 0, 86], [-6, 0, 60]],
      tunnel: [[-40, T, 46], [0, T, 46], [24, T, 58], [40, T, 46], [-20, T, 58], [-45, T, 58]],
      eastlot: [[70, 0, 76], [90, 0, 66], [84, 0, 90], [64, 0, 60]],
    },
    reinforcementSpawns: [[-44, T, 46], [44, T, 46], [-20, 0, 92]],
    intel: [
      { id: 'I1', name: 'Mall security terminal', pos: [36, 0.9, -63], kind: 'terminal',
        reveals: [{ bunker: 'B-01', evidence: 55 }], text: 'Security logs show night-time excavation crews entering the construction yard south of the park.' },
      { id: 'I2', name: 'Site foreman laptop', pos: [-12, 0.95, 85], kind: 'laptop',
        reveals: [{ bunker: 'B-01', evidence: 60 }], text: 'Purchase orders for blast doors and air scrubbers: TIGER DEN is an active hostile command bunker.' },
      { id: 'I3', name: 'Joint task force notice', pos: [87, 1.1, 15], kind: 'terminal',
        reveals: [{ bunker: 'B-02', evidence: 100 }], text: 'JTF notice: SENTINEL beneath the telecom compound is an allied surveillance post. Protected – do not strike.' },
      { id: 'I4', name: 'Tunnel control server', pos: [26, T + 1.0, 63], kind: 'terminal',
        reveals: [{ bunker: 'B-03', evidence: 100 }, { bunker: 'B-04', evidence: 40 }],
        text: 'Install orders for thermal emitters at MIRAGE (decoy). Separate supply route to a deep site under the east lot.' },
      { id: 'I5', name: 'Smuggler\'s note', pos: [-36.5, 0.2, 76.5], kind: 'document',
        reveals: [{ bunker: 'B-01', evidence: 20 }], text: 'Hand-drawn map of a hidden stairwell behind the containers leading to the service tunnels.', revealsEntrance: 'E2' },
    ],
    courierIntel: {
      id: 'I6', name: 'Courier\'s briefcase', kind: 'briefcase',
      reveals: [{ bunker: 'B-04', evidence: 100 }], text: 'Courier manifest confirms COBRA PIT as the second hostile command bunker (300 ft).',
    },
    bunkers: [
      { id: 'B-01', name: 'TIGER DEN', type: 'HOSTILE_BUNKER', surface: [-20, 74], depthFt: 240, size: [18, 10], heat: 0.7, primary: true },
      { id: 'B-02', name: 'SENTINEL', type: 'SURVEILLANCE_BUNKER', surface: [12, 80], depthFt: 180, size: [12, 8], heat: 0.3 },
      { id: 'B-03', name: 'MIRAGE', type: 'DECOY_BUNKER', surface: [64, 64], depthFt: 120, size: [12, 8], heat: 1.0 },
      { id: 'B-04', name: 'COBRA PIT', type: 'HOSTILE_BUNKER', surface: [84, 76], depthFt: 300, size: [16, 10], heat: 0.7 },
    ],
    // Predefined in-game autopilot corridors (approach from the named side, ending above the city).
    corridors: {
      west: [[-700, 1000, 300], [-380, 760, 160], [-160, 520, 80]],
      south: [[100, 1000, 700], [60, 760, 380], [30, 520, 180]],
      east: [[700, 1000, -100], [400, 760, 0], [180, 520, 40]],
    },
    launchPad: [620, 0, -340],
    playerStart: [0, 0, 32],
  };
}
