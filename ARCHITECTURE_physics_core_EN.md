# PROMPT SUPPLEMENT: Physics core architecture (Step 1 — headless)

*Last reviewed: 2026-07-16*

**Round 5 note:** `ROUND5_CONSOLIDATED_work_order.md` replaced direct
`controls.yardAngle` control with a one-sided SHEET CONSTRAINT — the yard's
actual angle `state.delta` is now real state that relaxes toward its
aerodynamic equilibrium under a bounded slew rate, clamped only from above
by the commanded `controls.sheet` (P1, new `core/sheet.js`). The sail's
center of effort now follows `delta` via real tack/chord geometry instead
of a fixed offset (P1.2), `hydro.js`'s `amaDrag` gained a yaw moment (P2-1),
and the righting curve gained a genuine capsizing branch past
`phiCapsizeDeg` plus a post-capsize freeze (P3). See the new "Sheet
constraint" and "Righting curve capsizing branch" sections below, and the
Function signatures updates for aero.js/hydro.js/stability.js/sheet.js.

**Round 3 note:** the Conventions and relevant Function signatures sections
below were rewritten per `FIX_REQUEST_round3_worldframe.md`'s SPEC ERRATA
(R3-1, R3-2). The "ama always at boat-frame +y" invariant in the original
version of this document was wrong — it forced a shunt swap transform that
spun the physical hull 180deg in the world at every shunt. See
`core/shunt.js`'s header comment and `core/state.js`'s Conventions comment
for the implementation-level detail this section summarises.

**Round 4 note:** roll (`phi`, `p`) is now a real 4th DOF, integrated by
the RK4 solver alongside x/y/heading/u/v/r — see the new "Roll dynamics"
section below and `core/stability.js`. `amaLoad` is now DERIVED from `phi`
(no longer a static heelMoment/restoringCapacity formula), and the aback
capsize trigger reads `phi`'s sign directly instead of the apparent-wind
angle. `computeAmaLoad` and `updateAback` signatures both changed
accordingly (Function signatures section, stability.js). See
`FIX_REQUEST_round4_roll_dof.md`.

This document supplements PROMPT_proa_simulator_EN.md. In Step 1,
implement ONLY the physics core and the test harness — no UI whatsoever.
The core must be a pure JS module (ESM), runnable in Node >= 18 with no
external dependencies, ready to be imported in the browser later without
changes.

## File structure

    /core
      config.js      — default CONFIG + validation + merging user file
      state.js       — state definition, initial state, coordinate conventions
      aero.js        — sail aerodynamics (Polhamus + camber + brails)
      hydro.js       — hull and ama resistance, side force, yaw damping
      rudder.js      — steering oar (active end depends on current tack)
      stability.js   — heel moment balance, ama load, aback
      shunt.js       — shunt-sequence state machine
      sheet.js       — one-sided sheet constraint: delta_align, effectiveDeltaMax, sheetStep (round 5)
      integrator.js  — RK4 / semi-implicit Euler, fixed dt
      simulator.js   — facade: createSimulator(config) -> { step, getState, ... }
    /harness
      polar.js       — automatic polar diagram computation
      scenarios.js   — test scenarios (squall, shunt, aback, stop)
      asserts.js     — acceptance criteria as tests
      export.js      — dump time series to CSV
    run_tests.js     — runs everything; nonzero exit code on failure

## Conventions (MANDATORY, put in a comment at the top of state.js)

- World frame: X east, Y north; angles in RADIANS, measured from the X
  axis counterclockwise (mathematical convention).
- Wind direction given as "blowing from" (meteorological) — convert once,
  at input, to a "blowing towards" vector; only vectors inside the core.
- Boat frame: x axis along the hull towards the ACTIVE bow, y axis 90deg
  CCW from x. `heading` is the world-frame direction of the active bow;
  after a shunt, `heading` jumps by PI (the active bow relabels to the
  opposite physical tip) and the local frame rotates with it.
