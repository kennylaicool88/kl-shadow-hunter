# KL Shadow Hunter

A round-based, tactical first-person shooter for desktop browsers, with the *Operation Deep
Strike* mission set in Kuala Lumpur. Built with **Three.js**, plain **JavaScript ES modules** and
**Vite**.

**Play in the browser:** https://kennylaicool88.github.io/kl-shadow-hunter/ (desktop Chrome, Edge
or Firefox with WebGL; a mouse and keyboard are required).

The following are original to this project:
- the maps;
- the procedural weapon and equipment models;
- the enemy soldier, built in Blender by `scripts/blender/build_soldier.py` from the
  turnaround sheet in `docs/reference/`;
- the Web-Audio-synthesized sounds.

The external art (PBR textures, HDRIs, props, two firearm scans and the equipment scans) is CC0
from Poly Haven. It is downloaded and verified with `npm run assets`; see *Graphics pipeline and
assets* for the manifest and licences.

## Quick start

Requirements: **Node.js 18+** (tested with Node 24) and a desktop browser with WebGL
(Chrome, Edge or Firefox).

```bash
npm install
npm run dev
```

Vite opens http://localhost:5190. Click **Play**. The mouse is captured (pointer lock) as soon
as the match starts.

Production build:

```bash
npm run build      # outputs to dist/
npm run preview    # serves dist/ at http://localhost:4173
```

**GitHub Pages:** the site is published from the `gh-pages` branch, which holds a production build.
It is built with `BASE_PATH=/<repo>/` so asset paths resolve under the Pages sub-path.

To republish manually:

```powershell
$env:BASE_PATH='/kl-shadow-hunter/'; npm run build
```powershell

Then push the contents of `dist/` to `gh-pages`.

For automatic deploys on every push, copy `docs/deploy-workflow.yml` to
`.github/workflows/deploy.yml`. This needs a GitHub login with the `workflow` scope
(`gh auth refresh -s workflow`). Then set **Settings → Pages → Source** to *GitHub Actions*.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Aim / look |
| Left mouse | Fire (hold for automatic weapons) · throw grenade (overhand) · use held device |
| Right mouse (hold) | Aim down sights · bolt-rifle scope stages (click) · knife heavy stab · underhand throw · binocular zoom |
| R | Reload |
| X | Fire mode (auto / burst / semi, where the weapon has them) |
| F | Inspect weapon |
| Space | Jump |
| Shift (hold) | Walk: quiet and more accurate |
| Ctrl or C (hold) | Crouch: slower, more accurate, less recoil |
| 1 / 2 / 3 / 4 | Primary / sidearm / knife / Deep Strike uplink (mission) |
| 5 | Grenades (press again to cycle the type) |
| 6 | Held equipment (press again to cycle the device) |
| Q tap / Q hold | Last weapon / weapon wheel (move the mouse, release to select) |
| Mouse wheel | Cycle weapons |
| N / J / L | Night vision / thermal vision / flashlight (or weapon light) |
| E | Pick up a weapon on the ground |
| G | Drop the current weapon |
| B | Quick buy during buy time (1–5) · **6** opens the full armory |
| Tab (hold) | Scoreboard |
| Esc | Pause and release the mouse |

> **Ctrl+W closes the tab** in most browsers, and a web page cannot block that shortcut. If you
> strafe while crouched, use **C** to crouch.

## How to play

- **Solo vs Bots**: you (team Alpha) against 1–10 Bravo bots.
- **Team Elimination**: you and 1–9 Alpha bots against the Bravo bots.
- Each round starts with **4 s of buy time**. Nobody can move yet, and you can press **B** to
  buy weapons or armor. The armory stays open for the first 15 s of the live round.
- **Win a round** by eliminating every enemy. **Lose it** if your team is eliminated. When the
  timer runs out, the team with more survivors wins; equal numbers is a draw.
- The first team to reach the **rounds-to-win** setting wins the match. You then see the victory
  or defeat screen with your stats and a **Restart** button.
- If you survive a round you keep your weapons. If you die, you respawn with your chosen
  loadout. Dead bots drop their guns, and you pick them up with **E**.

## Weapons & equipment

**Armory & Loadout** (main menu, pause menu, or **B → 6** during buy time) has nine categories.
Each entry shows a live 3D preview, its class, magazine, reserve, damage, fire rate, accuracy,
recoil, effective range, mobility and unlock status. The loadout (primary, sidearm, attachments
per weapon, up to 4 grenade types, up to 7 pieces of gear) is saved in the browser. From the
pause menu during the mission, changes apply immediately as a field resupply; in the depot they
apply next round. Choices made in the armory during buy time apply immediately.

