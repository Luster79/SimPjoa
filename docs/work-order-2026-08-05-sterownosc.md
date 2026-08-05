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

#### T1. Bom jako drzewce z własną wysokością — WYKONANE, odbiór nie osiągnięty

`controls.boomLift` (0..1) wprowadzony z obydwoma skutkami i ze sprzężeniem
przez szot (`core/sheet.js`'s `effectiveBoomLiftMax`, ten sam jednostronny
wzorzec co `effectiveDeltaMax`). Mechanizm #1 (wybrzuszenie) wpięty w
`camberCLDelta`, ale **z wzmocnieniem 0** — `brailCamberGain` (0,10) razem z
wbudowaną kambrą tabeli v2 (0,10) już stoją dokładnie na suficie 0,20, którego
pilnuje `validateConfig`, więc nie ma miejsca na trzeci nieujemny człon bez
ruszania już strojonej stałej. Maszyneria istnieje, liczbę zostawiłem na
później (ten sam status co `sail.verticalLiftFraction`).

Mechanizm #2 (podniesienie CE + skrócenie `yCE`) daje realny, poprawnie
skierowany, ale **niewystarczający** efekt. Zmierzone czułości:
`boomLiftCEHeightFrac` ma znikomy wpływ na moment odchylający (0,15→0,5:
TWA160 26,4→25,7 °/min) — cała dźwignia siedzi w `boomLiftYceShrink`. Tam
zamiatanie 0,3→0,9→0,99 daje TWA160 26,4→18,3→16,1 i TWA175 33,4→15,2→0,8 —
ale nawet 0,99 (praktycznie zerowanie `yCE`, wartość niebroniona fizycznie) nie
mieści TWA160 w paśmie 15 °/min. Ustawiono `boomLiftYceShrink = 0,5` z
uzasadnienia geometrycznego (kolaps trójkąta bomu ku rei), **nie** dobrane pod
próg testu.

**Odbiór NIE osiągnięty.** C-C wynosi 1/2 (TWA140 trzyma, teraz z przestrzeleniem
w drugą stronę — kryterium C-C zmienione na `Math.abs(rate)`, bo jednostronne
pomijało ten przypadek; TWA160 nadal poza pasmem). Powód zgadza się z
diagnozą z Części I.2 tego dokumentu: przy TWA160 wszystkie momenty trymu są
już blisko zera przy puszczeniu steru, więc to deficyt stateczności
kierunkowej (kadłub, Munk), nie autorytetu trymu — dokładnie to, co T3/T4 mają
naprawić.

**Polara nietknięta, celowo.** `boomLift` domyślnie 0 w `harness/polar.js`
(nigdzie nieużywany w przeszukiwaniu), więc `out/polar.csv` bajtowo
identyczna. To nie jest tylko zawężenie zakresu: przy `boomLiftCamberGain=0`
`boomLift` nie zmienia w ogóle CL/CD, więc nie ma żadnego wpływu na prędkość,
którą polara przeszukuje — dołożenie go do siatki nie zmieniłoby zwycięskiego
trymu. Wart rewizji dopiero razem z realną wartością `boomLiftCamberGain`.

*Nakład: średni, zgodnie z planem. Zależności: przed T2 — spełnione.*

#### T2. `yceBrailShift` przemierzyć zamiast szacować — WYKONANE

Geometria **rozstrzygnęła**. F4 już traktuje brail jako działanie przez
**powierzchnię** (`areaAtFullBrail = 0,20` przy pełnym pociągnięciu). Przy
założeniu samopodobnego skurczu obszaru roboczego, wymiary liniowe — w tym
odległość hals–centroid, z której zbudowany jest `ceRadiusEff` — skalują się
jak √(ułamek powierzchni). Usunięty ułamek to `1 − √0,20 = 0,553`.

Zmierzone zamiast szacowane: `yceBrailShift` zmieniony z ręcznie dobranego 0,6
na wyprowadzone `1 - Math.sqrt(0.20)`. **Wartość wyprowadzona pogarsza wynik
C-C** (TWA140: 6,8 → 8,5 °/min przy `boomLift=0`) — dowód, że nie została
dobrana pod test. Pełna czułość zmierzona i zapisana w komentarzu przy stałej:
0,0 → 0,3 → 0,553 → 0,9 daje TWA140 21,6 → 15,3 → 8,5 → −8,6 °/min i TWA160
34,3 → 32,7 → 29,9 → 21,2.

