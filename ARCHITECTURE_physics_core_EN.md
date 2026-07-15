# PROMPT SUPPLEMENT: Physics core architecture (Step 1 — headless)

*Last reviewed: 2026-07-15*

**Round 3 note:** the Conventions and relevant Function signatures sections
below were rewritten per `FIX_REQUEST_round3_worldframe.md`'s SPEC ERRATA
(R3-1, R3-2). The "ama always at boat-frame +y" invariant in the original
version of this document was wrong — it forced a shunt swap transform that
spun the physical hull 180deg in the world at every shunt. See
`core/shunt.js`'s header comment and `core/state.js`'s Conventions comment
for the implementation-level detail this section summarises.

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
      end,              // +1 | -1 — which hull end is the bow
      amaLoad,          // ama load 0..1+ (>1 = ama out of the water)
      abackTimer,       // duration of the aback state [s]
      overloadTimer,    // duration amaLoad has been > 1.0 [s]
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
      crewPos,          // -0.3..1.0 crew position (fraction of B/2)
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
      -> { Fx, Fy, heelMoment, yawMoment, alpha, alphaSailor, aw }
      // Fx, Fy in the boat frame; heelMoment already reduced by brailWind;
      // yawMoment from CE position (tack position changes in shunt phases);
      // alpha is the raw, internal chord-flow angle (not acute on normal
      // courses); alphaSailor [0, pi/2] is the UI-facing angle of attack.
      // The yard trims to the side opposite the ama (leeward) — the chord
      // angle used to derive alpha is end-aware (`state.end * |yardAngle|`,
      // not always `+|yardAngle|`), so heelMoment's sign mirrors with
      // `end` too; stability.js interprets it via `heelMoment * end`.

### hydro.js
    hullResistance(u, config) -> Fx        // friction + wave penalty Fr>0.4
    hullSideForce(u, v, config) -> { Fx, Fy, yawMoment }  // low-AR foil,
                                            // saturation ~15 deg leeway, then
                                            // degrades (mushing); Fx is the
                                            // induced drag cost of Fy
    amaDrag(u, amaLoad, crewPos, config) -> Fx
    yawDamping(r, u, config) -> moment

### rudder.js
    rudderForce(state, controls, config) -> { Fy, yawMoment }
      // lever arm = half hull length * state.end; dead at |u| ~ 0

### stability.js
    computeAmaLoad(heelMoment, crewPos, config, end = 1) -> amaLoad   // statics
      // heelMoment * end < 0 (normal case, windward ama lifting): restoring
      // capacity from ama.mass (weight). heelMoment * end > 0 (ama pressed
      // down, e.g. aback): restoring capacity from ama.maxBuoyancy. `end`
      // extends the original `computeAmaLoad(heelMoment, crewPos, config)`
      // signature (defaults to +1 so standalone unit-test calls on a
      // synthetic heelMoment are unaffected) — see
      // FIX_REQUEST_round3_worldframe.md R3-1: the sign check has to read
      // the ama's actual side, not assume +y.
      // Lever arms are the FULL hull-ama spacing (ama.spacing), not half of
      // it — a crew member at crewPos=1.0 stands ON THE AMA, at the full
      // spacing from the roll axis, and the ama's own weight/buoyancy acts
      // there too (FIX_REQUEST_round3_worldframe.md R3-2 erratum; the
      // original prompt's half-spacing formula undersold both levers 2x).
    updateAback(state, awAngle, amaLoad, dt, config) -> { abackTimer, overloadTimer, capsized }
      // aback: apparent wind from the ama's side (state.end, not always
      // +y — FIX_REQUEST_round3_worldframe.md R3-1); capsize when
      // abackTimer exceeds config.stability.abackCapsizeTime.
      // Independently, capsize when overloadTimer (time amaLoad has stayed
      // > 1.0) exceeds config.stability.overloadCapsizeTime. Both
      // thresholds live in CONFIG, not as magic constants (extends the
      // original `updateAback(state, awAngle, dt)` signature — see
      // FIX_REQUEST_step1_review.md CRITICAL-1).

### shunt.js
    shuntStep(state, controls, config, dt) -> state patch
      // state machine: ease -> transfer -> swap(end*=-1, heading+=PI,
      // u=-u, v=-v, r unchanged — see Conventions above) -> sheet; locked
      // when u > threshold

### integrator.js
    derivatives(state, forces, config) -> { du, dv, dr, ... }
    integrate(state, controls, config, dt) -> newState   // RK4, dt=1/240
      // physics dt smaller than a frame; the facade runs N substeps

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
    toCSV(run) — columns: t, TWA, AWA, u, v, r, alpha, CL, CD, amaLoad,
    brailLee, brailWind, crewPos, shunt phase. One file per scenario
    + polar.csv. This is the input for plotting and coefficient tuning.

## Definition of done for Step 1

`node run_tests.js` passes all assertions and leaves scenario CSV files
plus the polar in /out. No file in /core references the DOM, canvas, or
the system clock (time only via dt). Step 2 (UI) will import
createSimulator() without modifying the core.
