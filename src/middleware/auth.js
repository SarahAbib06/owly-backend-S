import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {
  // 1. Récupérer le token depuis le header "Authorization"
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Token manquant" });

  // Le token est sous la forme "Bearer <ton-token>"
  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token invalide" });

  try {
    // 2. Vérifier le token avec la clé secrète
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Ajouter les infos de l’utilisateur à la requête
    req.user = decoded;

    // 4. Passer à la route suivante
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalide ou expiré" });
  }
};

export default authMiddleware;
