// ===== CONFIGURATION =====
const CONFIG = {
    BACKEND_URL: 'http://localhost:5000',
    SOCKET_URL: 'http://localhost:5000',
    RECONNECT_DELAY: 3000,
    MAX_RECONNECT_ATTEMPTS: 5
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
    isLoadingMessages: false
};

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('loginForm')) {
        initLoginPage();
    } else if (document.getElementById('contactsList')) {
        initMessagingPage();
    }
});

// ===== PAGE DE CONNEXION =====
function initLoginPage() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const otpForm = document.getElementById('otpForm');
    const showRegisterBtn = document.getElementById('showRegister');
    const showLoginBtn = document.getElementById('showLogin');
    const forgotPasswordBtn = document.getElementById('forgotPassword');
    const changeEmailBtn = document.getElementById('changeEmail');
    const resendOtpBtn = document.getElementById('resendOtp');

    showRegisterBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        showForm('register');
    });

    showLoginBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        showForm('login');
    });

    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin();
    });

    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleRegister();
    });

    otpForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await verifyOtp();
    });

    forgotPasswordBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        await handleForgotPassword();
    });

    resendOtpBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        await resendOtp();
    });

    changeEmailBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        showForm('register');
    });

    checkExistingAuth();
}

function showForm(formType) {
    document.getElementById('loginForm').classList.toggle('hidden', formType !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', formType !== 'register');
    document.getElementById('otpForm').classList.toggle('hidden', formType !== 'otp');
}

async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');

    if (!email || !password) {
        showMessage('Veuillez remplir tous les champs', 'error');
        return;
    }

    try {
        setButtonLoading(loginBtn, true);
        
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            if (data.requiresOtp) {
                state.tempToken = data.debug_token;
                document.getElementById('otpEmail').textContent = email;
                showForm('otp');
                showMessage('Code de vérification envoyé par email', 'success');
            } else {
                await handleSuccessfulAuth(data);
            }
        } else {
            showMessage(data.message || 'Erreur de connexion', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('Erreur de connexion au serveur', 'error');
    } finally {
        setButtonLoading(loginBtn, false);
    }
}

async function handleRegister() {
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const passwordConfirm = document.getElementById('regPasswordConfirm').value;
    const registerBtn = document.getElementById('registerBtn');

    if (!username || !email || !password || !passwordConfirm) {
        showMessage('Veuillez remplir tous les champs', 'error');
        return;
    }

    if (password !== passwordConfirm) {
        showMessage('Les mots de passe ne correspondent pas', 'error');
        return;
    }

    try {
        setButtonLoading(registerBtn, true);

        const response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username, email, password, passwordConfirm })
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('otpEmail').textContent = email;
            showForm('otp');
            showMessage('Code de vérification envoyé par email', 'success');
        } else {
            showMessage(data.message || 'Erreur d\'inscription', 'error');
        }
    } catch (error) {
        console.error('Register error:', error);
        showMessage('Erreur de connexion au serveur', 'error');
    } finally {
        setButtonLoading(registerBtn, false);
    }
}

async function verifyOtp() {
    const email = document.getElementById('otpEmail').textContent;
    const otp = document.getElementById('otpCode').value;
    const verifyBtn = document.getElementById('verifyOtpBtn');

    if (!otp) {
        showMessage('Veuillez entrer le code de vérification', 'error');
        return;
    }

    try {
        setButtonLoading(verifyBtn, true);

        let response;
        if (state.tempToken) {
            response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/verify-inactivity-otp`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ token: state.tempToken, otp })
            });
        } else {
            response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/verify-otp`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, otp })
            });
        }

        const data = await response.json();

        if (response.ok) {
            await handleSuccessfulAuth(data);
        } else {
            showMessage(data.message || 'Code invalide', 'error');
        }
    } catch (error) {
        console.error('OTP verification error:', error);
        showMessage('Erreur de vérification', 'error');
    } finally {
        setButtonLoading(verifyBtn, false);
    }
}

