// ======================= PAD.JS – VERSION ULTIME 2025 =======================
// 100% compatible avec TON backend réel (lignes avec nanoid, pad:updated, etc.)
// ===========================================================================

const PadFrontend = {
    conversationId: null,
    lines: [],
    displayMode: 'text',
    isOpen: false,
    socket: null,
    draggedLine: null
};

// ===========================================================================
// OUVRIR LE PAD
// ===========================================================================
async function openPad() {
    if (!state.currentConversation) {
        showMessage("Sélectionne une conversation", "warning");
        return;
    }

    const convId = state.currentConversation._id;
    PadFrontend.conversationId = convId;

    try {
        const res = await fetch(`${CONFIG.BACKEND_URL}/api/pads/${convId}`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Pad non trouvé");

        PadFrontend.lines = data.pad.lines || [];
        PadFrontend.displayMode = data.pad.displayMode || 'text';

        // Rejoindre la room pad
        if (state.socket?.connected) {
            state.socket.emit('join_pad', convId);
        }

        renderPad();
        document.getElementById('padModal').style.display = 'flex';
        PadFrontend.isOpen = true;

        // Focus première ligne ou nouvelle ligne vide
        setTimeout(() => {
            const firstInput = document.querySelector('.pad-line-input');
            if (firstInput) firstInput.focus();
        }, 100);

        showMessage("Pad collaboratif ouvert", "success");

    } catch (err) {
        showMessage("Erreur pad : " + err.message, "error");
    }
}

// ===========================================================================
// FERMER LE PAD
// ===========================================================================
function closePad() {
    if (PadFrontend.conversationId && state.socket?.connected) {
        state.socket.emit('leave_pad', PadFrontend.conversationId);
    }
    document.getElementById('padModal').style.display = 'none';
    PadFrontend.isOpen = false;
    PadFrontend.conversationId = null;
    PadFrontend.lines = [];
}

// ===========================================================================
// RENDU COMPLET DU PAD
// ===========================================================================
function renderPad() {
    const container = document.getElementById('padLinesContainer');
    const modeBtn = document.getElementById('togglePadModeBtn');
    const stats = document.getElementById('padStats');

    if (!container) return;

    // Bouton mode
    modeBtn.textContent = PadFrontend.displayMode === 'todo' ? 'Mode Texte' : 'Mode To-Do';

    // Stats
    const checked = PadFrontend.lines.filter(l => l.checked).length;
    const total = PadFrontend.lines.filter(l => l.text.trim()).length;
    document.getElementById('padProgressText').textContent = `${checked}/${total}`;
    document.getElementById('padProgressBar').style.width = total > 0 ? `${(checked / total) * 100}%` : '0%';
    stats.style.display = PadFrontend.displayMode === 'todo' ? 'flex' : 'none';

    // Lignes
    container.innerHTML = '';
    PadFrontend.lines.forEach((line, index) => {
        const lineEl = createLineElement(line, index);
        container.appendChild(lineEl);
    });

    // Ligne vide à la fin (pour taper directement)
    if (PadFrontend.lines.length === 0 || PadFrontend.lines[PadFrontend.lines.length - 1].text.trim() !== '') {
        container.appendChild(createEmptyLine());
    }
}

// Crée une ligne vide (nouvelle entrée)
function createEmptyLine() {
    const div = document.createElement('div');
    div.className = 'pad-line';
    div.innerHTML = `
        <div class="pad-line-content">
            ${PadFrontend.displayMode === 'todo' ? '<input type="checkbox" disabled>' : ''}
            <input type="text" class="pad-line-input" placeholder="Tape ici..." autocomplete="off">
            <button class="pad-add-btn" title="Ajouter">+ Nouvelle ligne</button>
        </div>
    `;
    const input = div.querySelector('.pad-line-input');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addNewLine(input.value.trim());
            input.value = '';
            setTimeout(() => input.focus(), 50);
        }
    });
    div.querySelector('.pad-add-btn')?.addEventListener('click', () => {
        addNewLine(input.value.trim());
        input.value = '';
        input.focus();
    });
    return div;
}

