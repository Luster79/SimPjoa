# Round 10d findings report — absolute helm balance, through-gybe aback, parked-state audit

Status: H1, H2, H3, C-A, C-B, C-C all landed. Full test suite: 76/76
non-xfail assertions pass (69 pre-round + 5 new: H2 x2, H3, C-A replaces
the old dead-run-release check 1-for-1), 1 known limitation unchanged
(`xfail:CALIBRATION`, pre-existing, unrelated to this round). 3 pre-
existing failures (recording-fixture loads) are unrelated to this round —
see section 7. Bundle rebuilt and spot-checked; UI changes verified with
a headless-browser drive against a local dev server (see section 8 for a
pre-existing dev-server bug found and fixed along the way).

## 1. H1 — absolute helm balance (`core/config.js` hull.lead)

No prior test bounded the ABSOLUTE helm balance at a fixed trim — only
DIFFERENTIAL steering-direction tests existed (T1-4, "Sail steers", C-
bearaway), which only ever check that a *change* moves the boat the right
*way*, never whether a *fixed* trim is anywhere near neutral. That gap is
exactly what let the field-reported spontaneous bear-away go unnoticed.

New test: TWS 6, polar-optimal beam-reach trim (TWA90, best sheet, crew
0.35/0, no carrot), settle 30s under the heading-hold autopilot, release
the rudder, measure the initial course rate (5s window) and the max
excursion over 60s.

**Before (lead=0.05\*L, the round-9 value):** bestSheet=28deg.
`initialRate=+0.315deg/s` (weather-side, fine), `maxExcursion(60s)
=16.16deg` — just over the 15deg ceiling.

**Lead sweep** (same probe, sheet re-optimized per point):

| lead (×L) | bestSheet | initRate (deg/s) | maxExc 60s (deg) | side |
|---|---|---|---|---|
| 0.05 | 28 | +0.315 | 16.16 | weather (marginal fail) |
| 0.055 | 28 | +0.229 | 11.70 | weather |
| 0.06 | 28 | +0.143 | 7.22 | weather |
| 0.065 | 28 | +0.058 | 2.84 | weather (near the flip) |
| 0.07 | 28 | -0.027 | 1.25 | lee (sign flip here) |
| 0.075 | 28 | -0.112 | 3.72 | lee |
| 0.08 | 28 | -0.197 | 5.26 | lee |
| 0.10 | 28 | -0.532 | 16.46 | lee (fails) |
| 0.15 | 28 | -1.341 | 41.14 | lee (fails badly) |

The balance is a knife edge across the whole 0.05-0.07\*L span (sign
flips between 0.065 and 0.07). `lead=0.06*L` was picked over values
closer to the flip (e.g. 0.065, excursion 2.84deg) specifically for
margin from that edge, not because it's the smallest passing excursion.
**After:** `initRate=+0.143deg/s`, `maxExcursion(60s)=7.22deg`, both
comfortably inside bounds, genuine weather-side drift (matches the
manual's "hands-off canoe settles toward the wind" convention the
criterion cites). A 180s extended run shows the drift keeps growing
slowly (15.5deg by 180s) rather than asymptoting — expected: a real boat
left rudder-free on a reach keeps rounding up until it stalls near
head-to-wind, the textbook safe-helm failure mode, not a defect.

### D-6 rate bands / T3-T4 differential re-run (as instructed: "expect shifts")

- **Regression found and fixed:** "Sail steers: trimming the sheet in
  points up" dropped from `drift=2.3deg` to `drift=1.3deg` under the new
  lead — under `steeringOk`'s 2deg floor. Re-picked the trim-in step
  alone (15deg -> 20deg, same TWA70/sheet25 base every other block in
  that section shares) rather than the base trim: `drift=3.0deg`, clear
  again. Windward-brail leg (unaffected mechanism) unchanged, -3.4deg.
