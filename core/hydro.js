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
// Speed scale over which direction-of-travel terms are smoothed instead of
// switching discontinuously at u=0 (block F, work-order-2026-07-30). Matches
// the ittc57Cf Reynolds floor, so the two low-speed regularisations agree.
const U_SMOOTH = 0.05; // m/s
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

  // sign(u)*uAbs^2 is exactly u*|u| — written directly, no sign() switch.
  return -(friction + residuary) * Math.sign(u);
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
  // Block F (work-order-2026-07-30): the drift angle is measured against the
  // SIGNED u. It used to use `Math.abs(u) + 0.05`, which after a shunt — where
  // u is legitimately negative while the boat still carries its old way (see
  // core/shunt.js) — computed the leeway as though the hull were going bow
  // first. The magnitude fed to the CS curve is then folded into [0,90] the
  // same way aero.js folds the sail's alpha, so a hull moving stern-first at a
  // small drift angle reads as a small drift angle rather than ~180deg.
  //   KNOWN LIMITATION, stated rather than hidden: the folded angle is looked
  // up in the SAME CS curve either way, and Flay's measurements are for a hull
  // going forward. A V-sectioned hull travelling backwards is not the same
  // foil. Folding is the better of the two available approximations, not a
  // claim that direction does not matter.
  const leewayRaw = Math.atan2(v, u);
  const leewayFoldedRad = Math.abs(leewayRaw) <= Math.PI / 2
    ? Math.abs(leewayRaw)
    : Math.PI - Math.abs(leewayRaw);
  const leewayAbs = leewayFoldedRad;
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
  // Block F: the direction of induced drag was `-Math.sign(u)`, a genuine C0
  // jump at u=0 — and unlike the u*|u| terms elsewhere in this file it does NOT
  // vanish there, because |FyFoil| keeps the nonzero low-speed linear part. RK4
  // loses its order across such a step, and the boat crosses u=0 on every
  // shunt. Same magnitude, smoothed over a small speed scale.
  const uDirection = u / Math.sqrt(u * u + U_SMOOTH * U_SMOOTH);
  const Fx = -uDirection * Math.abs(FyFoil) * Math.sin(leewayAbs) * (1 - relief);

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
//   swings toward +y, the ama's own side. (The manual's rule I — crew
//   toward the ama sinks it, swinging the bow that way — rode on the
//   crew-immersion term removed by F1; it returns with the corrected
//   crew/ama-buoyancy coupling in F14.)
export function amaDrag(u, phi, crewPos, end, config) {
  const { ama, crew, rho_w, stability, hull, g } = config;
  const DEG = Math.PI / 180;
  const uAbs = Math.abs(u);
  // Immersion derived from HEEL WITH SIGN (F1, work-order-2026-07-30). The
  // ama is pressed DEEPER as the boat heels toward it (phi<0) and lifts CLEAR
  // as it flies (phi>0). Earlier this took the UNSIGNED amaLoad from
  // computeAmaLoad(), whose two branches both GROW with |phi| — so a flying
  // ama (phi>0) reported the same "fully immersed" drag as a pressed one,
  // i.e. maximum ama drag in the one configuration where the float isn't
  // touching the water. Now:
  //   - at rest (phi~0) it floats at restingImmersion on static buoyancy
  //     (the floor that keeps wetted surface from vanishing there);
  //   - pressed (phi<0) it grows to full submersion by phiSubmergeDeg;
  //   - flying (phi>0) it fades to zero wetted area by phiLiftoffDeg.
  // restingImmersion is the ama floating on its OWN weight: ama.mass /
  // ama.maxBuoyancy = 25/80 = 0.31, which is where the hand-picked 0.30 came
  // from — derived here rather than repeated as a literal.
  const restingImmersion = ama.mass / ama.maxBuoyancy;

  // Crew weight the AMA actually carries (F14, work-order-2026-07-30).
  // On a rigid platform, taking moments about the hull centreline, a crew at
  // crewPos (fraction of ama.spacing outboard) puts crewPos*crew.mass onto
  // the float. Expressed as a fraction of the float's own buoyancy, that is
  // the extra immersion it must take. At crewPos=1.0 this is 90/80 = 1.125 —
  // MORE than the ama can float, so it goes under, which is the physically
  // right answer and why crewPos above maxBuoyancy/crew.mass = 0.889 is
  // unusable on this boat.
  //   Previously this was `crewPos * crewImmersionCoeff * (crew.mass /
  // maxBuoyancy)` with crewImmersionCoeff = 0.30 — i.e. exactly 1/3 of the
  // physical effect, and a coefficient the config comment admits was raised
  // from 0.21 to keep a polar acceptance ratio in band. It is now derived,
  // not tuned, and crewImmersionCoeff is deleted.
  const crewOnAma = Math.max(0, crewPos) * crew.mass / ama.maxBuoyancy;

  // The crew's weight only immerses the float while the float is in the
  // water: once the rig is lifting it clear (phi past phiLiftoffDeg) the crew
  // is being lifted with it. Same liftoff fade the resting term uses.
  const phiSub = stability.phiSubmergeDeg * DEG;
  const phiLift = stability.phiLiftoffDeg * DEG;
  const immersion = phi < 0
    ? Math.min(1.3, restingImmersion + crewOnAma + (1.3 - restingImmersion) * Math.min(1, -phi / phiSub))
    : Math.min(1.3, (restingImmersion + crewOnAma) * Math.max(0, 1 - phi / phiLift));

  // Crew to LEEWARD (crewPos<0) eases the windward ama's wetted area a little
  // (unchanged from round 4).
  // Block F: the 0.3 here was silently |crew.posMin|'s default. validateConfig
  // permits posMin down to -1, which drove relief to 0.5 with no clamp. Derive
  // the span from the configured limit and clamp it, so the relief stays a
  // 0-15% effect whatever the crew's range is set to.
  const reliefSpan = Math.abs(crew.posMin) || 0.3;
  const outboardRelief = 1 - 0.15 * Math.min(1, Math.max(0, -crewPos) / reliefSpan);
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

  // Residuary (wave-making) resistance — AC-1 (2026-08-03). The ama had
  // FRICTION ONLY, while the main hull has had friction + a bounded residuary
  // hump since R9-1 (docs/adr/0001, 0006). That asymmetry is not defensible:
  // the ama is a slender displacement body being dragged through the surface
  // exactly like the hull, and it is SHORTER, so at any given boat speed it
  // sits at a HIGHER Froude number. At u = 4 m/s the hull is at Fr 0.54 and
  // the ama at Fr 0.68 — both past their hump, the ama further past it. A
  // float that makes no waves at 8 knots is not a physical float.
  //
  // Same functional form and the same Fr shape parameters as the hull: this
  // is the same phenomenon on a smaller body, not a new one, so inventing a
  // second set of hump constants would be inventing precision. Scaled on the
  // ama's own immersed wetted area (Seff), so it grows and fades with
  // immersion exactly as the friction term does.
  //
  // This is also the honest home for authority that the project has twice put
  // in the wrong place. Round 7 raised ama.formFactor to 3.3 — 2-3x any
  // physical (1+k) — because it "was the minimum ama-drag authority that kept
  // T1's crew-toward-ama steering leg correctly signed". Round 9 correctly
  // refused that and cut it to a physical 1.2, and in doing so dropped the
  // steering criterion as unphysical. The owner's manual (docs/sources/,
  // ch. III) says the criterion is real and names this exact mechanism: "the
  // ama sinks (creates drag) and rotates the canoe around". Both rounds were
  // right about their own point; the missing piece was never the form factor,
  // it was that half the float's resistance did not exist.
  const FrAma = uAbs / Math.sqrt(g * ama.length);
  const zAma = (FrAma - hull.residuaryFrPeak) / hull.residuaryFrWidth;
  const gaussAma = Math.exp(-zAma * zAma);
  const CrAma = ama.residuaryPeakCr * (FrAma > hull.residuaryFrPeak
    ? hull.residuaryTailPlateau + (1 - hull.residuaryTailPlateau) * gaussAma
    : gaussAma);

  const Fx = -Math.sign(u) * 0.5 * rho_w * (Cf + CrAma) * Seff * u * u;

  const yAma = ama.spacing * end;
  const yawMoment = -yAma * Fx;

  return { Fx, yawMoment };
}

