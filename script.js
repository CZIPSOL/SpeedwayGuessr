// ==============================================
// ====== ZMIENNE GLOBALNE I KONFIGURACJA =======
// ==============================================

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
            if (cloudStats.played > userStats.played) {
                userStats = cloudStats;
                localStorage.setItem('speedwayStatsV2', JSON.stringify(userStats));
                if(document.getElementById('profileOverlay').style.display === 'block') { openProfile(); }
            } else { syncStatsToFirebase(); }
        } else { syncStatsToFirebase(); }
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

function openProfile() {
    document.getElementById('profileStatPlayed').innerText = userStats.played; 
    document.getElementById('profileStatWon').innerText = userStats.won;
    document.getElementById('profileStatStreak').innerText = userStats.currentStreak; 
    document.getElementById('profileStatMax').innerText = userStats.maxStreak;
    document.getElementById('changeNickInput').value = playerNickname || "";
    
    const overlay = document.getElementById('profileOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeProfile() {
    const overlay = document.getElementById('profileOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
}

// ==============================================
// ====== BEZPIECZEŃSTWO I NICKI (ANTI-CHEAT) ===
// ==============================================

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
    "porno", "hitler", "stfu", "kys"
];

function isNickClean(nick) {
    let lowerNick = nick.toLowerCase().replace(/\s+/g, '');
    for (let word of badWordsList) { if (lowerNick.includes(word)) return false; }
    return true;
}

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

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
    "brak klubu": "🚫", "brak": "🚫", "zawieszenie": "⛔", "kontuzja": "🚑", "koniec kariery": "🛑"
};

const countryToCode = { "Polska": "pl", "Wielka Brytania": "gb", "Dania": "dk", "Australia": "au", "Szwecja": "se", "Słowacja": "sk", "Rosja": "ru", "Łotwa": "lv", "Niemcy": "de", "Francja": "fr", "Słowenia": "si", "USA": "us", "Norwegia": "no", "Ukraina": "ua", "Finlandia": "fi", "Czechy": "cz", "Włochy": "it", "Hiszpania": "es" };

const i18n = {
    pl: { account: "TWÓJ PROFIL", loginDesc: "Zaloguj się przez Google, aby wejść do rankingu!", btnLoginGoogle: "ZALOGUJ PRZEZ GOOGLE", orGuest: "LUB PODAJ NICK GOŚCIA", guestPlaceholder: "Wpisz nick (max 12 znaków)", btnSavePlay: "ZAPISZ I GRAJ", btnLogout: "WYLOGUJ SIĘ", settingsTitle: "USTAWIENIA", sound: "Dźwięk:", soundOn: "Włączony 🔊", soundOff: "Wyłączony 🔇", subtitle: "Edycja Żużlowa", lastGames: "Ostatnie gry Daily:", btnDaily: "Graj Daily", btnReview: "Przejrzyj grę", btnEndless: "Endless Guessr", searchPlaceholder: "Wpisz imię/nazwisko zawodnika...", btnGuess: "ZGADNIJ", teams: "Drużyny:", colName: "Zawodnik", colCountry: "Kraj", colYear: "Rok ur.", colGP: "W GP?", colDMP: "Medale DMP", colStatus: "Status", colClubs: "Historia Klubów", stats: "STATYSTYKI", statPlayed: "Rozegrane", statWon: "Wygrane", statStreak: "Akt. Seria", statMax: "Najlepsza", btnClose: "ZAMKNIJ", archive: "ARCHIWUM DAILY", winTitle: "BRAWO!", winSub: "Odgadłeś zawodnika!", loseTitle: "KONIEC PRÓB", loseSub: "Niestety, nie udało Ci się odgadnąć.", btnShare: "UDOSTĘPNIJ 📋", btnPlayEndless: "GRAJ W TRYB ENDLESS", btnPlayAgain: "ZAGRAJ PONOWNIE", btnMenu: "MENU GŁÓWNE", theme: "Motyw:", themeLight: "Jasny", themeDark: "Ciemny", lang: "Język:", modeDaily: "Tryb: Daily", modeEndless: "Tryb: Endless", tabDaily: "DZIENNY", tabWeekly: "TYDZIEŃ", tabMonthly: "MIESIĄC", tabAllTime: "OGÓLNY", rankWonToday: "Wygrane", rankTotalWins: "Suma Wygranych", rankGuesses: "Próby", months: ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"], weekdays: ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"] },
    // Dodatkowe języki omijam dla przejrzystości, pl wystarczy jako core. Jeśli miałeś inne, zostaną one obsłużone z góry, ale polski to podstawa.
};

let currentLang = localStorage.getItem('speedwayLang') || 'pl';

