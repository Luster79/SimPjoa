# Lista poprawek — ostrzenie: ostatnia otwarta połowa kryterium

*Last reviewed: 2026-08-11*
*Wejście: ADR 0039 (poprawka sondy momentu, lustro końca, audyt przyrządów),
`docs/coverage-no-oar-2026-08-10b.txt` (42/42), kontrola `S3` (10/10, oba
końce). Stan repo: O1 i O2 wykonane i zacommitowane.*

Numeracja `O*`, nowa; nie koliduje z `N*`, `M*`, `L*`, `K*`, `S*`, `R*`, `P*`,
`F*`, `T*` ani `D*`.

Kryterium ma dwie połowy. **Utrzymanie kursu jest domknięte** — 42/42 punktów
siatki, na predykacie surowszym, niż wymaga decyzja właściciela z 2026-08-10
(dotrymowywanie dozwolone), więc liczba jest podłogą.

**Stan uzyskiwania kursu po O1 (2026-08-11):**

| manewr | end=+1 | end=−1 | stan |
|---|---|---|---|
| odpadanie TWA70→90 | 85,5° | 85,8° | zalicza |
| **ostrzenie TWA90→70** | **79,6°** | **79,8°** | **zalicza — promowane z `xfail`** |
| shunt bez wiosła | — | — | **spadło do `xfail`, patrz O6/O7** |

Ostrzenie, dla którego to zlecenie powstało, **jest zamknięte i nie wymagało
żadnej zmiany w fizyce**. W zamian O1 odsłonił dwie rzeczy w teście shuntu,
opisane niżej. `/core` pozostaje nietknięte przez całe to zlecenie.

**Uzyskiwanie kursu jako całość, po O2 (2026-08-11): 82/156 przejść (52,6%)**
na siatce TWA 50-180/co 10°, TWS 4/6/10, oba końce — patrz O2 niżej. Para,
którą O1 zamknęło, trzyma; macierz pokazuje, że nie reprezentuje całości.

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

> **POTWIERDZONE 2026-08-11 (O1).** Przesłanka się utrzymała: pełny przebieg
> daje 79,6° na `end=+1` i 79,8° na `end=−1`, zbieżnie, z momentem
> przywracającym, przy 97% prędkości. Kontrola promowana z `xfail`.
> **Zastrzeżenie o marginesie zostaje w mocy** — 0,2-0,4° do sufitu i nadal
> jeden wiatr (TWS6). To jest domknięte wąsko, nie z zapasem, i O2 istnieje
> po to, żeby całe twierdzenie nie wisiało na tym jednym punkcie.

---

## Część II. Pozycje

### O1. Odziedziczyć trymy docelowe z wyszukiwania, nie z tablicy — WYKONANE 2026-08-11

`HOLD_TRIM` zastąpić trymem wyznaczonym tą samą metodą, którą `S3` już ma:
przeszukanie po `crewPos`/`tackX`/`crewPosX`/`stays`/żaglu z przerwaniem na
pierwszym trafieniu. Cel przejścia ma być trymem, o którym *wiadomo*, że
trzyma kurs docelowy, a nie trymem z historycznej tabeli.

**Kryterium akceptacji:** `K3` ostrzenie na obu końcach raportuje osiągnięte
TWA i werdykt wobec pasma 70±10. Liczba ma być zmierzona i zaraportowana —
**nie wolno poszerzać pasma ani zmieniać celu, żeby przeszło.**

**Wykonanie.** `HOLD_TRIM` usunięty. `findHoldingTrim()` w
`harness/asserts-helpers.js` jest jedynym miejscem odpowiadającym „który trym
trzyma ten kurs bez wiosła": sześć osi (żagiel, bras, załoga w poprzek i
wzdłuż, tack, stays), przerwanie na pierwszym trafieniu, kolejność prób z
danych ADR 0039, świadomość obu końców. Używają go `K3` i `S3` — nie ma
drugiej kopii, która mogłaby się zestarzeć.

