# Work order — stateczność kierunkowa kadłuba

*Data: 2026-08-05. Wynika wprost z pytania właściciela „dlaczego marchewka nie
działa w symulacji, mimo że działa w naturze". Odpowiedź: marchewka działa —
usuwa 92% momentu ostrzenia — ale zostaje ~6.6 N·m, a łódka nie ma czym tej
resztki wchłonąć. Ten dokument planuje pracę nad tym „czym".*

## Część I. Co pomiar mówi

### I.1. Sztywność kierunkowa kadłuba jest zerowa

`dM/dTWA` przy trymie neutralnym, TWS6 (dodatnia = stateczny; konwencja:
M>0 = ostrzy = TWA maleje, więc stabilna równowaga wymaga rosnącego M):

| TWA | M całk. | dM/dTWA | M kadłuba | dM_kad/dTWA |
|---|---|---|---|---|
| 70 | 18.7 | +0.34 | 0.0 | **0.00** |
| 90 | 17.2 | −0.52 | 0.0 | **0.00** |
| 110 | 169.5 | −0.99 | −13.1 | +0.20 |
| 140 | 98.2 | −0.88 | 2.3 | +0.13 |
| 160 | 66.4 | −1.42 | 2.4 | −0.22 |

Kadłub nie wnosi **nic**. Całość jest niestateczna od TWA90 w górę.

### I.2. Dlaczego — to jest strukturalne, nie kalibracyjne

`hullSideForce` całkuje paskami, ale rozkład pola bocznego (`stationWeights`)
zależy tylko od `crewPosX` i `phi`. Przy `r = 0` wszystkie paski widzą ten sam
dryf, suma się faktoryzuje i moment redukuje się **dokładnie** do `clrX · Fy`
(mówi to komentarz w `hydro.js` nad `hullSideForce`). Stąd:

```
dN/dβ = clrX · dFy/dβ
```

`clrX` jest **stałe**. Czyli środek naporu bocznego nie wędruje z kątem dryfu —
a to właśnie ta wędrówka jest mechanizmem stateczności kierunkowej prawdziwego
kadłuba. Model ma jedno ramię dźwigni zamiast rozkładu, który się przesuwa.

Do tego samo ramię jest małe: `clrXFraction = 0.05` daje `clrX(0) = −0.125 m`
na kadłubie 5 m — 2.5% długości.

### I.3. Ile brakuje

Marchewka na maksa, TWA160, po wytrymowaniu żagla zostaje: żagiel +2.7,
kadłub −2.7, **ama +2.8**, **Munk +3.9** → suma **+6.6 N·m**. Przy `N_r ≈ 1245`
N·m/(rad/s) to ~18°/min. Deficyt jest mały — rzędu 8% tego, co marchewka już
usunęła — ale nie ma go czym pokryć, bo hals traci władzę na kursach pełnych
(hals 0 vs 1 to 1–3 N·m przy TWA160, ADR 0026).

### I.4. Uczciwe zastrzeżenie: proa MA słabą stateczność kierunkową

Kadłub proa jest symetryczny dziób-rufa, bo musi być — zwrot przez sztag zamienia
końce. Nie ma więc wbudowanego weathercockingu i **nie wolno mu go dorobić**.
Cała metoda sterowania z instrukcji jest trymowa właśnie dlatego. Pytanie tego
work ordera brzmi więc **nie** „jak dodać stateczność", tylko:

> **czy model nie zaniża tego, co ta łódka naprawdę ma.**

Zero to podejrzana wartość. Słaba stateczność to nie to samo co żadna.

---

## Część II. Pozycje

### D1. Wędrówka środka naporu bocznego z kątem dryfu — **blokująca**

**Teza.** Na kadłubie o skończonej smukłości środek naporu bocznego przesuwa
się z kątem dryfu: przy małym β napór jest skupiony z przodu (krawędź natarcia
generuje pierwsza), przy dużym przesuwa się ku środkowi wraz z rozwojem
oderwania i przepływu poprzecznego. Ten ruch, przy stałym punkcie obrotu, jest
źródłem `dN/dβ`. Model ma go zerowy.

