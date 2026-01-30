// ===== CONFIGURATION =====
const CONFIG = {
    BACKEND_URL: 'http://localhost:5000',
    SOCKET_URL: 'http://localhost:5000',
    RECONNECT_DELAY: 3000,
    MAX_RECONNECT_ATTEMPTS: 5,
    MAX_FILE_SIZE: 50 * 1024 * 1024 // 50MB
};

// ===== ÉTAT GLOBAL =====
let state = {
    user: null,
    token: null,
    conversations: [],
    currentConversation: null,
    messages: new Map(),
    socket: null,
    isConnected: false,
    reconnectAttempts: 0,
    typingUsers: new Map(),
    notificationPermission: null,
    isLoadingMessages: false,
    pendingFiles: [],
    availableReactions: [],
    currentMessageForReaction: null,
    isSendingMessage: false,
    
    // 🎤 ÉTAT ENREGISTREMENT VOCAL
    audioRecorder: {
        mediaRecorder: null,
        audioChunks: [],
        audioBlob: null,
        audioUrl: null,
        isRecording: false,
        recordingTimer: null,
        recordingStartTime: null,
        audioDuration: 0
    },
    
    // 🆕 ÉTAT PAD
    pad: {
        currentPad: null,
        isPadOpen: false,
        mode: 'text',
        isUpdating: false,
        updateTimeout: null
    }
};

// ===== INITIALISATION GLOBALE =====
document.addEventListener("DOMContentLoaded", function () {
    console.log("🚀 Initialisation de l'application Owly...");
    
    if (document.getElementById("loginForm")) {
        initLoginPage();
    } else if (document.getElementById("contactsList")) {
        initMessagingPage();
    }
});

// ===== FONCTIONS UTILITAIRES =====
function setButtonLoading(button, isLoading) {
    const btnText = button.querySelector(".btn-text");
    const btnLoading = button.querySelector(".btn-loading");

    if (btnText && btnLoading) {
        btnText.classList.toggle("hidden", isLoading);
        btnLoading.classList.toggle("hidden", !isLoading);
    }

    button.disabled = isLoading;
}

function showMessage(message, type = "info") {
    const container = document.getElementById("messageContainer");
    if (!container) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        return;
    }

    container.className = `message-container ${type}`;
    container.textContent = message;
    container.style.display = "block";

    setTimeout(() => {
        container.style.display = "none";
    }, 5000);
}

function showLoading(show) {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.style.display = show ? "flex" : "none";
    }
}

function showMessageLoading(show) {
    const messagesList = document.getElementById("messagesList");
    if (!messagesList) return;

    if (show) {
        const loader = document.createElement("div");
        loader.className = "message-loader";
        loader.innerHTML =
            '<div class="loading-spinner"></div><span>Chargement des messages...</span>';
        loader.id = "messageLoader";
        messagesList.appendChild(loader);
    } else {
        const loader = document.getElementById("messageLoader");
        if (loader) {
            loader.remove();
        }
    }
}

