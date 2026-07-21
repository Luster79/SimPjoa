// ui/app.js — Step 2 browser UI. Imports the frozen Step 1 core
// unmodified; all physics lives in /core, this file only reads state via
// getState()/forcesBreakdown() and renders/controls it.
//
// Screen convention: world (x=east, y=north) maps to screen with NO axis
// flip (screenX = centerX + (worldX-camX)*scale, screenY likewise on Y) —
// deliberately, not a flipped "north-up" map. A per-axis flip would change
// the coordinate system's handedness, and a single ctx.rotate() cannot
// correctly re-derive off-centerline local points under a flipped outer
// frame without also mirroring local shapes. Keeping both frames right-
// handed lets ctx.rotate(state.heading) reproduce the core's own rotation
// exactly, so every boat-frame vector (aw, force breakdown Fx/Fy) can be
// drawn as a raw local offset with no extra sign-juggling. There's no
// compass requirement here (the core's own HEADING0 is an "arbitrary
// reference heading"), so "north down the screen" is a harmless cosmetic
// consequence, not a bug.
//
// drawBoat() nests a SECOND rotation (0 or PI, from state.end) inside the
// outer one, around the hull-fixed geometry only (crossbeams, ama, hull
// outline, crew) — the ama is bolted to one physical side of the hull and
// does not relocate at a shunt (FIX_REQUEST_round3_worldframe.md R3-1), so
// it is drawn at a fixed physical +y inside that inner frame rather than
// always at the OUTER frame's +y. Sail, force vectors and the apparent-
// wind arrow stay in the outer (active-bow) frame, matching the core.

import { createSimulator } from '../core/simulator.js';
import { createConfig } from '../core/config.js';
import { createDefaultControls } from '../core/state.js';
import { deltaAlign } from '../core/sheet.js';
import { computePolar, computePolarSteps } from '../harness/polar.js';
import { hashState } from '../harness/checksum.js';

const DEG = Math.PI / 180;
const MS_TO_KN = 1.9438;
// Round 6 (ROUND6_flight_recorder.md, R6-2): "dev" here, at the dev-server
// entry point — tools/bundle.js replaces this exact literal with the real
// git short hash when it builds dist/simulator_standalone.html, so a
// recording's codeVersion is meaningful (harness/replay.js warns on
// mismatch) for a downloaded bundle without requiring a build step for
// plain `python3 -m http.server` development.
const CODE_VERSION = 'dev';
// BUILD_TIME: same pattern as CODE_VERSION above — tools/bundle.js
// replaces this with the COMMIT's timestamp (not wall-clock build time),
// so it stays stable across re-bundling the same commit and always
// matches CODE_VERSION's hash. Shown in the bottom-right version footer
// so a bug report/recording can be tied to an exact, dated build without
// having to separately ask "which commit was this."
const BUILD_TIME = 'dev';

// ---------------------------------------------------------------------
// i18n — EN/PL. Static labels are marked with data-i18n="key" in
// index.html and set from TRANSLATIONS on load/switch; dynamic strings
// (values baked in, e.g. countdowns) go through t()/tf() at the call site
// instead, since they can't be pre-rendered into the DOM once.
// ---------------------------------------------------------------------
const TRANSLATIONS = {
  en: {
    'hud.speed': 'Speed', 'unit.kn': 'kn', 'hud.leeway': 'Leeway', 'hud.amaLoad': 'Ama load', 'hud.shunt': 'Shunt',
    'hud.sheet': 'Sheet', 'hud.yard': 'Yard',
    'btn.rec': 'REC (F9)', 'btn.mark': 'Mark (F10)', 'btn.downloadRec': 'Download rec.',
    'btn.pause': 'Pause (P)', 'btn.step': 'Step (.)', 'btn.forces': 'Forces (F)', 'btn.polar': 'Polar (O)', 'btn.boat': 'Boat (B)',
    'legend.lift': 'sail lift', 'legend.drag': 'sail drag', 'legend.hullSide': 'hull side', 'legend.rudder': 'rudder',
    'capsize.title': 'CAPSIZED', 'btn.reset': 'Reset (R)',
    'h.wind': 'Wind', 'lbl.direction': 'Direction', 'lbl.strength': 'Strength',
    'h.sail': 'Sail', 'lbl.sheet': 'Sheet (szot)', 'hint.yard': '←/→ arrow keys ease/sheet',
    'lbl.brailLee': 'Brail (lee)', 'hint.brailLee': 'Q sheets in, Z eases',
    'lbl.brailWind': 'Brail (wind)', 'hint.brailWind': 'W sheets in, X eases',
    // C-B (round 10c review, ROUND10d_helm_balance.md): the windward brail
    // has two real regimes (aero.js brailRegimeBlend) — this tooltip names
    // both so the split isn't only discoverable by reading the source.
    'tooltip.brailWindZones': (pct) => `0-${pct}%: trim (carrot) — sail keeps drawing · ${pct}-100%: power dump — spills power, panic/furl`,
    'h.steering': 'Steering & trim', 'lbl.rudder': 'Rudder', 'hint.rudder': 'A/D deflect, auto-centers on release',
    'lbl.rudderUp': 'Rudder up (shipped)', 'hint.rudderUp': 'A steering oar, not a fixed rudder — usually out of the water; produces no force while shipped',
    'lbl.crewPos': 'Crew position', 'hint.crewPos': 'Drag the dot, or J/L (lateral), I/K (fore-aft)',
    'pad.ama': 'ama', 'pad.leeward': 'leeward', 'pad.aft': 'aft', 'pad.fwd': 'fwd',
    'pad.headUp': 'heading up', 'pad.bearAway': 'bearing away',
    'h.shunt': 'Shunt', 'btn.shunt': 'SHUNT (space)',
    'h.amaLoad': 'Ama load', 'hud.heel': 'Heel', 'hint.heelBar': 'Heel (centered = upright)', 'h.reset': 'Reset',
    'h.display': 'Display', 'lbl.wakeTrail': 'Wake trail (kilwater)', 'hud.luffing': 'LUFFING', 'hud.stalled': 'STALLED',
    'lbl.insetShow': 'Side-view inset', 'lbl.skin': 'Skin', 'opt.skinPjoa': 'Pjoa', 'opt.skinMicronesia': 'Micronesia',
    'tag.newBow': 'BOW', 'inset.label': 'side view (leeward)',
    'compass.hullAxis': 'hull', 'compass.cog': 'COG',
    'balance.label': 'balance (bow-on)',
    'h.polarDiagram': 'Polar diagram',
    'hint.polar': "Runs the headless polar sweep against the current config (TWS 4/6/8/10 m/s) and plots it. The boat's live (TWA, speed) point is overlaid once you return to sailing.",
    'btn.runPolar': 'Run polar', 'btn.exportCsv': 'Export CSV', 'btn.backToSailing': 'Back to sailing',
    'shunt.holdHint': 'Hold SPACE / click SHUNT to swap ends',
    'shunt.lockoutHint': (v) => `Speed lockout: ease sail first (>${v} m/s)`,
    'alarm.aback': (t) => `ABACK — ama to leeward — capsize in ${t}s`,
    'alarm.amaFlying': 'AMA FLYING',
    // H2 (round 10d, ROUND10d_helm_balance.md): pressed-but-not-yet-timing
    // warning — sail genuinely backwinded and actively pressing the ama,
    // short of the full-submersion bar that starts the real countdown.
    'alarm.abackWarning': 'ABACK WARNING — sail pressed, ama loading',
    'capsize.causeAback': 'Cause: sustained ABACK (ama to leeward too long)',
    'capsize.causeOverload': 'Cause: heel passed the point of no return (ama flying)',
    'shuntPhase.none': 'none', 'shuntPhase.ease': 'easing', 'shuntPhase.transfer': 'transfer',
    'shuntPhase.swap': 'swap', 'shuntPhase.sheet': 'sheeting in',
    'polar.running': 'Running...',
    'polar.progress': (tws, twa) => `TWS ${tws} m/s, TWA ${twa}°...`,
    'polar.done': (n) => `Done — ${n} points.`,
    'polar.placeholder': 'Run the polar sweep to see the diagram.',
    'wind.trueWindLabel': (v) => `TWS ${v} m/s`,
    'polar.twsLegend': (v) => `TWS ${v} m/s`,
    'doc.title': 'Proa Simulator — Step 2',
    'h.boatDesign': 'Boat design',
    'hint.boatDesign': 'Physical design parameters — hull, ama, sail, rudder, stability. Changes apply on "Apply" and reset the boat\'s motion state.',
    'tag.physics': 'affects physics', 'tag.graphics': 'drawing/UI only',
    'btn.applyBoat': 'Apply', 'btn.resetBoatDefaults': 'Reset to defaults',
    'h.boatPresets': 'Saved boats', 'lbl.boatName': 'Name',
    'btn.saveBoat': 'Save', 'btn.exportBoat': 'Export file', 'btn.importBoat': 'Import file',
    'lbl.boatPresetList': 'Saved', 'opt.boatPresetNone': '— select —', 'btn.deleteBoat': 'Delete',
    'boat.needName': 'Enter a name before saving.',
    'boat.saved': (name) => `Saved as "${name}".`,
    'boat.deleted': (name) => `Deleted "${name}".`,
    'boat.invalid': (msg) => `Invalid values, not applied: ${msg}`,
    'boat.applied': 'Applied — boat reset.',
    'boat.imported': (name) => `Imported "${name}".`,
    'boat.importFailed': 'Could not read that file.',
    'cat.hull': 'Hull', 'cat.ama': 'Ama', 'cat.sail': 'Sail', 'cat.crew': 'Crew',
    'cat.rudder': 'Rudder', 'cat.stability': 'Stability', 'cat.shunt': 'Shunt',
  },
  pl: {
    'hud.speed': 'Prędkość', 'unit.kn': 'w', 'hud.leeway': 'Znos', 'hud.amaLoad': 'Obc. amy', 'hud.shunt': 'Zwrot',
    'hud.sheet': 'Szot', 'hud.yard': 'Reja',
    'btn.rec': 'NAGR (F9)', 'btn.mark': 'Znacznik (F10)', 'btn.downloadRec': 'Pobierz nagranie',
    'btn.pause': 'Pauza (P)', 'btn.step': 'Krok (.)', 'btn.forces': 'Siły (F)', 'btn.polar': 'Polara (O)', 'btn.boat': 'Łódź (B)',
    'legend.lift': 'siła nośna żagla', 'legend.drag': 'opór żagla', 'legend.hullSide': 'siła boczna kadłuba', 'legend.rudder': 'ster',
    'capsize.title': 'WYWROTKA', 'btn.reset': 'Reset (R)',
    'h.wind': 'Wiatr', 'lbl.direction': 'Kierunek', 'lbl.strength': 'Siła',
    'h.sail': 'Żagiel', 'lbl.sheet': 'Szot', 'hint.yard': 'Strzałki ←/→: luzuj / wybieraj',
    'lbl.brailLee': 'Gejtawa zawietrzna', 'hint.brailLee': 'Q wybiera, Z luzuje',
    'lbl.brailWind': 'Gejtawa nawietrzna', 'hint.brailWind': 'W wybiera, X luzuje',
    'tooltip.brailWindZones': (pct) => `0-${pct}%: trym (marchewka) — żagiel dalej ciągnie · ${pct}-100%: zrzut mocy — panika/refowanie`,
    'h.steering': 'Sterowanie i wyważenie', 'lbl.rudder': 'Ster', 'hint.rudder': 'A/D wychyla ster, centruje się po puszczeniu',
    'lbl.rudderUp': 'Wiosło wyjęte', 'hint.rudderUp': 'Ster to wiosło, nie stały ster — zwykle jest wyjęte z wody; nie wytwarza wtedy żadnej siły',
    'lbl.crewPos': 'Pozycja załogi', 'hint.crewPos': 'Przeciągnij kropkę, lub J/L (bok), I/K (wzdłuż)',
    'pad.ama': 'ama', 'pad.leeward': 'zawietrzna', 'pad.aft': 'rufa', 'pad.fwd': 'dziób',
    'pad.headUp': 'Ostrzenie', 'pad.bearAway': 'Odpadanie',
    'h.shunt': 'Zwrot', 'btn.shunt': 'ZWROT (spacja)',
    'h.amaLoad': 'Obciążenie amy', 'hud.heel': 'Przechył', 'hint.heelBar': 'Przechył (środek = pion)', 'h.reset': 'Reset',
    'h.display': 'Widok', 'lbl.wakeTrail': 'Kilwater', 'hud.luffing': 'ŁOPOCZE', 'hud.stalled': 'PRZECIĄGNIĘTY',
    'lbl.insetShow': 'Widok z boku', 'lbl.skin': 'Skórka', 'opt.skinPjoa': 'Pjoa', 'opt.skinMicronesia': 'Mikronezja',
    'tag.newBow': 'DZIÓB', 'inset.label': 'widok z boku (zawietrzna)',
    'compass.hullAxis': 'kadłub', 'compass.cog': 'KNG',
    'balance.label': 'wyważenie (od dziobu)',
    'h.polarDiagram': 'Diagram polarny',
    'hint.polar': 'Uruchamia pomiar polary (bezekranowy silnik fizyki) dla bieżącej konfiguracji (TWS 4/6/8/10 m/s) i rysuje wykres. Po powrocie do żeglugi na wykresie pojawia się bieżący punkt (TWA, prędkość) łódki.',
    'btn.runPolar': 'Uruchom polarę', 'btn.exportCsv': 'Eksportuj CSV', 'btn.backToSailing': 'Powrót do żeglugi',
    'shunt.holdHint': 'Przytrzymaj SPACJĘ / kliknij ZWROT, aby zamienić końce',
    'shunt.lockoutHint': (v) => `Blokada zwrotu: najpierw wyluzuj żagiel (>${v} m/s)`,
    'alarm.aback': (t) => `ABACK — ama po zawietrznej — wywrotka za ${t}s`,
    'alarm.amaFlying': 'AMA W POWIETRZU',
    'alarm.abackWarning': 'OSTRZEŻENIE ABACK — żagiel dociska amę',
    'capsize.causeAback': 'Przyczyna: długotrwały ABACK (ama zbyt długo po zawietrznej)',
    'capsize.causeOverload': 'Przyczyna: przechył minął punkt bez powrotu (ama w powietrzu)',
    'shuntPhase.none': 'brak', 'shuntPhase.ease': 'luzowanie', 'shuntPhase.transfer': 'przenoszenie',
    'shuntPhase.swap': 'zamiana', 'shuntPhase.sheet': 'wybieranie',
    'polar.running': 'Uruchamianie...',
    'polar.progress': (tws, twa) => `TWS ${tws} m/s, TWA ${twa}°...`,
    'polar.done': (n) => `Gotowe — ${n} punktów.`,
    'polar.placeholder': 'Uruchom pomiar polary, aby zobaczyć wykres.',
    'wind.trueWindLabel': (v) => `Wiatr ${v} m/s`,
    'polar.twsLegend': (v) => `Wiatr ${v} m/s`,
    'doc.title': 'Symulator proa — Krok 2',
    'h.boatDesign': 'Charakterystyka łodzi',
    'hint.boatDesign': 'Fizyczne parametry konstrukcyjne — kadłub, ama, żagiel, ster, stateczność. Zmiany wchodzą w życie po "Zastosuj" i resetują ruch łodzi.',
    'tag.physics': 'wpływa na fizykę', 'tag.graphics': 'tylko rysunek/UI',
    'btn.applyBoat': 'Zastosuj', 'btn.resetBoatDefaults': 'Przywróć domyślne',
    'h.boatPresets': 'Zapisane łodzie', 'lbl.boatName': 'Nazwa',
    'btn.saveBoat': 'Zapisz', 'btn.exportBoat': 'Eksportuj plik', 'btn.importBoat': 'Importuj plik',
    'lbl.boatPresetList': 'Zapisane', 'opt.boatPresetNone': '— wybierz —', 'btn.deleteBoat': 'Usuń',
    'boat.needName': 'Podaj nazwę przed zapisem.',
    'boat.saved': (name) => `Zapisano jako "${name}".`,
    'boat.deleted': (name) => `Usunięto "${name}".`,
    'boat.invalid': (msg) => `Nieprawidłowe wartości, nie zastosowano: ${msg}`,
    'boat.applied': 'Zastosowano — łódź zresetowana.',
    'boat.imported': (name) => `Zaimportowano "${name}".`,
    'boat.importFailed': 'Nie udało się odczytać pliku.',
    'cat.hull': 'Kadłub', 'cat.ama': 'Ama', 'cat.sail': 'Żagiel', 'cat.crew': 'Załoga',
    'cat.rudder': 'Ster', 'cat.stability': 'Stateczność', 'cat.shunt': 'Zwrot',
  },
};

let currentLang = localStorage.getItem('proaLang') || (navigator.language?.startsWith('pl') ? 'pl' : 'en');

