# ROUND 9 — physics-fidelity work order: make it sail like a proa

*Last reviewed: 2026-07-17*

## Purpose

Rounds 1–8 produced a deterministic, well-tested core whose *software* is
sound but whose *hull and sail calibration* makes the boat behave like a
heavy displacement monohull pinned at hull speed, not a light slender
apparent-wind multihull. This work order lists the changes needed to close
that gap, in priority order, each grounded in the literature the project
already cites (Marchaj, *Sail Performance* 1996; Di Piazza et al. 2014;
Flay slender-canoe-hull work; Dierking, *Building Outrigger Sailing
Canoes*; Polhamus, NASA TN D-3767).

**Read first:** `ROUND7_steering_regression_findings.md` §4 and §8 —
they independently diagnosed R9‑1 and R9‑3 and scoped them out for lack
of authorization/reference data. This document authorizes them.

### The core symptom (the thing every change is judged against)

Polar top speed barely responds to wind, and the boat/wind speed ratio
*collapses* as wind builds:

| True wind | Max boat speed (current polar) | Boat/wind ratio |
|---|---|---|
| 4 m/s (7.8 kn) | 3.43 m/s (6.7 kn) | 0.86 |
| 6 m/s (11.7 kn) | 3.67 m/s (7.1 kn) | 0.61 |
| 10 m/s (19.4 kn) | 3.99 m/s (7.8 kn) | 0.40 |

A real proa holds or *increases* its speed ratio in more wind and can
sail faster than the true wind on a reach. **Done, at the whole-round
level, means: this table's ratio stops collapsing and top speed scales
with wind.**

---

## R9-1 — Replace the wave-resistance wall with a slender-hull residuary model *(highest leverage — do first)*

**Files:** `core/hydro.js` (`hullResistance`), `core/config.js`
(`hull.froudeThreshold`, `hull.waveResistanceCoeff`, possibly new keys).

### What's wrong

`core/hydro.js:28-33` adds
`wavePenalty = waveResistanceCoeff · (u − 0.4·√(gL))⁴` with
`waveResistanceCoeff = 900`. Measured drag budget (probe against the live
core):

```
u=2.94 m/s (Fr 0.40):  total   38 N   (all friction)
u=3.50 m/s (Fr 0.48):  wave    90 N
u=4.00 m/s (Fr 0.54):  wave  1144 N   (17× friction)
u=5.00 m/s (Fr 0.68):  wave 16265 N   (160× friction)
```

Max available sail drive at 8 m/s apparent is ~890 N, so the boat hits an
impassable wall at ~3.5–4.0 m/s regardless of sail power.

**Why it's unphysical:** Fr ≈ 0.4 "hull speed" is a *displacement
monohull* concept (L/B ≈ 3–4). This hull is slender — L/B = 5.5/0.55 =
**10:1**. Slender canoe hulls make little wave and have no hard speed
wall; they semi-plane through Fr 0.5–1.0 routinely (Dierking; the reason
Pacific "flying proas" were historically the fastest sailing craft). The
u⁴-above-Fr-0.4 form was the original prompt's "simple penalty" placeholder
— it is the penalty for the wrong vessel class.

### Governing physical constraint (the real fix)

Express wave/residuary resistance in the **same nondimensional form as
friction** and bound its coefficient to the same order as `Cf`:

```
R_residuary = 0.5 · rho_w · wettedSurface · Cr(Fr) · u²
```

where `Cr(Fr)` is a dimensionless residuary coefficient that is ~0 below
Fr ≈ 0.35, rises to a **modest peak comparable to Cf** (Cf here is
~0.003; a slender hull's residuary coefficient peaks at O(Cf)–O(3·Cf),
not 100–500×) around the main prismatic hump (Fr ≈ 0.5), and does **not**
grow without bound. The current model's defect in one line: wave
resistance reaching 100–500× friction is impossible for this hull form.

Suggested starting curve (calibrate against the acceptance bands below —
these are starting points, not final values, per the project's standing
"direction-strict, magnitude-loose" calibration philosophy):

- `froudeThreshold`: 0.40 → **~0.35** (residuary onset), but the curve
  must stay gentle well past it.
- Replace the `over⁴` power law with a bounded hump. A pragmatic form:
  `Cr(Fr) = crPeak · exp(−((Fr − FrPeak)/FrWidth)²)` with
  `crPeak ≈ 0.006`, `FrPeak ≈ 0.5`, `FrWidth ≈ 0.18` — a Gaussian hump
  that rises, peaks near the prismatic hump, and *falls away* at high Fr
  (semi-planing relief), never exceeding a few × friction.
