const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connexion à MongoDB
console.log('🔄 Connexion à MongoDB...');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mon-site')
  .then(() => console.log('✅ Connecté à MongoDB'))
  .catch(err => console.log('❌ Erreur MongoDB:', err.message));

// Import du modèle User
const User = require('./models/User');

// ================= ROUTES =================

// Route de test
app.get('/api/test', (req, res) => {
  res.json({ 
    message: '🚀 API V2 avec VRAIE base de données!', 
    timestamp: new Date(),
    version: '2.0'
  });
});

// INSCRIPTION - VRAIE
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('📝 INSCRIPTION REÇUE:', req.body);
    
    const { username, email, password } = req.body;

    // Vérifier si l'utilisateur existe
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email ou nom d utilisateur déjà utilisé'
      });
    }

    // Créer l'utilisateur
    const user = new User({ username, email, password });
    await user.save();
    
    console.log('✅ UTILISATEUR CRÉÉ:', user._id);

    // Générer token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret');

    res.json({
      success: true,
      message: 'Compte créé avec succès!',
      token: token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        subscription: user.subscription,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('❌ ERREUR INSCRIPTION:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
});

// CONNEXION - VRAIE
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 CONNEXION REÇUE:', req.body.email);
    
    const { email, password } = req.body;

    // Chercher l'utilisateur
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Email ou mot de passe incorrect' 
      });
    }

    // Vérifier mot de passe
    const validPassword = await user.comparePassword(password);
    if (!validPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Email ou mot de passe incorrect' 
      });
    }

    console.log('✅ CONNEXION RÉUSSIE:', user.email);

    // Générer token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret');

    res.json({
      success: true,
      message: 'Connexion réussie!',
      token: token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        subscription: user.subscription
      }
    });

  } catch (error) {
    console.error('❌ ERREUR CONNEXION:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
});

// ================= STATISTIQUES =================

// Stats utilisateurs
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newUsersToday = await User.countDocuments({
      createdAt: { $gte: today }
    });

    res.json({
      success: true,
      stats: {
        totalUsers,
        newUsersToday,
        message: 'Stats réelles depuis la base de données'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Liste tous les utilisateurs
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      users: users,
      count: users.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ================= DÉMARRAGE =================

const PORT = 6000;
app.listen(PORT, () => {
  console.log('=' .repeat(50));
  console.log(`🚀 SERVEUR V2 DÉMARRÉ sur http://localhost:${PORT}`);
  console.log(`📊 Test API: curl http://localhost:${PORT}/api/test`);
  console.log(`👤 Test Auth: curl -X POST http://localhost:${PORT}/api/auth/register -H "Content-Type: application/json" -d '{"username":"test","email":"test@test.com","password":"123"}'`);
  console.log(`📈 Test Stats: curl http://localhost:${PORT}/api/admin/stats`);
  console.log('=' .repeat(50));
});
