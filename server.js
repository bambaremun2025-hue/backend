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
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        description TEXT,
        stock INTEGER DEFAULT 0,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        user_id INTEGER,
        quantity INTEGER NOT NULL,
        total_price REAL NOT NULL,
        sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    const adminPassword = bcrypt.hashSync('Egghead1!', 10);
    db.run(`INSERT OR IGNORE INTO users (email, password, name, role) 
            VALUES (?, ?, ?, ?)`, 
        ['samaboutiksen@gmail.com', adminPassword, 'Administrator', 'admin']);
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token requis' });
    }

    db.get('SELECT * FROM users WHERE id = ?', [token], (err, user) => {
        if (err || !user) {
            return res.status(403).json({ error: 'Token invalide' });
        }
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Accès administrateur requis' });
    }
};

initDatabase();

app.get('/api/test', (req, res) => {
    res.json({ 
        message: "L'API fonctionne !", 
        timestamp: new Date(),
        status: "success"
    });
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
                        name: name,
                        role: 'user'
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
                    token: user.id.toString(),
                    user: { 
                        id: user.id, 
                        email: user.email, 
                        name: user.name,
                        role: user.role
                    } 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur interne' });
    }
});

app.get('/api/products', (req, res) => {
    db.all('SELECT * FROM products ORDER BY created_at DESC', (err, products) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur base de données' });
        }
        res.json(products);
    });
});

app.post('/api/sales', authenticateToken, (req, res) => {
    const { product_id, quantity } = req.body;
    const user_id = req.user.id;

    if (!product_id || !quantity || quantity <= 0) {
        return res.status(400).json({ error: 'Données de vente invalides' });
    }

    db.get('SELECT * FROM products WHERE id = ?', [product_id], (err, product) => {
        if (err || !product) {
            return res.status(404).json({ error: 'Produit non trouvé' });
        }

        if (product.stock < quantity) {
            return res.status(400).json({ error: 'Stock insuffisant' });
        }

        const total_price = product.price * quantity;

        db.run(
            'INSERT INTO sales (product_id, user_id, quantity, total_price) VALUES (?, ?, ?, ?)',
            [product_id, user_id, quantity, total_price],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Erreur lors de la vente' });
                }

                db.run(
                    'UPDATE products SET stock = stock - ? WHERE id = ?',
                    [quantity, product_id]
                );

                res.json({
                    message: 'Vente effectuée avec succès',
                    sale: {
                        id: this.lastID,
                        product_id,
                        user_id,
                        quantity,
                        total_price,
                        product_name: product.name
                    }
                });
            }
        );
    });
});

app.get('/api/my-sales', authenticateToken, (req, res) => {
    const user_id = req.user.id;

    db.all(
        `SELECT s.*, p.name as product_name 
         FROM sales s 
         JOIN products p ON s.product_id = p.id 
         WHERE s.user_id = ? 
         ORDER BY s.sale_date DESC`,
        [user_id],
        (err, sales) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur base de données' });
            }
            res.json(sales);
        }
    );
});

app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
    const queries = {
        userCount: 'SELECT COUNT(*) as count FROM users',
        productCount: 'SELECT COUNT(*) as count FROM products',
        totalSales: 'SELECT COUNT(*) as count FROM sales',
        revenue: 'SELECT SUM(total_price) as total FROM sales'
    };

    db.get(queries.userCount, (err, users) => {
        db.get(queries.productCount, (err, products) => {
            db.get(queries.totalSales, (err, sales) => {
                db.get(queries.revenue, (err, revenue) => {
                    res.json({
                        userCount: users.count,
                        productCount: products.count,
                        totalSales: sales.count,
                        totalRevenue: revenue.total || 0,
                        serverStatus: 'online',
                        timestamp: new Date()
                    });
                });
            });
        });
    });
});

app.post('/api/admin/products', authenticateToken, requireAdmin, (req, res) => {
    const { name, price, description, stock, image_url } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'Nom et prix requis' });
    }

    db.run(
        'INSERT INTO products (name, price, description, stock, image_url) VALUES (?, ?, ?, ?, ?)',
        [name, parseFloat(price), description, parseInt(stock) || 0, image_url],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur création produit' });
            }
            res.json({
                message: 'Produit créé avec succès',
                product: {
                    id: this.lastID,
                    name,
                    price,
                    description,
                    stock,
                    image_url
                }
            });
        }
    );
});

app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    db.all(
        'SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC',
        (err, users) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur base de données' });
            }
            res.json(users);
        }
    );
});

app.get('/api/admin/sales', authenticateToken, requireAdmin, (req, res) => {
    db.all(
        `SELECT s.*, u.email as user_email, p.name as product_name 
         FROM sales s 
         JOIN users u ON s.user_id = u.id 
         JOIN products p ON s.product_id = p.id 
         ORDER BY s.sale_date DESC`,
        (err, sales) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur base de données' });
            }
            res.json(sales);
        }
    );
});

app.get('/api/admin/tests', authenticateToken, requireAdmin, (req, res) => {
    res.json({
        message: 'Tests admin accessibles',
        tests: [
            { name: 'Test Connexion', endpoint: '/api/auth/login', method: 'POST' },
            { name: 'Test Inscription', endpoint: '/api/auth/register', method: 'POST' },
            { name: 'Voir Stats', endpoint: '/api/admin/stats', method: 'GET' }
        ],
        accessible: true
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
