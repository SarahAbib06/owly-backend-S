// ===== GESTION DES CONVERSATIONS =====
function initConversations() {
    console.log("✅ Conversations initialisées");
}

async function loadConversations() {
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/conversations`, {
            headers: { Authorization: `Bearer ${state.token}` },
        });

        const data = await response.json();

        if (response.ok && data.success) {
            state.conversations = data.conversations || [];
            renderConversations();
        } else {
            throw new Error(data.error || "Erreur de chargement des conversations");
        }
    } catch (error) {
        console.error("Load conversations error:", error);
        throw error;
    }
}

function renderConversations() {
    const contactsList = document.getElementById("contactsList");
    const conversationsContainer =
        contactsList.querySelector(".contacts-list") || contactsList;

    const existingHeader =
        conversationsContainer.querySelector(".contacts-header");
    conversationsContainer.innerHTML = "";

    if (existingHeader) {
        conversationsContainer.appendChild(existingHeader);
    } else {
        const header = document.createElement("div");
        header.className = "contacts-header";
        header.innerHTML =
            '<h3>Conversations</h3><span class="unread-count" id="totalUnread">0</span>';
        conversationsContainer.appendChild(header);
    }

    if (state.conversations.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "empty-state";
        emptyState.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #666;">
                <p>Aucune conversation</p>
                <p style="font-size: 12px; margin-top: 10px;">Commencez une nouvelle discussion</p>
            </div>
        `;
        conversationsContainer.appendChild(emptyState);
        return;
    }

    const sortedConversations = state.conversations.sort((a, b) => {
        const dateA = new Date(a.lastMessageAt || a.createdAt);
        const dateB = new Date(b.lastMessageAt || b.createdAt);
        return dateB - dateA;
    });

    sortedConversations.forEach((conversation) => {
        const contactElement = createConversationElement(conversation);
        conversationsContainer.appendChild(contactElement);
    });
}

function createConversationElement(conversation) {
    const element = document.createElement("div");
    element.className = "contact conversation-item";
    element.dataset.conversationId = conversation._id;

    const isGroup = conversation.type === "group";
    const displayName = conversation.name || "Conversation";
    const lastMessage = getLastMessagePreview(conversation);
    const unreadCount = conversation.unreadCount || 0;

    const avatarText = isGroup ? "👥" : displayName.charAt(0).toUpperCase();

    element.innerHTML = `
        <div class="contact-avatar online">${avatarText}</div>
        <div class="contact-info">
            <h3>${displayName} ${
        isGroup ? '<span class="group-badge">G</span>' : ""
    }</h3>
            <p class="last-message">${lastMessage}</p>
        </div>
        <div class="conversation-meta">
            <div class="conversation-time">${formatTime(
                conversation.lastMessageAt
            )}</div>
            ${
                unreadCount > 0
                    ? `<div class="conversation-badge">${unreadCount}</div>`
                    : ""
            }
        </div>
    `;

    element.addEventListener("click", () => selectConversation(conversation));

    return element;
}

function getLastMessagePreview(conversation) {
    if (!conversation.lastMessage) {
        return 'Aucun message';
    }
    
    if (conversation.lastMessageType === 'audio' || 
        conversation.lastMessage.includes('Message audio') ||
        (conversation.lastMessage.includes('res.cloudinary.com') && 
         (conversation.lastMessage.includes('/audio_messages/') || conversation.lastMessage.includes('.mp3')))) {
        return '🎤 Message audio';
    }
    if (conversation.lastMessageType === 'image') {
        return '📷 Image';
    }
    if (conversation.lastMessageType === 'video') {
        return '🎥 Vidéo';
    }
    if (conversation.lastMessageType === 'file') {
        return '📁 Fichier';
    }
    
    return conversation.lastMessage.length > 30 ? 
        conversation.lastMessage.substring(0, 30) + '...' : 
        conversation.lastMessage;
}

