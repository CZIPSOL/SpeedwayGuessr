let targetPlayer; let gameMode = 'endless'; let guessCount = 0;
let guessHistory = []; let guessedPlayersNames = []; 
let currentDailyDay = 1; let selectedDailyDay = 1; let dailyNumberGlobal = "";
let hasWon = false; let hasLost = false; let isRestoring = false;

let calRenderMonth = new Date().getMonth();
let calRenderYear = new Date().getFullYear();

const GUESS_LIMIT = 10;
const DAILY_START_DATE = new Date('2026-05-12T00:00:00'); 

// NOWE: Zamieniłem brzydkie skróty na bardzo czyste emotikony symbolizujące status!
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

let userStats = { played: 0, won: 0, currentStreak: 0, maxStreak: 0, dailyResults: {}, dailyHistory: [], dailyGuesses: {}, recentEndless: [] };

const countryToCode = {
    "Polska": "pl", "Wielka Brytania": "gb", "Dania": "dk", "Australia": "au", "Szwecja": "se", 
    "Słowacja": "sk", "Rosja": "ru", "Łotwa": "lv", "Niemcy": "de", "Francja": "fr", 
    "Słowenia": "si", "USA": "us", "Norwegia": "no", "Ukraina": "ua", "Finlandia": "fi", 
    "Czechy": "cz", "Włochy": "it", "Hiszpania": "es",
};

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

window.onload = function() { loadStats(); initDailyMenu(); renderLastGames(); preloadHelmetImage(); };

const helmetImgObj = new Image();
function preloadHelmetImage() { helmetImgObj.src = 'kask-zycie.png'; }

function loadStats() {
    let saved = localStorage.getItem('speedwayStats');
    if(saved) {
        userStats = JSON.parse(saved);
        if (!userStats.dailyResults) userStats.dailyResults = {};
        if (!userStats.dailyHistory) userStats.dailyHistory = [];
        if (!userStats.dailyGuesses) userStats.dailyGuesses = {};
        if (!userStats.recentEndless) userStats.recentEndless = [];
        
        if (userStats.completedDailies && Array.isArray(userStats.completedDailies)) {
            userStats.completedDailies.forEach(day => { if (!userStats.dailyResults[day]) userStats.dailyResults[day] = 'win'; });
            delete userStats.completedDailies; saveStats();
        }
    }
}
function saveStats() { localStorage.setItem('speedwayStats', JSON.stringify(userStats)); }

