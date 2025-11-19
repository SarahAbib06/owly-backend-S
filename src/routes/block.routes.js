// src/routes/block.routes.js
import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
  blockUser,
  unblockUser,
  getBlockedUsers
} from '../controllers/blockController.js';

const router = express.Router();

// Toutes les routes nécessitent d’être authentifié
router.use(authMiddleware);

// Bloquer quelqu’un (par username OU _id)
router.post('/block', blockUser);

// Débloquer quelqu’un (par username OU _id)
router.post('/unblock', unblockUser);   // ← CORRIGÉ : c’était "unblock, unblockUser"

// Liste des personnes bloquées
router.get('/blocked', getBlockedUsers);

export default router;