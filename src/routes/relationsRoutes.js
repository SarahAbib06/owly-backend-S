// backend/routes/relationsRoutes.js
import express from "express";
import Relation from "../models/Relation.js";
import Conversation from "../models/Conversation.js";
import { protact } from "../middleware/authen.js";
import mongoose from "mongoose";

const router = express.Router();

// ✅ RÉCUPÉRER MES CONTACTS (RELATIONS ACCEPTÉES)
router.get("/contacts", protact, async (req, res) => {
  try {
    const userId = req.user._id;

    const relations = await Relation.find({
      $or: [{ userId }, { contactId: userId }],
      status: "accepted",
    })
      .populate("userId", "username profilePicture status")
      .populate("contactId", "username profilePicture status")
      .lean();

    const contacts = relations.map((rel) => {
      const contact =
        rel.userId._id.toString() === userId.toString()
          ? rel.contactId
          : rel.userId;

      return {
        id: contact._id,
        _id: contact._id,
        username: contact.username,
        profilePicture: contact.profilePicture,
        status: contact.status,
        isContact: true,
      };
    });

    res.json(contacts);
  } catch (error) {
    console.error("❌ Erreur récupération contacts:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ ACCEPTER UNE DEMANDE DE MESSAGE - CORRIGÉ
router.post('/accept-request', protact, async (req, res) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user.id;

    console.log('🎯 Accept-request - userId:', userId, 'conversationId:', conversationId);

    // 1️⃣ Récupérer conversation
    const conversation = await Conversation.findById(conversationId).populate('participants');
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation non trouvée' });
    }

    console.log('📋 Conversation trouvée:', {
      _id: conversation._id,
      participants: conversation.participants.map(p => p._id.toString()),
      messageRequestFrom: conversation.messageRequestFrom?.toString(),
      messageRequestFor: conversation.messageRequestFor?.toString()
    });

    // 2️⃣ Trouver l'autre participant
    const otherUserId = conversation.participants.find(p => 
      p._id.toString() !== userId.toString()
    )?._id;

    if (!otherUserId) {
      return res.status(400).json({ success: false, error: 'Autre participant non trouvé' });
    }

    console.log('👤 Autre utilisateur trouvé:', otherUserId.toString());

    // 3️⃣ Créer relation bidirectionnelle ACCEPTED - CORRIGÉ !
    const relation1 = await Relation.create({ 
      userId, 
      contactId: otherUserId,  // ✅ CORRECTION ICI
      status: 'accepted' 
    });

    const relation2 = await Relation.create({ 
      userId: otherUserId, 
      contactId: userId, 
      status: 'accepted' 
    });

    console.log('✅ Relations créées:', { relation1: relation1._id, relation2: relation2._id });

    // 4️⃣ Reset flags message request
    await Conversation.findByIdAndUpdate(conversationId, {
      $set: { 
        isMessageRequest: false
      },
      $unset: {
        messageRequestFrom: "",
        messageRequestFor: ""
      }
    });

    console.log('✅ Flags message request supprimés');

    // 5️⃣ Socket emit pour refresh frontend DES DEUX USERS
    const io = req.app.get('io');
    if (io) {
      io.to(conversationId).emit('message_request_accepted', { 
        conversationId, 
        userId 
      });
      io.to(`user_${userId}`).emit('message_request_accepted', { conversationId });
      io.to(`user_${otherUserId}`).emit('message_request_accepted', { conversationId });
      
      console.log('📡 Événements socket émis pour:', userId, 'et', otherUserId.toString());
    }

    res.json({ success: true, message: 'Demande acceptée' });
  } catch (error) {
    console.error('❌ Erreur accept-request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ SUPPRIMER UNE DEMANDE DE MESSAGE - CORRIGÉ
router.post("/delete-request", protact, async (req, res) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user._id.toString(); // ✅ Convertir en string

    console.log('🗑️ Delete-request - userId:', userId, 'conversationId:', conversationId);

    if (!conversationId) {
      return res.status(400).json({ error: "conversationId requis" });
    }

    // 1️⃣ Récupérer la conversation avec populate
    const conversation = await Conversation.findById(conversationId).populate('participants');
    if (!conversation) {
      return res.status(404).json({ error: "Conversation non trouvée" });
    }

    console.log('📋 Conversation trouvée:', {
      _id: conversation._id,
      type: conversation.type,
      participants: conversation.participants?.map(p => p._id?.toString()),
      messageRequestFor: conversation.messageRequestFor?.toString(),
      messageRequestFrom: conversation.messageRequestFrom?.toString()
    });

    // 2️⃣ Vérifier que je suis bien participant
    const isParticipant = conversation.participants?.some(
      p => p._id.toString() === userId
    );

    if (!isParticipant) {
      return res.status(403).json({ error: "Vous n'êtes pas participant de cette conversation" });
    }

    // 3️⃣ Vérifier que c'est bien une demande de message pour moi
    const isForMe = conversation.messageRequestFor?.toString() === userId;
    
    if (!isForMe) {
      return res.status(403).json({ error: "Cette demande n'est pas pour vous" });
    }

    // 4️⃣ Trouver l'autre utilisateur
    const otherUserId = conversation.participants.find(
      p => p._id.toString() !== userId
    )?._id;

    console.log('👤 Autre utilisateur:', otherUserId?.toString());

    // 5️⃣ Supprimer toutes les relations (pending ou autres)
    const deleteResult = await Relation.deleteMany({
      $or: [
        { userId: otherUserId, contactId: userId },
        { userId: userId, contactId: otherUserId },
      ],
    });

    console.log('✅ Relations supprimées:', deleteResult.deletedCount);

    // 6️⃣ Supprimer la conversation complètement
    await Conversation.findByIdAndDelete(conversationId);
    console.log('✅ Conversation supprimée');

    // 7️⃣ Notifier l'expéditeur via socket
    const io = req.app.get("io");
    if (io && otherUserId) {
      io.to(`user_${otherUserId}`).emit("message_request_deleted", {
        conversationId: conversationId,
      });
      console.log('📡 Socket émis vers:', otherUserId.toString());
    }

    res.json({
      success: true,
      message: "Demande supprimée avec succès",
    });
  } catch (error) {
    console.error("❌ Erreur suppression:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;