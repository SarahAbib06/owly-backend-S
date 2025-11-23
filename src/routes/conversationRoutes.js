import express from 'express';
import Conversation from '../models/Conversation.js';
import Participants from '../models/Participants.js';
import { conversationController } from '../controllers/conversationController.js';
import mongoose from 'mongoose';
import { protact } from '../middleware/authen.js';

const router = express.Router();

// 🆕 ROUTE POUR CRÉER UN GROUPE
router.post('/groups/create', protact, async (req, res) => {
  try {
    const { participantIds, groupName } = req.body;
    const creatorId = req.user._id;

    if (!participantIds || !groupName) {
      return res.status(400).json({ 
        success: false, 
        error: 'participantIds et groupName sont requis' 
      });
    }

    console.log(`👥 Création groupe: ${groupName} par ${creatorId}`);
    
    const group = await conversationController.createGroupConversation(
      creatorId, 
      participantIds, 
      groupName
    );
    
    res.json({ 
      success: true, 
      group: {
        _id: group._id,
        name: group.groupName,
        type: group.type,
        participantCount: group.Id_participant.length
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur création groupe:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🆕 ROUTE POUR RÉCUPÉRER LES GROUPES D'UN USER
router.get('/groups/user/:userId', protact, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        error: 'Non autorisé à voir les groupes d\'un autre utilisateur' 
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID utilisateur invalide' 
      });
    }

    console.log(`📂 Récupération groupes pour user: ${userId}`);
    
    const groups = await conversationController.getUserGroups(userId);
    
    res.json({
      success: true,
      groups: groups
    });
    
  } catch (error) {
    console.error('❌ Erreur récupération groupes:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🆕 ROUTE POUR RÉCUPÉRER LES COMPTEURS NON-LUS D'UN USER
router.get('/unread-counts/:userId', protact, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        error: 'Non autorisé à voir les compteurs d\'un autre utilisateur' 
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID utilisateur invalide' 
      });
    }

    console.log(`🔢 Récupération compteurs non-lus pour user: ${userId}`);
    
    const userConversations = await Participants.find({ 
      Id_User: userId 
    }).populate('Id_Conversation');
    
    let totalUnread = 0;
    const conversationCounts = [];
    
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
          conversationType: conversation.type,
          conversationName: conversation.type === 'group' ? conversation.groupName : null
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
router.post('/mark-as-read/:conversationId', protact, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID conversation invalide' 
      });
    }

    console.log(`📖 Marquage comme lu - Conversation: ${conversationId}, User: ${userId}`);
    
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
router.get('/user/:userId', protact, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        error: 'Non autorisé à voir les conversations d\'un autre utilisateur' 
      });
    }

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
      name: p.Id_Conversation.type === 'group' ? p.Id_Conversation.groupName : null,
      unreadCount: p.Id_Conversation.unreadCounts?.find(
        u => u.userId && u.userId.toString() === userId
      )?.count || 0,
      lastMessageAt: p.Id_Conversation.lastMessageAt,
      participants: [p.Id_User]
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

// 🆕 ROUTE CORRIGÉE : UTILISER LA TABLE PARTICIPANTS
router.get('/', protact, async (req, res) => {
  try {
    const userId = req.user._id;
    
    console.log(`📂 Récupération conversations pour user: ${userId}`);
    
    // 🎯 UTILISER LA TABLE PARTICIPANTS (qui contient les vraies données)
    const userParticipants = await Participants.find({ 
      Id_User: userId 
    })
    .populate('Id_Conversation')
    .populate('Id_User', 'username profilePicture');

    console.log('🔍 DEBUG - Participants trouvés:', userParticipants.length);

const formattedConversations = await Promise.all(
  userParticipants.map(async (participant) => {
    // 🎯 VÉRIFICATION RENFORCÉE
    if (!participant || !participant.Id_Conversation || !participant.Id_Conversation._id) {
      console.log('⚠️ Participant ou conversation invalide:', participant?._id);
      return null;
    }
    
    const conv = participant.Id_Conversation;

        // 🎯 RÉCUPÉRER TOUS LES PARTICIPANTS DE CETTE CONVERSATION
        const allParticipants = await Participants.find({
          Id_Conversation: conv._id
        }).populate('Id_User', 'username profilePicture');

        const userUnread = conv.unreadCounts?.find(
          u => u.userId && u.userId.toString() === userId.toString()
        );

        let conversationName = null;
        if (conv.type === 'private') {
          // 🎯 TROUVER L'AUTRE USER DANS LES PARTICIPANTS
          const otherParticipant = allParticipants.find(
            p => p.Id_User._id.toString() !== userId.toString()
          );
          conversationName = otherParticipant?.Id_User?.username || 'Utilisateur';
        } else {
          conversationName = conv.groupName;
        }

        return {
          _id: conv._id,
          type: conv.type,
          name: conversationName,
          unreadCount: userUnread?.count || 0,
          lastMessageAt: conv.lastMessageAt,
          participants: allParticipants.map(p => p.Id_User), // 🎯 TOUS LES PARTICIPANTS
          createdAt: conv.createdAt,
          myRole: participant.Role // 🎯 TON RÔLE DANS CETTE CONVERSATION
        };
      })
    );

    // FILTRER LES CONVERSATIONS NULLES
    const validConversations = formattedConversations.filter(conv => conv !== null);
    
    console.log(`✅ ${validConversations.length} conversations valides trouvées`);
    
    res.json({
      success: true,
      conversations: validConversations
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