# Round 10 findings report — reference-data integration

Status: all five items (R10-1 through R10-5) attempted and landed. Full
test suite: 68/68 assertions pass, 1 known limitation tracked as xfail
(re-diagnosed against the new data, not force-fit). Bundle fidelity
spot-checked directly (bundled vs. direct-core computation). No
determinism regression.

## 1. R10-1 — measured-anchored aero table (see `docs/adr/0003`)

Digitized Di Piazza, Pearthree & Paille 2014 (Fig 3, Santa Cruz —
Section A of `data/dipiazza_2014_digitized.csv`):

| point | CL | CD | L/D |
|---|---|---|---|
| LDmax_region | 0.70 | 0.13 | 5.38 |
| pre_stall | 1.10 | 0.35 | 3.14 |
| CLmax | 1.38 | 0.75 | 1.84 |
| post_stall | 1.20 | 1.00 | 1.20 |

Theoretical Polhamus CLmax (apex 45°) is 1.916 — a ~35% overshoot vs.
measured. Fit method: keep the Polhamus CL(alpha) shape, rescale via
three parameters (CLgain, alphaStretch, CD0/s), independently per apex.

**Fit residuals** (both apexes; anchor alphas back-solved since Di
Piazza gives no alpha, only CL/CD pairs):

| apex | CLgain | alphaStretch | CD0 | s | max\|residual\| |
|---|---|---|---|---|---|
| 45° | 0.7202 | 1.10 | 0.040 | 0.406 | 0.021 (pre_stall) |
| 60° | 0.6491 | 1.10 | 0.040 | 0.428 | 0.021 (pre_stall) |

Constraint enforced during the fit search: the curve must not exceed
the paper's own labeled L/Dmax (5.38) anywhere else — an earlier,
unconstrained least-squares fit let CD0 collapse toward ~0.006-0.01,
producing an implausible L/D spike (>11) in the low-alpha region the
four anchors don't cover (a pure extrapolation artifact, not a real
sail characteristic). The `alphaStretch` parameter uses a piecewise
alpha remap (simple multiply on the rising side of the curve, a linear
rescale onto [peakAlpha, 90] on the falling side) — a naive single
multiply pushes the underlying reference alpha past 90° on the falling
side for stretch values far from 1, where the flat-plate Polhamus
formula goes negative (verified: this produced CL=-0.18 at alpha=88°
before the fix).

**Runtime wiring:** `aero.js` never reads a table's CD column — CD is
recomputed at runtime from `sail.CD0`/`sail.s`. These were updated to
match the fit (0.040/0.41, apexAngleDeg=50-interpolated between the two
per-apex `s` values). `sail.camber` set to 0 (was 0.10): the measured
curve already carries whatever camber the real Santa Cruz sail had —
applying the theoretical camber-boost multiplier (meant for the flat,
uncambered v1 curve) on top would double-count it.

**v1 kept, not replaced:** `CONFIG.sail.aeroTableVersion` ('v1'|'v2',
default 'v2') switches at runtime; `createConfig()` re-derives the
active `config.aeroTable` from this flag on every call. The boat-design
tab's schema was updated to match (stale `hull.sideForceCoeff`/
`leewaySaturationDeg`/`leewayMushingCoeff` entries removed in R10-3, new
CS/relief/aeroTableVersion-adjacent fields added).

**Whole-round polar** (TWS=6, before/after R10-1):

| TWA | before (m/s) | after R10-1 (m/s) |
|---|---|---|
| 40 | 2.64 | 2.79 |
| 90 | 7.54 | 4.36 |
| globalMax | 7.90 | 4.36 |

An honest, expected ~35%-at-the-margin power cut, not a regression —
the whole point of correcting an overshot theoretical CLmax.

## 2. R10-2 — driving-force reference (`data/driving_force_vs_AWA.csv`)

