let targetPlayer; let gameMode = 'endless'; let guessCount = 0;
let guessHistory = []; let guessedPlayersNames = []; 
let currentDailyDay = 1; let selectedDailyDay = 1; let dailyNumberGlobal = "";
let hasWon = false; let hasLost = false; let isRestoring = false;
let calRenderMonth = new Date().getMonth(); let calRenderYear = new Date().getFullYear();
const GUESS_LIMIT = 10; const DAILY_START_DATE = new Date('2026-05-12T00:00:00'); 

let userStats = { played: 0, won: 0, currentStreak: 0, maxStreak: 0, dailyResults: {}, dailyHistory: [], dailyGuesses: {}, recentEndless: [] };
let playerNickname = localStorage.getItem('speedwayNickname') || null;

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

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

let playerId = localStorage.getItem('speedwayUserId');
if (!playerId) {
    playerId = 'guest_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('speedwayUserId', playerId);
}

// --- GOOGLE AUTHENTICATION & SYNC ---
auth.onAuthStateChanged((user) => {
    if (user) {
        playerId = user.uid;
        playerNickname = user.displayName || "GoogleUser";
        localStorage.setItem('speedwayNickname', playerNickname);
        localStorage.setItem('speedwayUserId', playerId);
        updateAuthUI(user);
        syncStatsFromFirebase();
    } else {
        updateAuthUI(null);
    }
});

function signInWithGoogle() {
    auth.signInWithPopup(provider).then((result) => {
        console.log("Zalogowano pomyślnie z poziomu ustawień:", result.user.displayName);
    }).catch((error) => console.error("Login failed", error));
}

function signInWithGooglePrompt() {
    document.getElementById('nickOverlay').style.display = 'none';
    document.getElementById('nickOverlay').style.opacity = '0';
    
    auth.signInWithPopup(provider).then((result) => {
        console.log("Zalogowano pomyślnie przed grą:", result.user.displayName);
        if (window.nickCallback) {
            window.nickCallback();
            window.nickCallback = null;
        }
    }).catch((err) => {
        console.error("Błąd podczas logowania:", err);
        alert("Logowanie anulowane lub wystąpił błąd. Spróbuj ponownie lub zagraj jako Gość.");
    });
}

function logOut() { auth.signOut(); }

function updateAuthUI(user) {
    const btn = document.getElementById('btnSettingsLogin');
    const info = document.getElementById('userInfoDisplay');
    if (!btn || !info) return; 
    
    if (user) {
        btn.innerHTML = i18n[currentLang].btnLogout || "WYLOGUJ SIĘ";
        btn.onclick = logOut;
        btn.style.background = "#e74c3c";
        info.innerText = `Zalogowano: ${user.displayName}`;
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
            if (cloudStats.played > userStats.played) {
                userStats = cloudStats;
                localStorage.setItem('speedwayStatsV2', JSON.stringify(userStats));
            } else {
                syncStatsToFirebase(); 
            }
        } else {
            syncStatsToFirebase(); 
        }
    } catch (e) { console.error("Cloud Sync Load Error:", e); }
}

