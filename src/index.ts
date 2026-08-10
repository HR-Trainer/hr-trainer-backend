import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import adminRoutes from './adminRoutes';
import agentRoutes from './agentRoutes';
import path from 'path';

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
const app = express();
const port = process.env.PORT || 5000;

// Configuration de Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS  
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Register admin routes
app.use('/api/admin', adminRoutes);

// Register agent routes
app.use('/api/eleve/modules/:moduleId/agent', agentRoutes);

//Récupérer toutes les formations 
app.get('/api/formations', async (req, res) => {
  try {
    const formations = await prisma.formation.findMany({
      where: { publie: true },
    });
    res.json(formations);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

//Récupérer une formation spécifique par ID
app.get('/api/formations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const formation = await prisma.formation.findUnique({
      where: { id },
      include: {
        modules: {
          select: { id: true, titre: true } 
        }
      }
    });
    
    if (!formation) {
       res.status(404).json({ error: 'Formation non trouvée' });
       return;
    }
    
    res.json(formation);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

//Envoyer un email via Nodemailer
app.post('/api/contact', async (req, res) => {
  try {
    const { nom, email, message, type } = req.body;
    
    // On envoie l'email à soi-même 
    const info = await transporter.sendMail({
      from: `"Formateur RH" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `New message - ${type} from ${nom}`,
      html: `
        <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181b;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
            
            <!-- Top Accent Line -->
            <div style="height: 6px; background: linear-gradient(90deg, #0066FF, #3b82f6);"></div>
            
            <!-- Header -->
            <div style="padding: 32px 40px 24px; border-bottom: 1px solid #e4e4e7;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle">
                    <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #0066FF;">HR<span style="color: #18181b;">-Trainer</span></span>
                  </td>
                  <td align="right" valign="middle">
                    <span style="background-color: #dbeafe; color: #1e3a8a; padding: 6px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">New Notification</span>
                  </td>
                </tr>
              </table>
            </div>

            <!-- Content -->
            <div style="padding: 40px;">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #09090b; letter-spacing: -0.5px;">You have a new request</h1>
              <p style="margin: 0 0 32px; font-size: 15px; color: #71717a; line-height: 1.5;">A new form submission was received from the HR-Trainer website. Here are the details:</p>

              <!-- Details Box -->
              <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 14px;">
                  <tr>
                    <td width="24" valign="top" style="padding-bottom: 16px;"><img src="https://cdn-icons-png.flaticon.com/512/1077/1077114.png" width="16" height="16" style="opacity: 0.5; margin-top: 2px;" alt="User"></td>
                    <td width="100" valign="top" style="color: #71717a; font-weight: 500; padding-bottom: 16px;">Name</td>
                    <td valign="top" style="color: #09090b; font-weight: 600; padding-bottom: 16px;">${nom}</td>
                  </tr>
                  <tr>
                    <td width="24" valign="top" style="padding-bottom: 16px;"><img src="https://cdn-icons-png.flaticon.com/512/732/732200.png" width="16" height="16" style="opacity: 0.5; margin-top: 2px;" alt="Email"></td>
                    <td valign="top" style="color: #71717a; font-weight: 500; padding-bottom: 16px;">Email</td>
                    <td valign="top" style="font-weight: 600; padding-bottom: 16px;"><a href="mailto:${email}" style="color: #0066FF; text-decoration: none;">${email}</a></td>
                  </tr>
                  <tr>
                    <td width="24" valign="top"><img src="https://cdn-icons-png.flaticon.com/512/709/709605.png" width="16" height="16" style="opacity: 0.5; margin-top: 2px;" alt="Subject"></td>
                    <td valign="top" style="color: #71717a; font-weight: 500;">Subject</td>
                    <td valign="top" style="color: #09090b; font-weight: 600;">${type}</td>
                  </tr>
                </table>
              </div>

              <!-- Message -->
              <h3 style="margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #a1a1aa; font-weight: 600;">Message Content</h3>
              <div style="background-color: #ffffff; border-left: 3px solid #0066FF; padding: 0 0 0 16px; color: #3f3f46; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${message}</div>
              
            </div>

            <!-- Action -->
            <div style="padding: 0 40px 40px;">
              <a href="mailto:${email}" style="display: inline-block; background-color: #0066FF; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 14px 28px; border-radius: 6px;">Reply to ${nom.split(' ')[0]}</a>
            </div>

          </div>

          <!-- Footer -->
          <div style="max-width: 600px; margin: 32px auto 0; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #a1a1aa;">Sent securely from your HR-Trainer platform.</p>
            <p style="margin: 4px 0 0; font-size: 12px; color: #a1a1aa;">© ${new Date().getFullYear()} HR-Trainer. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    res.status(200).json({ success: true, messageId: info.messageId });
    
    // Create in-app notification for all admins
    try {
      const admins = await prisma.utilisateur.findMany({ where: { role: 'ADMIN', actif: true } });
      const notifs = admins.map(admin => ({
        utilisateurId: admin.id,
        titre: `Nouveau message: ${type}`,
        message: `De ${nom} (${email})`,
        lien: '/admin/dashboard'
      }));
      if (notifs.length > 0) {
        await prisma.notification.createMany({ data: notifs });
      }
    } catch (notifErr) {
      console.error('Erreur creation notif contact:', notifErr);
    }

  } catch (error) {
    console.error('Erreur email:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi' });
  }
});

const ALLOWED_DOMAIN = '@entreprise.com';

// Inscription 
app.post('/api/inscription', async (req, res) => {
  try {
    const { email, password, nom, profil } = req.body;
    
    // Domain restriction removed for testing purposes

    // Vérifier si l'utilisateur existe 
    const existingUser = await prisma.utilisateur.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: 'Cet email est déjà utilisé' });
      return;
    }

    // Hacher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = await prisma.utilisateur.create({
      data: {
        email,
        motDePasse: hashedPassword,
        nom,
        profil,
        statutAcces: 'GRATUIT' 
      }
    });

    res.status(201).json({ success: true, user: { id: newUser.id, email: newUser.email, nom: newUser.nom, profil: newUser.profil } });

    // Create in-app notification for admins
    try {
      const admins = await prisma.utilisateur.findMany({ where: { role: 'ADMIN', actif: true } });
      const notifs = admins.map(admin => ({
        utilisateurId: admin.id,
        titre: 'Nouvel utilisateur',
        message: `${newUser.nom} vient de créer un compte (${newUser.profil}).`,
        lien: '/admin/users'
      }));
      if (notifs.length > 0) {
        await prisma.notification.createMany({ data: notifs });
      }
    } catch (notifErr) {
      console.error('Erreur creation notif inscription:', notifErr);
    }

  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur lors de la création du compte' });
  }
});

