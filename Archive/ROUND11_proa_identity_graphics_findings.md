# Round 11 findings report — proa-identity graphics

Status: all P1 (R11-1..3) and P2 (R11-4..7) items landed, plus P3's
R11-8 (skins). R11-9 (first-shunt micro-tutorial) was explicitly
optional ("only if time permits") and was skipped in favor of finishing
the required items and the verification/documentation deliverables —
not attempted, not partially done.

`/core` and `/harness`: zero diff across every round-11 commit (verified
directly: `git diff <round-10d-tip>..HEAD -- core/ harness/` is empty).
No `forcesBreakdown()` additions were needed — every widget reads fields
already returned by `computeForces()`/`sim.forcesBreakdown()`
(`amaLoadDisplay`, `alphaSailor`, `luffing`, `aw`, and
`breakdown.roll.{Msail,Mrestore}`), or a pure, already-exported function
(`core/sheet.js`'s `deltaAlign`) imported directly rather than
re-derived.

## Per-item summary

- **R11-1** (side-view inset): a 220x140px collapsible profile view,
  drawn in its own clipped screen-space region with a local heel
  rotation (`ctx.rotate(-state.phi)`). `state.end` flips which physical
  direction reads "forward" so the picture mirrors correctly across a
  shunt. Verified live (headless Chromium): renders without errors,
  legible at default proportions after one round of pixel-budget
  retuning (the hull was initially too small relative to the sail/ama —
  fixed by switching from a boat-length-derived scale to a fixed
  schematic pixel budget, since this is an identity cue, not a
  measuring tool).
- **R11-2** (twin wake): a second `wakeAmaX/Y` array sampled every step
  from `amaWorldPos()` (the same physical-frame geometry `drawBoat()`
  already uses for the ama sprite), with `NaN` gap markers pushed
  whenever `amaLoadDisplay>=1` (full liftoff — the "AMA FLYING"
  threshold). `drawTrail()` is a shared polyline drawer that breaks the
  path at any `NaN`. Verified live: steering a curved course shows two
  distinct-colored trails; zoomed screenshot confirms both render.
- **R11-3** (shunt narrative): phase strip (4 icons keyed off
  `SHUNT_PHASE_ORDER.indexOf(state.shunt.phase)`), an upgraded hauled
  tack-line-with-fairlead during 'transfer', a BOW/DZIOB callout
  triggered on the `phaseBefore==='swap' && state.shunt.phase==='sheet'`
  edge (the exact step `core/shunt.js` flips `state.end`), and an
  always-visible hull-axis-vs-COG compass ribbon. Verified live driving
  a full shunt sequence: phase strip advanced through all four stages in
  order, the BOW tag popped exactly as TWA flipped to its reciprocal,
  and the COG marker swept to the ribbon's far edge while the hull-axis
  marker held center — see `docs/round11_screenshots/`.
- **R11-4** (balance widget + HUD reorder): a bow-on cross-section
  widget reading `breakdown.roll.Msail`/`Mrestore` directly (no new
  physics — these are already computed every step) for its two arrows;
  warn/danger tinting reuses the exact thresholds the heel bar and aback
  banner already use. HUD reordered per the work order's own priority
  list.
- **R11-5** (safety sector): imports `deltaAlign` from `core/sheet.js`
  directly rather than re-deriving or duplicating any threshold — the
  arc's highlighted segment glows amber (within a UI-only 20deg render
  margin) then red as `deltaAlign` approaches/crosses its real zero, the
  same crossing round 10d's H2 diagnosed as the through-gybe corner.
  Structurally earlier than the aback timer, which only starts once the
  ama is already pressed underwater — not tuned to a specific lead time,
  guaranteed by which physical event each one reads.
- **R11-6** (telltales): two ribbons near the tack driven from
  `forces.alphaSailor`/`forces.luffing`/the existing `stalledTimer`,
  with small sine-based noise so they read as alive.
- **R11-7** (steering oar): shaft rotation now uses the real deflection
  (`dims.rudder.maxDeflectionDeg`, read from CONFIG) with a force-scaled
  swirl at the blade; `rudderUp` draws the active oar stowed flush along
  the deck instead of just dimmed in place; the active/idle role
  crossfades between the two FIXED physical tips over the 'swap'
  sub-phase's own progress (predicting the post-swap role directly,
  since `state.end` itself doesn't flip until 'swap' completes) instead
  of jumping.
- **R11-8** (skins): a `SKINS`/`getSkin()` palette lookup read by
  `drawBoat()`, the side-view inset, and the balance widget alike (one
  source of truth, so all three stay in sync when the selector changes).
  Micronesia adds pandanus-mat hatching (clipped to the sail's own
  `Path2D`), timber hull/ama tones, visible beam lashings, and an
  oceanic water palette; geometry is untouched either way. Persists via
  `localStorage` (pure UI state, not a CONFIG/physics field — the
  boat-design preset mechanism round-trips `createConfig()` patches,
  which a skin choice isn't).

## Incidental fix found by the bundle-fidelity spot-check

The UI's own "Export CSV" button (polar mode) hardcoded its own
CSV header/row string, which was never updated when round 10c added
`bestBrailWind` to `computePolar()`'s row shape (`run_tests.js`'s own
`out/polar.csv` writer WAS updated at the time). Caught directly by this
round's spot-check: the bundle's exported CSV had 6 columns where
`out/polar.csv` has 7. Pre-existing, unrelated to round 11's own work,
but a trivial one-line UI-layer fix squarely in scope — fixed rather
than just noted, then re-verified.

## Bundle fidelity spot-check

Ran the full polar sweep (TWS 4/6/8/10) inside a headless-Chromium load
of the rebuilt `dist/simulator_standalone.html`, exported its CSV, and
diffed 3 rows (TWA 40/90/170 @ TWS6) against `out/polar.csv` (the
source's own `run_tests.js` output):

| TWA | TWS | bestSpeed (source) | bestSpeed (bundle) | bestSheetAngle | deltaAngle | bestBrailWind |
|---|---|---|---|---|---|---|
| 40 | 6 | 2.7633 | 2.7633 | 4 (both) | 4.00 (both) | 0 (both) |
| 90 | 6 | 4.2306 | 4.2306 | 28 (both) | 28.00 (both) | 0 (both) |
| 170 | 6 | 3.1060 | 3.1060 | 44 (both) | 44.00 (both) | 0.6 (both) |

Exact match on every field for all 3 rows, post the CSV-export fix
above. Expected — `/core` and `/harness` have zero diff this round, and
`tools/bundle.js` is a pure text-concatenation transform — but verified
directly rather than assumed.

## Deliverables checklist

- [x] Per-item commits (9 commits: R11-1 through R11-8, plus one
      incidental CSV-export fix).
- [x] Demo checklist mapping each acceptance criterion to a manual
      verification step — `ROUND11_demo_checklist.md`.
- [x] Updated key map / README — new "Proa identity graphics" section
      and 2 new control-table rows in `README.md`.
- [x] Regenerated bundle + fidelity spot-check (above).
- [x] Confirmation that `/core` and `/harness` diffs are empty; no
      `forcesBreakdown()` additions were made.
- [x] Screenshot set (main view + inset + widgets, both skins) —
      `docs/round11_screenshots/`.
- [ ] R11-9 (optional micro-tutorial) — not attempted, per the work
      order's own "only if time permits."
