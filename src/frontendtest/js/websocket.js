// ===== WEBSOCKET =====
function initWebSocket() {
    if (!state.token) return;

    try {
        if (typeof io !== "undefined") {
            connectSocketIO();
        } else {
            console.warn("Socket.IO not available, using fallback");
        }
    } catch (error) {
        console.error("WebSocket initialization error:", error);
    }
}

function connectSocketIO() {
    state.socket = io(CONFIG.SOCKET_URL, {
        auth: { token: state.token },
        transports: ["websocket", "polling"],
    });

    state.socket.on("connect", () => {
        console.log("🔗 WebSocket connected");
        state.isConnected = true;
        state.reconnectAttempts = 0;
        updateConnectionStatus("🟢 Connecté");

        state.socket.emit("join_notifications");
        if (state.currentConversation) {
            state.socket.emit("join_conversation", state.currentConversation._id);
        }
    });

    state.socket.on("disconnect", (reason) => {
        console.log("🔴 WebSocket disconnected:", reason);
        state.isConnected = false;
        updateConnectionStatus("🔴 Déconnecté");

        if (reason === "io server disconnect") {
            setTimeout(() => {
                state.socket.connect();
            }, CONFIG.RECONNECT_DELAY);
        }
    });

    state.socket.on("connect_error", (error) => {
        console.error("WebSocket connection error:", error);
        updateConnectionStatus("🔴 Erreur connexion");

        state.reconnectAttempts++;
        if (state.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
            setTimeout(() => {
                state.socket.connect();
            }, CONFIG.RECONNECT_DELAY * state.reconnectAttempts);
        }
    });

    state.socket.on("new_message", (data) => {
        console.log("🔔 [STRUCTURE BACKEND] Message reçu:", data);
        
        // 🎯 ADAPTATION À LA STRUCTURE BACKEND
        const message = {
            _id: data._id || data.messageId,
            conversationId: data.conversationId,
            Id_sender: data.Id_sender,  // ✅ Structure backend
            senderId: data.Id_sender,   // ✅ Compatibilité frontend
            content: data.content,
            typeMessage: data.typeMessage,
            status: data.status || "sent",
            timestamp: data.timestamp || new Date(),
            createdAt: data.createdAt || data.timestamp || new Date(),
            
            // 🎯 Support des fichiers multimédias
            ...(data.imageInfo && { imageInfo: data.imageInfo }),
            ...(data.fileInfo && { fileInfo: data.fileInfo }),
            ...(data.videoInfo && { videoInfo: data.videoInfo })
        };
        
        console.log("🔄 Message adapté pour le frontend:", message);
        handleNewMessage(message);
    });

    // 🎤 ÉVÉNEMENTS AUDIO ADAPTÉS
    state.socket.on("audio_message_sent", (data) => {
        console.log('✅ Audio sent confirmation:', data);
        handleFileMessageSent(data);
    });

    state.socket.on("audio_message_error", (data) => {
        console.error('❌ Audio send error:', data);
        showMessage('Erreur d\'envoi de l\'audio: ' + data.error, 'error');
    });

    state.socket.on("new_audio_message", (data) => {
        console.log('🔊 Nouveau message audio en temps réel:', data);
        handleNewMessage(data.message);
    });

    // 🆕 ÉVÉNEMENTS PAD
    state.socket.on("pad_content_updated", (data) => {
        console.log("📝 Pad content updated:", data);
        handlePadContentUpdate(data);
    });

    state.socket.on("pad_item_toggled", (data) => {
        console.log("✅ Pad item toggled:", data);
        handlePadItemToggle(data);
    });

    state.socket.on("pad_updated", (data) => {
        console.log("🔄 Pad updated:", data);
        handlePadUpdate(data);
    });

    state.socket.on("reaction_added", (data) => {
        console.log("❤️ Réaction ajoutée:", data);
        handleReactionAdded(data);
    });

    state.socket.on("reaction_removed", (data) => {
        console.log("🗑️ Réaction supprimée:", data);
        handleReactionRemoved(data);
    });

    state.socket.on("reaction_error", (data) => {
        console.error("❌ Erreur réaction:", data);
        showMessage(data.error || "Erreur avec la réaction", "error");
    });

    state.socket.on("image_message_sent", (data) => {
        console.log('✅ Image sent confirmation:', data);
        handleFileMessageSent(data);
    });

    state.socket.on("file_message_sent", (data) => {
        console.log('✅ File sent confirmation:', data);
        handleFileMessageSent(data);
    });

    state.socket.on("video_message_sent", (data) => {
        console.log('✅ Video sent confirmation:', data);
        handleFileMessageSent(data);
    });

    state.socket.on("image_message_error", (data) => {
        console.error('❌ Image send error:', data);
        showMessage('Erreur d\'envoi de l\'image: ' + data.error, 'error');
    });

    state.socket.on("file_message_error", (data) => {
        console.error('❌ File send error:', data);
        showMessage('Erreur d\'envoi du fichier: ' + data.error, 'error');
    });

    state.socket.on("video_message_error", (data) => {
        console.error('❌ Video send error:', data);
        showMessage('Erreur d\'envoi de la vidéo: ' + data.error, 'error');
    });

    state.socket.on("user_typing", (data) => {
        handleTypingIndicator(data);
    });

    state.socket.on("message_sent", (data) => {
        console.log("✅ Message sent confirmation:", data);
        updateMessageStatus(data.data._id, "sent");
    });

    state.socket.on("message_error", (data) => {
        console.error("❌ Message error:", data);
        showMessage("Erreur d'envoi du message", "error");
    });
}

