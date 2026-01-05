import express from "express";

// ⚠️ IMPORT CORRECT POUR CommonJS module
import pkg from "agora-access-token";
const { RtcTokenBuilder, RtcRole } = pkg;

const router = express.Router();

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

// Vérifier la configuration
console.log("🔧 Configuration Agora:", {
  appId: APP_ID ? "✅ Configuré" : "❌ Manquant",
  certificate: APP_CERTIFICATE ? "✅ Configuré" : "❌ Manquant"
});

// Middleware d'authentification simple
const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Token d'authentification requis"
      });
    }
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: "Token invalide"
    });
  }
};

// Générer un token Agora
router.post("/generate-token", authenticate, (req, res) => {
  try {
    const { channelName, uid } = req.body;

    if (!channelName) {
      return res.status(400).json({
        success: false,
        error: "channelName requis"
      });
    }

    const finalUid =
      typeof uid === "number" && uid >= 0 && uid <= 10000
        ? uid
        : Math.floor(Math.random() * 10000);

    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600;
    const privilegeExpiredTs =
      Math.floor(Date.now() / 1000) + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      finalUid,
      role,
      privilegeExpiredTs
    );

    res.json({
      success: true,
      token,
      uid: finalUid,
      channelName,
      appId: APP_ID
    });
  } catch (error) {
    console.error("❌ Erreur token Agora:", error);
    res.status(500).json({
      success: false,
      error: "Erreur génération token"
    });
  }
});




// Route de test
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "API Agora fonctionnelle",
    appId: APP_ID ? "✅ Configuré" : "❌ Manquant",
    timestamp: new Date().toISOString()
  });
});

export default router;