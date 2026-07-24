# Round 10c findings report — the carrot is a trim tool, not a parking brake

Status: C1 and C2 landed. Full test suite: 78/78 assertions pass (74
pre-round + 4 new C2 checks), 1 known limitation unchanged (`xfail:
CALIBRATION`, pre-existing, unrelated to this round). Bundle rebuilt and
spot-checked directly against a headless-browser drive of the standalone
HTML. No determinism regression.

## 0. Process note (C3)

Per C3, `dee918e..HEAD` (the five Round 10b commits) was pushed to
`origin/main` before any C1 work started, so the pending review of 10b
stays a clean, separate diff from this round's.

## 1. C1 — two-regime `brailWind` characteristic (`core/aero.js`,
`core/config.js`)

Round 5's linear multipliers (`CL x(1-0.8b)`, heel-moment `x(1-0.9b)`)
conflated the manual's two real windward-brail roles into one curve. C1
splits them at `sail.brailTrimRange` (default 0.6):

- **TRIM** (`b <= brailTrimRange`): mild CL cut (`x0.85` at the trim
  boundary), moderate heel-moment cut (`x0.7`), a new camber bonus
  (`sail.brailCamberGain`, peaking at the trim boundary) that reuses the
  existing `camberCLFactor`/`camberCDf` machinery, and — new — a
  dedicated, stronger lateral-CE-arm shrink (`sail.yceBrailShift`,
  default 0.6, vs. the existing `ceBrailShift`=0.3 that still governs
  `xCE` alone). `ceBrailShift` itself is untouched, full strength across
  the whole range, as the doc specified.
- **SURVIVAL** (`b > brailTrimRange`): ramps to the original strong cuts
  (CL `x0.2`, heel-moment `x0.1` at `b=1`), preserving T6/panic, the stop
  scenario, and the squall controller unchanged.

The join at `brailTrimRange` is smooth (matching value AND zero slope
from both sides) via `brailRegimeBlend()`: each regime is a plain `lerp`
between its own two endpoints, but the interpolation parameter is
`smoothstep(t)` rather than raw `t` — smoothstep's derivative is exactly
0 at both ends, so a single `brailTrimRange` knob is enough for a no-kink
join without a separate blend-width parameter.

### Before/after probe table

Deep-course trim (TWA165, TWS6, yard eased to 70deg, crewPos 0.2), swept
over `brailWind` at `b = 0, 0.3, 0.5, 0.8, 1.0`:

**Before (round 5 linear cuts, pre-C1):**

| b | CL | CD | camber | Fx (N) | Fy (N) | heelMoment | heelMult | yawMoment | xCE | yCE |
|---|---|---|---|---|---|---|---|---|---|---|
| 0.00 | 0.2388 | 1.1096 | 0.0000 | 107.85 | -25.06 | -50.1 | 1.000 | 24.03 | 0.0520 | -0.2349 |
| 0.30 | 0.1815 | 1.1096 | 0.0000 | 105.46 | -30.12 | -44.0 | 0.877 | 20.75 | 0.0597 | -0.2138 |
| 0.50 | 0.1433 | 1.1096 | 0.0000 | 103.87 | -33.49 | -36.8 | 0.735 | 18.57 | 0.0648 | -0.1997 |
| 0.80 | 0.0860 | 1.1096 | 0.0000 | 101.49 | -38.55 | -21.6 | 0.431 | 15.32 | 0.0725 | -0.1785 |
| 1.00 | 0.0478 | 1.1096 | 0.0000 |  99.90 | -41.92 |  -8.4 | 0.167 | 13.17 | 0.0776 | -0.1644 |

**After (C1 two-regime):**