| Category | Weapons (fictional names, *look inspired by*) |
| --- | --- |
| Assault rifles (10) | AR-7 *M4A1*, HX-416 *HK416*, SC-16 *SCAR-L*, SC-17 *SCAR-H*, KV-12 *AK-12*, KV-15 *AK-15*, MX-300 *MCX*, BR-2 *BREN 2*, TX-95 *X95 bullpup*, SPR-68 *MCX Spear* |
| SMGs (6) | MK-5 *MP5*, PD-7 *MP7*, PX-90 *P90*, VK-45 *Vector*, MX-9 *MPX*, APX-9 *APC9* |
| Sniper rifles (7) | LR-50 (Poly Haven scan), AXR *AXMC*, MR-338 *MRAD*, AM-50 *M82*, TG-42 *TRG*, CT-408 *M200*, PR-7 modern chassis bolt-action |
| DMRs (4) | KS-25 *SR-25*, HX-417 *HK417*, EB-14 *MK14 EBR*, DV-7 *SVD-inspired* |
| Shotguns (4) | M-12 *870*, BN-4 *Benelli M4*, MS-590 *590*, SG-12 *Saiga-12* |
| Pistols (7) | P-9 (Poly Haven scan), GL-17, GL-19, SP-320, SP-226, FS-57 *Five-seveN*, DE-50 *Desert Eagle* |
| Heavy (5) | LM-249 *M249*, MN-46 *Minimi Para*, GP-240 *M240*, ARC-9 pulse rifle (fictional energy weapon with heat), HAMMER AT launcher (fictional rocket) |
| Grenades (9) | Frag, smoke, flashbang, stun, incendiary, EMP, sensor, decoy, EM pulse device |
| Equipment (10) | Combat knife, binoculars, NVG, thermal, laser rangefinder, flashlight, enemy detector, ballistic shield, medical kit, ammo pack |

**All gameplay numbers are fictional balance values.** They don't describe real weapon
performance. Rocket and energy-weapon behaviour is fictional.

**Attachments** visibly change the 3D model and the stats:
- Optics: red dot, holographic, 2x, 4x (full-screen chevron scope), 8x (mil-dot, two zoom stages
  on bolt rifles).
- Other slots: suppressor (quieter, no flash, slight damage loss), weapon light, laser (tighter
  hip fire, visible dot), foregrip (less recoil), extended magazine (+50%, or a +3 tube
  extension on pump guns), tactical stock.

**Grenade effects:**
- **Frag:** blast damage with falloff; walls block it.
- **Smoke:** a cloud that blocks the vision of bots, cameras and the tracker.
- **Flashbang:** bots that see it are blinded; the player gets a whiteout and ringing ears.
- **Stun:** slows bots and their aim.
- **Incendiary:** a burning zone that damages over time and makes bots retreat.
- **EMP:** disables surveillance cameras and bot optics and radios, and your own NV/thermal if
  you're caught in it.
- **Sensor:** sticks where it lands and reveals hostiles on the HUD and the mission tracker.
- **Decoy:** fake gunfire that bots investigate.
- **EM pulse device:** a larger, longer EMP.

Each grenade type has a counter and a cooldown.

**Enemy classes:**

| Class | Look | Weapons / behaviour |
| --- | --- | --- |
| Rifleman | Tan, helmet | Assault rifles |
| Heavy | Grey, armoured | LMGs and auto shotguns; 150 HP, slower |
| Sniper | Green, hood | Bolt rifles and DMRs; long view distance |
| Recon | Boonie hat | SMGs; faster, better hearing |
| Elite | Black, helmet + NVG | Spear, SCAR-H or 417 with holo/2x optic, suppressor and laser; more accurate |

**Surveillance cameras** (CC0 scan) sweep the depot and the district. If a camera holds you in
view for a second, it raises the alarm. EMP knocks cameras out. These cameras are unrelated to
the protected SENTINEL facility; the strike rules and mission-failure conditions are unchanged.

**About the models.** The two firearm scans on Poly Haven (service pistol, bolt-action rifle)
are used. Every other weapon is an original procedural model built in `src/weapons/forge/`.
Each one has its own silhouette and proportions, PBR materials with generated surface detail
(stippled grips, knurling, anodising, wood grain), and separately animated parts: magazine,
bolt, slide, pump and feed cover.

They are mid-poly game models (6k–50k triangles), not hand-sculpted hero assets of
AAA-production quality. To swap in a licensed glTF, add it to the manifest as
`models["weapon:<id>"]` and it is used instead. A weapon without a model is never silently
given another gun's model: it shows a magenta "MODEL MISSING" placeholder and logs a
`TEMPORARY FALLBACK`.