async function resendOtp() {
    const email = document.getElementById('otpEmail').textContent;

    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/resend-otp`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage('Nouveau code envoyé', 'success');
        } else {
            showMessage(data.message || 'Erreur d\'envoi', 'error');
        }
    } catch (error) {
        console.error('Resend OTP error:', error);
        showMessage('Erreur d\'envoi', 'error');
    }
}

async function handleForgotPassword() {
    const email = prompt('Entrez votre email pour réinitialiser le mot de passe:');
    if (!email) return;

    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/forgot-password`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage('Instructions de réinitialisation envoyées par email', 'success');
        } else {
            showMessage(data.message || 'Erreur', 'error');
        }
    } catch (error) {
        console.error('Forgot password error:', error);
        showMessage('Erreur de connexion', 'error');
    }
}

async function handleSuccessfulAuth(authData) {
    state.token = authData.data?.token || authData.token;
    state.user = authData.data?.user || {
        id: authData.id,
        username: authData.username,
        email: authData.email
    };

    localStorage.setItem('owly_token', state.token);
    localStorage.setItem('owly_user', JSON.stringify(state.user));

    showMessage('Connexion réussie! Redirection...', 'success');
    
    setTimeout(() => {
        window.location.href = 'conversations.html';
    }, 1000);
}

function checkExistingAuth() {
    const token = localStorage.getItem('owly_token');
    const userData = localStorage.getItem('owly_user');

    if (token && userData) {
        state.token = token;
        state.user = JSON.parse(userData);
        
        if (window.location.pathname.includes('login.html')) {
            window.location.href = 'conversations.html';
        }
    }
}

// ===== PAGE DE MESSAGERIE =====
function initMessagingPage() {
    if (!checkAuth()) return;

    initUserPanel();
    initConversations();
    initMessageInput();
    initWebSocket();
    initTestButtons();
    initModals();

    loadInitialData();
}

function checkAuth() {
    const token = localStorage.getItem('owly_token');
    const userData = localStorage.getItem('owly_user');

    if (!token || !userData) {
        window.location.href = 'login.html';
        return false;
    }

    state.token = token;
    state.user = JSON.parse(userData);
    return true;
}

function initUserPanel() {
    if (state.user) {
        document.getElementById('userName').textContent = state.user.username;
        document.getElementById('userEmail').textContent = state.user.email;
        document.getElementById('userAvatar').textContent = state.user.username.charAt(0).toUpperCase();
    }
}

function initConversations() {
    console.log('✅ Conversations initialisées');
}

async function loadInitialData() {
    showLoading(true);
    
    try {
        await Promise.all([
            loadConversations(),
            loadUnreadCounts()
        ]);
    } catch (error) {
        console.error('Error loading initial data:', error);
        showMessage('Erreur de chargement des données', 'error');
    } finally {
        showLoading(false);
    }
}

async function loadConversations() {
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/conversations`, {
            headers: {'Authorization': `Bearer ${state.token}`}
        });

        const data = await response.json();

        if (response.ok && data.success) {
            state.conversations = data.conversations || [];
            renderConversations();
        } else {
            throw new Error(data.error || 'Erreur de chargement des conversations');
        }
    } catch (error) {
        console.error('Load conversations error:', error);
        throw error;
    }
}

function renderConversations() {
    const contactsList = document.getElementById('contactsList');
    const conversationsContainer = contactsList.querySelector('.contacts-list') || contactsList;
    
    const existingHeader = conversationsContainer.querySelector('.contacts-header');
    conversationsContainer.innerHTML = '';
    
    if (existingHeader) {
        conversationsContainer.appendChild(existingHeader);
    } else {
        const header = document.createElement('div');
        header.className = 'contacts-header';
        header.innerHTML = '<h3>Conversations</h3><span class="unread-count" id="totalUnread">0</span>';
        conversationsContainer.appendChild(header);
    }

    if (state.conversations.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #666;">
                <p>Aucune conversation</p>
                <p style="font-size: 12px; margin-top: 10px;">Commencez une nouvelle discussion</p>
            </div>
        `;
        conversationsContainer.appendChild(emptyState);
        return;
    }

    // Trier les conversations par dernier message
    const sortedConversations = state.conversations.sort((a, b) => {
        const dateA = new Date(a.lastMessageAt || a.createdAt);
        const dateB = new Date(b.lastMessageAt || b.createdAt);
        return dateB - dateA; // Plus récent en premier
    });

    sortedConversations.forEach(conversation => {
        const contactElement = createConversationElement(conversation);
        conversationsContainer.appendChild(contactElement);
    });
}