Pasma nie ruszono, celu nie podmieniono. Ostrzenie zalicza 79,6°/79,8°,
kontrola promowana z `xfail` (zestaw sam ją zgłosił jako
`PROMOTION CANDIDATE`, zgodnie z konwencją „xfail, który zaczyna przechodzić,
wywala build").

**Skutek uboczny, nieprzewidziany:** kontrola shuntu spadła do `xfail`. O1 nie
zmienił jej konstrukcji — rozdzielił dwa pojęcia, które w niej były jednym
obiektem. Szczegóły w O6, przyczyna źródłowa w O7.

*Nakład: mały (kod), średni (czas). Zależności: brak — pierwsza pozycja.*

### O2. Uczynić „uzyskiwanie kursu" własnością mierzoną — WYKONANE 2026-08-11

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

**Wykonanie.** `harness/coverage-obtain-course.js` — macierz przejść między
sąsiednimi punktami siatki (TWA 50-180 co 10°, TWS 4/6/10, oba końce), w obie
strony, na `findHoldingTrim()` (a więc bez ryzyka odziedziczenia defektu
`HOLD_TRIM`, który O1 usunął). Metoda identyczna z `obtainCourse()` w `K3`:
ze zbioru na trymie startowym, skok od razu na PEŁNY trym docelowy (wszystkie
sterowania), bez wiosła przez całe przejście, predykat `holdsCourse` na 300s.

**Koszt zmierzony przed puszczeniem całości** (Ryzyko, Część III): jeden wiersz
(TWS6, end=+1, 13 punktów × 4 przejścia z brzegowymi wyjątkami = 26 przejść)
zajął 783s. Sześć wierszy (3×TWS, 2×end) — 4856s (81 min). Zaakceptowane jako
jednorazowy koszt raportu, nie bramki budowania.

**Wynik: `docs/coverage-obtain-course-2026-08-11.txt`.**

```
COVERAGE: 82/156 transitions obtainable with the oar shipped throughout
(K1's converged+restoring predicate), grid TWA 50-180 step 10, TWS 4/6/10,
end 1/-1.
```

**52,6% (82/156).** Rozbicie: TWS4 20/52, TWS6 32/52, TWS10 30/52 — TWS6 (jedyny
wiatr, na którym wcześniej mierzono) jest najlepszym z trzech, nie
reprezentatywnym. `end=+1` i `end=-1` zgadzają się do 1 przejścia (41/78 na
oba), co jest oczekiwanym potwierdzeniem lustra (`S3`, ADR 0039) — rozjazd
między końcami byłby dziś sygnałem błędu w przyrządzie, nie fizyki (patrz O5).

**Zastrzeżenie z Części I traci uzasadnienie tylko częściowo.** Sama para
TWA70↔90/TWS6, dla której O1 powstało, trzyma na obu kierunkach i obu końcach
(79,6-79,8°/85,5-85,8°) — to zalicza. Ale przy TWS4 ta sama para już nie trzyma
w żadną stronę (`TWA70->TWA80: NONE`, `TWA80->TWA70: NONE`), a przy TWS10
trzyma tylko w jedną stronę. **Margines 0,2-0,4° z Części I był prawdziwy dla
jednego wiatru i nie uogólnia się** — macierz pokazuje, że „uzyskiwanie kursu"
jako całość jest przy 52,6%, nie przy marginalnym zaliczeniu.

**Sześć przejść kończy się wywrotką** (capsized=true, oba końce się zgadzają):
TWA100→110 (TWS6), TWA80→70 i TWA160→170 (TWS10), na obu końcach. Trzy wzorce,
nie jeden — potencjalnie trzy różne przyczyny, żadna jeszcze nie zdiagnozowana.
Nie diagnozowane w ramach O2 (O2 mierzy, nie naprawia) — kandydat na kolejną
pozycję, jeśli właściciel zdecyduje, że wywrotki na przejściu są w zakresie.

**Kryterium akceptacji spełnione**: liczba zmierzona i zaraportowana, migawka
per-punkt w `docs/coverage-obtain-course-2026-08-11.txt`, raport (nie bramka).
`/core` nietknięte.

### O3. Przejście ciągłym trymem, nie skokiem — już nie jest potrzebne do zamknięcia luki

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

**Przewartościowane po O1.** Ostrzenie zamknęło się bez tej pozycji, więc O3
nie jest już drogą do zamknięcia luki. Zostaje natomiast jako droga do
**poszerzenia marginesu**: 0,2-0,4° do sufitu pasma to nie jest zapas, na
którym chce się opierać twierdzenie. Jeśli trym ciągły daje 74° zamiast 79,6°,
domknięcie przestaje zależeć od trzeciego miejsca po przecinku. Priorytet
obniżony — po O2, nie przed.

*Nakład: średni. Zależności: po O1 (wykonane). Nie blokuje niczego.*

### O4. Budżet momentu na przejściu — WARUNEK NIE ZASZEDŁ, pozycja nieaktywna

Jeśli po O1-O3 ostrzenie nadal nie dochodzi do pasma, **wtedy** zmierzyć, czego
brakuje: rozkład momentu odchylającego w trakcie przejścia, **poprawioną**
sondą (`yawMomentAtHeading`), z rozbiciem na człony kadłuba, amy i takielunku.

To jest dokładnie ten pomiar, który `L2` wykonał złą sondą i na którym oparł
wycofaną już diagnozę. Powtórzyć go można dopiero wtedy, gdy wiadomo, że cel
jest właściwy — inaczej powtórzy się ten sam błąd o jeden poziom wyżej.

**Kryterium akceptacji:** wskazanie konkretnego członu i wielkości niedoboru,
albo jawne stwierdzenie, że niedoboru nie ma. **Żadnej zmiany w `/core` w
ramach tej pozycji** — to diagnoza, nie naprawa.

**Nie uruchamiać.** Warunek brzmiał „jeśli po O1-O3 ostrzenie nadal nie
dochodzi do pasma". Dochodzi, po samym O1. Ta pozycja była zabezpieczeniem na
wypadek, gdyby luka okazała się realna — nie okazała się. Zostawiona w
dokumencie jako opis metody, gdyby wróciła.

*Zależności: po O1, O2, O3 — i tylko jeśli luka wróci.*

### O6. Trym najszybszy i trym trzymający to dwie różne rzeczy — pytanie otwarte

O1 rozdzielił dwa pojęcia, które wcześniej były jednym obiektem, bo tablica
`HOLD_TRIM` mieszała je ze sobą. Przy TWA90/TWS6 optimum prędkościowe ma
`crewPos=1`, a trym, który faktycznie trzyma kurs — `crewPos=0.3`.

W kontroli shuntu widać to wprost: rampa wygaszania musi startować z trymu
**niesionego** (trzymającego), a rampa odbudowy wraca na trym **napędowy**
(optimum). To dwie różne wartości i od O1 są nazwane osobno. Pomiar
kontrolny: gdyby odbudowa wracała na trym trzymający, łódka utrzymuje kurs
(8,9°, zbieżnie, z momentem przywracającym, oba końce), ale odzyskuje tylko
19% prędkości.

Pytanie: na jaki trym wraca żeglarz po shuncie? Rozdział IV podręcznika
opisuje restart („przyciągamy żagiel, by się wydał i pociągnął"), ale nie
mówi, gdzie ma być załoga, gdy moc już wróci. **To jest pytanie do źródła,
nie do wyszukiwania.**

Kontrola shuntu spadła przez to do `xfail` — **nie przez zmianę w fizyce,
`/core` jest nietknięte.** Manewr działa do ostatniego kroku: bez wywrotki na
rampie wygaszania, próg prędkości osiągnięty, koniec przełączony, kurs
zbieżny i przywracający. Pęka założenie, którego ten test nie mógł wcześniej
zobaczyć: **wygasza z trymu niesionego, a odbudowuje na trym napędowy** — a
te dwa były jednym obiektem, dopóki tablica je mieszała. Teraz to
`crewPos=0.3` i `crewPos=1`, więc załoga kończy **dalej na zewnątrz, niż
zaczynała**, na łódce prawie stojącej. To mechanizm M2: ciężar załogi topi
pływak, gdy znika moment przechylający od żagla.

Zmierzone cztery cele odbudowy, żaden nie przechodzi:

| odbudowa wraca na | wychylenie | prędkość | uwaga |
|---|---|---|---|
| optimum prędkościowe (oryginał) | 5,5° | 0% | **wywrotka** |
| trym trzymający | 8,9° | 19% | kurs utrzymany, łódka staje |
| pełny trym trzymający, skokiem | 50,9° | 518% | odjeżdża z kursu |
| pełny trym trzymający, rampowany | 27,7° | 141% | odjeżdża z kursu |

**Hipoteza „za krótka rampa" — ZMIERZONA I OBALONA (2026-08-10).** `N4`
dobrał `REPOWER_RAMP_SECONDS=45`, mierząc wywrotkę tej samej rodziny (30 s
pada, 40 s przeżywa). Nasuwało się, że przy nowym trymie startowym stała jest
po prostu za krótka. Nie jest. Przebieg 30-200 s, oba końce:

| rampa [s] | 30 | 45 | 60 | 75 | 90 | 120 | 150 | 200 |
|---|---|---|---|---|---|---|---|---|
| wychylenie [°] | 10,3 | 5,5 | 3,1 | 2,3 | 1,7 | 0,9 | 0,2 | 0,0 |
| wywrotka | tak | tak | tak | tak | tak | tak | tak | tak |

Przy 200 s łódka wywraca się już **w trakcie rampy**. Wolniejsze wykonanie
monotonicznie poprawia kurs i nie ratuje niczego, bo **problemem jest stan
docelowy, nie droga do niego**: `crewPos=1` na łódce, która prawie stoi, topi
pływak niezależnie od tempa — nie ma przechyłu od żagla, który by go unosił.
To statyka, nie wyścig. `N4`-owa granica 30/40 s obowiązywała, gdy łódka
wracała na trym, który wcześniej niosła.

**Wniosek:** zła jest nie długość rampy, tylko **cel odbudowy**. Odbudowa na
trym trzymający przeżywa (8,9°, zbieżnie, przywracająco, bez wywrotki) —
kosztem prędkości (19%).

Dotyczy to szerzej niż shuntu: wszędzie tam, gdzie test startuje „od
optimum prędkościowego", warto sprawdzić, czy nie powinien startować od
trymu trzymającego — i odwrotnie.

*Nakład: mały (pomiar progu rampy + lektura źródła). Zależności: po O1.*

### O7. Wyszukiwanie przekracza własny limit pozycji załogi — ZNALEZIONE, ŚWIADOMIE NIETKNIĘTE

Przyczyna źródłowa pod O6, znaleziona 2026-08-11 przy pytaniu właściciela
„dlaczego załoga na burcie miałaby topić pływak".

Odpowiedź na samo pytanie: w tym modelu **załoga wychodzi KU pływakowi**
(`core/stability.js`: `crewPos>0 = toward the ama`), bo pływak jest na
nawietrznej i żagiel go unosi. To poprawna konwencja proa. Ale liczby:

| | |
|---|---|
| masa załogi | 90 kg |
| wyporność pływaka | 84 kgf |
| `crewPos = 1` przenosi na pływak | **90 kg = 107% wyporności** |

`core/config.js` **o tym wie** i liczy `crew.posMax = ama_buoyancy/crew_mass
= 0,933`, z komentarzem wprost, że `1.0` pozwala wybrać pozycję „topiącą
pływak wprost, zamiast jedynie mocno go obciążać". Tyle że:

- **rdzeń limitu nie egzekwuje** — jest doradczy, pilnowany dla interfejsu;
- **`harness/polar.js` przeszukuje `CREW_POS_SEARCH = [0, 0.3, 0.6, 1.0]`**,
  czyli ponad limit. Tak samo `TRIM_CREWPOS` w `asserts-helpers.js` i
  `S3_CREWPOS` w `asserts-polar-helm.js`.

**Zasięg: 8 z 42 punktów siatki (19%)** ma optimum prędkościowe powyżej
limitu — TWA50/60/70/80/90/100/110 przy TWS6 oraz TWA50/TWS10. **TWA90/TWS6
jest wśród nich**, czyli dokładnie punkt, którego używa test shuntu. Stąd
wywrotka przy odbudowie mocy: test celuje w pozycję, którą konfiguracja
uznaje za niemożliwą, a rdzeń jej nie przycina.

**Nietknięte decyzją właściciela (2026-08-11).** Przycięcie wyszukiwania do
`crew.posMax` zmieniłoby prędkości polary w tych 8 punktach, a więc
`out/polar.csv` i bramkę bajtową — to zmiana wyniku, nie tylko przyrządu.
Zapisane, żeby nie zginęło.

Do rozstrzygnięcia, niezależnie od siebie:

1. czy przyciąć wyszukiwania (polara, `findHoldingTrim`, `S3`) do limitu;
2. czy limit ma być **twardy w rdzeniu**, a nie doradczy — dziś każdy kod
   pomijający interfejs może go przekroczyć, co się właśnie stało w trzech
   miejscach naraz.

*Nakład: mały (kod), średni (przeliczenie polary). Zależności: niezależne;
zamyka O6.*

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

Pierwotna kolejność zakładała, że ostrzenie jest luką i trzeba do niej dojść
przez cztery pozycje. O1 zamknął je od razu, więc plan przestawiony
(2026-08-11):

1. ~~**O1**~~ — **wykonane.** Ostrzenie zamknięte, kontrola promowana.
2. **O7** — jedyna pozycja z ustaloną przyczyną i znanym zasięgiem (8/42
   punktów). Zamyka też O6 i przywraca test shuntu. Wstrzymana decyzją
   właściciela, nie brakiem wiedzy.
3. ~~**O2**~~ — **wykonane.** Macierz przejść: 82/156 (52,6%), oba końce
   zgodne. Margines 0,2-0,4° z Części I potwierdzony jako właściwość
   jednego wiatru (TWS6), nie całości — patrz O2.
4. **O3** — już nie do zamknięcia luki, tylko do poszerzenia marginesu. Po
   O2 to pytanie zmienia zakres: nie „czy 79,6° ma zapas", tylko „czy trym
   ciągły podnosi 52,6%" — którego z 74 nieudanych przejść dotyczy, nie
   wiadomo bez pomiaru.
5. **O6** — pytanie do źródła; rozstrzyga się razem z O7.
6. **O4** — nieaktywne, warunek nie zaszedł.

Zasada bez zmian: **zatrzymać się w momencie, w którym kryterium jest
spełnione.** Dla pojedynczej pary TWA70/90/TWS6 ten moment nastąpił po O1;
dla „uzyskiwania kursu" jako całości O2 pokazał, że nie nastąpił — 52,6% nie
jest zamknięciem. O3 i O4 nie są już tylko zapasem na wąski margines, tylko
kandydatami na drogę do podniesienia tej liczby, jeśli właściciel zdecyduje,
że to jest następny krok tego zlecenia.

## Czego nie robić

- **Nie poszerzać pasma ±10°** i nie zmieniać kursu docelowego, żeby przejście
  przeszło. Pasmo jest częścią twierdzenia.
- **Nie dodawać fizyki przed O4.** Cztery diagnozy w tym projekcie zaczęły się
  od „brakuje mechanizmu", a skończyły na defekcie pomiaru; ostatnia z nich
  (`L2`) uzasadniła dodanie całego stopnia swobody na fałszywej przesłance.
- ~~**Nie stroić `HOLD_TRIM` ręcznie.**~~ Nieaktualne — tablicy już nie ma,
  O1 zastąpił ją wyszukiwaniem.
- **Nie ufać marginesowi 0,4°.** Wyszedł 79,6°/79,8°, czyli wynik na granicy.
  Podawany jako graniczny, nie jako komfortowe zaliczenie — patrz erratum
  w Części I. **Potwierdzone przez O2**: przy TWS4 ta sama para w ogóle nie
  trzyma; margines był właściwością jednego wiatru, nie zapasem.
- **Nie czytać 82/156 jako „luka do zamknięcia" bez decyzji właściciela.**
  O2 jest raportem, nie bramką — 52,6% jest zmierzone i zapisane, ale czy i
  jak podnosić tę liczbę (O3? szersze wyszukiwanie? coś innego?) jest
  pytaniem otwartym, tak jak przy `coverage-no-oar.js` na starcie.
- **Nie szukać celu odbudowy mocy, aż któryś przejdzie.** Zmierzono cztery
  (O6) i długość rampy w zakresie 30-200 s. Piąty dobrany pod wynik byłby
  strojeniem; przyczyna jest znana i opisana w O7.

## Ryzyko

Główne: O1 zamyka ostrzenie „na papierze" przy marginesie rzędu ułamka
stopnia, co wygląda na sukces, a jest szumem. **Zmaterializowało się
częściowo** — margines wynosi 0,2-0,4°. Zabezpieczenie bez zmian: O2.
Pojedyncze przejście na granicy pasma znaczy niewiele, macierz przejść dużo.

Trzecie, ujawnione przez wykonanie: **zamknięcie jednej pozycji potrafi
otworzyć drugą.** O1 nie dotknął testu shuntu, a mimo to go zepsuł — bo
rozdzielił dwa pojęcia, które ten test mylił ze sobą. Przy każdej kolejnej
pozycji warto sprawdzić, co jeszcze opierało się na tym samym pomyleniu.

Drugie: macierz przejść z O2 może być kosztowna mimo maszynerii z ADR 0039,
bo przejście *nieudane* wymaga wyczerpania przeszukiwania, a przy uzyskiwaniu
kursu takich będzie więcej niż przy utrzymaniu. Zmierzyć koszt na jednym
wierszu siatki przed puszczeniem całości.

## Część IV. ADR-y należne

| ADR | temat | pozycja |
|---|---|---|
| — | O1 nie zmienił modelu — wynik zapisany w tym dokumencie i w komentarzach kontroli, bez ADR-a. Tak samo O3, gdyby powstało | O1, O3 |
| następny wolny | „uzyskiwanie kursu staje się własnością mierzoną" — jeśli O2 powstanie jako narzędzie na prawach `coverage-no-oar.js` | O2 |
| następny wolny | **jeśli O7 zostanie wykonane** — przycięcie wyszukiwań do `crew.posMax` zmienia raportowane prędkości polary w 8 punktach, a twardy limit w rdzeniu jest zmianą granicy modelu; jedno i drugie zasługuje na zapis decyzji | O7 |
| następny wolny | tylko jeśli O4 doprowadzi do zmiany w `/core` | O4 |

Numery 0040 i 0041 są zarezerwowane (deficyt napędu ostro wobec Di Piazzy;
predykat trymu zamrożonego kontra ciągłego) — brać kolejne wolne.
