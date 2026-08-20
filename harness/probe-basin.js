// harness/probe-basin.js — R1 (docs/work-order-2026-08-16-osiagalnosc.md):
// how WIDE is the region of attraction around a certified oar-free hold?
//
// Why this instrument did not exist before. Every deep-course measurement so
// far answered one of two questions: "does a trim hold this course" (find-
// HoldingTrim, coverage-no-oar.js, the matrix's per-point search) or "can a
// trim be reached from where the boat is" (findReachableTrim, ADR 0046). The
// 2026-08-16 matrix log answers the first with FOUND at TWA170 in all six
// rows -- converged, restoring, inside +-10deg, oar shipped -- while ADR 0046
// answers the second with nothing-reachable at that same point. Both are
// correct measurements, so the equilibrium at TWA170 exists and is stable, and
// what is missing is the PATH into it. That is a basin question, and nobody
// had measured a basin.
//
// Method: settle a certified hold (findHoldingTrim, the same call and the same
// excursionMax=10 the matrix uses), then knock the HEADING off by delta with
// the trim FROZEN and the oar still shipped, and see where the boat ends up
// after WINDOW_SECONDS. Freezing the trim is the point: this asks how far the
// boat can be displaced and still come back on its own, which is exactly the
// question a 10deg transit grid has to jump over.
//
// Declared axes (R7, the methodological requirement this work order inherits
// from W7): delta sweeps DELTAS below, symmetric, in degrees of heading;
// the window is WINDOW_SECONDS; the trim is frozen at the certified holder's
// values for the whole window; rudderUp stays true throughout; the wind frame
// is the hold's own windDirFrom. Nothing else is varied -- in particular this
// probe does NOT search for a better trim at the perturbed heading, which is a
// different question (that one is findReachableTrim's).
//
// A REPORT, not a build gate -- same status as coverage-no-oar.js,
// coverage-obtain-course.js and report-long-walks.js. Run with:
//
//     node harness/probe-basin.js | tee docs/basin-YYYY-MM-DD.txt

import { createConfig } from '../core/config.js';
import { DEG, holdsCourse, findHoldingTrim } from './asserts-helpers.js';

const WINDOW_SECONDS = 300;
// Symmetric, coarse-to-fine on the small end: the interesting case is a basin
// NARROWER than the 10deg transit grid, so the sweep has to resolve below 10.
const DELTAS = [-20, -15, -10, -7, -5, -3, -2, -1, 1, 2, 3, 5, 7, 10, 15, 20];
// A perturbation "returns" if the boat comes back to the EQUILIBRIUM it was
// knocked off, within RETURN_BAND degrees of where that equilibrium settled.
//
// Measured against the NOMINAL grid course instead (the first version of this
// probe, 2026-08-16), the answer is wrong in exactly the case the probe exists
// to catch: at TWA170/TWS4 every negative perturbation runs away to TWA179-180,
// which is within 10deg of the nominal 170 and so scored as "returned" -- while
// the boat had in fact left the 169.5deg equilibrium entirely and fallen into a
// different attractor. Returning to the equilibrium and landing near the
// nominal are two different questions, and only the first one is a basin.
const RETURN_BAND = 3;

const argOf = (name, fallback) => {
  const a = process.argv.find((s) => s.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3).split(',').map(Number) : fallback;
};
const TWA_LIST = argOf('twa', [150, 160, 170, 180]);
const TWS_LIST = argOf('tws', [4, 6, 10]);
const END_LIST = argOf('end', [1, -1]);

function twaOf(windDirFrom, heading) {
  const a = (((windDirFrom - heading) / DEG) % 360 + 360) % 360;
  return a > 180 ? 360 - a : a;
}

// Basin half-width on one side: the largest |delta| tried on that side for
// which the boat returned, with NO failure at a smaller |delta| on the same
// side. The contiguity requirement matters -- a lone return at 15deg with
// failures at 5 and 7 is not a basin edge, it is a second attractor, and
// calling it "the basin is 15deg wide" would hide exactly the discontinuity
// this work order is chasing.
function halfWidth(results, sign) {
  const side = results.filter((r) => Math.sign(r.delta) === sign)
    .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  let w = 0;
  for (const r of side) {
    if (!r.returned) break;
    w = Math.abs(r.delta);
  }
  return w;
}

function main() {
  const config = createConfig();
  const t0 = Date.now();
  const summary = [];

  for (const end of END_LIST) {
    for (const tws of TWS_LIST) {
      for (const twa of TWA_LIST) {
        const searchT0 = Date.now();
        const f = findHoldingTrim(config, twa, tws, end, { windowSeconds: 120, excursionMax: 10 });
        const searchSecs = ((Date.now() - searchT0) / 1000).toFixed(0);
        const stamp = `[${((Date.now() - t0) / 1000).toFixed(0)}s] end=${end} TWS${tws} TWA${twa}`;
        if (!f) {
          console.log(`${stamp}: NO HOLDING TRIM (${searchSecs}s) -- no equilibrium to probe`);
          summary.push({ end, tws, twa, held: false });
          continue;
        }
        const t = f.trim;
        const settled = twaOf(f.windDirFrom, f.hold.finalState.heading);
        console.log(`${stamp}: hold FOUND in ${searchSecs}s -- sheet=${t.sheetDeg} brailW=${t.brailWind} crew=${t.crewPos} crewX=${t.crewPosX} tackX=${t.tackX} stays=${t.stays}, settled TWA${settled.toFixed(1)} exc=${f.hold.excursion.toFixed(1)} v=${(f.hold.speedRatio * 100).toFixed(0)}%`);

        const results = [];
        for (const delta of DELTAS) {
          const st = { ...f.hold.finalState, heading: f.hold.finalState.heading + delta * DEG };
          const h = holdsCourse(config, f.controls, st, { windowSeconds: WINDOW_SECONDS });
          const landed = twaOf(f.windDirFrom, h.finalState.heading);
          const returned = !h.capsized && Math.abs(landed - settled) <= RETURN_BAND;
          results.push({ delta, landed, returned, capsized: h.capsized });
        }
        const line = results.map((r) => `${r.delta > 0 ? '+' : ''}${r.delta}:${r.capsized ? 'WYWR' : r.landed.toFixed(0)}${r.returned ? '*' : ''}`).join(' ');
        const wMinus = halfWidth(results, -1), wPlus = halfWidth(results, 1);
        console.log(`   ladowanie (* = wrocila do rownowagi TWA${settled.toFixed(1)} w +-${RETURN_BAND}deg): ${line}`);
        console.log(`   BASEN: -${wMinus}deg / +${wPlus}deg  (szerokosc ${wMinus + wPlus}deg, krok siatki przejsc 10deg)`);
        summary.push({ end, tws, twa, held: true, wMinus, wPlus });
      }
    }
  }

  console.log(`\nPODSUMOWANIE -- szerokosc basenu przyciagania [deg], siatka przejsc uzywa kroku 10deg`);
  console.log(`delty: ${DELTAS.join(',')}  okno: ${WINDOW_SECONDS}s  trym: zamrozony  pasmo powrotu: +-${RETURN_BAND}deg`);
  for (const s of summary) {
    if (!s.held) { console.log(`  end=${s.end} TWS${s.tws} TWA${s.twa}: brak rownowagi`); continue; }
    const total = s.wMinus + s.wPlus;
    console.log(`  end=${s.end} TWS${s.tws} TWA${s.twa}: -${s.wMinus}/+${s.wPlus} = ${total}deg${total < 10 ? '  << WEZSZY NIZ KROK SIATKI' : ''}`);
  }
}

main();
