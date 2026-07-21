# Round 11 demo checklist

Manual verification steps for each work-order acceptance criterion.
Run against `ui/index.html` (served, e.g. `python3 -m http.server 8000`)
or `dist/simulator_standalone.html` directly — both carry the same
`ui/app.js`.

## R11-1 — side-view inset

1. Load the page; the inset (top-right, "side view (leeward)") is on by
   default. Toggle "Side-view inset" in Display off/on to confirm the
   checkbox works.
2. Cover the main view (or just look only at the inset). Ease/trim the
   sheet and pull the windward brail — confirm you can read: roughly how
   hard the boat heels, whether the ama is flying (droplets, lifted) or
   pressed (spray cue, dipped), whether the sail is full / brailed /
   furled, and where the crew is (drag the crew pad).
3. Trigger a shunt (`Space`, held, below the speed lockout) and let it
   complete. Confirm the inset's sail/mast/crew picture is still correct
   relative to the NEW active bow afterward (not frozen to the old side).

## R11-2 — twin wake

1. Enable "Wake trail" in Display. Sail for 20-30s with the rudder
   deflected so the hull trail curves.
2. Force the ama to fly (e.g. trim in hard on a reach, `crewPos` toward
   the ama) for a several-second stretch, then ease back off.
3. Confirm the ama's own trail (differently tinted) shows a literal gap
   for the flying stretch while the hull trail stays continuous.
4. Shunt once; confirm both threads show the reciprocal-leg "zigzag" and
   the ama thread stays on the same geographic side across the swap.

## R11-3 — shunt narrative

1. Trigger a shunt and use Pause (`P`) / Step (`.`) to single-step
   through it.
2. Confirm the 4-icon phase strip lights ease -> transfer -> swap ->
   sheet in sequence, with the active phase's label underneath.
3. During 'transfer', confirm the tack line grows from its start point
   along the leeward gunwale with a visible fairlead ring at the moving
   end (not a static tick).
4. The instant 'swap' completes (phase reads "sheeting in"), confirm a
   "BOW"/"DZIOB" tag pops at the newly active end for ~2s.
5. Watch the compass ribbon (below the phase strip, always visible)
   through the whole sequence: the hull-axis marker should not move at
   all while the COG marker sweeps across to the far side.

## R11-4 — balance widget + HUD reorder

1. Confirm the HUD bar (top) reads, left to right: Ama load, Heel,
   Speed, VMG, Sheet, Yard, then TWA/AWA/AoA/Leeway/Shunt/TWS.
2. Sheet in hard on a reach to build a gust-like load. Watch the
   balance widget (bottom-left): the sail-force arrow should grow, and
   moving crew toward the ama (`L` or the crew pad) should visibly grow
   the righting arrow and ease the heel.
3. Load it past `amaLoadDisplay`'s 0.75/1.0 thresholds and confirm the
   widget's background tints amber then red in sync with the existing
   heel bar and aback banner.

## R11-5 — apparent-wind safety sector

1. On a broad reach, steer deliberately toward the wind crossing to
   leeward (bear away hard, or ease the sheet while holding course
   downwind past dead-run). Watch the arc around the boat: the
   highlighted segment should ramp from blue through amber to red BEFORE
   the "ABACK WARNING"/"ABACK" banner appears (round 10d, H2).
2. Sail a variety of deep-downwind courses (TWA 150-178) without
   approaching the actual crossing — confirm the arc stays blue/safe
   (no false glow just from being deep).

## R11-6 — telltales

1. Start over-eased (sheet let out far past the yard's natural angle) —
   confirm the telltales flutter (matches the LUFFING tag).
2. Sheet in to a normal trim — confirm they stream steadily (with a
   little life-like noise, not perfectly static).
3. Over-trim/pinch until the STALLED tag lights — confirm the telltales
   droop/reverse.

## R11-7 — steering oar

1. With `rudderUp` unchecked, deflect the rudder slider/`A`/`D` fully
   one way then the other — confirm the active oar's shaft visibly
   rotates and a small swirl appears at the blade at speed.
2. Check `rudderUp` — confirm the active oar draws stowed flush along
   the deck (not just dimmed in place).
3. Trigger a shunt — confirm the active/idle role crossfades smoothly
   between the two physical oars over the ~0.4s swap, rather than
   jumping instantly.

## R11-8 — skins

1. Switch the Display panel's Skin dropdown between "Pjoa" and
   "Micronesia". Confirm: hull/ama darken to timber tones, the sail
   picks up a woven-mat hatching, beam lashings appear on the
   crossbeams, and the water palette shifts — in the main view, the
   side-view inset, AND the balance widget simultaneously.
2. Confirm every other reading from R11-1..7 (heel, ama state, sail
   state, wake, shunt narrative, safety sector, telltales, oar) stays
   equally legible on both skins.
3. Reload the page — confirm the last-selected skin persists.

## Deliverables sanity

- `git diff <round-11-start>..HEAD -- core/ harness/` is empty (verified
  in-repo; no `forcesBreakdown()` additions were needed either).
- `node tools/bundle.js` regenerates `dist/simulator_standalone.html`
  cleanly; a 3-row polar spot-check (TWA 40/90/170 @ TWS6) run inside
  the bundle matches `out/polar.csv` — see
  `ROUND11_proa_identity_graphics_findings.md`.
