# Review projektu — stan dojrzałości i zalecenia

*Last reviewed: 2026-07-22*
*Zakres: cały projekt na commicie `96b833b`. Kod, testy, build, CI, dokumentacja, higiena repo.*
*Uzupełnione po `f9920bf`: pkt 15 oraz sekcja „Stan realizacji" — patrz
`review-2026-07-22-response.md` po stronę wykonawczą.*

---

## Ocena ogólna

Projekt jest **rozdwojony pod względem dojrzałości**:

- **Rdzeń fizyczny + harness weryfikacyjny — dojrzały.** `core/` to ~2000 linii
  bezzależnościowych modułów ES z wyjątkowo dobrą dyscypliną: każda nietrywialna
  decyzja ma udokumentowaną derywację, odwołanie do rundy, która ją wprowadziła,
  i często zapis co próbowano wcześniej i dlaczego nie zadziałało. 80/80 asercji
  przechodzi, jedna znana granica jest jawnie oznaczona jako `xfail` z mechanizmem
  „promotion candidate" (xfail, który zaczyna przechodzić, wywala build zamiast po
  cichu zzielenieć). Jest test determinizmu bit-po-bicie, guard przed dywergencją
  numeryczną, 5 ADR-ów, dane wejściowe zakotwiczone w publikacjach.
- **Obudowa inżynierska — prototyp.** CI nic nie testuje, build cicho się rozjeżdża,
  repo nosi kilkanaście MB wygenerowanych danych, brak `npm test`, lintera
  i type-checkingu, a `CLAUDE.md` opisuje zupełnie inny projekt.

**Teza:** wartość merytoryczna jest wysoka, ale nic jej nie chroni automatycznie.
Cała gwarancja jakości opiera się dziś na tym, że ktoś ręcznie pamięta o uruchomieniu
`node run_tests.js`. To jest największe ryzyko projektu — nie jakość samego modelu.

---

## Zalecenia

### Krytyczne

- [x] **1. CI nie testuje tego projektu.**
  `.github/workflows/playwright.yml` uruchamia `npx playwright test`, a jedyny test to
  `tests/example.spec.js` — nietknięty scaffold Playwrighta, który wchodzi na
  `playwright.dev` i sprawdza tytuł ich strony. Prawdziwy pakiet (80 asercji,
  `node run_tests.js`) **nie jest w CI w ogóle**.
  Podwójny efekt: zielone CI nie znaczy nic, a jednocześnie build może się wywalić
  z powodu niedostępności cudzej strony.
  *Naprawa:* wpiąć `node run_tests.js` do workflow; usunąć scaffold albo zastąpić
  go realnym smoke-testem UI.

- [ ] **2. `CODE_VERSION` w zbudowanym bundlu systematycznie wskazuje na commit-rodzica.**
  `tools/bundle.js:128` woła `git rev-parse --short HEAD` w momencie budowania —
  czyli **przed** commitem, który ten bundle zawiera.

  Zweryfikowane na czterech commitach z rzędu:

  | commit    | bundle deklaruje | rodzic    |
  |-----------|------------------|-----------|
  | `96b833b` | `1d64cea`        | `1d64cea` |
  | `1d64cea` | `17b5f75`        | `17b5f75` |
  | `17b5f75` | `bc59811`        | `bc59811` |
  | `581d8e0` | `3bd59b0`        | `b42c6d9` |

  To wywraca cały cel tego pola. `harness/replay.js` ostrzega o niezgodności
  `codeVersion`, a stopka wersji ma wiązać zgłoszenie błędu z konkretnym buildem —
  wiąże z niewłaściwym, zawsze o jeden wstecz. Nagrania z dema są tym samym
  przekłamane. (Uwaga: `581d8e0` rozjeżdża się inaczej niż o dokładnie jeden commit,
  co sugeruje że bundle bywał budowany na nie do końca aktualnym drzewie.)
  *Naprawa:* budować bundle w hooku `post-commit`, albo stemplować hash po commicie.

### Dopisane po weryfikacji (stan po `f9920bf`)

