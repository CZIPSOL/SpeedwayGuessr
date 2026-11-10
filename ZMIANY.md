# SpeedwayGuessr - poprawki (v4.14)

Zmienione pliki: `script.js`, `db.js`, `index.html`, `functions/index.js`. Resztę projektu zostaw bez zmian.
`firestore.rules` pominięte (zarządzasz nimi w konsoli).

## ⚠️ Zrób przed wdrożeniem

1. **Zresetuj wszystkie sekrety**, które były w starym `functions/index.js` (są w zipie, który wysłałeś):
   - Discord Developer Portal: *Reset Secret* (OAuth2) i *Reset Token* (Bot),
   - Sightengine: wygeneruj nowe klucze API,
   - hasło API bota giveaway: wymyśl nowe.
2. Zapisz je w Secret Managerze (w katalogu projektu):
   ```
   firebase functions:secrets:set DISCORD_CLIENT_SECRET
   firebase functions:secrets:set DISCORD_BOT_TOKEN
   firebase functions:secrets:set SIGHTENGINE_API_USER
   firebase functions:secrets:set SIGHTENGINE_API_SECRET
   firebase functions:secrets:set GIVEAWAY_BOT_KEY
   firebase deploy --only functions
   ```
3. W skrypcie bota giveaway ustaw nowy klucz w nagłówku `Authorization` (format bez zmian, sam klucz).
   Nowe: opcjonalne pole `requestId` (ten sam ID nie przyzna nagrody dwa razy), `coinsToAdd` to liczba całkowita 1-100000.
4. Wgraj nowy `script.js`, `db.js`, `index.html` (zmieniłem wersje w `?v=`, więc cache się odświeży).
5. Usuń z projektu/hostingu: `test.js` (stara kopia script.js), `temp_check.js`.

## Co poprawiono

**Bezpieczeństwo**
- Sekrety poza kodem (Firebase Secrets).
- XSS w rankingach: koniec z inline `onclick` z danymi z bazy (delegowany klik + `data-*`), klasy `bg`/`nickEffect` przechodzą whitelistę, escapowanie nicków przeciwnika w VS/Clash, klubów, nazwy Discord, avatarów w VS.
- `updateDiscordRank`: serwer czyta ELO z `leaderboard_clash_beta`, nie od klienta; walidacja liczb (wcześniej brak `elo` dawał rangę LEGENDA).
- `linkDiscordAccount`: parametr `state` (CSRF), jedno konto Discord = jedno konto gry, sprawdzanie odpowiedzi Discorda, bez wycieku `e.message`.
- `uploadAvatar`: limit rozmiaru, sprawdzenie sygnatury JPEG, limit częstotliwości (15 s), prawidłowe przekazywanie błędu moderacji (`failed-precondition` nie jest już zamieniany na `internal`), timeouty.
- `discordGiveawayReward`: tylko POST, porównanie `timingSafeEqual`, walidacja kwoty, idempotencja.

**Błędy logiki**
- Misja "użyj podpowiedzi" nie liczyła się (zdublowana `useHint`) - usunięto duplikat.
- Usunięte martwe, zdublowane funkcje: `getLeagueRankName`, `revealTargetInfoUI`, `updateClashBoardUI`, `cancelLeagueMatchmaking`, `showFloatingEmote`, `sendClashEmote`.
- Kolory odznak ELO dopasowane do nowych rang.
- Nick: koniec z wielokrotnym escapowaniem (zapis surowy, escapowanie przy renderze; stare wpisy są normalizowane). Podświetlenie "to ja" po UID. Nick z Google ucinany do 12 znaków (limit z reguł).
- ELO: dolna granica 0 (wcześniej ujemne skakało na 1000), ELO przeciwnika ograniczone do 0-5000.
- Ranking Clash: pobiera 100 rekordów (jak wersja mobilna), nie 30.
- Data dnia w rankingu: `timeZone: 'UTC'` (w Ameryce pokazywało dzień wcześniej).
- Zabezpieczenia przed `null` w `makeGuess`/`useHint`/`giveUpGame`.
- Rankingi More/Less: błędy zapisu logowane w konsoli zamiast połykane.
- Kluby `[W]`/`[G]` rozpoznawane tak samo jak `(W)`/`(G)` (wcześniej skrót klubu wychodził jako "[W]").
- Duplikat `id="updateBadgeGame"` w HTML.

