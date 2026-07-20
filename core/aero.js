// aero.js — crab-claw sail aerodynamics: apparent wind, Polhamus-based
// CL/CD (table + camber + brails), and resulting boat-frame forces/moments.
//
// Angle-of-attack sign convention (derived once here, used throughout):
//   The yard/boom trims to the side opposite the ama (leeward), but the
//   chord DIRECTION VECTOR used to measure alpha is
//   `chordAngle = end * state.delta` (end-aware since
//   FIX_REQUEST_round3_worldframe.md R3-1 — see state.js: the ama sits at
//   boat-frame y-side `end`, not always +y, so "leeward" is the -end side
//   and the chord's sign must track it). `state.delta` is the yard's
//   ACTUAL angle — a real piece of state that relaxes toward its
//   aerodynamic equilibrium under a one-sided sheet constraint (R5-1,
//   core/sheet.js); the sheet (`controls.sheet`) only ever LIMITS it from
//   above; forces here are always computed at the current, physical
//   `state.delta`, never at the commanded sheet limit directly. At end=+1
//   this reduces to the original `+delta`, which — given the chirality of
//   the awChordX/awChordYcw rotation below — is what makes alpha reduce to
//   the sailor's angle of attack (apparent wind angle minus sheeting
//   angle), signed so that a well-trimmed course (chord swept less than
//   the apparent wind angle) gives positive alpha and positive driving
//   force. An earlier version used `-|yardAngle|` unconditionally, which silently
//   flipped the sign of CL relative to the fixed lift-direction convention
//   below (see the L/D decomposition): since drag direction is fixed by the
//   flow alone, flipping only CL's sign flips whether lift adds to or
//   fights the drag component of Fx — that reversal, not a folding
//   artefact, was the actual bug (verified numerically:
//   FIX_REQUEST_step1_review.md CRITICAL-2). At end=-1 the whole geometry
//   is a mirror image (ama and chord both reflected through the x axis),
//   so alpha (and hence CL's sign, and hence Fy/heelMoment's sign) mirrors
//   too — this is what lets stability.js interpret `heelMoment * end` with
//   a single, end-invariant sign convention instead of assuming +y.
//   alpha itself is the RAW atan2 result (no reflection/fold) so it stays a
//   true signed angle of attack across the full (-180, 180] range; a
//   genuinely backwinded sail (|alpha| > 90 deg, flow on the leech side —
//   e.g. aback) is handled explicitly in sailCoefficients() by mirroring
//   only the CL/CD table lookup magnitude, not by reflecting alpha itself.

import { polhamusAR, polhamusKp, polhamusKv, polhamusCL } from './config.js';
import { clrXPosition } from './hydro.js';

const DEG = Math.PI / 180;
// Flogging-drag window (R5-1): how close to a genuine zero-AoA weathervane
// (alphaAbsDeg -> 0) the extra flutter drag ramps in over — see
// sailCoefficients().
const LUFF_WINDOW_DEG = 8;

