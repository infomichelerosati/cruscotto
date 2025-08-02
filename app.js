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
    
    // Elementi per l'assetto
    const rollValue = document.getElementById('roll-value');
    const pitchValue = document.getElementById('pitch-value');
    const rearCarSvg = document.getElementById('rear-car-svg');
    const sideCarSvg = document.getElementById('side-car-svg');

    const calibrateBtn = document.getElementById('calibrate-btn');
    const sensitivitySlider = document.getElementById('sensitivity-slider');

    // Calcola la circonferenza del cerchio del tachimetro
    const gaugeRadius = speedGauge.r.baseVal.value;
    const gaugeCircumference = 2 * Math.PI * gaugeRadius;
    speedGauge.style.strokeDasharray = gaugeCircumference;
    speedGauge.style.strokeDashoffset = gaugeCircumference;

    const MAX_SPEED = 200;
    let wakeLock = null;

    // Variabili per la calibrazione
    let pitchOffset = 0;
    let rollOffset = 0;
    let accelOffsetZ = 0;

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
    calibrateBtn.addEventListener('click', calibrateSensors);

    async function requestPermissions() {
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const motionPermission = await DeviceMotionEvent.requestPermission();
                if (motionPermission !== 'granted') throw new Error("Permesso per i sensori di movimento negato.");
            }
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
        window.addEventListener('devicemotion', updateAcceleration);
        window.addEventListener('deviceorientation', updateOrientation);
    }

    function calibrateSensors() {
        // Feedback visivo: animazione di rotazione
        calibrateBtn.classList.add('calibrating');
        calibrateBtn.disabled = true;

        const handleMotion = (event) => {
            if (event.acceleration) accelOffsetZ = event.acceleration.z;
            window.removeEventListener('devicemotion', handleMotion, true);
        };

        const handleOrientation = (event) => {
            pitchOffset = event.beta || 0;
            rollOffset = event.gamma || 0;
            window.removeEventListener('deviceorientation', handleOrientation, true);
            
            console.log(`Sensori calibrati. Offset: Z=${accelOffsetZ.toFixed(2)}, Pitch=${pitchOffset.toFixed(2)}, Roll=${rollOffset.toFixed(2)}`);
            
            // Resetta i valori a schermo
            pitchValue.textContent = '0°';
            rollValue.textContent = '0°';
            
            // Rimuovi l'animazione e riabilita il pulsante
            setTimeout(() => {
                calibrateBtn.classList.remove('calibrating');
                calibrateBtn.disabled = false;
            }, 500); // Durata dell'animazione
        };

        window.addEventListener('devicemotion', handleMotion, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
    }

    function updateSpeed(position) {
        let speedKmh = position.coords.speed ? (position.coords.speed * 3.6) : 0;
        if (speedKmh < 3) speedKmh = 0; // Soglia di velocità

        const displaySpeed = speedKmh.toFixed(0);
        speedValue.textContent = displaySpeed;
        const speedFraction = Math.min(displaySpeed / MAX_SPEED, 1);
        const offset = gaugeCircumference * (1 - speedFraction);
        speedGauge.style.strokeDashoffset = offset;
    }

    function updateAcceleration(event) {
        if (!event.acceleration) return;
        const calibratedAccelerationZ = event.acceleration.z - accelOffsetZ;
        const divisor = 16 - sensitivitySlider.value;
        const threshold = 0.4;
        let accelPercent = 0;
        let brakePercent = 0;

        if (calibratedAccelerationZ > threshold) { 
            brakePercent = Math.min(((calibratedAccelerationZ - threshold) / divisor) * 100, 100);
        } else if (calibratedAccelerationZ < -threshold) { 
            accelPercent = Math.min((Math.abs(calibratedAccelerationZ) - threshold) / divisor * 100, 100);
        }
        
        accelBar.style.width = `${accelPercent}%`;
        brakeBar.style.width = `${brakePercent}%`;
    }

    // *** FUNZIONE ASSETTO AGGIORNATA ***
    function updateOrientation(event) {
        if (!event.beta || !event.gamma) return;

        // Applica l'offset di calibrazione
        const calibratedPitch = event.beta - pitchOffset;
        const calibratedRoll = event.gamma - rollOffset;

        // Applica la rotazione alle icone SVG
        rearCarSvg.style.transform = `rotate(${calibratedRoll}deg)`;
        sideCarSvg.style.transform = `rotate(${calibratedPitch}deg)`;

        // Aggiorna il testo con i gradi (valore assoluto)
        rollValue.textContent = `${Math.abs(calibratedRoll).toFixed(0)}°`;
        pitchValue.textContent = `${Math.abs(calibratedPitch).toFixed(0)}°`;
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
