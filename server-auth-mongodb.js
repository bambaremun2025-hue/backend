const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connexion à MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mon-site', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connecté à MongoDB'))
.catch(err => console.log('❌ Erreur MongoDB:', err));

// Routes d'authentification
app.use('/api/auth', require('./routes/auth'));

// Route de test
app.get('/api/test', (req, res) => {
  res.json({ message: 'API avec auth MongoDB fonctionne!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📋 Test: http://localhost:${PORT}/api/test`);
});
