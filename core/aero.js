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
  // NOTE (block F, work-order-2026-07-30): this blends between the SMALLEST
  // and LARGEST apex keys only — any intermediate columns are ignored. Safe
  // today (the CSV carries exactly two, 45 and 60), but a silent trap if a
  // third apex is ever added: it would be interpolated across, not to. Add a
  // real per-segment interpolation (or an assertion on apexKeys.length===2)
  // before extending the table.
  const lo = apexKeys[0], hi = apexKeys[apexKeys.length - 1];
  const clampedApex = Math.min(Math.max(apexDeg, lo), hi);
  const w = (clampedApex - lo) / (hi - lo || 1);
  const clLo = interpTable(alphaAbsDeg, aeroTable[lo]);
  const clHi = interpTable(alphaAbsDeg, aeroTable[hi]);
  return lerp(clLo, clHi, w);
}

// camberCLFactor (round 10d, C-C, ROUND10d_helm_balance.md): CL multiplier
// for a given ABSOLUTE camber ratio, low-alpha value unchanged since round
// 5 (1+1.75*camber, calibrated against the flat/theoretical v1/Polhamus
// table, where camber=0 genuinely means a flat plate) — see camberCLDelta
// below for the v2-table-relative wrapper callers actually use.
//
// CAMBER_FADE_END_DEG extended 45 -> 75 (was: hard zero above 45deg,
// exactly where deep-course trims live — flagged as a known limitation at
// C1's brailCamberGain, round 10c, and left out of scope there). Sampled
// alphaSailor across the TRIM-regime deep-course scenarios this bonus
// actually targets (D4/C's own TWA140-178 recipes): 32-85deg, i.e. mostly
// PAST the old 45deg cutoff — the camber bonus was silently inactive for
// most of its own intended use case. 75deg (not a flat extension to 90)
// keeps a taper-to-zero near true flat-plate/stalled flow (alpha~90),
// where camber stops being a meaningful attached-flow concept at all —
// empirically chosen to cover the sampled range without claiming
// camber still matters at the most extreme, most-separated angles.
const CAMBER_FADE_END_DEG = 75;
function camberCLFactor(alphaAbsDeg, camber) {
  if (alphaAbsDeg <= 30) return 1 + 1.75 * camber;
  if (alphaAbsDeg >= CAMBER_FADE_END_DEG) return 1.0;
  const t = (alphaAbsDeg - 30) / (CAMBER_FADE_END_DEG - 30);
  return lerp(1 + 1.75 * camber, 1.0, t);
}

// camberCLDelta(alphaAbsDeg, camberDelta, builtinCamber) -> CL multiplier
// relative to the aero TABLE's own baked-in camber, not a flat plate (C-C:
// "the v2 aero table was digitized from ALREADY-CAMBERED rigid sails,
// while the legacy camber machinery still multiplies on top" — the old
// call site fed sail.camber/brailCamberGain straight into camberCLFactor,
// which computes its multiplier RELATIVE TO A FLAT PLATE; on the v2 table
// (already carrying the source sail's own ~1:10 camber, config.js
// AERO_V2_BUILTIN_CAMBER) that double-counts the table's built-in camber
// every time camberDelta is nonzero — i.e. every TRIM-regime brail pull,
// which is exactly the deep-course case this round's other items are
// tuning). Fix: treat camberDelta as ADDITIONAL camber beyond
// builtinCamber, and take the RATIO of the two absolute camberCLFactor
// evaluations, so the table's own baseline cancels out algebraically:
//   ratio = camberCLFactor(alpha, builtin+delta) / camberCLFactor(alpha, builtin)
// At camberDelta=0 this is an exact identity (ratio=1, no change) for ANY
// builtinCamber — matching today's already-correct camberDelta=0 default
// exactly. At builtinCamber=0 (v1, a genuinely flat theoretical table)
// this reduces algebraically to camberCLFactor(alpha, delta)/1, i.e. the
// OLD absolute formula, unchanged — v1's camber semantics (config.js:
// "Only re-enable camber>0 if aeroTableVersion is switched back to v1")
// are untouched by this change.
function camberCLDelta(alphaAbsDeg, camberDelta, builtinCamber) {
  const atBuiltin = camberCLFactor(alphaAbsDeg, builtinCamber);
  const atBuiltinPlusDelta = camberCLFactor(alphaAbsDeg, builtinCamber + camberDelta);
  return atBuiltinPlusDelta / atBuiltin;
}

