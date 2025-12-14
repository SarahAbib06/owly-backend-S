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
        id: authData.id || authData._id,
        username: authData.username,
        email: authData.email,
    };

    // Sauvegarde en localStorage
    localStorage.setItem("owly_token", state.token);
    localStorage.setItem("owly_user", JSON.stringify(state.user));

    showMessage("Connexion réussie! Redirection...", "success");

    // Gestion OneSignal après authentification
    setTimeout(async () => {
        if (window.OneSignalDeferred) {
            try {
                OneSignalDeferred.push(async function(OneSignal) {
                    const isSubscribed = await OneSignal.isPushNotificationsEnabled();
                    
                    if (!isSubscribed) {
                        console.log("🎯 Demande de notifications après connexion...");
                        setTimeout(() => {
                            OneSignal.showSlidedownPrompt();
                        }, 2000);
                    }
                    
                    // Sauvegarder le playerId si déjà abonné
                    const playerId = await OneSignal.getUserId();
                    if (playerId && state.token) {
                        await fetch('http://localhost:5000/api/notifications/save-playerid', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${state.token}`
                            },
                            body: JSON.stringify({ playerId })
                        });
                    }
                });
            } catch (error) {
                console.error("❌ Erreur OneSignal après auth:", error);
            }
        }
    }, 1000);

    // Redirection
    setTimeout(() => {
        window.location.href = "conversations.html";
    }, 1500);
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

// Export
window.initLoginPage = initLoginPage;
window.handleSuccessfulAuth = handleSuccessfulAuth;