function createConversationElement(conversation) {
    const element = document.createElement('div');
    element.className = 'contact';
    element.dataset.conversationId = conversation._id;
    
    const isGroup = conversation.type === 'group';
    const displayName = conversation.name || 'Conversation';
    const lastMessage = getLastMessagePreview(conversation);
    const unreadCount = conversation.unreadCount || 0;
    
    const avatarText = isGroup ? '👥' : displayName.charAt(0).toUpperCase();
    
    element.innerHTML = `
        <div class="contact-avatar online">${avatarText}</div>
        <div class="contact-info">
            <h3>${displayName} ${isGroup ? '<span class="group-badge">G</span>' : ''}</h3>
            <p class="last-message">${lastMessage}</p>
        </div>
        <div class="conversation-meta">
            <div class="conversation-time">${formatTime(conversation.lastMessageAt)}</div>
            ${unreadCount > 0 ? `<div class="conversation-badge">${unreadCount}</div>` : ''}
        </div>
    `;

    element.addEventListener('click', () => selectConversation(conversation));
    
    return element;
}

function getLastMessagePreview(conversation) {
    if (!conversation.lastMessage) {
        return 'Aucun message';
    }
    
    if (conversation.lastMessage.includes('Message audio')) {
        return '🎤 Message audio';
    }
    
    return conversation.lastMessage.length > 30 ? 
        conversation.lastMessage.substring(0, 30) + '...' : 
        conversation.lastMessage;
}

async function selectConversation(conversation) {
    if (state.isLoadingMessages) return;
    
    document.querySelectorAll('.contact').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-conversation-id="${conversation._id}"]`).classList.add('active');
    
    state.currentConversation = conversation;
    
    updateChatHeader(conversation);
    
    document.getElementById('messageInputContainer').style.display = 'flex';
    document.getElementById('welcomeMessage').style.display = 'none';
    document.getElementById('messagesList').style.display = 'block';
    
    await loadMessages(conversation._id);
    
    await markAsRead(conversation._id);
    
    if (state.socket) {
        state.socket.emit('join_conversation', conversation._id);
    }
}

function updateChatHeader(conversation) {
    const isGroup = conversation.type === 'group';
    const displayName = conversation.name || 'Conversation';
    
    document.getElementById('chatHeader').style.display = 'flex';
    document.getElementById('chatContactName').textContent = displayName;
    document.getElementById('chatAvatar').textContent = isGroup ? '👥' : displayName.charAt(0).toUpperCase();
    document.getElementById('chatAvatar').className = `chat-contact-avatar online`;
    document.getElementById('chatContactStatus').textContent = isGroup ? 
        `Groupe • ${conversation.participantCount || 0} membres` : 
        '🟢 En ligne';
}

// 🆕 FONCTION LOAD MESSAGES CORRIGÉE
async function loadMessages(conversationId, showLoader = true) {
    if (state.isLoadingMessages) return;
    
    state.isLoadingMessages = true;
    
    if (showLoader) {
        showMessageLoading(true);
    }
    
    try {
        console.log('📨 Chargement des messages pour la conversation:', conversationId);
        
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/messages/${conversationId}?limit=100`, {
            headers: {'Authorization': `Bearer ${state.token}`}
        });

        const data = await response.json();

        if (response.ok && data.success) {
            console.log('✅ Messages reçus de l\'API:', data.messages.length);
            
            // 🆕 DEBUG COMPLET DES DONNÉES
            debugMessageData(data.messages);
            
            // 🆕 TRI CHRONOLOGIQUE ROBUSTE
            const sortedMessages = data.messages.sort((a, b) => {
                const dateA = new Date(a.createdAt || a.timestamp || a.date);
                const dateB = new Date(b.createdAt || b.timestamp || b.date);
                return dateA - dateB; // Ordre chronologique
            });
            
            state.messages.set(conversationId, sortedMessages);
            renderMessages(conversationId);
        } else {
            throw new Error(data.error || 'Erreur de chargement des messages');
        }
    } catch (error) {
        console.error('Load messages error:', error);
        showMessage('Erreur de chargement des messages', 'error');
    } finally {
        state.isLoadingMessages = false;
        if (showLoader) {
            showMessageLoading(false);
        }
    }
}