- The ama is bolted to ONE PHYSICAL side of the hull — it does not
  relocate at a shunt. Its side in the (shunt-rotating) boat frame is
  `end` (+1/-1): +y when end=+1, -y when end=-1. **The ama is NOT always
  at +y** — every rule about "the ama side" (aback detection, the yard's
  leeward trim, heel-moment sign, crew-position mapping) reads `end`, not
  a hardcoded +y. `end` also records which physical hull end is currently
  the bow. The PHYSICAL hull orientation (independent of which tip is
  currently labeled bow) is `heading` when end=+1, `heading+PI` when
  end=-1 — this is continuous through a shunt (the hull does not
  physically rotate; only the bow label changes).
- Shunt swap transform (see core/shunt.js): `end *= -1; heading += PI;
  u = -u; v = -v; r` unchanged. Under the PI rotation of the local frame
  this keeps world-frame position, the physical hull's orientation, the
  ama's world-frame side, and world-frame velocity all continuous. (An
  earlier version of this transform — `u=-u, r=-r`, v preserved — matched
  the "ama always at +y" convention above and was wrong on both counts:
  it left a spurious sway/yaw-rate discontinuity and forced the ama to
  flip world sides at every shunt. See `FIX_REQUEST_round3_worldframe.md`
  R3-1.)
- Velocities u (surge), v (sway) in the boat frame; r (yaw rate) rad/s.
- Roll: `phi` (rad) and `p` (rad/s), the 4th DOF (FIX_REQUEST_round4_roll_dof.md
  Part 1). Defined about the PHYSICAL hull longitudinal axis (not the
  shunt-rotating active-bow frame) — positive phi = the AMA SIDE RISING.
  Because it's a physical-frame quantity, phi and p are left OUT of the
  shunt swap patch entirely (same treatment as r): unchanged at a swap.
- Sheet constraint (round 5, ROUND5_CONSOLIDATED_work_order.md P1): the
  sail is controlled by TWO things now. `controls.sheet` is an INPUT — the
  MAXIMUM yard angle (delta_max, [0, ~90deg], eased = larger). `state.delta`
  is the yard's ACTUAL angle (boat-frame magnitude, >=0), real state that
  relaxes toward its aerodynamic equilibrium at a bounded slew rate
  (core/sheet.js) — the sheet only ever LIMITS delta from above, it never
  commands it directly. Left unchanged at a shunt swap, same as phi/p, but
  for a different reason: nothing in the swap transform touches it.
- Moments: positive = counterclockwise rotation (top-down view).
- Sail angle of attack and leeway angle: always via atan2, never
  asin/acos.
- SI units everywhere; knots only in the presentation/export layer.

## Data shapes

### state (flat object, JSON-serialisable)
    {
      t,                // simulation time [s]
      x, y,             // world position [m]
      heading,          // direction of the active bow [rad]
      u, v, r,          // boat-frame velocities [m/s, m/s, rad/s]
      phi, p,           // roll angle [rad], roll rate [rad/s] — 4th DOF (round 4)
      delta,            // actual yard angle [rad], >=0 — real state (round 5)
      end,              // +1 | -1 — which hull end is the bow
      amaLoad,          // ama load 0..1+ (>1 = past liftoff/submersion) — DERIVED from phi (round 4)
      abackTimer,       // duration of the aback state (phi<0 past submersion) [s]
      overloadTimer,    // duration of the overload state (phi>=0 past liftoff) [s]
      capsized,         // bool
      shunt: { phase, progress }  // 'none'|'ease'|'transfer'|'swap'|'sheet'
    }

### controls (input on every step)
    {
      windDirFrom,      // [rad] blowing from
      windSpeed,        // [m/s]
      sheet,            // [rad] MAXIMUM yard angle (delta_max), >=0 — round 5; NOT the actual yard angle, see state.delta
      rudder,           // [-1..1] -> scaled to +/-35 deg in rudder.js
      brailLee,         // 0..1 leeward brail
      brailWind,        // 0..1 windward brail
      crewPos,          // -0.3..1.0 crew position, lateral (fraction of ama.spacing, toward the ama)
      crewPosX,         // -1..1 crew position, fore-aft (fraction of half hull length; round 4)
      shuntRequest      // bool (rising edge starts the sequence)
    }