**Equipment models:** binoculars, medical kit, ammo box and flashlight are Poly Haven CC0
scans; the rangefinder, detector, shield and grenades are forge models.

**Performance after the overhaul:** measured with `node scripts/gfx-bench.mjs`, median of 3, on
the same Intel iGPU at 1920×1080.
- **Default Auto + dynamic resolution:** depot 53 fps (unchanged), KL street 45 fps (up from 37).
- **Depot at the High and Ultra presets:** dropped from 40 to 27 fps and from 26 to 16 fps,
  because enemies close to the camera now carry detailed weapons.
- **Already in place:** third-person weapons switch to a reduced model beyond 6 m, and weapon and
  gear meshes don't cast shadows.

60 fps is still not reached on this integrated GPU, and discrete GPUs were not measured.

Dev tools:
- `?forge&ids=…` renders a model gallery.
- `node scripts/forge-shots.mjs <dir> "ids=…&att=optic:x4"` takes GPU screenshots of it.
- `node scripts/probe.mjs` runs snippets in the live game and takes screenshots.

## Operation Deep Strike (Kuala Lumpur mission)

A single-player tactical mission set in a **fictionalized** Kuala Lumpur city centre. To play it,
choose **Mode → Operation Deep Strike** in the main menu, pick **Day** or **Night**, and click
**Play**. The city loads on demand (code-split), so the Training Depot never downloads it.

Everything in this mode is fictional gameplay. The projectile's "guidance" is authored animation:
Bézier curves, a cruise arc, predefined in-game corridors and a simple scoring rule that picks a
lock target from the game's own simulated signatures. "Mach 10", altitude and distance are
presentation values shown under time compression. The drilling is an animated tunnel, not a
penetration model.

### Mission flow
1. You start in KLCC Park facing the Twin Towers. Hostile NPCs patrol the park, the podium mall,
   the construction yard, the east lot and the B1 service tunnels.
