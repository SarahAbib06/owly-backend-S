let socket = null;
let currentUserId = '691791b18e4991e5b073c080';
let currentContactId = '691792195d52dfdf0f44fcad';
let currentUserName = 'leticia';
let currentConversationId = null;
let allMessages = [];
let typingTimeout = null;
let isTyping = false;
let notificationCount = 0;
let presenceInterval = null;

// 🎯 CONFIGURATION CENTRALISÉE
const CONFIG = {
    HEARTBEAT_INTERVAL: 25000,
    TYPING_TIMEOUT: 1000,
    NOTIFICATION_TIMEOUT: 5000,
    RECONNECT_DELAY: 5000
};

// 🎯 ÉVÉNEMENTS SOCKET CENTRALISÉS
const SOCKET_EVENTS = {
    connect: () => {
        document.getElementById('connectionStatus').textContent = '🟢 Connecté';
        console.log('🔗 Connecté au serveur Owly');
        
        socket.emit('join_notifications', currentUserId);
        console.log(`🔔 Rejoint notifications user: ${currentUserId}`);
        
        startPresenceHeartbeat();
        requestHistoryViaSocket();
    },
    
    disconnect: () => {
        document.getElementById('connectionStatus').textContent = '🔴 Déconnecté';
        if (presenceInterval) clearInterval(presenceInterval);
    },
    
    new_message_alert: (data) => {
        console.log('🔔 ALERTE NOTIFICATION WebSocket:', data);
        showNotificationAlert(data);
        updateUnreadBadge();
    },
    
    user_presence_changed: (data) => {
        console.log('👤 Présence changée:', data);
        updateContactPresence(data.userId, data.status);
    },
    
    unread_counts_data: (data) => {
        console.log('📊 Compteurs non-lus:', data);
        updateUnreadBadge(data.totalUnread);
        updateConversationBadges(data.conversationCounts);
    },
    
    conversation_marked_read: (data) => {
        console.log('✅ Conversation marquée comme lue:', data);
        updateUnreadBadge(0);
    },
    
    message_sent: (data) => {
        console.log('✅ Message envoyé confirmé:', data);
        if (data.success) {
            updatePendingMessage(data.data);
            if (data.data.conversationId) {
                currentConversationId = data.data.conversationId;
                localStorage.setItem(`conv_${currentUserId}_${currentContactId}`, currentConversationId);
                socket.emit('join_conversation', currentConversationId);
            }
        }
    },
    
    new_message: (data) => {
        console.log('📨 Nouveau message reçu:', data);
        if (data.data.conversationId === currentConversationId && data.data.Id_sender !== currentUserId) {
            displayMessage(data.data, 'received');
            allMessages.push(data.data);
        }
    },
    
    conversation_history: (data) => {
        console.log('📜 Historique reçu via Socket:', data);
        if (data.success && data.messages) {
            allMessages = data.messages;
            displayConversationHistory(data.messages);
        } else {
            showWelcomeMessage();
        }
    },
    
    user_typing: (data) => {
        console.log('⌨️ Typing reçu:', data);
        if (data.conversationId === currentConversationId && data.userId !== currentUserId) {
            showTypingIndicator(data.userName, data.isTyping);
        }
    },
    
    pong: (data) => console.log('🏓', data.message),
    error: (error) => console.error('💥 Erreur socket:', error)
};

// 🎯 INITIALISATION SOCKET OPTIMISÉE
function connectSocket() {
    if (socket) return;
    
    socket = io('http://localhost:5000', {
        transports: ['websocket'],
        withCredentials: true
    });
    
    // Configuration automatique des événements
    Object.keys(SOCKET_EVENTS).forEach(event => {
        socket.on(event, SOCKET_EVENTS[event]);
    });
}

// 🎯 FONCTIONS PRÉSENCE & NOTIFICATIONS
function startPresenceHeartbeat() {
    presenceInterval = setInterval(() => {
        if (socket?.connected) {
            socket.emit('user_heartbeat', { userId: currentUserId });
        }
    }, CONFIG.HEARTBEAT_INTERVAL);
}

