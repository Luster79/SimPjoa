// K4 (docs/work-order-2026-08-09-kryterium-bez-wiosla.md, = S10 from the
// 08-02 work order): re-run T3's own heelClrSign/yawHeelSign matrix under
// the CURRENT physics (post-D1/ADR 0032, post-S8/ADR 0033), scored two ways:
//   (a) the acceptance criteria T3 originally used (AC-1.1/1.2/4.2a/4.2b,
//       via harness/acceptance-manual.js's exported runAcceptance()) — same
//       method as the original measurement, for direct comparability;
//   (b) a coverage number in K2's own spirit (holdsCourse, oar SHIPPED),
//       but restricted to the 6-point reaching grid S1c/S2 already use
//       (TWA 70/90/110 x TWS 6/10) with S1c's own 15-combo tackX x crewPosX
//       trial grid, NOT the full 45-point x 75-combo K2 search — a full K2
//       run per sign combination would cost ~4x K2's own ~45min budget for a
//       question K2's own grid already answers less precisely than needed
//       here. Documented substitution, not a silent shortcut.
import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0, holdsCourse } from '../harness/asserts-helpers.js';
import { runAcceptance } from '../harness/acceptance-manual.js';

const GRID = [
  { twa: 70, tws: 6 }, { twa: 90, tws: 6 }, { twa: 110, tws: 6 },
  { twa: 70, tws: 10 }, { twa: 90, tws: 10 }, { twa: 110, tws: 10 },
];
const TACKX_TRIALS = [0, 0.5, 1];
const CREWX_TRIALS = [0, -0.25, -0.5, -0.75, -1];

function coverage6(config) {
  let held = 0;
  const rows = [];
  for (const { twa, tws } of GRID) {
    const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
    const windDirFrom = HEADING0 + twa * DEG;
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
      delta: row.bestSheetAngle * DEG, end: 1, amaLoad: 0, abackTimer: 0, capsized: false,
      shunt: { phase: 'none', progress: 0 } };
    const settleControls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
      rudderUp: false, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
      crewPosX: 0, tackX: 0, shuntRequest: false };
    for (let i = 0; i < Math.round(45 / config.dt); i++) {
      settleControls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, settleControls, config, config.dt);
    }
    let best = null;
    for (const t of TACKX_TRIALS) for (const x of CREWX_TRIALS) {
      const controls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
        rudderUp: true, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
        crewPosX: x, tackX: t, shuntRequest: false };
      const hold = holdsCourse(config, controls, state, { windowSeconds: 300 });
      if (hold.excursion <= 15 && hold.speedRatio >= 0.5 && hold.converged && hold.restoring && !hold.capsized) {
        if (!best || hold.excursion < best.excursion) best = { t, x, excursion: hold.excursion };
      }
    }
    if (best) held++;
    rows.push({ twa, tws, holds: Boolean(best), best });
  }
  return { held, total: GRID.length, rows };
}

function acFilter(rows, id) {
  const r = rows.find((x) => x.id === id);
  return r ? r.verdict.split(' ')[0] : '?';
}

const COMBOS = [
  { name: 'baseline (0,0)', heelClrSign: 0, yawHeelSign: 0 },
  { name: '(+1,+1)', heelClrSign: 1, yawHeelSign: 1 },
  { name: '(+1,-1)', heelClrSign: 1, yawHeelSign: -1 },
  { name: '(-1,+1)', heelClrSign: -1, yawHeelSign: 1 },
  { name: '(-1,-1)', heelClrSign: -1, yawHeelSign: -1 },
];

const t0 = Date.now();
for (const combo of COMBOS) {
  const config = createConfig({ hull: { heelClrSign: combo.heelClrSign }, sail: { yawHeelSign: combo.yawHeelSign } });
  const ac = runAcceptance(config);
  const cov = coverage6(config);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`[${elapsed}s] ${combo.name}: AC-1.1=${acFilter(ac, 'AC-1.1')} AC-1.2=${acFilter(ac, 'AC-1.2')} AC-4.2a=${acFilter(ac, 'AC-4.2a')} AC-4.2b=${acFilter(ac, 'AC-4.2b')} -- coverage6(oar-shipped)=${cov.held}/${cov.total} -- ${cov.rows.map((r) => `TWS${r.tws}/TWA${r.twa}:${r.holds ? 'H' : '-'}`).join(' ')}`);
}