**Synchronizacja**
- Zapis statystyk do chmury z opóźnieniem 2,5 s (debounce) + wymuszony zapis przy ukryciu karty.
- Scalanie `dailyResults`/`dailyGuesses`/`moreLessDaily` z chmurą (wcześniej chmura nadpisywała lokalny postęp).
- Nagrody z giveawayów: serwer trzyma sumę w `giveaway_rewards/{uid}` (kolekcja tylko dla serwera), klient odbiera różnicę przy logowaniu (funkcja `getGiveawayCoins`). Koniec z nadpisywaniem monet starą wartością. Monety pojawią się po odświeżeniu/zalogowaniu.
- Rangę Discord klient aktualizuje tylko dla połączonych kont i po zapisaniu ELO.

**Dane (db.js)**: `Speeway Kraków`, `Ostorvia`, `Wilkie Krosno`, `Polonia Piłą`, `wybrzeże Gdańsk`, `[Zawieszcze]`, ujednolicone `Brak Klubu` / `Koniec kariery`, `[W]`→`(W)`.

**Wydajność**: wiersze rankingów dopisywane `insertAdjacentHTML` zamiast `innerHTML +=` w pętli; usunięte logi diagnostyczne z kodem OAuth.

## Świadomie NIE ruszone (decyzje po Twojej stronie)
- Daily losuje po `playersDB.length`: dodanie zawodnika zmienia zawodników we wszystkich dniach. Potrzebna zamrożona pula/lista ID.
- Odpowiedź dnia da się policzyć w przeglądarce; rankingi są podatne na cheaty bez walidacji po stronie serwera (dotyczy też ELO liczonego u klientów).
- Dni z archiwum podbijają streak/EXP/misje; strefy czasowe rankingu dziennego (lokalne vs UTC).
- Unikalność nicku (bez rozróżniania wielkości liter i bez transakcji).
- Obrazy (~58 MB, np. poznan.png 7 MB) - warto przekonwertować na WebP.
- CSP w index.html, aktualizacja Firebase SDK (10.8.1 compat), teksty po polsku poza i18n.

## Do sprawdzenia w konsoli Firebase (reguły)
Jeśli reguły w konsoli odpowiadają dawnemu plikowi `firestore.rules`: pole `day <= 31` w rankingach More/Less (numer dnia od 24.10 przekroczy 31 w dniu 24.11), dozwolone klucze w `leaderboard_timeattack` (klient wysyła też `club`, `bg`, `nickEffect`) oraz w `users` (`stats`, `lastUpdated`, `discord*`).

## Sklep: tła (aktualizacja)
- Nowe tło specjalne **Nazar Parnitskyi 785** (`rank-bg-parnitskyi`), cena 1000 monet. Pliki: `images/np785.png`, wpis w `SHOP_DB` (script.js), teksty w `i18n.js` (PL/EN), styl w `style.css`.
- Cena tła **Sadurski Racing** obniżona z 75 900 do 1000 monet.

