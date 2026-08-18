# Lista poprawek — osiągalność: równowaga na TWA170 istnieje, brakuje drogi do niej

*Data: 2026-08-16*
*Następuje po `Archive/work-order-2026-08-15-pelny-wiatr.md` (W1–W7) i po przeglądzie
macierzy przejść z 2026-08-16 (125/156).*

---

## Część I. Co jest ustalone i dlaczego to zlecenie zaczyna się od sprzeczności

Dwa dokumenty projektu mówią o paśmie TWA160–175 rzeczy, które nie mogą być
prawdziwe jednocześnie.

**ADR 0046** (2026-08-15, sekcja *Measured*) stwierdza, że marsz zatrzymuje się
na punkcie TWA170, i uzasadnia to zdaniem: *„nothing places an equilibrium in
TWA160-175"*. Dwa niezależne przyrządy — próby zwalniania po jednej osi z
`Archive/findings-2026-08-15-deep-course-gap.md` oraz zrampowane wyszukiwanie
`findReachableTrim` — zgodziły się co do miejsca luki.

**Log macierzy z 2026-08-16** (`docs/coverage-obtain-course-2026-08-16.txt`),
puszczony na rdzeniu po ADR 0047, mówi co innego. Na TWA170 wypisuje
`holding trim FOUND` — **we wszystkich sześciu wierszach** (dwa końce × TWS
4/6/10). Tak samo na TWA180. W całej macierzy **żadne** ze 156 przejść nie
przepada z powodu braku trymu na którymkolwiek końcu:

```
przyczyny 31 nieudanych: zbiegło-zły-kurs 20,  wywrotka 7,  brak trymu 0
```

Kryterium akceptacji w `findHoldingTrim` nie jest miękkie — `harness/
asserts-helpers.js:318` wymaga naraz: odchyłki ≤10° od kursu nominalnego,
zbieżności, **momentu przywracającego** (`restoring`, czyli `dM/dψ < 0`),
prędkości ≥50% polary i braku wywrotki, przez 300 s z wiosłem podniesionym.
To jest definicja stabilnej równowagi, a nie „coś się tam kręci w pobliżu".

### Co z tego wynika

**Równowaga na TWA170 istnieje i jest stabilna. Nie istnieje droga do niej.**

Asymetria w logu mówi to wprost:

| kierunek | wynik |
|---|---|
| `TWA170 → TWA160` | **HOLDS 6/6** (oba końce, wszystkie trzy wiatry) |
| `→ TWA170` (z 160 i z 180) | **nieudane 12/12** |

A sposób, w jaki przepadają, wyklucza „łódka nie chce tam płynąć":

```
TWS4  160→170: doszła do TWA71.8  (v=7%)    ← odbiła o ~90° w drugą stronę
TWS4  170→180: doszła do TWA42.1  (v=6%)
TWS6  170→180: doszła do TWA60.4  (v=41%)
TWS4  180→170: doszła do TWA179.8, converged=false  ← nie ruszyła się wcale
```

Trym, który utrzymuje 170 po osiadnięciu na 170, przyłożony ze stanu na 160
wyrzuca łódkę na 42–72°. To jest zachowanie **poza basenem przyciągania**, a
nie brak równowagi. Basenu nikt do tej pory nie zmierzył — ani W1, ani W5.

> **Stan wykonania 2026-08-16:** R1 zamknięte, R4 zamknięte, R6 zamknięte
> (ADR 0048). R2 i R3 w pomiarze. R5 czeka na decyzję właściciela.
> Wynik R1 zmienił diagnozę na tyle, że część założeń poniżej jest już
> nieaktualna — patrz ADR 0048, który jest bieżącym stanem wiedzy.

### Pomiar basenu (2026-08-16) — wykonany, `harness/probe-basin.js`

Sonda: z certyfikowanego utrzymania odchylić kurs o δ przy **niezmienionym
trymie**, wiosło podniesione, i sprawdzić, gdzie łódka wyląduje po 300 s.
Pełne wyniki w `docs/basin-2026-08-16.txt`. TWS4, `end=1`:

| kurs nominalny | równowaga | basen | trym | co to jest |
|---|---|---|---|---|
| TWA150 | **154,4** | ≥±20° | `sheet=35 brailW=0 tackX=1 crewX=-1` | atraktor, rodzina A |
| TWA160 | **154,4** | ≥±20° | **identyczny** | **ten sam atraktor** |
| TWA170 | 169,5 | **<1°** | `sheet=35 brailW=1 tackX=-1 crewX=0` | **siodło** |
| TWA180 | **179,2** | −20°/+7° | `sheet=35 brailW=0 tackX=0.5 stays=-1` | atraktor, rodzina B |

Linia rozstrzygająca — TWA170, lądowanie po trąceniu przy zamrożonym trymie:

```
-20:179  -15:179  -10:179  -5:180  -2:180  -1:180  |  +1:59  +2:65  +5:69  +10:71
```

**Trącenie o jeden stopień w stronę ostrzenia zrzuca łódkę z 169,5 na TWA59.**
W drugą stronę spływa na 180. Punkt stały istnieje, ale jego basen jest węższy
niż stopień — to separatrysa między dwoma prawdziwymi atraktorami, a nie kurs.

TWS6 powtarza wzór dla pary 150/160: obie certyfikacje wracają ten sam trym i
tę samą równowagę na **152,0**, basen ≥±20°.

### Trzy rzeczy, które to prostuje

