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

    // Opcje bezpieczne nie dają OVR. Opcje z +2/+3 OVR mają niski procent szansy.
    const themes = [
        { key: "warsztat", icon: "⚙️", title: "Warsztat", desc: "Mechanicy naciskają na ryzykowną korektę ustawień.", 
          opt1: { title: "Ryzykuję nowy set", bot1: "+2 OVR | +6 rel. menadżer", bot2: "-2 OVR | -8 rel. drużyna", relTeam: -8, relManager: 6, relFans: 0, succOvr: 2, failOvr: -2, chance: 0.35 }, 
          opt2: { title: "Zostawiam sprawdzony", bot1: "Brak ryzyka | +5 rel. drużyna", bot2: "Opcja bezpieczna | -4 rel. menadżer", relTeam: 5, relManager: -4, relFans: 0 } },
        
        { key: "szatnia", icon: "🏁", title: "Napięcie w szatni", desc: "Atmosfera w zespole siada po gorszym biegu.", 
          opt1: { title: "Motywuję kolegów", bot1: "+1 OVR | +8 rel. drużyna", bot2: "-1 OVR | -6 rel. kibice", relTeam: 8, relManager: 0, relFans: -6, succOvr: 1, failOvr: -1, chance: 0.65 }, 
          opt2: { title: "Nie wtrącam się", bot1: "Brak ryzyka | +2 rel. menadżer", bot2: "Opcja bezpieczna | -5 rel. drużyna", relTeam: -5, relManager: 2, relFans: 0 } },
        
        { key: "media", icon: "🎙️", title: "Wywiad na żywo", desc: "Dziennikarze próbują wyciągnąć brudy z klubu.", 
          opt1: { title: "Szczerze atakuję toromistrza", bot1: "+2 OVR | +9 rel. kibice", bot2: "-2 OVR | -10 rel. menadżer", relTeam: 0, relManager: -10, relFans: 9, succOvr: 2, failOvr: -2, chance: 0.40 }, 
          opt2: { title: "Udzielam nudnego wywiadu", bot1: "Brak ryzyka | +5 rel. menadżer", bot2: "Opcja bezpieczna | -5 rel. kibice", relTeam: 0, relManager: 5, relFans: -5 } },
        
        { key: "silnik", icon: "🏍️", title: "Nowy Silnik", desc: "Tuner przysłał prototypowy, ryzykowny sprzęt.", 
          opt1: { title: "Jadę na prototypie w ciemno!", bot1: "+3 OVR | +5 rel. kibice", bot2: "-3 OVR | -10 rel. menadżer", relTeam: 0, relManager: -10, relFans: 5, succOvr: 3, failOvr: -3, chance: 0.20 }, 
          opt2: { title: "Odkładam go na półkę", bot1: "Brak ryzyka | +5 rel. menadżer", bot2: "Opcja bezpieczna | -2 rel. kibice", relTeam: 0, relManager: 5, relFans: -2 } },
        
        { key: "tor", icon: "🚜", title: "Kopny tor", desc: "Gospodarze przygotowali wyjątkowo niebezpieczny, przyczepny tor.", 
          opt1: { title: "Atakuję po dużej od startu!", bot1: "+3 OVR | +10 rel. kibice", bot2: "-3 OVR | -8 rel. menadżer", relTeam: 0, relManager: -8, relFans: 10, succOvr: 3, failOvr: -3, chance: 0.25 }, 
          opt2: { title: "Jadę asekuracyjnie przy krawężniku", bot1: "Brak ryzyka | +5 rel. menadżer", bot2: "Opcja bezpieczna | -5 rel. kibice", relTeam: 2, relManager: 5, relFans: -5 } }
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