// config.js — default CONFIG, CSV loading, Polhamus regeneration cross-check,
// range validation. Pure ESM, no external dependencies, Node >= 18.
//
// Design note on the sail drag model.
// The RUNTIME model is the composite in docs/adr/0007 (block B of
// work-order-2026-07-30):
//     CD = CD0 + inducedK*CL_working^2 + CDbroadside*sin^4(alpha) + ...
// The suction-loss form CD0 + s*CL*tan(alpha) that used to live here is gone,
// and with it CONFIG.sail.s — it had no remaining runtime reader.
//
// The Polhamus CD helpers below (polhamusCD/polhamusCDv2, with their own
// per-table `s`) are retained for ONE purpose: regenerating the shipped CSVs'
// CD column at startup to verify the files have not been silently edited or
// corrupted. That is an integrity/provenance check on the data files, NOT a
// live code path — aero.js reads only the CL column. See F3(b) in
// work-order-2026-07-30-physics-audit.md and the note at
// crossCheckAeroTableV2.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

export const CONFIG_VERSION = '1.0.0';

// ---------------------------------------------------------------------
// Minimal CSV parser (handles quoted fields with embedded commas, "" escapes)
// ---------------------------------------------------------------------
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      if (field.length || row.length) pushRow();
    } else if (c === '\r') {
      // ignore
    } else {
      field += c;
    }
  }
  if (field.length || row.length) pushRow();

  const header = rows.shift();
  return rows.map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h.trim()] = r[idx]; });
    return obj;
  });
}

function num(x) { return Number(x); }

// ---------------------------------------------------------------------
// Polhamus suction-analogy formulas (shared by table regeneration and by
// aero.js at runtime for the tunable-s CD reconstruction)
// ---------------------------------------------------------------------
export function polhamusAR(apexDeg) {
  return 4 * Math.tan((apexDeg * Math.PI) / 180 / 2);
}
export function polhamusKp(AR) {
  return (2 * Math.PI * AR) / (2 + Math.sqrt(AR * AR + 4));
}
export const polhamusKv = Math.PI;

export function polhamusCL(alphaRad, Kp, Kv) {
  const s = Math.sin(alphaRad), c = Math.cos(alphaRad);
  return Kp * s * c * c + Kv * c * s * s;
}

// CD with an explicit, arbitrary suction factor s (1.0 = full loss, as
// used to regenerate/validate the shipped table; the runtime tunable
// value lives in CONFIG.sail.s and is applied by aero.js instead).
export function polhamusCD(CL, alphaRad, CD0, s) {
  const alphaClamped = Math.min(alphaRad, (89.9 * Math.PI) / 180);
  return CD0 + s * CL * Math.tan(alphaClamped);
}

// ---------------------------------------------------------------------
// v2 aero table generator (round 10, R10-1, ROUND10_data_integration.md,
// docs/adr/0003): crab_claw_CL_CD_v2.csv rescales the SAME Polhamus
// functional-form curve (kept for interpolation smoothness — the work
// order's own instruction) to Di Piazza, Pearthree & Paille 2014's
// measured Santa Cruz wind-tunnel anchors (Fig 3) instead of the pure
// theoretical suction-analogy curve, which overshoots CLmax by ~35%
// (1.88 analytic vs ~1.38 measured). Three-parameter fit per apex angle:
//   - CLgain: scales CL so the theoretical peak matches measured CLmax.
//   - alphaStretch: remaps the alpha axis (piecewise: a plain multiply
//     on the rising side 0..peakAlpha, a linear rescale on the falling
//     side peakAlpha..90 so old_alpha is ALWAYS in [0,90] — a naive
//     single multiply pushes old_alpha past 90 on the falling side for
//     alphaStretch far from 1, where the flat-plate formula (only valid
//     on a full sin/cos period through 90) turns negative).
//   - CD0/s: refit via least-squares against the four measured (CL,CD)
//     anchor pairs (Di Piazza gives no alpha for these — only CL/CD — so
//     each anchor's alpha is back-solved from CLgain/alphaStretch first).
// peakAlphaDeg/peakCL are the exact (fine-search) location of the RAW
// Polhamus curve's own peak per apex — precomputed once here rather than
// re-searched at runtime; CLgain is defined directly from it
// (measured CLmax / peakCL), so it never needs to be re-derived.
// See ROUND10_data_integration_findings.md for the full fit residuals
// and the L/Dmax-region constraint (the curve must not exceed the
// paper's own labeled peak L/D=0.70/0.13=5.38 anywhere else).
export const AERO_V2_PARAMS = {
  45: { peakAlphaDeg: 46.849, peakCL: 1.916361, CLgain: 0.7202, alphaStretch: 1.10, CD0: 0.040, s: 0.406 },
  60: { peakAlphaDeg: 45.517, peakCL: 2.126019, CLgain: 0.6491, alphaStretch: 1.10, CD0: 0.040, s: 0.428 },
};

// newAlphaDeg -> old (raw-Polhamus) alphaDeg, piecewise per the comment above.
function v2OldAlphaFor(newAlphaDeg, apexDeg) {
  const { peakAlphaDeg, alphaStretch } = AERO_V2_PARAMS[apexDeg];
  const peakNewDeg = peakAlphaDeg * alphaStretch;
  if (newAlphaDeg <= peakNewDeg) return newAlphaDeg / alphaStretch;
  return peakAlphaDeg + (newAlphaDeg - peakNewDeg) * (90 - peakAlphaDeg) / (90 - peakNewDeg);
}

export function polhamusCLv2(alphaRad, apexDeg) {
  const { CLgain } = AERO_V2_PARAMS[apexDeg];
  const alphaDeg = (alphaRad * 180) / Math.PI;
  const oldAlphaDeg = v2OldAlphaFor(alphaDeg, apexDeg);
  const AR = polhamusAR(apexDeg);
  const Kp = polhamusKp(AR);
  return CLgain * polhamusCL((oldAlphaDeg * Math.PI) / 180, Kp, polhamusKv);
}

export function polhamusCDv2(CL, alphaRad, apexDeg) {
  const { CD0, s } = AERO_V2_PARAMS[apexDeg];
  const alphaClamped = Math.min(alphaRad, (89.9 * Math.PI) / 180);
  return CD0 + s * CL * Math.tan(alphaClamped);
}

// ---------------------------------------------------------------------
// Load + parse an aero table CSV into per-apex arrays
// ---------------------------------------------------------------------
function loadAeroTable(filename) {
  const text = readFileSync(path.join(DATA_DIR, filename), 'utf8');
  const rows = parseCSV(text);
  const byApex = {};
  for (const r of rows) {
    const apex = num(r.apex_deg);
    if (!byApex[apex]) byApex[apex] = { alphaDeg: [], CL: [], CD: [] };
    byApex[apex].alphaDeg.push(num(r.alpha_deg));
    byApex[apex].CL.push(num(r.CL));
    byApex[apex].CD.push(num(r.CD));
  }
  return byApex;
}

