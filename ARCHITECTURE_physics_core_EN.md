# Physics core architecture

*Last reviewed: 2026-08-04*

Context map for the dependency-free ES-module physics core and its test
harness. It describes **the model as it stands** — module layout, frame and
sign conventions, and the contracts other code relies on.

It deliberately does **not** record how the model got here. Decisions and their
reasoning live in `docs/adr/`; the evidence behind specific numbers lives in
`docs/findings-*`; the round-by-round development history is
`Archive/ARCHITECTURE_physics_core_EN_2026-08-04_historical.md` and the round
documents beside it. `docs/README.md` is the index for all of it.

The core is pure JS (ESM), runs on Node >= 18 with no external dependencies,
and imports unchanged in the browser. No file in `/core` touches the DOM,
canvas, or the system clock — time enters only as `dt`.

---

## File structure

    /core
      config.js      — default CONFIG, CSV loading, data integrity cross-checks, validation
      state.js       — state shape, initial state, coordinate conventions
      aero.js        — sail aerodynamics, windage, sail CE geometry
      hydro.js       — hull resistance, hull lateral force by strip integration, ama drag
      rudder.js      — steering oar as a foil at the physical stern
      stability.js   — roll restoring/crew/damping moments, ama load, capsize state
      shunt.js       — shunt-sequence state machine
      sheet.js       — one-sided sheet constraint on the yard
      integrator.js  — force assembly, rigid-body derivatives, RK4
      simulator.js   — facade: createSimulator(config) -> { step, getState, ... }
    /harness
      polar.js       — polar diagram by grid search over the sheet limit
      scenarios.js   — squall, shunt, aback, stop, backwind slam, through-gybe
      asserts.js     — acceptance criteria as tests
      acceptance-manual.js — measures the model against the owner's manual (report, not a gate)
      export.js      — time series to CSV
      checksum.js    — hashState(): the one shared hash used by the determinism
                       self-test, the UI recorder, and replay.js
      replay.js      — headless CLI: re-simulates a recorded session
    run_tests.js     — runs everything; nonzero exit on failure

---

## Conventions

These are mandatory and are restated at the top of `core/state.js`.

- **World frame:** X east, Y north. Angles in radians, measured from +X
  counterclockwise.
- **Wind** is given as "blowing from" (meteorological) at the controls
  boundary and converted once, at input, to a "blowing towards" vector. Only
  vectors are used inside the core after that.
- **Boat frame:** x along the hull toward the ACTIVE bow, y 90° CCW from x.
  `heading` is the world-frame direction of the active bow. At a shunt
  `heading` jumps by π (the active bow relabels to the opposite physical tip)
  and the local frame rotates with it.
- **The ama is bolted to one physical side** and does not relocate at a shunt.
  Its side in the (shunt-rotating) boat frame is `end` (+1 → +y, −1 → −y).
  **The ama is not always at +y.** Every rule about "the ama side" — aback
  detection, the yard's leeward trim, heel-moment sign, crew-position mapping —
  reads `end`. `end` also records which physical hull end is currently the bow;
  the physical hull orientation is `heading` when `end=+1` and `heading+π` when
  `end=−1`, which is continuous through a shunt.
- **Shunt swap transform:** `end *= -1; heading += π; u = -u; v = -v`. Under
  the π rotation of the local frame this keeps world position, physical hull
  orientation, the ama's world-frame side, and world-frame velocity all
  continuous. `r`, `phi`, `p` and `delta` are omitted from the patch, which
  leaves the freshly integrated values untouched — the correct treatment for
  quantities that do not depend on which tip is labelled bow.
- **Velocities:** u (surge), v (sway) in the boat frame; r (yaw rate) rad/s.
- **Roll:** `phi` (rad) and `p` (rad/s), defined about the PHYSICAL hull
  longitudinal axis, not the shunt-rotating active-bow frame. Positive `phi`
  means the AMA SIDE RISING.
- **A trap worth naming:** the boat frame's +x already points at the active
  bow, so a quantity referenced to the bow or the stern carries **no `end`
  factor**. This has caught the steering oar's lever arm (ADR 0016), the mast's
  fore-aft rake (ADR 0019) and the tack control (ADR 0023). Symmetry checks
  only catch it if they run the relevant control **off** neutral.
