# Lista poprawek — blok B: dług pomiarowy, cztery luki i pytanie o kryterium

*Last reviewed: 2026-08-10*
*Wejście: wykonanie bloku A (M1-M3, Część VI
`docs/work-order-2026-08-09-domkniecie-kryterium.md`), snapshot
`docs/coverage-no-oar-2026-08-09.txt` (38/42), ADR 0034-0038. Stan repo na
`ce4f3fa`.*

Numeracja `N*`, nowa; nie koliduje z `M*`, `L*`, `K*`, `S*`, `R*`, `P*`,
`F*`, `T*` ani `D*`.

**Ten dokument NIE jest kontynuacją propozycji „bloku B" sprzed wykonania
bloku A.** Tamta lista miała dwie pozycje (deficyt napędu ostro; zakres
dźwigni CE−CLR). Blok A unieważnił drugą z nich i przesunął priorytet
pierwszej. Poniżej jest lista wyprowadzona z tego, co blok A faktycznie
zmierzył.

---

## Część I. Co blok A zmienił w obrazie sytuacji

### I.1. Pokrycie nie jest tam, gdzie myśleliśmy

| stan | pokrycie |
|---|---|
| przed blokiem A (metoda oficjalna) | 21/42 (50 %) |
| **po korekcie metody (unia dwóch przeszukiwań)** | **38/42 (90 %)** |

Różnica **nie pochodzi ze zmiany fizyki** — to ta sama łódź. Trzy pozycje
bloku A znalazły trzy defekty pomiaru, ostatni z nich w moim własnym kodzie
z L1 (`--wide-search` zastępował optimum polary siatką zamiast je dodawać).

### I.2. Pozycja wycofana z poprzedniej propozycji

**„Zakres dźwigni CE−CLR" (dawne M5) — WYCOFANE.** M2 zmierzył, że na
wszystkich 9 punktach bejdewindu `tackX` zerujący moment leży w zakresie
(|tackX| ≤ 0,45 przy dostępnym ±1) i jest przywracający. **Dźwignia ma
ponad dwukrotny zapas.** Nie ma czego poszerzać; pozycja odpada w całości,
a wraz z nią pytanie o powrót do miecza (ADR 0013) jako rozwiązanie
*autorytetu*. Jeśli miecz kiedyś wróci, to z innego powodu niż ten.

### I.3. Prawdziwy mechanizm porażki na bejdewindzie

M2 obalił hipotezę o sile bocznej wiosła (kąt dryfu jest stabilny, 5,2° →
4,0°). Rzeczywisty mechanizm: **spadek prędkości → mniejszy moment
przechylający żagla → ciężar załogi siedzącej na amie topi pływak → `phi`
ujemne → wywrotka.** Utrata prędkości jest skutkiem przechyłu, nie
przyczyną.

To jest mechanizm, który **realna załoga koryguje odruchowo** (łódka
zwalnia — załoga wchodzi do środka). Model tego nie może wyrazić, bo
`holdsCourse()` zamraża trym na 300 s. Patrz N3.

---

## Część II. Pozycje

### Blok A' — dług pomiarowy (najpierw, bo wszystko inne ocenia się wobec niego)

#### N1. Przemierzyć L4 i L5 uczciwą metryką

**To jest dług, nie ulepszenie.** Werdykty „cień masztu i DOF pitch podniosły
pokrycie o 1 punkt" powstały przy wąskim przeszukiwaniu, które gubiło 8-17
punktów z 42. Nie wiemy, czy te dwie zmiany fizyki pomogły, zaszkodziły, czy
nie zrobiły nic.

*Naprawa:* zmierzyć pokrycie **unią** (wąskie + szerokie, z naprawionym
`--wide-search`) w trzech konfiguracjach: (a) `ce4f3fa` — stan obecny;
(b) L4 wyłączone (`createConfig({ sail: { mastShadowCLFactor: 0 } })`);
(c) stan przed L4 i L5 razem — najprościej przez `git stash`/checkout na
commit sprzed nich, bo pitch nie ma pojedynczego wyłącznika.

