// controllers/relationsController.js
import Relation from '../models/Relation.js';
import User from '../models/User.js';

export const getContacts = async (req, res) => {
  try {
    const userId = req.user.id;

    // Cherche toutes les relations "accepted" où l'utilisateur est impliqué
    const relations = await Relation.find({
      $or: [
        { userId: userId, status: 'accepted' },
        { contactId: userId, status: 'accepted' }
      ]
    })
    .populate('userId', 'username profilePicture status')
    .populate('contactId', 'username profilePicture status');

    // Formate les contacts : pour chaque relation, prend l'autre utilisateur (pas moi)
    const contacts = relations.map(relation => {
      // Si je suis le userId, le contact est contactId
      // Si je suis le contactId, le contact est userId
      const isUser = relation.userId._id.toString() === userId;
      const contact = isUser ? relation.contactId : relation.userId;
      
      return {
        id: contact._id,
        _id: contact._id,
        username: contact.username,
        profilePicture: contact.profilePicture || null,
        status: contact.status || 'offline',
        relationId: relation._id, // ID de la relation
        addedAt: relation.addedAt
      };
    });

   

    res.json(contacts); // Retourne directement le tableau, pas besoin de wrapper

  } catch (error) {
    console.error('❌ Erreur récupération contacts:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des contacts' 
    });
  }
};