- **Moments:** positive = counterclockwise, viewed from above.
- Angle of attack and leeway are always computed with `atan2`, never
  `asin`/`acos`.
- SI units everywhere in the core; knots only in export/UI.

---

## Data shapes

### state (flat, JSON-serialisable)

    {
      t,                // simulation time [s]
      x, y,             // world position [m]
      heading,          // direction of the active bow [rad]
      u, v, r,          // boat-frame velocities [m/s, m/s, rad/s]
      phi, p,           // roll angle [rad], roll rate [rad/s]
      delta,            // actual yard angle [rad], >= 0
      end,              // +1 | -1 — which hull end is the bow, and the ama's side
      amaLoad,          // 0..1+ ; 1.0 = ama just clear / just fully submerged
      abackTimer,       // duration of sustained aback [s]
      capsized,         // bool
      shunt: { phase, progress }   // 'none'|'ease'|'transfer'|'swap'|'sheet'
    }

"Ama flying" and the through-gybe "pressed" warning are **not** stored state —
each consumer derives them on the fly from `phi`/`amaLoad`/`Msail`.

### controls (input on every step)

    {
      windDirFrom,      // [rad] blowing from
      windSpeed,        // [m/s]
      sheet,            // [rad] MAXIMUM yard angle (delta_max), >= 0 — not the actual angle
      rudder,           // [-1..1] -> +-rudder.maxDeflectionDeg
      rudderUp,         // bool — oar shipped; zero force. DEFAULTS TRUE (see rudder.js)
      brailLee,         // 0..1 leeward brail
      brailWind,        // 0..1 windward brail ("breaking" brail / carrot)
      crewPos,          // -0.3..1.0 crew position, lateral (fraction of ama.spacing)
      crewPosX,         // -1..1 crew position, fore-aft (fraction of half hull length)
      tackX,            // -1..1 rig fore-aft position, referenced to the active bow
      halyard,          // 0..1, 1 = yard peaked at the masthead
      shroud,           // 0..1, 1 = mast upright (lateral)
      stays,            // -1..1 fore-aft mast rake, +1 = masthead toward the active bow
      shuntRequest      // bool (rising edge starts the sequence)
    }

`tackX`, `halyard`, `shroud` and `stays` are the rig-trim steering controls.
At `tackX=0, halyard=1, shroud=1, stays=0` every term they introduce is
exactly zero.

### config

All physical constants plus the CL/CD tables loaded from `data/`. Fixed schema
version (`configVersion`), range validation at startup, fail fast. Every
digitised data file carries a self-describing header and has a reader
(ADR 0009).

---

## Module contracts

### aero.js

    apparentWind(state, controls) -> { vx, vy, speed, angleToBoat }

    sailCoefficients(alpha, controls, config) -> { CL, CD, alphaSailor, areaFactor }

`alpha` is the raw signed chord-flow angle over (−π, π]. Beyond |alpha| = 90°
the flow is on the leech side (genuinely backwinded); the table is looked up at
the mirrored angle while the sign still comes from `alpha` itself.

CL comes from the active table (ADR 0003), scaled by a camber **delta** beyond
the table's own built-in camber and by furling. CD is composite (ADR 0007):
`CD0 + inducedK·CL_working² + CDbroadside·sin⁴(alpha) + gathering + flogging`.

The brails act through **effective area**, not through a CL fudge — a brail
gathers cloth, so the reference area shrinks. The windward brail has two
regimes joined smoothly at `sail.brailTrimRange`: TRIM (deepens the belly, sail
keeps drawing) and SURVIVAL (spills power).

    windageForce(state, controls, config) -> { Fx, Fy }

Air drag on the above-water body (ADR 0008), along the apparent wind. Exposed
area interpolates on sin² of the apparent-wind angle between
`hull.windageAreaFrontal` and `hull.windageArea`. Deliberately **not** faded by
the shunt: the sail's lift is carried across during a shunt, the hull and crew
are not. It belongs in Fx/Fy rather than in resistance because on a broad reach
it pushes rather than retards.

    sailForces(state, controls, config)
      -> { Fx, Fy, Fz, heelMoment, yawMoment, yawMomentHeel, alpha, alphaSailor, aw, CL, CD }

