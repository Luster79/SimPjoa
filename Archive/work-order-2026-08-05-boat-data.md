# Work order — kampania danych łódki (sterowność bez wiosła)

*Data: 2026-08-05. Poprzedni work order (`work-order-2026-08-05-sterownosc.md`,
T1-T6) wyczerpał to, co model fizyczny może dostarczyć bez zgadywania
niezmierzonej geometrii amy. Ten dokument bierze tę geometrię jako zmienną
i pyta: czy realistyczna rewizja **danych łódki** (nie modelu) domyka
sterowność bez wiosła na kursach pełnych?*

## Cel

Znaleźć możliwie niewielką, fizycznie uzasadnioną zmianę w
`data/example_proa_parameters.csv` / `core/config.js`, która daje łódce
zdolność utrzymania **każdego** kursu poza martwym kątem pod wiatr, bez
użycia wiosła — bez zmiany kodu fizyki.

## Metoda: przeszukiwanie równoległe

Pojedyncza symulacja (40s settle + test) na jednym rdzeniu była zbyt wolna dla
przestrzeni parametrów × trymu × TWA × TWS wartej przeszukania. Zbudowano pool
`worker_threads` (11 workerów na maszynie 12-wątkowej) w
`scratchpad/pool.mjs` + `scratchpad/sweep_worker.mjs` (nie część dostawy —
narzędzie badawcze), z czterema trybami:

- `releaseTrial` — settle z autopilotem, puść ster, zmierz dryf po czasie.
- `holdsCourse` — przeszukanie 1D "dial" luff↔bear-away (interpolacja liniowa
  sześciu sterów trymu: tackX, crewPos, crewPosX, brailWind, stays, boomLift)
  minimalizujące |dryf|.
