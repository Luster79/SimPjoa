# Kryteria Akceptacji – Zachowanie łodzi typu pjoa w symulatorze

Źródło merytoryczne: „Elementarz żeglowania po Mikronezyjsku" (pjoa.eu), rozdziały III–V.
Oryginał w repozytorium: `docs/sources/` (wersja PL i EN).

> **Errata (2026-08-03), sprawdzona przeciwko oryginałowi.** AC-1.2 poniżej jest
> błędne w dwóch miejscach. Oryginał (EN, rozdz. III) mówi:
> *„If crew moves toward outrigger, the canoe turns to **windward** … because
> the ama sinks (creates drag) and rotates the canoe around"* oraz *„If crew
> moves to the sail, then canoe turns to **leeward** … as the ama rises slightly
> and **reduces rotational force**"*.
> Czyli (a) ruch w stronę kadłuba powoduje **odpadanie**, a nie ostrzenie, i
> (b) to **nie jest inny mechanizm** — to ten sam moment od oporu amy, tylko
> mniejszy. Reakcja jest **antysymetryczna**, nie parzysta.
> Treść AC-1.2 zostawiona bez zmian jako zapis tego, co było testowane;
> `harness/acceptance-manual.js` testuje regułę z oryginału.

## Założenia modelu

Symulacja musi uwzględniać cztery grupy parametrów wejściowych, wpływających łącznie na kurs i zachowanie łodzi:

1. **Kierunek i siła wiatru** (względem osi łodzi)
2. **Pozycja załogi w poprzek pokładu** (strona ama / strona pomostu-pirogi)
3. **Pozycja załogi wzdłuż pokładu** (przód / środek / tył)
4. **Ustawienie olinowania**: szot (kąt/naciągnięcie żagla), gejtawa główna i gejtawa druga (przełamująca), fał, hals-lina, wanta

Zasada nadrzędna: ama (przeciwwaga) podczas żeglugi zawsze musi znajdować się od strony nawietrznej (skąd wieje wiatr). Ta reguła jest punktem odniesienia dla wszystkich testów kierunkowych poniżej.

---

## 1. Ruch załogi w poprzek pokładu (ama ↔ pomost)

**AC-1.1** Given łódź płynie ustabilizowanym kursem, When załoga przesuwa się w stronę ama (przeciwwagi), Then dziób łodzi skręca w stronę wiatru (nawietrzną, czyli w stronę ama) w ciągu zdefiniowanego czasu reakcji (nie natychmiastowo).

**AC-1.2** Given jw., When załoga przesuwa się z pomostu w stronę żagla/piroga (odciąża ama), Then dziób łodzi również skręca w stronę wiatru, ale mechanizm jest inny: przeciwwaga wynurza się i traci moment obrotowy (efekt ten symulator powinien odróżniać wewnętrznie od AC-1.1, nawet jeśli kierunek skrętu jest ten sam).

**AC-1.3** Given załoga jest rozłożona symetrycznie w poprzek, When brak innych zmian ustawień, Then łódź utrzymuje kurs bez tendencji skrętu wynikającej z tego czynnika.

---

## 2. Ruch załogi wzdłuż pokładu (przód ↔ tył)

**AC-2.1** Given łódź płynie ustabilizowanym kursem, When załoga przesuwa się do przodu, Then dziób łodzi ustawia się bliżej kierunku wiatru (łódź staje się bardziej „nawietrzna”/ostrzejsza).

**AC-2.2** Given jw., When załoga przesuwa się do tyłu, Then dziób łodzi ustawia się bardziej z wiatrem (łódź staje się bardziej „zawietrzna”/pełniejsza).

**AC-2.3** Given wiatr boczny i cel „płynięcia burtą do wiatru”, When załoga siedzi z tyłu ORAZ dodatkowo stosowana jest gejtawa przełamująca (patrz AC-4.x), Then efekt ustawienia burtą do wiatru jest silniejszy niż sama zmiana pozycji załogi.

---

## 3. Szot – przyciąganie / luzowanie (żegluga ostro do wiatru)

Warunek wstępny modelu: efekt działa poprawnie tylko gdy żagiel jest w pełni wypełniony wiatrem, bez zawinięć z przodu (brak „podwiania”).

**AC-3.1** Given żagiel jest w pełni wydęty (bez zawinięć), When szot jest mocniej przyciągnięty (żagiel bliżej osi łodzi), Then dziób łodzi delikatnie odchyla się OD kierunku wiatru.

**AC-3.2** Given jw., When szot jest poluzowany, Then dziób łodzi zbliża się DO kierunku wiatru.

**AC-3.3** Given żagiel ma zawinięcie/nie jest w pełni wydęty, When zmieniany jest szot, Then symulator nie powinien stosować reguł AC-3.1/AC-3.2 w standardowej, przewidywalnej formie (dopuszczalne: efekt osłabiony, opóźniony lub brak reakcji – do ustalenia z projektantem gry, ale nie pełna, „podręcznikowa” reakcja).

---

## 4. Gejtawy – ustawienie żagla przy wietrze bocznym („przełamanie")

**AC-4.1** Given załoga siedzi z tyłu i celem jest ustawienie łodzi bardziej burtą do wiatru, When gejtawa główna podciąga bom lekko w górę (żagiel się pogłębia) ORAZ szotem bom jest dociągnięty bliżej masztu (brak podwiewania przy rei), Then sam ten krok (etap przygotowawczy) NIE zmienia kursu łodzi – jedynie zwiększa głębokość żagla.

