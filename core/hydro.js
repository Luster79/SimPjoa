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
  const Fr = uAbs / Math.sqrt(g * hull.length);
  const z = (Fr - hull.residuaryFrPeak) / hull.residuaryFrWidth;
  const Cr = hull.residuaryPeakCr * Math.exp(-z * z);
  const residuary = 0.5 * rho_w * hull.wettedSurface * Cr * uAbs * uAbs;

  return -Math.sign(u) * (friction + residuary);
}

// hullSideForce(u, v, crewPosX, config) -> { Fx, Fy, yawMoment }
//   Fy: low-AR-foil side force, saturating at hull.leewaySaturationDeg and
//   then DEGRADING (not plateauing) past it — a foil beyond its designed
//   leeway range stalls and mushes sideways rather than continuing to
//   generate steady side force, per FIX_REQUEST_step1_round2.md R2-1.
//   Fx: induced drag. A foil's side force is never free: it costs drag
//   proportional to Fy tilted aft by the RAW (unclamped) leeway angle, so
//   the penalty keeps growing past saturation even as Fy itself falls off.
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
  const satRad = (hull.leewaySaturationDeg * Math.PI) / 180;
  const leewayRaw = Math.atan2(v, Math.abs(u) + 0.05);
  const leewayAbs = Math.abs(leewayRaw);
  const leewayClamped = Math.min(leewayAbs, satRad);

  const excess = Math.max(0, leewayAbs - satRad);
  const mushFalloff = 1 / (1 + hull.leewayMushingCoeff * excess);

  const V2 = u * u + v * v;
  const FyQuadratic = -Math.sign(v) * hull.sideForceCoeff * Math.sin(leewayClamped) * mushFalloff * 0.5 * rho_w * hull.wettedSurface * V2;
  // The lift-like term above is quadratic in speed and vanishes as V -> 0,
  // but real hull/ama drag has a linear (viscous-regime) component that
  // dominates at very low speed instead of disappearing — without it, a
  // near-stalled boat (e.g. drifting close to head-to-wind, sideForceCoeff
  // tuned low per FIX_REQUEST_step1_round2.md R2-1) has essentially no
  // resistance to being blown sideways until it's already picked up
  // meaningful leeway speed. This term is independent of sideForceCoeff so
  // it doesn't reopen the R2-1 escape valve at normal sailing speeds, where
  // the quadratic term already dominates.
  const FyLinear = -hull.lowSpeedSideDamping * v;
  const FyFoil = FyQuadratic + FyLinear;

  // --- Cross-flow (broadside) drag (R9 follow-up) ---
  // Past stall the hull stops being a foil and becomes a BLUFF BODY dragged
  // side-on through the water: large cross-flow pressure drag on the lateral
  // plane (Cd ~ 1.1) that the foil-lift term above CANNOT capture — that
  // term mushes to near zero past the ~15deg stall, so at beam-on the old
  // model left the hull almost free to slide sideways (a spurious
  // sail-sideways / stuck-crabbing attractor; see the ROUND9 findings).
  // Standard ship-maneuvering cross-flow term Y_{v|v|}: opposes the
  // TRANSVERSE velocity, quadratic in it, so it is negligible at normal
  // leeway (v tiny) yet dominant near 90deg leeway — it makes sailing
  // sideways feel like hitting a wall.
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
  const Fx = -Math.sign(u) * Math.abs(FyFoil) * Math.sin(leewayAbs);

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
