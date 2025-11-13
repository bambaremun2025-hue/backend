const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = 'https://meaczpmwhfponrjdxmmi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lYWN6cG13aGZwb25yamR4bW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1NzkzMjYsImV4cCI6MjA3ODE1NTMyNn0.Gp25mFEAm5L4cKBm5BXsIqmEik81oxkqgc8nqfh9s1s';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

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

// SUPPRIME cette ligne problématique :
// app.options('*', cors());

const requireAdmin = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ error: 'Token manquant' });
    }
    
    const token = authHeader.split(' ')[1];
    
    const { data: user, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', token)
        .eq('role', 'admin')
        .single();

    if (error || !user) {
        return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
    }
    next();
};

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }

        const { data: existingUser } = await supabase
            .from('profiles')
            .select('email')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'Cet email est déjà utilisé' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password
        });

        if (authError) {
            return res.status(400).json({ error: authError.message });
        }

        if (!authData.user) {
            return res.status(400).json({ error: 'Échec création utilisateur' });
        }

        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .insert([
                {
                    id: authData.user.id,
                    email: email,
                    full_name: name,
                    subscription_type: 'trial',
                    trial_ends_at: trialEnd.toISOString(),
                    role: 'user',
                    email_verified: true,
                    password_hash: hashedPassword
                }
            ])
            .select();

        if (profileError) {
            return res.status(400).json({ error: 'Erreur profil: ' + profileError.message });
        }

        const token = jwt.sign(
            { 
                userId: authData.user.id,
                email: email,
                name: name
            },
            process.env.JWT_SECRET || 'default-secret',
            { expiresIn: '24h' }
        );

        res.json({ 
            success: true,
            message: 'Utilisateur créé avec essai gratuit de 14 jours',
            token: token,
            user: {
                id: authData.user.id,
                email: email,
                name: name,
                role: 'user',
                subscription_type: 'trial',
                trial_ends_at: trialEnd.toISOString()
            }
        });

    } catch (error) {
        console.error('Erreur inscription:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const { data: user, error: userError } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email)
            .single();

        if (userError || !user) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        const token = jwt.sign(
            { 
                userId: user.id,
                email: user.email,
                name: user.full_name
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
        console.error('Erreur connexion:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/user/subscription-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const { data: user, error } = await supabase
            .from('profiles')
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
        console.error('Erreur statut abonnement:', error);
        res.status(500).json({ error: 'Erreur serveur' });
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
        console.error('Erreur génération facture:', error);
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
        console.error('Erreur factures:', error);
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
        console.error('Erreur génération facture:', error);
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
        console.error('Erreur NABOOPAY:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur de connexion au service de paiement' 
        });
    }
});

app.post('/api/admin/activate-subscription', async (req, res) => {
    try {
        const { userEmail, months = 1 } = req.body;
        
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.includes('admin')) {
            return res.status(403).json({ error: 'Accès admin requis' });
        }

        const subscriptionEnd = new Date();
        subscriptionEnd.setMonth(subscriptionEnd.getMonth() + months);

        const { data: user, error: userError } = await supabase
            .from('profiles')
            .update({
                subscription_type: 'premium',
                subscription_end_date: subscriptionEnd.toISOString(),
                is_premium: true,
                activated_by: 'admin_manual',
                activated_at: new Date().toISOString()
            })
            .eq('email', userEmail)
            .select();

        if (userError) {
            return res.status(500).json({ error: 'Erreur base de données: ' + userError.message });
        }

        if (!user || user.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé: ' + userEmail });
        }

        res.json({ 
            success: true,
            message: `Abonnement activé pour ${userEmail} jusqu'au ${subscriptionEnd.toLocaleDateString('fr-FR')}`,
            user: user[0]
        });

    } catch (error) {
        console.error('Erreur activation manuelle:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/admin/search-users', async (req, res) => {
    try {
        const { email, name } = req.query;
        
        let query = supabase.from('profiles').select('*');
        
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
        console.error('Erreur recherche users:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
    try {
        const { count: totalUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        const today = new Date().toISOString().split('T')[0];
        const { count: todayUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today);

        const { count: activeTrials } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_type', 'trial')
            .gt('trial_ends_at', new Date().toISOString());

        const { count: premiumUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_type', 'premium');

        const { count: expiredTrials } = await supabase
            .from('profiles')
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
        console.error('Erreur dashboard:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/stats/public', async (req, res) => {
    try {
        const { count: totalUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        const today = new Date().toISOString().split('T')[0];
        const { count: todayUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today);

        const { count: activeTrials } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_type', 'trial')
            .gt('trial_ends_at', new Date().toISOString());

        const { count: premiumUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_type', 'premium');

        const { count: expiredTrials } = await supabase
            .from('profiles')
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

app.post('/api/products', async (req, res) => {
    try {
        const { name, price, stock, purchase_price, category } = req.body;
        
        if (!name || !price || !stock) {
            return res.status(400).json({ error: 'Nom, prix et stock sont requis' });
        }

        const { data: product, error } = await supabase
            .from('products')
            .insert([
                {
                    name: name,
                    price: parseFloat(price),
                    stock: parseInt(stock),
                    purchase_price: purchase_price ? parseFloat(purchase_price) : null,
                    category: category || 'Non catégorisé'
                }
            ])
            .select();

        if (error) {
            return res.status(500).json({ error: 'Erreur création produit: ' + error.message });
        }

        res.json({ 
            success: true,
            message: 'Produit ajouté avec succès',
            product: product[0]
        });

    } catch (error) {
        console.error('Erreur ajout produit:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const { data: products, error } = await supabase
            .from('products')
            .select('*');

        if (error) {
            return res.status(500).json({ error: 'Erreur base de données' });
        }

        res.json(products);

    } catch (error) {
        console.error('Erreur produits:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/sales', async (req, res) => {
    try {
        const { product_id, quantity, total_amount, user_id } = req.body;
        
        const { data: saleData, error } = await supabase
            .from('sales')
            .insert([
                {
                    product_id: product_id,
                    quantity: quantity,
                    total_amount: total_amount,
                    user_id: user_id
                }
            ])
            .select();

        if (error) {
            return res.status(500).json({ error: 'Erreur lors de l\'enregistrement' });
        }

        res.json({ message: 'Vente enregistrée', saleId: saleData[0].id });

    } catch (error) {
        console.error('Erreur vente:', error);
        res.status(500).json({ error: 'Erreur serveur' });
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

app.listen(PORT, () => {
    console.log(`Serveur demarre sur le port ${PORT}`);
});
