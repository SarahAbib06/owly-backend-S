import express from 'express';
import { callController } from '../controllers/callController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authMiddleware);

// Initier un appel
router.post('/initiate', async (req, res) => {
  try {
    const { receiverId, conversationId, callType } = req.body;
    const callerId = req.user.id;

    const call = await callController.initiateCall(callerId, receiverId, conversationId, callType);

    res.status(201).json({
      success: true,
      call: call
    });
  } catch (error) {
    console.error('Erreur initiation appel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Accepter un appel
router.put('/:callId/accept', async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await callController.acceptCall(callId);

    res.json({
      success: true,
      call: call
    });
  } catch (error) {
    console.error('Erreur acceptation appel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Terminer un appel
router.put('/:callId/end', async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await callController.endCall(callId);

    res.json({
      success: true,
      call: call
    });
  } catch (error) {
    console.error('Erreur fin appel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Récupérer l'historique des appels
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    const calls = await callController.getCallHistory(userId, limit);

    res.json({
      success: true,
      calls: calls
    });
  } catch (error) {
    console.error('Erreur récupération historique:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Récupérer un appel par ID
router.get('/:callId', async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await callController.getCallById(callId);

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Appel non trouvé'
      });
    }

    res.json({
      success: true,
      call: call
    });
  } catch (error) {
    console.error('Erreur récupération appel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
