// harness/probe-param-sensitivity.js — which BOAT PARAMETER closes the deep
// gap, measured as the oar moment the boat still needs.
//
// Owner, 2026-08-16, two instructions that set this file's terms:
//   "finding one trim that would have to be used perfectly is not a solution.
//    Nobody in the real world would achieve that. Look for the cause in a gap
//    in the model, or in a wrong boat specification."
//   "You do not have to hold to past decisions if today's evidence says they
//    were not optimal."
// So: parameters previously frozen ARE in scope here, and the metric is not
// "does an equilibrium exist" but "how much moment is missing", via
// probe-oar-deficit.js's `bestAtCourse`.
//
// Read the numbers as a SCREEN, not a result. A variant that lowers the
// deficit has earned a full re-measurement (coverage, polar, capsize, the
// whole acceptance set), not a commit. Lowering a deficit by moving a
// parameter outside its justified band is not a physics finding, it is
// tuning, and the register's own guards say which is which — every variant
// below prints its register status alongside its number.
//
// Declared axes (R7): one course by default (TWA168, mid-gap), one wind, one
// end, the trim set in probe-oar-deficit.js. Screening on a single course is
// deliberate — it costs ~3 min per variant instead of ~20 — and anything that
// screens well gets the full course sweep afterwards.
//
// A REPORT, not a build gate. Run with:
//
//     node harness/probe-param-sensitivity.js | tee docs/param-sensitivity-YYYY-MM-DD.txt

import { createConfig } from '../core/config.js';
import { bestAtCourse } from './probe-oar-deficit.js';

const argOf = (name, fallback) => {
  const a = process.argv.find((s) => s.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3).split(',').map(Number) : fallback;
};
const TWA_LIST = argOf('twa', [168]);
const TWS = argOf('tws', [6])[0];
const END = argOf('end', [1])[0];

const base = createConfig();
const L = base.hull.length;

// status: what the parameter register (docs/parameter-register.md) says about
// this value. Printed with every row so a number can never be quoted without
// the licence — or lack of it — to move the parameter that produced it.
const VARIANTS = [
  { name: 'BAZA (bez zmian)', over: {}, status: '—' },

  { name: 'hull.lateralArea 1.41 -> 1.00', over: { hull: { lateralArea: 1.00 } },
    status: 'WOLNY: "band, not a point value" (kat sekcji 70deg to INNY kadlub Flaya)' },
  { name: 'hull.lateralArea 1.41 -> 0.70', over: { hull: { lateralArea: 0.70 } },
    status: 'WOLNY: jw., dolny kraniec pasma' },

  { name: 'hull.clrXFraction 0.05 -> 0.00', over: { hull: { clrXFraction: 0.00 } },
    status: 'WOLNY: "No direct measurement of this hull\'s CLR"' },
  { name: 'hull.clrXFraction 0.05 -> 0.15', over: { hull: { clrXFraction: 0.15 } },
    status: 'WOLNY: jw.' },

  { name: 'sail.yceFraction 0.35 -> 0.20', over: { sail: { yceFraction: 0.20 } },
    status: 'WOLNY: "vortex-lift approximation, not a citation"' },
  { name: 'sail.yceFraction 0.35 -> 0.50', over: { sail: { yceFraction: 0.50 } },
    status: 'WOLNY: jw.' },

  { name: 'sail.yawHeelSign 0 -> +1', over: { sail: { yawHeelSign: 1 } },
    status: 'ZAMROZONY: "tested paired, not solo, not at other magnitudes" (K4)' },
  { name: 'sail.yawHeelSign 0 -> -1', over: { sail: { yawHeelSign: -1 } },
    status: 'ZAMROZONY: jw.' },
  { name: 'hull.heelClrSign 0 -> +1', over: { hull: { heelClrSign: 1 } },
    status: 'ZAMROZONY: "negative result at ONE coefficient, not a proof no sign helps" (K4)' },
  { name: 'hull.heelClrSign 0 -> -1', over: { hull: { heelClrSign: -1 } },
    status: 'ZAMROZONY: jw.' },

  { name: 'hull.lead 0.06L -> 0.03L', over: { hull: { lead: 0.03 * L } },
    status: 'ZAMROZONY: "DO NOT re-pick this value to make a rudder-free assertion pass"' },
  { name: 'hull.lead 0.06L -> 0.12L', over: { hull: { lead: 0.12 * L } },
    status: 'ZAMROZONY: jw. (0.05-0.25L to pasmo z Larsson & Eliasson)' },

  { name: 'sail.verticalLiftFraction 0 -> 0.20', over: { sail: { verticalLiftFraction: 0.20 } },
    status: 'ZAMROZONY: literatura 0.15-0.25, odlozone przez scenariusze wywrotki' },
];

function main() {
  console.log(`ekran czulosci: TWA ${TWA_LIST.join(',')}, TWS${TWS}, end=${END}`);
  console.log('deficyt = najmniejszy |moment wiosla| jaki zostawia ktorykolwiek trym.');
  console.log('Nizej = blizej samodzielnego plyniecia. To EKRAN, nie wynik.\n');

  const rows = [];
  for (const v of VARIANTS) {
    const config = createConfig(v.over);
    const t0 = Date.now();
    const parts = [];
    let worst = 0;
    for (const twa of TWA_LIST) {
      const b = bestAtCourse(config, twa, TWS, END);
      if (!b) { parts.push(`TWA${twa}:wywrotki`); worst = Infinity; continue; }
      parts.push(`TWA${twa}:${b.deficit.toFixed(2)}`);
      worst = Math.max(worst, b.deficit);
      if (TWA_LIST.length === 1) {
        parts.push(`(szot=${b.t.sheetDeg} karota=${b.t.brailWind} tackX=${b.t.tackX} crewX=${b.t.crewPosX}, v=${b.v.toFixed(2)}, phi=${b.phi.toFixed(2)}deg, zagiel ${b.sail.toFixed(1)} kadlub ${b.hull.toFixed(1)})`);
      }
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`${v.name.padEnd(34)} ${parts.join(' ')}   [${secs}s]`);
    console.log(`   status: ${v.status}`);
    rows.push({ name: v.name, worst, status: v.status });
  }

  const baseline = rows[0].worst;
  console.log(`\nRANKING wzgledem bazy (${baseline.toFixed(2)} N*m):`);
  for (const r of rows.slice().sort((a, b) => a.worst - b.worst)) {
    const d = r.worst - baseline;
    console.log(`  ${r.worst.toFixed(2).padStart(8)} N*m  ${d <= 0 ? '' : '+'}${d.toFixed(2).padStart(7)}  ${r.name}`);
  }
  console.log('\nZadna z tych liczb nie jest podstawa do zmiany w /core sama z siebie:');
  console.log('wariant, ktory wygrywa, musi przejsc pelny zestaw akceptacyjny, polare,');
  console.log('pokrycie i scenariusze wywrotki -- a jesli jego parametr jest ZAMROZONY,');
  console.log('to decyzja wlasciciela, nie pomiarowa.');
}

main();