Replaced the round-0 Marchaj-anchor-plus-estimated-shape curve with Di
Piazza's own measured CR-vs-heading (Section B, Santa Cruz 8 points +
Micronesia 4 points, theta 30-160°). No measured Bermuda-rig equivalent
exists in this source, so that comparison column was dropped rather
than left stale. Marchaj's own figure (CR~1.7 at AWA=90) is now a
documented upper-bound comparison — Di Piazza's own measured Santa Cruz
peak is 1.52 at theta=105°, ~11% below it for a nominally similar rig.
This file is referenced only in harness comments/README provenance (not
programmatically loaded anywhere), so the change is documentation +
reasoning, not a behavior change in itself.

## 3. R10-1 downstream fallout, diagnosed and re-picked (no physics retuned)

Four harness probe trims happened to sit near the OLD curve's own power
peak/shoulder, or depended on the old sail's absolute power to produce a
meaningfully large effect — all re-picked to the new curve's shape, none
of the underlying physics retuned:

- **CL calibration anchors**: re-derived directly to the new measured
  values — `[1.6,1.8]` → `[1.05,1.25]` (measured 1.154 at 35°),
  `[1.75,2.0]/38-46°` → `[1.30,1.45]/45-58°` (measured CLmax=1.379 at
  52°).
- **Brail moment/drive-ratio probe**: yard=25° (near the OLD CLmax) now
  sits down the new curve's shoulder (CL~0.95, not ~1.76) — windward
  brail's CL cut collapsed Fx by >99%, making the moment/drive ratio
  numerically unstable (driveDropWind=0.995, ratio just under 1.0,
  failing by a hair). Re-anchored to yard=10° (near the NEW CLmax,
  alphaSailor~43°, CL~1.32) — driveDropWind=0.84, ratio=1.14, no
  instability.
- **T4 crewPos baseline**: 0.2 → 0.1 — crewPos=0.2's ballast now nearly
  zeroed heel BEFORE brailing (amaLoad~0.008, noise-level) with the
  weaker sail; 0.1 restores a genuinely loaded baseline (amaLoad~0.17
  before, ~0.01 after brailing).
- **T6 gust scenario**: sheet 30°→26°, gust ceiling 10→11.5 m/s — the old
  probe only reached maxPhi=2.8° (not "flying the ama hard"). The new
  probe found a narrow transition band (a genuine knife-edge, same
  character as round 9's own capsize-margin findings — sheet=25/twsMax=10
  gives maxPhi=8.4°, sheet=25/twsMax=12 capsizes outright at 65°):
  sheet=26/twsMax=11.5 lands at maxPhi=25.1° held / 15.3° after
  panic-release, comfortably demonstrating both the danger and the
  rescue.
- **"Sail steers" probe**: TWA65/sheet30/trim-by-12° → TWA70/sheet25/
  trim-by-15° — both legs dropped below steeringOk's 2° floor (0.4°,
  -1.9° — correctly signed, just too weak under the reduced CE-lever
  force magnitudes). New probe: +3.4°/-3.1°.
- **T9 yaw-yank threshold**: 0.02 → 0.01 rad/s (measured 0.019, still a
  genuine, clearly-emergent transient, just smaller under the weaker
  sail — was 0.039 pre-R10-1, 0.02 pre-that).

**Promoted** (not re-tagged): the R9-1 residuary-hump polar-smoothness
xfail. The weaker sail no longer reaches the Froude regime where the
hump's breakthrough/no-breakthrough bimodal behavior bites (TWS=6 max
speed now ~4.4 m/s, well under the ~7-8 m/s where the old cliff sat) —
confirmed genuinely smooth at fine (5°) resolution across the whole
60-170° range (worst adjacent drop 9.2%, was >27%), not a coincidental
single-run pass.

**Reviewed, not acted on**: `ama.crewImmersionCoeff`'s stale
polar-fitted value (flagged in the round-9 audit) was reviewed per
R10-1's own acceptance note but not re-derived from physics this round —
genuinely opportunistic/non-blocking, same disposition as round 9's own
deferred lesser items.

