// aero.js — crab-claw sail aerodynamics: apparent wind, CL/CD from the
// measured-anchored table plus camber and brail effects, the boat's own
// windage, and the resulting boat-frame forces and moments.
//
// ANGLE-OF-ATTACK SIGN CONVENTION (derived once here, used throughout):
//   The yard/boom trims to the side opposite the ama (leeward), but the
//   chord DIRECTION VECTOR used to measure alpha is
//   `chordAngle = end * state.delta`. It is end-aware because the ama sits
//   at boat-frame y-side `end`, not always +y (see state.js), so "leeward"
//   is the -end side and the chord's sign must track it. `state.delta` is
//   the yard's ACTUAL angle — real state relaxing toward its aerodynamic
//   equilibrium under a one-sided sheet constraint (core/sheet.js). Forces
//   here are always computed at that current, physical angle, never at the
//   commanded sheet limit.
//
//   At end=+1 this reduces to `+delta`, which — given the chirality of the
//   awChordX/awChordYcw rotation below — makes alpha reduce to the sailor's
//   angle of attack (apparent wind angle minus sheeting angle), signed so
//   that a well-trimmed course (chord swept less than the apparent wind
//   angle) gives positive alpha and positive driving force. At end=-1 the
//   whole geometry is a mirror image (ama and chord both reflected through
//   the x axis), so alpha — and hence CL's sign, and hence Fy/heelMoment's
//   sign — mirrors too. That is what lets stability.js interpret
//   `heelMoment * end` with a single, end-invariant convention.
//
//   CL's sign comes from alpha, and drag's direction is fixed by the flow
//   alone, so flipping only CL's sign would flip whether lift adds to or
//   fights the drag component of Fx. The sign convention above is therefore
//   load-bearing, not cosmetic.
//
//   alpha itself is the RAW atan2 result (no reflection or folding), so it
//   stays a true signed angle of attack across the full (-180, 180] range. A
//   genuinely backwinded sail (|alpha| > 90 deg, flow on the leech side —
//   e.g. aback) is handled explicitly in sailCoefficients() by mirroring
//   only the CL/CD table lookup magnitude, not by reflecting alpha itself.

import { polhamusAR, polhamusKp, polhamusKv, polhamusCL } from './config.js';
import { clrXPosition } from './hydro.js';

const DEG = Math.PI / 180;
// Flogging-drag window: how close to a genuine zero-AoA weathervane
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
  // TRAP: this blends between the SMALLEST and LARGEST apex keys only — any
  // intermediate columns are ignored. Safe today (the CSVs carry exactly
  // two, 45 and 60), but a third apex would be interpolated ACROSS, not TO.
  // Add real per-segment interpolation (or an assertion on
  // apexKeys.length === 2) before extending the table.
  const lo = apexKeys[0], hi = apexKeys[apexKeys.length - 1];
  const clampedApex = Math.min(Math.max(apexDeg, lo), hi);
  const w = (clampedApex - lo) / (hi - lo || 1);
  const clLo = interpTable(alphaAbsDeg, aeroTable[lo]);
  const clHi = interpTable(alphaAbsDeg, aeroTable[hi]);
  return lerp(clLo, clHi, w);
}

// camberCLFactor(alphaAbsDeg, camber) -> CL multiplier for a given ABSOLUTE
// camber ratio, calibrated against a flat plate (where camber=0 genuinely
// means flat). Callers use the table-relative wrapper camberCLDelta below.
//
// The bonus fades out above 30deg and is gone by CAMBER_FADE_END_DEG. That
// end point is 75deg rather than 45: deep-course trims live at alphaSailor
// 32-85deg, so a 45deg cutoff leaves the camber bonus silently inactive
// across most of its own intended use case. 75deg (not a flat extension to
// 90) still tapers to zero near true flat-plate/stalled flow (alpha~90),
// where camber stops being a meaningful attached-flow concept at all.
const CAMBER_FADE_END_DEG = 75;
function camberCLFactor(alphaAbsDeg, camber) {
  if (alphaAbsDeg <= 30) return 1 + 1.75 * camber;
  if (alphaAbsDeg >= CAMBER_FADE_END_DEG) return 1.0;
  const t = (alphaAbsDeg - 30) / (CAMBER_FADE_END_DEG - 30);
  return lerp(1 + 1.75 * camber, 1.0, t);
}