export function apparentWind(state, controls) {
  const { windDirFrom, windSpeed } = controls;
  const { u, v, heading } = state;

  // True wind "blowing towards" vector, world frame.
  const windWx = -Math.cos(windDirFrom) * windSpeed;
  const windWy = -Math.sin(windDirFrom) * windSpeed;

  // Boat velocity, world frame.
  const boatWx = u * Math.cos(heading) - v * Math.sin(heading);
  const boatWy = u * Math.sin(heading) + v * Math.cos(heading);

  const awWx = windWx - boatWx;
  const awWy = windWy - boatWy;

  // Rotate into the boat frame (inverse rotation by heading).
  const vx = awWx * Math.cos(heading) + awWy * Math.sin(heading);
  const vy = -awWx * Math.sin(heading) + awWy * Math.cos(heading);

  const speed = Math.hypot(vx, vy);
  const angleToBoat = Math.atan2(vy, vx); // "blowing towards" angle, boat frame

  return { vx, vy, speed, angleToBoat };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function interpTable(alphaAbsDeg, table) {
  const { alphaDeg, CL } = table;
  const a = Math.min(Math.max(alphaAbsDeg, alphaDeg[0]), alphaDeg[alphaDeg.length - 1]);
  // grid is uniform (2 deg steps); binary-search-free direct index is fine here.
  let i = 0;
  while (i < alphaDeg.length - 2 && alphaDeg[i + 1] < a) i++;
  const t = (a - alphaDeg[i]) / (alphaDeg[i + 1] - alphaDeg[i] || 1);
  return lerp(CL[i], CL[i + 1], t);
}

function blendApexCL(apexDeg, alphaAbsDeg, aeroTable) {
  const apexKeys = Object.keys(aeroTable).map(Number).sort((a, b) => a - b);
  const lo = apexKeys[0], hi = apexKeys[apexKeys.length - 1];
  const clampedApex = Math.min(Math.max(apexDeg, lo), hi);
  const w = (clampedApex - lo) / (hi - lo || 1);
  const clLo = interpTable(alphaAbsDeg, aeroTable[lo]);
  const clHi = interpTable(alphaAbsDeg, aeroTable[hi]);
  return lerp(clLo, clHi, w);
}

function camberCLFactor(alphaAbsDeg, camber) {
  if (alphaAbsDeg <= 30) return 1 + 1.75 * camber;
  if (alphaAbsDeg >= 45) return 1.0;
  const t = (alphaAbsDeg - 30) / 15;
  return lerp(1 + 1.75 * camber, 1.0, t);
}

function smoothstep01(t) {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}

// brailRegimeBlend (round 10c, C1, ROUND10c_carrot_two_regime.md): the
// manual's windward brail has two real roles the old single linear cut
// conflated — TRIM (partial pull, b in [0, trimRange]: deepens the belly,
// sail keeps drawing) and SURVIVAL (b in (trimRange, 1]: spills power,
// panic/furl territory). Each regime is a plain lerp from its own two
// endpoint values, but the interpolation PARAMETER is smoothstep(t) rather
// than raw t — smoothstep's derivative is exactly 0 at both t=0 and t=1,
// so the two regimes' curves meet at b=trimRange with matching VALUE (both
// evaluate valAtTrim there) AND matching slope (0 from both sides): a
// single brailTrimRange knob is enough to get a smooth (no-kink) join
// without a separate blend-width parameter. Used for the CL and heel-
// moment multipliers below, and for the trim-regime camber bonus.
function brailRegimeBlend(b, trimRange, valAtZero, valAtTrim, valAtOne) {
  const bc = Math.min(Math.max(b, 0), 1);
  if (trimRange <= 0) return lerp(valAtTrim, valAtOne, smoothstep01(bc));
  if (trimRange >= 1) return lerp(valAtZero, valAtTrim, smoothstep01(bc));
  if (bc <= trimRange) return lerp(valAtZero, valAtTrim, smoothstep01(bc / trimRange));
  return lerp(valAtTrim, valAtOne, smoothstep01((bc - trimRange) / (1 - trimRange)));
}

// sailCoefficients(alpha, controls, config) -> { CL, CD }
// alpha: signed angle of attack [rad], raw atan2 range (-pi, pi]. |alpha| up
// to 90deg is the sail's front face working normally; beyond that the flow
// is on the leech side (genuinely backwinded, e.g. aback) — the two-sided
// flat-plate table is looked up at the mirrored angle (180deg - |alpha|)
// since the CL/CD magnitude is symmetric about a full chord flip, while the
// sign (below) still comes from alpha itself, so which way the resulting
// force pushes is unaffected by this mirroring.
export function sailCoefficients(alpha, controls, config) {
  const { sail } = config;
  const rawAbsDeg = Math.abs(alpha) / DEG;
  const alphaAbsDeg = rawAbsDeg <= 90 ? rawAbsDeg : 180 - rawAbsDeg;
  const alphaAbsRad = alphaAbsDeg * DEG;

  const CLtable = blendApexCL(sail.apexAngleDeg, alphaAbsDeg, config.aeroTable);
  // Runtime CD reconstruction with the tunable partial-suction factor
  // (see config.js header comment for why this isn't read from the CSV).
  const CDbase = sail.CD0 + sail.s * CLtable * Math.tan(Math.min(alphaAbsRad, 89.9 * DEG));

  // Flogging drag (R5-1, regime b): a real luffing sail flutters, adding
  // unsteady-flow drag beyond what a static flat plate at the same
  // (near-zero) AoA would cost. Ramped in only within a narrow window
  // around alphaAbsDeg=0 — the genuine weathervane/luffing condition —
  // fading linearly to 0 by LUFF_WINDOW_DEG so normal, loaded trims
  // (regime a, and regime c's backwinded-but-pressed condition, both of
  // which read a much larger alphaAbsDeg) are untouched.
  const luffFrac = Math.max(0, 1 - alphaAbsDeg / LUFF_WINDOW_DEG);
  const floggingCD = sail.floggingCDFactor * sail.CD0 * luffFrac;

  const brailLee = controls.brailLee ?? 0;
  const brailWind = controls.brailWind ?? 0;
  const brailTrimRange = sail.brailTrimRange ?? 0.6;

  // Trim-regime camber bonus (C1): the manual's partial windward-brail
  // technique bags the remaining draft, not just spills area — peaks at
  // brailTrimRange (full TRIM pull), fades back to sail.camber's own
  // baseline by brailWind=1 (a fully spilled SURVIVAL sail is gathered,
  // not bagged). Reuses camberCLFactor/camberCDf unchanged (see
  // sail.brailCamberGain's config.js comment for that mechanism's own
  // alphaAbsDeg>=45deg ceiling).
  const brailCamberGain = sail.brailCamberGain ?? 0;
  const camberEff = sail.camber + brailRegimeBlend(brailWind, brailTrimRange, 0, brailCamberGain, 0);

  const camberCLf = camberCLFactor(alphaAbsDeg, camberEff);
  const camberCDf = 1 + 1.0 * camberEff;

  let CL1 = CLtable * camberCLf;
  let CD1 = (CDbase + floggingCD) * camberCDf;

  // Windward-brail CL cut (C1): two-regime, see brailRegimeBlend() above.
  // TRIM (b<=brailTrimRange): mild, x(1-0.15*b_norm) at the endpoint — the
  // sail stays powered, consistent with the manual's downwind chapter.
  // SURVIVAL (b>brailTrimRange): ramps to the original strong cut, x0.2 at
  // b=1 — preserves T6/panic, the stop scenario, and the squall
  // controller's semantics unchanged at full pull.
  const brailWindCLFactor = brailRegimeBlend(brailWind, brailTrimRange, 1, 0.85, 0.2);
  let CL2 = CL1 * (1 - 0.7 * brailLee) * brailWindCLFactor;
  let CD2 = CD1 * (1 - 0.3 * brailLee);

  // Both brails fully on: sail furled against the yard, forces -> spar drag only.
  const furl = brailLee * brailWind;
  const CLf = CL2 * (1 - furl);
  const CDf = CD2 * (1 - furl) + sail.CD0 * furl;

  const sign = alpha >= 0 ? 1 : -1;
  // alphaSailor: the acute angle [0, pi/2] a sailor would call "angle of
  // attack" — the same mirrored magnitude already used for the table
  // lookup above, exposed here so callers don't have to redo the mirror
  // (FIX_REQUEST_step1_round2.md R2-3; see sailForces() for the raw,
  // unmirrored `alpha` this complements).
  return { CL: sign * CLf, CD: CDf, alphaSailor: alphaAbsRad };
}

// sailForces(state, controls, config)
//   -> { Fx, Fy, heelMoment, yawMoment, alpha, alphaSailor, aw }   (Fx, Fy in the boat frame)
//   alpha: raw signed chord-flow angle (-pi, pi], used internally for CL's
//   sign — NOT the sailor's angle of attack (it reads ~140-170deg on normal
//   courses, see aero.js header comment). alphaSailor: the acute [0, pi/2]
//   angle a sailor/UI would call AoA (FIX_REQUEST_step1_round2.md R2-3).
export function sailForces(state, controls, config) {
  const aw = apparentWind(state, controls);
  const delta = Math.abs(state.delta ?? 0); // actual yard angle magnitude, R5-1 — reused below for CE geometry (P1.2)
  const chordAngle = state.end * delta; // chord direction convention, end-aware, see header comment
  const cx = Math.cos(chordAngle), cy = Math.sin(chordAngle);

  // Flow components in the chord frame -> signed angle of attack (raw atan2,
  // no reflection: see header comment and sailCoefficients()).
  const awChordX = aw.vx * cx + aw.vy * cy;
  const awChordYcw = aw.vx * cy - aw.vy * cx; // dot with the chord rotated -90deg
  const alpha = Math.atan2(awChordYcw, awChordX);

  const { CL, CD, alphaSailor } = sailCoefficients(alpha, controls, config);

  const q = 0.5 * config.rho_air * config.sail.area * aw.speed * aw.speed;
  let Fx = 0, Fy = 0;
  if (aw.speed > 1e-6) {
    const xHatX = aw.vx / aw.speed, xHatY = aw.vy / aw.speed; // drag direction
    const yHatX = -xHatY, yHatY = xHatX;                       // lift direction (+90 CCW from flow)
    const D = q * CD, L = q * CL;
    Fx = D * xHatX + L * yHatX;
    Fy = D * xHatY + L * yHatY;
  }

  const fade = shuntForceFade(state.shunt);
  Fx *= fade; Fy *= fade;

  // Roll (4th DOF, FIX_REQUEST_round4_roll_dof.md 1.4): heel foreshortens
  // the sail's projected area.
  const phi = state.phi ?? 0;
  const cosPhi = Math.cos(phi);
  Fx *= cosPhi; Fy *= cosPhi;

  const brailWind = controls.brailWind ?? 0;
  // verticalLiftFraction (round 9, R9-4, ROUND9_physics_fidelity_work_
  // order.md): Marchaj's central claim for the crab claw is that its
  // twisted delta geometry generates substantial VERTICAL (upward) lift
  // via leading-edge vortices — a lot of drive for relatively little
  // heeling moment (the same physical basis the windward-brail mechanism
  // below already uses, just previously only through that one knob). A
  // conservative, tunable reduction of the BASE heel moment, deliberately
  // small: Di Piazza et al. 2014 (also cited by this project) found more
  // modest crab-claw performance than Marchaj, so the magnitude here is
  // genuinely contested — this does NOT touch Fx/Fy (drive/side force),
  // only unloads the heeling arm.
  const verticalLiftFraction = config.sail.verticalLiftFraction ?? 0;
  // Windward-brail heel-moment cut (C1): two-regime, mirroring the CL cut
  // above. TRIM: moderate, x(1-0.3*b_norm) at the endpoint — vertical
  // redirection of the deep belly, sail still drawing. SURVIVAL: ramps to
  // the original strong cut, x0.1 at b=1 (unchanged panic/survival
  // authority).
  const brailTrimRangeHeel = config.sail.brailTrimRange ?? 0.6;
  const brailWindHeelFactor = brailRegimeBlend(brailWind, brailTrimRangeHeel, 1, 0.7, 0.1);
  const heelMoment = Fy * config.sail.CEheight * (1 - verticalLiftFraction) * brailWindHeelFactor;

  // CE geometry — round 7, D-6 (ROUND7_DECISION.md): rebuilt around a
  // classical yacht-design "lead" (the CE-CLR longitudinal separation,
  // a standard order-5-25%-of-waterline-length quantity — Larsson &
  // Eliasson, Principles of Yacht Design) instead of round 5's from-
  // scratch tack/chord geometry. That round-5 model measured the CE
  // directly as a small CG-relative offset (~0.15-0.25m) and got the
  // *scale* of sail-trim-induced steering badly wrong: real Pjoa sail-trim
  // response is slow (owner's field datum, D-6) — the net helm is the
  // SMALL DIFFERENCE of two large, nearly-matched levers (CE and CLR each
  // measured from a common reference, not two independent small numbers),
  // which is precisely why it's insensitive to trim. `hull.lead` anchors
  // that difference directly: xCE's neutral point is the hull's own CLR
  // (hydro.js's clrXPosition, at the neutral crewPosX=0 — moving crew
  // fore-aft shifts the hull's CLR for T2's benefit, it does NOT drag the
  // sail's CE around too, which would cancel that mechanism) plus `lead`.
  //
  // The yard's OWN swing (delta) still moves the CE further, same
  // direction as round 5 (aft along the yard from the tack, landing to
  // leeward) — a real crab-claw's CE does shift with trim, that's the
  // whole reason trimming steers at all — but the excursion is scaled by
  // `sail.ceSwingFraction` (round 7, new tunable, ~0.5): a real, flow-
  // attached aerodynamic center tracks much closer to the leading
  // edge/tack across the practical trim range than the raw geometric
  // half-chord midpoint the round-5 model assumed, so only a FRACTION of
  // the full geometric swing should reach the CE. Empirically landed
  // (D-6's target: 0.3-1.5deg/s steady sail-trim turn rate at TWS 6,
  // 5-15deg over a 10s window) — see harness/asserts.js's T1/T3/T4/T5.
  //
  // P2-3 (brail-induced CE shift). Spilling the sail's rear/upper area
  // (windward brail) gathers the working area of the sail back toward the
  // yard's own pivot (the tack) — physically this shrinks the CE's WHOLE
  // excursion along the yard from that pivot, fore-aft AND lateral, not
  // just its fore-aft component. Round 5-7 originally shrank only x_CE,
  // reasoning that shrinking both "cancels through ceLeverSign" and so
  // only x_CE need move to damp the yaw moment; that was a bookkeeping
  // argument about net magnitude, not a physical one, and round 5's own
  // spilling-line description (gathering the sail toward the yard pulls
  // the pressure centroid inboard/up) applies to both axes. Round 10b
  // (D2) unified them onto the SAME effective half-chord (shrunk by
  // ceBrailShift*brailWind), projected onto cos(delta)/sin(delta)
  // respectively — see ROUND10b_downwind_wall.md and
  // ROUND10b_downwind_wall_findings.md for that before/after measurement.
  //
  // Round 10c (C1) splits xCE and yCE back onto their OWN half-chords:
  // xCE keeps ceBrailShift (the fore-aft "CE shift toward the tack" bear-
  // away lever, unchanged, full strength across brailWind) while yCE gets
  // its own, stronger sail.yceBrailShift — the lateral arm is what
  // directly attacks the deep-course luffing/yaw moment (-yCE*Fx below),
  // which is what this round's carrot fix is actually chasing (see
  // ROUND10c_carrot_two_regime.md C1 and sail.yceBrailShift's config.js
  // comment).
  const chord = config.sail.CEheight / 2;
  const halfChord = chord / 2;
  const lead = config.hull.lead ?? 0.15 * config.hull.length;
  const clrXNeutral = clrXPosition(0, config);
  const ceSwingFraction = config.sail.ceSwingFraction ?? 0.5;
  const ceBrailShift = config.sail.ceBrailShift ?? 0.3;
  const yceBrailShift = config.sail.yceBrailShift ?? 0.6;
  const halfChordEff = halfChord * ceSwingFraction * (1 - ceBrailShift * brailWind);
  const halfChordEffY = halfChord * ceSwingFraction * (1 - yceBrailShift * brailWind);
  const xCE = clrXNeutral + lead - halfChordEff * Math.cos(delta);
  const yCE = -state.end * halfChordEffY * Math.sin(delta);

  // Heel-course coupling (pure geometry, FIX_REQUEST_round4_roll_dof.md
  // 1.4): heeling tips the mast, offsetting the CE laterally by
  // CEheight*sin(phi) toward leeward (i.e. the -end side, away from the
  // ama — see state.js/ARCHITECTURE conventions) for phi>0. A forward
  // (drive) force Fx applied at a lateral offset y produces yaw moment
  // -y*Fx (standard r x F, no x-offset for this term); substituting
  // y = -end*CEheight*sin(phi) gives the end*CEheight*sin(phi)*Fx below.
  // config.hull.yawHeelSign (+-1) is a verified-empirically flip knob —
  // see ARCHITECTURE doc / harness/asserts.js coupling-sign tests. This is
  // a SEPARATE mechanism from the x_CE/y_CE geometry above (mast RAKE
  // under heel vs. the yard's OWN swing angle) and stays additive with it.
  const yawHeelSign = config.hull.yawHeelSign ?? 1;
  const yawMomentHeel = yawHeelSign * state.end * config.sail.CEheight * Math.sin(phi) * Fx;
  // ceLeverSign: history below; CURRENTLY AN IDENTITY (+1) — round 10
  // (R10-4, ROUND10_data_integration.md, docs/adr/0004) re-examined this
  // TODO and found the flip is no longer active. Round 5-7's derivation
  // (CE aft of CG when trimmed-in) gave standard weather-helm physics —
  // the OPPOSITE of the round-4-era Pjoa-manual rule this codebase used
  // to encode ("sheet in bears away"), so ceLeverSign was set to -1 to
  // flip it. The round-9 follow-up (ROUND9_physics_fidelity_findings.md)
  // retired that manual-encoded rule entirely — a structural lee-helm
  // bias at the old lead=15%LWL was masking the boat's REAL behavior;
  // once `lead` was corrected to 5%LWL, the boat genuinely points AND
  // bears away through the sail in the STANDARD (non-inverted) direction
  // (harness/asserts.js's "Sail steers" block) — i.e. the naive,
  // unflipped r x F derivation is what the corrected geometry actually
  // wants, and ceLeverSign now defaults to +1 (config.js), the identity.
  //
  // R10-4 could not go further to a fully from-scratch, assumption-free
  // derivation: Di Piazza 2014 and Flay 2025 (this round's new data)
  // measured FORCE coefficients (sail CL/CD, hull CS), not CE/CLR
  // POSITION — `hull.lead`, `sail.ceSwingFraction`, and `hull.clrXFraction`
  // remain estimated lever-arm geometry, not measured. The sign question
  // is resolved (no active flip); the lever-arm MAGNITUDES are still
  // tunable estimates, same standing TODO, narrower scope.
  const ceLeverSign = config.hull.ceLeverSign ?? 1;
  const yawMoment = ceLeverSign * (xCE * Fy - yCE * Fx) + yawMomentHeel;

  return { Fx, Fy, heelMoment, yawMoment, yawMomentHeel, alpha, alphaSailor, aw, CL, CD };
}

// tableCL(apexDeg, alphaDeg, config) -> raw Polhamus-table CL (no camber/brails)
// exposed for the calibration assertions in harness/asserts.js.
export function tableCL(apexDeg, alphaDeg, config) {
  return blendApexCL(apexDeg, Math.min(Math.abs(alphaDeg), 90), config.aeroTable);
}

function shuntForceFade(shunt) {
  if (!shunt) return 1;
  switch (shunt.phase) {
    case 'ease': return 1 - shunt.progress;
    case 'transfer': return 0;
    case 'swap': return 0;
    case 'sheet': return shunt.progress;
    default: return 1;
  }
}
