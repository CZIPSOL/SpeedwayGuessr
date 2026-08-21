// ==============================================
// ====== SEJF ZAWODNIKA (ZABEZPIECZENIE) =======
// ==============================================
let _gVault = null;

function _lockTarget(playerId) {
    const salted = (playerId * 13) + 77;
    _gVault = btoa(salted.toString());
}

function _unlockTarget() {
    if (!_gVault) return null;
    const unsalted = (parseInt(atob(_gVault)) - 77) / 13;
    return playersDB.find(p => p.id === unsalted);
}



function _generateDailyTarget(dayNumber) {
    let targetDay = Number(dayNumber) || 1;
    
    // Rdzeń losowania - zawsze ten sam dla tego samego dnia
    function getRaw(d) {
        let x = d * 73891247;
        for (let i = 0; i < 12; i++) {
            x = Math.imul(x ^ (x >>> 30), 0x6D2B79F5);
            x = x ^ (x >>> 27);
            x = Math.imul(x, 0xA2E8D4C3);
        }
        return Math.abs(x) % playersDB.length;
    }

    let history = []; 
    
    // Obliczamy "w pamięci" historię od 1 dnia aż do dzisiaj
    for (let i = 1; i <= targetDay; i++) {
        let rawIdx = getRaw(i);
        let finalIdx = rawIdx;
        let offset = 0;
        
        // ZABEZPIECZENIE: Jeśli zawodnik był w ciągu ostatnich 5 dni, bierzemy następnego
        while (history.includes(finalIdx)) {
            offset++;
            finalIdx = (rawIdx + offset) % playersDB.length;
        }
        
        history.push(finalIdx);
        // Trzymamy tylko 5 ostatnich dni, żeby nie obciążać pamięci
        if (history.length > 5) history.shift(); 
    }

    // Wybieramy zawodnika przypisanego na konkretnie ten (dzisiejszy) dzień
    let finalTargetIndex = history[history.length - 1];
    return playersDB[finalTargetIndex];
}

function _getSafeHint(name, currentGuessCount) {
    if (!name) return "";
    const parts = name.split(' ');
    let result = [];
    parts.forEach((part, partIndex) => {
        let word = "";
        for (let i = 0; i < part.length; i++) {
            if (partIndex === 0 && i === 0 && currentGuessCount >= 5) word += part[i];
            else if (partIndex === 1 && i === 0 && currentGuessCount >= 6) word += part[i];
            else word += "_";
        }
        result.push(word.split('').join('\u200A'));
    });
    return result.join(' \u00A0\u00A0 ');
}

// ==============================================
// ====== 1. TRYB ADMINA, TESTERA I ANTI-CHEAT ==
// ==============================================
window.isAdmin = false;
window.isTester = false;
window.isMaintenanceBlocked = false;

function applyAdminState(isServerAdmin, isServerTester) {
    window.isAdmin = Boolean(isServerAdmin);
    window.isTester = Boolean(isServerTester);

    // Omijanie przerwy technicznej TYLKO dla Admina!
    if (window.isAdmin) {
        const maintOverlay = document.getElementById('maintenanceOverlay');
        if (maintOverlay) {
            maintOverlay.style.display = 'none';
            maintOverlay.style.opacity = '0';
        }

        if (window.isMaintenanceBlocked) {
            const mainMenu = document.getElementById('mainMenuContainer');
            const desktopMenu = document.getElementById('desktopMainMenu');
            if (mainMenu) mainMenu.style.display = '';
            if (desktopMenu) desktopMenu.style.display = '';
            window.isMaintenanceBlocked = false;
        }
    }

    // Wyświetlanie elementów w menu
    document.querySelectorAll('.admin-only').forEach(el => {
        if (window.isAdmin) {
            // Dodano rozpoznawanie nav-item-modern
            el.style.display = (el.classList.contains('nav-item') || el.classList.contains('nav-item-modern') || el.classList.contains('menu-btn')) ? 'flex' : 'block';
        } else {
            el.style.display = 'none';
        }
    });
}

// ==============================================
// ====== 2. INICJALIZACJA FIREBASE (PIERWSZE) ==
// ==============================================
const firebaseConfig = {
    apiKey: "AIzaSyBslQyJYGbjNszn3TS_6BQ2tXw7kd9iznw",
    authDomain: "speedwayguessr.firebaseapp.com",
    projectId: "speedwayguessr",
    storageBucket: "speedwayguessr.firebasestorage.app",
    messagingSenderId: "195534808018",
    appId: "1:195534808018:web:f033e0eb0943d3a9dbde0b",
    measurementId: "G-QSWL3N5CHG"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Diero TERAZ tworzymy zmienne Firebase (db, auth, functions)
const db = firebase.firestore();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
const functions = firebase.functions(); 

// ==============================================
// ====== 3. ZMIENNE GLOBALNE I SLUCHACZ AUTH ====
// ==============================================
let gameMode = 'endless'; let guessCount = 0;
let guessHistory = []; let guessedPlayersNames = []; 
let currentDailyDay = 1; let selectedDailyDay = 1; let dailyNumberGlobal = "";
let hasWon = false; let hasLost = false; let isRestoring = false;
let calRenderMonth = new Date().getMonth(); let calRenderYear = new Date().getFullYear();
const GUESS_LIMIT = 10; 
const DAILY_START_DATE = new Date('2026-05-12T00:00:00');

let hintActive = false; 
let hintsUsedCount = 0; 
const TIME_ATTACK_DURATION = 120; // 2 minuty (żuzlowe)
let timeAttackTarget = null;
let timeAttackPool = [];
let timeAttackSolved = [];
let timeAttackSecondsLeft = TIME_ATTACK_DURATION;
let timeAttackTimerId = null;
let timeAttackActive = false;
let userStats = { 
    played: 0, won: 0, currentStreak: 0, maxStreak: 0, 
    dailyResults: {}, dailyHistory: [], dailyGuesses: {}, recentEndless: [], 
    clashLeague: { matchesPlayed: 0, wins: 0, losses: 0, draws: 0, elo: 1000 },
    clashHistory: [] 
};

let playerNickname = localStorage.getItem('speedwayNickname') || null;
window.hasUpdatedLeague = false; 

let playerId = localStorage.getItem('speedwayUserId');
if (!playerId) {
    playerId = 'guest_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('speedwayUserId', playerId);
}

// Konfiguracja własnych pokoi Clash
let customClashSettings = {
    size: 3, 
    turnTime: 120, 
    filterMode: 'leagues', 
    leagues: { ext: true, m2e: true, klz: true, other: true },
    excludedClubs: [], 
    // NOWE
    mods: { steal: false, veto: false, joker: false, tieBreaker: false }
};
let clashCustomSettingsReadOnly = false;

// ==============================================
// ====== Custom Clash Lobby ====================
// ==============================================

function openClashCustomSettings(readOnly = false) {
    clashCustomSettingsReadOnly = !!readOnly;
    const overlay = document.getElementById('clashCustomSettingsOverlay');
    overlay.style.display = 'block'; 
    setTimeout(() => overlay.style.opacity = '1', 10);
    
    // Reset na pierwszą zakładkę
    switchClashSettingsTab('board');

    // 1. Ustawienie Kafelków Planszy i Czasu
    const size = customClashSettings.size || 3;
    const time = customClashSettings.turnTime || 120;
    
    // Symulujemy kliknięcie w odpowiedni kafelek, by go zaświecić
    const sizeCard = document.querySelector(`.size-card[onclick*="${size}"]`);
    if (sizeCard) selectClashSettingCard('size', size, sizeCard);
    
    const timeCard = document.querySelector(`.time-card[onclick*="${time}"]`);
    if (timeCard) selectClashSettingCard('time', time, timeCard);

    // 2. Kluby
    renderCustomClubsChips(); 
    
    // 3. Suwak państw
    const reqSlider = document.getElementById('customClashRequiredCountries');
    const reqLabel = document.getElementById('customClashRequiredCountriesLabel');
    if (reqSlider) {
        reqSlider.min = 0;
        reqSlider.max = size;
        reqSlider.value = customClashSettings.requiredCountries || 0;
        if (reqLabel) reqLabel.innerText = reqSlider.value;
        reqSlider.oninput = () => { if (reqLabel) reqLabel.innerText = reqSlider.value; };
    }

    // 4. Modyfikatory
    if(customClashSettings.mods) {
        document.getElementById('customModSteal').checked = customClashSettings.mods.steal || false;
        document.getElementById('customModVeto').checked = customClashSettings.mods.veto || false;
        document.getElementById('customModJoker').checked = customClashSettings.mods.joker || false;
        document.getElementById('customModTieBreaker').checked = customClashSettings.mods.tieBreaker || false;
    }

    // Blokowanie klikania dla "gościa"
    const saveBtn = document.getElementById('btnSaveClashSettings');
    
    overlay.querySelectorAll('input, select, textarea').forEach(el => {
        el.disabled = !!readOnly;
    });
    overlay.querySelectorAll('.clash-setting-card').forEach(card => {
        if (readOnly) card.classList.add('disabled');
        else card.classList.remove('disabled');
    });
    
    if (saveBtn) saveBtn.style.display = readOnly ? 'none' : 'block';

    let info = document.getElementById('clashCustomSettingsReadOnlyInfo');
    info.innerText = readOnly ? 'Podgląd ustawień pokoju. Tylko host może je edytować.' : '';
    info.style.display = readOnly ? 'block' : 'none';
}

function closeClashCustomSettings() {
    const overlay = document.getElementById('clashCustomSettingsOverlay');
    overlay.style.opacity = '0'; 
    setTimeout(() => overlay.style.display = 'none', 300);
    clashCustomSettingsReadOnly = false;
}

function toggleClubFilterMode() {
    const isClubsMode = document.getElementById('clubFilterToggle').checked;
    customClashSettings.filterMode = isClubsMode ? 'clubs' : 'leagues';
    
    document.getElementById('labelLeagues').classList.toggle('active', !isClubsMode);
    document.getElementById('labelClubs').classList.toggle('active', isClubsMode);
    
    document.getElementById('filterLeaguesSection').style.display = isClubsMode ? 'none' : 'flex';
    document.getElementById('filterClubsSection').style.display = isClubsMode ? 'block' : 'none';
}

function renderCustomClubsChips() {
    const container = document.getElementById('customClubsChipsContainer');
    container.innerHTML = '';
    
    // Pobieranie wszystkich unikalnych klubów z bazy
    let allClubs = new Set();
    playersDB.forEach(p => {
        p.pastClubs.forEach(c => allClubs.add(getCleanClubName(c).toLowerCase()));
        if (p.currentClub) allClubs.add(getCleanClubName(p.currentClub).toLowerCase());
    });
    ['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery', 'aresztowanie'].forEach(c => allClubs.delete(c));
    
    let sortedClubs = Array.from(allClubs).sort();

    sortedClubs.forEach(club => {
        const chip = document.createElement('div');
        const isExcluded = customClashSettings.excludedClubs.includes(club);
        chip.className = `club-chip ${isExcluded ? '' : 'active'}`;
        chip.innerText = club;
        chip.onclick = () => {
            chip.classList.toggle('active');
        };
        container.appendChild(chip);
    });
}

function toggleAllClubs(state) {
    const chips = document.querySelectorAll('#customClubsChipsContainer .club-chip');
    chips.forEach(chip => {
        chip.classList.toggle('active', state);
    });
}

function saveClashCustomSettings() {
    if (clashCustomSettingsReadOnly) {
        closeClashCustomSettings();
        return;
    }

    // Czytamy z ukrytych inputów (które aktualizowały kafelki)
    customClashSettings.size = parseInt(document.getElementById('customClashSizeValue').value);
    customClashSettings.turnTime = parseInt(document.getElementById('customClashTimeValue').value);
    
    // Państwa
    const reqEl = document.getElementById('customClashRequiredCountries');
    if (reqEl) {
        let reqVal = parseInt(reqEl.value) || 0;
        if (reqVal < 0) reqVal = 0;
        if (reqVal > customClashSettings.size) reqVal = customClashSettings.size;
        customClashSettings.requiredCountries = reqVal;
    }
    
    const exclEl = document.getElementById('customClashExcludeInactive');
    if (exclEl) customClashSettings.excludeInactivePlayers = !!exclEl.checked;
    
    // Modyfikatory
    if (!customClashSettings.mods) customClashSettings.mods = {};
    customClashSettings.mods.steal = document.getElementById('customModSteal').checked;
    customClashSettings.mods.veto = document.getElementById('customModVeto').checked;
    customClashSettings.mods.joker = document.getElementById('customModJoker').checked;
    customClashSettings.mods.tieBreaker = document.getElementById('customModTieBreaker').checked;

    // Zapis lig / klubów
    if (customClashSettings.filterMode === 'leagues') {
        customClashSettings.leagues.ext = document.getElementById('customLeagueExt').checked;
        customClashSettings.leagues.m2e = document.getElementById('customLeagueM2e').checked;
        customClashSettings.leagues.klz = document.getElementById('customLeagueKlz').checked;
        customClashSettings.leagues.other = document.getElementById('customLeagueOther').checked;
        
        if (!customClashSettings.leagues.ext && !customClashSettings.leagues.m2e && !customClashSettings.leagues.klz && !customClashSettings.leagues.other) {
            appAlert("Musisz wybrać co najmniej jedną pulę klubów!", "Błąd ustawień");
            switchClashSettingsTab('clubs'); // Przerzuć go do okna gdzie jest błąd
            return;
        }
    } else {
        const chips = document.querySelectorAll('#customClubsChipsContainer .club-chip');
        customClashSettings.excludedClubs = [];
        let activeCount = 0;
        
        chips.forEach(chip => {
            if (!chip.classList.contains('active')) {
                customClashSettings.excludedClubs.push(chip.innerText.toLowerCase());
            } else {
                activeCount++;
            }
        });

        const requiredClubs = customClashSettings.size * 2;
        if (activeCount < requiredClubs) {
            appAlert(`Musisz zostawić włączonych co najmniej ${requiredClubs} klubów dla planszy ${customClashSettings.size}x${customClashSettings.size}!`, "Błąd ustawień");
            switchClashSettingsTab('clubs');
            return;
        }
    }
    
    showToast("Zapisano ustawienia pokoju!", "success");
    closeClashCustomSettings();
}

// ==============================================
// ====== LOSOWE TŁA (STADIONY) =================
// ==============================================

// Lista teł (podmień 'images/stadiony/' na taki folder, w jakim je masz)
const stadiumBackgrounds = [
    'url("images/stadiony/gorzow.png")',
    'url("images/stadiony/leszno.png")',
    'url("images/stadiony/torun.png")',
    'url("images/stadiony/wroclaw.png")',
    'url("images/stadiony/zg.png")',
    'url("images/stadiony/poznan.png")',
    'url("images/stadiony/bydgoszcz.png")'
];

function setRandomBackground() {
    const randomIndex = Math.floor(Math.random() * stadiumBackgrounds.length);
    const bgUrl = stadiumBackgrounds[randomIndex];
    
    console.log("Ładowanie tła:", bgUrl); // To pokaże Ci w konsoli (F12), jaki plik próbuje wczytać!

    // Ustawiamy właściwości bezpośrednio w stylu elementu body
    document.body.style.setProperty('background-image', `linear-gradient(rgba(10, 10, 12, 0.75), rgba(10, 10, 12, 0.95)), ${bgUrl}`, 'important');
    document.body.style.setProperty('background-size', 'cover', 'important');
    document.body.style.setProperty('background-position', 'center', 'important');
    document.body.style.setProperty('background-attachment', 'fixed', 'important');
    document.body.style.setProperty('background-repeat', 'no-repeat', 'important');
}

// ==============================================
// ====== SYSTEM AKTUALIZACJI (CHANGELOG) =======
// ==============================================

const CURRENT_GAME_VERSION = "Beta v1.3.2";

const changelog = {
    pl: [
        {
            version: "Beta v1.5.0", date: "20.08.2026",
            changes: [
                "💬 <b>Emotki w Clashu:</b> Dodano możliwość wysyłania szybkich reakcji (emotek) podczas meczów ligowych i towarzyskich!",
                "⚔️ <b>Historia pojedynków (H2H):</b> Na ekranie ładowania meczu (VS) pojawia się teraz bezpośredni bilans Twoich dotychczasowych starć z danym przeciwnikiem.",
                "📜 <b>Misje, EXP i Monety:</b> Wprowadzono system zdobywania doświadczenia (poziomy konta) oraz waluty za wykonywanie codziennych wyzwań. Sklep jest obecnie w budowie 🚧.",
                "🎲 <b>Modyfikatory Zasad:</b> Od teraz w ustawieniach meczu Towarzyskiego możesz włączyć szalone zasady urozmaicające grę: Fazę Veto, Kartę Joker, Kradzież Pól oraz Złoty Bieg!"
            ]
        },
        {
        version: "Beta v1.4.1", date: "19.08.2026",
            changes: [
                "🏍️ <b>Zakończenie testów Trybu Kariery:</b> Podjęliśmy decyzję o zamknięciu trybu Kariery (Speedway Legend). Na rynku istnieją inne, dedykowane menedżery żużlowe, a my postanowiliśmy skupić w 100% nasze siły na rozwoju unikalnego trybu multiplayer - <b>Speedway Clash</b>!",
                "❤️ <b>Dziękujemy testerom:</b> Ogromne podziękowania dla każdego, kto wziął udział w fazie Open Beta, grał, zgłaszał błędy i dzielił się z nami cennymi pomysłami. Jesteście najlepsi!"
            ]
        },
        {
            version: "Beta v1.4.0", date: "12.08.2026",
            changes: [
                "🏍️ <b>Speedway Legend (Tryb Kariery) - OPEN BETA!</b> Wyczekiwany tryb kariery jest już oficjalnie otwarty dla wszystkich graczy! Stwórz swojego zawodnika, pnij się po ligowych szczeblach, bierz udział w losowych zdarzeniach, trenuj na minigrach i zostań legendą żużla.",
                "🐛 <b>Faza Testów:</b> Ponieważ tryb kariery to ogromny projekt, wciąż znajduje się w fazie testów. Wszelkie błędy lub sugestie prosimy zgłaszać poprzez nasz Discord lub formularz 'Zgłoś błąd' w menu gry.",
                "🛠️ <b>Poprawki:</b> Załatano krytyczne błędy powodujące zawieszanie gry w trakcie minigier treningowych (Refleks i Szybki Mechanik) oraz naprawiono logikę podliczania wyników w dwumeczach (Play-Offy)."
            ]
        },
        {
            version: "Beta v1.3.2", date: "02.08.2026",
            changes: [
                "⚙️ <b>Ustawienia pokoju w Clashu:</b> Dodano możliwość podglądu i konfiguracji ustawień pokoju dla meczu Towarzyskiego i Lokalnego. Host może dalej edytować wszystko, a dołączony gracz widzi ustawienia w trybie podglądu.",
                "🧩 <b>Najważniejsze opcje:</b> Rozmiar planszy (3x3, 4x4, 5x5), czas na odpowiedź, liczba wymaganych narodowości w kolumnach oraz filtr klubów / lig."
            ]
        },
        {
            version: "Beta v1.3.1", date: "30.07.2026",
            changes: [
                "🛡️ <b>Wybierz swój klub:</b> Od teraz w Profilu możesz wybrać drużynę, której kibicujesz! Będzie ona widoczna obok Twojego nicku we wszystkich rankingach oraz podczas meczów na żywo w trybie Clash.",
                "🏆 <b>Rozbudowa osiągnięć:</b> Pokaźna aktualizacja systemu osiągnięć! Dodano nowe wyzwania (m.in. za tryb Time Attack i Speedway Clash), a cała gablota zyskała nowy, profesjonalny wygląd (niczym na Steamie) z paskiem postępu i datami odblokowania."
            ]
        },
        {
            version: "Beta v1.3.0", date: "28.07.2026",
            changes: [
                "⏱️ <b>Nowy tryb gry - Time Attack!</b> Masz 120 sekund na odgadnięcie jak największej liczby żużlowców. Za każdą poprawną odpowiedź zyskujesz +15 sekund bonusu. Tryb posiada własny, globalny ranking najlepszych ekspertów!",
                "🛡️ <b>Zabezpieczenia i Anti-Cheat:</b> Wprowadzono blokadę konsoli deweloperskiej (F12) oraz prawego przycisku myszy dla zwykłych graczy, aby zagwarantować uczciwą rywalizację w rankingach.",
                "🐛 <b>Poprawki błędów:</b> Usprawniono 'inteligentne' generowanie flag narodowości w trybie Clash oraz załatano pomniejsze błędy interfejsu (UI) na mniejszych ekranach."
            ]
        },
        {
            version: "Beta v1.2.0", date: "23.07.2026",
            changes: [
                "👾 <b>Integracja Discord:</b> Otwieramy oficjalny serwer Discord! Dołącz do nas z poziomu menu gry, aby rozmawiać i szukać graczy do Clasha.",
                "🏆 <b>Rangi na Discordzie:</b> Całkowita nowość! Połącz swoje konto w profilu gracza, a Twoja ranga z ligi Clash (Srebro, Diament itp.) będzie automatycznie aktualizować się na naszym serwerze Discord!",
                "⚔️ <b>Zasady Clash (Brak Remisów):</b> Zmieniamy logikę gry. Jeśli plansza 3x3 się zapełni i nikt nie ułoży linii, nie ma już klasycznego remisu. Wygrywa gracz, który przejął więcej kratek (np. 5 do 4)!",
                "👁️ <b>Podgląd Planszy:</b> Po emocjonującym meczu Clash możesz teraz kliknąć przycisk 'Podgląd Planszy', aby na spokojnie przeanalizować układ i strzały po obu stronach.",
                "📱 <b>Udostępnianie Daily:</b> Znacznie ulepszono wygląd generowanego obrazka z wynikiem Daily. Na komputerach PC obrazek automatycznie kopiuje się do schowka (gotowy do wklejenia Ctrl+V)!"
            ]
        },
        {
            version: "Beta v1.0.0", date: "18.07.2026",
            changes: [
                "🚀 <b>Przechodzimy do fazy BETA!</b> Gra jest w pełni stabilna i gotowa na szersze testy przez graczy.",
                "🛡️ <b>Anti-Cheat:</b> Uszczelniono system losowania graczy. Nie da się już 'podejrzeć' zawodnika w kodzie strony. 😎",
                "⌨️ <b>Wygoda gry (QoL):</b> Dodano możliwość szybkiego zatwierdzania odpowiedzi klawiszem ENTER.",
                "📱 <b>Mobile UI:</b> Ostatecznie załatano błąd, który powodował rozjeżdżanie się paska z historią klubów na ekranach telefonów. Dodano wyraźny poziomy scroll.",
                "💾 <b>Autozapis:</b> Odtworzenie niedokończonej gry w trybie Daily przywraca teraz w pełni wygląd paska 'Drużyny'."
            ]
        },
        {
            version: "Alpha v1.2.0", date: "05.07.2026",
            changes: [
                "⏱️ <b>Klimat Clash:</b> Dodano efekt dźwiękowy bicia serca 🫀, gdy w trybie ligowym zostaje 10 sekund czasu na odpowiedź!",
                "🔨 <b>System Banów:</b> Wprowadzono eskalujące kary czasowe (od 5 minut do nawet 7 dni!) za ucieczkę z meczu ligowego oraz wychodzenie z karty przeglądarki.",
                "📱 <b>Mobile:</b> Ulepszono pasek przewijania historii klubów zawodnika na mniejszych ekranach telefonów."
            ]
        },
        {
            version: "Alpha v1.1.0", date: "20.06.2026",
            changes: [
                "💻 <b>Nowość:</b> Zupełnie nowe, profesjonalne menu główne dla graczy na komputerach (PC).",
                "🏆 <b>Osiągnięcia:</b> Dodano w Profilu Gablotę Osiągnięć! Zdobądź m.in. 'Sokole Oko' czy rangę 'Legenda'.",
                "🏟️ <b>Tło:</b> Dodano losowe zdjęcia polskich stadionów w tle gry.",
                "💡 <b>Podpowiedzi:</b> Po 5 nieudanych próbach możesz odkryć długość imienia i nazwiska.",
                "📱 <b>Mobile:</b> Naprawiono błędy z rozjeżdżającym się ekranem przy zawodnikach z długą historią klubów (tzw. 'Efekt Holty').",
                "💾 <b>Zapis:</b> Dodano możliwość zapisu postępu w trybie Daily w trakcie gry oraz przycisk powrotu 🏠.",
                "📢 <b>Changelog:</b> Zakładka z aktualizacjami (ta, którą właśnie czytasz!)."
            ]
        },
        {
            version: "Alpha v1.0.5", date: "18.06.2026",
            changes: [
                "⚔️ <b>Nowy Tryb: Speedway Clash!</b> Graj 1v1 ze znajomymi w systemie kółko i krzyżyk.",
                "📈 <b>Rangi Ligowe:</b> Dodano system rang (od Brązu do Legendy) z punktacją ELO dla trybu Clash.",
                "🐛 <b>Formularze:</b> Dodano możliwość zgłaszania błędów oraz brakujących zawodników bezpośrednio z menu.",
                "🤝 <b>Gra Lokalna:</b> Możliwość grania w tryb Clash we dwójkę na jednym urządzeniu."
            ]
        },
        {
            version: "Alpha v1.0.0", date: "12.06.2026",
            changes: [
                "🏁 <b>Premiera wersji Alpha!</b> Uruchomienie trybów Daily Guessr i Endless Guessr.",
                "📊 <b>System statystyk:</b> Integracja z Firebase (tworzenie profilu za pomocą konta Google).",
                "🗓️ <b>Archiwum:</b> Możliwość rozgrywania archiwalnych gier z kalendarza w trybie Daily."
            ]
        }
    ],
    en: [
        {
            version: "Beta v1.5.0", date: "20.08.2026",
            changes: [
                "💬 <b>Clash Emotes:</b> Added the ability to send quick reactions (emotes) during league and friendly matches!",
                "⚔️ <b>Head-to-Head (H2H):</b> The VS loading screen now displays your direct win/loss record against your current opponent.",
                "📜 <b>Missions, EXP & Coins:</b> Introduced a progression system with account levels and currency earned by completing daily challenges. Shop is currently under construction 🚧.",
                "🎲 <b>Rule Modifiers:</b> You can now enable crazy rules in Friendly match settings to spice up the game: Veto Phase, Joker Card, Cell Stealing, and Golden Heat!"
            ]
        },
        {
            version: "Beta v1.4.1", date: "19.08.2026",
            changes: [
                "🏍️ <b>End of Career Mode testing:</b> We have made the decision to close the Career mode (Speedway Legend). There are other dedicated speedway managers on the market, and we want to focus 100% of our efforts on developing our unique multiplayer mode - <b>Speedway Clash</b>!",
                "❤️ <b>Thank you to all testers:</b> A massive thank you to everyone who participated in the Open Beta, played, reported bugs, and shared their valuable ideas with us. You are the best!"
            ]
        },
       {
            version: "Beta v1.4.0", date: "12.08.2026",
            changes: [
                "🏍️ <b>Speedway Legend (Career Mode) - OPEN BETA!</b> Our highly anticipated single-player career mode is now open to all players! Build your identity, climb the league ladders, manage relations, and become a speedway legend.",
                "🐛 <b>Beta Phase:</b> Because this is a massive project, the career mode is still in beta testing. Please report any bugs or suggestions via our Discord or the 'Report Bug' form in the game menu.",
                "🛠️ <b>Under the hood fixes:</b> Patched critical bugs causing the game to freeze during training minigames (Reflex and Quick Mechanic) and fixed aggregate score calculations in Play-Offs."
            ]
        },
        {
            version: "Beta v1.3.2", date: "02.08.2026",
            changes: [
                "⚙️ <b>Room settings in Clash:</b> Added room settings preview/configuration for Friendly and Local matches. The host can still edit everything, while the joined player can only view the settings.",
                "🧩 <b>Key options:</b> Board size (3x3, 4x4, 5x5), answer time, required nationality columns, and club/league filters."
            ]
        },
        {
            version: "Beta v1.3.1", date: "30.07.2026",
            changes: [
                "🛡️ <b>Choose your club:</b> You can now select your favorite team in your Profile! It will be displayed next to your nickname in all leaderboards and during live Clash matches.",
                "🏆 <b>Achievements expansion:</b> A massive update to the achievements system! Added new challenges (including Time Attack and Speedway Clash), and the entire showcase received a new, professional look (like on Steam) with a progress bar and unlock dates."
            ]
        },
        {
            version: "Beta v1.3.0", date: "28.07.2026",
            changes: [
                "⏱️ <b>New game mode - Time Attack!</b> You have 120 seconds to guess as many riders as possible. Each correct guess grants a +15 seconds bonus. This mode features its own global leaderboard!",
                "🛡️ <b>Security & Anti-Cheat:</b> Added developer console (F12) and right-click locks for regular players to ensure fair play across all leaderboards.",
                "🐛 <b>Bug fixes:</b> Improved the 'smart' generation of nationality flags in Clash mode and patched minor UI glitches on smaller screens."
            ]
        },
        {
            version: "Beta v1.2.0", date: "24.07.2026",
            changes: [
                "👾 <b>Discord Integration:</b> Our official Discord server is now open! Join us from the game menu to chat and find Clash opponents.",
                "🏆 <b>Discord Roles:</b> Link your account in the player profile, and your Clash League rank (Silver, Diamond, etc.) will automatically sync with our Discord server!",
                "⚔️ <b>Clash Rules (No Draws):</b> We changed the game logic. If the 3x3 board fills up with no line of 3, there's no more draw. The player with the most claimed cells wins (e.g. 5 to 4)!",
                "👁️ <b>Board Preview:</b> After a thrilling Clash match, you can now click the 'Board Preview' button to analyze the final layout and guesses.",
                "📱 <b>Daily Share:</b> Massively improved the generated Daily result image. On PCs, the image is automatically copied to your clipboard (ready for Ctrl+V)!"
            ]
        },
        {
            version: "Beta v1.0.0", date: "18.07.2026",
            changes: [
                "🚀 <b>Welcome to BETA!</b> The game is fully stable and ready for wider testing by players.",
                "🛡️ <b>Anti-Cheat:</b> Secured the player drawing system. It is no longer possible to 'peek' at the rider in the site's code. 😎",
                "⌨️ <b>QoL:</b> Added the ability to quickly submit answers using the ENTER key.",
                "📱 <b>Mobile UI:</b> Fixed the bug causing the club history bar to stretch out of bounds on mobile screens. Added a visible horizontal scroll.",
                "💾 <b>Auto-save:</b> Restoring an unfinished Daily game now fully repopulates the 'Teams' bar."
            ]
        },
        {
            version: "Alpha v1.2.0", date: "05.07.2026",
            changes: [
                "⏱️ <b>Clash Atmosphere:</b> Added a heartbeat sound effect 🫀 when there are 10 seconds left to answer in league mode!",
                "🔨 <b>Ban System:</b> Introduced escalating time penalties (from 5 mins to 7 days!) for leaving a league match or switching browser tabs.",
                "📱 <b>Mobile:</b> Improved the club history scrolling bar on smaller phone screens."
            ]
        },
        {
            version: "Alpha v1.1.0", date: "20.06.2026",
            changes: [
                "💻 <b>New:</b> Completely new, professional main menu for PC players.",
                "🏆 <b>Achievements:</b> Added an Achievement Showcase in Profile! Earn titles like 'Eagle Eye' or 'Legend'.",
                "🏟️ <b>Background:</b> Added random background pictures of Polish stadiums.",
                "💡 <b>Hints:</b> After 5 failed attempts, you can reveal the length of the rider's name.",
                "📱 <b>Mobile:</b> Fixed screen-stretching bugs for riders with a long club history.",
                "💾 <b>Saves:</b> Added ability to save Daily progress mid-game and a 'Return Home' button 🏠.",
                "📢 <b>Changelog:</b> Added an updates tab (the one you are reading right now!)."
            ]
        },
        {
            version: "Alpha v1.0.5", date: "18.06.2026",
            changes: [
                "⚔️ <b>New Mode: Speedway Clash!</b> Play 1v1 tic-tac-toe with friends.",
                "📈 <b>League Ranks:</b> Added an ELO-based ranking system (from Bronze to Legend) for Clash.",
                "🐛 <b>Forms:</b> You can now report bugs and missing riders directly from the menu.",
                "🤝 <b>Local Play:</b> Play Clash locally with two players on one device."
            ]
        },
        {
            version: "Alpha v1.0.0", date: "12.06.2026",
            changes: [
                "🏁 <b>Alpha Premiere!</b> Daily Guessr and Endless Guessr modes are now live.",
                "📊 <b>Statistics:</b> Firebase integration (create profile via Google Account).",
                "🗓️ <b>Archive:</b> Play previous Daily games from the calendar."
            ]
        }
    ]
    // Możesz w przyszłości dodać sv: [...] i da: [...] dla Szwedów i Duńczyków
};

function checkUnseenUpdates() {
    const lastSeen = localStorage.getItem('speedwayLastSeenUpdate');
    
    // Szukamy kropek powiadomień w różnych miejscach (Mobile, Gra, PC)
    const badgeMobile = document.getElementById('updateBadge'); 
    const badgeGame = document.getElementById('updateBadgeGame');
    const badgeDesktop = document.getElementById('updateBadgeDesktop');
    
    const isUnseen = lastSeen !== CURRENT_GAME_VERSION;
    
    if (badgeMobile) badgeMobile.style.display = isUnseen ? 'block' : 'none';
    if (badgeGame) badgeGame.style.display = isUnseen ? 'block' : 'none';
    if (badgeDesktop) badgeDesktop.style.display = isUnseen ? 'inline-block' : 'none';
}

function renderUpdates() {
    const listEl = document.getElementById('updatesList');
    if (!listEl) return;
    listEl.innerHTML = '';

    // Sprawdzamy czy mamy tłumaczenie changelogu na obecny język, w innym wypadku bierzemy EN lub domyślnie PL
    let currentChangelog = changelog[currentLang] || changelog['en'] || changelog['pl'];

    currentChangelog.forEach((update, index) => {
        let isLatest = index === 0;
        let html = `
            <div class="update-block" ${isLatest ? 'style="border-color: var(--green-neon); background: rgba(0, 255, 102, 0.05);"' : ''}>
                <div class="update-version" ${isLatest ? 'style="color: var(--green-neon);"' : ''}>${update.version}</div>
                <div class="update-date">${update.date}</div>
                <ul class="update-list">
                    ${update.changes.map(change => `<li>${change}</li>`).join('')}
                </ul>
            </div>
        `;
        listEl.innerHTML += html;
    });
}

function openUpdates() {
    renderUpdates();
    const overlay = document.getElementById('updatesOverlay');
    if(overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => overlay.style.opacity = '1', 10);
    }
    
    // Zapisz, że gracz widział ten update i ukryj czerwoną kropkę
    localStorage.setItem('speedwayLastSeenUpdate', CURRENT_GAME_VERSION);
    checkUnseenUpdates();
}

function closeUpdates() {
    const overlay = document.getElementById('updatesOverlay');
    if(overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 300);
    }
}

// ==============================================
// ====== AUTORYZACJA I PROFIL GRACZA ===========
// ==============================================

auth.onAuthStateChanged(async (user) => {
    if (user) {
        playerId = user.uid;
        if (!playerNickname || playerNickname.startsWith('guest_') || playerNickname === "GoogleUser") {
            playerNickname = user.displayName || "Gracz";
            localStorage.setItem('speedwayNickname', playerNickname);
        }
        localStorage.setItem('speedwayUserId', playerId);
        updateAuthUI(user);
        
        // --- SPRAWDZANIE ADMINA NA SERWERZE ---
        await verifyAdminPermissions(user);

        syncStatsFromFirebase();
    } else {
        applyAdminState(false);
        updateAuthUI(null);
    }
});

async function verifyAdminPermissions(user) {
    try {
        console.log("🔍 Sprawdzanie uprawnień dla UID:", user.uid);
        const idToken = await user.getIdToken(true); 
        const checkAdminFunc = functions.httpsCallable('checkAdminStatus');
        
        const res = await checkAdminFunc({ firebaseToken: idToken });

        console.log("DANE Z SERWERA:", res.data);

        if ((res.data && res.data.isAdmin === true) || (res.data && res.data.isTester === true)) {
            applyAdminState(res.data.isAdmin, res.data.isTester);
            
            if (res.data.isAdmin) {
                console.log("👑 ZALOGOWANO JAKO ADMINISTRATOR!");
                showToast("👑 Zalogowano jako Administrator", "success");
            } else {
                console.log("🧪 ZALOGOWANO JAKO TESTER!");
                showToast("🧪 Zalogowano jako Tester", "success");
            }
        } else {
            applyAdminState(false, false);
            console.warn("⛔ Serwer zgłosił: Brak uprawnień administratora/testera dla UID:", res.data && res.data.verifiedUid);
        }
    } catch (e) {
        console.error("❌ Błąd podczas weryfikacji ról na serwerze:", e);
        applyAdminState(false, false);
    }
}

function signInWithGoogle() {
    auth.signInWithPopup(provider).then((result) => {
        console.log("Zalogowano z profilu:", result.user.displayName);
    }).catch((error) => console.error("Login failed", error));
}

function signInWithGooglePrompt() {
    document.getElementById('nickOverlay').style.display = 'none';
    document.getElementById('nickOverlay').style.opacity = '0';
    
    auth.signInWithPopup(provider).then((result) => {
        if (window.nickCallback) { window.nickCallback(); window.nickCallback = null; }
    }).catch((err) => {
        console.error("Błąd logowania:", err);
        alert("Logowanie anulowane. Spróbuj ponownie lub zagraj jako Gość.");
    });
}

function logOut() { auth.signOut(); }

function updateAuthUI(user) {
    const btn = document.getElementById('btnProfileLogin');
    const info = document.getElementById('userInfoDisplayProfile');
    if (!btn || !info) return; 
    
    if (user) {
        btn.innerHTML = t('btnLogout');
        btn.onclick = logOut;
        btn.style.background = "#e74c3c";
        info.innerText = `Konto Google: ${user.displayName}`; // Można to zostawić, bo pobiera nazwę z Google
        info.style.display = 'block';
    } else {
        btn.innerHTML = `<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" width="16" height="16" alt="G"> ` + t('btnLoginGoogle');
        btn.onclick = signInWithGoogle;
        btn.style.background = "#4285F4";
        info.style.display = 'none';
    }
}

async function syncStatsFromFirebase() {
    if (!auth.currentUser) return;
    try {
        const docRef = await db.collection('users').doc(auth.currentUser.uid).get();
        if (docRef.exists && docRef.data().stats) {
            let cloudStats = JSON.parse(docRef.data().stats);
            // Bezpieczne wczytanie danych bez utraty wewnątrz przypisania:
            userStats = { ...userStats, ...cloudStats };
            ensureLeagueStats(userStats);
            localStorage.setItem('speedwayStatsV2', JSON.stringify(userStats));
            updateLeagueUI();
            updateDiscordButtonUI();
        }
        // Dopiero tutaj, mając pewność chmurowych statystyk, ładujemy ranking
        syncLeagueScoreToFirebase();
    } catch (e) { console.error("Cloud Sync Load Error:", e); }
}


function ensureLeagueStats(stats) {
    if (!stats.clashLeague) stats.clashLeague = { matchesPlayed: 0, wins: 0, losses: 0, draws: 0, elo: 1000 };
    if (typeof stats.clashLeague.abandons !== 'number') stats.clashLeague.abandons = 0; 
    if (typeof stats.clashLeague.banUntil !== 'number') stats.clashLeague.banUntil = 0; 
    if (typeof stats.clashLeague.tabSwitches !== 'number') stats.clashLeague.tabSwitches = 0;
    
    // Pancerne zabezpieczenie: jeśli ELO zepsuło się i jest "NaN" lub "null", przywróć do 1000
    if (isNaN(stats.clashLeague.elo) || stats.clashLeague.elo === null) {
        stats.clashLeague.elo = 1000;
    }
    return stats;
}

// System przyznawania banów
function applyMatchmakingBan(reasonText) {
    ensureLeagueStats(userStats);
    userStats.clashLeague.abandons++;
    
    let banMinutes = 0;
    const offenses = userStats.clashLeague.abandons;
    
    // Eskalacja Kar
    if (offenses === 1) banMinutes = 5;          // 1 wyjście = 5 min
    else if (offenses === 2) banMinutes = 30;    // 2 wyjścia = 30 min
    else if (offenses === 3) banMinutes = 120;   // 3 wyjścia = 2 godziny
    else if (offenses === 4) banMinutes = 1440;  // 4 wyjścia = 24 godziny
    else banMinutes = 10080;                     // 5+ wyjść = 7 DNI

    userStats.clashLeague.banUntil = Date.now() + (banMinutes * 60000);
    saveStats();

    setTimeout(() => {
        let czasTxt = banMinutes >= 1440 ? `${banMinutes/1440} dni` : (banMinutes >= 60 ? `${banMinutes/60} godz.` : `${banMinutes} min.`);
        appAlert(`KARA ZA NIESPORTOWE ZACHOWANIE ⚠️\n\nPowód: ${reasonText}\nTwoje konto ligowe zostało zablokowane na: ${czasTxt}.\nKolejne przewinienia będą surowiej karane!`, "KARA CZASOWA");
    }, 1000);
}

function getLeagueRankName(elo, matchesPlayed) {
    if (matchesPlayed < 5) return `KALIBRACJA (${matchesPlayed}/5)`;
    if (elo < 900) return 'BRĄZ';
    if (elo < 1100) return 'SREBRO';
    if (elo < 1300) return 'ZŁOTO';
    if (elo < 1500) return 'PLATYNA';
    if (elo < 1700) return 'DIAMENT';
    return 'LEGENDA';
}

function getLeagueBadgeColor(elo, matchesPlayed) {
    if (matchesPlayed < 5) return 'var(--text-dim)';
    if (elo < 900) return '#b87333';
    if (elo < 1050) return '#d8d8d8';
    if (elo < 1200) return '#f1c40f';
    if (elo < 1350) return '#9ad7ff';
    if (elo < 1500) return '#6fffe9';
    return '#ff5fd7';
}

function getLeagueDisplayText() {
    const league = userStats.clashLeague || { matchesPlayed: 0, elo: 1000 };
    return `${getLeagueRankName(league.elo, league.matchesPlayed)} • ELO ${Math.round(league.elo)} • ${league.matchesPlayed} MECZ/Y`;
}

async function syncStatsToFirebase() {
    // Ranking ELO wysyłamy ZAWSZE (nawet jako Gość)
    await syncLeagueScoreToFirebase();

    // Zapis statystyk profilu i archiwum zostawiamy tylko dla zalogowanych (Google)
    if (!auth.currentUser) return;
    try {
        await db.collection('users').doc(auth.currentUser.uid).set({
            stats: JSON.stringify(userStats),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) { console.error("Cloud Sync Save Error:", e); }
}


// --- SYSTEM ŁĄCZENIA Z DISCORDEM ---

const DISCORD_CLIENT_ID_FRONTEND = "1529508407441100840";

function startDiscordLinking() {
    if (!auth.currentUser) {
        appAlert("Musisz być najpierw zalogowany w grze (Google), aby połączyć konto Discord!", "Błąd");
        return;
    }
    
    // Dynamiczny adres (zawsze poprawny, z www lub bez)
    let currentUrl = window.location.origin + "/";
    let dynamicRedirectUri = encodeURIComponent(currentUrl);
    
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID_FRONTEND}&redirect_uri=${dynamicRedirectUri}&response_type=code&scope=identify`;
    window.location.href = authUrl; 
}

// Aktualizuje wygląd przycisku Discorda w Profilu
function updateDiscordButtonUI() {
    const btn = document.getElementById('btnLinkDiscord');
    if (!btn) return;

    if (userStats.discordLinked && userStats.discordUsername) {
        // Jeśli połączono: Zmień na zielony i zablokuj klikanie
        btn.innerHTML = `<span style="font-size: 18px;">✅</span> POŁĄCZONO: ${userStats.discordUsername}`;
        btn.style.background = "rgba(46, 204, 113, 0.15)"; 
        btn.style.border = "1px solid #2ecc71";
        btn.style.color = "#2ecc71";
        btn.style.cursor = "default";
        btn.onclick = () => { showToast("Konto jest już połączone!", "normal"); };
    } else {
        // Jeśli nie połączono: Domyślny, fioletowy przycisk
        btn.innerHTML = `<span style="font-size: 18px;">👾</span> POŁĄCZ Z DISCORDEM`;
        btn.style.background = "#5865F2";
        btn.style.border = "none";
        btn.style.color = "white";
        btn.style.cursor = "pointer";
        btn.onclick = startDiscordLinking;
    }
}

async function handleDiscordCallback(savedCode = null) {
    const urlParams = new URLSearchParams(window.location.search);
    const code = savedCode || urlParams.get('code');

    if (code) {
        if (!auth.currentUser) {
            // Czekamy aż Firebase odzyska sesję po przeładowaniu strony
            setTimeout(() => handleDiscordCallback(code), 500);
            return;
        }

        window.history.replaceState({}, document.title, window.location.pathname);
        showToast("Łączenie z kontem Discord... ⏳", "normal");

        try {
            // WYMUSZAMY pobranie świeżego tokena z Firebase
            const idToken = await auth.currentUser.getIdToken(true);
            const currentUrl = window.location.origin + "/"; 

            console.log("=== DIAGNOSTYKA WYSYŁKI ===");
            console.log("KOD:", code);
            console.log("URL:", currentUrl);
            console.log("TOKEN:", idToken ? "Wygenerowany poprawnie!" : "BRAK TOKENA!");

            // Jeśli przeglądarka zawiodła i nie wygenerowała tokena - blokujemy wysyłkę
            if (!idToken) {
                appAlert("Twoja przeglądarka nie wygenerowała klucza sesji. Odśwież stronę i spróbuj ponownie.", "Błąd Sesji");
                return;
            }

            const linkFunc = functions.httpsCallable('linkDiscordAccount');
            
            // Przesyłamy token ręcznie wewnątrz zapytania do serwera (zmieniona nazwa)
            const response = await linkFunc({ 
                code: code,
                redirectUri: currentUrl,
                firebaseToken: idToken 
            });
            
            if (response.data.success) {
                appAlert(`Pomyślnie połączono z kontem Discord: ${response.data.discordUsername}! 👾\nTwoje rangi ligowe będą teraz aktualizowane na serwerze!`, "Sukces");
                userStats.discordLinked = true;
                userStats.discordUsername = response.data.discordUsername;
                saveStats();
                updateDiscordButtonUI();
            }
        } catch (error) {
            console.error("Szczegóły błędu łączenia:", error);
            appAlert(`Błąd z serwera: ${error.message}`, "Błąd Systemowy");
        }
    }
}

// Nasłuchujemy logowania Firebase'a, by odpalić funkcję
window.addEventListener('load', () => {
    if (window.location.search.includes('code=')) {
        auth.onAuthStateChanged((user) => {
            if (user) handleDiscordCallback();
        });
    }
});

function openProfile() {
    document.getElementById('profileStatPlayed').innerText = userStats.played; 
    document.getElementById('profileStatWon').innerText = userStats.won;
    document.getElementById('profileStatStreak').innerText = userStats.currentStreak; 
    document.getElementById('profileStatMax').innerText = userStats.maxStreak;
    document.getElementById('changeNickInput').value = playerNickname || "";
    
    ensureClubStat(userStats);
    document.getElementById('currentClubDisplay').innerHTML = userStats.favoriteClub ? `KLUB: <b>${userStats.favoriteClub}</b>` : "WYBIERZ KLUB 🛡️";
    
    // TUTAJ USUNĘLIŚMY renderAchievements(); !
    
    const overlay = document.getElementById('profileOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeProfile() {
    const overlay = document.getElementById('profileOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
}

function openClubSelectModal() {
    document.getElementById('profileOverlay').style.opacity = '0';
    setTimeout(() => document.getElementById('profileOverlay').style.display = 'none', 300);

    const overlay = document.getElementById('clubSelectOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);

    // Generowanie list
    const generateList = (containerId, leagueArray) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        leagueArray.forEach(club => {
            const btn = document.createElement('button');
            const isActive = userStats.favoriteClub === club ? 'active' : '';
            btn.className = `club-select-btn ${isActive}`;
            btn.innerText = club;
            btn.onclick = () => saveFavoriteClub(club);
            container.appendChild(btn);
        });
    }

    generateList('league1Clubs', LEAGUES_DB.ext);
    generateList('league2Clubs', LEAGUES_DB.m2e);
    generateList('league3Clubs', LEAGUES_DB.klz);
}

function closeClubSelectModal() {
    const overlay = document.getElementById('clubSelectOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
    openProfile(); // Powrót do profilu
}

function saveFavoriteClub(clubName) {
    ensureClubStat(userStats);
    userStats.favoriteClub = clubName;
    saveStats();
    
    // Aktualizujemy wyświetlacz w profilu i na karcie w Clashu na żywo
    const currentClubDisplay = document.getElementById('currentClubDisplay');
    if (currentClubDisplay) currentClubDisplay.innerHTML = clubName ? `KLUB: <b>${clubName}</b>` : "WYBIERZ KLUB 🛡️";
    
    const clashMenuNick = document.getElementById('clashMenuNick');
    if (clashMenuNick) clashMenuNick.innerHTML = (playerNickname || "GRACZ") + getMiniClubBadge(clubName);
    
    showToast(clubName ? `Zapisano! Reprezentujesz: ${clubName}` : "Usunięto przynależność klubową", "success");
    closeClubSelectModal();
}



// ==============================================
// ====== SYSTEM OSIĄGNIĘĆ (PIONOWA GABLOTA) ====
// ==============================================

const ACHIEVEMENTS_DB = [
    { id: 'first_try', icon: '🦅', title: 'Sokole Oko', desc: 'Zgadnij zawodnika w 1. próbie.' },
    { id: 'close_call', icon: '😅', title: 'O włos', desc: 'Zgadnij zawodnika w ostatniej, 10. próbie.' },
    { id: 'no_hint_1', icon: '🧠', title: 'Bystrzak', desc: 'Wygraj grę bez użycia podpowiedzi.' },
    { id: 'no_hint_5', icon: '📚', title: 'Chodząca Encyklopedia', desc: 'Wygraj 5 gier z rzędu bez podpowiedzi.' },
    { id: 'play_10', icon: '🕹️', title: 'Rozgrzewka', desc: 'Rozegraj łącznie 10 gier.' },
    { id: 'play_50', icon: '🎮', title: 'Maniak', desc: 'Rozegraj łącznie 50 gier.' },
    { id: 'streak_3', icon: '🔥', title: 'Gorąca Seria I', desc: 'Osiągnij Win Streak równy 3.' },
    { id: 'streak_7', icon: '☄️', title: 'Gorąca Seria II', desc: 'Osiągnij Win Streak równy 7.' },
    { id: 'streak_15', icon: '🌋', title: 'Gorąca Seria III', desc: 'Osiągnij Win Streak równy 15.' },
    { id: 'clash_1', icon: '⚔️', title: 'Pierwsza Krew', desc: 'Wygraj swój pierwszy mecz w Speedway Clash.' },
    { id: 'clash_10', icon: '🛡️', title: 'Gladiator', desc: 'Wygraj 10 meczów w Clashu.' },
    { id: 'clash_50', icon: '👑', title: 'Dominator', desc: 'Wygraj 50 meczów w Clashu.' },
    { id: 'clash_flawless', icon: '🛑', title: 'Bezbłędny Clash!', desc: 'Wygraj mecz ligowy, nie oddając przeciwnikowi ani jednego pola.' },
    { id: 'rank_silver', icon: '🥈', title: 'Srebrny Lis', desc: 'Awansuj do rangi Srebro w lidze Clash.' },
    { id: 'rank_gold', icon: '🥇', title: 'Złoty Chłopak', desc: 'Awansuj do rangi Złoto w lidze Clash.' },
    { id: 'rank_diamond', icon: '💎', title: 'Żużlowa Elita', desc: 'Awansuj do rangi Diament w lidze Clash.' },
    { id: 'clash_legend', icon: '🐐', title: 'Żywa Legenda', desc: 'Osiągnij najwyższą rangę: Legenda.' },
    { id: 'ta_10', icon: '⏱️', title: 'Time Attack Ekspert I', desc: 'Odgadnij 10 zawodników w jednej grze Time Attack.' },
    { id: 'ta_20', icon: '⏱️', title: 'Time Attack Ekspert II', desc: 'Odgadnij 20 zawodników w jednej grze Time Attack.' },
    { id: 'ta_30', icon: '⏱️', title: 'Time Attack Ekspert III', desc: 'Odgadnij 30 zawodników w jednej grze Time Attack.' },
    { id: 'ta_50', icon: '⏱️', title: 'Time Attack Ekspert IV', desc: 'Odgadnij 50 zawodników w jednej grze Time Attack.' },
    { id: 'ta_100', icon: '⏱️', title: 'Time Attack God', desc: 'Odgadnij 100 zawodników w jednej grze Time Attack.' },
    { id: 'easter_club', icon: '🏟️', title: 'Klubowe Barwy', desc: 'Wybierz swój ulubiony klub w profilu gracza.' },
    { id: 'easter_lang', icon: '🌍', title: 'Poliglota', desc: 'Zmień język gry w Ustawieniach.' },
    { id: 'easter_theme', icon: '🌗', title: 'Dwa Oblicza', desc: 'Zmień motyw gry (Jasny/Ciemny).' }
];

function ensureAchievementsStats() {
    if(!userStats.achievements) userStats.achievements = [];
    if(!userStats.achievementsDates) userStats.achievementsDates = {}; 
    if(!userStats.trackers) userStats.trackers = { winsNoHint: 0, flawlessClash: false };
    
    // Dodajemy bezpieczne trackery dla nowych osiągnięć
    if(typeof userStats.trackers.changedLang === 'undefined') userStats.trackers.changedLang = false;
    if(typeof userStats.trackers.changedTheme === 'undefined') userStats.trackers.changedTheme = false;
}

function checkAchievements() {
    ensureAchievementsStats();
    let unlockedAny = false;
    const nowStr = new Date().toLocaleDateString();

    const conditions = {
        'first_try': () => hasWon && guessCount === 1,
        'close_call': () => hasWon && guessCount === 10,
        'no_hint_1': () => userStats.trackers.winsNoHint >= 1,
        'no_hint_5': () => userStats.trackers.winsNoHint >= 5,
        'play_10': () => userStats.played >= 10,
        'play_50': () => userStats.played >= 50,
        'streak_3': () => userStats.currentStreak >= 3,
        'streak_7': () => userStats.currentStreak >= 7,
        'streak_15': () => userStats.currentStreak >= 15,
        'clash_1': () => userStats.clashLeague && userStats.clashLeague.wins >= 1,
        'clash_10': () => userStats.clashLeague && userStats.clashLeague.wins >= 10,
        'clash_50': () => userStats.clashLeague && userStats.clashLeague.wins >= 50,
        'clash_flawless': () => userStats.trackers.flawlessClash === true,
        'rank_silver': () => userStats.clashLeague && userStats.clashLeague.elo >= 476,
        'rank_gold': () => userStats.clashLeague && userStats.clashLeague.elo >= 951,
        'rank_diamond': () => userStats.clashLeague && userStats.clashLeague.elo >= 2751,
        'clash_legend': () => userStats.clashLeague && userStats.clashLeague.elo >= 4001,
        'ta_10': () => userStats.timeAttack && userStats.timeAttack.highestScore >= 10,
        'ta_20': () => userStats.timeAttack && userStats.timeAttack.highestScore >= 20,
        'ta_30': () => userStats.timeAttack && userStats.timeAttack.highestScore >= 30,
        'ta_50': () => userStats.timeAttack && userStats.timeAttack.highestScore >= 50,
        'ta_100': () => userStats.timeAttack && userStats.timeAttack.highestScore >= 100,
        'easter_club': () => userStats.favoriteClub !== null && userStats.favoriteClub !== undefined,
        // NOWE WARUNKI:
        'easter_lang': () => userStats.trackers && userStats.trackers.changedLang === true,
        'easter_theme': () => userStats.trackers && userStats.trackers.changedTheme === true
    };

    Object.keys(conditions).forEach(id => {
        if (!userStats.achievements.includes(id) && conditions[id] && conditions[id]()) {
            userStats.achievements.push(id);
            userStats.achievementsDates[id] = nowStr;
            const ach = ACHIEVEMENTS_DB.find(a => a.id === id);
            setTimeout(() => showToast(`🏆 Osiągnięcie: ${ach.title}!`, 'success'), 1000);
            unlockedAny = true;
        }
    });

    if(unlockedAny) saveStats();
}

function openAchievementsModal() {
    document.getElementById('profileOverlay').style.opacity = '0';
    setTimeout(() => document.getElementById('profileOverlay').style.display = 'none', 300);

    ensureAchievementsStats();
    const overlay = document.getElementById('achievementsOverlay');
    const listContainer = document.getElementById('achievementsListContainer');
    listContainer.innerHTML = '';

    const total = ACHIEVEMENTS_DB.length;
    const unlockedCount = userStats.achievements.length;
    const pct = Math.round((unlockedCount / total) * 100);

    // Animacja paska postępu
    document.getElementById('achProgressText').innerText = `ZDOBYTO ${unlockedCount} Z ${total} OSIĄGNIĘĆ`;
    document.getElementById('achProgressPct').innerText = `(${pct}%)`;
    document.getElementById('achProgressBarFill').style.width = '0%';
    setTimeout(() => { document.getElementById('achProgressBarFill').style.width = `${pct}%`; }, 100);

    // Sortowanie: odblokowane u góry, zablokowane na dole
    const sortedAch = [...ACHIEVEMENTS_DB].sort((a, b) => {
        let aUnl = userStats.achievements.includes(a.id) ? 1 : 0;
        let bUnl = userStats.achievements.includes(b.id) ? 1 : 0;
        return bUnl - aUnl;
    });

    sortedAch.forEach(ach => {
        const isUnlocked = userStats.achievements.includes(ach.id);
        const lockClass = isUnlocked ? '' : 'locked';
        const dateStr = isUnlocked ? `${userStats.achievementsDates[ach.id] || 'NIEDAWNO'}` : 'ZABLOKOWANE';
        const iconRender = isUnlocked ? ach.icon : '🔒';
        
        listContainer.innerHTML += `
            <div class="ach-row ${lockClass}">
                <div class="ach-row-icon">${iconRender}</div>
                <div class="ach-row-info">
                    <span class="ach-row-title">${ach.title}</span>
                    <span class="ach-row-desc">${ach.desc}</span>
                </div>
                <div class="ach-row-meta">
                    <span class="ach-row-date">${dateStr}</span>
                </div>
            </div>
        `;
    });

    overlay.style.display = 'block'; 
    setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeAchievementsModal() {
    const overlay = document.getElementById('achievementsOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
    openProfile();
}

// ==============================================
// ====== BEZPIECZEŃSTWO I NICKI (ANTI-CHEAT) ===
// ==============================================

// Normalization helper: remove diacritics, replace leet, strip non-alphanumerics
function normalizeForCheck(str) {
    if (!str) return '';
    let s = String(str).toLowerCase();
    // Unicode normalize and remove diacritics
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    // Common leet and symbol replacements
    s = s.replace(/[@4]/g, 'a').replace(/3/g, 'e').replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/8/g, 'b');
    // Remove any non-alphanumeric characters (keep letters and digits)
    s = s.replace(/[^a-z0-9]/g, '');
    return s;
}

const badWordsList = [
    // Polish
    "kurwa", "kurwy", "kurwa", "kurew", "kurwi", "skurwysyn", "skurwiel",
    "jebać", "jebac", "jebany", "jebana", "zjeb", "zajeb", "odjeb", "wyjeb", "podjeb",
    "pierdol", "spierdal", "wypierdal", "zapierdal", "podpierdal",
    "chuj", "chuju", "chuja", "chujo", "cwel", "szmata", "szmato",
    "dziwka", "dziwko", "suka", "suko", "pizda", "pizdo", "kutas", "kutasiarz",
    "pedal", "pedał", "ciota", "czarnuch", "ruchanie", "ruchac", "ruchać", "sukinsyn",
    // English
    "fuck", "fucker", "fucking", "bitch", "cunt", "shit", "asshole", "ass", "bullshit", "damn", "bastard", "dickhead", "dumbass", "prick", "whore", "slut", "motherfucker", "bloody", "bollocks", "bugger",
    // Spanish
    "puta", "puto", "joder", "coño", "cabron", "gilipollas", "mierda", "polla", "zorra",
    // French
    "pute", "putain", "merde", "encule", "enculé", "connard", "salope",
    // German
    "scheisse", "scheiße", "arschloch", "fick", "ficken", "wichser", "fotze",
    // Italian
    "cazzo", "stronzo", "puttana", "vaffanculo",
    // Portuguese
    "porra", "caralho", "merda", "foda", "fodase", "foda-se",
    // Russian (transliterated)
    "blyat", "blyat'", "suka", "pizda", "pidor", "yebat", "ebat",
    // Turkish (transliterated)
    "orospu", "siktir", "sik", "sikdir",
    // Dutch / Belgian
    "klootzak", "kut", "kanker",
    // Swedish / Danish / Norwegian
    "fan", "helvete", "javla", "jävla", "skit", "forhelvede",
    // Common internet shorthands
    "stfu", "kys",
    // Racial slurs and highly offensive terms (kept for moderation)
    "nigger", "nigga", "faggot", "retard",
    // Other explicit/harmful terms
    "pedophile", "porn", "porno"
];

// Precompute normalized bad words for faster checks
const badWordsNormalized = badWordsList.map(w => normalizeForCheck(w)).filter(Boolean);

function isNickClean(nick) {
    const normalized = normalizeForCheck(nick);
    if (!normalized) return true;
    for (let bad of badWordsNormalized) {
        if (!bad) continue;
        if (normalized.includes(bad)) return false;
    }
    return true;
}

function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

const nativeAlert = window.alert ? window.alert.bind(window) : null;

function showAppModal({ title = "Komunikat", message = "", confirmText = "OK", cancelText = null, danger = false } = {}) {
    const overlay = document.getElementById('appModalOverlay');
    const titleEl = document.getElementById('appModalTitle');
    const messageEl = document.getElementById('appModalMessage');
    const confirmBtn = document.getElementById('appModalConfirm');
    const cancelBtn = document.getElementById('appModalCancel');

    return new Promise(resolve => {
        if (!overlay || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
            if (nativeAlert) nativeAlert(String(message || title));
            resolve(true);
            return;
        }

        titleEl.innerText = title;
        messageEl.innerHTML = "";
        String(message || "").split("\n").forEach((line, idx) => {
            if (idx > 0) messageEl.appendChild(document.createElement('br'));
            messageEl.appendChild(document.createTextNode(line));
        });

        confirmBtn.innerText = confirmText;
        confirmBtn.classList.toggle('is-danger', danger);
        cancelBtn.innerText = cancelText || "";
        cancelBtn.style.display = cancelText ? 'block' : 'none';

        const close = result => {
            overlay.style.opacity = '0';
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            setTimeout(() => {
                overlay.style.display = 'none';
                resolve(result);
            }, 180);
        };

        confirmBtn.onclick = () => close(true);
        cancelBtn.onclick = () => close(false);
        overlay.style.display = 'block';
        setTimeout(() => overlay.style.opacity = '1', 10);
    });
}

function appAlert(message, title = "Komunikat") {
    return showAppModal({ title, message, confirmText: "OK" });
}

function appConfirm(message, { title = "Potwierdzenie", confirmText = "POTWIERDŹ", cancelText = "ANULUJ", danger = false } = {}) {
    return showAppModal({ title, message, confirmText, cancelText, danger });
}

try {
    window.alert = message => { appAlert(message); };
} catch (e) {}

async function isNickTaken(nickToCheck) {
    try {
        const snapshot = await db.collection("leaderboard_alltime").doc("global").collection("scores").where("nick", "==", nickToCheck).get();
        let taken = false;
        snapshot.forEach(doc => { if (doc.id !== playerId) taken = true; });
        return taken;
    } catch (e) { console.error("Błąd weryfikacji:", e); return false; }
}

function promptForNick(callback) {
    if (playerNickname && playerId && !playerId.startsWith('guest_')) { callback(); } 
    else if (playerNickname) { callback(); } 
    else {
        const overlay = document.getElementById('nickOverlay');
        overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10); 
        window.nickCallback = callback; 
    }
}

async function saveNick() {
    let input = document.getElementById('nickInput').value.trim();
    if (input.length < 3) { alert("Nick musi mieć minimum 3 znaki!"); return; }
    if (!isNickClean(input)) { alert("Ten nick narusza zasady. Wybierz inny."); document.getElementById('nickInput').value = ""; return; }

    let safeInput = escapeHTML(input); 
    const btn = document.querySelector('#nickOverlay .btn-reset');
    const originalText = btn.innerText; btn.innerText = "SPRAWDZANIE..."; btn.disabled = true;

    const taken = await isNickTaken(safeInput);
    if (taken) { alert("Ten nick jest już zajęty przez innego gracza! Wymyśl inny."); btn.innerText = originalText; btn.disabled = false; return; }

    playerNickname = safeInput;
    localStorage.setItem('speedwayNickname', playerNickname);
    
    const overlay = document.getElementById('nickOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
    btn.innerText = originalText; btn.disabled = false;
    if (window.nickCallback) { window.nickCallback(); window.nickCallback = null; }
}

async function changeNickname() {
    const inputEl = document.getElementById('changeNickInput'); const btn = document.getElementById('btnChangeNick');
    let newNick = inputEl.value.trim();

    if(newNick === playerNickname) { alert("To jest Twój obecny nick!"); return; }
    if (newNick.length < 3) { alert("Nick musi mieć minimum 3 znaki!"); return; }
    if (!isNickClean(newNick)) { alert("Ten nick narusza zasady. Wybierz inny."); inputEl.value = playerNickname || ""; return; }

    let safeInput = escapeHTML(newNick); 
    const originalText = btn.innerText; btn.innerText = "⏳"; btn.disabled = true;

    const taken = await isNickTaken(safeInput);
    if (taken) { alert("Ten nick jest już zajęty! Wymyśl inny."); btn.innerText = originalText; btn.disabled = false; return; }

    playerNickname = safeInput; localStorage.setItem('speedwayNickname', playerNickname);
    alert("Twój nick został zmieniony! Będzie użyty do zapisania kolejnego wyniku.");
    btn.innerText = "GOTOWE!"; setTimeout(() => { btn.innerText = originalText; btn.disabled = false; }, 2000);
}

// ==============================================
// ====== SLOWNIKI I DANE KONFIGURACYJNE ========
// ==============================================

const clubAbbreviations = {
    "unia leszno": "LES", "falubaz zielona góra": "ZIE", "stal gorzów wielkopolski": "GOR",
    "stal gorzów": "GOR", "motor lublin": "LUB", "sparta wrocław": "WRO", "apator toruń": "TOR",
    "włókniarz częstochowa": "CZE", "gkm grudziądz": "GRU", "unia tarnów": "TAR",
    "polonia bydgoszcz": "BYD", "wybrzeże gdańsk": "GDA", "ostrovia ostrów wielkopolski": "OST",
    "ostrovia ostrów": "OST", "stal rzeszów": "RZE", "row rybnik": "RYB", "psż poznań": "POZ",
    "kolejarz opole": "OPO", "orzeł łódź": "LOD", "polonia piła": "PIŁ", "start gniezno": "GNI",
    "kolejarz rawicz": "RAW", "landshut devils": "LAN", "wilki krosno": "KRO", "lokomotiv daugavpils": "DAU",
    "speedway kraków": "KRA", "gwardia warszawa": "WAR",
    "brak klubu": "➖", "brak": "➖", "zawieszenie": "🚫", "kontuzja": "🚑", "koniec kariery": "❌", "aresztowanie": "🚓"
};

const countryToCode = { "Polska": "pl", "Wielka Brytania": "gb", "Dania": "dk", "Australia": "au", "Szwecja": "se", "Słowacja": "sk", "Rosja": "ru", "Łotwa": "lv", "Niemcy": "de", "Francja": "fr", "Słowenia": "si", "USA": "us", "Norwegia": "no", "Ukraina": "ua", "Finlandia": "fi", "Czechy": "cz", "Włochy": "it", "Hiszpania": "es" };

const LEAGUES_DB = {
    ext: ["Motor Lublin", "Sparta Wrocław", "Apator Toruń", "Stal Gorzów", "Włókniarz Częstochowa", "GKM Grudziądz", "Falubaz Zielona Góra", "Unia Leszno"],
    m2e: ["Polonia Bydgoszcz", "Ostrovia Ostrów", "Wilki Krosno", "PSŻ Poznań", "Stal Rzeszów", "Orzeł Łódź", "ROW Rybnik", "Polonia Piła"],
    klz: ["Kolejarz Opole", "Landshut Devils", "Lokomotiv Daugavpils", "Speedway Kraków", "Start Gniezno", "Wybrzeże Gdańsk", "Śląsk Świętochłowice", "Unia Tarnów", "Kolejarz Rawicz"]
};

// Zabezpieczenie statystyk profilu
function ensureClubStat(stats) {
    if (typeof stats.favoriteClub === 'undefined') stats.favoriteClub = null;
}

function getMiniClubBadge(clubName) {
    if (!clubName || clubName === "null" || clubName === "undefined") return '';
    return ` <span style="font-size: 11px; color: var(--text-dim); font-weight: 600; text-transform: none;">(${clubName})</span>`;
}


// ==============================================
// ====== SŁOWNIK I18N I TŁUMACZENIA ============
// ==============================================

// ==============================================
// ====== SŁOWNIK I18N I TŁUMACZENIA ============
// ==============================================

const i18n = {
    pl: {
        account: "TWÓJ PROFIL", loginDesc: "Zaloguj się przez Google, aby zsynchronizować postęp!", btnLoginGoogle: "ZALOGUJ PRZEZ GOOGLE", orGuest: "LUB PODAJ NICK GOŚCIA", guestPlaceholder: "Wpisz nick (max 12 znaków)", btnSavePlay: "ZAPISZ I GRAJ", btnLogout: "WYLOGUJ SIĘ",
        settingsTitle: "USTAWIENIA", sound: "Dźwięk:", soundOn: "Włączony 🔊", soundOff: "Wyłączony 🔇",
        subtitle: "Edycja Żużlowa", lastGames: "Ostatnie gry:", btnDaily: "Graj Daily", btnReview: "Przejrzyj grę", btnEndless: "Endless Guessr", searchPlaceholder: "Wpisz imię/nazwisko zawodnika...", btnGuess: "ZGADNIJ",
        teams: "Drużyny:", colName: "Zawodnik", colCountry: "Kraj", colYear: "Rok ur.", colGP: "Jeździ/ił w GP?", colDMP: "Medale DMP", colStatus: "Status", colClubs: "Historia Klubów",
        stats: "STATYSTYKI", statPlayed: "Rozegrane", statWon: "Wygrane", statStreak: "Obecna Seria", statMax: "Najlepsza Seria", btnClose: "ZAMKNIJ", archive: "ARCHIWUM DAILY",
        winTitle: "BRAWO!", winSub: "Odgadłeś zawodnika!", loseTitle: "KONIEC PRÓB", loseSub: "Niestety, nie udało Ci się odgadnąć.", btnShare: "UDOSTĘPNIJ 📋", btnPlayEndless: "GRAJ W TRYB ENDLESS", btnPlayAgain: "ZAGRAJ PONOWNIE", btnMenu: "MENU GŁÓWNE", 
        theme: "Motyw:", themeLight: "Jasny", themeDark: "Ciemny", themeSystem: "System", lang: "Język:", modeDaily: "Tryb: Daily", modeEndless: "Tryb: Endless",
        tabDaily: "DZIENNY", tabWeekly: "TYDZIEŃ", tabMonthly: "MIESIĄC", tabAllTime: "OGÓLNY", rankWonToday: "Wygrane", rankTotalWins: "Suma Wygranych", rankGuesses: "Próby",
        months: ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"], weekdays: ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"],
        clashTitle: "⚔️ Speedway Clash", clashFriendly: "Mecz Towarzyski", clashFriendlyDesc: "(Graj ze znajomym)", clashLobbyTitle: "🤝 Mecz Towarzyski", clashHost: "UTWÓRZ POKÓJ (HOST)", clashJoinCode: "KOD POKOJU...", clashJoinBtn: "DOŁĄCZ", clashYourCode: "Twój kod pokoju:", clashWaiting: "Oczekiwanie na przeciwnika...", clashReady: "JESTEM GOTÓW", clashTime: "Czas na odpowiedź:", clashSurrender: "PODDAJ SIĘ / WYJDŹ", clashClaim: "PRZEJMIJ POLE", clashConfirm: "POTWIERDŹ", clashCancel: "ANULUJ", clashSeries: "WYNIK SERII", clashRematch: "ZAGRAJ REWANŻ", clashQuit: "ZAKOŃCZ I WYJDŹ", clashRulesTitle: "Zasady gry: Speedway Clash ⚔️", clashRules1: "Gra toczy się na planszy 3x3 na zasadach 'Kółko i Krzyżyk'.", clashRules2: "Aby przejąć pole, kliknij w nie i podaj zawodnika, który reprezentował oba krzyżujące się kluby.", clashRules3: "Pamiętaj, że liczy się cała polska historia zawodnika (bez zagranicznych lig).", clashRules4: "Masz 2 minuty na odpowiedź! Jeśli czas minie lub podasz złą odpowiedź, tracisz turę.", clashRules5: "Wygrywa gracz, który jako pierwszy połączy 3 swoje pola w linii!", clashUnderstood: "ZROZUMIANO, WCHODZĘ DO GRY!", clashGuessPlaceholder: "Imię i nazwisko zawodnika...", clashWaitBtn: "OCZEKIWANIE...", clashWaitP2: "CZEKANIE NA DRUGIEGO GRACZA...",
        dailyProgress: "TWÓJ POSTĘP DAILY:", missingRider: "💡 Brak zawodnika?", reportBug: "🚩 Zgłoś błąd", joinDiscord: "DOŁĄCZ DO DISCORDA",
        timeAttackTitle: "TIME ATTACK  ►", scoreLabel: "WYNIK:", whoAreWeLookingFor: "KOGO SZUKAMY?", taEmptyList: "Rozwiązani zawodnicy pojawią się tutaj.",
        expertMode: "TRYB EKSPERCKI", games: "Gier", record: "Rekord", average: "Średnia", startGame: "ROZPOCZNIJ GRĘ ►", howToPlay: "JAK GRAĆ?", backToMenu: "🔙 POWRÓT DO MENU GŁÓWNEGO",
        taRulesTitle: "Zasady gry: Time Attack ⏱️", taRulesDesc: "Podejmij wyzwanie i sprawdź, ilu żużlowców odgadniesz pod presją czasu!", taRule1Title: "Zegar Tyka", taRule1Desc: "Rozpoczynasz grę mając dokładnie 120 sekund. Zegar odlicza w dół bez przerwy.", taRule2Title: "Brak podpowiedzi", taRule2Desc: "W tym trybie nie zgadujesz metodą prób i błędów. Od razu widzisz kraj, rocznik, medale i całą karierę klubową.", taRule3Title: "Bonusy Czasowe", taRule3Desc: "Każdy poprawnie odgadnięty zawodnik dodaje +15 sekund do Twojego licznika. Gra kończy się, gdy czas spadnie do zera.", understoodBack: "ZROZUMIANO, WRACAM DO MENU!",
        localGameTitle: "🖥️ Gra Lokalna", localGameDesc: "Wpiszcie swoje nicki, aby zagrać na jednym ekranie.", p1Red: "Gracz 1 (Czerwony)", p2Blue: "Gracz 2 (Niebieski)", startMatch: "ROZPOCZNIJ MECZ",
        boardPreview: "PODGLĄD PLANSZY 👁️", searching: "Wyszukiwanie...", waitingForOpponentElo: "Czekamy na przeciwnika z podobnym ELO", cancel: "PRZERWIJ",
        sugTitle: "ZGŁOŚ ZAWODNIKA", sugDesc: "Zauważyłeś brak żużlowca podczas gry? Podaj jego dane, a po weryfikacji dodam go do oficjalnej bazy! 🤝", sugName: "Imię i Nazwisko *", sugCountry: "Kraj pochodzenia", sugNotes: "Kluby / Uwagi (opcjonalnie)", send: "WYŚLIJ",
        bugTitle: "ZGŁOŚ BŁĄD 🐛", bugDesc: "Coś poszło nie tak? Gra się zacięła? Opisz problem!", bugDescInput: "Opis problemu *", sendBug: "WYŚLIJ BŁĄD",
        footerPrivacy: "Polityka Prywatności", footerTerms: "Regulamin", footerContact: "Kontakt", footerRights: "Wszelkie prawa zastrzeżone.",
        linkedAccounts: "POWIĄZANE KONTA", linkDiscord: "POŁĄCZ Z DISCORDEM", yourNick: "TWÓJ OBECNY NICK:", change: "ZMIEŃ", yourClub: "TWÓJ ULUBIONY KLUB:", chooseClub: "WYBIERZ KLUB 🛡️", myAchievements: "MOJE OSIĄGNIĘCIA", playerAchievements: "OSIĄGNIĘCIA GRACZA", backToProfile: "WRÓĆ DO PROFILU",
        removeSelection: "USUŃ WYBÓR", chooseYourClub: "WYBIERZ SWÓJ KLUB", chooseClubDesc: "Wybierz drużynę, której kibicujesz. Jej skrót będzie widoczny przy Twoim nicku w rankingach i podczas meczów w trybie Clash!",
        updatesTitle: "NOWOŚCI W GRZE 📢", updatesDesc: "Sprawdź, co ostatnio zmieniliśmy!", understoodBtn: "ZROZUMIANO",
        maintTitle: "PRZERWA TECHNICZNA", maintDesc: "Trwają prace konserwacyjne serwera.<br>Gra jest w tym momencie wyłączona.",
        dToday: "DZISIEJSZA GRA ►", dArchive: "ARCHIWUM DAILY", dLeague: "MECZ LIGOWY ►", dFriendly: "MECZ TOWARZYSKI", dLocal: "GRA LOKALNA (1 PC)", dSettings: "USTAWIENIA", dProfile: "PROFIL",
        clashRule1Title: "Cel Gry", clashRule2Title: "Przejmowanie Pól", clashRule3Title: "Zasady i Czas", clashRule4Title: "Dodatkowy Wymóg (Hardcore)", clashRule4Desc: "Czasami pod herbem klubu pojawi się flaga kraju. Zawodnik musi dodatkowo pochodzić z tego państwa!", leagueHistory: "Historia Ligowa",
        loadingData: "Ładowanie danych...", noResults: "Brak wyników. Zagraj pierwszy!", selectModeMenu: "Wybierz tryb z menu po lewej...", taP1Name: "Gracz 1", taP2Name: "Gracz 2", defaultPlayer: "Gracz",
        toastHintUsed: "Użyto podpowiedzi!", toastPlayerGuessed: "Ten zawodnik jest już na liście trafionych.", toastTimeEnd: "Koniec czasu! Zdobyto: {count} pkt. Wrócisz do menu za 5s...",
        toastWaitTurn: "Czekaj na swoją kolej!", toastCellTaken: "To pole jest już zajęte!", toastPlayerNotExist: "Zawodnik nie istnieje lub został podany!", toastWrongCountry: "BŁĄD! Ta kolumna wymaga zawodnika z kraju:", toastMissedClubs: "Pudło! {name} nie jeździł w obu tych klubach.", toastTurn: "TWÓJ RUCH!", toastSavedClub: "Zapisano! Reprezentujesz:", toastRemovedClub: "Usunięto przynależność klubową", toastAchievement: "🏆 Osiągnięcie:", toastPPM: "⛔ Prawy przycisk myszy zablokowany!", toastConsole: "⛔ Dostęp do konsoli zablokowany!", toastTabSwitch: "⚠️ Wykryto zmianę karty! Tracisz turę.",
        alertSurrenderConfirm: "Czy na pewno chcesz się poddać i odkryć zawodnika?", alertSurrenderTitle: "Poddajesz się?", alertSurrenderBtn: "TAK, PODDAJĘ SIĘ",
        alertReturnConfirm: "Czy na pewno chcesz wrócić do menu? Zapiszemy Twój postęp w Daily, ale w trybie Endless stracisz tę grę.", alertReturnTitle: "Powrót do menu", alertReturnBtn: "WRÓĆ DO MENU",
        alertNickLength: "Nick musi mieć minimum 3 znaki!", alertNickRules: "Ten nick narusza zasady. Wybierz inny.", alertNickTaken: "Ten nick jest już zajęty! Wymyśl inny.", alertNickSame: "To jest Twój obecny nick!",
        alertClashLeave: "Wyjście zamknie aktualny pokój dla obu graczy.\nCzy na pewno chcesz wyjść?", alertClashLeaveTitle: "Opuścić mecz?", alertClashLeaveBtn: "WYJDŹ",
        alertClashSurrender: "Poddasz mecz ligowy walkowerem.\nTy otrzymasz porażkę i ujemne ELO, a przeciwnik dostanie wygraną oraz nagrodę ELO.\nCzy na pewno chcesz poddać mecz?", alertClashSurrenderBtn: "PODDAJ MECZ",
        desktopRankDaily: "LEADERBOARD (DAILY)", desktopRankWeekly: "LEADERBOARD (TYDZIEŃ)", desktopRankMonthly: "LEADERBOARD (MIESIĄC)", desktopRankAllTime: "LEADERBOARD (OGÓLNY)", desktopRankClash: "LEADERBOARD (CLASH)", desktopRankTA: "LEADERBOARD (TIME ATTACK)",
        colPos: "Poz.", colNick: "Nick", colRank: "Ranga", colElo: "ELO", colRecord: "Rekord", colSolved: "Rozwiązane", colTotalWins: "Suma Wygranych", colTries: "Próby", yes: "TAK", no: "NIE",
        privacyTitle: "POLITYKA PRYWATNOŚCI", privacyContent: "<div style='text-align: left; font-size: 13px; color: var(--text-dim);'>Aplikacja zapisuje minimalne dane (Nick z Google, ID, statystyki) wymagane do obsługi trybu multiplayer i tabel rankingowych. Nie wysyłamy spamu. Ciasteczka lokalne przechowują Twój motyw i język.</div>",
        termsTitle: "REGULAMIN", termsContent: "<div style='text-align: left; font-size: 13px; color: var(--text-dim);'>Gra to darmowy, nieoficjalny projekt fanowski. Nazwy klubów są używane na prawach cytatu. Oszukiwanie, wulgaryzmy w nazwach graczy lub wychodzenie z meczów Clash może skutkować banem.</div>",
        ach_title_first_try: "Sokole Oko", ach_desc_first_try: "Zgadnij zawodnika w 1. próbie.", ach_title_close_call: "O włos", ach_desc_close_call: "Zgadnij zawodnika w ostatniej, 10. próbie.", ach_title_no_hint_1: "Bystrzak", ach_desc_no_hint_1: "Wygraj grę bez użycia podpowiedzi.", ach_title_no_hint_5: "Chodząca Encyklopedia", ach_desc_no_hint_5: "Wygraj 5 gier z rzędu bez podpowiedzi.", ach_title_play_10: "Rozgrzewka", ach_desc_play_10: "Rozegraj łącznie 10 gier.", ach_title_play_50: "Maniak", ach_desc_play_50: "Rozegraj łącznie 50 gier.", ach_title_streak_3: "Gorąca Seria I", ach_desc_streak_3: "Osiągnij Win Streak równy 3.", ach_title_streak_7: "Gorąca Seria II", ach_desc_streak_7: "Osiągnij Win Streak równy 7.", ach_title_streak_15: "Gorąca Seria III", ach_desc_streak_15: "Osiągnij Win Streak równy 15.", ach_title_clash_1: "Pierwsza Krew", ach_desc_clash_1: "Wygraj swój pierwszy mecz w Speedway Clash.", ach_title_clash_10: "Gladiator", ach_desc_clash_10: "Wygraj 10 meczów w Clashu.", ach_title_clash_50: "Dominator", ach_desc_clash_50: "Wygraj 50 meczów w Clashu.", ach_title_clash_flawless: "Bezbłędny Clash!", ach_desc_clash_flawless: "Wygraj mecz ligowy, nie oddając przeciwnikowi ani jednego pola.", ach_title_rank_silver: "Srebrny Lis", ach_desc_rank_silver: "Awansuj do rangi Srebro w lidze Clash.", ach_title_rank_gold: "Złoty Chłopak", ach_desc_rank_gold: "Awansuj do rangi Złoto w lidze Clash.", ach_title_rank_diamond: "Żużlowa Elita", ach_desc_rank_diamond: "Awansuj do rangi Diament w lidze Clash.", ach_title_clash_legend: "Żywa Legenda", ach_desc_clash_legend: "Osiągnij najwyższą rangę: Legenda.", ach_title_ta_10: "Time Attack Ekspert I", ach_desc_ta_10: "Odgadnij 10 zawodników w jednej grze Time Attack.", ach_title_ta_20: "Time Attack Ekspert II", ach_desc_ta_20: "Odgadnij 20 zawodników w jednej grze Time Attack.", ach_title_ta_30: "Time Attack Ekspert III", ach_desc_ta_30: "Odgadnij 30 zawodników w jednej grze Time Attack.", ach_title_ta_50: "Time Attack Ekspert IV", ach_desc_ta_50: "Odgadnij 50 zawodników w jednej grze Time Attack.", ach_title_ta_100: "Time Attack God", ach_desc_ta_100: "Odgadnij 100 zawodników w jednej grze Time Attack.", ach_title_easter_club: "Klubowe Barwy", ach_desc_easter_club: "Wybierz swój ulubiony klub w profilu gracza.", ach_title_easter_lang: "Poliglota", ach_desc_easter_lang: "Zmień język gry w Ustawieniach.", ach_title_easter_theme: "Dwa Oblicza", ach_desc_easter_theme: "Zmień motyw gry (Jasny/Ciemny)."
    },
    en: {
        account: "YOUR PROFILE", loginDesc: "Log in with Google to sync progress and enter the leaderboard!", btnLoginGoogle: "LOGIN WITH GOOGLE", orGuest: "OR ENTER GUEST NICK", guestPlaceholder: "Enter nick (max 12 chars)", btnSavePlay: "SAVE & PLAY", btnLogout: "LOGOUT",
        settingsTitle: "SETTINGS", sound: "Sound:", soundOn: "On 🔊", soundOff: "Off 🔇",
        subtitle: "Speedway Edition", lastGames: "Recent Daily games:", btnDaily: "Play Daily", btnReview: "Review game", btnEndless: "Endless Guessr", searchPlaceholder: "Enter rider's name...", btnGuess: "GUESS",
        teams: "Teams:", colName: "Rider", colCountry: "Country", colYear: "Born", colGP: "SGP?", colDMP: "Team Medals", colStatus: "Status", colClubs: "Clubs History",
        stats: "STATISTICS", statPlayed: "Played", statWon: "Won", statStreak: "Current Streak", statMax: "Max Streak", btnClose: "CLOSE", archive: "DAILY ARCHIVE",
        winTitle: "BRAVO!", winSub: "You guessed the rider!", loseTitle: "OUT OF TRIES", loseSub: "Unfortunately, you didn't guess the rider.", btnShare: "SHARE 📋", btnPlayEndless: "PLAY ENDLESS", btnPlayAgain: "PLAY AGAIN", btnMenu: "MAIN MENU", 
        theme: "Theme:", themeLight: "Light", themeDark: "Dark", themeSystem: "Auto", lang: "Language:", modeDaily: "Mode: Daily", modeEndless: "Mode: Endless",
        tabDaily: "DAILY", tabWeekly: "WEEK", tabMonthly: "MONTH", tabAllTime: "OVERALL", rankWonToday: "Wins", rankTotalWins: "Total Wins", rankGuesses: "Guesses",
        months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], weekdays: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
        clashTitle: "⚔️ Speedway Clash", clashFriendly: "Friendly Match", clashFriendlyDesc: "(Play with a friend)", clashLobbyTitle: "🤝 Friendly Match", clashHost: "CREATE ROOM (HOST)", clashJoinCode: "ROOM CODE...", clashJoinBtn: "JOIN", clashYourCode: "Your room code:", clashWaiting: "Waiting for opponent...", clashReady: "I'M READY", clashTime: "Time to answer:", clashSurrender: "SURRENDER / LEAVE", clashClaim: "CLAIM CELL", clashConfirm: "CONFIRM", clashCancel: "CANCEL", clashSeries: "SERIES SCORE", clashRematch: "PLAY REMATCH", clashQuit: "QUIT AND LEAVE", clashRulesTitle: "Rules: Speedway Clash ⚔️", clashRules1: "The game is played on a 3x3 grid like Tic-Tac-Toe.", clashRules2: "To claim a cell, click it and guess a rider who represented both intersecting clubs.", clashRules3: "Remember, only the Polish league history counts.", clashRules4: "You have 2 minutes to answer! Wrong guess or timeout means you lose your turn.", clashRules5: "Connect 3 cells in a line to win!", clashUnderstood: "UNDERSTOOD!", clashGuessPlaceholder: "Rider's name and surname...", clashWaitBtn: "WAITING...", clashWaitP2: "WAITING FOR OPPONENT...",
        dailyProgress: "YOUR DAILY PROGRESS:", missingRider: "💡 Missing rider?", reportBug: "🚩 Report Bug", joinDiscord: "JOIN DISCORD",
        timeAttackTitle: "TIME ATTACK  ►", scoreLabel: "SCORE:", whoAreWeLookingFor: "WHO ARE WE LOOKING FOR?", taEmptyList: "Guessed riders will appear here.",
        expertMode: "EXPERT MODE", games: "Games", record: "Record", average: "Average", startGame: "START GAME ►", howToPlay: "HOW TO PLAY?", backToMenu: "🔙 BACK TO MAIN MENU",
        taRulesTitle: "Rules: Time Attack ⏱️", taRulesDesc: "Take the challenge and see how many riders you can guess under time pressure!", taRule1Title: "Clock is Ticking", taRule1Desc: "You start the game with exactly 120 seconds. The clock counts down continuously.", taRule2Title: "No hints", taRule2Desc: "You instantly see the country, year of birth, medals, and club history. You must recognize the rider immediately.", taRule3Title: "Time Bonuses", taRule3Desc: "Every correctly guessed rider adds +15 seconds to your timer. The game ends when the time runs out.", understoodBack: "UNDERSTOOD, BACK TO MENU!",
        localGameTitle: "🖥️ Local Game", localGameDesc: "Enter your nicknames to play on a single screen.", p1Red: "Player 1 (Red)", p2Blue: "Player 2 (Blue)", startMatch: "START MATCH",
        boardPreview: "BOARD PREVIEW 👁️", searching: "Searching...", waitingForOpponentElo: "Waiting for an opponent with similar ELO", cancel: "CANCEL",
        sugTitle: "REPORT A RIDER", sugDesc: "Noticed a missing rider? Provide their details and we'll add them to the database! 🤝", sugName: "Full Name *", sugCountry: "Country", sugNotes: "Clubs / Notes (optional)", send: "SEND",
        bugTitle: "REPORT A BUG 🐛", bugDesc: "Something went wrong? Describe the problem!", bugDescInput: "Problem description *", sendBug: "SEND BUG",
        footerPrivacy: "Privacy Policy", footerTerms: "Terms of Service", footerContact: "Contact", footerRights: "All rights reserved.",
        linkedAccounts: "LINKED ACCOUNTS", linkDiscord: "LINK DISCORD", yourNick: "YOUR CURRENT NICK:", change: "CHANGE", yourClub: "YOUR FAVORITE CLUB:", chooseClub: "CHOOSE CLUB 🛡️", myAchievements: "MY ACHIEVEMENTS", playerAchievements: "PLAYER ACHIEVEMENTS", backToProfile: "BACK TO PROFILE",
        removeSelection: "REMOVE SELECTION", chooseYourClub: "CHOOSE YOUR CLUB", chooseClubDesc: "Select the team you support. Its badge will be visible next to your nick in leaderboards and Clash matches!",
        updatesTitle: "GAME UPDATES 📢", updatesDesc: "Check out our latest changes!", understoodBtn: "UNDERSTOOD",
        maintTitle: "MAINTENANCE BREAK", maintDesc: "Server maintenance in progress.<br>The game is temporarily disabled.",
        dToday: "TODAY'S GAME ►", dArchive: "DAILY ARCHIVE", dLeague: "LEAGUE MATCH ►", dFriendly: "FRIENDLY MATCH", dLocal: "LOCAL PLAY (1 PC)", dSettings: "SETTINGS", dProfile: "PROFILE",
        clashRule1Title: "Game Goal", clashRule2Title: "Claiming Cells", clashRule3Title: "Rules and Time", clashRule4Title: "Extra Requirement", clashRule4Desc: "Sometimes a country flag will appear under the club badge. The rider must also be from that country!", leagueHistory: "League History",
        loadingData: "Loading data...", noResults: "No results. Be the first to play!", selectModeMenu: "Select a game mode from the menu...", taP1Name: "Player 1", taP2Name: "Player 2", defaultPlayer: "Player",
        toastHintUsed: "Hint used!", toastPlayerGuessed: "This rider is already guessed.", toastTimeEnd: "Time's up! Score: {count} pts. Returning to menu in 5s...",
        toastWaitTurn: "Wait for your turn!", toastCellTaken: "This cell is already taken!", toastPlayerNotExist: "Rider does not exist or was already picked!", toastWrongCountry: "ERROR! This column requires a rider from:", toastMissedClubs: "Miss! {name} hasn't ridden for both these clubs.", toastTurn: "YOUR TURN!", toastSavedClub: "Saved! You represent:", toastRemovedClub: "Club affiliation removed", toastAchievement: "🏆 Achievement:", toastPPM: "⛔ Right click disabled!", toastConsole: "⛔ Console access disabled!", toastTabSwitch: "⚠️ Tab switch detected! You lose your turn.",
        alertSurrenderConfirm: "Are you sure you want to give up and reveal the rider?", alertSurrenderTitle: "Giving up?", alertSurrenderBtn: "YES, I GIVE UP",
        alertReturnConfirm: "Are you sure you want to return to menu? Daily progress will be saved, but Endless progress will be lost.", alertReturnTitle: "Return to menu", alertReturnBtn: "RETURN TO MENU",
        alertNickLength: "Nick must have at least 3 characters!", alertNickRules: "This nick violates the rules. Choose another.", alertNickTaken: "This nick is already taken! Choose another.", alertNickSame: "This is your current nick!",
        alertClashLeave: "Leaving will close the room for both players.\nAre you sure you want to leave?", alertClashLeaveTitle: "Leave match?", alertClashLeaveBtn: "LEAVE",
        alertClashSurrender: "You will forfeit the match.\nYou'll receive a loss and negative ELO.\nAre you sure you want to surrender?", alertClashSurrenderBtn: "SURRENDER",
        desktopRankDaily: "LEADERBOARD (DAILY)", desktopRankWeekly: "LEADERBOARD (WEEK)", desktopRankMonthly: "LEADERBOARD (MONTH)", desktopRankAllTime: "LEADERBOARD (ALL-TIME)", desktopRankClash: "LEADERBOARD (CLASH)", desktopRankTA: "LEADERBOARD (TIME ATTACK)",
        colPos: "Pos.", colNick: "Nick", colRank: "Rank", colElo: "ELO", colRecord: "Record", colSolved: "Solved", colTotalWins: "Total Wins", colTries: "Guesses", yes: "YES", no: "NO",
        privacyTitle: "PRIVACY POLICY", privacyContent: "<div style='text-align: left; font-size: 13px; color: var(--text-dim);'>We store minimal data (Google Nick, ID, stats) to provide multiplayer features and leaderboards. We don't send spam. Local cookies store your theme and language.</div>",
        termsTitle: "TERMS OF SERVICE", termsContent: "<div style='text-align: left; font-size: 13px; color: var(--text-dim);'>The game is a free, unofficial fan project. Cheating, using vulgar nicknames, or leaving Clash matches on purpose will result in a ban.</div>",
        ach_title_first_try: "Eagle Eye", ach_desc_first_try: "Guess the rider on the 1st try.", ach_title_close_call: "Close Call", ach_desc_close_call: "Guess the rider on the last, 10th try.", ach_title_no_hint_1: "Smarty Pants", ach_desc_no_hint_1: "Win a game without using a hint.", ach_title_no_hint_5: "Walking Encyclopedia", ach_desc_no_hint_5: "Win 5 games in a row without hints.", ach_title_play_10: "Warm-up", ach_desc_play_10: "Play 10 games in total.", ach_title_play_50: "Maniac", ach_desc_play_50: "Play 50 games in total.", ach_title_streak_3: "Hot Streak I", ach_desc_streak_3: "Achieve a Win Streak of 3.", ach_title_streak_7: "Hot Streak II", ach_desc_streak_7: "Achieve a Win Streak of 7.", ach_title_streak_15: "Hot Streak III", ach_desc_streak_15: "Achieve a Win Streak of 15.", ach_title_clash_1: "First Blood", ach_desc_clash_1: "Win your first Speedway Clash match.", ach_title_clash_10: "Gladiator", ach_desc_clash_10: "Win 10 matches in Clash.", ach_title_clash_50: "Dominator", ach_desc_clash_50: "Win 50 matches in Clash.", ach_title_clash_flawless: "Flawless Clash!", ach_desc_clash_flawless: "Win a league match without giving your opponent a single cell.", ach_title_rank_silver: "Silver Fox", ach_desc_rank_silver: "Reach the Silver rank in Clash league.", ach_title_rank_gold: "Golden Boy", ach_desc_rank_gold: "Reach the Gold rank in Clash league.", ach_title_rank_diamond: "Speedway Elite", ach_desc_rank_diamond: "Reach the Diamond rank in Clash league.", ach_title_clash_legend: "Living Legend", ach_desc_clash_legend: "Reach the highest rank: Legend.", ach_title_ta_10: "Time Attack Expert I", ach_desc_ta_10: "Guess 10 riders in a single Time Attack game.", ach_title_ta_20: "Time Attack Expert II", ach_desc_ta_20: "Guess 20 riders in a single Time Attack game.", ach_title_ta_30: "Time Attack Expert III", ach_desc_ta_30: "Guess 30 riders in a single Time Attack game.", ach_title_ta_50: "Time Attack Expert IV", ach_desc_ta_50: "Guess 50 riders in a single Time Attack game.", ach_title_ta_100: "Time Attack God", ach_desc_ta_100: "Guess 100 riders in a single Time Attack game.", ach_title_easter_club: "Club Colors", ach_desc_easter_club: "Select your favorite club in your player profile.", ach_title_easter_lang: "Polyglot", ach_desc_easter_lang: "Change the game language in Settings.", ach_title_easter_theme: "Two Faces", ach_desc_easter_theme: "Change the game theme (Light/Dark)."
    },
    sv: {
        account: "DIN PROFIL", loginDesc: "Logga in med Google för att delta i rankningen!", btnLoginGoogle: "LOGGA IN MED GOOGLE", orGuest: "ELLER ANGE GÄSTNICK", guestPlaceholder: "Ange nick (max 12 teck)", btnSavePlay: "SPARA & SPELA", btnLogout: "LOGGA UT",
        settingsTitle: "INSTÄLLNINGAR", sound: "Ljud:", soundOn: "På 🔊", soundOff: "Av 🔇",
        subtitle: "Speedway Edition", lastGames: "Senaste Daily:", btnDaily: "Spela Daily", btnReview: "Granska spel", btnEndless: "Endless Guessr", searchPlaceholder: "Ange förarens namn...", btnGuess: "GISSA",
        teams: "Klubbar:", colName: "Förare", colCountry: "Land", colYear: "Född", colGP: "SGP?", colDMP: "Lagmedaljer", colStatus: "Status", colClubs: "Klubbhistorik",
        stats: "STATISTIK", statPlayed: "Spelade", statWon: "Vunna", statStreak: "Aktuell Svit", statMax: "Bästa Svit", btnClose: "STÄNG", archive: "DAILY ARKIV",
        winTitle: "BRAVO!", winSub: "Du gissade föraren!", loseTitle: "INGA FÖRSÖK", loseSub: "Tyvärr, du gissade inte föraren.", btnShare: "DELA 📋", btnPlayEndless: "SPELA ENDLESS", btnPlayAgain: "SPELA IGEN", btnMenu: "HUVUDMENY", 
        theme: "Tema:", themeLight: "Ljust", themeDark: "Mörkt", themeSystem: "System", lang: "Språk:", modeDaily: "Läge: Daily", modeEndless: "Läge: Endless",
        tabDaily: "DAGLIG", tabWeekly: "VECKA", tabMonthly: "MÅNAD", tabAllTime: "ALLMÄN", rankWonToday: "Vinster", rankTotalWins: "Totala Vinster", rankGuesses: "Gissningar",
        months: ["Januari", "Februari", "Mars", "April", "Maj", "Juni", "Juli", "Augusti", "September", "Oktober", "November", "December"], weekdays: ["Må", "Ti", "On", "To", "Fr", "Lö", "Sö"],
        clashTitle: "⚔️ Speedway Clash", clashFriendly: "Vänskapsmatch", clashFriendlyDesc: "(Spela med en vän)", clashLobbyTitle: "🤝 Vänskapsmatch", clashHost: "SKAPA RUM (HOST)", clashJoinCode: "RUMKOD...", clashJoinBtn: "GÅ MED", clashYourCode: "Din rumkod:", clashWaiting: "Väntar på motståndare...", clashReady: "JAG ÄR REDO", clashTime: "Tid att svara:", clashSurrender: "GE UPP / LÄMNA", clashClaim: "TA ÖVER RUTA", clashConfirm: "BEKRÄFTA", clashCancel: "AVBRYT", clashSeries: "SERIERESULTAT", clashRematch: "SPELA RETURMATCH", clashQuit: "AVSLUTA OCH LÄMNA", clashRulesTitle: "Regler: Speedway Clash ⚔️", clashRules1: "Spelet spelas på ett 3x3 rutnät som Luffarschack.", clashRules2: "För att ta över en ruta, klicka på den och gissa en förare som representerat båda klubbarna.", clashRules3: "Kom ihåg att endast den polska ligahistoriken räknas.", clashRules4: "Du har 2 minuter på dig att svara! Vid fel gissning förlorar du din tur.", clashRules5: "Anslut 3 rutor i rad för att vinna!", clashUnderstood: "FÖRSTÅTT, JAG SPELAR!", clashGuessPlaceholder: "Förarens för- och efternamn...", clashWaitBtn: "VÄNTAR...", clashWaitP2: "VÄNTAR PÅ MOTSTÅNDARE...",
        dailyProgress: "DIN DAGLIGA FRAMSTEG:", missingRider: "💡 Saknad förare?", reportBug: "🚩 Rapportera Bugg", joinDiscord: "GÅ MED I DISCORD",
        timeAttackTitle: "TIME ATTACK  ►", scoreLabel: "POÄNG:", whoAreWeLookingFor: "VEM LETER VI EFTER?", taEmptyList: "Gissade förare visas här.",
        expertMode: "EXPERT LÄGE", games: "Spel", record: "Rekord", average: "Snitt", startGame: "BÖRJA SPELA ►", howToPlay: "HUR SPELAR MAN?", backToMenu: "🔙 TILLBAKA TILL MENYN",
        taRulesTitle: "Regler: Time Attack ⏱️", taRulesDesc: "Ta antagningen och se hur många förare du kan gissa under tidspress!", taRule1Title: "Klockan tickar", taRule1Desc: "Du börjar spelet med exakt 120 sekunder. Klockan räknar ner oavbrutet.", taRule2Title: "Inga tips", taRule2Desc: "Du ser direkt land, födelseår, medaljer och klubbhistorik.", taRule3Title: "Tidsbonusar", taRule3Desc: "Varje korrekt gissad förare lägger till +15 sekunder till din timer.", understoodBack: "FÖRSTÅTT, TILLBAKA!",
        localGameTitle: "🖥️ Lokalt Spel", localGameDesc: "Ange era nicks för att spela på en skärm.", p1Red: "Spelare 1 (Röd)", p2Blue: "Spelare 2 (Blå)", startMatch: "BÖRJA MATCH",
        boardPreview: "BRÄDENS FÖRHANDSGRANSKNING 👁️", searching: "Söker...", waitingForOpponentElo: "Väntar på en motståndare med liknande ELO", cancel: "AVBRYT",
        sugTitle: "RAPPORTERA EN FÖRARE", sugDesc: "Märkte du en saknad förare? Ge oss detaljer! 🤝", sugName: "För- och efternamn *", sugCountry: "Land", sugNotes: "Klubbar / Anteckningar", send: "SKICKA",
        bugTitle: "RAPPORTERA ETT FEL 🐛", bugDesc: "Gick något fel? Beskriv problemet!", bugDescInput: "Problembeskrivning *", sendBug: "SKICKA FEL",
        footerPrivacy: "Integritetspolicy", footerTerms: "Användarvillkor", footerContact: "Kontakt", footerRights: "Alla rättigheter förbehållna.",
        linkedAccounts: "LÄNKADE KONTON", linkDiscord: "LÄNKA DISCORD", yourNick: "DITT NUVARANDE NICK:", change: "ÄNDRA", yourClub: "DIN FAVORITKLUBB:", chooseClub: "VÄLJ KLUBB 🛡️", myAchievements: "MINA PRESTATIONER", playerAchievements: "SPELARPRESTATIONER", backToProfile: "TILLBAKA TILL PROFILEN",
        removeSelection: "TA BORT VAL", chooseYourClub: "VÄLJ DIN KLUBB", chooseClubDesc: "Välj laget du stöder. Dess logotyp visas bredvid ditt nick!",
        updatesTitle: "SPELUPPDATERINGAR 📢", updatesDesc: "Kolla in våra senaste ändringar!", understoodBtn: "FÖRSTÅTT",
        maintTitle: "UNDERHÅLL", maintDesc: "Serverunderhåll pågår.<br>Spelet är tillfälligt inaktiverat.",
        dToday: "DAGENS SPEL ►", dArchive: "DAILY ARKIV", dLeague: "LIGAMATCH ►", dFriendly: "VÄNSKAPSMATCH", dLocal: "LOKALT SPIL (1 PC)", dSettings: "INSTÄLLNINGAR", dProfile: "PROFIL",
        clashRule1Title: "Spelmål", clashRule2Title: "Överta rutor", clashRule3Title: "Regler och tid", clashRule4Title: "Extra Krav", clashRule4Desc: "Ibland visas en landsflagga under klubbloggan. Föraren måste också komma från det landet!", leagueHistory: "Ligahistorik",
        loadingData: "Laddar data...", noResults: "Inga resultat. Var den första att spela!", selectModeMenu: "Välj ett spelläge från menyn...", taP1Name: "Spelare 1", taP2Name: "Spelare 2", defaultPlayer: "Spelare",
        toastHintUsed: "Tips använt!", toastPlayerGuessed: "Denna förare är redan gissad.", toastTimeEnd: "Tiden är ute! Poäng: {count}. Tillbaka till menyn om 5s...",
        toastWaitTurn: "Vänta på din tur!", toastCellTaken: "Denna ruta är redan tagen!", toastPlayerNotExist: "Föraren finns inte eller är redan vald!", toastWrongCountry: "FEL! Denna kolumn kräver en förare från:", toastMissedClubs: "Miss! {name} har inte kört för båda dessa klubbar.", toastTurn: "DIN TUR!", toastSavedClub: "Sparat! Du representerar:", toastRemovedClub: "Klubbtillhörighet borttagen", toastAchievement: "🏆 Prestation:", toastPPM: "⛔ Högerklick inaktiverat!", toastConsole: "⛔ Konsolåtkomst inaktiverat!", toastTabSwitch: "⚠️ Flikbyte upptäckt! Du förlorar din tur.",
        alertSurrenderConfirm: "Är du säker på att du vill ge upp och avslöja föraren?", alertSurrenderTitle: "Ger du upp?", alertSurrenderBtn: "JA, JAG GER UPP",
        alertReturnConfirm: "Är du säker på att du vill återvända till menyn? Daily-framsteg sparas, men Endless går förlorad.", alertReturnTitle: "Återvänd till menyn", alertReturnBtn: "TILL MENYN",
        alertNickLength: "Nicket måste ha minst 3 tecken!", alertNickRules: "Detta nick bryter mot reglerna. Välj ett annat.", alertNickTaken: "Detta nick är redan upptaget!", alertNickSame: "Detta är ditt nuvarande nick!",
        alertClashLeave: "Att lämna stänger rummet för båda spelarna.\nÄr du säker?", alertClashLeaveTitle: "Lämna match?", alertClashLeaveBtn: "LÄMNA",
        alertClashSurrender: "Du kommer att förlora matchen på walkover.\nDu får en förlust och minus-ELO.\nÄr du säker?", alertClashSurrenderBtn: "GE UPP",
        desktopRankDaily: "LEADERBOARD (DAGLIG)", desktopRankWeekly: "LEADERBOARD (VECKA)", desktopRankMonthly: "LEADERBOARD (MÅNAD)", desktopRankAllTime: "LEADERBOARD (ALLMÄN)", desktopRankClash: "LEADERBOARD (CLASH)", desktopRankTA: "LEADERBOARD (TIME ATTACK)",
        colPos: "Pos.", colNick: "Nick", colRank: "Rank", colElo: "ELO", colRecord: "Rekord", colSolved: "Lösta", colTotalWins: "Totala Vinster", colTries: "Gissningar", yes: "JA", no: "NEJ",
        privacyTitle: "INTEGRITETSPOLICY", privacyContent: "<div style='text-align: left; font-size: 13px; color: var(--text-dim);'>Vi sparar minimala data för rankningar. Inget spam.</div>",
        termsTitle: "ANVÄNDARVILLKOR", termsContent: "<div style='text-align: left; font-size: 13px; color: var(--text-dim);'>Detta är ett inofficiellt fan-projekt. Fusk leder till ban.</div>",
        ach_title_first_try: "Örnöga", ach_desc_first_try: "Gissa föraren på 1:a försöket.", ach_title_close_call: "Nära ögat", ach_desc_close_call: "Gissa föraren på sista, 10:e försöket.", ach_title_no_hint_1: "Smartskalle", ach_desc_no_hint_1: "Vinn ett spel utan att använda tips.", ach_title_no_hint_5: "Vandrande uppslagsverk", ach_desc_no_hint_5: "Vinn 5 spel i rad utan tips.", ach_title_play_10: "Uppvärmning", ach_desc_play_10: "Spela 10 spel totalt.", ach_title_play_50: "Galning", ach_desc_play_50: "Spela 50 spel totalt.", ach_title_streak_3: "Hett flow I", ach_desc_streak_3: "Uppnå en vinstsvit på 3.", ach_title_streak_7: "Hett flow II", ach_desc_streak_7: "Uppnå en vinstsvit på 7.", ach_title_streak_15: "Hett flow III", ach_desc_streak_15: "Uppnå en vinstsvit på 15.", ach_title_clash_1: "Första blodet", ach_desc_clash_1: "Vinn din första Speedway Clash-match.", ach_title_clash_10: "Gladiator", ach_desc_clash_10: "Vinn 10 matcher i Clash.", ach_title_clash_50: "Dominator", ach_desc_clash_50: "Vinn 50 matcher i Clash.", ach_title_clash_flawless: "Felfri Clash!", ach_desc_clash_flawless: "Vinn en ligamatch utan att ge motståndaren en enda ruta.", ach_title_rank_silver: "Silverräven", ach_desc_rank_silver: "Nå Silver-rank i Clash-ligan.", ach_title_rank_gold: "Guldgossen", ach_desc_rank_gold: "Nå Guld-rank i Clash-ligan.", ach_title_rank_diamond: "Speedwayelit", ach_desc_rank_diamond: "Nå Diamant-rank i Clash-ligan.", ach_title_clash_legend: "Levande legend", ach_desc_clash_legend: "Nå högsta ranken: Legend.", ach_title_ta_10: "Time Attack Expert I", ach_desc_ta_10: "Gissa 10 förare i ett enda Time Attack-spel.", ach_title_ta_20: "Time Attack Expert II", ach_desc_ta_20: "Gissa 20 förare i ett enda Time Attack-spel.", ach_title_ta_30: "Time Attack Expert III", ach_desc_ta_30: "Gissa 30 förare i ett enda Time Attack-spel.", ach_title_ta_50: "Time Attack Expert IV", ach_desc_ta_50: "Gissa 50 förare i ett enda Time Attack-spel.", ach_title_ta_100: "Time Attack Gud", ach_desc_ta_100: "Gissa 100 förare i ett enda Time Attack-spel.", ach_title_easter_club: "Klubbfärger", ach_desc_easter_club: "Välj din favoritklubb i din spelarprofil.", ach_title_easter_lang: "Polyglot", ach_desc_easter_lang: "Byt spelspråk i Inställningar.", ach_title_easter_theme: "Två ansikten", ach_desc_easter_theme: "Byt speltema (Ljust/Mörkt)."
    },
    da: {
        account: "DIN PROFIL", loginDesc: "Log ind med Google for at deltage i ranglisten!", btnLoginGoogle: "LOG IND MED GOOGLE", orGuest: "ELLER INDTAST GÆSTENICK", guestPlaceholder: "Indtast nick...", btnSavePlay: "GEM & SPIL", btnLogout: "LOG UD",
        settingsTitle: "INDSTILLINGER", sound: "Lyd:", soundOn: "Til 🔊", soundOff: "Fra 🔇",
        subtitle: "Speedway Edition", lastGames: "Seneste Daily:", btnDaily: "Spil Daily", btnReview: "Gennemse spil", btnEndless: "Endless Guessr", searchPlaceholder: "Indtast kørers navn...", btnGuess: "GÆT",
        teams: "Hold:", colName: "Kører", colCountry: "Land", colYear: "Født", colGP: "SGP?", colDMP: "Holdmedaljer", colStatus: "Status", colClubs: "Klubhistorik",
        stats: "STATISTIK", statPlayed: "Spillet", statWon: "Vundet", statStreak: "Nuværende Stime", statMax: "Bedste Stime", btnClose: "LUK", archive: "DAILY ARKIV",
        winTitle: "BRAVO!", winSub: "Du gættede køreren!", loseTitle: "INGEN FORSØG", loseSub: "Desværre gættede du ikke køreren.", btnShare: "DEL 📋", btnPlayEndless: "SPIL ENDLESS", btnPlayAgain: "SPIL IGEN", btnMenu: "HOVEDMENU", 
        theme: "Tema:", themeLight: "Lyst", themeDark: "Mørkt", themeSystem: "System", lang: "Sprog:", modeDaily: "Tilstand: Daily", modeEndless: "Tilstand: Endless",
        tabDaily: "DAGLIG", tabWeekly: "UGE", tabMonthly: "MÅNED", tabAllTime: "GENEREL", rankWonToday: "Sejre", rankTotalWins: "Samlede Sejre", rankGuesses: "Gæt",
        months: ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli", "August", "September", "Oktober", "November", "December"], weekdays: ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"],
        clashTitle: "⚔️ Speedway Clash", clashFriendly: "Venskabskamp", clashFriendlyDesc: "(Spil med en ven)", clashLobbyTitle: "🤝 Venskabskamp", clashHost: "OPRET RUM (HOST)", clashJoinCode: "RUMKODE...", clashJoinBtn: "TILSLUT", clashYourCode: "Din rumkode:", clashWaiting: "Venter på modstander...", clashReady: "JEG ER KLAR", clashTime: "Tid til at svare:", clashSurrender: "GIV OP / FORLAD", clashClaim: "OVERTAG FELT", clashConfirm: "BEKRÆFT", clashCancel: "ANNULLER", clashSeries: "SERIERESULTAT", clashRematch: "SPIL REVANCHE", clashQuit: "AFSLUT OG FORLAD", clashRulesTitle: "Regler: Speedway Clash ⚔️", clashRules1: "Spillet spilles på et 3x3 gitter som Kryds og Bolle.", clashRules2: "For at overtage et felt skal du klikke på det og gætte en kører, der har repræsenteret begge klubber.", clashRules3: "Husk, at kun den polska ligahistorie tæller.", clashRules4: "Du har 2 minutter til at svare! Forkert gæt betyder, at du mister din tur.", clashRules5: "Forbind 3 felter på stribe for at vinde!", clashUnderstood: "FORSTÅET, JEG SPILLER!", clashGuessPlaceholder: "Kørerens for- og efternavn...", clashWaitBtn: "VENTER...", clashWaitP2: "VENTER PÅ MODSTANDER...",
        dailyProgress: "DIT DAGLIGE FREMSKRIDT:", missingRider: "💡 Manglende kører?", reportBug: "🚩 Rapportér Bug", joinDiscord: "TILSLUT DISCORD",
        timeAttackTitle: "TIME ATTACK  ►", scoreLabel: "SCORE:", whoAreWeLookingFor: "HVEM LEDER VI EFTER?", taEmptyList: "Gættede kørere vises her.",
        expertMode: "EKSPERT TILSTAND", games: "Spil", record: "Rekord", average: "Gns.", startGame: "START SPIL ►", howToPlay: "SÅDAN SPILLER DU", backToMenu: "🔙 TILBAGE TIL HOVEDMENU",
        taRulesTitle: "Regler: Time Attack ⏱️", taRulesDesc: "Tag udfordringen op, og se, hvor mange kørere du kan gætte under tidspres!", taRule1Title: "Uret Tikker", taRule1Desc: "Du starter spillet med nøjagtig 120 sekunder. Uret tæller ned kontinuerligt.", taRule2Title: "Ingen hints", taRule2Desc: "Du ser straks land, fødselsår, medaljer og klubhistorie.", taRule3Title: "Tidsbonusser", taRule3Desc: "Hver korrekt gættet kører tilføjer +15 sekunder til din timer.", understoodBack: "FORSTÅET, TILBAGE!",
        localGameTitle: "🖥️ Lokalt Spil", localGameDesc: "Indtast jeres nicks for at spille på én skærm.", p1Red: "Spiller 1 (Rød)", p2Blue: "Spiller 2 (Blå)", startMatch: "START KAMP",
        boardPreview: "BRÆT PREVIEW 👁️", searching: "Søger...", waitingForOpponentElo: "Venter på en modstander med lignende ELO", cancel: "ANNULLER",
        sugTitle: "RAPPORTER EN KØRER", sugDesc: "Bemærkede du en manglende kører? Giv os detaljer! 🤝", sugName: "Fulde navn *", sugCountry: "Land", sugNotes: "Klubber / Noter", send: "SEND",
        bugTitle: "RAPPORTER EN FEJL 🐛", bugDesc: "Gik noget galt? Beskriv problemet!", bugDescInput: "Problembeskrivelse *", sendBug: "SEND FEJL",
        footerPrivacy: "Privatlivspolitik", footerTerms: "Betingelser for brug", footerContact: "Kontakt", footerRights: "Alle rettigheder forbeholdes.",
        linkedAccounts: "TILKNYTTEDE KONTI", linkDiscord: "TILKNYT DISCORD", yourNick: "DIT NUVÆRENDE NICK:", change: "ÆNDR", yourClub: "DIN FAVORITKLUB:", chooseClub: "VÆLG KLUB 🛡️", myAchievements: "MINE PRÆSTATIONER", playerAchievements: "SPILLERPRÆSTATIONER", backToProfile: "TILBAGE TIL PROFIL",
        removeSelection: "FJERN VALG", chooseYourClub: "VÆLG DIN KLUB", chooseClubDesc: "Vælg det hold du støtter. Dets logo vil være synligt ved dit nick!",
        updatesTitle: "SPILOPDATERINGER 📢", updatesDesc: "Tjek vores seneste ændringer!", understoodBtn: "FORSTÅET",
        maintTitle: "VEDLIGEHOLDELSE", maintDesc: "Servervedligeholdelse i gang.<br>Spillet er midlertidigt deaktiveret.",
        dToday: "DAGENS SPIL ►", dArchive: "DAILY ARKIV", dLeague: "LIGAKAMP ►", dFriendly: "VENSKABSKAMP", dLocal: "LOKALT SPIL (1 PC)", dSettings: "INDSTILLINGER", dProfile: "PROFIL",
        clashRule1Title: "Spillets mål", clashRule2Title: "Overtagelse af felter", clashRule3Title: "Regler og tid", clashRule4Title: "Ekstra Krav", clashRule4Desc: "Nogle gange vises et landeflag under klublogoet. Køreren skal også være fra det land!", leagueHistory: "Ligahistorie",
        loadingData: "Indlæser data...", noResults: "Ingen resultater. Vær den første til at spille!", selectModeMenu: "Vælg en spiltilstand fra menuen...", taP1Name: "Spiller 1", taP2Name: "Spiller 2", defaultPlayer: "Spiller",
        toastHintUsed: "Tip brugt!", toastPlayerGuessed: "Denne kører er allerede gættet.", toastTimeEnd: "Tiden er gået! Score: {count}. Tilbage til menu om 5s...",
        toastWaitTurn: "Vent på din tur!", toastCellTaken: "Dette felt er allerede taget!", toastPlayerNotExist: "Køreren findes ikke eller er allerede valgt!", toastWrongCountry: "FEJL! Denne kolonne kræver en kører fra:", toastMissedClubs: "Forbi! {name} har ikke kørt for begge disse klubber.", toastTurn: "DIN TUR!", toastSavedClub: "Gemt! Du repræsenterer:", toastRemovedClub: "Klubtilhørsforhold fjernet", toastAchievement: "🏆 Præstation:", toastPPM: "⛔ Højreklik deaktiveret!", toastConsole: "⛔ Konsoladgang deaktiveret!", toastTabSwitch: "⚠️ Fanebladsskift opdaget! Du mister din tur.",
        alertSurrenderConfirm: "Er du sikker på, at du vil give op og afsløre køreren?", alertSurrenderTitle: "Giver du op?", alertSurrenderBtn: "JA, JEG GIVER OP",
        alertReturnConfirm: "Er du sikker på, at du vil vende tilbage til menuen? Daily-fremskridt gemmes, men Endless går tabt.", alertReturnTitle: "Tilbage til menu", alertReturnBtn: "TIL MENU",
        alertNickLength: "Nick skal have mindst 3 tegn!", alertNickRules: "Dette nick overtræder reglerne.", alertNickTaken: "Dette nick er allerede taget!", alertNickSame: "Dette er dit nuværende nick!",
        alertClashLeave: "At forlade vil lukke rummet for begge spillere.\nEr du sikker på, at du vil forlade det?", alertClashLeaveTitle: "Forlad kamp?", alertClashLeaveBtn: "FORLAD",
        alertClashSurrender: "Du vil tabe kampen på walkover.\nDu får et tab og minus-ELO.\nEr du sikker?", alertClashSurrenderBtn: "GIV OP",
        desktopRankDaily: "LEADERBOARD (DAGLIG)", desktopRankWeekly: "LEADERBOARD (UGE)", desktopRankMonthly: "LEADERBOARD (MÅNED)", desktopRankAllTime: "LEADERBOARD (GENEREL)", desktopRankClash: "LEADERBOARD (CLASH)", desktopRankTA: "LEADERBOARD (TIME ATTACK)",
        colPos: "Pos.", colNick: "Nick", colRank: "Rang", colElo: "ELO", colRecord: "Rekord", colSolved: "Løst", colTotalWins: "Samlede Sejre", colTries: "Gæt", yes: "JA", no: "NEJ",
        privacyTitle: "PRIVATLIVSPOLITIK", privacyContent: "<div style='text-align: left; font-size: 13px; color: var(--text-dim);'>Vi gemmer kun minimale data til ranglister.</div>",
        termsTitle: "BETINGELSER", termsContent: "<div style='text-align: left; font-size: 13px; color: var(--text-dim);'>Dette er et uofficielt fan-projekt. Snyd medfører ban.</div>",
        ach_title_first_try: "Ørneøje", ach_desc_first_try: "Gæt køreren i 1. forsøg.", ach_title_close_call: "Lige ved og næsten", ach_desc_close_call: "Gæt køreren i sidste, 10. forsøg.", ach_title_no_hint_1: "Kloge Åge", ach_desc_no_hint_1: "Vind et spil uden at bruge hints.", ach_title_no_hint_5: "Vandrende leksikon", ach_desc_no_hint_5: "Vind 5 spil i træk uden hints.", ach_title_play_10: "Opvarmning", ach_desc_play_10: "Spil 10 spil i alt.", ach_title_play_50: "Galskab", ach_desc_play_50: "Spil 50 spil i alt.", ach_title_streak_3: "Varm stime I", ach_desc_streak_3: "Opnå en sejrsstime på 3.", ach_title_streak_7: "Varm stime II", ach_desc_streak_7: "Opnå en sejrsstime på 7.", ach_title_streak_15: "Varm stime III", ach_desc_streak_15: "Opnå en sejrsstime på 15.", ach_title_clash_1: "Første blod", ach_desc_clash_1: "Vind din første Speedway Clash-kamp.", ach_title_clash_10: "Gladiator", ach_desc_clash_10: "Vind 10 kampe i Clash.", ach_title_clash_50: "Dominator", ach_desc_clash_50: "Vind 50 kampe i Clash.", ach_title_clash_flawless: "Fejlfri Clash!", ach_desc_clash_flawless: "Vind en ligakamp uden at give modstanderen et eneste felt.", ach_title_rank_silver: "Sølvræv", ach_desc_rank_silver: "Nå Sølv-rang i Clash-ligaen.", ach_title_rank_gold: "Gulddreng", ach_desc_rank_gold: "Nå Guld-rang i Clash-ligaen.", ach_title_rank_diamond: "Speedway Elite", ach_desc_rank_diamond: "Nå Diamant-rang i Clash-ligaen.", ach_title_clash_legend: "Levende legende", ach_desc_clash_legend: "Nå den højeste rang: Legende.", ach_title_ta_10: "Time Attack Ekspert I", ach_desc_ta_10: "Gæt 10 kørere i et enkelt Time Attack-spil.", ach_title_ta_20: "Time Attack Ekspert II", ach_desc_ta_20: "Gæt 20 kørere i et enkelt Time Attack-spil.", ach_title_ta_30: "Time Attack Ekspert III", ach_desc_ta_30: "Gæt 30 kørere i et enkelt Time Attack-spil.", ach_title_ta_50: "Time Attack Ekspert IV", ach_desc_ta_50: "Gæt 50 kørere i et enkelt Time Attack-spil.", ach_title_ta_100: "Time Attack Gud", ach_desc_ta_100: "Gæt 100 kørere i et enkelt Time Attack-spil.", ach_title_easter_club: "Klubfarver", ach_desc_easter_club: "Vælg din favoritklubb i din spillerprofil.", ach_title_easter_lang: "Polyglot", ach_desc_easter_lang: "Skift sprog i indstillinger.", ach_title_easter_theme: "To ansigter", ach_desc_easter_theme: "Skift spillets tema (Lyst/Mørkt)."
    },
    de: {
        account: "DEIN PROFIL", loginDesc: "Mit Google anmelden, um Fortschritte zu speichern!", btnLoginGoogle: "MIT GOOGLE ANMELDEN", orGuest: "ODER GAST-NICK EINGEBEN", guestPlaceholder: "Nick (max 12 Zeichen)", btnSavePlay: "SPEICHERN & SPIELEN", btnLogout: "ABMELDEN",
        settingsTitle: "EINSTELLUNGEN", sound: "Ton:", soundOn: "An 🔊", soundOff: "Aus 🔇",
        subtitle: "Speedway Edition", lastGames: "Letzte Daily-Spiele:", btnDaily: "Daily spielen", btnReview: "Spiel ansehen", btnEndless: "Endless Guessr", searchPlaceholder: "Fahrername eingeben...", btnGuess: "RATEN",
        teams: "Teams:", colName: "Fahrer", colCountry: "Land", colYear: "Geb.", colGP: "SGP?", colDMP: "Medaillen", colStatus: "Status", colClubs: "Klubhistorie",
        stats: "STATISTIKEN", statPlayed: "Gespielt", statWon: "Gewonnen", statStreak: "Aktuelle Serie", statMax: "Beste Serie", btnClose: "SCHLIESSEN", archive: "DAILY-ARCHIV",
        winTitle: "BRAVO!", winSub: "Du hast den Fahrer erraten!", loseTitle: "KEINE VERSUCHE MEHR", loseSub: "Leider nicht erraten.", btnShare: "TEILEN 📋", btnPlayEndless: "ENDLESS SPIELEN", btnPlayAgain: "NOCHMAL SPIELEN", btnMenu: "HAUPTMENÜ", 
        theme: "Design:", themeLight: "Hell", themeDark: "Dunkel", themeSystem: "System", lang: "Sprache:", modeDaily: "Modus: Daily", modeEndless: "Modus: Endless",
        tabDaily: "TÄGLICH", tabWeekly: "WOCHE", tabMonthly: "MONAT", tabAllTime: "GESAMT", rankWonToday: "Siege", rankTotalWins: "Gesamtsiege", rankGuesses: "Versuche",
        months: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"], weekdays: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
        clashTitle: "⚔️ Speedway Clash", clashFriendly: "Freundschaftsspiel", clashFriendlyDesc: "(Mit Freund spielen)", clashLobbyTitle: "🤝 Freundschaftsspiel", clashHost: "RAUM ERSTELLEN (HOST)", clashJoinCode: "RAUMCODE...", clashJoinBtn: "BEITRETEN", clashYourCode: "Dein Raumcode:", clashWaiting: "Warte auf Gegner...", clashReady: "ICH BIN BEREIT", clashTime: "Antwortzeit:", clashSurrender: "AUFGEBEN / VERLASSEN", clashClaim: "FELD ÜBERNEHMEN", clashConfirm: "BESTÄTIGEN", clashCancel: "ABBRECHEN", clashSeries: "SERIENSTAND", clashRematch: "REVANCHE SPIELEN", clashQuit: "BEENDEN UND VERLASSEN", clashRulesTitle: "Regeln: Speedway Clash ⚔️", clashRules1: "Gespielt wird auf einem 3x3 Raster wie Tic-Tac-Toe.", clashRules2: "Klicke auf ein Feld und rate einen Fahrer, der für beide Klubs gefahren ist.", clashRules3: "Es zählt nur die polnische Ligahistorie.", clashRules4: "Du hast 2 Minuten Zeit! Falsche Antwort = Zugverlust.", clashRules5: "Verbinde 3 Felder in einer Reihe, um zu gewinnen!", clashUnderstood: "VERSTANDEN, ICH SPIELE!", clashGuessPlaceholder: "Vor- und Nachname des Fahrers...", clashWaitBtn: "WARTEN...", clashWaitP2: "WARTE AUF GEGNER...",
        dailyProgress: "DEIN DAILY-FORTSCHRITT:", missingRider: "💡 Fehlender Fahrer?", reportBug: "🚩 Fehler melden", joinDiscord: "DISCORD BEITRETEN",
        timeAttackTitle: "TIME ATTACK  ►", scoreLabel: "PUNKTE:", whoAreWeLookingFor: "WEN SUCHEN WIR?", taEmptyList: "Erratene Fahrer erscheinen hier.",
        expertMode: "EXPERTENMODUS", games: "Spiele", record: "Rekord", average: "Schnitt", startGame: "SPIEL STARTEN ►", howToPlay: "WIE WIRD GESPIELT?", backToMenu: "🔙 ZURÜCK ZUM HAUPTMENÜ",
        taRulesTitle: "Regeln: Time Attack ⏱️", taRulesDesc: "Nimm die Herausforderung an und schau, wie viele Fahrer du unter Zeitdruck erraten kannst!", taRule1Title: "Die Uhr tickt", taRule1Desc: "Du startest mit exakt 120 Sekunden. Die Uhr läuft gnadenlos ab.", taRule2Title: "Keine Tipps", taRule2Desc: "Du siehst sofort Land, Geburtsjahr, Medaillen und die Klubhistorie.", taRule3Title: "Zeitboni", taRule3Desc: "Jeder richtig erratene Fahrer gibt +15 Sekunden.", understoodBack: "VERSTANDEN, ZURÜCK!",
        localGameTitle: "🖥️ Lokales Spiel", localGameDesc: "Nicknames eingeben, um an einem Bildschirm zu spielen.", p1Red: "Spieler 1 (Rot)", p2Blue: "Spieler 2 (Blau)", startMatch: "MATCH STARTEN",
        boardPreview: "BRETT-VORSCHAU 👁️", searching: "Suchen...", waitingForOpponentElo: "Warte auf Gegner mit ähnlicher ELO", cancel: "ABBRECHEN",
        sugTitle: "FAHRER MELDEN", sugDesc: "Fehlt ein Fahrer? Gib uns seine Daten und wir fügen ihn hinzu! 🤝", sugName: "Vor- und Nachname *", sugCountry: "Land", sugNotes: "Klubs / Notizen", send: "SENDEN",
        bugTitle: "FEHLER MELDEN 🐛", bugDesc: "Etwas ist schiefgelaufen? Beschreibe das Problem!", bugDescInput: "Problembeschreibung *", sendBug: "FEHLER SENDEN",
        footerPrivacy: "Datenschutzerklärung", footerTerms: "Nutzungsbedingungen", footerContact: "Kontakt", footerRights: "Alle Rechte vorbehalten.",
        linkedAccounts: "VERKNÜPFTE KONTEN", linkDiscord: "DISCORD VERKNÜPFEN", yourNick: "DEIN AKTUELLER NICK:", change: "ÄNDERN", yourClub: "DEIN LIEBLINGSKLUB:", chooseClub: "KLUB WÄHLEN 🛡️", myAchievements: "MEINE ERFOLGE", playerAchievements: "SPIELER-ERFOLGE", backToProfile: "ZURÜCK ZUM PROFIL",
        removeSelection: "AUSWAHL ENTFERNEN", chooseYourClub: "WÄHLE DEINEN KLUB", chooseClubDesc: "Wähle das Team, das du unterstützt. Sein Logo wird neben deinem Nick angezeigt!",
        updatesTitle: "SPIEL-UPDATES 📢", updatesDesc: "Sieh dir unsere neuesten Änderungen an!", understoodBtn: "VERSTANDEN",
        maintTitle: "WARTUNGSARBEITEN", maintDesc: "Serverwartung im Gange.<br>Das Spiel ist vorübergehend deaktiviert.",
        dToday: "HEUTIGES SPIEL ►", dArchive: "DAILY-ARCHIV", dLeague: "LIGASPIEL ►", dFriendly: "FREUNDSCHAFTSSPIEL", dLocal: "LOKALES SPIEL (1 PC)", dSettings: "EINSTELLUNGEN", dProfile: "PROFIL",
        clashRule1Title: "Spielziel", clashRule2Title: "Felder übernehmen", clashRule3Title: "Regeln und Zeit", clashRule4Title: "Zusätzliche Bedingung", clashRule4Desc: "Manchmal erscheint eine Flagge unter dem Klub. Der Fahrer muss auch aus diesem Land kommen!", leagueHistory: "Liga-Historie",
        loadingData: "Lade Daten...", noResults: "Keine Ergebnisse. Sei der Erste!", selectModeMenu: "Wähle einen Spielmodus...", taP1Name: "Spieler 1", taP2Name: "Spieler 2", defaultPlayer: "Spieler",
        toastHintUsed: "Tipp benutzt!", toastPlayerGuessed: "Fahrer bereits erraten.", toastTimeEnd: "Zeit abgelaufen! Punkte: {count}. Zurück zum Menü...",
        toastWaitTurn: "Warte, bis du dran bist!", toastCellTaken: "Feld ist schon besetzt!", toastPlayerNotExist: "Fahrer existiert nicht!", toastWrongCountry: "FEHLER! Land erforderlich:", toastMissedClubs: "Daneben! {name} ist nicht für beide Klubs gefahren.", toastTurn: "DU BIST DRAN!", toastSavedClub: "Gespeichert!", toastRemovedClub: "Klub entfernt", toastAchievement: "🏆 Erfolg:", toastPPM: "⛔ Rechtsklick deaktiviert!", toastConsole: "⛔ Konsole deaktiviert!", toastTabSwitch: "⚠️ Tab-Wechsel! Zug verloren.",
        alertSurrenderConfirm: "Willst du wirklich aufgeben?", alertSurrenderTitle: "Aufgeben?", alertSurrenderBtn: "JA, ICH GEBE AUF",
        alertReturnConfirm: "Zurück zum Menü? Endless-Fortschritt geht verloren.", alertReturnTitle: "Zurück zum Menü", alertReturnBtn: "ZUM MENÜ",
        alertNickLength: "Nick muss min. 3 Zeichen haben!", alertNickRules: "Nick verstößt gegen Regeln.", alertNickTaken: "Nick ist vergeben!", alertNickSame: "Das ist dein aktueller Nick!",
        alertClashLeave: "Raum wird für beide geschlossen. Verlassen?", alertClashLeaveTitle: "Spiel verlassen?", alertClashLeaveBtn: "VERLASSEN",
        alertClashSurrender: "Du verlierst das Spiel und ELO. Aufgeben?", alertClashSurrenderBtn: "AUFGEBEN",
        desktopRankDaily: "LEADERBOARD (TÄGLICH)", desktopRankWeekly: "LEADERBOARD (WOCHE)", desktopRankMonthly: "LEADERBOARD (MONAT)", desktopRankAllTime: "LEADERBOARD (GESAMT)", desktopRankClash: "LEADERBOARD (CLASH)", desktopRankTA: "LEADERBOARD (TIME ATTACK)",
        colPos: "Pos.", colNick: "Nick", colRank: "Rang", colElo: "ELO", colRecord: "Rekord", colSolved: "Gelöst", colTotalWins: "Gesamtsiege", colTries: "Versuche", yes: "JA", no: "NEIN",
        privacyTitle: "DATENSCHUTZERKLÄRUNG", privacyContent: "<div style='text-align: left; font-size: 13px; color: var(--text-dim);'>Wir speichern nur minimale Daten.</div>",
        termsTitle: "NUTZUNGSBEDINGUNGEN", termsContent: "<div style='text-align: left; font-size: 13px; color: var(--text-dim);'>Dies ist ein inoffizielles Fan-Projekt. Cheaten führt zum Ban.</div>",
        ach_title_first_try: "Adlerauge", ach_desc_first_try: "Fahrer im 1. Versuch erraten.", ach_title_close_call: "Knappe Kiste", ach_desc_close_call: "Fahrer im 10. Versuch erraten.", ach_title_no_hint_1: "Schlaumeier", ach_desc_no_hint_1: "Ohne Tipps gewinnen.", ach_title_no_hint_5: "Wandelndes Lexikon", ach_desc_no_hint_5: "5 Siege in Folge ohne Tipps.", ach_title_play_10: "Aufwärmen", ach_desc_play_10: "10 Spiele spielen.", ach_title_play_50: "Maniac", ach_desc_play_50: "50 Spiele spielen.", ach_title_streak_3: "Heiße Serie I", ach_desc_streak_3: "3er Siegesserie.", ach_title_streak_7: "Heiße Serie II", ach_desc_streak_7: "7er Siegesserie.", ach_title_streak_15: "Heiße Serie III", ach_desc_streak_15: "15er Siegesserie.", ach_title_clash_1: "Erstes Blut", ach_desc_clash_1: "Erster Clash-Sieg.", ach_title_clash_10: "Gladiator", ach_desc_clash_10: "10 Clash-Siege.", ach_title_clash_50: "Dominator", ach_desc_clash_50: "50 Clash-Siege.", ach_title_clash_flawless: "Perfekter Clash!", ach_desc_clash_flawless: "Clash gewinnen, ohne ein Feld abzugeben.", ach_title_rank_silver: "Silberfuchs", ach_desc_rank_silver: "Silber-Rang erreichen.", ach_title_rank_gold: "Goldjunge", ach_desc_rank_gold: "Gold-Rang erreichen.", ach_title_rank_diamond: "Elite", ach_desc_rank_diamond: "Diamant-Rang erreichen.", ach_title_clash_legend: "Legende", ach_desc_clash_legend: "Höchsten Rang erreichen.", ach_title_ta_10: "Time Attack Experte I", ach_desc_ta_10: "10 Fahrer in Time Attack.", ach_title_ta_20: "Time Attack Experte II", ach_desc_ta_20: "20 Fahrer in Time Attack.", ach_title_ta_30: "Time Attack Experte III", ach_desc_ta_30: "30 Fahrer in Time Attack.", ach_title_ta_50: "Time Attack Experte IV", ach_desc_ta_50: "50 Fahrer in Time Attack.", ach_title_ta_100: "Time Attack Gott", ach_desc_ta_100: "100 Fahrer in Time Attack.", ach_title_easter_club: "Klubfarben", ach_desc_easter_club: "Lieblingsklub wählen.", ach_title_easter_lang: "Polyglott", ach_desc_easter_lang: "Sprache ändern.", ach_title_easter_theme: "Zwei Gesichter", ach_desc_easter_theme: "Design ändern."
    },
    ru: {
        account: "ТВОЙ ПРОФИЛЬ", loginDesc: "Войдите через Google, чтобы сохранить прогресс!", btnLoginGoogle: "ВОЙТИ ЧЕРЕЗ GOOGLE", orGuest: "ИЛИ ВВЕДИТЕ ИМЯ ГОСТЯ", guestPlaceholder: "Имя (макс. 12 симв.)", btnSavePlay: "СОХРАНИТЬ И ИГРАТЬ", btnLogout: "ВЫЙТИ",
        settingsTitle: "НАСТРОЙКИ", sound: "Звук:", soundOn: "Вкл 🔊", soundOff: "Выкл 🔇",
        subtitle: "Спидвей Версия", lastGames: "Последние Daily:", btnDaily: "Играть Daily", btnReview: "Просмотр игры", btnEndless: "Endless Guessr", searchPlaceholder: "Введите имя гонщика...", btnGuess: "УГАДАТЬ",
        teams: "Команды:", colName: "Гонщик", colCountry: "Страна", colYear: "Год", colGP: "SGP?", colDMP: "Медали DMP", colStatus: "Статус", colClubs: "История клубов",
        stats: "СТАТИСТИКА", statPlayed: "Сыграно", statWon: "Побед", statStreak: "Текущая серия", statMax: "Лучшая серия", btnClose: "ЗАКРЫТЬ", archive: "АРХИВ DAILY",
        winTitle: "БРАВО!", winSub: "Вы угадали гонщика!", loseTitle: "ПОПЫТКИ ЗАКОНЧИЛИСЬ", loseSub: "К сожалению, вы не угадали.", btnShare: "ПОДЕЛИТЬСЯ 📋", btnPlayEndless: "ИГРАТЬ ENDLESS", btnPlayAgain: "ИГРАТЬ СНОВА", btnMenu: "ГЛАВНОЕ МЕНЮ", 
        theme: "Тема:", themeLight: "Светлая", themeDark: "Темная", themeSystem: "Авто", lang: "Язык:", modeDaily: "Режим: Daily", modeEndless: "Режим: Endless",
        tabDaily: "ДЕНЬ", tabWeekly: "НЕДЕЛЯ", tabMonthly: "МЕСЯЦ", tabAllTime: "ЗА ВСЕ ВРЕМЯ", rankWonToday: "Победы", rankTotalWins: "Всего побед", rankGuesses: "Попытки",
        months: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"], weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
        clashTitle: "⚔️ Speedway Clash", clashFriendly: "Товарищеский матч", clashFriendlyDesc: "(Играть с другом)", clashLobbyTitle: "🤝 Товарищеский матч", clashHost: "СОЗДАТЬ КОМНАТУ", clashJoinCode: "КОД КОМНАТЫ...", clashJoinBtn: "ВХОД", clashYourCode: "Ваш код комнаты:", clashWaiting: "Ожидание соперника...", clashReady: "Я ГОТОВ", clashTime: "Время на ответ:", clashSurrender: "СДАТЬСЯ / ВЫЙТИ", clashClaim: "ЗАХВАТИТЬ ПОЛЕ", clashConfirm: "ПОДТВЕРДИТЬ", clashCancel: "ОТМЕНА", clashSeries: "СЧЕТ СЕРИИ", clashRematch: "ИГРАТЬ РЕВАНШ", clashQuit: "ЗАКОНЧИТЬ И ВЫЙТИ", clashRulesTitle: "Правила: Speedway Clash ⚔️", clashRules1: "Игра идет на поле 3x3 (крестики-нолики).", clashRules2: "Чтобы захватить поле, угадайте гонщика, выступавшего за оба клуба.", clashRules3: "Учитывается только польская лига.", clashRules4: "У вас есть 2 минуты! Неверный ответ или конец времени = пропуск хода.", clashRules5: "Соедините 3 поля в ряд для победы!", clashUnderstood: "ПОНЯТНО, ИГРАТЬ!", clashGuessPlaceholder: "Имя гонщика...", clashWaitBtn: "ОЖИДАНИЕ...", clashWaitP2: "ОЖИДАНИЕ СОПЕРНИКА...",
        dailyProgress: "ПРОГРЕСС DAILY:", missingRider: "💡 Нет гонщика?", reportBug: "🚩 Сообщить об ошибке", joinDiscord: "В DISCORD",
        timeAttackTitle: "TIME ATTACK  ►", scoreLabel: "СЧЕТ:", whoAreWeLookingFor: "КОГО ИЩЕМ?", taEmptyList: "Угаданные появятся здесь.",
        expertMode: "РЕЖИМ ЭКСПЕРТА", games: "Игры", record: "Рекорд", average: "В среднем", startGame: "НАЧАТЬ ИГРУ ►", howToPlay: "КАК ИГРАТЬ?", backToMenu: "🔙 В МЕНЮ",
        taRulesTitle: "Правила: Time Attack ⏱️", taRulesDesc: "Узнайте, сколько гонщиков вы угадаете на время!", taRule1Title: "Часы тикают", taRule1Desc: "У вас есть 120 секунд.", taRule2Title: "Без подсказок", taRule2Desc: "Вы сразу видите страну, год, медали и клубы.", taRule3Title: "Бонусы времени", taRule3Desc: "Каждый гонщик дает +15 секунд.", understoodBack: "ПОНЯТНО, НАЗАД!",
        localGameTitle: "🖥️ Локальная игра", localGameDesc: "Введите имена для игры на одном экране.", p1Red: "Игрок 1 (Красный)", p2Blue: "Игрок 2 (Синий)", startMatch: "НАЧАТЬ МАТЧ",
        boardPreview: "ДОСКА 👁️", searching: "Поиск...", waitingForOpponentElo: "Ожидание соперника", cancel: "ОТМЕНА",
        sugTitle: "СООБЩИТЬ О ГОНЩИКЕ", sugDesc: "Заметили отсутствие гонщика? Дайте знать! 🤝", sugName: "Имя *", sugCountry: "Страна", sugNotes: "Клубы", send: "ОТПРАВИТЬ",
        bugTitle: "ОШИБКА 🐛", bugDesc: "Опишите проблему!", bugDescInput: "Описание *", sendBug: "ОТПРАВИТЬ",
        footerPrivacy: "Конфиденциальность", footerTerms: "Правила", footerContact: "Контакт", footerRights: "Все права защищены.",
        linkedAccounts: "АККАУНТЫ", linkDiscord: "ПРИВЯЗАТЬ DISCORD", yourNick: "ВАШ НИК:", change: "ИЗМЕНИТЬ", yourClub: "ВАШ КЛУБ:", chooseClub: "ВЫБРАТЬ КЛУБ 🛡️", myAchievements: "МОИ ДОСТИЖЕНИЯ", playerAchievements: "ДОСТИЖЕНИЯ ИГРОКА", backToProfile: "НАЗАД В ПРОФИЛЬ",
        removeSelection: "УДАЛИТЬ", chooseYourClub: "ВЫБЕРИТЕ КЛУБ", chooseClubDesc: "Его логотип будет виден рядом с вашим ником!",
        updatesTitle: "ОБНОВЛЕНИЯ 📢", updatesDesc: "Последние изменения!", understoodBtn: "ПОНЯТНО",
        maintTitle: "ТЕХНИЧЕСКИЙ ПЕРЕРЫВ", maintDesc: "Сервер на обслуживании.<br>Игра недоступна.",
        dToday: "СЕГОДНЯШНЯЯ ИГРА ►", dArchive: "АРХИВ DAILY", dLeague: "МАТЧ ЛИГИ ►", dFriendly: "ТОВАРИЩЕСКИЙ МАТЧ", dLocal: "ЛОКАЛЬНАЯ ИГРА", dSettings: "НАСТРОЙКИ", dProfile: "ПРОФИЛЬ",
        clashRule1Title: "Цель", clashRule2Title: "Захват полей", clashRule3Title: "Правила", clashRule4Title: "Доп. Требование", clashRule4Desc: "Иногда под клубом будет флаг. Гонщик должен быть из этой страны!", leagueHistory: "История Лиги",
        loadingData: "Загрузка...", noResults: "Нет результатов.", selectModeMenu: "Выберите режим в меню слева...", taP1Name: "Игрок 1", taP2Name: "Игрок 2", defaultPlayer: "Игрок",
        toastHintUsed: "Подсказка использована!", toastPlayerGuessed: "Уже угадан.", toastTimeEnd: "Время вышло! Счет: {count}. Возврат в меню...",
        toastWaitTurn: "Ждите своей очереди!", toastCellTaken: "Поле занято!", toastPlayerNotExist: "Гонщик не найден!", toastWrongCountry: "ОШИБКА! Нужен гонщик из:", toastMissedClubs: "Промах! {name} не выступал за оба клуба.", toastTurn: "ВАШ ХОД!", toastSavedClub: "Сохранено!", toastRemovedClub: "Клуб удален", toastAchievement: "🏆 Достижение:", toastPPM: "⛔ Правый клик заблокирован!", toastConsole: "⛔ Доступ к консоли заблокирован!", toastTabSwitch: "⚠️ Вы свернули вкладку! Пропуск хода.",
        alertSurrenderConfirm: "Вы уверены, что хотите сдаться?", alertSurrenderTitle: "Сдаетесь?", alertSurrenderBtn: "СДАЮСЬ",
        alertReturnConfirm: "Вернуться в меню? Прогресс Endless будет потерян.", alertReturnTitle: "В меню", alertReturnBtn: "В МЕНЮ",
        alertNickLength: "Мин. 3 символа!", alertNickRules: "Ник нарушает правила.", alertNickTaken: "Ник занят!", alertNickSame: "Это ваш ник!",
        alertClashLeave: "Выход закроет комнату.\nВы уверены?", alertClashLeaveTitle: "Покинуть матч?", alertClashLeaveBtn: "ВЫЙТИ",
        alertClashSurrender: "Вы проиграете техническим поражением. Уверены?", alertClashSurrenderBtn: "СДАТЬСЯ",
        desktopRankDaily: "ЛЕДЕРБОРД (ДЕНЬ)", desktopRankWeekly: "ЛЕДЕРБОРД (НЕДЕЛЯ)", desktopRankMonthly: "ЛЕДЕРБОРД (МЕСЯЦ)", desktopRankAllTime: "ЛЕДЕРБОРД (ВЕЧНЫЙ)", desktopRankClash: "ЛЕДЕРБОРД (CLASH)", desktopRankTA: "ЛЕДЕРБОРД (TIME ATTACK)",
        colPos: "Поз.", colNick: "Имя", colRank: "Ранг", colElo: "ELO", colRecord: "Рекорд", colSolved: "Решено", colTotalWins: "Всего побед", colTries: "Попытки", yes: "ДА", no: "НЕТ",
        privacyTitle: "КОНФИДЕНЦИАЛЬНОСТЬ", privacyContent: "<div style='text-align: left; font-size: 13px; color: var(--text-dim);'>Мы сохраняем минимум данных.</div>",
        termsTitle: "ПРАВИЛА", termsContent: "<div style='text-align: left; font-size: 13px; color: var(--text-dim);'>Это фанатский проект. Читы ведут к бану.</div>",
        ach_title_first_try: "Орлиный глаз", ach_desc_first_try: "Угадайте гонщика с 1 попытки.", ach_title_close_call: "На волоске", ach_desc_close_call: "Угадайте гонщика с 10 попытки.", ach_title_no_hint_1: "Умник", ach_desc_no_hint_1: "Выиграйте без подсказок.", ach_title_no_hint_5: "Энциклопедия", ach_desc_no_hint_5: "5 побед подряд без подсказок.", ach_title_play_10: "Разминка", ach_desc_play_10: "Сыграйте 10 игр.", ach_title_play_50: "Маньяк", ach_desc_play_50: "Сыграйте 50 игр.", ach_title_streak_3: "Серия I", ach_desc_streak_3: "Победная серия: 3.", ach_title_streak_7: "Серия II", ach_desc_streak_7: "Победная серия: 7.", ach_title_streak_15: "Серия III", ach_desc_streak_15: "Победная серия: 15.", ach_title_clash_1: "Первая кровь", ach_desc_clash_1: "Первая победа в Clash.", ach_title_clash_10: "Гладиатор", ach_desc_clash_10: "10 побед в Clash.", ach_title_clash_50: "Доминатор", ach_desc_clash_50: "50 побед в Clash.", ach_title_clash_flawless: "Безупречно!", ach_desc_clash_flawless: "Clash без потери полей.", ach_title_rank_silver: "Серебро", ach_desc_rank_silver: "Ранг Серебро.", ach_title_rank_gold: "Золото", ach_desc_rank_gold: "Ранг Золото.", ach_title_rank_diamond: "Элита", ach_desc_rank_diamond: "Ранг Бриллиант.", ach_title_clash_legend: "Легенда", ach_desc_clash_legend: "Ранг Легенда.", ach_title_ta_10: "TA Эксперт I", ach_desc_ta_10: "10 гонщиков в Time Attack.", ach_title_ta_20: "TA Эксперт II", ach_desc_ta_20: "20 гонщиков в Time Attack.", ach_title_ta_30: "TA Эксперт III", ach_desc_ta_30: "30 гонщиков в Time Attack.", ach_title_ta_50: "TA Эксперт IV", ach_desc_ta_50: "50 гонщиков в Time Attack.", ach_title_ta_100: "Бог Time Attack", ach_desc_ta_100: "100 гонщиков в Time Attack.", ach_title_easter_club: "Цвета клуба", ach_desc_easter_club: "Выберите клуб.", ach_title_easter_lang: "Полиглот", ach_desc_easter_lang: "Смените язык.", ach_title_easter_theme: "Два лица", ach_desc_easter_theme: "Смените тему."
    }
};

let currentLang = localStorage.getItem('speedwayLang') || 'pl';

function t(key, params = {}) {
    let langObj = i18n[currentLang] || i18n['pl'];
    let str = langObj[key] !== undefined ? langObj[key] : (i18n['pl'][key] !== undefined ? i18n['pl'][key] : key);
    for (let p in params) {
        str = str.replace(`{${p}}`, params[p]);
    }
    return str;
}


// Ensure function is available from inline onclick handlers in HTML
try { window.setLang = setLang; } catch (e) {}

// ==============================================
// ====== USTAWIENIA NOWE TAKIE O ===============
// ==============================================

// Aplikowanie fizycznego CSS w zależności od wyboru
function applyTheme(themeName) {
    let actualTheme = themeName;
    if (themeName === 'system') {
        actualTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', actualTheme);
}

function setTheme(themeName) { 
    let oldTheme = localStorage.getItem('theme');
    localStorage.setItem('theme', themeName); 
    applyTheme(themeName);
    
    // Zaznaczanie aktywnego kafelka w Ustawieniach
    document.querySelectorAll('.option-card').forEach(el => el.classList.remove('active'));
    const activeBtn = document.getElementById('theme-btn-' + themeName);
    if (activeBtn) activeBtn.classList.add('active');
    
    // Odblokowanie osiągnięcia, jeśli temat faktycznie się zmienił (zabezpieczenie na start)
    if (oldTheme && oldTheme !== themeName && typeof userStats !== 'undefined' && userStats.trackers) {
        ensureAchievementsStats();
        userStats.trackers.changedTheme = true;
        checkAchievements();
        saveStats();
    }
}

// Nasłuchiwacz: Jeśli zmienia się tryb w telefonie, a gracz ma wybrane "System", zmień natychmiast
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
    if (localStorage.getItem('theme') === 'system') {
        applyTheme('system');
    }
});

// Musimy zaktualizować setLang, by podświetlało nowe karty z flagami
function setLang(lang) {
    try { console.log('setLang called:', lang); } catch (e) {}
    
    let oldLang = localStorage.getItem('speedwayLang');
    currentLang = i18n[lang] ? lang : 'pl';
    localStorage.setItem('speedwayLang', currentLang);
    
    // Nowa klasa flag
    document.querySelectorAll('.flag-card').forEach(el => el.classList.remove('active'));
    const flagEl = document.getElementById('flag-btn-' + currentLang); 
    if(flagEl) flagEl.classList.add('active');

    const strings = i18n[currentLang] || i18n.pl;
    const nodes = document.querySelectorAll('[data-i18n]');
    let applied = 0; const missing = new Set();
    nodes.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        const val = strings[key];
        if (val !== undefined) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = val;
            else el.innerHTML = val;
            applied++;
        } else {
            missing.add(key);
        }
    });

    document.querySelectorAll('[data-i18n-tip]').forEach(el => {
        const tipKey = el.getAttribute('data-i18n-tip');
        if (tipKey && strings[tipKey]) el.setAttribute('data-tip', strings[tipKey]);
    });

    updateDailyMenu(); updateSoundBtn(); updateAuthUI(auth.currentUser);
    if(document.getElementById('calendarOverlay').style.display === 'block') renderCalendar();
    renderUpdates();
    
    const modeDisplay = document.getElementById('gameModeDisplay');
    if (gameMode === 'daily') modeDisplay.innerText = `${i18n[currentLang].modeDaily} ${dailyNumberGlobal}`;
    else modeDisplay.innerText = i18n[currentLang].modeEndless;
    
    // ODBLOKOWANIE OSIĄGNIĘCIA
    if (oldLang && oldLang !== currentLang && typeof userStats !== 'undefined' && userStats.trackers) {
        ensureAchievementsStats();
        userStats.trackers.changedLang = true;
        checkAchievements();
        saveStats();
    }
}

function toggleSound() { 
    soundEnabled = !soundEnabled; 
    localStorage.setItem('speedwaySound', soundEnabled); 
    updateSoundBtn(); 
}

function updateSoundBtn() {
    const btn = document.getElementById('btnSoundToggle');
    if (btn) { 
        btn.innerHTML = soundEnabled ? `${i18n[currentLang].soundOn || 'Włączony 🔊'}` : `${i18n[currentLang].soundOff || 'Wyłączony 🔇'}`; 
        // Zmieniamy tylko podświetlenie krawędzi dla efektu wciśnięcia
        btn.style.borderColor = soundEnabled ? 'var(--accent)' : 'var(--border-color)';
        btn.style.color = soundEnabled ? 'var(--accent)' : 'var(--text-dim)';
        btn.style.background = soundEnabled ? 'rgba(241, 196, 15, 0.05)' : 'transparent';
    }
}

// Przy załadowaniu strony aktywujemy zapisany temat wizualnie
window.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
});

// ==============================================
// ====== AUDIO, UI I START GRY =================
// ==============================================

let audioCtx = null;
let soundEnabled = localStorage.getItem('speedwaySound') !== 'false';
function toggleSound() { soundEnabled = !soundEnabled; localStorage.setItem('speedwaySound', soundEnabled); updateSoundBtn(); }


function playSound(type) {
    if (!soundEnabled) return;
    if (!audioCtx) { const AudioContext = window.AudioContext || window.webkitAudioContext; audioCtx = new AudioContext(); }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;

    if (type === 'guess') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'flip') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
        gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'error') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.setValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'win') {
        const freqs = [523.25, 659.25, 783.99, 1046.50]; 
        freqs.forEach((freq, i) => {
            const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
            osc.type = 'sine'; osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, now + i * 0.08); gain.gain.linearRampToValueAtTime(0.3, now + i * 0.08 + 0.02); gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.4);
            osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.45);
        });
    } else if (type === 'lose') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); const filter = audioCtx.createBiquadFilter();
        osc.type = 'triangle'; osc.frequency.setValueAtTime(300, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.5);
        filter.type = 'lowpass'; filter.frequency.value = 600; 
        gain.gain.setValueAtTime(0.4, now); gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.5);
    }
     else if (type === 'heartbeat') {
        // Głębokie uderzenie serca (2 tąpnięcia)
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(50, now); osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);
        gain.gain.setValueAtTime(0.6, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.3);

        const osc2 = audioCtx.createOscillator(); const gain2 = audioCtx.createGain();
        osc2.type = 'sine'; osc2.frequency.setValueAtTime(55, now + 0.3); osc2.frequency.exponentialRampToValueAtTime(35, now + 0.4);
        gain2.gain.setValueAtTime(0.5, now + 0.3); gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc2.connect(gain2); gain2.connect(audioCtx.destination); osc2.start(now + 0.3); osc2.stop(now + 0.6);
    }
}

const helmetImgObj = new Image(); function preloadHelmetImage() { helmetImgObj.src = 'kask-zycie.png'; }

// ZMIANA Z window.onload na DOMContentLoaded by gra ładowała się natychmiast, bez czekania na grafiki!
document.addEventListener('DOMContentLoaded', async function() { 
    setRandomBackground();
    
    // --- GŁÓWNA POPRAWKA ---
    // Wczytujemy dane gracza ZANIM gra zostanie zablokowana przez łączenie z chmurą! 
    loadStats(); 
    initDailyMenu(); 
    renderLastGames(); 
    preloadHelmetImage(); 
    setLang(currentLang); 
    updateSoundBtn(); 
    updateLeagueUI(); 
    checkUnseenUpdates();

    // === SPRAWDZANIE PRZERWY TECHNICZNEJ I OSTRZEŻEŃ ===
    try {
        const getConfigFunc = functions.httpsCallable('getConfig');
        const configResponse = await getConfigFunc();

        // 1. BANNER O PRACACH NA ŻYWO
        if (configResponse.data && configResponse.data.warningMode === true) {
            if (!document.getElementById('warningPulseAnim')) {
                const style = document.createElement('style');
                style.id = 'warningPulseAnim';
                style.innerHTML = `
                    @keyframes warningSlideDown {
                        0% { transform: translate(-50%, -50px); opacity: 0; }
                        100% { transform: translate(-50%, 15px); opacity: 1; }
                    }
                    @keyframes warningGlow {
                        0% { box-shadow: 0 0 10px rgba(220, 38, 38, 0.3); }
                        50% { box-shadow: 0 0 25px rgba(220, 38, 38, 0.8); }
                        100% { box-shadow: 0 0 10px rgba(220, 38, 38, 0.3); }
                    }
                    .modern-warning-banner {
                        position: fixed;
                        top: 0;
                        left: 50%;
                        transform: translate(-50%, 15px);
                        background: rgba(20, 20, 25, 0.9);
                        backdrop-filter: blur(8px);
                        border: 1px solid #dc2626;
                        color: #eaeaea;
                        padding: 10px 20px;
                        border-radius: 30px;
                        font-size: 13px;
                        font-weight: 500;
                        text-align: left;
                        z-index: 999999;
                        pointer-events: none;
                        animation: warningSlideDown 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards, warningGlow 2s infinite ease-in-out;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        max-width: 90%;
                        width: fit-content;
                        line-height: 1.4;
                    }
                    .modern-warning-banner b {
                        color: #ff4d4d;
                        letter-spacing: 0.5px;
                    }
                    .modern-warning-icon {
                        font-size: 20px;
                        filter: drop-shadow(0 0 5px rgba(220, 38, 38, 0.8));
                    }
                `;
                document.head.appendChild(style);
            }

            const banner = document.createElement('div');
            banner.className = 'modern-warning-banner';
            banner.innerHTML = `
                <div class="modern-warning-icon">⚠️</div> 
                <div><b>PRACE SERWISOWE:</b> Trwają prace nad serwerem. Niektóre funkcje mogą tymczasowo nie działać. Przepraszamy za utrudnienia! 🛠️</div>
            `;
            document.body.appendChild(banner);
        }

        // 2. CAŁKOWITA PRZERWA TECHNICZNA
        if (configResponse.data && configResponse.data.maintenanceMode === true) {
            if (!window.isAdmin) {
                window.isMaintenanceBlocked = true;
                document.getElementById('maintenanceOverlay').style.display = 'block';
                document.getElementById('maintenanceOverlay').style.opacity = '1';
                
                if (document.getElementById('mainMenuContainer')) document.getElementById('mainMenuContainer').style.display = 'none';
                if (document.getElementById('desktopMainMenu')) document.getElementById('desktopMainMenu').style.display = 'none';
                return; 
            } else {
                showToast("🔐 Tryb Admina: Przerwa techniczna pominięta!", "success");
            }
        }

        // 3. BANNER INFORMACYJNY
        if (configResponse.data && configResponse.data.infoMode === true) {
            if (!document.getElementById('infoPulseAnim')) {
                const style = document.createElement('style');
                style.id = 'infoPulseAnim';
                style.innerHTML = `
                    @keyframes infoSlideDown {
                        0% { transform: translate(-50%, -50px); opacity: 0; }
                        100% { transform: translate(-50%, 15px); opacity: 1; }
                    }
                    @keyframes infoGlow {
                        0% { box-shadow: 0 0 10px rgba(241, 196, 15, 0.3); }
                        50% { box-shadow: 0 0 25px rgba(241, 196, 15, 0.8); }
                        100% { box-shadow: 0 0 10px rgba(241, 196, 15, 0.3); }
                    }
                    .modern-info-banner {
                        position: fixed;
                        top: 0;
                        left: 50%;
                        transform: translate(-50%, 15px);
                        background: rgba(20, 20, 25, 0.9);
                        backdrop-filter: blur(8px);
                        border: 1px solid #f1c40f;
                        color: #eaeaea;
                        padding: 10px 20px;
                        border-radius: 30px;
                        font-size: 13px;
                        font-weight: 500;
                        text-align: left;
                        z-index: 999999;
                        pointer-events: none;
                        animation: infoSlideDown 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards, infoGlow 2s infinite ease-in-out;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        max-width: 90%;
                        width: fit-content;
                        line-height: 1.4;
                    }
                    .modern-info-banner b {
                        color: #f1c40f;
                        letter-spacing: 0.5px;
                    }
                    .modern-info-icon {
                        font-size: 20px;
                        filter: drop-shadow(0 0 5px rgba(241, 196, 15, 0.8));
                    }
                `;
                document.head.appendChild(style);
            }

            const banner = document.createElement('div');
            banner.className = 'modern-info-banner';
            banner.innerHTML = `
                <div class="modern-info-icon">💡</div> 
                <div><b>INFORMACJA:</b> W Profilu możesz wybrać swój ulubiony klub, a będzie on widoczny w każdej tabeli!</div>
            `;
            document.body.appendChild(banner);
        }
        
    } catch(e) {
        console.warn("Nie udało się połączyć z serwerem, by sprawdzić status.", e);
    }
});


function loadStats() {
    let saved = localStorage.getItem('speedwayStatsV2'); 
    if(saved) {
        try {
            let parsed = JSON.parse(saved);
            // Używamy bezpiecznego przypisania dekonstruktem zamiast nadpisywać obiekt:
            userStats = { ...userStats, ...parsed };
        } catch(e) {
            console.error("Błąd ładowania statystyk lokalnych:", e);
        }
        if (!userStats.dailyResults) userStats.dailyResults = {};
        if (!userStats.dailyHistory) userStats.dailyHistory = [];
        if (!userStats.dailyGuesses) userStats.dailyGuesses = {};
        if (!userStats.recentEndless) userStats.recentEndless = [];
        if (!userStats.clashHistory) userStats.clashHistory = [];
    }
    
    ensureLeagueStats(userStats);
    ensureTimeAttackStats(userStats);
    updateDiscordButtonUI();
    
    // Wysyłamy wciemno ELO tylko dla Gości. Zalogowani (Google) 
    // wyślą swój wynik DOPIERO PO pobraniu najświeższych danych z chmury!
    setTimeout(() => {
        if (!auth.currentUser && playerId && playerId.startsWith('guest_')) {
            syncLeagueScoreToFirebase();
        }
    }, 1500);
}

function saveStats() { 
    localStorage.setItem('speedwayStatsV2', JSON.stringify(userStats)); 
    updateLeagueUI();
    syncStatsToFirebase(); 
}

function getDailyDateString(dayNumber) {
    const startUTC = Date.UTC(DAILY_START_DATE.getFullYear(), DAILY_START_DATE.getMonth(), DAILY_START_DATE.getDate());
    const d = new Date(startUTC + (dayNumber - 1) * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getCurrentMonthStr() { const d = new Date(); return d.getFullYear() + "_" + (d.getMonth() + 1).toString().padStart(2, '0'); }
function getCurrentWeekStr() {
    let date = new Date(); let dayNum = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    let yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    let weekNo = Math.ceil((((date - yearStart) / 86400000) + 1)/7);
    return date.getUTCFullYear() + "_W" + weekNo.toString().padStart(2, '0');
}

function initDailyMenu() {
    const now = new Date(); const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const startUTC = Date.UTC(DAILY_START_DATE.getFullYear(), DAILY_START_DATE.getMonth(), DAILY_START_DATE.getDate());
    currentDailyDay = Math.floor((nowUTC - startUTC) / (1000 * 60 * 60 * 24)) + 1;
    if (currentDailyDay < 1) currentDailyDay = 1; selectedDailyDay = currentDailyDay; updateDailyMenu();
}

function changeDaily(dir) {
    selectedDailyDay += dir;
    if (selectedDailyDay < 1) selectedDailyDay = 1;
    if (selectedDailyDay > currentDailyDay) selectedDailyDay = currentDailyDay; 
    updateDailyMenu();
}

function changeDailyInGame(dir) {
    changeDaily(dir); document.getElementById('winOverlay').style.display = 'none'; document.getElementById('loseOverlay').style.display = 'none';
    clearGameBoard(); initGame();
}

function updateDailyMenu() {
    const strings = i18n[currentLang] || i18n.pl;
    document.getElementById('dailyDayDisplay').innerText = `Daily ${getDailyDateString(selectedDailyDay)}`;
    document.getElementById('btnPrevDaily').style.visibility = (selectedDailyDay <= 1) ? 'hidden' : 'visible';
    document.getElementById('btnNextDaily').style.visibility = (selectedDailyDay >= currentDailyDay) ? 'hidden' : 'visible';
    
    const btn = document.getElementById('btnDailyMode'); const txt = document.getElementById('dailyBtnText');
    if (!btn || !txt) return;
    if (userStats.dailyResults[selectedDailyDay]) { btn.classList.remove('disabled'); txt.innerHTML = strings.btnReview; } 
    else { btn.classList.remove('disabled'); txt.innerHTML = strings.btnDaily; }
}

function openCalendar() {
    calRenderMonth = new Date().getMonth(); calRenderYear = new Date().getFullYear(); renderCalendar();
    const overlay = document.getElementById('calendarOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}
function closeCalendar() { const overlay = document.getElementById('calendarOverlay'); overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300); }
function changeCalendarMonth(dir) { calRenderMonth += dir; if (calRenderMonth > 11) { calRenderMonth = 0; calRenderYear++; } else if (calRenderMonth < 0) { calRenderMonth = 11; calRenderYear--; } renderCalendar(); }

function renderCalendar() {
    document.getElementById('calendarMonthDisplay').innerText = `${i18n[currentLang].months[calRenderMonth]} ${calRenderYear}`;
    const wdContainer = document.getElementById('calendarWeekdays'); wdContainer.innerHTML = '';
    i18n[currentLang].weekdays.forEach(wd => { wdContainer.innerHTML += `<div>${wd}</div>`; });

    const grid = document.getElementById('calendarGrid'); grid.innerHTML = '';
    const firstDay = new Date(calRenderYear, calRenderMonth, 1);
    const daysInMonth = new Date(calRenderYear, calRenderMonth + 1, 0).getDate();
    let startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    for (let i = 0; i < startDayOfWeek; i++) { const emptyBox = document.createElement('div'); emptyBox.className = 'cal-day empty'; grid.appendChild(emptyBox); }

    const startUTC = Date.UTC(DAILY_START_DATE.getFullYear(), DAILY_START_DATE.getMonth(), DAILY_START_DATE.getDate());
    const now = new Date(); const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

    for (let i = 1; i <= daysInMonth; i++) {
        const box = document.createElement('div'); box.className = 'cal-day'; box.innerText = i;
        const cellUTC = Date.UTC(calRenderYear, calRenderMonth, i);
        
        if (cellUTC < startUTC) { box.classList.add('disabled'); } 
        else if (cellUTC > todayUTC) { box.classList.add('disabled', 'future'); } 
        else {
            const dailyNum = Math.floor((cellUTC - startUTC) / (1000 * 60 * 60 * 24)) + 1;
            box.title = `Daily #${dailyNum}`;
            if (userStats.dailyResults[dailyNum] === 'win') { box.classList.add('win'); }
            else if (userStats.dailyResults[dailyNum] === 'loss') { box.classList.add('loss'); }
            else { box.classList.add('playable'); }
            box.onclick = () => { selectDayFromCalendar(dailyNum); };
            if (dailyNum === selectedDailyDay) box.style.border = "2px solid var(--accent)";
        }
        grid.appendChild(box);
    }
}

function selectDayFromCalendar(dayNum) { 
    selectedDailyDay = dayNum; updateDailyMenu(); closeCalendar(); 
    if(document.getElementById('gameContainer').style.display === 'block') changeDailyInGame(0);
}

function renderLastGames() {
    const container = document.getElementById('lastGamesContainer'); const list = document.getElementById('lastGamesList');
    if (container && list && userStats.dailyHistory.length > 0) {
        container.style.display = 'block'; list.innerHTML = '';
        userStats.dailyHistory.forEach(isWin => {
            const tile = document.createElement('div'); tile.className = `daily-tile ${isWin ? 'win' : 'loss'}`; list.appendChild(tile);
        });
    }
}

function openSettings() {
    const overlay = document.getElementById('settingsOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeSettings() {
    const overlay = document.getElementById('settingsOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
}



// ==============================================
// ====== LOGIKA GRY (DAILY / ENDLESS) ==========
// ==============================================

async function sendScoreToDatabase(isWin, attempts) {
    if (selectedDailyDay !== currentDailyDay) return;
    if (!playerNickname) return;
    try {
        const batch = db.batch(); const ts = firebase.firestore.FieldValue.serverTimestamp();
        const safeNick = escapeHTML(playerNickname);
        const dailyRef = db.collection("rankings").doc(currentDailyDay.toString()).collection("scores").doc(playerId);
        batch.set(dailyRef, { nick: safeNick, club: userStats.favoriteClub || null, bg: userStats.equippedBg || null, won: isWin ? 1 : 0, guesses: attempts, hints: hintsUsedCount, timestamp: ts }, { merge: true });        
        const increment = firebase.firestore.FieldValue.increment;
        const winIncrement = isWin ? 1 : 0; 
        
        const weeklyRef = db.collection("leaderboard_weekly").doc(getCurrentWeekStr()).collection("scores").doc(playerId);
        batch.set(weeklyRef, { nick: safeNick, club: userStats.favoriteClub || null, bg: userStats.equippedBg || null, wins: increment(winIncrement), guesses: increment(attempts), timestamp: ts }, { merge: true });
        
        const monthlyRef = db.collection("leaderboard_monthly").doc(getCurrentMonthStr()).collection("scores").doc(playerId);
        batch.set(monthlyRef, { nick: safeNick, club: userStats.favoriteClub || null, bg: userStats.equippedBg || null, wins: increment(winIncrement), guesses: increment(attempts), timestamp: ts }, { merge: true });
        
        const alltimeRef = db.collection("leaderboard_alltime").doc("global").collection("scores").doc(playerId);
        batch.set(alltimeRef, { nick: safeNick, club: userStats.favoriteClub || null, bg: userStats.equippedBg || null, wins: increment(winIncrement), guesses: increment(attempts), timestamp: ts }, { merge: true });
        
        await batch.commit();
    } catch (e) { console.error("DB Error:", e); }
}

async function syncLeagueScoreToFirebase() {
    if (!playerId) return; 

    // BLOKADA ANTI-CRASH: Jeśli masz ID z Google, ale Firebase jeszcze Cię nie zautoryzował (trwa ładowanie), 
    // to bezwzględnie blokujemy wysyłkę.
    if (!auth.currentUser && !playerId.startsWith('guest_')) {
        return; 
    }

    const league = ensureLeagueStats(userStats).clashLeague;
    let eloToSend = Math.round(league.elo);
    
    // Ochrona przed zepsutymi wartościami (NaN, ujemne)
    if (isNaN(eloToSend) || eloToSend === null || eloToSend < 0) eloToSend = 1000;
    if (eloToSend > 5000) eloToSend = 5000;

    try {
        // SPRAWDZAMY ZANIM WYŚLEMY (aby uniknąć czerwonego błędu Permissions w konsoli)
        const docRef = db.collection('leaderboard_clash_beta').doc(playerId);
        const docSnap = await docRef.get();
        
        if (docSnap.exists) {
            const cloudData = docSnap.data();
            const cloudElo = cloudData.elo || 1000;
            
            // Jeśli różnica ELO wykracza poza reguły bazy danych (prawie 200),
            // Oznacza to, że gracz grał na innym urządzeniu i lokalny save jest zepsuty/stary!
            if (Math.abs(cloudElo - eloToSend) > 190) {
                console.warn(`Wykryto asynchronizację ELO (Lokalne: ${eloToSend} vs Serwer: ${cloudElo}). Pobieram poprawne dane z rankingu...`);
                
                userStats.clashLeague.elo = cloudElo;
                userStats.clashLeague.matchesPlayed = cloudData.matchesPlayed || league.matchesPlayed;
                userStats.clashLeague.wins = cloudData.wins || league.wins;
                userStats.clashLeague.losses = cloudData.losses || league.losses;
                userStats.clashLeague.draws = cloudData.draws || league.draws;
                
                localStorage.setItem('speedwayStatsV2', JSON.stringify(userStats));
                updateLeagueUI();
                
                return; // Zamykamy funkcję - NIE ZAPISUJEMY starych danych do bazy!
            }
        }

        // Jeśli różnica jest w normie (albo gracz gra pierwszy raz), bezpiecznie aktualizujemy bazę
        await docRef.set({
            nick: playerNickname || 'Gracz',
            club: userStats.favoriteClub || null,
            bg: userStats.equippedBg || null,
            elo: eloToSend,
            matchesPlayed: league.matchesPlayed,
            wins: league.wins,
            losses: league.losses,
            draws: league.draws,
            rank: getLeagueRankName(eloToSend, league.matchesPlayed),
            provisional: league.matchesPlayed < 5,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

    } catch (e) { 
        console.warn('Ostrzeżenie synchronizacji Ligi Clash:', e.message); 
    }
}

function updateStatsOnWin() {
    if(hasWon || hasLost) return; hasWon = true;
    userStats.played++; userStats.won++; userStats.currentStreak++;
    
    ensureAchievementsStats();
    if (!hintActive) userStats.trackers.winsNoHint++;
    checkAchievements();

    // NOWOŚĆ: Postęp misji i EXP
    updateMissionProgress('play_endless', 1);
    if (!hintActive) updateMissionProgress('no_hint_win', 1);
    addExp(20); // 20 EXP za wygraną

    if(userStats.currentStreak > userStats.maxStreak) userStats.maxStreak = userStats.currentStreak;
    if (gameMode === 'daily') {
        userStats.dailyResults[selectedDailyDay] = 'win'; userStats.dailyHistory.push(true);
        if (userStats.dailyHistory.length > 5) userStats.dailyHistory.shift(); 
        sendScoreToDatabase(true, guessCount);
    }
    saveStats();
}

function updateStatsOnLoss() {
    if(hasWon || hasLost) return; hasLost = true;
    userStats.played++; userStats.currentStreak = 0; 
    
    // NOWOŚĆ: Postęp misji i EXP
    updateMissionProgress('play_endless', 1);
    addExp(5); // Nagroda pocieszenia

    if (gameMode === 'daily') {
        userStats.dailyResults[selectedDailyDay] = 'loss'; userStats.dailyHistory.push(false);
        if (userStats.dailyHistory.length > 5) userStats.dailyHistory.shift();
        sendScoreToDatabase(false, guessCount);
    }
    saveStats();
}

function startDailyGame() { 
    promptForNick(() => {
        gameMode = 'daily';
        const mainMenu = document.getElementById('mainMenuContainer');
        const gameContainer = document.getElementById('gameContainer');
        if (mainMenu) mainMenu.style.display = 'none';
        if (gameContainer) gameContainer.style.display = 'block';

        document.getElementById('desktopMainMenu').style.display = 'none';
        initGame(); 
    });
}

function startEndlessGame() {
    gameMode = 'endless';
    const mainMenu = document.getElementById('mainMenuContainer');
    const gameContainer = document.getElementById('gameContainer');
    if (mainMenu) mainMenu.style.display = 'none';
    if (gameContainer) gameContainer.style.display = 'block';

    document.getElementById('desktopMainMenu').style.display = 'none';
    initGame();
}

function triggerErrorShake() {
    const inputWrapper = document.querySelector('.input-wrapper');
    if (!inputWrapper) return;
    inputWrapper.classList.add('shake-error');
    playSound('error');
    setTimeout(() => { inputWrapper.classList.remove('shake-error'); }, 400);
}

// System powiadomień (Toast) - zamiast irytujących alertów
function showToast(message, type = 'normal') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOutToast 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function updateCounterDisplay() { 
    const container = document.getElementById('livesContainer');
    if (!container) return;
    container.style.display = 'flex'; container.innerHTML = '';
    for (let i = 0; i < GUESS_LIMIT; i++) {
        const isLost = i < guessCount; const isJustLost = (i === guessCount - 1) && !isRestoring && !hasWon; 
        let cls = "helmet-icon";
        if (isJustLost) cls += " life-lost-anim"; else if (isLost) cls += " helmet-lost"; 
        container.innerHTML += `<img src="kask-zycie.png" class="${cls}" alt="Kask">`;
    }
}

function exitToMainMenu() {
    window.location.reload(); // Najbezpieczniejszy powrót i reset stanu gry
}

async function submitLeagueSurrender(data) {
    let opponentColor = myClashColor === 'red' ? 'blue' : 'red';
    await db.collection("clash_rooms").doc(currentClashRoom).update({
        status: 'summary',
        winner: opponentColor,
        finishReason: 'surrender'
    });
    // Nakładamy bana za opuszczenie aktywnego meczu:
    applyMatchmakingBan("Opuszczenie aktywnego meczu ligowego.");
}

function clearGameBoard() {
    guessCount = 0; guessHistory = []; guessedPlayersNames = []; hasWon = false; hasLost = false; isRestoring = false;
    hintActive = false; hintsUsedCount = 0; // Reset podpowiedzi
    document.getElementById('results').innerHTML = ''; document.getElementById('guessInput').value = '';
    document.getElementById('mysteryPhoto').style.display = 'none'; document.getElementById('mysteryPlaceholder').style.display = 'block';
    document.getElementById('photoWrapper').classList.remove('revealed'); document.getElementById('mysteryName').innerText = '???';
    document.getElementById('mysteryName').style.color = 'var(--text-main)'; document.getElementById('postGameActions').style.display = 'none';
    document.getElementById('btnGiveUp').style.display = 'none';
    document.getElementById('btnHint').style.display = 'none';
}

async function returnToMainMenu() {
    // Pytamy tylko jeśli gracz zaczął wpisywać i gra nie jest zakończona
    if (!hasWon && !hasLost && guessCount > 0) {
        const conf = await appConfirm("Czy na pewno chcesz wrócić do menu? Zapiszemy Twój postęp w Daily, ale w trybie Endless stracisz tę grę.", { title: "Powrót do menu", danger: true, confirmText: "WRÓĆ DO MENU" });
        if (!conf) return;
    }
    window.location.reload();
}


// Aktywacja podpowiedzi z przycisku
function useHint() {
    if (hintActive) return;
    hintActive = true;
    hintsUsedCount = 1;
    document.getElementById('btnHint').style.display = 'none'; // Ukrywamy po kliknięciu
    updateHintDisplay();
    showToast("Użyto podpowiedzi!", "success");
}

function resetBoardAndPlay() {
    document.getElementById('winOverlay').style.opacity = '0'; document.getElementById('loseOverlay').style.opacity = '0';
    setTimeout(() => { document.getElementById('winOverlay').style.display = 'none'; document.getElementById('loseOverlay').style.display = 'none'; }, 200);
    clearGameBoard(); gameMode = 'endless'; initGame();
}

function seededRandom(seed) { const x = Math.sin(seed) * 10000; return x - Math.floor(x); }


async function initGame() {
    const modeDisplay = document.getElementById('gameModeDisplay'); 
    const controls = document.getElementById('gameDailyControls'); 
    const inputSec = document.querySelector('#gameContainer .input-section'); 
    
    if (!modeDisplay || !controls || !inputSec) {
        console.warn("Elementy HTML dla gry nie są jeszcze gotowe.");
        return;
    }

    inputSec.style.display = 'none'; 

    try {
        let target;
        if (gameMode === 'daily') {
            controls.style.display = 'flex'; 
            dailyNumberGlobal = getDailyDateString(selectedDailyDay);
            modeDisplay.innerText = `${i18n[currentLang].modeDaily} ${dailyNumberGlobal}`;
            target = _generateDailyTarget(selectedDailyDay);
        } else {
            controls.style.display = 'none';
            modeDisplay.innerText = i18n[currentLang].modeEndless;
            
            if (!userStats.recentEndless) userStats.recentEndless = [];
            let validTarget = false;
            while (!validTarget) {
                target = playersDB[Math.floor(Math.random() * playersDB.length)];
                if (!userStats.recentEndless.includes(target.id)) validTarget = true;
            }
            userStats.recentEndless.push(target.id);
            if (userStats.recentEndless.length > 50) userStats.recentEndless.shift();
            saveStats();
        }

        _lockTarget(target.id); 

        if (gameMode === 'daily') {
            if (userStats.dailyResults[selectedDailyDay]) { 
                restorePlayedGame(); return; 
            } else if (userStats.dailyGuesses[selectedDailyDay] && userStats.dailyGuesses[selectedDailyDay].length > 0) { 
                inputSec.style.display = 'block'; restoreInProgressDaily(); return; 
            }
        }

        buildTeamPath(); 
        setupAutocomplete(); 
        updateCounterDisplay(); 
        document.getElementById('mysteryName').innerText = "???"; 
        
        // Pokazuje pole wpisywania
        inputSec.style.display = 'block'; 
        
    } catch (e) {
        console.error("Błąd w trakcie inicjalizacji gry:", e);
        // Gwarancja, że pole wpisywania pojawi się mimo małych błędów
        inputSec.style.display = 'block'; 
    }
}

// Przywracanie wpisanych zawodników w niezakończonej grze Daily
function restoreInProgressDaily() {
    isRestoring = true; 
    
    // Pobieramy target z sejfu (lub awaryjnie go generujemy)
    let target = _unlockTarget();
    if (!target && gameMode === 'daily') {
        target = _generateDailyTarget(selectedDailyDay);
        _lockTarget(target.id);
    }
    
    buildTeamPath(); 
    const pastGuesses = userStats.dailyGuesses[selectedDailyDay] || [];
    
    pastGuesses.forEach(pName => { 
        const p = playersDB.find(x => x.name === pName); 
        if(p) { 
            guessCount++; 
            guessedPlayersNames.push(p.name); 
            renderGuess(p, target, true); // Przekazujemy target!
            revealClubsOnPath(p); 
        } 
    });
    
    updateCounterDisplay(); 
    if (guessCount >= 5 && !hintActive) document.getElementById('btnHint').style.display = 'inline-block';
    if (guessCount >= 7) document.getElementById('btnGiveUp').style.display = 'inline-block';
    
    isRestoring = false;
}

function restorePlayedGame() {
    isRestoring = true; 
    
    const pastGuesses = userStats.dailyGuesses[selectedDailyDay] || [];
    const target = _generateDailyTarget(selectedDailyDay);
    _lockTarget(target.id);
    buildTeamPath(); 

    if (pastGuesses.length === 0) { 
        document.getElementById('results').innerHTML = `<div style="text-align: center; margin-top: 30px; color: var(--text-dim); font-weight: 600;">Brak zapisu dla tego dnia.</div>`; 
    } else { 
        pastGuesses.forEach(pName => { 
            const p = playersDB.find(x => x.name === pName); 
            if(p) { 
                guessCount++; 
                guessedPlayersNames.push(p.name); 
                renderGuess(p, target, true); 
                revealClubsOnPath(p); 
            } 
        }); 
    }
    
    updateCounterDisplay(); 
    hasWon = userStats.dailyResults[selectedDailyDay] === 'win'; 
    hasLost = userStats.dailyResults[selectedDailyDay] === 'loss'; 
    revealTargetInfoUI(target.name); 
    
    document.getElementById('btnSharePost').style.display = 'inline-block'; 
    document.getElementById('btnPlayAgainPost').innerText = i18n[currentLang].btnPlayEndless; 
    document.getElementById('postGameActions').style.display = 'flex'; 
    
    isRestoring = false;
}


function removePolishAccents(str) { const accents = 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ'; const noAccents = 'acelnoszzACELNOSZZ'; return str.split('').map(char => { const index = accents.indexOf(char); return index !== -1 ? noAccents[index] : char; }).join(''); }

function getCleanClubName(clubName) { 
    if (!clubName) return "";
    return clubName.replace(" (W)", "").replace(" (G)", "").replace("[Zawieszenie]", "Zawieszenie").replace("[Aresztowanie]", "Aresztowanie").trim().toLowerCase(); 
}

function getClubAbbr(clubName) { 
    if (!clubName) return "---"; 
    let cleanName = getCleanClubName(clubName).toLowerCase(); 
    if (clubAbbreviations[cleanName]) return clubAbbreviations[cleanName]; 
    let words = cleanName.split(' '); 
    return removePolishAccents(words[words.length - 1].substring(0, 3)).toUpperCase(); 
}

// NOWA FUNKCJA POMOCNICZA DO RENDEROWANIA (W) oraz (G)
function getClubBadgeHTML(rawClubName) {
    if (!rawClubName) return "";
    if (rawClubName.includes("(W)")) return '<div class="loan-badge">W</div>';
    if (rawClubName.includes("(G)")) return '<div class="loan-badge">G</div>';
    return "";
}

document.addEventListener("click", function (e) { if (e.target.id !== "guessInput" && e.target.id !== "clashGuessInput" && e.target.id !== "timeAttackInput") closeAllLists(); });

function closeAllLists() { let items = document.getElementsByClassName("autocomplete-items"); while (items.length > 0) items[0].parentNode.removeChild(items[0]); }

function getPlayerLastName(player) {
    const parts = (player.name || "").trim().split(/\s+/);
    return parts[parts.length - 1] || player.name;
}

// ==============================================
// ====== TIME ATTACK LOGIKA ====================
// ==============================================

function normalizeTimeAttackText(value) {
    return removePolishAccents(String(value || "").toLowerCase().trim());
}

function hideScreensForTimeAttack() {
    [
        'desktopMainMenu', 'mainMenuContainer', 'gameContainer', 'postGameActions',
        'clashModeSelectContainer', 'clashLobbyContainer', 'clashLocalLobbyContainer',
        'clashContainer', 'clashVsOverlay', 'timeAttackMenuContainer' // <-- DODANE
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function renderTimeAttackTimer() {
    const timerEl = document.getElementById('timeAttackTimer');
    if (!timerEl) return;
    timerEl.innerText = timeAttackSecondsLeft;
    timerEl.classList.toggle('ta-timer-danger', timeAttackSecondsLeft <= 10);
}

function renderTimeAttackScore() {
    const scoreEl = document.getElementById('timeAttackScore');
    // Wynikiem są tylko rozwiązani (odrzucamy tego, którego nie zdążyliśmy)
    if (scoreEl) scoreEl.innerText = timeAttackSolved.filter(p => !p.isMissed).length;
}

function showTimeBonusAnimation() {
    const timerEl = document.getElementById('timeAttackTimer');
    if (!timerEl) return;
    
    const bonus = document.createElement('div');
    bonus.className = 'time-bonus-anim';
    bonus.innerText = '+15s';
    
    // Obliczamy pozycję na podstawie licznika
    const rect = timerEl.getBoundingClientRect();
    bonus.style.left = (rect.left + rect.width / 2 - 25) + 'px';
    bonus.style.top = (rect.top - 10) + 'px';
    
    document.body.appendChild(bonus);
    
    setTimeout(() => {
        bonus.remove();
    }, 1000);
}

function renderTimeAttackHints(player) {
    const attrContainer = document.getElementById('taTargetAttributes');
    const clubsContainer = document.getElementById('taTargetClubs');
    const headers = document.getElementById('taTargetHeaders');
    const pathBox = document.getElementById('taTargetPathBox');
    const title = document.getElementById('taTargetName');

    if (!attrContainer || !clubsContainer) return;

    if (!player) {
        // Koniec gry (czyszczenie wizytówki)
        if (headers) headers.style.display = 'none';
        if (pathBox) pathBox.style.display = 'none';
        attrContainer.innerHTML = '';
        clubsContainer.innerHTML = '';
        if (title) {
            title.innerText = "KONIEC CZASU!";
            title.style.color = "var(--red-neon)";
        }
        return;
    }

    // Nowa tura
    if (headers) headers.style.display = 'grid';
    if (pathBox) pathBox.style.display = 'block';
    if (title) {
        title.innerText = "KOGO SZUKAMY?";
        title.style.color = "var(--accent)";
    }

    // Flaga / Kraj
    const pCountries = player.country.split("/").map(c => c.trim()); 
    let c1 = countryToCode[pCountries[0]] || 'pl';
    let countryContent = pCountries.length > 1 
        ? `<div class="tile-flag-dual" title="${player.country}"><img src="https://flagcdn.com/h80/${c1}.png" class="flag-left"><img src="https://flagcdn.com/h80/${countryToCode[pCountries[1]] || 'pl'}.png" class="flag-right"></div>` 
        : `<img src="https://flagcdn.com/w80/${c1}.png" class="tile-flag" title="${player.country}">`;

    // GP & Status
    const isGP = player.gp === true || player.gp === "Tak" || player.gp === "tak";
    const gpIcon = isGP ? "✅" : "❌";
    const statusIcon = player.status === 'Aktywny' ? '✅' : '❌';

    attrContainer.innerHTML = `
        <div style="width: 100%; display: flex; justify-content: center;"><div class="attr-box" style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2);">${countryContent}</div></div>
        <div style="width: 100%; display: flex; justify-content: center;"><div class="attr-box" style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2);"><span class="val-num">${player.year}</span></div></div>
        <div style="width: 100%; display: flex; justify-content: center;"><div class="attr-box" style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2); font-size: 24px;">${gpIcon}</div></div>
        <div style="width: 100%; display: flex; justify-content: center;"><div class="attr-box" style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2);"><span class="val-num">${player.dmp}</span></div></div>
        <div style="width: 100%; display: flex; justify-content: center;"><div class="attr-box" style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2); font-size: 24px;">${statusIcon}</div></div>
    `;

    // Historia Klubów
    clubsContainer.innerHTML = '';
    const pastClubs = player.pastClubs || [];
    pastClubs.forEach((club, index) => {
        const box = document.createElement('div'); 
        let cleanC = getCleanClubName(club).toLowerCase(); 
        box.className = 'path-box found'; 
        if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery', 'aresztowanie'].includes(cleanC)) { box.classList.add('club-special'); }
        box.innerHTML = `<span>${getClubAbbr(club)}</span>${getClubBadgeHTML(club)}`; 
        clubsContainer.appendChild(box);
        if (index < pastClubs.length - 1) { 
            const arrow = document.createElement('div'); arrow.className = 'path-arrow'; arrow.innerText = '→'; clubsContainer.appendChild(arrow); 
        }
    });
    if (player.status.toLowerCase().includes("koniec") || player.status === "Ś.P.") { 
        const arrow = document.createElement('div'); arrow.className = 'path-arrow'; arrow.innerText = '→'; clubsContainer.appendChild(arrow); 
        const endIcon = document.createElement('div'); endIcon.className = 'path-box found'; endIcon.innerText = '❌'; 
        endIcon.style.border = 'none'; endIcon.style.background = 'transparent';
        clubsContainer.appendChild(endIcon); 
    }
}

function renderTimeAttackList() {
    const listEl = document.getElementById('timeAttackList');
    const emptyEl = document.getElementById('timeAttackEmpty');
    if (!listEl || !emptyEl) return;

    emptyEl.style.display = timeAttackSolved.length ? 'none' : 'block';
    
    // Obliczamy ile kart było prawdzwymi trafieniami (bez tej nieodgadniętej na końcu)
    const validGuessesCount = timeAttackSolved.filter(p => !p.isMissed).length;
    let rankCounter = validGuessesCount;

    listEl.innerHTML = timeAttackSolved.map((player) => {
        const isMissed = player.isMissed === true;
        
        // Stylizacja dla karty "Nieodgadnięty" (czerwona)
        const borderStyle = isMissed ? "border: 2px solid var(--red-neon); box-shadow: 0 0 25px rgba(255, 51, 51, 0.4);" : "";
        const nameColor = isMissed ? "var(--red-neon)" : "var(--text-main)";
        const titlePrefix = isMissed ? "NIE ZDĄŻYŁEŚ: " : "";
        const attrColorClass = isMissed ? "red" : "green";
        const iconPrefix = isMissed ? "❌" : `${rankCounter}.`;
        
        if (!isMissed) rankCounter--;

        const pCountries = player.country.split("/").map(c => c.trim()); 
        let c1 = countryToCode[pCountries[0]] || 'pl';
        let countryContent = pCountries.length > 1 
            ? `<div class="tile-flag-dual" title="${player.country}"><img src="https://flagcdn.com/h80/${c1}.png" class="flag-left"><img src="https://flagcdn.com/h80/${countryToCode[pCountries[1]] || 'pl'}.png" class="flag-right"></div>` 
            : `<img src="https://flagcdn.com/w80/${c1}.png" class="tile-flag" title="${player.country}">`;

        const isGP = player.gp === true || player.gp === "Tak" || player.gp === "tak";
        const gpIcon = isGP ? "✅" : "❌";
        const statusIcon = player.status === 'Aktywny' ? '✅' : '❌';

        let clubsHTML = '';
        const pastClubs = player.pastClubs || [];
        pastClubs.forEach((club, index) => {
            let cleanC = getCleanClubName(club).toLowerCase(); 
            let specialClass = ['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery', 'aresztowanie'].includes(cleanC) ? ' club-special' : '';
            clubsHTML += `<div class="path-box found${specialClass}"><span>${getClubAbbr(club)}</span>${getClubBadgeHTML(club)}</div>`;
            if (index < pastClubs.length - 1) { 
                clubsHTML += `<div class="path-arrow">→</div>`; 
            }
        });
        if (player.status.toLowerCase().includes("koniec") || player.status === "Ś.P.") { 
            clubsHTML += `<div class="path-arrow">→</div><div class="path-box found" style="border:none; background:transparent;">❌</div>`; 
        }

        return `
        <div class="main-card glass-panel-centered" style="padding: 15px 10px; margin-bottom: 0; position: relative; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; ${borderStyle}">
            <div style="position: absolute; left: 15px; top: 15px; font-size: 20px; font-weight: 900; color: ${isMissed ? 'var(--red-neon)' : 'var(--text-dim)'};">${iconPrefix}</div>
            <h3 style="text-align: center; margin: 0 0 10px 0; font-size: 16px; color: ${nameColor};">${titlePrefix}${player.name}</h3>
            
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 5px; text-align: center; font-size: 10px; font-weight: 700; color: var(--text-dim); text-transform: uppercase;">
                <div>Kraj</div>
                <div>Wiek</div>
                <div>Jeździ/ił w GP?</div>
                <div>DMP</div>
                <div>Status</div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 15px; justify-items: center;">
                <div style="width: 100%; display: flex; justify-content: center;"><div class="attr-box ${attrColorClass}">${countryContent}</div></div>
                <div style="width: 100%; display: flex; justify-content: center;"><div class="attr-box ${attrColorClass}"><span class="val-num">${player.year}</span></div></div>
                <div style="width: 100%; display: flex; justify-content: center;"><div class="attr-box ${attrColorClass}" style="font-size: 24px;">${gpIcon}</div></div>
                <div style="width: 100%; display: flex; justify-content: center;"><div class="attr-box ${attrColorClass}"><span class="val-num">${player.dmp}</span></div></div>
                <div style="width: 100%; display: flex; justify-content: center;"><div class="attr-box ${attrColorClass}" style="font-size: 24px;">${statusIcon}</div></div>
            </div>
            
            <div class="team-path-centered">
                <div class="path-boxes" style="justify-content: center; margin: 0 auto; flex-wrap: wrap; padding-bottom: 0;">
                    ${clubsHTML}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function drawNextTimeAttackTarget() {
    if (!timeAttackActive || timeAttackPool.length === 0) {
        finishTimeAttack();
        return;
    }

    const index = Math.floor(Math.random() * timeAttackPool.length);
    timeAttackTarget = timeAttackPool.splice(index, 1)[0];
    renderTimeAttackHints(timeAttackTarget);
    renderTimeAttackScore();

    const input = document.getElementById('timeAttackInput');
    if (input) {
        input.value = '';
        input.disabled = false;
        input.focus();
    }

    const submitBtn = document.getElementById('timeAttackSubmitBtn');
    if (submitBtn) submitBtn.disabled = false;
}

function findTimeAttackGuess(input) {
    const normalized = normalizeTimeAttackText(input);
    if (!normalized) return null;

    const exact = playersDB.find(player => normalizeTimeAttackText(player.name) === normalized);
    if (exact) return exact;

    const lastNameMatches = playersDB.filter(player => normalizeTimeAttackText(getPlayerLastName(player)) === normalized);
    if (lastNameMatches.length === 1) return lastNameMatches[0];

    return null;
}

function setupTimeAttackAutocomplete() {
    const oldInput = document.getElementById('timeAttackInput');
    if (!oldInput) return;

    const newInput = oldInput.cloneNode(true);
    oldInput.replaceWith(newInput);

    newInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') submitTimeAttackGuess();
    });

    newInput.addEventListener('input', function() {
        const val = this.value;
        closeAllLists();
        if (!val || val.length < 2) return;

        const listContainer = document.createElement("DIV");
        listContainer.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(listContainer);

        const valClean = normalizeTimeAttackText(val);
        playersDB
            // Zabezpieczenie przed podpowiadaniem graczy, których już zgadliśmy
            .filter(player => !timeAttackSolved.some(solved => solved.id === player.id))
            .filter(player => normalizeTimeAttackText(player.name).includes(valClean) || normalizeTimeAttackText(getPlayerLastName(player)).includes(valClean))
            .slice(0, 12)
            .forEach(player => {
                const item = document.createElement("DIV");
                item.innerText = player.name;
                item.addEventListener("click", () => {
                    newInput.value = player.name;
                    closeAllLists();
                    submitTimeAttackGuess();
                });
                listContainer.appendChild(item);
            });
    });
}

function triggerTimeAttackErrorShake() {
    const input = document.getElementById('timeAttackInput');
    const wrapper = input ? input.closest('.input-wrapper') : null;
    if (!wrapper) return;
    wrapper.classList.add('shake-error');
    playSound('error');
    setTimeout(() => wrapper.classList.remove('shake-error'), 400);
}

// ====== OBSŁUGA MENU TIME ATTACK ======

function ensureTimeAttackStats(stats) {
    if (!stats.timeAttack) {
        stats.timeAttack = { played: 0, highestScore: 0, totalScore: 0 };
    }
    // Zabezpieczenia, jeśli dane by uciekły
    if (typeof stats.timeAttack.played !== 'number') stats.timeAttack.played = 0;
    if (typeof stats.timeAttack.highestScore !== 'number') stats.timeAttack.highestScore = 0;
    if (typeof stats.timeAttack.totalScore !== 'number') stats.timeAttack.totalScore = 0;
    return stats;
}

function updateTimeAttackMenuUI() {
    ensureTimeAttackStats(userStats);
    const ta = userStats.timeAttack;
    
    document.getElementById('taStatPlayed').innerText = ta.played;
    document.getElementById('taStatBest').innerText = ta.highestScore;
    
    const avg = ta.played > 0 ? (ta.totalScore / ta.played).toFixed(1) : "0.0";
    document.getElementById('taStatAvg').innerText = avg;
}

function openTimeAttackMenu() {
    promptForNick(() => {
        document.getElementById('mainMenuContainer').style.display = 'none';
        document.getElementById('desktopMainMenu').style.display = 'none';
        document.getElementById('clashModeSelectContainer').style.display = 'none';
        document.getElementById('timeAttackMenuContainer').style.display = 'grid'; // Używamy grid, bo to okno desktopowe

        const nickDisplay = document.getElementById('clashMenuNick');
        if(nickDisplay) {
            nickDisplay.innerHTML = (playerNickname || "GRACZ") + getMiniClubBadge(userStats.favoriteClub);
        }

        updateTimeAttackMenuUI();
        loadTimeAttackRanking();
    });
}

function exitTimeAttackMenu() {
    window.location.reload();
}

function showTimeAttackInfo() {
    const overlay = document.getElementById('timeAttackInfoOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}
function closeTimeAttackInfo() {
    const overlay = document.getElementById('timeAttackInfoOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
}

async function loadTimeAttackRanking() {
    const tbody = document.getElementById('desktopRankingBodyTA'); 
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px;">Ładowanie danych...</td></tr>';
    
    try {
        let snapshot = await db.collection("leaderboard_timeattack").orderBy("score", "desc").limit(50).get();
        let scores = []; snapshot.forEach(doc => { scores.push(doc.data()); });
        
        tbody.innerHTML = '';
        if (scores.length === 0) { 
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Brak wyników. Zagraj jako pierwszy!</td></tr>`; 
            return; 
        }

        let pos = 1;
        scores.forEach((row) => {
            let safeNick = escapeHTML(row.nick || "Gracz");
            let isMe = safeNick === playerNickname ? 'style="background: rgba(255,255,255,0.05);"' : '';
            
            let rankClass = pos === 1 ? "rank-1" : pos === 2 ? "rank-2" : pos === 3 ? "rank-3" : "";
            
            tbody.innerHTML += `
                <tr ${isMe}>
                    <td class="${rankClass}" style="font-weight:900;">${pos}</td>
                    <td class="${rankClass}" style="text-align:left;">${safeNick}</td>
                    <td style="color:#feca57; font-weight:900;">${row.score}</td>
                </tr>`;
            pos++;
        });
    } catch (e) { 
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:red;">Błąd bazy danych.</td></tr>`; 
    }
}

async function syncTimeAttackScoreToFirebase(score) {
    if (!playerId) return; 

    // Identyczna blokada jak w przypadku Ligi Clash
    if (!auth.currentUser && !playerId.startsWith('guest_')) {
        return; 
    }

    try {
        const docRef = db.collection('leaderboard_timeattack').doc(playerId);
        const doc = await docRef.get();
        
        // Zapisujemy tylko jeśli nowy wynik jest wyższy niż stary (lub to pierwszy wynik)
        if (!doc.exists || doc.data().score < score) {
            await docRef.set({
                nick: playerNickname || 'Gracz',
                score: score,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
    } catch (e) { console.error('Time Attack sync error:', e); }
}

function startTimeAttack() {
    // Podwójne zabezpieczenie: działa dla adminów i testerów

    clearInterval(timeAttackTimerId);
    gameMode = 'timeAttack';
    
    // Głęboka kopia bazy danych, żeby flaga isMissed nie psuła kolejnych gier
    timeAttackPool = playersDB.map(p => ({...p})); 
    
    timeAttackSolved = [];
    timeAttackSecondsLeft = TIME_ATTACK_DURATION;
    timeAttackActive = true;
    timeAttackTarget = null;

    hideScreensForTimeAttack();

    const container = document.getElementById('timeAttackContainer');
    if (container) {
        container.style.display = 'block';
    }

    const input = document.getElementById('timeAttackInput');
    const submitBtn = document.getElementById('timeAttackSubmitBtn');
    if (input) {
        input.value = '';
        input.disabled = false;
    }
    if (submitBtn) submitBtn.disabled = false;

    setupTimeAttackAutocomplete();
    renderTimeAttackTimer();
    renderTimeAttackScore();
    renderTimeAttackList();
    drawNextTimeAttackTarget();

    timeAttackTimerId = setInterval(() => {
        timeAttackSecondsLeft -= 1;
        renderTimeAttackTimer();
        if (timeAttackSecondsLeft <= 0) finishTimeAttack();
    }, 1000);
}

function submitTimeAttackGuess() {
    if (!timeAttackActive || !timeAttackTarget) return;

    const input = document.getElementById('timeAttackInput');
    const guess = input ? input.value.trim() : '';
    const guessedPlayer = findTimeAttackGuess(guess);

    if (!guessedPlayer) {
        triggerTimeAttackErrorShake();
        return;
    }

    if (timeAttackSolved.some(player => player.id === guessedPlayer.id)) {
        triggerTimeAttackErrorShake();
        showToast("Ten zawodnik jest już na liście trafionych.", "normal");
        return;
    }

    if (guessedPlayer.id !== timeAttackTarget.id) {
        triggerTimeAttackErrorShake();
        return;
    }

    // DODANIE CZASU I ANIMACJI
    timeAttackSecondsLeft += 15;
    renderTimeAttackTimer();
    showTimeBonusAnimation();

    // Wrzucenie na szczyt listy wyników
    timeAttackSolved.unshift(timeAttackTarget);
    playSound('guess');
    renderTimeAttackList();
    drawNextTimeAttackTarget();
}

function finishTimeAttack() {
    if (!timeAttackActive && !timeAttackTimerId) return;

    clearInterval(timeAttackTimerId);
    timeAttackTimerId = null;
    timeAttackActive = false;
    timeAttackSecondsLeft = Math.max(0, timeAttackSecondsLeft);

    if (timeAttackTarget) {
        timeAttackTarget.isMissed = true;
        timeAttackSolved.unshift(timeAttackTarget);
    }

    const input = document.getElementById('timeAttackInput');
    const submitBtn = document.getElementById('timeAttackSubmitBtn');
    if (input) input.disabled = true;
    if (submitBtn) submitBtn.disabled = true;

    closeAllLists();
    playSound('lose');
    renderTimeAttackTimer();
    renderTimeAttackHints(null); 
    renderTimeAttackScore();
    renderTimeAttackList(); 
    
    // Zapis statystyk i bazy!
    const validCount = timeAttackSolved.filter(p => !p.isMissed).length;
    
    ensureTimeAttackStats(userStats);
    userStats.timeAttack.played++;
    userStats.timeAttack.totalScore += validCount;
    if (validCount > userStats.timeAttack.highestScore) {
        userStats.timeAttack.highestScore = validCount;
    }

    // NOWOŚĆ: Postęp misji i EXP dla Time Attack
    if (validCount > 0) {
        updateMissionProgress('ta_score', validCount);
        addExp(validCount * 2); // 2 exp za każdego zgadniętego
    }

    saveStats();
    syncTimeAttackScoreToFirebase(validCount);
    
    showToast(`Koniec czasu! Zdobyto: ${validCount} pkt. Wrócisz do menu za 5s...`, "success");
    
    // Automatyczny powrót do Menu po 5 sekundach
    setTimeout(() => {
        exitTimeAttack();
    }, 5000);
}

function restartTimeAttack() {
    startTimeAttack();
}

function exitTimeAttack() {
    clearInterval(timeAttackTimerId);
    timeAttackTimerId = null;
    timeAttackActive = false;
    timeAttackTarget = null;
    closeAllLists();
    
    document.getElementById('timeAttackContainer').style.display = 'none';
    openTimeAttackMenu(); // Wracamy płynnie do menu, nie przeładowując strony
}


//----------------------------------------------

function setupAutocomplete() {
    const oldInput = document.getElementById('guessInput'); const newInput = oldInput.cloneNode(true); oldInput.replaceWith(newInput); 
    newInput.addEventListener('input', function() {
        let val = this.value; closeAllLists(); if (!val || val.length < 2) return;
        let listContainer = document.createElement("DIV"); listContainer.setAttribute("class", "autocomplete-items"); this.parentNode.appendChild(listContainer);
        let valClean = removePolishAccents(val.toLowerCase());
        playersDB.forEach(player => {
            if (guessedPlayersNames.includes(player.name)) return;
            if (removePolishAccents(player.name.toLowerCase()).includes(valClean)) {
                let item = document.createElement("DIV"); item.innerHTML = player.name;
                item.addEventListener("click", () => { newInput.value = player.name; closeAllLists(); }); listContainer.appendChild(item);
            }
        });
    });
}

function buildTeamPath() {
    const target = _unlockTarget();
    if (!target) return;
    
    const pathContainer = document.getElementById('pathBoxes'); pathContainer.innerHTML = ''; 
    target.pastClubs.forEach((club, index) => { 
        const box = document.createElement('div'); box.className = 'path-box'; box.innerText = '?'; 
        box.dataset.index = index; 
        pathContainer.appendChild(box);
        if (index < target.pastClubs.length - 1) { const arrow = document.createElement('div'); arrow.className = 'path-arrow'; arrow.innerText = '→'; pathContainer.appendChild(arrow); }
    });
    if (target.status.toLowerCase().includes("koniec") || target.status === "Ś.P.") { 
        const arrow = document.createElement('div'); arrow.className = 'path-arrow'; arrow.innerText = '→'; pathContainer.appendChild(arrow); 
        const endIcon = document.createElement('div'); endIcon.className = 'path-box'; endIcon.id = 'pathBox-retired'; endIcon.innerText = '?'; pathContainer.appendChild(endIcon); 
    }
}

async function makeGuess() {
    if(hasWon || hasLost) return; 
    const input = document.getElementById('guessInput').value.trim();
    if (!input) { triggerErrorShake(); return; }
    
    const guessedPlayerLocal = playersDB.find(p => p.name.toLowerCase() === input.toLowerCase());
    if (!guessedPlayerLocal || guessedPlayersNames.includes(guessedPlayerLocal?.name)) { triggerErrorShake(); return; }
    
    const target = _unlockTarget(); // Wyciągamy gracza na moment sprawdzenia
    const isWinningGuess = (target.id === guessedPlayerLocal.id);

    guessedPlayersNames.push(guessedPlayerLocal.name); 
    playSound('guess');
    
    if (gameMode === 'daily') { 
        if (!userStats.dailyGuesses[selectedDailyDay]) userStats.dailyGuesses[selectedDailyDay] = []; 
        userStats.dailyGuesses[selectedDailyDay].push(guessedPlayerLocal.name); 
        saveStats(); 
    }
    
    guessCount++; 
    updateCounterDisplay(); 
    
    renderGuess(guessedPlayerLocal, target, false, isWinningGuess); 
    revealClubsOnPath(guessedPlayerLocal); 
    document.getElementById('guessInput').value = "";
    
    if (guessCount === 5 && !hintActive && !isWinningGuess) {
        document.getElementById('btnHint').style.display = 'inline-block';
        showToast("Możesz użyć podpowiedzi!", "normal");
    }
    if (guessCount >= 7 && !isWinningGuess) {
        document.getElementById('btnGiveUp').style.display = 'inline-block';
    }

    if (hintActive && !isWinningGuess) {
        document.getElementById('mysteryName').innerText = _getSafeHint(target.name, guessCount);
    }

    if (isWinningGuess) { 
        document.getElementById('mysteryName').innerText = target.name;
        updateStatsOnWin(); 
        setTimeout(() => handleWin(target.name), 1400); 
    } else if (guessCount >= GUESS_LIMIT) { 
        document.getElementById('mysteryName').innerText = target.name;
        updateStatsOnLoss(); 
        setTimeout(() => handleLoss(target.name), 1400); 
    }
}

async function giveUpGame() {
    if (hasWon || hasLost) return;
    const confirmed = await appConfirm("Czy na pewno chcesz się poddać i odkryć zawodnika?", { title: "Poddajesz się?", danger: true, confirmText: "TAK, PODDAJĘ SIĘ" });
    if (!confirmed) return;
    
    const target = _unlockTarget();
    guessCount = GUESS_LIMIT; hintsUsedCount = 1; updateCounterDisplay(); updateStatsOnLoss(); handleLoss(target.name);
    document.getElementById('btnGiveUp').style.display = 'none';
}


function revealTargetInfoUI(finalName) {
    let target = _unlockTarget();
    if (!target && gameMode === 'daily') target = _generateDailyTarget(selectedDailyDay);

    document.getElementById('mysteryPlaceholder').style.display = 'none'; 
    const photoImg = document.getElementById('mysteryPhoto'); 
    const photoWrapper = document.getElementById('photoWrapper');
    
    photoImg.src = target && target.image ? `images/riders/${target.image}` : `images/riders/image_0.png`; 
    photoImg.style.display = 'block';
    photoWrapper.classList.add('revealed'); 

    // ---- LOGIKA PRAW AUTORSKICH ZDJĘCIA (COPYRIGHTS) ----
    let cpEl = document.getElementById('photoCopyright');
    if (!cpEl) {
        cpEl = document.createElement('div');
        cpEl.id = 'photoCopyright';
        // Style wymuszające tekst pionowy od dołu do góry w rogu zdjęcia
        cpEl.style.cssText = `
            position: absolute;
            bottom: 10px;
            right: 10px;
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            color: rgba(255, 255, 255, 0.5);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 1px;
            pointer-events: none;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            z-index: 10;
        `;
        photoWrapper.appendChild(cpEl);
    }
    
    if (target && target.cp) {
        cpEl.innerHTML = `&copy; ${target.cp}`;
        cpEl.style.display = 'block';
    } else {
        cpEl.style.display = 'none';
    }
    // -----------------------------------------------------
    
    document.getElementById('mysteryName').innerText = finalName || (target ? target.name : "???");
    
    if (hasLost) document.getElementById('mysteryName').style.color = "var(--red-neon)";
    
    document.querySelectorAll('.path-box').forEach(box => {
        if (!box.dataset.index || !target) return;
        let trueClub = target.pastClubs[box.dataset.index]; 
        let cleanC = getCleanClubName(trueClub).toLowerCase(); 
        if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery', 'aresztowanie'].includes(cleanC)) { box.classList.add('club-special'); }
        box.innerHTML = `<span>${getClubAbbr(trueClub)}</span>${getClubBadgeHTML(trueClub)}`; 
        box.classList.add('found'); 
        box.setAttribute('title', trueClub);
    });
    
    const endBox = document.getElementById('pathBox-retired'); 
    if (endBox) { 
        endBox.innerText = '❌'; 
        endBox.classList.add('found'); 
        endBox.style.border = 'none'; 
        endBox.style.background = 'transparent'; 
    }
}


function useHint() {
    if (hintActive) return;
    const target = _unlockTarget();
    hintActive = true; hintsUsedCount = 1;
    document.getElementById('btnHint').style.display = 'none'; 
    document.getElementById('mysteryName').innerText = _getSafeHint(target.name, guessCount);
    showToast("Użyto podpowiedzi!", "success");
}

function revealClubsOnPath(guessedPlayer) {
    const target = _unlockTarget();
    const boxes = document.querySelectorAll('.path-box'); 
    let guessedClubs = guessedPlayer.pastClubs.map(getCleanClubName);
    
    boxes.forEach(box => {
        if (!box.dataset.index) return;
        let trueClub = target.pastClubs[box.dataset.index];
        
        if (guessedClubs.includes(getCleanClubName(trueClub)) && box.innerText === '?') {
            let cleanC = getCleanClubName(trueClub).toLowerCase();
            if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery', 'aresztowanie'].includes(cleanC)) { box.classList.add('club-special'); }
            box.innerHTML = `<span>${getClubAbbr(trueClub)}</span>${getClubBadgeHTML(trueClub)}`;
            box.classList.add('found'); box.setAttribute('title', trueClub);        
        }
    });
    if ((guessedPlayer.status.toLowerCase().includes("koniec") || guessedPlayer.status === "Ś.P.") && (target.status.toLowerCase().includes("koniec") || target.status === "Ś.P.")) {
        const endBox = document.getElementById('pathBox-retired'); if (endBox) { endBox.innerText = '❌'; endBox.classList.add('found'); endBox.style.border = 'none'; endBox.style.background = 'transparent'; }
    }
}
function renderGuess(player, target, isRestore = false, isWinningGuess = false) {
    if (!target) return;

    const resultsDiv = document.getElementById('results'); 
    const row = document.createElement('div'); row.className = 'guess-row'; let rowEmojis = "";
    
    const isTargetGP = target.gp === true || target.gp === "Tak" || target.gp === "tak";
    const isGuessGP = player.gp === true || player.gp === "Tak" || player.gp === "tak";
    const gpCls = (isGuessGP === isTargetGP) ? "green" : "red"; const gpIcon = isGuessGP ? "✅" : "❌";
    
    const yearCls = (player.year === target.year) ? "green" : "red";
    let yearTitle = "";
    if (player.year > target.year) yearTitle = "Szukany zawodnik jest starszy (urodził się wcześniej)";
    else if (player.year < target.year) yearTitle = "Szukany zawodnik jest młodszy (urodził się później)";
    else yearTitle = "Dokładnie ten sam rocznik!";

    let yearContent = `<span>${player.year}</span>`;
    if (player.year > target.year) yearContent += `<span class="val-arrow" title="${yearTitle}">⬇️</span>`; 
    else if (player.year < target.year) yearContent += `<span class="val-arrow" title="${yearTitle}">⬆️</span>`;

    const dmpCls = (player.dmp === target.dmp) ? "green" : "red";
    let dmpContent = `<span>${player.dmp}</span>`;
    if (player.dmp > target.dmp) dmpContent += `<span class="val-arrow" title="Mniej medali">⬇️</span>`; 
    else if (player.dmp < target.dmp) dmpContent += `<span class="val-arrow" title="Więcej medali">⬆️</span>`;

    const pCountries = player.country.split("/").map(c => c.trim()); 
    const tCountries = (target.country || "").split("/").map(c => c.trim());
    let countryCls = "red"; 
    if (player.country === target.country) countryCls = "green"; 
    else if (pCountries.some(c => tCountries.includes(c))) countryCls = "half"; 
    else if (player.region === target.region) countryCls = "yellow";
    
    let c1 = countryToCode[pCountries[0]] || 'pl';
    let countryContent = pCountries.length > 1 
        ? `<div class="tile-flag-dual" title="${player.country}"><img src="https://flagcdn.com/h80/${c1}.png" class="flag-left"><img src="https://flagcdn.com/h80/${countryToCode[pCountries[1]] || 'pl'}.png" class="flag-right"></div>` 
        : `<img src="https://flagcdn.com/w80/${c1}.png" class="tile-flag" title="${player.country}">`;

    let targetCleanClubs = target.pastClubs.map(getCleanClubName); // Zamiast serverTargetClubs
    let clubsHTML = player.pastClubs.map(c => {
        let cleanC = getCleanClubName(c); 
        let isMatch = isWinningGuess || targetCleanClubs.includes(cleanC); 
        let matchClass = isMatch ? 'club-match' : 'club-dim';
        let isSpecial = ['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery', 'aresztowanie'].includes(cleanC); 
        let specialClass = isSpecial ? ' club-special' : '';
        return `<div class="club-logo-wrapper" title="${c}"><div class="club-abbr-box ${matchClass}${specialClass}">${getClubAbbr(c)}</div>${getClubBadgeHTML(c)}</div>`;
    }).join('<div class="club-divider"></div>');

    let d1 = isRestore ? 0 : 0.1; let d2 = isRestore ? 0 : 0.3; let d3 = isRestore ? 0 : 0.5; let d4 = isRestore ? 0 : 0.7; let d5 = isRestore ? 0 : 0.9; let d6 = isRestore ? 0 : 1.1;

    row.innerHTML = `
        <div class="col-name">${player.name}</div>
        <div class="col-attr"><div class="attr-box ${countryCls} flip-anim" style="animation-delay: ${d1}s">${countryContent}</div></div>
        <div class="col-attr" title="${yearTitle}"><div class="attr-box ${yearCls} flip-anim" style="animation-delay: ${d2}s">${yearContent}</div></div>
        <div class="col-attr"><div class="attr-box ${gpCls} flip-anim" style="animation-delay: ${d3}s; font-size: 24px;">${gpIcon}</div></div>
        <div class="col-attr"><div class="attr-box ${dmpCls} flip-anim" style="animation-delay: ${d4}s">${dmpContent}</div></div>
        <div class="col-attr"><div class="attr-box ${player.status === target.status ? 'green' : 'red'} flip-anim" style="animation-delay: ${d5}s">${player.status === 'Aktywny' ? '✅' : '❌'}</div></div>
        <div class="col-clubs flip-anim" style="animation-delay: ${d6}s"><div class="clubs-path-container">${clubsHTML}</div></div>
    `;
    resultsDiv.insertBefore(row, resultsDiv.firstChild);
    
    if (!isRestore) { setTimeout(() => playSound('flip'), 100); setTimeout(() => playSound('flip'), 300); setTimeout(() => playSound('flip'), 500); setTimeout(() => playSound('flip'), 700); setTimeout(() => playSound('flip'), 900); setTimeout(() => playSound('flip'), 1100); }
    
    ['country', 'year', 'gp', 'dmp', 'status'].forEach(attr => {
        let c = "red";
        if (attr === 'country') c = countryCls; 
        else if (attr === 'year' && player.year === target.year) c = "green"; 
        else if (attr === 'gp' && isGuessGP === isTargetGP) c = "green"; 
        else if (attr === 'dmp' && player.dmp === target.dmp) c = "green"; 
        else if (attr === 'status' && player.status === target.status) c = "green";
        rowEmojis += c === "green" ? "🟩" : (c === "yellow" || c === "half") ? "🟨" : "🟥";
    });
    guessHistory.push(rowEmojis);
}

function handleWin(finalName) {
    playSound('win'); revealTargetInfoUI(finalName); launchConfetti();
    const overlay = document.getElementById('winOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    const btnPlayAgainPost = document.getElementById('btnPlayAgainPost');
    if (gameMode === 'daily') { document.getElementById('btnSharePost').style.display = 'inline-block'; btnPlayAgainPost.innerText = i18n[currentLang].btnPlayEndless; } else { document.getElementById('btnSharePost').style.display = 'none'; btnPlayAgainPost.innerText = i18n[currentLang].btnPlayAgain; }
    setTimeout(() => { overlay.style.opacity = '0'; setTimeout(() => { overlay.style.display = 'none'; document.getElementById('postGameActions').style.display = 'flex'; }, 200); }, 1500);
}

function handleLoss(finalName) {
    playSound('lose'); revealTargetInfoUI(finalName);
    const overlay = document.getElementById('loseOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    document.getElementById('btnSharePost').style.display = 'none'; document.getElementById('btnPlayAgainPost').innerText = gameMode === 'daily' ? i18n[currentLang].btnPlayEndless : i18n[currentLang].btnPlayAgain;
    setTimeout(() => { overlay.style.opacity = '0'; setTimeout(() => { overlay.style.display = 'none'; document.getElementById('postGameActions').style.display = 'flex'; }, 200); }, 1500);
}

function revealTargetInfoUI(finalName) {
    const target = _unlockTarget();
    document.getElementById('mysteryPlaceholder').style.display = 'none'; 
    const photoImg = document.getElementById('mysteryPhoto'); 
    const photoWrapper = document.getElementById('photoWrapper');
    
    photoImg.src = target && target.image ? `images/riders/${target.image}` : `images/riders/image_0.png`; 
    photoImg.style.display = 'block';
    photoWrapper.classList.add('revealed'); 

    // ---- LOGIKA PRAW AUTORSKICH ZDJĘCIA (COPYRIGHTS) ----
    let cpEl = document.getElementById('photoCopyright');
    if (!cpEl) {
        cpEl = document.createElement('div');
        cpEl.id = 'photoCopyright';
        cpEl.style.cssText = `
            position: absolute;
            bottom: 10px;
            right: 10px;
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            color: rgba(255, 255, 255, 0.5);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 1px;
            pointer-events: none;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            z-index: 10;
        `;
        photoWrapper.appendChild(cpEl);
    }
    
    if (target && target.cp) {
        cpEl.innerHTML = `&copy; ${target.cp}`;
        cpEl.style.display = 'block';
    } else {
        cpEl.style.display = 'none';
    }
    // -----------------------------------------------------
    
    document.getElementById('mysteryName').innerText = finalName || "???";
    
    if (hasLost) document.getElementById('mysteryName').style.color = "var(--red-neon)";
    
    document.querySelectorAll('.path-box').forEach(box => {
        if (!box.dataset.index) return;
        let trueClub = target.pastClubs[box.dataset.index];
        let cleanC = getCleanClubName(trueClub).toLowerCase(); 
        if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery', 'aresztowanie'].includes(cleanC)) { box.classList.add('club-special'); }
        box.innerHTML = `<span>${getClubAbbr(trueClub)}</span>${getClubBadgeHTML(trueClub)}`; 
        box.classList.add('found'); 
        box.setAttribute('title', trueClub);
    });
    
    const endBox = document.getElementById('pathBox-retired'); 
    if (endBox) { 
        endBox.innerText = '❌'; 
        endBox.classList.add('found'); 
        endBox.style.border = 'none'; 
        endBox.style.background = 'transparent'; 
    }
}

async function shareResult() {
    if (gameMode !== 'daily') return;
    
    const canvas = document.createElement('canvas'); 
    const ctx = canvas.getContext('2d'); 
    canvas.width = 1080; 
    canvas.height = 1920;
    
    // Tło
    const grd = ctx.createRadialGradient(540, 0, 0, 540, 0, 1920); 
    grd.addColorStop(0, "#1e1e22"); 
    grd.addColorStop(1, "#0a0a0c"); 
    ctx.fillStyle = grd; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Teksty (zaktualizowane do nowej domeny)
    ctx.fillStyle = "#ffffff"; 
    ctx.font = "900 80px Montserrat, sans-serif"; 
    ctx.textAlign = "center"; 
    ctx.fillText("🏁 SPEEDWAY GUESSR", 540, 200); 
    
    ctx.fillStyle = "#f1c40f"; 
    ctx.font = "700 50px Montserrat, sans-serif"; 
    ctx.fillText(`DAILY ${dailyNumberGlobal}`, 540, 280); 
    
    ctx.fillStyle = "#ffffff"; 
    ctx.font = "900 120px Montserrat, sans-serif";
    const scoreText = hasWon ? `${guessCount}/${GUESS_LIMIT}` : `X/${GUESS_LIMIT}`; 
    ctx.fillText(scoreText, 540, 480);
    
    // Rysowanie kwadracików wyników (wycentrowane)
    const boxSize = 100; 
    const gap = 20; 
    const maxCols = Math.max(...guessHistory.map(row => Array.from(row).filter(char => ["🟩", "🟨", "🟥"].includes(char)).length), 5); // Zabezpieczenie minimalnej szerokości
    
    // Obliczamy szerokość najdłuższego rzędu, by wycentrować całość
    const startY = 650; 
    const colorMap = { "🟩": "#00ff66", "🟨": "#ffcc00", "🟥": "#ff3333" };
    
    guessHistory.forEach((rowString, rowIndex) => {
        const rowEmojis = Array.from(rowString).filter(char => char in colorMap);
        const rowWidth = (rowEmojis.length * boxSize) + ((rowEmojis.length - 1) * gap);
        const startX = (1080 - rowWidth) / 2; // Wyśrodkowanie OSOBNO każdego rzędu
        
        rowEmojis.forEach((emoji, colIndex) => { 
            ctx.fillStyle = colorMap[emoji]; 
            const x = startX + colIndex * (boxSize + gap); 
            const y = startY + rowIndex * (boxSize + gap); 
            const radius = 20; 
            
            ctx.beginPath(); 
            ctx.moveTo(x + radius, y); 
            ctx.lineTo(x + boxSize - radius, y); 
            ctx.quadraticCurveTo(x + boxSize, y, x + boxSize, y + radius); 
            ctx.lineTo(x + boxSize, y + boxSize - radius); 
            ctx.quadraticCurveTo(x + boxSize, y + boxSize, x + boxSize - radius, y + boxSize); 
            ctx.lineTo(x + radius, y + boxSize); 
            ctx.quadraticCurveTo(x, y + boxSize, x, y + boxSize - radius); 
            ctx.lineTo(x, y + radius); 
            ctx.quadraticCurveTo(x, y, x + radius, y); 
            ctx.closePath(); 
            ctx.fill(); 
        });
    });
    
    // Nowy link w stopce obrazka
    ctx.fillStyle = "#8e8e93"; 
    ctx.font = "600 35px Montserrat, sans-serif"; 
    ctx.fillText("speedwayguessr.pl", 540, 1820);

    // Klonujemy zawartość przycisku by go wizualnie zablokować
    const shareBtn = document.getElementById('btnSharePost');
    const originalBtnHTML = shareBtn.innerHTML;
    shareBtn.innerHTML = "⏳ GENEROWANIE...";
    shareBtn.disabled = true;

    try {
        canvas.toBlob(async (blob) => {
            if (!blob) { 
                appAlert("Błąd generowania obrazu.", "Błąd"); 
                resetShareBtn(shareBtn, originalBtnHTML);
                return; 
            } 
            
            // HYBRYDOWY SYSTEM UDOSTĘPNIANIA
            // Jeśli urządzenie obsługuje natywne kopiowanie obrazów (zwykle PC) i nie jest urządzeniem typowo mobilnym
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            if (!isMobile && navigator.clipboard && navigator.clipboard.write) {
                // Kopiowanie do schowka dla komputerów (PC)
                try {
                    const item = new ClipboardItem({ "image/png": blob });
                    await navigator.clipboard.write([item]);
                    showToast("Obrazek skopiowany do schowka! Wklej go na Discordzie (Ctrl+V)", "success");
                } catch (e) {
                    console.error("Clipboard API failed, fallback to native share:", e);
                    // Fallback jeśli ktoś ma wyłączone clipboard api na PC
                    shareViaNativeAPI(blob); 
                }
            } else {
                // Udostępnianie systemowe (Telefony)
                shareViaNativeAPI(blob);
            }
            
            resetShareBtn(shareBtn, originalBtnHTML);

        }, "image/png");
    } catch (error) { 
        console.error("Error sharing:", error); 
        appAlert("Wystąpił nieoczekiwany błąd podczas udostępniania.", "Błąd"); 
        resetShareBtn(shareBtn, originalBtnHTML);
    }
}

// Funkcja pomocnicza przywracająca wygląd przycisku po zakończeniu
function resetShareBtn(btn, html) {
    setTimeout(() => {
        btn.innerHTML = html;
        btn.disabled = false;
    }, 1500);
}

// Funkcja pomocnicza używająca starego API na telefonach
async function shareViaNativeAPI(blob) {
    const file = new File([blob], `speedway-guessr-${dailyNumberGlobal}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { 
        await navigator.share({ files: [file], title: `Speedway Guessr Daily ${dailyNumberGlobal}`, text: `Mój wynik Speedway Guessr!` }); 
    } else { 
        appAlert("Twoja przeglądarka nie obsługuje tej funkcji udostępniania obrazów.", "Błąd Przeglądarki"); 
    }
}

function openRanking(defaultTab = 'daily') { 
    promptForNick(async () => { 
        const overlay = document.getElementById('rankingOverlay'); 
        overlay.style.display = 'block'; 
        setTimeout(() => overlay.style.opacity = '1', 10); 
        loadRanking(defaultTab); 
    }); 
}

// ==============================================
// ====== DESKTOP MENU RANKING LOADER ===========
// ==============================================

async function loadDesktopRanking(type) {
    const tbody = document.getElementById('desktopRankingBody'); 
    const thead = document.getElementById('desktopRankingHead');
    const title = document.getElementById('desktopRankingTitle');
    const tabs = document.getElementById('desktopRankTabs');
    
    async function fetchVisibleLeaderboardRows(collectionName, orderField, visibleLimit, rowFilter) {
        const rows = [];
        let lastDoc = null;
        let hadAnyDocs = false;

        while (rows.length < visibleLimit) {
            let query = db.collection(collectionName).orderBy(orderField, 'desc').limit(100);
            if (lastDoc) query = query.startAfter(lastDoc);

            const snapshot = await query.get();
            if (snapshot.empty) break;

            hadAnyDocs = true;
            for (const doc of snapshot.docs) {
                if (rows.length >= visibleLimit) break;
                const row = doc.data();
                if (!rowFilter || rowFilter(row)) rows.push(row);
            }

            lastDoc = snapshot.docs[snapshot.docs.length - 1];
            if (snapshot.size < 100) break;
        }

        return { rows, hadAnyDocs };
    }
    
    if (!tbody || !thead || !title) return;

    if (type === 'league') {
        title.innerHTML = `<i>${t('desktopRankClash')} - SEZON BETA</i>`;
        title.style.color = '#3399ff';
        if (tabs) tabs.style.display = 'none';
    } else if (type === 'timeattack') {
        title.innerHTML = `<i>${t('desktopRankTA')}</i>`;
        title.style.color = '#1dd1a1';
        if (tabs) tabs.style.display = 'none';
    } else {
        let titleKey = type === 'daily' ? 'desktopRankDaily' : (type === 'weekly' ? 'desktopRankWeekly' : (type === 'monthly' ? 'desktopRankMonthly' : 'desktopRankAllTime'));
        title.innerHTML = `<i>${t(titleKey)}</i>`;
        title.style.color = 'var(--accent)';
        if (tabs) {
            tabs.style.display = 'flex';
            document.querySelectorAll('.d-tab').forEach(tab => tab.classList.remove('active'));
            if(type==='daily') tabs.children[0].classList.add('active');
            if(type==='weekly') tabs.children[1].classList.add('active');
            if(type==='monthly') tabs.children[2].classList.add('active');
            if(type==='alltime') tabs.children[3].classList.add('active');
        }
    }

    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">${t('loadingData')}</td></tr>`;

    try {
        if (type === 'league') {
            thead.innerHTML = `<tr><th style="width:15%;">${t('colPos')}</th><th style="text-align:left; width:50%;">${t('colNick')}</th><th style="width:20%;">${t('colRank')}</th><th style="width:15%;">${t('colElo')}</th></tr>`;
            
            const leaderboardData = await fetchVisibleLeaderboardRows(
                'leaderboard_clash_beta',
                'elo',
                20,
                (row) => (row.matchesPlayed || 0) >= 5
            );
            let scores = leaderboardData.rows;
            
            let myScoreFound = false;
            let myPersonalScore = null;
            if (typeof playerId !== 'undefined' && playerId) {
                const myDoc = await db.collection("leaderboard_clash_beta").doc(playerId).get();
                if (myDoc.exists) myPersonalScore = myDoc.data();
            }

            tbody.innerHTML = '';
            if (scores.length === 0) {
                const emptyText = leaderboardData.hadAnyDocs ? (t('noResultsCalib') || 'Kalibracja w toku...') : t('noResults');
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">${emptyText}</td></tr>`;
                return;
            }

            let pos = 1;
            scores.forEach((row) => {
                let safeNick = typeof escapeHTML === 'function' ? escapeHTML(row.nick || t('defaultPlayer')) : (row.nick || t('defaultPlayer'));
                if (typeof playerNickname !== 'undefined' && safeNick === playerNickname) myScoreFound = true;
                
                let rangaText = typeof getLeagueRankName === 'function' ? getLeagueRankName(row.elo, row.matchesPlayed) : row.rank;
                if (typeof getMiniClubBadge === 'function') safeNick += getMiniClubBadge(row.club); 
                
                let bgClass = row.bg ? row.bg : '';
                let isMeStyle = (typeof playerNickname !== 'undefined' && (row.nick || t('defaultPlayer')) === playerNickname) ? 'style="background: rgba(255,255,255,0.05);"' : '';
                
                tbody.innerHTML += `
                    <tr class="${bgClass}" ${isMeStyle}>
                        <td style="color:var(--accent); font-weight:900;">${pos}</td>
                        <td style="text-align:left;">${safeNick}</td>
                        <td style="font-size:10px;">${rangaText}</td>
                        <td style="color:#3399ff;">${row.elo}</td>
                    </tr>`;
                pos++;
            });

            if (!myScoreFound && myPersonalScore && myPersonalScore.matchesPlayed >= 5) {
                let myRank = typeof getLeagueRankName === 'function' ? getLeagueRankName(myPersonalScore.elo, myPersonalScore.matchesPlayed) : myPersonalScore.rank;
                let mySafeNick = typeof escapeHTML === 'function' ? escapeHTML(myPersonalScore.nick || t('defaultPlayer')) : (myPersonalScore.nick || t('defaultPlayer'));
                if (typeof getMiniClubBadge === 'function') mySafeNick += getMiniClubBadge(myPersonalScore.club);
                let myBgClass = myPersonalScore.bg ? myPersonalScore.bg : '';
                
                tbody.innerHTML += `<tr><td colspan="4" style="border-bottom:none; height: 5px; padding:0; background:transparent;"></td></tr>`;
                tbody.innerHTML += `
                    <tr class="${myBgClass}" style="background: rgba(51, 153, 255, 0.1); border: 1px solid #3399ff;">
                        <td style="color:var(--accent); font-weight:900;">--</td>
                        <td style="text-align:left;">${mySafeNick} <span style="font-size: 8px; color: #3399ff;">(TY)</span></td>
                        <td style="font-size:10px;">${myRank}</td>
                        <td style="color:#3399ff; font-weight: bold;">${myPersonalScore.elo}</td>
                    </tr>`;
            }

        } else if (type === 'timeattack') {
            thead.innerHTML = `<tr><th style="width: 15%;">${t('colPos')}</th><th style="text-align: left; width: 60%;">${t('colNick')}</th><th style="color: #1dd1a1; width: 25%; text-align: center;">${t('colRecord')}</th></tr>`;
            let snapshot = await db.collection("leaderboard_timeattack").orderBy("score", "desc").limit(20).get();
            let scores = []; snapshot.forEach(doc => { scores.push(doc.data()); });
            
            let myScoreFound = false;
            let myPersonalScore = null;
            if (typeof playerId !== 'undefined' && playerId) {
                const myDoc = await db.collection("leaderboard_timeattack").doc(playerId).get();
                if (myDoc.exists) myPersonalScore = myDoc.data();
            }

            tbody.innerHTML = '';
            if (scores.length === 0) { tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">${t('noResults')}</td></tr>`; return; }

            let pos = 1;
            scores.forEach((row) => {
                let safeNick = typeof escapeHTML === 'function' ? escapeHTML(row.nick || t('defaultPlayer')) : (row.nick || t('defaultPlayer'));
                if (typeof playerNickname !== 'undefined' && safeNick === playerNickname) myScoreFound = true;
                if (typeof getMiniClubBadge === 'function') safeNick += getMiniClubBadge(row.club); 
                
                let bgClass = row.bg ? row.bg : '';
                let isMeStyle = (typeof playerNickname !== 'undefined' && (row.nick || t('defaultPlayer')) === playerNickname) ? 'style="background: rgba(255,255,255,0.05);"' : '';
                let rankClass = pos === 1 ? "rank-1" : pos === 2 ? "rank-2" : pos === 3 ? "rank-3" : "";
                
                tbody.innerHTML += `
                    <tr class="${bgClass}" ${isMeStyle}>
                        <td class="${rankClass}" style="color:var(--accent); font-weight:900;">${pos}</td>
                        <td class="${rankClass}" style="text-align:left;">${safeNick}</td>
                        <td style="color:#1dd1a1; font-weight:900; text-align: center;">${row.score}</td>
                    </tr>`;
                pos++;
            });

            if (!myScoreFound && myPersonalScore) {
                let mySafeNick = typeof escapeHTML === 'function' ? escapeHTML(myPersonalScore.nick || t('defaultPlayer')) : (myPersonalScore.nick || t('defaultPlayer'));
                if (typeof getMiniClubBadge === 'function') mySafeNick += getMiniClubBadge(myPersonalScore.club);
                let myBgClass = myPersonalScore.bg ? myPersonalScore.bg : '';
                
                tbody.innerHTML += `<tr><td colspan="3" style="border-bottom:none; height: 5px; padding:0; background:transparent;"></td></tr>`;
                tbody.innerHTML += `
                    <tr class="${myBgClass}" style="background: rgba(29, 209, 161, 0.1); border: 1px solid #1dd1a1;">
                        <td style="color:var(--accent); font-weight:900;">--</td>
                        <td style="text-align:left;">${mySafeNick} <span style="font-size: 8px; color: #1dd1a1;">(TY)</span></td>
                        <td style="color:#1dd1a1; font-weight:900; text-align: center;">${myPersonalScore.score}</td>
                    </tr>`;
            }

        } else {
            let headerText = (type === 'daily') ? t('colSolved') : t('colTotalWins');
            thead.innerHTML = `<tr><th style="width:15%;">${t('colPos')}</th><th style="text-align:left; width:45%;">${t('colNick')}</th><th style="width:20%;">${headerText}</th><th style="width:20%;">${t('colTries')}</th></tr>`;
            
            let snapshot;
            if (type === 'daily') snapshot = await db.collection("rankings").doc(selectedDailyDay.toString()).collection("scores").limit(20).get();
            else if (type === 'weekly') snapshot = await db.collection("leaderboard_weekly").doc(getCurrentWeekStr()).collection("scores").limit(20).get();
            else if (type === 'monthly') snapshot = await db.collection("leaderboard_monthly").doc(getCurrentMonthStr()).collection("scores").limit(20).get();
            else if (type === 'alltime') snapshot = await db.collection("leaderboard_alltime").doc("global").collection("scores").limit(20).get();
            
            let scores = []; snapshot.forEach(doc => { scores.push(doc.data()); });
            scores.sort((a, b) => { 
                let winsA = a.won !== undefined ? a.won : (a.wins || 0); 
                let winsB = b.won !== undefined ? b.won : (b.wins || 0); 
                if (winsB !== winsA) return winsB - winsA; 
                if (a.guesses !== b.guesses) return a.guesses - b.guesses; 
                let hintsA = a.hints || 0; let hintsB = b.hints || 0;
                if (hintsA !== hintsB) return hintsA - hintsB;
                return (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0); 
            });
            
            tbody.innerHTML = '';
            if (scores.length === 0) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">${t('noResults')}</td></tr>`; return; }

            scores.forEach((row, index) => {
                let winsAmount = row.won !== undefined ? row.won : (row.wins || 0); 
                let wonText = winsAmount > 0 ? `<span style="color:var(--green-neon);">${type === 'daily' ? t('yes') : winsAmount}</span>` : `<span style="color:var(--red-neon);">${type === 'daily' ? t('no') : '0'}</span>`;
                
                let safeNick = typeof escapeHTML === 'function' ? escapeHTML(row.nick || t('defaultPlayer')) : (row.nick || t('defaultPlayer'));
                if (typeof getMiniClubBadge === 'function') safeNick += getMiniClubBadge(row.club); 
                
                let bgClass = row.bg ? row.bg : '';
                let isMeStyle = (typeof playerNickname !== 'undefined' && (row.nick || t('defaultPlayer')) === playerNickname) ? 'style="color: var(--accent);"' : '';
                
                tbody.innerHTML += `
                    <tr class="${bgClass}" ${isMeStyle}>
                        <td style="color:var(--accent); font-weight:900;">${index + 1}</td>
                        <td style="text-align:left;">${safeNick}</td>
                        <td>${wonText}</td>
                        <td style="color:var(--text-dim);">${row.guesses}</td>
                    </tr>`;
            });
        }
    } catch (e) { 
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Błąd bazy danych</td></tr>`; 
    }
}


// ==============================================
// ====== WERSJA MOBILNA RANKINGU (MODAL) =======
// ==============================================

async function loadRanking(type) {
    document.querySelectorAll('.rank-tab').forEach(btn => btn.classList.remove('active')); 
    const activeTab = document.getElementById(`tab-${type}`); 
    if (activeTab) activeTab.classList.add('active');
    
    const tbody = document.getElementById('rankingTableBody'); 
    const thead = document.getElementById('rankingTableHead');
    let dateDisplay = document.getElementById('rankingDateDisplay');
    
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">${t('loadingData')}</td></tr>`;

    if (type === 'league') {
        if (dateDisplay) dateDisplay.style.display = 'none';
        if (thead) thead.innerHTML = `<tr><th>${t('colPos')}</th><th style="text-align: left;">${t('colNick')}</th><th>${t('colRank')}</th><th>Mecze</th><th style="color:var(--accent);">${t('colElo')}</th></tr>`;
        
        try {
            let lastDoc = null;
            let scores = [];
            let hadAnyDocs = false;
            
            while (scores.length < 100) {
                let query = db.collection('leaderboard_clash_beta').orderBy('elo', 'desc').limit(100);
                if (lastDoc) query = query.startAfter(lastDoc);

                const snapshot = await query.get();
                if (snapshot.empty) break;

                hadAnyDocs = true;
                for (const doc of snapshot.docs) {
                    if (scores.length >= 100) break;
                    const row = doc.data();
                    if ((row.matchesPlayed || 0) >= 5) scores.push(row);
                }

                lastDoc = snapshot.docs[snapshot.docs.length - 1];
                if (snapshot.size < 100) break;
            }

            let myScoreFound = false;
            let myPersonalScore = null;
            if (playerId) {
                const myDoc = await db.collection("leaderboard_clash_beta").doc(playerId).get();
                if (myDoc.exists) myPersonalScore = myDoc.data();
            }
            
            if (tbody) tbody.innerHTML = '';
            if (scores.length === 0) { 
                if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">${hadAnyDocs ? t('noResultsCalib') : t('noResults')}</td></tr>`; 
                return; 
            }

            let currentRankPosition = 1;

            scores.forEach((row) => {
                let safeRenderNick = typeof escapeHTML === 'function' ? escapeHTML(row.nick || t('defaultPlayer')) : (row.nick || t('defaultPlayer'));
                if (safeRenderNick === playerNickname) myScoreFound = true; 

                let rankClass = ""; 
                if (currentRankPosition === 1) rankClass = "rank-1"; 
                else if (currentRankPosition === 2) rankClass = "rank-2"; 
                else if (currentRankPosition === 3) rankClass = "rank-3";
                
                safeRenderNick += getMiniClubBadge(row.club); 
                
                let bgClass = row.bg ? row.bg : '';
                let isMeStyle = (row.nick || t('defaultPlayer')) === playerNickname ? 'style="background: rgba(255,255,255,0.05);"' : '';
                
                let rangaText = getLeagueRankName(row.elo, row.matchesPlayed);
                let rangaColorClass = getRankClass(row.elo, row.matchesPlayed);
                let rangaImg = getLeagueImageTag(row.elo, row.matchesPlayed, 18);
                
                if (tbody) { 
                    tbody.innerHTML += `<tr class="${bgClass}" ${isMeStyle}>
                        <td class="${rankClass}">${currentRankPosition}</td>
                        <td class="rank-nick ${rankClass}" style="text-align:left;">${safeRenderNick}</td>
                        <td style="font-size:10px; font-weight:900;" class="${rangaColorClass}">
                            <div style="display:flex; align-items:center; justify-content:center; gap: 4px;">
                                ${rangaImg} <span>${rangaText}</span>
                            </div>
                        </td>
                        <td style="color:var(--text-dim); font-size:11px;">${row.matchesPlayed}</td>
                        <td style="font-weight:900; color:var(--accent); font-size:14px;">${row.elo}</td>
                    </tr>`; 
                }
                currentRankPosition++;
            });

            if (!myScoreFound && myPersonalScore && myPersonalScore.matchesPlayed >= 5 && tbody) {
                let myRank = getLeagueRankName(myPersonalScore.elo, myPersonalScore.matchesPlayed);
                let myRankClass = getRankClass(myPersonalScore.elo, myPersonalScore.matchesPlayed);
                let myRankImg = getLeagueImageTag(myPersonalScore.elo, myPersonalScore.matchesPlayed, 18);
                let mySafeNick = typeof escapeHTML === 'function' ? escapeHTML(myPersonalScore.nick || t('defaultPlayer')) : (myPersonalScore.nick || t('defaultPlayer'));
                mySafeNick += getMiniClubBadge(myPersonalScore.club);
                let myBgClass = myPersonalScore.bg ? myPersonalScore.bg : '';
                
                tbody.innerHTML += `<tr><td colspan="5" style="border-bottom:none; height: 5px; padding:0; background:transparent;"></td></tr>`;
                tbody.innerHTML += `
                    <tr class="${myBgClass}" style="background: rgba(51, 153, 255, 0.1); border: 1px solid #3399ff;">
                        <td style="color:var(--accent); font-weight:900;">--</td>
                        <td class="rank-nick" style="text-align:left;">${mySafeNick} <span style="font-size: 8px; color: #3399ff;">(TY)</span></td>
                        <td style="font-size:10px; font-weight:900;" class="${myRankClass}">
                            <div style="display:flex; align-items:center; justify-content:center; gap: 4px;">
                                ${myRankImg} <span>${myRank}</span>
                            </div>
                        </td>
                        <td style="color:var(--text-dim); font-size:11px;">${myPersonalScore.matchesPlayed}</td>
                        <td style="font-weight:900; color:var(--accent); font-size:14px;">${myPersonalScore.elo}</td>
                    </tr>`;
            }

        } catch (e) { 
            console.error(e); 
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--red-neon);">${t('errorDB')}</td></tr>`; 
        }
        return;
    }

    let headerText = (type === 'daily') ? t('colSolved') : t('colTotalWins');
    if (thead) thead.innerHTML = `<tr><th>${t('colPos')}</th><th style="text-align: left;">${t('colNick')}</th><th>${headerText}</th><th>${t('colTries')}</th></tr>`;
    
    if (type === 'daily') { 
        if (dateDisplay) { 
            dateDisplay.innerText = `Wyniki z: ${getDailyDateString(selectedDailyDay)} (Daily #${selectedDailyDay})`; 
            dateDisplay.style.display = 'block'; 
        } 
    } else { 
        if (dateDisplay) dateDisplay.style.display = 'none'; 
    }

    try {
        let snapshot;
        if (type === 'daily') snapshot = await db.collection("rankings").doc(selectedDailyDay.toString()).collection("scores").limit(100).get();
        else if (type === 'weekly') snapshot = await db.collection("leaderboard_weekly").doc(getCurrentWeekStr()).collection("scores").limit(100).get();
        else if (type === 'monthly') snapshot = await db.collection("leaderboard_monthly").doc(getCurrentMonthStr()).collection("scores").limit(100).get();
        else if (type === 'alltime') snapshot = await db.collection("leaderboard_alltime").doc("global").collection("scores").limit(100).get();
        
        let scores = []; snapshot.forEach(doc => { scores.push(doc.data()); });
        scores.sort((a, b) => { 
            let winsA = a.won !== undefined ? a.won : (a.wins || 0); 
            let winsB = b.won !== undefined ? b.won : (b.wins || 0); 
            if (winsB !== winsA) return winsB - winsA; 
            if (a.guesses !== b.guesses) return a.guesses - b.guesses; 
            let hintsA = a.hints || 0; let hintsB = b.hints || 0;
            if (hintsA !== hintsB) return hintsA - hintsB;
            return (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0); 
        });
        
        if (tbody) tbody.innerHTML = '';
        if (scores.length === 0) { 
            if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">${t('noResults')}</td></tr>`; 
            return; 
        }

        scores.forEach((row, index) => {
            let rankClass = ""; 
            if (index === 0) rankClass = "rank-1"; 
            else if (index === 1) rankClass = "rank-2"; 
            else if (index === 2) rankClass = "rank-3";
            
            let winsAmount = row.won !== undefined ? row.won : (row.wins || 0); 
            let wonText = winsAmount > 0 ? `<span class="rank-won">${type === 'daily' ? t('yes') : winsAmount}</span>` : `<span class="rank-lost">${type === 'daily' ? t('no') : '0'}</span>`;
            
            let safeRenderNick = typeof escapeHTML === 'function' ? escapeHTML(row.nick || t('defaultPlayer')) : (row.nick || t('defaultPlayer'));
            safeRenderNick += getMiniClubBadge(row.club); 
            
            let bgClass = row.bg ? row.bg : '';
            let isMeStyle = (row.nick || t('defaultPlayer')) === playerNickname ? 'style="background: rgba(255,255,255,0.05);"' : '';
            
            if (tbody) { 
                tbody.innerHTML += `<tr class="${bgClass}" ${isMeStyle}>
                    <td class="${rankClass}">${index + 1}</td>
                    <td class="rank-nick ${rankClass}" style="text-align:left;">${safeRenderNick}</td>
                    <td>${wonText}</td>
                    <td>${row.guesses}</td>
                </tr>`; 
            }
        });
    } catch (e) { 
        console.error(e); 
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--red-neon);">${t('errorDB')}</td></tr>`; 
    }
}


function closeRanking() { const overlay = document.getElementById('rankingOverlay'); overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300); }

function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas'); const ctx = canvas.getContext('2d'); canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    let particles = []; for (let i = 0; i < 150; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*-canvas.height, color: ['#f1c40f','#e74c3c','#2ecc71','#3498db'][Math.floor(Math.random()*4)], sy: Math.random()*4+2, r: Math.random()*360 });
    function draw() { ctx.clearRect(0,0,canvas.width,canvas.height); particles.forEach(p => { ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r*Math.PI/180); ctx.fillStyle=p.color; ctx.fillRect(-5,-10,10,20); ctx.restore(); p.y+=p.sy; if(p.y>canvas.height)p.y=-20; }); requestAnimationFrame(draw); } draw();
}


// ==============================================
// ====== MULTIPLAYER SPEEDWAY CLASH ============
// ==============================================

let currentClashRoom = null;
let clashUnsubscribe = null;
let currentClashData = null;
let myClashColor = null; 
let clashTimerInterval = null;
let clashStatus = 'none'; 
let clashTurn = 'red';
let clashRows = [];
let clashCols = [];
let clashBoardState = Array(9).fill(null); 
let clashGuessedPlayers = [];
let clashActiveCellIdx = null;
let clashLeaveInProgress = false;

const ELO_K_FACTOR_CALIBRATION = 60;
const ELO_K_FACTOR_NORMAL = 30;
const SURRENDER_MIN_ELO_SWING = 12;
window.hasUpdatedLeague = false; 

// ==============================================
// ======      RANGI I KOLORY RANG        =======
// ==============================================

function getLeagueRankName(elo, matchesPlayed) {
    if (matchesPlayed < 5) return `KALIBRACJA (${matchesPlayed}/5)`;
    if (elo <= 175) return 'BRĄZ 1';
    if (elo <= 250) return 'BRĄZ 2';
    if (elo <= 325) return 'BRĄZ 3';
    if (elo <= 400) return 'BRĄZ 4';
    if (elo <= 475) return 'BRĄZ 5';
    if (elo <= 550) return 'SREBRO 1';
    if (elo <= 650) return 'SREBRO 2';
    if (elo <= 750) return 'SREBRO 3';
    if (elo <= 850) return 'SREBRO 4';
    if (elo <= 950) return 'SREBRO 5';
    if (elo <= 1100) return 'ZŁOTO 1';
    if (elo <= 1200) return 'ZŁOTO 2';
    if (elo <= 1300) return 'ZŁOTO 3';
    if (elo <= 1400) return 'ZŁOTO 4';
    if (elo <= 1500) return 'ZŁOTO 5';
    if (elo <= 1750) return 'SZMARAGD 1';
    if (elo <= 1950) return 'SZMARAGD 2';
    if (elo <= 2150) return 'SZMARAGD 3';
    if (elo <= 2350) return 'SZMARAGD 4';
    if (elo <= 2750) return 'SZMARAGD 5';
    if (elo <= 3100) return 'DIAMENT 1';
    if (elo <= 3500) return 'DIAMENT 2';
    if (elo <= 4000) return 'DIAMENT 3';
    return 'LEGENDA';
}

function getRankClass(elo, matchesPlayed) {
    if (matchesPlayed < 5) return 'rank-calibration';
    if (elo <= 475) return 'rank-bronze';
    if (elo <= 950) return 'rank-silver';
    if (elo <= 1500) return 'rank-gold';
    if (elo <= 2750) return 'rank-emerald';
    if (elo <= 4000) return 'rank-diamond';
    return 'rank-legend';
}

function getLeagueImageTag(elo, matchesPlayed, size = 24) {
    if (matchesPlayed < 5) return '⚖️'; // Waga dla Kalibracji
    
    let src = '';
    if (elo <= 175) src = 'ranga_braz1.png';
    else if (elo <= 250) src = 'ranga_braz2.png';
    else if (elo <= 325) src = 'ranga_braz3.png';
    else if (elo <= 400) src = 'ranga_braz4.png';
    else if (elo <= 475) src = 'ranga_braz5.png';
    else if (elo <= 550) src = 'ranga_srebro1.png';
    else if (elo <= 650) src = 'ranga_srebro2.png';
    else if (elo <= 750) src = 'ranga_srebro3.png';
    else if (elo <= 850) src = 'ranga_srebro4.png';
    else if (elo <= 950) src = 'ranga_srebro5.png';
    else if (elo <= 1100) src = 'ranga_zloto1.png';
    else if (elo <= 1200) src = 'ranga_zloto2.png';
    else if (elo <= 1300) src = 'ranga_zloto3.png';
    else if (elo <= 1400) src = 'ranga_zloto4.png';
    else if (elo <= 1500) src = 'ranga_zloto5.png';
    else if (elo <= 1750) src = 'ranga_szmaragd1.png';
    else if (elo <= 1950) src = 'ranga_szmaragd2.png';
    else if (elo <= 2150) src = 'ranga_szmaragd3.png';
    else if (elo <= 2350) src = 'ranga_szmaragd4.png';
    else if (elo <= 2750) src = 'ranga_szmaragd5.png';
    else if (elo <= 3100) src = 'ranga_diament1.png';
    else if (elo <= 3500) src = 'ranga_diament2.png';
    else if (elo <= 4000) src = 'ranga_diament3.png';
    else src = 'ranga_legenda.png'; // Zmiana nazwy żeby nie było literówek!
    
    return `<img src="images/rangi/${src}" alt="Ranga" style="height: ${size}px; vertical-align: middle; margin-right: 5px; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.5));">`;
}

function updateLeagueUI() {
    const displays = [document.getElementById('leagueRankDisplay'), document.getElementById('leagueRankDisplayMobile')];
    
    if (userStats.clashLeague) {
        const played = userStats.clashLeague.matchesPlayed || 0;
        const elo = userStats.clashLeague.elo || 1000;
        const rank = getLeagueRankName(elo, played);
        const imgTag = getLeagueImageTag(elo, played, 24); 
        
        displays.forEach(display => {``
            if (display) {
                if (played < 5) display.innerText = `KALIBRACJA (${played}/5) | ELO: ${Math.round(elo)}`;
                else display.innerHTML = `${imgTag} <span style="vertical-align: middle;">${rank} | ELO: ${Math.round(elo)}</span>`;
                display.className = getRankClass(elo, played);
            }
        });
    }
    renderLeagueHistory();
}

// --- ANTI-CHEAT ---
document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentClashRoom && clashStatus === 'playing') {
        if (clashTurn === myClashColor) {
            
            ensureLeagueStats(userStats);
            if (typeof userStats.clashLeague.tabSwitches !== 'number') {
                userStats.clashLeague.tabSwitches = 0;
            }
            
            skipClashTurn("Opuścił okno gry (KARA)");
            
            if (currentClashData && currentClashData.type === 'league') {
                userStats.clashLeague.tabSwitches++;
                saveStats();
                
                let offenses = userStats.clashLeague.tabSwitches;
                
                if (offenses >= 3) {
                    applyMatchmakingBan("Nagminne opuszczanie okna gry (3 ostrzeżenia).");
                    userStats.clashLeague.tabSwitches = 0;
                    saveStats();
                } else {
                    // Przetłumaczony modal z dynamiczną zmienną
                    let warnTitle = currentLang === 'pl' ? "OSTRZEŻENIE ⚠️" : "WARNING ⚠️";
                    let warnMsg = currentLang === 'pl' 
                        ? `Wykryto opuszczenie ekranu gry.\nStraciłeś swoją turę!\n\nTo Twoje ${offenses}. ostrzeżenie. Po 3 ostrzeżeniach otrzymasz blokadę na grę ligową!`
                        : `Tab switch detected.\nYou lost your turn!\n\nThis is your ${offenses}. warning. After 3 warnings you will be banned from matchmaking!`;
                    let warnBtn = currentLang === 'pl' ? "ROZUMIEM" : "I UNDERSTAND";

                    showAppModal({ 
                        title: warnTitle, 
                        message: warnMsg, 
                        confirmText: warnBtn 
                    });
                }
            } else {
                showToast(t('toastTabSwitch'), "error"); 
            }
        }
    }
});

// --- POPRAWIONE WYŚWIETLANIE PLANSZY ---
function updateClashBoardUI(data) {
    const clashContainer = document.getElementById('clashContainer');
    if (!clashContainer) return;

    if (clashStatus !== 'viewing') {
        setElementDisplay('mainMenuContainer', 'none');
        setElementDisplay('gameContainer', 'none');
        setElementDisplay('clashModeSelectContainer', 'none');
        setElementDisplay('clashLobbyContainer', 'none');
        setElementDisplay('clashLocalLobbyContainer', 'none');
        setElementDisplay('clashContainer', 'block');
    }
    
    closeClashSearch();
    
    // Bezpieczne sprawdzanie rozmiaru
    let bSize = 3;
    if (data.board && data.board.length) {
        bSize = Math.sqrt(data.board.length);
    } else if (data.boardSize) {
        bSize = data.boardSize;
    }
    if (!Number.isInteger(bSize)) bSize = 3;

    // Najpierw wymuszamy budowę gridu (zwraca true jeśli grid istnieje w DOM)
    let isGridBuilt = buildDynamicClashGridHTML(bSize);
    
    if (!isGridBuilt) {
        console.error("Critical error: Could not build Clash Grid HTML.");
        return;
    }

    // Bezpieczne wstawianie klas (timeout chroni przed rozjechaniem się ramy z DOM rendererem)
    setTimeout(() => {
        for(let r = 0; r < bSize; r++) {
            for(let c = 0; c < bSize; c++) {
                let idx = r * bSize + c; 
                let cell = document.getElementById(`cell-${r}-${c}`); 
                
                if (!cell) {
                    console.warn(`Skrypt nie znalazł cell-${r}-${c}. Powtórne logowanie.`);
                    continue; 
                }
                
                let val = data.board[idx];
                
                if(val === 'red' || val === 'blue') { 
                    cell.className = `clash-cell clash-playable claimed-${val}`; 
                    let playerName = data.guessedPlayers[idx] || "Gracz";
                    cell.innerHTML = `<span class="clash-player-name">${playerName}</span>`;
                } else { 
                    cell.className = 'clash-cell clash-playable'; 
                    cell.innerHTML = '<span style="opacity: 0.1; font-size: 24px;">+</span>'; 
                }
            }
        }

        updateClashTurnUI();
        
        // Zaktualizuj nagłówki
        for (let i = 0; i < bSize; i++) {
            const colHeader = document.getElementById(`col${i}`);
            if (colHeader && clashCols[i]) {
                let headerHTML = `${getClubAbbr(clashCols[i])}`;
                const consCountry = getConstraintCountry(data.constraints, i);
                if (consCountry) {
                    headerHTML += `<br><span style="color:var(--green-neon); font-size:9px;">[${consCountry}]</span>`;
                }
                colHeader.innerHTML = headerHTML;
            }
            const rowHeader = document.getElementById(`row${i}`);
            if (rowHeader && clashRows[i]) {
                rowHeader.innerHTML = `${getClubAbbr(clashRows[i])}`;
            }
        }

        if (clashStatus === 'viewing' || clashStatus === 'summary') {
            document.getElementById('clashTimerDisplay').innerText = "KONIEC MECZU";
            document.getElementById('clashTimerDisplay').style.color = "var(--text-dim)";
            if(clashTimerInterval) clearInterval(clashTimerInterval);
            return; 
        }

        if(clashTurn === myClashColor || isLocalClash) { 
            document.getElementById('clashTimerDisplay').style.color = '#00ff66'; 
            if (isLocalClash || (window.lastTurnColor !== clashTurn)) {
                playSound('flip');
                window.lastTurnColor = clashTurn;
            }
        } else { 
            document.getElementById('clashTimerDisplay').style.color = '#fff'; 
        }

        if(data.lastAction && data.lastAction !== '' && (data.turn === myClashColor || isLocalClash)) {
            setTimeout(() => showToast(`Błąd rywala: ${data.lastAction}! Twoja kolej!`, "success"), 200);
            if (isLocalClash) {
                localClashData.lastAction = '';
            } else {
                db.collection("clash_rooms").doc(currentClashRoom).update({ lastAction: '' });
            }
        } else if (data.turn === myClashColor && clashStatus === 'playing' && window.lastTurnColor !== clashTurn) {
            showToast("TWÓJ RUCH!", "normal");
        }

        startClashTimer(data.deadline);

    }, 10); // Bardzo krótki timeout pozwala przeglądarce załadować nowo wygenerowany HTML do DOM.
}

function setElementDisplay(id, value) {
    const el = document.getElementById(id);
    if (el) el.style.display = value;
}

function showClashMatchView() {
    setElementDisplay('mainMenuContainer', 'none');
    setElementDisplay('gameContainer', 'none');
    setElementDisplay('postGameActions', 'none');
    setElementDisplay('clashModeSelectContainer', 'none');
    setElementDisplay('clashLobbyContainer', 'none');
    
    // Gwarantujemy, że plansza się pojawi i NIE BĘDZIE przezroczysta!
    const clashContainer = document.getElementById('clashContainer');
    if (clashContainer) {
        clashContainer.style.display = 'block';
        clashContainer.style.opacity = '1'; 
    }
}

function showClashModeView() {
    setElementDisplay('clashContainer', 'none');
    setElementDisplay('clashLobbyContainer', 'none');
    setElementDisplay('clashModeSelectContainer', 'flex');
}

function isActiveClashStatus(status) {
    return ['waiting', 'vsScreen', 'coinToss', 'playing'].includes(status);
}

function hasBothClashPlayers(data) {
    return !!(data && data.p1 && data.p2);
}

function startClashGame() {
    promptForNick(() => {
        document.getElementById('mainMenuContainer').style.display = 'none';
        document.getElementById('desktopMainMenu').style.display = 'none'; 
        
        // Wyświetlenie nowego ekranu Clasha
        document.getElementById('clashModeSelectContainer').style.display = 'grid'; 
        
        // Odświeżenie danych na nowej karcie gracza
        const nickDisplay = document.getElementById('clashMenuNick');
        if(nickDisplay) nickDisplay.innerText = playerNickname || "GRACZ";
        updateLeagueUI();
        
        // Automatyczne załadowanie rankingu Clasha do nowej tabeli na prawo
        loadClashRankingOnly();
    });
}

async function loadClashRankingOnly() {
    const tbody = document.getElementById('desktopRankingBodyClash'); 
    if (!tbody) return;
    try {
        let snapshot = await db.collection("leaderboard_clash_beta").orderBy("elo", "desc").limit(20).get();
        let scores = []; snapshot.forEach(doc => { scores.push(doc.data()); });
        
        tbody.innerHTML = '';
        if (scores.length === 0) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Brak wyników. Zagraj pierwszy!</td></tr>`; return; }

        let pos = 1;
        scores.forEach((row) => {
            if (row.provisional || row.matchesPlayed < 5) return; 
            let rangaText = getLeagueRankName(row.elo, row.matchesPlayed);
            let safeNick = escapeHTML(row.nick || "Gracz");
            let isMe = safeNick === playerNickname ? 'style="color: var(--accent);"' : '';
            
            tbody.innerHTML += `
                <tr ${isMe}>
                    <td style="color:var(--accent); font-weight:900;">${pos}</td>
                    <td>${safeNick}</td>
                    <td style="font-size:10px;">${rangaText}</td>
                    <td style="color:#3399ff;">${row.elo}</td>
                </tr>`;
            pos++;
        });
    } catch (e) { 
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Błąd bazy danych.</td></tr>`; 
    }
}

function exitClashMenu() {
    window.location.reload();
}
function openFriendlyLobby() {
    document.getElementById('clashModeSelectContainer').style.display = 'none';
    document.getElementById('clashLobbyContainer').style.display = 'flex';
    document.getElementById('clashLobbySelect').style.display = 'block';
    document.getElementById('clashLobbyWaiting').style.display = 'none';
    document.getElementById('clashLobbyError').style.display = 'none';
}
function backToClashModeSelect() {
    if(clashUnsubscribe) clashUnsubscribe();
    if(currentClashRoom) { db.collection("clash_rooms").doc(currentClashRoom).delete().catch(e=>console.log(e)); currentClashRoom = null; }
    document.getElementById('clashLobbyContainer').style.display = 'none';
    document.getElementById('clashModeSelectContainer').style.display = 'flex';
}

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let code = "";
    for(let i=0; i<5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

// ==============================================
// ======   LOGIKA MECZU LIGOWEGO (ELO)   =======
// ==============================================

let isSearchingLeague = false;
let currentQueueId = null;

// NOWA FUNKCJA: Anulowanie wyszukiwania przez gracza
async function cancelLeagueMatchmaking() {
    // Chowamy okienka wyszukiwania (mobilne i desktopowe jeśli istnieją)
    ['clashMatchmakingOverlay', 'clashMatchmakingOverlayDesktop'].forEach(id => {
        const overlay = document.getElementById(id);
        if(overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 300);
        }
    });
    
    // JEŚLI GRA JUŻ TRWA (isSearchingLeague == false) TO NIE WYŁĄCZAJ POKOJU
    if (!isSearchingLeague) {
        return; 
    }

    isSearchingLeague = false;
    
    if (currentQueueId) {
        await db.collection("clash_queue").doc(currentQueueId).delete().catch(()=>{});
        currentQueueId = null;
    }
    if (currentClashRoom) {
        await db.collection("clash_rooms").doc(currentClashRoom).delete().catch(()=>{});
        currentClashRoom = null;
    }
    if(clashUnsubscribe) { clashUnsubscribe(); clashUnsubscribe = null; }
    
    showToast("Wyszukiwanie przerwane.", "normal");
}

async function startLeagueMatchmaking() {
    ensureLeagueStats(userStats);
    if (Date.now() < userStats.clashLeague.banUntil) {
        const remaining = Math.ceil((userStats.clashLeague.banUntil - Date.now()) / 60000);
        let czasTxt = remaining >= 1440 ? `${Math.round(remaining/1440)} dni` : (remaining >= 60 ? `${Math.round(remaining/60)} godz.` : `${remaining} min.`);
        appAlert(`Masz tymczasową blokadę na mecze ligowe za wychodzenie z gier lub AFK.\n\nKara minie za: ${czasTxt}`, "BLOKADA KONTA");
        return;
    }

    promptForNick(async () => {
        isSearchingLeague = true;
        
        const overlay = document.getElementById('clashMatchmakingOverlay');
        const statusText = document.getElementById('matchmakingStatusText');
        if (overlay && statusText) {
            statusText.innerText = "Czekamy na przeciwnika...";
            overlay.style.display = 'block'; 
            setTimeout(() => overlay.style.opacity = '1', 10);
        }

        try {
            const queueRef = db.collection("clash_queue");
            const snapshot = await queueRef.where("status", "==", "open").limit(1).get();

            if (!snapshot.empty && isSearchingLeague) {
                // KTOŚ JUŻ CZEKA W KOLEJCE (ZNALEZIONO POKÓJ)
                const queueDoc = snapshot.docs[0];
                const roomData = queueDoc.data();
                
                if (roomData.hostId !== playerId) {
                    if (statusText) statusText.innerText = "Łączenie z graczem...";
                    
                    const roomCode = roomData.roomCode;

                    // 🚨 ZABEZPIECZENIE PRZED POKOJEM-WIDMEM 🚨
                    try {
                        await db.collection("clash_rooms").doc(roomCode).update({
                            p2: { id: playerId, nick: playerNickname, elo: userStats.clashLeague.elo, matchesPlayed: userStats.clashLeague.matchesPlayed, color: 'blue' },
                            p2Ready: true
                        });
                        
                        await queueRef.doc(queueDoc.id).update({ status: "matched", guestId: playerId });

                        myClashColor = 'blue'; currentClashRoom = roomCode;
                        listenToClashRoom();
                        isSearchingLeague = false;
                        
                        setTimeout(() => { if(overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300); } }, 500);
                        return; // Pomyślnie podłączono do istniejącego pokoju, zamykamy funkcję.
                        
                    } catch (updateError) {
                        // Jeśli wyrzuciło błąd (pokój już nie istnieje mimo wpisu w kolejce)
                        console.warn("Wykryto pokój-widmo w kolejce. Usuwam i tworzę własny...", updateError);
                        await queueRef.doc(queueDoc.id).delete().catch(() => {}); // Kasujemy wpis zepsutego bota
                        // Gra przejdzie po prostu niżej i wykona logikę tworzenia nowego pokoju!
                    }
                }
            }

            if (!isSearchingLeague) return; 

            // ===========================================
            // NIE ZNALEZIONO / LUB ZNALEZIONO POKÓJ WIDMO
            // TWORZYMY WŁASNY NOWY POKÓJ I CZEKAMY
            // ===========================================
            if (statusText) statusText.innerText = "Tworzenie pokoju oczekiwania...";
            const roomCode = generateRoomCode(); myClashColor = 'red'; currentClashRoom = roomCode;
            
            let allClubs = getCleanClubsList(); 
            let bSize = customClashSettings.size || 3;
            // Najpierw szukamy 3 pasujących, jak nie to tniemy trudność do 2 pasujących (zapobiega crashom u graczy)
            let validBoard = tryGenerateBoard(allClubs, 3, 500, bSize) || tryGenerateBoard(allClubs, 2, 300, bSize);
            if (!validBoard) { 
                clashRows = ['unia leszno', 'stal gorzów wielkopolski', 'włókniarz częstochowa']; 
                clashCols = ['apator toruń', 'sparta wrocław', 'falubaz zielona góra']; 
            }

            let constraints = generateValidClashConstraint(clashRows, clashCols, bSize);

            await db.collection("clash_rooms").doc(roomCode).set({
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'waiting', type: 'league',
                p1: { id: playerId, nick: playerNickname, elo: userStats.clashLeague.elo, matchesPlayed: userStats.clashLeague.matchesPlayed, color: 'red' }, p2: null,
                p1Ready: true, p2Ready: false, score: { p1: 0, p2: 0 },
                rows: clashRows, cols: clashCols, constraints: constraints, board: Array(bSize * bSize).fill(null),
                guessedPlayers: Array(bSize * bSize).fill(null), turn: 'red', deadline: 0, lastAction: ''
            });

            const queueDoc = await queueRef.add({
                hostId: playerId, hostNick: playerNickname, roomCode: roomCode, status: "open",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            currentQueueId = queueDoc.id;
            await db.collection("clash_rooms").doc(roomCode).update({ queueId: currentQueueId });
            
            if (statusText) statusText.innerText = "Czekamy na przeciwnika...";
            listenToClashRoom();

        } catch (e) {
            console.error("Matchmaking error:", e);
            cancelLeagueMatchmaking();
            appAlert("Błąd serwera. Spróbuj ponownie za chwilę.", "Błąd wyszukiwania");
        }
    });
}

function resetLeagueButton(btn) {
    if (btn.id === 'btnLeagueModeDesktop') {
        btn.innerHTML = `<i>MECZ LIGOWY ►</i>`;
        btn.style.color = "rgba(255,255,255,0.5)";
    } else {
        btn.innerHTML = `
            <span class="btn-icon" style="font-size: 28px;">🏆</span>
            <span class="btn-text" style="text-align: left; width: 100%;">
                <span style="display:block; font-size: 18px; font-weight: 900;">MECZ LIGOWY</span>
                <small id="leagueRankDisplayMobile">ŁADOWANIE RANGI...</small>
            </span>`;
        btn.style.background = "linear-gradient(135deg, #ffd700, #b8860b)";
        btn.style.boxShadow = "0 0 20px rgba(255,215,0,0.3)";
    }
    btn.disabled = false;
    updateLeagueUI();
}

function calculateEloChange(myElo, opponentElo, result) {
    const K = userStats.clashLeague.matchesPlayed < 5 ? ELO_K_FACTOR_CALIBRATION : ELO_K_FACTOR_NORMAL;
    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
    return Math.round(K * (result - expectedScore));
}

async function updateLeagueStats(gameData) {
    if (gameData.type !== 'league' || window.hasUpdatedLeague) return;
    window.hasUpdatedLeague = true;

    ensureLeagueStats(userStats);
    const league = userStats.clashLeague;
    if (typeof league.winStreak !== 'number') league.winStreak = 0; 
    
    const opponent = myClashColor === 'red' ? gameData.p2 : gameData.p1;
    const opponentElo = opponent ? (opponent.elo || 1000) : 1000;
    const finishedBySurrender = gameData.finishReason === 'surrender';

     league.tabSwitches = 0; 

    let eloChange = 0;
    let resultText = "";

    if (gameData.winner === 'draw') {
        eloChange = 5; 
        league.draws++;
        league.winStreak = 0; 
        resultText = "REMIS";
    } else {
        const isWin = gameData.winner === myClashColor;
        const result = isWin ? 1 : 0;
        eloChange = calculateEloChange(league.elo, opponentElo, result);

        if (finishedBySurrender) {
            eloChange = isWin
                ? Math.max(eloChange, SURRENDER_MIN_ELO_SWING)
                : Math.min(eloChange, -SURRENDER_MIN_ELO_SWING);
        }

        if (isWin) {
            league.wins++;
            league.winStreak++;
            resultText = finishedBySurrender ? "WYGRANA (WALKOWER)" : "WYGRANA";
            if (league.winStreak >= 3) {
                eloChange += 5;
                resultText += ` (SERIA 🔥 +5)`;
            }
            
            // NOWOŚĆ
            updateMissionProgress('win_clash', 1);
            addExp(50); // Dużo EXP za wygraną
            
        } else {
            league.losses++;
            league.winStreak = 0;
            resultText = finishedBySurrender ? "PORAŻKA (PODDANIE)" : "PORAŻKA";
            
            // NOWOŚĆ
            addExp(15); // Nagroda pocieszenia
        }
    }

    league.elo += eloChange;
    league.matchesPlayed++;

    if(!userStats.clashHistory) userStats.clashHistory = [];
    userStats.clashHistory.unshift({
        date: new Date().toLocaleDateString(),
        opponent: opponent ? opponent.nick : "Anonim",
        result: resultText,
        change: eloChange
    });
    checkAchievements();
    saveStats();
    updateLeagueUI();
    
    appAlert(`Mecz ligowy zakończony!\nWynik: ${resultText}\nZmiana ELO: ${eloChange >= 0 ? '+' : ''}${eloChange}`, "Mecz ligowy");
 
    try {
        if (!auth.currentUser) return; // Jeśli jakimś cudem wylogowało gracza w trakcie meczu
        
        // WYMUSZAMY POBRANIE ŚWIEŻEGO TOKENA
        auth.currentUser.getIdToken(true).then(idToken => {
            console.log("Wysyłam sygnał do bota Discorda z tokenem...", { elo: league.elo, matchesPlayed: league.matchesPlayed });
            
            const updateDiscord = functions.httpsCallable('updateDiscordRank');
            
            updateDiscord({ 
                elo: league.elo, 
                matchesPlayed: league.matchesPlayed,
                firebaseToken: idToken // PRZESYŁAMY NASZ CERTYFIKAT TOŻSAMOŚCI!
            }).then(res => {
                console.log("Odpowiedź od bota Discorda:", res.data);
                if(res.data && res.data.message) {
                    showToast(`Discord: ${res.data.message}`, "success");
                } else if (res.data && res.data.error) {
                    console.error("Discord Auth Error:", res.data.error);
                }
            }).catch(e => {
                console.error("Błąd sieciowy aktualizacji Discorda:", e);
            });
        });
        
    } catch(e) {
        console.error("Nie udało się zainicjować funkcji Discorda", e);
    }
}

// LOCAL MULTIPLAYER:
let isLocalClash = false;
let localClashData = null;

function openLocalClashLobby() {
    document.getElementById('clashModeSelectContainer').style.display = 'none';
    document.getElementById('clashLocalLobbyContainer').style.display = 'flex';
    document.getElementById('localPlayer1Input').value = playerNickname || 'Gracz 1';
    document.getElementById('localPlayer2Input').value = 'Gracz 2';
}

function backToClashModeSelectFromLocal() {
    document.getElementById('clashLocalLobbyContainer').style.display = 'none';
    document.getElementById('clashModeSelectContainer').style.display = 'flex';
}

// --- POPRAWIONA LOGIKA WYŚWIETLANIA I UPDATE DANYCH LOKALNYCH ---
function startLocalClashMatch() {
    let p1Nick = document.getElementById('localPlayer1Input').value.trim() || 'Gracz 1';
    let p2Nick = document.getElementById('localPlayer2Input').value.trim() || 'Gracz 2';
    
    isLocalClash = true; 
    currentClashRoom = "LOCAL";
    
    let bSize = customClashSettings.size || 3;
    let turnTime = customClashSettings.turnTime || 120;
    
    let allClubs = getCleanClubsList();
    let validBoard = tryGenerateBoard(allClubs, 3, 500, bSize) || tryGenerateBoard(allClubs, 2, 300, bSize);
    
    if (!validBoard) { 
        const fbRows = ['unia leszno', 'stal gorzów wielkopolski', 'włókniarz częstochowa', 'sparta wrocław', 'apator toruń'];
        const fbCols = ['apator toruń', 'sparta wrocław', 'falubaz zielona góra', 'motor lublin', 'gkm grudziądz'];
        clashRows = fbRows.slice(0, bSize); 
        clashCols = fbCols.slice(0, bSize); 
    }
    
    let constraints = generateValidClashConstraint(clashRows, clashCols, bSize);

    localClashData = {
        type: 'local', 
        status: 'vsScreen',
        boardSize: bSize,     
        turnTime: turnTime,   
        p1: { nick: p1Nick, color: 'red' }, 
        p2: { nick: p2Nick, color: 'blue' },
        score: { p1: 0, p2: 0 }, 
        rows: clashRows, 
        cols: clashCols, 
        constraints: constraints,
        board: Array(bSize * bSize).fill(null), 
        guessedPlayers: Array(bSize * bSize).fill(null),
        turn: Math.random() < 0.5 ? 'red' : 'blue', 
        deadline: 0, 
        lastAction: ''
    };
    
    document.getElementById('clashLocalLobbyContainer').style.display = 'none';
    
    // Zbuduj strukturę w tle jeszcze ZANIM odpalisz główny mechanizm!
    buildDynamicClashGridHTML(bSize);
    
    updateLocalClashData({}); 
}

function updateLocalClashData(updates) {
    if (!isLocalClash) return;
    localClashData = { ...localClashData, ...updates }; 
    const data = localClashData;
    
    clashStatus = data.status; 
    clashTurn = data.turn; 
    clashBoardState = data.board;
    clashGuessedPlayers = data.guessedPlayers || []; 
    clashRows = data.rows; 
    clashCols = data.cols;

    // Przekierowanie statusów: najpierw vsScreen, potem coinToss, na końcu samo playing. 
    // Odłączamy tutaj zbędne renderowanie gridu, jeśli wciąż leci rzut monetą.
    if(clashStatus === 'vsScreen') {
        showVsScreen(data);
    } else if(clashStatus === 'coinToss') {
        playCoinToss(data);
    } else if(clashStatus === 'playing') {
        updateClashBoardUI(data);
    } else if(clashStatus === 'summary') {
        updateClashBoardUI(data); // Dla podglądu z wynikiem rysujemy
        if(document.getElementById('clashSummaryOverlay').style.display === 'none') {
            handleClashEnd(data);
        }
    }
}

// --- LOBBY TOWARZYSKIE ---
async function createClashRoom() {
    document.getElementById('clashLobbyError').style.display = 'none';
    const btn = document.querySelector('#clashLobbySelect .menu-btn.btn-green');
    btn.innerHTML = `<span class="btn-icon">⏳</span><span class="btn-text">TWORZENIE...</span>`; 
    btn.disabled = true;

    const code = generateRoomCode(); 
    myClashColor = 'red';
    
    let bSize = customClashSettings.size || 3;
    let turnTime = customClashSettings.turnTime || 120;
    
    let allClubs = getCleanClubsList();
    let validBoard = tryGenerateBoard(allClubs, 3, 500, bSize) || tryGenerateBoard(allClubs, 2, 300, bSize);
    
    if (!validBoard) { 
        // Fallback w razie zbyt drastycznego wycięcia klubów przez gracza
        const fbRows = ['unia leszno', 'stal gorzów wielkopolski', 'włókniarz częstochowa', 'sparta wrocław', 'apator toruń'];
        const fbCols = ['apator toruń', 'sparta wrocław', 'falubaz zielona góra', 'motor lublin', 'gkm grudziądz'];
        clashRows = fbRows.slice(0, bSize); 
        clashCols = fbCols.slice(0, bSize); 
    }

    let constraints = generateValidClashConstraint(clashRows, clashCols, bSize);

    try {
        await db.collection("clash_rooms").doc(code).set({
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'waiting', 
            type: 'friendly',
            p1: { id: playerId, nick: playerNickname, color: 'red' }, 
            p2: null,
            p1Ready: false, 
            p2Ready: false, 
            score: { p1: 0, p2: 0 },
            boardSize: bSize,       
            turnTime: turnTime,     
            rows: clashRows, 
            cols: clashCols, 
            constraints: constraints, 
            board: Array(bSize * bSize).fill(null), 
            guessedPlayers: Array(bSize * bSize).fill(null), 
            turn: 'red', 
            deadline: 0, 
            lastAction: '', 
            rematchP1: false, 
            rematchP2: false,
            coinTossWinner: null
        });

        currentClashRoom = code;
        document.getElementById('clashLobbySelect').style.display = 'none';
        document.getElementById('myRoomCodeDisplay').innerText = code;
        
        document.getElementById('waitingText').style.display = 'block';
        document.getElementById('readyPlayersDiv').style.display = 'none';
        
        const btnReady = document.getElementById('btnReady');
        btnReady.innerText = "JESTEM GOTÓW";
        btnReady.disabled = false;
        btnReady.style.background = "var(--accent)";
        
        document.getElementById('clashLobbyWaiting').style.display = 'block';
        
        btn.innerHTML = `<span class="btn-icon">🏠</span><span class="btn-text">UTWÓRZ POKÓJ (HOST)</span>`; 
        btn.disabled = false;
        listenToClashRoom();
        
    } catch(e) { 
        console.error(e);
        document.getElementById('clashLobbyError').innerText = "Błąd połączenia z serwerem."; 
        document.getElementById('clashLobbyError').style.display = 'block'; 
        btn.disabled = false; 
        btn.innerHTML = `<span class="btn-icon">🏠</span><span class="btn-text">UTWÓRZ POKÓJ (HOST)</span>`;
    }
}

async function joinClashRoom() {
    const input = document.getElementById('joinRoomInput').value.trim().toUpperCase();
    const errorEl = document.getElementById('clashLobbyError');
    if(input.length !== 5) { errorEl.innerText = "Kod musi mieć 5 liter!"; errorEl.style.display = 'block'; return; }

    try {
        const roomRef = db.collection("clash_rooms").doc(input); const doc = await roomRef.get();
        if(!doc.exists) { errorEl.innerText = "Nie znaleziono pokoju!"; errorEl.style.display = 'block'; return; }
        if(doc.data().p2 !== null) { errorEl.innerText = "Pokój jest pełny!"; errorEl.style.display = 'block'; return; }

        await roomRef.update({ p2: { id: playerId, nick: playerNickname, elo: userStats.clashLeague.elo, matchesPlayed: userStats.clashLeague.matchesPlayed, color: 'blue', club: userStats.favoriteClub || null } });
        myClashColor = 'blue'; currentClashRoom = input;
        
        document.getElementById('clashLobbySelect').style.display = 'none';
        document.getElementById('myRoomCodeDisplay').innerText = input;
        document.getElementById('waitingText').style.display = 'none';
        document.getElementById('readyPlayersDiv').style.display = 'flex';
        document.getElementById('btnReady').innerText = "JESTEM GOTÓW";
        document.getElementById('btnReady').disabled = false;
        document.getElementById('btnReady').style.background = "var(--accent)";
        document.getElementById('clashLobbyWaiting').style.display = 'block';
        
        listenToClashRoom();
    } catch(e) { errorEl.innerText = "Wystąpił błąd!"; errorEl.style.display = 'block'; }
}

async function toggleClashReady() {
    if (!currentClashRoom) return;
    let field = myClashColor === 'red' ? 'p1Ready' : 'p2Ready';
    await db.collection("clash_rooms").doc(currentClashRoom).update({ [field]: true });
    document.getElementById('btnReady').innerText = "OCZEKIWANIE...";
    document.getElementById('btnReady').disabled = true;
    document.getElementById('btnReady').style.background = "#555";
}

async function toggleClashRematch() {
    if (!currentClashRoom) return;
    let field = myClashColor === 'red' ? 'rematchP1' : 'rematchP2';
    await db.collection("clash_rooms").doc(currentClashRoom).update({ [field]: true });
    document.getElementById('btnRematch').innerHTML = `<span>CZEKANIE NA DRUGIEGO GRACZA...</span>`;
    document.getElementById('btnRematch').disabled = true;
    document.getElementById('btnRematch').style.background = "#555";
}

// ==============================================
// ====== SYSTEM EMOTEK (SZYBKI CZAT) ===========
// ==============================================
let lastProcessedEmoteP1 = 0;
let lastProcessedEmoteP2 = 0;

function sendClashEmote(emoji) {
    if (!currentClashRoom || isLocalClash) return;
    
    // Anty-Spam (max 1 emotka na sekundę)
    if (window.lastEmoteSentTime && Date.now() - window.lastEmoteSentTime < 1000) return;
    window.lastEmoteSentTime = Date.now();

    const emoteData = { emoji: emoji, ts: Date.now() };
    const fieldToUpdate = myClashColor === 'red' ? 'emoteP1' : 'emoteP2';

    db.collection("clash_rooms").doc(currentClashRoom).update({
        [fieldToUpdate]: emoteData
    }).catch(e => console.log("Błąd wysyłania emotki:", e));
}

function showFloatingEmote(emoji, playerColor) {
    const parentId = playerColor === 'red' ? 'clashPlayer1' : 'clashPlayer2';
    const parent = document.getElementById(parentId);
    if (!parent) return;

    const emoteEl = document.createElement('div');
    emoteEl.className = 'floating-emote';
    emoteEl.innerText = emoji;
    
    // Centrowanie nad nickiem gracza
    emoteEl.style.left = '50%';
    emoteEl.style.top = '-20px';

    parent.appendChild(emoteEl);

    // Dźwięk powiadomienia
    playSound('flip');

    setTimeout(() => {
        if (emoteEl.parentNode) emoteEl.parentNode.removeChild(emoteEl);
    }, 2500);
}

// --- SILNIK SIECIOWY GRY ---
function listenToClashRoom() {
    if(!currentClashRoom) return;
    
    clashUnsubscribe = db.collection("clash_rooms").doc(currentClashRoom).onSnapshot(doc => {
        if(!doc.exists) {
            appAlert("Przeciwnik zamknął pokój.", "Speedway Clash");
            closeRoomCleanup({ deleteRoom: false });
            return;
        }
        const data = doc.data();
        currentClashData = data;
        
        // ==========================================
        // 🚨 ZABEZPIECZENIE ANTI-ZOMBIE (BŁĄD WYŚCIGU)
        // ==========================================
        if (data.type === 'league') {
            if (myClashColor === 'red' && data.p1 && data.p1.id !== playerId) {
                console.warn("WYRZUCONO: Nie jestem już hostem tego pokoju.");
                closeRoomCleanup({ deleteRoom: false });
                return;
            }
            if (myClashColor === 'blue' && data.p2 && data.p2.id !== playerId) {
                console.warn("WYRZUCONO: Zostałem nadpisany przez innego gracza.");
                closeRoomCleanup({ deleteRoom: false });
                return;
            }
        }

        clashStatus = data.status; 
        clashTurn = data.turn; 
        clashBoardState = data.board;
        clashGuessedPlayers = data.guessedPlayers || []; 
        clashRows = data.rows; 
        clashCols = data.cols;

        let bSize = (data.board && data.board.length) ? Math.sqrt(data.board.length) : (data.boardSize || 3);
        if (!Number.isInteger(bSize)) bSize = 3;

        // Renderowanie nagłówków klubów (osi X i Y)
        for (let i = 0; i < bSize; i++) {
            const colHeader = document.getElementById(`col${i}`);
            if (colHeader && clashCols[i]) {
                let headerHTML = `${getClubAbbr(clashCols[i])}`;
                const consCountry = getConstraintCountry(data.constraints, i);
                if (consCountry) {
                    headerHTML += `<br><span style="color:var(--green-neon); font-size:9px;">[${consCountry}]</span>`;
                }
                colHeader.innerHTML = headerHTML;
            }
            const rowHeader = document.getElementById(`row${i}`);
            if (rowHeader && clashRows[i]) rowHeader.innerHTML = `${getClubAbbr(clashRows[i])}`;
        }

        // Aktualizacja ligi na zakończenie meczu
        if (data.status === 'summary' && data.type === 'league' && !window.hasUpdatedLeague) {
            updateLeagueStats(data);
        }

        if (clashStatus === 'waiting') {
            if (data.p2) {
                isSearchingLeague = false;
                
                // Pancerne chowanie okna szukania na PC i Telefonach
                ['clashMatchmakingOverlay', 'clashMatchmakingOverlayDesktop'].forEach(id => {
                    let el = document.getElementById(id);
                    if(el) { el.style.display = 'none'; el.style.opacity = '0'; }
                });

                const waitingText = document.getElementById('waitingText');
                if (waitingText) waitingText.style.display = 'none';
                const readyPlayersDiv = document.getElementById('readyPlayersDiv');
                if (readyPlayersDiv) readyPlayersDiv.style.display = 'flex';

                const p1ReadyStatus = document.getElementById('p1ReadyStatus');
                if (p1ReadyStatus) {
                    p1ReadyStatus.style.opacity = data.p1Ready ? '1' : '0.3';
                    p1ReadyStatus.innerText = data.p1Ready ? `🔴 ${data.p1.nick} (Gotowy)` : `🔴 ${data.p1.nick}`;
                }

                const p2ReadyStatus = document.getElementById('p2ReadyStatus');
                if (p2ReadyStatus) {
                    p2ReadyStatus.style.opacity = data.p2Ready ? '1' : '0.3';
                    p2ReadyStatus.innerText = data.p2Ready ? `🔵 ${data.p2.nick} (Gotowy)` : `🔵 ${data.p2.nick}`;
                }

                // HOST LOGIC (zabezpieczenie przed dublowaniem wysyłki vsScreen)
                if (data.type === 'league' && myClashColor === 'red' && !window.vsScreenTriggered) {
                    window.vsScreenTriggered = true; 
                    db.collection("clash_rooms").doc(currentClashRoom).update({ status: 'vsScreen' });
                    if (data.queueId) db.collection("clash_queue").doc(data.queueId).delete().catch(() => {});
                }

                // Gość (Niebieski) w Lidze również MUSI przejść ekran VS, w przeciwnym razie utknie w Lobby!
                if (data.type === 'league' && myClashColor === 'blue' && !window.vsScreenTriggered) {
                    window.vsScreenTriggered = true; 
                }

                // Standardowy Matchmaking (Gra towarzyska - wymaga wciśnięcia GOTOWY)
                if (data.type !== 'league' && myClashColor === 'red' && data.p1Ready && data.p2Ready && !window.vsScreenTriggered) {
                    window.vsScreenTriggered = true;
                    db.collection("clash_rooms").doc(currentClashRoom).update({ status: 'vsScreen' });
                }
            }
        }

        if (clashStatus === 'summary') {
            let readys = 0; if(data.rematchP1) readys++; if(data.rematchP2) readys++;
            const rematchCount = document.getElementById('rematchCount');
            if(rematchCount) rematchCount.innerText = `(${readys}/2)`;
            
            if (myClashColor === 'red' && data.rematchP1 && data.rematchP2) {
                window.lastRenderedClashStatus = null; // Resetujemy dla rewanżu
                window.vsScreenTriggered = false;
                
                let allClubs = getCleanClubsList();
                let validBoard = tryGenerateBoard(allClubs, 3, 500) || tryGenerateBoard(allClubs, 2, 300);
                if (!validBoard) { clashRows = ['unia leszno', 'stal gorzów', 'włókniarz częstochowa']; clashCols = ['apator toruń', 'sparta wrocław', 'falubaz zielona góra']; }
                
                let constraints = generateValidClashConstraint(clashRows, clashCols, bSize); 
                let newBSize = (data.board && data.board.length) ? Math.sqrt(data.board.length) : (data.boardSize || 3);
                if (!Number.isInteger(newBSize)) newBSize = 3;

                db.collection("clash_rooms").doc(currentClashRoom).update({
                    status: 'vsScreen', turn: Math.random() < 0.5 ? 'red' : 'blue',
                    board: Array(newBSize * newBSize).fill(null), guessedPlayers: Array(newBSize * newBSize).fill(null), lastAction: '',
                    rows: clashRows, cols: clashCols, constraints: constraints, rematchP1: false, rematchP2: false 
                });
            }
        }

        // ==========================================================
        // RYSOWANIE PLANSZY
        // ==========================================================
        if (clashStatus === 'playing' || clashStatus === 'summary') {
            updateClashBoardUI(data); 
        }

        // Odpalamy okna animowane i przejścia ekranów tylko RAZ
        if (clashStatus !== window.lastRenderedClashStatus) {
            window.lastRenderedClashStatus = clashStatus; 
            
            if(clashStatus === 'vsScreen') showVsScreen(data);
            if(clashStatus === 'coinToss') playCoinToss(data);
            
            // Logika końca gry
            if(clashStatus === 'summary') {
                const summaryOverlay = document.getElementById('clashSummaryOverlay');
                if (summaryOverlay && summaryOverlay.style.display === 'none') {
                    // Lekkie 500ms opóźnienie
                    setTimeout(() => { handleClashEnd(data); }, 500);
                }
            }
        }

        // ==========================================================
        // ODBIERANIE I WYSWIETLANIE EMOTEK
        // ==========================================================
        if (data.emoteP1 && data.emoteP1.ts > lastProcessedEmoteP1) {
            lastProcessedEmoteP1 = data.emoteP1.ts;
            showFloatingEmote(data.emoteP1.emoji, 'red');
        }
        if (data.emoteP2 && data.emoteP2.ts > lastProcessedEmoteP2) {
            lastProcessedEmoteP2 = data.emoteP2.ts;
            showFloatingEmote(data.emoteP2.emoji, 'blue');
        }

    });
}

// NOWA FUNKCJA: Anulowanie wyszukiwania przez gracza
async function cancelLeagueMatchmaking() {
    const overlay = document.getElementById('clashMatchmakingOverlay');
    if(overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 300);
    }
    
    // JEŚLI GRA JUŻ TRWA (isSearchingLeague == false) TO NIE WYŁĄCZAJ POKOJU, TYLKO UKRYJ EKRAN
    if (!isSearchingLeague) {
        return; 
    }

    isSearchingLeague = false;
    
    // Jeśli zamykamy przed znalezieniem: Usuwamy nasze śmieci z bazy (pokój i kolejkę)
    if (currentQueueId) {
        await db.collection("clash_queue").doc(currentQueueId).delete().catch(()=>{});
        currentQueueId = null;
    }
    if (currentClashRoom) {
        await db.collection("clash_rooms").doc(currentClashRoom).delete().catch(()=>{});
        currentClashRoom = null;
    }
    if(clashUnsubscribe) { clashUnsubscribe(); clashUnsubscribe = null; }
    
    showToast("Wyszukiwanie przerwane.", "normal");
}

function showVsScreen(data) {
    if (data.type === 'league') window.hasUpdatedLeague = false;
    
    isSearchingLeague = false; 
    
    // Delikatne chowanie okien (bez psucia widoczności planszy)
    ['clashMatchmakingOverlay', 'clashMatchmakingOverlayDesktop', 'clashSummaryOverlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.opacity = '0'; setTimeout(() => el.style.display = 'none', 300); }
    });

    ['clashModeSelectContainer', 'clashLobbyContainer', 'clashContainer', 'mainMenuContainer', 'desktopMainMenu'].forEach(id => {
        setElementDisplay(id, 'none');
    });

    const vsOverlay = document.getElementById('clashVsOverlay');
    
    let p1NickHTML = data.p1.nick + getMiniClubBadge(data.p1.club); 
    let p2NickHTML = data.p2.nick + getMiniClubBadge(data.p2.club);
    
    if (data.type === 'league') {
        const p1RankImg = getLeagueImageTag(data.p1.elo, data.p1.matchesPlayed || 5, 24);
        const p2RankImg = getLeagueImageTag(data.p2.elo, data.p2.matchesPlayed || 5, 24);
        p1NickHTML = `${p1RankImg} ${p1NickHTML}`; 
        p2NickHTML = `${p2RankImg} ${p2NickHTML}`;
    }

    document.getElementById('vsP1Name').innerHTML = p1NickHTML; 
    document.getElementById('vsP2Name').innerHTML = p2NickHTML;
    document.getElementById('cp1Nick').innerHTML = p1NickHTML; 
    document.getElementById('cp2Nick').innerHTML = p2NickHTML;

    let opponentNick = myClashColor === 'red' ? data.p2.nick : data.p1.nick;
    let myWins = 0;
    let oppWins = 0;
    
    // Szukamy w lokalnej historii gracza meczów z tym rywalem
    if (userStats.clashHistory) {
        userStats.clashHistory.forEach(match => {
            if (match.opponent === opponentNick) {
                if (match.result.includes('WYGRANA')) myWins++;
                if (match.result.includes('PORAŻKA')) oppWins++;
            }
        });
    }

    const h2hContainer = document.getElementById('vsH2HStats');
    const h2hScore = document.getElementById('vsH2HScore');
    
    if (myWins > 0 || oppWins > 0) {
        // Ustawiamy kolory zalezne od tego, czy gracz jest P1(red) czy P2(blue)
        if (myClashColor === 'red') {
            h2hScore.innerHTML = `<span style="color:#ff3333">${myWins}</span> : <span style="color:#3399ff">${oppWins}</span>`;
        } else {
            h2hScore.innerHTML = `<span style="color:#ff3333">${oppWins}</span> : <span style="color:#3399ff">${myWins}</span>`;
        }
        h2hContainer.style.display = 'block';
    } else {
        h2hContainer.style.display = 'none'; // Pierwszy mecz
    }

    vsOverlay.style.display = 'block'; setTimeout(() => vsOverlay.style.opacity = '1', 10); playSound('win');

    if(!isLocalClash && myClashColor === 'red') {
        const coinTossWinner = Math.random() < 0.5 ? 'red' : 'blue';
        setTimeout(() => { db.collection("clash_rooms").doc(currentClashRoom).update({ status: 'coinToss', coinTossWinner }); }, 3000);
    } else if (isLocalClash) {
        const coinTossWinner = data.turn;
        setTimeout(() => { updateLocalClashData({ status: 'coinToss', coinTossWinner }); }, 3000);
    }
}
// --- NOWA FUNKCJA: WYSYŁANIE EMOTEK ---
function sendClashEmote(emoji) {
    if (!currentClashRoom || isLocalClash) return;
    
    // Anty-Spam (max 1 emotka na sekundę)
    if (window.lastEmoteSentTime && Date.now() - window.lastEmoteSentTime < 1000) return;
    window.lastEmoteSentTime = Date.now();

    const emoteData = { emoji: emoji, ts: Date.now() };
    const fieldToUpdate = myClashColor === 'red' ? 'emoteP1' : 'emoteP2';

    db.collection("clash_rooms").doc(currentClashRoom).update({
        [fieldToUpdate]: emoteData
    }).catch(e => console.log("Błąd wysyłania emotki:", e));
}


function showFloatingEmote(emoji, playerColor) {
    const parentId = playerColor === 'red' ? 'clashPlayer1' : 'clashPlayer2';
    const parent = document.getElementById(parentId);
    if (!parent) return;

    const emoteEl = document.createElement('div');
    emoteEl.className = 'floating-emote';
    emoteEl.innerText = emoji;
    
    // Centrowanie nad nickiem gracza
    emoteEl.style.left = '50%';
    emoteEl.style.top = '-20px';

    parent.appendChild(emoteEl);

    // Dźwięk powiadomienia ("pyk")
    playSound('flip');

    setTimeout(() => {
        if (emoteEl.parentNode) emoteEl.parentNode.removeChild(emoteEl);
    }, 2500);
}


function playCoinToss(data) {
    const vsOverlay = document.getElementById('clashVsOverlay'); vsOverlay.style.opacity = '0'; setTimeout(() => vsOverlay.style.display = 'none', 300);
    const overlay = document.getElementById('coinTossOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    const coin = document.getElementById('clashCoinInner'); const resText = document.getElementById('coinTossResult'); resText.style.opacity = '0'; resText.innerText = "";
    
    const winner = data.coinTossWinner || (Math.random() < 0.5 ? 'red' : 'blue');
    let isRed = winner === 'red'; let rotations = 5 * 360 + (isRed ? 0 : 180); 
    coin.style.transition = 'none'; coin.style.transform = `rotateY(0deg)`;
    setTimeout(() => { playSound('flip'); coin.style.transition = 'transform 3s cubic-bezier(0.1, 0.8, 0.2, 1)'; coin.style.transform = `rotateY(${rotations}deg)`; }, 50);
    
    setTimeout(() => {
        resText.innerText = isRed ? `ZACZYNA ${data.p1.nick} (🔴)` : `ZACZYNA ${data.p2.nick} (🔵)`;
        resText.style.color = isRed ? "#ff3333" : "#3399ff"; resText.style.opacity = '1'; playSound(isRed ? 'win' : 'guess');
        
        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.style.display = 'none';
                if(!isLocalClash && myClashColor === 'red') {
                    db.collection("clash_rooms").doc(currentClashRoom).update({ status: 'playing', turn: winner, deadline: Date.now() + 120000, lastAction: '' });
                } else if (isLocalClash) {
                    updateLocalClashData({ status: 'playing', turn: winner, deadline: Date.now() + 120000, lastAction: '' });
                }
            }, 300);
        }, 2500);
    }, 3000);
}

function updateClashBoardUI(data) {
    const clashContainer = document.getElementById('clashContainer');
    if (!clashContainer) return;

    if (clashStatus !== 'viewing') {
        setElementDisplay('mainMenuContainer', 'none');
        setElementDisplay('gameContainer', 'none');
        setElementDisplay('clashModeSelectContainer', 'none');
        setElementDisplay('clashLobbyContainer', 'none');
        setElementDisplay('clashContainer', 'block');
    }
    
    closeClashSearch();

    let bSize = (data.board && data.board.length) ? Math.sqrt(data.board.length) : (data.boardSize || 3);
    if (!Number.isInteger(bSize)) bSize = 3;

    if (!buildDynamicClashGridHTML(bSize)) {
        console.error('Critical error: Could not build Clash Grid HTML.');
        return;
    }

    for (let r = 0; r < bSize; r++) {
        for (let c = 0; c < bSize; c++) {
            let idx = r * bSize + c;
            let cell = document.getElementById(`cell-${r}-${c}`);
            if (!cell) {
                console.warn(`Skrypt nie znalazł cell-${r}-${c}.`);
                continue;
            }

            let val = data.board[idx];
            if (val === 'red' || val === 'blue') {
                cell.className = `clash-cell clash-playable claimed-${val}`;
                let playerName = (data.guessedPlayers && data.guessedPlayers[idx]) || "Gracz";
                cell.innerHTML = `<span class="clash-player-name">${playerName}</span>`;
            } else {
                cell.className = 'clash-cell clash-playable';
                cell.innerHTML = '<span style="opacity: 0.1; font-size: 24px;">+</span>';
            }
        }
    }

    for (let i = 0; i < bSize; i++) {
        const colHeader = document.getElementById(`col${i}`);
        if (colHeader && clashCols[i]) {
            let headerHTML = `${getClubAbbr(clashCols[i])}`;
            const consCountry = getConstraintCountry(data.constraints, i);
            if (consCountry) {
                headerHTML += `<br><span style="color:var(--green-neon); font-size:9px;">[${consCountry}]</span>`;
            }
            colHeader.innerHTML = headerHTML;
        }

        const rowHeader = document.getElementById(`row${i}`);
        if (rowHeader && clashRows[i]) {
            rowHeader.innerHTML = `${getClubAbbr(clashRows[i])}`;
        }
    }

    updateClashTurnUI();
    
    if (clashStatus === 'viewing' || clashStatus === 'summary') {
        document.getElementById('clashTimerDisplay').innerText = "KONIEC MECZU";
        document.getElementById('clashTimerDisplay').style.color = "var(--text-dim)";
        if(clashTimerInterval) clearInterval(clashTimerInterval);
        return; 
    }

    if(clashTurn === myClashColor || isLocalClash) { 
        document.getElementById('clashTimerDisplay').style.color = '#00ff66'; 
        if (isLocalClash || (window.lastTurnColor !== clashTurn)) {
            playSound('flip');
            window.lastTurnColor = clashTurn;
        }
    } else { 
        document.getElementById('clashTimerDisplay').style.color = '#fff'; 
    }

    if(data.lastAction && data.lastAction !== '' && (data.turn === myClashColor || isLocalClash)) {
        setTimeout(() => showToast(`Błąd rywala: ${data.lastAction}! Twoja kolej!`, "success"), 200);
        if (isLocalClash) {
            localClashData.lastAction = '';
        } else {
            db.collection("clash_rooms").doc(currentClashRoom).update({ lastAction: '' });
        }
    } else if (data.turn === myClashColor && clashStatus === 'playing' && window.lastTurnColor !== clashTurn) {
        showToast("TWÓJ RUCH!", "normal");
    }

    startClashTimer(data.deadline);
}

let lastHeartbeatSecond = -1; // Zmienna zapobiegająca nakładaniu się dźwięku

function startClashTimer(deadlineTime) {
    if(clashTimerInterval) clearInterval(clashTimerInterval);
    const display = document.getElementById('clashTimerDisplay');
    if(!display) return;

    function tick() {
        let now = Date.now(); 
        let diff = deadlineTime - now;
        
        if (diff <= 0) {
            clearInterval(clashTimerInterval); 
            display.innerText = "00:00"; 
            display.style.color = "var(--red-neon)";
            
            if(clashStatus === 'playing') {
                if(isLocalClash || clashTurn === myClashColor) {
                    // 1. Normalna sytuacja: Gracz, którego jest tura, sam oddaje kolejkę
                    skipClashTurn("Koniec czasu!");
                } else {
                    // 2. ZABEZPIECZENIE (AFK): Jeśli to tura przeciwnika, a on wyszedł z gry 
                    // (lub ma laga), czekamy 1.5 sekundy. Jeśli status w bazie się nie zmienił, 
                    // MY (gracz oczekujący) wymuszamy zmianę tury!
                    setTimeout(() => {
                        if (clashStatus === 'playing' && clashTurn !== myClashColor) {
                            skipClashTurn("Przeciwnik AFK (Koniec czasu)");
                        }
                    }, 1500);
                }
            }
            return;
        }
        
        let totalSeconds = Math.floor(diff / 1000); 
        let m = Math.floor(totalSeconds / 60).toString().padStart(2, '0'); 
        let s = (totalSeconds % 60).toString().padStart(2, '0');
        display.innerText = `${m}:${s}`;
        
        // BICIE SERCA PONIZEJ 10 SEKUND
        if(totalSeconds <= 10 && (clashTurn === myClashColor || isLocalClash)) { 
            display.style.color = "var(--red-neon)"; 
            if (lastHeartbeatSecond !== totalSeconds) {
                playSound('heartbeat'); 
                lastHeartbeatSecond = totalSeconds;
            }
        } else { 
            display.style.color = "#fff"; 
        }
    }

    tick(); // Wywołanie natychmiastowe, żeby nie było sekundy opóźnienia
    clashTimerInterval = setInterval(tick, 1000);
}

function handleClashCell(r, c) {
    if (!isLocalClash && clashTurn !== myClashColor) { showToast("Czekaj na swoją kolej!", "error"); return; }
    
    let bSize = (currentClashData && currentClashData.boardSize) || (localClashData && localClashData.boardSize) || 3;
    let idx = r * bSize + c; 
    
    if(clashBoardState[idx] !== null) { showToast("To pole jest już zajęte!", "error"); return; }
    
    clashActiveCellIdx = idx;
    document.getElementById('clashSearchDesc').innerText = `${getClubAbbr(clashRows[r])} 🤝 ${getClubAbbr(clashCols[c])}`;
    document.getElementById('clashGuessInput').value = ''; setupClashAutocomplete();

    const overlay = document.getElementById('clashSearchOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}
function closeClashSearch() { 
    const overlay = document.getElementById('clashSearchOverlay'); 
    if(overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300); } 
}

function setupClashAutocomplete() {
    const oldInput = document.getElementById('clashGuessInput'); const newInput = oldInput.cloneNode(true); oldInput.replaceWith(newInput); 
    newInput.addEventListener('input', function() {
        let val = this.value; closeAllLists(); if (!val || val.length < 2) return;
        let listContainer = document.createElement("DIV"); listContainer.setAttribute("class", "autocomplete-items"); this.parentNode.appendChild(listContainer);
        let valClean = removePolishAccents(val.toLowerCase());
        playersDB.forEach(player => {
            if (clashGuessedPlayers.includes(player.name)) return;
            if (removePolishAccents(player.name.toLowerCase()).includes(valClean)) {
                let item = document.createElement("DIV"); item.innerHTML = player.name;
                item.addEventListener("click", () => { newInput.value = player.name; closeAllLists(); }); listContainer.appendChild(item);
            }
        });
    });
}
async function submitClashGuess() {
    let input = document.getElementById('clashGuessInput').value.trim(); if(!input) return;
    const player = playersDB.find(p => p.name.toLowerCase() === input.toLowerCase());

    if(!player || clashGuessedPlayers.includes(player.name)) { showToast("Zawodnik nie istnieje lub został podany!", "error"); return; }

    const roomData = isLocalClash ? localClashData : await db.collection("clash_rooms").doc(currentClashRoom).get().then(doc => doc.data());

    let bSize = roomData.boardSize || 3;
    let r = Math.floor(clashActiveCellIdx / bSize); let c = clashActiveCellIdx % bSize;

    const reqCountry = getConstraintCountry(roomData.constraints, c);
    if (reqCountry) {
        const pCountries = player.country.split("/").map(s => s.trim());
        if (!pCountries.includes(reqCountry)) {
            playSound('error');
            showToast(`BŁĄD! Ta kolumna wymaga zawodnika z kraju: ${reqCountry.toUpperCase()}`, "error");
            skipClashTurn("Zły kraj zawodnika");
            closeClashSearch();
            return;
        }
    }

    let rClub = clashRows[r]; let cClub = clashCols[c];
    let pClubs = player.pastClubs.map(pc => getCleanClubName(pc).toLowerCase());
    if (player.currentClub) pClubs.push(getCleanClubName(player.currentClub).toLowerCase());

    if (pClubs.includes(rClub) && pClubs.includes(cClub)) {
        executeValidClashMove(player.name);
    } else {
        playSound('error'); closeClashSearch(); 
        showToast(`Pudło! ${player.name} nie jeździł w obu tych klubach.`, "error"); 
        skipClashTurn("Błędna odpowiedź");
    }
}

function checkWinCondition(board, color, size = 3) {
    // 3 w rzędzie dla 3x3, 4 w rzędzie dla 4x4 i 5x5
    const winNeeded = size === 3 ? 3 : 4; 
    
    const checkDirection = (startR, startC, dR, dC) => {
        let count = 0;
        for (let i = 0; i < winNeeded; i++) {
            let r = startR + i * dR;
            let c = startC + i * dC;
            if (r >= 0 && r < size && c >= 0 && c < size) {
                if (board[r * size + c] === color) count++;
                else break;
            }
        }
        return count === winNeeded;
    };

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (board[r * size + c] === color) {
                // Sprawdzamy poziomo, pionowo i na dwa skosy
                if (checkDirection(r, c, 0, 1) || 
                    checkDirection(r, c, 1, 0) || 
                    checkDirection(r, c, 1, 1) || 
                    checkDirection(r, c, 1, -1)) {
                    return true;
                }
            }
        }
    }
    return false;
}

async function executeValidClashMove(playerName) {
    let turnColor = isLocalClash ? clashTurn : myClashColor;
    let newBoard = [...clashBoardState]; 
    newBoard[clashActiveCellIdx] = turnColor;
    
    // Obliczanie bSize dynamicznie dla ochrony przed starymi danymi
    let bSize = (isLocalClash ? localClashData.board : currentClashData.board) ? Math.sqrt(isLocalClash ? localClashData.board.length : currentClashData.board.length) : 3;
    let turnTime = (isLocalClash ? localClashData.turnTime : currentClashData.turnTime) || 120;
    
    let newGuessed = clashGuessedPlayers.length === (bSize * bSize) ? [...clashGuessedPlayers] : Array(bSize * bSize).fill(null);
    newGuessed[clashActiveCellIdx] = playerName;

    closeClashSearch(); 
    playSound('guess');
    let nextTurn = turnColor === 'red' ? 'blue' : 'red';

    let gameStatus = 'playing';
    let winnerObj = null;

    if (checkWinCondition(newBoard, turnColor, bSize)) {
        gameStatus = 'summary';
        winnerObj = turnColor;
    } 
    else if (!newBoard.includes(null)) {
        gameStatus = 'summary';
        let redCount = newBoard.filter(color => color === 'red').length;
        let blueCount = newBoard.filter(color => color === 'blue').length;

        if (redCount > blueCount) {
            winnerObj = 'red';
        } else if (blueCount > redCount) {
            winnerObj = 'blue';
        } else {
            winnerObj = 'draw'; 
        }
    }

    let nextDeadline = Date.now() + (turnTime * 1000);

    if (gameStatus === 'summary') {
        if(isLocalClash) {
            let p1Score = localClashData.score.p1;
            let p2Score = localClashData.score.p2;
            if (winnerObj === 'red') p1Score += 1;
            if (winnerObj === 'blue') p2Score += 1;
            
            updateLocalClashData({ board: newBoard, guessedPlayers: newGuessed, status: 'summary', winner: winnerObj, score: {p1: p1Score, p2: p2Score} });
        } else {
            let field = winnerObj === 'red' ? 'score.p1' : (winnerObj === 'blue' ? 'score.p2' : null);
            let updatePayload = { board: newBoard, guessedPlayers: newGuessed, status: 'summary', winner: winnerObj };
            if (field) updatePayload[field] = firebase.firestore.FieldValue.increment(1);
            
            await db.collection("clash_rooms").doc(currentClashRoom).update(updatePayload);
        }
    } else {
        if(isLocalClash) {
            updateLocalClashData({ board: newBoard, guessedPlayers: newGuessed, turn: nextTurn, deadline: nextDeadline, lastAction: '' });
        } else {
            await db.collection("clash_rooms").doc(currentClashRoom).update({ board: newBoard, guessedPlayers: newGuessed, turn: nextTurn, deadline: nextDeadline, lastAction: '' });
        }
    }
}

function skipClashTurn(reason) { 
    let nextTurn = clashTurn === 'red' ? 'blue' : 'red';
    let turnTime = (isLocalClash ? localClashData.turnTime : (currentClashData ? currentClashData.turnTime : 120)) || 120;
    let nextDeadline = Date.now() + (turnTime * 1000);

    if (isLocalClash) {
        updateLocalClashData({ turn: nextTurn, deadline: nextDeadline, lastAction: reason });
    } else {
        db.collection("clash_rooms").doc(currentClashRoom).update({ turn: nextTurn, deadline: nextDeadline, lastAction: reason }); 
    }
}

// --- PODGLĄD PLANSZY PO MECZU ---
function viewClashBoard() {
    // 1. Chowamy overlay podsumowania
    const overlay = document.getElementById('clashSummaryOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 300);
    }
    
    // 2. Chcemy uniknąć możliwości klikania i zgadywania przez gracza w podglądzie
    clashStatus = 'viewing'; 
    clashTurn = 'none'; // Zerujemy turę, żeby nic się nie świeciło (poza wynikiem gry)
    
    // 3. Pokazujemy ładny napis informujący, że to tylko podgląd
    document.getElementById('clashTimerDisplay').innerText = "KONIEC MECZU";
    document.getElementById('clashTimerDisplay').style.color = "var(--text-dim)";
}

// Globalny eksport (dla onclick w HTML)
try { window.viewClashBoard = viewClashBoard; } catch (e) {}

function handleClashEnd(data) {
    if(clashTimerInterval) clearInterval(clashTimerInterval);
    
    const overlay = document.getElementById('clashSummaryOverlay');
    const title = document.getElementById('clashSummaryTitle');
    
    if(data.winner === 'draw') {
        title.innerText = "REMIS!"; title.style.color = "#fff"; playSound('lose');
    } else {
        let isRedWin = data.winner === 'red';
        if (data.finishReason === 'surrender') {
            title.innerText = isRedWin ? `WALKOWER DLA ${data.p1.nick} 🔴` : `WALKOWER DLA ${data.p2.nick} 🔵`;
        } else {
            title.innerText = isRedWin ? `WYGRYWA ${data.p1.nick} 🔴` : `WYGRYWA ${data.p2.nick} 🔵`;
        }
        title.style.color = isRedWin ? "#ff3333" : "#3399ff";
        if(isLocalClash || data.winner === myClashColor) { playSound('win'); launchConfetti(); } else { playSound('lose'); }
    }
    
    document.getElementById('summaryP1Name').innerText = data.p1.nick;
    document.getElementById('summaryP2Name').innerText = data.p2.nick;
    document.getElementById('summaryScore').innerText = `${data.score.p1} : ${data.score.p2}`;
    
    const btnRematch = document.getElementById('btnRematch');
    if (data.type === 'league') {
        btnRematch.style.display = 'none';
    } else if (isLocalClash) {
        btnRematch.style.display = 'block';
        btnRematch.innerHTML = `<span>ZAGRAJ REWANŻ</span>`;
        btnRematch.disabled = false;
        btnRematch.style.background = "var(--accent)";
        btnRematch.onclick = () => {
             let allClubs = getCleanClubsList();
             let validBoard = tryGenerateBoard(allClubs, 3, 500) || tryGenerateBoard(allClubs, 2, 300);
             if (!validBoard) { clashRows = ['unia leszno', 'stal gorzów', 'włókniarz częstochowa']; clashCols = ['apator toruń', 'sparta wrocław', 'falubaz zielona góra']; }
             let constraints = generateValidClashConstraint(clashRows, clashCols, bSize);
             let bSize = (localClashData && localClashData.boardSize) || 3;
             updateLocalClashData({
                 status: 'vsScreen', turn: Math.random() < 0.5 ? 'red' : 'blue',
                 board: Array(bSize * bSize).fill(null), guessedPlayers: Array(bSize * bSize).fill(null), lastAction: '',
                 rows: clashRows, cols: clashCols, constraints: constraints
             });
        };
    } else {
        btnRematch.style.display = 'block';
        btnRematch.innerHTML = `<span id="rematchText">ZAGRAJ REWANŻ</span> <span id="rematchCount">(0/2 gotowych)</span>`;
        btnRematch.disabled = false;
        btnRematch.style.background = "var(--accent)";
        btnRematch.onclick = toggleClashRematch;
    }
    
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}

async function leaveClashRoom() {
    if (clashLeaveInProgress) return;

    if (isLocalClash) {
        const confirmed = await appConfirm("Wyjście zamknie aktualny mecz lokalny.\nCzy na pewno chcesz wyjść?", { title: "Zakończyć mecz?", confirmText: "ZAKOŃCZ", danger: true });
        if (confirmed) closeRoomCleanup();
        return;
    }

    const data = currentClashData;
    const activeMatch = isActiveClashStatus(clashStatus);
    const isLeagueMatch = data?.type === 'league' && hasBothClashPlayers(data);

    if (activeMatch && isLeagueMatch) {
        const confirmed = await appConfirm(
            "Poddasz mecz ligowy walkowerem.\nTy otrzymasz porażkę i ujemne ELO, a przeciwnik dostanie wygraną oraz nagrodę ELO.\nCzy na pewno chcesz poddać mecz?",
            { title: "Potwierdź poddanie", confirmText: "PODDAJ MECZ", danger: true }
        );
        if (!confirmed) return;
        clashLeaveInProgress = true;
        try { await submitLeagueSurrender(data); } catch (e) { appAlert("Błąd przy poddawaniu.", "Błąd"); } finally { clashLeaveInProgress = false; }
        return;
    }

    if (activeMatch) {
        const confirmed = await appConfirm("Wyjście zamknie aktualny pokój dla obu graczy.\nCzy na pewno chcesz wyjść?", { title: "Opuścić mecz?", confirmText: "WYJDŹ", danger: true });
        if (!confirmed) return;
    }

    await closeRoomCleanup();
}

async function closeRoomCleanup(options = {}) {
    window.lastRenderedClashStatus = null; // <--- DODAJ TO
    window.vsScreenTriggered = false; 

    const roomId = currentClashRoom;
    const queueId = currentQueueId || currentClashData?.queueId;
    const roomData = currentClashData;
    const deleteRoom = options.deleteRoom !== false;

    if(clashUnsubscribe) { clashUnsubscribe(); clashUnsubscribe = null; }
    if(clashTimerInterval) { clearInterval(clashTimerInterval); clashTimerInterval = null; }

    currentClashRoom = null; currentQueueId = null; currentClashData = null; isSearchingLeague = false;
    isLocalClash = false; localClashData = null; // Reset trybu lokalnego
    
    const btn = document.getElementById('btnLeagueMode');
    if (btn) resetLeagueButton(btn);

    if (roomId && deleteRoom && roomId !== 'LOCAL') {
        try {
            const isLeagueSummary = roomData?.type === 'league' && roomData?.status === 'summary';
            if (isLeagueSummary) {
                const leftField = myClashColor === 'red' ? 'p1Left' : 'p2Left';
                const opponentAlreadyLeft = myClashColor === 'red' ? roomData.p2Left : roomData.p1Left;
                if (opponentAlreadyLeft) await db.collection("clash_rooms").doc(roomId).delete();
                else await db.collection("clash_rooms").doc(roomId).update({ [leftField]: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            } else { await db.collection("clash_rooms").doc(roomId).delete(); }
        } catch(e) {}
    }

    if(queueId) db.collection("clash_queue").doc(queueId).delete().catch(()=>{});

    myClashColor = null;
    document.getElementById('clashSummaryOverlay').style.display = 'none';
    document.getElementById('clashVsOverlay').style.display = 'none';
    document.getElementById('coinTossOverlay').style.display = 'none';
    document.getElementById('clashSearchOverlay').style.display = 'none';
    showClashModeView();
}

function renderLeagueHistory() {
    const container = document.getElementById('lastLeagueContainer');
    const list = document.getElementById('lastLeagueList');
    
    if (container && list && userStats.clashHistory && userStats.clashHistory.length > 0) {
        container.style.display = 'block'; list.innerHTML = '';
        const recent = userStats.clashHistory.slice(0, 5).reverse(); 
        
        recent.forEach(match => {
            const tile = document.createElement('div');
            let cls = 'loss';
            if(match.result && match.result.includes('WYGRANA')) cls = 'win';
            if(match.result && match.result.includes('REMIS')) cls = 'draw'; 
            tile.className = `daily-tile ${cls}`;
            tile.title = `${match.opponent} (${match.change >= 0 ? '+'+match.change : match.change})`;
            list.appendChild(tile);
        });
    }
}

function openClashHistory() {
    const listEl = document.getElementById('clashHistoryList'); listEl.innerHTML = '';
    
    if (!userStats.clashHistory || userStats.clashHistory.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; color:var(--text-dim);">Brak rozegranych meczów.</div>';
    } else {
        userStats.clashHistory.forEach(match => {
            let color = match.result && match.result.includes('WYGRANA') ? 'var(--green-neon)' : (match.result && match.result.includes('REMIS') ? 'var(--yellow-neon)' : 'var(--red-neon)');
            listEl.innerHTML += `
                <div style="background: rgba(0,0,0,0.2); padding: 10px; margin-bottom: 8px; border-radius: 8px; border-left: 4px solid ${color};">
                    <div style="display:flex; justify-content: space-between; margin-bottom: 5px;">
                        <strong>VS ${match.opponent}</strong>
                        <span style="color: var(--text-dim); font-size: 11px;">${match.date}</span>
                    </div>
                    <div style="display:flex; justify-content: space-between; font-weight: bold; color: ${color};">
                        <span>${match.result}</span>
                        <span>${match.change >= 0 ? '+' : ''}${match.change} ELO</span>
                    </div>
                </div>
            `;
        });
    }
    
    const overlay = document.getElementById('clashHistoryOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeClashHistory() {
    const overlay = document.getElementById('clashHistoryOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
}

// Zmieniona funkcja pobierania klubów uwzględniająca nowy filterMode
function getCleanClubsList() {
    let clubs = new Set();

    if (customClashSettings.filterMode === 'leagues') {
        const allowedExt = customClashSettings.leagues.ext ? LEAGUES_DB.ext.map(c => c.toLowerCase()) : [];
        const allowedM2e = customClashSettings.leagues.m2e ? LEAGUES_DB.m2e.map(c => c.toLowerCase()) : [];
        const allowedKlz = customClashSettings.leagues.klz ? LEAGUES_DB.klz.map(c => c.toLowerCase()) : [];
        const allAllowedStandard = [...allowedExt, ...allowedM2e, ...allowedKlz];

        playersDB.forEach(p => {
            p.pastClubs.forEach(c => {
                let clean = getCleanClubName(c).toLowerCase();
                let isStandard = allAllowedStandard.includes(clean);
                if (isStandard || (customClashSettings.leagues.other && !isStandard)) clubs.add(clean);
            });
            if (p.currentClub) {
                let clean = getCleanClubName(p.currentClub).toLowerCase();
                let isStandard = allAllowedStandard.includes(clean);
                if (isStandard || (customClashSettings.leagues.other && !isStandard)) clubs.add(clean);
            }
        });
    } else {
        // Mode 'clubs' - bierzemy wszystko co NIE jest w excludedClubs
        playersDB.forEach(p => { 
            p.pastClubs.forEach(c => {
                let clean = getCleanClubName(c).toLowerCase();
                if (!customClashSettings.excludedClubs.includes(clean)) clubs.add(clean);
            }); 
            if (p.currentClub) {
                let clean = getCleanClubName(p.currentClub).toLowerCase();
                if (!customClashSettings.excludedClubs.includes(clean)) clubs.add(clean);
            }
        });
    }

    ['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery', 'aresztowanie'].forEach(c => clubs.delete(c)); 
    return Array.from(clubs);
}

function tryGenerateBoard(allClubs, minMatches, maxAttempts, boardSize = 3) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        attempts++; 
        let tempRows = [...allClubs].sort(() => 0.5 - Math.random()).slice(0, boardSize); 
        let validCols = [];
        
        for (let c of allClubs) {
            if (tempRows.includes(c)) continue; 
            let intersectsAll = tempRows.every(r => {
                let matchCount = 0;
                for (let p of playersDB) {
                    let pClubs = p.pastClubs.map(pc => getCleanClubName(pc).toLowerCase()); 
                    if (p.currentClub) pClubs.push(getCleanClubName(p.currentClub).toLowerCase());
                    if (pClubs.includes(c) && pClubs.includes(r)) matchCount++;
                }
                return matchCount >= minMatches;
            });
            if (intersectsAll) validCols.push(c);
        }
        if (validCols.length >= boardSize) { 
            clashRows = tempRows; 
            clashCols = [...validCols].sort(() => 0.5 - Math.random()).slice(0, boardSize); 
            return true; 
        }
    }
    return false;
}

function generateValidClashConstraint(rows, cols, size = 3) {
    // Small chance to not apply any constraints
    if (Math.random() > 0.5) return null;

    // Build list of candidate countries from DB to ensure realism
    let countrySet = new Set();
    playersDB.forEach(p => {
        p.country.split('/').map(s => s.trim()).forEach(c => { if (c) countrySet.add(c); });
    });
    const candidateCountries = Array.from(countrySet);
    if (candidateCountries.length === 0) return null;

    // Number of required constrained columns (from settings)
    const required = (customClashSettings && customClashSettings.requiredCountries) ? customClashSettings.requiredCountries : 0;

    // Shuffle helpers
    let colsIndices = Array.from({length: size}, (_, i) => i).sort(() => 0.5 - Math.random());
    let shuffledCountries = [...candidateCountries].sort(() => 0.5 - Math.random());

    const constraints = [];

    for (let c of colsIndices) {
        if (required > 0 && constraints.length >= required) break;
        let colClub = cols[c];

        for (let country of shuffledCountries) {
            // avoid reusing same country multiple times for now
            if (constraints.some(x => x.country === country)) continue;

            let isValidForAllRows = true;
            for (let r = 0; r < size; r++) {
                let rowClub = rows[r];
                let matchFound = playersDB.some(p => {
                    let pCountries = p.country.split('/').map(s => s.trim());
                    if (!pCountries.includes(country)) return false;

                    let pClubs = p.pastClubs.map(pc => getCleanClubName(pc).toLowerCase());
                    if (p.currentClub) pClubs.push(getCleanClubName(p.currentClub).toLowerCase());

                    return pClubs.includes(rowClub) && pClubs.includes(colClub);
                });

                if (!matchFound) { isValidForAllRows = false; break; }
            }

            if (isValidForAllRows) {
                constraints.push({ col: c, country: country });
                break;
            }
        }
    }

    // If user requested 0 constraints, or we failed to find any, return null
    if (required <= 0) return (constraints.length ? constraints[0] : null);
    if (constraints.length === 0) return null;

    // If we found at least one, return array (may be smaller than requested)
    return constraints;
}

function getConstraintCountry(constraints, colIndex) {
    if (!constraints) return null;
    if (Array.isArray(constraints)) {
        const found = constraints.find(x => x && x.col === colIndex);
        return found ? found.country : null;
    }
    if (constraints.col === colIndex) return constraints.country;
    return null;
}

function buildDynamicClashGridHTML(size) {
    const grid = document.getElementById('clashGrid');
    if (!grid) return false;
    
    // Zresetuj wszystkie klasy dla pewności
    grid.className = 'clash-grid';
    grid.classList.add(`size-${size}`);
    
    if (window.innerWidth <= 768) {
        grid.style.gridTemplateColumns = `40px repeat(${size}, 1fr)`;
    } else {
        grid.style.gridTemplateColumns = `80px repeat(${size}, 1fr)`;
    }

    let html = `<div class="clash-cell clash-header-cell empty"></div>`;
    
    // Generowanie headerów w poziomie (Kolumny)
    for(let c = 0; c < size; c++) {
        html += `<div class="clash-cell clash-header-cell" id="col${c}"></div>`;
    }

    // Generowanie rzędów
    for(let r = 0; r < size; r++) {
        html += `<div class="clash-cell clash-header-cell" id="row${r}"></div>`;
        for(let c = 0; c < size; c++) {
            html += `<div class="clash-cell clash-playable" onclick="handleClashCell(${r}, ${c})" id="cell-${r}-${c}"></div>`;
        }
    }
    
    grid.innerHTML = html;
    return true; // Potwierdzenie, że HTML został zbudowany poprawnie
}

function updateClashTurnUI() {
    const display = document.getElementById('clashTimerDisplay');
    if (!display) return;

    const cp1 = document.getElementById('cp1Nick');
    const cp2 = document.getElementById('cp2Nick');

    if (clashStatus === 'viewing' || clashStatus === 'summary') {
        display.innerText = 'KONIEC MECZU';
        display.style.color = 'var(--text-dim)';
        if (cp1) cp1.classList.remove('active');
        if (cp2) cp2.classList.remove('active');
        return;
    }

    // Highlight which player's turn it is (works for local and online)
    if (cp1) cp1.classList.toggle('active', clashTurn === 'red');
    if (cp2) cp2.classList.toggle('active', clashTurn === 'blue');

    // Timer color: green if it's your turn or in local mode, white otherwise
    if (clashTurn === myClashColor || isLocalClash) {
        display.style.color = '#00ff66';
    } else {
        display.style.color = '#fff';
    }

    display.title = clashTurn === myClashColor ? 'Twoja kolej' : 'Ruch przeciwnika';
}

function showClashInfo() {
    const overlay = document.getElementById('clashInfoOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}
function closeClashInfo() {
    const overlay = document.getElementById('clashInfoOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
}

// Otwieranie zakładek
window.switchClashSettingsTab = function(tabId) {
    document.querySelectorAll('.settings-tab-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById('tab-' + tabId).style.display = 'block';
    
    // Szukamy przycisku, który to wywołał i go podświetlamy
    document.querySelectorAll('.settings-tab-btn').forEach(b => {
        if(b.getAttribute('onclick').includes(tabId)) b.classList.add('active');
    });
}

// Zaznaczanie kafelków (Rozmiar i Czas)
window.selectClashSettingCard = function(groupId, value, element) {
    if (clashCustomSettingsReadOnly) return;
    
    document.querySelectorAll(`.${groupId}-card`).forEach(c => c.classList.remove('active'));
    element.classList.add('active');
    
    document.getElementById(`customClash${groupId.charAt(0).toUpperCase() + groupId.slice(1)}Value`).value = value;

    // Jeżeli wybrano planszę inną niż 3x3, aktualizujemy zasięg suwaka krajów
    if (groupId === 'size') {
        const reqSlider = document.getElementById('customClashRequiredCountries');
        if (reqSlider) reqSlider.max = value;
    }
}

// --- FORMULARZ ZGŁASZANIA BRAKUJĄCYCH ZAWODNIKÓW ---
function openSuggestion() {
    const overlay = document.getElementById('suggestionOverlay');
    if (!overlay) return;
    overlay.style.display = 'block';
    setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeSuggestion() {
    const overlay = document.getElementById('suggestionOverlay');
    if (!overlay) return;
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 300);
}

async function submitSuggestion() {
    const nameInput = document.getElementById('sugNameInput');
    const countryInput = document.getElementById('sugCountryInput');
    const notesInput = document.getElementById('sugNotesInput');
    const btn = document.getElementById('btnSubmitSug');
    
    if (!nameInput || !btn) return;

    let name = nameInput.value.trim();
    let country = countryInput ? countryInput.value.trim() : "";
    let notes = notesInput ? notesInput.value.trim() : "";
    
    if (name.length < 3) {
        appAlert("Wpisz poprawne imię i nazwisko zawodnika!", "Błąd formularza");
        return;
    }

    // Walidacja zawodnika (z ignorowaniem wielkości liter i polskich znaków)
    const normalizeName = (str) => {
        const accents = 'ąćęłńóśźż';
        const accentsOut = 'acelnoszz';
        return str.toLowerCase().split('').map(letter => {
            const idx = accents.indexOf(letter);
            return idx !== -1 ? accentsOut[idx] : letter;
        }).join('').replace(/[^a-z]/g, ''); // wyrzuca wszystko co nie jest zwykłą literą
    };

    let searchName = normalizeName(name);
    let playerExists = playersDB.some(p => normalizeName(p.name) === searchName);

    if (playerExists) {
        appAlert(`Zawodnik "${name}" znajduje się już w naszej bazie! Dziękujemy za czujność. 🏁`, "Zawodnik istnieje");
        nameInput.value = ""; 
        return;
    }
    
    const originalText = btn.innerText;
    btn.innerText = "WYSYŁANIE...";
    btn.disabled = true;
    
    try {
        await db.collection("player_suggestions").add({
            playerName: escapeHTML(name),
            country: escapeHTML(country),
            notes: escapeHTML(notes),
            suggestedBy: playerNickname || "Anonimowy Gość",
            userId: playerId || "unknown",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        appAlert("Dziękuję! Twoja propozycja została przesłana do weryfikacji. 🎯", "Zgłoszenie wysłane");
        
        nameInput.value = "";
        if (countryInput) countryInput.value = "";
        if (notesInput) notesInput.value = "";
        closeSuggestion();
        
    } catch (e) {
        console.error("Suggestion save error:", e);
        appAlert("Nie udało się wysłać zgłoszenia. Sprawdź połączenie internetowe.", "Błąd");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// --- FORMULARZ ZGŁASZANIA BŁĘDÓW ---
function openBugReport() {
    const overlay = document.getElementById('bugReportOverlay');
    if (!overlay) return;
    overlay.style.display = 'block';
    setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeBugReport() {
    const overlay = document.getElementById('bugReportOverlay');
    if (!overlay) return;
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 300);
}

async function submitBugReport() {
    const descInput = document.getElementById('bugDescInput');
    const btn = document.getElementById('btnSubmitBug');
    
    if (!descInput || !btn) return;

    let description = descInput.value.trim();
    
    if (description.length < 5) {
        appAlert("Opis błędu jest zbyt krótki! Napisz proszę coś więcej.", "Błąd formularza");
        return;
    }
    
    const originalText = btn.innerText;
    btn.innerText = "WYSYŁANIE...";
    btn.disabled = true;

    // NOWOŚĆ: Ciche pobieranie danych o sprzęcie gracza
    const deviceInfo = {
        userAgent: navigator.userAgent,          // Model telefonu/przeglądarki
        screenWidth: window.innerWidth,          // Szerokość ekranu w pikselach
        screenHeight: window.innerHeight,        // Wysokość ekranu
        language: navigator.language             // Język urządzenia
    };
    
    try {
        await db.collection("bug_reports").add({
            description: escapeHTML(description),
            reportedBy: playerNickname || "Anonimowy Gość",
            userId: playerId || "unknown",
            gameMode: gameMode,
            deviceInfo: deviceInfo, // Zapisujemy sprzęt do bazy!
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        appAlert("Dziękuję! Zgłoszenie błędu zostało wysłane. 🛠️", "Zgłoszenie wysłane");
        
        descInput.value = "";
        closeBugReport();
        
    } catch (e) {
        console.error("Bug report save error:", e);
        appAlert("Nie udało się wysłać zgłoszenia. Sprawdź połączenie internetowe.", "Błąd");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// --- OBSŁUGA STOPKI (FOOTERA) ---
function showLegalModal(title, htmlContent) {
    const overlay = document.getElementById('appModalOverlay');
    const titleEl = document.getElementById('appModalTitle');
    const messageEl = document.getElementById('appModalMessage');
    const confirmBtn = document.getElementById('appModalConfirm'); // POPRAWKA: Usunięto błąd przypisania
    const cancelBtn = document.getElementById('appModalCancel');

    titleEl.innerText = title;
    messageEl.innerHTML = htmlContent; 
    
    confirmBtn.innerText = t('understoodBtn') || "ZROZUMIANO";
    cancelBtn.style.display = 'none';

    confirmBtn.onclick = () => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 300);
    };

    overlay.style.display = 'block';
    setTimeout(() => overlay.style.opacity = '1', 10);
}

function showPrivacyPolicy() {
    showLegalModal(t('privacyTitle'), t('privacyContent'));
}

function showTerms() {
    showLegalModal(t('termsTitle'), t('termsContent'));
}

// Globalny eksport (żeby kliknięcie w footer zadziałało)
try {
    window.showPrivacyPolicy = showPrivacyPolicy;
    window.showTerms = showTerms;
} catch (e) {}

// ==============================================
// ====== OBSŁUGA KLAWIATURY (ENTER) ============
// ==============================================
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        // Zgadywanie w normalnej grze (Endless/Daily)
        if (document.activeElement.id === 'guessInput') {
            makeGuess();
        }
        // Zgadywanie w trybie Clash
        if (document.activeElement.id === 'clashGuessInput') {
            submitClashGuess();
        }
        // Potwierdzanie nicku przy starcie
        if (document.activeElement.id === 'nickInput') {
            saveNick();
        }
    }
});

//---------------------------











// ==============================================
// ====== KARIERA: COPERO MINIGAMES STYLE =======
// ==============================================

let cState = {
    active: false,
    name: "KOWALSKI", num: 99, nat: "Polska", flagCode: "pl", 
    age: 15, maxAge: 47,
    ovr: 40, ovrProgress: 0, 
    club: null, league: null, 
    contractYears: 0, 
    stats: { heats: 0, pts: 0, bon: 0, dmpGold: 0, dmpSilver: 0, dmpBronze: 0, ims: 0 }, 
    history: [],
    leagues: {},
    teamOVRs: {},
    relations: { manager: 50, team: 50, fans: 50 },
    season: {
        active: false,
        matchIndex: 0,
        regularSeasonLength: 14,
        playoffsGenerated: false,
        finalsGenerated: false,
        barazGenerated: false,
        fullSchedule: [],
        schedule: [],
        matchResults: [],
        table: [],
        heats: 0, pts: 0, bon: 0,
        trainedThisWeek: false,
        eventRoundTriggered: 0
    }
};

let activeLoanClub = null;
let activeLoanLeague = null;
let qteAnimFrame = null;

const CAREER_CONSTANTS = {
    "PGE Ekstraliga": { diff: 82, logo: "🏆" },
    "Metalkas 2.E": { diff: 68, logo: "🥈" },
    "KLŻ": { diff: 50, logo: "🥉" }
};

const CAREER_CLUB_COLORS = {
    "motor lublin": "#ffcc00", "sparta wrocław": "#e32221", "apator toruń": "#235ac0", "stal gorzów wielkopolski": "#ffd700",
    "włókniarz częstochowa": "#008000", "gkm grudziądz": "#0502b6", "falubaz zielona góra": "#007a33", "unia leszno": "#0055a5",
    "polonia bydgoszcz": "#d32f2f", "ostrovia ostrów wielkopolski": "#747171", "wilki krosno": "#302e2e", "psż poznań": "#fbc02d",
    "stal rzeszów": "#5394b9", "orzeł łódź": "#1e88e5", "row rybnik": "#006400", "polonia piła": "#06b606",
    "kolejarz opole": "#a70606", "landshut devils": "#0d409e", "lokomotiv daugavpils": "#800000", "speedway kraków": "#e0e0e0",
    "start gniezno": "#111111", "wybrzeże gdańsk": "#0906b9", "unia tarnów": "#0d47a1", "śląsk świętochłowice": "#0055a5",
    "kolejarz rawicz": "#135e17"
};

function getCareerClubColor(clubName) {
    let normalizedClub = (clubName || "").trim().toLowerCase();
    if (CAREER_CLUB_COLORS[normalizedClub]) return CAREER_CLUB_COLORS[normalizedClub];
    return "#444444";
}

function getContrastYIQ(hexcolor){
    hexcolor = hexcolor.replace("#", "");
    if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c+c).join('');
    var r = parseInt(hexcolor.substr(0,2),16);
    var g = parseInt(hexcolor.substr(2,2),16);
    var b = parseInt(hexcolor.substr(4,2),16);
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? '#111111' : '#ffffff';
}

function getCareerLastClubInfo() {
    if (cState.history && cState.history.length > 0) {
        const lastEntry = cState.history[cState.history.length - 1];
        return { club: lastEntry.club, league: lastEntry.league || cState.league };
    }
    return { club: cState.club, league: cState.league };
}

// ==========================================
// ====== ZAPISYWANIE I WCZYTYWANIE =========
// ==========================================

function saveCareer() {
    localStorage.setItem('speedwayCareerSave_v4', JSON.stringify(cState));
}

function loadCareer() {
    let saved = localStorage.getItem('speedwayCareerSave_v4');
    if (saved) {
        cState = JSON.parse(saved);
        
        // --- ZABEZPIECZENIE (Kompatybilność dla starych zapisów) ---
        if (!cState.attributes) {
            cState.attributes = { 
                media: Math.floor(Math.random() * 30) + 40,
                prof: Math.floor(Math.random() * 40) + 40,
                injRisk: Math.floor(Math.random() * 30) + 10
            };
        }
        if (cState.season && typeof cState.season.injuryRounds === 'undefined') {
            cState.season.injuryRounds = 0;
            cState.season.lastMatches = [];
        }
        // -----------------------------------------------------------

        if (cState.season && cState.season.active && !cState.season.fullSchedule) {
            startNewSeason();
            appAlert("Zaktualizowano system terminarza ligowego. Twój obecny sezon musiał zostać zresetowany do pierwszej kolejki (Twoje statystyki OVR pozostają bez zmian).", "Aktualizacja gry");
            return;
        }
        
        document.getElementById('careerSetup').style.display = 'none';
        document.getElementById('careerMainPanel').style.display = 'flex'; 
        updateLeftPanelUI();
        renderTimeline();
        
        if (cState.season.active) {
            renderCareerHub();
        } else if (cState.club === null && cState.age === 16) {
            generateAcademyOffers();
        } else if (cState.contractYears <= 0) {
            generateTransferWindow();
        } else {
            startNewSeason();
        }
    } else {
        appAlert("Brak zapisanego stanu gry!", "Błąd");
    }
}

// ==========================================
// ====== MENU GŁÓWNE KARIERY ===============
// ==========================================

// ==========================================
// ====== MENU GŁÓWNE KARIERY ===============
// ==========================================

async function openCareerMode() {
    // Sprawdzamy czy użytkownik widział już komunikat o Open Becie
    if (!localStorage.getItem('speedwayCareerBetaWarningSeen')) {
        await appAlert("Tryb Kariery (Speedway Legend) wszedł w fazę OPEN BETA! 🚀\n\nJako że gra jest wciąż w fazie testów, możesz natrafić na drobne błędy. Wszelkie problemy oraz sugestie prosimy zgłaszać poprzez formularz 'Zgłoś błąd' w menu głównym gry lub bezpośrednio na naszym serwerze Discord.\n\nBaw się dobrze!", "OPEN BETA");
        localStorage.setItem('speedwayCareerBetaWarningSeen', 'true');
    }

    document.getElementById('mainMenuContainer').style.display = 'none';
    const desktopMenu = document.getElementById('desktopMainMenu');
    if (desktopMenu) desktopMenu.style.display = 'none';
    document.getElementById('careerContainer').style.display = 'grid';
    
    document.getElementById('careerSetup').style.display = 'block';
    document.getElementById('careerMainPanel').style.display = 'none';
    document.getElementById('careerRetirement').style.display = 'none';
    document.getElementById('timelineHeader').style.display = 'none';
    document.getElementById('timelineEmpty').style.display = 'block';
    document.getElementById('timelineList').innerHTML = '';

    const setupDiv = document.getElementById('careerSetup');
    let hasSave = localStorage.getItem('speedwayCareerSave_v4') !== null;
    
    setupDiv.innerHTML = `
        <h2 class="text-white font-black text-center mb-20" style="font-size: 32px; letter-spacing: 2px;">SPEEDWAY LEGEND</h2>
        ${hasSave ? `<button onclick="loadCareer()" class="btn-green w-100 mb-15 p-15" style="border-radius:14px; font-size:16px; font-weight:900;">KONTYNUUJ KARIERĘ</button>` : ''}
        <button onclick="showCareerCreator()" class="btn-yellow w-100 mb-20 p-15" style="border-radius:14px; font-size:16px; font-weight:900;">ROZPOCZNIJ NOWĄ GRĘ</button>
    `;
}

function showCareerCreator() {
    if(localStorage.getItem('speedwayCareerSave_v4') !== null) {
        if(!confirm("Rozpoczęcie nowej gry nadpisze twój obecny zapis. Czy na pewno?")) return;
    }

    cState = { 
        active: true, name: "KOWALSKI", num: 99, nat: "Polska", flagCode: "pl", 
        age: 15, maxAge: 47, ovr: 40, ovrProgress: 0,
        club: null, league: null, contractYears: 0,
        stats: { heats: 0, pts: 0, bon: 0, dmpGold: 0, dmpSilver: 0, dmpBronze: 0, ims: 0 }, history: [],
        relations: { manager: 50, team: 50, fans: 50 },
        // NOWE ATRYBUTY:
        attributes: { 
            media: Math.floor(Math.random() * 30) + 40, // 40-70 Medialność
            prof: Math.floor(Math.random() * 40) + 40,  // 40-80 Profesjonalizm
            injRisk: Math.floor(Math.random() * 30) + 10 // 10-40 Ryzyko kontuzji
        },
        season: { active: false, matchIndex: 0, regularSeasonLength: 14, playoffsGenerated: false, finalsGenerated: false, barazGenerated: false, fullSchedule: [], schedule: [], matchResults: [], table: [], heats: 0, pts: 0, bon: 0, trainedThisWeek: false, lastMatches: [], injuryRounds: 0 },
        leagues: {
            "PGE Ekstraliga": ["Motor Lublin", "Sparta Wrocław", "Apator Toruń", "Stal Gorzów Wielkopolski", "Włókniarz Częstochowa", "GKM Grudziądz", "Falubaz Zielona Góra", "Unia Leszno"],
            "Metalkas 2.E": ["Polonia Bydgoszcz", "Ostrovia Ostrów Wielkopolski", "Wilki Krosno", "PSŻ Poznań", "Stal Rzeszów", "Orzeł Łódź", "ROW Rybnik", "Polonia Piła"],
            "KLŻ": ["Kolejarz Opole", "Landshut Devils", "Lokomotiv Daugavpils", "Speedway Kraków", "Start Gniezno", "Wybrzeże Gdańsk", "Unia Tarnów", "Śląsk Świętochłowice", "Kolejarz Rawicz"]
        },
        teamOVRs: {}
    };

    const flags = [
        {name: "Polska", code: "pl"}, {name: "Dania", code: "dk"}, {name: "Australia", code: "au"},
        {name: "W. Brytania", code: "gb"}, {name: "Szwecja", code: "se"}, {name: "Łotwa", code: "lv"},
        {name: "Czechy", code: "cz"}, {name: "Niemcy", code: "de"}, {name: "Francja", code: "fr"},
        {name: "Ukraina", code: "ua"}, {name: "Rosja", code: "ru"}, {name: "Chorwacja", code: "hr"},
        {name: "Włochy", code: "it"}, {name: "USA", code: "us"}, {name: "Węgry", code: "hu"},
        {name: "N. Zelandia", code: "nz"}, {name: "Słowacja", code: "sk"}, {name: "Słowenia", code: "si"},
        {name: "Norwegia", code: "no"}, {name: "Finlandia", code: "fi"}
    ];

    let flagsHtml = flags.map((f, i) => `
        <div class="flag-card ${i===0?'active':''}" onclick="selectCareerNat('${f.name}', '${f.code}', this)">
            <img src="https://flagcdn.com/w40/${f.code}.png">
            <span class="ml-5 text-white font-bold text-xs" style="font-size:9px;">${f.name}</span>
        </div>
    `).join('');

    const setupDiv = document.getElementById('careerSetup');
    
    setupDiv.innerHTML = `
        <h3 class="text-white font-black text-center mb-10 text-xl" style="font-size: 28px;">Zbuduj tożsamość</h3>
        <div class="kevlar-display mx-auto mb-20 mt-15">
            <div class="kevlar-collar"></div>
            <div class="kevlar-body">
                <span id="kevlarNamePreview" class="kevlar-name">KOWALSKI</span>
                <span id="kevlarNumPreview" class="kevlar-number">99</span>
            </div>
        </div>
        <div class="flex-row gap-10 mb-15">
            <div class="form-group-clash flex-1 m-0 text-left">
                <label>NAZWISKO</label>
                <input type="text" id="careerNameInput" placeholder="Kowalski" maxlength="12" oninput="updateKevlarPreview()" style="background: rgba(0,0,0,0.5);">
            </div>
            <div class="form-group-clash m-0 text-left" style="width: 100px;">
                <label>NR</label>
                <input type="number" id="careerNumInput" placeholder="99" max="999" min="1" oninput="updateKevlarPreview()" style="background: rgba(0,0,0,0.5);">
            </div>
        </div>
        <div class="form-group-clash text-left m-0 mb-15">
            <label>NARODOWOŚĆ</label>
            <div class="flags-grid" style="grid-template-columns: repeat(4, 1fr); max-height: 160px; overflow-y: auto; padding-right:5px;">
                ${flagsHtml}
            </div>
        </div>
        <button onclick="startCareerAcademy()" class="btn-white-solid w-100 mt-20 p-15">Wejdź w żużlowy świat</button>
    `;
}

function exitCareerMode() {
    window.location.reload(); 
}

function updateKevlarPreview() {
    let nameVal = document.getElementById('careerNameInput').value.trim().toUpperCase() || "KOWALSKI";
    let numVal = document.getElementById('careerNumInput').value || "99";
    document.getElementById('kevlarNamePreview').innerText = nameVal;
    document.getElementById('kevlarNumPreview').innerText = numVal;
}

function selectCareerNat(name, code, el) {
    cState.nat = name; 
    cState.flagCode = code;
    document.querySelectorAll('#careerSetup .flag-card').forEach(f => f.classList.remove('active'));
    el.classList.add('active');
}

function startCareerAcademy() {
    let nameVal = document.getElementById('careerNameInput').value.trim().toUpperCase();
    if(nameVal) cState.name = nameVal;
    cState.num = document.getElementById('careerNumInput').value || 99;
    cState.ovr = Math.floor(Math.random() * 21) + 40; 
    
    // Inicjalizacja siły drużyn
    cState.leagues["PGE Ekstraliga"].forEach(c => cState.teamOVRs[c] = Math.floor(Math.random() * 15) + 75); 
    cState.leagues["Metalkas 2.E"].forEach(c => cState.teamOVRs[c] = Math.floor(Math.random() * 15) + 60);  
    cState.leagues["KLŻ"].forEach(c => cState.teamOVRs[c] = Math.floor(Math.random() * 15) + 45);         

    document.getElementById('careerSetup').style.display = 'none';
    document.getElementById('careerMainPanel').style.display = 'flex'; 
    cState.age = 16;
    saveCareer();
    updateLeftPanelUI();
    generateAcademyOffers(); 
}

function generateAcademyOffers() {
    const area = document.getElementById('careerActionArea');
    if (!area) return;

    const academyPools = [
        {
            league: "KLŻ",
            club: cState.leagues["KLŻ"][Math.floor(Math.random() * cState.leagues["KLŻ"].length)],
            years: 2,
            type: "academy",
            label: "Start od podstaw",
            bonus: "Więcej jazdy w słabszej lidze",
            risk: "Niższa presja, wolniejszy start"
        },
        {
            league: "Metalkas 2.E",
            club: cState.leagues["Metalkas 2.E"][Math.floor(Math.random() * cState.leagues["Metalkas 2.E"].length)],
            years: 2,
            type: "academy",
            label: "Rozsądny rozwój",
            bonus: "Dobry balans między szansami a presją",
            risk: "Mniej pewnych biegów niż w KLŻ"
        },
        {
            league: "PGE Ekstraliga",
            club: cState.leagues["PGE Ekstraliga"][Math.floor(Math.random() * cState.leagues["PGE Ekstraliga"].length)],
            years: 1,
            type: "academy",
            label: "Skok do elity",
            bonus: "Szybki rozwój przy dobrej formie",
            risk: "Duże ryzyko ławki i słabszych wyników"
        }
    ];

    cState.pendingOffers = academyPools;

    area.innerHTML = `
        <h3 class="text-white font-black m-0 mb-5 text-xl">Akademia startowa</h3>
        <p class="text-xs text-dim mb-15">Wybierz ścieżkę kariery. Miejsce startu wpłynie na tempo rozwoju i liczbę okazji do jazdy.</p>
        <div class="copero-action-grid">
            <div class="copero-card" onclick="signContract(0)">
                <span class="copero-card-title">${academyPools[0].label}</span>
                <span class="copero-card-club">${academyPools[0].club}</span>
                <div class="copero-card-img">${CAREER_CONSTANTS[academyPools[0].league].logo}</div>
                <span class="copero-card-bot" style="margin-top:5px;">${academyPools[0].league}<br><b style="color:var(--accent)">${academyPools[0].bonus}</b><br><span class="text-dim">${academyPools[0].risk}</span></span>
            </div>
            <div class="copero-card" onclick="signContract(1)">
                <span class="copero-card-title">${academyPools[1].label}</span>
                <span class="copero-card-club">${academyPools[1].club}</span>
                <div class="copero-card-img">${CAREER_CONSTANTS[academyPools[1].league].logo}</div>
                <span class="copero-card-bot" style="margin-top:5px;">${academyPools[1].league}<br><b style="color:var(--accent)">${academyPools[1].bonus}</b><br><span class="text-dim">${academyPools[1].risk}</span></span>
            </div>
            <div class="copero-card stay-card" style="grid-column: 1 / -1; max-width: 250px; margin: 0 auto;" onclick="signContract(2)">
                <span class="copero-card-title">${academyPools[2].label}</span>
                <span class="copero-card-club">${academyPools[2].club}</span>
                <div class="copero-card-img">${CAREER_CONSTANTS[academyPools[2].league].logo}</div>
                <span class="copero-card-bot" style="margin-top:5px;">${academyPools[2].league}<br><b style="color:var(--accent)">${academyPools[2].bonus}</b><br><span class="text-dim">${academyPools[2].risk}</span></span>
            </div>
        </div>
    `;
}

// ==========================================
// ====== INTERFEJS GRACZA (LEFT PANEL) =====
// ==========================================

function updateLeftPanelUI() {
    const progBar = document.getElementById('cOvrProgress');
    if (progBar) progBar.style.width = (cState.ovrProgress || 0) + '%';

    document.getElementById('cOvr').innerText = cState.ovr;
    document.getElementById('cFlag').src = `https://flagcdn.com/w40/${cState.flagCode}.png`;
    
    let lastName = cState.name;
    if (lastName.length > 12) lastName = lastName.substring(0, 10) + "...";
    document.getElementById('cNumLabel').innerText = cState.num; 
    
    let contractText = cState.contractYears > 0 ? `Kontrakt: ${cState.contractYears} ${cState.contractYears === 1 ? 'rok' : 'lata'}` : "Brak kontraktu";
    document.getElementById('cCurrentClub').innerHTML = `${cState.club ? cState.club : "Wolny agent"}<br><span style="font-size:10px; color:var(--text-dim); font-weight:bold; text-transform:none; letter-spacing:1px;">${contractText}</span>`;
    
    document.getElementById('cAge').innerText = cState.age;

    let totalHeats = cState.stats.heats + (cState.season.active ? cState.season.heats : 0);
    let totalPts = cState.stats.pts + (cState.season.active ? cState.season.pts : 0);
    let totalBon = cState.stats.bon + (cState.season.active ? cState.season.bon : 0);

    document.getElementById('cHeats').innerText = totalHeats;
    document.getElementById('cPts').innerText = `${totalPts}`; 
    let avg = totalHeats > 0 ? ((totalPts + totalBon) / totalHeats).toFixed(2) : "0.00";
    document.getElementById('cAvg').innerText = avg;

    const tBox = document.getElementById('cTrophiesDisplay');
    // USUNIĘTO cState.stats.ims
    let totalMedals = cState.stats.dmpGold + cState.stats.dmpSilver + cState.stats.dmpBronze;
    
    if (totalMedals === 0) {
        tBox.innerText = "🏆 BRAK TROFEÓW";
    } else {
        let tHtml = "";
        for(let i=0; i<cState.stats.dmpGold; i++) tHtml += "🥇 ";
        for(let i=0; i<cState.stats.dmpSilver; i++) tHtml += "🥈 ";
        for(let i=0; i<cState.stats.dmpBronze; i++) tHtml += "🥉 ";
        tBox.innerHTML = tHtml;
    }
}

function drawRelationBar(name, value, color) {
    return `
        <div style="margin-bottom: 8px;">
            <div style="display:flex; justify-content:space-between; font-size:10px; font-weight:bold; color:var(--text-dim); margin-bottom:2px;">
                <span>${name}</span><span>${value}%</span>
            </div>
            <div style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                <div style="width:${value}%; height:100%; background:${color}; transition:0.3s;"></div>
            </div>
        </div>
    `;
}

// ==========================================
// ====== KOŁO FORTUNY (EVENTY) =============
// ==========================================

function resolveRandomEvent(succOVR, failOVR, chance, isMidSeason = false) {
    const overlay = document.getElementById('careerEventOverlay');
    const title = document.getElementById('eventAnimTitle');
    const wheel = document.getElementById('careerWheelInner');

    if (!overlay || !title || !wheel) {
        let isSuccess = Math.random() < chance;
        if(isMidSeason) {
            cState.ovr = Math.max(30, Math.min(99, cState.ovr + (isSuccess ? succOVR : failOVR)));
            saveCareer(); updateLeftPanelUI(); renderCareerHub();
        } else {
            cState.ovr = Math.max(30, Math.min(99, cState.ovr + (isSuccess ? succOVR : failOVR)));
            startNewSeason();
        }
        return;
    }
    
    title.innerText = "LOSOWANIE...";
    title.className = "text-white font-black uppercase mb-10";
    
    const pct = Math.round(chance * 100);
    wheel.style.background = `conic-gradient(#00ff66 0% ${pct}%, #ff3333 ${pct}% 100%)`;
    wheel.style.transition = 'none';
    wheel.style.transform = `rotate(0deg)`;
    
    overlay.style.display = 'flex'; 
    setTimeout(() => overlay.style.opacity = '1', 10);
    
    let isSuccess = Math.random() < chance;

    setTimeout(() => {
        let targetAngle = 0;
        if (isSuccess) {
            let zoneSizeDeg = pct * 3.6;
            let randomTheta = 5 + Math.random() * (zoneSizeDeg - 10);
            targetAngle = 360 - randomTheta;
        } else {
            let greenZoneSizeDeg = pct * 3.6;
            let randomTheta = greenZoneSizeDeg + 5 + Math.random() * (360 - greenZoneSizeDeg - 10);
            targetAngle = 360 - randomTheta;
        }
        let totalRotation = (5 * 360) + targetAngle;

        wheel.style.transition = 'transform 3s cubic-bezier(0.1, 0.8, 0.2, 1)';
        wheel.style.transform = `rotate(${totalRotation}deg)`;
        playSound('flip');
    }, 100);

    setTimeout(() => {
        if(isSuccess) {
            title.innerText = "SUKCES! 🟩";
            title.className = "text-green font-black uppercase mb-10 event-success-text";
            playSound('win');
        } else {
            title.innerText = "PORAŻKA! 🟥";
            title.className = "text-red font-black uppercase mb-10 event-fail-text";
            playSound('error');
        }
        
        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 300);
            
            let finalOvrChange = isSuccess ? succOVR : failOVR;
            cState.ovr = Math.max(30, Math.min(99, cState.ovr + finalOvrChange));
            saveCareer();
            updateLeftPanelUI();
            
            if(isMidSeason) {
                showToast(`Wydarzenie zakończone. Zmiana OVR: ${finalOvrChange}`, "normal");
                renderCareerHub();
            } else {
                startNewSeason();
            }
        }, 2000);
        
    }, 3200); 
}

function showMidSeasonEventWindow() {
    const area = document.getElementById('careerActionArea');
    const events = window.CAREER_CUSTOM_EVENTS || [];
    
    if (!events.length) {
        area.innerHTML = `<div class="text-center text-dim font-bold p-15">Brak eventów do wyświetlenia.</div>`;
        return;
    }

    let ev = events[Math.floor(Math.random() * events.length)];
    let chanceInfo = ev.opt1.chance ? ` <span style="color:var(--accent); font-size:10px;"><br>(${ev.opt1.chance}% szansy na +OVR)</span>` : '';

    area.innerHTML = `
        <h3 class="text-accent font-black m-0 mb-5 text-xl">Wydarzenie!</h3>
        ${ev.dilemma ? `<div class="text-xs font-black uppercase tracking-wide text-red mb-10">Dylemat</div>` : ''}
        <h4 class="text-white font-black m-0 mb-5">${ev.title}</h4>
        <p class="text-xs text-dim mb-15">${ev.desc}</p>
        <div class="copero-action-grid">
            <div class="copero-card" onclick="${ev.opt1.fn}">
                <span class="copero-card-club mb-5" style="line-height:1.2;">${ev.opt1.title}${chanceInfo}</span>
                <div class="copero-card-img" style="border-radius:12px;">${ev.img}</div>
                <span class="text-green font-bold text-xs">${ev.opt1.bot1}</span>
                <span class="text-red font-bold text-xs">${ev.opt1.bot2}</span>
            </div>
            <div class="copero-card stay-card" onclick="${ev.opt2.fn}">
                <span class="copero-card-club mb-10">${ev.opt2.title}</span>
                <div class="copero-card-img" style="border-radius:12px; background: transparent; border: 1px dashed rgba(255,255,255,0.2);">🤔</div>
                <span class="text-white font-bold text-xs">${ev.opt2.bot1}</span>
                <span class="text-dim font-bold text-xs">${ev.opt2.bot2}</span>
            </div>
        </div>
    `;
}

function resolveMidSeasonEventWithWheel(succOVR, failOVR, chance, relT, relM, relF = 0, prof = 0, media = 0, injRisk = 0) {
    cState.relations.team = Math.max(0, Math.min(100, cState.relations.team + relT));
    cState.relations.manager = Math.max(0, Math.min(100, cState.relations.manager + relM));
    cState.relations.fans = Math.max(0, Math.min(100, cState.relations.fans + relF));

    cState.attributes.prof = Math.max(0, Math.min(100, cState.attributes.prof + prof));
    cState.attributes.media = Math.max(0, Math.min(100, cState.attributes.media + media));
    cState.attributes.injRisk = Math.max(0, Math.min(100, cState.attributes.injRisk + injRisk));
    
    resolveRandomEvent(succOVR, failOVR, chance, true);
}

function safeMidSeasonEvent(relT, relM, relF = 0, prof = 0, media = 0, injRisk = 0) {
    cState.relations.team = Math.max(0, Math.min(100, cState.relations.team + relT));
    cState.relations.manager = Math.max(0, Math.min(100, cState.relations.manager + relM));
    cState.relations.fans = Math.max(0, Math.min(100, cState.relations.fans + relF));

    cState.attributes.prof = Math.max(0, Math.min(100, cState.attributes.prof + prof));
    cState.attributes.media = Math.max(0, Math.min(100, cState.attributes.media + media));
    cState.attributes.injRisk = Math.max(0, Math.min(100, cState.attributes.injRisk + injRisk));
    
    saveCareer();
    updateLeftPanelUI();
    showToast("Zdarzenie zakończone. Zaktualizowano atrybuty i relacje.", "normal");
    renderCareerHub();
}


function resolveMidSeasonEvent() {
    showMidSeasonEventWindow();
}

function triggerMatchOrEvent() {
    const s = cState.season;
    if (!s || !s.active) {
        renderCareerHub();
        return;
    }

    const round = s.matchIndex + 1;
    const customEventRound = round === 3 || round === 7 || round === 11;
    const eventAlreadyShown = s.eventRoundTriggered === round;
    const randomEvent = Math.random() < 0.22;

    if (!eventAlreadyShown && (customEventRound || randomEvent)) {
        s.eventRoundTriggered = round;
        saveCareer();
        showMidSeasonEventWindow();
        showToast("W trakcie sezonu pojawiło się dodatkowe wydarzenie.", "normal");
        return;
    }

    playSingleMatch();
}


// ==========================================
// ====== OBSŁUGA KALENDARZA LIGOWEGO =======
// ==========================================

function getMatchDateString(round, leagueName) {
    let baseDate = new Date(2026, 3, 3); // 3 Kwietnia 2026 (Piątek)
    let weeksToAdd = round - 1;
    let dayOffset = 0; 
    
    // Pseudolosowość na podstawie numeru kolejki (50/50 na dzień 1 lub dzień 2)
    let isDay1 = (round * 7 + 3) % 2 === 0;

    if (leagueName === "PGE Ekstraliga") {
        dayOffset = isDay1 ? 0 : 2; // Pt lub Nd
    } else {
        dayOffset = isDay1 ? 1 : 2; // Sb lub Nd (dla M2E i KLŻ)
    } 
    
    let d = new Date(baseDate.getTime() + (weeksToAdd * 7 + dayOffset) * 86400000);
    let dayName = d.getDay() === 5 ? ' (Pt)' : d.getDay() === 6 ? ' (Sb)' : ' (Nd)';
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) + dayName;
}

function generateFullSchedule(teamsArray) {
    let teams = [...teamsArray];
    let n = teams.length;
    
    if (n % 2 !== 0) {
        teams.push("PAUZA");
        n++;
    }

    let schedule = [];
    
    // Metoda wielokąta (Berger tables) - optymalne rozłożenie Dom/Wyjazd
    for (let round = 0; round < n - 1; round++) {
        let roundMatches = [];
        for (let i = 0; i < n / 2; i++) {
            let home = teams[i];
            let away = teams[n - 1 - i];

            // Drużyna indeks 0 musi zamieniać strony toru, reszta rotuje
            if (i === 0) {
                if (round % 2 !== 0) { let t = home; home = away; away = t; }
            } else {
                if (round % 2 === 0) { let t = home; home = away; away = t; }
            }

            if (home !== "PAUZA" && away !== "PAUZA") {
                roundMatches.push({ home, away, type: "Zasadnicza" });
            }
        }
        schedule.push(roundMatches);
        // Rotacja: drugi element na koniec
        teams.splice(1, 0, teams.pop());
    }

    // Runda rewanżowa (druga połowa sezonu)
    let secondHalf = [];
    for (let round = 0; round < n - 1; round++) {
        let roundMatches = schedule[round].map(m => ({
            home: m.away,
            away: m.home,
            type: "Zasadnicza (Rewanż)"
        }));
        secondHalf.push(roundMatches);
    }

    return schedule.concat(secondHalf);
}

function updateTableWithMatch(table, homeClub, awayClub, homeScore, awayScore, fullSchedule, currentRoundIdx) {
    let hRow = table.find(t => t.name === homeClub);
    let aRow = table.find(t => t.name === awayClub);
    if(!hRow || !aRow) return;

    hRow.m = (hRow.m || 0) + 1;
    hRow.matchesPlayed = (hRow.matchesPlayed || 0) + 1;
    aRow.m = (aRow.m || 0) + 1;
    aRow.matchesPlayed = (aRow.matchesPlayed || 0) + 1;
    
    let hDiff = homeScore - awayScore;
    hRow.diff = (hRow.diff || 0) + hDiff;
    aRow.diff = (aRow.diff || 0) - hDiff;
    
    if (homeScore > awayScore) {
        hRow.w = (hRow.w || 0) + 1; hRow.pts = (hRow.pts || 0) + 2; aRow.p = (aRow.p || 0) + 1;
    } else if (homeScore < awayScore) {
        aRow.w = (aRow.w || 0) + 1; aRow.pts = (aRow.pts || 0) + 2; hRow.p = (hRow.p || 0) + 1;
    } else {
        hRow.r = (hRow.r || 0) + 1; hRow.pts = (hRow.pts || 0) + 1;
        aRow.r = (aRow.r || 0) + 1; aRow.pts = (aRow.pts || 0) + 1;
    }
    
    // Szukanie pierwszego meczu żeby przydzielić bonus za dwumecz
    let firstLegMatch = null;
    for (let i = 0; i < currentRoundIdx; i++) {
        let prevRound = fullSchedule[i];
        if (!prevRound) continue;
        let match = prevRound.find(m => (m.home === awayClub && m.away === homeClub) || (m.home === homeClub && m.away === awayClub));
        if (match && match.homeScore !== undefined) {
            firstLegMatch = match; 
            break;
        }
    }

    if (firstLegMatch) {
        let agg1 = homeClub === firstLegMatch.home ? firstLegMatch.homeScore : firstLegMatch.awayScore;
        let agg2 = awayClub === firstLegMatch.home ? firstLegMatch.homeScore : firstLegMatch.awayScore;
        
        let aggHome = homeScore + agg1;
        let aggAway = awayScore + agg2;
        
        if (aggHome > aggAway) {
            hRow.b = (hRow.b || 0) + 1; hRow.pts = (hRow.pts || 0) + 1;
        } else if (aggAway > aggHome) {
            aRow.b = (aRow.b || 0) + 1; aRow.pts = (aRow.pts || 0) + 1;
        }
    }
}

function startNewSeason() {
    let playingLeague = activeLoanLeague ? activeLoanLeague : cState.league;
    let playingClub = activeLoanClub ? activeLoanClub : cState.club;

    let fullSchedule = generateFullSchedule(cState.leagues[playingLeague]);
    let regularLength = fullSchedule.length;
    
    let playerSchedule = [];
    fullSchedule.forEach((roundMatches, rIdx) => {
        let myMatch = roundMatches.find(m => m.home === playingClub || m.away === playingClub);
        if (myMatch) {
            let isHome = myMatch.home === playingClub;
            playerSchedule.push({
                opp: isHome ? myMatch.away : myMatch.home,
                isHome: isHome,
                type: "Zasadnicza",
                leg: rIdx < (fullSchedule.length / 2) ? 1 : 2
            });
        } else {
            playerSchedule.push({
                opp: "PAUZA",
                isHome: true,
                type: "Zasadnicza",
                leg: rIdx < (fullSchedule.length / 2) ? 1 : 2
            });
        }
    });

    cState.season = {
        active: true,
        matchIndex: 0,
        regularSeasonLength: regularLength,
        playoffsGenerated: false,
        finalsGenerated: false,
        barazGenerated: false,
        fullSchedule: fullSchedule,
        schedule: playerSchedule,
        matchResults: [],
        table: generateSeasonTable(playingLeague, playingClub, 0, 0),
        heats: 0, pts: 0, bon: 0,
        trainedThisWeek: false,
        eventRoundTriggered: 0,
        currentMatchScore: { me: 0, opp: 0 }
    };
    
    cState.relations.manager = Math.max(10, cState.relations.manager - 10);
    cState.relations.team = Math.max(10, cState.relations.team - 5);
    
    saveCareer();
    renderCareerHub();
}

function simulateBotMatchesForCurrentRound(playerMatchScore, opponentMatchScore, isPlayerPauza) {
    let s = cState.season;
    let playingClub = activeLoanClub ? activeLoanClub : cState.club;

    if (s.matchIndex < s.regularSeasonLength) {
        let roundIdx = s.matchIndex;
        let roundMatches = s.fullSchedule[roundIdx];
        
        if (roundMatches) {
            roundMatches.forEach(match => {
                let homeClub = match.home;
                let awayClub = match.away;
                
                if (homeClub === playingClub || awayClub === playingClub) {
                    if (!isPlayerPauza) {
                        let homeScore = homeClub === playingClub ? playerMatchScore : opponentMatchScore;
                        let awayScore = awayClub === playingClub ? playerMatchScore : opponentMatchScore;
                        
                        match.homeScore = homeScore;
                        match.awayScore = awayScore;
                        
                        updateTableWithMatch(s.table, homeClub, awayClub, homeScore, awayScore, s.fullSchedule, roundIdx);
                    }
                } else {
                    let homePower = cState.teamOVRs[homeClub] || 50;
                    let awayPower = cState.teamOVRs[awayClub] || 50;
                    
                    homePower += 8; // Atut własnego toru
                    
                    let advantage = (homePower - awayPower) / 30 + (Math.random() * 0.35 - 0.175);
                    advantage = Math.max(-1.1, Math.min(1.1, advantage));
                    
                    let homeScore = Math.round(45 + advantage * 14);
                    homeScore = Math.max(0, Math.min(90, homeScore));
                    let awayScore = 90 - homeScore;
                    
                    if (Math.random() < 0.06) {
                        let cut = Math.random() < 0.5 ? 5 : 1;
                        if (homeScore >= awayScore) homeScore = Math.max(0, homeScore - cut);
                        else awayScore = Math.max(0, awayScore - cut);
                    }
                    
                    match.homeScore = homeScore;
                    match.awayScore = awayScore;
                    
                    updateTableWithMatch(s.table, homeClub, awayClub, homeScore, awayScore, s.fullSchedule, roundIdx);
                }
            });
            
            s.table.sort((a,b) => {
                if ((b.pts || 0) !== (a.pts || 0)) return (b.pts || 0) - (a.pts || 0);
                if ((b.b || 0) !== (a.b || 0)) return (b.b || 0) - (a.b || 0);
                return (b.diff || 0) - (a.diff || 0);
            }).forEach((t, i) => t.pos = i + 1);
        }
    }
}


window.skipPauseRound = function() {
    let s = cState.season;
    
    simulateBotMatchesForCurrentRound(0, 0, true);
    
    s.matchResults.push("-");
    s.currentMatchScore = { me: 0, opp: 0 };
    s.matchIndex += 1;
    s.trainedThisWeek = false;
    
    saveCareer();
    renderCareerHub();
}

function renderCareerHub() {
    const area = document.getElementById('careerActionArea');
    let s = cState.season;
    if (!s.active) { startNewSeason(); return; }

    renderCareerSeasonTable();
    renderTimeline();

    let totalMatches = s.schedule.length;
    let currentRound = s.matchIndex + 1;
    let avg = s.heats > 0 ? ((s.pts + s.bon)/s.heats).toFixed(2) : "0.00";
    
    let recentHeats = 0; let recentPts = 0;
    if (s.lastMatches && s.lastMatches.length > 0) {
        s.lastMatches.forEach(m => { recentHeats += m.h; recentPts += m.p + m.b; });
    }
    let currentForm = recentHeats > 0 ? (recentPts / recentHeats).toFixed(2) : avg;
    if (currentForm === "0.00" && s.matchIndex === 0) currentForm = (cState.ovr / 40).toFixed(2); 

    if (s.matchIndex === s.regularSeasonLength && !s.playoffsGenerated) { generatePlayoffs(); return; }
    if (s.matchIndex === s.regularSeasonLength + 2 && !s.finalsGenerated) { generateFinals(); return; }
    if (s.matchIndex === s.regularSeasonLength + 4 && !s.barazGenerated) { generateBaraz(); return; }

    if (s.matchIndex >= totalMatches && s.playoffsGenerated && s.finalsGenerated && s.barazGenerated) {
        area.innerHTML = `
            <div class="copero-card stay-card" style="grid-column: 1 / -1; width: 100%; margin: 0 auto; background: rgba(241,196,15,0.1); border-color: var(--accent);" onclick="endOfSeason()">
                <span class="copero-card-title text-accent">SEZON ZAKOŃCZONY</span>
                <span class="copero-card-club">PODSUMUJ WYNIKI</span>
                <div class="copero-card-img text-accent" style="background:transparent; border:none; font-size:40px;">📊</div>
            </div>
        `;
        return;
    }

    if (s.injuryRounds > 0) {
        area.innerHTML = `
            <div style="background:rgba(255,51,51,0.1); border-radius:16px; padding:20px; border:1px solid var(--red-neon); text-align:center;">
                <div style="font-size:40px; margin-bottom:10px;">🚑</div>
                <div style="font-size:20px; font-weight:900; margin-bottom:10px; color: var(--red-neon);">KONTUZJA</div>
                <p style="font-size:12px; color:var(--text-dim); margin-bottom:15px;">Przechodzisz rehabilitację. Opuścisz jeszcze ${s.injuryRounds} mecz(e).</p>
                <button onclick="skipInjuryRound()" class="hub-action-btn" style="padding:12px 30px; border-radius:10px; background:var(--red-neon); color:#fff; font-weight:900; border:none; text-transform:uppercase; font-size:12px;">Kuruj się (Pomiń mecz)</button>
            </div>
        `;
        return;
    }

    let nextMatch = s.schedule[s.matchIndex];
    if (nextMatch.opp === "PAUZA") {
        area.innerHTML = `
            <div style="background:rgba(255,255,255,0.03); border-radius:16px; padding:20px; border:1px solid rgba(255,255,255,0.1); text-align:center; position:relative;">
                <button onclick="showCareerCalendar()" class="icon-btn-small" style="position:absolute; top:15px; right:15px;" title="Kalendarz">📅</button>
                <div style="font-size:20px; font-weight:900; margin-bottom:15px; color: var(--accent);">PAUZA W TEJ KOLEJCE</div>
                <button onclick="skipPauseRound()" class="hub-action-btn" style="padding:12px 30px; border-radius:10px; background:var(--accent); color:#000; font-weight:900; border:none; text-transform:uppercase; font-size:12px;">Pomiń Kolejkę</button>
            </div>
        `;
        return;
    }

    if (s.nextMatchDetermined !== s.matchIndex) {
        let playingLeague = activeLoanLeague ? activeLoanLeague : cState.league;
        let lData = CAREER_CONSTANTS[playingLeague];
        
        let benched = false;
        let formNum = parseFloat(currentForm);
        
        if (formNum >= 1.70) benched = false; 
        else if (formNum < 1.20 && cState.relations.manager < 50) benched = Math.random() < 0.6; 
        else if (cState.relations.manager < 30 && cState.attributes.prof < 40) benched = Math.random() < 0.8; 
        else if (formNum < 0.8) benched = true; 
        
        let moraleMod = 0;
        if (cState.relations.team > 80) moraleMod = 4;
        if (cState.relations.team < 30) moraleMod = -4;

        let trackComfort = nextMatch.isHome ? 8 : -10;
        let matchEffOvr = cState.ovr + moraleMod + trackComfort; 
        if (benched) matchEffOvr -= 15; 
        
        let ratio = matchEffOvr / lData.diff;
        let heatsInMatch = 0;
        
        if (benched) heatsInMatch = Math.random() < 0.3 ? 1 : 0;
        else if (cState.age <= 21) heatsInMatch = Math.floor(Math.random() * 2) + 3; 
        else if (ratio > 1.15 || formNum > 2.0) heatsInMatch = Math.floor(Math.random() * 2) + 5; 
        else if (ratio > 0.95 || formNum > 1.6) heatsInMatch = Math.floor(Math.random() * 2) + 4; 
        else if (ratio > 0.80) heatsInMatch = Math.floor(Math.random() * 2) + 3; 
        else heatsInMatch = Math.floor(Math.random() * 2) + 2; 

        if (cState.relations.manager > 80 && ratio > 1.0 && Math.random() < 0.5) heatsInMatch += 1;
        if (heatsInMatch > 7) heatsInMatch = 7;

        s.nextMatchBenched = benched;
        s.nextMatchHeats = heatsInMatch;
        s.nextMatchDetermined = s.matchIndex;
        saveCareer();
    }
    
    let isHome = nextMatch.isHome;
    let oppColor = getCareerClubColor(nextMatch.opp);
    
    let trainBtnOpacity = s.trainedThisWeek ? "0.3" : "1";
    let trainBtnCursor = s.trainedThisWeek ? "not-allowed" : "pointer";
    let trainBtnClick = s.trainedThisWeek ? "" : "startTrainingQTE()";

    area.innerHTML = `
        <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
            <div style="flex:1; min-width: 150px; background:rgba(0,0,0,0.4); border-radius:12px; padding:15px; border:1px solid rgba(255,255,255,0.05);">
                <div style="font-size:10px; color:var(--text-dim); font-weight:900; margin-bottom:10px;">RELACJE</div>
                ${drawRelationBar("Menedżer", cState.relations.manager, "#3498db")}
                ${drawRelationBar("Drużyna", cState.relations.team, "#2ecc71")}
                ${drawRelationBar("Kibice", cState.relations.fans, "#e74c3c")}
            </div>
            
            <div style="flex:1; min-width: 150px; background:rgba(0,0,0,0.4); border-radius:12px; padding:15px; border:1px solid rgba(255,255,255,0.05);">
                <div style="font-size:10px; color:var(--text-dim); font-weight:900; margin-bottom:10px;">CECHY ZAWODNIKA</div>
                ${drawRelationBar("Profesjonalizm", cState.attributes.prof, "#9b59b6")}
                ${drawRelationBar("Medialność", cState.attributes.media, "#f1c40f")}
                ${drawRelationBar("Podatność na urazy", cState.attributes.injRisk, "#e67e22")}
            </div>

            <div style="flex:1; min-width: 100%; background:rgba(0,0,0,0.4); border-radius:12px; padding:15px; border:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-around; align-items:center;">
                <div style="text-align:center;">
                    <div style="font-size:10px; color:var(--text-dim); font-weight:900;">ŚR. SEZONU</div>
                    <div style="font-size:26px; font-weight:900; color:#fff;">${avg}</div>
                </div>
                <div style="width:1px; height:40px; background:rgba(255,255,255,0.1);"></div>
                <div style="text-align:center;">
                    <div style="font-size:10px; color:var(--text-dim); font-weight:900;">AKTUALNA FORMA</div>
                    <div style="font-size:26px; font-weight:900; color:${parseFloat(currentForm) > 1.8 ? 'var(--green-neon)' : (parseFloat(currentForm) < 1.2 ? 'var(--red-neon)' : 'var(--accent)')};">${currentForm}</div>
                </div>
            </div>
        </div>

        <div style="background:rgba(255,255,255,0.03); border-radius:16px; padding:20px; border:1px solid rgba(255,255,255,0.1); text-align:center; position:relative;">
            <button onclick="showCareerCalendar()" class="icon-btn-small" style="position:absolute; top:15px; right:15px;" title="Kalendarz">📅</button>
            <div style="font-size:10px; font-weight:900; color:var(--accent); text-transform:uppercase; margin-bottom:5px;">Faza: ${nextMatch.type}</div>
            <div style="font-size:12px; font-weight:900; color:var(--text-dim); text-transform:uppercase; margin-bottom:5px;">Mecz ${currentRound} z ${totalMatches}</div>
            <div style="font-size:20px; font-weight:900; margin-bottom:10px;">vs <span style="color:${oppColor};">${nextMatch.opp}</span> <span style="font-size:12px; background: ${isHome?'rgba(0,255,102,0.2)':'rgba(255,51,51,0.2)'}; padding:2px 6px; border-radius:4px;">${isHome?'DOM':'WYJAZD'}</span></div>
            
            <div style="font-size:11px; font-weight:900; margin-bottom: 20px; padding: 6px 12px; border: 1px dashed ${s.nextMatchBenched ? 'var(--red-neon)' : 'var(--green-neon)'}; border-radius: 8px; display: inline-block; color: ${s.nextMatchBenched ? 'var(--red-neon)' : 'var(--green-neon)'}; text-transform: uppercase;">
                ${s.nextMatchBenched ? '❌ ODSUNIĘTY OD SKŁADU LUB REZERWA' : `✅ W PRZEWIDYWANYM SKŁADZIE`}
            </div>

            <div style="display:flex; gap:10px; justify-content:center;">
                <button onclick="${trainBtnClick}" class="hub-action-btn" style="opacity:${trainBtnOpacity}; cursor:${trainBtnCursor}; flex:1; padding:12px; border-radius:10px; background:rgba(52, 152, 219, 0.2); color:#3498db; font-weight:900; border:1px solid #3498db; text-transform:uppercase; font-size:12px;">🏋️ Trening</button>
                <button onclick="triggerMatchOrEvent()" class="hub-action-btn" style="flex:2; padding:12px; border-radius:10px; background:var(--accent); color:#000; font-weight:900; border:none; text-transform:uppercase; font-size:12px; box-shadow: 0 5px 15px rgba(241,196,15,0.3);">🏁 Jedź Mecz</button>
            </div>
        </div>
    `;
}

// Obsługa pomijania meczu z powodu kontuzji
window.skipInjuryRound = function() {
    let s = cState.season;
    s.injuryRounds--;
    simulateBotMatchesForCurrentRound(0, 0, true);
    s.matchResults.push("🚑");
    s.currentMatchScore = { me: 0, opp: 0 };
    s.matchIndex += 1;
    s.trainedThisWeek = false;
    saveCareer();
    renderCareerHub();
}

function renderCareerSeasonTable() {
    const tableBody = document.getElementById('careerSeasonTableBody');
    const meta = document.getElementById('careerSeasonMeta');
    if (!tableBody || !meta) return;

    const s = cState.season;
    const playingLeague = activeLoanLeague ? activeLoanLeague : cState.league;

    if (!s || !s.active || !s.table || s.table.length === 0) {
        meta.innerText = 'Brak aktywnego sezonu';
        tableBody.innerHTML = '<div class="text-dim text-xs font-bold">Tabela pojawi się po rozpoczęciu sezonu.</div>';
        return;
    }

    const totalMatches = s.schedule.length;
    const currentRound = Math.min(s.matchIndex + 1, totalMatches);
    const myRow = s.table.find(t => t.isMe);
    const myPos = myRow ? myRow.pos : '-';
    meta.innerText = `Runda ${currentRound}/${totalMatches} | Twoja pozycja: ${myPos}`;

    tableBody.innerHTML = `
        <div class="career-season-row" style="font-size:10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; font-weight: 900; background: transparent; border: none; padding: 0 12px 4px 12px;">
            <div class="career-season-col-pos">#</div>
            <div class="career-season-col-name">Zespół</div>
            <div class="career-season-col-matches">M</div>
            <div class="career-season-col-points">B</div>
            <div class="career-season-col-points">W</div>
            <div class="career-season-col-points">R</div>
            <div class="career-season-col-points">P</div>
            <div class="career-season-col-points">+/-</div>
            <div class="career-season-col-points">PKT</div>
        </div>
    `;

    s.table.forEach((row) => {
        const clubColor = getCareerClubColor(row.name);
        const isPlayer = row.isMe;
        tableBody.innerHTML += `
            <div class="career-season-row ${isPlayer ? 'active' : ''}">
                <div class="career-season-col-pos" style="color:${row.pos === 1 ? '#f1c40f' : row.pos >= s.table.length - 1 ? '#ff3333' : '#fff'};">${row.pos}</div>
                <div class="career-season-col-name" style="border-left: 3px solid ${clubColor}; padding-left: 10px; color: ${isPlayer ? '#fff' : '#d8d8d8'};">${row.name}</div>
                <div class="career-season-col-matches" style="color: var(--text-dim);">${row.matchesPlayed || 0}</div>
                <div class="career-season-col-points" style="color: #fff; font-weight: 900;">${row.b || 0}</div>
                <div class="career-season-col-points" style="color: #fff; font-weight: 900;">${row.w || 0}</div>
                <div class="career-season-col-points" style="color: #fff; font-weight: 900;">${row.r || 0}</div>
                <div class="career-season-col-points" style="color: #fff; font-weight: 900;">${row.p || 0}</div>
                <div class="career-season-col-points" style="color: ${((row.diff || 0) >= 0) ? 'var(--green-neon)' : 'var(--red-neon)'}; font-weight: 900;">${(row.diff || 0) >= 0 ? '+' : ''}${row.diff || 0}</div>
                <div class="career-season-col-points" style="color: #fff; font-weight: 900;">${row.pts}</div>
            </div>
        `;
    });
}

// ==========================================
// ====== LOGIKA FAZY PUCHAROWEJ (PLAY-OFF) =
// ==========================================

function updatePlayerScheduleFromFull(roundIdx) {
    let s = cState.season;
    let playingClub = activeLoanClub ? activeLoanClub : cState.club;
    let roundMatches = s.fullSchedule[roundIdx];
    
    if (!roundMatches) return;

    let myMatch = roundMatches.find(m => m.home === playingClub || m.away === playingClub);
    if (myMatch) {
        let isHome = myMatch.home === playingClub;
        s.schedule[roundIdx] = {
            opp: isHome ? myMatch.away : myMatch.home,
            isHome: isHome,
            type: myMatch.type,
            leg: myMatch.type.includes("Rewanż") || myMatch.type.includes("Rew.") ? 2 : 1
        };
    } else {
        s.schedule[roundIdx] = { opp: "PAUZA", isHome: true, type: "PAUZA", leg: 1 };
    }
}

function getAggWinner(leg1, leg2, highSeedName, lowSeedName) {
    let highScore = 0; let lowScore = 0;
    if (leg1 && leg1.homeScore !== undefined) {
        lowScore += leg1.homeScore;
        highScore += leg1.awayScore;
    }
    if (leg2 && leg2.homeScore !== undefined) {
        highScore += leg2.homeScore;
        lowScore += leg2.awayScore;
    }
    if (highScore > lowScore) return highSeedName;
    if (lowScore > highScore) return lowSeedName;
    return highSeedName; // W żużlu remis w dwumeczu wygrywa drużyna wyżej po rundzie zasadniczej
}

function generatePlayoffs() {
    let s = cState.season;
    let playingLeague = activeLoanLeague ? activeLoanLeague : cState.league;
    let table = s.table; 
    
    let round1 = [];
    let round2 = [];

    // TOP 4: 1. vs 4. oraz 2. vs 3. (Wyżej w tabeli jadą pierwszy mecz na wyjeździe!)
    let t1 = table[0].name, t2 = table[1].name, t3 = table[2].name, t4 = table[3].name;
    round1.push({home: t4, away: t1, type: "Półfinał"});
    round1.push({home: t3, away: t2, type: "Półfinał"});
    round2.push({home: t1, away: t4, type: "Półfinał (Rewanż)"});
    round2.push({home: t2, away: t3, type: "Półfinał (Rewanż)"});

    if (playingLeague !== "KLŻ") {
        // BOTTOM 4: 5. vs 8. oraz 6. vs 7. (Wyżej w tabeli na wyjeździe!)
        let t5 = table[4].name, t6 = table[5].name, t7 = table[6].name, t8 = table[7].name;
        round1.push({home: t8, away: t5, type: "O utrzymanie (Mecz 1)"});
        round1.push({home: t7, away: t6, type: "O utrzymanie (Mecz 1)"});
        round2.push({home: t5, away: t8, type: "O utrzymanie (Rewanż)"});
        round2.push({home: t6, away: t7, type: "O utrzymanie (Rewanż)"});
    }

    s.fullSchedule.push(round1);
    s.fullSchedule.push(round2);

    updatePlayerScheduleFromFull(s.regularSeasonLength);
    updatePlayerScheduleFromFull(s.regularSeasonLength + 1);

    s.playoffsGenerated = true;
    s.finalsGenerated = false;
    s.barazGenerated = false;
    
    // Dla KLŻ (powyżej 4 miejsca) omijamy dół drabinki i od razu zamykamy generatory
    let myTeamData = table.find(t => t.isMe);
    if (playingLeague === "KLŻ" && myTeamData && myTeamData.pos > 4) {
        s.finalsGenerated = true;
        s.barazGenerated = true;
    }

    saveCareer();
    renderCareerHub();
    appAlert("Runda zasadnicza zakończona! Zaczynamy decydującą fazę pucharową.", "Faza Finałowa");
}

function generateFinals() {
    let s = cState.season;
    let playingLeague = activeLoanLeague ? activeLoanLeague : cState.league;
    let table = s.table; 

    let r1 = s.fullSchedule[s.regularSeasonLength];
    let r2 = s.fullSchedule[s.regularSeasonLength + 1];
    
    let round1 = []; let round2 = [];

    // TOP 4 Finały
    let t1 = table[0].name, t2 = table[1].name, t3 = table[2].name, t4 = table[3].name;
    let sf1_leg1 = r1.find(m => m.home === t4 && m.away === t1);
    let sf1_leg2 = r2.find(m => m.home === t1 && m.away === t4);
    let sf1_winner = getAggWinner(sf1_leg1, sf1_leg2, t1, t4);
    let sf1_loser = sf1_winner === t1 ? t4 : t1;

    let sf2_leg1 = r1.find(m => m.home === t3 && m.away === t2);
    let sf2_leg2 = r2.find(m => m.home === t2 && m.away === t3);
    let sf2_winner = getAggWinner(sf2_leg1, sf2_leg2, t2, t3);
    let sf2_loser = sf2_winner === t2 ? t3 : t2;

    let f_highSeed = table.find(t => t.name === sf1_winner).pos < table.find(t => t.name === sf2_winner).pos ? sf1_winner : sf2_winner;
    let f_lowSeed = f_highSeed === sf1_winner ? sf2_winner : sf1_winner;
    let matchType1 = playingLeague === "KLŻ" ? "Finał (o Awans)" : "Finał";
    round1.push({home: f_lowSeed, away: f_highSeed, type: matchType1});
    round2.push({home: f_highSeed, away: f_lowSeed, type: matchType1 + " (Rewanż)"});

    s.semiLosers = [sf1_loser, sf2_loser]; // Zapisujemy żeby przydzielić pozycje w niższych ligach

    if (playingLeague === "PGE Ekstraliga") {
        let t_highSeed = table.find(t => t.name === sf1_loser).pos < table.find(t => t.name === sf2_loser).pos ? sf1_loser : sf2_loser;
        let t_lowSeed = t_highSeed === sf1_loser ? sf2_loser : sf1_loser;
        round1.push({home: t_lowSeed, away: t_highSeed, type: "Mecz o 3. miejsce"});
        round2.push({home: t_highSeed, away: t_lowSeed, type: "Mecz o 3. msc (Rewanż)"});
    }

    // BOTTOM 4 Finały Otrzymania
    if (playingLeague !== "KLŻ") {
        let t5 = table[4].name, t6 = table[5].name, t7 = table[6].name, t8 = table[7].name;
        
        let u1_leg1 = r1.find(m => m.home === t8 && m.away === t5);
        let u1_leg2 = r2.find(m => m.home === t5 && m.away === t8);
        let u1_winner = getAggWinner(u1_leg1, u1_leg2, t5, t8);
        let u1_loser = u1_winner === t5 ? t8 : t5;

        let u2_leg1 = r1.find(m => m.home === t7 && m.away === t6);
        let u2_leg2 = r2.find(m => m.home === t6 && m.away === t7);
        let u2_winner = getAggWinner(u2_leg1, u2_leg2, t6, t7);
        let u2_loser = u2_winner === t6 ? t7 : t6;

        s.playdownWinners = [u1_winner, u2_winner]; // Dla przypisania miejsc w M2E

        if (playingLeague === "PGE Ekstraliga") {
            let f5_highSeed = table.find(t => t.name === u1_winner).pos < table.find(t => t.name === u2_winner).pos ? u1_winner : u2_winner;
            let f5_lowSeed = f5_highSeed === u1_winner ? u2_winner : u1_winner;
            round1.push({home: f5_lowSeed, away: f5_highSeed, type: "Mecz o 5. miejsce"});
            round2.push({home: f5_highSeed, away: f5_lowSeed, type: "Mecz o 5. msc (Rewanż)"});
        }

        let f7_highSeed = table.find(t => t.name === u1_loser).pos < table.find(t => t.name === u2_loser).pos ? u1_loser : u2_loser;
        let f7_lowSeed = f7_highSeed === u1_loser ? u2_loser : u1_loser;
        round1.push({home: f7_lowSeed, away: f7_highSeed, type: "Baraż o utrzymanie"});
        round2.push({home: f7_highSeed, away: f7_lowSeed, type: "Baraż o utrzymanie (Rew.)"});
    }

    s.fullSchedule.push(round1);
    s.fullSchedule.push(round2);

    updatePlayerScheduleFromFull(s.regularSeasonLength + 2);
    updatePlayerScheduleFromFull(s.regularSeasonLength + 3);

    s.finalsGenerated = true;
    s.barazGenerated = false;

    let myTeamData = table.find(t => t.isMe);
    if (playingLeague === "KLŻ" && myTeamData && myTeamData.pos > 4) {
        s.barazGenerated = true;
    }

    saveCareer();
    renderCareerHub();
}

function assignFinalPositions() {
    let s = cState.season;
    let table = s.table;
    let playingLeague = activeLoanLeague ? activeLoanLeague : cState.league;
    let r1 = s.fullSchedule[s.regularSeasonLength + 2];
    let r2 = s.fullSchedule[s.regularSeasonLength + 3];

    if (r1 && r2) {
        r1.forEach(m1 => {
            let m2 = r2.find(m => m.home === m1.away && m.away === m1.home);
            if (!m2) return;
            let winner = getAggWinner(m1, m2, m1.away, m1.home);
            let loser = winner === m1.away ? m1.home : m1.away;
            
            let wRow = table.find(t => t.name === winner);
            let lRow = table.find(t => t.name === loser);
            if (!wRow || !lRow) return;

            if (m1.type.includes("Finał")) { wRow.pos = 1; lRow.pos = 2; }
            else if (m1.type.includes("3. miejsce")) { wRow.pos = 3; lRow.pos = 4; }
            else if (m1.type.includes("5. miejsce")) { wRow.pos = 5; lRow.pos = 6; }
            else if (m1.type.includes("utrzymanie")) { wRow.pos = 7; lRow.pos = 8; }
        });
    }

    // Automatyczne przydzielenie miejsc 3-4 i 5-6 dla niższych lig
    if (s.semiLosers && playingLeague !== "PGE Ekstraliga") {
        let loser1 = table.find(t => t.name === s.semiLosers[0]);
        let loser2 = table.find(t => t.name === s.semiLosers[1]);
        if (loser1 && loser2) {
            if (loser1.pos < loser2.pos) { loser1.pos = 3; loser2.pos = 4; }
            else { loser1.pos = 4; loser2.pos = 3; }
        }
    }

    if (s.playdownWinners && playingLeague !== "PGE Ekstraliga") {
        let w1 = table.find(t => t.name === s.playdownWinners[0]);
        let w2 = table.find(t => t.name === s.playdownWinners[1]);
        if (w1 && w2) {
            if (w1.pos < w2.pos) { w1.pos = 5; w2.pos = 6; }
            else { w1.pos = 6; w2.pos = 5; }
        }
    }

    table.sort((a,b) => a.pos - b.pos);
}

function generateBaraz() {
    let s = cState.season;
    let playingLeague = activeLoanLeague ? activeLoanLeague : cState.league;
    let table = s.table; 

    let r1 = s.fullSchedule[s.regularSeasonLength + 2];
    let r2 = s.fullSchedule[s.regularSeasonLength + 3];

    let barazMatch1 = r1 ? r1.find(m => m.type.includes("Baraż o utrzymanie")) : null;
    let barazMatch2 = r2 ? r2.find(m => m.type.includes("Baraż o utrzymanie")) : null;

    let winner7th = null;
    if (barazMatch1 && barazMatch2) {
        winner7th = getAggWinner(barazMatch1, barazMatch2, barazMatch1.away, barazMatch1.home); // away is highSeed
    }

    let finalMatch1 = r1 ? r1.find(m => m.type === "Finał" || m.type === "Finał (o Awans)") : null;
    let finalMatch2 = r2 ? r2.find(m => m.type === "Finał (Rewanż)" || m.type === "Finał (o Awans) (Rewanż)") : null;

    let loserFinal = null;
    if (finalMatch1 && finalMatch2) {
        let winnerFinal = getAggWinner(finalMatch1, finalMatch2, finalMatch1.away, finalMatch1.home);
        loserFinal = winnerFinal === finalMatch1.away ? finalMatch1.home : finalMatch1.away;
    }

    let myTeamData = table.find(t => t.isMe);
    let needsBaraz = false;
    let oppName = "Nieznany Rywal";

    if (myTeamData && playingLeague === "PGE Ekstraliga" && myTeamData.name === winner7th) {
        needsBaraz = true;
        oppName = cState.leagues["Metalkas 2.E"][1]; // 2. miejsce M2.E
    } else if (myTeamData && playingLeague === "Metalkas 2.E" && myTeamData.name === loserFinal) {
        needsBaraz = true;
        oppName = "7. drużyna PGE Ekstraligi";
    }

    if (needsBaraz) {
        // Tylko gracz jedzie baraż, bo to inter-ligowe spotkanie, którego nie da się łatwo zapisać w 1 tabeli
        s.fullSchedule.push([{home: myTeamData.name, away: oppName, type: "Baraż o Ekstraligę"}]);
        s.fullSchedule.push([{home: oppName, away: myTeamData.name, type: "Baraż o Ekstraligę (Rew.)"}]);
        
        updatePlayerScheduleFromFull(s.regularSeasonLength + 4);
        updatePlayerScheduleFromFull(s.regularSeasonLength + 5);
        
        appAlert("Twój zespół walczy w Wielkim Barażu o prawo jazdy w PGE Ekstralidze!", "Baraże");
    }

    s.barazGenerated = true;
    saveCareer();
    renderCareerHub();
}

function showMidSeasonEventWindow() {
    const area = document.getElementById('careerActionArea');
    const events = window.CAREER_CUSTOM_EVENTS || [];
    
    if (!events.length) {
        area.innerHTML = `<div class="text-center text-dim font-bold p-15">Brak eventów do wyświetlenia.</div>`;
        return;
    }

    let ev = events[Math.floor(Math.random() * events.length)];
    let chanceInfo = ev.opt1.chance ? ` <span style="color:var(--accent); font-size:10px;"><br>(${ev.opt1.chance}% szansy na +OVR)</span>` : '';

    area.innerHTML = `
        <h3 class="text-accent font-black m-0 mb-5 text-xl">Wydarzenie!</h3>
        ${ev.dilemma ? `<div class="text-xs font-black uppercase tracking-wide text-red mb-10">Dylemat</div>` : ''}
        <h4 class="text-white font-black m-0 mb-5">${ev.title}</h4>
        <p class="text-xs text-dim mb-15">${ev.desc}</p>
        <div class="copero-action-grid">
            <div class="copero-card" onclick="${ev.opt1.fn}">
                <span class="copero-card-club mb-5" style="line-height:1.2;">${ev.opt1.title}${chanceInfo}</span>
                <div class="copero-card-img" style="border-radius:12px;">${ev.img}</div>
                <span class="text-green font-bold text-xs">${ev.opt1.bot1}</span>
                <span class="text-red font-bold text-xs">${ev.opt1.bot2}</span>
            </div>
            <div class="copero-card stay-card" onclick="${ev.opt2.fn}">
                <span class="copero-card-club mb-10">${ev.opt2.title}</span>
                <div class="copero-card-img" style="border-radius:12px; background: transparent; border: 1px dashed rgba(255,255,255,0.2);">🤔</div>
                <span class="text-white font-bold text-xs">${ev.opt2.bot1}</span>
                <span class="text-dim font-bold text-xs">Brak ryzyka OVR</span>
            </div>
        </div>
    `;
}

function assignFinalPositions() {
    let s = cState.season;
    let table = s.table;
    let r1 = s.fullSchedule[s.regularSeasonLength + 2];
    let r2 = s.fullSchedule[s.regularSeasonLength + 3];

    if (r1 && r2) {
        r1.forEach(m1 => {
            let m2 = r2.find(m => m.home === m1.away && m.away === m1.home);
            if (!m2) return;
            let winner = getAggWinner(m1, m2, m1.away, m1.home);
            let loser = winner === m1.away ? m1.home : m1.away;
            
            let wRow = table.find(t => t.name === winner);
            let lRow = table.find(t => t.name === loser);
            if (!wRow || !lRow) return;

            if (m1.type.includes("Finał")) { wRow.pos = 1; lRow.pos = 2; }
            else if (m1.type.includes("3. miejsce")) { wRow.pos = 3; lRow.pos = 4; }
            else if (m1.type.includes("5. miejsce")) { wRow.pos = 5; lRow.pos = 6; }
            else if (m1.type.includes("utrzymanie")) { wRow.pos = 7; lRow.pos = 8; }
        });
    }
    table.sort((a,b) => a.pos - b.pos);
}

function endOfSeason() {
    let s = cState.season;
    let playingLeague = activeLoanLeague ? activeLoanLeague : cState.league;
    let playingClub = activeLoanClub ? activeLoanClub : cState.club;

    assignFinalPositions();

    cState.stats.heats += s.heats; 
    cState.stats.pts += s.pts;
    cState.stats.bon += s.bon;
    
    let officialAvg = s.heats > 0 ? ((s.pts + s.bon) / s.heats) : 0.0;
    if (officialAvg > 3.00) officialAvg = 3.00;

    let finalPos = 4;
    let myTeamData = s.table.find(t => t.isMe);
    if (myTeamData) finalPos = myTeamData.pos;

    let wonBarazOEkstralige = false;
    let playedBarazOEkstralige = false;
    let lastMatch = s.schedule[s.schedule.length - 1]; 

    if (lastMatch && lastMatch.type.includes("Baraż o Ekstraligę")) {
        playedBarazOEkstralige = true;
        let m1Res = s.matchResults[s.schedule.length - 2];
        let m2Res = s.matchResults[s.schedule.length - 1];
        if (m1Res && m2Res && m1Res !== "-" && m2Res !== "-") {
            let m1 = m1Res.split(':').map(Number);
            let m2 = m2Res.split(':').map(Number);
            let myAgg = m1[0] + m2[0];
            let oppAgg = m1[1] + m2[1];
            if (myAgg > oppAgg) wonBarazOEkstralige = true;
            else if (myAgg === oppAgg && playingLeague === "PGE Ekstraliga") wonBarazOEkstralige = true; 
        }
    }

    let ageGrowth = 0;
    let prof = cState.attributes.prof;
    let primeEnd = prof > 75 ? 34 : (prof < 40 ? 29 : 32); 

    if (cState.age <= 21) ageGrowth = Math.floor(Math.random() * 2) + 2; 
    else if (cState.age <= 24) ageGrowth = Math.random() < 0.8 ? 1 : 0;
    else if (cState.age <= primeEnd) ageGrowth = Math.random() < 0.3 ? 1 : 0; 
    else if (cState.age <= primeEnd + 4) ageGrowth = -Math.floor(Math.random() * 2) - 1; 
    else ageGrowth = -Math.floor(Math.random() * 3) - 1; 

    let perfGrowth = 0;
    if (officialAvg >= 2.40) perfGrowth = cState.age <= 23 ? 3 : 2;
    else if (officialAvg >= 2.00) perfGrowth = 1;
    else if (officialAvg >= 1.60) perfGrowth = 0;
    else if (officialAvg >= 1.20) perfGrowth = -1;
    else perfGrowth = -2;

    let totalGrowth = ageGrowth + perfGrowth;
    if (cState.ovr > 95 && totalGrowth > 0) totalGrowth -= 2; 
    else if (cState.ovr > 90 && totalGrowth > 0) totalGrowth -= 1;
    if (cState.age <= 21 && totalGrowth < 0) totalGrowth = 0; 
    
    cState.ovr = Math.max(30, Math.min(99, cState.ovr + totalGrowth));

    for (let club in cState.teamOVRs) {
        let change = Math.floor(Math.random() * 3) - 1;
        if (Math.random() < 0.02) change += 4;
        else if (Math.random() > 0.98) change -= 4;
        cState.teamOVRs[club] = Math.max(35, Math.min(95, cState.teamOVRs[club] + change));
    }

    let gotDMP = false;
    let medalColor = null;
    let promoted = false;
    let relegated = false;

    if (playingLeague === "PGE Ekstraliga") {
        if (finalPos === 1) { gotDMP = true; medalColor = "ZŁOTO"; cState.stats.dmpGold++; }
        else if (finalPos === 2) { gotDMP = true; medalColor = "SREBRO"; cState.stats.dmpSilver++; }
        else if (finalPos === 3) { gotDMP = true; medalColor = "BRĄZ"; cState.stats.dmpBronze++; }
        else if (finalPos === 8) relegated = true;
        if (playedBarazOEkstralige && !wonBarazOEkstralige) relegated = true; 
    } 
    else if (playingLeague === "Metalkas 2.E") {
        if (finalPos === 1) promoted = true;
        else if (finalPos === 8) relegated = true;
        if (playedBarazOEkstralige && wonBarazOEkstralige) promoted = true;
    } 
    else if (playingLeague === "KLŻ") {
        if (finalPos === 1) promoted = true;
    }

    function moveClubBetweenLeagues(club, fromLeague, toLeague, ovrDelta) {
        const fromList = cState.leagues[fromLeague];
        const toList = cState.leagues[toLeague];
        const fromIndex = fromList.indexOf(club);
        if (fromIndex === -1 || toList.includes(club)) return;
        fromList.splice(fromIndex, 1);
        toList.push(club);
        cState.teamOVRs[club] = Math.max(35, Math.min(95, (cState.teamOVRs[club] || 50) + ovrDelta));
    }

    let pgeTable = playingLeague === "PGE Ekstraliga" ? s.table : generateSeasonTable("PGE Ekstraliga", null, 0, 0);
    let e2Table = playingLeague === "Metalkas 2.E" ? s.table : generateSeasonTable("Metalkas 2.E", null, 0, 0);
    let klzTable = playingLeague === "KLŻ" ? s.table : generateSeasonTable("KLŻ", null, 0, 0);

    let pge8th = pgeTable.find(t => t.pos === 8).name;
    let pge7th = pgeTable.find(t => t.pos === 7).name;
    let e2_1st = e2Table.find(t => t.pos === 1).name;
    let e2_2nd = e2Table.find(t => t.pos === 2).name;
    let e2_8th = e2Table.find(t => t.pos === 8).name;
    let klz_1st = klzTable.find(t => t.pos === 1).name;

    let pgeDrops = [pge8th];
    let e2Promotes = [e2_1st];

    let barazWinnerWasM2E = false; 
    if (playedBarazOEkstralige) {
        if (playingLeague === "PGE Ekstraliga" && !wonBarazOEkstralige) barazWinnerWasM2E = true;
        if (playingLeague === "Metalkas 2.E" && wonBarazOEkstralige) barazWinnerWasM2E = true;
    }

    if (barazWinnerWasM2E) {
        pgeDrops.push(pge7th);
        e2Promotes.push(e2_2nd);
    }

    let e2Drops = [e2_8th];
    let klzPromotes = [klz_1st];

    pgeDrops.forEach(team => moveClubBetweenLeagues(team, "PGE Ekstraliga", "Metalkas 2.E", -2));
    e2Promotes.forEach(team => moveClubBetweenLeagues(team, "Metalkas 2.E", "PGE Ekstraliga", 3));
    e2Drops.forEach(team => moveClubBetweenLeagues(team, "Metalkas 2.E", "KLŻ", -2));
    klzPromotes.forEach(team => moveClubBetweenLeagues(team, "KLŻ", "Metalkas 2.E", 3));

    if (!activeLoanLeague) {
        for (let l in cState.leagues) {
            if (cState.leagues[l].includes(cState.club)) cState.league = l;
        }
    }

    let displayClubName = activeLoanLeague ? `${playingClub}` : cState.club;

    cState.history.push({
        age: cState.age, club: displayClubName, league: playingLeague, ovr: cState.ovr, 
        mec: s.schedule.length, bie: s.heats, pkt: s.pts, bon: s.bon, avg: officialAvg.toFixed(2),
        loan: activeLoanLeague !== null,
        dmp: gotDMP ? medalColor : null, table: s.table // USUNIĘTO IMS
    });

    cState.age++;
    if (!activeLoanLeague) cState.contractYears--;

    activeLoanClub = null; activeLoanLeague = null;
    cState.season.active = false;

    updateLeftPanelUI();
    renderTimeline();
    saveCareer();

    const proceedToNextStage = () => {
        if (cState.age > cState.maxAge) {
            showCareerEnd();
        } else {
            let nextFormRatio = cState.ovr / CAREER_CONSTANTS[cState.league].diff;
            if (cState.contractYears > 0 && nextFormRatio < 0.60 && cState.league !== "KLŻ" && cState.ovr < 75) {
                showLoanWindow();
            } else if (cState.contractYears <= 0) {
                generateTransferWindow();
            } else {
                startNewSeason();
            }
        }
    };

    if (gotDMP || promoted || relegated) {
        showTeamAchievement(playingClub, gotDMP, medalColor, promoted, relegated, proceedToNextStage);
    } else {
        proceedToNextStage();
    }
}

function renderTimeline() {
    const list = document.getElementById('timelineList');
    const header = document.getElementById('timelineHeader');
    const empty = document.getElementById('timelineEmpty');
    
    if (!list || !header || !empty) return;

    if (!cState.history || cState.history.length === 0) {
        list.innerHTML = '';
        header.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    header.style.display = 'flex';
    empty.style.display = 'none';
    list.innerHTML = '';

    cState.history.forEach(h => {
        let badges = "";
        if (h.dmp === "ZŁOTO") badges += "🥇";
        else if (h.dmp === "SREBRO") badges += "🥈";
        else if (h.dmp === "BRĄZ") badges += "🥉";
        // USUNIĘTO IMS

        let loanTag = h.loan ? `<span style="font-size:9px; color:var(--text-dim);">(W)</span>` : "";

        list.innerHTML += `
            <div class="timeline-row">
                <div class="t-age">${h.age}</div>
                <div class="t-club">${h.club} ${loanTag} <span style="font-size:10px;">${badges}</span></div>
                <div class="t-ovr">${h.ovr}</div>
                <div class="t-mec">${h.mec || 0}</div>
                <div class="t-bie">${h.bie || 0}</div>
                <div class="t-pkt">${h.pkt || 0}</div>
                <div class="t-avg">${h.avg || "0.00"}</div>
            </div>
        `;
    });

    const containerBox = document.getElementById('timelineContainerBox');
    if (containerBox) {
        containerBox.scrollTop = containerBox.scrollHeight;
    }
}

function shareCareerResult() {
    // Usunięto IMS ze stringa
    let text = `🏁 SPEEDWAY GUESSR: KARIERA\n👤 ${cState.name} #${cState.num}\n📊 OVR: ${cState.ovr} | OŚ: ${cState.history.length} sez.\n🏆 Złoto: ${cState.stats.dmpGold} | Srebro: ${cState.stats.dmpSilver} | Brąz: ${cState.stats.dmpBronze}\n📈 Punkty w karierze: ${cState.stats.pts}\n👉 Zagraj: speedwayguessr.pl`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast("Skopiowano podsumowanie do schowka!", "success");
        }).catch(() => {
            appAlert("Twój wynik:\n\n" + text, "Podsumowanie");
        });
    } else {
        appAlert("Twój wynik:\n\n" + text, "Podsumowanie");
    }
}

// ==========================================
// ====== OBSŁUGA KALENDARZA LIGOWEGO =======
// ==========================================

window.showCareerCalendar = function() {
    let s = cState.season;
    let overlay = document.getElementById('careerCalendarOverlay');
    
    // ZABEZPIECZENIE: Jeżeli w HTML nie ma kalendarza, tworzymy go na żywo!
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'careerCalendarOverlay';
        overlay.className = 'win-overlay';
        overlay.style.cssText = 'display: none; z-index: 10020;';
        overlay.innerHTML = `
            <div class="stats-modal modal-lg" style="max-width: 700px; padding: 25px;">
                <h2 class="text-accent mb-5 font-black uppercase" id="calendarOverlayTitle">KALENDARZ MECZÓW</h2>
                <p class="text-dim text-xs mb-20 font-bold" id="calendarOverlaySub">Sezon X</p>
                <div style="display: flex; gap: 15px; height: 350px;">
                    <div style="width: 35%; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow-y: auto; padding: 5px;" id="calendarRoundsList"></div>
                    <div style="flex: 1; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 15px; overflow-y: auto;" id="calendarMatchesList"></div>
                </div>
                <button onclick="closeCalendarOverlay()" class="btn-close w-100 mt-20 p-12 text-sm">ZAMKNIJ</button>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    
    document.getElementById('calendarOverlaySub').innerText = `Sezon ${2026 + cState.history.length}`;
    
    renderCalendarRoundsList(s.matchIndex);
    
    overlay.style.display = 'block'; 
    setTimeout(() => overlay.style.opacity = '1', 10);
}

window.renderCalendarRoundsList = function(selectedRoundIdx) {
    let s = cState.season;
    let playingLeague = activeLoanLeague ? activeLoanLeague : cState.league;
    const roundsList = document.getElementById('calendarRoundsList');
    roundsList.innerHTML = '';
    
    s.schedule.forEach((match, idx) => {
        let isPast = idx < s.matchIndex;
        let isCurrent = idx === s.matchIndex;
        let isSelected = idx === selectedRoundIdx;
        
        let bgClass = isSelected ? "background: rgba(241, 196, 15, 0.2);" : (isCurrent ? "background: rgba(255,255,255,0.1);" : "");
        let color = isSelected ? "var(--accent)" : (isPast ? "rgba(255,255,255,0.5)" : "#fff");
        
        let dateStr = getMatchDateString(idx + 1, playingLeague);
        
        roundsList.innerHTML += `
            <div onclick="renderCalendarMatchesList(${idx})" style="cursor: pointer; padding: 10px; margin-bottom: 5px; border-radius: 8px; ${bgClass} color: ${color}; font-size: 11px; font-weight: 700; border: 1px solid ${isSelected ? 'var(--accent)' : 'transparent'};">
                <div style="font-weight: 900; font-size: 12px;">Runda ${idx + 1}</div>
                <div style="font-size: 9px; opacity: 0.8;">${dateStr}</div>
                <div style="font-size: 10px; margin-top: 3px;">${match.type}</div>
            </div>
        `;
    });
    
    renderCalendarMatchesList(selectedRoundIdx);
}

window.renderCalendarMatchesList = function(roundIdx) {
    const roundsListDivs = document.getElementById('calendarRoundsList').children;
    for (let i = 0; i < roundsListDivs.length; i++) {
        let isSelected = i === roundIdx;
        roundsListDivs[i].style.background = isSelected ? "rgba(241, 196, 15, 0.2)" : (i === cState.season.matchIndex ? "rgba(255,255,255,0.1)" : "");
        roundsListDivs[i].style.color = isSelected ? "var(--accent)" : (i < cState.season.matchIndex ? "rgba(255,255,255,0.5)" : "#fff");
        roundsListDivs[i].style.border = isSelected ? "1px solid var(--accent)" : "1px solid transparent";
    }

    let s = cState.season;
    let playingClub = activeLoanClub ? activeLoanClub : cState.club;
    const matchesList = document.getElementById('calendarMatchesList');
    matchesList.innerHTML = `<h3 style="margin-top: 0; color: var(--accent); font-size: 14px; text-transform: uppercase;">Mecze Rundy ${roundIdx + 1}</h3>`;
    
    if (s.fullSchedule && s.fullSchedule[roundIdx]) {
        let roundMatches = s.fullSchedule[roundIdx];
        roundMatches.forEach(m => {
            let isMyMatch = m.home === playingClub || m.away === playingClub;
            let homeScore = m.homeScore !== undefined ? m.homeScore : "-";
            let awayScore = m.awayScore !== undefined ? m.awayScore : "-";
            
            if (isMyMatch && roundIdx < s.matchIndex) {
                let res = s.matchResults[roundIdx];
                if (res && res !== "-") {
                    let pts = res.split(":");
                    homeScore = m.home === playingClub ? pts[0] : pts[1];
                    awayScore = m.home === playingClub ? pts[1] : pts[0];
                } else if (res === "-") {
                    homeScore = "-"; awayScore = "-";
                }
            }
            
            let matchBg = isMyMatch ? "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2);" : "background: rgba(0,0,0,0.2);";
            let homeColor = m.home === playingClub ? 'var(--accent)' : '#fff';
            let awayColor = m.away === playingClub ? 'var(--accent)' : '#fff';
            
            matchesList.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; margin-bottom: 8px; border-radius: 8px; ${matchBg}">
                    <div style="flex: 1; text-align: right; font-weight: ${m.home===playingClub?'900':'600'}; color: ${homeColor}; font-size: 12px;">${m.home}</div>
                    <div style="width: 50px; text-align: center; font-weight: 900; font-size: 14px; background: rgba(0,0,0,0.5); padding: 5px; border-radius: 6px; margin: 0 10px;">
                        ${homeScore}:${awayScore}
                    </div>
                    <div style="flex: 1; text-align: left; font-weight: ${m.away===playingClub?'900':'600'}; color: ${awayColor}; font-size: 12px;">${m.away}</div>
                </div>
            `;
        });
    } else {
        let myMatch = s.schedule[roundIdx];
        if (myMatch) {
            let isHome = myMatch.isHome;
            let homeTeam = isHome ? playingClub : myMatch.opp;
            let awayTeam = isHome ? myMatch.opp : playingClub;
            
            let homeScore = "-";
            let awayScore = "-";
            if (roundIdx < s.matchIndex) {
                let res = s.matchResults[roundIdx];
                if (res && res !== "-") {
                    let pts = res.split(":");
                    homeScore = isHome ? pts[0] : pts[1];
                    awayScore = isHome ? pts[1] : pts[0];
                }
            }
            
            matchesList.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; margin-bottom: 8px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2);">
                    <div style="flex: 1; text-align: right; font-weight: ${isHome?'900':'600'}; color: ${isHome?'var(--accent)':'#fff'}; font-size: 12px;">${homeTeam}</div>
                    <div style="width: 50px; text-align: center; font-weight: 900; font-size: 14px; background: rgba(0,0,0,0.5); padding: 5px; border-radius: 6px; margin: 0 10px;">
                        ${homeScore}:${awayScore}
                    </div>
                    <div style="flex: 1; text-align: left; font-weight: ${!isHome?'900':'600'}; color: ${!isHome?'var(--accent)':'#fff'}; font-size: 12px;">${awayTeam}</div>
                </div>
            `;
        }
    }
}

window.closeCalendarOverlay = function() {
    const overlay = document.getElementById('careerCalendarOverlay');
    if(overlay) {
        overlay.style.opacity = '0'; 
        setTimeout(() => overlay.style.display = 'none', 300);
    }
}

// ==========================================
// ====== CENTRUM MINIGIER (TRENING) ========
// ==========================================

let activeMinigameData = null;

function clearActiveMinigame() {
    if (activeMinigameData) {
        clearInterval(activeMinigameData.interval);
        clearTimeout(activeMinigameData.timeout);
        if(activeMinigameData.cleanup) activeMinigameData.cleanup();
        activeMinigameData = null;
    }
}

function startTrainingQTE() {
    if (cState.season.trainedThisWeek) return;
    
    // Losowanie minigry i przejście do ekranu How To Play
    let roll = Math.random();
    if (roll < 0.25) showTrainingHTP('reflex');
    else if (roll < 0.50) showTrainingHTP('start');
    else if (roll < 0.75) showTrainingHTP('slide');
    else showTrainingHTP('mechanic');
}

function showTrainingHTP(type) {
    let simDiv = document.getElementById('simOverlay');
    if (!simDiv) {
        simDiv = document.createElement('div');
        simDiv.id = 'simOverlay';
        simDiv.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 10050; display: none; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(10px);`;
        document.body.appendChild(simDiv);
    }

    let title = "";
    let desc = "";
    let icon = "";
    let nextFn = null;

    if (type === 'reflex') {
        title = "TRENING REFLEKSU";
        icon = "⚡";
        desc = "Reaguj na pojawiające się sekwencje!<br><br>Wciskaj podane litery (<b>Q, W, E, A, S, D, SPACJA, SHIFT</b>), ich kombinacje (np. W + SHIFT), lub wykonuj przeciągnięcia myszką, trzymając <b>Lewy Przycisk Myszy (LPM)</b>.<br><br><span style='color:var(--yellow-neon); font-weight: 900;'>UWAGA: Kafelki potrafią nagle zmienić polecenie, zachowaj czujność!</span>";
        nextFn = startMinigameReflex;
    } else if (type === 'start') {
        title = "MOMENT STARTOWY";
        icon = "🚦";
        desc = "Wciśnij i <b>trzymaj SPACJĘ</b> (sprzęgło). Utrzymuj obroty silnika w zielonej strefie, <b style='color:#fff'>przytrzymując lub puszczając W</b>.<br><br>Gdy zapali się zielone światło – bądź gotów. Gdy światło zgaśnie i <b>taśma pójdzie w górę</b> – jak najszybciej <b>puść SPACJĘ</b>!<br><br><span style='color:var(--red-neon); font-weight: 900;'>UWAGA: Czas reakcji poniżej 0.150s traktowany jest jako falstart i dotknięcie taśmy!</span>";
        nextFn = startMinigameStart;
    } else if (type === 'slide') {
        title = "KONTROLOWANY ŚLIZG";
        icon = "🔄";
        desc = "Złap idealny balans podczas wchodzenia w łuk.<br><br>Używaj klawiszy <b>A (w lewo)</b> i <b>D (w prawo)</b>, aby korygować uślizg koła i utrzymać kursor wewnątrz bezpiecznej zielonej strefy przez 10 sekund.";
        nextFn = startMinigameSlide;
    } else if (type === 'mechanic') {
        title = "SZYBKI MECHANIK";
        icon = "⚙️";
        desc = "Liczy się ułamek sekundy! Otrzymasz zadanie założenia konkretnej zębatki (np. \"ZAŁÓŻ: 14 zębów\").<br><br>Odszukaj odpowiednią zębatkę, a następnie kliknij i <b>przeciągnij ją</b> na sprzęgło (kółko na środku).";
        nextFn = startMinigameMechanic;
    }

    simDiv.innerHTML = `
        <div style="background: var(--card-bg); padding: 40px; border-radius: 24px; border: 1px solid var(--border-color); text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.8); width: 90%; max-width: 600px; display: flex; flex-direction: column; align-items: center; user-select: none;">
            <div style="font-size: 60px; margin-bottom: 10px; filter: drop-shadow(0 0 10px rgba(255,255,255,0.2));">${icon}</div>
            <h2 style="color:var(--accent); font-weight:900; margin-bottom:20px; font-size:28px; text-transform:uppercase;">${title}</h2>
            
            <p style="color:var(--text-main); font-size:14px; font-weight:600; margin-bottom:30px; line-height: 1.6; text-align: left; background: rgba(0,0,0,0.4); padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                ${desc}
            </p>
            
            <button id="btnStartMinigameHTP" class="btn-reset w-100 p-15 text-lg" style="box-shadow: 0 5px 15px rgba(241,196,15,0.3);">ZROZUMIANO - START TRENINGU</button>
        </div>
    `;
    
    simDiv.style.display = 'flex';
    simDiv.oncontextmenu = (e) => e.preventDefault(); 
    
    document.getElementById('btnStartMinigameHTP').onclick = () => {
        simDiv.innerHTML = ''; 
        nextFn();
    };
}

function finishTraining(successType) {
    clearActiveMinigame();
    const simDiv = document.getElementById('simOverlay');
    cState.season.trainedThisWeek = true;
    
    let resultHTML = "";
    if (successType === 'perfect') {
        resultHTML = "<div style='color:#00ff66; font-size:28px; font-weight:900; margin-bottom:20px;'>PERFEKT! 🔥 +25% OVR</div>";
        cState.ovrProgress += 25;
        cState.relations.manager = Math.min(100, cState.relations.manager + 5);
    } else if (successType === 'good') {
        resultHTML = "<div style='color:#2ecc71; font-size:28px; font-weight:900; margin-bottom:20px;'>DOBRZE! 🟢 +10% OVR</div>";
        cState.ovrProgress += 10;
    } else {
        resultHTML = "<div style='color:#e74c3c; font-size:28px; font-weight:900; margin-bottom:20px;'>SŁABO! 🔴 Zmarnowany sprzęt...</div>";
        cState.relations.manager = Math.max(0, cState.relations.manager - 10);
    }
    
    simDiv.innerHTML = `
        <div style="background: var(--card-bg); padding: 40px; border-radius: 24px; border: 1px solid var(--border-color); text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.8); width: 90%; max-width: 600px;">
            <h2 style="color:#3498db; font-weight:900; margin-bottom:20px; font-size:36px;">KONIEC TRENINGU</h2>
            ${resultHTML}
        </div>
    `;
    
    if (cState.ovrProgress >= 100) {
        cState.ovrProgress -= 100;
        cState.ovr = Math.min(99, cState.ovr + 1);
        setTimeout(() => appAlert("Level UP! OVR rośnie o +1 dzięki treningom!", "Awans"), 1000);
    }
    
    updateLeftPanelUI();
    saveCareer();
    
    setTimeout(() => {
        simDiv.style.display = 'none';
        renderCareerHub();
    }, 2500);
}

function initSimDiv(content) {
    let simDiv = document.getElementById('simOverlay');
    if (!simDiv) {
        simDiv = document.createElement('div');
        simDiv.id = 'simOverlay';
        simDiv.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 10050; display: none; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(10px);`;
        document.body.appendChild(simDiv);
    }
    simDiv.innerHTML = content;
    simDiv.style.display = 'flex';
    simDiv.oncontextmenu = (e) => e.preventDefault(); // Blokada menu pod PPM
    return simDiv;
}

// ------------------------------------------
// MINIGRA 1: REFLEKS I QTE
// ------------------------------------------
function startMinigameReflex() {
    const html = `
        <div style="background: var(--card-bg); padding: 40px; border-radius: 24px; border: 1px solid var(--border-color); text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.8); width: 90%; max-width: 600px; user-select: none;">
            <h2 style="color:#3498db; font-weight:900; margin-bottom:10px; font-size:32px;">TRENING REFLEKSU</h2>
            <p style="color:var(--text-dim); font-size:14px; font-weight:700; margin-bottom:30px;">
                Wciskaj podane litery, kombinacje lub przeciągaj myszką!<br>
                <span style="color:var(--accent);">Wskazówka:</span> Do Swipe'ów przytrzymaj <b>LEWY</b> Przycisk Myszy (LPM).
            </p>
            <div id="qteKeyDisplay" style="font-size:40px; font-weight:900; color:#fff; background:rgba(255,255,255,0.1); width:100%; max-width:350px; height:160px; display:flex; justify-content:center; align-items:center; border-radius:20px; border:4px solid var(--accent); margin: 0 auto 30px; letter-spacing:2px;">?</div>
            <div style="width:100%; height:12px; background:rgba(255,255,255,0.1); border-radius:6px; overflow:hidden;">
                <div id="qteTimeBar" style="width:100%; height:100%; background:#e74c3c;"></div>
            </div>
            <div id="qteProgress" style="margin-top:20px; font-size:18px; color:var(--text-dim); font-weight:900;">Runda 1/5</div>
        </div>
    `;
    let simDiv = initSimDiv(html);
    
    let state = {
        rounds: 0, successes: 0, type: '', expKeys: [], pressKeys: [], expSwipe: '',
        timer: null, changeTimer: null, startX: 0, startY: 0
    };
    activeMinigameData = { state, cleanup: () => {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        simDiv.removeEventListener('mousedown', onSwipeStart);
        simDiv.removeEventListener('touchstart', onSwipeStart);
    }};

    function setupTask(isChange = false) {
        const display = document.getElementById('qteKeyDisplay');
        if (!display) return;
        
        state.pressKeys = [];
        let roll = Math.random();
        
        if (roll < 0.4) {
            state.type = 'single';
            const keys = ['Q', 'W', 'E', 'A', 'S', 'D', 'SPACE', 'SHIFT'];
            state.expKeys = [keys[Math.floor(Math.random() * keys.length)]];
            display.innerText = state.expKeys[0];
        } else if (roll < 0.7) {
            state.type = 'combo';
            const keys = ['Q', 'W', 'E', 'A', 'S', 'D', 'SPACE', 'SHIFT'];
            let k1 = keys[Math.floor(Math.random() * keys.length)];
            let k2 = keys[Math.floor(Math.random() * keys.length)];
            while(k1 === k2) k2 = keys[Math.floor(Math.random() * keys.length)];
            state.expKeys = [k1, k2];
            display.innerText = `${k1} + ${k2}`;
        } else {
            state.type = 'swipe';
            const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
            const emojis = {'UP': 'LPM + ⬆️', 'DOWN': 'LPM + ⬇️', 'LEFT': 'LPM + ⬅️', 'RIGHT': 'LPM + ➡️'};
            state.expSwipe = dirs[Math.floor(Math.random() * dirs.length)];
            display.innerText = emojis[state.expSwipe];
        }

        if (isChange) {
            display.style.animation = 'none'; display.offsetHeight; 
            display.style.animation = 'pulse 0.3s ease';
            display.style.color = 'var(--yellow-neon)';
            setTimeout(() => { if(document.getElementById('qteKeyDisplay')) document.getElementById('qteKeyDisplay').style.color = '#fff'; }, 300);
            playSound('flip');
        }
    }

    function nextRound() {
        state.rounds++;
        if (state.rounds > 5) {
            finishTraining(state.successes === 5 ? 'perfect' : (state.successes >= 3 ? 'good' : 'bad'));
            return;
        }
        
        const progEl = document.getElementById('qteProgress');
        if (progEl) progEl.innerText = `Runda ${state.rounds}/5`;
        
        const display = document.getElementById('qteKeyDisplay');
        if (display) {
            display.style.borderColor = "var(--accent)"; 
            display.style.color = "#fff";
        }
        
        setupTask();
        const timeBar = document.getElementById('qteTimeBar');
        if (timeBar) {
            timeBar.style.transition = 'none'; timeBar.style.width = '100%';
            
            let reactionTime = Math.max(420, Math.floor((1200 - (cState.ovr * 5)) * 0.65)) + 1500; 
            
            setTimeout(() => { 
                if(document.getElementById('qteTimeBar')) {
                    document.getElementById('qteTimeBar').style.transition = `width ${reactionTime}ms linear`; 
                    document.getElementById('qteTimeBar').style.width = '0%'; 
                }
            }, 50);
            
            if (Math.random() < 0.25) {
                state.changeTimer = setTimeout(() => setupTask(true), reactionTime * 0.4);
            }
            
            state.timer = setTimeout(failRound, reactionTime);
        }
    }

    function winRound() {
        clearTimeout(state.timer); clearTimeout(state.changeTimer);
        const display = document.getElementById('qteKeyDisplay');
        if (display) {
            playSound('guess'); state.successes++;
            display.innerText = "✅"; display.style.borderColor = "var(--green-neon)"; display.style.color = "var(--green-neon)";
        }
        state.type = ''; setTimeout(nextRound, 1000);
    }

    function failRound() {
        clearTimeout(state.timer); clearTimeout(state.changeTimer);
        const display = document.getElementById('qteKeyDisplay');
        if (display) {
            playSound('error');
            display.innerText = "❌"; display.style.borderColor = "var(--red-neon)"; display.style.color = "var(--red-neon)";
        }
        state.type = ''; setTimeout(nextRound, 1000);
    }

    const onSwipeStart = (e) => {
        if (state.type !== 'swipe') return;
        if (e.type === 'touchstart') { state.startX = e.touches[0].clientX; state.startY = e.touches[0].clientY; } 
        else { if (e.button !== 0) return; e.preventDefault(); state.startX = e.clientX; state.startY = e.clientY; }
        document.addEventListener('mouseup', onSwipeEnd); document.addEventListener('touchend', onSwipeEnd);
    };

    const onSwipeEnd = (e) => {
        document.removeEventListener('mouseup', onSwipeEnd); document.removeEventListener('touchend', onSwipeEnd);
        if (state.type !== 'swipe') return;
        let endX = e.type === 'touchend' ? e.changedTouches[0].clientX : e.clientX;
        let endY = e.type === 'touchend' ? e.changedTouches[0].clientY : e.clientY;
        let dx = endX - state.startX; let dy = endY - state.startY;
        
        if (Math.abs(dx) > 40 || Math.abs(dy) > 40) {
            let dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'RIGHT' : 'LEFT') : (dy > 0 ? 'DOWN' : 'UP');
            if (dir === state.expSwipe) winRound(); else failRound();
        }
    };

    const onKeyDown = (e) => {
        if (state.type === 'swipe' || e.repeat) return;
        let key = e.key.toUpperCase(); if (key === ' ') key = 'SPACE';
        if (!['Q','W','E','A','S','D','SPACE','SHIFT'].includes(key)) return;
        
        if (state.type === 'single') {
            if (state.expKeys.includes(key)) winRound(); else failRound();
        } else if (state.type === 'combo') {
            if (!state.pressKeys.includes(key)) state.pressKeys.push(key);
            let allPressed = state.expKeys.every(k => state.pressKeys.includes(k));
            let onlyExpPressed = state.pressKeys.every(k => state.expKeys.includes(k));
            if (allPressed && onlyExpPressed) winRound();
            else if (state.pressKeys.length >= state.expKeys.length && !allPressed) failRound();
        }
    };

    const onKeyUp = (e) => {
        if (state.type !== 'combo') return;
        let key = e.key.toUpperCase(); if (key === ' ') key = 'SPACE';
        state.pressKeys = state.pressKeys.filter(k => k !== key);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    simDiv.addEventListener('mousedown', onSwipeStart);
    simDiv.addEventListener('touchstart', onSwipeStart, {passive: false});

    setTimeout(nextRound, 1000);
}

// ------------------------------------------
// MINIGRA 2: START SPOD TAŚMY
// ------------------------------------------
function startMinigameStart() {
    const html = `
        <div style="background: var(--card-bg); padding: 30px; border-radius: 24px; border: 1px solid var(--border-color); text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.8); width: 90%; max-width: 600px; user-select: none;">
            <h2 style="color:#3498db; font-weight:900; margin-bottom:5px; font-size:28px;">MOMENT STARTOWY</h2>
            <p style="color:var(--text-dim); font-size:12px; font-weight:700; margin-bottom:20px;">Trzymaj <b style="color:#fff">SPACJĘ</b> (Sprzęgło) by rozpocząć. Utrzymuj obroty na zielonym polu, <b style="color:#fff">trzymając lub puszczając W</b>. Gdy zapali się zielone światło – uważaj. Gdy zgaśnie i taśma pójdzie w górę – puść SPACJĘ!</p>
            
            <div style="position:relative; width:100%; height:200px; background:#222; border-radius:12px; border:2px solid #444; overflow:hidden; margin-bottom:20px;">
                <div id="mgLight" style="position:absolute; top:20px; left:50%; transform:translateX(-50%); width:40px; height:40px; border-radius:50%; background:#111; border:2px solid #000; box-shadow: inset 0 0 10px #000;"></div>
                <div id="mgTape" style="position:absolute; bottom:50px; left:0; width:100%; height:10px; background:repeating-linear-gradient(45deg, #fff, #fff 10px, #ff3333 10px, #ff3333 20px); transition: bottom 0.1s; box-shadow: 0 5px 15px rgba(0,0,0,0.5);"></div>
                <div style="position:absolute; bottom:-20px; left:50%; transform:translateX(-50%); font-size: 80px;">🏍️</div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div style="font-size:12px; font-weight:900; color:var(--text-dim);">OBROTY (W)</div>
                <div id="mgRpmStatus" style="font-size:12px; font-weight:900; color:var(--red-neon);">ZA NISKIE!</div>
            </div>
            <div style="width:100%; height:20px; background:#111; border-radius:10px; border:1px solid #333; position:relative; overflow:hidden;">
                <div style="position:absolute; left:35%; width:30%; height:100%; background:rgba(0,255,102,0.3); border-left:2px solid #00ff66; border-right:2px solid #00ff66; z-index:1;"></div>
                <div id="mgRpmBar" style="position:absolute; left:0; top:0; height:100%; width:10%; background:#fff; z-index:2; transition: width 0.1s;"></div>
            </div>
        </div>
    `;
    let simDiv = initSimDiv(html);

    let state = {
        phase: 'wait', // wait, holding, ready (green light), gone
        rpm: 0,
        tapeTime: 0,
        releaseTime: 0,
        rpmInterval: null,
        wHeld: false
    };
    
    activeMinigameData = { state, cleanup: () => {
        document.removeEventListener('keydown', onKD);
        document.removeEventListener('keyup', onKU);
    }};

    const light = document.getElementById('mgLight');
    const tape = document.getElementById('mgTape');
    const rpmBar = document.getElementById('mgRpmBar');
    const rpmStat = document.getElementById('mgRpmStatus');

    function loop() {
        if(state.phase === 'finished') return;
        
        if(state.phase === 'holding' || state.phase === 'ready') {
            
            if (state.wHeld) {
                state.rpm += 4; // Gaz rośnie po wciśnięciu
            } else {
                state.rpm -= 3; // Gaz spada po puszczeniu
            }

            if(state.rpm < 0) state.rpm = 0;
            if(state.rpm > 100) state.rpm = 100;

            rpmBar.style.width = state.rpm + '%';
            
            if(state.rpm >= 35 && state.rpm <= 65) {
                rpmBar.style.background = '#00ff66'; rpmStat.innerText = "IDEALNIE"; rpmStat.style.color = '#00ff66';
            } else if (state.rpm > 65) {
                rpmBar.style.background = '#ff3333'; rpmStat.innerText = "ZA WYSOKIE!"; rpmStat.style.color = '#ff3333';
            } else {
                rpmBar.style.background = '#ffcc00'; rpmStat.innerText = "ZA NISKIE!"; rpmStat.style.color = '#ffcc00';
            }
        }
    }

    state.rpmInterval = setInterval(loop, 50);

    const onKD = (e) => {
        if(e.repeat) return;
        let key = e.key.toUpperCase();
        if (key === ' ' || key === 'SPACE') {
            if(state.phase === 'wait') {
                state.phase = 'holding';
                // Za 2-3 sekundy zapal zielone światło
                setTimeout(() => {
                    if(state.phase === 'holding') {
                        state.phase = 'ready';
                        light.style.background = '#00ff66';
                        light.style.boxShadow = '0 0 20px #00ff66';
                        playSound('guess'); // pyk
                        
                        // Za 1-3 sekundy taśma w górę
                        setTimeout(() => {
                            if(state.phase === 'ready') {
                                state.phase = 'gone';
                                state.tapeTime = Date.now();
                                light.style.background = '#111';
                                light.style.boxShadow = 'inset 0 0 10px #000';
                                tape.style.bottom = '250px';
                                playSound('win'); // bum!
                            }
                        }, 1000 + Math.random() * 2000);
                    }
                }, 1000 + Math.random() * 1500);
            }
        }
        if (key === 'W') {
            state.wHeld = true;
        }
    };

    const onKU = (e) => {
        let key = e.key.toUpperCase();
        if (key === ' ' || key === 'SPACE') {
            if(state.phase === 'holding' || state.phase === 'ready') {
                // Falstart
                state.phase = 'finished';
                tape.style.bottom = '250px'; // wplątany
                appAlert("Wjechałeś w taśmę! (Falstart)", "Wykluczenie");
                finishTraining('bad');
            } else if (state.phase === 'gone') {
                state.phase = 'finished';
                state.releaseTime = Date.now();
                let reactMs = state.releaseTime - state.tapeTime;
                
                let rpmWasGood = (state.rpm >= 35 && state.rpm <= 65);
                let msg = `Czas reakcji: ${(reactMs/1000).toFixed(3)}s\nObroty: ${rpmWasGood ? "Dobre" : "Złe"}\n\n`;
                
                if (!rpmWasGood) {
                    appAlert(msg + "Słabe panowanie nad sprzęgłem sprawiło, że zostałeś na starcie.", "Słabo");
                    finishTraining('bad');
                } else if (reactMs < 150) {
                    appAlert(msg + "Dotknąłeś taśmy! Zbyt wczesny start (poniżej 0.150s uważa się za wstrzelenie).", "Wykluczenie");
                    finishTraining('bad');
                } else if (reactMs <= 250) {
                    appAlert(msg + "Atomowy start! Wygrywasz dojazd do łuku.", "Perfekt");
                    finishTraining('perfect');
                } else if (reactMs <= 450) {
                    appAlert(msg + "Dobry start, jedziesz w kontakcie.", "Dobrze");
                    finishTraining('good');
                } else {
                    appAlert(msg + "Zostałeś na starcie. Słaby refleks.", "Słabo");
                    finishTraining('bad');
                }
            }
        }
        if (key === 'W') {
            state.wHeld = false;
        }
    };

    document.addEventListener('keydown', onKD);
    document.addEventListener('keyup', onKU);
}

// ------------------------------------------
// MINIGRA 3: KONTROLOWANY ŚLIZG
// ------------------------------------------
function startMinigameSlide() {
    const html = `
        <div style="background: var(--card-bg); padding: 30px; border-radius: 24px; border: 1px solid var(--border-color); text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.8); width: 90%; max-width: 600px; user-select: none;">
            <h2 style="color:#3498db; font-weight:900; margin-bottom:5px; font-size:28px;">KONTROLOWANY ŚLIZG</h2>
            <p style="color:var(--text-dim); font-size:12px; font-weight:700; margin-bottom:20px;">Używaj klawiszy <b style="color:#fff">A</b> i <b style="color:#fff">D</b> aby balansować i utrzymać się w bezpiecznej (zielonej) strefie przez 10 sekund!</p>
            
            <div style="font-size: 80px; margin-bottom:20px; transition: transform 0.1s;" id="mgSlideRider">🏍️</div>

            <div style="width:100%; height:30px; background:#111; border-radius:15px; border:2px solid #333; position:relative; overflow:hidden; margin-bottom: 20px;">
                <div style="position:absolute; left:25%; width:50%; height:100%; background:rgba(0,255,102,0.15); border-left:2px dashed rgba(0,255,102,0.5); border-right:2px dashed rgba(0,255,102,0.5); z-index:1;"></div>
                <div id="mgSlideCursor" style="position:absolute; top:-5px; left:50%; width:10px; height:40px; background:#fff; z-index:2; transform:translateX(-50%); box-shadow: 0 0 10px #fff; border-radius:5px;"></div>
            </div>

            <div style="font-size:18px; font-weight:900; color:var(--accent);" id="mgSlideTimer">10.0s</div>
        </div>
    `;
    let simDiv = initSimDiv(html);

    let state = {
        pos: 50, vel: 0, timeLeft: 10.0,
        interval: null
    };

    activeMinigameData = { state, cleanup: () => {
        document.removeEventListener('keydown', onKD);
    }};

    const cursor = document.getElementById('mgSlideCursor');
    const rider = document.getElementById('mgSlideRider');
    const timerText = document.getElementById('mgSlideTimer');

    function loop() {
        state.vel += (Math.random() - 0.5) * 2.5; // Losowy wiatr/dziury
        state.pos += state.vel;

        if(state.pos < 0 || state.pos > 100) {
            clearInterval(state.interval);
            rider.style.transform = `rotate(${state.pos < 0 ? -90 : 90}deg)`;
            appAlert("Upadek! Straciłeś panowanie nad motocyklem.", "Kraksa");
            finishTraining('bad');
            return;
        }

        cursor.style.left = `${state.pos}%`;
        rider.style.transform = `rotate(${(state.pos - 50) * 1.5}deg)`;

        state.timeLeft -= 0.05;
        timerText.innerText = Math.max(0, state.timeLeft).toFixed(1) + "s";

        if(state.timeLeft <= 0) {
            clearInterval(state.interval);
            appAlert("Świetny balans! Przejechałeś łuk płynnie.", "Perfekt");
            finishTraining('perfect');
        }
    }

    state.interval = setInterval(loop, 50);

    const onKD = (e) => {
        if(e.repeat) return;
        let key = e.key.toUpperCase();
        if(key === 'A') state.vel -= 3;
        if(key === 'D') state.vel += 3;
    };
    document.addEventListener('keydown', onKD);
}

// ------------------------------------------
// MINIGRA 4: SZYBKI MECHANIK
// ------------------------------------------
function startMinigameMechanic() {
    const html = `
        <div style="background: var(--card-bg); padding: 30px; border-radius: 24px; border: 1px solid var(--border-color); text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.8); width: 90%; max-width: 600px; user-select: none; position: relative;">
            <h2 style="color:#3498db; font-weight:900; margin-bottom:5px; font-size:28px;">WYMIANA ZĘBATEK</h2>
            <p style="color:var(--text-dim); font-size:12px; font-weight:700; margin-bottom:20px;">Przeciągnij odpowiednią zębatkę na sprzęgło (kółko na środku)!</p>
            
            <div id="mgMechTargetText" style="font-size:24px; font-weight:900; color:var(--accent); margin-bottom:15px; text-transform:uppercase;">ZAŁÓŻ: <span id="mgTargetZeb"></span>z</div>

            <div id="mgDropzone" style="width: 100px; height: 100px; border: 4px dashed var(--text-dim); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; font-size: 30px; background: rgba(0,0,0,0.3); transition: 0.2s;">⚙️</div>

            <div id="mgMechItems" style="display:flex; justify-content:center; gap:15px; margin-bottom:20px; min-height: 60px; position:relative;"></div>

            <div style="width:100%; height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                <div id="mgMechTimeBar" style="width: 100%; height: 100%; background: #e74c3c;"></div>
            </div>
            
            <div id="mgMechProgress" style="margin-top: 15px; font-size: 14px; color: var(--text-dim); font-weight: 900;">Runda 1/5</div>
        </div>
    `;
    let simDiv = initSimDiv(html);

    let state = {
        rounds: 0, successes: 0, target: 0, timer: null,
        draggedEl: null, dragOffsetX: 0, dragOffsetY: 0
    };

    activeMinigameData = { state, cleanup: () => {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
    }};

    const dropzone = document.getElementById('mgDropzone');

    function nextRound() {
        state.rounds++;
        if(state.rounds > 5) {
            finishTraining(state.successes === 5 ? 'perfect' : (state.successes >= 3 ? 'good' : 'bad'));
            return;
        }

        const progEl = document.getElementById('mgMechProgress');
        if (progEl) progEl.innerText = `Runda ${state.rounds}/5`;
        
        let sizes = [13, 14, 15, 16, 55, 56, 57, 58, 59, 60].sort(() => 0.5 - Math.random()).slice(0, 4);
        state.target = sizes[Math.floor(Math.random() * 4)];
        
        const targetZeb = document.getElementById('mgTargetZeb');
        if (targetZeb) targetZeb.innerText = state.target;
        
        const txtTarget = document.getElementById('mgMechTargetText');
        if (txtTarget) {
            txtTarget.style.color = "var(--accent)";
            txtTarget.innerText = `ZAŁÓŻ: ${state.target} zębów`;
        }
        
        if (dropzone) dropzone.style.borderColor = "var(--text-dim)";
        
        const container = document.getElementById('mgMechItems');
        if (container) {
            container.innerHTML = '';
            sizes.forEach(size => {
                let el = document.createElement('div');
                el.className = 'gear-item';
                el.style.cssText = 'width:50px; height:50px; border-radius:50%; background:var(--card-bg); border:2px solid #ccc; display:flex; align-items:center; justify-content:center; font-weight:900; color:#fff; cursor:grab; touch-action:none; z-index:100; font-size:16px;';
                el.innerText = `${size}`;
                el.dataset.size = size;
                
                el.addEventListener('pointerdown', (e) => {
                    state.draggedEl = el;
                    el.style.position = 'absolute';
                    el.style.cursor = 'grabbing';
                    let rect = el.getBoundingClientRect();
                    state.dragOffsetX = e.clientX - rect.left;
                    state.dragOffsetY = e.clientY - rect.top;
                    
                    let containerRect = container.getBoundingClientRect();
                    el.style.left = (e.clientX - containerRect.left - state.dragOffsetX) + 'px';
                    el.style.top = (e.clientY - containerRect.top - state.dragOffsetY) + 'px';
                });
                
                container.appendChild(el);
            });
        }

        const timeBar = document.getElementById('mgMechTimeBar');
        if (timeBar) {
            timeBar.style.transition = 'none'; timeBar.style.width = '100%';
            
            let time = 3500; 
            setTimeout(() => { 
                if(document.getElementById('mgMechTimeBar')) {
                    document.getElementById('mgMechTimeBar').style.transition = `width ${time}ms linear`; 
                    document.getElementById('mgMechTimeBar').style.width = '0%'; 
                }
            }, 50);
            
            state.timer = setTimeout(() => {
                playSound('error');
                const txt = document.getElementById('mgMechTargetText');
                if (txt) {
                    txt.innerText = "ZBYT WOLNO!";
                    txt.style.color = "var(--red-neon)";
                }
                setTimeout(nextRound, 800);
            }, time);
        }
    }

    const onPointerMove = (e) => {
        if (!state.draggedEl) return;
        const container = document.getElementById('mgMechItems');
        if(!container || !dropzone) return;
        
        const containerRect = container.getBoundingClientRect();
        state.draggedEl.style.left = (e.clientX - containerRect.left - state.dragOffsetX) + 'px';
        state.draggedEl.style.top = (e.clientY - containerRect.top - state.dragOffsetY) + 'px';
        
        const dropRect = dropzone.getBoundingClientRect();
        if (e.clientX > dropRect.left && e.clientX < dropRect.right && e.clientY > dropRect.top && e.clientY < dropRect.bottom) {
            dropzone.style.borderColor = "var(--accent)";
            dropzone.style.background = "rgba(241,196,15,0.2)";
        } else {
            dropzone.style.borderColor = "var(--text-dim)";
            dropzone.style.background = "rgba(0,0,0,0.3)";
        }
    };

    const onPointerUp = (e) => {
        if (!state.draggedEl) return;
        if (!dropzone) return;

        const dropRect = dropzone.getBoundingClientRect();
        const size = parseInt(state.draggedEl.dataset.size);
        
        if (e.clientX > dropRect.left && e.clientX < dropRect.right && e.clientY > dropRect.top && e.clientY < dropRect.bottom) {
            clearTimeout(state.timer);
            const txt = document.getElementById('mgMechTargetText');

            if (size === state.target) {
                playSound('guess');
                state.successes++;
                if(txt) { txt.innerText = "DOBRZE!"; txt.style.color = "var(--green-neon)"; }
                dropzone.style.borderColor = "var(--green-neon)";
            } else {
                playSound('error');
                if(txt) { txt.innerText = "ZŁA ZĘBATKA!"; txt.style.color = "var(--red-neon)"; }
                dropzone.style.borderColor = "var(--red-neon)";
            }
            state.draggedEl.style.display = 'none';
            state.draggedEl = null;
            setTimeout(nextRound, 800);
        } else {
            state.draggedEl.style.position = 'static';
            state.draggedEl.style.cursor = 'grab';
            state.draggedEl = null;
            dropzone.style.borderColor = "var(--text-dim)";
            dropzone.style.background = "rgba(0,0,0,0.3)";
        }
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);

    nextRound();
}

// ==========================================
// ====== DECYZJE TAKTYCZNE W BIEGU =========
// ==========================================

// ==========================================
// ====== DECYZJE TAKTYCZNE W BIEGU =========
// ==========================================

function promptHeatDecision(ovr, form, prof) {
    return new Promise(resolve => {
        const box = document.getElementById('simDecisionBox');
        if(!box) {
            resolve({ type: 'follow', chance: 90 });
            return;
        }
        
        box.style.display = 'flex';
        
        // Zestaw bardziej realistycznych sytuacji
        const situations = [
            {
                text: "Rywale zamknęli Cię po starcie w 'kanapce'. Jesteś trzeci.",
                fol: { n: "Siedź na kole", b: 80, desc: "Czekasz na błąd" },
                mid: { n: "Rozpychaj się", b: 40, desc: "Agresywnie wchodzisz między nich" },
                out: { n: "Wyjazd na dużą", b: 50, desc: "Szukasz prędkości po zewn." },
                cut: { n: "Ostre nożyce", b: 35, desc: "Schodzisz do krawężnika" }
            },
            {
                text: "Prowadzisz, ale tor jest wyjątkowo śliski po opadach deszczu.",
                fol: { n: "Trzymaj krawężnik", b: 85, desc: "Najbezpieczniejsza ścieżka" },
                mid: { n: "Płynna jazda", b: 65, desc: "Szukasz przyczepności" },
                out: { n: "Atak szerzej", b: 30, desc: "Bardzo wysokie ryzyko upadku!" },
                cut: { n: "Asekuracja", b: 70, desc: "Pilnujesz wewnętrznej" }
            },
            {
                text: "Jedziesz drugi. Lider zostawia mnóstwo miejsca pod bandą.",
                fol: { n: "Jedź jego śladem", b: 75, desc: "Nie ryzykujesz" },
                mid: { n: "Atak środkiem", b: 50, desc: "Próbujesz go wyprzedzić" },
                out: { n: "Napędź się pod bandą", b: 75, desc: "Idealna okazja na atak!" },
                cut: { n: "Pikuj w krawężnik", b: 40, desc: "Niespodziewany atak z dołu" }
            },
            {
                text: "Zostałeś na starcie... Musisz gonić z czwartej pozycji!",
                fol: { n: "Czekaj z tyłu", b: 90, desc: "Może komuś zdefektuje motocykl" },
                mid: { n: "Ostra pogoń", b: 50, desc: "Jazda na limicie" },
                out: { n: "Ryzykowny atak po dużej", b: 40, desc: "All-in po zewnętrznej" },
                cut: { n: "Ścinka na pierwszym łuku", b: 55, desc: "Próbujesz wejść pod łokieć" }
            }
        ];
        
        let sit = situations[Math.floor(Math.random() * situations.length)];
        
        // Modifikatory szans
        let ovrMod = Math.floor((ovr - 50) / 2); 
        let formMod = (form - 1.5) * 10; 
        let profMod = (prof - 50) / 5; 
        
        let totalMod = ovrMod + formMod + profMod;

        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
        const applyMod = (base) => clamp(base + totalMod + (Math.floor(Math.random() * 11) - 5), 5, 95);

        let cFol = applyMod(sit.fol.b);
        let cMid = applyMod(sit.mid.b);
        let cOut = applyMod(sit.out.b);
        let cCut = applyMod(sit.cut.b);

        document.getElementById('simDecTitle').innerText = sit.text;
        document.getElementById('btnDecFol').innerHTML = `<b>${sit.fol.n}</b><br><small style="color:#aaa;">Szansa: ${Math.round(cFol)}%<br>(${sit.fol.desc})</small>`;
        document.getElementById('btnDecMid').innerHTML = `<b>${sit.mid.n}</b><br><small style="color:#aaa;">Szansa: ${Math.round(cMid)}%<br>(${sit.mid.desc})</small>`;
        document.getElementById('btnDecOut').innerHTML = `<b>${sit.out.n}</b><br><small style="color:#aaa;">Szansa: ${Math.round(cOut)}%<br>(${sit.out.desc})</small>`;
        document.getElementById('btnDecCut').innerHTML = `<b>${sit.cut.n}</b><br><small style="color:#aaa;">Szansa: ${Math.round(cCut)}%<br>(${sit.cut.desc})</small>`;

        let answered = false;
        window.resolveSimDecision = (type) => {
            if(answered) return;
            answered = true;
            box.style.display = 'none';
            let pickedChance = type === 'follow' ? cFol : (type === 'middle' ? cMid : (type === 'outside' ? cOut : cCut));
            resolve({ type, chance: pickedChance });
        };
    });
}

// Zmodyfikowany playSingleMatch - zawiera logikę kontuzji, formy oraz Poprawiony Dwumecz!
async function playSingleMatch() {
    let simDiv = document.getElementById('simOverlay');
    if (!simDiv) {
        simDiv = document.createElement('div');
        simDiv.id = 'simOverlay';
        simDiv.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 10050; display: none; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(10px);`;
        document.body.appendChild(simDiv);
    }
    
    simDiv.innerHTML = `
        <h2 style="color:var(--accent); font-weight:900; margin-bottom:10px; font-size:32px; text-transform:uppercase;">Trwa Mecz...</h2>
        <div id="simMatchInfo" style="font-size:20px; font-weight:700; color:#fff; margin-bottom: 10px; text-align:center;"></div>
        <div id="simMatchState" style="font-size:13px; font-weight:900; color:var(--text-dim); margin-bottom: 18px; text-align:center; text-transform:uppercase; letter-spacing:1px;"></div>
        <div id="simMatchScore" style="font-size:18px; font-weight:900; background:rgba(0,0,0,0.4); padding: 10px 20px; border-radius: 12px; margin-bottom: 18px; text-align:center; letter-spacing:1px;">Wynik meczu 0:0</div>
        <div style="display:flex; gap: 20px; margin-bottom: 30px;">
            <div style="text-align:center;"><div style="font-size:12px; color:var(--text-dim);">PUNKTY ZAW.</div><div id="simPts" style="font-size:40px; font-weight:900; color:var(--green-neon);">0</div></div>
            <div style="text-align:center;"><div style="font-size:12px; color:var(--text-dim);">ŚREDNIA</div><div id="simAvg" style="font-size:40px; font-weight:900; color:#fff;">0.00</div></div>
        </div>
        <div id="simEvents" style="max-width: 400px; text-align:center; color: var(--red-neon); font-weight:bold; min-height:50px; line-height: 1.4;"></div>
        
        <div id="simDecisionBox" style="display: none; flex-direction: column; gap: 10px; width: 100%; max-width: 500px; margin-top: 10px; background: rgba(0,0,0,0.85); padding: 20px; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
            <div id="simDecTitle" style="color:var(--accent); font-weight:900; font-size:15px; text-align:center; line-height:1.4; margin-bottom: 10px;">Sytuacja na torze...</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <button class="hub-action-btn" style="padding:15px 10px; font-size:12px; border-radius:10px; border:1px solid #3498db; background:rgba(52, 152, 219, 0.2); color:#fff;" id="btnDecFol" onclick="resolveSimDecision('follow')"></button>
                <button class="hub-action-btn" style="padding:15px 10px; font-size:12px; border-radius:10px; border:1px solid #f1c40f; background:rgba(241, 196, 15, 0.2); color:#fff;" id="btnDecMid" onclick="resolveSimDecision('middle')"></button>
                <button class="hub-action-btn" style="padding:15px 10px; font-size:12px; border-radius:10px; border:1px solid #e74c3c; background:rgba(231, 76, 60, 0.2); color:#fff;" id="btnDecOut" onclick="resolveSimDecision('outside')"></button>
                <button class="hub-action-btn" style="padding:15px 10px; font-size:12px; border-radius:10px; border:1px solid #2ecc71; background:rgba(46, 204, 113, 0.2); color:#fff;" id="btnDecCut" onclick="resolveSimDecision('cut')"></button>
            </div>
        </div>

        <div id="simProgressContainer" style="width: 300px; height: 10px; background: rgba(255,255,255,0.1); border-radius: 5px; overflow: hidden; margin-top: 20px;">
            <div id="simProgressBar" style="width: 0%; height: 100%; background: var(--accent); transition: width 0.3s;"></div>
        </div>
    `;
    simDiv.style.display = 'flex';

    const simMatchInfo = document.getElementById('simMatchInfo');
    const simMatchState = document.getElementById('simMatchState');
    const simMatchScore = document.getElementById('simMatchScore');
    const simPts = document.getElementById('simPts');
    const simAvg = document.getElementById('simAvg');
    const simEvents = document.getElementById('simEvents');
    const simProgressBar = document.getElementById('simProgressBar');
    
    let s = cState.season;
    let m = s.matchIndex + 1;
    let matchObj = s.schedule[s.matchIndex];
    let opponent = matchObj.opp;
    let isHome = matchObj.isHome;
    let playingClub = activeLoanClub ? activeLoanClub : cState.club;
    let oppColor = getCareerClubColor(opponent);
    let playingLeague = activeLoanLeague ? activeLoanLeague : cState.league;
    let lData = CAREER_CONSTANTS[playingLeague];
    
    let trackComfort = isHome ? 8 : -10;
    let homeClubName = isHome ? playingClub : opponent;
    let awayClubName = isHome ? opponent : playingClub;
    let homeMatchScore = 0; let awayMatchScore = 0;

    const totalMatchHeats = 15;
    const clampMatchValue = (value, min, max) => Math.max(min, Math.min(max, value));
    
    let heatsInMatch = s.nextMatchHeats || 0;
    let benched = s.nextMatchBenched || false;

    let heatData = getPlayerHeats(cState.age, heatsInMatch, isHome);
    let playerHeats = heatData.heats;
    let startNumber = heatData.number;
    
    let matchPts = 0; let matchBon = 0;
    let matchCrashed = false;

    simMatchInfo.innerHTML = `${matchObj.type} - Runda ${m} <span style="font-size:12px; padding: 3px 8px; background: ${isHome?'rgba(0,255,102,0.2)':'rgba(255,51,51,0.2)'}; border-radius:5px; margin-left:10px;">${isHome?'DOM':'WYJAZD'}</span><br><div style="font-size:16px; margin-top:5px; color:${oppColor};">vs ${opponent}</div>${heatsInMatch>0 ? `<div style="font-size: 13px; margin-top:5px; color: var(--accent);">Twój nr startowy: ${startNumber}</div>` : ''}`;
    
    let avg = s.heats > 0 ? ((s.pts + s.bon)/s.heats).toFixed(2) : (cState.ovr / 40).toFixed(2);
    let formNum = parseFloat(avg);
    
    let moraleMod = 0;
    if (cState.relations.team > 80) moraleMod = 3;
    if (cState.relations.team < 30) moraleMod = -3;
    let matchEffOvr = cState.ovr + moraleMod + trackComfort; 
    let ratio = matchEffOvr / lData.diff;

    // ===========================================
    // DWUMECZ - OBLICZANIE (POPRAWIONE)
    // ===========================================
    let firstLegScoreMe = 0;
    let firstLegScoreOpp = 0;
    let hasFirstLeg = false;

    if (matchObj.leg === 2 || matchObj.type.includes("Rewanż") || matchObj.type.includes("Rew.")) {
        // PĘTLA WSTECZ - Dzięki temu w fazie play-off znajdziemy pierwszy mecz półfinałowy z tym samym rywalem
        for (let i = s.matchIndex - 1; i >= 0; i--) {
            let pastMatch = s.schedule[i];
            if (pastMatch.opp === opponent && pastMatch.leg === 1) { 
                let res = s.matchResults[i];
                if (res && res !== "-") {
                    let p = res.split(':').map(Number); // W historii zawsze wynik dom:wyjazd
                    firstLegScoreMe = pastMatch.isHome ? p[0] : p[1];
                    firstLegScoreOpp = pastMatch.isHome ? p[1] : p[0];
                    hasFirstLeg = true;
                }
                break; // Kończymy na najświeższym historycznym meczu
            }
        }
    }

    for (let h = 1; h <= totalMatchHeats; h++) {
        await new Promise(r => setTimeout(r, 600)); 
        simProgressBar.style.width = `${(h / totalMatchHeats) * 100}%`;
        
        let currentDiff = isHome ? (awayMatchScore - homeMatchScore) : (homeMatchScore - awayMatchScore);
        
        // REZERWA TAKTYCZNA (Dodatkowy bieg)
        if (currentDiff >= 6 && h >= 5 && h <= 14 && !playerHeats.includes(h) && !playerHeats.includes(h-1) && !matchCrashed) {
            let actualRidesSoFar = playerHeats.filter(ph => ph < h).length;
            if (actualRidesSoFar < 6 && formNum > 1.5) {
                if (Math.random() < 0.6) {
                    playerHeats.push(h);
                    playerHeats.sort((a,b)=>a-b);
                    showToast(`🔥 Rezerwa Taktyczna! Menedżer posyła Cię do boju w biegu ${h}!`, "success");
                }
            }
        }

        let isPlayerRiding = playerHeats.includes(h) && !matchCrashed;
        let rideStatus = matchCrashed ? "🚑 KONTUZJA" : (isPlayerRiding ? "🟢 JEDZIESZ" : "⏳ PAUZA");
        
        let aggHomeText = "";
        if (hasFirstLeg) {
            let currentAggMe = firstLegScoreMe + (isHome ? homeMatchScore : awayMatchScore);
            let currentAggOpp = firstLegScoreOpp + (isHome ? awayMatchScore : homeMatchScore);
            let aggH = isHome ? currentAggMe : currentAggOpp;
            let aggA = isHome ? currentAggOpp : currentAggMe;
            aggHomeText = `<div style="font-size:11px; color:var(--text-dim); margin-top:5px; text-transform:uppercase;">W Dwumeczu: ${aggH}:${aggA}</div>`;
        }

        simMatchScore.innerHTML = `
            <span style="color:${isHome?'var(--accent)':'#fff'}">${homeClubName}</span> 
            ${homeMatchScore}:${awayMatchScore} 
            <span style="color:${!isHome?'var(--accent)':'#fff'}">${awayClubName}</span>
            ${aggHomeText}
        `;
        
        simMatchState.innerHTML = `BIEG ${h}/${totalMatchHeats} | <span style="color:${isPlayerRiding?'var(--green-neon)':(matchCrashed?'var(--red-neon)':'var(--text-dim)')};">${rideStatus}</span>`;

        let heatMod = 0;
        let eventText = `Bieg ${h}: Na torze...`;
        let eventColor = "#fff";
        let isExclusionPlayer = false;

        if (isPlayerRiding) {
            let dec = await promptHeatDecision(cState.ovr, formNum, cState.attributes.prof);
            let roll = Math.random() * 100;
            let success = roll < dec.chance;
            
            let crashRiskBase = dec.type === 'outside' ? 8 : (dec.type === 'cut' ? 5 : (dec.type === 'middle' ? 2 : 0));
            let myInjRisk = cState.attributes.injRisk / 10; 
            let totalCrashChance = crashRiskBase + myInjRisk;
            
            if (!success && Math.random() * 100 < totalCrashChance) {
                matchCrashed = true;
                isExclusionPlayer = true;
                eventText = `Bieg ${h}: POTWORNY UPADEK! Karetka na torze! Koniec zawodów...`;
                eventColor = "var(--red-neon)";
                let injuryDuration = Math.floor(Math.random() * 3) + 1; 
                s.injuryRounds = injuryDuration;
                cState.ovr = Math.max(30, cState.ovr - 1); 
            } else {
                if (success) {
                    heatMod = dec.type === 'outside' ? 0.9 : (dec.type === 'cut' ? 1.0 : (dec.type === 'middle' ? 0.6 : 0.3));
                    eventText = `Bieg ${h}: Świetny manewr! Wyprzedzasz i powiększasz przewagę!`;
                    eventColor = "var(--green-neon)";
                } else {
                    heatMod = dec.type === 'outside' ? -0.8 : (dec.type === 'cut' ? -0.5 : (dec.type === 'middle' ? -0.4 : -0.2));
                    eventText = `Bieg ${h}: Błąd na trasie! Rywal zamyka Cię i ucieka.`;
                    eventColor = "var(--yellow-neon)";
                }
            }
        } else {
            if (Math.random() < 0.15) { 
                const events = [
                    { text: "⚠️ Zawodnik wjeżdża w taśmę!", p: 0, b: 0, color: "var(--red-neon)", mod: -0.5 },
                    { text: "🔥 Atomowy start pary!", mod: 1.0, color: "var(--green-neon)" },
                    { text: "🚜 Dziura w torze, zawodnik traci rytm...", mod: -0.8, color: "var(--yellow-neon)" },
                    { text: "🔧 Defekt motocykla lidera!", mod: -1.0, color: "var(--red-neon)" },
                    { text: "💨 Ostrzeżenie za utrudnianie startu (Warning).", mod: -0.2, color: "var(--yellow-neon)" },
                    { text: "🏍️ Fantastyczna akcja po zewnętrznej!", mod: 0.8, color: "var(--green-neon)" },
                    { text: "🛑 Upadek na pierwszym łuku! Bieg przerwany.", mod: 0, color: "var(--red-neon)" },
                    { text: "⚔️ Ostra walka na łokcie, sędzia puszcza grę!", mod: 0.2, color: "var(--accent)" },
                    { text: "🌧️ Zaczyna kropić deszcz, tor robi się śliski...", mod: -0.5, color: "var(--text-dim)" },
                    { text: "🚀 Kapitalna ścinka do krawężnika!", mod: 0.7, color: "var(--green-neon)" }
                ];
                let ev = events[Math.floor(Math.random() * events.length)];
                eventText = `Bieg ${h}: ${ev.text}`;
                eventColor = ev.color;
                heatMod = ev.mod;
            }
        }

        simEvents.innerText = eventText;
        simEvents.style.color = eventColor;
        playSound('flip');

        const strengthBias = clampMatchValue((ratio - 1) * 0.9 + heatMod * 0.35 + (isHome ? 0.12 : -0.08), -1.2, 1.2);
        
        let heatOutcome;
        if (isExclusionPlayer) {
            heatOutcome = isHome ? { me: 1, opp: 5 } : { me: 1, opp: 5 }; 
        } else {
            const swing = strengthBias + (Math.random() * 0.9 - 0.45);
            if (swing >= 0.85) heatOutcome = { me: 5, opp: 1 };
            else if (swing >= 0.30) heatOutcome = { me: 4, opp: 2 };
            else if (swing > -0.30) heatOutcome = { me: 3, opp: 3 };
            else if (swing > -0.85) heatOutcome = { me: 2, opp: 4 };
            else heatOutcome = { me: 1, opp: 5 };
        }
        
        homeMatchScore += isHome ? heatOutcome.me : heatOutcome.opp;
        awayMatchScore += isHome ? heatOutcome.opp : heatOutcome.me;

        let hPts = 0; let hBon = 0;

        if (isPlayerRiding && !isExclusionPlayer) {
            let teamScore = heatOutcome.me;
            if (teamScore === 5) { hPts = Math.random() < 0.5 ? 3 : 2; hBon = hPts === 2 ? 1 : 0; }
            else if (teamScore === 4) { hPts = Math.random() < 0.6 ? 3 : 1; hBon = 0; }
            else if (teamScore === 3) { hPts = Math.random() < 0.4 ? 2 : (Math.random() < 0.5 ? 1 : 0); hBon = hPts===1 ? 1 : 0; }
            else if (teamScore === 2) { hPts = Math.random() < 0.5 ? 2 : 0; hBon = 0; }
            else if (teamScore === 1) { hPts = Math.random() < 0.5 ? 1 : 0; hBon = 0; }
            
            matchPts += hPts; matchBon += hBon;
        }

        simPts.innerText = `${matchPts} (+${matchBon})`;
        let actualRidesSoFar = playerHeats.filter(ph => ph <= h).length;
        simAvg.innerText = actualRidesSoFar > 0 ? ((matchPts + matchBon) / actualRidesSoFar).toFixed(2) : "0.00";
        
        if (hasFirstLeg) {
            let currentAggMe = firstLegScoreMe + (isHome ? homeMatchScore : awayMatchScore);
            let currentAggOpp = firstLegScoreOpp + (isHome ? awayMatchScore : homeMatchScore);
            let aggH = isHome ? currentAggMe : currentAggOpp;
            let aggA = isHome ? currentAggOpp : currentAggMe;
            aggHomeText = `<div style="font-size:11px; color:var(--text-dim); margin-top:5px; text-transform:uppercase;">W Dwumeczu: ${aggH}:${aggA}</div>`;
        }

        simMatchScore.innerHTML = `<span style="color:${isHome?'var(--accent)':'#fff'}">${homeClubName}</span> ${homeMatchScore}:${awayMatchScore} <span style="color:${!isHome?'var(--accent)':'#fff'}">${awayClubName}</span>${aggHomeText}`;
    }
    
    await new Promise(r => setTimeout(r, 1500));
    simDiv.style.display = 'none';

    let finalPlayerTeamScore = isHome ? homeMatchScore : awayMatchScore;
    let finalOpponentScore = isHome ? awayMatchScore : homeMatchScore;

    simulateBotMatchesForCurrentRound(finalPlayerTeamScore, finalOpponentScore, false);

    s.heats += heatsInMatch;
    s.pts += matchPts;
    s.bon += matchBon;
    s.matchResults.push(`${finalPlayerTeamScore}:${finalOpponentScore}`);
    s.currentMatchScore = { me: finalPlayerTeamScore, opp: finalOpponentScore };
    s.matchIndex += 1;
    s.trainedThisWeek = false; 
    
    if (!s.lastMatches) s.lastMatches = [];
    s.lastMatches.push({ h: heatsInMatch, p: matchPts, b: matchBon });
    if (s.lastMatches.length > 3) s.lastMatches.shift();

    updateLeftPanelUI();
    saveCareer();
    renderCareerHub();
}

// ==========================================
// ====== GENERATOR PROGRAMU BIEGÓW =========
// ==========================================

function getPlayerHeats(age, numHeats, isHome) {
    if (numHeats <= 0) return { heats: [], number: '-' };

    // Baza biegów z klasycznej tabeli żużlowej (Zestaw 1)
    const awaySeniors = [ 
        {n: 1, h: [1, 6, 9, 11]}, 
        {n: 2, h: [3, 6, 9, 12]}, 
        {n: 3, h: [1, 5, 8, 13]}, 
        {n: 4, h: [4, 5, 8, 11]}, 
        {n: 5, h: [3, 7, 10, 13]} 
    ];
    const awayJuniors = [ 
        {n: 6, h: [2, 4, 10]}, 
        {n: 7, h: [2, 7, 12]} 
    ];
    
    const homeSeniors = [ 
        {n: 9, h:  [1, 7, 9, 11]}, 
        {n: 10, h: [4, 7, 9, 13]}, 
        {n: 11, h: [1, 5, 10, 12]}, 
        {n: 12, h: [3, 5, 10, 11]}, 
        {n: 13, h: [3, 6, 8, 13]} 
    ];
    const homeJuniors = [ 
        {n: 14, h: [2, 4, 8]}, 
        {n: 15, h: [2, 6, 12]} 
    ];

    let pool = [];
    if (age <= 21) {
        pool = isHome ? homeJuniors : awayJuniors;
    } else {
        pool = isHome ? homeSeniors : awaySeniors;
    }

    // Losujemy zawodnikowi jego numer startowy na ten konkretny mecz
    let selected = pool[Math.floor(Math.random() * pool.length)];
    let heats = [...selected.h];
    let startNumber = selected.n;

    // Jeśli menadżer dał nam mniej biegów niż zakłada program (np. słaby OVR/ławka)
    if (numHeats < heats.length) {
        return { heats: heats.slice(0, numHeats), number: startNumber };
    }

    // Jeśli jedziemy świetnie i dostajemy biegi nominowane (14, 15)
    let nominated = [14, 15].sort(() => 0.5 - Math.random());
    while (heats.length < numHeats && nominated.length > 0) {
        let h = nominated.pop();
        if (!heats.includes(h)) heats.push(h);
    }

    // Jeśli wciąż brakuje nam biegów (np. Złota Rezerwa Taktyczna), dobieramy losowy wolny
    if (heats.length < numHeats) {
        let available = [1,2,3,4,5,6,7,8,9,10,11,12,13].filter(h => !heats.includes(h)).sort(() => 0.5 - Math.random());
        while(heats.length < numHeats && available.length > 0) {
            heats.push(available.pop());
        }
    }

    return { heats: heats.sort((a,b) => a - b), number: startNumber };
}

// ==========================================
// ====== SYMULACJA POJEDYNCZEGO MECZU ======
// ==========================================

function signContract(offerIndex) {
    if (!cState.pendingOffers || !cState.pendingOffers[offerIndex]) return;
    let offer = cState.pendingOffers[offerIndex];
    
    cState.club = offer.club;
    cState.league = offer.league;
    cState.contractYears = offer.years;
    
    // Zapisz okres w akademii jeśli to jest 1. sezon
    if (cState.age === 16 && cState.history.length === 0) {
        cState.history.push({
            age: 15, club: "Akademia Żużlowa", league: "-", ovr: cState.ovr, 
            mec: 0, bie: 0, pkt: 0, bon: 0, avg: "0.00", loan: false, dmp: null, ims: false, table: []
        });
    }
    
    cState.pendingOffers = [];
    saveCareer();
    updateLeftPanelUI();
    startNewSeason();
}


function forceRetirement() {
    if (confirm("Czy na pewno chcesz zakończyć karierę w tym momencie? Ta decyzja jest nieodwracalna!")) {
        showCareerEnd();
    }
}

function showCareerEnd() {
    cState.active = false;
    cState.club = "Koniec kariery";
    cState.contractYears = 0;
    saveCareer();
    
    document.getElementById('careerMainPanel').style.display = 'none';
    document.getElementById('careerRetirement').style.display = 'block';
    updateLeftPanelUI();
}

function generateTransferWindow() {
    const area = document.getElementById('careerActionArea');
    if (!area) return;

    let offers = [];
    let possibleLeagues = [];
    
    // Logika ofert transferowych oparta na OVR
    if (cState.ovr >= 78) possibleLeagues.push("PGE Ekstraliga", "PGE Ekstraliga", "Metalkas 2.E");
    else if (cState.ovr >= 65) possibleLeagues.push("PGE Ekstraliga", "Metalkas 2.E", "Metalkas 2.E", "KLŻ");
    else possibleLeagues.push("Metalkas 2.E", "KLŻ", "KLŻ");
    
    for (let i = 0; i < 3; i++) {
        let l = possibleLeagues[Math.floor(Math.random() * possibleLeagues.length)];
        let c = cState.leagues[l][Math.floor(Math.random() * cState.leagues[l].length)];
        
        // Zabezpieczenie przed dublowaniem się klubów w ofertach
        if(offers.some(o => o.club === c)) { i--; continue; } 
        offers.push({ league: l, club: c, years: Math.floor(Math.random() * 2) + 1 });
    }

    cState.pendingOffers = offers;

    let html = `
        <h3 class="text-white font-black m-0 mb-5 text-xl">Okno Transferowe</h3>
        <p class="text-xs text-dim mb-15">Twój kontrakt wygasł. Wybierz nowego pracodawcę na kolejne lata.</p>
        <div class="copero-action-grid" style="${offers.length > 2 ? 'grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));' : ''}">
    `;
    
    offers.forEach((o, i) => {
        html += `
            <div class="copero-card" onclick="signContract(${i})">
                <span class="copero-card-title">${o.years} ${o.years === 1 ? 'ROK' : 'LATA'}</span>
                <span class="copero-card-club" style="font-size:12px;">${o.club}</span>
                <div class="copero-card-img" style="margin-bottom:5px;">${CAREER_CONSTANTS[o.league].logo}</div>
                <span class="copero-card-bot">${o.league}</span>
            </div>
        `;
    });
    
    html += `</div>`;
    area.innerHTML = html;
}

function showLoanWindow() {
    const area = document.getElementById('careerActionArea');
    if (!area) return;

    let targetLeague = cState.league === "PGE Ekstraliga" ? "Metalkas 2.E" : "KLŻ";
    let loanClub = cState.leagues[targetLeague][Math.floor(Math.random() * cState.leagues[targetLeague].length)];

    area.innerHTML = `
        <h3 class="text-accent font-black m-0 mb-5 text-xl">Wypożyczenie!</h3>
        <p class="text-xs text-dim mb-15">Twój klub macierzysty uznał, że masz za niski OVR. Zostałeś zaoferowany na rok do: <b>${loanClub}</b> (${targetLeague}).</p>
        <div class="copero-action-grid">
            <div class="copero-card" onclick="acceptLoan('${loanClub}', '${targetLeague}')">
                <span class="copero-card-club mb-10">AKCEPTUJĘ</span>
                <div class="copero-card-img text-green" style="background:transparent; border:none;">✅</div>
                <span class="text-xs text-dim">Dostaniesz szansę na jazdę</span>
            </div>
            <div class="copero-card stay-card" onclick="rejectLoan()">
                <span class="copero-card-club mb-10">ZOSTAJĘ</span>
                <div class="copero-card-img text-red" style="background:transparent; border:none;">❌</div>
                <span class="text-xs text-dim">Ryzykujesz grzanie ławki</span>
            </div>
        </div>
    `;
}

function acceptLoan(club, league) {
    activeLoanClub = club;
    activeLoanLeague = league;
    showToast("Udałeś się na wypożyczenie!", "success");
    startNewSeason();
}

function rejectLoan() {
    cState.relations.manager = Math.max(0, cState.relations.manager - 15);
    showToast("Odrzuciłeś ofertę wypożyczenia. Menedżer jest wściekły.", "error");
    startNewSeason();
}

// ==========================================
// ====== BRAKUJĄCE FUNKCJE TABELI LIGOWEJ ==
// ==========================================

function generateSeasonTable(leagueName, myClubName, startPts = 0, startDiff = 0) {
    if (!cState.leagues || !cState.leagues[leagueName]) return [];
    let teams = cState.leagues[leagueName];
    let table = [];
    
    teams.forEach((club, index) => {
        table.push({
            name: club,
            isMe: club === myClubName,
            pos: index + 1,
            matchesPlayed: 0, m: 0, w: 0, r: 0, p: 0, b: 0, pts: startPts, diff: startDiff
        });
    });
    return table;
}

function showSeasonTable() {
    const overlay = document.getElementById('careerTableOverlay');
    const list = document.getElementById('careerTableList');
    const sub = document.getElementById('tableOverlaySub');
    
    if (!overlay || !list) return;

    let s = cState.season;
    let playingLeague = activeLoanLeague ? activeLoanLeague : cState.league;
    
    if (sub) {
        sub.innerText = `Sezon ${2026 + (cState.history ? cState.history.length : 0)} | ${playingLeague}`;
    }
    
    if (!s || !s.table || s.table.length === 0) {
        list.innerHTML = '<div class="text-dim text-xs font-bold text-center" style="padding: 20px;">Tabela będzie dostępna po rozpoczęciu sezonu.</div>';
    } else {
        list.innerHTML = '';
        s.table.forEach(row => {
            const clubColor = getCareerClubColor(row.name);
            const isPlayer = row.isMe;
            list.innerHTML += `
                <div class="career-season-row ${isPlayer ? 'active' : ''}">
                    <div class="career-season-col-pos" style="color:${row.pos === 1 ? '#f1c40f' : row.pos >= s.table.length - 1 ? '#ff3333' : '#fff'};">${row.pos}</div>
                    <div class="career-season-col-name" style="border-left: 3px solid ${clubColor}; padding-left: 10px; color: ${isPlayer ? '#fff' : '#d8d8d8'};">${row.name}</div>
                    <div class="career-season-col-matches" style="color: var(--text-dim);">${row.matchesPlayed || 0}</div>
                    <div class="career-season-col-points" style="color: #fff; font-weight: 900;">${row.b || 0}</div>
                    <div class="career-season-col-points" style="color: #fff; font-weight: 900;">${row.w || 0}</div>
                    <div class="career-season-col-points" style="color: #fff; font-weight: 900;">${row.r || 0}</div>
                    <div class="career-season-col-points" style="color: #fff; font-weight: 900;">${row.p || 0}</div>
                    <div class="career-season-col-points" style="color: ${((row.diff || 0) >= 0) ? 'var(--green-neon)' : 'var(--red-neon)'}; font-weight: 900;">${(row.diff || 0) >= 0 ? '+' : ''}${row.diff || 0}</div>
                    <div class="career-season-col-points" style="color: #fff; font-weight: 900;">${row.pts}</div>
                </div>
            `;
        });
    }
    
    overlay.style.display = 'block';
    setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeSeasonTable() {
    const overlay = document.getElementById('careerTableOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 300);
    }
}

// Zabezpieczenia dla innych funkcji przypisanych do window w trakcie gry, 
// które rzuciłyby kolejnym błędem "ReferenceError" na starcie skryptu:
var closeTeamAchievement = window.closeTeamAchievement || function() {
    const overlay = document.getElementById('careerTeamAchOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 300);
    }
};
var showCareerCalendar = window.showCareerCalendar || function() {};

function showTeamAchievement(club, gotDMP, medalColor, promoted, relegated, proceedCallback) {
    const overlay = document.getElementById('careerTeamAchOverlay');
    const title = document.getElementById('teamAchTitle');
    const clubEl = document.getElementById('teamAchClub');
    const desc = document.getElementById('teamAchDesc');
    const icon = document.getElementById('teamAchIcon');

    if (!overlay) { proceedCallback(); return; }

    clubEl.innerText = club;
    
    if (gotDMP) {
        icon.innerText = "🏆";
        title.innerText = "MAMY MEDAL!";
        title.style.color = "var(--accent)";
        desc.innerText = `Zdobywasz ${medalColor.toLowerCase()} medal Drużynowych Mistrzostw Polski!`;
    } else if (promoted) {
        icon.innerText = "📈";
        title.innerText = "AWANS!";
        title.style.color = "var(--green-neon)";
        desc.innerText = "Twoja drużyna awansowała do wyższej ligi!";
    } else if (relegated) {
        icon.innerText = "📉";
        title.innerText = "SPADEK!";
        title.style.color = "var(--red-neon)";
        desc.innerText = "Niestety, twoja drużyna spada do niższej ligi...";
    }

    overlay.style.display = 'block';
    setTimeout(() => overlay.style.opacity = '1', 10);

    window.closeTeamAchievement = function() {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            proceedCallback();
        }, 300);
    };
}

// ==============================================
// ====== SYSTEM POZIOMÓW, MISJI I SKLEPU =======
// ==============================================

const MISSIONS_POOL_DAILY = [
    { type: 'play_endless', target: 3, desc: 'Rozegraj 3 gry Endless', exp: 100, coins: 50 },
    { type: 'win_clash', target: 1, desc: 'Wygraj 1 mecz w Clash', exp: 200, coins: 100 },
    { type: 'ta_score', target: 20, desc: 'Zdobądź 20 pkt. w Time Attack (Suma)', exp: 150, coins: 70 },
    { type: 'no_hint_win', target: 1, desc: 'Wygraj grę bez podpowiedzi', exp: 100, coins: 50 }
];

const MISSIONS_POOL_WEEKLY = [
    { type: 'play_endless', target: 20, desc: 'Rozegraj 20 gier Endless', exp: 500, coins: 300 },
    { type: 'win_clash', target: 10, desc: 'Wygraj 10 meczów w Clash', exp: 800, coins: 500 },
    { type: 'no_hint_win', target: 15, desc: 'Wygraj 15 gier bez podpowiedzi', exp: 600, coins: 350 }
];

const MISSIONS_POOL_MONTHLY = [
    { type: 'play_endless', target: 100, desc: 'Rozegraj 100 gier Endless', exp: 2000, coins: 1500 },
    { type: 'win_clash', target: 30, desc: 'Wygraj 30 meczów w Clash', exp: 3000, coins: 2000 }
];

function ensureProgressionStats() {
    let needsSave = false;

    if (typeof userStats.level === 'undefined') { userStats.level = 1; needsSave = true; }
    if (typeof userStats.exp === 'undefined') { userStats.exp = 0; needsSave = true; }
    if (typeof userStats.coins === 'undefined') { userStats.coins = 0; needsSave = true; }
    
    if (!userStats.missions) { userStats.missions = { date: "", weeklyDate: "", monthlyDate: "", dailyTasks: [], weeklyTasks: [], monthlyTasks: [] }; needsSave = true; }
    
    // Upewniamy się, że struktury istnieją (dla starych graczy)
    if (!userStats.missions.dailyTasks) userStats.missions.dailyTasks = [];
    if (!userStats.missions.weeklyTasks) userStats.missions.weeklyTasks = [];
    if (!userStats.missions.monthlyTasks) userStats.missions.monthlyTasks = [];

    if (!userStats.equippedTitle) { userStats.equippedTitle = null; needsSave = true; }
    if (!userStats.ownedBgs) { userStats.ownedBgs = []; needsSave = true; }
    if (typeof userStats.equippedBg === 'undefined') { userStats.equippedBg = null; needsSave = true; }
    
    const d = new Date();
    const todayStr = d.toLocaleDateString();
    
    // Generowanie Dziennych
    if (userStats.missions.date !== todayStr) {
        userStats.missions.date = todayStr;
        let shuffled = [...MISSIONS_POOL_DAILY].sort(() => 0.5 - Math.random());
        userStats.missions.dailyTasks = shuffled.slice(0, 3).map(m => ({ ...m, progress: 0, completed: false, claimed: false }));
        needsSave = true;
    }

    // Generowanie Tygodniowych (Prosty reset co poniedziałek - oparty na dacie)
    let dayNum = d.getDay() || 7; 
    let monday = new Date(d); monday.setDate(d.getDate() - dayNum + 1);
    let mondayStr = monday.toLocaleDateString();
    if (userStats.missions.weeklyDate !== mondayStr) {
        userStats.missions.weeklyDate = mondayStr;
        let shuffled = [...MISSIONS_POOL_WEEKLY].sort(() => 0.5 - Math.random());
        userStats.missions.weeklyTasks = shuffled.slice(0, 2).map(m => ({ ...m, progress: 0, completed: false, claimed: false }));
        needsSave = true;
    }

    // Generowanie Miesięcznych
    let monthStr = `${d.getFullYear()}_${d.getMonth() + 1}`;
    if (userStats.missions.monthlyDate !== monthStr) {
        userStats.missions.monthlyDate = monthStr;
        let shuffled = [...MISSIONS_POOL_MONTHLY].sort(() => 0.5 - Math.random());
        userStats.missions.monthlyTasks = shuffled.slice(0, 1).map(m => ({ ...m, progress: 0, completed: false, claimed: false }));
        needsSave = true;
    }

    if (needsSave) {
        localStorage.setItem('speedwayStatsV2', JSON.stringify(userStats));
        if (auth.currentUser) {
            db.collection('users').doc(auth.currentUser.uid).set({
                stats: JSON.stringify(userStats),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).catch(e => console.warn(e));
        }
    }
}

function getRequiredExp(level) {
    return Math.floor(100 * Math.pow(1.2, level - 1)); // Eksponencjalny wzrost EXP
}

function addExp(amount) {
    ensureProgressionStats();
    userStats.exp += amount;
    let reqExp = getRequiredExp(userStats.level);
    
    let leveledUp = false;
    while (userStats.exp >= reqExp) {
        userStats.exp -= reqExp;
        userStats.level++;
        userStats.coins += 100; // Bonus 100 monet za wbicie poziomu!
        reqExp = getRequiredExp(userStats.level);
        leveledUp = true;
    }
    
    if (leveledUp) {
        showToast(`🎉 AWANS NA POZIOM ${userStats.level}! (+100 🪙)`, "success");
    }
    saveStats();
}

function updateMissionProgress(type, amount = 1) {
    ensureProgressionStats();
    let updated = false;
    
    // Sprawdzamy wszystkie listy zadań
    [userStats.missions.dailyTasks, userStats.missions.weeklyTasks, userStats.missions.monthlyTasks].forEach(taskList => {
        taskList.forEach(task => {
            if (task.type === type && !task.completed) {
                task.progress += amount;
                if (task.progress >= task.target) {
                    task.progress = task.target;
                    task.completed = true;
                    showToast(`✅ Misja ukończona: ${task.desc}!`, "success");
                }
                updated = true;
            }
        });
    });
    
    if (updated) saveStats();
}

function renderProfileExpBar() {
    ensureProgressionStats();
    const lvlEl = document.getElementById('profileLevel');
    const coinsEl = document.getElementById('profileCoins');
    const expBar = document.getElementById('profileExpBar');
    const expText = document.getElementById('profileExpText');
    
    if(!lvlEl || !coinsEl) return;
    
    const reqExp = getRequiredExp(userStats.level);
    const pct = Math.min(100, Math.floor((userStats.exp / reqExp) * 100));
    
    lvlEl.innerText = userStats.level;
    coinsEl.innerText = userStats.coins;
    expBar.style.width = `${pct}%`;
    expText.innerText = `${userStats.exp} / ${reqExp} EXP`;
}

// Nadpisanie domyślnej funkcji Profilu, by rysowała też EXP
const originalOpenProfile = openProfile;
window.openProfile = function() {
    originalOpenProfile();
    renderProfileExpBar();
}


// ==============================================
// ====== UI MISJI (NOWY LAYOUT) ================
// ==============================================

function openMissionsModal() {
    ensureProgressionStats();
    document.getElementById('mainMenuContainer').style.display = 'none';
    const desktopMenu = document.getElementById('desktopMainMenu');
    if(desktopMenu) desktopMenu.style.display = 'none';
    
    const overlay = document.getElementById('missionsModalOverlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.style.opacity = '1', 10);
    
    switchMissionTab('daily');
    document.getElementById('missionsCoinsDisplay').innerText = userStats.coins;
}

function closeMissionsModal() {
    const overlay = document.getElementById('missionsModalOverlay');
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
        window.location.reload(); 
    }, 300);
}

window.switchMissionTab = function(type) {
    // Podświetlenie przycisków
    const btns = document.querySelectorAll('#missionsModalOverlay .settings-tab-btn');
    btns.forEach(b => {
        if(b.getAttribute('onclick').includes(type)) b.classList.add('active');
        else b.classList.remove('active');
    });

    const container = document.getElementById('missionsListContainer');
    container.innerHTML = '';
    
    let taskList = [];
    if (type === 'daily') taskList = userStats.missions.dailyTasks;
    else if (type === 'weekly') taskList = userStats.missions.weeklyTasks;
    else if (type === 'monthly') taskList = userStats.missions.monthlyTasks;

    if (taskList.length === 0) {
        container.innerHTML = '<div class="text-dim text-center mt-20">Brak dostępnych misji.</div>';
        return;
    }
    
    taskList.forEach((task, index) => {
        let pct = Math.min(100, Math.floor((task.progress / task.target) * 100));
        
        let actionHtml = '';
        if (task.claimed) {
            actionHtml = `<button class="shop-btn" style="background:transparent; border:1px solid var(--text-dim); color:var(--text-dim);" disabled>Odebrano</button>`;
        } else if (task.completed) {
            actionHtml = `<button class="shop-btn shop-btn-buy" onclick="claimMission('${type}', ${index})">Odbierz</button>`;
        } else {
            actionHtml = `<span style="font-size: 13px; font-weight: 900; color: var(--text-dim);">${task.progress} / ${task.target}</span>`;
        }

        container.innerHTML += `
            <div class="mission-card ${task.completed ? 'completed' : ''}">
                <div class="mission-info">
                    <div class="mission-title">${task.desc}</div>
                    <div class="mission-reward">NAGRODA: ${task.exp} EXP | ${task.coins} 🪙</div>
                    <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; margin-top: 8px;">
                        <div style="width: ${pct}%; height: 100%; background: ${task.completed ? 'var(--green-neon)' : 'var(--accent)'};"></div>
                    </div>
                </div>
                <div>${actionHtml}</div>
            </div>
        `;
    });
}

window.claimMission = function(type, index) {
    let taskList = [];
    if (type === 'daily') taskList = userStats.missions.dailyTasks;
    else if (type === 'weekly') taskList = userStats.missions.weeklyTasks;
    else if (type === 'monthly') taskList = userStats.missions.monthlyTasks;

    let task = taskList[index];
    if (!task || task.claimed || !task.completed) return;
    
    task.claimed = true;
    userStats.coins += task.coins;
    addExp(task.exp);
    
    showToast(`Odebrano: ${task.coins} 🪙 i ${task.exp} EXP`, "success");
    saveStats();
    
    document.getElementById('missionsCoinsDisplay').innerText = userStats.coins;
    switchMissionTab(type); // Odświeżenie listy
}

// ==============================================
// ====== UI SKLEPU (NOWY LAYOUT) ===============
// ==============================================

// Dostępne tła w sklepie
const SHOP_BACKGROUNDS = [
    { id: 'rank-bg-gold', name: 'Złoty Prestiż', desc: 'Lśniące, złote tło', price: 5000 },
    { id: 'rank-bg-fire', name: 'Piekielny Ogień', desc: 'Płonące animowane tło', price: 10000 },
    { id: 'rank-bg-toxic', name: 'Toksyczny Odpad', desc: 'Płynący, radioaktywny kwas', price: 15000 },
    { id: 'rank-bg-ocean', name: 'Głębia Oceanu', desc: 'Błękitna animacja', price: 20000 },
    { id: 'rank-bg-lightning', name: 'Gniew Zeusa', desc: 'Uderzenia błyskawic', price: 25000 },
    { id: 'rank-bg-forest', name: 'Mroczny Las', desc: 'Głęboka, mistyczna zieleń', price: 30000 },
    { id: 'rank-bg-hearts', name: 'Miłosny Szał', desc: 'Deszcz czerwonych serc', price: 35000 },
    { id: 'rank-bg-bubbles', name: 'Mydlane Bańki', desc: 'Unoszące się bąbelki', price: 40000 },
    { id: 'rank-bg-sadurski', name: 'Sadurski Racing', desc: 'SPECJALNE TŁO: KS759', price: 75900 }
];

function openShopModal() {
    ensureProgressionStats();
    document.getElementById('mainMenuContainer').style.display = 'none';
    const desktopMenu = document.getElementById('desktopMainMenu');
    if(desktopMenu) desktopMenu.style.display = 'none';
    
    const overlay = document.getElementById('shopModalOverlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.style.opacity = '1', 10);
    
    switchShopTab('backgrounds');
    document.getElementById('shopCoinsDisplay').innerText = userStats.coins;
}

function closeShopModal() {
    const overlay = document.getElementById('shopModalOverlay');
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
        window.location.reload(); 
    }, 300);
}

window.switchShopTab = function(tab) {
    const btns = document.querySelectorAll('#shopModalOverlay .settings-tab-btn');
    btns.forEach(b => {
        if(b.getAttribute('onclick').includes(tab)) b.classList.add('active');
        else b.classList.remove('active');
    });

    const container = document.getElementById('shopListContainer');
    container.innerHTML = '';
    
    if (tab === 'backgrounds') {
        container.innerHTML = `<p class="text-xs text-dim mb-15">Tła nakładają się na Twój wiersz w tabelach wyników, czyniąc Twój profil unikalnym!</p>`;
        
        SHOP_BACKGROUNDS.forEach(bg => {
            const isOwned = userStats.ownedBgs.includes(bg.id);
            const isEquipped = userStats.equippedBg === bg.id;
            
            let actionBtn = '';
            if (isEquipped) {
                actionBtn = `<button class="shop-btn shop-btn-equipped" onclick="equipBackground(null)">ZDEJMIJ</button>`;
            } else if (isOwned) {
                actionBtn = `<button class="shop-btn shop-btn-equip" onclick="equipBackground('${bg.id}')">ZAŁÓŻ</button>`;
            } else {
                actionBtn = `<button class="shop-btn shop-btn-buy" onclick="buyBackground('${bg.id}', ${bg.price})">${bg.price} 🪙</button>`;
            }

            container.innerHTML += `
                <div class="shop-item-card ${bg.id}" style="border-left: none !important;">
                    <div style="text-shadow: 1px 1px 2px rgba(0,0,0,0.8);">
                        <div class="shop-item-title" style="color: #fff;">${bg.name}</div>
                        <div style="font-size:10px; color:rgba(255,255,255,0.7); font-weight:700;">${bg.desc}</div>
                    </div>
                    <div>${actionBtn}</div>
                </div>
            `;
        });
    } else if (tab === 'titles') {
        container.innerHTML = `
            <div style="text-align:center; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1); margin-top: 20px;">
                <div style="font-size: 30px; margin-bottom: 5px;">🚧</div>
                <div style="font-size: 13px; color: var(--text-dim); font-weight: 700;">Kategoria w budowie... Oszczędzaj monety!</div>
            </div>
        `;
    }
}

window.buyBackground = function(id, price) {
    if (userStats.coins >= price) {
        userStats.coins -= price;
        userStats.ownedBgs.push(id);
        userStats.equippedBg = id; // Automatycznie zakładamy po zakupie
        saveStats();
        switchShopTab('backgrounds');
        document.getElementById('shopCoinsDisplay').innerText = userStats.coins;
        showToast("Zakupiono nowe tło!", "success");
    } else {
        showToast("Nie masz wystarczająco Monet!", "error");
        playSound('error');
    }
}

window.equipBackground = function(id) {
    userStats.equippedBg = id;
    saveStats();
    switchShopTab('backgrounds');
    showToast(id ? "Tło założone!" : "Tło zdjęte.", "normal");
}

// ----------------------------------------
// GLOBALNE FUNKCJE DLA HTML-A (ZABEZPIECZENIE)
// ----------------------------------------
try {
    window.openProfile = openProfile;
    window.closeProfile = closeProfile;
    window.openRanking = openRanking;
    window.closeRanking = closeRanking;
    window.openSettings = openSettings;
    window.closeSettings = closeSettings;
    window.openCalendar = openCalendar;
    window.closeCalendar = closeCalendar;
    window.changeDaily = changeDaily;
    window.changeDailyInGame = changeDailyInGame;
    window.startDailyGame = startDailyGame;
    window.startEndlessGame = startEndlessGame;
    window.startClashGame = startClashGame;
    window.loadClashRankingOnly = loadClashRankingOnly;
    window.exitClashMenu = exitClashMenu;
    window.openFriendlyLobby = openFriendlyLobby;
    window.backToClashModeSelect = backToClashModeSelect;
    window.createClashRoom = createClashRoom;
    window.joinClashRoom = joinClashRoom;
    window.toggleClashReady = toggleClashReady;
    window.toggleClashRematch = toggleClashRematch;
    window.showClashInfo = showClashInfo;
    window.closeClashInfo = closeClashInfo;
    window.startLeagueMatchmaking = startLeagueMatchmaking;
    window.cancelLeagueMatchmaking = cancelLeagueMatchmaking;
    window.handleClashCell = handleClashCell;
    window.submitClashGuess = submitClashGuess;
    window.closeClashSearch = closeClashSearch;
    window.leaveClashRoom = leaveClashRoom;
    window.resetBoardAndPlay = resetBoardAndPlay;
    window.shareResult = shareResult;
    window.makeGuess = makeGuess;
    window.giveUpGame = giveUpGame;
    window.saveNick = saveNick;
    window.changeNickname = changeNickname;
    window.signInWithGoogle = signInWithGoogle;
    window.signInWithGooglePrompt = signInWithGooglePrompt;
    window.logOut = logOut;
    window.setTheme = setTheme;
    window.toggleSound = toggleSound;
    window.openClashHistory = openClashHistory;
    window.closeClashHistory = closeClashHistory;
    window.openSuggestion = openSuggestion;
    window.closeSuggestion = closeSuggestion;
    window.submitSuggestion = submitSuggestion;
    window.openLocalClashLobby = openLocalClashLobby;
    window.backToClashModeSelectFromLocal = backToClashModeSelectFromLocal;
    window.startLocalClashMatch = startLocalClashMatch;
    window.openBugReport = openBugReport;
    window.closeBugReport = closeBugReport;
    window.submitBugReport = submitBugReport;
    window.openUpdates = openUpdates;
    window.closeUpdates = closeUpdates;
    window.loadDesktopRanking = loadDesktopRanking;
    window.useHint = useHint;
    window.returnToMainMenu = returnToMainMenu;
    window.submitLeagueSurrender = submitLeagueSurrender;
    window.startTimeAttack = startTimeAttack;
    window.submitTimeAttackGuess = submitTimeAttackGuess;
    window.restartTimeAttack = restartTimeAttack;
    window.exitTimeAttack = exitTimeAttack;
    window.openClubSelectModal = openClubSelectModal;
    window.closeClubSelectModal = closeClubSelectModal;
    window.saveFavoriteClub = saveFavoriteClub;
    window.openTimeAttackMenu = openTimeAttackMenu;
    window.exitTimeAttackMenu = exitTimeAttackMenu;
    window.showTimeAttackInfo = showTimeAttackInfo;
    window.closeTimeAttackInfo = closeTimeAttackInfo;
    
    // CAREER EXPORTS
    window.loadCareer = loadCareer;
    window.showCareerCreator = showCareerCreator;
    window.openCareerMode = openCareerMode;
    window.exitCareerMode = exitCareerMode;
    window.updateKevlarPreview = updateKevlarPreview;
    window.selectCareerNat = selectCareerNat;
    window.startCareerAcademy = startCareerAcademy;
    window.signContract = signContract; 
    window.acceptLoan = acceptLoan;
    window.rejectLoan = rejectLoan;
    window.startTrainingQTE = startTrainingQTE;
    window.finishTraining = finishTraining;
    window.triggerMatchOrEvent = triggerMatchOrEvent;
    window.resolveMidSeasonEvent = resolveMidSeasonEvent;
    window.endOfSeason = endOfSeason;
    window.forceRetirement = forceRetirement;
    window.showSeasonTable = showSeasonTable;
    window.closeSeasonTable = closeSeasonTable;
    window.closeTeamAchievement = closeTeamAchievement;
    window.shareCareerResult = shareCareerResult;
    window.showCareerCalendar = showCareerCalendar;
    window.openMissionsModal = openMissionsModal;
    window.closeMissionsModal = closeMissionsModal;
    window.openShopModal = openShopModal;
    window.closeShopModal = closeShopModal;
    
} catch (e) {
    console.error("Global export error:", e);
}