import express from 'express';
import { pushNotificationService } from '../services/pushNotificationService.js';
import PushToken from '../models/PushToken.js';

const router = express.Router();

// 🆕 ENREGISTRER UN DEVICE
router.post('/register-device', async (req, res) => {
  try {
    const { userId, token, platform } = req.body;
    
    if (!userId || !token || !platform) {
      return res.status(400).json({
        success: false,
        error: 'userId, token et platform requis'
      });
    }

    const result = await pushNotificationService.registerDevice(userId, token, platform);
    
    res.json({
      success: result,
      message: result ? `Device ${platform} enregistré` : 'Erreur enregistrement'
    });
    
  } catch (error) {
    console.error('❌ Erreur enregistrement device:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;