const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Route de test
app.get('/api/test', (req, res) => {
  res.json({ message: 'API SIMPLE fonctionne!', timestamp: new Date() });
});

// Route d'inscription SIMULÉE
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    console.log('✅ Inscription reçue:', { username, email });
    
    // Simulation sans base de données
    const token = jwt.sign(
      { userId: 'simulated_' + Date.now() }, 
      process.env.JWT_SECRET || 'secret_fallback',
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Utilisateur créé avec succès!',
      token: token,
      user: { 
        id: 'simulated_' + Date.now(),
        username: username,
        email: email
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route de connexion SIMULÉE
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('✅ Connexion reçue:', { email });
    
    // Simulation sans base de données
    const token = jwt.sign(
      { userId: 'simulated_user' }, 
      process.env.JWT_SECRET || 'secret_fallback',
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Connexion réussie!',
      token: token,
      user: { 
        id: 'simulated_user',
        email: email,
        username: 'utilisateur_test'
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur connexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur SIMPLE démarré sur http://localhost:${PORT}`);
  console.log(`✅ Test API: curl http://localhost:${PORT}/api/test`);
  console.log(`✅ Test Auth: curl -X POST http://localhost:${PORT}/api/auth/register -H "Content-Type: application/json" -d '{"username":"test","email":"test@test.com","password":"123"}'`);
});
