import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import connectDB from './src/config/db.js';
import authRoutes from './src/routes/auth.js';
import searchRelationsRoutes from './src/routes/searchRelationsRoutes.js';



console.log(' MONGODB_URI:', process.env.MONGODB_URI ? ' Chargé' : ' Non défini');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? ' Chargé' : ' Non défini');
const app = express();

connectDB();

//  1. Autoriser les requêtes CORS AVANT tout
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
  credentials: true,
}));

//  2. Activer la lecture du JSON
app.use(express.json());
app.use("/public", express.static("public"));


//  3. Les routes après
app.use('/api/auth', authRoutes);
app.use('/api', searchRelationsRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(` Server running on port ${PORT}`));


