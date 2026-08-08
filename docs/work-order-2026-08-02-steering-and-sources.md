# Lista poprawek — sterowanie żaglami i zakotwiczenie w źródłach

*Last reviewed: 2026-08-09*
*Wejście: `docs/findings-2026-07-30-physics-audit.md` (wykonanie F1–F16),
`docs/capsize-margins-2026-07-30.md`, ADR 0006/0007/0008, stan repo na
`2d6211d`. Pomiary własne na tym commicie.*

Numeracja `S*` (steering/sources), nowa; nie koliduje z `R*`, `P*` ani `F*`.
Konwencja jak w poprzednich work orderach: *Naprawa:*, **Odbiór:**,
*Nakład/Zależności*, blok `repro`.

---

## Część I. Ocena wdrożenia

### Stan zastany

83/83 asercji, dwa `xfail` raportowane zamiast strojone, trzy nowe ADR-y,
`out/polar.csv` przeliczona po każdej pozycji ruszającej polarę. Wszystkie
szesnaście pozycji wykonane. Zweryfikowałem to niezależnie — pakiet przechodzi
na czystym klonie, a repro z poprzedniego work ordera odtwarzają teraz
wartości po naprawie, nie przed.

Trzy rzeczy w wykonaniu są lepsze niż to, o co prosiłem:

- **`isPhysicallyPlausible()` przestało być ścieżką wyjścia** (F2), i to jest
  sprawdzane jako niezmiennik, a nie tylko naprawione.
- **F1 nie został załatany przez zmianę interpretacji `amaLoad`** — zmieniono
  sygnaturę i przeniesiono sprzężenie załoga/wypór do F14, gdzie jest jego
  fizyczne miejsce. `restingImmersion = 0.30` okazało się być
  `ama.mass / ama.maxBuoyancy` i zostało wyprowadzone zamiast zostać literałem.
  Tego nie było w liście.
- **`configFromRecordingSnapshot()`** — walidator z F6 unieważniłby archiwalne
  nagrania, a migracja pola jest właściwą odpowiedzią zamiast rozluźnienia
  progu. Tej regresji nie przewidziałem.

### Gdzie miałem błąd

Cztery rzeczy, wszystkie wychwycone pomiarem, wszystkie przyjmuję:

1. **F7, forma `CD0 + s·CL²/k`.** Twierdziłem, że nie zachowuje kotwicy L/D.
   To było oparte na zgadniętej stałej `k`. Wyprowadzona analitycznie
   (`k = (1/(2·L/Dmax))²/CD0`) trafia w kotwicę dokładnie. **Co więcej, wasz
   kontrargument jest mocniejszy niż moja propozycja:** sama forma kwadratowa
   odtwarza zapad z F3(a) od drugiej strony, bo przy α=90 mamy CL=0, więc opór
   indukowany znika i CD wraca do CD0. Człon separacyjny jest konieczny, nie
   opcjonalny. Model kompozytowy z ADR 0007 jest poprawniejszy niż to, co
   proponowałem.
2. **F7, niedookreślenie dopasowania.** Cztery pary `(CL, CD)` Di Piazzy nie
   wiążą zakresu α<20, więc najlepsze dopasowanie potrafi wypuścić szczytowe
   L/D na 7,6 przy zgodności ze wszystkimi czterema punktami. Wprowadzenie
   `L/Dmax ≈ 5,4` jako piątego więzu jest właściwym rozwiązaniem i tego nie
   zauważyłem.
3. **F11, wielkość `Fz`.** Przewidziałem ~16 % wyporności przy 40°; zmierzone
   ~8 %. Liczyłem na żaglu sprzed bloku B, który robił mniej więcej dwa razy
   większą siłę. Mój błąd metody, nie arytmetyki.
4. **Sekcja G, marginesy wywrotki.** Twierdziłem, że blok D wymaga uprzedniego
   poszerzenia marginesów. Zamiatanie ramienia przechyłu ×1,00–1,30 pokazało,
   że są odporne. Wasze wyjaśnienie — blok B usunął moc żagla, która trzymała
   model przy tych progach — jest poprawne i sprawdzalne. **Rekalibracja i tak
   była warta przeprowadzenia**, bo znalazła defekt obserwowalności (T6
   przeskakuje survive→capsize między CEheight 2,08 a 2,10, a check A przechodzi
   po obu stronach) — ale mój argument za nią był zły.

### Gdzie wyszliście poza audyt

Dwie rzeczy, obie ważniejsze od większości pozycji z mojej listy:

- **Błąd znaku ramienia wiosła** (`+L/2` zamiast `−L/2`). Nie mogłem go
  zobaczyć czytając, bo bez członu napływu był niewidoczny — znak chował się
  w konwencji sterowania. Metoda, którą go znaleźliście (wyczerpanie kombinacji
  znaków przeciwko trzem wymaganym własnościom: kierunek skrętu, ustawianie się
  do strugi, tłumienie), jest lepsza od zgadywania i warta zapisania jako wzorzec.
- **Test skalibrowany do oczekiwanej odpowiedzi.** `Sail steers: trimming the
  sheet in points up` przechodził od rundy 10 wyłącznie dlatego, że jego punkt
  pracy był przebierany za każdym razem, gdy model się ruszył. Zmierzenie tego
  na modelu **sprzed** bloku D (weather 3 / lee 9 / capsized 4) i pokazanie, że
  teza nie trzymała się już wtedy, to najlepszy pojedynczy wynik całego
  ćwiczenia. Ta metoda — zmierz twierdzenie na siatce punktów pracy zamiast w
  jednym — powinna być zastosowana do reszty pakietu, patrz S7.

