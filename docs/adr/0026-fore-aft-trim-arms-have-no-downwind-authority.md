# ADR 0026 — Fore-aft trim arms have no downwind authority

*Date: 2026-08-04*

## Context

`implementation_plan_1.md` proposed to fix the boat's excessive weather helm on
broad-reach and downwind courses (TWA 110-160°) with the paddle shipped, by
enlarging three trim-authority constants:

| | was | now |
|---|---|---|
| `sail.tackTravel` | 0.5 m | **0.8 m** |
| `hull.crewForeAftTrimCoeff` | 0.15 | **0.25** |
| `sail.ceBrailXShift` | 0.333 | **0.5** |

Its premise was that the manual's own downwind recipe — tack forward, windward
brail set to the "carrot", crew aft — should be enough to hold the course, and
that the model was simply under-powering those levers.

The changes were applied and measured against the plan's own acceptance
criterion: drift < 15°/min, |r| < 0.5°/s, over a 120 s rudder-free release.

## Decision

**Keep the three values, and record that they do not do what the plan intended.**

They are kept because each is defensible on its own terms — all three stay
inside their previously stated plateaus, the suite is clean, and the extra tack
travel is a small genuine gain close-hauled. They are *not* kept as a fix for
downwind course holding, because measurement says they are not one.

The finding, which is structural rather than a matter of magnitude: the sail's
yaw moment splits into `xCE*Fy` (fore-aft arm acting on the sail's SIDE force)
and `-yCE*Fx` (lateral arm acting on the DRIVE force). Deep downwind it is the
side force that collapses:

| TWA | sail Fy | +0.3 m of tack travel buys |
|---|---|---|
| 70 | −185 N | −56 N·m |
| 110 | −90 N | −27 N·m |
| 140 | −24 N | −7 N·m |
| 160 | −3 N | −1 N·m |

Every fore-aft arm in the model — `sail.tackTravel`, `sail.ceBrailXShift`,
`hull.lead` — is multiplied by `Fy`, so all of them lose their authority
exactly where the plan needed it, and the little they do add on deep courses
carries the round-up sign.

What the boat is actually fighting is not rig trim. At TWA 140 / TWS 6 with the
full bear-away trim set and the paddle shipped, the sail contributes **+6 N·m**
at release while the hull's own weathercocking reaches **−116 N·m** as leeway
builds; the boat settles at TWA ~77 where the hull moment balances the Munk
moment. The deficit is the hull's directional stability — the same finding
S1b/S1c already carry for reaching courses, and the same one the missing
heel-dependent hull terms and the ama's absent lateral plane point at.

## Consequences

- **The plan's acceptance criterion is not met and is not tuned green.** A new
  assertion, `C-B`, measures exactly the plan's probe (paddle shipped, tack
  forward, crew aft, carrot, 120 s release at TWA 140 and 160) and is tagged
  `xfail:STEERING` with its numbers: 31.0 and 36.2 °/min against the 15 °/min
  ceiling, 0/2 points holding.
- **`C-A` moved 44.38 → 43.63 °/min** — 1.7%, against a 20 °/min criterion.
  Recorded so the next attempt does not re-derive it.
- **`out/polar.csv` changed on nine rows, all of them TWA 40/50/60.** Every row
  at TWA ≥ 70 is byte-identical. That is independent confirmation of the
  finding: the tack travel the polar search can now reach has authority
  close-hauled and none downwind. Largest change +1.3% (TWA 40 / TWS 6);
  TWA 50 / TWS 10 is 1.0% slower.
- `out/scenario_squall.csv` and `out/scenario_stop.csv` changed throughout,
  both via `ceBrailXShift` — both scenarios drive the brails.
- The three constants now carry comments saying where they do and do not
  reach, so the next plan does not repeat the attempt.

## What would actually address it

Not another fore-aft constant. The lateral arm (`sail.yceBrailShift`,
`sail.yceFraction`, `sail.ceRadius`) is the one that acts on the drive force
and therefore has real downwind authority — that is the mechanism ADR 0024
opened and the manual's "carrot" uses. Beyond that, the ceiling on any rig-trim
fix is low while the hull produces an order of magnitude more moment than the
rig: the structural items are the heel-dependent hull terms and the ama's
lateral plane.
