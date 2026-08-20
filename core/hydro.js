// hydro.js — hull and ama hydrodynamics: longitudinal resistance, the hull's
// whole lateral force by strip integration, and ama drag.
// Coefficients not directly measured are tunable estimates — see
// data/README_input_data_EN.md for the calibrated-vs-estimated split.

// ITTC-57 model-ship correlation line, shared by the main hull and the ama:
// both are slender bodies moving lengthwise through the water (the ama is
// NOT a bluff cross-flow body — it trails fore-aft like a second, smaller
// hull), so both get skin friction from the same formula, each at its own
// length/Reynolds number.
// Speed scale over which direction-of-travel terms are smoothed instead of
// switching discontinuously at u=0. Matches the ittc57Cf Reynolds floor, so
// the two low-speed regularisations agree.
const U_SMOOTH = 0.05; // m/s
// Stations for the hull's lateral strip integration (hullSideForce). The
// integral is converged to <0.5% by 21 (checked against 41 and 81).
const HULL_STATIONS = 21;
// Stations for the ama's own strip integration (T4, Archive/work-order-2026-08-
// 05-sterownosc.md). Not independently convergence-checked the way
// HULL_STATIONS was — the taper and CS(leeway) are both smooth over the
// ama's much shorter length, so this is chosen with comfortable margin
// rather than swept.
const AMA_STATIONS = 11;
const NU_SEAWATER = 1.19e-6; // m^2/s, kinematic viscosity of seawater at ~15degC (ITTC standard condition)

function ittc57Cf(u, length) {
  const uAbs = Math.max(Math.abs(u), 0.05); // floor avoids the Re->0 singularity near rest
  const Re = (uAbs * length) / NU_SEAWATER;
  const logRe = Math.log10(Re);
  return 0.075 / ((logRe - 2) * (logRe - 2));
}

// heaveZ (S8, Archive/work-order-2026-08-02-steering-and-sources.md): the 5th
// DOF's vertical displacement from the design waterline [m], +up — trailing
// and OPTIONAL (defaults to 0, the design draft) rather than inserted
// alongside u: every isolated hull-physics probe in harness/asserts-hull-
// ama.js calls this at the design draft on purpose (testing the baseline
// hull, not the heave coupling), and a positional insert would have forced
// updating all of them for no benefit. Only core/integrator.js's live path
// passes the real state.z. Named heaveZ, not z: this function's own Gaussian
// residuary hump below already uses a local `z` for something unrelated.
export function hullResistance(u, config, heaveZ = 0) {
  const { hull, rho_w, g } = config;
  const uAbs = Math.abs(u);
  // draftRatio: wetted surface and lateral area both scale roughly with
  // draft (the same linear-in-one-dimension assumption this project already
  // uses for the ama's own wettedSurface, docs/adr/0029) — riding higher
  // (heaveZ>0) shrinks the effective draft and, with it, both quantities.
  // Floored well short of 0: an actual zero/negative draft is not a smaller
  // hull, it is the hull leaving the water, which this linear approximation
  // does not model and must not be extrapolated into.
  const draftRatio = Math.max(0.1, (hull.draft - heaveZ) / hull.draft);
  const wettedSurface = hull.wettedSurface * draftRatio;
  const Cf = ittc57Cf(u, hull.length);
  const friction = 0.5 * rho_w * wettedSurface * Cf * uAbs * uAbs;

  // Residuary (wave-making) resistance (docs/adr/0001). A slender L/B=10:1
  // canoe hull makes little wave and has no hard "hull speed" wall the way a
  // displacement monohull (L/B~3-4) does. Expressed in the same
  // nondimensional form as friction (Cr, not a raw force-scaling constant)
  // as a bounded Gaussian hump peaking near the main prismatic hump
  // (residuaryFrPeak), never growing past a few x friction. See config.js
  // hull.residuaryPeakCr/FrPeak/FrWidth for the literature basis.
  //
  // Past the hump (Fr > FrPeak) a pure Gaussian would fall back toward 0,
  // and a slender hull does not shed residuary resistance all the way back
  // to friction-only. Letting it do so opens a second, unphysically fast
  // speed branch that the polar's settle-gate can reach, so the tail is held
  // at a plateau fraction of the peak instead (docs/adr/0006).
  const Fr = uAbs / Math.sqrt(g * hull.length);
  const z = (Fr - hull.residuaryFrPeak) / hull.residuaryFrWidth;
  const gaussian = Math.exp(-z * z);
  const Cr = hull.residuaryPeakCr * (Fr > hull.residuaryFrPeak
    ? hull.residuaryTailPlateau + (1 - hull.residuaryTailPlateau) * gaussian
    : gaussian);
  const residuary = 0.5 * rho_w * wettedSurface * Cr * uAbs * uAbs;

  // sign(u)*uAbs^2 is exactly u*|u| — written directly, no sign() switch.
  return -(friction + residuary) * Math.sign(u);
}

