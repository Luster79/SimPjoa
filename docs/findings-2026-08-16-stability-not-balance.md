# Ustalenia 2026-08-16/17 — luka nie jest luką w równowadze, tylko w stateczności

*Zlecenie: `docs/work-order-2026-08-16-osiagalnosc.md`. Decyzje wynikające:
`docs/adr/0048`. Ten dokument to kronika pomiarów, nie opis stanu kodu.*

---

## Skąd się wziął ten dokument

Zlecenie zaczęło się od sprzeczności między ADR 0046 („nothing places an
equilibrium in TWA160-175") a logiem macierzy z 2026-08-16 („holding trim
FOUND" na TWA170 we wszystkich sześciu wierszach). Rozstrzygnięcie tej
sprzeczności przewróciło diagnozę trzy razy. Dokument zapisuje **wszystkie
trzy**, łącznie z hipotezami obalonymi, bo ich obalenie jest wynikiem.

## Kolejne diagnozy i co je obaliło

**Diagnoza 1: basen zbyt wąski dla kroku siatki 10°.** Obalona własnym
pomiarem — basen rodziny A ma ≥±20°. Zamiast tego pomiar pokazał, że przy
tolerancji ±10° **jeden atraktor certyfikuje kilka węzłów siatki**.

**Diagnoza 2: luka to brak równowagi w [160, 175].** Obalona przez sondę
deficytu: na każdym kursie 150–180, także w środku luki, istnieje trym
bilansujący łódkę przy momencie wiosła ≤1,2 N·m. **Deficytu momentu nie ma.**

**Diagnoza 3 (bieżąca): luka jest w stateczności.** Łódka bilansuje się w
paśmie, ale w nim nie zostaje.

## Pomiary, które stoją

### Kształt pasma (kontynuacja, bez siatki)

Rodzina A prowadzona szotem: 35°→TWA152,0, 55°→159,6, 60°→161,4 — liniowo,
0,36° kursu na stopień szota — i **fałda przy 61°**, po której łódka spada na
TWA111. Od szczytu kontynuowane **osiem osi**; żadna nie prowadzi wyżej niż
TWA162,26 (karota, +0,83°), wszystkie pozostałe łamią się przy pierwszym
kroku, zrzucając łódkę na TWA108–110.

Rodzina B osiada na 178,55 i **żadna oś nie sprowadza jej poniżej 174,44**.

Zgodność z siatką przy tolerancji ±3 (TWS6): TWA160 ✓ (159,6, exc 0,1),
**TWA165 ✗** po pełnym przeszukaniu 3222 s, TWA175 ✓ (175,9).

### Pasmo jest nieprzekraczalne

`TWA160 → TWA180` z pominięciem środka, wszystkie trzy wiatry, trzy metody:

```
TWS4    skok TWA42.1 | rampa TWA42.1 | szukanie osiągalnego: BRAK
TWS6    skok TWA60.4 | rampa TWA60.4 | szukanie osiągalnego: BRAK
TWS10   skok TWA65.5 | rampa TWA65.5 | szukanie osiągalnego: BRAK
```

**Pełny wiatr jest utrzymywalny i nieosiągalny.**

### Bilans się domyka wszędzie

Najmniejszy `|moment wiosła|` potrzebny do utrzymania kursu, po 162 trymach
(`harness/probe-oar-deficit.js`): 0,17 N·m na TWA160, **0,35 na TWA168**,
0,11 na TWA170, 0,91 na TWA172. Przy momentach składowych rzędu 20–40 N·m to
jest zero. Nie brakuje siły.

### Statyka przeczy dynamice

Na tych samych trymach statyczna sztywność `d(M + Munk)/dψ` wynosi −12 do −44
N·m/° („mocno przywracająca"), a łódka po zwolnieniu wiosła odchodzi:

```
TWA165  -20,4 N·m/°  →  TWA176,9
TWA168  -24,3 N·m/°  →  TWA 80,6
TWA170  -43,9 N·m/°  →  TWA 47,7
```

**To jest ta sama pochodna, której używa predykat `restoring` w K1.**

## Hipotezy obalone pomiarem (nie odrzucone z góry)

| hipoteza | czym obalona |
|---|---|
| basen węższy niż krok siatki | basen rodziny A ≥±20° |
| dziura w siatce szota 55–70 | kontynuacja: warta 1,8°, fałda prawdziwa |
| martwy kanał przechyłu | załoga daje ±4° przechyłu na każdym kursie |
| `verticalLiftFraction=0` | `aero.js:487` skaluje wyłącznie `heelMoment` |
| `Math.abs()` w `sheet.js` | ogranicza linę, nie stronę rei — stronę daje `deltaAlign` |
| **reja jako wiatrowskaz** | `delta = deltaMax` na każdym kursie głębokim, `deltaAlign` 152–178° daleko poza limitem — zamrożenie `delta` w teście jest uprawnione |
| **brakujący moment** | deficyt ≤1,2 N·m w całym paśmie |
| zła specyfikacja łodzi (7 parametrów) | ekran dał 0,07–0,81 N·m przy bazie 0,35 — szum; **ekran był źle wycelowany**, bo mierzył deficyt, którego nie ma |

`sail.yawHeelSign` 0→+1 i 0→−1 dają liczbę **identyczną** z bazą: człon nie ma
na czym pracować, bo trym bilansujący kurs nie używa przechyłu.

## Co pozostaje otwarte

**Dlaczego statyczna sztywność −24 N·m/° idzie w parze z ucieczką.** Dwie
hipotezy postawione i obalone (wyżej). Trzeciej nie ma i nie należy jej
podstawiać — obie poprzednie brzmiały przekonująco i obie były błędne.

Dopóki to jest otwarte, **nie da się rozstrzygnąć, czy luka [162 ; 174] jest
własnością łodzi, czy artefaktem kryterium** — a więc i pytanie o brakujący
mechanizm fizyczny pozostaje bez odpowiedzi.

## Wiosło włożone, nieruszane — pytanie właściciela z 2026-08-17

*„Czy do sterowności wystarczy samo włożenie wiosła, czy trzeba nim ruszać?"*

**Wystarczy włożenie.** `harness/probe-holds-freely.js --oar=in` trzyma wiosło
w wodzie pod zerowym kątem przez całe okno i nigdy nim nie porusza:

```
kurs   wiosło podniesione   wiosło włożone, nieruszane
150            7                      40
160            1                      11
165            0  <- luka              7
168            0  <- luka              3
172            5                       1
180           28                       8
```

Luka znika, a łódka ląduje **na kursie**: 166,4 (błąd 1,4°) i 167,8 (błąd
0,2°), przy dryfie w końcówce 0,00°. Wiosło działa tu jako statecznik, nie
jako ster — przy zerowym wychyleniu `alphaEff = atan2(v + r·ramię, u)`, czyli
sztywność od dryfu i tłumienie od prędkości kątowej, dokładnie te dwie
własności, które `core/rudder.js:48-51` wymienia dla wiosła wyśrodkowanego.
Profil z wiosłem w wodzie jest znacznie płaski, ale przy pełnym wietrze
**gorszy** (180: 8 zamiast 28) — wiosło tam już tylko hamuje.

## Kto ile wnosi — odpowiedź na „to też kawałki deski w wodzie"

Właściciel, 2026-08-17: *„Kadłub i ama to też kawałki deski w wodzie. Albo te
siły nie są zamodelowane, albo mają niedoszacowane cechy."*

Zmierzone przy TWA165/168, pochodne bilansu odchylającego:

| ciało | powierzchnia | dM/dv (sztywność) | dM/dr (tłumienie) |
|---|---|---|---|
| kadłub | 1,41 m² | 440,6 | −20,07 |
| pływak | 0,035 m² | **0,9** | **−0,32** |
| wiosło | 0,15 m² | **750,1** | **−32,71** |

Wiosło daje **szesnaście razy więcej na metr kwadratowy niż kadłub**. Powód
jest fizyczny i poprawny: wiosło to płat na samej rufie, cała powierzchnia na
ramieniu 2,5 m, podczas gdy paski dziobowe i rufowe kadłuba dają momenty
przeciwnych znaków i wypadkowa jest małą różnicą.

**Siły SĄ zamodelowane** — kadłub ma 21 pasków na pełnej długości
(`hydro.js:176`), pływak 11 (`hydro.js:526`), oba z członem `r·x`.

**Hipoteza o niedoszacowanym pływaku — postawiona i wycofana tego samego
dnia.** Powierzchnia boczna pływaka wychodzi z `Seff/π` i wynosi 0,0345 m², co
wygląda absurdalnie mało dla 4,48-metrowego kadłubka. Ale rachunek z drugiej
strony broni modelu: 13 kg wyporu na 4,48 m to 29 cm² przekroju, czyli ~1,7 cm
zanurzenia i ~0,05 m² płaszczyzny bocznej — **ten sam rząd wielkości**.
Cofnięcie ADR 0029 (`maxBuoyancy` 84→60) podnosi to do 0,048 m², nadal jedna
trzecia wiosła. Pływak wnosi mało, bo jest mały i pływa wysoko.

## Dwa ekrany parametrów, oba negatywne

**Ekran 1** (`docs/param-sensitivity-2026-08-16.txt`) — 15 wariantów ocenianych
deficytem momentu: wszystkie 0,07–0,81 N·m przy bazie 0,35, czyli szum.
**Ekran był źle wycelowany**: mierzył deficyt, który wcześniejszy pomiar
wykazał jako zerowy wszędzie, więc nie miał czym rozróżniać.

**Ekran 2** (`docs/param-screen-holders-2026-08-17.txt`) — ten sam pomysł, ale
oceniany **liczbą trymów utrzymujących kurs** na TWA165/168:

```
BAZA, clrXFraction 0.00/0.15/0.25, lateralArea 1.00,
crossFlowDragCoeff 2.0                      -> 0 i 0 trymow
lateralArea 2.00, lowSpeedSideDamping 300   -> 1 i 0, i to atraktor 160.1
                                               wpelzajacy w pasmo +-5deg
```

Podwojenie powierzchni bocznej kadłuba — daleko poza uzasadnionym pasmem —
nie tworzy w luce **ani jednej** prawdziwej równowagi.

## Wniosek

`docs/adr/0013` zapisał to 2026-08-03, zanim ktokolwiek to zmierzył:

> *„on this boat the deep-V hull is the entire lateral plane, so there is no
> second surface to trim against, and the steering oar remains the only thing
> supplying directional stability as opposed to helm balance."*

Dziś ma liczby. Miecz boczny **był** w modelu i został usunięty (ADR 0012 →
0013), bo źródła mówią, że tradycyjna proa go nie ma. Po jego usunięciu łódka
nie ma drugiej powierzchni — i to, a nie brak członu fizycznego czy zła
wartość parametru, jest przyczyną luki.

**Zastrzeżenie o zasięgu źródła.** Proafile mówi, że proa jest sterowana bez
wiosła *„on all reaching and windward courses"*. O kursach pełnych nie mówi
**nic, w żadną stronę**. Nie wolno z tego wywodzić, że pełny wiatr wymaga
wiosła — wolno tylko powiedzieć, że zdanie kończy się przed pasmem, o które
pytamy. (Ten sam kształt błędu popełniono tu trzy razy — zob.
`[[feedback-manual-paddle-not-downwind]]`, ADR 0028.)

## Miara, którą warto przyjąć

`harness/probe-holds-freely.js` pyta wprost: osiądź pod wiosłem, podnieś
wiosło, płyń 900 s, gdzie jesteś. Jego produktem ubocznym jest **liczba
trymów utrzymujących kurs**, i ta liczba mówi więcej niż „tak/nie":

```
TWA150   7      TWA165   0   <- żaden          TWA175  17
TWA155   3      TWA168   0   <- żaden          TWA178  23
TWA160   1      TWA170   1                     TWA180  28
TWA162   1      TWA172   5
```

Dwa wnioski z tego profilu:

- **Pasmo praktycznie nieżeglowne to [160 ; 170], nie [165 ; 168].** Zero
  trymów mają tylko 165 i 168, ale 160, 162 i 170 mają po jednym — a jeden
  trym nie jest kursem w rozumieniu kryterium. Dziesięć stopni, nie sześć.
- **Pełny wiatr jest najstabilniejszym stanem polary i pozostaje
  nieosiągalny.** TWA180 utrzymuje 28 trymów, TWA178 dwadzieścia trzy. Rów
  ma solidny ląd po obu stronach; brakuje wyłącznie przejścia.

Luka **przetrwała ten predykat** — bez pochodnej statycznej, bez okna 120 s,
przy tolerancji ±5° zamiast ±10°. Trzecia niezależna metoda, ta sama luka, więc
nie jest artefaktem K1.

Właściciel, 2026-08-16: *„znalezienie jednego trymu, który musiałby być
idealnie użyty, to nie jest rozwiązanie — nikt w świecie rzeczywistym by tego
nie osiągnął."* Ta liczba jest tego zarzutu miarą. Kryterium „kurs osiągalny i
trwale utrzymywalny" powinno znaczyć **utrzymywalny na kilka sposobów**, a nie
„istnieje jeden trym przechodzący test".
