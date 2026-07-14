// stability.js — simplified heel/roll: ama-load statics and the aback/
// overload capsize state machine. Full roll dynamics are out of scope (per
// the prompt); the ama load is a static moment-balance indicator instead.

// computeAmaLoad(heelMoment, crewPos, config) -> amaLoad
//   amaLoad = heeling demand / righting capacity. 0 = upright, 1 = ama at
//   the point of lifting clear of the water, >1 = ama flying (overloaded).
//   heelMoment < 0 is the normal proa case: the sail's leeward-pushing side
//   force (see aero.js) lifts the windward ama (+y) clear of the water, and
//   it's the ama's WEIGHT resisting that lift that provides the righting
//   moment. heelMoment > 0 is the reverse, emergency case (e.g. aback): the
//   ama is being pressed DOWN into the water instead, resisted by its
//   BUOYANCY — per the prompt's Stability section.
export function computeAmaLoad(heelMoment, crewPos, config) {
  const { ama, crew, g } = config;
  const halfSpacing = ama.spacing / 2;

  const ballastMoment = heelMoment < 0
    ? ama.mass * g * halfSpacing
    : ama.maxBuoyancy * g * halfSpacing;
  const crewMoment = crew.mass * g * crewPos * halfSpacing;
  const restoringCapacity = Math.max(ballastMoment + crewMoment, 1);

  return Math.abs(heelMoment) / restoringCapacity;
}

// updateAback(state, awAngle, amaLoad, dt, config) -> { abackTimer, overloadTimer, capsized }
//   awAngle: apparent-wind "blowing towards" angle in the boat frame (see
//   aero.js: apparentWind().angleToBoat). sin(awAngle) > 0 means the wind is
//   blowing towards +y (the ama side) — i.e. it originates from the hull's
//   -y side, which means the ama (at +y) has crossed to leeward: aback.
//   Capsize has two independent timer-driven triggers, both configurable
//   (config.stability.{abackCapsizeTime,overloadCapsizeTime}) rather than
//   instantaneous, so a brief gust spike doesn't capsize the boat: sustained
//   aback (per acceptance criterion 3), and sustained ama overload — the
//   ama held above 100% load (flying clear of the water) for too long, per
//   FIX_REQUEST_step1_review.md CRITICAL-1. Note the signature extends the
//   architecture doc's `updateAback(state, awAngle, dt)` with `amaLoad` and
//   `config`: the overload trigger needs both, and per the review's ground
//   rules a required signature change must be made explicitly rather than
//   keeping capsize thresholds as unconfigurable magic constants.
export function updateAback(state, awAngle, amaLoad, dt, config) {
  const { abackCapsizeTime, overloadCapsizeTime } = config.stability;

  const isAback = Math.sin(awAngle) > 0;
  const abackTimer = isAback ? state.abackTimer + dt : 0;

  const isOverloaded = amaLoad > 1.0;
  const overloadTimer = isOverloaded ? state.overloadTimer + dt : 0;

  const capsized = state.capsized
    || abackTimer > abackCapsizeTime
    || overloadTimer > overloadCapsizeTime;

  return { abackTimer, overloadTimer, capsized };
}