**Odbiór:** trzy liczby pokrycia i delta per pasmo (50-70 / 80-130 /
140-160 / 170-180 osobno — jedna liczba zbiorcza ukryłaby handel, tak jak
przy K5). Werdykty w ADR 0037 i 0038 (sekcje „Measured") **poprawione albo
potwierdzone** — jeśli któraś zmiana okaże się neutralna lub szkodliwa dla
kryterium, to jest wynik do zapisania, nie do ukrycia.

*Nakład: duży (3 × ~2 h przeliczeń, wykonalne w tle). Zależności: przed N5.*

#### N2. Zamknąć cztery pozostałe luki (wszystkie przy TWS 6)

Zostały: **TWA 50, 60, 70 i 130, wszystkie przy TWS 6.** To najmniej
wiarygodne NONE w tabeli — leżą przy jednym wietrze, gdzie zgrubna siatka
szotu `{35, 55, 75}` pasuje najgorzej do kątów, które faktycznie działają
(przy TWS 6 trzymające szoty to 16-36°).

*Naprawa:* celowany przebieg `--wide-search --twa=50,60,70,130 --tws=6` z
**gęstszą siatką szotu** (co 10° w zakresie 15-85°) i naprawionym kodem.
Zgodnie z własnym zaleceniem L1: zgrubna siatka wystarcza do *istnienia*,
ale tu wiemy już, że rozdzielczość jest wąskim gardłem.

**Odbiór:** cztery punkty rozstrzygnięte w jedną albo drugą stronę.
Jeśli nadal NONE — to pierwszy raz, gdy „nie trzyma się" będzie twierdzeniem
o łodzi, a nie o przeszukiwaniu, i dopiero wtedy warto szukać przyczyny
fizycznej.

*Nakład: mały-średni (4 punkty). Zależności: brak — zrobić od razu.*

### Blok B' — kryterium

#### N3. Wariant predykatu z trymem ciągłym

Dwa niezależne wyniki wskazują na to samo pytanie. **L3:** rozdział III
podręcznika jest napisany czasownikami ruchu („przesuwamy się", „przyciągamy
i luzujemy") i zastrzega w nagłówku *„stosować z umiarem"* — opisuje
sterowanie **ciągłe**, nie równowagę bierną. **M2:** mechanizm porażki na
bejdewindzie to dokładnie ten, który realna załoga koryguje odruchowo.

Dzisiejszy `holdsCourse()` zamraża trym na 300 s. To jest **inna własność**
niż ta, którą opisuje źródło, i trudniejsza.

*Naprawa:* wariant predykatu z **powolną, ograniczoną korektą** — np. `tackX`
i `crewPos` korygowane raz na 10 s, o krok ≤ 0,1, w granicach dostępnego
zakresu, prostym prawem proporcjonalnym do błędu kursu i do przechyłu.
Zmierzyć pokrycie **obiema** metrykami i podać obie.

**Odbiór:** dwie liczby pokrycia obok siebie. **Decyzja, którą z nich uznać
za kryterium, należy do właściciela** — nie rozstrzygam jej implementacją.
Nie zastępować dotychczasowego predykatu; dołożyć drugi.

*Nakład: średni. Zależności: po N1 (żeby obie metryki liczyć na tej samej,
zweryfikowanej fizyce).*

#### N4. Rozpędzenie z martwego stanu bez wiosła

Jedyna część shuntu, która wciąż zawodzi po M3. Shunt **kończy się** na obu
końcach, `end` się odwraca, wychylenie po shuncie 12° (w paśmie) — ale łódka
nie potrafi ruszyć z ~0,14 m/s: brak prędkości → brak siły bocznej kadłuba →
żagiel przewraca ją bokiem.

Jakość rampy ponownego rozpędzania mierzalnie na to wpływa (wychylenie po
shuncie 38,1° → 21,0° → 12,0° dla rampy 10/20/30 s), więc **procedura ma
znaczenie i nie jest jeszcze zoptymalizowana**.

*Naprawa:* zdiagnozować, czy istnieje jakakolwiek sekwencja trymu
rozpędzająca łódkę od zera bez wiosła (dłuższa rampa, inny profil, załoga
wchodząca później, hals). Jeśli nie istnieje — sprawdzić w podręczniku, co
źródło mówi o ruszaniu z miejsca (rozdz. II opisuje start **z brzegu, z
wiosłem w gotowości**: *„Zwykle wiosło nie jest w tym momencie potrzebne,
ale mamy je w gotowości"* — to może być granica, którą źródło przyznaje).

**Odbiór:** rozstrzygnięcie z liczbami, czy to własność łodzi czy
niedopracowana procedura. Jeśli źródło dopuszcza wiosło przy ruszaniu —
zapisać to jako **jawne ograniczenie kryterium**, uzgodnione z właścicielem,
a nie jako cichy wyjątek.

*Nakład: średni. Zależności: brak.*

### Blok C' — realizm

#### N5. Deficyt napędu ostro wobec Di Piazzy (`S4b`)

Jedyna pozycja, która przetrwała z poprzedniej propozycji bez zmian.
`xfail:CALIBRATION` stoi: model daje 0,72 tego, co źródło przy θ=55 i 0,82
przy θ=60. To jest druga połowa kryterium („przybliżona do realnej łodzi"),
niezależnie od pokrycia.

*Naprawa:* zbadać, czy deficyt jest w CL, w powierzchni odniesienia, czy w
oporze; poprawić przeciw źródłu, nie przeciw metryce pokrycia.

**Odbiór:** `S4b` przemierzone i zaraportowane; pokrycie zmierzone **po**
zmianie i podane jako skutek uboczny, nie jako cel. **[rusza polarę]**

*Nakład: średni. Zależności: po N1 — inaczej nie da się odróżnić wpływu tej
zmiany od szumu metody.*

---

## Część III. Plan wdrożenia

Jedna reguła, ta sama co poprzednio, teraz poparta trzema własnymi błędami:
**najpierw naprawić pomiar, potem mierzyć nim fizykę.**

1. **N2** — tanie, cztery punkty, domyka mapę pokrycia.
2. **N1** — dług pomiarowy; bez niego ADR 0037 i 0038 mają niesprawdzone
   sekcje „Measured".
3. **N4** — niezależne, może iść równolegle.
4. **N3** — po N1.
5. **N5** — po N1.

### Czego nie robić

- **Nie poszerzać `tackTravel` ani nie wracać do miecza** dla autorytetu na
  bejdewindzie. M2 zmierzył dwukrotny zapas dźwigni; problemem jest przechył,
  nie autorytet.
- **Nie przyjmować wyniku przeszukiwania, którego wzorzec jest fizycznie
  niewiarygodny.** Trzy razy w bloku A wynik „wyglądał na własność łodzi", a
  był defektem pomiaru. Wiatr, który zawodzi pomiędzy dwiema działającymi
  prędkościami, kurs zerowy otoczony trzymającymi, nagła zmiana przy jednym
  TWS — to sygnały do sprawdzenia metody, nie do zapisania w snapshocie.
- **Nie zastępować `holdsCourse()` wariantem z trymem ciągłym.** N3 dokłada
  drugą metrykę; wybór między nimi jest decyzją właściciela o znaczeniu
  kryterium, nie zmianą techniczną.
- **Nie strojić pod pokrycie.** Reguła niezmieniona od K2.

### Ryzyko

**N1 może unieważnić część wniosków z bloków L i M.** Jeśli okaże się, że
L4 albo L5 pogorszyły pokrycie, trzeba będzie zdecydować, czy zostają
(realizm) czy wypadają (kryterium) — to jest napięcie między dwiema połowami
kryterium, które L4 już raz ujawnił (cień masztu zabrał 1,8 % prędkości
ostro, poprawiając fizykę). Ta decyzja należy do właściciela i lepiej ją
podjąć na liczbach niż jej uniknąć.

---

## Część IV. ADR-y należne

| ADR | temat | pozycja |
|---|---|---|
| — | N1 nie jest decyzją, tylko pomiarem: **poprawia sekcje „Measured" w ADR 0037 i 0038**, nie tworzy nowego ADR-a (ADR-y są append-only, więc korekta idzie jako erratum w treści albo nowy ADR superseding, zależnie od skali) | N1 |
| 0039 | kryterium: trym zamrożony vs trym ciągły — **tylko jeśli właściciel zdecyduje**, że definicja się zmienia | N3 |
| 0040 | napęd ostro: rozstrzygnięcie deficytu wobec Di Piazzy | N5 |
| — | N2 i N4 tylko jeśli zmienią model albo wycofają twierdzenie ADR-a | — |

---

*Reprodukcja: `harness/coverage-no-oar.js` z flagami podanymi przy pozycjach;
skrypty pomiarowe bloku A w `scratch/` (`m2_*`, `m3_*`, `l*`), scommitowane
razem z tym dokumentem.*

---

## Część V. Wykonanie (2026-08-09/10)

### N2 — cztery luki przy TWS 6. Wykonane, częściowo.

`--wide-search --dense-sheet --static-screen --twa=50,60,70,130 --tws=6`
(siatka szotu co 10° w 15-85°, 8 wartości × 3 brasy = 24 pary):

| punkt | wynik |
|---|---|
| TWA130/TWS6 | **HOLDS** (`sheet=15°, tackX=0, crewX=-0,5, stays=1`) |
| TWA50/TWS6 | NONE |
| TWA60/TWS6 | NONE |
| TWA70/TWS6 | NONE |

**Jedna luka domknięta.** Pozostałe trzy **opierają się nawet gęstej siatce
szotu** — to jest pierwszy w całym bloku A/B wynik, który NIE zmienia się
pod poszerzeniem przeszukiwania, i wzmacnia to diagnozę M2 (mechanizm jest
przechyłowy — ucieczka `phi`, nie brak odpowiedniego kąta szotu). Trzy
pozostałe NONE zaczynają wyglądać jak twierdzenie o łodzi, nie o metodzie.

*Blok `repro`: flaga `--dense-sheet` dodana do `harness/coverage-no-oar.js`.*

### N4 — rozpędzenie z martwego stanu. Wykonane; shunt bez wiosła przechodzi w pełni.

Zdiagnozowane bezpośrednio (`scratch/n4_deadstop_diag.mjs`): rampa 30 s
(ta sama, użyta do zwolnienia) **nie wywraca łódki podczas samej rampy**,
ale **wywraca ~10 s w fazę utrzymania kursu po niej** — dokładnie w chwili,
gdy łódka nabiera dość prędkości, żeby moment przechylający żagla
przegonił wciąż budujący się moment prostujący od załogi.

Zmierzony próg: rampa 30 s wywraca, 40 s przechodzi (wychylenie 0,6°),
50 s osiada w pełni (0,2°). **To jest kwestia jakości procedury, nie
granica fizyczna** — dokładnie ten sam mechanizm co przy hamowaniu w M3
(moment żagla i ciężar załogi jako przeciwwaga dla siebie), tylko jako
asymetria tempa zamiast kolejności: oddawanie mocy usuwa moment
destabilizujący (łódka jest coraz bezpieczniejsza), budowanie mocy go
dodaje (łódka jest coraz **mniej** bezpieczna, aż nabierze dość prędkości,
by własna siła boczna kadłuba nadgoniła).

**Naprawa:** osobna stała `REPOWER_RAMP_SECONDS = 45` (margines ponad
zmierzony próg 40 s) w `harness/asserts-course-change.js`, zamiast
współdzielenia jednej stałej z rampą hamowania.

**Odbiór: K3 „shunt z wiosłem wyjętym" przechodzi w pełni na obu końcach.**
Wychylenie po shuncie 0,4°, prędkość 99%, `xfail` zdjęty. **To jest pierwszy
w całej historii projektu kompletny cykl shuntu — zwolnienie, shunt,
ponowne rozpędzenie, utrzymanie kursu — z wiosłem wyjętym od pierwszego
kroku do ostatniego.**

*Zmiana w `harness/asserts-course-change.js`.*

### N5 — deficyt napędu ostro. Zdiagnozowane; celowo nie naprawione.

`scratch/n5_drive_deficit.mjs`: rozkład szczytowej siły napędowej (ta sama
wielkość, którą liczy `S4b`) na CL, CD, kąt natarcia i kąt szotowania w
punkcie szczytu, dla całego zakresu θ.

**Cień masztu (L4) nie jest przyczyną.** Piki dla θ=55/60 wypadają przy
`delta=15°/18°` — poza pasmem cienia (0-8°). To wyklucza najbardziej
oczywistego podejrzanego.

**Znalezisko głębsze, niż się spodziewałem, i nierozstrzygnięte:** przy θ=55
model wybiera punkt pracy `alphaSailor=40°, CL=1,276, L/D=2,24` — mimo że
sam profil 2D ma **zwalidowane** L/Dmax=5,40 (niemal identyczne ze źródłem,
patrz Część II.1 work orderu 08-02). Poszukiwanie szczytu siły napędowej
świadomie NIE maksymalizuje L/D — maksymalizuje `Fx` po rozłożeniu siły na
układ łodzi, co przy kursach ostrych może uzasadnione wybierać wyższe CL
kosztem L/D. To nie jest oczywisty błąd.

**Nie podjąłem próby naprawy.** Rozstrzygnięcie wymaga odpowiedzi na
pytanie, którego nie mam czym rozstrzygnąć w tej rundzie: **czy metoda
szukania szczytu w modelu (przeszukanie `delta` przy ustalonym θ,
maksymalizacja `Fx`) odpowiada temu, jak Di Piazza faktycznie wyznaczył
punkty Fig 4** — czy to ta sama procedura, czy inna (np. punkt przy stałym
trymie, nie przeszukiwanie). Część II.1 tamtego work ordera już zostawiła
otwarte dokładnie to pytanie o Fig 4 („czy `θ` to kąt wiatru pozornego i czy
`CR` jest siłą napędową czy wypadkową") i nie rozstrzygnęła go — próba
naprawy fizyki bez tej odpowiedzi byłaby dokładnie tym, przed czym ostrzega
własna reguła projektu: nie kalibrować pod niezweryfikowane źródło.

**Odbiór:** `S4b` pozostaje `xfail:CALIBRATION` z liczbami, teraz z dodanym
rozkładem CL/CD/L/D w punkcie szczytu jako materiał dla kogoś, kto rozstrzygnie
pytanie o Fig 4. Nie strojone.

*Nakład: mały (diagnoza). Naprawa: nie wykonana, wymaga rozstrzygnięcia
źródła jako warunku wstępnego.*

### N1 — dług pomiarowy: unia dwóch przeszukiwań w dwóch konfiguracjach. Wykonane.

**Odkryty po drodze, poważniejszy defekt niż to, co N1 miało zmierzyć:**
pierwszy przebieg (siatka 42 punktów z `--static-screen`, uruchomiony
równolegle dla szybkości) dał 6 punktów `NONE` tam, gdzie stary,
wąski-only snapshot (`docs/coverage-no-oar-2026-08-09.txt`) miał `HOLDS`
(TWA130/TWS4, TWA80/90/100/120/TWS6, TWA110/TWS10). To było logicznie
niemożliwe — poprawiony `--wide-search` zawsze zawiera optimum polary jako
pierwszą parę, więc jest nadzbiorem wąskiego przeszukiwania; nie może
znaleźć **mniej** trzymających punktów. Zgodnie z regułą „nie przyjmować
wyniku fizycznie niewiarygodnego" (Część III), zdiagnozowane bezpośrednio:
bezpośredni test starego dobrego triku dla TWA80/TWS6 (`tackX=1, crewX=-0,5,
sheet=16°, brail=0` — dokładnie optimum polary w tym punkcie) **trzyma
kurs** (`exc=0,8°, converged, restoring`), ale `staticScreenKeeps()` go
odrzuca. Własna walidacja tego ekranu z bloku A (`--validate-screen`, 3
punkty: TWA70/110/160) nie objęła punktu, który akurat zawiódł — próbka
była za mała, nie ekran bezpieczny. **`--static-screen` jest niebezpieczny
i nie wolno go używać do liczb, które się raportuje** (kod oznaczony
komentarzem w `harness/coverage-no-oar.js`; zostaje w pliku wyłącznie jako
materiał do dalszej pracy nad projektem ekranu).

Pełna siatka 42 punktów przeliczona ponownie **bez** `--static-screen`
(14 równoległych workerów po `(TWA-para) × config`, `--tws=4,6,10` jawnie
podany każdemu, bo poprzednia runda parallelizacji (blok B, sesja
poprzedzająca) nauczyła, że domyślna lista TWS bez jawnego `--tws=` daje
nierówny podział):

| konfiguracja | pokrycie |
|---|---|
| (a) obecna (`ce4f3fa`+, L4+L5 aktywne) | **39/42 (93 %)** |
| (b) `--no-mast-shadow` (L4 wyłączone; L5 ma dowiedziony zerowy wpływ — patrz N1c niżej, więc (b) reprezentuje też „L4+L5 wyłączone") | **40/42 (95 %)** |

**Delta per pasmo** (żeby handel nie zniknął w liczbie zbiorczej, tak jak
przy K5):

| pasmo | (a) obecna | (b) bez cienia masztu |
|---|---|---|
| 50-70 (bejdewind) | 6/9 | 7/9 |
| 80-130 | 18/18 | 18/18 |
| 140-160 | 9/9 | 9/9 |
| 170-180 | 6/6 | 6/6 |

**Cały efekt L4 na kryterium siedzi w jednym punkcie: TWA50/TWS6.** Z
cieniem masztu ten punkt jest `NONE`, bez niego — `HOLDS`
(`tackX=-0,5, crewX=0, stays=1, sheet=55°, brail=0, exc=0,0°, v=100 %`).
Poza tym jednym punktem obie konfiguracje są identyczne co do zera
(wszystkie pozostałe 41 punktów zgodne HOLDS/NONE między (a) i (b), łącznie
z trzema pozostałymi z N2: TWA50/60/70/TWS6 — patrz niżej).

**N1c (pitch, L5) — zredukowane, nie wykonane jako osobny przebieg.**
Zamiast trzeciej, drogiej konfiguracji „przed L4 i L5" zmierzono
analitycznie i empirycznie (`scratch/n1c_pitch_settling.mjs`), że pitch
osiada w ~0,4 s wobec najkrótszego istotnego okna testowego (10-45 s) —
przy stanie ustalonym `pitchClrCoeff·theta ≡ crewForeAftTrimCoeff·crewPosX`
dokładnie, więc L5 **z definicji** nie może zmienić wyniku żadnej metryki
opartej na `holdsCourse` (albo `holdsCourseActiveTrim`). To czyni
konfigurację (c) zbędną wobec (b) — dowód analityczny, nie pominięcie.

**Trzy pozostałe `NONE` (TWA50/60/70/TWS6) potwierdzone w obu
konfiguracjach jako te same punkty co po N2** — gęstsza siatka szotu (N2)
i pełne przeszukanie wide-search dają identyczny wynik na tych trzech.
To jest teraz **trzeci niezależny przebieg** (N2 gęsty szot, N1 pełna unia
×2 konfiguracje), który nie zamyka tych trzech punktów — najsilniejszy
dotąd sygnał, że to własność łodzi (mechanizm z M2: przechył, nie brak
odpowiedniego kąta szotu), nie defekt metody.

**Odbiór: trzy liczby (a, b — c uznane za zbędne z dowodem) i delta per
pasmo, obie dostarczone.** ADR 0037 i 0038 skorygowane niżej.

*Kod: komentarz-ostrzeżenie o `--static-screen` w
`harness/coverage-no-oar.js`. Skrypty: `scratch/verify_regression.mjs`,
`scratch/verify_regression2.mjs` (izolacja fałszywego odrzucenia),
`scratch/n1c_pitch_settling.mjs`.*

### N3 — wariant predykatu z trymem ciągłym. Wykonane; wynik niejednoznaczny, zaraportowany bez upiększeń.

`holdsCourseActiveTrim()` w `harness/asserts-helpers.js` — drugi predykat
obok `holdsCourse()`, korekta co 10 s, krok ≤0,1, `tackX` proporcjonalnie do
błędu kursu, `crewPos` proporcjonalnie do przechyłu (mechanizm z M2).

**Test punktowy (TWA70/TWS6) wyglądał obiecująco:** zamrożony trym wywraca
łódkę (`restoring=false, capsized=true`), aktywny — nie (`restoring=true,
capsized=false`). Strojenie interwału/kroku (`scratch/n3_tune.mjs`, 6
kombinacji) dało **zawsze ten sam wynik niezależnie od agresywności
korekty** — `tackX` osiada na granicy −1, wychylenie stabilizuje się na
~54°. To nie jest kwestia słabego strojenia: korekta wyczerpuje dostępny
zakres sterowania i osiada w nowej, prawdziwej (zbieżnej, przywracającej)
równowadze, która po prostu leży ~54° od celu.

**Pełne porównanie na wszystkich 9 punktach bejdewindu**
(`scratch/n3_beat_comparison.mjs`, trym startowy `tackX=0` — ten sam, którego
użył M2, nie wynik przeszukiwania):

| | zamrożony (`holdsCourse`) | aktywny (`holdsCourseActiveTrim`) |
|---|---|---|
| trzyma się (≤15°, ≥50% prędkości, zbieżny, przywracający) | **0/9** | **0/9** |
| wywrotki | 3/9 (wszystkie TWS 6) | **0/9** |
| prędkość przy TWS 6 (uśredniona) | 0% | 26-33% |
| wychylenie końcowe | 4,8-53,2° | 37,5-54,8° (**gorsze na 8/9 punktów**) |

**Uczciwy wniosek, inny niż sugerował pojedynczy test:** aktywna korekta
**konsekwentnie zapobiega wywrotce** i **konsekwentnie poprawia zachowanie
prędkości** — to potwierdza przyczynowo mechanizm z M2 (przesunięcie
załogi z amy do środka realnie chroni pływak). Ale **nie zamyka kursu w
paśmie 15° na żadnym z 9 punktów** przy tym prostym prawie proporcjonalnym
i tym punkcie startowym — `tackX` osiada na granicy na 9/9 punktów, co
sugeruje, że prawo korekty albo start z `tackX=0` (a nie z trymu, który K2
już znalazł jako trzymający) są złym testem dla „czy trym ciągły ratuje
bejdewind", nie dowodem, że nie ratuje.

**Dwie liczby, obie zmierzone, żadna nie jest zwycięska:** 0/9 vs 0/9 na
kryterium przejścia, ale jakościowo różne porażki (wywrotka vs bezpieczne,
lecz szerokie zejście z kursu). **Decyzja, czy i jak zdefiniować kryterium
kursu ciągłego, pozostaje przy właścicielu** — zgodnie z własnym zapisem
odbioru tej pozycji. Nie rozstrzygam jej implementacją ani nie tuningu
dalej, żeby wymusić przejście.

*Nakład: średni. Kod: `harness/asserts-helpers.js` (`holdsCourseActiveTrim`,
nowa funkcja, nie zastępuje `holdsCourse`).*