- [ ] **15. Pakiet asercji nie wykrywa realnych zmian w modelu.**
  Nowy punkt, nieobecny w pierwotnym review — wyszedł dopiero przy weryfikacji
  odpowiedzi. Waga: **krytyczna**, i rosnąca, bo od `59b589e` CI opiera swój
  werdykt właśnie na tym pakiecie.

  Trzy niezależne potwierdzenia:

  1. Zmiana w `rollRestoreMoment` oparta na błędnej diagnozie przeszła **80/80**
     — asercje nie pokrywają reżimu głęboko zanurzonej amy.
     *(zgłoszone w `review-2026-07-22-response.md`)*
  2. Usunięcie `crewPos=1.0` z siatki wyszukiwania obcięło prędkości o 6-9 %
     przy 10 m/s, przeszło asercje i zostało wychwycone dopiero przez diff
     `out/polar.csv` — asercje nie sięgają 10 m/s.
     *(jw.)*
  3. **Zmierzone przy tym review:** `sail.area` +2 % — zmiana jednoznacznie
     fizyczna — porusza **42 z 43** wierszy `out/polar.csv`, a mimo to
     przechodzi **80/80 asercji bez jednej porażki**.

  Wniosek: pakiet dobrze pokrywa *jakościowe* własności (ciągłość przy shuncie,
  kierunek sterowania, determinizm, kolejność zdarzeń przy wywrotce), ale prawie
  nie ma asercji *ilościowych* zakotwiczonych na tyle ciasno, żeby wykryć
  przesunięcie kalibracji. Pasma są ustawione na 4/6 m/s i szerokie.

  *Kierunek naprawy:* kilka wąskich asercji na wartości bezwzględne przy 10 m/s
  i w reżimie zanurzonej amy — albo, taniej, uznanie diffu `out/polar.csv` za
  formalną część kontraktu testowego (zrobione w CI, patrz pkt 1) i
  udokumentowanie tego jako świadomej decyzji, a nie przypadku.

### Średnie

- [ ] **3. `abackWarning` jest martwym kodem, który wygląda na żywy.**
  `core/stability.js:207` liczy go i zwraca, ale `core/integrator.js:192-197`
  nie przepuszcza go do stanu. UI (`ui/app.js:1753`) i asercje (`harness/asserts.js:1044`)
  wyprowadzają warunek `phi<0 && Msail<0` niezależnie, u siebie. Nikt nigdy nie czyta
  zwróconej wartości. Sygnatura w komentarzu na `stability.js:141` obiecuje pole,
  którego nie da się użyć — ktoś sięgnie po `state.abackWarning` i dostanie `undefined`.
  *Naprawa:* albo przepuścić przez `integrate()`, albo usunąć z `updateAback()`
  i poprawić komentarz sygnatury.

- [x] **4. Bundle jest commitowanym artefaktem budowania i cicho się rozjeżdża.**
  `dist/simulator_standalone.html` (300 KB) jest w repo, ale **nic nie weryfikuje,
  że odpowiada źródłom**. W momencie review był niezgodny w drzewie roboczym.
  To samo dotyczy `tools/sync-demo.sh`, które pcha ten plik na publiczne GitHub Pages —
  bez żadnej bramki.
  *Naprawa:* bramka w CI — przebuduj i sprawdź czy diff pusty (ignorując stempel wersji).

- [ ] **5. Repo nosi ~16 MB wygenerowanych danych.**
  `out/*.csv` = 12,6 MB (w pełni odtwarzalne przez `node run_tests.js`),
  `recordings/` = 3,5 MB, `dist/` = 300 KB. `.git` ma już 33 MB.
  Każdy przebieg testów przepisuje te 12 MB CSV, a git je śledzi — historia puchnie
  przy każdej rundzie.
  *Naprawa:* `out/` do `.gitignore`. Nagrania i bundle to osobna decyzja (są celowo
  dystrybuowane), ale warto je świadomie potwierdzić.

- [x] **6. Siatka polara rozjeżdża się między harnessem a UI.**
  `run_tests.js:57` używa `twsList: [4, 6, 10]`, `ui/app.js:2273` używa `[4, 6, 8, 10]`.
  `out/polar.csv` ma 41 wierszy danych, UI produkuje 56. README twierdzi przy tym,
  że tryb polara uruchamia *„the same expensive grid-search sweep `run_tests.js` runs"* —
  nie ten sam, nadzbiór.
  *Naprawa:* wspólna stała siatki, albo poprawka README.

- [ ] **7. Czas przebiegu wypycha testy z pętli.**
  Zmierzone: same asercje to **~99 s**, do tego 5 scenariuszy CSV i sweep polara —
  pełne `node run_tests.js` to kilka minut. Nie ma podziału na szybki/wolny zestaw,
  więc w praktyce uruchamia się to rzadko, co dodatkowo podnosi wagę punktu 1.
  *Naprawa:* rozdzielić na szybki zestaw asercji (bez eksportu CSV i polara)
  i pełny przebieg; ten pierwszy na każdy push, drugi nocnie / na tagach.

### Higiena