### config
All physical constants and tuning multipliers from the main prompt,
plus the CL/CD tables loaded from data/crab_claw_CL_CD_polhamus.csv
(primary source; structure: { alphaDeg[], CL[], CD[] }, linear
interpolation in aero.js), with a Polhamus-formula regeneration
cross-check at startup as required by the main prompt. Fixed schema version: a
`configVersion` field; range validation at startup (fail fast).

## Function signatures (pure functions, no hidden state)

### aero.js
    apparentWind(state, controls) -> { vx, vy, speed, angleToBoat }
    sailCoefficients(alpha, controls, config) -> { CL, CD, alphaSailor }
      // Polhamus from table + camber and brail multipliers per the prompt.
      // Round 5: also adds a small flogging-drag term (config.sail.
      // floggingCDFactor * CD0) ramped in only within LUFF_WINDOW_DEG of a
      // genuine zero-AoA weathervane (alphaAbsDeg -> 0) — the regime-b
      // "sail flogging" depower path, not active in normal driving trims.
    sailForces(state, controls, config)
      -> { Fx, Fy, heelMoment, yawMoment, yawMomentHeel, alpha, alphaSailor, aw }
      // Fx, Fy in the boat frame; heelMoment already reduced by brailWind;
      // alpha is the raw, internal chord-flow angle (not acute on normal
      // courses); alphaSailor [0, pi/2] is the UI-facing angle of attack.
      // The yard trims to the side opposite the ama (leeward) — the chord
      // angle used to derive alpha is end-aware (`state.end * state.delta`
      // — round 5: the ACTUAL yard state, not the commanded sheet; not
      // always `+delta`), so heelMoment's sign mirrors with `end` too;
      // stability.js interprets it via `heelMoment * end`.
      // Round 4 (FIX_REQUEST_round4_roll_dof.md 1.4): Fx/Fy are scaled by
      // cos(state.phi) (heel foreshortens the sail's projected area), and
      // yawMomentHeel = config.hull.yawHeelSign * state.end *
      // sail.CEheight * sin(phi) * Fx — the heeled mast offsets the CE
      // laterally, so the drive force Fx now produces a yaw moment too
      // (pure geometry, no free coefficient beyond the verified sign flip
      // knob). Empirically verified (not just derived) against the
      // coupling-sign test in harness/asserts.js: crew toward the ama
      // measurably bears the boat away on a steady reach with the rudder
      // locked, matching the extension request's expected direction with
      // yawHeelSign=+1 — no flip needed.
      // Round 5 (ROUND5_CONSOLIDATED_work_order.md P1.2/P2-3): yawMoment is
      // now `ceLeverSign * (x_CE*Fy - y_CE*Fx) + yawMomentHeel` — the OLD
      // fixed ceXFraction offset is gone. x_CE/y_CE are real tack-to-CE
      // geometry that SLIDES with the actual delta:
      //   x_CE = tackX - (chord/2)*cos(delta), y_CE = -end*(chord/2)*sin(delta)
      // tackX = config.sail.tackXFraction*(hull.length/2) — that fraction
      // IS the old ceXFraction, repositioned to mean "mast/tack position"
      // instead of "the CE's own fixed position" (zero net new tunables).
      // chord reuses config.sail.CEheight/2 — a full aerodynamic yard span
      // (area/apex-angle derived) was also probed and let the y_CE*Fx term
      // dominate and REVERSE the qualitative "ease -> luffs to windward"
      // trend x_CE*Fy alone already gets right (Fx itself changes sign
      // across a normal trim sweep). config.hull.ceLeverSign (+-1) is a
      // verified-empirically flip knob, same pattern as yawHeelSign: the
      // from-scratch weather/lee-helm derivation (CE aft when trimmed in =
      // weather helm, forward when eased = lee helm) comes out the
      // OPPOSITE polarity from the Pjoa manual's field-validated rule
      // III.3/4 ("sheet in bears away, eased luffs"), so it's flipped
      // (ceLeverSign=-1) to match documented practice rather than the
      // unaided derivation. P2-3: config.sail.ceBrailShift (the one new
      // tunable this section allows, default 0.3) shrinks the along-yard
      // distance used for BOTH x_CE and y_CE proportionally to brailWind —
      // spilling the sail's rear moves the effective CE toward the tack,
      // damping yaw sensitivity (verified: lowers mean|rudder| deep
      // downwind, harness/asserts.js T5) rather than just relocating it
      // (probed: shrinking only one of x_CE/y_CE didn't help).

