# ROUND 6 — flight recorder + replay (diagnostic tooling)

User sailing sessions keep producing observations that are impossible
to diagnose without the exact input sequence (three are pending below).
This round adds a session recorder to the UI and a headless replay tool,
exploiting the core's determinism (fixed dt, no wall clock, no
randomness) so any recorded session can be re-simulated EXACTLY and
inspected offline.

**Scope discipline:** this round is the recorder ONLY. The three
pending user reports (P-A/P-B/P-C below) must NOT be blind-fixed here —
they will be diagnosed from recordings in the next round. The only
permitted core change is what determinism verification requires.

---

## R6-1: Determinism guarantee (verify, don't assume)

Add a harness self-test: run any scenario twice from the same initial
state and assert bit-identical state traces (serialize each state to
JSON, compare hashes per step). If this fails, find and remove the
nondeterminism (Math.random, Date.now, iteration-order dependence,
accumulating dtFrame instead of fixed substeps) — that fix IS in scope.

## R6-2: Recording format (single JSON file)

    {
      "format": "simpjoa-recording",
      "formatVersion": 1,
      "codeVersion": <git short hash, embedded at bundle time>,
      "configVersion": <from CONFIG>,
      "configSnapshot": <the FULL effective config object>,
      "initialState": <full state at recording start>,
      "frames": [ { "dt": <dtFrame in s>, "controls": {…} }, … ],
      "stateChecksums": [ <hash every N frames, N=60> ],
      "annotations": [ { "t": <s>, "note": "user marker" }, … ]
    }

- frames capture EVERY step() call's (dtFrame, controls) in order —
  that plus initialState is sufficient for exact replay.
- stateChecksums every 60 frames let replay detect drift early and
  report the first divergent frame.
- Ring buffer capped at ~15 min of frames; oldest dropped with a
  visible "trimmed" flag in the JSON.

## R6-3: UI controls

- REC toggle button (red dot when live) + "download recording" button
  (JSON file, filename with date/time). Keyboard: F9 toggle, F10 mark.
- F10 / "mark" button drops an annotation at current t ("something
  weird happened HERE") — crucial for long recordings.
- Recording survives pause (pause frames are simply absent — no steps
  happen); capsize+reset ENDS the recording automatically (reset
  changes initialState) and offers the download.
- Show recording duration + estimated size in the HUD corner.
- No per-frame allocations beyond pushing into preallocated-growth
  arrays; recording must not affect the 60 fps budget.

## R6-4: Replay tool (harness/replay.js + npm-free CLI)

    node harness/replay.js <recording.json> [--csv out.csv] [--verify]

- Loads the JSON, applies configSnapshot (warn loudly if codeVersion
  or configVersion differ from the current tree), sets initialState,
  re-runs the exact frame sequence.
- --verify: compare stateChecksums; report PASS or the first divergent
  frame index (that means nondeterminism or version mismatch).
- --csv: dump the FULL replayed state + forces breakdown per frame
  (t, x, y, heading, u, v, r, phi, p, delta, alpha, alphaSailor, CL,
  CD, Fx/Fy sail, hull side force, ama drag+moment, rudder, amaLoad,
  timers, shunt phase, all controls) — the analysis surface.
- Annotations echoed into the CSV as a column.

## R6-5: Docs

README section: how to record, mark, download, and what to send for
diagnosis (the JSON alone suffices). One paragraph in the architecture
doc: determinism is now a TESTED contract — any future core change
that breaks the determinism self-test is a regression.

---

## Pending user reports (DO NOT fix in this round — await recordings)

- **P-A "boat is far too tippy":** real proas are stable platforms;
  the sim capsizes easily. Suspects (to be confirmed from recordings):
  crewPos knife-edge sensitivity (K-1 watch item), roll damping too
  low for gust transients, capsizing-branch angle too aggressive, or
  simply UI control ergonomics (sheet cannot be eased fast enough).
- **P-B "it can sail sideways":** possibly the post-saturation leeway
  "mushing" allowing sustained beam-on drift states; note that SOME
  sideways drift at low speed is real physics for a boardless canoe —
  the recording will show whether magnitude/persistence is plausible.
- **P-C "sail still on the wrong side":** the belly-by-pressure-side
  logic (round-5 P4.3) or a backwinded pressed state being rendered
  correctly but read as wrong. The recording + replay CSV will show
  alpha's sign vs the drawn belly side frame by frame.

## Deliverables

Recorder in ui/ (and in the regenerated bundle — recordings from the
standalone file must replay identically), harness/replay.js, the
determinism self-test wired into run_tests.js, README/architecture
updates, fresh test run (exit 0), bundle fidelity spot-check.