function setLang(lang) {
    currentLang = lang; localStorage.setItem('speedwayLang', lang);
    document.querySelectorAll('.lang-flag').forEach(el => el.classList.remove('active'));
    const flagEl = document.getElementById('flag-' + lang); if(flagEl) flagEl.classList.add('active');

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang] && i18n[lang][key]) {
            if (el.tagName === 'INPUT') el.placeholder = i18n[lang][key];
            else el.innerHTML = i18n[lang][key];
        }
    });

    updateDailyMenu(); updateSoundBtn(); updateAuthUI(auth.currentUser);
    if(document.getElementById('calendarOverlay').style.display === 'block') renderCalendar();
    
    const modeDisplay = document.getElementById('gameModeDisplay');
    if (gameMode === 'daily') modeDisplay.innerText = `${i18n[currentLang].modeDaily} ${dailyNumberGlobal}`;
    else modeDisplay.innerText = i18n[currentLang].modeEndless;
}

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
}

const helmetImgObj = new Image(); function preloadHelmetImage() { helmetImgObj.src = 'kask-zycie.png'; }
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
function saveStats() { localStorage.setItem('speedwayStatsV2', JSON.stringify(userStats)); syncStatsToFirebase(); }

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
    document.getElementById('dailyDayDisplay').innerText = `Daily ${getDailyDateString(selectedDailyDay)}`;
    document.getElementById('btnPrevDaily').style.visibility = (selectedDailyDay <= 1) ? 'hidden' : 'visible';
    document.getElementById('btnNextDaily').style.visibility = (selectedDailyDay >= currentDailyDay) ? 'hidden' : 'visible';
    
    const btn = document.getElementById('btnDailyMode'); const txt = document.getElementById('dailyBtnText');
    if (userStats.dailyResults[selectedDailyDay]) { btn.classList.remove('disabled'); txt.innerHTML = i18n[currentLang].btnReview; } 
    else { btn.classList.remove('disabled'); txt.innerHTML = i18n[currentLang].btnDaily; }
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
        gameMode = 'daily'; document.getElementById('mainMenuContainer').style.display = 'none'; document.getElementById('gameContainer').style.display = 'block'; initGame(); 
    });
}

function startEndlessGame() { gameMode = 'endless'; document.getElementById('mainMenuContainer').style.display = 'none'; document.getElementById('gameContainer').style.display = 'block'; initGame(); }

function triggerErrorShake() { const inputWrapper = document.querySelector('.input-wrapper'); inputWrapper.classList.add('shake-error'); playSound('error'); setTimeout(() => { inputWrapper.classList.remove('shake-error'); }, 400); }

