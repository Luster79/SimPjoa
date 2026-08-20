# Lista poprawek — pełny wiatr: równowagi, których nie da się osiągnąć

*Last reviewed: 2026-08-15*
*Wejście: `Archive/findings-2026-08-15-deep-course-gap.md` (przyczyna nieosiągalności
TWA160-175), ADR 0044 (wycofanie diagnozy 0028), ADR 0045 + errata (bariera rei,
i czego naprawdę nie naprawiła), errata do ADR 0042 (82→115 po dopasowaniu
tolerancji). Stan repo: `417380b`, wypchnięte.*

Numeracja `W*`, nowa; nie koliduje z `O*`, `N*`, `M*`, `L*`, `K*`, `S*`, `R*`,
`P*`, `F*`, `T*` ani `D*`.

Poprzednie zlecenie (`work-order-2026-08-10-ostrzenie.md`) zamknęło ostrzenie
(O1), uczyniło uzyskiwanie kursu mierzalnym (O2), przycięło wyszukiwania do
`crew.posMax` (O7) i rozstrzygnęło cel odbudowy mocy po shuncie (O6). Zostawiło
otwarte O3 i O4 — **oba zostają wchłonięte przez W1 i W5**, bo pytania, które
stawiały, zostały w międzyczasie rozstrzygnięte pomiarem.

---

## Część I. Co jest ustalone i dlaczego to zlecenie zaczyna się od ADR 0032

**TWA180 jest utrzymywalny.** Dwanaście trymów zgodnych z podręcznikiem
(`tackX=0`, marchewka, `halyard=0`), najlepszy z wychyleniem **0,3°** przy
**97% prędkości**.

**TWA180 jest nieosiągalny bez wiosła**, i przyczyna jest zmierzona:
**kurs równowagi jest nieciągłą funkcją trymu.**

| rodzina | trym | równowaga | basen |
|---|---|---|---|
| A | `tackX=+1, halyard=1, sheet=55` | **159,6°** | wciąga wszystko od 155 do 175 |
| B | `halyard=0, tackX≈0, stays=0` | **~175-180°** | podłoga powyżej ~170° |

Pomiędzy — nic. Ruszenie **dowolnej** osi z A w stronę B zrzuca równowagę do
74-114°, nigdy w górę. To bifurkacja siodło-węzeł: zero `M(ψ)` przy 159,6°
znika, stan spada do następnego przy ~80-110°.

**Sufit osiągalności (159,6°) i podłoga basenu B (~170°) się nie stykają.**
Dlatego zawiodło ~20 wariantów manewru — nie ma dokąd prowadzić.

**Dlaczego pas 160-175 jest pusty:** dryf wynosi tam 0,75-1,3°, przechył 0,2°.
Wszystkie człony momentu zależne od kursu — wędrujący CLR kadłuba (ADR 0032),
CLR pływaka (ADR 0036), para przechył→odchylenie — są napędzane dryfem albo
przechyłem, więc znikają. Zostaje to, co ustawia trym.

