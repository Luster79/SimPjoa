// state.js — state shape, initial state, coordinate conventions.
//
// CONVENTIONS (mandatory, see ARCHITECTURE_physics_core_EN.md):
// - World frame: X east, Y north; angles in RADIANS, measured from the X
//   axis counterclockwise (mathematical convention).
// - Wind direction is given as "blowing from" (meteorological) at the
//   controls boundary; it is converted ONCE, at input, to a "blowing
//   towards" vector (see aero.js: apparentWind). Only vectors are used
//   inside the core after that point.
// - Boat frame: x axis along the hull towards the ACTIVE bow, y axis
//   towards the ama (ama always at positive y). After a shunt the x axis
//   reverses direction — state.heading holds the world-frame direction of
//   the active bow, state.end (+1/-1) holds which physical hull end is
//   currently the bow.
// - Velocities u (surge), v (sway) are in the boat frame; r (yaw rate) is
//   in rad/s.
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
    yardAngle: 0,
    rudder: 0,
    brailLee: 0,
    brailWind: 0,
    crewPos: 0,
    shuntRequest: false,
  };
}