async function selectConversation(conversation) {
    if (state.isLoadingMessages) return;

    // Si c'est une conversation temporaire, on ne peut pas charger les messages
    if (conversation.temporary || conversation._id.startsWith('temp_')) {
        console.log("⚠️ Conversation temporaire - affichage seulement");
        
        // Désélectionner toutes les conversations
        document.querySelectorAll(".conversation-item").forEach(c => {
            if (c && c.classList) {
                c.classList.remove("active");
            }
        });
        
        // Sélectionner la conversation
        const conversationElement = document.querySelector(`[data-conversation-id="${conversation._id}"]`);
        if (conversationElement && conversationElement.classList) {
            conversationElement.classList.add("active");
        }
        
        state.currentConversation = conversation;
        updateChatHeader(conversation);
        
        // Afficher la zone de chat avec message d'information
        document.getElementById("welcomeMessage").style.display = "none";
        document.getElementById("messagesList").style.display = "block";
        document.getElementById("messageInputContainer").style.display = "flex";
        
        // Afficher un message d'information
        renderTemporaryConversationMessage();
        return;
    }

    // Pour les conversations réelles
    // Désélectionner toutes les conversations
    document.querySelectorAll(".conversation-item").forEach(c => {
        if (c && c.classList) {
            c.classList.remove("active");
        }
    });
    
    // Sélectionner la nouvelle
    const conversationElement = document.querySelector(`[data-conversation-id="${conversation._id}"]`);
    if (conversationElement && conversationElement.classList) {
        conversationElement.classList.add("active");
    }

    // Mettre à jour l'état
    state.currentConversation = conversation;

    // Mettre à jour l'en-tête du chat
    updateChatHeader(conversation);

    // Afficher la zone de chat
    document.getElementById("welcomeMessage").style.display = "none";
    document.getElementById("messagesList").style.display = "block";
    document.getElementById("messageInputContainer").style.display = "flex";

    // Charger les messages
    await loadMessages(conversation._id);

    // Marquer comme lu
    await markAsRead(conversation._id);

    // Rejoindre la room WebSocket
    if (getSocket() && getSocket().connected) {
        getSocket().emit("join_conversation", conversation._id);
    }
}

function renderTemporaryConversationMessage() {
    const messagesList = document.getElementById('messagesList');
    messagesList.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #666;">
            <p>💬 Nouvelle conversation</p>
            <p style="font-size: 14px; margin-top: 10px;">Envoyez un message pour démarrer la discussion</p>
            <p style="font-size: 12px; margin-top: 20px; color: #888;">
                La conversation sera créée automatiquement avec votre premier message
            </p>
        </div>
    `;
}

function updateChatHeader(conversation) {
    const isGroup = conversation.type === "group";
    const displayName = conversation.name || "Conversation";

    document.getElementById("chatHeader").style.display = "flex";
    document.getElementById("chatContactName").textContent = displayName;
    document.getElementById("chatAvatar").textContent = isGroup
        ? "👥"
        : displayName.charAt(0).toUpperCase();
    document.getElementById(
        "chatAvatar"
    ).className = `chat-contact-avatar online`;
    document.getElementById("chatContactStatus").textContent = isGroup
        ? `Groupe • ${conversation.participantCount || 0} membres`
        : "🟢 En ligne";
}

// ===== GESTION DES MESSAGES =====
async function loadMessages(conversationId, showLoader = true) {
    if (state.isLoadingMessages && !showLoader) {
        return;
    }

    state.isLoadingMessages = true;

    if (showLoader) {
        showMessageLoading(true);
    }

    try {
        console.log("📨 Chargement des messages pour la conversation:", conversationId);

        const response = await fetch(
            `${CONFIG.BACKEND_URL}/api/messages/${conversationId}?limit=100`,
            {
                headers: { Authorization: `Bearer ${state.token}` },
            }
        );

        const data = await response.json();

        if (response.ok && data.success) {
            console.log("✅ Messages reçus de l'API:", data.messages.length);

            // 🎤 ADAPTATION : Vérifier la structure des messages audio
            const processedMessages = data.messages.map(message => {
                // Si c'est un message audio mais que content est du texte, utiliser audioUrl
                if (message.typeMessage === 'audio' && message.audioUrl && message.content.includes('Message audio')) {
                    return {
                        ...message,
                        content: message.audioUrl // Remplacer par l'URL audio réelle
                    };
                }
                return message;
            });

            const sortedMessages = processedMessages.sort((a, b) => {
                const dateA = new Date(a.createdAt || a.timestamp || a.date);
                const dateB = new Date(b.createdAt || b.timestamp || b.date);
                return dateA - dateB;
            });

            state.messages.set(conversationId, sortedMessages);
            renderMessages(conversationId);
        } else {
            throw new Error(data.error || "Erreur de chargement des messages");
        }
    } catch (error) {
        console.error("Load messages error:", error);
        
        // Si c'est une erreur 500, c'est probablement une conversation temporaire
        if (conversationId.startsWith('temp_')) {
            renderTemporaryConversationMessage();
        } else {
            showMessage("Erreur de chargement des messages", "error");
        }
    } finally {
        state.isLoadingMessages = false;
        if (showLoader) {
            showMessageLoading(false);
        }
    }
}

function renderMessages(conversationId) {
    const messagesList = document.getElementById('messagesList');
    const messages = state.messages.get(conversationId) || [];
    
    console.log("🔍 Affichage de", messages.length, "messages dans l'ordre chronologique");

    messagesList.innerHTML = '';
    
    if (messages.length === 0) {
        messagesList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <p>Aucun message</p>
                <p style="font-size: 12px; margin-top: 10px;">Envoyez le premier message !</p>
            </div>
        `;
        return;
    }

    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        messagesList.appendChild(messageElement);
    });

    scrollToBottom();
}

