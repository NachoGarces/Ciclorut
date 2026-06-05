// ---------- 6 ESTACIONAMIENTOS ----------
    let slots = [];
    let activeScanSlotId = null;
    let html5QrCode = null;
    let isScanning = false;
    
    const candadosGrid = document.getElementById('candadosGrid');
    const globalScannerDiv = document.getElementById('globalScannerArea');
    const stopScanBtn = document.getElementById('stopScanBtn');
    const restartCameraBtn = document.getElementById('restartCameraBtn');
    const logPanel = document.getElementById('logPanel');
    const globalMessagesDiv = document.getElementById('globalMessages');

    function setGlobalMessage(text, isError = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'sub-message';
        msgDiv.style.background = isError ? '#f9e0d0' : '#eef4ea';
        msgDiv.style.color = isError ? '#b85c1a' : '#2c5e2d';
        msgDiv.innerText = text;
        globalMessagesDiv.innerHTML = '';
        globalMessagesDiv.appendChild(msgDiv);
        document.querySelector('.messages-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function addLog(msg, isError = false) {
        const p = document.createElement('div');
        p.innerHTML = `🕒 ${new Date().toLocaleTimeString()} ${isError ? '⚠️' : '✅'} ${msg}`;
        p.style.color = isError ? '#c0392b' : '#2c5e2d';
        p.style.margin = '4px 0';
        logPanel.appendChild(p);
        logPanel.scrollTop = logPanel.scrollHeight;
        while (logPanel.children.length > 30) logPanel.removeChild(logPanel.lastChild);
    }

    function parseQRData(qrText) {
        let rut = null, serial = null, mrz = null;
        const runMatch = qrText.match(/(?:RUN|RUT|Rut)=[\s]*([0-9]+[-]?[0-9kK]+)/i);
        const serialMatch = qrText.match(/(?:serial|documento|numero\s*de\s*documento)=[\s]*([0-9a-zA-Z]+)/i);
        const mrzMatch = qrText.match(/(?:mrz|MRZ)=[\s]*([0-9A-Za-z]+)/);
        if (runMatch) rut = runMatch[1].toUpperCase();
        if (serialMatch) serial = serialMatch[1];
        if (mrzMatch) mrz = mrzMatch[1];
        if (!rut) { const fallback = qrText.match(/[0-9]{7,8}[-][0-9kK]/); if (fallback) rut = fallback[0]; }
        if (!serial) { const fallback = qrText.match(/\b[0-9]{6,12}\b/); if (fallback && !rut?.includes(fallback[0])) serial = fallback[0]; }
        if (!mrz) { const fallback = qrText.match(/[A-Z0-9]{20,}/); if (fallback) mrz = fallback[0]; }
        if (rut && serial && mrz) return { rut, serial, mrz };
        return null;
    }

    function obfuscateRUN(run) {
        if (!run) return '???';
        const parts = run.split('-');
        if (parts.length === 2) {
            const num = parts[0];
            const dv = parts[1];
            if (num.length <= 3) return run;
            return `${num.substring(0,3)}xxxxx-${dv}`;
        }
        return run.substring(0,3) + 'xxxxx';
    }
    function obfuscateSerial(serial) {
        if (!serial) return '???';
        if (serial.length <= 4) return serial;
        return serial.substring(0,3) + 'xxx';
    }
    function obfuscateMRZ(mrz) {
        if (!mrz) return '???';
        if (mrz.length <= 6) return mrz;
        return mrz.substring(0,4) + '...';
    }

    function isSameOwner(ownerA, ownerB) {
        if (!ownerA || !ownerB) return false;
        return (ownerA.rut === ownerB.rut && ownerA.serial === ownerB.serial && ownerA.mrz === ownerB.mrz);
    }

    function persistSlots() {
        localStorage.setItem('ciclorutSlots', JSON.stringify(slots));
    }

    function loadSlots() {
        const saved = localStorage.getItem('ciclorutSlots');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.length === 6) slots = parsed;
                else initDefaultSlots();
            } catch(e) { initDefaultSlots(); }
        } else {
            initDefaultSlots();
        }
        renderAllCards();
    }

    function initDefaultSlots() {
        slots = [];
        for (let i = 0; i < 6; i++) {
            slots.push({
                id: i,
                owner: null,
                isLocked: true,
                pendingRelease: false
            });
        }
        persistSlots();
    }

    function getCardClass(slot) {
        if (slot.owner === null) return 'card-available';
        if (!slot.isLocked) return 'card-open';
        return 'card-occupied';
    }

    function renderAllCards() {
        candadosGrid.innerHTML = '';
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            const card = document.createElement('div');
            card.className = `candado-card ${getCardClass(slot)}`;
            
            const hasOwner = slot.owner !== null;
            const lockSymbol = slot.isLocked ? '🔒' : '🔓';
            const bikeSymbol = hasOwner ? '🚲' : '⚪';
            
            let ownerDisplay = 'Libre';
            if (hasOwner) {
                const obfRut = obfuscateRUN(slot.owner.rut);
                const obfSerial = obfuscateSerial(slot.owner.serial);
                const obfMrz = obfuscateMRZ(slot.owner.mrz);
                ownerDisplay = `${obfRut} | serial:${obfSerial} | mrz:${obfMrz}`;
            }
            const estadoDesc = slot.isLocked ? 'CERRADO' : 'ABIERTO';
            
            card.innerHTML = `
                <div class="candado-header">Estacionamiento ${i+1}</div>
                <div class="iconos">
                    <span class="lock-icon">${lockSymbol}</span>
                    <span class="bike-icon">${bikeSymbol}</span>
                </div>
                <div class="estado-texto">${estadoDesc}</div>
                <div class="owner-info">👤 ${ownerDisplay}</div>
                <div class="acciones">
                    <button class="scan-btn" data-id="${i}">📷 Escanear QR</button>
                    ${!slot.isLocked && hasOwner ? `<button class="close-btn btn-secondary" data-id="${i}">🔒 Cerrar candado</button>` : ''}
                </div>
            `;
            candadosGrid.appendChild(card);
        }
        
        document.querySelectorAll('.scan-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(btn.dataset.id);
                startScannerForSlot(id);
            });
        });
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(btn.dataset.id);
                closeLockManually(id);
            });
        });
    }

    function closeLockManually(slotId) {
        const slot = slots[slotId];
        if (slot.owner === null) {
            setGlobalMessage(`❌ Estacionamiento ${slotId+1} no tiene dueño`, true);
            addLog(`Estacionamiento ${slotId+1}: no se puede cerrar, está libre.`, true);
            return;
        }
        if (!slot.isLocked) {
            if (slot.pendingRelease) {
                slot.owner = null;
                slot.isLocked = true;
                slot.pendingRelease = false;
                setGlobalMessage(`✅ Estacionamiento ${slotId+1} liberado. ¡Gracias por usar CicloRut!`);
                addLog(`Estacionamiento ${slotId+1}: liberado tras cerrar (retiro completado).`);
            } else {
                slot.isLocked = true;
                setGlobalMessage(`🔒 Estacionamiento ${slotId+1} asegurado. ¡Bicicleta guardada!`);
                addLog(`Estacionamiento ${slotId+1}: candado cerrado, espacio ocupado.`);
            }
            persistSlots();
            renderAllCards();
        } else {
            setGlobalMessage(`El candado ya estaba cerrado.`, true);
        }
    }

    function processQRForSlot(decodedText, slotId) {
        addLog(`Escaneo en Estacionamiento ${slotId+1}: "${decodedText.substring(0,40)}..."`);
        const extracted = parseQRData(decodedText);
        if (!extracted) {
            setGlobalMessage(`❌ QR inválido: no contiene RUN, serial y MRZ`, true);
            addLog(`No se pudieron extraer datos del QR.`, true);
            return false;
        }
        addLog(`Datos: RUN=${extracted.rut}, serial=${extracted.serial}, mrz=${extracted.mrz.substring(0,8)}...`);
        
        const slot = slots[slotId];
        
        if (slot.owner === null) {
            slot.owner = { ...extracted };
            slot.isLocked = false;
            slot.pendingRelease = false;
            setGlobalMessage(`Estacionamiento ${slotId+1} abierto. Engancha tu bici y presiona "Cerrar candado".`);
            addLog(`Nuevo dueño asignado. Candado ABIERTO (modo estacionamiento).`);
            persistSlots();
            renderAllCards();
            return true;
        }
        
        const isOwner = isSameOwner(slot.owner, extracted);
        if (isOwner) {
            if (slot.isLocked) {
                slot.isLocked = false;
                slot.pendingRelease = true;
                setGlobalMessage(`Estacionamiento ${slotId+1} abierto. Retira tu bicicleta y presiona "Cerrar candado" para liberar.`);
                addLog(`Dueño verificó QR. Candado ABIERTO (modo retiro).`);
                persistSlots();
                renderAllCards();
            } else {
                setGlobalMessage(`El candado ya está abierto. Si ya retiraste, presiona "Cerrar candado".`);
            }
            return true;
        } else {
            setGlobalMessage(`Acceso denegado - Estacionamiento ${slotId+1} pertenece a otro usuario`, true);
            addLog(`Acceso denegado: el QR no corresponde al dueño (${slot.owner.rut}).`, true);
            return false;
        }
    }

    async function startScannerForSlot(slotId) {
        if (isScanning) {
            await stopScanner();
        }
        activeScanSlotId = slotId;
        globalScannerDiv.style.display = 'block';
        globalScannerDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        const qrReaderDiv = document.getElementById('qr-reader');
        html5QrCode = new Html5Qrcode("qr-reader");
        
        try {
            await html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 300, height: 300 },
                },
                (decodedText) => {
                    processQRForSlot(decodedText, activeScanSlotId);
                    stopScanner();
                },
                (errorMessage) => {
                    // Solo mostrar errores críticos
                    if (errorMessage.includes("No MultiFormat Readers")) return;
                    console.log(errorMessage);
                }
            );
            isScanning = true;
            setGlobalMessage(`Cámara activa - Escaneando para Estacionamiento ${slotId+1}`);
            addLog(`Cámara iniciada correctamente.`);

            // ── ZOOM AUTOMÁTICO ──
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                const track = stream.getVideoTracks()[0];
                if (track) {
                    const capabilities = track.getCapabilities();
                    addLog(`Capacidades: ${JSON.stringify(capabilities).substring(0,80)}`);
                    if (capabilities.zoom) {
                         const targetZoom = Math.min(capabilities.zoom.min * 3, capabilities.zoom.max);
                         await track.applyConstraints({ advanced: [{ zoom: targetZoom }] });
                         addLog(`Zoom aplicado: ${targetZoom.toFixed(1)}x`);
                    } else {
                         addLog(`Sin soporte de zoom en este dispositivo.`);
                    }
                }
            } catch(e) {
                addLog(`Zoom no disponible: ${e.message}`);
            }
            //  zoom
        } catch(err) {
            setGlobalMessage(`Error: ${err}`, true);
            addLog(`Error al iniciar cámara: ${err}`, true);
            globalScannerDiv.style.display = 'none';
            isScanning = false;
        }
    }

    async function stopScanner() {
        if (html5QrCode && isScanning) {
            try {
                await html5QrCode.stop();
            } catch(e) {}
            isScanning = false;
        }
        globalScannerDiv.style.display = 'none';
        activeScanSlotId = null;
        setGlobalMessage(`Escáner detenido`);
        addLog(`Cámara detenida.`);
    }

    async function restartCamera() {
        if (activeScanSlotId !== null) {
            await stopScanner();
            setTimeout(() => {
                startScannerForSlot(activeScanSlotId);
            }, 500);
        } else {
            setGlobalMessage(`Primero selecciona un estacionamiento para escanear`, true);
        }
    }

    stopScanBtn.addEventListener('click', stopScanner);
    restartCameraBtn.addEventListener('click', restartCamera);

    function resetearTodo() {
        if (confirm('¿Seguro? Se borrarán todos los estacionamientos y datos guardados.')) {
            localStorage.clear();
            initDefaultSlots();
            renderAllCards();
            addLog('Todos los datos eliminados.');
            setGlobalMessage('🗑️ Datos borrados. Sistema reiniciado.');
        }
    }
    // ── INPUT TECLADO (app celular) ──
    const qrHiddenInput = document.getElementById('qrHiddenInput');

    document.addEventListener('click', () => qrHiddenInput.focus());

    qrHiddenInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const texto = qrHiddenInput.value.trim();
            qrHiddenInput.value = '';
            if (!texto) return;
            if (activeScanSlotId === null) {
                setGlobalMessage('Primero haz clic en "Escanear QR" de un estacionamiento', true);
                return;
            }
            processQRForSlot(texto, activeScanSlotId);
        }
    });
    
    loadSlots();