# Lista poprawek — domknięcie kryterium: dwie strefy zerowego pokrycia

*Last reviewed: 2026-08-10*
*Wejście: kryterium sukcesu i jego zakres (`docs/README.md`), wykonanie K1-K6
(`Archive/work-order-2026-08-09-kryterium-bez-wiosla.md`, Część V), ADR 0034/0035/0036,
snapshot `Archive/coverage-no-oar-2026-08-09.txt`. Pomiary własne na stanie repo po K1-K6.*

Numeracja `L*` (luki), nowa; nie koliduje z `K*`, `S*`, `R*`, `P*`, `F*`, `T*`
ani `D*`. Konwencja jak w poprzednich work orderach: *Naprawa:*, **Odbiór:**,
*Nakład/Zależności*, blok `repro`.

**Zakres:** TWA < 50 jest poza kryterium od 2026-08-09 (decyzja właściciela,
odroczenie, nie rozwiązanie — patrz `docs/README.md`). Ten dokument dotyczy
wyłącznie kursów w zakresie.

---

## Część I. Diagnoza

### I.1. Dwie strefy zerowego pokrycia, dwie różne przyczyny

Pokrycie K2 wynosi **20/42 (48%)**. Rozkład nie jest równomierny — jest
dwubiegunowy:

| pasmo | pokrycie | uwaga |
|---|---|---|
| TWA 50-70 (bejdewind) | **0/9** | zero przy każdym z trzech wiatrów |
| TWA 80-130 (półwiatr) | 15/15 | trzyma wszędzie |
| TWA 140-160 (baksztag) | **0/9** | zero przy każdym z trzech wiatrów |
| TWA 170-180 (fordewind) | 5/6 | trzyma, ale przy 50-64% prędkości |

Przyczyny są różne i to jest istotne dla kolejności prac:

- **Bejdewind:** moment Munka rośnie z kątem dryfu szybciej niż autorytet
  takielunku. S2 mówi to wprost dla TWS10/TWA70. Sprzężenie zwrotne: mniej
  napędu → mniejsza prędkość → większy dryf przy tej samej sile bocznej →
  większy Munk → jeszcze trudniej.
- **Baksztag:** siła boczna żagla zapada się (−24 N przy TWA140 wobec −185 N
  ostro), więc **każde** ramię wzdłużne (`tackTravel`, `ceBrailXShift`,
  `hull.lead`) traci autorytet dokładnie tam, gdzie jest potrzebne. C-C
  stwierdza, że wyzerowanie momentów statycznych i tak nie zatrzymuje
  ostrzenia — to brak sztywności kierunkowej, nie brak trymu.

Wniosek: **na baksztagu problemem jest stateczność, na bejdewindzie —
autorytet i prędkość.** Jedna naprawa nie zamknie obu.

### I.2. Geometryczny sufit szotowania jest martwy od ADR 0021

ADR 0010 (S6) wprowadził `sail.deltaMinDeg` — dolne ograniczenie kąta rei
wynikające z geometrii takielunku. **Na obecnej łodzi wynosi dokładnie 0.**
Sam test to drukuje: `deltaMin=0.0deg`.

Mechanizm: formuła bierze pod uwagę **jedno** więzy — czy róg szotowy dosięga
najdalszego punktu szotowania na rufie:

    sparLength = sqrt(2*A/sin(apex)) = sqrt(2*8/sin(50)) = 4,570 m
    hull.length = 5,0 m
    spar <= hull  ->  deltaMinDeg = 0

Obie wielkości wejściowe są **MEASURED** w `data/example_proa_parameters.csv`
(pjoa.eu: „Lenght: 500cm", „Crab law sail: 8 sqm"), więc formuła nie jest
błędna — jest **niekompletna**. ADR 0021 zmniejszył żagiel 12 → 8 m² i kadłub
5,5 → 5,0 m, i to po cichu wyzerowało cały mechanizm. Własny komentarz S6 przy
`deltaMinDeg` wymienia trzy więzy — „bom, want nawietrzna, hals przy dziobie" —
ale formuła modeluje tylko pierwszy z nich. Na oceanicznej latenie to
prawdopodobnie **want nawietrzna** fizycznie nie pozwala rei zejść do osi, a
jej w formule nie ma.

Skutek: reja może być spłaszczona do 4° (minimum siatki przeszukiwania) i nic
jej nie zabrania. To jest bezpośrednia przyczyna I.3.

```js
// repro I.2 — z katalogu repo
import { createConfig } from './core/config.js';
const c = createConfig();
const spar = Math.sqrt(2 * c.sail.area / Math.sin(c.sail.apexAngleDeg * Math.PI / 180));
console.log('spar', spar.toFixed(3), 'm  hull', c.hull.length, 'm  deltaMinDeg =', c.sail.deltaMinDeg);
```

### I.3. Model ostrzy nierealistycznie wysoko

Zmierzone (pełne przeszukiwanie polary poniżej TWA40):

| TWA | TWS 6 | TWS 10 |
|---|---|---|
| 15 | **0,000** | **0,000** |
| 20 | 1,218 | **0,000** |
| 25 | 1,615 | 2,145 |
| 40 | 2,326 (VMG 1,782 ← opt.) | 3,361 |
| 55 | 2,762 | 4,664 (VMG 2,675 ← opt.) |

Kąt martwy: **~17° przy TWS 6, ~22° przy TWS 10**. Dla porównania: nowoczesny
jacht regatowy ostrzy ~30°, oceaniczna latena powinna mieć rząd 45-50°.

Formalnie poza zakresem (TWA < 50), ale **wymieniam to tutaj, bo przyczyna
z I.2 jest wspólna** i naprawa w L4 dotyka obu: sufit szotowania działa na
całym zakresie ostrym, w tym na TWA 50-70, które w zakresie **są**.

Optimum VMG pod wiatr: TWA 40 przy TWS 6 (poza zakresem), TWA 55 przy TWS 10
(w zakresie). Czyli wyłączenie TWA < 50 nie usuwa optymalnego bejdewindu na
wszystkich wiatrach — tylko na słabym.

---

## Część II. Pozycje

### Blok A — pomiar przed fizyką (wszystkie tanie)

Reguła Części IV work ordera 08-02 — „nie mierzyć przeciwko brakującemu
kryterium" — ma tu odpowiednik: **nie naprawiać przeciwko niezweryfikowanej
diagnozie.** Trzy pozycje poniżej mogą zmienić kształt bloków B-D i żadna nie
rusza fizyki.

#### L1. Czy K2 nie zaniża pokrycia w strefie baksztagowej

ADR 0030 twierdzi, że **istnieje** trym utrzymujący TWA160 bez steru. K2 nie
znalazło go w 75 kombinacjach. To nie musi być sprzeczność: K2 przeszukuje
`tackX × crewPosX × stays` przy **szocie, brasie i `crewPos` zamrożonych na
optimum polary**, a ADR 0030 znalazł swój trym szukając **po szocie**. Kurs
utrzymywalny bez wiosła nie musi być kursem najszybszym — a K2 z założenia
pyta tylko o ten drugi.

