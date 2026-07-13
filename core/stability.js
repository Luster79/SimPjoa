// stability.js — simplified heel/roll: ama-load statics and the aback/capsize
// state machine. Full roll dynamics are out of scope (per the prompt); the
// ama load is a static moment-balance indicator instead.

// Sustained aback time before capsize (see acceptance criterion 3). Not
// threaded through CONFIG because updateAback's signature (per the
// architecture doc) takes no config argument — keep it a local constant.
const ABACK_CAPSIZE_TIME_S = 6;

// computeAmaLoad(heelMoment, crewPos, config) -> amaLoad
//   amaLoad = heeling demand / righting capacity. 0 = upright, 1 = ama at
//   the point of lifting clear of the water, >1 = ama flying (overloaded).
export function computeAmaLoad(heelMoment, crewPos, config) {
  const { ama, crew, g } = config;
  const halfSpacing = ama.spacing / 2;

  const buoyancyMoment = ama.maxBuoyancy * g * halfSpacing;
  const crewMoment = crew.mass * g * crewPos * halfSpacing;
  const restoringCapacity = Math.max(buoyancyMoment + crewMoment, 1);

  return Math.abs(heelMoment) / restoringCapacity;
}

// updateAback(state, awAngle, dt) -> { abackTimer, capsized }
//   awAngle: apparent-wind "blowing towards" angle in the boat frame (see
//   aero.js: apparentWind().angleToBoat). sin(awAngle) > 0 means the wind is
//   blowing towards +y (the ama side) — i.e. it originates from the hull's
//   -y side, which means the ama (at +y) has crossed to leeward: aback.
export function updateAback(state, awAngle, dt) {
  const isAback = Math.sin(awAngle) > 0;
  const abackTimer = isAback ? state.abackTimer + dt : 0;
  const capsized = state.capsized || abackTimer > ABACK_CAPSIZE_TIME_S;
  return { abackTimer, capsized };
}
