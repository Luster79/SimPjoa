# Lista poprawek do wykonania

*Last reviewed: 2026-07-22*
*Źródła: `docs/review-2026-07-22-maturity.md` (punkty otwarte),
`docs/review-2026-07-22-response.md`, `docs/diagnostic-2026-07-22-residuary-hump.md`.*

Jeden plik zbiera wszystko, co pozostaje do zrobienia. Numeracja `R*` odsyła do
punktów review, `P*` to pozycje z diagnostyki fizyki. Każda pozycja ma
**kryterium odbioru** — warunek sprawdzalny, nie „zrobione".

---

## Protokół dla zmian ruszających polarę

Od commita `1e1ab8b` CI porównuje `out/polar.csv` bajt w bajt. Każda pozycja
oznaczona **[rusza polarę]** z definicji wywali tę bramkę raz. To jest
zaprojektowane zachowanie, nie awaria: przeglądasz diff, i jeśli jest
zamierzony, commitujesz przeliczony plik razem ze zmianą. Nie obchodzić bramki.

Uwaga na kolejność: **P2 musi wyprzedzić P1.** Dopóki bramka `settled`
odfiltrowuje szybkie trymy, polara nie widzi gałęzi, którą P1 modyfikuje — więc
diff po P1 byłby nieczytelny i mierzyłbyś skutek na przefiltrowanych danych.

---

## A. Fizyka i pomiar

### P2. Bramka `settled` odrzuca zbieżne trymy **[rusza polarę]**
`harness/polar.js`, `simulateToSteady()`. `maxSeconds = 25` minus 10 s
wymaganej stabilności zostawia 15 s na rozpęd, który trwa dłużej. Przy
TWA 100 / TWS 6 odrzuca 7.38 m/s (identyczne przy 25 s i przy 400 s) i
raportuje 4.36.

*Naprawa:* podnieść `maxSeconds`, albo oceniać zbieżność po nachyleniu
w oknie końcowym zamiast wymagać 10 kolejnych stabilnych sekund.

**Odbiór:** przy TWA 100 / TWS 6 polara raportuje wartość zgodną z 400-sekundowym
przebiegiem tego samego trymu (±2 %). Koszt przebiegu pakietu nie rośnie
więcej niż 2×, albo rośnie tylko w `SWEEP_FULL` (patrz R7).
*Nakład: mały. Zależności: brak.*

### P1. Ogon członu falowego zanika do zera **[rusza polarę]**
`core/hydro.js`, `hullResistance()`. `Cr` spada 2200× poniżej szczytu do Fr 1.0,
przez co opór całkowity **maleje** z 209 N przy 4.5 m/s do 155 N przy 6.0 m/s.
To daje dwie stabilne gałęzie prędkości przy TWA 125-137.

Mechanizm jest zamierzony — [ADR 0001](adr/0001-slender-hull-residuary-model.md)
nazywa go „hump speed gear-change ... not a bug to eliminate". **Sporna jest
kalibracja ogona, nie decyzja.** Histereza ginie przy plateau ≥ 0.10, przeżywa
przy 0.05; model stoi na zerze.

*Naprawa:* plateau dla `Fr > residuaryFrPeak`. Wymaga **nowego ADR (0006)**
supersedującego kalibrację 0001 — 0001 jest append-only.

**Odbiór:** opór całkowity niemalejący w 3-9 m/s. Test histerezy (TWA 135,
u0 = 1.0 vs 6.5, 400 s) daje tę samą prędkość ±0.05 m/s. Prędkość na półwietrze
przy TWS 6 nie przekracza ~12.5 w. ADR 0006 istnieje.
*Nakład: średni — sama zmiana jest mała, przeliczenie pasm akceptacyjnych nie.
Zależności: **po P2**.*

### P3. Asercja gładkości polary stoi na obalonym uzasadnieniu
`harness/asserts.js:238`. Awansowana z `xfail:CALIBRATION` w rundzie 10 na tezie
*„the boat just doesn't reach it anymore at this sail power"*. Łódka dociera;
asercja jest zielona, bo dane są przefiltrowane przez P2.

*Naprawa:* po P2 i P1 rozstrzygnąć, czy urwisko wróciło. Jeśli tak — z powrotem
`xfail:CALIBRATION` z aktualną diagnozą. Jeśli nie — przepisać komentarz, bo
obecny podaje nieprawdziwy powód.

**Odbiór:** komentarz przy asercji opisuje stan potwierdzony pomiarem po P1/P2.
*Nakład: mały. Zależności: **po P1 i P2**.*

### P4. Shunt nie wymaga zatrzymania
`core/config.js`, `shunt.speedLockout = 4` m/s — pozwala shuntować przy 7.8 w.
Literatura jest zgodna, że proa staje całkowicie, a załoga fizycznie przenosi
piętę rei; całość sekwencji to 5.0 s w modelu.

*Naprawa:* obniżyć `speedLockout` i wydłużyć fazy. Zmienia taktykę kursów
pełnych, więc warto po P1.

**Odbiór:** scenariusz shuntu w `harness/scenarios.js` nadal przechodzi;
udokumentowana podstawa dobranych wartości.
*Nakład: mały. Zależności: sensowniej po P1.*

### P5. Brak fal nie ma odnotowanego skutku
`README.md` notuje *„No waves or current"*, ale nie wyciąga wniosku: fala
podnosząca rufę to główna przyczyna myszkowania na kursach pełnych, więc
stabilne bezsterowe trzymanie kursu w modelu nie przenosi się na wodę.

**Odbiór:** jedno zdanie w sekcji ograniczeń.
*Nakład: trywialny. Zależności: brak.*

---

## B. Zaufanie do testów i buildu