- Delete `waveResistanceCoeff = 900` and the `over⁴` term; add
  `hull.residuaryPeakCr`, `hull.residuaryFrPeak`, `hull.residuaryFrWidth`
  (or equivalent) to config with the values above.

Keep `hullResistance` returning `-sign(u)·(friction + residuary)` — only
the residuary term's shape changes.

### Acceptance

- Whole-round symptom table (above): at TWS 10 the boat reaches clearly
  more than at TWS 6 (target **≥ ~5 m/s** vs the current 3.99), and the
  boat/wind ratio does **not** fall below the TWS-4 ratio as wind builds.
- On a beam/broad reach in fresh wind the boat can exceed hull speed
  (Fr > 0.4) and approach or exceed true wind speed at TWS ≥ 8.
- Head-to-wind still stays essentially still (existing
  "head-to-wind stays still" assertion, speed < 0.5 m/s) — the residuary
  term is zero there anyway, so this should be unaffected; verify.
- **Re-derive the two `xfail:CALIBRATION` polar bands.** The current
  `speed at TWS=6, TWA=90 within [2.0, 3.6]` band was set against the
  *walled* hull and is almost certainly too low once the wall is gone —
  do not treat "TWA-90 speed went up" as a regression. Re-anchor both
  bands to the polar **shape** in `data/driving_force_vs_AWA.csv` (Cdf
  peaking ~1.7 at AWA 90, no progress below ~50° TWA) and to realistic
  absolute speeds for a 5.5 m / 250 kg / 12 m² proa, and record the new
  bands as an explicit human decision (see "Process").

---

## R9-2 — Undo the sail L/D detune once the hull is fixed *(cheap; do with R9-1)*

**File:** `core/config.js` (`sail.s`, `sail.camber`, `sail.CD0`).

### What's wrong

Round 7 D-5 pushed `s: 0.85 → 1.0` (full leading-edge suction loss),
`camber: 0.10 → 0`, `CD0: 0.06 → 0.09` — **worsening** upwind L/D — to
drag the TWA-90 polar speed under its acceptance band. But TWA-90 speed is
hull-wall-limited (R9-1), not sail-limited (Round 7 §8 confirmed: even
`CD0 = 0.20` barely moves it). So the sail was detuned to fix a symptom
whose cause is the hull. The project's own `data/README_input_data_EN.md`
notes the full-suction-loss model *"underestimates L/D at small angles of
attack (gives ~3–4, while practice indicates up to ~8),"* and names the
fix: a partial suction factor `s < 1`.

### Change (apply AFTER R9-1 so the two aren't tuned against each other)

- `sail.s`: 1.0 → **~0.75–0.85** (partial suction recovery, the README's
  own recommendation; restores low-α L/D toward the practical ~6–8).
- `sail.camber`: 0 → **~0.10** (the prompt's default; a real crab claw is
  cambered, and camber raises close-hauled CL ~35% per the cited
  practitioner reports).
- `sail.CD0`: 0.09 → back toward **0.06** (the data-provenance value);
  the 0.09 was part of the same detune. Mind the coupling noted in Round 7
  §8: CD0 also scales the flogging-drag term and near head-to-wind
  resolves partly as thrust — keep the "head-to-wind stays still" test
  passing.

### Acceptance

- Sail L/D at small α (10–20°) rises to ~6–8 (add a harness readout/probe
  if useful; the raw table already carries `L_over_D`).
- `no meaningful progress below ~50° TWA` (`xfail:CALIBRATION`) improves —
  with a physical hull and restored L/D the boat should make genuine
  upwind progress and point to ~45–55° (Di Piazza 2014; practitioner
  reports). Re-evaluate whether this xfail can be **promoted to a pass**.
- Aero integrity cross-check (`config.js` `crossCheckAeroTable`) still
  passes — `s`/`camber`/`CD0` are runtime knobs and don't touch the
  shipped table, so this should be untouched; verify.

---

## R9-3 — Ground the ama-drag form factor and put steering on a physical CE/CLR balance *(largest, riskiest — may need reference data)*

**Files:** `core/config.js` (`ama.formFactor`, `hull.ceLeverSign`,
`hull.yawHeelSign`, `hull.crewTrimSign`, `hull.lead`,
`sail.ceSwingFraction`), `core/aero.js` (`sailForces` CE geometry),
`core/hydro.js` (`amaDrag`, `clrXPosition`).

### What's wrong

Round 7 §4 states it directly: *"every channel actually grounded in the
boat's real geometry is roughly an order of magnitude too weak to overcome
the CE-lever term… Round 5's T3/T4 never really validated the CE-lever's
own direction."* Two concrete symptoms:

1. **`ama.formFactor = 3.3`** (`config.js:235`) is 2–3× the physical
   ITTC/Prohaska range (1+k ≈ 1.1–1.4 for a slender body). Its own comment
   admits it was cranked to the band ceiling *specifically* to keep the
   `T1 crew-toward-ama` steering leg signed correctly. Real proa steering
   is dominated by the sail CE, the hull balance, and the steering oar —
   **not** by outrigger drag.
2. **Three empirical sign-flip knobs** — `ceLeverSign`, `yawHeelSign`,
   `crewTrimSign` — each set to whatever makes a test match the manual,
   because the first-principles geometry comes out the *opposite* sign
   (`aero.js:257-267`). A derivation that needs a hand-flipped sign to
   match reality is an incomplete model, not a calibrated one — and it
   doesn't generalize (the `T1 crew-away-from-ama` leg stays wrong-signed,
   an accepted `xfail:STEERING`).

### Change

- `ama.formFactor`: 3.3 → **~1.2** (physical). Expect the steering legs
  that lean on ama-drag authority to regress — that is the point; they
  were being carried by an unphysical term.
- Rebuild the yaw-steering channel so the **sail CE vs hull CLR balance**
  (the real mechanism) carries the steering, not the ama brake. This is
  Round 7's Option C ("shrink the CE-lever's dominance / rebuild"),
  now authorized. Concretely:
  - Derive `xCE`/`yCE` and the `lead` so that the *sign* of trim-induced
    helm matches the Pjoa manual ("sheet in bears away, eased luffs")
    **without** `ceLeverSign` — if a sign flip is still needed after a
    correct derivation, the geometry is still wrong; treat a remaining
    flip knob as a TODO, not a solution.
  - Keep `yawMomentHeel` (mast-rake heel coupling) but verify its sign
    falls out of the geometry too.
- Re-examine the `restingImmersion = 0.3` floor asymmetry in
  `amaDrag` (`hydro.js`) that Round 7 §3 identified as pinning the
  `T1 crew-away` leg — with ama drag no longer the dominant steering term,
  this may resolve on its own or need a small, *physically justified*
  adjustment (not a test-fitted one).

### Reference data (get if at all possible before finalizing)

Round 7 §5 was explicit that this needs real evidence, at the same
standard R7-1 had (the diagnostic recording). Candidates already listed in
`data/README_input_data_EN.md`:
- **Irwin, Flay et al. 2023** (Archaeology in Oceania 58:74–90, open
  access) — Cdf, **Csf (side force), Crm (righting/heeling moment)**
  coefficients for oceanic sails: directly relevant to the CE/heel/steer
  balance.
- **Di Piazza et al. 2014** (JPS 123(1), HAL hal-01069676) — 10 rigs,
  lift/drag: an independent check on the crab-claw coefficients.
- **Flay slender Pacific-canoe-hull** side-force data — the boardless-hull
  lateral-force curve R9-3 and the leeway model (R9-5) both want.

### Acceptance

- `ama.formFactor` within the physical 1.1–1.4 range **and** the R7-4a
  drag-ratio hard anchors still satisfied
  (`ama/hull drag ratio in [0.10,0.30]` static, `[0.4,1.0]` max) — if the
  physical form factor falls outside those bands, the *bands themselves*
  (derived in round 7) need re-checking, flag it.
- T1/T3/T4/T5 steering legs correctly signed **without** relying on
  `ceLeverSign`/`crewTrimSign` flips (reduce the number of hand-flipped
  sign knobs; document any that genuinely remain).
- The `xfail:STEERING` legs (`T1 crew-away`, R7-4b sustained |r|)
  re-evaluated for promotion.
- Determinism self-test (R6-1) still bit-exact.

---

## R9-4 — Represent the crab-claw's vertical lift / low heeling moment *(secondary; contested in literature — keep conservative)*

**File:** `core/aero.js` (`heelMoment`), `core/config.js` (new tunable).

### What's wrong

Marchaj's central claim for the crab claw is that its twisted delta
geometry generates substantial **vertical (upward) lift** via leading-edge
vortices, so it produces a lot of drive for relatively little heeling
moment — this is the physical basis for the windward-brail "redirects
force upward" mechanism the sim already models. But the model applies that
only through the brail knob (`heelMoment *= 1 − 0.9·brailWind`,
`aero.js:196`). The **base** sail is treated as a flat 2D plate
(`heelMoment = Fy · CEheight`), so the rig's signature high-drive/low-heel
character is absent, and the ama loads up more than a real crab claw would
for the same drive.

