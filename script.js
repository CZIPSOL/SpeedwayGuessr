let targetPlayer;
let gameMode = 'endless'; 
let guessCount = 0;
let guessHistory = []; 
let dailyNumberGlobal = "";
let hasWon = false;
let hasLost = false;

const DAILY_LIMIT = 10;

// Słownik skrótów dla klubów i przerw w startach
const clubAbbreviations = {
    "unia leszno": "LES",
    "falubaz zielona góra": "ZIE",
    "stal gorzów wielkopolski": "GOR",
    "stal gorzów": "GOR",
    "motor lublin": "LUB",
    "sparta wrocław": "WRO",
    "apator toruń": "TOR",
    "włókniarz częstochowa": "CZE",
    "gkm grudziądz": "GRU",
    "unia tarnów": "TAR",
    "polonia bydgoszcz": "BYD",
    "wybrzeże gdańsk": "GDA",
    "ostrovia ostrów wielkopolski": "OST",
    "ostrovia ostrów": "OST",
    "stal rzeszów": "RZE",
    "row rybnik": "RYB",
    "psż poznań": "POZ",
    "kolejarz opole": "OPO",
    "orzeł łódź": "LOD",
    "polonia piła": "PIŁ",
    "start gniezno": "GNI",
    "kolejarz rawicz": "RAW",
    "landshut devils": "LAN",
    "wilki krosno": "KRO",
    "lokomotiv daugavpils": "DAU",
    // Wyjątki
    "brak klubu": "BK",
    "brak": "BK",
    "zawieszenie": "ZAW"
};

// Statystyki i Historia
let userStats = { played: 0, won: 0, currentStreak: 0, maxStreak: 0, lastDailyDate: "", gameHistory: [] };

const countryToCode = {
    "Polska": "pl", "Wielka Brytania": "gb", "Dania": "dk", "Australia": "au",
    "Szwecja": "se", "Słowacja": "sk", "Rosja": "ru", "Łotwa": "lv",
    "Niemcy": "de", "Francja": "fr", "Słowenia": "si", "USA": "us", "Norwegia": "no", "Ukraina": "ua", "Finlandia": "fi", "Czechy": "cz", "Włochy": "it", "Hiszpania": "es",
};

const DAILY_START_DATE = new Date('2026-05-12T00:00:00'); 

// --- INICJALIZACJA I STATYSTYKI ---
window.onload = function() {
    loadStats();
    checkDailyStatus();
    renderLastGames();
};

function loadStats() {
    let saved = localStorage.getItem('speedwayStats');
    if(saved) {
        userStats = JSON.parse(saved);
        // Zapewnienie kompatybilności ze starymi zapisami przeglądarki
        if (!userStats.gameHistory) userStats.gameHistory = [];
        if (!userStats.lastDailyDate) userStats.lastDailyDate = "";
    }
}

function saveStats() {
    localStorage.setItem('speedwayStats', JSON.stringify(userStats));
}

// Sprawdza, czy dzisiejsze Daily zostało już rozegrane
function checkDailyStatus() {
    const today = new Date().toISOString().split('T')[0];
    const btn = document.getElementById('btnDailyMode');
    const txt = document.getElementById('dailyBtnText');

    if (btn && txt && userStats.lastDailyDate === today) {
        btn.disabled = true;
        btn.classList.add('disabled');
        txt.innerText = "Daily ukończone ✅";
    }
}

// Dodaje grę do historii (maksymalnie 5 wpisów)
function addGameToHistory(player, won, attempts) {
    const newEntry = {
        name: player.name,
        won: won,
        attempts: attempts,
        mode: gameMode,
        date: new Date().toLocaleDateString()
    };
    
    userStats.gameHistory.unshift(newEntry);
    if (userStats.gameHistory.length > 5) {
        userStats.gameHistory.pop();
    }
    saveStats();
}