2. **Gather intelligence.** Press **E** at terminals, laptops and documents (mall security office,
   site foreman's table, office-tower lobby, tunnel control room, a hidden note), and from the
   courier's briefcase. Intel locates facilities and confirms their classification.
3. **Use the tracker.**
   - Standing near a facility runs a subsurface scan. The scan detects a facility but can never
     confirm what it is on its own.
   - Hostiles appear on the radar as **confirmed** only when you can actually see them, and as
     **suspected** when you hear their gunfire.
   - The signal drops underground, indoors and near the towers.
4. **Inspect.** Press **V** for the underground cutaway (orbit with the mouse). It shows facility
   depths down to 300 ft, the B1 tunnels and each facility's status.
5. **Strike.**
   - Press **4** to equip the Deep Strike uplink, then left-click to open targeting.
   - Choose a facility (or a confirmed hostile contact), read its dossier, and pick the warhead
     (**M**: unitary or cluster), the cluster spread (**C**: tight or wide) and the seeker
     (**T**: auto-trace or heat-trace).
   - If the effect area touches a known protected facility, or the target is unidentified, the
     panel shows a warning and asks for a second confirmation before launch.
6. **Watch the flight.**
   - It passes through READY → TARGET SELECTED → LAUNCH → ASCENT → HIGH-ALTITUDE CINEMATIC →
     CRUISE (auto-cruise arc) → AUTOPILOT (corridor waypoints) → TARGET TRACKING →
     TERMINAL APPROACH → IMPACT → IMPACT RESOLUTION.
   - The flight HUD shows a speed dial up to Mach 10, altitude, flight timer, target distance,
     lock progress and confidence, and warnings.
   - After a valid impact the drilling cinematic bores down to the facility's depth.
7. **Resolution.** The central validation service resolves every effect:
   - **HOSTILE_BUNKER**: neutralized.
   - **DECOY_BUNKER**: −25 intel and +30 enemy alert.
   - **UNKNOWN** (not positively identified at strike time): an uncertainty penalty, then the
     facility's true outcome applies.
   - **SURVEILLANCE_BUNKER**: **immediate mission failure**. This overrides every other result,
     including a hostile destroyed by the same cluster strike.
8. You win when both hostile facilities are neutralized. You fail if the protected post is hit,
   if you are killed, or if all three strikes are used with hostiles remaining. Restart keeps
   your settings.

Facilities: **B-01 TIGER DEN** (hostile, 240 ft), **B-02 SENTINEL** (protected allied surveillance
post, 180 ft), **B-03 MIRAGE** (decoy, 120 ft, hot thermal emitters) and **B-04 COBRA PIT** (hostile,
300 ft; it reads as unidentified until you get the courier's intel).

Seekers:
- **Auto-trace** locks only the designated target, needs line of sight and takes about 1.2 s.
- **Heat-trace** locks in about 0.6 s and follows moving NPCs, but a hotter decoy near the
  target can steal the lock.
- Both seekers model lock stability, confidence, signal interruption (at high alert) and lock
  loss with reacquisition.

### City features
- **Landmarks and streets:** original Twin Towers geometry (8-point star plan, setbacks,
  skybridge, pinnacles, two levels of detail) on an enterable podium mall, plus KLCC Park with a
  reflective lake and fountain.
- **Places you can enter:** street grid with sidewalks, streetlights and parked cars; a
  parking garage with an exterior stair to the roof; an office lobby; alleys; a construction yard
  with a hidden stairwell; a public station entrance down to the B1 tunnels (rooms, control room,
  generator room).
- **Atmosphere:** day and night lighting (lit windows, light pools, starry sky), fog,
  environment-map reflections on glass, moving traffic, and synthesized traffic and siren
  ambience.
- **Performance:** static city geometry merged per material, instanced trees, lights, cars and
  skyline, a sun shadow that follows the player, and lazily built cutaway and drilling scenes.
  Per-flight effects are disposed after each strike.

### Standalone drilling test
`http://localhost:5190/?drilltest&depth=300` runs only the drilling sequence, without the FPS
scene, and exposes `window.__drill` with progress values.

## Graphics pipeline and assets

### Assets (`public/assets/`, about 81 MB)
Run `npm run assets` to (re)download and **MD5-verify** every external asset and write
`public/assets/manifest.json`, which records the source URL and license of each file. The game
loads only what the manifest lists. If a file is missing, it uses a procedural fallback and logs
`[assets] TEMPORARY FALLBACK …` in the console.

| Type | Count | Source / license |
| --- | --- | --- |
| PBR texture sets (colour, OpenGL normal, packed AO/roughness/metal), 1k | 17 | Poly Haven, CC0 |
| HDRIs (day sky, night sky, concrete-tunnel interior) | 3 | Poly Haven, CC0 |
| glTF props: street lamp, covered car, AC unit, bins, utility boxes, seating, planter, shrub, duct, pipes, cables, fluorescent fitting, wall lamp, rack, desk, monitor, generator, barrels, crates, roller shutter, security light, power box | 27 | Poly Haven, CC0 |
| glTF weapons: service pistol, bolt-action rifle (sniper) | 2 | Poly Haven, CC0 |
| Rigged soldier (Idle/Walk/Run), `characters/kl_soldier.glb` | 1 | Original, project-owned. Built with Blender 5.2 by `scripts/blender/build_soldier.py` from `docs/reference/tactical-soldier-turnaround-sheet.png` (shemagh, plate carrier, hydration pack, camo cargo trousers, tan boots), with procedurally generated textures. About 15.9k triangles and 0.9 MB. Rebuild with `blender --background --factory-startup --python scripts/blender/build_soldier.py -- public/assets/characters/kl_soldier.glb [previewDir]`. |

### Rendering
- **Tone mapping and colour:** ACES filmic, sRGB output, eye adaptation (exposure rises in
  interiors and tunnels).
- **Lighting:** HDRI image-based lighting and reflections. The sun's shadow direction is taken
  from the brightest point of the HDRI. A warm hemisphere fill stands in for ground bounce,
  because the pure-sky HDRIs have no ground.
- **Shadows:** a PCF / PCF-soft sun shadow that follows the player.
- **Post-processing:** a half-float HDR buffer → GTAO ambient occlusion → restrained bloom (only
  pixels above 0.92 luminance) → depth of field (flight cinematics only) → colour grade and
  vignette → SMAA, or MSAA on Ultra.
- **Viewmodel:** the first-person weapon renders after post-processing, so it is never blurred
  or bloomed.
- **Baked lighting:** an ambient-occlusion approximation is baked into vertex colours on all
  static architecture.
- **Light budget:** dynamic lights are capped. Night streetlights use a pool of 4 lights
  reassigned to the lamps nearest the player; other fixtures are emissive and rely on bloom.

| Preset | Resolution | Shadows | Post |
| --- | --- | --- | --- |
| Low | 1× | off | none |
| Medium | 1× | 2048, PCF | bloom, SMAA |
| High | 1.25× | 2048, soft | GTAO, bloom, SMAA |
| Ultra | 1.5× | 4096, soft | GTAO (16 samples), bloom, 4× MSAA |
| **Auto** (default) | Medium on integrated or mobile GPUs, High otherwise | | |

**Dynamic resolution** (on by default; a toggle in Settings) lowers the render scale to as little
as 60% when frames take longer than about 22 ms.

### City art (KL mission)
- **Facades:** every high-rise is generated from its collision box. Glass curtain walls get real
  mullions, spandrels, setbacks and podium storefronts with canopies. Precast offices get piers,
  spandrels and sill ledges. Heritage shophouses get five-foot-way arcades, timber shutters,
  cornices and per-unit pastel colours. All buildings have rooftop plant, and their windows carry
  a per-pane night-lighting map.
- **Twin Towers:** stainless sunshade rings on every floor.
- **Park:** procedural rain trees and royal palms.
- **Streets:** traffic signals with live phases, zebra crossings, jersey barriers, bollards,
  drains, procedural clear-coat cars and the CC0 props above.
- **B1 tunnels:** concrete slab walls, a duct run, pipe and cable runs, fluorescent fittings,
  racks, consoles with screens, a generator, warning signs (BAHAYA / AWAS / KELUAR), hazard
  markings, drains, water stains and rotating amber beacons.

### Characters and weapons
- **Bots:** skinned soldiers with Idle/Walk/Run clips blended by real ground speed, so feet don't
  slide. A procedural layer adds two-bone IK for both hands on the rifle, aim lean, recoil, hit
  flinch and a death fall. Hitboxes are unchanged and independent of the mesh.
- **Pistol and sniper:** the Poly Haven scans.
- **Rifle, shotgun and knife:** original procedural models (beveled extruded receivers, rails,
  sights, curved magazine, wood furniture).
- **Viewmodel effects:** brass casing ejection, shotgun shells on the pump, muzzle smoke, and the
  existing recoil, reload and draw animations.

### Measured performance
Measured on the development machine: Intel integrated graphics (ANGLE D3D11), 1920×1080, median
of 3 interleaved trials, using `node scripts/gfx-bench.mjs`.

| View | Low | Medium | High | Ultra | Auto (Medium) + dynamic res |
| --- | --- | --- | --- | --- | --- |
| Training Depot | 140 | 53 | 40 | 26 | 53 fps at 100% resolution |
| KL towers | 41 | 24 | 14 | 9 | 36 fps at 60% resolution |
| KL street | 39 | 24 | 14 | 9 | 37 fps at 60% resolution |
| KL tunnel | 37 | 23 | 13 | 9 | 26 fps at 60% resolution |

**The 60 fps target is not met on this integrated GPU in the city.** It has not been measured
on a discrete desktop GPU. Run `node scripts/gfx-bench.mjs` on your own hardware to measure it.
The profiling tools used to find bottlenecks are:
- `scripts/gfx-cost.mjs`: cost per content category;
- `scripts/gfx-tris.mjs`: triangle budget;
- `scripts/gfx-cpu.mjs`: CPU vs GPU time;
- `scripts/gfx-probe.mjs`: GPU screenshots.

### Remaining placeholders, fallbacks and limitations
- **Character:** the only rigged character has Idle/Walk/Run clips. Aim, fire, hit and death are
  procedural layers, not authored clips. Both teams share one model with a tint. The
  soldier is a mid-poly, script-built model: its shapes are simplified compared with the
  photoreal reference sheet, and its walk and run cycles are procedural keyframes rather than
  motion capture.
- **Assault rifle, shotgun, knife, tablet:** procedural, because no suitable CC0 scans exist.
- **Trees:** procedural. Poly Haven's tree scans are 1.7–4.8M polygons each.
- **Distant horizon:** the skyline beyond the playable area is instanced textured boxes, a
  deliberate distant LOD.
- **Tunnel props:** some fittings are emissive only (no light) to stay within the light budget.
- **Not implemented:**
  - KTX2/Draco texture and mesh compression (assets are 1k JPEG + glTF);
  - lightmap baking (vertex-colour AO is used instead);
  - occlusion culling (frustum plus distance culling only);
  - foot IK.
- **Lighting assets:** the night and day HDRIs are pure skies, so ground bounce is approximated.

## Features

**Movement**: ground friction and acceleration in the classic PC-shooter style, limited air
control, jumping, crouch (including crouch-jumping onto crates), walking, stairs, gravity and a
landing camera dip. Movement uses delta time and sub-steps, so fast motion never tunnels
through walls.

**Weapons**: every weapon has its own damage, fire rate, magazine, reserve, reload time, recoil
pattern, spread, range falloff, armor penetration and sound.

| Weapon | Type | Dmg | Mag / reserve | Notes |
| --- | --- | --- | --- | --- |
| AR-7 Carbine | assault rifle | 32 | 30 / 90 | Full-auto with a learnable spray pattern |
| M-12 Breacher | pump shotgun | 9 × 19 | 7 / 28 | Reloads shell by shell; firing interrupts the reload |
| LR-50 Marksman | bolt sniper | 115 | 5 / 20 | Two zoom levels; very inaccurate unscoped |
| P-9 Sidearm | pistol | 30 | 12 / 48 | Semi-auto |
| Combat Knife | melee | 40 / 75 | – | Quick slash / heavy stab |

- Hitscan rays come from the camera through the crosshair, and spread is applied in a cone.
- Headshot ×4, body ×1, legs ×0.75. Armor absorbs part of the damage, except on leg hits.
- Spread grows with movement, jumping and sustained fire. The crosshair gap is computed from the
  real spread, so it is an honest accuracy indicator.
- Recoil kicks the view, which recovers when you stop firing.
- Effects: muzzle flash (with a dynamic light), tracers, bullet-hole decals, sparks and dust on
  impact, blood on hits, hit markers (white for a hit, yellow for a headshot, red for a kill), and
  animations for reload, weapon draw, the shotgun pump and the sniper bolt.
- **Walls always stop bullets**, for both the player and the bots. A target is hit only if it is
  closer than the first solid surface along the ray.

**Bots**: states for idle, patrol, alert (reaction delay), attack (aim, burst fire, strafe),
chase, investigate (sounds and last known position), take cover (low health or reloading), reload
and death.

- Bots see with a field of view, a view range and line-of-sight raycasts. They hear gunfire,
  running footsteps and the direction they are hit from.
- They navigate on a waypoint graph that is generated automatically from the level geometry
  (A* plus path smoothing). They climb stairs, avoid walls, and detect when they are stuck and
  repath.
- Difficulty (easy / normal / hard) scales reaction time, aim error, aim speed, FOV, armor,
  damage, how often they strafe and how often they take cover.

**Map ("Training Depot")**: outdoor yards, a roofed warehouse with four doors, a long west
alley, an elevated east platform reached by two staircases, a sniper tower, chokepoint walls
between the spawns and the middle, plus crates, barriers and barrels for cover. Every area has a
floor and collision.

**UI**: crosshair, health, armor, weapon, magazine and reserve ammo, reload bar, kill count,
round timer, team scores, alive counts, kill feed, damage-direction indicators, sniper scope
overlay, scoreboard, armory, pickup hints and an optional FPS counter. The menus are main, pause,
settings, controls and victory/defeat.

**Settings** (saved in localStorage): mouse sensitivity, invert Y, FOV, master volume, movement
speed, graphics quality (low turns shadows off; high uses 4K shadow maps and more texture
filtering), render scale and the FPS counter.

**Audio**: all sounds are synthesized with the Web Audio API. Bot sounds are positional (3D).
Audio starts on the first click, to comply with browser autoplay rules.

## Project structure

```
index.html                 Menus + HUD markup
src/
  main.js                  Entry point, WebGL check, global error display
  styles.css               HUD and menu styling
  game/
    Game.js                Orchestrator: renderer, loop, round flow, combat plumbing
    GameState.js           Round/match state machine (pure logic)
    Settings.js            Persisted settings
    combat.js              Hitboxes, damage multipliers, armor, falloff
    testHooks.js           Hooks used by the automated smoke test
  player/
    Player.js              Health/armor/stats, body and hitboxes
    PlayerController.js    Movement physics, mouse look, crouch, jump, footsteps
  weapons/
    weaponConfigs.js       Per-weapon stats
    Weapon.js              Ammo, cooldown, reload, spread state machine (pure logic)
    WeaponManager.js       Inventory, firing, recoil, scope, viewmodel animation
    WeaponModels.js        Low-poly weapon + hands models
    Effects.js             Pooled particles, decals, tracers, flashes
    Pickups.js             Dropped weapons
  enemies/
    Enemy.js               Bot entity + soldier model and animation
    EnemyAI.js             Bot state machine and difficulty presets
    EnemyManager.js        Spawning, bot gunfire, sound relay
    NavGraph.js            Auto-generated waypoint graph + A*
  maps/
    mapData.js             Level layout as pure box data (shared by render + physics)
    TrainingMap.js         Builds the merged, textured Three.js level, lights, sky
    Textures.js            Procedural canvas textures
  physics/
    CollisionSystem.js     AABB character collision (step-up/snap-down), ray casting
  ui/
    HUD.js                 HUD updates (only touches the DOM when values change)
    Menu.js                Menu screens and settings wiring
  audio/
    AudioManager.js        Synthesized, positional sound effects
  utils/
    InputManager.js        Keyboard/mouse state + pointer lock
  -- Operation Deep Strike (loaded on demand) --
  city/
    klLevelData.js         KL district as pure box data: streets, mall, garage, tunnels, bunkers, intel, corridors
    KualaLumpurMap.js      City renderer: park, lake, traffic, lights, day/night, env reflections, props
    BuildingManager.js     Merged facades, Twin Towers (LOD), instanced skyline
    cityTextures.js        Procedural facades (+ night emissive), paving, grass, signage
  bunkers/
    Bunker.js              Facility: unique id, true type, depth, footprint, evidence
    BunkerManager.js       Facility registry
  tracking/
    TargetClassification.js What the player knows (undiscovered / unidentified / confirmed categories)
    TerroristTracker.js    Radar contacts from the simulation, signal quality, subsurface scan
    TrackingModes.js       Auto-trace / heat-trace seeker simulation (lock, stability, decoys)
  mission/
    MissionRules.js        Central mission validation service (all strike effects go through it)
    MissionManager.js      Objectives, intel log, alert, strikes, victory/failure
    MissionMode.js         Connects the mission systems to the existing game loop
  weapons/
    ProjectileStateMachine.js  11-state flight FSM + Mach presentation profile (pure logic)
    SciFiProjectile.js     Scripted cinematic flight paths + flight camera
    ProjectileEffects.js   Projectile model, trail, clouds, streaks, cluster split, impact
  underground/
    DrillModel.js          Drilling progress through strata (pure logic, 300 ft max)
    DrillingSequence.js    Independent drilling scene (also standalone via ?drilltest)
    UndergroundView.js     Lazily built tactical cutaway scene
  ui/
    TacticalHUD.js         Mission HUD: minimap, radar, objectives, flight gauges, result screens
    TargetingInterface.js  Target selection, dossier, warhead/seeker options, launch confirmation
tests/                     Node unit tests (collision, weapons, nav, rounds, KL level, mission rules, projectile)
scripts/smoke-test.mjs     Headless browser end-to-end test (Training Depot + mission + drill page)
```

How the expansion fits the existing architecture:
- `Game.js` keeps one game loop. When the mission is active it delegates through a few hooks
  (`simulate`, camera, render, HUD, kills) to `MissionMode`.
- The FPS player, weapons, bots, collision, navigation and audio are the same systems used in
  the Training Depot. Only their level data changes.
- The projectile never touches the player's movement or physics. While an overlay (targeting,
  cutaway, flight, drilling) is open, the FPS world is paused.
- Target classification (`tracking/`) and mission rules (`mission/MissionRules.js`) contain no
  rendering code. They are unit-tested in Node.

The design uses a custom AABB collision system instead of a physics engine. The level is made
of axis-aligned boxes, so exact box collision and slab ray casts are fast, deterministic and
easy to test. No backend is needed for single-player.

## Testing

```bash
npm test          # unit tests (Node's built-in runner): collision, weapons, navigation, rounds
npm run smoke     # end-to-end: launches Vite + headless Chrome/Edge and plays the game
npm run smoke -- --shots ./screens   # also saves screenshots
```

The smoke test fails if any JavaScript error occurs. It covers the acceptance criteria:

- startup with no errors, entering the game, WASD movement, mouse look and jumping;
- wall collision;
- shots going toward the crosshair, damage dealt, and walls blocking shots (both directions);
- ammo use and reloading;
- bot line of sight, detection and attack;
- the kill counter;
- winning and losing rounds, the victory screen and restart;
- the buy menu, drop, pickup, scoreboard, pause, settings and resume;
- a 25-second soak test with eight bots, checking that they navigate and never end up inside
  geometry.

**Operation Deep Strike (all 17 expansion acceptance tests, labelled `[KL]`)**
- **City:** moving through the city; the Twin Towers (two LOD towers, more than 180 m tall);
  day/night lighting.
- **Tracker and intel:** no facilities revealed at start; intel and scans reveal them over time;
  line-of-sight contacts.
- **Cutaway:** shows each facility with its depth.
- **Flight:** all 11 flight states in order; Mach 10; the auto-cruise arc radius; autopilot
  passes every corridor waypoint.
- **Seekers:** auto-trace lock; heat-trace pulled onto the decoy; heat-trace following a moving
  NPC.
- **Drilling:** reaches 240 ft and 300 ft in the mission, and 300 ft on the standalone page
  without the FPS scene.
- **Strikes and outcomes:**
  - a cluster split into six sub-projectiles;
  - a hostile hit producing its outcome;
  - a decoy penalty;
  - a wide cluster that also reaches SENTINEL, giving immediate failure that overrides the
    hostile destroyed in the same strike;
  - restart after both victory and failure.
- **Regression:** Training Depot movement, shooting and reload after leaving the mission.

**Weapon & equipment overhaul (labelled `[ARSENAL]`, 35 checks)**
- **Catalogue and models:** every category has several selectable items; all 43 weapons equip;
  every weapon has a distinct model with no placeholder or reuse.
- **Switching:** keys 1–6, cycling grenades, the weapon wheel and fire modes.
- **Animation:** recoil and cycling; the reload moves the magazine out and back; pistol slide
  cycling; inspect.
- **Grenades:** each type is thrown with real physics and produces its effect:
  - frag damage;
  - smoke blocks the bots' line of sight;
  - flash blinds;
  - stun slows;
  - fire zone damages;
  - EMP knocks out cameras and bot electronics;
  - sensor reveals hostiles on the HUD;
  - bots investigate the decoy;
  - pulse device;
  - counters and cooldowns.
- **Equipment:** NVG, thermal, flashlight, medical kit, ammo pack, rangefinder, binocular
  tagging, detector, and the shield blocking frontal fire.
- **Attachments:** they appear on the model; their stat changes; ADS zoom.
- **HUD:** the ammo counter, weapon icon, fire mode and grenade counters.
- **Enemies:** each class carries a weapon from its pool.

The unit tests (`npm test`) also cover:
- the arsenal catalogue, attachment maths (stats and compatibility), fire modes, energy-weapon
  heat, ADS spread, loadout limits, unlock rules and the smoke line-of-sight geometry;
- the mission rules for every bunker type, multi-impact
protection, strike exhaustion, the flight state machine (including illegal transitions), seeker
lock/loss/reacquire, and the city's navigation (street ↔ tunnel stairs, the garage roof, intel
reachability, and unobstructed landmarks).