async function syncStatsToFirebase() {
    if (!auth.currentUser) return;
    try {
        await db.collection('users').doc(auth.currentUser.uid).set({
            stats: JSON.stringify(userStats),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) { console.error("Cloud Sync Save Error:", e); }
}

const clubAbbreviations = {
    "unia leszno": "LES", "falubaz zielona góra": "ZIE", "stal gorzów wielkopolski": "GOR",
    "stal gorzów": "GOR", "motor lublin": "LUB", "sparta wrocław": "WRO", "apator toruń": "TOR",
    "włókniarz częstochowa": "CZE", "gkm grudziądz": "GRU", "unia tarnów": "TAR",
    "polonia bydgoszcz": "BYD", "wybrzeże gdańsk": "GDA", "ostrovia ostrów wielkopolski": "OST",
    "ostrovia ostrów": "OST", "stal rzeszów": "RZE", "row rybnik": "RYB", "psż poznań": "POZ",
    "kolejarz opole": "OPO", "orzeł łódź": "LOD", "polonia piła": "PIŁ", "start gniezno": "GNI",
    "kolejarz rawicz": "RAW", "landshut devils": "LAN", "wilki krosno": "KRO", "lokomotiv daugavpils": "DAU",
    "brak klubu": "🚫", "brak": "🚫", "zawieszenie": "⛔", "kontuzja": "🚑", "koniec kariery": "🛑"
};

const countryToCode = { "Polska": "pl", "Wielka Brytania": "gb", "Dania": "dk", "Australia": "au", "Szwecja": "se", "Słowacja": "sk", "Rosja": "ru", "Łotwa": "lv", "Niemcy": "de", "Francja": "fr", "Słowenia": "si", "USA": "us", "Norwegia": "no", "Ukraina": "ua", "Finlandia": "fi", "Czechy": "cz", "Włochy": "it", "Hiszpania": "es" };

// --- SYSTEM TŁUMACZEŃ (I18N) ---
const i18n = {
    pl: {
        account: "TWÓJ PROFIL", loginDesc: "Zaloguj się przez Google, aby zsynchronizować postęp i wejść do rankingu, lub graj jako Gość!", btnLoginGoogle: "ZALOGUJ PRZEZ GOOGLE", orGuest: "LUB PODAJ NICK GOŚCIA", guestPlaceholder: "Wpisz nick...", btnSavePlay: "ZAPISZ I GRAJ", btnLogout: "WYLOGUJ SIĘ",
        settingsTitle: "USTAWIENIA", sound: "Dźwięk:", soundOn: "Włączony 🔊", soundOff: "Wyłączony 🔇",
        subtitle: "Edycja Żużlowa", lastGames: "Ostatnie gry Daily:", btnDaily: "Graj Daily", btnReview: "Przejrzyj grę", btnEndless: "Endless Guessr", btnTic: "Kółko i Krzyżyk <small>(WKRÓTCE)</small>", searchPlaceholder: "Wpisz imię/nazwisko zawodnika...", btnGuess: "ZGADNIJ",
        teams: "Drużyny:", colName: "Zawodnik", colCountry: "Kraj", colYear: "Rok ur.", colGP: "W GP?", colDMP: "Medale DMP", colStatus: "Status", colClubs: "Historia Klubów",
        tipCountry: "Kraj pochodzenia", tipYear: "Rok urodzenia (⬆️ cel jest młodszy, ⬇️ cel jest starszy)", tipGP: "Czy był stałym uczestnikiem Grand Prix?", tipDMP: "Medale Drużynowych Mistrzostw Polski.", tipStatus: "Obecny status zawodnika", tipClubs: "Jakie kluby reprezentował",
        stats: "STATYSTYKI", statPlayed: "Rozegrane", statWon: "Wygrane", statStreak: "Obecna Seria", statMax: "Najlepsza Seria", btnClose: "ZAMKNIJ", archive: "ARCHIWUM DAILY",
        winTitle: "BRAWO!", winSub: "Odgadłeś zawodnika!", loseTitle: "KONIEC PRÓB", loseSub: "Niestety, nie udało Ci się odgadnąć.", btnShare: "UDOSTĘPNIJ 📋", btnPlayEndless: "GRAJ W TRYB ENDLESS", btnPlayAgain: "ZAGRAJ PONOWNIE", btnMenu: "MENU GŁÓWNE", theme: "Motyw:", themeLight: "Jasny", themeDark: "Ciemny", lang: "Język:", modeDaily: "Tryb: Daily", modeEndless: "Tryb: Endless",
        shareText: "Moje podsumowanie Speedway Guessr Daily! Dasz radę lepiej?",
        tabDaily: "DZIENNY", tabWeekly: "TYDZIEŃ", tabMonthly: "MIESIĄC", tabAllTime: "OGÓLNY", rankWonToday: "Wygrane", rankTotalWins: "Suma Wygranych", rankGuesses: "Próby",
        months: ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"], weekdays: ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"]
    },
    en: {
        account: "YOUR PROFILE", loginDesc: "Log in with Google to sync progress and enter the leaderboard, or play as a Guest!", btnLoginGoogle: "LOGIN WITH GOOGLE", orGuest: "OR ENTER GUEST NICK", guestPlaceholder: "Enter nick...", btnSavePlay: "SAVE & PLAY", btnLogout: "LOGOUT",
        settingsTitle: "SETTINGS", sound: "Sound:", soundOn: "On 🔊", soundOff: "Off 🔇",
        subtitle: "Speedway Edition", lastGames: "Recent Daily games:", btnDaily: "Play Daily", btnReview: "Review game", btnEndless: "Endless Guessr", btnTic: "Tic Tac Toe <small>(SOON)</small>", searchPlaceholder: "Enter rider's name...", btnGuess: "GUESS",
        teams: "Teams:", colName: "Rider", colCountry: "Country", colYear: "Born", colGP: "SGP?", colDMP: "Team Medals", colStatus: "Status", colClubs: "Clubs History",
        tipCountry: "Country of origin", tipYear: "Birth year (⬆️ target is younger, ⬇️ target is older)", tipGP: "Was he ever a regular SGP participant?", tipDMP: "Total Team Speedway Polish Championship medals.", tipStatus: "Current rider status", tipClubs: "Clubs represented in Poland",
        stats: "STATISTICS", statPlayed: "Played", statWon: "Won", statStreak: "Current Streak", statMax: "Max Streak", btnClose: "CLOSE", archive: "DAILY ARCHIVE",
        winTitle: "BRAVO!", winSub: "You guessed the rider!", loseTitle: "OUT OF TRIES", loseSub: "Unfortunately, you didn't guess the rider.", btnShare: "SHARE 📋", btnPlayEndless: "PLAY ENDLESS", btnPlayAgain: "PLAY AGAIN", btnMenu: "MAIN MENU", theme: "Theme:", themeLight: "Light", themeDark: "Dark", lang: "Language:", modeDaily: "Mode: Daily", modeEndless: "Mode: Endless",
        shareText: "My Speedway Guessr Daily summary! Can you beat it?",
        tabDaily: "DAILY", tabWeekly: "WEEK", tabMonthly: "MONTH", tabAllTime: "OVERALL", rankWonToday: "Wins", rankTotalWins: "Total Wins", rankGuesses: "Guesses",
        months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], weekdays: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
    },
    sv: {
        account: "DIN PROFIL", loginDesc: "Logga in med Google för att synkronisera framsteg och delta i rankningen, eller spela som gäst!", btnLoginGoogle: "LOGGA IN MED GOOGLE", orGuest: "ELLER ANGE GÄSTNICK", guestPlaceholder: "Ange nick...", btnSavePlay: "SPARA & SPELA", btnLogout: "LOGGA UT",
        settingsTitle: "INSTÄLLNINGAR", sound: "Ljud:", soundOn: "På 🔊", soundOff: "Av 🔇",
        subtitle: "Speedway Edition", lastGames: "Senaste Daily:", btnDaily: "Spela Daily", btnReview: "Granska spel", btnEndless: "Endless Guessr", btnTic: "Luffarschack <small>(SNART)</small>", searchPlaceholder: "Ange förarens namn...", btnGuess: "GISSA",
        teams: "Klubbar:", colName: "Förare", colCountry: "Land", colYear: "Född", colGP: "SGP?", colDMP: "Lagmedaljer", colStatus: "Status", colClubs: "Klubbhistorik",
        tipCountry: "Ursprungsland", tipYear: "Födelseår (⬆️ målet är yngre, ⬇️ målet är äldre)", tipGP: "Var han någonsin ordinarie i SGP?", tipDMP: "Totalt antal polska lagmästerskapsmedaljer.", tipStatus: "Nuvarande status", tipClubs: "Nuvarande status",
        stats: "STATISTIK", statPlayed: "Spelade", statWon: "Vunna", statStreak: "Aktuell Svit", statMax: "Bästa Svit", btnClose: "STÄNG", archive: "DAILY ARKIV",
        winTitle: "BRAVO!", winSub: "Du gissade föraren!", loseTitle: "INGA FÖRSÖK", loseSub: "Tyvärr, du gissade inte föraren.", btnShare: "DELA 📋", btnPlayEndless: "SPELA ENDLESS", btnPlayAgain: "SPELA IGEN", btnMenu: "HUVUDMENY", theme: "Tema:", themeLight: "Ljust", themeDark: "Mörkt", lang: "Språk:", modeDaily: "Läge: Daily", modeEndless: "Läge: Endless",
        shareText: "Min Speedway Guessr Daily! Kan du slå det?",
        tabDaily: "DAGLIG", tabWeekly: "VECKA", tabMonthly: "MÅNAD", tabAllTime: "ALLMÄN", rankWonToday: "Vinster", rankTotalWins: "Totala Vinster", rankGuesses: "Gissningar",
        months: ["Januari", "Februari", "Mars", "April", "Maj", "Juni", "Juli", "Augusti", "September", "Oktober", "November", "December"], weekdays: ["Må", "Ti", "On", "To", "Fr", "Lö", "Sö"]
    },
    da: {
        account: "DIN PROFIL", loginDesc: "Log ind med Google for at synkronisere fremskridt og deltage i ranglisten, eller spil som gæst!", btnLoginGoogle: "LOG IND MED GOOGLE", orGuest: "ELLER INDTAST GÆSTENICK", guestPlaceholder: "Indtast nick...", btnSavePlay: "GEM & SPIL", btnLogout: "LOG UD",
        settingsTitle: "INDSTILLINGER", sound: "Lyd:", soundOn: "Til 🔊", soundOff: "Fra 🔇",
        subtitle: "Speedway Edition", lastGames: "Seneste Daily:", btnDaily: "Spil Daily", btnReview: "Gennemse spil", btnEndless: "Endless Guessr", btnTic: "Kryds og Bolle <small>(SNART)</small>", searchPlaceholder: "Indtast kørers navn...", btnGuess: "GÆT",
        teams: "Hold:", colName: "Kører", colCountry: "Land", colYear: "Født", colGP: "SGP?", colDMP: "Holdmedaljer", colStatus: "Status", colClubs: "Klubhistorik",
        tipCountry: "Oprindelsesland", tipYear: "Fødselsår (⬆️ målet er yngre, ⬇️ målet er ældre)", tipGP: "Har han nogensinde været fast SGP-kører?", tipDMP: "Samlet antal polske holdmesterskabsmedaljer.", tipStatus: "Nuværende status", tipClubs: "Klubber repræsenteret i Polen",
        stats: "STATISTIK", statPlayed: "Spillet", statWon: "Vundet", statStreak: "Nuværende Stime", statMax: "Bedste Stime", btnClose: "LUK", archive: "DAILY ARKIV",
        winTitle: "BRAVO!", winSub: "Du gættede køreren!", loseTitle: "INGEN FORSØG", loseSub: "Desværre gættede du ikke køreren.", btnShare: "DEL 📋", btnPlayEndless: "SPIL ENDLESS", btnPlayAgain: "SPIL IGEN", btnMenu: "HOVEDMENU", theme: "Tema:", themeLight: "Lyst", themeDark: "Mørkt", lang: "Sprog:", modeDaily: "Tilstand: Daily", modeEndless: "Tilstand: Endless",
        shareText: "Mit Speedway Guessr Daily resultat! Kan du slå det?",
        tabDaily: "DAGLIG", tabWeekly: "UGE", tabMonthly: "MÅNED", tabAllTime: "GENEREL", rankWonToday: "Sejre", rankTotalWins: "Samlede Sejre", rankGuesses: "Gæt",
        months: ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli", "August", "September", "Oktober", "November", "December"], weekdays: ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"]
    }
};

