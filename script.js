// ==============================================
// ====== ZMIENNE GLOBALNE I KONFIGURACJA =======
// ==============================================

let gameMode = 'endless'; let guessCount = 0;
let guessHistory = []; let guessedPlayersNames = []; 
let currentDailyDay = 1; let selectedDailyDay = 1; let dailyNumberGlobal = "";
let hasWon = false; let hasLost = false; let isRestoring = false;
let calRenderMonth = new Date().getMonth(); let calRenderYear = new Date().getFullYear();
const GUESS_LIMIT = 10; 
const DAILY_START_DATE = new Date('2024-01-01T00:00:00');

let hintActive = false; 
let hintsUsedCount = 0; // Wpłynie na pozycję w rankingu
// Rozbudowane statystyki o historię Clash
let userStats = { 
    played: 0, won: 0, currentStreak: 0, maxStreak: 0, 
    dailyResults: {}, dailyHistory: [], dailyGuesses: {}, recentEndless: [], 
    clashLeague: { matchesPlayed: 0, wins: 0, losses: 0, draws: 0, elo: 1000 },
    clashHistory: [] // Punkt 3: Historia meczów
};

let playerNickname = localStorage.getItem('speedwayNickname') || null;
window.hasUpdatedLeague = false; 

// --- FIREBASE CONFIG ---
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

// Dopiero po włączeniu, możemy pobrać bazę i funkcje:
const db = firebase.firestore();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
const functions = firebase.functions(); 

let playerId = localStorage.getItem('speedwayUserId');
if (!playerId) {
    playerId = 'guest_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('speedwayUserId', playerId);
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

const CURRENT_GAME_VERSION = "Alpha v1.1.0";

const changelog = {
    pl: [
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

auth.onAuthStateChanged((user) => {
    if (user) {
        playerId = user.uid;
        if (!playerNickname || playerNickname.startsWith('guest_') || playerNickname === "GoogleUser") {
            playerNickname = user.displayName || "Gracz";
            localStorage.setItem('speedwayNickname', playerNickname);
        }
        localStorage.setItem('speedwayUserId', playerId);
        updateAuthUI(user);
        syncStatsFromFirebase();
    } else {
        updateAuthUI(null);
    }
});

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
        btn.innerHTML = i18n[currentLang].btnLogout || "WYLOGUJ SIĘ";
        btn.onclick = logOut;
        btn.style.background = "#e74c3c";
        info.innerText = `Konto Google: ${user.displayName}`;
        info.style.display = 'block';
    } else {
        btn.innerHTML = `<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" width="16" height="16" alt="G"> ` + (i18n[currentLang].btnLoginGoogle || "ZALOGUJ PRZEZ GOOGLE");
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
        }
    } catch (e) { console.error("Cloud Sync Load Error:", e); }
}