function renderLastGames() {
    const container = document.getElementById('lastGamesContainer');
    const list = document.getElementById('lastGamesList');
    
    if (container && list && userStats.gameHistory && userStats.gameHistory.length > 0) {
        container.style.display = 'block';
        list.innerHTML = '';
        
        userStats.gameHistory.forEach(game => {
            const item = document.createElement('div');
            item.className = `history-item ${game.won ? 'win' : 'loss'}`;
            item.innerHTML = `
                <span>${game.name}</span>
                <span>${game.won ? '✅' : '❌'} (${game.attempts})</span>
            `;
            list.appendChild(item);
        });
    }
}

function updateStatsOnWin() {
    if(hasWon || hasLost) return; 
    hasWon = true;
    userStats.played++;
    userStats.won++;
    userStats.currentStreak++;
    if(userStats.currentStreak > userStats.maxStreak) userStats.maxStreak = userStats.currentStreak;
    
    if (gameMode === 'daily') {
        userStats.lastDailyDate = new Date().toISOString().split('T')[0];
    }
    
    addGameToHistory(targetPlayer, true, guessCount);
    saveStats();
}

function updateStatsOnLoss() {
    if(hasWon || hasLost) return;
    hasLost = true;
    userStats.played++;
    userStats.currentStreak = 0; 
    
    if (gameMode === 'daily') {
        userStats.lastDailyDate = new Date().toISOString().split('T')[0];
    }

    addGameToHistory(targetPlayer, false, guessCount);
    saveStats();
}

function showStats() {
    document.getElementById('statPlayed').innerText = userStats.played;
    document.getElementById('statWon').innerText = userStats.won;
    document.getElementById('statStreak').innerText = userStats.currentStreak;
    document.getElementById('statMaxStreak').innerText = userStats.maxStreak;
    document.getElementById('statsOverlay').style.display = 'block';
    setTimeout(() => { document.getElementById('statsOverlay').style.opacity = '1'; }, 10);
}

function closeStats() {
    document.getElementById('statsOverlay').style.opacity = '0';
    setTimeout(() => { document.getElementById('statsOverlay').style.display = 'none'; }, 500);
}

// --- FUNKCJE MENU ---
function startDailyGame() {
    gameMode = 'daily';
    document.getElementById('mainMenuContainer').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';
    initGame();
}

function startEndlessGame() {
    gameMode = 'endless';
    document.getElementById('mainMenuContainer').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';
    initGame();
}

function updateCounterDisplay() {
    const counterDisplay = document.getElementById('guessCounterDisplay');
    if (gameMode === 'daily') {
        counterDisplay.style.display = 'block';
        counterDisplay.innerText = `Próba: ${guessCount}/${DAILY_LIMIT}`;
    } else {
        counterDisplay.style.display = 'none';
    }
}

function resetBoardAndPlay() {
    closeWinOverlay();
    
    document.getElementById('loseOverlay').style.opacity = '0';
    setTimeout(() => { document.getElementById('loseOverlay').style.display = 'none'; }, 500);
    
    guessCount = 0;
    guessHistory = [];
    hasWon = false;
    hasLost = false;

    document.getElementById('results').innerHTML = '';
    document.getElementById('guessInput').value = '';
    document.getElementById('mysteryPhoto').style.display = 'none';
    document.getElementById('mysteryPlaceholder').style.display = 'block';
    document.getElementById('photoWrapper').classList.remove('revealed');
    document.getElementById('mysteryName').innerText = '???';
    document.getElementById('mysteryName').style.color = 'var(--text-main)'; 
    document.getElementById('postGameActions').style.display = 'none';

    gameMode = 'endless';
    initGame();
}

