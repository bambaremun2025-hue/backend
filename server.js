const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

console.log('🚨 DEBUG - Server starting...');
console.log('📁 Current directory:', __dirname);
console.log('📄 Loading server.js from:', __filename);

const supabaseUrl = 'https://meaczpmwhfponrjdxmmi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lYWN6cG13aGZwb25yamR4bW1pIiwicm9sZSI6ImFub24iIiwiaWF0IjoxNzYyNTc5MzI2LCJleHAiOjIwNzgxNTUzMjZ9.Gp25mFEAm5L4cKBm5BXsIqmEik81oxkqgc8nqfh9s1s';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const app = express();
const PORT = process.env.PORT || 10000;

console.log('✅ Express loaded:', typeof express);
console.log('✅ CORS loaded:', typeof cors);
console.log('✅ JWT loaded:', typeof jwt);
console.log('✅ Supabase client created');

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(cors({
    origin: [
        'https://samaboutiksn.netlify.app',
        'https://builder.io',
        'http://localhost:3000',
        'https://4a5f0464c8f24a09bd2bc580e8c9401a-main.projects.builder.my',
        'https://4a5f0464c8f24a09bd2bc580e8c9401a-9ae7243f6c3f4aa0bdc46c3f9.fly.dev'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With']
}));

const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ error: 'Token manquant' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');

        const { data: user, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', decoded.userId)
            .single();

        if (error || !user) {
            return res.status(403).json({ error: 'Utilisateur non trouvé' });
        }

        if (user.role !== 'admin' && user.role !== 'user') {
            return res.status(403).json({ error: 'Rôle non autorisé' });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token invalide' });
    }
};

const requireAdmin = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ error: 'Token manquant' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');

        const { data: user, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', decoded.userId)
            .single();

        if (error) {
            return res.status(403).json({ error: 'Erreur de vérification admin' });
        }

        if (!user) {
            return res.status(403).json({ error: 'Utilisateur non trouvé' });
        }

        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token invalide' });
    }
};

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, username, business, type, name } = req.body;
   
        const userName = name || username || business || email;
        
        if (!email || !password || !userName) {
            return res.status(400).json({ error: 'Email, mot de passe et nom sont requis' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Format email invalide' });
        }

        const { data: existingUser } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'Cet email est déjà utilisé' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);

        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert([
                {
                    email: email,
                    full_name: userName,  
                    subscription_type: 'trial',
                    trial_ends_at: trialEnd.toISOString(),
                    role: 'user',
                    email_verified: true,
                    user_password: hashedPassword
                }
            ])
            .select();

        if (userError) {
            return res.status(400).json({ error: 'Erreur base de données: ' + userError.message });
        }

        const token = jwt.sign(
            { 
                userId: userData[0].id,
                email: email,
                name: userName,
                role: 'user'
            },
            process.env.JWT_SECRET || 'default-secret',
            { expiresIn: '24h' }
        );

        res.json({ 
            success: true,
            message: 'Utilisateur créé avec essai gratuit de 14 jours',
            token: token,
            user: {
                id: userData[0].id,
                email: email,
                name: userName,
                role: 'user',
                subscription_type: 'trial',
                trial_ends_at: trialEnd.toISOString()
            }
        });

    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (userError || !user) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        const validPassword = await bcrypt.compare(password, user.user_password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        const token = jwt.sign(
            { 
                userId: user.id,
                email: user.email,
                name: user.full_name,
                role: user.role  
            },
            process.env.JWT_SECRET || 'default-secret',
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Connexion réussie',
            token: token,
            user: {
                id: user.id,
                email: user.email,
                name: user.full_name,
                role: user.role,
                subscription_type: user.subscription_type,
                trial_ends_at: user.trial_ends_at,
                subscription_end_date: user.subscription_end_date
            }
        });

    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/user/subscription-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        const now = new Date();
        const endDate = new Date(user.subscription_type === 'premium' ? user.subscription_end_date : user.trial_ends_at);
        const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

        let notifications = [];

        if (user.subscription_type === 'trial') {
            if (daysLeft === 7) {
                notifications.push({
                    type: 'warning',
                    message: 'Votre essai gratuit expire dans 7 jours',
                    days_left: 7,
                    action_required: true,
                    action_text: 'S\'abonner maintenant',
                    action_url: '/pricing'
                });
            } else if (daysLeft === 3) {
                notifications.push({
                    type: 'warning',
                    message: 'Votre essai gratuit expire dans 3 jours !',
                    days_left: 3,
                    action_required: true,
                    action_text: 'S\'abonner maintenant',
                    action_url: '/pricing'
                });
            } else if (daysLeft === 1) {
                notifications.push({
                    type: 'error',
                    message: 'DERNIER JOUR ! Votre essai gratuit expire demain',
                    days_left: 1,
                    action_required: true,
                    action_text: 'S\'abonner maintenant',
                    action_url: '/pricing'
                });
            } else if (daysLeft <= 0) {
                notifications.push({
                    type: 'error',
                    message: 'Votre essai gratuit a expiré',
                    days_left: 0,
                    action_required: true,
                    action_text: 'S\'abonner maintenant',
                    action_url: '/pricing'
                });
            }
        }

        if (user.subscription_type === 'premium' && daysLeft <= 7) {
            notifications.push({
                type: 'warning',
                message: `Votre abonnement premium expire dans ${daysLeft} jours`,
                days_left: daysLeft,
                action_required: true,
                action_text: 'Renouveler',
                action_url: '/pricing'
            });
        }

        res.json({
            subscription_type: user.subscription_type,
            subscription_end: user.subscription_type === 'premium' ? user.subscription_end_date : user.trial_ends_at,
            days_left: daysLeft,
            notifications: notifications
        });

    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/user/my-subscription', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(200).json({
        success: false,
        is_active: false,
        status: 'not_found'
      });
    }

    const now = new Date();
    const endDate = new Date(user.subscription_type === 'premium' ? user.subscription_end_date : user.trial_ends_at);
    const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

    res.json({
      success: true,
      subscription_type: user.subscription_type,
      subscription_end: user.subscription_type === 'premium' ? user.subscription_end_date : user.trial_ends_at,
      days_left: daysLeft,
      is_active: daysLeft > 0,
      status: daysLeft > 0 ? 'active' : 'expired'
    });

  } catch (error) {
    res.status(200).json({
      success: false,
      is_active: false,
      status: 'error'
    });
  }
});

