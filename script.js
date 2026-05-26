let targetPlayer;
let gameMode = 'endless';
let guessCount = 0;
let guessHistory = [];
let guessedPlayersNames = [];
let currentDailyDay = 1;
let selectedDailyDay = 1;
let dailyNumberGlobal = "";
let hasWon = false;
let hasLost = false;
let isRestoring = false;
let currentLanguage = localStorage.getItem('language') || 'pl';
let isAppInitialized = false;

let calRenderMonth = new Date().getMonth();
let calRenderYear = new Date().getFullYear();

const GUESS_LIMIT = 10;
const DAILY_START_DATE = new Date('2026-05-12T00:00:00');
const HELMET_IMAGE_SRC = 'kask-zycie.png';
const SPECIAL_CLUB_ICONS = {
    "brak": "🚫",
    "brak klubu": "🚫",
    "zawieszenie": "⛔",
    "zawiesznie": "⛔",
    "kontuzja": "🚑",
    "koniec kariery": "🛑"
};

const clubAbbreviations = {
    "unia leszno": "LES", "falubaz zielona góra": "ZIE", "stal gorzów wielkopolski": "GOR",
    "stal gorzów": "GOR", "motor lublin": "LUB", "sparta wrocław": "WRO", "apator toruń": "TOR",
    "włókniarz częstochowa": "CZE", "gkm grudziądz": "GRU", "unia tarnów": "TAR",
    "polonia bydgoszcz": "BYD", "wybrzeże gdańsk": "GDA", "ostrovia ostrów wielkopolski": "OST",
    "ostrovia ostrów": "OST", "stal rzeszów": "RZE", "row rybnik": "RYB", "psż poznań": "POZ",
    "kolejarz opole": "OPO", "orzeł łódź": "LOD", "polonia piła": "PIŁ", "start gniezno": "GNI",
    "kolejarz rawicz": "RAW", "landshut devils": "LAN", "wilki krosno": "KRO", "lokomotiv daugavpils": "DAU",
    "brak klubu": "🚫", "brak": "🚫", "zawieszenie": "⛔", "zawiesznie": "⛔", "kontuzja": "🚑", "koniec kariery": "🛑"
};

function createDefaultStats() {
    return {
        played: 0,
        won: 0,
        currentStreak: 0,
        maxStreak: 0,
        dailyResults: {},
        dailyHistory: [],
        dailyGuesses: {},
        recentEndless: []
    };
}

let userStats = createDefaultStats();

const countryToCode = {
    "Polska": "pl", "Wielka Brytania": "gb", "Dania": "dk", "Australia": "au", "Szwecja": "se", 
    "Słowacja": "sk", "Rosja": "ru", "Łotwa": "lv", "Niemcy": "de", "Francja": "fr", 
    "Słowenia": "si", "USA": "us", "Norwegia": "no", "Ukraina": "ua", "Finlandia": "fi", 
    "Czechy": "cz", "Włochy": "it", "Hiszpania": "es",
};

