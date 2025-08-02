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
    const calibrateBtn = document.getElementById('calibrate-btn'); // Nuovo pulsante

    // Calcola la circonferenza del cerchio del tachimetro
    const gaugeRadius = speedGauge.r.baseVal.value;
    const gaugeCircumference = 2 * Math.PI * gaugeRadius;
    speedGauge.style.strokeDasharray = gaugeCircumference;
    speedGauge.style.strokeDashoffset = gaugeCircumference;

    const MAX_SPEED = 200; // Velocità massima in km/h per il tachimetro
    
    // Variabile per gestire il blocco dello schermo
    let wakeLock = null;

    // *** VARIABILI PER LA CALIBRAZIONE ***
    let pitchOffset = 0;
    let rollOffset = 0;
    let accelOffsetZ = 0;

    // Richiede di mantenere lo schermo attivo
    const requestWakeLock = async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Screen Wake Lock attivato.');
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
    // *** LISTENER PER IL PULSANTE DI CALIBRAZIONE ***
    calibrateBtn.addEventListener('click', calibrateSensors);

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
            startListeners();
            permissionScreen.classList.add('hidden');
            dashboard.classList.remove('hidden');
            await requestWakeLock();
        } catch (error) {
            console.error("Errore durante la richiesta dei permessi:", error);
            showError("Impossibile abilitare i sensori. Assicurati di usare HTTPS.");
        }
    }

    function startListeners() {
        navigator.geolocation.watchPosition(updateSpeed, handleLocationError, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        });
        window.addEventListener('devicemotion', updateAcceleration);
        window.addEventListener('deviceorientation', updateOrientation);
    }

    // *** NUOVA FUNZIONE DI CALIBRAZIONE ***
    function calibrateSensors() {
        const originalText = calibrateBtn.textContent;
        calibrateBtn.textContent = 'Calibrando...';
        calibrateBtn.disabled = true;

        const handleMotion = (event) => {
            if (event.acceleration) {
                accelOffsetZ = event.acceleration.z;
            }
            window.removeEventListener('devicemotion', handleMotion, true);
        };

        const handleOrientation = (event) => {
            pitchOffset = event.beta || 0;
            rollOffset = event.gamma || 0;
            window.removeEventListener('deviceorientation', handleOrientation, true);
            
            console.log(`Sensori calibrati. Offset: Z=${accelOffsetZ.toFixed(2)}, Pitch=${pitchOffset.toFixed(2)}, Roll=${rollOffset.toFixed(2)}`);
            
            // Feedback visivo
            setTimeout(() => {
                calibrateBtn.textContent = 'Posizione Azzerata';
                // Resetta anche i valori a schermo
                pitchValue.textContent = '0°';
                rollValue.textContent = '0°';
                setTimeout(() => {
                    calibrateBtn.textContent = originalText;
                    calibrateBtn.disabled = false;
                }, 1500);
            }, 200);
        };

        window.addEventListener('devicemotion', handleMotion, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
    }

    function updateSpeed(position) {
        const speedKmh = position.coords.speed ? (position.coords.speed * 3.6).toFixed(0) : 0;
        speedValue.textContent = speedKmh;
        const speedFraction = Math.min(speedKmh / MAX_SPEED, 1);
        const offset = gaugeCircumference * (1 - speedFraction);
        speedGauge.style.strokeDashoffset = offset;
    }

    // *** FUNZIONE AGGIORNATA CON CALIBRAZIONE ***
    function updateAcceleration(event) {
        if (!event.acceleration) return;

        // Applica l'offset di calibrazione
        const calibratedAccelerationZ = event.acceleration.z - accelOffsetZ;
        
        const threshold = 0.4;
        let accelPercent = 0;
        let brakePercent = 0;

        if (calibratedAccelerationZ > threshold) { 
            brakePercent = Math.min(((calibratedAccelerationZ - threshold) / 7) * 100, 100);
        } else if (calibratedAccelerationZ < -threshold) { 
            accelPercent = Math.min((Math.abs(calibratedAccelerationZ) - threshold) / 7 * 100, 100);
        }
        
        accelBar.style.width = `${accelPercent}%`;
        brakeBar.style.width = `${brakePercent}%`;
    }

    // *** FUNZIONE AGGIORNATA CON CALIBRAZIONE ***
    function updateOrientation(event) {
        // Applica l'offset di calibrazione
        const pitch = (event.beta ? event.beta - pitchOffset : 0).toFixed(0);
        const roll = (event.gamma ? event.gamma - rollOffset : 0).toFixed(0);

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
