import 'dotenv/config';
import express from 'express';
import cors from 'cors';


import connectDB from './src/config/db.js';

import { configureChatSockets } from './src/socket/chatSocket.js';
import messageRoutes from './src/routes/messageRoutes.js';
import conversationRoutes from './src/routes/conversationRoutes.js';
import notificationRoutes from './src/routes/notificationRoutes.js';

import authRoutes from './src/routes/auth.js';



console.log('🔍 MONGODB_URI:', process.env.MONGODB_URI ? '✅ Chargé' : '❌ Non défini');
console.log('🔍 JWT_SECRET:', process.env.JWT_SECRET ? '✅ Chargé' : '❌ Non défini');
const app = express();

connectDB();


// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Owly API is running' });
});

// 🎯 ROUTE PRINCIPALE POUR LES MESSAGES
app.use('/api/messages', messageRoutes);

// 🆕 ROUTE POUR LES CONVERSATIONS ET COMPTEURS
app.use('/api/conversations', conversationRoutes);

// Socket.io
configureChatSockets(io);
app.use('/api/notifications', notificationRoutes);


// ✅ 1. Autoriser les requêtes CORS AVANT tout
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
  credentials: true,
}));

// ✅ 2. Activer la lecture du JSON
app.use(express.json());
app.use("/uploads", express.static("uploads"));


// ✅ 3. Tes routes après
app.use('/api/auth', authRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));



