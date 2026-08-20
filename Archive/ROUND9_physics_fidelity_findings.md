# Round 9 findings report — physics-fidelity work order execution

Status: all five items (R9-1 through R9-5) attempted; R9-1/R9-2/R9-3/R9-5
implemented and verified; R9-4 implemented but defaulted off (see its
section below). Full test suite: 65/65 assertions pass, 5 known
limitations tracked as `xfail`, no unexpected promotions. Determinism
(R6-1) verified bit-exact throughout.

## 1. R9-1 — slender-hull residuary model (see `docs/adr/0001`)

Replaced `hull.froudeThreshold`/`waveResistanceCoeff`'s `u^4`-above-Fr-0.4
wave wall with a bounded Gaussian residuary hump in `core/hydro.js`
(`hull.residuaryPeakCr=0.006`, `residuaryFrPeak=0.5`, `residuaryFrWidth=0.18`).

**Drag budget** (friction vs. residuary, isolated by zeroing `residuaryPeakCr`):

| u (m/s) | Fr | friction (N) | total (N) | residuary (N) | residuary/friction |
|---|---|---|---|---|---|
| 2.94 | 0.40 | 37.8 | 96.5 | 58.7 | 1.55x |
| 3.50 | 0.48 | 52.1 | 163.2 | 111.1 | 2.13x |
| 4.00 | 0.55 | 66.5 | 205.3 | 138.8 | 2.09x |
| 5.00 | 0.68 | 100.2 | 184.4 | 84.2 | 0.84x |
| 6.00 | 0.82 | 140.1 | 155.1 | 15.0 | 0.11x |
| 7.00 | 0.95 | 186.1 | 186.9 | 0.8 | 0.00x |

Peaks at ~2x friction near the prismatic hump, falls to near-zero by
u≈7 m/s — nowhere close to the old model's 17-160x-friction blowup.

**Whole-round symptom table** (boat/wind speed ratio, TWA 40-170 sweep):

| TWS | max boat speed | ratio |
|---|---|---|
| 4 | 3.10 | 0.77 |
| 6 | 4.62-7.00 (further raised by R9-2/R9-3, see below) | 0.77-1.17 |
| 8 | 8.61 | 1.08 |
| 10 | 10.25 | 1.02 |

Ratio no longer collapses — holds flat to rising, consistent with a real
slender-hull proa. "Head-to-wind stays still" unaffected (0.30-0.40 m/s
throughout; the residuary term is ~0 at u≈0 regardless).

**Genuine new characteristic — hump-speed gear change**: at TWS=6, fine
(2deg) TWA resolution shows a real cliff between TWA=114 (6.65 m/s,
breaks through the hump) and TWA=118 (4.73 m/s, short of it) — confirmed
NOT a grid-search artifact (checked at 2deg steps, not just the coarse
10deg polar grid). This is intentional "semi-planing relief," not a bug;
`harness/asserts.js`'s polar-smoothness check (previously "isolated >20%
drop is a search artifact") is retagged `xfail:CALIBRATION` with this
diagnosis rather than smoothed away.

## 2. R9-2 — undo the sail L/D detune

Reversed round 7 D-5's detune: `sail.camber` 0 -> 0.10 (prompt default),
`sail.CD0` 0.09 -> 0.06 (data-provenance baseline), `sail.s` 1.0 -> 0.80
(partial suction recovery per `data/README_input_data_EN.md`'s own
recommendation).

**L/D at small alpha** (s=0.80, camber=0.10, CD0=0.06):

| alpha | CL | CD | L/D |
|---|---|---|---|
| 10deg | 0.598 | 0.145 | 4.12 |
| 15deg | 0.939 | 0.254 | 3.69 |
| 20deg | 1.281 | 0.415 | 3.09 |

Improved from the full-suction-loss baseline (~3-4 per
`data/README_input_data_EN.md`) but does not reach the work order's
aspirational "~6-8" — swept s down to 0.4 (well outside the suggested
0.75-0.85 band) and only reached L/D~5.7 at 10deg. Reaching 6-8 literally
would need s~0.2, well outside the suggested/physically-motivated range;
kept s at the suggested band's value (0.80) rather than chase the test
threshold, consistent with the standing "direction-strict, magnitude-loose"
philosophy — reported as directionally improved, not fully reached, same
class of outcome as round 7's own D-5 report.

## 3. CALIBRATION band re-derivation (after R9-1+R9-2, before R9-3)

Both old bands were calibrated against the wave-walled hull:

- `no meaningful progress below ~50deg TWA`: old band `ratio < 0.35`.
  Measured post R9-1/R9-2: TWA-40 speed 2.76-2.83, globalMax 6.63-7.00,
  ratio 0.40-0.42. Re-anchored to `< 0.55`, grounded in
  `data/driving_force_vs_AWA.csv`'s own Cdf shape (0.55 at AWA=30, 32% of
  the AWA=90 peak — "no progress" was never meant to read as near-zero).
  **Now passes** (promoted from xfail).
