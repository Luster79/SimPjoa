// harness/export.js — dump a scenario/polar time series to CSV.
// toCSV(run) — columns: t, TWA, AWA, u, v, r, phi, p, delta, deltaMax,
// alpha, CL, CD, amaLoad, brailLee, brailWind, crewPos, crewPosX, shunt
// phase. phi/p added FIX_REQUEST_round4_roll_dof.md (roll trace column).
// delta/deltaMax added EXTENSION_round5_sheet_constraint.md R5-1: delta is
// the yard's actual angle (state), deltaMax is the sheet ceiling in force
// that instant (released during a shunt's ease/transfer/swap, see
// core/sheet.js) — the two coincide exactly when the sheet is taut.

function normalizeAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
function deg(rad) { return rad === undefined ? '' : (rad * 180) / Math.PI; }

export function toCSV(run) {
  const header = ['t', 'TWA', 'AWA', 'u', 'v', 'r', 'phi', 'p', 'delta', 'deltaMax', 'alpha', 'CL', 'CD', 'amaLoad', 'brailLee', 'brailWind', 'crewPos', 'crewPosX', 'shuntPhase'];
  const lines = [header.join(',')];

  for (const entry of run) {
    const controls = entry.controls;
    const twa = controls ? deg(normalizeAngle(controls.windDirFrom - entry.heading)) : '';
    const awa = entry.aw ? deg(normalizeAngle(Math.atan2(-entry.aw.vy, -entry.aw.vx))) : '';

    const row = [
      entry.t,
      twa, awa,
      entry.u, entry.v, entry.r,
      deg(entry.phi), deg(entry.p),
      deg(entry.delta), entry.deltaMax !== undefined ? deg(entry.deltaMax) : '',
      deg(entry.alpha), entry.CL ?? '', entry.CD ?? '',
      entry.amaLoad,
      controls?.brailLee ?? '', controls?.brailWind ?? '', controls?.crewPos ?? '', controls?.crewPosX ?? '',
      entry.shunt?.phase ?? '',
    ];
    lines.push(row.map((v) => (typeof v === 'number' ? v.toFixed(5) : v)).join(','));
  }
  return lines.join('\n');
}