// 🆕 FONCTION RENDER MESSAGES CORRIGÉE
function renderMessages(conversationId) {
    const messagesList = document.getElementById('messagesList');
    const messages = state.messages.get(conversationId) || [];
    
    console.log('🔍 Affichage de', messages.length, 'messages dans l\'ordre chronologique');
    
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

    // 🆕 AFFICHAGE DANS L'ORDRE CHRONOLOGIQUE
    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        messagesList.appendChild(messageElement);
    });

    scrollToBottom();
}

// 🆕 FONCTION CREATE MESSAGE ELEMENT COMPLÈTEMENT CORRIGÉE
function createMessageElement(message) {
    const element = document.createElement('div');
    
    const isSent = isMyMessage(message);
    
    console.log(`🎯 Création message: "${message.content}" - estDeMoi: ${isSent}`);
    console.log('📅 Données complètes:', {
        content: message.content,
        createdAt: message.createdAt,
        timestamp: message.timestamp,
        sender: message.Id_sender,
        isSent: isSent
    });
    
    element.className = `message ${isSent ? 'sent' : 'received'}`;
    element.dataset.messageId = message._id;
    
    // 🆕 GESTION ROBUSTE DE LA DATE ET HEURE
    const time = formatMessageTimeRobuste(message);
    const statusIcon = isSent ? (message.status === 'seen' ? '✓✓' : '✓') : '';
    
    element.innerHTML = `
        <div class="message-content">${escapeHtml(message.content)}</div>
        <div class="message-time">${time} ${statusIcon}</div>
    `;
    
    // 🆕 STYLES FORCÉS POUR LA SÉPARATION
    element.style.alignSelf = isSent ? 'flex-end' : 'flex-start';
    element.style.marginLeft = isSent ? 'auto' : '0';
    element.style.marginRight = isSent ? '0' : 'auto';
    element.style.maxWidth = '70%';
    
    return element;
}

// 🆕 FONCTION AMÉLIORÉE POUR DÉTERMINER SI LE MESSAGE EST DE MOI
function isMyMessage(message) {
    if (!message || !state.user) {
        console.log('❌ Message ou user manquant');
        return false;
    }
    
    // 🆕 GESTION ROBUSTE DE L'EXPÉDITEUR
    let senderId;
    
    if (typeof message.Id_sender === 'string') {
        senderId = message.Id_sender;
    } else if (message.Id_sender && message.Id_sender._id) {
        senderId = message.Id_sender._id.toString();
    } else if (message.Id_sender && typeof message.Id_sender === 'object') {
        senderId = message.Id_sender.toString();
    } else {
        senderId = message.senderId || null;
    }
    
    const myId = state.user.id || state.user._id;
    
    console.log('🔍 Analyse expéditeur:', {
        senderData: message.Id_sender,
        senderId: senderId,
        myId: myId,
        isEqual: senderId === myId
    });
    
    if (!senderId || !myId) {
        console.log('❌ ID manquant - senderId:', senderId, 'myId:', myId);
        return false;
    }
    
    const result = senderId === myId;
    console.log(`✅ Résultat: ${result ? 'MESSAGE DE MOI' : 'MESSAGE DE QUELQU\'UN D\'AUTRE'}`);
    
    return result;
}

// 🆕 FONCTION FORMAT TIME ROBUSTE
function formatMessageTimeRobuste(message) {
    // 🆕 ESSAYER DIFFÉRENTS CHAMPS DE DATE
    const dateString = message.createdAt || message.timestamp || message.date || message.created_at;
    
    if (!dateString) {
        console.log('❌ Aucune date trouvée pour le message:', message._id);
        return '--:--';
    }
    
    try {
        const date = new Date(dateString);
        
        // 🆕 VÉRIFICATION QUE LA DATE EST VALIDE
        if (isNaN(date.getTime())) {
            console.log('❌ Date invalide:', dateString);
            return '--:--';
        }
        
        const timeString = date.toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
        
        console.log(`🕒 Date convertie: ${dateString} → ${timeString}`);
        return timeString;
        
    } catch (error) {
        console.error('❌ Erreur formatage date:', error, 'Date:', dateString);
        return '--:--';
    }
}