//  Connexion 
app.post('/api/connexion', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Domain restriction removed for login to allow admin and legacy accounts

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Identifiants incorrects' });
      return;
    }

    if (!user.actif) {
      res.status(403).json({ error: 'Votre compte a été désactivé par un administrateur.' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.motDePasse);
    if (!isValid) {
      res.status(401).json({ error: 'Identifiants incorrects' });
      return;
    }

    res.json({ id: user.id, email: user.email, nom: user.nom, profil: user.profil, statutAcces: user.statutAcces, photo: user.photo, telephone: user.telephone, poste: user.poste, role: user.role });
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

//  Mettre à jour le profil
app.put('/api/profil', async (req, res) => {
  try {
    const { id, nom, telephone, poste, photo } = req.body;
    
    if (!id || !nom) {
      res.status(400).json({ error: 'Données manquantes' });
      return;
    }

    const updatedUser = await prisma.utilisateur.update({
      where: { id },
      data: { nom, telephone, poste, photo }
    });

    res.json({ success: true, user: { id: updatedUser.id, nom: updatedUser.nom, telephone: updatedUser.telephone, poste: updatedUser.poste, photo: updatedUser.photo } });
  } catch (error) {
    console.error('Erreur mise à jour profil:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

app.delete('/api/eleve/account', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ error: 'ID manquant' });
      return;
    }
    await prisma.utilisateur.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression compte:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du compte' });
  }
});

// Authentification Google 
app.post('/api/auth/google', async (req, res) => {
  try {
    const { email, name, image } = req.body;
    
    if (!email) {
      res.status(400).json({ error: 'Email manquant' });
      return;
    }

    let user = await prisma.utilisateur.findUnique({ where: { email } });
    
    if (user && !user.actif) {
      res.status(403).json({ error: 'Votre compte a été désactivé par un administrateur.' });
      return;
    }

    // Si l'utilisateur n'existe pas
    if (!user) {
      const randomPassword = await bcrypt.hash(Math.random().toString(36).slice(-8), 10);
      user = await prisma.utilisateur.create({
        data: {
          email,
          nom: name || email.split('@')[0],
          motDePasse: randomPassword,
          profil: 'PARTICULIER',
          statutAcces: 'GRATUIT',
          photo: image || null
        }
      });
    } else {
      // Mettre à jour la photo 
      if (image && !user.photo) {
        user = await prisma.utilisateur.update({
          where: { email },
          data: { photo: image }
        });
      }
    }

    res.json(user);
  } catch (error) {
    console.error('Erreur Google auth:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/mot-de-passe-oublie', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      res.status(400).json({ error: 'Email manquant' });
      return;
    }

    // in MVP  check if user exists.
    const resetLink = `http://localhost:3000/reinitialiser-mot-de-passe?email=${encodeURIComponent(email)}`;

    const info = await transporter.sendMail({
      from: `"HR-Trainer" <${process.env.EMAIL_USER}>`,
      to: email, // Send to the user's email
      subject: `Password Reset - HR-Trainer`,
      html: `
        <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181b;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
            <div style="height: 6px; background: linear-gradient(90deg, #0066FF, #3b82f6);"></div>
            <div style="padding: 40px; text-align: center;">
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #09090b;">Password Reset Request</h1>
              <p style="margin: 0 0 32px; font-size: 15px; color: #71717a; line-height: 1.5;">We received a request to reset your password for your HR-Trainer account. Click the button below to proceed.</p>
              <a href="${resetLink}" style="display: inline-block; background-color: #0066FF; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 28px; border-radius: 8px;">Reset My Password</a>
              <p style="margin: 32px 0 0; font-size: 13px; color: #a1a1aa;">If you didn't request a password reset, you can safely ignore this email.</p>
            </div>
          </div>
        </div>
      `,
    });

    res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Erreur email mdp oublié:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de l\'email' });
  }
});

