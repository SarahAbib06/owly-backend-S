// push.js - Gestion complète des notifications push

let vapidPublicKey = null;// sera rempli plus tard
let isSubscribed = false;
let swRegistration = null;

// Convertit la clé VAPID base64 en Uint8Array (obligatoire)
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Demande la permission et active les notifications
async function subscribeUser() {
  if (!swRegistration) return;

  const applicationServerKey = urlB64ToUint8Array(VAPID_PUBLIC_KEY);

  try {
    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    });

    // Envoie l'abonnement au backend
    await fetch('/api/notifications/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('token') // ← adapte selon ton auth
      },
      body: JSON.stringify({
        subscription: subscription,
        userId: localStorage.getItem('userId') // ← ou récupère depuis ton auth
      })
    });

    console.log('Abonnement push enregistré !');
    isSubscribed = true;
  } catch (error) {
    console.error('Erreur abonnement push:', error);
  }
}

// Initialise tout
async function initPush() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    console.log('Service Worker et Push supportés');

    try {
      // Enregistre le service worker
      swRegistration = await navigator.serviceWorker.register('/src/frontendtest/sw.js');
      console.log('Service Worker enregistré');

      // Récupère la clé publique VAPID depuis le backend
const response = await fetch('http://localhost:5000/api/notifications/vapid-public-key');
      const data = await response.json();
      VAPID_PUBLIC_KEY = data.publicKey;

      // Vérifie l'état actuel
      const subscription = await swRegistration.pushManager.getSubscription();
      if (subscription) {
        isSubscribed = true;
        console.log('Déjà abonné');
      } else {
        // Demande la permission
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          await subscribeUser();
        }
      }

    } catch (error) {
      console.error('Erreur init push:', error);
    }
  } else {
    console.log('Push non supporté par ce navigateur');
  }
}

// Appel au chargement de la page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPush);
} else {
  initPush();
}