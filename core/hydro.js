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

export function hullSideForce(u, v, config) {
  const { hull, rho_w } = config;
  const satRad = (hull.leewaySaturationDeg * Math.PI) / 180;
  const leewayRaw = Math.atan2(v, Math.abs(u) + 0.05);
  const leewayClamped = Math.max(-satRad, Math.min(satRad, leewayRaw));

  const V2 = u * u + v * v;
  const Fy = -Math.sign(v) * hull.sideForceCoeff * Math.sin(Math.abs(leewayClamped)) * 0.5 * rho_w * hull.wettedSurface * V2;

  // Center of lateral resistance offset from CG (slightly aft, tunable) — gives
  // a modest weather-helm-like turning tendency rather than zero yaw coupling.
  const clrX = -(hull.clrXFraction ?? 0.1) * (hull.length / 2);
  const yawMoment = clrX * Fy;

  return { Fy, yawMoment };
}

export function amaDrag(u, amaLoad, crewPos, config) {
  const { ama, rho_w } = config;
  // Even at zero heel the ama still floats partially immersed at rest on
  // its own static buoyancy (it isn't hauled out just because there's no
  // sail force) — a floor keeps its wetted surface from vanishing to zero.
  const restingImmersion = 0.3;
  const immersion = Math.max(restingImmersion, Math.min(amaLoad, 1.3));
  const outboardRelief = 1 - 0.15 * (Math.max(0, -crewPos) / 0.3);
  const Seff = ama.wettedSurface * immersion * outboardRelief;
  return -Math.sign(u) * 0.5 * rho_w * ama.dragCoeff * Seff * u * u;
}

export function yawDamping(r, u, config) {
  return -config.hull.yawDampingCoeff * r * (1 + Math.abs(u));
}
