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
    filterMode: 'leagues', // 'leagues' lub 'clubs'
    leagues: { ext: true, m2e: true, klz: true, other: true },
    excludedClubs: [], // Lista klubów odznaczonych ręcznie
        requiredCountries: 0, // ile kolumn musi mieć ograniczenie narodowosci
        excludeInactivePlayers: false
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
    renderCustomClubsChips(); // Generuje listę klubów za każdym otwarciem okna
    // Setup required-countries slider UI if present
    const reqSlider = document.getElementById('customClashRequiredCountries');
    const reqLabel = document.getElementById('customClashRequiredCountriesLabel');
    const size = customClashSettings.size || 3;
    if (reqSlider) {
        reqSlider.min = 0;
        reqSlider.max = size;
        reqSlider.value = customClashSettings.requiredCountries || 0;
        if (reqLabel) reqLabel.innerText = reqSlider.value;
        reqSlider.oninput = () => { if (reqLabel) reqLabel.innerText = reqSlider.value; };
    }

    const saveBtn = overlay.querySelector('button[onclick="saveClashCustomSettings()"]');
    const closeBtn = overlay.querySelector('button[onclick="closeClashCustomSettings()"]');
    overlay.querySelectorAll('input, select, textarea').forEach(el => {
        el.disabled = !!readOnly;
    });
    if (saveBtn) saveBtn.style.display = readOnly ? 'none' : 'block';
    if (closeBtn) closeBtn.style.display = 'block';
    overlay.querySelectorAll('.club-chip').forEach(chip => {
        chip.style.pointerEvents = readOnly ? 'none' : 'auto';
        chip.style.opacity = readOnly ? '0.7' : '1';
    });

    let info = document.getElementById('clashCustomSettingsReadOnlyInfo');
    if (!info) {
        info = document.createElement('div');
        info.id = 'clashCustomSettingsReadOnlyInfo';
        info.className = 'text-xs text-dim mb-15 text-center';
        overlay.querySelector('.stats-modal').insertBefore(info, overlay.querySelector('.stats-modal').children[1]);
    }
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
    ['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].forEach(c => allClubs.delete(c));
    
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
    customClashSettings.size = parseInt(document.getElementById('customClashSize').value);
    customClashSettings.turnTime = parseInt(document.getElementById('customClashTime').value);
    // Required countries (number of column constraints)
    const reqEl = document.getElementById('customClashRequiredCountries');
    if (reqEl) {
        let reqVal = parseInt(reqEl.value) || 0;
        if (reqVal < 0) reqVal = 0;
        if (reqVal > customClashSettings.size) reqVal = customClashSettings.size;
        customClashSettings.requiredCountries = reqVal;
    } else {
        customClashSettings.requiredCountries = customClashSettings.requiredCountries || 0;
    }
    // Exclude inactive players checkbox
    const exclEl = document.getElementById('customClashExcludeInactive');
    if (exclEl) customClashSettings.excludeInactivePlayers = !!exclEl.checked;
    
    if (customClashSettings.filterMode === 'leagues') {
        customClashSettings.leagues.ext = document.getElementById('customLeagueExt').checked;
        customClashSettings.leagues.m2e = document.getElementById('customLeagueM2e').checked;
        customClashSettings.leagues.klz = document.getElementById('customLeagueKlz').checked;
        customClashSettings.leagues.other = document.getElementById('customLeagueOther').checked;
        
        if (!customClashSettings.leagues.ext && !customClashSettings.leagues.m2e && !customClashSettings.leagues.klz && !customClashSettings.leagues.other) {
            appAlert("Musisz wybrać co najmniej jedną pulę klubów!", "Błąd ustawień");
            return;
        }
    } else {
        // Zbieramy odznaczone kluby
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

        // Wymóg absolutnego minimum, żeby plansza w ogóle miała szansę się wygenerować
        const requiredClubs = customClashSettings.size * 2;
        if (activeCount < requiredClubs) {
            appAlert(`Musisz zostawić włączonych co najmniej ${requiredClubs} klubów dla planszy ${customClashSettings.size}x${customClashSettings.size}!`, "Błąd ustawień");
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
            userStats = Object.assign(userStats, cloudStats);
            ensureLeagueStats(userStats);
            localStorage.setItem('speedwayStatsV2', JSON.stringify(userStats));
            updateLeagueUI();
            updateDiscordButtonUI();
        }
    } catch (e) { console.error("Cloud Sync Load Error:", e); }
}