- `settledMoment` / `stableEquilibria` — **właściwa metoda**: zamiast mierzyć
  tempo dryfu w oknie czasowym (co miesza "osiada niedaleko" z "ucieka do
  odległego atraktora"), skanuje `M_total(TWA) = forces.M + Munk` w stanach
  osiadłych z autopilotem (ster zwolniony tylko dla odczytu momentu) i szuka
  przejść przez zero ze znakiem stabilnym (M rośnie z ujemnego do dodatniego
  gdy TWA rośnie — konwencja znaku: M>0 = łódka rounds up = TWA maleje, więc
  stabilna równowaga to ta, gdzie perturbacja W GÓRĘ TWA napotyka M>0
  ściągające z powrotem).
- `gridMomentScan` — jak wyżej, ale dla dowolnego (nie-1D) obiektu trymu, do
  przeszukania wielowymiarowego.

Błędy po drodze (poprawione przed wyciągnięciem wniosków): `pool.mjs` nie
przekazywał `mode` do workera (wszystko fałszywie trafiało w domyślny
`releaseTrial`); znak w `stableEquilibria` był odwrócony (pierwszy przebieg
zgłosił "brak równowag" praktycznie wszędzie — nieprawda).

## Mapa bazowa: dwie "wyspy" równowag

Na łódce sprzed zmian, skan `stableEquilibria` na dialu bear-away (t=1) w
zakresie TWA90-180 znajduje dokładnie dwie stabilne równowagi rozłączne
strukturalnie, nie ciągłe pasmo: jedną blisko TWA150, drugą blisko TWA169 (tuż
nad wąskim, ujemnym dołkiem w M(TWA) przy 168-169° — nie osobna wyspa
przyciągania, tylko lokalne przejście). Między nimi, TWA155-165, `M(TWA)` jest
**dodatnie w całym przedziale** przy każdym testowanym trymie — nie ma tam
zera do znalezienia, bez względu na to jak dokładnie się szuka.

## Przeszukiwanie jednoparametrowe (dane łódki)

Testowano niezależnie (w granicach fizycznie uzasadnionych — ITTC-57/Prohaska
1.1-1.4 dla `ama.formFactor`, pasmo Cp 0.55-0.62 z ADR 0022 dla
`hull.lateralArea`, itd.):

- `ama.formFactor` — poza pasmem uzasadnionym; odrzucone jako "kompensacja w
  złym parametrze" (lekcja projektu, `docs/README.md`) — dokładnie błąd
  round 7 (`formFactor=3.3`).
- `hull.massSway` (przez `HULL_LATERAL_AREA`, bo `hull.lateralArea` z
  `createConfig()` **nie** przepływa do momentu Munka — liczone w
  `buildDefaultConfig()` z lokalnej stałej) — **najskuteczniejszy** z
  testowanych lewarów, ale odrzucone jawną decyzją użytkownika: koliduje z
  ADR 0018 (regresja Clarke'a sugeruje, że współczynnik powinien być
  WYŻSZY, nie niższy — podniesienie odwróciłoby cztery reguły sterowania z
  instrukcji właściciela). Nie ruszane.
- `ama.length` + `ama.maxBuoyancy` + `ama.wettedSurface`, skalowane razem,
  liniowo (ten sam przekrój, dłuższy pływak — **nie** skalowanie objętości do
  sześcianu, to było dla całej łódki jednym współczynnikiem, ADR 0021, nie dla
  tego jednego wymiaru z osobna) — domyka TWA150 i TWA170-180.
- `ama.residuaryPeakCr` — osobno szacowany współczynnik (nie `formFactor`,
  drzwi tam zamknięte), zredukowany do 0.4x wartości kadłuba.

## Decyzja: A+B, skala ×1.40

Najmniejsza skala domykająca praktycznie (release trials z pełnym oknem
400s, nie tylko zero-crossing) TWA150 i TWA170-180: **×1.40** (×1.55 dało
identyczny wynik praktyczny — wybrano mniejszą, lepiej uzasadnioną zmianę).

| Parametr | było | jest | reguła |
|---|---|---|---|
| `ama_length_m` | 3.2 | **4.48** | ×1.40, liniowo z długością amy |
| `ama_buoyancy_kg` | 60.0 | **84.0** | ×1.40 (liniowo — przekrój ten sam, nie ×1.40³) |
| `ama.wettedSurface` | 0.5 (literał) | `0.5 * (length/3.2)` | ta sama reguła, jako formuła |
| `ama.residuaryPeakCr` | 0.006 (= kadłuba) | **0.0024** (×0.4) | osobno szacowany współczynnik |
| `crew.posMax` | derywowane z `maxBuoyancy` | przeliczone automatycznie | T6, `Archive/work-order-2026-08-05-sterownosc.md` |

`ama_mass_kg` (13 kg) **nie zmienione** — to jedyna zmierzona wartość ('pjoa.eu').
Ama nadal krótsza od 5.0 m kadłuba (4.48 m).

## Pełny run testów: dwa dalsze przekalibrowania tego samego rodzaju

`node run_tests.js` (pełny, z eksportem CSV/polar) wykrył dwie dalsze
regresje po A+B, obie tego samego rodzaju co AC-5.3 — sztywniejszy pływak
zmienia próg, nie usuwa mechanizmu:

- **R15** (`harness/asserts.js`): wąskie absolutne pasmo siły oporu amy przy
  pełnym zanurzeniu, `[4.6,5.0]` N, już raz przekalibrowane w ADR 0021.
  Zmierzone: 4.81N (przed A+B) → 5.07N (po A+B) — dłuższa, większa
  powierzchnia mokra podnosi opór bardziej niż redukcja
  `residuaryPeakCr` go kompensuje. Pasmo przesunięte na `[4.9,5.3]`, ta sama
  szerokość (0.4N). Kotwica RATIO (R7-1, sprawdzana osobno wyżej w tym samym
  bloku) nieporuszona i wciąż spełniona.
- **`scenarioThroughGybeAback`** (H2, `harness/scenarios.js`): scenariusz
  open-loop zakłada, że nieskorygowany aback w końcu zatapia amę
  (`amaLoad>1`) i wywołuje capsize przez istniejący mechanizm timera. Przy
  `tws=10` (stara wartość) większy pływak po A+B osiada na `amaLoad≈0.94` —
  pod progiem — i nigdy nie capsizuje. Zmierzono próg wprost: `tws=12` wciąż
  przeżywa (`maxAmaLoad=2.25`, ale bez 6 ciągłych sekund ponad progiem),
  `tws=13` już capsizuje. Przekalibrowano `tws: 10 → 14` — dokładnie ta sama
  wartość i ten sam wzorzec co `scenarioAback` już ma z ADR 0021 (tam też
  zmierzony próg 12-13, margines do 14).

Oba poprawione bez zmiany żadnego mechanizmu fizyki — tylko odnalezienie tego
samego fizycznego stanu (pełne zanurzenie amy) na fizycznie innej łódce.

## AC-5.3: izolacja i przekalibrowanie

Rewizja regresowała `AC-5.3` (aback detection) przy TWS=6. Izolowano
przyczynę do `ama.maxBuoyancy` konkretnie (nie do `length` czy
`residuaryPeakCr`) — sztywniejszy pływak trudniej przycisnąć w pełni pod
wodę, a `abackTimer` startuje tylko gdy `amaLoad` przekroczy 1.0 (pełne
zanurzenie). Zmierzono wprost: TWS6 nie wykrywa, TWS7 już wykrywa, TWS8
wykrywa z marginesem. Przekalibrowano `harness/acceptance-manual.js` AC-5.3
`tws: 6 → 8`, tym samym wzorem co ADR 0021 użył dla scenariusza aback
(TWS 10→14) i szczytu T6 (11.5→11.75) — odnalezienie tego samego fizycznego
stanu na zmienionej łódce, nie poluzowanie kryterium.

## TWA155-165: wynik negatywny, strukturalny

Per decyzja użytkownika ("Szukaj dalej — pełne, nie jednowymiarowe
przeszukiwanie trymu"), po A+B uruchomiono pełne przeszukiwanie grid (nie
dial 1D) sześciu sterów trymu — `tackX` × `brailWind` × `stays` × `crewPos` ×
`crewPosX` × `boomLift`, 216 kombinacji × TWS{6,10} × TWA{150,155,160,165,170,175}
= 2592 wywołań `settledMoment`, ~500s na 11 workerach
(`scratchpad/search_155_165.mjs`, `coarse_search.log` /
`closest_search.log`).

**Wynik: 0 z 216 kombinacji ma stabilne przejście przez zero w [154,166].**
Najbliższy punkt: `M=0.38` przy TWA150 (poza szczeliną, nie w niej), trym
`{tackX:0.5, brailWind:1, stays:1, crewPos:0, crewPosX:-1, boomLift:1}`.

Pierwsza (błędna) interpretacja tego samego przejścia zera przy dialu=1
sugerowała, że druga równowaga (~TWA169) "domyka" szczelinę od góry — **to
zostało samodzielnie skorygowane** po dalszym pytaniu: release trials 400s od
TWA155/160/165 zawsze osiadają z powrotem ~TWA103, nigdy nie docierając do
168-175 — basen przyciągania drugiej równowagi nie rozciąga się do 155-165.

Kształt `M(TWA)` na finalnej (domyślnej po A+B) konfiguracji, dial=max
bear-away, TWS6, krok 1° (`scratchpad/fine_shape_final.mjs`):

```
TWA145: +14.5   TWA155: +12.8   TWA165: +3.3   TWA168: +0.06
TWA150: +14.5   TWA160: +8.8    TWA166: +2.2   TWA169: -0.92
TWA152: +14.1   TWA163: +5.6    TWA167: +1.1   TWA170: +0.59
```

`M` jest **dodatnie w sposób monotoniczny** od 145° do 167°, i schodzi pod
zero tylko w wąskim dołku 168-169°, po czym znów rośnie. Nie ma tam ukrytego
zera do znalezienia żadnym trymem — kształt krzywej, nie granica
przeszukiwania, jest ograniczeniem. Żaden z 216 przetestowanych trymów
przesuwa tę krzywą wystarczająco, by dotknęła zera w 154-166; to jest
konsystentne z pojedynczym, płynnym przesunięciem całej krzywej `M(TWA)` w
funkcji trymu, bez nowego zera powstającego lokalnie w środku.

## Rekomendacja

TWA155-165 zostaje udokumentowanym, strukturalnym ograniczeniem — analogicznie
do `Archive/work-order-2026-08-05-sterownosc.md` część IV (TWA160+ przed A+B).
Jedyny zmierzony lewar, który by to ruszył (`hull.massSway`), jest jawnie
odłożony (koliduje z ADR 0018, decyzja użytkownika). Poza nim: `T1-T4` (rig +
ama trim) i A+B (dane amy) wyczerpują mechanizmy dostępne bez (a) nowego
elementu planu bocznego (miecz/płetwa, świadomie wycofane ADR 0013), albo (b)
rewizji `hull.massSway` wbrew ADR 0018.

## Konsekwencje / stan xfail

- `C-A` (dead run) i `C-C` (manual's recipe, near-dead-run) — nadal xfail,
  teraz z domykniętym TWA150 i TWA170-180; szczelina 155-165 to jedyny
  pozostały nieudokumentowany fragment kursu pełnego, i teraz jest
  udokumentowany tutaj.
- `AC-5.3` — PASS przy TWS=8 (było TWS=6).
- `hull.massSway` / ADR 0018 — nietrącone, jak zdecydowano.