## Ramki awatara (aktualizacja)
- **Ramki i skórki kasków są teraz osobno**: nowe pola `ownedFrames` / `equippedFrame` (kaski dalej w `ownedHelmets` / `equippedHelmet`). Istniejące zapisy migrują się automatycznie (flaga `framesSplitV1`): kto miał retro/złoty/świąteczny, dostaje i ramkę, i kask; `helmet-halloween` była tylko ramką, więc przeszła do ramek.
- Nowy plik **`avatar_frames.js`** (ramki rysowane w SVG, nakładka wokół awatara) + styl w `style.css`.
- **Halloweenowa Dynia**: dynia-lampion, mała dynia, pajęczyna z pająkiem, nietoperz, poświata.
- **Świąteczny Wieniec**: wieniec jak na drzwiach z gałązek, bombek, jagód, szyszek i czerwonej kokardy (awatar okrągły).
- **Retro Skóra** (skóra, ścieg, mosiężne nity), **Złota Korona** (korona, klejnoty, iskierki).
- Nowe: **Opona Speedway** (2500 monet, okrągły awatar, bieżnik) i **Łańcuch Napędowy** (3500 monet; łańcuch rolkowy żużlówki na zębatce tylnego koła, ze złotym ogniwem spinającym, awatar okrągły). Ceny w `SHOP_DB.frames` w script.js.
- Podgląd ramek w sklepie jest większy; w zakładce kasków pokazuje się obrazek kasku.
- Eventy (`seasonal_events.js`) przyznają teraz ramki do `ownedFrames` (świąteczna nagroda dodatkowo daje kask).
- Profil publiczny pokazuje ramkę gracza (także ze starych zapisów).

## Tło Parnitskyi - tylko dla admina
- Pozycja `rank-bg-parnitskyi` ma flagę `adminOnly: true` w `SHOP_DB` (script.js): widoczna i kupowalna tylko dla konta admina. Aby otworzyć ją dla wszystkich, usuń `adminOnly: true`.
- To ukrycie jest po stronie przeglądarki (jak reszta sklepu) - zabezpiecza przed zwykłymi graczami, nie przed kimś, kto grzebie w konsoli.

## Wygląd w rankingu od razu
- Po kupnie/założeniu tła lub efektu nicku gra od razu aktualizuje pola `bg` i `nickEffect` gracza w rankingach (dzienny, tygodniowy, miesięczny, ogólny, Clash, Time Attack). Wcześniej odświeżało się dopiero po kolejnym zapisanym wyniku. Gracz, który nie ma wpisu w danym rankingu, jest pomijany.
- Zapis to zwykłe `update()` na polach `bg` i `nickEffect`. Jeśli reguły w konsoli go odrzucą, błąd pojawi się w konsoli przeglądarki (`Aktualizacja wyglądu w rankingu nieudana`).

## Poprawki zgłoszone po testach (v4.16)
- **Zakup znikał i trzeba było kupować drugi raz:** po wejściu do gry stan z chmury zawsze nadpisywał lokalny, nawet jeśli chmura była starsza. Teraz każdy zapis ma znacznik czasu (`lastSavedAt`) i wygrywa nowszy; nowszy lokalny stan jest od razu wypychany do chmury. Zakup i założenie przedmiotu zapisują się do chmury natychmiast (bez opóźnienia).
- **Wygląd tylko w rankingu Clash:** własny wiersz w każdym rankingu jest teraz rysowany z aktualnie założonym tłem i efektem nicku (bez czekania na bazę). Dodatkowo nadal aktualizujemy wpisy w bazie, żeby widzieli to inni gracze.
- **More/Less w menu głównym:** najechanie na kafelek pokazuje teraz ranking More/Less (dotąd odpalał się ogólny ranking Guessra).
- **More/Less - nie widać innych graczy:** ranking odświeża się co 45 s, a gdy mamy wynik lokalnie, a brak go w chmurze, zapis jest ponawiany. Błędy zapisu i odczytu (np. `permission-denied`) są teraz widoczne: toast przy zapisie i komunikat w tabeli przy odczycie.

## Tła w rankingach (v4.17)
- **Jakość tła Parnitskyi w tabelach:** logo było rysowane na środku wiersza, czyli dokładnie pod nickiem i nazwą klubu (w Clashu i Guessrze), a wiersz był niski. Teraz logo jest większe, przesunięte w wolne miejsce, a wiersz z tłem wyższy (`style.css`, reguła `.ranking-table tbody tr.rank-bg-parnitskyi`).
- **Tła w rankingach wewnątrz trybów:** ranking Time Attack, Clash i More/Less w środku trybu pokazuje teraz tło, efekt nicku i klub gracza oraz pozwala kliknąć gracza (profil). Wcześniej te tabele w ogóle nie czytały tych pól.
- More/Less: wygląd graczy jest dociągany z rankingu ogólnego (wpisy More/Less go nie zawierają). Gracz bez wpisu w rankingu ogólnym nie będzie miał tła.
- Tło Sadurskiego ma to samo ograniczenie co Parnitskyi miał wcześniej (logo na środku wiersza); nie zmieniałem go.

