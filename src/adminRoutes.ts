import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from './index';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';

const groq = new OpenAI({ 
  apiKey: process.env.GROQ_API_KEY || 'dummy_key',
  baseURL: 'https://api.groq.com/openai/v1'
});

const router = Router();

// Middleware to verify admin 
const verifyAdmin = async (req: any, res: any, next: any) => {
  const email = req.query.adminEmail || req.body.adminEmail;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  const user = await prisma.utilisateur.findUnique({ where: { email } });
  if (!user || user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  next();
};

router.use(verifyAdmin);

// upload file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // generate unique name
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // url that to access file
    const fileUrl = `http://localhost:5000/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
  } catch (error) {
    console.error('Error during upload:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const totalUsers = await prisma.utilisateur.count({ where: { role: 'ELEVE' } });
    const activeUsers = await prisma.utilisateur.count({ where: { role: 'ELEVE', actif: true } });
    const totalFormations = await prisma.formation.count();
    const premiumUsers = await prisma.utilisateur.count({ where: { role: 'ELEVE', statutAcces: 'PAYANT' } });

    // fetch recent activity
    const recentUsers = await prisma.utilisateur.findMany({
      where: { role: 'ELEVE' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, nom: true, email: true, createdAt: true, profil: true }
    });

    res.json({
      totalUsers,
      activeUsers,
      totalFormations,
      premiumUsers,
      recentUsers
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// AI Analytics Summary
router.get('/analytics/ai-summary', async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.json({ summary: "Clé API Groq manquante. Impossible de générer l'analyse." });
    }

    // Fetch the last 30 user messages 
    const recentMessages = await prisma.messageAgent.findMany({
      where: { role: 'USER' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { module: { select: { titre: true } } }
    });

    if (recentMessages.length === 0) {
      return res.json({ summary: "Pas assez de données récentes pour générer une analyse." });
    }

    //prepare context for the AI
    const conversationContext = recentMessages.map(m => `Dans le module "${m.module.titre}": "${m.contenu}"`).join('\n');

    const systemInstruction = `Tu es un Analyste IA pour une plateforme de formation RH.
Ton rôle est d'analyser les questions récentes posées par les élèves au chatbot et de générer un résumé de 3 phrases maximum.
Tu dois identifier la tendance principale (ex: sur quel sujet bloquent-ils le plus, quelles sont les questions récurrentes).
Sois très direct, professionnel, et apporte de la valeur au formateur. N'utilise pas de liste à puces. Rédige un court paragraphe.
Voici les derniers messages :
${conversationContext}`;

    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'system', content: systemInstruction }],
      temperature: 0.3,
      max_tokens: 200
    });

    const summary = response.choices[0]?.message?.content || "Analyse indisponible pour le moment.";
    res.json({ summary });
  } catch (error) {
    console.error('Error generating AI summary:', error);
    res.status(500).json({ error: 'Erreur lors de la génération de l\'analyse' });
  }
});

// users management
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.utilisateur.findMany({
      where: { role: 'ELEVE' },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});


router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { statutAcces, actif } = req.body;
    const user = await prisma.utilisateur.update({
      where: { id },
      data: { statutAcces, actif }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { email, password, nom, profil, role } = req.body;
    const existing = await prisma.utilisateur.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.utilisateur.create({
      data: {
        email,
        motDePasse: hashedPassword,
        nom,
        profil: profil || 'PARTICULIER',
        role: role || 'ELEVE',
        statutAcces: 'GRATUIT',
        actif: true
      }
    });
    res.json(newUser);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.utilisateur.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// formations management
router.get('/formations', async (req, res) => {
  try {
    const formations = await prisma.formation.findMany({
      include: {
        _count: { select: { modules: true, inscriptions: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(formations);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/formations', async (req, res) => {
  try {
    const { titre, description, niveau, duree, gratuit, publie, imageUrl } = req.body;
    const formation = await prisma.formation.create({
      data: { titre, description, niveau, duree: duree?.toString() || "0", gratuit, publie, imageUrl }
    });
    res.status(201).json(formation);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/formations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { titre, description, niveau, duree, gratuit, publie, imageUrl } = req.body;
    const formation = await prisma.formation.update({
      where: { id },
      data: { titre, description, niveau, duree: duree?.toString(), gratuit, publie, imageUrl }
    });
    res.json(formation);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/formations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.formation.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// modules management
router.get('/formations/:id/modules', async (req, res) => {
  try {
    const { id } = req.params;
    const modules = await prisma.module.findMany({
      where: { formationId: id },
      orderBy: { createdAt: 'asc' }
    });
    res.json(modules);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/formations/:id/modules', async (req, res) => {
  try {
    const { id } = req.params;
    const { titre, description, typeContenu, contenu, contenuUrl, duree } = req.body;
    const newModule = await prisma.module.create({
      data: {
        titre,
        description,
        typeContenu: typeContenu || 'VIDEO',
        contenu,
        contenuUrl,
        duree: duree ? parseInt(duree) : null,
        formationId: id
      }
    });
    res.status(201).json(newModule);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/modules/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { titre, description, typeContenu, contenu, contenuUrl, duree } = req.body;
    const updatedModule = await prisma.module.update({
      where: { id: moduleId },
      data: {
        titre,
        description,
        typeContenu,
        contenu,
        contenuUrl,
        duree: duree ? parseInt(duree) : null
      }
    });
    res.json(updatedModule);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// AI Syllabus Generator
router.post('/formations/:id/generate-syllabus', async (req, res) => {
  try {
    const { id } = req.params;
    const formation = await prisma.formation.findUnique({ where: { id } });
    if (!formation) return res.status(404).json({ error: 'Formation non trouvée' });

    if (!process.env.GROQ_API_KEY) {
      return res.status(400).json({ error: 'Clé API Groq manquante.' });
    }

    const systemInstruction = `Tu es un ingénieur pédagogique expert.
Ton rôle est de concevoir le plan de cours (Syllabus) pour une formation intitulée "${formation.titre}".
${formation.description ? `Description de la formation : "${formation.description}"` : ''}

Tu dois générer exactement 4 modules pertinents et logiques pour cette formation.
Format exigé : EXCLUSIVEMENT un objet JSON valide contenant une clé "modules", sans aucun texte autour.
Exemple :
{
  "modules": [
    { "titre": "Module 1 : Introduction", "description": "Dans ce module, nous verrons..." },
    { "titre": "Module 2 : Approfondissement", "description": "..." }
  ]
}`;

    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'system', content: systemInstruction }],
      temperature: 0.4,
      response_format: { type: "json_object" }
    });

    let generatedText = response.choices[0]?.message?.content || '{"modules":[]}';
    const parsed = JSON.parse(generatedText);
    const generatedModules = parsed.modules || [];

    const createdModules = [];
    for (const mod of generatedModules) {
      const created = await prisma.module.create({
        data: {
          titre: mod.titre,
          description: mod.description,
          typeContenu: 'VIDEO',
          formationId: id
        }
      });
      createdModules.push(created);
    }

    res.json({ modules: createdModules });
  } catch (error) {
    console.error('Error generating syllabus:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du plan de formation' });
  }
});

// AI  for Module Content
router.post('/copilot', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt manquant' });

    if (!process.env.GROQ_API_KEY) {
      return res.status(400).json({ error: 'Clé API Groq manquante.' });
    }

    const systemInstruction = `Tu es un assistant de rédaction (Copilote) pour une plateforme de formation RH.
Ton rôle est de rédiger un texte clair, pédagogique et structuré pour un cours, basé sur les mots-clés ou l'instruction fournie par le formateur.
Rédige directement le contenu, sans introduction ni fioriture. 
Sujet : ${prompt}`;

    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'system', content: systemInstruction }],
      temperature: 0.6,
    });

    const generatedText = response.choices[0]?.message?.content || "";
    res.json({ content: generatedText });
  } catch (error) {
    console.error('Error in copilot:', error);
    res.status(500).json({ error: 'Erreur de génération' });
  }
});

router.delete('/modules/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    await prisma.module.delete({ where: { id: moduleId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// quiz management
router.get('/modules/:moduleId/quiz', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const quiz = await prisma.quiz.findUnique({
      where: { moduleId },
      include: {
        questions: {
          include: {
            options: true
          }
        }
      }
    });
    res.json(quiz || null);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/modules/:moduleId/quiz/generate', async (req, res) => {
  try {
    const { moduleId } = req.params;
    
    //fetch module content
    const moduleInfo = await prisma.module.findUnique({
      where: { id: moduleId }
    });

    if (!moduleInfo) {
      return res.status(404).json({ error: 'Module not found' });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(400).json({ error: 'Clé API Groq non configurée. Impossible de générer le quiz.' });
    }

    const contentText = moduleInfo.contenu || moduleInfo.description || moduleInfo.titre;
    
    const systemInstruction = `Tu es un expert pédagogique. Ton rôle est de générer un quiz à choix multiples basé STRICTEMENT sur le contenu suivant.
Tu dois générer exactement 3 questions.
Chaque question doit avoir entre 2 et 4 options, avec exactement UNE seule option correcte.
Tu dois formater ta réponse EXCLUSIVEMENT en format JSON valide, sous la forme d'un objet contenant une clé "questions", sans aucun texte avant ou après.
Voici le format exact attendu :
{
  "questions": [
    {
      "texte": "Question 1 ?",
      "options": [
        { "texte": "Faux 1", "estCorrecte": false },
        { "texte": "Vrai 1", "estCorrecte": true }
      ]
    }
  ]
}

Contenu du module :
${contentText}
`;

    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'system', content: systemInstruction }],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });
    
    let generatedText = response.choices[0]?.message?.content || '{"questions":[]}';
    const parsed = JSON.parse(generatedText);
    const questions = parsed.questions;
    
    // Validate format
    if (!Array.isArray(questions)) {
       throw new Error('Format généré invalide, le tableau questions est manquant.');
    }

    res.json({ questions });
  } catch (error) {
    console.error('Error generating AI quiz:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du quiz par l\'IA' });
  }
});

router.post('/modules/:moduleId/quiz', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { questions } = req.body;

    // First, check if quiz exists. If so, delete it to recreate (simple approach for MVP)
    const existingQuiz = await prisma.quiz.findUnique({ where: { moduleId } });
    if (existingQuiz) {
      await prisma.quiz.delete({ where: { id: existingQuiz.id } });
    }

    const newQuiz = await prisma.quiz.create({
      data: {
        moduleId,
        questions: {
          create: questions.map((q: any) => ({
            texte: q.texte,
            options: {
              create: q.options.map((o: any) => ({
                texte: o.texte,
                estCorrecte: o.estCorrecte
              }))
            }
          }))
        }
      },
      include: {
        questions: {
          include: {
            options: true
          }
        }
      }
    });
    res.status(201).json(newQuiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// user progress management
router.get('/users/:userId/progress', async (req, res) => {
  try {
    const { userId } = req.params;
    const inscriptions = await prisma.inscriptionFormation.findMany({
      where: { utilisateurId: userId },
      include: {
        formation: {
          include: {
            modules: {
              include: {
                quiz: true
              }
            }
          }
        }
      }
    });

    const completedModules = await prisma.progressionModule.findMany({
      where: { utilisateurId: userId },
      include: {
        module: true
      }
    });

    // format the progress data
    const progressData = inscriptions.map(ins => {
      const courseModules = ins.formation.modules;
      const totalModules = courseModules.length;
      
      const completedForThisCourse = completedModules.filter(cm => 
        courseModules.some(m => m.id === cm.moduleId)
      );

      const completedCount = completedForThisCourse.filter(cm => cm.termine).length;
      const percentage = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

      const quizScores = completedForThisCourse
        .filter(cm => cm.module.typeContenu === 'QUIZ' && cm.score !== null)
        .map(cm => ({
          moduleTitle: cm.module.titre,
          score: cm.score
        }));

      return {
        formationId: ins.formation.id,
        titre: ins.formation.titre,
        progression: percentage,
        quizScores
      };
    });

    res.json(progressData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
