// harness/probe-fine-walk.js — R2 (docs/work-order-2026-08-16-osiagalnosc.md):
// walk the deep band at a step FINER than the 10deg grid.
//
// The premise, from the same work order's Part I: the 2026-08-16 matrix log
// certifies a stable oar-free hold at TWA170 in all six rows, while ADR 0046's
// ramped, state-aware search finds nothing reachable there from TWA160. An
// equilibrium that exists but cannot be entered from 10deg away is a basin
// narrower than the step -- and the fix for that is a smaller step, not new
// physics. This measures whether that is what is happening.
//
// If the trim family is continuous through TWA150-180 and only the basin is
// narrow, a 2deg walk arrives and a 10deg walk does not. If the 2deg walk also
// stalls, it stalls at a waypoint resolved to 2deg, which is a sharper address
// than "somewhere in TWA160-175" and tells the next work order where to look.
//
// Declared axes (R7): step sweeps STEPS below; the walk is TWA150 -> TWA180;
// every leg after the start uses findReachableTrim with the same 60s ramp and
// candidate grid report-long-walks.js uses, so the ONLY thing varying between
// runs is the waypoint spacing. Start is a confirmed hold at TWA150.
//
// A REPORT, not a build gate. Run with:
//
//     node harness/probe-fine-walk.js | tee docs/fine-walk-YYYY-MM-DD.txt

import { createConfig } from '../core/config.js';
import { walkToCourse } from './report-long-walks.js';

const argOf = (name, fallback) => {
  const a = process.argv.find((s) => s.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3).split(',').map(Number) : fallback;
};
const STEPS = argOf('step', [10, 5, 2]);
const TWS_LIST = argOf('tws', [6]);
const END_LIST = argOf('end', [1]);
const FROM = argOf('from', [150])[0];
const TO = argOf('to', [180])[0];

function main() {
  const config = createConfig();
  const t0 = Date.now();
  const summary = [];

  for (const end of END_LIST) {
    for (const tws of TWS_LIST) {
      for (const stepDeg of STEPS) {
        const legT0 = Date.now();
        const w = walkToCourse(config, FROM, TO, tws, end, stepDeg);
        const secs = ((Date.now() - legT0) / 1000).toFixed(0);
        const ok = w.startConfirmed && w.final && Math.abs(w.twaReached - TO) <= 10 &&
          w.final.converged && w.final.restoring && !w.final.capsized && w.final.speedRatio >= 0.5;
        // The first waypoint with no reachable trim is the address this probe
        // exists to produce -- report it explicitly rather than leaving it to
        // be read out of the leg list.
        const stall = w.legs.find((l) => !l.found);
        const legs = w.legs.map((l) => l.found
          ? `${l.wp}:${l.reached.toFixed(0)}${l.capsized ? '/WYWR' : ''}`
          : `${l.wp}:BRAK`).join(' ');
        console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] end=${end} TWS${tws} TWA${FROM}->TWA${TO} krok ${stepDeg}deg: ${ok ? 'DOSZLA' : 'nie'} (${secs}s)`);
        console.log(`   legs=[${legs}]`);
        console.log(`   doszla do TWA${w.twaReached.toFixed(1)} (cel ${TO}+-10)${w.final ? ` converged=${w.final.converged} restoring=${w.final.restoring} v=${(w.final.speedRatio * 100).toFixed(0)}% capsized=${w.final.capsized}` : ' -- zaden etap nie ukonczony'}`);
        console.log(`   zatrzymanie: ${stall ? `TWA${stall.wp} (brak osiagalnego trymu)` : 'brak'}`);
        summary.push({ end, tws, stepDeg, ok, reached: w.twaReached, stall: stall ? stall.wp : null });
      }
    }
  }

  console.log(`\nPODSUMOWANIE -- TWA${FROM}->TWA${TO}, ten sam marsz przy roznym kroku`);
  for (const s of summary) {
    console.log(`  end=${s.end} TWS${s.tws} krok ${s.stepDeg}deg: ${s.ok ? 'DOSZLA' : 'nie'}, TWA${s.reached.toFixed(1)}, stanela na ${s.stall === null ? '-' : `TWA${s.stall}`}`);
  }
}

main();
