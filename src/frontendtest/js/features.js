// ===== UPLOAD DE FICHIERS =====
function initFileUploads() {
    const imageBtn = document.getElementById('imageBtn');
    const fileBtn = document.getElementById('fileBtn');
    const videoBtn = document.getElementById('videoBtn');
    const imageInput = document.getElementById('imageInput');
    const fileInput = document.getElementById('fileInput');
    const videoInput = document.getElementById('videoInput');

    imageBtn?.addEventListener('click', () => imageInput.click());
    fileBtn?.addEventListener('click', () => fileInput.click());
    videoBtn?.addEventListener('click', () => videoInput.click());

    imageInput?.addEventListener('change', (e) => handleFileSelect(e, 'image'));
    fileInput?.addEventListener('change', (e) => handleFileSelect(e, 'file'));
    videoInput?.addEventListener('change', (e) => handleFileSelect(e, 'video'));

    document.getElementById('closePreviewModal')?.addEventListener('click', closePreviewModal);
    document.getElementById('cancelPreviewBtn')?.addEventListener('click', closePreviewModal);
    document.getElementById('sendPreviewBtn')?.addEventListener('click', sendFileMessage);

    console.log('✅ Système upload fichiers initialisé');
}

function handleFileSelect(event, type) {
    const files = event.target.files;
    if (!files.length) return;

    const file = files[0];
    
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        showMessage(`Fichier trop volumineux (max ${formatFileSize(CONFIG.MAX_FILE_SIZE)})`, 'error');
        return;
    }

    if (type === 'image' && !file.type.startsWith('image/')) {
        showMessage('Veuillez sélectionner une image valide', 'error');
        return;
    }

    if (type === 'video' && !file.type.startsWith('video/')) {
        showMessage('Veuillez sélectionner une vidéo valide', 'error');
        return;
    }

    state.pendingFiles = [{
        file: file,
        type: type,
        previewUrl: URL.createObjectURL(file)
    }];

    showPreviewModal(state.pendingFiles[0]);
    event.target.value = '';
}

function showPreviewModal(fileData) {
    const previewContent = document.getElementById('previewContent');
    const modal = document.getElementById('previewModal');

    let content = '';
    
    switch (fileData.type) {
        case 'image':
            content = `<img src="${fileData.previewUrl}" alt="Prévisualisation">`;
            break;
        case 'video':
            content = `<video controls><source src="${fileData.previewUrl}" type="${fileData.file.type}"></video>`;
            break;
        case 'audio':
            content = `
                <div class="audio-preview-large">
                    <div class="audio-icon">🎵</div>
                    <div class="audio-info">
                        <div class="audio-name">${fileData.file.name}</div>
                        <div class="audio-size">${formatFileSize(fileData.file.size)}</div>
                        <div class="audio-type">Fichier audio</div>
                    </div>
                    <audio controls class="audio-player">
                        <source src="${fileData.previewUrl}" type="${fileData.file.type}">
                        Votre navigateur ne supporte pas la lecture audio.
                    </audio>
                </div>
            `;
            break;
        case 'file':
            content = `
                <div class="file-preview-large">
                    <div class="file-icon">📄</div>
                    <div class="file-info">
                        <div class="file-name">${fileData.file.name}</div>
                        <div class="file-size">${formatFileSize(fileData.file.size)}</div>
                        <div class="file-type">${fileData.file.type || 'Type inconnu'}</div>
                    </div>
                </div>
            `;
            break;
    }

    previewContent.innerHTML = content;
    modal.style.display = 'flex';
}

function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    modal.style.display = 'none';
    
    state.pendingFiles.forEach(fileData => {
        if (fileData.previewUrl) {
            URL.revokeObjectURL(fileData.previewUrl);
        }
    });
    
    state.pendingFiles = [];
}