function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function initGame() {
    let randomIndex;
    const modeDisplay = document.getElementById('gameModeDisplay');

    if (gameMode === 'daily') {
        const now = new Date();
        const dateSeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
        const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        const startUTC = Date.UTC(DAILY_START_DATE.getFullYear(), DAILY_START_DATE.getMonth(), DAILY_START_DATE.getDate());
        
        const dailyNumber = Math.floor((nowUTC - startUTC) / (1000 * 60 * 60 * 24)) + 1;
        dailyNumberGlobal = dailyNumber.toString();
        
        randomIndex = Math.floor(seededRandom(dateSeed) * playersDB.length);
        targetPlayer = playersDB[randomIndex];
        
        modeDisplay.innerText = `Tryb: Daily #${dailyNumberGlobal}`;
    } else {
        randomIndex = Math.floor(Math.random() * playersDB.length);
        targetPlayer = playersDB[randomIndex];
        modeDisplay.innerText = `Tryb: Endless`;
    }

    buildTeamPath();
    setupAutocomplete();
    updateCounterDisplay();
}

// --- FUNKCJE POMOCNICZE ---
function removePolishAccents(str) {
    const accents = 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ';
    const noAccents = 'acelnoszzACELNOSZZ';
    return str.split('').map(char => {
        const index = accents.indexOf(char);
        return index !== -1 ? noAccents[index] : char;
    }).join('');
}

function getCleanClubName(clubName) {
    return clubName ? clubName.replace(" (W)", "").trim() : "";
}

function getClubAbbr(clubName) {
    if (!clubName) return "---";
    let cleanName = getCleanClubName(clubName).toLowerCase();
    
    // Sprawdzenie w słowniku
    if (clubAbbreviations[cleanName]) {
        return clubAbbreviations[cleanName];
    }
    
    // Fallback awaryjny (np. "ŻKS Ostrovia" -> "OST")
    let words = cleanName.split(' ');
    let lastWord = words[words.length - 1];
    let abbr = removePolishAccents(lastWord.substring(0, 3)).toUpperCase();
    return abbr;
}

// --- AUTOCOMPLETE ---
function setupAutocomplete() {
    const input = document.getElementById('guessInput');
    input.replaceWith(input.cloneNode(true));
    const newInput = document.getElementById('guessInput');

    newInput.addEventListener('input', function() {
        let val = this.value;
        closeAllLists();
        if (!val || val.length < 2) { return false; }
        
        let listContainer = document.createElement("DIV");
        listContainer.setAttribute("id", this.id + "autocomplete-list");
        listContainer.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(listContainer);
        
        let valClean = removePolishAccents(val.toLowerCase());

        playersDB.forEach(player => {
            let playerClean = removePolishAccents(player.name.toLowerCase());
            if (playerClean.includes(valClean)) {
                let item = document.createElement("DIV");
                item.innerHTML = player.name;
                item.addEventListener("click", function(e) {
                    newInput.value = player.name; 
                    closeAllLists();              
                });
                listContainer.appendChild(item);
            }
        });
    });
    
    document.addEventListener("click", function (e) {
        closeAllLists(e.target);
    });
    
    function closeAllLists(elmnt) {
        let x = document.getElementsByClassName("autocomplete-items");
        for (let i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != newInput) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }
}

// --- LOGIKA KARTY I ZGADYWANIA ---
function buildTeamPath() {
    const pathContainer = document.getElementById('pathBoxes');
    pathContainer.innerHTML = ''; 
    
    targetPlayer.pastClubs.forEach((club, index) => {
        const box = document.createElement('div');
        box.className = 'path-box';
        box.id = `pathBox-${index}`;
        box.innerText = '?';
        box.dataset.club = club; 
        pathContainer.appendChild(box);
        if (index < targetPlayer.pastClubs.length - 1) {
            const arrow = document.createElement('div');
            arrow.className = 'path-arrow';
            arrow.innerText = '→';
            pathContainer.appendChild(arrow);
        }
    });

    let isRetired = (targetPlayer.status && targetPlayer.status.toLowerCase().includes("koniec")) || targetPlayer.status === "Ś.P.";
    if (isRetired) {
        const arrow = document.createElement('div');
        arrow.className = 'path-arrow';
        arrow.innerText = '→';
        pathContainer.appendChild(arrow);
        
        const endIcon = document.createElement('div');
        endIcon.className = 'path-box'; 
        endIcon.id = 'pathBox-retired';
        endIcon.innerText = '?'; 
        endIcon.title = 'Koniec kariery';
        pathContainer.appendChild(endIcon);
    }
}