// camberCLDelta(alphaAbsDeg, camberDelta, builtinCamber) -> CL multiplier
// relative to the aero TABLE's own baked-in camber, not to a flat plate.
//
// The v2 table was digitised from an ALREADY-CAMBERED rigid sail, so feeding
// a camber ratio straight into camberCLFactor — which measures relative to a
// flat plate — double-counts the table's built-in camber whenever the delta
// is nonzero. Instead, treat camberDelta as ADDITIONAL camber beyond
// builtinCamber and take the RATIO of the two absolute evaluations, so the
// table's baseline cancels algebraically:
//   ratio = camberCLFactor(alpha, builtin+delta) / camberCLFactor(alpha, builtin)
//
// At camberDelta=0 this is an exact identity (ratio=1) for ANY
// builtinCamber. At builtinCamber=0 (v1, a genuinely flat theoretical
// table) it reduces algebraically to the plain absolute formula, so v1's
// camber semantics are untouched.
function camberCLDelta(alphaAbsDeg, camberDelta, builtinCamber) {
  const atBuiltin = camberCLFactor(alphaAbsDeg, builtinCamber);
  const atBuiltinPlusDelta = camberCLFactor(alphaAbsDeg, builtinCamber + camberDelta);
  return atBuiltinPlusDelta / atBuiltin;
}

// camberCDFactor / camberCDDelta — the CD analog of the two functions above,
// and the same ratio transform for the same reason: the table's CD0/s are
// least-squares fits to the SAME already-cambered sail, so an absolute
// "relative to a flat plate" form double-counts it. Identity at
// camberDelta=0 for any builtinCamber; reduces to the absolute form at
// builtinCamber=0. No alpha dependence.
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

// brailRegimeBlend(b, trimRange, valAtZero, valAtTrim, valAtOne)
//
// The manual's windward brail has two real roles that a single linear cut
// conflates — TRIM (partial pull, b in [0, trimRange]: deepens the belly,
// the sail keeps drawing) and SURVIVAL (b in (trimRange, 1]: spills power,
// panic/furl territory). Each regime is a plain lerp between its own two
// endpoint values, but the interpolation PARAMETER is smoothstep(t) rather
// than raw t. smoothstep's derivative is exactly 0 at both ends, so the two
// curves meet at b=trimRange with matching VALUE (both evaluate valAtTrim)
// AND matching slope: one brailTrimRange knob is enough to get a kink-free
// join without a separate blend-width parameter.
function brailRegimeBlend(b, trimRange, valAtZero, valAtTrim, valAtOne) {
  const bc = Math.min(Math.max(b, 0), 1);
  if (trimRange <= 0) return lerp(valAtTrim, valAtOne, smoothstep01(bc));
  if (trimRange >= 1) return lerp(valAtZero, valAtTrim, smoothstep01(bc));
  if (bc <= trimRange) return lerp(valAtZero, valAtTrim, smoothstep01(bc / trimRange));
  return lerp(valAtTrim, valAtOne, smoothstep01((bc - trimRange) / (1 - trimRange)));
}

