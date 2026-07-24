# Odpowiedź na review dojrzałości z 2026-07-22

*Last reviewed: 2026-07-22*
*Dotyczy: `docs/review-2026-07-22-maturity.md`. Stan po commicie `59b589e`.*

---

## Werdykt

Sprawdziłem każdy weryfikowalny zarzut osobno, w kodzie. **Nie znalazłem ani
jednego fałszywego.** Teza review — że wartość merytoryczna jest wysoka, ale
nic jej nie chroni automatycznie — jest trafna i była trafna także wobec mojej
własnej pracy w tej rundzie.

W jednym miejscu review jest **zbyt łagodny** (pkt 2), w jednym bym się
**różnił co do uzasadnienia** (pkt 5), a trzy zgłoszone problemy **sam
wprowadziłem lub utrwaliłem** (pkt 2, 6, 12).

## Zrealizowane w `59b589e`

| pkt | rzecz | jak zweryfikowane |
|-----|-------|-------------------|
| 1 | `node run_tests.js` w CI, scaffold Playwrighta usunięty | nowy `.github/workflows/ci.yml` |
| 2 | `CODE_VERSION` z markerem `+dirty` | czyste drzewo → `96b833b`; brudne → `96b833b+dirty` |
| 4 | bramka „bundle zgodny ze źródłami" | test negatywny: przechodzi na czystym, **pada** po zmianie źródła bez przebudowy |
| 6 | `SWEEP_CI` / `SWEEP_FULL` nazwane w `harness/polar.js` + poprawka README | `out/polar.csv` regeneruje się bajt w bajt identycznie |
| 12 | szeroki wzorzec `python3 -c` usunięty z `settings.json` | drzewo czyste |

Pakiet: **80/80**.

## Punkt 2 jest poważniejszy, niż opisano

Review nazywa to „wskazywaniem na commit-rodzica". To nie jest przesunięcie
o jeden — to **fałszywa deklaracja pochodzenia**:

```
commit 96b833b: CODE_VERSION = "1d64cea"
bundle w 96b833b zawiera symbol polarValidityKey → 6 wystąpień
polarValidityKey powstał w 96b833b
```

Bundle deklaruje pochodzenie z commita, w którym zawartego w nim kodu jeszcze
nie było. Nagranie zrobione z takiego builda niesie `codeVersion`, którego
replay nie odtworzy — czyli dokładnie sytuację, przed którą ostrzega
`harness/replay.js`.

Przyczyną nie jest sam mechanizm, tylko to, że źródła i przebudowany `dist/`
lądują w **jednym** commicie. Dlatego naprawa to marker `+dirty`, a nie hook
`post-commit`: rozbicie na dwa commity wywaliłoby bramkę z pkt 4 na tym
pierwszym.

**Zastrzeżenie do mojej wcześniejszej pracy:** w commicie `17b5f75`
napisałem, że *naprawiam* nieaktualny stempel. Nie naprawiłem. Trafiłem na
commit, w którym `ui/app.js` się nie zmienił, więc stempel był tam
przypadkiem nieszkodliwy — i uogólniłem systematyczną wadę z jednego łagodnego
przypadku.

## Gdzie się różnię — punkt 5

Zgadzam się co do działania, nie co do uzasadnienia, i dlatego **nie
wykonałem go bez potwierdzenia**.

Rozmiar nie jest tu problemem: `.git` ma 33 MB, co jest repozytorium
komfortowo małym. Prawdziwy koszt jest inny — regenerowany plik śledzony przez
gita **zamazuje sygnał**: po każdym przebiegu testów `git status` brudzi się
12 MB szumu i realna zmiana w nim ginie.

Ale sprawa nie jest zerojedynkowa. To właśnie zacommitowany `out/polar.csv`
pozwolił wyłapać regresję, gdy usunięcie `crewPos=1.0` z siatki obcięło
prędkości o 6-9 % przy 10 m/s. Gdyby był w `.gitignore`, zmiana przeszłaby
niezauważona.

**Propozycja:** ignorować `out/` **poza `polar.csv`**. Ten jeden plik jest
tani i pełni rolę migawki referencyjnej.

## Ograniczenie bramki z pkt 4

Bramka działa w CI, na `push`/`pull_request` do `main`. **Nie obejmuje
`tools/sync-demo.sh`**, który buduje z drzewa roboczego i pcha do osobnego
repo dema (`simpjoa-demo`, GitHub Pages) — ręcznie, poza CI.

Skutek jest jednak lepszy niż przed zmianą: skrypt przebudowuje bundle przed
wysłaniem, więc po naprawie stempla demo zbudowane z brudnego drzewa oznaczy
się jako `+dirty`, zamiast podawać cudzy hash.

## Co pozostaje

Kolejność wg stosunku wartości do kosztu:

1. **pkt 8 — `CLAUDE.md` opisuje inny projekt.** Najtańszy i najbardziej
   dokuczliwy: mówi o Kotlin Multiplatform, ONNX, Firebase i branchu
   `feature/kmp-migration`, i każe czytać nieistniejący `ARCHITECTURE.md`.
   Ładuje się na starcie każdej sesji.
2. **pkt 9 — `npm test`.** Jedna linia w `package.json`.
3. **pkt 14 — `reset()` nie zeruje `lastForces`.** Kilka znaków, realna
   niespójność fasady.
4. **pkt 3 — `abackWarning`.** Decyzja: przepuścić przez `integrate()` albo
   usunąć i poprawić komentarz sygnatury.
5. **pkt 7 — podział szybki/wolny pakiet.** Wymaga rozdzielenia eksportu CSV
   i sweepu od asercji; teraz, gdy CI faktycznie testuje, waga rośnie.
6. **pkt 11, 13, 10** — archiwizacja rund, podział monolitów, lint/typy.

## Uwaga metodologiczna

Review pisze, że gwarancja jakości opiera się na tym, że ktoś pamięta o
uruchomieniu testów. Ta runda dostarczyła dwa niezależne potwierdzenia, że
sam pakiet też nie wystarcza:

- zmiana w `rollRestoreMoment`, oparta na błędnej diagnozie, przeszła **80/80**
  — asercje nie pokrywają reżimu głęboko zanurzonej amy;
- usunięcie `crewPos=1.0` przeszło asercje i zostało wychwycone dopiero przez
  diff `out/polar.csv` — bo asercje nie sięgają 10 m/s.

Oba wyłapały pomiary i zacommitowane artefakty, nie testy. To argument za
punktem 5 w wersji „ignoruj `out/` poza `polar.csv`", a nie za usunięciem
całości.
