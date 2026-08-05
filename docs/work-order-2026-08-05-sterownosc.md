# Lista poprawek — sterowność zgodna z instrukcją właściciela

*Last reviewed: 2026-08-05*
*Wejście: ADR 0026/0027/0028, asercje S1a–S1c, S2, C-A, C-B, C-C.
Wszystkie pomiary poniżej wykonane na commicie `9c7bf88`, konfiguracja domyślna,
TWS 6 o ile nie zaznaczono inaczej.*

Numeracja `T*` (trim/sterowność), nowa; nie koliduje z `R*`, `P*`, `F*` ani `S*`.

---

## Część I. Co pomiar faktycznie mówi

### I.1. Model odtwarza mechanizm z instrukcji — i to dobrze

Moment odchylający przy **puszczonym wiośle**, po ustaleniu kursu (dodatni =
ostrzenie), z członem Munka włącznie:

| trym | TWA60 | TWA90 | TWA120 | TWA140 | TWA160 | TWA175 |
|---|---|---|---|---|---|---|
| neutralny | +190 | +235 | +212 | +165 | +108 | +87 |
| recepta z instrukcji | −85 | −88 | −17 | **+6** | +14 | +14 |

Neutralnie łódka ostrzy **na każdym kursie** — nie ma równowagi bez wiosła
nigdzie w tym zakresie. To jest treść S1b (z każdego kursu → TWA ~40).

Recepta z instrukcji (marchewka na full, załoga ze środka, hals do przodu,
załoga do rufy, maszt do pionu) przesuwa równowagę do **TWA ≈ 138°** i jest to
równowaga **stateczna**: powyżej niej moment ostrzy, poniżej odpada. Trym
przesuwa więc punkt równowagi o kilkadziesiąt stopni — z „nigdzie" na półwiatr
pełny. To działa i nie jest zepsute.

Rozkład przy TWA140, trym neutralny: żagiel **+108**, ama +75, kadłub +2,
Munk −20. Dominantą jest żagiel — człon `−yCE·Fx`, czyli eased crab claw
wiszący na zawietrzną, mnożony przez siłę napędową. Marchewka (`brailWind=1`)
kurczy `yCE` do 40% i zbija ten człon ze +108 do −4. **To jest dokładnie
mechanizm, który instrukcja nazywa** — „by siłę żagla przesunąć do przodu".

### I.2. Luka jest wąska i leży przy fordewindzie

Przy recepcie z instrukcji brakuje **~14 N·m** przy TWA 160–175, a wszystkie
kontrole stoją na zderzakach. To nie jest deficyt rzędu wielkości — to ostatnie
kilkanaście N·m przy sail +12, hull +5, ama +4, Munk −7.

### I.3. Dwie hipotezy strukturalne, które pomiar odrzucił

Obie warto zapisać, żeby nie wracały.

**`hull.clrXFraction` — działa w złą stronę.** Podnoszenie go pogarsza
ostrzenie, nie poprawia:

| clrXFraction | TWA60 | TWA90 | TWA120 | TWA150 | TWA175 |
|---|---|---|---|---|---|
| 0,05 (obecne) | +190 | +235 | +212 | +126 | +87 |
| 0,30 | +226 | +277 | +250 | +152 | +108 |

**Plan boczny amy — realny, ale nie ten problem.** Własne tłumienie odchylenia
amy jako płata: ~73 N·m/(rad/s) przy zanurzeniu spoczynkowym, ~339 przy pełnym,
wobec ~1459 dla kadłuba. To 5–23%, a przede wszystkim jest to **tłumienie**
(∝ r), które nie rusza równowagi przy r = 0. Warto dodać dla uczciwości modelu,
ale nie jako lek na sterowność.

### I.4. Czego model nie ma, a instrukcja tego używa

Procedura na kurs prawie całkiem z wiatrem, krok pierwszy:

> Żagiel ustawiamy „w marchewkę", by siłę żagla przesunąć do przodu
> – **Podciągamy bom wysoko do góry gejtawą** w ten sposób, by żagiel bardzo
>   się wydął
> – Musimy odpowiednio **luzować szot**, żeby bom (dolne drzewce) mógł się unieść

Model ma `brailWind` (zbieranie płótna + przesunięcie CE) i `halyard`
(nachylenie **rei**). **Nie ma podnoszenia BOMU** — dolnego drzewca — ani
wynikającego z niego wybrzuszenia. To jest podstawowa czynność, którą
instrukcja opisuje dla tego kursu, i jedyna z całej procedury, której model nie
reprezentuje.