- `speed at TWS=6, TWA=90`: old band `[2.0, 3.6]` m/s. Measured post
  R9-1/R9-2: 4.39-4.63 m/s (ratio 0.73-0.77 vs TWS). Re-anchored to
  `[3.0, 6.5]` m/s, grounded in the same healthy boat/wind ratio found
  across the whole polar. **Now passes** (promoted from xfail).

Both bands were re-verified after R9-3 (ama.formFactor correction, below)
and hold without further adjustment (speed(40)=2.82-2.83, ratio~0.40-0.41;
speed(90)=4.39).

## 4. Other R9-1/R9-2 downstream regressions, diagnosed and re-derived

Four assertions broke as a direct, honest consequence of the much higher
boat speed / much lower drag, none from a new bug:

- **Stop scenario** ("both brails at 100% brings the boat to a near-stop"):
  old criterion `<0.5 m/s within 23s`. Verified the boat never crosses
  0.5 m/s even over a 120s extension — a genuinely slender, low-drag hull
  decays asymptotically (quadratic drag ~1/t), not to a hard stop. Re-derived
  to the directional claim the practitioner sources actually support: speed
  falls to <35% of its ramp-peak, monotonically, within the scenario's own
  window (measured: peak 2.99-3.19 m/s -> final 0.87-0.95 m/s, ratio
  0.29-0.30). Passes.
- **Over/well-trimmed leg** (R8-3's "over-trimmed slower + more heeled, not
  a broach"): originally probed at TWA=90. Post R9-1/R9-2, the "boom as a
  lever" power regime (previously only seen at TWA=50 under the old
  physics) expanded to cover TWA=90 too — confirmed directly: at TWA=90,
  sheet=27deg now sails FASTER than sheet=32deg (6.88 vs 6.19 m/s), same
  lever regime, all the way out to where it capsizes (~sheet<26deg). The
  genuine, gradual "tighter=slower+more heeled" tradeoff moved downwind
  with it — re-found cleanly at TWA=130 (sheet=27 -> 4.07 m/s/1.8deg heel
  vs sheet=32 -> 5.00 m/s/0.4deg heel, monotonic, no capsize risk nearby).
  Moved the probe TWA rather than loosen the assertion's logic. Passes.
- **T4 ama-load** ("windward brail simultaneously lowers ama load"):
  crewPos=0.3 baseline now nearly zeroes heel before brailing (amaLoad
  ~0.01-0.14, noise-level at the tighter end), so before/after could flip
  sign on nothing. Lowered baseline crewPos to 0.2, restoring a genuinely
  loaded reference (amaLoad~0.14-0.24 before, ~0.00-0.05 after). Passes.

## 5. R9-3 — ama form factor + steering (see `docs/adr/0002`)

`ama.formFactor` 3.3 -> 1.2 (mid the physical 1.1-1.4 ITTC/Prohaska range).

**R7-4a drag ratio, swept across the physical range:**

| formFactor | static ratio | max ratio |
|---|---|---|
| 1.1 | 0.086 | 0.267 |
| 1.2 | 0.094 | 0.291 |
| 1.3 | 0.102 | 0.316 |
| 1.4 | 0.109 | 0.340 |

The old bands (`[0.10,0.30]` static / `[0.4,1.0]` max) are NOT satisfiable
anywhere in the physical range — the max-immersion band in particular only
opens up above formFactor~3, confirming it was an artifact of
accommodating the unphysical 3.3, not an independent constraint. Re-derived
to `[0.05,0.15]` / `[0.15,0.45]`, bracketing the physical range with
margin. Passes at formFactor=1.2 (0.094, 0.291).

**T1 (crew toward/away from ama), direct probe at formFactor=1.2:**

```
toAma:   drift = -1.2deg (expected >= +0.5, sign FLIPPED)
awayAma: drift = +1.1deg (expected <= -2, sign FLIPPED)
```

Not just weaker — backwards. Confirms ama-drag was never a legitimate
mechanism for this maneuver; round 7 D-1 already admitted formFactor=3.3
was chosen "specifically to keep T1 signed," not derived. Both legs
retagged `xfail:STEERING` with this diagnosis. If the Pjoa manual's claimed
response is real, it needs a different mechanism (crew weight shifting
trim/heel and its coupling to the sail CE?) and reference data (Irwin,
Flay et al. 2023 — cited by the work order) to resolve properly; not
attempted here, no such data available in this environment.