function showNotificationAlert(data) {
    console.log('🔔 Création notification UI:', data);
    notificationCount++;
    
    const notification = document.createElement('div');
    notification.className = 'notification-popup';
    notification.innerHTML = `
        <div class="notification-header">
            <div class="notification-icon">🔔</div>
            <div class="notification-title">Nouveau message</div>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="notification-content">
            <strong>${data.senderName}</strong>: ${data.messagePreview}
        </div>
        <div class="notification-actions">
            <button class="notification-action-btn" onclick="this.closest('.notification-popup').remove()">Ignorer</button>
            <button class="notification-action-btn primary" onclick="focusOnChat('${data.conversationId}')">Ouvrir</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    playNotificationSound();
    
    setTimeout(() => notification.remove(), CONFIG.NOTIFICATION_TIMEOUT);
}

function focusOnChat(conversationId) {
    console.log('🎯 Focus sur conversation:', conversationId);
    document.getElementById('messageInput').focus();
    
    if (conversationId && conversationId !== currentConversationId) {
        socket.emit('mark_conversation_read', { conversationId, userId: currentUserId });
    }
}

function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        console.log('🔕 Audio non supporté');
    }
}

// 🎯 GESTION BADGES ET PRÉSENCE
function updateUnreadBadge(count = null) {
    let badge = document.getElementById('global-notification-badge') || createNotificationBadge();
    
    if (count !== null) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    } else {
        socket.emit('get_unread_counts', { userId: currentUserId });
    }
}

function createNotificationBadge() {
    const badge = document.createElement('div');
    badge.id = 'global-notification-badge';
    badge.className = 'notification-badge';
    document.querySelector('.sidebar-header').appendChild(badge);
    return badge;
}

function updateConversationBadges(conversationCounts) {
    conversationCounts.forEach(conv => {
        const contactElement = document.querySelector(`[data-conversation-id="${conv.conversationId}"]`);
        if (contactElement) {
            let badge = contactElement.querySelector('.conversation-badge') || createConversationBadge(contactElement);
            badge.textContent = conv.unreadCount > 99 ? '99+' : conv.unreadCount;
            badge.style.display = conv.unreadCount > 0 ? 'flex' : 'none';
        }
    });
}

function createConversationBadge(contactElement) {
    const badge = document.createElement('span');
    badge.className = 'conversation-badge';
    contactElement.appendChild(badge);
    return badge;
}

function updateContactPresence(userId, status) {
    const statusElement = document.querySelector(`[data-user-id="${userId}"] .contact-status`);
    if (statusElement) {
        statusElement.textContent = status === 'online' ? '🟢 En ligne' : '⚫ Hors ligne';
    }
}

// 🎯 GESTION MESSAGES OPTIMISÉE
function requestHistoryViaSocket() {
    const savedConvId = localStorage.getItem(`conv_${currentUserId}_${currentContactId}`);
    
    if (savedConvId) {
        currentConversationId = savedConvId;
        console.log('📁 Demande historique pour:', savedConvId);
        
        socket.emit('get_conversation_history', { conversationId: savedConvId, userId: currentUserId });
        socket.emit('join_conversation', savedConvId);
    } else {
        showWelcomeMessage();
    }
}

function switchUser(userName) {
    const userConfig = {
        leticia: { userId: '691791b18e4991e5b073c080', contactId: '691792195d52dfdf0f44fcad', name: 'leticia' },
        melina: { userId: '691792195d52dfdf0f44fcad', contactId: '691791b18e4991e5b073c080', name: 'melina' }
    };
    
    const config = userConfig[userName];
    if (!config) return;
    
    currentUserId = config.userId;
    currentContactId = config.contactId;
    currentUserName = config.name;
    
    // Mise à jour UI
    document.querySelectorAll('.contact').forEach(contact => contact.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    document.getElementById('currentContactName').textContent = currentUserName;
    document.getElementById('currentContactAvatar').textContent = currentUserName.charAt(0).toUpperCase();
    document.getElementById('contactStatus').textContent = 'En ligne - Prêt à chatter';
    
    if (socket) socket.emit('join_notifications', currentUserId);
    showTypingIndicator('', false);
    requestHistoryViaSocket();
}

function displayConversationHistory(messages) {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
        showWelcomeMessage();
        return;
    }
    
    messages.sort((a, b) => new Date(a.timestamp || a.time || a.createdAt) - new Date(b.timestamp || b.time || b.createdAt));
    messages.forEach(msg => displayMessage(msg, msg.Id_sender.toString() === currentUserId.toString() ? 'sent' : 'received', false));
    
    console.log(`📜 ${messages.length} messages chargés via Socket.io`);
}

function showWelcomeMessage() {
    const messagesContainer = document.getElementById('messages');
    const otherUser = currentUserName === 'leticia' ? 'melina' : 'leticia';
    
    messagesContainer.innerHTML = `
        <div class="welcome-message">
            <p>💬 Nouvelle conversation avec <strong>${otherUser}</strong></p>
            <p>Envoyez le premier message !</p>
        </div>
    `;
}

function sendMessage() {
    if (!socket) {
        alert('Connexion en cours, veuillez patienter...');
        return;
    }
    
    const messageInput = document.getElementById('messageInput');
    const content = messageInput.value.trim();
    
    if (!content) return;
    
    stopTyping();
    
    const messageData = {
        Id_sender: currentUserId,
        Id_receiver: currentContactId,
        content: content,
        messageType: 'text',
        ...(currentConversationId && { conversationId: currentConversationId })
    };
    
    console.log('📤 Envoi message:', messageData);
    socket.emit('send_message', messageData);
    
    // Message temporaire
    displayMessage({
        _id: 'pending_' + Date.now(),
        Id_sender: currentUserId,
        content: content,
        messageType: 'text',
        timestamp: new Date()
    }, 'sent', true);
    
    messageInput.value = '';
}

function updatePendingMessage(realMessage) {
    document.querySelectorAll('.message.pending').forEach(msg => {
        if (msg.dataset.tempId) {
            msg.innerHTML = `
                <div class="message-sender">Vous</div>
                <div class="message-content">${realMessage.content}</div>
                <div class="message-time">${new Date().toLocaleTimeString()}</div>
            `;
            msg.classList.remove('pending');
        }
    });
}

function displayMessage(message, type, isPending = false) {
    const messagesContainer = document.getElementById('messages');
    const welcomeMsg = document.querySelector('.welcome-message');
    
    if (welcomeMsg && !isPending) welcomeMsg.style.display = 'none';
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type} ${isPending ? 'pending' : ''}`;
    
    if (isPending) messageElement.dataset.tempId = message._id;
    
    const senderName = getSenderName(message.Id_sender);
    const messageTime = message.timestamp || message.time || new Date();
    
    messageElement.innerHTML = `
        <div class="message-sender">${senderName}</div>
        <div class="message-content">${message.content}</div>
        <div class="message-time">${new Date(messageTime).toLocaleTimeString()}</div>
        ${isPending ? '<div class="message-status">⏳ Envoi...</div>' : ''}
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getSenderName(senderId) {
    const senderMap = {
        '691791b18e4991e5b073c080': 'leticia',
        '691792195d52dfdf0f44fcad': 'melina'
    };
    
    return senderId.toString() === currentUserId.toString() ? 'Vous' : (senderMap[senderId] || 'Inconnu');
}

// 🎯 GESTION TYPING INDICATOR
function handleTyping() {
    if (!socket || !currentConversationId) return;
    
    if (!isTyping) {
        isTyping = true;
        console.log('⌨️ Envoi typing start');
        socket.emit('user_typing', {
            conversationId: currentConversationId,
            userId: currentUserId,
            isTyping: true,
            userName: currentUserName
        });
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, CONFIG.TYPING_TIMEOUT);
}

function stopTyping() {
    if (!socket || !currentConversationId || !isTyping) return;
    
    isTyping = false;
    console.log('⌨️ Envoi typing stop');
    socket.emit('user_typing', {
        conversationId: currentConversationId,
        userId: currentUserId,
        isTyping: false,
        userName: currentUserName
    });
}

function showTypingIndicator(userName, isTyping) {
    const typingIndicator = document.getElementById('typing-indicator');
    const typingText = document.getElementById('typing-text');
    
    if (isTyping && userName) {
        typingText.textContent = `${userName} est en train d'écrire...`;
        typingIndicator.style.display = 'flex';
    } else {
        typingIndicator.style.display = 'none';
    }
}

