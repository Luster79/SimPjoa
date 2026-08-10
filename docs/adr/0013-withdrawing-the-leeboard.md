# ADR 0013 — Withdrawing the leeboard

*Date: 2026-08-03*

**Supersedes ADR 0012.** 0012 stands unedited, as the record of a decision
made on a premise that was not checked.

## Context

ADR 0012 added a lowerable, fore-and-aft-movable leeboard as "the movable half
of the lateral plane", citing Dierking and Proafile for it being standard
equipment on these canoes. The owner's response on reading it was that proas do
not have a movable leeboard.

Checking the sources — which is what should have happened before 0012 was
written, not after — the position is this.

**The citation is real but was read out of context.** Proafile's Primer does
say: *"Leeboards that pivot fore and aft may be used to steer the boat, by
moving the center of lateral resistance in relation to the sail."* That is
listed among **modern proa design options**, not as a feature of the
traditional boat.

**The same passage says what the traditional boat actually does:**

> Traditional proas are steered on all reaching and windward courses **with no
> rudder, paddle, or steering oar at all**. Steering is achieved […] by
> adjusting the relative fore and aft positions of the sail centre of effort
> and the hull centre of lateral resistance.

and

> Shifting the sail forward of center is important to maintain helm balance
> with a traditional proa.

**And Dierking's own designs point the other way.** On his hulls the
asymmetric, deep-V section provides the lateral resistance and needs no foil
or leeboard at all; a pivoting leeboard appears only on his rounder-bottomed
designs.

**That is exactly the hull this project models.** `hull.lateralArea` is
anchored on Flay's V2 form — described in `data/README_input_data_EN.md` as
"the proa-like case", a 70° keel. A deep-V hull is precisely the case that
carries no board.

So the leeboard is not part of this boat. 0012 fitted a modern option to a
traditional hull and justified it with a quotation about a different design
choice.

## Decision

**Remove it.** `core/leeboard.js`, `config.leeboard`, `controls.leeboardDown`
and `controls.leeboardX`, the two S3 assertions, and the UI controls all go.
The lateral plane is the hull again.

The ADR is written rather than the change being made silently, because the
process failure is the more useful record. This work order's whole method is
to verify claims rather than inherit them, and it was applied rigorously to
every number in the code while the *literature* in the work order was taken at
face value and written into an ADR as established. A dead CSV column and an
unchecked citation are the same defect.

## Consequences

The measurements in `Archive/findings-2026-08-02` stage 3b were real and are kept,
retitled as what they are: what a leeboard-equipped boat would do, not what
this one does. The board genuinely was a CLR control (66–82° of drift
authority) and genuinely cost 7.6–14.8 % of speed. None of that was wrong; it
was answering a question about a different boat.

**One reported result is withdrawn.** "The boat sails with the oar shipped at
3 of 6 operating points" required the board down. Without it, no tack setting
holds a rudder-free course with the oar *shipped* at any point. S1b's detail
is corrected to say so.

**What survives is stronger than what went.** S2 — the movable tack — is not
merely unaffected, it is what the sources say the traditional boat actually
steers with, on every reaching and windward course, with no oar in the water.
And the measurement that every rudder-free course hold occurred at a
**forward** tack setting (+0.25 to +1) reproduces Proafile's "shifting the sail
forward of center is important to maintain helm balance" — arrived at
independently, before that sentence was read.

`out/polar.csv` is unaffected in both directions: the sweep never searched the
board, so adding it and removing it are both byte-neutral.

The standing limitation is now stated plainly rather than partially papered
over: on this boat the deep-V hull is the entire lateral plane, so there is no
second surface to trim against, and the steering oar remains the only thing
supplying directional stability as opposed to helm balance.
