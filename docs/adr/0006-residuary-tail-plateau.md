# ADR 0006: Plateau the residuary Gaussian's tail instead of letting it decay to 0

Date: 2026-07-22

## Context

ADR 0001 established a bounded Gaussian hump for residuary resistance,
`Cr(Fr) = residuaryPeakCr * exp(-((Fr - residuaryFrPeak) / residuaryFrWidth)^2)`,
falling away past the hump as "semi-planing relief." That fall-away was
left uncapped: for Fr well past `residuaryFrPeak` the Gaussian tends to 0,
so residuary resistance at high speed drops back to essentially
friction-only.

`harness/polar.js`'s steady-state settle gate had an independent bug
(fixed here as P2, docs/work-order-2026-07-22.md): it accepted a boat as
"settled" after 10 *consecutive* per-step deltas below a tight threshold,
which a boat riding up the residuary hump's slower shoulder — genuinely
still accelerating, just slowly — could satisfy long before actually
reaching its true steady speed. This hid a second, faster equilibrium
sitting on the uncapped Gaussian's low tail: once P2's fix (a 10s
trailing-window spread check) let the polar sweep actually reach that
branch, the polar's peak speed at TWS=6 jumped from ~4.4 m/s to ~7.6 m/s,
resurfacing the exact 100-500x-style unboundedness ADR 0001 was written to
eliminate, just on the falling side of the hump instead of a hard wall
above it (see `docs/diagnostic-2026-07-22-residuary-hump.md` for the full
numeric trace, including a plateau-value sweep from 0.05 to 0.25).

A slender hull's residuary resistance falling all the way back to
~friction-only past the hump has no literature support here either —
Dierking's proa speed data and the Di Piazza CR ratio (~0.69,
`harness/asserts.js`'s deep-course speed-ratio check) both imply reach
speeds well short of what the uncapped tail produces (>14.4kn at TWS=6,
vs. an expected ~12.2kn).

## Decision

Hold `Cr`'s tail at a plateau fraction of its peak value for `Fr >
residuaryFrPeak`, instead of letting the Gaussian continue toward 0:

```
Cr(Fr) = residuaryPeakCr * gaussian(Fr),                                      Fr <= FrPeak
Cr(Fr) = residuaryPeakCr * (residuaryTailPlateau + (1 - residuaryTailPlateau) * gaussian(Fr)),  Fr > FrPeak
```

`residuaryTailPlateau = 0.35`. The diagnostic's own 2-seed hysteresis probe
(TWA135, u0=1.0 vs 6.5, 400s settle) only needs plateau >= 0.10 to collapse
the two branches to one — its own sweep reported 0.25 as a comfortable
margin above that. But P1's stated acceptance bar is stricter than that
2-point probe: **total resistance must be non-decreasing across the whole
3-9 m/s range**, not just agree at two sampled seed speeds. A fine-grained
(0.02 m/s step) sweep of `hullResistance()` found a small residual dip
(~1.1 N, ~0.5%) still present between u=4.5 and u=5.5 at plateau=0.25 —
invisible to the 2-seed hysteresis check, since neither seed lands in that
narrow window, but a literal violation of "non-decreasing." The same sweep
found the dip vanishes entirely (to floating-point noise) at plateau >=
~0.32; 0.35 clears that threshold with margin.

This does not revisit ADR 0001's hump-shape decision (peak location,
width, or the "gear change" characteristic itself remain as decided
there) — only the tail's asymptotic behavior past the hump.

## Consequences

- Reach speed at TWS=6 caps at ~11.9kn instead of exceeding 14.4kn (below
  the ~12.5kn top-speed figure builders report for this design);
  `out/polar.csv` regenerated and committed alongside this change (CI
  byte-gates it).
- The hidden fast branch P2's settle-gate fix exposed is no longer
  unphysically fast — it is capped by the same plateau that bounds the
  ordinary hump-shoulder speed, so P2 and P1 together (not either alone)
  restore a single physically-plausible steady-state branch per
  TWA/TWS/sheet/crewPos combination instead of two.
- `harness/asserts.js`'s polar-smoothness assertion and the deep-course
  speed-ratio assertion, both broken by P2 alone (see work order P3), are
  re-evaluated against the P1+P2 combined model rather than either fix in
  isolation.