app.post('/api/invoices/generate', async (req, res) => {
    try {
        const { user_id, amount, description, payment_method } = req.body;
        
        const { data: lastInvoice } = await supabase
            .from('invoices')
            .select('invoice_number')
            .order('created_at', { ascending: false })
            .limit(1);
        
        let invoiceNumber = 'FACT-2024-001';
        if (lastInvoice && lastInvoice.length > 0) {
            const lastNumber = parseInt(lastInvoice[0].invoice_number.split('-')[2]);
            invoiceNumber = `FACT-2024-${String(lastNumber + 1).padStart(3, '0')}`;
        }

        const { data: invoice, error } = await supabase
            .from('invoices')
            .insert([
                {
                    user_id: user_id,
                    invoice_number: invoiceNumber,
                    amount: amount,
                    description: description,
                    payment_method: payment_method,
                    status: 'paid'
                }
            ])
            .select();

        if (error) {
            return res.status(500).json({ error: 'Erreur création facture: ' + error.message });
        }

        res.json({ 
            success: true,
            message: 'Facture générée avec succès',
            invoice: invoice[0]
        });

    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/invoices/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const { data: invoices, error } = await supabase
            .from('invoices')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            return res.status(500).json({ error: 'Erreur récupération factures' });
        }

        res.json({ invoices: invoices || [] });

    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/invoices/generate-pdf', async (req, res) => {
    try {
        const { invoice_data } = req.body;
        
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: 'Inter', sans-serif; 
                    margin: 0; 
                    padding: 40px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .invoice-container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.1);
                    overflow: hidden;
                }
                .invoice-header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 40px;
                    text-align: center;
                }
                .invoice-body {
                    padding: 40px;
                }
                .company-info, .client-info {
                    margin-bottom: 30px;
                }
                .items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 30px 0;
                }
                .items-table th {
                    background: #f8fafc;
                    padding: 15px;
                    text-align: left;
                    border-bottom: 2px solid #e2e8f0;
                }
                .items-table td {
                    padding: 15px;
                    border-bottom: 1px solid #e2e8f0;
                }
                .total-section {
                    background: #f8fafc;
                    padding: 20px;
                    border-radius: 8px;
                    margin-top: 30px;
                }
                .status-badge {
                    background: #48bb78;
                    color: white;
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-size: 14px;
                    font-weight: 600;
                }
            </style>
        </head>
        <body>
            <div class="invoice-container">
                <div class="invoice-header">
                    <h1>🚀 VOTRE ENTREPRISE</h1>
                    <h2>Facture ${invoice_data.number}</h2>
                </div>
                <div class="invoice-body">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
                        <div class="company-info">
                            <h3>Entreprise</h3>
                            <p><strong>${invoice_data.company.name}</strong></p>
                            <p>${invoice_data.company.email}</p>
                            <p>${invoice_data.company.phone}</p>
                            <p>${invoice_data.company.address}</p>
                        </div>
                        <div class="client-info">
                            <h3>Client</h3>
                            <p><strong>${invoice_data.client.name}</strong></p>
                            <p>${invoice_data.client.email}</p>
                            <p>Date: ${invoice_data.date}</p>
                            <div class="status-badge">${invoice_data.status}</div>
                        </div>
                    </div>
                    
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Quantité</th>
                                <th>Prix Unitaire</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${invoice_data.items.map(item => `
                                <tr>
                                    <td>
                                        <strong>${item.name}</strong><br>
                                        <small>${item.description}</small>
                                    </td>
                                    <td>${item.quantity}</td>
                                    <td>${item.price.toLocaleString()} FCFA</td>
                                    <td>${item.total.toLocaleString()} FCFA</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <div class="total-section">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div>
                                <p><strong>Méthode de paiement:</strong></p>
                                <p>${invoice_data.payment_method}</p>
                            </div>
                            <div>
                                <p><strong>Sous-total:</strong> ${invoice_data.subtotal.toLocaleString()} FCFA</p>
                                <p><strong>TVA (0%):</strong> ${invoice_data.tax.toLocaleString()} FCFA</p>
                                <p><strong>Total TTC:</strong> ${invoice_data.total.toLocaleString()} FCFA</p>
                            </div>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 40px; color: #718096;">
                        <p>Merci pour votre confiance ! 🎉</p>
                        <p>Facture générée automatiquement</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `;

        res.json({ 
            success: true,
            html: htmlContent,
            message: 'Facture premium générée'
        });

    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/payments/naboostart-initiate', async (req, res) => {
    try {
        res.setHeader('X-FullStory-Exclude', 'true');
        const { userId, amount, customerEmail, customerPhone, customerName } = req.body;
        
        const naboopyPayload = {
            amount: amount * 100,
            currency: "XOF",
            description: "Abonnement Premium Mensuel",
            customer_email: customerEmail,
            customer_phone_number: customerPhone,
            customer_name: customerName,
            return_url: "https://ton-site.com/payment/success",
            cancel_url: "https://ton-site.com/payment/cancel",
            metadata: {
                user_id: userId,
                product: "abonnement_premium_mensuel"
            }
        };

        const naboopyResponse = await fetch('https://api.naboostart.com/v1/payments/initiate', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer naboo-520d304a-a41f-4791-b152-d156716ca129.24ed6ed2-4904-4aea-a6de-41b1eabf135c',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(naboopyPayload)
        });
        
        const paymentData = await naboopyResponse.json();
        
        if (paymentData.success) {
            const { data: dbData, error: dbError } = await supabase
                .from('payments')
                .insert([
                    {
                        user_id: userId,
                        amount: amount,
                        status: 'pending',
                        naboostart_payment_id: paymentData.data.payment_id,
                        naboostart_payment_url: paymentData.data.payment_url,
                        customer_email: customerEmail,
                        customer_phone: customerPhone
                    }
                ])
                .select();
            
            res.json({
                success: true,
                payment_url: paymentData.data.payment_url,
                payment_id: paymentData.data.payment_id,
                message: "Paiement initié avec succès"
            });
        } else {
            res.status(400).json({ 
                success: false,
                error: paymentData.message || "Erreur lors de l'initiation du paiement"
            });
        }
        
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Erreur de connexion au service de paiement' 
        });
    }
});

