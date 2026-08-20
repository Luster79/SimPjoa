# ADR 0053 — PJOA Slim and Fat close both halves of the success criterion on TWA90-180, at very different cost

*Date: 2026-08-20*
*Follow-up to ADR 0049/0050/0051/0052. Closes two gaps ADR 0050's own
"Consequences" section named explicitly: neither `slim` nor `fat` had its
own gated acceptance run, and the obtaining-course walk was never
re-verified for either.*

## Context

ADR 0050 shipped `slim` (`asymmetryLiftCoeff=0.004`) and `fat` (`0.0145`)
on the strength of `probe-holds-freely.js`'s corridor screen and the K3
close-hauled checks, but explicitly flagged two things as unmeasured: the
full CI-gated acceptance suite (`run_tests.js`'s own `runAsserts`) had only
ever run on `default`, and the *obtaining* side of the criterion — can the
boat actually walk from a reach into the deep band, not just hold once
placed there — was attempted at a 2deg step and abandoned after 5+ hours
unfinished.

This ADR runs both, on `slim`, `fat`, and (for the walk) `default` as a
freshly-measured baseline rather than a cited older number.

## Measured

### B1 — full acceptance suite (`runAsserts(slow:true)`, i.e. `run_tests.js`'s own gate), each boat as its own target

| boat | non-xfail | promotions | worst polar delta (vs `default`) |
|---|---|---|---|
| `default` (already gated) | 98/98 | — (12 xfail, none change) | — |
| `slim` | **98/98, zero new failures** | 3 (`K3` pointing-up both ends, `K3` shunt-hold `end=-1`) | +0.063 m/s (+1.0%) TWA70/TWS10 |
| `fat` | **98/98, zero new failures** | 5 (`C-C` — the manual's own downwind recipe — plus `K3` pointing-up and shunt-hold, both ends) | +0.230 m/s (+3.2%) TWA90/TWS10 |

Neither variant regresses a single non-xfail assertion — every capsize
scenario (`T6`, `T10`, `H2`, `scenarioAback`/`Squall`/`ThroughGybeAback`,
all embedded in the suite above) passes clean on both. `fat`'s five
promotions exactly reproduce ADR 0049's own screen at coeff=0.015 (the
window's edge, `fat` sits at the window's centre 0.0145); `slim`'s three
reproduce that screen's own 0.004 result digit-for-digit. Nothing new here
— this confirms the overnight screen generalises to the FULL suite, not
just the narrow K3/corridor slice it was built from.

### B2 — obtaining-course walk (`report-long-walks.js`'s own `walkToCourse`, 10deg step, TWA90->TWA180, TWS6, both `end`)

| boat | end | reached | margin from 180 | wall time |
|---|---|---|---|---|
| `default` | +1 | **stalls at TWA160.3** — no reachable trim at the wp=180 leg | n/a — does not complete | 11139s (~3.1h) |
| `default` | -1 | **stalls at TWA160.3**, identical to `end=+1` — no reachable trim at wp=180 | n/a — does not complete | 11430s (~3.2h) |
| `slim` | +1 | 170.6, converged, restoring, v=100%, no capsize | 9.4deg (just inside +-10) | 5606s (~93min) |
| `slim` | -1 | 170.6, converged, restoring, v=100%, no capsize | 9.4deg | 5338s (~89min) |
| `fat` | +1 | **179.1**, converged, restoring, v=100%, no capsize | 0.9deg | 425s (~7min) |
| `fat` | -1 | **179.1**, converged, restoring, v=100%, no capsize | 0.9deg | 432s (~7min) |

`default`'s own stall (TWA160.3) is a genuine improvement over ADR 0046's
own O9 measurement (TWA151.3, same test, before ADR 0047's windage term and
everything since) — but it still cannot bridge to 180: `findReachableTrim`
finds nothing at the final leg after exhausting its candidate grid, the
same failure mode ADR 0046 first characterised.

**Both `slim` and `fat` complete the walk that `default` cannot — but not
identically.** `fat` lands within 1deg of the actual target, in minutes.
`slim` lands right at the edge of the ±10deg band that defines "reached"
at all, and costs an order of magnitude more wall time per end — most
likely because a thinner corridor at each intermediate leg (per ADR 0050's
own plateau-vs-window characterisation, `slim` sits on the wide, gentle
plateau rather than the high-reward window `fat` occupies) forces
`findReachableTrim` to try many more candidates before one lands inside
the ramped-arrival tolerance. This is a property of the SEARCH cost, not
directly a claim about real-world sailing difficulty, but it is a
real, measured difference between the two shipped variants, not a wash.

### The trim sequence itself, `fat`, both ends identical

`report-long-walks.js`'s `walkToCourse` now also records `trim` per leg
(a small additive change, `found.trim` was already computed and carried,
just not previously surfaced). The crossing is not a smooth slide but a
jump between two distinct trim families, matching ADR 0048's own
family-A/family-B picture concretely:

| leg (target) | settles at | sheet | tackX | crewX | stays | speed |
|---|---|---|---|---|---|---|
| 150 | 147.1° | 68° | **+1** (rig forward) | -1 (aft) | +1 | 100% |
| 160 | 151.2° | 80° | +1 | -1 | +1 | 100% |
| **170** | **179.3°** | **36°** | **-1** (rig aft) | -1 | **-1** | **57%** |
| 180 | 179.1° | 64° | -0.5 | -1 | -1 | 100% |

TWA150-160 (family A) bears away gradually by easing the sheet alone,
everything else fixed. The wp=170 leg is where the jump happens: sheet is
hauled back IN (80deg to 36deg — tighter, not looser), `tackX` flips the
rig from full-forward to full-aft, and `stays` flips the mast rake from
forward to aft rake, all in the same leg, while `crewX` stays fixed full
aft throughout. That simultaneous, large re-trim — not a small correction
— is what crosses the gap, and it costs real speed while crossing (57%,
recovering to 100% once settled in family B). The target was TWA170; the
boat's own dynamics carry it past to 179.3, landing directly in family B's
own attractor rather than at the nominal waypoint — consistent with
`findReachableTrim` locking onto whichever attractor the ramped trim
change actually lands in, not the wp label.

## Decision

**No config change.** This ADR is a measurement closing two previously-flagged
gaps, not a new physics or default decision.

Recorded as the current strongest evidence for the project's own success
criterion: `fat` obtains AND holds a course spanning TWA90 through TWA180 —
the criterion's own two halves, both closed, across the entire tested band
rather than at isolated points. `slim` closes the same two halves, but with
materially thinner margin on the obtaining side.

## Consequences

- Closes ADR 0050's own "neither variant has its own gated acceptance run"
  and "the obtaining-course walk was not re-verified for either" gaps.
- **`default`'s own gap is now measured with the exact same instrument used
  for `slim`/`fat`**, not cited from an older ADR under a different core —
  TWA160.3, not ADR 0046's TWA151.3. The gap moved (some other intervening
  physics change helped a little) but did not close on `default`.
- Does not by itself answer ADR 0048's own still-open question (why static
  restoring stiffness coexists with dynamic escape) — this is an empirical
  confirmation that the fix works end-to-end on the criterion's own terms,
  not a mechanism proof.
- `slim`'s ~90-minute-per-end walk cost is a standing nuisance for anyone
  re-running this specific check on `slim` — not a correctness problem, but
  worth knowing before re-running it casually.
- Untouched: TWS4/TWS10 obtaining-walks (only TWS6 run here, matching
  `report-long-walks.js`'s own default), and the `old` boat variant.
