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

const initDatabase = () => {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            subscription_type TEXT DEFAULT 'trial',
            trial_start DATE DEFAULT CURRENT_DATE,
            trial_end DATE,
            is_premium BOOLEAN DEFAULT FALSE,
            subscription_end_date DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER,
            quantity INTEGER,
            total_amount REAL,
            sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products (id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            paydunya_invoice_id TEXT,
            paydunya_payment_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        const adminEmail = 'samaboutiksen@gmail.com';
        const adminPassword = 'Egghead1!';
        const adminName = 'Admin';
        
        db.get('SELECT * FROM users WHERE email = ?', [adminEmail], async (err, row) => {
            if (err) return;
            
            if (!row) {
                const hashedPassword = await bcrypt.hash(adminPassword, 10);
                const trialEnd = new Date();
                trialEnd.setDate(trialEnd.getDate() + 14);
                
                db.run(
                    `INSERT INTO users (email, password, name, role, trial_end) VALUES (?, ?, ?, ?, ?)`,
                    [adminEmail, hashedPassword, adminName, 'admin', trialEnd.toISOString()],
                    function(err) {
                        if (!err) {
                            console.log('Compte admin créé avec succès');
                        }
                    }
                );
            } else if (row.role !== 'admin') {
                db.run('UPDATE users SET role = ? WHERE email = ?', ['admin', adminEmail]);
                console.log('Compte existant promu admin');
            }
        });
    });
};

