// scratch/boat_obtain_walk.js — the cheap O9-style walk (10deg step,
// TWA90->180, oar-free) for a named boat, both ends. ADR 0050 flagged this
// as never re-verified for slim/fat after the earlier 2deg attempt (ADR
// 0050's own night) ran 5+h unfinished and was abandoned. Reuses
// report-long-walks.js's own walkToCourse at its default 10deg step.
//
//     node scratch/boat_obtain_walk.js slim
//     node scratch/boat_obtain_walk.js fat

import { createConfig } from '../core/config.js';
import { DEG } from '../harness/asserts-helpers.js';
import { walkToCourse } from '../harness/report-long-walks.js';

const BOAT = process.argv[2] || 'slim';
const TWS = 6;

function twaOf(windDirFrom, heading) {
  const a = (((windDirFrom - heading) / DEG) % 360 + 360) % 360;
  return a > 180 ? 360 - a : a;
}

function main() {
  const config = createConfig({ boat: BOAT });
  console.log(`boat=${BOAT} TWS${TWS} TWA90->TWA180, krok 10deg, oba konce\n`);
  for (const end of [1, -1]) {
    const t0 = Date.now();
    const w = walkToCourse(config, 90, 180, TWS, end);
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    const ok = w.startConfirmed && w.final && Math.abs(w.twaReached - 180) <= 10 &&
      w.final.converged && w.final.restoring && !w.final.capsized && w.final.speedRatio >= 0.5;
    const legs = w.legs.map((l) => l.found ? `${l.wp}:${l.reached.toFixed(0)}${l.capsized ? '/WYWR' : ''}` : `${l.wp}:BRAK`).join(' ');
    console.log(`end=${end} (${secs}s): ${ok ? 'DOSZLA I TRZYMA' : 'nie'}`);
    console.log(`  startHoldConfirmed=${w.startConfirmed} legs=[${legs}]`);
    console.log(`  dotarla do TWA${w.twaReached.toFixed(1)} (cel 180+-10)${w.final ? ` converged=${w.final.converged} restoring=${w.final.restoring} v=${(w.final.speedRatio * 100).toFixed(0)}% capsized=${w.final.capsized}` : ' -- zaden etap nie ukonczony'}`);
    if (process.argv.includes('--trims')) {
      console.log('  trym na kazdym etapie:');
      for (const l of w.legs) {
        if (!l.found) { console.log(`    wp=${l.wp}: BRAK OSIAGALNEGO TRYMU`); continue; }
        const t = l.trim;
        console.log(`    wp=${String(l.wp).padStart(3)} -> TWA${l.reached.toFixed(1)}  szot=${t.sheetDeg} karota=${t.brailWind} tackX=${t.tackX} crewX=${t.crewPosX} crewY=${t.crewPos} stays=${t.stays}  v=${(l.v * 100).toFixed(0)}%`);
      }
    }
  }
}

main();
