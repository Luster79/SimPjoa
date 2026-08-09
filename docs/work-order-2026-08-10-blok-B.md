# Lista poprawek — blok B: dług pomiarowy, cztery luki i pytanie o kryterium

*Last reviewed: 2026-08-09*
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
