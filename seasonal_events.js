/**
 * SPEEDWAY GUESSR - SEASONAL EVENTS ENGINE (UPGRADED)
 * Pełny system dynamicznych wydarzeń sezonowych w menu:
 * - 🎃 HALLOWEEN (24.10 - 03.11): mroczny klimat na torze, mroczne tło, iskry, latające nietoperze, dynia w logo, narożne pajęczyny z pająkiem (BEZ rozdawania za darmo – tylko czysty mroczny klimat)
 * - ❄️ ZIMA (01.12 - 31.01): padający puszysty śnieg w menu, zimowy lodowy styl kafelków i tabeli
 * - 🎄 KALENDARZ ADWENTOWY (01.12 - 24.12): jedyny event z darmowymi codziennymi prezentami – 24 okienka z monetami, EXP i tytułami (Mikołajki, Wigilia)
 * - 🐣 WIELKANOC: wiosenny zielony motyw, zajączek w logo i 3 pisanki
 * - ⚙️ Wybór i podgląd na żywo każdego z motywów w Ustawieniach
 */

(function () {
    'use strict';

    // Konfiguracja nagród Kalendarza Adwentowego (1 - 24 Grudnia) - z unikalnymi nagrodami świątecznymi!
    const ADVENT_REWARDS = {
        1:  { type: 'coins', amount: 100, label: '100 Monet 🪙' },
        2:  { type: 'exp',   amount: 100, label: '100 EXP ⭐' },
        3:  { type: 'coins', amount: 150, label: '150 Monet 🪙' },
        4:  { type: 'exp',   amount: 150, label: '150 EXP ⭐' },
        5:  { type: 'coins', amount: 200, label: '200 Monet 🪙' },
        6:  { 
            type: 'special', 
            coins: 300, 
            exp: 200, 
            label: 'Mikołajki! Emotki Clash 🎁', 
            title: 'Mikołaj Toru 🎅', 
            emoteId: 'emote-swieta', 
            isHighlight: true,
            highlightTag: '🎅 MIKOŁAJKI',
            badge: '🎁 EMOTKI CLASH'
        },
        7:  { type: 'coins', amount: 200, label: '200 Monet 🪙' },
        8:  { type: 'exp',   amount: 200, label: '200 EXP ⭐' },
        9:  { type: 'coins', amount: 250, label: '250 Monet 🪙' },
        10: { type: 'exp',   amount: 250, label: '250 EXP ⭐' },
        11: { type: 'coins', amount: 300, label: '300 Monet 🪙' },
        12: { 
            type: 'special', 
            coins: 300, 
            exp: 250, 
            label: 'Świąteczna Ramka ❄️', 
            frameId: 'helmet-swieta', 
            isHighlight: true,
            highlightTag: '❄️ RAMKA',
            badge: '🖼️ RAMKA AWATARA'
        },
        13: { type: 'exp',   amount: 300, label: '300 EXP ⭐' },
        14: { type: 'coins', amount: 350, label: '350 Monet 🪙' },
        15: { type: 'exp',   amount: 350, label: '350 EXP ⭐' },
        16: { type: 'coins', amount: 400, label: '400 Monet 🪙' },
        17: { type: 'exp',   amount: 400, label: '400 EXP ⭐' },
        18: { 
            type: 'special', 
            coins: 500, 
            exp: 300, 
            label: 'Świąteczne Tło Rankingu 🌌', 
            bgId: 'rank-bg-swieta', 
            isHighlight: true,
            highlightTag: '🌌 TŁO',
            badge: '🏆 TŁO RANKINGU'
        },
        19: { type: 'coins', amount: 450, label: '450 Monet 🪙' },
        20: { type: 'coins', amount: 500, label: '500 Monet 🪙' },
        21: { type: 'exp',   amount: 450, label: '450 EXP ⭐' },
        22: { type: 'coins', amount: 600, label: '600 Monet 🪙' },
        23: { type: 'coins', amount: 750, label: '750 Monet 🪙' },
        24: { 
            type: 'special', 
            coins: 1500, 
            exp: 1000, 
            label: 'Wigilia! Świąteczna Wygrana ⭐', 
            title: 'Gwiazdor Żużla ⭐', 
            winId: 'win-swieta', 
            isHighlight: true,
            highlightTag: '⭐ WIGILIA',
            badge: '🎆 EVENT WYGRANEJ'
        }
    };

    // Obliczanie Wielkanocy metodą Anonymous Gregorian
    function getEasterSunday(year) {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month - 1, day);
    }

    function detectCurrentEvent(date = new Date()) {
        const month = date.getMonth(); // 0 = Jan, 9 = Oct, 11 = Dec
        const day = date.getDate();
        const year = date.getFullYear();

        // 1. Halloween: 24 października do 3 listopada
        if ((month === 9 && day >= 24) || (month === 10 && day <= 3)) {
            return 'halloween';
        }

        // 2. Kalendarz Adwentowy: 1 do 24 grudnia
        if (month === 11 && day >= 1 && day <= 24) {
            return 'advent';
        }

        // 3. Zima i Śnieg: cały grudzień i styczeń
        if (month === 11 || month === 0) {
            return 'winter';
        }

        // 4. Wielkanoc: Wielki Czwartek do Wtorku po Wielkanocy
        const easterSunday = getEasterSunday(year);
        const easterStart = new Date(easterSunday);
        easterStart.setDate(easterSunday.getDate() - 3);
        const easterEnd = new Date(easterSunday);
        easterEnd.setDate(easterSunday.getDate() + 2);

        const checkTime = new Date(year, month, day).getTime();
        if (checkTime >= easterStart.getTime() && checkTime <= easterEnd.getTime()) {
            return 'easter';
        }

        return 'none';
    }

    window.SeasonalEvents = {
        activeEvent: 'none',
        canvasAnimationId: null,
        canvasElement: null,
        canvasCtx: null,
        particles: [],
        bats: [],
        isCanvasRunning: false,

        init: function () {
            this.ensureUserSeasonalStats();
            const currentDetectedEvent = detectCurrentEvent();
            let savedSetting = localStorage.getItem('speedwaySeasonalEvent');

            // W okresie Halloween nadpisujemy stary zapis w localStorage, żeby nie zostać zablokowanym
            // przez dawny wybór "winter" z poprzedniego eventu.
            if (!savedSetting || savedSetting === 'auto' || savedSetting === 'hallowee') {
                savedSetting = 'halloween';
            } else if (currentDetectedEvent === 'halloween' && savedSetting !== 'halloween') {
                savedSetting = 'halloween';
            }

            localStorage.setItem('speedwaySeasonalEvent', savedSetting);
            this.applyEvent(savedSetting, false);
            this.setupScreenWatcher();
        },

        ensureUserSeasonalStats: function () {
            if (typeof userStats === 'undefined') return;
            if (!userStats.seasonalRewards) userStats.seasonalRewards = {};
            if (!userStats.seasonalRewards.advent) userStats.seasonalRewards.advent = {};
            if (typeof userStats.seasonalRewards.halloweenRewarded === 'undefined') {
                userStats.seasonalRewards.halloweenRewarded = false;
            }
        },

        awardHalloweenReward: function () {
            if (typeof userStats === 'undefined') return;
            this.ensureUserSeasonalStats();

            if (userStats.seasonalRewards.halloweenRewarded) return;

            if (!userStats.ownedHelmets) userStats.ownedHelmets = ['default'];
            if (!userStats.ownedHelmets.includes('helmet-halloween')) {
                userStats.ownedHelmets.push('helmet-halloween');
            }
            userStats.equippedHelmet = 'helmet-halloween';

            if (typeof userStats.coins === 'undefined') userStats.coins = 0;
            userStats.coins += 666;

            if (typeof addExp === 'function') {
                addExp(666);
            } else {
                userStats.exp = (userStats.exp || 0) + 666;
            }

            userStats.seasonalRewards.halloweenRewarded = true;
            if (typeof saveStats === 'function') saveStats();
            if (typeof updateCounterDisplay === 'function') updateCounterDisplay();
            if (typeof showToast === 'function') {
                showToast('🎃 Halloween: otrzymujesz ramkę profilową, 666 🪙 i 666 EXP!', 'success');
            }
        },

        setEvent: function (eventName, save = true) {
            if (save) {
                localStorage.setItem('speedwaySeasonalEvent', eventName);
            }
            let targetEvent = eventName;
            if (eventName === 'auto') {
                targetEvent = detectCurrentEvent();
            }
            this.applyEvent(targetEvent, true);
        },

        updateBodyBackground: function(event) {
            const currentBg = (typeof stadiumBackgrounds !== 'undefined' && stadiumBackgrounds.length > 0)
                ? stadiumBackgrounds[0]
                : "url('https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1920&q=80')";

            if (event === 'halloween') {
                document.body.style.setProperty('background-image', `linear-gradient(rgba(22, 10, 18, 0.9), rgba(10, 5, 14, 0.98)), radial-gradient(circle at 50% 25%, rgba(255, 120, 0, 0.35) 0%, rgba(0, 0, 0, 0.85) 75%), ${currentBg}`, 'important');
            } else if (event === 'winter' || event === 'advent') {
                document.body.style.setProperty('background-image', `linear-gradient(rgba(10, 22, 38, 0.9), rgba(5, 12, 22, 0.98)), radial-gradient(circle at 50% 25%, rgba(68, 189, 255, 0.3) 0%, rgba(0, 0, 0, 0.85) 75%), ${currentBg}`, 'important');
            } else if (event === 'easter') {
                document.body.style.setProperty('background-image', `linear-gradient(rgba(12, 26, 16, 0.9), rgba(6, 15, 9, 0.98)), radial-gradient(circle at 50% 25%, rgba(46, 204, 113, 0.3) 0%, rgba(0, 0, 0, 0.85) 75%), ${currentBg}`, 'important');
            } else {
                if (typeof setRandomBackground === 'function') {
                    setRandomBackground();
                }
            }
        },

        applyEvent: function (event, notify = false) {
            this.activeEvent = event;
            this.removeDecorations();

            // Zarządzanie klasami na body
            document.body.classList.remove('seasonal-halloween', 'seasonal-winter', 'seasonal-advent', 'seasonal-easter');
            this.updateBodyBackground(event);

            if (event === 'halloween') {
                document.body.classList.add('seasonal-halloween');
                this.renderHalloween();
                this.startAtmosphere('halloween');
                if (notify && typeof showToast === 'function') {
                    showToast('🎃 Włączono mroczny klimat Halloween!', 'success');
                }
            } else if (event === 'winter' || event === 'advent') {
                document.body.classList.add(event === 'advent' ? 'seasonal-advent' : 'seasonal-winter');
                this.renderWinter(event === 'advent');
                this.startAtmosphere('snow');
                if (notify && typeof showToast === 'function') {
                    showToast(event === 'advent' ? '🎄 Włączono Kalendarz Adwentowy & Śnieg!' : '❄️ Włączono Zimę i Padający Śnieg!', 'success');
                }
            } else if (event === 'easter') {
                document.body.classList.add('seasonal-easter');
                this.renderEaster();
                if (notify && typeof showToast === 'function') {
                    showToast('🐣 Włączono Wielkanoc!', 'success');
                }
            } else {
                this.stopAtmosphere();
                if (notify && typeof showToast === 'function') {
                    showToast('Standardowy motyw menu.', 'info');
                }
            }

            const sel = document.getElementById('seasonalEventSelector');
            const savedSetting = localStorage.getItem('speedwaySeasonalEvent') || 'auto';
            if (sel) sel.value = savedSetting;
        },

        removeDecorations: function () {
            document.querySelectorAll('.seasonal-element').forEach(el => el.remove());
            this.stopAtmosphere();
        },

        // ===================================================
        // 🎃 HALLOWEEN: MROCZNY KLIMAT, BEZ NAGRÓD ZA DARMO
        // ===================================================
        renderHalloween: function () {
            // Pajęczyny narożne z wiszącym pająkiem
            const leftWeb = document.createElement('div');
            leftWeb.className = 'seasonal-element seasonal-corner-web corner-web-left';
            leftWeb.innerHTML = `
                <svg viewBox="0 0 100 100" class="web-svg">
                    <path d="M0,0 L100,0 C65,35 35,65 0,100 Z" fill="rgba(255, 120, 0, 0.12)"/>
                    <path d="M0,0 L100,0 M0,0 L85,35 M0,0 L60,65 M0,0 L35,85 M0,0 L0,100" stroke="rgba(255, 255, 255, 0.85)" stroke-width="1.8" fill="none"/>
                    <path d="M12,0 Q12,12 0,12 M28,0 Q28,28 0,28 M48,0 Q48,48 0,48 M72,0 Q72,72 0,72 M100,0 Q100,100 0,100" stroke="rgba(255, 160, 0, 0.95)" stroke-width="1.8" fill="none"/>
                </svg>
                <div class="seasonal-spider-thread">
                    <span class="seasonal-spider">🕷️</span>
                </div>
            `;
            document.body.appendChild(leftWeb);

            const rightWeb = document.createElement('div');
            rightWeb.className = 'seasonal-element seasonal-corner-web corner-web-right';
            rightWeb.innerHTML = `
                <svg viewBox="0 0 100 100" class="web-svg">
                    <path d="M100,0 L0,0 C35,35 65,65 100,100 Z" fill="rgba(255, 120, 0, 0.12)"/>
                    <path d="M100,0 L0,0 M100,0 L15,35 M100,0 L40,65 M100,0 L65,85 M100,0 L100,100" stroke="rgba(255, 255, 255, 0.85)" stroke-width="1.8" fill="none"/>
                    <path d="M88,0 Q88,12 100,12 M72,0 Q72,28 100,28 M52,0 Q52,48 100,48 M28,0 Q28,72 100,72 M0,0 Q0,100 100,100" stroke="rgba(255, 160, 0, 0.95)" stroke-width="1.8" fill="none"/>
                </svg>
            `;
            document.body.appendChild(rightWeb);

            this.decorateLogo('🎃');

            // Karta informacyjna klimatu z możliwością ręcznego odbioru nagrody Halloween
            const hasReward = typeof userStats !== 'undefined' && userStats.seasonalRewards && userStats.seasonalRewards.halloweenRewarded;
            this.insertBanner('halloween', `
                <div class="seasonal-card-left">
                    <div class="seasonal-card-icon-box pumpkin-glow">
                        <span class="seasonal-animated-icon">🎃</span>
                    </div>
                    <div class="seasonal-card-text">
                        <div class="seasonal-tag-row">
                            <span class="seasonal-badge-tag tag-halloween">🎃 EVENT SEZONOWY</span>
                            <span class="seasonal-badge-sub">31 PAŹDZIERNIKA</span>
                        </div>
                        <div class="seasonal-title">HALLOWEEN: MROCZNA NOC NA TORZE 🦇</div>
                        <div class="seasonal-desc">Mroczny klimat ogarnął Speedway Guessr! Odbierz nagrodę za event i zyskaj ramkę Halloween.</div>
                    </div>
                </div>
                <div class="seasonal-card-right">
                    <div class="seasonal-status-pill" style="border-color: #ff7700; color: #ff9f43; background: rgba(255, 119, 0, 0.15);">🎃 HALLOWEEN</div>
                    <button class="seasonal-action-btn" onclick="window.SeasonalEvents.awardHalloweenReward()" ${hasReward ? 'disabled' : ''}>
                        ${hasReward ? 'ODEBRANO' : 'ODBierz RAMKĘ'}
                    </button>
                </div>
            `);
        },

        // ===================================================
        // ===================================================
        // ===================================================
        // ❄️ ZIMA & 🎄 KALENDARZ ADWENTOWY (JEDYNY Z NAGRODAMI)
        // ===================================================
        renderWinter: function (isAdvent = false) {
            this.ensureUserSeasonalStats();
            this.decorateLogo(isAdvent ? '🎄' : '❄️');

            // 1. Puszysta czapa śnieżna na górną krawędź panelu Leaderboardu
            const lbPanel = document.querySelector('.desktop-leaderboard-panel');
            if (lbPanel && !lbPanel.querySelector('.snow-cap-leaderboard')) {
                const snowCap = document.createElement('div');
                snowCap.className = 'seasonal-element snow-cap-leaderboard';
                snowCap.innerHTML = `
                    <svg class="pillow-snow-svg" viewBox="0 0 700 70" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="pillowSnowGradLb" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stop-color="#ffffff"/>
                                <stop offset="68%" stop-color="#f2f7fc"/>
                                <stop offset="100%" stop-color="#dceaf6"/>
                            </linearGradient>
                            <linearGradient id="pillowSnowRimLb" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stop-color="#c5d8ea"/>
                                <stop offset="100%" stop-color="#99bbda"/>
                            </linearGradient>
                            <filter id="pillowDropShadowLb" x="-5%" y="-5%" width="110%" height="135%">
                                <feDropShadow dx="0" dy="4" stdDeviation="4.5" flood-color="rgba(0, 0, 0, 0.5)"/>
                            </filter>
                        </defs>
                        <!-- 3D krawędź grubości poduszki śniegu z cieniem na panelu -->
                        <path d="M 0,24 Q 0,0 24,0 L 676,0 Q 700,0 700,24 L 700,32 C 700,42 692,44 684,40 C 674,35 666,54 648,54 C 632,54 624,34 612,34 C 600,34 592,48 576,48 C 560,48 552,32 538,32 C 524,32 514,62 492,62 C 472,62 464,34 450,34 C 436,34 428,50 412,50 C 396,50 388,32 374,32 C 360,32 348,65 324,65 C 302,65 292,34 278,34 C 264,34 256,52 238,52 C 222,52 214,32 200,32 C 186,32 176,58 154,58 C 134,58 126,34 112,34 C 98,34 90,50 74,50 C 58,50 50,34 38,34 C 26,34 16,52 8,50 C 2,48 0,40 0,32 Z" 
                              fill="url(#pillowSnowRimLb)" transform="translate(0, 3.5)" filter="url(#pillowDropShadowLb)"/>
                        <!-- Główna puszysta bryła śniegu (czysta biel + lodowy odcień) -->
                        <path d="M 0,24 Q 0,0 24,0 L 676,0 Q 700,0 700,24 L 700,32 C 700,42 692,44 684,40 C 674,35 666,54 648,54 C 632,54 624,34 612,34 C 600,34 592,48 576,48 C 560,48 552,32 538,32 C 524,32 514,62 492,62 C 472,62 464,34 450,34 C 436,34 428,50 412,50 C 396,50 388,32 374,32 C 360,32 348,65 324,65 C 302,65 292,34 278,34 C 264,34 256,52 238,52 C 222,52 214,32 200,32 C 186,32 176,58 154,58 C 134,58 126,34 112,34 C 98,34 90,50 74,50 C 58,50 50,34 38,34 C 26,34 16,52 8,50 C 2,48 0,40 0,32 Z" 
                              fill="url(#pillowSnowGradLb)"/>
                        <!-- Górny delikatny blask puszystości -->
                        <path d="M 24,3 L 676,3" stroke="rgba(255, 255, 255, 0.9)" stroke-width="2.5" stroke-linecap="round"/>
                    </svg>
                `;
                lbPanel.prepend(snowCap);
            }

            // 2. Puszysta czapa śnieżna na przycisk Discorda (jak w 'Snow button')
            document.querySelectorAll('.menu-discord-btn').forEach(btn => {
                if (!btn.querySelector('.snow-cap-discord')) {
                    const snowDiscord = document.createElement('div');
                    snowDiscord.className = 'seasonal-element snow-cap-discord';
                    snowDiscord.innerHTML = `
                        <svg class="pillow-snow-svg" viewBox="0 0 240 34" preserveAspectRatio="none">
                            <defs>
                                <linearGradient id="pillowSnowGradDc" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stop-color="#ffffff"/>
                                    <stop offset="68%" stop-color="#f2f7fc"/>
                                    <stop offset="100%" stop-color="#dceaf6"/>
                                </linearGradient>
                                <linearGradient id="pillowSnowRimDc" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stop-color="#c5d8ea"/>
                                    <stop offset="100%" stop-color="#99bbda"/>
                                </linearGradient>
                                <filter id="pillowDropShadowDc" x="-8%" y="-8%" width="116%" height="140%">
                                    <feDropShadow dx="0" dy="3.5" stdDeviation="3.5" flood-color="rgba(0, 0, 0, 0.5)"/>
                                </filter>
                            </defs>
                            <!-- 3D krawędź grubości śniegu z cieniem na przycisku -->
                            <path d="M 0,8 Q 0,0 8,0 L 232,0 Q 240,0 240,8 L 240,14 C 240,20 236,22 232,20 C 225,17 218,26 208,26 C 196,26 190,14 180,14 C 170,14 162,24 150,24 C 138,24 132,15 122,15 C 112,15 104,28 92,28 C 78,28 72,16 62,16 C 54,16 48,22 38,22 C 28,22 22,14 16,14 C 10,14 4,22 0,20 Z" 
                                  fill="url(#pillowSnowRimDc)" transform="translate(0, 2.5)" filter="url(#pillowDropShadowDc)"/>
                            <!-- Główna puszysta czapa śniegu -->
                            <path d="M 0,8 Q 0,0 8,0 L 232,0 Q 240,0 240,8 L 240,14 C 240,20 236,22 232,20 C 225,17 218,26 208,26 C 196,26 190,14 180,14 C 170,14 162,24 150,24 C 138,24 132,15 122,15 C 112,15 104,28 92,28 C 78,28 72,16 62,16 C 54,16 48,22 38,22 C 28,22 22,14 16,14 C 10,14 4,22 0,20 Z" 
                                  fill="url(#pillowSnowGradDc)"/>
                            <!-- Subtelny blask na krawędzi górnej -->
                            <path d="M 8,2 L 232,2" stroke="rgba(255, 255, 255, 0.9)" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    `;
                    btn.prepend(snowDiscord);
                }
            });

            // 3. Puszysta czapa śnieżna leżąca bezpośrednio na footerze
            this.renderFestiveFooterSnow();

            if (isAdvent) {
                const currentMonth = new Date().getMonth();
                const currentDate = new Date().getDate();
                const activeDay = (currentMonth === 11) ? currentDate : 24;

                this.insertBanner('advent', `
                    <div class="seasonal-card-left">
                        <div class="seasonal-card-icon-box tree-glow">
                            <span class="seasonal-animated-icon">🎄</span>
                        </div>
                        <div class="seasonal-card-text">
                            <div class="seasonal-tag-row">
                                <span class="seasonal-badge-tag tag-advent">🎄 1 - 24 GRUDNIA</span>
                                <span class="seasonal-badge-sub">DZIEŃ ${activeDay}/24</span>
                            </div>
                            <div class="seasonal-title">KALENDARZ ADWENTOWY 🎁</div>
                            <div class="seasonal-desc">Codziennie nowe okienko z darmowymi monetami, EXP i unikalnymi nagrodami!</div>
                        </div>
                    </div>
                    <div class="seasonal-card-right">
                        <button class="seasonal-claim-button btn-green-glow" onclick="event.stopPropagation(); window.SeasonalEvents.openAdventModal();">
                            <span>🚪</span> OTWÓRZ OKIENKO
                        </button>
                    </div>
                `);
            } else {
                this.insertBanner('winter', `
                    <div class="seasonal-card-left">
                        <div class="seasonal-card-icon-box snow-glow">
                            <span class="seasonal-animated-icon">❄️</span>
                        </div>
                        <div class="seasonal-card-text">
                            <div class="seasonal-tag-row">
                                <span class="seasonal-badge-tag tag-winter">❄️ SEZON ZIMOWY</span>
                                <span class="seasonal-badge-sub">GRUDZIEŃ - STYCZEŃ</span>
                            </div>
                            <div class="seasonal-title">ZIMOWA PRZERWA W SEZONIE 🌨️</div>
                            <div class="seasonal-desc">Na torze leży śnieg! Śnieżyca w całym menu i lodowy motyw zimy.</div>
                        </div>
                    </div>
                    <div class="seasonal-card-right">
                        <button class="seasonal-claim-button btn-green-glow" onclick="event.stopPropagation(); window.SeasonalEvents.openAdventModal();">
                            <span>🎄</span> KALENDARZ ADWENTOWY 🎁
                        </button>
                    </div>
                `);
            }
        },

        renderFestiveFooterSnow: function () {
            const footer = document.querySelector('.app-footer');
            if (!footer) return;
            if (footer.querySelector('.snow-cap-footer')) return;

            const snowFooter = document.createElement('div');
            snowFooter.className = 'seasonal-element snow-cap-footer';
            snowFooter.innerHTML = `
                <svg class="pillow-snow-svg" viewBox="0 0 1200 42" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="pillowSnowGradFt" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#ffffff"/>
                            <stop offset="68%" stop-color="#f2f7fc"/>
                            <stop offset="100%" stop-color="#dceaf6"/>
                        </linearGradient>
                        <linearGradient id="pillowSnowRimFt" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#c5d8ea"/>
                            <stop offset="100%" stop-color="#99bbda"/>
                        </linearGradient>
                        <filter id="pillowDropShadowFt" x="-2%" y="-5%" width="104%" height="135%">
                            <feDropShadow dx="0" dy="3.5" stdDeviation="4" flood-color="rgba(0, 0, 0, 0.5)"/>
                        </filter>
                    </defs>
                    <!-- 3D krawedz grubosci poduszki sniegu lezacej na linii stopki -->
                    <path d="M 0,0 L 1200,0 L 1200,16 C 1180,24 1165,26 1145,22 C 1125,18 1110,32 1085,32 C 1060,32 1045,18 1025,18 C 1005,18 990,28 970,28 C 950,28 935,16 915,16 C 895,16 880,34 850,34 C 820,34 805,18 785,18 C 765,18 750,28 730,28 C 710,28 695,16 675,16 C 655,16 640,36 605,36 C 570,36 555,16 535,16 C 515,16 500,28 480,28 C 460,28 445,18 425,18 C 405,18 390,34 360,34 C 330,34 315,16 295,16 C 275,16 260,28 240,28 C 220,28 205,18 185,18 C 165,18 150,32 125,32 C 100,32 85,18 65,18 C 45,18 30,24 10,22 L 0,16 Z" 
                          fill="url(#pillowSnowRimFt)" transform="translate(0, 3)" filter="url(#pillowDropShadowFt)"/>
                    <!-- Glowna puszysta czapa sniegu na footerze -->
                    <path d="M 0,0 L 1200,0 L 1200,16 C 1180,24 1165,26 1145,22 C 1125,18 1110,32 1085,32 C 1060,32 1045,18 1025,18 C 1005,18 990,28 970,28 C 950,28 935,16 915,16 C 895,16 880,34 850,34 C 820,34 805,18 785,18 C 765,18 750,28 730,28 C 710,28 695,16 675,16 C 655,16 640,36 605,36 C 570,36 555,16 535,16 C 515,16 500,28 480,28 C 460,28 445,18 425,18 C 405,18 390,34 360,34 C 330,34 315,16 295,16 C 275,16 260,28 240,28 C 220,28 205,18 185,18 C 165,18 150,32 125,32 C 100,32 85,18 65,18 C 45,18 30,24 10,22 L 0,16 Z" 
                          fill="url(#pillowSnowGradFt)"/>
                    <!-- Gorna subtelna krawedz blasku -->
                    <path d="M 0,1.5 L 1200,1.5" stroke="rgba(255, 255, 255, 0.9)" stroke-width="2" stroke-linecap="round"/>
                </svg>
            `;
            footer.prepend(snowFooter);
        },

        openAdventModal: function () {
            this.ensureUserSeasonalStats();
            let overlay = document.getElementById('adventModalOverlay');
            if (!overlay) {
                this.createAdventModalMarkup();
                overlay = document.getElementById('adventModalOverlay');
            }
            this.renderAdventDoors();
            overlay.style.display = 'block';
            setTimeout(() => overlay.style.opacity = '1', 10);
        },

        closeAdventModal: function () {
            const overlay = document.getElementById('adventModalOverlay');
            if (!overlay) return;
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 250);
        },

        createAdventModalMarkup: function () {
            const modal = document.createElement('div');
            modal.id = 'adventModalOverlay';
            modal.className = 'win-overlay';
            modal.style.display = 'none';
            modal.style.zIndex = '10060';
            modal.innerHTML = `
                <div class="stats-modal advent-calendar-modal">
                    <div class="advent-modal-header">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 28px;">🎄</span>
                            <div>
                                <h2 class="advent-header-title">KALENDARZ ADWENTOWY 🎁</h2>
                                <div class="advent-header-sub">Codziennie nowe okienko z darmowymi nagrodami & unikalnymi rzeczami świątecznymi!</div>
                            </div>
                        </div>
                        <button onclick="window.SeasonalEvents.closeAdventModal()" class="icon-btn-small" style="font-size: 16px;">✕</button>
                    </div>

                    <!-- Pasek legendy nagród specjalnych -->
                    <div class="advent-milestones-row">
                        <div class="advent-milestone-pill">🎅 Dzień 6: Emotki Clash</div>
                        <div class="advent-milestone-pill">❄️ Dzień 12: Ramka Awatara</div>
                        <div class="advent-milestone-pill">🌌 Dzień 18: Tło Rankingu</div>
                        <div class="advent-milestone-pill">⭐ Dzień 24: Event Wygranej</div>
                    </div>

                    <div class="advent-grid-container" id="adventDoorsGrid">
                        <!-- Generowane dynamicznie -->
                    </div>

                    <button onclick="window.SeasonalEvents.closeAdventModal()" class="btn-close w-100 mt-12 p-12 text-sm">ZAMKNIJ 🔙</button>
                </div>
            `;
            document.body.appendChild(modal);
        },

        renderAdventDoors: function () {
            const grid = document.getElementById('adventDoorsGrid');
            if (!grid) return;
            grid.innerHTML = '';

            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth();
            const currentDate = new Date().getDate();
            const isDecember = currentMonth === 11;
            const activeDay = isDecember ? Math.min(currentDate, 24) : 0;

            if (typeof userStats !== 'undefined' && userStats.seasonalRewards && !userStats.seasonalRewards.advent[currentYear]) {
                userStats.seasonalRewards.advent[currentYear] = [];
            }
            const claimedDays = (typeof userStats !== 'undefined' && userStats.seasonalRewards && userStats.seasonalRewards.advent[currentYear]) || [];

            for (let day = 1; day <= 24; day++) {
                const isClaimed = claimedDays.includes(day);
                const isAvailable = (day <= activeDay) && !isClaimed;
                const isLocked = day > activeDay;
                const reward = ADVENT_REWARDS[day];
                const isSpecial = reward && reward.isHighlight;

                const door = document.createElement('div');
                door.className = `advent-door ${isClaimed ? 'door-claimed' : (isAvailable ? 'door-ready' : 'door-locked')} ${isSpecial ? 'door-special' : ''}`;

                let badgeHtml = '';
                if (isSpecial) {
                    badgeHtml = `<div class="advent-special-badge">${reward.highlightTag || '⭐ BONUS'}</div>`;
                }

                if (isClaimed) {
                    door.innerHTML = `
                        ${badgeHtml}
                        <div class="advent-door-num">${day}</div>
                        <div class="advent-door-status">✓</div>
                        <div class="advent-door-reward">${reward ? (reward.badge || reward.label) : 'Odebrano'}</div>
                    `;
                } else if (isAvailable) {
                    door.innerHTML = `
                        ${badgeHtml}
                        <div class="advent-door-num">${day}</div>
                        <div class="advent-door-status pulse-gift">🎁</div>
                        <div class="advent-door-action">OTWÓRZ!</div>
                    `;
                    door.onclick = () => this.claimAdventDoor(day);
                } else {
                    door.innerHTML = `
                        ${badgeHtml}
                        <div class="advent-door-num">${day}</div>
                        <div class="advent-door-status">🔒</div>
                        <div class="advent-door-action">${reward && reward.badge ? reward.badge : (day + ' GRU')}</div>
                    `;
                    door.onclick = () => {
                        if (typeof showToast === 'function') {
                            showToast(`🔒 Okienko ${day} (${reward ? reward.label : ''}) otworzy się ${day} grudnia!`, 'info');
                        }
                    };
                }
                grid.appendChild(door);
            }
        },

        claimAdventDoor: function (day) {
            this.ensureUserSeasonalStats();
            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth();
            const currentDate = new Date().getDate();
            if (typeof userStats === 'undefined') return;
            if (currentMonth !== 11 || day > currentDate || day > 24) {
                if (typeof showToast === 'function') {
                    showToast('🔒 To okienko jest zablokowane. Otwieraj je chronologicznie w grudniu.', 'info');
                }
                return;
            }
            if (!userStats.seasonalRewards.advent[currentYear]) {
                userStats.seasonalRewards.advent[currentYear] = [];
            }
            const claimedDays = userStats.seasonalRewards.advent[currentYear];
            if (claimedDays.includes(day)) return;

            claimedDays.push(day);
            const reward = ADVENT_REWARDS[day];

            if (reward) {
                if (reward.type === 'coins') {
                    if (typeof userStats.coins === 'undefined') userStats.coins = 0;
                    userStats.coins += reward.amount;
                } else if (reward.type === 'exp') {
                    if (typeof addExp === 'function') addExp(reward.amount);
                } else if (reward.type === 'special') {
                    if (reward.coins) {
                        if (typeof userStats.coins === 'undefined') userStats.coins = 0;
                        userStats.coins += reward.coins;
                    }
                    if (reward.exp && typeof addExp === 'function') addExp(reward.exp);
                    
                    // Odblokowanie Tytułu
                    if (reward.title) {
                        if (!userStats.ownedNicks) userStats.ownedNicks = ['default'];
                        if (!userStats.ownedNicks.includes(reward.title)) userStats.ownedNicks.push(reward.title);
                    }

                    // Odblokowanie Pakietu Emotek Clash
                    if (reward.emoteId) {
                        if (!userStats.ownedEmotes) userStats.ownedEmotes = ['default'];
                        if (!userStats.ownedEmotes.includes(reward.emoteId)) userStats.ownedEmotes.push(reward.emoteId);
                        userStats.equippedEmote = reward.emoteId;
                        if (typeof renderClashEmotePanel === 'function') renderClashEmotePanel();
                    }

                    // Odblokowanie Świątecznej Ramki / Kasku
                    if (reward.frameId) {
                        if (!userStats.ownedHelmets) userStats.ownedHelmets = ['default'];
                        if (!userStats.ownedHelmets.includes(reward.frameId)) userStats.ownedHelmets.push(reward.frameId);
                        userStats.equippedHelmet = reward.frameId;
                        if (typeof updateCounterDisplay === 'function') updateCounterDisplay();
                    }

                    // Odblokowanie Świątecznego Tła Rankingu
                    if (reward.bgId) {
                        if (!userStats.ownedBgs) userStats.ownedBgs = [];
                        if (!userStats.ownedBgs.includes(reward.bgId)) userStats.ownedBgs.push(reward.bgId);
                        userStats.equippedBg = reward.bgId;
                    }

                    // Odblokowanie Świątecznego Eventu Wygranej
                    if (reward.winId) {
                        if (!userStats.ownedWins) userStats.ownedWins = ['default'];
                        if (!userStats.ownedWins.includes(reward.winId)) userStats.ownedWins.push(reward.winId);
                        userStats.equippedWin = reward.winId;
                    }
                }
            }

            if (typeof saveStats === 'function') saveStats();
            if (typeof playSound === 'function') playSound('win');

            if (typeof showToast === 'function') {
                showToast(`🎁 OKIENKO ${day}: ${reward ? reward.label : 'Odebrano nagrodę'}!`, 'success');
            }

            this.renderAdventDoors();
        },

        // ===================================================
        // 🐣 WIELKANOC: ZAJĄCZEK I PISANKI
        // ===================================================
        renderEaster: function () {
            this.ensureUserSeasonalStats();
            this.decorateLogo('🐰');

            this.insertBanner('easter', `
                <div class="seasonal-card-left">
                    <div class="seasonal-card-icon-box egg-glow">
                        <span class="seasonal-animated-icon">🐣</span>
                    </div>
                    <div class="seasonal-card-text">
                        <div class="seasonal-tag-row">
                            <span class="seasonal-badge-tag tag-easter">🐣 WIELKANOC</span>
                            <span class="seasonal-badge-sub">ŚWIĘTA WIELKANOCNE</span>
                        </div>
                        <div class="seasonal-title">WIOSENNY SEZON ŻUŻLOWY 🥚</div>
                        <div class="seasonal-desc">Święta Wielkanocne i początek nowego sezonu ligowego!</div>
                    </div>
                </div>
                <div class="seasonal-card-right">
                    <div class="seasonal-status-pill easter-pill">WIELKANOC 🐰</div>
                </div>
            `);

            this.spawnEasterEggs();
        },

        spawnEasterEggs: function () {
            // 3 pisanki dekoracyjne
            const egg1 = document.createElement('div');
            egg1.className = 'seasonal-element seasonal-easter-egg egg-pos-header';
            egg1.innerHTML = '🥚';
            document.body.appendChild(egg1);

            const egg2 = document.createElement('div');
            egg2.className = 'seasonal-element seasonal-easter-egg egg-pos-bottom';
            egg2.innerHTML = '🪺';
            document.body.appendChild(egg2);

            const egg3 = document.createElement('div');
            egg3.className = 'seasonal-element seasonal-easter-egg egg-pos-nav';
            egg3.innerHTML = '🐣';
            document.body.appendChild(egg3);
        },

        // ===================================================
        // ATMOSFERYCZNY SILNIK CANVAS (ŚNIEG / BATS & EMBERS)
        // ===================================================
        startAtmosphere: function (mode) {
            this.stopAtmosphere();

            let canvas = document.getElementById('seasonalAtmosphereCanvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = 'seasonalAtmosphereCanvas';
                canvas.className = 'seasonal-element seasonal-canvas-layer';
                document.body.prepend(canvas);
            }
            this.canvasElement = canvas;
            this.canvasCtx = canvas.getContext('2d');

            const resize = () => {
                if (!this.canvasElement) return;
                this.canvasElement.width = window.innerWidth;
                this.canvasElement.height = window.innerHeight;
            };
            window.addEventListener('resize', resize);
            resize();

            const isMobile = window.innerWidth < 768;
            this.particles = [];
            this.bats = [];

            if (mode === 'snow') {
                const count = isMobile ? 50 : 85;
                for (let i = 0; i < count; i++) {
                    this.particles.push({
                        x: Math.random() * window.innerWidth,
                        y: Math.random() * window.innerHeight,
                        radius: Math.random() * 3.2 + 1.2,
                        speedY: Math.random() * 1.5 + 0.6,
                        speedX: Math.random() * 0.8 - 0.4,
                        opacity: Math.random() * 0.6 + 0.35,
                        phase: Math.random() * Math.PI * 2
                    });
                }
            } else if (mode === 'halloween') {
                // Iskry i żar z ogniska (unoszące się w górę)
                const sparkCount = isMobile ? 20 : 35;
                for (let i = 0; i < sparkCount; i++) {
                    this.particles.push({
                        x: Math.random() * window.innerWidth,
                        y: window.innerHeight + Math.random() * 80,
                        radius: Math.random() * 2.8 + 1.2,
                        speedY: -(Math.random() * 1.6 + 0.9),
                        speedX: Math.random() * 0.8 - 0.4,
                        opacity: Math.random() * 0.7 + 0.3,
                        color: Math.random() > 0.4 ? 'rgba(255, 120, 0,' : 'rgba(255, 60, 0,'
                    });
                }

                // Sylwetki latających nietoperzy
                const batCount = isMobile ? 3 : 5;
                for (let i = 0; i < batCount; i++) {
                    this.bats.push({
                        x: -50 - Math.random() * 300,
                        y: Math.random() * (window.innerHeight * 0.45) + 30,
                        speedX: Math.random() * 2.2 + 1.4,
                        speedY: Math.random() * 0.6 - 0.3,
                        size: Math.random() * 8 + 14,
                        wingPhase: Math.random() * Math.PI * 2
                    });
                }
            }

            this.isCanvasRunning = true;
            let time = 0;

            const render = () => {
                if (!this.isCanvasRunning || !this.canvasCtx) return;
                const ctx = this.canvasCtx;
                const w = this.canvasElement.width;
                const h = this.canvasElement.height;

                ctx.clearRect(0, 0, w, h);
                time += 0.03;

                if (mode === 'snow') {
                    for (let i = 0; i < this.particles.length; i++) {
                        const p = this.particles[i];
                        p.y += p.speedY;
                        p.x += Math.sin(time + p.phase) * 0.6 + p.speedX;

                        if (p.y > h) { p.y = -10; p.x = Math.random() * w; }
                        if (p.x > w) p.x = 0;
                        if (p.x < 0) p.x = w;

                        ctx.beginPath();
                        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
                        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else if (mode === 'halloween') {
                    // Mroczna winieta
                    const grad = ctx.createRadialGradient(w / 2, h * 0.3, 50, w / 2, h / 2, Math.max(w, h));
                    grad.addColorStop(0, 'rgba(255, 100, 0, 0.08)');
                    grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.25)');
                    grad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(0, 0, w, h);

                    // Rysowanie iskier
                    for (let i = 0; i < this.particles.length; i++) {
                        const p = this.particles[i];
                        p.y += p.speedY;
                        p.x += Math.sin(time + i) * 0.5 + p.speedX;

                        if (p.y < -20) {
                            p.y = h + 10;
                            p.x = Math.random() * w;
                        }

                        ctx.beginPath();
                        ctx.fillStyle = `${p.color} ${p.opacity})`;
                        ctx.shadowBlur = 8;
                        ctx.shadowColor = '#ff7700';
                        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.shadowBlur = 0;
                    }

                    // Rysowanie latających nietoperzy
                    ctx.fillStyle = 'rgba(25, 12, 25, 0.85)';
                    for (let i = 0; i < this.bats.length; i++) {
                        const b = this.bats[i];
                        b.x += b.speedX;
                        b.y += Math.sin(time * 2 + i) * 0.8;
                        b.wingPhase += 0.25;

                        if (b.x > w + 60) {
                            b.x = -60;
                            b.y = Math.random() * (h * 0.45) + 30;
                        }

                        const wingSpan = Math.sin(b.wingPhase) * (b.size * 0.75);
                        ctx.beginPath();
                        ctx.ellipse(b.x, b.y, b.size * 0.4, b.size * 0.25, 0, 0, Math.PI * 2);
                        ctx.moveTo(b.x - b.size * 0.2, b.y);
                        ctx.lineTo(b.x - b.size, b.y - wingSpan);
                        ctx.lineTo(b.x - b.size * 0.4, b.y + b.size * 0.2);
                        ctx.moveTo(b.x + b.size * 0.2, b.y);
                        ctx.lineTo(b.x + b.size, b.y - wingSpan);
                        ctx.lineTo(b.x + b.size * 0.4, b.y + b.size * 0.2);
                        ctx.fill();
                    }
                }

                this.canvasAnimationId = requestAnimationFrame(render);
            };

            this.canvasAnimationId = requestAnimationFrame(render);
        },

        stopAtmosphere: function () {
            this.isCanvasRunning = false;
            if (this.canvasAnimationId) {
                cancelAnimationFrame(this.canvasAnimationId);
                this.canvasAnimationId = null;
            }
            if (this.canvasElement) {
                if (typeof this.canvasElement.remove === 'function') {
                    this.canvasElement.remove();
                } else if (this.canvasElement.parentNode) {
                    this.canvasElement.parentNode.removeChild(this.canvasElement);
                }
                this.canvasElement = null;
                this.canvasCtx = null;
            }
        },

        decorateLogo: function (emoji) {
            document.querySelectorAll('.desktop-logo').forEach(logo => {
                if (!logo.querySelector('.seasonal-logo-decoration')) {
                    const span = document.createElement('span');
                    span.className = 'seasonal-element seasonal-logo-decoration';
                    span.innerText = emoji;
                    logo.appendChild(span);
                }
            });
        },

        insertBanner: function (type, innerHtml) {
            const createCard = () => {
                const card = document.createElement('div');
                card.className = `seasonal-element seasonal-menu-card ${type}-card`;
                card.innerHTML = innerHtml;

                // Puszysta czapa śniegu na krawędzi karty info o sezonie zimowym
                if (type === 'winter' || type === 'advent') {
                    const snowBanner = document.createElement('div');
                    snowBanner.className = 'seasonal-element snow-cap-banner';
                    snowBanner.innerHTML = `
                        <svg class="pillow-snow-svg" viewBox="0 0 600 50" preserveAspectRatio="none">
                            <defs>
                                <linearGradient id="pillowSnowGradBn" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stop-color="#ffffff"/>
                                    <stop offset="68%" stop-color="#f2f7fc"/>
                                    <stop offset="100%" stop-color="#dceaf6"/>
                                </linearGradient>
                                <linearGradient id="pillowSnowRimBn" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stop-color="#c5d8ea"/>
                                    <stop offset="100%" stop-color="#99bbda"/>
                                </linearGradient>
                                <filter id="pillowDropShadowBn" x="-5%" y="-5%" width="110%" height="135%">
                                    <feDropShadow dx="0" dy="3.5" stdDeviation="4" flood-color="rgba(0, 0, 0, 0.48)"/>
                                </filter>
                            </defs>
                            <!-- 3D krawędź grubości poduszki śniegu z cieniem na banerze -->
                            <path d="M 0,16 Q 0,0 16,0 L 584,0 Q 600,0 600,16 L 600,22 C 600,30 594,32 588,30 C 580,27 572,42 556,42 C 542,42 534,25 522,25 C 510,25 502,39 488,39 C 474,39 468,23 454,23 C 440,23 430,47 410,47 C 392,47 386,25 372,25 C 358,25 350,38 336,38 C 322,38 316,23 302,23 C 288,23 278,48 258,48 C 240,48 234,25 220,25 C 206,25 198,40 184,40 C 170,40 164,23 150,23 C 136,23 126,45 106,45 C 88,45 82,25 68,25 C 54,25 46,38 32,38 C 18,38 10,28 0,22 Z" 
                                  fill="url(#pillowSnowRimBn)" transform="translate(0, 3)" filter="url(#pillowDropShadowBn)"/>
                            <!-- Główna puszysta czapa śniegu -->
                            <path d="M 0,16 Q 0,0 16,0 L 584,0 Q 600,0 600,16 L 600,22 C 600,30 594,32 588,30 C 580,27 572,42 556,42 C 542,42 534,25 522,25 C 510,25 502,39 488,39 C 474,39 468,23 454,23 C 440,23 430,47 410,47 C 392,47 386,25 372,25 C 358,25 350,38 336,38 C 322,38 316,23 302,23 C 288,23 278,48 258,48 C 240,48 234,25 220,25 C 206,25 198,40 184,40 C 170,40 164,23 150,23 C 136,23 126,45 106,45 C 88,45 82,25 68,25 C 54,25 46,38 32,38 C 18,38 10,28 0,22 Z" 
                                  fill="url(#pillowSnowGradBn)"/>
                            <!-- Górny subtelny blask puszystości -->
                            <path d="M 16,2.5 L 584,2.5" stroke="rgba(255, 255, 255, 0.9)" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    `;
                    card.prepend(snowBanner);
                }

                return card;
            };

            const desktopNav = document.querySelector('#desktopMainMenu .desktop-nav-modern');
            if (desktopNav) {
                desktopNav.prepend(createCard());
            }

            const mobileNav = document.querySelector('#mainMenuContainer .mobile-nav-grid');
            if (mobileNav) {
                mobileNav.prepend(createCard());
            }
        },

        setupScreenWatcher: function () {
            const checkGameActive = () => {
                const gameContainers = [
                    document.getElementById('gameContainer'),
                    document.getElementById('clashContainer'),
                    document.getElementById('timeAttackContainer'),
                    document.getElementById('moreLessContainer')
                ];
                const isAnyGameOpen = gameContainers.some(c => c && c.style.display !== 'none');

                if (isAnyGameOpen) {
                    if (this.canvasElement) this.canvasElement.style.display = 'none';
                } else {
                    if (this.canvasElement && this.activeEvent !== 'none') {
                        this.canvasElement.style.display = 'block';
                    }
                }
            };

            const observer = new MutationObserver(checkGameActive);
            observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
        }
    };

    window.setSeasonalEvent = function (name) {
        window.SeasonalEvents.setEvent(name, true);
    };

    window.openAdventCalendar = function () {
        window.SeasonalEvents.openAdventModal();
    };

    window.closeAdventCalendar = function () {
        window.SeasonalEvents.closeAdventModal();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.SeasonalEvents.init());
    } else {
        window.SeasonalEvents.init();
    }
})();