**ADR 0032 zapisał dokładnie ten efekt** („TWA162-174: stiffness gets WORSE"),
zrozumiał przyczynę i przyjął ją jako świadomy handel — 2026-08-05, gdy nic w
projekcie nie mierzyło osiągalności. Dlatego to zlecenie zaczyna się tam.

**Osiem innych przyczyn odrzucono pomiarem** (rozmiar pływaka, powierzchnia
żagla, załoga na zawietrzną, para przechył→odchylenie, marchewka,
`CDbroadside`, rzekoma niezgodność z podręcznikiem, trasa manewru) — liczby w
dokumencie ustaleń. **Nie wracać do nich bez nowej przesłanki.**

---

## Część II. Pozycje

### W1. Człon momentu, który przeżywa zanik dryfu — pozycja główna

Otworzyć ponownie handel z ADR 0032 dla pasma TWA162-174, tym razem z
**osiągalnością jako kryterium akceptacji**, a nie samą sztywnością.

Potrzebny jest człon momentu odchylającego **zależny od kursu, niezanikający
przy dryfie dążącym do zera**. Dziś każdy taki człon jest mnożony przez dryf
albo przechył, a oba są tam bliskie zeru — stąd pusty pas równowag.

**Kryterium akceptacji:** istnieje rodzina trymów, której równowagi pokrywają
TWA160-175 **w sposób ciągły** — zmierzone tak jak w dokumencie ustaleń
(przemiatanie osi pojedynczo, odczyt kursu ustalonego). Sam wzrost sztywności
nie wystarcza; liczy się położenie równowag.

**Czego nie robić:** nie dobierać współczynnika istniejącego członu, aż
przejście przejdzie. Jeśli mechanizm jest nowy, ma mieć umocowanie fizyczne i
własny ADR; jeśli to rewizja ADR 0032, ma jawnie powiedzieć, co unieważnia.

*Nakład: duży. Zależności: brak — pierwsza pozycja.*

### W2. Pokrycie utrzymania przeliczyć z podniesionym sufitem rei

`harness/coverage-no-oar.js` ma nadal `SHEET_TRIALS = [35, 55, 75]` i tryb
gęsty 15-85 — **sprzed ADR 0045**. Trymy pełnowiatrowe siedzą przy ~100-110°.

Liczba 42/42 nie może wzrosnąć (jest maksymalna), ale **siatka jest za wąska**
i przy pierwszym spadku poniżej 100% skłamie tak samo, jak kłamała
`findHoldingTrim`. Poszerzyć zakres i przeliczyć.

**Kryterium akceptacji:** siatka szota sięga `config.sail.sheetMaxDeg`, migawka
przeliczona, wynik zaraportowany (spodziewany bez zmian).

*Nakład: mały (kod), średni (przebieg ~40 min). Zależności: niezależne.*

### W3. Rozdzielić wkład dwóch zmian w macierzy 82→115

Errata do ADR 0042 podaje 115/156, ale **nie wiadomo, ile dało dopasowanie
tolerancji, a ile sufit rei**. Potrzebny jeden przebieg: stary sufit (90°) z
nowym progiem (10°).

**Kryterium akceptacji:** trzy liczby obok siebie z jawnym przypisaniem wkładu.

*Nakład: średni (~1,5 h). Zależności: niezależne.*

### W4. Rozstrzygnąć umiejscowienie O8/O9

Kontrole `O8` (TWA90→45, przechodzi) i `O9` (TWA90→180, `xfail`) dokładają
**~50-60 min** do pełnego przebiegu — dowód nieistnienia trymu przy ciasnym
progu wymaga wyczerpania siatki. Pełne CI rosło z ~6 min do ~66 min.

Decyzja właściciela: zostawić jako bramkę czy przenieść do narzędzia
raportującego na prawach `coverage-*.js`. **Pytanie otwarte od 2026-08-12.**

*Nakład: mały. Zależności: decyzja, nie praca.*

### W5. `walkToCourse` pyta o zły trym

Marsz przykłada trym **niezależnie wyszukany dla punktu docelowego**, nie
pytając, czy da się do niego dojść ze stanu, w którym łódka jest. To jest
polecenie fizycznie niewykonalne, nie test zdolności łodzi — trym docelowy
bywa grubo przeluzowany dla bieżącego kursu, żagiel przestaje ciągnąć i łódka
staje.

Przeformułować: na każdym etapie szukać trymu, który **z bieżącego stanu**
prowadzi do punktu i tam trzyma.

**Zastrzeżenie:** to nie odblokuje TWA180 (pas równowag jest pusty, W1), ale
poprawia wszystkie pozostałe przejścia i usuwa źródło fałszywych negatywów w
macierzy.

*Nakład: średni. Zależności: po W1 nie jest wymagane, ale wynik macierzy
warto liczyć dopiero po obu.*

### W6. Sześć wywrotek przejścia — sprawdzić, czy jeszcze istnieją

O2 wyliczyło sześć przejść kończących się wywrotką (TWA100→110/TWS6,
TWA80→70 i TWA160→170/TWS10, oba końce). Jedna z nich — TWA100→110 — **okazała
się artefaktem skokowego trymu i zniknęła po rampie**. Pozostałe pięć nie
zostało sprawdzone po ADR 0045 ani po rampowaniu.

**Kryterium akceptacji:** dla każdej z sześciu jawnie stwierdzić, czy nadal
występuje przy rampowanym przejściu i poszerzonej siatce.

*Nakład: mały. Zależności: po W5.*

### W7. Każdy skan deklaruje zakres osi — wymóg metodyczny

**Dziesięć** wniosków w poprzedniej sesji wyszło ze skanów o zbyt wąskiej
siatce i każdy brzmiał jak ustalenie fizyczne, dopóki nie przemieciono
brakującej osi: `crewPos` do 0,3; szot do 55; bras do 0,5; `shroud` ani razu;
`halyard` ani razu; próg celności 15° przy paśmie ±10°; kurs startowy ani razu.
**Dwa trafiły do zacommitowanych ADR-ów** (0044 i 0045) i wymagały errat.

Od teraz: każdy skan w tym obszarze **wypisuje zakres każdej osi sterowania i
uzasadnia pominięcia**. Wynik bez takiej deklaracji jest stwierdzeniem o
siatce, nie o łódce, i nie wolno go cytować jako właściwości modelu.

*Nakład: wliczony. Zależności: przenika wszystkie.*

---

## Część III. Kolejność

1. **W1** — jedyna pozycja mogąca odblokować pełny wiatr. Reszta to porządki.
2. **W2**, **W3** — niezależne, tanie, usuwają znane kłamstwa przyrządów.
3. **W4** — decyzja właściciela, blokuje sensowne CI.
4. **W5**, potem **W6**.
5. **W7** — obowiązuje od pierwszego pomiaru.

Zasada bez zmian: **zatrzymać się, gdy kryterium jest spełnione.**

## Czego nie robić

- **Nie wracać do ośmiu odrzuconych przyczyn** bez nowej przesłanki. Każda ma
  liczby w dokumencie ustaleń.
- **Nie stroić `CDbroadside`** pod pełny wiatr. Podniesienie trafia `CR@180`,
  ale psuje zgodność z Di Piazzą jako całością (19/26 → 16/26) — deficyt jest w
  **kształcie** krzywej, nie w skali. To osobna robota kalibracyjna.
- **Nie czytać „159,1 → 179,7" z ADR 0045 jako osiągalności.** To metryka
  utrzymania; prawdziwy sufit przejścia to 159,6° i poprawka rei go nie ruszyła.
- **Nie ruszać `yawHeelSign`/`heelClrSign`** w celu pełnego wiatru. Przechył
  wynosi tam 0,2°, więc człon z `sin(φ)` nie ma na czym pracować.

## Ryzyko

Główne: **W1 to dodanie fizyki, a projekt ma cztery przypadki, w których
„brakuje mechanizmu" okazało się defektem pomiaru** — a poprzednia sesja
dołożyła dziesięć. Zabezpieczenie: W1 wymaga, żeby przed dodaniem czegokolwiek
powtórzyć pomiar nieciągłości z pełną deklaracją zakresów (W7). Jeśli
nieciągłość zniknie przy szerszej siatce, W1 odpada i to jest dobry wynik.

Drugie: zmiana w rdzeniu dla pasma TWA160-175 dotknie polary, pokrycia i
kalibracji wywrotek. Przeliczyć wszystko, nie tylko to, co się poprawia.

## Część IV. ADR-y należne

| ADR | temat | pozycja |
|---|---|---|
| następny wolny | **jeśli W1 doprowadzi do zmiany w `/core`** — nowy człon momentu albo rewizja handlu z ADR 0032; musi jawnie powiedzieć, co unieważnia | W1 |
| — | W2, W3, W6 to pomiary — wynik do migawek i komentarzy kontroli, bez ADR-a | W2, W3, W6 |
| następny wolny | tylko jeśli W5 zmieni definicję tego, co macierz mierzy (a zmieni, jeśli przeformułowanie ruszy nagłówkową liczbę) | W5 |
