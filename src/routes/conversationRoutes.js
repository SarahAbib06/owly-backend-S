import express from 'express';
import Conversation from '../models/Conversation.js';
import Participants from '../models/Participants.js';
import mongoose from 'mongoose';

const router = express.Router();

// 🆕 ROUTE POUR RÉCUPÉRER LES COMPTEURS NON-LUS D'UN USER
router.get('/unread-counts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Vérification ID user
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID utilisateur invalide' 
      });
    }

    console.log(`🔢 Récupération compteurs non-lus pour user: ${userId}`);
    
    // Récupère toutes les conversations où l'user est participant
    const userConversations = await Participants.find({ 
      Id_User: userId 
    }).populate('Id_Conversation');
    
    let totalUnread = 0;
    const conversationCounts = [];
    
    // Pour chaque conversation, trouve le compteur
    for (let participant of userConversations) {
      const conversation = participant.Id_Conversation;
      
      if (conversation && conversation.unreadCounts) {
        const userCount = conversation.unreadCounts.find(
          u => u.userId && u.userId.toString() === userId
        );
        
        const count = userCount ? userCount.count : 0;
        totalUnread += count;
        
        conversationCounts.push({
          conversationId: conversation._id,
          unreadCount: count,
          conversationType: conversation.type
        });
      }
    }
    
    console.log(`✅ ${totalUnread} messages non-lus au total`);
    
    res.json({
      success: true,
      totalUnread: totalUnread,
      conversationCounts: conversationCounts
    });
    
  } catch (error) {
    console.error('❌ Erreur récupération compteurs:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🆕 ROUTE POUR MARQUER UNE CONVERSATION COMME LUE
router.post('/mark-as-read/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;
    
    // Vérifications
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID conversation invalide' 
      });
    }
    
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID utilisateur invalide' 
      });
    }

    console.log(`📖 Marquage comme lu - Conversation: ${conversationId}, User: ${userId}`);
    
    // Met à jour le compteur à 0
    const result = await Conversation.findOneAndUpdate(
      { 
        _id: conversationId, 
        "unreadCounts.userId": userId 
      },
      { 
        $set: { "unreadCounts.$.count": 0 } 
      },
      { new: true }
    );
    
    if (!result) {
      console.log('⚠️ Conversation non trouvée ou user pas dans les compteurs');
    }
    
    console.log('✅ Conversation marquée comme lue');
    
    res.json({ 
      success: true, 
      message: 'Conversation marquée comme lue',
      conversationId: conversationId
    });
    
  } catch (error) {
    console.error('❌ Erreur marquage comme lu:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🆕 ROUTE POUR RÉCUPÉRER LES CONVERSATIONS D'UN USER
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID utilisateur invalide' 
      });
    }

    console.log(`📂 Récupération conversations pour user: ${userId}`);
    
    const userConversations = await Participants.find({ 
      Id_User: userId 
    })
      .populate('Id_Conversation')
      .populate('Id_User', 'username profilePicture');
    
    const conversations = userConversations.map(p => ({
      _id: p.Id_Conversation._id,
      type: p.Id_Conversation.type,
      unreadCount: p.Id_Conversation.unreadCounts?.find(
        u => u.userId && u.userId.toString() === userId
      )?.count || 0,
      lastMessageAt: p.Id_Conversation.lastMessageAt,
      participants: [p.Id_User] // Simplifié - à améliorer
    }));
    
    console.log(`✅ ${conversations.length} conversations trouvées`);
    
    res.json({
      success: true,
      conversations: conversations
    });
    
  } catch (error) {
    console.error('❌ Erreur récupération conversations:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;