import User from '../models/User.js';
import mongoose from 'mongoose';

// Ajouter un favori (userId envoyé dans body)
export const addFavoriteConversation = async (req, res) => {
  const { userId, conversationId } = req.body;

  if (!userId || !conversationId) {
    return res.status(400).json({ error: 'userId et conversationId sont requis' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    const convoObjectId = new mongoose.Types.ObjectId(conversationId);

    // Vérifie que favorites ne contient pas déjà l'ID
    if (!user.favorites.some(id => id.equals(convoObjectId))) {
      user.favorites.push(convoObjectId);
      await user.save();
    }

    res.status(200).json({ message: 'Conversation ajoutée aux favoris' });
  } catch (error) {
    console.error('Erreur addFavoriteConversation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Supprimer un favori
export const removeFavoriteConversation = async (req, res) => {
  const { userId, conversationId } = req.body;

  if (!userId || !conversationId) {
    return res.status(400).json({ error: 'userId et conversationId sont requis' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    user.favorites = user.favorites.filter(
      (id) => id.toString() !== conversationId
    );

    await user.save();

    res.status(200).json({ message: 'Conversation supprimée des favoris' });
  } catch (error) {
    console.error('Erreur removeFavoriteConversation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Récupérer les favoris
export const getFavoriteConversations = async (req, res) => {
  const { userId } = req.query;

  if (!userId) return res.status(400).json({ error: 'userId est requis' });

  try {
    const user = await User.findById(userId).populate('favorites');
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    console.log('Favorites peuplés:', user.favorites); // <-- ajout debug

    res.status(200).json(user.favorites);
  } catch (error) {
    console.error('Erreur getFavoriteConversations:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
