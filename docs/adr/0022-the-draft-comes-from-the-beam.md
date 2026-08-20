# ADR 0022 — The draft comes from the beam

*Date: 2026-08-04*

Refines ADR 0021, which had to scale the hull's lateral area because no beam
was published.

## Context

ADR 0021 left hull beam and draft as the two remaining estimates, and named
them as exactly the numbers the weather-helm question turns on. It also
recorded a bad inference to be resisted: the brochure's storage dimension
(500 × 90 × 140 cm) hinting at a 0.90 m vaka.

The owner then gave the figure from memory: **50–55 cm**.

## Decision

**It is the gunwale beam, and the geometry proves it.** On this hull's own
section — Flay's V2, a 70° included keel angle, which is the form the side-force
curve is anchored on (ADR 0004) — a 0.50–0.55 m *waterline* beam would mean a
draft of 0.357–0.393 m and a displacement of **265–321 kg**, against the
published 165. The boat would have to be twice its own weight. So the figure is
the beam at the gunwale, and the hull flares above the water.

**The displacement then fixes the draft**, with no free parameter left:

```
V    = 165 / 1025                     = 0.161 m³
Amid = V / (L · Cp) = 0.161/(5.0·0.58) = 0.0555 m²
V-section: Amid = T²·tan 35°           → T = 0.282 m
waterline beam = 2·T·tan 35°           = 0.394 m   (~8 cm of flare per side)
```

`lateralArea = 5.0 × 0.282 = 1.41 m²`, replacing ADR 0021's scaled 1.50.
Cp 0.55–0.62 spans 1.36–1.45; 1.41 is the middle. `clrDepth` follows to 0.30 m.

`hull_beam_m` is recorded as 0.52 for the drawing — **no physics module reads
it**; only `ui/app.js` does, for the plan view and the section sketch.

## Consequences

**It cut the Munk moment by 18 %**, 266 → 218 N·m, because the added sway mass
goes as draft squared. That is the term the whole helm balance has been fighting
since ADR 0018.

**The boat got easier to balance — the first time in this sequence.** Settings
that hold the start-up course rudder-free, out of 108 searched:

| lateralArea | draft | Munk | hold | best |
|---|---|---|---|---|
| 1.50 (ADR 0021) | 0.300 | 266 | 6 | 3.2°, crew on the stop |
| 1.45 | 0.290 | 241 | 5 | 3.4°, crew on the stop |
| **1.41 (this)** | 0.282 | 218 | **8** | **2.3°, crew half aft** |
| 1.36 | 0.272 | 190 | 8 | 2.2°, crew on the stop |

**The order matters and is worth stating.** The value was derived from the
owner's beam, the published displacement and the hull form's own section angle
— three inputs, none of them a steering result. That it then improves the
helm is an *observation*, not the target. Had it made things worse, it would
have been adopted anyway; ADR 0021 adopted several changes that did.

**Start-up defaults re-searched again**: sheet 16°, tack forward, stays half
forward, crew half aft — 2.3° at 6.7 kn, against 5.4° before.

## What is still open

`hull.lead` and `hull.clrXFraction` — where the rig sits relative to the
lateral plane. Those are still estimates, and they are now the *only* thing
between the model and a measured helm balance. Flay's yaw moment (ADR 0018)
would settle the second; a tape measure from the mast step to amidships would
settle the first.
