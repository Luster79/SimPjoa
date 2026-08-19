// harness/probe-holds-freely.js — "gdzie lodka JEST po dlugim czasie bez
// wiosla", bez zadnej pochodnej i bez krotkiego okna.
//
// Why this exists. K1's `holdsCourse` decides "holds" from three things: an
// excursion over a 120-300s window, a converged test on thirds of that
// window, and `restoring` — the sign of a STATIC finite difference
// (M(+3deg) - M(-3deg))/6 taken at a frozen state. Measured 2026-08-16, that
// combination does not predict whether the boat keeps the course:
//
//   TWA165  static stiffness -20.4 N*m/deg ("strongly restoring") -> released, ends at TWA176.9
//   TWA168  static stiffness -24.3 N*m/deg ("strongly restoring") -> released, ends at TWA 80.6
//   TWA170  static stiffness -43.9 N*m/deg ("strongly restoring") -> released, ends at TWA 47.7
//
// and separately it certifies a TWA170 "hold" whose basin is under a degree
// (ADR 0048). The rig is NOT the explanation — measured the same day, the
// yard is sheet-limited at every deep course (delta = deltaMax, deltaAlign
// 152-178deg well beyond it), so freezing `delta` in the static probe is
// legitimate and the discrepancy lies elsewhere. It is still open.
//
// So this asks the question directly and cheaply: settle the course under the
// oar, SHIP THE OAR, integrate for RELEASE_SECONDS, and report the whole
// trajectory. A course is held if the boat is still on it at the end and has
// stopped moving — no model of why, just where it ended up.
//
// Declared axes (R7): the trim set is probe-oar-deficit.js's (imported, not
// copied); courses, wind and end below; settle SETTLE_SECONDS under a heading-
// hold oar, then RELEASE_SECONDS with rudderUp. Nothing else varies.
//
// A REPORT, not a build gate — and deliberately NOT a replacement for
// holdsCourse, which sits in the gate. Changing a gate predicate is the
// owner's decision. Run with:
//
//     node harness/probe-holds-freely.js | tee docs/holds-freely-YYYY-MM-DD.txt

import { createConfig, deepMerge } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { DEG, HEADING0 } from './asserts-helpers.js';
import { TRIMS } from './probe-oar-deficit.js';

const SETTLE_SECONDS = 300;
const RELEASE_SECONDS = 900;
// How far from the nominal course the boat may end up and still count. Kept
// at 5, not the matrix's 10: at 10 one attractor certifies two adjacent grid
// nodes (ADR 0048), which is the borrowing this probe exists to stop.
const BAND = 5;
// Drift over the last quarter of the release. A course that is genuinely
// settled has stopped moving; one still creeping has not, however small its
// total excursion looks.
const QUIET_DEG = 1.0;

const argOf = (name, fallback) => {
  const a = process.argv.find((s) => s.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3).split(',').map(Number) : fallback;
};
const TWA_LIST = argOf('twa', [150, 155, 160, 162, 165, 168, 170, 172, 175, 178, 180]);
const TWS = argOf('tws', [6])[0];
const END = argOf('end', [1])[0];

// --oar (owner's question, 2026-08-17): "is it enough to PUT THE OAR IN, or
// does it have to be WORKED as a rudder?" Three different claims about the
// boat, and only the middle one has never been measured:
//
//   up      oar shipped entirely — the success criterion's own condition
//   in      oar in the water, held at zero, NEVER moved. No steering, no
//           feedback, no work: it is a skeg. Whatever it buys comes from aft
//           lateral area and yaw-rate damping alone.
//   worked  the heading-hold autopilot keeps running through the release
//           window — active steering, the thing the criterion excludes
//
// If `in` closes the deep band and `up` does not, the deficit is in the
// hull's LATERAL AREA DISTRIBUTION, not in steering authority, and that is a
// different repair with different evidence behind it.
const OAR = (process.argv.find((s) => s.startsWith('--oar=')) || '--oar=up').slice(6);
if (!['up', 'in', 'worked'].includes(OAR)) {
  console.error(`nieznany --oar=${OAR}; dozwolone: up, in, worked`);
  process.exit(2);
}

// --param=hull.clrXFraction:0.15 — one dotted path, one number, applied as a
// config override. Enough to screen a boat-spec candidate against the metric
// that matters (how MANY trims hold the course), which is what the first
// parameter screen got wrong: it ranked variants by a moment deficit that had
// already been measured as ~0 everywhere, so it could not discriminate.
function overrideFrom(arg) {
  if (!arg) return undefined;
  const [path, raw] = arg.slice('--param='.length).split(':');
  const value = Number(raw);
  if (!path || !Number.isFinite(value)) {
    console.error(`zly --param (oczekiwane sciezka.z.kropkami:liczba): ${arg}`);
    process.exit(2);
  }
  const keys = path.split('.');
  const over = {};
  let node = over;
  for (let i = 0; i < keys.length - 1; i++) node = (node[keys[i]] = {});
  node[keys[keys.length - 1]] = value;
  return over;
}
const PARAMS = process.argv.filter((s) => s.startsWith('--param='));
const BOAT = (process.argv.find((s) => s.startsWith('--boat=')) || '--boat=default').slice(7);

