# Findings: execution of work-order-2026-07-30-physics-audit.md

Date: 2026-07-30

Executes the audit in the order the work order recommends. This is a staged
program, not a single pass; this document records what is **done and
verified** and what is **deferred**, with the reason for each boundary.

All numbers below are measured, from the repro blocks in the work order or
their direct extensions.

## Done

### F2 — symmetric angular capsize (core/stability.js)

`updateAback()` had an angular capsize threshold only for `phi >= +65deg`;
the pressed side (`phi <= -65deg`) relied solely on the 6 s aback timer, so a
pressed-side runaway ran to a full **-360deg barrel roll** before the
integrator's `isPhysicallyPlausible()` guard caught it — a real capsize
misreported as an arithmetic failure.

Fix: the threshold is applied to `|phi|`. The aback timer is unchanged (it is
the earlier, nautical 6 s mechanism, deliberately distinct from the
point-of-no-return angle).

- Repro before: capsize at t=5.47 s, phi=-359.7deg.
- After: capsize at t=1.58 s, phi=-65deg.
- Acceptance met: max `|phi|` across all `harness/scenarios.js` scenarios is
  **65.2deg** (scenarioAback / scenarioThroughGybeAback), <= 90deg;
  `isPhysicallyPlausible()` is no longer an exit path. Suite: 76/76 fast.

No polar impact (the polar sails forward, never reaches the pressed-side
capsize angle) — verified byte-identical.

### F1 — ama immersion sign fix in the flying regime (core/hydro.js, core/integrator.js)

`amaDrag()` took the **unsigned** `amaLoad`, whose two branches both grow
with `|phi|`, so a **flying** ama (phi>0, clear of the water) reported the
same "fully immersed" drag as a pressed one — maximum ama drag in the one
configuration where the float isn't touching the water. The `crewImmersion`
term shared the fault (crew standing on a flying ama immersed nothing).

Fix: `amaDrag()` now takes `phi` and derives immersion with sign — resting at
`phi~0`, growing to full by `phiSubmergeDeg` for `phi<0`, fading to zero
wetted area by `phiLiftoffDeg` for `phi>0`. `crewImmersion` removed (the
crew/ama-buoyancy coupling returns, correctly, in F14). Signature change
rippled to `computeForces()` and five assertion call sites.

- Repro: Fx grows on the pressed side (13.2 N at phi<=-10deg), rests at 3.1 N
  (phi=0), fades to 0 by phi=+12deg.
- Acceptance: `|Fx|` non-decreasing with `|phi|` on the pressed side,
  non-increasing while flying, `<=` resting value past liftoff. New
  assertion added: total resistance with the ama flying (phi=+14deg) is below
  the resting value (14.47 N < 15.45 N).
- R7-4a bands **held** without recalibration (static ratio 0.09 -> 0.067,
  still in [0.05,0.15]; max ratio 0.291 in [0.15,0.45]); R15 ama-drag 4.218 N
  in [4.0,4.45]. Comments updated (amaLoad -> phi; "max immersion" is now
  phi<0, not large `|phi|`).

**Polar [moved, committed]:** reach speeds rose where the ama flies —
TWS10 TWA100 9.7588 -> 10.0670 m/s (+3.1%), TWA80/90/110 similarly; 42 of 42
rows changed. This is the intended effect (less parasitic drag when the float
is clear). Regenerated `out/polar.csv` verified byte-deterministic on a clean
rebuild and committed with the change.

**Two assertions re-anchored, both consequences of F1, both documented in place:**

1. `R15: reach speed TWA100/TWS10` band 9.70-9.78 -> **10.03-10.11** m/s. This
   is the sensitivity tripwire from the 2026-07-22 work order; F1 is an
   intended change, so the band tracks it and stays just as narrow for the
   next unintended shift.
