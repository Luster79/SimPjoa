#!/usr/bin/env node
// harness/replay.js — headless replay of a recorded session (round 6,
// R6-4). Exploits the core's determinism (fixed dt substeps, no wall
// clock, no randomness — verified by harness/asserts.js's R6-1
// self-test) to re-simulate a recorded session EXACTLY, offline, for
// diagnosing a bug report from the exact input sequence that produced it.
//
// Usage: node harness/replay.js <recording.json> [--csv out.csv] [--verify]
//
// No dependencies beyond core Node (npm-free CLI per the request) —
// argv parsing is a handful of lines, not a library.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createConfig, CONFIG_VERSION } from '../core/config.js';
import { integrate, computeForces } from '../core/integrator.js';
import { hashState } from './checksum.js';

function normalizeAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
function deg(rad) { return rad === undefined || rad === null ? '' : (rad * 180) / Math.PI; }
function csvField(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(6) : String(v);
  return String(v);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--csv') args.csv = argv[++i];
    else if (a === '--verify') args.verify = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else args._.push(a);
  }
  return args;
}

function currentCodeVersion() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return null; // not a git checkout, or git unavailable -- best-effort only
  }
}

// stepFrame mirrors core/simulator.js's step() EXACTLY (edge-detecting
// controls.shuntRequest into a single pulse, then substepping at fixed
// config.dt) -- duplicated here, not imported, because that logic is
// private to the facade's closure and this tool intentionally stays a
// thin, harness-layer consumer of core/integrator.js directly (see
// ARCHITECTURE_physics_core_EN.md's round-6 note: replay must not require
// ANY core change beyond what determinism verification itself needs).
function stepFrame(state, rawControls, dtFrame, lastShuntRequest, config) {
  const edge = Boolean(rawControls.shuntRequest) && !lastShuntRequest;
  const nextLastShuntRequest = Boolean(rawControls.shuntRequest);
  const stepControls = { ...rawControls, shuntRequest: edge };
  const nSub = Math.max(1, Math.round(dtFrame / config.dt));
  const subDt = dtFrame / nSub;
  for (let i = 0; i < nSub; i++) state = integrate(state, stepControls, config, subDt);
  return { state, lastShuntRequest: nextLastShuntRequest };
}

const CSV_HEADER = [
  't', 'frame', 'TWA', 'AWA',
  'x', 'y', 'heading', 'u', 'v', 'r', 'phi', 'p', 'delta', 'deltaMax', 'end',
  'alpha', 'alphaSailor', 'CL', 'CD',
  'sailFx', 'sailFy', 'sailYawMoment', 'sailHeelMoment',
  'hullResistFx', 'hullSideFx', 'hullSideFy', 'hullSideYawMoment',
  'amaDragFx', 'amaDragYawMoment', 'rudderFy', 'rudderYawMoment',
  'amaLoad', 'amaLoadDisplay', 'abackTimer', 'capsized',
  'shuntPhase', 'luffing',
  'windDirFrom', 'windSpeed', 'sheet', 'rudder', 'brailLee', 'brailWind', 'crewPos', 'crewPosX', 'shuntRequest',
  'annotation',
];