**Wykonanie.** `stationWeights` (albo osobny człon w `hullSideForce`) musi
zależeć od lokalnego dryfu paska, nie tylko od trymu załogi i przechyłu.
Uwaga: paski **już** liczą własny dryf (`v + r*x`) — brakuje sprzężenia
zwrotnego rozkładu POLA od tego dryfu.

**Źródło — to jest wąskie gardło.** Projekt ma z Flaya siłę boczną (ADR 0004),
ale **nie ma jego momentu odchylającego** — work order 08-02 zapisał, że S7/S8
są tym zablokowane. Do wyboru:
- (a) odszukać w źródle Flaya `N(β)` i zdigitalizować wg kontraktu z ADR 0009;
- (b) oprzeć się na regresji manewrowej dla smukłych kadłubów (Clarke,
  Inoue) — z jawnym oznaczeniem, że to regresja, nie pomiar tej łódki;
- (c) wyprowadzić geometrycznie z teorii ciała smukłego — najsłabsze, ale
  obronione, i spójne z tym, jak wyprowadzono `yceBrailShift` (T2).

**Weryfikacja.** `dM_kad/dTWA > 0` na całym zakresie TWA70–175 przy trymie
neutralnym, z wartością wyprowadzoną ze źródła, nie dobraną pod próg.
Kontrola: `S1a` (dziś 3/6) i `S1b` (dziś 0/6) muszą się poprawić **bez**
ruszania `hull.lead` ani `clrXFraction`.

**Ryzyko: wysokie.** To ustawia jednocześnie nawietrzność, więc ruszy
**każdą** asercję sterowania i `out/polar.csv` (bramka bajtowa). Zaplanować
jako osobną rundę z pełną re-walidacją, nie doklejać do innej pracy.

### D2. Audyt wielkości momentu Munka — WYKONANE, obronione — **nie zmieniać bez nowej decyzji**

ADR 0018 zamknął pytanie o podwójne liczenie, ale wielkość została na
oszacowaniu (dzielnik `/4` zamiast teoretycznego `/2`), a regresja Clarke'a
sugeruje wartość **wyższą**, czyli bardziej destabilizującą. Munk wnosi +3.9
N·m z 6.6 N·m deficytu przy TWA160 — to największy pojedynczy składnik reszty.

**Zakres: tylko audyt.** Właściciel zdecydował wcześniej, żeby zostawić
ADR 0018 w spokoju, i ta decyzja obowiązuje. Pozycja ma **udokumentować**, czy
wielkość jest obroniona, i nic więcej. Zmiana wymaga osobnej zgody, bo
podniesienie `massSway` odwraca cztery reguły sterowania z instrukcji.

**Weryfikacja.** Notatka w findings z porównaniem do Clarke'a i wnioskiem
„obronione / nieobronione", bez dotykania kodu.

**Wynik (`docs/findings-2026-08-08-directional-stability.md`).** Obronione —
ADR 0018 samo jest tym audytem i jego liczby wciąż się zgadzają: model niesie
455 kg dodanej masy bocznej wobec ~1010 kg z regresji Clarke'a (mniej niż
połowa, nie więcej), a łączny moment Munk+kadłub trzyma się stałych 0.65
regresji `N_v` w czterech rozstawionych stanach — w TWA160 nie jest wyjątkiem.
Kod nietknięty.

### D3. Moment odchylający amy — WYKONANE, w granicy — **nieblokująca, należna**

Ama wnosi +2.8 N·m z reszty. T4 dodał jej plan boczny całkowany paskami, ale
na pływaku, którego nikt nie zmierzył, a ADR 0029 zmienił jego długość ×1.40.
Zweryfikowano, że rewizja **nie** pogorszyła sprawy (stara ama daje 7.9 N·m,
nowa 6.6), ale sama wielkość członu nie była nigdy sprawdzona wobec czegokolwiek.

**Weryfikacja.** Człon amy porównany z niezależnym oszacowaniem (opór ×
rozstaw jako górna granica). Jeśli mieści się w granicy — zapisać i zamknąć.