function ensureLeagueStats(stats) {
    if (!stats.clashLeague) {
        stats.clashLeague = { matchesPlayed: 0, wins: 0, losses: 0, draws: 0, elo: 1000 };
    }
    if (typeof stats.clashLeague.matchesPlayed !== 'number') stats.clashLeague.matchesPlayed = 0;
    if (typeof stats.clashLeague.wins !== 'number') stats.clashLeague.wins = 0;
    if (typeof stats.clashLeague.losses !== 'number') stats.clashLeague.losses = 0;
    if (typeof stats.clashLeague.draws !== 'number') stats.clashLeague.draws = 0;
    if (typeof stats.clashLeague.elo !== 'number') stats.clashLeague.elo = 1000;
    return stats;
}
// Zmiana w ensureLeagueStats - dodajemy zmienne dla banów
function ensureLeagueStats(stats) {
    if (!stats.clashLeague) stats.clashLeague = { matchesPlayed: 0, wins: 0, losses: 0, draws: 0, elo: 1000 };
    if (typeof stats.clashLeague.abandons !== 'number') stats.clashLeague.abandons = 0; // Licznik przewinień
    if (typeof stats.clashLeague.banUntil !== 'number') stats.clashLeague.banUntil = 0; // Czas trwania bana
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

async function syncLeagueScoreToFirebase() {
    if (!playerId) return; // Otwieramy bramki! Teraz wpuszcza i graczy Google, i Gości.
    const league = ensureLeagueStats(userStats).clashLeague;
    try {
        await db.collection('leaderboard_clash_beta').doc(playerId).set({
            nick: playerNickname || 'Gracz',
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

function openProfile() {
    document.getElementById('profileStatPlayed').innerText = userStats.played; 
    document.getElementById('profileStatWon').innerText = userStats.won;
    document.getElementById('profileStatStreak').innerText = userStats.currentStreak; 
    document.getElementById('profileStatMax').innerText = userStats.maxStreak;
    document.getElementById('changeNickInput').value = playerNickname || "";
    
    renderAchievements();
    
    const overlay = document.getElementById('profileOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    
}

function closeProfile() {
    const overlay = document.getElementById('profileOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
}

// ==============================================
// ====== SYSTEM OSIĄGNIĘĆ (GABLOTA) ============
// ==============================================

const ACHIEVEMENTS_DB = [
    { id: 'first_try', icon: '🦅', title: 'Sokole Oko', desc: 'Zgadnij zawodnika w 1. próbie' },
    { id: 'streak_7', icon: '🔥', title: 'Weteran', desc: 'Osiągnij Win Streak równy 7' },
    { id: 'no_hint_5', icon: '🧠', title: 'Bystrzak', desc: 'Wygraj 5 razy bez podpowiedzi' },
    { id: 'clash_10', icon: '⚔️', title: 'Gladiator', desc: 'Wygraj 10 meczów w Clashu' },
    { id: 'play_50', icon: '🕹️', title: 'Maniak', desc: 'Rozegraj łącznie 50 gier' },
    { id: 'clash_legend', icon: '👑', title: 'Legenda', desc: 'Osiągnij rangę Legenda' }
];

function ensureAchievementsStats() {
    if(!userStats.achievements) userStats.achievements = [];
    if(!userStats.trackers) userStats.trackers = { winsNoHint: 0 };
}

// Funkcja sprawdzająca czy właśnie coś odblokowaliśmy
function checkAchievements() {
    ensureAchievementsStats();
    let unlockedAny = false;

    // Definicje warunków
    const conditions = {
        'first_try': () => hasWon && guessCount === 1,
        'streak_7': () => userStats.currentStreak >= 7,
        'no_hint_5': () => userStats.trackers.winsNoHint >= 5,
        'clash_10': () => userStats.clashLeague.wins >= 10,
        'play_50': () => userStats.played >= 50,
        'clash_legend': () => userStats.clashLeague.elo >= 4001
    };

    Object.keys(conditions).forEach(id => {
        if (!userStats.achievements.includes(id) && conditions[id]()) {
            userStats.achievements.push(id);
            const ach = ACHIEVEMENTS_DB.find(a => a.id === id);
            // Piękne powiadomienie Toast!
            setTimeout(() => showToast(`🏆 Osiągnięcie: ${ach.title}!`, 'success'), 1000);
            unlockedAny = true;
        }
    });

    if(unlockedAny) saveStats();
}

// Rysowanie gabloty w Profilu
function renderAchievements() {
    ensureAchievementsStats();
    const container = document.getElementById('achievementsGrid');
    if (!container) return;
    
    container.innerHTML = '';
    ACHIEVEMENTS_DB.forEach(ach => {
        const isUnlocked = userStats.achievements.includes(ach.id);
        const lockClass = isUnlocked ? '' : 'locked';
        
        container.innerHTML += `
            <div class="ach-badge ${lockClass}" title="${ach.desc}">
                <div class="ach-icon">${isUnlocked ? ach.icon : '🔒'}</div>
                <div class="ach-title">${ach.title}</div>
                <div class="ach-desc">${ach.desc}</div>
            </div>
        `;
    });
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
    if (!str) return "";
    return str.replace(/[&<>'"]/g, 
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

const i18n = {
    pl: {
        account: "TWÓJ PROFIL", loginDesc: "Zaloguj się przez Google, aby zsynchronizować postęp i wejść do rankingu!", btnLoginGoogle: "ZALOGUJ PRZEZ GOOGLE", orGuest: "LUB PODAJ NICK GOŚCIA", guestPlaceholder: "Wpisz nick (max 12 znaków)", btnSavePlay: "ZAPISZ I GRAJ", btnLogout: "WYLOGUJ SIĘ",
        settingsTitle: "USTAWIENIA", sound: "Dźwięk:", soundOn: "Włączony 🔊", soundOff: "Wyłączony 🔇",
        subtitle: "Edycja Żużlowa", lastGames: "Ostatnie gry Daily:", btnDaily: "Graj Daily", btnReview: "Przejrzyj grę", btnEndless: "Endless Guessr", searchPlaceholder: "Wpisz imię/nazwisko zawodnika...", btnGuess: "ZGADNIJ",
        teams: "Drużyny:", colName: "Zawodnik", colCountry: "Kraj", colYear: "Rok ur.", colGP: "W GP?", colDMP: "Medale DMP", colStatus: "Status", colClubs: "Historia Klubów",
        stats: "STATYSTYKI", statPlayed: "Rozegrane", statWon: "Wygrane", statStreak: "Obecna Seria", statMax: "Najlepsza Seria", btnClose: "ZAMKNIJ", archive: "ARCHIWUM DAILY",
        winTitle: "BRAWO!", winSub: "Odgadłeś zawodnika!", loseTitle: "KONIEC PRÓB", loseSub: "Niestety, nie udało Ci się odgadnąć.", btnShare: "UDOSTĘPNIJ 📋", btnPlayEndless: "GRAJ W TRYB ENDLESS", btnPlayAgain: "ZAGRAJ PONOWNIE", btnMenu: "MENU GŁÓWNE", theme: "Motyw:", themeLight: "Jasny", themeDark: "Ciemny", lang: "Język:", modeDaily: "Tryb: Daily", modeEndless: "Tryb: Endless",
        tabDaily: "DZIENNY", tabWeekly: "TYDZIEŃ", tabMonthly: "MIESIĄC", tabAllTime: "OGÓLNY", rankWonToday: "Wygrane", rankTotalWins: "Suma Wygranych", rankGuesses: "Próby",
        months: ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"], weekdays: ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"],
        clashTitle: "⚔️ Speedway Clash", clashChooseMode: "Wybierz tryb gry", clashElo: "Graj o ELO", clashWip: "(WORK IN PROGRESS...)", clashFriendly: "Mecz Towarzyski", clashFriendlyDesc: "(Graj ze znajomym)", clashLobbyTitle: "🤝 Mecz Towarzyski", clashHost: "UTWÓRZ POKÓJ (HOST)", clashJoinCode: "KOD POKOJU...", clashJoinBtn: "DOŁĄCZ", clashYourCode: "Twój kod pokoju:", clashWaiting: "Oczekiwanie na przeciwnika...", clashReady: "JESTEM GOTÓW", clashTime: "Czas na odpowiedź:", clashSurrender: "PODDAJ SIĘ / WYJDŹ", clashClaim: "PRZEJMIJ POLE", clashConfirm: "POTWIERDŹ", clashCancel: "ANULUJ", clashSeries: "WYNIK SERII", clashRematch: "ZAGRAJ REWANŻ", clashQuit: "ZAKOŃCZ I WYJDŹ", clashRulesTitle: "Zasady gry: Speedway Clash ⚔️", clashRules1: "Gra toczy się na planszy 3x3 na zasadach 'Kółko i Krzyżyk'.", clashRules2: "Aby przejąć pole, kliknij w nie i podaj zawodnika, który reprezentował oba krzyżujące się kluby.", clashRules3: "Pamiętaj, że liczy się cała polska historia zawodnika (bez zagranicznych lig).", clashRules4: "Masz 2 minuty na odpowiedź! Jeśli czas minie lub podasz złą odpowiedź, tracisz turę.", clashRules5: "Wygrywa gracz, który jako pierwszy połączy 3 swoje pola w linii!", clashUnderstood: "ZROZUMIANO", clashGuessPlaceholder: "Imię i nazwisko zawodnika...", clashWaitBtn: "OCZEKIWANIE...", clashWaitP2: "CZEKANIE NA DRUGIEGO GRACZA...",
        // NOWE TŁUMACZENIA DESKTOP
        dToday: "DZISIEJSZA GRA ►", dArchive: "ARCHIWUM DAILY", dLeague: "MECZ LIGOWY ►", dFriendly: "MECZ TOWARZYSKI", dLocal: "GRA LOKALNA (1 PC)", dSettings: "USTAWIENIA", dProfile: "PROFIL", missingRider: "💡 Brak zawodnika?", reportBug: "🐛 Zgłoś błąd"
    },
    en: {
        account: "YOUR PROFILE", loginDesc: "Log in with Google to sync progress and enter the leaderboard!", btnLoginGoogle: "LOGIN WITH GOOGLE", orGuest: "OR ENTER GUEST NICK", guestPlaceholder: "Enter nick (max 12 chars)", btnSavePlay: "SAVE & PLAY", btnLogout: "LOGOUT",
        settingsTitle: "SETTINGS", sound: "Sound:", soundOn: "On 🔊", soundOff: "Off 🔇",
        subtitle: "Speedway Edition", lastGames: "Recent Daily games:", btnDaily: "Play Daily", btnReview: "Review game", btnEndless: "Endless Guessr", searchPlaceholder: "Enter rider's name...", btnGuess: "GUESS",
        teams: "Teams:", colName: "Rider", colCountry: "Country", colYear: "Born", colGP: "SGP?", colDMP: "Team Medals", colStatus: "Status", colClubs: "Clubs History",
        stats: "STATISTICS", statPlayed: "Played", statWon: "Won", statStreak: "Current Streak", statMax: "Max Streak", btnClose: "CLOSE", archive: "DAILY ARCHIVE",
        winTitle: "BRAVO!", winSub: "You guessed the rider!", loseTitle: "OUT OF TRIES", loseSub: "Unfortunately, you didn't guess the rider.", btnShare: "SHARE 📋", btnPlayEndless: "PLAY ENDLESS", btnPlayAgain: "PLAY AGAIN", btnMenu: "MAIN MENU", theme: "Theme:", themeLight: "Light", themeDark: "Dark", lang: "Language:", modeDaily: "Mode: Daily", modeEndless: "Mode: Endless",
        tabDaily: "DAILY", tabWeekly: "WEEK", tabMonthly: "MONTH", tabAllTime: "OVERALL", rankWonToday: "Wins", rankTotalWins: "Total Wins", rankGuesses: "Guesses",
        months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], weekdays: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
        clashTitle: "⚔️ Speedway Clash", clashChooseMode: "Choose game mode", clashElo: "Play for ELO", clashWip: "(WORK IN PROGRESS...)", clashFriendly: "Friendly Match", clashFriendlyDesc: "(Play with a friend)", clashLobbyTitle: "🤝 Friendly Match", clashHost: "CREATE ROOM (HOST)", clashJoinCode: "ROOM CODE...", clashJoinBtn: "JOIN", clashYourCode: "Your room code:", clashWaiting: "Waiting for opponent...", clashReady: "I'M READY", clashTime: "Time to answer:", clashSurrender: "SURRENDER / LEAVE", clashClaim: "CLAIM CELL", clashConfirm: "CONFIRM", clashCancel: "CANCEL", clashSeries: "SERIES SCORE", clashRematch: "PLAY REMATCH", clashQuit: "QUIT AND LEAVE", clashRulesTitle: "Rules: Speedway Clash ⚔️", clashRules1: "The game is played on a 3x3 grid like Tic-Tac-Toe.", clashRules2: "To claim a cell, click it and guess a rider who represented both intersecting clubs.", clashRules3: "Remember, only the Polish league history counts.", clashRules4: "You have 2 minutes to answer! Wrong guess or timeout means you lose your turn.", clashRules5: "Connect 3 cells in a line to win!", clashUnderstood: "UNDERSTOOD", clashGuessPlaceholder: "Rider's name and surname...", clashWaitBtn: "WAITING...", clashWaitP2: "WAITING FOR OPPONENT...",
        // NOWE TŁUMACZENIA DESKTOP
        dToday: "TODAY'S GAME ►", dArchive: "DAILY ARCHIVE", dLeague: "LEAGUE MATCH ►", dFriendly: "FRIENDLY MATCH", dLocal: "LOCAL PLAY (1 PC)", dSettings: "SETTINGS", dProfile: "PROFILE", missingRider: "💡 Missing rider?", reportBug: "🐛 Report a bug"
    },
    sv: {
        account: "DIN PROFIL", loginDesc: "Logga in med Google för att synkronisera framsteg och delta i rankningen!", btnLoginGoogle: "LOGGA IN MED GOOGLE", orGuest: "ELLER ANGE GÄSTNICK", guestPlaceholder: "Ange nick (max 12 teck)", btnSavePlay: "SPARA & SPELA", btnLogout: "LOGGA UT",
        settingsTitle: "INSTÄLLNINGAR", sound: "Ljud:", soundOn: "På 🔊", soundOff: "Av 🔇",
        subtitle: "Speedway Edition", lastGames: "Senaste Daily:", btnDaily: "Spela Daily", btnReview: "Granska spel", btnEndless: "Endless Guessr", searchPlaceholder: "Ange förarens namn...", btnGuess: "GISSA",
        teams: "Klubbar:", colName: "Förare", colCountry: "Land", colYear: "Född", colGP: "SGP?", colDMP: "Lagmedaljer", colStatus: "Status", colClubs: "Klubbhistorik",
        stats: "STATISTIK", statPlayed: "Spelade", statWon: "Vunna", statStreak: "Aktuell Svit", statMax: "Bästa Svit", btnClose: "STÄNG", archive: "DAILY ARKIV",
        winTitle: "BRAVO!", winSub: "Du gissade föraren!", loseTitle: "INGA FÖRSÖK", loseSub: "Tyvärr, du gissade inte föraren.", btnShare: "DELA 📋", btnPlayEndless: "SPELA ENDLESS", btnPlayAgain: "SPELA IGEN", btnMenu: "HUVUDMENY", theme: "Tema:", themeLight: "Ljust", themeDark: "Mörkt", lang: "Språk:", modeDaily: "Läge: Daily", modeEndless: "Läge: Endless",
        tabDaily: "DAGLIG", tabWeekly: "VECKA", tabMonthly: "MÅNAD", tabAllTime: "ALLMÄN", rankWonToday: "Vinster", rankTotalWins: "Totala Vinster", rankGuesses: "Gissningar",
        months: ["Januari", "Februari", "Mars", "April", "Maj", "Juni", "Juli", "Augusti", "September", "Oktober", "November", "December"], weekdays: ["Må", "Ti", "On", "To", "Fr", "Lö", "Sö"],
        clashTitle: "⚔️ Speedway Clash", clashChooseMode: "Välj spelläge", clashElo: "Spela för ELO", clashWip: "(WORK IN PROGRESS...)", clashFriendly: "Vänskapsmatch", clashFriendlyDesc: "(Spela med en vän)", clashLobbyTitle: "🤝 Vänskapsmatch", clashHost: "SKAPA RUM (HOST)", clashJoinCode: "RUMKOD...", clashJoinBtn: "GÅ MED", clashYourCode: "Din rumkod:", clashWaiting: "Väntar på motståndare...", clashReady: "JAG ÄR REDO", clashTime: "Tid att svara:", clashSurrender: "GE UPP / LÄMNA", clashClaim: "TA ÖVER RUTA", clashConfirm: "BEKRÄFTA", clashCancel: "AVBRYT", clashSeries: "SERIERESULTAT", clashRematch: "SPELA RETURMATCH", clashQuit: "AVSLUTA OCH LÄMNA", clashRulesTitle: "Regler: Speedway Clash ⚔️", clashRules1: "Spelet spelas på ett 3x3 rutnät som Luffarschack.", clashRules2: "För att ta över en ruta, klicka på den och gissa en förare som representerat båda klubbarna.", clashRules3: "Kom ihåg att endast den polska ligahistoriken räknas.", clashRules4: "Du har 2 minuter på dig att svara! Vid fel gissning eller om tiden går ut förlorar du din tur.", clashRules5: "Anslut 3 rutor i rad för att vinna!", clashUnderstood: "FÖRSTÅTT", clashGuessPlaceholder: "Förarens för- och efternamn...", clashWaitBtn: "VÄNTAR...", clashWaitP2: "VÄNTAR PÅ MOTSTÅNDARE...",
        // NOWE TŁUMACZENIA DESKTOP
        dToday: "DAGENS SPEL ►", dArchive: "DAILY ARKIV", dLeague: "LIGAMATCH ►", dFriendly: "VÄNSKAPSMATCH", dLocal: "LOKAL SPEL (1 PC)", dSettings: "INSTÄLLNINGAR", dProfile: "PROFIL", missingRider: "💡 Saknad förare?", reportBug: "🐛 Rapportera ett fel"
    },
    da: {
        account: "DIN PROFIL", loginDesc: "Log ind med Google for at synkronisere fremskridt og deltage i ranglisten!", btnLoginGoogle: "LOG IND MED GOOGLE", orGuest: "ELLER INDTAST GÆSTENICK", guestPlaceholder: "Indtast nick...", btnSavePlay: "GEM & SPIL", btnLogout: "LOG UD",
        settingsTitle: "INDSTILLINGER", sound: "Lyd:", soundOn: "Til 🔊", soundOff: "Fra 🔇",
        subtitle: "Speedway Edition", lastGames: "Seneste Daily:", btnDaily: "Spil Daily", btnReview: "Gennemse spil", btnEndless: "Endless Guessr", searchPlaceholder: "Indtast kørers navn...", btnGuess: "GÆT",
        teams: "Hold:", colName: "Kører", colCountry: "Land", colYear: "Født", colGP: "SGP?", colDMP: "Holdmedaljer", colStatus: "Status", colClubs: "Klubhistorik",
        stats: "STATISTIK", statPlayed: "Spillet", statWon: "Vundet", statStreak: "Nuværende Stime", statMax: "Bedste Stime", btnClose: "LUK", archive: "DAILY ARKIV",
        winTitle: "BRAVO!", winSub: "Du gættede køreren!", loseTitle: "INGEN FORSØG", loseSub: "Desværre gættede du ikke køreren.", btnShare: "DEL 📋", btnPlayEndless: "SPIL ENDLESS", btnPlayAgain: "SPIL IGEN", btnMenu: "HOVEDMENU", theme: "Tema:", themeLight: "Lyst", themeDark: "Mørkt", lang: "Sprog:", modeDaily: "Tilstand: Daily", modeEndless: "Tilstand: Endless",
        tabDaily: "DAGLIG", tabWeekly: "UGE", tabMonthly: "MÅNED", tabAllTime: "GENEREL", rankWonToday: "Sejre", rankTotalWins: "Samlede Sejre", rankGuesses: "Gæt",
        months: ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli", "August", "September", "Oktober", "November", "December"], weekdays: ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"],
        clashTitle: "⚔️ Speedway Clash", clashChooseMode: "Vælg spiltilstand", clashElo: "Spil om ELO", clashWip: "(WORK IN PROGRESS...)", clashFriendly: "Venskabskamp", clashFriendlyDesc: "(Spil med en ven)", clashLobbyTitle: "🤝 Venskabskamp", clashHost: "OPRET RUM (HOST)", clashJoinCode: "RUMKODE...", clashJoinBtn: "TILSLUT", clashYourCode: "Din rumkode:", clashWaiting: "Venter på modstander...", clashReady: "JEG ER KLAR", clashTime: "Tid til at svare:", clashSurrender: "GIV OP / FORLAD", clashClaim: "OVERTAG FELT", clashConfirm: "BEKRÆFT", clashCancel: "ANNULLER", clashSeries: "SERIERESULTAT", clashRematch: "SPIL REVANCHE", clashQuit: "AFSLUT OG FORLAD", clashRulesTitle: "Regler: Speedway Clash ⚔️", clashRules1: "Spillet spilles på et 3x3 gitter som Kryds og Bolle.", clashRules2: "For at overtage et felt skal du klikke på det og gætte en kører, der har repræsenteret begge klubber.", clashRules3: "Husk, at kun den polska ligahistorie tæller.", clashRules4: "Du har 2 minutter til at svare! Forkert gæt eller timeout betyder, at du mister din tur.", clashRules5: "Forbind 3 felter på stribe for at vinde!", clashUnderstood: "FORSTÅET", clashGuessPlaceholder: "Kørerens for- og efternavn...", clashWaitBtn: "VENTER...", clashWaitP2: "VENTER PÅ MODSTANDER...",
        // NOWE TŁUMACZENIA DESKTOP
        dToday: "DAGENS SPIL ►", dArchive: "DAILY ARKIV", dLeague: "LIGAKAMP ►", dFriendly: "VENSKABSKAMP", dLocal: "LOKALT SPIL (1 PC)", dSettings: "INDSTILLINGER", dProfile: "PROFIL", missingRider: "💡 Manglende kører?", reportBug: "🐛 Rapporter en fejl"
    }
};

let currentLang = localStorage.getItem('speedwayLang') || 'pl';

function setLang(lang) {
    try {
        console.log('setLang called:', lang);
    } catch (e) {}
    currentLang = i18n[lang] ? lang : 'pl';
    localStorage.setItem('speedwayLang', currentLang);
    document.querySelectorAll('.lang-flag').forEach(el => el.classList.remove('active'));
    const flagEl = document.getElementById('flag-' + currentLang); if(flagEl) flagEl.classList.add('active');

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

    // Tooltip keys mapping (data-i18n-tip -> data-tip)
    document.querySelectorAll('[data-i18n-tip]').forEach(el => {
        const tipKey = el.getAttribute('data-i18n-tip');
        if (tipKey && strings[tipKey]) el.setAttribute('data-tip', strings[tipKey]);
    });

    try { console.log(`i18n: applied ${applied}/${nodes.length} elements; missing keys:`, Array.from(missing).slice(0,20)); } catch (e) {}
    updateDailyMenu(); updateSoundBtn(); updateAuthUI(auth.currentUser);
    if(document.getElementById('calendarOverlay').style.display === 'block') renderCalendar();
    
    renderUpdates();
    
    const modeDisplay = document.getElementById('gameModeDisplay');
    if (gameMode === 'daily') modeDisplay.innerText = `${i18n[currentLang].modeDaily} ${dailyNumberGlobal}`;
    else modeDisplay.innerText = i18n[currentLang].modeEndless;
}

// Ensure function is available from inline onclick handlers in HTML
try { window.setLang = setLang; } catch (e) {}

// ==============================================
// ====== AUDIO, UI I START GRY =================
// ==============================================

let audioCtx = null;
let soundEnabled = localStorage.getItem('speedwaySound') !== 'false';
function toggleSound() { soundEnabled = !soundEnabled; localStorage.setItem('speedwaySound', soundEnabled); updateSoundBtn(); }
function updateSoundBtn() {
    const btn = document.getElementById('btnSoundToggle');
    if (btn) { btn.innerHTML = soundEnabled ? i18n[currentLang].soundOn : i18n[currentLang].soundOff; btn.className = soundEnabled ? "theme-btn light" : "theme-btn dark"; }
}

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
window.onload = function() { 
    setRandomBackground();
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
    }
    ensureLeagueStats(userStats);
    
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
function setTheme(themeName) { document.documentElement.setAttribute('data-theme', themeName); localStorage.setItem('theme', themeName); }


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
        // Dodajemy 'hints: hintsUsedCount'
        batch.set(dailyRef, { nick: safeNick, won: isWin ? 1 : 0, guesses: attempts, hints: hintsUsedCount, timestamp: ts }, { merge: true });
        const increment = firebase.firestore.FieldValue.increment;
        const winIncrement = isWin ? 1 : 0; // Dodaje 1 jeśli wygrana, 0 jeśli przegrana
        
        // Zapis do tabel sumarycznych (zawsze dodaje próby, ale wygrane tylko jeśli isWin == true)
        const weeklyRef = db.collection("leaderboard_weekly").doc(getCurrentWeekStr()).collection("scores").doc(playerId);
        batch.set(weeklyRef, { nick: safeNick, wins: increment(winIncrement), guesses: increment(attempts), timestamp: ts }, { merge: true });
        
        const monthlyRef = db.collection("leaderboard_monthly").doc(getCurrentMonthStr()).collection("scores").doc(playerId);
        batch.set(monthlyRef, { nick: safeNick, wins: increment(winIncrement), guesses: increment(attempts), timestamp: ts }, { merge: true });
        
        const alltimeRef = db.collection("leaderboard_alltime").doc("global").collection("scores").doc(playerId);
        batch.set(alltimeRef, { nick: safeNick, wins: increment(winIncrement), guesses: increment(attempts), timestamp: ts }, { merge: true });
        
        await batch.commit();
    } catch (e) { console.error("DB Error:", e); }
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

// ==============================================
// ====== SEJF ZAWODNIKA (ANTI-PODGLĄDANIE)======
// ==============================================
// ZMIENNE SERWEROWE
let currentEndlessSeed = Math.random() * 10000;
let serverTargetClubs = [];
let serverTargetStatus = "";
let serverTargetStats = null;
let serverTargetName = "";

async function initGame() {
    const modeDisplay = document.getElementById('gameModeDisplay'); 
    const controls = document.getElementById('gameDailyControls'); 
    const inputSec = document.querySelector('.input-section');
    if (!modeDisplay || !controls || !inputSec) return;

    inputSec.style.display = 'none'; 
    document.getElementById('mysteryName').innerText = "Ładowanie gry...";

    if (gameMode === 'daily') {
        controls.style.display = 'flex'; 
        dailyNumberGlobal = getDailyDateString(selectedDailyDay);
        modeDisplay.innerText = `${i18n[currentLang].modeDaily} ${dailyNumberGlobal}`;
    } else {
        controls.style.display = 'none';
        currentEndlessSeed = Math.floor(Math.random() * 2147483647);
        modeDisplay.innerText = i18n[currentLang].modeEndless;
    }

    try {
        const initGameDataFunc = functions.httpsCallable('initGameData');
        const response = await initGameDataFunc({ 
            gameMode: gameMode, 
            dailyDay: selectedDailyDay, 
            endlessSeed: currentEndlessSeed, 
            playerId: playerId 
        });

        serverTargetClubs = response.data.pastClubs; 
        serverTargetStatus = response.data.status; 
        serverTargetStats = response.data.targetStats;
        
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

    } catch (e) { showToast("Błąd połączenia z serwerem", "error"); }
}

// Przywracanie wpisanych zawodników w niezakończonej grze Daily
function restoreInProgressDaily() {
    isRestoring = true; 
    buildTeamPath(); // Najpierw budujemy czystą ścieżkę z pytajnikami
    
    const pastGuesses = userStats.dailyGuesses[selectedDailyDay] || [];
    
    pastGuesses.forEach(pName => { 
        const p = playersDB.find(x => x.name === pName); 
        if(p) { 
            guessCount++; 
            guessedPlayersNames.push(p.name); 
            renderGuess(p, null, true); // True oznacza że przywracamy (nie grają dźwięki)
            
            // KLUCZOWY MOMENT: Wywołujemy funkcję sprawdzającą, która na bieżąco 
            // odkrywa kluby na górnym pasku na podstawie przywróconego zawodnika!
            revealClubsOnPath(p); 
        } 
    });
    
    updateCounterDisplay(); 
    
    // Przywrócenie widoczności przycisków pomocniczych, jeśli gracz zdążył do nich dojść w trakcie tej gry
    if (guessCount >= 5 && !hintActive) document.getElementById('btnHint').style.display = 'inline-block';
    if (guessCount >= 7) document.getElementById('btnGiveUp').style.display = 'inline-block';
    
    isRestoring = false;
}

async function restorePlayedGame() {
    isRestoring = true; 
    buildTeamPath(); 
    const pastGuesses = userStats.dailyGuesses[selectedDailyDay] || [];
    
    try {
        // Musimy też pobrać Imię z serwera, skoro gra jest zakończona
        const ans = await functions.httpsCallable('getAnswer')({ gameMode, dailyDay: selectedDailyDay, endlessSeed: currentEndlessSeed, playerId });
        serverTargetName = ans.data.name;
    } catch(e) { console.error(e); }

    if (pastGuesses.length === 0) { 
        document.getElementById('results').innerHTML = `<div style="text-align: center; margin-top: 30px; color: var(--text-dim); font-weight: 600;">Brak zapisu dla tego dnia.</div>`; 
    } else { 
        pastGuesses.forEach(pName => { 
            const p = playersDB.find(x => x.name === pName); 
            if(p) { 
                guessCount++; 
                guessedPlayersNames.push(p.name); 
                // Podajemy null jako drugi argument, aby renderGuess pobrało zaktualizowane serverTargetStats
                renderGuess(p, null, true); 
                revealClubsOnPath(p); 
            } 
        }); 
    }
    
    updateCounterDisplay(); 
    hasWon = userStats.dailyResults[selectedDailyDay] === 'win'; 
    hasLost = userStats.dailyResults[selectedDailyDay] === 'loss'; 
    revealTargetInfoUI(); 
    
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

document.addEventListener("click", function (e) { if (e.target.id !== "guessInput" && e.target.id !== "clashGuessInput") closeAllLists(); });

function closeAllLists() { let items = document.getElementsByClassName("autocomplete-items"); while (items.length > 0) items[0].parentNode.removeChild(items[0]); }

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
    const pathContainer = document.getElementById('pathBoxes'); pathContainer.innerHTML = ''; 
    serverTargetClubs.forEach((club, index) => { // ZMIANA
        const box = document.createElement('div'); box.className = 'path-box'; box.innerText = '?'; 
        box.dataset.index = index; 
        pathContainer.appendChild(box);
        if (index < serverTargetClubs.length - 1) { const arrow = document.createElement('div'); arrow.className = 'path-arrow'; arrow.innerText = '→'; pathContainer.appendChild(arrow); }
    });
    if (serverTargetStatus.toLowerCase().includes("koniec") || serverTargetStatus === "Ś.P.") { // ZMIANA
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
    
    const btn = document.querySelector('.search-box button');
    const originalBtnText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "SPRAWDZAM...";

    try {
        const checkGuessFunc = functions.httpsCallable('checkGuess');
        const response = await checkGuessFunc({
            guessedPlayerId: guessedPlayerLocal.id,
            gameMode: gameMode,
            dailyDay: selectedDailyDay,
            endlessSeed: currentEndlessSeed,
            playerId: playerId,
            guessCount: guessCount // Wysyłamy do serwera, ile prób już zrobiono
        });

        const result = response.data;
        currentTargetInfo = result.targetStats || currentTargetInfo;

        guessedPlayersNames.push(guessedPlayerLocal.name); 
        playSound('guess');
        
        if (gameMode === 'daily') { 
            if (!userStats.dailyGuesses[selectedDailyDay]) userStats.dailyGuesses[selectedDailyDay] = []; 
            userStats.dailyGuesses[selectedDailyDay].push(guessedPlayerLocal.name); 
            saveStats(); 
        }
        
        guessCount++; 
        updateCounterDisplay(); 
        
        // Zabezpieczenie przed błędem z Firebase (serwer daje nam id trafionego w isWin!)
        const isWinningGuess = result.isWin;

        renderGuess(guessedPlayerLocal, result.targetStats, false, isWinningGuess); 
        revealClubsOnPath(guessedPlayerLocal); 
        document.getElementById('guessInput').value = "";
        
        // Zarządzanie podpowiedziami (Przycisk)
        if (guessCount === 5 && !hintActive && !isWinningGuess) {
            document.getElementById('btnHint').style.display = 'inline-block';
            showToast("Możesz użyć podpowiedzi!", "normal");
        }
        if (guessCount >= 7 && !isWinningGuess) {
            document.getElementById('btnGiveUp').style.display = 'inline-block';
        }

        // Aktualizacja tekstu podpowiedzi
        if (hintActive && !isWinningGuess && result.hintText) {
            document.getElementById('mysteryName').innerText = result.hintText;
        }

        if (isWinningGuess) { 
            const ans = await functions.httpsCallable('getAnswer')({ gameMode, dailyDay: selectedDailyDay, endlessSeed: currentEndlessSeed, playerId });
            serverTargetName = ans.data.name;
            updateStatsOnWin(); 
            setTimeout(() => handleWin(), 1400); 
        } else if (guessCount >= GUESS_LIMIT) { 
            const ans = await functions.httpsCallable('getAnswer')({ gameMode, dailyDay: selectedDailyDay, endlessSeed: currentEndlessSeed, playerId });
            serverTargetName = ans.data.name;
            updateStatsOnLoss(); 
            setTimeout(handleLoss, 1400); 
        }

    } catch(e) {
        showToast("Błąd serwera. Spróbuj ponownie.", "error");
    } finally {
        btn.disabled = false;
        btn.innerText = originalBtnText;
    }
}

async function giveUpGame() {
    if (hasWon || hasLost) return;
    const confirmed = await appConfirm("Czy na pewno chcesz się poddać i odkryć zawodnika?", { title: "Poddajesz się?", danger: true, confirmText: "TAK, PODDAJĘ SIĘ" });
    if (!confirmed) return;
    
    // Zabezpieczenie przed niewłaściwym graczem przy poddaniu
    const ans = await functions.httpsCallable('getAnswer')({ gameMode, dailyDay: selectedDailyDay, endlessSeed: currentEndlessSeed, playerId });
    serverTargetName = ans.data.name;

    guessCount = GUESS_LIMIT; hintsUsedCount = 1; updateCounterDisplay(); updateStatsOnLoss(); handleLoss();
    document.getElementById('btnGiveUp').style.display = 'none';
}

function revealTargetInfoUI() {
    document.getElementById('mysteryPlaceholder').style.display = 'none'; 
    const photoImg = document.getElementById('mysteryPhoto'); 
    photoImg.src = `images/riders/image_0.png`; 
    photoImg.style.display = 'block';
    document.getElementById('photoWrapper').classList.add('revealed'); 
    
    document.getElementById('mysteryName').innerText = serverTargetName || "???";
    
    if (hasLost) document.getElementById('mysteryName').style.color = "var(--red-neon)";
    
    document.querySelectorAll('.path-box').forEach(box => {
        if (!box.dataset.index) return;
        let trueClub = serverTargetClubs[box.dataset.index];
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


async function useHint() {
    if (hintActive) return;
    hintActive = true; hintsUsedCount = 1;
    document.getElementById('btnHint').style.display = 'none'; 
    showToast("Pobieram podpowiedź...", "normal");
    
    try {
        const ans = await functions.httpsCallable('getHint')({ gameMode, dailyDay: selectedDailyDay, endlessSeed: currentEndlessSeed, guessCount, playerId });
        document.getElementById('mysteryName').innerText = ans.data.hintText;
        showToast("Użyto podpowiedzi!", "success");
    } catch(e) {
        showToast("Błąd pobierania podpowiedzi", "error"); hintActive = false; document.getElementById('btnHint').style.display = 'inline-block';
    }
}

function revealClubsOnPath(guessedPlayer) {
    const boxes = document.querySelectorAll('.path-box'); 
    let guessedClubs = guessedPlayer.pastClubs.map(getCleanClubName);
    
    boxes.forEach(box => {
        if (!box.dataset.index) return;
        let trueClub = serverTargetClubs[box.dataset.index]; // ZMIANA
        
        if (guessedClubs.includes(getCleanClubName(trueClub)) && box.innerText === '?') {
            let cleanC = getCleanClubName(trueClub).toLowerCase();
            if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC)) { box.classList.add('club-special'); }
            box.innerHTML = `<span>${getClubAbbr(trueClub)}</span>${getClubBadgeHTML(trueClub)}`;
            box.classList.add('found'); box.setAttribute('title', trueClub);        
        }
    });
    if ((guessedPlayer.status.toLowerCase().includes("koniec") || guessedPlayer.status === "Ś.P.") && (serverTargetStatus.toLowerCase().includes("koniec") || serverTargetStatus === "Ś.P.")) {
        const endBox = document.getElementById('pathBox-retired'); if (endBox) { endBox.innerText = '❌'; endBox.classList.add('found'); endBox.style.border = 'none'; endBox.style.background = 'transparent'; }
    }
}
function renderGuess(player, currentStats = null, isRestore = false) {
    const stats = currentStats || serverTargetStats; 
    if (!stats) return;

    const resultsDiv = document.getElementById('results'); 
    const row = document.createElement('div'); row.className = 'guess-row'; let rowEmojis = "";
    
    const isTargetGP = stats.gp === true || stats.gp === "Tak" || stats.gp === "tak";
    const isGuessGP = player.gp === true || player.gp === "Tak" || player.gp === "tak";
    const gpCls = (isGuessGP === isTargetGP) ? "green" : "red"; const gpIcon = isGuessGP ? "✅" : "❌";
    
    const yearCls = (player.year === stats.year) ? "green" : "red";
    let yearTitle = "";
    if (player.year > stats.year) yearTitle = "Szukany zawodnik jest starszy (urodził się wcześniej)";
    else if (player.year < stats.year) yearTitle = "Szukany zawodnik jest młodszy (urodził się później)";
    else yearTitle = "Dokładnie ten sam rocznik!";

    let yearContent = `<span>${player.year}</span>`;
    if (player.year > stats.year) yearContent += `<span class="val-arrow" title="${yearTitle}">⬇️</span>`; 
    else if (player.year < stats.year) yearContent += `<span class="val-arrow" title="${yearTitle}">⬆️</span>`;

    const dmpCls = (player.dmp === stats.dmp) ? "green" : "red";
    let dmpContent = `<span>${player.dmp}</span>`;
    if (player.dmp > stats.dmp) dmpContent += `<span class="val-arrow" title="Mniej medali">⬇️</span>`; 
    else if (player.dmp < stats.dmp) dmpContent += `<span class="val-arrow" title="Więcej medali">⬆️</span>`;

    const pCountries = player.country.split("/").map(c => c.trim()); 
    const tCountries = (stats.country || "").split("/").map(c => c.trim());
    let countryCls = "red"; 
    if (player.country === stats.country) countryCls = "green"; 
    else if (pCountries.some(c => tCountries.includes(c))) countryCls = "half"; 
    else if (player.region === stats.region) countryCls = "yellow";
    
    let c1 = countryToCode[pCountries[0]] || 'pl';
    let countryContent = pCountries.length > 1 
        ? `<div class="tile-flag-dual" title="${player.country}"><img src="https://flagcdn.com/h80/${c1}.png" class="flag-left"><img src="https://flagcdn.com/h80/${countryToCode[pCountries[1]] || 'pl'}.png" class="flag-right"></div>` 
        : `<img src="https://flagcdn.com/w80/${c1}.png" class="tile-flag" title="${player.country}">`;

    let targetCleanClubs = serverTargetClubs.map(getCleanClubName);
    let clubsHTML = player.pastClubs.map(c => {
        let cleanC = getCleanClubName(c); 
        let isMatch = targetCleanClubs.includes(cleanC); 
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
        <div class="col-attr"><div class="attr-box ${player.status === stats.status ? 'green' : 'red'} flip-anim" style="animation-delay: ${d5}s">${player.status === 'Aktywny' ? '✅' : '❌'}</div></div>
        <div class="col-clubs flip-anim" style="animation-delay: ${d6}s"><div class="clubs-path-container">${clubsHTML}</div></div>
    `;
    resultsDiv.insertBefore(row, resultsDiv.firstChild);
    
    if (!isRestore) { setTimeout(() => playSound('flip'), 100); setTimeout(() => playSound('flip'), 300); setTimeout(() => playSound('flip'), 500); setTimeout(() => playSound('flip'), 700); setTimeout(() => playSound('flip'), 900); setTimeout(() => playSound('flip'), 1100); }
    
    ['country', 'year', 'gp', 'dmp', 'status'].forEach(attr => {
        let c = "red";
        if (attr === 'country') c = countryCls; 
        else if (attr === 'year' && player.year === stats.year) c = "green"; 
        else if (attr === 'gp' && isGuessGP === isTargetGP) c = "green"; 
        else if (attr === 'dmp' && player.dmp === stats.dmp) c = "green"; 
        else if (attr === 'status' && player.status === stats.status) c = "green";
        rowEmojis += c === "green" ? "🟩" : (c === "yellow" || c === "half") ? "🟨" : "🟥";
    });
    guessHistory.push(rowEmojis);
}

function handleWin() {
    playSound('win'); revealTargetInfoUI(); launchConfetti();
    const overlay = document.getElementById('winOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    const btnPlayAgainPost = document.getElementById('btnPlayAgainPost');
    if (gameMode === 'daily') { document.getElementById('btnSharePost').style.display = 'inline-block'; btnPlayAgainPost.innerText = i18n[currentLang].btnPlayEndless; } else { document.getElementById('btnSharePost').style.display = 'none'; btnPlayAgainPost.innerText = i18n[currentLang].btnPlayAgain; }
    setTimeout(() => { overlay.style.opacity = '0'; setTimeout(() => { overlay.style.display = 'none'; document.getElementById('postGameActions').style.display = 'flex'; }, 200); }, 1500);
}

function handleLoss() {
    playSound('lose'); revealTargetInfoUI();
    const overlay = document.getElementById('loseOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    document.getElementById('btnSharePost').style.display = 'none'; document.getElementById('btnPlayAgainPost').innerText = gameMode === 'daily' ? i18n[currentLang].btnPlayEndless : i18n[currentLang].btnPlayAgain;
    setTimeout(() => { overlay.style.opacity = '0'; setTimeout(() => { overlay.style.display = 'none'; document.getElementById('postGameActions').style.display = 'flex'; }, 200); }, 1500);
}

function revealTargetInfoUI() {
    document.getElementById('mysteryPlaceholder').style.display = 'none'; 
    const photoImg = document.getElementById('mysteryPhoto'); 
    photoImg.src = `images/riders/image_0.png`; 
    photoImg.style.display = 'block';
    document.getElementById('photoWrapper').classList.add('revealed'); 
    
    // TUTAJ BYŁ BŁĄD - poprawione:
    document.getElementById('mysteryName').innerText = serverTargetName || "???";
    
    if (hasLost) document.getElementById('mysteryName').style.color = "var(--red-neon)";
    
    document.querySelectorAll('.path-box').forEach(box => {
        if (!box.dataset.index) return;
        let trueClub = serverTargetClubs[box.dataset.index];
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
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.width = 1080; canvas.height = 1920;
    const grd = ctx.createRadialGradient(540, 0, 0, 540, 0, 1920); grd.addColorStop(0, "#1e1e22"); grd.addColorStop(1, "#0a0a0c"); ctx.fillStyle = grd; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff"; ctx.font = "900 80px Montserrat, sans-serif"; ctx.textAlign = "center"; ctx.fillText("🏁 SPEEDWAY GUESSR", 540, 200); ctx.fillStyle = "#f1c40f"; ctx.font = "700 50px Montserrat, sans-serif"; ctx.fillText(`DAILY ${dailyNumberGlobal}`, 540, 280); ctx.fillStyle = "#ffffff"; ctx.font = "900 120px Montserrat, sans-serif";
    const scoreText = hasWon ? `${guessCount}/${GUESS_LIMIT}` : `X/${GUESS_LIMIT}`; ctx.fillText(scoreText, 540, 450);
    const startY = 600; const boxSize = 100; const gap = 20; const gridWidth = (5 * boxSize) + (4 * gap); const startX = (1080 - gridWidth) / 2;
    const colorMap = { "🟩": "#00ff66", "🟨": "#ffcc00", "🟥": "#ff3333" };
    guessHistory.forEach((rowString, rowIndex) => {
        const rowEmojis = Array.from(rowString).filter(char => char in colorMap);
        rowEmojis.forEach((emoji, colIndex) => { ctx.fillStyle = colorMap[emoji]; const x = startX + colIndex * (boxSize + gap); const y = startY + rowIndex * (boxSize + gap); const radius = 20; ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + boxSize - radius, y); ctx.quadraticCurveTo(x + boxSize, y, x + boxSize, y + radius); ctx.lineTo(x + boxSize, y + boxSize - radius); ctx.quadraticCurveTo(x + boxSize, y + boxSize, x + boxSize - radius, y + boxSize); ctx.lineTo(x + radius, y + boxSize); ctx.quadraticCurveTo(x, y + boxSize, x, y + boxSize - radius); ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath(); ctx.fill(); });
    });
    ctx.fillStyle = "#8e8e93"; ctx.font = "400 30px Montserrat, sans-serif"; ctx.fillText("speedway-guessr.github.io", 540, 1850);
    try {
        canvas.toBlob(async (blob) => {
            if (!blob) { alert("Błąd generowania obrazu."); return; } const file = new File([blob], `speedway-guessr-${dailyNumberGlobal}.png`, { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: `Speedway Guessr Daily ${dailyNumberGlobal}`, text: i18n[currentLang].shareText }); } 
            else { alert("Niestety Twoja przeglądarka nie obsługuje bezpośredniego udostępniania obrazów. \n\nZrób zrzut ekranu, aby podzielić się wynikiem na Instagramie!"); }
        }, "image/png");
    } catch (error) { console.error("Error sharing:", error); alert("Wystąpił nieoczekiwany błąd podczas udostępniania."); }
}

function openRanking(defaultTab = 'daily') { 
    promptForNick(async () => { 
        const overlay = document.getElementById('rankingOverlay'); 
        overlay.style.display = 'block'; 
        setTimeout(() => overlay.style.opacity = '1', 10); 
        loadRanking(defaultTab); 
    }); 
}

async function loadRanking(type) {
    // 1. Zmiana aktywnych zakładek
    document.querySelectorAll('.rank-tab').forEach(btn => btn.classList.remove('active')); 
    const activeTab = document.getElementById(`tab-${type}`); 
    if (activeTab) activeTab.classList.add('active');
    
    const tbody = document.getElementById('rankingTableBody'); 
    const thead = document.getElementById('rankingTableHead'); // W HTML dodaliśmy id="rankingTableHead" do <thead>
    let dateDisplay = document.getElementById('rankingDateDisplay');
    
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Ładowanie z serwera... ⏳</td></tr>';

    // 2. NOWOŚĆ: TRYB LIGOWY CLASH
    if (type === 'league') {
        if (dateDisplay) dateDisplay.style.display = 'none';
        // Nowe nagłówki tabeli dla ligi
        if (thead) thead.innerHTML = `<tr><th>Poz.</th><th style="text-align: left;">Nick</th><th>Ranga</th><th>Mecze</th><th style="color:var(--accent);">ELO</th></tr>`;
        
        try {
            // Pobieranie top 100 graczy ligowych
            let snapshot = await db.collection("leaderboard_clash_beta").orderBy("elo", "desc").limit(100).get();
            let scores = []; snapshot.forEach(doc => { scores.push(doc.data()); });
            
            if (tbody) tbody.innerHTML = '';
            if (scores.length === 0) { 
                if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">Brak wyników. Zagraj swój pierwszy mecz! 🏆</td></tr>`; 
                return; 
            }

            let currentRankPosition = 1; // Własny licznik, by pozycje nie skakały jak pominiemy graczy na kalibracji

            scores.forEach((row) => {
                // Nie pokazujemy w ogólnym rankingu graczy w trackie Kalibracji (< 5 meczy)
                if (row.provisional || row.matchesPlayed < 5) return; 
                
                let rankClass = ""; 
                if (currentRankPosition === 1) rankClass = "rank-1"; 
                else if (currentRankPosition === 2) rankClass = "rank-2"; 
                else if (currentRankPosition === 3) rankClass = "rank-3";
                
                let safeRenderNick = typeof escapeHTML === 'function' ? escapeHTML(row.nick || "Gracz") : (row.nick || "Gracz");
                let isMe = safeRenderNick === playerNickname ? 'style="background: rgba(255,255,255,0.05);"' : '';
                
                let rangaText = getLeagueRankName(row.elo, row.matchesPlayed);
                let rangaColorClass = getRankClass(row.elo, row.matchesPlayed);
                let rangaImg = getLeagueImageTag(row.elo, row.matchesPlayed, 18); // Zmniejszona ikonka dla tabeli
                
                if (tbody) { 
                    tbody.innerHTML += `<tr ${isMe}>
                        <td class="${rankClass}">${currentRankPosition}</td>
                        <td class="rank-nick ${rankClass}">${safeRenderNick}</td>
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

            // Jeśli po przefiltrowaniu nikogo nie ma (wszyscy są w trakcie kalibracji)
            if (tbody && tbody.innerHTML === '') {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">Brak wyników. Wszyscy gracze są w trakcie kalibracji! ⚖️</td></tr>`;
            }

        } catch (e) { 
            console.error(e); 
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--red-neon);">Błąd bazy ❌</td></tr>`; 
        }
        return;
    }

    // 3. STARY TRYB (DAILY / ENDLESS / TYGODNIOWE ITP.)
    let headerText = (type === 'daily') ? 'Rozwiązane' : 'Suma Wygranych';
    if (thead) thead.innerHTML = `<tr><th>Poz.</th><th style="text-align: left;">Nick</th><th>${headerText}</th><th>Próby</th></tr>`;
    
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
        if (type === 'daily') snapshot = await db.collection("rankings").doc(selectedDailyDay.toString()).collection("scores").get();
        else if (type === 'weekly') snapshot = await db.collection("leaderboard_weekly").doc(getCurrentWeekStr()).collection("scores").get();
        else if (type === 'monthly') snapshot = await db.collection("leaderboard_monthly").doc(getCurrentMonthStr()).collection("scores").get();
        else if (type === 'alltime') snapshot = await db.collection("leaderboard_alltime").doc("global").collection("scores").get();
        
        let scores = []; snapshot.forEach(doc => { scores.push(doc.data()); });
        scores.sort((a, b) => { 
            let winsA = a.won !== undefined ? a.won : (a.wins || 0); 
            let winsB = b.won !== undefined ? b.won : (b.wins || 0); 
            if (winsB !== winsA) return winsB - winsA; 
            if (a.guesses !== b.guesses) return a.guesses - b.guesses; 
            
            // NOWOŚĆ: Osoby które użyły podpowiedzi są niżej
            let hintsA = a.hints || 0;
            let hintsB = b.hints || 0;
            if (hintsA !== hintsB) return hintsA - hintsB;
            
            return (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0); 
        });
        
        if (tbody) tbody.innerHTML = '';
        if (scores.length === 0) { 
            if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">Brak wyników. Bądź pierwszy! 🏆</td></tr>`; 
            return; 
        }

        scores.forEach((row, index) => {
            let rankClass = ""; 
            if (index === 0) rankClass = "rank-1"; 
            else if (index === 1) rankClass = "rank-2"; 
            else if (index === 2) rankClass = "rank-3";
            
            let winsAmount = row.won !== undefined ? row.won : (row.wins || 0); 
            let wonText = winsAmount > 0 ? `<span class="rank-won">${type === 'daily' ? 'TAK' : winsAmount}</span>` : `<span class="rank-lost">${type === 'daily' ? 'NIE' : '0'}</span>`;
            
            let safeRenderNick = typeof escapeHTML === 'function' ? escapeHTML(row.nick || "Gracz") : (row.nick || "Gracz");
            let isMe = safeRenderNick === playerNickname ? 'style="background: rgba(255,255,255,0.05);"' : '';
            
            if (tbody) { 
                tbody.innerHTML += `<tr ${isMe}>
                    <td class="${rankClass}">${index + 1}</td>
                    <td class="rank-nick ${rankClass}">${safeRenderNick}</td>
                    <td>${wonText}</td>
                    <td>${row.guesses}</td>
                </tr>`; 
            }
        });
    } catch (e) { 
        console.error(e); 
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--red-neon);">Błąd bazy ❌</td></tr>`; 
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
        
        displays.forEach(display => {
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
            // UŻYWAMY TOASTA ZAMIAST ALERT(), ABY NIE ZAMRAŻAĆ PRZEGLĄDARKI!
            showToast("⚠️ Wykryto zmianę karty! Tracisz turę.", "error"); 
            skipClashTurn("Opuścił okno gry (KARA)");
            
            if (currentClashData && currentClashData.type === 'league') {
                applyMatchmakingBan("Oszukiwanie - Opuszczenie karty przeglądarki.");
            }
        }
    }
});

function updateClashTurnUI() {
    let p1El = document.getElementById('clashPlayer1'); let p2El = document.getElementById('clashPlayer2');
    if(p1El) p1El.className = clashTurn === 'red' ? 'clash-player active' : 'clash-player';
    if(p2El) p2El.className = clashTurn === 'blue' ? 'clash-player active' : 'clash-player';
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
    setElementDisplay('clashContainer', 'block');
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
    isSearchingLeague = false;
    const overlay = document.getElementById('clashMatchmakingOverlay');
    if(overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 300);
    }
    
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
    // BLOKADA MATCHMAKINGU JESLI JEST BAN
    ensureLeagueStats(userStats);
    if (Date.now() < userStats.clashLeague.banUntil) {
        const remaining = Math.ceil((userStats.clashLeague.banUntil - Date.now()) / 60000);
        let czasTxt = remaining >= 1440 ? `${Math.round(remaining/1440)} dni` : (remaining >= 60 ? `${Math.round(remaining/60)} godz.` : `${remaining} min.`);
        appAlert(`Masz tymczasową blokadę na mecze ligowe za wychodzenie z gier lub AFK.\n\nKara minie za: ${czasTxt}`, "BLOKADA KONTA");
        return;
    }

    promptForNick(async () => {
        isSearchingLeague = true;
        
        // POKAŻ NOWY MODAL
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
                // ZNALEZIONO ISTNIEJĄCY POKÓJ
                const queueDoc = snapshot.docs[0];
                const roomData = queueDoc.data();
                
                if (roomData.hostId !== playerId) {
                    if (statusText) statusText.innerText = "Łączenie z graczem...";
                    
                    const roomCode = roomData.roomCode;
                    await db.collection("clash_rooms").doc(roomCode).update({
                        p2: { id: playerId, nick: playerNickname, elo: userStats.clashLeague.elo, matchesPlayed: userStats.clashLeague.matchesPlayed, color: 'blue' },
                        p2Ready: true
                    });
                    await queueRef.doc(queueDoc.id).update({ status: "matched", guestId: playerId });

                    myClashColor = 'blue'; currentClashRoom = roomCode;
                    listenToClashRoom();
                    isSearchingLeague = false;
                    
                    // Schowaj modal bo znaleziono
                    setTimeout(() => { if(overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300); } }, 500);
                    return;
                }
            }

            if (!isSearchingLeague) return; 

            // NIE ZNALEZIONO, TWORZYMY NOWY POKÓJ I CZEKAMY
            const roomCode = generateRoomCode(); myClashColor = 'red'; currentClashRoom = roomCode;
            let allClubs = getCleanClubsList(); tryGenerateBoard(allClubs, 2, 500);

            let constraints = null;
            if (Math.random() > 0.5) {
                const countries = ["Polska", "Dania", "Australia", "Wielka Brytania", "Szwecja"];
                constraints = { col: Math.floor(Math.random() * 3), country: countries[Math.floor(Math.random() * countries.length)] };
            }

            await db.collection("clash_rooms").doc(roomCode).set({
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'waiting', type: 'league',
                p1: { id: playerId, nick: playerNickname, elo: userStats.clashLeague.elo, matchesPlayed: userStats.clashLeague.matchesPlayed, color: 'red' }, p2: null,
                p1Ready: true, p2Ready: false, score: { p1: 0, p2: 0 },
                rows: clashRows, cols: clashCols, constraints: constraints, board: Array(9).fill(null),
                guessedPlayers: Array(9).fill(null), turn: 'red', deadline: 0, lastAction: ''
            });

            const queueDoc = await queueRef.add({
                hostId: playerId, hostNick: playerNickname, roomCode: roomCode, status: "open",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            currentQueueId = queueDoc.id;
            await db.collection("clash_rooms").doc(roomCode).update({ queueId: currentQueueId });
            
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

function startLocalClashMatch() {
    let p1Nick = document.getElementById('localPlayer1Input').value.trim() || 'Gracz 1';
    let p2Nick = document.getElementById('localPlayer2Input').value.trim() || 'Gracz 2';
    
    isLocalClash = true; currentClashRoom = "LOCAL";
    
    let allClubs = getCleanClubsList();
    let validBoard = tryGenerateBoard(allClubs, 3, 500) || tryGenerateBoard(allClubs, 2, 300);
    if (!validBoard) { clashRows = ['unia leszno', 'stal gorzów wielkopolski', 'włókniarz częstochowa']; clashCols = ['apator toruń', 'sparta wrocław', 'falubaz zielona góra']; }
    
    let constraints = null;
    if (Math.random() > 0.5) {
        const countries = ["Polska", "Dania", "Australia", "Wielka Brytania", "Szwecja"];
        constraints = { col: Math.floor(Math.random() * 3), country: countries[Math.floor(Math.random() * countries.length)] };
    }

    localClashData = {
        type: 'local', status: 'vsScreen',
        p1: { nick: p1Nick, color: 'red' }, p2: { nick: p2Nick, color: 'blue' },
        score: { p1: 0, p2: 0 }, rows: clashRows, cols: clashCols, constraints: constraints,
        board: Array(9).fill(null), guessedPlayers: Array(9).fill(null),
        turn: Math.random() < 0.5 ? 'red' : 'blue', deadline: 0, lastAction: ''
    };
    
    document.getElementById('clashLocalLobbyContainer').style.display = 'none';
    updateLocalClashData({}); // Inicjalizacja widoku
}

function updateLocalClashData(updates) {
    if (!isLocalClash) return;
    localClashData = { ...localClashData, ...updates }; const data = localClashData;
    
    clashStatus = data.status; clashTurn = data.turn; clashBoardState = data.board;
    clashGuessedPlayers = data.guessedPlayers || []; clashRows = data.rows; clashCols = data.cols;

    for (let i = 0; i < 3; i++) {
        const colHeader = document.getElementById(`col${i}`);
        if (colHeader) {
            let headerHTML = `${getClubAbbr(clashCols[i])}`;
            if (data.constraints && data.constraints.col === i) headerHTML += `<br><span style="color:var(--green-neon); font-size:9px;">[${data.constraints.country}]</span>`;
            colHeader.innerHTML = headerHTML;
        }
        const rowHeader = document.getElementById(`row${i}`);
        if (rowHeader) rowHeader.innerHTML = `${getClubAbbr(clashRows[i])}`;
    }

    if(clashStatus === 'vsScreen') showVsScreen(data);
    if(clashStatus === 'coinToss') playCoinToss(data);
    if(clashStatus === 'playing') updateClashBoardUI(data);
    if(clashStatus === 'summary' && document.getElementById('clashSummaryOverlay').style.display === 'none') handleClashEnd(data);
} 
// --- LOBBY TOWARZYSKIE ---
async function createClashRoom() {
    document.getElementById('clashLobbyError').style.display = 'none';
    const btn = document.querySelector('#clashLobbySelect .menu-btn');
    btn.innerText = "TWORZENIE..."; btn.disabled = true;

    const code = generateRoomCode(); myClashColor = 'red';
    let allClubs = getCleanClubsList();
    let validBoard = tryGenerateBoard(allClubs, 3, 500) || tryGenerateBoard(allClubs, 2, 300);
    if (!validBoard) { clashRows = ['unia leszno', 'stal gorzów wielkopolski', 'włókniarz częstochowa']; clashCols = ['apator toruń', 'sparta wrocław', 'falubaz zielona góra']; }

    try {
        await db.collection("clash_rooms").doc(code).set({
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'waiting', p1: { id: playerId, nick: playerNickname, color: 'red' }, p2: null,
            p1Ready: false, p2Ready: false, score: { p1: 0, p2: 0 },
            rows: clashRows, cols: clashCols, board: Array(9).fill(null), turn: 'red', deadline: 0,
            guessedPlayers: Array(9).fill(null), lastAction: '', rematchP1: false, rematchP2: false,
            coinTossWinner: null
        });

        currentClashRoom = code;
        document.getElementById('clashLobbySelect').style.display = 'none';
        document.getElementById('myRoomCodeDisplay').innerText = code;
        
        document.getElementById('waitingText').style.display = 'block';
        document.getElementById('readyPlayersDiv').style.display = 'none';
        document.getElementById('btnReady').innerText = "JESTEM GOTÓW";
        document.getElementById('btnReady').disabled = false;
        document.getElementById('btnReady').style.background = "var(--accent)";
        document.getElementById('clashLobbyWaiting').style.display = 'block';
        
        btn.innerHTML = `<span class="btn-icon">🏠</span><span class="btn-text">UTWÓRZ POKÓJ (HOST)</span>`; btn.disabled = false;
        listenToClashRoom();
    } catch(e) { document.getElementById('clashLobbyError').innerText = "Błąd połączenia."; document.getElementById('clashLobbyError').style.display = 'block'; btn.disabled = false; }
}

async function joinClashRoom() {
    const input = document.getElementById('joinRoomInput').value.trim().toUpperCase();
    const errorEl = document.getElementById('clashLobbyError');
    if(input.length !== 5) { errorEl.innerText = "Kod musi mieć 5 liter!"; errorEl.style.display = 'block'; return; }

    try {
        const roomRef = db.collection("clash_rooms").doc(input); const doc = await roomRef.get();
        if(!doc.exists) { errorEl.innerText = "Nie znaleziono pokoju!"; errorEl.style.display = 'block'; return; }
        if(doc.data().p2 !== null) { errorEl.innerText = "Pokój jest pełny!"; errorEl.style.display = 'block'; return; }

        await roomRef.update({ p2: { id: playerId, nick: playerNickname, color: 'blue' } });
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
        clashStatus = data.status; clashTurn = data.turn; clashBoardState = data.board;
        clashGuessedPlayers = data.guessedPlayers || []; clashRows = data.rows; clashCols = data.cols;

        for (let i = 0; i < 3; i++) {
            const colHeader = document.getElementById(`col${i}`);
            if (colHeader) {
                let headerHTML = `${getClubAbbr(clashCols[i])}`;
                if (data.constraints && data.constraints.col === i) {
                    headerHTML += `<br><span style="color:var(--green-neon); font-size:9px;">[${data.constraints.country}]</span>`;
                }
                colHeader.innerHTML = headerHTML;
            }
            const rowHeader = document.getElementById(`row${i}`);
            if (rowHeader) rowHeader.innerHTML = `${getClubAbbr(clashRows[i])}`;
        }

        if (data.status === 'summary' && data.type === 'league' && !window.hasUpdatedLeague) {
            updateLeagueStats(data);
        }

        if (clashStatus === 'waiting') {
            if (data.p2) {
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

                if (data.type === 'league' && myClashColor === 'red') {
                    db.collection("clash_rooms").doc(currentClashRoom).update({ status: 'vsScreen' });
                    if (data.queueId) db.collection("clash_queue").doc(data.queueId).delete().catch(() => {});
                }

                if (data.type !== 'league' && myClashColor === 'red' && data.p1Ready && data.p2Ready) {
                    db.collection("clash_rooms").doc(currentClashRoom).update({ status: 'vsScreen' });
                }
            }
        }

        if (clashStatus === 'summary') {
            let readys = 0; if(data.rematchP1) readys++; if(data.rematchP2) readys++;
            const rematchCount = document.getElementById('rematchCount');
            if(rematchCount) rematchCount.innerText = `(${readys}/2)`;
            
            if (myClashColor === 'red' && data.rematchP1 && data.rematchP2) {
                let allClubs = getCleanClubsList();
                let validBoard = tryGenerateBoard(allClubs, 3, 500) || tryGenerateBoard(allClubs, 2, 300);
                if (!validBoard) { clashRows = ['unia leszno', 'stal gorzów', 'włókniarz częstochowa']; clashCols = ['apator toruń', 'sparta wrocław', 'falubaz zielona góra']; }
                
                db.collection("clash_rooms").doc(currentClashRoom).update({
                    status: 'vsScreen', turn: Math.random() < 0.5 ? 'red' : 'blue',
                    board: Array(9).fill(null), guessedPlayers: Array(9).fill(null), lastAction: '',
                    rows: clashRows, cols: clashCols, rematchP1: false, rematchP2: false
                });
            }
        }

        if(clashStatus === 'vsScreen') showVsScreen(data);
        if(clashStatus === 'coinToss') playCoinToss(data);
        if(clashStatus === 'playing') updateClashBoardUI(data);
        if(clashStatus === 'summary' && document.getElementById('clashSummaryOverlay').style.display === 'none') {
            handleClashEnd(data);
        }
    });
}

function showVsScreen(data) {
    if (data.type === 'league') window.hasUpdatedLeague = false;
    setElementDisplay('clashModeSelectContainer', 'none');
    document.getElementById('clashLobbyContainer').style.display = 'none';
    document.getElementById('clashContainer').style.display = 'none';
    document.getElementById('clashSummaryOverlay').style.display = 'none'; 
    const vsOverlay = document.getElementById('clashVsOverlay');
    
    let p1NickHTML = data.p1.nick; let p2NickHTML = data.p2.nick;
    if (data.type === 'league') {
        const p1RankImg = getLeagueImageTag(data.p1.elo, data.p1.matchesPlayed || 5, 24);
        const p2RankImg = getLeagueImageTag(data.p2.elo, data.p2.matchesPlayed || 5, 24);
        p1NickHTML = `${p1RankImg} ${data.p1.nick}`; p2NickHTML = `${p2RankImg} ${data.p2.nick}`;
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
    showClashMatchView(); closeClashSearch();

    for(let r=0; r<3; r++) {
        for(let c=0; c<3; c++) {
            let idx = r * 3 + c; let cell = document.getElementById(`cell-${r}-${c}`); let val = data.board[idx];
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
    if(clashTurn === myClashColor || isLocalClash) { document.getElementById('clashTimerDisplay').style.color = '#00ff66'; playSound('flip'); } 
    else { document.getElementById('clashTimerDisplay').style.color = '#fff'; }

    if(data.lastAction && data.lastAction !== '' && (data.turn === myClashColor || isLocalClash)) {
        setTimeout(() => showToast(`Błąd rywala: ${data.lastAction}! Twoja kolej!`, "success"), 200);
        if (isLocalClash) {
            localClashData.lastAction = '';
        } else {
            db.collection("clash_rooms").doc(currentClashRoom).update({ lastAction: '' });
        }
    } else if (data.turn === myClashColor && clashStatus === 'playing') {
        showToast("TWÓJ RUCH!", "normal");
    }

    startClashTimer(data.deadline);
}
let lastHeartbeatSecond = -1; // Zmienna zapobiegająca nakładaniu się dźwięku

function startClashTimer(deadlineTime) {
    if(clashTimerInterval) clearInterval(clashTimerInterval);
    const display = document.getElementById('clashTimerDisplay');

    // Tworzymy funkcję tick, aby wywołać ją natychmiast (bez czekania 1 sekundy)
    function tick() {
        let now = Date.now(); 
        let diff = deadlineTime - now;
        
        if (diff <= 0) {
            clearInterval(clashTimerInterval); 
            display.innerText = "00:00"; 
            display.style.color = "var(--red-neon)";
            if(clashStatus === 'playing') {
                if(isLocalClash || clashTurn === myClashColor) skipClashTurn("Koniec czasu!");
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

    tick(); // Wywołanie natychmiastowe przy starcie
    clashTimerInterval = setInterval(tick, 1000); // Następnie co sekundę
}
function handleClashCell(r, c) {
    if (!isLocalClash && clashTurn !== myClashColor) { showToast("Czekaj na swoją kolej!", "error"); return; }
    let idx = r * 3 + c; if(clashBoardState[idx] !== null) { showToast("To pole jest już zajęte!", "error"); return; }
    
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

    let r = Math.floor(clashActiveCellIdx / 3); let c = clashActiveCellIdx % 3;

    if (roomData.constraints && roomData.constraints.col === c) {
        const reqCountry = roomData.constraints.country;
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

// Sprawdzanie czy gracz ułożył 3 w linii w Clashu
function checkWinCondition(board, color) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rzędy poziom
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Kolumny pion
        [0, 4, 8], [2, 4, 6]             // Skosy
    ];
    return lines.some(line => line.every(index => board[index] === color));
}

async function executeValidClashMove(playerName) {
    let turnColor = isLocalClash ? clashTurn : myClashColor;
    let newBoard = [...clashBoardState]; newBoard[clashActiveCellIdx] = turnColor;
    let newGuessed = clashGuessedPlayers.length === 9 ? [...clashGuessedPlayers] : Array(9).fill(null);
    newGuessed[clashActiveCellIdx] = playerName;

    closeClashSearch(); playSound('guess');
    let nextTurn = turnColor === 'red' ? 'blue' : 'red';

    if(checkWinCondition(newBoard, turnColor)) {
        if(isLocalClash) {
            let p1Score = localClashData.score.p1 + (turnColor === 'red' ? 1 : 0);
            let p2Score = localClashData.score.p2 + (turnColor === 'blue' ? 1 : 0);
            updateLocalClashData({ board: newBoard, guessedPlayers: newGuessed, status: 'summary', winner: turnColor, score: {p1: p1Score, p2: p2Score} });
        } else {
            let field = turnColor === 'red' ? 'score.p1' : 'score.p2';
            await db.collection("clash_rooms").doc(currentClashRoom).update({ board: newBoard, guessedPlayers: newGuessed, status: 'summary', winner: turnColor, [field]: firebase.firestore.FieldValue.increment(1) });
        }
    } else if (!newBoard.includes(null)) {
        if(isLocalClash) {
            updateLocalClashData({ board: newBoard, guessedPlayers: newGuessed, status: 'summary', winner: 'draw' });
        } else {
            await db.collection("clash_rooms").doc(currentClashRoom).update({ board: newBoard, guessedPlayers: newGuessed, status: 'summary', winner: 'draw' });
        }
    } else {
        if(isLocalClash) {
            updateLocalClashData({ board: newBoard, guessedPlayers: newGuessed, turn: nextTurn, deadline: Date.now() + 120000, lastAction: '' });
        } else {
            await db.collection("clash_rooms").doc(currentClashRoom).update({ board: newBoard, guessedPlayers: newGuessed, turn: nextTurn, deadline: Date.now() + 120000, lastAction: '' });
        }
    }
}

function skipClashTurn(reason) { 
    let nextTurn = clashTurn === 'red' ? 'blue' : 'red';
    if (isLocalClash) {
        updateLocalClashData({ turn: nextTurn, deadline: Date.now() + 120000, lastAction: reason });
    } else {
        db.collection("clash_rooms").doc(currentClashRoom).update({ turn: nextTurn, deadline: Date.now() + 120000, lastAction: reason }); 
    }
}

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
             let constraints = null;
             if (Math.random() > 0.5) {
                 const countries = ["Polska", "Dania", "Australia", "Wielka Brytania", "Szwecja"];
                 constraints = { col: Math.floor(Math.random() * 3), country: countries[Math.floor(Math.random() * countries.length)] };
             }
             updateLocalClashData({
                 status: 'vsScreen', turn: Math.random() < 0.5 ? 'red' : 'blue',
                 board: Array(9).fill(null), guessedPlayers: Array(9).fill(null), lastAction: '',
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

function getCleanClubsList() {
    let clubs = new Set();
    playersDB.forEach(p => { p.pastClubs.forEach(c => clubs.add(getCleanClubName(c).toLowerCase())); if (p.currentClub) clubs.add(getCleanClubName(p.currentClub).toLowerCase()); });
    ['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].forEach(c => clubs.delete(c)); return Array.from(clubs);
}

function tryGenerateBoard(allClubs, minMatches, maxAttempts) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        attempts++; let tempRows = [...allClubs].sort(() => 0.5 - Math.random()).slice(0, 3); let validCols = [];
        for (let c of allClubs) {
            if (tempRows.includes(c)) continue; 
            let intersectsAll = tempRows.every(r => {
                let matchCount = 0;
                for (let p of playersDB) {
                    let pClubs = p.pastClubs.map(pc => getCleanClubName(pc).toLowerCase()); if (p.currentClub) pClubs.push(getCleanClubName(p.currentClub).toLowerCase());
                    if (pClubs.includes(c) && pClubs.includes(r)) matchCount++;
                }
                return matchCount >= minMatches;
            });
            if (intersectsAll) validCols.push(c);
        }
        if (validCols.length >= 3) { clashRows = tempRows; clashCols = [...validCols].sort(() => 0.5 - Math.random()).slice(0, 3); return true; }
    }
    return false;
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

// ==============================================
// ====== DESKTOP MENU RANKING LOADER ===========
// ==============================================

async function loadDesktopRanking(type) {
    const tbody = document.getElementById('desktopRankingBody'); 
    const thead = document.getElementById('desktopRankingHead');
    const title = document.getElementById('desktopRankingTitle');
    const tabs = document.getElementById('desktopRankTabs');
    
    if (!tbody || !thead || !title) return;

    // Obsługa zakładek i stylizacji tytułów
    if (type === 'league') {
        title.innerHTML = '<i>LEADERBOARD (CLASH)</i>';
        title.style.color = '#3399ff';
        tabs.style.display = 'none'; // W lidze nie ma podziału na dni
    } else {
        title.innerHTML = `<i>LEADERBOARD (${type.toUpperCase()})</i>`;
        title.style.color = 'var(--accent)';
        tabs.style.display = 'flex';
        
        document.querySelectorAll('.d-tab').forEach(tab => tab.classList.remove('active'));
        if(type==='daily') tabs.children[0].classList.add('active');
        if(type==='weekly') tabs.children[1].classList.add('active');
        if(type==='monthly') tabs.children[2].classList.add('active');
        if(type==='alltime') tabs.children[3].classList.add('active');
    }

    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Ładowanie danych...</td></tr>';

    try {
        if (type === 'league') {
            thead.innerHTML = `<tr><th>Poz.</th><th>Nick</th><th>Ranga</th><th>ELO</th></tr>`;
            let snapshot = await db.collection("leaderboard_clash_beta").orderBy("elo", "desc").limit(20).get();
            let scores = []; snapshot.forEach(doc => { scores.push(doc.data()); });
            
            tbody.innerHTML = '';
            if (scores.length === 0) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Brak wyników.</td></tr>`; return; }

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
        } else {
            let headerText = (type === 'daily') ? 'Rozwiązane' : 'Suma Wygranych';
            thead.innerHTML = `<tr><th>Poz.</th><th>Nick</th><th>${headerText}</th><th>Próby</th></tr>`;
            
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
            if (scores.length === 0) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Brak wyników.</td></tr>`; return; }

            scores.forEach((row, index) => {
                let winsAmount = row.won !== undefined ? row.won : (row.wins || 0); 
                let wonText = winsAmount > 0 ? `<span style="color:var(--green-neon);">${type === 'daily' ? 'TAK' : winsAmount}</span>` : `<span style="color:var(--red-neon);">${type === 'daily' ? 'NIE' : '0'}</span>`;
                let safeNick = escapeHTML(row.nick || "Gracz");
                let isMe = safeNick === playerNickname ? 'style="color: var(--accent);"' : '';
                
                tbody.innerHTML += `
                    <tr ${isMe}>
                        <td style="color:var(--accent); font-weight:900;">${index + 1}</td>
                        <td>${safeNick}</td>
                        <td>${wonText}</td>
                        <td style="color:var(--text-dim);">${row.guesses}</td>
                    </tr>`;
            });
        }
    } catch (e) { 
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Błąd bazy danych.</td></tr>`; 
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
    
} catch (e) {
    console.error("Global export error:", e);
}
