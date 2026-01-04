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