async function sendFileMessage() {
    if (!state.pendingFiles.length || !state.currentConversation) {
        showMessage('Aucun fichier à envoyer', 'error');
        return;
    }

    const fileData = state.pendingFiles[0];
    const sendBtn = document.getElementById('sendPreviewBtn');
    const sendStatus = document.getElementById('sendStatus');

    try {
        setButtonLoading(sendBtn, true);
        sendStatus.textContent = 'Envoi en cours...';

        const base64 = await fileToBase64(fileData.file);

        const messageData = {
            conversationId: state.currentConversation._id,
            Id_receiver: getOtherParticipantId(),
            file: base64,
            fileName: fileData.file.name,
            fileType: fileData.file.type,
            fileSize: fileData.file.size,
            originalName: fileData.file.name
        };

        let eventName;
        switch (fileData.type) {
            case 'image':
                eventName = 'send_image_message';
                break;
            case 'video':
                eventName = 'send_video_message';
                break;
            case 'audio':
                eventName = 'send_audio_message';
                break;
            case 'file':
                eventName = 'send_file_message';
                break;
        }

        if (state.socket && state.isConnected) {
            state.socket.emit(eventName, messageData);
            sendStatus.textContent = 'Envoi...';
            closePreviewModal();
            showMessage('Fichier en cours d\'envoi...', 'success');
        } else {
            closePreviewModal();
            showMessage('WebSocket déconnecté - Recharge la page et réessaye', 'error');
        }

    } catch (error) {
        console.error('Send file error:', error);
        sendStatus.textContent = '❌ Erreur';
        showMessage('Erreur: ' + error.message, 'error');
    } finally {
        setButtonLoading(sendBtn, false);
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// ===== 🎤 ENREGISTREMENT VOCAL =====
function initVoiceRecording() {
    console.log("🎤 Initialisation enregistrement vocal...");
    
    const voiceBtn = document.getElementById('voiceMessageBtn');
    const startBtn = document.getElementById('startRecordBtn');
    const stopBtn = document.getElementById('stopRecordBtn');
    const playBtn = document.getElementById('playRecordBtn');
    const sendBtn = document.getElementById('sendRecordBtn');
    const closeBtn = document.getElementById('closeVoiceModal');
    
    voiceBtn?.addEventListener('click', showVoiceRecordModal);
    startBtn?.addEventListener('click', startRecording);
    stopBtn?.addEventListener('click', stopRecording);
    playBtn?.addEventListener('click', playRecording);
    sendBtn?.addEventListener('click', sendVoiceMessage);
    closeBtn?.addEventListener('click', closeVoiceRecordModal);
    
    console.log("✅ Enregistrement vocal initialisé");
}

async function showVoiceRecordModal() {
    if (!state.currentConversation) {
        showMessage("Sélectionnez une conversation d'abord", "warning");
        return;
    }
    
    try {
        console.log("🎤 Demande d'accès au microphone...");
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: 44100
            } 
        });
        
        state.audioRecorder.mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus'
        });
        state.audioRecorder.audioChunks = [];
        
        state.audioRecorder.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                state.audioRecorder.audioChunks.push(event.data);
            }
        };
        
        state.audioRecorder.mediaRecorder.onstop = () => {
            state.audioRecorder.audioBlob = new Blob(state.audioRecorder.audioChunks, { 
                type: 'audio/webm;codecs=opus'
            });
            state.audioRecorder.audioUrl = URL.createObjectURL(state.audioRecorder.audioBlob);
            
            document.getElementById('playRecordBtn').disabled = false;
            document.getElementById('sendRecordBtn').disabled = false;
            document.getElementById('recordingStatus').textContent = '✅ Enregistrement terminé';
            document.getElementById('recordingStatus').style.color = '#4caf50';
            
            // Calculer la durée réelle
            const duration = Math.round((Date.now() - state.audioRecorder.recordingStartTime) / 1000);
            state.audioRecorder.audioDuration = duration;
            
            console.log(`🎤 Enregistrement terminé - Durée: ${duration}s - Taille: ${state.audioRecorder.audioBlob.size} bytes`);
        };
        
        document.getElementById('voiceRecordModal').style.display = 'flex';
        resetRecordingUI();
        
        console.log("✅ Microphone accessible, modal ouvert");
        
    } catch (error) {
        console.error('❌ Erreur accès microphone:', error);
        showMessage('Accès au microphone refusé ou non disponible', 'error');
    }
}

function startRecording() {
    if (!state.audioRecorder.mediaRecorder) return;
    
    state.audioRecorder.audioChunks = [];
    state.audioRecorder.isRecording = true;
    state.audioRecorder.recordingStartTime = Date.now();
    state.audioRecorder.audioDuration = 0;
    
    state.audioRecorder.mediaRecorder.start(100);
    
    document.getElementById('startRecordBtn').disabled = true;
    document.getElementById('stopRecordBtn').disabled = false;
    document.getElementById('recordingStatus').textContent = '🔴 Enregistrement en cours...';
    document.getElementById('recordingStatus').style.color = '#ff4444';
    
    startRecordingTimer();
    
    console.log("🎤 Enregistrement démarré");
}