| b | CL | CD | camber | Fx (N) | Fy (N) | heelMoment | heelMult | yawMoment | xCE | yCE |
|---|---|---|---|---|---|---|---|---|---|---|
| 0.00 | 0.2388 | 1.1096 | 0.0000 | 107.85 | -25.06 | -50.1 | 1.000 | 24.03 | 0.0520 | -0.2349 |
| 0.30 | 0.2209 | 1.3592 | 0.2250 | 129.13 | -37.03 | -62.9 | 1.256 | 22.67 | 0.0597 | -0.1926 |
| 0.50 | 0.2056 | 1.5719 | 0.4167 | 147.26 | -47.22 | -68.2 | 1.361 | 21.16 | 0.0648 | -0.1644 |
| 0.80 | 0.1254 | 1.3592 | 0.2250 | 125.16 | -45.46 | -36.4 | 0.725 | 11.99 | 0.0725 | -0.1222 |
| 1.00 | 0.0478 | 1.1096 | 0.0000 |  99.90 | -41.92 |  -8.4 | 0.167 |  6.13 | 0.0776 | -0.0940 |

Reading it: at `b=0` and `b=1` the two tables are IDENTICAL by
construction — `b=0` was always `x1.0`/no cut in both models, and `b=1`
was always the old strong cut in both (C1's SURVIVAL-regime endpoint
matches it exactly: CL `x0.2`, heel-moment `x0.1`), so C1 changes nothing
at the extremes, only the SHAPE in between. Inside the trim regime, `Fx`
actually *increases* (108N → 147N at `b=0.5`) rather than collapsing —
this is the "sail keeps drawing" claim: at this deep-course, high-alpha
trim, drag dominates driving force (running before the wind), and the
camber bonus raises both CL and CD, so the net drive goes up even though
the CL-cut multiplier alone is still shrinking. `xCE` is untouched (same
column both tables, confirming `ceBrailShift` stayed independent).
`yCE`'s shrink is visibly stronger after C1 (`-0.164` vs `-0.198` at
`b=0.5`; `-0.094` vs `-0.164` at `b=1.0`) — the new `yceBrailShift`
lever, which is what the yaw-moment column (`24.0→6.1` at `b=1`, vs
`24.0→13.2` before) is actually chasing.

