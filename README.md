# SimPjoa — Polynesian proa simulator

A 2D top-down simulator of a Polynesian proa with an oceanic crab-claw
rig. Physics core (Step 1) is a headless, dependency-free ES module set
in `/core`, driven by a browser UI (Step 2) in `/ui`. See
`PROMPT_proa_simulator_EN.md` and `ARCHITECTURE_physics_core_EN.md` for
the full spec, and `STEP1_SIGNOFF_and_STEP2_instructions.md` for the
Step 2 brief this UI implements.

## Step 1 — physics core & headless tests

```bash
node run_tests.js
```

Runs the full acceptance-criteria suite, prints pass/fail per assertion,
and (re)writes scenario + polar CSVs to `/out`. Exit code is non-zero on
any failure. `/core` and `/harness` are frozen as of the Step 1 sign-off
— Step 2 only reads from them.

## Step 2 — browser UI

Two ways to run it, both driving the exact same unmodified core:

**Development (served over HTTP):**

```bash
python3 -m http.server 8000
# then open http://localhost:8000/ui/index.html
```

A local server is required — ES module imports (used to load `/core`
directly) don't resolve from `file://` URLs in Chromium-based browsers.
`ui/index.html` remaps the `node:fs`/`node:url`/`node:path` specifiers
that `core/config.js` imports (to load its two CSV data files) to
browser shims in `ui/shims/`, via an import map — `core/config.js`
itself is untouched.

**Standalone (single offline file):**

```bash
node tools/bundle.js       # regenerate dist/simulator_standalone.html
```

`dist/simulator_standalone.html` is already built and committed;
double-click it (or open via `file://`) — no server, no network. It
inlines `/core`, `harness/polar.js`, `ui/app.js`, and both CSV data
files into one script. `tools/bundle.js` is a small dependency-free
source-text transform (strip `import`/`export`, concatenate, embed the
CSVs as string constants) — not a build framework, and it doesn't touch
core logic. Re-run it after changing anything under `/core`,
`harness/polar.js`, or `ui/app.js`.

### Language

The UI has an EN/PL toggle button (top-right of the HUD bar, next to
Pause). It switches all interface text — labels, HUD, hints, alarms,
polar mode — and remembers your choice (`localStorage`) across reloads;
it defaults to Polish if the browser's language is Polish, English
otherwise. Documentation (this file, code comments) stays English-only.

### Controls

| Action | Control |
|---|---|
| Wind direction / strength | sliders |
| Sheet (szot) — MAXIMUM yard angle, not the actual yard | `←` / `→`, or slider |
| Leeward brail | `Q` sheets in, `Z` eases |
| Windward brail | `W` sheets in, `X` eases |
| Rudder | `A` / `D` (auto-centers on release), or slider |
| Crew position | `J` toward leeward, `L` toward the ama, or slider |
| Shunt | `Space` (held or click), respects the speed lockout |
| Reset (after capsize, or any time) | `R` |
| Pause / single-step | `P` / `.` |
| Toggle force-vector overlay | `F` |
| Polar mode | `O` |
| Wake trail (kilwater) | checkbox in the Display panel |

The yard's ACTUAL angle (`state.delta`) is real, dynamic state now (round
5) — the sheet only ever limits how far it can swing; the HUD shows both
side by side (Sheet / Yard) plus a LUFFING tag when the wind, not the
sheet, is holding it below the limit. See `ARCHITECTURE_physics_core_EN.md`'s
"Sheet constraint" notes.

Force vectors (when on): yellow = sail lift, red = sail drag, green =
hull side force, blue = rudder force — drawn at their application
points, log-scaled for legibility. Apparent wind arrow is the cyan
vector at the boat; true wind is the fixed arrow, top-left.

Polar mode runs `harness/polar.js`'s `computePolar` in-browser against
the live config (TWS 4/6/8/10 m/s) with a progress readout — it's the
same expensive grid-search sweep `run_tests.js` runs, so it takes on
the order of a minute or two. "Export CSV" downloads the result in the
same column layout as `out/polar.csv`.

