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
    const rearCarImg = document.getElementById('rear-car-img');
    const sideCarImg = document.getElementById('side-car-img');

    const calibrateBtn = document.getElementById('calibrate-btn');
    const sensitivitySlider = document.getElementById('sensitivity-slider');

    // Calcola la circonferenza del cerchio del tachimetro
    const gaugeRadius = speedGauge.r.baseVal.value;
    const gaugeCircumference = 2 * Math.PI * gaugeRadius;
    speedGauge.style.strokeDasharray = gaugeCircumference;
    speedGauge.style.strokeDashoffset = gaugeCircumference;

    const MAX_SPEED = 200;
    const STILLNESS_THRESHOLD_MS = 2000; // 2 secondi per azzerare la velocità
    const AUTO_CALIBRATE_THRESHOLD_MS = 5000; // 5 secondi di inattività per calibrazione automatica
    const AUTO_CALIBRATE_COOLDOWN_MS = 10000; // Intervallo minimo tra calibrazioni automatiche

    let wakeLock = null;

    // Variabili per la calibrazione
    let pitchOffset = 0;
    let rollOffset = 0;
    
    // Variabili per la logica di inattività
    let lastMovementTime = Date.now();
    let lastAutoCalibrateTime = 0;
    let isCalibrating = false; // Flag per evitare calibrazioni sovrapposte

    const requestWakeLock = async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Screen Wake Lock attivato.');
                wakeLock.addEventListener('release', () => { wakeLock = null; });
            } catch (err) { console.error(`${err.name}, ${err.message}`); }
        }
    };

    const handleVisibilityChange = async () => {
        if (wakeLock === null && document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js').catch(error => console.log('Registrazione Service Worker fallita:', error));
    }

    permissionBtn.addEventListener('click', requestPermissions);
    calibrateBtn.addEventListener('click', () => calibrateSensors(false)); // Click manuale

    async function requestPermissions() {
        try {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                const orientationPermission = await DeviceOrientationEvent.requestPermission();
                if (orientationPermission !== 'granted') throw new Error("Permesso per l'orientamento del dispositivo negato.");
            }
            if (!('geolocation' in navigator)) throw new Error("Geolocalizzazione non supportata.");
            
            startListeners();
            permissionScreen.classList.add('hidden');
            dashboard.classList.remove('hidden');
            await requestWakeLock();
        } catch (error) {
            console.error("Errore permessi:", error);
            showError(error.message);
        }
    }

    function startListeners() {
        navigator.geolocation.watchPosition(updateSpeed, handleLocationError, { enableHighAccuracy: true });
        window.addEventListener('deviceorientation', updateAttitude);
    }

    /**
     * Funzione centrale per la calibrazione, gestisce sia la chiamata manuale che automatica.
     * @param {boolean} isAuto - True se la calibrazione è stata chiamata automaticamente.
     */
    function calibrateSensors(isAuto = false) {
        if (isCalibrating) return; // Evita calibrazioni sovrapposte
        isCalibrating = true;

        if (!isAuto) { // Feedback visivo per il click manuale
            calibrateBtn.classList.add('calibrating');
            calibrateBtn.disabled = true;
        } else {
            console.log("Avvio calibrazione automatica...");
            // Feedback visivo leggero per la calibrazione automatica
            calibrateBtn.style.transition = 'opacity 0.2s';
            calibrateBtn.style.opacity = '0.5';
        }

        const handleOrientation = (event) => {
            pitchOffset = event.beta || 0;
            rollOffset = event.gamma || 0;
            window.removeEventListener('deviceorientation', handleOrientation, true);
            
            console.log(`Sensori calibrati. Offset: Pitch=${pitchOffset.toFixed(2)}, Roll=${rollOffset.toFixed(2)}`);
            
            pitchValue.textContent = '0°';
            rollValue.textContent = '0°';
            lastMovementTime = Date.now(); // Resetta il timer di movimento
            if (isAuto) {
                lastAutoCalibrateTime = Date.now(); // Aggiorna il tempo dell'ultima calibrazione auto
            }
            
            setTimeout(() => {
                if (!isAuto) {
                    calibrateBtn.classList.remove('calibrating');
                    calibrateBtn.disabled = false;
                } else {
                    calibrateBtn.style.opacity = '1';
                }
                isCalibrating = false; // Resetta il flag
            }, 500);
        };

        window.addEventListener('deviceorientation', handleOrientation, true);
    }

    function updateSpeed(position) {
        let speedKmh = position.coords.speed ? (position.coords.speed * 3.6) : 0;
        
        const timeSinceLastMovement = Date.now() - lastMovementTime;

        // --- NUOVA LOGICA DI CALIBRAZIONE AUTOMATICA ---
        const timeSinceLastCalibrate = Date.now() - lastAutoCalibrateTime;
        // Se fermo da 5s E non abbiamo calibrato negli ultimi 10s
        if (timeSinceLastMovement > AUTO_CALIBRATE_THRESHOLD_MS && timeSinceLastCalibrate > AUTO_CALIBRATE_COOLDOWN_MS) {
            calibrateSensors(true); // Esegui calibrazione automatica
        }

        // Logica per azzerare la velocità se fermo da 2s
        if (timeSinceLastMovement > STILLNESS_THRESHOLD_MS) {
            speedKmh = 0;
        }

        const displaySpeed = speedKmh.toFixed(0);
        speedValue.textContent = displaySpeed;
        const speedFraction = Math.min(displaySpeed / MAX_SPEED, 1);
        const offset = gaugeCircumference * (1 - speedFraction);
        speedGauge.style.strokeDashoffset = offset;

        // Logica per il colore dinamico
        let gaugeColor;
        if (speedKmh < 90) {
            gaugeColor = '#22c55e'; // Verde
        } else if (speedKmh < 130) {
            gaugeColor = '#eab308'; // Giallo
        } else if (speedKmh < 160) {
            gaugeColor = '#f97316'; // Arancione
        } else {
            gaugeColor = '#ef4444'; // Rosso
        }
        speedGauge.style.stroke = gaugeColor;

        // Cambia colore del testo della velocità
        if (speedKmh > 160) {
            speedValue.classList.add('text-red-500');
            speedValue.classList.remove('text-white');
        } else {
            speedValue.classList.remove('text-red-500');
            speedValue.classList.add('text-white');
        }
    }

    function updateAttitude(event) {
        lastMovementTime = Date.now(); // Ogni evento di orientamento è un movimento

        if (event.beta === null || event.gamma === null) return;

        const calibratedPitch = event.beta - pitchOffset;
        const calibratedRoll = event.gamma - rollOffset;

        rearCarImg.style.transform = `rotate(${calibratedRoll}deg)`;
        sideCarImg.style.transform = `rotate(${calibratedPitch}deg)`;

        rollValue.textContent = `${Math.abs(calibratedRoll).toFixed(0)}°`;
        pitchValue.textContent = `${Math.abs(calibratedPitch).toFixed(0)}°`;

        const pitchThreshold = 1.0; 
        const sensitivity = sensitivitySlider.value;
        const maxPitchForPower = 30 - (sensitivity * 1.5); 

        let accelPercent = 0;
        let brakePercent = 0;

        if (calibratedPitch > pitchThreshold) { 
            const accelPitch = calibratedPitch - pitchThreshold;
            accelPercent = Math.min((accelPitch / maxPitchForPower) * 100, 100);
        } else if (calibratedPitch < -pitchThreshold) { 
            const brakePitch = Math.abs(calibratedPitch) - pitchThreshold;
            brakePercent = Math.min((brakePitch / maxPitchForPower) * 100, 100);
        }
        
        accelBar.style.width = `${accelPercent}%`;
        brakeBar.style.width = `${brakePercent}%`;
    }

    function handleLocationError(error) {
        console.error("Errore GPS:", error);
        showError(`Errore GPS: ${error.message}`);
        speedValue.textContent = '---';
    }

    function showError(message) {
        errorMessage.textContent = message;
    }
});
