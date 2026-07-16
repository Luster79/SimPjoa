// sheet.js — the one-sided sheet constraint on the yard
// (EXTENSION_round5_sheet_constraint.md R5-1): you cannot push on a rope.
// `controls.sheet` sets only the MAXIMUM yard angle delta_max; the yard's
// ACTUAL angle `state.delta` (a real piece of state, >=0) chases its
// aerodynamic equilibrium — clamped to that ceiling — at a bounded slew
// rate. See state.js's Conventions comment for the field definitions.
//
// Derivation of deltaAlign (verified numerically, not just derived — see
// the round-5 investigation): aero.js computes the chord-flow angle as
// alpha = chordAngle - awAngle, where chordAngle = end*delta and awAngle =
// apparentWind(...).angleToBoat (the "blowing towards" angle, boat frame).
// The yard is edge-on to the wind (fully weathervaned/luffing, zero AoA
// either face) whenever alpha is a multiple of PI. For delta>=0 there are
// two candidate solutions per period: chordAngle=awAngle (needs a NEGATIVE
// delta on this rig whenever the wind isn't already from dead ahead of the
// -end side — unreachable) and chordAngle=awAngle+PI (the reachable one:
// solving for delta gives end*(awAngle+PI), confirmed by probe to land at
// a positive, in-range value across normal points of sail). Only the
// second branch is physically reachable by a yard that can't swing past
// dead centerline in the "wrong" direction, so that's the one used here.
//
// clamp(deltaAlign, 0, delta_max) alone reproduces all three regimes from
// the extension request without any special-casing:
//   - deltaAlign > delta_max: sheet is the binding constraint -> delta
//     rests at delta_max, taut, normal drive (regime a).
//   - deltaAlign in [0, delta_max]: the wind itself is the binding
//     constraint -> delta settles exactly at deltaAlign, alpha exactly
//     +-PI, CL~0 -- full weathervane/luffing (regime b).
//   - deltaAlign < 0 (wind crossed to the leeward side): clamps to 0 ->
//     the yard rests against the mast, backwinded, alpha<0 (regime c).

import { apparentWind } from './aero.js';

const DEG = Math.PI / 180;
function normalizeAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// deltaAlign(state, controls) -> unclamped delta [rad] that puts the yard
// chord edge-on to the apparent wind. NOT clamped to [0, delta_max] -- the
// sign/magnitude of the raw value is what selects the regime (see header).
export function deltaAlign(state, controls) {
  const aw = apparentWind(state, controls);
  return normalizeAngle(state.end * (aw.angleToBoat + Math.PI));
}

// effectiveDeltaMax(state, controls, config) -> the sheet ceiling actually
// in force this instant. Released to config.sail.deltaMaxReleaseDeg while a
// shunt is easing the sheet (phases 'ease'/'transfer'/'swap' — R5-1 point
// 3: this is what lets the yard swing freely to flip sides during a
// shunt), and closed back to the commanded controls.sheet once 'sheet'
// starts hauling it back in.
export function effectiveDeltaMax(state, controls, config) {
  const commanded = clamp(Math.abs(controls.sheet ?? 0), 0, Math.PI / 2);
  const phase = state.shunt?.phase;
  if (phase === 'ease' || phase === 'transfer' || phase === 'swap') {
    return config.sail.deltaMaxReleaseDeg * DEG;
  }
  return commanded;
}

// sheetStep(state, controls, config, dt) -> { delta } patch. delta relaxes
// toward delta_eq = clamp(deltaAlign, 0, effectiveDeltaMax) at a bounded
// slew rate (config.sail.yardSwingRateDegPerSec) -- "a swinging yard, not a
// teleport": a sail slamming from backwinded delta_max down to the mast
// takes real time, during which aero.js computes forces at the ACTUAL
// (in-transit) delta every substep, so the resulting yaw/heel impulse
// emerges from the existing force path rather than being scripted.
export function sheetStep(state, controls, config, dt) {
  const deltaMax = effectiveDeltaMax(state, controls, config);
  const align = deltaAlign(state, controls);
  const deltaEq = clamp(align, 0, deltaMax);
  const maxStep = config.sail.yardSwingRateDegPerSec * DEG * dt;
  const diff = deltaEq - state.delta;
  const delta = Math.abs(diff) <= maxStep ? deltaEq : state.delta + Math.sign(diff) * maxStep;
  return { delta };
}

// isLuffing(state, controls, config) -> bool, delta held below the
// (effective) sheet ceiling by the wind rather than by the sheet itself —
// UI "LUFFING" indicator and aero.js's flogging-drag term both read this.
export function isLuffing(state, controls, config) {
  const deltaMax = effectiveDeltaMax(state, controls, config);
  return state.delta < deltaMax - 2 * DEG;
}