function createMessageElement(message) {
    const element = document.createElement('div');
    const isSent = isMyMessage(message);
    
    console.log(`🎯 Création message: "${message.content?.substring(0, 50)}..." - type: ${message.typeMessage} - estDeMoi: ${isSent}`, message);

    element.className = `message ${isSent ? 'sent' : 'received'} ${message.typeMessage}-message`;
    element.dataset.messageId = message._id;
    
    const time = formatMessageTimeRobuste(message);
    const statusIcon = isSent ? (message.status === 'seen' ? '✓✓' : '✓') : '';
    
    let contentHtml = '';
    
    // 🎤 ADAPTÉ AU BACKEND : Gestion des messages audio
    if (message.typeMessage === 'audio' || 
        (message.content && message.content.includes('res.cloudinary.com') && message.content.includes('/audio_messages/')) ||
        message.audioUrl) {
        
        console.log("🎵 Message audio détecté - Structure:", message);
        
        // 🎯 DÉTERMINER LA BONNE URL AUDIO
        let audioUrl = message.audioUrl || message.content;
        let audioDuration = message.audioDuration || message.fileInfo?.audioDuration || '0:09';
        
        // 🎯 CORRECTION CLOUDINARY : S'assurer que c'est une URL valide
        if (audioUrl && audioUrl.includes('res.cloudinary.com')) {
            // Vérifier que c'est bien une URL raw/upload pour les fichiers audio
            if (audioUrl.includes('/image/upload/')) {
                audioUrl = audioUrl.replace('/image/upload/', '/raw/upload/');
            }
            // Ajouter des paramètres pour forcer le téléchargement si nécessaire
            if (!audioUrl.includes('fl_attachment')) {
                audioUrl += (audioUrl.includes('?') ? '&' : '?') + 'fl_attachment';
            }
        }
        
        console.log("🔊 URL audio finale:", audioUrl);
        
        if (audioUrl && audioUrl.includes('http')) {
            contentHtml = `
                <div class="message-content">
                    <div class="audio-message">
                        <div class="audio-icon">${isSent ? '🎤' : '🎵'}</div>
                        <div class="audio-info">
                            <div class="audio-name">${isSent ? 'Votre message audio' : 'Message audio'}</div>
                            <div class="audio-duration">${formatAudioDuration(audioDuration)}</div>
                        </div>
                        <audio controls class="audio-player" preload="metadata">
                            <source src="${audioUrl}" type="audio/webm">
                            <source src="${audioUrl}" type="audio/mpeg">
                            <source src="${audioUrl}" type="audio/wav">
                            Votre navigateur ne supporte pas la lecture audio.
                        </audio>
                    </div>
                </div>
            `;
        } else {
            // Fallback si pas d'URL valide
            contentHtml = `
                <div class="message-content">
                    <div class="audio-message">
                        <div class="audio-icon">🔇</div>
                        <div class="audio-info">
                            <div class="audio-name">Message audio</div>
                            <div class="audio-duration">${formatAudioDuration(audioDuration)}</div>
                            <div class="audio-error" style="font-size: 11px; color: #ff4444;">
                                ${audioUrl ? 'Fichier en cours de traitement...' : 'Fichier non disponible'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    } else {
        // Gestion des autres types de messages
        switch (message.typeMessage) {
            case 'image':
                contentHtml = `
                    <div class="message-content">
                        <img src="${message.content}" alt="Image partagée" onclick="openImageModal('${message.content}')">
                    </div>
                `;
                break;
                
            case 'video':
                contentHtml = `
                    <div class="message-content">
                        <video controls onclick="this.paused ? this.play() : this.pause()">
                            <source src="${message.content}" type="video/mp4">
                            Votre navigateur ne supporte pas la lecture vidéo.
                        </video>
                    </div>
                `;
                break;
                
            case 'file':
                const fileName = message.fileInfo?.fileName || message.content.split('/').pop() || 'Fichier';
                const fileSize = message.fileInfo?.fileSize ? formatFileSize(message.fileInfo.fileSize) : '';
                contentHtml = `
                    <div class="message-content">
                        <div class="file-message">
                            <div class="file-icon">📄</div>
                            <div class="file-info">
                                <div class="file-name">${fileName}</div>
                                ${fileSize ? `<div class="file-size">${fileSize}</div>` : ''}
                            </div>
                            <a href="${message.content}" download="${fileName}" class="download-btn">
                                Télécharger
                            </a>
                        </div>
                    </div>
                `;
                break;
                
            default:
                contentHtml = `
                    <div class="message-content">${escapeHtml(message.content)}</div>
                `;
        }
    }
    
    element.innerHTML = `
        ${contentHtml}
        <div class="message-time">${time} ${statusIcon}</div>
    `;
    
    return element;
}

// 🎤 FORMATER LA DURÉE AUDIO
function formatAudioDuration(duration) {
    if (!duration) return '0:00';
    
    if (typeof duration === 'number') {
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    if (typeof duration === 'string') {
        // Si c'est déjà au format "X:XX"
        if (duration.match(/^\d+:\d{2}$/)) {
            return duration;
        }
        
        // Si c'est en secondes
        const seconds = parseInt(duration);
        if (!isNaN(seconds)) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }
    
    return '0:00';
}

function openImageModal(imageUrl) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 90vw; max-height: 90vh; background: transparent; border: none;">
            <div class="modal-header" style="justify-content: flex-end; background: transparent;">
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <div class="modal-body" style="padding: 0; display: flex; justify-content: center; align-items: center; background: transparent;">
                <img src="${imageUrl}" style="max-width: 100%; max-height: 80vh; border-radius: 12px;">
            </div>
        </div>
    `;
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    document.body.appendChild(modal);
}

// ===== FONCTION POUR OBTENIR LE SOCKET SÉCURISÉ =====
function getSocket() {
    // Essayer plusieurs sources pour trouver le socket
    if (window.socket && window.socket.connected) {
        return window.socket;
    }
    
    if (state.socket && state.socket.connected) {
        return state.socket;
    }
    
    if (typeof io !== 'undefined') {
        // Vérifier si une instance de socket existe dans la bibliothèque io
        const sockets = Object.values(io.sockets || {});
        if (sockets.length > 0) {
            return sockets[0];
        }
    }
    
    console.warn("⚠️ Aucun socket actif trouvé");
    return null;
}

async function sendMessage() {
    const messageInput = document.getElementById("messageInput");
    const content = messageInput.value.trim();

    if (!content) return;

    // 🆕 PROTECTION ANTI-DOUBLE CLIC
    if (state.isSendingMessage) {
        console.log('🚫 Message déjà en cours d\'envoi - bloqué');
        return;
    }

    state.isSendingMessage = true;

    const sendButton = document.getElementById("sendButton");
    const sendStatus = document.getElementById("sendStatus");

    try {
        setButtonLoading(sendButton, true);
        sendStatus.textContent = "Envoi...";

        console.log('🎯 ENVOI TEMPS RÉEL WebSocket');

        // 🆕 VÉRIFICATION RENFORCÉE WEBSOCKET
        const socket = getSocket();
        if (!socket) {
            throw new Error('WebSocket non initialisé - Rechargez la page');
        }

        if (!socket.connected) {
            console.log('🔄 WebSocket déconnecté, tentative de reconnexion...');
            
            // Essayer de se reconnecter
            try {
                socket.connect();
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                if (!socket.connected) {
                    throw new Error('WebSocket toujours déconnecté');
                }
            } catch (reconnectError) {
                throw new Error('Impossible de se reconnecter au WebSocket');
            }
        }

        // 🎯 DÉTERMINER LE DESTINATAIRE
        let Id_receiver = null;
        let conversationId = null;
        
        if (state.currentConversation) {
            if (state.currentConversation._id.startsWith('temp_')) {
                // Pour une conversation temporaire, utiliser le premier participant comme destinataire
                if (state.currentConversation.participants && state.currentConversation.participants.length > 0) {
                    Id_receiver = state.currentConversation.participants[0]._id;
                    console.log('📤 Envoi à nouveau contact:', Id_receiver);
                }
            } else {
                // Pour une conversation existante
                conversationId = state.currentConversation._id;
            }
        }

        if (!conversationId && !Id_receiver) {
            throw new Error("Aucune conversation sélectionnée");
        }

        // 🎯 ENVOI PAR WEBSOCKET
        console.log('📤 Émission WebSocket via socket:', socket.id);
        
        const messageData = {
            content: content,
            typeMessage: "text"
        };

        if (conversationId) {
            messageData.conversationId = conversationId;
        } else if (Id_receiver) {
            messageData.Id_receiver = Id_receiver;
        }

        socket.emit("send_message", messageData);

        // Vide le champ
        messageInput.value = "";
        sendStatus.textContent = "Envoi en cours...";

        // 🆕 TIMEOUT DE SÉCURITÉ
        setTimeout(() => {
            if (sendStatus.textContent === "Envoi en cours...") {
                sendStatus.textContent = "✓ Envoyé";
            }
        }, 2000);

    } catch (error) {
        console.error("❌ Erreur envoi WebSocket:", error);
        sendStatus.textContent = "❌ Erreur";
        showMessage("Impossible d'envoyer le message: " + error.message, "error");
        // Remet le contenu pour réessayer
        messageInput.value = content;
    } finally {
        setButtonLoading(sendButton, false);
        state.isSendingMessage = false;
    }
}

// ===== FONCTIONS UTILITAIRES MESSAGERIE =====
async function markAsRead(conversationId) {
    try {
        // Ne pas marquer comme lu les conversations temporaires
        if (conversationId.startsWith('temp_')) {
            return;
        }
        
        await fetch(
            `${CONFIG.BACKEND_URL}/api/conversations/mark-as-read/${conversationId}`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${state.token}` },
            }
        );

        updateConversationBadge(conversationId, 0);
    } catch (error) {
        console.error("Mark as read error:", error);
    }
}

async function loadUnreadCounts() {
    try {
        const response = await fetch(
            `${CONFIG.BACKEND_URL}/api/conversations/unread-counts/${state.user.id}`,
            {
                headers: { Authorization: `Bearer ${state.token}` },
            }
        );

        const data = await response.json();

        if (response.ok && data.success) {
            data.conversationCounts.forEach((item) => {
                updateConversationBadge(item.conversationId, item.unreadCount);
            });

            const totalUnreadElement = document.getElementById("totalUnread");
            if (totalUnreadElement) {
                totalUnreadElement.textContent = data.totalUnread;
            }
        }
    } catch (error) {
        console.error("Load unread counts error:", error);
    }
}

function updateConversationBadge(conversationId, count = null) {
    const conversationElement = document.querySelector(
        `[data-conversation-id="${conversationId}"]`
    );
    if (conversationElement) {
        const badge = conversationElement.querySelector(".conversation-badge");
        const meta = conversationElement.querySelector(".conversation-meta");

        if (count === null || count > 0) {
            if (badge) {
                const currentCount = parseInt(badge.textContent) || 0;
                count = currentCount + 1;
                badge.textContent = count;
            } else {
                count = count || 1;
                if (!badge && meta) {
                    const newBadge = document.createElement("div");
                    newBadge.className = "conversation-badge";
                    newBadge.textContent = count;
                    meta.appendChild(newBadge);
                }
            }
        } else if (badge) {
            badge.remove();
        }

        updateTotalUnreadCount();
    }
}

function updateTotalUnreadCount() {
    const total = Array.from(
        document.querySelectorAll(".conversation-badge")
    ).reduce((sum, badge) => sum + (parseInt(badge.textContent) || 0), 0);

    const totalUnreadElement = document.getElementById("totalUnread");
    if (totalUnreadElement) {
        totalUnreadElement.textContent = total;
    }

    const notificationBadge = document.getElementById("notificationBadge");
    if (notificationBadge) {
        if (total > 0) {
            notificationBadge.textContent = total;
            notificationBadge.style.display = "flex";
        } else {
            notificationBadge.style.display = "none";
        }
    }
}

function updateConversationLastMessage(conversationId, message) {
    const conversationElement = document.querySelector(`[data-conversation-id="${conversationId}"]`);
    if (conversationElement) {
        const lastMessageElement = conversationElement.querySelector('.contact-info p');
        const timeElement = conversationElement.querySelector('.conversation-time');
        
        if (lastMessageElement) {
            let preview = message.content;
            if (message.typeMessage === 'image') preview = '📷 Image';
            if (message.typeMessage === 'video') preview = '🎥 Vidéo';
            if (message.typeMessage === 'file') preview = '📁 Fichier';
            if (message.typeMessage === 'audio') preview = '🎤 Message audio';
            
            lastMessageElement.textContent = preview.length > 30 ? 
                preview.substring(0, 30) + '...' : preview;
        }
        
        if (timeElement) {
            timeElement.textContent = formatTime(message.createdAt);
        }
        
        const contactsList = document.getElementById('contactsList');
        const conversationsContainer = contactsList.querySelector('.contacts-list') || contactsList;
        
        conversationElement.remove();
        const header = conversationsContainer.querySelector('.contacts-header');
        conversationsContainer.insertBefore(conversationElement, header.nextSibling);
    }
}

// ===== DÉMARRER CONVERSATION AVEC UTILISATEUR =====
async function startConversationWithUser(userId, username) {
    if (!userId) {
        showMessage("Utilisateur invalide", "error");
        return;
    }
    
    console.log(`🎯 Démarrage conversation avec: ${username} (${userId})`);
    
    // Vérifier si une conversation existe déjà avec cet utilisateur
    const existingConversation = state.conversations.find(conv => {
        if (conv.type !== 'private') return false;
        if (!conv.participants || !Array.isArray(conv.participants)) return false;
        
        return conv.participants.some(p => p._id === userId);
    });
    
    if (existingConversation) {
        console.log("✅ Conversation existante trouvée:", existingConversation._id);
        showMessage(`Conversation avec ${username} existante`, "info");
        await selectConversation(existingConversation);
        closeNewConversationModal();
        return;
    }
    
    console.log("🆕 Création nouvelle conversation temporaire...");
    
    // Créer une conversation temporaire pour l'UI
    const tempConversation = {
        _id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'private',
        participants: [{ _id: userId, username: username }],
        name: username,
        unreadCount: 0,
        lastMessageAt: new Date(),
        createdAt: new Date(),
        temporary: true
    };
    
    // Ajouter à la liste locale
    state.conversations.unshift(tempConversation);
    
    // Mettre à jour l'UI
    renderConversations();
    
    // Sélectionner la nouvelle conversation
    await selectConversation(tempConversation);
    
    // Fermer le modal
    closeNewConversationModal();
    
    console.log("✅ Nouvelle conversation temporaire créée");
}

// ===== RECHERCHE UTILISATEURS POUR NOUVELLE CONVERSATION =====
async function searchUsersForConversation(query) {
    const searchResults = document.getElementById('searchResults');
    
    if (!searchResults) return;
    
    if (!query || query.length < 2) {
        searchResults.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>Tapez au moins 2 caractères</p>
            </div>`;
        return;
    }
    
    try {
        console.log(`🔍 Recherche utilisateurs: ${query}`);
        
        const response = await fetch(
            `${CONFIG.BACKEND_URL}/api/users/search?q=${encodeURIComponent(query)}`, 
            {
                headers: {'Authorization': `Bearer ${state.token}`}
            }
        );
        
        const data = await response.json();
        
        console.log("📊 Résultats recherche:", data);
        
        if (response.ok && data.success && data.users && data.users.length > 0) {
            // Filtrer l'utilisateur courant
            const otherUsers = data.users.filter(user => user._id !== state.user.id);
            
            if (otherUsers.length === 0) {
                searchResults.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-user-slash"></i>
                        <p>Aucun autre utilisateur trouvé</p>
                    </div>`;
                return;
            }
            
            // Afficher les résultats
            searchResults.innerHTML = otherUsers.map(user => `
                <div class="user-result" data-user-id="${user._id}">
                    <div class="user-avatar">
                        ${user.username ? user.username.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div class="user-info">
                        <div class="user-name">${user.username || 'Utilisateur'}</div>
                        <div class="user-details">${user.email || ''}</div>
                    </div>
                    <button class="select-user-btn" onclick="startConversationWithUser('${user._id}', '${user.username || 'Utilisateur'}')">
                        <i class="fas fa-comment"></i> Discuter
                    </button>
                </div>
            `).join('');
            
        } else {
            searchResults.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>${data.message || 'Aucun utilisateur trouvé'}</p>
                </div>`;
        }
        
    } catch (error) {
        console.error("❌ Erreur recherche:", error);
        searchResults.innerHTML = `
            <div class="empty-state error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erreur de recherche</p>
            </div>`;
    }
}

// ===== FERMER MODAL NOUVELLE CONVERSATION =====
function closeNewConversationModal() {
    const modal = document.getElementById('newConversationModal');
    const searchInput = document.getElementById('searchUserInput');
    const searchResults = document.getElementById('searchResults');
    
    if (modal) modal.style.display = 'none';
    if (searchInput) searchInput.value = '';
    if (searchResults) {
        searchResults.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>Recherchez un utilisateur</p>
            </div>`;
    }
}

// ===== ÉCOUTEUR WEBSOCKET POUR LES NOUVELLES CONVERSATIONS =====
function setupSocketListenersForNewConversations() {
    const socket = getSocket();
    if (!socket) return;
    
    // Écouter les nouvelles conversations créées
    socket.on('new_conversation_created', (data) => {
        console.log('✅ Nouvelle conversation créée:', data);
        
        if (data.conversation) {
            // Vérifier si c'est une conversation avec l'utilisateur courant
            const isForCurrentUser = data.conversation.participants && 
            data.conversation.participants.some(p => p._id === state.user.id);
            
            if (isForCurrentUser) {
                // Ajouter à la liste des conversations
                state.conversations.unshift(data.conversation);
                renderConversations();
            }
        }
    });
    
    // Quand un message est envoyé avec succès
    socket.on('message_sent', (data) => {
        console.log('✅ Message envoyé:', data);
        
        // Si c'était une conversation temporaire, elle a été créée sur le serveur
        // Le serveur va émettre 'new_conversation_created' pour la nouvelle conversation réelle
    });
}

// ===== EXPORTER LES FONCTIONS =====
window.startConversationWithUser = startConversationWithUser;
window.searchUsersForConversation = searchUsersForConversation;
window.closeNewConversationModal = closeNewConversationModal;
window.getSocket = getSocket;
window.initConversations = initConversations;
window.loadConversations = loadConversations;
window.selectConversation = selectConversation;
window.loadMessages = loadMessages;
window.sendMessage = sendMessage;
window.openImageModal = openImageModal;
window.formatAudioDuration = formatAudioDuration;
window.markAsRead = markAsRead;
window.loadUnreadCounts = loadUnreadCounts;
window.setupSocketListenersForNewConversations = setupSocketListenersForNewConversations;