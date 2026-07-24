// config.js — default CONFIG, CSV loading, Polhamus regeneration cross-check,
// range validation. Pure ESM, no external dependencies, Node >= 18.
//
// Design note on the sail drag model (CD0 + s*CL*tan(alpha)):
// data/crab_claw_CL_CD_polhamus.csv was generated with FULL leading-edge
// suction loss (s = 1.0 — see data/README_input_data_EN.md). The startup
// integrity cross-check therefore regenerates the table with s = 1.0 to
// verify the CSV has not been silently edited/corrupted. The prompt's
// tunable partial-suction factor (CONFIG.sail.s, default 0.85) is a
// SEPARATE runtime knob: aero.js never reads the CD column directly, it
// recomputes CD at runtime from the table's CL (which does not depend on
// s) using CONFIG.sail.s. This keeps the shipped table an unmodified,
// verifiable artifact while still honouring the prompt's tunable drag.

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
  const yawInertiaFactor = 0.06; // tunable — fraction of m*L^2 approximating yaw inertia of a slender hull

  return {
    configVersion: CONFIG_VERSION,
    dt: 1 / 240, // physics integration step [s]; simulator.js substeps to the frame dt

    rho_air: 1.225,
    rho_w: 1025,
    g: 9.81,

    hull: {
      length: p.boat_length_m,           // 5.5 m
      beam: p.hull_beam_m,                // 0.55 m
      displacement: p.displacement_kg,    // 250 kg
      yawInertia: yawInertiaFactor * p.displacement_kg * p.boat_length_m * p.boat_length_m,
      wettedSurface: 3.0,                  // m^2 — tunable estimate (slender canoe hull)
      // Cf is no longer a stored constant (round 7, R7-1) — hydro.js
      // computes it per-call from the ITTC-57 model-ship line at the
      // instantaneous Reynolds number (u*length/nu), which is the
      // physically-grounded replacement for the old flat 0.0015 estimate.
      // residuary (wave-making) resistance: round 9, R9-1
      // (ROUND9_physics_fidelity_work_order.md). Replaces the old
      // froudeThreshold/waveResistanceCoeff u^4-above-Fr-0.4 "wave wall",
      // which was a displacement-monohull hull-speed model (Fr~0.4) applied
      // to a slender L/B=10:1 canoe hull that has no such wall (Dierking;
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
      lateralArea: 1.8,                    // m^2 — hull lateral (broadside) plane area (~length*draft); tunable estimate (no direct measurement of THIS hull's draft)
      yawDampingCoeff: 900,               // tunable — N*m per (rad/s), scaled by speed
      clrXFraction: 0.05,                 // tunable — center-of-lateral-resistance offset from CG (aft), fraction of half-length
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
      crewImmersionCoeff: 0.30,            // tunable — fraction of crew weight (relative to ama buoyancy) that presses the ama deeper when crewPos>0 (FIX_REQUEST_step1_round2.md R2-1). Raised from 0.21 in round 3 (FIX_REQUEST_round3_worldframe.md R3-2): doubling the ama/crew righting levers to the full spacing (see stability.js) roughly halved amaLoad for a given heel moment, which — via this term's amaLoad-driven immersion floor — quietly cut the ama-drag penalty enough to let the TWA=40 close-hauled polar point creep past the "no meaningful progress below ~50deg" acceptance ratio (0.353 vs the 0.35 limit); this restores the same margin (0.338) without touching the threshold or the hull/yaw tunables the over-sheeting broach-cliff probe depends on.
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
      CD0: 0.040,
      s: 0.41,                                 // tunable (RUNTIME only) — v2 fit, apexAngleDeg=50-interpolated between apex45 (0.406) and apex60 (0.428); see AERO_V2_PARAMS
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
      brailCamberGain: 0.45,
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
      // (displacement*(0.4*ama.spacing)^2 = 250*1.0^2 = 250 kg*m^2) gave a
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
      area: 0.4,                // m^2 — tunable estimate, steering-oar blade
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

export function validateConfig(config) {
  const errs = [];
  const inRange = (v, lo, hi, name) => { if (!(v >= lo && v <= hi)) errs.push(`${name}=${v} out of range [${lo},${hi}]`); };

  if (config.configVersion !== CONFIG_VERSION) errs.push(`configVersion mismatch: ${config.configVersion} !== ${CONFIG_VERSION}`);
  if (!['v1', 'v2'].includes(config.sail.aeroTableVersion)) errs.push(`sail.aeroTableVersion must be 'v1' or 'v2', got ${config.sail.aeroTableVersion}`);
  inRange(config.sail.apexAngleDeg, 45, 60, 'sail.apexAngleDeg');
  inRange(config.sail.camber, 0, 0.20, 'sail.camber');
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