function makeGuess() {
    if(hasWon || hasLost) return; 

    const input = document.getElementById('guessInput').value.trim();
    const guessedPlayer = playersDB.find(p => p.name.toLowerCase() === input.toLowerCase());
    if (!guessedPlayer) {
        alert("Brak zawodnika w bazie!");
        return;
    }
    
    guessCount++;
    updateCounterDisplay();
    renderGuess(guessedPlayer);
    revealClubsOnPath(guessedPlayer); 
    document.getElementById('guessInput').value = "";

    if (guessedPlayer.name !== targetPlayer.name) {
        if (gameMode === 'daily' && guessCount >= DAILY_LIMIT) {
            updateStatsOnLoss();
            setTimeout(handleLoss, 1200);
        }
    }
}

function revealClubsOnPath(guessedPlayer) {
    const boxes = document.querySelectorAll('.path-box');
    let guessedCleanClubs = guessedPlayer.pastClubs.map(getCleanClubName);

    boxes.forEach(box => {
        if (!box.dataset.club) return; 
        const targetClub = box.dataset.club;
        const targetCleanClub = getCleanClubName(targetClub);
        
        if (guessedCleanClubs.includes(targetCleanClub)) {
            if (box.innerText === '?') {
                let isLoan = targetClub.includes(" (W)");
                let abbr = getClubAbbr(targetClub);
                
                box.innerText = '';
                box.innerHTML = `
                    <span title="${targetCleanClub}">${abbr}</span>
                    ${isLoan ? '<div class="loan-badge" title="Wypożyczenie">W</div>' : ''}
                `;
                box.classList.add('found');
            }
        }
    });

    let guessedIsRetired = (guessedPlayer.status && guessedPlayer.status.toLowerCase().includes("koniec")) || guessedPlayer.status === "Ś.P.";
    let targetIsRetired = (targetPlayer.status && targetPlayer.status.toLowerCase().includes("koniec")) || targetPlayer.status === "Ś.P.";

    if (guessedIsRetired && targetIsRetired) {
        const endBox = document.getElementById('pathBox-retired');
        if (endBox && endBox.innerText === '?') {
            endBox.innerText = '❌';
            endBox.classList.add('found');
            endBox.style.background = 'transparent';
            endBox.style.border = 'none';
            endBox.style.fontSize = '24px';
        }
    }
}

