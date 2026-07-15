# STEP 1 SIGN-OFF + STEP 2 INSTRUCTIONS — browser UI

## Part A: Step 1 final review verdict (round 2) — ACCEPTED

Independent re-review of commit 068c671: 31/31 assertions pass, exit
code 0, and — critically — the thresholds of the pre-existing assertions
were verified verbatim against round 1: nothing was loosened. All three
round-2 findings are properly resolved:

- **R2-1:** induced drag implemented on the raw leeway angle, mushing
  falloff past saturation, plus a genuine extra insight found during the
  work: the polar optimizer was dodging the leeway penalty by ballasting
  crew fully onto the ama at TWA 40, so a crew-immersion drag term was
  added. speed(40) is now 29.3% of global max (threshold 35%, untouched).
- **R2-2:** probe moved to a lift-dominated trim at full windward brail;
  assertion strengthened with driveDrop > -0.05; passes.
- **R2-3:** alphaSailor exposed end-to-end through sailCoefficients ->
  sailForces -> forcesBreakdown; amaLoadDisplay capped via CONFIG while
  capsize timers verified to fire from the raw value.

**Watch items carried forward (NOT to be fixed in Step 2 — logged for
the future calibration stage):**
1. The polar is globally depressed by the R2-1 tuning: speed(TWS 6,
   TWA 90) = 2.03 m/s sits at the very bottom of the [2.0, 3.6]
   acceptance band, and the peak moved aft to TWA 140 (the 90-135 window
   holds 96% of global max, within the original 85% tolerance). Both
   pass legitimately; final numbers await calibration against real-boat
   data (Dierking designs, Di Piazza wind-tunnel tables).
2. bestYardAngle jitter at TWA 160 (flat downwind optimum) — cosmetic.

**THE CORE IS NOW FROZEN.** Step 2 must not modify anything under /core
or /harness. If a UI need seems to require a core change, stop and
report it instead of making it.

---

## Part B: Step 2 — the browser UI

Build the interactive 2D top-down simulator UI specified in
PROMPT_proa_simulator_EN.md ("Interface" section), on top of the
unmodified Step 1 core. Everything below refines that specification;
where they differ, this document wins.

### B1. Packaging (read carefully — there is a file:// trap)

ES-module imports do NOT work from file:// URLs in Chromium browsers,
so "a single HTML file opened locally" and "imports the core as
modules" conflict. Resolve it with BOTH deliverables:

1. **ui/index.html** — imports /core modules directly via ESM. Works
   when served over HTTP. Add a one-line note in the README:
   `python3 -m http.server` (or `npx serve`) from the repo root.
   This is the development entry point.
2. **tools/bundle.js** — a small dependency-free Node script (NOT a
   build framework) that inlines the core modules and the CSV data into
   **dist/simulator_standalone.html**: a truly single, offline,
   double-clickable file. Simplest robust approach: strip import/export
   statements and concatenate modules in dependency order inside one
   <script type="module">, and embed data/crab_claw_CL_CD_polhamus.csv
   plus example_proa_parameters.csv as JS string constants consumed by
   the same parseCSV path config.js already uses. The bundle must stay
   byte-for-byte faithful to core logic — no forked physics.

Acceptance for B1: the standalone file works opened directly from disk;
index.html works over a local server; both produce identical polars
(spot-check three TWA rows).

### B2. Simulation loop

- requestAnimationFrame for rendering; physics stepped via the core
  facade's step(controls, dtFrame), which already substeps at fixed dt.
  Clamp dtFrame to 100 ms max (tab-switch protection).
- The UI reads state exclusively via getState() and forcesBreakdown().
  For the HUD use **alphaSailor** (not raw alpha) and **amaLoadDisplay**
  (not raw amaLoad).
- Pause button + single-step button (invaluable for inspecting the
  shunt sequence frame by frame).

### B3. Scene rendering (canvas 2D, top-down)

- Camera follows the boat; water as a subtle grid that scrolls with
  world position (conveys motion); optional wind streaks aligned with
  true wind.
- Boat drawing: main hull (slender), two crossbeams, ama at +y side,
  the yard/sail as an arc from the active tack; sail fill changes with
  brail state (taut / creased for brailLee / deeply curved for
  brailWind / furled bundle at 100/100). Crew as a dot on the beams at
  crewPos. Active bow marked (small arrowhead) — it flips on shunt.
- Shunt animation driven by state.shunt.phase/progress from the core:
  show the tack point sliding along the hull during 'transfer', bow
  marker swap at 'swap', sheet-in during 'sheet'. Do not animate from a
  UI-side timer — mirror the core's phases so visuals never desync.
- Force vectors (toggle, default on): sail lift, sail drag, resultant,
  hull side force, rudder force, from forcesBreakdown(), drawn at their
  application points, log-scaled for legibility with a small legend.
- True-wind arrow fixed in a corner with speed label; apparent-wind
  arrow attached to the boat.

### B4. Controls

Sliders (panel) with keyboard equivalents, exactly the semantics of the
core's controls object:
- wind direction / wind speed (2-12 m/s)
- yard angle: arrow keys; rudder: A/D (auto-centering optional toggle)
- brailLee: Q/Z, brailWind: W/X (0-100%)
- crewPos: J/L (-0.3..+1.0)
- SHUNT: spacebar (respect the core's speed lockout — if refused, flash
  the speed readout and show "ease sail first")
- R: reset after capsize

### B5. Alarms and states

- Aback: pulsing red border + "ABACK — ama to leeward" banner while
  state.abackTimer > 0, with a visible countdown toward
  config.stability.abackCapsizeTime.
- Overload: amber ama-load bar turning red above 100%, countdown toward
  overloadCapsizeTime while overloading.
- Capsize: dim scene, show cause (aback vs overload) and a reset prompt.

### B6. HUD

Speed [knots], TWA, AWA, alphaSailor [deg], VMG upwind [knots], ama
load [%] (from amaLoadDisplay, as a bar), leeway [deg], shunt phase.
Small numeric wind readout. Keep it in one compact strip.

### B7. Polar mode

A "Polar" button runs the measurement in-browser by REUSING
harness/polar.js computePolar (bundle it too) against the current
config, with a progress indicator, then overlays the polar diagram
(canvas, radial plot, one curve per TWS in {4, 6, 8, 10} m/s) with the
live boat's current (TWA, speed) point plotted on it. Provide "export
CSV" (download) for the computed polar.

### B8. Step 2 acceptance checklist (verify manually before delivering)

1. All ten acceptance criteria from PROMPT_proa_simulator_EN.md now
   demonstrably hold interactively (criteria 1-9 were proven headless in
   Step 1; here confirm the UI faithfully surfaces them).
2. Shunt animation phases match state.shunt.phase at all times,
   including a shunt attempted above the speed lockout.
3. Aback drill: steer through the wind line — alarm appears before
   capsize with a readable countdown; capsize overlay names the cause.
4. Squall drill (manual): raise wind 4->10 m/s and survive using only
   Q/Z, W/X, J/L — confirm it is challenging but doable, mirroring the
   headless squall scenario.
5. 60 fps with vectors on at default window size; no GC stutter from
   per-frame allocations in the render path (reuse objects/arrays).
6. Standalone bundle passes checks 1-5 identically.

### B9. Deliverables

ui/index.html, tools/bundle.js, dist/simulator_standalone.html,
updated README (run instructions, key map), and the known-simplifications
list required by the main prompt — include at minimum: fixed CE / no
tack slide during transfer (LOW-1 from round 1), static ama-load
(no roll dynamics), crew-immersion drag model, no waves/current, and
the Part A watch items.