**Wynik.** Przy `r=0` człon jest dokładnie zerowy (ta sama przyczyna co D4:
rozkład pasków amy jest jednorodny, bez odpowiednika `clrX`). Przy realnym
resztkowym `r` (setne rad/s, jak przy autopilocie osiadłym na kursie) człon
mieści się w 7–35% granicy; przekracza ją dopiero od `r ≈ 0.28 rad/s`
(~16°/s) — to jest tempo zwrotu, nie ustalonego żeglowania. Wartość +2.8 N·m
z TWA160 leży dwa rzędy wielkości poniżej progu, gdzie granica w ogóle
zaczyna być testowana. Kod nietknięty.

### D4. Symetria dziób-rufa: sprawdzić, że to naprawdę zero — WYKONANE, potwierdzone

Kadłub proa jest z założenia symetryczny, więc rocker/martwica nie powinny
dawać momentu. To jest **założenie, nie pomiar**. Tania pozycja: sprawdzić, czy
model rzeczywiście daje zero, i zapisać to jako świadomy fakt, a nie
przeoczenie.

**Wynik.** Po wyzerowaniu trzech świadomych przesunięć CLR
(`clrXFraction`, `crewForeAftTrimCoeff`, `heelClrShiftCoeff`) moment odchylający
kadłuba jest zerowy co do precyzji zmiennoprzecinkowej (~1e-13 N·m) w całym
zamiecionym zakresie dryfu i przechyłu. W `/core` nie ma żadnego parametru
kształtu kadłuba poza liniowym zwężeniem, które już buduje `stationWeights` z
tych trzech przesunięć — nie ma więc czego więcej sprawdzać. Niezerowe momenty,
które model daje, zawsze dają się przypisać jednemu z tych trzech, uzasadnionych
ADR-ami członów. Kod nietknięty.

**Dowód razem z pełnym pomiarem D2-D3: `docs/findings-2026-08-08-directional-stability.md`.**

---

## Część III. Czego nie robić

- **Nie przestrajać `hull.lead` ani `hull.clrXFraction`, żeby S1a przeszło.**
  ADR 0016 już to przerabiał: to ostrze noża szerokości 2.7 cm i zostało
  świadomie odrzucone. To jest dokładnie „kompensacja w złym parametrze"
  (`docs/README.md`) — deficyt jest w *rozkładzie*, nie w *ramieniu*.
- **Nie dodawać miecza ani płetwy.** Wycofane w ADR 0013 jako nie ta łódka.
- **Nie dorabiać kadłubowi weathercockingu, którego proa nie ma** (Część I.4).
  Celem jest odzyskanie tego, co model zaniża, nie zbudowanie innej łodzi.
- **Nie łączyć D1 z niczym innym w jednym commicie.** Ruszy polara i wszystkie
  progi sterowania; diagnoza czegokolwiek innego przestanie być możliwa.

## Część IV. Kolejność i odbiór

1. **D4** → weryfikacja: zero potwierdzone pomiarem, zapisane. *(tanie, bez ryzyka)*
2. **D3** → weryfikacja: człon amy mieści się w niezależnej granicy. *(tanie)*
3. **D2** → weryfikacja: notatka „obronione / nie", kod nietknięty. *(tanie)*
4. **D1** → osobna runda, własna re-walidacja marginesów wywrotki na wzór
   `docs/capsize-margins-2026-07-30.md`, regeneracja polara, przegląd każdej
   asercji sterowania. *(kosztowne, blokujące dla `S1a`/`S1b`/`C-A`/`C-B`/`C-C`)*

**Odbiór całości:** `dM/dTWA > 0` na TWA90–175 przy trymie neutralnym —
dziś jest ujemne wszędzie poza TWA70. Dopiero wtedy marchewka ma co pokryć
i C-C mierzy autorytet trymu, a nie brak stateczności pod nim.

## Część V. Czego ten plan nie rozstrzyga

Jeśli D1 wykaże, że model **nie** zaniża — że ta łódka naprawdę ma zerową
stateczność kierunkową — to `S1a`/`S1b` przestają być usterkami do naprawienia
i stają się poprawnym opisem proa, a instrukcja właściciela (sterowanie trymem,
wiosło jako ostateczność) jest tego potwierdzeniem, nie obejściem. Ten wynik
jest równie wartościowy jak poprawka i trzeba go przyjąć, jeśli tak wyjdzie.
