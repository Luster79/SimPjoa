# Lista poprawek — ostrzenie: ostatnia otwarta połowa kryterium

*Last reviewed: 2026-08-10*
*Wejście: ADR 0039 (poprawka sondy momentu, lustro końca, audyt przyrządów),
`docs/coverage-no-oar-2026-08-10b.txt` (42/42), kontrola `S3` (10/10, oba
końce). Stan repo na `9773fd1`.*

Numeracja `O*`, nowa; nie koliduje z `N*`, `M*`, `L*`, `K*`, `S*`, `R*`, `P*`,
`F*`, `T*` ani `D*`.

Kryterium ma dwie połowy. **Utrzymanie kursu jest domknięte** — 42/42 punktów
siatki, na predykacie surowszym, niż wymaga decyzja właściciela z 2026-08-10
(dotrymowywanie dozwolone), więc liczba jest podłogą. **Uzyskiwanie kursu jest
w połowie otwarte:** odpadanie i shunt działają bez wiosła na obu końcach,
ostrzenie nie.

---

## Część I. Dlaczego to zlecenie zaczyna się od pomiaru, nie od fizyki

`K3` mierzy przejście TWA90 → TWA70 jako **skokową zmianę na trym docelowy**,
a trym docelowy bierze z zaszytej tablicy `HOLD_TRIM` w
`harness/asserts-course-change.js`. Tablica pochodzi z `S1c` — czyli z
przeszukiwania, o którym ADR 0039 ustalił, że było za wąskie (bez `crewPos`,
bez `stays`).

**Pomiar kontrolny (2026-08-10, TWS6, end=+1), ten sam start, dwa cele:**

| trym docelowy | osiągnięte TWA | zbieżny | przywracający | prędkość | werdykt |
|---|---|---|---|---|---|
| `HOLD_TRIM[70]` (K3 dziś) | 83,3° | tak | tak | 96% | poza pasmem |
| trym, który wg `S3` faktycznie trzyma TWA70 | **79,6°** | tak | tak | 93% | **w paśmie** |

Trymy różnią się przede wszystkim **pozycją załogi w poprzek**: `crewPos=1`
(optimum prędkościowe, załoga maksymalnie wychylona) wobec `crewPos=0.3`.
Kąt żagla jest w obu ten sam (12°).

**Wniosek roboczy: ostrzenie może w ogóle nie być luką w fizyce.** K3 celował
w trym, który nie jest trymem trzymającym TWA70. To ta sama rodzina defektu,
którą ADR 0039 opisał czterokrotnie.

**Zastrzeżenie, którego nie wolno pominąć:** 79,6° przy suficie 80° to margines
**0,4°**. Jeden punkt, jeden wiatr, jeden koniec. To jest przesłanka do
przemierzenia, a nie wynik. Możliwe, że po uczciwym pomiarze zostanie realna
luka — mniejsza, niż sądziliśmy, ale realna.

---

## Część II. Pozycje

### O1. Odziedziczyć trymy docelowe z wyszukiwania, nie z tablicy

`HOLD_TRIM` zastąpić trymem wyznaczonym tą samą metodą, którą `S3` już ma:
przeszukanie po `crewPos`/`tackX`/`crewPosX`/`stays`/żaglu z przerwaniem na
pierwszym trafieniu. Cel przejścia ma być trymem, o którym *wiadomo*, że
trzyma kurs docelowy, a nie trymem z historycznej tabeli.

**Kryterium akceptacji:** `K3` ostrzenie na obu końcach raportuje osiągnięte
TWA i werdykt wobec pasma 70±10. Liczba ma być zmierzona i zaraportowana —
**nie wolno poszerzać pasma ani zmieniać celu, żeby przeszło.**

*Nakład: mały (kod), średni (czas). Zależności: brak — pierwsza pozycja.*

### O2. Uczynić „uzyskiwanie kursu" własnością mierzoną

Dziś cała połowa kryterium wisi na **dwóch przejściach przy jednym wietrze**
(TWA70↔90, TWS6). Dla utrzymania kursu projekt ma `harness/coverage-no-oar.js`
i jedną liczbę na całą siatkę; dla uzyskiwania nie ma nic równoważnego.

Zbudować odpowiednik: macierz przejść (z każdego kursu siatki do sąsiednich,
w obie strony), oba końce, oba kierunki, jedna liczba pokrycia. Wykorzystać
maszynerię z ADR 0039 — przerwanie na pierwszym trafieniu i kolejność prób z
danych — bo bez niej to jest znowu wielogodzinny przebieg.

**Kryterium akceptacji:** jedna liczba „ile przejść wykonalnych bez wiosła" na
tej samej siatce, co pokrycie utrzymania, plus migawka per-punkt. Raport, nie
bramka budowania — ta sama zasada, co przy `coverage-no-oar.js`.

*Nakład: średni. Zależności: po O1 (żeby macierz nie odziedziczyła tego samego
defektu celu).*

### O3. Przejście ciągłym trymem, nie skokiem

Właściciel rozstrzygnął (2026-08-10), że dotrymowywanie w miarę nabierania
prędkości jest dopuszczalne. Rozdział III podręcznika opisuje ruch ciągły
(„przesuwamy się", „przyciągamy i luzujemy żagiel"), nie ustawienie skokowe.
`K3` robi dziś dokładnie to, czego źródło nie opisuje: jedna skokowa zmiana i
zamrożenie na 300 s.

