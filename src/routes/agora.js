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
    
    console.log("🔑 Demande token pour:", { channelName, uid });

    if (!channelName) {
      return res.status(400).json({
        success: false,
        error: "Nom du canal requis"
      });
    }

    if (!APP_ID || !APP_CERTIFICATE) {
      return res.status(500).json({
        success: false,
        error: "Configuration Agora incomplète"
      });
    }

    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
    
    const numericUid = Math.abs(
  Array.from(String(uid)).reduce((acc, c) => acc + c.charCodeAt(0), 0)
);

const token = RtcTokenBuilder.buildTokenWithUid(
  APP_ID,
  APP_CERTIFICATE,
  channelName,
  numericUid,
  role,
  privilegeExpiredTs
);



    console.log("✅ Token généré pour", channelName);

  res.json({
  success: true,
  token,
  appId: APP_ID,
  channelName,
  uid: numericUid,
  expiration: privilegeExpiredTs
});


  } catch (error) {
    console.error("❌ Erreur génération token:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Erreur lors de la génération du token"
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