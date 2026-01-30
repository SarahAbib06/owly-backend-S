// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

// 🔹 DB & Models
import connectDB from "./src/config/db.js";
import User from "./src/models/User.js";

// 🔹 Routes
import authRoutes from "./src/routes/auth.js";
import { configurePadSockets } from "./src/socket/PadSocket.js";
import messageRoutes from "./src/routes/messageRoutes.js";
import conversationRoutes from "./src/routes/conversationRoutes.js";
import archiveRoutes from "./src/routes/archiveRoutes.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";
import reactionRoutes from "./src/routes/reactionRoutes.js";
import searchRelationsRoutes from "./src/routes/searchRelationsRoutes.js";
// 🔹 Sockets
import setupVideoCall from "./src/socket/videoCall.js";
//import setupGroupVideoCall from "./src/socket/groupVideoCall.js";
import { configureChatSockets } from "./src/socket/chatSocket.js";

// 🔹 Participants
import { participantController } from "./src/controllers/participantController.js";
import groupRoutes from './src/routes/groupRoutes.js';

import userRoutes from "./src/routes/userRoutes.js";
import padRoutes from "./src/routes/padRoutes.js";
import relationRoutesbloquer from "./src/routes/relation.js";
import relationRoutes from "./src/routes/relationsRoutes.js";

import userStatusRoutes from "./src/routes/userStatusRoutes.js";

import favoritesRoutes from './src/routes/favoritesRoute.js';
import contactRouter from './src/routes/contact.js';

import themeRoutes from "./src/routes/themeRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔍 Logs des variables d'environnement
console.log("🔍 MONGODB_URI:", process.env.MONGODB_URI ? "✅ Chargé" : "❌ Non défini");
console.log("🔍 JWT_SECRET:", process.env.JWT_SECRET ? "✅ Chargé" : "❌ Non défini");

// 🔹 Initialisation d’Express
const app = express();
const httpServer = createServer(app);

// 🔹 Middlewares
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:5501",
    "http://localhost:5501",
    "null",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ strict: false }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));
app.use("/public", express.static("public"));

// 🔹 Connexion à la DB
connectDB();

// 🔹 Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://127.0.0.1:5500",
      "http://localhost:5500",
      "http://127.0.0.1:5501",
      "http://127.0.0.1:5501",
      "http://localhost:5501",
    ],
    credentials: true,
  },
  maxHttpBufferSize: 1e8,
});

// 🔹 Attacher io à l’app pour y avoir accès partout
app.set("io", io);

// 🔹 Configurer les sockets
setupVideoCall(io);        // Appels vidéo 1-to-1
//setupGroupVideoCall(io);  //  Appels vidéo de groupe


// ✅ Configuration des sockets
configurePadSockets(io);
configureChatSockets(io);

// 🆕 NETTOYAGE DES PARTICIPANTS ORPHELINS AU DÉMARRAGE
const cleanupOrphans = async () => {
  try {
    console.log("🔧 Nettoyage des participants orphelins...");
    await participantController.cleanupOrphanParticipants();
  } catch (error) {
    console.log("⚠️ Nettoyage participants échoué:", error.message);
  }
};
//cleanupOrphans();

app.use(express.json());
app.use(express.urlencoded({ extended: true })); 
app.use("/public", express.static("public"));

// 🔥 MIDDLEWARE CRUCIAL : Rendre io accessible dans toutes les routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ✅ 3. Routes (APRÈS le middleware io)
app.get("/", (req, res) => {
  res.json({ message: "Owly API is running" });
});

app.use("/api/messages", messageRoutes);
app.use("/api/reactions", reactionRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/archive", archiveRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/relations", relationRoutes);
app.use("/api/pads", padRoutes);
app.use("/api/relations", relationRoutesbloquer);
app.use("/api/auth", authRoutes);
app.use("/api", searchRelationsRoutes);

app.use('/api/groups', groupRoutes); // ← Cette route pourra maintenant accéder à req.io
app.use("/api/users", userStatusRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api', contactRouter);
app.use("/api/themes", themeRoutes); 

// ✅ 5. Démarrer le serveur
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));