const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const PORT = 5000;

app.use(cors({
    origin: ['https://builder.io', 'http://localhost:8080', 'http://localhost:8729'], 
    credentials: true
}));

app.use(express.json());

const dbPath = path.join(__dirname, 'ma-boutique.db');
const db = new sqlite3.Database(dbPath);

// Initialisation des tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        email TEXT UNIQUE, 
        password TEXT, 
        nom TEXT, 
        boutique TEXT, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
});

app.get('/api/test', (req, res) => {
    res.json({ message: 'Api working!', timestamp: new Date() });
});

app.post('/api/register', async (req, res) => {
    const { email, password, nom, boutique } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(
            "INSERT INTO users (email, password, nom, boutique) VALUES (?, ?, ?, ?)", 
            [email, hashedPassword, nom, boutique], 
            function(err) {
                if (err) return res.status(400).json({ error: 'Email déjà utilisé' });
                res.json({ message: 'Compte créé!', user: { id: this.lastID, email, nom, boutique } });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur!' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Erreur serveur!' });
        if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

        res.json({ 
            message: 'Connexion réussie!', 
            user: { 
                id: user.id, 
                email: user.email, 
                nom: user.nom, 
                boutique: user.boutique 
            } 
        });
    });
});

// Ajouter un produit
app.post('/api/products', async (req, res) => {
    const { name, price, quantity, user_id } = req.body;
    
    try {
        db.run(
            "INSERT INTO products (user_id, name, price, quantity) VALUES (?, ?, ?, ?)",
            [user_id, name, price, quantity],
            function(err) {
                if (err) {
                    console.error('Erreur ajout produit:', err);
                    return res.status(500).json({ error: 'Erreur serveur' });
                }
                res.json({ 
                    success: true, 
                    message: 'Produit ajouté avec succès',
                    productId: this.lastID 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Récupérer les produits d'un utilisateur
app.get('/api/products/:user_id', (req, res) => {
    const user_id = req.params.user_id;
    
    db.all(
        "SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC",
        [user_id],
        (err, rows) => {
            if (err) {
                console.error('Erreur récupération produits:', err);
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            res.json(rows);
        }
    );
});

app.post('/api/webhook', (req, res) => {
    console.log('Webhook reçu de builder.io:', req.body);
    res.json({ status: 'success', message: 'Webhook reçu', data: req.body });
});

app.listen(PORT, () => {
    console.log('Serveur démarré sur http://localhost:' + PORT);
    console.log('Test: http://localhost:' + PORT + '/api/test');
});

