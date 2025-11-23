import express from 'express';
import User from '../models/User.js';
import { protact } from '../middleware/authen.js';

const router = express.Router();

// 🆕 METTRE À JOUR LES PRÉFÉRENCES NOTIFICATIONS
router.put('/notification-preferences', protact, async (req, res) => {
  try {
    const userId = req.user._id;
    const { pushEnabled } = req.body;

    await User.findByIdAndUpdate(userId, {
      $set: {
        'notificationPreferences.pushEnabled': pushEnabled
      }
    });

    console.log(`✅ Préférences mises à jour - pushEnabled: ${pushEnabled} pour user ${userId}`);
    
    res.json({ 
      success: true, 
      message: `Notifications ${pushEnabled ? 'activées' : 'désactivées'}`,
      pushEnabled: pushEnabled
    });
    
  } catch (error) {
    console.error('❌ Erreur mise à jour préférences:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🆕 RÉCUPÉRER LES PRÉFÉRENCES
router.get('/notification-preferences', protact, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    
    res.json({
      success: true,
      pushEnabled: user.notificationPreferences?.pushEnabled ?? true
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;