2. `Sail steers: trimming the sheet in points up`: its TWS6/crew0.3 trim-in
   leg fell 3.0 -> 1.5deg, under `steeringOk`'s 2deg floor. **Diagnosis:
   ~half of that drift had been ama-drag yaw, not sail steering** — exactly
   the (now-corrected) flying-ama drag. Re-anchored the leg to a powered,
   ballasted trim (TWS8, crewPos 0.6) where genuine sail-trim weather helm
   dominates and clears the floor with margin (6.0deg, no capsize). The
   brailed leg keeps the shared base, unaffected (-3.1deg). This makes the
   check measure what it claims (sail steering), so it is a strengthening,
   not a mask. Same "re-pick the probe, not the physics" approach rounds
   10/10d used.

Full suite after F1: **85/85**.

### F5 — camber CD ratio transform (core/aero.js) [block B]

Round 10d's C-C fix made the CL camber bonus a ratio relative to the v2
table's built-in camber but left the CD bonus in the old absolute
"relative-to-flat-plate" form (`1 + 1.0*camberEff`), double-counting the
camber the v2 table already carries. New `camberCDDelta` applies the same
ratio transform.

- v1 CD bit-identical (ratio with builtin=0 reduces to the old `1+delta`);
  v2 with camberDelta=0 identical (the brailWind=0 reach anchor); v2 at
  brailWind=0.6 the CD multiplier drops 1.450 -> 1.409.
- Peak no-brail L/D unchanged (5.30 @ 13deg — brailWind=0 is an exact
  identity, so the calibration anchor is untouched).
- Polar moves only on brail>0 (downwind) rows, re-optimised and regenerated.
  Suite 85/85.

### F3(a) — CD no longer collapses at alpha=90deg (core/aero.js) [block B]

The induced term `s*CL*tan(alpha)` collapsed at alpha=90 because the table
forces `CL(90)=0` exactly, so the broadside maximum-drag attitude reported
parasitic drag only (0.04). Evaluated at `min(alpha,89deg)` where the finite
limit (~1.03) already lives: CD holds ~1.073 through 90deg. Only alpha in
(89,90] changes; the peak-L/D anchor is untouched and the polar is
byte-identical (the grid never lands there). Suite 85/85.

F3(b) (the dead CD column in the CSV, and the cross-check that validates a
CD value no runtime path reads) is a data-contract decision for its own ADR,
deferred with F7's CD-form work.

F5 and F3(a) were the cleanly-separable block-B items. The rest (F6, F7, F4)
is a single coupled recalibration and a design decision — see below.

### Block B proper — F7 + F4 + F6 (+F3b), one model change [docs/adr/0007]

Done as one commit because the three findings are one problem: induced drag
was driven by the table CL, the reference area ignored the brails, and the
camber bonus was unbounded. Maintainer chose the **aggressive** area variant.

**What changed.** `CD = CD0 + inducedK*CL_working^2 + CDbroadside*sin^4(alpha)
+ brailParasiticCD*max(brails) + flogging`, and the brails now act through an
effective AREA (`areaAtTrimBrail = 0.55`, `areaAtFullBrail = 0.20`,
`areaAtFullLeeBrail = 0.35`) instead of opaque CL multipliers.
`brailCamberGain` 0.45 -> 0.10 with a validator on the total camber. `sail.s`
deleted (no remaining reader); `camberCDf` from F5 subsumed.

**Two corrections to my own earlier analysis, both from measurement:**

1. I previously reported that the work order's suggested `CD0 + s*CL^2/k`
   "does not preserve the anchor". **That was wrong** — it was based on a
   guessed `k`. Derived analytically (`k = (1/(2*L/Dmax))^2 / CD0`) it hits
   the anchor exactly (5.298 @ 13deg). The real objection is different: the
   quadratic form alone *re-introduces* the F3(a) collapse from the other
   side, because at alpha=90 CL=0, so induced drag vanishes and CD returns to
   CD0. A separation term is required, not optional.