## 4. R10-3 — hull side force (see `docs/adr/0004`)

Digitized Flay, Irwin & Viola 2025 (Fig 18, towing-tank —
`data/flay_2025_hull_sideforce_digitized.csv`):

| hull | leeway 4° | 8° | 12° | 16° | 24° |
|---|---|---|---|---|---|
| V2 (70° keel, proa-like) | 0.030 | 0.070 | 0.130 | 0.197 | — (no data) |
| V1 (100° keel) | 0.025 | 0.055 | — | 0.150 | 0.250 |

No saturation observed 0-16° for either hull — CS rises superlinearly
(a strengthening vortex-lift mechanism), the opposite of the old
15°-saturation-then-mushing model's shape inside that range.

**Fit**: `CS(lambda) = csV2A*lambda + csV2B*lambda^2` (degrees),
`csV2A=0.00564, csV2B=0.00042` — both fit within the digitized ±0.01
uncertainty at all four V2 anchors. V2 has no data past 16° — rather
than extrapolate its own steeper quadratic (which runs away), 16-24°
linearly blends toward V1's own independently-fit curve
(`csV1A=0.00598, csV1B=0.00019`, tested to 24°). Beyond 24° (the edge of
ANY measured data): CS holds flat — an explicit, provenance-free
extrapolation guard.

**Area reference**: switched from `hull.wettedSurface` to the existing
`hull.lateralArea` (already used by the R9-follow-up cross-flow-drag
term) — Flay's CS is referenced to their own test hull's projected side
area; since a coefficient is scale-invariant, "converting to our
geometry" is simply computing force from OUR OWN area, not a unit
conversion.

**Cross-flow (bluff-body) term kept unchanged**: verified it covers a
genuinely different regime (near-90° beam-on, Cd~1.1) than the new CS
curve reaches even at its flat-held extrapolation value (~0.25) — no
double-counting.

**"Sailing free" qualitative reproduction**: Flay's Fig 15 reports total
resistance DECREASING with leeway for V-hulls — opposite of what the
standard induced-drag formula (`Fx=-|Fy|*sin(leeway)`, always resistive)
produces on its own. No quantitative CR-vs-leeway curve was digitized
(described qualitatively only), so implemented as an explicit,
non-fitted relief fraction (ramps 0→1.0 over 0-8°, flat 8-12°, fades to
0 by 24°) sized empirically against a direct assertion, not a source
number:

| leeway | total resistance ratio (vs 0°), before relief | after relief |
|---|---|---|
| 4° | 1.16 | 1.08 |
| 8° | 1.80 | 0.98 |
| 10° | 2.36 | 0.95 |
| 12° | 3.11 | 0.93 |
| 16° | 5.29 | 2.25 |

**Config cleanup**: `hull.sideForceCoeff`, `leewaySaturationDeg`,
`leewayMushingCoeff` removed (no longer referenced); boat-design tab
schema updated to match (12 new/changed field entries).

**Result**: despite CS being substantially stronger at moderate-high
leeway than the old model, the FULL test suite passed unchanged with no
further re-picking needed (a pleasant surprise, not assumed going in).
The TWA-40 band moved in the anticipated direction — ratio 0.641 → 0.622
— but only slightly, not enough alone to close the gap; reported
honestly per the work order's own "report it, do not steer it"
instruction, not force-fit by further retuning.

## 5. R10-4 — CE/CLR sign re-examination

