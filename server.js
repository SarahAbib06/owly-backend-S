import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken"; // ⬅️ Pour l'authentification JWT
import User from "./src/models/User.js"; // ⬅️ Modèle User

import path from "path"; // ⭐ NOUVEAU
import { fileURLToPath } from "url"; // ⭐ NOUVEAU

// ⭐ NOUVEAU : Pour résoudre __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import connectDB from "./src/config/db.js";
import userRoutes from "./src/routes/userRoutes.js";
import conversationRoutes from "./src/routes/conversationRoutes.js";
import messageRoutes from "./src/routes/messageRoutes.js";
import reactionRoutes from "./src/routes/reactionRoutes.js";
import { setupSocketIO } from "./src/socket/chatSocket.js"; // ⬅️ Configuration Socket.io

// ⭐ Chargement des variables d'environnement
dotenv.config();

// ⭐ Initialisation d'Express et HTTP Server
const app = express();
const httpServer = createServer(app);

// ⭐ Configuration Socket.io avec CORS
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL, // URL du client React
    credentials: true, // Autoriser les cookies et authentification
  },
});

// ⭐ MIDDLEWARES GLOBAUX
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json()); // Parser les requêtes JSON
app.use(express.urlencoded({ extended: true })); // Parser les formulaires URL-encoded

// ⭐ MIDDLEWARE DE DEBUG (optionnel - pour le développement)
app.use((req, res, next) => {
  console.log(`📨 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log("📦 Headers:", req.headers);
  console.log("📦 Body:", req.body);
  next();
});

// ⭐ NOUVEAU : SERVIR LES FICHIERS AUDIO STATIQUES
app.use(
  "/uploads/audio",
  express.static(path.join(__dirname, "uploads", "audio"))
);
console.log("✅ Service des fichiers audio configuré: /uploads/audio");

// ⭐ NOUVEAU : Route pour vérifier les fichiers audio
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

// ⭐ FONCTION POUR COPIER LES UTILISATEURS (logique métier spécifique)
const copyUsersToUsersCollection = async () => {
  try {
    console.log("📋 Début de la copie des utilisateurs...");

    // Import dynamique pour éviter les dépendances circulaires
    const User = (await import("./src/models/User.js")).default;
    const Users = (await import("./src/models/Users.js")).default;

    // Récupérer tous les utilisateurs existants
    const existingUsers = await User.find();
    console.log(`👥 ${existingUsers.length} utilisateurs trouvés`);

    // Copier chaque utilisateur
    let copiedCount = 0;
    for (const user of existingUsers) {
      // Vérifier si l'utilisateur existe déjà dans Users
      const exists = await Users.findById(user._id);
      if (!exists) {
        // Créer une copie dans Users
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

// ⭐ CONNEXION À LA BASE DE DONNÉES
connectDB().then(() => {
  copyUsersToUsersCollection(); // Appeler après la connexion DB
});

// ⭐ ROUTES DE L'API

// Route de test pour vérifier que le serveur fonctionne
app.post("/api/test-body", (req, res) => {
  console.log("✅ Route test-body appelée");
  res.json({
    message: "Test réussi!",
    receivedBody: req.body,
    bodyType: typeof req.body,
    bodyKeys: Object.keys(req.body || {}),
  });
});

// Routes principales de l'application
app.use("/api/users", userRoutes); // Gestion des utilisateurs
app.use("/api/conversations", conversationRoutes); // Gestion des conversations
app.use("/api/messages", messageRoutes); // Gestion des messages
app.use("/api/reactions", reactionRoutes); // Gestion des réactions

// Route racine - santé de l'API
app.get("/", (req, res) => {
  res.json({ message: "Owly API is running" });
});

// ⭐⭐⭐ CONFIGURATION SOCKET.IO ⭐⭐⭐

// Middleware d'authentification Socket.io
// S'exécute avant chaque connexion Socket.io
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token; // Récupère le token d'authentification
    console.log(`🔐 Authentification Socket.io attempt:`, socket.id);

    if (token) {
      // Vérifier et décoder le token JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Trouver l'utilisateur dans la base de données
      const user = await User.findById(decoded.userId).select("-passwordHash");

      if (!user) {
        return next(new Error("Utilisateur non trouvé"));
      }

      // Attacher les informations utilisateur à la socket
      socket.userId = decoded.userId; // ID de l'utilisateur
      socket.user = user; // Objet utilisateur complet

      console.log(
        `✅ Socket authentifié: ${socket.id} pour user: ${socket.userId}`
      );
      next(); // Autoriser la connexion
    } else {
      console.log(`❌ Socket sans token: ${socket.id}`);
      next(new Error("Authentication error: Token manquant"));
    }
  } catch (error) {
    console.log(`❌ Erreur auth Socket: ${error.message}`);
    next(new Error("Token invalide ou expiré"));
  }
});

// ⭐ INITIALISATION DES ÉVÉNEMENTS SOCKET.IO
// Cette fonction configure tous les événements (messages, typing, reactions, etc.)
setupSocketIO(io);

// ⭐ DÉMARRAGE DU SERVEUR
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Client URL: ${process.env.CLIENT_URL}`);
});