// Cross-check: regenerate CL (and CD with s=1.0, matching the documented
// generation method) from the Polhamus formulas and compare against the
// loaded CSV within 2% relative error (skip alpha=0 [CL=0, handled by
// absolute check] and alpha=90 [CD undefined by the formula, hand-set in
// the CSV to a flat-plate value; sanity-range-checked instead]).
function crossCheckAeroTable(byApex) {
  const REL_TOL = 0.02;
  for (const apexStr of Object.keys(byApex)) {
    const apex = num(apexStr);
    const AR = polhamusAR(apex);
    const Kp = polhamusKp(AR);
    const table = byApex[apexStr];
    for (let i = 0; i < table.alphaDeg.length; i++) {
      const alphaDeg = table.alphaDeg[i];
      const alphaRad = (alphaDeg * Math.PI) / 180;
      const CLgen = polhamusCL(alphaRad, Kp, polhamusKv);
      const CLload = table.CL[i];

      if (alphaDeg === 0) {
        if (Math.abs(CLload) > 1e-6) throw new Error(`aero table integrity: CL(0) should be 0 at apex ${apex}`);
        continue;
      }
      const relCL = Math.abs(CLgen - CLload) / Math.max(Math.abs(CLload), 1e-9);
      if (relCL > REL_TOL) {
        throw new Error(`aero table integrity: CL mismatch at apex ${apex} alpha ${alphaDeg}deg: table=${CLload} generated=${CLgen.toFixed(4)} (${(relCL * 100).toFixed(2)}%)`);
      }

      if (alphaDeg === 90) {
        const CDload = table.CD[i];
        if (CDload < 1.0 || CDload > 1.4) {
          throw new Error(`aero table integrity: CD(90) out of sane flat-plate range at apex ${apex}: ${CDload}`);
        }
        continue;
      }
      const CDgen = polhamusCD(CLgen, alphaRad, 0.06, 1.0);
      const CDload = table.CD[i];
      const relCD = Math.abs(CDgen - CDload) / Math.max(Math.abs(CDload), 1e-9);
      if (relCD > REL_TOL) {
        throw new Error(`aero table integrity: CD mismatch at apex ${apex} alpha ${alphaDeg}deg: table=${CDload} generated=${CDgen.toFixed(4)} (${(relCD * 100).toFixed(2)}%)`);
      }
    }
  }
}

// Cross-check for crab_claw_CL_CD_v2.csv (round 10, R10-1): same integrity
// purpose as crossCheckAeroTable above, but regenerates against the v2
// generator (polhamusCLv2/polhamusCDv2, AERO_V2_PARAMS) instead of the raw
// Polhamus formula — the v2 table is a measured-anchored RESCALING, not a
// direct Polhamus output, so checking it against the unscaled formula
// would always fail. Tolerance unchanged (2%) per the work order.
// F3(b) (work-order-2026-07-30, settled by docs/adr/0007): the CD column
// checked below is NOT read by any runtime path — since ADR 0007 the runtime
// builds CD from CD0 + inducedK*CL^2 + CDbroadside*sin^4(alpha), and before
// that it rebuilt CD from the CL column. This cross-check is therefore an
// INTEGRITY/PROVENANCE check on the shipped CSV (has the file been silently
// edited or corrupted?), not coverage of a live code path. Kept deliberately,
// and labelled so it cannot be mistaken for the latter.
function crossCheckAeroTableV2(byApex) {
  const REL_TOL = 0.02;
  for (const apexStr of Object.keys(byApex)) {
    const apex = num(apexStr);
    const table = byApex[apexStr];
    for (let i = 0; i < table.alphaDeg.length; i++) {
      const alphaDeg = table.alphaDeg[i];
      const alphaRad = (alphaDeg * Math.PI) / 180;
      const CLload = table.CL[i];

      if (alphaDeg === 0 || alphaDeg === 90) {
        if (Math.abs(CLload) > 1e-6) throw new Error(`aero v2 table integrity: CL(${alphaDeg}) should be 0 at apex ${apex}`);
        const CDload = table.CD[i];
        if (alphaDeg === 90 && (CDload < 1.0 || CDload > 1.4)) {
          throw new Error(`aero v2 table integrity: CD(90) out of sane flat-plate range at apex ${apex}: ${CDload}`);
        }
        continue;
      }
      const CLgen = polhamusCLv2(alphaRad, apex);
      const relCL = Math.abs(CLgen - CLload) / Math.max(Math.abs(CLload), 1e-9);
      if (relCL > REL_TOL) {
        throw new Error(`aero v2 table integrity: CL mismatch at apex ${apex} alpha ${alphaDeg}deg: table=${CLload} generated=${CLgen.toFixed(4)} (${(relCL * 100).toFixed(2)}%)`);
      }
      const CDgen = polhamusCDv2(CLgen, alphaRad, apex);
      const CDload = table.CD[i];
      const relCD = Math.abs(CDgen - CDload) / Math.max(Math.abs(CDload), 1e-9);
      if (relCD > REL_TOL) {
        throw new Error(`aero v2 table integrity: CD mismatch at apex ${apex} alpha ${alphaDeg}deg: table=${CDload} generated=${CDgen.toFixed(4)} (${(relCD * 100).toFixed(2)}%)`);
      }
    }
  }
}

function loadBoatParamsCSV() {
  const text = readFileSync(path.join(DATA_DIR, 'example_proa_parameters.csv'), 'utf8');
  const rows = parseCSV(text);
  const params = {};
  for (const r of rows) params[r.parameter] = num(r.value);
  return params;
}

