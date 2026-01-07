// controllers/relationsController.js
import Relation from "../models/Relation.js";
import User from "../models/User.js";

export const getContacts = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({ message: "Utilisateur non authentifié" });
    }

    // Recherche efficace : toutes les relations acceptées où l'utilisateur est userId OU contactId
    const relations = await Relation.find({
      status: "accepted",
      $or: [{ userId: userId }, { contactId: userId }],
    })
      .populate({
        path: "userId",
        select: "username profilePicture status",
      })
      .populate({
        path: "contactId",
        select: "username profilePicture status",
      })
      .lean(); // ← Important : .lean() pour performance (retourne des objets JS purs)

    // Construction du tableau de contacts
    const contacts = relations
      .filter((relation) => {
        // Sécurité : s'assurer que les deux users sont bien populés
        const user = relation.userId;
        const contact = relation.contactId;
        return user && contact && user._id && contact._id;
      })
      .map((relation) => {
        const isMeTheInitiator = relation.userId._id.toString() === userId.toString();
        const contactUser = isMeTheInitiator ? relation.contactId : relation.userId;

        return {
          _id: contactUser._id.toString(),
          id: contactUser._id.toString(), // compatibilité avec ton frontend
          username: contactUser.username || "Utilisateur inconnu",
          profilePicture: contactUser.profilePicture || null,
          status: contactUser.status || "offline",
          relationId: relation._id.toString(),
          addedAt: relation.addedAt || relation.createdAt,
        };
      });

    // Optionnel : trier par date d'ajout (le plus récent en haut)
    contacts.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    // Réponse directe → ton frontend attend un tableau
    res.json(contacts);
  } catch (error) {
    console.error("Erreur récupération contacts:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la récupération des contacts",
    });
  }
};

export const acceptMessageRequest = async (req, res) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user.id;
    
    // Vérifie que c'est une message request pour cet user
    const conversation = await Conversation.findById(conversationId)
      .populate('messageRequestFrom', 'username');
    if (!conversation || !conversation.isMessageRequest || 
        conversation.messageRequestFor.toString() !== userId.toString()) {
      return res.status(400).json({ error: 'Demande invalide' });
    }
    
    // Accepte la relation
    await Relation.findOneAndUpdate(
      { 
        $or: [
          { userId: conversation.messageRequestFrom._id, contactId: userId },
          { userId: userId, contactId: conversation.messageRequestFrom._id }
        ]
      },
      { status: 'accepted', acceptedAt: new Date() }
    );
    
    // Met à jour la conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      isMessageRequest: false,
      messageRequestFor: null,
      messageRequestFrom: null
    });
    
    // Émet via socket pour refresh frontend
    req.io?.to(conversationId.toString()).emit('messagerequestaccepted', { 
      conversationId, 
      status: 'accepted' 
    });
    
    res.json({ success: true, message: 'Contact ajouté' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const rejectMessageRequest = async (req, res) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user.id;
    
    const conversation = await Conversation.findById(conversationId);
    if (!conversation?.isMessageRequest || 
        conversation.messageRequestFor.toString() !== userId.toString()) {
      return res.status(400).json({ error: 'Demande invalide' });
    }
    
    // Supprime la conversation message request
    await Conversation.findByIdAndDelete(conversationId);
    
    // Émet via socket
    req.io?.to(conversationId.toString()).emit('messagerequestdeleted', { 
      conversationId 
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};