## Klub pod nickiem, ranga pod ELO (v4.18)
- We wszystkich tabelach rankingów klub gracza wyświetla się w osobnej linii pod nickiem (nowa funkcja `getClubSubline`, style `.rank-club-sub`). Dzięki temu nie zasłania tła ani nie ściska kolumn.
- W rankingu Clash (panel w menu głównym i ranking w trybie Clash) kolumna „Ranga" została usunięta, a ranga jest pod ELO (`.rank-sub`). Kolumny: Poz. | Nick | ELO.
- Ranking Clash w oknie „RANKING" (z ikoną rangi i liczbą meczów) zachował swoje kolumny; zmienił się tylko klub (teraz pod nickiem).
- Logo Parnitskyiego przesunięte na 46% szerokości wiersza, mniejsze marginesy wiersza.

## Bez przerw między komórkami (v4.18)
- Pionowe linie przecinające tło wiersza w rankingach to domyślna 2-pikselowa przerwa między komórkami tabeli. Dodałem `.ranking-table { border-spacing: 0; }` w `style.css`, więc tło idzie teraz jedną, ciągłą płaszczyzną. Dotyczy wszystkich tabel rankingów (zniknęły też przerwy przy najechaniu na wiersz).

## More/Less: rankingi tygodniowy, miesięczny, ogólny (v4.19)
- Nowe rankingi w More/Less: **tygodniowy, miesięczny i ogólny**. Liczą się tylko gry **Daily z dnia bieżącego** (archiwum się nie liczy). Wynik to suma punktów, np. `23/28`, a pod spodem `Gry: 2`. Sortowanie: więcej punktów wyżej, przy remisie wyżej lepszy stosunek (mniej rozegranych rund).
- Zakładki DAILY / TYDZIEN / MIESIAC / OGOLNY są w ekranie More/Less oraz w panelu po najechaniu na More/Less w menu głównym.
- Wpis okresowy trzyma mapę dni, a sumy liczy z niej, więc ponowne zagranie tego samego dnia niczego nie dubluje. Przy pierwszym zapisie gra dopisuje też dni z bieżącego okresu, które gracz już zagrał (tylko te zagrane w swoim dniu, nie z archiwum).
- Dzienny wpis zapisuje teraz **najlepszy** wynik dnia (wcześniej gorsza powtórka mogła nadpisać lepszy wynik) oraz tło, efekt nicku i klub.
- Błąd `permission-denied` miał dwie przyczyny w Twoich regułach: (1) reguła `rankings_moreless` dopuszczała `score`/`total` tylko do 12, a gra ma 14 rund, więc każdy zapis był odrzucany; (2) limit `day <= 31` przestałby działać od 24.11. Poprawiona, pełna wersja reguł jest w **`firestore-rules-full.txt`** (wklej w konsoli: Firestore -> Reguły). Dodane są też reguły dla trzech nowych kolekcji rankingów okresowych (ogólna reguła nr 3 pasuje do nich, ale blokuje aktualizację, bo wymaga pól `wins`/`guesses`).
- Stara kolekcja `leaderboard_moreless` i jej zapytanie zapasowe zostały usunięte z kodu.

## Nagrody tygodnia, seria Daily, zamrożona pula Daily (v4.20)