- [ ] **8. `CLAUDE.md` opisuje inny projekt.**
  Sekcja 5 mówi o Kotlin Multiplatform, MVVM/Clean, silniku bitewnym ONNX,
  multiplayerze na Firebase i branchu `feature/kmp-migration`, i każe czytać
  `ARCHITECTURE.md` — którego nie ma (jest `ARCHITECTURE_physics_core_EN.md`).
  To zostałość szablonu.
  Ironicznie: sekcja 6 tego samego pliku definiuje ładny warstwowy model dokumentacji
  (`docs/<area>.md`), który nigdy nie został wdrożony — `docs/` zawiera tylko `adr/`
  i screenshoty.

- [ ] **9. Brak `npm test`.** `package.json` ma `"scripts": {}`. Wszystkie komendy
  żyją tylko w prozie README.

- [ ] **10. Brak lintera, formatera i type-checkingu.** `@types/node` jest
  w devDependencies, ale nie ma tsconfig ani `// @ts-check` w `core/` — jedyne pliki
  z `@ts-check` to te ze scaffoldu Playwrighta.

- [ ] **11. Zaśmiecony root.** 11 plików `.md` w korzeniu, w tym 6 raportów
  `ROUND*`/`DIAGNOSTIC*`. Konwencja archiwizowania po rundzie istnieje
  (`Archive/` ma 16 plików), ale rundy 10c, 10d i 11 przez nią nie przeszły.

- [x] **12. `.claude/settings.json` dodaje `"Bash(python3 -c ' *)"`.**
  W praktyce zgoda na wykonanie dowolnego kodu Pythona, i to w ustawieniach
  *projektowych* (współdzielonych), nie lokalnych. (Zmiana niezacommitowana
  w momencie review.)
  *Naprawa:* zawęzić wzorzec albo przenieść do `settings.local.json`.

- [ ] **13. Monolity.** `ui/app.js` — 2734 linii, `harness/asserts.js` — 1498 linii
  / 92 KB, `core/config.js` — 746 linii. Przy `core/` podział jest czysty, ale te
  trzy pliki już utrudniają nawigację.

- [ ] **14. `core/simulator.js:40-43` — `reset()` nie zeruje `lastForces`**,
  więc `forcesBreakdown()` zwraca siły sprzed resetu aż do następnego `step()`.
  W żywym UI niewidoczne (step co klatkę), ale to realna niespójność fasady.

---

## Stan realizacji

Zamknięte w `59b589e` (zweryfikowane niezależnie, nie przyjęte na słowo):
**1** (CI uruchamia `run_tests.js`, scaffold usunięty), **4** (bramka zgodności
bundla — testy pozytywny i negatywny), **6** (`SWEEP_CI`/`SWEEP_FULL` + README),
**12** (wzorzec `python3 -c` usunięty).

Zamknięte później: **pkt 1 rozszerzony** o bramkę na `out/polar.csv`
(negatywny test przechodzi; osobno zmierzono czułość — `sail.area` +2 % rusza
42 z 43 wierszy).

Częściowo: **2** — marker `+dirty` czyni stempel *uczciwym*, ale nie
*identyfikującym*. Wydany bundle nosi `96b833b+dirty`, co nigdy nie zrówna się
z żadnym checkoutem, więc `harness/replay.js` będzie ostrzegać przy każdym
nagraniu z każdego dema. Cel z README („tie a recording to an exact build")
pozostaje nieosiągnięty. Uwaga: argument przeciw hookowi `post-commit`
(„wywali bramkę z pkt 4") **nie trzyma się** — bramka wycina stempel przed
porównaniem, co sprawdzono.

Wycofane: **5** — założenie, że `out/` generuje szum w `git status`, jest
**nieprawdziwe**. Po pełnym `node run_tests.js` drzewo jest czyste; pliki są
deterministyczne. Koszt to wyłącznie rozmiar historii, a korzyść (tripwire,
pkt 15) jest realna i teraz zautomatyzowana.

## Sugerowana kolejność dalej

1. **pkt 15 — czułość pakietu asercji.** Największa otwarta luka: CI ufa
   pakietowi, który nie widzi zmiany `sail.area` o 2 %.
2. **pkt 8 — `CLAUDE.md` opisuje inny projekt.** Najtańszy, ładuje się na
   starcie każdej sesji.
3. **pkt 2 — dokończyć stempel.** Wymaga decyzji: hook `post-commit` czy
   wyprowadzenie `dist/` z repo i budowanie w CI.
4. **pkt 9, 14, 3** — drobne, szybkie (`npm test`; `reset()` i `lastForces`;
   rozstrzygnięcie `abackWarning`).
5. **pkt 7** — podział szybki/wolny pakiet; waga rośnie, odkąd CI faktycznie
   testuje.
6. **pkt 11, 13, 10** — archiwizacja rund, podział monolitów, lint/typy.