const translations = {
    pl: {
        settingsButtonTitle: "Ustawienia",
        settingsTitle: "USTAWIENIA",
        close: "ZAMKNIJ",
        themeLabel: "Motyw",
        themeLight: "Jasny",
        themeDark: "Ciemny",
        languageLabel: "Język",
        winTitle: "BRAWO!",
        winMessage: "Odgadłeś zawodnika!",
        loseTitle: "KONIEC PRÓB",
        loseMessage: "Niestety, nie udało Ci się odgadnąć w 10 próbach.",
        statsTitle: "STATYSTYKI",
        statPlayed: "Rozegrane",
        statWon: "Wygrane",
        statStreak: "Aktualna Seria",
        statMaxStreak: "Najlepsza Seria",
        calendarTitle: "ARCHIWUM DAILY",
        weekdayMon: "Pn",
        weekdayTue: "Wt",
        weekdayWed: "Śr",
        weekdayThu: "Cz",
        weekdayFri: "Pt",
        weekdaySat: "Sb",
        weekdaySun: "Nd",
        menuSubtitle: "Edycja Żużlowa",
        lastGamesTitle: "Ostatnie gry Daily:",
        calendarButtonTitle: "Otwórz kalendarz",
        playDaily: "Graj Daily",
        reviewGame: "Przejrzyj grę",
        endlessMode: "Endless Guessr",
        soonMode: "Kółko i Krzyżyk (SOON)",
        statsButtonTitle: "Statystyki",
        guessPlaceholder: "Wpisz imię/nazwisko zawodnika...",
        guessButton: "Zgadnij",
        mysteryPhotoAlt: "Sylwetka zawodnika",
        teamsLabel: "Drużyny:",
        tableHelp: "Próba = kolejność zgadywania. Kolory i ikony pokazują zgodność z celem.",
        attemptHeader: "Próba",
        riderHeader: "Zawodnik",
        countryHeader: "Kraj",
        countryTip: "Kraj pochodzenia",
        birthYearHeader: "Rok ur.",
        birthYearTip: "Rok urodzenia (⬆️ cel jest młodszy, ⬇️ cel jest starszy)",
        gpHeader: "Czy był stałym uczestnikiem GP?",
        gpTip: "Czy kiedykolwiek był stałym uczestnikiem cyklu Grand Prix?",
        dmpHeader: "Medale DMP",
        dmpTip: "Łączna suma medali Drużynowych Mistrzostw Polski.",
        statusHeader: "Czy nadal jeździ?",
        statusTip: "Obecny status zawodnika",
        clubsHeader: "Historia Klubów",
        clubsTip: "Jakie kluby reprezentował",
        copyright: "&copy; 2026 Speedway Guessr by: CZIPSOL. Wszelkie prawa zastrzeżone.",
        shareButton: "UDOSTĘPNIJ 📋",
        playAgainButton: "ZAGRAJ PONOWNIE",
        playEndlessButton: "GRAJ W TRYB ENDLESS",
        mainMenuButton: "MENU GŁÓWNE",
        gameModeDaily: "Tryb: Daily",
        gameModeEndless: "Tryb: Endless",
        livesRemaining: "Pozostało żyć: {count}",
        lifeHelmetAlt: "Kask życia",
        lostLifeAlt: "Utracone życie",
        restoreHistoryNote: "Historia zgadywania z tego dnia nie została zapisana (starsza wersja gry).",
        calendarGuessed: "Odgadnięty",
        calendarLoss: "Porażka",
        attemptTitle: "Próba nr {number}",
        targetOlder: "Cel jest starszy (wcześniejszy rok urodzenia)",
        targetYounger: "Cel jest młodszy (późniejszy rok urodzenia)",
        targetLessDmp: "Cel ma mniej medali DMP",
        targetMoreDmp: "Cel ma więcej medali DMP",
        loanTitle: "Wypożyczenie",
        shareCanvasAttempt: "Próba",
        shareCanvasCountry: "Kraj",
        shareCanvasYear: "Rok",
        shareCanvasStatus: "Status",
        shareText: "🏁 Moje podsumowanie Speedway Guessr Daily! Dasz radę lepiej? #SpeedwayGuessr",
        shareNoBlob: "Błąd generowania obrazu.",
        shareCopied: "Podsumowanie zostało skopiowane do schowka.",
        shareFallback: "Twoja przeglądarka nie obsługuje udostępniania ani kopiowania obrazu, więc plik został pobrany.",
        shareUnexpected: "Wystąpił nieoczekiwany błąd podczas udostępniania.",
        months: ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"]
    },
    en: {
        settingsButtonTitle: "Settings",
        settingsTitle: "SETTINGS",
        close: "CLOSE",
        themeLabel: "Theme",
        themeLight: "Light",
        themeDark: "Dark",
        languageLabel: "Language",
        winTitle: "NICE!",
        winMessage: "You guessed the rider!",
        loseTitle: "NO TRIES LEFT",
        loseMessage: "You did not guess the rider in 10 tries.",
        statsTitle: "STATS",
        statPlayed: "Played",
        statWon: "Won",
        statStreak: "Current Streak",
        statMaxStreak: "Best Streak",
        calendarTitle: "DAILY ARCHIVE",
        weekdayMon: "Mon",
        weekdayTue: "Tue",
        weekdayWed: "Wed",
        weekdayThu: "Thu",
        weekdayFri: "Fri",
        weekdaySat: "Sat",
        weekdaySun: "Sun",
        menuSubtitle: "Speedway Edition",
        lastGamesTitle: "Recent Daily games:",
        calendarButtonTitle: "Open calendar",
        playDaily: "Play Daily",
        reviewGame: "Review game",
        endlessMode: "Endless Guessr",
        soonMode: "Tic-Tac-Toe (SOON)",
        statsButtonTitle: "Stats",
        guessPlaceholder: "Type rider name...",
        guessButton: "Guess",
        mysteryPhotoAlt: "Rider silhouette",
        teamsLabel: "Teams:",
        tableHelp: "Try = guessing order. Colors and icons show how close your guess is.",
        attemptHeader: "Try",
        riderHeader: "Rider",
        countryHeader: "Country",
        countryTip: "Country of origin",
        birthYearHeader: "Born",
        birthYearTip: "Birth year (⬆️ target is younger, ⬇️ target is older)",
        gpHeader: "GP regular?",
        gpTip: "Was he ever a regular Grand Prix rider?",
        dmpHeader: "DMP medals",
        dmpTip: "Total Polish Team Championship medals.",
        statusHeader: "Still racing?",
        statusTip: "Current rider status",
        clubsHeader: "Club History",
        clubsTip: "Clubs represented by the rider",
        copyright: "&copy; 2026 Speedway Guessr by: CZIPSOL. All rights reserved.",
        shareButton: "SHARE 📋",
        playAgainButton: "PLAY AGAIN",
        playEndlessButton: "PLAY ENDLESS",
        mainMenuButton: "MAIN MENU",
        gameModeDaily: "Mode: Daily",
        gameModeEndless: "Mode: Endless",
        livesRemaining: "Lives left: {count}",
        lifeHelmetAlt: "Life helmet",
        lostLifeAlt: "Lost life",
        restoreHistoryNote: "Guess history for this day was not saved (older game version).",
        calendarGuessed: "Guessed",
        calendarLoss: "Loss",
        attemptTitle: "Try #{number}",
        targetOlder: "Target is older (earlier birth year)",
        targetYounger: "Target is younger (later birth year)",
        targetLessDmp: "Target has fewer DMP medals",
        targetMoreDmp: "Target has more DMP medals",
        loanTitle: "Loan",
        shareCanvasAttempt: "Try",
        shareCanvasCountry: "Country",
        shareCanvasYear: "Year",
        shareCanvasStatus: "Status",
        shareText: "🏁 My Speedway Guessr Daily result! Can you do better? #SpeedwayGuessr",
        shareNoBlob: "Could not generate the image.",
        shareCopied: "Summary copied to clipboard.",
        shareFallback: "Your browser does not support sharing or copying this image, so the file has been downloaded.",
        shareUnexpected: "An unexpected error occurred while sharing.",
        months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    }
};

function t(key) {
    return translations[currentLanguage]?.[key] ?? translations.pl[key] ?? key;
}

function formatText(key, replacements = {}) {
    return String(t(key)).replace(/\{(\w+)\}/g, (_, name) => replacements[name] ?? "");
}

function getDateLocale() {
    return currentLanguage === 'pl' ? 'pl-PL' : 'en-GB';
}

function byId(id) {
    return document.getElementById(id);
}

function setDisplay(id, displayValue) {
    const element = byId(id);
    if (element) element.style.display = displayValue;
}

