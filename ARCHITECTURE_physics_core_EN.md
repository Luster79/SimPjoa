# PROMPT SUPPLEMENT: Physics core architecture (Step 1 — headless)

*Last reviewed: 2026-07-15*

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
      yardAngle,        // [rad] yard angle relative to boat axis (sheeting)
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
      // Polhamus from table + camber and brail multipliers per the prompt
    sailForces(state, controls, config)
      -> { Fx, Fy, heelMoment, yawMoment, yawMomentHeel, alpha, alphaSailor, aw }
      // Fx, Fy in the boat frame; heelMoment already reduced by brailWind;
      // yawMoment from CE position (tack position changes in shunt phases)
      // PLUS yawMomentHeel (round 4); alpha is the raw, internal chord-flow
      // angle (not acute on normal courses); alphaSailor [0, pi/2] is the
      // UI-facing angle of attack.
      // The yard trims to the side opposite the ama (leeward) — the chord
      // angle used to derive alpha is end-aware (`state.end * |yardAngle|`,
      // not always `+|yardAngle|`), so heelMoment's sign mirrors with
      // `end` too; stability.js interprets it via `heelMoment * end`.
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
    amaDrag(u, amaLoad, crewPos, config) -> Fx
    yawDamping(r, u, config) -> moment

### rudder.js
    rudderForce(state, controls, config) -> { Fy, yawMoment }
      // lever arm = half hull length * state.end; dead at |u| ~ 0

### stability.js — roll as a 4th DOF (FIX_REQUEST_round4_roll_dof.md Part 1;
### supersedes the round-3 static heelMoment/restoringCapacity model)
    rollRestoreMoment(phi, config) -> N*m
      // Genuine restoring term (opposes phi). phi>=0 (ama lifting): ama's
      // own WEIGHT, ease-out growth from 0 at phi=0 to ama.mass*g*ama.spacing
      // at phi=phiLiftoffRad ("ama just clear of the water" — restoring
      // fully mobilised), flat past that (fully airborne, no more righting
      // torque as phi keeps growing — a runaway condition, caught by the
      // overload timer, not this curve). phi<0 (ama pressed): symmetric,
      // ama.maxBuoyancy instead of ama.mass, saturating at
      // phi=-phiSubmergeRad ("ama fully submerged").
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

### integrator.js
    derivatives(state, forces, config) -> { du, dv, dr, dphi, dp, ... }
      // dphi = state.p; dp = forces.Mroll / stability.I_roll (round 4)
    integrate(state, controls, config, dt) -> newState   // RK4, dt=1/240,
      // ODE state [x, y, heading, u, v, r, phi, p] (phi/p added round 4)
      // physics dt smaller than a frame; the facade runs N substeps

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
                                  // ([0, pi/2], UI-safe) — see aero.js.
    }

## Test harness

### polar.js
    computePolar(config, { twsList, twaFrom:40, twaTo:170, step:10 })
      -> table { twa, tws, bestSpeed, bestYardAngle, bestCamberUse }
    // for each heading: simulate to steady state (criterion: |da/dt| < eps
    // for 10 s), optimise yardAngle by simple grid search

### scenarios.js — each returns a time series (array of states)
    scenarioSquall()   // close course, TWS 4->10 m/s over 5 s; control
                       // ONLY via brailLee/brailWind/crewPos using a simple
                       // threshold controller on amaLoad
    scenarioShunt()    // 3 consecutive shunts, verify tacks and ama side
    scenarioAback()    // crossing the wind line -> alarm -> capsize
    scenarioStop()     // both brails 100% -> speed < 0.5 m/s within 20 s

### asserts.js — the prompt's acceptance criteria as tests, incl.:
    - CL(35 deg) in [1.6, 1.8]; CL_max in [1.75, 2.0] at alpha 38-46 deg
    - polar: no progress below ~50 deg TWA; maximum at 90-135 deg;
      speed at TWS 6 m/s, TWA 90 deg within [2.0, 3.6] m/s
    - no NaN/Inf in any scenario; energy does not grow with zero wind
      (damping test)
    - the squall scenario ends without capsize; the aback scenario ends
      with one
    - shunt: after the sequence heading rotated by PI, ama to windward,
      the boat reaches >80% of pre-shunt speed within 30 s

### export.js
    toCSV(run) — columns: t, TWA, AWA, u, v, r, phi, p, alpha, CL, CD,
    amaLoad, brailLee, brailWind, crewPos, crewPosX, shunt phase (phi, p,
    crewPosX added round 4 — roll trace column). One file per scenario
    + polar.csv. This is the input for plotting and coefficient tuning.

## Definition of done for Step 1

`node run_tests.js` passes all assertions and leaves scenario CSV files
plus the polar in /out. No file in /core references the DOM, canvas, or
the system clock (time only via dt). Step 2 (UI) will import
createSimulator() without modifying the core.
