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
    // L'arco del tachimetro è 3/4 di cerchio (270 gradi)
    const totalArcLength = circumference * 0.75; 

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

    // --- FUNZIONE updateSpeed CON LOGICA CORRETTA ---
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
        
        // Calcola la lunghezza totale dell'arco da colorare
        const filledArcLength = (speedForGauge / MAX_SPEED) * totalArcLength;

        // Calcola la lunghezza massima di ogni segmento colorato sull'arco
        const greenMaxArc = (SPEED_GREEN_MAX / MAX_SPEED) * totalArcLength;
        const yellowMaxArc = (SPEED_YELLOW_MAX / MAX_SPEED) * totalArcLength;
        const orangeMaxArc = (SPEED_ORANGE_MAX / MAX_SPEED) * totalArcLength;

        // Calcola la lunghezza visibile di ogni segmento in base alla velocità attuale
        const greenLen = Math.min(filledArcLength, greenMaxArc);
        const yellowLen = Math.max(0, Math.min(filledArcLength, yellowMaxArc) - greenMaxArc);
        const orangeLen = Math.max(0, Math.min(filledArcLength, orangeMaxArc) - yellowMaxArc);
        const redLen = Math.max(0, filledArcLength - orangeMaxArc);

        // Applica le lunghezze e gli offset corretti a ogni cerchio
        // Il cerchio verde parte dall'inizio
        speedGaugeGreen.style.strokeDasharray = `${greenLen} ${circumference}`;
        
        // I cerchi successivi vengono disegnati con un offset (spazio vuoto iniziale)
        // per farli iniziare dove finisce il segmento precedente.
        speedGaugeYellow.style.strokeDasharray = `0 ${greenMaxArc} ${yellowLen} ${circumference}`;
        speedGaugeOrange.style.strokeDasharray = `0 ${yellowMaxArc} ${orangeLen} ${circumference}`;
        speedGaugeRed.style.strokeDasharray = `0 ${orangeMaxArc} ${redLen} ${circumference}`;

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

    // Nota: questo calcolo avviene una sola volta, assumendo che la dimensione non cambi.
    // Per un layout completamente fluido, questo andrebbe ricalcolato su 'resize'.
    const gaugeRadius = speedGauge.r.baseVal.value;
    const circumference = 2 * Math.PI * gaugeRadius;
    const totalArcLength = circumference * 0.75; // L'arco del tachimetro è 3/4 di cerchio (270 gradi)

    // Imposta l'arco di sfondo
    speedGaugeBg.style.strokeDasharray = `${totalArcLength} ${circumference}`;
    
    // Inizializza l'indicatore di velocità a 0
    speedGauge.style.strokeDasharray = `0 ${circumference}`;

    // Costanti per la calibrazione automatica
    const STILLNESS_THRESHOLD_MS = 2000;
    const AUTO_CALIBRATE_THRESHOLD_MS = 5000;
    const AUTO_CALIBRATE_COOLDOWN_MS = 10000;

    let wakeLock = null;
    let pitchOffset = 0;
    let rollOffset = 0;
    let lastMovementTime = Date.now();
    let lastAutoCalibrateTime = 0;
    let isCalibrating = false;

    // Funzione per mantenere lo schermo attivo
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

    // Registrazione del Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js').catch(error => console.log('Registrazione Service Worker fallita:', error));
    }

    permissionBtn.addEventListener('click', requestPermissions);
    calibrateBtn.addEventListener('click', () => calibrateSensors(false));

    // Richiesta dei permessi per sensori e GPS
    async function requestPermissions() {
        try {
            // Permessi per iOS
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                const orientationPermission = await DeviceOrientationEvent.requestPermission();
                if (orientationPermission !== 'granted') throw new Error("Permesso per l'orientamento del dispositivo negato.");
            }
            if (!('geolocation' in navigator)) throw new Error("Geolocalizzazione non supportata.");
            
            startListeners();
            
            permissionScreen.classList.add('hidden');
            startupCalibrationPopup.classList.remove('hidden');

            // Calibrazione iniziale automatica
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

    // Avvio dei listener per GPS e sensori di movimento
    function startListeners() {
        navigator.geolocation.watchPosition(updateSpeed, handleLocationError, { enableHighAccuracy: true });
        window.addEventListener('deviceorientation', updateAttitude);
    }

    // Funzione per calibrare i sensori di inclinazione
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

    // --- FUNZIONE updateSpeed COMPLETAMENTE RISCRITTA ---
    function updateSpeed(position) {
        let speedKmh = position.coords.speed ? (position.coords.speed * 3.6) : 0;
        
        const timeSinceLastMovement = Date.now() - lastMovementTime;
        const timeSinceLastCalibrate = Date.now() - lastAutoCalibrateTime;

        // Auto-calibrazione se il dispositivo è fermo per un po'
        if (timeSinceLastMovement > AUTO_CALIBRATE_THRESHOLD_MS && timeSinceLastCalibrate > AUTO_CALIBRATE_COOLDOWN_MS) {
            calibrateSensors(true);
        }

        // Se il dispositivo è fermo, forza la velocità a 0 per precisione
        if (timeSinceLastMovement > STILLNESS_THRESHOLD_MS) {
            speedKmh = 0;
        }

        const displaySpeed = speedKmh.toFixed(0);
        speedValue.textContent = displaySpeed;
        
        // Calcola la frazione di velocità rispetto al massimo
        const speedFraction = Math.min(speedKmh, MAX_SPEED) / MAX_SPEED;
        // Calcola la lunghezza dell'arco da visualizzare
        const strokeLen = speedFraction * totalArcLength;

        // Applica la lunghezza calcolata all'attributo stroke-dasharray per "disegnare" l'arco
        speedGauge.style.strokeDasharray = `${strokeLen} ${circumference}`;

        // Aggiorna il colore dell'indicatore in base alla velocità
        let newColor;
        if (speedKmh <= SPEED_GREEN_MAX) {
            newColor = '#22c55e'; // Verde
        } else if (speedKmh <= SPEED_YELLOW_MAX) {
            newColor = '#eab308'; // Giallo
        } else if (speedKmh <= SPEED_ORANGE_MAX) {
            newColor = '#f97316'; // Arancione
        } else {
            newColor = '#ef4444'; // Rosso
        }
        speedGauge.style.stroke = newColor;

        // Cambia colore del testo della velocità quando si superano i 160 km/h
        if (speedKmh > SPEED_ORANGE_MAX) {
            speedValue.classList.add('text-red-500');
            speedValue.classList.remove('text-white');
        } else {
            speedValue.classList.remove('text-red-500');
            speedValue.classList.add('text-white');
        }
    }

    // Funzione per aggiornare l'assetto del veicolo (inclinazione e beccheggio)
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

