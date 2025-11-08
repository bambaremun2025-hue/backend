const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: ['https://4a5f0464c8f24a09bd2bc580e8c9401a-9ae7243f6c3f4aa0bdc46c3f9.fly.dev', 'http://localhost:3000'],
    credentials: true
}));

app.use(express.json());

const dbPath = path.join(__dirname, 'ma-boutique.db');
const db = new sqlite3.Database(dbPath);

db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, password TEXT, name TEXT)");

app.get('/api/test', (req, res) => {
    res.json({ message: "L'API fonctionne !", timestamp: new Date() });
});

app.post('/api/register', async (req, res) => {
    const { email, password, name } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (email, password, name) VALUES (?, ?, ?)', [email, hashedPassword, name], function(err) {
            if (err) return res.status(400).json({ error: 'Email déjà utilisé' });
            res.json({ message: 'Compte créé', user: { id: this.lastID, email, name } });
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