app.get('/api/admin/search-users', async (req, res) => {
    try {
        const { email, name } = req.query;
        
        let query = supabase.from('users').select('*');
        
        if (email) {
            query = query.ilike('email', `%${email}%`);
        }
        if (name) {
            query = query.ilike('full_name', `%${name}%`);
        }

        const { data: users, error } = await query;

        if (error) {
            return res.status(500).json({ error: 'Erreur recherche: ' + error.message });
        }

        res.json({ users: users || [] });

    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
    try {
        const { count: totalUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        const today = new Date().toISOString().split('T')[0];
        const { count: todayUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today);

        const { count: activeTrials } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_type', 'trial')
            .gt('trial_ends_at', new Date().toISOString());

        const { count: premiumUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_type', 'premium');

        const { count: expiredTrials } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_type', 'trial')
            .lt('trial_ends_at', new Date().toISOString());

        const { data: revenueData } = await supabase
            .from('payments')
            .select('amount')
            .eq('status', 'completed');

        const totalRevenue = revenueData ? revenueData.reduce((sum, payment) => sum + payment.amount, 0) : 0;

        res.json({
            total_users: totalUsers || 0,
            today_users: todayUsers || 0,
            active_trials: activeTrials || 0,
            premium_users: premiumUsers || 0,
            expired_trials: expiredTrials || 0,
            total_revenue: totalRevenue
        });

    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/stats/public', async (req, res) => {
    try {
        const { count: totalUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        const today = new Date().toISOString().split('T')[0];
        const { count: todayUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today);

        const { count: activeTrials } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_type', 'trial')
            .gt('trial_ends_at', new Date().toISOString());

        const { count: premiumUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_type', 'premium');

        const { count: expiredTrials } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_type', 'trial')
            .lt('trial_ends_at', new Date().toISOString());

        const { data: revenueData } = await supabase
            .from('payments')
            .select('amount')
            .eq('status', 'completed');

        const totalRevenue = revenueData ? revenueData.reduce((sum, payment) => sum + payment.amount, 0) : 0;

        res.json({
            total_users: totalUsers || 0,
            today_users: todayUsers || 0,
            active_trials: activeTrials || 0,
            premium_users: premiumUsers || 0,
            expired_trials: expiredTrials || 0,
            total_revenue: totalRevenue
        });

    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(users || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/subscriptions', requireAdmin, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('subscription_type, created_at');

        if (error) throw error;
        
        const stats = {
            total: users.length,
            trial: users.filter(u => u.subscription_type === 'trial').length,
            premium: users.filter(u => u.subscription_type === 'premium').length
        };
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/products', requireAdmin, async (req, res) => {
    try {
        const { data: products, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(products || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/sales', requireAdmin, async (req, res) => {
    try {
        const { data: sales, error } = await supabase
            .from('sales')
            .select(`
                *,
                products (name),
                users (email)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(sales || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/activate-subscription', requireAdmin, async (req, res) => {
    try {
        const { userEmail, months = 1 } = req.body;
        
        const subscriptionEnd = new Date();
        subscriptionEnd.setMonth(subscriptionEnd.getMonth() + months);

        const { data: user, error } = await supabase
            .from('users')
            .update({
                subscription_type: 'premium',
                subscription_end_date: subscriptionEnd.toISOString(),
                is_premium: true,
                activated_by: 'admin',
                activated_at: new Date().toISOString()
            })
            .eq('email', userEmail)
            .select();

        if (error) throw error;
        
        if (!user || user.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        res.json({ 
            success: true,
            message: `Abonnement activé pour ${userEmail}`,
            user: user[0]
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/cancel-subscription', requireAdmin, async (req, res) => {
    try {
        const { userEmail } = req.body;
        
        const { data: user, error } = await supabase
            .from('users')
            .update({
                subscription_type: 'trial',
                subscription_end_date: null,
                is_premium: false,
                activated_by: null,
                activated_at: null
            })
            .eq('email', userEmail)
            .select();

        if (error) throw error;
        
        if (!user || user.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        res.json({ 
            success: true,
            message: `Abonnement annulé pour ${userEmail}`,
            user: user[0]
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/subscription-details', requireAdmin, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, email, full_name, subscription_type, created_at, trial_ends_at, subscription_end_date, activated_at, is_premium')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        const subscriptionDetails = users.map(user => {
            const startDate = user.activated_at || user.created_at;
            const endDate = user.subscription_type === 'premium' ? user.subscription_end_date : user.trial_ends_at;
            
            let daysRemaining = null;
            let status = 'Inactif';
            
            if (endDate) {
                const end = new Date(endDate);
                const now = new Date();
                daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
                
                if (daysRemaining > 0) {
                    status = 'Actif';
                } else {
                    status = 'Expiré';
                }
            }
            
            const formatDate = (dateString) => {
                if (!dateString) return 'N/A';
                try {
                    return new Date(dateString).toLocaleDateString('fr-FR');
                } catch {
                    return 'Date invalide';
                }
            };

            return {
                id: user.id,
                email: user.email,
                name: user.full_name,
                subscription_type: user.subscription_type,
                is_premium: user.is_premium,
                start_date: startDate,
                start_date_formatted: formatDate(startDate),
                end_date: endDate,
                end_date_formatted: formatDate(endDate),
                days_remaining: daysRemaining,
                status: status
            };
        });

        res.json(subscriptionDetails);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/public/shop/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    
    console.log('🛍️ [PUBLIC SHOP] Chargement boutique pour:', user_id);

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('shop_name')
      .eq('id', user_id)
      .single();

    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user_id)
      .gt('stock', 0)  
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erreur Supabase:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`✅ ${products?.length || 0} produits trouvés`);
    
    const transformedProducts = products?.map(product => ({
      ...product,
      selling_price: product.price,
      stock_quantity: product.stock  
    })) || [];

    res.json({
      shop_name: user?.shop_name || 'Ma Boutique',
      products: transformedProducts
    });

  } catch (error) {
    console.error('💥 Erreur serveur:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});
app.get('/api/products', requireAuth, async (req, res) => {
  const userId = req.user.userId; 
  
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', userId)  
    .order('created_at', { ascending: false });

  if (error) throw error;
  res.json(products || []);
});

app.post('/api/products', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { name, price, category, purchase_price, stock } = req.body; 
        
        const { data: product, error } = await supabase
            .from('products')
            .insert([
                {
                    user_id: userId,
                    name,
                    price,
                    category,
                    purchase_price: purchase_price || null,
                    stock: stock || 0, 
                    created_at: new Date().toISOString()
                }
            ])
            .select();

        if (error) throw error;
        res.json({ success: true, product: product[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/products/with-image', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { name, price, category, purchase_price, stock, imageBase64 } = req.body;

        const { data: product, error: productError } = await supabase
            .from('products')
            .insert([
                {
                    user_id: userId,
                    name,
                    price,
                    category,
                    purchase_price: purchase_price || null,
                    stock: stock || 0,
                    created_at: new Date().toISOString()
                }
            ])
            .select();

        if (productError) throw productError;

        const productId = product[0].id;

        if (imageBase64 && imageBase64.includes('base64,')) {
            const base64Data = imageBase64.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');

            const uniqueFileName = `${userId}/${productId}-${Date.now()}.jpg`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(uniqueFileName, buffer, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                    .from('product-images')
                    .getPublicUrl(uniqueFileName);

                const { error: updateError } = await supabase
                    .from('products')
                    .update({ image_url: publicUrl })
                    .eq('id', productId)
                    .eq('user_id', userId);

                if (!updateError) {
                    product[0].image_url = publicUrl;
                }
            }
        }

        res.json({ 
            success: true, 
            product: product[0]
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/products/upload', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { imageBase64, productId, fileName, mimeType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Données image manquantes' });
    }

    if (!productId) {
      return res.status(400).json({ error: 'ID produit manquant' });
    }

    let base64Data = imageBase64;
    
    if (imageBase64.includes('base64,')) {
      base64Data = imageBase64.split(',')[1];
    }

    if (!base64Data) {
      return res.status(400).json({ error: 'Format base64 invalide' });
    }

    let buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch (bufferError) {
      return res.status(400).json({ error: 'Données base64 corrompues' });
    }

    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Buffer image vide' });
    }

    const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
    
    const fileExtension = mimeType === 'image/png' ? 'png' : 'jpg';
    const uniqueFileName = `products/${userId}/${productId}.${fileExtension}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('product-images')
      .upload(uniqueFileName, buffer, {
        contentType: mimeType || 'image/jpeg',
        upsert: true
      });

    if (uploadError) {
      return res.status(500).json({ 
        error: 'Erreur upload storage: ' + uploadError.message 
      });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('product-images')
      .getPublicUrl(uniqueFileName);

    const { error: updateError } = await supabaseAdmin
      .from('products')
      .update({ 
        image_url: publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .eq('user_id', userId);

    if (updateError) {
      return res.status(500).json({ 
        error: 'Erreur mise à jour produit: ' + updateError.message 
      });
    }

    res.json({ 
      success: true, 
      imageUrl: publicUrl,
      message: 'Image sauvegardée avec succès'
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Erreur serveur: ' + error.message
    });
  }
});
app.put('/api/products/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const productId = req.params.id;
        const { name, price, category, purchase_price, image_url, stock } = req.body;
        
        const updateData = {
            name,
            price,
            category,
            stock: stock || 0,
            updated_at: new Date().toISOString()
        };

        if (purchase_price !== undefined) {
            updateData.purchase_price = purchase_price;
        }
        
        if (image_url !== undefined) {
            updateData.image_url = image_url;
        }

        const { data: product, error } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', productId)
            .eq('user_id', userId)
            .select();

        if (error) throw error;
        
        if (!product || product.length === 0) {
            return res.status(404).json({ error: 'Produit non trouvé' });
        }

        res.json({ success: true, product: product[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/fix-images', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .not('image_url', 'is', null);

    if (error) throw error;

    let fixedCount = 0;

    for (const product of products) {
      if (product.image_url) {
        let newImageUrl = product.image_url;
        
        if (product.image_url.startsWith('products/')) {
          newImageUrl = `https://meaczpmwhfponrjdxmmi.supabase.co/storage/v1/object/public/product-images/${product.image_url}`;
        }
        
        const { error: updateError } = await supabase
          .from('products')
          .update({ image_url: newImageUrl })
          .eq('id', product.id)
          .eq('user_id', userId);

        if (!updateError) {
          fixedCount++;
        }
      }
    }

    res.json({
      success: true,
      message: `${fixedCount} images réparées sur ${products.length} produits`
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/fix-all-images', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    let fixedCount = 0;
    const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);

    for (const product of products) {
      if (product.image_url) {
        let newImageUrl = product.image_url;
        
        if (product.image_url.startsWith('products/')) {
          newImageUrl = `https://meaczpmwhfponrjdxmmi.supabase.co/storage/v1/object/public/product-images/${product.image_url}`;
        }
        
        const { error: updateError } = await supabaseAdmin
          .from('products')
          .update({ image_url: newImageUrl })
          .eq('id', product.id)
          .eq('user_id', userId);

        if (!updateError) {
          fixedCount++;
        }
      }
    }

    res.json({
      success: true,
      message: `${fixedCount} images réparées sur ${products.length} produits`
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sales', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const { data: sales, error } = await supabase
            .from('sales')
            .select(`
                *,
                products (name, price)
            `)
            .eq('user_id', userId) 
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(sales || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sales', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { product_id, quantity, total_amount } = req.body;
        
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('stock, name')
            .eq('id', product_id)
            .eq('user_id', userId)
            .single();

        if (productError || !product) {
            return res.status(404).json({ error: 'Produit non trouvé' });
        }

        if (product.stock < quantity) {
            return res.status(400).json({ 
                error: `Stock insuffisant. Il reste ${product.stock} unités` 
            });
        }

        const { data: sale, error: saleError } = await supabase
            .from('sales')
            .insert([{
                user_id: userId,
                product_id,
                quantity,
                total_amount,
                sale_date: new Date().toISOString(),
                created_at: new Date().toISOString()
            }])
            .select();

        if (saleError) throw saleError;

        const newStock = product.stock - quantity;
        const { error: updateError } = await supabase
            .from('products')
            .update({ 
                stock: newStock,
                updated_at: new Date().toISOString()
            })
            .eq('id', product_id)
            .eq('user_id', userId);

        if (updateError) throw updateError;

        res.json({ 
            success: true, 
            sale: sale[0],
            new_stock: newStock
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/products/upload', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { imageBase64, productId } = req.body;

        console.log('📸 UPLOAD - Taille image:', imageBase64?.length);
        
        if (!imageBase64 || !imageBase64.includes('base64,')) {
            return res.status(400).json({ error: 'Format image invalide' });
        }

        const base64Data = imageBase64.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        const uniqueFileName = `${userId}/${productId}-${Date.now()}.jpg`;

        const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey);
        
        const { data, error: uploadError } = await supabaseAdmin.storage
            .from('product-images')
            .upload(uniqueFileName, buffer, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (uploadError) {
            return res.status(500).json({ error: 'Erreur upload: ' + uploadError.message });
        }

        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('product-images')
            .getPublicUrl(uniqueFileName);

        console.log('📸 UPLOAD SUCCESS - URL:', publicUrl);

        const { error: updateError } = await supabaseAdmin
            .from('products')
            .update({ image_url: publicUrl })
            .eq('id', productId)
            .eq('user_id', userId);

        if (updateError) {
            return res.status(500).json({ error: 'Erreur mise à jour produit: ' + updateError.message });
        }

        res.json({ 
            success: true, 
            imageUrl: publicUrl,
            message: 'Photo sauvegardée avec succès'
        });

    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

app.get('/api/products/images', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const { data, error } = await supabase.storage
            .from('product-images')
            .list(`${userId}/`);

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/debug/sync', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('*')
            .eq('user_id', userId);

        const { data: sales, error: salesError } = await supabase
            .from('sales')
            .select('*')
            .eq('user_id', userId);

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        res.json({
            success: true,
            debug: {
                userId: userId,
                tokenUser: req.user,
                userInDb: user,
                products: {
                    count: products?.length || 0,
                    data: products,
                    error: productsError
                },
                sales: {
                    count: sales?.length || 0,
                    data: sales,
                    error: salesError
                }
            }
        });

    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});
app.get('/api/debug/storage', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const { data: files, error } = await supabase.storage
            .from('product-images')
            .list(`${userId}/`, {
                limit: 100,
                offset: 0
            });

        if (error) {
            return res.status(500).json({ 
                error: 'Erreur bucket: ' + error.message
            });
        }

        res.json({
            bucket_status: 'OK',
            files_count: files?.length || 0,
            files: files,
            user_folder: `${userId}/`
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        server: 'active',
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.json({
        message: 'Backend is running!',
        status: 'OK'
    });
});

app.post('/api/online-orders/:orderId/confirm', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const { data: order, error: orderError } = await supabase
      .from('online_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Commande déjà traitée' });
    }

    let totalProfit = 0;

    for (const item of order.items) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('stock, purchase_price')
        .eq('id', item.product_id)
        .eq('user_id', userId)
        .single();

      if (productError) throw productError;

      const newStock = product.stock - item.quantity;
      
      const { error: updateError } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', item.product_id)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      const profit = (item.unit_price - (product.purchase_price || 0)) * item.quantity;
      totalProfit += profit;

      const { error: saleError } = await supabase
        .from('sales')
        .insert([{
          user_id: userId,
          product_id: item.product_id,
          quantity: item.quantity,
          total_amount: item.total_price,
          profit: profit,
          sale_type: 'online',
          sale_date: new Date().toISOString()
        }]);

      if (saleError) {
        console.error('Erreur insertion vente:', saleError);
      }
    }

    const { error: statusError } = await supabase
      .from('online_orders')
      .update({ 
        status: 'confirmed',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (statusError) throw statusError;

    res.json({
      success: true,
      message: 'Commande confirmée et synchronisée',
      total_profit: totalProfit,
      order_id: orderId
    });

  } catch (error) {
    console.error('Erreur confirmation:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/online-orders/:orderId/pay', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const { data: order, error } = await supabase
      .from('online_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (error || !order) return res.status(404).json({ error: 'Commande non trouvée' });
    if (order.status !== 'confirmed') return res.status(400).json({ error: 'Commande non confirmée' });

    const { error: updateError } = await supabase
      .from('online_orders')
      .update({ 
        status: 'paid',
        payment_status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Commande marquée comme payée' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/online-orders/:orderId/deliver', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const { data: order, error } = await supabase
      .from('online_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (error || !order) return res.status(404).json({ error: 'Commande non trouvée' });
    if (order.status !== 'paid') return res.status(400).json({ error: 'Commande non payée' });

    const { error: updateError } = await supabase
      .from('online_orders')
      .update({ 
        status: 'delivered',
        delivery_status: 'delivered',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Commande marquée comme livrée' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function calculateGrowth(data, metric) {
  if (!data || data.length < 2) return 0;
  
  const recent = data.slice(-30);
  const previous = data.slice(-60, -30);
  
  if (previous.length === 0) return 100;
  
  const recentTotal = recent.reduce((sum, item) => sum + parseFloat(item[metric] || 0), 0);
  const previousTotal = previous.reduce((sum, item) => sum + parseFloat(item[metric] || 0), 0);
  
  if (previousTotal === 0) return 100;
  
  return ((recentTotal - previousTotal) / previousTotal * 100).toFixed(1);
}

app.get('/api/sales/combined-stats', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Token manquant' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    const userId = decoded.userId;

    const { data: physicalSales, error: physicalError } = await supabase
      .from('sales')
      .select('total_amount, profit, sale_date')
      .eq('user_id', userId)
      .eq('sale_type', 'physical');

    const { data: onlineOrders, error: ordersError } = await supabase
      .from('online_orders')
      .select('total_amount, items, status, created_at')
      .eq('user_id', userId)
      .in('status', ['confirmed', 'paid', 'delivered']);

    if (physicalError || ordersError) {
      throw physicalError || ordersError;
    }

    const physicalRevenue = (physicalSales || []).reduce((sum, sale) => sum + parseFloat(sale.total_amount || 0), 0);
    const physicalProfit = (physicalSales || []).reduce((sum, sale) => sum + (parseFloat(sale.profit) || 0), 0);

    let onlineRevenue = 0;
    let onlineProfit = 0;
    
    (onlineOrders || []).forEach(order => {
      onlineRevenue += parseFloat(order.total_amount || 0);
      
      (order.items || []).forEach(item => {
        const profit = (item.unit_price || 0) - (item.purchase_price || 0);
        onlineProfit += profit * (item.quantity || 0);
      });
    });

    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().getMonth();

    const statsByPeriod = {
      today: {
        physical: (physicalSales || []).filter(s => s.sale_date && s.sale_date.startsWith(today)).length,
        online: (onlineOrders || []).filter(o => o.created_at && o.created_at.startsWith(today)).length
      },
      thisMonth: {
        physical: (physicalSales || []).filter(s => s.sale_date && new Date(s.sale_date).getMonth() === thisMonth).length,
        online: (onlineOrders || []).filter(o => o.created_at && new Date(o.created_at).getMonth() === thisMonth).length
      },
      allTime: {
        physical: (physicalSales || []).length,
        online: (onlineOrders || []).length
      }
    };

    res.json({
      total_revenue: physicalRevenue + onlineRevenue,
      total_profit: physicalProfit + onlineProfit,
      total_orders: (physicalSales || []).length + (onlineOrders || []).length,

      breakdown: {
        physical: {
          revenue: physicalRevenue,
          profit: physicalProfit,
          count: (physicalSales || []).length,
          avg_order_value: (physicalSales || []).length > 0 ? physicalRevenue / (physicalSales || []).length : 0
        },
        online: {
          revenue: onlineRevenue,
          profit: onlineProfit,
          count: (onlineOrders || []).length,
          avg_order_value: (onlineOrders || []).length > 0 ? onlineRevenue / (onlineOrders || []).length : 0
        }
      },

      comparison: {
        revenue_ratio: onlineRevenue > 0 ? (physicalRevenue / onlineRevenue).toFixed(2) : 'N/A',
        profit_margin_physical: physicalRevenue > 0 ? (physicalProfit / physicalRevenue * 100).toFixed(1) : 0,
        profit_margin_online: onlineRevenue > 0 ? (onlineProfit / onlineRevenue * 100).toFixed(1) : 0
      },

      period_stats: statsByPeriod,

      trend: {
        online_growth: calculateGrowth(onlineOrders || [], 'total_amount'),
        physical_growth: calculateGrowth(physicalSales || [], 'total_amount')
      }
    });

  } catch (error) {
    console.error('Erreur analytics:', error);
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/online-orders', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const { data: orders, error } = await supabase
      .from('online_orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(orders || []);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/init-payment-settings', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const { data: settings, error } = await supabase
      .from('user_payment_settings')
      .insert([
        {
          user_id: userId,
          has_naboopay: false,
          orange_money_available: false,
          wave_available: false
        }
      ])
      .select();

    if (error && !error.message.includes('duplicate key')) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Paramètres de paiement initialisés'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/payment-settings', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const { data: settings, error } = await supabase
      .from('user_payment_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    res.json(settings || {
      has_naboopay: false,
      orange_money_available: false,
      wave_available: false
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/user/shop-settings', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { shop_name } = req.body;

    const { data: user, error } = await supabase
      .from('users')
      .update({
        shop_name: shop_name || 'Ma Boutique',
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      user: user[0],
      message: 'Nom de boutique mis à jour'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/public/shop-name/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const { data: user, error } = await supabase
      .from('users')
      .select('shop_name, full_name')
      .eq('id', user_id)
      .single();

    if (error) throw error;

    res.json({
      shop_name: user?.shop_name || 'Ma Boutique',
      user_name: user?.full_name
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/online-orders', async (req, res) => {
  try {
    const { 
      user_id, 
      customer_first_name, 
      customer_last_name, 
      customer_phone, 
      customer_whatsapp,
      delivery_address,
      delivery_city, 
      delivery_zipcode,
      delivery_country,
      payment_method,
      notes,
      items 
    } = req.body;

    console.log('📦 DONNÉES REÇUES:', {
      customer_first_name,
      customer_last_name, 
      delivery_address,
      delivery_city
    });

    if (!customer_first_name || !customer_last_name || !customer_phone || !delivery_address || !delivery_city) {
      return res.status(400).json({ 
        error: 'Champs manquants'
      });
    }

    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', item.product_id)
        .eq('user_id', user_id)
        .single();

      if (productError || !product) {
        return res.status(404).json({ error: `Produit non trouvé: ${item.product_id}` });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({ 
          error: `Stock insuffisant pour ${product.name}`
        });
      }

      const itemTotal = product.price * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        product_id: item.product_id,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: product.price,
        total_price: itemTotal,
        purchase_price: product.purchase_price || 0
      });
    }

    const { data: order, error: orderError } = await supabase
      .from('online_orders')
      .insert([{
        user_id,
        customer_first_name,
        customer_last_name,
        customer_phone,
        customer_whatsapp: customer_whatsapp || customer_phone,
        delivery_address,
        delivery_city,
        delivery_zipcode: delivery_zipcode || '',
        delivery_country: delivery_country || 'Sénégal',
        payment_method: payment_method || 'whatsapp',
        payment_status: 'pending',
        total_amount: totalAmount,
        items: orderItems,
        notes: notes || '',
        status: 'pending'
      }])
      .select();

    if (orderError) throw orderError;

    console.log('✅ COMMANDE CRÉÉE:', {
      id: order[0].id,
      prenom: order[0].customer_first_name,
      nom: order[0].customer_last_name,
      adresse: order[0].delivery_address,
      ville: order[0].delivery_city
    });

    res.json({
      success: true,
      order: order[0],
      message: 'Commande créée avec succès'
    });

  } catch (error) {
    console.error('❌ ERREUR:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/online-orders/detailed', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const { data: orders, error } = await supabase
      .from('online_orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(orders || []);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/user/payment-settings', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { has_naboopay, orange_money_available, wave_available, naboopay_merchant_id } = req.body;

    const { data: settings, error } = await supabase
      .from('user_payment_settings')
      .upsert([
        {
          user_id: userId,
          has_naboopay: has_naboopay || false,
          orange_money_available: orange_money_available || false,
          wave_available: wave_available || false,
          naboopay_merchant_id: naboopay_merchant_id || null,
          updated_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) throw error;

    res.json({
      success: true,
      settings: settings[0],
      message: 'Paramètres de paiement mis à jour'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/user/shop-settings', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { shop_name } = req.body;

    const { data: user, error } = await supabase
      .from('users')
      .update({
        shop_name: shop_name || 'Ma Boutique',
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      user: user[0],
      message: 'Nom de boutique mis à jour'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/public/shop-name/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const { data: user, error } = await supabase
      .from('users')
      .select('shop_name, full_name')
      .eq('id', user_id)
      .single();

    if (error) throw error;

    res.json({
      shop_name: user?.shop_name || 'Ma Boutique',
      user_name: user?.full_name
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/online-orders/:orderId/whatsapp', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { user_id } = req.body;

    const { data: order, error } = await supabase
      .from('online_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', user_id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    const itemsText = order.items.map(item => 
      `• ${item.product_name} - ${item.quantity}x ${item.unit_price}FCFA = ${item.total_price}FCFA`
    ).join('\n');

    const message = `NOUVELLE COMMANDE #${orderId}\n\n👤 Client: ${order.customer_first_name} ${order.customer_last_name}\n📞 Téléphone: ${order.customer_phone}\n📍 Adresse: ${order.delivery_address}, ${order.delivery_city} ${order.delivery_zipcode || ''}\n💳 Paiement: ${order.payment_method}\n\n🛒 PRODUITS:\n${itemsText}\n\n💰 TOTAL: ${order.total_amount}FCFA\n\n📝 Notes: ${order.notes || 'Aucune'}`;

    const whatsappUrl = `https://wa.me/${order.customer_whatsapp || order.customer_phone}?text=${encodeURIComponent(message)}`;

    res.json({
      success: true,
      whatsapp_url: whatsappUrl,
      message: 'Lien WhatsApp généré'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur demarre sur le port ${PORT}`);
});
