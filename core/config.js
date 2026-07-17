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
// Load + parse the aero table CSV into per-apex arrays
// ---------------------------------------------------------------------
function loadAeroTable() {
  const text = readFileSync(path.join(DATA_DIR, 'crab_claw_CL_CD_polhamus.csv'), 'utf8');
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
  const aeroTable = loadAeroTable();
  crossCheckAeroTable(aeroTable);
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
      froudeThreshold: 0.4,               // wave resistance penalty kicks in above this Fr
      waveResistanceCoeff: 900,           // tunable — scales the u^4 penalty above threshold
      sideForceCoeff: 0.8,                // tunable — low-AR hull-as-foil lift-curve factor (folds in the ama's lateral resistance too, since hydro.js has no separate ama side-force term). Lowered from 2.5 in round 2 (FIX_REQUEST_step1_round2.md R2-1): a boardless canoe hull is a genuinely weak lateral-force generator (that's the prompt's own framing of why a proa needs the ama/crew technique instead of pointing ability) — 2.5 let the hull balance the sail's side force at near-zero leeway once crew ballast dropped amaDrag, letting the boat "point" unrealistically well close-hauled.
      leewaySaturationDeg: 15,            // side force saturates above this leeway angle
      leewayMushingCoeff: 6,              // tunable — post-saturation side-force falloff, per radian of excess leeway (FIX_REQUEST_step1_round2.md R2-1)
      lowSpeedSideDamping: 100,            // tunable — N per (m/s) of sway speed; linear-regime side resistance that keeps a near-stalled boat from drifting freely once sideForceCoeff was tuned low (FIX_REQUEST_step1_round2.md R2-1)
      yawDampingCoeff: 900,               // tunable — N*m per (rad/s), scaled by speed
      clrXFraction: 0.05,                 // tunable — center-of-lateral-resistance offset from CG (aft), fraction of half-length
      crewForeAftTrimCoeff: 0.15,          // tunable ("k_trim") — fraction of half-length the CLR shifts per unit crewPosX (FIX_REQUEST_round4_roll_dof.md 1.5)
      crewTrimSign: 1,                     // +-1 — flips the crewPosX->CLR-shift direction; verified empirically against the 1.6 coupling-sign test (forward crew -> luff), see ARCHITECTURE doc
      yawHeelSign: 1,                      // +-1 — flips the heel->yaw coupling direction (aero.js yawMomentHeel); verified empirically against the 1.6 coupling-sign test (crew toward ama -> bear away), see ARCHITECTURE doc
      ceLeverSign: 1,                     // +-1 (ROUND5_CONSOLIDATED_work_order.md P1.2/T3) — flips the CE-follows-delta yaw lever (aero.js xCE/yCE term) to match the Pjoa manual's field-validated "sheet in bears away, eased luffs" rather than the from-scratch weather/lee-helm derivation, which comes out the opposite polarity
      // lead: round 7, D-6 (ROUND7_DECISION.md). Classical yacht-design
      // "lead" — the CE-CLR longitudinal separation — order 5-25% of
      // waterline length depending on hull/rig type (Larsson & Eliasson,
      // Principles of Yacht Design). 0.15 (15%) is mid-range: replaces
      // round 5's ad-hoc tackXFraction-based CE anchor (aero.js sailForces
      // no longer uses tackXFraction for the yaw-moment geometry — it's
      // still used by ui/app.js for drawing the mast/tack position, kept
      // for that). Per-boat parameter; revisit if a specific hull's real
      // lead is measured.
      lead: 0.15 * p.boat_length_m,
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
      // ARCHITECTURE's calibration section). 3.3 is at the TOP edge of the
      // standard ITTC/Prohaska form-factor range for a stubbier, less
      // finely-shaped hull than the main canoe hull's finer entry (which
      // uses the bare line, factor 1.0) — still in-band on the R7-4a hard
      // anchor (ratio 0.300/0.932 of the [0.10,0.30]/[0.4,1.0] bands), but
      // deliberately chosen at the edge rather than the middle: this is
      // the minimum ama-drag authority that keeps T1's "crew toward ama"
      // steering leg correctly signed (ROUND7_DECISION.md D-1). Revisit
      // this choice if real ama-resistance data ever narrows the band.
      formFactor: 3.3,
      crewImmersionCoeff: 0.30,            // tunable — fraction of crew weight (relative to ama buoyancy) that presses the ama deeper when crewPos>0 (FIX_REQUEST_step1_round2.md R2-1). Raised from 0.21 in round 3 (FIX_REQUEST_round3_worldframe.md R3-2): doubling the ama/crew righting levers to the full spacing (see stability.js) roughly halved amaLoad for a given heel moment, which — via this term's amaLoad-driven immersion floor — quietly cut the ama-drag penalty enough to let the TWA=40 close-hauled polar point creep past the "no meaningful progress below ~50deg" acceptance ratio (0.353 vs the 0.35 limit); this restores the same margin (0.338) without touching the threshold or the hull/yaw tunables the over-sheeting broach-cliff probe depends on.
    },

    sail: {
      area: p.sail_area_m2,                // 12 m^2
      apexAngleDeg: p.sail_apex_angle_deg,  // 50 deg (45-60 valid range)
      CEheight: p.CE_height_m,              // 2.0 m
      // camber/CD0/s: retuned round 7, D-5 (ROUND7_DECISION.md). Removing
      // R7-1's ama-drag bug legitimately raised the whole polar (the boat
      // is genuinely faster with a correctly-small ama brake) — TWA-40's
      // margin and TWA-90's speed moved past their acceptance bands as a
      // direct, expected consequence (not a new bug). Retuned within
      // literature-plausible sail-side ranges: camber down to its floor
      // (0, flatter/higher-pointing shape, still in the documented
      // 0-0.20 range), s up to its physical ceiling (1.0 = full leading-
      // edge suction loss, the same value the shipped aero table's own CD
      // column was generated with — no longer just a runtime knob below
      // that). CD0 raised to 0.09 (vs the 0.06 baseline estimate) —
      // capped there deliberately, NOT at the higher values that reach the
      // polar bands fully (CD0=0.15-0.18 gets TWA-40/TWA-90 much closer or
      // in-band) because CD0 also scales the flogging-drag term
      // (floggingCDFactor*CD0) and, near head-to-wind, parasitic drag
      // partially resolves as forward thrust (the apparent wind is nearly
      // boat-aligned there) — probed empirically: CD0 past ~0.10 breaks
      // the "head-to-wind stays still" test (speed 0.30->0.52+ m/s, over
      // its 0.5 ceiling) and collapses T3's "easing turns windward" margin
      // toward zero. 0.09 keeps both safely passing (0.40 m/s, 3.3deg)
      // while still narrowing the polar gap. Result: TWA-40 ratio
      // 0.588->0.458 (target <0.35, not fully reached), TWS6/TWA90 speed
      // 3.70->3.63 m/s (target <=3.6, not fully reached) — reported as the
      // best achievable without breaking other established behaviors, per
      // the standing calibration allowance, not a band edit. The remaining
      // gap is largely the boat's top-end reaching speed now being hull-
      // WAVE-RESISTANCE-limited (the u^4 penalty term R7-1 explicitly
      // keeps unchanged), not sail-limited.
      camber: 0,
      CD0: 0.09,
      s: 1.0,                                 // tunable partial-suction factor (RUNTIME only) — now at its physical ceiling (full suction loss)
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
      // ceSwingFraction: round 7, D-6. The yard's swing (delta) still
      // moves the CE fore-aft/athwartship (a real crab-claw's CE genuinely
      // shifts with trim — that's the whole mechanism by which trimming
      // steers), but round 5's model let the FULL geometric half-chord
      // excursion reach the CE, which the owner's field datum (D-6) says
      // is far too responsive for a real Pjoa. A flow-attached aerodynamic
      // center tracks closer to the leading edge across the practical trim
      // range than the raw geometric midchord, so only a fraction of the
      // full swing should reach it. 0.2 is empirically landed against the
      // D-6 target (0.3-1.5deg/s steady sail-trim turn rate at TWS 6,
      // 5-15deg over a 10s window) — see harness/asserts.js T1/T3/T4/T5.
      ceSwingFraction: 0.5,
    },

    crew: {
      mass: 90,                // kg
      posMin: -0.3,
      posMax: 1.0,
      posXMin: -1.0,            // fore-aft crew position range (FIX_REQUEST_round4_roll_dof.md 1.5)
      posXMax: 1.0,
    },

    stability: {
      abackCapsizeTime: 6,       // s — sustained aback before capsize (acceptance criterion 3)
      overloadCapsizeTime: 2.0,  // s — sustained amaLoad > 1.0 (ama flying) before capsize
      amaLoadDisplayCap: 3.0,    // UI-safe ceiling for amaLoad readouts (FIX_REQUEST_step1_round2.md R2-3); the raw value stays unclamped for the overload timer above
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
      // rollDampingCoeff: paired with I_roll=1500 above, tuned so the same
      // 8deg step settles (|phi|<0.4deg) in ~3.2 oscillation periods —
      // within the requested 2-4 period, damped-overshoot band.
      rollDampingCoeff: 900,
      // phiCapsizeDeg (EXTENSION_round5_sheet_constraint.md R5-2.1): past
      // this angle (symmetric on both sides) the ama's restoring arm
      // reverses into a genuine capsizing arm — see stability.js
      // rollRestoreMoment. 50deg is 38deg past phiLiftoffDeg (12) and 40deg
      // past phiSubmergeDeg (10), both within the request's own suggested
      // "~35-40deg past liftoff" band, and comfortably below the 58deg
      // runaway heel the round-4 review found holding as a spurious stable
      // equilibrium (verified fixed — see ARCHITECTURE doc).
      phiCapsizeDeg: 50,
    },

    rudder: {
      maxDeflectionDeg: 35,
      area: 0.4,                // m^2 — tunable estimate, steering-oar blade
      coeff: 3.5,               // tunable — lift-curve-like coefficient for the oar
    },

    shunt: {
      speedLockout: 4,          // m/s — shunt locked out above this speed
      easeDuration: 1.2,        // s
      transferDuration: 1.8,    // s
      swapDuration: 0.4,        // s (near-instantaneous role swap)
      sheetDuration: 1.6,       // s
    },

    aeroTable,
  };
}

export function validateConfig(config) {
  const errs = [];
  const inRange = (v, lo, hi, name) => { if (!(v >= lo && v <= hi)) errs.push(`${name}=${v} out of range [${lo},${hi}]`); };

  if (config.configVersion !== CONFIG_VERSION) errs.push(`configVersion mismatch: ${config.configVersion} !== ${CONFIG_VERSION}`);
  inRange(config.sail.apexAngleDeg, 45, 60, 'sail.apexAngleDeg');
  inRange(config.sail.camber, 0, 0.20, 'sail.camber');
  inRange(config.crew.posMin, -1, 0, 'crew.posMin');
  inRange(config.crew.posMax, 0, 2, 'crew.posMax');
  inRange(config.rudder.maxDeflectionDeg, 1, 60, 'rudder.maxDeflectionDeg');
  if (!(config.stability.abackCapsizeTime > 0)) errs.push('stability.abackCapsizeTime must be > 0');
  if (!(config.stability.overloadCapsizeTime > 0)) errs.push('stability.overloadCapsizeTime must be > 0');
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
  return validateConfig(merged);
}