## Known simplifications

Physics-core simplifications carried from Step 1 (and still true in
Step 2, since the UI doesn't change them):

- **No tack slide during the shunt's `transfer` phase.** The yard heel
  doesn't have a continuously-tracked fore-aft position in the core —
  sail forces are already faded to zero for the whole `transfer`/`swap`
  window, so this has no force-model consequence. The UI adds a purely
  cosmetic sliding-tack animation during `transfer` to match the
  prompt's visual expectation without implying the core tracks it.
- **CE geometry is a simplified tack-to-clew model**, not a full
  sail-shape/camber-aware computation: `sail.tackXFraction` (mast/tack
  position) and `sail.CEheight`/2 (characteristic chord scale) combine
  with the actual yard angle (`state.delta`) into a real, moving CE —
  see `ARCHITECTURE_physics_core_EN.md`'s aero.js section (round 5).
- **Roll is a real 2nd-order DOF** (`phi`, `p` — integrated roll angle
  and rate, round 4), not a static ratio; `amaLoad` is derived from
  `phi`. The righting curve itself is piecewise (ease-out, flat, then a
  genuine capsizing arm past `phiCapsizeDeg`, round 5) rather than a
  single formula — see `ARCHITECTURE_physics_core_EN.md`'s stability.js
  section.
- **Crew-immersion drag model is a linear approximation.** Crew weight
  toward the ama presses it deeper (`ama.crewImmersionCoeff`, added in
  round 2 to close a ballast exploit — see
  `FIX_REQUEST_step1_round2.md` R2-1); this is a straight-line fraction
  of crew mass vs. ama buoyancy, not a hull-shape-aware immersion curve.
- **No waves or current.** Water is a still reference frame; wave
  resistance is a Froude-number penalty term on the hull only, not a
  simulated sea state.

Carried forward from the round-2 sign-off (`STEP1_SIGNOFF_and_STEP2_instructions.md`
Part A) as calibration watch items, not bugs:

- The polar is globally on the low side of the tuning that fixed the
  round-2 upwind-pointing finding: `speed(TWS 6, TWA 90)` sits near the
  bottom of the prompt's `[2.0, 3.6] m/s` acceptance band, and the
  speed peak sits further aft (~TWA 140) than a typical reaching boat.
  Both pass the acceptance criteria as written; final numbers await
  calibration against real-boat reference data (Dierking designs, Di
  Piazza wind-tunnel tables) mentioned in `data/README_input_data_EN.md`.
- `bestSheetAngle` jitters at TWA 160 in the polar (a flat downwind
  optimum where several trims give near-identical speed) — cosmetic,
  the speed curve itself is smooth there.

UI-specific simplifications (Step 2 only, not physics):

- Sail is drawn as a simple curved quad from a fixed-fraction tack
  point to the yard's swept clew; it's a visual approximation of a
  crab-claw's shape, not a rendering of the actual aerofoil section.
- The polar sweep blocks the live scene (physics is paused) while it
  runs, since it reuses the same headless `computePolar` grid search
  the test suite uses — no separate fast-preview mode.
- No persistence: reloading the page resets to the default trim.

## Project layout

```
core/                 Step 1 physics core (frozen — see sign-off doc)
harness/               Step 1 test harness (asserts.js, scenarios.js, polar.js, export.js)
run_tests.js           Step 1 entry point
out/                    Step 1 scenario/polar CSV output
ui/
  index.html            Step 2 dev entry point (ESM, needs an HTTP server)
  app.js                All UI logic: rendering, controls, HUD, alarms, polar mode
  shims/                node:fs / node:url / node:path browser shims for the dev entry point
tools/
  bundle.js             Generates dist/simulator_standalone.html
dist/
  simulator_standalone.html   Offline, double-clickable build (generated — re-run tools/bundle.js after core/ui changes)
data/                  CSV input data (aero table, boat parameters, reference driving-force curve)
```
