// routes/groupRoutes.js - AVEC MESSAGES SYSTÈME
import express from 'express';
import { protact } from '../middleware/authen.js';
import Conversation from '../models/Conversation.js';
import Participants from '../models/Participants.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import mongoose from 'mongoose';
import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import streamifier from 'streamifier';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// 🆕 FONCTION POUR CRÉER UN MESSAGE SYSTÈME
const createSystemMessage = async (conversationId, content, io = null) => {
  try {
        console.log("🔍 DÉBUT createSystemMessage:", {
      conversationId: conversationId.toString(),
      content,
      ioDisponible: !!io
    });
    const systemMessage = await Message.create({
      conversationId,
      content,
      typeMessage: 'system',
      status: 'sent',
      createdAt: new Date(), // ← Ajoutez createdAt explicitement
    });

       console.log("✅ Message système créé en DB:", {
      _id: systemMessage._id,
      conversationId: systemMessage.conversationId.toString(),
      content: systemMessage.content,
      typeMessage: systemMessage.typeMessage
    });

    // Émettre via Socket.IO si disponible
    if (io) {
      const messageData = {
        _id: systemMessage._id,
        conversationId: conversationId.toString(),
        content,
        typeMessage: 'system',
        createdAt: systemMessage.createdAt,
        status: 'sent',
      };

      console.log("📡 Émission message système vers salle:", conversationId.toString());
      io.to(conversationId.toString()).emit('new_message', messageData);
    } else {
      console.warn("⚠️ IO non disponible pour émettre le message système");
    }

    return systemMessage;
  } catch (error) {
    console.error('❌ Erreur création message système:', error);
  }
};

