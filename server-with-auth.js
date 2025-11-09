const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const app = express();
const PORT = 5000;

app.use(express.json());

// Base de données
const dbPath = path.join(__dirname, 'ma-boutique.db');
const db = new sqlite3.Database(dbPath);

// Tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    nom TEXT,
    boutique TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Route test
app.get('/api/test', (req, res) => {
  res.json({ 
    message: '🎉 Backend avec authentification!',
    timestamp: new Date()
  });
});

// INSCRIPTION
app.post('/api/register', async (req, res) => {
  const { email, password, nom, boutique } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(
      'INSERT INTO users (email, password, nom, boutique) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, nom, boutique],
      function(err) {
        if (err) {
          return res.status(400).json({ error: 'Email déjà utilisé' });
        }
        res.json({ 
          message: '✅ Compte créé avec succès!', 
          user: { id: this.lastID, email, nom, boutique }
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// CONNEXION
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Erreur base de données' });
    if (!user) return res.status(401).json({ error: 'Utilisateur non trouvé' });
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Mot de passe incorrect' });
    
    res.json({ 
      message: '✅ Connexion réussie!', 
      user: { 
        id: user.id, 
        email: user.email, 
        nom: user.nom,
        boutique: user.boutique
      } 
    });
  });
});

// LISTE UTILISATEURS (pour test)
app.get('/api/users', (req, res) => {
  db.all('SELECT id, email, nom, boutique FROM users', [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ users: rows });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur auth démarré sur http://localhost:${PORT}`);
  console.log(`📊 Teste l'API: http://localhost:${PORT}/api/test`);
});
