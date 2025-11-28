// controllers/searchRelationsController.js
import User from '../models/User.js';
import Relation from '../models/Relation.js';

// Rechercher des utilisateurs par username
export const searchUsers = async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ message: 'Le paramètre username est requis' });
    }

    const users = await User.find({
      username: { $regex: username, $options: 'i' },
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
// Envoyer une invitation
export const sendInvitation = async (req, res) => {
  try {
    const { contactId } = req.body;

    if (!contactId) {
      return res.status(400).json({ message: 'contactId est requis' });
    }

    const contactUser = await User.findById(contactId);
    if (!contactUser) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const existingRelation = await Relation.findOne({
      userId: req.user.id,
      contactId: contactId
    });

    if (existingRelation) {
      return res.status(400).json({ message: 'Invitation déjà envoyée' });
    }

    const relation = new Relation({
      userId: req.user.id,
      contactId: contactId,
      status: 'pending'
    });

    await relation.save();

    res.status(201).json({ message: 'Invitation envoyée', relation });
  } catch (error) {
    console.error('Erreur envoi invitation:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Accepter une invitation
export const acceptInvitation = async (req, res) => {
  try {
    const { relationId } = req.body;

    if (!relationId) {
      return res.status(400).json({ message: 'relationId est requis' });
    }

    const relation = await Relation.findById(relationId);

    if (!relation) {
      return res.status(404).json({ message: 'Invitation non trouvée' });
    }

    if (relation.contactId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    relation.status = 'accepted';
    await relation.save();

    res.json({ message: 'Invitation acceptée', relation });
  } catch (error) {
    console.error('Erreur acceptation:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Obtenir les invitations en attente
export const getPendingInvitations = async (req, res) => {
  try {
    const invitations = await Relation.find({
      contactId: req.user.id,
      status: 'pending'
    }).populate('userId', 'username profilePicture');

    res.json(invitations);
  } catch (error) {
    console.error('Erreur récupération invitations:', error);
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
    .populate('userId', 'username profilePicture status')
    .populate('contactId', 'username profilePicture status');

    const contacts = relations.map(relation => {
      const isUser = relation.userId._id.toString() === req.user.id;
      return {
        _id: relation._id,
        contact: isUser ? relation.contactId : relation.userId,
        status: relation.status,
        addedAt: relation.addedAt
      };
    });

    res.json(contacts);
  } catch (error) {
    console.error('Erreur récupération relations:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Bloquer un utilisateur
export const blockUser = async (req, res) => {
  try {
    const { contactId } = req.body;

    if (!contactId) {
      return res.status(400).json({ message: 'contactId est requis' });
    }

    // Vérifier si une relation existe déjà
    let relation = await Relation.findOne({
      $or: [
        { userId: req.user.id, contactId: contactId },
        { userId: contactId, contactId: req.user.id }
      ]
    });

    if (relation) {
      relation.status = 'blocked';
    } else {
      relation = new Relation({
        userId: req.user.id,
        contactId: contactId,
        status: 'blocked'
      });
    }

    await relation.save();

    res.json({ message: 'Utilisateur bloqué', relation });
  } catch (error) {
    console.error('Erreur blocage:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};


// Annuler une invitation
export const cancelInvitation = async (req, res) => {
  try {
    const { relationId } = req.params;

    if (!relationId) {
      return res.status(400).json({ message: 'relationId est requis' });
    }

    const relation = await Relation.findById(relationId);

    if (!relation) {
      return res.status(404).json({ message: 'Invitation non trouvée' });
    }

    // Vérifier que l'utilisateur est bien l'expéditeur de l'invitation
    if (relation.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    // Supprimer la relation
    await Relation.findByIdAndDelete(relationId);

    res.json({ message: 'Invitation annulée' });
  } catch (error) {
    console.error('Erreur annulation invitation:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Supprimer un contact
export const removeContact = async (req, res) => {
  try {
    const { relationId } = req.params;

    if (!relationId) {
      return res.status(400).json({ message: 'relationId est requis' });
    }

    const relation = await Relation.findById(relationId);

    if (!relation) {
      return res.status(404).json({ message: 'Relation non trouvée' });
    }

    // Vérifier que l'utilisateur fait partie de la relation
    if (relation.userId.toString() !== req.user.id && relation.contactId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    // Supprimer la relation
    await Relation.findByIdAndDelete(relationId);

    res.json({ message: 'Contact supprimé' });
  } catch (error) {
    console.error('Erreur suppression contact:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};