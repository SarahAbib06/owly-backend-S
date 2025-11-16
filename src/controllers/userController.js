import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Inscription d'un nouvel utilisateur
export const registerUser = async (req, res) => {
  try {
    const { username, email, password, photo, dateOfBirth } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({
        message:
          "Un utilisateur avec cet email ou nom d'utilisateur existe déjà",
      });
    }

    // Hasher le mot de passe
    let passwordHash = null;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(password, salt);
    }

    // Générer un QR code simple (dans une vraie app, utiliser une lib dédiée)
    const qrCode = `user_${username}_${Date.now()}`;

    // Créer l'utilisateur
    const user = new User({
      username,
      email,
      passwordHash,
      photo,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      qrCode,
      status: "offline",
      lastSeen: new Date(),
    });

    await user.save();

    // Générer le token JWT
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });

    // Retourner l'utilisateur sans le mot de passe
    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      photo: user.photo,
      dateOfBirth: user.dateOfBirth,
      qrCode: user.qrCode,
      status: user.status,
      createdAt: user.createdAt,
      lastSeen: user.lastSeen,
    };

    res.status(201).json({
      message: "Utilisateur créé avec succès",
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      message: "Erreur lors de la création de l'utilisateur",
      error: error.message,
    });
  }
};

// Connexion utilisateur
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Vérifier si l'utilisateur existe
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        message: "Email ou mot de passe incorrect",
      });
    }

    // Vérifier le mot de passe si l'utilisateur en a un
    if (user.passwordHash) {
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({
          message: "Email ou mot de passe incorrect",
        });
      }
    } else if (password) {
      // Si l'utilisateur n'a pas de passwordHash mais un mot de passe est fourni
      return res.status(401).json({
        message: "Méthode de connexion non supportée",
      });
    }

    // Mettre à jour le statut
    user.status = "online";
    user.lastSeen = new Date();
    await user.save();

    // Générer le token JWT
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });

    // Retourner l'utilisateur sans le mot de passe
    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      photo: user.photo,
      dateOfBirth: user.dateOfBirth,
      qrCode: user.qrCode,
      status: user.status,
      createdAt: user.createdAt,
      lastSeen: user.lastSeen,
    };

    res.json({
      message: "Connexion réussie",
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({
      message: "Erreur lors de la connexion",
      error: error.message,
    });
  }
};

// Récupérer le profil de l'utilisateur connecté
export const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error getting user profile:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération du profil",
      error: error.message,
    });
  }
};

// Récupérer tous les utilisateurs (pour les recherches)
export const getUsers = async (req, res) => {
  try {
    const { search } = req.query;
    let filter = {};

    // Filtrer par recherche si fourni
    if (search) {
      filter = {
        $or: [
          { username: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      };
    }

    const users = await User.find(filter)
      .select("username email photo status createdAt lastSeen")
      .sort({ username: 1 });

    res.json(users);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération des utilisateurs",
      error: error.message,
    });
  }
};

// Récupérer un utilisateur par ID
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "username email photo status dateOfBirth createdAt lastSeen"
    );

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error getting user by ID:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération de l'utilisateur",
      error: error.message,
    });
  }
};

// Mettre à jour le profil utilisateur
export const updateUserProfile = async (req, res) => {
  try {
    const { username, email, photo, dateOfBirth, status } = req.body;
    const userId = req.userId;

    // Vérifier les doublons d'email ou username
    if (email || username) {
      const existingUser = await User.findOne({
        $and: [{ _id: { $ne: userId } }, { $or: [{ email }, { username }] }],
      });

      if (existingUser) {
        return res.status(400).json({
          message: "Email ou nom d'utilisateur déjà utilisé",
        });
      }
    }

    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (photo !== undefined) updateData.photo = photo;
    if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
    if (status) updateData.status = status;

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.json({
      message: "Profil mis à jour avec succès",
      user,
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({
      message: "Erreur lors de la mise à jour du profil",
      error: error.message,
    });
  }
};

// Mettre à jour le statut utilisateur
export const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.userId;

    if (!["online", "offline", "away"].includes(status)) {
      return res.status(400).json({
        message: "Statut invalide. Valeurs autorisées: online, offline, away",
      });
    }

    const updateData = { status };
    if (status === "offline") {
      updateData.lastSeen = new Date();
    }

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).select("username email photo status lastSeen");

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.json({
      message: "Statut mis à jour avec succès",
      user,
    });
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({
      message: "Erreur lors de la mise à jour du statut",
      error: error.message,
    });
  }
};

// Déconnexion utilisateur
export const logoutUser = async (req, res) => {
  try {
    const userId = req.userId;

    await User.findByIdAndUpdate(userId, {
      status: "offline",
      lastSeen: new Date(),
    });

    res.json({ message: "Déconnexion réussie" });
  } catch (error) {
    console.error("Error logging out user:", error);
    res.status(500).json({
      message: "Erreur lors de la déconnexion",
      error: error.message,
    });
  }
};

// Supprimer un utilisateur (admin)
export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.json({ message: "Utilisateur supprimé avec succès" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      message: "Erreur lors de la suppression de l'utilisateur",
      error: error.message,
    });
  }
};