### R15. Pakiet asercji nie wykrywa zmian modelu
Największa otwarta luka — CI opiera werdykt na pakiecie, który nie widzi zmiany
`sail.area` o 2 % ruszającej 42 z 43 wierszy polary. Cztery potwierdzenia,
w tym P3 powyżej (asercja awansowana na obalonej tezie — najostrzejszy przypadek,
bo zielony test czyta się jako dowód).

*Naprawa:* kilka wąskich asercji na wartości bezwzględne przy 10 m/s i w reżimie
zanurzonej amy. Bramka na `out/polar.csv` już istnieje i część roli przejmuje,
ale jest tripwire'em, nie asercją — nie mówi, *co* się zepsuło.

**Odbiór:** `sail.area` +2 % wywala co najmniej jedną asercję z komunikatem
wskazującym wielkość fizyczną.
*Nakład: średni. Zależności: po P1 (inaczej kotwiczysz pasma na wartościach,
które P1 zmieni).*

### R2. Stempel `CODE_VERSION` nie identyfikuje buildu
Marker `+dirty` uczynił stempel *uczciwym*, ale nie *identyfikującym* —
`96b833b+dirty` nigdy nie zrówna się z żadnym checkoutem, więc `harness/replay.js`
ostrzega przy każdym nagraniu z dema. Cel z README („tie a recording to an exact
build") pozostaje nieosiągnięty.

*Decyzja do podjęcia:* hook `post-commit`, albo wyprowadzenie `dist/` z repo
i budowanie w CI. Argument, że hook wywali bramkę z pkt 4, **nie trzyma się** —
bramka wycina stempel przed porównaniem.

**Odbiór:** nagranie z opublikowanego dema replayuje się bez ostrzeżenia o wersji.
*Nakład: średni, głównie decyzyjny.*

### R7. Czas przebiegu wypycha testy z pętli
~99 s asercji + eksport CSV + sweep polary. Waga rośnie, odkąd CI faktycznie
testuje, i wzrośnie znowu po P2.

*Naprawa:* rozdzielić szybki pakiet (asercje) od wolnego (sweep + eksport).

**Odbiór:** szybki pakiet poniżej ~20 s; wolny osobną komendą i osobnym jobem CI.
*Nakład: średni. Zależności: warto po P2, bo P2 zmienia budżet czasu.*

### R9. Brak `npm test`
`package.json` ma `"scripts": {}`. **Odbiór:** `npm test` uruchamia pakiet.
Naturalnie łączy się z R7 (`test` / `test:full`).
*Nakład: trywialny.*

---

## C. Kod i higiena

### R14. `reset()` nie zeruje `lastForces`
`core/simulator.js:40-43`. Po resecie fasada oddaje siły z poprzedniego przebiegu.
**Odbiór:** asercja — po `reset()` `forcesBreakdown()` równa się stanowi
początkowemu. *Nakład: trywialny.*

### R3. `abackWarning` jest martwym kodem
Liczony w `core/stability.js:207`, nigdy nie przechodzi przez `integrate()`.
*Decyzja:* przepuścić albo usunąć i poprawić komentarz sygnatury. Wygląda na
żywy, co jest gorsze niż jego brak.
**Odbiór:** albo UI go czyta, albo nie ma go w kodzie. *Nakład: mały.*

### R8. `CLAUDE.md` opisuje inny projekt
Mówi o Kotlin Multiplatform, ONNX, Firebase, branchu `feature/kmp-migration`
i każe czytać nieistniejący `ARCHITECTURE.md`. Ładuje się na starcie każdej sesji.
**Odbiór:** każde zdanie o strukturze projektu daje się sprawdzić w repo.
*Nakład: mały, wartość wysoka.*

### R11. Zaśmiecony root
11 plików `.md` w korzeniu, w tym 6 raportów rund. Konwencja `Archive/` istnieje,
ale rundy 10c, 10d i 11 przez nią nie przeszły. **Odbiór:** w korzeniu zostają
`README.md`, `CLAUDE.md`, `ARCHITECTURE_physics_core_EN.md`, `PROMPT_*`.
*Nakład: mały.*

### R13. Monolity
`ui/app.js` 2734 linie, `harness/asserts.js` 1498. Podział przed dalszą rozbudową.
*Nakład: duży. Bez pilności.*

### R10. Brak lintera, formatera i type-checkingu
`@types/node` jest w zależnościach, nic go nie używa. *Nakład: średni.*

### R5 — WYCOFANE
Założenie, że `out/` generuje szum w `git status`, jest nieprawdziwe: po pełnym
przebiegu drzewo jest czyste, pliki są deterministyczne. Korzyść (tripwire) jest
realna i zautomatyzowana. Zostaje w repo. *Nie robić.*

---

## Sugerowana kolejność

| # | pozycja | dlaczego tu |
|---|---|---|
| 1 | **P2** | odblokowuje wszystko inne w fizyce; jedna zmiana |
| 2 | **R8, R9, R14, P5** | trywialne, niezależne, robić przy okazji |
| 3 | **P1** + ADR 0006 | rdzeń problemu; dopiero gdy polara widzi prawdę |
| 4 | **P3, P4** | domknięcie skutków P1/P2 |
| 5 | **R15** | pasma kotwiczyć dopiero na poprawionym modelu |
| 6 | **R7, R2** | zaufanie do pętli i do buildu |
| 7 | **R3, R11, R13, R10** | higiena |

Pozycje 1 i 2 są bezpieczne do zrobienia od ręki. Pozycja 3 wymaga decyzji
o wartości plateau — próg leży między 0.05 a 0.10, ale konkretna wartość powinna
być uzasadniona literaturą oporu kadłubów smukłych, nie dobrana pod próg.
