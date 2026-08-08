import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from './index';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Middleware to verify admin (Basic implementation, assuming email is passed in query or body for simplicity in this MVP. In production, use JWT or proper session verification)
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

// ==========================================
// FILE UPLOAD (ADMIN)
// ==========================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique name: timestamp + original extension
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
    // Return the URL that can be used to access the file
    const fileUrl = `http://localhost:5000/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
  } catch (error) {
    console.error('Error during upload:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// ==========================================
// DASHBOARD STATS
// ==========================================
router.get('/dashboard', async (req, res) => {
  try {
    const totalUsers = await prisma.utilisateur.count({ where: { role: 'ELEVE' } });
    const activeUsers = await prisma.utilisateur.count({ where: { role: 'ELEVE', actif: true } });
    const totalFormations = await prisma.formation.count();
    const premiumUsers = await prisma.utilisateur.count({ where: { role: 'ELEVE', statutAcces: 'PAYANT' } });

    // Fetch recent activity (latest 5 users)
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

// ==========================================
// USERS MANAGEMENT
// ==========================================
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

// ==========================================
// FORMATIONS MANAGEMENT
// ==========================================
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

// ==========================================
// MODULES MANAGEMENT (ADMIN)
// ==========================================
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

router.delete('/modules/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    await prisma.module.delete({ where: { id: moduleId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==========================================
// QUIZ MANAGEMENT (ADMIN)
// ==========================================
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

// ==========================================
// USER PROGRESS (ADMIN)
// ==========================================
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

    // Format the progress data
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
