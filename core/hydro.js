// hydro.js — hull and ama hydrodynamics: longitudinal resistance, leeway
// side force (low-aspect-ratio boardless-hull foil), ama drag, yaw damping.
// All coefficients not directly given by the prompt are tunable estimates
// (see data/README_input_data_EN.md for the calibrated-vs-estimated split).

// ITTC-57 model-ship correlation line, shared by the main hull and the ama:
// both are slender bodies moving lengthwise through the water (the ama is
// NOT a bluff cross-flow body — it trails fore-aft like a second, smaller
// hull), so both get skin-friction resistance from the same formula, just
// at their own length/Reynolds number (round 7, R7-1 — replaces the old
// hull.Cf constant and the ama's unrelated bluff-body dragCoeff=0.4, which
// was the root cause of the ama out-dragging the main hull 26-30x).
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

  // Residuary (wave-making) resistance: round 9, R9-1. A slender L/B=10:1
  // canoe hull makes little wave and has no hard "hull speed" wall the way
  // a displacement monohull (L/B~3-4) does — expressed in the same
  // nondimensional form as friction (Cr, not a raw force-scaling constant)
  // as a bounded Gaussian hump peaking near the main prismatic hump
  // (residuaryFrPeak), never growing past a few x friction. See config.js
  // hull.residuaryPeakCr/FrPeak/FrWidth comment for the literature basis.
  //
  // Past the hump (Fr > FrPeak) the pure Gaussian falls back toward 0,
  // which is the "gear change" hysteresis bug P1 fixes (docs/work-order-
  // 2026-07-22.md; docs/diagnostic-2026-07-22-residuary-hump.md; docs/adr/
  // 0006): the settle-gate could reach a second, unphysically fast branch
  // riding that low tail. A slender hull's residuary resistance doesn't
  // fall all the way back to ~friction-only past the hump, so the tail is
  // held at a plateau fraction of the peak instead of decaying to 0.
  const Fr = uAbs / Math.sqrt(g * hull.length);
  const z = (Fr - hull.residuaryFrPeak) / hull.residuaryFrWidth;
  const gaussian = Math.exp(-z * z);
  const Cr = hull.residuaryPeakCr * (Fr > hull.residuaryFrPeak
    ? hull.residuaryTailPlateau + (1 - hull.residuaryTailPlateau) * gaussian
    : gaussian);
  const residuary = 0.5 * rho_w * hull.wettedSurface * Cr * uAbs * uAbs;

  return -Math.sign(u) * (friction + residuary);
}

// hullSideForceCoeff(lambdaDeg, hull) -> CS, the measured-anchored side-
// force coefficient (round 10, R10-3, docs/adr/0004) — see config.js's
// csV2A/csV2B/csV1A/csV1B/csBlendStartDeg/csBlendEndDeg comment for the
// full derivation. Three regimes: V2's own quadratic fit (0..blendStart,
// measured 0-16deg), a linear blend toward V1's fitted value
// (blendStart..blendEnd, 16-24deg — no V2 data past 16deg, so continuing
// V2's OWN steeper curve would be an unconstrained runaway; V1's slower,
// independently-measured growth is a more defensible extrapolation
// target), and a flat hold beyond blendEnd (an explicit, provenance-free
// extrapolation guard — genuinely untested territory for either hull).
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

// hullSideForce(u, v, crewPosX, config) -> { Fx, Fy, yawMoment }
//   Fy: low-AR-foil side force via the measured CS(leeway) curve above —
//   round 10, R10-3 replaces the old saturate-then-mush shape (no
//   saturation observed in Flay's measured 0-16deg range; the vortex-lift
//   mechanism STRENGTHENS with leeway there, the opposite of the old
//   model's behavior inside that range).
//   Fx: induced drag. A foil's side force is never free: it costs drag
//   proportional to Fy tilted aft by the RAW (unclamped) leeway angle.
//   crewPosX (fore-aft crew position, -1..1): phenomenological CLR shift,
//   no pitch DOF (FIX_REQUEST_round4_roll_dof.md 1.5) — weight forward
//   moves the center of lateral resistance forward by
//   crewForeAftTrimCoeff*crewPosX*(hull.length/2), leaving the CE
//   effectively aft of the CLR, which should luff the boat (verified
//   empirically against the 1.6 coupling-sign test; config.hull.crewTrimSign
//   is a flip knob if the physical rig runs the other way).
// clrXPosition(crewPosX, config) -> x offset from CG (boat frame, +fwd)
//   Shared by hullSideForce (below) and aero.js's sail CE geometry (round
//   7, D-6, ROUND7_DECISION.md): the CE-CLR "lead" concept only means
//   anything if both sides of it reference the SAME point.
export function clrXPosition(crewPosX, config) {
  const { hull } = config;
  const crewTrimSign = hull.crewTrimSign ?? 1;
  return -(hull.clrXFraction ?? 0.1) * (hull.length / 2)
    + crewTrimSign * (hull.crewForeAftTrimCoeff ?? 0) * crewPosX * (hull.length / 2);
}