*Naprawa:* rozszerzyć przestrzeń przeszukiwania `harness/coverage-no-oar.js`
o szot i bras (zgrubna siatka wystarczy — chodzi o istnienie, nie o optimum),
i przemierzyć całą siatkę ponownie. Jawnie sprawdzić trym z ADR 0030 na
TWA160 jako punkt kontrolny.

**Odbiór:** nowa liczba pokrycia, zaraportowana obok starej, z jawnym
stwierdzeniem, czy różnica bierze się z rozszerzenia przeszukiwania czy z
fizyki. Jeśli trym z ADR 0030 nadal nie przechodzi — sprawdzić, który człon
predykatu K1 go odrzuca (wychylenie, zbieżność czy znak `dM/dψ`), bo to jest
osobna informacja: ADR 0030 mierzył samo tempo dryfu, nie trwałość.

*Nakład: mały (kod), średni (czas przeliczenia ~1-1,5 h). Zależności: przed L2.*

#### L2. Budżet momentu skręcającego dla każdego punktu NONE

Dziś rozkład momentu (Munk / kadłub / żagiel / ama) jest policzony ad hoc, w
komentarzu przy C-B, dla jednego punktu. Blok B i C wymagają go dla wszystkich.

*Naprawa:* raport (nie bramka, jak `acceptance-manual.js`): dla każdego punktu
NONE po L1 wypisać człony `breakdown` z `computeForces()` w chwili puszczenia
steru oraz `dM/dψ`. `core/integrator.js` już wystawia wszystkie człony osobno,
więc to odczyt, nie nowa fizyka.

**Odbiór:** tabela per punkt. Rozstrzygnięcie, dla każdej z dwóch stref
osobno: brakuje **sztywności** (żaden trym nie da `dM/dψ < 0`) czy
**autorytetu** (istnieje `dM/dψ < 0`, ale nie da się dojechać do równowagi w
dostępnym zakresie sterowania). To decyduje, czy L5 jest właściwą naprawą.

*Nakład: mały. Zależności: po L1.*

#### L3. Co dokładnie twierdzi źródło o tych dwóch kursach

Projekt trzy razy zbudował argument na dokumencie pochodnym zamiast na
źródle — erratum `Kryteria_Akceptacji` (AC-1.2), ADR 0028 (AC-5.2), i „nisko"
zamiast „wysoko" przy bomie. Przed dużym nakładem z L5 warto wiedzieć, czy
podręcznik w ogóle twierdzi to, co próbujemy osiągnąć.

*Naprawa:* przeczytać rozdz. III podręcznika (`sources/`, oryginał PL, nie
`Kryteria_Akceptacji`) pod kątem dwóch pytań: (a) czy bejdewind jest
utrzymywalny bez wiosła i jakimi środkami, (b) to samo dla baksztagu.
Zacytować dosłownie w findings.

**Odbiór:** dosłowne cytaty w dokumencie findings. Jeśli źródło **nie**
twierdzi utrzymywalności któregoś z pasm bez wiosła — korekcie podlega
kryterium, nie łódka, i blok C traci uzasadnienie dla tego pasma.

*Nakład: mały. Zależności: brak — zrobić równolegle z L1.*

### Blok B — bejdewind (TWA 50-70)

#### L4. Uzupełnić geometryczny sufit szotowania o więzy, których nie modeluje

