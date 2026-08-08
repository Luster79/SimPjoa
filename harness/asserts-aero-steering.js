// harness/asserts-aero-steering.js — split out of the former single-file
// harness/asserts.js (R13, docs/work-order-2026-07-22.md). Verbatim body,
// line range 104-514 of the pre-split file; see git history
// for that file's own per-check provenance comments, preserved below unchanged.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tableCL, sailForces } from '../core/aero.js';
import { integrate } from '../core/integrator.js';
import { parseCSV } from '../core/config.js';
import { headingHoldRudder } from './polar.js';
import { DEG, HEADING0, normalizeAngle } from './asserts-helpers.js';

export function check_aero_steering(config, check) {
  // --- 1. CL calibration (round 10, R10-1, docs/adr/0003: re-anchored to
  // Di Piazza et al. 2014's measured Santa Cruz wind-tunnel data instead
  // of the Marchaj/Polhamus theoretical anchors, which overshot CLmax by
  // ~35% — see ROUND10_data_integration_findings.md for the fit and its
  // residuals against all four Santa Cruz section-A anchors.) ---
  const cl35 = tableCL(45, 35, config);
  check('CL(35deg, apex45) in [1.05,1.25] (re-anchored R10-1 to Di Piazza 2014 measured, was [1.6,1.8] Marchaj/Polhamus)',
    cl35 >= 1.05 && cl35 <= 1.25, `CL=${cl35.toFixed(3)}`);

  let clMax = -Infinity, clMaxAlpha = 0;
  for (let a = 30; a <= 60; a += 1) {
    const cl = tableCL(45, a, config);
    if (cl > clMax) { clMax = cl; clMaxAlpha = a; }
  }
  check('CLmax in [1.30,1.45] at alpha 45-58deg (re-anchored R10-1 to Di Piazza 2014 Santa Cruz CLmax~1.38, was [1.75,2.0]/38-46deg Marchaj/Polhamus)',
    clMax >= 1.30 && clMax <= 1.45 && clMaxAlpha >= 45 && clMaxAlpha <= 58,
    `CLmax=${clMax.toFixed(3)} at alpha=${clMaxAlpha}`);

  // --- 2. Head-to-wind: sheeted in, boat does not move ---
  // Head-to-wind is not a stable free equilibrium (a real boat "in irons"
  // eventually falls off to one side too), and the rudder has ~zero
  // authority at near-zero speed to hold it there indefinitely — so this
  // checks the immediate response (a few seconds) rather than a long free
  // run, which would just end up re-testing that same, expected, low-speed
  // directional instability instead of the sail's near-wind thrust.
  {
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 0, v: 0, r: 0, phi: 0, p: 0, delta: 0, end: 1, amaLoad: 0,
      abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const controls = { windDirFrom: HEADING0, windSpeed: 6, sheet: 5 * DEG, rudder: 0,
      brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, shuntRequest: false };
    for (let i = 0; i < Math.round(4 / config.dt); i++) {
      controls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, controls, config, config.dt);
    }
    const speed = Math.hypot(state.u, state.v);
    check('head-to-wind sheeted stays essentially still', speed < 0.5, `speed=${speed.toFixed(3)} m/s`);
  }

  // --- H3 (round 10d, ROUND10d_helm_balance.md): parked-state audit. The
  // work order asked to find why a hull with a pressed sail and quarter
  // wind can sit at exactly u=0.00 in the reported trajectory, and either
  // add above-water windage or document why the exact zero is a genuine
  // balance. Investigated (see ROUND10d_helm_balance_findings.md for the
  // full trace): every hydro force (hullResistance, hullSideForce,
  // amaDrag) is IDENTICALLY zero at u=v=0 by construction (each is
  // proportional to Math.sign(u)*u*u or Math.sign(v)*v*v, and Math.sign(0)
  // is 0 in JS — physically correct, zero relative water speed is zero
  // drag), so the only thing that can ever move a genuinely parked hull is
  // the SAIL. Direct sailForces() probes at rest (u=v=0, real TWS=6) found
  // Fx/Fy nonzero at every TWA tried, including the fully symmetric TWA180
  // dead-run case (Fy=0 by symmetry there, but Fx=12.2N, not zero) — a true
  // zero-force fixed point does not exist anywhere in the model at TWS>0,
  // furled or not. For the SPECIFIC scenario this assertion checks (furled
  // sail), the existing furled spar drag alone (aero.js: CDf = ... +
  // sail.CD0*furl — the furl mechanism never zeroes CD entirely, only CL)
  // already supplies real above-water windage, no new CONFIG coefficient
  // needed. The reported "u=0.00 exactly" most likely reads a 2-decimal
  // UI/console readout as bit-exact rather than a genuine numerical pin;
  // it was not reproduced at the code level (see findings doc for the
  // negative probes attempted) and is called out there as an open item
  // rather than silently assumed fixed.
  {
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 0, v: 0, r: 0, phi: 0, p: 0, delta: 0, end: 1, amaLoad: 0,
      abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const controls = { windDirFrom: HEADING0 + 90 * DEG, windSpeed: 6, sheet: 0, rudder: 0, rudderUp: true,
      brailLee: 1, brailWind: 1, crewPos: 0, crewPosX: 0, shuntRequest: false };
    // Measured as a WINDOWED MEAN over 60-180s, not an instantaneous sample at
    // 60s. With the hull's full strip-integrated side force (docs/adr/0017) the
    // parked state is not a fixed point at all: it is a slow, bounded yaw
    // oscillation -- the hull weathervanes toward beam-on, overshoots, drifts
    // back, period ~90s, TWA staying inside [89,116] and speed swinging 0.16 to
    // 0.90 m/s across the cycle. A boat lying ahull hunting slowly about the
    // wind is the real behaviour, but it means a single-instant probe reads
    // whatever phase of the cycle it lands in. The mean is the stable quantity,
    // so the mean is what is asserted, together with the invariant that
    // actually carries the check's intent: the TWA window it stays inside.
    let sumSpeed = 0;
    let nSamples = 0;
    let minTwa = 360;
    let maxTwa = -360;
    const parkedTwaOf = (heading) => {
      const a = (((controls.windDirFrom - heading) / DEG) % 360 + 360) % 360;
      return a > 180 ? 360 - a : a;
    };
    const parkedSteps = Math.round(180 / config.dt);
    const parkedWindowStart = Math.round(60 / config.dt);
    for (let i = 0; i < parkedSteps; i++) {
      state = integrate(state, controls, config, config.dt);
      if (i < parkedWindowStart) continue;
      sumSpeed += Math.hypot(state.u, state.v);
      nSamples += 1;
      const twa = parkedTwaOf(state.heading);
      minTwa = Math.min(minTwa, twa);
      maxTwa = Math.max(maxTwa, twa);
    }
    const speed = sumSpeed / nSamples;
    // Band re-anchored for F10 (work-order-2026-07-30). The old [0.05,0.4]
    // was set around a measured 0.063 m/s, which depended on the parked hull
    // being held nearly beam-on by the old yaw damping — that term returned
    // FULL damping at u=0 and, being linear in r, was ~34x stiffer at the
    // small yaw rates a drifting hull actually sees than the cross-flow
    // (r*|r|) term that physically replaces it. With the correct weak low-r
    // damping the hull weathervanes further (heading -54deg from beam-on over
    // the 60 s, was -23deg) and drifts at 0.57 m/s. Attribution verified
    // directly: restoring a stiff low-r damping reproduces the old 0.077 m/s.
    // The new value is also the more plausible one — 0.57 m/s is ~1.1 kn of
    // bare-pole drift in a 12 kn breeze, where 0.06 m/s (0.12 kn) is
    // essentially pinned. The check's intent (it drifts, it is not stuck, and
    // it does not sail off) is unchanged.
    // Re-anchored 2026-08-04 for the strip-derived hull yaw damping. The
    // mechanism is the point of the check, not the number: with only the old
    // estimated damping the parked hull weathervaned 54deg off beam-on and
    // then slid at 0.57 m/s. With the hull's real yaw damping it HOLDS
    // beam-on, and a hull held beam-on presents its whole lateral plane to
    // the drift, so it slides much more slowly. That is the physically right
    // answer -- a bare hull lying broadside is hard to push sideways -- and it
    // is the same reason a drifting boat lies beam to the wind rather than
    // wandering off downwind. The check's own stated intent is unchanged: it
    // drifts, it is not stuck, and it does not sail off.
    //
    // Re-anchored again 2026-08-08 for D1 (docs/work-order-2026-08-05-
    // statecznosc-kierunkowa.md), the migrating centre of lateral resistance.
    // A QUALITATIVE change this time, not just a number: before D1 this state
    // is a sustained limit-cycle yaw oscillation (period ~90s, matching this
    // check's own old description) that never damps out inside the 180s
    // window -- u and TWA keep cycling right through t=180s. D1 adds real
    // restoring stiffness, and the same oscillation now DAMPS OUT, converging
    // to a steady beam-on drift by ~t=140s (verified directly: r settles to
    // ~0, u/v stop changing). The window [60,180]s used to sample close to a
    // full cycle of the old oscillation (mean 0.535 m/s); now it samples the
    // tail of a decaying transient plus a longer steady-state segment at a
    // higher settled speed (mean 0.801 m/s). Band widened to [0.2,0.9] to
    // hold the new mean with the same kind of margin the old band held its
    // own value by -- not narrowed to the new number, since a genuinely
    // decaying-to-steady state is less repeatable near its own transient tail
    // than a sustained cycle was. The TWA window (it lies beam-ish, does not
    // sail off) is UNCHANGED and still the check's real intent; matches the
    // check's own account of what changed.
    check('H3: parked hull, beam TWS6, sail furled -> lies beam-ish (TWA in [60,130]) and drifts at a mean 0.2-0.9 m/s over 60-180s',
      speed >= 0.2 && speed <= 0.9 && minTwa >= 60 && maxTwa <= 130,
      `mean speed=${speed.toFixed(4)} m/s over the window, TWA range [${minTwa.toFixed(0)},${maxTwa.toFixed(0)}] -- ` +
      '0.80 m/s is ~1.6kn of bare-pole drift in a 12kn breeze, lying between beam-on and slightly off. ' +
      'The band is deliberately an order-of-magnitude one: the check exists to say the hull drifts, is not pinned, and does not sail off, and the TWA window is what asserts the last of those. Earlier readings under earlier models: 0.06 (stiff estimated damping, effectively pinned), 0.57 (weak estimated damping, weathervaned 54deg and slid), 0.535 (pre-D1 strip-derived yaw damping, sustained 90s oscillation)');
  }

  // --- 2b. Sheeting tolerance (S5, work-order-2026-08-02) ---
  // Dierking (Building Outrigger Sailing Canoes) on the Oceanic lateen: it
  // "is very forgiving of incorrect sheeting angles and holds power at a
  // point where a more conventional rig would have stalled." This is one of
  // the few properties where the model agrees with the literature WITHOUT
  // having been calibrated to it — and, until now, nothing guarded it, so
  // block B could have destroyed it silently. Guarded as a PROPERTY (the
  // curve is broad) rather than as the measured numbers, per S7's rule.
  //
  // Measured at TWS 6, upright, no brails, driving force = boat-frame Fx as
  // a function of yard angle: the >=90%-of-peak band is 20.0-23.0deg wide
  // and 20deg off the optimum leaves 63-87%. The thresholds below sit well
  // clear of both, so this fails on a qualitative collapse of the curve's
  // breadth, not on ordinary drift.
  {
    const sheetBase = { t: 0, x: 0, y: 0, heading: 0, u: 0, v: 0, r: 0, phi: 0, p: 0, end: 1, amaLoad: 0,
      abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const rows = [];
    for (const awa of [50, 70, 90, 110]) {
      const controls = { windDirFrom: awa * DEG, windSpeed: 6, sheet: 0, rudder: 0, rudderUp: true,
        brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, shuntRequest: false };
      const drive = (deltaDeg) => sailForces({ ...sheetBase, delta: deltaDeg * DEG }, controls, config).Fx;
      let peak = -Infinity, dOpt = 0;
      for (let d = 0; d <= 90; d += 0.5) {
        const fx = drive(d);
        if (fx > peak) { peak = fx; dOpt = d; }
      }
      let lo = dOpt, hi = dOpt;
      while (lo > 0 && drive(lo - 0.5) >= 0.9 * peak) lo -= 0.5;
      while (hi < 90 && drive(hi + 0.5) >= 0.9 * peak) hi += 0.5;
      const off = Math.min(drive(Math.min(90, dOpt + 20)), drive(Math.max(0, dOpt - 20))) / peak;
      rows.push({ awa, dOpt, width: hi - lo, off });
    }
    const minWidth = Math.min(...rows.map((r) => r.width));
    const minOff = Math.min(...rows.map((r) => r.off));
    const detail = rows.map((r) => `AWA${r.awa}: opt=${r.dOpt}deg width=${r.width.toFixed(1)}deg off20=${(r.off * 100).toFixed(0)}%`).join('; ');
    check('S5: Oceanic lateen is forgiving of sheeting angle -- >=90%-of-peak drive band >=15deg wide, and 20deg off optimum keeps >=50% (Dierking)',
      minWidth >= 15 && minOff >= 0.50, `${detail} -- worst width=${minWidth.toFixed(1)}deg worst off20=${(minOff * 100).toFixed(0)}%`);
  }

  // --- 3c. Tack-position steering (S2, work-order-2026-08-02) ---
  // The mechanism the model did not have. Before tackX, the helm lever
  // (xCE - clrX) could not reach zero at ANY trim: `lead` (0.33 m) exceeds
  // the whole trim-driven excursion (halfChordEff, 0.25 m), so the lever was
  // positive by construction and the sail could only modulate the magnitude
  // of a moment whose sign was fixed. Moving the tack is what a real Oceanic
  // lateen steers with (Dierking; Proafile), and it moves the CE far enough
  // to cross zero.
  //
  // Measured on a grid and reported as an aggregate — the method that
  // exposed the sheet-trim claim — rather than at one operating point.
  // Direction is the classical one and holds at every point measured: tack
  // AFT points up, tack FORWARD bears away.
  {
    const tackTurn = (twa, tws, sheetDeg, crewPos, tackX) => {
      const windDirFrom = HEADING0 + twa * DEG;
      let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0,
        delta: sheetDeg * DEG, end: 1, amaLoad: 0, abackTimer: 0, capsized: false,
        shunt: { phase: 'none', progress: 0 } };
      const controls = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0,
        rudderUp: false, brailLee: 0, brailWind: 0, crewPos, crewPosX: 0, tackX: 0,
        shuntRequest: false };
      // Settle on course under the autopilot at the NEUTRAL tack, so the only
      // thing that differs between the two runs is the tack move itself.
      for (let i = 0; i < Math.round(30 / config.dt); i++) {
        controls.rudder = headingHoldRudder(state, HEADING0, config);
        state = integrate(state, controls, config, config.dt);
      }
      const headingBefore = state.heading;
      controls.rudder = 0;
      controls.tackX = tackX;
      for (let i = 0; i < Math.round(10 / config.dt); i++) state = integrate(state, controls, config, config.dt);
      // + = heading increased = TWA fell = pointing up.
      return { turn: normalizeAngle(state.heading - headingBefore) / DEG, capsized: state.capsized };
    };

    const points = [[70, 6, 8, 0.3], [90, 6, 16, 0.3], [110, 6, 32, 0.3],
      [70, 10, 16, 1.0], [90, 10, 20, 1.0], [110, 10, 28, 0.6]];
    const rows = points.map(([twa, tws, sh, cw]) => {
      const aft = tackTurn(twa, tws, sh, cw, -1);
      const fwd = tackTurn(twa, tws, sh, cw, +1);
      return { twa, tws, aft: aft.turn, fwd: fwd.turn, capsized: aft.capsized || fwd.capsized };
    });
    // The claim is DIFFERENTIAL — moving the tack aft points the boat up
    // relative to moving it forward — so it is stated against the neutral
    // helm the boat already has (S1a: it luffs up on its own), not as an
    // absolute turn direction.
    const good = rows.filter((r) => r.aft - r.fwd >= 2 && !r.capsized).length;
    const worst = Math.min(...rows.map((r) => r.aft - r.fwd));
    check('S2: moving the tack steers -- aft points up relative to forward, >=2deg over 10s, on a grid (TWA 70/90/110 x TWS 6/10)',
      good === rows.length,
      `${good}/${rows.length} points -- ` +
      rows.map((r) => `TWS${r.tws}/TWA${r.twa}: aft${r.aft >= 0 ? '+' : ''}${r.aft.toFixed(0)} fwd${r.fwd >= 0 ? '+' : ''}${r.fwd.toFixed(0)} (spread ${(r.aft - r.fwd).toFixed(0)}deg)`).join(' ') +
      ` -- worst spread=${worst.toFixed(1)}deg`);
  }

  // S2, structural half: the helm lever must CHANGE SIGN inside the
  // available tack range, at every trim. This is the property the whole
  // mechanism rests on and it is exact geometry, so it is checked directly
  // rather than inferred from the turn rates above. Before tackX the lever
  // was `lead - halfChordEff*cos(delta)` with lead=0.33 > halfChordEff=0.25,
  // i.e. positive for every delta — a sail that can modulate the size of a
  // yaw moment but never its direction. That, not "the claim is fragile",
  // is why xfail:STEERING could not hold.
  {
    const halfChordEff = (config.sail.CEheight / 2 / 2) * (config.sail.ceSwingFraction ?? 0.5);
    const lever = (deltaDeg, tackX) => config.hull.lead + tackX * (config.sail.tackTravel ?? 0)
      - halfChordEff * Math.cos(deltaDeg * DEG);
    const trims = [0, 15, 30, 45, 60, 75, 90];
    const crossing = trims.filter((d) => lever(d, -1) < 0 && lever(d, +1) > 0);
    check('S2: the helm lever (xCE - clrX) changes sign inside the tack range at every trim',
      crossing.length === trims.length,
      `${crossing.length}/${trims.length} trims cross zero -- at delta=0: ${lever(0, -1).toFixed(3)}m (tack aft) to ${lever(0, 1).toFixed(3)}m (fwd); at delta=90: ${lever(90, -1).toFixed(3)} to ${lever(90, 1).toFixed(3)} -- pre-S2 range was ${(config.hull.lead - halfChordEff).toFixed(3)}..${config.hull.lead.toFixed(3)}m, positive throughout`);
  }

  // --- 2c. Driving-force curve vs Di Piazza Fig 4 (S4b, docs/adr/0009) ---
  // The reader that file never had. ADR 0009's contract is that nothing sits
  // in data/ without one, and `driving_force_vs_AWA.csv` was the case that
  // motivated the contract: digitised in round 10, described in the data
  // README, cited in an assertion comment as justification for a threshold,
  // and loaded by no code at all — which is exactly how it stayed wrong by up
  // to 0.41 (eight times the source's own stated uncertainty) until S4a
  // re-extracted it.
  //
  // The model's CR is computed the way the paper computes it: the best over
  // trim at each apparent wind angle, non-dimensionalised on the same sail
  // area, with theta the apparent wind angle (all three resolved from the full
  // text in S4a and quoted in the file's own header).
  //
  // Only the series=SantaCruz rows are compared. The theta<55 rows are an
  // upper bound over all ten sails, not a Santa Cruz measurement, so scoring
  // the model against them would be scoring it against the wrong boat.
  {
    const csvPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'driving_force_vs_AWA.csv');
    const rows = parseCSV(readFileSync(csvPath, 'utf8')).filter((r) => r.series === 'SantaCruz');
    const q = 0.5 * config.rho_air * config.sail.area * 36; // 6 m/s reference
    const driveBase = { t: 0, x: 0, y: 0, heading: 0, u: 0, v: 0, r: 0, phi: 0, p: 0, end: 1,
      amaLoad: 0, abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const compared = rows.map((r) => {
      const theta = Number(r.theta_deg);
      const controls = { windDirFrom: theta * DEG, windSpeed: 6, sheet: 0, rudder: 0, rudderUp: true,
        brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, tackX: 0, shuntRequest: false };
      let peak = -Infinity;
      for (let d = 0; d <= 90; d += 0.5) {
        peak = Math.max(peak, sailForces({ ...driveBase, delta: d * DEG }, controls, config).Fx);
      }
      return { theta, model: peak / q, lit: Number(r.CR) };
    });
    // Band: the source's own stated +-0.05 plus an explicit +-0.10 of trim
    // margin, since the model's achievable trim range is bounded by
    // sail.deltaMinDeg (S6) where the wind tunnel's was not.
    const BAND = 0.15;
    const within = compared.filter((c) => Math.abs(c.model - c.lit) <= BAND);
    const worst = compared.reduce((a, c) => (Math.abs(c.model - c.lit) > Math.abs(a.model - a.lit) ? c : a), compared[0]);
    const table = compared.filter((c) => c.theta % 20 === 0 || c.theta === 55 || c.theta === 175)
      .map((c) => `${c.theta}:${c.model.toFixed(2)}/${c.lit.toFixed(2)}`).join(' ');
    check('S4b: driving-force curve matches Di Piazza Fig 4 (Santa Cruz) within +-0.15 across theta 55-180',
      rows.length > 0 && within.length === compared.length,
      `${within.length}/${compared.length} points in band; worst theta=${worst.theta} model=${worst.model.toFixed(3)} lit=${worst.lit.toFixed(3)} (${(worst.model - worst.lit >= 0 ? '+' : '')}${(worst.model - worst.lit).toFixed(3)}) -- model/lit at theta ${table} -- the model is short close-hauled and long on the broad reach; agreement is within +-9% from theta 85 to 180 and degrades below it, which is the same close-hauled deficit xfail:CALIBRATION tracks from the other side. Reported, not retuned; see docs/findings-2026-08-02 stage 1`,
      'CALIBRATION');
  }

  // --- 2d. The rest of ADR 0009's contract: every data file has a reader ---
  // S4b gave driving_force_vs_AWA.csv one. A grep of data/ against the
  // execution path then found two more files that had none:
  // flay_2025_hull_sideforce_digitized.csv (no reference in any code at all)
  // and dipiazza_2014_digitized.csv (referenced only from a COMMENT in
  // core/aero.js, which is the same "documented but unread" pathology one
  // level down). Both hold the measurements that config.js's fitted constants
  // were derived FROM, so the natural reader is the one that checks the fit
  // still passes through the measurements.
  {
    const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

    // Flay CS(leeway) — the V2 hull (70deg keel, the paper's proa-like case)
    // is what core/hydro.js's hullSideForceCoeff is anchored on (docs/adr/0004).
    const flay = parseCSV(readFileSync(path.join(dataDir, 'flay_2025_hull_sideforce_digitized.csv'), 'utf8'))
      .filter((r) => r.hull === 'V2');
    const csModel = (lambdaDeg) => config.hull.csV2A * lambdaDeg + config.hull.csV2B * lambdaDeg * lambdaDeg;
    const flayRows = flay.map((r) => ({ lam: Number(r.leeway_deg), lit: Number(r.CS), model: csModel(Number(r.leeway_deg)) }));
    const flayWorst = flayRows.reduce((a, c) => (Math.abs(c.model - c.lit) > Math.abs(a.model - a.lit) ? c : a), flayRows[0]);
    check('data contract: hullSideForceCoeff still passes through Flay 2025 V2 measurements (+-0.02, source states +-0.01)',
      flayRows.length >= 4 && flayRows.every((r) => Math.abs(r.model - r.lit) <= 0.02),
      flayRows.map((r) => `${r.lam}deg:${r.model.toFixed(3)}/${r.lit.toFixed(3)}`).join(' ') +
      ` -- worst |model-lit|=${Math.abs(flayWorst.model - flayWorst.lit).toFixed(4)} at ${flayWorst.lam}deg`);

    // Di Piazza section A — the four Santa Cruz (CL, CD) anchors the v2 aero
    // table was fitted to. Checked through the same runtime path aero.js uses
    // (tableCL + the config's own CD reconstruction), not against a copy of
    // the fit's own output.
    const dpRows = parseCSV(readFileSync(path.join(dataDir, 'dipiazza_2014_digitized.csv'), 'utf8'))
      .filter((r) => r.sail === 'SantaCruz' && r.CL && r.point);
    let clMaxModel = -Infinity;
    for (let a = 20; a <= 80; a += 0.5) clMaxModel = Math.max(clMaxModel, tableCL(config.sail.apexAngleDeg, a, config));
    const clMaxLit = Math.max(...dpRows.map((r) => Number(r.CL)));
    check('data contract: the aero table still reproduces Di Piazza section A CLmax (+-0.05, the source\'s stated uncertainty)',
      dpRows.length >= 4 && Math.abs(clMaxModel - clMaxLit) <= 0.05,
      `model CLmax=${clMaxModel.toFixed(3)} vs digitized ${clMaxLit.toFixed(3)} over ${dpRows.length} Santa Cruz anchors read from the file`);
  }

  // --- 2e. End symmetry: the boat must sail the same on both shunts ---
  // A proa's whole premise is that its two ends are equivalent -- it shunts
  // instead of tacking precisely because bow and stern swap roles. Nothing in
  // the geometry distinguishes them: the ama is always to windward, the sail
  // always to leeward, the hull is symmetric fore and aft.
  //
  // It was NOT symmetric until 2026-08-04, and the whole of the difference was
  // the steering oar being modelled at the BOW after a shunt
  // (core/rudder.js's lever arm carried a spurious *state.end). Free boat,
  // rudder centred, 20 s from an identical start, before the fix:
  //   oar shipped: end +1 and end -1 bit-identical (+81.0deg, v=0.45)
  //   oar down:    end +1 bore away 10.9deg at 3.93 m/s
  //                end -1 rounded up 81.0deg and collapsed to 0.15 m/s
  // The shipped-oar half passing is what localised it: everything except the
  // oar was already correct across the swap.
  //
  // Both halves are real assertions now. Keep them: this area has had three
  // passes at its signs and two of them shipped a wrong answer, and an
  // end=+1-only check cannot see any of them.
  {
    const freeRun = (end, rudderUp, patch = {}) => {
      const wind = HEADING0 + 90 * DEG;
      const heading = end === 1 ? HEADING0 : HEADING0 + Math.PI;
      const controls = { windDirFrom: wind, windSpeed: 6, sheet: 16 * DEG, rudder: 0,
        rudderUp, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, tackX: 0,
        halyard: 1, shroud: 1, stays: 0, shuntRequest: false, ...patch };
      let state = { t: 0, x: 0, y: 0, heading, u: 3.5, v: 0, r: 0, phi: 0, p: 0, delta: 16 * DEG,
        end, amaLoad: 0, abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
      for (let i = 0; i < Math.round(20 / config.dt); i++) state = integrate(state, controls, config, config.dt);
      const a = (((wind - state.heading) / DEG) % 360 + 360) % 360;
      return { dTwa: 90 - (a > 180 ? 360 - a : a), speed: Math.hypot(state.u, state.v) };
    };
    const upA = freeRun(1, true), upB = freeRun(-1, true);
    check('end symmetry: with the oar SHIPPED the two ends behave identically',
      Math.abs(upA.dTwa - upB.dTwa) < 0.5 && Math.abs(upA.speed - upB.speed) < 0.02,
      `end+1 dTWA=${upA.dTwa.toFixed(1)} v=${upA.speed.toFixed(2)}; end-1 dTWA=${upB.dTwa.toFixed(1)} v=${upB.speed.toFixed(2)}`);

    const dnA = freeRun(1, false), dnB = freeRun(-1, false);
    check('end symmetry: with the oar DOWN and centred the two ends behave identically',
      Math.abs(dnA.dTwa - dnB.dTwa) < 0.5 && Math.abs(dnA.speed - dnB.speed) < 0.02,
      `end+1 dTWA=${dnA.dTwa.toFixed(1)} v=${dnA.speed.toFixed(2)}; end-1 dTWA=${dnB.dTwa.toFixed(1)} v=${dnB.speed.toFixed(2)} -- was +81.0/0.15 on end -1 before the lever-arm fix`);

    // The two checks above run every trim control at NEUTRAL, which is how the
    // tack's own end-flip survived them (docs/adr/0023): with tackX=0 the
    // spurious factor multiplies zero. Every control the sailor has is
    // exercised here, one at a time, off its neutral value.
    const symCases = [
      ['tack forward', { tackX: 1 }],
      ['tack aft', { tackX: -1 }],
      ['stays forward', { stays: 1 }],
      ['crew aft', { crewPosX: -1 }],
      ['halyard eased', { halyard: 0 }],
      ['shroud slack', { shroud: 0 }],
      ['windward brail', { brailWind: 0.6 }],
    ];
    const asym = symCases.filter(([, patch]) => {
      const a = freeRun(1, true, patch), b = freeRun(-1, true, patch);
      return Math.abs(a.dTwa - b.dTwa) >= 0.5 || Math.abs(a.speed - b.speed) >= 0.02;
    });
    check('end symmetry: every trim control means the same thing on both ends',
      asym.length === 0,
      asym.length === 0
        ? `${symCases.length}/${symCases.length} controls symmetric -- tack included, which it was NOT before docs/adr/0023 (tackX=+1 gave dTWA 36.7 on end +1 and 75.0 on end -1, an exact mirror of tackX=-1)`
        : `ASYMMETRIC: ${asym.map(([n]) => n).join(', ')}`);
  }

}
