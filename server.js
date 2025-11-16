import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import connectDB from "./src/config/db.js";
import User from "./src/models/User.js";
import authRoutes from "./src/routes/auth.js";
import conversationRoutes from "./src/routes/conversationRoutes.js";
import messageRoutes from "./src/routes/messageRoutes.js";
import reactionRoutes from "./src/routes/reactionRoutes.js";
import { setupSocketIO } from "./src/socket/chatSocket.js";

// ⭐ Configuration __dirname pour ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(
  "🔍 MONGODB_URI:",
  process.env.MONGODB_URI ? "✅ Chargé" : "❌ Non défini"
);
console.log(
  "🔍 JWT_SECRET:",
  process.env.JWT_SECRET ? "✅ Chargé" : "❌ Non défini"
);
console.log(
  "🔍 CLIENT_URL:",
  process.env.CLIENT_URL ? "✅ Chargé" : "❌ Non défini"
);

// ⭐ Initialisation de l'application
const app = express();
const PORT = process.env.PORT || 5000;

// ⭐ Création du serveur HTTP
const httpServer = createServer(app);

// ⭐ Configuration CORS pour Express
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  process.env.CLIENT_URL,
].filter(Boolean); // Retire les valeurs undefined

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// ⭐ Configuration Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// ⭐ Middlewares Express
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ⭐ Servir les fichiers statiques
app.use("/uploads", express.static("uploads"));
app.use(
  "/uploads/audio",
  express.static(path.join(__dirname, "uploads", "audio"))
);
console.log("✅ Service des fichiers statiques configuré");

// ⭐ Middleware de debug (optionnel)
app.use((req, res, next) => {
  console.log(`📨 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ⭐ Routes de l'API
app.use("/api/auth", authRoutes);

app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/reactions", reactionRoutes);

// ⭐ Route pour vérifier les fichiers audio
app.get("/api/audio/check/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "uploads", "audio", filename);

  if (fs.existsSync(filePath)) {
    res.json({
      exists: true,
      url: `/uploads/audio/${filename}`,
      path: filePath,
    });
  } else {
    res.status(404).json({
      exists: false,
      message: "Fichier audio non trouvé",
    });
  }
});

// ⭐ Route de test
app.post("/api/test-body", (req, res) => {
  console.log("✅ Route test-body appelée");
  res.json({
    message: "Test réussi!",
    receivedBody: req.body,
    bodyType: typeof req.body,
    bodyKeys: Object.keys(req.body || {}),
  });
});

// ⭐ Route racine
app.get("/", (req, res) => {
  res.json({ message: "Owly API is running" });
});

// ⭐ Fonction pour copier les utilisateurs
const copyUsersToUsersCollection = async () => {
  try {
    console.log("📋 Début de la copie des utilisateurs...");

    const User = (await import("./src/models/User.js")).default;
    const Users = (await import("./src/models/User.js")).default;

    const existingUsers = await User.find();
    console.log(`👥 ${existingUsers.length} utilisateurs trouvés`);

    let copiedCount = 0;
    for (const user of existingUsers) {
      const exists = await Users.findById(user._id);
      if (!exists) {
        await Users.create(user.toObject());
        copiedCount++;
        console.log(`✅ Copié: ${user.username} (${user.email})`);
      }
    }

    console.log(`🎉 Copie terminée: ${copiedCount} nouveaux utilisateurs`);
  } catch (error) {
    console.log("ℹ️ Users déjà copiés ou erreur mineure:", error.message);
  }
};

// ⭐ Middleware d'authentification Socket.io
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    console.log(`🔐 Authentification Socket.io attempt:`, socket.id);

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select("-passwordHash");

      if (!user) {
        return next(new Error("Utilisateur non trouvé"));
      }

      socket.userId = decoded.userId;
      socket.user = user;

      console.log(
        `✅ Socket authentifié: ${socket.id} pour user: ${socket.userId}`
      );
      next();
    } else {
      console.log(`❌ Socket sans token: ${socket.id}`);
      next(new Error("Authentication error: Token manquant"));
    }
  } catch (error) {
    console.log(`❌ Erreur auth Socket: ${error.message}`);
    next(new Error("Token invalide ou expiré"));
  }
});

// ⭐ Configuration Socket.io
setupSocketIO(io);

// ⭐ Connexion à la base de données et démarrage du serveur
connectDB().then(() => {
  copyUsersToUsersCollection();

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Allowed origins: ${allowedOrigins.join(", ")}`);
  });
});