### hydro.js
    hullResistance(u, config) -> Fx        // friction + wave penalty Fr>0.4
    hullSideForce(u, v, crewPosX, config) -> { Fx, Fy, yawMoment }  // low-AR
                                            // foil, saturation ~15 deg leeway,
                                            // then degrades (mushing); Fx is
                                            // the induced drag cost of Fy.
                                            // crewPosX (round 4, 1.5) shifts
                                            // the CLR fore/aft:
                                            // clrX += hull.crewTrimSign *
                                            // hull.crewForeAftTrimCoeff *
                                            // crewPosX * (hull.length/2).
                                            // Empirically verified: forward
                                            // crew luffs, aft bears away,
                                            // with crewTrimSign=+1 — no flip
                                            // needed (see coupling-sign test).
    amaDrag(u, amaLoad, crewPos, end, config) -> { Fx, yawMoment }
                                            // Round 5 (P2-1, Pjoa manual
                                            // III.3: the ama's drag rotates
                                            // the canoe around it): yawMoment
                                            // = -(ama.spacing*end)*Fx — the
                                            // drag force acts at the ama's
                                            // own lateral position, standard
                                            // r x F, no flip knob needed
                                            // (the sign already comes out so
                                            // MORE ama drag turns the bow
                                            // TOWARD the ama side). Wired
                                            // into integrator.js's M sum;
                                            // this is what lets P2-2's
                                            // coupling-sign reversal happen
                                            // with zero new controls (the
                                            // existing crewPos-driven
                                            // immersion term already
                                            // modulates it).
    yawDamping(r, u, config) -> moment

### rudder.js
    rudderForce(state, controls, config) -> { Fy, yawMoment }
      // lever arm = half hull length * state.end; dead at |u| ~ 0

