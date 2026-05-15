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

const GUESS_LIMIT = 10;
const DAILY_START_DATE = new Date('2026-05-12T00:00:00'); 

const clubAbbreviations = {
    "unia leszno": "LES", "falubaz zielona góra": "ZIE", "stal gorzów wielkopolski": "GOR",
    "stal gorzów": "GOR", "motor lublin": "LUB", "sparta wrocław": "WRO", "apator toruń": "TOR",
    "włókniarz częstochowa": "CZE", "gkm grudziądz": "GRU", "unia tarnów": "TAR",
    "polonia bydgoszcz": "BYD", "wybrzeże gdańsk": "GDA", "ostrovia ostrów wielkopolski": "OST",
    "ostrovia ostrów": "OST", "stal rzeszów": "RZE", "row rybnik": "RYB", "psż poznań": "POZ",
    "kolejarz opole": "OPO", "orzeł łódź": "LOD", "polonia piła": "PIŁ", "start gniezno": "GNI",
    "kolejarz rawicz": "RAW", "landshut devils": "LAN", "wilki krosno": "KRO", "lokomotiv daugavpils": "DAU",
    "brak klubu": "BK", "brak": "BK", "zawieszenie": "ZAW", "kontuzja": "KON", "koniec kariery": "KON"
};

let userStats = { played: 0, won: 0, currentStreak: 0, maxStreak: 0, completedDailies: [], dailyHistory: [] };

const countryToCode = {
    "Polska": "pl", "Wielka Brytania": "gb", "Dania": "dk", "Australia": "au",
    "Szwecja": "se", "Słowacja": "sk", "Rosja": "ru", "Łotwa": "lv",
    "Niemcy": "de", "Francja": "fr", "Słowenia": "si", "USA": "us", "Norwegia": "no", "Ukraina": "ua", "Finlandia": "fi", "Czechy": "cz", "Włochy": "it", "Hiszpania": "es",
};

window.onload = function() {
    loadStats();
    initDailyMenu();
    renderLastGames();
};

function loadStats() {
    let saved = localStorage.getItem('speedwayStats');
    if(saved) {
        userStats = JSON.parse(saved);
        if (!userStats.completedDailies) userStats.completedDailies = [];
        if (!userStats.dailyHistory) userStats.dailyHistory = [];
    }
}

function saveStats() {
    localStorage.setItem('speedwayStats', JSON.stringify(userStats));
}