function t(key, ...args) {
  const entry = TRANSLATIONS[currentLang]?.[key] ?? TRANSLATIONS.en[key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLang;
  document.title = t('doc.title');
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.getAttribute('data-i18n'));
  }
  const btnLang = document.getElementById('btnLang');
  if (btnLang) btnLang.textContent = currentLang === 'en' ? 'PL' : 'EN';
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('proaLang', lang);
  applyStaticTranslations();
  updateBrailZoneUI();
  // Canvas text (drawPolarView) is baked into pixels, not DOM — re-render
  // immediately so a language switch doesn't leave stale text on screen
  // until the next natural redraw. drawPolarView is a hoisted function
  // declaration defined later in this module; polarMode/lastPolarRows are
  // module-level vars already initialized by the time this can run (only
  // reachable via the btnLang click handler, wired after full module
  // evaluation) — safe despite the forward textual reference.
  if (polarMode) drawPolarView(lastPolarRows);
  if (boatMode) buildBoatPanel();
}

let dims = createConfig(); // dimensions/limits only; the sim keeps its own internal config. Reassigned wholesale by the boat-design panel's Apply (see bottom of file) — never mutated field-by-field.
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
const heelBarWrap = document.getElementById('heelBar');
const heelNeedle = document.getElementById('heelNeedle');
const shuntHint = document.getElementById('shuntHint');
const brailWindTick = document.getElementById('brailWindTick');

const sliders = {
  windDir: document.getElementById('windDir'),
  windSpeed: document.getElementById('windSpeed'),
  sheet: document.getElementById('sheet'),
  brailLee: document.getElementById('brailLee'),
  brailWind: document.getElementById('brailWind'),
  rudder: document.getElementById('rudder'),
};
const outs = {
  windDir: document.getElementById('windDirOut'),
  windSpeed: document.getElementById('windSpeedOut'),
  sheet: document.getElementById('sheetOut'),
  brailLee: document.getElementById('brailLeeOut'),
  brailWind: document.getElementById('brailWindOut'),
  rudder: document.getElementById('rudderOut'),
  crewPos: document.getElementById('crewPosOut'),
  crewPosX: document.getElementById('crewPosXOut'),
};

// Step buttons (-/+) flanking every slider, for finer/click-based control
// alongside dragging. Reuse each slider's own min/max/step and just
// dispatch a real 'input' event, so every existing per-slider listener
// (including side effects like rudder's autoRudder=false) fires unchanged.
const stepButtons = {};
function stepInputValue(input, direction) {
  const step = Number(input.step) || 1;
  const decimals = (String(input.step).split('.')[1] || '').length;
  const min = Number(input.min), max = Number(input.max);
  const next = Math.min(max, Math.max(min, Number(input.value) + direction * step));
  input.value = next.toFixed(decimals);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
for (const key of Object.keys(sliders)) {
  const input = sliders[key];
  if (!input) continue;
  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'stepBtn';
  minus.textContent = '−';
  minus.setAttribute('aria-label', 'decrease');
  minus.addEventListener('click', () => stepInputValue(input, -1));
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'stepBtn';
  plus.textContent = '+';
  plus.setAttribute('aria-label', 'increase');
  plus.addEventListener('click', () => stepInputValue(input, 1));
  input.insertAdjacentElement('beforebegin', minus);
  input.insertAdjacentElement('afterend', plus);
  stepButtons[key] = { minus, plus };
}
const wakeTrailCheckbox = document.getElementById('wakeTrail');
const insetShowCheckbox = document.getElementById('insetShow');
const skinSelect = document.getElementById('skinSelect');
// R11-8: skin choice is pure display state (not a CONFIG/physics field —
// bolting it onto the boat-design preset mechanism, which round-trips
// createConfig() patches, would be a category error), so it persists the
// same simple way the language toggle already does: localStorage.
skinSelect.value = localStorage.getItem('proaSkin') || 'pjoa';
skinSelect.addEventListener('change', () => localStorage.setItem('proaSkin', skinSelect.value));
const rudderUpCheckbox = document.getElementById('rudderUp');
const btnRec = document.getElementById('btnRec');
const btnMark = document.getElementById('btnMark');
const btnDownloadRec = document.getElementById('btnDownloadRec');
const recStat = document.getElementById('recStat');
const recDot = document.getElementById('recDot');
const recDuration = document.getElementById('recDuration');
const recSize = document.getElementById('recSize');

// ---------------------------------------------------------------------
// Control state — the single source of truth the sim reads each frame.
// Sliders and keyboard both write into this object.
// ---------------------------------------------------------------------
// Defaults picked to land near the polar's own TWA=90/TWS=6 optimum
// (sheet~50deg, light crew ballast) instead of an arbitrary tight trim —
// starting overpowered with crewPos=0 hits the overload alarm within
// half a second, which is correct per FIX_REQUEST_step1_round2.md R2-1's
// tuning but a rough first impression for a freshly loaded page.
const controls = createDefaultControls();
controls.windDirFrom = 180 * DEG;
controls.windSpeed = 6;
controls.sheet = 50 * DEG;
controls.crewPos = 0.3;

let autoRudder = true; // keyboard rudder auto-centers when A/D released
const keys = new Set();
let shuntHeld = false;

function syncSlidersFromControls() {
  sliders.windDir.value = String(Math.round(controls.windDirFrom / DEG));
  sliders.windSpeed.value = String(controls.windSpeed);
  sliders.sheet.value = String(Math.round(controls.sheet / DEG));
  sliders.brailLee.value = String(Math.round(controls.brailLee * 100));
  sliders.brailWind.value = String(Math.round(controls.brailWind * 100));
  sliders.rudder.value = String(controls.rudder);
  updateCrewDot();
  refreshOutputs();
}

// C-B (round 10c review, ROUND10d_helm_balance.md): the brailWind slider's
// TRIM/SURVIVAL two-tone track, boundary tick, and tooltip are all read
// from CONFIG.sail.brailTrimRange (aero.js brailRegimeBlend's own split
// point) rather than hardcoded, so a boat-design change to it (or a
// language switch, for the tooltip text) stays in sync. Re-run wherever
// `dims` is (re)assigned or the language changes.
function updateBrailZoneUI() {
  const pct = Math.round(dims.sail.brailTrimRange * 100);
  sliders.brailWind.style.setProperty('--trim-pct', `${pct}%`);
  brailWindTick.style.left = `${pct}%`;
  sliders.brailWind.title = t('tooltip.brailWindZones', pct);
}

function refreshOutputs() {
  outs.windDir.textContent = `${Math.round(controls.windDirFrom / DEG)}°`;
  outs.windSpeed.textContent = controls.windSpeed.toFixed(1);
  outs.sheet.textContent = `${Math.round(controls.sheet / DEG)}°`;
  outs.brailLee.textContent = `${Math.round(controls.brailLee * 100)}%`;
  outs.brailWind.textContent = `${Math.round(controls.brailWind * 100)}%`;
  outs.rudder.textContent = controls.rudder.toFixed(2);
  outs.crewPos.textContent = controls.crewPos.toFixed(2);
  outs.crewPosX.textContent = controls.crewPosX.toFixed(2);
}

sliders.windDir.addEventListener('input', () => { controls.windDirFrom = Number(sliders.windDir.value) * DEG; refreshOutputs(); });
sliders.windSpeed.addEventListener('input', () => { controls.windSpeed = Number(sliders.windSpeed.value); refreshOutputs(); });
sliders.sheet.addEventListener('input', () => { controls.sheet = Number(sliders.sheet.value) * DEG; refreshOutputs(); });
sliders.brailLee.addEventListener('input', () => { controls.brailLee = Number(sliders.brailLee.value) / 100; refreshOutputs(); });
sliders.brailWind.addEventListener('input', () => { controls.brailWind = Number(sliders.brailWind.value) / 100; refreshOutputs(); });
sliders.rudder.addEventListener('input', () => { autoRudder = false; controls.rudder = Number(sliders.rudder.value); refreshOutputs(); });

// Crew position 2D pad: combines the old crewPos (lateral, toward the
// ama) and crewPosX (fore-aft) sliders into a single draggable dot, per
// the user's request — one point in a 2D space instead of two 1D
// sliders. Top of the pad = crew.posMax (toward the ama), bottom =
// crew.posMin (leeward); left = crew.posXMin (aft), right =
// crew.posXMax (forward) — matches the existing J/L (lateral) and I/K
// (fore-aft) keyboard convention (L/I increase, J/K decrease).
const crewPad = document.getElementById('crewPad');
const crewDot = document.getElementById('crewDot');

// Local clamp (not the module-level one below — that's declared after
// this point, and syncSlidersFromControls() already runs before it).
const clampLocal = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Pad axes (per user request): vertical = fore-aft (crewPosX, bow/dziób
// at top, stern/rufa at bottom); horizontal = lateral (crewPos, ama at
// left, leeward/zawietrzna at right). Both axes keep the same
// "high/forward-toward-ama value at the low-fraction edge" convention
// the pad always used, just swapped onto the other screen axis.
function updateCrewDot() {
  const { posMin, posMax, posXMin, posXMax } = dims.crew;
  const fracLateral = (posMax - clampLocal(controls.crewPos, posMin, posMax)) / (posMax - posMin); // 0=ama(left), 1=leeward(right)
  const fracFwdAft = (posXMax - clampLocal(controls.crewPosX, posXMin, posXMax)) / (posXMax - posXMin); // 0=bow(top), 1=stern(bottom)
  crewDot.style.left = `${fracLateral * 100}%`;
  crewDot.style.top = `${fracFwdAft * 100}%`;
}

function setCrewFromPad(clientX, clientY) {
  const rect = crewPad.getBoundingClientRect();
  const { posMin, posMax, posXMin, posXMax } = dims.crew;
  const fracLateral = clampLocal((clientX - rect.left) / rect.width, 0, 1); // 0=ama(left), 1=leeward(right)
  const fracFwdAft = clampLocal((clientY - rect.top) / rect.height, 0, 1); // 0=bow(top), 1=stern(bottom)
  controls.crewPos = posMax - fracLateral * (posMax - posMin);
  controls.crewPosX = posXMax - fracFwdAft * (posXMax - posXMin);
  updateCrewDot();
  refreshOutputs();
}

let draggingCrewPad = false;
crewPad.addEventListener('pointerdown', (e) => {
  draggingCrewPad = true;
  crewPad.setPointerCapture(e.pointerId);
  setCrewFromPad(e.clientX, e.clientY);
});
crewPad.addEventListener('pointermove', (e) => {
  if (draggingCrewPad) setCrewFromPad(e.clientX, e.clientY);
});
crewPad.addEventListener('pointerup', (e) => {
  draggingCrewPad = false;
  crewPad.releasePointerCapture(e.pointerId);
});
// Rudder up (shipped, core/rudder.js): a steering OAR's normal resting
// state is lifted clear of the water, not "centered" — while shipped it
// produces no force regardless of controls.rudder's own value. The
// slider itself is disabled while shipped (nothing for it to do), not
// reset, so re-shipping the oar resumes from wherever it was left.
rudderUpCheckbox.addEventListener('change', () => {
  controls.rudderUp = rudderUpCheckbox.checked;
  sliders.rudder.disabled = controls.rudderUp;
  stepButtons.rudder.minus.disabled = controls.rudderUp;
  stepButtons.rudder.plus.disabled = controls.rudderUp;
});

syncSlidersFromControls();
updateBrailZoneUI();

// ---------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const HANDLED_KEYS = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'KeyQ', 'KeyZ', 'KeyW', 'KeyX', 'KeyJ', 'KeyL', 'KeyI', 'KeyK', 'KeyA', 'KeyD', 'KeyP', 'Period', 'KeyF', 'KeyO', 'KeyB', 'KeyR',
  'F9', 'F10']);

// Text/number inputs (boat-name field, boat-design fields) need normal
// typing (letters, digits, arrow keys to move the cursor) — the sailing
// shortcuts below would otherwise steal keystrokes like "b" or arrow keys
// away from them.
function isTextEntryTarget(target) {
  return target instanceof HTMLInputElement && (target.type === 'text' || target.type === 'number');
}

window.addEventListener('keydown', (e) => {
  if (isTextEntryTarget(e.target)) return;
  if (HANDLED_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') shuntHeld = true;
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'Period') stepOnce = true;
  if (e.code === 'KeyF') toggleForces();
  if (e.code === 'KeyO') togglePolar();
  if (e.code === 'KeyB') toggleBoat();
  if (e.code === 'KeyR') doReset();
  if (e.code === 'F9') recToggle();
  if (e.code === 'F10') recMark(sim.getState().t);
  if (['KeyA', 'KeyD'].includes(e.code)) autoRudder = false;
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') shuntHeld = false;
  if (e.code === 'KeyA' || e.code === 'KeyD') autoRudder = true;
});

function applyContinuousKeys(dt) {
  const sheetRate = 60 * DEG; // per second
  const brailRate = 0.8; // fraction/sec
  const rudderRate = 2.2; // units/sec (-1..1 range)
  const crewRate = 0.5; // fraction/sec

  if (keys.has('ArrowRight')) controls.sheet = clamp(controls.sheet + sheetRate * dt, 0, 90 * DEG);
  if (keys.has('ArrowLeft')) controls.sheet = clamp(controls.sheet - sheetRate * dt, 0, 90 * DEG);
  if (keys.has('KeyQ')) controls.brailLee = clamp(controls.brailLee + brailRate * dt, 0, 1);
  if (keys.has('KeyZ')) controls.brailLee = clamp(controls.brailLee - brailRate * dt, 0, 1);
  if (keys.has('KeyW')) controls.brailWind = clamp(controls.brailWind + brailRate * dt, 0, 1);
  if (keys.has('KeyX')) controls.brailWind = clamp(controls.brailWind - brailRate * dt, 0, 1);
  if (keys.has('KeyJ')) controls.crewPos = clamp(controls.crewPos - crewRate * dt, dims.crew.posMin, dims.crew.posMax);
  if (keys.has('KeyL')) controls.crewPos = clamp(controls.crewPos + crewRate * dt, dims.crew.posMin, dims.crew.posMax);
  if (keys.has('KeyI')) controls.crewPosX = clamp(controls.crewPosX + crewRate * dt, dims.crew.posXMin, dims.crew.posXMax);
  if (keys.has('KeyK')) controls.crewPosX = clamp(controls.crewPosX - crewRate * dt, dims.crew.posXMin, dims.crew.posXMax);

  if (!controls.rudderUp && autoRudder) {
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
let boatMode = false;

function togglePause() { paused = !paused; document.getElementById('btnPause').classList.toggle('active', paused); }
function toggleForces() { showForces = !showForces; document.getElementById('btnForces').classList.toggle('active', showForces); }
function doReset() { recEndForReset(); sim.reset(); capsizeOverlay.classList.remove('show'); wakeReset(); stalledTimer = 0; }

document.getElementById('btnPause').addEventListener('click', togglePause);
document.getElementById('btnStep').addEventListener('click', () => { stepOnce = true; });
document.getElementById('btnForces').addEventListener('click', toggleForces);
document.getElementById('btnReset').addEventListener('click', doReset);
document.getElementById('btnResetOverlay').addEventListener('click', doReset);
document.getElementById('btnLang').addEventListener('click', () => setLang(currentLang === 'en' ? 'pl' : 'en'));
applyStaticTranslations();

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

// Version footer (bottom-right): ties a bug report/recording to an exact,
// dated build without a separate "which commit is this" round-trip — the
// same codeVersion recordings already carry (harness/replay.js), just
// visible on-screen too. Set once (not per-frame): CODE_VERSION/BUILD_TIME
// never change while the page is open.
{
  const versionInfo = document.getElementById('versionInfo');
  if (versionInfo) {
    if (CODE_VERSION === 'dev') {
      versionInfo.textContent = 'dev build';
    } else {
      const when = BUILD_TIME === 'dev' ? '' : ` · ${BUILD_TIME.replace('T', ' ').slice(0, 16)}`;
      versionInfo.textContent = `${CODE_VERSION}${when}`;
    }
  }
}

let scale = 24; // px per meter, adjustable via wheel zoom
const ZOOM_MIN = 0.6, ZOOM_MAX = 80; // ZOOM_MIN lowered 10x (was 6) per user request — max zoom-out
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  // e.deltaY's units/magnitude vary by device and OS — a single mouse
  // "notch" can arrive as one large event or as a rapid burst of many
  // small ones, and deltaMode distinguishes pixels/lines/pages. The old
  // code applied a FIXED ~8% multiplier per EVENT regardless of size, so
  // a burst of many small events (or one big coalesced one) compounded
  // into a huge jump — a single scroll gesture rocketed straight to the
  // min/max clamp, reading as "only two zoom levels" and feeling far too
  // fast. Normalize to a pixel-equivalent delta, clamp its PER-EVENT
  // magnitude so nothing can take more than a modest bite, and scale the
  // zoom factor by that magnitude so many small burst events accumulate
  // smoothly instead of each taking the old flat-rate jump.
  let delta = e.deltaY;
  if (e.deltaMode === 1) delta *= 16; // line mode: ~16px/line
  else if (e.deltaMode === 2) delta *= window.innerHeight; // page mode
  delta = clamp(delta, -100, 100);
  scale = clamp(scale * Math.pow(1.0015, -delta), ZOOM_MIN, ZOOM_MAX);
}, { passive: false });

