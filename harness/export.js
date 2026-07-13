// harness/export.js — dump a scenario/polar time series to CSV.
// toCSV(run) — columns: t, TWA, AWA, u, v, r, alpha, CL, CD, amaLoad,
// brailLee, brailWind, crewPos, shunt phase.

function normalizeAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
function deg(rad) { return rad === undefined ? '' : (rad * 180) / Math.PI; }

export function toCSV(run) {
  const header = ['t', 'TWA', 'AWA', 'u', 'v', 'r', 'alpha', 'CL', 'CD', 'amaLoad', 'brailLee', 'brailWind', 'crewPos', 'shuntPhase'];
  const lines = [header.join(',')];

  for (const entry of run) {
    const controls = entry.controls;
    const twa = controls ? deg(normalizeAngle(controls.windDirFrom - entry.heading)) : '';
    const awa = entry.aw ? deg(normalizeAngle(Math.atan2(-entry.aw.vy, -entry.aw.vx))) : '';

    const row = [
      entry.t,
      twa, awa,
      entry.u, entry.v, entry.r,
      deg(entry.alpha), entry.CL ?? '', entry.CD ?? '',
      entry.amaLoad,
      controls?.brailLee ?? '', controls?.brailWind ?? '', controls?.crewPos ?? '',
      entry.shunt?.phase ?? '',
    ];
    lines.push(row.map((v) => (typeof v === 'number' ? v.toFixed(5) : v)).join(','));
  }
  return lines.join('\n');
}