function handleNewMessage(message) {
    console.log('📨 Nouveau message reçu:', message);
    
    // 🎯 Mettre à jour la dernière conversation
    updateConversationLastMessage(message.conversationId, message);
    
    // 🎯 Mettre à jour les badges de notification
    if (!state.currentConversation || message.conversationId !== state.currentConversation._id) {
        updateConversationBadge(message.conversationId);
        
        let preview = message.content;
        if (message.typeMessage === 'image') preview = '📷 Image';
        if (message.typeMessage === 'video') preview = '🎥 Vidéo';
        if (message.typeMessage === 'file') preview = '📁 Fichier';
        if (message.typeMessage === 'audio') preview = '🎤 Message audio';
        
        showNotification({
            type: 'new_message',
            conversationId: message.conversationId,
            senderName: message.Id_sender?.username || 'Quelqu\'un',
            messagePreview: preview
        });
    }
    
    // 🎯 SI c'est la conversation active, recharger les messages UNE FOIS
    if (state.currentConversation && message.conversationId === state.currentConversation._id) {
        // ⛔ NE PAS ajouter manuellement le message
        // ✅ Laisser le rechargement naturel se faire
        markAsRead(state.currentConversation._id);
        
        // Optionnel : recharger les messages après un court délai
        setTimeout(() => {
            loadMessages(state.currentConversation._id, false);
        }, 100);
    }
}

function handleTypingIndicator(data) {
    const typingIndicator = document.getElementById("typingIndicator");
    const typingText = document.getElementById("typingText");

    if (data.isTyping) {
        state.typingUsers.set(data.userId, {
            userName: data.userName,
            timestamp: Date.now(),
        });

        const typingUsers = Array.from(state.typingUsers.values()).map(
            (u) => u.userName
        );
        typingText.textContent = `${typingUsers.join(", ")} ${
            typingUsers.length === 1 ? "est" : "sont"
        } en train d'écrire...`;
        typingIndicator.style.display = "flex";
    } else {
        state.typingUsers.delete(data.userId);

        if (state.typingUsers.size === 0) {
            typingIndicator.style.display = "none";
        } else {
            const typingUsers = Array.from(state.typingUsers.values()).map(
                (u) => u.userName
            );
            typingText.textContent = `${typingUsers.join(", ")} ${
                typingUsers.length === 1 ? "est" : "sont"
            } en train d'écrire...`;
        }
    }

    const now = Date.now();
    state.typingUsers.forEach((value, key) => {
        if (now - value.timestamp > 5000) {
            state.typingUsers.delete(key);
        }
    });
}

function handleReactionAdded(data) {
    if (state.currentConversation && data.messageId) {
        loadMessages(state.currentConversation._id, false);
    }
}

function handleReactionRemoved(data) {
    if (state.currentConversation && data.messageId) {
        loadMessages(state.currentConversation._id, false);
    }
}

function handleFileMessageSent(data) {
    if (data.success && state.currentConversation) {
        loadMessages(state.currentConversation._id, false);
        showMessage('Fichier envoyé avec succès!', 'success');
    }
}

function handlePadContentUpdate(data) {
    if (!state.pad.isPadOpen || state.pad.isUpdating) return;
    
    const textarea = document.getElementById('padTextarea');
    if (textarea && data.content !== textarea.value) {
        textarea.value = data.content;
        state.pad.currentPad.content = data.content;
    }
    
    if (data.mode && data.mode !== state.pad.mode) {
        state.pad.mode = data.mode;
        updatePadUI();
    }
    
    if (data.stats) {
        updatePadStats(data.stats);
    }
}

function handlePadItemToggle(data) {
    if (data.stats && state.pad.currentPad) {
        state.pad.currentPad.stats = data.stats;
        updatePadStats(data.stats);
    }
}

function handlePadUpdate(data) {
    switch (data.type) {
        case 'mode_changed':
            if (data.mode) {
                state.pad.mode = data.mode;
                state.pad.currentPad.content = data.content;
                updatePadUI();
            }
            break;
            
        case 'pad_cleared':
            if (state.pad.currentPad) {
                state.pad.currentPad.content = "";
                const textarea = document.getElementById('padTextarea');
                if (textarea) {
                    textarea.value = "";
                }
            }
            break;
    }
}

function updateConnectionStatus(status) {
    const statusElement = document.getElementById("wsStatus");
    if (statusElement) {
        statusElement.textContent = status;
    }
}

function updateMessageStatus(messageId, status) {
    const messageElement = document.querySelector(
        `[data-message-id="${messageId}"]`
    );
    if (messageElement) {
        messageElement.classList.remove("pending");
        const timeElement = messageElement.querySelector(".message-time");
        if (timeElement) {
            const timeText = timeElement.textContent.replace(/[✓✓✓]/g, "").trim();
            timeElement.textContent = `${timeText} ${status === "seen" ? "✓✓" : "✓"}`;
        }
    }
}

// Export
window.initWebSocket = initWebSocket;
window.handleNewMessage = handleNewMessage;
window.handleTypingIndicator = handleTypingIndicator;