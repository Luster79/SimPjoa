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
//   when end=+1, -y when end=-1) — NOT always +y (SPEC ERRATUM,
//   FIX_REQUEST_round3_worldframe.md R3-1: the "ama always at +y"
//   invariant in the original architecture doc forced a swap transform
//   that spun the physical hull 180deg in the world at every shunt; it is
//   deleted). state.end also holds which physical hull end is currently
//   the bow. Every rule phrased in terms of "the ama side" — aback
//   detection, the yard's leeward trim, heel-moment sign — reads `end`,
//   not a hardcoded +y.
// - Velocities u (surge), v (sway) are in the boat frame; r (yaw rate) is
//   in rad/s.
// - Roll: `phi` (rad) and `p` (rad/s) are the 4th DOF
//   (FIX_REQUEST_round4_roll_dof.md Part 1), defined about the PHYSICAL
//   hull longitudinal axis — positive phi means the AMA SIDE RISING.
//   Because this is a physical-frame quantity (unlike heading/u/v/r, which
//   are active-bow-frame and rotate at a shunt), phi and p are UNCHANGED
//   at a shunt swap — see core/shunt.js.
// - Sheet constraint (EXTENSION_round5_sheet_constraint.md R5-1): the sail
//   is controlled by TWO separate things now, not one. `controls.sheet` is
//   an INPUT — the MAXIMUM yard angle (delta_max) the sailor allows, [0,
//   ~90deg], eased sheet = larger limit. `state.delta` is the yard's
//   ACTUAL angle (boat-frame magnitude, >=0), a real piece of STATE that
//   relaxes toward its equilibrium at a bounded slew rate (core/sheet.js) —
//   you cannot push on a rope, so the sheet can only ever LIMIT delta from
//   above, never command it directly. Like phi/p, delta is a physical-yard
//   quantity, not an active-bow-frame one, but since the yard is not
//   bolted to a fixed physical side (it swings to whichever side the wind
//   demands, up to end-aware chordAngle = end*delta — see aero.js), it is
//   left unchanged at a shunt swap same as phi/p purely because nothing in
//   the swap transform touches it, not because of a frame argument.
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
    windDirFrom: Math.PI, // wind from the south by default (blowing towards north)
    windSpeed: 6,
    sheet: 0, // MAXIMUM yard angle delta_max [rad], >=0 (R5-1) — NOT the actual yard angle, see state.delta
    rudder: 0,
    rudderUp: false, // steering oar shipped (out of the water) — see core/rudder.js
    brailLee: 0,
    brailWind: 0,
    crewPos: 0,
    crewPosX: 0, // fore-aft crew position, -1..1 (FIX_REQUEST_round4_roll_dof.md 1.5)
    shuntRequest: false,
  };
}
