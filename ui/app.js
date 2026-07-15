// ui/app.js — Step 2 browser UI. Imports the frozen Step 1 core
// unmodified; all physics lives in /core, this file only reads state via
// getState()/forcesBreakdown() and renders/controls it.
//
// Screen convention: world (x=east, y=north) maps to screen with NO axis
// flip (screenX = centerX + (worldX-camX)*scale, screenY likewise on Y) —
// deliberately, not a flipped "north-up" map. A per-axis flip would change
// the coordinate system's handedness, and a single ctx.rotate() cannot
// correctly re-derive off-centerline local points (e.g. the ama at boat-
// frame +y) under a flipped outer frame without also mirroring local
// shapes. Keeping both frames right-handed lets ctx.rotate(state.heading)
// reproduce the core's own rotation exactly, so every boat-frame vector
// (aw, force breakdown Fx/Fy) can be drawn as a raw local offset with no
// extra sign-juggling. There's no compass requirement here (the core's own
// HEADING0 is an "arbitrary reference heading"), so "north down the
// screen" is a harmless cosmetic consequence, not a bug.

import { createSimulator } from '../core/simulator.js';
import { createConfig } from '../core/config.js';
import { createDefaultControls } from '../core/state.js';
import { computePolar } from '../harness/polar.js';

const DEG = Math.PI / 180;
const MS_TO_KN = 1.9438;

const dims = createConfig(); // dimensions/limits only; the sim keeps its own internal config
const sim = createSimulator();

// ---------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const banner = document.getElementById('banner');
const capsizeOverlay = document.getElementById('capsizeOverlay');
const capsizeCause = document.getElementById('capsizeCause');
const amaBar = document.querySelector('#amaBar > i');
const amaBarWrap = document.getElementById('amaBar');
const shuntHint = document.getElementById('shuntHint');

const sliders = {
  windDir: document.getElementById('windDir'),
  windSpeed: document.getElementById('windSpeed'),
  yardAngle: document.getElementById('yardAngle'),
  brailLee: document.getElementById('brailLee'),
  brailWind: document.getElementById('brailWind'),
  rudder: document.getElementById('rudder'),
  crewPos: document.getElementById('crewPos'),
};
const outs = {
  windDir: document.getElementById('windDirOut'),
  windSpeed: document.getElementById('windSpeedOut'),
  yardAngle: document.getElementById('yardAngleOut'),
  brailLee: document.getElementById('brailLeeOut'),
  brailWind: document.getElementById('brailWindOut'),
  rudder: document.getElementById('rudderOut'),
  crewPos: document.getElementById('crewPosOut'),
};

// ---------------------------------------------------------------------
// Control state — the single source of truth the sim reads each frame.
// Sliders and keyboard both write into this object.
// ---------------------------------------------------------------------
// Defaults picked to land near the polar's own TWA=90/TWS=6 optimum
// (yard~50deg, light crew ballast) instead of an arbitrary tight trim —
// starting overpowered with crewPos=0 hits the overload alarm within
// half a second, which is correct per FIX_REQUEST_step1_round2.md R2-1's
// tuning but a rough first impression for a freshly loaded page.
const controls = createDefaultControls();
controls.windDirFrom = 180 * DEG;
controls.windSpeed = 6;
controls.yardAngle = 50 * DEG;
controls.crewPos = 0.3;

let autoRudder = true; // keyboard rudder auto-centers when A/D released
const keys = new Set();
let shuntHeld = false;

function syncSlidersFromControls() {
  sliders.windDir.value = String(Math.round(controls.windDirFrom / DEG));
  sliders.windSpeed.value = String(controls.windSpeed);
  sliders.yardAngle.value = String(Math.round(controls.yardAngle / DEG));
  sliders.brailLee.value = String(Math.round(controls.brailLee * 100));
  sliders.brailWind.value = String(Math.round(controls.brailWind * 100));
  sliders.rudder.value = String(controls.rudder);
  sliders.crewPos.value = String(controls.crewPos);
  refreshOutputs();
}