function stopRecording() {
    if (!state.audioRecorder.mediaRecorder || !state.audioRecorder.isRecording) return;
    
    state.audioRecorder.mediaRecorder.stop();
    state.audioRecorder.isRecording = false;
    
    document.getElementById('startRecordBtn').disabled = false;
    document.getElementById('stopRecordBtn').disabled = true;
    
    stopRecordingTimer();
    
    console.log("🎤 Enregistrement arrêté");
}

function playRecording() {
    if (!state.audioRecorder.audioUrl) return;
    
    const audio = new Audio(state.audioRecorder.audioUrl);
    
    document.getElementById('recordingStatus').textContent = '▶️ Lecture en cours...';
    document.getElementById('recordingStatus').style.color = '#2196f3';
    
    audio.play().catch(error => {
        console.error('❌ Erreur lecture audio:', error);
        showMessage('Erreur lors de la lecture', 'error');
    });
    
    audio.onended = () => {
        document.getElementById('recordingStatus').textContent = '✅ Enregistrement terminé';
        document.getElementById('recordingStatus').style.color = '#4caf50';
    };
    
    console.log("🎤 Lecture de l'enregistrement");
}

async function sendVoiceMessage() {
    if (!state.audioRecorder.audioBlob || !state.currentConversation) {
        showMessage('Aucun enregistrement à envoyer', 'error');
        return;
    }
    
    const sendBtn = document.getElementById('sendRecordBtn');
    
    try {
        setButtonLoading(sendBtn, true);
        console.log("🎤 Envoi du message vocal via API...");
        
        const formData = new FormData();
        const audioFile = new File([state.audioRecorder.audioBlob], 
            `voice_message_${Date.now()}.webm`, {
            type: 'audio/webm'
        });
        formData.append('audio', audioFile);
        formData.append('conversationId', state.currentConversation._id);

        console.log("📤 Données envoyées:", {
            conversationId: state.currentConversation._id,
            duration: state.audioRecorder.audioDuration,
            fileSize: audioFile.size
        });

        const response = await fetch(`${CONFIG.BACKEND_URL}/api/messages/audio/send`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`
            },
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            console.log("✅ Message audio envoyé avec succès:", data);
            showMessage('Message vocal envoyé!', 'success');
            
            closeVoiceRecordModal();
            
            if (state.currentConversation) {
                await loadMessages(state.currentConversation._id, false);
            }
        } else {
            throw new Error(data.message || data.error || 'Erreur d\'envoi');
        }
        
    } catch (error) {
        console.error('❌ Erreur envoi message vocal:', error);
        showMessage(`Erreur: ${error.message}`, 'error');
    } finally {
        setButtonLoading(sendBtn, false);
    }
}

function startRecordingTimer() {
    state.audioRecorder.recordingTimer = setInterval(() => {
        const elapsed = Date.now() - state.audioRecorder.recordingStartTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const displaySeconds = seconds % 60;
        
        document.getElementById('recordingTime').textContent = 
            `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
            
        if (seconds >= 300) {
            stopRecording();
            showMessage('Enregistrement automatiquement arrêté après 5 minutes', 'info');
        }
    }, 1000);
}

function stopRecordingTimer() {
    if (state.audioRecorder.recordingTimer) {
        clearInterval(state.audioRecorder.recordingTimer);
    }
}

function resetRecordingUI() {
    document.getElementById('recordingTime').textContent = '00:00';
    document.getElementById('recordingStatus').textContent = 'Prêt à enregistrer';
    document.getElementById('recordingStatus').style.color = '#f9ee34';
    
    document.getElementById('startRecordBtn').disabled = false;
    document.getElementById('stopRecordBtn').disabled = true;
    document.getElementById('playRecordBtn').disabled = true;
    document.getElementById('sendRecordBtn').disabled = true;
}