// ---------------------------------------------------------------------
// Default CONFIG assembly
// ---------------------------------------------------------------------
function buildDefaultConfig() {
  // Round 10 (R10-1): two switchable aero tables — v1 (Marchaj/Polhamus
  // theoretical) and v2 (Di Piazza 2014 measured-anchored, default) — see
  // docs/adr/0003. Both loaded unconditionally (tiny CSVs); the active one
  // is picked by sail.aeroTableVersion and re-derived on every createConfig
  // call (below) so the boat-design tab can switch it at runtime.
  const aeroTableV1 = loadAeroTable('crab_claw_CL_CD_polhamus.csv');
  crossCheckAeroTable(aeroTableV1);
  const aeroTableV2 = loadAeroTable('crab_claw_CL_CD_v2.csv');
  crossCheckAeroTableV2(aeroTableV2);
  const p = loadBoatParamsCSV();
  // F8 (work-order-2026-07-30): inertia is now three separate quantities,
  // derived rather than a single fudge factor. A hull accelerating SIDEWAYS
  // drags a large body of water with it (added mass); pushing it forward
  // barely does. The old single 0.06*m*L^2 for yaw was below even a uniform
  // rod's 1/12, which no mass distribution can justify — added mass only ever
  // adds. Derivations, for L = 5.5 m and draft = lateralArea/L = 0.327 m:
  //   added sway mass  ~ rho*pi*draft^2/4 per unit length, x L  = 474 kg
  //   added yaw inertia = that strip mass integrated with x^2   = 1195 kg.m^2
  //   rod term          = m*L^2/12                              =  479
  //   ama at its spacing = ama.mass * spacing^2                 =  156
  // Surge added mass for a slender body is small (a few % — it is pushing
  // water aside lengthwise, not broadside); 10% is used. ama.mass is now
  // included in the translational masses, which it previously was not.
  const HULL_LATERAL_AREA = 1.8;                        // m^2 — see hull.lateralArea below (same value, needed here first)
  const draft = HULL_LATERAL_AREA / p.boat_length_m;    // ~0.327 m
  const addedSwayPerLength = 1025 * Math.PI * draft * draft / 4;  // kg/m, 2D cylinder analogy
  const dryMass = p.displacement_kg + p.ama_mass_kg;

  return {
    configVersion: CONFIG_VERSION,
    dt: 1 / 240, // physics integration step [s]; simulator.js substeps to the frame dt

    rho_air: 1.225,
    rho_w: 1025,
    g: 9.81,

    hull: {
      length: p.boat_length_m,           // 5.5 m
      beam: p.hull_beam_m,                // 0.45 m (see example_proa_parameters.csv)
      displacement: p.displacement_kg,    // 190 kg (see example_proa_parameters.csv)
      // massSurge / massSway / yawInertia: see the F8 note above for each
      // term's derivation. All three are configurable, as the work order asks.
      massSurge: dryMass + 0.10 * p.displacement_kg,
      massSway: dryMass + addedSwayPerLength * p.boat_length_m,
      yawInertia: dryMass * p.boat_length_m * p.boat_length_m / 12
        + p.ama_mass_kg * p.beam_overall_m * p.beam_overall_m
        + addedSwayPerLength * Math.pow(p.boat_length_m, 3) / 12,
      // Windage (F15, docs/adr/0008): the above-water body the air acts on —
      // hull topsides (~5.5 x 0.25), a standing crew (~0.6), mast and spars
      // (~0.4), platform edge (~0.2). Beam-on projected area, the orientation
      // that matters most (a shunt lies the boat across the wind). CD ~0.85 is
      // the usual bluff-body range for such a collection of shapes.
      windageArea: 1.8,                    // m^2 — BEAM-ON projected area; tunable estimate, same status as lateralArea
      windageAreaFrontal: 0.5,             // m^2 — END-ON area (bow, mast section, one crew); windageForce interpolates on sin^2 of the apparent-wind angle
      windageCD: 0.85,
      wettedSurface: 3.0,                  // m^2 — tunable estimate (slender canoe hull)
      // Cf is no longer a stored constant (round 7, R7-1) — hydro.js
      // computes it per-call from the ITTC-57 model-ship line at the
      // instantaneous Reynolds number (u*length/nu), which is the
      // physically-grounded replacement for the old flat 0.0015 estimate.
      // residuary (wave-making) resistance: round 9, R9-1
      // (ROUND9_physics_fidelity_work_order.md). Replaces the old
      // froudeThreshold/waveResistanceCoeff u^4-above-Fr-0.4 "wave wall",
      // which was a displacement-monohull hull-speed model (Fr~0.4) applied
      // to a slender L/B~12:1 canoe hull that has no such wall (Dierking;
      // Pacific flying proas routinely ran Fr 0.5-1.0). Expressed in the
      // SAME nondimensional form as skin friction (Cr, not a raw N-scaling
      // coefficient) and bounded to the same order as Cf (~0.003) rather
      // than the old term's 100-500x-friction blowup — see hydro.js
      // hullResistance(). A Gaussian hump centered at the main prismatic
      // hump (FrPeak) that rises from ~0 well below it and falls away
      // again at high Fr (semi-planing relief), never growing unbounded.
      residuaryPeakCr: 0.006,             // tunable — Cr at the hump's peak, ~2x Cf (slender-hull order of magnitude, not a monohull's 100x+)
      residuaryFrPeak: 0.5,               // tunable — Fr at which residuary resistance peaks (the main prismatic hump)
      residuaryFrWidth: 0.18,             // tunable — Gaussian width; keeps the hump's rise/fall gentle (naturally ~0 below Fr~0.3, per work order's "~0 below Fr~0.35")
      // Tail plateau past the hump (P1, docs/work-order-2026-07-22.md;
      // docs/diagnostic-2026-07-22-residuary-hump.md; docs/adr/0006):
      // the pure Gaussian falls back toward 0 for Fr well past FrPeak,
      // which let the polar's settle-gate bug hide a SECOND, unphysically
      // fast branch (semi-planing relief past the hump is real, but a
      // slender canoe hull doesn't shed residuary resistance all the way
      // back to ~friction-only — Dierking's proa speed data tops out
      // well short of that). Holds Cr at this fraction of its peak value
      // for Fr > FrPeak instead of letting the Gaussian tail go to ~0,
      // capping reach-speed at TWS6 well under the un-plateaued model's
      // >14.4kn. The diagnostic's own 2-seed hysteresis probe (TWA135,
      // u0=1.0 vs 6.5) only needs >=0.10 to lose the double branch there,
      // but P1's own acceptance bar is stricter — total resistance
      // genuinely non-decreasing across a fine 3-9 m/s sweep, not just at
      // those two sample speeds — which a dense sweep showed first holds
      // at ~0.32; 0.35 clears it with margin.
      residuaryTailPlateau: 0.35,          // tunable — fraction of residuaryPeakCr retained far past FrPeak (smallest value clearing a fine-grained non-decreasing-resistance sweep, 3-9 m/s)
      // hullSideForceCoeff (round 10, R10-3, docs/adr/0004): replaces the
      // old sideForceCoeff/leewaySaturationDeg/leewayMushingCoeff trio
      // (a saturate-then-mush shape with NO measured basis) with a
      // direct fit to Flay, Irwin & Viola 2025's towing-tank CS(leeway)
      // for their V2 hull (narrow 70deg-keel Vee, the proa-like case):
      // CS(lambda) = csV2A*lambda + csV2B*lambda^2 (lambda in DEGREES,
      // matching the digitized source's own units), valid 0-16deg — the
      // measured range shows NO saturation (rises superlinearly, a
      // strengthening vortex-lift mechanism), contradicting the old
      // model's 15deg knee. csBlendStartDeg..csBlendEndDeg (16-24deg)
      // blends toward the V1 hull's (100deg keel, more rounded) own
      // fitted curve — V2 has no data past 16deg, so a naive continuation
      // of its own steeper quadratic would run away; V1's slower,
      // independently-measured growth (tested to 24deg) is a more
      // defensible extrapolation than V2's own unconstrained curve.
      // Beyond csBlendEndDeg (24deg, the edge of ANY measured data): CS
      // holds FLAT (config.js validateConfig doesn't enforce this shape —
      // it's applied in hydro.js hullSideForce) — an explicitly
      // provenance-free extrapolation guard, not a measured claim.
      csV2A: 0.00564, csV2B: 0.00042,     // fit residuals within the digitized +-0.01 uncertainty at all 4 V2 anchors (4/8/12/16deg) — see ROUND10_data_integration_findings.md
      csV1A: 0.00598, csV1B: 0.00019,     // V1 fit (4/8/16/24deg anchors), used only for the 16-24deg blend target
      csBlendStartDeg: 16,
      csBlendEndDeg: 24,
      // sailingFreeReliefPeak (round 10, R10-3): qualitative reproduction
      // of Flay's Fig 15 finding (CR decreases with leeway for V hulls) —
      // see hydro.js hullSideForce's own comment for the full reasoning
      // and the caveat that no quantitative CR-vs-leeway curve exists to
      // fit against (Fig 15 is described qualitatively only). Ramps up
      // 0..8deg, flat at full relief across 8-12deg (matching the
      // harness's own direct assertion window), fades back to 0 by 24deg.
      // 1.0 (magnitude — full induced-drag elimination within the
      // plateau) is sized empirically so total resistance at 8-12deg
      // leeway does not exceed the 0-deg value, not derived from a
      // source number.
      sailingFreeReliefPeak: 1.0,
      sailingFreeReliefPlateauStartDeg: 8,
      sailingFreeReliefPlateauEndDeg: 12,
      sailingFreeReliefFadeEndDeg: 24,
      lowSpeedSideDamping: 100,            // tunable — N per (m/s) of sway speed; linear-regime side resistance that keeps a near-stalled boat from drifting freely at very low absolute speed, independent of the (now measured) CS curve's own shape
      crossFlowDragCoeff: 1.1,             // R9 follow-up — bluff-body cross-flow (broadside) drag coefficient on the lateral plane; past stall the hull is dragged side-on and meets huge resistance (fixes the spurious "sails sideways" state; see hydro.js hullSideForce and the ROUND9 findings)
      // lateralArea (~Lwl*draft): dual-use since round 10, R10-3 — the
      // cross-flow bluff-body term above (unchanged) AND the new
      // hullSideForceCoeff CS(leeway) term (hydro.js) both reference this
      // same projected-side-area estimate. Flay's own CS is referenced to
      // THEIR test hull's projected side area (12m hull, 4.88 m2 full
      // scale) — since CS is a dimensionless coefficient, the "conversion"
      // to our geometry is simply computing Fy from OUR OWN area here
      // (not theirs), per the work order's explicit instruction, rather
      // than a unit-conversion factor. Validity ceiling (Flay's own
      // caveat): Fr<=0.48 — beyond that, the residuary hump model (ADR
      // 0001) already covers the high-Fr regime with its own separate
      // provenance; no additional guard needed here since side force and
      // longitudinal resistance are independent terms.
      lateralArea: HULL_LATERAL_AREA,      // m^2 — hull lateral (broadside) plane area (~length*draft); tunable estimate (no direct measurement of THIS hull's draft)
      // Yaw damping (F10, work-order-2026-07-30) — replaces the single
      // yawDampingCoeff: 900 with `r*(1+|u|)`, which was dimensionally
      // inconsistent (a bare 1 added to m/s) and gave a STOPPED boat full
      // damping. Split into the two standard manoeuvring terms; see
      // core/hydro.js yawDamping() for the derivation and for why the
      // magnitude had to come down (before F9 the steering oar supplied ZERO
      // yaw damping, so 900 was silently covering the rudder's share too —
      // measured 52% rudder / 48% hull at u=3, r=0.3 once the oar became a
      // real foil).
      // yawDampingCrossFlow is DERIVED, not picked: a hull rotating at r moves
      // its section at x sideways at r*x, so strip theory over the lateral
      // plane gives N = 0.5*rho*Cd*draft*r^2 * integral(|x|x^2) =
      // 0.5*rho*Cd*draft*r^2 * L^4/32. With rho=1025, Cd=crossFlowDragCoeff
      // (1.1, the same bluff-body value hullSideForce uses), draft =
      // lateralArea/L = 0.327 m and L = 5.5 m, that is 5276. Halved to 2640:
      // the full value assumes fully separated cross-flow along the whole
      // hull, which is an upper bound at the modest yaw rates this boat
      // actually sees. Order of magnitude is the derivation's; the 0.5 is an
      // explicit, labelled reduction, not a fitted constant.
      yawDampingLinear: 150,              // N*m per (m/s * rad/s) — bare-hull circulatory term, vanishes at u=0; the rudder (F9) now supplies most of the circulatory damping
      yawDampingCrossFlow: 2640,          // N*m per (rad/s)^2 — derived above; present at rest, which is what damps a stationary boat
      clrXFraction: 0.05,                 // tunable — center-of-lateral-resistance offset from CG (aft), fraction of half-length
      // clrDepth (F12, work-order-2026-07-30): depth of the centre of lateral
      // resistance below the waterline. The sail's side force and the hull's
      // hydrodynamic reaction form a COUPLE, so the heeling arm is
      // CEheight + clrDepth, not CEheight alone. Band estimate like
      // lateralArea (no direct measurement of this hull): lateralArea 1.8 m^2
      // over a 5.5 m waterline implies ~0.33 m mean draft, and the centroid
      // of that lateral plane sits near mid-draft — 0.35 m is that, rounded.
      clrDepth: 0.35,                     // m — tunable estimate, same status as lateralArea
      crewForeAftTrimCoeff: 0.15,          // tunable ("k_trim") — fraction of half-length the CLR shifts per unit crewPosX (FIX_REQUEST_round4_roll_dof.md 1.5)
      crewTrimSign: 1,                     // +-1 — flips the crewPosX->CLR-shift direction; verified empirically against the 1.6 coupling-sign test (forward crew -> luff), see ARCHITECTURE doc
      yawHeelSign: 1,                      // +-1 — flips the heel->yaw coupling direction (aero.js yawMomentHeel); verified empirically against the 1.6 coupling-sign test (crew toward ama -> bear away), see ARCHITECTURE doc
      ceLeverSign: 1,                     // +-1 (aero.js xCE/yCE yaw-lever sign) — round 10 (R10-4, docs/adr/0004): CURRENTLY THE IDENTITY, not an active flip. Round 5-7 used -1 to match the old (now-retired) "sheet in bears away" manual rule; the round-9 lead fix (0.15->0.05*LWL) removed the structural lee-helm bias that rule was masking, and the naive, unflipped r x F derivation now matches the boat's real (standard, non-inverted) steering direction on its own — see aero.js's own comment at this line for the full history
      // lead: round 7, D-6 (ROUND7_DECISION.md). Classical yacht-design
      // "lead" — the CE-CLR longitudinal separation — order 5-25% of
      // waterline length depending on hull/rig type (Larsson & Eliasson,
      // Principles of Yacht Design). Replaces round 5's ad-hoc
      // tackXFraction-based CE anchor (aero.js sailForces no longer uses
      // tackXFraction for the yaw-moment geometry — it's still used by
      // ui/app.js for drawing the mast/tack position, kept for that).
      // Per-boat parameter; revisit if a specific hull's real lead is
      // measured.
      //
      // R9 follow-up: lowered from 0.15 (15% LWL) to 0.05 (~5%, low edge of
      // the literature band). At 15% the CE sat so far forward of the CLR
      // that ceLeverSign=+1 produced a STRUCTURAL lee-helm bias the sail and
      // crew couldn't overcome — the boat bore away off any course tighter
      // than ~97deg TWA and could not point without the rudder (which on a
      // Pjoa is a last resort). Measured M(TWA) balance was negative across
      // the whole close-hauled range at lead=0.825; at ~0.05*L it crosses
      // zero near 55-58deg, giving a stable, rudder-free pointing attractor.
      // Only the baseline shifts — the delta-dependent trim steering
      // (halfChordEff*cos(delta)) is untouched, so T3/T4's directions hold.
      //
      // Round 10d (H1, ROUND10d_helm_balance.md): 0.05*L passed every
      // DIFFERENTIAL steering test (T1-4, C-bearaway, ...) but none of
      // those bound the ABSOLUTE helm balance at a fixed trim — a gap this
      // round's new "rudder-free release at the polar-optimal beam reach"
      // test closes. At 0.05*L that test measured a genuine but marginal
      // WEATHER-side drift (initial rate 0.31deg/s, fine; but 60s excursion
      // 16.2deg, just over the 15deg ceiling). A fine sweep of lead within
      // the mandated 5-25%*LWL band (probe: TWA90/TWS6/crewPos0.35, sheet
      // re-optimized per point, rudder released after a 30s settle) found
      // the balance is a KNIFE EDGE in this narrow window — the drift's own
      // sign flips from weather to lee between lead=0.065*L and 0.07*L, so
      // 0.05-0.065*L is the only sub-range that is BOTH in-range and
      // weather-side. 0.06*L (initial rate 0.14deg/s, 60s excursion 7.2deg,
      // both comfortably inside the acceptance band) is picked over values
      // closer to the flip (e.g. 0.065*L, excursion 2.8deg) specifically
      // for that margin from the knife edge — a boat this close to a sign
      // flip is not a robustly-calibrated one, even though 0.065 alone also
      // technically passes. Direction (weather) matches the manual's
      // "hands-off canoe settles toward the wind" convention this round's
      // acceptance criterion cites; the sail-trim-response DIRECTIONS this
      // shift moves through are unchanged (still 0.05<lead<0.07, nowhere
      // near the ~0.15-0.2*L range where D-6's original diagnosis found the
      // opposite, structural lee-helm regime) — see
      // ROUND10d_helm_balance_findings.md for the full before/after
      // moment-budget table and the re-run D-6/T3/T4 differential numbers.
      //
      // S1 (work-order-2026-08-02): the round-10d test described above was
      // later dropped from the suite, and this value — whose ONLY
      // justification was that measurement — outlived it. The measurement is
      // back, as harness/asserts.js's S1a/S1b, and now runs on a grid
      // (TWA 70/90/110 x TWS 6/10) rather than at the single operating point
      // the original used. It no longer passes anywhere: 21-52deg of
      // excursion against the 15deg ceiling. That is NOT a call to re-pick
      // lead. Nothing about this constant changed; F9 (the oar's real
      // inflow-driven force) and F10 (removal of the artificial yaw damping)
      // did, and between them the hull was left with no directional
      // stability of its own for lead to balance against. Searching this
      // 2.7cm knife-edge window again would only re-create the same
      // fragility one audit further on. S2/S3 of that work order remove the
      // problem structurally, by giving the model the movable tack / mast
      // rake and leeboard that a real proa steers with; lead is meant to
      // become an OUTCOME of that geometry rather than the single free knob
      // holding the whole balance. Until then S1a/S1b are xfail:STEERING
      // with their numbers, deliberately not tuned green.
      lead: 0.06 * p.boat_length_m,
    },

    ama: {
      length: p.ama_length_m,             // 3.5 m
      maxBuoyancy: p.ama_buoyancy_kg,      // 80 kg
      mass: p.ama_mass_kg,                 // 25 kg — resists lifting when windward (normal case)
      spacing: p.beam_overall_m,           // 2.5 m (hull-ama spacing, "B")
      wettedSurface: 0.6,                  // m^2 — tunable estimate, fully immersed
      // formFactor: round 7, R7-1. The ama is a slender float trailing
      // fore-aft through the water like a second, smaller hull — NOT a
      // bluff cross-flow body — so its drag is ITTC-57 skin friction at
      // its own length/Reynolds number (see hydro.js's shared ittc57Cf),
      // same as the main hull, times this (1+k)-style form factor. This
      // replaces the old flat dragCoeff=0.4 bluff-body estimate, which
      // was ~100x too high for a body moving lengthwise and was the root
      // cause of the ama out-dragging the main hull 26-30x (diagnosed
      // from simpjoa-recording-20260716-155817.json, see recordings/ and
      // ARCHITECTURE's calibration section). Round 7 set this to 3.3 — the
      // TOP edge of the standard ITTC/Prohaska form-factor range (normally
      // 1.1-1.4 for a slender body; 3.3 is 2-3x that) — specifically
      // because it was the minimum ama-drag authority that kept T1's "crew
      // toward ama" steering leg correctly signed (ROUND7_DECISION.md D-1).
      // Round 9 (R9-3, ROUND9_physics_fidelity_work_order.md) corrects
      // this to the genuinely physical 1.2 (mid-range): real proa steering
      // is dominated by the sail CE/hull CLR balance and the steering oar,
      // not by outrigger drag — T1's ama-drag-lever mechanism regressing
      // here is the EXPECTED, intended consequence of removing an
      // unphysical crutch, not a new bug (see ROUND9_physics_fidelity_
      // findings.md for the resulting re-tag). The R7-4a drag-ratio hard
      // anchor bands themselves were also re-derived (harness/asserts.js)
      // since the old [0.4,1.0] max-immersion band is only reachable at
      // formFactor>=~3 — it was an artifact of accommodating the
      // unphysical value, not an independent physical constraint.
      formFactor: 1.2,
      // crewImmersionCoeff DELETED (F14, work-order-2026-07-30): the crew's
      // effect on ama immersion is now DERIVED in hydro.js from the real
      // buoyancy balance (crewPos*crew.mass vs ama.maxBuoyancy), not scaled by
      // a tunable. The old 0.30 gave exactly 1/3 of the physical effect, and
      // the comment it carried admitted it had been raised from 0.21 to keep a
      // polar acceptance ratio in band — a knob fitted to a test threshold
      // rather than to the float's buoyancy.
    },

    sail: {
      area: p.sail_area_m2,                // 12 m^2
      apexAngleDeg: p.sail_apex_angle_deg,  // 50 deg (45-60 valid range)
      CEheight: p.CE_height_m,              // 2.0 m
      // camber/CD0/s: round 10 (R10-1, docs/adr/0003) retune. aero.js never
      // reads the aeroTable's own CD column (only CL) — CD is recomputed
      // at RUNTIME from CD0/s below, so switching the CL table to the v2
      // measured-anchored curve does NOTHING to drag unless these two are
      // ALSO updated to the same fit (crab_claw_CL_CD_v2.csv's own
      // generation parameters, AERO_V2_PARAMS in config.js): CD0=0.040
      // (identical for both apex 45/60 in the fit); `s` interpolated at
      // apexAngleDeg=50 between the two apex fits (0.406/0.428) -> ~0.41.
      // `camber`: SET TO 0, changed from round 9's 0.10 — the Di Piazza
      // Santa Cruz curve is a MEASURED sail's actual CL, already carrying
      // whatever real camber that sail had. Round 10d (C-C,
      // ROUND10d_helm_balance.md) redefined what this value MEANS rather
      // than just leaving it at 0: aero.js's camberCLDelta() now reads
      // `camber` (and brailCamberGain below) as a DELTA beyond the active
      // table's own built-in camber (aeroV2BuiltinCamber for v2, 0 for
      // v1 — a genuinely flat theoretical table), not an absolute camber
      // ratio applied on top of a flat plate — see camberCLDelta's own
      // comment in aero.js for the double-counting this fixes (the OLD
      // camberCLFactor call always assumed a flat-plate baseline, which
      // was only ever true for v1). camber=0 stays a no-op for v2's own
      // baseline exactly as before (delta=0); the fix specifically
      // corrects brailCamberGain below, which is the only thing that
      // makes camberEff nonzero by default.
      camber: 0,
      // aeroV2BuiltinCamber (round 10d, C-C): the v2 table's own built-in
      // camber ratio, "1:10" per the work order (Di Piazza's Santa Cruz
      // sail — a real rigid crab-claw, not a flat theoretical plate — this
      // is an order-of-magnitude literature figure for that class of sail,
      // not independently re-measured from the digitized curve itself).
      // Only read when sail.aeroTableVersion is 'v2' (aero.js); v1 uses 0
      // (a genuinely flat, uncambered theoretical table) unconditionally.
      aeroV2BuiltinCamber: 0.10,
      // --- CD model (F7, work-order-2026-07-30, docs/adr/0007) ------------
      // CD = CD0 + inducedK*CL_working^2 + CDbroadside*sin^4(alpha)
      //      + brailParasiticCD*max(brails) + flogging
      // Least-squares fit to Di Piazza's four measured Santa Cruz (CL,CD)
      // pairs PLUS their reported L/D_max ~5.4 as a fifth constraint (the
      // four pairs alone leave alpha<20deg unconstrained — the fit then runs
      // peak L/D to 7.6). Residuals vs the four pairs: +0.029/+0.036/-0.021/
      // +0.010, i.e. inside the digitisation uncertainty the source CSV
      // states (+-0.05). Replaces the old CD0 + s*CLtable*tan(alpha): that
      // form had a pole at 90deg, collapsed to CD0 there (CLtable=0 exactly)
      // and drove induced drag from the TABLE CL rather than the working one.
      // `s` is gone with it — it had no other runtime reader.
      CD0: 0.0375,
      inducedK: 0.215,                         // induced-drag coefficient on the WORKING CL^2
      CDbroadside: 1.06,                       // CD at alpha=90 (flat-plate/separated limit); with sin^4 it is negligible at the low-alpha calibration point
      brailParasiticCD: 0.06,                  // extra parasitic drag from gathered/flogging cloth, scaled by max(brailLee, brailWind) — F7: the brails' drag effect is an ADDITION, not a multiplier that cut drag
      // --- Effective area under brail (F4) --------------------------------
      // A brail gathers cloth: the working area shrinks. AGGRESSIVE variant
      // (maintainer's call): a full TRIM-regime carrot keeps 55% of the area,
      // so reefing genuinely depowers instead of adding force. The survival
      // endpoint (0.20) is picked to land near the OLD CL x0.2 cut at
      // brailWind=1, keeping the T6/stop/squall calibration at full pull.
      areaAtTrimBrail: 0.55,                   // areaFactor at brailWind = brailTrimRange
      areaAtFullBrail: 0.20,                   // areaFactor at brailWind = 1
      areaAtFullLeeBrail: 0.35,                // areaFactor at brailLee = 1 (linear in brailLee)
      // --- Sheet constraint (ROUND5_CONSOLIDATED_work_order.md P1) ---
      yardSwingRateDegPerSec: 90,             // tunable — max slew rate for state.delta relaxing toward its equilibrium (request's own suggested 60-120deg/s band: "a swinging yard, not a teleport")
      deltaMaxReleaseDeg: 90,                 // the sheet limit is released to this during a shunt's ease/transfer/swap phases, then closes back to the commanded controls.sheet once 'sheet' starts hauling it in (P1.1 point 3)
      floggingCDFactor: 0.15,                 // tunable — extra parasite drag while luffing (delta held below the sheet limit by the wind, not by the sheet), as a fraction of CD0; request's own suggested 0.1-0.2 band
      // --- CE geometry (P1.2, redone round 7 D-6) --- tackXFraction is
      // now UI-rendering-only (ui/app.js draws the mast/tack at this
      // fraction of hull half-length); aero.js's yaw-moment CE geometry no
      // longer reads it — see hull.lead above and ceSwingFraction below.
      tackXFraction: 0.06,                    // fraction of hull half-length — mast/tack position, active-bow side of CG (UI drawing only, round 7)
      ceBrailShift: 0.3,                      // tunable (P2-3), fraction of the half-chord the CE shifts toward the tack at brailWind=1 (spilling the sail's rear/upper area), request's own suggested ~0.25-0.35 band
      // yceBrailShift (round 10c, C1, ROUND10c_carrot_two_regime.md):
      // SEPARATE from ceBrailShift above — round 10b (D2) unified xCE/yCE
      // onto the same shrinking half-chord, but the manual's downwind
      // "carrot" technique needs the LATERAL arm (yCE) to shrink harder
      // than the fore-aft one: gathering the sail's rear/upper area toward
      // the yard's pivot pulls the pressure centroid inboard/up on both
      // axes, but it's specifically the lateral (yCE) collapse that attacks
      // the deep-course luffing/yaw moment (-yCE*Fx in aero.js's
      // yawMoment) — the mechanism this round's bear-away/dead-run-release
      // acceptance tests depend on. Set stronger than ceBrailShift (0.3);
      // kept < 1 so halfChordEffY never reverses sign at brailWind=1.
      yceBrailShift: 0.6,
      // brailTrimRange (round 10c, C1): the windward brail's two real
      // roles per the manual — TRIM (partial pull: deepens the belly,
      // shifts CE toward the tack, sail keeps drawing) vs SURVIVAL (pull
      // past this point: spills power, panic/furl territory) — were
      // conflated by round 5's single linear CL/moment cut. Below this
      // fraction of brailWind, aero.js's brailRegimeBlend() applies only
      // the mild TRIM-regime cuts; above it, cuts ramp to the original
      // strong SURVIVAL-regime values (preserving T6/panic and the stop/
      // squall scenarios). 0.6 is this round's own suggested default —
      // not independently measured, same status as ceBrailShift/
      // ceSwingFraction.
      brailTrimRange: 0.6,
      // brailCamberGain (round 10c, C1): the manual's TRIM-regime
      // technique deepens the sail's belly under partial windward-brail
      // pull (gathering the leech doesn't just spill area, it also bags
      // the remaining draft) — reuses the existing camber->CL machinery
      // (camberCLDelta/camberCDf in aero.js) rather than a new curve.
      // Peaks at brailTrimRange (full TRIM-regime pull) via
      // brailRegimeBlend, fading back to 0 by brailWind=1 (a fully spilled
      // SURVIVAL-regime sail is gathered, not bagged). Round 10d (C-C)
      // fixed two things this round 10c comment used to flag as known
      // gaps: (1) this value is now read as a DELTA beyond the v2 table's
      // own built-in camber (aeroV2BuiltinCamber above), not an absolute
      // ratio double-counting it — the OLD camberCLFactor call was
      // silently applying MORE bonus than a value this size should give,
      // on top of a curve that was already cambered; (2) camberCLFactor's
      // own fade window was extended 45deg -> 75deg (aero.js
      // CAMBER_FADE_END_DEG) — deep-course TRIM-regime trims sampled at
      // 32-85deg alphaSailor (D4/C's own recipes), mostly PAST the old
      // 45deg cutoff, so this term was silently near-inactive for most of
      // its own intended use case. Magnitude itself (0.45) unchanged —
      // still this round's own suggested default, not independently
      // measured, same status as ceBrailShift/ceSwingFraction; the C2
      // deep-course speed-ratio test is re-anchored against the corrected
      // (smaller, since it no longer double-counts) effective bonus — see
      // ROUND10d_helm_balance_findings.md.
      //
      // F6 (work-order-2026-07-30): cut 0.45 -> 0.10. At 0.45 the DELTA is
      // added to the table's own 0.10, so camberCLFactor was evaluated at
      // c = 0.55 — a 55%-of-chord draft, i.e. a half-circle, roughly 4x
      // outside the c ~ 0.05-0.15 band the linear 1+1.75c fit is valid over.
      // 0.10 keeps the sum (camber + gain + builtin) at the 0.20 ceiling
      // validateConfig now enforces, and still gives a real TRIM-regime
      // bonus: CL x1.15 at low alpha. The area model (F4) now carries the
      // brail's force change; this term only carries the BAGGING effect it
      // was always meant to describe.
      brailCamberGain: 0.10,
      // ceSwingFraction: round 7, D-6. The yard's swing (delta) still
      // moves the CE fore-aft/athwartship (a real crab-claw's CE genuinely
      // shifts with trim — that's the whole mechanism by which trimming
      // steers), but round 5's model let the FULL geometric half-chord
      // excursion reach the CE, which the owner's field datum (D-6) says
      // is far too responsive for a real Pjoa. A flow-attached aerodynamic
      // center tracks closer to the leading edge across the practical trim
      // range than the raw geometric midchord, so only a fraction of the
      // full swing should reach it.
      // Round 10b (D1) audit: this comment used to claim "0.2 is
      // empirically landed against the D-6 target", contradicting the
      // 0.5 checked in right below it. git history (`git log -p --
      // core/config.js`) shows 0.5 is the ONLY value ever committed here —
      // there is no commit where 0.2 was the active, tested value. The
      // referenced tests (T1/T3/T4/T5) were also retired and replaced by
      // the R9 follow-up's "Sail steers"/"T2" steeringDrift+steeringOk
      // checks below. Re-verified directly this round: at 0.5 the current
      // "Sail steers: trimming the sheet in points up" probe drifts
      // 2.3deg (passes steeringOk's 2deg floor); at 0.2 it drifts only
      // 0.17deg — noise-level, FAILS. So 0.5 is what's actually validated
      // today; the old "0.2" claim was dropped rather than restored.
      ceSwingFraction: 0.5,
      // verticalLiftFraction: round 9, R9-4. Fraction of the sail's force
      // treated as vertical (upward) lift on a normally-trimmed crab claw,
      // unloading the heel arm for the same drive (see aero.js
      // sailForces()'s heelMoment comment for the Marchaj-vs-Di-Piazza
      // literature tension). Defaulted to 0 (mechanism present, inactive)
      // rather than the work order's suggested ~0.15-0.25: empirically,
      // post R9-1/R9-2/R9-3's already-higher sail power, the established
      // capsize-safety scenarios (T6's held-sheet gust, T10, the aback
      // scenario) sit on a genuine knife-edge at this operating point —
      // even verticalLiftFraction=0.01 flips T6's held-sheet gust from a
      // clean capsize (maxPhi=65deg) to none (34deg); there is no
      // meaningful nonzero value that both matches the work order's
      // ~0.15-0.25 intent and preserves those scenarios' validated
      // capsize margins. This is a fresh capsize-margin recalibration
      // exercise (re-deriving gust/trim severity for T6/T10/aback) beyond
      // this round's scope — deferred, not abandoned; see
      // ROUND9_physics_fidelity_findings.md.
      verticalLiftFraction: 0,
      // aeroTableVersion (round 10, R10-1, docs/adr/0003): 'v2' (default)
      // = Di Piazza 2014 measured-anchored table; 'v1' = the original
      // Marchaj/Polhamus theoretical table. Kept switchable (not a one-way
      // migration) per the round-0 design intent ("wymienne zestawy
      // krzywych" — swappable curve sets) so Marchaj-vs-DiPiazza stays a
      // live comparison, not just a historical note. createConfig()
      // re-derives `aeroTable` from this field on every call, so the
      // boat-design tab can switch it at runtime.
      aeroTableVersion: 'v2',
    },

    crew: {
      mass: 90,                // kg
      posMin: -0.3,
      posMax: 1.0,
      posXMin: -1.0,            // fore-aft crew position range (FIX_REQUEST_round4_roll_dof.md 1.5)
      posXMax: 1.0,
    },

    stability: {
      abackCapsizeTime: 6,       // s — sustained aback before capsize (acceptance criterion 3; unchanged, R8-1(b): already physical)
      amaLoadDisplayCap: 3.0,    // UI-safe ceiling for amaLoad readouts (FIX_REQUEST_step1_round2.md R2-3); the raw value stays unclamped for the aback timer above
      // --- Roll as a 4th DOF (FIX_REQUEST_round4_roll_dof.md Part 1) ---
      // I_roll: the extension request's own suggested starting estimate
      // (displacement*(0.4*ama.spacing)^2 = 190*1.0^2 = 190 kg*m^2) gave a
      // roll period of only ~1.0s at a representative 8deg step, well
      // under the requested 1.5-4s band — raised (tunable, as the request
      // itself flags this default) to hit the target: 1500 kg*m^2 gives a
      // measured period of ~2.6s (empirical step-response probe, 8deg
      // initial displacement, zero wind).
      I_roll: 1500,
      phiLiftoffDeg: 12,          // deg — roll angle at which the ama's weight-restoring moment saturates ("ama just clear of the water", amaLoad == 1.0 exactly here)
      phiSubmergeDeg: 10,         // deg — roll angle (negative side) at which the ama's buoyancy-restoring moment saturates ("ama fully submerged", amaLoad == 1.0 exactly here)
      // rollDampingCoeff: paired with I_roll=1500 above, originally tuned
      // so an 8deg step settles (|phi|<0.4deg) in ~3.2 oscillation periods
      // (within the requested 2-4 period, damped-overshoot band), which
      // Round 7 sec 6 cross-checked as implying a damping ratio zeta~0.152
      // — plausible but on the low side of the zeta~0.2-0.4 cited for a
      // beamy multihull form with an ama sweeping through water. Round 9
      // (R9-5, ROUND9_physics_fidelity_work_order.md): modest bump toward
      // that range (zeta~0.19 at this value, same I_roll/stiffness) —
      // independent, small, opportunistic; not re-tuned to any specific
      // downstream test.
      rollDampingCoeff: 1100,
      // phiCapsizeDeg (EXTENSION_round5_sheet_constraint.md R5-2.1): past
      // this angle (symmetric on both sides) the ama's restoring arm
      // reverses into a genuine capsizing arm — see stability.js
      // rollRestoreMoment. 50deg is 38deg past phiLiftoffDeg (12) and 40deg
      // past phiSubmergeDeg (10), both within the request's own suggested
      // "~35-40deg past liftoff" band, and comfortably below the 58deg
      // runaway heel the round-4 review found holding as a spurious stable
      // equilibrium (verified fixed — see ARCHITECTURE doc).
      phiCapsizeDeg: 50,
      // capsizeTriggerMarginDeg (round 8, R8-1): the flying-side (phi>=0)
      // capsize trigger is now purely physical — phi crossing
      // phiCapsizeDeg + this margin, not a timer. The margin exists so
      // the boat visibly rolls PAST the capsizing-arm reversal before
      // integrate()'s freeze-on-capsize catches it (R5-2.2) — freezing
      // exactly AT the reversal would look like the state stopping the
      // instant it goes unstable, not "rolling over". 15deg (round doc's
      // own suggested value) is comfortably inside the capped capsizing-
      // arm's own span (stability.js's rollRestoreMoment ramps to zero
      // and on into the capped reversed arm over the SAME span past
      // phiCapsizeDeg used to hold the old timer-based trigger, HOLD_FRAC
      // through to phiCapsizeDeg + (phiCapsizeDeg-phiLiftoffDeg)), so the
      // boat is already accelerating hard under a genuine capsizing
      // moment for the whole 15deg, not coasting on residual momentum.
      capsizeTriggerMarginDeg: 15,
    },

    rudder: {
      maxDeflectionDeg: 35,
      // area (F9, work-order-2026-07-30): 0.4 m^2 was an unanchored "tunable
      // estimate" and is a DINGHY RUDDER blade, not a hand-held steering oar —
      // it is what produced 2.2 kN (1.2 g on this boat) at 6 kn, eight times
      // the sail's own side force. A Polynesian steering paddle's blade is
      // roughly 0.75 m x 0.20 m. ADR 0005's coeff stays as derived; this is
      // the term that was wrong.
      area: 0.15,               // m^2 — steering-oar blade (~0.75 x 0.20 m)
      // stallAngleDeg (F9): a low-AR (~1.5) plate separates around 20-25deg;
      // past it core/rudder.js's lift shape falls away instead of climbing to
      // the mechanical limit. Below it the shape is exactly the old
      // sin(deflection), so ADR 0005's slope derivation is untouched.
      stallAngleDeg: 22,
      // Blade drag (F9): steering was previously free — rudderForce returned
      // no Fx at all. CD0 is a thin plate's parasitic drag; inducedK gives the
      // lift-induced part, so hard steering costs speed and hard-over-past-
      // stall costs a lot of it.
      // CD0 referenced to the blade's PLANFORM area: skin friction on both
      // faces (~2*Cf ~ 0.008) plus section/form drag for a plain oar blade.
      // 0.02 is that; an initial 0.05 was measured to make a CENTRED oar 22%
      // of total drag, which is bluff-strut territory, not a blade.
      CD0: 0.02,
      // inducedK ~ 1/(pi*AR*e) with AR~1.5 and e~0.7 gives 0.30; 0.35 keeps a
      // little margin for a square-tipped blade.
      inducedK: 0.35,
      // coeff: round 10b (D3, docs/adr/0005) — derived, not felt. The blade
      // is a low-AR (~1-2) lifting surface; core/rudder.js's CL(deflection)
      // = coeff*sin(deflection) stays in the small/moderate-angle range
      // for the whole 35deg mechanical travel, so coeff is matched against
      // the Helmbold low-AR lift-curve SLOPE (2*pi*AR/(2+sqrt(AR^2+4))),
      // not a stall CLmax the model doesn't represent. AR=1-2 spans
      // 1.48-2.60/rad; AR=1.5 midpoint gives 2.09 (rounded 2.1). Cross-
      // checks against Hoerner's independently measured CLmax~1.0-1.2 for
      // AR~1-2 flat plates at high AoA: CL(35deg)=2.1*sin(35deg)=1.20,
      // inside that range. Replaces the previous feel-based "halved from
      // 3.5" (1.75) — see ADR 0005 for the full derivation and why the
      // "too sharp" ergonomic complaint that motivated that halving
      // belongs in UI input shaping (ui/app.js), not the blade physics.
      coeff: 2.1,
    },

    // P4 (docs/work-order-2026-07-22.md; docs/diagnostic-2026-07-22-
    // residuary-hump.md Result 6): the shipped speedLockout=4 m/s (7.8kn)
    // and 5.0s total sequence let a proa shunt near full reach speed —
    // the literature is unanimous a proa comes to a genuine stop first,
    // with the crew physically carrying the yard heel end to end (a
    // materially slower process than a quick automatic animation).
    // speedLockout is lowered toward "nearly stopped," bounded below by
    // harness/scenarios.js's scenarioShunt — an unmodified structural test
    // of shunt continuity on a steady TWA90/TWS6 beam reach, not a "ease
    // down to a stop" maneuver test (see its own header comment) — whose
    // fixed sheet=60deg trim settles to 2.49 m/s by the time it requests
    // its first shunt. A value below that would simply never fire the
    // scenario's shunts rather than model a real stop; fully closing that
    // gap would mean reworking the scenario to ease down before
    // requesting a shunt, out of this item's small-effort scope. Phase
    // durations are lengthened ~3x (5.0s -> 16.4s total) to reflect the
    // same "this is a deliberate human process, not a quick trim" finding
    // — transferDuration (physically carrying the yard) gets the largest
    // share; swapDuration (bookkeeping bow/stern relabel, no physical
    // action) is left unchanged.
    shunt: {
      speedLockout: 2.6,        // m/s — shunt locked out above this speed
      easeDuration: 4.0,        // s
      transferDuration: 8.0,    // s
      swapDuration: 0.4,        // s (near-instantaneous role swap)
      sheetDuration: 4.0,       // s
    },

    aeroTableV1,
    aeroTableV2,
    aeroTable: aeroTableV2, // default, matching sail.aeroTableVersion's default above; createConfig() re-derives this after any patch merge
  };
}