**AC-4.2** Given wykonano krok z AC-4.1, When druga (ukryta za żaglem) gejtawa jest naciągana, powodując widoczne „przełamanie" tkaniny żagla, Then dziób łodzi odchyla się OD kierunku wiatru, a siła tego efektu rośnie proporcjonalnie do stopnia przełamania żagla.

**AC-4.3** Given żagiel jest ustawiony „w marchewkę" (bom podciągnięty wysoko obiema gejtawami, żagiel mocno wydęty) ORAZ szot odpowiednio poluzowany (bom może się unosić), Then symulator przesuwa efektywny środek siły żagla do przodu, co ułatwia płynięcie prawie całkiem z wiatrem (kurs pełny) i zwiększa tendencję do zbliżania dziobu do kierunku z wiatrem.

**AC-4.4** Given kurs pełny (prawie z wiatrem) ustawiony wg AC-4.3, When dodatkowo maszt jest stawiany bliżej pionu (poluzowany tylny sztag + skrócona wanta), Then efekt z AC-4.3 jest wzmocniony (dodatkowe przesunięcie siły napędowej do przodu).

---

## 5. Kombinacje i stany błędne (rozdział V elementarza)

**AC-5.1 – Nadmierna nawietrzność (łódź uparcie skręca pod wiatr)**
Given fał nie jest wybrany do samego szczytu masztu, When gracz dociąga fał maksymalnie, Then tendencja do nawietrzności maleje.
Given maszt jest odchylony zbyt daleko na stronę zawietrzną (od ama), When gracz dociąga wantę (maszt bliżej pionu), Then tendencja do nawietrzności maleje.

**AC-5.2 – Łódź nie chce ustawić się z wiatrem**
Given żagiel nie jest ustawiony „w rzodkiewkę" (bom nisko, blisko szczytu masztu, ściągnięty gejtawami), When gracz to koryguje, Then zdolność łodzi do ustawienia się z wiatrem rośnie.
Given cała załoga jest z tyłu (dociążenie rufy), Then efekt ten dodatkowo wspomaga ustawienie z wiatrem („kogut na dachu" – rufa głębiej zanurzona).
Symulator powinien też udostępniać wiosło (pagaj) jako niezależny, zawsze dostępny mechanizm korekty kursu, którego siła rośnie wraz z prędkością łodzi.

**AC-5.3 – Podwianie żagla / „backwind" (stan awaryjny)**
Given wiatr zaczyna łapać żagiel z niewłaściwej strony, When symulacja to wykrywa, Then system sygnalizuje stan zagrożenia (ryzyko przewrócenia masztu w stronę ama).
Given stan podwiania trwa, When gracz energicznie steruje pagajem w kierunku odwrotnym do wiatru, Then łódź powinna kontynuować obrót aż ama ponownie znajdzie się od strony nawietrznej (zgodnie z zasadą nadrzędną).
Given standardowe manewry nie pomagają, When gracz ściąga żagiel „w rzodkiewkę" i mocno wybiera szot (który w tej awaryjnej sytuacji działa jak dodatkowa wanta), Then dostępna jest alternatywna ścieżka wyjścia z podwiania.

**AC-5.4 – Manewr zwrotu (zmiana dziobu z rufą)**
Given gracz inicjuje zwrot, When szot i obie gejtawy są całkowicie poluzowane, Then żagiel swobodnie odchyla się na stronę zawietrzną i można rozpocząć przeciąganie żagla wzdłuż łodzi (halsem) na nowy dziób.
Given żagiel jest w trakcie przenoszenia na drugi koniec łodzi, Then role „dziób" i „rufa" oraz orientacja pozycji załogi (przód/tył) muszą się zamienić w modelu po zakończeniu manewru.
Given żagiel/drzewce „zaczepia" wirtualnie o sztag podczas zwrotu (opcjonalny stan trudności), Then manewr zostaje zatrzymany do czasu interwencji gracza.

---

## 6. Wymagania dotyczące czasu reakcji i UX symulacji

**AC-6.1** Żadna zmiana pozycji załogi ani ustawienia olinowania nie powoduje natychmiastowej zmiany kursu – model musi uwzględniać opóźnioną, płynną reakcję łodzi (bezwładność).

**AC-6.2** Interfejs symulatora powinien wizualnie odróżniać, która strona łodzi jest aktualnie stroną ama (nawietrzną), aby gracz mógł ocenić zgodność z zasadą nadrzędną.

**AC-6.3** System powinien umożliwiać niezależne sterowanie każdym z parametrów (pozycja poprzeczna, pozycja wzdłużna, szot, gejtawa 1, gejtawa 2, fał, wanta, pagaj) i sumować/łączyć ich efekty na kurs zgodnie z regułami powyżej, a nie traktować ich jako wzajemnie wykluczające się tryby.

---

*Uwaga: powyższe kryteria opisują uproszczony model fizyki żeglowania na podstawie materiału instruktażowego. Konkretne wartości liczbowe (stopnie skrętu, siła efektu, czasy reakcji) wymagają dodatkowego doprecyzowania przez projektanta gry/fizyka symulacji – dokument nie narzuca wartości, tylko kierunki i zależności przyczynowo-skutkowe.*