### Gdzie się nie zgadzam

Trzy rzeczy. Pierwsza jest poważna.

#### 1. Łódka nie potrafi płynąć bez wiosła w wodzie

`README.md` i nagłówek `core/rudder.js` mówią zgodnie, że normalnym stanem
spoczynkowym wiosła jest **wyjęcie z wody** („its normal resting state is
shipped (lifted clear of the water entirely), not «centered»"). Zmierzone,
TWS 6, załoga 0,35, szot z optimum polary, wiosło wyjęte (`rudderUp`), ster
puszczony:

| start | po 15 s | po 60 s | prędkość |
|---|---|---|---|
| TWA 70 | TWA 13 | TWA 40 | 3,44 → 0,43 m/s |
| TWA 90 | TWA 3 | TWA 36 | 3,94 → 0,32 m/s |
| TWA 110 | TWA 18 | TWA 39 | 3,94 → 0,46 m/s |

Z każdego kursu łódka staje w wiatr w kilkanaście sekund i prędkość zapada się
do 0,3–0,5 m/s. To nie jest myszkowanie, to niekontrolowany ostry zwrot do łopotu.

Z wiosłem **zanurzonym, ale wyzerowanym** (`rudder = 0`) łódka też stale
ostrzy: TWA 90 → 65 w ciągu 60 s, czyli **25°/min** — powyżej progu 20°/min,
którego używa istniejąca asercja C-A na fordewindzie.

Przyczyna jest w budżecie momentu. Przy ustalonym kursie, TWS 6, ster trzymany
przez autopilota:

| TWA | szot | wychylenie potrzebne | moment wiosła | moment żagla |
|---|---|---|---|---|
| 50 | 4° | 0,2° | −350 N·m | +45 N·m |
| 70 | 8° | 0,5° | −439 N·m | +78 N·m |
| 90 | 16° | 0,4° | −402 N·m | +62 N·m |
| 110 | 32° | 0,4° | −253 N·m | +33 N·m |

Wychylenie jest znikome, a moment ogromny — **cała siła wiosła pochodzi z
napływu (dryf + prędkość kątowa), nie z wychylenia.** Wiosło pracuje jako
stała, zanurzona płetwa 0,15 m² na rufie i to ono, a nie kadłub, dostarcza
stateczności kursowej. Żagiel wnosi 11–18 % momentu wiosła.

To jest ta sama patologia, którą F10 poprawnie zdiagnozował po stronie
tłumienia („stare 900 po cichu wykonywało też robotę steru"), tylko przeniesiona:
**przedtem stateczność kursowa siedziała w sztucznym `yawDamping`, teraz siedzi
w wiośle.** W obu przypadkach nie jest własnością kadłuba. F9 i F10 są każdy z
osobna poprawne; ich złożenie zostawiło model bez stateczności kursowej
własnej.

Runda 9 traktowała dokładnie ten stan jako błąd — komentarz przy `hull.lead`
mówi: *„the boat bore away off any course tighter than ~97deg TWA and **could
not point without the rudder** (which on a Pjoa is a last resort)"*. Kierunek
się odwrócił (teraz ostrzy zamiast odpadać), ale zdanie „nie utrzyma kursu bez
steru" obowiązuje znowu.

#### 2. Test, na którym skalibrowano `hull.lead`, zniknął — a wartość została

`hull.lead = 0.06 * L` została wybrana w rundzie 10d **konkretnie** przez test
„rudder-free release at the polar-optimal beam reach", z kryterium: wychylenie
≤ 15° w 60 s (zmierzone wtedy 7,2°). Tego testu nie ma już w
`harness/asserts.js` — jedyny pozostały test puszczonego steru to C-A na
TWA 178. Zmierzone dziś na półwietrze: **27,1° w 60 s**, czyli poza dawnym
kryterium.

Wartość, której jedynym uzasadnieniem był konkretny pomiar, została po usunięciu
tego pomiaru. To dokładnie ta patologia, którą sami trafnie zdiagnozowaliście w
teście trim-in — tylko zastosowana do stałej konfiguracyjnej zamiast do asercji.
Komentarz przy `lead` nadal opisuje kalibrację przeciwko testowi, który nie
istnieje.

#### 3. R15 przekotwiczony siedem razy

Każde przekotwiczenie jest osobno uzasadnione i każde faktycznie wskazało
zamierzoną zmianę — to działało. Ale wskaźnik czułości, który w jednym audycie
przesuwa się 9,70 → 10,03 → 9,58 → 9,20 → 9,46 → 8,58 → 8,47, przestał mierzyć
czułość i zaczął mierzyć historię. Pasmo „równie wąskie" wokół siódmej wartości
nie niesie już informacji o tym, czy ósma zmiana była zamierzona.
Rekomendacja w S7.

---

## Część II. Porównanie z literaturą

Pomiary poniżej są na commicie `2d6211d`, konfiguracja domyślna.

### II.1. Biegunowa żagla: zgodna. Krzywa siły napędowej: niesprawdzana i niezgodna

Sam profil 2D trafia w Di Piazzę bardzo dobrze — to zasługa bloku B:

| kotwica (Santa Cruz) | CL | CD lit. | CD model | reszta |
|---|---|---|---|---|
| L/Dmax region | 0,70 | 0,13 | 0,159 | +0,029 |
| pre-stall | 1,10 | 0,35 | 0,386 | +0,036 |
| CLmax | 1,38 | 0,75 | 0,811 | +0,061 |
| post-stall | 1,20 | 1,00 | 1,010 | +0,010 |

CLmax modelu 1,378 (lit. 1,38), szczytowe L/D 5,40 (lit. 5,38). Wszystko w
paśmie ±0,05, które sam plik źródłowy deklaruje jako niepewność digitalizacji.

**Ale `data/driving_force_vs_AWA.csv` nie jest czytany przez żaden kod.**
`grep` po repo znajduje go tylko w komentarzach. Jedyne powiązanie z Fig 4 to
jedna asercja na **stosunku prędkości** (`speed(TWA160)/speed(TWA105)` wobec
0,69), nie na siłach. To ten sam wzorzec, który F3(b) słusznie zidentyfikował
przy kolumnie CD: dane zdigitalizowane, opisane w README, i nieużywane.

Porównanie punkt po punkcie, którego nie ma w pakiecie (siła napędowa przy
optymalnym trymie, model liczony dokładnie tak, jak liczy `sailForces` —
weryfikowane krzyżowo):

| θ | CR model | CR Di Piazza | model/lit |
|---|---|---|---|
| 30 | 0,233 | 0,50 | **0,47** |
| 50 | 0,614 | 1,00 | **0,61** |
| 70 | 1,030 | 1,30 | 0,79 |
| 90 | 1,378 | 1,45 | 0,95 |
| 105 | 1,552 | 1,52 | 1,02 |
| 120 | 1,631 | 1,40 | 1,17 |
| 140 | 1,580 | 1,20 | **1,32** |
| 160 | 1,362 | 1,05 | **1,30** |

Kształt jest inny, nie tylko skala: pomiar ma **wyraźne maksimum przy 105°** i
opada po obu stronach, model ma maksimum przy 120° i utrzymuje płaskie plateau
aż do 160°. Ostro model daje połowę zmierzonej siły, na kursach pełnych o
30 % za dużo.

**Zastrzeżenie, które trzeba rozstrzygnąć przed potraktowaniem tego jako defektu
modelu.** Przy standardowej relacji `CR = CL·sinθ − CD·cosθ` **same dwa rysunki
Di Piazzy są ze sobą niezgodne**: maksimum osiągalne z czterech kotwic Fig 3
przy θ=30 wynosi ~0,25, a Fig 4 podaje 0,50 — czynnik dwa. Możliwe wyjaśnienia:
θ w Fig 4 to nie ten sam kąt co w Fig 3, „CR" to współczynnik siły
**wypadkowej** a nie napędowej (notacja Marchaja, w której `C_R` jest właśnie
wypadkową), albo powierzchnia odniesienia jest inna. Nie mam dostępu do
pełnego tekstu (JPS blokuje automatyczny dostęp), więc **tego nie rozstrzygam** —
rozstrzygnięcie jest pierwszym krokiem S4. Niezależnie od wyniku: plik jest
martwy i albo powinien coś sprawdzać, albo zniknąć.

### II.2. Sterowanie żaglem: model nie ma mechanizmu, który literatura opisuje jako główny

To jest sedno. Zmierzone ramię `xCE − CLR` przez **cały** zakres wychyłu rei:

| delta | xCE | ramię (xCE − CLR) |
|---|---|---|
| 0° | −0,058 m | 0,080 m |
| 30° | −0,024 m | 0,113 m |
| 60° | +0,067 m | 0,205 m |
| 90° | +0,192 m | 0,330 m |

Dwa wnioski:

1. **Cała modulacja od trymu to 0,25 m = 4,5 % LWL.**
2. **Ramię nigdy nie zmienia znaku.** CE jest zawsze przed CLR, na każdym
   trymie. Żagiel może modulować wielkość momentu jednego ustalonego znaku;
   nie może przejść przez zero.

To jest strukturalne wyjaśnienie `xfail:STEERING`, mocniejsze niż „teza nie
trzyma się ogólnie": **teza nie może się trzymać na dźwigni, która nie zmienia
znaku.** O tym, w którą stronę łódka skręci, decyduje to, który z członów
konkurencyjnych (załoga, sprzężenie od przechyłu, Munk, opór amy) akurat
wygra — a to jest dokładnie ta zależność od pozycji załogi, którą zmierzyliście
(crewPos 0,6 przy TWS 6 daje odpadanie na każdym TWA).

Do tego baza jest kalibrowana z dokładnością dziesięciokrotnie większą niż
modulacja, którą ma obsługiwać: runda 10d ustaliła, że znak dryfu przeskakuje
między `lead = 0,065·L` a `0,070·L`, czyli w oknie **2,7 cm**, przy 25 cm
zakresu modulacji. To definicja ostrza noża.

**Co mówi literatura.** Ożaglowanie oceanicznej lateny steruje przez
przesuwanie CE wzdłuż kadłuba, i to jest rozpoznana własność takielunku, nie
detal:

- Proafile, *Rig Options: Crab Claw*, o rozwiązaniu Munroe'a z uzdą fału,
  które eliminuje potrzebę obracania masztu: <cite index="13-1">usuwa ono część elastyczności przesuwania środka ożaglowania — zarówno wzdłużnie, jak i w pionie — którą ma tradycyjny takielunek oceaniczny</cite>. Czyli
  ruchomy CE w obu osiach jest cechą, którą projektanci świadomie tracą albo
  zachowują.
- Dierking, *Building Outrigger Sailing Canoes*: <cite index="12-1">nieskończona linka halsowa steruje piętą rei, a przy shuncie po prostu przeciąga się reję z jednego dziobu na drugi; pięta rei może ślizgać się pod nadburciem po zawietrznej stronie kadłuba</cite>. I dalej: <cite index="12-1">achtersztagi kontrolujące wzdłużne pochylenie masztu mogą być obsługiwane linką gumową, która stara się utrzymać maszt pionowo</cite>.
- Proafile, *Primer*: <cite index="15-1">żagiel stawia się zawsze z masztu osadzonego w środku kadłuba i pochylonego do przodu, tak że pięta rei znajduje się przy dziobie</cite>. Przy shuncie <cite index="16-1">dziób staje się rufą, a pochylenie masztu również zostaje odwrócone</cite>.

Czyli: hals rei wędruje wzdłuż kadłuba na długości rzędu metrów, a maszt ma
regulowane pochylenie wzdłużne. Na łodzi 5,5 m to przesuwa CE o wielkość rzędu
0,5–1,0 m — **kilkakrotnie więcej niż 0,25 m, i przez zero.**

Model nie ma ani jednego z tych mechanizmów:
- brak pochylenia masztu (`CEheight` to stała 2,0 m, brak DOF rake),
- brak wzdłużnej pozycji halsu — `sail.tackXFraction` istnieje, ale runda 7
  (D-6) **usunęła go z fizyki** i zostawiła wyłącznie do rysowania w UI,
- brak miecza/płetwy i ich pozycji — a literatura wymienia je jako standardowe
  wyposażenie: Dierking podaje <cite index="12-1">sterowanie z obu końców długim wiosłem, parą mieczy w końcach albo parą podnoszonych sterów</cite>, a
  Proafile opisuje <cite index="14-1">duży miecz boczny na śródokręciu, który można obracać wzdłużnie</cite>.

W miejsce obu końców klasycznej równowagi CE–CLR model ma jedną stałą (`lead`)
plus fenomenologiczny współczynnik przesunięcia CLR od pozycji wzdłużnej załogi.

### II.3. Tolerancja szotowania: zgodna, i warta zabezpieczenia

Dierking o oceanicznej latenie: <cite index="12-1">jest bardzo wyrozumiała dla nieprawidłowych kątów szotowania i utrzymuje moc w punkcie, w którym bardziej konwencjonalny takielunek już by przeciągnął</cite>.

Zmierzone: pasmo kąta rei utrzymujące ≥ 90 % szczytowej siły napędowej ma
szerokość **20–23°** (czyli ok. ±11°) przy AWA 50–110°. Przeszotowanie o 20°
poza optimum zostawia **66–68 %** szczytowej siły. To jest jakościowo dokładnie
to, co opisuje Dierking, i jedna z niewielu własności, w których model zgadza
się z literaturą bez kalibracji. Nic tego dziś nie pilnuje.

### II.4. Zdolność ostrzenia: optimum leży poza siatką, na krawędzi wyszukiwania

Polara zaczyna się na TWA 40. Rozszerzona w dół (TWS 6):

| TWA | prędkość | VMG |
|---|---|---|
| 35 | 2,119 | 1,736 |
| 40 | 2,400 | 1,839 |
| **45** | **2,630** | **1,859** |
| 50 | 2,823 | 1,815 |
| 55 | 2,992 | 1,716 |

Optimum VMG pod wiatr wypada na **TWA 45°**, przy 5,1 w. Wiatr pozorny wychodzi
tam **31,7°** — czyli na samej dolnej krawędzi zakresu, jaki Di Piazza w ogóle
zmierzył (30°), gdzie zmierzona siła napędowa to jedna trzecia szczytowej.

Co ważniejsze: `bestSheetAngle` wynosi **4° na całym zakresie TWA 40–55**, a
4° to **najmniejsza wartość siatki wyszukiwania** (`harness/polar.js`:
`for (let sheet = 4; sheet <= 88; sheet += 4)`). Optymalizator jest dociśnięty
do ograniczenia siatki, nie do fizyki — chciałby szotować jeszcze ciaśniej.

W modelu nic mu tego nie zabrania: `effectiveDeltaMax` przycina do [0, 90°], a
delta = 0 to „reja na maszcie". Fizycznie reja z bomem, halsem przy dziobie i
want nie schodzi do 4° od osi — a przy tak małym kącie żagiel pracowałby w
cieniu masztu, którego model nie ma.

To jest najbardziej prawdopodobna przyczyna, dla której kryterium „no meaningful
progress below ~50deg TWA" wisi jako `xfail` na 0,591. Findings przypisuje to
mianownikowi (spadek `globalMax`) i to jest prawda arytmetycznie — ale licznik
też jest za wysoki, bo model ostrzy jak nowoczesna łódź regatowa dzięki trymowi,
który na tym takielunku nie istnieje.

---

## Część III. Rekomendacje

### Blok A — stateczność kursowa (blokujące)

#### S1. Przywrócić pomiar równowagi steru i objąć nim wiosło wyjęte

Bez tego reszta bloku A nie ma kryterium odbioru.

*Naprawa:* dodać dwie asercje w miejsce usuniętej H1 — obie na półwietrze z
optimum polary, obie po 60 s od puszczenia steru: (a) wiosło **zanurzone**,
`rudder = 0`, wychylenie kursu ≤ 15° (dawne kryterium H1); (b) wiosło
**wyjęte**, `rudderUp = true`, łódka nie staje w wiatr i zachowuje ≥ 50 %
prędkości wyjściowej. Obie zmierzyć na siatce (TWA 70/90/110 × TWS 6/10),
raportując agregat — metodą, którą zastosowaliście do testu trim-in, a nie w
jednym punkcie.

**Odbiór:** obie asercje istnieją i raportują agregat. Jeśli (b) nie przechodzi
dziś — a nie przechodzi — jest otagowana `xfail:STEERING` z liczbami, nie
strojona. Komentarz przy `hull.lead` odsyła do testu, który istnieje.

*Nakład: mały. Zależności: przed S2.*

```js
// repro S1 — z katalogu repo
import { createConfig } from './core/config.js';
import { createInitialState, createDefaultControls } from './core/state.js';
import { integrate } from './core/integrator.js';
import { headingHoldRudder } from './harness/polar.js';
const c = createConfig(), D = Math.PI/180, H0 = Math.PI/2;
for (const oarUp of [false, true]) {
  for (const [twa, sh] of [[70,8],[90,16],[110,32]]) {
    let s = { ...createInitialState(c), heading:H0, u:1.0, delta:sh*D };
    const ctl = { ...createDefaultControls(), windSpeed:6, windDirFrom:H0+twa*D, sheet:sh*D, crewPos:0.35 };
    for (let i=0;i<45*240;i++) { ctl.rudder = headingHoldRudder(s,H0,c); s = integrate(s,ctl,c,1/240); }
    const twaOf = st => { let a=((ctl.windDirFrom-st.heading)/D%360+360)%360; return a>180?360-a:a; };
    const v0 = Math.hypot(s.u,s.v); ctl.rudder = 0; ctl.rudderUp = oarUp;
    for (let i=0;i<60*240;i++) s = integrate(s,ctl,c,1/240);
    console.log('oarUp',oarUp,'TWA',twa,'->',twaOf(s).toFixed(0),' v',v0.toFixed(2),'->',Math.hypot(s.u,s.v).toFixed(2));
  }
}
```

#### S2. Dać modelowi mechanizm sterowania żaglem, który ma prawdziwa proa

Największa pozycja tej listy i jedyna, która może zdjąć `xfail:STEERING` w
sposób inny niż przez przebranie punktu pracy.

*Naprawa:* wprowadzić **wzdłużną pozycję halsu / pochylenie masztu** jako
sterowanie (`controls.tackX`, −1…+1, albo równoważnie `mastRake`), i oprzeć na
niej `xCE` zamiast na stałej `hull.lead`. Docelowo:

```
xCE = xTack(controls.tackX) + halfChordEff·(...)
```

gdzie `xTack` przebiega realny zakres przesuwu piętą rei — dla kadłuba 5,5 m
rzędu ±0,4–0,6 m wokół pozycji neutralnej, czyli zakres, w którym **ramię
xCE − CLR przechodzi przez zero**. `hull.lead` przestaje być pokrętłem, a staje
się **wartością wynikową** przy `tackX = 0` — czyli tym, czym w literaturze
jest: opisem stanu równowagi, nie parametrem swobodnym.

Uwaga projektowa: przy shuncie `tackX` musi się odwracać razem z `end` (hals
wędruje na nowy dziób, pochylenie masztu się odwraca — patrz cytat z HandWiki),
inaczej po shuncie łódka dostanie odwróconą równowagę steru.

**Odbiór:** ramię `xCE − clrX` zmienia znak wewnątrz dostępnego zakresu
`tackX` przy każdym trymie z polary. Nowa asercja: przy ustalonym kursie i
szocie, przesunięcie halsu w przód powoduje odpadanie, w tył — ostrzenie, w
obu przypadkach ≥ 2°/10 s, na **agregacie** siatki punktów pracy (nie w jednym
punkcie), z podanym rozkładem weather/lee. `xfail:STEERING` przemierzone —
jeśli teza „wybranie szota ostrzy" nadal nie trzyma się większości punktów,
zostaje jako wynik, ale wtedy z żywym mechanizmem sterowania obok.

*Nakład: duży. Zależności: po S1. **[rusza polarę]** — polara powinna dostać
`tackX` do przestrzeni przeszukiwania, albo jawnie go zamrozić na 0 z
uzasadnieniem.*

```js
// repro S2 (stan przed) — dźwignia nigdy nie zmienia znaku
import { createConfig } from './core/config.js';
import { clrXPosition } from './core/hydro.js';
const c = createConfig(), D = Math.PI/180;
const hc = (c.sail.CEheight/2/2) * c.sail.ceSwingFraction, clr = clrXPosition(0,c);
for (const d of [0,30,60,90])
  console.log('delta',d,' xCE-CLR =', (clr + c.hull.lead - hc*Math.cos(d*D) - clr).toFixed(3),'m');
console.log('cała modulacja od trymu:', hc.toFixed(3),'m =',(hc/c.hull.length*100).toFixed(1),'% LWL');
```

#### S3. Miecz / płetwa boczna jako element planu bocznego

Naturalna para dla S2 i drugi koniec równowagi, którego model nie ma. Dziś CLR
to `clrXFraction = 0,05` plus fenomenologiczne przesunięcie od pozycji załogi;
`lateralArea = 1,8 m²` jest przypisana samemu kadłubowi.

*Naprawa:* rozdzielić plan boczny na kadłub + opuszczalny miecz z własną
powierzchnią i **własną, sterowalną pozycją wzdłużną**. Krzywa `CS(λ)` Flaya
dotyczy kadłuba i zostaje przy kadłubie; miecz dostaje własną, prostą
charakterystykę płata o małym wydłużeniu (ta sama forma, którą F9 zbudował dla
wiosła — jest już w repo).

**Odbiór:** `clrXPosition()` przestaje być jedynym źródłem pozycji CLR.
Zmierzone: przesunięcie miecza w przód/tył zmienia znak dryfu przy puszczonym
sterze, przy niezmienionym trymie żagla. Opór indukowany rośnie o wielkość
zgodną z dodaną powierzchnią (kontrola bilansu, nie darmowa stateczność).

*Nakład: duży. Zależności: po S2 — razem tworzą jedną parę CE/CLR i osobno nie
mają sensu. **[rusza polarę]***

### Blok B — zakotwiczenie w źródłach

#### S4. Ożywić `driving_force_vs_AWA.csv` albo go usunąć

*Naprawa:* dwa kroki, w kolejności. (a) **Rozstrzygnąć, co Fig 4 mierzy** —
sprawdzić w pełnym tekście, czy `θ` to kąt wiatru pozornego i czy `CR` to siła
napędowa czy wypadkowa; do tego czasu niezgodność między Fig 3 a Fig 4 (czynnik
2 przy θ=30) jest własnością **źródła**, nie modelu, i nie wolno pod nią
kalibrować. Zapisać wynik w nagłówku CSV, tak jak zrobiono to dla Flaya. (b)
Dodać asercję porównującą krzywą modelu z krzywą źródła — w pasmie ±0,05
zadeklarowanym przez sam plik plus jawny margines na trym.

**Odbiór:** żaden plik w `data/` nie jest bez czytelnika (weryfikowane
`grep`-em na ścieżce wykonania, jak w F3b). Jeśli model nie mieści się w paśmie
— a przy dzisiejszym odczycie nie mieści — jest to `xfail` z tabelą
model/lit per punkt, nie zmiana progu.

*Nakład: mały (b) po rozstrzygnięciu (a). Zależności: brak. Kandydat na wspólne
ADR z F3(b) — oba to kontrakt danych.*

#### S5. Zabezpieczyć tolerancję szotowania jako własność

Jedyna wielkość, w której model zgadza się z literaturą jakościowo bez
kalibracji — i nic jej nie pilnuje. Blok B mógł ją naruszyć i nikt by nie
zauważył.

*Naprawa:* asercja: pasmo kąta rei utrzymujące ≥ 90 % szczytowej siły napędowej
ma szerokość ≥ 15° przy AWA 50/70/90/110, a przeszotowanie o 20° poza optimum
zostawia ≥ 50 % szczytu. Dzisiejsze wartości (20–23° i 66–68 %) mają zapas.

**Odbiór:** asercja istnieje i cytuje Dierkinga jako źródło twierdzenia.

*Nakład: mały. Zależności: brak — zrobić od razu, jako zabezpieczenie przed
S2/S3.*

#### S6. Minimalny kąt szotowania i cień masztu

*Naprawa:* wprowadzić `sail.deltaMinDeg` — dolne ograniczenie `effectiveDeltaMax`
wynikające z geometrii takielunku (bom, want nawietrzna, hals przy dziobie), i
zmierzyć polarę ponownie. Wartość jest parametrem konstrukcyjnym, nie
pokrętłem kalibracyjnym: powinna wyjść z geometrii z `example_proa_parameters.csv`,
a nie z tego, przy czym kryterium 50° zaczyna przechodzić. Osobno rozważyć
prostą stratę CL w wąskim pasie małych delta (żagiel w cieniu masztu).

**Odbiór:** `bestSheetAngle` na kursach ostrych **nie leży na krawędzi siatki
wyszukiwania** — to jest test na to, czy ograniczenie jest fizyczne, czy
numeryczne. Optimum VMG pod wiatr i kryterium „no meaningful progress below
~50deg TWA" przemierzone i zaraportowane niezależnie od tego, czy przechodzi.

*Nakład: średni. Zależności: przed S4(b), żeby porównanie z Di Piazzą działo się
już przy fizycznym zakresie trymu. **[rusza polarę]***

### Blok C — higiena pakietu

#### S7. Zastąpić bezwzględne pasma niezmiennikami strukturalnymi — WYKONANE (audyt)

R15 przekotwiczony siedem razy, `Sail steers` przebierany trzy razy, zanim
został zmierzony jako agregat. To drugie rozwiązanie jest właściwe i powinno
być zasadą.

*Naprawa:* dla każdej asercji o wąskim bezwzględnym paśmie postawić pytanie:
czy chroni **wartość**, czy **własność**? Jeśli własność — przepisać na
niezmiennik (monotoniczność, znak, uporządkowanie, stosunek do innej wielkości
mierzonej w tym samym przebiegu). R15 („prędkość na półwietrze") jest
kandydatem numer jeden: własnością, o którą chodzi, jest „półwiatr jest
najszybszym kursem i jest szybszy od ostrego o co najmniej X", a nie „8,47–8,55
m/s". Tam, gdzie pasmo bezwzględne jest naprawdę potrzebne, zapisać w
komentarzu, ile razy było przesuwane — historia jest informacją.

**Odbiór:** żadna asercja przekotwiczona więcej niż dwa razy w audycie nie
została pozostawiona w formie bezwzględnej bez uzasadnienia w komentarzu, dlaczego
niezmiennik nie wystarcza.

*Nakład: średni. Zależności: brak.*

**Audyt (2026-08-08).** Przejrzano wszystkie 18 asercji w `harness/asserts.js`
z jawnym dwustronnym pasmem liczbowym (`grep` na `>= N && <= N`), dla każdej
policzono historię przekotwiczeń z komentarzy. Wynik: pozycja, którą S7 sam
podaje jako motywujący przykład, jest już zamknięta — i większość reszty
także, w większości przez wcześniejsze rundy, dziś dodatkowo przez pracę D1.

| asercja | przekotwiczeń | stan |
|---|---|---|
| `R15` (reach TWS10, było „8,47–8,55 m/s") | 8 | **skonwertowana** na niezmiennik (najszybszy punkt polary, bije ostry o ≥1,8×) + pasmo fizyczne (stosunek prędkość/wiatr 0,6–1,0) |
| `R15` (opór amy przy pełnym zanurzeniu) | 3 | pasmo bezwzględne zostaje, **z jawnym uzasadnieniem**: sam stosunek (sprawdzany osobno, R7-4a) jest niewrażliwy na zmianę, która przesuwa opór amy i kadłuba o ten sam czynnik |
| `stop scenario` (było „<0,5 m/s w 23s") | 1 (do niezmiennika) | **skonwertowana**: spadek do <1/3 szczytu, monotonicznie |
| T6 (szczyt podmuchu, próg TWS) | 2 (parametr scenariusza, nie pasmo) | sama asercja **nigdy nie była** wartością bezwzględną — sprawdza przesłankę niebezpieczeństwa (`maxPhi > próg×1,5`), z jawnym komentarzem: „deliberately does NOT assert which side of that edge" |
| `H3` (dryf zaparkowanego kadłuba) | 3 (dziś ADR 0032) | pasmo zostaje, **szerokie z rozmysłu** (0,2–0,9, krotność ~4,5×) i uzasadnione w komentarzu przy każdym przekotwiczeniu |
| `R7-4a` (stosunek oporu ama/kadłub) | 1 (do niezmiennika) | już stosunek, zamiatany po fizycznym zakresie `formFactor`, nie po jednej wartości |
| `C-speed` (stosunek TWA160/TWA105) | 1 (zweryfikowana, nie przesunięta) | pasmo z literatury (Di Piazza), przetrwało realną zmianę modelu bez ruszenia — dokładnie to, co niezmiennik ma robić |
| `steeringOk` (nogi trim-in/brailed) | po 1 każda | jawna dyscyplina w komentarzu: „this leg is NOT re-picked a third time" |
| CL/CLmax (kalibracja aero) | 1 | dane źródłowe (Di Piazza), nie tripwire modelu — inna kategoria |
| pozostałe (~10) | 0–1 | pasma szerokie od początku albo asercje jednorazowe (zgodność z danymi, nie czułość modelu) |

**Wniosek:** żadna asercja nie łamie kryterium odbioru. Dyscyplina, o którą
prosi S7, jest już praktykowana konsekwentnie — potwierdzone pomiarem
historii, nie założeniem. Kod nietknięty.

#### S8. Zamknąć bilans pionowy albo zamknąć pytanie

`Fz` jest liczone i wystawione w `forcesBreakdown()`, ale nie całkowane; brak
DOF heave; ramię prostujące amy po stronie przyduszonej nadal wytwarza do
~1962 N·m siły pionowej bez odpowiedzi w bilansie pionowym. README wymienia to
jako znane uproszczenie — dobrze — ale ~8 % wyporności przy 40° przechyłu to
wielkość, która wpływa na dryf i opór, nie tylko na estetykę bilansu.

*Naprawa:* albo (a) piąty stopień swobody (heave) z własnym ADR, albo (b)
quasi-statyczne domknięcie: zanurzenie z bilansu `wypór = ciężar − Fz`,
wpływające na powierzchnię zwilżoną i `lateralArea`, bez dynamiki pionowej.
(b) jest tańsze i łapie większość efektu.

**Odbiór:** `Fz` ma konsumenta w ścieżce sił, nie tylko w breakdownie. Zmiana
prędkości z tego tytułu zmierzona i zaraportowana.

*Nakład: średni (b) / duży (a). Zależności: brak.*

**WYKONANE (2026-08-09, wariant (a), ADR 0033).** Pełny 5. DOF (heave):
`z`/`w` w stanie, sztywność hydrostatyczna rygorystyczna
(`rho_w*g*A_waterplane`), masa/tłumienie strojone parą jak `I_roll` przy
rollu. Sprzężenie do `hullResistance`/`hullSideForce` przez `draftRatio`.
Zmiana prędkości zmierzona: średnio -0,36% na 42 punktach polary, od -4,25%
do +2,14% (nie jednostronnie — zależy od punktu, czy łódź się unosi czy
siada). Próg wywrotki `scenarioAback`/T10 przeniesiony 14->16 m/s (nowy
mierzony próg 14,0/14,2, był 13,4/13,6). Jeden test sterowania (`S1c`,
utrzymanie kursu samym trymem przy wiośle schowanym) spadł z 6/6 do 4/6 —
zdemontowany do `xfail:STEERING` po zlokalizowaniu przyczyny (nie zgadywanej):
z odsprzężonym `heaveZ` w izolowanym integratorze stary margines odtwarza się
dokładnie, więc to realna zmiana hydrodynamiki kadłuba, nie artefakt
przeszukiwania. Zobacz ADR 0033.

---

## Część IV. Plan wdrożenia

Kolejność wynika z dwóch reguł: **nie mierzyć przeciwko brakującemu kryterium**
i **nie kalibrować przeciwko niezweryfikowanemu źródłu.**

### Etap 0 — zabezpieczenia, przed jakąkolwiek zmianą fizyki

**S5** (tolerancja szotowania) i **S1** (pomiar równowagi steru). Oba małe, żaden
nie rusza polary, oba są kryteriami odbioru dla etapów dalszych. S1 domyka lukę,
przez którą `hull.lead` przetrwał bez uzasadnienia; S5 zabezpiecza jedyną
zgodność z literaturą, którą model dziś ma.

*Wynik etapu: dwie nowe asercje, prawdopodobnie jeden nowy `xfail:STEERING`
(wiosło wyjęte). Polara nietknięta.*

### Etap 1 — rozstrzygnięcie źródła

**S4(a)**. Wyłącznie praca ze źródłem: ustalić definicję `θ` i `CR` w Fig 4 Di
Piazzy i zapisać ją w nagłówku CSV. Bez tego S6 i S4(b) kalibrowałyby przeciwko
niejednoznaczności, a niezgodność Fig 3 / Fig 4 (czynnik 2 przy θ=30) zostałaby
po cichu wchłonięta przez model.

*Wynik: nagłówek CSV z rozstrzygnięciem, albo — jeśli rozstrzygnąć się nie da —
jawna notatka, że plik jest referencją jakościową, i decyzja S4 idzie w stronę
usunięcia zamiast asercji.*

### Etap 2 — zakres trymu

**S6** (minimalny kąt szotowania). Ruszy polarę i najprawdopodobniej ruszy
`xfail:CALIBRATION` na kursach ostrych. Robić **przed** S2, bo S2 zmienia
równowagę steru, a wtedy nie da się przypisać zmiany polary do właściwej
przyczyny.

*Wynik: `bestSheetAngle` odklejony od krawędzi siatki. Optimum VMG pod wiatr
przemierzone. Kryterium 50° zaraportowane ponownie — być może przestaje być
`xfail`, ale nie dlatego, że je ruszono.*

### Etap 3 — mechanizm sterowania (rdzeń)

**S2** (hals / pochylenie masztu), potem **S3** (miecz). Razem, w tej kolejności,
z osobnym commitem na każde i osobnym diffem polary. To jest etap, w którym
`hull.lead` przestaje być pokrętłem — i moment, w którym trzeba przemierzyć
`xfail:STEERING` uczciwie, z tym samym podejściem agregatowym, które zastosowano
przy teście trim-in.

Ryzyko do zaplanowania z góry: S2 zmienia równowagę steru na każdym kursie, więc
**wszystkie asercje kursowe** (D4-1/2/3, C-bearaway, C-A, R7-4c) trzeba
przemierzyć, a nie tylko te, które akurat spadną. Wzorzec z
`docs/capsize-margins-2026-07-30.md` — przewidzieć, które upadną, z liczbami,
przed zmianą — sprawdził się i warto go powtórzyć.

*Wynik: dźwignia CE–CLR zmieniająca znak w dostępnym zakresie sterowania.
`hull.lead` jako wartość wynikowa. Nowe asercje na kierunek sterowania halsem.*

### Etap 4 — domknięcia

**S4(b)** (asercja przeciwko krzywej Di Piazzy — dopiero teraz, przy fizycznym
zakresie trymu z etapu 2 i rozstrzygniętej definicji z etapu 1), **S7** (higiena
pasm), **S8** (bilans pionowy). Niezależne od siebie, w dowolnej kolejności.

### Czego nie robić

- **Nie stroić `hull.lead` pod S1.** Jeśli test (a) nie przechodzi przy 0,06·L,
  to jest wynik, który S2 ma usunąć strukturalnie. Kolejne szukanie wartości
  w oknie 2,7 cm powtórzy dokładnie ten problem, który audyt znalazł.
- **Nie zdejmować `xfail:STEERING` przed etapem 3.** Dziś nie ma mechanizmu,
  którym mógłby zostać zdjęty uczciwie.
- **Nie kalibrować pod Fig 4 przed etapem 1.**

### ADR-y należne

| ADR | temat | etap |
|---|---|---|
| 0009 | kontrakt danych: martwa kolumna CD (F3b) + `driving_force_vs_AWA.csv` (S4) | 1 |
| 0010 | zakres trymu: minimalny kąt szotowania i cień masztu (S6) | 2 |
| 0011 | geometria sterowania: hals/rake i plan boczny jako sterowania (S2+S3) | 3 |
| 0012 | bilans pionowy (S8) | 4 |

---

*Reprodukcja: bloki `repro` uruchamiane z katalogu repo. Żaden nie modyfikuje
stanu repo. Pomiary w Części II wykonane tym samym sposobem — pełne skrypty
w treści pozycji, do których się odnoszą.*