**CE-lever sign** (`core/aero.js`'s `ceLeverSign`): the work order asked for
a from-scratch derivation removing this empirical flip. Not done — the
naive `xCE*Fy - yCE*Fx` gives standard weather/lee-helm physics, opposite
the Pjoa manual's documented practice, and distinguishing "this model's
geometry has a sign bug" from "a real Pjoa's CE/CLR balance genuinely
works backwards from a standard yacht's for reasons this model doesn't
capture" needs the same reference data T1 does. Left as an explicit,
documented TODO in `core/aero.js` rather than declared resolved.

**T5** (windward brail lowers rudder workload downwind, the "carrot"):
swept TWS (6/8/10/12), TWA (150/165/175), and crewPos (-0.3/0/0.2) —
every combination gives a baseline mean|rudder| of 0.0002-0.0046
(effectively zero corrective effort), too small and inconsistently signed
to demonstrate a real effect (crewPos=-0.3 additionally capsizes, unusable).
The yaw-hunting instability this test measured against has become
noise-level now that the ama-drag/CE-lever terms it compensated for are
physically scaled. Retagged `xfail:STEERING`.

**T2/T3/T4** (which don't depend on ama-drag authority) remain correctly
signed and in-band throughout — T3 drift -7.1 to -8.7deg (trimmed) / +6.0
to +6.1deg (eased), T4 drift -10.1 to -12.8deg, all within the 2-20deg
steeringOk band.

## 6. R9-4 — vertical lift (implemented, defaulted OFF)

Added `sail.verticalLiftFraction` and wired it into `aero.js`'s
`heelMoment = Fy * CEheight * (1 - verticalLiftFraction) * (1 - 0.9*brailWind)`.

Tested the work order's suggested ~0.15-0.25 default against the three
established capsize-safety scenarios:

| verticalLiftFraction | aback scenario | T6 held-sheet gust (maxPhi) |
|---|---|---|
| 0 (baseline) | capsizes (phi=-11.5 to -106.8, timer-driven) | capsizes, maxPhi=65.0deg |
| 0.01 | — | does NOT capsize, maxPhi=34.5deg |
| 0.05 | capsizes (phi=-139.9, still works) | does NOT capsize, maxPhi=25.2deg |
| 0.08 | does NOT capsize (phi=-0.2) | — |
| 0.15 | does NOT capsize (phi=-0.1) | does NOT capsize, maxPhi=23-29deg |

T6 in particular flips from a clean capsize to none at
`verticalLiftFraction=0.01` — a genuine knife-edge, not a gradual trend.
`rollDampingCoeff` (R9-5) was ruled out as a contributing factor (tested
independently: aback still capsizes at rollDampingCoeff=1100 with
verticalLiftFraction=0). This is a direct, sharp consequence of R9-1/R9-2/
R9-3 already having raised sail power/drive substantially — these specific
scenarios (T6's gust, the aback scenario) now sit on a knife-edge between
capsize and recovery even before R9-4, such that literally any heel
reduction tips them.

Per the work order's own framing (R9-4 is "secondary; contested in
literature; keep conservative," and its own acceptance text allows
"tunable to zero to recover current behavior"), defaulted
`verticalLiftFraction` to 0 — the mechanism is implemented and available,
but inactive. Enabling it meaningfully would require a fresh capsize-margin
recalibration of T6/T10/the aback scenario (re-deriving gust/trim
severity against the new, higher-power baseline), which is outside this
round's scope. Deferred, not abandoned.

## 7. R9-5 — roll damping bump

`stability.rollDampingCoeff` 900 -> 1100 (independent of R9-4, verified
separately). Implied damping ratio zeta ~0.152 -> ~0.186 (using round 7's
own cross-check method: zeta = c / (2*sqrt(k*I)), same I_roll/stiffness),
moving toward the zeta~0.2-0.4 cited for beamy multihull forms. Direct
probe: an 8deg roll step at zero wind settles (near |phi|<0.03deg) within
~15s with ~6 zero-crossings (period ~2.5s, consistent with the prior
~2.6s), confirming the bump doesn't destabilize the roll response.

## 8. Final verification

Full suite: 65/65 assertions pass. Five `xfail`s, all correctly diagnosed
and none unexpectedly promoted:

- `xfail:CALIBRATION` — polar smoothness (R9-1's genuine hump cliff)
- `xfail:STEERING` x2 — T1 toward/away-ama (R9-3's formFactor correction)
- `xfail:STEERING` — T5 (R9-3, noise-level downwind carrot)
- `xfail:STEERING` — R7-4b replay fixture (unchanged from round 8, still a
  genuine yaw-rate symptom of the bounded flying-equilibrium oscillation)

Determinism (R6-1): bit-identical across a repeated run, 6001 steps
matched.

## 9. R9-5 lesser items (not attempted)

Ama wave drag/hull-ama interference and the lumped `hull.sideForceCoeff`
split (both R9-5 "opportunistic, not round-blocking" items) were not
attempted — noted as known simplifications, per the work order's own
framing, not a gap introduced by this round.
