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
// ('images/stadiony/')
const stadiumBackgrounds = [
    'url("images/stadiony/gorzow.png")',
    'url("images/stadiony/leszno.png")',
    'url("images/stadiony/torun.png")',
    'url("images/stadiony/wroclaw.png")',
    'url("images/stadiony/zg.png")',
    'url("images/stadiony/poznan.png")',
    'url("images/stadiony/bydgoszcz.png")',
    'url("images/stadiony/mureck.png")',
    'url("images/stadiony/zarnovica.png")',
    'url("images/stadiony/pockin.png")',
    'url("images/stadiony/lublin.png")',
];

function setRandomBackground() {
    const activeTheme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'dark';
    // W motywie jasnym nie forsujemy ciemnych stadionów z ciemnymi gradientami
    if (activeTheme === 'light') {
        document.body.style.removeProperty('background-image');
        document.body.style.removeProperty('background-size');
        document.body.style.removeProperty('background-position');
        document.body.style.removeProperty('background-attachment');
        document.body.style.removeProperty('background-repeat');
        return;
    }

    const randomIndex = Math.floor(Math.random() * stadiumBackgrounds.length);
    const bgUrl = stadiumBackgrounds[randomIndex];

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
const changelog = window.changelog || { pl: [], en: [] };

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
    let currentChangelog = (changelog[currentLang] || changelog['en'] || changelog['pl']) || [];

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
        if (docRef.exists) {
            const data = docRef.data();
            
            // Scalenie statystyk
            if (data.stats) {
                let cloudStats = JSON.parse(data.stats);
                userStats = { ...userStats, ...cloudStats };
            }
            
            // Pobranie danych zapisanych luźno w Firebase (Root)
            if (data.discordUsername) {
                userStats.discordUsername = data.discordUsername;
                userStats.discordLinked = true;
            }
            if (data.avatarUrl) {
                userStats.avatarUrl = data.avatarUrl;
            }

            ensureLeagueStats(userStats);
            ensureProgressionStats();
            localStorage.setItem('speedwayStatsV2', JSON.stringify(userStats));
            updateLeagueUI();
            updateDiscordButtonUI();
        }
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

    if (userStats.discordUsername) {
        // Jeśli konto połączone
        btn.innerHTML = `<span style="font-size: 18px;">✅</span> POŁĄCZONO: ${userStats.discordUsername}`;
        btn.style.background = "rgba(46, 204, 113, 0.15)"; 
        btn.style.border = "1px solid #2ecc71";
        btn.style.color = "#2ecc71";
        btn.style.cursor = "default";
        btn.onclick = () => { showToast("Konto Discord jest już połączone!", "normal"); };
    } else {
        // Jeśli konto nie połączone
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


// Ensure function is available from inline onclick handlers in HTML
try { window.setLang = setLang; } catch (e) {}

// ==============================================
// ====== MOTYW & JĘZYK (ZAKTUALIZOWANE) ========
// ==============================================

function applyTheme(themeName) {
    let actualTheme = themeName;
    if (themeName === 'system') {
        actualTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', actualTheme);
    document.body.setAttribute('data-theme', actualTheme);

    // Ponowne przeliczenie tła pod kątem wybranego motywu
    if (typeof setRandomBackground === 'function') {
        setRandomBackground();
    }

    // Podświetlenie odpowiedniego kafelka w Ustawieniach
    document.querySelectorAll('.option-card').forEach(el => el.classList.remove('active'));
    const activeBtn = document.getElementById('theme-btn-' + themeName);
    if (activeBtn) activeBtn.classList.add('active');
}

function setTheme(themeName) {
    let oldTheme = localStorage.getItem('theme');
    localStorage.setItem('theme', themeName);
    applyTheme(themeName);

    if (oldTheme && oldTheme !== themeName && typeof userStats !== 'undefined' && userStats.trackers) {
        ensureAchievementsStats();
        userStats.trackers.changedTheme = true;
        checkAchievements();
        saveStats();
    }
}

// Zmiana języka z bezpiecznym wsparciem dla zewnętrznego pliku i18n.js
function setLang(lang) {
    const dict = (window.i18n && window.i18n[lang]) ? window.i18n : (typeof i18n !== 'undefined' ? i18n : null);
    if (!dict || !dict[lang]) {
        console.warn("Brak słownika dla języka:", lang);
        return;
    }

    let oldLang = localStorage.getItem('speedwayLang');
    currentLang = lang;
    window.currentLang = lang;
    localStorage.setItem('speedwayLang', currentLang);

    // Aktualizacja kafelków z flagami w Ustawieniach
    document.querySelectorAll('.flag-card').forEach(el => el.classList.remove('active'));
    const flagEl = document.getElementById('flag-btn-' + currentLang);
    if (flagEl) flagEl.classList.add('active');

    const strings = dict[currentLang] || dict['pl'];

    // Podmiana tekstów we wszystkich węzłach z atrybutem data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key || strings[key] === undefined) return;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = strings[key];
        } else {
            el.innerHTML = strings[key];
        }
    });

    // Tooltipy
    document.querySelectorAll('[data-i18n-tip]').forEach(el => {
        const tipKey = el.getAttribute('data-i18n-tip');
        if (tipKey && strings[tipKey]) el.setAttribute('data-tip', strings[tipKey]);
    });

    if (typeof updateDailyMenu === 'function') updateDailyMenu();
    if (typeof updateSoundBtn === 'function') updateSoundBtn();
    if (typeof updateAuthUI === 'function') updateAuthUI(auth.currentUser);
    
    const calOverlay = document.getElementById('calendarOverlay');
    if (calOverlay && calOverlay.style.display === 'block' && typeof renderCalendar === 'function') {
        renderCalendar();
    }
    if (typeof renderUpdates === 'function') renderUpdates();

    const modeDisplay = document.getElementById('gameModeDisplay');
    if (modeDisplay) {
        if (gameMode === 'daily') {
            modeDisplay.innerText = `${strings.modeDaily || 'Tryb: Daily'} ${dailyNumberGlobal}`;
        } else {
            modeDisplay.innerText = strings.modeEndless || 'Tryb: Endless';
        }
    }

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
    // Dodajemy zapisywanie nicku bezpośrednio do obiektu statystyk
    if (playerNickname) {
        userStats.nickname = playerNickname;
    }
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
        const nickEffectToSave = userStats.equippedNick === 'default' ? null : userStats.equippedNick;

        const dailyRef = db.collection("rankings").doc(currentDailyDay.toString()).collection("scores").doc(playerId);
        batch.set(dailyRef, { nick: safeNick, club: userStats.favoriteClub || null, bg: userStats.equippedBg || null, nickEffect: nickEffectToSave, won: isWin ? 1 : 0, guesses: attempts, hints: hintsUsedCount, timestamp: ts }, { merge: true });        
        const increment = firebase.firestore.FieldValue.increment;
        const winIncrement = isWin ? 1 : 0; 
        
        const weeklyRef = db.collection("leaderboard_weekly").doc(getCurrentWeekStr()).collection("scores").doc(playerId);
        batch.set(weeklyRef, { nick: safeNick, club: userStats.favoriteClub || null, bg: userStats.equippedBg || null, nickEffect: nickEffectToSave, wins: increment(winIncrement), guesses: increment(attempts), timestamp: ts }, { merge: true });
        
        const monthlyRef = db.collection("leaderboard_monthly").doc(getCurrentMonthStr()).collection("scores").doc(playerId);
        batch.set(monthlyRef, { nick: safeNick, club: userStats.favoriteClub || null, bg: userStats.equippedBg || null, nickEffect: nickEffectToSave, wins: increment(winIncrement), guesses: increment(attempts), timestamp: ts }, { merge: true });
        
        const alltimeRef = db.collection("leaderboard_alltime").doc("global").collection("scores").doc(playerId);
        batch.set(alltimeRef, { nick: safeNick, club: userStats.favoriteClub || null, bg: userStats.equippedBg || null, nickEffect: nickEffectToSave, wins: increment(winIncrement), guesses: increment(attempts), timestamp: ts }, { merge: true });
        
        await batch.commit();
    } catch (e) { console.error("DB Error:", e); }
}

