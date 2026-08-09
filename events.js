// --- START OF FILE events.js ---
(function () {
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function makeFn(succOvr, failOvr, chance, relTeam, relManager, relFans, prof, media, injRisk) {
        return `resolveMidSeasonEventWithWheel(${succOvr}, ${failOvr}, ${chance.toFixed(2)}, ${relTeam}, ${relManager}, ${relFans}, ${prof}, ${media}, ${injRisk})`;
    }

    function makeSafeFn(relTeam, relManager, relFans, prof, media, injRisk) {
        return `safeMidSeasonEvent(${relTeam}, ${relManager}, ${relFans}, ${prof}, ${media}, ${injRisk})`;
    }

    function buildChoice(title, bot1, bot2, succOvr, failOvr, chance, relTeam, relManager, relFans, prof = 0, media = 0, injRisk = 0) {
        return {
            title, bot1, bot2,
            chance: Math.round(chance * 100), 
            fn: makeFn(succOvr, failOvr, chance, relTeam, relManager, relFans, prof, media, injRisk)
        };
    }

    function buildSafeChoice(title, bot1, bot2, relTeam, relManager, relFans, prof = 0, media = 0, injRisk = 0) {
        return {
            title, bot1, bot2,
            fn: makeSafeFn(relTeam, relManager, relFans, prof, media, injRisk)
        };
    }

    const themes = [
        // 1. Warsztat
        { key: "warsztat", icon: "⚙️", title: "Problemy w warsztacie", desc: "Twój najlepszy silnik uległ zatarciu. Mechanicy proponują szybką reanimację lub użycie wolniejszego zapasu.", 
          opt1: { title: "Ryzykowna reanimacja silnika", bot1: "+2 OVR", bot2: "-3 OVR | -10 rel. Drużyna", relTeam: -10, relManager: 0, relFans: 0, prof: 0, media: 0, injRisk: 5, succOvr: 2, failOvr: -3, chance: 0.40 }, 
          opt2: { title: "Spokojnie, biorę słabszy zapas", bot1: "Brak ryzyka OVR | +5 Prof.", bot2: "Bezpieczna opcja", relTeam: 0, relManager: 0, relFans: 0, prof: 5, media: 0, injRisk: -5 } },
        
        // 2. Szatnia
        { key: "szatnia", icon: "🏁", title: "Kwas w szatni", desc: "Młody junior wjechał w Ciebie na treningu. Szatnia czeka na Twoją reakcję.", 
          opt1: { title: "Robię mu awanturę przy wszystkich", bot1: "+1 OVR (Agresja) | +8 rel. Fani", bot2: "-2 OVR | -15 rel. Drużyna", relTeam: -15, relManager: -5, relFans: 8, prof: -10, media: 5, injRisk: 0, succOvr: 1, failOvr: -2, chance: 0.50 }, 
          opt2: { title: "Tłumaczę mu błąd na boku", bot1: "+10 rel. Drużyna | +5 Prof.", bot2: "Opcja bezpieczna", relTeam: 10, relManager: 5, relFans: 0, prof: 5, media: 0, injRisk: 0 } },
        
        // 3. Media
        { key: "media", icon: "🎙️", title: "Atak Dziennikarzy", desc: "Dziennikarze w telewizji na żywo pytają o słabe wyniki Twojego kolegi z pary.", 
          opt1: { title: "Szczerze zrzucam na niego winę", bot1: "+2 OVR | +15 Medialność", bot2: "-2 OVR | -20 rel. Drużyna", relTeam: -20, relManager: -10, relFans: 15, prof: -15, media: 15, injRisk: 0, succOvr: 2, failOvr: -2, chance: 0.35 }, 
          opt2: { title: "Bronię go, mówiąc że to sport", bot1: "+15 rel. Drużyna | +5 Prof.", bot2: "Opcja bezpieczna", relTeam: 15, relManager: 5, relFans: -5, prof: 5, media: -5, injRisk: 0 } },
        
        // 4. Sponsor
        { key: "sponsoring", icon: "💰", title: "Złoty Sponsor", desc: "Bogaty sponsor proponuje Ci wielkie pieniądze za reklamę w trakcie ważnego treningu klubowego.", 
          opt1: { title: "Opuszczam trening, kręcimy to!", bot1: "+3 OVR (Kasa) | +15 Medialność", bot2: "-3 OVR | -25 rel. Menedżer", relTeam: -10, relManager: -25, relFans: 10, prof: -20, media: 15, injRisk: 0, succOvr: 3, failOvr: -3, chance: 0.25 }, 
          opt2: { title: "Odrzucam ofertę, liczy się klub", bot1: "+15 rel. Menedżer | +10 Prof.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 15, relFans: 5, prof: 10, media: -10, injRisk: 0 } },
        
        // 5. Impreza
        { key: "impreza", icon: "🍻", title: "Klubowa Impreza", desc: "Zarząd organizuje bankiet w środku sezonu. Następnego dnia rano macie ważny trening punktowany.", 
          opt1: { title: "Zostaję do końca z prezesem", bot1: "+2 OVR | +15 rel. Menedżer", bot2: "-3 OVR | -20 Prof.", relTeam: 5, relManager: 15, relFans: -10, prof: -20, media: 5, injRisk: 5, succOvr: 2, failOvr: -3, chance: 0.45 }, 
          opt2: { title: "Wychodzę szybko, żeby się wyspać", bot1: "+10 Prof. | -5 rel. Menedżer", bot2: "Opcja bezpieczna", relTeam: 10, relManager: -5, relFans: 5, prof: 10, media: -5, injRisk: -5 } },

        // 6. Tor
        { key: "tor", icon: "🚜", title: "Beton czy Kopa?", desc: "Przed arcyważnym meczem domowym toromistrz pyta Cię o zdanie.", 
          opt1: { title: "Wymuszam twardą ścieżkę pod bandą", bot1: "+3 OVR | +10 Ryzyko kont.", bot2: "-3 OVR | -15 rel. Menedżer", relTeam: -5, relManager: -15, relFans: 10, prof: -5, media: 5, injRisk: 10, succOvr: 3, failOvr: -3, chance: 0.20 }, 
          opt2: { title: "Niech przygotuje jak dla wszystkich", bot1: "+5 rel. Drużyna | -5 Ryzyko kont.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 10, relFans: 0, prof: 5, media: 0, injRisk: -5 } },

        // 7. Tuner
        { key: "tuner", icon: "🔧", title: "Konflikt z tunerem", desc: "Twój mechanik zauważył, że tuner wysyła lepsze części zawodnikowi z innej drużyny.",
          opt1: { title: "Dzwonię i żądam najlepszego sprzętu", bot1: "+2 OVR", bot2: "-3 OVR | -15 Prof.", relTeam: 0, relManager: -5, relFans: 0, prof: -15, media: 0, injRisk: 0, succOvr: 2, failOvr: -3, chance: 0.35 },
          opt2: { title: "Zmieniam tunera na mniej znanego", bot1: "+10 Prof. | -5 rel. Fani", bot2: "Opcja bezpieczna", relTeam: 0, relManager: 5, relFans: -5, prof: 10, media: -5, injRisk: 0 } },

        // 8. Kibice
        { key: "hejterzy", icon: "📱", title: "Hejt w Internecie", desc: "Po słabym biegu wylała się na Ciebie fala krytyki w social mediach.",
          opt1: { title: "Odpowiadam ostro hejterom", bot1: "+1 OVR | +20 Medialność", bot2: "-2 OVR | -15 rel. Fani", relTeam: -5, relManager: -10, relFans: -15, prof: -15, media: 20, injRisk: 0, succOvr: 1, failOvr: -2, chance: 0.40 },
          opt2: { title: "Ignoruję to i skupiam się na treningu", bot1: "+10 Prof. | +5 rel. Fani", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 5, relFans: 5, prof: 10, media: -10, injRisk: 0 } },

        // 9. Nowinki technologiczne
        { key: "testy", icon: "🔬", title: "Testy nowej ramy", desc: "Producent oferuje Ci testowanie nowatorskiej, elastycznej ramy. Nikt jeszcze na tym nie jeździł.",
          opt1: { title: "Zakładam ramę na najbliższy mecz!", bot1: "+4 OVR | +15 Ryzyko kont.", bot2: "-4 OVR | -10 rel. Menedżer", relTeam: -5, relManager: -10, relFans: 15, prof: -5, media: 10, injRisk: 15, succOvr: 4, failOvr: -4, chance: 0.15 },
          opt2: { title: "Testuję tylko na treningach", bot1: "+5 Prof. | -5 Ryzyko kont.", bot2: "Opcja bezpieczna", relTeam: 0, relManager: 5, relFans: 0, prof: 5, media: 0, injRisk: -5 } },

        // 10. Zdrowie
        { key: "zdrowie", icon: "🩹", title: "Ukryty ból", desc: "Odczuwasz lekki ból w nadgarstku po ostatnim upadku, ale drużyna bardzo Cię potrzebuje.",
          opt1: { title: "Biorę prochy i jadę na 100%", bot1: "+2 OVR | +15 rel. Drużyna", bot2: "-3 OVR | +20 Ryzyko kont.", relTeam: 15, relManager: 10, relFans: 10, prof: -10, media: 0, injRisk: 20, succOvr: 2, failOvr: -3, chance: 0.30 },
          opt2: { title: "Zgłaszam uraz, odpuszczam jeden bieg", bot1: "+10 Prof. | -10 rel. Menedżer", bot2: "Opcja bezpieczna", relTeam: -10, relManager: -10, relFans: -5, prof: 10, media: 0, injRisk: -10 } },

        // 11. Oferta
        { key: "oferta", icon: "📝", title: "Kusząca propozycja", desc: "W kuluarach prezes innej drużyny proponuje Ci tajny kontrakt na przyszły sezon.",
          opt1: { title: "Dogaduję się pod stołem (Motywacja)", bot1: "+2 OVR | -10 rel. Drużyna", bot2: "-2 OVR | -20 Prof.", relTeam: -10, relManager: -15, relFans: -5, prof: -20, media: 5, injRisk: 0, succOvr: 2, failOvr: -2, chance: 0.45 },
          opt2: { title: "Odrzucam, jestem lojalny wobec klubu", bot1: "+15 rel. Menedżer | +10 Prof.", bot2: "Opcja bezpieczna", relTeam: 10, relManager: 15, relFans: 15, prof: 10, media: 0, injRisk: 0 } },

        // 12. Taktyka
        { key: "taktyka", icon: "🧠", title: "Bunt taktyczny", desc: "Menedżer chce, żebyś puścił przed siebie kolegę z drużyny w ważnym biegu, by zdobył punkt bonusowy.",
          opt1: { title: "Zignoruj go i walcz o swoje punkty", bot1: "+2 OVR | -20 rel. Menedżer", bot2: "-1 OVR | -15 rel. Drużyna", relTeam: -15, relManager: -20, relFans: 5, prof: -15, media: 5, injRisk: 0, succOvr: 2, failOvr: -1, chance: 0.60 },
          opt2: { title: "Graj zespołowo, przepuść go", bot1: "+20 rel. Drużyna | +10 Prof.", bot2: "Opcja bezpieczna", relTeam: 20, relManager: 15, relFans: -5, prof: 10, media: -5, injRisk: 0 } },
        
        // 13. Deszcz
        { key: "deszcz", icon: "🌧️", title: "Niespodziewany deszcz", desc: "Prognozy mówiły o suchej nawierzchni, ale kilka minut przed biegiem zaczyna padać. Masz tylko chwilę na decyzję dotyczącą ustawień.",
          opt1: { title: "Jadę agresywnie na ustawieniach na sucho", bot1: "+3 OVR | +10 Ryzyko kont.", bot2: "-4 OVR | -15 rel. Menedżer", relTeam: -5, relManager: -15, relFans: 10, prof: -5, media: 5, injRisk: 10, succOvr: 3, failOvr: -4, chance: 0.35 },
          opt2: { title: "Dostosowuję ustawienia do deszczu", bot1: "+5 Prof. | -5 Ryzyko kont.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 10, relFans: 0, prof: 5, media: 0, injRisk: -5 } },

        // 14. Sędzia
        { key: "sedzia", icon: "🟨", title: "Kontrowersyjna decyzja sędziego", desc: "Sędzia podjął decyzję, przez którą straciłeś ważną pozycję. Po biegu możesz publicznie skomentować jego pracę.",
          opt1: { title: "Ostro krytykuję sędziego", bot1: "+2 OVR | +15 Medialność", bot2: "-2 OVR | -20 rel. Menedżer", relTeam: -5, relManager: -20, relFans: 15, prof: -10, media: 15, injRisk: 0, succOvr: 2, failOvr: -2, chance: 0.40 },
          opt2: { title: "Nie komentuję decyzji", bot1: "+10 Prof. | +5 rel. Menedżer", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 5, relFans: -5, prof: 10, media: -5, injRisk: 0 } },

        // 15. Telemetria
        { key: "telemetria", icon: "📊", title: "Tajemnicze dane z telemetrii", desc: "Inżynier pokazuje Ci dane sugerujące, że możesz pojechać znacznie szybciej jednym fragmentem toru.",
          opt1: { title: "Próbuję nowej linii w meczu", bot1: "+3 OVR", bot2: "-4 OVR | +15 Ryzyko kont.", relTeam: 0, relManager: -5, relFans: 10, prof: 0, media: 5, injRisk: 15, succOvr: 3, failOvr: -4, chance: 0.30 },
          opt2: { title: "Testuję ją dopiero na treningu", bot1: "+10 Prof. | -5 Ryzyko kont.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 5, relFans: 0, prof: 10, media: 0, injRisk: -5 } },

        // 16. Junior
        { key: "junior", icon: "🌱", title: "Talent z akademii", desc: "Młody zawodnik z akademii prosi Cię o kilka rad przed swoim pierwszym poważnym startem.",
          opt1: { title: "Biorę go pod swoje skrzydła", bot1: "+2 OVR | +15 rel. Drużyna", bot2: "-2 OVR | -10 Prof.", relTeam: 15, relManager: 5, relFans: 5, prof: -10, media: 5, injRisk: 0, succOvr: 2, failOvr: -2, chance: 0.55 },
          opt2: { title: "Skupiam się wyłącznie na sobie", bot1: "+10 Prof.", bot2: "Opcja bezpieczna", relTeam: -5, relManager: 0, relFans: -5, prof: 10, media: 0, injRisk: 0 } },

        // 17. Rywal
        { key: "rywal", icon: "🥊", title: "Rywal rzuca wyzwanie", desc: "Największy rywal prowokuje Cię w wywiadzie i twierdzi, że boisz się z nim bezpośredniej walki.",
          opt1: { title: "Podejmuję rękawicę", bot1: "+2 OVR | +15 Medialność", bot2: "-3 OVR | -15 Prof.", relTeam: 0, relManager: -5, relFans: 15, prof: -15, media: 15, injRisk: 5, succOvr: 2, failOvr: -3, chance: 0.50 },
          opt2: { title: "Nie daję się sprowokować", bot1: "+10 Prof. | +5 rel. Menedżer", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 5, relFans: 0, prof: 10, media: -5, injRisk: 0 } },

        // 18. Podróż
        { key: "podroz", icon: "✈️", title: "Problemy z podróżą", desc: "Samolot ma opóźnienie i możesz nie zdążyć na oficjalny trening przed ważnym spotkaniem.",
          opt1: { title: "Wynajmuję prywatny transport", bot1: "+2 OVR", bot2: "-2 OVR | -10 Prof.", relTeam: 5, relManager: 5, relFans: 0, prof: -10, media: 0, injRisk: 5, succOvr: 2, failOvr: -2, chance: 0.65 },
          opt2: { title: "Jadę normalnym transportem", bot1: "+5 Prof.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 0, relFans: 0, prof: 5, media: 0, injRisk: -5 } },

        // 19. Mechanik
        { key: "mechanik", icon: "👨‍🔧", title: "Mechanik ma dość", desc: "Twój główny mechanik uważa, że ignorujesz jego sugestie i rozważa odejście z zespołu.",
          opt1: { title: "Stawiam na swoim", bot1: "+2 OVR", bot2: "-3 OVR | -20 rel. Drużyna", relTeam: -20, relManager: -10, relFans: 5, prof: -10, media: 0, injRisk: 5, succOvr: 2, failOvr: -3, chance: 0.45 },
          opt2: { title: "Rozmawiam z nim i słucham uwag", bot1: "+15 rel. Drużyna | +5 Prof.", bot2: "Opcja bezpieczna", relTeam: 15, relManager: 5, relFans: 0, prof: 5, media: 0, injRisk: 0 } },

        // 20. Nowy kombinezon
        { key: "kombinezon", icon: "🧤", title: "Eksperymentalny kombinezon", desc: "Sponsor sprzętowy daje Ci nowy kombinezon wykonany z eksperymentalnego materiału.",
          opt1: { title: "Zakładam go od razu", bot1: "+3 OVR | +10 Medialność", bot2: "-3 OVR | +10 Ryzyko kont.", relTeam: 0, relManager: 0, relFans: 10, prof: -5, media: 10, injRisk: 10, succOvr: 3, failOvr: -3, chance: 0.35 },
          opt2: { title: "Najpierw dokładnie go testuję", bot1: "+10 Prof.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 5, relFans: 0, prof: 10, media: 0, injRisk: -5 } },

        // 21. Zakład
        { key: "zaklad", icon: "🎯", title: "Zakład z rywalem", desc: "Rywal proponuje Ci zakład: jeśli pokonasz go w następnym biegu, publicznie przyzna Ci rację.",
          opt1: { title: "Podkręcam stawkę", bot1: "+2 OVR | +10 rel. Fani", bot2: "-2 OVR | -10 Prof.", relTeam: 0, relManager: -5, relFans: 10, prof: -10, media: 10, injRisk: 5, succOvr: 2, failOvr: -2, chance: 0.50 },
          opt2: { title: "Odmawiam dziecinnych zakładów", bot1: "+10 Prof.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 5, relFans: -5, prof: 10, media: -5, injRisk: 0 } },

        // 22. Ustawienia
        { key: "ustawienia", icon: "⚙️", title: "Tajemnicze ustawienia", desc: "Inżynier proponuje ustawienia, których wcześniej nigdy nie używałeś. Twierdzi, że mogą dać ogromną przewagę.",
          opt1: { title: "Idziemy va banque", bot1: "+4 OVR", bot2: "-4 OVR | -15 Prof.", relTeam: 5, relManager: -5, relFans: 5, prof: -15, media: 5, injRisk: 5, succOvr: 4, failOvr: -4, chance: 0.25 },
          opt2: { title: "Zostajemy przy sprawdzonym setupie", bot1: "+10 Prof.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 5, relFans: 0, prof: 10, media: 0, injRisk: -5 } },

        // 23. Kontuzja rywala
        { key: "kontuzja_rywala", icon: "🚑", title: "Wypadek rywala", desc: "Twój największy rywal doznał kontuzji podczas treningu. Media pytają, czy jego absencja ułatwi Ci walkę o wynik.",
          opt1: { title: "Mówię, że to moja szansa", bot1: "+10 Medialność", bot2: "-15 rel. Fani | -10 Prof.", relTeam: 0, relManager: -5, relFans: -15, prof: -10, media: 10, injRisk: 0, succOvr: 1, failOvr: -1, chance: 0.55 },
          opt2: { title: "Życzę mu szybkiego powrotu", bot1: "+10 Prof. | +10 rel. Fani", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 5, relFans: 10, prof: 10, media: 5, injRisk: 0 } },

        // 24. Kontrola techniczna
        { key: "kontrola", icon: "🔍", title: "Niespodziewana kontrola", desc: "Komisarze zapowiadają dokładną kontrolę techniczną Twojego sprzętu tuż przed startem.",
          opt1: { title: "Ryzykuję z nielegalnym detalem", bot1: "+3 OVR", bot2: "-5 OVR | -20 rel. Menedżer", relTeam: -10, relManager: -20, relFans: -10, prof: -20, media: 10, injRisk: 0, succOvr: 3, failOvr: -5, chance: 0.20 },
          opt2: { title: "Sprawdzam wszystko zgodnie z regulaminem", bot1: "+10 Prof.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 10, relFans: 5, prof: 10, media: -5, injRisk: 0 } },

        // 25. Autografy
        { key: "autografy", icon: "✍️", title: "Fala kibiców", desc: "Po treningu pod bramą czeka ogromna grupa kibiców. Menedżer każe Ci odpocząć przed startem.",
          opt1: { title: "Zostaję i podpisuję wszystko", bot1: "+20 rel. Fani | +15 Medialność", bot2: "-2 OVR | -10 Prof.", relTeam: 5, relManager: -10, relFans: 20, prof: -10, media: 15, injRisk: 5, succOvr: 2, failOvr: -2, chance: 0.45 },
          opt2: { title: "Wracam do hotelu i odpoczywam", bot1: "+10 Prof.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 10, relFans: -5, prof: 10, media: -5, injRisk: -5 } },

        // 26. Sen
        { key: "sen", icon: "😴", title: "Bezsenna noc", desc: "Nie możesz zasnąć przed najważniejszym startem sezonu. Rano musisz zdecydować, jak podejść do przygotowania.",
          opt1: { title: "Mimo wszystko jadę na pełnej", bot1: "+3 OVR", bot2: "-4 OVR | +15 Ryzyko kont.", relTeam: 5, relManager: 0, relFans: 5, prof: -15, media: 5, injRisk: 15, succOvr: 3, failOvr: -4, chance: 0.40 },
          opt2: { title: "Zmniejszam obciążenie przed startem", bot1: "+10 Prof. | -10 Ryzyko kont.", bot2: "Opcja bezpieczna", relTeam: 0, relManager: 5, relFans: 0, prof: 10, media: 0, injRisk: -10 } },

        // 27. Sprzęt kolegi
        { key: "sprzet_kolegi", icon: "🏎️", title: "Problem kolegi z drużyny", desc: "Twój partner ma awarię sprzętu tuż przed biegiem. W garażu znajduje się część, która mogłaby mu pomóc, ale była przygotowana dla Ciebie.",
          opt1: { title: "Oddaję mu swoją część", bot1: "+15 rel. Drużyna", bot2: "-2 OVR", relTeam: 15, relManager: 10, relFans: 10, prof: 0, media: 5, injRisk: 0, succOvr: 2, failOvr: -2, chance: 0.45 },
          opt2: { title: "Zostawiam ją dla siebie", bot1: "+5 OVR potencjału", bot2: "-10 rel. Drużyna", relTeam: -10, relManager: -5, relFans: -5, prof: -5, media: 0, injRisk: 0 } },

        // 28. Menedżer rywala
        { key: "menedzer_rywala", icon: "🕵️", title: "Dziwna propozycja", desc: "Menedżer rywala proponuje Ci prywatną rozmowę i sugeruje wymianę informacji przed zawodami.",
          opt1: { title: "Słucham, co ma do powiedzenia", bot1: "+2 OVR", bot2: "-3 OVR | -20 Prof.", relTeam: -10, relManager: -15, relFans: -5, prof: -20, media: 5, injRisk: 0, succOvr: 2, failOvr: -3, chance: 0.35 },
          opt2: { title: "Od razu zgłaszam sprawę klubowi", bot1: "+15 Prof. | +10 rel. Menedżer", bot2: "Opcja bezpieczna", relTeam: 10, relManager: 10, relFans: 5, prof: 15, media: 5, injRisk: 0 } },

        // 29. Wywiad
        { key: "wywiad", icon: "📺", title: "Prime-time", desc: "Popularny program sportowy zaprasza Cię na długi wywiad dzień przed zawodami.",
          opt1: { title: "Idę do programu", bot1: "+15 Medialność | +1 OVR", bot2: "-2 OVR | -10 Prof.", relTeam: 0, relManager: -5, relFans: 10, prof: -10, media: 15, injRisk: 0, succOvr: 1, failOvr: -2, chance: 0.55 },
          opt2: { title: "Odmawiam i odpoczywam", bot1: "+10 Prof.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 10, relFans: -5, prof: 10, media: -10, injRisk: -5 } },

        // 30. Presja wyniku
        { key: "presja", icon: "🔥", title: "Musisz wygrać", desc: "Po kilku słabszych występach zarząd jasno komunikuje: kolejny mecz musi być przełomem.",
          opt1: { title: "Stawiam wszystko na jeden bieg", bot1: "+4 OVR", bot2: "-5 OVR | +15 Ryzyko kont.", relTeam: -5, relManager: 5, relFans: 10, prof: -20, media: 10, injRisk: 15, succOvr: 4, failOvr: -5, chance: 0.35 },
          opt2: { title: "Trzymam się normalnego planu", bot1: "+10 Prof. | -5 Ryzyko kont.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 10, relFans: 0, prof: 10, media: 0, injRisk: -5 } },

        // 31. Zła część
        { key: "czesc", icon: "📦", title: "Pomyłka w dostawie", desc: "Do garażu przyjechała paczka z częściami, ale jedna z nich jest przeznaczona dla innego zawodnika.",
          opt1: { title: "Zakładam ją mimo wszystko", bot1: "+3 OVR", bot2: "-4 OVR | -15 rel. Drużyna", relTeam: -15, relManager: -10, relFans: 5, prof: -10, media: 5, injRisk: 5, succOvr: 3, failOvr: -4, chance: 0.30 },
          opt2: { title: "Czekam na właściwą część", bot1: "+5 Prof. | +10 rel. Drużyna", bot2: "Opcja bezpieczna", relTeam: 10, relManager: 5, relFans: 0, prof: 5, media: 0, injRisk: 0 } },

        // 32. Trening nocny
        { key: "nocny_trening", icon: "🌙", title: "Nocna sesja", desc: "Tor jest dostępny późnym wieczorem. Możesz wykorzystać dodatkowy czas na trening, ale następnego dnia czeka Cię ważny start.",
          opt1: { title: "Trenuję do późna", bot1: "+2 OVR", bot2: "-3 OVR | +10 Ryzyko kont.", relTeam: 5, relManager: 5, relFans: 0, prof: -10, media: 0, injRisk: 10, succOvr: 2, failOvr: -3, chance: 0.55 },
          opt2: { title: "Odpuszczam i odpoczywam", bot1: "+10 Prof. | -5 Ryzyko kont.", bot2: "Opcja bezpieczna", relTeam: 0, relManager: 5, relFans: 0, prof: 10, media: 0, injRisk: -5 } },

        // 33. Sponsor odzieżowy
        { key: "odziez", icon: "👕", title: "Nowy sponsor odzieżowy", desc: "Firma oferuje duży kontrakt, ale chce, żebyś podczas całego weekendu korzystał wyłącznie z jej produktów.",
          opt1: { title: "Podpisuję od razu", bot1: "+2 OVR | +20 Medialność", bot2: "-15 rel. Menedżer", relTeam: 0, relManager: -15, relFans: 10, prof: -10, media: 20, injRisk: 0, succOvr: 2, failOvr: -2, chance: 0.50 },
          opt2: { title: "Najpierw konsultuję to z klubem", bot1: "+10 Prof. | +10 rel. Menedżer", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 10, relFans: 5, prof: 10, media: 5, injRisk: 0 } },

        // 34. Młody mechanik
        { key: "mlody_mechanik", icon: "🔩", title: "Nowy mechanik", desc: "Do zespołu dołącza młody mechanik z nietypowymi pomysłami. Starsi członkowie ekipy nie są do niego przekonani.",
          opt1: { title: "Daję mu pełną swobodę", bot1: "+3 OVR", bot2: "-3 OVR | -10 rel. Drużyna", relTeam: -10, relManager: 0, relFans: 5, prof: -5, media: 5, injRisk: 5, succOvr: 3, failOvr: -3, chance: 0.40 },
          opt2: { title: "Niech najpierw pracuje pod nadzorem", bot1: "+10 rel. Drużyna | +5 Prof.", bot2: "Opcja bezpieczna", relTeam: 10, relManager: 5, relFans: 0, prof: 5, media: 0, injRisk: 0 } },

        // 35. Konferencja
        { key: "konferencja", icon: "🎤", title: "Niewygodne pytanie", desc: "Na konferencji dziennikarz pyta, czy uważasz swojego partnera za wystarczająco dobrego, by walczyć o mistrzostwo.",
          opt1: { title: "Mówię, co naprawdę myślę", bot1: "+2 OVR | +15 Medialność", bot2: "-3 OVR | -20 rel. Drużyna", relTeam: -20, relManager: -10, relFans: 10, prof: -15, media: 15, injRisk: 0, succOvr: 2, failOvr: -3, chance: 0.45 },
          opt2: { title: "Chronię partnera przed mediami", bot1: "+15 rel. Drużyna | +10 Prof.", bot2: "Opcja bezpieczna", relTeam: 15, relManager: 10, relFans: 5, prof: 10, media: -5, injRisk: 0 } },

        // 36. Ostatnia szansa
        { key: "ostatnia_szansa", icon: "⏱️", title: "Ostatni trening przed GP", desc: "Twój ostatni trening przed zawodami nie idzie zgodnie z planem. Inżynier proponuje jedną radykalną zmianę.",
          opt1: { title: "Robimy radykalną zmianę", bot1: "+5 OVR", bot2: "-5 OVR | -20 Prof.", relTeam: -5, relManager: -5, relFans: 5, prof: -20, media: 10, injRisk: 10, succOvr: 5, failOvr: -5, chance: 0.25 },
          opt2: { title: "Nie zmieniamy nic przed startem", bot1: "+10 Prof. | -5 Ryzyko kont.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 10, relFans: 0, prof: 10, media: 0, injRisk: -5 } },

        // 37. Oferta sprzętowa
        { key: "oferta_sprzetowa", icon: "🏆", title: "Fabryczny sprzęt", desc: "Duży producent proponuje Ci dostęp do fabrycznego sprzętu, ale oczekuje wyłączności na kilka miesięcy.",
          opt1: { title: "Przechodzę na ich sprzęt", bot1: "+3 OVR | +15 Medialność", bot2: "-3 OVR | -15 rel. Menedżer", relTeam: -5, relManager: -15, relFans: 10, prof: -10, media: 15, injRisk: 5, succOvr: 3, failOvr: -3, chance: 0.40 },
          opt2: { title: "Zostaję przy obecnym dostawcy", bot1: "+10 Prof. | +10 rel. Menedżer", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 10, relFans: 0, prof: 10, media: -5, injRisk: 0 } },

        // 38. Zmęczenie
        { key: "zmeczenie", icon: "🥱", title: "Przeciążenie", desc: "Fizjoterapeuta ostrzega, że ostatnie tygodnie treningów mocno obciążyły Twój organizm.",
          opt1: { title: "Ignoruję ostrzeżenie", bot1: "+3 OVR", bot2: "-4 OVR | +20 Ryzyko kont.", relTeam: 10, relManager: 5, relFans: 5, prof: -15, media: 0, injRisk: 20, succOvr: 3, failOvr: -4, chance: 0.40 },
          opt2: { title: "Robię dzień regeneracji", bot1: "+15 Prof. | -15 Ryzyko kont.", bot2: "Opcja bezpieczna", relTeam: 0, relManager: 10, relFans: 0, prof: 15, media: 0, injRisk: -15 } },

        // 39. Presja kibiców
        { key: "kibice_presja", icon: "📣", title: "Kibice żądają zwycięstwa", desc: "Przed meczem grupa najbardziej zagorzałych kibiców organizuje spotkanie pod stadionem i domaga się deklaracji zwycięstwa.",
          opt1: { title: "Obiecuję im zwycięstwo", bot1: "+2 OVR | +15 rel. Fani", bot2: "-3 OVR | -15 Prof.", relTeam: 0, relManager: 0, relFans: 15, prof: -15, media: 10, injRisk: 5, succOvr: 2, failOvr: -3, chance: 0.50 },
          opt2: { title: "Nie składam żadnych obietnic", bot1: "+10 Prof.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 5, relFans: -5, prof: 10, media: -5, injRisk: 0 } },

        // 40. Decyzja zespołowa
        { key: "decyzja_zespolowa", icon: "🤝", title: "Głosowanie w zespole", desc: "Zespół głosuje nad wyborem strategii na najbliższe zawody. Twoja propozycja jest najbardziej ryzykowna, ale może dać dużą przewagę.",
          opt1: { title: "Przekonuję wszystkich do ryzyka", bot1: "+4 OVR", bot2: "-4 OVR | -15 rel. Drużyna", relTeam: -15, relManager: -5, relFans: 10, prof: -10, media: 5, injRisk: 10, succOvr: 4, failOvr: -4, chance: 0.35 },
          opt2: { title: "Popieram bezpieczną strategię", bot1: "+15 rel. Drużyna | +10 Prof.", bot2: "Opcja bezpieczna", relTeam: 15, relManager: 10, relFans: 0, prof: 10, media: 0, injRisk: -5 } },

        // 41. Stary mistrz
        { key: "stary_mistrz", icon: "👑", title: "Rada byłego mistrza", desc: "Legendarny zawodnik pojawia się w garażu i proponuje Ci zmianę stylu jazdy. Jego rada jest kontrowersyjna.",
          opt1: { title: "Stosuję jego metodę", bot1: "+3 OVR", bot2: "-3 OVR | -10 Prof.", relTeam: 5, relManager: 0, relFans: 10, prof: -10, media: 10, injRisk: 5, succOvr: 3, failOvr: -3, chance: 0.45 },
          opt2: { title: "Słucham, ale zostaję przy swoim", bot1: "+10 Prof.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 5, relFans: 5, prof: 10, media: 5, injRisk: 0 } },

        // 42. Awaria przed startem
        { key: "awaria_start", icon: "🚨", title: "Awaria tuż przed startem", desc: "Kilka minut przed wyjazdem mechanicy odkrywają problem. Można go naprawić szybko albo wymienić cały element.",
          opt1: { title: "Szybka naprawa na granicy ryzyka", bot1: "+2 OVR", bot2: "-5 OVR | +10 Ryzyko kont.", relTeam: -5, relManager: -5, relFans: 5, prof: -10, media: 5, injRisk: 10, succOvr: 2, failOvr: -5, chance: 0.60 },
          opt2: { title: "Wymieniamy cały element", bot1: "+5 Prof. | -5 Ryzyko kont.", bot2: "Opcja bezpieczna", relTeam: 5, relManager: 10, relFans: 0, prof: 5, media: 0, injRisk: -5 } }
        ];

    const eventList = [];

    themes.forEach((theme) => {
        eventList.push({
            id: `${theme.key}-event`,
            title: theme.title,
            desc: theme.desc,
            img: theme.icon,
            dilemma: true,
            opt1: buildChoice(theme.opt1.title, theme.opt1.bot1, theme.opt1.bot2, theme.opt1.succOvr, theme.opt1.failOvr, theme.opt1.chance, theme.opt1.relTeam, theme.opt1.relManager, theme.opt1.relFans, theme.opt1.prof, theme.opt1.media, theme.opt1.injRisk),
            opt2: buildSafeChoice(theme.opt2.title, theme.opt2.bot1, theme.opt2.bot2, theme.opt2.relTeam, theme.opt2.relManager, theme.opt2.relFans, theme.opt2.prof, theme.opt2.media, theme.opt2.injRisk)
        });
    });

    window.CAREER_CUSTOM_EVENTS = eventList;
})();