function refreshOutputs() {
  outs.windDir.textContent = `${Math.round(controls.windDirFrom / DEG)}°`;
  outs.windSpeed.textContent = controls.windSpeed.toFixed(1);
  outs.yardAngle.textContent = `${Math.round(controls.yardAngle / DEG)}°`;
  outs.brailLee.textContent = `${Math.round(controls.brailLee * 100)}%`;
  outs.brailWind.textContent = `${Math.round(controls.brailWind * 100)}%`;
  outs.rudder.textContent = controls.rudder.toFixed(2);
  outs.crewPos.textContent = controls.crewPos.toFixed(2);
}

sliders.windDir.addEventListener('input', () => { controls.windDirFrom = Number(sliders.windDir.value) * DEG; refreshOutputs(); });
sliders.windSpeed.addEventListener('input', () => { controls.windSpeed = Number(sliders.windSpeed.value); refreshOutputs(); });
sliders.yardAngle.addEventListener('input', () => { controls.yardAngle = Number(sliders.yardAngle.value) * DEG; refreshOutputs(); });
sliders.brailLee.addEventListener('input', () => { controls.brailLee = Number(sliders.brailLee.value) / 100; refreshOutputs(); });
sliders.brailWind.addEventListener('input', () => { controls.brailWind = Number(sliders.brailWind.value) / 100; refreshOutputs(); });
sliders.rudder.addEventListener('input', () => { autoRudder = false; controls.rudder = Number(sliders.rudder.value); refreshOutputs(); });
sliders.crewPos.addEventListener('input', () => { controls.crewPos = Number(sliders.crewPos.value); refreshOutputs(); });

syncSlidersFromControls();

// ---------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const HANDLED_KEYS = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'KeyQ', 'KeyZ', 'KeyW', 'KeyX', 'KeyJ', 'KeyL', 'KeyA', 'KeyD', 'KeyP', 'Period', 'KeyF', 'KeyO', 'KeyR']);

window.addEventListener('keydown', (e) => {
  if (HANDLED_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') shuntHeld = true;
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'Period') stepOnce = true;
  if (e.code === 'KeyF') toggleForces();
  if (e.code === 'KeyO') togglePolar();
  if (e.code === 'KeyR') doReset();
  if (['KeyA', 'KeyD'].includes(e.code)) autoRudder = false;
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') shuntHeld = false;
  if (e.code === 'KeyA' || e.code === 'KeyD') autoRudder = true;
});

function applyContinuousKeys(dt) {
  const yardRate = 60 * DEG; // per second
  const brailRate = 0.8; // fraction/sec
  const rudderRate = 2.2; // units/sec (-1..1 range)
  const crewRate = 0.5; // fraction/sec

  if (keys.has('ArrowRight')) controls.yardAngle = clamp(controls.yardAngle + yardRate * dt, 0, 90 * DEG);
  if (keys.has('ArrowLeft')) controls.yardAngle = clamp(controls.yardAngle - yardRate * dt, 0, 90 * DEG);
  if (keys.has('KeyQ')) controls.brailLee = clamp(controls.brailLee + brailRate * dt, 0, 1);
  if (keys.has('KeyZ')) controls.brailLee = clamp(controls.brailLee - brailRate * dt, 0, 1);
  if (keys.has('KeyW')) controls.brailWind = clamp(controls.brailWind + brailRate * dt, 0, 1);
  if (keys.has('KeyX')) controls.brailWind = clamp(controls.brailWind - brailRate * dt, 0, 1);
  if (keys.has('KeyJ')) controls.crewPos = clamp(controls.crewPos - crewRate * dt, dims.crew.posMin, dims.crew.posMax);
  if (keys.has('KeyL')) controls.crewPos = clamp(controls.crewPos + crewRate * dt, dims.crew.posMin, dims.crew.posMax);

  if (autoRudder) {
    if (keys.has('KeyA')) controls.rudder = clamp(controls.rudder - rudderRate * dt, -1, 1);
    else if (keys.has('KeyD')) controls.rudder = clamp(controls.rudder + rudderRate * dt, -1, 1);
    else controls.rudder = Math.abs(controls.rudder) < rudderRate * dt ? 0 : controls.rudder - Math.sign(controls.rudder) * rudderRate * dt;
  }
  syncSlidersFromControls();
}

