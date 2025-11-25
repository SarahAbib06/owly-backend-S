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
import { participantController } from './src/controllers/participantController.js';
import userRoutes from './src/routes/userRoutes.js';
import relationRoutes from './src/routes/relation.js';

console.log('🔍 MONGODB_URI:', process.env.MONGODB_URI ? '✅ Chargé' : '❌ Non défini');
console.log('🔍 JWT_SECRET:', process.env.JWT_SECRET ? '✅ Chargé' : '❌ Non défini');

const app = express();
const server = createServer(app);

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
      "http://localhost:5501"  
    ],
    credentials: true
  },
  maxHttpBufferSize: 1e8 // 🆕 POUR ENVOI DE GROS FICHIERS
});

// ✅ 1. Connexion à la base de données
connectDB();

// 🆕 NETTOYAGE DES PARTICIPANTS ORPHELINS AU DÉMARRAGE
const cleanupOrphans = async () => {
  try {
    console.log('🔧 Nettoyage des participants orphelins...');
    await participantController.cleanupOrphanParticipants();
  } catch (error) {
    console.log('⚠️ Nettoyage participants échoué:', error.message);
  }
};
cleanupOrphans();

// ✅ 2. Middlewares CORS et JSON AMÉLIORÉS
app.use(cors({
  origin: [
    "http://localhost:5173", 
    "http://localhost:5174", 
    "http://localhost:5175",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:5501",
    "http://localhost:5501",
    "http://localhost:5500"
  ],
  credentials: true,
}));

// 🆕 LIMITES AUGMENTÉES POUR LES FICHIERS
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use("/uploads", express.static("uploads"));

// ✅ 3. Routes COMPLÈTES (gardées de la V1)
app.get('/', (req, res) => {
  res.json({ message: 'Owly API is running' });
});

app.use('/api/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/relations', relationRoutes);

// ✅ 4. Configuration Socket.io
configureChatSockets(io);

// ✅ 5. Démarrer le serveur
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));