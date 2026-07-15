// hydro.js — hull and ama hydrodynamics: longitudinal resistance, leeway
// side force (low-aspect-ratio boardless-hull foil), ama drag, yaw damping.
// All coefficients not directly given by the prompt are tunable estimates
// (see data/README_input_data_EN.md for the calibrated-vs-estimated split).

export function hullResistance(u, config) {
  const { hull, rho_w, g } = config;
  const uAbs = Math.abs(u);
  const friction = 0.5 * rho_w * hull.wettedSurface * hull.Cf * uAbs * uAbs;

  const Fr = uAbs / Math.sqrt(g * hull.length);
  const uThreshold = hull.froudeThreshold * Math.sqrt(g * hull.length);
  const over = Math.max(0, uAbs - uThreshold);
  const wavePenalty = Fr > hull.froudeThreshold ? hull.waveResistanceCoeff * over * over * over * over : 0;

  return -Math.sign(u) * (friction + wavePenalty);
}

// hullSideForce(u, v, config) -> { Fx, Fy, yawMoment }
//   Fy: low-AR-foil side force, saturating at hull.leewaySaturationDeg and
//   then DEGRADING (not plateauing) past it — a foil beyond its designed
//   leeway range stalls and mushes sideways rather than continuing to
//   generate steady side force, per FIX_REQUEST_step1_round2.md R2-1.
//   Fx: induced drag. A foil's side force is never free: it costs drag
//   proportional to Fy tilted aft by the RAW (unclamped) leeway angle, so
//   the penalty keeps growing past saturation even as Fy itself falls off.
export function hullSideForce(u, v, config) {
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
  const Fy = FyQuadratic + FyLinear;
  const Fx = -Math.sign(u) * Math.abs(Fy) * Math.sin(leewayAbs);

  // Center of lateral resistance offset from CG (slightly aft, tunable) — gives
  // a modest weather-helm-like turning tendency rather than zero yaw coupling.
  const clrX = -(hull.clrXFraction ?? 0.1) * (hull.length / 2);
  const yawMoment = clrX * Fy;

  return { Fx, Fy, yawMoment };
}

export function amaDrag(u, amaLoad, crewPos, config) {
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
  return -Math.sign(u) * 0.5 * rho_w * ama.dragCoeff * Seff * u * u;
}

export function yawDamping(r, u, config) {
  return -config.hull.yawDampingCoeff * r * (1 + Math.abs(u));
}
