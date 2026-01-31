// backend/routes/scheduledMessageRoutes.js
import express from 'express';
import { protact } from '../middleware/authen.js';
import { scheduledMessageController } from '../controllers/scheduledMessageController.js';

const router = express.Router();

// Créer un message programmé
router.post('/', protact, scheduledMessageController.createScheduledMessage);

// Récupérer les messages programmés d'une conversation
router.get('/:conversationId', protact, scheduledMessageController.getScheduledMessages);

// Annuler un message programmé
router.delete('/:messageId', protact, scheduledMessageController.cancelScheduledMessage);

// Modifier un message programmé
router.put('/:messageId', protact, scheduledMessageController.updateScheduledMessage);

export default router;