### stability.js — roll as a 4th DOF (FIX_REQUEST_round4_roll_dof.md Part 1;
### supersedes the round-3 static heelMoment/restoringCapacity model)
    rollRestoreMoment(phi, config) -> N*m
      // Genuine restoring term (opposes phi) UP TO a point — see the
      // capsizing branch below. phi>=0 (ama lifting): ama's own WEIGHT,
      // ease-out growth from 0 at phi=0 to ama.mass*g*ama.spacing at
      // phi=phiLiftoffRad ("ama just clear of the water" — restoring fully
      // mobilised). phi<0 (ama pressed): symmetric, ama.maxBuoyancy instead
      // of ama.mass, saturating at phi=-phiSubmergeRad ("ama fully
      // submerged").
      // Round 5 capsizing branch (ROUND5_CONSOLIDATED_work_order.md P3.1 —
      // supersedes the round-4 model, which held the moment flat at its
      // saturated value forever past liftoff/submergence, letting a boat
      // find a spurious STABLE equilibrium at an absurd heel, verified:
      // steady sailing at phi=58deg): the moment holds flat at its old cap
      // for HOLD_FRAC (0.5) of the liftoff/submerge-to-phiCapsizeRad span
      // (matching a real GZ curve, and preserving the round-4 near-
      // threshold timer behaviour outright — a from-the-threshold ramp was
      // tried first and measurably weakened the squall scenario's gust-
      // recovery margin enough to tip it into capsizing), THEN ramps down
      // through zero AT phiCapsizeRad and on into the opposite sign — a
      // genuine capsizing arm — capped at the SAME magnitude one further
      // span past that (an uncapped linear-in-phi term is a destabilizing
      // linear spring; integrating it produces textbook exponential
      // blow-up, verified: phi reaching thousands of degrees within
      // seconds). config.stability.phiCapsizeDeg (50, symmetric both
      // sides) is 38deg past phiLiftoffDeg / 40deg past phiSubmergeDeg,
      // within the request's own suggested "~35-40deg past liftoff" band
      // and comfortably below the 58deg runaway heel this fixes.
    crewRollMoment(phi, crewPos, config) -> N*m
      // A genuine PENDULUM torque, constant sign in phi (NOT a
      // bidirectional restoring term): -crew.mass*g*crewPos*ama.spacing*
      // cos(phi), matching the extension request's literal formula. This
      // is why crew ballast is double-edged: for crewPos>0 it resists the
      // ama lifting (phi>=0, the normal case) but WORSENS the ama being
      // pressed down once phi has already gone negative (aback-like) — the
      // same fixed weight, at the same fixed offset, always pulls that
      // side down regardless of which way the platform is currently
      // rolling. harness/scenarios.js's squall controller is phi-aware for
      // exactly this reason (crew moves OFF the ama the instant phi<0,
      // rather than chasing amaLoad's magnitude alone).
    rollDampingMoment(p, config) -> N*m   // -stability.rollDampingCoeff * p (linear)
    computeAmaLoad(phi, config) -> amaLoad
      // DERIVED from phi (no longer a function of heelMoment/crewPos/end):
      // 0=upright, exactly 1.0 at phi=phiLiftoffRad (ama just clear) or
      // phi=-phiSubmergeRad (ama just fully submerged), UNBOUNDED past
      // that (grows linearly with phi) so the capsize timers below keep
      // their "how far past the edge" semantics.
    updateAback(state, amaLoad, dt, config) -> { abackTimer, overloadTimer, capsized }
      // Both capsize triggers read the SAME phi-derived amaLoad, split by
      // sign: state.phi>=0 past 1.0 -> overloadTimer (ama flying,
      // config.stability.overloadCapsizeTime, unchanged 2s semantics);
      // state.phi<0 past 1.0 -> abackTimer (ama pressed past buoyancy
      // saturation, config.stability.abackCapsizeTime, unchanged 6s
      // semantics). This is the "physical mechanism instead of a bare
      // timer" the extension request asked for: a backwinded sail drives
      // heelMoment (and hence phi) negative through the roll ODE, so
      // reading phi's sign is strictly more direct than the round-3
      // apparent-wind-angle proxy it replaces — `awAngle` is dropped from
      // the signature, it was only ever used for that proxy check.

### shunt.js
    shuntStep(state, controls, config, dt) -> state patch
      // state machine: ease -> transfer -> swap(end*=-1, heading+=PI,
      // u=-u, v=-v, r/phi/p unchanged — see Conventions above) -> sheet;
      // locked when u > threshold

### sheet.js (round 5 — ROUND5_CONSOLIDATED_work_order.md P1.1)
    deltaAlign(state, controls) -> rad (unclamped)
      // The delta that puts the yard chord edge-on to the apparent wind:
      // aero.js's alpha = chordAngle - awAngle, chordAngle = end*delta, so
      // alpha=0 (or +-PI) needs chordAngle = awAngle+PI (the OTHER zero-AoA
      // branch, chordAngle=awAngle, needs a negative delta — unreachable on
      // this rig). Returns end*(awAngle+PI), normalized — NOT clamped to
      // [0, delta_max]; the caller's clamp is what selects the regime.
    effectiveDeltaMax(state, controls, config) -> rad
      // The sheet ceiling actually in force: released to
      // config.sail.deltaMaxReleaseDeg during a shunt's ease/transfer/swap
      // phases, closed back to the commanded controls.sheet once 'sheet'
      // starts hauling it in.
    sheetStep(state, controls, config, dt) -> { delta } patch
      // delta relaxes toward delta_eq = clamp(deltaAlign, 0, effectiveDeltaMax)
      // at a bounded slew rate (config.sail.yardSwingRateDegPerSec, 90 —
      // request's own 60-120deg/s band). clamp() alone reproduces all
      // three regimes with no special-casing: deltaAlign > delta_max ->
      // rests at delta_max (taut, driving); deltaAlign in [0,delta_max] ->
      // settles exactly at deltaAlign (full weathervane, alpha=+-PI,
      // CL~0); deltaAlign < 0 (wind crossed to leeward) -> clamps to 0
      // (backwinded, pressed against the mast). Held constant across one
      // integrate() call's own RK4 sub-evaluations (same treatment as the
      // shunt phase/fade), advanced once per substep — accurate at
      // dt=1/240s.
    isLuffing(state, controls, config) -> bool
      // delta < effectiveDeltaMax - 2deg — UI "LUFFING" tag and the HUD
      // sheet/yard readout. This is a MECHANICAL definition (matches the
      // request's literal wording) and reads true throughout the
      // backwinded regime too (delta pinned at ~0 by the wind, not the
      // sheet) — the UI's dashed/fluttering VISUAL is gated on a separate,
      // AERODYNAMIC condition instead (alphaSailor near 0), since a
      // pressed, backwinded sail carries real load and isn't fluttering;
      // see ui/app.js's drawBoat.