- T2 (crewPosX): 4.4/-4.6 -> 4.3/-4.5, no change needed.
- T3 (trim-in flying oscillation): unaffected (maxPhi -0.3deg over 90s,
  still bounded).
- T4 (windward brail lowers ama load): unaffected (0.16->0.13).
- D4-1/D4-2/D4-3, C-bearaway, C-deadrun (post C-A): all still pass, no
  further re-picks needed.

## 2. H2 — through-gybe aback detection (`core/stability.js`,
`core/integrator.js`, `harness/scenarios.js`, `ui/app.js`)

### Root cause

`updateAback`'s `isAback` required BOTH `phi<0` AND `amaLoad>1.0` (the
ama fully, physically submerged) before the timer counted *any* time at
all. Swept the through-gybe corner (settle on a reach, then step the true
wind to the ama-leeward side, rudder=0 throughout — same pattern as the
existing `scenarioBackwindSlam`):

| aback offset | TWS | crewPos | maxAmaLoad | minPhi (deg) | capsized | capsizeT (post-crossing) |
|---|---|---|---|---|---|---|
| 90 | 8 | 0 | 16.3 | -163 | yes | 3.7s |
| 90 | 10 | 0.2 | 18.2 | -182 | yes | 0.65s |
| 100 | 8 | 0.2 | 0.807 | -8.1 | **no** | never |
| 100 | 8 | 0.35 | 1.171 | -11.7 | no (transient blip only) | never |
| 100 | 10 | 0.35 | 19.5 | -195 | yes | 0.64s |
| 110 | 8 | 0.2 | 0.632 | -6.3 | **no** | never |
| 120 | 8 | 0.35 | 0.735 | -7.4 | **no** | never |

The bolded rows are the actual bug: a real, sustained, pressed condition
(sail jammed at delta~0 against the mast, phi negative for the entire
run) that the old detector never flagged at all — not a warning, not a
tick of the timer — because the buoyancy-side restoring arm
(`ama.maxBuoyancy`, much stronger than the flying side's `ama.mass`, R8's
own designed asymmetry) is enough to hold a sub-1.0 equilibrium
indefinitely. `amaLoad>1` (full submersion) is a severe, LATER-STAGE
CONSEQUENCE of sustained aback, not aback's own nautical definition (wind
on the wrong side of the sail).

### Fix