function renderGuess(player) {
    const resultsDiv = document.getElementById('results');
    const row = document.createElement('div');
    row.className = 'guess-row';

    let htmlContent = `<div class="col-name">${player.name}</div>`;
    let rowEmojis = ""; 
    
    const attrs = [
        { type: 'country', val: player.country },
        { type: 'year', val: player.year },
        { type: 'gp', val: player.gp },
        { type: 'dmp', val: player.dmp },
        { type: 'status', val: player.status } 
    ];

    attrs.forEach((attr, index) => {
        let cls = "red";
        let content = "";

        if (attr.type === 'country') {
            let pCountries = player.country.split("/").map(c => c.trim());
            let tCountries = targetPlayer.country.split("/").map(c => c.trim());

            if (player.country === targetPlayer.country) cls = "green";
            else if (pCountries.some(c => tCountries.includes(c)) || player.region === targetPlayer.region) cls = "yellow";
            
            if (pCountries.length > 1) {
                let c1 = countryToCode[pCountries[0]] || 'pl';
                let c2 = countryToCode[pCountries[1]] || 'pl';
                content = `<div class="tile-flag-dual" title="${player.country}"><img src="https://flagcdn.com/h80/${c1}.png" class="flag-left"><img src="https://flagcdn.com/h80/${c2}.png" class="flag-right"></div>`;
            } else {
                content = `<img src="https://flagcdn.com/w80/${countryToCode[player.country] || 'pl'}.png" class="tile-flag" title="${player.country}">`;
            }
        } else if (attr.type === 'year') {
            cls = (player.year === targetPlayer.year) ? "green" : "red";
            content = `<span class="val-num">${player.year}</span>`;
            if (player.year > targetPlayer.year) content += `<span class="val-arrow">⬇️</span>`;
            else if (player.year < targetPlayer.year) content += `<span class="val-arrow">⬆️</span>`;
        } else if (attr.type === 'gp') {
            cls = (player.gp === targetPlayer.gp) ? "green" : "red";
            content = `<span class="val-num">${player.gp}</span>`;
        } else if (attr.type === 'dmp') {
            cls = (player.dmp === targetPlayer.dmp) ? "green" : "red";
            content = `<span class="val-num">${player.dmp}</span>`;
            if (player.dmp > targetPlayer.dmp) content += `<span class="val-arrow">⬇️</span>`;
            else if (player.dmp < targetPlayer.dmp) content += `<span class="val-arrow">⬆️</span>`;
        } else if (attr.type === 'status') {
            cls = (player.status === targetPlayer.status) ? "green" : "red";
            let isRetiredStatus = (player.status && player.status.toLowerCase().includes("koniec")) || player.status === "Ś.P.";
            content = `<span class="status-icon">${isRetiredStatus ? "❌" : "✅"}</span>`;
        }
        
        if (cls === 'green') rowEmojis += '🟩';
        else if (cls === 'yellow') rowEmojis += '🟨';
        else rowEmojis += '🟥';

        htmlContent += `<div class="col-attr"><div class="attr-box ${cls}">${content}</div></div>`;
    });

    guessHistory.push(rowEmojis);

    let clubsInnerHtml = "";
    const uniquePlayerClubs = [...new Set(player.pastClubs)];
    let targetCleanClubs = targetPlayer.pastClubs.map(getCleanClubName);

    uniquePlayerClubs.forEach((club, i) => {
        let cleanClub = getCleanClubName(club);
        let abbr = getClubAbbr(cleanClub); 
        let isMatch = targetCleanClubs.includes(cleanClub); 
        let clubClass = isMatch ? "club-match" : "club-dim";
        let isLoan = club.includes(" (W)");

        let logoImg = `
        <div class="club-logo-wrapper">
            <div class="club-abbr-box ${clubClass}" title="${club}">${abbr}</div>
            ${isLoan ? '<div class="loan-badge" title="Wypożyczenie">W</div>' : ''}
        </div>`;
        
        clubsInnerHtml += logoImg;
        if (i < uniquePlayerClubs.length - 1) clubsInnerHtml += `<div class="club-divider"></div>`;
    });

    htmlContent += `<div class="col-clubs"><div class="clubs-path-container">${clubsInnerHtml}</div></div>`;
    row.innerHTML = htmlContent;
    resultsDiv.insertBefore(row, resultsDiv.firstChild);

    if (player.name === targetPlayer.name) {
        updateStatsOnWin();
        setTimeout(handleWin, 1200);
    }
}

// --- FUNKCJE WYGRANEJ / PRZEGRANEJ I SHARE ---
function handleWin() {
    revealTargetInfoUI();
    
    const btnShare = document.getElementById('btnShareWin');
    const btnPlayAgain = document.getElementById('btnPlayAgain');
    const btnPlayAgainPost = document.getElementById('btnPlayAgainPost');
    
    if (gameMode === 'daily') {
        btnShare.style.display = 'inline-block';
        btnPlayAgain.innerText = "GRAJ W TRYB ENDLESS";
        btnPlayAgainPost.innerText = "GRAJ W TRYB ENDLESS";
    } else {
        btnShare.style.display = 'none'; 
        btnPlayAgain.innerText = "ZAGRAJ PONOWNIE";
        btnPlayAgainPost.innerText = "ZAGRAJ PONOWNIE";
    }

    launchConfetti();
}