Sprawdzone, że nie da się jej podszyć istniejącymi pokrętłami: luzowanie fału
(`halyard` 1 → 0,2) przy TWA160 **pogarsza** dryf 28,9 → 30,3 °/min, bo w
modelu fał opuszcza reję, a nie podnosi bom.

---

## Część II. Zalecenia

### Blok A — domknąć marchewkę tak, jak opisuje ją źródło (blokujące)

#### T1. Bom jako drzewce z własną wysokością

*Naprawa:* wprowadzić `controls.boomLift` (0..1, 0 = stan obecny), o dwóch
skutkach, oba nazwane w instrukcji:
1. **Wybrzuszenie** — podniesiony bom pogłębia worek żagla. Wpiąć w istniejącą
   maszynerię `camberCLDelta`, nie nową krzywą.
2. **Podniesienie CE** i skrócenie ramienia poprzecznego `yCE`, bo płótno
   zbiera się ku rei.

Sprzężenie z szotem jest w instrukcji jawne („musimy luzować szot, żeby bom
mógł się unieść"), więc `boomLift` powinien być **ograniczony od góry przez
`controls.sheet`**: bom nie uniesie się przy wybranym szocie. To jest to samo
jednostronne więzy, które `sheet.js` już realizuje dla rei — użyć tego wzorca,
nie budować drugiego.

**Odbiór:** C-C osiąga 2/2. Kryterium jest kierunkowe i wielkościowe: przy
TWA 175 moment przy puszczonym wiośle schodzi poniżej zera przy `boomLift`
w zakresie roboczym, a nie dopiero na zderzaku. Osobno: `boomLift` przy
wybranym szocie nie robi nic (więzy działają).

*Nakład: średni. Zależności: przed T2. **[rusza polarę]** — polara musi dostać
`boomLift` do przestrzeni przeszukiwania albo jawnie go zamrozić na 0 z
uzasadnieniem.*

#### T2. `yceBrailShift` przemierzyć zamiast szacować

Cały mechanizm marchewki wisi na tym jednym współczynniku (kurczy `yCE`, czyli
człon `−yCE·Fx`, dominantę ostrzenia na kursach pełnych — I.1). Jego obecna
wartość 0,6 jest **oszacowaniem** — komentarz mówi tylko „mocniej niż
`ceBrailShift`, poniżej 1". Sąsiedni `yceFraction` = 0,35 jest zmierzony
(ADR 0024); ten nie.

*Naprawa:* wyprowadzić z geometrii, tak jak ADR 0024 wyprowadził `ceRadius`:
przy pełnym zebraniu leech ku rei, gdzie ląduje centroid pozostałej
powierzchni. Jeśli geometria nie rozstrzyga, zmierzyć na siatce i zaraportować
tally, nie dobierać pod C-C.

**Odbiór:** wartość ma wyprowadzenie albo pomiar w komentarzu. Zakres
wrażliwości (0,0 → 0,9 przesuwa dryf przy TWA140 tylko 32,9 → 29,7 °/min przy
`crewPos 0,35`) zapisany, żeby było widać, że to nie jest pokrętło o dużym
zysku.

*Nakład: mały. Zależności: po T1 (T1 zmienia, ile `yCE` w ogóle zostaje).*

### Blok B — człony, których model nie ma (nieblokujące, ale należne)

#### T3. Sprzężenie przechył → kadłub, żeby domknąć parę

`hull.yawHeelSign = 0` nie dlatego, że fizyka jest zerowa, tylko dlatego, że
model ma połowę pary znoszącej się: przechylony **takielunek** tak, przechylony
**kadłub** nie. `hullSideForce()` nie przyjmuje `phi` w ogóle.

*Naprawa:* uzależnić plan boczny i jego rozkład od `phi` (przechylony kadłub w
ostrym V jest asymetryczny), a potem przywrócić `yawHeelSign` razem z tym
członem — nigdy osobno.

**Odbiór:** macierz z komentarza przy `yawHeelSign` przemierzona ponownie z
oboma połówkami. Kryterium jest to, czy AC-1.1/1.2 i AC-4.2a/b mogą teraz
spełnić się **jednocześnie** — przy modelu połówkowym żaden znak tego nie
robił.

*Nakład: duży. Zależności: brak. **[rusza polarę]***

#### T4. Plan boczny amy

`amaDrag()` zwraca dziś tylko `Fx` i jego moment. Zanurzony pływak 3,2 m to
płat: własna siła boczna, własne tłumienie odchylenia (~73–339 N·m/(rad/s),
I.3) i — co ważniejsze — **asymetria zależna od `phi`**, czyli naturalny nośnik
tego, czego T3 szuka po stronie kadłuba.

*Naprawa:* to samo całkowanie paskowe, które `hullSideForce` już wykonuje, na
własnej powierzchni bocznej amy skalowanej jej zanurzeniem.

**Odbiór:** tłumienie odchylenia rośnie o wielkość zgodną z dodaną
powierzchnią (kontrola bilansu, nie darmowa stateczność). Dryf boczny maleje o
wielkość zgodną z dodanym planem bocznym. **Nie oczekiwać poprawy równowagi
statycznej** — I.3 mówi wprost, że to człon rzędu r.

*Nakład: średni. Zależności: naturalnie razem z T3. **[rusza polarę]***

### Blok C — higiena, tania i zaległa

#### T5. Stałe przechyłu unieważnione przez ADR 0021

`I_roll`, `rollDampingCoeff`, `phiLiftoffDeg`, `phiSubmergeDeg` — wszystkie
cztery ostatni raz zmienione **przed** commitem re-parametryzacji (potwierdzone
`git log -G`). Zmierzone dziś: ζ = 0,131, poniżej punktu wyjścia, od którego
R9-5 świadomie ją podnosił. Pasma nadal przechodzą, więc żaden test tego nie
łapie.

`phiLiftoffDeg`/`phiSubmergeDeg` to wielkości **geometryczne** — przy rozstawie
3,1 m implikują pionowy skok amy 0,64 / 0,54 m, a nie drgnęły, gdy rozstaw
urósł o 24%.

*Naprawa:* wyprowadzić oba kąty z geometrii amy i rozstawu; przeliczyć parę
`I_roll`/`rollDampingCoeff` na obecnej sztywności. Dołożyć asercję wiążącą kąty
z geometrią, żeby następna re-parametryzacja nie mogła ich znowu po cichu
unieważnić.

*Nakład: mały. Zależności: brak.*

#### T6. `crew.posMax` dopuszcza stan, który topi pływak

`hydro.js` sam mówi, że `crewPos` powyżej `ama.maxBuoyancy / crew.mass` topi
amę. Ten stosunek wynosi dziś **60/90 = 0,667**, a `validateConfig` dopuszcza
`posMax = 1,0` i nie egzekwuje relacji. Zmierzony skutek: przy `crewPos 0,7` z
marchewką na TWS 10 luźniejsze szoty **wywracają na nawietrzną** — więcej
balastu i więcej odmocowania daje gorszy wynik.

*Naprawa:* egzekwować `crew.posMax <= ama.maxBuoyancy / crew.mass` w
`validateConfig`.

*Nakład: trywialny. Zależności: brak.*

---

## Część III. Plan wdrożenia

**Etap 0 — zabezpieczenie.** T6 i T5. Oba małe, żaden nie rusza polary, oba
zamykają luki, które przetrwały re-parametryzację.

**Etap 1 — rdzeń.** T1, potem T2. To jest jedyna pozycja, która może zdjąć C-C
i C-A uczciwie, bo jako jedyna dokłada mechanizm, który instrukcja opisuje, a
model go nie ma.

**Etap 2 — para przechyłowa.** T3 i T4 razem, osobne commity, osobny diff
polary. Robić **po** etapie 1, żeby dało się przypisać zmianę polary do
właściwej przyczyny.

### Czego nie robić

- **Nie powiększać ramion wzdłużnych** (`tackTravel`, `ceBrailXShift`,
  `hull.lead`). ADR 0026: działają przez `xCE·Fy`, a `Fy` downwind zanika —
  +0,3 m przesuwu halsu daje −1 N·m przy TWA160.
- **Nie ruszać `clrXFraction`** pod sterowność. I.3: działa w przeciwną stronę.
- **Nie przywracać `yawHeelSign`** bez połówki kadłubowej z T3.
- **Nie stroić `yceBrailShift` pod C-C.** T2 wymaga wyprowadzenia albo pomiaru
  na siatce; dobranie pod jedną asercję powtórzy błąd, który ADR 0026 właśnie
  opisał.
- **Nie zdejmować `xfail` z C-A/C-B/C-C przed etapem 1.** Dziś nie ma
  mechanizmu, którym mogłyby zostać zdjęte uczciwie.

### ADR-y należne

| ADR | temat | etap |
|---|---|---|
| 0029 | bom jako drzewce: wysokość, wybrzuszenie i więzy szota (T1+T2) | 1 |
| 0030 | przechył w hydrodynamice: kadłub i ama (T3+T4) | 2 |

---

*Reprodukcja: pomiary z Części I odtwarzalne skryptami w treści pozycji.
Tabela momentów z I.1 — ustalić kurs autopilotem 45 s, następnie odczytać
`computeForces` przy `rudderUp: true` i dodać `(massSurge − massSway)·u·v`,
którego `forces.M` nie zawiera.*
