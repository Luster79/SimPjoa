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
// Stations for the ama's own strip integration (T4, docs/work-order-2026-08-
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

export function hullResistance(u, config) {
  const { hull, rho_w, g } = config;
  const uAbs = Math.abs(u);
  const Cf = ittc57Cf(u, hull.length);
  const friction = 0.5 * rho_w * hull.wettedSurface * Cf * uAbs * uAbs;

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
  const residuary = 0.5 * rho_w * hull.wettedSurface * Cr * uAbs * uAbs;

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

// clrXPosition(crewPosX, config) -> x offset from CG (boat frame, +fwd).
//
// The model's ONE statement of where the centre of lateral resistance sits.
// Shared by hullSideForce (via stationWeights) and by aero.js's sail CE
// geometry: the CE-CLR "lead" concept only means anything if both sides of
// it reference the same point.
//
// crewPosX (fore-aft crew position, -1..1) shifts it phenomenologically —
// there is no pitch DOF. Weight forward moves the CLR forward, leaving the
// CE effectively aft of it, which luffs the boat. config.hull.crewTrimSign
// is a flip knob if a physical rig ever runs the other way.
export function clrXPosition(crewPosX, config) {
  const { hull } = config;
  const crewTrimSign = hull.crewTrimSign ?? 1;
  return -(hull.clrXFraction ?? 0.1) * (hull.length / 2)
    + crewTrimSign * (hull.crewForeAftTrimCoeff ?? 0) * crewPosX * (hull.length / 2);
}

// stationWeights(crewPosX, phi, config) -> per-strip lateral areas, bow-last.
//
// The lateral plane is NOT distributed uniformly along the length: its
// centroid is the centre of lateral resistance, which sits aft of the CG
// (hull.clrXFraction) and moves with fore-aft crew trim. A uniform strip
// distribution would put the centroid at the CG and delete the hull's
// weathercocking entirely -- so the distribution carries the same clrX the
// model already uses, rather than a second, independent statement of it.
//
// heelClrShiftCoeff (T3, docs/work-order-2026-08-05-sterownosc.md): the SAME
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
function stationWeights(crewPosX, phi, config) {
  const { hull } = config;
  const L = hull.length;
  const heelClrSign = hull.heelClrSign ?? 1;
  const heelShift = heelClrSign * (hull.heelClrShiftCoeff ?? 0) * Math.sin(phi) * (L / 2);
  const xc = clrXPosition(crewPosX, config) + heelShift;
  const k = Math.max(-2 / L, Math.min(2 / L, (12 * xc) / (L * L)));
  const dA = (hull.lateralArea ?? 0) / HULL_STATIONS;
  const out = [];
  for (let i = 0; i < HULL_STATIONS; i++) {
    const x = -L / 2 + (i + 0.5) * (L / HULL_STATIONS);
    out.push({ x, dA: dA * (1 + k * x) });
  }
  return out;
}

// hullSideForce(u, v, r, crewPosX, phi, config) -> { Fx, Fy, yawMoment }
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
export function hullSideForce(u, v, r, crewPosX, phi, config) {
  const { hull, rho_w } = config;
  const DEG = Math.PI / 180;
  const stations = stationWeights(crewPosX, phi, config);
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

    const CS = hullSideForceCoeff(leewayAbsDeg, hull);
    const V2 = u * u + vLocal * vLocal;
    const FyQuadratic = -Math.sign(vLocal) * CS * 0.5 * rho_w * st.dA * V2;
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
    const areaShare = (hull.lateralArea ?? 0) > 0 ? st.dA / hull.lateralArea : 0;
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
    // shunt.
    const uDirection = u / Math.sqrt(u * u + U_SMOOTH * U_SMOOTH);
    const FxStrip = -uDirection * Math.abs(FyFoil) * Math.sin(leewayAbs) * (1 - relief);

    Fy += FyStrip;
    Fx += FxStrip;
    yawMoment += st.x * FyStrip;
  }

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

  // --- T4: the ama's own lateral plane (docs/work-order-2026-08-05-
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
  let FySide = 0, yawMomentSide = 0;
  for (let i = 0; i < AMA_STATIONS; i++) {
    const x = -ama.length / 2 + (i + 0.5) * (ama.length / AMA_STATIONS);
    const vLocal = v + r * x;
    const leewayRaw = Math.atan2(vLocal, uAma);
    const leewayAbsDeg = (Math.abs(leewayRaw) <= Math.PI / 2 ? Math.abs(leewayRaw) : Math.PI - Math.abs(leewayRaw)) / DEG;
    const CS = hullSideForceCoeff(leewayAbsDeg, hull);
    const V2 = uAma * uAma + vLocal * vLocal;
    const FyStrip = -Math.sign(vLocal) * CS * 0.5 * rho_w * dAama * V2;
    FySide += FyStrip;
    yawMomentSide += x * FyStrip;
  }

  return { Fx, Fy: FySide, yawMoment: yawMomentDrag + yawMomentSide };
}