**Known limitation carried into this round** (documented at
`sail.brailCamberGain`'s definition in `core/config.js`):
`camberCLFactor` zeroes any camber benefit above `alphaAbsDeg=45deg`
(tuned for the old v1/Polhamus table). Deep-course trims often sit at or
above that alpha — the recording used as this round's replay fixture
(`kurspelny2.json`) averages `alphaSailor~50deg` — so the camber bonus's
measured effect is smaller than its nominal magnitude suggests over a
full downwind leg. Reused as the doc specified (`"reusing the existing
camber->CL machinery"`) rather than also reshaping `camberCLFactor`'s own
window, which would be a second, unscoped change.

## 2. C2 — acceptance tests (`harness/asserts.js`, `harness/polar.js`)

- **Deep-course speed ratio**: `computePolar` now searches `brailWind`
  (coarse grid `[0, 0.3, 0.6]`) for TWA>=135 only
  (`harness/polar.js`'s `BRAIL_SEARCH_DEEP`) — upwind/reaching legs never
  search it, keeping the added cost scoped to where the carrot is a real
  candidate. At TWS6: `speed(105)=4.405` (sheet32, brail0),
  `speed(160)=3.202` (sheet24, brail0.6), **ratio=0.727** — inside
  `[0.55, 0.85]`, bracketing the Di Piazza CR ratio (0.69).
- **Bear-away authority**: from TWA140, carrot 0.5 with the autopilot's
  own rudder output CAPPED at 0.3 (not full [-1,1] authority) reaches and
  holds TWA164.9 over the last 10s of a 60s window — `maxRudderUsed=0.30`
  (the cap saturated for the whole approach, i.e. the carrot's own yaw
  moment is doing the rest of the work, not a rudder that happened to
  have spare headroom).
- **Dead-run release**: trimmed to TWA178 with carrot 0.5, releasing the
  rudder fully for 30s bottoms out at `minTwa=167.3` — comfortably clear
  of the 160 floor. No yaw-moment-budget report needed (only required "if
  it still fails").
- **`kurspelny2.json` replay fixture**: the user's own recorded downwind
  session (mean `brailWind=0.93`, TWA staying in [146.6, 154.8]deg for
  all 12349 frames) replayed under today's live config:
  `meanSpeed: 2.588 -> 2.607 m/s` (+0.019, +0.7%), no capsize. Modest,
  not dramatic — expected, since a mean brail of 0.93 sits mostly in the
  SURVIVAL regime, where C1 deliberately preserves the old strong cuts
  rather than the TRIM regime's un-gutting. The baseline (2.5883462493946987,
  reported as 2.588) is the recording's OWN control sequence replayed
  under a genuine `git worktree` checkout of `dee918e` (the pre-C1 code
  the recording's own `codeVersion` metadata names) — NOT
  `createConfig(recording.configSnapshot)` against today's tree, which
  would silently pick up C1's new config defaults via `deepMerge` (any
  field C1 *added* rather than changed just falls through to today's
  default when the old snapshot doesn't mention it) and make a dynamic
  before/after comparison read identically on both sides. See the
  assertion's own comment in `harness/asserts.js` for the full
  reasoning — this is the same frozen-snapshot replay pattern `D4-4a`
  already uses, just computed once here rather than trusted to
  `deepMerge` alone.
- **"T5 xfail re-run"**: doesn't apply literally — Round 10b (D2) already
  promoted T5 out of `xfail` (it's the plain, non-xfail "T5: the windward
  brail (carrot) lowers downwind rudder workload" check). It re-verified
  anyway under C1: workload dropped `0.0038 -> 0.0025` (34% reduction),
  more than 10b's own measured 26%.
- **Survival-regime regression**: T6 (panic release), the stop scenario,
  and the squall scenario all pass unchanged — no new code needed, just
  confirmed by the full suite run.

## 3. TWS=6 polar, before vs after (C1+C2 combined)

| TWA | before bestSpeed/sheet | after bestSpeed/sheet/brail |
|---|---|---|
| 40-130 | unchanged (BRAIL_SEARCH_DEEP only applies TWA>=135) | unchanged |
| 140 | 3.57/52 | **3.67**/72/**0.6** |
| 150 | 3.32/68 | **3.33**/64/**0.6** |
| 160 | 3.12/20 | **3.20**/24/**0.6** |
| 170 | 2.94/48 | **3.09**/48/**0.6** |

Every deep-TWA row now picks the trim-regime boundary carrot (`b=0.6`,
the strongest pull the coarse search grid offers before the survival cuts
start biting) and gains speed — TWA170 improves the most (2.94→3.09,
+5%). TWS=4 and TWS=10 show the same qualitative pattern (every TWA>=140
row's optimizer also picks `brail=0.6`); not tabulated before/after here
since 10b's own report only measured TWS=6 as a clean baseline.

## 4. Bundle fidelity spot-check

Rebuilt `dist/simulator_standalone.html` (`node tools/bundle.js`).
Scenario: windDir=250, windSpeed=6, sheet=70, brailWind=60 (the
TRIM/SURVIVAL boundary, `b=0.6` — exercises C1's new code path
directly), 10 single-steps (1/60s each) from Reset, driven headlessly via
Playwright/Chromium (established methodology: pause, set sliders, Reset,
single-step with a double-`requestAnimationFrame` yield between clicks).
Direct-core reference: TWA=160.028deg, speed=0.580kn, yard=15.000deg.
Bundled page HUD after the same sequence: TWA=160, speed=0.6kn — exact
match at displayed precision, no console/page errors. All four new C1
config symbols (`brailRegimeBlend`, `brailTrimRange`, `yceBrailShift`,
`brailCamberGain`) confirmed present in the bundled output.

## 5. Scope notes / not done this round

- `camberCLFactor`'s `alphaAbsDeg>=45deg` ceiling (see sec 1) is a
  pre-existing mechanism, not something C1 introduced — reshaping it to
  extend camber's benefit into the high-alpha regime deep courses
  actually live in would be a real, separate physics change (it also
  feeds every OTHER camber-bearing trim in the model, not just the
  carrot), out of this round's "reuse the existing machinery" scope.
- `BRAIL_SEARCH_DEEP`'s grid (`[0, 0.3, 0.6]`) is coarse by design (doc's
  own instruction) and stops exactly at `brailTrimRange` — it never
  samples the survival regime, since a survival-regime pull is never the
  fast trim. A finer grid or a proper continuous optimizer is a possible
  follow-up if a future round wants the polar's reported optimum
  brailWind to be more than "which coarse grid point won."