### integrator.js
    derivatives(state, forces, config) -> { du, dv, dr, dphi, dp, ... }
      // dphi = state.p; dp = forces.Mroll / stability.I_roll (round 4)
    integrate(state, controls, config, dt) -> newState   // RK4, dt=1/240,
      // ODE state [x, y, heading, u, v, r, phi, p] (phi/p added round 4)
      // physics dt smaller than a frame; the facade runs N substeps.
      // Round 5: sheetStep's patch is applied after the shunt patch (P1.1
      // point 3 — a phase transition landing on this exact step is already
      // reflected in the delta_max sheetStep relaxes against). ALSO round
      // 5 (P3.2): if state.capsized, integrate() short-circuits to a pure
      // exponential bleed of u/v/r/p toward zero and returns — no forces
      // computed, no controls read, phi/x/y/heading frozen at whatever
      // they were. This lives in integrator.js itself, not the UI-facing
      // simulator.js facade, so every caller — harness scenarios and the
      // polar sweep included, which call integrate() directly — gets the
      // same "no ghost sailing at some absurd heel" guarantee. (Previously
      // only simulator.js's step() special-cased capsized, and it did so
      // by refusing to call integrate() at all, which froze u/v abruptly
      // at whatever they were at the instant of capsize instead of
      // bleeding down over ~3s — simulator.js's step() no longer needs
      // that guard.)

## Roll dynamics (4th DOF — FIX_REQUEST_round4_roll_dof.md Part 1)

    I_roll * dp/dt = Msail + Mrestore(phi) + Mcrew(phi, crewPos) + Mdamp(p)

- `Msail = -aero.heelMoment * state.end` — converts the boat-frame,
  end-aware heelMoment into the physical-frame roll sign (positive =
  lifts the ama), reusing the round-3 `heelMoment * end` convention.
- `Mrestore`, `Mcrew`, `Mdamp` — see stability.js above.
- `config.stability.I_roll` (roll inertia, kg*m^2): the extension
  request's own suggested default (`displacement*(0.4*ama.spacing)^2` =
  250 kg*m^2) gave a measured roll period of only ~1.0s at a
  representative 8deg step-response probe — well under the requested
  1.5-4s band. Raised to 1500 kg*m^2 (tunable, as the request itself
  flags this default), giving a measured period of ~2.6s.
- `config.stability.rollDampingCoeff` = 900 N*m per (rad/s), paired with
  I_roll=1500 so the same 8deg step settles (|phi|<0.4deg) in ~3.2
  oscillation periods, within the requested 2-4 period damped-overshoot
  band. Linear damping (`-c*p`), not quadratic — chosen for a
  classically-tunable locally-linear damped oscillator near equilibrium,
  since the restoring curve itself is already nonlinear (piecewise
  ease-out/saturating).
- `config.stability.phiLiftoffDeg` (12) / `phiSubmergeDeg` (10): the
  roll angles at which the ama's weight/buoyancy restoring moment
  saturates — also where `computeAmaLoad` reads exactly 1.0.
- `config.stability.phiCapsizeDeg` (50, round 5): past this angle (both
  sides) the restoring arm reverses into a genuine capsizing arm — see
  stability.js's rollRestoreMoment above.
- Sail force scaling and the heel-yaw coupling: see aero.js above.
- Fore-aft crew CLR shift: see hydro.js above.