// 🆕 FONCTION DE DEBUG COMPLÈTE
function debugMessageData(messages) {
    console.log('🐛 DEBUG COMPLET DES MESSAGES:');
    console.log('📊 Nombre de messages:', messages.length);
    console.log('👤 User actuel:', state.user);
    
    if (messages.length === 0) {
        console.log('❌ Aucun message à afficher');
        return;
    }
    
    console.log('🕒 Plage temporelle:');
    console.log('   Premier message:', messages[0].createdAt, '-', messages[0].content);
    console.log('   Dernier message:', messages[messages.length - 1].createdAt, '-', messages[messages.length - 1].content);
    
    console.log('🔍 Détail de chaque message:');
    messages.forEach((msg, index) => {
        const isSent = isMyMessage(msg);
        console.log(`--- Message ${index + 1} ---`);
        console.log('Contenu:', msg.content);
        console.log('ID Message:', msg._id);
        console.log('Expéditeur:', msg.Id_sender);
        console.log('Date création:', msg.createdAt);
        console.log('Timestamp:', msg.timestamp);
        console.log('Est mon message?:', isSent);
        console.log('Heure formatée:', formatMessageTimeRobuste(msg));
        console.log('-------------------');
    });
}

function initMessageInput() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    let typingTimer;

    messageInput.addEventListener('input', () => {
        if (state.currentConversation && state.socket) {
            state.socket.emit('user_typing', {
                conversationId: state.currentConversation._id,
                isTyping: true
            });
            
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                if (state.socket) {
                    state.socket.emit('user_typing', {
                        conversationId: state.currentConversation._id,
                        isTyping: false
                    });
                }
            }, 1000);
        }
    });

    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    sendButton.addEventListener('click', sendMessage);
}

// 🆕 FONCTION SEND MESSAGE CORRIGÉE
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const content = messageInput.value.trim();
    
    if (!content || !state.currentConversation) return;

    const sendButton = document.getElementById('sendButton');
    const sendStatus = document.getElementById('sendStatus');

    try {
        setButtonLoading(sendButton, true);
        sendStatus.textContent = 'Envoi...';

        // VIDER LE CHAMP IMMÉDIATEMENT
        messageInput.value = '';

        if (state.socket && state.isConnected) {
            // Utiliser WebSocket pour l'envoi en temps réel
            state.socket.emit('send_message', {
                conversationId: state.currentConversation._id,
                content: content,
                typeMessage: 'text'
            });
            
            sendStatus.textContent = 'Envoi...';
        } else {
            // Fallback HTTP
            const response = await fetch(`${CONFIG.BACKEND_URL}/api/messages/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.token}`
                },
                body: JSON.stringify({
                    conversationId: state.currentConversation._id,
                    content: content,
                    typeMessage: 'text'
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur d\'envoi');
            }
            
            // Recharger les messages après envoi réussi
            await loadMessages(state.currentConversation._id, false);
            sendStatus.textContent = '✓ Envoyé';
        }

        setTimeout(() => {
            sendStatus.textContent = '';
        }, 2000);

    } catch (error) {
        console.error('Send message error:', error);
        sendStatus.textContent = '❌ Erreur';
        showMessage('Erreur d\'envoi du message', 'error');
        
        // Remettre le message dans le champ en cas d'erreur
        messageInput.value = content;
    } finally {
        setButtonLoading(sendButton, false);
    }
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messagesContainer');
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
}

// ===== WEBSOCKET =====
function initWebSocket() {
    if (!state.token) return;

    try {
        if (typeof io !== 'undefined') {
            connectSocketIO();
        } else {
            console.warn('Socket.IO not available, using fallback');
        }
    } catch (error) {
        console.error('WebSocket initialization error:', error);
    }
}

