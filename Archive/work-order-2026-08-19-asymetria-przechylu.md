# Lista poprawek — brakująca połowa pary: siła boczna kadłuba niezależna od dryfu, wywołana przechyłem

*Data: 2026-08-19*
*Wynika z rozmowy o `hull.asymmetryLiftCoeff` (ADR 0049/0050) — pytanie
właściciela „czy to prawda, że kadłub daje przyczepność dopiero w dryfie"
ujawniło, że model ma DWA różne, niezamodelowane źródła asymetrii bocznej,
nie jedno. ADR 0049/0050 zamknęły pierwsze (asymetria budowy kadłuba).
To zlecenie dotyczy drugiego: asymetrii wywołanej przechyłem.*

---

## Część I. Co jest ustalone

### Trzy różne mechanizmy, nie jeden

| źródło | zależność | co robi | status |
|---|---|---|---|
| Kształt kadłuba × dryf | `leeway` | `CS(leeway)`, hydro.js | zmierzone (Flay), zero przy zero dryfie — **poprawnie**, z symetrii lustrzanej |
| Przechył żagla | `sin(phi)·Fx` | `yawMomentHeel`, aero.js | zbudowane, `yawHeelSign=0` |
| Przechył kadłuba | `sin(phi)` | przesuwa dźwignię `CS(leeway)`, hydro.js `stationWeights` | zbudowane, `heelClrSign=0` |
| Asymetria budowy kadłuba | `end` (stała strona) | `asymmetryLiftCoeff`, hydro.js | **zbudowane i wdrożone dziś w nocy** (ADR 0049/0050) — jedyny człon dający siłę PRZY ZERO DRYFU |

**Żaden z dwóch istniejących, wyzerowanych członów heel-coupling nie robi
tego, co robi `asymmetryLiftCoeff`.** To jest sedno tego zlecenia:

- `hull.heelClrSign`/`heelClrShiftCoeff` (T3, `Archive/work-order-2026-08-
  05-sterownosc.md`) przesuwa CENTROID już-istniejącej, napędzanej dryfem
  siły bocznej (`hydro.js`'s `stationWeights`). Przy `v=0` (zero dryfu)
  KAŻDA stacja ma `vLocal=0`, więc cały człon `hullSideForce` jest zerem
  niezależnie od tego przesunięcia — **nie tworzy siły przy zero dryfie,
  tylko zmienia ramię dźwigni tej, która już istnieje**.
- `sail.yawHeelSign` (`aero.js`'s `yawMomentHeel = yawHeelSign · end ·
  CEheightEff · sin(phi) · Fx`) DZIAŁA niezależnie od dryfu (bo `Fx`
  istnieje zawsze, gdy żagiel ciągnie) — ale to MOMENT z już-istniejącej
  siły naciągu, nie nowa siła boczna, i dotyczy riggingu, nie kadłuba.

Prawdziwy, wciąż niezamodelowany mechanizm — ten, który komentarz w
`aero.js:618` nazywa brakującą połową pary rigu ("the heeled hull's own
asymmetry the model does not have") — to **kadłub, który przy przechyle,
nawet symetryczny z budowy, generuje realną siłę boczną już przy zerowym
dryfie**, bo zanurzony kształt przestaje być symetryczny burta-burta
(jedna flanka V bardziej pionowa, druga bardziej pozioma). To znany,
realny efekt w teorii projektowania jachtów (asymetryczna linia
wodnowodna przy przechyle — jedno z klasycznych źródeł "weather/lee helm
od przechyłu"), niezależny od tego, czy kadłub ma jakąkolwiek wbudowaną
asymetrię budowy.

### Co już zmierzono o istniejącej parze (T3, 2026-08-05)

Macierz czterech kombinacji znaków, przeciw ÓWCZESNEJ siatce akceptacyjnej
(`crewPos`/`crewPosX`/`tackX`/`stays` już żywe):

```
(heelClrSign,yawHeelSign)   AC-1.1   AC-1.2   AC-4.2a         AC-4.2b
(0,0)      baza              6/6      6/6    4/6 (dir 6/6)    4/6
(+1,+1)                      3/6      2/6    4/6 (dir 6/6)    4/6
(+1,-1)                      6/6      6/6    4/6 (dir 5/6)    4/6
(-1,+1)                      3/6      4/6    4/6 (dir 6/6)    4/6
(-1,-1)                      6/6      6/6    4/6 (dir 5/6)    4/6
```

ŻADNA kombinacja nie poprawia AC-4.2a/b (utyka na 4/6 — **strukturalnie**,
bo ten człon działa tylko przez napędzaną dryfem siłę boczną, a luka AC-4.2
jest gdzie indziej, niezwiązana z przechyłem — to jest wynik, który nowy
punkt startowy NIE zmieni, patrz Ryzyko). Dwie kombinacje unikające regresji
AC-1.1/1.2 są neutralne najwyżej; pozostałe dwie łamią AC-1.1/1.2 z PASS na
PARTIAL. Oba człony zostały na 0.

### Co zmieniło się od tamtego pomiaru

Macierz T3 jest sprzed ADR 0032 (migrujące CLR kadłuba), 0036 (migrujące
CLR pływaka), 0038 (pitch), 0044 (zamknięcie deficytu stateczności pasma
głębokiego), 0045 (sheetMaxDeg), 0047 (moment odchylający windage), 0049/
0050 (asymetria budowy, PJOA Slim/Fat). Model, na którym mierzono tamten
wynik, już nie istnieje w tej postaci. Dodatkowo — i to jest właściwy powód
tego zlecenia, nie nadzieja na inny wynik AC-4.2 — dzisiejsza noc pokazała,
że **człon boczny niezależny od dryfu potrafi przesunąć dynamikę pasma
głębokiego w sposób nieoczywisty i nie-monotoniczny**, mimo że sam nie niesie
momentu. `yawHeelSign` sam w sobie JEST niezależny od dryfu (dowód wyżej) —
więc jego interakcja z resztą modelu na nowym punkcie odniesienia (PJOA
Fat/Slim, z aktywnym `asymmetryLiftCoeff`) nigdy nie została zmierzona.

## Część II. Pozycje

### R1. Przesiać ISTNIEJĄCĄ, wyzerowaną parę na nowej bazie — tanie, pierwsze

**Zakres osi (R7), poprawiony po pytaniu właściciela o gęstość siatki —
pierwsza redakcja tego zlecenia dopisywała tu pasmo głębokie (150-180) z
przyzwyczajenia po ADR 0049/0050, co jest błędem kierunku, nie tylko
brakiem deklaracji.** Historyczna macierz T3 nigdy nie dotykała pasma
głębokiego: AC-1.1/1.2 testują na `TWA 50/60/70/80 × TWS 6/8`
(`harness/asserts-sail-trim.js`), AC-4.2 na `TWA 70/90/110 × TWS 6/10`
(`GRID`, `harness/acceptance-manual.js`) — obie wyłącznie w paśmie
ostrym/półwiatr. To ma fizyczne uzasadnienie, nie jest przypadkiem: przechył
w paśmie głębokim jest mały (~4°, `Archive/findings-2026-08-16-stability-
not-balance.md`), więc człon `sin(phi)` ma tam najmniej materiału do
działania. Właściwy obszar szukania efektu to TWA50-110, nie 150-180.

Ta sama macierz czterech kombinacji `(heelClrSign, yawHeelSign)`, ale:
- na CURRENT acceptance set (nie z 2026-08-05) — czyli dokładnie AC-1.1/1.2's
  i AC-4.2's WŁASNE siatki, bez zmian, plus ich TWS,
- na WSZYSTKICH czterech łodziach (`default`, `slim`, `fat` — `old`
  opcjonalnie),
- **plus jeden punkt kontrolny w paśmie głębokim** (TWA170, TWS6, oba końce,
  `probe-holds-freely.js`, ADR 0049/0050's własna sonda) — WYŁĄCZNIE jako
  sprawdzenie regresji na `slim`/`fat` (żeby włączenie tej pary nie cofnęło
  wczorajszego zysku), nie jako obszar poszukiwań.

**Oczekiwanie, jawnie:** AC-4.2 prawdopodobnie nie ruszy — powód jest
strukturalny (człon nie dociera tam, gdzie jest luka), nie zależy od punktu
odniesienia. Wart pomiaru mimo to, bo (a) to jest tani test, (b) potwierdza
lub obala założenie, zamiast je dziedziczyć, (c) interakcja z
`asymmetryLiftCoeff` na PJOA Fat/Slim jest genuinely nowa i nikt jej nie
mierzył.

Weryfikacja: tabela jak w T3 (AC-1.1/1.2/4.2a/4.2b, ich własne siatki), plus
jeden punkt regresji w paśmie głębokim, dla każdej z 4 kombinacji × 4 łodzie
= 16 wariantów.

**To jest re-anchoring (dozwolone), nie re-picking (zabronione)**: baza
fizyki zmieniła się realnie (dziewięć ADR-ów) od ostatniego pomiaru — to
jest dokładnie sytuacja, którą `docs/README.md`'s "Re-anchoring an
assertion band is normal after an intended physics change" opisuje.

### R2. Zbudować nowy człon: kadłub, przechył → siła boczna przy zero dryfu

Jeśli R1 potwierdza (spodziewane), że istniejąca para nie robi tego, co
trzeba, bo strukturalnie nie może (nie generuje siły przy zero dryfu) —
zbudować mechanizm, który to robi naprawdę, tym samym wzorcem co
`asymmetryLiftCoeff` (ADR 0049): pojedynczy, jawnie oznaczony, domyślnie
NIEAKTYWNY (0) parametr FREE-band w rejestrze.

**Forma funkcyjna — do ustalenia, nie zakładać z góry:**
- Kandydat najprostszy: `Fy_heel = heelLiftCoeff · sin(phi) · 0.5·rho_w·u·|u|·effectiveLateralArea`
  — dokładnie ta sama struktura co `asymmetryLiftCoeff`, tylko `end` →
  `sin(phi)`. Kierunek: przechył na stronę pływaka (phi>0, ama się unosi)
  powinien dawać siłę... **w którą stronę? To NIE jest oczywiste z góry i
  wymaga rozstrzygnięcia, nie zgadywania** — patrz Ryzyko.
- Czy to powinna być siła (Fy) czy moment (jak `yawHeelSign`)? Jeśli
  mechanizm to "zanurzony kształt przestaje być symetryczny", efekt
  pierwszego rzędu to zmiana ROZKŁADU bocznej powierzchni (bliżej temu, co
  `heelClrShiftCoeff` już robi — przesunięcie dźwigni), a nie nowa siła
  netto. Trzeba rozstrzygnąć, zanim się zaimplementuje, czy realny
  mechanizm w ogóle daje SIŁĘ przy zero dryfu, czy tylko zmienia
  odpowiedź NA dryf (co już jest zamodelowane i wyzerowane).

**Źródło, w przeciwieństwie do `asymmetryLiftCoeff`, może istnieć.** To nie
jest zeznanie budowniczego bez liczby — efekt "przechył zmienia zachowanie
kierunkowe przez asymetrię zanurzonego kadłuba" jest opisywany w ogólnej
literaturze projektowania jachtów (ten sam rodzaj źródła co Larsson &
Eliasson, cytowany już w projekcie dla `hull.lead`'s pasma). **Przed
zgadywaniem wielkości — sprawdzić, czy taka literatura jest w zasięgu i czy
podaje chociaż rząd wielkości albo kształt (liniowy w `sin(phi)`? w
`phi`? nasycający się?).** Jeśli nic nie ma — dopiero wtedy szacunek rzędu
wielkości, tym samym rygorem co dziś w nocy (przesiew, nie zgadywanie).

**Zakres osi (R7) — inny niż ADR 0049/0050's, celowo, z tego samego powodu
co R1.** Główna siatka przesiewu: `TWA 40/50/60/70/80/90/100/110 × TWS 6/10`
(otacza z zapasem sumę siatek AC-1.1/1.2 i AC-4.2, w paśmie gdzie przechył
jest duży, nie tam gdzie zbadano `asymmetryLiftCoeff`), oba końce.
**Osobno, obowiązkowo, jako sprawdzenie regresji, nie poszukiwań:** pełna
siatka pasma głębokiego z ADR 0049/0050 (TWA 150/155/160/162/165/168/170/
172/175/178/180, TWS6) na `slim` i `fat` — ten człon wchodzi w interakcję z
`asymmetryLiftCoeff`, który już tam jest aktywny, i musi nie cofnąć
wczorajszego zysku. Dwie różne siatki, dwa różne pytania — nie łączyć w
jedną tabelę.

Weryfikacja: identyczna procedura co ADR 0049/0050 poza samą siatką —
przesiew korytarza (na powyższej siatce) + K3 + pełny `run_tests.js` +
`out/polar.csv` diff, na obu kierunkach znaku, na wszystkich czterech
łodziach (nie wolno mierzyć go tylko na `default` — interakcja z
`asymmetryLiftCoeff` jest częścią pytania).

### R3. Zbadać interakcję z rolką (roll DOF)

Każdy człon `sin(phi)` sprzęga się z dynamiką przechyłu (`stability.js`),
którego `asymmetryLiftCoeff` (stały `end`, bez `phi`) nie dotykał wcale.
Nowy człon MOŻE zmienić charakter rolki (okres, tłumienie) albo marginesy
wywrotki — czego dzisiejsza noc nie musiała sprawdzać. Pełny zestaw
scenariuszy wywrotki (`scenarioAback`, `scenarioSquall`,
`scenarioThroughGybeAback` — już w `runAsserts`) jest tu obowiązkowy, nie
opcjonalny, i to jest właściwy powód, dla którego R2's pełna walidacja nie
może pominąć żadnego z nich.

## Część III. Kolejność

1. **R1** — tanie, może zamknąć pytanie bez nowej fizyki (mało prawdopodobne
   dla AC-4.2 z powodów strukturalnych, ale interakcja z `asymmetryLiftCoeff`
   jest nowa i nieznana).
2. Rozstrzygnięcie formy R2 (siła czy moment, kierunek, czy w ogóle
   mechanizm daje coś NOWEGO poza tym co `heelClrShiftCoeff` już robi) —
   **przed** implementacją, nie w trakcie.
3. Sprawdzenie literatury (część R2) — przed szacunkiem rzędu wielkości.
4. **R2** implementacja + przesiew, z **R3** (wywrotka) jako częścią tej
   samej walidacji, nie osobnym krokiem.

Zasada bez zmian: **zatrzymać się, gdy kryterium jest spełnione** — jeśli
R1 już coś domyka, nie budować R2 na siłę.

## Czego nie robić

- **Nie kopiować siatki TWA z ADR 0049/0050 bez namysłu.** Pierwsza redakcja
  tego zlecenia zrobiła dokładnie to (pasmo głębokie 150-180) i było to
  błędem — przechył jest tam za mały, żeby ten mechanizm miał czym
  pracować. Właściwa siatka to TWA40-110, tam gdzie AC-1.1/1.2/4.2 już
  mierzą i gdzie przechył jest z natury duży. Każdy nowy mechanizm dostaje
  siatkę dobraną do SIEBIE, nie odziedziczoną z poprzedniego zlecenia.
- **Nie zakładać, że kierunek/forma R2 jest oczywista.** Dzisiejszej nocy
  `asymmetryLiftCoeff` miał jasną analogię (camber żagla → CL≠0 przy
  zero AoA) i jasny kierunek (w stronę pływaka, bo to nawietrzna w
  normalnej żegludze). Mechanizm przechyłowy nie ma tak oczywistej analogii
  — **rozstrzygnąć fizykę przed kodem**, nie odwrotnie.
- **Nie oczekiwać, że to poprawi AC-4.2.** Już zmierzone jako strukturalnie
  nieosiągalne tym mechanizmem (T3). Jeśli R1 to potwierdzi ponownie, nie
  jest to porażka zlecenia — to jest wynik.
- **Nie łączyć R2 z `asymmetryLiftCoeff` w jeden parametr.** To są dwa
  różne, fizycznie odrębne mechanizmy (budowa vs. przechył) — osobne pola,
  osobny przesiew, tak jak tabela w Części I to rozdziela.
- **Nie pomijać scenariuszy wywrotki.** Jedyny z czterech mechanizmów w
  tabeli, który sprzęga się z `phi` bezpośrednio i nigdy nie był przeciw nim
  mierzony w tej roli.
- **Nie przyjmować domyślnej wartości nienzerowej bez pełnej walidacji na
  WSZYSTKICH czterech łodziach** — dokładnie ta sama dyscyplina co ADR
  0049/0050.

## Ryzyko

**Główne:** R1 z dużym prawdopodobieństwem powtórzy wynik z 2026-08-05 dla
AC-4.2 (strukturalny powód, nie zależy od baseline) — łatwo to pomylić z
"zlecenie nic nie znalazło". To co jest naprawdę nowe i nieznane, to
interakcja z pasmem głębokim na PJOA Fat/Slim, nie AC-4.2. Zabezpieczenie:
raportować oba wyniki osobno, nie jednym nagłówkiem.

**Drugie:** forma funkcyjna R2 jest bez dobrej analogii do oprzeć się o nią
tak, jak `asymmetryLiftCoeff` oparł się o camber żagla. Ryzyko wymyślenia
mechanizmu, który "brzmi fizycznie", ale nie odpowiada niczemu realnemu —
stąd wymóg sprawdzenia literatury PRZED kodem, nie po.

**Trzecie:** ten człon, w przeciwieństwie do `asymmetryLiftCoeff`, sprzęga
się z `phi` — a `phi` jest prawdziwym DOF-em (całkowanym, z bezwładnością),
nie stałym znakiem jak `end`. Błędny znak lub zbyt duża wartość może
destabilizować rolkę w sposób, którego przesiew jednego punktu równowagi
(jak dziś w nocy) nie złapie — stąd R3 jako wymóg, nie opcja.

## Część IV. ADR-y należne

| ADR | temat | pozycja |
|---|---|---|
| następny wolny (0051) | wynik R1 — potwierdzenie lub korekta T3 na nowej bazie | R1 |
| następny wolny (0052, jeśli R2 ruszy) | nowy człon przechył→siła boczna: źródło, forma, przesiew, decyzja o domyślnej wartości | R2, R3 |
| — | R3 to część walidacji R2, nie osobna decyzja | R3 |