let currentLang = localStorage.getItem('speedwayLang') || 'pl';

function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('speedwayLang', lang);
    
    document.querySelectorAll('.lang-flag').forEach(el => el.classList.remove('active'));
    const flagEl = document.getElementById('flag-' + lang);
    if(flagEl) flagEl.classList.add('active');

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang] && i18n[lang][key]) {
            if (el.tagName === 'INPUT') el.placeholder = i18n[lang][key];
            else el.innerHTML = i18n[lang][key];
        }
    });

    document.querySelectorAll('[data-i18n-tip]').forEach(el => {
        const key = el.getAttribute('data-i18n-tip');
        if (i18n[lang] && i18n[lang][key]) el.setAttribute('data-tip', i18n[lang][key]);
    });
    
    updateDailyMenu();
    updateSoundBtn();
    updateAuthUI(auth.currentUser);
    if(document.getElementById('calendarOverlay').style.display === 'block') renderCalendar();
    
    const modeDisplay = document.getElementById('gameModeDisplay');
    if (gameMode === 'daily') modeDisplay.innerText = `${i18n[currentLang].modeDaily} ${dailyNumberGlobal}`;
    else modeDisplay.innerText = i18n[currentLang].modeEndless;
}

// --- SILNIK DŹWIĘKOWY ---
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
}

