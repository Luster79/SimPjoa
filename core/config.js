// config.js — default CONFIG, CSV loading, Polhamus regeneration cross-check,
// range validation. Pure ESM, no external dependencies, Node >= 18.
//
// Design note on the sail drag model.
// The RUNTIME model is the composite in docs/adr/0007:
//     CD = CD0 + inducedK*CL_working^2 + CDbroadside*sin^4(alpha) + ...
//
// The Polhamus CD helpers below (polhamusCD/polhamusCDv2, with their own
// per-table `s`) are retained for ONE purpose: regenerating the shipped CSVs'
// CD column at startup to verify the files have not been silently edited or
// corrupted. That is an integrity/provenance check on the data files, NOT a
// live code path — aero.js reads only the CL column. See the note at
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
  // Strip whole-line `#` comments before parsing. docs/adr/0009 makes a
  // self-describing header — extraction method, the source's own definitions —
  // mandatory on every digitised file, so a parser that treats the first `#`
  // line as the column header cannot read the files the contract requires.
  text = text.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n');
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
// v2 aero table generator (docs/adr/0003): crab_claw_CL_CD_v2.csv rescales
// the SAME Polhamus functional-form curve (kept for interpolation
// smoothness) to Di Piazza, Pearthree & Paille 2014's measured Santa Cruz
// wind-tunnel anchors (Fig 3) instead of the pure theoretical
// suction-analogy curve, which overshoots CLmax by ~35% (1.88 analytic vs
// ~1.38 measured). Three-parameter fit per apex angle:
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
// The fit is additionally constrained so the curve never exceeds the
// paper's own labelled peak L/D = 0.70/0.13 = 5.38 anywhere.
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

