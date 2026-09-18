import { Router } from 'express';
import { prisma } from './index';
import nodemailer from 'nodemailer';
import OpenAI from 'openai';

const router = Router({ mergeParams: true });

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const MAX_DAILY_MESSAGES = 10;

const openai = new OpenAI({ 
  apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || 'dummy_key',
  baseURL: process.env.GROQ_API_KEY ? 'https://api.groq.com/openai/v1' : undefined
});

// get chat history
router.get('/', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { email } = req.query;

    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Email missing' });

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (moduleId === 'general') {
      return res.json([]);
    }

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

// post a new message to the agent
router.post('/', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { email, message } = req.body;

    if (!email || !message) return res.status(400).json({ error: 'Missing fields' });

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // check daily limit
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

    // fetch module content
    let moduleInfo: any = null;
    if (moduleId !== 'general') {
      moduleInfo = await prisma.module.findUnique({ where: { id: moduleId } });
      if (!moduleInfo) return res.status(404).json({ error: 'Module not found' });
    }

    // check for HR 
    const lowerMessage = message.toLowerCase();
    const hrKeywords = ['droit du travail', 'loi', 'licenciement', 'contrat', 'prud\'hommes', 'convention collective', 'légal', 'juridique'];
    const isHrQuestion = hrKeywords.some(keyword => lowerMessage.includes(keyword));

    let history: any[] = [];
    
    if (moduleId !== 'general') {
      // save user message
      await prisma.messageAgent.create({
        data: {
          utilisateurId: user.id,
          moduleId,
          role: 'USER',
          contenu: message
        }
      });

      // fetch context 
      history = await prisma.messageAgent.findMany({
        where: { utilisateurId: user.id, moduleId },
        orderBy: { createdAt: 'desc' },
        take: 10
      });
      history.reverse(); 
    } else {
      // Pour le chat général, l'historique est uniquement géré en local (pas de sauvegarde DB requise pour le MVP)
      history = [{ role: 'USER', contenu: message }];
    } 

   
    let aiResponseText = "";
    
    // simulate AI response for the MVP 
    if (!process.env.GROQ_API_KEY) {
      aiResponseText = "Ceci est une réponse simulée car la clé API Groq n'est pas configurée dans le fichier .env. ";
      if (moduleInfo) {
          aiResponseText += "Dans un environnement de production, l'IA utiliserait le contenu suivant du module pour vous répondre :\n\n" + 
                           ((moduleInfo.contenu || moduleInfo.description) ? (moduleInfo.contenu || moduleInfo.description).substring(0, 100) + "..." : "Aucun contenu textuel.");
      }
    } else {
      try {
        let systemInstruction = `Tu es le "Coach IA - Formateur" expert de HR-Trainer, spécialisé en Ressources Humaines et développement professionnel.
Ton rôle est de guider l'élève de manière extrêmement professionnelle, bienveillante et détaillée pour l'aider à maîtriser le module de formation actuel.

DIRECTIVES D'EXCELLENCE :
1. Pédagogie : Ne te contente pas de donner des réponses courtes. Développe tes explications, donne des exemples concrets du monde de l'entreprise, et structure toujours ta réponse de façon claire (avec des puces, des paragraphes aérés, du Markdown).
2. Ton Professionnel : Adopte un ton encourageant, expert et académique mais accessible. Vouvoie toujours l'utilisateur.
3. Pertinence : Concentre-toi sur le contenu du module fourni ci-dessous. Si la question n'a aucun rapport avec les RH ou la formation, recadre poliment la conversation.
4. Richesse : Utilise des mises en forme Markdown (gras, italique, listes) pour rendre tes résultats professionnels et faciles à lire.
5. Intégrité : N'invente jamais de concepts. Base-toi sur les meilleures pratiques RH reconnues.`;
        
        if (moduleInfo) {
          if (moduleInfo.typeContenu === 'VIDEO') {
            systemInstruction += `\n\nCONTEXTE DU MODULE (Vidéo):\nTitre: ${moduleInfo.titre}\nDescription: ${moduleInfo.description || "Aucune description fournie"}\nTa mission : Résumer les concepts clés, approfondir les sujets évoqués dans la description, et répondre aux interrogations de l'élève.`;
          } else {
            systemInstruction += `\n\nCONTEXTE DU MODULE (Texte):\nContenu: ${moduleInfo.contenu || moduleInfo.description}\nTa mission : Aider l'élève à décortiquer ce contenu, le comprendre en profondeur et l'appliquer dans un contexte professionnel réel.`;
          }
        } else {
          systemInstruction += `\n\nCONTEXTE : L'élève est dans son espace général. Ta mission : L'accueillir, l'orienter sur la plateforme, et répondre à ses questions RH générales.`;
        }
        
        const formattedMessages = history.map(msg => ({
          role: msg.role === 'USER' ? 'user' : 'assistant',
          content: msg.contenu
        }));

        const response = await openai.chat.completions.create({
            model: process.env.GROQ_API_KEY ? 'openai/gpt-oss-20b' : 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemInstruction },
                ...formattedMessages
            ],
            temperature: 0.5,
            max_tokens: 1500
        });
        
        aiResponseText = response.choices[0]?.message?.content || "Je suis désolé, je n'ai pas pu générer de réponse détaillée pour le moment.";
      } catch (err: any) {
        console.error("OpenAI API Error:", err.response?.data || err.message);
        if (err.message?.includes('401')) {
           aiResponseText = "Erreur : La clé API OpenAI (OPENAI_API_KEY) n'est pas configurée ou est invalide.";
        } else {
           aiResponseText = "Une erreur s'est produite lors de la connexion à l'IA. Veuillez vérifier que le modèle est disponible et que votre quota n'est pas dépassé.";
        }
      }
    }
 
    if (isHrQuestion) {
      aiResponseText += "\n\n **Avertissement professionnel** : Votre question semble relever du droit du travail. Bien que je puisse vous guider sur les concepts vus en formation, je vous conseille vivement de consulter un professionnel des RH, un juriste ou votre convention collective pour des conseils légaux spécifiques.";
    }

    let aiMessage: any = null;
    if (moduleId !== 'general') {
      aiMessage = await prisma.messageAgent.create({
        data: {
          utilisateurId: user.id,
          moduleId,
          role: 'AI',
          contenu: aiResponseText
        }
      });
    } else {
      aiMessage = { role: 'AI', contenu: aiResponseText };
    }

    res.json({ message: aiResponseText, aiMessage });
  } catch (error) {
    console.error('Erreur post agent message:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// report conversation to Admin
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

    // fetch recent conversation 
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
      subject: ` Signalement Problème IA - Élève: ${user.nom}`,
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