// 🎯 FONCTIONS UTILITAIRES
function handleKeyPress(event) {
    if (event.key === 'Enter') sendMessage();
}

function updateSystemStatus() {
    const wsStatus = document.getElementById('wsStatus');
    const notifStatus = document.getElementById('notifStatus');
    
    if (socket?.connected) {
        wsStatus.textContent = '🟢 Connecté';
        wsStatus.style.color = '#4CAF50';
    } else {
        wsStatus.textContent = '🔴 Déconnecté';
        wsStatus.style.color = '#ff4444';
    }
    
    if ('Notification' in window) {
        const statusMap = {
            granted: ['🟢 Activées', '#4CAF50'],
            denied: ['🔴 Bloquées', '#ff4444'],
            default: ['🟡 En attente', '#ff9800']
        };
        
        const [text, color] = statusMap[Notification.permission] || statusMap.default;
        notifStatus.textContent = text;
        notifStatus.style.color = color;
    } else {
        notifStatus.textContent = '❌ Non supporté';
        notifStatus.style.color = '#ff4444';
    }
}

function markConversationRead() {
    if (currentConversationId && socket) {
        socket.emit('mark_conversation_read', {
            conversationId: currentConversationId,
            userId: currentUserId
        });
        showTempStatus('✅ Conversation marquée comme lue');
    } else {
        showTempStatus('❌ Aucune conversation active');
    }
}