// Cross-check for crab_claw_CL_CD_v2.csv: same integrity purpose as
// crossCheckAeroTable above, but regenerates against the v2 generator
// (polhamusCLv2/polhamusCDv2, AERO_V2_PARAMS) instead of the raw Polhamus
// formula — the v2 table is a measured-anchored RESCALING, not a direct
// Polhamus output, so checking it against the unscaled formula would always
// fail. Same 2% tolerance.
//   NOTE: the CD column checked below is NOT read by any runtime path — the
// runtime builds CD from CD0 + inducedK*CL^2 + CDbroadside*sin^4(alpha)
// (docs/adr/0007). This is therefore an INTEGRITY/PROVENANCE check on the
// shipped CSV (has the file been silently edited or corrupted?), not coverage
// of a live code path. Kept deliberately, and labelled so it cannot be
// mistaken for the latter.
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
  // Two switchable aero tables — v1 (Marchaj/Polhamus theoretical) and v2
  // (Di Piazza 2014 measured-anchored, the default) — see docs/adr/0003.
  // Both are loaded unconditionally (tiny CSVs); the active one is picked by
  // sail.aeroTableVersion and re-derived on every createConfig call (below)
  // so the boat-design tab can switch it at runtime.
  const aeroTableV1 = loadAeroTable('crab_claw_CL_CD_polhamus.csv');
  crossCheckAeroTable(aeroTableV1);
  const aeroTableV2 = loadAeroTable('crab_claw_CL_CD_v2.csv');
  crossCheckAeroTableV2(aeroTableV2);
  const p = loadBoatParamsCSV();
  // Inertia is three separate quantities, each derived. A hull accelerating
  // SIDEWAYS drags a large body of water with it (added mass); pushing it
  // forward barely does. Yaw inertia must exceed a uniform rod's m*L^2/12,
  // since added mass only ever adds. The terms:
  //   added sway mass   ~ rho*pi*draft^2/4 per unit length, x L
  //   added yaw inertia  = that strip mass integrated with x^2
  //   rod term           = m*L^2/12
  //   ama at its spacing = ama.mass * spacing^2
  // Surge added mass for a slender body is small (a few % — it is pushing
  // water aside lengthwise, not broadside); 10% is used. ama.mass is included
  // in the translational masses.
  // Yard inclination from horizontal at full hoist (docs/adr/0019). Needed
  // here first: sail.yardCERadius is derived from it below.
  const YARD_PEAK_ANGLE_DEG = 60;
  // 1.41 m^2 = 5.0 m waterline x 0.282 m draft, DERIVED (docs/adr/0022) rather
  // than scaled. The owner gives the vaka's beam as 50-55 cm. That cannot be
  // the WATERLINE beam: on this hull's own 70deg V section (Flay V2,
  // docs/adr/0004) a 0.50-0.55 m waterline beam implies 265-321 kg of
  // displacement against the published 165. So it is the GUNWALE beam, the
  // hull flares above the water, and the displacement then fixes the draft:
  //   Amid = V / (L*Cp) = 0.161 / (5.0*0.58) = 0.0555 m^2
  //   V section: Amid = T^2 * tan(35deg)  ->  T = 0.282 m
  //   waterline beam = 2*T*tan(35deg) = 0.394 m, i.e. ~8 cm of flare per side
  // Cp 0.55-0.62 spans T = 0.272-0.289, so lateralArea 1.36-1.45; 1.41 is the
  // middle. The previous 1.5 was a length-ratio scaling of an older estimate.
  const HULL_LATERAL_AREA = 1.41;                        // m^2 — see hull.lateralArea below (same value, needed here first)
  const draft = HULL_LATERAL_AREA / p.boat_length_m;    // ~0.327 m
  // kg/m, 2D cylinder analogy, kept at /4 deliberately although the derivable
  // plate value is /2 (docs/adr/0018): the free surface acts as the image
  // plane for a section this plate-like (B/T = 1.4), and Clarke's Y_vdot
  // regression implies ~1010 kg of added sway mass against the 455 carried
  // here. Doubling it REVERSES four of the owner's manual's steering rules —
  // the hull's own destabilising Munk moment grows until it swamps every trim
  // control the manual describes (sheet-trim steering flips to weather at 9 of
  // 16 points, the windward brail flips, and the parked hull pins itself at a
  // fixed crab angle). The manual outranks a ship-hull regression extrapolated
  // to this B/T, so the value stays. Do not raise it in isolation.
  const addedSwayPerLength = 1025 * Math.PI * draft * draft / 4;
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
      windageArea: 1.5,                    // m^2 — BEAM-ON projected area; tunable estimate, same status as lateralArea (scaled by the length ratio squared, ADR 0021)
      windageAreaFrontal: 0.41,            // m^2 — END-ON area (bow, mast section, one crew); windageForce interpolates on sin^2 of the apparent-wind angle (scaled, ADR 0021)
      windageCD: 0.85,
      wettedSurface: 2.5,                  // m^2 — tunable estimate (slender canoe hull; scaled by the length ratio squared, ADR 0021)
      // Cf is not a stored constant — hydro.js computes it per call from the
      // ITTC-57 model-ship line at the instantaneous Reynolds number
      // (u*length/nu).
      // Residuary (wave-making) resistance (docs/adr/0001): a slender
      // L/B~12:1 canoe hull has no displacement-monohull "hull speed" wall at
      // Fr~0.4 (Dierking; Pacific flying proas routinely ran Fr 0.5-1.0).
      // Expressed in the SAME nondimensional form as skin friction (Cr, not a
      // raw N-scaling coefficient) and bounded to the same order as Cf
      // (~0.003) — see hydro.js hullResistance(). A Gaussian hump centred at
      // the main prismatic hump (FrPeak) that rises from ~0 well below it and
      // falls away again at high Fr (semi-planing relief), never growing
      // unbounded.
      residuaryPeakCr: 0.006,             // tunable — Cr at the hump's peak, ~2x Cf (slender-hull order of magnitude, not a monohull's 100x+)
      residuaryFrPeak: 0.5,               // tunable — Fr at which residuary resistance peaks (the main prismatic hump)
      residuaryFrWidth: 0.18,             // tunable — Gaussian width; keeps the hump's rise/fall gentle (naturally ~0 below Fr~0.3, per work order's "~0 below Fr~0.35")
      // Tail plateau past the hump (docs/adr/0006): a pure Gaussian falls
      // back toward 0 for Fr well past FrPeak, which opens a SECOND,
      // unphysically fast speed branch the polar's settle gate can reach.
      // Semi-planing relief past the hump is real, but a slender canoe hull
      // does not shed residuary resistance all the way back to
      // ~friction-only — Dierking's proa speed data tops out well short of
      // that. Holding Cr at this fraction of its peak caps reach speed at
      // TWS6 well under the un-plateaued model's >14.4 kn.
      // The acceptance bar is total resistance genuinely non-decreasing
      // across a fine 3-9 m/s sweep, which first holds at ~0.32; 0.35 clears
      // it with margin.
      residuaryTailPlateau: 0.35,          // tunable — fraction of residuaryPeakCr retained far past FrPeak (smallest value clearing a fine-grained non-decreasing-resistance sweep, 3-9 m/s)
      // hullSideForceCoeff (docs/adr/0004): a direct fit to Flay, Irwin &
      // Viola 2025's towing-tank CS(leeway) for their V2 hull (narrow
      // 70deg-keel Vee, the proa-like case):
      // CS(lambda) = csV2A*lambda + csV2B*lambda^2 (lambda in DEGREES,
      // matching the digitized source's own units), valid 0-16deg. The
      // measured range shows NO saturation — it rises superlinearly, a
      // strengthening vortex-lift mechanism. csBlendStartDeg..csBlendEndDeg (16-24deg)
      // blends toward the V1 hull's (100deg keel, more rounded) own
      // fitted curve — V2 has no data past 16deg, so a naive continuation
      // of its own steeper quadratic would run away; V1's slower,
      // independently-measured growth (tested to 24deg) is a more
      // defensible extrapolation than V2's own unconstrained curve.
      // Beyond csBlendEndDeg (24deg, the edge of ANY measured data): CS
      // holds FLAT (config.js validateConfig doesn't enforce this shape —
      // it's applied in hydro.js hullSideForce) — an explicitly
      // provenance-free extrapolation guard, not a measured claim.
      csV2A: 0.00564, csV2B: 0.00042,     // fit residuals within the digitized +-0.01 uncertainty at all 4 V2 anchors (4/8/12/16deg)
      csV1A: 0.00598, csV1B: 0.00019,     // V1 fit (4/8/16/24deg anchors), used only for the 16-24deg blend target
      csBlendStartDeg: 16,
      csBlendEndDeg: 24,
      // sailingFreeReliefPeak: qualitative reproduction of Flay's Fig 15
      // finding (CR decreases with leeway for V hulls) — see hydro.js
      // hullSideForce's own comment for the full reasoning and the caveat
      // that no quantitative CR-vs-leeway curve exists to fit against
      // (Fig 15 is described qualitatively only). Ramps up 0..8deg, flat at
      // full relief across 8-12deg (matching the harness's own direct
      // assertion window), fades back to 0 by 24deg. The magnitude 1.0 —
      // full induced-drag elimination within the plateau — is sized
      // empirically so total resistance at 8-12deg leeway does not exceed
      // the 0-deg value; it is not a source number.
      sailingFreeReliefPeak: 1.0,
      sailingFreeReliefPlateauStartDeg: 8,
      sailingFreeReliefPlateauEndDeg: 12,
      sailingFreeReliefFadeEndDeg: 24,
      lowSpeedSideDamping: 100,            // tunable — N per (m/s) of sway speed; linear-regime side resistance that keeps a near-stalled boat from drifting freely at very low absolute speed, independent of the (now measured) CS curve's own shape
      crossFlowDragCoeff: 1.1,             // bluff-body cross-flow (broadside) drag coefficient on the lateral plane; past stall the hull is dragged side-on and meets huge resistance, which is what stops a spurious "sails sideways" state — see hydro.js hullSideForce
      // lateralArea (~Lwl*draft): dual-use — the cross-flow bluff-body term
      // above AND the hullSideForceCoeff CS(leeway) term (hydro.js) both
      // reference this same projected-side-area estimate. Flay's own CS is referenced to
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
      // NOTE: yaw damping has NO configured coefficient. core/hydro.js's
      // hullSideForce() integrates it over stations that each see v + r*x,
      // through the SAME measured CS(leeway) curve the side force uses
      // (docs/adr/0004, 0017), so the sway and yaw halves cannot disagree
      // about the flow and the v-r cross term is captured rather than
      // dropped. Both terms fall out of the integration and neither is
      // estimated. Do not reintroduce a standalone N_r/N_rr pair — it would
      // double-count.
      clrXFraction: 0.05,                 // tunable — center-of-lateral-resistance offset from CG (aft), fraction of half-length
      // clrDepth: depth of the centre of lateral resistance below the
      // waterline. The sail's side force and the hull's hydrodynamic
      // reaction form a COUPLE, so the heeling arm is CEheight + clrDepth,
      // not CEheight alone. A band estimate like lateralArea (no direct
      // measurement of this hull): the lateral plane over the waterline
      // length implies the mean draft, and the centroid of that plane sits
      // near mid-draft.
      clrDepth: 0.30,                     // m — tracks the lateral plane it is the centroid depth of; follows the derived 0.282 m draft (ADR 0022)
      // crewForeAftTrimCoeff ("k_trim"): fraction of half-length the CLR shifts
      // per unit crewPosX. A tunable estimate — there is no pitch DOF behind
      // it, so this is the model's whole statement of fore-aft crew trim. At
      // 0.25 a full aft trim moves the CLR 0.625 m, i.e. an eighth of the
      // waterline, which is the upper end of what a crew shifting weight in a
      // 5 m canoe can plausibly do to the immersed lateral plane. Do not raise
      // it further without a real pitch model to justify it.
      crewForeAftTrimCoeff: 0.25,
      crewTrimSign: 1,                     // +-1 — flips the crewPosX->CLR-shift direction; verified empirically (forward crew -> luff)
      // heelClrShiftCoeff / heelClrSign (T3, docs/work-order-2026-08-05-
      // sterownosc.md): the hull's own half of the heel-to-yaw coupling — see
      // hydro.js's stationWeights for the mechanism (a heeled V-hull's
      // lateral-plane distribution shifts fore-aft, the standard simplified
      // treatment of real "heel moves the CLR" hull asymmetry).
      //
      // BUILT AND MEASURED. TRIED AND SET ASIDE — see yawHeelSign's own
      // comment below for the matrix. SET TO 0: at the coefficient tested
      // (0.15, the same order as crewForeAftTrimCoeff), no sign of this term,
      // paired with any sign of yawHeelSign, completes the cancelling pair the
      // two comments describe. The mechanism is present and testable, not
      // deleted, in case a different magnitude or a better-founded shape ever
      // changes this finding — but it does not default active on a negative
      // result, the same discipline yawHeelSign itself was held to.
      heelClrShiftCoeff: 0.15,
      heelClrSign: 0,
      // yawHeelSign: scales AND signs the heel->yaw coupling (aero.js
      // yawMomentHeel). SET TO 0 — the term is DISABLED, and that needs its
      // own justification because it is not a claim that the physics is zero.
      //
      // The term models one half of a cancelling pair. Heeling swings the
      // rig's CE to leeward by CEheight*sin(phi), which is what this computes;
      // it also makes the immersed HULL asymmetric, which produces an opposing
      // yaw moment and is the dominant real-world heel-to-yaw mechanism. The
      // model has the rig half and not the hull half. **A partial model of a
      // cancelling pair has an essentially arbitrary sign.**
      //
      // T3 (docs/work-order-2026-08-05-sterownosc.md) BUILT the missing hull
      // half — hydro.js's stationWeights, driven by hull.heelClrShiftCoeff/
      // heelClrSign — and re-ran the SAME matrix at all four sign
      // combinations of (heelClrSign, yawHeelSign), against the CURRENT
      // acceptance grid (crewPos/crewPosX/tackX/stays/boomLift all live since
      // this comment was first written):
      //
      //   (heelClrSign,yawHeelSign)   AC-1.1   AC-1.2   AC-4.2a         AC-4.2b
      //   (0,0)      baseline          6/6      6/6    4/6 (dir 6/6)    4/6
      //   (+1,+1)                      3/6      2/6    4/6 (dir 6/6)    4/6
      //   (+1,-1)                      6/6      6/6    4/6 (dir 5/6)    4/6
      //   (-1,+1)                      3/6      4/6    4/6 (dir 6/6)    4/6
      //   (-1,-1)                      6/6      6/6    4/6 (dir 5/6)    4/6
      //
      // NO combination improves AC-4.2a/b at all (stuck at 4/6 throughout —
      // this term cannot reach them, since it only acts through the leeway-
      // driven side force, while AC-4.2's own gap is elsewhere). The two
      // combinations that avoid REGRESSING AC-1.1/1.2 ((+1,-1) and (-1,-1))
      // are net NEUTRAL at best, and slightly worsen AC-4.2a's own direction-
      // correctness (5/6 vs 6/6). (+1,+1) and (-1,+1) actively break AC-1.1/
      // 1.2 from PASS to PARTIAL. This is the SAME finding the original
      // measurement below made about the rig-only term, now confirmed for the
      // rig+hull pair together: a structurally different mechanism (this
      // one only fires through existing leeway, the rig's term is a
      // standalone r x F active at any Fx) does not, in fact, cancel it.
      // Both terms stay at 0. See heelClrShiftCoeff's own comment.
      //
      // Original measurement (rig term alone), for reference — with both of
      // the manual's own named mechanisms present (ama residuary drag for
      // crew position, ceBrailXShift for the brail — docs/adr/0015):
      //
      //   criterion                              +1     0     -1
      //   AC-1.1 crew to ama -> points up       2/6   5/6   5/6
      //   AC-1.2 crew to hull -> bears away     1/6   4/6   4/6
      //   AC-4.2a breaking brail -> bears away  6/6   6/6   1/6
      //   AC-4.2b ... and grows with the pull   5/6   6/6   0/6
      //
      // At +1 and -1 this term DOMINATES both groups and forces them to share
      // a direction, so no sign satisfies the source. At 0 each of the two
      // mechanisms the manual names governs its own criterion, which is what
      // the source describes. Including half of an opposing pair is worse than
      // including neither.
      yawHeelSign: 0,
      ceLeverSign: 1,                     // +-1 (aero.js xCE/yCE yaw-lever sign) — CURRENTLY THE IDENTITY, not an active flip: at the present `lead` the naive, unflipped r x F derivation matches the boat's real steering direction on its own
      // lead: the classical yacht-design "lead" — the CE-CLR longitudinal
      // separation — of order 5-25% of waterline length depending on hull and
      // rig type (Larsson & Eliasson, Principles of Yacht Design). A per-boat
      // parameter and an ESTIMATE; revisit if a specific hull's real lead is
      // ever measured.
      //
      // WHY THE VALUE MATTERS LESS THAN IT LOOKS. Sensitivity here is
      // pathological: the rudder-free helm balance flips sign from weather to
      // lee between 0.065*L and 0.070*L, a 2.7 cm window, against a
      // trim-driven modulation ten times larger. Calibrating a boat onto that
      // knife edge produces fragility, not accuracy.
      //
      // The structural answer is docs/adr/0011's movable tack: a real proa is
      // steered by moving the CE against the CLR — Proafile, "traditional
      // proas are steered on all reaching and windward courses with no
      // rudder, paddle, or steering oar at all... by adjusting the relative
      // fore and aft positions of the sail centre of effort and the hull
      // centre of lateral resistance". So `lead` is only the value at
      // tackX = 0. It does not have to be RIGHT, because the boat can trim
      // out whatever bias it leaves (see the S2 course-hold check in
      // harness/asserts.js).
      //
      // DO NOT re-pick this value to make a rudder-free balance assertion
      // pass. S1a/S1b are xfail with their measured numbers on purpose: the
      // hull has little directional stability of its own for `lead` to
      // balance against, and searching the knife-edge window again would only
      // re-create the same fragility.
      lead: 0.06 * p.boat_length_m,
    },

    ama: {
      length: p.ama_length_m,             // 3.5 m
      maxBuoyancy: p.ama_buoyancy_kg,      // 80 kg
      mass: p.ama_mass_kg,                 // 25 kg — resists lifting when windward (normal case)
      spacing: p.beam_overall_m,           // 2.5 m (hull-ama spacing, "B")
      wettedSurface: 0.5,                  // m^2 — tunable estimate, fully immersed (scaled by the length ratio squared, ADR 0021)
      // residuaryPeakCr (docs/adr/0015): the ama's wave-making resistance —
      // see core/hydro.js's amaDrag for why this, and not the form factor, is
      // the honest home for the ama's steering authority. Set EQUAL to the
      // hull's 0.006: same phenomenon, same slender-body order of magnitude,
      // and the ama is the stubbier body of the two (formFactor 1.2 vs the
      // hull's fine entry), so equal is the conservative choice rather than a
      // flattering one. The Fr hump shape (peak, width, tail plateau) is
      // shared with the hull outright.
      residuaryPeakCr: 0.006,
      // formFactor: the ama is a slender float trailing fore-aft through the
      // water like a second, smaller hull — NOT a bluff cross-flow body — so
      // its drag is ITTC-57 skin friction at its own length/Reynolds number
      // (hydro.js's shared ittc57Cf), same as the main hull, times this
      // (1+k)-style form factor. 1.2 is mid-range for ITTC/Prohaska (normally
      // 1.1-1.4 for a slender body).
      //   DO NOT raise this to buy steering authority. Values of 2-3x the
      // physical range have been used that way; real proa steering is
      // dominated by the sail CE / hull CLR balance and the steering oar, not
      // by outrigger drag, and the ama's genuine missing resistance is the
      // residuary term above. The drag-ratio anchors in harness/asserts.js
      // bound this.
      formFactor: 1.2,
      // NOTE: there is no crew-immersion coefficient. The crew's effect on
      // ama immersion is DERIVED in hydro.js from the real buoyancy balance
      // (crewPos*crew.mass vs ama.maxBuoyancy) rather than scaled by a
      // tunable.
    },

    sail: {
      area: p.sail_area_m2,                // 12 m^2
      apexAngleDeg: p.sail_apex_angle_deg,  // 50 deg (45-60 valid range)
      CEheight: p.CE_height_m,              // 2.0 m — NOMINAL: the CE height at
      // full hoist and an upright mast. aero.js derives the EFFECTIVE height
      // from the halyard and shroud controls below; this stays the sail's own
      // size reference (the streamwise chord, which does not change when the
      // sail is hoisted higher).
      //
      // --- Vertical rig geometry (docs/adr/0019, 0020) ---
      // The manual's own control list (AC-6.3) names the halyard ("fal") and
      // the shroud ("wanta") alongside the sheet and the two brails, and three
      // of its techniques work through nothing else: AC-4.4 (mast stood
      // upright reinforces the carrot), AC-5.1a (halyard hauled to the
      // masthead cuts weather helm) and AC-5.1b (shroud tightened cuts weather
      // helm). With CEheight a constant the model can answer none of them.
      //
      // The controls default to the normal sailing state (hauled and tight),
      // at which every term below is exactly zero — so hull.lead,
      // ceSwingFraction and clrXFraction are anchored against plain upright
      // geometry and are not retuned by it.
      yardPeakAngleDeg: YARD_PEAK_ANGLE_DEG, // yard inclination from horizontal at full hoist; Oceanic lateen practice
      halyardDropDeg: 20,                  // how far the yard falls when the halyard is fully eased
      mastRakeMaxDeg: 12,                  // LATERAL mast lean from vertical with the shroud fully slack
      // Fore-aft rake, its own rigging (docs/adr/0020). The PJOA FOLK plan
      // sheet "Rigging - 8 sketches" draws the shroud (1) as a single line to
      // the AMA and the stays (2) as a fore-and-aft pair to eyebolts at both
      // gunwales, with their own tensioner (2a) — two lines, adjusted
      // separately. Keeping them separate is what lets the mast rake FORWARD,
      // the classical cure for weather helm and a control the boat has.
      stayRakeMaxDeg: 12,                  // fore-aft lean at full stay travel, EACH WAY from upright
      // Derived, not chosen: the distance from the tack to the sail's CE along
      // the yard is whatever puts the CE at CEheight when the yard is at its
      // full-hoist angle. That is what keeps the default state identical.
      yardCERadius: p.CE_height_m / Math.sin(YARD_PEAK_ANGLE_DEG * Math.PI / 180),
      // --- Boom lift (T1, docs/work-order-2026-08-05-sterownosc.md) --------
      // controls.boomLift's sheet-coupled ceiling (core/sheet.js's
      // effectiveBoomLiftMax) and its two effects on the CE. Both bands and
      // both gains are ESTIMATES: the manual states the mechanism and its
      // direction, not a curve, and this is a brand-new control the model
      // did not have before, with nothing yet measured against it the way
      // ceBrailXShift or yceBrailShift were.
      boomLiftMinSheetDeg: 30,             // sheet angle below which the boom cannot rise at all
      boomLiftFullSheetDeg: 70,            // sheet angle at/above which boomLift can reach its full effect
      // boomLiftCEHeightFrac: fraction of CEheight the CE rises by at full
      // effective boom lift — hauling the boom up toward the yard shortens
      // the leech's vertical droop. Order-of-magnitude, geometrically
      // reasoned (a meaningful rise, not a doubling), same status as
      // yceBrailShift when it was first introduced.
      boomLiftCEHeightFrac: 0.15,
      // boomLiftYceShrink: ADDITIONAL fraction the lateral CE offset (yCE)
      // shrinks by at full effective boom lift, on top of whatever
      // yceBrailShift already removed — a genuinely separate gathering
      // mechanism (toward the yard from below, not toward the tack from the
      // leech). ceRadiusEff's own base length (docs/adr/0024) comes from the
      // FULL triangle's tack-to-centroid distance; hauling the boom's foot up
      // toward the yard collapses that triangle toward something closer to a
      // line along the yard alone, which argues for a real, fairly large
      // fraction here, not a token one.
      //   MEASURED SENSITIVITY (T1): at brailWind=1/stays=1 (the manual's full
      // deep-course recipe), pushing this from 0.3 to 0.9 to 0.99 moves TWA160
      // drift 26.4 -> 18.3 -> 16.1 deg/min and TWA175 33.4 -> 15.2 -> 0.8 --
      // real, correctly-directed, but even at 0.99 (yCE nearly zeroed, not a
      // defensible physical value) TWA160 still does not clear the 15deg/min
      // ceiling. boomLiftCEHeightFrac's own contribution to this moment is
      // negligible by comparison (swept 0.15-0.5, TWA160 moves only
      // 26.4->25.7). This mechanism measurably helps and is not enough by
      // itself; see docs/work-order-2026-08-05-sterownosc.md's T1 entry and
      // C-C's own comment in harness/asserts.js. NOT tuned to the extreme
      // that nearly passes -- 0.5 is the geometric argument above, not a
      // number chosen to move the tally.
      boomLiftYceShrink: 0.5,
      // boomLiftCamberGain: the "belly" the manual names ("żagiel bardzo się
      // wydął") is wired into the SAME camberCLDelta machinery brailCamberGain
      // uses, not a new curve — but is left at 0 rather than given a number.
      // brailCamberGain (0.10) plus the v2 table's own built-in camber (0.10)
      // already sit exactly at validateConfig's 0.20 total-camber ceiling
      // (the linear 1+1.75c fit's own validity limit), and the two gains are
      // not mutually exclusive at runtime (brailWind and boomLift/sheet are
      // independent controls), so there is no headroom for a third additive
      // term without either lowering brailCamberGain (an already-measured
      // value) or loosening the ceiling itself. The machinery is wired up and
      // the config total-camber check already accounts for this field, so
      // enabling it later needs only a value and a measurement pass, not a
      // structural change. Same status as sail.verticalLiftFraction: mechanism
      // present, deliberately inactive.
      boomLiftCamberGain: 0,
      // ceBrailXShift (docs/adr/0015): metres the CE moves FORWARD at full
      // windward brail, as its own mechanism rather than as a modulation of
      // the trim swing. See core/aero.js for why it has to be its own term.
      //
      // Expressed in the same scaled chord the rest of the CE machinery uses
      // (chord = CEheight/2), NOT in the rig's real streamwise extent, so it
      // stays consistent with ceSwingFraction and halfChord. chord/3 is the
      // centroid shift from spilling the REAR HALF of the chord, which is what
      // the manual describes at a full pull: "pull this brailing line ...
      // unless it deform the sailcloth and continue to make rear part of the
      // sail, breaking over to lee".
      //
      // Sensitivity checked rather than assumed: the brail acceptance criteria
      // reach 6/6 anywhere from 0.3 to 0.8 and collapse below ~0.25, so any
      // value in that band sits on a plateau rather than on a peak.
      //   NOTE ON ITS REACH: this term enters the yaw moment as xCE*Fy, so its
      // authority scales with the sail's SIDE force. That force collapses on
      // deep courses (Fy is -24 N at TWA140 and -3 N at TWA160, against -185 N
      // close-hauled), so raising this does essentially nothing downwind — the
      // brail's deep-course authority is the LATERAL arm instead, yceBrailShift
      // below. Do not reach for this knob to fix a downwind problem.
      ceBrailXShift: 0.5,
      // tackTravel: half-range, in metres, of the tack's fore-aft travel —
      // controls.tackX = +-1 maps to +-this. An estimate, and unlike
      // `hull.lead` an untroubling one, because the response to it is monotone
      // and smooth over the whole range rather than a sign flip inside a
      // 2.7 cm window. The helm's zero crossing sits within 0.3 m of neutral
      // at every one of TWA 70/90/110 x TWS 6/10, so even half this travel
      // covers it at every operating point. The exact value therefore decides
      // how much authority is left BEYOND neutral, not whether neutral is
      // reachable — which is the property that matters and the robust one.
      //
      // 0.8 m is 16% of LWL. It is bounded above by the sail staying set as
      // the tack moves and by the hull's own length; a specific boat's real
      // tack-line travel would belong in example_proa_parameters.csv.
      //
      // WHERE IT DOES AND DOES NOT HELP: this is a fore-aft arm, so it acts
      // through xCE*Fy and its authority follows the sail's SIDE force.
      // Measured, per +0.3 m of travel at tackX=+1: -56 N*m at TWA70, -7 N*m
      // at TWA140, -1 N*m at TWA160. It is a close-hauled and reaching
      // control. Growing it to buy DOWNWIND course holding does not work, and
      // the moment it does add on deep courses has the round-up sign.
      tackTravel: 0.8,
      // deltaMinDeg (docs/adr/0010): the closest the SHEET can hold the yard
      // to the centreline. A rig cannot be strapped flat just because the
      // optimizer would like it to be: on an Oceanic lateen the tack is at the
      // bow and the boom runs aft, so the sheet has to reach the clew from a
      // point on the hull. Derived, not chosen — example_proa_parameters.csv
      // fixes all three inputs:
      //   spar length from the sail's own area and apex angle, treating the
      //   sail as the triangle the aero table already models it as:
      //     A = 0.5*L^2*sin(apex)  ->  L = sqrt(2A/sin(apex))
      //   the clew must come within reach of the sternmost sheeting point,
      //   a distance hull.length from the tack:
      //     L*cos(deltaMin) <= hull.length  ->  deltaMin = acos(L_hull/L)
      // A boom shorter than the hull imposes nothing and the expression
      // correctly returns 0, which is the case on the current boat.
      //
      // ILL-CONDITIONED, and deliberately left as an expression rather than
      // rounded into a tidy literal: when the spar and the hull are within a
      // few percent of each other, acos() is evaluated where its slope is
      // steepest, so a small change in sail area swings the result by many
      // degrees. The VALUE is therefore a weak claim about any particular
      // boat, even though the CONSTRAINT is a solid claim about the rig type.
      // Do not tune it — measure what it costs and report that. A real
      // measured sheeting geometry belongs in example_proa_parameters.csv as
      // its own parameter, which would retire this derivation rather than
      // re-fit it.
      deltaMinDeg: (() => {
        const sparLength = Math.sqrt(2 * p.sail_area_m2 / Math.sin(p.sail_apex_angle_deg * Math.PI / 180));
        if (sparLength <= p.boat_length_m) return 0;
        return Math.acos(p.boat_length_m / sparLength) * 180 / Math.PI;
      })(),
      // camber: a DELTA beyond the active table's own built-in camber
      // (aeroV2BuiltinCamber for v2, 0 for v1 — a genuinely flat theoretical
      // table), not an absolute ratio applied on top of a flat plate. See
      // aero.js's camberCLDelta for the double-counting that distinction
      // avoids. It is 0 here because the Di Piazza Santa Cruz curve is a
      // MEASURED sail's actual CL and already carries that sail's real
      // camber, so on v2 there is nothing to add. Only re-enable a nonzero
      // value with a table that is genuinely flat.
      //   NOTE: aero.js never reads the aeroTable's own CD column, only CL —
      // CD is rebuilt at runtime from the CD model below. Switching the CL
      // table therefore does NOTHING to drag unless those constants are
      // switched to the same fit as well.
      camber: 0,
      // aeroV2BuiltinCamber: the v2 table's own built-in camber ratio, "1:10"
      // (Di Piazza's Santa Cruz sail — a real rigid crab claw, not a flat
      // theoretical plate). An order-of-magnitude literature figure for that
      // class of sail, not independently re-measured from the digitized curve.
      // Only read when sail.aeroTableVersion is 'v2' (aero.js); v1 uses 0
      // unconditionally.
      aeroV2BuiltinCamber: 0.10,
      // --- CD model (docs/adr/0007) ---------------------------------------
      // CD = CD0 + inducedK*CL_working^2 + CDbroadside*sin^4(alpha)
      //      + brailParasiticCD*max(brails) + flogging
      // Least-squares fit to Di Piazza's four measured Santa Cruz (CL,CD)
      // pairs PLUS their reported L/D_max ~5.4 as a fifth constraint — the
      // four pairs alone leave alpha<20deg unconstrained and let the fit run
      // peak L/D to 7.6. Residuals vs the four pairs:
      // +0.029/+0.036/-0.021/+0.010, inside the +-0.05 digitisation
      // uncertainty the source CSV states.
      CD0: 0.0375,
      inducedK: 0.215,                         // induced-drag coefficient on the WORKING CL^2
      CDbroadside: 1.06,                       // CD at alpha=90 (flat-plate/separated limit); with sin^4 it is negligible at the low-alpha calibration point
      brailParasiticCD: 0.06,                  // extra parasitic drag from gathered/flogging cloth, scaled by max(brailLee, brailWind) — an ADDITION, not a multiplier that cuts drag
      // --- Effective area under brail --------------------------------------
      // A brail gathers cloth: the working area shrinks. Deliberately
      // aggressive — a full TRIM-regime carrot keeps 55% of the area, so
      // reefing genuinely depowers instead of adding force. The survival
      // endpoint (0.20) lands near a CL x0.2 cut at brailWind=1, which is
      // where the panic / stop / squall scenarios are calibrated.
      areaAtTrimBrail: 0.55,                   // areaFactor at brailWind = brailTrimRange
      areaAtFullBrail: 0.20,                   // areaFactor at brailWind = 1
      areaAtFullLeeBrail: 0.35,                // areaFactor at brailLee = 1 (linear in brailLee)
      // --- Sheet constraint -------------------------------------------------
      yardSwingRateDegPerSec: 90,             // tunable — max slew rate for state.delta relaxing toward its equilibrium; a swinging yard, not a teleport (60-120deg/s band)
      deltaMaxReleaseDeg: 90,                 // the sheet limit is released to this during a shunt's ease/transfer/swap phases, then closes back to the commanded controls.sheet once 'sheet' starts hauling it in
      floggingCDFactor: 0.15,                 // tunable — extra parasite drag while luffing (delta held below the sheet limit by the wind, not by the sheet), as a fraction of CD0; 0.1-0.2 band
      // --- CE geometry ------------------------------------------------------
      // tackXFraction is UI-RENDERING-ONLY: ui/app.js draws the mast/tack at
      // this fraction of hull half-length. aero.js's yaw-moment CE geometry
      // does not read it — see hull.lead above and ceSwingFraction below.
      tackXFraction: 0.06,                    // fraction of hull half-length — mast/tack position, active-bow side of CG (UI drawing only)
      // ceRadius (docs/adr/0024) -- DERIVED distance from the tack to the
      // sail's own area centroid, along the bisector of the two spars:
      //   spar   = sqrt(2*A/sin(apex))
      //   rC     = 2*spar*cos(apex/2)/3        (centroid of a triangle with
      //                                         two equal sides from the tack)
      // This is the base length for the LATERAL CE offset ONLY. It is a
      // geometric fact about where the sail hangs, not a centre-of-pressure
      // migration, which is why it must not share the fore-aft swing's
      // half-chord: the two differ by an order of magnitude (2.76 m against
      // 0.25 m on this boat).
      ceRadius: 2 * Math.sqrt(2 * p.sail_area_m2 / Math.sin(p.sail_apex_angle_deg * Math.PI / 180))
        * Math.cos(p.sail_apex_angle_deg * Math.PI / 360) / 3,
      // yceFraction: how far along that tack->centroid line the lateral centre
      // of pressure actually sits. 1.0 is the area centroid; a vortex-lift
      // sail's CP sits closer to the leading edge, and this is where that
      // belongs -- NOT in the base length, which is geometry. See docs/adr/0024
      // for the measurement that set it.
      yceFraction: 0.35,
      ceBrailShift: 0.3,                      // tunable — fraction of the half-chord the CE shifts toward the tack at brailWind=1 (spilling the sail's rear/upper area); ~0.25-0.35 band
      // yceBrailShift: SEPARATE from ceBrailShift above, and deliberately
      // stronger. Gathering the sail's rear/upper area toward the yard's pivot
      // pulls the pressure centroid inboard and up on BOTH axes, but it is
      // specifically the lateral (yCE) collapse that attacks the deep-course
      // luffing/yaw moment (-yCE*Fx in aero.js's yawMoment), which is the
      // mechanism the manual's downwind "carrot" technique relies on.
      //
      // DERIVED (T2, docs/work-order-2026-08-05-sterownosc.md), not hand-set.
      // F4 already treats the brail as acting through AREA: at brailWind=1 the
      // working area falls to areaAtFullBrail (0.20) of the full sail. Under a
      // self-similar-shrink assumption -- the gathered working area is
      // geometrically similar to the full sail, not an odd-shaped remainder --
      // its LINEAR dimensions, including the tack-to-centroid distance
      // ceRadiusEff is built from, scale as sqrt(area fraction). So the
      // fraction REMOVED is 1 - sqrt(areaAtFullBrail):
      //   1 - sqrt(0.20) = 0.553
      // (kept as the literal 0.20 here rather than a live reference to
      // areaAtFullBrail above, since JS object literals cannot reference
      // sibling properties -- if areaAtFullBrail is ever retuned, re-derive
      // this alongside it).
      //   MEASURED SENSITIVITY (T2), full deep-course recipe, boomLift=0 to
      // isolate this term alone: 0.0 -> 0.3 -> 0.553 -> 0.9 moves TWA140 drift
      // 21.6 -> 15.3 -> 8.5 -> -8.6 deg/min and TWA160 34.3 -> 32.7 -> 29.9 ->
      // 21.2. The derived value (8.5) is slightly WORSE for C-C's own tally
      // than the previous hand-set 0.6 (6.8) -- evidence this was derived, not
      // picked to pass. Kept < 1 so halfChordEffY never reverses sign.
      yceBrailShift: 1 - Math.sqrt(0.20),
      // brailTrimRange: the split point between the windward brail's two real
      // roles per the manual — TRIM (partial pull: deepens the belly, shifts
      // the CE toward the tack, sail keeps drawing) and SURVIVAL (pull past
      // this point: spills power, panic/furl territory). Below this fraction
      // of brailWind, aero.js's brailRegimeBlend() applies only the mild
      // TRIM-regime cuts; above it, cuts ramp to the strong SURVIVAL values
      // the panic and stop/squall scenarios are calibrated against. Not
      // independently measured, same status as ceBrailShift/ceSwingFraction.
      brailTrimRange: 0.6,
      // brailCamberGain: the manual's TRIM-regime technique deepens the
      // sail's belly under partial windward-brail pull — gathering the leech
      // does not just spill area, it also bags the remaining draft. Reuses the
      // camber->CL machinery (aero.js's camberCLDelta) rather than a new
      // curve. Peaks at brailTrimRange via brailRegimeBlend, fading back to 0
      // by brailWind=1, since a fully spilled SURVIVAL-regime sail is
      // gathered, not bagged. Read as a DELTA beyond the table's own built-in
      // camber.
      //   The magnitude is bounded by validity, not by taste: camber + gain +
      // built-in must stay inside the c ~ 0.05-0.15 band the linear 1+1.75c
      // fit is valid over, and validateConfig enforces a 0.20 ceiling on that
      // sum. 0.10 sits at the ceiling and still gives a real TRIM-regime bonus
      // (CL x1.15 at low alpha). The area model carries the brail's force
      // change; this term carries only the BAGGING effect.
      brailCamberGain: 0.10,
      // ceSwingFraction: the yard's swing (delta) moves the CE fore-aft and
      // athwartship — a real crab claw's CE genuinely shifts with trim, which
      // is the whole mechanism by which trimming steers — but only a FRACTION
      // of the full geometric half-chord excursion should reach it: a
      // flow-attached aerodynamic centre tracks closer to the leading edge
      // across the practical trim range than the raw geometric midchord.
      // Letting the full excursion through makes the boat far more
      // trim-responsive than the owner's field datum for a real Pjoa.
      //   Sensitivity: at 0.5 the "Sail steers" probe drifts 2.3deg and passes
      // steeringOk's floor; at 0.2 it drifts 0.17deg, which is noise.
      ceSwingFraction: 0.5,
      // verticalLiftFraction: fraction of the sail's force treated as vertical
      // (upward) lift on a normally-trimmed crab claw, unloading the heel arm
      // for the same drive — see aero.js's heelMoment comment for the
      // Marchaj-vs-Di-Piazza tension over whether the effect is large or
      // modest.
      //   DEFAULTED TO 0: mechanism present, inactive. The capsize-safety
      // scenarios sit on a genuine knife edge at this operating point — even
      // 0.01 flips the held-sheet gust test from a clean capsize (maxPhi
      // 65deg) to none (34deg) — so there is no nonzero value that both
      // matches the literature's ~0.15-0.25 intent and preserves those
      // scenarios' validated margins. Enabling it requires re-deriving the
      // gust/trim severity of the capsize scenarios first. Deferred, not
      // abandoned.
      verticalLiftFraction: 0,
      // aeroTableVersion (docs/adr/0003): 'v2' (default) = Di Piazza 2014
      // measured-anchored table; 'v1' = the Marchaj/Polhamus theoretical one.
      // Kept switchable rather than migrated one-way, so Marchaj-vs-Di-Piazza
      // stays a live comparison. createConfig() re-derives `aeroTable` from
      // this field on every call, so the boat-design tab can switch it at
      // runtime.
      aeroTableVersion: 'v2',
    },

    crew: (() => {
      const CREW_MASS_KG = 90;
      return {
        mass: CREW_MASS_KG,
        posMin: -0.3,
        // posMax (T6, docs/work-order-2026-08-05-sterownosc.md): hydro.js's
        // amaDrag derives crewOnAma = crewPos*crew.mass/ama.maxBuoyancy, and
        // says outright that crewPos above ama.maxBuoyancy/crew.mass asks for
        // more than the float can carry, so it goes under. That ratio is
        // 60/90 = 0.667 here (it was 0.889 before docs/adr/0021's
        // re-parameterisation), so 1.0 lets the UI select a crew position
        // that sinks the ama outright rather than merely loading it hard.
        // Capped at the physical ratio; validateConfig re-checks this
        // against whatever ama.maxBuoyancy/crew.mass a config patch ends up
        // with, so a future boat swap cannot silently reopen the gap.
        posMax: Math.min(1.0, p.ama_buoyancy_kg / CREW_MASS_KG),
        posXMin: -1.0,            // fore-aft crew position range
        posXMax: 1.0,
      };
    })(),

    stability: {
      abackCapsizeTime: 6,       // s — sustained full submersion before capsize
      amaLoadDisplayCap: 3.0,    // UI-safe ceiling for amaLoad readouts; the raw value stays unclamped for the aback timer and the flying-ama warning
      // --- Roll calibration -------------------------------------------------
      // I_roll and rollDampingCoeff are TUNED AS A PAIR against a target roll
      // response, not derived from a mass distribution: an 8deg step should
      // give a period inside 1.5-4 s and settle (|phi|<0.4deg) within 2-4
      // oscillation periods.
      //
      // RE-MEASURED (T5, docs/work-order-2026-08-05-sterownosc.md) at the
      // current (docs/adr/0021) stiffness, since these two predate that
      // re-parameterisation: an 8deg step-response probe gives a 3.00 s
      // period (target 1.5-4 s) settling in 2.29 oscillation periods (target
      // 2-4). Both bands are still satisfied and this pair is NOT changed.
      //   A separate, softer target existed alongside the band -- a damping
      // ratio zeta~0.19, an "opportunistic" bump from an earlier round, not
      // itself an acceptance criterion. Chasing it directly (raising
      // rollDampingCoeff to ~1595, the value a LINEARISED zeta=0.19 implies
      // at this stiffness) was tried and MEASURED to push settling to 1.41
      // periods -- outside the 2-4 band. The mismatch is the nonlinear
      // restoring curve (rollRestoreMoment's ease-out near phi=0, softer
      // locally than the linear spring a zeta calculation assumes): a linear
      // damping-ratio target does not transfer cleanly onto this curve. The
      // actually-stated band, not the zeta narrative, is the one that binds.
      I_roll: 1500,
      // phiLiftoffDeg / phiSubmergeDeg are the roll angles at which the ama's
      // weight- and buoyancy-restoring moments saturate — "just clear of the
      // water" and "fully submerged" — and amaLoad reads exactly 1.0 at each.
      // They are free constants, NOT derived from the ama's own geometry and
      // spacing, which is what they physically are.
      //
      // DERIVING THEM WAS ATTEMPTED (T5) AND SET ASIDE. The natural approach
      // -- an ama cross-section shape (radius R from Vmax=ama.maxBuoyancy/
      // rho_w treated as a semicircular hull), then
      // phi=asin(fraction*R/ama.spacing) -- needs a draft R this project has
      // no measurement for: ama_buoyancy_kg is itself "NOT PUBLISHED - scaled
      // by the CUBE of the length ratio" (example_proa_parameters.csv), not a
      // real dimension. Computed anyway, the resulting angles land around
      // 0.4-2deg -- roughly an order of magnitude below the values here --
      // which would compress the whole roll envelope and require re-running
      // every capsize-margin scenario (T6's gust, T10, the aback scenario)
      // against a new operating point, the same "margin sweep run as a
      // precondition" campaign docs/capsize-margins-2026-07-30.md was for.
      // That is real work with its own acceptance criteria, not a T5-sized
      // item, and is not done here on an input this uncertain. What T5 DOES
      // fix is the config-level guard that would have caught the next silent
      // drift: see validateConfig's own check below, which is now geometry-
      // aware even though these two angles themselves are not.
      //   Implied ama vertical travel at the current values, for reference:
      // ama.spacing*sin(12deg) = 0.64 m at liftoff, ama.spacing*sin(10deg) =
      // 0.54 m at submergence -- neither re-examined across docs/adr/0021's
      // 24% growth in ama.spacing (2.5 -> 3.1 m).
      phiLiftoffDeg: 12,          // deg — ama's weight-restoring moment saturates ("ama just clear of the water")
      phiSubmergeDeg: 10,         // deg — ama's buoyancy-restoring moment saturates ("ama fully submerged")
      rollDampingCoeff: 1100,     // N*m per (rad/s), linear — see the I_roll note above; the pair sets the damping ratio
      // phiCapsizeDeg: past this angle (symmetric on both sides) the ama's
      // restoring arm reverses into a genuine capsizing arm — see stability.js
      // rollRestoreMoment. It sits ~35-40deg past liftoff/submergence, and
      // must stay well below the heel at which a flat-forever restoring curve
      // would let the boat find a spurious stable equilibrium.
      phiCapsizeDeg: 50,
      // capsizeTriggerMarginDeg: how far PAST the capsizing-arm reversal the
      // capsize trigger fires. The margin exists so the boat visibly rolls
      // past the point of no return before integrate()'s freeze catches it —
      // freezing exactly AT the reversal would look like the state stopping
      // the instant it goes unstable, not like rolling over. 15deg sits
      // comfortably inside the capped capsizing arm's own span, so the boat is
      // accelerating under a genuine capsizing moment for the whole of it
      // rather than coasting on residual momentum.
      capsizeTriggerMarginDeg: 15,
    },

    rudder: {
      maxDeflectionDeg: 35,
      // area: this is a hand-held Polynesian steering PADDLE, roughly
      // 0.75 x 0.20 m — not a dinghy rudder blade. The distinction is not
      // cosmetic: at 0.4 m^2 the oar produces 2.2 kN at 6 kn, which is 1.2 g
      // laterally on this boat and eight times the sail's own side force.
      area: 0.15,               // m^2 — steering-oar blade (~0.75 x 0.20 m)
      // stallAngleDeg: a low-AR (~1.5) plate separates around 20-25deg; past
      // it core/rudder.js's lift shape falls away instead of climbing to the
      // mechanical limit. Below it the shape is exactly sin(deflection), so
      // ADR 0005's slope derivation applies unmodified.
      stallAngleDeg: 22,
      // Blade drag: CD0 is the thin plate's parasitic drag, inducedK the
      // lift-induced part, so hard steering costs speed and hard-over past
      // stall costs a lot of it.
      // CD0 is referenced to the blade's PLANFORM area: skin friction on both
      // faces (~2*Cf ~ 0.008) plus section/form drag for a plain oar blade.
      // For scale, 0.05 here would make a CENTRED oar 22% of total drag, which
      // is bluff-strut territory, not a blade.
      CD0: 0.02,
      // inducedK ~ 1/(pi*AR*e) with AR~1.5 and e~0.7 gives 0.30; 0.35 keeps a
      // little margin for a square-tipped blade.
      inducedK: 0.35,
      // coeff: DERIVED, not felt (docs/adr/0005). The blade is a low-AR (~1-2)
      // lifting surface, and core/rudder.js's CL = coeff*sin(alpha) stays in
      // the small/moderate-angle range over the whole 35deg mechanical travel,
      // so coeff is matched against the Helmbold low-AR lift-curve SLOPE
      // (2*pi*AR/(2+sqrt(AR^2+4))), not a stall CLmax the model does not
      // represent. AR=1-2 spans 1.48-2.60/rad; the AR=1.5 midpoint gives 2.09.
      // Cross-checked against Hoerner's independently measured CLmax~1.0-1.2
      // for AR~1-2 flat plates at high AoA: CL(35deg) = 2.1*sin(35deg) = 1.20,
      // inside that range.
      //   If steering feels too sharp, that belongs in UI input shaping
      // (ui/app.js), NOT in this coefficient.
      coeff: 2.1,
    },


    // Shunt timing. The literature is unanimous that a proa comes to a
    // genuine stop before shunting, with the crew physically carrying the
    // yard heel from one end to the other — a deliberate human process, not a
    // quick trim. Hence a low speedLockout and a ~16 s total sequence, with
    // transferDuration (carrying the yard) taking the largest share and
    // swapDuration near-instant, since the bow/stern relabel is bookkeeping
    // with no physical action behind it.
    //   speedLockout is bounded BELOW by harness/scenarios.js's
    // scenarioShunt, a structural test of shunt continuity on a steady
    // TWA90/TWS6 beam reach rather than an "ease down to a stop" manoeuvre
    // test: its fixed trim settles to 2.49 m/s by the time it requests its
    // first shunt, so a lower value here would simply never fire that
    // scenario's shunts. Lowering it further means reworking the scenario to
    // ease down first.
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
// Recordings store a raw config snapshot, and `sail.camber` has changed
// meaning: against a flat Polhamus table (v1) it is an ABSOLUTE camber ratio,
// so 0.10 is an ordinary value; on the v2 table — which already carries the
// source sail's own ~0.10 camber — the same field is a DELTA on top of that.
// Replaying an old snapshot verbatim would therefore double-count, and would
// now be rejected outright by the total-camber ceiling in validateConfig,
// making archived recordings unloadable. Normalise instead: on v2, a pre-v2
// snapshot's absolute camber is already represented by the table itself.
//
// crew.posMax has the same problem for the same reason (T6,
// docs/work-order-2026-08-05-sterownosc.md): it used to be a free 0-2 value,
// and is now derived from ama.maxBuoyancy/crew.mass and checked against it.
// A recording made before that derivation existed can carry a posMax that
// exceeds the ratio implied by the CURRENT boat (this fixture's own
// ama.maxBuoyancy=80 predates docs/adr/0021's 60 kg), and would now be
// rejected outright. Cap it forward to whatever the snapshot's own
// ama/crew figures imply, rather than reject the recording.
export function configFromRecordingSnapshot(snapshot) {
  const snap = snapshot ?? {};
  const sail = snap.sail ?? {};
  const usesV2 = (sail.aeroTableVersion ?? 'v2') === 'v2';
  const patch = { ...snap };
  if (usesV2 && (sail.camber ?? 0) > 0) {
    patch.sail = { ...sail, camber: 0 };
  }
  const base = buildDefaultConfig();
  const ama = deepMerge(base.ama, snap.ama);
  const crew = deepMerge(base.crew, snap.crew);
  const physicalPosMax = ama.maxBuoyancy / crew.mass;
  if (crew.posMax > physicalPosMax) {
    patch.crew = { ...patch.crew, ...snap.crew, posMax: physicalPosMax };
  }
  return createConfig(patch);
}

