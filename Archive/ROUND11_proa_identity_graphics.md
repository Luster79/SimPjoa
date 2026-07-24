# ROUND 11 — proa-identity graphics (UI only)

Goal: make it visually unmistakable that the user is sailing a proa —
crab-claw silhouette, flying ama, hull that never turns around, crew as
the primary helm — not a generic dinghy with a float.

**Hard rules:** UI layer ONLY — no changes under /core or /harness
beyond, at most, read-only additions to forcesBreakdown() if a value is
missing (each such addition listed explicitly in the summary). Bundle
regenerated with the 3-row polar fidelity spot-check. 60 fps with all
new elements enabled; no per-frame allocations in render paths (reuse
buffers). Every element added in BOTH ui/index.html and the standalone
bundle. All labels bilingual via the existing PL/EN toggle.

Implementation order: P1 items first (identity core), then P2
(readability), P3 last (cosmetics). Ship as separate commits per item
where practical.

---

## P1 — identity core

### R11-1: Live side-view inset (the crab-claw silhouette)

A small (~220x140 px, collapsible) live profile view, drawn as seen
from LEEWARD (so the ama sits behind the hull), showing:
- the crab-claw sail as the triangle between yard and boom, with the
  yard's rake and the actual delta driving its projected shape;
- brail state as the "carrot": sail gathering toward the yard with
  brail amount, ending as a lashed bundle at full furl (reuse the
  top-view brail mapping, projected);
- heel: the whole assembly rotates by phi; the ama lifts clear of a
  drawn waterline when flying (small gap + droplets cue) and presses
  in with a spray cue when phi < 0;
- crew figures on the platform at (crewPos, crewPosX), leaning
  naturally with heel;
- waterline as a simple animated line (2-3 px bob is enough).
Acceptance: with the main view covered, an observer can read from the
inset alone: roughly how hard the boat heels, whether the ama is
flying, whether the sail is full / brailed / furled, and where the
crew is. Verify at both ends (post-shunt mirror must be correct —
the leeward viewpoint flips with the tack).

### R11-2: Twin wake — ama trail separate from hull trail

Extend the wake system to sample TWO world-space trails: hull center
and ama center. The ama trail is drawn only while the ama is in the
water (amaLoad below the flying threshold / phi below liftoff) — while
flying, its trail simply has a GAP. Slightly different tints; same
ring-buffer discipline and toggle as the existing wake.
Acceptance: after a run with two gusts ridden on a flying ama, the
flight episodes are readable from the wake alone as gaps in one of the
two threads; a shunt shows the twin-thread "stitching" with the ama
thread always on the same geographic side.

### R11-3: Shunt narrative — prove the hull does not turn

- Phase strip: four icons (ease -> haul tack -> swap ends -> sheet in)
  lighting in sequence from state.shunt.phase, with the active phase's
  short label.
- Animated tack line: a visible line from the tack point being hauled
  along the leeward gunwale during 'transfer' (upgrade of the current
  slide marker into an actual line with a moving fairlead point).
- New-bow callout: a brief (~2 s) "BOW / DZIOB" tag popping at the
  newly active end at 'swap'.
- Hull-axis compass ribbon: a small linear compass strip showing TWO
  markers — hull physical axis and course-over-ground. During a shunt
  the COG marker sweeps ~180 deg while the hull-axis marker stays
  still.
Acceptance: single-stepping through a shunt (existing pause/step
controls), each phase is visually distinct; across the whole sequence
the hull-axis marker moves less than visual noise (~2 deg) while the
COG marker reverses.

## P2 — readability

### R11-4: Balance cross-section widget + HUD reordering

- A schematic transverse cross-section (hull - platform - ama) that
  heels with phi: crew figure at crewPos, sail-force arrow at CE
  height, righting arrow at the ama, both scaled by live magnitudes
  from forcesBreakdown(); amber/red tinting synced with the existing
  warning states (AMA FLYING, aback countdown).
- Reorder the HUD to proa priorities: ama load + heel first, speed/
  VMG second, sail trim third, rudder last.
Acceptance: in a building gust, the widget alone shows the moment
fight (sail arrow growing, crew moved outboard restoring balance);
a naive observer can articulate "the people are the ballast".

### R11-5: Apparent-wind safety sector (anti-aback)

An arc around the boat marking the safe apparent-wind sector; as the
apparent wind approaches the ama-side boundary, the boundary edge
glows amber then red BEFORE the aback alarm fires (thresholds derived
from the same angles stability.js uses — read them from CONFIG, do not
duplicate constants). The existing aback banner/countdown stays.
Acceptance: steering deliberately toward the wind line, the observer
gets an unmistakable escalating warning at least ~2 s before the aback
timer starts; no false glow on deep downwind courses.

### R11-6: Telltales

Two animated ribbon telltales on the stays (per the Pjoa manual's own
practice): streaming = attached flow, fluttering = luffing, drooping/
reversed = stalled or aback. Drive them from alphaSailor + the
luffing/stalled states; add slight noise so they look alive. Keep the
LUFFING/STALLED text tags as reinforcement.
Acceptance: sheet sweep from over-eased to over-trimmed reads as
stream -> flutter -> droop without looking at the HUD.

### R11-7: Steering oar drawn as an oar

Active oar: blade in the water with a small force-scaled swirl at the
blade; deflection visibly rotates the shaft. Inactive/shipped oar
(rudder-up control): drawn stowed along the deck, clearly out of the
water. Swap animates over ~0.5 s at shunt 'swap'.
Acceptance: at a glance one can tell which end steers and whether the
oar is shipped; the shunt visibly hands the oar over.

## P3 — cosmetics

### R11-8: Two skins — "Pjoa" (default) and "Micronesia"

- Pjoa: white/cream sailcloth, light modern hull, Masurian-lake water
  palette (matches the manual's photos — the boat this simulator
  actually models).
- Micronesia: pandanus-mat sail texture (simple weave hatching), dark
  timber hull, visible beam lashings, oceanic palette.
Skin = palette + fill styles only; geometry identical. Selector in the
Display panel; persists via the existing preset mechanism if trivially
compatible, otherwise per-session.
Acceptance: switching skins changes no gameplay reading (all cues from
R11-1..7 remain equally legible on both).

### R11-9 (OPTIONAL, only if time permits): first-shunt micro-tutorial

A dismissible one-time overlay triggered by the user's first shunt:
three short captions timed to the phase strip ("the hull will NOT turn
around", "the sail travels to the other end", "the ama stays to
windward"), each echoing the Pjoa manual's chapter IV in one sentence,
in the active language. No other tutorial scope in this round.

---

## Deliverables

Per-item commits; a short demo checklist mapping each acceptance
criterion to a manual verification step; updated key map / README;
regenerated bundle + fidelity spot-check; confirmation that /core and
/harness diffs are empty (list any forcesBreakdown() read-only
additions if made); a screenshot set (main view + inset + widgets) for
both skins for the project record.