function ensureLeagueStats(stats) {
    if (!stats.clashLeague) stats.clashLeague = { matchesPlayed: 0, wins: 0, losses: 0, draws: 0, elo: 1000 };
    if (typeof stats.clashLeague.abandons !== 'number') stats.clashLeague.abandons = 0; 
    if (typeof stats.clashLeague.banUntil !== 'number') stats.clashLeague.banUntil = 0; 
    if (typeof stats.clashLeague.tabSwitches !== 'number') stats.clashLeague.tabSwitches = 0; // Dodano nowy tracker
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
    "brak klubu": "➖", "brak": "➖", "zawieszenie": "🚫", "kontuzja": "🚑", "koniec kariery": "❌"
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
        teams: "Drużyny:", colName: "Zawodnik", colCountry: "Kraj", colYear: "Rok ur.", colGP: "W GP?", colDMP: "Medale DMP", colStatus: "Status", colClubs: "Historia Klubów",
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
window.onload = async function() { 
    setRandomBackground();
    
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
                    if (!window.isAdmin) { // <-- Tylko admin przechodzi. Tester i zwykły gracz dostają blokadę.
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

    loadStats(); 
    initDailyMenu(); 
    renderLastGames(); 
    preloadHelmetImage(); 
    setLang(currentLang); 
    updateSoundBtn(); 
    updateLeagueUI(); 
    checkUnseenUpdates();
};
function loadStats() {
    let saved = localStorage.getItem('speedwayStatsV2'); 
    if(saved) {
        userStats = JSON.parse(saved);
        if (!userStats.dailyResults) userStats.dailyResults = {};
        if (!userStats.dailyHistory) userStats.dailyHistory = [];
        if (!userStats.dailyGuesses) userStats.dailyGuesses = {};
        if (!userStats.recentEndless) userStats.recentEndless = [];
        if (!userStats.clashHistory) userStats.clashHistory = [];
        ensureLeagueStats(userStats);
        ensureTimeAttackStats(userStats); // <--- DODANA LINIJKA
    }
    ensureLeagueStats(userStats);
    ensureTimeAttackStats(userStats); // <--- DODANA LINIJKA
    updateDiscordButtonUI();
    
    setTimeout(() => {
        syncLeagueScoreToFirebase();
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
        
        batch.set(dailyRef, { nick: safeNick, club: userStats.favoriteClub || null, won: isWin ? 1 : 0, guesses: attempts, hints: hintsUsedCount, timestamp: ts }, { merge: true });
        
        const increment = firebase.firestore.FieldValue.increment;
        const winIncrement = isWin ? 1 : 0; 
        
        const weeklyRef = db.collection("leaderboard_weekly").doc(getCurrentWeekStr()).collection("scores").doc(playerId);
        batch.set(weeklyRef, { nick: safeNick, club: userStats.favoriteClub || null, wins: increment(winIncrement), guesses: increment(attempts), timestamp: ts }, { merge: true });
        
        const monthlyRef = db.collection("leaderboard_monthly").doc(getCurrentMonthStr()).collection("scores").doc(playerId);
        batch.set(monthlyRef, { nick: safeNick, club: userStats.favoriteClub || null, wins: increment(winIncrement), guesses: increment(attempts), timestamp: ts }, { merge: true });
        
        const alltimeRef = db.collection("leaderboard_alltime").doc("global").collection("scores").doc(playerId);
        batch.set(alltimeRef, { nick: safeNick, club: userStats.favoriteClub || null, wins: increment(winIncrement), guesses: increment(attempts), timestamp: ts }, { merge: true });
        
        await batch.commit();
    } catch (e) { console.error("DB Error:", e); }
}

async function syncLeagueScoreToFirebase() {
    if (!playerId) return; 
    const league = ensureLeagueStats(userStats).clashLeague;
    try {
        await db.collection('leaderboard_clash_beta').doc(playerId).set({
            nick: playerNickname || 'Gracz',
            club: userStats.favoriteClub || null,
            elo: Math.round(league.elo),
            matchesPlayed: league.matchesPlayed,
            wins: league.wins,
            losses: league.losses,
            draws: league.draws,
            rank: getLeagueRankName(league.elo, league.matchesPlayed),
            provisional: league.matchesPlayed < 5,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) { console.error('League leaderboard sync error:', e); }
}

function updateStatsOnWin() {
    if(hasWon || hasLost) return; hasWon = true;
    userStats.played++; userStats.won++; userStats.currentStreak++;
    
    ensureAchievementsStats();
    if (!hintActive) userStats.trackers.winsNoHint++;
    checkAchievements();

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
    const inputSec = document.querySelector('.input-section');
    if (!modeDisplay || !controls || !inputSec) return;

    inputSec.style.display = 'none'; 

    let target;
    if (gameMode === 'daily') {
        controls.style.display = 'flex'; 
        dailyNumberGlobal = getDailyDateString(selectedDailyDay);
        modeDisplay.innerText = `${i18n[currentLang].modeDaily} ${dailyNumberGlobal}`;
        target = _generateDailyTarget(selectedDailyDay);
    } else {
        controls.style.display = 'none';
        modeDisplay.innerText = i18n[currentLang].modeEndless;
        
        // Endless losuje na froncie i odrzuca zawodników z historii
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

    _lockTarget(target.id); // Zamykamy gracza w sejfie

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
    inputSec.style.display = 'block'; 
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
    return clubName.replace(" (W)", "").replace(" (G)", "").replace("[Zawieszenie]", "Zawieszenie").trim().toLowerCase(); 
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
        if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC)) { box.classList.add('club-special'); }
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
            let specialClass = ['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC) ? ' club-special' : '';
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
                <div>GP</div>
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
    photoImg.src = `images/riders/image_0.png`; 
    photoImg.style.display = 'block';
    document.getElementById('photoWrapper').classList.add('revealed'); 
    
    document.getElementById('mysteryName').innerText = finalName || (target ? target.name : "???");
    
    if (hasLost) document.getElementById('mysteryName').style.color = "var(--red-neon)";
    
    document.querySelectorAll('.path-box').forEach(box => {
        if (!box.dataset.index || !target) return;
        let trueClub = target.pastClubs[box.dataset.index]; // Zamiast serverTargetClubs
        let cleanC = getCleanClubName(trueClub).toLowerCase(); 
        if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC)) { box.classList.add('club-special'); }
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
            if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC)) { box.classList.add('club-special'); }
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
        let isSpecial = ['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC); 
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
    photoImg.src = `images/riders/image_0.png`; 
    photoImg.style.display = 'block';
    document.getElementById('photoWrapper').classList.add('revealed'); 
    
    document.getElementById('mysteryName').innerText = finalName || "???";
    
    if (hasLost) document.getElementById('mysteryName').style.color = "var(--red-neon)";
    
    document.querySelectorAll('.path-box').forEach(box => {
        if (!box.dataset.index) return;
        let trueClub = target.pastClubs[box.dataset.index];
        let cleanC = getCleanClubName(trueClub).toLowerCase(); 
        if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC)) { box.classList.add('club-special'); }
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
        title.innerHTML = `<i>${t('desktopRankClash')}</i>`;
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
            
            // Fix: Pobieramy dane zalogowanego usera niezależnie od limitu
            let myScoreFound = false;
            let myPersonalScore = null;
            if (playerId) {
                const myDoc = await db.collection("leaderboard_clash_beta").doc(playerId).get();
                if (myDoc.exists) myPersonalScore = myDoc.data();
            }

            tbody.innerHTML = '';
            if (scores.length === 0) {
                const emptyText = leaderboardData.hadAnyDocs ? t('noResultsCalib') : t('noResults');
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">${emptyText}</td></tr>`;
                return;
            }

            let pos = 1;
            scores.forEach((row) => {
                let safeNick = typeof escapeHTML === 'function' ? escapeHTML(row.nick || t('defaultPlayer')) : (row.nick || t('defaultPlayer'));
                if (safeNick === playerNickname) myScoreFound = true; // Sprawdzamy czy złapaliśmy go w Top 20
                
                let rangaText = getLeagueRankName(row.elo, row.matchesPlayed);
                // DOKLEJANIE KLUBU
                safeNick += getMiniClubBadge(row.club); 
                
                let isMe = (row.nick || t('defaultPlayer')) === playerNickname ? 'style="background: rgba(255,255,255,0.05);"' : '';
                
                tbody.innerHTML += `
                    <tr ${isMe}>
                        <td style="color:var(--accent); font-weight:900;">${pos}</td>
                        <td style="text-align:left;">${safeNick}</td>
                        <td style="font-size:10px;">${rangaText}</td>
                        <td style="color:#3399ff;">${row.elo}</td>
                    </tr>`;
                pos++;
            });

            // FIX: Jeśli gracz ma rangę, ale wypadł poza Top 20, doklejamy go na dół tabeli jako "Jego Wynik"
            if (!myScoreFound && myPersonalScore && myPersonalScore.matchesPlayed >= 5) {
                let myRank = getLeagueRankName(myPersonalScore.elo, myPersonalScore.matchesPlayed);
                let mySafeNick = typeof escapeHTML === 'function' ? escapeHTML(myPersonalScore.nick || t('defaultPlayer')) : (myPersonalScore.nick || t('defaultPlayer'));
                // DOKLEJANIE KLUBU
                mySafeNick += getMiniClubBadge(myPersonalScore.club);
                
                tbody.innerHTML += `<tr><td colspan="4" style="border-bottom:none; height: 5px; padding:0; background:transparent;"></td></tr>`;
                tbody.innerHTML += `
                    <tr style="background: rgba(51, 153, 255, 0.1); border: 1px solid #3399ff;">
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
            
            // To samo dla Time Attack: dbamy by gracz widział siebie
            let myScoreFound = false;
            let myPersonalScore = null;
            if (playerId) {
                const myDoc = await db.collection("leaderboard_timeattack").doc(playerId).get();
                if (myDoc.exists) myPersonalScore = myDoc.data();
            }

            tbody.innerHTML = '';
            if (scores.length === 0) { tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">${t('noResults')}</td></tr>`; return; }

            let pos = 1;
            scores.forEach((row) => {
                let safeNick = typeof escapeHTML === 'function' ? escapeHTML(row.nick || t('defaultPlayer')) : (row.nick || t('defaultPlayer'));
                if (safeNick === playerNickname) myScoreFound = true;

                // DOKLEJANIE KLUBU
                safeNick += getMiniClubBadge(row.club); 
                
                let isMe = (row.nick || t('defaultPlayer')) === playerNickname ? 'style="background: rgba(255,255,255,0.05);"' : '';
                let rankClass = pos === 1 ? "rank-1" : pos === 2 ? "rank-2" : pos === 3 ? "rank-3" : "";
                
                tbody.innerHTML += `
                    <tr ${isMe}>
                        <td class="${rankClass}" style="color:var(--accent); font-weight:900;">${pos}</td>
                        <td class="${rankClass}" style="text-align:left;">${safeNick}</td>
                        <td style="color:#1dd1a1; font-weight:900; text-align: center;">${row.score}</td>
                    </tr>`;
                pos++;
            });

            // Dodaj gracza poniżej limitu
            if (!myScoreFound && myPersonalScore) {
                let mySafeNick = typeof escapeHTML === 'function' ? escapeHTML(myPersonalScore.nick || t('defaultPlayer')) : (myPersonalScore.nick || t('defaultPlayer'));
                
                // DOKLEJANIE KLUBU
                mySafeNick += getMiniClubBadge(myPersonalScore.club);
                
                tbody.innerHTML += `<tr><td colspan="3" style="border-bottom:none; height: 5px; padding:0; background:transparent;"></td></tr>`;
                tbody.innerHTML += `
                    <tr style="background: rgba(29, 209, 161, 0.1); border: 1px solid #1dd1a1;">
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
                
                // DOKLEJANIE KLUBU (Daily, Weekly, Monthly, All-time)
                safeNick += getMiniClubBadge(row.club); 
                
                let isMe = (row.nick || t('defaultPlayer')) === playerNickname ? 'style="color: var(--accent);"' : '';
                
                tbody.innerHTML += `
                    <tr ${isMe}>
                        <td style="color:var(--accent); font-weight:900;">${index + 1}</td>
                        <td style="text-align:left;">${safeNick}</td>
                        <td>${wonText}</td>
                        <td style="color:var(--text-dim);">${row.guesses}</td>
                    </tr>`;
            });
        }
    } catch (e) { 
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">${t('errorDB')}</td></tr>`; 
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
            const leaderboardData = await fetchVisibleLeaderboardRows(
                'leaderboard_clash_beta',
                'elo',
                100,
                (row) => (row.matchesPlayed || 0) >= 5
            );
            let scores = leaderboardData.rows;

            let myScoreFound = false;
            let myPersonalScore = null;
            if (playerId) {
                const myDoc = await db.collection("leaderboard_clash_beta").doc(playerId).get();
                if (myDoc.exists) myPersonalScore = myDoc.data();
            }
            
            if (tbody) tbody.innerHTML = '';
            if (scores.length === 0) { 
                if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">${leaderboardData.hadAnyDocs ? t('noResultsCalib') : t('noResults')}</td></tr>`; 
                return; 
            }

            let currentRankPosition = 1;

            scores.forEach((row) => {
                let safeRenderNick = typeof escapeHTML === 'function' ? escapeHTML(row.nick || t('defaultPlayer')) : (row.nick || t('defaultPlayer'));
                if (safeRenderNick === playerNickname) myScoreFound = true; // Złapaliśmy go

                let rankClass = ""; 
                if (currentRankPosition === 1) rankClass = "rank-1"; 
                else if (currentRankPosition === 2) rankClass = "rank-2"; 
                else if (currentRankPosition === 3) rankClass = "rank-3";
                
                // DOKLEJANIE KLUBU W CLASH (Mobile)
                safeRenderNick += getMiniClubBadge(row.club); 
                
                let isMe = (row.nick || t('defaultPlayer')) === playerNickname ? 'style="background: rgba(255,255,255,0.05);"' : '';
                
                let rangaText = getLeagueRankName(row.elo, row.matchesPlayed);
                let rangaColorClass = getRankClass(row.elo, row.matchesPlayed);
                let rangaImg = getLeagueImageTag(row.elo, row.matchesPlayed, 18);
                
                if (tbody) { 
                    tbody.innerHTML += `<tr ${isMe}>
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

            // Dodaj gracza jeśli wypadł poza Top 100
            if (!myScoreFound && myPersonalScore && myPersonalScore.matchesPlayed >= 5 && tbody) {
                let myRank = getLeagueRankName(myPersonalScore.elo, myPersonalScore.matchesPlayed);
                let myRankClass = getRankClass(myPersonalScore.elo, myPersonalScore.matchesPlayed);
                let myRankImg = getLeagueImageTag(myPersonalScore.elo, myPersonalScore.matchesPlayed, 18);
                let mySafeNick = typeof escapeHTML === 'function' ? escapeHTML(myPersonalScore.nick || t('defaultPlayer')) : (myPersonalScore.nick || t('defaultPlayer'));
                
                // DOKLEJANIE KLUBU
                mySafeNick += getMiniClubBadge(myPersonalScore.club);
                
                tbody.innerHTML += `<tr><td colspan="5" style="border-bottom:none; height: 5px; padding:0; background:transparent;"></td></tr>`;
                tbody.innerHTML += `
                    <tr style="background: rgba(51, 153, 255, 0.1); border: 1px solid #3399ff;">
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

            if (tbody && tbody.innerHTML === '') {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">${t('noResultsCalib')}</td></tr>`;
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
        if (type === 'daily') snapshot = await db.collection("rankings").doc(selectedDailyDay.toString()).collection("scores").limit(100).get(); // Dałem limit 100 żeby było spójnie z Clashem na mobile
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
            
            // DOKLEJANIE KLUBU W ZWYKLYCH TRYBACH (Mobile)
            safeRenderNick += getMiniClubBadge(row.club); 
            
            let isMe = (row.nick || t('defaultPlayer')) === playerNickname ? 'style="background: rgba(255,255,255,0.05);"' : '';
            
            if (tbody) { 
                tbody.innerHTML += `<tr ${isMe}>
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
        } else {
            league.losses++;
            league.winStreak = 0;
            resultText = finishedBySurrender ? "PORAŻKA (PODDANIE)" : "PORAŻKA";
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

// --- SILNIK SIECIOWY GRY ---
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
        // Jeśli nasz kolor to czerwony (Host), to my musimy być w data.p1.
        // Jeśli nasz kolor to niebieski (Gość), to my musimy być w data.p2.
        // Jeśli nas tam nie ma, oznacza to, że w ułamku sekundy Firebase wrzucił kogoś innego!
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
                let bSize = (data.board && data.board.length) ? Math.sqrt(data.board.length) : (data.boardSize || 3);
                if (!Number.isInteger(bSize)) bSize = 3;

                db.collection("clash_rooms").doc(currentClashRoom).update({
                    status: 'vsScreen', turn: Math.random() < 0.5 ? 'red' : 'blue',
                    board: Array(bSize * bSize).fill(null), guessedPlayers: Array(bSize * bSize).fill(null), lastAction: '',
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

    vsOverlay.style.display = 'block'; setTimeout(() => vsOverlay.style.opacity = '1', 10); playSound('win');

    if(!isLocalClash && myClashColor === 'red') {
        const coinTossWinner = Math.random() < 0.5 ? 'red' : 'blue';
        setTimeout(() => { db.collection("clash_rooms").doc(currentClashRoom).update({ status: 'coinToss', coinTossWinner }); }, 3000);
    } else if (isLocalClash) {
        const coinTossWinner = data.turn;
        setTimeout(() => { updateLocalClashData({ status: 'coinToss', coinTossWinner }); }, 3000);
    }
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

    ['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].forEach(c => clubs.delete(c)); 
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
// ==============================================
// ====== KARIERA: COPERO MINIGAMES STYLE =======
// ==============================================

let cState = {
    active: false,
    name: "KOWALSKI", num: 99, nat: "Polska", flagCode: "pl", 
    age: 15, maxAge: 41, 
    ovr: 40, 
    club: null, league: null, 
    contractYears: 0, 
    stats: { heats: 0, pts: 0, bon: 0, dmp: 0, ims: 0 }, history: [],
    guaranteedSpotNextSeason: false,
    leagues: {
        "PGE Ekstraliga": ["Motor Lublin", "Sparta Wrocław", "Apator Toruń", "Stal Gorzów Wielkopolski", "Włókniarz Częstochowa", "GKM Grudziądz", "Falubaz Zielona Góra", "Unia Leszno"],
        "Metalkas 2.E": ["Polonia Bydgoszcz", "Ostrovia Ostrów Wielkopolski", "Wilki Krosno", "PSŻ Poznań", "Stal Rzeszów", "Orzeł Łódź", "ROW Rybnik", "Polonia Piła"],
        "KLŻ": ["Kolejarz Opole", "Landshut Devils", "Lokomotiv Daugavpils", "Speedway Kraków", "Start Gniezno", "Wybrzeże Gdańsk", "Unia Tarnów", "Śląsk Świętochłowice", "Kolejarz Rawicz"]
    }
};

let activeLoanClub = null;
let activeLoanLeague = null;

const CAREER_CONSTANTS = {
    "PGE Ekstraliga": { diff: 80, baseMatches: 14, logo: "🏆" },
    "Metalkas 2.E": { diff: 64, baseMatches: 14, logo: "🥈" },
    "KLŻ": { diff: 45, baseMatches: 12, logo: "🥉" }
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

function getCareerClubColor(clubName, leagueName = null) {
    const normalizedClub = normalizeForCheck(clubName || "");
    if (CAREER_CLUB_COLORS[normalizedClub]) return CAREER_CLUB_COLORS[normalizedClub];
    if (leagueName === "PGE Ekstraliga") return "#ffd54f";
    if (leagueName === "Metalkas 2.E") return "#8ec5ff";
    if (leagueName === "KLŻ") return "#c49b3d";
    return "#ffffff";
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

function getCareerHeatsPerMatch(age, formRatio, benched = false) {
    if (benched) return Math.random() * 1.1;

    const roll = Math.random();
    if (age <= 16) {
        if (roll < 0.25) return 1;
        if (roll < 0.75) return 2;
        return 3;
    }
    if (age <= 20) {
        if (formRatio > 1.05 && roll < 0.10) return 5;
        if (formRatio > 0.95 && roll < 0.28) return 4;
        if (roll < 0.60) return 3;
        return 2;
    }
    if (age <= 29) {
        if (formRatio > 1.10 && roll < 0.12) return 5;
        if (roll < 0.42) return 3;
        if (roll < 0.82) return 4;
        return 2;
    }
    if (age <= 34) {
        if (formRatio > 1.12 && roll < 0.08) return 5;
        if (roll < 0.48) return 3;
        if (roll < 0.83) return 4;
        return 2;
    }
    if (roll < 0.20) return 2;
    if (roll < 0.65) return 3;
    if (roll < 0.92) return 4;
    return 5;
}

function getCareerHeatAverage(effOvr, leagueDiff, age, totalHeats, benched = false) {
    if (totalHeats === 0 || benched) return 0.0;

    let diffPoints = effOvr - leagueDiff;
    let baseAvg = 1.50;
    
    if (diffPoints >= 0) baseAvg += (diffPoints * 0.035);
    else baseAvg += (diffPoints * 0.040); 

    if (age <= 19) baseAvg += 0.15; 
    else if (age <= 29) baseAvg += 0.05;
    else if (age > 35) baseAvg -= 0.10; 

    baseAvg += (Math.random() * 0.40) - 0.20;
    return Math.max(0.10, Math.min(baseAvg, 2.65));
}

function showCareerContinuePrompt() {
    const area = document.getElementById('careerActionArea');
    area.innerHTML = `
        <div class="copero-card stay-card" style="grid-column: 1 / -1; max-width: 290px; margin: 0 auto;" onclick="playSeason(0)">
            <span class="copero-card-title">KONIEC SEZONU</span>
            <span class="copero-card-club">SIMULUJ NASTĘPNY ROK</span>
            <div class="copero-card-img" style="border-radius:12px; background: transparent; border: 1px dashed rgba(255,255,255,0.2);">⏭️</div>
            <span class="text-white font-bold text-xs">Kliknij, aby przejść dalej</span>
            <span class="text-dim font-bold text-xs">Bez automatycznej pętli sezonów</span>
        </div>
    `;
}

function openCareerMode() {
    if (!window.isAdmin && !window.isTester) {
        appAlert("Tryb 'Speedway Legend' znajduje się w fazie zamkniętych testów.", "Brak dostępu 🔒"); return;
    }

    document.getElementById('mainMenuContainer').style.display = 'none';
    const desktopMenu = document.getElementById('desktopMainMenu');
    if (desktopMenu) desktopMenu.style.display = 'none';
    document.getElementById('careerContainer').style.display = 'grid';
    
    cState = { 
        active: true, name: "KOWALSKI", num: 99, nat: "Polska", flagCode: "pl", 
        age: 15, maxAge: 41, ovr: 35,
        club: null, league: null, contractYears: 0,
        stats: { heats: 0, pts: 0, bon: 0, dmp: 0, ims: 0 }, history: [],
        guaranteedSpotNextSeason: false,
        leagues: JSON.parse(JSON.stringify(CAREER_CONSTANTS))
    };
    
    cState.leagues = {
        "PGE Ekstraliga": ["Motor Lublin", "Sparta Wrocław", "Apator Toruń", "Stal Gorzów Wielkopolski", "Włókniarz Częstochowa", "GKM Grudziądz", "Falubaz Zielona Góra", "Unia Leszno"],
        "Metalkas 2.E": ["Polonia Bydgoszcz", "Ostrovia Ostrów Wielkopolski", "Wilki Krosno", "PSŻ Poznań", "Stal Rzeszów", "Orzeł Łódź", "ROW Rybnik", "Polonia Piła"],
        "KLŻ": ["Kolejarz Opole", "Landshut Devils", "Lokomotiv Daugavpils", "Speedway Kraków", "Start Gniezno", "Wybrzeże Gdańsk", "Unia Tarnów", "Śląsk Świętochłowice", "Kolejarz Rawicz"]
    };
    
    const timelineHeader = document.getElementById('timelineHeader');
    if(timelineHeader) timelineHeader.children[5].innerText = "PKT";

    document.getElementById('careerSetup').style.display = 'block';
    document.getElementById('careerMainPanel').style.display = 'none';
    document.getElementById('careerRetirement').style.display = 'none';
    
    document.getElementById('timelineHeader').style.display = 'none';
    document.getElementById('timelineEmpty').style.display = 'block';
    document.getElementById('timelineList').innerHTML = '';
}

function exitCareerMode() {
    if (confirm("Chcesz wyjść? Postęp zostanie zresetowany.")) window.location.reload();
}

function updateKevlarPreview() {
    let nameVal = document.getElementById('careerNameInput').value.trim().toUpperCase() || "KOWALSKI";
    let numVal = document.getElementById('careerNumInput').value || "99";
    document.getElementById('kevlarNamePreview').innerText = nameVal;
    document.getElementById('kevlarNumPreview').innerText = numVal;
}

function selectCareerNat(name, code, el) {
    cState.nat = name; cState.flagCode = code;
    document.querySelectorAll('#careerSetup .flag-card').forEach(f => f.classList.remove('active'));
    el.classList.add('active');
}

function startCareerAcademy() {
    let nameVal = document.getElementById('careerNameInput').value.trim().toUpperCase();
    if(nameVal) cState.name = nameVal;
    cState.num = document.getElementById('careerNumInput').value || 99;
    cState.ovr = Math.floor(Math.random() * 11) + 30;

    document.getElementById('careerSetup').style.display = 'none';
    document.getElementById('careerMainPanel').style.display = 'flex'; 
    
    cState.age = 16;
    updateLeftPanelUI();
    generateAcademyOffers(); 
}

function updateLeftPanelUI() {
    document.getElementById('cOvr').innerText = cState.ovr;
    document.getElementById('cFlag').src = `https://flagcdn.com/w40/${cState.flagCode}.png`;
    
    let lastName = cState.name;
    if (lastName.length > 12) lastName = lastName.substring(0, 10) + "...";
    document.getElementById('cNumLabel').innerText = cState.num; 
    
    document.getElementById('cCurrentClub').innerText = cState.club ? cState.club : "Wolny agent";
    document.getElementById('cAge').innerText = cState.age;

    document.getElementById('cHeats').innerText = cState.stats.heats;
    document.getElementById('cPts').innerText = `${cState.stats.pts}`; 
    let avg = cState.stats.heats > 0 ? ((cState.stats.pts + cState.stats.bon) / cState.stats.heats).toFixed(2) : "0.00";
    document.getElementById('cAvg').innerText = avg;

    const tBox = document.getElementById('cTrophiesDisplay');
    if (cState.stats.dmp === 0 && cState.stats.ims === 0) {
        tBox.innerText = "🏆 BRAK TROFEÓW";
    } else {
        let tHtml = "";
        for(let i=0; i<cState.stats.ims; i++) tHtml += "🌍 ";
        for(let i=0; i<cState.stats.dmp; i++) tHtml += "🥇 ";
        tBox.innerHTML = tHtml;
    }
}

function generateAcademyOffers() {
    const area = document.getElementById('careerActionArea');
    let c1 = cState.leagues["KLŻ"][Math.floor(Math.random() * cState.leagues["KLŻ"].length)];
    let c2 = cState.leagues["KLŻ"][Math.floor(Math.random() * cState.leagues["KLŻ"].length)];
    let c3 = cState.leagues["Metalkas 2.E"][Math.floor(Math.random() * cState.leagues["Metalkas 2.E"].length)];

    cState.pendingOffers = [
        { league: "KLŻ", club: c1, years: 3, type: "normal" },
        { league: "KLŻ", club: c2, years: 3, type: "normal" },
        { league: "Metalkas 2.E", club: c3, years: 3, type: "normal" }
    ];

    area.innerHTML = `
        <h3 class="text-white font-black m-0 mb-5 text-xl">Oferta Wychowanka</h3>
        <p class="text-xs text-dim mb-15">Trzy kluby chcą wcielić cię do swojego projektu młodzieżowego. Wybierz mądrze.</p>
        <div class="copero-action-grid">
            <div class="copero-card" onclick="signContract(0)">
                <span class="copero-card-title">PODPISZ Z</span>
                <span class="copero-card-club">${c1}</span>
                <div class="copero-card-img">🥉</div>
                <span class="copero-card-bot">KLŻ</span>
            </div>
            <div class="copero-card" onclick="signContract(1)">
                <span class="copero-card-title">PODPISZ Z</span>
                <span class="copero-card-club">${c2}</span>
                <div class="copero-card-img">🥉</div>
                <span class="copero-card-bot">KLŻ</span>
            </div>
            <div class="copero-card stay-card" style="grid-column: 1 / -1; max-width: 250px; margin: 0 auto;" onclick="signContract(2)">
                <span class="copero-card-title">PODPISZ Z</span>
                <span class="copero-card-club">${c3}</span>
                <div class="copero-card-img">🥈</div>
                <span class="copero-card-bot">Metalkas 2.E</span>
            </div>
        </div>
    `;
    renderTimeline();
}

function generateTransferWindow() {
    const area = document.getElementById('careerActionArea');
    let possibleLeagues = [];
    if (cState.ovr < 55) possibleLeagues = ["KLŻ", "Metalkas 2.E"];
    else if (cState.ovr < 75) possibleLeagues = ["Metalkas 2.E", "PGE Ekstraliga"];
    else possibleLeagues = ["PGE Ekstraliga", "PGE Ekstraliga"];

    cState.pendingOffers = [];
    possibleLeagues.forEach(lName => {
        if (cState.pendingOffers.length >= 2) return;
        let club = cState.leagues[lName][Math.floor(Math.random() * cState.leagues[lName].length)];
        cState.pendingOffers.push({ 
            league: lName, club: club, 
            years: cState.age <= 21 ? 2 : (Math.floor(Math.random() * 2) + 1), type: "normal"
        });
    });

    let stayType = "stay";
    if (cState.age <= 21 || (cState.history.length > 0 && parseFloat(cState.history[cState.history.length-1].avg) >= 1.5)) {
        stayType = "extension";
    }
    cState.pendingOffers.push({ league: cState.league, club: cState.club, years: 2, type: stayType });

    let o1 = cState.pendingOffers[0];
    let o2 = cState.pendingOffers[1];
    let o3 = cState.pendingOffers[2];

    area.innerHTML = `
        <h3 class="text-white font-black m-0 mb-5 text-xl">Okienko transferowe</h3>
        <p class="text-xs text-dim mb-15">Otrzymałeś nowe propozycje. Możesz przyjąć jedną z nich lub zostać w zespole.</p>
        <div class="copero-action-grid">
            <div class="copero-card" onclick="signContract(0)">
                <span class="copero-card-title">PODPISZ Z</span>
                <span class="copero-card-club">${o1.club}</span>
                <div class="copero-card-img">${CAREER_CONSTANTS[o1.league].logo}</div>
                <span class="copero-card-bot">${o1.league}</span>
            </div>
            <div class="copero-card" onclick="signContract(1)">
                <span class="copero-card-title">PODPISZ Z</span>
                <span class="copero-card-club">${o2.club}</span>
                <div class="copero-card-img">${CAREER_CONSTANTS[o2.league].logo}</div>
                <span class="copero-card-bot">${o2.league}</span>
            </div>
            <div class="copero-card stay-card" style="grid-column: 1 / -1; max-width: 250px; margin: 0 auto;" onclick="signContract(2)">
                <span class="copero-card-title">${stayType === 'extension' ? 'PRZEDŁUŻ W' : 'ZOSTAŃ W'}</span>
                <span class="copero-card-club">${o3.club}</span>
                <div class="copero-card-img">${CAREER_CONSTANTS[o3.league].logo}</div>
                <span class="copero-card-bot">${o3.league}</span>
            </div>
        </div>
    `;
    renderTimeline();
}

function showLoanWindow() {
    const area = document.getElementById('careerActionArea');
    let lowerLeague = cState.league === "PGE Ekstraliga" ? "Metalkas 2.E" : "KLŻ";
    
    let l1 = cState.leagues[lowerLeague][Math.floor(Math.random() * cState.leagues[lowerLeague].length)];
    let l2 = cState.leagues[lowerLeague][Math.floor(Math.random() * cState.leagues[lowerLeague].length)];

    cState.pendingOffers = [
        { league: lowerLeague, club: l1, years: 1, type: "loan" },
        { league: lowerLeague, club: l2, years: 1, type: "loan" },
        { league: cState.league, club: cState.club, years: 1, type: "stay" }
    ];

    area.innerHTML = `
        <h3 class="text-white font-black m-0 mb-5 text-xl">Wypożyczenie</h3>
        <p class="text-xs text-dim mb-15">Trener sugeruje jazdę o ligę niżej w celu rozwoju. Wybierz, gdzie chcesz się przenieść.</p>
        <div class="copero-action-grid">
            <div class="copero-card" onclick="signContract(0)">
                <span class="copero-card-title">WYPOŻYCZENIE DO</span>
                <span class="copero-card-club">${l1}</span>
                <div class="copero-card-img">${CAREER_CONSTANTS[lowerLeague].logo}</div>
                <span class="copero-card-bot">${lowerLeague}</span>
            </div>
            <div class="copero-card" onclick="signContract(1)">
                <span class="copero-card-title">WYPOŻYCZENIE DO</span>
                <span class="copero-card-club">${l2}</span>
                <div class="copero-card-img">${CAREER_CONSTANTS[lowerLeague].logo}</div>
                <span class="copero-card-bot">${lowerLeague}</span>
            </div>
            <div class="copero-card stay-card" style="grid-column: 1 / -1; max-width: 250px; margin: 0 auto;" onclick="rejectLoan()">
                <span class="copero-card-title">ODRZUĆ I WALCZ O SKŁAD</span>
                <span class="copero-card-club">${cState.club}</span>
                <div class="copero-card-img" style="background:transparent; border: 1px dashed rgba(255,255,255,0.2);">❌</div>
                <span class="text-red font-bold text-xs mt-5">Ryzyko ławki rezerwowych</span>
            </div>
        </div>
    `;
}

function showEventWindow() {
    const area = document.getElementById('careerActionArea');
    
    const eventsPool = [
        { title: "Tytanowe sprzęgło", desc: "Podejrzany tuner oferuje super sprzęgła. Szybkie, ale czy legalne?", img: "⚙️", opt1: { title: "Ryzykuję", bot1: "60%: +3 OVR", bot2: "40%: -3 OVR", fn: "resolveRandomEvent(3, -3, 0.60)" }, opt2: { title: "Gram fair", bot1: "Brak zmian", bot2: "", fn: "playSeason(0)" } },
        { title: "Sponsor Strategiczny", desc: "Globalna marka proponuje ci kontrakt za aktywność w TV i mediach.", img: "📸", opt1: { title: "Zgadzam się", bot1: "40%: Zadowolenie", bot2: "60%: -2 OVR", fn: "resolveRandomEvent(0, -2, 0.40)" }, opt2: { title: "Tylko żużel", bot1: "+1 OVR", bot2: "", fn: "playSeason(1)" } },
        { title: "Liga Brytyjska (SGB)", desc: "Klub z Premiership oferuje starty. Dobry objazd, ale męcząca logistyka.", img: "🇬🇧", opt1: { title: "Lecę do UK", bot1: "50%: +4 OVR", bot2: "50%: -2 OVR", fn: "resolveRandomEvent(4, -2, 0.50)" }, opt2: { title: "Tylko Polska", bot1: "+1 OVR", bot2: "", fn: "playSeason(1)" } },
        { title: "Konflikt z Liderem", desc: "Gwiazda zespołu wymusza na mechanikach robienie jego silników poza kolejką.", img: "🤬", opt1: { title: "Robię aferę", bot1: "70%: Wygrywasz (+2)", bot2: "30%: Konflikt (-4)", fn: "resolveRandomEvent(2, -4, 0.70)" }, opt2: { title: "Siedzę cicho", bot1: "-1 OVR", bot2: "", fn: "playSeason(-1)" } },
        { title: "Zimowy Obóz", desc: "Trener PZM zaprasza cię na morderczy obóz kondycyjny w górach.", img: "🏔️", opt1: { title: "Jadę z kadrą", bot1: "75%: +3 OVR", bot2: "25%: -2 OVR", fn: "resolveRandomEvent(3, -2, 0.75)" }, opt2: { title: "Odpoczywam", bot1: "Brak zmian", bot2: "", fn: "playSeason(0)" } },
        { title: "Kryzys Formy", desc: "Po upadku zamykasz gaz. Najlepszy psycholog sportowy oferuje pomoc.", img: "🧠", opt1: { title: "Terapia", bot1: "85%: +2 OVR", bot2: "15%: Nic z tego", fn: "resolveRandomEvent(2, 0, 0.85)" }, opt2: { title: "Poradzę sobie", bot1: "20%: +1 OVR", bot2: "80%: -2 OVR", fn: "resolveRandomEvent(1, -2, 0.20)" } },
        { title: "Bunt Tunera", desc: "Twój mechanik grozi odejściem. Możesz spróbować go przebłagać nowym warsztatem.", img: "🛠️", opt1: { title: "Przekonuję go", bot1: "80%: +1 OVR", bot2: "20%: Odchodzi (-2)", fn: "resolveRandomEvent(1, -2, 0.80)" }, opt2: { title: "Droga wolna", bot1: "Spadek formy (-3 OVR)", bot2: "", fn: "playSeason(-3)" } },
        { title: "Szwedzka Elitserien", desc: "Wyjazdy do Szwecji kuszą technicznymi, wymagającymi torami.", img: "🇸🇪", opt1: { title: "Podpisuję", bot1: "70%: +2 OVR", bot2: "30%: -2 OVR", fn: "resolveRandomEvent(2, -2, 0.70)" }, opt2: { title: "Odpuszczam", bot1: "Brak zmian", bot2: "", fn: "playSeason(0)" } },
        { title: "Głośny Wywiad", desc: "Dziennikarz namawia na kontrowersyjny wywiad o władzach ligi.", img: "🎙️", opt1: { title: "Mówię prawdę", bot1: "30%: Szacunek (+2)", bot2: "70%: Kary i stres (-2)", fn: "resolveRandomEvent(2, -2, 0.30)" }, opt2: { title: "Tylko regułki", bot1: "Brak zmian", bot2: "", fn: "playSeason(0)" } },
        { title: "Trefny Metanol", desc: "Dostałeś zanieczyszczone paliwo z innej beczki przed derbami.", img: "🛢️", opt1: { title: "Szukam nowego", bot1: "50%: Uda się (+1)", bot2: "50%: Zatarty (-3)", fn: "resolveRandomEvent(1, -3, 0.50)" }, opt2: { title: "Ryzykuję stare", bot1: "-1 OVR", bot2: "", fn: "playSeason(-1)" } },
        { title: "Trener Od Startów", desc: "Legenda żużla proponuje ci prywatne treningi momentu startowego.", img: "🚦", opt1: { title: "Biorę lekcje", bot1: "85%: +2 OVR", bot2: "15%: Brak różnicy (-1)", fn: "resolveRandomEvent(2, -1, 0.85)" }, opt2: { title: "Sam trenuję", bot1: "Brak zmian", bot2: "", fn: "playSeason(0)" } },
        { title: "Afera Oponiarska", desc: "Ktoś podrzucił ci nienacinane, zakazane opony przed weryfikatorem.", img: "🍩", opt1: { title: "Przekonuję sędziego", bot1: "90%: Sprawa cichnie", bot2: "10%: Skandal (-5 OVR)", fn: "resolveRandomEvent(0, -5, 0.90)" }, opt2: { title: "Przyznaję się", bot1: "-2 OVR (Kara)", bot2: "", fn: "playSeason(-2)" } },
        { title: "Zatrucie na wyjeździe", desc: "Zjadłeś coś nieświeżego przed meczem. Czujesz się fatalnie.", img: "🤢", opt1: { title: "Kroplówka", bot1: "70%: Pomaga (+0)", bot2: "30%: Mdlejesz (-2)", fn: "resolveRandomEvent(0, -2, 0.70)" }, opt2: { title: "Zgłaszam L4", bot1: "-1 OVR", bot2: "", fn: "playSeason(-1)" } },
        { title: "Kradzież z Busa", desc: "W nocy ukradli ci najlepsze silniki z podjazdu!", img: "🚐", opt1: { title: "Kupuję w ciemno", bot1: "60%: Dobry sprzęt (+1)", bot2: "40%: Szmelc (-3)", fn: "resolveRandomEvent(1, -3, 0.60)" }, opt2: { title: "Jadę na rezerwie", bot1: "-4 OVR", bot2: "", fn: "playSeason(-4)" } },
        { title: "Eksperci od Aerodynamiki", desc: "Inżynierowie chcą poprawić twoją sylwetkę. To trudne testy.", img: "💨", opt1: { title: "Testuję sylwetkę", bot1: "60%: Sukces (+4 OVR)", bot2: "40%: Brak zmian", fn: "resolveRandomEvent(4, 0, 0.60)" }, opt2: { title: "Szkoda czasu", bot1: "Brak zmian", bot2: "", fn: "playSeason(0)" } },
        { title: "Ustawiony tor", desc: "Przeciwnicy ubili tor pod bandą, zlewając go wodą. To pułapka.", img: "🚜", opt1: { title: "Robię nożyce", bot1: "65%: Wygrywasz (+2)", bot2: "35%: Upadek (-2)", fn: "resolveRandomEvent(2, -2, 0.65)" }, opt2: { title: "Asekuracyjnie", bot1: "Brak zmian", bot2: "", fn: "playSeason(0)" } }
    ];

    let evData = eventsPool[Math.floor(Math.random() * eventsPool.length)];

    area.innerHTML = `
        <h3 class="text-white font-black m-0 mb-5 text-xl">${evData.title}</h3>
        <p class="text-xs text-dim mb-15">${evData.desc}</p>
        <div class="copero-action-grid">
            <div class="copero-card" onclick="${evData.opt1.fn}">
                <span class="copero-card-club mb-10">${evData.opt1.title}</span>
                <div class="copero-card-img" style="border-radius:12px;">${evData.img}</div>
                <span class="text-green font-bold text-xs">${evData.opt1.bot1}</span>
                <span class="text-red font-bold text-xs">${evData.opt1.bot2}</span>
            </div>
            <div class="copero-card stay-card" onclick="${evData.opt2.fn}">
                <span class="copero-card-club mb-10">${evData.opt2.title}</span>
                <div class="copero-card-img" style="border-radius:12px; background: transparent; border: 1px dashed rgba(255,255,255,0.2);">❌</div>
                <span class="text-white font-bold text-xs">${evData.opt2.bot1}</span>
                <span class="text-dim font-bold text-xs">${evData.opt2.bot2}</span>
            </div>
        </div>
    `;
}

function resolveRandomEvent(succOVR, failOVR, chance) {
    const overlay = document.getElementById('careerEventOverlay');
    const title = document.getElementById('eventAnimTitle');
    const wheel = document.getElementById('careerWheelInner');

    if (!overlay || !title || !wheel) {
        const isSuccess = Math.random() < chance;
        if (isSuccess) playSeason(succOVR);
        else playSeason(failOVR);
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
            if(isSuccess) playSeason(succOVR);
            else playSeason(failOVR);
        }, 2000);
        
    }, 3200); 
}

function signContract(idx) {
    let o = cState.pendingOffers[idx];
    activeLoanClub = null;
    activeLoanLeague = null;

    if (o.type === "loan") {
        activeLoanClub = o.club;
        activeLoanLeague = o.league;
    } else if (o.type === "stay") {
    } else {
        cState.club = o.club;
        cState.league = o.league;
        cState.contractYears = o.years;
    }
    
    updateLeftPanelUI();
    if (Math.random() < 0.30) showEventWindow();
    else playSeason(0);
}

function rejectLoan() {
    activeLoanClub = null;
    activeLoanLeague = null;
    showToast(`Odrzuciłeś ofertę! Walczysz o skład.`, "normal");
    
    cState.guaranteedSpotNextSeason = true;
    
    if (Math.random() < 0.3) showEventWindow();
    else playSeason(0, true); 
}

function generateSeasonTable(leagueName, playerClub, playerAvg) {
    let clubs = [...cState.leagues[leagueName]];
    let table = [];
    let matches = CAREER_CONSTANTS[leagueName].baseMatches;

    clubs.forEach(club => {
        let isPlayer = (club === playerClub);
        let power = Math.random() * 60 + 40; 
        
        if (isPlayer) {
            if (playerAvg > 2.4) power += 50;
            else if (playerAvg > 2.0) power += 35;
            else if (playerAvg > 1.6) power += 15;
            else if (playerAvg < 1.0) power -= 20;
        }
        table.push({ name: club, isMe: isPlayer, power: power });
    });

    table.sort((a, b) => b.power - a.power);

    let currentPts = matches * 2 + Math.floor(Math.random() * 5); 
    if (currentPts > matches * 2 + 5) currentPts = matches * 2 + 3;

    table.forEach((t, i) => {
        t.pos = i + 1;
        t.matches = matches;
        t.pts = currentPts;
        currentPts -= Math.floor(Math.random() * 4) + 1; 
        if (currentPts < 0) currentPts = 0;
    });

    return table;
}

function playSeason(ovrMod = 0, benched = false) {
    let isGuaranteed = (cState.guaranteedSpotNextSeason === "active");
    if (isGuaranteed) benched = false; 

    let effOvr = cState.ovr + ovrMod;
    let playingLeague = activeLoanLeague ? activeLoanLeague : cState.league;
    let playingClub = activeLoanClub ? activeLoanClub : cState.club;

    let lData = CAREER_CONSTANTS[playingLeague];
    let formRatio = effOvr / lData.diff; 
    let seasonMatches = lData.baseMatches + 4; 
    
    let heatsPerMatch = getCareerHeatsPerMatch(cState.age, formRatio, benched);
    if (isGuaranteed) heatsPerMatch = Math.max(heatsPerMatch, 4);

    let totalHeats = Math.round(seasonMatches * heatsPerMatch);
    if (totalHeats < 0) totalHeats = 0;

    let rawAvg = getCareerHeatAverage(effOvr, lData.diff, cState.age, totalHeats, benched);
    
    let totalPts = Math.round(totalHeats * rawAvg);
    let totalBonus = Math.round(totalPts * (Math.random() * 0.15 + 0.05));
    if (totalPts === 0) totalBonus = 0;
    
    let officialAvg = totalHeats > 0 ? ((totalPts + totalBonus) / totalHeats) : 0;
    if (officialAvg > 3.00) officialAvg = 3.00;

    cState.stats.heats += totalHeats; 
    cState.stats.pts += totalPts;
    cState.stats.bon += totalBonus;
    
    // ZBALANSOWANY, SZYBSZY OVR
    let ageGrowth = 0;
    if (cState.age <= 21) ageGrowth = Math.floor(Math.random() * 4) + 4; // Młodzieżowiec rośnie potężnie (+4 do +7)
    else if (cState.age <= 24) ageGrowth = Math.floor(Math.random() * 3) + 2; // +2 do +4
    else if (cState.age <= 29) ageGrowth = Math.floor(Math.random() * 2) + 1; // +1 do +2
    else if (cState.age <= 33) ageGrowth = Math.floor(Math.random() * 2); // 0 do +1
    else ageGrowth = -Math.floor(Math.random() * 2) - 1; // Spadki u weteranów (-1 do -2)
    
    let perfGrowth = 0;
    if (officialAvg >= 2.4) perfGrowth = 4;
    else if (officialAvg >= 2.0) perfGrowth = 3;
    else if (officialAvg >= 1.6) perfGrowth = 2;
    else if (officialAvg >= 1.3) perfGrowth = 1;
    else if (officialAvg < 1.0) perfGrowth = -1;

    if (totalHeats < 15) perfGrowth -= 1; 
    if (isGuaranteed) perfGrowth += 1; 
    
    cState.ovr += (ageGrowth + perfGrowth);
    if (cState.ovr > 99) cState.ovr = 99;
    if (cState.ovr < 30) cState.ovr = 30;

    let gotIMS = false;
    if (effOvr >= 90 && Math.random() < ((effOvr - 85) / 25)) { gotIMS = true; cState.stats.ims++; }

    // TABELA LIGOWA I AWANSY
    let seasonTable = generateSeasonTable(playingLeague, playingClub, officialAvg);
    let myTeamData = seasonTable.find(t => t.isMe);
    let myPos = myTeamData ? myTeamData.pos : 4;
    
    let gotDMP = false;
    let medalColor = null;
    let promoted = false;
    let relegated = false;

    if (playingLeague === "PGE Ekstraliga") {
        if (myPos === 1) { gotDMP = true; medalColor = "ZŁOTO"; cState.stats.dmp++; }
        else if (myPos === 2) { gotDMP = true; medalColor = "SREBRO"; }
        else if (myPos === 3) { gotDMP = true; medalColor = "BRĄZ"; }
        else if (myPos === seasonTable.length) relegated = true;
    } else if (playingLeague === "Metalkas 2.E") {
        if (myPos === 1) promoted = true;
        else if (myPos === seasonTable.length) relegated = true;
    } else if (playingLeague === "KLŻ") {
        if (myPos === 1) promoted = true;
    }

    // BEZPIECZNA LOGIKA ZAMIANY LIGOWEJ
    if (promoted) {
        let higherLeague = playingLeague === "KLŻ" ? "Metalkas 2.E" : "PGE Ekstraliga";
        let clubIndex = cState.leagues[playingLeague].indexOf(playingClub);
        if (clubIndex > -1) {
            cState.leagues[playingLeague].splice(clubIndex, 1);
            let randIdx = Math.floor(Math.random() * cState.leagues[higherLeague].length);
            let relegatedClub = cState.leagues[higherLeague].splice(randIdx, 1)[0]; 
            cState.leagues[higherLeague].push(playingClub);
            cState.leagues[playingLeague].push(relegatedClub);
        }
    }
    else if (relegated) {
        let lowerLeague = playingLeague === "PGE Ekstraliga" ? "Metalkas 2.E" : "KLŻ";
        let clubIndex = cState.leagues[playingLeague].indexOf(playingClub);
        if (clubIndex > -1) {
            cState.leagues[playingLeague].splice(clubIndex, 1);
            let randIdx = Math.floor(Math.random() * cState.leagues[lowerLeague].length);
            let promotedClub = cState.leagues[lowerLeague].splice(randIdx, 1)[0];
            cState.leagues[lowerLeague].push(playingClub);
            cState.leagues[playingLeague].push(promotedClub);
        }
    }
    
    if (!activeLoanLeague) {
        for (let l in cState.leagues) {
            if (cState.leagues[l].includes(cState.club)) cState.league = l;
        }
    }

    let displayClubName = activeLoanLeague ? `${playingClub}` : cState.club;

    cState.history.push({
        age: cState.age, club: displayClubName, league: playingLeague, ovr: cState.ovr, 
        mec: seasonMatches, bie: totalHeats, pkt: totalPts, bon: totalBonus, avg: officialAvg.toFixed(2),
        loan: activeLoanLeague !== null,
        dmp: gotDMP, ims: gotIMS,
        table: seasonTable
    });

    cState.age++;
    if (!activeLoanLeague) cState.contractYears--;

    activeLoanClub = null; activeLoanLeague = null;

    if (cState.guaranteedSpotNextSeason === true) cState.guaranteedSpotNextSeason = "active"; 
    else if (cState.guaranteedSpotNextSeason === "active") cState.guaranteedSpotNextSeason = false;

    updateLeftPanelUI();
    renderTimeline();

    const proceedToNextStage = () => {
        if (cState.age > cState.maxAge) {
            showCareerEnd();
        } else {
            let nextFormRatio = cState.ovr / CAREER_CONSTANTS[cState.league].diff;
            if (cState.contractYears > 0 && nextFormRatio < 0.70 && cState.league !== "KLŻ") {
                showLoanWindow();
            } else if (cState.contractYears <= 0) {
                generateTransferWindow();
            } else {
                if (Math.random() < 0.35) showEventWindow();
                else showCareerContinuePrompt();
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
    document.getElementById('timelineEmpty').style.display = 'none';
    document.getElementById('timelineHeader').style.display = 'flex';
    const list = document.getElementById('timelineList');
    list.innerHTML = '';
    
    if (cState.age <= cState.maxAge) {
        list.innerHTML += `
            <div class="timeline-row active-year">
                <div class="t-age" style="background: var(--red-neon); color: #fff;">${cState.age}</div>
                <div class="t-club text-dim" style="padding-left: 8px;">❓ Oczekuje...</div>
                <div class="t-ovr">${cState.ovr}</div>
                <div class="t-bie"></div><div class="t-pkt"></div><div class="t-avg"></div>
            </div>
        `;
    }

    let reversed = [...cState.history].reverse();

    // Rocznik 2026 to start dla wieku 16 lat
    let startingYear = 2026; 

    reversed.forEach((h, index) => {
        let loanIcon = h.loan ? '↪' : '';
        let dmpIcon = h.dmp ? '🏆' : '';
        let imsIcon = h.ims ? '🌍' : '';
        
        let clubColor = getCareerClubColor(h.club, h.league);
        // Obliczamy odpowiedni kolor czcionki dla kafelka
        let contrastColor = getContrastYIQ(clubColor);
        
        let realIndex = cState.history.length - 1 - index;
        let playYear = startingYear + realIndex;

        list.innerHTML += `
            <div class="timeline-row cursor-pointer hover-bg" onclick="showSeasonTable(${realIndex}, ${playYear})">
                <div class="t-age" style="background: ${clubColor}; color: ${contrastColor}; font-weight: 900; border: 1px solid rgba(255,255,255,0.15);">${h.age}</div>
                <div class="t-club" title="${h.club}" style="color: #eaeaea; padding-left: 8px;">
                    <span style="color:var(--text-dim); margin-right:5px;">${loanIcon}</span>
                    ${h.club}
                    <span style="font-size:10px; margin-left:5px;">${dmpIcon} ${imsIcon}</span>
                </div>
                <div class="t-ovr">${h.ovr}</div>
                <div class="t-bie">${h.bie}</div>
                <div class="t-pkt">${h.pkt}</div>
                <div class="t-avg">${h.avg}</div>
            </div>
        `;
    });
}

function forceRetirement() {
    if (confirm("Czy na pewno chcesz zakończyć karierę już teraz? Tej decyzji nie da się cofnąć!")) {
        cState.maxAge = cState.age - 1;
        showCareerEnd();
    }
}

function showCareerEnd() {
    document.getElementById('careerMainPanel').style.display = 'none';
    document.getElementById('careerRetirement').style.display = 'block';
    
    const firstRow = document.getElementById('timelineList').firstElementChild;
    if (firstRow && firstRow.classList.contains('active-year')) {
        firstRow.remove();
    }
    
    const lastClubInfo = getCareerLastClubInfo();
    const lastClubColor = getCareerClubColor(lastClubInfo.club, lastClubInfo.league);
    const cardGlow = `${lastClubColor}22`;

    let botStatsHTML = `
        <div id="timelineEndStats" style="display:flex; justify-content:space-between; padding: 15px; border-top: 1px solid ${lastClubColor}55; margin-top: 10px; background: linear-gradient(90deg, ${cardGlow}, rgba(0,0,0,0.08)); border-radius: 14px; box-shadow: inset 0 0 0 1px ${lastClubColor}20;">
            <div class="flex-row gap-5 align-items-center">
                <span style="display:inline-flex; width: 14px; height: 14px; border-radius: 4px; background: ${lastClubColor}; box-shadow: 0 0 10px ${lastClubColor}88;"></span>
                <span class="text-white font-black text-sm">${lastClubInfo.club || "Wolny agent"}</span>
            </div>
            <div class="flex-row gap-15 text-white font-black">
                <span><span style="color:var(--text-dim); font-size:10px;">BIE </span> ${cState.stats.heats}</span>
                <span><span style="color:var(--text-dim); font-size:10px;">PKT </span> ${cState.stats.pts}</span>
            </div>
        </div>
    `;
    if(!document.getElementById('timelineEndStats')) {
        document.querySelector('.career-timeline').innerHTML += botStatsHTML;
    }
}

async function shareCareerResult() {
    const btn = document.getElementById('btnShareCareer');
    const originalText = btn.innerText;
    btn.innerText = "GENEROWANIE KARTY..."; btn.disabled = true;

    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.width = 600; canvas.height = 900;

    const lastClubInfo = getCareerLastClubInfo();
    const lastClubColor = getCareerClubColor(lastClubInfo.club, lastClubInfo.league);
    
    const grd = ctx.createLinearGradient(0, 0, 600, 900); grd.addColorStop(0, lastClubColor); grd.addColorStop(0.5, "#1b1b20"); grd.addColorStop(1, "#050507");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = lastClubColor; ctx.lineWidth = 10; ctx.strokeRect(15, 15, 570, 870);

    ctx.font = "200px Arial"; ctx.textAlign = "center"; ctx.fillText("🏍️", 300, 380);

    ctx.fillStyle = lastClubColor; ctx.fillRect(100, 480, 400, 5);

    let nameParts = cState.name.split(' '); let lastName = nameParts[nameParts.length - 1].substring(0, 10).toUpperCase();
    ctx.fillStyle = "#fff"; ctx.font = "900 65px Montserrat, sans-serif"; ctx.fillText(lastName, 300, 460);

    ctx.font = "700 24px Montserrat, sans-serif"; ctx.fillStyle = lastClubColor; ctx.fillText(lastClubInfo.club || "Wolny agent", 300, 515);

    ctx.font = "700 30px Montserrat, sans-serif"; ctx.textAlign = "center";
    
    // Przesunięcie i usunięcie rubryki z pieniędzmi
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillText("IMŚ", 180, 560); ctx.fillText("DMP", 420, 560);
    ctx.fillStyle = "#fff"; ctx.font = "900 45px Montserrat, sans-serif"; 
    ctx.fillText(cState.stats.ims, 180, 610); ctx.fillText(cState.stats.dmp, 420, 610);

    ctx.font = "700 30px Montserrat, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("BIEGI", 180, 680); ctx.fillText("PKT", 420, 680);
    ctx.fillStyle = "#fff"; ctx.font = "900 35px Montserrat, sans-serif"; 
    ctx.fillText(cState.stats.heats, 180, 720); ctx.fillText(`${cState.stats.pts}+${cState.stats.bon}`, 420, 720);

    ctx.font = "700 30px Montserrat, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillText("KARIERA AVG", 300, 780);
    let careerAvg = cState.stats.heats > 0 ? ((cState.stats.pts + cState.stats.bon) / cState.stats.heats).toFixed(2) : "0.00";
    ctx.fillStyle = "#fff"; ctx.font = "900 60px Montserrat, sans-serif"; ctx.fillText(careerAvg, 300, 840);

    try {
        canvas.toBlob(async (blob) => {
            if (!blob) { appAlert("Błąd generowania karty.", "Błąd"); resetShareBtn(btn, originalText); return; } 
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (!isMobile && navigator.clipboard && navigator.clipboard.write) {
                try {
                    const item = new ClipboardItem({ "image/png": blob });
                    await navigator.clipboard.write([item]);
                    showToast("Karta skopiowana do schowka! (Ctrl+V)", "success");
                } catch (e) { shareViaNativeAPI(blob, "speedway-legend-card.png"); }
            } else { shareViaNativeAPI(blob, "speedway-legend-card.png"); }
            resetShareBtn(btn, originalText);
        }, "image/png");
    } catch (error) { appAlert("Wystąpił błąd.", "Błąd"); resetShareBtn(btn, originalText); }
}

// ====== ANIMACJE KARIERY (AWANS, SPADEK, MEDAL) ======
let _teamAchCallback = null;

function showTeamAchievement(club, gotDMP, medalColor, promoted, relegated, callback) {
    _teamAchCallback = callback;
    const overlay = document.getElementById('careerTeamAchOverlay');
    const icon = document.getElementById('teamAchIcon');
    const title = document.getElementById('teamAchTitle');
    const clubEl = document.getElementById('teamAchClub');
    const desc = document.getElementById('teamAchDesc');
    const modalBox = overlay.querySelector('.stats-modal');

    clubEl.innerText = club;
    modalBox.style.border = "2px solid #333";
    icon.style.filter = "drop-shadow(0 0 20px rgba(255,255,255,0.3))";

    if (gotDMP && medalColor === "ZŁOTO") {
        icon.innerText = "🏆"; title.innerText = "MISTRZ POLSKI!"; title.style.color = "#f1c40f";
        desc.innerText = "Twój zespół zdobywa złoty medal DMP! Jesteście najlepsi w kraju!";
        modalBox.style.border = "2px solid #f1c40f"; icon.style.filter = "drop-shadow(0 0 30px #f1c40f)";
        playSound('win'); launchConfetti();
    } else if (gotDMP && medalColor === "SREBRO") {
        icon.innerText = "🥈"; title.innerText = "WICEMISTRZ POLSKI"; title.style.color = "#d8d8d8";
        desc.innerText = "Świetny sezon zakończony ze srebrnym medalem na szyi!";
        modalBox.style.border = "2px solid #d8d8d8"; playSound('win');
    } else if (gotDMP && medalColor === "BRĄZ") {
        icon.innerText = "🥉"; title.innerText = "BRĄZOWY MEDAL"; title.style.color = "#cd7f32";
        desc.innerText = "Wygrywacie mecz o 3. miejsce. Brąz jest wasz!";
        modalBox.style.border = "2px solid #cd7f32"; playSound('win');
    } else if (promoted) {
        icon.innerText = "🚀"; title.innerText = "AWANS!"; title.style.color = "#00ff66";
        desc.innerText = "Wygrywacie ligę i awansujecie o szczebel wyżej w przyszłym sezonie!";
        modalBox.style.border = "2px solid #00ff66"; icon.style.filter = "drop-shadow(0 0 30px #00ff66)";
        playSound('win');
    } else if (relegated) {
        icon.innerText = "📉"; title.innerText = "SPADEK Z LIGI"; title.style.color = "#ff3333";
        desc.innerText = "Niestety, zamykacie tabelę i z hukiem spadacie do niższej klasy rozgrywkowej.";
        modalBox.style.border = "2px solid #ff3333"; icon.style.filter = "drop-shadow(0 0 30px #ff3333)";
        playSound('lose');
    }

    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeTeamAchievement() {
    const overlay = document.getElementById('careerTeamAchOverlay');
    overlay.style.opacity = '0'; 
    setTimeout(() => {
        overlay.style.display = 'none';
        if (_teamAchCallback) _teamAchCallback();
    }, 300);
}

// ====== POKAZYWANIE ZAPISANEJ TABELI LIGOWEJ ======
function showSeasonTable(historyIndex, year) {
    const seasonData = cState.history[historyIndex];
    if (!seasonData || !seasonData.table) return;

    const tableData = seasonData.table; 

    document.getElementById('tableOverlayTitle').innerText = `TABELA ${seasonData.league}`;
    document.getElementById('tableOverlaySub').innerText = `Sezon ${year} (Wiek: ${seasonData.age})`;
    
    const listEl = document.getElementById('careerTableList');
    listEl.innerHTML = '';
    
    tableData.forEach((row, idx) => {
        let posColor = "var(--text-dim)";
        if (idx === 0) posColor = "#f1c40f";
        else if (idx >= tableData.length - 1) posColor = "#ff3333"; 

        let highlightClass = row.isMe ? "background: rgba(241, 196, 15, 0.15); border-radius: 8px;" : "";
        let clubColor = getCareerClubColor(row.name, seasonData.league);
        
        listEl.innerHTML += `
            <div style="display: flex; font-size: 13px; font-weight: 700; align-items: center; padding: 8px 0; ${highlightClass}">
                <div style="width: 30px; text-align: center; color: ${posColor}; font-weight: 900;">${row.pos}.</div>
                <div style="flex: 1; text-align: left; padding-left: 10px; color: ${row.isMe ? '#fff' : '#ccc'}; border-left: 3px solid ${clubColor};">
                    ${row.name}
                </div>
                <div style="width: 40px; text-align: center; color: var(--text-dim);">${row.matches}</div>
                <div style="width: 40px; text-align: center; color: #fff; font-weight: 900;">${row.pts}</div>
            </div>
        `;
    });

    const overlay = document.getElementById('careerTableOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeSeasonTable() {
    const overlay = document.getElementById('careerTableOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
}

//-----------------------------------------
// GLOBALNE FUNKCJE DLA HTML-A
// ----------------------------------------

// Udostępnianie okien w przestrzeni globalnej dla HTML-a
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
    window.openCareerMode = openCareerMode;
    window.exitCareerMode = exitCareerMode;
    window.selectCareerNat = selectCareerNat;
    window.startCareerAcademy = startCareerAcademy;
    window.signContract = signContract; 
    window.rejectLoan = rejectLoan;
    window.resolveRandomEvent = resolveRandomEvent;
    window.playSeason = playSeason;
    window.updateKevlarPreview = updateKevlarPreview;
    window.forceRetirement = forceRetirement;
    window.shareCareerResult = shareCareerResult;
    window.showSeasonTable = showSeasonTable;
    window.closeSeasonTable = closeSeasonTable;
    window.closeTeamAchievement = closeTeamAchievement;
    
} catch (e) {
    console.error("Global export error:", e);
}