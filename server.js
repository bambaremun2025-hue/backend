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

const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const { Resend } = require('resend');
const resend = new Resend('re_123456789');

app.post('/api/send-verification-email', async (req, res) => {
    try {
        const { to, name, verificationCode } = req.body;
        
        const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
                <h1>🔐 Vérification</h1>
                <p style="margin: 0; font-size: 18px;">Activez votre compte</p>
            </div>
            
            <div style="padding: 30px; background: #f9f9f9;">
                <h2>Bonjour ${name},</h2>
                <p>Voici votre code de vérification :</p>
                
                <div style="background: white; padding: 20px; text-align: center; margin: 20px 0; border-radius: 10px; border: 2px dashed #667eea;">
                    <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #667eea;">
                        ${verificationCode}
                    </div>
                    <p style="color: #666; font-size: 14px; margin: 10px 0 0 0;">
                        Expire dans 15 minutes
                    </p>
                </div>
                
                <p style="color: #666; font-size: 14px;">
                    <strong>Comment utiliser votre code :</strong><br>
                    1. Revenez sur l'application<br>
                    2. Entrez le code ci-dessus<br>
                    3. Votre compte sera activé
                </p>
            </div>
            
            <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 12px;">
                <p>Si vous n'avez pas créé de compte, ignorez cet email.</p>
            </div>
        </div>
        `;

        console.log('📧 EMAIL DE VÉRIFICATION ENVOYÉ :');
        console.log('À:', to);
        console.log('Code:', verificationCode);

        res.json({ 
            success: true, 
            message: 'Email de vérification envoyé',
            code: verificationCode
        });

    } catch (error) {
        console.error('Erreur envoi email:', error);
        res.status(500).json({ error: 'Erreur envoi email' });
    }
});

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
        console.log('=== DÉBUT INSCRIPTION AVEC VÉRIFICATION ===');
        console.log('Body reçu:', req.body);
        
        const { email, password, name } = req.body;
        
        if (!email || !password || !name) {
            console.log('Champs manquants');
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }

        // Vérifier si l'email existe déjà
        const { data: existingUser } = await supabase
            .from('profiles')
            .select('email')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'Cet email est déjà utilisé' });
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

        console.log('Auth réussi, création profil avec vérification...');

        // Générer le code de vérification
        const verificationCode = generateVerificationCode();
        const verificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

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
                    role: 'user',
                    verification_code: verificationCode,
                    verification_expires: verificationExpires.toISOString(),
                    email_verified: false,
                    verification_sent_at: new Date().toISOString()
                }
            ])
            .select();

        console.log('Réponse Profil:', { 
            data: profileData, 
            error: profileError?.message 
        });

        if (profileError) {
            console.log('Erreur Profil:', profileError.message);
            return res.status(400).json({ error: 'Erreur profil: ' + profileError.message });
        }

        // Envoyer l'email de vérification
        const emailResponse = await fetch('https://backend-s05x.onrender.com/api/send-verification-email', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                to: email,
                name: name,
                verificationCode: verificationCode
            })
        });

        const emailResult = await emailResponse.json();
        console.log('Résultat envoi email:', emailResult);

        console.log('=== INSCRIPTION RÉUSSIE - VÉRIFICATION REQUISE ===');
        res.json({ 
            success: true,
            message: 'Compte créé ! Vérifiez votre email pour le code de vérification.',
            userId: authData.user.id,
            verificationRequired: true
        });

    } catch (error) {
        console.error('=== ERREUR TOTALE ===', error);
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

app.post('/api/auth/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        if (!email || !code) {
            return res.status(400).json({ error: 'Email et code requis' });
        }

        const { data: user, error: userError } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email)
            .eq('verification_code', code)
            .gt('verification_expires', new Date().toISOString())
            .single();

        if (userError || !user) {
            return res.status(400).json({ error: 'Code invalide ou expiré' });
        }

        // Marquer l'email comme vérifié
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ 
                email_verified: true,
                verification_code: null,
                verification_expires: null,
                email_verified_at: new Date().toISOString()
            })
            .eq('email', email);

        if (updateError) {
            return res.status(500).json({ error: 'Erreur vérification' });
        }

        res.json({ 
            success: true,
            message: 'Email vérifié avec succès ! Vous pouvez maintenant vous connecter.'
        });

    } catch (error) {
        console.error('Erreur vérification:', error);
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

        // Vérifier si l'email est confirmé
        if (!user.email_verified) {
            return res.status(403).json({ 
                error: 'Email non vérifié. Veuillez vérifier votre boîte email.',
                needs_verification: true,
                userId: user.id
            });
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
                subscription_end_date: user.subscription_end_date,
                email_verified: user.email_verified
            }
        });

    } catch (error) {
        console.error('Erreur connexion:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/auth/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        const { data: user, error: userError } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email)
            .single();

        if (userError || !user) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        if (user.email_verified) {
            return res.status(400).json({ error: 'Email déjà vérifié' });
        }

        // Générer un nouveau code
        const verificationCode = generateVerificationCode();
        const verificationExpires = new Date(Date.now() + 15 * 60 * 1000);

        // Mettre à jour le code
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                verification_code: verificationCode,
                verification_expires: verificationExpires.toISOString(),
                verification_sent_at: new Date().toISOString()
            })
            .eq('email', email);

        if (updateError) {
            return res.status(500).json({ error: 'Erreur mise à jour' });
        }

        // Renvoyer l'email
        const emailResponse = await fetch('https://backend-s05x.onrender.com/api/send-verification-email', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                to: email,
                name: user.full_name,
                verificationCode: verificationCode
            })
        });

        const emailResult = await emailResponse.json();

        res.json({ 
            success: true,
            message: 'Nouveau code de vérification envoyé !'
        });

    } catch (error) {
        console.error('Erreur renvoi vérification:', error);
        res.status(500).json({ error: 'Erreur envoi email' });
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

const crypto = require('crypto');

const verifyNaboostartSignature = (payload, signature, secret) => {
    const computedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
    return computedSignature === signature;
};

app.post('/api/webhooks/naboostart', express.json({ verify: (req, res, buf) => {
    req.rawBody = buf;
}}), async (req, res) => {
    try {
        const signature = req.headers['x-naboostart-signature'];
        const payload = req.body;
        
        const isValid = verifyNaboostartSignature(
            payload, 
            signature, 
            'be75fcdd57db5bd3bea0c99527997c06161481f09033f36d7e83f1c87bc0afed'
        );
        
        if (!isValid) {
            console.error('Signature webhook invalide');
            return res.status(401).json({ error: 'Signature invalide' });
        }
        
        console.log('Webhook NABOOPAY:', {
            payment_id: payload.payment_id,
            status: payload.status,
            amount: payload.amount
        });
        
        if (payload.status === 'completed' || payload.status === 'success') {
            const { error: paymentError } = await supabase
                .from('payments')
                .update({ 
                    status: 'completed',
                    completed_at: new Date().toISOString()
                })
                .eq('naboostart_payment_id', payload.payment_id);
            
            if (paymentError) {
                console.error('Erreur paiement:', paymentError);
            }
            
            const { data: payment } = await supabase
                .from('payments')
                .select('user_id')
                .eq('naboostart_payment_id', payload.payment_id)
                .single();
            
            if (payment && payment.user_id) {
                const subscriptionEnd = new Date();
                subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);
                
                const { error: userError } = await supabase
                    .from('profiles')
                    .update({
                        subscription_type: 'premium',
                        subscription_end_date: subscriptionEnd.toISOString(),
                        is_premium: true
                    })
                    .eq('id', payment.user_id);
                
                if (userError) {
                    console.error('Erreur activation:', userError);
                } else {
                    console.log('Abonnement active pour user:', payment.user_id);
                }
            }
        } else if (payload.status === 'failed' || payload.status === 'cancelled') {
            await supabase
                .from('payments')
                .update({ status: 'failed' })
                .eq('naboostart_payment_id', payload.payment_id);
        }
        
        res.status(200).json({ 
            received: true,
            processed: true 
        });
        
    } catch (error) {
        console.error('Erreur webhook:', error);
        res.status(200).json({ 
            received: true,
            error: error.message 
        });
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
