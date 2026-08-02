# Lista poprawek — audyt fizyki rdzenia

*Last reviewed: 2026-07-30*
*Zakres: `core/*.js` w całości, `data/*.csv`, `out/polar.csv`. Audyt zewnętrzny,
niezależny od rund 1–11 — czytany był kod, nie historia decyzji.*

Numeracja `F*` („finding") jest nowa i nie koliduje z `R*` (punkty review) ani
`P*` (diagnostyka fizyki z 2026-07-22). Każda pozycja ma **kryterium odbioru** —
warunek sprawdzalny, nie „zrobione" — oraz blok reprodukcji, który da się
wkleić i uruchomić z katalogu repo.

Wszystkie liczby w tym dokumencie pochodzą z pomiaru na commicie audytu, nie
z rozumowania. Bloki `repro` odtwarzają je dosłownie.

---

## Uwaga na wstępie: co jest zrobione dobrze

Zanim lista wad — trzy rzeczy, które audyt potwierdził jako solidne, i których
żadna poprawka poniżej nie powinna zepsuć:

- **Kalibracja tablicy aero v2 trafia w źródło.** Szczytowe L/D wychodzi
  **5,29 przy α = 14°** wobec 5,38 zmierzonego u Di Piazzy (Fig 3, Santa Cruz).
  To nie jest zgodność przypadkowa i jest punktem odniesienia dla F5–F7.
- **ITTC-57 dla obu kadłubów oraz dopasowanie `CS(λ)` do Flaya** to właściwa
  forma nondimensjonalna, a nie współczynnik skalujący siłę w niutonach.
- **Jednostronne więzy szota** (`core/sheet.js`) — `delta` jako prawdziwy stan
  relaksujący do równowagi, szot wyłącznie jako ograniczenie górne — są
  koncepcyjnie mocniejsze niż większość modeli tej klasy.

Krytyka poniżej jest krytyką dobrego modelu.

---

## Protokół dla zmian ruszających polarę

Obowiązuje ten sam protokół, co w `docs/work-order-2026-07-22.md`: bramka CI
porównuje `out/polar.csv` bajt w bajt, pozycje oznaczone **[rusza polarę]**
z definicji wywalą ją raz. Przeglądasz diff, i jeśli jest zamierzony,
commitujesz przeliczony plik razem ze zmianą.

**Kolejność ma znaczenie w dwóch miejscach:**

- **F1 przed F4.** F1 zmienia znak oporu amy w reżimie lotu, F4 zmienia moc
  żagla na kursach pełnych. Zrobione razem dadzą diff polary, którego nie da
  się przypisać do przyczyny.
- **F8 na końcu bloku C.** F9 i F10 mierzy się przeciwko istniejącej
  bezwładności yaw; zmiana `yawInertia` najpierw unieważnia oba pomiary.

---

## A. Błędy — mały nakład, czysty zysk

### F1. Zanurzenie amy odwrócone w reżimie lotu **[rusza polarę]**

`core/hydro.js`, `amaDrag()`. Funkcja przyjmuje `amaLoad` i traktuje je jako
ułamek zanurzenia:

```js
const heelImmersion = Math.max(restingImmersion, Math.min(amaLoad, 1.3));
```

Ale `core/stability.js`, `computeAmaLoad()` zwraca wartość **bezznakową** —
`phi/phiLiftoff` dla `phi ≥ 0` i `|phi|/phiSubmerge` dla `phi < 0`. Obie
gałęzie rosną. Zmierzone przy `u = 3 m/s`:

| phi | interpretacja fizyczna | amaLoad | Fx amy |
|---|---|---|---|
| −10° | ama całkowicie zanurzona | 1,00 | −10,2 N |
| 0° | spoczynek, ama częściowo zanurzona | 0,00 | −3,1 N |
| **+12°** | **ama tuż nad wodą (`phiLiftoffDeg`)** | **1,00** | **−10,2 N** |
| +18° i więcej | ama wysoko w powietrzu | ≥ 1,50 | −13,2 N (cap 1,3) |

Lot amy daje **maksymalny** opór amy — 10–13 % oporu kadłuba (103,3 N przy
`u = 3 m/s`) w konfiguracji, w której ama nie dotyka wody. Ta sama przyczyna dotyczy `crewImmersion` w tej
samej funkcji: załoga na nawietrznej dokłada zanurzenie amie, która lata.

Runda 7 (R7-1) naprawiła *skalę* oporu amy — bluff body → ITTC-57 — i to była
poprawna diagnoza tego, co wtedy mierzono. Znak nie był wtedy przedmiotem
badania i przeszedł nietknięty.

*Naprawa:* `amaDrag()` musi dostać **`phi`, nie `amaLoad`**, i wyprowadzić
zanurzenie z niego ze znakiem: monotonicznie rosnące dla `phi < 0`, malejące do
zera dla `phi > 0` (ama wychodzi z wody), z `restingImmersion` przy `phi ≈ 0`.
`crewImmersion` musi zniknąć razem z zanurzeniem — załoga stojąca na latającej
amie nie zanurza niczego. Sygnatura zmienia się, więc `core/integrator.js`
`computeForces()` też (linia z `amaDrag(state.u, amaLoad, ...)`).

**Odbiór:** `amaDrag().Fx` jest niemalejące co do modułu na przedziale
`phi ∈ [−15°, 0°]` i nierosnące na `phi ∈ [0°, +20°]`, przy `phi ≥ phiLiftoffDeg`
nie większe niż wartość spoczynkowa przy `phi = 0`. Pasma R7-4a (udział oporu
amy 10–25 % przy zanurzeniu statycznym, 50–80 % przy maksymalnym) trzeba
przeliczyć — „maksymalne zanurzenie" oznacza teraz `phi < 0`, nie `|phi|` duże.
Nowa asercja: opór całkowity przy `phi = +14°` < opór całkowity przy `phi = 0`
dla tego samego `u`.

*Nakład: mały (sama zmiana), średni z przeliczeniem pasm. Zależności: przed F4.*

```js
// repro F1 — node --input-type=module < /dev/stdin, z katalogu repo
import { createConfig } from './core/config.js';
import { amaDrag } from './core/hydro.js';
import { computeAmaLoad } from './core/stability.js';
const c = createConfig(), D = Math.PI / 180;
for (const d of [-10, -5, 0, 6, 12, 18, 25]) {
  const L = computeAmaLoad(d * D, c);
  console.log(String(d).padStart(4), 'amaLoad', L.toFixed(3), 'Fx', amaDrag(3, L, 0, 1, c).Fx.toFixed(2));
}
```

### F2. Brak kątowego progu wywrotki po stronie przyduszonej

`core/stability.js`, `updateAback()`:

```js
const capsized = state.capsized
  || abackTimer > abackCapsizeTime
  || state.phi >= flyingCapsizeRad;
```

Warunek kątowy istnieje wyłącznie dla `phi ≥ +65°`. Symetrycznego
`phi ≤ −65°` nie ma, mimo że `rollRestoreMoment()` odwraca ramię prostujące
**po obu stronach** przy `phiCapsizeDeg = 50°`. Po stronie `phi < 0` zostaje
tylko `abackTimer > 6 s`.

Puszczone z `phi = −52°` (już za odwróceniem), zerowy wiatr, brak trymu:

```
t=1,00  phi=−56,0°   p=−9°/s    abackTimer=1,00  capsized=false
t=2,00  phi=−79,2°   p=−43°/s   abackTimer=2,00  capsized=false
t=3,00  phi=−139,8°  p=−74°/s   abackTimer=3,00  capsized=false
t=4,00  phi=−222,0°  p=−89°/s   abackTimer=4,00  capsized=false
t=5,48  phi=−359,7°  p=0°/s     abackTimer=5,47  capsized=true
```

Łódka wykonuje **pełną beczkę 360°**, przez cały czas licząc siły żagla,
kadłuba i wiosła na stanie fizycznie bez sensu, i kończy złapana przez
`isPhysicallyPlausible()` (`|phi| > 2π`) — czyli zostaje zaraportowana jako
awaria arytmetyki, mimo że całkowanie jest poprawne, a trajektoria dobrze
rozdzielona. Timer abackowy nie zdążył: guard wyprzedza go o 0,5 s.

*Naprawa:* dodać `|| state.phi <= -flyingCapsizeRad`. Timer abackowy zostaje
bez zmian — jest osobnym, wcześniejszym i słusznie wolniejszym mechanizmem
(6 s trwałego zanurzenia amy to nautyczna definicja, kąt to punkt bez powrotu);
zmiana R8-1(b) i re-audyt H2 z rundy 10d pozostają w mocy.

**Odbiór:** ten sam przebieg co powyżej ustawia `capsized = true` przy
`phi ∈ [−65°, −70°]`, nie przy −360°, i `isPhysicallyPlausible()` nie jest
wywoływane jako ścieżka wyjścia. `phi` nigdy nie przekracza 90° co do modułu w
żadnym scenariuszu z `harness/scenarios.js` ani w żadnym nagraniu z
`recordings/`.

*Nakład: mały. Zależności: brak.*

```js
// repro F2
import { createConfig } from './core/config.js';
import { createInitialState, createDefaultControls } from './core/state.js';
import { integrate } from './core/integrator.js';
const c = createConfig();
let s = { ...createInitialState(c), phi: -52 * Math.PI / 180 };
const ctl = { ...createDefaultControls(), windSpeed: 0, sheet: 0 };
for (let i = 0, t = 0; i < 240 * 12; i++, t += 1 / 240) {
  s = integrate(s, ctl, c, 1 / 240);
  if (i % 240 === 0 || s.capsized)
    console.log('t=' + t.toFixed(2), 'phi=' + (s.phi * 180 / Math.PI).toFixed(1), 'capsized=' + s.capsized);
  if (s.capsized) break;
}
```

### F3. `CD` zapada się do `CD0` dokładnie przy α = 90°; kolumna CD w CSV to martwy kod

`core/aero.js`, `sailCoefficients()`. Runtime nigdy nie czyta kolumny `CD` z
tablicy — rekonstruuje ją jako `CD0 + s·CL_table·tan(α)` (zamierzone, patrz
nagłówek `config.js`: `s` ma być pokrętłem). Ale tablica ma `CL(90°) = 0`
**dokładnie** — wymuszone przez `crossCheckAeroTableV2` — więc iloczyn
`CL·tan(α)` znika, zamiast dążyć do granicy `s·CL_gain·Kv ≈ 0,9`:

```
α = 88,0°   CL = 0,0879   CD = 1,0724
α = 89,0°   CL = 0,0440   CD = 1,0727
α = 89,9°   CL = 0,0044   CD = 1,0728
α = 90,0°   CL = 0,0000   CD = 0,0400   ← −96 % w jednym punkcie siatki
```

Żagiel ustawiony burtowo do strugi — konfiguracja **maksymalnego** oporu — ma
opór czysto pasożytniczy. Ponieważ siatka jest 2-stopniowa, `α = 90,000°` trafia
się rzadko i wpływ praktyczny jest mały, ale mechanizm jest ten sam dla całego
otoczenia i czyni `CD` niemonotonicznym na końcu zakresu.

Drugi, poważniejszy wniosek z tego samego miejsca: **kolumna `CD` w obu CSV
jest martwym kodem**, a `crossCheckAeroTable*` **waliduje** `CD(90)` w zakresie
1,0–1,4 (w plikach 1,26). Test integralności pilnuje liczby, której żadna
ścieżka wykonania nie czyta — to fałszywe poczucie pokrycia.

*Naprawa:* dwie osobne rzeczy. (a) Domknąć granicę: albo obliczyć składnik
indukowany jako `s·CL·tan(α)` z zabezpieczeniem `α → 90°` przez rozwinięcie
granicy, albo — prościej i spójnie z F7 — trzymać się formy `CD0 + s·CL²/k`,
która nie ma bieguna. (b) Zdecydować, co z kolumną `CD`: albo usunąć ją z CSV i
z cross-checków (i udokumentować, że tablica dostarcza wyłącznie `CL`), albo
zacząć ją czytać. Nie zostawiać stanu, w którym test broni martwych danych.

**Odbiór:** `CD(α)` jest niemalejące na `α ∈ [0°, 90°]` i `CD(90°) ≥ 1,0`.
Żaden test integralności nie waliduje wartości, której runtime nie czyta —
weryfikowane przez `grep` na ścieżce odczytu, nie przez inspekcję.

*Nakład: mały (a) / mały-średni (b). Zależności: (a) najlepiej razem z F7.*

```js
// repro F3
import { createConfig } from './core/config.js';
import { sailCoefficients } from './core/aero.js';
const c = createConfig(), D = Math.PI / 180;
for (const a of [80, 86, 88, 89, 89.9, 90])
  console.log(String(a).padStart(5), JSON.stringify(sailCoefficients(a * D, {}, c)));
```

---

## B. Spójność modelu żagla **[cały blok rusza polarę]**

### F4. Powierzchnia odniesienia nie zależy od braila → refowanie **dodaje** moc

`core/aero.js`, `sailForces()`:

```js
const q = 0.5 * config.rho_air * config.sail.area * aw.speed * aw.speed;
```

`config.sail.area` (12 m²) jest **stała** — `grep -n "\.area" core/*.js`
potwierdza, że żaden brail jej nie rusza. Brasowanie działa wyłącznie przez
współczynniki. W połączeniu z premią za wybrzuszenie (`brailCamberGain: 0.45`,
szczyt dokładnie w `brailTrimRange = 0.6`) daje to przy α = 20°:

| brailWind | CL | CD | L/D |
|---|---|---|---|
| 0,0 | 0,683 | 0,142 | 4,81 |
| 0,2 | 0,771 | 0,159 | 4,86 |
| 0,4 | 0,909 | 0,189 | 4,80 |
| **0,6** | **0,970** | 0,206 | **4,71** |
| 0,8 | 0,479 | 0,174 | 2,75 |
| 1,0 | 0,137 | 0,142 | 0,96 |

Ściągnięcie nawietrznego braila do 0,6 daje **+42 % siły przy praktycznie
niezmienionej sprawności**. To sterowanie, które fizycznie *refuje* żagiel —
zbiera nośnicę do rei i zmniejsza powierzchnię pracującą.

To nie jest problem teoretyczny. W `out/polar.csv` **każdy** wiersz od TWA 140
w górę ma `bestBrailWind = 0.6` — optymalizator siedzi dokładnie na szczycie
premii. Kalibracja kursów pełnych (C2, runda 10c/10d) stoi na tym efekcie.

Intencja C1 — „częściowy brail pogłębia bryzę, żagiel dalej ciągnie" — jest
poprawna i warta zachowania. Wadą jest to, że *tylko* zysk jest zamodelowany,
a koszt (mniejsza powierzchnia pracująca) nie.

*Naprawa:* wprowadzić efektywną powierzchnię `areaEff = area · f(brailWind,
brailLee)` malejącą monotonicznie, i pozwolić premii za wybrzuszenie działać
**na zmniejszonej** powierzchni. Wtedy reżim TRIM może dalej dawać wypadkowy
zysk siły napędowej na kursie pełnym (bo `CL` rośnie szybciej, niż spada
powierzchnia — to jest właśnie techniczna teza manuala, wtedy sprawdzalna), ale
nie może dawać zysku *bezwarunkowego*, w każdym reżimie i przy każdym α.
Alternatywa minimalna, jeśli osobny `areaEff` jest zbyt kosztowny: ograniczyć
`brailCamberGain` tak, by iloczyn `CL·areaEff` nie rósł — ale to zaszywa ten
sam efekt w pokrętło, zamiast go modelować.

**Odbiór:** dla ustalonego α i ustalonego wiatru pozornego **całkowita** siła
aerodynamiczna `hypot(Fx, Fy)` jest nierosnąca w `brailWind` na całym
`[0, 1]` i nierosnąca w `brailLee`. Siła *napędowa* `Fx` może rosnąć w reżimie
TRIM na kursach pełnych — i jeśli rośnie, ma to nową asercję z podanym TWA,
zamiast wynikać z braku modelu powierzchni. `out/polar.csv` przeliczona;
jeśli `bestBrailWind` na kursach pełnych nadal wynosi 0,6, findings
dokumentuje, ile z tego zostało po odjęciu powierzchni.

*Nakład: średni. Zależności: po F1, razem z F5 i F6.*

```js
// repro F4
import { createConfig } from './core/config.js';
import { sailCoefficients } from './core/aero.js';
const c = createConfig(), D = Math.PI / 180;
for (const bw of [0, 0.2, 0.4, 0.6, 0.8, 1.0]) {
  const r = sailCoefficients(20 * D, { brailLee: 0, brailWind: bw }, c);
  console.log(bw.toFixed(1), 'CL', r.CL.toFixed(3), 'CD', r.CD.toFixed(3), 'L/D', (Math.abs(r.CL) / r.CD).toFixed(2));
}
```

### F5. `camberCDf` pominięty w poprawce C-C z rundy 10d

`core/aero.js`, `sailCoefficients()`, dwie kolejne linie:

```js
const camberCLf = camberCLDelta(alphaAbsDeg, camberEff, builtinCamber);
const camberCDf = 1 + 1.0 * camberEff;
```

`camberCLDelta()` jest poprawna i dokładnie taka, jak opisuje jej własny
komentarz: liczy `CL` jako **przyrost** nad wbudowanym wybrzuszeniem tablicy v2
(`aeroV2BuiltinCamber = 0.10`), przez iloraz dwóch ewaluacji, tak że baza
tablicy skraca się algebraicznie. Linia niżej `camberCDf` używa wartości
**absolutnej** `camberEff` — czyli tej samej formy relatywnej-do-płaskiej-płyty,
którą runda 10d właśnie usunęła z `CL`.

Skutek: opór podwójnie liczy wybrzuszenie, które tablica v2 już zawiera
(`CD0 = 0.040` i `s = 0.41` są dopasowane least-squares do zmierzonych par
`(CL, CD)` **tego samego, już wybrzuszonego** żagla Santa Cruz). Zmierzony wkład
samego członu wybrzuszenia przy `brailWind = 0.6`, α = 20°: `CL × 1,670`,
`CD × 1,450`.

To asymetria, nie decyzja — komentarz C-C nie wspomina o `CD` ani nie
uzasadnia zostawienia go w starej semantyce.

*Naprawa:* to samo przekształcenie ilorazowe co dla `CL` — funkcja
`camberCDDelta(alphaAbsDeg, camberDelta, builtinCamber)` zwracająca
`(1 + k·(builtin + delta)) / (1 + k·builtin)`. Przy `camberDelta = 0` to
tożsamość dla dowolnego `builtinCamber`, dokładnie jak przy `CL`, więc domyślna
konfiguracja z `camber: 0` się nie rusza; dla v1 (`builtinCamber = 0`) redukuje
się algebraicznie do dzisiejszego wzoru, więc semantyka v1 też jest nietknięta.

**Odbiór:** przy `sail.aeroTableVersion = 'v1'` wszystkie odczyty `CD` są
bitowo identyczne z dzisiejszymi. Przy v2 i `camberDelta = 0` również. Przy v2
i `brailWind = 0.6` mnożnik `CD` jest mniejszy niż dzisiejsze 1,450, a różnica
jest podana w findings liczbowo.

*Nakład: mały. Zależności: razem z F4/F6 (wspólny diff polary).*

### F6. `camberEff` wychodzi poza zakres ważności wzoru `1 + 1,75·c`

`core/aero.js`, `camberCLFactor()`. Wzór `1 + 1.75 · camber` był — zgodnie z
własnym komentarzem — kalibrowany przeciwko płaskiej tablicy v1/Polhamus, gdzie
`camber = 0` znaczy naprawdę płaską płytę. Zakres, w którym takie liniowe
dopasowanie ma sens dla cienkiego żagla, to `c ≈ 0,05–0,15`.

Domyślnie przy `brailWind = brailTrimRange` mamy `camberEff = 0 + 0,45`, a
wewnątrz `camberCLDelta` ewaluowane jest `camberCLFactor(α, 0,10 + 0,45)`,
czyli **`c = 0,55`** — mniej więcej cztery razy poza zakresem dopasowania.
`c = 0,55` to strzałka 55 % cięciwy; to nie profil żagla, to półkole.

Osobno: `CAMBER_FADE_END_DEG` przedłużone 45° → 75° w rundzie 10d było
poprawną obserwacją (premia była nieaktywna w swoim własnym przypadku użycia),
ale rozciągnęło liniowe dopasowanie także w kąt natarcia, gdzie strumień jest
w dużej mierze oderwany.

*Naprawa:* nie jest to samo, co F4 — F4 dotyczy powierzchni, F6 samego
mnożnika. Albo (a) ograniczyć `camberEff` walidatorem do fizycznego pasma
(`validateConfig` ma już `inRange(config.sail.camber, 0, 0.20)` — `brailCamberGain`
nie ma żadnego ograniczenia i powinno wpaść pod to samo, licząc **sumę** z
`aeroV2BuiltinCamber`), albo (b) zastąpić liniowy mnożnik formą wysycającą się
przy `c ≈ 0,2`, co pozwoli zachować dzisiejszą siłę efektu przy małych `c`
i odciąć ekstrapolację.

**Odbiór:** `validateConfig` odrzuca konfigurację, w której
`sail.camber + sail.brailCamberGain + (v2 ? aeroV2BuiltinCamber : 0)`
przekracza 0,20. Komentarz przy `brailCamberGain` podaje, jaka wartość efektu
przy α = 20° z tego wychodzi, i przeciwko czemu została przeliczona.

*Nakład: mały (a) / średni (b). Zależności: razem z F4/F5.*

### F7. Opór indukowany liczony z `CL_table`, nie z pracującego `CL`

`core/aero.js`, `sailCoefficients()`:

```js
const CDbase = sail.CD0 + sail.s * CLtable * Math.tan(...);
```

`CLtable` to wartość **przed** wybrzuszeniem i przed oboma brailami. Potem `CL`
jest cięte niezależnie (`× brailWindCLFactor`, aż do 0,2; `× (1 − 0.7·brailLee)`),
a `CD` osobnymi, innymi mnożnikami (`× (1 − 0.3·brailLee)`). Składnik indukowany
nigdy nie zależy od siły nośnej, którą żagiel faktycznie generuje.

Zmierzony skutek przy `brailLee = 1`: `CL = 0,205` (tyle, co przy α ≈ 7°) przy
`CD = 0,099` (tyle, co przy α ≈ 15°). Kierunkowo obronne — zebrany, łopoczący
żagiel *jest* brudny — ale nie **wyprowadzone**: biegunowa przestaje być
biegunową, bo dwie osie są mnożone niezależnymi pokrętłami.

*Naprawa:* liczyć składnik indukowany z `CL` **po** wszystkich modyfikacjach,
w formie bez bieguna (`CD_i = s · CL²/k`, patrz F3a), a mnożniki brailowe
`CD` zredukować do tego, czym mają być — dodatkowego oporu pasożytniczego
zebranej nośnicy, jawnie i osobno od indukowanego. Wtedy „zebrany żagiel ma
gorsze L/D" wychodzi z modelu, a nie z rozjechania dwóch niezależnych cięć.

**Odbiór:** dla dowolnej kombinacji `(α, brailLee, brailWind, camber)`
zachodzi `CD ≥ CD0 + s·CL²/k` z tym samym `k`, tzn. składnik indukowany jest
funkcją wyłącznie realizowanego `CL`. `L/D` jest nierosnące w obu brailach.
Punkt kalibracyjny bez braili — szczytowe L/D 5,29 przy α = 14° — nie zmienia
się o więcej niż 2 %.

*Nakład: średni. Zależności: razem z F3(a).*

---

## C. Dynamika — brakująca fizyka pod „regresją sterowania"

Ten blok to jedna diagnoza rozbita na trzy pozycje. Teza: to, co rundy 7–10
tropiły jako regresję sterowania i co `core/integrator.js` łata guardem
dywergencji, nie jest problemem numerycznym.

### F8. Brak mas towarzyszących; bezwładność yaw ~5× za mała; brak momentu Munka

`core/integrator.js`, `derivatives()` używa jednego skalara dla surge i sway
oraz jednej bezwładności dla yaw:

```js
const m = config.hull.displacement;   // 190 kg
const I = config.hull.yawInertia;     // 0.06 * m * L^2 = 345 kg*m^2
```

Zestawienie z wartościami fizycznymi dla tego kadłuba (5,5 m, zanurzenie
~0,33 m implikowane przez `lateralArea = 1.8`):

| wielkość | użyta | fizyczna | krotność |
|---|---|---|---|
| masa sway | 190 kg | 190 + ~480 (masa towarzysząca) ≈ 670 kg | ~3,5× |
| bezwładność yaw | 345 kg·m² | 479 (pręt jednorodny) + 156 (ama 25 kg na 2,5 m) + ~1200 (towarzysząca) ≈ 1800 kg·m² | **~5×** |
| masa surge | 190 kg | 190 + 25 (`ama.mass` nie wchodzi wcale) + kilka % | ~1,15× |

Współczynnik `yawInertiaFactor = 0.06` jest **poniżej** wartości dla pręta
jednorodnego (1/12 ≈ 0,083), więc nie da się go czytać jako „smukły kadłub" —
nie ma rozkładu masy, dla którego byłby poprawny bez masy towarzyszącej,
a masa towarzysząca działa w drugą stronę.

Brakuje też **momentu Munka** (`(m_y − m_x)·u·v`) — klasycznego,
niestabilizującego momentu na ciele smukłym pod kątem natarcia. W modelu bez
mas towarzyszących nie da się go w ogóle wyrazić, bo `m_y − m_x` wynosi zero.

*Naprawa:* wprowadzić trzy osobne, konfigurowalne wielkości bezwładnościowe
(`m_x`, `m_y`, `I_z`) z domyślnymi wartościami z estymat pasowych, a nie jedną
`displacement`. Moment Munka wchodzi wtedy jako jedna linia w `derivatives()`.
`ama.mass` dodać do masy translacyjnej (albo udokumentować w CSV, dlaczego nie).

**Odbiór:** okres i tłumienie odpowiedzi kursowej na skok wiosła zmierzone
i podane w findings przed i po. `yawDampingCoeff` przeliczony pod nową
bezwładność (F10), a nie zostawiony na starej. Test hard-over z komentarza
`integrate()` — sterowanie na burcie utrzymywane 30 s — **nie** wywołuje
`isPhysicallyPlausible() === false` przy `dt = 1/240`.

*Nakład: duży. Zależności: po F9 i F10 (oba mierzy się przeciwko dzisiejszej
bezwładności; zmiana tej pierwszej unieważnia oba pomiary).*

### F9. Wiosło sterowe: brak oporu, brak przeciągnięcia, 2,2 kN przy 6 węzłach

`core/rudder.js`, `rudderForce()`. Zmierzone przy `u = 3 m/s`, pełne 35°:

```
{ Fy: 2222 N, yawMoment: 6111 N*m }
```

Trzy osobne problemy w jednej funkcji:

1. **2,2 kN z płetwy 0,4 m² przy 6 węzłach.** To 3,7× całkowita siła boczna
   żagla przy 8 m/s wiatru (zmierzone `Fy` żagla: 605 N) i 1,2 g przyspieszenia
   poprzecznego na 190 kg łodzi. Żaden człowiek nie utrzyma tego na wiośle
   — a wiosło sterowe jest właśnie tym, na czym trzyma je człowiek.
2. **Brak przeciągnięcia.** ADR 0005 wyprowadza `coeff = 2.1` z nachylenia
   krzywej nośności Helmbolda dla AR ≈ 1,5 i to jest poprawne wyprowadzenie
   *nachylenia*. Ale komentarz sam zauważa, że model „nie reprezentuje CLmax",
   i mimo to pozwala na 35° mechanicznego wychylenia. Płetwa o AR ≈ 1–2
   przeciąga się w okolicy 20–25°; ostatnie 10–15° podróży daje w rzeczywistości
   *mniej* siły i dużo więcej oporu.
3. **Zerowy opór.** Funkcja zwraca `{ Fy, yawMoment }` i nic więcej — brak
   składowej `Fx`. Sterowanie nie kosztuje ani metra prędkości, przy żadnym
   wychyleniu.

Dodatkowo `u·|u|` ignoruje kąt napływu od `v` i od `r·x_rudder`, więc wiosło nie
wnosi **żadnego** tłumienia kursowego — co jest bezpośrednim powodem, dla
którego potrzebne było sztuczne `yawDamping` (F10).

*Naprawa:* dołożyć `Fx` (indukowany + pasożytniczy, z tego samego `CL`),
wysycenie `CL` przy kącie przeciągnięcia, oraz efektywny kąt natarcia
`deflection + atan2(v + r·x_rudder, u)` zamiast samego `deflection`. Uwaga z
ADR 0005 zostaje w mocy: ergonomiczna skarga „za ostro" należy do kształtowania
wejścia w `ui/app.js`, nie tutaj — ale 2,2 kN nie jest kwestią ergonomii.

**Odbiór:** `hypot(Fy)` przy 35° i `u = 3` nie przekracza siły bocznej żagla przy
TWS 8 więcej niż 1,5×. Utrata prędkości przy skręcie 90° jest niezerowa i podana
w findings. Wiosło wnosi tłumienie kursowe — mierzone przez różnicę
`dr/dt` przy `rudder = 0` między `rudderUp = true` i `false` przy niezerowym `r`.

*Nakład: średni. Zależności: przed F8.*

### F10. `yawDampingCoeff` jako ryczałt; niespójność wymiarowa `(1 + |u|)`

`core/hydro.js`, `yawDamping()`:

```js
return -config.hull.yawDampingCoeff * r * (1 + Math.abs(u));
```

Dwie rzeczy. Po pierwsze, `1 + |u|` dodaje bezwymiarową jedynkę do prędkości
w m/s — forma nie ma interpretacji fizycznej i nie skaluje się z żadną zmianą
jednostek. Po drugie, konsekwencja: `yawDamping(r = 0.3, u = 0) = −270 N·m`,
czyli **stojąca w miejscu łódka ma pełne tłumienie kursowe**. Realnie przy
`u = 0` zostaje tylko członek poprzeczny, kwadratowy w `r`.

Ten człon jest zryczałtowanym zamiennikiem tłumienia, które powinno wychodzić
z napływu na kadłub i wiosło (F9) oraz z brakującej bezwładności (F8). Sam
komentarz nazywa go „tunable".

*Naprawa:* rozłożyć na formę maneuvering-standard: człon liniowy `N_r · u · r`
(zależny od prędkości, znikający przy `u = 0`) plus człon poprzeczny
`N_r|r| · r·|r|` (działający też na stojącej łodzi). Po F9 część dzisiejszej
wartości 900 będzie już pokryta przez wiosło i trzeba ją odjąć, nie zostawić.

**Odbiór:** `yawDamping(r, 0) → 0` w części liniowej. Tłumienie całkowite
(hydro + wiosło + masy towarzyszące) daje ten sam okres odpowiedzi kursowej co
dziś ±20 %, przy udokumentowanym rozbiciu na składniki.

*Nakład: średni. Zależności: przed F8, po F9.*

---

## D. Przechył i stabilność

### F11. `cos φ` na `Fx` i `Fy`; brak drugiego `cos φ` i brak składowej pionowej

`core/aero.js`, `sailForces()`:

```js
const cosPhi = Math.cos(phi);
Fx *= cosPhi; Fy *= cosPhi;
```

Zmierzone (TWS 8, `delta = 45°`): `Fx`, `Fy` i `heelMoment` skalują się
**identycznie** jak `cos φ`:

| phi | Fx/Fx(0) | heelMoment/M(0) | cos φ | cos²φ |
|---|---|---|---|---|
| 20° | 0,940 | 0,940 | 0,940 | 0,883 |
| 30° | 0,866 | 0,866 | 0,866 | 0,750 |
| 40° | 0,766 | 0,766 | 0,766 | **0,587** |
| 50° | 0,643 | 0,643 | 0,643 | 0,413 |

Poprawne rozdzielenie ma trzy składniki, model ma jeden:

- rzut wiatru pozornego na płaszczyznę ożaglowania → `cos φ` na siłę w
  płaszczyźnie żagla — **jest, poprawnie**;
- pochylenie wektora siły wraz z maszem → **drugie `cos φ` na poziomą siłę
  boczną** — **brak**;
- składowa **pionowa** `F⊥ · sin φ` — **nie istnieje wcale**.

Skutki liczbowe przy `phi = 40°`: obciążenie boczne kadłuba zawyżone o
1/cos 40° = **30 %** (a to ono napędza dryf, opór indukowany i ostrość na
wiatr), oraz pomijane ~300 N siły pionowej, czyli **16 % wyporności**,
wciskanej w wodę.

Struktura kodu wymusza wybór: `heelMoment` jest wyprowadzany z `Fy`, więc nie
da się mieć `Fy ∝ cos²φ` i `heelMoment ∝ cos φ` jednocześnie, dopóki jedno
jest liczone z drugiego. Dziś poprawny jest moment, a błędna siła boczna.

*Naprawa:* rozdzielić: liczyć `F⊥` (siłę w płaszczyźnie ożaglowania, `∝ cos φ`)
jako wielkość pośrednią, a z niej wyprowadzić osobno `Fy = F⊥·cos φ`,
`Fz = F⊥·sin φ` i `heelMoment = F⊥·ramię`. `Fz` można na pierwszym etapie
tylko wyeksponować w `forcesBreakdown()` bez podłączania do dynamiki (brak
stopnia swobody heave, F13) — ale wtedy jawnie, jako znany, zmierzony brak
domknięcia, a nie przez nieobecność w kodzie.

Powiązane: `sail.verticalLiftFraction` jest dziś pokrętłem bez kosztu —
zmniejsza ramię przechylające, nie ruszając ani `Fx`/`Fy`, ani oporu, ani
bilansu pionowego. Nośność wirowa krawędzi natarcia, którą ma reprezentować,
ma koszt w oporze indukowanym i odciąża wypór. Domyślne 0 znaczy, że dziś to
nie boli — ale mechanizm w tej formie nie jest gotowy do włączenia.

**Odbiór:** `Fy(phi)/Fy(0) → cos²φ`, `heelMoment(phi)/M(0) → cos φ` (przy
ustalonym α), oba weryfikowane sondą. `forcesBreakdown().sail` zawiera `Fz`.
Pasma akceptacyjne wywrotki (T6, T10, aback) przeliczone — patrz ostrzeżenie
w sekcji G.

*Nakład: średni; przeliczenie pasm wywrotki: duży. Zależności: przed F12.*

### F12. Ramię przechylające bez głębokości CLR; brak momentu przechyłu od kadłuba i wiosła

`core/aero.js`: `heelMoment = Fy · config.sail.CEheight · (...)`.
`core/integrator.js`: `Mroll = Msail + Mrestore + Mcrew + Mdamp`.

Siła boczna żagla i hydrodynamiczna reakcja kadłuba tworzą **parę**, więc ramię
przechylające to `h_CE + głębokość CLR`, nie samo `h_CE`. Przy CE na 2,0 m i
CLR ~0,3–0,5 m pod wodą moment przechylający jest zaniżony o **15–25 %**.

To samo widziane z drugiej strony: w bilansie momentu przechyłu **nie ma
żadnego wkładu od siły bocznej kadłuba ani od wiosła** — `side.Fy` i
`rudder.Fy` wchodzą do `Fy` i do momentu kursowego, ale nie do `Mroll`. Wiosło
sterowe przy 2,2 kN (F9) przyłożone poniżej wodnicy to nie jest wkład
pomijalny.

*Naprawa:* wprowadzić `hull.clrDepth` (nowy parametr, estymata pasowa jak
`lateralArea`) i liczyć moment przechyłu żagla na `CEheight + clrDepth`.
Alternatywnie — bardziej wprost — dodać momenty przechyłu od `side.Fy` i
`rudder.Fy` na ich własnych głębokościach i zostawić ramię żagla na `CEheight`;
oba podejścia dają tę samą parę, drugie jest jawniejsze i lepiej współpracuje
z F9.

**Odbiór:** przy ustalonym trymie moment przechylający jest o 15–25 % większy
niż dziś, w kierunku zgodnym z parą sił, i wynika z jednego jawnego parametru
głębokości, nie z korekty w mnożniku. `phiLiftoffDeg`/`phiSubmergeDeg` i pasma
wywrotki przeliczone.

*Nakład: średni. Zależności: po F11.*

### F13. Brak stopnia swobody heave; ramię amy bez `cos φ`

`core/stability.js`, `rollRestoreMoment()`. Po stronie przyduszonej moment
prostujący dochodzi do **1962 N·m** = pełne 785 N wyporu amy × 2,5 m. Te 785 N
siły w górę pojawia się bez odpowiadającego zanurzenia platformy — nie ma
bilansu sił pionowych ani stopnia swobody heave, więc sztywność po tej stronie
jest zawyżona: realnie część dodanego wyporu amy jest pochłaniana przez
wynurzenie kadłuba.

Osobno, mniejsze: ramię amy to stałe `ama.spacing`, bez `cos φ`, podczas gdy
`crewRollMoment()` **ma** `Math.cos(phi)` i ma go słusznie. Przy 50° to 36 %
ramienia i wewnętrzna niespójność między dwoma członami tego samego bilansu.

*Naprawa:* `cos φ` na ramieniu amy to jedna linia i domyka niespójność —
zrobić to od razu. Heave to osobna, duża decyzja (5. stopień swobody);
minimum akceptowalne bez niego: udokumentować w `docs/` jako znane
niedomknięcie bilansu pionowego wraz z F11 (`Fz`), zamiast pozostawiać je
niewidocznym.

**Odbiór:** ramię amy skaluje się `cos φ` po obu stronach, tak jak ramię
załogi. Sekcja „Known simplifications" w `README.md` wymienia brak bilansu
pionowego (heave + `Fz` żagla) jako pozycję jawną, z konsekwencją.

*Nakład: mały (`cos φ`) / duży (heave). Zależności: brak.*

### F14. Balast załogi poza fizyczną osiągalnością

`core/config.js`: `crew.mass = 90`, `crew.posMax = 1.0`,
`ama.maxBuoyancy = 80` (kg), `ama.mass = 25`.

`crewPos = 1.0` oznacza 90 kg stojące 2,5 m na zewnątrz, **na 25-kilogramowej
amie o wyporze 80 kg**. Realnie ama tonie: masa załogi przekracza jej cały
wypór. Model karze tę konfigurację przez `ama.crewImmersionCoeff = 0.30`, co
daje przyrost zanurzenia 0,3375 — około **1/3** kary fizycznej.

Komentarz przy `crewImmersionCoeff` sam podaje, skąd wzięła się wartość:
podniesiono ją z 0,21 na 0,30, żeby punkt polary TWA = 40 nie przekroczył progu
akceptacji (0,338 wobec limitu 0,35). To jest pokrętło dopasowane do progu
testu, nie do wyporu amy — i to ono czyni `crewPos = 1.0` atrakcyjnym dla
optymalizatora polary.

*Naprawa:* wyprowadzić zanurzenie od załogi z rzeczywistego bilansu
`crewPos · crew.mass` vs `ama.maxBuoyancy`, z wysyceniem przy pełnym zanurzeniu,
zamiast liniowego współczynnika. Osobno: `crew.posMax = 1.0` należy albo
ograniczyć do fizycznie dostępnej pozycji (platforma, nie czubek amy), albo
zostawić i pozwolić modelowi ukarać ją poprawnie. Nie oba naraz.

**Odbiór:** przy `crewPos = 1.0` ama jest w modelu w pełni zanurzona (albo
`crew.posMax` jest zmniejszone tak, że taka pozycja nie jest osiągalna).
`out/polar.csv` przeliczona; jeśli optimum na ostrym kursie zeszło z
`crewPos = 1.0`, findings podaje nową wartość i koszt w prędkości. Próg 0,35
z acceptance criteria jest **niezmieniony** — jeśli teraz nie przechodzi, to
jest wynik do zaraportowania, nie do skalibrowania.

*Nakład: mały (model) / średni (przeliczenie polary i progu).
Zależności: po F1 (oba ruszają opór amy).*

---

## E. Aerodynamika pozostała

### F15. Zerowa windage; siły żagla dokładnie 0 przez 8,4 s shuntu

`grep -rn "rho_air" core/` zwraca **dwa** trafienia: definicję w `config.js` i
jedno użycie w `q` żagla. W całym rdzeniu nie ma oporu aerodynamicznego
kadłuba, załogi, masztu ani rei.

Konsekwencje w dwóch miejscach:

- **Zwinięty żagiel** ma `CD0 × 12 m²` = efektywnie 0,48 m² powierzchni oporu
  (`furl` w `sailCoefficients()`). Dla zwiniętego kleszcza plus maszt plus
  stojąca załoga to o rząd wielkości za mało.
- **Shunt.** `shuntForceFade()` zwraca **dokładnie 0** dla faz `transfer` i
  `swap`, czyli przez `transferDuration + swapDuration = 8,4 s` z 16,4-sekundowej
  sekwencji, przy `speedLockout = 2.6 m/s`. Łódka
  stoi burtą do wiatru z łopoczącym żaglem i nie odczuwa **żadnej** siły
  aerodynamicznej. Czyli najniebezpieczniejszy moment manewru jest w modelu
  bezpieczny z definicji: nie da się zostać przewróconym ani zdmuchniętym w tył
  podczas shuntu.

Zerowanie sił jest zamierzone i dla *nośnej* żagla poprawne (nośnica jest
przenoszona, nie pracuje). Nie jest poprawne dla oporu.

*Naprawa:* dodać jeden człon windage — `0.5 · rho_air · A_windage · CD_windage ·
|aw|²` przyłożony w kierunku wiatru pozornego, z `A_windage` jako nowym
parametrem konfiguracyjnym. `shuntForceFade()` fade'uje wtedy tylko nośną,
a windage zostaje przez cały manewr. Sekcja „Known simplifications" wymienia
dziś brak fal, ale nie brak windage.

**Odbiór:** siła aerodynamiczna podczas fazy `transfer` jest niezerowa i
skierowana z wiatrem. Prędkość osiągalna na ostrym kursie przy TWS 10 spada
(windage jest tam największa) — o ile, podane w findings. Scenariusz shuntu
z `harness/scenarios.js` przechodzi lub jest przetagowany z diagnozą.

*Nakład: średni. Zależności: brak.*

### F16. Nieciągłość równowagi rei na fordewindzie

`core/sheet.js`, `deltaAlign()` + `clamp(align, 0, deltaMax)`. Przy szocie 60°:

```
AWA = −0,5°   →   deltaAlign = 179,5°   →   delta_eq = 60°   (pełne wybranie)
AWA = +0,5°   →   deltaAlign = −179,5°  →   delta_eq =  0°   (reja na maszt)
```

Próg jest dokładnie na `AWA = 0`, bez strefy martwej i bez histerezy. Przy
`yardSwingRateDegPerSec = 90` reja wali do masztu w 0,67 s. Fizycznie
jednostronny szot faktycznie tak się zachowa — nagłówek `sheet.js` wyprowadza
te trzy reżimy poprawnie i to jest dobra robota — ale próg na ostrzu noża
oznacza, że każde myszkowanie wokół czystego fordewindu przerzuca sterowanie
tam i z powrotem.

To, moim zdaniem, prawdziwa przyczyna „kosmetycznego jittera `bestSheetAngle`",
który `README.md` opisuje jako płaskie optimum przy TWA 160. W `out/polar.csv`
przy TWS 6: TWA 150 → 68°, **TWA 160 → 16°**, TWA 170 → 44°. Skok 68 → 16 → 44
nie jest szumem płaskiego optimum, to multimodalność wokół nieciągłości.

*Naprawa:* dwie części. (a) Zdiagnozować jitter przeciwko tej hipotezie —
przebieg 400 s przy TWA 160 z dwóch różnych warunków początkowych szota; jeśli
osiada w dwóch różnych miejscach, to nie jest optimum płaskie. (b) Jeśli
potwierdzone, wprowadzić histerezę na przejściu reżim a ↔ reżim c (reja
przechodzi na maszt przy jednym kącie, wraca przy innym) — co jest zresztą
fizyczne: żagiel wypełniony ma bezwładność, której żagiel przy maszcie nie ma.

**Odbiór:** przebieg TWA 160 z dwóch warunków początkowych daje tę samą
prędkość ±0,05 m/s i ten sam `bestSheetAngle`. Komentarz przy pozycji jittera
w `README.md` opisuje stan potwierdzony pomiarem, albo pozycja znika.

*Nakład: mały (a) / średni (b). Zależności: po P2 z work-order 2026-07-22,
jeśli ta pozycja jest jeszcze otwarta — bramka `settled` zaburza ten pomiar.*

---

## F. Drobne

Pozycje bez własnego kryterium odbioru — do zebrania w jeden commit
porządkowy.

- **Komentarze w `config.js` rozjechane z CSV.** `hull.beam` — komentarz
  `// 0.55 m`, w CSV `0.45`. `hull.displacement` — komentarz `// 250 kg`, w CSV
  `190.0`. Wyprowadzenie `I_roll` w komentarzu liczy `250 * 1.0^2 = 250`. „Slender
  L/B = 10:1 hull" powtarzane w `hydro.js` i `config.js` to faktycznie 12:1.
  Komentarze są tu główną dokumentacją modelu, więc to nie jest kosmetyka.
- **`CL(α = 0) = 0` dokładnie**, bo wszystkie mnożniki wybrzuszenia są
  multiplikatywne. Żagiel z wybrzuszeniem ma ujemny kąt zerowej nośności.
  Nagłówek `data/dipiazza_2014_digitized.csv` mówi wprost: *„alpha measured from
  ZERO-LIFT incidence"* — a model liczy α geometrycznie od cięciwy. To
  systematyczne przesunięcie kąta o kilka stopni w całej tablicy v2, do
  udokumentowania albo do skorygowania offsetem.
- **`Math.sign()` w `hullResistance()` i `hullSideForce()`** wprowadza
  nieciągłości C0 dokładnie tam, gdzie RK4 gubi rząd zbieżności (przejścia
  `u = 0` i `v = 0`, czyli każdy shunt). Forma `v·|v|` jest gładsza i
  równoważna.
- **`leewayRaw = Math.atan2(v, Math.abs(u) + 0.05)`** używa `|u|` — po shuncie
  łódka ma `u < 0` (poprawnie, `shunt.js` odwraca `u` i `v`) i dryf liczy się
  jakby płynęła dziobem naprzód. Krzywa `CS` dla kadłuba V idącego rufą nie
  jest tą samą krzywą.
- **`outboardRelief = 1 - 0.15 * (Math.max(0, -crewPos) / 0.3)`** ma zaszyte
  `0.3` sprzęgnięte z `crew.posMin`. Walidator dopuszcza `posMin = -1`, co daje
  `relief = 0.5` bez clampu. Albo clamp, albo wyprowadzić z `crew.posMin`.
- **`blendApexCL()`** interpoluje liniowo tylko między najmniejszym i
  największym kluczem `apex`, ignorując pośrednie. Dziś nieszkodliwe (są tylko
  45 i 60), ale to cicha pułapka przy dodaniu trzeciej kolumny do CSV — warta
  komentarza albo asercji.

---

## G. Ryzyka i sugerowana kolejność

### Ostrzeżenie: kalibracja stabilności stoi na ostrzu noża

Komentarz przy `sail.verticalLiftFraction` w `config.js` odnotowuje, że
**`0.01`** przerzuca scenariusz T6 (gust przy trzymanym szocie) z czystej
wywrotki (`maxPhi = 65°`) na brak wywrotki (34°). To nie jest tylko powód, by
odłożyć R9-4 — to sygnał diagnostyczny sam w sobie: pasmo, które przewraca się
przy zmianie parametru o 1 %, nie jest odporną kalibracją, a mierzy raczej
przypadkową pozycję modelu wobec progu niż fizykę.

Wszystkie pozycje z bloku D (F11, F12, F13) ruszają bilans momentu przechyłu
o 15–30 %, czyli o 15–30× więcej niż to, co już przewraca T6. **Nie da się ich
zrobić bez świeżej rekalibracji marginesów wywrotki** — dokładnie tego, co
runda 9 odłożyła jako „beyond this round's scope". Ta rekalibracja jest
warunkiem wstępnym bloku D, nie jego skutkiem ubocznym.

To samo dotyczy `hull.residuaryTailPlateau = 0.35` i `hull.lead = 0.06 * L`:
komentarze przy obu opisują je jako wartości wybrane dla marginesu od punktu,
w którym coś się przewraca (odpowiednio: histereza gałęzi prędkości i zmiana
znaku dryfu helmu między 0,065 i 0,07). Oba są uczciwie udokumentowane — ale
trzy pokrętła na ostrzu noża w jednym modelu to wzorzec, nie zbieg
okoliczności, i F8/F11 są najbardziej prawdopodobnym wspólnym wyjaśnieniem.

### Kolejność

1. **F2, F3(a)** — jednolinijkowe, czysty zysk, nie ruszają polary.
2. **F1** — [rusza polarę] samodzielnie, żeby diff był czytelny.
3. **F5, F6, F7, F4** — blok B razem, jeden wspólny diff polary. F5 i F6 są
   małe i domykają wcześniejsze rundy; F4 jest decyzją projektową i warto ją
   podejmować, mając F5/F7 już na miejscu.
4. **F14, F16** — po F1, oba ruszają polarę, oba małe.
5. **Rekalibracja marginesów wywrotki** — osobna pozycja, warunek wstępny
   bloku D (patrz ostrzeżenie powyżej).
6. **F13(`cos φ`), F11, F12** — blok D, po rekalibracji.
7. **F9, F10, F8** — w tej kolejności. F8 na końcu, bo unieważnia pomiary,
   przeciwko którym mierzy się dwa poprzednie.
8. **F15, blok F** — niezależne, w dowolnym momencie.

F3(b), F13(heave) i F15 zasługują na własne ADR: pierwsze to decyzja o
kontrakcie danych wejściowych, dwa pozostałe zmieniają zakres modelu.

---

*Reprodukcja: wszystkie bloki `repro` uruchamiane z katalogu repo przez
`node --input-type=module < plik` albo zapisane jako `*.mjs` obok
`run_tests.js`. Żaden nie modyfikuje stanu repo.*
