const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const PORT = 5000;

app.use(cors({
    origin: ['https://builder.io', 'http://localhost:3000', 'http://localhost:8272'], 
    credentials: true
}));
app.use(express.json());

const dbPath = path.join(__dirname, 'ma-boutique.db');
const db = new sqlite3.Database(dbPath);

db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, password TEXT, nom TEXT, boutique TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, date_fin_essai DATETIME, statut_abonnement TEXT DEFAULT 'essai', paydunya_invoice_token TEXT)");

app.get('/api/test', (req, res) => {
    res.json({ message: 'API working!', timestamp: new Date() });
});

app.post('/api/register', async (req, res) => {
    const { email, password, nom, boutique } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const dateFinEssai = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        
        db.run("INSERT INTO users (email, password, nom, boutique, date_fin_essai) VALUES (?, ?, ?, ?, ?)", 
               [email, hashedPassword, nom, boutique, dateFinEssai], function(err) {
            if (err) return res.status(400).json({ error: 'Email deja utilise' });
            res.json({ message: 'Compte cree!', user: { id: this.lastID, email, nom, boutique, date_fin_essai: dateFinEssai, statut_abonnement: 'essai' } });
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Erreur serveur' });
        if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        res.json({ message: 'Connexion reussie!', user: { id: user.id, email: user.email, nom: user.nom, boutique: user.boutique, date_fin_essai: user.date_fin_essai, statut_abonnement: user.statut_abonnement } });
    });
});

app.get('/abonnement', (req, res) => {
    res.send(`
    <html>
    <body style="padding: 40px; text-align: center; font-family: Arial;">
        <h1>🔔 Passer à la Version Pro</h1>
        <p>Votre essai gratuit de 7 jours est terminé</p>
        <form method="POST" action="https://app.paydunya.com/api/v1/checkout-invoice/create">
            <input type="hidden" name="total_amount" value="15000">
            <input type="hidden" name="currency" value="XOF">
            <input type="hidden" name="invoice[items][abonnement][name]" value="Abonnement SamaBoutik">
            <input type="hidden" name="invoice[items][abonnement][quantity]" value="1">
            <input type="hidden" name="invoice[items][abonnement][unit_price]" value="15000">
            <input type="hidden" name="public_key" value="public_live_votreCle">
            <input type="hidden" name="private_key" value="private_live_votreCle">
            <input type="hidden" name="token" value="token_live_votreCle">
            <input type="hidden" name="return_url" value="http://localhost:5000/api/paiement-reussi">
            <input type="hidden" name="cancel_url" value="http://localhost:5000/paiement-annule">
            <button type="submit" style="padding: 15px 30px; background: #4CAF50; color: white; border: none; border-radius: 8px; font-size: 18px; cursor: pointer;">
                💳 Payer 15,000 FCFA
            </button>
        </form>
    </body>
    </html>
    `);
});

app.listen(PORT, () => {
    console.log("Server demarre sur http://localhost:" + PORT);
    console.log("Test: http://localhost:" + PORT + "/api/test");
});