function connectSocketIO() {
    state.socket = io(CONFIG.SOCKET_URL, {
        auth: { token: state.token },
        transports: ['websocket', 'polling']
    });

    state.socket.on('connect', () => {
        console.log('🔗 WebSocket connected');
        state.isConnected = true;
        state.reconnectAttempts = 0;
        updateConnectionStatus('🟢 Connecté');
        
        state.socket.emit('join_notifications');
        if (state.currentConversation) {
            state.socket.emit('join_conversation', state.currentConversation._id);
        }
    });

    state.socket.on('disconnect', (reason) => {
        console.log('🔴 WebSocket disconnected:', reason);
        state.isConnected = false;
        updateConnectionStatus('🔴 Déconnecté');
        
        if (reason === 'io server disconnect') {
            setTimeout(() => {
                state.socket.connect();
            }, CONFIG.RECONNECT_DELAY);
        }
    });

    state.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        updateConnectionStatus('🔴 Erreur connexion');
        
        state.reconnectAttempts++;
        if (state.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
            setTimeout(() => {
                state.socket.connect();
            }, CONFIG.RECONNECT_DELAY * state.reconnectAttempts);
        }
    });

    state.socket.on('new_message', (message) => {
        console.log('📨 New message received:', message);
        handleNewMessage(message);
    });

    state.socket.on('user_typing', (data) => {
        handleTypingIndicator(data);
    });

    state.socket.on('message_sent', (data) => {
        console.log('✅ Message sent confirmation:', data);
        updateMessageStatus(data.data._id, 'sent');
    });

    state.socket.on('message_error', (data) => {
        console.error('❌ Message error:', data);
        showMessage('Erreur d\'envoi du message', 'error');
    });
}

// 🆕 FONCTION POUR GÉRER LES NOUVEAUX MESSAGES
function handleNewMessage(message) {
    console.log('📨 Nouveau message reçu:', message);
    
    if (state.currentConversation && message.conversationId === state.currentConversation._id) {
        // Vérifier si le message n'existe pas déjà
        const existingMessages = state.messages.get(state.currentConversation._id) || [];
        const messageExists = existingMessages.some(m => m._id === message._id);
        
        if (!messageExists) {
            // Ajouter le nouveau message et trier
            existingMessages.push(message);
            const sortedMessages = existingMessages.sort((a, b) => {
                const dateA = new Date(a.createdAt || a.timestamp || a.date);
                const dateB = new Date(b.createdAt || b.timestamp || b.date);
                return dateA - dateB;
            });
            
            state.messages.set(state.currentConversation._id, sortedMessages);
            renderMessages(state.currentConversation._id);
        }
        
        markAsRead(state.currentConversation._id);
    } else {
        updateConversationBadge(message.conversationId);
        showNotification({
            type: 'new_message',
            conversationId: message.conversationId,
            senderName: message.Id_sender?.username || 'Quelqu\'un',
            messagePreview: message.content
        });
    }
    
    updateConversationLastMessage(message.conversationId, message);
}

function handleTypingIndicator(data) {
    const typingIndicator = document.getElementById('typingIndicator');
    const typingText = document.getElementById('typingText');
    
    if (data.isTyping) {
        state.typingUsers.set(data.userId, {
            userName: data.userName,
            timestamp: Date.now()
        });
        
        const typingUsers = Array.from(state.typingUsers.values()).map(u => u.userName);
        typingText.textContent = `${typingUsers.join(', ')} ${typingUsers.length === 1 ? 'est' : 'sont'} en train d'écrire...`;
        typingIndicator.style.display = 'flex';
    } else {
        state.typingUsers.delete(data.userId);
        
        if (state.typingUsers.size === 0) {
            typingIndicator.style.display = 'none';
        } else {
            const typingUsers = Array.from(state.typingUsers.values()).map(u => u.userName);
            typingText.textContent = `${typingUsers.join(', ')} ${typingUsers.length === 1 ? 'est' : 'sont'} en train d'écrire...`;
        }
    }
    
    const now = Date.now();
    state.typingUsers.forEach((value, key) => {
        if (now - value.timestamp > 5000) {
            state.typingUsers.delete(key);
        }
    });
}

