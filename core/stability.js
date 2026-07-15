// stability.js — simplified heel/roll: ama-load statics and the aback/
// overload capsize state machine. Full roll dynamics are out of scope (per
// the prompt); the ama load is a static moment-balance indicator instead.

// computeAmaLoad(heelMoment, crewPos, config, end) -> amaLoad
//   amaLoad = heeling demand / righting capacity. 0 = upright, 1 = ama at
//   the point of lifting clear of the water, >1 = ama flying (overloaded).
//   `end` (default +1) is state.end — needed because heelMoment's sign is
//   expressed in the boat frame (see aero.js), where the ama's side is
//   `end`, not always +y (FIX_REQUEST_round3_worldframe.md R3-1 erratum).
//   heelMoment * end < 0 is the normal proa case: the sail's leeward-
//   pushing side force (see aero.js) lifts the windward ama (the `end`
//   side) clear of the water, and it's the ama's WEIGHT resisting that lift
//   that provides the righting moment. heelMoment * end > 0 is the reverse,
//   emergency case (e.g. aback): the ama is being pressed DOWN into the
//   water instead, resisted by its BUOYANCY — per the prompt's Stability
//   section. At end=+1 this reduces to the original `heelMoment < 0` check.
//   Lever arms are the FULL hull-ama spacing, not half of it: a crew member
//   at crewPos=1.0 stands ON THE AMA (full spacing away from the hull
//   centerline roll axis), and the ama's own weight/buoyancy acts at that
//   same full spacing (FIX_REQUEST_round3_worldframe.md R3-2 erratum — the
//   original prompt's half-spacing formula undersold both levers by 2x).
//   This function returns the RAW value, unbounded — restoringCapacity can
//   be near its 1 N*m floor (e.g. crew ballast almost exactly cancelling
//   ama weight/buoyancy), producing values like 2000+ that are meaningless
//   as a UI percentage but correct as "instant capsize territory" for the
//   overload timer in updateAback() below, which must see the raw value.
//   integrator.js's computeForces() additionally exposes amaLoadDisplay, a
//   copy capped at config.stability.amaLoadDisplayCap, for readouts
//   (FIX_REQUEST_step1_round2.md R2-3) — do not clamp the value here.
export function computeAmaLoad(heelMoment, crewPos, config, end = 1) {
  const { ama, crew, g } = config;

  const ballastMoment = heelMoment * end < 0
    ? ama.mass * g * ama.spacing
    : ama.maxBuoyancy * g * ama.spacing;
  const crewMoment = crew.mass * g * crewPos * ama.spacing;
  const restoringCapacity = Math.max(ballastMoment + crewMoment, 1);

  return Math.abs(heelMoment) / restoringCapacity;
}

// updateAback(state, awAngle, amaLoad, dt, config) -> { abackTimer, overloadTimer, capsized }
//   awAngle: apparent-wind "blowing towards" angle in the boat frame (see
//   aero.js: apparentWind().angleToBoat). sin(awAngle) * state.end > 0 means
//   the wind is blowing towards the ama's side (`end`, not always +y — see
//   FIX_REQUEST_round3_worldframe.md R3-1 erratum and state.js) — i.e. it
//   originates from the hull's non-ama side, which means the ama has
//   crossed to leeward: aback.
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

  const isAback = Math.sin(awAngle) * state.end > 0;
  const abackTimer = isAback ? state.abackTimer + dt : 0;

  const isOverloaded = amaLoad > 1.0;
  const overloadTimer = isOverloaded ? state.overloadTimer + dt : 0;

  const capsized = state.capsized
    || abackTimer > abackCapsizeTime
    || overloadTimer > overloadCapsizeTime;

  return { abackTimer, overloadTimer, capsized };
}
