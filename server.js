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
import { configureChatSockets } from "./src/socket/chatSocket.js";
import messageRoutes from "./src/routes/messageRoutes.js";
import conversationRoutes from "./src/routes/conversationRoutes.js";
import archiveRoutes from "./src/routes/archiveRoutes.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";
import reactionRoutes from "./src/routes/reactionRoutes.js";
import searchRelationsRoutes from "./src/routes/searchRelationsRoutes.js";
import callRoutes from "./src/routes/callRoutes.js";

import { participantController } from "./src/controllers/participantController.js";
import userRoutes from "./src/routes/userRoutes.js";
import relationRoutesbloquer from "./src/routes/relation.js";
import relationRoutes from "./src/routes/relationsRoutes.js";

import userStatusRoutes from "./src/routes/userStatusRoutes.js";

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

const app = express();
const server = createServer(app);

// ✅ CONFIGURATION CORS POUR EXPRESS
app.use(
  cors({
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
  })
);

// 🆕 SOCKET.IO CONFIGURÉ POUR LES FICHIERS
const io = new Server(server, {
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

// ✅ 1. Connexion à la base de données
connectDB();
app.set("io", io);

// ✅ Configuration des sockets
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
app.use("/public", express.static("public"));

// ✅ 3. Routes
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
app.use("/api/relations", relationRoutesbloquer);
app.use("/api/auth", authRoutes);
app.use("/api", searchRelationsRoutes);

app.use("/api/calls", callRoutes);


app.use("/api/users", userStatusRoutes);



// ✅ 5. Démarrer le serveur
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));