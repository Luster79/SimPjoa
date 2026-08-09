// harness/asserts.js — acceptance criteria as tests. runAsserts(config)
// returns an array of { name, pass, detail }; run_tests.js decides the exit
// code from it.
//
// R13 (docs/work-order-2026-07-22.md): this used to be one ~2500-line
// function; the checks now live in harness/asserts-*.js, in the same order
// they always ran in (each module a contiguous slice of the old file, cut at
// section boundaries — not reshuffled by theme, so a diff against pre-split
// history still lines up). This file is the orchestrator: build the shared
// `results`/`check`, call each module in sequence, return the total.
import { check_aero_steering } from './asserts-aero-steering.js';
import { check_polar_helm } from './asserts-polar-helm.js';
import { check_scenarios_units } from './asserts-scenarios-units.js';
import { check_sail_trim } from './asserts-sail-trim.js';
import { check_capsize } from './asserts-capsize.js';
import { check_hull_ama } from './asserts-hull-ama.js';
import { check_deep_course } from './asserts-deep-course.js';
import { check_course_change } from './asserts-course-change.js';

// xfail (ROUND7_DECISION.md D-3/D-4): a known, diagnosed model limitation
// that still RUNS every time (never silently skipped) but is expected to
// FAIL. `xfail` is a short tag ('STEERING' | 'STABILITY') grouping it in
// run_tests.js's report; `detail` should point at the findings doc
// section that diagnoses it. If an xfail assertion starts PASSING,
// run_tests.js flags it as a promotion candidate and fails the build —
// an xfail silently going green means something changed and needs review,
// not a free pass.
//
// slow (R7, docs/work-order-2026-07-22.md): every check that calls
// computePolar() runs a sheet/crewPos/brail grid search, each cell its own
// settle-to-steady simulation — the dominant cost of the whole suite's
// runtime. Defaults true (the full, `npm run test:full` behavior); the
// fast set (`npm test`) passes slow=false to skip these and stay under
// ~20s for a quick inner-loop check, at the cost of not covering polar
// shape/speed-band regressions — run_tests.js's CI job runs the full set.
export function runAsserts(config, { slow = true } = {}) {
  const results = [];
  const check = (name, pass, detail = '', xfail = null) => results.push({ name, pass: Boolean(pass), detail, xfail });

  check_aero_steering(config, check);
  check_polar_helm(config, check, slow);
  check_scenarios_units(config, check);
  check_sail_trim(config, check);
  check_capsize(config, check);
  check_hull_ama(config, check, slow);
  check_deep_course(config, check, slow);
  check_course_change(config, check, slow);

  return results;
}
