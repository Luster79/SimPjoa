# ADR 0051 — The existing heel-coupled pair (heelClrSign/yawHeelSign) reconfirmed inert, on the current baseline

*Date: 2026-08-19*
*R1 of `docs/work-order-2026-08-19-asymetria-przechylu.md`, re-screening
`Archive/work-order-2026-08-05-sterownosc.md`'s T3 matrix nine ADRs later
(0032, 0036, 0038, 0044, 0045, 0047, 0049, 0050), including for the first
time against `asymmetryLiftCoeff` active on `slim`/`fat`.*

## Context

`hull.heelClrSign`/`heelClrShiftCoeff` (hydro.js `stationWeights`) and
`sail.yawHeelSign` (aero.js `yawMomentHeel`) are two built-but-zeroed
heel-coupled mechanisms, held at 0 since T3 (2026-08-05) found no sign
combination improved AC-4.2a/b and two of the four combinations
regressed AC-1.1/1.2. That measurement predates nine ADRs' worth of
physics changes, including `asymmetryLiftCoeff` (ADR 0049/0050) — the
first term ever to give the hull a real zero-leeway side force, now
active by default on the `slim`/`fat` boat variants. Whether the
zeroed pair's own null result still holds, and whether it interacts
with the new active term, had never been measured.

Separately, this re-screen surfaced a scoping error in the work order's
own first draft: it initially asked for the full deep-band corridor
(TWA150-180, 11 points) as R1's *search* grid. That is the wrong area —
heel in the deep band is small (~4°, per
`Archive/findings-2026-08-16-stability-not-balance.md`), leaving a
`sin(phi)`-coupled term little to act on there. The work order was
corrected mid-execution: AC-1.1/1.2/4.2's own grids are the search, and
the deep band is reduced to a single regression checkpoint (TWA170, both
`end`) — confirming the pair doesn't undo `asymmetryLiftCoeff`'s
corridor gain, not searching for a new effect there.

## Measured

**Acceptance grid** (`harness/acceptance-manual.js`, own AC-1.1/1.2/4.2a/
4.2b grids, `default`/`slim`/`fat`, all 4 non-zero sign combinations of
`(heelClrSign, yawHeelSign)` plus baseline):

| combo | default | slim | fat |
|---|---|---|---|
| (0,0) baseline | AC1.1/1.2 PASS/PASS, AC4.2a/b PASS/PASS | same | same |
| (+1,+1) | PARTIAL/PARTIAL, PASS/PASS | PARTIAL/PARTIAL, PASS/PASS | PARTIAL/PARTIAL, PASS/PASS |
| (+1,-1) | PASS/PASS, PASS/PASS | PASS/PASS, PASS/PASS | PASS/PASS, PASS/PASS |
| (-1,+1) | PASS/PARTIAL, PASS/PASS | PASS/PARTIAL, PASS/PASS | PARTIAL/PARTIAL, PASS/PASS |
| (-1,-1) | PASS/PASS, PASS/PASS | PASS/PASS, PASS/PASS | PASS/PASS, PASS/PASS |

**AC-4.2a/b is PASS in every cell, on every boat, at every sign
combination** — reproducing T3's structural finding exactly, on the
current baseline. `(+1,+1)` regresses both AC-1.1 and AC-1.2 to PARTIAL
on all three boats; `(-1,+1)` regresses AC-1.2 (and, on `fat` only,
AC-1.1 too); `(+1,-1)`/`(-1,-1)` stay fully neutral everywhere. Same
qualitative shape as T3, now confirmed with `asymmetryLiftCoeff` active
on `slim`/`fat`.

**Deep-band regression checkpoint** (`probe-holds-freely.js --twa=170`,
`slim`/`fat`, both `end`, all 4 combinations, holders out of 162 trims):

| boat | end | holders, all 4 combinations |
|---|---|---|
| fat | +1 | 18, 18, 18, 18 |
| fat | -1 | 18, 18, 18, 18 |
| slim | +1 | 10 or 11 (combo-dependent, see below), flat across sign |
| slim | -1 | 10 or 11, identical to `end=+1` |

Holder count is **identical across all four sign combinations** on
`fat` (18 in every case) and varies only trivially on `slim` (10 vs 11,
not a regression in either direction) — and identical between `end=+1`
and `end=-1` in every cell. The pair has **zero measurable interaction**
with `asymmetryLiftCoeff`'s corridor gain in either direction, matching
the structural argument (`heelClrSign` only acts through leeway-driven
force, which is zero at this test's steady-state trims by the time the
oar is shipped; `yawHeelSign` is a rig moment, not a hull force) rather
than a coincidental null.

## Decision

**Both `heelClrSign` and `yawHeelSign` stay at 0.** R1 fully confirms
the work order's own expectation: this pair cannot reach AC-4.2 (wrong
mechanism — it only reshapes an already-driven leeway force, not a
zero-drift one) and now, newly measured, does not interact with
`asymmetryLiftCoeff`'s deep-band gain either way. There is nothing here
for a re-anchored default to pick up; re-running the matrix on the
current baseline changed no conclusion, only the evidence backing it.

This closes R1 without adopting new physics. Per the work order's
own "stop when the criterion is met" rule (Part III) — R1 alone does not
close the question that motivated this work order (whether a
heel-induced side *force*, as opposed to this pair's redistribution/
moment mechanisms, exists and should be modelled) — R2 proceeds
separately; see `docs/adr/0052` if it ships a decision.

## Consequences

- No config change. `heelClrSign`/`yawHeelSign` remain built, measured,
  and held inert — same status quo as before this ADR, now re-verified
  on today's baseline rather than 2026-08-05's.
- No `out/polar.csv` change (nothing was adopted).
- Confirms the interaction question the work order raised as
  genuinely open is now closed: `asymmetryLiftCoeff`'s corridor gain on
  `slim`/`fat` is safe against either of this pair being turned on or
  off, in any sign.
- The scoping correction (deep band is a regression check, not R1's
  search grid) carries forward to R2's own sift grid — see
  `docs/adr/0052`.
