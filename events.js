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
            title,
            bot1,
            bot2,
            fn: makeFn(succOvr, failOvr, chance, relTeam, relManager, relFans)
        };
    }

    function buildSafeChoice(title, bot1, bot2, relTeam, relManager, relFans) {
        return {
            title,
            bot1,
            bot2,
            fn: makeSafeFn(relTeam, relManager, relFans)
        };
    }

    const labels = [
        "Szybka odprawa", "Nerwowy poranek", "Późny serwis", "Zmiana przełożeń", "Kontrola toru",
        "Ostatni spacer po torze", "Wideo z poprzedniego meczu", "Test przy bandzie", "Mokra nawierzchnia", "Ostatnia decyzja"
    ];

    const themes = [
        {
            key: "warsztat",
            icon: "⚙️",
            title: "Warsztat",
            desc: "Mechanicy naciskają na korektę ustawień. To decyzja między ostrożnością a pełnym ryzykiem.",
            opt1: {
                title: "Ryzykuję nowy set",
                bot1: "+2 OVR | +6 rel. do menadżera",
                bot2: "-2 OVR | -8 rel. z drużyną",
                relTeam: -8,
                relManager: 6,
                relFans: 0,
                succOvr: 2,
                failOvr: -2,
                chance: 0.56
            },
            opt2: {
                title: "Zostawiam sprawdzony zestaw",
                bot1: "+1 OVR | +5 rel. z drużyną",
                bot2: "-1 OVR | -4 rel. do menadżera",
                relTeam: 5,
                relManager: -4,
                relFans: 0,
                succOvr: 1,
                failOvr: -1,
                chance: 0.62
            }
        },
        {
            key: "szatnia",
            icon: "🏁",
            title: "Szatnia",
            desc: "Po meczu atmosfera w zespole jest napięta. Jedna odpowiedź może uspokoić albo podzielić ekipę.",
            opt1: {
                title: "Bronię kolegów",
                bot1: "+1 OVR | +8 rel. z drużyną",
                bot2: "-1 OVR | -6 rel. z kibicami",
                relTeam: 8,
                relManager: 0,
                relFans: -6,
                succOvr: 1,
                failOvr: -1,
                chance: 0.64
            },
            opt2: {
                title: "Mówię prawdę w szatni",
                bot1: "+2 OVR | +7 rel. do menadżera",
                bot2: "-2 OVR | -5 rel. z drużyną",
                relTeam: -5,
                relManager: 7,
                relFans: 0,
                succOvr: 2,
                failOvr: -2,
                chance: 0.54
            }
        },
        {
            key: "media",
            icon: "🎙️",
            title: "Media",
            desc: "Dziennikarze chcą prostego nagłówka. Ty musisz wybrać, komu dać rację po meczu.",
            opt1: {
                title: "Staję po stronie klubu",
                bot1: "+2 OVR | +6 rel. do menadżera",
                bot2: "-1 OVR | -8 rel. z kibicami",
                relTeam: 0,
                relManager: 6,
                relFans: -8,
                succOvr: 2,
                failOvr: -1,
                chance: 0.58
            },
            opt2: {
                title: "Mówię, co myślą kibice",
                bot1: "+1 OVR | +9 rel. z kibicami",
                bot2: "-2 OVR | -5 rel. do menadżera",
                relTeam: 0,
                relManager: -5,
                relFans: 9,
                succOvr: 1,
                failOvr: -2,
                chance: 0.60
            }
        },
        {
            key: "kibice",
            icon: "🔥",
            title: "Kibice",
            desc: "Trybuna oczekuje reakcji po trudnym biegu. To klasyczny dylemat między sercem a rozsądkiem.",
            opt1: {
                title: "Idę w ogień z trybuną",
                bot1: "+1 OVR | +10 rel. z kibicami",
                bot2: "-1 OVR | -7 rel. z drużyną",
                relTeam: -7,
                relManager: 0,
                relFans: 10,
                succOvr: 1,
                failOvr: -1,
                chance: 0.68
            },
            opt2: {
                title: "Trzymam stronę zespołu",
                bot1: "+2 OVR | +7 rel. z drużyną",
                bot2: "-1 OVR | -8 rel. z kibicami",
                relTeam: 7,
                relManager: 0,
                relFans: -8,
                succOvr: 2,
                failOvr: -1,
                chance: 0.55
            }
        },
        {
            key: "sponsor",
            icon: "💰",
            title: "Sponsor",
            desc: "Sponsor naciska na wyniki i obecność medialną. Klub chce spokoju, a zespół chce jechać swoje.",
            opt1: {
                title: "Grasz pod sponsora",
                bot1: "+2 OVR | +7 rel. do menadżera",
                bot2: "-1 OVR | -6 rel. z drużyną",
                relTeam: -6,
                relManager: 7,
                relFans: 0,
                succOvr: 2,
                failOvr: -1,
                chance: 0.57
            },
            opt2: {
                title: "Bronisz szatni",
                bot1: "+1 OVR | +8 rel. z drużyną",
                bot2: "-2 OVR | -8 rel. do menadżera",
                relTeam: 8,
                relManager: -8,
                relFans: 0,
                succOvr: 1,
                failOvr: -2,
                chance: 0.52
            }
        },
        {
            key: "wyjazd",
            icon: "🚌",
            title: "Wyjazd",
            desc: "Długa podróż i obcy tor. Tu każdy wybór kosztuje więcej niż zwykle.",
            opt1: {
                title: "Dostaję większą wolność",
                bot1: "+2 OVR | +6 rel. do menadżera",
                bot2: "-2 OVR | -4 rel. z drużyną",
                relTeam: -4,
                relManager: 6,
                relFans: 0,
                succOvr: 2,
                failOvr: -2,
                chance: 0.50
            },
            opt2: {
                title: "Pomagam mechanikom i ekipie",
                bot1: "+1 OVR | +9 rel. z drużyną",
                bot2: "-1 OVR | -5 rel. z kibicami za zachowawczość",
                relTeam: 9,
                relManager: 0,
                relFans: -5,
                succOvr: 1,
                failOvr: -1,
                chance: 0.66
            }
        },
        {
            key: "trening",
            icon: "🏋️",
            title: "Trening",
            desc: "Trener chce mocniejszego treningu, ale zespół prosi o odpoczynek przed ważnym meczem.",
            opt1: {
                title: "Dokręcam tempo",
                bot1: "+2 OVR | +6 rel. do menadżera",
                bot2: "-2 OVR | -7 rel. z drużyną",
                relTeam: -7,
                relManager: 6,
                relFans: 0,
                succOvr: 2,
                failOvr: -2,
                chance: 0.53
            },
            opt2: {
                title: "Stawiam na regenerację",
                bot1: "+1 OVR | +8 rel. z drużyną",
                bot2: "-1 OVR | -5 rel. do menadżera",
                relTeam: 8,
                relManager: -5,
                relFans: 0,
                succOvr: 1,
                failOvr: -1,
                chance: 0.64
            }
        },
        {
            key: "rywale",
            icon: "🥊",
            title: "Rywale",
            desc: "Rywal z toru próbuje Cię wytrącić z równowagi. Odpowiedź może podobać się albo ekipie, albo trybunom.",
            opt1: {
                title: "Odpowiadam ostro",
                bot1: "+2 OVR | +7 rel. z kibicami",
                bot2: "-1 OVR | -6 rel. z drużyną",
                relTeam: -6,
                relManager: 0,
                relFans: 7,
                succOvr: 2,
                failOvr: -1,
                chance: 0.51
            },
            opt2: {
                title: "Gaszę konflikt",
                bot1: "+1 OVR | +8 rel. z drużyną",
                bot2: "-1 OVR | -5 rel. z kibicami",
                relTeam: 8,
                relManager: 0,
                relFans: -5,
                succOvr: 1,
                failOvr: -1,
                chance: 0.67
            }
        },
        {
            key: "koncowka",
            icon: "🏁",
            title: "Końcówka sezonu",
            desc: "Sezon wchodzi w decydującą fazę. Klub chce awansu, a kibice chcą widowiska za wszelką cenę.",
            opt1: {
                title: "Gram bezpiecznie",
                bot1: "+1 OVR | +8 rel. z drużyną",
                bot2: "-1 OVR | -6 rel. z kibicami",
                relTeam: 8,
                relManager: 0,
                relFans: -6,
                succOvr: 1,
                failOvr: -1,
                chance: 0.63
            },
            opt2: {
                title: "Idę na pełne ryzyko",
                bot1: "+2 OVR | +8 rel. z kibicami",
                bot2: "-2 OVR | -7 rel. do menadżera",
                relTeam: 0,
                relManager: -7,
                relFans: 8,
                succOvr: 2,
                failOvr: -2,
                chance: 0.49
            }
        },
        {
            key: "pogoda",
            icon: "🌧️",
            title: "Pogoda",
            desc: "Tor robi się kapryśny. Jedna decyzja może poprawić formę, ale zepsuć układ w szatni.",
            opt1: {
                title: "Przestawiam sprzęt na deszcz",
                bot1: "+2 OVR | +6 rel. do menadżera",
                bot2: "-1 OVR | -6 rel. z drużyną",
                relTeam: -6,
                relManager: 6,
                relFans: 0,
                succOvr: 2,
                failOvr: -1,
                chance: 0.55
            },
            opt2: {
                title: "Zostaję przy torowym setupie",
                bot1: "+1 OVR | +8 rel. z drużyną",
                bot2: "-2 OVR | -4 rel. do menadżera",
                relTeam: 8,
                relManager: -4,
                relFans: 0,
                succOvr: 1,
                failOvr: -2,
                chance: 0.58
            }
        },
        {
            key: "presja",
            icon: "📣",
            title: "Presja",
            desc: "Przed tobą ważny mecz i cały klub patrzy na każdy ruch.",
            opt1: {
                title: "Biorę odpowiedzialność",
                bot1: "+2 OVR | +7 rel. do menadżera",
                bot2: "-1 OVR | -5 rel. z kibicami",
                relTeam: 0,
                relManager: 7,
                relFans: -5,
                succOvr: 2,
                failOvr: -1,
                chance: 0.61
            },
            opt2: {
                title: "Otwieram się przed kibicami",
                bot1: "+1 OVR | +9 rel. z kibicami",
                bot2: "-1 OVR | -6 rel. do menadżera",
                relTeam: 0,
                relManager: -6,
                relFans: 9,
                succOvr: 1,
                failOvr: -1,
                chance: 0.67
            }
        }
    ];

    const eventList = [];

    themes.forEach((theme, themeIndex) => {
        labels.forEach((label, labelIndex) => {
            const pressure = 1 + Math.floor((themeIndex + labelIndex) / 4);
            const swing = clamp(0.48 + ((themeIndex + labelIndex) % 4) * 0.05, 0.42, 0.72);
            const opt1Chance = clamp(theme.opt1.chance - (labelIndex % 3) * 0.02 + themeIndex * 0.005, 0.40, 0.80);
            const opt2Chance = clamp(theme.opt2.chance - (labelIndex % 2) * 0.02 + themeIndex * 0.005, 0.40, 0.80);

            const opt1Succ = theme.opt1.succOvr + (pressure > 2 ? 1 : 0);
            const opt1Fail = theme.opt1.failOvr - (pressure > 3 ? 1 : 0);
            const opt2Succ = theme.opt2.succOvr + (pressure > 2 ? 1 : 0);
            const opt2Fail = theme.opt2.failOvr - (pressure > 3 ? 1 : 0);

            const mainTitle = `${theme.title}: ${label}`;
            const mainDesc = `${theme.desc} To wydarzenie dotyczy momentu: ${label.toLowerCase()}.`;

            eventList.push({
                id: `${theme.key}-${labelIndex + 1}`,
                title: mainTitle,
                desc: mainDesc,
                img: theme.icon,
                dilemma: true,
                opt1: buildChoice(
                    theme.opt1.title,
                    theme.opt1.bot1,
                    theme.opt1.bot2,
                    opt1Succ,
                    opt1Fail,
                    opt1Chance,
                    theme.opt1.relTeam,
                    theme.opt1.relManager,
                    theme.opt1.relFans
                ),
                opt2: buildSafeChoice(
                    theme.opt2.title,
                    theme.opt2.bot1,
                    theme.opt2.bot2,
                    theme.opt2.relTeam,
                    theme.opt2.relManager,
                    theme.opt2.relFans
                )
            });
        });
    });

    window.CAREER_CUSTOM_EVENTS = eventList;
    window.getCareerCustomEvent = function () {
        if (!window.CAREER_CUSTOM_EVENTS || window.CAREER_CUSTOM_EVENTS.length === 0) return null;
        return window.CAREER_CUSTOM_EVENTS[Math.floor(Math.random() * window.CAREER_CUSTOM_EVENTS.length)];
    };
})();