1. **ADR 0046** — punkt stały w TWA160–175 **istnieje**; wniosek operacyjny
   („marsz tam nie dojdzie") był trafny, uzasadnienie nie.
2. **Teza tego zlecenia z pierwszej redakcji** („równowaga jest stabilna") —
   jest stabilna wyłącznie w sensie, który mierzy predykat `restoring`
   w `holdsCourse`. To **dziura w K1**: test liczy `dM/dψ < 0` lokalnie i
   przepuszcza siodło o basenie poniżej stopnia. Pokrycie utrzymania 42/42
   jest o tyle zawyżone, i tak samo `holding trim FOUND` na TWA170 w macierzy.
3. **Pierwsza wersja tej sondy miała ten sam błąd** — mierzyła powrót względem
   kursu **nominalnego**, więc ucieczka na 179 przy nominale 170 liczyła się
   jako „wróciła". Poprawione: miara idzie względem faktycznej równowagi
   (`probe-basin.js`, `RETURN_BAND`).

Do tego wniosek, którego nikt nie stawiał: przy tolerancji ±10° **jeden
atraktor certyfikuje dwa sąsiednie węzły siatki**. Łódka nie utrzymuje TWA160
— utrzymuje 152–154 i mieści się w paśmie. Prawdziwe pytanie brzmi więc nie
„czemu nie da się dojść do 170", tylko **„czy między 155 a 178 istnieje
jakakolwiek równowaga"**.

### Czego to nie unieważnia

ADR 0046 zmierzył prawdziwą rzecz: `findReachableTrim`, puszczone ze stanu na
TWA160, **nie znajduje** kandydata dochodzącego do TWA170. To zostaje w mocy i
jest powodem, dla którego samo przełożenie `findReachableTrim` do macierzy
(propozycja z 2026-08-16) **nie odzyska tych dwunastu przejść** — ta próba
została już wykonana. Błędne jest tylko uogólnienie z tego pomiaru na
nieistnienie równowagi.

Podobnie W6: dwie z sześciu wywrotek przejścia okazały się artefaktem skoku i
znikają po zrampowaniu; `TWA160→170/TWS10` nie znika. To też zostaje.

---

## Część II. Pozycje

### R1. Zmierzyć basen przyciągania w paśmie 150–180 — pozycja główna

Sonda z Części I obejmuje TWA160/170/180. Rozszerzyć na całe pasmo, oba końce,
TWS 4/6/10, i wypisać **szerokość basenu w stopniach** dla każdego punktu.

To jest liczba, której projekt nigdy nie miał, a od której zależy każda
następna decyzja:

- **jeśli basen jest węższy niż 10°** — siatka co 10° jest w tym paśmie złym
  przyrządem, a „luka" jest po części artefaktem kroku. Poprawka to R2, bez
  dotykania fizyki;
- **jeśli basen jest szeroki, a mimo to trym z sąsiada tam nie trafia** —
  problem leży w *trajektorii* przejścia (łódka wychodzi z basenu po drodze),
  a nie w jego szerokości. Wtedy właściwym narzędziem jest rampa dłuższa niż
  60 s albo trym pośredni, nie nowy człon fizyczny.

Weryfikacja: tabela `TWA × TWS × end → szerokość basenu [°]`, do
`docs/basin-2026-08-16.txt`.

**Koszt:** jedno wyszukiwanie utrzymania na punkt (to samo, co w macierzy —
TWA170 to ~640 s) plus 10 tanich perturbacji. Pasmo 150–180 × 3 wiatry × 2
końce ≈ 2–3 h. Jeden koniec wystarczy na start, drugi to kontrola symetrii.

### R2. Przejść pasmo problemowe drobniejszym krokiem

Właściciel to już zamówił: *„Tam gdzie skok co 10 stopni działa możemy tak
zostawić. Natomiast w sferze «problematycznej» może trzeba zejść dużo niżej."*

Marsz `TWA150 → TWA180` przez punkty pośrednie co **2°**, każdy etap przez
`findReachableTrim` ze stanu faktycznego, z rampą. Jeżeli rodzina trymów jest
ciągła, a tylko basen wąski — taki marsz dojdzie, a marsz co 10° nie dochodzi.
Jeżeli i ten stanie, staje **w konkretnym miejscu**, co daje ostrzejszy adres
niż „gdzieś w 160–175".

Weryfikacja: `legs=[...]` z `report-long-walks.js` przy kroku 2°, i punkt
zatrzymania z dokładnością do 2°.

**To jest pozycja, która może domknąć pełny wiatr bez dotykania `/core`.**
Dlatego idzie zaraz po R1 — ale nie przed, bo bez szerokości basenu nie wiadomo,
czy 2° to właściwy krok, czy nadal za duży.

### R3. Macierz pyta o trym docelowy w oderwaniu od stanu — dla 19 przejść spoza TWA170

`harness/coverage-obtain-course.js:113` nadal woła `findHoldingTrim`, czyli
wybiera trym docelowy **niezależnie od tego, skąd łódka przychodzi**, i
przykłada go **skokiem**, nie rampą. To dokładnie defekt, który W5 naprawiło
(ADR 0046) — ale tylko dla raportu marszu.

Zakres: **19 nieudanych przejść spoza TWA170.** Na TWA170 wiemy, że to nie
pomoże (Część I); na reszcie nikt tego nie sprawdzał. Sygnatura pasuje —
20 z 31 to „zbiegło, ale nie tam", ta sama rodzina, którą dopasowanie tolerancji
zredukowało już raz o 33 przejścia. Najgęstsze skupisko:

```
TWA140: 6/12   TWA150→140: 4/6 (osiada na 155,6-160,5)   TWA130→140: 2/6
```

Realizacja **dwustopniowa**, nie podmiana: zostawić próbę skokową jako stopień
pierwszy (żeby liczba 125/156 pozostała porównywalna), a przy jej porażce
ponowić przez `findReachableTrim` ze stanu `from.hold.finalState` niosącego
`from.trim`. Raportować **dwie liczby**, nigdy jednej sklejonej.

Powód, dla którego nie robimy prostej podmiany: koszt (pełna siatka to dziś
3,6 h; wyszukiwanie osiągalności na wszystkich 156 przejściach to wielokrotność
tego) oraz porównywalność — podmiana zmienia naraz **dwie** rzeczy, wyszukiwanie
i rampę, a projekt musiał już raz dorobić `--old-ceiling`, bo popełnił dokładnie
ten błąd.

Przy okazji: komentarz w `harness/asserts-helpers.js:331-334` wymienia
`coverage-obtain-course.js` jako miejsce, gdzie `findHoldingTrim` zadaje
**właściwe** pytanie. Dla `coverage-no-oar.js` to prawda (nie ma tam przejścia).
Dla macierzy — nie, bo macierz wykonuje przejście ze stanu rzeczywistego.
Komentarz poprawić razem ze zmianą.

Weryfikacja: stopień pierwszy musi wyjść **125/156 bez zmian** (ta sama ścieżka
kodu); stopień drugi to liczba nowa.

### R4. Rozdzielić rampę od wyszukiwania — 7 wywrotek przejścia

`findReachableTrim` robi obie rzeczy naraz. Dołożyć tryb „tylko rampa" (trym
docelowy nadal z `findHoldingTrim`, ale wprowadzany przez 60 s), żeby wiedzieć,
ile z 31 — a zwłaszcza ile z **7 wywrotek** — to czysty artefakt skoku.

Przesłanka, że coś tu jest: W6 zmierzyło już, że **2 z 6** wywrotek z ADR 0042
znikają po zrampowaniu. Obecne 7 to inny przebieg i inny rdzeń; trzeba
przeliczyć.

Weryfikacja: trzy liczby z jednego wiersza (`--end=1 --tws=6`, ~48 min):
skok+utrzymanie (dziś), rampa+utrzymanie, rampa+osiągalność. Pełna siatka
dopiero dla trybu, który wygra.

Bez R4 wynik R3 będzie nieinterpretowalny — będziemy wiedzieć, że liczba
urosła, ale nie z czego.

### R5. K3 przestaje być streszczeniem połowy kryterium — decyzja właściciela

K3 to **dwa punkty przy TWS6** i siedzi w bramce budowania. Macierz to 156
punktów i jest tylko raportem. Po ADR 0047 K3 powiedziało „regres", a macierz
„+10". Ta rozbieżność powtórzy się przy każdej następnej zmianie fizyki i
za każdym razem zatrzyma pracę na dwóch punktach.

Do rozstrzygnięcia przez właściciela — **nie podejmuję tej decyzji sam, bo
zmienia to, co blokuje build**:

- **(a)** przekotwiczyć K3 na obecne wartości i traktować jako czujnik dymu, z
  notatką, że nie jest miarą pokrycia; albo
- **(b)** wprowadzić do bramki stały podzbiór macierzy (np. wiersz
  `end=1 TWS6`, 26 przejść, ~48 min) z zapisanym punktem odniesienia.

Moja rekomendacja: **(a) teraz, (b) gdy R1–R4 ustabilizują liczbę.** Wpuszczanie
48-minutowego wiersza do bramki w trakcie zmieniania metody pomiaru zablokuje
pracę na własnym szumie.

### R6. Sprostować ADR 0046

Zdanie *„nothing places an equilibrium in TWA160-175"* jest sprzeczne z logiem
utrzymania z następnego dnia. ADR-y są append-only — nie edytować, dołożyć
sprostowanie albo ADR następujący, w zależności od tego, co pokaże R1.

Ważne, żeby sprostowanie **nie poszło za daleko w drugą stronę**: pomiar
`findReachableTrim` w ADR 0046 był poprawny, uogólnienie nie było.

### R7. Każdy skan deklaruje zakres osi — wymóg metodyczny

Bez zmian z W7, obowiązuje od pierwszego pomiaru tego zlecenia. Powtórzony,
bo R1 wprowadza nowy przyrząd (sonda basenu), a projekt ma dziesięć przypadków
wniosków wyciągniętych ze zbyt wąskiej siatki.

Sonda basenu deklaruje: zakres δ, krok δ, długość okna, czy trym pozostaje
zamrożony.

---

## Część III. Kolejność

1. **R1** — bez szerokości basenu wszystkie pozostałe decyzje są zgadywaniem.
2. **R2** — jedyna pozycja mogąca domknąć pełny wiatr bez dotykania `/core`.
3. **R4**, potem **R3** — w tej kolejności, bo R4 czyni wynik R3 czytelnym.
   Obie to zmiany w tym samym pliku; zrobić jako jedną zmianę z trybem.
4. **R5** — decyzja właściciela, niezależna, można podjąć w dowolnym momencie.
5. **R6** — po R1, bo treść sprostowania zależy od pomiaru.
6. **R7** — obowiązuje od pierwszego pomiaru.

Zasada bez zmian: **zatrzymać się, gdy kryterium jest spełnione.**

## Czego nie robić

- **Nie zmniejszać pływaka.** Zmierzone: przy skali 0,5–1,4 dryf w paśmie
  głębokim zmienia się o 0,02°, a równowaga rodziny A stoi na 159,8–160,0 —
  pływak nie jest tu dźwignią. Za to zmniejszenie kosztuje pokrycie utrzymania
  **42/42 → 28/42**.
- **Nie wyłączać TWA160–175 z zakresu.** Wycofuję tę propozycję z 2026-08-16:
  skoro równowaga na TWA170 istnieje i jest stabilna we wszystkich sześciu
  wierszach, wyłączenie usunęłoby z kryterium kurs, który łódka **potrafi**
  utrzymać. To byłaby zmiana definicji ukrywająca defekt drogi dojścia.
- **Nie stroić `CDbroadside`** — deficyt jest w kształcie krzywej, nie w skali;
  psuje zgodność z Di Piazzą jako całością (19/26 → 16/26).
- **Nie wracać do dziewięciu odrzuconych przyczyn** bez nowej przesłanki.
  Każda ma liczby w `Archive/findings-2026-08-15-deep-course-gap.md`.
- **Nie włączać `verticalLiftFraction`** jako drogi do pełnego wiatru. Działa na
  przechył, a ten wynosi tam 0,2° — nie ma na czym pracować. To osobna robota o
  wierności rigu.
- **Nie powoływać się na fragment podręcznika o pagaju** w niczym, co dotyczy
  kursów pełnych. Trzeci przypadek tego wnioskowania zamknięty 2026-08-16;
  patrz ADR 0028 i sprostowanie w ADR 0047.

## Ryzyko

**Główne: to zlecenie zaczyna się od stwierdzenia, że poprzedni wniosek był
za mocny — i może powtórzyć ten sam błąd w drugą stronę.** „Równowaga istnieje"
opiera się na `findHoldingTrim`, który osiada na kursie nominalnym pod
autopilotem, zanim zwolni wiosło. Jeżeli ten sposób startu sam wprowadza łódkę
do wąskiego basenu, do którego z zewnątrz nie da się wejść — to równowaga jest
prawdziwa, ale operacyjnie bezużyteczna, a R2 to pokaże. Zabezpieczenie: R1
mierzy basen **przed** jakąkolwiek zmianą, a R2 próbuje wejść z zewnątrz.

Drugie: dwustopniowy raport w R3 to słabsze twierdzenie niż liczba z jednej
metody. Musi być raportowany jako dwie liczby; sklejenie w jeden nagłówek
byłoby zawyżeniem.

Trzecie: `findReachableTrim` przeszukuje **tę samą siatkę** co `findHoldingTrim`.
Jeśli potrzebny trym leży poza nią, żadne z nich go nie znajdzie — R7 dlatego
nie jest formalnością.

## Część IV. ADR-y należne

| ADR | temat | pozycja |
|---|---|---|
| następny wolny (0048) | **sprostowanie do 0046** — równowaga w TWA160-175 istnieje; luka jest w basenie/drodze, nie w istnieniu. Musi jawnie powiedzieć, co z 0046 zostaje w mocy | R6, po R1 |
| następny wolny | tylko jeśli R3/R4 ruszą nagłówkową liczbę macierzy — zmieniają definicję tego, co macierz mierzy | R3, R4 |
| — | R1, R2 to pomiary — wynik do migawek i komentarzy kontroli, bez ADR-a, chyba że R2 domknie pasmo | R1, R2 |
| — | R5 to decyzja o bramce, nie o architekturze — notatka w `docs/README.md` wystarczy, chyba że wybrane zostanie (b) | R5 |