function closeVoiceRecordModal() {
    if (state.audioRecorder.isRecording) {
        stopRecording();
    }
    
    if (state.audioRecorder.mediaRecorder && state.audioRecorder.mediaRecorder.stream) {
        state.audioRecorder.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    if (state.audioRecorder.audioUrl) {
        URL.revokeObjectURL(state.audioRecorder.audioUrl);
    }
    
    state.audioRecorder = {
        mediaRecorder: null,
        audioChunks: [],
        audioBlob: null,
        audioUrl: null,
        isRecording: false,
        recordingTimer: null,
        recordingStartTime: null,
        audioDuration: 0
    };
    
    document.getElementById('voiceRecordModal').style.display = 'none';
    console.log("🎤 Modal enregistrement fermé");
}

// ===== RÉACTIONS =====
function initReactionsSystem() {
    console.log("🎯 Initialisation du système de réactions...");
    loadAvailableReactions();
    
    document.getElementById('reactionsBtn')?.addEventListener('click', showReactionsForCurrentConversation);
    document.getElementById('closeReactionsModal')?.addEventListener('click', closeReactionsModal);
    document.getElementById('testReactionBtn')?.addEventListener('click', testReactionSystem);
    
    document.getElementById('reactionsModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'reactionsModal') {
            closeReactionsModal();
        }
    });
    
    console.log("✅ Système de réactions initialisé");
}

async function loadAvailableReactions() {
    try {
        console.log("🔄 Chargement des réactions disponibles...");
        
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/reactions/available`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            state.availableReactions = data.reactions || [];
            console.log("✅ Réactions chargées:", state.availableReactions);
            updateReactionsModal();
        } else {
            console.warn("⚠️ Impossible de charger les réactions, utilisation des valeurs par défaut");
            state.availableReactions = ["❤️", "👍", "😂", "😮", "😢", "😡", "🎉", "🔥", "👏", "💯"];
        }
    } catch (error) {
        console.error("❌ Erreur chargement réactions:", error);
        state.availableReactions = ["❤️", "👍", "😂", "😮", "😢", "😡", "🎉", "🔥", "👏", "💯"];
    }
}

function updateReactionsModal() {
    const reactionsGrid = document.getElementById('reactionsGrid');
    if (!reactionsGrid) return;
    
    reactionsGrid.innerHTML = '';
    
    if (state.availableReactions.length === 0) {
        reactionsGrid.innerHTML = '<div class="no-reactions">Aucune réaction disponible</div>';
        return;
    }
    
    state.availableReactions.forEach(emoji => {
        const button = document.createElement('button');
        button.className = 'reaction-btn';
        button.textContent = emoji;
        button.dataset.emoji = emoji;
        button.title = `Réagir avec ${emoji}`;
        
        button.addEventListener('click', () => {
            addReactionToCurrentMessage(emoji);
        });
        
        reactionsGrid.appendChild(button);
    });
}

function showReactionsForCurrentConversation() {
    if (!state.currentConversation) {
        showMessage("Sélectionnez d'abord une conversation", "warning");
        return;
    }
    showReactionsModal();
}

function showReactionsModal(messageId = null) {
    state.currentMessageForReaction = messageId;
    const modal = document.getElementById('reactionsModal');
    modal.style.display = 'flex';
    updateReactionsModal();
}

function closeReactionsModal() {
    const modal = document.getElementById('reactionsModal');
    modal.style.display = 'none';
    state.currentMessageForReaction = null;
}

async function addReactionToCurrentMessage(emoji) {
    if (!state.currentMessageForReaction) {
        showMessage("Aucun message sélectionné pour réagir", "warning");
        closeReactionsModal();
        return;
    }
    
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/reactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                messageId: state.currentMessageForReaction,
                emoji: emoji
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log("✅ Réaction ajoutée:", data);
            showMessage(`Réaction ${emoji} ajoutée!`, "success");
            
            if (state.currentConversation) {
                await loadMessages(state.currentConversation._id, false);
            }
        } else {
            showMessage(data.error || "Erreur lors de l'ajout de la réaction", "error");
        }
    } catch (error) {
        console.error("❌ Erreur ajout réaction:", error);
        showMessage("Erreur de connexion", "error");
    }
    
    closeReactionsModal();
}

function testReactionSystem() {
    if (!state.currentConversation) {
        showMessage("Ouvrez une conversation pour tester les réactions", "warning");
        return;
    }
    
    const messages = state.messages.get(state.currentConversation._id) || [];
    if (messages.length === 0) {
        showMessage("Envoyez un message pour tester les réactions", "warning");
        return;
    }
    
    const testMessage = messages[0];
    showReactionsModal(testMessage._id);
    showMessage("Cliquez sur une réaction pour tester!", "info");
}

// ===== PROFIL UTILISATEUR =====
function initUserProfileSystem() {
    console.log("🎯 Initialisation du système de profil...");
    
    document.getElementById('infoBtn')?.addEventListener('click', showUserProfile);
    document.getElementById('closeProfileModal')?.addEventListener('click', closeUserProfile);
    document.getElementById('blockUserBtn')?.addEventListener('click', blockCurrentUser);
    document.getElementById('unblockUserBtn')?.addEventListener('click', unblockCurrentUser);
    
    document.getElementById('userProfileModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'userProfileModal') {
            closeUserProfile();
        }
    });
    
    console.log("✅ Système de profil initialisé");
}

function showUserProfile() {
    if (!state.currentConversation) {
        showMessage("Sélectionnez une conversation pour voir le profil", "warning");
        return;
    }
    
    const modal = document.getElementById('userProfileModal');
    const otherUser = getOtherParticipant();
    
    if (otherUser) {
        document.getElementById('profileAvatar').textContent = otherUser.username?.charAt(0)?.toUpperCase() || 'U';
        document.getElementById('profileUsername').textContent = otherUser.username || 'Utilisateur';
        document.getElementById('profileEmail').textContent = otherUser.email || 'Email non disponible';
        document.getElementById('profileStatus').textContent = '🟢 En ligne';
    }
    
    checkBlockStatus().then(isBlocked => {
        document.getElementById('blockUserBtn').style.display = isBlocked ? 'none' : 'block';
        document.getElementById('unblockUserBtn').style.display = isBlocked ? 'block' : 'none';
    });
    
    modal.style.display = 'flex';
}

function closeUserProfile() {
    const modal = document.getElementById('userProfileModal');
    modal.style.display = 'none';
}

async function blockCurrentUser() {
    const otherUser = getOtherParticipant();
    if (!otherUser) return;
    
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/relations/block`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                blockedUserId: otherUser._id
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage("Utilisateur bloqué avec succès", "success");
            document.getElementById('blockUserBtn').style.display = 'none';
            document.getElementById('unblockUserBtn').style.display = 'block';
        } else {
            showMessage(data.error || "Erreur lors du blocage", "error");
        }
    } catch (error) {
        console.error("❌ Erreur blocage:", error);
        showMessage("Erreur de connexion", "error");
    }
}

