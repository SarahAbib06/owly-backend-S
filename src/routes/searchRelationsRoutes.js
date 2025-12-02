// routes/searchRelationsRoutes.js
import express from 'express';
import {
  searchUsers,
  getUserProfile,
  sendInvitation,
  acceptInvitation,
  getPendingInvitations,
  getContacts,
  blockUser, 
  cancelInvitation,
  removeContact 
} from '../controllers/searchRelationsController.js';

import authMiddleware from '../middleware/auth.js';

const router = express.Router();

//  RECHERCHE 
router.get('/search/users', authMiddleware, searchUsers);
router.get('/search/users/:userId', authMiddleware, getUserProfile);

// RELATIONS 
router.post('/relations/invite', authMiddleware, sendInvitation);
router.post('/relations/accept', authMiddleware, acceptInvitation);
router.get('/relations/invitations', authMiddleware, getPendingInvitations);
router.get('/relations/contacts', authMiddleware, getContacts);
router.post('/relations/block', authMiddleware, blockUser);
router.delete('/relations/invite/:relationId', authMiddleware, cancelInvitation);
router.delete('/relations/contact/:relationId', authMiddleware, removeContact); 


export default router;