// yawDamping(r, u, config) -> N*m, the BARE HULL's resistance to yawing.
//
// F10 (work-order-2026-07-30) replaced `-yawDampingCoeff * r * (1 + |u|)`.
// Two faults. Dimensionally, `1 + |u|` adds a bare 1 to a speed in m/s, so the
// expression has no consistent units and does not survive a change of them.
// Physically, the consequence: at u = 0 it still returned FULL damping
// (-270 N*m at r = 0.3), i.e. a boat sitting still resisted being spun as if
// it were making way.
//
// Standard manoeuvring form instead, two terms with distinct physics:
//   N_r    * u * r      — the lifting/circulatory term. Needs flow over the
//                         hull, so it vanishes at u = 0, as it must.
//   N_rr   * r * |r|    — cross-flow drag on the hull's own transverse motion
//                         as it rotates. Quadratic in r, and present at rest,
//                         which is what actually damps a stationary boat.
//
// The coefficient also had to SHRINK, not carry over. The old 900 was doing
// two jobs: the hull's own damping and, silently, the rudder's — because
// before F9 the steering oar contributed exactly zero yaw damping (no inflow
// term at all). With F9's oar in the water the measured split at u = 3,
// r = 0.3 is 52% rudder / 48% hull, so leaving 900 in place would double-count
// the half the oar now supplies. These values keep the bare hull (oar shipped)
// damping in the same range it had, while the deployed oar adds its own real
// contribution on top rather than being stood in for.
export function yawDamping(r, u, config) {
  // STRIP INTEGRATION (2026-08-04). Derived from the hull's own measured
  // CS(leeway) curve instead of two estimated coefficients, on the owner's
  // hypothesis that a hull this sharp and narrow stabilises much like the oar
  // does. It does, and the model was badly understating it.
  //
  // The hull is 5.5 m x 0.45 m -- a 12:1 lateral foil with twelve times the
  // steering oar's area. But hullSideForce() takes only u and v: it is blind
  // to yaw rate, so the hull generated no r-dependent side force at all, and
  // its one yaw contribution acted at a FIXED clrX. All of the hull's
  // resistance to yawing therefore had to come from this function, whose two
  // coefficients F10 could only estimate.
  //
  // Measured at u = 3.5, r = 0.3, the gap was large:
  //     phenomenological (yawDampingLinear/CrossFlow):  -395 N*m
  //     strip integration of the same CS curve:        -1409 N*m
  //     the 0.15 m^2 steering oar, for comparison:     -1345 N*m
  // A properly-treated hull supplies about as much yaw damping as the oar --
  // which is what twelve times the area should do, and is exactly the
  // hypothesis. The old value left the blade out-stabilising the whole hull by
  // 3.4x, which is why the boat had no directional stability without it (S1b).
  //
  // Method, the same local-inflow idea F9 gave the oar, applied along the
  // length: station x sees sway r*x, hence its own leeway angle, hence its own
  // CS from the SAME curve hullSideForce uses (docs/adr/0004). Each strip
  // carries lateralArea/N. The moment is the integral of x*f(x).
  //   Evaluated at v = 0, i.e. the standard N_r linearisation: this function's
  // job is the yaw-rate part, and hullSideForce still owns the sway part. The
  // v-r cross term is not captured by either, and is left as a known omission
  // rather than double-counted here.
  //   Both of F10's physical requirements survive by construction: the term
  // vanishes at r = 0, and it does NOT vanish at u = 0, because a strip at
  // station x still sees r*x of flow when the boat is not making way. That is
  // the cross-flow behaviour F10's second coefficient existed to provide, now
  // falling out of the integration rather than being estimated.
  const { hull, rho_w } = config;
  const L = hull.length;
  const N = 21; // stations; the integral is converged to <0.5% by 21 (checked)
  const dA = (hull.lateralArea ?? 0) / N;
  let moment = 0;
  for (let i = 0; i < N; i++) {
    const x = -L / 2 + (i + 0.5) * (L / N);
    const vLocal = r * x;
    const V2 = u * u + vLocal * vLocal;
    if (V2 < 1e-9) continue;
    let lambda = Math.abs(Math.atan2(vLocal, u));
    if (lambda > Math.PI / 2) lambda = Math.PI - lambda;
    const CS = hullSideForceCoeff(lambda / (Math.PI / 180), hull);
    const f = -Math.sign(vLocal) * 0.5 * rho_w * dA * CS * V2;
    moment += x * f;
  }
  return moment;
}
