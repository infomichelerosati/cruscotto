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

    const gaugeRadius = speedGaugeGreen.r.baseVal.value;
    const circumference = 2 * Math.PI * gaugeRadius;

    // Inizializzazione corretta dei cerchi
    allGauges.forEach(gauge => {
        gauge.style.strokeDashoffset = 0; 
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

    async function requestPermissions() {
        try {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                const orientationPermission = await DeviceOrientationEvent.requestPermission();
                if (orientationPermission !== 'granted') throw new Error("Permesso per l'orientamento del dispositivo negato.");
            }
            if (!('geolocation' in navigator)) throw new Error("Geolocalizzazione non supportata.");
            
            startListeners();
            
            permissionScreen.classList.add('hidden');
            startupCalibrationPopup.classList.remove('hidden');

            setTimeout(() => {
                calibrateSensors(true);
                startupCalibrationPopup.classList.add('hidden');
                dashboard.classList.remove('hidden');
                requestWakeLock();
            }, 2000);

        } catch (error) {
            console.error("Errore permessi:", error);
            showError(error.message);
            startupCalibrationPopup.classList.add('hidden');
            permissionScreen.classList.remove('hidden');
        }
    }

    function startListeners() {
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

        const timeSinceLastCalibrate = Date.now() - lastAutoCalibrateTime;
        if (timeSinceLastMovement > AUTO_CALIBRATE_THRESHOLD_MS && timeSinceLastCalibrate > AUTO_CALIBRATE_COOLDOWN_MS) {
            calibrateSensors(true);
        }

        if (timeSinceLastMovement > STILLNESS_THRESHOLD_MS) {
            speedKmh = 0;
        }

        const displaySpeed = speedKmh.toFixed(0);
        speedValue.textContent = displaySpeed;
        
        // --- CORREZIONE: Limita la velocità per il disegno del tachimetro a MAX_SPEED ---
        const speedForGauge = Math.min(speedKmh, MAX_SPEED);

        // Calcola la lunghezza di ogni segmento in base alla velocità limitata
        const greenLen = (Math.min(speedForGauge, SPEED_GREEN_MAX) / MAX_SPEED) * circumference;
        const yellowLen = (Math.max(0, Math.min(speedForGauge, SPEED_YELLOW_MAX) - SPEED_GREEN_MAX) / MAX_SPEED) * circumference;
        const orangeLen = (Math.max(0, Math.min(speedForGauge, SPEED_ORANGE_MAX) - SPEED_YELLOW_MAX) / MAX_SPEED) * circumference;
        const redLen = (Math.max(0, speedForGauge - SPEED_ORANGE_MAX) / MAX_SPEED) * circumference;

        // Calcola lo spazio vuoto (gap) prima di ogni segmento
        const yellowGap = (SPEED_GREEN_MAX / MAX_SPEED) * circumference;
        const orangeGap = (SPEED_YELLOW_MAX / MAX_SPEED) * circumference;
        const redGap = (SPEED_ORANGE_MAX / MAX_SPEED) * circumference;

        // Applica i valori di dasharray per disegnare ogni segmento al posto giusto
        speedGaugeGreen.style.strokeDasharray = `${greenLen} ${circumference}`;
        speedGaugeYellow.style.strokeDasharray = `0 ${yellowGap} ${yellowLen} ${circumference}`;
        speedGaugeOrange.style.strokeDasharray = `0 ${orangeGap} ${orangeLen} ${circumference}`;
        speedGaugeRed.style.strokeDasharray = `0 ${redGap} ${redLen} ${circumference}`;

        // Cambia colore del testo della velocità
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
