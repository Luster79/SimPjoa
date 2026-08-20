# Lista poprawek — kryterium bez wiosła: mierzyć cel, potem go podnosić

*Last reviewed: 2026-08-09*
*Wejście: kryterium sukcesu projektu (`docs/README.md`, „The success criterion"),
Część V `work-order-2026-08-02-steering-and-sources.md`, ADR 0017/0032/0033.
Pomiary własne na `538eb07` — pełny `node run_tests.js` (95/95 asercji, 9 `xfail`)
oraz sonda trwałości opisana w I.2.*

Numeracja `K*` (kryterium), nowa; nie koliduje z `S*`, `R*`, `P*`, `F*`, `T*`
ani `D*`. Konwencja jak w poprzednich work orderach: *Naprawa:*, **Odbiór:**,
*Nakład/Zależności*, blok `repro`.

---

## Część I. Stan zastany

### I.1. Co dziś wiadomo o kursie bez wiosła

Wszystko zmierzone na `538eb07`, konfiguracja domyślna, wprost z komunikatów
asercji:

| asercja | wiosło | wynik |
|---|---|---|
| S1a | w wodzie, ster puszczony, trym neutralny | 2/6, najgorszy 40,5° w 60 s |
| S1b | **wyjęte**, trym neutralny | **0/6, trzy wywrotki** |
| S1c | **wyjęte**, szukanie po hals × załoga wzdłużnie | **4/6** (nie trzymają TWS6/TWA110 i TWS10/TWA70) |
| S2 | w wodzie, szukanie po hals × sztagi | 5/6 (nie trzyma TWS10/TWA70) |
| C-A | w wodzie, TWA178 | 38,2 °/min wobec progu 20 (`xfail`) |
| C-B | **wyjęte**, pełny trym odpadania, TWA140/160 | 0/2 (30,8 i 36,8 °/min) |
| C-C | **wyjęte**, recepta z podręcznika | 1/2 (TWA140 −7,9 °/min; TWA160 28,0 °/min) |

Pod kryterium liczą się wyłącznie wiersze z wiosłem wyjętym. Sumarycznie:
**5 z 8 zmierzonych punktów**, przy czym siatka nie zawiera ani jednego kursu
poniżej TWA 70 (polara zaczyna się na 40, optimum VMG wypada ~45), ani niczego
między 110 a 140, a kursy pełne tylko przy TWS 6.

To jest cała wiedza, jaką pakiet ma o kryterium. Nie ma w nim liczby, która by
mówiła „jaka część kursów", i nie ma ani jednego przebiegu, w którym łódka
*dochodzi* do kursu bez wiosła zamiast być na nim postawiona przez autopilota.

### I.2. Czy 60-sekundowe „trzymanie" to trwałe trzymanie? Zmierzone

Sonda (kod w K1 poniżej): TWA 70/90/110 przy TWS 6, tryb siatki z
`acceptance-manual.js` (szot 8/16/32, `crewPos` 0,3, brail 0 — **nie** optimum
polary, więc liczby nie są porównywalne z S1c punkt w punkt), wiosło wyjęte,
15 trymów `tackX` × `crewPosX`, wychylenie kursu odczytane po 60/120/300/600 s
plus nachylenie całkowitego momentu skręcającego `dM/dψ` w punkcie ustalonym:

| TWA | tryb | 60 s | 120 s | 300 s | 600 s | dM/dψ |
|---|---|---|---|---|---|---|
| 70 | tack 0,5 / crewX −0,25 | 1,3° | 1,6° | 1,6° | 1,6° | **−0,3** |
| 70 | tack 0 / crewX −1 | 9,7° | 13,2° | 15,4° | **15,6°** | **+0,3** |
| 90 | tack 1 / crewX 0 | 3,6° | 4,0° | 4,0° | 4,0° | −1,4 |
| 90 | tack 0,5 / crewX −1 | 9,1° | 10,1° | 10,2° | 10,2° | −2,0 |

Wniosek jest dwustronny i oba kierunki są ważne:

1. **Większość 60-sekundowych trzymań to naprawdę równowagi.** Wychylenie
   asymptotuje (4,0 → 4,0 → 4,0). Zarzut „okno 60 s ukrywa powolny dryf" **nie**
   potwierdza się na tych punktach — i lepiej to wiedzieć, niż zakładać.
2. **Ale nie wszystkie.** Drugi wiersz przechodzi dzisiejszy test (9,7° ≤ 15°),
   dryfuje dalej po 600 s i ma **dodatnie** `dM/dψ` — moment nie przywraca,
   tylko wzmacnia zaburzenie. Odróżnia go **wyłącznie znak nachylenia**;
   wychylenie w oknie 60 s tego nie widzi.

Czyli: nie trzeba wydłużać każdego testu do 600 s. Trzeba dodać jedną wielkość
strukturalną — znak `dM/dψ` — do predykatu trzymania. To jest dokładnie
doktryna S7 („niezmiennik zamiast pasma"), zastosowana do samego kryterium.

---

## Część II. Pozycje

### Blok A — uczynić kryterium mierzalnym (bez zmiany fizyki)

Reguła Części IV work ordera 08-02, „nie mierzyć przeciwko brakującemu
kryterium", obowiązuje tu wobec samego celu projektu: dziś kryterium nie ma
miary, więc żadna zmiana fizyki nie może zostać przeciw niemu oceniona.

#### K1. Predykat trwałego trzymania: zbieżność **i** znak `dM/dψ`

*Naprawa:* nowy helper w `harness/asserts-helpers.js` —
`holdsCourse(config, controls, state, { seconds = 300 })` — zwracający
`{ excursion, speedRatio, capsized, converged, slope }`, gdzie:
- `converged`: wychylenie w ostatniej 1/3 okna ≤ 1/3 wychylenia w pierwszej 1/3
  (i ≤ 15° łącznie) — kurs ma zbiegać, nie tylko wolno dryfować;
- `slope`: `(M(ψ+3°) − M(ψ−3°)) / 6`, `M` z `computeForces(...).M` w stanie
  ustalonym, wymagane **ujemne** (przywracające; znak ustalony w I.2 na
  zmierzonym przykładzie o obu znakach).

Przepiąć na ten predykat S1a/S1b/S1c/S2 (`harness/asserts-polar-helm.js`) oraz
C-B/C-C (`harness/asserts-deep-course.js`), zachowując dotychczasowe progi
wychylenia i prędkości — predykat ma być **węższy**, nie inny.

**Odbiór:** liczby po zmianie zaraportowane obok liczb przed zmianą, per punkt.
Jeśli któryś punkt spada (a trzeci wiersz tabeli I.2 mówi, że takie punkty
istnieją), spada z liczbą i zostaje jako `xfail` — **nie wolno** przy tej okazji
poluzować progu wychylenia ani skrócić okna. Kierunek zmiany jest z góry znany
i jest w porządku: pokrycie może spaść, bo miara robi się uczciwsza.

*Nakład: mały. Zależności: przed K2 (K2 używa tego predykatu).*

```js
// repro K1 — pomiar z I.2, uruchamiany z katalogu repo
import { createConfig } from './core/config.js';
import { integrate, computeForces } from './core/integrator.js';
import { headingHoldRudder } from './harness/polar.js';
const c = createConfig(), DEG = Math.PI/180, H0 = Math.PI/2, dt = c.dt;
const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
for (const [twa, sheetDeg, crew] of [[70,8,0.3],[90,16,0.3],[110,32,0.3]]) {
  const windDirFrom = H0 + twa*DEG;
  for (const tack of [0,0.5,1]) for (const cx of [0,-0.25,-0.5,-0.75,-1]) {
    let s = { t:0,x:0,y:0,heading:H0,u:1,v:0,r:0,phi:0,p:0,z:0,w:0,delta:sheetDeg*DEG,
      end:1,amaLoad:0,abackTimer:0,capsized:false,shunt:{phase:'none',progress:0} };
    const ctl = { windDirFrom, windSpeed:6, sheet:sheetDeg*DEG, rudder:0, rudderUp:false,
      brailLee:0, brailWind:0, crewPos:crew, crewPosX:0, tackX:0, stays:0, shuntRequest:false };
    for (let i=0;i<Math.round(45/dt);i++) { ctl.rudder = headingHoldRudder(s,H0,c); s = integrate(s,ctl,c,dt); }
    const h0 = s.heading, v0 = Math.hypot(s.u,s.v);
    ctl.rudder = 0; ctl.rudderUp = true; ctl.tackX = tack; ctl.crewPosX = cx;
    const marks = {};
    let n = 0;
    for (const T of [60,120,300,600]) {
      for (; n < Math.round(T/dt); n++) s = integrate(s,ctl,c,dt);
      marks[T] = Math.abs(norm(s.heading-h0))/DEG;
    }
    if (marks[60] > 15 || Math.hypot(s.u,s.v)/v0 < 0.5 || s.capsized) continue;
    const M = (d) => computeForces({ ...s, heading: s.heading + d*DEG }, ctl, c).M;
    console.log(`TWA${twa} tack=${tack} crewX=${cx}`,
      [60,120,300,600].map((T)=>marks[T].toFixed(1)).join(' -> '),
      'dM/dpsi=', ((M(3)-M(-3))/6).toFixed(1));
  }
}
```

#### K2. Miara pokrycia: jaka **część** kursów da się utrzymać bez wiosła

Dziś postęp rozkłada się na sześć osobnych linii pass/fail, przez co koszt S8
odczytał się jako „jeden test zdemontowany" zamiast „−2 na pokryciu". Kryterium
mówi o *każdym* kursie, więc mierzalną formą kryterium jest **jedna liczba**.

*Naprawa:* `harness/coverage-no-oar.js` — **raport, nie bramka**, dokładnie jak
`acceptance-manual.js` i z tego samego powodu (mierzy rzecz, o której nikt
jeszcze nie zdecydował, co zrobić). Dla każdego wiersza siatki
TWA 40–180 co 10 × TWS 4/6/10: wziąć szot/brail/`crewPos` z optimum polary,
przeszukać `tackX` × `crewPosX` × `stays`, i orzec K1 przy `rudderUp = true`.
Wyjście: tabela per punkt + jedna linia `N/M`. Snapshot do
`docs/coverage-no-oar-YYYY-MM-DD.txt`, obok snapshotów `acceptance-manual`.

Koszt trzeba zaplanować, nie odkryć: pomiar z I.2 szedł ~48× realtime, więc
45 punktów × 15 trymów × 645 s to ~2,5 h. Prefiltr 60 s (odrzucić trymy, które
już wtedy wyszły poza próg) i pełne 300 s tylko dla ocalałych schodzi do
~40–50 min. Dlatego **nie** wchodzi do `run_tests.js`; bramką pozostaje
dotychczasowa siatka sześciu punktów w S1c.

**Odbiór:** raport istnieje, ma snapshot, i jego liczba jest cytowana w każdym
kolejnym ADR-ze ruszającym fizykę — tak jak dziś cytuje się zmianę polary.
Oczekiwanie monotoniczności: spadek pokrycia jest dopuszczalny (S8 pokazał, że
uczciwa fizyka potrafi kosztować), ale musi być nazwany i uzasadniony w ADR.

*Nakład: średni. Zależności: po K1.*

#### K3. Uzyskiwanie kursu — czego pakiet nie mierzy w ogóle

Kryterium ma dwa człony: *uzyskać* i *utrzymać*. Cały pakiet mierzy drugi.
Każdy test startuje na kursie docelowym pod autopilotem i dopiero puszcza ster.

*Naprawa:* nowy plik `harness/asserts-course-change.js` (nowy moduł w
`runAsserts`), trzy asercje, wszystkie przy `rudderUp = true` od pierwszego
kroku:
1. **Odpadanie:** z utrzymywanego TWA 90 (tryb z K2) przestawić tryb na tryb
   trzymający TWA 140; wymagać dojścia do TWA 140 ± 10 w ≤ 180 s i utrzymania
   wg K1.
2. **Ostrzenie:** to samo w drugą stronę (TWA 140 → 90).
3. **Shunt bez wiosła:** `shuntRequest` z wiosłem wyjętym — shunt się kończy
   (`shunt.phase` wraca do `none`, `end` odwrócone) i nowy kurs jest utrzymany
   wg K1.

Wszystkie trzy **na obu wartościach `end`**. To nie jest ostrożność: ADR 0016 i
0023 to dwa osobne przypadki defektu, który przeżył, bo sprawdzano jeden koniec
łodzi — a `tackX`, którego te asercje używają najintensywniej, jest dokładnie
tą wielkością, która w ADR 0023 nie odwracała się przy shuncie.

**Odbiór:** trzy asercje istnieją i raportują liczby. Jeśli nie przechodzą —
`xfail:STEERING` z liczbami. To jest pierwszy pomiar pierwszego członu
kryterium; jego wynik jest informacją niezależnie od znaku.

*Nakład: średni. Zależności: po K1; korzysta z trymów znalezionych przez K2,
ale nie musi na nie czekać (może użyć trymów z S1c/C-C).*

### Blok B — fizyka, w kolejności oczekiwanego zwrotu

Obie pozycje są przeniesione z bloku D work ordera 08-02 (tam: S10 i S11), bez
zmiany treści, w kolejności odwrotnej do tej, w jakiej zostały spisane —
uzasadnienie w Części V tamtego dokumentu.

#### K4 (= S10). Przemierzyć macierz przechył→odpadanie pod obecną fizyką

`hull.heelClrShiftCoeff`/`heelClrSign` i `sail.yawHeelSign` są zbudowane i
trzymane na 0, bo T3 zmierzył wszystkie cztery kombinacje znaków i żadna nie
pomogła. Ten pomiar jest **sprzed** D1 (ADR 0032) i **sprzed** S8 (ADR 0033);
oba zmieniły stateczność kierunkową i opór kadłuba.

*Naprawa:* powtórzyć tę samą macierz czterech kombinacji na obecnej fizyce.

**Odbiór:** macierz zmierzona i zaraportowana **z liczbą pokrycia z K2** dla
każdej kombinacji, nie tylko z wynikami czterech asercji akceptacyjnych.
Potwierdzenie albo odwrócenie wniosku T3 — zaraportowane niezależnie od znaku.
ADR tylko wtedy, gdy któryś znak zostaje zmieniony.

*Nakład: mały (procedura istnieje). Zależności: po K2 i po K6.*

#### K5 (= S11). Płetwa boczna amy: pełna strip-integration

Najwyższe prawdopodobieństwo a priori w całym otwartym zakresie: to własna
płaszczyzna boczna amy (T4) przeniosła S1c z 3/6 na 6/6, a dziś jest w niej
pojedynczy pasek, nie wielostanowiskowa suma jak w `hullSideForce`.

*Naprawa:* rozbić `FySide` w `amaDrag` (`core/hydro.js`) na sumę po stacjach,
analogicznie do `stationWeights` w `hullSideForce`, na własnej długości amy;
CLR amy migruje wtedy z jej lokalnym dryfem tym samym mechanizmem, którym
migruje CLR kadłuba (ADR 0032).

**Odbiór:** zmiana `yawMoment` amy i pokrycia z K2 zmierzona i zaraportowana
niezależnie od kierunku. **[rusza polarę]** — pełna procedura weryfikacji jak
przy S8: marginesy wywrotki, testy sterowania, `out/polar.csv` przeliczona.

*Nakład: średni. Zależności: po K2 (bez niej nie ma czym zmierzyć zwrotu).*

### Blok C — licencja

#### K6. Rejestr parametrów: zamknięte przez źródło vs wolne w paśmie

Kryterium udziela wolności („cechy fizyczne wolno manipulować w ograniczonym
zakresie — w szczególności tam, gdzie nie są znane"), której konwencje projektu
dziś nie znają: znają „przekotwiczenie po zamierzonej zmianie" i „nie przebierać
punktu pracy", ale nie znają podziału na stałe zamknięte i wolne. Bez tego
podziału K4 wygląda jak strojenie, a nim nie jest.

*Naprawa:* jedna tabela w `docs/parameter-register.md`: dla każdej stałej z
`core/config.js` — **źródło** (podręcznik, Di Piazza, Flay, `data/*.csv`
PJOA FOLK → zamknięta) albo **pasmo** (wielkość nieznana lub znana z grubsza →
wolna, z podanym pasmem i jego uzasadnieniem fizycznym). Kandydaci do klasy
wolnej, dziś przypięci założeniem, a nie pomiarem: `hull.heelClrShiftCoeff`,
`hull.heelClrSign`, `sail.yawHeelSign` (wszystkie 0), para `heave.mass` /
`heave.dampingCoeff`, form factor amy, `hull.clrXFraction`, `hull.lead`.

**Odbiór:** każda stała ma dokładnie jedną klasę. Zmiana stałej z klasy
zamkniętej wymaga ADR-a i cytatu ze źródła; zmiana z klasy wolnej wymaga tylko
pozostania w paśmie i zaraportowania wpływu na pokrycie z K2.

*Nakład: mały. Zależności: przed K4.*

---

## Część III. Plan wdrożenia

Kolejność wynika z jednej reguły: **najpierw miara celu, potem podnoszenie
celu.** Dziś każda zmiana fizyki jest oceniana przez sześć rozproszonych
asercji, więc jej wpływ na kryterium jest niewidoczny.

1. **K6** — rejestr parametrów (dokumentacja, nic nie rusza).
2. **K1** — predykat trwałości. *Wynik: te same testy, węższy predykat,
   prawdopodobnie kilka punktów mniej — z liczbami.*
3. **K2** — pokrycie. *Wynik: pierwsza liczba, która mierzy kryterium.*
4. **K3** — uzyskiwanie kursu. *Wynik: pierwszy pomiar członu, którego pakiet
   nie miał; prawdopodobnie nowe `xfail:STEERING`.*
5. **K4** — macierz znaków, oceniona pokryciem z K2.
6. **K5** — płetwa amy. *Wynik: pierwsza w tym work orderze zmiana, która ma
   podnieść pokrycie, a nie je zmierzyć.*

### Czego nie robić

- **Nie stroić pod K2.** Pokrycie jest miarą, nie celem strojenia. Podniesienie
  go przez zmianę stałej z klasy zamkniętej (K6) nie jest postępem, tylko
  przesunięciem łodzi dalej od realnej — czyli utratą drugiej połowy kryterium.
- **Nie poluzowywać progów przy K1.** Predykat ma być węższy. Punkt, który
  wypada, jest wynikiem — tym samym, czym był S1c po S8.
- **Nie mierzyć K3 na jednym `end`.** Patrz ADR 0016 i 0023.
- **Nie brać `acceptance-manual.js` za dowód w sprawie kryterium.** Cała jego
  siatka biegnie z wiosłem w wodzie, świadomie (komentarz przy `baseControls`).

### Poza zakresem

**S9 (pitch, szósty DOF)** zostaje w bloku D work ordera 08-02 i nie wchodzi
tutaj. Jest to pozycja realizmu o dużym nakładzie i pośrednim, niepewnym
zwrocie na kryterium; sensowny moment na nią to dopiero po K2, gdy będzie czym
zmierzyć, czy zwrot faktycznie jest. To samo dotyczy przywrócenia **sterowanej**
pozycji CLR (wycofana połowa S3, ADR 0013) — pod kryterium jest to najpoważniejszy
otwarty brak strukturalny, ale wymaga własnego rozstrzygnięcia formy pasującej
do kadłuba V, a nie miecza.

---

## Część IV. ADR-y należne

| ADR | temat | pozycja |
|---|---|---|
| 0034 | kryterium sukcesu jako mierzona własność: pokrycie bez wiosła, trwałość przez znak `dM/dψ`, uzyskiwanie kursu | K1–K3 |
| 0035 | rejestr parametrów: stałe zamknięte przez źródło vs wolne w paśmie | K6 |
| — | K4 tylko jeśli któryś znak zostaje zmieniony; K5 własny ADR, bo rusza polarę | K4, K5 |

---

*Reprodukcja: blok `repro` uruchamiany z katalogu repo, nie modyfikuje jego
stanu. Liczby w Części I.1 pochodzą z pełnego `node run_tests.js` na `538eb07`;
Część I.2 z kodu w K1.*

---

## Część V. Wykonanie (2026-08-09)

Wykonano K1-K6 w kolejności z Części III. Szczegóły w ADR 0034 (K1-K3),
ADR 0035 (K6); K4 i K5 poniżej.

**K1** (`harness/asserts-helpers.js`'s `holdsCourse()`), wpięty w S1a/S1b/S1c/
S2/C-B/C-C: pokrycie spadło tam, gdzie spodziewano — S1a 2/6→1/6, S2 5/6→3/6,
C-C 1/2→0/2 (TWA140 miało dobre uśrednione tempo, ale nie zbiegało) — bez
poluzowania progów.

**K2** (`harness/coverage-no-oar.js`): działa jako raport, snapshot w
`Archive/coverage-no-oar-2026-08-09.txt`.

**K3** (`harness/asserts-course-change.js`): pierwszy pomiar „uzyskiwania"
kursu. Po drodze złapany i naprawiony błąd w samej sondzie (stały
`heading: HEADING0` niezależnie od `end` — dokładnie lekcja z ADR 0016/0023,
napotkana trzeci raz przy budowaniu testu, który miał jej pilnować; patrz
ADR 0034). Po naprawie: `end=1` odpadanie TWA70→90 trzyma się (90,1°),
ostrzenie TWA90→70 nie (83,3°, 3,3° za progiem); `end=-1` żaden kierunek nie
trzyma się w pełni; shunt z wiosłem wyjętym wywraca łódkę przy hamowaniu
brasem na obu końcach, zanim shunt zdąży się dokończyć — nowe, realne wyniki,
nie artefakt.

**K4** — macierz `heelClrSign`×`yawHeelSign` pod obecną fizyką
(`scratch/k4_heel_yaw_matrix.mjs`), oceniona kryteriami akceptacji ORAZ
pokryciem 6-punktowej siatki reachowej (metoda S1c, predykat K1):

| kombinacja | AC-1.1/1.2/4.2a/4.2b | pokrycie6 (wiosło wyjęte) |
|---|---|---|
| (0,0) bazowa | PASS/PASS/PASS/PASS | **4/6** |
| (+1,+1) | PASS/PASS/PASS/PASS | 4/6 |
| (+1,-1) | PASS/PASS/PASS/PASS | 4/6 |
| (-1,+1) | PASS/PASS/PASS/PASS | 3/6 (traci TWS6/TWA70) |
| (-1,-1) | PASS/PASS/PASS/PASS | 3/6 (traci TWS6/TWA70) |

Wniosek T3 potwierdzony, teraz wprost przeciw kryterium: żadna kombinacja nie
poprawia pokrycia ponad bazowe 4/6; `heelClrSign = -1` je pogarsza
(niezależnie od `yawHeelSign`), `heelClrSign = +1` jest neutralny.
`yawHeelSign` nie zmienia pokrycia w żadną stronę na tej siatce. **Rekomendacja:
`heelClrSign = 0`, `yawHeelSign = 0` — bez zmian.** Zgodnie z własnym
kryterium odbioru K4 (ADR tylko przy zmianie znaku) — brak nowego ADR.

Zastrzeżenie metodologiczne: werdykty AC-* (PASS/PARTIAL/FAIL) okazały się
zbyt grube, by odtworzyć czułość oryginalnego pomiaru T3 (który widział
AC-1.1 spadające 6/6→3/6 przy (+1,+1) inną metodą) — na tym pomiarze to
pokrycie6, nie werdykt AC, niosło informację.

**K5** (ADR 0036, `core/hydro.js`'s `amaDrag`): założenie S11 („pojedynczy
pasek, nie integracja wielostanowiskowa") okazało się nieaktualne — T4 już
dał amie 11-stanowiskową integrację; realną luką był brak migracji CLR,
którą D1 dał kadłubowi. Dopisana ta sama mechanika (`csLin`/`csVtx` +
rampa), bez nowej stałej strojonej. Zmierzone: polara przesuwa się o < 0,1%
w każdym punkcie; fast suite 88/88 bez regresji; **pokrycie K2: 20/45 przed
i po — ta sama liczba, inne 20 punktów** (TWA80/TWS6 zyskuje, TWA170/TWS10
traci — prawdziwy handel, ten sam kształt co D1 na kadłubie).

**K2, snapshot końcowy** (po K5, `Archive/coverage-no-oar-2026-08-09.txt`):
**20/45 (44%)**. Wzorzec: TWA80-130 (reaching) i TWA170-180 (bliski
fordewind, niska prędkość) trzymają szeroko na wszystkich trzech wiatrach;
TWA40-70 (ostro) i TWA140-160 (głęboki/szeroki) **nie trzymają nigdzie** w
tej siatce, przy żadnym z trzech wiatrów — zgodne z tym, co S1a/S2 i C-B/C-C
już pokazywały osobno.

**Podsumowanie wykonania:** K1-K6 zrobione. Kod: `harness/asserts-helpers.js`
(`holdsCourse`), `harness/asserts-polar-helm.js` i `asserts-deep-course.js`
(przepięte), `harness/asserts-course-change.js` (nowy), `harness/coverage-
no-oar.js` (nowy), `core/hydro.js` (K5). Dokumentacja: ADR 0034/0035/0036,
`docs/parameter-register.md`, `Archive/coverage-no-oar-2026-08-09.txt`,
aktualizacje `docs/README.md`/`CLAUDE.md`/`ARCHITECTURE_physics_core_EN.md`.
Pełny `node run_tests.js` (finalny, po poprawce xfail w K3 — `end=1`
bearing-away jest jedynym z sześciu kierunków/końców, który się trzyma, więc
przestał być oznaczony jako `xfail`) w trakcie; `out/polar.csv` i
`dist/simulator_standalone.html` przebudowane po tym przebiegu.