// camberCDFactor / camberCDDelta (F5, work-order-2026-07-30): the CD analog
// of the two functions above. Round 10d's C-C fix made the CL camber bonus a
// RATIO relative to the table's built-in camber (camberCLDelta), but left the
// CD bonus in the old absolute "relative to a flat plate" form
// (camberCDf = 1 + 1.0*camberEff) — so CD double-counted the camber the v2
// table already carries (its CD0/s are least-squares fits to the SAME
// already-cambered Santa Cruz sail). Same ratio transform closes it: at
// camberDelta=0 an exact identity for any builtinCamber (v2 default
// untouched); at builtinCamber=0 (v1) it reduces to the old 1 + 1.0*delta,
// so v1 CD is bit-identical. The factor has no alpha dependence, matching the
// old camberCDf. Measured effect at brailWind=0.6 (delta=0.45), v2: the CD
// multiplier drops 1.450 -> 1.409.
function camberCDFactor(camber) {
  return 1 + 1.0 * camber;
}
function camberCDDelta(camberDelta, builtinCamber) {
  return camberCDFactor(builtinCamber + camberDelta) / camberCDFactor(builtinCamber);
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
  // KNOWN OFFSET (block F, work-order-2026-07-30): `alpha` here is the
  // GEOMETRIC chord-flow angle, but data/dipiazza_2014_digitized.csv states
  // its alpha is "measured from ZERO-LIFT incidence". A cambered sail has a
  // negative zero-lift angle, so the v2 table is shifted a few degrees in
  // alpha versus this geometric convention (v1/Polhamus has no built-in
  // camber, so it is unaffected). Documented, not yet corrected — a constant
  // alpha offset on the v2 lookup would fix it but moves the whole polar.
  // Runtime CD reconstruction with the tunable partial-suction factor
  // (see config.js header comment for why this isn't read from the CSV).
  //
  // F3a (work-order-2026-07-30): the induced (suction-loss) term is
  // s*CL*tan(alpha), but the table forces CL(90deg)=0 EXACTLY, so at
  // alpha=90 the product collapses (0 * large) and CD drops to CD0 — the
  // broadside, MAXIMUM-drag attitude reporting parasitic drag only. The
  // physical limit as alpha->90 is finite (s*CL_gain*Kv, ~1.03 here), which
  // the 89deg table value already carries. So evaluate the induced term at
  // min(alpha, 89deg): CD holds ~1.07 through 90 instead of collapsing. Only
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
  // not bagged). camberEff is now a DELTA beyond the active table's own
  // built-in camber (round 10d, C-C — see camberCLDelta's own comment for
  // the double-counting this fixes and why camberEff=0 is an unchanged
  // no-op either way).
  const brailCamberGain = sail.brailCamberGain ?? 0;
  const camberEff = sail.camber + brailRegimeBlend(brailWind, brailTrimRange, 0, brailCamberGain, 0);
  const builtinCamber = sail.aeroTableVersion === 'v2' ? (sail.aeroV2BuiltinCamber ?? 0.10) : 0;

  const camberCLf = camberCLDelta(alphaAbsDeg, camberEff, builtinCamber);

  // --- Brail acts through AREA, not through a CL fudge (F4) ---------------
  // A brail GATHERS CLOTH toward the yard. The force that costs is therefore
  // a smaller reference area, which is what areaFactor carries out to
  // sailForces() below. Previously the brails cut CL by opaque multipliers
  // while the reference area stayed at the full sail.area, so partial
  // brailing could ADD total force (measured: +41% at brailWind=0.6, because
  // the camber bonus outran a mild CL cut) — reefing that makes the rig more
  // powerful. Now: area falls monotonically, the TRIM-regime camber bonus
  // (bounded by F6) acts on that REDUCED area, and the survival endpoint
  // (brailWind=1 -> 0.20) is chosen to land near the old CL x0.2 cut so the
  // T6/stop/squall semantics that were calibrated at full pull are preserved.
  const areaWindFactor = brailRegimeBlend(brailWind, brailTrimRange, 1, sail.areaAtTrimBrail, sail.areaAtFullBrail);
  const areaLeeFactor = 1 - (1 - sail.areaAtFullLeeBrail) * brailLee;
  const furl = brailLee * brailWind;
  const areaFactor = areaWindFactor * areaLeeFactor;

  const CLf = CLtable * camberCLf * (1 - furl);

  // --- CD: parasitic + induced(WORKING CL) + separation (F7, F3a) ---------
  // Replaces the suction-loss form CD0 + s*CLtable*tan(alpha), which had
  // three faults: it was driven by the TABLE CL (so induced drag ignored what
  // the sail was actually producing once brails/camber had modified it), it
  // has a pole at alpha=90, and there CLtable=0 exactly, collapsing CD to
  // CD0 in the maximum-drag broadside attitude. The replacement is the
  // standard decomposition:
  //     CD = CD0 + k*CL^2 + CD90*sin^4(alpha) + parasitic-from-gathering
  // - induced now depends on the WORKING CL, so the polar stays a polar;
  // - no pole, and the separation term makes broadside genuinely draggy;
  // - camber's drag cost arrives automatically via its own CL rise, so the
  //   separate camberCDf multiplier (F5) is subsumed and gone.
  // Constants are a least-squares fit to Di Piazza's four measured Santa Cruz
  // (CL,CD) pairs PLUS their reported L/D_max ~5.4 as a fifth constraint —
  // the four pairs alone leave alpha<20deg unconstrained and let peak L/D run
  // to 7.6. See docs/adr/0007 for the fit and its residuals.
  const gatherCD = (sail.brailParasiticCD ?? 0) * Math.max(brailLee, brailWind);
  const CDf = sail.CD0
    + sail.inducedK * CLf * CLf
    + sail.CDbroadside * Math.pow(Math.sin(alphaAbsRad), 4)
    + gatherCD
    + floggingCD;

  const sign = alpha >= 0 ? 1 : -1;
  // alphaSailor: the acute angle [0, pi/2] a sailor would call "angle of
  // attack" — the same mirrored magnitude already used for the table
  // lookup above, exposed here so callers don't have to redo the mirror
  // (FIX_REQUEST_step1_round2.md R2-3; see sailForces() for the raw,
  // unmirrored `alpha` this complements).
  return { CL: sign * CLf, CD: CDf, alphaSailor: alphaAbsRad, areaFactor };
}

