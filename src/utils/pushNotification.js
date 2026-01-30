import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

// Configuration VAPID (même que dans les routes)
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Fonction pour envoyer une push à un utilisateur (tous ses appareils)
export const sendPushToUser = async (userId, payload) => {
  try {
    const subscriptions = await PushSubscription.find({ userId });

    if (subscriptions.length === 0) {
      console.log(`Aucun abonnement push pour l'utilisateur ${userId}`);
      return;
    }

    const promises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
        console.log(`Push envoyée à ${sub.subscription.endpoint.substring(0, 50)}...`);
      } catch (error) {
        console.warn(`Échec envoi push (endpoint: ${sub.subscription.endpoint.substring(0, 50)}...):`, error.statusCode);

        // Si l'abonnement est expiré ou invalide → on le supprime
        if (error.statusCode === 404 || error.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
          console.log(`Abonnement expiré supprimé`);
        }
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('Erreur globale envoi push:', error);
  }
};