const helmetImgObj = new Image();
function preloadHelmetImage() { helmetImgObj.src = 'kask-zycie.png'; }

window.onload = function() { loadStats(); initDailyMenu(); renderLastGames(); preloadHelmetImage(); setLang(currentLang); updateSoundBtn(); };

function loadStats() {
    let saved = localStorage.getItem('speedwayStatsV2'); 
    if(saved) {
        userStats = JSON.parse(saved);
        if (!userStats.dailyResults) userStats.dailyResults = {};
        if (!userStats.dailyHistory) userStats.dailyHistory = [];
        if (!userStats.dailyGuesses) userStats.dailyGuesses = {};
        if (!userStats.recentEndless) userStats.recentEndless = [];
    }
}
function saveStats() { 
    localStorage.setItem('speedwayStatsV2', JSON.stringify(userStats)); 
    syncStatsToFirebase(); 
}

function getDailyDateString(dayNumber) {
    const startUTC = Date.UTC(DAILY_START_DATE.getFullYear(), DAILY_START_DATE.getMonth(), DAILY_START_DATE.getDate());
    const d = new Date(startUTC + (dayNumber - 1) * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getCurrentMonthStr() {
    const d = new Date(); return d.getFullYear() + "_" + (d.getMonth() + 1).toString().padStart(2, '0');
}
function getCurrentWeekStr() {
    let date = new Date(); let dayNum = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    let yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    let weekNo = Math.ceil((((date - yearStart) / 86400000) + 1)/7);
    return date.getUTCFullYear() + "_W" + weekNo.toString().padStart(2, '0');
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
        txt.innerHTML = i18n[currentLang].btnReview; 
    } else {
        btn.classList.remove('disabled'); txt.innerHTML = i18n[currentLang].btnDaily;
    }
}

// --- FILTR PRZEKLEŃSTW I BEZPIECZEŃSTWO ---
const badWordsList = [
    "kurwa", "kurwy", "kurwą", "kurew", "kurwi", "skurwysyn", "skurwiel",
    "jebać", "jebac", "jebany", "jebana", "zjeb", "zajeb", "odjeb", "wyjeb", "podjeb",
    "pierdol", "spierdal", "wypierdal", "zapierdal", "podpierdal",
    "chuj", "chuju", "chuja", "chujo", "cwel", "szmata", "szmato",
    "dziwka", "dziwko", "suka", "suko", "pizda", "pizdo", "kutas", "kutasiarz",
    "pedal", "pedał", "ciota", "czarnuch", "ruchanie", "ruchac", "ruchać", "sukinsyn",
    "fuck", "fucker", "fucking", "bitch", "cunt", "shit", "asshole", "bullshit",
    "nigger", "nigga", "faggot", "retard", "whore", "slut", "motherfucker", 
    "blowjob", "pedophile", "tranny", "bastard", "dickhead", "dumbass",
    "schlampe", "hurensohn", "fotze", "arschloch", "wichser", "missgeburt",
    "puta", "puto", "ramera", "cabron", "pendejo", "gilipollas", "malparido", "maricon", "mierda",
    "salope", "connard", "connasse", "enculé", "encule", "pute",
    "cyka", "blyat", "blyad", "pidor", "pizdec", "chmo", "shluha", "zalyupa", "gondon",
    "блядь", "сука", "хуй", "пизда", "ебать", "пидор", "шлюха", "гондон", "долбоеб",
    "porno", "hitler", "stfu", "kys"
];

function isNickClean(nick) {
    let lowerNick = nick.toLowerCase().replace(/\s+/g, '');
    for (let word of badWordsList) {
        if (lowerNick.includes(word)) return false;
    }
    return true;
}

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Sprawdzanie unikalności Nicku w bazie
async function isNickTaken(nickToCheck) {
    try {
        const snapshot = await db.collection("leaderboard_alltime")
                                 .doc("global")
                                 .collection("scores")
                                 .where("nick", "==", nickToCheck)
                                 .get();
        let taken = false;
        snapshot.forEach(doc => { if (doc.id !== playerId) taken = true; });
        return taken;
    } catch (e) {
        console.error("Błąd weryfikacji:", e); return false;
    }
}

function promptForNick(callback) {
    if (playerNickname && playerId && !playerId.startsWith('guest_')) {
        callback();
    } else if (playerNickname) {
        callback();
    } else {
        const overlay = document.getElementById('nickOverlay');
        overlay.style.display = 'block';
        setTimeout(() => overlay.style.opacity = '1', 10); 
        window.nickCallback = callback; 
    }
}

// Bezpieczny Zapis Nicku (Z weryfikacją w DB)
async function saveNick() {
    let input = document.getElementById('nickInput').value.trim();
    if (input.length < 3) { alert("Nick musi mieć minimum 3 znaki!"); return; }
    if (!isNickClean(input)) { alert("Ten nick narusza zasady. Wybierz inny."); document.getElementById('nickInput').value = ""; return; }

    let safeInput = escapeHTML(input); 
    const btn = document.querySelector('#nickOverlay .btn-reset');
    const originalText = btn.innerText;
    btn.innerText = "SPRAWDZANIE..."; btn.disabled = true;

    const taken = await isNickTaken(safeInput);
    if (taken) {
        alert("Ten nick jest już zajęty przez innego gracza! Wymyśl inny.");
        btn.innerText = originalText; btn.disabled = false; return;
    }

    playerNickname = safeInput;
    localStorage.setItem('speedwayNickname', playerNickname);
    
    const overlay = document.getElementById('nickOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
    
    btn.innerText = originalText; btn.disabled = false;
    if (window.nickCallback) { window.nickCallback(); window.nickCallback = null; }
}

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
    document.getElementById('calendarMonthDisplay').innerText = `${i18n[currentLang].months[calRenderMonth]} ${calRenderYear}`;
    
    const wdContainer = document.getElementById('calendarWeekdays');
    wdContainer.innerHTML = '';
    i18n[currentLang].weekdays.forEach(wd => { wdContainer.innerHTML += `<div>${wd}</div>`; });

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
            if (userStats.dailyResults[dailyNum] === 'win') { box.classList.add('win'); }
            else if (userStats.dailyResults[dailyNum] === 'loss') { box.classList.add('loss'); }
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

// --- BAZA DANYCH FIREBASE ---
async function sendScoreToDatabase(isWin, attempts) {
    if (selectedDailyDay !== currentDailyDay) return;
    if (!playerNickname) return;

    try {
        const batch = db.batch();
        const ts = firebase.firestore.FieldValue.serverTimestamp();
        
        const safeNick = escapeHTML(playerNickname);
        
        const dailyRef = db.collection("rankings").doc(currentDailyDay.toString()).collection("scores").doc(playerId);
        batch.set(dailyRef, { nick: safeNick, won: isWin ? 1 : 0, guesses: attempts, timestamp: ts }, { merge: true });

        const increment = firebase.firestore.FieldValue.increment;
        
        if(isWin) {
            const weeklyRef = db.collection("leaderboard_weekly").doc(getCurrentWeekStr()).collection("scores").doc(playerId);
            batch.set(weeklyRef, { nick: safeNick, wins: increment(1), guesses: increment(attempts), timestamp: ts }, { merge: true });

            const monthlyRef = db.collection("leaderboard_monthly").doc(getCurrentMonthStr()).collection("scores").doc(playerId);
            batch.set(monthlyRef, { nick: safeNick, wins: increment(1), guesses: increment(attempts), timestamp: ts }, { merge: true });

            const alltimeRef = db.collection("leaderboard_alltime").doc("global").collection("scores").doc(playerId);
            batch.set(alltimeRef, { nick: safeNick, wins: increment(1), guesses: increment(attempts), timestamp: ts }, { merge: true });
        }

        await batch.commit();
    } catch (e) { console.error("DB Error:", e); }
}

function updateStatsOnWin() {
    if(hasWon || hasLost) return; hasWon = true;
    userStats.played++; userStats.won++; userStats.currentStreak++;
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
        document.getElementById('mainMenuContainer').style.display = 'none'; 
        document.getElementById('gameContainer').style.display = 'block'; 
        initGame(); 
    });
}

