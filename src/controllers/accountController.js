// src/controllers/accountController.js
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import Relation from "../models/Relation.js";


export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Mot de passe requis." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    // Vérification du mot de passe
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ message: "Mot de passe incorrect." });
    }

    // Suppression du compte
    await User.findByIdAndDelete(userId);

    return res.status(200).json({
      success: true,
      message: "Votre compte a été supprimé avec succès."
    });

  } catch (error) {
    console.error("Erreur suppression compte:", error);
    return res.status(500).json({
      message: "Erreur serveur."
    });
  }
};


// --- Liste des utilisateurs bloqués ---
export const getBlockedUsers = async (req, res) => {
  try {
    const blockedRelations = await Relation.find({
      userId: req.user._id,
      status: "blocked"
    });

    // Extraire tous les contactId
    const blockedUserIds = blockedRelations.map(relation => relation.contactId);

    // Récupérer les informations des utilisateurs bloqués
    const blockedUsers = await User.find(
      { _id: { $in: blockedUserIds } },
      "username email profilePicture status lastSeen"
    );

    // Combiner les données
    const result = blockedRelations.map(relation => {
      const user = blockedUsers.find(u => u._id.toString() === relation.contactId.toString());
      return {
        _id: relation._id,
        contactId: user || { _id: relation.contactId }, // Fallback si utilisateur non trouvé
        status: relation.status,
        addedAt: relation.addedAt
      };
    });

   
    res.json(result);
  } catch (err) {
    console.error("Erreur getBlockedUsers:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};
// --- Débloquer un utilisateur ---
export const unblockUser = async (req, res) => {
  try {
    const { contactId } = req.params;

    const updated = await Relation.findOneAndUpdate(
      { userId: req.user._id, contactId, status: "blocked" },
      { status: "accepted" },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Utilisateur non trouvé ou pas bloqué" });

    res.json({ message: "Utilisateur débloqué", relation: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "Tous les champs sont requis." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Le nouveau mot de passe et la confirmation ne correspondent pas." });
    }

    // --- Vérification de la complexité du mot de passe ---
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[{\]};:'"\\|,.<>/?`~]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        message: 'Le mot de passe doit contenir au moins 8 caractères, incluant : une majuscule, une minuscule, un chiffre et un caractère spécial.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Mot de passe actuel incorrect." });
    }

    // Hash du nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.passwordHash = hashedPassword;
    await user.save();

    return res.status(200).json({ message: "Mot de passe mis à jour avec succès !" });
  } catch (error) {
    console.error("Erreur changement mot de passe:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};