// configFromRecordingSnapshot(snapshot) -> a validated config, with stale
// field SEMANTICS from older recordings migrated forward.
//
// Recordings store a raw config snapshot, and some fields have changed
// meaning since. `sail.camber` is the one that matters: before the v2 aero
// table (round 10, ADR 0003) it was an ABSOLUTE camber ratio against a flat
// Polhamus table, so 0.10 was an ordinary value; on the v2 table — which
// already carries the source sail's own ~0.10 camber — the same field is a
// DELTA on top of that. Replaying an old snapshot verbatim therefore
// double-counts exactly what round 10d's C-C fix removed, and since F6's
// total-camber ceiling (0.20) it would be rejected outright, making archived
// recordings unloadable. Normalise instead: on v2, a pre-v2 snapshot's
// absolute camber is already represented by the table itself.
export function configFromRecordingSnapshot(snapshot) {
  const snap = snapshot ?? {};
  const sail = snap.sail ?? {};
  const usesV2 = (sail.aeroTableVersion ?? 'v2') === 'v2';
  if (usesV2 && (sail.camber ?? 0) > 0) {
    return createConfig({ ...snap, sail: { ...sail, camber: 0 } });
  }
  return createConfig(snap);
}

export function validateConfig(config) {
  const errs = [];
  const inRange = (v, lo, hi, name) => { if (!(v >= lo && v <= hi)) errs.push(`${name}=${v} out of range [${lo},${hi}]`); };

  if (config.configVersion !== CONFIG_VERSION) errs.push(`configVersion mismatch: ${config.configVersion} !== ${CONFIG_VERSION}`);
  if (!['v1', 'v2'].includes(config.sail.aeroTableVersion)) errs.push(`sail.aeroTableVersion must be 'v1' or 'v2', got ${config.sail.aeroTableVersion}`);
  inRange(config.sail.apexAngleDeg, 45, 60, 'sail.apexAngleDeg');
  inRange(config.sail.camber, 0, 0.20, 'sail.camber');
  // F6 (work-order-2026-07-30): the TOTAL camber the CL curve is ever
  // evaluated at — the table's own built-in camber plus sail.camber plus the
  // brail's TRIM-regime bagging gain — must stay inside the band the linear
  // 1+1.75c fit is valid over. Bounding only sail.camber (as before) left
  // brailCamberGain entirely unchecked, which is how c=0.55 (a half-circle
  // "sail") became the default operating point on deep courses.
  {
    const builtin = config.sail.aeroTableVersion === 'v2' ? (config.sail.aeroV2BuiltinCamber ?? 0.10) : 0;
    const totalCamber = config.sail.camber + (config.sail.brailCamberGain ?? 0) + builtin;
    if (!(totalCamber <= 0.20)) {
      errs.push(`sail.camber + sail.brailCamberGain + built-in table camber = ${totalCamber.toFixed(3)} exceeds the 0.20 physical ceiling`);
    }
  }
  // ceSwingFraction is a fraction of the half-chord (round 7, D-6 — see the
  // comment on its default above for the provenance audit this bound comes
  // from); values outside (0,1] were never validated by any committed test.
  inRange(config.sail.ceSwingFraction, 0, 1, 'sail.ceSwingFraction');
  // brailTrimRange (round 10c, C1): the TRIM/SURVIVAL regime split point
  // (aero.js brailRegimeBlend) — must stay strictly inside (0,1) since it's
  // used as a division denominator on both sides of the split.
  inRange(config.sail.brailTrimRange, 0.01, 0.99, 'sail.brailTrimRange');
  inRange(config.crew.posMin, -1, 0, 'crew.posMin');
  inRange(config.crew.posMax, 0, 2, 'crew.posMax');
  inRange(config.rudder.maxDeflectionDeg, 1, 60, 'rudder.maxDeflectionDeg');
  if (!(config.stability.abackCapsizeTime > 0)) errs.push('stability.abackCapsizeTime must be > 0');
  if (!(config.stability.capsizeTriggerMarginDeg > 0)) errs.push('stability.capsizeTriggerMarginDeg must be > 0');
  if (!(config.hull.length > 0)) errs.push('hull.length must be > 0');
  if (!(config.ama.spacing > 0)) errs.push('ama.spacing must be > 0');
  if (!(config.sail.area > 0)) errs.push('sail.area must be > 0');
  if (!(config.stability.I_roll > 0)) errs.push('stability.I_roll must be > 0');
  if (!(config.stability.phiLiftoffDeg > 0)) errs.push('stability.phiLiftoffDeg must be > 0');
  if (!(config.stability.phiSubmergeDeg > 0)) errs.push('stability.phiSubmergeDeg must be > 0');
  if (!(config.stability.rollDampingCoeff > 0)) errs.push('stability.rollDampingCoeff must be > 0');
  inRange(config.crew.posXMin, -1, 0, 'crew.posXMin');
  inRange(config.crew.posXMax, 0, 1, 'crew.posXMax');
  if (!(config.stability.phiCapsizeDeg > config.stability.phiLiftoffDeg)) errs.push('stability.phiCapsizeDeg must be > phiLiftoffDeg');
  if (!(config.stability.phiCapsizeDeg > config.stability.phiSubmergeDeg)) errs.push('stability.phiCapsizeDeg must be > phiSubmergeDeg');
  if (!(config.sail.yardSwingRateDegPerSec > 0)) errs.push('sail.yardSwingRateDegPerSec must be > 0');
  if (!(config.sail.deltaMaxReleaseDeg > 0)) errs.push('sail.deltaMaxReleaseDeg must be > 0');

  if (errs.length) throw new Error('CONFIG validation failed:\n' + errs.join('\n'));
  return config;
}

export function deepMerge(base, patch) {
  if (patch === undefined) return base;
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return patch;
  const out = { ...base };
  for (const k of Object.keys(patch)) {
    out[k] = deepMerge(base ? base[k] : undefined, patch[k]);
  }
  return out;
}

export function createConfig(userConfig) {
  const base = buildDefaultConfig();
  const merged = deepMerge(base, userConfig);
  // Re-derive the active aero table from sail.aeroTableVersion every call
  // (round 10, R10-1) — a patch touching only sail.aeroTableVersion (e.g.
  // from the boat-design tab) must not need to also carry the whole table
  // object; deepMerge only overlays what a patch actually mentions, and
  // aeroTable/aeroTableV1/aeroTableV2 are never part of a boat-design
  // patch, so this is the one place that keeps them in sync with the
  // version flag after any merge.
  merged.aeroTable = merged.sail.aeroTableVersion === 'v1' ? merged.aeroTableV1 : merged.aeroTableV2;
  return validateConfig(merged);
}