**Nagrody tygodnia (top 3): 1000 / 750 / 500 monet**
- Nowa funkcja `weeklyRewards` (functions/index.js) uruchamia się w każdy poniedziałek o 03:00 (Europe/Warsaw) i wypłaca nagrody za poprzedni tydzień w **obu** rankingach tygodniowych: Guessr i More/Less. Konta gości są pomijane.
- Nagroda trafia do `giveaway_rewards/{uid}` (ten sam mechanizm co giveaway z Discorda), a gra odbiera ją przy następnym logowaniu i pokazuje komunikat, np. „Nagroda: +1000 🪙 (TOP 1 tygodnia - Guessr)”.
- Wypłata jest idempotentna (log w `weekly_rewards/{tydzień}_{ranking}`): ten sam tydzień nie zostanie opłacony dwa razy.
- `runWeeklyRewardsNow` (tylko admin) pozwala uruchomić wypłatę ręcznie, np. test: w konsoli przeglądarki po zalogowaniu jako admin `functions.httpsCallable('runWeeklyRewardsNow')({weekKey: '2026_W46'})`.
- Kwoty zmienisz w `WEEKLY_REWARDS` w **obu** plikach: functions/index.js i script.js (w grze służy tylko do napisu).
- Potrzebny `firebase deploy --only functions`. Przy pierwszym wdrożeniu Firebase poprosi o włączenie Cloud Scheduler API (plan Blaze, koszt praktycznie zerowy).
- Kolekcje `weekly_rewards` i `giveaway_rewards` są tylko dla serwera (domyślnie zablokowane w regułach, nic nie trzeba dopisywać).

**Licznik „Kończy się za…”**
- W rankingach tygodniowych i miesięcznych (Guessr i More/Less, panel w menu głównym oraz ekran More/Less) pod tytułem pojawia się czas do końca okresu, a w tygodniowych także kwoty nagród. Tydzień rankingu kończy się w poniedziałek o 00:00 UTC (01:00/02:00 w Polsce), miesiąc o północy czasu lokalnego.

**Seria dni w Daily**
- Liczy się wygrana w Daily **z dnia bieżącego** (archiwum nie). Jeden dzień przerwy zeruje serię.
- Licznik „🔥 Seria: N dni (rekord M)” jest w menu Guessra, w profilu i w profilu publicznym. Odznaki za rekord serii: 3 🔥 Rozgrzewka, 7 ⚡ Tydzień z rzędu, 14 💎 Dwa tygodnie, 30 👑 Miesiąc w formie, 60 🏆 Dwa miesiące, 100 🌟 Legenda Daily (`DAILY_STREAK_BADGES`).
- Seria liczy się wyłącznie od tej wersji (wcześniejszych dni nie da się odróżnić od gier z archiwum).

**Zamrożona pula Daily**
- Nowy plik `daily_pool.js` (dołączony w index.html przed script.js). Zawodnik dnia nie zależy już od liczby zawodników w db.js. Sprawdziłem, że dla obecnej bazy daje dokładnie tych samych zawodników co wcześniej (800 dni bez różnic), a po dodaniu zawodnika stary algorytm zmieniłby 198 z 200 dni, a nowy żadnego.
- Jak dodać nowych zawodników do Daily: dopisz ich w `db.js`, uruchom `node tools/new_daily_epoch.js` i wklej wypisany blok na koniec `DAILY_POOL_EPOCHS`. Nowa epoka obowiązuje od jutra, dni wcześniejsze zostają bez zmian.

**Przy okazji: błąd w rankingach Guessra**
- Rankingi dzienny/tygodniowy/miesięczny/ogólny pobierały 20 dokumentów bez sortowania w bazie i dopiero potem sortowały, więc przy więcej niż 20 graczach wynik zależał od kolejności ID, a nie od wyników. Teraz zapytania sortują po `wins`/`won` w bazie (100 najlepszych), a lista pokazuje 20 pierwszych.

## Logo w tabelach, changelog (v4.20+)
- Logo Parnitskyiego w tabelach rankingu używa teraz osobnego, przyciętego i wyostrzonego pliku `images/np785_row.png` (455x170 zamiast 1648x624 skalowanego w dół ~15 razy, co dawało poszarpane krawędzie). Oryginał `np785.png` zostaje do sklepu.
- Changelog: nowy wpis „Beta v2.2.0” (PL i EN) na górze, `CURRENT_GAME_VERSION` podbite, więc gracze zobaczą kropkę z nowościami.
- `firestore-rules-full.txt`: dodana z powrotem reguła `leaderboard_moreless` z poprawionymi limitami (zgodność ze starszą wersją gry w przeglądarkach graczy).