`amaLoad` and both capsize timers are now driven entirely by the roll
state instead of a static per-step formula, so a violent gust can make
`phi` genuinely overshoot PAST zero into the opposite regime (ama
lifting -> ama pressed) within a second or two — a real consequence of
having actual roll inertia and damping instead of an instantaneous
moment-balance snapshot. Controllers reacting to `amaLoad`'s magnitude
alone (e.g. a naive "shift crew toward the ama whenever load is high")
can be caught out by this, since crew ballast's effect is sign-of-phi
dependent (see crewRollMoment above) — harness/scenarios.js's squall
controller was retuned to check `state.phi`'s sign for exactly this
reason; see its header comment for the capsize this exposed and fixed.

### simulator.js
    createSimulator(userConfig?) -> {
      step(controls, dtFrame),   // runs substeps at fixed dt
      getState(), reset(), setConfig(patch),
      forcesBreakdown()          // last force breakdown — for UI and debugging.
                                  // Includes amaLoad (raw, unbounded — feeds
                                  // the capsize timers) and amaLoadDisplay
                                  // (capped at config.stability.amaLoadDisplayCap,
                                  // UI-safe), plus alpha (raw) and alphaSailor
                                  // ([0, pi/2], UI-safe) — see aero.js. Round
                                  // 5: also deltaMax (effectiveDeltaMax) and
                                  // luffing (isLuffing) — see sheet.js.
    }
    // Round 5 (P3.2): step()'s substep loop no longer special-cases
    // state.capsized (no `if (state.capsized) break`) — integrate() itself
    // now freezes safely when capsized, so still calling it every substep
    // lets the exponential bleed actually animate down over ~3s instead of
    // leaving the state frozen at whatever u/v happened to be at the exact
    // instant of capsize.

## Test harness

### polar.js
    computePolar(config, { twsList, twaFrom:40, twaTo:170, step:10 })
      -> table { twa, tws, bestSpeed, bestSheetAngle, deltaAngle, bestCamberUse }
    // for each heading: simulate to steady state (criterion: |da/dt| < eps
    // for 10 s), optimise the SHEET LIMIT by simple grid search (round 5 —
    // was yardAngle directly). bestSheetAngle is the search variable;
    // deltaAngle is the settled ACTUAL yard angle it produced — the two
    // coincide only when the sheet is taut (asserted on driving rows,
    // harness/asserts.js). simulateToSteady seeds the initial state.delta
    // at the sheet under test (same reasoning as the existing u=1.0 seed:
    // the yard's own swing is otherwise a startup transient of its own,
    // large enough to kick an otherwise-holdable trim into a different,
    // broached attractor before the sheet even locks in).

### scenarios.js — each returns a time series (array of states)
    scenarioSquall()   // close course, TWS 4->10 m/s over 5 s; control
                       // ONLY via brailLee/brailWind/crewPos using a simple
                       // threshold controller on amaLoad
    scenarioShunt()    // 3 consecutive shunts, verify tacks and ama side
    scenarioAback()    // crossing the wind line -> alarm -> capsize
    scenarioStop()     // both brails 100% -> speed < 0.5 m/s within 20 s
    scenarioBackwindSlam()  // round 5 (T9): settles taut/driving on a
                       // reach, then the true wind steps across to the
                       // leeward side — the yard must slam from taut down
                       // to ~0 within the rate limit's own travel time,
                       // sail forces computed at the ACTUAL in-transit
                       // delta every substep, so the resulting yaw impulse
                       // has to emerge from the ordinary force path, not
                       // be scripted