*Naprawa:* rozszerzyć `sail.deltaMinDeg` o więzy wymienione w jego własnym
komentarzu, a nieobecne w formule — przede wszystkim **want nawietrzną**
(na oceanicznej latenie to ona fizycznie zatrzymuje reję przed osią), przy
potrzebie hals przy dziobie. Wartość ma wyjść z **geometrii z rysunku
takielunku** (`config.js` cytuje arkusz PJOA FOLK „Rigging - 8 sketches" przy
sztagach — ten sam rysunek), a nie z tego, przy czym pokrycie zaczyna rosnąć.
Rozważyć osobno prostą stratę CL w wąskim pasie małych `delta` (cień masztu —
dziś w „Known simplifications" jako brak).

Uwaga na pułapkę: to jest stała z klasy **wolnej w paśmie**
(`docs/parameter-register.md`), ale **pasmo ma pochodzić z geometrii**. Sam
work order 08-02 nazwał tę wielkość „ILL-CONDITIONED… słabym twierdzeniem o
konkretnej łodzi" — jeśli rysunek nie rozstrzyga, właściwą odpowiedzią jest
dodanie zmierzonego parametru do `example_proa_parameters.csv`, nie dobranie
liczby.

**Odbiór:** `bestSheetAngle` na kursach ostrych **przestaje leżeć na krawędzi
siatki przeszukiwania** (dziś 4°, czyli minimum siatki) — to jest test na to,
czy ograniczenie jest fizyczne, czy numeryczne. Zmierzone i zaraportowane
niezależnie od znaku: pokrycie K2 na TWA 50-70, kąt martwy (I.3), i deficyt
napędu wobec Di Piazzy (`S4b`, dziś model/lit 0,72 przy θ=55). **[rusza
polarę]**

*Nakład: średni. Zależności: po L2 (żeby wiedzieć, czy bejdewind to problem
autorytetu — jeśli L2 pokaże brak sztywności, ta pozycja nie wystarczy).*

### Blok C — rdzeń: druga dźwignia sterowania

#### L5. Pitch jako DOF, i CLR z rzeczywistego trymu

To jest S9 z work ordera 08-02, przeformułowane. Nie „realizm": dziś CE się
rusza (`tackX`, ADR 0011), a **CLR nie ma sterowania** — migruje pasywnie z
dryfem (D1, ADR 0032) i przez regułę kciuka `hull.crewForeAftTrimCoeff`,
której własny komentarz mówi wprost: *„nie ma za tym DOF pitcha… nie podnoś
bez prawdziwego modelu pitcha"*. To jest sufit zapisany w kodzie.

*Naprawa:* prawdziwy DOF `theta`/`q`, tą samą metodą co roll i heave — moment
prostujący z podłużnej wysokości metacentrycznej wodnicy (`BM_L = I_L / V`),
tłumienie strojone w parze jak `I_roll`/`rollDampingCoeff` i
`heave.mass`/`dampingCoeff`. Kąt trymu sprzęgnięty do `hullResistance`
(długość zwilżona) i do rozkładu planu bocznego, **zastępując**
fenomenologiczny człon w `clrXPosition()`.

Dlaczego to atakuje obie strefy: na bejdewindzie dziób w dół przesuwa CLR do
przodu (mniej weather helm); na baksztagu „załoga w rufę" jest własną receptą
podręcznika na odpadanie, dziś modelowaną wyłącznie współczynnikiem.

**Odbiór:** pitch całkowany jako prawdziwy DOF; `clrXPosition()` przestaje być
regułą kciuka; delta pokrycia K2 zmierzona i zaraportowana **per pasmo**
(50-70 i 140-160 osobno — jedna liczba zbiorcza ukryłaby handel między nimi,
tak jak przy K5). Pełna procedura weryfikacji jak przy S8: marginesy wywrotki,
wszystkie testy sterowania, `out/polar.csv` przeliczona. **[rusza polarę]**

*Nakład: duży — porównywalny z S8, ta sama procedura weryfikacji od zera.
Zależności: po L2 i L3.*

### Blok D — uzyskiwanie kursu

#### L6. Shunt bez wiosła

Twarda blokada dla członu „uzyskać każdy kurs": proa zmienia hals shuntem, a
K3 wywraca łódkę na **obu** końcach. Ale wywrotka następuje w fazie hamowania
brasem, **zanim** sekwencja shuntu zdąży się rozpocząć (`shuntCompleted=false`,
`endAfter` niezmienione) — podejrzenie pada na technikę hamowania, nie na
niemożność shuntu.

*Naprawa:* zdiagnozować fazę hamowania (`brailWind = 1.0` przy pełnej
prędkości półwiatru — czy to nie jest właśnie manewr, który podręcznik
odradza), znaleźć procedurę zejścia poniżej `shunt.speedLockout` bez wywrotki,
i dopiero wtedy mierzyć sam shunt.

**Odbiór:** rozstrzygnięcie, czy wywrotka jest własnością łodzi czy sondy
K3 — z liczbami, tą samą metodą, którą złapano błąd `heading`/`end` w samym
K3 (ADR 0034). Jeśli własnością łodzi: zostaje `xfail` z liczbami.

*Nakład: mały-średni. Zależności: brak — może iść równolegle z blokiem A.*

### Blok E — decyzja, nie implementacja

#### L7. Czy boat potrzebuje sterowanego planu bocznego

ADR 0013 wycofał miecz jako „nowoczesną opcję, nie pasującą do tego kadłuba V".
Po L5 pytanie brzmi inaczej: **czy sam trym wzdłużny daje dość zakresu CLR.**

*Naprawa:* nie implementować niczego. Zmierzyć, po L5, zakres `xCE − CLR`
osiągalny samym trymem na obu pasmach zerowych, i porównać z zakresem
potrzebnym wg L2.

**Odbiór:** liczba, nie decyzja projektowa. **Do rozstrzygnięcia przez
właściciela, nie przeze mnie:** źródłowo wspierane alternatywy (Dierking:
para mieczy w końcach albo para podnoszonych sterów) są dyskusyjnie „wiosłem
pod inną nazwą" — to pytanie o ducha kryterium, nie o fizykę.

*Nakład: mały (sam pomiar). Zależności: po L5.*

---

## Część III. Plan wdrożenia

Kolejność wynika z jednej reguły: **nie naprawiać przeciwko niezweryfikowanej
diagnozie.** Blok A jest tani i może zawęzić albo unieważnić bloki B-C.

1. **L1 + L3** równolegle (pomiar i źródło; L3 nie wymaga maszyny).
2. **L2** — rozstrzyga „sztywność czy autorytet" per pasmo.
3. **L6** — niezależne, może iść w tle całego bloku A.
4. **L4** — jeśli L2 pokaże, że bejdewind to problem autorytetu/prędkości.
5. **L5** — rdzeń, po L2 i L3.
6. **L7** — pomiar po L5, potem decyzja właściciela.

### Czego nie robić

- **Nie ruszać `hull.massSway`** dla zmniejszenia momentu Munka. Podwojenie
  odwraca cztery reguły sterowania z podręcznika (`config.js` przy
  `addedSwayPerLength`), a podręcznik przebija regresję Clarke'a.
- **Nie podnosić `crewForeAftTrimCoeff`** przed L5 — jego własny komentarz
  tego zakazuje i ma rację; to jest dokładnie ta pozycja, którą L5 zastępuje.
- **Nie dobierać `deltaMinDeg` pod pokrycie.** Pasmo ma wyjść z geometrii
  rysunku takielunku. Jeśli rysunek nie rozstrzyga — parametr idzie do CSV
  jako zmierzony, a nie zostaje dobrany.
- **Nie kalibrować pod K2.** Pokrycie jest miarą, nie celem strojenia.
  Podniesienie go zmianą stałej z klasy zamkniętej
  (`docs/parameter-register.md`) to utrata drugiej połowy kryterium.
- **Nie przepinać `R15` na TWA50** jako skutku ubocznego zmiany zakresu —
  wyszłoby 1,78× wobec progu 1,8× i wymagałoby obniżenia progu bez zmiany
  fizyki. Zostawione świadomie na TWA40 (używa go jako miary kształtu polary,
  nie jako twierdzenia o jakości żeglugi poniżej 50°).

### Ryzyko

**L5 jest duży i jego zwrot jest prawdopodobny, ale nieudowodniony** — ta sama
niepewność, przez którą S9 został wyłączony z zakresu poprzedniego work ordera.
Blok A istnieje właśnie po to, żeby ją zmniejszyć przed wydaniem nakładu.
Możliwy wynik bloku A, który trzeba przyjąć: L1 pokazuje, że pasmo baksztagowe
trzyma po rozszerzeniu przeszukiwania, a L3 pokazuje, że źródło nie twierdzi
utrzymywalności bejdewindu bez wiosła — wtedy kryterium jest bliżej spełnienia,
niż wygląda, a L5 nie jest potrzebny w tej formie.

---

## Część IV. ADR-y należne

| ADR | temat | pozycja |
|---|---|---|
| 0037 | sufit szotowania: więzy takielunku, których formuła ADR 0010 nie modeluje (i jak ADR 0021 ją unieczynnił) | L4 |
| 0038 | pitch jako szósty DOF; CLR z rzeczywistego trymu zamiast reguły kciuka | L5 |
| — | L1/L2/L3/L6 tylko jeśli zmienią model albo wycofają twierdzenie ADR-a; L7 z definicji kończy się decyzją właściciela, nie ADR-em | — |

---

## Część V. Wykonanie (2026-08-09)

### L3 — co dokładnie twierdzi źródło. Wykonane.

Przeczytany cały `Elementarz-zeglowania-po-mikronezyjsku-6_3PL.pdf` (11 stron —
to krótki elementarz, nie ma w nim dalszego podziału rozdziału III poza tym,
co cytuję niżej). Trzy ustalenia, wszystkie ważące na kształcie L5 i samego K1.

**1. Rozdział III ma zastrzeżenie w samym nagłówku, którego żaden dokument
pochodny nie cytuje:** *„Jak zmieniać i utrzymać kierunek (poniższe sposoby
stosować z umiarem 😊)"*. Kryterium projektu mówi „utrzymać KAŻDY kurs" —
źródło już w tytule sekcji, z której to kryterium wyprowadzono, zastrzega
umiar, nie bezwarunkowość.

**2. Źródło opisuje sterowanie CZYNNE, nie równowagę bierną.** Cały rozdział
III to czasowniki ruchu: „załoga PRZESUWA SIĘ", „PRZYCIĄGAMY i LUZUJEMY
żagiel", „dziób łódki jest ODCIĄGANY". Żadne zdanie nie twierdzi „ustaw trym
raz i zostaw" — opisany jest ciągły, ręczny nacisk na szot/gejtawę/wantę,
analogiczny do trzymania steru, tylko liną zamiast piórem. To jest inna
własność niż to, co mierzy `holdsCourse()`: K1 sprawdza **trym zamrożony na
300 s**, zero korekt. Źródło — czytane dosłownie — opisuje sterowanie ciągłe
liną zamiast piórem, nie równowagę, która trzyma się sama.

**Konsekwencja dla L5 i dla samego K1, do rozstrzygnięcia przez właściciela,
nie przeze mnie:** czy kryterium „bez wiosła" ma znaczyć „bez pióra w wodzie,
ale z ciągłym trymowaniem rękami" (co źródło opisuje wprost), czy „ustawić
trym raz i zejść z pokładu" (co dziś mierzy K1). Pierwsze jest znacznie
łatwiejsze do osiągnięcia — i może już być częściowo osiągnięte przez S2
(sterowanie halsem, `docs/adr/0011`), które dziś jest mierzone niewłaściwym
predykatem. Nie zmieniam K1 samodzielnie — to zmiana definicji kryterium, nie
naprawa fizyki.

**3. Bejdewind i „prawie całkiem z wiatrem" MAJĄ nazwane techniki trymu w
źródle — TWA 140-160 nie ma własnej.** Trzy nazwane pasma:

| pasmo źródła | technika | cytat |
|---|---|---|
| „ku wiatrowi" (ostro) | szot | *„Przyciągamy mocniej żagiel... dziób łódki delikatnie jest odciągany za wiatrem... Odpuszczamy... dziób łódki zbliża się do kierunku skąd wieje"* |
| „boczny wiatr" (półwiatr) | gejtawa + głębokość żagla | *„dodajemy żaglowi głębokości i »przełamujemy« gejtawą... im bardziej przełamiemy żagiel, tym mocniej dziób odciągniemy od wiatru"* |
| „prawie całkiem z wiatrem" (fordewind) | marchewka (bom wysoko) I/LUB pion masztu (wanta) | *„Żagiel ustawiamy »w marchewkę«... oraz/albo: Maszt stawiamy bardziej ku pionowi ciągnąć go wantą"* |

TWA 140-160 (baksztag) leży **między** pasmem „boczny wiatr" a „prawie
całkiem z wiatrem" i nie ma własnej nazwanej techniki — jest domyślnie objęte
ekstrapolacją jednej z dwóch sąsiednich, nie osobnym poleceniem źródła. To
osłabia (nie unieważnia) zasadność C-B/C-C jako testu **literalnej** recepty
źródła na TWA140/160 — te punkty są reprezentatywne dla strefy, nie cytowane
wprost.

**4. Wiosło jest opisane jako zawsze dostępna pomoc, nie ostateczność
wykluczona z rachunku.** Ostatnie zdanie techniki „Pagajem (wiosłem), jak
sterem": *„Zawsze pomaga i działa tym energiczniej, im szybciej płyniemy"*.
Umieszczone na końcu rozdziału III, po wszystkich technikach trymu — źródło
nie mówi „zamiast wiosła", tylko przedstawia trym jako metodę podstawową i
wiosło jako coś, co „zawsze pomaga". Sama obecność tego zdania w rozdziale o
sterowaniu jest kontrargumentem wobec odczytania kryterium jako „wiosło nigdy
nie dotyka wody, w żadnych okolicznościach" — ale ADR 0028 już rozstrzygnął
analogiczne pytanie (AC-5.2) w drugą stronę: to zdanie o SYMULATORZE, nie
przepis podręcznika na konkretny kurs. Ta czwarta obserwacja jest więc
kontekstem, nie nowym rozstrzygnięciem — zostawiam ją właścicielowi bez
rekomendacji.

**Nie zmieniam na tej podstawie żadnej asercji ani K1.** To są fakty ze
źródła do decyzji właściciela — patrz pytania w podsumowaniu Części V.

### L1 — czy K2 zaniża pokrycie na baksztagu. W toku.

`harness/coverage-no-oar.js` rozszerzony o `--wide-search` (szot × bras jako
dodatkowe osie przeszukiwania, `SHEET_TRIALS=[35,55,75]`,
`BRAIL_TRIALS=[0,0.5,1.0]`) i `--twa=`/`--tws=` do skalowania kosztu. Pełna
siatka 9 par × 75 kombinacji × 9 punktów była nieopłacalna (~2,5 h przy
pełnej rozdzielczości); zawężona do zgrubnej siatki i do TWA 140/150/160 —
zgodnie z własnym zaleceniem L1 („zgrubna siatka wystarczy — chodzi o
istnienie, nie o optimum").

**Kontrolny pomiar przed uruchomieniem pełnego przeszukiwania:** trym z ADR
0030 dla TWA160/TWS6 (sheet=55°, tackX=+1, brailWind=0,5, crewPosX=−1)
sprawdzony wprost na obecnym modelu:

```
settled: heading 90.2  u 2.31  v -0.02  capsized false
300s oar-shipped hold: excursion 83.4deg  speedRatio 64%  converged true  restoring true  slope -0.1  capsized false
```

**Trym z ADR 0030 dziś NIE trzyma kursu** (wychylenie 83,4° wobec progu 15°)
— ale `converged=true` i `restoring=true`: łódka nie dryfuje bez końca, tylko
osiada w **innej** równowadze, ~83° od TWA160. To nie jest błąd pomiaru z
2026-08-05 — to jest fizyka, która **przesunęła się pod nim**. D1 (ADR 0032)
własnym tekstem nazywa TWA162-174 pasmem, które traci sztywność kierunkową
kosztem zysku na TWA94-158; TWA160 stoi dokładnie na tej granicy. S8 (heave,
ADR 0033) i K5 (migracja CLR amy) doszły później i też mogły to przesunąć.
**Wniosek ADR 0030 („istnieje trym trzymający TWA160") jest nieaktualny, nie
obalony** — potrzebuje ponownego pomiaru pod dzisiejszą fizyką, co jest
dokładnie tym, co reszta L1 teraz robi.

Pełny wynik szerokiego przeszukiwania TWA140/150/160 w toku, dopisany niżej
po zakończeniu.

*Nakład: mały (kod), średni (czas). Blok `repro` kontrolny: `scratch/l1_adr0030_check.mjs`.*

### L2 — budżet momentu skręcającego dla każdego punktu NONE. Wykonane.

`scratch/l2_moment_budget.mjs`: dla wszystkich 18 punktów NONE (TWA 50/60/70
i 140/150/160 × TWS 4/6/10), w chwili puszczenia steru przy trymie
neutralnym, rozkład `computeForces().breakdown` plus `dM/dψ`:

| pasmo | `dM/dψ` | dominujący człon | wniosek |
|---|---|---|---|
| TWA50-60 | destabilizujący (+0,1 do +1,3), rośnie z wiatrem | `hullSide` (do −268 N·m) | brzeg strefy niestabilnej |
| **TWA70** | **przywracający** przy wszystkich trzech wiatrach (−0,1 do −0,6) | — | równowaga sąsiaduje, trym może dosięgnąć |
| TWA140-160 | **zawsze destabilizujący** (+0,8 do +6,7!), **rośnie dramatycznie z wiatrem** | **`sail`** (+34 do +231 N·m, `hullSide`≈0) | czysty problem sztywności |

**Rozstrzygnięcie:** bejdewind i baksztag to **dwa różne problemy**, dokładnie
jak podejrzewano w diagnozie (I.1), teraz potwierdzone liczbowo:

- **Bejdewind jest problemem GRANICZNYM/AUTORYTETU.** Przy neutralnym trymie
  TWA70 jest już lokalnie przywracający na każdym wietrze (i TWA60 też, przy
  TWS10). To sugeruje, że trym ma szansę przesunąć równowagę z niestabilnej
  strefy 50-60° w stabilną — L4 (autorytet) jest właściwym narzędziem.
- **Baksztag jest czystym problemem SZTYWNOŚCI, zdominowanym przez sam
  żagiel.** `dM/dψ` nigdy nie jest ujemny w tym paśmie, przy żadnym wietrze —
  i pogarsza się z wiatrem (TWS4: +0,8÷1,1 → TWS10: +5,3÷6,7), czyli
  **odwrotnie niż potrzeba**. `hullSide` jest bliskie zeru (kadłub nie ma tu
  nic do powiedzenia), `amaDrag` mały. To potwierdza dosłownie komentarz
  C-C: „directional STABILITY problem... not a trim-authority one" — teraz
  dla wszystkich trzech wiatrów, nie tylko dwóch zmierzonych punktów. **Żaden
  zakres trymu tego nie naprawi — trzeba nowej sztywności, czyli L5.**

*Nakład: mały. Blok `repro`: `scratch/l2_moment_budget.mjs`.*

> **ERRATA 2026-08-10 — całe rozstrzygnięcie L2 jest wycofane (ADR 0039).**
> `scratch/l2_moment_budget.mjs:34` liczył `dM/dψ`, obracając `heading` przy
> zamrożonych `u`/`v` — a `u`/`v` są w układzie ŁODZI, więc obracał kadłub
> razem z opływem. Wszystkie momenty hydrodynamiczne (kadłub i ama) skracały
> się w różnicy i mierzony był **wyłącznie takielunek**. Po poprawce (wektor
> prędkości obracany o `−dψ`, prędkość w układzie świata stała)
> **wszystkie 18 punktów jest przywracających**, a nachylenie rośnie
> (bardziej ujemne) z wiatrem — odwrotnie niż zapisano w tabeli:
>
> | pasmo | `dM/dψ` TWS4 | TWS6 | TWS10 |
> |---|---|---|---|
> | TWA50-70 | −11,0 ÷ −14,0 | −20,4 ÷ −25,1 | −57,3 ÷ −93,3 |
> | TWA140-160 | −6,4 ÷ −8,4 | −12,0 ÷ −15,0 | −37,6 ÷ −57,7 |
>
> Tym samym upada wniosek „baksztag to czysty problem SZTYWNOŚCI zdominowany
> przez sam żagiel” i zdanie **„żaden zakres trymu tego nie naprawi — trzeba
> nowej sztywności, czyli L5”**, które było deklarowaną motywacją L5. Sam
> szósty DOF (ADR 0038) nie jest wycofany — stoi na własnych podstawach
> fizycznych — ale erratum ADR 0038 („L5 ma zerowy wpływ na kryterium”)
> zyskuje tu wyjaśnienie: przesłanka była artefaktem sondy.

### L6 — czy wywrotka podczas hamowania przed shuntem jest własnością łodzi czy sondy K3. Wykonane.

Cztery pomiary izolujące przyczynę (`scratch/l6_shunt_diag*.mjs`):

1. **Trym trzymający K3 (`tackX=1, crewPosX=-1`) jest sam w sobie stabilny w
   nieskończoność** — 600 s bez dotykania brasu, `phi` ustala się na −6,1°,
   `amaLoad=0,61`, zero dryfu.
2. **Skokowa zmiana `brailWind` z 0→1,0 wywraca w 4,9 s** (`amaLoad` skacze
   0,6→6,5).
3. **Rozłożenie zmiany na rampę 5 s lub 10 s NIE pomaga** — wywraca się i tak,
   tylko później (9,2 s / 13,2 s), przy tym samym końcowym `phi=−65,1°`. To
   wyklucza artefakt skokowego wejścia.
4. **Bras nawietrzny sam, oba brasy razem, i luzowanie szota zamiast brasu —
   wszystkie trzy wywracają.** Nie jest to specyficzne dla `brailWind`.

**Wniosek:** wywrotka jest realną, powtarzalną konsekwencją **zwalniania z
tego konkretnego trymu**, nie artefaktem testu ani wyborem, którego brasu
użyć. Trym `tackX=1/crewPosX=-1` jest stabilny tylko przy pełnej prędkości —
każda próba zwolnienia (bras, oba brasy, luzowanie szota) go destabilizuje.
To odkrycie różni się jakościowo od wcześniejszego błędu `heading`/`end` w
K3 (ADR 0034) — tam błąd był w sondzie; tu sonda mierzy poprawnie, a wynik
jest własnością łodzi.

**Rekomendacja, nie wykonana w tej rundzie** (wymaga własnej weryfikacji, poza
zakresem L6 jako diagnozy): hamowanie przed shuntem powinno najpierw
**złagodzić trym w stronę neutralnego** (cofnąć `tackX`/`crewPosX`), dopiero
potem redukować moc żaglem — nie redukować moc, trzymając trym
zoptymalizowany pod pełną prędkość. `harness/asserts-course-change.js`
pozostawiony bez zmian — to jest wynik do zaraportowania, nie błąd testu do
naprawienia.

*Nakład: mały (diagnoza). Naprawa (osobna pozycja, nie wykonana tu): mała-średnia.*

### L4 — uzupełnienie sufitu szotowania. Wykonane, innym mechanizmem niż planowano.

Próba wyprowadzenia geometrii wanty nawietrznej z rysunku takielunku
napotkała twardą granicę: `example_proa_parameters.csv` nie ma wysokości
masztu ani punktu mocowania wanty — tylko `CE_height_m` (wysokość środka
ożaglowania, nie masztu) i `beam_overall_m` (rozstaw amy). Wymyślenie
precyzyjnej geometrii kolizji bez tych danych byłoby dokładnie tym, przed
czym ostrzega własny komentarz `deltaMinDeg`: „ILL-CONDITIONED... słabym
twierdzeniem o konkretnej łodzi". Nie zrobiłem tego.

**Znalazłem lepiej uzasadnioną naprawę zamiast tego.** ADR 0010 (S6, ta sama
runda co `deltaMinDeg`) rozważył **cień masztu** i świadomie go nie dodał:
*„a trimmed yard never sits in the narrow small-delta band such a term would
act on... it would have no consumer"* — bo wtedy `deltaMinDeg = 10,7°` na
starej (12 m², 5,5 m) łodzi. **Na obecnej łodzi (8 m², 5,0 m) `deltaMinDeg =
0` — konsument, którego wtedy brakowało, dziś istnieje.**

*Naprawa:* `sail.mastShadowWidthDeg` (8°) i `sail.mastShadowCLFactor` (0,15) w
`core/config.js`; mechanizm w `core/aero.js`'s `sailCoefficients()` — liniowy
zanik CL w wąskim paśmie wokół `delta=0`, zero poza nim. **Jawnie oznaczone
jako oszacowanie, nie pomiar** (brak danych z tunelu czy z pola o cieniu
masztu na tym konkretnym takielunku) — ten sam status co `deltaMinDeg`'s
własna wartość: więzy solidne, wielkość słaba. Nie dobierane pod pokrycie.

**Odbiór:** 88/88 asercji fast suite bez regresji. Efekt na kąt martwy i
`bestSheetAngle` zmierzony niżej. **[rusza polarę]**

*Nakład: średni. Zależności: żadnych blokujących.*

### L1 — dokończone. Wynik zmienia obraz całości.

`node harness/coverage-no-oar.js --wide-search --twa=140,150,160`, zgrubna
siatka szot×bras (3×3) dołożona do istniejącej 75-kombinacyjnej siatki
`tackX×crewPosX×stays`, zmierzone **przed** wdrożeniem L4/L5 (na fizyce
sprzed tej rundy):

**9/9 punktów trzyma się** (TWA 140/150/160 × TWS 4/6/10), wszystkie z
wychyleniem < 2°:

| punkt | szot | bras | tackX | crewX | stays | wychylenie |
|---|---|---|---|---|---|---|
| TWA140/TWS4 | 35° | 1,0 | 1 | −0,5 | −1 | 0,8° |
| TWA150/TWS4 | 35° | 1,0 | 1 | −1 | 0 | 0,2° |
| TWA160/TWS4 | 55° | 1,0 | 1 | −1 | 1 | 0,0° |
| TWA140/TWS6 | 35° | 1,0 | −0,5 | −1 | 1 | 0,2° |
| TWA150/TWS6 | 35° | 0,5 | 0,5 | −1 | 1 | 0,1° |
| TWA160/TWS6 | 55° | 0,5 | 1 | −1 | 1 | 0,5° |
| TWA140/TWS10 | 35° | 0,5 | 1 | 0 | 0 | 0,1° |
| TWA150/TWS10 | 35° | 0 | 1 | −0,5 | 1 | 0,6° |
| TWA160/TWS10 | 55° | 0,5 | 1 | −1 | 1 | 1,8° |

**To potwierdza kontrolny pomiar ADR 0030 strukturalnie (choć nie przy tym
samym trymie — fizyka przesunęła się pod nim, patrz kontrola wyżej) i
pokazuje, że oficjalny snapshot K2 („0/9" na tym paśmie) jest w dużej mierze
artefaktem metody, nie granicą fizyczną.** K2 zamraża szot i bras na
optimum PRĘDKOŚCI polary — a trym utrzymujący kurs bez wiosła nie musi być
trymem najszybszym (patrz `sheet` w tabeli: 35-55°, podczas gdy optimum
prędkości na tych kursach to 48-84° z `out/polar.csv`).

**Dlaczego nie robię tego domyślną metodą K2.** Koszt: 9 punktów × zgrubna
siatka 9 par szot/bras × 75 kombinacji = 2217 s (37 min) dla samych trzech
TWA. Pełna siatka 42 punktów przy tej samej rozdzielczości to **rząd 9-11
godzin** — niepraktyczne w ramach jednej rundy. `--wide-search` zostaje
narzędziem **celowanym** (`--twa=`) do potwierdzania punktów zerowych, nie
domyślną ścieżką `coverage-no-oar.js`. Udokumentowane w nagłówku pliku.

**Konsekwencja dla L5:** L2 zdiagnozował TWA140-160 jako „czysty problem
sztywności przy trymie neutralnym" — to pozostaje prawdą i uzasadnia L5. Ale
L1 pokazuje, że **przy nieneutralnym trymie (w tym szocie) sztywność
przywracająca już istnieje** w części tej przestrzeni, tylko oficjalna
metoda K2 nigdy jej nie widziała. L5 domyka to strukturalnie (nowa dźwignia
CLR), L1 pokazuje, że stara dźwignia (sam szot) też częściowo wystarczała —
obie rzeczy są prawdziwe naraz i obie wchodzą do finalnej liczby pokrycia.

*Nakład: mały (kod), duży (czas — 37 min na 3 punkty). Blok uruchomienia:
`node harness/coverage-no-oar.js --wide-search --twa=140,150,160`.*

### L5 — pitch jako 6. DOF. Wykonane.

Zaimplementowany tą samą metodą co heave (S8): rygorystyczna sztywność
hydrostatyczna (`rho_w*g*I_L`, `I_L = heave.waterplaneArea*L²/12`), para
bezwładność/tłumienie strojona przeciw docelowej odpowiedzi skokowej
(`zeta=0,6`, ta sama dyscyplina co `I_roll`/`heave.mass`), bez nieliniowości
wywrotkowej (pitch nie ma odpowiednika odwrócenia ramienia prostującego amy —
to zwykły oscylator tłumiony, jak heave, nie jak roll).

**Jedyny moment sterujący:** ciężar załogi wzdłuż kadłuba
(`crewPitchMoment`, ta sama struktura co `crewRollMoment`). `theta` steruje
teraz `clrXPosition()` zamiast `crewPosX` bezpośrednio —
`hull.crewForeAftTrimCoeff` zachowuje swoje pierwotne znaczenie („ułamek
połowy długości, o jaki CLR przesuwa się przy pełnym wychyleniu załogi"),
ale jest re-zakotwiczony na `config.pitch.thetaAtFullCrew` (rygorystycznie
wyprowadzony kąt równowagi), nie na `crewPosX` wprost — suwak UI i istniejące
paczki configu działają bez zmian.

**Zweryfikowane bezpośrednio:** `crewPosX=0 → θ=0,00°`; `crewPosX=±1 →
θ=±5,27°` (ustalone, bez wywrotki) — dokładnie zgodne z ręcznym wyliczeniem
`thetaAtFullCrew`.

**Czego NIE zrobiono w tej rundzie** (nazwane, nie ukryte): brak sprzężenia
do `hullResistance` (zmiana długości zwilżonej z trymem — osobny efekt
fizyczny, dotyka liczby Fr i garbu oporu resztkowego); brak wkładu żagla/
kadłuba do momentu pitch (dziś napędza go wyłącznie ciężar załogi). `theta`
jest dziś w pełni zdeterminowane przez `crewPosX` — to jest dokładnie to, co
mierzy delta pokrycia niżej.

**Odbiór:** 88/88 fast suite, **96/96 pełnego zestawu, zero niespodziewanych
promocji**, z L4 razem. Polara nietknięta poza wierszami L4 już zmienił
(TWA 40-50). **Regresja zmierzona, nie ukryta:** S2 spadło 6/6→4/6
(TWS6/TWA90 przestał trzymać się przy neutralnym trymie załogi — inne
punkty osiadają na innych trymach niż przed L5). S1c bez zmiany liczby
(4/6), ale inny zestaw trymów zwycięskich. C-B/C-C bez zmiany. Pełna delta
pokrycia K2 (oficjalna metoda, 42 punkty) w toku, dopisana niżej po
zakończeniu.

*Nakład: duży, zgodnie z przewidywaniem w Części III. **[rusza polarę]***

### L7 — osiągalny zakres CLR samym trymem, po L5. Wykonane.

`scratch/l7_clr_range.mjs`: CLR porusza się dziś w zakresie **[−0,750,
+0,500] m** (rozpiętość 1,25 m) samym `crewPosX` przez pitch — dokładnie ta
sama rozpiętość, jaką dawał stary fenomenologiczny człon
(`crewForeAftTrimCoeff × L`), bo re-zakotwiczenie w L5 świadomie zachowało tę
kalibrację. `tackX` porusza `xCE` o 1,60 m. Razem (`tackX × crewPosX`, przy
`delta=0`) dźwignia `xCE − CLR` obejmuje **[−1,125, +1,725] m i przechodzi
przez zero** — ta sama własność, którą S2 już potwierdzał, teraz z
dodatkowym stopniem swobody po stronie CLR.

**Nie jest to nowa informacja ponad S2** — S2 już wykazywał przejście przez
zero dla samego `tackX`. L7 potwierdza, że L5 nie zawęziło tego zakresu (CLR
dodaje własną rozpiętość, nie odejmuje).

**Do decyzji właściciela (zapisane, nie rozstrzygnięte tutaj):** czy
rozpiętość 1,25 m dla CLR jest wystarczająca, czy potrzeba więcej — a jeśli
więcej, to czy sięgać po miecz/płetwę (ADR 0013, wycofane jako „nie pasuje do
tego kadłuba V") czy poszerzać `crewForeAftTrimCoeff` (dziś zablokowane
wyraźnym „do not raise it further" — L5 zdjęło literalny powód tej blokady,
ale nie jej ducha: to nadal górna granica tego, co załoga fizycznie może
zrobić w 5-metrowym kajaku).

*Nakład: mały. Blok `repro`: `scratch/l7_clr_range.mjs`.*

---

*Reprodukcja: bloki `repro` uruchamiane z katalogu repo, nie modyfikują jego
stanu. Pomiar I.3 pełnym skryptem w `scratch/dead_angle.mjs`.*

---

## Część VI. Blok A z listy następczej (M1-M3), 2026-08-09

Trzy pozycje zaproponowane po zamknięciu L1-L7. Wykonane w kolejności
M2 → M3 → M1. **Dwa z trzech wyników obaliły hipotezę, z którą wchodziłem.**

### M2 — bejdewind: to nie jest problem autorytetu. Wykonane.

`scratch/m2_beat_equilibrium.mjs`: na **wszystkich 9 punktach** (TWA 50/60/70
× TWS 4/6/10) istnieje `tackX` **w dostępnym zakresie**, który zeruje moment
skręcający przy kursie docelowym, i nachylenie `dM/dψ` jest tam
**przywracające**:

| | TWS 4 | TWS 6 | TWS 10 |
|---|---|---|---|
| TWA 50 | null −0,45 | null −0,22 | null −0,30 |
| TWA 60 | null −0,44 | null −0,17 | null −0,25 |
| TWA 70 | null −0,35 | null −0,00 | null −0,32 |

Wszystkie |tackX| ≤ 0,45 przy dostępnym ±1 — **dźwignia halsu ma ponad
dwukrotny zapas.** A mimo to każdy z 9 punktów zawodzi w rzeczywistym
przebiegu: wychylenie 27-53°, prędkość spada do 0-10 %, wywrotki przy TWS 6
i 10.

**Hipoteza sprawdzona i OBALONA** (`scratch/m2b_beat_sideforce.mjs`):
zakładałem, że wiosło niesie siłę boczną, której kadłub nie zastąpi, i że po
jego wyjęciu dryf ucieka. Kąt dryfu **jest stabilny** (5,2° → 5,3° → 4,0°) —
nie ucieka. Udział wiosła w sile bocznej to 22-30 % na bejdewindzie.

**Rzeczywisty mechanizm:** `phi` ucieka w stronę **ujemną** (ama wciskana pod
wodę) aż do wywrotki. Gdy łódka zwalnia, moment przechylający żagla maleje, a
**ciężar załogi siedzącej na amie zaczyna ją topić**. Utrata prędkości jest
skutkiem przechyłu, nie przyczyną.

**Częściowa konsekwencja** (`scratch/m2c_crewpos.mjs`): K2 zamraża `crewPos`
(pozycję załogi w poprzek) na optimum prędkości polary i nigdy jej nie
przeszukuje — trzecia zamrożona oś obok szotu i brasu, a przy tym **pierwsza
technika sterowania wymieniona w rozdziale III podręcznika**. Przeszukanie
`crewPos × tackX` ratuje jednak tylko **1 z 6** testowanych punktów
(TWA70/TWS6: `crewPos=0,65`, `tackX=1`, wychylenie 12,0°). Więc to **nie** jest
ten sam mechanizm co przy baksztagu — hipoteza „trzeciej zamrożonej osi" jest
słabo potwierdzona i zapisuję ją jako taką.

### M3 — shunt bez wiosła. Wykonane; shunt działa, restart nie.

Dwa błędy w moim własnym teście, oba znalezione pomiarem, nie czytaniem.

**Błąd 1 — flaga myląca co do miejsca awarii.** `slowedBelowLockout` była
spełniana **przez samą wywrotkę**: `integrate()` wygasza `u`/`v` do zera po
ustawieniu `capsized`, więc goły test prędkości przechodzi. Test raportował
„zwolniono poniżej progu" na przebiegach, które już się wywróciły. Naprawione
(warunek wyklucza `capsized`), i to samo naprawione w sondzie.

**Błąd 2 — zła kolejność, wbrew źródłu.** Rozdział IV podręcznika podaje
sekwencję: (1) *„Luzujemy całkowicie szot i gejtawy"*, (2) zdjąć hals-linę,
(3) *„!!! Wszyscy siadamy mniej-więcej po środku !!!"*, z uwagą (b):
*„Przesiadać się należy w trakcie zawracania tak, by łódka na dłużej nie
zagłębiła któregoś końca"* — reguła o `state.theta`, wielkości, która stała
się modelowana dopiero z ADR 0038.

Wykonanie tych kroków **dyskretnie wywraca łódkę w obie strony**
(`scratch/m3_manual_order.mjs`):

| kolejność | wynik |
|---|---|
| załoga na środek pierwsza (żagiel pracuje) | `phi = +65°` — ama leci, wywrotka na **zawietrzną** |
| szot wyluzowany pierwszy (załoga na amie) | `phi = −65°` — ama wciśnięta, wywrotka na **nawietrzną** |

To ta sama równowaga z dwóch stron: **moment przechylający żagla i ciężar
załogi są dla siebie przeciwwagą**, więc usunięcie któregokolwiek jako
pierwszego wywraca łódkę — nie sam krok jest zły, tylko jego izolacja. Załoga
nie wykonuje tego jako dwóch osobnych ruchów.

**Naprawa: skoordynowana rampa** (30 s; szot, brasy, obie osie pozycji załogi
i hals jednocześnie). Wynik — **shunt bez wiosła kończy się poprawnie na obu
końcach**: `shuntCompleted=true`, `end` odwrócone, brak wywrotki w rampie
odmocowania i w rampie ponownego rozpędzania, wychylenie po shuncie **12,0°**
(w paśmie 15°), `converged=true`, `restoring=true`.

**Co nadal zawodzi:** `speedRatio=0 %` i wywrotka w fazie utrzymania —
łódka nie potrafi **ruszyć z niemal zerowej prędkości** z wiosłem wyjętym
(brak prędkości → brak siły bocznej kadłuba → żagiel przewraca ją bokiem).
Jakość rampy ponownego rozpędzania widać wprost: wychylenie po shuncie idzie
38,1° (10 s) → 21,0° (20 s) → **12,0° (30 s)**. To jest nowe, precyzyjnie
zlokalizowane wąskie gardło, nie ogólne „shunt nie działa".

*Zmiana w `harness/asserts-course-change.js`; test nadal `xfail:STEERING`,
z liczbami.*

### M1 — tani pre-screen. Zwalidowany i włączony; pełny przebieg w toku.

`--static-screen`: odrzuca trym **bez całkowania**, jeśli `M(ψ)` nie ma
miejsca zerowego w oknie ±25° wokół kursu. Świadomie permisywny — M2 właśnie
pokazał, że statyka jest **słabym predyktorem** (wszystkie 9 punktów
bejdewindu ma statyczne zera, a żaden nie trzyma), więc screen może wyłącznie
odrzucać beznadziejne przypadki.

**Walidacja przed włączeniem** (`--validate-screen`, TWA 70/110/160 × TWS 6):
**200 trymów, które screen odrzuciłby, przepuszczono przez pełny test 300 s —
0 z nich przeszłoby.** Screen bezpieczny; odrzuca 200/225 (89 %) na tej
próbce.

**Pierwszy wynik pełnego szerokiego przeszukiwania: TWA50/TWS4 — HOLDS.**
To **pierwszy trzymający punkt na bejdewindzie w całej historii projektu**,
i znaleziony wyłącznie przez poszerzenie osi przeszukiwania, bez zmiany
fizyki. Wzmacnia to wniosek L1 znacznie: zerowe pokrycie na obu pasmach jest
w dużej mierze artefaktem metody.

**Pełny przebieg zakończony (2 h 5 min, nie ~7 h): 31/42.** Ale wzorzec był
niewiarygodny i **nie przyjąłem go**: przy TWS 6 całe pasmo TWA 50-130 dało
0/9, podczas gdy TWS 4 i TWS 10 trzymały prawie wszystko. Prędkość wiatru,
która zawodzi *pomiędzy* dwiema działającymi, nie jest wzorcem fizycznym.

**Przyczyna — defekt w moim własnym kodzie z L1, nie własność łodzi.**
`--wide-search` **zastępował** optimum polary zgrubną siatką zamiast je
dodawać, więc nie był nadzbiorem przeszukiwania domyślnego. Przy TWS 6 kursy
reachowe trzymają się przy szocie **16-28°** (znajduje je przebieg domyślny),
a siatka szeroka oferuje `{35, 55, 75}` — „szersze" przeszukiwanie było więc
**ściśle węższe dokładnie tam, gdzie to miało znaczenie**. To ta sama lekcja,
którą zapisał ADR 0030 („a search is only as wide as its weakest-swept
axis"), napotkana z drugiej strony i tym razem przeze mnie.

*Naprawione* (`harness/coverage-no-oar.js`: optimum polary jest teraz zawsze
w zestawie, `--wide-search` dokłada do niego).

**Liczba końcowa — unia obu przeszukiwań: 38/42 (90 %).** Unia jest uczciwym
wynikiem, nie sztuczką: oba przebiegi bramkują każdy HOLDS **tym samym**
predykatem 300 s, więc punkt trzymający w którymkolwiek trzyma się naprawdę.

| przeszukiwanie | wynik |
|---|---|
| wąskie (szot/bras zamrożone na optimum prędkości) | 21/42 |
| szerokie (siatka szot × bras, z pre-screenem) | 31/42 |
| **unia** | **38/42 (90 %)** |

**Pozostałe cztery luki — wszystkie przy TWS 6** (TWA 50/60/70/130), czyli
przy tym jednym wietrze, gdzie zgrubna siatka szotu leży najgorzej wobec
kątów, które faktycznie działają. To są **najmniej wiarygodne NONE w całej
tabeli, nie najpewniejsze** — przebieg z naprawionym kodem prawdopodobnie
znajdzie ich mniej, nie więcej.

### Wniosek Bloku A

Trzy pozycje, trzy różne rodzaje wyniku: **M2 obaliło diagnozę** (bejdewind
to przechył, nie autorytet), **M3 znalazło dwa błędy w moim własnym teście**
i doprowadziło shunt bez wiosła do działania, **M1 znalazło trzeci** — i po
jego naprawie podniosło zmierzone pokrycie z 21/42 do **38/42 (90 %)**.
Żadna z trzech pozycji nie zmieniła fizyki. Wszystkie zmiany są w narzędziach
pomiarowych i w testach.

To jest samo w sobie wynik, i niewygodny: **trzy z trzech pozycji tego bloku
znalazły defekt w pomiarze, nie w łodzi.** Przez dwa poprzednie bloki
(K1-K6, L1-L7) oceniałem zmiany fizyki wobec metryki, która systematycznie
zaniżała — i część wniosków z tamtych bloków trzeba czytać w tym świetle.
W szczególności: L4 i L5 (cień masztu, DOF pitch) zostały ocenione jako
„podnoszą pokrycie o 1 punkt", ale oceniano je wąskim przeszukiwaniem, które
gubiło od 8 do 17 punktów. **Ich rzeczywisty wpływ na kryterium nie został
zmierzony** i wymagałby powtórzenia obu pomiarów unią — to jest otwarta
pozycja, nie wynik.