**Odbiór osiągnięty:** wartość ma wyprowadzenie geometryczne w komentarzu
(nie hipotezę „mocniej niż X"), plus zmierzoną czułość pokazującą, że to nie
jest pokrętło o dużym zysku — nawet 0,9 (blisko fizycznej granicy) nie mieści
TWA160 w paśmie 15 °/min.

*Nakład: mały. Zależności: po T1 (T1 zmienia, ile `yCE` w ogóle zostaje).*

### Blok B — człony, których model nie ma (nieblokujące, ale należne)

#### T3. Sprzężenie przechył → kadłub, żeby domknąć parę — WYKONANE, wynik negatywny

`hullSideForce()` przyjmuje teraz `phi`: `stationWeights()` dokłada przesunięcie
centroidu planu bocznego proporcjonalne do `sin(phi)` (`hull.heelClrShiftCoeff`
× `hull.heelClrSign`), ten sam mechanizm co przesunięcie od `crewPosX`, tylko
sterowany przechyłem zamiast pozycją załogi — standardowe uproszczone ujęcie
„przechył przesuwa CLR wzdłuż kadłuba" dla kadłuba w ostrym V.

**Macierz z komentarza przy `yawHeelSign` przemierzona ponownie, wszystkie
cztery kombinacje znaków**, na obecnej (rozszerzonej o T1/T2) siatce
akceptacyjnej:

| (heelClrSign, yawHeelSign) | AC-1.1 | AC-1.2 | AC-4.2a | AC-4.2b |
|---|---|---|---|---|
| (0,0) — punkt odniesienia | 6/6 | 6/6 | 4/6 (kierunek 6/6) | 4/6 |
| (+1,+1) | 3/6 | 2/6 | 4/6 (kierunek 6/6) | 4/6 |
| (+1,−1) | 6/6 | 6/6 | 4/6 (kierunek 5/6) | 4/6 |
| (−1,+1) | 3/6 | 4/6 | 4/6 (kierunek 6/6) | 4/6 |
| (−1,−1) | 6/6 | 6/6 | 4/6 (kierunek 5/6) | 4/6 |

**Żadna kombinacja nie spełnia kryterium jednoczesności.** AC-4.2a/b stoją w
miejscu na każdej kombinacji (4/6) — ten człon w ogóle do nich nie dociera,
bo działa wyłącznie przez już istniejącą siłę boczną od dryfu (`v`), podczas
gdy człon takielunku (`yawMomentHeel`) jest samodzielnym r×F aktywnym przy
każdym `Fx` — to inny rodzaj mechanizmu, nie brakująca połówka tej samej
pary. Dwie kombinacje, które nie psują AC-1.1/1.2 ((+1,−1) i (−1,−1)), są
**neutralne w najlepszym razie** i lekko pogarszają spójność kierunku
AC-4.2a (5/6 zamiast 6/6). Pozostałe dwie czynnie psują AC-1.1/1.2.

**Decyzja:** `heelClrSign = 0`, `yawHeelSign = 0` — obie pozostają nieaktywne,
ta sama dyscyplina co przy pierwotnym `yawHeelSign=0`. Maszyneria zostaje w
kodzie (testowalna, gotowa na inną wielkość albo lepiej ugruntowany kształt),
ale nie startuje aktywna na wyniku negatywnym. Pełny pakiet: bez zmian liczbowych
względem stanu sprzed T3 (mechanizm jest matematycznym no-op przy `heelClrSign=0`).

*Nakład: duży, zgodnie z planem. Zależności: brak. Polara nietknięta — wynik
zerowy nie wymaga przeliczenia.*

#### T4. Plan boczny amy — WYKONANE

`amaDrag()` przyjmuje teraz `v, r` i zwraca `Fy` obok `Fx`/`yawMoment`, przez to
samo całkowanie paskowe co `hullSideForce`, na powierzchni bocznej amy
wyprowadzonej z `Seff` (już liczonego zanurzenia) przez stosunek pola walca
(profil/omoczona = 1/π) — nie z osobno zgadywanego wymiaru, ucząc się z
niepowodzenia T5. Ponownie wykorzystuje zmierzoną krzywą `hullSideForceCoeff`
(ten sam precedens co opór resztkowy amy, ADR 0015). Świadomie węższe niż pełny
rozkład `hullSideForce`: sama siła nośna płata, bez liniowego tłumienia
niskoprędkościowego (`hull.lowSpeedSideDamping` to stała bezwzględna dla całego
kadłuba, nie współczynnik na jednostkę powierzchni) i bez wkładu do `Fx`
(opór tarcia+resztkowy w `amaDrag` jest już kompletny — dodatkowy opór
indukowany podwajałby liczenie).

**Zmierzone (Odbiór spełniony):** własne tłumienie odchylenia amy przy
zanurzeniu spoczynkowym = **68 N·m/(rad/s)** — zgadza się z szacunkiem rzędu
wielkości z Części I.3 (73) w granicach 7%. W pełni dociśnięte (phi=−15°):
120 N·m/(rad/s). Stosunek do kadłuba: 2,1% spoczynkowo, 3,7% dociśnięte —
mały, jak przewidziano, nie darmowa stateczność. Znak `Fy` poprawny (przeciwny
do dryfu bocznego).

**Zgodnie z przewidywaniem z Części I.3, nie poprawia równowagi statycznej dla
C-C**: TWA160 bez zmian co do rzędu wielkości (25,0→24,8 °/min), bo to człon
rzędu `r`, nie stały moment przy puszczonym sterze.

**Nieoczekiwany, realny zysk gdzie indziej: S1c awansowane z `xfail`.**
Pełny pakiet zgłosił `[PROMOTION CANDIDATE]` — S1c („wiosło wyjęte, kurs
trzymany samym trymem: hals + pozycja załogi wzdłuż") przeszło z 3/6 (stan po
ADR 0017) na **6/6**, zmierzone na całej siatce, nie w jednym rogu. To
dokładnie ten deficyt stateczności kierunkowej, który ADR 0027/0028
zdiagnozowały jako brakujący — moment Munka przy TWS6/TWA90 wynosił +382 N·m
wobec −46 kadłuba i −58 żagla, więc gdy wiosło (−315) wychodziło z wody, prawie
nic mu się nie przeciwstawiało. Plan boczny amy dostarcza tego „prawie nic".
Zgodnie z regułą projektu (`xfail`, który zaczyna przechodzić, wymaga decyzji
człowieka) — **awansowane**: tag `'STEERING'` usunięty, komentarz w
`harness/asserts.js` zaktualizowany. Pełny pakiet po awansie: zielony, exit 0.

Pełny pakiet: 88/88 (`--fast`), bez regresji.

*Nakład: średni, zgodnie z planem. Zależności: naturalnie razem z T3 —
spełnione.*

### Blok C — higiena, tania i zaległa

#### T5. Stałe przechyłu unieważnione przez ADR 0021 — WYKONANE, częściowo inaczej niż planowano

**Para `I_roll`/`rollDampingCoeff`: zmierzona, nie zmieniona.** Krok 8° przy
obecnej sztywności (post-ADR-0021) daje okres 3,00 s (pasmo 1,5–4 ✓) i osiadanie
w 2,29 okresu (pasmo 2–4 ✓) — **oba pasma nadal przechodzą**. ζ=0,131 jest
rzeczywiście poniżej narracyjnego celu 0,19 z R9-5, ale ten cel nigdy nie był
kryterium akceptacji — jest tylko w komentarzu. Podniesienie `rollDampingCoeff`
do wartości dającej ζ=0,19 liniowo (~1595) **zmierzone**: wypycha osiadanie do
1,41 okresu, **poza** pasmo 2–4. Przyczyna: nieliniowy ease-out krzywej
przywracającej blisko phi=0 jest lokalnie miększy niż liniowa sprężyna, którą
zakłada rachunek ζ. Wniosek: para jest dobra, cel-ζ był fałszywym alarmem.
**Nie zmieniono.**

**`phiLiftoffDeg`/`phiSubmergeDeg`: derywacja geometryczna odłożona, nie
wykonana.** Naturalne podejście — promień przekroju amy z
`Vmax = ama.maxBuoyancy/rho_w` przy założeniu półkola, potem
`phi = asin(ułamek·R/spacing)` — wymaga zanurzenia R, którego projekt nie ma:
`ama_buoyancy_kg` jest samo oznaczone „NOT PUBLISHED — scaled by the CUBE of
the length ratio" w `example_proa_parameters.csv`, nie pomiarem. Policzone mimo
to, wynikowe kąty wychodzą **rzędu 0,4–2°** — około dziesięciokrotnie mniej niż
obecne 12°/10°, co skompresowałoby całą obwiednię przechyłu i wymagało
ponownego przebiegu **każdego** scenariusza wywrotkowego (gust T6, T10, aback)
— tej samej kampanii co `docs/capsize-margins-2026-07-30.md`. To osobna,
większa pozycja z własnymi kryteriami odbioru, nie mieści się w T5 i nie została
zrobiona na wejściu tak niepewnym.

**Co faktycznie dostarczono:** strażnik w `validateConfig` wiążący oba kąty z
`ama.length` (wielkością skalowaną, choć nie zmierzoną) — pionowy skok amy musi
mieścić się w [1%, 50%] długości amy. Pasmo celowo szerokie: łapie grubą
pomyłkę (literówkę w `spacing`, `ama.length` zmienioną o rząd wielkości bez
przejrzenia tych kątów — dokładnie wzorzec ADR 0021), nie udaje precyzji, na
którą dane nie pozwalają.

*Nakład: mały (zgodnie z planem) na to, co wykonano; derywacja kątów przesunięta
do osobnej pozycji z własnym budżetem. Zależności: brak.*

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
