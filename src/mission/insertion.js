// Mission insertion: the player starts at a random insertion point that no hostile can see.
// Pure logic (Node-safe for tests).

const SAFE_DISTANCE = 25; // m: no hostile closer than this, seen or not
const SIGHT_RANGE = 60; // m: bot view distance on Normal; the spawn grace covers the first seconds

// points: [[x, y, z], ...]; threats: [{ x, y, z }] (feet positions);
// lineClear(ax, ay, az, bx, by, bz) -> true when nothing solid is in between.
// Returns { pos, yaw, safe } – yaw faces the district centre.
export function pickInsertion(points, threats, lineClear, rand = Math.random) {
  const scored = points.map((p) => {
    let minD = Infinity, seen = false;
    for (const t of threats) {
      const d = Math.hypot(t.x - p[0], t.y - p[1], t.z - p[2]);
      // Hostiles on another level (tunnels under the street) only matter if they can see the point.
      if (Math.abs(t.y - p[1]) < 3) minD = Math.min(minD, d);
      if (d < SIGHT_RANGE && lineClear(t.x, t.y + 1.6, t.z, p[0], p[1] + 1.6, p[2])) seen = true;
    }
    return { p, minD, safe: !seen && minD > SAFE_DISTANCE };
  });
  const safe = scored.filter((s) => s.safe);
  // No fully hidden point (e.g. a very alerted map): take the one farthest from every hostile.
  const pick = safe.length ? safe[Math.floor(rand() * safe.length)] : scored.sort((a, b) => b.minD - a.minD)[0];
  return { pos: pick.p, yaw: Math.atan2(pick.p[0], pick.p[2]), safe: pick.safe };
}
