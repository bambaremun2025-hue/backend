const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Route de test
app.get('/api/test', (req, res) => {
  res.json({ message: 'API AUTH fonctionne!', timestamp: new Date() });
});

// Route d'inscription
app.post('/api/auth/register', (req, res) => {
  console.log('📝 Inscription reçue');
  const { username, email, password } = req.body;
  
  const token = jwt.sign({ userId: 'user_' + Date.now() }, 'secret');
  
  res.json({
    success: true,
    message: 'Utilisateur créé!',
    token: token,
    user: { username, email, id: 'user_' + Date.now() }
  });
});

// Route de connexion
app.post('/api/auth/login', (req, res) => {
  console.log('🔐 Connexion reçue');
  const { email, password } = req.body;
  
  const token = jwt.sign({ userId: 'user_123' }, 'secret');
  
  res.json({
    success: true,
    message: 'Connexion réussie!',
    token: token,
    user: { email, id: 'user_123', username: 'testuser' }
  });
});

const PORT = 5001; // Port DIFFÉRENT pour être sûr
app.listen(PORT, () => {
  console.log(`🎉 SERVEUR AUTH sur http://localhost:${PORT}`);
  console.log(`✅ Test: curl http://localhost:${PORT}/api/test`);
  console.log(`✅ Auth: curl -X POST http://localhost:${PORT}/api/auth/register -d '{"username":"test","email":"test@test.com","password":"123"}'`);
});