// ---------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------
let paused = false;
let stepOnce = false;
let showForces = true;
let polarMode = false;

function togglePause() { paused = !paused; document.getElementById('btnPause').classList.toggle('active', paused); }
function toggleForces() { showForces = !showForces; document.getElementById('btnForces').classList.toggle('active', showForces); }
function doReset() { sim.reset(); capsizeOverlay.classList.remove('show'); }

document.getElementById('btnPause').addEventListener('click', togglePause);
document.getElementById('btnStep').addEventListener('click', () => { stepOnce = true; });
document.getElementById('btnForces').addEventListener('click', toggleForces);
document.getElementById('btnReset').addEventListener('click', doReset);
document.getElementById('btnResetOverlay').addEventListener('click', doReset);

// Click behaves like a brief press: one rising edge is all the core's
// edge-triggered shuntRequest needs (see simulator.js step()).
document.getElementById('btnShunt').addEventListener('click', () => {
  shuntHeld = true;
  requestAnimationFrame(() => { shuntHeld = false; });
});

// ---------------------------------------------------------------------
// Canvas sizing
// ---------------------------------------------------------------------
let dpr = Math.max(1, window.devicePixelRatio || 1);
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
window.addEventListener('resize', resize);
resize();

let scale = 24; // px per meter, adjustable via wheel zoom
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  scale = clamp(scale * (e.deltaY < 0 ? 1.08 : 0.93), 6, 80);
}, { passive: false });

// ---------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------
function worldToScreen(wx, wy, cam) {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  return { x: cx + (wx - cam.x) * scale * dpr, y: cy + (wy - cam.y) * scale * dpr };
}

function drawWaterGrid(cam) {
  ctx.save();
  ctx.strokeStyle = 'rgba(90,140,180,0.10)';
  ctx.lineWidth = 1;
  const step = 10; // meters
  const spanX = canvas.width / (scale * dpr) + step * 2;
  const spanY = canvas.height / (scale * dpr) + step * 2;
  const startX = Math.floor((cam.x - spanX / 2) / step) * step;
  const startY = Math.floor((cam.y - spanY / 2) / step) * step;
  for (let x = startX; x <= cam.x + spanX / 2; x += step) {
    const a = worldToScreen(x, cam.y - spanY / 2, cam);
    const b = worldToScreen(x, cam.y + spanY / 2, cam);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let y = startY; y <= cam.y + spanY / 2; y += step) {
    const a = worldToScreen(cam.x - spanX / 2, y, cam);
    const b = worldToScreen(cam.x + spanX / 2, y, cam);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.restore();
}

function drawArrow(x0, y0, x1, y1, color, width = 2) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const headLen = Math.min(10, Math.hypot(x1 - x0, y1 - y0) * 0.4);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - headLen * Math.cos(ang - 0.4), y1 - headLen * Math.sin(ang - 0.4));
  ctx.lineTo(x1 - headLen * Math.cos(ang + 0.4), y1 - headLen * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}