// hullSideForceCoeff(lambdaDeg, hull) -> CS, the measured-anchored side-force
// coefficient (docs/adr/0004) — see config.js's csV2A/csV2B/csV1A/csV1B/
// csBlendStartDeg/csBlendEndDeg for the full derivation. Three regimes:
//   - V2's own quadratic fit over its measured 0-16deg range;
//   - a linear blend toward V1's fitted value across 16-24deg. There is no
//     V2 data past 16deg, so continuing V2's own steeper curve would be an
//     unconstrained runaway; V1's slower, independently-measured growth is a
//     more defensible extrapolation target;
//   - a flat hold beyond blendEnd — an explicit, provenance-free
//     extrapolation guard, genuinely untested territory for either hull.
function hullSideForceCoeff(lambdaDeg, hull) {
  const { csV2A, csV2B, csV1A, csV1B, csBlendStartDeg, csBlendEndDeg } = hull;
  if (lambdaDeg <= csBlendStartDeg) {
    return csV2A * lambdaDeg + csV2B * lambdaDeg * lambdaDeg;
  }
  const csAtBlendStart = csV2A * csBlendStartDeg + csV2B * csBlendStartDeg * csBlendStartDeg;
  const csV1AtBlendEnd = csV1A * csBlendEndDeg + csV1B * csBlendEndDeg * csBlendEndDeg;
  if (lambdaDeg <= csBlendEndDeg) {
    const frac = (lambdaDeg - csBlendStartDeg) / (csBlendEndDeg - csBlendStartDeg);
    return csAtBlendStart + frac * (csV1AtBlendEnd - csAtBlendStart);
  }
  return csV1AtBlendEnd;
}

// clrXPosition(theta, config) -> x offset from CG (boat frame, +fwd).
//
// The model's ONE statement of where the centre of lateral resistance sits.
// Shared by hullSideForce (via stationWeights) and by aero.js's sail CE
// geometry: the CE-CLR "lead" concept only means anything if both sides of
// it reference the same point.
//
// theta (pitch angle, rad -- L5, Archive/work-order-2026-08-09-domkniecie-
// kryterium.md, the 6th DOF, config.pitch) shifts it: a real dynamic angle
// driven by crew fore-aft weight (stability.js's crewPitchMoment) against
// the hull's own hydrostatic pitch stiffness, replacing the old direct
// crewPosX->CLR wire this function used to be. hull.crewForeAftTrimCoeff
// keeps its ORIGINAL meaning ("fraction of half-length the CLR shifts at a
// full crew deflection") but is re-anchored here onto config.pitch.
// thetaAtFullCrew (the DOF's own equilibrium angle at crewPosX=+-1) instead
// of onto crewPosX directly, so the UI-editable coefficient still means the
// same physical thing and old config patches still work unchanged.
// config.hull.crewTrimSign is a flip knob if a physical rig ever runs the
// other way.
export function clrXPosition(theta, config) {
  const { hull, pitch } = config;
  const crewTrimSign = hull.crewTrimSign ?? 1;
  const thetaAtFullCrew = pitch?.thetaAtFullCrew || 1e-9;
  const pitchClrCoeff = (hull.crewForeAftTrimCoeff ?? 0) / thetaAtFullCrew;
  return -(hull.clrXFraction ?? 0.1) * (hull.length / 2)
    + crewTrimSign * pitchClrCoeff * theta * (hull.length / 2);
}

