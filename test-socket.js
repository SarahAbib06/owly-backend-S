// test-socket-complet.js - TESTS COMPLETS WEBSOCKET
import { io } from 'socket.io-client';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5MWFmZGE1MzI5MDQxNGFmNjZjOTczOCIsImlhdCI6MTc2MzU5MzY0NCwiZXhwIjoxNzY0MTk4NDQ0fQ.MFf7a9ySXGsEJV9HceeJU39IYPDXB6ECotjqiwLFWvc';

console.log('🔗 TEST COMPLET WEBSOCKET - Démarrage...');

const socket = io('http://localhost:5000', {
  auth: { token: token }
});

// 🎯 ÉCOUTE TOUS LES ÉVÉNEMENTS POSSIBLES
socket.on('connect', () => {
  console.log('✅ CONNECTÉ au serveur!');
  
  // 🎯 TEST 1: SYSTÈME PRÉSENCE
  console.log('1. 🎯 TEST PRÉSENCE...');
  socket.emit('join_notifications');
  
  // 🎯 TEST 2: REJOINDRE CONVERSATION
  console.log('2. 🎯 TEST JOIN CONVERSATION...');
  socket.emit('join_conversation', '691e5d32727857387f5e3b50'); // conversation leticia
  
  // 🎯 TEST 3: TYPING INDICATOR
  console.log('3. 🎯 TEST TYPING...');
  setTimeout(() => {
    socket.emit('user_typing', {
      conversationId: '691e5d32727857387f5e3b50',
      isTyping: true
    });
    
    setTimeout(() => {
      socket.emit('user_typing', {
        conversationId: '691e5d32727857387f5e3b50', 
        isTyping: false
      });
    }, 2000);
  }, 1000);
  
  // 🎯 TEST 4: RÉCUPÉRER HISTORIQUE
  console.log('4. 🎯 TEST HISTORIQUE...');
  setTimeout(() => {
    socket.emit('get_conversation_history', {
      conversationId: '691e5d32727857387f5e3b50'
    });
  }, 3000);
  
  // 🎯 TEST 5: COMPTEURS NON-LUS
  console.log('5. 🎯 TEST COMPTEURS...');
  setTimeout(() => {
    socket.emit('get_unread_counts');
  }, 4000);
  
  // 🎯 TEST 6: ENVOYER MESSAGE
  console.log('6. 🎯 TEST ENVOI MESSAGE...');
  setTimeout(() => {
    socket.emit('send_message', {
      conversationId: '691e5d32727857387f5e3b50',
      content: 'Message test via WebSocket! 🚀'
    });
  }, 5000);
  
  // 🎯 TEST 7: HEARTBEAT PRÉSENCE
  console.log('7. 🎯 TEST HEARTBEAT...');
  const heartbeat = setInterval(() => {
    socket.emit('user_heartbeat');
  }, 15000);
  
  // 🎯 TEST 8: CHANGEMENT STATUT
  console.log('8. 🎯 TEST CHANGEMENT STATUT...');
  setTimeout(() => {
    socket.emit('user_status_change', {
      status: 'away'
    });
  }, 7000);
});

// 🎯 ÉCOUTE DES RÉPONSES
socket.on('new_message', (data) => {
  console.log('🔔 NOUVEAU MESSAGE REÇU:', data);
});

socket.on('user_typing', (data) => {
  console.log('⌨️ TYPING REÇU:', data);
});

socket.on('conversation_history', (data) => {
  console.log('📜 HISTORIQUE REÇU:', data.messages?.length + ' messages');
});

socket.on('unread_counts_data', (data) => {
  console.log('🔢 COMPTEURS REÇU:', data.totalUnread + ' non-lus');
});

socket.on('message_sent', (data) => {
  console.log('✅ MESSAGE ENVOYÉ:', data.data._id);
});

socket.on('user_presence_changed', (data) => {
  console.log('👀 PRÉSENCE CHANGÉE:', data.userId, '->', data.status);
});

socket.on('new_message_alert', (data) => {
  console.log('🚨 ALERTE MESSAGE:', data);
});

// Gestion erreurs
socket.on('connect_error', (error) => {
  console.log('❌ ERREUR CONNEXION:', error.message);
});

socket.on('error', (error) => {
  console.log('❌ ERREUR SOCKET:', error);
});

socket.on('disconnect', (reason) => {
  console.log('❌ DÉCONNECTÉ:', reason);
});

// Arrêt après 30 secondes
setTimeout(() => {
  console.log('🛑 FIN DES TESTS - Déconnexion...');
  socket.disconnect();
  process.exit(0);
}, 30000);