**Caveat (state it in the code comment):** Di Piazza et al. 2014 — which
this project cites — found *more modest* crab-claw performance than
Marchaj, so the magnitude here is genuinely contested. Model it as a
**conservative, tunable** reduction, defaulting low, not as an aggressive
free-lift bonus.

### Change

- Add `sail.verticalLiftFraction` (default small, e.g. ~0.15–0.25) that
  reduces the base heeling moment to represent the fraction of sail force
  carried as vertical lift on a normally-trimmed crab claw:
  `heelMoment = Fy · CEheight · (1 − verticalLiftFraction) · (1 − 0.9·brailWind)`.
- Do **not** change `Fx`/`Fy` (drive/side force) — vertical lift here only
  unloads the heeling arm; the planar force balance is unchanged.

### Acceptance

- For a given drive on a beam reach, ama load / heel is modestly lower
  than before (matches Marchaj's "low heeling moment for its drive"),
  tunable to zero to recover current behavior.
- No steering/polar regressions beyond the intended heel reduction.

---

## R9-5 — Lesser items (do opportunistically; not round-blocking)

- **Ama wave drag + hull–ama interference:** the ama gets skin friction
  only (`hydro.js` `amaDrag`). Real outriggers make their own wave system
  and interfere with the main hull (catamaran-like). Low priority; note as
  a known simplification if not done.
- **Lumped lateral resistance:** `hull.sideForceCoeff = 0.8` folds the
  ama's lateral area and the boardless hull into one tuned number. If
  Flay's slender-hull side-force data is obtained (R9-3), split/ground it
  and represent the V-vs-U shape dependence the prompt referenced.
- **Roll damping ratio ζ ≈ 0.15** (Round 7 §6) is below the ζ ≈ 0.2–0.4
  cited for beamy multihull forms — a modest `rollDampingCoeff` bump makes
  roll less oscillatory. Independent, small, already-tunable.

## Out of scope (explicit — do NOT attempt this round)

- **Pitch / heave DOF.** No pitchpole / bow-burying failure mode; the
  fore-aft crew control stays the phenomenological CLR-shift knob it is
  today (`hydro.js` `clrXPosition`). This is a real fidelity gap (a proa
  driven hard on a reach can pitchpole), but it is a whole new DOF and its
  own extension, exactly as rounds 4/5 scoped it out. Flag it for a future
  "Part 2," don't start it here.

---

## Sequencing

1. **R9-1** (hull residuary model) — alone, first. Everything else is
   partly downstream of it; do not tune sail or steering against the
   walled hull.
2. **R9-2** (undo sail detune) — immediately after R9-1, so the two are
   calibrated together against the corrected hull.
3. Re-derive the `xfail:CALIBRATION` polar bands against the new polar
   (human decision — see Process).
4. **R9-3** (ama form factor + steering rebuild) — the big one; ideally
   after obtaining reference data (Irwin/Flay 2023). If no data,
   still do the `formFactor → ~1.2` correction and rebuild the CE/CLR
   sign derivation, accepting that some steering legs may need to be
   re-tagged `xfail` with a fresh diagnosis rather than force-fit.
5. **R9-4** (vertical lift) — conservative, after steering is stable.
6. **R9-5 / out-of-scope** — as noted.

## Process (project conventions — mandatory)

- **Calibration philosophy** (unchanged from round 7): assert direction
  strictly, magnitude via acceptance bands; don't reverse-engineer a
  coefficient from a test threshold. Where a change moves a number out of
  a band that was itself derived against the *old* (bugged) physics,
  re-derive the band as an explicit decision — don't silently keep or edit
  it to pass.
- **xfail mechanism:** any known-but-unfixed regression gets a
  `check(..., 'STEERING'|'STABILITY'|'CALIBRATION')` tag with a written
  diagnosis (as round 7 did). A tagged test that starts passing is a
  "promotion candidate" and fails the build until a human lifts the tag —
  keep that guard.
- **Determinism (R6-1):** the self-test must stay bit-exact through every
  change. It is not "close enough," it is a regression, full stop.
- **Documentation (CLAUDE.md §6):** R9-1 and R9-3 are non-trivial
  architectural decisions (new resistance model; a rebuilt steering
  channel). When implemented, record each as an ADR under `docs/adr/`
  (Context / Decision / Consequences / Date), and update the affected
  function-signature / calibration notes in
  `ARCHITECTURE_physics_core_EN.md`. That doc is already ~750 lines and
  past the project's own ~500-line anti-bloat guideline — prefer splitting
  per-module sections into `docs/<module>.md` over appending to it.
- **Report** before/after evidence for each item (drag budget, polar
  table, steering drifts, phi traces) the way rounds 7–8 did, so the next
  reviewer can check the diagnosis, not just the summary.
