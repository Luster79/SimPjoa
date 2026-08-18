// harness/probe-oar-deficit.js — "ile momentu brakuje", nie "czy istnieje trym".
//
// Owner, 2026-08-16: finding ONE trim that has to be used perfectly is not a
// solution — nobody sails a knife edge. The question worth measuring is
// therefore not "does an equilibrium exist at this course" but "how far is
// the boat from being able to hold it, and with how much margin".
//
// Method: hold the course WITH the oar, let everything settle, and read the
// yaw moment the oar is having to supply. That number is the deficit, in N*m,
// and it is signed:
//   ~0     the boat sails this course by itself
//   large  the trim cannot balance it and the oar is carrying the difference
// Sweeping trims and taking the SMALLEST |deficit| at each course gives the
// best the boat can do there. Sweeping courses gives the shape of the gap —
// and its peak is a design target a parameter change can be measured against.
//
// This deliberately does NOT ask whether the equilibrium is stable or
// reachable. Those questions come after: a course whose best trim still needs
// 20 N*m of oar is not going to be fixed by a better search.
//
// Declared axes (R7): trims below, courses TWA_LIST, one wind, one end. The
// oar is ACTIVE throughout by construction — that is the instrument, not a
// violation of the oar-free criterion.
//
// A REPORT, not a build gate. Run with:
//
//     node harness/probe-oar-deficit.js | tee docs/oar-deficit-YYYY-MM-DD.txt

import { createConfig } from '../core/config.js';
import { computeForces, integrate } from '../core/integrator.js';
import { DEG, HEADING0 } from './asserts-helpers.js';

const SETTLE_SECONDS = 400;

const argOf = (name, fallback) => {
  const a = process.argv.find((s) => s.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3).split(',').map(Number) : fallback;
};
const TWA_LIST = argOf('twa', [150, 155, 160, 162, 165, 168, 170, 172, 175, 178, 180]);
const TWS_LIST = argOf('tws', [6]);
const END = argOf('end', [1])[0];

// Both families plus the corners between them. Kept small on purpose: the
// point is the SHAPE of the deficit across courses, not an exhaustive search.
// Exported so probe-holds-freely.js measures the SAME trim set — one
// declaration of the axes, not two that can drift apart.
export const TRIMS = [];
for (const sheetDeg of [20, 35, 55, 70, 85, 100]) {
  for (const brailWind of [0, 0.5, 1]) {
    for (const tackX of [1, 0, -1]) {
      for (const crewPosX of [-1, 0, 1]) {
        TRIMS.push({ sheetDeg, brailWind, crewPos: 0, crewPosX, tackX, stays: 0 });
      }
    }
  }
}

// bestAtCourse(config, twa, tws, end) -> the smallest |oar yaw moment| any
// trim in TRIMS leaves at this course, with the trim that achieves it.
// Exported so harness/probe-param-sensitivity.js can run the SAME measurement
// against modified configs without a second copy of it going stale.
export function bestAtCourse(config, twa, tws, end) {
  const heading0 = HEADING0;
  const windDirFrom = heading0 + end * twa * DEG;
  let best = null;
  for (const t of TRIMS) {
    const c = { windDirFrom, windSpeed: tws, sheet: t.sheetDeg * DEG, rudder: 0, rudderUp: false,
      brailLee: 0, brailWind: t.brailWind, crewPos: t.crewPos, crewPosX: t.crewPosX,
      tackX: t.tackX, stays: t.stays, shuntRequest: false };
    let s = { t: 0, x: 0, y: 0, heading: heading0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
      delta: t.sheetDeg * DEG, end, amaLoad: 0, abackTimer: 0, capsized: false,
      shunt: { phase: 'none', progress: 0 } };
    for (let i = 0; i < Math.round(SETTLE_SECONDS / config.dt); i++) {
      const e = ((s.heading - heading0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      c.rudder = Math.max(-0.5, Math.min(0.5, -2.0 * e - 1.0 * s.r));
      s = integrate(s, c, config, config.dt);
      if (s.capsized) break;
    }
    if (s.capsized) continue;
    const F = computeForces(s, c, config);
    const deficit = Math.abs(F.breakdown.rudder.yawMoment);
    if (!best || deficit < best.deficit) {
      best = { deficit, t, v: Math.hypot(s.u, s.v), phi: s.phi / DEG,
        sail: F.breakdown.sail.yawMoment, hull: F.breakdown.hullSide.yawMoment,
        ama: F.breakdown.amaDrag.yawMoment };
    }
  }
  return best;
}

function main() {
  const config = createConfig();
  console.log(`trymow: ${TRIMS.length}, osiadanie ${SETTLE_SECONDS}s pod wioslem, end=${END}`);
  console.log('kurs | najmniejszy |Mwiosla| | trym, ktory to daje | v | przechyl');

  for (const tws of TWS_LIST) {
    for (const twa of TWA_LIST) {
      const best = bestAtCourse(config, twa, tws, END);
      if (!best) { console.log(`TWA${String(twa).padStart(3)} | kazdy trym wywraca`); continue; }
      const t = best.t;
      console.log(`TWA${String(twa).padStart(3)} |  ${best.deficit.toFixed(2).padStart(7)} N*m  | szot=${String(t.sheetDeg).padStart(3)} karota=${t.brailWind} tackX=${String(t.tackX).padStart(2)} crewX=${String(t.crewPosX).padStart(2)} | ${best.v.toFixed(2)} | ${best.phi.toFixed(2)}deg  (zagiel ${best.sail.toFixed(1)} kadlub ${best.hull.toFixed(1)} plywak ${best.ama.toFixed(1)})`);
    }
  }
}

// Guarded so probe-param-sensitivity.js can import bestAtCourse without
// paying for this file's own sweep as an import side effect.
if (import.meta.url === `file://${process.argv[1]}`) main();
