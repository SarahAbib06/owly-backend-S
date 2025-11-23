// ===== CONFIGURATION =====
const CONFIG = {
  BACKEND_URL: "http://localhost:5000",
  SOCKET_URL: "http://localhost:5000",
  RECONNECT_DELAY: 3000,
  MAX_RECONNECT_ATTEMPTS: 5,
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
};

// ===== INITIALISATION =====
document.addEventListener("DOMContentLoaded", function () {
  if (document.getElementById("loginForm")) {
    initLoginPage();
  } else if (document.getElementById("contactsList")) {
    initMessagingPage();
  }
});

// ===== PAGE DE CONNEXION =====
function initLoginPage() {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const otpForm = document.getElementById("otpForm");
  const showRegisterBtn = document.getElementById("showRegister");
  const showLoginBtn = document.getElementById("showLogin");
  const forgotPasswordBtn = document.getElementById("forgotPassword");
  const changeEmailBtn = document.getElementById("changeEmail");
  const resendOtpBtn = document.getElementById("resendOtp");

  showRegisterBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    showForm("register");
  });

  showLoginBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    showForm("login");
  });

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await handleLogin();
  });

  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await handleRegister();
  });

  otpForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await verifyOtp();
  });

  forgotPasswordBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    await handleForgotPassword();
  });

  resendOtpBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    await resendOtp();
  });

  changeEmailBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    showForm("register");
  });

  checkExistingAuth();
}

function showForm(formType) {
  document
    .getElementById("loginForm")
    .classList.toggle("hidden", formType !== "login");
  document
    .getElementById("registerForm")
    .classList.toggle("hidden", formType !== "register");
  document
    .getElementById("otpForm")
    .classList.toggle("hidden", formType !== "otp");
}

async function handleLogin() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const loginBtn = document.getElementById("loginBtn");

  if (!email || !password) {
    showMessage("Veuillez remplir tous les champs", "error");
    return;
  }

  try {
    setButtonLoading(loginBtn, true);

    const response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      if (data.requiresOtp) {
        state.tempToken = data.debug_token;
        document.getElementById("otpEmail").textContent = email;
        showForm("otp");
        showMessage("Code de vérification envoyé par email", "success");
      } else {
        await handleSuccessfulAuth(data);
      }
    } else {
      showMessage(data.message || "Erreur de connexion", "error");
    }
  } catch (error) {
    console.error("Login error:", error);
    showMessage("Erreur de connexion au serveur", "error");
  } finally {
    setButtonLoading(loginBtn, false);
  }
}

async function handleRegister() {
  const username = document.getElementById("regUsername").value;
  const email = document.getElementById("regEmail").value;
  const password = document.getElementById("regPassword").value;
  const passwordConfirm = document.getElementById("regPasswordConfirm").value;
  const registerBtn = document.getElementById("registerBtn");

  if (!username || !email || !password || !passwordConfirm) {
    showMessage("Veuillez remplir tous les champs", "error");
    return;
  }

  if (password !== passwordConfirm) {
    showMessage("Les mots de passe ne correspondent pas", "error");
    return;
  }

  try {
    setButtonLoading(registerBtn, true);

    const response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password, passwordConfirm }),
    });

    const data = await response.json();

    if (response.ok) {
      document.getElementById("otpEmail").textContent = email;
      showForm("otp");
      showMessage("Code de vérification envoyé par email", "success");
    } else {
      showMessage(data.message || "Erreur d'inscription", "error");
    }
  } catch (error) {
    console.error("Register error:", error);
    showMessage("Erreur de connexion au serveur", "error");
  } finally {
    setButtonLoading(registerBtn, false);
  }
}