// True wind arrow — fixed in the top-left corner, world-frame direction
// only (not boat-relative), independent of camera pan.
function drawTrueWindArrow() {
  const cx = 60, cy = 60, len = 34;
  const towards = controls.windDirFrom + Math.PI; // "blowing towards", world frame
  const dx = Math.cos(towards) * len, dy = Math.sin(towards) * len;
  ctx.save();
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#9fb4c8';
  ctx.beginPath(); ctx.arc(cx, cy, len + 14, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(159,180,200,0.25)'; ctx.stroke();
  drawArrow(cx - dx / 2, cy - dy / 2, cx + dx / 2, cy + dy / 2, '#c9d9e6', 2.5);
  ctx.fillText(`TWS ${controls.windSpeed.toFixed(1)} m/s`, cx - 30, cy + len + 26);
  ctx.restore();
}

// Sail shape: an arc from the tack (near centerline) to the clew (swept to
// leeward by yardAngle), curvature/fill communicating brail state. Purely a
// drawing model — the physics only needs yardAngle and the brail fractions.
function sailPath(yardLen, yardAngleAbs, brailLee, brailWind) {
  const tackX = 0.35 * yardLen; // slightly forward of the mast step
  const clewX = tackX - yardLen * Math.cos(yardAngleAbs);
  const clewY = -yardLen * Math.sin(yardAngleAbs); // leeward = -y
  const furled = brailLee > 0.97 && brailWind > 0.97;
  if (furled) return { tackX, clewX: tackX + 0.15, clewY: -0.15, furled: true };
  // Camber bulge: leeward brail flattens it, windward brail over-curves it.
  const camber = clamp(0.28 * (1 - brailLee) + 0.22 * brailWind, 0.02, 0.5);
  const midX = (tackX + clewX) / 2;
  const midY = (0 + clewY) / 2;
  const nx = -clewY, ny = clewX - tackX; // perpendicular to the chord
  const nlen = Math.hypot(nx, ny) || 1;
  const bulge = camber * yardLen;
  const ctrlX = midX + (nx / nlen) * bulge;
  const ctrlY = midY + (ny / nlen) * bulge;
  return { tackX, clewX, clewY, ctrlX, ctrlY, furled: false };
}

function drawBoat(state, forces, cam) {
  const boatScreen = worldToScreen(state.x, state.y, cam);
  const px = scale * dpr;
  ctx.save();
  ctx.translate(boatScreen.x, boatScreen.y);
  ctx.rotate(state.heading);
  ctx.scale(px, px); // local drawing now in real meters

  const L = dims.hull.length, halfL = L / 2;
  const beam = dims.hull.beam;
  const spacing = dims.ama.spacing, amaLen = dims.ama.length;
  const capsized = state.capsized;

  // Crossbeams (hull centerline to ama)
  ctx.strokeStyle = capsized ? '#5a4030' : '#7a5a3a';
  ctx.lineWidth = 0.05;
  [-halfL * 0.35, halfL * 0.35].forEach((bx) => {
    ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, spacing); ctx.stroke();
  });

  // Ama (always at +y)
  ctx.fillStyle = capsized ? '#4a3a2a' : '#c9a35a';
  ctx.beginPath();
  ctx.ellipse(0, spacing, amaLen / 2, beam * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main hull (slender canoe shape, active bow at +x)
  ctx.fillStyle = capsized ? '#3a3a3a' : '#d8c9a8';
  ctx.beginPath();
  ctx.moveTo(halfL, 0);
  ctx.quadraticCurveTo(halfL * 0.4, beam / 2, -halfL * 0.85, beam / 2);
  ctx.quadraticCurveTo(-halfL, 0, -halfL * 0.85, -beam / 2);
  ctx.quadraticCurveTo(halfL * 0.4, -beam / 2, halfL, 0);
  ctx.closePath();
  ctx.fill();

  // Active-bow marker
  ctx.fillStyle = '#ff8a3d';
  ctx.beginPath();
  ctx.moveTo(halfL + 0.35, 0); ctx.lineTo(halfL - 0.15, 0.22); ctx.lineTo(halfL - 0.15, -0.22);
  ctx.closePath(); ctx.fill();

  // Crew dot along the beam at crewPos * (spacing/2), offset from hull centerline (0) toward the ama
  const crewY = clamp(controls.crewPos, dims.crew.posMin, dims.crew.posMax) * (spacing / 2);
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath(); ctx.arc(0, crewY, 0.28, 0, Math.PI * 2); ctx.fill();

  // Sail — faded during the ease/transfer/swap shunt phases, tack sliding
  // during 'transfer' (state.shunt.progress interpolates the tack point).
  const fade = state.shunt.phase === 'ease' ? 1 - state.shunt.progress
    : (state.shunt.phase === 'transfer' || state.shunt.phase === 'swap') ? 0
    : state.shunt.phase === 'sheet' ? state.shunt.progress : 1;
  const yardLen = clamp(Math.sqrt(dims.sail.area) * 1.8, 3, 8);

  if (state.shunt.phase === 'transfer') {
    // Cosmetic only (core forces stay faded to 0 throughout — see shunt.js):
    // the yard heel/tack visibly slides from near the current active bow
    // toward the far end, along the leeward side, per B3's shunt-animation
    // spec — the actual bow/stern role swap itself happens instantaneously
    // in the core at the 'swap' sub-phase.
    const fromX = 0.35 * yardLen, toX = -halfL * 0.75;
    const tx = fromX + (toX - fromX) * state.shunt.progress;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#8a8060'; ctx.lineWidth = 0.12;
    ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx + 0.6, -0.35); ctx.stroke();
    ctx.restore();
  } else {
    const sp = sailPath(yardLen, Math.abs(controls.yardAngle), controls.brailLee, controls.brailWind);
    if (fade > 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.65 * fade;
      ctx.strokeStyle = '#e8e3d0';
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      if (sp.furled) {
        ctx.moveTo(sp.tackX, 0); ctx.lineTo(sp.clewX, sp.clewY);
        ctx.lineWidth = 0.22; ctx.strokeStyle = '#8a8060';
        ctx.stroke();
      } else {
        ctx.moveTo(sp.tackX, 0);
        ctx.quadraticCurveTo(sp.ctrlX, sp.ctrlY, sp.clewX, sp.clewY);
        ctx.lineTo(sp.tackX, 0);
        ctx.fillStyle = 'rgba(232,227,208,0.5)';
        ctx.fill();
        ctx.stroke();
      }
      // Yard spar
      ctx.strokeStyle = '#3a2f22'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(sp.tackX, 0); ctx.lineTo(sp.clewX, sp.clewY); ctx.stroke();
      ctx.restore();
    }
  }

  // Apparent wind arrow at the boat, boat-frame local vector (already
  // rotates for free with this transform since aw is boat-frame).
  if (forces && forces.aw && forces.aw.speed > 0.05) {
    const s = 0.35;
    const ax = forces.aw.vx * s, ay = forces.aw.vy * s;
    ctx.save(); ctx.lineWidth = 0.05;
    drawVectorLocal(0, spacing * 0.6, ax, ay, '#7fd0ff');
    ctx.restore();
  }

  // Force vectors, from forcesBreakdown(), all already boat-frame.
  if (showForces && forces) {
    const fScale = 0.0035; // N -> m, chosen for legibility, log-softened below
    const soften = (n) => Math.sign(n) * Math.log10(1 + Math.abs(n)) * 0.55;
    const ceX = (dims.sail.ceXFraction ?? 0.06) * halfL * state.end;
    const clrX = -(dims.hull.clrXFraction ?? 0.05) * halfL;
    const rudderX = -halfL * state.end; // physical stern, opposite the active bow

    // Decompose the sail's resultant into lift/drag using the flow basis —
    // pure display-layer vector algebra on already-final, already-correct
    // numbers (breakdown.sail.Fx/Fy, aw direction); no new physics.
    if (forces.aw.speed > 0.05) {
      const sp2 = forces.breakdown.sail;
      const inv = 1 / forces.aw.speed;
      const xHatX = forces.aw.vx * inv, xHatY = forces.aw.vy * inv;
      const yHatX = -xHatY, yHatY = xHatX;
      const D = sp2.Fx * xHatX + sp2.Fy * xHatY;
      const L = sp2.Fx * yHatX + sp2.Fy * yHatY;
      drawVectorLocal(ceX, 0, xHatX * soften(D), xHatY * soften(D), '#ff6b6b'); // drag
      drawVectorLocal(ceX, 0, yHatX * soften(L), yHatY * soften(L), '#ffd23f'); // lift
    }
    const hs = forces.breakdown.hullSide;
    drawVectorLocal(clrX, 0, 0, soften(hs.Fy), '#7fe3a3');
    const rd = forces.breakdown.rudder;
    drawVectorLocal(rudderX, 0, 0, soften(rd.Fy), '#7fc7ff');
  }

  ctx.restore();
}