db.serialize(() => {
    initDatabase();
    
    const requireAdmin = (req, res, next) => {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ error: 'Token manquant' });
        }
        
        const token = authHeader.split(' ')[1];
        db.get('SELECT * FROM users WHERE email = ? AND role = ?', [token, 'admin'], (err, user) => {
            if (err || !user) {
                return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
            }
            next();
        });
    };

    app.post('/api/auth/register', async (req, res) => {
        const { email, password, name } = req.body;
        
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);

        db.run(
            `INSERT INTO users (email, password, name, trial_end) VALUES (?, ?, ?, ?)`,
            [email, hashedPassword, name, trialEnd.toISOString()],
            function(err) {
                if (err) {
                    return res.status(400).json({ error: 'Email déjà utilisé' });
                }
                res.json({ 
                    message: 'Utilisateur créé avec essai gratuit de 14 jours',
                    userId: this.lastID
                });
            }
        );
    });

    app.post('/api/auth/login', (req, res) => {
        const { email, password } = req.body;
        
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
            }

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
            }

            res.json({
                message: 'Connexion réussie',
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    subscription_type: user.subscription_type,
                    is_premium: user.is_premium,
                    trial_end: user.trial_end,
                    subscription_end_date: user.subscription_end_date
                }
            });
        });
    });

    app.post('/api/payments/create-monthly', (req, res) => {
        const { userId, customerEmail, customerName } = req.body;
        
        if (!userId || !customerEmail) {
            return res.status(400).json({ error: 'Données manquantes' });
        }

        const amount = 15000;
        
        const paydunyaData = {
            amount: amount,
            description: "Abonnement Premium Mensuel - 15,000 FCFA",
            customer_name: customerName || "Client",
            customer_email: customerEmail,
            return_url: "https://ton-site.com/payment-success",
            cancel_url: "https://ton-site.com/payment-cancel"
        };

        const invoiceId = 'INV_' + Date.now();
        const paymentUrl = 'https://paydunya.com/sandbox/checkout/' + invoiceId;
        
        db.run(
            `INSERT INTO payments (user_id, amount, status, paydunya_invoice_id, paydunya_payment_url) VALUES (?, ?, ?, ?, ?)`,
            [userId, amount, 'pending', invoiceId, paymentUrl],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Erreur base de données' });
                }
                
                res.json({
                    success: true,
                    message: 'Paiement créé avec succès',
                    payment_url: paymentUrl,
                    invoice_id: invoiceId,
                    amount: amount
                });
            }
        );
    });

    app.post('/api/payments/confirm', (req, res) => {
        const { invoice_id, user_id } = req.body;
        
        db.get('SELECT * FROM payments WHERE paydunya_invoice_id = ? AND user_id = ?', [invoice_id, user_id], (err, payment) => {
            if (err || !payment) {
                return res.status(404).json({ error: 'Paiement non trouvé' });
            }

            db.run('UPDATE payments SET status = ? WHERE paydunya_invoice_id = ?', ['completed', invoice_id]);

            const subscriptionEnd = new Date();
            subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);

            db.run(
                `UPDATE users SET is_premium = 1, subscription_type = 'premium', subscription_end_date = ? WHERE id = ?`,
                [subscriptionEnd.toISOString(), user_id],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Erreur activation abonnement' });
                    }
                    res.json({ 
                        success: true,
                        message: 'Abonnement premium mensuel activé avec succès',
                        subscription_end: subscriptionEnd.toISOString()
                    });
                }
            );
        });
    });

    app.post('/api/admin/promote', (req, res) => {
        const { email } = req.body;
        
        db.run(
            `UPDATE users SET role = 'admin' WHERE email = ?`,
            [email],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Erreur base de données' });
                }
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Utilisateur non trouvé' });
                }
                res.json({ message: 'Utilisateur promu admin' });
            }
        );
    });

    app.post('/api/admin/manage-subscription', (req, res) => {
        const { email, action } = req.body;
        
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'Utilisateur non trouvé' });
            }

            let updateQuery = '';
            let updateParams = [];

            if (action === 'activate') {
                const subscriptionEnd = new Date();
                subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);
                updateQuery = `UPDATE users SET is_premium = 1, subscription_type = 'premium', subscription_end_date = ? WHERE email = ?`;
                updateParams = [subscriptionEnd.toISOString(), email];
            } else if (action === 'cancel') {
                updateQuery = `UPDATE users SET is_premium = 0, subscription_type = 'trial' WHERE email = ?`;
                updateParams = [email];
            } else if (action === 'gift') {
                const subscriptionEnd = new Date();
                subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);
                updateQuery = `UPDATE users SET is_premium = 1, subscription_type = 'gifted', subscription_end_date = ? WHERE email = ?`;
                updateParams = [subscriptionEnd.toISOString(), email];
            } else {
                return res.status(400).json({ error: 'Action non valide' });
            }

            db.run(updateQuery, updateParams, function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Erreur lors de la mise à jour' });
                }
                res.json({ message: `Abonnement ${action} avec succès` });
            });
        });
    });

    app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
        const queries = [
            "SELECT COUNT(*) as total_users FROM users",
            "SELECT COUNT(*) as today_users FROM users WHERE DATE(created_at) = DATE('now')",
            "SELECT COUNT(*) as active_trials FROM users WHERE subscription_type = 'trial' AND trial_end > DATE('now')",
            "SELECT COUNT(*) as premium_users FROM users WHERE is_premium = 1",
            "SELECT COUNT(*) as expired_trials FROM users WHERE subscription_type = 'trial' AND trial_end <= DATE('now')",
            "SELECT COALESCE(SUM(total_amount), 0) as total_revenue FROM sales",
            "SELECT COALESCE(SUM(amount), 0) as total_payments FROM payments WHERE status = 'completed'"
        ];

        const results = {};
        let completed = 0;

        queries.forEach((query, index) => {
            db.get(query, [], (err, row) => {
                if (err) {
                    console.error('Erreur query:', err);
                } else {
                    const key = Object.keys(row)[0];
                    results[key] = row[key];
                }
                
                completed++;
                if (completed === queries.length) {
                    res.json(results);
                }
            });
        });
    });

    app.get('/api/products', (req, res) => {
        db.all('SELECT * FROM products', [], (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur base de données' });
            }
            res.json(rows);
        });
    });

    app.post('/api/sales', (req, res) => {
        const { product_id, quantity, total_amount } = req.body;
        
        db.run(
            `INSERT INTO sales (product_id, quantity, total_amount) VALUES (?, ?, ?)`,
            [product_id, quantity, total_amount],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement' });
                }
                res.json({ message: 'Vente enregistrée', saleId: this.lastID });
            }
        );
    });

    app.listen(PORT, () => {
        console.log(`Serveur démarré sur le port ${PORT}`);
    });
});