// Generuje poprawny napis z datą (np. "12.05.2026") dla danego numeru gry
function getDailyDateString(dayNumber) {
    const startUTC = Date.UTC(DAILY_START_DATE.getFullYear(), DAILY_START_DATE.getMonth(), DAILY_START_DATE.getDate());
    const targetUTC = startUTC + (dayNumber - 1) * 24 * 60 * 60 * 1000;
    const d = new Date(targetUTC);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// --- LOGIKA MENU DAILY ---
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

function updateDailyMenu() {
    document.getElementById('dailyDayDisplay').innerText = `Daily ${getDailyDateString(selectedDailyDay)}`;
    
    const btnPrev = document.getElementById('btnPrevDaily');
    const btnNext = document.getElementById('btnNextDaily');
    
    if (btnPrev) btnPrev.style.visibility = (selectedDailyDay <= 1) ? 'hidden' : 'visible';
    if (btnNext) btnNext.style.visibility = (selectedDailyDay >= currentDailyDay) ? 'hidden' : 'visible';

    const btn = document.getElementById('btnDailyMode');
    const txt = document.getElementById('dailyBtnText');

    if (userStats.completedDailies.includes(selectedDailyDay)) {
        btn.disabled = true;
        btn.classList.add('disabled');
        txt.innerText = "Ukończone ✅";
    } else {
        btn.disabled = false;
        btn.classList.remove('disabled');
        txt.innerText = "Graj Daily";
    }
}

// --- KAFELKI HISTORII ---
function renderLastGames() {
    const container = document.getElementById('lastGamesContainer');
    const list = document.getElementById('lastGamesList');
    
    if (container && list && userStats.dailyHistory && userStats.dailyHistory.length > 0) {
        container.style.display = 'block';
        list.innerHTML = '';
        
        userStats.dailyHistory.forEach(isWin => {
            const tile = document.createElement('div');
            tile.className = `daily-tile ${isWin ? 'win' : 'loss'}`;
            list.appendChild(tile);
        });
    }
}

function updateStatsOnWin() {
    if(hasWon || hasLost) return; 
    hasWon = true;
    userStats.played++; userStats.won++; userStats.currentStreak++;
    if(userStats.currentStreak > userStats.maxStreak) userStats.maxStreak = userStats.currentStreak;
    
    if (gameMode === 'daily') {
        userStats.completedDailies.push(selectedDailyDay);
        userStats.dailyHistory.push(true);
        if (userStats.dailyHistory.length > 5) userStats.dailyHistory.shift(); 
    }
    saveStats();
}

function updateStatsOnLoss() {
    if(hasWon || hasLost) return;
    hasLost = true;
    userStats.played++; userStats.currentStreak = 0; 
    
    if (gameMode === 'daily') {
        userStats.completedDailies.push(selectedDailyDay);
        userStats.dailyHistory.push(false);
        if (userStats.dailyHistory.length > 5) userStats.dailyHistory.shift();
    }
    saveStats();
}

function startDailyGame() { gameMode = 'daily'; document.getElementById('mainMenuContainer').style.display = 'none'; document.getElementById('gameContainer').style.display = 'block'; initGame(); }
function startEndlessGame() { gameMode = 'endless'; document.getElementById('mainMenuContainer').style.display = 'none'; document.getElementById('gameContainer').style.display = 'block'; initGame(); }

function updateCounterDisplay() {
    const counterDisplay = document.getElementById('guessCounterDisplay');
    counterDisplay.style.display = 'block';
    counterDisplay.innerText = `Próba: ${guessCount}/${GUESS_LIMIT}`;
}

function resetBoardAndPlay() {
    const overlayW = document.getElementById('winOverlay');
    const overlayL = document.getElementById('loseOverlay');
    overlayW.style.opacity = '0'; overlayL.style.opacity = '0';
    setTimeout(() => { overlayW.style.display = 'none'; overlayL.style.display = 'none'; }, 200);
    
    guessCount = 0; guessHistory = []; guessedPlayersNames = []; hasWon = false; hasLost = false;
    document.getElementById('results').innerHTML = '';
    document.getElementById('guessInput').value = '';
    document.getElementById('mysteryPhoto').style.display = 'none';
    document.getElementById('mysteryPlaceholder').style.display = 'block';
    document.getElementById('photoWrapper').classList.remove('revealed');
    document.getElementById('mysteryName').innerText = '???';
    document.getElementById('mysteryName').style.color = 'var(--text-main)'; 
    document.getElementById('postGameActions').style.display = 'none';
    
    gameMode = 'endless'; initGame();
}

function seededRandom(seed) { const x = Math.sin(seed) * 10000; return x - Math.floor(x); }

function initGame() {
    let randomIndex;
    const modeDisplay = document.getElementById('gameModeDisplay');
    if (gameMode === 'daily') {
        dailyNumberGlobal = getDailyDateString(selectedDailyDay);
        const dateSeed = selectedDailyDay * 9999; 
        randomIndex = Math.floor(seededRandom(dateSeed) * playersDB.length);
        targetPlayer = playersDB[randomIndex];
        modeDisplay.innerText = `Tryb: Daily ${dailyNumberGlobal}`;
    } else {
        randomIndex = Math.floor(Math.random() * playersDB.length);
        targetPlayer = playersDB[randomIndex];
        modeDisplay.innerText = `Tryb: Endless`;
    }
    buildTeamPath(); setupAutocomplete(); updateCounterDisplay();
}

function removePolishAccents(str) {
    const accents = 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ'; const noAccents = 'acelnoszzACELNOSZZ';
    return str.split('').map(char => { const index = accents.indexOf(char); return index !== -1 ? noAccents[index] : char; }).join('');
}

function getCleanClubName(clubName) { return clubName ? clubName.replace(" (W)", "").trim() : ""; }

function getClubAbbr(clubName) {
    if (!clubName) return "---";
    let cleanName = getCleanClubName(clubName).toLowerCase();
    if (clubAbbreviations[cleanName]) return clubAbbreviations[cleanName];
    let words = cleanName.split(' '); let lastWord = words[words.length - 1];
    return removePolishAccents(lastWord.substring(0, 3)).toUpperCase();
}

function setupAutocomplete() {
    const input = document.getElementById('guessInput');
    input.replaceWith(input.cloneNode(true));
    const newInput = document.getElementById('guessInput');
    newInput.addEventListener('input', function() {
        let val = this.value; closeAllLists();
        if (!val || val.length < 2) return;
        let listContainer = document.createElement("DIV");
        listContainer.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(listContainer);
        
        let valClean = removePolishAccents(val.toLowerCase());
        playersDB.forEach(player => {
            if (guessedPlayersNames.includes(player.name)) return;
            
            let playerClean = removePolishAccents(player.name.toLowerCase());
            if (playerClean.includes(valClean)) {
                let item = document.createElement("DIV");
                item.innerHTML = player.name;
                item.addEventListener("click", () => { newInput.value = player.name; closeAllLists(); });
                listContainer.appendChild(item);
            }
        });
    });
    function closeAllLists() { let x = document.getElementsByClassName("autocomplete-items"); for (let i = 0; i < x.length; i++) x[i].remove(); }
    document.addEventListener("click", closeAllLists);
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
    const guessedPlayer = playersDB.find(p => p.name.toLowerCase() === input.toLowerCase());
    
    if (!guessedPlayer) { alert("Brak zawodnika w bazie!"); return; }
    if (guessedPlayersNames.includes(guessedPlayer.name)) { alert("Już wpisałeś tego zawodnika!"); return; }
    
    guessedPlayersNames.push(guessedPlayer.name); 
    guessCount++; updateCounterDisplay(); renderGuess(guessedPlayer); revealClubsOnPath(guessedPlayer);
    document.getElementById('guessInput').value = "";
    
    if (guessedPlayer.name !== targetPlayer.name && guessCount >= GUESS_LIMIT) { 
        updateStatsOnLoss(); setTimeout(handleLoss, 200); 
    }
}

function revealClubsOnPath(guessedPlayer) {
    const boxes = document.querySelectorAll('.path-box');
    let guessedClubs = guessedPlayer.pastClubs.map(getCleanClubName);
    boxes.forEach(box => {
        if (!box.dataset.club) return;
        const targetClean = getCleanClubName(box.dataset.club);
        if (guessedClubs.includes(targetClean) && box.innerText === '?') {
            box.innerHTML = `<span>${getClubAbbr(box.dataset.club)}</span>${box.dataset.club.includes("(W)") ? '<div class="loan-badge">W</div>' : ''}`;
            box.classList.add('found');
        }
    });
    if ((guessedPlayer.status.toLowerCase().includes("koniec") || guessedPlayer.status === "Ś.P.") && (targetPlayer.status.toLowerCase().includes("koniec") || targetPlayer.status === "Ś.P.")) {
        const endBox = document.getElementById('pathBox-retired');
        if (endBox) { endBox.innerText = '❌'; endBox.classList.add('found'); endBox.style.border = 'none'; endBox.style.background = 'transparent'; }
    }
}

function renderGuess(player) {
    const resultsDiv = document.getElementById('results');
    const row = document.createElement('div'); row.className = 'guess-row';
    let rowEmojis = "";

    const isTargetGP = targetPlayer.gp === true || targetPlayer.gp === "Tak";
    const isGuessGP = player.gp === true || player.gp === "Tak";
    const gpCls = (isGuessGP === isTargetGP) ? "green" : "red";
    const gpIcon = isGuessGP ? "✅" : "❌";

    const yearCls = (player.year === targetPlayer.year) ? "green" : "red";
    let yearContent = `<span>${player.year}</span>`;
    if (player.year > targetPlayer.year) yearContent += `<span class="val-arrow" title="Cel jest starszy (wcześniejszy rok urodzenia)">⬇️</span>`;
    else if (player.year < targetPlayer.year) yearContent += `<span class="val-arrow" title="Cel jest młodszy (późniejszy rok urodzenia)">⬆️</span>`;

    // NAPRAWA: Zabezpieczony region i flagi!
    const pCountries = player.country.split("/").map(c => c.trim());
    const tCountries = targetPlayer.country.split("/").map(c => c.trim());
    
    let countryCls = "red";
    if (player.country === targetPlayer.country) {
        countryCls = "green";
    } else if (pCountries.some(c => tCountries.includes(c)) || player.region === targetPlayer.region) {
        countryCls = "yellow";
    }

    let countryContent = "";
    if (pCountries.length > 1) {
        let c1 = countryToCode[pCountries[0]] || 'pl';
        let c2 = countryToCode[pCountries[1]] || 'pl';
        countryContent = `<div class="tile-flag-dual" title="${player.country}"><img src="https://flagcdn.com/h80/${c1}.png" class="flag-left"><img src="https://flagcdn.com/h80/${c2}.png" class="flag-right"></div>`;
    } else {
        countryContent = `<img src="https://flagcdn.com/w80/${countryToCode[player.country.split('/')[0]] || 'pl'}.png" class="tile-flag" title="${player.country}">`;
    }

    row.innerHTML = `
        <div class="col-name">${player.name}</div>
        <div class="col-attr"><div class="attr-box ${countryCls}">${countryContent}</div></div>
        <div class="col-attr"><div class="attr-box ${yearCls}">${yearContent}</div></div>
        <div class="col-attr"><div class="attr-box ${gpCls}" style="font-size: 24px;">${gpIcon}</div></div>
        <div class="col-attr"><div class="attr-box ${player.dmp === targetPlayer.dmp ? 'green' : 'red'}">${player.dmp}</div></div>
        <div class="col-attr"><div class="attr-box ${player.status === targetPlayer.status ? 'green' : 'red'}">${player.status === 'Aktywny' ? '✅' : '❌'}</div></div>
        <div class="col-clubs"><div class="clubs-path-container">${player.pastClubs.map(c => `<div class="club-logo-wrapper"><div class="club-abbr-box ${targetPlayer.pastClubs.map(getCleanClubName).includes(getCleanClubName(c)) ? 'club-match' : 'club-dim'}">${getClubAbbr(c)}</div></div>`).join('<div class="club-divider"></div>')}</div></div>
    `;
    resultsDiv.insertBefore(row, resultsDiv.firstChild);
    
    ['country', 'year', 'gp', 'dmp', 'status'].forEach(attr => {
        let c = "red";
        if (attr === 'country') c = countryCls;
        else if (attr === 'year' && player.year === targetPlayer.year) c = "green";
        else if (attr === 'gp' && isGuessGP === isTargetGP) c = "green";
        else if (attr === 'dmp' && player.dmp === targetPlayer.dmp) c = "green";
        else if (attr === 'status' && player.status === targetPlayer.status) c = "green";
        rowEmojis += c === "green" ? "🟩" : c === "yellow" ? "🟨" : "🟥";
    });
    guessHistory.push(rowEmojis);

    if (player.name === targetPlayer.name) { updateStatsOnWin(); setTimeout(handleWin, 200); }
}

function handleWin() {
    revealTargetInfoUI(); launchConfetti();
    const overlay = document.getElementById('winOverlay'); 
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    
    const btnShare = document.getElementById('btnSharePost');
    const btnPlayAgainPost = document.getElementById('btnPlayAgainPost');

    if (gameMode === 'daily') { 
        btnShare.style.display = 'inline-block'; 
        btnPlayAgainPost.innerText = "GRAJ W TRYB ENDLESS"; 
    } else { 
        btnShare.style.display = 'none'; 
        btnPlayAgainPost.innerText = "ZAGRAJ PONOWNIE"; 
    }

    setTimeout(() => { 
        overlay.style.opacity = '0'; 
        setTimeout(() => { 
            overlay.style.display = 'none'; 
            document.getElementById('postGameActions').style.display = 'flex'; 
        }, 200); 
    }, 1200);
}

function handleLoss() {
    revealTargetInfoUI();
    const overlay = document.getElementById('loseOverlay'); 
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
    
    document.getElementById('btnSharePost').style.display = 'none';
    const btnPlayAgainPost = document.getElementById('btnPlayAgainPost');
    
    if (gameMode === 'daily') { 
        btnPlayAgainPost.innerText = "GRAJ W TRYB ENDLESS"; 
    } else { 
        btnPlayAgainPost.innerText = "ZAGRAJ PONOWNIE"; 
    }

    setTimeout(() => { 
        overlay.style.opacity = '0'; 
        setTimeout(() => { 
            overlay.style.display = 'none'; 
            document.getElementById('postGameActions').style.display = 'flex'; 
        }, 200); 
    }, 1200);
}

function revealTargetInfoUI() {
    document.getElementById('mysteryPlaceholder').style.display = 'none';
    const photoImg = document.getElementById('mysteryPhoto'); photoImg.src = `images/riders/image_0.png`; photoImg.style.display = 'block';
    document.getElementById('photoWrapper').classList.add('revealed');
    document.getElementById('mysteryName').innerText = targetPlayer.name;
    if (hasLost) document.getElementById('mysteryName').style.color = "var(--red-neon)";
    
    document.querySelectorAll('.path-box').forEach(box => {
        if (!box.dataset.club) return;
        box.innerHTML = `<span>${getClubAbbr(box.dataset.club)}</span>${box.dataset.club.includes("(W)") ? '<div class="loan-badge">W</div>' : ''}`;
        box.classList.add('found');
    });
    const endBox = document.getElementById('pathBox-retired');
    if (endBox) { endBox.innerText = '❌'; endBox.classList.add('found'); endBox.style.border = 'none'; endBox.style.background = 'transparent'; }
}

function shareResult() {
    let modeText = gameMode === 'daily' ? `Daily ${dailyNumberGlobal}` : `Endless`;
    let text = `🏁 Speedway Guessr (${modeText})\nPróba: ${guessCount}/${GUESS_LIMIT}\n\n`;
    guessHistory.forEach(row => { text += row + '\n'; });
    navigator.clipboard.writeText(text).then(() => alert("Wynik skopiowany do schowka!"));
}

function showStats() {
    document.getElementById('statPlayed').innerText = userStats.played;
    document.getElementById('statWon').innerText = userStats.won;
    document.getElementById('statStreak').innerText = userStats.currentStreak;
    document.getElementById('statMaxStreak').innerText = userStats.maxStreak;
    const overlay = document.getElementById('statsOverlay');
    overlay.style.display = 'block'; setTimeout(() => overlay.style.opacity = '1', 10);
}

function closeStats() {
    const overlay = document.getElementById('statsOverlay');
    overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300);
}

function setTheme(themeName) { document.documentElement.setAttribute('data-theme', themeName); localStorage.setItem('theme', themeName); }

function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas'); const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    let particles = []; for (let i = 0; i < 150; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*-canvas.height, color: ['#f1c40f','#e74c3c','#2ecc71','#3498db'][Math.floor(Math.random()*4)], sy: Math.random()*4+2, r: Math.random()*360 });
    function draw() { ctx.clearRect(0,0,canvas.width,canvas.height); particles.forEach(p => { ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r*Math.PI/180); ctx.fillStyle=p.color; ctx.fillRect(-5,-10,10,20); ctx.restore(); p.y+=p.sy; if(p.y>canvas.height)p.y=-20; }); requestAnimationFrame(draw); }
    draw();
}