function updateCounterDisplay() { 
    const container = document.getElementById('livesContainer'); container.style.display = 'flex'; container.innerHTML = '';
    for (let i = 0; i < GUESS_LIMIT; i++) {
        const isLost = i < guessCount; const isJustLost = (i === guessCount - 1) && !isRestoring && !hasWon; 
        let cls = "helmet-icon";
        if (isJustLost) cls += " life-lost-anim"; else if (isLost) cls += " helmet-lost"; 
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
    clearGameBoard(); gameMode = 'endless'; initGame();
}

function seededRandom(seed) { const x = Math.sin(seed) * 10000; return x - Math.floor(x); }

function initGame() {
    let randomIndex; const modeDisplay = document.getElementById('gameModeDisplay'); const controls = document.getElementById('gameDailyControls'); const inputSec = document.querySelector('.input-section');
    
    if (gameMode === 'daily') {
        controls.style.display = 'flex'; dailyNumberGlobal = getDailyDateString(selectedDailyDay);
        randomIndex = Math.floor(seededRandom(selectedDailyDay * 9999) * playersDB.length); targetPlayer = playersDB[randomIndex];
        modeDisplay.innerText = `${i18n[currentLang].modeDaily} ${dailyNumberGlobal}`;
        
        if (userStats.dailyResults[selectedDailyDay]) { inputSec.style.display = 'none'; restorePlayedGame(); } 
        else { inputSec.style.display = 'block'; }
    } else {
        controls.style.display = 'none'; inputSec.style.display = 'block';
        let availablePlayers = playersDB.filter(p => !userStats.recentEndless.includes(p.id));
        if (availablePlayers.length < 15) { userStats.recentEndless = []; availablePlayers = playersDB; }
        randomIndex = Math.floor(Math.random() * availablePlayers.length); targetPlayer = availablePlayers[randomIndex];
        
        userStats.recentEndless.push(targetPlayer.id); if (userStats.recentEndless.length > 60) userStats.recentEndless.shift(); saveStats();
        modeDisplay.innerText = i18n[currentLang].modeEndless;
    }
    if(inputSec.style.display !== 'none') { buildTeamPath(); setupAutocomplete(); updateCounterDisplay(); }
}

function restorePlayedGame() {
    isRestoring = true; buildTeamPath(); const pastGuesses = userStats.dailyGuesses[selectedDailyDay] || [];
    if (pastGuesses.length === 0) { document.getElementById('results').innerHTML = `<div style="text-align: center; margin-top: 30px; color: var(--text-dim); font-weight: 600;">Brak zapisu dla tego dnia.</div>`; } 
    else { pastGuesses.forEach(pName => { const p = playersDB.find(x => x.name === pName); if(p) { guessCount++; guessedPlayersNames.push(p.name); renderGuess(p, true); revealClubsOnPath(p); } }); }
    updateCounterDisplay(); hasWon = userStats.dailyResults[selectedDailyDay] === 'win'; hasLost = userStats.dailyResults[selectedDailyDay] === 'loss'; revealTargetInfoUI();
    document.getElementById('btnSharePost').style.display = 'inline-block'; document.getElementById('btnPlayAgainPost').innerText = i18n[currentLang].btnPlayEndless; document.getElementById('postGameActions').style.display = 'flex'; isRestoring = false;
}

function removePolishAccents(str) { const accents = 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ'; const noAccents = 'acelnoszzACELNOSZZ'; return str.split('').map(char => { const index = accents.indexOf(char); return index !== -1 ? noAccents[index] : char; }).join(''); }
function getCleanClubName(clubName) { return clubName ? clubName.replace(" (W)", "").trim() : ""; }
function getClubAbbr(clubName) { if (!clubName) return "---"; let cleanName = getCleanClubName(clubName).toLowerCase(); if (clubAbbreviations[cleanName]) return clubAbbreviations[cleanName]; let words = cleanName.split(' '); return removePolishAccents(words[words.length - 1].substring(0, 3)).toUpperCase(); }

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
    targetPlayer.pastClubs.forEach((club, index) => {
        const box = document.createElement('div'); box.className = 'path-box'; box.innerText = '?'; box.dataset.club = club; pathContainer.appendChild(box);
        if (index < targetPlayer.pastClubs.length - 1) { const arrow = document.createElement('div'); arrow.className = 'path-arrow'; arrow.innerText = '→'; pathContainer.appendChild(arrow); }
    });
    if (targetPlayer.status.toLowerCase().includes("koniec") || targetPlayer.status === "Ś.P.") { const arrow = document.createElement('div'); arrow.className = 'path-arrow'; arrow.innerText = '→'; pathContainer.appendChild(arrow); const endIcon = document.createElement('div'); endIcon.className = 'path-box'; endIcon.id = 'pathBox-retired'; endIcon.innerText = '?'; pathContainer.appendChild(endIcon); }
}

function makeGuess() {
    if(hasWon || hasLost) return; const input = document.getElementById('guessInput').value.trim();
    if (!input) { triggerErrorShake(); return; }
    const guessedPlayer = playersDB.find(p => p.name.toLowerCase() === input.toLowerCase());
    if (!guessedPlayer || guessedPlayersNames.includes(guessedPlayer?.name)) { triggerErrorShake(); return; }
    
    guessedPlayersNames.push(guessedPlayer.name); playSound('guess');
    if (gameMode === 'daily') { if (!userStats.dailyGuesses[selectedDailyDay]) userStats.dailyGuesses[selectedDailyDay] = []; userStats.dailyGuesses[selectedDailyDay].push(guessedPlayer.name); saveStats(); }
    
    guessCount++; updateCounterDisplay(); renderGuess(guessedPlayer); revealClubsOnPath(guessedPlayer); document.getElementById('guessInput').value = "";
    if (guessedPlayer.name !== targetPlayer.name && guessCount >= GUESS_LIMIT) { updateStatsOnLoss(); setTimeout(handleLoss, 1400); }
}

function revealClubsOnPath(guessedPlayer) {
    const boxes = document.querySelectorAll('.path-box'); let guessedClubs = guessedPlayer.pastClubs.map(getCleanClubName);
    boxes.forEach(box => {
        if (!box.dataset.club) return;
        if (guessedClubs.includes(getCleanClubName(box.dataset.club)) && box.innerText === '?') {
            let cleanC = getCleanClubName(box.dataset.club).toLowerCase();
            if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC)) { box.classList.add('club-special'); }
            box.innerHTML = `<span>${getClubAbbr(box.dataset.club)}</span>${box.dataset.club.includes("(W)") ? '<div class="loan-badge">W</div>' : ''}`;
            box.classList.add('found', 'tooltip'); box.setAttribute('data-tip', box.dataset.club);
        }
    });
    if ((guessedPlayer.status.toLowerCase().includes("koniec") || guessedPlayer.status === "Ś.P.") && (targetPlayer.status.toLowerCase().includes("koniec") || targetPlayer.status === "Ś.P.")) {
        const endBox = document.getElementById('pathBox-retired'); if (endBox) { endBox.innerText = '❌'; endBox.classList.add('found'); endBox.style.border = 'none'; endBox.style.background = 'transparent'; }
    }
}

