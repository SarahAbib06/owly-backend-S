
import User from '../models/User.js';
import Relation from '../models/Relation.js';

// Rechercher des utilisateurs par username

export const searchUsers = async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username || username.trim() === '') {
      return res.status(400).json([]);
    }

    const trimmed = username.trim();

    const users = await User.find({
      username: { $regex: new RegExp(trimmed, 'i') }, // Recherche partielle
      _id: { $ne: req.user._id }
    })
    .select('username profilePicture status _id')
    .limit(10)
    .sort({ username: 1 });

    res.json(users);
  } catch (error) {
    console.error('Erreur recherche:', error);
    res.status(500).json([]);
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


