async function handleDiscordCallback(savedCode = null) {
    const urlParams = new URLSearchParams(window.location.search);
    const code = savedCode || urlParams.get('code');

    if (code) {
        if (!auth.currentUser) {
            // Czekamy aż Firebase odzyska sesję po przeładowaniu strony
            setTimeout(() => handleDiscordCallback(code), 500);
            return;
        }

        window.history.replaceState({}, document.title, window.location.pathname);
        showToast("Łączenie z kontem Discord... ⏳", "normal");

        try {
            // WYMUSZAMY pobranie świeżego tokena z Firebase
            const idToken = await auth.currentUser.getIdToken(true);
            const currentUrl = window.location.origin + "/"; 

            console.log("=== DIAGNOSTYKA WYSYŁKI ===");
            console.log("KOD:", code);
            console.log("URL:", currentUrl);
            console.log("TOKEN:", idToken ? "Wygenerowany poprawnie!" : "BRAK TOKENA!");

            // Jeśli przeglądarka zawiodła i nie wygenerowała tokena - blokujemy wysyłkę
            if (!idToken) {
                appAlert("Twoja przeglądarka nie wygenerowała klucza sesji. Odśwież stronę i spróbuj ponownie.", "Błąd Sesji");
                return;
            }

            const linkFunc = functions.httpsCallable('linkDiscordAccount');
            
            // Przesyłamy token ręcznie wewnątrz zapytania do serwera (zmieniona nazwa)
            const response = await linkFunc({ 
                code: code,
                redirectUri: currentUrl,
                firebaseToken: idToken 
            });
            
            if (response.data.success) {
                appAlert(`Pomyślnie połączono z kontem Discord: ${response.data.discordUsername}! 👾\nTwoje rangi ligowe będą teraz aktualizowane na serwerze!`, "Sukces");
                userStats.discordLinked = true;
                userStats.discordUsername = response.data.discordUsername;
                saveStats();
            }
        } catch (error) {
            console.error("Szczegóły błędu łączenia:", error);
            appAlert(`Błąd z serwera: ${error.message}`, "Błąd Systemowy");
        }
    }
}