function handleLoss() {
    const loseOverlay = document.getElementById('loseOverlay');
    loseOverlay.style.display = 'block';
    setTimeout(() => { loseOverlay.style.opacity = '1'; }, 10);
}

function revealTargetPlayer() {
    document.getElementById('loseOverlay').style.opacity = '0';
    setTimeout(() => { document.getElementById('loseOverlay').style.display = 'none'; }, 500);

    revealTargetInfoUI();
    
    document.getElementById('mysteryName').style.color = "var(--red-neon)";
    document.getElementById('postGameActions').style.display = 'flex';
    document.getElementById('btnPlayAgainPost').innerText = "GRAJ W TRYB ENDLESS";
}

function revealTargetInfoUI() {
    const placeholder = document.getElementById('mysteryPlaceholder');
    const photoWrapper = document.getElementById('photoWrapper');
    const photoImg = document.getElementById('mysteryPhoto');
    
    if (placeholder) placeholder.style.display = 'none';
    photoImg.src = `images/riders/image_0.png`; 
    photoImg.style.display = 'block';
    photoWrapper.classList.add('revealed'); 

    document.getElementById('mysteryName').innerText = targetPlayer.name;
    
    const boxes = document.querySelectorAll('.path-box');
    boxes.forEach(box => {
        if (!box.dataset.club) return; 
        const targetClub = box.dataset.club;
        let isLoan = targetClub.includes(" (W)");
        let abbr = getClubAbbr(targetClub);
        
        box.innerText = '';
        box.innerHTML = `
            <span title="${getCleanClubName(targetClub)}">${abbr}</span>
            ${isLoan ? '<div class="loan-badge" title="Wypożyczenie">W</div>' : ''}
        `;
        box.classList.add('found'); 
    });

    const endBox = document.getElementById('pathBox-retired');
    if (endBox) {
        endBox.innerText = '❌';
        endBox.classList.add('found');
        endBox.style.background = 'transparent';
        endBox.style.border = 'none';
        endBox.style.fontSize = '24px';
    }
}

function shareResult() {
    let textToShare = `🏁 Speedway Guessr (Daily #${dailyNumberGlobal})\nLiczba prób: ${guessCount}/${DAILY_LIMIT}\n\n`;
    
    guessHistory.forEach(row => { textToShare += row + '\n'; });
    
    navigator.clipboard.writeText(textToShare).then(() => {
        alert("Wynik skopiowany do schowka! Możesz go wkleić znajomym.");
    }).catch(err => {
        alert("Nie udało się skopiować automatycznie.");
    });
}

function closeWinOverlay() {
     document.getElementById('winOverlay').style.opacity = '0';
    setTimeout(() => { document.getElementById('winOverlay').style.display = 'none'; }, 500);
}

function showResultsOnly() { 
    closeWinOverlay();
    const postActions = document.getElementById('postGameActions');
    if (postActions) postActions.style.display = 'flex';
}

// --- OBSŁUGA MOTYWÓW ---
function setTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('theme', themeName);
}

// --- KONFETTI ---
function launchConfetti() {
    const overlay = document.getElementById('winOverlay');
    overlay.style.display = 'block';
    setTimeout(() => { overlay.style.opacity = '1'; }, 10);
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    let particles = [];
    for (let i = 0; i < 150; i++) {
        particles.push({
            x: Math.random() * canvas.width, y: Math.random() * -canvas.height,
            w: 10, h: 20, color: ['#f1c40f','#e74c3c','#2ecc71','#3498db'][Math.floor(Math.random()*4)],
            sy: Math.random() * 4 + 2, r: Math.random() * 360
        });
    }
    function draw() {
        ctx.clearRect(0,0,canvas.width, canvas.height);
        particles.forEach(p => {
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r*Math.PI/180);
            ctx.fillStyle = p.color; ctx.fillRect(-5,-10,p.w,p.h); ctx.restore();
            p.y += p.sy; p.r += 3; if(p.y > canvas.height) p.y = -20;
        });
        requestAnimationFrame(draw);
    }
    draw();
}