// stationWeights(theta, phi, config) -> per-strip lateral areas, bow-last.
//
// The lateral plane is NOT distributed uniformly along the length: its
// centroid is the centre of lateral resistance, which sits aft of the CG
// (hull.clrXFraction) and moves with fore-aft crew trim. A uniform strip
// distribution would put the centroid at the CG and delete the hull's
// weathercocking entirely -- so the distribution carries the same clrX the
// model already uses, rather than a second, independent statement of it.
//
// heelClrShiftCoeff (T3, Archive/work-order-2026-08-05-sterownosc.md): the SAME
// taper ALSO shifts with heel. A heeled V-section hull immerses its two sides
// unequally along its whole length, not just port-starboard, which is the
// standard simplified-VPP treatment of the real "heel moves the CLR fore-aft"
// mechanism -- and the missing half of hull.yawHeelSign's cancelling pair
// (see aero.js's yawMomentHeel and config.js's own comment there). Kept
// STRICTLY SEPARATE from clrXPosition(): that function is also aero.js's
// anchor for the sail's own CE geometry (`clrXNeutral`), evaluated at a fixed
// crewPosX=0 precisely so the hull-side mechanisms do not drag the sail's CE
// around with them (see clrXPosition's own comment) -- a phi term belongs
// only in the hull's OWN distribution, added here, not threaded into the
// shared anchor point.
//   Estimate, not measured: no towing-tank data exists for this boat's
// heel-yaw coupling (Flay's CS(leeway) curve is straight-line, not heeled).
// Sign and magnitude are an empirical finding -- see hull.heelClrShiftCoeff's
// own config.js comment for the measurement this was decided against.
//
// Linear taper w(x) = 1 + k*x over [-L/2, L/2]: mean 1 by construction (so
// the strips still sum to hull.lateralArea), centroid k*L^2/12, hence
// k = 12*xc/L^2. Clamped to |k| <= 2/L, past which the taper would ask for
// negative area at one end.
function stationWeights(theta, phi, config, draftRatio) {
  const { hull } = config;
  const L = hull.length;
  const heelClrSign = hull.heelClrSign ?? 1;
  const heelShift = heelClrSign * (hull.heelClrShiftCoeff ?? 0) * Math.sin(phi) * (L / 2);
  const xc = clrXPosition(theta, config) + heelShift;
  const k = Math.max(-2 / L, Math.min(2 / L, (12 * xc) / (L * L)));
  // draftRatio (S8, heaveZ's effective-draft scaling — see hullResistance's
  // own comment for the derivation): the lateral plane shrinks/grows with it
  // the same way wetted surface does, so every strip's own share does too.
  const dA = ((hull.lateralArea ?? 0) * draftRatio) / HULL_STATIONS;
  const out = [];
  for (let i = 0; i < HULL_STATIONS; i++) {
    const x = -L / 2 + (i + 0.5) * (L / HULL_STATIONS);
    // dAFlat (untapered per-strip share) rides along so hullSideForce's own
    // migrating-CLR term (D1, Archive/work-order-2026-08-05-statecznosc-
    // kierunkowa.md) can build its OWN weighting from the same area budget
    // without re-deriving it — see that function's own comment for why it
    // needs a second distribution, not this one reused.
    out.push({ x, dA: dA * (1 + k * x), dAFlat: dA });
  }
  return out;
}

