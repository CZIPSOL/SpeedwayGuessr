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
            chance: Math.round(chance * 100), // <-- Zapisujemy szansę do wyświetlenia
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

    // Znacznie rozbudowana baza eventów
    const themes = [
        { key: "warsztat", icon: "⚙️", title: "Warsztat", desc: "Mechanicy naciskają na korektę ustawień.", 
          opt1: { title: "Ryzykuję nowy set", bot1: "+2 OVR | +6 rel. menadżer", bot2: "-2 OVR | -8 rel. drużyna", relTeam: -8, relManager: 6, relFans: 0, succOvr: 2, failOvr: -2, chance: 0.56 }, 
          opt2: { title: "Zostawiam sprawdzony", bot1: "+1 OVR | +5 rel. drużyna", bot2: "-1 OVR | -4 rel. menadżer", relTeam: 5, relManager: -4, relFans: 0, succOvr: 1, failOvr: -1, chance: 0.62 } },
        { key: "szatnia", icon: "🏁", title: "Napięcie w szatni", desc: "Atmosfera w zespole siada po gorszym biegu.", 
          opt1: { title: "Motywuję kolegów", bot1: "+1 OVR | +8 rel. drużyna", bot2: "-1 OVR | -6 rel. kibice", relTeam: 8, relManager: 0, relFans: -6, succOvr: 1, failOvr: -1, chance: 0.64 }, 
          opt2: { title: "Mówię prawdę prosto w twarz", bot1: "+2 OVR | +7 rel. menadżer", bot2: "-2 OVR | -5 rel. drużyna", relTeam: -5, relManager: 7, relFans: 0, succOvr: 2, failOvr: -2, chance: 0.54 } },
        { key: "media", icon: "🎙️", title: "Wywiad na żywo", desc: "Dziennikarze prowokują po meczu.", 
          opt1: { title: "Gryzę się w język (Strona klubu)", bot1: "+2 OVR | +6 rel. menadżer", bot2: "-1 OVR | -8 rel. kibice", relTeam: 0, relManager: 6, relFans: -8, succOvr: 2, failOvr: -1, chance: 0.58 }, 
          opt2: { title: "Wygłaszam mocną opinię", bot1: "+1 OVR | +9 rel. kibice", bot2: "-2 OVR | -5 rel. menadżer", relTeam: 0, relManager: -5, relFans: 9, succOvr: 1, failOvr: -2, chance: 0.60 } },
        { key: "kibice", icon: "🔥", title: "Sektorówka", desc: "Trybuny domagają się ostrej reakcji wobec rywala.", 
          opt1: { title: "Podpalam trybuny (Ogień)", bot1: "+1 OVR | +10 rel. kibice", bot2: "-1 OVR | -7 rel. drużyna", relTeam: -7, relManager: 0, relFans: 10, succOvr: 1, failOvr: -1, chance: 0.68 }, 
          opt2: { title: "Uspokajam emocje", bot1: "+2 OVR | +7 rel. drużyna", bot2: "-1 OVR | -8 rel. kibice", relTeam: 7, relManager: 0, relFans: -8, succOvr: 2, failOvr: -1, chance: 0.55 } },
        { key: "sponsor", icon: "💰", title: "Impreza Sponsora", desc: "Główny sponsor chce cię u siebie przed meczem.", 
          opt1: { title: "Zarywam noc dla sponsora", bot1: "+2 OVR | +7 rel. menadżer", bot2: "-1 OVR | -6 rel. drużyna", relTeam: -6, relManager: 7, relFans: 0, succOvr: 2, failOvr: -1, chance: 0.57 }, 
          opt2: { title: "Wybieram sen i regenerację", bot1: "+1 OVR | +8 rel. drużyna", bot2: "-2 OVR | -8 rel. menadżer", relTeam: 8, relManager: -8, relFans: 0, succOvr: 1, failOvr: -2, chance: 0.52 } },
        { key: "silnik", icon: "🏍️", title: "Nowy Silnik", desc: "Tuner przysłał nowy, niesprawdzony sprzęt.", 
          opt1: { title: "Testuję w meczu", bot1: "+3 OVR | +5 rel. kibice", bot2: "-3 OVR | -10 rel. menadżer", relTeam: 0, relManager: -10, relFans: 5, succOvr: 3, failOvr: -3, chance: 0.45 }, 
          opt2: { title: "Zostawiam na treningi", bot1: "+1 OVR | +5 rel. menadżer", bot2: "-1 OVR | -2 rel. kibice", relTeam: 0, relManager: 5, relFans: -2, succOvr: 1, failOvr: -1, chance: 0.70 } },
        { key: "trener", icon: "📋", title: "Konflikt z Trenerem", desc: "Masz inną koncepcję na swój start niż trener.", 
          opt1: { title: "Stawiam na swoim", bot1: "+2 OVR | +5 rel. kibice", bot2: "-2 OVR | -10 rel. menadżer", relTeam: -2, relManager: -10, relFans: 5, succOvr: 2, failOvr: -2, chance: 0.52 }, 
          opt2: { title: "Zgadzam się z trenerem", bot1: "+1 OVR | +8 rel. menadżer", bot2: "-1 OVR | -5 rel. drużyna", relTeam: -5, relManager: 8, relFans: 0, succOvr: 1, failOvr: -1, chance: 0.75 } },
        { key: "kolega", icon: "🤝", title: "Słabszy kolega z pary", desc: "Zostałeś doparowany z juniorem. Gubi punkty.", 
          opt1: { title: "Jadę na własne konto", bot1: "+2 OVR | -8 rel. drużyna", bot2: "-1 OVR | -5 rel. kibice", relTeam: -8, relManager: 2, relFans: -5, succOvr: 2, failOvr: -1, chance: 0.65 }, 
          opt2: { title: "Osłaniam i holuję", bot1: "+1 OVR | +12 rel. drużyna", bot2: "-2 OVR | -5 rel. menadżer", relTeam: 12, relManager: -5, relFans: 2, succOvr: 1, failOvr: -2, chance: 0.50 } },
        { key: "tor", icon: "🚜", title: "Kopny tor", desc: "Gospodarze przygotowali wyjątkowo przyczepny tor.", 
          opt1: { title: "Atakuję po zewnętrznej", bot1: "+3 OVR | +10 rel. kibice", bot2: "-2 OVR | -5 rel. menadżer", relTeam: 0, relManager: -5, relFans: 10, succOvr: 3, failOvr: -2, chance: 0.40 }, 
          opt2: { title: "Jadę przy krawężniku", bot1: "+1 OVR | +5 rel. menadżer", bot2: "-1 OVR | -2 rel. kibice", relTeam: 2, relManager: 5, relFans: -2, succOvr: 1, failOvr: -1, chance: 0.80 } },
        { key: "kontuzja", icon: "🤕", title: "Lekki uraz", desc: "Odczuwasz ból w nadgarstku po ostatnim upadku.", 
          opt1: { title: "Biorę blokadę i jadę", bot1: "+2 OVR | +15 rel. menadżer", bot2: "-3 OVR | -5 rel. drużyna", relTeam: -5, relManager: 15, relFans: 5, succOvr: 2, failOvr: -3, chance: 0.48 }, 
          opt2: { title: "Zgłaszam niedyspozycję", bot1: "+1 OVR | +5 rel. drużyna", bot2: "-2 OVR | -15 rel. menadżer", relTeam: 5, relManager: -15, relFans: -5, succOvr: 1, failOvr: -2, chance: 0.85 } }
    ];

    const eventList = [];

    themes.forEach((theme, themeIndex) => {
        labels.forEach((label, labelIndex) => {
            const pressure = 1 + Math.floor((themeIndex + labelIndex) / 4);
            const opt1Chance = clamp(theme.opt1.chance - (labelIndex % 3) * 0.02 + themeIndex * 0.005, 0.35, 0.85);
            const opt1Succ = theme.opt1.succOvr + (pressure > 2 ? 1 : 0);
            const opt1Fail = theme.opt1.failOvr - (pressure > 3 ? 1 : 0);

            const mainTitle = `${theme.title}: ${label}`;
            const mainDesc = `${theme.desc} Momenty pełne wahania. Czas na decyzję.`;

            eventList.push({
                id: `${theme.key}-${labelIndex + 1}`,
                title: mainTitle,
                desc: mainDesc,
                img: theme.icon,
                dilemma: true,
                opt1: buildChoice(theme.opt1.title, theme.opt1.bot1, theme.opt1.bot2, opt1Succ, opt1Fail, opt1Chance, theme.opt1.relTeam, theme.opt1.relManager, theme.opt1.relFans),
                opt2: buildSafeChoice(theme.opt2.title, theme.opt2.bot1, theme.opt2.bot2, theme.opt2.relTeam, theme.opt2.relManager, theme.opt2.relFans)
            });
        });
    });

    window.CAREER_CUSTOM_EVENTS = eventList;
})();