async function syncLeagueScoreToFirebase() {
    if (!playerId) return; 
    if (!auth.currentUser && !playerId.startsWith('guest_')) return; 

    const league = ensureLeagueStats(userStats).clashLeague;
    let eloToSend = Math.round(league.elo);
    if (isNaN(eloToSend) || eloToSend === null || eloToSend < 0) eloToSend = 1000;
    if (eloToSend > 5000) eloToSend = 5000;

    try {
        const docRef = db.collection('leaderboard_clash_beta').doc(playerId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            const cloudData = docSnap.data();
            const cloudElo = cloudData.elo || 1000;
            if (Math.abs(cloudElo - eloToSend) > 190) {
                userStats.clashLeague.elo = cloudElo;
                userStats.clashLeague.matchesPlayed = cloudData.matchesPlayed || league.matchesPlayed;
                userStats.clashLeague.wins = cloudData.wins || league.wins;
                userStats.clashLeague.losses = cloudData.losses || league.losses;
                userStats.clashLeague.draws = cloudData.draws || league.draws;
                localStorage.setItem('speedwayStatsV2', JSON.stringify(userStats));
                updateLeagueUI();
                return; 
            }
        }
        await docRef.set({
            nick: playerNickname || 'Gracz',
            club: userStats.favoriteClub || null,
            bg: userStats.equippedBg || null,
            nickEffect: userStats.equippedNick === 'default' ? null : userStats.equippedNick,
            elo: eloToSend,
            matchesPlayed: league.matchesPlayed,
            wins: league.wins,
            losses: league.losses,
            draws: league.draws,
            rank: getLeagueRankName(eloToSend, league.matchesPlayed),
            provisional: league.matchesPlayed < 5,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) { console.warn('Ostrzeżenie synchronizacji Ligi Clash:', e.message); }
}

function updateStatsOnWin() {
    if(hasWon || hasLost) return; hasWon = true;
    userStats.played++; userStats.won++; userStats.currentStreak++;
    
    ensureAchievementsStats();
    if (!hintActive) userStats.trackers.winsNoHint++;
    checkAchievements();

    if (gameMode === 'endless') {
        updateMissionProgress('play_endless', 1);
        updateMissionProgress('win_endless', 1);
        if (!hintActive) updateMissionProgress('no_hint_win', 1);
        updateMissionProgress('streak_endless', userStats.currentStreak, true); // isMaxMode = true
    } else if (gameMode === 'daily') {
        updateMissionProgress('play_daily', 1);
    }
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
    
    if (gameMode === 'endless') updateMissionProgress('play_endless', 1);
    else if (gameMode === 'daily') updateMissionProgress('play_daily', 1);
    
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
    
    let equipped = userStats.equippedHelmet || 'default';
    let helmetFileName = 'kask-zycie.png'; // Domyślny
    if (equipped === 'helmet-zloty') helmetFileName = 'images/helmets/kask-zloty.png';
    else if (equipped === 'helmet-retro') helmetFileName = 'images/helmets/kask-retro.png';
    
    for (let i = 0; i < GUESS_LIMIT; i++) {
        const isLost = i < guessCount; const isJustLost = (i === guessCount - 1) && !isRestoring && !hasWon; 
        let cls = "helmet-icon";
        if (isJustLost) cls += " life-lost-anim"; else if (isLost) cls += " helmet-lost"; 
        container.innerHTML += `<img src="${helmetFileName}" class="${cls}" alt="Kask">`;
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

function renderClashEmotePanel() {
    const panel = document.getElementById('clashEmotePanel');
    if (!panel) return;
    panel.innerHTML = '';
    
    let emotes = ['🤯', '👏', '🤬', '⏳', '🤡']; 
    
    if (userStats.equippedEmote === 'emote-sedzia') emotes = ['🟥', '🟨', '🏁', '🛑', '🎥'];
    else if (userStats.equippedEmote === 'emote-kibic') emotes = ['🌭', '🍻', '🧨', '🎺', '🧣'];
    else if (userStats.equippedEmote === 'emote-memy') emotes = ['🤡', '💩', '🥱', '💀', '🤫'];
    
    emotes.forEach(emo => {
        panel.innerHTML += `<button class="clash-emote-btn" onclick="sendClashEmote('${emo}')">${emo}</button>`;
    });
}

// Aktywacja podpowiedzi z przycisku
function useHint() {
    if (hintActive) return;
    const target = _unlockTarget();
    hintActive = true; hintsUsedCount = 1;
    document.getElementById('btnHint').style.display = 'none'; 
    document.getElementById('mysteryName').innerText = _getSafeHint(target.name, guessCount);
    
    updateMissionProgress('use_hint', 1); // ZALICZENIE MISJI
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
    if (!auth.currentUser && !playerId.startsWith('guest_')) return; 

    try {
        const docRef = db.collection('leaderboard_timeattack').doc(playerId);
        const doc = await docRef.get();
        if (!doc.exists || doc.data().score < score) {
            await docRef.set({
                nick: playerNickname || 'Gracz',
                club: userStats.favoriteClub || null,
                bg: userStats.equippedBg || null,
                nickEffect: userStats.equippedNick === 'default' ? null : userStats.equippedNick,
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

// Nowy efekt: Deszcz monet
function launchCoins() {
    const canvas = document.getElementById('confettiCanvas'); const ctx = canvas.getContext('2d'); canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    let particles = []; for (let i = 0; i < 100; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*-canvas.height, color: '#f1c40f', sy: Math.random()*5+3, r: Math.random()*360 });
    function draw() { ctx.clearRect(0,0,canvas.width,canvas.height); particles.forEach(p => { ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r*Math.PI/180); ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle='#d4af37'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.restore(); p.y+=p.sy; if(p.y>canvas.height)p.y=-20; }); requestAnimationFrame(draw); } draw();
}

function handleWin(finalName) {
    playSound('win'); revealTargetInfoUI(finalName); 
    
    if (userStats.equippedWin === 'win-coins') launchCoins();
    else if (userStats.equippedWin === 'win-fireworks') { launchConfetti(); }
    else launchConfetti(); 
    
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
            
            let snapshot = await db.collection("leaderboard_clash_beta").orderBy("elo", "desc").limit(30).get();
            let scores = []; snapshot.forEach(doc => { let d = doc.data(); d.uid = doc.id; scores.push(d); });
            scores = scores.filter(row => (row.matchesPlayed || 0) >= 5).slice(0, 20);

            tbody.innerHTML = '';
            if (scores.length === 0) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Brak wyników</td></tr>`; return; }

            let pos = 1;
            scores.forEach((row) => {
                let rawNick = escapeHTML(row.nick || t('defaultPlayer'));
                let safeNick = row.nickEffect && row.nickEffect !== 'default' ? `<span class="${row.nickEffect}">${rawNick}</span>` : rawNick;
                let rangaText = getLeagueRankName(row.elo, row.matchesPlayed);
                safeNick += getMiniClubBadge(row.club); 
                
                let bgClass = row.bg ? row.bg : '';
                let isMeStyle = (rawNick === playerNickname) ? 'style="background: rgba(255,255,255,0.05); cursor: pointer;"' : 'style="cursor: pointer;"';
                
                tbody.innerHTML += `
                    <tr class="${bgClass}" ${isMeStyle} onclick="openPublicProfile('${row.uid}', '${rawNick.replace(/'/g, "\\'")}')">
                        <td style="color:var(--accent); font-weight:900;">${pos}</td>
                        <td style="text-align:left;">${safeNick}</td>
                        <td style="font-size:10px;">${rangaText}</td>
                        <td style="color:#3399ff;">${row.elo}</td>
                    </tr>`;
                pos++;
            });

        } else if (type === 'timeattack') {
            thead.innerHTML = `<tr><th style="width: 15%;">${t('colPos')}</th><th style="text-align: left; width: 60%;">${t('colNick')}</th><th style="color: #1dd1a1; width: 25%; text-align: center;">${t('colRecord')}</th></tr>`;
            let snapshot = await db.collection("leaderboard_timeattack").orderBy("score", "desc").limit(20).get();
            let scores = []; snapshot.forEach(doc => { let d = doc.data(); d.uid = doc.id; scores.push(d); });
            
            tbody.innerHTML = '';
            if (scores.length === 0) { tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">${t('noResults')}</td></tr>`; return; }

            let pos = 1;
            scores.forEach((row) => {
                let rawNick = escapeHTML(row.nick || t('defaultPlayer'));
                let safeNick = row.nickEffect && row.nickEffect !== 'default' ? `<span class="${row.nickEffect}">${rawNick}</span>` : rawNick;
                safeNick += getMiniClubBadge(row.club); 
                
                let bgClass = row.bg ? row.bg : '';
                let isMeStyle = (rawNick === playerNickname) ? 'style="background: rgba(255,255,255,0.05); cursor: pointer;"' : 'style="cursor: pointer;"';
                let rankClass = pos === 1 ? "rank-1" : pos === 2 ? "rank-2" : pos === 3 ? "rank-3" : "";
                
                tbody.innerHTML += `
                    <tr class="${bgClass}" ${isMeStyle} onclick="openPublicProfile('${row.uid}', '${rawNick.replace(/'/g, "\\'")}')">
                        <td class="${rankClass}" style="color:var(--accent); font-weight:900;">${pos}</td>
                        <td class="${rankClass}" style="text-align:left;">${safeNick}</td>
                        <td style="color:#1dd1a1; font-weight:900; text-align: center;">${row.score}</td>
                    </tr>`;
                pos++;
            });

        } else {
            let headerText = (type === 'daily') ? t('colSolved') : t('colTotalWins');
            thead.innerHTML = `<tr><th style="width:15%;">${t('colPos')}</th><th style="text-align:left; width:45%;">${t('colNick')}</th><th style="width:20%;">${headerText}</th><th style="width:20%;">${t('colTries')}</th></tr>`;
            
            let snapshot;
            if (type === 'daily') snapshot = await db.collection("rankings").doc(selectedDailyDay.toString()).collection("scores").limit(20).get();
            else if (type === 'weekly') snapshot = await db.collection("leaderboard_weekly").doc(getCurrentWeekStr()).collection("scores").limit(20).get();
            else if (type === 'monthly') snapshot = await db.collection("leaderboard_monthly").doc(getCurrentMonthStr()).collection("scores").limit(20).get();
            else if (type === 'alltime') snapshot = await db.collection("leaderboard_alltime").doc("global").collection("scores").limit(20).get();
            
            let scores = []; snapshot.forEach(doc => { let d = doc.data(); d.uid = doc.id; scores.push(d); });
            scores.sort((a, b) => { 
                let winsA = a.won !== undefined ? a.won : (a.wins || 0); 
                let winsB = b.won !== undefined ? b.won : (b.wins || 0); 
                if (winsB !== winsA) return winsB - winsA; 
                if (a.guesses !== b.guesses) return a.guesses - b.guesses; 
                return (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0); 
            });
            
            tbody.innerHTML = '';
            if (scores.length === 0) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">${t('noResults')}</td></tr>`; return; }

            scores.forEach((row, index) => {
                let winsAmount = row.won !== undefined ? row.won : (row.wins || 0); 
                let wonText = winsAmount > 0 ? `<span style="color:var(--green-neon);">${type === 'daily' ? t('yes') : winsAmount}</span>` : `<span style="color:var(--red-neon);">${type === 'daily' ? t('no') : '0'}</span>`;
                let rawNick = escapeHTML(row.nick || t('defaultPlayer'));
                let safeNick = row.nickEffect && row.nickEffect !== 'default' ? `<span class="${row.nickEffect}">${rawNick}</span>` : rawNick;
                safeNick += getMiniClubBadge(row.club); 
                
                let bgClass = row.bg ? row.bg : '';
                let isMeStyle = (rawNick === playerNickname) ? 'style="color: var(--accent); cursor: pointer;"' : 'style="cursor: pointer;"';
                
                tbody.innerHTML += `
                    <tr class="${bgClass}" ${isMeStyle} onclick="openPublicProfile('${row.uid}')">
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
            
            updateMissionProgress('play_clash', 1);
            updateMissionProgress('win_clash', 1);
            addExp(50); 
            
        } else {
            league.losses++;
            league.winStreak = 0;
            resultText = finishedBySurrender ? "PORAŻKA (PODDANIE)" : "PORAŻKA";
            
            updateMissionProgress('play_clash', 1);
            addExp(15); 
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
    
    // Delikatne chowanie okien
    ['clashMatchmakingOverlay', 'clashMatchmakingOverlayDesktop', 'clashSummaryOverlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.opacity = '0'; setTimeout(() => el.style.display = 'none', 300); }
    });

    ['clashModeSelectContainer', 'clashLobbyContainer', 'clashContainer', 'mainMenuContainer', 'desktopMainMenu'].forEach(id => {
        setElementDisplay(id, 'none');
    });

    const vsOverlay = document.getElementById('clashVsOverlay');
    
    // --- 1. AWATARY NA EKRANIE VS (Wczytywanie) ---
    const defaultIconRed = `<div class="vs-icon drop-shadow-red">🔴</div>`;
    const defaultIconBlue = `<div class="vs-icon drop-shadow-blue">🔵</div>`;
    
    const p1AvatarHTML = data.p1.avatarUrl 
        ? `<img src="${data.p1.avatarUrl}" style="width: 100px; height: 100px; border-radius: 50%; border: 4px solid #ff3333; object-fit: cover; filter: drop-shadow(0 0 20px #ff3333);">`
        : defaultIconRed;

    const p2AvatarHTML = data.p2.avatarUrl 
        ? `<img src="${data.p2.avatarUrl}" style="width: 100px; height: 100px; border-radius: 50%; border: 4px solid #3399ff; object-fit: cover; filter: drop-shadow(0 0 20px #3399ff);">`
        : defaultIconBlue;

    document.querySelector('.vs-player.p1').innerHTML = `${p1AvatarHTML}<h2 id="vsP1Name" class="vs-name">Gracz 1</h2>`;
    document.querySelector('.vs-player.p2').innerHTML = `${p2AvatarHTML}<h2 id="vsP2Name" class="vs-name">Gracz 2</h2>`;

    // --- 2. AWATARY NA PASKU W GRZE (Aktualizacja góry ekranu) ---
    const cp1Avatar = document.getElementById('cp1Avatar');
    const cp1Icon = document.getElementById('cp1Icon');
    if (data.p1.avatarUrl) {
        cp1Avatar.src = data.p1.avatarUrl;
        cp1Avatar.style.display = 'inline-block';
        cp1Icon.style.display = 'none';
    } else {
        cp1Avatar.style.display = 'none';
        cp1Icon.style.display = 'inline-block';
    }

    const cp2Avatar = document.getElementById('cp2Avatar');
    const cp2Icon = document.getElementById('cp2Icon');
    if (data.p2.avatarUrl) {
        cp2Avatar.src = data.p2.avatarUrl;
        cp2Avatar.style.display = 'inline-block';
        cp2Icon.style.display = 'none';
    } else {
        cp2Avatar.style.display = 'none';
        cp2Icon.style.display = 'inline-block';
    }

    // --- 3. AWATARY NA MONECIE ---
    const coinFront = document.getElementById('coinFaceRed');
    const coinBack = document.getElementById('coinFaceBlue');
    if (coinFront && coinBack) {
        coinFront.innerHTML = data.p1.avatarUrl ? `<img src="${data.p1.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : `🔴`;
        coinBack.innerHTML = data.p2.avatarUrl ? `<img src="${data.p2.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : `🔵`;
    }

    // --- Rysowanie Nicków i Lig ---
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

    // --- H2H (Historia) ---
    let opponentNick = myClashColor === 'red' ? data.p2.nick : data.p1.nick;
    let myWins = 0; let oppWins = 0;
    
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
        if (myClashColor === 'red') h2hScore.innerHTML = `<span style="color:#ff3333">${myWins}</span> : <span style="color:#3399ff">${oppWins}</span>`;
        else h2hScore.innerHTML = `<span style="color:#ff3333">${oppWins}</span> : <span style="color:#3399ff">${myWins}</span>`;
        h2hContainer.style.display = 'block';
    } else {
        h2hContainer.style.display = 'none'; 
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
    if (turnColor === myClashColor) updateMissionProgress('claim_cells_clash', 1);
    
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
    window.hasUpdatedLeague = false;
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

    const cp1 = document.getElementById('clashPlayer1');
    const cp2 = document.getElementById('clashPlayer2');

    if (clashStatus === 'viewing' || clashStatus === 'summary') {
        display.innerText = 'KONIEC MECZU';
        display.style.color = 'var(--text-dim)';
        if (cp1) cp1.classList.remove('active');
        if (cp2) cp2.classList.remove('active');
        return;
    }

    // Podświetlenie nicku aktywnego gracza
    if (cp1) cp1.classList.toggle('active', clashTurn === 'red');
    if (cp2) cp2.classList.toggle('active', clashTurn === 'blue');

    // Kolor zegara: zielony jeśli Twoja kolej
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

// ==============================================
// ====== POLITYKA PRYWATNOŚCI & REGULAMIN ======
// ==============================================
function showPrivacyPolicy() {
    const overlay = document.getElementById('privacyPolicyOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => overlay.style.opacity = '1', 10);
    }
}

function closePrivacyPolicy() {
    const overlay = document.getElementById('privacyPolicyOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 300);
    }
}

function showTerms() {
    const overlay = document.getElementById('termsOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => overlay.style.opacity = '1', 10);
    }
}

function closeTerms() {
    const overlay = document.getElementById('termsOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 300);
    }
}


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
// ====== SYSTEM POZIOMÓW, MISJI I SKLEPU =======
// ==============================================

const MISSIONS_POOL_DAILY = [
    { type: 'play_endless', target: 3, descKey: 'mission_play_endless_3', exp: 50, coins: 20 },
    { type: 'win_endless', target: 1, descKey: 'mission_win_endless_1', exp: 80, coins: 40 },
    { type: 'no_hint_win', target: 1, descKey: 'mission_no_hint_win_1', exp: 100, coins: 50 },
    { type: 'play_clash', target: 1, descKey: 'mission_play_clash_1', exp: 100, coins: 50 },
    { type: 'win_clash', target: 1, descKey: 'mission_win_clash_1', exp: 200, coins: 100 },
    { type: 'claim_cells_clash', target: 5, descKey: 'mission_claim_cells_clash_5', exp: 150, coins: 70 },
    { type: 'play_ta', target: 2, descKey: 'mission_play_ta_2', exp: 80, coins: 30 },
    { type: 'ta_score', target: 20, descKey: 'mission_ta_score_20', exp: 150, coins: 70 },
    { type: 'use_hint', target: 3, descKey: 'mission_use_hint_3', exp: 40, coins: 15 },
    { type: 'play_daily', target: 1, descKey: 'mission_play_daily_1', exp: 100, coins: 50 }
];

const MISSIONS_POOL_WEEKLY = [
    { type: 'play_endless', target: 20, descKey: 'mission_play_endless_20', exp: 400, coins: 200 },
    { type: 'win_endless', target: 10, descKey: 'mission_win_endless_10', exp: 500, coins: 250 },
    { type: 'no_hint_win', target: 10, descKey: 'mission_no_hint_win_10', exp: 600, coins: 350 },
    { type: 'play_clash', target: 10, descKey: 'mission_play_clash_10', exp: 600, coins: 300 },
    { type: 'win_clash', target: 5, descKey: 'mission_win_clash_5', exp: 800, coins: 400 },
    { type: 'claim_cells_clash', target: 30, descKey: 'mission_claim_cells_clash_30', exp: 700, coins: 350 },
    { type: 'ta_score', target: 150, descKey: 'mission_ta_score_150', exp: 600, coins: 300 },
    { type: 'ta_single_score', target: 20, descKey: 'mission_ta_single_score_20', exp: 500, coins: 250 },
    { type: 'streak_endless', target: 5, descKey: 'mission_streak_endless_5', exp: 800, coins: 400 }
];

const MISSIONS_POOL_MONTHLY = [
    { type: 'play_endless', target: 100, descKey: 'mission_play_endless_100', exp: 1500, coins: 1000 },
    { type: 'win_endless', target: 50, descKey: 'mission_win_endless_50', exp: 2000, coins: 1200 },
    { type: 'play_clash', target: 50, descKey: 'mission_play_clash_50', exp: 2000, coins: 1200 },
    { type: 'win_clash', target: 25, descKey: 'mission_win_clash_25', exp: 3000, coins: 2000 },
    { type: 'claim_cells_clash', target: 150, descKey: 'mission_claim_cells_clash_150', exp: 2500, coins: 1500 },
    { type: 'ta_score', target: 500, descKey: 'mission_ta_score_500', exp: 2500, coins: 1500 },
    { type: 'streak_endless', target: 15, descKey: 'mission_streak_endless_15', exp: 3500, coins: 2500 }
];

function ensureProgressionStats() {
    let needsSave = false;
    if (typeof userStats.level === 'undefined') { userStats.level = 1; needsSave = true; }
    if (typeof userStats.exp === 'undefined') { userStats.exp = 0; needsSave = true; }
    if (typeof userStats.coins === 'undefined') { userStats.coins = 0; needsSave = true; }
    
    if (!userStats.missions) { userStats.missions = { date: "", weeklyDate: "", monthlyDate: "", dailyTasks: [], weeklyTasks: [], monthlyTasks: [] }; needsSave = true; }

    // --- NOWE ZMIENNE SKLEPU ---
    if (!userStats.ownedBgs) { userStats.ownedBgs = []; needsSave = true; }
    if (typeof userStats.equippedBg === 'undefined') { userStats.equippedBg = null; needsSave = true; }
    
    if (!userStats.ownedNicks) { userStats.ownedNicks = ['default']; needsSave = true; }
    if (!userStats.equippedNick) { userStats.equippedNick = 'default'; needsSave = true; }
    
    if (!userStats.ownedHelmets) { userStats.ownedHelmets = ['default']; needsSave = true; }
    if (!userStats.equippedHelmet) { userStats.equippedHelmet = 'default'; needsSave = true; }
    
    if (!userStats.ownedEmotes) { userStats.ownedEmotes = ['default']; needsSave = true; }
    if (!userStats.equippedEmote) { userStats.equippedEmote = 'default'; needsSave = true; }
    
    if (!userStats.ownedWins) { userStats.ownedWins = ['default']; needsSave = true; }
    if (!userStats.equippedWin) { userStats.equippedWin = 'default'; needsSave = true; }

    const d = new Date();
    const todayStr = d.toLocaleDateString();
    
    if (userStats.missions.date !== todayStr) {
        userStats.missions.date = todayStr;
        let shuffled = [...MISSIONS_POOL_DAILY].sort(() => 0.5 - Math.random());
        userStats.missions.dailyTasks = shuffled.slice(0, 3).map(m => ({ ...m, progress: 0, completed: false, claimed: false }));
        needsSave = true;
    }

    let dayNum = d.getDay() || 7; 
    let monday = new Date(d); monday.setDate(d.getDate() - dayNum + 1);
    let mondayStr = monday.toLocaleDateString();
    if (userStats.missions.weeklyDate !== mondayStr) {
        userStats.missions.weeklyDate = mondayStr;
        let shuffled = [...MISSIONS_POOL_WEEKLY].sort(() => 0.5 - Math.random());
        userStats.missions.weeklyTasks = shuffled.slice(0, 2).map(m => ({ ...m, progress: 0, completed: false, claimed: false }));
        needsSave = true;
    }

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

function updateMissionProgress(type, amount = 1, isMaxMode = false) {
    ensureProgressionStats();
    let updated = false;
    
    [userStats.missions.dailyTasks, userStats.missions.weeklyTasks, userStats.missions.monthlyTasks].forEach(taskList => {
        taskList.forEach(task => {
            if (task.type === type && !task.completed) {
                // Jeśli to misja typu "Zdobądź w jednym meczu" to nadpisujemy wynik, jeśli jest wyższy
                if (isMaxMode) {
                    if (amount > task.progress) {
                        task.progress = amount;
                        updated = true;
                    }
                } else {
                    // Tradycyjne misje sumujące się (np. rozegraj 100 gier)
                    task.progress += amount;
                    updated = true;
                }
                
                if (task.progress >= task.target) {
                    task.progress = task.target;
                    task.completed = true;
                    showToast(`✅ Misja ukończona: ${task.desc}!`, "success");
                }
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
    ensureProgressionStats(); // Wymusza stworzenie zmiennych poziomu i expa, jeśli ich nie ma

    // Statystyki
    document.getElementById('profileStatPlayed').innerText = userStats.played || 0; 
    document.getElementById('profileStatWon').innerText = userStats.won || 0;
    document.getElementById('profileStatStreak').innerText = userStats.currentStreak || 0; 
    document.getElementById('profileStatMax').innerText = userStats.maxStreak || 0;
    
    // Dane gracza (Edycja)
    document.getElementById('changeNickInput').value = playerNickname || "";
    
    // Klub
    ensureClubStat(userStats);
    const clubText = userStats.favoriteClub ? `KLUB: <b>${userStats.favoriteClub}</b>` : "WYBIERZ KLUB 🛡️";
    document.getElementById('currentClubDisplay').innerHTML = clubText;
    document.getElementById('profileClubOverview').innerHTML = userStats.favoriteClub ? userStats.favoriteClub : "Brak klubu";

    // Awatar (Domyślny placeholder w Base64 jeśli brak zdjęcia)
    const defAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";
    document.getElementById('profileAvatarOverview').src = userStats.avatarUrl || defAvatar;
    document.getElementById('profileAvatarEdit').src = userStats.avatarUrl || defAvatar;

    // Nick + Poziom z efektami ze sklepu
    const pNick = playerNickname || "GRACZ";
    document.getElementById('profileNickOverview').innerHTML = userStats.equippedNick && userStats.equippedNick !== 'default' 
        ? `<span class="${userStats.equippedNick}">${pNick}</span>` 
        : pNick;

    const reqExp = getRequiredExp(userStats.level);
    const pct = Math.min(100, Math.floor((userStats.exp / reqExp) * 100));
    
    document.getElementById('profileLevelTop').innerText = userStats.level;
    document.getElementById('profileExpBarOverview').style.width = `${pct}%`;
    document.getElementById('profileExpTextOverview').innerText = `${userStats.exp} / ${reqExp} EXP`;

    // Reset zakładki na 'Podsumowanie'
    switchProfileTab('overview');

    const overlay = document.getElementById('profileOverlay');
    overlay.style.display = 'flex'; 
    setTimeout(() => overlay.style.opacity = '1', 10);
};

window.closeProfile = function() {
    const overlay = document.getElementById('profileOverlay');
    overlay.style.opacity = '0'; 
    setTimeout(() => overlay.style.display = 'none', 300);
};

// Funkcja do przełączania zakładek w profilu
window.switchProfileTab = function(tabId) {
    const btns = document.querySelectorAll('#profileOverlay .settings-tab-btn');
    btns.forEach(b => {
        if(b.getAttribute('onclick').includes(tabId)) b.classList.add('active');
        else b.classList.remove('active');
    });

    document.getElementById('tab-profile-overview').style.display = tabId === 'overview' ? 'block' : 'none';
    document.getElementById('tab-profile-edit').style.display = tabId === 'edit' ? 'block' : 'none';
};

function compressImage(file, maxSize, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxSize) { height *= maxSize / width; width = maxSize; }
            } else {
                if (height > maxSize) { width *= maxSize / height; height = maxSize; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.8)); // 80% quality JPEG
        };
    };
}

window.handleAvatarUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!auth.currentUser || playerId.startsWith('guest_')) {
        appAlert("Musisz być zalogowany przez Google, aby dodać własny awatar!", "Brak uprawnień");
        return;
    }

    const statusText = document.getElementById('avatarUploadStatus');
    statusText.innerText = "PRZETWARZANIE...";
    statusText.style.color = "var(--yellow-neon)";

    compressImage(file, 200, async (base64Image) => {
        try {
            statusText.innerText = "WERYFIKACJA AI (SIGHTENGINE)...";
            const uploadFunc = functions.httpsCallable('uploadAvatar');
            
            const response = await uploadFunc({ image: base64Image });
            
            if (response.data.success) {
                const newUrl = response.data.avatarUrl;
                
                userStats.avatarUrl = newUrl;
                saveStats(); 
                
                // Aktualizujemy obie grafiki (w podsumowaniu i w edycji)
                document.getElementById('profileAvatarOverview').src = newUrl;
                document.getElementById('profileAvatarEdit').src = newUrl;
                
                statusText.innerText = "AWATAR ZAAKCEPTOWANY!";
                statusText.style.color = "var(--green-neon)";
                showToast("Awatar został pomyślnie zaktualizowany!", "success");
            }
        } catch (error) {
            console.error(error);
            statusText.innerText = "ODRZUCONO!";
            statusText.style.color = "var(--red-neon)";
            appAlert(error.message, "Odrzucono awatar");
        }
    });
};


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
    
    if (typeof setLang === 'function') setLang(currentLang);
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
        container.innerHTML = `<div class="text-dim text-center mt-20">${t('missionsNoTasks')}</div>`;
        return;
    }
    
    taskList.forEach((task, index) => {
        let pct = Math.min(100, Math.floor((task.progress / task.target) * 100));
        
        let actionHtml = '';
        if (task.claimed) {
            actionHtml = `<button class="shop-btn" style="background:transparent; border:1px solid var(--text-dim); color:var(--text-dim);" disabled>${t('missionsClaimed')}</button>`;
        } else if (task.completed) {
            actionHtml = `<button class="shop-btn shop-btn-buy" onclick="claimMission('${type}', ${index})">${t('missionsClaim')}</button>`;
        } else {
            actionHtml = `<span style="font-size: 13px; font-weight: 900; color: var(--text-dim);">${task.progress} / ${task.target}</span>`;
        }

        const missionText = t(task.descKey) || task.desc || '';

        container.innerHTML += `
            <div class="mission-card ${task.completed ? 'completed' : ''}">
                <div class="mission-info">
                    <div class="mission-title">${missionText}</div>
                    <div class="mission-reward">${t('missionsReward')}: ${task.exp} EXP | ${task.coins} 🪙</div>
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
    
    showToast(`${t('missionsCollected')} ${task.coins} 🪙 i ${task.exp} EXP`, "success");
    saveStats();
    
    document.getElementById('missionsCoinsDisplay').innerText = userStats.coins;
    switchMissionTab(type); // Odświeżenie listy
}

// ==============================================
// ====== UI SKLEPU (NOWY LAYOUT) ===============
// ==============================================

// ==============================================
// ====== BAZA DANYCH SKLEPU ====================
// ==============================================

const SHOP_DB = {
    backgrounds: [
        { id: 'rank-bg-gold', nameKey: 'shop_bg_gold_name', descKey: 'shop_bg_gold_desc', price: 5000 },
        { id: 'rank-bg-ocean', nameKey: 'shop_bg_ocean_name', descKey: 'shop_bg_ocean_desc', price: 10000 },
        { id: 'rank-bg-bubbles', nameKey: 'shop_bg_bubbles_name', descKey: 'shop_bg_bubbles_desc', price: 10000 },
        { id: 'rank-bg-toxic', nameKey: 'shop_bg_toxic_name', descKey: 'shop_bg_toxic_desc', price: 15000 },
        { id: 'rank-bg-forest', nameKey: 'shop_bg_forest_name', descKey: 'shop_bg_forest_desc', price: 15000 },
        { id: 'rank-bg-hearts', nameKey: 'shop_bg_hearts_name', descKey: 'shop_bg_hearts_desc', price: 15000 },
        { id: 'rank-bg-lightning', nameKey: 'shop_bg_lightning_name', descKey: 'shop_bg_lightning_desc', price: 25000 },
        { id: 'rank-bg-fire', nameKey: 'shop_bg_fire_name', descKey: 'shop_bg_fire_desc', price: 50000 },
        { id: 'rank-bg-sadurski', nameKey: 'shop_bg_sadurski_name', descKey: 'shop_bg_sadurski_desc', price: 75900 }
    ],
    nicks: [
        { id: 'nick-effect-ice', nameKey: 'shop_nick_ice_name', descKey: 'shop_nick_ice_desc', price: 2000 },
        { id: 'nick-effect-fire', nameKey: 'shop_nick_fire_name', descKey: 'shop_nick_fire_desc', price: 4000 },
        { id: 'nick-effect-rgb', nameKey: 'shop_nick_rgb_name', descKey: 'shop_nick_rgb_desc', price: 8000 },
        { id: 'nick-effect-glitch', nameKey: 'shop_nick_glitch_name', descKey: 'shop_nick_glitch_desc', price: 12000 }
    ],
    helmets: [
        { id: 'helmet-retro', nameKey: 'shop_helmet_retro_name', descKey: 'shop_helmet_retro_desc', price: 2000 },
        { id: 'helmet-zloty', nameKey: 'shop_helmet_gold_name', descKey: 'shop_helmet_gold_desc', price: 3000 },
    ],
    emotes: [
        { id: 'emote-sedzia', nameKey: 'shop_emote_ref_name', descKey: 'shop_emote_ref_desc', price: 1500 },
        { id: 'emote-kibic', nameKey: 'shop_emote_ultras_name', descKey: 'shop_emote_ultras_desc', price: 2500 },
        { id: 'emote-memy', nameKey: 'shop_emote_troll_name', descKey: 'shop_emote_troll_desc', price: 5000 }
    ],
    wins: [
        { id: 'win-coins', nameKey: 'shop_win_coins_name', descKey: 'shop_win_coins_desc', price: 7000 },
        { id: 'win-fireworks', nameKey: 'shop_win_fireworks_name', descKey: 'shop_win_fireworks_desc', price: 10000 }
    ]
};
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
    
    let ownedArray = []; let equipVar = ''; let equipVal = null;
    if (tab === 'backgrounds') { ownedArray = userStats.ownedBgs; equipVar = 'equippedBg'; equipVal = userStats[equipVar]; }
    else if (tab === 'nicks') { ownedArray = userStats.ownedNicks; equipVar = 'equippedNick'; equipVal = userStats[equipVar]; }
    else if (tab === 'helmets') { ownedArray = userStats.ownedHelmets; equipVar = 'equippedHelmet'; equipVal = userStats[equipVar]; }
    else if (tab === 'emotes') { ownedArray = userStats.ownedEmotes; equipVar = 'equippedEmote'; equipVal = userStats[equipVar]; }
    else if (tab === 'wins') { ownedArray = userStats.ownedWins; equipVar = 'equippedWin'; equipVal = userStats[equipVar]; }

    if (!SHOP_DB[tab] || SHOP_DB[tab].length === 0) {
        container.innerHTML = `<div class="text-dim text-center mt-20">${t('shopComingSoon')}</div>`;
        return;
    }

    if (tab !== 'backgrounds') {
        let isDefaultEquipped = equipVal === 'default' || equipVal === null;
        let defBtn = isDefaultEquipped 
            ? `<button class="shop-btn shop-btn-equipped" onclick="equipShopItem('${tab}', 'default')">${t('shopEquipped')}</button>` 
            : `<button class="shop-btn shop-btn-equip" onclick="equipShopItem('${tab}', 'default')">${t('shopEquip')}</button>`;
            
        container.innerHTML += `
            <div class="shop-item-card">
                <div>
                    <div class="shop-item-title" style="color: #fff;">${t('shopDefault')}</div>
                    <div style="font-size:10px; color:var(--text-dim); font-weight:700;">${t('shopDefaultDesc')}</div>
                </div>
                <div>${defBtn}</div>
            </div>`;
    }

    SHOP_DB[tab].forEach(item => {
        const isOwned = ownedArray.includes(item.id);
        const isEquipped = equipVal === item.id;
        
        let actionBtn = '';
        if (isEquipped) {
            let revertId = tab === 'backgrounds' ? null : 'default';
            actionBtn = `<button class="shop-btn shop-btn-equipped" onclick="equipShopItem('${tab}', '${revertId}')">${t('shopEquipped')}</button>`;
        } else if (isOwned) {
            actionBtn = `<button class="shop-btn shop-btn-equip" onclick="equipShopItem('${tab}', '${item.id}')">${t('shopEquip')}</button>`;
        } else {
            actionBtn = `<button class="shop-btn shop-btn-buy" onclick="buyShopItem('${tab}', '${item.id}', ${item.price})">${item.price} 🪙</button>`;
        }

        let customStyleClass = tab === 'nicks' ? item.id : '';
        let customBgClass = tab === 'backgrounds' ? item.id : '';
        let itemName = item.nameKey ? t(item.nameKey) : item.name;
        let itemDesc = item.descKey ? t(item.descKey) : item.desc;

        container.innerHTML += `
            <div class="shop-item-card ${customBgClass}" style="border-left: none !important;">
                <div style="text-shadow: 1px 1px 2px rgba(0,0,0,0.8);">
                    <div class="shop-item-title ${customStyleClass}" style="color: #fff;">${itemName}</div>
                    <div style="font-size:10px; color:rgba(255,255,255,0.7); font-weight:700;">${itemDesc}</div>
                </div>
                <div>${actionBtn}</div>
            </div>
        `;
    });
}

window.buyShopItem = function(category, id, price) {
    if (userStats.coins >= price) {
        userStats.coins -= price;
        if (category === 'backgrounds') { userStats.ownedBgs.push(id); userStats.equippedBg = id; }
        else if (category === 'nicks') { userStats.ownedNicks.push(id); userStats.equippedNick = id; }
        else if (category === 'helmets') { userStats.ownedHelmets.push(id); userStats.equippedHelmet = id; updateCounterDisplay(); }
        else if (category === 'emotes') { userStats.ownedEmotes.push(id); userStats.equippedEmote = id; renderClashEmotePanel(); }
        else if (category === 'wins') { userStats.ownedWins.push(id); userStats.equippedWin = id; }
        
        saveStats();
        switchShopTab(category);
        document.getElementById('shopCoinsDisplay').innerText = userStats.coins;
        showToast(t('shopBought'), "success");
        playSound('win');
    } else {
        showToast(t('shopNoCoins'), "error");
        playSound('error');
    }
}

window.equipShopItem = function(category, id) {
    if (category === 'backgrounds') userStats.equippedBg = id;
    else if (category === 'nicks') userStats.equippedNick = id;
    else if (category === 'helmets') { userStats.equippedHelmet = id; updateCounterDisplay(); }
    else if (category === 'emotes') { userStats.equippedEmote = id; renderClashEmotePanel(); }
    else if (category === 'wins') userStats.equippedWin = id;
    
    saveStats();
    switchShopTab(category);
    showToast(t('shopEquippedChanged'), "normal");
}



// ========================================================
// ====== PUBLICZNY PROFIL (PODGLĄD INNYCH GRACZY) ========
// ========================================================

async function openPublicProfile(uid, clickedNick = "Gracz") {
    if (!uid || uid.startsWith('guest_') || uid === "undefined") {
        showToast("Konta gości nie posiadają publicznego profilu.", "error");
        return;
    }

    const overlay = document.getElementById('publicProfileOverlay');
    document.getElementById('pubNick').innerText = "ŁADOWANIE...";
    document.getElementById('pubClub').innerText = "";
    document.getElementById('pubLevel').innerText = "POZIOM --";
    document.getElementById('pubPlayed').innerText = "--";
    document.getElementById('pubWon').innerText = "--";
    const defAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";
    document.getElementById('pubAvatar').src = defAvatar;

    overlay.style.display = 'block';
    setTimeout(() => overlay.style.opacity = '1', 10);

    try {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) {
            const data = doc.data();
            let parsedStats = {};
            if (data.stats) {
                try { parsedStats = JSON.parse(data.stats); } catch(e) {}
            }

            // Awatar (Bierze najpierw z roota, potem ze statystyk, na końcu domyślny)
            document.getElementById('pubAvatar').src = data.avatarUrl || parsedStats.avatarUrl || defAvatar;
            
            // Szukamy najlepszego nicku (Z roota, ze statsów, a jak nie ma, to ten z tabeli)
            let pNick = data.displayName || parsedStats.nickname || clickedNick;
            
            // Nakładamy ewentualny efekt z ulepszonego sklepu
            document.getElementById('pubNick').innerHTML = parsedStats.equippedNick && parsedStats.equippedNick !== 'default' 
                ? `<span class="${parsedStats.equippedNick}">${pNick}</span>` 
                : pNick;
            
            document.getElementById('pubClub').innerText = parsedStats.favoriteClub ? `Kibicuje: ${parsedStats.favoriteClub}` : "Brak ulubionego klubu";
            document.getElementById('pubLevel').innerText = `POZIOM ${parsedStats.level || 1}`;
            document.getElementById('pubPlayed').innerText = parsedStats.played || 0;
            document.getElementById('pubWon').innerText = parsedStats.won || 0;
            
        } else {
            showToast("Brak szczegółowych danych gracza.", "error");
            closePublicProfile();
        }
    } catch(e) {
        console.error(e);
        showToast("Błąd łączenia z chmurą.", "error");
        closePublicProfile();
    }
}

function closePublicProfile() {
    const overlay = document.getElementById('publicProfileOverlay');
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 300);
}

// ==============================================
// ====== SPLASH SCREEN & SWIPE DLA MOBILE ======
// ==============================================
function enterAppFromSplash() {
    const splash = document.getElementById('mobileSplashScreen');
    const menu = document.getElementById('mainMenuContainer');
    if (!splash || splash.classList.contains('dismissed')) return;

    splash.classList.add('dismissed');
    if (menu) {
        menu.classList.add('menu-visible');
    }
    sessionStorage.setItem('speedwaySplashPassed', 'true');
}

function initMobileSplash() {
    const splash = document.getElementById('mobileSplashScreen');
    const menu = document.getElementById('mainMenuContainer');
    if (!splash) return;

    // Jeśli gracz już przeszedł ekran powitalny w tej sesji (np. po powrocie z meczu)
    if (sessionStorage.getItem('speedwaySplashPassed') === 'true') {
        splash.style.display = 'none';
        if (menu) menu.classList.add('menu-visible');
        return;
    }

    let touchStartY = 0;
    splash.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    splash.addEventListener('touchend', (e) => {
        const diff = touchStartY - e.changedTouches[0].clientY;
        if (diff > 45) { // Przesunięcie w górę (Swipe up)
            enterAppFromSplash();
        }
    }, { passive: true });

    splash.addEventListener('wheel', (e) => {
        if (e.deltaY > 20) {
            enterAppFromSplash();
        }
    }, { passive: true });
}

function toggleMobileDailyAccordion() {
    const sub = document.getElementById('mobileDailySubmenu');
    if (sub) {
        sub.classList.toggle('expanded');
    }
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
    window.openMissionsModal = openMissionsModal;
    window.closeMissionsModal = closeMissionsModal;
    window.openShopModal = openShopModal;
    window.closeShopModal = closeShopModal;
    window.toggleMobileDailyAccordion = toggleMobileDailyAccordion;
    window.enterAppFromSplash = enterAppFromSplash;
    window.addEventListener('DOMContentLoaded', initMobileSplash);
    window.showPrivacyPolicy = showPrivacyPolicy;
    window.closePrivacyPolicy = closePrivacyPolicy;
    window.showTerms = showTerms;
    window.closeTerms = closeTerms;
    window.applyTheme = applyTheme;
    window.setTheme = setTheme;
    window.setLang = setLang;
    
} catch (e) {
    console.error("Global export error:", e);
}