function getDailyDateString(dayNumber) {
    const startUTC = Date.UTC(DAILY_START_DATE.getFullYear(), DAILY_START_DATE.getMonth(), DAILY_START_DATE.getDate());
    const d = new Date(startUTC + (dayNumber - 1) * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
        txt.innerText = "Przejrzyj grę"; 
    } else {
        btn.classList.remove('disabled'); txt.innerText = "Graj Daily";
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
    const monthNames = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
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
            if (userStats.dailyResults[dailyNum] === 'win') { box.classList.add('win'); box.title += " (Odgadnięty)"; }
            else if (userStats.dailyResults[dailyNum] === 'loss') { box.classList.add('loss'); box.title += " (Porażka)"; }
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

function startDailyGame() { gameMode = 'daily'; document.getElementById('mainMenuContainer').style.display = 'none'; document.getElementById('gameContainer').style.display = 'block'; initGame(); }
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
        
        container.innerHTML += `<img src="kask-zycie.png" class="${cls}" alt="Kask życia">`;
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
        modeDisplay.innerText = `Tryb: Daily ${dailyNumberGlobal}`;
        
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

        modeDisplay.innerText = `Tryb: Endless`;
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
        document.getElementById('results').innerHTML = `<div style="text-align: center; margin-top: 30px; color: var(--text-dim); font-weight: 600;">Historia zgadywania z tego dnia nie została zapisana (starsza wersja gry).</div>`;
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
    document.getElementById('btnPlayAgainPost').innerText = "GRAJ W TRYB ENDLESS";
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
            
            // Logika dodania klasy "specjalnej" gdy klub jest odsłonięty na górnej ścieżce
            let cleanC = getCleanClubName(box.dataset.club).toLowerCase();
            if (['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC)) {
                box.classList.add('club-special');
            }
            
            box.innerHTML = `<span>${getClubAbbr(box.dataset.club)}</span>${box.dataset.club.includes("(W)") ? '<div class="loan-badge">W</div>' : ''}`;
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
    
    const isTargetGP = targetPlayer.gp === true || targetPlayer.gp === "Tak" || targetPlayer.gp === "tak"; 
    const isGuessGP = player.gp === true || player.gp === "Tak" || player.gp === "tak";
    const gpCls = (isGuessGP === isTargetGP) ? "green" : "red"; const gpIcon = isGuessGP ? "✅" : "❌";
    
    const yearCls = (player.year === targetPlayer.year) ? "green" : "red";
    let yearContent = `<span>${player.year}</span>`;
    if (player.year > targetPlayer.year) yearContent += `<span class="val-arrow" title="Cel jest starszy (wcześniejszy rok urodzenia)">⬇️</span>`;
    else if (player.year < targetPlayer.year) yearContent += `<span class="val-arrow" title="Cel jest młodszy (późniejszy rok urodzenia)">⬆️</span>`;

    const dmpCls = (player.dmp === targetPlayer.dmp) ? "green" : "red";
    let dmpContent = `<span>${player.dmp}</span>`;
    if (player.dmp > targetPlayer.dmp) dmpContent += `<span class="val-arrow" title="Cel ma mniej medali DMP">⬇️</span>`;
    else if (player.dmp < targetPlayer.dmp) dmpContent += `<span class="val-arrow" title="Cel ma więcej medali DMP">⬆️</span>`;

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
        
        // NOWE: Logika dodająca przerywaną ramkę dla brakujących klubów!
        let cleanC = getCleanClubName(c).toLowerCase();
        let isSpecial = ['brak klubu', 'brak', 'zawieszenie', 'kontuzja', 'koniec kariery'].includes(cleanC);
        let specialClass = isSpecial ? ' club-special' : '';
        
        return `<div class="club-logo-wrapper"><div class="club-abbr-box ${matchClass}${specialClass}" title="${c}">${getClubAbbr(c)}</div>${isLoan ? '<div class="loan-badge" title="Wypożyczenie">W</div>' : ''}</div>`;
    }).join('<div class="club-divider"></div>');

    let d1 = isRestore ? 0 : 0.1;
    let d2 = isRestore ? 0 : 0.3;
    let d3 = isRestore ? 0 : 0.5;
    let d4 = isRestore ? 0 : 0.7;
    let d5 = isRestore ? 0 : 0.9;
    let d6 = isRestore ? 0 : 1.1;

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
    revealTargetInfoUI(); launchConfetti();
    const overlay = document.getElementById('winOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    const btnPlayAgainPost = document.getElementById('btnPlayAgainPost');
    if (gameMode === 'daily') { document.getElementById('btnSharePost').style.display = 'inline-block'; btnPlayAgainPost.innerText = "GRAJ W TRYB ENDLESS"; } 
    else { document.getElementById('btnSharePost').style.display = 'none'; btnPlayAgainPost.innerText = "ZAGRAJ PONOWNIE"; }
    setTimeout(() => { overlay.style.opacity = '0'; setTimeout(() => { overlay.style.display = 'none'; document.getElementById('postGameActions').style.display = 'flex'; }, 200); }, 1500);
}

function handleLoss() {
    playSound('lose');
    revealTargetInfoUI();
    const overlay = document.getElementById('loseOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    document.getElementById('btnSharePost').style.display = 'none';
    document.getElementById('btnPlayAgainPost').innerText = gameMode === 'daily' ? "GRAJ W TRYB ENDLESS" : "ZAGRAJ PONOWNIE";
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
        box.innerHTML = `<span>${getClubAbbr(box.dataset.club)}</span>${box.dataset.club.includes("(W)") ? '<div class="loan-badge">W</div>' : ''}`; box.classList.add('found');
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
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        if (!blob) { alert("Błąd generowania obrazu."); return; }

        const file = new File([blob], `speedway-guessr-${dailyNumberGlobal}.png`, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: `Speedway Guessr Daily ${dailyNumberGlobal}`, text: `🏁 Moje podsumowanie Speedway Guessr Daily! Dasz radę lepiej? #SpeedwayGuessr`, });
            return;
        }

        if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            alert("Podsumowanie zostało skopiowane do schowka.");
            return;
        }

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `speedway-guessr-${dailyNumberGlobal}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        alert("Twoja przeglądarka nie obsługuje udostępniania ani kopiowania obrazu, więc plik został pobrany.");
    } catch (error) { console.error("Error sharing:", error); alert("Wystąpił nieoczekiwany błąd podczas udostępniania."); }
}

function showStats() {
    document.getElementById('statPlayed').innerText = userStats.played; document.getElementById('statWon').innerText = userStats.won;
    document.getElementById('statStreak').innerText = userStats.currentStreak; document.getElementById('statMaxStreak').innerText = userStats.maxStreak;
    const overlay = document.getElementById('statsOverlay'); overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeStats() { document.getElementById('statsOverlay').style.opacity = '0'; setTimeout(() => document.getElementById('statsOverlay').style.display = 'none', 300); }
function setTheme(themeName) { document.documentElement.setAttribute('data-theme', themeName); localStorage.setItem('theme', themeName); }

function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas'); const ctx = canvas.getContext('2d'); canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    let particles = []; for (let i = 0; i < 150; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*-canvas.height, color: ['#f1c40f','#e74c3c','#2ecc71','#3498db'][Math.floor(Math.random()*4)], sy: Math.random()*4+2, r: Math.random()*360 });
    function draw() { ctx.clearRect(0,0,canvas.width,canvas.height); particles.forEach(p => { ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r*Math.PI/180); ctx.fillStyle=p.color; ctx.fillRect(-5,-10,10,20); ctx.restore(); p.y+=p.sy; if(p.y>canvas.height)p.y=-20; }); requestAnimationFrame(draw); } draw();
}