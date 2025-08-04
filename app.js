// app.js

document.addEventListener('DOMContentLoaded', () => {
    // Seleziona gli elementi del DOM
    const permissionScreen = document.getElementById('permission-screen');
    const permissionBtn = document.getElementById('permission-btn');
    const dashboard = document.getElementById('dashboard');
    const errorMessage = document.getElementById('error-message');
    const startupCalibrationPopup = document.getElementById('startup-calibration-popup');

    const speedValue = document.getElementById('speed-value');
    // Seleziona tutti i cerchi del tachimetro
    const speedGaugeGreen = document.getElementById('speed-gauge-green');
    const speedGaugeYellow = document.getElementById('speed-gauge-yellow');
    const speedGaugeOrange = document.getElementById('speed-gauge-orange');
    const speedGaugeRed = document.getElementById('speed-gauge-red');
    const allGauges = [speedGaugeGreen, speedGaugeYellow, speedGaugeOrange, speedGaugeRed];

    const accelBar = document.getElementById('accel-bar');
    const brakeBar = document.getElementById('brake-bar');
    
    const rollValue = document.getElementById('roll-value');
    const pitchValue = document.getElementById('pitch-value');
    const rearCarImg = document.getElementById('rear-car-img');
    const sideCarImg = document.getElementById('side-car-img');

    const calibrateBtn = document.getElementById('calibrate-btn');
    const sensitivitySlider = document.getElementById('sensitivity-slider');

    // Costanti per le soglie di velocità
    const SPEED_GREEN_MAX = 90;
    const SPEED_YELLOW_MAX = 130;
    const SPEED_ORANGE_MAX = 160;
    const MAX_SPEED = 200;

    // Calcoli per l'arco del tachimetro
    const gaugeRadius = speedGaugeGreen.r.baseVal.value;
    const circumference = 2 * Math.PI * gaugeRadius;
    const totalArcLength = circumference * 0.75; // L'arco del tachimetro è 3/4 di cerchio (270 gradi)

    // Inizializzazione corretta dei cerchi a essere invisibili
    allGauges.forEach(gauge => {
        gauge.style.strokeDasharray = `0 ${circumference}`;
    });

    const STILLNESS_THRESHOLD_MS = 2000;
    const AUTO_CALIBRATE_THRESHOLD_MS = 5000;
    const AUTO_CALIBRATE_COOLDOWN_MS = 10000;

    let wakeLock = null;
    let pitchOffset = 0;
    let rollOffset = 0;
    let lastMovementTime = Date.now();
    let lastAutoCalibrateTime = 0;
    let isCalibrating = false;

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
    calibrateBtn.addEventListener('click', () => calibrateSensors(false));

    // --- FUNZIONE requestPermissions COMPLETAMENTE RISCRITTA E CORRETTA ---
    async function requestPermissions() {
        errorMessage.textContent = ''; // Pulisce errori precedenti
        try {
            // 1. Permesso per sensori di movimento (per iOS)
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                const orientationPermission = await DeviceOrientationEvent.requestPermission();
                if (orientationPermission !== 'granted') {
                    throw new Error("Permesso per l'orientamento del dispositivo negato.");
                }
            }

            // 2. Permesso per la Geolocalizzazione (per tutti i browser)
            if (!('geolocation' in navigator)) {
                throw new Error("La geolocalizzazione non è supportata dal tuo browser.");
            }
            // Richiesta esplicita del permesso GPS
            await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject);
            });

            // 3. Se tutti i permessi sono stati concessi, avvia l'app
            console.log("Permessi concessi. Avvio dell'applicazione.");
            permissionScreen.classList.add('hidden');
            startupCalibrationPopup.classList.remove('hidden');
            
            startListeners(); // Avvia i listener solo dopo aver ottenuto i permessi

            setTimeout(() => {
                calibrateSensors(true);
                startupCalibrationPopup.classList.add('hidden');
                dashboard.classList.remove('hidden');
                requestWakeLock();
            }, 2000);

        } catch (error) {
            console.error("Errore durante la richiesta dei permessi:", error);
            if (error.code === 1) { // Codice di errore 1 = PERMISSION_DENIED
                 showError("Permesso per il GPS negato. L'app non può funzionare.");
            } else {
                 showError(error.message);
            }
            permissionScreen.classList.remove('hidden');
            dashboard.classList.add('hidden');
            startupCalibrationPopup.classList.add('hidden');
        }
    }

    function startListeners() {
        console.log("Avvio dei listener per posizione e orientamento.");
        navigator.geolocation.watchPosition(updateSpeed, handleLocationError, { enableHighAccuracy: true });
        window.addEventListener('deviceorientation', updateAttitude);
    }

    function calibrateSensors(isAuto = false) {
        if (isCalibrating) return;
        isCalibrating = true;

        if (!isAuto) {
            calibrateBtn.classList.add('calibrating');
            calibrateBtn.disabled = true;
        } else {
            console.log("Avvio calibrazione automatica/iniziale...");
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
            lastMovementTime = Date.now();
            if (isAuto) {
                lastAutoCalibrateTime = Date.now();
            }
            
            setTimeout(() => {
                if (!isAuto) {
                    calibrateBtn.classList.remove('calibrating');
                    calibrateBtn.disabled = false;
                } else {
                    calibrateBtn.style.opacity = '1';
                }
                isCalibrating = false;
            }, 500);
        };

        window.addEventListener('deviceorientation', handleOrientation, true);
    }

    function updateSpeed(position) {
        let speedKmh = position.coords.speed ? (position.coords.speed * 3.6) : 0;
        
        const timeSinceLastMovement = Date.now() - lastMovementTime;
        if (timeSinceLastMovement > AUTO_CALIBRATE_THRESHOLD_MS && (Date.now() - lastAutoCalibrateTime) > AUTO_CALIBRATE_COOLDOWN_MS) {
            calibrateSensors(true);
        }
        if (timeSinceLastMovement > STILLNESS_THRESHOLD_MS) {
            speedKmh = 0;
        }

        const displaySpeed = speedKmh.toFixed(0);
        speedValue.textContent = displaySpeed;
        
        const speedForGauge = Math.min(speedKmh, MAX_SPEED);
        
        const filledArcLength = (speedForGauge / MAX_SPEED) * totalArcLength;

        const greenMaxArc = (SPEED_GREEN_MAX / MAX_SPEED) * totalArcLength;
        const yellowMaxArc = (SPEED_YELLOW_MAX / MAX_SPEED) * totalArcLength;
        const orangeMaxArc = (SPEED_ORANGE_MAX / MAX_SPEED) * totalArcLength;

        const greenLen = Math.min(filledArcLength, greenMaxArc);
        const yellowLen = Math.max(0, Math.min(filledArcLength, yellowMaxArc) - greenMaxArc);
        const orangeLen = Math.max(0, Math.min(filledArcLength, orangeMaxArc) - yellowMaxArc);
        const redLen = Math.max(0, filledArcLength - orangeMaxArc);

        speedGaugeGreen.style.strokeDasharray = `${greenLen} ${circumference}`;
        speedGaugeYellow.style.strokeDasharray = `0 ${greenMaxArc} ${yellowLen} ${circumference}`;
        speedGaugeOrange.style.strokeDasharray = `0 ${yellowMaxArc} ${orangeLen} ${circumference}`;
        speedGaugeRed.style.strokeDasharray = `0 ${orangeMaxArc} ${redLen} ${circumference}`;

        if (speedKmh > SPEED_ORANGE_MAX) {
            speedValue.classList.add('text-red-500');
            speedValue.classList.remove('text-white');
        } else {
            speedValue.classList.remove('text-red-500');
            speedValue.classList.add('text-white');
        }
    }

    function updateAttitude(event) {
        lastMovementTime = Date.now();

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
