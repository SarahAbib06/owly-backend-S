import express from 'express';
import { addFavoriteConversation, removeFavoriteConversation, getFavoriteConversations } from '../controllers/favoritesController.js';

const router = express.Router();

router.post('/add', addFavoriteConversation);
router.post('/remove', removeFavoriteConversation);
router.get('/', getFavoriteConversations);

export default router;