2. Fitting to Di Piazza's four measured `(CL,CD)` pairs **alone
   under-constrains the model**: their lowest point is at alpha ~20.5, so
   alpha<20 is unconstrained and the best fit runs peak L/D to **7.6** while
   still matching all four pairs. The reported `L/D_max ~ 5.4` has to enter
   the fit as a fifth constraint. With it: `CD0=0.0375, inducedK=0.215,
   CDbroadside=1.06`, residuals +0.029/+0.036/-0.021/+0.010 against the four
   pairs — inside the +-0.05 digitisation uncertainty the source CSV states.

**Acceptance, all measured:**

| criterion | result |
|---|---|
| total aero force non-increasing in brailWind and brailLee | **yes** (was +41% at bw=0.6) |
| L/D non-increasing in both brails | **yes** (was rising in TRIM and again past 0.8) |
| no-brail peak L/D within +-2% of anchor | 5.401 @ 12deg vs 5.298 @ 13 = **+1.94%** |
| CD monotonic in alpha, CD(90) >= 1.0 | monotonic for alpha>=8; **CD(90)=1.098** |
| validateConfig rejects total camber > 0.20 | **yes**; default config valid |

(The only non-monotonic stretch, alpha in [0,2], is the pre-existing
luffing-flogging ramp.)

**A regression this surfaced, worth recording.** F6's ceiling, applied
literally, made **archived recordings unloadable**: the 2026-07-16 fixture
carries `sail.camber = 0.10` under *pre-v2* semantics (absolute camber against
a flat table), which on today's v2 table is a delta on top of its built-in
0.10 — total 0.30, rejected. This would have hit `harness/replay.js` too, not
just the test. Fixed with `configFromRecordingSnapshot()` in `core/config.js`,
used by both, which migrates the stale field forward rather than weakening the
ceiling.

**Three assertions re-anchored, each with its reason:**

1. `R15 TWA100/TWS10`: 10.03-10.11 -> **9.58-9.66**. Intended (block B removes
   the free power); band kept equally narrow.
2. `Sail steers: windward brail bears away`: -0.5deg on the old TWS6 base,
   under the 2deg floor. Direction still correct at every trim tried; only
   magnitude fell, because that leg's yaw moment scales with rig force and
   block B cut it deliberately. Re-anchored to TWS10 with a 20s window (was
   10s) — the mechanism now develops more slowly. Measured **-5.6deg**.
3. `no meaningful progress below ~50deg TWA`: **re-tagged
   `xfail:CALIBRATION`, not retuned.** Ratio 0.557 vs the 0.55 ceiling, and
   the move is entirely in the denominator — globalMax at TWS6 fell 5.61 ->
   4.86 while speed(40) held (2.76 -> 2.71; a beat uses no brail). This is a
   spec acceptance threshold, so per the work order's own rule it is reported,
   not calibrated away.

### F14 — crew ballast derived from the real buoyancy balance (core/hydro.js)

