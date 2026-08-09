(function () {
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function makeFn(succOvr, failOvr, chance, relTeam, relManager, relFans) {
        return `resolveMidSeasonEventWithWheel(${succOvr}, ${failOvr}, ${chance.toFixed(2)}, ${relTeam}, ${relManager}, ${relFans})`;
    }

    function makeSafeFn(relTeam, relManager, relFans) {
        return `safeMidSeasonEvent(${relTeam}, ${relManager}, ${relFans})`;
    }

    function buildChoice(title, bot1, bot2, succOvr, failOvr, chance, relTeam, relManager, relFans) {
        return {
            title, bot1, bot2,
            chance: Math.round(chance * 100), 
            fn: makeFn(succOvr, failOvr, chance, relTeam, relManager, relFans)
        };
    }

    function buildSafeChoice(title, bot1, bot2, relTeam, relManager, relFans) {
        return {
            title, bot1, bot2,
            fn: makeSafeFn(relTeam, relManager, relFans)
        };
    }

    const labels = [
        "Szybka odprawa", "Nerwowy poranek", "Późny serwis", "Zmiana przełożeń", "Kontrola toru",
        "Ostatni spacer", "Wideo przed meczem", "Test sprzętu", "Trudna nawierzchnia", "Ostatnia decyzja"
    ];

     const themes = [
        { key: "warsztat", icon: "⚙️", title: "Problemy w warsztacie", desc: "Twój najlepszy silnik uległ zatarciu. Mechanicy proponują szybką reanimację lub użycie wolniejszego zapasu.", 
          opt1: { title: "Ryzykowna reanimacja silnika", bot1: "+2 OVR | +6 rel. Menedżer", bot2: "-3 OVR | -10 rel. Drużyna", relTeam: -10, relManager: 6, relFans: 0, succOvr: 2, failOvr: -3, chance: 0.40 }, 
          opt2: { title: "Spokojnie, biorę słabszy zapas", bot1: "Brak ryzyka OVR | +5 rel. Drużyna", bot2: "Bezpieczna opcja", relTeam: 5, relManager: -2, relFans: 0 } },
        
        { key: "szatnia", icon: "🏁", title: "Kwas w szatni", desc: "Młody junior wjechał w Ciebie na treningu. Szatnia czeka na Twoją reakcję.", 
          opt1: { title: "Robię mu awanturę przy wszystkich", bot1: "+1 OVR (Agresja) | +8 rel. Fani", bot2: "-2 OVR | -15 rel. Drużyna", relTeam: -15, relManager: -5, relFans: 8, succOvr: 1, failOvr: -2, chance: 0.50 }, 
          opt2: { title: "Tłumaczę mu błąd na boku", bot1: "Brak ryzyka OVR | +10 rel. Drużyna", bot2: "Opcja bezpieczna", relTeam: 10, relManager: 5, relFans: 0 } },
        
        { key: "media", icon: "🎙️", title: "Atak Dziennikarzy", desc: "Dziennikarze w telewizji na żywo pytają o słabe wyniki Twojego kolegi z pary.", 
          opt1: { title: "Szczerze zrzucam na niego winę", bot1: "+2 OVR | +15 rel. Fani (Szczerość)", bot2: "-2 OVR | -20 rel. Drużyna", relTeam: -20, relManager: -10, relFans: 15, succOvr: 2, failOvr: -2, chance: 0.35 }, 
          opt2: { title: "Bronię go, mówiąc że to sport", bot1: "Brak ryzyka OVR | +15 rel. Drużyna", bot2: "Opcja bezpieczna", relTeam: 15, relManager: 5, relFans: -5 } },
        
        { key: "sponsoring", icon: "💰", title: "Złoty Sponsor", desc: "Bogaty sponsor proponuje Ci wielkie pieniądze za reklamę w trakcie ważnego treningu klubowego.", 
          opt1: { title: "Opuszczam trening, kręcimy to!", bot1: "+3 OVR (Kasa na sprzęt)", bot2: "-3 OVR | -25 rel. Menedżer", relTeam: -10, relManager: -25, relFans: 10, succOvr: 3, failOvr: -3, chance: 0.25 }, 
          opt2: { title: "Odrzucam ofertę, liczy się klub", bot1: "Brak ryzyka OVR | +15 rel. Menedżer", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 15, relFans: 5 } },
        
        { key: "impreza", icon: "🍻", title: "Klubowa Impreza", desc: "Zarząd organizuje bankiet w środku sezonu. Następnego dnia rano macie ważny trening punktowany.", 
          opt1: { title: "Zostaję do końca z prezesem", bot1: "+2 OVR | +15 rel. Menedżer", bot2: "-2 OVR | -10 rel. Fani", relTeam: 5, relManager: 15, relFans: -10, succOvr: 2, failOvr: -2, chance: 0.45 }, 
          opt2: { title: "Wychodzę szybko, żeby się wyspać", bot1: "Brak ryzyka OVR | +10 rel. Drużyna", bot2: "Opcja bezpieczna", relTeam: 10, relManager: -5, relFans: 5 } },

        { key: "tor", icon: "🚜", title: "Beton czy Kopa?", desc: "Przed arcyważnym meczem domowym toromistrz pyta Cię o zdanie.", 
          opt1: { title: "Wymuszam zrobienie twardej ścieżki", bot1: "+3 OVR | +10 rel. Fani", bot2: "-3 OVR | -15 rel. Menedżer", relTeam: -5, relManager: -15, relFans: 10, succOvr: 3, failOvr: -3, chance: 0.20 }, 
          opt2: { title: "Niech przygotuje jak dla wszystkich", bot1: "Brak ryzyka OVR | +5 rel. Drużyna", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 10, relFans: 0 } }
    ];

    const eventList = [];

    themes.forEach((theme, themeIndex) => {
        labels.forEach((label, labelIndex) => {
            const chanceModifier = (labelIndex % 3) * 0.02;
            const finalChance = clamp(theme.opt1.chance + chanceModifier, 0.15, 0.85);

            eventList.push({
                id: `${theme.key}-${labelIndex + 1}`,
                title: `${theme.title}: ${label}`,
                desc: theme.desc,
                img: theme.icon,
                dilemma: true,
                opt1: buildChoice(theme.opt1.title, theme.opt1.bot1, theme.opt1.bot2, theme.opt1.succOvr, theme.opt1.failOvr, finalChance, theme.opt1.relTeam, theme.opt1.relManager, theme.opt1.relFans),
                opt2: buildSafeChoice(theme.opt2.title, theme.opt2.bot1, theme.opt2.bot2, theme.opt2.relTeam, theme.opt2.relManager, theme.opt2.relFans)
            });
        });
    });

    window.CAREER_CUSTOM_EVENTS = eventList;
})();