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
      Cf: 0.0015,                          // tunable estimate, ITTC-57-like skin friction
      froudeThreshold: 0.4,               // wave resistance penalty kicks in above this Fr
      waveResistanceCoeff: 900,           // tunable — scales the u^4 penalty above threshold
      sideForceCoeff: 2.5,                // tunable — low-AR hull-as-foil lift-curve factor (folds in the ama's lateral resistance too, since hydro.js has no separate ama side-force term)
      leewaySaturationDeg: 15,            // side force saturates above this leeway angle
      yawDampingCoeff: 900,               // tunable — N*m per (rad/s), scaled by speed
      clrXFraction: 0.05,                 // tunable — center-of-lateral-resistance offset from CG (aft), fraction of half-length
    },

    ama: {
      length: p.ama_length_m,             // 3.5 m
      maxBuoyancy: p.ama_buoyancy_kg,      // 80 kg
      mass: p.ama_mass_kg,                 // 25 kg — resists lifting when windward (normal case)
      spacing: p.beam_overall_m,           // 2.5 m (hull-ama spacing, "B")
      wettedSurface: 0.6,                  // m^2 — tunable estimate, fully immersed
      dragCoeff: 0.4,                      // tunable — bluff slender body Cd estimate
    },

    sail: {
      area: p.sail_area_m2,                // 12 m^2
      apexAngleDeg: p.sail_apex_angle_deg,  // 50 deg (45-60 valid range)
      CEheight: p.CE_height_m,              // 2.0 m
      camber: 0.10,                          // base camber (depth/chord), 0-0.20
      CD0: 0.06,
      s: 0.85,                               // tunable partial-suction factor (RUNTIME only)
      ceXFraction: 0.06,                      // tunable — center-of-effort longitudinal offset, fraction of half-length
    },

    crew: {
      mass: 90,                // kg
      posMin: -0.3,
      posMax: 1.0,
    },

    stability: {
      abackCapsizeTime: 6,       // s — sustained aback before capsize (acceptance criterion 3)
      overloadCapsizeTime: 2.0,  // s — sustained amaLoad > 1.0 (ama flying) before capsize
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
