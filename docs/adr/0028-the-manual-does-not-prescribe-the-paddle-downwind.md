# ADR 0028 — The manual does not prescribe the paddle downwind

*Date: 2026-08-05*
*Corrects ADR 0027 and the C-A assertion's standing excuse. The measurements in
0026 and 0027 stand; what changes is what the failure at TWA 160+ means.*

## Context

The `C-A` dead-run assertion has been excused since 2026-08-03 on the grounds
that the owner's manual prescribes the paddle for downwind steering, so a
rudder-free dead run "is not a configuration the manual claims is holdable".
ADR 0027 repeated it.

The owner supplied the manual's actual downwind procedure. It prescribes no
paddle:

> **By płynąć prawie całkiem z wiatrem:**
> Żagiel ustawiamy „w marchewkę", by siłę żagla przesunąć do przodu
> – Podciągamy bom **wysoko do góry** gejtawą w ten sposób, by żagiel bardzo
>   się wydął
> – Musimy odpowiednio luzować szot, żeby bom (dolne drzewce) mógł się unieść
>
> oraz / albo:
> Maszt stawiamy bardziej ku pionowi ciągnąc go wantą
> – Luzujemy tylny sztag, lekko (np. 20 cm)
> – Skracamy wantę, ciągnąc specjalną linkę w kokpicie (na maksa), aż maszt
>   pójdzie w stronę pionu

## Decision

**Withdraw the excuse.** The sentence it rested on is not in the manual. It is
in `Kryteria_Akceptacji_Symulator_Pjoa.md` AC-5.2:

> Symulator powinien też udostępniać wiosło (pagaj) jako niezależny, zawsze
> dostępny mechanizm korekty kursu, którego siła rośnie wraz z prędkością łodzi.

That is a requirement about the **simulator's control set** — the paddle must
exist and be always available — not a statement about downwind technique. It
was read as the latter, and an English paraphrase was attributed to
"docs/sources/, ch. III" that the source does not support.

The same AC-5.2 also transcribes the carrot as "bom **nisko**, blisko szczytu
masztu", which is self-contradictory (low, yet near the masthead) and
contradicts the source's "podciągamy bom **wysoko**". This is the second
erratum found in that derived document, after AC-1.2.

**Consequence for the failing checks: they are a disagreement with the source,
not an accepted limitation.** The manual says a near-dead run is holdable with
the carrot and the mast stood upright. The model does not deliver it.

## Measured, with the manual's full recipe

Paddle shipped, carrot at full travel, crew inboard off the ama, tack forward,
crew aft, TWS 6, 120 s release. `stays: +1` is the mast-toward-vertical setting
the manual names, which `C-C` previously omitted:

| | stays 0 | stays +1 |
|---|---|---|
| TWA 140 | 13.8 °/min | **6.8 °/min** |
| TWA 160 | 31.1 °/min | 29.2 °/min |
| TWA 175 | — | 35.5 °/min |

Easing the sheet further at TWA 160 (88°) gives 26.7 °/min; easing the halyard
makes it slightly worse (28.9 → 30.3). Nothing available brings the near-dead
run inside the ceiling.

At TWA 160 every trim moment at release is already within a few N·m of zero —
sail +2, hull −3, ama +4 — so this is not an authority shortfall. It is the
directional-stability deficit that S1b/S1c carry: no restoring yaw moment from
the hull, a destabilising Munk moment, so any perturbation grows.

## Consequences

- `C-C` now applies `stays: 1.0`, which is part of the recipe it claims to
  measure. TWA 140 improves to 6.8 °/min; the tally is unchanged at 1/2.
- `C-A` and `C-C` keep their `xfail:STEERING` tags and their numbers, but their
  comments now say the failure contradicts the source instead of agreeing with
  it. No band was widened and no constant was touched.
- **The lesson repeats: a derived document is not the source.** This is its
  second instance. `Kryteria_Akceptacji` should be treated as an index into the
  manual, never as authority, and any criterion resting on it should quote the
  original before it is used to excuse a failure.
- The remaining work is unchanged in substance but no longer optional-looking:
  the near-dead run needs the missing restoring terms — the heel-dependent hull
  force and the ama's absent lateral plane — because no control the boat has
  will trim it out.