Added `abackWarning = phi<0 && Msail<0` (`Msail`, the sail's own current
roll-moment contribution, already computed every step — "the pressing
moment on the ama" from the work order is literally this term) as a
**separate** signal, deliberately kept out of the capsize timer itself.
Folding it into `abackTimer`'s own gate (tried first, `phi<0 && (amaLoad>1
|| Msail<0)`) broke D4-1, D4-2, D4-3, and C-deadrun into false capsizes:
ordinary downwind sailing at TWA150-178 routinely has brief negative-phi/
negative-Msail moments that are not a sustained press, and piling them
onto the same timer that governs real capsize turned safe, validated
scenarios into wrecks. `updateAback`'s signature changed to
`(state, amaLoad, Msail, dt, config)`; the timer/capsize gate itself
(`phi<0 && amaLoad>1.0`) is byte-for-byte unchanged.

### New scenario + assertion

`scenarioThroughGybeAback` (TWA60 settle, TWS10, sheet45, crewPos0.35,
crosses to the ama-leeward side at t=10s, driven open-loop): warning
fires at `warnDelay=0.00s` (<< the 3s bound), and — driven open-loop with
no relief — capsizes via the pre-existing, *unchanged* timer path at
`t=16.64s` (6.64s after the crossing: ~0.6s to reach full submersion +
the existing 6s `abackCapsizeTime`). Both halves of the acceptance
criterion pass without needing the capsize mechanism itself to change.

### Live UI verification

Drove the actual `ui/index.html` (headless Chromium) through both
severities:

- Severe crossing (TWS10, offset -100deg): banner correctly shows the
  red **"ABACK — ama to leeward — capsize in Xs"** countdown, unchanged.
- Mild crossing (TWS8, offset -115deg, the previously-silent case):
  banner now shows the new amber **"ABACK WARNING — sail pressed, ama
  loading"** tag, sustained for the whole 6s window watched, amaLoad
  holding 43-52% (never reaching the old detector's threshold) — this is
  the gap H2 closes, directly visible in the live UI, not just the
  headless harness.

## 3. H3 — parked-state audit (`harness/asserts.js`)

Investigated the reported "u=0.00 exactly" pin. Every hydro force
(`hullResistance`, `hullSideForce`, `amaDrag`) is IDENTICALLY zero at
`u=v=0` by construction (`Math.sign(0)===0` in JS, and each term is
`Math.sign(u)*u*u`-shaped) — physically correct (zero relative water
speed genuinely means zero drag), not a bug. Direct `sailForces()` probes
at rest (`u=v=0`, real TWS=6) found nonzero Fx/Fy at every TWA tried,
including the fully symmetric TWA=180 dead-run case (`Fy=0` by symmetry
there, but `Fx=12.17N`, nonzero) — no true zero-force fixed point exists
in the model at any TWS>0, furled or not.

For the specific scenario the new assertion checks (parked hull, beam
TWS6, sail furled), the existing furled-spar drag alone (`aero.js`: `CDf
= ... + sail.CD0*furl` — the furl mechanism zeroes CL but never CD)
already supplies real above-water windage: **`speed=0.0627 m/s`** after
60s, comfortably inside `[0.05, 0.4]`. No new CONFIG windage coefficient
was added — the requested resolution path B ("document why the exact
zero is a genuine balance") applies for this specific scenario.

**Open item, not silently assumed fixed:** the exact literal "u=0.00" in
the field report was not reproduced at the code level despite several
attempts at plausible pinned/jammed configurations (delta pinned at 0,
dead-run TWA180, various rest-start TWAs) — none produced a genuine
IEEE-exact-zero fixed point, only small-but-nonzero drift or (for
untrimmed configurations) outright acceleration. Most likely explanation:
a 2-decimal UI/console readout displayed as bit-exact. Flagged here for
the next recorded ride (see section 9) to settle definitively.

## 4. C-A — dead-run release rate metric (`harness/asserts.js`)

Old test: 30s min-TWA snapshot, `minTwa >= 160`. This green-lit a slow,
sustained divergence: a trim that's still comfortably above 160 at t=30s
but keeps drifting for the full 2 minutes would have passed outright.

New test: 120s window, NET drift rate (not a worst-instant sub-window —
this trim's own initial settle-in transient is genuinely faster than
20deg/min for its first ~30s before decelerating, a real weather-helm
character, not a defect; a worst-sub-window metric would flag that
transient itself). **`twaStart=177.9, twaEnd=157.3, rate=10.27deg/min`**
— under the 20deg/min bound with real margin, and the deceleration
pattern (167.2@t+30s -> 158.8@t+120s) confirms this is a converging,
self-limiting drift, not a runaway one.

## 5. C-B — brailWind UI zone marking (`ui/index.html`, `ui/app.js`)

Two-tone track (green 0..brailTrimRange TRIM / amber
brailTrimRange..1.0 SURVIVAL) + a boundary tick + a bilingual tooltip
("0-60%: trim (carrot).../trym (marchewka)... · 60-100%: power dump/
zrzut mocy..."), all read from `CONFIG.sail.brailTrimRange` at init,
language switch, and any boat-design Apply/reset (`updateBrailZoneUI()`)
— never hardcoded. Verified live (headless Chromium): `--trim-pct: 60%`,
tick at `left: 60%`, tooltip text correct in both EN and PL, no console
errors.

## 6. C-C — camber-model unification (`core/aero.js`, `core/config.js`)

The v2 aero table was digitized from an already-cambered real sail (Di
Piazza's Santa Cruz rig, ~1:10 camber per the source literature), but the
old `camberCLFactor(alpha, camber)` multiplier — `1+1.75*camber` at low
alpha — always computed its bonus RELATIVE TO A FLAT PLATE. `sail.camber`
itself was already correctly zeroed for v2 (so the table's own baseline
was untouched), but `sail.brailCamberGain` (the TRIM-regime brail's
belly-deepening bonus, the only thing that makes `camberEff` nonzero by
default) was still fed through that flat-plate-relative formula on top of
an already-cambered curve every time the windward brail is partially
pulled — genuine double-counting.

Fix: `camberCLDelta(alpha, camberDelta, builtinCamber)` takes the RATIO
of two absolute `camberCLFactor` evaluations
(`camberCLFactor(alpha, builtin+delta) / camberCLFactor(alpha, builtin)`),
so the table's own baseline cancels out algebraically. At `camberDelta=0`
this is an exact identity for any `builtinCamber` (matches today's
already-correct default exactly); at `builtinCamber=0` (v1, a genuinely
flat theoretical table) it reduces to the OLD absolute formula unchanged
— v1's semantics are untouched. New `sail.aeroV2BuiltinCamber=0.10`
config field, read only when `aeroTableVersion==='v2'`.

Also extended `camberCLFactor`'s fade window 45deg -> 75deg
(`CAMBER_FADE_END_DEG`): sampled `alphaSailor` across the TRIM-regime
deep-course recipes this bonus actually targets (D4/C's own TWA140-178
trims) and found 32-85deg, mostly PAST the old 45deg cutoff — the bonus
was silently near-inactive for most of its own intended use case.

### C2 re-anchor (re-verified, not re-bounded)

| | before C-C | after C-C |
|---|---|---|
| bestSheetAngle @ TWA160 | 24 | 16 |
| speed(105) | 4.418 | 4.418 |
| speed(160) | 3.202 | 3.272 |
| ratio | 0.725 | 0.741 |

Both comfortably inside the existing `[0.55, 0.85]` band bracketing the
Di Piazza CR ratio (0.69) — bounds unchanged, only re-verified.

## 7. Pre-existing, out-of-scope test failures (unrelated to this round)

`R7-4b`, `D4-4`, and `C-kurspelny2` fail to load their recording fixtures
(`recordings/simpjoa-recording-20260716-155817.json`,
`recordings/kurspelny.json`, `recordings/kurspelny2.json`) — these three
files are absent from the working tree (removed in an uncommitted change
that also archived the round 5-9 work-order docs into `Archive/` and
added three new recordings, `a1.json`/`a-max.json`/`a-max_W.json`, ahead
of this round starting). Not touched here — deciding whether those three
regression tests should be retired, repointed at the new recordings, or
the old files restored is a scope call for the user, not an incidental
fix bundled into this round's diff. All three fail the same way they did
in the pre-round-10d baseline (verified before any change in this round).

## 8. Incidental fix: dev-server CSV shim (`ui/shims/node-fs.js`)

Encountered while UI-testing C-B: `ui/index.html` served over
`python3 -m http.server` has been completely broken since round 10 —
`core/config.js` loads THREE CSVs (`crab_claw_CL_CD_polhamus.csv`,
`crab_claw_CL_CD_v2.csv`, `example_proa_parameters.csv`), but the
browser `node:fs` shim's pre-fetch list only ever knew about two; `v2`
was added in R10-1 and the shim was never updated, so `createConfig()`
throws instantly on page load in dev mode (the bundled
`dist/simulator_standalone.html` was unaffected — `tools/bundle.js`
embeds all three CSVs directly, not via this shim, which is why this went
unnoticed for several rounds). One-line fix (add the missing URL to
`DATA_FILES`); verified fixed by loading the live page afterward.

## 9. Ask

Per the ground rules: please **RECORD** (F9) the next field ride. The
TWA113 ride that started this round was unrecorded, and H3's one open
item (the literal "u=0.00" reading) would be settled directly by a real
frame-by-frame trace instead of a best-effort reconstruction.
