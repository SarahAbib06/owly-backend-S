// ===== SYSTÈME PAD AVANCÉ V3 - COMPLET ET CORRIGÉ =====
const PadSystem = {
    // Configuration
    config: {
        SAVE_DELAY: 800,
        CURSOR_UPDATE_INTERVAL: 1500,
        OPERATION_BUFFER_SIZE: 20
    },

    // État interne
    state: {
        isOpen: false,
        mode: 'text',
        canEdit: true,
        accessLevel: 'edit',
        currentPad: null,
        activeUsers: new Map(),
        cursorInterval: null,
        saveTimeout: null,
        buffer: {
            content: '',
            operations: [],
            lastSaved: Date.now()
        }
    },

    // Initialisation
    init() {
        console.log("🚀 Initialisation du système Pad avancé v3");
        
        // Attendre que le DOM soit complètement chargé
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => this.initializeAfterDOM(), 100);
            });
        } else {
            setTimeout(() => this.initializeAfterDOM(), 100);
        }
    },

    // Initialisation après chargement du DOM
    initializeAfterDOM() {
        console.log("🔗 Liaison des événements Pad...");
        
        // 1. Liaison des événements DOM
        this.bindEvents();
        
        // 2. Configuration des raccourcis
        this.setupShortcuts();
        
        // 3. Liaison des événements WebSocket (avec délai)
        setTimeout(() => this.bindSocketEventsWhenReady(), 500);
        
        console.log("✅ Système Pad initialisé");
    },

    // Liaison des événements DOM
    bindEvents() {
        // Bouton d'ouverture du Pad
        const padBtn = document.getElementById('padBtn');
        if (padBtn) {
            padBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("🎯 Clic sur padBtn détecté");
                this.open();
            });
        } else {
            console.warn("⚠️ Bouton padBtn non trouvé");
        }
        
        // Bouton de fermeture
        const closeBtn = document.getElementById('closePadModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        // Boutons d'actions du Pad
        document.getElementById('toggleModeBtn')?.addEventListener('click', () => this.toggleMode());
        document.getElementById('clearPadBtn')?.addEventListener('click', () => this.clear());
        document.getElementById('padHistoryBtn')?.addEventListener('click', () => this.showHistory());
        document.getElementById('padPreferencesBtn')?.addEventListener('click', () => this.showPreferences());
        document.getElementById('padSearchBtn')?.addEventListener('click', () => this.search());
        document.getElementById('padSuggestionsBtn')?.addEventListener('click', () => this.toggleSuggestions());

        // Événements de l'éditeur
        const textarea = document.getElementById('padTextarea');
        if (textarea) {
            textarea.addEventListener('input', (e) => this.handleInput(e));
            textarea.addEventListener('keydown', (e) => this.handleKeyDown(e));
            textarea.addEventListener('click', () => this.sendCursor());
            textarea.addEventListener('keyup', () => this.sendCursor());
            textarea.addEventListener('focus', () => this.onFocus());
            textarea.addEventListener('blur', () => this.onBlur());
        }
    },

    // Liaison des événements WebSocket avec vérification
    bindSocketEventsWhenReady() {
        const checkSocket = () => {
            // Vérifier si l'objet state et le socket existent
            if (window.state && window.state.socket && window.state.socket.connected) {
                console.log("📡 WebSocket connecté, liaison des événements Pad...");
                this.bindSocketEvents();
            } else {
                console.log("⏳ WebSocket pas encore prêt, nouvelle tentative dans 500ms...");
                setTimeout(checkSocket, 500);
            }
        };
        
        checkSocket();
    },

    // Liaison des événements WebSocket
    bindSocketEvents() {
        if (!window.state || !window.state.socket) {
            console.warn("⚠️ state ou socket non disponible");
            return;
        }

        const socket = window.state.socket;
        
        socket.on('pad_joined', (data) => {
            console.log("📝 Pad rejoint via WebSocket:", data);
            this.handlePadJoined(data);
        });
        
        socket.on('pad_update', (data) => this.handlePadUpdate(data));
        socket.on('pad_error', (data) => this.handleError(data));
        socket.on('pad_user_joined', (data) => this.handleUserJoined(data));
        socket.on('pad_user_left', (data) => this.handleUserLeft(data));
        socket.on('pad_user_cursor', (data) => this.handleRemoteCursor(data));
        socket.on('pad_saved', () => this.handleSaved());
        socket.on('pad_change_acknowledged', (data) => this.handleAck(data));
        
        console.log("✅ Événements WebSocket Pad liés");
    },

    // Raccourcis clavier
    setupShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (!this.state.isOpen) return;

            // Ctrl+S : Sauvegarder
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.flushBuffer();
            }

            // Ctrl+F : Rechercher
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                this.search();
            }

            // Ctrl+H : Historique
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault();
                this.showHistory();
            }

            // Ctrl+M : Changer de mode
            if (e.ctrlKey && e.key === 'm') {
                e.preventDefault();
                this.toggleMode();
            }

            // Ctrl+[ : Basculer tâche Todo
            if (e.ctrlKey && e.key === '[') {
                e.preventDefault();
                this.toggleTodoAtCursor();
            }
        });
    },

    // ===== GESTION DU PAD =====

    async open() {
        console.log("📝 Tentative d'ouverture du Pad...");
        
        // Vérifier les prérequis
        if (!window.state || !window.state.currentConversation?._id) {
            console.error("❌ Pas de conversation sélectionnée");
            showMessage("Sélectionnez une conversation d'abord", "warning");
            return;
        }

        if (!window.state.token) {
            console.error("❌ Pas de token d'authentification");
            showMessage("Vous devez être connecté", "error");
            return;
        }

        try {
            showMessage("Chargement du Pad...", "info");

            // URL du backend
            const backendUrl = window.CONFIG?.BACKEND_URL || 'http://localhost:5000';
            const conversationId = window.state.currentConversation._id;
            
            console.log(`📤 Requête vers: ${backendUrl}/api/pads/${conversationId}`);

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
                    showMessage("Session expirée. Veuillez vous reconnecter.", "error");
                    return;
                }
                
                const errorText = await response.text();
                console.error(`❌ Erreur HTTP ${response.status}:`, errorText);
                throw new Error(`Erreur serveur: ${response.status}`);
            }

            const data = await response.json();
            console.log("📦 Données Pad reçues:", data);

            if (!data.success || !data.pad) {
                throw new Error(data.error || "Erreur lors du chargement du Pad");
            }

            // Initialiser l'état
            this.state.currentPad = data.pad;
            this.state.mode = data.pad.mode || 'text';
            this.state.canEdit = data.pad.canEdit !== false;
            this.state.accessLevel = data.pad.accessLevel || 'edit';
            this.state.buffer.content = data.pad.content || '';
            this.state.buffer.operations = [];

            // Afficher le modal
            this.showModal();

            // Rejoindre via WebSocket
            if (window.state.socket && window.state.socket.connected) {
                console.log("📡 Emission join_pad via WebSocket");
                window.state.socket.emit('join_pad', conversationId);
            } else {
                console.warn("⚠️ WebSocket non disponible pour rejoindre le pad");
            }

            showMessage("✅ Pad chargé avec succès!", "success");

        } catch (error) {
            console.error("❌ Erreur ouverture Pad:", error);
            
            let userMessage = "Erreur lors du chargement du Pad";
            if (error.message.includes("Failed to fetch")) {
                userMessage = "Impossible de se connecter au serveur";
            }

            showMessage(userMessage, "error");
            
            // Fallback mode hors ligne
            this.createLocalFallback();
        }
    },

    showModal() {
        console.log("🪟 Affichage du modal Pad...");
        
        const modal = document.getElementById('padModal');
        if (!modal) {
            console.error("❌ Modal Pad non trouvé dans le DOM");
            showMessage("Erreur: modal Pad introuvable", "error");
            return;
        }

        modal.style.display = 'flex';
        this.state.isOpen = true;

        // Mettre à jour l'interface
        this.updateUI();

        // Focus sur l'éditeur avec un délai
        setTimeout(() => {
            const textarea = document.getElementById('padTextarea');
            if (textarea) {
                textarea.focus();
                textarea.selectionStart = textarea.value.length;
                console.log("🎯 Focus appliqué sur le textarea");
            }
        }, 150);

        // Démarrer le suivi du curseur
        this.startCursorTracking();
        
        console.log("✅ Modal Pad affiché");
    },

    createLocalFallback() {
        console.log("🔄 Création d'un Pad local...");
        
        this.state.currentPad = {
            _id: `local_${Date.now()}`,
            content: "",
            mode: "text",
            version: 1,
            stats: { completed: 0, total: 0, assigned: 0, overdue: 0, progress: 0 },
            preferences: { theme: "auto", fontSize: 14 }
        };

        this.state.buffer.content = "";
        this.showModal();
        
        showMessage("⚠️ Mode hors ligne activé", "warning");
    },

    close() {
        console.log("🔒 Fermeture du Pad...");
        
        const modal = document.getElementById('padModal');
        if (modal) {
            modal.style.display = 'none';
        }

        // Quitter la room WebSocket
        if (window.state?.socket && window.state?.currentConversation) {
            window.state.socket.emit('leave_pad', window.state.currentConversation._id);
        }

        // Sauvegarder les dernières modifications
        if (this.state.buffer.operations.length > 0) {
            this.flushBuffer();
        }

        // Nettoyer
        this.cleanup();
        
        this.state.isOpen = false;
        console.log("✅ Pad fermé");
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
        this.state.buffer.operations = [];
        
        // Supprimer tous les curseurs distants
        document.querySelectorAll('.remote-cursor').forEach(el => el.remove());
    },

    // ===== GESTION DE L'ÉDITION =====

    handleInput(e) {
        if (!this.state.canEdit) return;

        const newContent = e.target.value;
        const oldContent = this.state.buffer.content;

        const operation = this.calculateOperation(oldContent, newContent, e.target.selectionStart);
        if (!operation) return;

        // Mettre à jour le buffer local
        this.state.buffer.content = newContent;
        
        // Ajouter l'opération au buffer
        this.state.buffer.operations.push({
            ...operation,
            clientId: this.generateClientId(),
            timestamp: Date.now(),
            authorId: window.state.user?.id
        });

        // Limiter la taille du buffer
        if (this.state.buffer.operations.length > this.config.OPERATION_BUFFER_SIZE) {
            this.state.buffer.operations.shift();
        }

        // Envoyer en temps réel via WebSocket
        if (window.state?.socket && window.state.socket.connected && window.state.currentConversation) {
            window.state.socket.emit('pad_content_change', {
                conversationId: window.state.currentConversation._id,
                content: newContent,
                mode: this.state.mode,
                operation: operation
            });
        }

        // Programmer la sauvegarde
        this.scheduleSave();

        // Mettre à jour les stats si mode Todo
        if (this.state.mode === 'todo') {
            this.updateTodoStats();
        }
    },

    calculateOperation(oldContent, newContent, cursorPos) {
        if (oldContent === newContent) return null;

        let start = 0;
        const minLength = Math.min(oldContent.length, newContent.length);
        
        // Trouver le début de la différence
        while (start < minLength && oldContent[start] === newContent[start]) {
            start++;
        }

        // Trouver la fin de la différence
        let oldEnd = oldContent.length - 1;
        let newEnd = newContent.length - 1;
        
        while (oldEnd >= start && newEnd >= start && 
               oldContent[oldEnd] === newContent[newEnd]) {
            oldEnd--;
            newEnd--;
        }

        const deletedLength = oldEnd - start + 1;
        const insertedText = newContent.substring(start, newEnd + 1);

        if (insertedText.length > 0 && deletedLength === 0) {
            return {
                type: 'insert',
                position: start,
                text: insertedText,
                length: insertedText.length
            };
        }

        if (deletedLength > 0 && insertedText.length === 0) {
            return {
                type: 'delete',
                position: start,
                length: deletedLength
            };
        }

        if (insertedText.length > 0 && deletedLength > 0) {
            return {
                type: 'replace',
                position: start,
                text: insertedText,
                length: deletedLength
            };
        }

        return null;
    },

    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    scheduleSave() {
        if (this.state.saveTimeout) {
            clearTimeout(this.state.saveTimeout);
        }

        this.state.saveTimeout = setTimeout(() => {
            this.flushBuffer();
        }, this.config.SAVE_DELAY);
    },

    async flushBuffer() {
        if (!this.state.currentPad || this.state.buffer.operations.length === 0) {
            return;
        }

        if (!window.state?.currentConversation || !window.state?.token) {
            console.warn("⚠️ Impossible de sauvegarder: pas de conversation ou token");
            return;
        }

        try {
            const backendUrl = window.CONFIG?.BACKEND_URL || 'http://localhost:5000';
            
            const response = await fetch(
                `${backendUrl}/api/pads/${window.state.currentConversation._id}/content`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.state.token}`
                    },
                    body: JSON.stringify({
                        content: this.state.buffer.content,
                        mode: this.state.mode,
                        operations: this.state.buffer.operations.slice(-3), // Envoyer seulement les 3 dernières opérations
                        buffer: "true"
                    })
                }
            );

            if (response.ok) {
                this.state.buffer.operations = [];
                this.state.buffer.lastSaved = Date.now();
                console.log("💾 Buffer sauvegardé");
            }
        } catch (error) {
            console.error("❌ Erreur sauvegarde buffer:", error);
        }
    },

    handleKeyDown(e) {
        if (!this.state.canEdit) return;

        switch (e.key) {
            case 'Tab':
                e.preventDefault();
                this.handleTab(e.target);
                break;

            case 'Enter':
                if (this.state.mode === 'todo' && e.target.value.trim()) {
                    this.handleTodoEnter(e.target);
                }
                break;
        }
    },

    handleTab(textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        
        // Insérer une tabulation
        const newValue = textarea.value.substring(0, start) + '\t' + 
                         textarea.value.substring(end);
        
        textarea.value = newValue;
        textarea.selectionStart = textarea.selectionEnd = start + 1;
        
        // Déclencher l'événement input
        textarea.dispatchEvent(new Event('input'));
    },

    handleTodoEnter(textarea) {
        const start = textarea.selectionStart;
        const value = textarea.value;
        
        // Trouver le début de la ligne
        let lineStart = start;
        while (lineStart > 0 && value[lineStart - 1] !== '\n') {
            lineStart--;
        }
        
        // Trouver la fin de la ligne
        let lineEnd = start;
        while (lineEnd < value.length && value[lineEnd] !== '\n') {
            lineEnd++;
        }
        
        const line = value.substring(lineStart, lineEnd);
        
        // Vérifier si c'est une ligne todo
        const todoMatch = line.match(/^(\s*)([☐✔☑□✓■▢]|\[[ xX]?\])\s+/);
        
        if (todoMatch) {
            const indent = todoMatch[1];
            const checkbox = todoMatch[2];
            
            // Insérer une nouvelle ligne avec la même indentation
            const newLine = `\n${indent}${checkbox} `;
            const newValue = value.substring(0, lineEnd) + newLine + value.substring(lineEnd);
            
            textarea.value = newValue;
            textarea.selectionStart = textarea.selectionEnd = lineEnd + newLine.length;
            
            // Déclencher l'input
            textarea.dispatchEvent(new Event('input'));
        }
    },

    // ===== MISE À JOUR DE L'INTERFACE =====

    updateUI() {
        const textarea = document.getElementById('padTextarea');
        const modeBtn = document.getElementById('toggleModeBtn');
        const statsContainer = document.getElementById('padStats');
        const clearBtn = document.getElementById('clearPadBtn');

        if (textarea) {
            textarea.value = this.state.buffer.content;
            textarea.disabled = !this.state.canEdit;
            
            // Appliquer le mode
            if (this.state.mode === 'todo') {
                textarea.classList.add('todo-mode');
            } else {
                textarea.classList.remove('todo-mode');
            }
        }

        if (modeBtn) {
            if (this.state.mode === 'text') {
                modeBtn.innerHTML = '<i class="fas fa-check-square"></i> Mode To-Do';
                modeBtn.title = "Basculer en mode To-Do";
            } else {
                modeBtn.innerHTML = '<i class="fas fa-font"></i> Mode Texte';
                modeBtn.title = "Basculer en mode Texte";
            }
            modeBtn.disabled = !this.state.canEdit;
        }

        if (clearBtn) {
            clearBtn.disabled = !this.state.canEdit;
        }

        // Afficher/masquer les stats
        if (statsContainer) {
            if (this.state.mode === 'todo' && this.state.currentPad?.stats) {
                statsContainer.style.display = 'block';
                this.updateStats(this.state.currentPad.stats);
            } else {
                statsContainer.style.display = 'none';
            }
        }

        // Appliquer les préférences
        this.applyPreferences();

        // Mettre à jour la liste des utilisateurs
        this.updateActiveUsers();
    },

    updateStats(stats) {
        const elements = {
            completed: document.getElementById('completedCount'),
            total: document.getElementById('totalCount'),
            assigned: document.getElementById('assignedCount'),
            overdue: document.getElementById('overdueCount'),
            progress: document.getElementById('progressFill')
        };

        if (elements.completed) elements.completed.textContent = stats.completed || 0;
        if (elements.total) elements.total.textContent = stats.total || 0;
        if (elements.assigned) elements.assigned.textContent = stats.assigned || 0;
        if (elements.overdue) elements.overdue.textContent = stats.overdue || 0;
        if (elements.progress && stats.total > 0) {
            const progress = ((stats.completed || 0) / stats.total) * 100;
            elements.progress.style.width = `${progress}%`;
        }
    },

    updateTodoStats() {
        if (this.state.mode !== 'todo') return;

        const content = this.state.buffer.content;
        const lines = content.split('\n');
        
        let completed = 0;
        let total = 0;
        
        lines.forEach(line => {
            if (line.match(/^(\s*)([✔☑✓]|\[[xX]\])/)) {
                completed++;
                total++;
            } else if (line.match(/^(\s*)([☐□▢]|\[\s\])/)) {
                total++;
            }
        });

        // Mettre à jour les stats localement
        if (this.state.currentPad) {
            this.state.currentPad.stats = {
                completed,
                total,
                progress: total > 0 ? Math.round((completed / total) * 100) : 0
            };
            this.updateStats(this.state.currentPad.stats);
        }
    },

    applyPreferences() {
        const prefs = this.state.currentPad?.preferences || {};
        const textarea = document.getElementById('padTextarea');
        
        if (!textarea) return;

        // Taille de police
        textarea.style.fontSize = `${prefs.fontSize || 14}px`;

        // Thème
        if (prefs.theme === 'dark') {
            textarea.classList.add('dark-theme');
            textarea.classList.remove('light-theme');
        } else if (prefs.theme === 'light') {
            textarea.classList.add('light-theme');
            textarea.classList.remove('dark-theme');
        } else {
            // Auto: utiliser la préférence système
            textarea.classList.remove('dark-theme', 'light-theme');
        }
    },

    // ===== GESTION DES UTILISATEURS =====

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
        const colors = [
            '#FF6B6B', '#4ECDC4', '#FFD166', '#06D6A0',
            '#118AB2', '#EF476F', '#7209B7', '#073B4C',
            '#FF9A76', '#A3DE83', '#2EB872', '#00BBF0'
        ];
        
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            hash = userId.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        return colors[Math.abs(hash) % colors.length];
    },

    // ===== CURSEURS DISTANTS =====

    sendCursor() {
        if (!this.state.isOpen || !window.state?.socket || !window.state.socket.connected) return;
        
        const textarea = document.getElementById('padTextarea');
        if (!textarea) return;

        window.state.socket.emit('pad_cursor_move', {
            conversationId: window.state.currentConversation._id,
            position: textarea.selectionStart,
            selection: {
                start: textarea.selectionStart,
                end: textarea.selectionEnd
            }
        });
    },

    startCursorTracking() {
        if (this.state.cursorInterval) {
            clearInterval(this.state.cursorInterval);
        }

        this.state.cursorInterval = setInterval(() => {
            this.sendCursor();
        }, this.config.CURSOR_UPDATE_INTERVAL);
    },

    handleRemoteCursor(data) {
        if (data.userId === window.state.user?.id) return;

        let cursor = document.getElementById(`cursor-${data.userId}`);
        if (!cursor) {
            cursor = this.createRemoteCursor(data.userId, data.username);
        }

        // Positionner le curseur (approximation)
        const textarea = document.getElementById('padTextarea');
        if (textarea) {
            const charWidth = 8.5; // Largeur approximative d'un caractère
            cursor.style.left = `${data.position * charWidth}px`;
        }

        // Afficher temporairement
        cursor.style.opacity = '1';
        cursor.dataset.lastUpdate = Date.now();

        // Masquer après 3 secondes d'inactivité
        clearTimeout(cursor.hideTimeout);
        cursor.hideTimeout = setTimeout(() => {
            cursor.style.opacity = '0';
        }, 3000);
    },

    createRemoteCursor(userId, username) {
        const cursor = document.createElement('div');
        cursor.id = `cursor-${userId}`;
        cursor.className = 'remote-cursor';
        cursor.style.cssText = `
            position: absolute;
            top: 2px;
            width: 2px;
            height: 20px;
            background-color: ${this.getUserColor(userId)};
            z-index: 1000;
            pointer-events: none;
            transition: opacity 0.3s;
            opacity: 0;
        `;

        const label = document.createElement('div');
        label.className = 'cursor-label';
        label.textContent = username;
        label.style.cssText = `
            position: absolute;
            top: -20px;
            left: 0;
            background-color: ${this.getUserColor(userId)};
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            white-space: nowrap;
        `;

        cursor.appendChild(label);
        document.querySelector('.pad-editor-container').appendChild(cursor);

        return cursor;
    },

    // ===== GESTION DES ÉVÉNEMENTS WEBSOCKET =====

    handlePadJoined(data) {
        console.log("📝 Pad rejoint:", data);
        
        if (data.pad) {
            this.state.currentPad = data.pad;
            this.state.mode = data.pad.mode || 'text';
            this.state.buffer.content = data.pad.content || '';
            
            this.updateUI();
        }

        // Mettre à jour les utilisateurs actifs
        if (data.activeUsers) {
            data.activeUsers.forEach(user => {
                this.state.activeUsers.set(user.id, {
                    username: user.username,
                    color: this.getUserColor(user.id)
                });
            });
            this.updateActiveUsers();
        }
    },

    handlePadUpdate(data) {
        if (data.userId === window.state.user?.id) return;

        console.log("📝 Mise à jour Pad reçue:", data);

        switch (data.type) {
            case 'content_changed':
                if (data.content !== undefined) {
                    this.state.buffer.content = data.content;
                    const textarea = document.getElementById('padTextarea');
                    if (textarea) {
                        textarea.value = data.content;
                    }
                }
                break;

            case 'mode_changed':
                this.state.mode = data.mode;
                if (data.content) {
                    this.state.buffer.content = data.content;
                    const textarea = document.getElementById('padTextarea');
                    if (textarea) {
                        textarea.value = data.content;
                    }
                }
                this.updateUI();
                break;

            case 'item_toggled':
                this.updateTodoStats();
                break;

            case 'preferences_updated':
                if (this.state.currentPad) {
                    this.state.currentPad.preferences = data.preferences;
                    this.applyPreferences();
                }
                break;

            case 'cleared':
                this.state.buffer.content = '';
                const textarea = document.getElementById('padTextarea');
                if (textarea) {
                    textarea.value = '';
                }
                break;
        }
    },

    handleUserJoined(data) {
        this.state.activeUsers.set(data.userId, {
            username: data.username,
            color: this.getUserColor(data.userId),
            joinedAt: Date.now()
        });
        this.updateActiveUsers();
    },

    handleUserLeft(data) {
        this.state.activeUsers.delete(data.userId);
        this.updateActiveUsers();
        
        // Supprimer le curseur
        const cursor = document.getElementById(`cursor-${data.userId}`);
        if (cursor) {
            cursor.remove();
        }
    },

    handleError(data) {
        console.error("❌ Erreur Pad:", data.error);
        showMessage(`Pad: ${data.error}`, "error");
    },

    handleSaved() {
        console.log("💾 Pad sauvegardé sur le serveur");
        this.state.buffer.lastSaved = Date.now();
    },

    handleAck(data) {
        console.log("✅ Changement Pad accepté:", data);
    },

    // ===== FONCTIONNALITÉS AVANCÉES =====

    async toggleMode() {
        if (!window.state?.currentConversation || !this.state.canEdit) {
            return showMessage("Vous n'avez pas la permission", "warning");
        }

        const newMode = this.state.mode === 'text' ? 'todo' : 'text';

        try {
            const backendUrl = window.CONFIG?.BACKEND_URL || 'http://localhost:5000';
            
            const response = await fetch(
                `${backendUrl}/api/pads/${window.state.currentConversation._id}/toggle-mode`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.state.token}`
                    },
                    body: JSON.stringify({ mode: newMode })
                }
            );

            const data = await response.json();

            if (response.ok && data.success) {
                this.state.mode = newMode;
                
                if (data.content) {
                    this.state.buffer.content = data.content;
                    const textarea = document.getElementById('padTextarea');
                    if (textarea) {
                        textarea.value = data.content;
                    }
                }

                if (data.stats) {
                    this.state.currentPad.stats = data.stats;
                }

                this.updateUI();
                
                // Notifier via WebSocket
                if (window.state.socket) {
                    window.state.socket.emit('pad_change_mode', {
                        conversationId: window.state.currentConversation._id,
                        mode: newMode
                    });
                }

                showMessage(`Mode ${newMode === 'todo' ? 'To-Do' : 'Texte'} activé`, "success");
            } else {
                throw new Error(data.error || "Erreur changement de mode");
            }
        } catch (error) {
            console.error("❌ Erreur toggle mode:", error);
            showMessage("Erreur: " + error.message, "error");
        }
    },

    async clear() {
        if (!window.state?.currentConversation || !this.state.canEdit) {
            return showMessage("Vous n'avez pas la permission", "warning");
        }

        if (!confirm("Voulez-vous vraiment vider tout le contenu du Pad ?")) {
            return;
        }

        try {
            const backendUrl = window.CONFIG?.BACKEND_URL || 'http://localhost:5000';
            
            const response = await fetch(
                `${backendUrl}/api/pads/${window.state.currentConversation._id}/clear`,
                {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${window.state.token}` }
                }
            );

            const data = await response.json();

            if (response.ok && data.success) {
                this.state.buffer.content = '';
                const textarea = document.getElementById('padTextarea');
                if (textarea) {
                    textarea.value = '';
                }

                // Notifier via WebSocket
                if (window.state.socket) {
                    window.state.socket.emit('pad_quick_command', {
                        conversationId: window.state.currentConversation._id,
                        command: 'clear'
                    });
                }

                showMessage("Pad vidé avec succès", "success");
            }
        } catch (error) {
            console.error("❌ Erreur vidage:", error);
            showMessage("Erreur lors du vidage", "error");
        }
    },

    toggleTodoAtCursor() {
        const textarea = document.getElementById('padTextarea');
        if (!textarea) return;

        const start = textarea.selectionStart;
        const value = textarea.value;

        // Trouver la ligne
        let lineStart = start;
        while (lineStart > 0 && value[lineStart - 1] !== '\n') {
            lineStart--;
        }

        let lineEnd = start;
        while (lineEnd < value.length && value[lineEnd] !== '\n') {
            lineEnd++;
        }

        const line = value.substring(lineStart, lineEnd);

        // Basculer la checkbox
        const newLine = this.toggleTodoCheckbox(line);
        
        if (newLine !== line) {
            const newValue = value.substring(0, lineStart) + newLine + value.substring(lineEnd);
            textarea.value = newValue;
            textarea.dispatchEvent(new Event('input'));

            // Notifier le serveur
            if (window.state.socket) {
                const lineIndex = (value.substring(0, lineStart).match(/\n/g) || []).length;
                const completed = newLine.includes('[x]') || newLine.includes('✔') || newLine.includes('✓');
                
                window.state.socket.emit('pad_toggle_item', {
                    conversationId: window.state.currentConversation._id,
                    lineIndex: lineIndex,
                    completed: completed
                });
            }
        }
    },

    toggleTodoCheckbox(line) {
        const checkboxPairs = [
            ['☐', '✔'],
            ['[ ]', '[x]'],
            ['□', '✓'],
            ['▢', '■']
        ];

        for (const [unchecked, checked] of checkboxPairs) {
            if (line.includes(unchecked)) {
                return line.replace(unchecked, checked);
            }
            if (line.includes(checked)) {
                return line.replace(checked, unchecked);
            }
        }

        return line;
    },

    // ===== FONCTIONS UTILITAIRES =====

    async showHistory() {
        if (!window.state?.currentConversation) return;
        
        try {
            const backendUrl = window.CONFIG?.BACKEND_URL || 'http://localhost:5000';
            
            const response = await fetch(
                `${backendUrl}/api/pads/${window.state.currentConversation._id}/history?limit=20`,
                {
                    headers: { 'Authorization': `Bearer ${window.state.token}` }
                }
            );
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                // Créer et afficher le modal d'historique
                const modal = document.getElementById('padHistoryModal') || this.createHistoryModal();
                const content = document.getElementById('padHistoryContent');
                
                if (content) {
                    content.innerHTML = data.history.map(version => `
                        <div class="pad-history-item" onclick="PadSystem.restoreVersion(${version.version})">
                            <div class="pad-history-header">
                                <span class="pad-history-version">Version ${version.version}</span>
                                <span class="pad-history-date">${new Date(version.updatedAt).toLocaleString()}</span>
                            </div>
                            <div class="pad-history-preview">
                                ${version.content.substring(0, 200)}${version.content.length > 200 ? '...' : ''}
                            </div>
                        </div>
                    `).join('');
                }
                
                modal.style.display = 'flex';
            }
        } catch (error) {
            console.error("❌ Erreur historique:", error);
            showMessage("Erreur chargement historique", "error");
        }
    },

    createHistoryModal() {
        const modal = document.createElement('div');
        modal.id = 'padHistoryModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Historique du Pad</h3>
                    <button class="modal-close" onclick="PadSystem.closeHistoryModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div id="padHistoryContent" class="pad-history-content"></div>
                </div>
                <div class="modal-footer">
                    <button onclick="PadSystem.closeHistoryModal()" class="btn btn-secondary">Fermer</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        return modal;
    },

    async restoreVersion(versionIndex) {
        if (!window.state?.currentConversation || !confirm("Restaurer cette version ?")) return;
        
        try {
            const backendUrl = window.CONFIG?.BACKEND_URL || 'http://localhost:5000';
            
            const response = await fetch(
                `${backendUrl}/api/pads/${window.state.currentConversation._id}/restore`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.state.token}`
                    },
                    body: JSON.stringify({ versionIndex })
                }
            );
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                this.state.currentPad = data.pad;
                this.state.buffer.content = data.pad.content;
                
                const textarea = document.getElementById('padTextarea');
                if (textarea) {
                    textarea.value = data.pad.content;
                }
                
                this.closeHistoryModal();
                showMessage("Version restaurée !", "success");
            }
        } catch (error) {
            console.error("❌ Erreur restauration:", error);
            showMessage("Erreur restauration", "error");
        }
    },

    closeHistoryModal() {
        const modal = document.getElementById('padHistoryModal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    showPreferences() {
        const modal = document.getElementById('padPreferencesModal') || this.createPreferencesModal();
        modal.style.display = 'flex';
        
        // Remplir avec les préférences actuelles
        const prefs = this.state.currentPad?.preferences || {};
        
        const themeSelect = document.getElementById('padThemeSelect');
        const fontSizeInput = document.getElementById('padFontSize');
        const fontSizeValue = document.getElementById('fontSizeValue');
        const autoFormatCheckbox = document.getElementById('padAutoFormat');
        
        if (themeSelect) themeSelect.value = prefs.theme || 'auto';
        if (fontSizeInput) {
            fontSizeInput.value = prefs.fontSize || 14;
            if (fontSizeValue) fontSizeValue.textContent = `${prefs.fontSize || 14}px`;
        }
        if (autoFormatCheckbox) autoFormatCheckbox.checked = prefs.autoFormat !== false;
    },

    createPreferencesModal() {
        const modal = document.createElement('div');
        modal.id = 'padPreferencesModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Préférences du Pad</h3>
                    <button class="modal-close" onclick="PadSystem.closePreferencesModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="preference-group">
                        <label for="padThemeSelect">Thème :</label>
                        <select id="padThemeSelect" class="form-control">
                            <option value="auto">Auto</option>
                            <option value="light">Clair</option>
                            <option value="dark">Sombre</option>
                        </select>
                    </div>
                    
                    <div class="preference-group">
                        <label for="padFontSize">Taille de police :</label>
                        <input type="range" id="padFontSize" min="10" max="24" value="14" class="form-control">
                        <span id="fontSizeValue">14px</span>
                    </div>
                    
                    <div class="preference-group">
                        <label>
                            <input type="checkbox" id="padAutoFormat" checked>
                            Formatage automatique
                        </label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button onclick="PadSystem.savePreferences()" class="btn btn-primary">Enregistrer</button>
                    <button onclick="PadSystem.closePreferencesModal()" class="btn btn-secondary">Annuler</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Mettre à jour l'affichage de la taille de police
        const fontSizeInput = document.getElementById('padFontSize');
        const fontSizeValue = document.getElementById('fontSizeValue');
        
        if (fontSizeInput && fontSizeValue) {
            fontSizeInput.addEventListener('input', () => {
                fontSizeValue.textContent = `${fontSizeInput.value}px`;
            });
        }
        
        return modal;
    },

    async savePreferences() {
        if (!window.state?.currentConversation) return;
        
        const themeSelect = document.getElementById('padThemeSelect');
        const fontSizeInput = document.getElementById('padFontSize');
        const autoFormatCheckbox = document.getElementById('padAutoFormat');
        
        const preferences = {
            theme: themeSelect?.value || 'auto',
            fontSize: parseInt(fontSizeInput?.value) || 14,
            autoFormat: autoFormatCheckbox?.checked !== false
        };
        
        try {
            const backendUrl = window.CONFIG?.BACKEND_URL || 'http://localhost:5000';
            
            const response = await fetch(
                `${backendUrl}/api/pads/${window.state.currentConversation._id}/preferences`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.state.token}`
                    },
                    body: JSON.stringify({ preferences })
                }
            );
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                if (this.state.currentPad) {
                    this.state.currentPad.preferences = data.preferences;
                }
                
                this.applyPreferences();
                this.closePreferencesModal();
                
                // Notifier via WebSocket
                if (window.state.socket) {
                    window.state.socket.emit('pad_change_preferences', {
                        conversationId: window.state.currentConversation._id,
                        preferences: data.preferences
                    });
                }
                
                showMessage("Préférences enregistrées !", "success");
            }
        } catch (error) {
            console.error("❌ Erreur préférences:", error);
            showMessage("Erreur enregistrement préférences", "error");
        }
    },

    closePreferencesModal() {
        const modal = document.getElementById('padPreferencesModal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    search() {
        const searchTerm = prompt("Rechercher dans le Pad :");
        if (!searchTerm) return;
        
        const textarea = document.getElementById('padTextarea');
        if (!textarea) return;
        
        const content = textarea.value;
        const searchRegex = new RegExp(searchTerm, 'gi');
        const matches = content.match(searchRegex);
        
        if (!matches || matches.length === 0) {
            showMessage("Aucun résultat trouvé", "info");
            return;
        }
        
        // Mettre en surbrillance
        const highlighted = content.replace(searchRegex, match => `<mark>${match}</mark>`);
        
        // Afficher les résultats
        const results = document.createElement('div');
        results.className = 'search-results';
        results.innerHTML = `
            <h4>${matches.length} résultat(s) trouvé(s)</h4>
            <div class="search-result-content">${highlighted.replace(/\n/g, '<br>')}</div>
        `;
        
        showMessage(results.innerHTML, "info", 5000);
    },

    toggleSuggestions() {
        const panel = document.getElementById('padSuggestionsPanel');
        if (panel) {
            const isVisible = panel.style.display !== 'none';
            panel.style.display = isVisible ? 'none' : 'block';
            showMessage(`Suggestions ${isVisible ? 'désactivées' : 'activées'}`, "info");
        }
    },

    onFocus() {
        console.log("🎯 Pad focus");
    },

    onBlur() {
        console.log("🎯 Pad blur");
    },

    heartbeat() {
        return window.state?.socket && window.state.socket.connected;
    }
};

// Initialisation automatique
(function initPadSystem() {
    console.log("🦉 Initialisation du système Pad...");
    
    // Attendre que tout soit chargé
    if (document.readyState === 'complete') {
        setTimeout(() => {
            PadSystem.init();
        }, 500);
    } else {
        window.addEventListener('load', () => {
            setTimeout(() => {
                PadSystem.init();
            }, 500);
        });
    }
})();

// Export global
window.PadSystem = PadSystem;
window.openPad = () => PadSystem.open();
window.closePad = () => PadSystem.close();
window.togglePadMode = () => PadSystem.toggleMode();
window.changePadMode = () => PadSystem.toggleMode();
window.clearPad = () => PadSystem.clear();
window.searchInPad = () => PadSystem.search();
window.showPadHistory = () => PadSystem.showHistory();
window.showPadPreferences = () => PadSystem.showPreferences();
window.savePadPreferences = () => PadSystem.savePreferences();
window.restorePadVersion = (version) => PadSystem.restoreVersion(version);
window.closePadHistoryModal = () => PadSystem.closeHistoryModal();
window.closePadPreferencesModal = () => PadSystem.closePreferencesModal();
window.toggleSuggestions = () => PadSystem.toggleSuggestions();
window.padHeartbeat = () => PadSystem.heartbeat();
window.onPadFocus = () => PadSystem.onFocus();
window.onPadBlur = () => PadSystem.onBlur();

console.log("✅ Système Pad V3 chargé et prêt !");