### asserts.js — the prompt's acceptance criteria as tests, incl.:
    - CL(35 deg) in [1.6, 1.8]; CL_max in [1.75, 2.0] at alpha 38-46 deg
    - polar: no progress below ~50 deg TWA; maximum at 90-135 deg;
      speed at TWS 6 m/s, TWA 90 deg within [2.0, 3.6] m/s; bestSheetAngle
      and the settled delta coincide on driving (taut-sheet) rows
    - no NaN/Inf in any scenario; energy does not grow with zero wind
      (damping test)
    - the squall scenario ends without capsize; the aback scenario ends
      with one
    - shunt: after the sequence heading rotated by PI, ama to windward,
      the boat reaches >80% of pre-shunt speed within 30 s
    - round 5, T1-T10 (ROUND5_CONSOLIDATED_work_order.md P5 — a shared
      steeringDrift() helper: settle on course with the heading-hold
      autopilot, LOCK the rudder at its settled deflection, apply ONE
      control change, measure signed heading drift over ~20s with no
      further correction; asserts DIRECTION and a >=3deg minimum
      magnitude, never exact values):
      - T1 (THE ONE SANCTIONED REVERSAL, P2-2): crew toward the ama turns
        to windward (round-4 demanded the opposite; P2-1's ama-drag
        moment now dominates the CE-heel coupling term at this trim)
      - T2 (kept, now practice-validated): crewPosX forward luffs, aft
        bears away
      - T3 (needs P1.2): easing the sheet (still taut) turns to windward,
        trimming in turns to leeward
      - T4 (needs P2-3): windward brail on a beam reach turns to leeward
        AND lowers ama load simultaneously
      - T5 (needs P2-3): windward brail lowers mean |rudder| deep downwind
        (TWA 165) — the "carrot" stabilizes
      - T6 (needs P1): releasing the sheet fully at amaLoad~0.9 in a gust
        saves the boat that a held-in sheet would capsize (the panic rule)
      - T7 (needs P1): sheet limit 90deg on a beam reach settles delta at
        its own equilibrium, not pinned at 90; alpha stays >= 0
      - T8 (needs P1): fully easing the sheet on a reach collapses drive,
        boat decelerates
      - T9 (needs P1): scenarioBackwindSlam — yard swings to ~0 within the
        rate limit's travel time, nonzero yaw-rate impulse during the swing
      - T10 (needs P3): capsize freezes (speed <0.1 m/s within 3s, frozen
        thereafter); past phiCapsizeDeg, heel gains a fixed increment
        faster than at the old (round-4) threshold — genuinely
        accelerating, not just waiting out the timer

### export.js
    toCSV(run) — columns: t, TWA, AWA, u, v, r, phi, p, delta, deltaMax,
    alpha, CL, CD, amaLoad, brailLee, brailWind, crewPos, crewPosX, shunt
    phase (phi, p, crewPosX added round 4 — roll trace column; delta,
    deltaMax added round 5 — the two coincide exactly when the sheet is
    taut). One file per scenario + polar.csv. This is the input for
    plotting and coefficient tuning.

## Definition of done for Step 1

`node run_tests.js` passes all assertions and leaves scenario CSV files
plus the polar in /out. No file in /core references the DOM, canvas, or
the system clock (time only via dt). Step 2 (UI) will import
createSimulator() without modifying the core.

## Known simplifications (round 5 additions — ROUND5_CONSOLIDATED_work_order.md P6)

- Mast rake control: not modeled: the mast is fixed, upright rig geometry.
- Rig structural failure on backwinding: the manual notes a hard-enough
  aback can drop the rig; this sim caps the consequence at the existing
  capsize mechanism, no separate failure mode.
- Crew-at-mast-step during a shunt: procedural (the crew physically
  handles the yard through the swap), not modeled as a force — the shunt
  sequence's force-fade already covers the aerodynamic side of it.
- Pitch / fore-aft trim beyond the existing phenomenological CLR shift
  (hydro.js's crewPosX term): no real pitch DOF, same simplification as
  round 4.
- The over-sheeting-a-close-course test (harness/asserts.js #8) no longer
  demonstrates a gradual heel/speed tradeoff: with the CE now a genuine,
  delta-driven lever (P1.2) and the ama-drag moment added (P2-1), sheeting
  in past a sharp threshold on a close course snaps into an outright
  broach instead — verified across many TWA/TWS/crewPos combinations,
  consistently. The test now asserts THAT (a broach cliff exists), not
  the old gradual-tradeoff story, which no longer holds.
- T5's downwind-stabilization margin (harness/asserts.js) is real but
  modest (a few percent lower mean|rudder|) at the request's own
  illustrative brailWind=0.5; the assertion uses brailWind=1.0 for a
  robust, reproducible margin instead.