// Crée une ligne existante
function createLineElement(line, index) {
    const div = document.createElement('div');
    div.className = 'pad-line';
    div.dataset.lineId = line._id;
    div.draggable = true;

    const assigned = line.assignedTo ? `@${line.assignedTo.username || 'inconnu'}` : '';

    div.innerHTML = `
        <div class="pad-line-content">
            ${PadFrontend.displayMode === 'todo' ? `
                <input type="checkbox" class="pad-checkbox" ${line.checked ? 'checked' : ''}>
            ` : ''}
            <input type="text" class="pad-line-input" value="${escapeHtml(line.text)}" placeholder="Vide...">
            <span class="pad-assigned">${assigned}</span>
            <button class="pad-delete-btn" title="Supprimer">Supprimer</button>
        </div>
    `;

    // Événements
    const checkbox = div.querySelector('.pad-checkbox');
    const input = div.querySelector('.pad-line-input');
    const deleteBtn = div.querySelector('.pad-delete-btn');

    if (checkbox) {
        checkbox.addEventListener('change', () => toggleCheck(line._id, checkbox.checked));
    }

    input.addEventListener('input', debounce(() => {
        updateLineText(line._id, input.value);
    }, 500));

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const nextInput = div.nextElementSibling?.querySelector('.pad-line-input');
            if (nextInput) nextInput.focus();
            else addNewLine('');
        }
    });

    deleteBtn.addEventListener('click', () => deleteLine(line._id));

    // Drag & Drop
    div.addEventListener('dragstart', (e) => {
        PadFrontend.draggedLine = line._id;
        div.classList.add('dragging');
    });
    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        PadFrontend.draggedLine = null;
    });
    div.addEventListener('dragover', (e) => e.preventDefault());
    div.addEventListener('drop', (e) => {
        e.preventDefault();
        if (PadFrontend.draggedLine && PadFrontend.draggedLine !== line._id) {
            reorderLines(PadFrontend.draggedLine, line._id);
        }
    });

    return div;
}

// ===========================================================================
// ACTIONS API
// ===========================================================================
async function addNewLine(text = "") {
    if (!PadFrontend.conversationId) return;
    try {
        await fetch(`${CONFIG.BACKEND_URL}/api/pads/${PadFrontend.conversationId}/lines`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });
        // Le backend émet pad:updated → on ne fait rien ici
    } catch (err) { console.error(err); }
}

async function updateLineText(lineId, text) {
    try {
        await fetch(`${CONFIG.BACKEND_URL}/api/pads/${PadFrontend.conversationId}/lines/${lineId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${state.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });
    } catch (err) { console.error(err); }
}

async function deleteLine(lineId) {
    if (!confirm("Supprimer cette ligne ?")) return;
    try {
        await fetch(`${CONFIG.BACKEND_URL}/api/pads/${PadFrontend.conversationId}/lines/${lineId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
    } catch (err) { console.error(err); }
}

async function toggleCheck(lineId, checked) {
    try {
        await fetch(`${CONFIG.BACKEND_URL}/api/pads/${PadFrontend.conversationId}/lines/${lineId}/check`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ checked })
        });
    } catch (err) { console.error(err); }
}

async function togglePadMode() {
    const newMode = PadFrontend.displayMode === 'text' ? 'todo' : 'text';
    try {
        await fetch(`${CONFIG.BACKEND_URL}/api/pads/${PadFrontend.conversationId}/mode`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mode: newMode })
        });
    } catch (err) { console.error(err); }
}

async function clearPad() {
    if (!confirm("Supprimer TOUT le contenu du pad ?")) return;
    try {
        await fetch(`${CONFIG.BACKEND_URL}/api/pads/${PadFrontend.conversationId}/clear`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
    } catch (err) { console.error(err); }
}

// ===========================================================================
// SOCKET LISTENERS (appelé depuis messaging.js)
// ===========================================================================
function initPadSocket() {
    if (!state.socket) return;

    state.socket.on('pad:updated', (pad) => {
        if (!PadFrontend.isOpen || pad.conversationId !== PadFrontend.conversationId) return;
        PadFrontend.lines = pad.lines || [];
        renderPad();
    });

    state.socket.on('pad:mode_changed', (data) => {
        if (data.conversationId !== PadFrontend.conversationId) return;
        PadFrontend.displayMode = data.mode;
        renderPad();
    });
}

// ===========================================================================
// UTILS
// ===========================================================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ===========================================================================
// EXPORT PUBLIC
// ===========================================================================
window.Pad = {
    open: openPad,
    close: closePad,
    toggleMode: togglePadMode,
    clear: clearPad,
    initSocket: initPadSocket
};

// Auto-init boutons
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('openPadBtn')?.addEventListener('click', openPad);
    document.getElementById('closePadBtn')?.addEventListener('click', closePad);
    document.getElementById('togglePadModeBtn')?.addEventListener('click', togglePadMode);
    document.getElementById('clearPadBtn')?.addEventListener('click', clearPad);

    // Fermer en cliquant dehors
    document.getElementById('padModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'padModal') closePad();
    });
});