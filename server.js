import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

import authRoutes from './src/controllers/authen.js'; // ← relatif
import connectDB from './src/config/db.js';
// import routes from "./routes/index.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'process.env.CLIENT_URL',
    credentials: true
  }
});

// Middlewares
app.use(cors({ origin: 'process.env.CLIENT_URL', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to DB
connectDB();

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Owly API is running' });
});

// CORRECT : /api/auth/login
app.use('/api/users', authRoutes);
// app.use('/api/auth', authRoutes);


// Socket.io
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});