function main() {
  let userConfig = { boat: BOAT };
  for (const p of PARAMS) userConfig = deepMerge(userConfig, overrideFrom(p));
  const config = createConfig(userConfig);
  if (BOAT !== 'default') console.log(`boat: ${BOAT}`);
  for (const p of PARAMS) console.log(`wariant: ${p.slice('--param='.length)}`);
  console.log(`osiadanie ${SETTLE_SECONDS}s pod wioslem, potem ${RELEASE_SECONDS}s BEZ wiosla`);
  console.log(`trzyma = konczy w +-${BAND}deg od kursu i dryfuje <${QUIET_DEG}deg w ostatniej cwiartce`);
  console.log(`trymow: ${TRIMS.length}, TWS${TWS}, end=${END}, wioslo: ${OAR === "up" ? "PODNIESIONE" : OAR === "in" ? "WLOZONE, trzymane prosto, nieruszane" : "UZYWANE jako ster"}\n`);

  for (const twa of TWA_LIST) {
    const heading0 = HEADING0;
    const windDirFrom = heading0 + END * twa * DEG;
    const twaOf = (h) => { const a = (((windDirFrom - h) / DEG) % 360 + 360) % 360; return a > 180 ? 360 - a : a; };
    let best = null, holders = 0;
    for (const t of TRIMS) {
      const c = { windDirFrom, windSpeed: TWS, sheet: t.sheetDeg * DEG, rudder: 0, rudderUp: false,
        brailLee: 0, brailWind: t.brailWind, crewPos: t.crewPos, crewPosX: t.crewPosX,
        tackX: t.tackX, stays: t.stays, shuntRequest: false };
      let s = { t: 0, x: 0, y: 0, heading: heading0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
        delta: t.sheetDeg * DEG, end: END, amaLoad: 0, abackTimer: 0, capsized: false,
        shunt: { phase: 'none', progress: 0 } };
      for (let i = 0; i < Math.round(SETTLE_SECONDS / config.dt); i++) {
        const e = ((s.heading - heading0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        c.rudder = Math.max(-0.5, Math.min(0.5, -2.0 * e - 1.0 * s.r));
        s = integrate(s, c, config, config.dt);
        if (s.capsized) break;
      }
      if (s.capsized) continue;
      const free = { ...c, rudder: 0, rudderUp: OAR === 'up' };
      const steps = Math.round(RELEASE_SECONDS / config.dt);
      const quarter = Math.round(steps * 0.75);
      let atQuarter = null;
      for (let i = 0; i < steps; i++) {
        // 'in' leaves rudder at 0 for the whole window — the oar is a fixed
        // blade in the water, not a control. Only 'worked' keeps steering.
        if (OAR === 'worked') {
          const e = ((s.heading - heading0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
          free.rudder = Math.max(-0.5, Math.min(0.5, -2.0 * e - 1.0 * s.r));
        }
        s = integrate(s, free, config, config.dt);
        if (s.capsized) break;
        if (i === quarter) atQuarter = s.heading;
      }
      if (s.capsized || atQuarter === null) continue;
      const endTwa = twaOf(s.heading);
      const lateDrift = Math.abs(twaOf(atQuarter) - endTwa);
      const holds = Math.abs(endTwa - twa) <= BAND && lateDrift < QUIET_DEG;
      if (holds) holders++;
      // A HOLDER always beats a non-holder, and only then does distance from
      // the nominal course decide. Ranking by distance alone (the first
      // version, 2026-08-16) printed a non-holding trim as the example
      // alongside a "holds" verdict — at TWA172 the closest trim was still
      // drifting 6.73deg in the last quarter while five others held.
      const err = Math.abs(endTwa - twa);
      const better = !best || (holds && !best.holds) ||
        (holds === best.holds && err < best.err);
      if (better) best = { err, endTwa, lateDrift, t, holds };
    }
    if (!best) { console.log(`TWA${String(twa).padStart(3)} | kazdy trym wywraca`); continue; }
    const t = best.t;
    console.log(`TWA${String(twa).padStart(3)} | ${holders ? `TRZYMA (${holders} trymow)` : 'NIE TRZYMA'.padEnd(16)} | najblizej: TWA${best.endTwa.toFixed(1)} (blad ${best.err.toFixed(1)}deg, dryf w koncowce ${best.lateDrift.toFixed(2)}deg) szot=${t.sheetDeg} karota=${t.brailWind} tackX=${t.tackX} crewX=${t.crewPosX}`);
  }
}

main();
