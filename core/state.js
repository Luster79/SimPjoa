// state.js — state shape, initial state, coordinate conventions.
//
// CONVENTIONS (mandatory, see ARCHITECTURE_physics_core_EN.md):
// - World frame: X east, Y north; angles in RADIANS, measured from the X
//   axis counterclockwise (mathematical convention).
// - Wind direction is given as "blowing from" (meteorological) at the
//   controls boundary; it is converted ONCE, at input, to a "blowing
//   towards" vector (see aero.js: apparentWind). Only vectors are used
//   inside the core after that point.
// - Boat frame: x axis along the hull towards the ACTIVE bow (state.heading
//   holds this direction in world-frame terms), y axis 90deg CCW from x.
//   The ama is bolted to ONE physical side of the hull and does not
//   relocate at a shunt; its side in THIS frame is state.end (+1/-1: +y
//   when end=+1, -y when end=-1) — NOT always +y. state.end also holds
//   which physical hull end is currently the bow. Every rule phrased in
//   terms of "the ama side" — aback detection, the yard's leeward trim,
//   heel-moment sign — reads `end`, not a hardcoded +y.
// - Velocities u (surge), v (sway) are in the boat frame; r (yaw rate) is
//   in rad/s.
// - Roll: `phi` (rad) and `p` (rad/s), defined about the PHYSICAL hull
//   longitudinal axis — positive phi means the AMA SIDE RISING. Because
//   this is a physical-frame quantity (unlike heading/u/v/r, which are
//   active-bow-frame and rotate at a shunt), phi and p are UNCHANGED at a
//   shunt swap — see core/shunt.js.
// - Sheet constraint: the sail is controlled by TWO separate things.
//   `controls.sheet` is an INPUT — the MAXIMUM yard angle (delta_max) the
//   sailor allows, [0, ~90deg], eased sheet = larger limit. `state.delta`
//   is the yard's ACTUAL angle (boat-frame magnitude, >=0), a real piece of
//   STATE that relaxes toward its equilibrium at a bounded slew rate
//   (core/sheet.js) — you cannot push on a rope, so the sheet can only ever
//   LIMIT delta from above, never command it directly. delta is left
//   unchanged at a shunt swap because nothing in the swap transform touches
//   it, not because of a frame argument: the yard is not bolted to a fixed
//   physical side, it swings to whichever side the wind demands (up to the
//   end-aware chordAngle = end*delta — see aero.js).
// - Heave: `z` (m) and `w` (m/s), the 5th DOF (S8, docs/work-order-2026-08-02-
//   steering-and-sources.md). z is vertical displacement from the DESIGN
//   waterline, positive = UP (riding higher, less draft than design); w =
//   dz/dt. Like phi/p, this is a world-vertical, physical-frame quantity —
//   unaffected by heading and left unchanged at a shunt swap.
// - Moments: positive = counterclockwise rotation (top-down view).
// - Sail angle of attack and leeway angle are always computed via atan2,
//   never asin/acos.
// - SI units everywhere inside the core; knots only in the presentation
//   layer (export.js / UI).

export function createInitialState(config) {
  return {
    t: 0,
    x: 0,
    y: 0,
    heading: Math.PI / 2, // pointing north by default
    u: 0,
    v: 0,
    r: 0,
    phi: 0,
    p: 0,
    z: 0, // heave: vertical displacement from the design waterline [m], +up
    w: 0, // heave rate [m/s], dz/dt
    delta: 0, // actual yard angle [rad], >=0 — see sheet-constraint comment above
    end: 1,
    amaLoad: 0,
    abackTimer: 0,
    capsized: false,
    shunt: { phase: 'none', progress: 0 },
  };
}

export function createDefaultControls() {
  return {
    // World frame is X east / Y north with angles CCW from +X, so Math.PI is
    // the direction the wind comes FROM = west, blowing toward the east.
    windDirFrom: Math.PI,
    windSpeed: 6,
    sheet: 0, // MAXIMUM yard angle delta_max [rad], >=0 — NOT the actual yard angle, see state.delta
    rudder: 0,
    // A steering oar's natural resting state is SHIPPED — lifted clear of the
    // water, not centered (see core/rudder.js). Only ui/app.js consumes these
    // defaults; the harness and the polar build their own control objects, and
    // the sweep genuinely needs the oar down to hold course.
    rudderUp: true, // steering oar shipped (out of the water) — see core/rudder.js
    brailLee: 0,
    brailWind: 0,
    crewPos: 0,
    crewPosX: 0, // fore-aft crew position, -1..1
    // tackX: fore-aft position of the rig's tack, -1..1, referenced to the
    // ACTIVE bow (+1 = toward it). This is how an Oceanic lateen actually
    // steers — see core/aero.js's xCE geometry and docs/adr/0011. 0 is
    // neutral, where the term contributes exactly zero.
    tackX: 0,
    // The rigging controls the manual's own list names (AC-6.3). 1/1/0 is the
    // normal sailing state — hoisted to the masthead, mast held upright — and
    // there every term the rig geometry adds is exactly zero (docs/adr/0019,
    // 0020).
    //   halyard: 1 = yard peaked at the masthead, 0 = fully eased (yard falls,
    //   its CE drops and moves aft -> weather helm; AC-5.1a).
    //   shroud:  1 = mast upright, 0 = fully slack (mast falls to LEEWARD,
    //   away from the ama it is anchored to -> an off-centre drive force that
    //   yaws the bow to windward; AC-5.1b).
    //   stays:   fore-aft rake, -1..+1 about an upright mast. +1 rakes the
    //   masthead toward the ACTIVE BOW, carrying the CE forward -> lee helm;
    //   -1 rakes it aft -> weather helm.
    //     Separate from the shroud because the boat rigs them separately: the
    //   PJOA FOLK plans draw the shroud as one line to the ama and the stays
    //   as a fore-and-aft pair with their own tensioner.
    halyard: 1,
    shroud: 1,
    stays: 0,
    shuntRequest: false,
  };
}