function showTempStatus(message) {
    const statusEl = document.getElementById('sendStatus');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.style.color = '#f9ee34';
        setTimeout(() => statusEl.textContent = '', 3000);
    }
}

// 🎯 FONCTIONS TEST (AJOUTE CES 3 FONCTIONS À LA FIN)
function disconnectUser() {
    if (socket) {
        console.log('🔌 Déconnexion manuelle...');
        socket.disconnect();
        
        document.getElementById('connectionStatus').textContent = '🔴 Déconnecté';
        document.getElementById('contactStatus').textContent = 'Hors ligne - Déconnecté';
        showTempStatus('🔌 Déconnecté manuellement');
        
        setTimeout(() => {
            connectSocket();
            showTempStatus('🔄 Reconnexion automatique...');
        }, CONFIG.RECONNECT_DELAY);
    }
}

function testPushNotifications() {
    console.log('🚀 Test spécifique notifications PUSH...');
    
    if (currentUserName === 'melina') {
        console.log('🔌 Melina se déconnecte pour test PUSH...');
        disconnectUser();
        return;
    }
    
    if (currentUserName === 'leticia') {
        console.log('📨 Leticia envoie message test pour PUSH...');
        
        socket.emit('send_message', {
            Id_sender: currentUserId,
            Id_receiver: '691792195d52dfdf0f44fcad',
            content: 'Test notification PUSH! 📱',
            messageType: 'text',
            conversationId: currentConversationId
        });
        
        showTempStatus('📨 Message test envoyé pour PUSH');
    }
}

function testNotificationSystem() {
    console.log('🧪 Test du système de notifications...');
    
    const testData = {
        type: 'new_message',
        conversationId: currentConversationId || 'test_conv',
        senderId: currentContactId,
        senderName: currentUserName === 'leticia' ? 'melina' : 'leticia',
        messagePreview: 'Ceci est un test de notification! 🧪',
        timestamp: new Date()
    };
    
    showNotificationAlert(testData);
    socket.emit('get_unread_counts', { userId: currentUserId });
    
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🧪 Test Owly', {
            body: 'Notification de test fonctionnelle!',
            icon: '/icon.png'
        });
    }
}

function enablePushNotifications() {
    if (!('Notification' in window)) {
        alert('Votre navigateur ne supporte pas les notifications');
        return;
    }
    
    if (Notification.permission === 'granted') {
        alert('Notifications déjà activées!');
        return;
    }
    
    if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('✅ Permission notifications accordée');
                alert('Notifications activées avec succès!');
                document.querySelector('.notification-permission-btn')?.classList.add('hidden');
            }
        });
    }
}

// 🎯 INITIALISATION
document.addEventListener('DOMContentLoaded', function() {
    connectSocket();
    
    // Simulation chargement
    const loadingSteps = [
        [25, 'Initialisation...'],
        [50, 'Connexion WebSocket...'],
        [75, 'Chargement historique...'],
        [100, 'Prêt!']
    ];
    
    loadingSteps.forEach(([percent, text], index) => {
        setTimeout(() => {
            document.getElementById('loadingBar').style.width = percent + '%';
            document.getElementById('loadingText').textContent = text;
        }, index * 300);
    });
    
    setInterval(updateSystemStatus, 5000);
    setTimeout(updateSystemStatus, 1000);
    setTimeout(() => {
        document.getElementById('loadingOverlay').style.opacity = '0';
        setTimeout(() => document.getElementById('loadingOverlay').style.display = 'none', 300);
    }, 1200);
});