Zmierzyć przejście przy trymie prowadzonym w sposób ciągły — rampa między
trymem wyjściowym a docelowym, plus ograniczona korekta w trakcie. `N3`
pokazał, że przy korekcie ciągłej `tackX` dobija do −1 we wszystkich
przypadkach, więc rampę trzeba prowadzić **wszystkimi** sterowaniami, nie
samym tackiem.

**Kryterium akceptacji:** osiągnięte TWA przy trymie ciągłym wobec skokowego,
na tej samej parze punktów, oba końce. Raportować obie liczby obok siebie —
jeśli ciągły nie pomaga, to też jest wynik.

*Nakład: średni. Zależności: po O1.*

### O4. Dopiero jeśli luka przetrwa — budżet momentu na przejściu

Jeśli po O1-O3 ostrzenie nadal nie dochodzi do pasma, **wtedy** zmierzyć, czego
brakuje: rozkład momentu odchylającego w trakcie przejścia, **poprawioną**
sondą (`yawMomentAtHeading`), z rozbiciem na człony kadłuba, amy i takielunku.

To jest dokładnie ten pomiar, który `L2` wykonał złą sondą i na którym oparł
wycofaną już diagnozę. Powtórzyć go można dopiero wtedy, gdy wiadomo, że cel
jest właściwy — inaczej powtórzy się ten sam błąd o jeden poziom wyżej.

**Kryterium akceptacji:** wskazanie konkretnego członu i wielkości niedoboru,
albo jawne stwierdzenie, że niedoboru nie ma. **Żadnej zmiany w `/core` w
ramach tej pozycji** — to diagnoza, nie naprawa.

*Nakład: mały. Zależności: po O1, O2, O3 — i tylko jeśli luka przetrwa.*

### O5. Oba końce i cały zakres wiatru w każdej pozycji

Nie jest to osobna pozycja do wykonania na końcu, tylko warunek nałożony na
O1-O4: każdy wynik ma być podany dla `end=+1` i `end=-1` oraz dla TWS 4/6/10.

ADR 0016, 0023 i 0039 opisują trzy defekty, które przeżyły rundy przeglądów
wyłącznie dlatego, że drugi koniec nie był ćwiczony. `S3` pokazał, że przy
poprawnym lustrze końce zgadzają się co do dziesiątej stopnia — więc
rozjazd między nimi jest dziś **sygnałem błędu w przyrządzie**, nie fizyki.

*Nakład: wliczony. Zależności: przenika wszystkie.*

---

## Część III. Kolejność i zależności

1. **O1** — bez tego każdy dalszy pomiar dziedziczy zły cel.
2. **O2** — daje liczbę, wobec której ocenia się resztę; dziś jej nie ma.
3. **O3** — rozstrzyga, czy metoda przejścia (skok kontra ruch ciągły) jest
   istotna. Może zamknąć sprawę bez dotykania fizyki.
4. **O4** — tylko warunkowo, jako diagnoza.

Zatrzymać się w momencie, w którym kryterium jest spełnione. Jeśli O1 zamyka
ostrzenie na obu końcach i we wszystkich wiatrach, O3 i O4 są zbędne —
wykonać wtedy O2 (bo liczba pokrycia przejść ma wartość niezależną) i skończyć.

## Czego nie robić

- **Nie poszerzać pasma ±10°** i nie zmieniać kursu docelowego, żeby przejście
  przeszło. Pasmo jest częścią twierdzenia.
- **Nie dodawać fizyki przed O4.** Cztery diagnozy w tym projekcie zaczęły się
  od „brakuje mechanizmu", a skończyły na defekcie pomiaru; ostatnia z nich
  (`L2`) uzasadniła dodanie całego stopnia swobody na fałszywej przesłance.
- **Nie stroić `HOLD_TRIM` ręcznie.** Zastąpić wyszukiwaniem albo zostawić —
  ręczne dobranie wartości, przy której test przechodzi, jest dokładnie tym,
  czego zabraniają konwencje w `docs/README.md`.
- **Nie ufać marginesowi 0,4°.** Jeśli O1 wychodzi na 79,x°, to jest wynik na
  granicy i należy go podać jako graniczny, a nie jako zaliczenie.

## Ryzyko

Główne: O1 zamyka ostrzenie „na papierze" przy marginesie rzędu ułamka
stopnia, co wygląda na sukces, a jest szumem. Zabezpieczenie — O2: pojedyncze
przejście na granicy pasma znaczy niewiele, macierz przejść znaczy dużo.

Drugie: macierz przejść z O2 może być kosztowna mimo maszynerii z ADR 0039,
bo przejście *nieudane* wymaga wyczerpania przeszukiwania, a przy uzyskiwaniu
kursu takich będzie więcej niż przy utrzymaniu. Zmierzyć koszt na jednym
wierszu siatki przed puszczeniem całości.

## Część IV. ADR-y należne

| ADR | temat | pozycja |
|---|---|---|
| — | O1 i O3 to pomiary; jeśli nie zmieniają modelu, idą jako wynik w tym dokumencie, bez ADR-a | O1, O3 |
| następny wolny | „uzyskiwanie kursu staje się własnością mierzoną" — jeśli O2 powstanie jako narzędzie na prawach `coverage-no-oar.js` | O2 |
| następny wolny | tylko jeśli O4 doprowadzi do zmiany w `/core` | O4 |

Numery 0040 i 0041 są zarezerwowane (deficyt napędu ostro wobec Di Piazzy;
predykat trymu zamrożonego kontra ciągłego) — brać kolejne wolne.
