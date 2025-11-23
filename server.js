import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

import connectDB from './src/config/db.js';
import { configureChatSockets } from './src/socket/chatSocket.js';

import messageRoutes from './src/routes/messageRoutes.js';
import conversationRoutes from './src/routes/conversationRoutes.js';
import notificationRoutes from './src/routes/notificationRoutes.js';
import authRoutes from './src/routes/auth.js';
import relationRoutes from './src/routes/relation.js';
import userRoutes from './src/routes/userRoutes.js';

import { participantController } from './src/controllers/participantController.js';

// ────────────────────────────────
// LOGS DE DÉMARRAGE (debug env)
// ────────────────────────────────
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Chargé' : 'MANQUANT');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Chargé' : 'MANQUANT');

// ────────────────────────────────
// EXPRESS + HTTP SERVER
// ────────────────────────────────
const app = express();
const server = createServer(app);

// ────────────────────────────────
// SOCKET.IO + CORS (très important !)
// ────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: true,                 // Accepte TOUTES les origines en dev
    credentials: true
  }
});

// ────────────────────────────────
// CONNEXION MONGODB
// ────────────────────────────────
connectDB();

// ────────────────────────────────
// NETTOYAGE PARTICIPANTS ORPHELINS AU DEMARRAGE
// ────────────────────────────────
const cleanupOrphans = async () => {
  try {
    console.log('Nettoyage des participants orphelins...');
    await participantController.cleanupOrphanParticipants();
    console.log('Nettoyage terminé');
  } catch (error) {
    console.log('Échec nettoyage participants:', error.message);
  }
};
cleanupOrphans();

// ────────────────────────────────
// MIDDLEWARES
// ────────────────────────────────
app.use(cors({
  origin: true,        // Accepte tout en développement (5500, 5501, 5173, etc.)
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Dossier uploads (avatars, images, etc.)
app.use("/uploads", express.static("uploads"));

// ────────────────────────────────
// ROUTES
// ────────────────────────────────
app.get('/', (req, res) => {
  res.json({ 
    message: 'Owly API is running', 
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

app.use('/api/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/relations', relationRoutes);
app.use('/api/users', userRoutes);

// ────────────────────────────────
// SOCKET.IO CONFIGURATION
// ────────────────────────────────
configureChatSockets(io);

// ────────────────────────────────
// DEMARRAGE SERVEUR
// ────────────────────────────────
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  console.log(`Socket.IO prêt`);
  console.log(`CORS activé pour tous les ports (dev)`);
});