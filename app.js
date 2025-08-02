// app.js

document.addEventListener('DOMContentLoaded', () => {
    // Seleziona gli elementi del DOM
    const permissionScreen = document.getElementById('permission-screen');
    const permissionBtn = document.getElementById('permission-btn');
    const dashboard = document.getElementById('dashboard');
    const errorMessage = document.getElementById('error-message');

    const speedValue = document.getElementById('speed-value');
    const speedGauge = document.getElementById('speed-gauge');
    const accelBar = document.getElementById('accel-bar');
    const brakeBar = document.getElementById('brake-bar');
    const rollValue = document.getElementById('roll-value');
    const pitchValue = document.getElementById('pitch-value');

    // Calcola la circonferenza del cerchio del tachimetro
    const gaugeRadius = speedGauge.r.baseVal.value;
    const gaugeCircumference = 2 * Math.PI * gaugeRadius;
    speedGauge.style.strokeDasharray = gaugeCircumference;
    speedGauge.style.strokeDashoffset = gaugeCircumference;

    const MAX_SPEED = 200; // Velocità massima in km/h per il tachimetro
    
    // Variabile per gestire il blocco dello schermo
    let wakeLock = null;

    // *** NUOVA FUNZIONE PER IL BLOCCO SCHERMO ***
    // Richiede di mantenere lo schermo attivo
    const requestWakeLock = async () => {
        // Controlla se l'API è supportata dal browser
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Screen Wake Lock attivato.');

                // Ascolta l'evento di rilascio (es. se si cambia tab)
                wakeLock.addEventListener('release', () => {
                    console.log('Screen Wake Lock rilasciato.');
                    wakeLock = null;
                });
            } catch (err) {
                console.error(`${err.name}, ${err.message}`);
                showError('Impossibile mantenere lo schermo attivo.');
            }
        } else {
            console.warn('API Wake Lock non supportata.');
        }
    };

    // Gestisce il cambio di visibilità della pagina per riattivare il blocco
    const handleVisibilityChange = async () => {
        if (wakeLock === null && document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);


    // Gestione del Service Worker per la PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => console.log('Service Worker registrato con successo:', registration))
            .catch(error => console.log('Registrazione Service Worker fallita:', error));
    }

    // Gestione del click sul pulsante dei permessi
    permissionBtn.addEventListener('click', requestPermissions);

    async function requestPermissions() {
        try {
            // Richiesta per i sensori di movimento (necessaria su iOS 13+)
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const motionPermission = await DeviceMotionEvent.requestPermission();
                if (motionPermission !== 'granted') {
                    showError("Permesso per i sensori di movimento negato.");
                    return;
                }
            }
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                const orientationPermission = await DeviceOrientationEvent.requestPermission();
                if (orientationPermission !== 'granted') {
                    showError("Permesso per l'orientamento del dispositivo negato.");
                    return;
                }
            }

            // Richiesta per la geolocalizzazione
            if (!('geolocation' in navigator)) {
                showError("Geolocalizzazione non supportata dal tuo browser.");
                return;
            }
            
            // Se tutto va a buon fine, avvia i listener
            startListeners();
            
            // Mostra il cruscotto e nascondi la schermata dei permessi
            permissionScreen.classList.add('hidden');
            dashboard.classList.remove('hidden');

            // *** ATTIVAZIONE BLOCCO SCHERMO ***
            await requestWakeLock();

        } catch (error) {
            console.error("Errore durante la richiesta dei permessi:", error);
            showError("Impossibile abilitare i sensori. Assicurati di usare HTTPS.");
        }
    }

    function startListeners() {
        // Listener per la geolocalizzazione (velocità)
        navigator.geolocation.watchPosition(updateSpeed, handleLocationError, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        });

        // Listener per l'accelerometro (accelerazione/frenata)
        window.addEventListener('devicemotion', updateAcceleration);

        // Listener per il giroscopio (inclinazione)
        window.addEventListener('deviceorientation', updateOrientation);
    }

    // Funzione per aggiornare la velocità
    function updateSpeed(position) {
        // La velocità è in m/s, la convertiamo in km/h
        const speedKmh = position.coords.speed ? (position.coords.speed * 3.6).toFixed(0) : 0;
        speedValue.textContent = speedKmh;

        // Aggiorna l'indicatore grafico del tachimetro
        const speedFraction = Math.min(speedKmh / MAX_SPEED, 1);
        const offset = gaugeCircumference * (1 - speedFraction);
        speedGauge.style.strokeDashoffset = offset;
    }

    // LOGICA DI ACCELERAZIONE CORRETTA
    function updateAcceleration(event) {
        // Usiamo event.acceleration che esclude la gravità per misurare la vera accelerazione.
        if (!event.acceleration) {
            return; // Il sensore potrebbe non essere disponibile
        }

        // Con il telefono in verticale, l'asse Z misura la spinta avanti/indietro.
        const accelerationZ = event.acceleration.z;
        
        // Soglia per ignorare piccole vibrazioni. Un valore basso la rende più sensibile.
        const threshold = 0.4;
        let accelPercent = 0;
        let brakePercent = 0;

        // FRENATA: l'inerzia spinge il telefono in avanti (valore Z positivo)
        if (accelerationZ > threshold) { 
            // Normalizziamo il valore. Una frenata intensa può raggiungere 7-9 m/s^2.
            brakePercent = Math.min(((accelerationZ - threshold) / 7) * 100, 100);
        } 
        // ACCELERAZIONE: la spinta del veicolo preme sul telefono (valore Z negativo)
        else if (accelerationZ < -threshold) { 
            accelPercent = Math.min((Math.abs(accelerationZ) - threshold) / 7 * 100, 100);
        }
        
        // Aggiorniamo le barre
        accelBar.style.width = `${accelPercent}%`;
        brakeBar.style.width = `${brakePercent}%`;
    }

    // Funzione per aggiornare l'orientamento
    function updateOrientation(event) {
        // Beta: beccheggio (inclinazione avanti/indietro)
        // Gamma: rollio (inclinazione laterale)
        const pitch = event.beta ? event.beta.toFixed(0) : 0;
        const roll = event.gamma ? event.gamma.toFixed(0) : 0;

        pitchValue.textContent = `${pitch}°`;
        rollValue.textContent = `${roll}°`;
    }

    function handleLocationError(error) {
        console.error("Errore di geolocalizzazione:", error);
        showError(`Errore GPS: ${error.message}`);
        speedValue.textContent = '---';
    }

    function showError(message) {
        errorMessage.textContent = message;
    }
});
