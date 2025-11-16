import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

import connectDB from './src/config/db.js';
import { configureChatSockets } from './src/socket/chatSocket.js';
import messageRoutes from './src/routes/messageRoutes.js';
import conversationRoutes from './src/routes/conversationRoutes.js';
import notificationRoutes from './src/routes/notificationRoutes.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true
  }
});

// Middlewares
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to database
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

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});