async function unblockCurrentUser() {
    const otherUser = getOtherParticipant();
    if (!otherUser) return;
    
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/relations/unblock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                blockedUserId: otherUser._id
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage("Utilisateur débloqué avec succès", "success");
            document.getElementById('blockUserBtn').style.display = 'block';
            document.getElementById('unblockUserBtn').style.display = 'none';
        } else {
            showMessage(data.error || "Erreur lors du déblocage", "error");
        }
    } catch (error) {
        console.error("❌ Erreur déblocage:", error);
        showMessage("Erreur de connexion", "error");
    }
}

async function checkBlockStatus() {
    const otherUser = getOtherParticipant();
    if (!otherUser) return false;
    
    try {
        return false;
    } catch (error) {
        console.error("❌ Erreur vérification blocage:", error);
        return false;
    }
}

// ===== GROUPES =====
function initGroupCreation() {
    const searchInput = document.getElementById('searchMemberInput');
    const createBtn = document.getElementById('createGroupConfirmBtn');
    
    searchInput?.addEventListener('input', handleUserSearch);
    createBtn?.addEventListener('click', createGroup);
}

async function handleUserSearch(event) {
    const searchTerm = event.target.value.trim();
    const resultsContainer = document.getElementById('searchMemberResults');
    
    if (searchTerm.length < 2) {
        resultsContainer.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/users/search?q=${encodeURIComponent(searchTerm)}`, {
            headers: {'Authorization': `Bearer ${state.token}`}
        });

        const data = await response.json();

        if (response.ok && data.success) {
            displaySearchResults(data.users);
        } else {
            showMessage(data.message || 'Aucun utilisateur trouvé', 'info');
            resultsContainer.innerHTML = '<div style="padding: 10px; color: #666; text-align: center;">Aucun utilisateur trouvé</div>';
            resultsContainer.style.display = 'block';
        }
        
    } catch (error) {
        console.error('❌ Erreur recherche BDD:', error);
        showMessage('Erreur de recherche - Vérifie que la route API existe', 'error');
        resultsContainer.innerHTML = '<div style="padding: 10px; color: #ff4444; text-align: center;">Erreur de recherche</div>';
        resultsContainer.style.display = 'block';
    }
}

function displaySearchResults(users) {
    const resultsContainer = document.getElementById('searchMemberResults');
    
    if (users.length === 0) {
        resultsContainer.innerHTML = '<div style="padding: 10px; color: #666; text-align: center;">Aucun utilisateur trouvé</div>';
        resultsContainer.style.display = 'block';
        return;
    }
    
    resultsContainer.innerHTML = users.map(user => `
        <div class="user-result" data-user-id="${user._id}" style="display: flex; justify-content: between; align-items: center; padding: 10px; border-bottom: 1px solid #333; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                <div class="user-avatar" style="width: 30px; height: 30px; border-radius: 50%; background: #f9ee34; color: #1c1c1c; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                    ${user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                    <div style="font-weight: bold; color: #f9ee34;">${user.username}</div>
                    <div style="font-size: 11px; color: #ffeca2;">${user.email}</div>
                </div>
            </div>
            <button class="add-user-btn" style="background: #f9ee34; color: #1c1c1c; border: none; border-radius: 50%; width: 25px; height: 25px; cursor: pointer; font-weight: bold;">
                +
            </button>
        </div>
    `).join('');
    
    resultsContainer.style.display = 'block';
    
    resultsContainer.querySelectorAll('.add-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const userElement = btn.closest('.user-result');
            const userId = userElement.dataset.userId;
            const username = userElement.querySelector('div > div:first-child').textContent;
            addUserToGroup(userId, username);
        });
    });
    
    resultsContainer.querySelectorAll('.user-result').forEach(row => {
        row.addEventListener('click', (e) => {
            if (!e.target.classList.contains('add-user-btn')) {
                const userId = row.dataset.userId;
                const username = row.querySelector('div > div:first-child').textContent;
                addUserToGroup(userId, username);
            }
        });
    });
}

function addUserToGroup(userId, username) {
    const selectedList = document.getElementById('selectedMembersList');
    const selectedCount = document.getElementById('selectedCount');
    
    if (selectedList.querySelector(`[data-user-id="${userId}"]`)) {
        showMessage(`${username} est déjà dans le groupe`, 'info');
        return;
    }
    
    if (selectedList.children.length === 1 && selectedList.children[0].style.color === 'rgb(102, 102, 102)') {
        selectedList.innerHTML = '';
    }
    
    const memberElement = document.createElement('div');
    memberElement.className = 'member-item';
    memberElement.dataset.userId = userId;
    memberElement.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #252525; border-radius: 6px; margin: 5px 0;">
            <span style="color: #f9ee34;">${username}</span>
            <button class="remove-user-btn" style="background: #ff4444; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px;">
                ×
            </button>
        </div>
    `;
    
    memberElement.querySelector('.remove-user-btn').addEventListener('click', () => {
        memberElement.remove();
        updateSelectedCount();
        
        if (selectedList.children.length === 0) {
            selectedList.innerHTML = '<div style="color: #666; text-align: center; font-size: 12px;">Aucun membre sélectionné</div>';
        }
    });
    
    selectedList.appendChild(memberElement);
    updateSelectedCount();
    
    document.getElementById('searchMemberResults').style.display = 'none';
    document.getElementById('searchMemberInput').value = '';
    
    showMessage(`${username} ajouté au groupe!`, 'success');
}

function updateSelectedCount() {
    const selectedCount = document.getElementById('selectedCount');
    const members = document.querySelectorAll('#selectedMembersList .member-item');
    selectedCount.textContent = members.length;
}

async function createGroup() {
    const groupName = document.getElementById('groupNameInput').value.trim();
    const selectedMembers = Array.from(document.querySelectorAll('#selectedMembersList .member-item'))
        .map(item => item.dataset.userId);
    
    if (!groupName) {
        showMessage('Donne un nom à ton groupe!', 'error');
        return;
    }
    
    if (selectedMembers.length < 2) {
        showMessage('Ajoute au moins 2 membres pour créer un groupe!', 'error');
        return;
    }
    
    try {
        showMessage('Création du groupe en cours...', 'info');
        
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/conversations/groups/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                groupName: groupName,
                participantIds: selectedMembers
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showMessage(`✅ Groupe "${groupName}" créé avec ${selectedMembers.length} membres!`, 'success');
            
            document.getElementById('createGroupModal').style.display = 'none';
            
            document.getElementById('groupNameInput').value = '';
            document.getElementById('selectedMembersList').innerHTML = '<div style="color: #666; text-align: center; font-size: 12px;">Aucun membre sélectionné</div>';
            document.getElementById('selectedCount').textContent = '0';
            document.getElementById('searchMemberResults').style.display = 'none';
            document.getElementById('searchMemberInput').value = '';
            
            await loadConversations();
            
        } else {
            throw new Error(data.error || data.message || 'Erreur de création');
        }
        
    } catch (error) {
        console.error('❌ Erreur création groupe:', error);
        showMessage(`Erreur: ${error.message}`, 'error');
    }
}