function drawVectorLocal(x0, y0, dx, dy, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 0.06;
  const len = Math.hypot(dx, dy);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx, y0 + dy); ctx.stroke();
  if (len > 0.05) {
    const ang = Math.atan2(dy, dx);
    const h = Math.min(0.35, len * 0.35);
    ctx.beginPath();
    ctx.moveTo(x0 + dx, y0 + dy);
    ctx.lineTo(x0 + dx - h * Math.cos(ang - 0.4), y0 + dy - h * Math.sin(ang - 0.4));
    ctx.lineTo(x0 + dx - h * Math.cos(ang + 0.4), y0 + dy - h * Math.sin(ang + 0.4));
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
// HUD + alarms
// ---------------------------------------------------------------------
const hud = {
  speed: document.getElementById('hudSpeed'),
  twa: document.getElementById('hudTwa'),
  awa: document.getElementById('hudAwa'),
  alpha: document.getElementById('hudAlpha'),
  vmg: document.getElementById('hudVmg'),
  leeway: document.getElementById('hudLeeway'),
  amaLoad: document.getElementById('hudAmaLoad'),
  shunt: document.getElementById('hudShunt'),
  tws: document.getElementById('hudTws'),
};

function normalizeAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

function updateHud(state, forces) {
  const speedMs = Math.hypot(state.u, state.v);
  const speedKn = speedMs * MS_TO_KN;
  const twaDeg = normalizeAngle(controls.windDirFrom - state.heading) / DEG;
  const awaDeg = forces.aw ? normalizeAngle(Math.atan2(-forces.aw.vy, -forces.aw.vx)) / DEG : 0;
  // VMG upwind: boat's world-frame velocity projected onto the "toward the
  // wind source" unit vector. windDirFrom is a "blowing from" bearing, so
  // (cos,sin)(windDirFrom) already points from here toward the source (see
  // aero.js apparentWind(), which negates this same vector to get the
  // "blowing towards" wind velocity) — positive vmg = progress upwind.
  const boatWx = state.u * Math.cos(state.heading) - state.v * Math.sin(state.heading);
  const boatWy = state.u * Math.sin(state.heading) + state.v * Math.cos(state.heading);
  const vmg = boatWx * Math.cos(controls.windDirFrom) + boatWy * Math.sin(controls.windDirFrom);
  const leewayDeg = Math.atan2(state.v, Math.abs(state.u) + 0.05) / DEG;

  hud.speed.textContent = speedKn.toFixed(1);
  hud.twa.textContent = twaDeg.toFixed(0);
  hud.awa.textContent = awaDeg.toFixed(0);
  hud.alpha.textContent = (forces.alphaSailor / DEG).toFixed(0);
  hud.vmg.textContent = (vmg * MS_TO_KN).toFixed(1);
  hud.leeway.textContent = leewayDeg.toFixed(0);
  hud.amaLoad.textContent = (forces.amaLoadDisplay * 100).toFixed(0);
  hud.shunt.textContent = state.shunt.phase;
  hud.tws.textContent = controls.windSpeed.toFixed(1);

  const loadFrac = clamp(forces.amaLoadDisplay, 0, 3) / 3;
  amaBar.style.width = `${clamp(forces.amaLoadDisplay, 0, 1) * 100}%`;
  amaBarWrap.classList.toggle('warn', forces.amaLoadDisplay > 0.75 && forces.amaLoadDisplay <= 1.0);
  amaBarWrap.classList.toggle('danger', forces.amaLoadDisplay > 1.0);
  amaBar.style.width = `${loadFrac * 100}%`;

  const speedAboveLockout = speedMs > dims.shunt.speedLockout;
  shuntHint.textContent = speedAboveLockout
    ? `Speed lockout: ease sail first (>${dims.shunt.speedLockout} m/s)`
    : 'Hold SPACE / click SHUNT to swap ends';
}

function updateAlarms(state) {
  banner.className = '';
  if (state.capsized) {
    // handled by overlay below
  } else if (state.abackTimer > 0) {
    banner.className = 'aback';
    const remain = Math.max(0, dims.stability.abackCapsizeTime - state.abackTimer);
    banner.textContent = `ABACK — ama to leeward — capsize in ${remain.toFixed(1)}s`;
  } else if (state.overloadTimer > 0) {
    banner.className = 'overload';
    const remain = Math.max(0, dims.stability.overloadCapsizeTime - state.overloadTimer);
    banner.textContent = `OVERLOAD — ama flying — capsize in ${remain.toFixed(1)}s`;
  }

  if (state.capsized && !capsizeOverlay.classList.contains('show')) {
    capsizeOverlay.classList.add('show');
    capsizeCause.textContent = state.abackTimer > dims.stability.abackCapsizeTime - 0.05
      ? 'Cause: sustained ABACK (ama to leeward too long)'
      : 'Cause: sustained OVERLOAD (ama flying too long)';
  }
}

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------
let lastT = performance.now();
let camera = { x: 0, y: 0 };
let prevShuntHeld = false;
let shuntFlashUntil = 0;

function frame(now) {
  const dtFrame = Math.min(0.1, Math.max(0, (now - lastT) / 1000)); // clamp 100ms, tab-switch protection
  lastT = now;

  if (!polarMode) {
    applyContinuousKeys(dtFrame);
    controls.shuntRequest = shuntHeld;
    const attemptEdge = shuntHeld && !prevShuntHeld;
    const stateBefore = sim.getState();
    const phaseBefore = stateBefore.shunt.phase;
    const speedBefore = Math.hypot(stateBefore.u, stateBefore.v);
    // Single-step always advances by one nominal frame (1/60s) regardless
    // of real elapsed time, so it's a reproducible frame-by-frame advance
    // (e.g. for inspecting the shunt sequence) rather than however long the
    // button click happened to take.
    if (!paused || stepOnce) {
      sim.step(controls, stepOnce ? 1 / 60 : dtFrame);
      stepOnce = false;
    }
    const state = sim.getState();
    const forces = sim.forcesBreakdown();
    camera.x = state.x; camera.y = state.y;

    // A rising-edge shuntRequest that didn't move the phase off 'none' AND
    // was above the speed lockout was rejected by shunt.js for that reason
    // specifically — flash the speed readout and the hint per B4/B8. (Not
    // every phase-stays-'none' case is a lockout rejection: the boat may
    // simply have capsized on this same step, which freezes the whole
    // simulation — see simulator.js's step() — and already has its own,
    // more specific capsize overlay; don't misattribute that to the
    // lockout.)
    if (attemptEdge && phaseBefore === 'none' && state.shunt.phase === 'none'
      && speedBefore > dims.shunt.speedLockout && !state.capsized) {
      shuntFlashUntil = now + 900;
    }
    prevShuntHeld = shuntHeld;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawWaterGrid(camera);
    drawBoat(state, forces, camera);
    drawTrueWindArrow();
    updateHud(state, forces);
    updateAlarms(state);

    const flashing = now < shuntFlashUntil;
    hud.speed.classList.toggle('flash-warn', flashing);
    shuntHint.classList.toggle('flash-warn', flashing);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------
// Polar mode
// ---------------------------------------------------------------------
const polarPanel = document.getElementById('polarPanel');
const livePanel = document.getElementById('livePanel');
const btnPolar = document.getElementById('btnPolar');
const btnRunPolar = document.getElementById('btnRunPolar');
const btnExportPolar = document.getElementById('btnExportPolar');
const btnClosePolar = document.getElementById('btnClosePolar');
const polarProgress = document.getElementById('polarProgress');

let lastPolarRows = null;

function togglePolar() {
  polarMode = !polarMode;
  btnPolar.classList.toggle('active', polarMode);
  polarPanel.classList.toggle('show', polarMode);
  livePanel.style.display = polarMode ? 'none' : '';
  if (polarMode) drawPolarView(lastPolarRows);
}
btnPolar.addEventListener('click', togglePolar);
btnClosePolar.addEventListener('click', togglePolar);

btnRunPolar.addEventListener('click', async () => {
  btnRunPolar.disabled = true;
  btnExportPolar.disabled = true;
  const twsList = [4, 6, 8, 10];
  const rows = [];
  polarProgress.textContent = 'Running...';
  // Run heading-by-heading so the tab can repaint between chunks instead of
  // blocking the main thread for the whole (slow) sweep in one go.
  for (const tws of twsList) {
    for (let twa = 40; twa <= 170; twa += 10) {
      const part = computePolar(dims, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 10 });
      rows.push(...part);
      polarProgress.textContent = `TWS ${tws} m/s, TWA ${twa}°...`;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  polarProgress.textContent = `Done — ${rows.length} points.`;
  lastPolarRows = rows;
  btnRunPolar.disabled = false;
  btnExportPolar.disabled = false;
  drawPolarView(rows);
});

btnExportPolar.addEventListener('click', () => {
  if (!lastPolarRows) return;
  const header = 'twa,tws,bestSpeed,bestYardAngle,bestCamberUse';
  const lines = [header, ...lastPolarRows.map((r) => `${r.twa},${r.tws},${r.bestSpeed.toFixed(4)},${r.bestYardAngle},${r.bestCamberUse}`)];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'polar.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

const TWS_COLORS = { 4: '#7fc7ff', 6: '#7fe3a3', 8: '#ffd23f', 10: '#ff8a3d' };

function drawPolarView(rows) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2, cy = canvas.height / 2 + 40 * dpr;
  const R = Math.min(canvas.width, canvas.height) * 0.38;

  ctx.save();
  ctx.strokeStyle = 'rgba(159,180,200,0.2)';
  ctx.fillStyle = '#8aa4bd';
  ctx.font = `${12 * dpr}px system-ui, sans-serif`;
  for (let r = R / 4; r <= R; r += R / 4) {
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * 2); ctx.stroke();
  }
  for (let twa = 0; twa <= 180; twa += 30) {
    const a = Math.PI + twa * DEG; // 0deg TWA = straight up in this half-polar
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(twa * DEG) * R, cy - Math.cos(twa * DEG) * R); ctx.stroke();
    ctx.fillText(`${twa}°`, cx + Math.sin(twa * DEG) * (R + 14 * dpr) - 10, cy - Math.cos(twa * DEG) * (R + 14 * dpr));
  }
  ctx.restore();

  if (!rows) {
    ctx.fillStyle = '#8aa4bd';
    ctx.font = `${14 * dpr}px system-ui, sans-serif`;
    ctx.fillText('Run the polar sweep to see the diagram.', cx - 120 * dpr, cy + R + 40 * dpr);
    return;
  }

  const maxSpeed = Math.max(...rows.map((r) => r.bestSpeed), 0.1);
  for (const tws of [4, 6, 8, 10]) {
    const pts = rows.filter((r) => r.tws === tws).sort((a, b) => a.twa - b.twa);
    if (!pts.length) continue;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const rr = (p.bestSpeed / maxSpeed) * R;
      const a = p.twa * DEG;
      const x = cx + Math.sin(a) * rr, y = cy - Math.cos(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = TWS_COLORS[tws];
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
  }

  ctx.fillStyle = '#c9d9e6';
  ctx.font = `${12 * dpr}px system-ui, sans-serif`;
  let ly = cy + R + 20 * dpr;
  for (const tws of [4, 6, 8, 10]) {
    ctx.fillStyle = TWS_COLORS[tws];
    ctx.fillRect(cx - 90 * dpr, ly - 8 * dpr, 14 * dpr, 4 * dpr);
    ctx.fillStyle = '#c9d9e6';
    ctx.fillText(`TWS ${tws} m/s`, cx - 70 * dpr, ly);
    ly += 16 * dpr;
  }

  // Live point overlay
  const state = sim.getState();
  const twaNow = normalizeAngle(controls.windDirFrom - state.heading) / DEG;
  const speedNow = Math.hypot(state.u, state.v);
  if (twaNow >= 0 && twaNow <= 180) {
    const rr = (speedNow / maxSpeed) * R;
    const a = twaNow * DEG;
    const x = cx + Math.sin(a) * rr, y = cy - Math.cos(a) * rr;
    ctx.beginPath(); ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6b6b'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
  }
}
