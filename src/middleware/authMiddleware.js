// middleware/authMiddleware.js  ← RENOMME LE FICHIER COMME ÇA
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: "Token manquant" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const user = await User.findById(decoded.id || decoded._id);
    if (!user) return res.status(401).json({ message: "Utilisateur non trouvé" });
    
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalide" });
  }
};

export default authMiddleware;   // ← CETTE LIGNE EST OBLIGATOIRE