const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const supabaseUrl = 'https://meaczpmwhfponrjdxmmi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lYWN6cG13aGZwb25yamR4bW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1NzkzMjYsImV4cCI6MjA3ODE1NTMyNn0.Gp25mFEAm5L4cKBm5BXsIqmEik81oxkqgc8nqfh9s1s';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

        const hashedPassword = await bcrypt.hash(password, 10);
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    name: name,
                    role: 'user'
                }
            }
        });

        if (authError) {
            return res.status(400).json({ error: authError.message });
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
                    role: 'user'
                }
            ])
            .select();

        if (profileError) {
            return res.status(400).json({ error: profileError.message });
        }

        res.json({ 
            message: 'Utilisateur créé avec essai gratuit de 14 jours',
            userId: authData.user.id
        });

    } catch (error) {
        console.error('Erreur inscription:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (authError) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        const { data: user, error: userError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();

        if (userError) {
            return res.status(500).json({ error: 'Erreur base de données' });
        }

        res.json({
            message: 'Connexion réussie',
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

app.post('/api/payments/create-monthly', async (req, res) => {
    try {
        const { userId, customerEmail, customerName } = req.body;
        
        if (!userId || !customerEmail) {
            return res.status(400).json({ error: 'Données manquantes' });
        }

        const amount = 15000;
        const invoiceId = 'INV_' + Date.now();
        const paymentUrl = 'https://paydunya.com/sandbox/checkout/' + invoiceId;
        
        const { data: paymentData, error: paymentError } = await supabase
            .from('payments')
            .insert([
                {
                    user_id: userId,
                    amount: amount,
                    status: 'pending',
                    paydunya_invoice_id: invoiceId,
                    paydunya_payment_url: paymentUrl
                }
            ])
            .select();

        if (paymentError) {
            return res.status(500).json({ error: 'Erreur base de données' });
        }
        
        res.json({
            success: true,
            message: 'Paiement créé avec succès',
            payment_url: paymentUrl,
            invoice_id: invoiceId,
            amount: amount
        });

    } catch (error) {
        console.error('Erreur paiement:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/payments/confirm', async (req, res) => {
    try {
        const { invoice_id, user_id } = req.body;
        
        const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .select('*')
            .eq('paydunya_invoice_id', invoice_id)
            .eq('user_id', user_id)
            .single();

        if (paymentError || !payment) {
            return res.status(404).json({ error: 'Paiement non trouvé' });
        }

        await supabase
            .from('payments')
            .update({ status: 'completed' })
            .eq('paydunya_invoice_id', invoice_id);

        const subscriptionEnd = new Date();
        subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);

        const { error: userError } = await supabase
            .from('profiles')
            .update({ 
                subscription_type: 'premium',
                subscription_end_date: subscriptionEnd.toISOString()
            })
            .eq('id', user_id);

        if (userError) {
            return res.status(500).json({ error: 'Erreur activation abonnement' });
        }

        res.json({ 
            success: true,
            message: 'Abonnement premium mensuel activé avec succès',
            subscription_end: subscriptionEnd.toISOString()
        });

    } catch (error) {
        console.error('Erreur confirmation:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/admin/promote', requireAdmin, async (req, res) => {
    try {
        const { email } = req.body;
        
        const { data, error } = await supabase
            .from('profiles')
            .update({ role: 'admin' })
            .eq('email', email);

        if (error) {
            return res.status(500).json({ error: 'Erreur base de données' });
        }

        res.json({ message: 'Utilisateur promu admin' });

    } catch (error) {
        console.error('Erreur promotion:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
    try {
        const { count: totalUsers, error: usersError } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        const { count: activeTrials, error: trialsError } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_type', 'trial')
            .gt('trial_ends_at', new Date().toISOString());

        const { count: premiumUsers, error: premiumError } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_type', 'premium');

        const { data: revenueData, error: revenueError } = await supabase
            .from('payments')
            .select('amount')
            .eq('status', 'completed');

        const totalRevenue = revenueData ? revenueData.reduce((sum, payment) => sum + payment.amount, 0) : 0;

        res.json({
            total_users: totalUsers || 0,
            active_trials: activeTrials || 0,
            premium_users: premiumUsers || 0,
            total_revenue: totalRevenue
        });

    } catch (error) {
        console.error('Erreur dashboard:', error);
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
    console.log(`Serveur démarré sur le port ${PORT}`);
});
