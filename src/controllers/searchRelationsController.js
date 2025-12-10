// controllers/searchRelationsController.js
import User from '../models/User.js';
import Relation from '../models/Relation.js';

// Rechercher des utilisateurs par username
// Rechercher des utilisateurs par username (recherche exacte)
export const searchUsers = async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ message: 'Le paramètre username est requis' });
    }

    const users = await User.find({
      username: username, // Recherche exacte au lieu de regex
      _id: { $ne: req.user.id }
    }).select('username profilePicture status');

    res.json(users);
  } catch (error) {
    console.error('Erreur recherche:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};
// Obtenir le profil d'un utilisateur
// getUserProfile modifié pour retourner l'ID de relation
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('username profilePicture status createdAt');

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const relation = await Relation.findOne({
      $or: [
        { userId: req.user.id, contactId: req.params.userId },
        { userId: req.params.userId, contactId: req.user.id }
      ]
    });

    res.json({
      user,
      relation: relation ? relation.status : null,
      relationId: relation ? relation._id : null // ← AJOUTEZ CETTE LIGNE
    });
  } catch (error) {
    console.error('Erreur profil:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};





// Obtenir les contacts (relations acceptées)
export const getContacts = async (req, res) => {
  try {
    const relations = await Relation.find({
      $or: [
        { userId: req.user.id },
        { contactId: req.user.id }
      ],
      status: 'accepted'
    })
    .populate('userId', 'username profilePicture status lastSeen')
    .populate('contactId', 'username profilePicture status lastSeen');

    const contacts = relations.map(relation => {
      const isUser = relation.userId._id.toString() === req.user.id;
      const contactUser = isUser ? relation.contactId : relation.userId;
      
      return {
        _id: relation._id,
        contactId: contactUser._id,
        username: contactUser.username,
        profilePicture: contactUser.profilePicture,
        status: contactUser.status,
        lastSeen: contactUser.lastSeen,
        addedAt: relation.addedAt
      };
    });

    res.json({ 
      success: true, 
      contacts 
    });
  } catch (error) {
    console.error('Erreur récupération relations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur' 
    });
  }
};