function formatTime(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Maintenant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours} h`;
    if (diffDays < 7) return `Il y a ${diffDays} j`;

    return date.toLocaleDateString("fr-FR");
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    const messagesContainer = document.getElementById("messagesContainer");
    if (messagesContainer) {
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
    }
}

function formatMessageTimeRobuste(message) {
    const dateString = message.createdAt || message.timestamp || message.date || message.created_at;
    
    if (!dateString) {
        console.log("❌ Aucune date trouvée pour le message:", message._id);
        return '--:--';
    }
    
    try {
        const date = new Date(dateString);
        
        if (isNaN(date.getTime())) {
            console.log("❌ Date invalide:", dateString);
            return '--:--';
        }
        
        const timeString = date.toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
        
        return timeString;
        
    } catch (error) {
        console.error("❌ Erreur formatage date:", error, "Date:", dateString);
        return '--:--';
    }
}

function isMyMessage(message) {
    if (!message || !state.user) {
        console.log("❌ Message ou user manquant");
        return false;
    }

    let senderId;

    if (typeof message.Id_sender === "string") {
        senderId = message.Id_sender;
    } else if (message.Id_sender && message.Id_sender._id) {
        senderId = message.Id_sender._id.toString();
    } else if (message.Id_sender && typeof message.Id_sender === "object") {
        senderId = message.Id_sender.toString();
    } else {
        senderId = message.senderId || null;
    }

    const myId = state.user.id || state.user._id;

    if (!senderId || !myId) {
        console.log("❌ ID manquant - senderId:", senderId, "myId:", myId);
        return false;
    }

    return senderId === myId;
}

function getOtherParticipantId() {
    if (!state.currentConversation || !state.currentConversation.participants) return null;
    
    const otherParticipant = state.currentConversation.participants.find(
        p => p._id !== state.user.id
    );
    
    return otherParticipant?._id || null;
}

function getOtherParticipant() {
    if (!state.currentConversation || !state.currentConversation.participants) return null;
    
    return state.currentConversation.participants.find(
        p => p._id !== state.user.id
    );
}

// ===== WEBSOCKET =====
function initWebSocket() {
    if (!state.token) {
        console.error("❌ Pas de token pour WebSocket");
        return;
    }

    try {
        // Vérifier si Socket.IO est disponible
        if (typeof io === 'undefined') {
            console.error("❌ Socket.IO non chargé");
            showMessage("Erreur de connexion WebSocket", "error");
            return;
        }

        console.log("🔌 Connexion WebSocket...");
        
        // Créer la connexion Socket.IO
        const socket = io(CONFIG.SOCKET_URL, {
            auth: {
                token: state.token
            },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000
        });
        
        // Stocker globalement pour accessibility
        window.socket = socket;
        state.socket = socket;
        
        socket.on("connect", () => {
            console.log("✅ WebSocket connecté - ID:", socket.id);
            state.isConnected = true;
            state.reconnectAttempts = 0;
            updateConnectionStatus("🟢 Connecté");
            
            // Rejoindre les notifications
            socket.emit("join_notifications");
            console.log("🔔 Rejoint notifications");
            
            // Configurer les listeners pour les nouvelles conversations
            if (typeof setupSocketListenersForNewConversations === 'function') {
                setupSocketListenersForNewConversations();
            }
        });
        
        socket.on("disconnect", (reason) => {
            console.log("🔴 WebSocket déconnecté - Raison:", reason);
            state.isConnected = false;
            updateConnectionStatus("🔴 Déconnecté");
            
            if (reason === "io server disconnect") {
                setTimeout(() => {
                    socket.connect();
                }, 2000);
            }
        });
        
        socket.on("connect_error", (error) => {
            console.error("❌ Erreur connexion WebSocket:", error.message);
            updateConnectionStatus("❌ Erreur connexion");
            
            state.reconnectAttempts++;
            if (state.reconnectAttempts >= CONFIG.MAX_RECONNECT_ATTEMPTS) {
                showMessage("Impossible de se connecter au serveur", "error");
            }
        });

        // ===== ÉCOUTEURS WEBSOCKET =====
        
        // Nouveau message texte
        socket.on("new_message", (data) => {
            console.log("📨 Nouveau message reçu:", data);
            
            if (data.conversationId && data.Id_sender && data.content) {
                handleNewMessage({
                    _id: data._id || `temp_${Date.now()}`,
                    conversationId: data.conversationId,
                    Id_sender: data.Id_sender,
                    content: data.content,
                    typeMessage: data.typeMessage || "text",
                    status: "delivered",
                    timestamp: new Date(),
                    createdAt: new Date()
                });
            }
        });

        // Nouveau message audio
        socket.on("new_audio_message", (data) => {
            console.log("🔊 Nouveau message audio reçu:", data);
            
            if (data.message) {
                handleNewMessage(data.message);
            }
        });

        // Message image
        socket.on("image_message_sent", (data) => {
            console.log("✅ Image envoyée:", data);
            if (data.success && state.currentConversation) {
                loadMessages(state.currentConversation._id, false);
                showMessage('Image envoyée!', 'success');
            }
        });

        // Message fichier
        socket.on("file_message_sent", (data) => {
            console.log("✅ Fichier envoyé:", data);
            if (data.success && state.currentConversation) {
                loadMessages(state.currentConversation._id, false);
                showMessage('Fichier envoyé!', 'success');
            }
        });

        // Message vidéo
        socket.on("video_message_sent", (data) => {
            console.log("✅ Vidéo envoyée:", data);
            if (data.success && state.currentConversation) {
                loadMessages(state.currentConversation._id, false);
                showMessage('Vidéo envoyée!', 'success');
            }
        });

        // Nouvelle conversation créée
        socket.on("new_conversation_created", (data) => {
            console.log("✅ Nouvelle conversation créée:", data);
            
            if (data.conversation && data.success) {
                // Vérifier si cette conversation est pour l'utilisateur actuel
                const isForMe = data.conversation.participants && 
                               data.conversation.participants.some(p => 
                                   p._id === state.user.id || 
                                   p.toString() === state.user.id
                               );
                
                if (isForMe) {
                    // Ajouter à la liste des conversations si pas déjà présente
                    const exists = state.conversations.some(c => c._id === data.conversation._id);
                    if (!exists) {
                        state.conversations.unshift(data.conversation);
                        renderConversations();
                        showMessage("Nouvelle conversation créée!", "success");
                    }
                    
                    // Si on est dans une conversation temporaire avec le même user
                    if (state.currentConversation && 
                        state.currentConversation.temporary &&
                        state.currentConversation.participants &&
                        state.currentConversation.participants[0]._id === getOtherParticipantId()) {
                        
                        // Mettre à jour avec la vraie conversation
                        state.currentConversation = data.conversation;
                        selectConversation(data.conversation);
                    }
                }
            }
        });

        // Typing indicator
        socket.on("user_typing", (data) => {
            handleTypingIndicator(data);
        });

        // Réactions
        socket.on("reaction_added", (data) => {
            console.log("❤️ Réaction ajoutée:", data);
            if (state.currentConversation && data.messageId) {
                loadMessages(state.currentConversation._id, false);
            }
        });

        socket.on("reaction_removed", (data) => {
            console.log("🗑️ Réaction supprimée:", data);
            if (state.currentConversation && data.messageId) {
                loadMessages(state.currentConversation._id, false);
            }
        });

        // Erreurs
        socket.on("message_error", (data) => {
            console.error("❌ Erreur message:", data);
            showMessage(data.error || "Erreur d'envoi", "error");
        });

        socket.on("audio_message_error", (data) => {
            console.error("❌ Erreur audio:", data);
            showMessage("Erreur audio: " + data.error, "error");
        });

        socket.on("image_message_error", (data) => {
            console.error("❌ Erreur image:", data);
            showMessage("Erreur image: " + data.error, "error");
        });

        socket.on("file_message_error", (data) => {
            console.error("❌ Erreur fichier:", data);
            showMessage("Erreur fichier: " + data.error, "error");
        });

        socket.on("video_message_error", (data) => {
            console.error("❌ Erreur vidéo:", data);
            showMessage("Erreur vidéo: " + data.error, "error");
        });

    } catch (error) {
        console.error("❌ Erreur initialisation WebSocket:", error);
        showMessage("Erreur de connexion WebSocket", "error");
    }
}

function setupSocketListenersForNewConversations() {
    if (!window.socket) return;
    
    console.log("🔧 Configuration listeners conversations...");
    
    // Écouter les nouvelles conversations créées
    window.socket.on('new_conversation_created', (data) => {
        console.log('✅ Nouvelle conversation créée via WebSocket:', data);
        
        if (data.conversation) {
            // Vérifier si c'est une conversation avec l'utilisateur courant
            const isForCurrentUser = data.conversation.participants && 
                                   data.conversation.participants.some(p => 
                                       p._id === state.user.id || 
                                       p.toString() === state.user.id
                                   );
            
            if (isForCurrentUser) {
                // Ajouter à la liste des conversations
                const exists = state.conversations.some(c => c._id === data.conversation._id);
                if (!exists) {
                    state.conversations.unshift(data.conversation);
                    renderConversations();
                    showMessage("Nouvelle conversation créée!", "success");
                }
            }
        }
    });
    
    // Quand un message est envoyé avec succès
    window.socket.on('message_sent', (data) => {
        console.log('✅ Message envoyé:', data);
        
        // Si c'était une conversation temporaire, elle a été créée sur le serveur
        // Le serveur va émettre 'new_conversation_created' pour la nouvelle conversation réelle
    });
}

function updateConnectionStatus(status) {
    const statusElement = document.getElementById("wsStatus");
    if (statusElement) {
        statusElement.textContent = status;
    }
}

function handleNewMessage(message) {
    console.log('📨 Traitement nouveau message:', message);
    
    // Mettre à jour la dernière conversation
    updateConversationLastMessage(message.conversationId, message);
    
// Toast notification même si app ouverte (si onglet caché ou autre conversation)
if (document.hidden || !state.currentConversation || message.conversationId !== state.currentConversation._id) {
    updateConversationBadge(message.conversationId);

    let preview = message.content;
    if (message.typeMessage === 'image') preview = '📷 Image';
    if (message.typeMessage === 'video') preview = '🎥 Vidéo';
    if (message.typeMessage === 'file') preview = '📁 Fichier';
    if (message.typeMessage === 'audio') preview = '🎤 Message vocal';

    showToast({
        senderName: message.Id_sender?.username || 'Quelqu\'un',
        messagePreview: preview,
        conversationId: message.conversationId
    });
}
    
    // Si c'est la conversation active, recharger les messages
    if (state.currentConversation && message.conversationId === state.currentConversation._id) {
        markAsRead(state.currentConversation._id);
        
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

// ===== INITIALISATION PAGE MESSAGERIE =====
function initMessagingPage() {
    if (!checkAuth()) return;

    initUserPanel();
    initMessageInput();
    initFileUploads();
    initTestButtons();
    initModals();
    initGroupCreation();
    initReactionsSystem();
    initUserProfileSystem();
    initVoiceRecording();
    initNotificationButton();
    PadSystem.init()
    
    loadInitialData();
    
    // Démarrer WebSocket
    initWebSocket();
    setTimeout(() => {
    registerWebPush();
}, 3000);
    PadSystem.init()
}
// === NOTIFICATIONS PUSH NAVIGATEUR (WEB PUSH) ===
// === NOTIFICATIONS PUSH NAVIGATEUR (WEB PUSH) - VERSION FINALE ===
async function registerWebPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log("⚠️ Push notifications non supportées par ce navigateur");
        return;
    }

    try {
        console.log("🚀 Démarrage enregistrement web push...");

        // 1. Demander la permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log("❌ Permission refusée");
            return;
        }

        // 2. Enregistrer le service worker (chemin adapté à ta structure)
        const registration = await navigator.serviceWorker.register('/src/frontendtest/sw.js');

        // 3. Récupérer la clé VAPID du backend (avec les nouvelles clés Firebase)
        const res = await fetch(`${CONFIG.BACKEND_URL}/api/notifications/vapid-public-key`);
        if (!res.ok) throw new Error("Impossible de récupérer la clé VAPID");
        const data = await res.json();
        const vapidPublicKey = data.publicKey;
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

        // 4. DÉSABONNER L'ANCIEN ABO (obligatoire pour changer de clé)
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
            console.log("🗑️ Désabonnement de l'ancien push...");
            await existingSubscription.unsubscribe();
            console.log("✅ Ancien abonnement supprimé");
        }

        // 5. S'ABONNER AVEC LES NOUVELLES CLÉS FIREBASE
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
        });
        console.log("✅ Nouvelle subscription générée avec clés Firebase");

        // 6. Envoyer au backend
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/notifications/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                subscription: subscription,
                userId: state.user.id || state.user._id
            })
        });

        if (response.ok) {
            console.log("✅ Nouveau token web push enregistré sur le serveur !");
            showMessage("🔔 Notifications push activées avec succès !", "success");
        } else {
            console.error("❌ Erreur serveur");
        }

    } catch (error) {
        console.error("❌ Erreur registration web push:", error);
    }
}

// Fonction utilitaire pour convertir la clé VAPID
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
function checkAuth() {
    const token = localStorage.getItem("owly_token");
    const userData = localStorage.getItem("owly_user");

    if (!token || !userData) {
        window.location.href = "login.html";
        return false;
    }

    state.token = token;
    state.user = JSON.parse(userData);
    return true;
}

function initUserPanel() {
    if (state.user) {
        document.getElementById("userName").textContent = state.user.username;
        document.getElementById("userEmail").textContent = state.user.email;
        document.getElementById("userAvatar").textContent = state.user.username
            .charAt(0)
            .toUpperCase();
    }
}

function loadInitialData() {
    showLoading(true);

    try {
        // Charger les conversations
        if (typeof loadConversations === 'function') {
            loadConversations();
        }
        if (typeof loadUnreadCounts === 'function') {
            loadUnreadCounts();
        }
        if (typeof loadAvailableReactions === 'function') {
            loadAvailableReactions();
        }
    } catch (error) {
        console.error("Error loading initial data:", error);
        showMessage("Erreur de chargement des données", "error");
    } finally {
        showLoading(false);
    }
}

// ===== INITIALISATION INPUT MESSAGE =====
function initMessageInput() {
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.getElementById("sendButton");
    
    if (!messageInput || !sendButton) {
        console.error("❌ Éléments input message non trouvés");
        return;
    }
    
    let typingTimer;

    messageInput.addEventListener("input", () => {
        if (state.currentConversation && getSocket() && getSocket().connected) {
            // Ne pas envoyer typing indicator pour les conversations temporaires
            if (!state.currentConversation._id.startsWith('temp_')) {
                getSocket().emit("user_typing", {
                    conversationId: state.currentConversation._id,
                    isTyping: true,
                });

                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => {
                    const socket = getSocket();
                    if (socket) {
                        socket.emit("user_typing", {
                            conversationId: state.currentConversation._id,
                            isTyping: false,
                        });
                    }
                }, 1000);
            }
        }
    });

    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    sendButton.addEventListener("click", sendMessage);
    
    console.log("✅ Input message initialisé");
}

// Gestion de la déconnexion
window.addEventListener('beforeunload', () => {
    if (state.socket) {
        state.socket.disconnect();
    }
    
    state.pendingFiles.forEach(fileData => {
        if (fileData.previewUrl) {
            URL.revokeObjectURL(fileData.previewUrl);
        }
    });
});

// Export global
window.CONFIG = CONFIG;
window.state = state;
window.showMessage = showMessage;
window.showLoading = showLoading;
window.scrollToBottom = scrollToBottom;
window.formatTime = formatTime;
window.formatFileSize = formatFileSize;
window.isMyMessage = isMyMessage;
window.getOtherParticipantId = getOtherParticipantId;
window.getOtherParticipant = getOtherParticipant;
window.initMessagingPage = initMessagingPage;
window.initMessageInput = initMessageInput;
window.checkAuth = checkAuth;
window.initUserPanel = initUserPanel;
window.loadInitialData = loadInitialData;
window.owlyState = state;

// ✅ Ajout des fonctions manquantes
function showNotification(data) {
    const popup = document.getElementById("notificationPopup");
    const titleEl = document.getElementById("notificationTitle");
    const contentEl = document.getElementById("notificationContent");

    // Titre et contenu
    titleEl.textContent = data.senderName ? `Nouveau message de ${data.senderName}` : "Nouveau message";
    contentEl.textContent = data.messagePreview || "Vous avez un nouveau message";

    // Afficher avec animation
    popup.style.display = "block";
    popup.classList.remove("show");
    void popup.offsetWidth; // Force reflow pour relancer l'animation
    popup.classList.add("show");

    // Son "ding" discret
    const audio = new Audio("https://www.soundjay.com/buttons/sounds/button-09.mp3"); // Son gratuit et léger
    audio.volume = 0.5;
    audio.play().catch(() => console.log("Son bloqué (normal si pas d'interaction préalable)"));

    // Gestion des boutons
    document.getElementById("notificationReplyBtn").onclick = () => {
        if (data.conversationId) {
            const conv = state.conversations.find(c => c._id === data.conversationId);
            if (conv) {
                selectConversation(conv);
                document.getElementById("messageInput")?.focus();
            }
        }
        hideNotificationPopup();
    };

    document.getElementById("notificationOpenBtn").onclick = () => {
        if (data.conversationId) {
            const conv = state.conversations.find(c => c._id === data.conversationId);
            if (conv) selectConversation(conv);
        }
        hideNotificationPopup();
    };

    document.getElementById("closeNotification").onclick = hideNotificationPopup;

    // Auto-hide après 8 secondes
    setTimeout(hideNotificationPopup, 8000);
}

function hideNotificationPopup() {
    const popup = document.getElementById("notificationPopup");
    popup.classList.remove("show");
    setTimeout(() => {
        popup.style.display = "none";
    }, 300); // Temps de l'animation fade out
}
function showToast(data) {
    const toast = document.getElementById("toastNotification");
    const title = document.getElementById("toastTitle");
    const message = document.getElementById("toastMessage");
    const avatar = toast.querySelector(".toast-avatar");

    title.textContent = data.senderName || "Nouveau message";
    message.textContent = data.messagePreview || "Vous avez un nouveau message";
    avatar.textContent = (data.senderName || "U").charAt(0).toUpperCase();

    toast.classList.add("show");

    // Son ding
    const audio = new Audio("https://www.soundjay.com/buttons/sounds/button-09.mp3");
    audio.volume = 0.6;
    audio.play().catch(() => {});

    // Clic sur le toast → ouvre la conversation
    toast.onclick = () => {
        if (data.conversationId) {
            const conv = state.conversations.find(c => c._id === data.conversationId);
            if (conv) {
                selectConversation(conv);
                document.getElementById("messageInput")?.focus();
            }
        }
        hideToast();
    };

    // Disparaît après 6 secondes
    setTimeout(hideToast, 6000);
}

function hideToast() {
    const toast = document.getElementById("toastNotification");
    toast.classList.remove("show");
}
function createNotification(data) {
    const options = {
        body: data.messagePreview || "Nouveau message",
        icon: "/icon.png",
        tag: data.conversationId || "new_message",
        data: data
    };
    
    const notification = new Notification(data.senderName || "Owly", options);
    
    notification.onclick = function() {
        window.focus();
        notification.close();
        
        // Si c'est une conversation, la sélectionner
        if (data.conversationId) {
            const conversation = state.conversations.find(c => c._id === data.conversationId);
            if (conversation) {
                selectConversation(conversation);
            }
        }
    };
}

// ✅ Ajout de la fonction manquante
window.showNotification = showNotification;