function renderGuess(player, isRestore = false) {
    const resultsDiv = document.getElementById('results'); const row = document.createElement('div'); row.className = 'guess-row'; let rowEmojis = "";
    const isTargetGP = targetPlayer.gp === true || targetPlayer.gp === "Tak" || targetPlayer.gp === "tak"; const isGuessGP = player.gp === true || player.gp === "Tak" || player.gp === "tak";
    const gpCls = (isGuessGP === isTargetGP) ? "green" : "red"; const gpIcon = isGuessGP ? "✅" : "❌";
    
    const yearCls = (player.year === targetPlayer.year) ? "green" : "red";
    let yearContent = `<span>${player.year}</span>`;
    if (player.year > targetPlayer.year) yearContent += `<span class="val-arrow" title="⬇️">⬇️</span>`; else if (player.year < targetPlayer.year) yearContent += `<span class="val-arrow" title="⬆️">⬆️</span>`;

    const dmpCls = (player.dmp === targetPlayer.dmp) ? "green" : "red";
    let dmpContent = `<span>${player.dmp}</span>`;
    if (player.dmp > targetPlayer.dmp) dmpContent += `<span class="val-arrow" title="⬇️">⬇️</span>`; else if (player.dmp < targetPlayer.dmp) dmpContent += `<span class="val-arrow" title="⬆️">⬆️</span>`;

    const pCountries = player.country.split("/").map(c => c.trim()); const tCountries = targetPlayer.country.split("/").map(c => c.trim());
    let countryCls = "red"; if (player.country === targetPlayer.country) countryCls = "green"; else if (pCountries.some(c => tCountries.includes(c))) countryCls = "half"; else if (player.region === targetPlayer.region) countryCls = "yellow";
    let c1 = countryToCode[pCountries[0]] || 'pl';
    let countryContent = pCountries.length > 1 ? `<div class="tile-flag-dual" title="${player.country}"><img src="https://flagcdn.com/h80/${c1}.png" class="flag-left"><img src="https://flagcdn.com/h80/${countryToCode[pCountries[1]] || 'pl'}.png" class="flag-right"></div>` : `<img src="https://flagcdn.com/w80/${c1}.png" class="tile-flag" title="${player.country}">`;

    let targetCleanClubs = targetPlayer.pastClubs.map(getCleanClubName);
    let clubsHTML = player.pastClubs.map(c => {
        let isLoan = c.includes("(W)"); let isMatch = targetCleanClubs.includes(getCleanClubName(c)); let matchClass = isMatch ? 'club-match' : 'club-dim';
        let cleanC = getCleanClubName(c).toLowerCase(); let isSpecial = ['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC); let specialClass = isSpecial ? ' club-special' : '';
        return `<div class="club-logo-wrapper tooltip" data-tip="${c}"><div class="club-abbr-box ${matchClass}${specialClass}">${getClubAbbr(c)}</div>${isLoan ? '<div class="loan-badge">W</div>' : ''}</div>`;
    }).join('<div class="club-divider"></div>');

    let d1 = isRestore ? 0 : 0.1; let d2 = isRestore ? 0 : 0.3; let d3 = isRestore ? 0 : 0.5; let d4 = isRestore ? 0 : 0.7; let d5 = isRestore ? 0 : 0.9; let d6 = isRestore ? 0 : 1.1;

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
    
    if (!isRestore) { setTimeout(() => playSound('flip'), 100); setTimeout(() => playSound('flip'), 300); setTimeout(() => playSound('flip'), 500); setTimeout(() => playSound('flip'), 700); setTimeout(() => playSound('flip'), 900); setTimeout(() => playSound('flip'), 1100); }
    
    ['country', 'year', 'gp', 'dmp', 'status'].forEach(attr => {
        let c = "red";
        if (attr === 'country') c = countryCls; else if (attr === 'year' && player.year === targetPlayer.year) c = "green"; else if (attr === 'gp' && isGuessGP === isTargetGP) c = "green"; else if (attr === 'dmp' && player.dmp === targetPlayer.dmp) c = "green"; else if (attr === 'status' && player.status === targetPlayer.status) c = "green";
        rowEmojis += c === "green" ? "🟩" : (c === "yellow" || c === "half") ? "🟨" : "🟥";
    });
    guessHistory.push(rowEmojis);
    if (!isRestore && player.name === targetPlayer.name) { updateStatsOnWin(); setTimeout(handleWin, 1400); }
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
    document.getElementById('mysteryPlaceholder').style.display = 'none'; const photoImg = document.getElementById('mysteryPhoto'); photoImg.src = `images/riders/image_0.png`; photoImg.style.display = 'block';
    document.getElementById('photoWrapper').classList.add('revealed'); document.getElementById('mysteryName').innerText = targetPlayer.name;
    if (hasLost) document.getElementById('mysteryName').style.color = "var(--red-neon)";
    document.querySelectorAll('.path-box').forEach(box => {
        if (!box.dataset.club) return;
        let cleanC = getCleanClubName(box.dataset.club).toLowerCase(); if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC)) { box.classList.add('club-special'); }
        box.innerHTML = `<span>${getClubAbbr(box.dataset.club)}</span>${box.dataset.club.includes("(W)") ? '<div class="loan-badge">W</div>' : ''}`; box.classList.add('found', 'tooltip'); box.setAttribute('data-tip', box.dataset.club);
    });
    const endBox = document.getElementById('pathBox-retired'); if (endBox) { endBox.innerText = '❌'; endBox.classList.add('found'); endBox.style.border = 'none'; endBox.style.background = 'transparent'; }
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

