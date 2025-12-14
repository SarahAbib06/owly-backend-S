// src/services/onesignalService.js
import OneSignal from '@onesignal/node-onesignal';
import User from '../models/User.js';

const appId = process.env.ONESIGNAL_APP_ID;
const restApiKey = process.env.ONESIGNAL_REST_API_KEY;

if (!appId || !restApiKey) {
  console.error("ONESIGNAL_APP_ID ou ONESIGNAL_REST_API_KEY manquant dans .env !");
}

const configuration = new OneSignal.Configuration({
  appId: appId,
  apiKey: restApiKey,
});

const client = new OneSignal.DefaultApi(configuration);

export const onesignalService = {
  // Sauvegarde le player ID après login/register
  savePlayerId: async (userId, playerId) => {
    try {
      await User.findByIdAndUpdate(userId, { onesignalPlayerId: playerId });
      console.log(`Player ID sauvegardé pour user ${userId} → ${playerId}`);
      return true;
    } catch (error) {
      console.error("Erreur sauvegarde player ID:", error);
      return false;
    }
  },

  // Envoie une notification à un utilisateur
  sendNotification: async (userId, title, message, data = {}) => {
    try {
      const user = await User.findById(userId);
      if (!user?.onesignalPlayerId) {
        console.log(`Aucun player ID pour ${user?.username || userId}`);
        return false;
      }

      const notification = new OneSignal.Notification();
      notification.app_id = appId;
      notification.include_player_ids = [user.onesignalPlayerId];
      notification.headings = { en: title };
      notification.contents = { en: message };
      notification.data = {
        ...data,
        type: "message", // pour ton front
      };

      const response = await client.createNotification(notification);
      console.log(`Notif envoyée à ${user.username} ! ID: ${response.id}`);
      return true;
    } catch (error) {
      console.error("Erreur envoi notif OneSignal:", error.body || error.message);
      return false;
    }
  },
};