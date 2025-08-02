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

    // Funzione per aggiornare l'accelerazione
    function updateAcceleration(event) {
        // Usiamo l'asse Y che di solito corrisponde all'avanti/indietro del dispositivo
        const accelerationY = event.accelerationIncludingGravity.y;
        
        // Normalizziamo il valore e applichiamo una soglia per ignorare piccoli movimenti
        const threshold = 1.5;
        let accelPercent = 0;
        let brakePercent = 0;

        if (accelerationY > threshold) { // Frenata (il telefono si inclina in avanti)
            brakePercent = Math.min(((accelerationY - threshold) / 10) * 100, 100);
        } else if (accelerationY < -threshold) { // Accelerazione (il telefono si inclina indietro)
            accelPercent = Math.min((Math.abs(accelerationY) - threshold) / 10 * 100, 100);
        }
        
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

    // --- LOGICA PER LA FIRMA ANIMATA ---
    const signatureCanvas = document.getElementById('signature-canvas');
    if (signatureCanvas) {
        const ctx = signatureCanvas.getContext('2d');
        
        const colors = [
            '#0ea5e9', // cyan
            '#22c55e', // green
            '#facc15', // yellow
            '#f97316', // orange
            '#ef4444', // red
            '#d946ef', // fuchsia
            '#8b5cf6', // violet
            '#ec4899'  // pink
        ];
        let colorIndex = 0;
        let transitionProgress = 0;
        const transitionSpeed = 0.01; // Controlla la velocità del cambio colore

        function hexToRgb(hex) {
            let r = 0, g = 0, b = 0;
            if (hex.length == 4) {
                r = parseInt(hex[1] + hex[1], 16);
                g = parseInt(hex[2] + hex[2], 16);
                b = parseInt(hex[3] + hex[3], 16);
            } else if (hex.length == 7) {
                r = parseInt(hex[1] + hex[2], 16);
                g = parseInt(hex[3] + hex[4], 16);
                b = parseInt(hex[5] + hex[6], 16);
            }
            return { r, g, b };
        }

        function interpolateColor(color1, color2, factor) {
            let result = { r: color1.r, g: color1.g, b: color1.b };
            result.r = Math.round(result.r + factor * (color2.r - result.r));
            result.g = Math.round(result.g + factor * (color2.g - result.g));
            result.b = Math.round(result.b + factor * (color2.b - result.b));
            return `rgb(${result.r}, ${result.g}, ${result.b})`;
        }

        function animateSignature() {
            const startColorRgb = hexToRgb(colors[colorIndex]);
            const endColorRgb = hexToRgb(colors[(colorIndex + 1) % colors.length]);

            const interpolatedColor = interpolateColor(startColorRgb, endColorRgb, transitionProgress);

            // Pulisce il canvas
            ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);

            // Disegna il testo. Ho usato 12px invece di 6px per una migliore leggibilità.
            ctx.font = '12px Orbitron';
            ctx.fillStyle = interpolatedColor;
            ctx.fillText('Powered by Michele Rosati', 5, 17);

            transitionProgress += transitionSpeed;

            if (transitionProgress >= 1) {
                transitionProgress = 0;
                colorIndex = (colorIndex + 1) % colors.length;
            }

            requestAnimationFrame(animateSignature);
        }

        // Avvia l'animazione
        animateSignature();
    }
});