// sailCoefficients(alpha, controls, config) -> { CL, CD, alphaSailor, areaFactor }
// alpha: signed angle of attack [rad], raw atan2 range (-pi, pi]. |alpha| up
// to 90deg is the sail's front face working normally; beyond that the flow
// is on the leech side (genuinely backwinded, e.g. aback) — the two-sided
// flat-plate table is looked up at the mirrored angle (180deg - |alpha|)
// since the CL/CD magnitude is symmetric about a full chord flip, while the
// sign (below) still comes from alpha itself, so which way the resulting
// force pushes is unaffected by this mirroring.
export function sailCoefficients(alpha, controls, config, deltaDeg = null) {
  const { sail } = config;
  const rawAbsDeg = Math.abs(alpha) / DEG;
  const alphaAbsDeg = rawAbsDeg <= 90 ? rawAbsDeg : 180 - rawAbsDeg;
  const alphaAbsRad = alphaAbsDeg * DEG;

  const CLtable = blendApexCL(sail.apexAngleDeg, alphaAbsDeg, config.aeroTable);
  // KNOWN OFFSET: `alpha` here is the GEOMETRIC chord-flow angle, but
  // data/dipiazza_2014_digitized.csv states its alpha is "measured from
  // ZERO-LIFT incidence". A cambered sail has a negative zero-lift angle, so
  // the v2 table is shifted a few degrees in alpha versus this geometric
  // convention (v1/Polhamus has no built-in camber and is unaffected).
  // Documented, not corrected — a constant alpha offset on the v2 lookup
  // would fix it but moves the whole polar.
  //
  // Flogging drag: a real luffing sail flutters, adding unsteady-flow drag
  // beyond what a static flat plate at the same (near-zero) AoA would cost.
  // Ramped in only within a narrow window around alphaAbsDeg=0 — the genuine
  // weathervane/luffing condition — fading linearly to 0 by LUFF_WINDOW_DEG,
  // so normal loaded trims and the backwinded-but-pressed condition (both of
  // which read a much larger alphaAbsDeg) are untouched.
  const luffFrac = Math.max(0, 1 - alphaAbsDeg / LUFF_WINDOW_DEG);
  const floggingCD = sail.floggingCDFactor * sail.CD0 * luffFrac;

  const brailLee = controls.brailLee ?? 0;
  const brailWind = controls.brailWind ?? 0;
  const brailTrimRange = sail.brailTrimRange ?? 0.6;

  // Trim-regime camber bonus: the manual's partial windward-brail technique
  // bags the remaining draft, not just spills area — it peaks at
  // brailTrimRange (full TRIM pull) and fades back to sail.camber's own
  // baseline by brailWind=1, since a fully spilled SURVIVAL sail is gathered,
  // not bagged. camberEff is a DELTA beyond the active table's own built-in
  // camber (see camberCLDelta).
  const brailCamberGain = sail.brailCamberGain ?? 0;
  const camberEff = sail.camber
    + brailRegimeBlend(brailWind, brailTrimRange, 0, brailCamberGain, 0);
  const builtinCamber = sail.aeroTableVersion === 'v2' ? (sail.aeroV2BuiltinCamber ?? 0.10) : 0;

  const camberCLf = camberCLDelta(alphaAbsDeg, camberEff, builtinCamber);

  // --- Brail acts through AREA, not through a CL fudge ---------------------
  // A brail GATHERS CLOTH toward the yard, so what costs force is a smaller
  // reference area — which is what areaFactor carries out to sailForces()
  // below. Cutting CL by opaque multipliers while the reference area stayed
  // at the full sail.area lets partial brailing ADD total force whenever the
  // camber bonus outruns the CL cut: reefing that makes the rig more
  // powerful. Here area falls monotonically, the TRIM-regime camber bonus
  // acts on that REDUCED area, and the survival endpoint (brailWind=1 ->
  // 0.20) is chosen to land near a CL x0.2 cut, which is where the panic /
  // stop / squall semantics were calibrated.
  const areaWindFactor = brailRegimeBlend(brailWind, brailTrimRange, 1, sail.areaAtTrimBrail, sail.areaAtFullBrail);
  const areaLeeFactor = 1 - (1 - sail.areaAtFullLeeBrail) * brailLee;
  const furl = brailLee * brailWind;
  const areaFactor = areaWindFactor * areaLeeFactor;

  // Mast shadow (L4, Archive/work-order-2026-08-09-domkniecie-kryterium.md):
  // sail.deltaMinDeg (ADR 0010) is the ROPE-REACH floor only -- whether the
  // sheet can physically pull the yard's clew in that far. On the PJOA FOLK
  // (8 m^2 sail, 5.0 m hull) that floor is exactly 0 (ADR 0021: "the spar no
  // longer overhangs... the mechanism is unchanged and still correct — it
  // simply has nothing to clamp here"), so a trimmed yard CAN now sit flush
  // against the centreline. ADR 0010 considered a mast-shadow CL term and
  // explicitly declined to add it: "a trimmed yard never sits in the narrow
  // small-delta band such a term would act on... it would have no consumer."
  // That premise no longer holds -- it now has one.
  //   A trimmed yard within a few degrees of the mast is blanketed by it, the
  // same phenomenon any rig with a mast ahead of the sail has near
  // head-to-wind trim. The magnitude here is an EXPLICIT ESTIMATE, not a
  // measurement (no wind-tunnel or field data on this rig's own mast-shadow
  // loss exists) — same status as `deltaMinDeg`'s own ILL-CONDITIONED note:
  // the CONSTRAINT (a mast blocks flow near delta=0) is a solid claim about
  // any masted rig, the MAGNITUDE is a weak claim about this one. Not tuned
  // to hit a coverage target — see docs/parameter-register.md.
  const deltaAbsDeg = deltaDeg ?? 0;
  const shadowWidth = sail.mastShadowWidthDeg ?? 0;
  const shadowLoss = shadowWidth > 0 && deltaAbsDeg < shadowWidth
    ? (sail.mastShadowCLFactor ?? 0) * (1 - deltaAbsDeg / shadowWidth)
    : 0;

  const CLf = CLtable * camberCLf * (1 - furl) * (1 - shadowLoss);

  // --- CD: parasitic + induced(WORKING CL) + separation --------------------
  //     CD = CD0 + k*CL^2 + CD90*sin^4(alpha) + parasitic-from-gathering
  // The standard decomposition, chosen over the suction-loss form
  // CD0 + s*CL_table*tan(alpha), which has three faults: it is driven by the
  // TABLE CL (so induced drag ignores what the sail is actually producing
  // once brails and camber have modified it), it has a pole at alpha=90, and
  // there CL_table=0 exactly, collapsing CD to CD0 in the maximum-drag
  // broadside attitude. Here induced drag depends on the WORKING CL so the
  // polar stays a polar; there is no pole; the separation term makes
  // broadside genuinely draggy; and camber's drag cost arrives automatically
  // via its own CL rise, so no separate camber multiplier is needed.
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
  // attack" — the same mirrored magnitude already used for the table lookup
  // above, exposed so callers don't have to redo the mirror. See sailForces()
  // for the raw, unmirrored `alpha` this complements.
  return { CL: sign * CLf, CD: CDf, alphaSailor: alphaAbsRad, areaFactor };
}

