// Polyfill for fetch in Node.js < 18
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
  console.log('✅ node-fetch polyfill loaded');
}
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
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lYWN6cG13aGZwb25yamR4bW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1NzkzMjYsImV4cCI6MjA3ODE1NTMyNn0.Gp25mFEAm5L4cKBm5BXsIqmEik81oxkqgc8nqfh9s1s';
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
        const { email, password, username, business, type, name, phone, affiliate_code } = req.body;
   
        const userName = name || username || business || email;
        
        if (!email || !password || !userName) {
            return res.status(400).json({ error: 'Email, mot de passe et nom requis' });
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
            return res.status(400).json({ error: 'Email déjà utilisé' });
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
                    user_password: hashedPassword,
                    phone: phone || null
                }
            ])
            .select();

        if (userError) {
            return res.status(400).json({ error: 'Erreur base de données: ' + userError.message });
        }

        if (affiliate_code) {
            await fetch('https://backend-s05x.onrender.com/api/track-affiliate-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userData[0].id,
                    user_email: email,
                    affiliate_code: affiliate_code
                })
            });
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
            message: 'Utilisateur créé',
            token: token,
            user: {
                id: userData[0].id,
                email: email,
                name: userName,
                phone: phone || null,
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
    
    console.log('LOGIN - Email:', email);

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    console.log('SUPABASE RESULT:', {
      userFound: !!user,
      userId: user?.id,
      error: userError
    });

    if (userError || !user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    console.log('LOGIN - Hash:', user.user_password?.substring(0, 30));
    
    const testHash = await bcrypt.hash('test123', 12);
    const testCompare = await bcrypt.compare('test123', testHash);
    console.log('BCRYPT TEST:', testCompare);
    
    const realCompare = await bcrypt.compare(password, user.user_password);
    console.log('REAL COMPARE:', realCompare);
    
    let validPassword = realCompare;

    if (!validPassword) {
      if (password === user.user_password) {
        validPassword = true;
      }
    }

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
    console.error('ERROR:', error);
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
                'Authorization': 'Bearer naboo-a171fa06-f159-43c3-a915-026fa1385a63.f0340275-3841-466b-a48d-aead55ac4323',
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

app.post('/api/admin/reset-limits/:user_id', requireAdmin, async (req, res) => {
  try {
    const { user_id } = req.params;
    
    await supabase
      .from('users')
      .update({
        max_products: 5,
        max_online_sales: 5,
        features_unlocked: false
      })
      .eq('id', user_id);
    
    res.json({ success: true });
    
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
  const { showAll } = req.query;
  
  let query = supabase
    .from('products')
    .select('*')
    .eq('user_id', userId);
  
  if (showAll !== 'true') {
    query = query.eq('active', true);
  }
  
  query = query.order('created_at', { ascending: false });
  
  const { data: products, error } = await query;
  
  if (error) throw error;
  res.json(products || []);
});

app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const { count: productCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    const { data: user } = await supabase
      .from('users')
      .select('max_products, subscription_type')
      .eq('id', userId)
      .single();
    
    const maxProducts = user.subscription_type === 'premium' ? 99999 : (user.max_products || 5);
    
    if (productCount >= maxProducts) {
      return res.status(403).json({
        success: false,
        error: 'Limite produits atteinte',
        limit_reached: true,
        current_count: productCount,
        max_allowed: maxProducts
      });
    }
    
    const { name, price, category, purchase_price, stock } = req.body;
    
    const { data: product } = await supabase
      .from('products')
      .insert([{
        user_id: userId,
        name,
        price,
        category,
        purchase_price: purchase_price || null,
        stock: stock || 0,
        status: 'active',
        active: true,
        created_at: new Date().toISOString()
      }])
      .select();
    
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
    const { name, price, category, purchase_price, image_url, stock, status, active } = req.body;
    
    const updateData = {
      name,
      price,
      category,
      stock: stock || 0,
      updated_at: new Date().toISOString()
    };

    if (status !== undefined) {
      updateData.status = status;
      updateData.active = status === 'active';
    }
    
    if (active !== undefined) {
      updateData.active = active;
      updateData.status = active ? 'active' : 'disabled';
    }
    
    if (status === 'disabled' || active === false) {
      updateData.disabled_at = new Date().toISOString();
    }
    
    if (status === 'active' || active === true) {
      updateData.disabled_at = null;
    }
    
    const { data: updated } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .eq('user_id', userId)
      .select();
    
    res.json({ success: true, product: updated[0] });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products/:id/toggle', requireAuth, async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user.userId;
    
    const { data: product } = await supabase
      .from('products')
      .select('active')
      .eq('id', productId)
      .eq('user_id', userId)
      .single();
    
    if (!product) {
      return res.status(404).json({ success: false });
    }
    
    const newActive = !product.active;
    
    const { data: updated } = await supabase
      .from('products')
      .update({
        active: newActive,
        status: newActive ? 'active' : 'disabled',
        disabled_at: newActive ? null : new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .eq('user_id', userId)
      .select();
    
    res.json({
      success: true,
      product: updated[0]
    });
    
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

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user.userId;

    const { data: product, error: checkError } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('user_id', userId)
      .single();

    if (checkError || !product) {
      return res.status(404).json({ 
        success: false, 
        error: 'Produit non trouvé' 
      });
    }

    const { data: sales } = await supabase
      .from('sales')
      .select('id')
      .eq('product_id', productId)
      .limit(1);

    if (sales && sales.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Produit a des ventes associées'
      });
    }

    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('user_id', userId);

    if (deleteError) {
      throw deleteError;
    }

    res.json({
      success: true,
      deletedId: productId
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/sales', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const { data: sales, error } = await supabase
            .from('sales')
            .select(`
                *,
                products (name, price, purchase_price)
            `)
            .eq('user_id', userId) 
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        const salesWithProfit = sales.map(sale => {
            const product = sale.products;
            let profit = sale.profit;
            
            if (profit === null || profit === undefined) {
                const purchasePrice = product?.purchase_price || 0;
                profit = sale.total_amount - (purchasePrice * sale.quantity);
            }
            
            return {
                ...sale,
                profit: profit,
                product_name: product?.name,
                product_price: product?.price
            };
        });

        res.json(salesWithProfit || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sales', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { product_id, quantity, price, total_amount } = req.body;
        
        const { data: user } = await supabase
            .from('users')
            .select('subscription_type, trial_ends_at, subscription_end_date, is_premium')
            .eq('id', userId)
            .single();
        
        const now = new Date();
        let isActivePremium = false;
        let isActiveTrial = false;

        if (user.subscription_type === 'premium' && user.is_premium === true) {
            isActivePremium = new Date(user.subscription_end_date) > now;
        } else if (user.subscription_type === 'trial') {
            isActiveTrial = new Date(user.trial_ends_at) > now;
        }

        const canMakeSale = isActivePremium || isActiveTrial;
        
        if (!canMakeSale) {
            return res.status(403).json({
                success: false,
                error: 'Votre essai a expiré. Passez Premium pour continuer.',
                trial_expired: true
            });
        }

        if (!isActivePremium) {
            const { count: physicalCount } = await supabase
                .from('sales')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('sale_type', 'physical');
            
            if ((physicalCount || 0) >= 5) {
                return res.status(403).json({
                    success: false,
                    error: 'Limite de 5 ventes atteinte pour l\'essai gratuit',
                    limit_reached: true,
                    current_count: physicalCount || 0,
                    max_allowed: 5
                });
            }
        }

        const finalTotalAmount = total_amount || (price * quantity);
        
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('stock, name, purchase_price')
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

        const purchasePrice = product.purchase_price || 0;
        const profit = finalTotalAmount - (purchasePrice * quantity);

        const { data: sale, error: saleError } = await supabase
            .from('sales')
            .insert([{
                user_id: userId,
                product_id,
                quantity,
                total_amount: finalTotalAmount,
                profit: profit,
                sale_type: 'physical',
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
            new_stock: newStock,
            profit_calculated: profit
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/physical-sales', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const { data: user } = await supabase
      .from('users')
      .select('subscription_type, is_premium, subscription_end_date, trial_ends_at')
      .eq('id', userId)
      .single();
    
    const now = new Date();
    let isActivePremium = false;
    let isActiveTrial = false;

    if (user.subscription_type === 'premium' && user.is_premium === true) {
      isActivePremium = new Date(user.subscription_end_date) > now;
    } else if (user.subscription_type === 'trial') {
      isActiveTrial = new Date(user.trial_ends_at) > now;
    }

    const canMakeSale = isActivePremium || isActiveTrial;
    
    if (!canMakeSale) {
      return res.status(403).json({
        success: false,
        error: 'Votre essai a expiré. Passez Premium pour continuer.',
        trial_expired: true
      });
    }

    if (!isActivePremium) {
      const { count: physicalCount } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('sale_type', 'physical');
      
      if ((physicalCount || 0) >= 5) {
        return res.status(403).json({
          success: false,
          error: 'Limite de 5 ventes atteinte pour l\'essai gratuit',
          limit_reached: true,
          current_count: physicalCount || 0,
          max_allowed: 5
        });
      }
    }
    
    const { product_id, quantity, price } = req.body;
    
    const total_amount = price * quantity;
    
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('stock, name, purchase_price')
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

    const purchasePrice = product.purchase_price || 0;
    const profit = total_amount - (purchasePrice * quantity);

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert([{
        user_id: userId,
        product_id,
        quantity,
        total_amount,
        profit: profit,
        sale_type: 'physical',
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
      sale: {
        id: sale[0].id,
        user_id: sale[0].user_id,
        product_id: sale[0].product_id,
        quantity: sale[0].quantity,
        total_amount: sale[0].total_amount,
        profit: sale[0].profit,
        sale_type: sale[0].sale_type,
        sale_date: sale[0].sale_date,
        created_at: sale[0].created_at
      },
      new_stock: newStock
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});
app.get('/api/physical-sales', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const { data: sales, error } = await supabase
      .from('sales')
      .select(`
        *,
        products (name, price, purchase_price)
      `)
      .eq('user_id', userId)
      .or('sale_type.eq.physical,sale_type.is.null')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    const salesWithProfit = sales.map(sale => {
      const product = sale.products;
      let profit = sale.profit;
      
      if (profit === null || profit === undefined) {
        const purchasePrice = product?.purchase_price || 0;
        profit = sale.total_amount - (purchasePrice * sale.quantity);
      }
      
      return {
        ...sale,
        profit: profit,
        product_name: product?.name,
        product_price: product?.price,
        sale_type: 'physical'
      };
    });

    res.json(salesWithProfit || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fix-profits', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const { data: sales, error } = await supabase
            .from('sales')
            .select(`
                *,
                products (purchase_price)
            `)
            .eq('user_id', userId);

        if (error) throw error;

        let fixed = 0;

        for (const sale of sales) {
            const product = sale.products;
            if (product && (sale.profit === null || sale.profit === undefined)) {
                const purchasePrice = product.purchase_price || 0;
                const profit = sale.total_amount - (purchasePrice * sale.quantity);
                
                const { error: updateError } = await supabase
                    .from('sales')
                    .update({ 
                        profit: profit,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', sale.id);

                if (!updateError) {
                    fixed++;
                }
            }
        }

        res.json({
            success: true,
            total_sales: sales.length,
            profits_fixed: fixed
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
app.get('/api/sales/combined-stats', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token manquant' });
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    const userId = decoded.userId;
    
    const { data: user } = await supabase
      .from('users')
      .select('subscription_type')
      .eq('id', userId)
      .single();
    
    if (user.subscription_type !== 'premium') {
      return res.status(403).json({
        success: false,
        error: 'Analytics premium uniquement',
        locked: true
      });
    }
    
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

app.put('/api/user/shop-settings', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token manquant' });
    
    const token = authHeader.split(' ')[1];
    let decoded;
    
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    } catch (error) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    
    const userId = decoded.userId;
    const { shop_name } = req.body;
    
    if (!shop_name) return res.status(400).json({ error: 'shop_name requis' });
    
    const { data: user, error: dbError } = await supabase
      .from('users')
      .update({ 
        shop_name: shop_name.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('id, shop_name');
    
    if (dbError) throw dbError;
    if (!user || user.length === 0) return res.status(404).json({ error: 'User non trouvé' });
    
    res.json({
      success: true,
      message: 'Nom mis à jour',
      shop_name: user[0].shop_name
    });
    
  } catch (error) {
    console.error('Error:', error);
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
    const { user_id } = req.body;
    
    const { data: user } = await supabase
      .from('users')
      .select('subscription_type, trial_ends_at, subscription_end_date, is_premium')
      .eq('id', user_id)
      .single();
    
    const now = new Date();
    let isActivePremium = false;
    let isActiveTrial = false;

    if (user.subscription_type === 'premium' && user.is_premium === true) {
      isActivePremium = new Date(user.subscription_end_date) > now;
    } else if (user.subscription_type === 'trial') {
      isActiveTrial = new Date(user.trial_ends_at) > now;
    }

    const canMakeOrder = isActivePremium || isActiveTrial;
    
    if (!canMakeOrder) {
      return res.status(403).json({
        success: false,
        error: 'Votre essai a expiré. Passez Premium pour continuer.',
        trial_expired: true
      });
    }

    if (!isActivePremium) {
      const { count: salesCount } = await supabase
        .from('online_orders')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user_id);
      
      if (salesCount >= 5) {
        return res.status(403).json({
          success: false,
          error: 'Limite de 5 commandes en ligne atteinte pour l\'essai gratuit',
          limit_reached: true,
          current_count: salesCount,
          max_allowed: 5
        });
      }
    }
    
    const { 
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

    if (!customer_first_name || !customer_last_name || !customer_phone || !delivery_address || !delivery_city) {
      return res.status(400).json({ error: 'Champs manquants' });
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
        return res.status(400).json({ error: `Stock insuffisant pour ${product.name}` });
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

    res.json({
      success: true,
      order: order[0]
    });

  } catch (error) {
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

app.post('/api/fix-passwords', async (req, res) => {
  try {
    const { admin_key } = req.body;
    
    if (admin_key !== 'SAMA2024') {
      return res.status(403).json({ error: 'Clé admin invalide' });
    }
    
    const { data: users, error } = await supabase
      .from('users')
      .select('id, user_password');
    
    if (error) throw error;
    
    let fixed = 0;
    
    for (const user of users) {
      if (user.user_password && user.user_password.startsWith('$2a$')) {
        continue;
      }
      
      if (user.user_password) {
        const hashed = await bcrypt.hash(user.user_password, 12);
        await supabase
          .from('users')
          .update({ user_password: hashed })
          .eq('id', user.id);
        fixed++;
      }
    }
    
    res.json({
      success: true,
      message: `${fixed} mots de passe réparés sur ${users.length} utilisateurs`
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, shop_name, subscription_type, trial_ends_at, subscription_end_date, role, created_at, phone') 
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    res.json({
      success: true,
      user: user
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/limits-status', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const { count: productCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    const { count: physicalSalesCount } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('sale_type', 'physical');
    
    const { count: onlineSalesCount } = await supabase
      .from('online_orders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    const { data: user } = await supabase
      .from('users')
      .select('subscription_type, trial_ends_at, subscription_end_date, is_premium')
      .eq('id', userId)
      .single();
    
    const now = new Date();
    let isActivePremium = false;
    let isActiveTrial = false;

    if (user.subscription_type === 'premium' && user.is_premium === true) {
      isActivePremium = new Date(user.subscription_end_date) > now;
    } else if (user.subscription_type === 'trial') {
      isActiveTrial = new Date(user.trial_ends_at) > now;
    }

    const isPremiumUser = isActivePremium;
    const isTrialUser = isActiveTrial && !isActivePremium;
    const trialExpired = user.subscription_type === 'trial' && !isActiveTrial;
    
    res.json({
      is_premium: isPremiumUser,
      is_trial: isTrialUser,
      trial_expired: trialExpired,
      
      products: {
        current: productCount || 0,
        max: isPremiumUser ? 99999 : (isTrialUser ? 5 : 0),
        limit_reached: !isPremiumUser && (productCount || 0) >= (isTrialUser ? 5 : 0)
      },
      
      physical_sales: {
        current: physicalSalesCount || 0,
        max: isPremiumUser ? 99999 : (isTrialUser ? 5 : 0),
        limit_reached: !isPremiumUser && (physicalSalesCount || 0) >= (isTrialUser ? 5 : 0)
      },
      
      online_sales: {
        current: onlineSalesCount || 0,
        max: isPremiumUser ? 99999 : (isTrialUser ? 5 : 0),
        limit_reached: !isPremiumUser && (onlineSalesCount || 0) >= (isTrialUser ? 5 : 0)
      },
      
      analytics: {
        allowed: isPremiumUser,
        locked: !isPremiumUser
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/user/subscription-status', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const now = new Date();
    const endDate = user.subscription_type === 'premium' 
      ? new Date(user.subscription_end_date) 
      : new Date(user.trial_ends_at);
    
    const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

    res.json({
      subscription_type: user.subscription_type,
      subscription_end: user.subscription_type === 'premium' 
        ? user.subscription_end_date 
        : user.trial_ends_at,
      days_left: daysLeft > 0 ? daysLeft : 0,
      is_active: daysLeft > 0,
      status: daysLeft > 0 ? 'active' : 'expired'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/track/malick', async (req, res) => {
  try {
    const { user_email, user_id } = req.body;
    
    const { data: existing } = await supabase
      .from('affiliate_referrals')
      .select('id')
      .eq('referred_email', user_email)
      .eq('affiliate_name', 'Malick')
      .single();
    
    if (existing) {
      return res.json({ success: true, message: 'Déjà tracké' });
    }
    
    const { data, error } = await supabase
      .from('affiliate_referrals')
      .insert([{
        affiliate_name: 'Malick',
        referred_email: user_email,
        referred_user_id: user_id,
        status: 'tracked'
      }])
      .select();
    
    if (error) throw error;
    
    res.json({ success: true, tracking_id: data[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/track/malick-payment', async (req, res) => {
  try {
    const { user_id, amount, plan } = req.body;
    
    const { data: trackings } = await supabase
      .from('affiliate_referrals')
      .select('*')
      .eq('referred_user_id', user_id)
      .eq('affiliate_name', 'Malick')
      .limit(1);
    
    if (!trackings || trackings.length === 0) {
      return res.json({ success: false });
    }
    
    const commission = 1000;
    
    const { data: updated } = await supabase
      .from('affiliate_referrals')
      .update({
        subscription_amount: amount,
        subscription_type: plan,
        commission: commission,
        status: 'completed'
      })
      .eq('id', trackings[0].id)
      .select();
    
    res.json({
      success: true,
      commission: commission,
      tracking: updated[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/affiliate-malick', requireAdmin, async (req, res) => {
  try {
    const { data: referrals, error } = await supabase
      .from('affiliate_referrals')
      .select('*')
      .eq('affiliate_name', 'Malick')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    const stats = {
      total_referrals: referrals?.length || 0,
      pending: referrals?.filter(r => r.status === 'pending').length || 0,
      tracked: referrals?.filter(r => r.status === 'tracked').length || 0,
      completed: referrals?.filter(r => r.status === 'completed').length || 0,
      paid: referrals?.filter(r => r.status === 'paid').length || 0,
      
      total_commission: referrals
        ?.filter(r => r.commission)
        .reduce((sum, r) => sum + parseFloat(r.commission || 0), 0) || 0,
      
      pending_commission: referrals
        ?.filter(r => r.status === 'completed' || r.status === 'tracked')
        .reduce((sum, r) => sum + parseFloat(r.commission || 0), 0) || 0,
      
      paid_commission: referrals
        ?.filter(r => r.status === 'paid')
        .reduce((sum, r) => sum + parseFloat(r.commission || 0), 0) || 0
    };
    
    res.json({
      success: true,
      affiliate: 'Malick',
      referrals: referrals || [],
      stats: stats,
      link_affiliation: 'https://samaboutiksn.netlify.app/signup?affiliate=MALICK2024'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/affiliate-pay', requireAdmin, async (req, res) => {
  try {
    const { referral_id } = req.body;
    
    const { data: referral, error } = await supabase
      .from('affiliate_referrals')
      .update({
        status: 'paid',
        paid_date: new Date().toISOString()
      })
      .eq('id', referral_id)
      .select();
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Commission marquée comme payée',
      referral: referral[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/test-token', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.json({ error: 'No token' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    
    res.json({ 
      success: true, 
      decoded: decoded
    });
  } catch (error) {
    res.json({ 
      error: 'Token verification failed', 
      message: error.message
    });
  }
});

app.delete('/api/admin/users/:user_id', requireAdmin, async (req, res) => {
  try {
    const { user_id } = req.params;
    
    const { data: userToDelete } = await supabase
      .from('users')
      .select('email')
      .eq('id', user_id)
      .single();
    
    if (userToDelete?.email === 'samaboutiksen@gmail.com') {
      return res.status(400).json({ error: 'Impossible de supprimer admin principal' });
    }
    
    await supabase.from('products').delete().eq('user_id', user_id);
    await supabase.from('sales').delete().eq('user_id', user_id);
    await supabase.from('online_orders').delete().eq('user_id', user_id);
    await supabase.from('custom_domains').delete().eq('user_id', user_id);
    await supabase.from('affiliate_referrals').delete().eq('referred_user_id', user_id);
    
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', user_id);
    
    if (deleteError) throw deleteError;
    
    res.json({ success: true, message: 'User supprimé' });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { user_ids } = req.body;
    
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('email', 'samaboutiksen@gmail.com');
    
    const adminIds = admins.map(a => a.id);
    const filteredIds = user_ids.filter(id => !adminIds.includes(id));
    
    if (filteredIds.length === 0) {
      return res.json({ success: true, deleted: 0 });
    }
    
    await supabase.from('products').delete().in('user_id', filteredIds);
    await supabase.from('sales').delete().in('user_id', filteredIds);
    await supabase.from('online_orders').delete().in('user_id', filteredIds);
    await supabase.from('custom_domains').delete().in('user_id', filteredIds);
    
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .in('id', filteredIds);
    
    if (deleteError) throw deleteError;
    
    res.json({ success: true, deleted: filteredIds.length });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/affiliate/register', requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, social_media, commission_first_month, commission_recurring } = req.body;
    
    const firstMonthCommission = commission_first_month || 40.00;
    const recurringCommission = commission_recurring || 20.00;
    
    const uniqueCode = `SAMA_${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    const affiliateLink = `https://samaboutiksn.netlify.app/signup?affiliate=${uniqueCode}`;
    
    const { data, error } = await supabase
      .from('affiliate_influencers')
      .insert([{
        name,
        email,
        phone,
        social_media,
        unique_code: uniqueCode,
        affiliate_link: affiliateLink,
        commission_first_month: firstMonthCommission,
        commission_recurring: recurringCommission,
        total_earnings: 0,
        status: 'active',
        user_id: req.user.userId
      }])
      .select();
    
    if (error) throw error;
    
    res.json({
      success: true,
      influencer: data[0]
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/track-affiliate-signup', async (req, res) => {
  try {
    const { user_id, user_email, affiliate_code } = req.body;
    
    if (!user_id || !user_email || !affiliate_code) {
      return res.json({ success: false });
    }
    
    const { data: influencer } = await supabase
      .from('affiliate_influencers')
      .select('id, unique_code')
      .eq('unique_code', affiliate_code)
      .single();
    
    if (!influencer) {
      return res.json({ success: false });
    }
    
    const { data: user } = await supabase
      .from('users')
      .select('created_at, subscription_type, trial_ends_at')
      .eq('id', user_id)
      .single();
    
    const { data: referral, error } = await supabase
      .from('affiliate_referrals')
      .insert([{
        affiliate_name: affiliate_code,
        influencer_id: influencer.id,
        referred_user_id: user_id,
        referred_email: user_email,
        user_created_at: user?.created_at,
        trial_started_at: user?.created_at,
        current_status: user?.subscription_type || 'registered',
        status: 'tracked'
      }])
      .select();
    
    if (error) throw error;
    
    res.json({
      success: true,
      referral_id: referral[0].id
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/track-affiliate-status-update', async (req, res) => {
  try {
    const { user_id, new_status, subscription_amount } = req.body;
    
    const { data: referral } = await supabase
      .from('affiliate_referrals')
      .select('*, affiliate_influencers(*)')
      .eq('referred_user_id', user_id)
      .single();
    
    if (!referral) return res.json({ success: false });
    
    const updates = {
      current_status: new_status,
      updated_at: new Date().toISOString()
    };
    
    if (new_status === 'premium') {
      updates.premium_converted_at = new Date().toISOString();
      updates.subscription_type = 'premium';
      updates.subscription_amount = subscription_amount;
      
      const influencer = referral.affiliate_influencers;
      const commissionAmount = subscription_amount * (influencer.commission_first_month / 100);
      
      updates.commission_amount = commissionAmount;
      updates.commission_type = 'first_month';
      updates.month_reference = new Date().toISOString().slice(0, 7);
      updates.status = 'approved';
      
      await supabase
        .from('affiliate_influencers')
        .update({
          total_earnings: (influencer.total_earnings || 0) + commissionAmount
        })
        .eq('id', influencer.id);
    }
    
    else if (new_status === 'expired') {
      updates.status = 'expired';
    }
    
    await supabase
      .from('affiliate_referrals')
      .update(updates)
      .eq('id', referral.id);
    
    res.json({ success: true });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/track-affiliate-premium', async (req, res) => {
  try {
    const { user_id, subscription_amount } = req.body;
    
    const { data: referral } = await supabase
      .from('affiliate_referrals')
      .select('*, affiliate_influencers(*)')
      .eq('referred_user_id', user_id)
      .single();
    
    if (!referral) return res.json({ success: false });
    
    const influencer = referral.affiliate_influencers;
    const commissionAmount = subscription_amount * (influencer.commission_first_month / 100);
    
    await supabase
      .from('affiliate_referrals')
      .update({
        subscription_type: 'premium',
        subscription_amount: subscription_amount,
        commission_amount: commissionAmount,
        commission_type: 'first_month',
        month_reference: new Date().toISOString().slice(0, 7),
        status: 'approved'
      })
      .eq('id', referral.id);
    
    await supabase
      .from('affiliate_influencers')
      .update({
        total_earnings: (influencer.total_earnings || 0) + commissionAmount
      })
      .eq('id', influencer.id);
    
    res.json({
      success: true,
      commission: commissionAmount
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/affiliate/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, social_media, commission_first_month, commission_recurring, status } = req.body;
    
    const { data, error } = await supabase
      .from('affiliate_influencers')
      .update({
        name,
        email,
        phone,
        social_media,
        commission_first_month,
        commission_recurring,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    
    res.json({
      success: true,
      influencer: data[0]
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/affiliate/calculate-recurring', requireAdmin, async (req, res) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const { data: activeReferrals } = await supabase
      .from('affiliate_referrals')
      .select('*, affiliate_influencers(*), users!inner(*)')
      .eq('subscription_type', 'premium')
      .eq('users.is_premium', true)
      .eq('users.subscription_type', 'premium')
      .not('influencer_id', 'is', null);
    
    let totalCommissions = 0;
    
    for (const referral of activeReferrals) {
      const { data: existing } = await supabase
        .from('affiliate_referrals')
        .select('id')
        .eq('referred_user_id', referral.referred_user_id)
        .eq('month_reference', currentMonth)
        .eq('commission_type', 'recurring')
        .single();
      
      if (!existing && referral.influencer_id) {
        const commissionAmount = referral.subscription_amount * (referral.affiliate_influencers.commission_recurring / 100);
        
        await supabase
          .from('affiliate_referrals')
          .insert([{
            influencer_id: referral.influencer_id,
            referred_user_id: referral.referred_user_id,
            subscription_type: 'premium',
            subscription_amount: referral.subscription_amount,
            commission_amount: commissionAmount,
            commission_type: 'recurring',
            month_reference: currentMonth,
            status: 'approved'
          }]);
        
        await supabase
          .from('affiliate_influencers')
          .update({
            total_earnings: (referral.affiliate_influencers.total_earnings || 0) + commissionAmount
          })
          .eq('id', referral.influencer_id);
        
        totalCommissions += commissionAmount;
      }
    }
    
    res.json({
      success: true,
      total: totalCommissions
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/affiliate/link-old-referrals', requireAdmin, async (req, res) => {
  try {
    const { data: referrals } = await supabase
      .from('affiliate_referrals')
      .select('id, affiliate_name')
      .is('influencer_id', null);
    
    let linked = 0;
    
    for (const referral of referrals) {
      if (referral.affiliate_name) {
        const { data: influencer } = await supabase
          .from('affiliate_influencers')
          .select('id')
          .eq('unique_code', referral.affiliate_name)
          .single();
        
        if (influencer) {
          await supabase
            .from('affiliate_referrals')
            .update({ influencer_id: influencer.id })
            .eq('id', referral.id);
          
          linked++;
        }
      }
    }
    
    res.json({ success: true, linked: linked });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/affiliate/test-link', async (req, res) => {
  try {
    const { data: referrals } = await supabase
      .from('affiliate_referrals')
      .select('id, affiliate_name, influencer_id')
      .limit(5);
    
    res.json({ referrals });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/affiliate/system-check', async (req, res) => {
  try {
    const { data: influencers } = await supabase
      .from('affiliate_influencers')
      .select('count');
    
    const { data: referrals } = await supabase
      .from('affiliate_referrals')
      .select('count');
    
    const { data: unlinked } = await supabase
      .from('affiliate_referrals')
      .select('count')
      .is('influencer_id', null);
    
    res.json({
      influencers: influencers?.[0]?.count || 0,
      referrals: referrals?.[0]?.count || 0,
      unlinked_referrals: unlinked?.[0]?.count || 0,
      status: 'ok'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/affiliate/dashboard/:unique_code', async (req, res) => {
  try {
    const { unique_code } = req.params;
    
    const { data, error } = await supabase
      .from('affiliate_influencers')
      .select('name, unique_code, status, total_earnings, affiliate_link')
      .eq('unique_code', unique_code)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ success: false, error: 'Affilié non trouvé' });
    }
    
    const influencerIdResult = await supabase
      .from('affiliate_influencers')
      .select('id')
      .eq('unique_code', unique_code)
      .single();
    
    const influencerId = influencerIdResult.data?.id;
    
    const { data: referrals } = await supabase
      .from('affiliate_referrals')
      .select('id, status, commission_amount, current_status, user_created_at, trial_started_at, premium_converted_at, referred_email, referred_user_id')
      .or(`influencer_id.eq.${influencerId},affiliate_name.eq.${unique_code}`)
      .order('created_at', { ascending: false });
    
    const { data: payments } = await supabase
      .from('affiliate_payments')
      .select('amount, status')
      .eq('influencer_id', influencerId);
    
    const allReferrals = referrals || [];
    const premiumReferrals = allReferrals.filter(r => r.current_status === 'premium');
    const trialReferrals = allReferrals.filter(r => r.current_status === 'trial');
    const registeredReferrals = allReferrals.filter(r => !r.current_status || r.current_status === 'registered');
    const expiredReferrals = allReferrals.filter(r => r.current_status === 'expired');
    
    const stats = {
      total_signups: allReferrals.length,
      active_trials: trialReferrals.length,
      premium_conversions: premiumReferrals.length,
      registered_users: registeredReferrals.length,
      expired_trials: expiredReferrals.length,
      conversion_rate: allReferrals.length > 0 
        ? (premiumReferrals.length / allReferrals.length * 100).toFixed(1)
        : 0,
      
      total_referrals: premiumReferrals.length,
      active_referrals: premiumReferrals.filter(r => r.status === 'approved').length,
      pending_commission: premiumReferrals
        .filter(r => r.status === 'approved')
        .reduce((sum, r) => sum + (r.commission_amount || 0), 0) || 0,
      total_paid: payments
        ?.filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + (p.amount || 0), 0) || 0,
      total_earned: data.total_earnings || 0
    };
    
    res.json({
      success: true,
      name: data.name,
      status: data.status,
      unique_code: data.unique_code,
      affiliate_link: data.affiliate_link,
      stats,
      referrals: allReferrals,
      payments: payments || []
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/affiliates', requireAdmin, async (req, res) => {
  try {
    const { data: influencers, error: infError } = await supabase
      .from('affiliate_influencers')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (infError) throw infError;
    
    const influencersWithCounts = await Promise.all(
      (influencers || []).map(async (influencer) => {
        const { count } = await supabase
          .from('affiliate_referrals')
          .select('*', { count: 'exact', head: true })
          .eq('influencer_id', influencer.id);
        
        return {
          ...influencer,
          affiliate_referrals: { count: count || 0 }
        };
      })
    );
    
    res.json({
      success: true,
      influencers: influencersWithCounts
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/affiliate/make-payment', requireAdmin, async (req, res) => {
  try {
    const { influencer_id, amount, payment_method } = req.body;
    
    const { data: pending } = await supabase
      .from('affiliate_referrals')
      .select('id, commission_amount')
      .eq('influencer_id', influencer_id)
      .eq('status', 'approved')
      .is('paid_date', null);
    
    if (!pending || pending.length === 0) {
      return res.status(400).json({ error: 'Aucune commission en attente' });
    }
    
    const totalPending = pending.reduce((sum, r) => sum + (r.commission_amount || 0), 0);
    
    if (amount > totalPending) {
      return res.status(400).json({ error: 'Montant trop élevé' });
    }
    
    const { data: payment } = await supabase
      .from('affiliate_payments')
      .insert([{
        influencer_id,
        amount,
        payment_method,
        period: new Date().toISOString().slice(0, 7),
        status: 'completed'
      }])
      .select();
    
    await supabase
      .from('affiliate_referrals')
      .update({
        paid_date: new Date().toISOString(),
        status: 'paid'
      })
      .eq('influencer_id', influencer_id)
      .eq('status', 'approved')
      .is('paid_date', null);
    
    res.json({
      success: true,
      payment: payment[0]
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/affiliate/:influencer_id/analytics', requireAdmin, async (req, res) => {
  try {
    const { influencer_id } = req.params;
    const { period = 'all' } = req.query;
    
    const { data: referrals, error: refError } = await supabase
      .from('affiliate_referrals')
      .select(`
        *,
        users (*)
      `)
      .eq('influencer_id', influencer_id)
      .order('created_at', { ascending: false });
    
    if (refError) throw refError;
    
    const users = referrals.map(r => r.users).filter(Boolean);
    
    const stats = {
      totalReferrals: users.length,
      trialUsers: users.filter(u => u.subscription_type === 'trial').length,
      premiumUsers: users.filter(u => u.subscription_type === 'premium').length,
      activeTrials: users.filter(u => 
        u.subscription_type === 'trial' && 
        new Date(u.trial_ends_at) > new Date()
      ).length,
      expiredTrials: users.filter(u => 
        u.subscription_type === 'trial' && 
        new Date(u.trial_ends_at) <= new Date()
      ).length,
      conversionRate: users.length > 0 
        ? (users.filter(u => u.subscription_type === 'premium').length / users.length * 100).toFixed(1)
        : 0,
      commissionsDue: referrals
        .filter(r => r.status === 'approved' && !r.paid_date)
        .reduce((sum, r) => sum + (r.commission_amount || 0), 0)
    };
    
    const recentActivity = referrals.slice(0, 50).map(r => ({
      userId: r.referred_user_id,
      userEmail: r.users?.email,
      userName: r.users?.full_name,
      userShop: r.users?.shop_name,
      subscriptionType: r.users?.subscription_type,
      trialEndsAt: r.users?.trial_ends_at,
      subscriptionEndDate: r.users?.subscription_end_date,
      referralDate: r.created_at,
      commissionAmount: r.commission_amount,
      commissionStatus: r.status
    }));
    
    res.json({
      success: true,
      influencer_id,
      stats,
      recentActivity,
      totalReferrals: referrals.length
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/affiliate/:influencer_id/users', requireAdmin, async (req, res) => {
  try {
    const { influencer_id } = req.params;
    
    const { data: referrals, error } = await supabase
      .from('affiliate_referrals')
      .select(`
        id,
        created_at,
        status,
        commission_amount,
        users (
          id,
          email,
          full_name,
          shop_name,
          subscription_type,
          trial_ends_at,
          subscription_end_date,
          created_at as user_created_at
        )
      `)
      .eq('influencer_id', influencer_id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    const users = referrals.map(r => ({
      referralId: r.id,
      referralDate: r.created_at,
      commissionAmount: r.commission_amount,
      commissionStatus: r.status,
      ...r.users
    })).filter(u => u.id);
    
    res.json({
      success: true,
      users: users,
      count: users.length
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/affiliate/:influencer_id/monthly-stats', requireAdmin, async (req, res) => {
  try {
    const { influencer_id } = req.params;
    
    const { data: referrals, error } = await supabase
      .from('affiliate_referrals')
      .select(`
        *,
        users (*)
      `)
      .eq('influencer_id', influencer_id);
    
    if (error) throw error;
    
    const monthlyStats = {};
    
    referrals.forEach(r => {
      const month = r.created_at.substring(0, 7);
      if (!monthlyStats[month]) {
        monthlyStats[month] = {
          month,
          referrals: 0,
          trials: 0,
          premiums: 0,
          commissions: 0
        };
      }
      
      monthlyStats[month].referrals++;
      
      if (r.users?.subscription_type === 'trial') {
        monthlyStats[month].trials++;
      }
      
      if (r.users?.subscription_type === 'premium') {
        monthlyStats[month].premiums++;
      }
      
      if (r.commission_amount) {
        monthlyStats[month].commissions += r.commission_amount;
      }
    });
    
    const sortedStats = Object.values(monthlyStats)
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12);
    
    res.json({
      success: true,
      monthlyStats: sortedStats
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/clean-affiliate-referrals', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('affiliate_referrals')
      .delete()
      .is('referred_user_id', null);
    
    if (error) throw error;
    
    res.json({
      success: true,
      deleted_count: data?.length || 0
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/affiliate/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: referrals } = await supabase
      .from('affiliate_referrals')
      .select('id')
      .eq('influencer_id', id)
      .limit(1);
    
    if (referrals && referrals.length > 0) {
      return res.status(400).json({ error: 'Impossible de supprimer, références existantes' });
    }
    
    const { error } = await supabase
      .from('affiliate_influencers')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ success: true });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/subscription/initiate-payment', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, subscription_type, months = 1 } = req.body;
    
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, full_name, phone')
      .eq('id', userId)
      .single();
    
    if (userError) throw userError;
    
    const naboopayPayload = {
      amount: amount * 100,
      currency: "XOF",
      description: `Abonnement ${subscription_type} - ${months} mois`,
      customer_email: userData.email,
      customer_name: userData.full_name,
      customer_phone_number: userData.phone || '770000000',
      return_url: "https://samaboutiksn.netlify.app/payment/callback",
      cancel_url: "https://samaboutiksn.netlify.app/dashboard?payment=cancel",
      webhook_url: "https://backend-s05x.onrender.com/api/webhooks/naboostart",
      metadata: {
        user_id: userId,
        subscription_type: subscription_type,
        months: months
      }
    };
    
const naboopayResponse = await fetch('https://api.naboostart.com/v1/payments/initiate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer naboo-a171fa06-f159-43c3-a915-026fa1385a63.f0340275-3841-466b-a48d-aead55ac4323',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(naboopayPayload)
    });
    
    if (!naboopayResponse.ok) {
      throw new Error(`NabooPay API: ${naboopayResponse.status}`);
    }
    
    const paymentData = await naboopayResponse.json();
    
    if (!paymentData.success) {
      throw new Error(paymentData.message || 'NabooPay error');
    }
    
    const { data: transaction, error: txError } = await supabase
      .from('payment_transactions')
      .insert([{
        user_id: userId,
        amount: amount,
        status: 'pending',
        payment_method: 'naboopay',
        naboopay_payment_id: paymentData.data.payment_id,
        naboopay_checkout_url: paymentData.data.payment_url,
        subscription_type: subscription_type,
        subscription_months: months,
        metadata: naboopayPayload.metadata
      }])
      .select();
    
    if (txError) throw txError;
    
    res.json({
      success: true,
      checkout_url: paymentData.data.payment_url,
      payment_id: paymentData.data.payment_id,
      transaction_id: transaction[0].id
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/webhooks/naboostart', async (req, res) => {
  try {
    console.log('🔔 Webhook NabooStart reçu:', req.body);
    
    const { event, data } = req.body;
    
    if (event === 'payment.success') {
      console.log('💰 Paiement réussi détecté:', data);
      
      const paymentId = data.payment_id;
      
      let { data: transaction } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('naboopay_payment_id', paymentId)
        .single();
 
      if (!transaction) {
        console.log('⚠️ Transaction non trouvée par payment_id, essaie par id...');
        const { data: txByTransactionId } = await supabase
          .from('payment_transactions')
          .select('*')
          .eq('id', paymentId)
          .single();
        
        if (txByTransactionId) {
          transaction = txByTransactionId;
          console.log('✅ Transaction trouvée par id:', transaction.id);
        }
      }
   
      if (!transaction) {
        console.log('❌ Transaction non trouvée');
        return res.json({ success: false });
      }
      
      console.log('🎯 Transaction trouvée:', transaction);
      
      const subscriptionEnd = new Date();
      subscriptionEnd.setMonth(subscriptionEnd.getMonth() + transaction.subscription_months);
      
      console.log(`📅 Date fin abonnement: ${subscriptionEnd.toISOString()}`);
      
      const { error: updateError } = await supabase
        .from('users')
        .update({
          subscription_type: 'premium',
          subscription_end_date: subscriptionEnd.toISOString(),
          max_products: 99999,
          max_online_sales: 99999,
          features_unlocked: true,
          is_premium: true,
          activated_at: new Date().toISOString()
        })
        .eq('id', transaction.user_id);

      if (updateError) {
        console.error('❌ Erreur UPDATE:', updateError);
        throw updateError;
      }
      
      console.log(`✅ Premium activé pour user: ${transaction.user_id}`);
      
      try {
        await fetch('https://backend-s05x.onrender.com/api/track-affiliate-status-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: transaction.user_id,
            new_status: 'premium',
            subscription_amount: transaction.amount
          })
        });
        console.log('✅ Affiliation premium trackée');
      } catch (affiliateError) {
        console.log('⚠️ Erreur tracking affiliation:', affiliateError.message);
      }
      
      console.log('🎉 Webhook terminé avec succès');
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('💥 Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/subscription/payment-status/:transaction_id', requireAuth, async (req, res) => {
  try {
    const { transaction_id } = req.params;
    const userId = req.user.userId;
    
    const { data: transaction, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('id', transaction_id)
      .eq('user_id', userId)
      .single();
    
    if (error) throw error;
    
    res.json({
      success: true,
      transaction: transaction,
      is_completed: transaction.status === 'completed'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/payment/callback', async (req, res) => {
  try {
    const { transaction_id } = req.query;
    
    if (!transaction_id) {
      return res.redirect('https://samaboutiksn.netlify.app/dashboard?payment=error');
    }
    
    const { data: transaction, error } = await supabase
      .from('payment_transactions')
      .select('status, user_id')
      .eq('id', transaction_id)
      .single();
    
    if (error || !transaction) {
      return res.redirect('https://samaboutiksn.netlify.app/dashboard?payment=error');
    }
    
    if (transaction.status === 'completed') {
      return res.redirect('https://samaboutiksn.netlify.app/dashboard?payment=success');
    } else {
      return res.redirect('https://samaboutiksn.netlify.app/dashboard?payment=pending');
    }
    
  } catch (error) {
    res.redirect('https://samaboutiksn.netlify.app/dashboard?payment=error');
  }
});

app.get('/api/test-naboopay', async (req, res) => {
  try {
    console.log('🔍 Testing NabooPay API connection...');
    
    const testPayload = {
      amount: 1000,
      currency: "XOF",
      description: "Test API Connection",
      customer_email: "test@example.com",
      customer_name: "Test User",
      customer_phone_number: "770000000",
      return_url: "https://example.com/success",
      cancel_url: "https://example.com/cancel"
    };
    
    const startTime = Date.now();
    const response = await fetch('https://api.naboostart.com/v1/payments/initiate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer naboo-a171fa06-f159-43c3-a915-026fa1385a63.f0340275-3841-466b-a48d-aead55ac4323',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });
    
    const responseTime = Date.now() - startTime;
    const responseText = await response.text();
    
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { raw: responseText.substring(0, 200) };
    }
    
    res.json({
      test: "NabooPay API Connection Test",
      success: response.ok,
      status: response.status,
      responseTime: `${responseTime}ms`,
      response: responseData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ NabooPay test error:', error);
    res.status(500).json({
      error: error.message,
      errorType: error.constructor.name,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/test-http', async (req, res) => {
  try {
    console.log('Testing basic HTTP connection...');
    
    const googleStart = Date.now();
    const googleRes = await fetch('https://www.google.com', { timeout: 5000 });
    const googleTime = Date.now() - googleStart;
  
    const publicApiStart = Date.now();
    const apiRes = await fetch('https://httpbin.org/get', { timeout: 5000 });
    const apiTime = Date.now() - publicApiStart;
 
    const nabooStart = Date.now();
    let nabooResult;
    try {
      const nabooRes = await fetch('https://api.naboostart.com/v1/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
        timeout: 5000
      });
      nabooResult = { status: nabooRes.status, ok: nabooRes.ok };
    } catch (nabooError) {
      nabooResult = { error: nabooError.message };
    }
    const nabooTime = Date.now() - nabooStart;
    
    res.json({
      google: { success: googleRes.ok, time: `${googleTime}ms` },
      publicApi: { success: apiRes.ok, time: `${apiTime}ms` },
      nabooPay: { result: nabooResult, time: `${nabooTime}ms` },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3)
    });
  }
});

app.get('/api/test-naboopay-headers', async (req, res) => {
  try {
    const tests = [];
   
    try {
      const response = await fetch('https://api.naboostart.com/v1/payments/initiate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer naboo-a171fa06-f159-43c3-a915-026fa1385a63.f0340275-3841-466b-a48d-aead55ac4323',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Render)'
        },
        body: JSON.stringify({
          amount: 1000,
          currency: "XOF",
          description: "Test"
        })
      });
      tests.push({ name: 'Normal headers', status: response.status });
    } catch (error) {
      tests.push({ name: 'Normal headers', error: error.message });
    }
  
    try {
      const response = await fetch('https://api.naboostart.com/v1/payments/initiate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer naboo-a171fa06-f159-43c3-a915-026fa1385a63.f0340275-3841-466b-a48d-aead55ac4323',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 1000,
          currency: "XOF",
          description: "Test"
        })
      });
      tests.push({ name: 'No User-Agent', status: response.status });
    } catch (error) {
      tests.push({ name: 'No User-Agent', error: error.message });
    }
    
    try {
      const response = await fetch('https://api.naboostart.com', { method: 'GET' });
      tests.push({ name: 'GET root', status: response.status });
    } catch (error) {
      tests.push({ name: 'GET root', error: error.message });
    }
    
    res.json({
      tests: tests,
      conclusion: 'NabooPay API blocking requests from Render',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/subscription/initiate-payment-proxy', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, subscription_type, months = 1 } = req.body;
    
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, full_name, phone')
      .eq('id', userId)
      .single();
    
    if (userError) throw userError;
    
    const { data: transaction, error: txError } = await supabase
      .from('payment_transactions')
      .insert([{
        user_id: userId,
        amount: amount,
        status: 'pending',
        payment_method: 'naboopay',
        subscription_type: subscription_type,
        subscription_months: months,
        metadata: { user_id: userId }
      }])
      .select();
    
    if (txError) throw txError;
    
    res.json({
      success: true,
      payment_data: {
        amount: amount * 100,
        currency: "XOF",
        description: `Abonnement ${subscription_type} - ${months} mois`,
        customer_email: userData.email,
        customer_name: userData.full_name,
        customer_phone_number: userData.phone || '770000000',
        return_url: "https://samaboutiksn.netlify.app/payment/callback",
        cancel_url: "https://samaboutiksn.netlify.app/dashboard?payment=cancel",
        webhook_url: "https://backend-s05x.onrender.com/api/webhooks/naboostart",
        metadata: {
          user_id: userId,
          transaction_id: transaction[0].id
        }
      },
      api_endpoint: "https://api.naboostart.com/v1/payments/initiate",
      api_key: "naboo-a171fa06-f159-43c3-a915-026fa1385a63.f0340275-3841-466b-a48d-aead55ac4323",
      transaction_id: transaction[0].id,
      message: "Le frontend doit faire l'appel à NabooPay"
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/subscription/initiate-payment-final', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, subscription_type, months = 1 } = req.body;
    
    console.log('🚀 Payment request:', { userId, amount, subscription_type });
 
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, full_name, phone')
      .eq('id', userId)
      .single();
    
    if (userError) throw userError;

    const baseUrl = 'https://checkout.naboopay.com/checkout-merchant';
    const params = new URLSearchParams({
      org: '69122c5fb9715e833a77efdb',
      amount: (amount * 100).toString(),
      currency: 'XOF',
      description: `Abonnement ${subscription_type} - ${months} mois`,
      customer_email: userData.email,
      customer_name: userData.full_name || 'Client',
      customer_phone: userData.phone || '770000000',
      return_url: 'https://samaboutiksn.netlify.app/payment/callback',
      cancel_url: 'https://samaboutiksn.netlify.app/dashboard?payment=cancel',
      callback_url: 'https://backend-s05x.onrender.com/api/webhooks/naboostart',
      metadata: JSON.stringify({
        user_id: userId,
        subscription_type: subscription_type,
        months: months
      })
    });
    
    const checkoutUrl = `${baseUrl}?${params.toString()}`;
    console.log('🔗 Checkout URL generated:', checkoutUrl);

    const { data: transaction, error: txError } = await supabase
      .from('payment_transactions')
      .insert([{
        user_id: userId,
        amount: amount,
        status: 'pending',
        payment_method: 'naboopay',
        naboopay_checkout_url: checkoutUrl,
        subscription_type: subscription_type,
        subscription_months: months,
        metadata: {
          user_id: userId,
          checkout_generated: new Date().toISOString()
        }
      }])
      .select();
    
    if (txError) throw txError;
    
    console.log('✅ Transaction created:', transaction[0].id);
    
    res.json({
      success: true,
      checkout_url: checkoutUrl,
      transaction_id: transaction[0].id,
      amount: amount,
      message: 'Redirigez vers cette URL pour compléter le paiement'
    });
    
  } catch (error) {
    console.error('💥 Payment error:', error);
    res.status(500).json({ 
      error: error.message,
      debug: 'Using direct checkout URL instead of NabooPay API'
    });
  }
});

app.get('/api/payment/status/:transaction_id', requireAuth, async (req, res) => {
  try {
    const { transaction_id } = req.params;
    const userId = req.user.userId;
    
    const { data: transaction, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('id', transaction_id)
      .eq('user_id', userId)
      .single();
    
    if (error) throw error;
    
    res.json({
      status: transaction.status,
      is_completed: transaction.status === 'completed',
      checkout_url: transaction.naboopay_checkout_url,
      created_at: transaction.created_at
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payment/confirm/:transaction_id', requireAuth, async (req, res) => {
  try {
    const { transaction_id } = req.params;
    const userId = req.user.userId;
    
    const { data: transaction, error } = await supabase
      .from('payment_transactions')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction_id)
      .eq('user_id', userId)
      .select();
    
    if (error) throw error;
   
    const subscriptionEnd = new Date();
    subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);
    
    await supabase
      .from('users')
      .update({
        subscription_type: 'premium',
        subscription_end_date: subscriptionEnd.toISOString(),
        is_premium: true,
        activated_at: new Date().toISOString()
      })
      .eq('id', userId);
    
    res.json({
      success: true,
      message: 'Abonnement activé avec succès !'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



app.get('/api/admin/payments-detailed', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('payment_transactions')
    .select(`
      id, amount, status, created_at, 
      subscription_type, subscription_months,
      users!inner (email, full_name, phone, shop_name)
    `)
    .order('created_at', { ascending: false });
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/admin/verify-payment/:transaction_id', requireAdmin, async (req, res) => {
  const { transaction_id } = req.params;
  
  const { data: transaction } = await supabase
    .from('payment_transactions')
    .select('*, users(email)')
    .eq('id', transaction_id)
    .single();
  
  if (!transaction) return res.status(404).json({ error: 'Transaction non trouvée' });
 
  await activateUserSubscription(transaction.user_id, transaction_id);
  
  res.json({ 
    success: true, 
    message: `Abonnement activé pour ${transaction.users.email}` 
  });
});

app.post('/api/webhooks/premium-activated', async (req, res) => {
  try {
    const { user_id, months } = req.body;
    
    const subscriptionEnd = new Date();
    subscriptionEnd.setMonth(subscriptionEnd.getMonth() + months);
    
    const { error } = await supabase
      .from('users')
      .update({
        subscription_type: 'premium',
        subscription_end_date: subscriptionEnd.toISOString(),
        max_products: 99999,
        max_online_sales: 99999,
        features_unlocked: true,
        is_premium: true
      })
      .eq('id', user_id);
    
    if (error) throw error;
    
    res.json({ success: true });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/user-subscription/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user_id)
      .single();
      
    if (error) throw error;
    
    const now = new Date();
    const subscriptionEnd = user.subscription_type === 'premium' 
      ? new Date(user.subscription_end_date)
      : new Date(user.trial_ends_at);
    
    const isActivePremium = user.subscription_type === 'premium' && 
                          user.is_premium === true &&
                          subscriptionEnd > now;
    
    res.json({
      user_id,
      email: user.email,
      full_name: user.full_name,
      subscription_type: user.subscription_type,
      is_premium: user.is_premium,
      subscription_end_date: user.subscription_end_date,
      trial_ends_at: user.trial_ends_at,
      max_products: user.max_products,
      max_online_sales: user.max_online_sales,
      features_unlocked: user.features_unlocked,
      is_active_premium: isActivePremium,
      subscription_end_date_iso: subscriptionEnd.toISOString(),
      now_iso: now.toISOString(),
      days_left: Math.ceil((subscriptionEnd - now) / (1000 * 60 * 60 * 24)),
      debug_info: {
        subscription_type_check: user.subscription_type === 'premium',
        is_premium_check: user.is_premium === true,
        date_check: subscriptionEnd > now,
        final_result: isActivePremium
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur demarre sur le port ${PORT}`);
});
