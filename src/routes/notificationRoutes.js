import express from 'express';
import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

const router = express.Router();

// ============= CONFIGURATION VAPID (une seule fois au démarrage) =============
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,        // ex: mailto:push@tondomaine.com
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// GET : Récupérer la clé publique VAPID (pour le frontend)
router.get('/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(500).json({ error: 'Clé publique VAPID manquante' });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST : Enregistrer un abonnement push
router.post('/register', async (req, res) => {
  const { subscription, userId } = req.body;

  if (!subscription || !userId) {
    return res.status(400).json({ error: 'Subscription et userId requis' });
  }

  try {
    // Upsert : crée ou met à jour si l'endpoint existe déjà
    await PushSubscription.findOneAndUpdate(
      { userId, 'subscription.endpoint': subscription.endpoint },
      { userId, subscription },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Abonnement push enregistré avec succès' });
  } catch (error) {
    console.error('Erreur register push:', error);
    res.status(500).json({ error: 'Erreur serveur lors de l’enregistrement' });
  }
});

// POST : Désabonner (supprimer un abonnement)
router.post('/unregister', async (req, res) => {
  const { endpoint, userId } = req.body;

  if (!endpoint || !userId) {
    return res.status(400).json({ error: 'Endpoint et userId requis' });
  }

  try {
    const result = await PushSubscription.deleteOne({
      userId,
      'subscription.endpoint': endpoint
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Abonnement non trouvé' });
    }

    res.json({ success: true, message: 'Abonnement supprimé' });
  } catch (error) {
    console.error('Erreur unregister push:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET : Statut du service push
router.get('/status', (req, res) => {
  const hasKeys = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
  
  res.json({
    enabled: hasKeys,
    message: hasKeys 
      ? 'Web Push API configurée et active ✅' 
      : 'Clés VAPID manquantes dans .env'
  });
});

export default router;