// windageForce(state, controls, config) -> { Fx, Fy } in the boat frame.
//
// The boat's own above-water air drag — hull topsides, crew, mast, spars
// (docs/adr/0008). Without it the sail's own residual CD stands in for the
// whole boat's air drag, and, worse, shuntForceFade() returns exactly 0
// through the 'transfer' and 'swap' phases — 8.4 s of a 16.4 s shunt. Fading
// the sail's LIFT there is right (the rig is being carried across, not
// working), but with no windage the boat would feel no air force whatever
// while lying beam-on with a flogging rig, making the most exposed moment of
// the whole manoeuvre safe by construction. This term is therefore
// deliberately NOT faded.
//
// Applied along the apparent wind, i.e. pure drag on the above-water body. It
// is not always a retarding force: on a broad reach the apparent wind has a
// forward component and windage pushes the boat along, which is the
// physically correct behaviour and the reason it belongs in Fx/Fy rather
// than in the resistance term.
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
  // strongest (close-hauled), costing 21-33% of upwind speed.
  const sinA = Math.sin(aw.angleToBoat);
  const areaEff = windageAreaFrontal + (windageArea - windageAreaFrontal) * sinA * sinA;
  const q = 0.5 * config.rho_air * areaEff * windageCD * aw.speed;
  // q already carries one power of speed; multiplying by the velocity
  // COMPONENTS below supplies the second and the direction at once.
  return { Fx: q * aw.vx, Fy: q * aw.vy };
}