// ===== FONCTIONNALITÉS AVANCÉES =====
function initTestButtons() {
    document.getElementById('testNotifBtn')?.addEventListener('click', () => {
        showTestNotification();
    });

    document.getElementById('notifPermissionBtn')?.addEventListener('click', () => {
        requestNotificationPermission();
    });

    document.getElementById('newConversationBtn')?.addEventListener('click', () => {
        showNewConversationModal();
    });

    document.getElementById('createGroupBtn')?.addEventListener('click', () => {
        showCreateGroupModal();
    });
}

function initModals() {
    document.getElementById('closeConversationModal')?.addEventListener('click', () => {
        document.getElementById('newConversationModal').style.display = 'none';
    });

    document.getElementById('closeGroupModal')?.addEventListener('click', () => {
        document.getElementById('createGroupModal').style.display = 'none';
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
}

function showNewConversationModal() {
    document.getElementById('newConversationModal').style.display = 'flex';
}

function showCreateGroupModal() {
    document.getElementById('createGroupModal').style.display = 'flex';
}

async function markAsRead(conversationId) {
    try {
        await fetch(`${CONFIG.BACKEND_URL}/api/conversations/mark-as-read/${conversationId}`, {
            method: 'POST',
            headers: {'Authorization': `Bearer ${state.token}`}
        });

        updateConversationBadge(conversationId, 0);
    } catch (error) {
        console.error('Mark as read error:', error);
    }
}

async function loadUnreadCounts() {
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/conversations/unread-counts/${state.user.id}`, {
            headers: {'Authorization': `Bearer ${state.token}`}
        });

        const data = await response.json();

        if (response.ok && data.success) {
            data.conversationCounts.forEach(item => {
                updateConversationBadge(item.conversationId, item.unreadCount);
            });

            document.getElementById('totalUnread').textContent = data.totalUnread;
        }
    } catch (error) {
        console.error('Load unread counts error:', error);
    }
}

function updateConversationBadge(conversationId, count = null) {
    const conversationElement = document.querySelector(`[data-conversation-id="${conversationId}"]`);
    if (conversationElement) {
        const badge = conversationElement.querySelector('.conversation-badge');
        const meta = conversationElement.querySelector('.conversation-meta');
        
        if (count === null || count > 0) {
            if (badge) {
                const currentCount = parseInt(badge.textContent) || 0;
                count = currentCount + 1;
                badge.textContent = count;
            } else {
                count = count || 1;
                if (!badge && meta) {
                    const newBadge = document.createElement('div');
                    newBadge.className = 'conversation-badge';
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
    const total = Array.from(document.querySelectorAll('.conversation-badge'))
        .reduce((sum, badge) => sum + parseInt(badge.textContent), 0);
    
    document.getElementById('totalUnread').textContent = total;
    
    const notificationBadge = document.getElementById('notificationBadge');
    if (total > 0) {
        notificationBadge.textContent = total;
        notificationBadge.style.display = 'flex';
    } else {
        notificationBadge.style.display = 'none';
    }
}

function updateConversationLastMessage(conversationId, message) {
    const conversationElement = document.querySelector(`[data-conversation-id="${conversationId}"]`);
    if (conversationElement) {
        const lastMessageElement = conversationElement.querySelector('.contact-info p');
        const timeElement = conversationElement.querySelector('.conversation-time');
        
        if (lastMessageElement) {
            lastMessageElement.textContent = getLastMessagePreview({ lastMessage: message.content });
        }
        
        if (timeElement) {
            timeElement.textContent = formatTime(message.createdAt);
        }
        
        // Re-trier les conversations
        const contactsList = document.getElementById('contactsList');
        const conversationsContainer = contactsList.querySelector('.contacts-list') || contactsList;
        
        // Supprimer et réinsérer pour remettre en haut
        conversationElement.remove();
        const header = conversationsContainer.querySelector('.contacts-header');
        conversationsContainer.insertBefore(conversationElement, header.nextSibling);
    }
}

// ===== NOTIFICATIONS =====
function showTestNotification() {
    showNotification({
        type: 'test',
        title: 'Test de notification',
        content: 'Ceci est une notification de test depuis Owly!',
        senderName: 'Système'
    });
}

function showNotification(data) {
    const notificationPopup = document.getElementById('notificationPopup');
    const notificationTitle = document.getElementById('notificationTitle');
    const notificationContent = document.getElementById('notificationContent');
    
    if (data.type === 'new_message') {
        notificationTitle.textContent = 'Nouveau message';
        notificationContent.innerHTML = `<strong>${data.senderName}</strong>: ${data.messagePreview}`;
    } else {
        notificationTitle.textContent = data.title || 'Notification';
        notificationContent.textContent = data.content || 'Nouvelle notification';
    }
    
    notificationPopup.style.display = 'block';
    
    const replyBtn = document.getElementById('notificationReplyBtn');
    const openBtn = document.getElementById('notificationOpenBtn');
    
    replyBtn.onclick = () => {
        if (data.conversationId) {
            const conversation = state.conversations.find(c => c._id === data.conversationId);
            if (conversation) {
                selectConversation(conversation);
            }
            notificationPopup.style.display = 'none';
        }
    };
    
    openBtn.onclick = () => {
        if (data.conversationId) {
            const conversation = state.conversations.find(c => c._id === data.conversationId);
            if (conversation) {
                selectConversation(conversation);
            }
        }
        notificationPopup.style.display = 'none';
    };
    
    document.getElementById('closeNotification').onclick = () => {
        notificationPopup.style.display = 'none';
    };
    
    setTimeout(() => {
        if (notificationPopup.style.display !== 'none') {
            notificationPopup.style.display = 'none';
        }
    }, 5000);
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert('Votre navigateur ne supporte pas les notifications');
        return;
    }
    
    try {
        const permission = await Notification.requestPermission();
        state.notificationPermission = permission;
        
        if (permission === 'granted') {
            showMessage('Notifications activées!', 'success');
            document.getElementById('notifPermissionBtn').classList.add('hidden');
        } else {
            showMessage('Notifications bloquées', 'error');
        }
    } catch (error) {
        console.error('Notification permission error:', error);
        showMessage('Erreur d\'activation des notifications', 'error');
    }
}

// ===== UTILITAIRES =====
function setButtonLoading(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const btnLoading = button.querySelector('.btn-loading');
    
    if (btnText && btnLoading) {
        btnText.classList.toggle('hidden', isLoading);
        btnLoading.classList.toggle('hidden', !isLoading);
    }
    
    button.disabled = isLoading;
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
}

// 🆕 FONCTION POUR LE CHARGEMENT DES MESSAGES
function showMessageLoading(show) {
    const messagesList = document.getElementById('messagesList');
    if (!messagesList) return;
    
    if (show) {
        const loader = document.createElement('div');
        loader.className = 'message-loader';
        loader.innerHTML = '<div class="loading-spinner"></div><span>Chargement des messages...</span>';
        loader.id = 'messageLoader';
        messagesList.appendChild(loader);
    } else {
        const loader = document.getElementById('messageLoader');
        if (loader) {
            loader.remove();
        }
    }
}

function showMessage(message, type = 'info') {
    const container = document.getElementById('messageContainer');
    if (!container) return;
    
    container.className = `message-container ${type}`;
    container.textContent = message;
    container.style.display = 'block';
    
    setTimeout(() => {
        container.style.display = 'none';
    }, 5000);
}

function updateConnectionStatus(status) {
    const statusElement = document.getElementById('wsStatus');
    if (statusElement) {
        statusElement.textContent = status;
    }
}

function formatTime(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Maintenant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours} h`;
    if (diffDays < 7) return `Il y a ${diffDays} j`;
    
    return date.toLocaleDateString('fr-FR');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateMessageStatus(messageId, status) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.classList.remove('pending');
        const timeElement = messageElement.querySelector('.message-time');
        if (timeElement) {
            const timeText = timeElement.textContent.replace(/[✓✓✓]/g, '').trim();
            timeElement.textContent = `${timeText} ${status === 'seen' ? '✓✓' : '✓'}`;
        }
    }
}

// Gestion de la déconnexion
window.addEventListener('beforeunload', () => {
    if (state.socket) {
        state.socket.disconnect();
    }
});

// Export pour debug
window.owlyState = state;