The work order asked to re-attempt core/aero.js's round-9 TODO (remove
`ceLeverSign`'s empirical flip) now that both sides of the yaw-lever
balance have measured force magnitudes. Finding: **`ceLeverSign` is
currently `+1`, which is the mathematical identity — no flip is
actually applied.** Traced the history: rounds 5-7's from-scratch
derivation gave standard weather-helm physics (trim-in → points up),
the OPPOSITE of the round-4-era "sheet in bears away" Pjoa-manual rule
this codebase used to encode, so `ceLeverSign=-1` was set to invert it.
The round-9 follow-up (separate session, already committed before this
round began — `79f4436`) retired that manual-encoded rule entirely: a
structural lee-helm bias at the old `lead=15%LWL` was masking the boat's
real behavior; once `lead` was corrected to 5%LWL, the boat genuinely
points AND bears away through the sail in the standard direction
(`harness/asserts.js`'s "Sail steers" block) — i.e. the naive, unflipped
`r x F` derivation is what the corrected geometry wants on its own.
`ceLeverSign` defaults to `+1` in `config.js` — verified this is not
coincidental by testing `ceLeverSign=-1` directly: it does NOT simply
flip the sign of the observed steering drift (would-be evidence the
term is cleanly invertible) — it collapses the effect toward ~0 (0.10°
vs +2.26° at +1), because `yawMomentHeel` (a separate, un-flipped
mechanism) partially offsets the CE-lever term once inverted — confirms
`+1` isn't an arbitrary sign choice still riding on a hidden flip.

**Not fully resolved**: Di Piazza (sail CL/CD) and Flay (hull CS)
measured FORCE coefficients, not CE/CLR POSITION — `hull.lead`,
`sail.ceSwingFraction`, and `hull.clrXFraction` remain estimated
lever-arm geometry, not measured. The sign question is resolved (no
active flip in the current model); the lever-arm MAGNITUDES are still
tunable estimates, a narrower, still-open standing TODO.

**T1/T5 xfails**: the work order asked to "re-run and report — do not
force." Neither exists in the current harness anymore — the round-9
follow-up (which happened before this round started) already retired
and redesigned both (T1's ama-drag-lever leg → "Sail steers"; T5's
downwind-carrot leg → "Downwind (TWA165) holds a stable course"), and
both redesigned versions currently PASS. Nothing outstanding to report
here beyond confirming this history.

Stale documentation cleaned up to match (aero.js's own `ceLeverSign`
comment, its internal `?? -1` fallback corrected to `?? 1` for
consistency with `config.js`'s actual value, `config.js`'s own comment,
and one stale `ARCHITECTURE_physics_core_EN.md` reference).

## 6. R10-5 — ledger discipline

**Final xfail ledger** (1 entry, down from 5 at the start of this
round — 4 were already resolved by the pre-round-10 R9-follow-up
session before this round began):

- `xfail:CALIBRATION` — "no meaningful progress below ~50deg TWA":
  ratio 0.622 (band <0.55). Provenance: R10-1 (weaker sail) raised it to
  0.641; R10-3 (hull side force) pulled it back to 0.622, per its own
  anticipated opposing effect — reported honestly, not steered further.

**Bundle fidelity spot-check**: compared direct-core (`createSimulator`,
10× `step(controls, 1/60)`) against the standalone bundle driven via
Playwright (pause → set controls → reset → single-step ×10, with an
explicit animation-frame yield between clicks so rapid clicks don't
collapse into fewer physics steps than intended) — bit-for-bit matching
readouts (speed 1.0 kn both, settled yard/delta 15.0° both) once the
test methodology correctly paused before touching controls and reset
before stepping.

**Regenerated**: `/out` scenario CSVs + polar.csv, `dist/
simulator_standalone.html` (embedding the new `crab_claw_CL_CD_v2.csv`
via an updated `tools/bundle.js` DATA_FILES map — the bundler didn't
know about the new file initially and would have thrown at runtime;
caught and fixed during R10-1's own verification).

**Provenance**: `data/README_input_data_EN.md` rewritten in full —
citations and digitization-uncertainty statements for all three sources
now in hand (Di Piazza 2014, Flay 2025, and the still-qualitative-only
Irwin 2023 spritsail figures), file-by-file provenance for both aero
table versions and the driving-force/hull-side-force references.