export function hullSideForce(u, v, crewPosX, config) {
  const { hull, rho_w } = config;
  const DEG = Math.PI / 180;
  const leewayRaw = Math.atan2(v, Math.abs(u) + 0.05);
  const leewayAbs = Math.abs(leewayRaw);
  const leewayAbsDeg = leewayAbs / DEG;

  const CS = hullSideForceCoeff(leewayAbsDeg, hull);
  const V2 = u * u + v * v;
  const FyQuadratic = -Math.sign(v) * CS * 0.5 * rho_w * (hull.lateralArea ?? 0) * V2;
  // The lift-like term above is quadratic in speed and vanishes as V -> 0,
  // but real hull/ama drag has a linear (viscous-regime) component that
  // dominates at very low speed instead of disappearing — without it, a
  // near-stalled boat (e.g. drifting close to head-to-wind) has
  // essentially no resistance to being blown sideways until it's already
  // picked up meaningful leeway speed. Independent of CS's own shape, so
  // it doesn't reopen that escape valve at normal sailing speeds, where
  // the quadratic term already dominates.
  const FyLinear = -hull.lowSpeedSideDamping * v;
  const FyFoil = FyQuadratic + FyLinear;

  // --- Cross-flow (broadside) drag (R9 follow-up; role updated R10-3) ---
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
  // reasonable flat hold would otherwise under-resist (the original,
  // still-valid motivation: see the ROUND9 findings for the spurious
  // "sails sideways" state this fixed).
  // Scaled by sin(leewayAbs): the full broadside coefficient only applies
  // near beam-on (90deg) — at small-to-moderate drift the flow stays more
  // attached and the effective cross-flow Cd is lower, so this does not
  // over-damp the ordinary leeway/yaw transients of normal maneuvers (e.g.
  // the backwind-slam yaw yank) while still arresting a genuine beam-on
  // slide (sin ~ 1 there).
  const FyCross = -Math.sign(v) * (hull.crossFlowDragCoeff ?? 0) * 0.5 * rho_w * (hull.lateralArea ?? 0) * v * v * Math.sin(leewayAbs);

  const Fy = FyFoil + FyCross;
  // Induced drag is a FOIL property (side force tilted aft by the leeway
  // angle); the cross-flow term is already a pure resistance and must not be
  // re-counted as induced drag, so Fx uses the foil part only.
  //
  // "Sailing free" relief (round 10, R10-3): Flay's Fig 15 reports CR
  // (total resistance) DECREASING with leeway for V-shaped hulls — the
  // opposite of what a standard 2D induced-drag formula gives (Fx above
  // grows with sin(leeway) regardless of hull shape). The physical
  // picture: a V-hull's leeway-induced lift vector isn't purely
  // perpendicular to the flow the way a simple 2D foil's is — 3D effects
  // at the veed underwater sections give it a small FORWARD-projecting
  // component this model's induced-drag formula doesn't capture on its
  // own. No quantitative CR-vs-leeway curve was digitized (Fig 15 is
  // described qualitatively only), so this is a conservative, EXPLICITLY
  // qualitative reproduction, not a fitted curve: a relief fraction that
  // ramps up from 0 at leeway=0, peaks around sailingFreeReliefPeakDeg,
  // and fades back to 0 by sailingFreeReliefEndDeg (beyond which Flay's
  // own claim isn't made). Verified against a direct assertion (harness/
  // asserts.js): total resistance at 8-12deg leeway must not exceed the
  // 0-deg value.
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
  const Fx = -Math.sign(u) * Math.abs(FyFoil) * Math.sin(leewayAbs) * (1 - relief);

  // Center of lateral resistance offset from CG (slightly aft, tunable) — gives
  // a modest weather-helm-like turning tendency rather than zero yaw coupling.
  // crewTrimSign*crewForeAftTrimCoeff*crewPosX shifts it fore/aft with
  // fore-aft crew position (FIX_REQUEST_round4_roll_dof.md 1.5).
  const clrX = clrXPosition(crewPosX, config);
  const yawMoment = clrX * Fy;

  return { Fx, Fy, yawMoment };
}

