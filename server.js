const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: [
        'https://4a5f0464c8f24a09bd2bc580e8c9401a-9ae7243f6c3f4aa0bdc46c3f9.fly.dev',
        'http://localhost:3000',
        'http://localhost:8080'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const dbPath = path.join(__dirname, 'ma-boutique.db');
const db = new sqlite3.Database(dbPath);

db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, password TEXT, name TEXT)");

app.get('/api/test', (req, res) => {
    res.json({ 
        message: "L'API fonctionne !", 
        timestamp: new Date(),
        status: "success"
    });
});

app.post('/api/register', async (req, res) => {
    const { email, password, name } = req.body;
    
    try {
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(
            'INSERT INTO users (email, password, name) VALUES (?, ?, ?)', 
            [email, hashedPassword, name], 
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Email déjà utilisé' });
                    }
                    return res.status(500).json({ error: 'Erreur base de données' });
                }
                
                res.json({ 
                    message: 'Compte créé avec succès', 
                    user: { 
                        id: this.lastID, 
                        email: email, 
                        name: name 
                    } 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur interne' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        if (!email || !password) {
            return res.status(400).json({ error: 'Email et mot de passe requis' });
        }

        db.get(
            'SELECT * FROM users WHERE email = ?', 
            [email], 
            async (err, user) => {
                if (err) {
                    return res.status(500).json({ error: 'Erreur base de données' });
                }
                
                if (!user) {
                    return res.status(401).json({ error: 'Utilisateur non trouvé' });
                }

                const isPasswordValid = await bcrypt.compare(password, user.password);
                if (!isPasswordValid) {
                    return res.status(401).json({ error: 'Mot de passe incorrect' });
                }

                res.json({ 
                    message: 'Connexion réussie', 
                    user: { 
                        id: user.id, 
                        email: user.email, 
                        name: user.name 
                    } 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur interne' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body;
    
    try {
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(
            'INSERT INTO users (email, password, name) VALUES (?, ?, ?)', 
            [email, hashedPassword, name], 
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Email déjà utilisé' });
                    }
                    return res.status(500).json({ error: 'Erreur base de données' });
                }
                
                res.json({ 
                    message: 'Compte créé avec succès', 
                    user: { 
                        id: this.lastID, 
                        email: email, 
                        name: name 
                    } 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur interne' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        if (!email || !password) {
            return res.status(400).json({ error: 'Email et mot de passe requis' });
        }

        db.get(
            'SELECT * FROM users WHERE email = ?', 
            [email], 
            async (err, user) => {
                if (err) {
                    return res.status(500).json({ error: 'Erreur base de données' });
                }
                
                if (!user) {
                    return res.status(401).json({ error: 'Utilisateur non trouvé' });
                }

                const isPasswordValid = await bcrypt.compare(password, user.password);
                if (!isPasswordValid) {
                    return res.status(401).json({ error: 'Mot de passe incorrect' });
                }

                res.json({ 
                    message: 'Connexion réussie', 
                    user: { 
                        id: user.id, 
                        email: user.email, 
                        name: user.name 
                    } 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur interne' });
    }
});

app.get('/api/admin/stats', (req, res) => {
    db.get('SELECT COUNT(*) as userCount FROM users', (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur base de données' });
        }
        
        res.json({
            userCount: row.userCount,
            serverStatus: 'online',
            timestamp: new Date()
        });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