function buildRow(frameIdx, state, controls, forces, annotation) {
  const twa = controls ? deg(normalizeAngle(controls.windDirFrom - state.heading)) : '';
  const awa = forces.aw ? deg(normalizeAngle(Math.atan2(-forces.aw.vy, -forces.aw.vx))) : '';
  const b = forces.breakdown;
  const row = [
    state.t, frameIdx, twa, awa,
    state.x, state.y, deg(state.heading), state.u, state.v, state.r, deg(state.phi), state.p, deg(state.delta), deg(forces.deltaMax), state.end,
    deg(forces.alpha), deg(forces.alphaSailor), forces.CL, forces.CD,
    b.sail.Fx, b.sail.Fy, b.sail.yawMoment, b.sail.heelMoment,
    b.hullResist.Fx, b.hullSide.Fx, b.hullSide.Fy, b.hullSide.yawMoment,
    b.amaDrag.Fx, b.amaDrag.yawMoment, b.rudder.Fy, b.rudder.yawMoment,
    forces.amaLoad, forces.amaLoadDisplay, state.abackTimer, state.capsized,
    state.shunt.phase, forces.luffing,
    deg(controls.windDirFrom), controls.windSpeed, deg(controls.sheet), controls.rudder,
    controls.brailLee, controls.brailWind, controls.crewPos, controls.crewPosX, Boolean(controls.shuntRequest),
    annotation ?? '',
  ];
  return row.map(csvField).join(',');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) {
    console.log('Usage: node harness/replay.js <recording.json> [--csv out.csv] [--verify]');
    process.exit(args.help ? 0 : 1);
  }

  const path = args._[0];
  let recording;
  try {
    recording = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`error: could not read/parse ${path}: ${e.message}`);
    process.exit(1);
  }

  if (recording.format !== 'simpjoa-recording') {
    console.error(`error: ${path} is not a simpjoa recording (format="${recording.format}")`);
    process.exit(1);
  }
  if (recording.formatVersion !== 1) {
    console.warn(`WARNING: recording formatVersion=${recording.formatVersion}, this tool knows format 1 -- proceeding anyway.`);
  }
  if (recording.configVersion !== CONFIG_VERSION) {
    console.warn(`WARNING: recording's configVersion (${recording.configVersion}) does not match the current tree's (${CONFIG_VERSION}) -- the physics may have changed since this was recorded; replay is not guaranteed physically meaningful.`);
  }
  const nowCodeVersion = currentCodeVersion();
  if (recording.codeVersion && nowCodeVersion && recording.codeVersion !== nowCodeVersion) {
    console.warn(`WARNING: recording's codeVersion (${recording.codeVersion}) does not match the current checkout (${nowCodeVersion}) -- core logic may have changed since this was recorded.`);
  } else if (recording.codeVersion && !nowCodeVersion) {
    console.warn(`WARNING: recording has codeVersion=${recording.codeVersion} but the current tree's git hash could not be determined (not a git checkout, or git unavailable) -- cannot verify code match.`);
  }
  if (recording.trimmed) {
    console.warn('WARNING: this recording was trimmed (ring buffer capacity exceeded) -- it does not cover the full session, only its most recent portion.');
  }

  const config = createConfig(recording.configSnapshot);
  let state = { ...recording.initialState, shunt: { ...recording.initialState.shunt } };
  let lastShuntRequest = Boolean(recording.initialLastShuntRequest);

  const annotations = (recording.annotations ?? []).slice().sort((a, b) => a.t - b.t);
  let nextAnnotationIdx = 0;

  const csvRows = args.csv ? [CSV_HEADER.join(',')] : null;
  const replayedChecksums = [];

  const frames = recording.frames ?? [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const stepped = stepFrame(state, frame.controls, frame.dt, lastShuntRequest, config);
    state = stepped.state;
    lastShuntRequest = stepped.lastShuntRequest;

    let annotation = '';
    while (nextAnnotationIdx < annotations.length && annotations[nextAnnotationIdx].t <= state.t) {
      annotation = annotation ? `${annotation}; ${annotations[nextAnnotationIdx].note}` : annotations[nextAnnotationIdx].note;
      nextAnnotationIdx++;
    }

    if (csvRows) {
      const forces = computeForces(state, frame.controls, config);
      csvRows.push(buildRow(i, state, frame.controls, forces, annotation));
    }

    if ((i + 1) % 60 === 0) replayedChecksums.push(hashState(state));
  }

  if (args.verify) {
    const recorded = recording.stateChecksums ?? [];
    const n = Math.min(recorded.length, replayedChecksums.length);
    let firstDivergence = -1;
    for (let i = 0; i < n; i++) {
      if (recorded[i] !== replayedChecksums[i]) { firstDivergence = i; break; }
    }
    if (firstDivergence === -1 && recorded.length === replayedChecksums.length) {
      console.log(`VERIFY: PASS -- ${replayedChecksums.length} checksums matched over ${frames.length} frames.`);
    } else if (firstDivergence !== -1) {
      const frameIdx = (firstDivergence + 1) * 60 - 1;
      console.error(`VERIFY: FAIL -- first divergent checksum at index ${firstDivergence} (around frame ${frameIdx}, t~${state.t.toFixed(1)}s of the full replay).`);
      console.error('Most likely cause for a recording made in a BROWSER and replayed here in Node: Math.sin/cos/atan2/sqrt are "implementation-approximated" per the ECMAScript spec -- not required to be bit-identical across different V8 builds (the browser and Node bundle different V8 versions even on the same machine). A single-ULP difference in one trig call, compounded over enough RK4 substeps, is enough to flip this hash even though the physics never meaningfully diverged -- the CSV dump below is still trustworthy for diagnosis. A LARGE, early, or repeated divergence is a different story: check codeVersion/configVersion above first, then suspect a real nondeterminism regression (rerun harness/asserts.js\'s R6-1 self-test, which runs entirely within one engine and must stay bit-exact).');
      process.exitCode = 1;
    } else {
      console.error(`VERIFY: FAIL -- checksum count mismatch: recording has ${recorded.length}, replay produced ${replayedChecksums.length} (frame count likely differs).`);
      process.exitCode = 1;
    }
  }

  if (args.csv) {
    writeFileSync(args.csv, csvRows.join('\n'));
    console.log(`Wrote ${args.csv} (${csvRows.length - 1} rows).`);
  }

  console.log(`Replayed ${frames.length} frames (${state.t.toFixed(1)}s of sim time). Final state: capsized=${state.capsized}, x=${state.x.toFixed(1)}, y=${state.y.toFixed(1)}.`);
}

main();