function startEndlessGame() { gameMode = 'endless'; document.getElementById('mainMenuContainer').style.display = 'none'; document.getElementById('gameContainer').style.display = 'block'; initGame(); }

function triggerErrorShake() {
    const inputWrapper = document.querySelector('.input-wrapper');
    inputWrapper.classList.add('shake-error');
    playSound('error');
    setTimeout(() => { inputWrapper.classList.remove('shake-error'); }, 400);
}

function updateCounterDisplay() { 
    const container = document.getElementById('livesContainer');
    container.style.display = 'flex';
    container.innerHTML = '';
    
    for (let i = 0; i < GUESS_LIMIT; i++) {
        const isLost = i < guessCount;
        const isJustLost = (i === guessCount - 1) && !isRestoring && !hasWon; 
        
        let cls = "helmet-icon";
        if (isJustLost) cls += " life-lost-anim";
        else if (isLost) cls += " helmet-lost"; 
        
        container.innerHTML += `<img src="kask-zycie.png" class="${cls}" alt="Kask">`;
    }
}

function clearGameBoard() {
    guessCount = 0; guessHistory = []; guessedPlayersNames = []; hasWon = false; hasLost = false; isRestoring = false;
    document.getElementById('results').innerHTML = ''; document.getElementById('guessInput').value = '';
    document.getElementById('mysteryPhoto').style.display = 'none'; document.getElementById('mysteryPlaceholder').style.display = 'block';
    document.getElementById('photoWrapper').classList.remove('revealed'); document.getElementById('mysteryName').innerText = '???';
    document.getElementById('mysteryName').style.color = 'var(--text-main)'; document.getElementById('postGameActions').style.display = 'none';
}

function resetBoardAndPlay() {
    document.getElementById('winOverlay').style.opacity = '0'; document.getElementById('loseOverlay').style.opacity = '0';
    setTimeout(() => { document.getElementById('winOverlay').style.display = 'none'; document.getElementById('loseOverlay').style.display = 'none'; }, 200);
    clearGameBoard();
    gameMode = 'endless'; initGame();
}

function seededRandom(seed) { const x = Math.sin(seed) * 10000; return x - Math.floor(x); }