// ---------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------
function worldToScreen(wx, wy, cam) {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  return { x: cx + (wx - cam.x) * scale * dpr, y: cy + (wy - cam.y) * scale * dpr };
}

function drawWaterGrid(cam) {
  const skin = getSkin();
  ctx.save();
  ctx.fillStyle = skin.water;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = skin.waterGrid;
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

// ---------------------------------------------------------------------
// R11-8: two skins — palette + fill styles only, geometry identical.
// Read once per draw via getSkin() (skinSelect.value is the source of
// truth, matching the wakeTrailCheckbox.checked pattern elsewhere — no
// separate mirrored state variable to keep in sync).
// ---------------------------------------------------------------------
const SKINS = {
  pjoa: {
    water: '#06121f', waterGrid: 'rgba(90,140,180,0.10)',
    hull: '#d8c9a8', hullCapsized: '#3a3a3a',
    sail: 'rgba(232,227,208,0.5)', sailStroke: '#e8e3d0',
    ama: '#c9a35a',
    lashing: null,
  },
  micronesia: {
    water: '#041a1c', waterGrid: 'rgba(90,180,160,0.10)',
    hull: '#5a4126', hullCapsized: '#2a2018',
    sail: 'rgba(196,168,110,0.55)', sailStroke: '#c4a86e',
    ama: '#4a3620',
    lashing: '#8a6a3a',
  },
};
function getSkin() { return SKINS[skinSelect.value] ?? SKINS.pjoa; }
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
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
  ctx.fillText(t('wind.trueWindLabel', controls.windSpeed.toFixed(1)), cx - 30, cy + len + 26);
  ctx.restore();
}