async function verifyOtp() {
  const email = document.getElementById("otpEmail").textContent;
  const otp = document.getElementById("otpCode").value;
  const verifyBtn = document.getElementById("verifyOtpBtn");

  if (!otp) {
    showMessage("Veuillez entrer le code de vérification", "error");
    return;
  }

  try {
    setButtonLoading(verifyBtn, true);

    let response;
    if (state.tempToken) {
      response = await fetch(
        `${CONFIG.BACKEND_URL}/api/auth/verify-inactivity-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: state.tempToken, otp }),
        }
      );
    } else {
      response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
    }

    const data = await response.json();

    if (response.ok) {
      await handleSuccessfulAuth(data);
    } else {
      showMessage(data.message || "Code invalide", "error");
    }
  } catch (error) {
    console.error("OTP verification error:", error);
    showMessage("Erreur de vérification", "error");
  } finally {
    setButtonLoading(verifyBtn, false);
  }
}

async function resendOtp() {
  const email = document.getElementById("otpEmail").textContent;

  try {
    const response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/resend-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (response.ok) {
      showMessage("Nouveau code envoyé", "success");
    } else {
      showMessage(data.message || "Erreur d'envoi", "error");
    }
  } catch (error) {
    console.error("Resend OTP error:", error);
    showMessage("Erreur d'envoi", "error");
  }
}

async function handleForgotPassword() {
  const email = prompt(
    "Entrez votre email pour réinitialiser le mot de passe:"
  );
  if (!email) return;

  try {
    const response = await fetch(
      `${CONFIG.BACKEND_URL}/api/auth/forgot-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }
    );

    const data = await response.json();

    if (response.ok) {
      showMessage(
        "Instructions de réinitialisation envoyées par email",
        "success"
      );
    } else {
      showMessage(data.message || "Erreur", "error");
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    showMessage("Erreur de connexion", "error");
  }
}

async function handleSuccessfulAuth(authData) {
  state.token = authData.data?.token || authData.token;
  state.user = authData.data?.user || {
    id: authData.id,
    username: authData.username,
    email: authData.email,
  };

  localStorage.setItem("owly_token", state.token);
  localStorage.setItem("owly_user", JSON.stringify(state.user));

  showMessage("Connexion réussie! Redirection...", "success");

  setTimeout(() => {
    window.location.href = "conversations.html";
  }, 1000);
}

function checkExistingAuth() {
  const token = localStorage.getItem("owly_token");
  const userData = localStorage.getItem("owly_user");

  if (token && userData) {
    state.token = token;
    state.user = JSON.parse(userData);

    if (window.location.pathname.includes("login.html")) {
      window.location.href = "conversations.html";
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

function initConversations() {
  console.log("✅ Conversations initialisées");
}

async function loadInitialData() {
  showLoading(true);

  try {
    await Promise.all([loadConversations(), loadUnreadCounts()]);
  } catch (error) {
    console.error("Error loading initial data:", error);
    showMessage("Erreur de chargement des données", "error");
  } finally {
    showLoading(false);
  }
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

  // Trier les conversations par dernier message
  const sortedConversations = state.conversations.sort((a, b) => {
    const dateA = new Date(a.lastMessageAt || a.createdAt);
    const dateB = new Date(b.lastMessageAt || b.createdAt);
    return dateB - dateA; // Plus récent en premier
  });

  sortedConversations.forEach((conversation) => {
    const contactElement = createConversationElement(conversation);
    conversationsContainer.appendChild(contactElement);
  });
}

function createConversationElement(conversation) {
  const element = document.createElement("div");
  element.className = "contact";
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
    return "Aucun message";
  }

  if (conversation.lastMessage.includes("Message audio")) {
    return "🎤 Message audio";
  }

  return conversation.lastMessage.length > 30
    ? conversation.lastMessage.substring(0, 30) + "..."
    : conversation.lastMessage;
}

async function selectConversation(conversation) {
  if (state.isLoadingMessages) return;

  document
    .querySelectorAll(".contact")
    .forEach((c) => c.classList.remove("active"));
  document
    .querySelector(`[data-conversation-id="${conversation._id}"]`)
    .classList.add("active");

  state.currentConversation = conversation;

  updateChatHeader(conversation);

  document.getElementById("messageInputContainer").style.display = "flex";
  document.getElementById("welcomeMessage").style.display = "none";
  document.getElementById("messagesList").style.display = "block";

  await loadMessages(conversation._id);

  await markAsRead(conversation._id);

  if (state.socket) {
    state.socket.emit("join_conversation", conversation._id);
  }
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

// 🆕 FONCTION LOAD MESSAGES CORRIGÉE
async function loadMessages(conversationId, showLoader = true) {
  if (state.isLoadingMessages) return;

  state.isLoadingMessages = true;

  if (showLoader) {
    showMessageLoading(true);
  }

  try {
    console.log(
      "📨 Chargement des messages pour la conversation:",
      conversationId
    );

    const response = await fetch(
      `${CONFIG.BACKEND_URL}/api/messages/${conversationId}?limit=100`,
      {
        headers: { Authorization: `Bearer ${state.token}` },
      }
    );

    const data = await response.json();

    if (response.ok && data.success) {
      console.log("✅ Messages reçus de l'API:", data.messages.length);

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
      throw new Error(data.error || "Erreur de chargement des messages");
    }
  } catch (error) {
    console.error("Load messages error:", error);
    showMessage("Erreur de chargement des messages", "error");
  } finally {
    state.isLoadingMessages = false;
    if (showLoader) {
      showMessageLoading(false);
    }
  }
}

// 🆕 FONCTION RENDER MESSAGES CORRIGÉE
function renderMessages(conversationId) {
  const messagesList = document.getElementById("messagesList");
  const messages = state.messages.get(conversationId) || [];

  console.log(
    "🔍 Affichage de",
    messages.length,
    "messages dans l'ordre chronologique"
  );

  messagesList.innerHTML = "";

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
  messages.forEach((message) => {
    const messageElement = createMessageElement(message);
    messagesList.appendChild(messageElement);
  });

  scrollToBottom();
}

// 🆕 FONCTION CREATE MESSAGE ELEMENT COMPLÈTEMENT CORRIGÉE
function createMessageElement(message) {
  const element = document.createElement("div");

  const isSent = isMyMessage(message);

  console.log(
    `🎯 Création message: "${message.content}" - estDeMoi: ${isSent}`
  );
  console.log("📅 Données complètes:", {
    content: message.content,
    createdAt: message.createdAt,
    timestamp: message.timestamp,
    sender: message.Id_sender,
    isSent: isSent,
  });

  element.className = `message ${isSent ? "sent" : "received"}`;
  element.dataset.messageId = message._id;

  // 🆕 GESTION ROBUSTE DE LA DATE ET HEURE
  const time = formatMessageTimeRobuste(message);
  const statusIcon = isSent ? (message.status === "seen" ? "✓✓" : "✓") : "";

  element.innerHTML = `
        <div class="message-content">${escapeHtml(message.content)}</div>
        <div class="message-time">${time} ${statusIcon}</div>
    `;

  return element;
}