// ===== MODALS ET BOUTONS =====
function initModals() {
    document
        .getElementById("closeConversationModal")
        ?.addEventListener("click", () => {
            document.getElementById("newConversationModal").style.display = "none";
        });

    document.getElementById("closeGroupModal")?.addEventListener("click", () => {
        document.getElementById("createGroupModal").style.display = "none";
    });

    document.querySelectorAll(".modal-overlay").forEach((modal) => {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                modal.style.display = "none";
            }
        });
    });
}

function initTestButtons() {
    document.getElementById("testNotifBtn")?.addEventListener("click", () => {
        showTestNotification();
    });

    document
        .getElementById("notifPermissionBtn")
        ?.addEventListener("click", () => {
            requestNotificationPermission();
        });

    document
        .getElementById("newConversationBtn")
        ?.addEventListener("click", () => {
            showNewConversationModal();
        });

    document.getElementById("createGroupBtn")?.addEventListener("click", () => {
        showCreateGroupModal();
    });
}

function initNotificationButton() {
    const manualBtn = document.getElementById('testNotificationBtn');
    
    manualBtn?.addEventListener('click', async () => {
        if (window.OneSignalDeferred) {
            OneSignalDeferred.push(async function(OneSignal) {
                try {
                    await OneSignal.showSlidedownPrompt();
                } catch (error) {
                    console.error('❌ Erreur activation manuelle:', error);
                    showMessage('Erreur lors de l\'activation des notifications', 'error');
                }
            });
        }
    });
}