// sailForces(state, controls, config)
//   -> { Fx, Fy, heelMoment, yawMoment, alpha, alphaSailor, aw }   (Fx, Fy in the boat frame)
//   alpha: raw signed chord-flow angle (-pi, pi], used internally for CL's
//   sign — NOT the sailor's angle of attack (it reads ~140-170deg on normal
//   courses, see aero.js header comment). alphaSailor: the acute [0, pi/2]
//   angle a sailor/UI would call AoA (FIX_REQUEST_step1_round2.md R2-3).
// windageForce(state, controls, config) -> { Fx, Fy } in the boat frame.
//
// F15 (work-order-2026-07-30, docs/adr/0008). `grep -rn "rho_air" core/`
// returned exactly TWO hits before this: the constant's definition and the
// sail's own dynamic pressure. Nothing else in the model felt the air at all —
// no hull topsides, no crew, no mast, no spars.
//
// Two consequences, both real:
//   - A furled rig had only the sail's own residual CD standing in for the
//     whole boat's air drag.
//   - shuntForceFade() returns EXACTLY 0 through the 'transfer' and 'swap'
//     phases, which is 8.4 s of a 16.4 s shunt. Fading the sail's LIFT there
//     is right (the rig is being carried across, not working), but with no
//     windage the boat felt no air force whatever while lying beam-on with a
//     flogging rig — so the most exposed moment of the whole manoeuvre was
//     safe by construction. This term is deliberately NOT faded, so it stays
//     through the shunt.
//
// Applied along the apparent wind, i.e. pure drag on the above-water body. It
// is not always a retarding force: on a broad reach the apparent wind has a
// forward component and windage pushes the boat along, which is the physically
// correct behaviour and the reason it belongs in Fx/Fy rather than in the
// resistance term.
export function windageForce(state, controls, config) {
  const { windageArea, windageAreaFrontal, windageCD } = config.hull;
  if (!windageArea || !windageCD) return { Fx: 0, Fy: 0 };
  const aw = apparentWind(state, controls);
  if (aw.speed < 1e-6) return { Fx: 0, Fy: 0 };
  // The exposed area depends on which way the air meets the boat: end-on it
  // sees a bow, a mast section and a crew member; beam-on it sees the whole
  // topside. Interpolating on sin^2 of the apparent-wind angle is the usual
  // treatment and matters a lot here — using the beam-on figure at every
  // angle overstates windage worst exactly where the apparent wind is
  // strongest (close-hauled), which measured as a 21-33% speed loss upwind
  // before this was added.
  const sinA = Math.sin(aw.angleToBoat);
  const areaEff = windageAreaFrontal + (windageArea - windageAreaFrontal) * sinA * sinA;
  const q = 0.5 * config.rho_air * areaEff * windageCD * aw.speed;
  // q already carries one power of speed; multiplying by the velocity
  // COMPONENTS below supplies the second and the direction at once.
  return { Fx: q * aw.vx, Fy: q * aw.vy };
}

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

  const { CL, CD, alphaSailor, areaFactor } = sailCoefficients(alpha, controls, config);

  // Reference area is the EFFECTIVE (brail-reduced) area, not the full sail
  // (F4): a brail gathers cloth, so the working area shrinks. areaFactor is
  // 1 with both brails off, so an unbrailed rig is unchanged.
  const q = 0.5 * config.rho_air * config.sail.area * areaFactor * aw.speed * aw.speed;
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
  // the sail's projected area — the apparent wind's projection onto the
  // (tilted) sail plane. This gives the force IN THE SAIL PLANE.
  const phi = state.phi ?? 0;
  const cosPhi = Math.cos(phi);
  Fx *= cosPhi;
  // F11 (work-order-2026-07-30): keep the in-plane transverse force as its
  // own quantity. The old code applied ONE cos(phi) and then used the result
  // as both the horizontal side force AND the heeling force, which cannot
  // both be right: the rig tilts with the boat, so the in-plane transverse
  // force splits into a HORIZONTAL component (a second cos(phi) — this is
  // what loads the hull and drives leeway) and a VERTICAL one (sin(phi) —
  // previously absent from the model entirely). Measured before this change:
  // Fy and heelMoment scaled identically with cos(phi), so at 40deg heel the
  // hull's side loading was overstated by 1/cos(40) = 30%.
  // Fx (fore-aft) is unaffected by roll about the fore-aft axis, so it keeps
  // the single projection.
  const FyInPlane = Fy * cosPhi;
  Fy = FyInPlane * cosPhi;
  // Vertical component. There is no heave DOF, so this is NOT fed into the
  // dynamics — it is exposed through forcesBreakdown() so the vertical
  // balance the model does not close is VISIBLE and measurable rather than
  // silently missing (see README "Known simplifications"). Measured on the
  // post-block-B rig: ~8% of displacement at 40deg heel (the audit predicted
  // ~16% against the pre-block-B sail, which made roughly twice the force).
  const Fz = FyInPlane * Math.sin(phi);

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
  // F12 (work-order-2026-07-30): the heeling COUPLE is the sail's side force
  // against the hull's hydrodynamic reaction, so the arm is the distance
  // between them — CE height above the water PLUS the CLR's depth below it,
  // not the CE height alone. At CEheight 2.0 and clrDepth 0.35 that is +18%.
  //   The work order offers an equivalent formulation (leave the sail arm at
  // CEheight and add explicit heel moments from hullSide.Fy and rudder.Fy at
  // their own depths). That is deliberately NOT taken yet: the rudder still
  // produces ~2.2 kN at 6 kn (F9, not yet fixed), and coupling that into roll
  // now would inject a heel moment comparable to the ama's entire righting
  // capacity — a spurious effect driven by a known bug. Revisit after F9.
  //   F11: the heeling force is the IN-PLANE transverse force, not the
  // twice-projected horizontal one.
  // --- Vertical rig geometry (docs/adr/0019) -------------------------------
  // Three of the manual's techniques work through the halyard and the shroud
  // and through nothing else, and with CEheight a constant the model could
  // answer none of them (AC-4.4, AC-5.1a, AC-5.1b were all NOT REPRESENTABLE).
  //
  // The halyard sets the YARD's inclination. Hauled to the masthead the yard
  // peaks up and its CE rides high and well forward, toward the tack; eased,
  // the yard falls, and its CE drops AND swings aft -- which is the manual's
  // stated weather-helm cause. One radius, derived so that full hoist
  // reproduces the nominal CEheight exactly (config.js sail.yardCERadius).
  //
  // The shroud runs to the ama, so slackening it lets the mast fall away from
  // the ama -- to LEEWARD -- and aft. The manual describes standing the mast
  // up as one action ("loosened backstay + shortened shroud"), so one angle
  // drives both senses; splitting them would be a control the manual does not
  // give.
  //
  // At halyard = shroud = 1 every term here is exactly zero and the geometry
  // is what it was before this block existed. hull.lead, ceSwingFraction and
  // clrXFraction are untouched.
  const DEGR = Math.PI / 180;
  const halyard = Math.max(0, Math.min(1, controls.halyard ?? 1));
  const shroud = Math.max(0, Math.min(1, controls.shroud ?? 1));
  const yardPeak = (config.sail.yardPeakAngleDeg ?? 60) * DEGR;
  const yardPsi = yardPeak - (config.sail.halyardDropDeg ?? 0) * DEGR * (1 - halyard);
  const yardR = config.sail.yardCERadius ?? (config.sail.CEheight / Math.sin(yardPeak));
  const mastRake = (config.sail.mastRakeMaxDeg ?? 0) * DEGR * (1 - shroud);
  // Fore-aft rake is its OWN rigging (docs/adr/0020): the plans draw the
  // shroud as one line to the ama and the stays as a fore-and-aft pair with
  // their own tensioner. Signed, so the mast can be raked FORWARD -- the
  // classical cure for weather helm, which ADR 0019's single angle could not
  // express because it only ever leaned the mast aft.
  const stays = Math.max(-1, Math.min(1, controls.stays ?? 0));
  const stayRake = (config.sail.stayRakeMaxDeg ?? 0) * DEGR * stays;
  // Height of the CE above the water: up the yard, then tipped by both rakes.
  const CEheightEff = yardR * Math.sin(yardPsi) * Math.cos(mastRake) * Math.cos(stayRake);
  // Fore-aft: only the CHANGE from full hoist, so the baseline lever that
  // `lead` anchors is untouched (the same discipline as the AC-3 swing).
  const xHalyard = -yardR * (Math.cos(yardPsi) - Math.cos(yardPeak));
  // Positive stays rake the masthead toward the ACTIVE BOW, so the CE moves to
  // +x. No `end` factor: the boat frame's +x already points at the active bow,
  // which is the trap the steering oar's lever arm fell into (docs/adr/0016).
  // The sailor re-tensions the stays at each shunt, so a control that means
  // "rake toward the bow" is the right thing to reference to the active bow.
  const xRake = CEheightEff * Math.sin(stayRake);
  // Laterally it falls to LEEWARD, the -end side (the ama is windward and the
  // shroud runs to it), so this one DOES carry `end`.
  const yRake = -state.end * CEheightEff * Math.sin(mastRake);

  const heelArm = CEheightEff + (config.hull.clrDepth ?? 0);
  const heelMoment = FyInPlane * heelArm * (1 - verticalLiftFraction) * brailWindHeelFactor;

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
  // tackX (S2, work-order-2026-08-02): the rig's own fore-aft position, the
  // steering control this model did not have. On an Oceanic lateen the tack
  // travels along the hull and the mast's rake is adjustable, so the CE moves
  // longitudinally by a real distance — Dierking has the yard's heel sliding
  // under the gunwale on an endless tack line, and Proafile notes that a
  // fixed-halyard bridle "removes some of the flexibility of moving the
  // centre of effort, both fore and aft and vertically", i.e. designers treat
  // the movable CE as a feature they can choose to give up. Before this, the
  // whole helm balance rested on the single constant `lead`, and the lever
  // (xCE - clrX) could not reach zero at any trim: `lead` (0.33 m) exceeds
  // the entire trim-driven excursion (halfChordEff, 0.25 m), so the
  // expression was positive by construction.
  //
  // Sign: NO `end` factor (docs/adr/0023). The boat frame's +x already points
  // at the ACTIVE bow, so "the tack hauled toward the bow" is +x on BOTH ends
  // and the offset is just tackX*tackTravel. This line carried a spurious
  // `state.end` for exactly the reason the steering oar's lever arm did
  // (docs/adr/0016), and the comment that used to sit here argued for it in
  // the same words -- "the tack walks to the new bow, so it flips with end" --
  // which confuses the tack moving to the other end of the HULL with the
  // coordinate needing a sign change in a frame that has already flipped.
  //   The consequence was that the sailor's PRIMARY steering control reversed
  // its meaning at every shunt. On the free run the end-symmetry checks use,
  // tackX=+1 gave dTWA 36.7deg on end +1 and 75.0deg on end -1 -- an exact
  // mirror of what tackX=-1 gave. Those checks never saw it because they run
  // every trim control at neutral, where the factor multiplies zero.
  const tackTravel = config.sail.tackTravel ?? 0;
  const tackOffset = (controls.tackX ?? 0) * tackTravel;
  // Which way the CE travels as the sail is EASED (AC-3, work-order-2026-08-02
  // acceptance run; docs/adr/0014).
  //
  //   'geometric' (the model up to 2026-08-03): the sail is a rigid triangle
  //     pivoting about a tack at the bow, so easing swings its centroid
  //     FORWARD, toward the pivot -> easing bears away, sheeting in points up.
  //   'manual' (default now): the owner's primary source says the opposite --
  //     "Elementarz zeglowania po Mikronezyjsku" ch. III, AC-3.1/3.2: sheeting
  //     in makes the bow bear away, easing makes it point up. So the CE moves
  //     AFT as the sail is eased.
  //
  // These cannot both be right and I cannot resolve it from first principles:
  // the rigid-triangle argument is sound for a flat plate on a pivot, and a
  // crab claw is neither -- its centre of pressure migrates along the yard as
  // the leading-edge vortex develops, which is a real effect the rigid
  // geometry ignores. The manual is a practitioner's description of THIS boat
  // and the owner has chosen it as the authority. Recorded as a decision, with
  // the losing side kept switchable rather than deleted, because the evidence
  // is genuinely one-sided in provenance and not in physics.
  //
  // Written as (1 - cos) rather than by flipping the sign, so the lever's
  // RANGE is untouched: it still runs `lead - halfChordEff` .. `lead`, only
  // the mapping from delta is reversed. That matters -- S2's whole result is
  // that the lever crosses zero inside the tack range, and re-centring it by
  // hand would have put that at risk. `hull.lead` is not retuned.
  const easeMovesCEAft = (config.sail.ceSwingMode ?? 'manual') === 'manual';
  const swing = easeMovesCEAft
    ? -halfChordEff * (1 - Math.cos(delta))
    : -halfChordEff * Math.cos(delta);

  // The windward ("breaking") brail's own CE shift — AC-4, 2026-08-03.
  // The manual gives this its own mechanism and states no dependence on trim:
  // "Pull this brailing line, which hides behind the sail, unless it deform
  // the sailcloth and continue to make rear part of the sail, breaking over to
  // lee. More you let the wind to spill over rear part of sail, more the bow
  // shall turn off the wind." Spilling the leech removes area from the BACK of
  // the sail, so the centre of effort moves FORWARD, giving lee helm.
  //
  // It had no such term. The only path the brail had to xCE was shrinking
  // `halfChordEff`, i.e. modulating the TRIM swing's amplitude — which the
  // AC-3 reformulation then multiplied by (1 - cos delta), collapsing it to
  // almost nothing at exactly the close trims AC-4 is measured at (1.8 cm at
  // delta=40deg). That is why the brail's bear-away was riding the heel->yaw
  // coupling instead: measured, zeroing that coupling left AC-4.2a just as
  // wrong, which is only possible if the brail's own mechanism was absent.
  //
  // Sized from the geometry rather than fitted: spilling the rear third of a
  // chord moves the remaining area's centroid forward by about chord/6.
  const ceBrailXShift = (config.sail.ceBrailXShift ?? 0) * brailWind;
  const xCE = clrXNeutral + lead + tackOffset + swing + ceBrailXShift + xHalyard + xRake;
  const yCE = -state.end * halfChordEffY * Math.sin(delta) + yRake;

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
  const yawMomentHeel = yawHeelSign * state.end * CEheightEff * Math.sin(phi) * Fx;
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

  return { Fx, Fy, Fz, heelMoment, yawMoment, yawMomentHeel, alpha, alphaSailor, aw, CL, CD };
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
