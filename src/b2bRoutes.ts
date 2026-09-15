import { Router } from 'express';
import Stripe from 'stripe';
import { prisma } from './index';
import { Resend } from 'resend';
import crypto from 'crypto';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_123', {
  apiVersion: '2024-06-20' as any,
});
const resend = new Resend(process.env.RESEND_API_KEY || 're_123');

// 1. Stripe Checkout Session
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { email, entrepriseId } = req.body;
    
    // Create or get customer
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'HR-Trainer Pro',
              description: "Abonnement B2B pour la Suite IA et Gestion d'Équipe",
            },
            unit_amount: 5000, // 50.00 EUR
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/admin/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing`,
      client_reference_id: entrepriseId,
      customer_email: email,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Stripe Webhook (To update DB automatically)
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig as string,
      process.env.STRIPE_WEBHOOK_SECRET || 'whsec_123'
    );
  } catch (err: any) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;

    if (session.mode === 'subscription') {
      const entrepriseId = session.client_reference_id;
      const subscriptionId = session.subscription;
      const customerId = session.customer;

      if (entrepriseId) {
        await prisma.entreprise.update({
          where: { id: entrepriseId },
          data: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            subscriptionStatus: 'active',
          },
        });
      }
    } else if (session.mode === 'payment') {
      // Paiement unitaire d'une formation
      const formationId = session.metadata?.formationId;
      const utilisateurId = session.metadata?.utilisateurId;
      
      if (formationId && utilisateurId) {
        await prisma.inscriptionFormation.create({
          data: {
            utilisateurId,
            formationId,
            statut: 'EN_COURS',
            progression: 0,
          }
        });
      }
    }
  } else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as any;
    const entreprise = await prisma.entreprise.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });
    
    if (entreprise) {
      await prisma.entreprise.update({
        where: { id: entreprise.id },
        data: { subscriptionStatus: 'canceled' },
      });
    }
  }

  res.json({ received: true });
});

// Acheter une formation à l'unité
router.post('/buy-formation', async (req, res) => {
  try {
    const { formationId, utilisateurId, email } = req.body;
    
    const formation = await prisma.formation.findUnique({ where: { id: formationId } });
    
    if (!formation || formation.gratuit || !formation.prix) {
      return res.status(400).json({ error: 'Cette formation ne peut pas être achetée.' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: formation.titre,
              description: formation.description || 'Formation HR-Trainer',
            },
            unit_amount: Math.round(formation.prix * 100), // En centimes
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/formations/${formation.id}?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/formations/${formation.id}?canceled=true`,
      customer_email: email,
      metadata: {
        formationId,
        utilisateurId,
      }
    });

    res.json({ url: session.url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Inviter un employé
router.post('/invite', async (req, res) => {
  try {
    const { email, entrepriseId } = req.body;
    
    // Générer un token unique
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Valide 7 jours

    const invitation = await prisma.invitation.create({
      data: {
        email,
        token,
        entrepriseId,
        expiresAt,
      },
    });

    // Envoyer l'email
    const inviteUrl = `${process.env.FRONTEND_URL}/register/invite?token=${token}`;
    await resend.emails.send({
      from: 'HR-Trainer <onboarding@resend.dev>',
      to: email,
      subject: "Invitation à rejoindre votre espace de formation d'entreprise",
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Vous avez été invité sur HR-Trainer !</h2>
          <p>Votre responsable RH vous invite à rejoindre l'espace de formation de votre entreprise.</p>
          <a href="${inviteUrl}" style="background-color: #3182CE; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 15px;">
            Accepter l'invitation
          </a>
          <p style="margin-top: 20px; color: #666; font-size: 12px;">Ce lien expire dans 7 jours.</p>
        </div>
      `,
    });

    res.json({ message: 'Invitation envoyée avec succès', invitation });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Vérifier une invitation
router.get('/invite/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: { entreprise: true },
    });

    if (!invitation || invitation.utilisee || invitation.expiresAt < new Date()) {
      res.status(400).json({ error: 'Invitation invalide ou expirée' });
      return;
    }

    res.json({ email: invitation.email, entrepriseId: invitation.entrepriseId, nomEntreprise: invitation.entreprise.nom });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