function showNewConversationModal() {
    document.getElementById("newConversationModal").style.display = "flex";
}

function showCreateGroupModal() {
    document.getElementById("createGroupModal").style.display = "flex";
}

// ===== NOUVELLE DISCUSSION SIMPLIFIÉE =====
async function searchUsersForConversation(event) {
    const searchTerm = event.target.value.trim();
    const resultsContainer = document.getElementById('searchResults');
    
    if (searchTerm.length < 2) {
        resultsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Recherchez un contact pour discuter</p></div>';
        return;
    }
    
    try {
        const token = localStorage.getItem('owly_token');
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/users/search?q=${encodeURIComponent(searchTerm)}`, {
            headers: {'Authorization': `Bearer ${token}`}
        });

        const data = await response.json();

        if (response.ok && data.success && data.users.length > 0) {
            // Filtrer l'utilisateur actuel
            const currentUserId = state?.user?.id || JSON.parse(localStorage.getItem('owly_user'))?.id;
            const filteredUsers = data.users.filter(user => user._id !== currentUserId);
            
            if (filteredUsers.length === 0) {
                resultsContainer.innerHTML = '<div style="padding: 10px; color: #666; text-align: center;">Aucun autre utilisateur trouvé</div>';
                return;
            }
            
            resultsContainer.innerHTML = filteredUsers.map(user => `
                <div class="user-result" data-user-id="${user._id}" 
                     style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #333; cursor: pointer; background: #252525; margin: 5px 0; border-radius: 6px;"
                     onclick="selectUserForConversation('${user._id}', '${user.username.replace(/'/g, "\\'")}')">
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                        <div class="user-avatar" style="width: 30px; height: 30px; border-radius: 50%; background: #f9ee34; color: #1c1c1c; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                            ${user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div style="font-weight: bold; color: #f9ee34;">${user.username}</div>
                            <div style="font-size: 11px; color: #ffeca2;">${user.email}</div>
                        </div>
                    </div>
                    <div style="color: #f9ee34; font-size: 20px;">→</div>
                </div>
            `).join('');
            
        } else {
            resultsContainer.innerHTML = '<div style="padding: 10px; color: #666; text-align: center;">Aucun utilisateur trouvé</div>';
        }
        
    } catch (error) {
        console.error('❌ Erreur recherche utilisateurs:', error);
        resultsContainer.innerHTML = '<div style="padding: 10px; color: #ff4444; text-align: center;">Erreur de recherche</div>';
    }
}

function selectUserForConversation(userId, username) {
    // 1. Fermer le modal
    document.getElementById('newConversationModal').style.display = 'none';
    
    // 2. Vider la recherche
    document.getElementById('searchUserInput').value = '';
    document.getElementById('searchResults').innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Recherchez un contact pour discuter</p></div>';
    
    // 3. Vérifier si une conversation existe déjà
    const existingConversation = state.conversations.find(conv => 
        conv.type === 'private' && 
        conv.participants.some(p => p._id === userId)
    );
    
    if (existingConversation) {
        // Si conversation existe, la sélectionner
        selectConversation(existingConversation);
        showMessage(`Conversation avec ${username} ouverte`, 'success');
    } else {
        // Sinon, créer une conversation temporaire
        const tempConversation = {
            _id: `temp_${userId}_${Date.now()}`,
            type: 'private',
            participants: [
                { _id: userId, username: username, email: '' },
                { _id: state.user.id, username: state.user.username, email: state.user.email }
            ],
            name: username,
            lastMessage: null,
            lastMessageAt: new Date(),
            isTemporary: true
        };
        
        // 4. Sélectionner cette conversation
        selectConversation(tempConversation);
        
        // 5. Focus sur le champ de message
        setTimeout(() => {
            const messageInput = document.getElementById('messageInput');
            if (messageInput) {
                messageInput.focus();
                showMessage(`Prêt à discuter avec ${username}`, 'info');
            }
        }, 100);
    }
}

// ===== NOTIFICATIONS =====
function showTestNotification() {
    showNotification({
        type: "test",
        title: "Test de notification",
        content: "Ceci est une notification de test depuis Owly!",
        senderName: "Système",
    });
}

function showNotification(data) {
    const notificationPopup = document.getElementById("notificationPopup");
    const notificationTitle = document.getElementById("notificationTitle");
    const notificationContent = document.getElementById("notificationContent");

    if (data.type === "new_message") {
        notificationTitle.textContent = "Nouveau message";
        notificationContent.innerHTML = `<strong>${data.senderName}</strong>: ${data.messagePreview}`;
    } else {
        notificationTitle.textContent = data.title || "Notification";
        notificationContent.textContent = data.content || "Nouvelle notification";
    }

    notificationPopup.style.display = "block";

    const replyBtn = document.getElementById("notificationReplyBtn");
    const openBtn = document.getElementById("notificationOpenBtn");

    replyBtn.onclick = () => {
        if (data.conversationId) {
            const conversation = state.conversations.find(
                (c) => c._id === data.conversationId
            );
            if (conversation) {
                selectConversation(conversation);
            }
            notificationPopup.style.display = "none";
        }
    };

    openBtn.onclick = () => {
        if (data.conversationId) {
            const conversation = state.conversations.find(
                (c) => c._id === data.conversationId
            );
            if (conversation) {
                selectConversation(conversation);
            }
        }
        notificationPopup.style.display = "none";
    };

    document.getElementById("closeNotification").onclick = () => {
        notificationPopup.style.display = "none";
    };

    setTimeout(() => {
        if (notificationPopup.style.display !== "none") {
            notificationPopup.style.display = "none";
        }
    }, 5000);
}

async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        alert("Votre navigateur ne supporte pas les notifications");
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        state.notificationPermission = permission;

        if (permission === "granted") {
            showMessage("Notifications activées!", "success");
            document.getElementById("notifPermissionBtn").classList.add("hidden");
        } else {
            showMessage("Notifications bloquées", "error");
        }
    } catch (error) {
        console.error("Notification permission error:", error);
        showMessage("Erreur d'activation des notifications", "error");
    }
}

// ===== EXPORTS =====
window.initFileUploads = initFileUploads;
window.initVoiceRecording = initVoiceRecording;
window.initReactionsSystem = initReactionsSystem;
window.initUserProfileSystem = initUserProfileSystem;
window.initGroupCreation = initGroupCreation;
window.initTestButtons = initTestButtons;
window.initModals = initModals;
window.initNotificationButton = initNotificationButton;

window.showUserProfile = showUserProfile;
window.showReactionsModal = showReactionsModal;
window.showVoiceRecordModal = showVoiceRecordModal;
window.searchUsersForConversation = searchUsersForConversation;
window.selectUserForConversation = selectUserForConversation;
window.showNewConversationModal = showNewConversationModal;
window.showCreateGroupModal = showCreateGroupModal;
window.requestNotificationPermission = requestNotificationPermission;