The crew's effect on ama immersion was `crewPos * crewImmersionCoeff *
(crew.mass / ama.maxBuoyancy)` with `crewImmersionCoeff = 0.30` — exactly 1/3
of the physical effect, and a coefficient whose own config comment admitted it
had been raised from 0.21 to keep a polar acceptance ratio in band. (F1 had
already removed the term, since it applied to a *flying* ama too; F14 is where
it comes back, correctly.)

Now derived: taking moments about the hull centreline, a crew at `crewPos`
puts `crewPos * crew.mass` on the float, so the extra immersion is that over
`ama.maxBuoyancy`. `crewImmersionCoeff` is deleted.

- crewPos 0.35 -> 31.5 kg on the float = 0.39 of its buoyancy (was 0.13).
- **crewPos >= 0.889 = `maxBuoyancy / crew.mass` -> fully submerged**, which is
  F14's acceptance. crewPos 1.0 = 90 kg on 80 kgf: it sinks, as it should.
- `crew.posMax` deliberately left at 1.0 — the work order's "either restrict
  the position or let the model punish it, not both"; the model now punishes
  it correctly.
- Bonus: `restingImmersion = 0.30` turns out to be `ama.mass /
  ama.maxBuoyancy = 25/80 = 0.31`, so it is now derived rather than a literal.

R7-4a's static band re-derived across the same physical formFactor range round
9 used (1.1-1.4): static ratio span 0.145-0.185, band [0.05,0.15] ->
**[0.10,0.22]**, bracketing the span rather than the single configured value.
Max-immersion band and the ama-drag absolute band are unchanged.

**Did the close-hauled optimum leave crewPos = 1.0?** (F14's own acceptance
question.) Measured at TWA 40:

- **TWS 6: yes — the optimum is now crewPos 0.3**, and 1.0 is not chosen at
  all, so the "cost" of losing it is 0.00 %. This is the configuration whose
  attractiveness the old `crewImmersionCoeff = 0.30` comment admitted it had
  been tuned around.
- TWS 10: still 1.0, but its margin over crewPos 0.3 is only 3.77 % — in more
  wind the extra righting moment is worth more than the immersion penalty,
  which is the physically expected trade.

The reach-speed tripwire (R15, TWA 100 / TWS 10) fired again at 9.198 and was
re-anchored to [9.16, 9.24] — its third re-anchor this audit, each one an
intended change it correctly flagged.

### F16 — the deep-course sheet jitter: hypothesis tested and REJECTED

The work order proposed that `bestSheetAngle`'s jumping at TWA 160 is
multimodality around `deltaAlign`'s discontinuity at AWA = 0, and that the fix
is hysteresis on the regime a <-> c transition. **Measurement does not support
that**, so no hysteresis was added.

- **(a) No bistability.** Driving TWA 160 for 400 s from two different initial
  yard angles (delta = 0 and delta = sheet), at sheets 12/24/40/56/84, at
  TWS 4/6/10: identical settled speed and yard angle **to three decimals**,
  heading error 0. The settle has one attractor.
- **The discontinuity is real but not reached.** `deltaAlign` does flip
  +179.8 -> -179.8 as AWA crosses 0 (clamping 60 deg -> 0 deg), but a boat at
  TWA 160 never gets there.
- **The actual cause is a bimodal objective.** At TWA 160 the speed-vs-sheet
  curve has two nearly equal maxima at opposite ends of the range with a
  trough between: TWS 10 gives 5.850 m/s at sheet 12, 4.385 at sheet 56, 5.807
  at sheet 84 — the two peaks within 0.7 %. Any small model change flips which
  one wins. Physically a very deep course is drag-driven either sheeted hard in
  or eased right out; edge-on in the middle is the bad case.

`README.md`'s claim that this is "a flat downwind optimum ... the speed curve
itself is smooth there" was wrong on both counts and is corrected in place, per
F16's own acceptance.

Also recorded here because it is a visible consequence of block B: the deep
polar rows now choose **`bestBrailWind = 0`**, where every row from TWA 140 up
previously sat at 0.6. The carrot stopped being the optimal deep-course trim
the moment it stopped adding free power — which is exactly the effect F4
predicted, arriving as a change in what the optimiser chooses rather than as a
tuning decision.

### Block D — F13, F11, F12 (heel balance)

Done after the margin recalibration confirmed it was safe to proceed.

**F13** — `rollRestoreMoment()`'s ama lever was constant `ama.spacing` while
`crewRollMoment()` right below it carried `cos(phi)`, from the same geometric
argument. Two terms of the same balance disagreed; at 50 deg the ama's arm was
overstated by 1/cos(50) = 56 %. Now both project.

**F11** — the model applied ONE `cos(phi)` and used the result as both the
horizontal side force and the heeling force. Split properly: the in-plane
transverse force gets a second `cos(phi)` to become horizontal `Fy`,
`sin(phi)` to become vertical `Fz`, and the heeling moment is taken from the
in-plane force. Verified against F11's own acceptance:

| phi | Fy/Fy(0) | cos^2 | M/M(0) | cos |
|---|---|---|---|---|
| 20 | 0.883 | 0.883 | 0.940 | 0.940 |
| 30 | 0.750 | 0.750 | 0.866 | 0.866 |
| 40 | 0.587 | 0.587 | 0.766 | 0.766 |

`Fz` is exposed through `forcesBreakdown().sail.Fz` but **not** integrated —
there is no heave DOF. Measured ~8 % of displacement at 40 deg heel (the audit
predicted ~16 %, against the pre-block-B sail that made roughly twice the
force). Both this and F13's pressed-side stiffness are now listed in README's
"Known simplifications" as an open vertical balance, rather than being absent.

**F12** — the heeling couple's arm is `CEheight + clrDepth` (2.00 + 0.35 =
+18 %), with `clrDepth` a new band estimate documented like `lateralArea`. The
work order's alternative formulation (explicit heel moments from `hullSide.Fy`
and `rudder.Fy`) is deliberately **not** taken yet: the rudder still makes
~2.2 kN at 6 kn (F9, open), so coupling it into roll now would inject a heel
moment comparable to the ama's entire righting capacity — a spurious effect
driven by a known bug. Revisit after F9.

**Prediction scorecard** (from `docs/capsize-margins-2026-07-30.md`): I
predicted two failures — the trim-in steering leg and C-A's drift rate. One
hit (trim-in), one miss (C-A passed), and one not predicted: **R15 moved UP**,
9.20 -> 9.46, because F11's second `cos(phi)` cuts horizontal side force, hence
leeway and induced drag, so the boat reaches faster. The heel-arm-scaling proxy
could not show that, since it only perturbs the moment. Recorded because a
margin sweep that only models one channel will systematically miss effects in
the others.

### The trim-in steering assertion: stopped re-picking it

Block D broke `Sail steers: trimming the sheet in points up` for the third
time. Before re-picking the probe a third time, I swept the claim across
operating points (TWA 50/60/70/80 x TWS 6/8 x crewPos 0.3/0.6, trim-in
28 -> 8 deg) — and measured it on the **committed pre-block-D model** too:

| model | weather helm | lee helm | capsized |
|---|---|---|---|
| pre-block-D | 3 | 9 | 4 |
| post-block-D | 4 | 6 | 6 |

**The claim does not hold generally, and did not before block D either.** The
sign flips systematically with crew position (crewPos 0.6 at TWS 6 gives lee
helm at every TWA tried). The three green results this check produced since
round 10 came from a hand-picked operating point, re-picked each time the model
moved — a test calibrated to the answer it was expected to give, which is the
exact pathology this audit exists to find.

So it is no longer a single-point check: it now measures the aggregate across
those 16 points and is tagged **`xfail:STEERING`**, reporting
`weather=4 lee=6 capsized=6`. The windward-brail leg (a different mechanism)
still passes on its own merits at -6.4 deg.

This is the audit's own thesis applied to a test that had been passing: a green
result is not evidence unless the thing it measures is robust.

### Block F — documentation-only items

Comment/CSV mismatches (the comments are the model's primary documentation):

- `config.js`: `hull.beam` comment 0.55 -> 0.45 m; `hull.displacement` 250 ->
  190 kg; `I_roll` derivation `250*1.0^2` -> `190*1.0^2` (actual
  displacement); "slender L/B=10:1" -> "~12:1" (5.5/0.45).
- `hydro.js`: same "L/B=10:1" -> "~12:1".
- `aero.js`: `blendApexCL()` gained a note that it interpolates between the
  extreme apex keys only (a trap if a third column is added); and a note on
  the **zero-lift-incidence offset** — the v2 table's alpha is measured from
  zero-lift, the model feeds it geometric alpha, a few-degrees systematic
  offset (documented, not corrected — a fix moves the whole polar).

The **code-behavior** items in block F (`Math.sign` -> `v*|v|` smoothing,
`leewayRaw` using `|u|` after a shunt, `outboardRelief` hardcoded 0.3) are
deferred to ride with a polar-moving commit, since each perturbs forces.

## Deferred (with the work order's own reasons)

In recommended order:

- ~~**Rest of block B — F6, F7, F4 (+ F3b)**~~ — **DONE**, see above. The
  analysis that led to it is kept below for the record:
    - F4: total aero force RISES +41% as brailWind goes 0 -> 0.6 (reefing
      adds power) because the reference area is fixed and the camber bonus
      inflates CL. Fixing it needs an effective area `areaEff(brail)` — its
      shape (how much area a partial carrot actually gathers) is the design
      call.
    - F6: `brailCamberGain=0.45` drives camberEff to ~0.55, ~4x outside the
      `1+1.75c` fit range. The work order's acceptance (validateConfig
      rejects sum>0.20) forces `brailCamberGain` down to ~0.10 — a large cut
      to the downwind camber bonus, entangled with F4.
    - F7: the work order suggests `CD0 + s*CL^2/k`, but MEASURED that form
      moves the peak L/D off the anchor (peak shifts to CL~0.47/~alpha10 and
      rises to ~5.84 vs the 5.29@13-14 anchor). An anchor-preserving
      alternative exists — keep the suction-loss `s*CL*tan(alpha)` but drive
      it from the WORKING CL (identical at no brail, so the anchor is exact;
      induced then tracks the brail-cut CL). This satisfies F7's real intent
      without the anchor conflict.
  Together these three make reefing reduce power monotonically — the correct
  physics — which will SLOW the downwind polar and re-anchor the deep-course
  acceptance bands (C ratio, D4, and the `bestBrailWind=0.6` optimum every
  deep row currently sits on). That downwind re-anchoring, plus F4's
  area-model shape, is a design decision the maintainer should weigh in on,
  not something to bake in autonomously. Recommended path recorded above;
  awaiting a direction on how much downwind power the effective-area model
  should retain.
  F3(b) (dead CD column / data contract) is a separate decision needing its
  own ADR, naturally done with F7's CD-form change.
- **F14, F16** — after F1, both small, both move the polar.
- ~~**Capsize-margin recalibration**~~ — **DONE**, see
  `docs/capsize-margins-2026-07-30.md`. Measured on the post-block-B model by
  scaling the heel arm (what F12 will do) x1.00-x1.30. Outcome, briefly: the
  capsize margins are **robust** — T6's panic-release legs hold flat at
  15-16 deg phi across the whole range, and no capsize assertion fails at
  +15/20/25 %. The audit's expectation that block D needs the margins widened
  first does not reproduce on this model, most likely because block B removed
  the sail power that used to hold it against those thresholds.
  What the sweep *did* find is an **observability** defect: T6's held-sheet leg
  flips survive -> capsize between CEheight 2.08 and 2.10 (a 4-5 % knife edge),
  and check A passes on both sides, so the crossing was silent. Fixed by
  reporting the outcome and the measured boundary in the detail, without
  asserting the fragile quantity. Two probes that block D *will* break are
  identified in advance with numbers (the trim-in steering leg capsizes; C-A's
  drift rate goes 21.8-23.1 vs its 20 bound).
- **Block D (F11 cosPhi split + Fz, F12 heel arm, F13 ama-arm cosPhi/heave)**
  — after recalibration.
- **F9, F10, F8** — rudder drag/stall, yaw-damping decomposition, added mass
  + Munck moment, in that order (F8 last: it invalidates the inertia the
  other two are measured against).
- **F15** — windage / shunt force fade. Own ADR (scope change).

ADRs still owed: F3(b) (data contract), F13(heave) and F15 (model scope).

## Note on the pattern section G warns about

F1 already demonstrated it: correcting one real error (flying-ama drag)
pushed a steering probe below its significance floor because that probe
leaned on the error. The re-pick was clean here, but it confirms the audit's
thesis — several assertions sit close enough to their thresholds that a
correct physics change trips them. Block D will hit this far harder, which is
why its recalibration is scheduled as a prerequisite, not a fix-up.
