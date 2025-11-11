const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const supabaseUrl = 'https://meaczpmwhfponrjdxmmi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lYWN6cG13aGZwb25yamR4bW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1NzkzMjYsImV4cCI6MjA3ODE1NTMyNn0.Gp25mFEAm5L4cKBm5BXsIqmEik81oxkqgc8nqfh9s1s';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({
    origin: '*',
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
        console.log('=== DÉBUT INSCRIPTION ===');
        console.log('Body reçu:', req.body);
        
        const { email, password, name } = req.body;
        
        if (!email || !password || !name) {
            console.log('Champs manquants');
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }

        console.log('Tentative création Auth...');
        
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password
        });

        console.log('Réponse Auth:', { 
            user: authData?.user?.id, 
            error: authError?.message 
        });

        if (authError) {
            console.log('Erreur Auth:', authError.message);
            return res.status(400).json({ error: authError.message });
        }

        if (!authData.user) {
            console.log('Aucun user créé');
            return res.status(400).json({ error: 'Échec création utilisateur' });
        }

        console.log('Auth réussi, création profil...');

        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);

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
            ]);

        console.log('Réponse Profil:', { 
            data: profileData, 
            error: profileError?.message 
        });

        if (profileError) {
            console.log('Erreur Profil:', profileError.message);
            return res.status(400).json({ error: 'Erreur profil: ' + profileError.message });
        }

        console.log('=== INSCRIPTION RÉUSSIE ===');
        res.json({ 
            success: true,
            message: 'Utilisateur créé avec essai gratuit de 14 jours',
            userId: authData.user.id
        });

    } catch (error) {
        console.error('=== ERREUR TOTALE ===', error);
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
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

        const { count: activeUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .or('subscription_type.eq.premium,and(trial_ends_at.gt.' + new Date().toISOString() + ',subscription_type.eq.trial)');

        const { data: recentPayments } = await supabase
            .from('payments')
            .select('amount, created_at')
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(10);

        res.json({
            total_users: totalUsers || 0,
            active_users: activeUsers || 0,
            recent_payments: recentPayments || []
        });

    } catch (error) {
        console.error('Erreur stats publiques:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/webhooks/naboostart', async (req, res) => {
    try {
        const webhookSecret = 'be75fcdd57db5bd3bea0c99527997c06161481f09033f36d7e83f1c87bc0afed';
        const signature = req.headers['x-naboostart-signature'];
        
        if (!signature) {
            return res.status(401).json({ error: 'Signature manquante' });
        }

        const payload = JSON.stringify(req.body);
        
        const { payment_id, status, metadata } = req.body;
        
        if (status === 'completed') {
            const { data: payment, error: paymentError } = await supabase
                .from('payments')
                .select('*')
                .eq('naboostart_payment_id', payment_id)
                .single();

            if (paymentError || !payment) {
                return res.status(404).json({ error: 'Paiement non trouvé' });
            }

            await supabase
                .from('payments')
                .update({ status: 'completed' })
                .eq('naboostart_payment_id', payment_id);

            const subscriptionEnd = new Date();
            subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);

            await supabase
                .from('profiles')
                .update({ 
                    subscription_type: 'premium',
                    subscription_end_date: subscriptionEnd.toISOString()
                })
                .eq('id', payment.user_id);

            console.log('Abonnement activé pour user:', payment.user_id);
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Erreur webhook:', error);
        res.status(500).json({ error: 'Erreur webhook' });
    }
});

app.get('/', (req, res) => {
    res.json({ 
        message: 'Backend fonctionnel',
        version: '1.0.0',
        status: 'online'
    });
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