const uploadToCloudinary = async (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'group_avatars',
        resource_type: 'image',
        transformation: [
          { width: 500, height: 500, crop: 'fill' },
          { quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
};

// 🔥 CRÉER UN GROUPE
router.post('/', protact, upload.single('groupPic'), async (req, res) => {
  try {
    const { groupName, groupDescription, participantIds } = req.body;
    const creatorId = req.user.id;
    const participantsArray = JSON.parse(participantIds);

    if (!groupName?.trim()) {
      return res.status(400).json({ success: false, error: 'Nom requis' });
    }
    if (participantsArray.length === 0) {
      return res.status(400).json({ success: false, error: '1 participant min' });
    }

    const allUserIds = [creatorId, ...participantsArray];
    
    const users = await User.find({ _id: { $in: allUserIds } });
    if (users.length !== allUserIds.length) {
      return res.status(400).json({ success: false, error: 'User(s) introuvable(s)' });
    }

    let groupPicUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file);
        groupPicUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('❌ Erreur upload Cloudinary:', uploadError);
      }
    }

    const newConversation = await Conversation.create({
      Id_participant: allUserIds,
      type: 'group',
      groupName: groupName.trim(),
      groupDescription: groupDescription?.trim() || '',
      groupPic: groupPicUrl,
      createdBy: creatorId,
    });

    const participantsData = allUserIds.map(userId => ({
      Id_User: userId,
      Id_Conversation: newConversation._id,
      Role: userId.toString() === creatorId.toString() ? 'admin' : 'membre',
    }));

    await Participants.insertMany(participantsData);
    
    // 🆕 MESSAGE SYSTÈME : Groupe créé
    const creator = await User.findById(creatorId);
    await createSystemMessage(
      newConversation._id, 
      `${creator.username} a créé le groupe`,
      req.io
    );

    res.json({ 
      success: true, 
      group: {
        _id: newConversation._id,
        id: newConversation._id,
        type: 'group',
        groupName: newConversation.groupName,
        groupDescription: newConversation.groupDescription,
        groupPic: newConversation.groupPic,
        participantCount: allUserIds.length,
        lastMessageAt: newConversation.lastMessageAt,
      }
    });

  } catch (error) {
    console.error('💥 ERREUR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🆕 MODIFIER GROUPE
router.put('/:groupId', protact, upload.single('groupPic'), async (req, res) => {
  try {
    const { groupId } = req.params;
    const { groupName, groupDescription } = req.body;
    const userId = req.user.id;

    const adminCheck = await Participants.findOne({ 
      Id_User: userId, 
      Id_Conversation: groupId, 
      Role: 'admin' 
    });

    if (!adminCheck) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    const oldConversation = await Conversation.findById(groupId);
    const updates = {};
    
    if (groupName?.trim() && groupName.trim() !== oldConversation.groupName) {
      updates.groupName = groupName.trim();
      
      // 🆕 MESSAGE SYSTÈME : Nom modifié
      const admin = await User.findById(userId);
      await createSystemMessage(
        groupId,
        `${admin.username} a modifié le nom du groupe`,
        req.io
      );
    }
    
    if (groupDescription !== undefined) {
      updates.groupDescription = groupDescription?.trim() || '';
    }

    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file);
        updates.groupPic = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('❌ Erreur upload:', uploadError);
        return res.status(500).json({ 
          success: false, 
          error: 'Erreur upload image' 
        });
      }
    }

    const updatedConversation = await Conversation.findByIdAndUpdate(
      groupId,
      { $set: updates },
      { new: true }
    );

    if (!updatedConversation) {
      return res.status(404).json({ success: false, error: 'Groupe introuvable' });
    }

    res.json({ 
      success: true, 
      group: {
        _id: updatedConversation._id,
        groupName: updatedConversation.groupName,
        groupDescription: updatedConversation.groupDescription,
        groupPic: updatedConversation.groupPic,
      }
    });

  } catch (error) {
    console.error('💥 Erreur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔥 RÉCUPÉRER MEMBRES
router.get('/:groupId/members', protact, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const isMember = await Participants.findOne({ 
      Id_User: userId, 
      Id_Conversation: groupId 
    });
    
    if (!isMember) {
      return res.status(403).json({ success: false, error: 'Non membre' });
    }

    const members = await Participants.find({ Id_Conversation: groupId })
      .populate('Id_User', 'username profilePicture')
      .select('Id_User Role');

    res.json({ 
      success: true, 
      members: members.map(m => ({
        id: m.Id_User._id,
        username: m.Id_User.username,
        profilePicture: m.Id_User.profilePicture,
        role: m.Role
      }))
    });
  } catch (error) {
    console.error('💥 Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🆕 PROMOUVOIR EN ADMIN
router.post('/:groupId/members/:userId/promote', protact, async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const adminId = req.user.id;

    const adminCheck = await Participants.findOne({ 
      Id_User: adminId, 
      Id_Conversation: groupId, 
      Role: 'admin' 
    });
    
    if (!adminCheck) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    const memberToPromote = await Participants.findOne({
      Id_User: userId,
      Id_Conversation: groupId
    });

    if (!memberToPromote) {
      return res.status(404).json({ success: false, error: 'Membre introuvable' });
    }

    if (memberToPromote.Role === 'admin') {
      return res.status(400).json({ success: false, error: 'Déjà admin' });
    }

    await Participants.updateOne(
      { Id_User: userId, Id_Conversation: groupId },
      { $set: { Role: 'admin' } }
    );
    
    // 🆕 MESSAGE SYSTÈME : Promotion
    const [admin, promoted] = await Promise.all([
      User.findById(adminId),
      User.findById(userId)
    ]);
    
    await createSystemMessage(
      groupId,
      `${promoted.username} a été promu(e) administrateur par ${admin.username}`,
      req.io
    );
    
    res.json({ success: true, message: 'Membre promu' });
  } catch (error) {
    console.error('💥 Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔥 AJOUTER MEMBRES
router.post('/:groupId/members', protact, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userIds } = req.body;
    const adminId = req.user.id;

    const adminCheck = await Participants.findOne({ 
      Id_User: adminId, 
      Id_Conversation: groupId, 
      Role: 'admin' 
    });
    
    if (!adminCheck) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    const users = await User.find({ _id: { $in: userIds } });
    if (users.length !== userIds.length) {
      return res.status(400).json({ success: false, error: 'User(s) introuvable(s)' });
    }

    const newMembers = userIds.map(id => ({
      Id_User: id,
      Id_Conversation: groupId,
      Role: 'membre'
    }));

    await Participants.insertMany(newMembers);

    // 🆕 MESSAGE SYSTÈME : Membres ajoutés
    const admin = await User.findById(adminId);
    const io = req.io;
    
  for (const user of users) {
    await createSystemMessage(
      groupId,
      `${user.username} a été ajouté(e) par ${admin.username}`,
      io // ← NE PAS OUBLIER
    );
  }

    res.json({ success: true });
  } catch (error) {
    console.error('💥 Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔥 SUPPRIMER MEMBRE
router.delete('/:groupId/members/:userId', protact, async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const adminId = req.user.id;

    const adminCheck = await Participants.findOne({ 
      Id_User: adminId, 
      Id_Conversation: groupId, 
      Role: 'admin' 
    });
    
    if (!adminCheck) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    const memberToRemove = await Participants.findOne({
      Id_User: userId,
      Id_Conversation: groupId
    });

    if (memberToRemove?.Role === 'admin') {
      const admins = await Participants.countDocuments({ 
        Id_Conversation: groupId, 
        Role: 'admin' 
      });
      
      if (admins <= 1) {
        return res.status(400).json({ 
          success: false, 
          error: 'Impossible de retirer le dernier admin' 
        });
      }
    }

    await Participants.deleteOne({ Id_User: userId, Id_Conversation: groupId });
    
    // 🆕 MESSAGE SYSTÈME : Membre supprimé
    const [admin, removed] = await Promise.all([
      User.findById(adminId),
      User.findById(userId)
    ]);
    
    await createSystemMessage(
      groupId,
      `${removed.username} a été retiré(e) par ${admin.username}`,
      req.io 
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('💥 Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔥 QUITTER GROUPE
router.delete('/:groupId/leave', protact, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const myMembership = await Participants.findOne({
      Id_User: userId,
      Id_Conversation: groupId
    });

    if (myMembership?.Role === 'admin') {
      const otherAdmins = await Participants.countDocuments({ 
        Id_Conversation: groupId, 
        Role: 'admin', 
        Id_User: { $ne: userId } 
      });

      if (otherAdmins === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Nommez un autre admin avant de quitter' 
        });
      }
    }

    await Participants.deleteOne({ Id_User: userId, Id_Conversation: groupId });
    
    // 🆕 MESSAGE SYSTÈME : A quitté
    const user = await User.findById(userId);
    await createSystemMessage(
      groupId,
      `${user.username} a quitté le groupe`,
      req.io
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('💥 Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;