export function validateConfig(config) {
  const errs = [];
  const inRange = (v, lo, hi, name) => { if (!(v >= lo && v <= hi)) errs.push(`${name}=${v} out of range [${lo},${hi}]`); };

  if (config.configVersion !== CONFIG_VERSION) errs.push(`configVersion mismatch: ${config.configVersion} !== ${CONFIG_VERSION}`);
  if (!['v1', 'v2'].includes(config.sail.aeroTableVersion)) errs.push(`sail.aeroTableVersion must be 'v1' or 'v2', got ${config.sail.aeroTableVersion}`);
  inRange(config.sail.apexAngleDeg, 45, 60, 'sail.apexAngleDeg');
  inRange(config.sail.camber, 0, 0.20, 'sail.camber');
  // The TOTAL camber the CL curve is ever evaluated at — the table's own
  // built-in camber plus sail.camber plus the brail's TRIM-regime bagging
  // gain plus boomLift's own gain (T1) — must stay inside the band the
  // linear 1+1.75c fit is valid over. Bounding sail.camber alone leaves
  // brailCamberGain unchecked, which admits c = 0.55: a 55%-of-chord draft,
  // i.e. a half-circle, roughly 4x outside the fit's validity. brailWind and
  // boomLift are independent controls, so their gains' maxima are summed as
  // worst case rather than assumed mutually exclusive.
  {
    const builtin = config.sail.aeroTableVersion === 'v2' ? (config.sail.aeroV2BuiltinCamber ?? 0.10) : 0;
    const totalCamber = config.sail.camber + (config.sail.brailCamberGain ?? 0) + (config.sail.boomLiftCamberGain ?? 0) + builtin;
    if (!(totalCamber <= 0.20)) {
      errs.push(`sail.camber + sail.brailCamberGain + sail.boomLiftCamberGain + built-in table camber = ${totalCamber.toFixed(3)} exceeds the 0.20 physical ceiling`);
    }
  }
  // ceSwingFraction is a fraction of the half-chord, so values outside (0,1]
  // are meaningless and have never been validated by any committed test.
  inRange(config.sail.ceSwingFraction, 0, 1, 'sail.ceSwingFraction');
  // brailTrimRange is the TRIM/SURVIVAL regime split point (aero.js
  // brailRegimeBlend) — must stay strictly inside (0,1), since it is used as
  // a division denominator on both sides of the split.
  inRange(config.sail.brailTrimRange, 0.01, 0.99, 'sail.brailTrimRange');
  inRange(config.crew.posMin, -1, 0, 'crew.posMin');
  inRange(config.crew.posMax, 0, 2, 'crew.posMax');
  // T6 (docs/work-order-2026-08-05-sterownosc.md): crew.posMax must not let
  // the crew ask the ama for more buoyancy than it has — see hydro.js's
  // amaDrag and crew.posMax's own comment above. Re-checked here, not just
  // set correctly by default, so a config patch that changes ama.maxBuoyancy
  // or crew.mass without also lowering posMax fails loudly instead of
  // silently reopening the gap.
  {
    const physicalPosMax = config.ama.maxBuoyancy / config.crew.mass;
    if (!(config.crew.posMax <= physicalPosMax + 1e-9)) {
      errs.push(`crew.posMax=${config.crew.posMax} exceeds ama.maxBuoyancy/crew.mass=${physicalPosMax.toFixed(3)} — this crew position would sink the ama`);
    }
  }
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
  // T5 (docs/work-order-2026-08-05-sterownosc.md): a SANITY band, not a
  // precise derivation — see stability.phiLiftoffDeg's own comment for why a
  // tight geometric bound is not available. Ties phiLiftoffDeg/phiSubmergeDeg
  // to ama.length (a scaled, known quantity) rather than leaving them free of
  // ANY geometric check: the vertical ama travel these angles imply
  // (ama.spacing*sin(angle)) must be more than 1% and less than half of the
  // ama's own length — no real float clears or submerges over a distance
  // outside that range. Wide on purpose, so it catches a gross drift (a
  // spacing typo, or ama.length changing by a large factor with these left
  // untouched, the docs/adr/0021 failure mode) without claiming precision
  // this project's ama dimensions do not support.
  {
    const DEG = Math.PI / 180;
    const travelLiftoff = config.ama.spacing * Math.sin(config.stability.phiLiftoffDeg * DEG);
    const travelSubmerge = config.ama.spacing * Math.sin(config.stability.phiSubmergeDeg * DEG);
    const lo = config.ama.length / 100, hi = config.ama.length / 2;
    if (!(travelLiftoff > lo && travelLiftoff < hi)) {
      errs.push(`stability.phiLiftoffDeg implies ${travelLiftoff.toFixed(2)}m of ama travel, outside the [${lo.toFixed(2)},${hi.toFixed(2)}]m sanity band relative to ama.length`);
    }
    if (!(travelSubmerge > lo && travelSubmerge < hi)) {
      errs.push(`stability.phiSubmergeDeg implies ${travelSubmerge.toFixed(2)}m of ama travel, outside the [${lo.toFixed(2)},${hi.toFixed(2)}]m sanity band relative to ama.length`);
    }
  }
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
  // Re-derive the active aero table from sail.aeroTableVersion on every call.
  // A patch touching only sail.aeroTableVersion (e.g. from the boat-design
  // tab) must not have to carry the whole table object as well, and deepMerge
  // only overlays what a patch actually mentions — so this is the one place
  // that keeps aeroTable in sync with the version flag after any merge.
  merged.aeroTable = merged.sail.aeroTableVersion === 'v1' ? merged.aeroTableV1 : merged.aeroTableV2;
  return validateConfig(merged);
}