The smoke test looks for Chrome or Edge in the standard install locations. Set `CHROME_PATH` to
use another Chromium-based browser.

Debug URL flag: `http://localhost:5190/?nolock` runs without pointer lock. Esc still pauses.
In this mode `window.__game` exposes the game object.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm run dev` fails with an esbuild error | Run `npm rebuild esbuild` or delete `node_modules` and run `npm install` again. If npm reports skipped install scripts, run `npm install-scripts approve esbuild` |
| Port 5190 already in use | The game's dev server is probably already running: open http://localhost:5190. Otherwise change `port` in `vite.config.js` |
| Blank page or another app's title on localhost | That address has a cached service worker from another app. Use the game's own port (5190), or in DevTools → Application → Storage click **Clear site data** |
| "WebGL is not available" | Enable hardware acceleration in the browser settings (Chrome: Settings → System) and update GPU drivers |
| The mouse doesn't lock / "browser refused mouse lock" | Click inside the page. After pressing Esc, browsers block re-locking for about 1 s, so wait a moment and click **Resume** again |
| No sound | Audio starts on your first click on **Play**. Check the master volume in Settings and that the tab isn't muted |
| Low FPS | Settings → Graphics **Low** (turns shadows off) and/or lower **Render scale**. Use fewer bots |
| Mouse too fast or slow | Settings → Mouse sensitivity (also available from the pause menu) |
| The page is blank after `npm run build` | Serve `dist/` with `npm run preview`. Opening `index.html` from disk via `file://` does not work with ES modules |
| Mission shows "Loading Kuala Lumpur district…" for a while | The first load builds the city geometry and navigation graph (navigation takes about 0.1 s in Node; slower machines and integrated GPUs take longer). Later restarts reuse it |
| After a strike the mouse doesn't respond on the result screen | Result screens release the mouse on purpose so you can click **Restart Mission** or **Main Menu** |
| City FPS is low | Use Graphics **Low** or a lower render scale. Night mode costs about the same as day. Distant towers switch to a low-detail model automatically |

## Known limitations

- There is no economy (money): the armory is free during buy time. There are no grenades.
- Bots don't crouch or jump and won't drop off ledges (they always use the stairs). Their
  cover-finding is heuristic.
- Bullets don't penetrate any surface (no wallbangs), by design.
- Single-player only. The architecture keeps game state separate from rendering, which makes a
  later FastAPI/WebSocket multiplayer or leaderboard backend possible, but none is implemented.
- **Operation Deep Strike:**
  - **What you can enter:** the mall ground floor, the office lobby, the garage (ground level,
    the stair landings on the upper levels, and the roof) and the B1 tunnels. The other
    buildings are solid blocks.
  - **Bunkers aren't walkable:** they appear in the cutaway and the drilling cinematic, and you
    discover them through intel and scans.
  - **Traffic is decoration:** it drives on fenced or out-of-bounds roads.
  - **No hostile reaction during cinematics:** the flight and drilling pause the FPS world.
  - **One mission:** intel and bunker positions are fixed, so it plays the same way each time
    (bot patrols vary).
  - **Fictional landmark:** the Twin Towers are an original, simplified, indestructible model.
    No real-world map data is used.
