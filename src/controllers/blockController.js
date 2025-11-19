// controllers/blockController.js
import Relation from '../models/Relation.js';
import User from '../models/User.js';

/**
 * BLOQUER (par username OU par _id)
 */
export const blockUser = async (req, res) => {
  try {
    let { contact } = req.body;
    const userId = req.user._id;

    if (!contact) {
      return res.status(400).json({ success: false, message: "contact manquant (username ou _id)" });
    }

    let contactId;
    if (/^[0-9a-fA-F]{24}$/.test(contact)) {
      contactId = contact;
    } else {
      const targetUser = await User.findOne({
        username: { $regex: `^${contact}$`, $options: 'i' }
      }).select('_id');

      if (!targetUser) {
        return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
      }
      contactId = targetUser._id;
    }

    if (contactId.toString() === userId.toString()) {
      return res.status(400).json({ success: false, message: "Tu ne peux pas te bloquer toi-même" });
    }

    await Relation.findOneAndUpdate(
      { userId, contactId },
      { status: 'blocked', blockedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Utilisateur bloqué" });

  } catch (error) {
    console.error("Erreur blocage:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};

/**
 * DÉBLOQUER (par username OU par _id)
 */
export const unblockUser = async (req, res) => {
  try {
    let { contact } = req.body;
    const userId = req.user._id;

    if (!contact) {
      return res.status(400).json({ success: false, message: "contact manquant" });
    }

    let contactId;
    if (/^[0-9a-fA-F]{24}$/.test(contact)) {
      contactId = contact;
    } else {
      const targetUser = await User.findOne({
        username: { $regex: `^${contact}$`, $options: 'i' }
      }).select('_id');

      if (!targetUser) {
        return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
      }
      contactId = targetUser._id;
    }

    const result = await Relation.deleteOne({ userId, contactId, status: 'blocked' });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "Aucun blocage trouvé" });
    }

    res.json({ success: true, message: "Utilisateur débloqué" });

  } catch (error) {
    console.error("Erreur déblocage:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};

/**
 * LISTE DES PERSONNES BLOQUÉES
 */
export const getBlockedUsers = async (req, res) => {
  try {
    const userId = req.user._id;

    const blockedRelations = await Relation.find({
      userId,
      status: 'blocked'
    }).populate('contactId', 'username email profilePicture _id');

    const blockedUsers = blockedRelations.map(rel => ({
      _id: rel.contactId._id,
      username: rel.contactId.username,
      email: rel.contactId.email,
      profilePicture: rel.contactId.profilePicture,
      blockedAt: rel.blockedAt || rel.addedAt
    }));

    res.json({
      success: true,
      count: blockedUsers.length,
      blockedUsers
    });

  } catch (error) {
    console.error("Erreur liste bloqués:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};