function initGame() {
    let randomIndex;
    const modeDisplay = document.getElementById('gameModeDisplay');
    const controls = document.getElementById('gameDailyControls');
    const inputSec = document.querySelector('.input-section');
    
    if (gameMode === 'daily') {
        controls.style.display = 'flex';
        dailyNumberGlobal = getDailyDateString(selectedDailyDay);
        randomIndex = Math.floor(seededRandom(selectedDailyDay * 9999) * playersDB.length);
        targetPlayer = playersDB[randomIndex];
        modeDisplay.innerText = `${i18n[currentLang].modeDaily} ${dailyNumberGlobal}`;
        
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

        modeDisplay.innerText = i18n[currentLang].modeEndless;
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
        document.getElementById('results').innerHTML = `<div style="text-align: center; margin-top: 30px; color: var(--text-dim); font-weight: 600;">Brak zapisu dla tego dnia.</div>`;
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
    document.getElementById('btnPlayAgainPost').innerText = i18n[currentLang].btnPlayEndless;
    document.getElementById('postGameActions').style.display = 'flex';
    isRestoring = false;
}

function removePolishAccents(str) {
    const accents = 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ'; const noAccents = 'acelnoszzACELNOSZZ';
    return str.split('').map(char => { const index = accents.indexOf(char); return index !== -1 ? noAccents[index] : char; }).join('');
}
function getCleanClubName(clubName) { return clubName ? clubName.replace(" (W)", "").trim() : ""; }
function getClubAbbr(clubName) {
    if (!clubName) return "---"; let cleanName = getCleanClubName(clubName).toLowerCase();
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
    
    newInput.addEventListener('input', function() {
        let val = this.value; 
        closeAllLists(); 
        if (!val || val.length < 2) return;
        
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
    const boxes = document.querySelectorAll('.path-box'); let guessedClubs = guessedPlayer.pastClubs.map(getCleanClubName);
    boxes.forEach(box => {
        if (!box.dataset.club) return;
        if (guessedClubs.includes(getCleanClubName(box.dataset.club)) && box.innerText === '?') {
            let cleanC = getCleanClubName(box.dataset.club).toLowerCase();
            if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC)) {
                box.classList.add('club-special');
            }
            box.innerHTML = `<span>${getClubAbbr(box.dataset.club)}</span>${box.dataset.club.includes("(W)") ? '<div class="loan-badge">W</div>' : ''}`;
            
            box.classList.add('found', 'tooltip');
            box.setAttribute('data-tip', box.dataset.club);
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
    
    const isTargetGP = targetPlayer.gp === true || targetPlayer.gp === "Tak" || targetPlayer.gp === "tak"; 
    const isGuessGP = player.gp === true || player.gp === "Tak" || player.gp === "tak";
    const gpCls = (isGuessGP === isTargetGP) ? "green" : "red"; const gpIcon = isGuessGP ? "✅" : "❌";
    
    const yearCls = (player.year === targetPlayer.year) ? "green" : "red";
    let yearContent = `<span>${player.year}</span>`;
    if (player.year > targetPlayer.year) yearContent += `<span class="val-arrow" title="⬇️">⬇️</span>`;
    else if (player.year < targetPlayer.year) yearContent += `<span class="val-arrow" title="⬆️">⬆️</span>`;

    const dmpCls = (player.dmp === targetPlayer.dmp) ? "green" : "red";
    let dmpContent = `<span>${player.dmp}</span>`;
    if (player.dmp > targetPlayer.dmp) dmpContent += `<span class="val-arrow" title="⬇️">⬇️</span>`;
    else if (player.dmp < targetPlayer.dmp) dmpContent += `<span class="val-arrow" title="⬆️">⬆️</span>`;

    const pCountries = player.country.split("/").map(c => c.trim()); const tCountries = targetPlayer.country.split("/").map(c => c.trim());
    let countryCls = "red";
    if (player.country === targetPlayer.country) countryCls = "green";
    else if (pCountries.some(c => tCountries.includes(c))) countryCls = "half";
    else if (player.region === targetPlayer.region) countryCls = "yellow";

    let c1 = countryToCode[pCountries[0]] || 'pl';
    let countryContent = pCountries.length > 1 ? `<div class="tile-flag-dual" title="${player.country}"><img src="https://flagcdn.com/h80/${c1}.png" class="flag-left"><img src="https://flagcdn.com/h80/${countryToCode[pCountries[1]] || 'pl'}.png" class="flag-right"></div>` : `<img src="https://flagcdn.com/w80/${c1}.png" class="tile-flag" title="${player.country}">`;

    let targetCleanClubs = targetPlayer.pastClubs.map(getCleanClubName);
    let clubsHTML = player.pastClubs.map(c => {
        let isLoan = c.includes("(W)"); let isMatch = targetCleanClubs.includes(getCleanClubName(c));
        let matchClass = isMatch ? 'club-match' : 'club-dim';
        let cleanC = getCleanClubName(c).toLowerCase();
        let isSpecial = ['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC);
        let specialClass = isSpecial ? ' club-special' : '';
        return `<div class="club-logo-wrapper tooltip" data-tip="${c}"><div class="club-abbr-box ${matchClass}${specialClass}">${getClubAbbr(c)}</div>${isLoan ? '<div class="loan-badge">W</div>' : ''}</div>`;
    }).join('<div class="club-divider"></div>');

    let d1 = isRestore ? 0 : 0.1; let d2 = isRestore ? 0 : 0.3; let d3 = isRestore ? 0 : 0.5;
    let d4 = isRestore ? 0 : 0.7; let d5 = isRestore ? 0 : 0.9; let d6 = isRestore ? 0 : 1.1;

    row.innerHTML = `
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
        setTimeout(() => playSound('flip'), 100); setTimeout(() => playSound('flip'), 300);
        setTimeout(() => playSound('flip'), 500); setTimeout(() => playSound('flip'), 700);
        setTimeout(() => playSound('flip'), 900); setTimeout(() => playSound('flip'), 1100);
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
    revealTargetInfoUI(); launchConfetti();
    const overlay = document.getElementById('winOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    const btnPlayAgainPost = document.getElementById('btnPlayAgainPost');
    if (gameMode === 'daily') { document.getElementById('btnSharePost').style.display = 'inline-block'; btnPlayAgainPost.innerText = i18n[currentLang].btnPlayEndless; } 
    else { document.getElementById('btnSharePost').style.display = 'none'; btnPlayAgainPost.innerText = i18n[currentLang].btnPlayAgain; }
    setTimeout(() => { overlay.style.opacity = '0'; setTimeout(() => { overlay.style.display = 'none'; document.getElementById('postGameActions').style.display = 'flex'; }, 200); }, 1500);
}

function handleLoss() {
    playSound('lose');
    revealTargetInfoUI();
    const overlay = document.getElementById('loseOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    document.getElementById('btnSharePost').style.display = 'none';
    document.getElementById('btnPlayAgainPost').innerText = gameMode === 'daily' ? i18n[currentLang].btnPlayEndless : i18n[currentLang].btnPlayAgain;
    setTimeout(() => { overlay.style.opacity = '0'; setTimeout(() => { overlay.style.display = 'none'; document.getElementById('postGameActions').style.display = 'flex'; }, 200); }, 1500);
}

function revealTargetInfoUI() {
    document.getElementById('mysteryPlaceholder').style.display = 'none';
    const photoImg = document.getElementById('mysteryPhoto'); photoImg.src = `images/riders/image_0.png`; photoImg.style.display = 'block';
    document.getElementById('photoWrapper').classList.add('revealed');
    document.getElementById('mysteryName').innerText = targetPlayer.name;
    if (hasLost) document.getElementById('mysteryName').style.color = "var(--red-neon)";
    
    document.querySelectorAll('.path-box').forEach(box => {
        if (!box.dataset.club) return;
        let cleanC = getCleanClubName(box.dataset.club).toLowerCase();
        if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC)) {
            box.classList.add('club-special');
        }
        box.innerHTML = `<span>${getClubAbbr(box.dataset.club)}</span>${box.dataset.club.includes("(W)") ? '<div class="loan-badge">W</div>' : ''}`;
        box.classList.add('found', 'tooltip');
        box.setAttribute('data-tip', box.dataset.club);
    });
    const endBox = document.getElementById('pathBox-retired');
    if (endBox) { endBox.innerText = '❌'; endBox.classList.add('found'); endBox.style.border = 'none'; endBox.style.background = 'transparent'; }
}

async function shareResult() {
    if (gameMode !== 'daily') return;
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    canvas.width = 1080; canvas.height = 1920;
    const grd = ctx.createRadialGradient(540, 0, 0, 540, 0, 1920);
    grd.addColorStop(0, "#1e1e22"); grd.addColorStop(1, "#0a0a0c");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ffffff"; ctx.font = "900 80px Montserrat, sans-serif"; ctx.textAlign = "center"; ctx.fillText("🏁 SPEEDWAY GUESSR", 540, 200);
    ctx.fillStyle = "#f1c40f"; ctx.font = "700 50px Montserrat, sans-serif"; ctx.fillText(`DAILY ${dailyNumberGlobal}`, 540, 280);
    ctx.fillStyle = "#ffffff"; ctx.font = "900 120px Montserrat, sans-serif";
    const scoreText = hasWon ? `${guessCount}/${GUESS_LIMIT}` : `X/${GUESS_LIMIT}`;
    ctx.fillText(scoreText, 540, 450);

    const startY = 600; const boxSize = 100; const gap = 20;
    const gridWidth = (5 * boxSize) + (4 * gap); const startX = (1080 - gridWidth) / 2;
    const colorMap = { "🟩": "#00ff66", "🟨": "#ffcc00", "🟥": "#ff3333" };

    guessHistory.forEach((rowString, rowIndex) => {
        const rowEmojis = Array.from(rowString).filter(char => char in colorMap);
        rowEmojis.forEach((emoji, colIndex) => {
            ctx.fillStyle = colorMap[emoji];
            const x = startX + colIndex * (boxSize + gap); const y = startY + rowIndex * (boxSize + gap); const radius = 20;
            ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + boxSize - radius, y); ctx.quadraticCurveTo(x + boxSize, y, x + boxSize, y + radius); ctx.lineTo(x + boxSize, y + boxSize - radius); ctx.quadraticCurveTo(x + boxSize, y + boxSize, x + boxSize - radius, y + boxSize); ctx.lineTo(x + radius, y + boxSize); ctx.quadraticCurveTo(x, y + boxSize, x, y + boxSize - radius); ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath(); ctx.fill();
        });
    });

    ctx.fillStyle = "#8e8e93"; ctx.font = "400 30px Montserrat, sans-serif"; ctx.fillText("speedway-guessr.github.io", 540, 1850);

    try {
        canvas.toBlob(async (blob) => {
            if (!blob) { alert("Błąd generowania obrazu."); return; }
            const file = new File([blob], `speedway-guessr-${dailyNumberGlobal}.png`, { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: `Speedway Guessr Daily ${dailyNumberGlobal}`, text: i18n[currentLang].shareText });
            } else { alert("Niestety Twoja przeglądarka nie obsługuje bezpośredniego udostępniania obrazów. \n\nZrób zrzut ekranu, aby podzielić się wynikiem na Instagramie!"); }
        }, "image/png");
    } catch (error) { console.error("Error sharing:", error); alert("Wystąpił nieoczekiwany błąd podczas udostępniania."); }
}

function showStats() {
    document.getElementById('statPlayed').innerText = userStats.played; document.getElementById('statWon').innerText = userStats.won;
    document.getElementById('statStreak').innerText = userStats.currentStreak; document.getElementById('statMaxStreak').innerText = userStats.maxStreak;
    const overlay = document.getElementById('statsOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}

function openSettings() {
    const overlay = document.getElementById('settingsOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeSettings() {
    const overlay = document.getElementById('settingsOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
}

// --- ZABEZPIECZONE ŁADOWANIE RANKINGU ---
function openRanking() {
    promptForNick(async () => {
        const overlay = document.getElementById('rankingOverlay');
        overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
        loadRanking('daily');
    });
}

async function loadRanking(type) {
    document.querySelectorAll('.rank-tab').forEach(btn => btn.classList.remove('active'));
    const activeTab = document.getElementById(`tab-${type}`);
    if (activeTab) activeTab.classList.add('active');

    const tbody = document.getElementById('rankingTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Ładowanie z serwera... ⏳</td></tr>';
    
    let headerWon = document.getElementById('rankHeaderWon');
    let dateDisplay = document.getElementById('rankingDateDisplay');
    
    if (type === 'daily') {
        if (headerWon) headerWon.style.display = 'none';
        if (dateDisplay) {
            dateDisplay.innerText = `Wyniki z: ${getDailyDateString(selectedDailyDay)} (Daily #${selectedDailyDay})`;
            dateDisplay.style.display = 'block';
        }
    } else {
        if (headerWon) {
            headerWon.style.display = '';
            headerWon.innerText = i18n[currentLang].rankTotalWins || "Suma Wygranych";
        }
        if (dateDisplay) dateDisplay.style.display = 'none';
    }

    try {
        let snapshot;
        if (type === 'daily') snapshot = await db.collection("rankings").doc(selectedDailyDay.toString()).collection("scores").get();
        else if (type === 'weekly') snapshot = await db.collection("leaderboard_weekly").doc(getCurrentWeekStr()).collection("scores").get();
        else if (type === 'monthly') snapshot = await db.collection("leaderboard_monthly").doc(getCurrentMonthStr()).collection("scores").get();
        else if (type === 'alltime') snapshot = await db.collection("leaderboard_alltime").doc("global").collection("scores").get();
        
        let scores = [];
        snapshot.forEach(doc => { scores.push(doc.data()); });

        scores.sort((a, b) => {
            let winsA = a.won !== undefined ? a.won : (a.wins || 0);
            let winsB = b.won !== undefined ? b.won : (b.wins || 0);
            
            if (winsB !== winsA) return winsB - winsA; 
            if (a.guesses !== b.guesses) return a.guesses - b.guesses; 
            return (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0); 
        });

        if (tbody) tbody.innerHTML = '';
        
        if (scores.length === 0) {
            let colspan = type === 'daily' ? "3" : "4";
            if (tbody) tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center;">Brak wyników. Bądź pierwszy! 🏆</td></tr>`;
            return;
        }

        scores.forEach((row, index) => {
            let rankClass = "";
            if (index === 0) rankClass = "rank-1";
            else if (index === 1) rankClass = "rank-2";
            else if (index === 2) rankClass = "rank-3";
            
            let wonCol = '';
            if (type !== 'daily') {
                let winsAmount = row.won !== undefined ? row.won : (row.wins || 0);
                let wonText = winsAmount > 0 ? `<span class="rank-won">${winsAmount}</span>` : `<span class="rank-lost">0</span>`;
                wonCol = `<td>${wonText}</td>`;
            }
            
            // Bezpieczne użycie funkcji escapeHTML
            let safeRenderNick = typeof escapeHTML === 'function' ? escapeHTML(row.nick || "Gracz") : (row.nick || "Gracz");
            let isMe = safeRenderNick === playerNickname ? 'style="background: rgba(255,255,255,0.05);"' : '';

            if (tbody) {
                tbody.innerHTML += `
                    <tr ${isMe}>
                        <td class="${rankClass}">${index + 1}</td>
                        <td class="rank-nick ${rankClass}">${safeRenderNick}</td>
                        ${wonCol}
                        <td>${row.guesses}</td>
                    </tr>
                `;
            }
        });

    } catch (e) {
        console.error("Błąd ładowania rankingu:", e);
        let colspan = type === 'daily' ? "3" : "4";
        if (tbody) tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center; color: var(--red-neon);">Błąd łączenia z bazą danych ❌</td></tr>`;
    }
}

function closeRanking() {
    const overlay = document.getElementById('rankingOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
}

function closeStats() { document.getElementById('statsOverlay').style.opacity = '0'; setTimeout(() => document.getElementById('statsOverlay').style.display = 'none', 300); }
function setTheme(themeName) { document.documentElement.setAttribute('data-theme', themeName); localStorage.setItem('theme', themeName); }

function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas'); const ctx = canvas.getContext('2d'); canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    let particles = []; for (let i = 0; i < 150; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*-canvas.height, color: ['#f1c40f','#e74c3c','#2ecc71','#3498db'][Math.floor(Math.random()*4)], sy: Math.random()*4+2, r: Math.random()*360 });
    function draw() { ctx.clearRect(0,0,canvas.width,canvas.height); particles.forEach(p => { ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r*Math.PI/180); ctx.fillStyle=p.color; ctx.fillRect(-5,-10,10,20); ctx.restore(); p.y+=p.sy; if(p.y>canvas.height)p.y=-20; }); requestAnimationFrame(draw); } draw();
}