function openRanking() { promptForNick(async () => { const overlay = document.getElementById('rankingOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10); loadRanking('daily'); }); }

async function loadRanking(type) {
    document.querySelectorAll('.rank-tab').forEach(btn => btn.classList.remove('active')); const activeTab = document.getElementById(`tab-${type}`); if (activeTab) activeTab.classList.add('active');
    const tbody = document.getElementById('rankingTableBody'); if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Ładowanie z serwera... ⏳</td></tr>';
    let headerWon = document.getElementById('rankHeaderWon'); let dateDisplay = document.getElementById('rankingDateDisplay');
    
    if (type === 'daily') { if (headerWon) headerWon.style.display = 'none'; if (dateDisplay) { dateDisplay.innerText = `Wyniki z: ${getDailyDateString(selectedDailyDay)} (Daily #${selectedDailyDay})`; dateDisplay.style.display = 'block'; } } 
    else { if (headerWon) { headerWon.style.display = ''; headerWon.innerText = i18n[currentLang].rankTotalWins || "Suma Wygranych"; } if (dateDisplay) dateDisplay.style.display = 'none'; }

    try {
        let snapshot;
        if (type === 'daily') snapshot = await db.collection("rankings").doc(selectedDailyDay.toString()).collection("scores").get();
        else if (type === 'weekly') snapshot = await db.collection("leaderboard_weekly").doc(getCurrentWeekStr()).collection("scores").get();
        else if (type === 'monthly') snapshot = await db.collection("leaderboard_monthly").doc(getCurrentMonthStr()).collection("scores").get();
        else if (type === 'alltime') snapshot = await db.collection("leaderboard_alltime").doc("global").collection("scores").get();
        
        let scores = []; snapshot.forEach(doc => { scores.push(doc.data()); });
        scores.sort((a, b) => { let winsA = a.won !== undefined ? a.won : (a.wins || 0); let winsB = b.won !== undefined ? b.won : (b.wins || 0); if (winsB !== winsA) return winsB - winsA; if (a.guesses !== b.guesses) return a.guesses - b.guesses; return (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0); });
        if (tbody) tbody.innerHTML = '';
        if (scores.length === 0) { let colspan = type === 'daily' ? "3" : "4"; if (tbody) tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center;">Brak wyników. Bądź pierwszy! 🏆</td></tr>`; return; }

        scores.forEach((row, index) => {
            let rankClass = ""; if (index === 0) rankClass = "rank-1"; else if (index === 1) rankClass = "rank-2"; else if (index === 2) rankClass = "rank-3";
            let wonCol = ''; if (type !== 'daily') { let winsAmount = row.won !== undefined ? row.won : (row.wins || 0); let wonText = winsAmount > 0 ? `<span class="rank-won">${winsAmount}</span>` : `<span class="rank-lost">0</span>`; wonCol = `<td>${wonText}</td>`; }
            let safeRenderNick = typeof escapeHTML === 'function' ? escapeHTML(row.nick || "Gracz") : (row.nick || "Gracz");
            let isMe = safeRenderNick === playerNickname ? 'style="background: rgba(255,255,255,0.05);"' : '';
            if (tbody) { tbody.innerHTML += `<tr ${isMe}><td class="${rankClass}">${index + 1}</td><td class="rank-nick ${rankClass}">${safeRenderNick}</td>${wonCol}<td>${row.guesses}</td></tr>`; }
        });
    } catch (e) { console.error("Błąd ładowania rankingu:", e); let colspan = type === 'daily' ? "3" : "4"; if (tbody) tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center; color: var(--red-neon);">Błąd łączenia z bazą danych ❌</td></tr>`; }
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
let myClashColor = null; 
let clashTimerInterval = null;
let clashStatus = 'none'; 
let clashTurn = 'red';
let clashRows = [];
let clashCols = [];
let clashBoardState = Array(9).fill(null); 
let clashGuessedPlayers = [];
let clashActiveCellIdx = null;

// --- ANTI-CHEAT (Wyłapywanie zmiany karty/okna) ---
document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentClashRoom && clashStatus === 'playing') {
        if (clashTurn === myClashColor) {
            alert("⚠️ Wykryto zmianę karty! Tracisz turę za podejrzenie oszukiwania.");
            skipClashTurn("Pudło! (Opuścił okno gry)");
        }
    }
});

function updateClashTurnUI() {
    let p1El = document.getElementById('clashPlayer1');
    let p2El = document.getElementById('clashPlayer2');
    if(p1El) p1El.className = clashTurn === 'red' ? 'clash-player active' : 'clash-player';
    if(p2El) p2El.className = clashTurn === 'blue' ? 'clash-player active' : 'clash-player';
}

function startClashGame() {
    promptForNick(() => {
        document.getElementById('mainMenuContainer').style.display = 'none';
        document.getElementById('clashMenuContainer').style.display = 'flex';
        document.getElementById('clashLobbySelect').style.display = 'block';
        document.getElementById('clashLobbyWaiting').style.display = 'none';
        document.getElementById('clashLobbyError').style.display = 'none';
    });
}

function exitClashMenu() {
    document.getElementById('clashMenuContainer').style.display = 'none';
    document.getElementById('mainMenuContainer').style.display = 'flex';
    if(clashUnsubscribe) clashUnsubscribe();
    currentClashRoom = null;
}

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let code = "";
    for(let i=0; i<5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

async function createClashRoom() {
    document.getElementById('clashLobbyError').style.display = 'none';
    const btn = document.querySelector('#clashLobbySelect .menu-btn');
    btn.innerText = "TWORZENIE..."; btn.disabled = true;

    const code = generateRoomCode();
    myClashColor = 'red';
    
    let allClubs = getCleanClubsList();
    let validBoard = tryGenerateBoard(allClubs, 3, 500);
    if (!validBoard) validBoard = tryGenerateBoard(allClubs, 2, 300);
    if (!validBoard) { clashRows = ['unia leszno', 'stal gorzów wielkopolski', 'włókniarz częstochowa']; clashCols = ['apator toruń', 'sparta wrocław', 'falubaz zielona góra']; }

    try {
        await db.collection("clash_rooms").doc(code).set({
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'waiting', p1: { id: playerId, nick: playerNickname, color: 'red' }, p2: null,
            rows: clashRows, cols: clashCols, board: Array(9).fill(null), turn: 'red', deadline: 0,
            guessedPlayers: [], lastAction: ''
        });

        currentClashRoom = code;
        document.getElementById('clashLobbySelect').style.display = 'none';
        document.getElementById('myRoomCodeDisplay').innerText = code;
        document.getElementById('clashLobbyWaiting').style.display = 'block';
        btn.innerHTML = `<span class="btn-icon">🏠</span><span class="btn-text">UTWÓRZ POKÓJ (HOST)</span>`; btn.disabled = false;
        listenToClashRoom();
    } catch(e) {
        console.error(e);
        document.getElementById('clashLobbyError').innerText = "Błąd połączenia. Spróbuj ponownie.";
        document.getElementById('clashLobbyError').style.display = 'block'; btn.disabled = false;
    }
}

async function joinClashRoom() {
    const input = document.getElementById('joinRoomInput').value.trim().toUpperCase();
    const errorEl = document.getElementById('clashLobbyError');
    if(input.length !== 5) { errorEl.innerText = "Kod musi mieć 5 liter!"; errorEl.style.display = 'block'; return; }

    try {
        const roomRef = db.collection("clash_rooms").doc(input); const doc = await roomRef.get();
        if(!doc.exists) { errorEl.innerText = "Nie znaleziono pokoju o tym kodzie!"; errorEl.style.display = 'block'; return; }
        if(doc.data().p2 !== null) { errorEl.innerText = "Ten pokój jest już pełny!"; errorEl.style.display = 'block'; return; }

        await roomRef.update({ p2: { id: playerId, nick: playerNickname, color: 'blue' }, status: 'vsScreen' });
        myClashColor = 'blue'; currentClashRoom = input;
        document.getElementById('clashMenuContainer').style.display = 'none';
        listenToClashRoom();
    } catch(e) { console.error(e); errorEl.innerText = "Wystąpił błąd!"; errorEl.style.display = 'block'; }
}

function listenToClashRoom() {
    if(!currentClashRoom) return;
    clashUnsubscribe = db.collection("clash_rooms").doc(currentClashRoom).onSnapshot(doc => {
        if(!doc.exists) { alert("Pokój został zamknięty przez drugiego gracza."); exitClashMenu(); return; }
        const data = doc.data();
        clashStatus = data.status; clashTurn = data.turn; clashBoardState = data.board;
        clashGuessedPlayers = data.guessedPlayers || []; clashRows = data.rows; clashCols = data.cols;

        if(clashStatus === 'vsScreen') showVsScreen(data);
        if(clashStatus === 'coinToss') playCoinToss(data);
        if(clashStatus === 'playing') updateClashBoardUI(data);
        if(clashStatus === 'finished') handleClashEnd(data);
    });
}

function showVsScreen(data) {
    if(document.getElementById('clashMenuContainer').style.display !== 'none') { document.getElementById('clashMenuContainer').style.display = 'none'; }
    const vsOverlay = document.getElementById('clashVsOverlay');
    document.getElementById('vsP1Name').innerText = data.p1.nick; document.getElementById('vsP2Name').innerText = data.p2.nick;
    document.getElementById('cp1Nick').innerText = data.p1.nick; document.getElementById('cp2Nick').innerText = data.p2.nick;

    vsOverlay.style.display = 'block'; setTimeout(() => vsOverlay.style.opacity = '1', 10); playSound('win');

    if(myClashColor === 'red') {
        setTimeout(() => {
            let startColor = Math.random() < 0.5 ? 'red' : 'blue';
            db.collection("clash_rooms").doc(currentClashRoom).update({ status: 'coinToss', turn: startColor });
        }, 3000);
    }
}

function playCoinToss(data) {
    const vsOverlay = document.getElementById('clashVsOverlay'); vsOverlay.style.opacity = '0'; setTimeout(() => vsOverlay.style.display = 'none', 300);
    const overlay = document.getElementById('coinTossOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    
    const coin = document.getElementById('clashCoinInner'); const resText = document.getElementById('coinTossResult'); resText.style.opacity = '0'; resText.innerText = "";
    
    let isRed = data.turn === 'red'; let rotations = 5 * 360 + (isRed ? 0 : 180); 
    coin.style.transition = 'none'; coin.style.transform = `rotateY(0deg)`;
    
    setTimeout(() => { playSound('flip'); coin.style.transition = 'transform 3s cubic-bezier(0.1, 0.8, 0.2, 1)'; coin.style.transform = `rotateY(${rotations}deg)`; }, 50);
    
    setTimeout(() => {
        resText.innerText = isRed ? `ZACZYNA ${data.p1.nick} (🔴)` : `ZACZYNA ${data.p2.nick} (🔵)`;
        resText.style.color = isRed ? "#ff3333" : "#3399ff"; resText.style.opacity = '1'; playSound(isRed ? 'win' : 'guess');
        
        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.style.display = 'none';
                if(myClashColor === 'red') { db.collection("clash_rooms").doc(currentClashRoom).update({ status: 'playing', deadline: Date.now() + 120000 }); }
            }, 300);
        }, 2500);
    }, 3000);
}

function updateClashBoardUI(data) {
    document.getElementById('clashContainer').style.display = 'block'; closeClashSearch();

    for(let i=0; i<3; i++) {
        document.getElementById(`row${i}`).innerHTML = `<img src="https://upload.wikimedia.org/wikipedia/commons/e/e4/Motorcycle_speedway_icon.svg" width="20" style="opacity:0.3; margin-bottom:5px;"><br>${getClubAbbr(clashRows[i])}`;
        document.getElementById(`col${i}`).innerHTML = `<img src="https://upload.wikimedia.org/wikipedia/commons/e/e4/Motorcycle_speedway_icon.svg" width="20" style="opacity:0.3; margin-bottom:5px;"><br>${getClubAbbr(clashCols[i])}`;
    }

    for(let r=0; r<3; r++) {
        for(let c=0; c<3; c++) {
            let idx = r * 3 + c; let cell = document.getElementById(`cell-${r}-${c}`); let val = data.board[idx];
            if(val === 'red' || val === 'blue') { cell.className = `clash-cell clash-playable claimed-${val}`; cell.innerHTML = `<span class="clash-icon">${val === 'red' ? '🔴' : '🔵'}</span>`; } 
            else { cell.className = 'clash-cell clash-playable'; cell.innerHTML = '<span style="opacity: 0.1; font-size: 24px;">+</span>'; }
        }
    }

    updateClashTurnUI();
    
    if(clashTurn === myClashColor) { document.getElementById('clashTimerDisplay').style.color = '#00ff66'; playSound('flip'); } 
    else { document.getElementById('clashTimerDisplay').style.color = '#fff'; }

    if(data.lastAction && data.lastAction !== '' && data.turn === myClashColor) {
        setTimeout(() => alert(`Przeciwnik: ${data.lastAction}\nTERAZ TWOJA TURA!`), 200);
        db.collection("clash_rooms").doc(currentClashRoom).update({ lastAction: '' });
    }

    startClashTimer(data.deadline);
}

function startClashTimer(deadlineTime) {
    if(clashTimerInterval) clearInterval(clashTimerInterval);
    const display = document.getElementById('clashTimerDisplay');

    clashTimerInterval = setInterval(() => {
        let now = Date.now(); let diff = deadlineTime - now;
        if (diff <= 0) {
            clearInterval(clashTimerInterval); display.innerText = "00:00"; display.style.color = "var(--red-neon)";
            if(clashTurn === myClashColor && clashStatus === 'playing') { skipClashTurn("Koniec czasu!"); }
            return;
        }
        let totalSeconds = Math.floor(diff / 1000); let m = Math.floor(totalSeconds / 60).toString().padStart(2, '0'); let s = (totalSeconds % 60).toString().padStart(2, '0');
        display.innerText = `${m}:${s}`;
        if(totalSeconds <= 10 && clashTurn === myClashColor) { display.style.color = "var(--red-neon)"; if(totalSeconds % 2 === 0) playSound('error'); }
    }, 1000);
}

function handleClashCell(r, c) {
    if (clashTurn !== myClashColor) { alert("Czekaj na swoją kolej!"); return; }
    let idx = r * 3 + c; if(clashBoardState[idx] !== null) { alert("To pole jest już zajęte!"); return; }
    
    clashActiveCellIdx = idx;
    document.getElementById('clashSearchDesc').innerText = `${getClubAbbr(clashRows[r])} 🤝 ${getClubAbbr(clashCols[c])}`;
    document.getElementById('clashGuessInput').value = ''; setupClashAutocomplete();

    const overlay = document.getElementById('clashSearchOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
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

function closeClashSearch() { const overlay = document.getElementById('clashSearchOverlay'); overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300); }

async function submitClashGuess() {
    let input = document.getElementById('clashGuessInput').value.trim(); if(!input) return;
    const player = playersDB.find(p => p.name.toLowerCase() === input.toLowerCase());
    
    if(!player || clashGuessedPlayers.includes(player.name)) {
        document.querySelector('#clashSearchOverlay .input-wrapper').classList.add('shake-error'); playSound('error');
        setTimeout(() => { document.querySelector('#clashSearchOverlay .input-wrapper').classList.remove('shake-error'); }, 400); return;
    }

    let r = Math.floor(clashActiveCellIdx / 3); let c = clashActiveCellIdx % 3;
    let rClub = clashRows[r]; let cClub = clashCols[c];

    let pClubs = player.pastClubs.map(pc => getCleanClubName(pc).toLowerCase());
    if (player.currentClub) pClubs.push(getCleanClubName(player.currentClub).toLowerCase());

    if (pClubs.includes(rClub) && pClubs.includes(cClub)) {
        playSound('guess'); closeClashSearch();
        
        let newBoard = [...clashBoardState]; newBoard[clashActiveCellIdx] = myClashColor;
        let newGuessed = [...clashGuessedPlayers, player.name];
        
        if(checkWinCondition(newBoard, myClashColor)) {
            await db.collection("clash_rooms").doc(currentClashRoom).update({ board: newBoard, guessedPlayers: newGuessed, status: 'finished', winner: myClashColor, lastAction: `${player.name} pasuje! Wygrywa mecz.` });
        } else if (!newBoard.includes(null)) {
            await db.collection("clash_rooms").doc(currentClashRoom).update({ board: newBoard, guessedPlayers: newGuessed, status: 'finished', winner: 'draw', lastAction: `Remis! Pełna plansza.` });
        } else {
            await db.collection("clash_rooms").doc(currentClashRoom).update({ board: newBoard, guessedPlayers: newGuessed, turn: myClashColor === 'red' ? 'blue' : 'red', deadline: Date.now() + 120000, lastAction: '' });
        }
    } else {
        playSound('error'); closeClashSearch(); alert(`Pudło! ${player.name} nie jeździł w obu klubach. Tracisz turę!`);
        skipClashTurn("Błędna odpowiedź");
    }
}

function skipClashTurn(reason) {
    db.collection("clash_rooms").doc(currentClashRoom).update({ turn: myClashColor === 'red' ? 'blue' : 'red', deadline: Date.now() + 120000, lastAction: reason });
}

function checkWinCondition(board, color) {
    const lines = [ [0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6] ];
    return lines.some(line => { let [a,b,c] = line; return board[a] === color && board[b] === color && board[c] === color; });
}

function handleClashEnd(data) {
    if(clashTimerInterval) clearInterval(clashTimerInterval);
    setTimeout(() => {
        if(data.winner === 'draw') { playSound('lose'); alert("MECZ ZAKOŃCZONY REMISEM! 🤝"); } 
        else {
            let isMe = data.winner === myClashColor;
            if(isMe) { playSound('win'); launchConfetti(); alert(`🏁 BRAWO! Zwyciężasz ten mecz! 🏆`); } 
            else { playSound('lose'); alert(`Niestety, przeciwnik przejął planszę. Przegrywasz! 💔`); }
        }
        leaveClashRoom();
    }, 1000);
}

function leaveClashRoom() {
    if(clashUnsubscribe) clashUnsubscribe();
    if(clashTimerInterval) clearInterval(clashTimerInterval);
    if(currentClashRoom) { db.collection("clash_rooms").doc(currentClashRoom).delete().catch(e=>console.log(e)); }
    currentClashRoom = null;
    document.getElementById('clashContainer').style.display = 'none';
    document.getElementById('mainMenuContainer').style.display = 'flex';
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
                    let pClubs = p.pastClubs.map(pc => getCleanClubName(pc).toLowerCase());
                    if (p.currentClub) pClubs.push(getCleanClubName(p.currentClub).toLowerCase());
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