app.put('/api/mot-de-passe-reset', async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      res.status(400).json({ error: 'Email ou mot de passe manquant' });
      return;
    }

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.utilisateur.update({
      where: { email },
      data: { motDePasse: hashedPassword }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Erreur lors de la réinitialisation du mot de passe:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// Dashboard Eleve
app.get('/api/eleve/dashboard', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email manquant' });
      return;
    }

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    // Formations enrolled
    const inscriptions = await prisma.inscriptionFormation.findMany({
      where: { utilisateurId: user.id },
      include: { formation: { include: { modules: { take: 1, orderBy: { createdAt: 'asc' } } } } }
    });

    // All Published Formations
    const availableCourses = await prisma.formation.findMany({
      where: { publie: true },
      include: { modules: { take: 1, orderBy: { createdAt: 'asc' } } }
    });
    const modulesTermines = await prisma.progressionModule.count({
      where: { utilisateurId: user.id, termine: true }
    });

    // Recent Activity
    const recentActivity = await prisma.progressionModule.findMany({
      where: { utilisateurId: user.id, termine: true },
      include: { module: { include: { formation: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5
    });

    // Attestations
    const attestations = await prisma.attestation.count({
      where: { utilisateurId: user.id }
    });

    res.json({
      inscriptions,
      availableCourses,
      recentActivity,
      stats: {
        modulesTermines,
        attestations
      },
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Erreur dashboard eleve:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Lecteur de module
app.get('/api/eleve/modules/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email manquant' });
      return;
    }

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    const module = await prisma.module.findUnique({
      where: { id: moduleId },
      include: {
        formation: {
          include: {
            modules: { orderBy: { createdAt: 'asc' }, select: { id: true, titre: true, typeContenu: true, duree: true, quiz: true } }
          }
        },
        quiz: {
          include: {
            questions: {
              include: { options: true }
            }
          }
        }
      }
    });

    if (!module) {
      res.status(404).json({ error: 'Module non trouvé' });
      return;
    }

    if (user.statutAcces === 'GRATUIT' && !module.formation.gratuit) {
      res.status(403).json({ error: 'Accès refusé. Cette formation nécessite un abonnement payant.' });
      return;
    }

    // Progression
    const progression = await prisma.progressionModule.findUnique({
      where: { utilisateurId_moduleId: { utilisateurId: user.id, moduleId } }
    });

    res.json({ module, progression });
  } catch (error: any) {
    console.error('Erreur get module:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

app.post('/api/eleve/modules/:moduleId/complete', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { email, score, answers } = req.body;

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const module = await prisma.module.findUnique({ where: { id: moduleId }, include: { formation: { include: { modules: true } } } });
    if (!module) return res.status(404).json({ error: 'Module not found' });

    let finalScore = score ?? null;

    // Securely compute score if answers are provided
    if (answers && Object.keys(answers).length > 0) {
      const quiz = await prisma.quiz.findUnique({
        where: { moduleId },
        include: { questions: { include: { options: true } } }
      });
      if (quiz) {
        let correctCount = 0;
        for (const question of quiz.questions) {
          const selectedOptionId = answers[question.id];
          const correctOption = question.options.find(o => o.estCorrecte);
          if (correctOption && selectedOptionId === correctOption.id) {
            correctCount++;
          }
        }
        finalScore = Math.round((correctCount / quiz.questions.length) * 100);
      }
    }

    // Update or create progression
    const progression = await prisma.progressionModule.upsert({
      where: { utilisateurId_moduleId: { utilisateurId: user.id, moduleId } },
      update: { termine: true, score: finalScore },
      create: { utilisateurId: user.id, moduleId, termine: true, score: finalScore }
    });

    // Update global formation progression
    const totalModules = module.formation.modules.length;
    const termines = await prisma.progressionModule.count({
      where: {
        utilisateurId: user.id,
        termine: true,
        module: { formationId: module.formationId }
      }
    });

    const percent = totalModules > 0 ? Math.round((termines / totalModules) * 100) : 100;

    await prisma.inscriptionFormation.upsert({
      where: { utilisateurId_formationId: { utilisateurId: user.id, formationId: module.formationId } },
      update: { progression: percent, statut: percent === 100 ? "TERMINE" : "EN_COURS" },
      create: { utilisateurId: user.id, formationId: module.formationId, progression: percent, statut: percent === 100 ? "TERMINE" : "EN_COURS" }
    });

    // If 100%, generate Attestation
    if (percent === 100) {
      const existing = await prisma.attestation.findUnique({
        where: { utilisateurId_formationId: { utilisateurId: user.id, formationId: module.formationId } }
      });
      if (!existing) {
        await prisma.attestation.create({
          data: { utilisateurId: user.id, formationId: module.formationId }
        });
      }
    }

    res.json({ success: true, progression, formationProgress: percent });
  } catch (error) {
    console.error('Erreur complete module:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Attestations
app.get('/api/eleve/attestations', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email manquant' });
    }

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    const attestations = await prisma.attestation.findMany({
      where: { utilisateurId: user.id },
      include: {
        formation: { select: { titre: true } }
      },
      orderBy: { dateObtention: 'desc' }
    });

    res.json(attestations);
  } catch (error) {
    console.error('Erreur attestations:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Notifications API
app.get('/api/notifications', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Email missing' });

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const notifications = await prisma.notification.findMany({
      where: { utilisateurId: user.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await prisma.notification.update({
      where: { id },
      data: { lu: true }
    });
    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/notifications/read-all', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email missing' });

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.notification.updateMany({
      where: { utilisateurId: user.id },
      data: { lu: true }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(port, () => {
  console.log(`Backend Server running on http://localhost:${port}`);
});