// sailForces(state, controls, config)
//   -> { Fx, Fy, Fz, heelMoment, yawMoment, yawMomentHeel, alpha, alphaSailor, aw, CL, CD }
// Fx, Fy in the boat frame. `alpha` is the raw signed chord-flow angle used
// internally for CL's sign — NOT the sailor's angle of attack (it reads
// ~140-170deg on normal courses; see the header comment). `alphaSailor` is
// the acute [0, pi/2] angle a sailor or the UI would call AoA.
export function sailForces(state, controls, config) {
  const aw = apparentWind(state, controls);
  const delta = Math.abs(state.delta ?? 0); // actual yard angle magnitude — reused below for CE geometry
  const chordAngle = state.end * delta; // chord direction convention, end-aware, see header comment
  const cx = Math.cos(chordAngle), cy = Math.sin(chordAngle);

  // Flow components in the chord frame -> signed angle of attack (raw atan2,
  // no reflection: see header comment and sailCoefficients()).
  const awChordX = aw.vx * cx + aw.vy * cy;
  const awChordYcw = aw.vx * cy - aw.vy * cx; // dot with the chord rotated -90deg
  const alpha = Math.atan2(awChordYcw, awChordX);

  const { CL, CD, alphaSailor, areaFactor } = sailCoefficients(alpha, controls, config, delta / DEG);

  // Reference area is the EFFECTIVE (brail-reduced) area, not the full sail:
  // a brail gathers cloth, so the working area shrinks. areaFactor is 1 with
  // both brails off, so an unbrailed rig is unaffected.
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

  // Heel projection. Heeling foreshortens the sail's projected area — the
  // apparent wind's projection onto the tilted sail plane — giving the force
  // IN THE SAIL PLANE.
  const phi = state.phi ?? 0;
  const cosPhi = Math.cos(phi);
  Fx *= cosPhi;
  // The in-plane transverse force is its own quantity, and the split matters.
  // The rig tilts with the boat, so that force resolves into a HORIZONTAL
  // component (a second cos(phi) — this is what loads the hull and drives
  // leeway) and a VERTICAL one (sin(phi)). Applying a single cos(phi) and
  // using the result as both the side force AND the heeling force cannot be
  // right: it overstates the hull's side loading by 1/cos(phi), which is 30%
  // at 40deg heel.
  // Fx (fore-aft) is unaffected by roll about the fore-aft axis, so it keeps
  // the single projection.
  const FyInPlane = Fy * cosPhi;
  Fy = FyInPlane * cosPhi;
  // Vertical component. There is no heave DOF, so this is NOT fed into the
  // dynamics — it is exposed through forcesBreakdown() so the vertical
  // balance the model does not close is VISIBLE and measurable rather than
  // silently missing (see the architecture doc's "Known simplifications").
  const Fz = FyInPlane * Math.sin(phi);

  const brailWind = controls.brailWind ?? 0;
  // verticalLiftFraction: Marchaj's central claim for the crab claw is that
  // its twisted delta geometry generates substantial VERTICAL (upward) lift
  // via leading-edge vortices — a lot of drive for relatively little heeling
  // moment. Modelled conservatively as a tunable reduction of the BASE heel
  // moment only: it does NOT touch Fx/Fy, it only unloads the heeling arm.
  // The magnitude is genuinely contested — Di Piazza et al. 2014, also cited
  // by this project, found more modest crab-claw performance than Marchaj —
  // so config.js defaults it to 0 (mechanism present, inactive).
  const verticalLiftFraction = config.sail.verticalLiftFraction ?? 0;
  // Windward-brail heel-moment cut, two-regime, mirroring the CL cut above.
  // TRIM: moderate, x0.7 at the endpoint — vertical redirection of the deep
  // belly, sail still drawing. SURVIVAL: ramps to a strong x0.1 at b=1
  // (panic/survival authority).
  const brailTrimRangeHeel = config.sail.brailTrimRange ?? 0.6;
  const brailWindHeelFactor = brailRegimeBlend(brailWind, brailTrimRangeHeel, 1, 0.7, 0.1);
  // The heeling COUPLE is the sail's side force against the hull's
  // hydrodynamic reaction, so the arm is the distance between them: CE height
  // above the water PLUS the CLR's depth below it, not the CE height alone.
  //   An equivalent formulation exists — leave the sail's arm at CEheight and
  // add explicit heel moments from hullSide.Fy and rudder.Fy at their own
  // depths. It is not taken here, so those two contributions are currently
  // absent from the roll balance; see the architecture doc's "Known
  // simplifications".
  //   The heeling force is the IN-PLANE transverse force, not the
  // twice-projected horizontal one.
  //
  // --- Vertical rig geometry (docs/adr/0019, 0020) -------------------------
  // Three of the manual's techniques work through the halyard and the shroud
  // and through nothing else, and with CEheight a constant the model can
  // answer none of them (AC-4.4, AC-5.1a, AC-5.1b).
  //
  // The halyard sets the YARD's inclination. Hauled to the masthead the yard
  // peaks up and its CE rides high and well forward, toward the tack; eased,
  // the yard falls, and its CE drops AND swings aft -- which is the manual's
  // stated weather-helm cause. One radius, derived so that full hoist
  // reproduces the nominal CEheight exactly (config.js sail.yardCERadius).
  //
  // The shroud runs to the ama, so slackening it lets the mast fall away from
  // the ama -- to LEEWARD -- and the stays set the fore-aft rake separately,
  // because the boat rigs them separately.
  //
  // At halyard = shroud = 1 and stays = 0 every term here is exactly zero and
  // the geometry is the plain upright one. hull.lead, ceSwingFraction and
  // clrXFraction are anchored against that state and are not retuned by it.
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
  // classical cure for weather helm.
  const stays = Math.max(-1, Math.min(1, controls.stays ?? 0));
  const stayRake = (config.sail.stayRakeMaxDeg ?? 0) * DEGR * stays;
  // Height of the CE above the water: up the yard, tipped by both rakes, then
  // raised by boom lift (shortening the leech's vertical droop). The rake
  // terms below (xRake/yRake) are computed FROM this already-raised height,
  // which is physically right: a rake is a rotation about the mast step, and
  // a CE point further from that step swings further under the same angle.
  const CEheightYard = yardR * Math.sin(yardPsi) * Math.cos(mastRake) * Math.cos(stayRake);
  const CEheightEff = CEheightYard;
  // Fore-aft: only the CHANGE from full hoist, so the baseline lever that
  // `lead` anchors is untouched (the same discipline as the trim swing).
  const xHalyard = -yardR * (Math.cos(yardPsi) - Math.cos(yardPeak));
  // Positive stays rake the masthead toward the ACTIVE BOW, so the CE moves to
  // +x. No `end` factor: the boat frame's +x already points at the active bow
  // (docs/adr/0016). The sailor re-tensions the stays at each shunt, so a
  // control meaning "rake toward the bow" is rightly referenced to it.
  const xRake = CEheightEff * Math.sin(stayRake);
  // Laterally the mast falls to LEEWARD, the -end side (the ama is windward
  // and the shroud runs to it), so this one DOES carry `end`.
  const yRake = -state.end * CEheightEff * Math.sin(mastRake);

  const heelArm = CEheightEff + (config.hull.clrDepth ?? 0);
  const heelMoment = FyInPlane * heelArm * (1 - verticalLiftFraction) * brailWindHeelFactor;

  // --- CE geometry ---------------------------------------------------------
  // Built around a classical yacht-design "lead" — the CE-CLR longitudinal
  // separation, a standard order-5-25%-of-waterline-length quantity (Larsson
  // & Eliasson, Principles of Yacht Design).
  //
  // The scale matters more than it looks: real Pjoa sail-trim response is
  // slow (owner's field datum), because the net helm is the SMALL DIFFERENCE
  // of two large, nearly-matched levers (CE and CLR each measured from a
  // common reference), not two independent small numbers. Measuring the CE
  // directly as a small CG-relative offset gets that difference badly wrong
  // and turns a modest sheet or brail change into several deg/s of turn rate.
  // `hull.lead` anchors the difference directly: xCE's neutral point is the
  // hull's own CLR (hydro.js's clrXPosition at the NEUTRAL crewPosX=0 —
  // moving crew fore-aft shifts the hull's CLR, it does not drag the sail's
  // CE around too, which would cancel that mechanism) plus `lead`.
  //
  // The yard's OWN swing (delta) moves the CE further — a real crab claw's CE
  // does shift with trim, which is the whole reason trimming steers at all —
  // but the excursion is scaled by sail.ceSwingFraction: a real,
  // flow-attached aerodynamic centre tracks much closer to the leading
  // edge/tack across the practical trim range than the raw geometric
  // half-chord midpoint, so only a FRACTION of the full geometric swing
  // should reach the CE.
  //
  // Brail-induced CE shift. Spilling the sail's rear/upper area (windward
  // brail) gathers the working area back toward the yard's own pivot, the
  // tack. Physically this shrinks the CE's WHOLE excursion from that pivot,
  // fore-aft AND lateral — the two axes get their own shift fractions
  // (ceBrailShift, yceBrailShift) because the lateral arm is what directly
  // attacks the deep-course luffing/yaw moment (-yCE*Fx below), which is what
  // the manual's downwind "carrot" technique is for, and it needs to shrink
  // harder than the fore-aft one.
  const chord = config.sail.CEheight / 2;
  const halfChord = chord / 2;
  const lead = config.hull.lead ?? 0.15 * config.hull.length;
  const clrXNeutral = clrXPosition(0, config);
  const ceSwingFraction = config.sail.ceSwingFraction ?? 0.5;
  const ceBrailShift = config.sail.ceBrailShift ?? 0.3;
  const yceBrailShift = config.sail.yceBrailShift ?? 0.6;
  const halfChordEff = halfChord * ceSwingFraction * (1 - ceBrailShift * brailWind);
  // The LATERAL offset gets its own, geometric base length (docs/adr/0024).
  // Sharing `halfChord` with the fore-aft swing conflates two different
  // physical things: the fore-aft excursion is a centre-of-pressure MIGRATION
  // with trim (small, and calibrated against the owner's field datum that
  // Pjoa sail-trim steering is slow), while the lateral offset is the
  // geometric fact that an eased crab claw hangs right out over the water.
  // Sharing one length makes the second 11x too small: 0.25 m against the
  // sail's real tack-to-centroid distance of 2.76 m.
  const ceRadiusEff = (config.sail.ceRadius ?? halfChord) * (config.sail.yceFraction ?? 1);
  const halfChordEffY = ceRadiusEff * (1 - yceBrailShift * brailWind);
  // tackX: the rig's own fore-aft position — THE proa steering control
  // (docs/adr/0011). On an Oceanic lateen the tack travels along the hull and
  // the mast's rake is adjustable, so the CE moves longitudinally by a real
  // distance: Dierking has the yard's heel sliding under the gunwale on an
  // endless tack line, and Proafile notes that a fixed-halyard bridle
  // "removes some of the flexibility of moving the centre of effort, both
  // fore and aft and vertically", i.e. designers treat the movable CE as a
  // feature they can choose to give up. Without it the whole helm balance
  // rests on the single constant `lead`, and the lever (xCE - clrX) cannot
  // reach zero at any trim, because `lead` exceeds the entire trim-driven
  // excursion (halfChordEff) and the expression is positive by construction.
  //
  // Sign: NO `end` factor (docs/adr/0023). The boat frame's +x already points
  // at the ACTIVE bow, so "the tack hauled toward the bow" is +x on BOTH ends
  // and the offset is just tackX*tackTravel. The tack moving to the other end
  // of the HULL is not the same thing as the coordinate needing a sign change
  // in a frame that has already flipped. Note that end-symmetry checks run
  // with the trim controls at neutral cannot see an error here, because the
  // factor would multiply zero.
  const tackTravel = config.sail.tackTravel ?? 0;
  const tackOffset = (controls.tackX ?? 0) * tackTravel;
  // Which way the CE travels as the sail is EASED (docs/adr/0014).
  //
  //   'geometric': the sail is a rigid triangle pivoting about a tack at the
  //     bow, so easing swings its centroid FORWARD, toward the pivot ->
  //     easing bears away, sheeting in points up.
  //   'manual' (the default): the owner's primary source says the opposite --
  //     "Elementarz zeglowania po Mikronezyjsku" ch. III, AC-3.1/3.2:
  //     sheeting in makes the bow bear away, easing makes it point up. So the
  //     CE moves AFT as the sail is eased.
  //
  // These cannot both be right and the question is not settleable from first
  // principles: the rigid-triangle argument is sound for a flat plate on a
  // pivot, and a crab claw is neither -- its centre of pressure migrates
  // along the yard as the leading-edge vortex develops, a real effect the
  // rigid geometry ignores. The manual is a practitioner's description of
  // THIS boat and the owner has chosen it as the authority. The losing side
  // is kept switchable rather than deleted, because the evidence is
  // one-sided in provenance and not in physics.
  //
  // Written as (1 - cos) rather than by flipping a sign, so the lever's RANGE
  // is untouched: it still runs `lead - halfChordEff` .. `lead`, and only the
  // mapping from delta is reversed. That matters -- the lever must cross zero
  // inside the tack range, and re-centring it by hand would put that at risk.
  const easeMovesCEAft = (config.sail.ceSwingMode ?? 'manual') === 'manual';
  const swing = easeMovesCEAft
    ? -halfChordEff * (1 - Math.cos(delta))
    : -halfChordEff * Math.cos(delta);

  // The windward ("breaking") brail's own CE shift. The manual gives this its
  // own mechanism and states no dependence on trim: "Pull this brailing line,
  // which hides behind the sail, unless it deform the sailcloth and continue
  // to make rear part of the sail, breaking over to lee. More you let the
  // wind to spill over rear part of sail, more the bow shall turn off the
  // wind." Spilling the leech removes area from the BACK of the sail, so the
  // centre of effort moves FORWARD, giving lee helm.
  //
  // It needs to be its own term: the brail's only other path to xCE is
  // shrinking `halfChordEff`, i.e. modulating the TRIM swing's amplitude, and
  // the (1 - cos delta) form collapses that to ~2 cm at the close trims this
  // criterion is measured at.
  //
  // Sized from the geometry rather than fitted: spilling the rear third of a
  // chord moves the remaining area's centroid forward by about chord/6.
  const ceBrailXShift = (config.sail.ceBrailXShift ?? 0) * brailWind;
  const xCE = clrXNeutral + lead + tackOffset + swing + ceBrailXShift + xHalyard + xRake;
  const yCE = -state.end * halfChordEffY * Math.sin(delta) + yRake;

  // Heel-course coupling (pure geometry): heeling tips the mast, offsetting
  // the CE laterally by CEheight*sin(phi) toward leeward (the -end side, away
  // from the ama) for phi>0. A forward (drive) force Fx applied at a lateral
  // offset y produces yaw moment -y*Fx (standard r x F, no x-offset for this
  // term); substituting y = -end*CEheight*sin(phi) gives the
  // end*CEheight*sin(phi)*Fx below. A SEPARATE mechanism from the xCE/yCE
  // geometry above (mast RAKE under heel vs. the yard's OWN swing angle), so
  // it stays additive with it.
  //
  // config.hull.yawHeelSign is 0, i.e. THE TERM IS DISABLED — see config.js
  // for why, and do not re-enable it alone: this is one half of a cancelling
  // pair whose other half (the heeled hull's own asymmetry) the model does
  // not have.
  const yawHeelSign = config.hull.yawHeelSign ?? 1;
  const yawMomentHeel = yawHeelSign * state.end * CEheightEff * Math.sin(phi) * Fx;
  // ceLeverSign is currently the IDENTITY (+1), not an active flip: the
  // naive, unflipped r x F derivation matches the boat's real steering
  // direction at the current `lead`. Kept as a parameter because it is the
  // one knob that would express a genuine sign disagreement.
  //
  // Note the standing limitation: Di Piazza 2014 and Flay 2025 measured FORCE
  // coefficients (sail CL/CD, hull CS), not CE/CLR POSITION, so `hull.lead`,
  // `sail.ceSwingFraction` and `hull.clrXFraction` remain estimated lever-arm
  // geometry rather than measured.
  const ceLeverSign = config.hull.ceLeverSign ?? 1;
  const yawMoment = ceLeverSign * (xCE * Fy - yCE * Fx) + yawMomentHeel;

  return { Fx, Fy, Fz, heelMoment, yawMoment, yawMomentHeel, alpha, alphaSailor, aw, CL, CD };
}

// tableCL(apexDeg, alphaDeg, config) -> raw table CL (no camber/brails),
// exposed for the calibration assertions in harness/asserts.js.
export function tableCL(apexDeg, alphaDeg, config) {
  return blendApexCL(apexDeg, Math.min(Math.abs(alphaDeg), 90), config.aeroTable);
}

// The sail's lift is faded out through a shunt rather than computed: the rig
// is being physically carried across, not working. Windage is deliberately
// exempt from this fade — see windageForce().
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