function applyLanguage() {
    if (!translations[currentLanguage]) currentLanguage = 'pl';

    document.documentElement.lang = currentLanguage;
    document.documentElement.setAttribute('data-language', currentLanguage);

    document.querySelectorAll('[data-i18n]').forEach(element => {
        element.innerHTML = t(element.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        element.title = t(element.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(element => {
        element.alt = t(element.dataset.i18nAlt);
    });
    document.querySelectorAll('[data-i18n-tip]').forEach(element => {
        element.dataset.tip = t(element.dataset.i18nTip);
    });

    syncSettingsControls();
    refreshLivesLabels();
    refreshDynamicTexts();
}

function refreshDynamicTexts() {
    if (!isAppInitialized) return;

    updateDailyMenu();
    updateGameModeDisplay();
    updatePostGameButtons();

    const restoreNote = document.querySelector('.restore-history-note');
    if (restoreNote) restoreNote.innerText = t('restoreHistoryNote');

    const calendarOverlay = byId('calendarOverlay');
    if (calendarOverlay?.style.display === 'block') renderCalendar();
}

function syncSettingsControls() {
    const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    byId('themeLightBtn')?.classList.toggle('active', activeTheme === 'light');
    byId('themeDarkBtn')?.classList.toggle('active', activeTheme === 'dark');
    byId('languagePlBtn')?.classList.toggle('active', currentLanguage === 'pl');
    byId('languageEnBtn')?.classList.toggle('active', currentLanguage === 'en');
}

function refreshLivesLabels() {
    const livesContainer = byId('livesContainer');
    if (!livesContainer) return;

    const remainingLives = Math.max(GUESS_LIMIT - guessCount, 0);
    livesContainer.setAttribute('aria-label', formatText('livesRemaining', { count: remainingLives }));
    livesContainer.querySelectorAll('img').forEach(img => {
        const isLost = img.classList.contains('helmet-lost') || img.classList.contains('life-lost-anim');
        img.alt = isLost ? t('lostLifeAlt') : t('lifeHelmetAlt');
    });
}

function openSettings() {
    const overlay = byId('settingsOverlay');
    overlay.style.display = 'block';
    setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeSettings() {
    const overlay = byId('settingsOverlay');
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 300);
}

function setLanguage(languageName) {
    currentLanguage = languageName === 'en' ? 'en' : 'pl';
    localStorage.setItem('language', currentLanguage);
    applyLanguage();
}

function isSpecialClubName(clubName) {
    return Boolean(getSpecialClubIcon(clubName));
}

function getSpecialClubKey(clubName) {
    return removePolishAccents(getCleanClubName(clubName))
        .toLowerCase()
        .replace(/[\[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getSpecialClubIcon(clubName) {
    return SPECIAL_CLUB_ICONS[getSpecialClubKey(clubName)] || null;
}

function getClubMatchKey(clubName) {
    const specialKey = getSpecialClubKey(clubName);
    if (specialKey === 'zawiesznie') return 'zawieszenie';
    if (SPECIAL_CLUB_ICONS[specialKey]) return specialKey;

    return removePolishAccents(getCleanClubName(clubName)).toLowerCase();
}

// --- SILNIK DŹWIĘKOWY ---
let audioCtx = null;

function playSound(type) {
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
}
// -------------------------------------------------------------------------

window.addEventListener('load', initApp);

const helmetImgObj = new Image();

function initApp() {
    loadStats();
    applyLanguage();
    initDailyMenu();
    renderLastGames();
    preloadHelmetImage();
    isAppInitialized = true;
    refreshDynamicTexts();
}

function preloadHelmetImage() {
    helmetImgObj.src = HELMET_IMAGE_SRC;
}

function loadStats() {
    const saved = localStorage.getItem('speedwayStats');
    if (!saved) return;

    try {
        userStats = { ...createDefaultStats(), ...JSON.parse(saved) };
    } catch (error) {
        console.warn('Nie udało się odczytać zapisanych statystyk.', error);
        userStats = createDefaultStats();
        return;
    }

    if (userStats.completedDailies && Array.isArray(userStats.completedDailies)) {
        userStats.completedDailies.forEach(day => {
            if (!userStats.dailyResults[day]) userStats.dailyResults[day] = 'win';
        });
        delete userStats.completedDailies;
        saveStats();
    }
}
function saveStats() { localStorage.setItem('speedwayStats', JSON.stringify(userStats)); }

function getDailyDateString(dayNumber) {
    const startUTC = Date.UTC(DAILY_START_DATE.getFullYear(), DAILY_START_DATE.getMonth(), DAILY_START_DATE.getDate());
    const d = new Date(startUTC + (dayNumber - 1) * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString(getDateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function initDailyMenu() {
    const now = new Date();
    const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const startUTC = Date.UTC(DAILY_START_DATE.getFullYear(), DAILY_START_DATE.getMonth(), DAILY_START_DATE.getDate());
    currentDailyDay = Math.floor((nowUTC - startUTC) / (1000 * 60 * 60 * 24)) + 1;
    if (currentDailyDay < 1) currentDailyDay = 1;
    selectedDailyDay = currentDailyDay; 
    updateDailyMenu();
}

function changeDaily(dir) {
    selectedDailyDay += dir;
    if (selectedDailyDay < 1) selectedDailyDay = 1;
    if (selectedDailyDay > currentDailyDay) selectedDailyDay = currentDailyDay; 
    updateDailyMenu();
}

function changeDailyInGame(dir) {
    changeDaily(dir);
    document.getElementById('winOverlay').style.display = 'none'; 
    document.getElementById('loseOverlay').style.display = 'none';
    clearGameBoard();
    initGame();
}

function updateDailyMenu() {
    document.getElementById('dailyDayDisplay').innerText = `Daily ${getDailyDateString(selectedDailyDay)}`;
    document.getElementById('btnPrevDaily').style.visibility = (selectedDailyDay <= 1) ? 'hidden' : 'visible';
    document.getElementById('btnNextDaily').style.visibility = (selectedDailyDay >= currentDailyDay) ? 'hidden' : 'visible';
    
    const inGamePrev = document.getElementById('inGamePrevBtn');
    const inGameNext = document.getElementById('inGameNextBtn');
    if(inGamePrev) inGamePrev.style.visibility = (selectedDailyDay <= 1) ? 'hidden' : 'visible';
    if(inGameNext) inGameNext.style.visibility = (selectedDailyDay >= currentDailyDay) ? 'hidden' : 'visible';

    const btn = document.getElementById('btnDailyMode');
    const txt = document.getElementById('dailyBtnText');
    if (userStats.dailyResults[selectedDailyDay]) {
        btn.classList.remove('disabled');
        txt.innerText = t('reviewGame');
    } else {
        btn.classList.remove('disabled');
        txt.innerText = t('playDaily');
    }
}

// --- KALENDARZ ---
function openCalendar() {
    calRenderMonth = new Date().getMonth(); calRenderYear = new Date().getFullYear();
    renderCalendar();
    const overlay = document.getElementById('calendarOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}
function closeCalendar() {
    const overlay = document.getElementById('calendarOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
}
function changeCalendarMonth(dir) {
    calRenderMonth += dir;
    if (calRenderMonth > 11) { calRenderMonth = 0; calRenderYear++; }
    else if (calRenderMonth < 0) { calRenderMonth = 11; calRenderYear--; }
    renderCalendar();
}

function renderCalendar() {
    const monthNames = t('months');
    document.getElementById('calendarMonthDisplay').innerText = `${monthNames[calRenderMonth]} ${calRenderYear}`;
    const grid = document.getElementById('calendarGrid'); grid.innerHTML = '';
    
    const firstDay = new Date(calRenderYear, calRenderMonth, 1);
    const daysInMonth = new Date(calRenderYear, calRenderMonth + 1, 0).getDate();
    let startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyBox = document.createElement('div'); emptyBox.className = 'cal-day empty'; grid.appendChild(emptyBox);
    }

    const startUTC = Date.UTC(DAILY_START_DATE.getFullYear(), DAILY_START_DATE.getMonth(), DAILY_START_DATE.getDate());
    const now = new Date();
    const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

    for (let i = 1; i <= daysInMonth; i++) {
        const box = document.createElement('div'); box.className = 'cal-day'; box.innerText = i;
        const cellUTC = Date.UTC(calRenderYear, calRenderMonth, i);
        
        if (cellUTC < startUTC) { box.classList.add('disabled'); } 
        else if (cellUTC > todayUTC) { box.classList.add('disabled', 'future'); } 
        else {
            const dailyNum = Math.floor((cellUTC - startUTC) / (1000 * 60 * 60 * 24)) + 1;
            box.title = `Daily #${dailyNum}`;
            if (userStats.dailyResults[dailyNum] === 'win') { box.classList.add('win'); box.title += ` (${t('calendarGuessed')})`; }
            else if (userStats.dailyResults[dailyNum] === 'loss') { box.classList.add('loss'); box.title += ` (${t('calendarLoss')})`; }
            else { box.classList.add('playable'); }
            box.onclick = () => { selectDayFromCalendar(dailyNum); };
            if (dailyNum === selectedDailyDay) box.style.border = "2px solid var(--accent)";
        }
        grid.appendChild(box);
    }
    
    document.getElementById('calBtnPrev').style.visibility = (calRenderYear <= DAILY_START_DATE.getFullYear() && calRenderMonth <= DAILY_START_DATE.getMonth()) ? 'hidden' : 'visible';
    document.getElementById('calBtnNext').style.visibility = (calRenderYear >= now.getFullYear() && calRenderMonth >= now.getMonth()) ? 'hidden' : 'visible';
}

function selectDayFromCalendar(dayNum) { 
    selectedDailyDay = dayNum; 
    updateDailyMenu(); 
    closeCalendar(); 
    if(document.getElementById('gameContainer').style.display === 'block') {
        changeDailyInGame(0);
    }
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

function updateStatsOnWin() {
    if(hasWon || hasLost) return; hasWon = true;
    userStats.played++; userStats.won++; userStats.currentStreak++;
    if(userStats.currentStreak > userStats.maxStreak) userStats.maxStreak = userStats.currentStreak;
    if (gameMode === 'daily') {
        userStats.dailyResults[selectedDailyDay] = 'win'; userStats.dailyHistory.push(true);
        if (userStats.dailyHistory.length > 5) userStats.dailyHistory.shift(); 
    }
    saveStats();
}

function updateStatsOnLoss() {
    if(hasWon || hasLost) return; hasLost = true;
    userStats.played++; userStats.currentStreak = 0; 
    if (gameMode === 'daily') {
        userStats.dailyResults[selectedDailyDay] = 'loss'; userStats.dailyHistory.push(false);
        if (userStats.dailyHistory.length > 5) userStats.dailyHistory.shift();
    }
    saveStats();
}

function startGame(mode) {
    gameMode = mode;
    setDisplay('mainMenuContainer', 'none');
    setDisplay('gameContainer', 'block');
    initGame();
}

function startDailyGame() {
    startGame('daily');
}

function startEndlessGame() {
    startGame('endless');
}

function triggerErrorShake() {
    const inputWrapper = document.querySelector('.input-wrapper');
    inputWrapper.classList.add('shake-error');
    playSound('error');
    setTimeout(() => { inputWrapper.classList.remove('shake-error'); }, 400);
}

function updateCounterDisplay() {
    const container = byId('livesContainer');
    container.style.display = 'flex';
    container.innerHTML = '';

    const remainingLives = Math.max(GUESS_LIMIT - guessCount, 0);
    const fragment = document.createDocumentFragment();
    container.setAttribute('aria-label', formatText('livesRemaining', { count: remainingLives }));

    for (let i = 0; i < GUESS_LIMIT; i++) {
        fragment.appendChild(createHelmetLifeIcon(i));
    }

    container.appendChild(fragment);
}

function createHelmetLifeIcon(index) {
    const helmet = document.createElement('img');
    const isLost = index < guessCount;
    const isJustLost = index === guessCount - 1 && !isRestoring && !hasWon;

    helmet.src = HELMET_IMAGE_SRC;
    helmet.className = 'helmet-icon';
    helmet.alt = isLost ? t('lostLifeAlt') : t('lifeHelmetAlt');
    helmet.decoding = 'async';

    if (isJustLost) helmet.classList.add('life-lost-anim');
    else if (isLost) helmet.classList.add('helmet-lost');

    return helmet;
}

function clearGameBoard() {
    guessCount = 0;
    guessHistory = [];
    guessedPlayersNames = [];
    hasWon = false;
    hasLost = false;
    isRestoring = false;

    byId('results').innerHTML = '';
    byId('guessInput').value = '';
    byId('mysteryPhoto').style.display = 'none';
    byId('mysteryPlaceholder').style.display = 'block';
    byId('photoWrapper').classList.remove('revealed');
    byId('mysteryName').innerText = '???';
    byId('mysteryName').style.color = 'var(--text-main)';
    updatePostGameButtons();
    setDisplay('postGameActions', 'none');
}

function updatePostGameButtons() {
    const shareButton = byId('btnSharePost');
    const playAgainButton = byId('btnPlayAgainPost');
    const mainMenuButton = document.querySelector('[data-i18n="mainMenuButton"]');

    if (shareButton) shareButton.innerText = t('shareButton');
    if (playAgainButton) playAgainButton.innerText = gameMode === 'daily' ? t('playEndlessButton') : t('playAgainButton');
    if (mainMenuButton) mainMenuButton.innerText = t('mainMenuButton');
}

function resetBoardAndPlay() {
    byId('winOverlay').style.opacity = '0';
    byId('loseOverlay').style.opacity = '0';
    setTimeout(() => {
        setDisplay('winOverlay', 'none');
        setDisplay('loseOverlay', 'none');
    }, 200);

    clearGameBoard();
    gameMode = 'endless';
    initGame();
}

function seededRandom(seed) { const x = Math.sin(seed) * 10000; return x - Math.floor(x); }

function updateGameModeDisplay() {
    const modeDisplay = document.getElementById('gameModeDisplay');
    if (!modeDisplay) return;

    if (gameMode === 'daily') {
        const dailyDate = getDailyDateString(selectedDailyDay);
        dailyNumberGlobal = dailyDate;
        modeDisplay.innerText = `${t('gameModeDaily')} ${dailyDate}`;
    } else {
        modeDisplay.innerText = t('gameModeEndless');
    }
}

function initGame() {
    let randomIndex;
    const controls = document.getElementById('gameDailyControls');
    const inputSec = document.querySelector('.input-section');
    
    if (gameMode === 'daily') {
        controls.style.display = 'flex';
        dailyNumberGlobal = getDailyDateString(selectedDailyDay);
        randomIndex = Math.floor(seededRandom(selectedDailyDay * 9999) * playersDB.length);
        targetPlayer = playersDB[randomIndex];
        updateGameModeDisplay();
        
        if (userStats.dailyResults[selectedDailyDay]) {
            inputSec.style.display = 'none';
            restorePlayedGame(); 
        } else {
            inputSec.style.display = 'block';
        }
    } else {
        controls.style.display = 'none';
        inputSec.style.display = 'block';
        
        let availablePlayers = playersDB.filter(p => !userStats.recentEndless.includes(p.id));
        if (availablePlayers.length < 15) {
            userStats.recentEndless = [];
            availablePlayers = playersDB;
        }
        randomIndex = Math.floor(Math.random() * availablePlayers.length);
        targetPlayer = availablePlayers[randomIndex];
        
        userStats.recentEndless.push(targetPlayer.id);
        if (userStats.recentEndless.length > 60) userStats.recentEndless.shift();
        saveStats();

        updateGameModeDisplay();
    }
    
    if(inputSec.style.display !== 'none') {
        buildTeamPath(); setupAutocomplete(); updateCounterDisplay();
    }
}

function restorePlayedGame() {
    isRestoring = true;
    buildTeamPath();
    const pastGuesses = userStats.dailyGuesses[selectedDailyDay] || [];
    
    if (pastGuesses.length === 0) {
        document.getElementById('results').innerHTML = `<div class="restore-history-note">${t('restoreHistoryNote')}</div>`;
    } else {
        pastGuesses.forEach(pName => {
            const p = playersDB.find(x => x.name === pName);
            if(p) {
                guessCount++; guessedPlayersNames.push(p.name);
                renderGuess(p, true); revealClubsOnPath(p);
            }
        });
    }
    
    updateCounterDisplay();
    hasWon = userStats.dailyResults[selectedDailyDay] === 'win';
    hasLost = userStats.dailyResults[selectedDailyDay] === 'loss';
    revealTargetInfoUI();
    
    document.getElementById('btnSharePost').style.display = 'inline-block';
    updatePostGameButtons();
    document.getElementById('postGameActions').style.display = 'flex';
    isRestoring = false;
}

function removePolishAccents(str) {
    const accents = 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ'; const noAccents = 'acelnoszzACELNOSZZ';
    return str.split('').map(char => { const index = accents.indexOf(char); return index !== -1 ? noAccents[index] : char; }).join('');
}
function getCleanClubName(clubName) {
    if (!clubName) return "";

    return clubName
        .replace(/\s*\(W\)\s*/g, ' ')
        .replace(/^\[(.*)\]$/, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function getClubAbbr(clubName) {
    if (!clubName) return "---";

    const specialIcon = getSpecialClubIcon(clubName);
    if (specialIcon) return specialIcon;

    let cleanName = getCleanClubName(clubName).toLowerCase();
    if (clubAbbreviations[cleanName]) return clubAbbreviations[cleanName];
    let words = cleanName.split(' '); return removePolishAccents(words[words.length - 1].substring(0, 3)).toUpperCase();
}

document.addEventListener("click", function (e) {
    if (e.target.id !== "guessInput") { closeAllLists(); }
});

function closeAllLists() {
    let items = document.getElementsByClassName("autocomplete-items");
    while (items.length > 0) { items[0].parentNode.removeChild(items[0]); }
}

function setupAutocomplete() {
    const oldInput = document.getElementById('guessInput');
    const newInput = oldInput.cloneNode(true);
    oldInput.replaceWith(newInput); 

    newInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            closeAllLists();
            makeGuess();
        }
    });
    
    newInput.addEventListener('input', function() {
        let val = this.value; 
        closeAllLists(); 
        if (!val || val.length < 2) return;

        const hasExactMatch = playersDB.some(player => player.name.toLowerCase() === val.toLowerCase());
        if (hasExactMatch) return;
        
        let listContainer = document.createElement("DIV"); 
        listContainer.setAttribute("class", "autocomplete-items"); 
        this.parentNode.appendChild(listContainer);
        
        let valClean = removePolishAccents(val.toLowerCase());
        playersDB.forEach(player => {
            if (guessedPlayersNames.includes(player.name)) return;
            if (removePolishAccents(player.name.toLowerCase()).includes(valClean)) {
                let item = document.createElement("DIV"); 
                item.innerHTML = player.name;
                item.addEventListener("click", () => { newInput.value = player.name; closeAllLists(); });
                listContainer.appendChild(item);
            }
        });
    });
}

function buildTeamPath() {
    const pathContainer = document.getElementById('pathBoxes'); pathContainer.innerHTML = ''; 
    targetPlayer.pastClubs.forEach((club, index) => {
        const box = document.createElement('div'); box.className = 'path-box'; box.innerText = '?'; box.dataset.club = club; 
        pathContainer.appendChild(box);
        if (index < targetPlayer.pastClubs.length - 1) {
            const arrow = document.createElement('div'); arrow.className = 'path-arrow'; arrow.innerText = '→'; pathContainer.appendChild(arrow);
        }
    });
    if (targetPlayer.status.toLowerCase().includes("koniec") || targetPlayer.status === "Ś.P.") {
        const arrow = document.createElement('div'); arrow.className = 'path-arrow'; arrow.innerText = '→'; pathContainer.appendChild(arrow);
        const endIcon = document.createElement('div'); endIcon.className = 'path-box'; endIcon.id = 'pathBox-retired'; endIcon.innerText = '?'; pathContainer.appendChild(endIcon);
    }
}

function makeGuess() {
    if(hasWon || hasLost) return;
    const input = document.getElementById('guessInput').value.trim();
    if (!input) { triggerErrorShake(); return; }
    const guessedPlayer = playersDB.find(p => p.name.toLowerCase() === input.toLowerCase());
    
    if (!guessedPlayer || guessedPlayersNames.includes(guessedPlayer?.name)) { 
        triggerErrorShake();
        return; 
    }
    
    guessedPlayersNames.push(guessedPlayer.name); 
    playSound('guess');
    
    if (gameMode === 'daily') {
        if (!userStats.dailyGuesses[selectedDailyDay]) userStats.dailyGuesses[selectedDailyDay] = [];
        userStats.dailyGuesses[selectedDailyDay].push(guessedPlayer.name);
        saveStats();
    }
    
    guessCount++; updateCounterDisplay(); renderGuess(guessedPlayer); revealClubsOnPath(guessedPlayer);
    document.getElementById('guessInput').value = "";
    if (guessedPlayer.name !== targetPlayer.name && guessCount >= GUESS_LIMIT) { updateStatsOnLoss(); setTimeout(handleLoss, 1400); }
}

function revealClubsOnPath(guessedPlayer) {
    const boxes = document.querySelectorAll('.path-box');
    let guessedClubs = guessedPlayer.pastClubs.map(getClubMatchKey);

    boxes.forEach(box => {
        if (!box.dataset.club) return;
        if (guessedClubs.includes(getClubMatchKey(box.dataset.club)) && box.innerText === '?') {
            if (isSpecialClubName(box.dataset.club)) {
                box.classList.add('club-special');
            }
            
            box.innerHTML = `<span>${getClubAbbr(box.dataset.club)}</span>${box.dataset.club.includes("(W)") ? `<div class="loan-badge" title="${t('loanTitle')}">W</div>` : ''}`;
            box.classList.add('found');
        }
    });
    if ((guessedPlayer.status.toLowerCase().includes("koniec") || guessedPlayer.status === "Ś.P.") && (targetPlayer.status.toLowerCase().includes("koniec") || targetPlayer.status === "Ś.P.")) {
        const endBox = document.getElementById('pathBox-retired');
        if (endBox) { endBox.innerText = '❌'; endBox.classList.add('found'); endBox.style.border = 'none'; endBox.style.background = 'transparent'; }
    }
}

function renderGuess(player, isRestore = false) {
    const resultsDiv = document.getElementById('results'); const row = document.createElement('div'); row.className = 'guess-row';
    let rowEmojis = "";
    const attemptNumber = guessCount;
    
    const isTargetGP = targetPlayer.gp === true || targetPlayer.gp === "Tak" || targetPlayer.gp === "tak"; 
    const isGuessGP = player.gp === true || player.gp === "Tak" || player.gp === "tak";
    const gpCls = (isGuessGP === isTargetGP) ? "green" : "red"; const gpIcon = isGuessGP ? "✅" : "❌";
    
    const yearCls = (player.year === targetPlayer.year) ? "green" : "red";
    let yearContent = `<span>${player.year}</span>`;
    if (player.year > targetPlayer.year) yearContent += `<span class="val-arrow" title="${t('targetOlder')}">⬇️</span>`;
    else if (player.year < targetPlayer.year) yearContent += `<span class="val-arrow" title="${t('targetYounger')}">⬆️</span>`;

    const dmpCls = (player.dmp === targetPlayer.dmp) ? "green" : "red";
    let dmpContent = `<span>${player.dmp}</span>`;
    if (player.dmp > targetPlayer.dmp) dmpContent += `<span class="val-arrow" title="${t('targetLessDmp')}">⬇️</span>`;
    else if (player.dmp < targetPlayer.dmp) dmpContent += `<span class="val-arrow" title="${t('targetMoreDmp')}">⬆️</span>`;

    const pCountries = player.country.split("/").map(c => c.trim());
    const tCountries = targetPlayer.country.split("/").map(c => c.trim());
    let countryCls = "red";

    if (player.country === targetPlayer.country) countryCls = "green";
    else if (pCountries.some(c => tCountries.includes(c))) countryCls = "half";
    else if (player.region === targetPlayer.region) countryCls = "yellow";

    let c1 = countryToCode[pCountries[0]] || 'pl';
    let countryContent = pCountries.length > 1
        ? `<div class="tile-flag-dual" title="${player.country}"><img src="https://flagcdn.com/h80/${c1}.png" class="flag-left"><img src="https://flagcdn.com/h80/${countryToCode[pCountries[1]] || 'pl'}.png" class="flag-right"></div>`
        : `<img src="https://flagcdn.com/w80/${c1}.png" class="tile-flag" title="${player.country}">`;

    let targetCleanClubs = targetPlayer.pastClubs.map(getClubMatchKey);
    let clubsHTML = player.pastClubs.map(c => {
        let isLoan = c.includes("(W)");
        let isMatch = targetCleanClubs.includes(getClubMatchKey(c));
        let matchClass = isMatch ? 'club-match' : 'club-dim';
        let isSpecial = isSpecialClubName(c);
        let specialClass = isSpecial ? ' club-special' : '';
        
        return `
            <div class="club-logo-wrapper">
                <div class="club-abbr-box ${matchClass}${specialClass}" title="${c}">${getClubAbbr(c)}</div>
                ${isLoan ? `<div class="loan-badge" title="${t('loanTitle')}">W</div>` : ''}
            </div>
        `;
    }).join('<div class="club-divider"></div>');

    let d1 = isRestore ? 0 : 0.1;
    let d2 = isRestore ? 0 : 0.3;
    let d3 = isRestore ? 0 : 0.5;
    let d4 = isRestore ? 0 : 0.7;
    let d5 = isRestore ? 0 : 0.9;
    let d6 = isRestore ? 0 : 1.1;

    row.innerHTML = `
        <div class="col-attempt-row"><div class="attempt-badge" title="${formatText('attemptTitle', { number: attemptNumber })}">${attemptNumber}</div></div>
        <div class="col-name">${player.name}</div>
        <div class="col-attr"><div class="attr-box ${countryCls} flip-anim" style="animation-delay: ${d1}s">${countryContent}</div></div>
        <div class="col-attr"><div class="attr-box ${yearCls} flip-anim" style="animation-delay: ${d2}s">${yearContent}</div></div>
        <div class="col-attr"><div class="attr-box ${gpCls} flip-anim" style="animation-delay: ${d3}s; font-size: 24px;">${gpIcon}</div></div>
        <div class="col-attr"><div class="attr-box ${dmpCls} flip-anim" style="animation-delay: ${d4}s">${dmpContent}</div></div>
        <div class="col-attr"><div class="attr-box ${player.status === targetPlayer.status ? 'green' : 'red'} flip-anim" style="animation-delay: ${d5}s">${player.status === 'Aktywny' ? '✅' : '❌'}</div></div>
        <div class="col-clubs flip-anim" style="animation-delay: ${d6}s"><div class="clubs-path-container">${clubsHTML}</div></div>
    `;
    resultsDiv.insertBefore(row, resultsDiv.firstChild);
    
    if (!isRestore) {
        setTimeout(() => playSound('flip'), 100);
        setTimeout(() => playSound('flip'), 300);
        setTimeout(() => playSound('flip'), 500);
        setTimeout(() => playSound('flip'), 700);
        setTimeout(() => playSound('flip'), 900);
        setTimeout(() => playSound('flip'), 1100);
    }
    
    ['country', 'year', 'gp', 'dmp', 'status'].forEach(attr => {
        let c = "red";
        if (attr === 'country') c = countryCls;
        else if (attr === 'year' && player.year === targetPlayer.year) c = "green";
        else if (attr === 'gp' && isGuessGP === isTargetGP) c = "green";
        else if (attr === 'dmp' && player.dmp === targetPlayer.dmp) c = "green";
        else if (attr === 'status' && player.status === targetPlayer.status) c = "green";
        rowEmojis += c === "green" ? "🟩" : (c === "yellow" || c === "half") ? "🟨" : "🟥";
    });
    guessHistory.push(rowEmojis);
    
    if (!isRestore && player.name === targetPlayer.name) { updateStatsOnWin(); setTimeout(handleWin, 1400); }
}

function handleWin() {
    playSound('win');
    revealTargetInfoUI();
    launchConfetti();

    const overlay = document.getElementById('winOverlay');
    overlay.style.display = 'block';
    setTimeout(() => overlay.style.opacity = '1', 10);

    if (gameMode === 'daily') {
        document.getElementById('btnSharePost').style.display = 'inline-block';
    } else {
        document.getElementById('btnSharePost').style.display = 'none';
    }
    updatePostGameButtons();

    setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            document.getElementById('postGameActions').style.display = 'flex';
        }, 200);
    }, 1500);
}

function handleLoss() {
    playSound('lose');
    revealTargetInfoUI();

    const overlay = document.getElementById('loseOverlay');
    overlay.style.display = 'block';
    setTimeout(() => overlay.style.opacity = '1', 10);

    document.getElementById('btnSharePost').style.display = 'none';
    updatePostGameButtons();

    setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            document.getElementById('postGameActions').style.display = 'flex';
        }, 200);
    }, 1500);
}

function revealTargetInfoUI() {
    document.getElementById('mysteryPlaceholder').style.display = 'none';
    const photoImg = document.getElementById('mysteryPhoto');
    photoImg.src = `images/riders/image_0.png`;
    photoImg.style.display = 'block';
    document.getElementById('photoWrapper').classList.add('revealed');
    document.getElementById('mysteryName').innerText = targetPlayer.name;
    if (hasLost) document.getElementById('mysteryName').style.color = "var(--red-neon)";
    
    document.querySelectorAll('.path-box').forEach(box => {
        if (!box.dataset.club) return;
        if (isSpecialClubName(box.dataset.club)) {
            box.classList.add('club-special');
        }
        box.innerHTML = `<span>${getClubAbbr(box.dataset.club)}</span>${box.dataset.club.includes("(W)") ? `<div class="loan-badge" title="${t('loanTitle')}">W</div>` : ''}`;
        box.classList.add('found');
    });
    const endBox = document.getElementById('pathBox-retired');
    if (endBox) { endBox.innerText = '❌'; endBox.classList.add('found'); endBox.style.border = 'none'; endBox.style.background = 'transparent'; }
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
}

async function shareResult() {
    if (gameMode !== 'daily') return;
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    canvas.width = 1080; canvas.height = 1920;
    const grd = ctx.createRadialGradient(540, 0, 0, 540, 0, 1920);
    grd.addColorStop(0, "#1e1e22"); grd.addColorStop(1, "#0a0a0c");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 80px Montserrat, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🏁 SPEEDWAY GUESSR", 540, 200);
    ctx.fillStyle = "#f1c40f";
    ctx.font = "700 50px Montserrat, sans-serif";
    ctx.fillText(`DAILY ${dailyNumberGlobal}`, 540, 280);
    ctx.fillStyle = "#ffffff"; ctx.font = "900 120px Montserrat, sans-serif";
    const scoreText = hasWon ? `${guessCount}/${GUESS_LIMIT}` : `X/${GUESS_LIMIT}`;
    ctx.fillText(scoreText, 540, 450);

    const startY = 690; const boxSize = 100; const gap = 20;
    const gridWidth = (5 * boxSize) + (4 * gap); const startX = (1080 - gridWidth) / 2;
    const colorMap = { "🟩": "#00ff66", "🟨": "#ffcc00", "🟥": "#ff3333" };

    const attemptColumnX = 120;
    ctx.fillStyle = "#8e8e93";
    ctx.font = "700 24px Montserrat, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(t('shareCanvasAttempt'), attemptColumnX, 635);
    const headerLabels = [t('shareCanvasCountry'), t('shareCanvasYear'), "GP", "DMP", t('shareCanvasStatus')];
    headerLabels.forEach((label, index) => {
        const x = startX + index * (boxSize + gap) + boxSize / 2;
        ctx.textAlign = "center";
        ctx.fillText(label, x, 635);
    });

    guessHistory.forEach((rowString, rowIndex) => {
        const attemptNumber = rowIndex + 1;
        const rowY = startY + rowIndex * (boxSize + gap);

        ctx.fillStyle = "#1b1b1f";
        ctx.beginPath();
        ctx.arc(attemptColumnX, rowY + boxSize / 2, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#3a3a3f";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 30px Montserrat, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(attemptNumber), attemptColumnX, rowY + boxSize / 2 + 11);

        const rowEmojis = Array.from(rowString).filter(char => char in colorMap);
        rowEmojis.forEach((emoji, colIndex) => {
            ctx.fillStyle = colorMap[emoji];
            const x = startX + colIndex * (boxSize + gap);
            drawRoundedRect(ctx, x, rowY, boxSize, boxSize, 20);
        });
    });

    ctx.fillStyle = "#8e8e93"; ctx.font = "400 30px Montserrat, sans-serif"; ctx.fillText("SpeedwayGuessr by CZIPSOL", 540, 1850);

    try {
        const isMobileShareTarget = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        if (!blob) { alert(t('shareNoBlob')); return; }

        const safeDailyName = dailyNumberGlobal.replace(/[\\/:*?"<>|]/g, '-');
        const file = new File([blob], `speedway-guessr-${safeDailyName}.png`, { type: "image/png" });
        if (isMobileShareTarget && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: `Speedway Guessr Daily ${dailyNumberGlobal}`,
                text: t('shareText')
            });
            return;
        }

        if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            alert(t('shareCopied'));
            return;
        }

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `speedway-guessr-${safeDailyName}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        alert(t('shareFallback'));
    } catch (error) {
        console.error("Error sharing:", error);
        alert(t('shareUnexpected'));
    }
}

function showStats() {
    document.getElementById('statPlayed').innerText = userStats.played;
    document.getElementById('statWon').innerText = userStats.won;
    document.getElementById('statStreak').innerText = userStats.currentStreak;
    document.getElementById('statMaxStreak').innerText = userStats.maxStreak;

    const overlay = document.getElementById('statsOverlay');
    overlay.style.display = 'block';
    setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeStats() {
    document.getElementById('statsOverlay').style.opacity = '0';
    setTimeout(() => document.getElementById('statsOverlay').style.display = 'none', 300);
}

function setTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('theme', themeName);
    syncSettingsControls();
}

function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    const colors = ['#f1c40f', '#e74c3c', '#2ecc71', '#3498db'];
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let particles = [];
    for (let i = 0; i < 150; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * -canvas.height,
            color: colors[Math.floor(Math.random() * colors.length)],
            sy: Math.random() * 4 + 2,
            r: Math.random() * 360
        });
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.r * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-5, -10, 10, 20);
            ctx.restore();

            p.y += p.sy;
            if (p.y > canvas.height) p.y = -20;
        });
        requestAnimationFrame(draw);
    }

    draw();
}