// hullSideForce(u, v, r, theta, phi, config) -> { Fx, Fy, yawMoment }
//
// THE HULL'S WHOLE LATERAL FORCE, BY STRIP INTEGRATION (docs/adr/0017).
// The station at x sees its own transverse velocity v + r*x, not the boat's
// v — hence its own leeway, hence its own CS from the measured curve. Every
// term below is evaluated per station and summed, and the yaw moment is the
// integral of x*f(x), not clrX*Fy.
//
// At r = 0 this reduces exactly to the single-leeway model: every strip sees
// the same leeway, the sum factors, and the moment is clrX*Fy to the last
// digit. What it adds is everything r does — the hull's own yaw damping, and
// the v-r cross term that a split sway/yaw pair cannot own, because neither
// half knows the whole flow.
//
// The drift angle is measured against the SIGNED u: after a shunt u is
// legitimately negative while the boat still carries its old way (see
// core/shunt.js), and taking |u| would compute the leeway as though the hull
// were going bow first. The magnitude fed to the CS curve is then folded
// into [0,90] the same way aero.js folds the sail's alpha, so a hull moving
// stern-first at a small drift angle reads as a small drift angle rather
// than ~180deg.
//   KNOWN LIMITATION, stated rather than hidden: the folded angle is looked
// up in the SAME CS curve either way, and the measurements are for a hull
// going forward. A V-sectioned hull travelling backwards is not the same
// foil. Folding is the better of the two available approximations, not a
// claim that direction does not matter.
// heaveZ (S8, trailing and optional — see hullResistance's own comment for
// why: isolated probes want the design-draft baseline, only core/
// integrator.js's live path passes the real state.z).
// theta (L5, the pitch DOF's own angle, rad): replaces the fore-aft crewPosX
// this function used to receive directly -- see clrXPosition's own comment.
// end (+1|-1, trailing and optional like heaveZ -- the isolated probes in
// harness/asserts-hull-ama.js and scratch/ call this at the default and are
// unaffected as long as hull.asymmetryLiftCoeff stays 0; only core/
// integrator.js's live path passes the real state.end): which physical side
// the ama is bolted to, needed by the asymmetry term below.
export function hullSideForce(u, v, r, theta, phi, config, heaveZ = 0, end = 1) {
  const { hull, rho_w } = config;
  const DEG = Math.PI / 180;
  const L = hull.length;
  const draftRatio = Math.max(0.1, (hull.draft - heaveZ) / hull.draft);
  const stations = stationWeights(theta, phi, config, draftRatio);
  const effectiveLateralArea = (hull.lateralArea ?? 0) * draftRatio;
  // uDirection: smoothed sign of u, shared below by the migrating-CLR ramp
  // and by FxStrip's own direction term further down — one definition, one
  // u=0 regularisation (RK4 crosses u=0 on every shunt; see FxStrip's own
  // comment for why a bare sign() is not used).
  const uDirection = u / Math.sqrt(u * u + U_SMOOTH * U_SMOOTH);
  let Fy = 0;
  let Fx = 0;
  let yawMoment = 0;
  for (const st of stations) {
    const vLocal = v + r * st.x;
    const leewayRaw = Math.atan2(vLocal, u);
    const leewayFoldedRad = Math.abs(leewayRaw) <= Math.PI / 2
      ? Math.abs(leewayRaw)
      : Math.PI - Math.abs(leewayRaw);
    const leewayAbs = leewayFoldedRad;
    const leewayAbsDeg = leewayAbs / DEG;

    // --- Migrating centre of lateral resistance (D1, Archive/work-order-2026-
    // 08-05-statecznosc-kierunkowa.md) --------------------------------------
    // The station taper above (stationWeights) is fixed once crewPosX/phi are
    // set -- at r=0 every station sees the SAME leeway, the strip sum
    // factors, and the hull's whole yaw moment collapses to clrX*Fy with a
    // FIXED clrX. Measured directly: dM_hull/dTWA is 0.00-0.20 N*m/deg across
    // TWA70-160, i.e. no real directional stiffness. A real slender body's
    // lateral centre of pressure is not fixed either: Flay's CS(leeway) is
    // superlinear with no saturation (ADR 0004), which the paper's own
    // methodology (a two-channel force balance, X/Y only -- no yaw-moment
    // channel exists in the source, confirmed by reading it in full, see
    // data/README_input_data_EN.md's Flay citation) attributes to a
    // strengthening VORTEX-LIFT mechanism, not a stalling foil. A vortex that
    // strengthens with angle also strengthens as it convects along the hull,
    // which is a migration mechanism: it is weak where it forms (the LEADING
    // end, in the direction of travel) and strongest where it has had the
    // whole hull length to develop (the TRAILING end).
    //
    // Split CS at each station into a small-angle reference slope (csV2A*lambda,
    // the same linear term ADR 0004's own digitized fit already carries) and
    // the remainder -- the part responsible for the superlinear growth, i.e.
    // the vortex contribution:
    //   CS_lin  = min(CS, csV2A*lambda)   -- carried by the EXISTING taper
    //             (stationWeights), unchanged: this is what the model already
    //             does at small angles, where it is not the diagnosed problem.
    //   CS_vtx  = CS - CS_lin             -- carried by a SEPARATE, aft-
    //             ramped distribution (below), zero at leeway=0 by
    //             construction (CS_lin=CS there) and growing to dominate CS
    //             as leeway grows, per ADR 0004's own "strengthens, does not
    //             saturate" characterisation.
    // As leeway grows, more of the force routes through the aft-ramped term,
    // so the BLENDED centroid migrates aft -- toward, then past, the
    // existing fixed clrX -- exactly the missing mechanism the measurement
    // above named.
    //
    // The ramp's own shape is an explicit ASSUMPTION, not a fit: absent any
    // measured growth-rate for the vortex along the hull (Flay's source has
    // none, see above), a LINEAR ramp from 0 at the leading end to 2x the
    // flat share at the trailing end is the simplest non-degenerate choice
    // that (a) is parameter-free -- no new tunable magnitude, only the
    // existing measured CS curve reused -- and (b) preserves the total area
    // budget (mean weight 1, same discipline as stationWeights' own taper).
    // Its centroid works out to L/6 aft of the geometric midpoint (the
    // standard first moment of a linear ramp), materially further aft than
    // the existing clrX (L*0.05/2 = L/40) -- so the migration this adds is
    // not a rounding-error-sized correction.
    // "Leading"/"trailing" reads off uDirection, not a fixed hull end: this
    // is a flow-development effect, so it has to reverse with the direction
    // of travel (sternway, or the first instant after a shunt before u has
    // caught up) the same way FxStrip's own direction term already does --
    // not the boat-frame end-flip trap (ARCHITECTURE.md's own "no end
    // factor" note), a different thing: st.x already reads correctly across
    // a shunt because +x is defined as the active bow, but flow direction
    // within a single frame still needs u's own sign.
    const CS = hullSideForceCoeff(leewayAbsDeg, hull);
    const csLin = Math.min(CS, hull.csV2A * leewayAbsDeg);
    const csVtx = CS - csLin;
    const rampWeight = 1 - uDirection * (2 * st.x / L);
    const dARamp = st.dAFlat * rampWeight;

    const V2 = u * u + vLocal * vLocal;
    const FyQuadratic = -Math.sign(vLocal) * 0.5 * rho_w * V2
      * (csLin * st.dA + csVtx * dARamp);
    // The lift-like term above is quadratic in speed and vanishes as V -> 0,
    // but real hull/ama drag has a linear (viscous-regime) component that
    // dominates at very low speed instead of disappearing — without it, a
    // near-stalled boat (e.g. drifting close to head-to-wind) has
    // essentially no resistance to being blown sideways until it's already
    // picked up meaningful leeway speed. Independent of CS's own shape, so
    // it doesn't reopen that escape valve at normal sailing speeds, where
    // the quadratic term already dominates.
    //   Per strip it carries the station's own share of the lateral area, so
    // the strips still sum to exactly -lowSpeedSideDamping*v at r = 0.
    const areaShare = effectiveLateralArea > 0 ? st.dA / effectiveLateralArea : 0;
    const FyLinear = -hull.lowSpeedSideDamping * areaShare * vLocal;
    const FyFoil = FyQuadratic + FyLinear;

    // --- Cross-flow (broadside) drag -------------------------------------
    // A genuinely different physical regime from the foil-lift term above:
    // near true beam-on (90deg) the hull stops being a foil at all and
    // becomes a BLUFF BODY dragged side-on through the water (Cd ~ 1.1) —
    // an order of magnitude past anything the measured CS curve reaches
    // (CS holds flat at ~0.25 beyond its own 24deg extrapolation guard,
    // nowhere near a true flat-plate coefficient). Standard ship-
    // maneuvering cross-flow term Y_{v|v|}: opposes the TRANSVERSE
    // velocity, quadratic in it, so it is negligible at normal leeway
    // (v tiny) yet dominant near 90deg — it makes sailing sideways feel
    // like hitting a wall, exactly where the foil term's own physically-
    // reasonable flat hold would otherwise under-resist and leave the boat
    // in a spurious "sails sideways" state.
    // Scaled by sin(leewayAbs): the full broadside coefficient only applies
    // near beam-on (90deg) — at small-to-moderate drift the flow stays more
    // attached and the effective cross-flow Cd is lower, so this does not
    // over-damp the ordinary leeway/yaw transients of normal maneuvers (e.g.
    // the backwind-slam yaw yank) while still arresting a genuine beam-on
    // slide (sin ~ 1 there).
    const FyCross = -Math.sign(vLocal) * (hull.crossFlowDragCoeff ?? 0) * 0.5 * rho_w * st.dA * vLocal * vLocal * Math.sin(leewayAbs);

    const FyStrip = FyFoil + FyCross;
    // Induced drag is a FOIL property (side force tilted aft by the leeway
    // angle); the cross-flow term is already a pure resistance and must not be
    // re-counted as induced drag, so Fx uses the foil part only.
    //
    // "Sailing free" relief (docs/adr/0004): Flay's Fig 15 reports CR (total
    // resistance) DECREASING with leeway for V-shaped hulls — the opposite
    // of what a standard 2D induced-drag formula gives (Fx above grows with
    // sin(leeway) regardless of hull shape). The physical picture: a V-hull's
    // leeway-induced lift vector isn't purely perpendicular to the flow the
    // way a simple 2D foil's is — 3D effects at the veed underwater sections
    // give it a small FORWARD-projecting component this model's induced-drag
    // formula doesn't capture on its own. No quantitative CR-vs-leeway curve
    // was digitized (Fig 15 is described qualitatively only), so this is a
    // conservative, EXPLICITLY qualitative reproduction, not a fitted curve:
    // a relief fraction that ramps up from 0 at leeway=0, peaks around the
    // plateau window, and fades back to 0 by sailingFreeReliefFadeEndDeg,
    // beyond which Flay's own claim isn't made. Guarded by a direct
    // assertion in harness/asserts.js: total resistance at 8-12deg leeway
    // must not exceed the 0-deg value.
    const reliefPeak = hull.sailingFreeReliefPeak ?? 0;
    const reliefPlateauStartDeg = hull.sailingFreeReliefPlateauStartDeg ?? 8;
    const reliefPlateauEndDeg = hull.sailingFreeReliefPlateauEndDeg ?? 12;
    const reliefFadeEndDeg = hull.sailingFreeReliefFadeEndDeg ?? 24;
    let relief = 0;
    if (leewayAbsDeg > 0 && leewayAbsDeg <= reliefPlateauStartDeg) {
      relief = reliefPeak * (leewayAbsDeg / reliefPlateauStartDeg);
    } else if (leewayAbsDeg <= reliefPlateauEndDeg) {
      relief = reliefPeak;
    } else if (leewayAbsDeg <= reliefFadeEndDeg) {
      relief = reliefPeak * (1 - (leewayAbsDeg - reliefPlateauEndDeg) / (reliefFadeEndDeg - reliefPlateauEndDeg));
    }
    // The direction of induced drag is smoothed over U_SMOOTH rather than
    // taken as -sign(u): a bare sign() is a genuine C0 jump at u=0, and
    // unlike the u*|u| terms elsewhere in this file it does NOT vanish
    // there, because |FyFoil| keeps its nonzero low-speed linear part. RK4
    // loses its order across such a step, and the boat crosses u=0 on every
    // shunt. (uDirection itself is computed once, above the loop — shared
    // with the migrating-CLR ramp.)
    const FxStrip = -uDirection * Math.abs(FyFoil) * Math.sin(leewayAbs) * (1 - relief);

    Fy += FyStrip;
    Fx += FxStrip;
    yawMoment += st.x * FyStrip;
  }

  // --- Hull camber / windward-side asymmetry (docs/adr/0049, 2026-08-18) --
  // The vaka's windward side -- the ama's own side, per state.js's own
  // Conventions -- is built slightly more convex than the leeward side
  // (builder testimony, no measured magnitude -- see hull.asymmetryLiftCoeff's
  // own config.js comment). Flow along an asymmetric section behaves like a
  // cambered foil: a lift-like force toward the convex (windward/ama) side
  // that is PRESENT AT ZERO LEEWAY, unlike hullSideForceCoeff's CS(leeway)
  // above, which is exactly 0 there by construction -- Flay's tank tests
  // never measured a zero-leeway point (ADR 0004). The hull-scale analogue
  // of aero.js's sail camber; nothing equivalent existed for the hull before
  // this.
  //
  // A SINGLE lumped force, not per-station: the source gives no fore-aft
  // distribution, and HULL_STATIONS' own positions are symmetric about x=0
  // by construction (stationWeights), so spreading it uniformly across
  // stations would net to this same total Fy and exactly zero yaw moment
  // anyway -- computing it directly avoids inventing a lever arm nothing
  // supports. u*|u|, not u^2: sign-preserving like every other direction-of-
  // travel term in this file, so it fades out rather than assuming the
  // mechanism reverses the same way at sternway. No induced-drag Fx
  // contribution -- no measured L/D relationship exists for this term to
  // derive one from, unlike the leeway-driven foil term above.
  const asymmetryLiftCoeff = hull.asymmetryLiftCoeff ?? 0;
  Fy += asymmetryLiftCoeff * 0.5 * rho_w * u * Math.abs(u) * effectiveLateralArea * end;

  // --- Heel-induced hull asymmetry lift (docs/adr/0052, 2026-08-19) --
  // Distinct mechanism from asymmetryLiftCoeff above: even a hull that is
  // symmetric BY CONSTRUCTION stops being symmetric port/starboard once it
  // heels -- the submerged cross-section's two flanks present differently to
  // the flow (one more vertical, one more curved), the standard "asymmetric
  // waterline" source of heel-induced weather helm in yacht design. Keyed on
  // sin(phi) rather than the constant `end`: it is the boat's heeled STATE
  // that drives it, not which physical side is built which way. Structurally
  // identical to asymmetryLiftCoeff otherwise -- same lumped, single-term,
  // no-fore-aft-distribution, u*|u|, no-induced-drag reasoning applies (see
  // that term's own comment above), because the source for THIS term is the
  // same tier of evidence (general yacht-design literature, no
  // boat-specific magnitude -- see hull.heelLiftCoeff's own config.js
  // comment), not a measurement on this hull either.
  const heelLiftCoeff = hull.heelLiftCoeff ?? 0;
  Fy += heelLiftCoeff * Math.sin(phi) * 0.5 * rho_w * u * Math.abs(u) * effectiveLateralArea;

  return { Fx, Fy, yawMoment };
}

