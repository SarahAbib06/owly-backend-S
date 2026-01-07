// ===== SYSTÈME PAD AVEC CURSEURS GOOGLE DOCS =====
const PadSystem = {
    config: {
        SAVE_DELAY: 1000,
        CURSOR_UPDATE_INTERVAL: 100
    },

    state: {
        isOpen: false,
        currentPad: null,
        activeUsers: new Map(),
        cursorInterval: null,
        saveTimeout: null,
        buffer: {
            content: '',
            lastSaved: Date.now()
        },
        textareaMetrics: null,
        lastCursorSend: 0
    },

    init() {
        console.log("🚀 Initialisation du système Pad avec curseurs Google Docs");
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => this.initializeAfterDOM(), 100);
            });
        } else {
            setTimeout(() => this.initializeAfterDOM(), 100);
        }
    },

    initializeAfterDOM() {
        console.log("🔗 Liaison des événements Pad...");
        
        this.bindEvents();
        setTimeout(() => this.bindSocketEventsWhenReady(), 500);
    },

    bindEvents() {
        const padBtn = document.getElementById('padBtn');
        if (padBtn) {
            padBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.open();
            });
        }
        
        const closeBtn = document.getElementById('closePadModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        const clearBtn = document.getElementById('clearPadBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm("Voulez-vous vraiment vider tout le contenu du Pad ?")) {
                    this.clearPad();
                }
            });
        }
        
        const textarea = document.getElementById('padTextarea');
        if (textarea) {
            // Événements pour le curseur
            textarea.addEventListener('input', (e) => this.handleInput(e));
            textarea.addEventListener('click', (e) => this.sendCursorImmediate());
            textarea.addEventListener('keydown', (e) => this.sendCursorImmediate());
            textarea.addEventListener('keyup', (e) => this.sendCursorImmediate());
            textarea.addEventListener('mousemove', (e) => {
                if (e.buttons === 1) this.sendCursorImmediate(); // Drag avec souris
            });
            textarea.addEventListener('focus', () => this.onFocus());
            textarea.addEventListener('blur', () => this.onBlur());
        }
    },

    bindSocketEventsWhenReady() {
        const checkSocket = () => {
            if (window.state && window.state.socket && window.state.socket.connected) {
                this.bindSocketEvents();
            } else {
                setTimeout(checkSocket, 500);
            }
        };
        checkSocket();
    },

    bindSocketEvents() {
        if (!window.state || !window.state.socket) return;

        const socket = window.state.socket;
        
        socket.on('pad_joined', (data) => this.handlePadJoined(data));
        socket.on('pad_update', (data) => this.handlePadUpdate(data));
        socket.on('pad_error', (data) => this.handleError(data));
        socket.on('pad_user_joined', (data) => this.handleUserJoined(data));
        socket.on('pad_user_left', (data) => this.handleUserLeft(data));
        socket.on('pad_user_cursor', (data) => this.handleRemoteCursor(data));
    },

    // ===== GESTION DU PAD =====

    async open() {
        if (!window.state || !window.state.currentConversation?._id) {
            this.showMessage("Sélectionnez une conversation d'abord", "warning");
            return;
        }

        if (!window.state.token) {
            this.showMessage("Vous devez être connecté", "error");
            return;
        }

        try {
            this.showMessage("Chargement du Pad...", "info");

            const backendUrl = window.CONFIG?.BACKEND_URL || 'http://localhost:5000';
            const conversationId = window.state.currentConversation._id;
            
            const response = await fetch(
                `${backendUrl}/api/pads/${conversationId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${window.state.token}`,
                        'Accept': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    this.showMessage("Session expirée. Veuillez vous reconnecter.", "error");
                    return;
                }
                throw new Error(`Erreur serveur: ${response.status}`);
            }

            const data = await response.json();
            if (!data.success || !data.pad) {
                throw new Error(data.error || "Erreur lors du chargement du Pad");
            }

            this.state.currentPad = data.pad;
            this.state.buffer.content = data.pad.content || '';
            this.showModal();

            if (window.state.socket && window.state.socket.connected) {
                window.state.socket.emit('join_pad', conversationId);
            }

            this.showMessage("✅ Pad chargé avec succès!", "success");

        } catch (error) {
            console.error("❌ Erreur ouverture Pad:", error);
            this.showMessage("Erreur lors du chargement du Pad", "error");
        }
    },

    showModal() {
        const modal = document.getElementById('padModal');
        if (!modal) {
            this.showMessage("Erreur: modal Pad introuvable", "error");
            return;
        }

        modal.style.display = 'flex';
        this.state.isOpen = true;
        this.updateUI();

        setTimeout(() => {
            const textarea = document.getElementById('padTextarea');
            if (textarea) {
                textarea.focus();
                textarea.selectionStart = textarea.value.length;
                this.calculateTextareaMetrics(); // Calculer les métriques
            }
        }, 150);

        this.startCursorTracking();
    },

    close() {
        const modal = document.getElementById('padModal');
        if (modal) modal.style.display = 'none';

        if (window.state?.socket && window.state?.currentConversation) {
            window.state.socket.emit('leave_pad', window.state.currentConversation._id);
        }

        if (this.state.buffer.content && this.state.buffer.content !== this.state.currentPad?.content) {
            this.saveContent();
        }

        this.cleanup();
        this.state.isOpen = false;
    },

    cleanup() {
        if (this.state.saveTimeout) {
            clearTimeout(this.state.saveTimeout);
            this.state.saveTimeout = null;
        }
        if (this.state.cursorInterval) {
            clearInterval(this.state.cursorInterval);
            this.state.cursorInterval = null;
        }
        this.state.activeUsers.clear();
        document.querySelectorAll('.remote-cursor').forEach(el => el.remove());
        document.querySelectorAll('.remote-selection').forEach(el => el.remove());
    },

    // ===== GESTION DE L'ÉDITION =====

    handleInput(e) {
        const newContent = e.target.value;
        const oldContent = this.state.buffer.content;

        if (newContent === oldContent) return;

        this.state.buffer.content = newContent;
        this.sendCursorImmediate(); // Curseur mis à jour immédiatement

        if (window.state?.socket && window.state.socket.connected && window.state.currentConversation) {
            window.state.socket.emit('pad_content_change', {
                conversationId: window.state.currentConversation._id,
                content: newContent
            });
        }

        this.scheduleSave();
    },

    scheduleSave() {
        if (this.state.saveTimeout) clearTimeout(this.state.saveTimeout);
        this.state.saveTimeout = setTimeout(() => this.saveContent(), this.config.SAVE_DELAY);
    },

    async saveContent() {
        if (!this.state.currentPad || !window.state?.currentConversation || !window.state?.token) return;

        try {
            const backendUrl = window.CONFIG?.BACKEND_URL || 'http://localhost:5000';
            await fetch(
                `${backendUrl}/api/pads/${window.state.currentConversation._id}/content`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.state.token}`
                    },
                    body: JSON.stringify({
                        content: this.state.buffer.content || ""
                    })
                }
            );
            this.state.buffer.lastSaved = Date.now();
            if (this.state.currentPad) {
                this.state.currentPad.content = this.state.buffer.content;
            }
        } catch (error) {
            console.error("❌ Erreur sauvegarde:", error);
        }
    },

    // ===== CURSEURS COMME GOOGLE DOCS =====

    calculateTextareaMetrics() {
        const textarea = document.getElementById('padTextarea');
        if (!textarea) return;
        
        const style = getComputedStyle(textarea);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        ctx.font = `${style.fontSize} ${style.fontFamily}`;
        const metrics = ctx.measureText('M');
        
        this.state.textareaMetrics = {
            fontSize: parseInt(style.fontSize),
            fontFamily: style.fontFamily,
            lineHeight: parseInt(style.lineHeight),
            paddingLeft: parseInt(style.paddingLeft),
            paddingTop: parseInt(style.paddingTop),
            charWidth: metrics.width,
            container: textarea.getBoundingClientRect()
        };
    },

    // NOUVELLE FONCTION : Calcul précis de la position du curseur
    getCursorPixelPosition(cursorIndex) {
        const textarea = document.getElementById('padTextarea');
        if (!textarea || !this.state.textareaMetrics) return { x: 0, y: 0 };
        
        const text = textarea.value.substring(0, cursorIndex);
        const lines = text.split('\n');
        const currentLine = lines[lines.length - 1];
        const lineIndex = lines.length - 1;
        
        const metrics = this.state.textareaMetrics;
        const x = metrics.paddingLeft + (currentLine.length * metrics.charWidth);
        const y = metrics.paddingTop + (lineIndex * metrics.lineHeight);
        
        return {
            x: Math.min(x, textarea.clientWidth - 20),
            y: Math.min(y, textarea.clientHeight - 20)
        };
    },

    // NOUVELLE FONCTION : Envoi immédiat du curseur
    sendCursorImmediate() {
        if (!this.state.isOpen || !window.state?.socket?.connected) return;
        
        const now = Date.now();
        if (now - this.state.lastCursorSend < 50) return; // Limite à 20 fps
        
        const textarea = document.getElementById('padTextarea');
        if (!textarea || !window.state.currentConversation) return;
        
        const cursorPos = textarea.selectionStart;
        const pixelPos = this.getCursorPixelPosition(cursorPos);
        
        window.state.socket.emit('pad_cursor_move', {
            conversationId: window.state.currentConversation._id,
            position: cursorPos,
            pixelX: Math.round(pixelPos.x),
            pixelY: Math.round(pixelPos.y)
        });
        
        this.state.lastCursorSend = now;
    },

    startCursorTracking() {
        if (this.state.cursorInterval) clearInterval(this.state.cursorInterval);
        
        this.state.cursorInterval = setInterval(() => {
            this.sendCursorImmediate();
        }, this.config.CURSOR_UPDATE_INTERVAL);
    },

    // NOUVELLE FONCTION : Gestion des curseurs distants
    handleRemoteCursor(data) {
        if (data.userId === window.state.user?.id) return;
        
        let cursor = document.getElementById(`cursor-${data.userId}`);
        if (!cursor) {
            cursor = this.createRemoteCursor(data.userId, data.username);
        }
        
        // Positionner le curseur avec les coordonnées pixels
        if (data.pixelX !== undefined && data.pixelY !== undefined) {
            cursor.style.left = `${data.pixelX}px`;
            cursor.style.top = `${data.pixelY}px`;
        } else {
            // Fallback : calcul approximatif
            const pos = this.getCursorPixelPosition(data.position || 0);
            cursor.style.left = `${pos.x}px`;
            cursor.style.top = `${pos.y}px`;
        }
        
        cursor.style.opacity = '1';
        cursor.style.display = 'block';
        
        // Mettre à jour le label avec le nom
        const label = cursor.querySelector('.cursor-label');
        if (label && data.username) {
            label.textContent = data.username;
        }
        
        // Timer pour masquer si inactif
        clearTimeout(cursor.timeout);
        cursor.timeout = setTimeout(() => {
            cursor.style.opacity = '0';
            setTimeout(() => {
                if (cursor.style.opacity === '0') {
                    cursor.style.display = 'none';
                }
            }, 300);
        }, 2000);
    },

    // NOUVELLE FONCTION : Création d'un curseur stylé
    createRemoteCursor(userId, username) {
        const color = this.getUserColor(userId);
        
        const cursor = document.createElement('div');
        cursor.id = `cursor-${userId}`;
        cursor.className = 'remote-cursor';
        cursor.style.cssText = `
            position: absolute;
            width: 2px;
            height: 24px;
            background-color: ${color};
            z-index: 1000;
            pointer-events: none;
            transition: opacity 0.3s, transform 0.1s;
            opacity: 0;
            display: none;
            border-radius: 1px;
            box-shadow: 0 0 3px rgba(0,0,0,0.5);
            transform-origin: top;
        `;
        
        const label = document.createElement('div');
        label.className = 'cursor-label';
        label.textContent = username || 'User';
        label.style.cssText = `
            position: absolute;
            top: -28px;
            left: -10px;
            background-color: ${color};
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 1001;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        
        cursor.appendChild(label);
        
        // Ajouter une flèche sous le label
        const arrow = document.createElement('div');
        arrow.style.cssText = `
            position: absolute;
            top: -4px;
            left: 10px;
            width: 0;
            height: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 5px solid ${color};
        `;
        label.appendChild(arrow);
        
        const editorContainer = document.querySelector('.pad-editor-container');
        if (editorContainer) {
            editorContainer.style.position = 'relative';
            editorContainer.appendChild(cursor);
        }
        
        return cursor;
    },

    // ===== MISE À JOUR INTERFACE =====

    updateUI() {
        const textarea = document.getElementById('padTextarea');
        if (textarea) {
            textarea.value = this.state.buffer.content;
        }

        // Masquer éléments todo
        const statsContainer = document.getElementById('padStats');
        if (statsContainer) statsContainer.style.display = 'none';
        
        const toggleBtn = document.getElementById('toggleModeBtn');
        if (toggleBtn) toggleBtn.style.display = 'none';
        
        const modeIndicator = document.getElementById('modeIndicator');
        if (modeIndicator) modeIndicator.style.display = 'none';

        this.updateActiveUsers();
        this.calculateTextareaMetrics(); // Recalculer les métriques
    },

    updateActiveUsers() {
        const container = document.getElementById('padActiveUsers');
        const countElement = document.getElementById('activeUsersCount');
        
        if (!container) return;

        container.innerHTML = '';
        this.state.activeUsers.forEach((user, userId) => {
            const userElement = document.createElement('div');
            userElement.className = 'active-user';
            userElement.innerHTML = `
                <span class="user-dot" style="background-color: ${user.color}"></span>
                <span class="user-name">${user.username}</span>
            `;
            container.appendChild(userElement);
        });

        if (countElement) {
            countElement.textContent = this.state.activeUsers.size;
        }
    },

    getUserColor(userId) {
        if (!userId || userId === 'undefined') return '#999999';
        const colors = ['#FF6B6B', '#4ECDC4', '#FFD166', '#06D6A0', '#118AB2', '#EF476F', '#7209B7'];
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            hash = userId.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    },

    // ===== GESTION ÉVÉNEMENTS WEBSOCKET =====

    handlePadJoined(data) {
        if (data.pad) {
            this.state.currentPad = data.pad;
            this.state.buffer.content = data.pad.content || '';
            this.updateUI();
        }

        if (data.activeUsers && Array.isArray(data.activeUsers)) {
            data.activeUsers.forEach(user => {
                if (user && user.id) {
                    this.state.activeUsers.set(user.id, {
                        username: user.username || 'User',
                        color: this.getUserColor(user.id)
                    });
                }
            });
            this.updateActiveUsers();
        }
    },

    handlePadUpdate(data) {
        if (data.userId === window.state.user?.id) return;

        if (data.type === 'content_changed' && data.content !== undefined) {
            this.state.buffer.content = data.content;
            const textarea = document.getElementById('padTextarea');
            if (textarea) {
                // Sauvegarder la position du curseur
                const cursorPos = textarea.selectionStart;
                const scrollTop = textarea.scrollTop;
                
                // Mettre à jour le contenu
                textarea.value = data.content;
                
                // Restaurer la position
                textarea.selectionStart = textarea.selectionEnd = cursorPos;
                textarea.scrollTop = scrollTop;
            }
        }
    },

    handleUserJoined(data) {
        if (data.userId) {
            this.state.activeUsers.set(data.userId, {
                username: data.username || 'User',
                color: this.getUserColor(data.userId)
            });
            this.updateActiveUsers();
        }
    },

    handleUserLeft(data) {
        if (data.userId) {
            this.state.activeUsers.delete(data.userId);
            this.updateActiveUsers();
            
            const cursor = document.getElementById(`cursor-${data.userId}`);
            if (cursor) cursor.remove();
        }
    },

    handleError(data) {
        console.error("❌ Erreur Pad:", data.error);
        this.showMessage(`Pad: ${data.error}`, "error");
    },

    // ===== FONCTIONNALITÉS =====

    async clearPad() {
        if (!window.state?.currentConversation) return;

        try {
            const backendUrl = window.CONFIG?.BACKEND_URL || 'http://localhost:5000';
            
            await fetch(
                `${backendUrl}/api/pads/${window.state.currentConversation._id}/content`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.state.token}`
                    },
                    body: JSON.stringify({ content: '' })
                }
            );
            
            this.state.buffer.content = '';
            const textarea = document.getElementById('padTextarea');
            if (textarea) {
                textarea.value = '';
                this.sendCursorImmediate();
            }

            this.showMessage("Pad vidé avec succès", "success");
        } catch (error) {
            console.error("❌ Erreur vidage:", error);
            this.showMessage("Erreur lors du vidage", "error");
        }
    },

    // ===== UTILITAIRES =====

    showMessage(message, type = 'info', duration = 3000) {
        if (typeof window.showMessage === 'function') {
            window.showMessage(message, type, duration);
        } else {
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    },

    onFocus() {
        this.sendCursorImmediate();
    },

    onBlur() {
        // Rien pour l'instant
    }
};

// Initialisation
(function initPadSystem() {
    if (document.readyState === 'complete') {
        setTimeout(() => PadSystem.init(), 500);
    } else {
        window.addEventListener('load', () => {
            setTimeout(() => PadSystem.init(), 500);
        });
    }
})();

// Export global
window.PadSystem = PadSystem;
window.openPad = () => PadSystem.open();
window.closePad = () => PadSystem.close();

console.log("✅ Système Pad avec curseurs Google Docs chargé !");