Heel projection is split three ways: the in-plane transverse force gets a
second `cos(phi)` to become the horizontal `Fy`, `sin(phi)` to become the
vertical `Fz`, and the heeling moment is taken from the **in-plane** force.
`Fz` is exposed but **not integrated** — there is no heave DOF (see "Known
simplifications").

The heeling arm is `CEheightEff + hull.clrDepth`: the sail's side force and the
hull's hydrodynamic reaction form a couple, so the arm is the distance between
them.

**Vertical rig geometry (ADR 0019, 0020).** `halyard` sets the yard's
inclination about `sail.yardCERadius` (derived so that full hoist reproduces
the nominal CE height). Easing drops the CE and swings it aft → weather helm,
which is the manual's own stated cause. `shroud` sets the LATERAL mast lean;
the shroud runs to the ama, so slack lets the mast fall away from it, to
leeward. `stays` set the FORE-AFT rake and are signed, so the mast can be raked
forward — the classical cure for weather helm. `CEheight` is the sail's size
reference (the streamwise chord, unchanged by hoist); the effective height
feeds the heel arm.

**CE geometry.**

    xCE = clrXNeutral + hull.lead + tackOffset + swing + ceBrailXShift + xHalyard + xRake
    yCE = -end · halfChordEffY · sin(delta) + yRake
    yawMoment = ceLeverSign · (xCE·Fy − yCE·Fx) + yawMomentHeel

- `hull.lead` anchors the CE's neutral point against the hull's own CLR
  (`clrXPosition` at `crewPosX=0` — fixed, so crew fore-aft moves the hull's
  CLR without dragging the sail's CE along and cancelling the mechanism).
- `tackOffset = tackX · sail.tackTravel` — the rig's own fore-aft position, and
  **the** proa steering control (ADR 0011): it is what lets the helm lever
  `xCE − clrX` reach zero at all. No `end` factor (ADR 0023).
- `swing = −halfChordEff·(1 − cos delta)` in the default `'manual'` mode: the
  CE moves **aft** as the sail is eased, so sheeting in bears away. The owner's
  manual states this outright and it is the opposite of what rigid-triangle
  geometry gives; `'geometric'` is kept switchable because the losing side is a
  real argument, not an error (ADR 0014).
- `ceBrailXShift · brailWind` — the windward brail's own forward CE shift
  (ADR 0015). The manual gives it its own mechanism with no trim dependence.
- The **lateral** offset uses its own geometric base length, `sail.ceRadius`
  (tack-to-centroid along the spar bisector) scaled by `yceFraction`, not the
  fore-aft half-chord. The fore-aft excursion is a centre-of-pressure migration
  with trim; the lateral offset is the geometric fact that an eased crab claw
  hangs out over the water (ADR 0024).

`hull.ceLeverSign` is currently the identity (+1): the naive r × F derivation
matches the boat's real steering direction. `hull.yawHeelSign` is **0** — the
term is disabled, and that needs its own justification: it models one half of a
cancelling pair (heel swings the rig's CE to leeward, and also makes the
immersed hull asymmetric, which opposes it and which the model does not have at
all). A partial model of a cancelling pair has an essentially arbitrary sign.
Restore it only together with the hull's own heeled-yaw term.

### hydro.js

    hullResistance(u, config) -> Fx

ITTC-57 skin friction at the instantaneous Reynolds number, plus a bounded
Gaussian residuary hump in the same nondimensional form (ADR 0001). Past the
hump the tail is held at `residuaryTailPlateau` of the peak rather than decaying
to zero — a slender canoe hull does not shed residuary resistance back to
friction-only, and letting it do so opens a second, unphysically fast speed
branch (ADR 0006).

    clrXPosition(crewPosX, config) -> x offset from CG

The single statement of where the centre of lateral resistance sits. Shared by
`hullSideForce` and by aero.js's CE geometry — the CE−CLR "lead" only means
anything if both sides reference the same point. Fore-aft crew trim shifts it.

    hullSideForce(u, v, r, crewPosX, phi, config) -> { Fx, Fy, yawMoment }

**The hull's whole lateral force, by strip integration** (ADR 0017). Station x
sees its own transverse velocity `v + r·x`, hence its own leeway, hence its own
CS from the measured curve (ADR 0004). Every term is per-station and summed —
foil force, low-speed linear damping, cross-flow, induced drag — and the yaw
moment is the integral of `x·f(x)`, not `clrX·Fy`.

The lateral area is **not** uniform along the length: it carries a linear taper
with mean 1 (so the strips still sum to `hull.lateralArea`) and centroid at
`clrXPosition()` plus a heel-driven shift (`hull.heelClrShiftCoeff/heelClrSign`
— present but defaulted to 0; see config.js's own comment for why). A uniform
distribution would put the centroid at the CG and delete the hull's
weathercocking.

At `r = 0` this reduces exactly to a single-leeway model with moment `clrX·Fy`.
What it adds is everything `r` does: the hull's own yaw damping, and the v–r
cross term that a split sway/yaw pair cannot own.

`CS(leeway)` is three regimes: the measured V2 quadratic (0–16°), a linear
blend toward the independently-measured V1 curve (16–24°), and a flat hold
beyond — an explicit, provenance-free extrapolation guard.

The leeway magnitude is folded into [0, 90°] so a hull moving stern-first at a
small drift angle reads as a small drift angle. **Known limitation, stated
rather than hidden:** the folded angle is looked up in the same curve either
way, and the measurements are for a hull going forward.

    amaDrag(u, v, r, phi, crewPos, end, config) -> { Fx, Fy, yawMoment }

Friction (ITTC-57 at the ama's own length, times a form factor) **plus**
residuary, on the same Fr hump the hull has — the ama is shorter, so at any
boat speed it sits at a higher Froude number (ADR 0015). Immersion is derived
from heel **with sign**: full when pressed (`phi<0`), fading to zero when
flying (`phi>0`), resting on its own buoyancy at `phi≈0`. Crew weight the float
actually carries is derived from the buoyancy balance, not scaled by a tunable.

The drag's own `yawMoment = −(ama.spacing·end)·Fx` — standard r × F at the
ama's own lateral position. The sign comes out so that MORE ama drag turns the
bow TOWARD the ama side, with no flip knob.

**The ama's own lateral plane** (`Fy`, and a second yaw-moment term summed
into the same total): the float is a slender body, not a point, so it gets the
SAME strip integration `hullSideForce` does, over its own (much shorter)
length, at its own fixed lateral offset. Lateral area is derived from the
immersion-scaled wetted surface by a cylinder's own area ratio (profile/wetted
= 1/π), not a separately-measured dimension. Reuses the hull's own measured
CS(leeway) curve (same precedent as the residuary term above); deliberately
narrower than `hullSideForce`'s own decomposition — foil lift only, no
low-speed linear damping (that constant is calibrated to the whole hull, not
per-area) and no induced-drag `Fx` contribution (the friction+residuary `Fx`
above is already a complete resistance figure).

### rudder.js

    rudderForce(state, controls, config) -> { Fx, Fy, yawMoment }

A proper foil, not `coeff·sin(deflection)`. Effective AoA = deflection + inflow
angle at the blade, so leeway weathercocks and yaw rate damps; a stall shape
past `rudder.stallAngleDeg`; lift and drag projected onto the boat axes, so
steering costs speed.

The oar sits at the **physical stern**, lever arm `−(hull.length/2)`, with **no
`end` factor** — +x already points at the active bow, so the stern is at −L/2 on
both ends (ADR 0016). Dead at |u| ≈ 0.

`controls.rudderUp` short-circuits to zero force. A Pjoa's "rudder" is a
steering OAR, normally shipped clear of the water rather than centred, so
`createDefaultControls()` defaults it to shipped. The UI's checkbox reads the
other way round ("oar in the water") because that is how a sailor acts on it.

### stability.js

    rollRestoreMoment(phi, config) -> N·m

Restoring up to a point, then reversing. For `phi >= 0` (ama lifting) the
restoring source is the ama's own WEIGHT, growing ease-out from 0 at `phi=0` to
`ama.mass·g·ama.spacing` at `phiLiftoffDeg`. For `phi < 0` (pressed) it is
symmetric with `ama.maxBuoyancy`, saturating at `phiSubmergeDeg`. The lever is
projected onto the horizontal as the platform rolls (`·cos phi`), matching
`crewRollMoment`.

Past saturation the moment holds flat for `HOLD_FRAC` of the span to
`phiCapsizeDeg` — matching a real GZ curve — then ramps down through zero AT
`phiCapsizeDeg` and on into the opposite sign: a genuine capsizing arm. That arm
is itself **capped** at the same magnitude one further span out. An uncapped
linear-in-phi term is a destabilising linear spring and integrates to textbook
exponential blow-up.

    crewRollMoment(phi, crewPos, config) -> N·m

A genuine pendulum torque, `−crew.mass·g·crewPos·ama.spacing·cos(phi)` —
**constant sign in phi**, not a bidirectional restoring term. This is why crew
ballast is double-edged: for `crewPos>0` it resists the ama lifting (the normal
case) but *worsens* the ama being pressed once `phi` has gone negative. The
same fixed weight at the same fixed offset always pulls that side down.
Controllers must therefore read the sign of `phi`, not the magnitude of
`amaLoad` (see `harness/scenarios.js`'s squall controller).

    rollDampingMoment(p, config) -> N·m     // -rollDampingCoeff · p, linear
    computeAmaLoad(phi, config) -> amaLoad

`amaLoad` is derived from `phi`: 0 upright, exactly 1.0 at `phiLiftoffDeg` (ama
just clear) or `−phiSubmergeDeg` (just fully submerged), and **unbounded** past
that, so "how far past the edge" keeps its meaning.

    updateAback(state, amaLoad, Msail, dt, config) -> { abackTimer, capsized }

Two distinct capsize paths.

- **Angular**, applied symmetrically: `|phi| >= phiCapsizeDeg +
  capsizeTriggerMarginDeg`. The margin puts the trigger safely past the arm
  reversal, so the freeze catches the boat visibly rolling past the point of no
  return rather than the instant it crosses the reversal.
- **Aback timer**, pressed side only: `phi<0 && amaLoad>1` (genuine full
  submersion) sustained beyond `abackCapsizeTime`. This is the earlier,
  nautical mechanism and is deliberately distinct from the angle above.

Real proas fly the ama routinely as a controlled technique, so `amaLoad>1` on
the **flying** side is a warning readout only, with no timer behind it.

The through-gybe "pressed" warning (`phi<0 && Msail<0`) is deliberately kept
**out** of the timer: a sustained press at a sub-1.0 `amaLoad` is real and worth
signalling, but gating the capsize timer on it turns ordinary downwind sailing —
which has brief negative-phi moments — into false capsizes. Each consumer
computes it directly from `state.phi` and `breakdown.roll.Msail`.

### sheet.js

You cannot push on a rope. `controls.sheet` sets only the maximum yard angle;
`state.delta` is the yard's actual angle and relaxes toward its aerodynamic
equilibrium at a bounded slew rate.

    deltaAlign(state, controls) -> rad (unclamped)

The delta putting the yard edge-on to the apparent wind: `end·(awAngle + π)`.
The other zero-AoA branch needs a negative delta, which this rig cannot reach.
Returned unclamped — the sign and magnitude of the raw value are what select the
regime.

    effectiveDeltaMax(state, controls, config) -> rad

Floored at `sail.deltaMinDeg`, the closest the SHEET can hold the yard to the
centreline given the rig's own geometry (ADR 0010). This bounds the sheet, not
the yard: a rope can only stop the yard swinging out, so the wind may still push
it inside `deltaMin`. Released to `deltaMaxReleaseDeg` during a shunt's
ease/transfer/swap phases, closed back once 'sheet' starts hauling in.

    sheetStep(state, controls, config, dt) -> { delta }

`clamp(deltaAlign, 0, deltaMax)` alone reproduces all three regimes with no
special-casing: above `deltaMax` → taut and driving; inside the range → full
weathervane, alpha = ±π, CL ≈ 0; below zero (wind crossed to leeward) → clamped
to 0, backwinded against the mast.

    isLuffing(state, controls, config) -> bool

A MECHANICAL definition (`delta < deltaMax − 2°`) that reads true through the
backwinded regime too. The UI's fluttering visual is gated on a separate
AERODYNAMIC condition, since a pressed, backwinded sail carries real load and is
not fluttering.

### shunt.js

    shuntStep(state, controls, config, dt) -> state patch

`ease → transfer → swap → sheet → none`, locked out above
`config.shunt.speedLockout`. Only the swap phase patches state (see the swap
transform under Conventions). `controls.shuntRequest` must already be an
edge-triggered pulse; turning a held key into that edge is the facade's job.

### integrator.js

    computeForces(state, controls, config) -> totals + breakdown + readouts
    derivatives(state, forces, config) -> { du, dv, dr, dx, dy, dheading, dphi, dp }

Three **separate** inertias: `hull.massSurge`, `hull.massSway` (carrying the
added mass of the water a hull drags sideways) and `hull.yawInertia`. Because
m_x ≠ m_y the rigid-body equations also produce the **Munk moment**,
`(m_x − m_y)·u·v` in `dr` — the classical destabilising moment on a slender body
at an angle of attack. It is not double-counted with the strip integration
(ADR 0018). `hull.displacement` is an input to the derivation in config.js and
is not read by the dynamics.

    integrate(state, controls, config, dt) -> newState

RK4 over `[x, y, heading, u, v, r, phi, p]` at fixed `dt`, then the discrete,
non-ODE updates once per substep: the shunt patch, then `sheetStep` (so a phase
transition landing on this step is already reflected in the ceiling delta relaxes
against), then the ama-load/aback/capsize statics. `delta` and the shunt phase
are held constant across a step's own k1..k4 evaluations.

**Capsize freeze.** If `state.capsized`, `integrate()` short-circuits to a pure
exponential bleed of u/v/r/p and returns — no forces, no controls read, phi/x/y/
heading frozen. This lives here rather than in the facade so that every caller —
the harness scenarios and the polar sweep call `integrate()` directly — gets the
same "no ghost sailing at some absurd heel" guarantee.

**Divergence guard.** `isPhysicallyPlausible()` catches arithmetic runaway (a
sustained hard-over rudder can spin the boat fast enough that `dt` stops
resolving the rotation) and freezes the last physical state, flagged as a
capsize — unambiguously where the trajectory was going. Its bounds are
deliberately absurd rather than tuned: they separate "arithmetic has failed"
from "sailing badly", and a real capsize fires far inside every one of them.
**They must never become knobs** — anything that needs tuning belongs in
config.js.

### simulator.js

    createSimulator(userConfig?) -> { step, getState, reset, setConfig, forcesBreakdown }

`step()` runs N substeps at fixed `config.dt` and performs the rising-edge
detection for `shuntRequest`. It does **not** special-case `capsized` — the
integrator's own freeze lets the bleed animate down instead of leaving u/v
frozen at the instant of capsize.

`forcesBreakdown()` exposes the last force breakdown, including both the raw
`amaLoad` (unbounded — this is what the timer and the warning read) and
`amaLoadDisplay` (capped, UI-safe), and both `alpha` (raw) and `alphaSailor`
([0, π/2], UI-facing).

---

## Roll dynamics

    I_roll · dp/dt = Msail + Mrestore(phi) + Mcrew(phi, crewPos) + Mdamp(p)

`Msail = −aero.heelMoment · state.end` converts the boat-frame, end-aware heel
moment into the physical-frame roll sign (positive = lifts the ama).

Roll is a real integrated DOF, not a per-step moment balance, so a violent gust
can make `phi` genuinely overshoot past zero from "ama lifting" into "ama
pressed" within a second or two. That is a real consequence of having inertia
and damping, and it is what makes crew ballast's sign-dependence (above) a
practical hazard for controllers.

`stability.I_roll` and `rollDampingCoeff` are tuned as a pair against a target
roll period and settling time, not derived. `phiLiftoffDeg` / `phiSubmergeDeg`
are free constants, not derived from the ama's geometry. All four predate the
re-parameterisation onto the real PJOA FOLK (ADR 0021) and are the model's
weakest calibration.

---

## Determinism contract

Given the same `initialState`, `config` and ordered sequence of
`(dtFrame, controls)` steps, `integrate()` produces **bit-identical** output
every time: no wall-clock reads, no randomness, no iteration-order dependence,
substep sizes derived only from `dtFrame` and `config.dt`.

This is a **tested** contract, not an assumption — `harness/asserts.js` runs a
scenario twice from the same initial state and hashes every step
(`harness/checksum.js`). The session recorder and `harness/replay.js` both
depend on it. Any core change that breaks that self-test is a regression, full
stop.

**Scope: same-engine, not cross-engine.** The guarantee is proven within one JS
engine build. A recording made in a browser and replayed under Node crosses an
engine boundary, and `Math.sin`/`cos`/`atan2`/`sqrt` are
"implementation-approximated" per the ECMAScript spec. A long recording can
therefore show a single-ULP divergence in one field after a few thousand
accumulated substeps. `replay.js --verify` treats a late, single-field, tiny
divergence as informational; the replayed CSV stays trustworthy either way.

---

## Test harness

`polar.js` computes, for each heading, the steady state reached by simulating
to convergence, optimising the SHEET LIMIT by grid search. `bestSheetAngle` is
the search variable; `deltaAngle` is the settled actual yard angle it produced —
the two coincide only when the sheet is taut.

`scenarios.js` returns time series for squall, three consecutive shunts, aback,
full stop, backwind slam and through-gybe aback.

`asserts.js` holds the acceptance criteria: the aero table's calibration bands,
polar shape, no NaN/Inf, energy not growing at zero wind, capsize/aback
behaviour, shunt correctness, the steering-direction suite, drag-ratio anchors,
the sheeting-tolerance property, the rudder-free balance measurements, the
literature comparisons, and the determinism self-test.

**`xfail`.** `check()`'s fourth argument tags a known, diagnosed,
expected-to-fail assertion (`'STEERING' | 'STABILITY' | 'CALIBRATION'`).
`run_tests.js` reports these separately, excludes them from the pass count, and
**fails the build if one unexpectedly starts passing** — a promotion candidate
needs a human decision, not a silent pass.

`acceptance-manual.js` measures the model against every criterion in the owner's
manual on a grid and prints a tally. It is a **report, not a build gate**,
deliberately: some criteria describe controls the model does not have.

`export.js` dumps `t, TWA, AWA, u, v, r, phi, p, delta, deltaMax, alpha, CL, CD,
amaLoad, brailLee, brailWind, crewPos, crewPosX, shunt phase` — one file per
scenario, plus the polar.

`replay.js <recording.json> [--csv out.csv] [--verify]` re-simulates a recorded
session through `integrate()` directly rather than through the facade, mirroring
the facade's private edge-detection itself.

---

## Known simplifications

Stated so they are visible and measurable rather than silently missing.

- **No heave or pitch DOF.** `Fz` is computed and exposed through
  `forcesBreakdown()` but not integrated, so the vertical balance is not closed.
  Fore-aft trim exists only as the phenomenological CLR shift in
  `clrXPosition()`.
- **Nothing underwater depends on heel.** `hullSideForce` does not take `phi`,
  so the hull's lateral plane, its side-force coefficient and its heeled yaw
  moment are all heel-independent. This is why `hull.yawHeelSign` is 0.
- **The ama has no lateral plane** — `amaDrag` returns longitudinal force and
  its yaw moment only. Roll damping is one lumped linear coefficient.
- **Sail forces are faded, not computed, through a shunt.** `shuntForceFade`
  returns exactly 0 through 'transfer' and 'swap'. Windage is deliberately
  exempt so the boat is not force-free while lying beam-on.
- **No mast shadow, no sail twist, no unsteady aerodynamics.** The sail's alpha
  is the geometric chord-flow angle, while the v2 table's own alpha is measured
  from zero-lift incidence — a known, uncorrected offset of a few degrees.
- **Rig structural failure on backwinding** is not modelled; the consequence is
  capped at the existing capsize mechanism.
- **Crew handling of the yard during a shunt** is procedural, not a force.
