import { Router } from 'express';
import { prisma } from './index';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';

const router = Router({ mergeParams: true });

// Nodemailer config for reporting
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const MAX_DAILY_MESSAGES = 10;

// Initialize Gemini SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy_key' });

// Get chat history
router.get('/', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { email } = req.query;

    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Email missing' });

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const messages = await prisma.messageAgent.findMany({
      where: {
        utilisateurId: user.id,
        moduleId: moduleId
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json(messages);
  } catch (error) {
    console.error('Erreur get agent messages:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Post a new message to the agent
router.post('/', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { email, message } = req.body;

    if (!email || !message) return res.status(400).json({ error: 'Missing fields' });

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check daily limit
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const messageCount = await prisma.messageAgent.count({
      where: {
        utilisateurId: user.id,
        role: 'USER',
        createdAt: { gte: yesterday }
      }
    });

    if (messageCount >= MAX_DAILY_MESSAGES) {
      return res.status(429).json({ error: 'Plafond quotidien de messages atteint. Revenez demain !' });
    }

    // Fetch module content
    const moduleInfo = await prisma.module.findUnique({ where: { id: moduleId } });
    if (!moduleInfo) return res.status(404).json({ error: 'Module not found' });

    // Check for HR / Labour law keywords
    const lowerMessage = message.toLowerCase();
    const hrKeywords = ['droit du travail', 'loi', 'licenciement', 'contrat', 'prud\'hommes', 'convention collective', 'légal', 'juridique'];
    const isHrQuestion = hrKeywords.some(keyword => lowerMessage.includes(keyword));

    // Save user message
    await prisma.messageAgent.create({
      data: {
        utilisateurId: user.id,
        moduleId,
        role: 'USER',
        contenu: message
      }
    });

    // Fetch context (last 5 interactions)
    const history = await prisma.messageAgent.findMany({
      where: { utilisateurId: user.id, moduleId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    history.reverse(); // chronological order

    // Build prompt
    let aiResponseText = "";
    
    // Simulate AI response for the MVP if API key is not present or invalid
    if (!process.env.GEMINI_API_KEY) {
      aiResponseText = "Ceci est une réponse simulée car la clé API Gemini n'est pas configurée dans le fichier .env. " +
                       "Dans un environnement de production, l'IA utiliserait le contenu suivant du module pour vous répondre :\n\n" + 
                       (moduleInfo.contenu ? moduleInfo.contenu.substring(0, 100) + "..." : "Aucun contenu textuel.");
    } else {
      try {
        const systemInstruction = `Tu es le Formateur IA de HR-Trainer. Tu dois répondre à l'élève en te basant UNIQUEMENT sur le contenu du module suivant. Si la réponse n'y est pas, dis-le poliment. Contenu du module: ${moduleInfo.contenu || moduleInfo.description}`;
        
        const contents = history.map(msg => ({
          role: msg.role === 'USER' ? 'user' : 'model',
          parts: [{ text: msg.contenu }]
        }));

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                systemInstruction,
                temperature: 0.3
            }
        });
        
        aiResponseText = response.text || "Je suis désolé, je n'ai pas pu générer de réponse.";
      } catch (err) {
        console.error("Gemini API Error:", err);
        aiResponseText = "Une erreur s'est produite lors de la connexion à l'IA. Veuillez vérifier la clé API.";
      }
    }

    // Append HR warning if applicable
    if (isHrQuestion) {
      aiResponseText += "\n\n⚠️ **Avertissement professionnel** : Votre question semble relever du droit du travail. Bien que je puisse vous guider sur les concepts vus en formation, je vous conseille vivement de consulter un professionnel des RH, un juriste ou votre convention collective pour des conseils légaux spécifiques.";
    }

    // Save AI response
    const aiMessage = await prisma.messageAgent.create({
      data: {
        utilisateurId: user.id,
        moduleId,
        role: 'AI',
        contenu: aiResponseText
      }
    });

    res.json({ userMessage: message, aiMessage });
  } catch (error) {
    console.error('Erreur post agent message:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Report conversation to Admin
router.post('/report', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: 'Email missing' });

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const moduleInfo = await prisma.module.findUnique({ 
        where: { id: moduleId },
        include: { formation: true }
    });

    // Fetch recent conversation context
    const history = await prisma.messageAgent.findMany({
      where: { utilisateurId: user.id, moduleId },
      orderBy: { createdAt: 'desc' },
      take: 6
    });
    history.reverse();
    
    let convoHtml = history.map(h => `
      <div style="margin-bottom: 10px; padding: 10px; background-color: ${h.role === 'USER' ? '#f0f9ff' : '#f4f4f5'}; border-radius: 8px;">
        <strong>${h.role === 'USER' ? user.nom : 'Formateur IA'} :</strong><br/>
        ${h.contenu}
      </div>
    `).join('');

    await transporter.sendMail({
      from: `"HR-Trainer" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // Send to admin
      subject: `🚨 Signalement Problème IA - Élève: ${user.nom}`,
      html: `
        <h2>Signalement d'un problème avec l'Agent IA</h2>
        <p><strong>Élève :</strong> ${user.nom} (${user.email})</p>
        <p><strong>Formation :</strong> ${moduleInfo?.formation?.titre}</p>
        <p><strong>Module :</strong> ${moduleInfo?.titre}</p>
        <hr/>
        <h3>Derniers échanges :</h3>
        ${convoHtml}
      `
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Erreur report agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
