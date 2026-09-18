import { Router } from 'express';
import { prisma } from './index';

const router = Router();

// Get all enrollments with user and formation details
router.get('/enrollments', async (req, res) => {
  try {
    const enrollments = await prisma.inscriptionFormation.findMany({
      include: {
        utilisateur: {
          select: {
            id: true,
            nom: true,
            email: true,
            role: true,
            entreprise: {
              select: { nom: true }
            }
          }
        },
        formation: {
          select: {
            titre: true,
            prix: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(enrollments);
  } catch (error) {
    console.error('Erreur fetch enrollments:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