// amaDrag(u, v, r, phi, crewPos, end, config) -> { Fx, Fy, yawMoment }
//
// yawMoment (drag component): the ama's drag force acts at its lateral
// position (lever = ama.spacing, boat-frame side = `end` — the ama is bolted
// to ONE physical side, see state.js Conventions), so it produces a yaw
// moment like any other off-centreline force: moment = -y*Fx, standard r x F.
// The sign comes out so that INCREASED ama drag turns the bow TOWARD the ama
// side with no flip knob needed: e.g. end=+1 (ama at +y), Fx more negative
// (more drag) -> moment = -(spacing)*Fx more POSITIVE -> CCW -> the bow (+x)
// swings toward +y, the ama's own side. This is the manual's own rule III.3 —
// the ama sinks, creates drag, and rotates the canoe around it.
export function amaDrag(u, v, r, phi, crewPos, end, config) {
  const { ama, crew, rho_w, stability, hull, g } = config;
  const DEG = Math.PI / 180;
  const uAbs = Math.abs(u);
  // Immersion derived from HEEL WITH SIGN: the ama is pressed DEEPER as the
  // boat heels toward it (phi<0) and lifts CLEAR as it flies (phi>0). An
  // unsigned measure makes a flying ama report the same "fully immersed"
  // drag as a pressed one, i.e. maximum drag in the one configuration where
  // the float is not touching the water. So:
  //   - at rest (phi~0) it floats at restingImmersion on static buoyancy
  //     (the floor that keeps wetted surface from vanishing there);
  //   - pressed (phi<0) it grows to full submersion by phiSubmergeDeg;
  //   - flying (phi>0) it fades to zero wetted area by phiLiftoffDeg.
  // restingImmersion is the ama floating on its OWN weight — derived here
  // rather than repeated as a literal.
  const restingImmersion = ama.mass / ama.maxBuoyancy;

  // Crew weight the AMA actually carries. On a rigid platform, taking
  // moments about the hull centreline, a crew at crewPos (fraction of
  // ama.spacing outboard) puts crewPos*crew.mass onto the float. Expressed
  // as a fraction of the float's own buoyancy, that is the extra immersion
  // it must take. Note the consequence: crewPos above
  // ama.maxBuoyancy/crew.mass asks for more than the float can carry, so it
  // goes under — which is the physically right answer, and the reason that
  // ratio is the real upper limit on usable crew position for this boat.
  const crewOnAma = Math.max(0, crewPos) * crew.mass / ama.maxBuoyancy;

  // The crew's weight only immerses the float while the float is in the
  // water: once the rig is lifting it clear (phi past phiLiftoffDeg) the crew
  // is being lifted with it. Same liftoff fade the resting term uses.
  const phiSub = stability.phiSubmergeDeg * DEG;
  const phiLift = stability.phiLiftoffDeg * DEG;
  const immersion = phi < 0
    ? Math.min(1.3, restingImmersion + crewOnAma + (1.3 - restingImmersion) * Math.min(1, -phi / phiSub))
    : Math.min(1.3, (restingImmersion + crewOnAma) * Math.max(0, 1 - phi / phiLift));

  // Crew to LEEWARD (crewPos<0) eases the windward ama's wetted area a
  // little. The span is derived from the configured crew limit and clamped,
  // so the relief stays a 0-15% effect whatever that range is set to.
  const reliefSpan = Math.abs(crew.posMin) || 0.3;
  const outboardRelief = 1 - 0.15 * Math.min(1, Math.max(0, -crewPos) / reliefSpan);
  const Seff = ama.wettedSurface * immersion * outboardRelief;
  // Skin friction at the ama's own (shorter) length, same ITTC-57 line the
  // main hull uses above, times a form factor (1+k) — standard ITTC/Prohaska
  // ship-resistance practice for a body that isn't as finely-shaped as the
  // main hull's canoe entry (a stubbier slender float, more curvature per
  // unit length). The drag-ratio anchors in harness/asserts.js are the check
  // this must satisfy.
  const Cf = ittc57Cf(u, ama.length) * ama.formFactor;

  // Residuary (wave-making) resistance (docs/adr/0015). The ama is a slender
  // displacement body being dragged through the surface exactly like the
  // hull, and it is SHORTER, so at any given boat speed it sits at a HIGHER
  // Froude number — at u = 4 m/s the hull is at Fr 0.54 and the ama at 0.68,
  // both past their hump. A float that makes no waves at 8 knots is not a
  // physical float.
  //
  // Same functional form and the same Fr shape parameters as the hull: this
  // is the same phenomenon on a smaller body, not a new one, so a second set
  // of hump constants would be inventing precision. Scaled on the ama's own
  // immersed wetted area (Seff), so it grows and fades with immersion exactly
  // as the friction term does.
  //
  // This is also where the ama's steering authority legitimately lives. The
  // owner's manual (docs/sources/, ch. III) names this exact mechanism, and
  // putting the same authority into the FORM FACTOR instead requires values
  // 2-3x anything physical — the missing piece was never the form factor, it
  // was that half the float's resistance did not exist.
  const FrAma = uAbs / Math.sqrt(g * ama.length);
  const zAma = (FrAma - hull.residuaryFrPeak) / hull.residuaryFrWidth;
  const gaussAma = Math.exp(-zAma * zAma);
  const CrAma = ama.residuaryPeakCr * (FrAma > hull.residuaryFrPeak
    ? hull.residuaryTailPlateau + (1 - hull.residuaryTailPlateau) * gaussAma
    : gaussAma);

  const Fx = -Math.sign(u) * 0.5 * rho_w * (Cf + CrAma) * Seff * u * u;

  const yAma = ama.spacing * end;
  const yawMomentDrag = -yAma * Fx;

  // --- T4: the ama's own lateral plane (Archive/work-order-2026-08-05-
  // sterownosc.md) -----------------------------------------------------
  // The ama is a slender float, not a point — it has its own side force and
  // its own yaw damping, by the SAME strip integration hullSideForce already
  // does, on the ama's own (much shorter) length, at its own fixed lateral
  // offset yAma.
  //
  // Lateral (side-profile) area is not a field this boat's data has for the
  // ama, unlike hull.lateralArea. Derived from Seff (the immersion-scaled
  // WETTED surface amaDrag already computes above) by a cylinder's own
  // area ratio: a cylinder's full wetted surface is pi*D*length, its side
  // (projected) profile is D*length, so profile/wetted = 1/pi. This is a
  // ratio between two areas of the SAME body, not an absolute dimension —
  // far less sensitive to getting the ama's exact shape right than deriving
  // an absolute draft would be (see stability.phiLiftoffDeg's own comment
  // for why that attempt, at T5, was set aside).
  //
  // Reuses hullSideForceCoeff — the SAME measured CS(leeway) curve, same
  // precedent as the residuary term above ("the same phenomenon on a smaller
  // body, not a new one, so a second set of constants would be inventing
  // precision"). DELIBERATELY NARROWER than hullSideForce's own decomposition:
  // foil lift only, no low-speed linear damping (hull.lowSpeedSideDamping is
  // an absolute N-per-(m/s) figure calibrated to the WHOLE hull, not a
  // per-area coefficient, and applying it verbatim to a much smaller body
  // would overstate this specific term), no cross-flow term, and NO induced-
  // drag Fx contribution — amaDrag's own Fx above is already a complete
  // resistance figure; adding a second, foil-derived Fx here risks double-
  // counting drag the model already accounts for. Fy and yawMoment only.
  const amaLateralAreaFull = Seff / Math.PI;
  const yAmaSurge = r * yAma; // rigid-body surge correction at the ama's own fixed lateral offset
  const uAma = u - yAmaSurge;
  const dAama = amaLateralAreaFull / AMA_STATIONS;
  // K5 (Archive/work-order-2026-08-09-kryterium-bez-wiosla.md, = S11 from the
  // 08-02 work order): the ama's own centre of lateral resistance migrates
  // with drift angle by the SAME mechanism D1 gave the hull (ADR 0032,
  // hullSideForce's own csLin/csVtx split above) -- T4 already made the
  // ama's side force a strip integration, but with a flat CS(leeway) at
  // every station, so its own CLR stayed fixed at the geometric centroid the
  // way the hull's did before D1. Reused verbatim, at the ama's own length
  // and its own uDirection (uAma, not the hull's u -- the ama sees the
  // rigid-body surge correction above, and after a shunt or near u=0 the two
  // can disagree).
  const uDirectionAma = uAma / Math.sqrt(uAma * uAma + U_SMOOTH * U_SMOOTH);
  let FySide = 0, yawMomentSide = 0;
  for (let i = 0; i < AMA_STATIONS; i++) {
    const x = -ama.length / 2 + (i + 0.5) * (ama.length / AMA_STATIONS);
    const vLocal = v + r * x;
    const leewayRaw = Math.atan2(vLocal, uAma);
    const leewayAbsDeg = (Math.abs(leewayRaw) <= Math.PI / 2 ? Math.abs(leewayRaw) : Math.PI - Math.abs(leewayRaw)) / DEG;
    const CS = hullSideForceCoeff(leewayAbsDeg, hull);
    const csLin = Math.min(CS, hull.csV2A * leewayAbsDeg);
    const csVtx = CS - csLin;
    const rampWeight = 1 - uDirectionAma * (2 * x / ama.length);
    const dAamaRamp = dAama * rampWeight;
    const V2 = uAma * uAma + vLocal * vLocal;
    const FyStrip = -Math.sign(vLocal) * 0.5 * rho_w * V2 * (csLin * dAama + csVtx * dAamaRamp);
    FySide += FyStrip;
    yawMomentSide += x * FyStrip;
  }

  return { Fx, Fy: FySide, yawMoment: yawMomentDrag + yawMomentSide };
}
