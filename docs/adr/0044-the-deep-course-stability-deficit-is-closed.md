# ADR 0044 — The deep-course stability deficit is closed; what remains is an authority asymmetry

*Date: 2026-08-13*
*Supersedes ADR 0028's closing diagnosis and its "remaining work" paragraph. Its
withdrawal of the paddle excuse, and its reading of the manual, both STAND.*

## Context

ADR 0028 (2026-08-05) closed with:

> At TWA 160 every trim moment at release is already within a few N·m of zero —
> sail +2, hull −3, ama +4 — so this is not an authority shortfall. It is the
> directional-stability deficit that S1b/S1c carry: **no restoring yaw moment
> from the hull, a destabilising Munk moment, so any perturbation grows.**
>
> the near-dead run needs the missing restoring terms — the heel-dependent hull
> force and the ama's absent lateral plane — because no control the boat has
> will trim it out.

Four physics changes landed after that date: ADR 0032 (the hull's centre of
lateral resistance migrates with drift angle), 0033 (heave), 0036 (the ama's own
migrating CLR — one of the two terms 0028 asked for), 0038 (pitch). Nobody
re-ran 0028's diagnosis against them, so its conclusion has been carried forward
by every later reader as if it still held.

It does not.

## Measured (2026-08-13, TWS6, trim neutral, corrected probe per ADR 0039)

**Directional stiffness `dM/dpsi` at the settled state, N·m/deg:**

| TWA | 90 | 130 | 150 | 160 | 165 | 170 | 175 | 180 |
|---|---|---|---|---|---|---|---|---|
| dM/dpsi | −19.2 | −16.5 | −11.5 | −11.9 | −11.6 | −11.0 | −9.9 | −8.7 |

**Restoring at every deep angle, to the dead run.** It weakens toward TWA180 but
never changes sign. ADR 0028's "no restoring yaw moment from the hull ... any
perturbation grows" describes a boat that no longer exists; ADR 0036 supplied
one of the two terms it asked for, and ADR 0032's migrating hull CLR supplied
the effect of the other.

**Control authority is not the constraint either.** Releasing the oar under 162
trims from each settled start, 300 s:

| start | reachable settled TWA | spread |
|---|---|---|
| TWA150 | 33 … 154 | 121° |
| TWA160 | 33 … 154 | 121° |
| TWA170 | 42 … 180 | 138° |
| TWA180 | 43 … 180 | 137° |

## Decision

**Withdraw ADR 0028's stability diagnosis and its remaining-work paragraph.**
The deep-course problem is not a missing restoring moment and not a shortage of
total authority. It is an **asymmetry**: from TWA150 the boat can luff 117° and
bear away 4°.

The mechanism, and it is consistent across three independent readings:

- Every fore-aft steering control acts through `xCE * Fy` (`core/aero.js`'s
  `yawMoment`) — the tack, the crew's fore-aft position, `lead`, and the
  carrot's own `ceBrailXShift`. ADR 0026 established this; what is new is where
  it bites. At TWA170 the settled state carries **1.34° of leeway and 0.21° of
  heel**, so `Fy` is nearly zero and every one of those controls loses its
  purchase. The manual's primary bear-away control has nothing to act on
  exactly where the manual prescribes it.
- The ama's drag yaw moment IS modelled (`core/hydro.js` `amaDrag`, the manual's
  own rule III.3) and is not a missing term. But the ama sits to WINDWARD, so
  its drag **luffs**. Bearing away needs that moment reduced, and it is bounded
  below by zero, while luffing is bounded only by full immersion. Measured at
  TWA150: the ama's yaw moment runs 7.8 → 65.0 N·m across `crewPos` 0 → 0.6 and
  falls to 0 at `crewPos = 0.933` (the ama flies). The asymmetry is structural,
  not a coefficient.
- `sail.yceBrailShift` (≈0.553) makes the carrot *shrink* the sail's lateral CE
  arm, which weakens `−yCE * Fx` — the one bear-away path that survives downwind
  because it scales with drive force rather than side force. This is a free
  parameter working against the source's stated intent and is the first thing to
  re-derive.

**`yawHeelSign` / `heelClrSign` are NOT the fix here** and should not be reopened
for this purpose: at TWA170 the settled heel is 0.21°, so any `sin(phi)` term
contributes nothing. Their standing negative result (this file's own config
comment) is untouched by this ADR.

## Consequences

- ADR 0028's paddle withdrawal, its quotation of the manual's downwind recipe,
  and its "a derived document is not the source" lesson all **stand unchanged**.
  Only its final diagnosis and remaining-work paragraph are withdrawn.
- `C-A`, `C-B`, `C-C` keep their `xfail:STEERING` tags and numbers. What changes
  is what they mean: they measure an authority asymmetry, not a stability hole.
- The disagreement with the primary source is **narrower but still open**. The
  manual says the near-dead run is holdable with the carrot and the mast stood
  upright. The model holds TWA170 loosely (13.8° excursion, 59% speed —
  `docs/coverage-no-oar-2026-08-10b.txt`) but has no trim holding it within 10°,
  and cannot reach it from TWA150 at all.
- No `/core` change is made by this ADR. It is a correction of the record.