// amaDrag(u, amaLoad, crewPos, end, config) -> { Fx, yawMoment }
//   yawMoment (ROUND5_CONSOLIDATED_work_order.md P2-1, Pjoa manual III.3:
//   the ama's drag rotates the canoe around it): the ama's drag force acts
//   at its lateral position (lever = ama.spacing, boat-frame side = `end`
//   — the ama is bolted to ONE physical side, see state.js Conventions),
//   so it produces a yaw moment same as any other off-centerline force —
//   moment = -y*Fx (standard r x F, y = ama.spacing*end). Signed so
//   INCREASED ama drag turns the bow TOWARD the ama side with no extra
//   flip knob needed: e.g. end=+1 (ama at +y), Fx more negative (more
//   drag) -> moment = -(spacing)*Fx more POSITIVE -> CCW -> the bow (+x)
//   swings toward +y, the ama's own side. The round-4 crew-immersion term
//   above already modulates this drag with crewPos, so "crew toward the
//   ama sinks it, and the extra drag swings the bow toward the ama" (the
//   manual's rule I) emerges with no new controls.
export function amaDrag(u, amaLoad, crewPos, end, config) {
  const { ama, crew, rho_w } = config;
  // Even at zero heel the ama still floats partially immersed at rest on
  // its own static buoyancy (it isn't hauled out just because there's no
  // sail force) — a floor keeps its wetted surface from vanishing to zero.
  const restingImmersion = 0.3;
  const heelImmersion = Math.max(restingImmersion, Math.min(amaLoad, 1.3));

  // Crew weight standing at/near the ama presses it physically deeper into
  // the water — a direct weight effect, separate from (and not captured
  // by) amaLoad, which only measures the SAIL's heeling demand vs righting
  // capacity and can be near-zero even with the crew's full weight sitting
  // right on the ama. Without this term, moving crew to windward looks
  // purely free (less heel => less amaLoad => less drag), letting ballast
  // erase the leeway/induced-drag cost of pointing high with no downside —
  // verified during FIX_REQUEST_step1_round2.md R2-1 review (mushing
  // coefficient had zero effect on the polar's actual TWA=40 optimum
  // because that optimum ballasts to crewPos=1.0 and never approaches
  // leeway saturation). Scales with crew mass relative to ama buoyancy so
  // a heavier crew on a smaller ama pays proportionally more.
  const crewImmersion = Math.max(0, crewPos) * ama.crewImmersionCoeff * (crew.mass / ama.maxBuoyancy);

  const immersion = Math.min(heelImmersion + crewImmersion, 1.3);
  const outboardRelief = 1 - 0.15 * (Math.max(0, -crewPos) / 0.3);
  const Seff = ama.wettedSurface * immersion * outboardRelief;
  // Skin friction at the ama's own (shorter) length, same ITTC-57 line the
  // main hull uses above, times a form factor (1+k) — standard ITTC/Prohaska
  // ship-resistance practice for a body that isn't as finely-shaped as the
  // main hull's canoe entry (a stubbier slender float, more curvature per
  // unit length). Round 7 R7-1's hard anchor (10-25% of hull drag at static
  // immersion, rising to 50-80% at max, never above parity) is the check
  // this must satisfy — see harness/asserts.js and ARCHITECTURE's
  // calibration section for the derivation.
  const Cf = ittc57Cf(u, ama.length) * ama.formFactor;
  const Fx = -Math.sign(u) * 0.5 * rho_w * Cf * Seff * u * u;

  const yAma = ama.spacing * end;
  const yawMoment = -yAma * Fx;

  return { Fx, yawMoment };
}

export function yawDamping(r, u, config) {
  return -config.hull.yawDampingCoeff * r * (1 + Math.abs(u));
}