// R11-1 (round 11, ROUND11_proa_identity_graphics.md): live side-view
// inset — a small, collapsible profile view drawn as seen from LEEWARD
// (viewer stands to windward, so the ama sits on the FAR side of the
// hull — always drawn slightly above/behind it, a fixed 2D schematic
// convention, not a true 3D projection). Fixed screen position (top-
// right), own local origin/scale, clipped to its own rect so nothing
// leaks onto the main view. Horizontal axis = hull length (fore-aft);
// `state.end` flips which physical direction reads as "forward" in this
// snapshot, same as the main view's active-bow marker, so the picture
// mirrors correctly across a shunt instead of silently staying frozen
// to one physical side.
const INSET_W = 220, INSET_H = 140, INSET_MARGIN = 10;
function drawSideViewInset(state, forces) {
  if (!insetShowCheckbox.checked) return;
  const skin = getSkin();
  // The alarm banner is a full-width DOM bar overlaying the canvas, so it
  // always wins the stacking order and used to paint straight over this
  // panel — exactly when the boat is in trouble and the side view is worth
  // most. Rather than shrink the alarm (it is deliberately loud), drop the
  // inset below it. offsetHeight is 0 while the banner is hidden, so this
  // costs nothing in the normal case, and reading it keeps the two in step
  // if the banner's padding or font ever changes. The *dpr converts the
  // banner's CSS pixels into the raw canvas pixels this panel is laid out
  // in (see resize(): canvas.width is already scaled by dpr).
  const ox = canvas.width - INSET_W - INSET_MARGIN;
  const oy = INSET_MARGIN + banner.offsetHeight * dpr;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, INSET_W, INSET_H);
  ctx.clip();

  // Panel background + waterline (a gentle, time-based bob — 2-3px is
  // "enough" per the spec, not a real wave model).
  ctx.fillStyle = 'rgba(6,18,31,0.82)';
  ctx.fillRect(ox, oy, INSET_W, INSET_H);
  // Waterline lowered (0.62 -> 0.76) to make headroom for the taller
  // yard/mast combo above — the sail dominates the frame the same way it
  // does in every reference photo, hull low in the picture.
  const waterY = oy + INSET_H * 0.76 + Math.sin(performance.now() / 700) * 2;
  ctx.strokeStyle = 'rgba(120,180,220,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(ox, waterY); ctx.lineTo(ox + INSET_W, waterY); ctx.stroke();
  ctx.fillStyle = 'rgba(6,30,45,0.6)';
  ctx.fillRect(ox, waterY, INSET_W, oy + INSET_H - waterY);

  // Local frame: origin at the hull's on-deck pivot, +x toward the
  // CURRENT active bow (state.end flips the sign, matching the main
  // view's own active-bow convention), +y DOWN screen-wise, rotated by
  // phi so "the whole assembly rotates by phi" (R11-1's own wording).
  // The local origin sits ORIGIN_ABOVE_WATER px above the waterline, so in
  // local coords the water surface is at y = +ORIGIN_ABOVE_WATER — named
  // rather than repeated, since the droplet cue below has to land on it.
  const ORIGIN_ABOVE_WATER = 6;
  const originX = ox + INSET_W / 2, originY = waterY - ORIGIN_ABOVE_WATER;
  const fwd = state.end === 1 ? 1 : -1;
  ctx.translate(originX, originY);
  ctx.rotate(-state.phi); // screen y is down, so -phi banks the same way phi heels the boat

  // Fixed schematic pixel budget (not a literal to-scale projection —
  // this is a small identity cue, not a measuring tool): sized to fill
  // the ~220x140 inset legibly regardless of the boat's own real
  // dimensions, same spirit as the rest of this stylized side view.
  const halfLpx = 62;

  // Ama: on the far side from this leeward viewpoint, so it is drawn FIRST
  // and the hull then occludes its lower half — a depth cue that reads
  // correctly instead of the float appearing to float in front of the
  // canoe. Never mirrored by `end` (the ama is bolted to one physical side
  // and does not relocate at a shunt — same invariant core/state.js
  // documents). At rest it tucks down behind the hull; phi>=0 (flying)
  // lifts it clear with a droplet cue; phi<0 (pressed) dips it with spray.
  // Kept BELOW the sail's own footprint on purpose: skin.sail is
  // semi-transparent, so anything drawn under the cloth shows through it.
  const amaLoad = clamp(forces?.amaLoadDisplay ?? 0, 0, 1.5) / 1.5;
  const amaBaseY = -17;
  const amaLiftPx = state.phi >= 0 ? 4 + 8 * amaLoad : -4 * amaLoad;
  ctx.save();
  // Kept deliberately faint: it is the FAR-side float seen past the rig, so it
  // should read as depth behind the sail, never as a hard band across it.
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = skin.ama;
  ctx.beginPath();
  ctx.ellipse(0, amaBaseY - amaLiftPx, 19, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (state.phi >= 0 && amaLoad > 0.1) {
    // Flying: droplets falling away below the lifted ama, back down to the
    // waterline. The span is the DISTANCE from the ama down to the water
    // (local +ORIGIN_ABOVE_WATER), so it must be positive; it was previously
    // computed as `amaY - 4`, which is negative here and sent the droplets
    // climbing up off the top of the panel instead of falling.
    ctx.fillStyle = 'rgba(150,210,255,0.7)';
    const amaY = amaBaseY - amaLiftPx;
    const fallSpan = ORIGIN_ABOVE_WATER - amaY;
    for (let i = 0; i < 3; i++) {
      const dropT = (performance.now() / 260 + i * 0.33) % 1;
      ctx.beginPath();
      ctx.arc(-14 + i * 14, amaY + dropT * fallSpan, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (state.phi < 0 && amaLoad > 0.1) {
    // Pressed: a spray cue at the waterline below the ama.
    ctx.strokeStyle = 'rgba(220,240,255,0.75)'; ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 12, amaBaseY - amaLiftPx + 6);
      ctx.lineTo(i * 12 + i * 4, amaBaseY - amaLiftPx - 8);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Hull silhouette, drawn OVER the ama: a double-ended canoe, both ends
  // IDENTICAL and swept up into short stem posts, since a proa has no bow
  // or stern (the same invariant core/state.js documents and the main
  // view's active-bow marker exists to communicate). Symmetric about x, so
  // a shunt cannot change the profile — only which end the sail and crew
  // sit toward.
  ctx.fillStyle = state.capsized ? skin.hullCapsized : skin.hull;
  const stemRise = 7, hullDepth = 11;
  ctx.beginPath();
  ctx.moveTo(-halfLpx, -stemRise);
  ctx.quadraticCurveTo(-halfLpx * 0.55, -2, 0, -1.5);
  ctx.quadraticCurveTo(halfLpx * 0.55, -2, halfLpx, -stemRise);
  ctx.lineTo(halfLpx - 3, -stemRise + 2);
  ctx.quadraticCurveTo(halfLpx * 0.5, hullDepth, 0, hullDepth);
  ctx.quadraticCurveTo(-halfLpx * 0.5, hullDepth, -halfLpx + 3, -stemRise + 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = skin.lashing ?? '#5a4a38';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-halfLpx, -stemRise); ctx.lineTo(-halfLpx - 2, -stemRise - 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(halfLpx, -stemRise); ctx.lineTo(halfLpx + 2, -stemRise - 5); ctx.stroke();

  // Crab-claw sail, geometry per the ethnographic description of the
  // Oceanic lateen (Wikipedia / HandWiki "crab claw sail"): the spars are
  // CURVED, so the two edges running along them are CONVEX, while the free
  // LEECH spanning the two spar tips is deeply CONCAVE. That scooped
  // trailing edge between two outward-bowed spars is what actually makes
  // the claw/pincer silhouette — earlier revisions had it inverted
  // (concave luff, convex leech) and compensated with bare spar tips
  // poking past the cloth; both the inversion and the bare-tip trick are
  // gone, the shape now carries itself. The two spars are near equal
  // length (an isosceles triangle), radiating from a low tack, with a
  // short mast meeting the yard around its midpoint rather than at the
  // tack. Brail state shrinks the whole rig toward the mast, ending in a
  // small lashed bundle at full furl; `deltaAbs` (the actual yard swing)
  // opens the claw wider as the sheet is eased (a side view can't show
  // the top view's port/starboard swing, only how far open the claw is).
  const maxBrail = Math.max(controls.brailLee, controls.brailWind);
  const furled = controls.brailLee > 0.97 && controls.brailWind > 0.97;
  const deltaAbs = Math.abs(state.delta ?? 0);
  const openFrac = clamp(deltaAbs / (80 * DEG), 0, 1);
  const reach = (1 - 0.55 * maxBrail) * 86; // overall rig size, fitted to the inset's headroom
  const tackX = fwd * halfLpx * 0.46, tackY = -9;
  const yardDeg = 66 + 5 * openFrac;  // steep upper spar
  const boomDeg = 20 + 9 * openFrac;  // shallower lower spar, opens with the sheet
  const yardLen = reach, boomLen = reach * 0.92;
  const yardTipX = tackX - fwd * yardLen * Math.cos(yardDeg * DEG);
  const yardTipY = tackY - yardLen * Math.sin(yardDeg * DEG);
  const boomTipX = tackX - fwd * boomLen * Math.cos(boomDeg * DEG);
  const boomTipY = tackY - boomLen * Math.sin(boomDeg * DEG);
  // Each spar bows OUTWARD: offset the curve's control point along the
  // edge normal, away from the sail's own interior (the triangle centroid).
  const cgX = (tackX + yardTipX + boomTipX) / 3, cgY = (tackY + yardTipY + boomTipY) / 3;
  const bowOut = (ax, ay, bx, by, amt) => {
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    let nx = -(by - ay), ny = bx - ax;
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    if ((mx + nx - cgX) ** 2 + (my + ny - cgY) ** 2 < (mx - cgX) ** 2 + (my - cgY) ** 2) { nx = -nx; ny = -ny; }
    return [mx + nx * amt, my + ny * amt];
  };
  const [yardCtrlX, yardCtrlY] = bowOut(tackX, tackY, yardTipX, yardTipY, reach * 0.04);
  const [boomCtrlX, boomCtrlY] = bowOut(tackX, tackY, boomTipX, boomTipY, reach * 0.035);
  // Concave leech: control point hauled back in toward the tack.
  const leechMidX = (yardTipX + boomTipX) / 2, leechMidY = (yardTipY + boomTipY) / 2;
  const leechCtrlX = leechMidX + (tackX - leechMidX) * 0.18;
  const leechCtrlY = leechMidY + (tackY - leechMidY) * 0.18;
  // Short mast, meeting the yard at ~45% of its length.
  const mastX = fwd * halfLpx * 0.10;
  const mastHeadX = tackX + (yardTipX - tackX) * 0.45;
  const mastHeadY = tackY + (yardTipY - tackY) * 0.45;
  ctx.strokeStyle = skin.lashing ?? '#5a4a38'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(mastX, 0); ctx.lineTo(mastHeadX, mastHeadY); ctx.stroke();

  if (furled) {
    ctx.strokeStyle = skin.lashing ?? '#8a8060'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(mastHeadX, mastHeadY * 0.35); ctx.lineTo(mastHeadX, mastHeadY * 0.95); ctx.stroke();
  } else {
    // Cloth: convex along both spars, concave along the leech, reaching
    // all the way to the tips.
    ctx.beginPath();
    ctx.moveTo(tackX, tackY);
    ctx.quadraticCurveTo(yardCtrlX, yardCtrlY, yardTipX, yardTipY);
    ctx.quadraticCurveTo(leechCtrlX, leechCtrlY, boomTipX, boomTipY);
    ctx.quadraticCurveTo(boomCtrlX, boomCtrlY, tackX, tackY);
    ctx.closePath();
    ctx.fillStyle = skin.sail;
    ctx.fill();
    ctx.strokeStyle = skin.sailStroke; ctx.lineWidth = 1;
    ctx.stroke();
    // The spars themselves, laid along the two convex edges.
    ctx.strokeStyle = skin.lashing ?? '#5a4a38'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tackX, tackY); ctx.quadraticCurveTo(yardCtrlX, yardCtrlY, yardTipX, yardTipY); ctx.stroke();
    // The yard runs on a little past the head of the cloth — a short bare
    // spar tip stands clearly above the peak in the FOLK render. Continued
    // along the curve's end tangent so it reads as one spar, not a kink.
    const yTanX = yardTipX - yardCtrlX, yTanY = yardTipY - yardCtrlY;
    const yTanLen = Math.hypot(yTanX, yTanY) || 1;
    ctx.beginPath();
    ctx.moveTo(yardTipX, yardTipY);
    ctx.lineTo(yardTipX + (yTanX / yTanLen) * reach * 0.07, yardTipY + (yTanY / yTanLen) * reach * 0.07);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tackX, tackY); ctx.quadraticCurveTo(boomCtrlX, boomCtrlY, boomTipX, boomTipY); ctx.stroke();
  }

  // Crew figures at (crewPos, crewPosX): fore-aft position along the deck
  // from crewPosX (flipped by `fwd`, matching the mast above); crewPos
  // (lateral, toward the ama) has no depth axis in a profile view, so it
  // reads as a vertical lean toward/away from the ama side instead —
  // toward the ama (crewPos>0, normally windward-side ballast) draws the
  // figure standing tall on the rail; away from it (crewPos<0) draws them
  // crouched low, leaning OUT with the heel, same posture a real crew
  // takes to counterbalance.
  // Offset the deck-position ZERO point away from the mast cluster
  // (crewPosX=0 would otherwise land right on top of the mast line,
  // where it's easy to lose against the sail/ama) — a purely cosmetic
  // shift, same halfLpx*0.7 excursion range either side of it.
  const crewDeckX = fwd * (halfLpx * 0.4 + clamp(controls.crewPosX, dims.crew.posXMin, dims.crew.posXMax) * halfLpx * 0.5);
  const crewLean = clamp(controls.crewPos, dims.crew.posMin, dims.crew.posMax);
  const crewHeadY = -18 - 10 * Math.max(0, crewLean);
  ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(crewDeckX, -2); ctx.lineTo(crewDeckX, crewHeadY); ctx.stroke();
  ctx.fillStyle = '#ffe08a'; ctx.strokeStyle = '#3a2f22'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(crewDeckX, crewHeadY - 4, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  ctx.restore(); // undo translate/rotate/clip

  ctx.save();
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = '#9fb4c8';
  ctx.fillText(t('inset.label'), ox + 6, oy + 12);
  ctx.restore();
}

// R11-3 (round 11, ROUND11_proa_identity_graphics.md): shunt narrative —
// three fixed-screen-position overlays proving "the hull does not turn":
// a 4-icon phase strip, a hull-axis-vs-course-over-ground compass ribbon,
// and a brief BOW/DZIOB callout at the newly active end.
const SHUNT_PHASE_ORDER = ['ease', 'transfer', 'swap', 'sheet'];

function drawShuntPhaseStrip(state) {
  const idx = SHUNT_PHASE_ORDER.indexOf(state.shunt.phase);
  if (idx < 0) return; // 'none' — no shunt in progress, nothing to show
  const cx = canvas.width / 2, y = 30, gap = 46;
  const startX = cx - gap * 1.5;
  ctx.save();
  for (let i = 0; i < SHUNT_PHASE_ORDER.length; i++) {
    const x = startX + i * gap;
    if (i > 0) {
      ctx.strokeStyle = i <= idx ? 'rgba(127,199,255,0.6)' : 'rgba(159,180,200,0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - gap + 9, y); ctx.lineTo(x - 9, y); ctx.stroke();
    }
    const active = i === idx;
    ctx.beginPath();
    ctx.arc(x, y, active ? 9 : 6, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#ffb84d' : i < idx ? '#7fc7ff' : 'rgba(159,180,200,0.25)';
    ctx.fill();
  }
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb84d';
  ctx.fillText(t(`shuntPhase.${state.shunt.phase}`), cx, y + 24);
  ctx.textAlign = 'start';
  ctx.restore();
}

// Compass ribbon — always visible, not just during a shunt (a real
// hull-axis-vs-COG comparison is a useful proa reading generally, and
// gating it on shunt.phase would hide the "hull axis holds still while
// COG reverses" story right as it's happening on the FIRST frame after
// 'swap' completes and phase moves on to 'sheet'). Hull axis (the
// PHYSICAL hull's own heading, independent of which tip is currently
// labeled bow — same formula as R11-1/R11-2's `fwd`/amaWorldPos) sits
// fixed at the ribbon's center by construction (it IS the reference
// angle); course-over-ground is plotted relative to it, so a clean
// shunt visibly sweeps the COG marker across while the hull-axis marker
// never moves at all.
function drawCompassRibbon(state) {
  const physicalHeading = state.heading + (state.end === 1 ? 0 : Math.PI);
  const boatWx = state.u * Math.cos(state.heading) - state.v * Math.sin(state.heading);
  const boatWy = state.u * Math.sin(state.heading) + state.v * Math.cos(state.heading);
  const speed = Math.hypot(boatWx, boatWy);
  const cogHeading = speed > 0.05 ? Math.atan2(boatWy, boatWx) : physicalHeading;
  const relDeg = normalizeAngle(cogHeading - physicalHeading) / DEG; // -180..180, hull axis at 0

  const cx = canvas.width / 2, y = 66, w = 180;
  ctx.save();
  ctx.strokeStyle = 'rgba(159,180,200,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx + w / 2, y); ctx.stroke();
  ctx.fillStyle = '#7a5a3a';
  ctx.beginPath(); ctx.moveTo(cx, y - 7); ctx.lineTo(cx - 5, y + 5); ctx.lineTo(cx + 5, y + 5); ctx.closePath(); ctx.fill();
  const cogX = cx + clamp(relDeg / 180, -1, 1) * (w / 2);
  ctx.fillStyle = '#7fd0ff';
  ctx.beginPath(); ctx.arc(cogX, y, 4, 0, Math.PI * 2); ctx.fill();
  ctx.font = '9px system-ui, sans-serif'; ctx.fillStyle = '#9fb4c8'; ctx.textAlign = 'center';
  ctx.fillText(t('compass.hullAxis'), cx, y + 18);
  ctx.fillText(t('compass.cog'), cogX, y - 10);
  ctx.textAlign = 'start';
  ctx.restore();
}

function drawBowCallout(state, cam, now) {
  if (now >= bowCalloutUntil) return;
  const halfL = dims.hull.length / 2;
  const wx = state.x + halfL * Math.cos(state.heading), wy = state.y + halfL * Math.sin(state.heading);
  const p = worldToScreen(wx, wy, cam);
  ctx.save();
  ctx.globalAlpha = clamp((bowCalloutUntil - now) / 400, 0, 1); // fade out over the last 400ms
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff8a3d';
  ctx.fillText(t('tag.newBow'), p.x, p.y - 20);
  ctx.textAlign = 'start';
  ctx.restore();
}

function drawShuntNarrative(state, cam, now) {
  drawShuntPhaseStrip(state);
  drawCompassRibbon(state);
  drawBowCallout(state, cam, now);
}

// R11-4 (round 11, ROUND11_proa_identity_graphics.md): balance cross-
// section widget — a schematic transverse (bow-on) view: hull, ama,
// crew, and the two moments actually fighting each other every frame
// (breakdown.roll.Msail, the sail's own heeling contribution, vs
// breakdown.roll.Mrestore, the ama's righting response — both already
// computed every step by core/integrator.js, no new physics needed).
// Local +x = toward the ama (a fixed physical direction, matches the
// side inset's own convention); the whole group rotates by phi
// (ctx.rotate(-phi): canvas y is down, so this is the rotation sense
// that lifts +x/the ama as phi increases, matching state.js's own
// "positive phi = the ama side rising" convention).
const BAL_W = 210, BAL_H = 130, BAL_MARGIN = 10;
function drawBalanceWidget(state, forces) {
  const ox = BAL_MARGIN, oy = canvas.height - BAL_H - BAL_MARGIN;
  const skin = getSkin();
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, BAL_W, BAL_H); ctx.clip();

  // Warning tint synced to the SAME states the banner/heel-bar already
  // use (heelBarWrap's own warn/danger toggle, updateAlarms) — read, not
  // duplicated: amaLoadDisplay>0.75 for warn, >1.0 or a live abackTimer
  // for danger.
  const amaLoad = forces.amaLoadDisplay ?? 0;
  const danger = amaLoad > 1.0 || state.abackTimer > 0;
  const warn = !danger && amaLoad > 0.75;
  ctx.fillStyle = 'rgba(6,18,31,0.82)'; ctx.fillRect(ox, oy, BAL_W, BAL_H);
  if (danger) { ctx.fillStyle = 'rgba(216,79,79,0.18)'; ctx.fillRect(ox, oy, BAL_W, BAL_H); }
  else if (warn) { ctx.fillStyle = 'rgba(216,165,42,0.15)'; ctx.fillRect(ox, oy, BAL_W, BAL_H); }

  const cx = ox + BAL_W / 2, cy = oy + BAL_H * 0.66;
  ctx.strokeStyle = 'rgba(120,180,220,0.5)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(ox, cy); ctx.lineTo(ox + BAL_W, cy); ctx.stroke();

  const halfBeamPx = 55, ceHeightPx = 60;
  ctx.save();
  // The assembly is strongly asymmetric (hull at 0, platform and ama out to
  // +halfBeamPx), so nudge it left to keep the drawn boat centred in the
  // panel rather than crowding the right edge.
  ctx.translate(cx - halfBeamPx * 0.42, cy);
  ctx.rotate(-state.phi);

  // Transverse proportions are DERIVED from the config rather than eyeballed:
  // halfBeamPx stands for ama.spacing, so one px-per-metre scale sets
  // everything else and the picture follows the boat-design panel instead of
  // drifting from it. This matters because a Pjoa's vaka is genuinely
  // extreme — 5.5 m long on a 0.45 m beam, and only ~1/5.5 of the outrigger
  // gap — so a hull drawn anywhere near as wide as the platform misreads the
  // boat completely (reference: Pjoa Puch, Kowalski/Ostrowski 2018).
  const pxPerM = halfBeamPx / (dims.ama.spacing || 2.5);
  const hullHalfW = Math.max(4, ((dims.hull.beam || 0.45) * pxPerM) / 2);
  const deckY = -16, keelY = 7;

  // The platform: a flat, straight slatted deck spanning hull to ama and
  // overhanging both — on the real boat it is the widest thing in the
  // transverse view by far, and it is what the crew actually stands on.
  const platX0 = -hullHalfW - 12, platX1 = halfBeamPx + 11;
  ctx.fillStyle = state.capsized ? skin.hullCapsized : skin.hull;
  ctx.fillRect(platX0, deckY - 2, platX1 - platX0, 4);
  ctx.strokeStyle = skin.lashing ?? 'rgba(90,74,56,0.55)';
  ctx.lineWidth = 0.8;
  for (let sx = platX0 + 4; sx < platX1; sx += 5) {
    ctx.beginPath(); ctx.moveTo(sx, deckY - 2); ctx.lineTo(sx, deckY + 2); ctx.stroke();
  }
  // The ama hangs off the platform on short X-braced wooden trestles — the
  // most distinctive piece of structure in the FOLK render, and quite unlike
  // the single swept beam a Pacific va'a uses. Drawn as one crossed pair
  // (there are two, spaced fore-and-aft, but at this size they would overlap
  // into mush).
  ctx.strokeStyle = skin.lashing ?? '#7a5a3a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  const trHalf = 6, trTop = deckY + 2, trBot = -6; // trBot tracks amaTopY below
  ctx.beginPath();
  ctx.moveTo(halfBeamPx - trHalf, trTop); ctx.lineTo(halfBeamPx + trHalf, trBot);
  ctx.moveTo(halfBeamPx + trHalf, trTop); ctx.lineTo(halfBeamPx - trHalf, trBot);
  ctx.stroke();

  // Main hull: a narrow HARD-CHINE section — flared straight topsides meeting
  // a narrow flat bottom. That is what the plan sheet's sections show, and it
  // follows from the build: stitch-and-glue plywood panels, not a carved
  // round bilge (PJOA_FOLK plany, "Widoki i przekroje").
  ctx.fillStyle = state.capsized ? skin.hullCapsized : skin.hull;
  ctx.beginPath();
  ctx.moveTo(-hullHalfW, deckY);
  ctx.lineTo(-hullHalfW * 0.42, keelY);
  ctx.lineTo(hullHalfW * 0.42, keelY);
  ctx.lineTo(hullHalfW, deckY);
  ctx.closePath();
  ctx.fill();

  // Ama: FLOATS, it does not swim. core/hydro.js's amaDrag sets
  // restingImmersion = 0.3, so roughly a third of its section sits below the
  // waterline (local y = 0) at rest; heel then lifts or buries it bodily via
  // the phi rotation this whole group is drawn under.
  // The ama is a SHALLOW crescent float, not a deep pointed hull — wide and
  // flat in section, riding on the surface rather than knifing into it.
  const amaTopY = -6, amaBotY = 3; // ~3/9 of the depth wet, matching restingImmersion
  ctx.fillStyle = skin.ama;
  ctx.beginPath();
  ctx.moveTo(halfBeamPx - 9, amaTopY);
  ctx.lineTo(halfBeamPx - 5, amaBotY);
  ctx.lineTo(halfBeamPx + 5, amaBotY);
  ctx.lineTo(halfBeamPx + 9, amaTopY);
  ctx.closePath();
  ctx.fill();

  // Mast (CE height marker), raked toward the ama as on a shunting proa,
  // with the crab claw seen nearly edge-on: a narrow foreshortened sliver
  // leaning to leeward. Bow-on is the one view where the rig reads as a
  // thin blade rather than a claw, so it is drawn as such deliberately.
  const mastHeadX = 5, mastHeadY = -ceHeightPx;
  ctx.strokeStyle = skin.lashing ?? '#5a4a38'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-1, deckY); ctx.lineTo(mastHeadX, mastHeadY); ctx.stroke();
  const yardTipBX = -16, yardTipBY = mastHeadY + 7;
  ctx.beginPath();
  ctx.moveTo(-2, deckY + 1);
  ctx.quadraticCurveTo(-13, -36, yardTipBX, yardTipBY);
  ctx.quadraticCurveTo(-3, -37, -2, -14);
  ctx.closePath();
  ctx.fillStyle = skin.sail;
  ctx.fill();
  ctx.strokeStyle = skin.sailStroke; ctx.lineWidth = 0.8;
  ctx.stroke();
  // The yard itself along the sail's leading edge, so the rig reads as
  // spar-and-cloth rather than a bare leaf shape.
  ctx.strokeStyle = skin.lashing ?? '#5a4a38'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-2, deckY + 1); ctx.quadraticCurveTo(-16, -38, yardTipBX, yardTipBY);
  ctx.stroke();

  // Sail-force arrow at CE height: Msail>0 drives phi positive (ama
  // rising), which is a push AWAY from the ama (-x) at the CE — the
  // arrow direction is the opposite sign of Msail; magnitude log-
  // softened, same soften() shape drawBoat() already uses for the main
  // force-vector overlay, independently re-derived here (a display-only
  // helper, not worth threading through as a shared export for one use).
  const Msail = forces.breakdown?.roll?.Msail ?? 0;
  const Mrestore = forces.breakdown?.roll?.Mrestore ?? 0;
  const softenMoment = (n) => Math.sign(n) * Math.log10(1 + Math.abs(n)) * 5;
  const sailArrowLen = -Math.sign(Msail) * softenMoment(Msail);
  drawArrow(0, -ceHeightPx, sailArrowLen, -ceHeightPx, '#ffd23f', 2.5);

  // Righting arrow at the ama: Mrestore uses the SAME sign convention as
  // Msail (a positive contribution drives phi positive/+x, same as the
  // roll ODE's own Mroll = Msail+Mrestore+... sum, core/integrator.js) —
  // so, unlike the sail arrow above, no extra sign flip is needed here,
  // it's drawn exactly as computed.
  const restoreArrowLen = softenMoment(Mrestore);
  drawArrow(halfBeamPx, -2, halfBeamPx + restoreArrowLen, -2, '#7fe3a3', 2.5);

  // Crew figure at crewPos (lateral, toward the ama — matches this
  // widget's own +x convention directly, no end factor: crewPos is
  // already a physical-frame quantity, see core/state.js Conventions).
  const crewX = clamp(controls.crewPos, dims.crew.posMin, dims.crew.posMax) * halfBeamPx * 0.9;
  ctx.fillStyle = '#ffe08a'; ctx.strokeStyle = '#3a2f22'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(crewX, deckY - 2); ctx.lineTo(crewX, deckY - 17); ctx.stroke();
  ctx.beginPath(); ctx.arc(crewX, deckY - 21, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  ctx.restore();

  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = '#9fb4c8';
  ctx.fillText(t('balance.label'), ox + 6, oy + 12);
  ctx.restore();
}

// Sail shape: an arc from the tack (near centerline) to the clew (swept to
// leeward by the ACTUAL yard angle, state.delta — P4.1: this is a real,
// dynamic piece of state now, not the commanded sheet), curvature/fill
// communicating brail state. Purely a drawing model — the physics only
// needs delta and the brail fractions. `end` (state.end) picks which side
// is leeward: the yard trims opposite the ama, i.e. the -end side, not
// always -y (FIX_REQUEST_round3_worldframe.md R3-1 — this is drawn in the
// same active-bow frame core/aero.js's chord angle lives in, so it has to
// mirror the same way aero.js now does).
function sailPath(yardLen, deltaAbs, brailLee, brailWind, end, sailFx, sailFy) {
  const tackX = 0.35 * yardLen; // slightly forward of the mast step, anchored regardless of brail
  const furled = brailLee > 0.97 && brailWind > 0.97;
  if (furled) return { tackX, clewX: tackX + 0.15, clewY: -0.15 * end, furled: true };

  // Brails gather the sail UP TOWARD THE YARD (toward the tack, in this
  // top-down projection) as they tighten — the visible chord SHORTENS, not
  // just flattens, ending in the thin furled bundle above once both brails
  // reach 1 (FIX_REQUEST_round3_worldframe.md R3-3: a "carrot", not a
  // same-length flatter arc).
  const maxBrail = Math.max(brailLee, brailWind);
  const chordLen = yardLen * (1 - 0.6 * maxBrail);
  const clewX = tackX - chordLen * Math.cos(deltaAbs);
  const clewY = -end * chordLen * Math.sin(deltaAbs); // leeward = -end side
  // Camber bulge: leeward brail flattens it, windward brail over-curves it.
  const camber = clamp(0.28 * (1 - brailLee) + 0.22 * brailWind, 0.02, 0.5);
  const midX = (tackX + clewX) / 2;
  const midY = (0 + clewY) / 2;
  // Perpendicular to the chord, pointing away from the ama by default
  // (FIX_REQUEST_round4_roll_dof.md 2.1): a fixed +90deg rotation of the
  // (end-aware) chord vector is only correct at end=+1 — at end=-1 it
  // doesn't flip with the chord (the chord's y-component negates with end,
  // but a raw (-dy,dx) rotation doesn't), so the belly bulged toward the
  // ama/windward after a shunt. Multiplying by `end` mirrors it the same
  // way the chord itself mirrors.
  // Round 8.1 fix: the belly must follow the ACTUAL sail force (sailFx/
  // sailFy, the same values the force-vector overlay already draws), not
  // aero.js's raw signed `alpha`. `alpha`'s SIGN is entangled with `end`
  // (chordAngle = end*delta, mirrored at every shunt for bookkeeping
  // reasons unrelated to which face the wind presses on — see aero.js's
  // header comment), so an earlier version that flipped the belly on
  // `alpha<0` got the right answer only by coincidence when `end` was
  // unchanged (e.g. a genuine backwind slam) and the WRONG answer whenever
  // a shunt flipped `end` on an otherwise perfectly ordinary, driving
  // trim (reported: "po zwrocie żagiel jest wizualizowany w złą stronę") —
  // verified against both a real post-shunt trim and scenarioBackwindSlam.
  // Fix: compute the default "away from the ama" normal, then flip it only
  // if that guess actually opposes the real force vector (dot product
  // negative) — physically, the sail bellies in the direction its own net
  // aerodynamic force pushes it, which is exactly what Fx/Fy already say.
  const baseNx = -clewY * end, baseNy = (clewX - tackX) * end;
  const forceSign = (baseNx * sailFx + baseNy * sailFy) >= 0 ? 1 : -1;
  const nx = baseNx * forceSign, ny = baseNy * forceSign;
  const nlen = Math.hypot(nx, ny) || 1;
  const bulge = camber * chordLen;
  const ctrlX = midX + (nx / nlen) * bulge;
  const ctrlY = midY + (ny / nlen) * bulge;
  return { tackX, clewX, clewY, ctrlX, ctrlY, furled: false };
}

function drawBoat(state, forces, cam) {
  const boatScreen = worldToScreen(state.x, state.y, cam);
  const px = scale * dpr;
  ctx.save();
  ctx.translate(boatScreen.x, boatScreen.y);
  ctx.rotate(state.heading); // active-bow frame: sail, force vectors and the
  ctx.scale(px, px);         // apparent-wind arrow below are drawn here unchanged

  const L = dims.hull.length, halfL = L / 2;
  const beam = dims.hull.beam;
  const spacing = dims.ama.spacing, amaLen = dims.ama.length;
  const capsized = state.capsized;
  const skin = getSkin(); // R11-8: palette + fill styles only, geometry below is identical either way

  // Physical hull (crossbeams, ama, hull outline, crew): drawn in the
  // PHYSICAL frame, which differs from the active-bow frame above by
  // exactly 0 or PI (state.end) — an extra local rotation that jumps by PI
  // at the exact same instant state.heading itself jumps at a shunt, so the
  // two cancel and the sprite never visually spins (FIX_REQUEST_round3_worldframe.md
  // R3-5). All coordinates below are physical/hull-fixed and need no
  // state.end factor of their own — the ama, in particular, is bolted to
  // one physical side and stays at physical +y always (R3-1).
  ctx.save();
  ctx.rotate(state.end === 1 ? 0 : Math.PI);

  // Crossbeams (hull centerline to ama)
  ctx.strokeStyle = capsized ? '#5a4030' : '#7a5a3a';
  ctx.lineWidth = 0.05;
  [-halfL * 0.35, halfL * 0.35].forEach((bx) => {
    ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, spacing); ctx.stroke();
    // R11-8 Micronesia skin: visible beam lashings — a few short cross-
    // ticks wound around each crossbeam, absent on the Pjoa skin
    // (skin.lashing is null there; geometry is otherwise identical).
    if (skin.lashing) {
      ctx.strokeStyle = skin.lashing; ctx.lineWidth = 0.03;
      for (let s = 0.15; s < spacing; s += spacing / 4) {
        ctx.beginPath(); ctx.moveTo(bx - 0.06, s); ctx.lineTo(bx + 0.06, s + 0.03); ctx.stroke();
      }
      ctx.strokeStyle = capsized ? '#5a4030' : '#7a5a3a'; ctx.lineWidth = 0.05;
    }
  });

  // Ama — physical, fixed to the hull structure, always at physical +y.
  // Immersion reflects amaLoad's sign (FIX_REQUEST_round4_roll_dof.md
  // 2.3): thinning/ghosting as it flies clear of the water (phi>0, ama
  // load approaching/past 1), a darker fill + wider wake ring when
  // pressed under (phi<0).
  const amaLoad = forces?.amaLoadDisplay ?? 0;
  const flying = state.phi >= 0;
  const loadFrac = clamp(amaLoad, 0, 1.5) / 1.5;
  const amaRgb = hexToRgb(skin.ama);
  ctx.save();
  if (flying) {
    ctx.globalAlpha = capsized ? 0.5 : 1 - 0.6 * loadFrac; // thins out as it lifts clear
    ctx.fillStyle = capsized ? skin.hullCapsized : skin.ama;
  } else {
    ctx.globalAlpha = capsized ? 0.5 : 1;
    // Darkens toward a wet/pressed tone as it's forced under.
    ctx.fillStyle = capsized ? skin.hullCapsized
      : `rgb(${amaRgb.r - 90 * loadFrac}, ${amaRgb.g - 90 * loadFrac}, ${amaRgb.b - 30 * loadFrac})`;
  }
  if (!flying && !capsized && loadFrac > 0.15) {
    // Wake ring around a pressed ama.
    ctx.strokeStyle = `rgba(120,180,220,${0.15 + 0.35 * loadFrac})`;
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.ellipse(0, spacing, amaLen / 2 + 0.15 + 0.3 * loadFrac, beam * 0.6 + 0.1 + 0.2 * loadFrac, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0, spacing, amaLen / 2, beam * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Main hull: a SYMMETRIC double-ender (FIX_REQUEST_round4_roll_dof.md
  // 2.2) — a proa's hull has no fixed bow/stern, both physical tips are
  // identical; direction is communicated only by the active-bow marker
  // and the active steering oar below, not by hull shape.
  ctx.fillStyle = capsized ? skin.hullCapsized : skin.hull;
  ctx.beginPath();
  ctx.moveTo(halfL, 0);
  ctx.quadraticCurveTo(halfL * 0.5, beam / 2, 0, beam / 2);
  ctx.quadraticCurveTo(-halfL * 0.5, beam / 2, -halfL, 0);
  ctx.quadraticCurveTo(-halfL * 0.5, -beam / 2, 0, -beam / 2);
  ctx.quadraticCurveTo(halfL * 0.5, -beam / 2, halfL, 0);
  ctx.closePath();
  ctx.fill();

  // Steering oars at both physical tips (2.2 bonus, upgraded R11-7 round
  // 11 ROUND11_proa_identity_graphics.md). Fixed physical positions
  // (tipA=-halfL, tipB=+halfL) — which one is currently "active" (the
  // steering end, opposite the active bow) depends on state.end, matching
  // the rudder force vector below. During the 'swap' sub-phase state.end
  // itself is still the OLD value throughout (core/shunt.js only flips it
  // the instant progress reaches 1) — activeFracTipA/B crossfade smoothly
  // across that same ~0.4s window by predicting the post-swap role
  // directly, rather than animating a value that only ever jumps.
  const tipA = -halfL, tipB = halfL;
  const activeIsA = state.end === 1;
  let activeFracA;
  if (state.shunt.phase === 'swap') {
    const p = state.shunt.progress;
    activeFracA = activeIsA ? 1 - p : p;
  } else {
    activeFracA = activeIsA ? 1 : 0;
  }
  const activeFracB = 1 - activeFracA;

  const drawOar = (x, activeFrac) => {
    const isActiveRole = activeFrac >= 0.5;
    const dir = x < 0 ? -1 : 1;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * activeFrac;
    if (isActiveRole && !controls.rudderUp) {
      // Deployed: blade in the water, shaft rotated by the ACTUAL
      // deflection (core/rudder.js's own mapping, maxDeflectionDeg*rudder,
      // read from CONFIG, not re-derived), plus a small force-scaled
      // swirl at the blade.
      const deflRad = clamp(controls.rudder, -1, 1) * (dims.rudder.maxDeflectionDeg * DEG);
      ctx.translate(x, 0);
      ctx.rotate(dir * deflRad);
      ctx.strokeStyle = '#3a2f22'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dir * 0.5, 0); ctx.stroke();
      ctx.fillStyle = '#5a4a38';
      ctx.beginPath(); ctx.ellipse(dir * 0.6, 0, 0.22, 0.09, 0, 0, Math.PI * 2); ctx.fill();
      const rudderFy = Math.abs(forces?.breakdown?.rudder?.Fy ?? 0);
      if (rudderFy > 5) {
        const swirl = clamp(Math.log10(1 + rudderFy) * 0.12, 0.05, 0.4);
        ctx.strokeStyle = 'rgba(150,210,255,0.6)'; ctx.lineWidth = 0.03;
        const spin = performance.now() / 220;
        ctx.beginPath();
        ctx.arc(dir * 0.6, 0, swirl, spin, spin + Math.PI * 1.4);
        ctx.stroke();
      }
    } else {
      // Shipped/idle: stowed flush along the deck, out of the water —
      // rudderUp on the active end reads exactly the same as the
      // permanently-idle end, matching "produces no force while shipped"
      // (core/rudder.js).
      ctx.strokeStyle = '#7a7368'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + dir * 0.42, dir === -1 ? 0.08 : -0.08); ctx.stroke();
      ctx.fillStyle = '#9a9488';
      ctx.beginPath(); ctx.ellipse(x + dir * 0.5, dir === -1 ? 0.1 : -0.1, 0.18, 0.07, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };
  drawOar(tipA, activeFracA);
  drawOar(tipB, activeFracB);

  // Crew dot: lateral (crewPos, toward the ama, full spacing per
  // FIX_REQUEST_round3_worldframe.md R3-2) and fore-aft (crewPosX, per
  // FIX_REQUEST_round4_roll_dof.md 1.5/2.3). crewPos is a physical-frame
  // concept (toward the ama, fixed side — matches this nested block, no
  // end factor). crewPosX is an ACTIVE-BOW-relative concept instead
  // ("forward" means toward the current direction of travel, matching
  // hydro.js's hullSideForce CLR shift, which uses crewPosX with no end
  // factor in the active-bow-tracked frame) — since it's being drawn
  // INSIDE this end-rotating physical block, it needs the compensating
  // *end so it lands at the correct active-bow-relative screen position.
  const crewY = clamp(controls.crewPos, dims.crew.posMin, dims.crew.posMax) * spacing;
  const crewX = clamp(controls.crewPosX, dims.crew.posXMin, dims.crew.posXMax) * halfL * 0.6 * state.end;
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath(); ctx.arc(crewX, crewY, 0.28, 0, Math.PI * 2); ctx.fill();

  ctx.restore();

  // Active-bow marker — drawn in the OUTER (active-bow) frame, unchanged:
  // local +x there is defined as "toward the active bow" by construction,
  // so this needs no state.end factor. Relative to the now independently-
  // rotating physical hull sprite above, this is what makes the marker
  // visibly "jump to the other end" at a shunt instead of the hull spinning.
  ctx.fillStyle = '#ff8a3d';
  ctx.beginPath();
  ctx.moveTo(halfL + 0.35, 0); ctx.lineTo(halfL - 0.15, 0.22); ctx.lineTo(halfL - 0.15, -0.22);
  ctx.closePath(); ctx.fill();

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
    // R11-3: upgraded from a single moving tick into an actual HAULED LINE
    // — the tack line grows from its starting point along the leeward
    // gunwale as it's hauled, with a small fairlead ring at the moving,
    // leading end, so the "the sail travels to the other end" story reads
    // as a rope actually being pulled, not a blip jumping across the deck.
    const fromX = 0.35 * yardLen, toX = -halfL * 0.75;
    const tx = fromX + (toX - fromX) * state.shunt.progress;
    const gunwaleY = -0.42 * state.end; // leeward gunwale line, physical frame
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#c9b878'; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(fromX, 0); ctx.lineTo(fromX, gunwaleY); ctx.lineTo(tx, gunwaleY); ctx.stroke();
    ctx.fillStyle = '#e8d9a0';
    ctx.beginPath(); ctx.arc(tx, gunwaleY, 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a8060'; ctx.lineWidth = 0.1;
    ctx.beginPath(); ctx.moveTo(tx, gunwaleY); ctx.lineTo(tx + 0.6, -0.35 * state.end); ctx.stroke();
    ctx.restore();
  } else {
    // Foreshorten the drawn chord by cos(phi) (2.3, optional): subtle at
    // normal heel angles, ties the picture to the roll physics without
    // needing its own visual language.
    const heelYardLen = yardLen * Math.max(0.3, Math.cos(state.phi));
    // P4.1/P4.3: the drawn yard angle is the ACTUAL state.delta (a real,
    // dynamic piece of state now — may differ from the commanded sheet
    // during a swing or while luffing), and the belly's bulge direction
    // follows the ACTUAL sail force (round 8.1 — see sailPath's header
    // comment), not a fixed rule.
    const sailFx = forces?.breakdown?.sail?.Fx ?? 0, sailFy = forces?.breakdown?.sail?.Fy ?? 0;
    const sp = sailPath(heelYardLen, Math.abs(state.delta ?? 0), controls.brailLee, controls.brailWind, state.end, sailFx, sailFy);
    // The dashed/fluttering visual is gated on the AERODYNAMIC condition
    // (near-zero angle of attack — genuine regime b weathervaning, ~zero
    // force), not forces.luffing's mechanical "delta < deltaMax-2deg"
    // definition: that mechanical flag (used for the HUD tag, matching the
    // spec's literal wording) also reads true throughout regime c
    // (backwinded, delta pinned at ~0 by the wind, NOT the sheet) — but a
    // pressed sail there is under real, substantial load (alphaSailor is
    // large, see aero.js), not fluttering, and should render as a filled,
    // alpha-sign-flipped belly (P4.3), not an empty dashed outline.
    const flogging = (forces?.alphaSailor ?? Math.PI / 2) < 10 * DEG;
    if (fade > 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.65 * fade;
      ctx.strokeStyle = skin.sailStroke;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      if (sp.furled) {
        ctx.moveTo(sp.tackX, 0); ctx.lineTo(sp.clewX, sp.clewY);
        ctx.lineWidth = 0.22; ctx.strokeStyle = skin.lashing ?? '#8a8060';
        ctx.stroke();
      } else if (flogging) {
        // P4.2 flogging visual: an unfilled, fluttering dashed outline —
        // belly gone (a luffing sail carries ~zero lift, see aero.js's
        // flogging-drag comment), with a small time-based wobble on the
        // control point so it visibly flutters rather than sitting static.
        const flutter = Math.sin(performance.now() / 90) * 0.12 * heelYardLen;
        const nx = -(sp.clewY - 0), ny = (sp.clewX - sp.tackX);
        const nlen = Math.hypot(nx, ny) || 1;
        const fx = sp.ctrlX + (nx / nlen) * flutter, fy = sp.ctrlY + (ny / nlen) * flutter;
        ctx.setLineDash([0.15, 0.12]);
        ctx.moveTo(sp.tackX, 0);
        ctx.quadraticCurveTo(fx, fy, sp.clewX, sp.clewY);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.moveTo(sp.tackX, 0);
        ctx.quadraticCurveTo(sp.ctrlX, sp.ctrlY, sp.clewX, sp.clewY);
        ctx.lineTo(sp.tackX, 0);
        const sailPathRef = new Path2D();
        sailPathRef.moveTo(sp.tackX, 0);
        sailPathRef.quadraticCurveTo(sp.ctrlX, sp.ctrlY, sp.clewX, sp.clewY);
        sailPathRef.lineTo(sp.tackX, 0);
        ctx.fillStyle = skin.sail;
        ctx.fill();
        ctx.stroke();
        // R11-8 Micronesia skin: simple pandanus-mat weave hatching,
        // clipped to the sail's own path — Pjoa's plain sailcloth fill
        // (skin.lashing null) skips this, geometry stays identical.
        if (skin.lashing) {
          ctx.save();
          ctx.clip(sailPathRef);
          ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.025;
          const minX = Math.min(sp.tackX, sp.clewX, sp.ctrlX) - 0.2;
          const maxX = Math.max(sp.tackX, sp.clewX, sp.ctrlX) + 0.2;
          for (let hx = minX; hx < maxX; hx += 0.22) {
            ctx.beginPath(); ctx.moveTo(hx, -3); ctx.lineTo(hx + 1.2, 3); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(hx, 3); ctx.lineTo(hx + 1.2, -3); ctx.stroke();
          }
          ctx.restore();
        }
      }
      // Yard spar
      ctx.strokeStyle = '#3a2f22'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(sp.tackX, 0); ctx.lineTo(sp.clewX, sp.clewY); ctx.stroke();
      ctx.restore();
    }
  }

  // R11-6 (round 11, ROUND11_proa_identity_graphics.md): two animated
  // ribbon telltales near the tack, one per face, driven directly from
  // the same alphaSailor/luffing/stalled readouts the HUD tags already
  // use (forces.alphaSailor, forces.luffing, the module-level
  // stalledTimer) — streaming (attached flow) at normal AoA, fluttering
  // while luffing, drooping/reversed once genuinely stalled. Small
  // time-based noise so they read as alive, not a static state icon.
  if (forces && state.shunt.phase !== 'transfer') {
    const luffing = forces.luffing;
    const stalled = stalledTimer > STALLED_HOLD_SECONDS;
    const baseX = 0.35 * yardLen;
    const noise = Math.sin(performance.now() / 140) * 0.15 + Math.sin(performance.now() / 310 + 1.7) * 0.08;
    for (const side of [1, -1]) {
      const tx = baseX, ty = side * 0.18;
      let ang; // telltale direction, radians, 0 = streaming straight aft (-x, local frame)
      let color;
      if (luffing) { ang = Math.PI + noise * 1.4 + side * 0.3; color = 'rgba(255,210,90,0.85)'; }
      else if (stalled) { ang = Math.PI * 0.5 * -state.end + noise * 0.5; color = 'rgba(255,120,90,0.85)'; }
      else { ang = Math.PI + noise * 0.35; color = 'rgba(200,225,255,0.75)'; }
      const len = 0.55;
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 0.03; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(ang) * len, ty + Math.sin(ang) * len); ctx.stroke();
      ctx.restore();
    }
  }

  // Apparent wind arrow at the boat, boat-frame local vector (already
  // rotates for free with this transform since aw is boat-frame). Origin
  // placed near the ama side (spacing*0.6*end, not always +y — R3-1) purely
  // for legibility; the vector itself needs no change.
  if (forces && forces.aw && forces.aw.speed > 0.05) {
    const s = 0.35;
    const ax = forces.aw.vx * s, ay = forces.aw.vy * s;
    ctx.save(); ctx.lineWidth = 0.05;
    drawVectorLocal(0, spacing * 0.6 * state.end, ax, ay, '#7fd0ff');
    ctx.restore();
  }

  // R11-5 (round 11, ROUND11_proa_identity_graphics.md): apparent-wind
  // safety sector (anti-aback). deltaAlign(state, controls) — imported
  // straight from core/sheet.js, not duplicated — is the boat's own real
  // "how far from the wind crossing to leeward" number: deltaAlign<=0 is
  // exactly the physical instant the yard clamps to the mast (sheet.js
  // regime c), the through-gybe corner H2 (ROUND10d_helm_balance.md)
  // diagnosed. That's a strictly EARLIER signal than stability.js's own
  // aback timer, which only starts once the ama is actually pressed
  // underwater (a later consequence, see updateAback) — so this glows
  // before that alarm can fire, by construction, not by a tuned lead
  // time. WARN_MARGIN is a UI-only rendering choice (how wide the amber
  // ramp is), not a re-derivation of any core threshold.
  if (forces && forces.aw && forces.aw.speed > 0.05) {
    const align = deltaAlign(state, controls);
    const WARN_MARGIN = 20 * DEG;
    let sectorColor = 'rgba(127,199,255,0.35)';
    if (align <= 0) {
      sectorColor = 'rgba(216,60,60,0.95)';
    } else if (align < WARN_MARGIN) {
      const frac = 1 - align / WARN_MARGIN;
      sectorColor = `rgba(216,${Math.round(165 - 105 * frac)},${Math.round(42 - 22 * frac)},${(0.5 + 0.4 * frac).toFixed(2)})`;
    }
    const R = 3.2;
    ctx.save();
    ctx.strokeStyle = 'rgba(159,180,200,0.15)'; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
    const awAngle = forces.aw.angleToBoat;
    ctx.strokeStyle = sectorColor; ctx.lineWidth = 0.14;
    ctx.beginPath(); ctx.arc(0, 0, R, awAngle - 0.15, awAngle + 0.15); ctx.stroke();
    ctx.restore();
  }

  // Force vectors, from forcesBreakdown(), all already boat-frame.
  if (showForces && forces) {
    const fScale = 0.0035; // N -> m, chosen for legibility, log-softened below
    const soften = (n) => Math.sign(n) * Math.log10(1 + Math.abs(n)) * 0.55;
    // CE position (P1.2): mirrors core/aero.js's sailForces geometry exactly
    // (tack near the active-bow side of CG, CE sliding aft along the yard
    // as delta swings it out to the leeward/-end side, shrunk toward the
    // tack by windward brail) so the force-vector origin tracks the real,
    // moving CE instead of a fixed point.
    const tackXFraction = dims.sail.tackXFraction ?? 0.06;
    const tackX = tackXFraction * halfL;
    const chord = dims.sail.CEheight / 2;
    const halfChord = chord / 2;
    const ceBrailShift = dims.sail.ceBrailShift ?? 0.3;
    const halfChordEffX = halfChord * (1 - ceBrailShift * (controls.brailWind ?? 0));
    const ceX = tackX - halfChordEffX * Math.cos(state.delta ?? 0);
    const ceY = -state.end * halfChord * Math.sin(state.delta ?? 0);
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
      drawVectorLocal(ceX, ceY, xHatX * soften(D), xHatY * soften(D), '#ff6b6b'); // drag
      drawVectorLocal(ceX, ceY, yHatX * soften(L), yHatY * soften(L), '#ffd23f'); // lift
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
  heel: document.getElementById('hudHeel'),
  shunt: document.getElementById('hudShunt'),
  tws: document.getElementById('hudTws'),
  sheet: document.getElementById('hudSheet'),
  yard: document.getElementById('hudYard'),
  luffing: document.getElementById('hudLuffing'),
  stalled: document.getElementById('hudStalled'),
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
  hud.heel.textContent = (state.phi / DEG).toFixed(1);
  hud.shunt.textContent = t(`shuntPhase.${state.shunt.phase}`);
  hud.tws.textContent = controls.windSpeed.toFixed(1);
  // P4.1: sheet limit (commanded) vs actual yard angle (state.delta, a real
  // piece of state — R5-1) shown side by side, plus a LUFFING tag when the
  // wind, not the sheet, is holding delta below the (effective) limit.
  hud.sheet.textContent = `${Math.round(controls.sheet / DEG)}`;
  hud.yard.textContent = `${Math.round((state.delta ?? 0) / DEG)}`;
  hud.luffing.textContent = forces.luffing ? t('hud.luffing') : '';
  hud.stalled.textContent = stalledTimer > STALLED_HOLD_SECONDS ? t('hud.stalled') : '';

  const loadFrac = clamp(forces.amaLoadDisplay, 0, 3) / 3;
  amaBar.style.width = `${clamp(forces.amaLoadDisplay, 0, 1) * 100}%`;
  amaBarWrap.classList.toggle('warn', forces.amaLoadDisplay > 0.75 && forces.amaLoadDisplay <= 1.0);
  amaBarWrap.classList.toggle('danger', forces.amaLoadDisplay > 1.0);
  amaBar.style.width = `${loadFrac * 100}%`;

  // Heel gauge: artificial-horizon-style, centered = upright, needle
  // position scaled by phiLiftoffDeg/phiSubmergeDeg (asymmetric range,
  // matching the roll model's own asymmetric saturation angles), color
  // synced to the same warn/danger states as the ama-load bar
  // (FIX_REQUEST_round4_roll_dof.md 2.3).
  const phiDeg = state.phi / DEG;
  const heelRangeDeg = phiDeg >= 0 ? dims.stability.phiLiftoffDeg : dims.stability.phiSubmergeDeg;
  const heelFrac = clamp(phiDeg / (heelRangeDeg * 1.5), -1, 1); // *1.5 so the needle doesn't pin at the edge right at amaLoad==1
  heelNeedle.style.left = `${50 + heelFrac * 50}%`;
  heelBarWrap.classList.toggle('warn', forces.amaLoadDisplay > 0.75 && forces.amaLoadDisplay <= 1.0);
  heelBarWrap.classList.toggle('danger', forces.amaLoadDisplay > 1.0);

  const speedAboveLockout = speedMs > dims.shunt.speedLockout;
  shuntHint.textContent = speedAboveLockout
    ? t('shunt.lockoutHint', dims.shunt.speedLockout)
    : t('shunt.holdHint');
}

// Round 8 (R8-1/R8-2, ROUND8_physical_capsize.md): the phi>=0 side is no
// longer a countdown — amaLoad>1 ("ama flying") is a WARNING condition,
// not a timer toward an automatic capsize, so the banner just shows the
// tag while it's true, with no "capsize in Xs" text (there's nothing
// counting down anymore). The aback (phi<0) side keeps its real timer
// with a real countdown once it starts (abackTimer>0, gated on full ama
// submersion — stability.js updateAback), but round 10d (H2) adds a
// lighter WARNING below it, same on-the-fly-derived pattern as "AMA
// FLYING": phi<0 while the sail's own roll moment is still actively
// pressing it (forces.breakdown.roll.Msail<0) is genuine aback in the
// nautical sense well before full submersion — see stability.js
// updateAback's own abackWarning comment for the through-gybe diagnosis
// this closes.
function updateAlarms(state, forces) {
  banner.className = '';
  if (state.capsized) {
    // handled by overlay below
  } else if (state.abackTimer > 0) {
    banner.className = 'aback';
    const remain = Math.max(0, dims.stability.abackCapsizeTime - state.abackTimer);
    banner.textContent = t('alarm.aback', remain.toFixed(1));
  } else if (state.phi >= 0 && forces.amaLoad > 1.0) {
    banner.className = 'overload';
    banner.textContent = t('alarm.amaFlying');
  } else if (state.phi < 0 && forces.breakdown.roll.Msail < 0) {
    banner.className = 'pressed';
    banner.textContent = t('alarm.abackWarning');
  }

  if (state.capsized && !capsizeOverlay.classList.contains('show')) {
    capsizeOverlay.classList.add('show');
    capsizeCause.textContent = state.phi < 0
      ? t('capsize.causeAback')
      : t('capsize.causeOverload');
  }
}

// ---------------------------------------------------------------------
// Wake trail (P4.4, ROUND5_CONSOLIDATED_work_order.md) — UI-layer only, no
// core changes: a growable array of WORLD positions, sampled every ~0.15s
// of SIM time (not per frame, so the track's spacing doesn't depend on
// frame rate). Sampling itself is independent of the checkbox (it keeps
// recording while hidden, so re-enabling resumes seamlessly with no gap)
// and continues through shunts — the proa's characteristic reciprocal-leg
// "zigzag" is the whole point. Drawn as a world-space polyline so the
// camera-follows-boat pan doesn't drag the trail along.
//
// No fade and no capacity cap (2026-07 request): the whole trail is drawn
// at constant opacity from the start of the current cruise to its end —
// a reset clears it, and a capsize simply stops sampling (see the
// !state.capsized guard at the call site) so the frozen trail stays fully
// visible until reset. Growing via push (not a fixed-size ring buffer)
// costs nothing noticeable at the ~0.15s sampling rate — this isn't a
// per-frame allocation, and even an hour-long cruise is only a few
// thousand points.
// ---------------------------------------------------------------------
const WAKE_SAMPLE_INTERVAL = 0.15; // seconds of SIM time
let wakeX = [];
let wakeY = [];
let wakeLastSampleT = -Infinity;

// R11-2 (round 11, ROUND11_proa_identity_graphics.md): a SECOND trail
// sampled from the ama's own world position, same ring/growth discipline
// as the hull trail above — same sample cadence (one wakeSample() call
// samples both), same "no cap, reset clears it" lifetime. NaN is pushed
// as an explicit gap marker for every sample taken while the ama is
// clear of the water (amaLoad>=1, i.e. AT/PAST full liftoff — the same
// threshold stability.js's own phi-liftoff saturation and the "AMA
// FLYING" warning use), so a flying episode reads as a literal break in
// the ama thread rather than an interpolated line jumping across it.
let wakeAmaX = [];
let wakeAmaY = [];

// STALLED HUD cue (round 7, R7-3) — symmetric to LUFFING: the sail is
// actively driving (not luffing) but at an angle of attack past its
// useful range (alphaSailor > STALLED_ALPHA_DEG), sustained for more than
// STALLED_HOLD_SECONDS. A UI-layer timer, same pattern as the recorder's
// own timers — the core only exposes the instantaneous alphaSailor/
// luffing readouts, not a stall duration.
const STALLED_ALPHA_DEG = 50;
const STALLED_HOLD_SECONDS = 1;
let stalledTimer = 0;

function wakeReset() {
  wakeX = [];
  wakeY = [];
  wakeAmaX = [];
  wakeAmaY = [];
  wakeLastSampleT = -Infinity;
}

// amaWorldPos(state) -> {x,y} — the ama's own world-space position, same
// physical-frame geometry drawBoat() already uses for the ama ellipse
// (bolted to one physical side, physical local offset (0, ama.spacing),
// rotated by the physical hull heading = state.heading + (end==1?0:PI) —
// see core/state.js's Conventions comment / the shunt world-frame-
// continuity check in harness/asserts.js for the same formula).
function amaWorldPos(state) {
  const physicalHeading = state.heading + (state.end === 1 ? 0 : Math.PI);
  return {
    x: state.x - dims.ama.spacing * Math.sin(physicalHeading),
    y: state.y + dims.ama.spacing * Math.cos(physicalHeading),
  };
}

function wakeSample(state, forces) {
  if (state.t - wakeLastSampleT < WAKE_SAMPLE_INTERVAL) return;
  wakeLastSampleT = state.t;
  wakeX.push(state.x);
  wakeY.push(state.y);
  const flying = (forces?.amaLoadDisplay ?? 0) >= 1.0 && state.phi >= 0;
  if (flying) {
    wakeAmaX.push(NaN);
    wakeAmaY.push(NaN);
  } else {
    const ama = amaWorldPos(state);
    wakeAmaX.push(ama.x);
    wakeAmaY.push(ama.y);
  }
}

// drawTrail — shared polyline drawer for both wake threads; a NaN entry
// breaks the path (drawn as a gap, per R11-2's "flying episodes read as
// gaps"), not a scripted skip — the JS Number NaN comparisons below all
// evaluate false, cheaply falling through to "start a new subpath".
function drawTrail(xs, ys, cam, color) {
  if (xs.length < 2) return;
  ctx.save();
  ctx.lineWidth = Math.max(1, 1.4 * dpr);
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.beginPath();
  let penDown = false;
  for (let i = 0; i < xs.length; i++) {
    if (Number.isNaN(xs[i])) { penDown = false; continue; }
    const p = worldToScreen(xs[i], ys[i], cam);
    if (!penDown) { ctx.moveTo(p.x, p.y); penDown = true; } else { ctx.lineTo(p.x, p.y); }
  }
  ctx.stroke();
  ctx.restore();
}

// drawFadingWake — a real wake dissipates within a short distance of
// whatever's making it, not a persistent route line. Only the most
// recent maxSamples samples are drawn; each short segment gets its own
// width/color/alpha interpolated by how far back (in samples) it sits —
// near the source: already as wide as the actual hull/ama beam (in
// world meters, scaled the same way every other on-screen length is —
// `scale*dpr` — so it visually continues the real waterline instead of
// tapering from a point; per feedback, "every point of the hull that
// touches the water generates wake", not just its center track), and its
// `base` color at close to full strength; fading away: wider still, and
// its color drifts toward the water's own skin color (getSkin().water,
// so it blends seamlessly into the background instead of just fading to
// a fixed pale tone) while its alpha drops toward 0. (Approximates
// "blurred" via the width/alpha/color ramp rather than a real per-
// segment canvas blur filter — a literal `ctx.filter` blur would need
// its own compositing pass per segment, dozens of times a frame, which
// isn't worth it for what's already a soft, low-contrast trail at this
// sample count.)
function drawFadingWake(xs, ys, cam, maxSamples, base, beamStartM, beamEndM, alphaStart) {
  const n = xs.length;
  if (n < 2) return;
  const bg = hexToRgb(getSkin().water);
  const start = Math.max(0, n - maxSamples);
  const px = scale * dpr;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = start + 1; i < n; i++) {
    if (Number.isNaN(xs[i]) || Number.isNaN(xs[i - 1])) continue; // flying gap
    const age = (n - 1 - i) / Math.max(1, n - 1 - start); // 0 = newest (at the source), 1 = oldest kept
    const p0 = worldToScreen(xs[i - 1], ys[i - 1], cam);
    const p1 = worldToScreen(xs[i], ys[i], cam);
    const r = Math.round(base.r + (bg.r - base.r) * age), g = Math.round(base.g + (bg.g - base.g) * age), b = Math.round(base.b + (bg.b - base.b) * age);
    const alpha = alphaStart * (1 - age);
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    ctx.lineWidth = Math.max(1, (beamStartM + (beamEndM - beamStartM) * age) * px);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  }
  ctx.restore();
}

const WAKE_FADE_MAX_SAMPLES = 36; // ~5.4s of trailing wake at WAKE_SAMPLE_INTERVAL=0.15s — "not too long a stretch"
const AMA_WAKE_BASE = { r: 90, g: 170, b: 230 }; // saturated blue near the ama
const HULL_WAKE_BASE = { r: 90, g: 170, b: 230 }; // same blue, same dissipating treatment as the ama's

function drawWakeTrail(cam) {
  if (!wakeTrailCheckbox.checked) return;
  // Thin blue line for the WHOLE session, unbounded — per feedback, kept
  // deliberately separate from the dissipating wake effect below so the
  // full course sailed stays traceable even long after the "real" wake
  // near the hull has faded out.
  drawTrail(wakeX, wakeY, cam, 'rgba(90,170,230,0.35)');
  // Dissipating wake effect, both threads: starts as wide as the actual
  // waterline (hull.beam / the ama's own ~1.2*hull.beam cross-section,
  // matching the ellipse radius drawBoat() already uses for it) and
  // widens further while fading toward the water's own background color
  // over the last ~5.4s, per feedback.
  const hullBeamM = dims.hull.beam, amaBeamM = dims.hull.beam * 1.2;
  drawFadingWake(wakeX, wakeY, cam, WAKE_FADE_MAX_SAMPLES, HULL_WAKE_BASE, hullBeamM, hullBeamM * 6, 0.30);
  drawFadingWake(wakeAmaX, wakeAmaY, cam, WAKE_FADE_MAX_SAMPLES, AMA_WAKE_BASE, amaBeamM, amaBeamM * 6, 0.36);
}

// ---------------------------------------------------------------------
// Session recorder (round 6, ROUND6_flight_recorder.md) — records every
// step()'s (dt, controls), plus the state it started from, so a session
// can be re-simulated EXACTLY offline via harness/replay.js. This works
// ONLY because the core is a verified-deterministic function of
// (initialState, configSnapshot, frame sequence) — see harness/asserts.js's
// R6-1 self-test; the recorder itself is pure UI-layer bookkeeping, it
// never feeds back into physics.
//
// recLastShuntRequest mirrors core/simulator.js's OWN internal
// edge-detector (private to that module's closure): controls.shuntRequest
// as recorded is the RAW held-key boolean, not yet edge-detected (the
// facade turns a held key into a single pulse internally) — so a
// checkpoint/trim boundary has to carry the edge-detector's own state
// forward too, or a replay starting mid-hold could fire a spurious extra
// shunt request that never happened live.
// ---------------------------------------------------------------------
const REC_CHECKPOINT_INTERVAL = 60; // frames -- matches R6-2's "hash every N frames, N=60"
const REC_MAX_FRAMES = 15 * 60 * 60; // ~15 min of frames at a nominal 60fps (R6-2 ring-buffer cap)

let recActive = false;
let recEverStarted = false;
let recFrames = [];
let recChecksums = [];
let recCheckpoints = []; // { frameIdx (into recFrames, taken AFTER this frame), state, lastShuntRequest }
let recTrimmed = false;
let recInitialState = null;
let recInitialLastShuntRequest = false;
let recAnnotations = [];
let recSimSeconds = 0; // sum of recorded dt -- HUD duration readout
let recLastShuntRequest = false;

function recFormatDuration(seconds) {
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Cheap estimate (no JSON.stringify every frame just to show a size): ~80
// bytes/frame for {dt, controls} as JSON is a reasonable average for this
// control shape, plus a fixed overhead for checkpoints/metadata.
function recEstimateSizeBytes() {
  return recFrames.length * 80 + recCheckpoints.length * 300 + 500;
}

function recUpdateHudReadout() {
  if (!recEverStarted) return;
  recDuration.textContent = recFormatDuration(recSimSeconds);
  recSize.textContent = `${Math.ceil(recEstimateSizeBytes() / 1024)} KB`;
}

function recStart() {
  recActive = true;
  recEverStarted = true;
  recFrames = [];
  recChecksums = [];
  recCheckpoints = [];
  recTrimmed = false;
  recAnnotations = [];
  recSimSeconds = 0;
  const state = sim.getState();
  recInitialState = { ...state, shunt: { ...state.shunt } };
  recInitialLastShuntRequest = recLastShuntRequest;
  btnRec.classList.add('active');
  recDot.classList.add('live');
  recStat.classList.add('show');
  btnMark.disabled = false;
  btnDownloadRec.disabled = true;
  recUpdateHudReadout();
}

function recStop() {
  recActive = false;
  btnRec.classList.remove('active');
  recDot.classList.remove('live');
  btnMark.disabled = true;
  btnDownloadRec.disabled = recFrames.length === 0;
}

function recToggle() { if (recActive) recStop(); else recStart(); }

function recMark(t) {
  if (!recActive) return;
  recAnnotations.push({ t, note: `marker @ ${t.toFixed(1)}s` });
}

// recOnFrame(dtFrame, frameControls, stateAfter) — called once per actual
// sim.step() (never while paused: "pause frames are simply absent — no
// steps happen"), with the EXACT dt that step used and the controls
// object as it stood for that step (snapshotted here, since `controls` is
// the same mutated object every frame elsewhere in this file — this copy
// is the one necessary per-frame allocation on this path, no others).
function recOnFrame(dtFrame, frameControls, stateAfter) {
  recLastShuntRequest = Boolean(frameControls.shuntRequest);

  if (!recActive) return;

  recFrames.push({ dt: dtFrame, controls: { ...frameControls } });
  recSimSeconds += dtFrame;

  if (recFrames.length % REC_CHECKPOINT_INTERVAL === 0) {
    recChecksums.push(hashState(stateAfter));
    recCheckpoints.push({
      frameIdx: recFrames.length - 1,
      state: { ...stateAfter, shunt: { ...stateAfter.shunt } },
      lastShuntRequest: recLastShuntRequest,
    });
  }

  if (recFrames.length > REC_MAX_FRAMES) {
    // Trim to the oldest checkpoint boundary (checkpoints are dense --
    // every 60 frames -- so this costs at most ~1s of history beyond the
    // nominal cap in exchange for a simple, correct trim: the checkpoint
    // IS a valid, self-contained new initialState).
    const cp = recCheckpoints.shift();
    recFrames = recFrames.slice(cp.frameIdx + 1);
    recChecksums = recChecksums.slice(1);
    for (const c of recCheckpoints) c.frameIdx -= (cp.frameIdx + 1);
    recInitialState = cp.state;
    recInitialLastShuntRequest = cp.lastShuntRequest;
    recAnnotations = recAnnotations.filter((a) => a.t >= recInitialState.t);
    recTrimmed = true;
  }
}

function recBuildJSON() {
  return {
    format: 'simpjoa-recording',
    formatVersion: 1,
    codeVersion: CODE_VERSION,
    configVersion: dims.configVersion,
    configSnapshot: dims,
    initialState: recInitialState,
    initialLastShuntRequest: recInitialLastShuntRequest,
    frames: recFrames,
    stateChecksums: recChecksums,
    annotations: recAnnotations,
    trimmed: recTrimmed,
  };
}

function recDownload() {
  if (recFrames.length === 0) return;
  const json = JSON.stringify(recBuildJSON());
  const blob = new Blob([json], { type: 'application/json' });
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `simpjoa-recording-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Capsize+reset ENDS the recording automatically (reset changes
// initialState, breaking the "one continuous initialState + frame
// sequence" invariant this format depends on) and offers the download —
// this is exactly the moment a diagnostic recording is most likely to be
// wanted, so the download triggers automatically rather than waiting for
// a second click.
function recEndForReset() {
  if (!recActive) return;
  recStop();
  recDownload();
}

btnRec.addEventListener('click', recToggle);
btnMark.addEventListener('click', () => recMark(sim.getState().t));
btnDownloadRec.addEventListener('click', recDownload);

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------
let lastT = performance.now();
let camera = { x: 0, y: 0 };
let prevShuntHeld = false;
let shuntFlashUntil = 0;
let bowCalloutUntil = 0; // R11-3: "BOW/DZIOB" tag, pops for ~2s right as the swap completes

function frame(now) {
  const dtFrame = Math.min(0.1, Math.max(0, (now - lastT) / 1000)); // clamp 100ms, tab-switch protection
  lastT = now;

  if (!polarMode && !boatMode) {
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
    const stepped = !paused || stepOnce;
    const usedDt = stepOnce ? 1 / 60 : dtFrame;
    if (stepped) {
      sim.step(controls, usedDt);
      stepOnce = false;
    }
    const state = sim.getState();
    const forces = sim.forcesBreakdown();
    camera.x = state.x; camera.y = state.y;

    // Wake trail sampling (P4.4): pause suspends it (tied to `stepped`,
    // same condition the sim itself advances under) and capsize stops it;
    // shunts are NOT excluded — the zigzag through them is the point.
    if (stepped && !state.capsized) wakeSample(state, forces);

    // STALLED cue timer (round 7, R7-3): accumulates only while actively
    // driving (not luffing, not capsized) at alphaSailor past the
    // threshold; resets the instant either condition lapses.
    if (stepped) {
      if (!state.capsized && !forces.luffing && forces.alphaSailor > STALLED_ALPHA_DEG * DEG) {
        stalledTimer += usedDt;
      } else {
        stalledTimer = 0;
      }
    }

    // Session recorder (round 6): called unconditionally whenever a step
    // actually happened (pause -> no call -> "pause frames are simply
    // absent"), NOT gated on capsized (recording continues through a
    // capsize; only reset ends it, see recEndForReset) — and NOT gated on
    // recActive internally either, since recOnFrame must keep tracking the
    // shunt-request edge state continuously so recStart() can seed a
    // correct initialLastShuntRequest whenever recording actually begins.
    if (stepped) recOnFrame(usedDt, controls, state);
    recUpdateHudReadout();

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

    // R11-3: the 'swap' sub-phase is where the core actually flips
    // state.end/heading (core/shunt.js) — the instant it completes
    // (phase moves on to 'sheet') is exactly "the newly active end",
    // so that's the edge the BOW/DZIOB callout pops on.
    if (phaseBefore === 'swap' && state.shunt.phase === 'sheet') {
      bowCalloutUntil = now + 2000;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawWaterGrid(camera);
    drawWakeTrail(camera);
    drawBoat(state, forces, camera);
    drawTrueWindArrow();
    drawSideViewInset(state, forces);
    drawShuntNarrative(state, camera, now);
    drawBalanceWidget(state, forces);
    updateHud(state, forces);
    updateAlarms(state, forces);

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
const boatPanel = document.getElementById('boatPanel');
const livePanel = document.getElementById('livePanel');
const btnPolar = document.getElementById('btnPolar');
const btnBoat = document.getElementById('btnBoat');
const btnRunPolar = document.getElementById('btnRunPolar');
const btnExportPolar = document.getElementById('btnExportPolar');
const btnClosePolar = document.getElementById('btnClosePolar');
const polarProgress = document.getElementById('polarProgress');

let lastPolarRows = null;

// setActivePanel('live'|'polar'|'boat') — the panel area shows exactly one
// of livePanel/polarPanel/boatPanel at a time; switching to one forces the
// other two off, rather than each mode independently toggling itself (which
// would let two panels show at once if opened back to back).
function setActivePanel(mode) {
  // Leaving the polar panel abandons any sweep in flight — see
  // cancelPolarRun. Re-entering starts fresh rather than resuming.
  if (polarMode && mode !== 'polar') cancelPolarRun();
  polarMode = mode === 'polar';
  boatMode = mode === 'boat';
  btnPolar.classList.toggle('active', polarMode);
  btnBoat.classList.toggle('active', boatMode);
  polarPanel.classList.toggle('show', polarMode);
  boatPanel.classList.toggle('show', boatMode);
  livePanel.style.display = (polarMode || boatMode) ? 'none' : '';
  if (polarMode) drawPolarView(lastPolarRows);
  if (boatMode) buildBoatPanel();
}
function togglePolar() { setActivePanel(polarMode ? 'live' : 'polar'); }
function toggleBoat() { setActivePanel(boatMode ? 'live' : 'boat'); }
btnPolar.addEventListener('click', togglePolar);
btnClosePolar.addEventListener('click', togglePolar);
btnBoat.addEventListener('click', toggleBoat);

// Sweep cancellation: a run is a long-lived async loop, so leaving the panel
// (or starting a second run) has to be able to stop it. Without this the
// sweep kept grinding after the user switched back to sailing — the boat was
// live again but the main thread was still being eaten for minutes, which
// reads as the whole browser hanging.
let polarRunToken = 0;
function cancelPolarRun() { polarRunToken += 1; }

btnRunPolar.addEventListener('click', async () => {
  const myToken = ++polarRunToken;
  btnRunPolar.disabled = true;
  btnExportPolar.disabled = true;
  const rows = [];
  polarProgress.textContent = t('polar.running');

  // Drive the sweep one TRIAL at a time and hand the thread back whenever
  // this frame's budget is spent. The previous version chunked by HEADING,
  // which sounds fine but is a 3-12.5s synchronous call each — 56 of them,
  // so the tab froze in multi-second blocks despite the yield between them.
  const FRAME_BUDGET_MS = 12;
  const steps = computePolarSteps(dims, { twsList: [4, 6, 8, 10], twaFrom: 40, twaTo: 170, step: 10 });
  let sliceStart = performance.now();
  for (const row of steps) {
    if (polarRunToken !== myToken) return; // superseded or cancelled
    if (row) {
      rows.push(row);
      polarProgress.textContent = t('polar.progress', row.tws, row.twa);
    }
    if (performance.now() - sliceStart >= FRAME_BUDGET_MS) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => requestAnimationFrame(() => r()));
      if (polarRunToken !== myToken) return;
      sliceStart = performance.now();
    }
  }

  polarProgress.textContent = t('polar.done', rows.length);
  lastPolarRows = rows;
  btnRunPolar.disabled = false;
  btnExportPolar.disabled = false;
  drawPolarView(rows);
});

btnExportPolar.addEventListener('click', () => {
  if (!lastPolarRows) return;
  // bestBrailWind column added round 10c (computePolar's own row shape) —
  // this export string was never updated to match; caught by round 11's
  // bundle-fidelity spot-check (ROUND11_proa_identity_graphics.md) against
  // run_tests.js's out/polar.csv, which already carries it.
  const header = 'twa,tws,bestSpeed,bestSheetAngle,deltaAngle,bestCamberUse,bestBrailWind';
  const lines = [header, ...lastPolarRows.map((r) => `${r.twa},${r.tws},${r.bestSpeed.toFixed(4)},${r.bestSheetAngle},${r.deltaAngle.toFixed(2)},${r.bestCamberUse},${r.bestBrailWind}`)];
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
    ctx.fillText(t('polar.placeholder'), cx - 120 * dpr, cy + R + 40 * dpr);
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
    ctx.fillText(t('polar.twsLegend', tws), cx - 70 * dpr, ly);
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

// ---------------------------------------------------------------------
// Boat design panel — edit core/config.js's CONFIG fields at runtime.
//
// Every field here is a physical design/tuning constant that a real Pjoa's
// specific construction would otherwise fix (hull dimensions, sail area,
// ITTC-style coefficients standing in for what that construction would
// determine). Two fields are marked 'graphics' (drawing/UI only, no
// physics effect at all — confirmed by grep across core/*.js):
// sail.tackXFraction (mast-drawing position only, round 7 D-6 moved the
// real CE geometry to hull.lead) and stability.amaLoadDisplayCap (a
// display-only ceiling on the HUD readout; the aback-timer physics reads
// the raw, uncapped amaLoad). Everything else genuinely feeds core/*.js's
// force/moment calculations. crew.posMin/posMax/posXMin/posXMax are
// deliberately NOT exposed here — they're slider-range UI config, not a
// boat characteristic, and the HTML sliders' own hardcoded min/max already
// bound player input independent of them.
//
// Applying a change: builds a full patch (every field below, not just the
// edited ones) and calls createConfig(patch) to both validate and produce
// a complete new config in one step (deepMerge starts from fresh defaults,
// so every schema field must be explicit or its edit would be lost on a
// later Apply) — see core/config.js's createConfig/deepMerge. On success,
// replaces `dims` (this module's drawing/limits copy) and calls
// sim.setConfig(patch) + sim.reset() (the same reset core/simulator.js's
// facade already exposes but app.js never called before this feature).
const BOAT_FIELDS = [
  { path: 'hull.length', kind: 'physics', unit: 'm', step: 0.1, labelEn: 'Hull length', labelPl: 'Długość kadłuba' },
  { path: 'hull.beam', kind: 'graphics', unit: 'm', step: 0.01, labelEn: 'Hull beam', labelPl: 'Szerokość kadłuba' },
  { path: 'hull.displacement', kind: 'physics', unit: 'kg', step: 1, labelEn: 'Displacement', labelPl: 'Wyporność' },
  { path: 'hull.wettedSurface', kind: 'physics', unit: 'm²', step: 0.1, labelEn: 'Hull wetted surface', labelPl: 'Pow. zwilżona kadłuba' },
  { path: 'hull.residuaryPeakCr', kind: 'physics', unit: '', step: 0.0005, labelEn: 'Wave-resistance peak (Cr)', labelPl: 'Szczyt oporu falowego (Cr)' },
  { path: 'hull.residuaryFrPeak', kind: 'physics', unit: '', step: 0.01, labelEn: 'Peak Froude number', labelPl: 'Liczba Froude’a szczytu oporu' },
  { path: 'hull.residuaryFrWidth', kind: 'physics', unit: '', step: 0.01, labelEn: 'Resistance hump width', labelPl: 'Szerokość garbu oporu' },
  { path: 'hull.csV2A', kind: 'physics', unit: '', step: 0.0001, labelEn: 'Side-force coeff. (V2 fit, linear)', labelPl: 'Współcz. siły bocznej (V2, liniowy)' },
  { path: 'hull.csV2B', kind: 'physics', unit: '', step: 0.0001, labelEn: 'Side-force coeff. (V2 fit, quadratic)', labelPl: 'Współcz. siły bocznej (V2, kwadratowy)' },
  { path: 'hull.csV1A', kind: 'physics', unit: '', step: 0.0001, labelEn: 'Side-force coeff. (V1 blend, linear)', labelPl: 'Współcz. siły bocznej (V1, liniowy)' },
  { path: 'hull.csV1B', kind: 'physics', unit: '', step: 0.0001, labelEn: 'Side-force coeff. (V1 blend, quadratic)', labelPl: 'Współcz. siły bocznej (V1, kwadratowy)' },
  { path: 'hull.csBlendStartDeg', kind: 'physics', unit: '°', step: 1, labelEn: 'CS blend start angle', labelPl: 'Kąt startu mieszania CS' },
  { path: 'hull.csBlendEndDeg', kind: 'physics', unit: '°', step: 1, labelEn: 'CS blend end angle (flat beyond)', labelPl: 'Kąt końca mieszania CS (dalej płasko)' },
  { path: 'hull.lowSpeedSideDamping', kind: 'physics', unit: '', step: 5, labelEn: 'Low-speed side damping', labelPl: 'Tłumienie boczne przy małej prędk.' },
  { path: 'hull.sailingFreeReliefPeak', kind: 'physics', unit: '', step: 0.05, labelEn: '"Sailing free" relief magnitude', labelPl: 'Wielkość ulgi "żeglowania swobodnego"' },
  { path: 'hull.sailingFreeReliefPlateauStartDeg', kind: 'physics', unit: '°', step: 1, labelEn: '"Sailing free" plateau start', labelPl: 'Początek plateau "żeglowania swobodnego"' },
  { path: 'hull.sailingFreeReliefPlateauEndDeg', kind: 'physics', unit: '°', step: 1, labelEn: '"Sailing free" plateau end', labelPl: 'Koniec plateau "żeglowania swobodnego"' },
  { path: 'hull.sailingFreeReliefFadeEndDeg', kind: 'physics', unit: '°', step: 1, labelEn: '"Sailing free" fade-out angle', labelPl: 'Kąt zaniku "żeglowania swobodnego"' },
  { path: 'hull.crossFlowDragCoeff', kind: 'physics', unit: '', step: 0.05, labelEn: 'Cross-flow (broadside) drag coeff.', labelPl: 'Współcz. oporu poprzecznego (na boku)' },
  { path: 'hull.lateralArea', kind: 'physics', unit: 'm²', step: 0.1, labelEn: 'Hull lateral (projected side) area', labelPl: 'Pow. boczna kadłuba (rzut)' },
  { path: 'hull.yawDampingCoeff', kind: 'physics', unit: '', step: 10, labelEn: 'Yaw damping coeff.', labelPl: 'Tłumienie odchylenia (yaw)' },
  { path: 'hull.clrXFraction', kind: 'physics', unit: '', step: 0.01, labelEn: 'CLR offset (fraction)', labelPl: 'Przesunięcie CLR (ułamek)' },
  { path: 'hull.crewForeAftTrimCoeff', kind: 'physics', unit: '', step: 0.01, labelEn: 'Crew fore-aft CLR trim coeff.', labelPl: 'Współcz. przesuwu CLR przez załogę' },
  { path: 'hull.crewTrimSign', kind: 'physics', unit: '±1', step: 2, labelEn: 'Crew-trim coupling sign', labelPl: 'Znak sprzężenia załoga→CLR' },
  { path: 'hull.yawHeelSign', kind: 'physics', unit: '±1', step: 2, labelEn: 'Heel→yaw coupling sign', labelPl: 'Znak sprzężenia przechył→odchylenie' },
  { path: 'hull.ceLeverSign', kind: 'physics', unit: '±1', step: 2, labelEn: 'CE-lever sign', labelPl: 'Znak dźwigni CE' },
  { path: 'hull.lead', kind: 'physics', unit: 'm', step: 0.01, labelEn: 'CE-CLR lead', labelPl: 'Wyprzedzenie CE przed CLR (lead)' },

  { path: 'ama.length', kind: 'physics', unit: 'm', step: 0.1, labelEn: 'Ama length', labelPl: 'Długość amy' },
  { path: 'ama.maxBuoyancy', kind: 'physics', unit: 'kg', step: 1, labelEn: 'Ama max buoyancy', labelPl: 'Maks. wyporność amy' },
  { path: 'ama.mass', kind: 'physics', unit: 'kg', step: 1, labelEn: 'Ama mass', labelPl: 'Masa amy' },
  { path: 'ama.spacing', kind: 'physics', unit: 'm', step: 0.1, labelEn: 'Hull-ama spacing', labelPl: 'Rozstaw kadłub–ama' },
  { path: 'ama.wettedSurface', kind: 'physics', unit: 'm²', step: 0.05, labelEn: 'Ama wetted surface', labelPl: 'Pow. zwilżona amy' },
  { path: 'ama.formFactor', kind: 'physics', unit: '', step: 0.05, labelEn: 'Ama form factor (1+k)', labelPl: 'Współcz. kształtu amy (1+k)' },
  { path: 'ama.crewImmersionCoeff', kind: 'physics', unit: '', step: 0.01, labelEn: 'Crew-immersion coeff.', labelPl: 'Współcz. zanurzania przez załogę' },

  { path: 'sail.area', kind: 'physics', unit: 'm²', step: 0.1, labelEn: 'Sail area', labelPl: 'Powierzchnia żagla' },
  { path: 'sail.apexAngleDeg', kind: 'physics', unit: '°', step: 1, labelEn: 'Sail apex angle', labelPl: 'Kąt wierzchołkowy żagla' },
  { path: 'sail.CEheight', kind: 'physics', unit: 'm', step: 0.05, labelEn: 'CE height (mast)', labelPl: 'Wysokość CE (masztu)' },
  { path: 'sail.camber', kind: 'physics', unit: '', step: 0.01, labelEn: 'Sail camber', labelPl: 'Wybrzuszenie żagla (camber)' },
  { path: 'sail.CD0', kind: 'physics', unit: '', step: 0.005, labelEn: 'Parasitic drag (CD0)', labelPl: 'Opór szkodliwy (CD0)' },
  { path: 'sail.s', kind: 'physics', unit: '', step: 0.05, labelEn: 'Partial-suction factor (s)', labelPl: 'Współcz. częściowej ssącej (s)' },
  { path: 'sail.yardSwingRateDegPerSec', kind: 'physics', unit: '°/s', step: 5, labelEn: 'Yard swing rate', labelPl: 'Prędkość wychylania rei' },
  { path: 'sail.deltaMaxReleaseDeg', kind: 'physics', unit: '°', step: 1, labelEn: 'Shunt release angle', labelPl: 'Kąt zwolnienia przy zwrocie' },
  { path: 'sail.floggingCDFactor', kind: 'physics', unit: '', step: 0.01, labelEn: 'Flogging drag factor', labelPl: 'Dodatkowy opór łopotania' },
  { path: 'sail.tackXFraction', kind: 'graphics', unit: '', step: 0.01, labelEn: 'Mast position (drawing)', labelPl: 'Pozycja masztu (rysunek)' },
  { path: 'sail.ceBrailShift', kind: 'physics', unit: '', step: 0.01, labelEn: 'CE shift from windward brail', labelPl: 'Przesunięcie CE przez gejtawę nawietrzną' },
  { path: 'sail.ceSwingFraction', kind: 'physics', unit: '', step: 0.01, labelEn: 'CE swing fraction', labelPl: 'Ułamek wychylenia CE z reją' },
  { path: 'sail.verticalLiftFraction', kind: 'physics', unit: '', step: 0.01, labelEn: 'Vertical lift fraction', labelPl: 'Ułamek pionowej siły nośnej' },

  { path: 'crew.mass', kind: 'physics', unit: 'kg', step: 1, labelEn: 'Crew mass', labelPl: 'Masa załogi' },

  { path: 'rudder.maxDeflectionDeg', kind: 'physics', unit: '°', step: 1, labelEn: 'Max rudder deflection', labelPl: 'Maks. wychylenie steru' },
  { path: 'rudder.area', kind: 'physics', unit: 'm²', step: 0.01, labelEn: 'Rudder blade area', labelPl: 'Powierzchnia pióra steru' },
  { path: 'rudder.coeff', kind: 'physics', unit: '', step: 0.05, labelEn: 'Rudder force coeff.', labelPl: 'Współcz. siły steru' },

  { path: 'stability.abackCapsizeTime', kind: 'physics', unit: 's', step: 0.5, labelEn: 'Aback capsize time', labelPl: 'Czas do wywrotki (aback)' },
  { path: 'stability.amaLoadDisplayCap', kind: 'graphics', unit: '', step: 0.5, labelEn: 'Ama-load display cap (UI)', labelPl: 'Limit wskazania obc. amy (UI)' },
  { path: 'stability.I_roll', kind: 'physics', unit: 'kg·m²', step: 50, labelEn: 'Roll moment of inertia', labelPl: 'Moment bezwładności przechyłu' },
  { path: 'stability.phiLiftoffDeg', kind: 'physics', unit: '°', step: 1, labelEn: 'Ama liftoff angle', labelPl: 'Kąt oderwania amy' },
  { path: 'stability.phiSubmergeDeg', kind: 'physics', unit: '°', step: 1, labelEn: 'Ama submerge angle', labelPl: 'Kąt zanurzenia amy' },
  { path: 'stability.rollDampingCoeff', kind: 'physics', unit: '', step: 10, labelEn: 'Roll damping coeff.', labelPl: 'Tłumienie przechyłu' },
  { path: 'stability.phiCapsizeDeg', kind: 'physics', unit: '°', step: 1, labelEn: 'Capsize angle', labelPl: 'Kąt wywrotki' },
  { path: 'stability.capsizeTriggerMarginDeg', kind: 'physics', unit: '°', step: 1, labelEn: 'Capsize trigger margin', labelPl: 'Margines wyzwolenia wywrotki' },

  { path: 'shunt.speedLockout', kind: 'physics', unit: 'm/s', step: 0.5, labelEn: 'Shunt speed lockout', labelPl: 'Blokada zwrotu (prędkość)' },
  { path: 'shunt.easeDuration', kind: 'physics', unit: 's', step: 0.1, labelEn: 'Ease duration', labelPl: 'Czas luzowania' },
  { path: 'shunt.transferDuration', kind: 'physics', unit: 's', step: 0.1, labelEn: 'Transfer duration', labelPl: 'Czas przenoszenia' },
  { path: 'shunt.swapDuration', kind: 'physics', unit: 's', step: 0.1, labelEn: 'Bow/stern swap duration', labelPl: 'Czas zamiany dziób/rufa' },
  { path: 'shunt.sheetDuration', kind: 'physics', unit: 's', step: 0.1, labelEn: 'Sheeting duration', labelPl: 'Czas wybierania szotu' },
];
const BOAT_CATEGORIES = ['hull', 'ama', 'sail', 'crew', 'rudder', 'stability', 'shunt'];

function getPath(obj, path) { return path.split('.').reduce((o, k) => o?.[k], obj); }
function setPath(obj, path, value) {
  const keys = path.split('.');
  let node = obj;
  for (let i = 0; i < keys.length - 1; i++) node = (node[keys[i]] ??= {});
  node[keys[keys.length - 1]] = value;
}

const boatFieldsEl = document.getElementById('boatFields');
const boatErrorEl = document.getElementById('boatError');
const boatPresetNameInput = document.getElementById('boatPresetName');
const boatPresetSelect = document.getElementById('boatPresetSelect');
const boatImportFile = document.getElementById('boatImportFile');
const BOAT_PRESETS_KEY = 'simpjoaBoatPresets';

function loadBoatPresets() {
  try { return JSON.parse(localStorage.getItem(BOAT_PRESETS_KEY) || '{}'); } catch { return {}; }
}
function saveBoatPresets(presets) { localStorage.setItem(BOAT_PRESETS_KEY, JSON.stringify(presets)); }

function refreshBoatPresetSelect() {
  const presets = loadBoatPresets();
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
  boatPresetSelect.innerHTML = `<option value="">${t('opt.boatPresetNone')}</option>`;
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    boatPresetSelect.appendChild(opt);
  }
}

// Builds/rebuilds just the field rows from BOAT_FIELDS, pre-filled from
// the current `dims` config — deliberately separate from the preset
// <select> (see buildBoatPanel below): rebuilding the select wipes its
// current selection, which would break "pick a preset, then Delete it"
// if loading a preset also rebuilt the select it fired from.
function buildBoatFieldRows() {
  boatFieldsEl.innerHTML = '';
  boatErrorEl.textContent = '';
  for (const cat of BOAT_CATEGORIES) {
    const h = document.createElement('div');
    h.className = 'boatCategory';
    h.textContent = t(`cat.${cat}`);
    boatFieldsEl.appendChild(h);
    for (const field of BOAT_FIELDS.filter((f) => f.path.startsWith(cat + '.'))) {
      const row = document.createElement('div');
      row.className = 'boatRow';
      const label = document.createElement('label');
      label.textContent = (currentLang === 'pl' ? field.labelPl : field.labelEn) + (field.unit ? ` (${field.unit})` : '');
      const input = document.createElement('input');
      input.type = 'number';
      input.step = field.step;
      input.value = getPath(dims, field.path);
      input.dataset.path = field.path;
      const tag = document.createElement('span');
      tag.className = `tag ${field.kind === 'physics' ? 'tagPhysics' : 'tagGraphics'}`;
      tag.textContent = t(`tag.${field.kind}`);
      row.append(label, input, tag);
      boatFieldsEl.appendChild(row);
    }
  }
}

// Full panel (re)build — first open, language switch, reset-to-defaults:
// cases where the preset list's own selection has no reason to survive.
function buildBoatPanel() {
  buildBoatFieldRows();
  refreshBoatPresetSelect();
}

// Reads every BOAT_FIELDS input back into a full nested patch object — see
// the "Applying a change" note above for why this is always the COMPLETE
// field set, not just whatever the user touched this time.
function collectBoatPatch() {
  const patch = {};
  for (const field of BOAT_FIELDS) {
    const input = boatFieldsEl.querySelector(`input[data-path="${field.path}"]`);
    setPath(patch, field.path, Number(input.value));
  }
  return patch;
}

function applyBoatPatch(patch) {
  let validated;
  try {
    validated = createConfig(patch);
  } catch (err) {
    boatErrorEl.textContent = t('boat.invalid', err.message);
    return false;
  }
  dims = validated;
  updateBrailZoneUI();
  sim.setConfig(patch);
  sim.reset();
  boatErrorEl.style.color = '#7fe3a3';
  boatErrorEl.textContent = t('boat.applied');
  return true;
}

document.getElementById('btnApplyBoat').addEventListener('click', () => {
  boatErrorEl.style.color = '#ff8a8a';
  applyBoatPatch(collectBoatPatch());
});

document.getElementById('btnResetBoatDefaults').addEventListener('click', () => {
  dims = createConfig();
  updateBrailZoneUI();
  buildBoatPanel();
});

document.getElementById('btnCloseBoat').addEventListener('click', toggleBoat);

document.getElementById('btnSaveBoatPreset').addEventListener('click', () => {
  const name = boatPresetNameInput.value.trim();
  boatErrorEl.style.color = '#ff8a8a';
  if (!name) { boatErrorEl.textContent = t('boat.needName'); return; }
  const presets = loadBoatPresets();
  presets[name] = collectBoatPatch();
  saveBoatPresets(presets);
  refreshBoatPresetSelect();
  boatPresetSelect.value = name;
  boatErrorEl.style.color = '#7fe3a3';
  boatErrorEl.textContent = t('boat.saved', name);
});

document.getElementById('btnDeleteBoatPreset').addEventListener('click', () => {
  const name = boatPresetSelect.value;
  if (!name) return;
  const presets = loadBoatPresets();
  delete presets[name];
  saveBoatPresets(presets);
  refreshBoatPresetSelect();
  boatErrorEl.style.color = '#7fe3a3';
  boatErrorEl.textContent = t('boat.deleted', name);
});

// Selecting a saved boat loads AND applies it immediately — "choosing from
// the list of saved ones" is meant to actually sail that boat, not just
// stage its values for a separate Apply click.
boatPresetSelect.addEventListener('change', () => {
  const name = boatPresetSelect.value;
  if (!name) return;
  const presets = loadBoatPresets();
  const patch = presets[name];
  if (!patch) return;
  boatPresetNameInput.value = name;
  boatErrorEl.style.color = '#ff8a8a';
  if (applyBoatPatch(patch)) buildBoatFieldRows();
});

document.getElementById('btnExportBoat').addEventListener('click', () => {
  const name = boatPresetNameInput.value.trim() || 'boat';
  const patch = collectBoatPatch();
  const blob = new Blob([JSON.stringify({ name, config: patch }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('btnImportBoat').addEventListener('click', () => boatImportFile.click());
boatImportFile.addEventListener('change', async () => {
  const file = boatImportFile.files?.[0];
  boatImportFile.value = '';
  if (!file) return;
  boatErrorEl.style.color = '#ff8a8a';
  try {
    const data = JSON.parse(await file.text());
    const patch = data.config ?? data; // accept either {name,config} or a bare patch
    if (applyBoatPatch(patch)) {
      buildBoatPanel();
      const name = data.name || file.name.replace(/\.json$/i, '');
      boatPresetNameInput.value = name;
      boatErrorEl.style.color = '#7fe3a3';
      boatErrorEl.textContent = t('boat.imported', name);
    }
  } catch {
    boatErrorEl.textContent = t('boat.importFailed');
  }
});
