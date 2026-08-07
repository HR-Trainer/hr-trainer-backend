import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Clearing database...');
  await prisma.module.deleteMany();
  await prisma.formation.deleteMany();

  console.log('Seeding default Admin account...');
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@hr-trainer.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123.';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  await prisma.utilisateur.upsert({
    where: { email: adminEmail },
    update: { motDePasse: hashedPassword, role: 'ADMIN', nom: 'Admin' },
    create: { 
      email: adminEmail, 
      motDePasse: hashedPassword, 
      role: 'ADMIN', 
      nom: 'Admin', 
      profil: 'PARTICULIER', 
      statutAcces: 'GRATUIT' 
    }
  });

  console.log('Seeding database with English data...');

  await prisma.formation.create({
    data: {
      titre: 'Labor Law — The Fundamentals',
      description: 'Master the essential legal framework of the employer-employee relationship.',
      niveau: 'Beginner',
      duree: '6 hours 30 mins',
      gratuit: true,
      publie: true,
      modules: {
        create: [
          { titre: 'Introduction to French labor law', contenu: 'Premium content...' },
          { titre: 'Contract types: CDI, CDD, temp work', contenu: 'Premium content...' },
          { titre: 'Legal working hours and overtime', contenu: 'Premium content...' },
          { titre: 'Quiz — Contracts and working hours', contenu: 'Premium content...' },
          { titre: 'Breach of contract: dismissal and resignation', contenu: 'Premium content...' },
          { titre: 'GDPR applied to human resources', contenu: 'Premium content...' },
          { titre: 'Moral and sexual harassment: legal obligations', contenu: 'Premium content...' },
          { titre: 'Final Assessment + Certificate', contenu: 'Premium content...' }
        ]
      }
    }
  });

  await prisma.formation.create({
    data: {
      titre: 'Successful Onboarding: Retaining Your Talent',
      description: 'A good onboarding process increases retention by 50%. Learn how to build one.',
      niveau: 'Intermediate',
      duree: '8 hours',
      gratuit: false,
      publie: true,
      modules: {
        create: [
          { titre: 'The first day', contenu: 'Premium content...' },
          { titre: 'Setting goals and expectations', contenu: 'Premium content...' },
          { titre: '30-60-90 day check-ins', contenu: 'Premium content...' }
        ]
      }
    }
  });

  await prisma.formation.create({
    data: {
      titre: 'Mastering Recruitment Interviews',
      description: 'Learn to identify the best candidates and overcome cognitive biases using AI.',
      niveau: 'Advanced',
      duree: '12 hours',
      gratuit: true,
      publie: true,
      modules: {
        create: [
          { titre: 'Introduction to recruitment', contenu: 'Premium content...' },
          { titre: 'Understanding cognitive biases', contenu: 'Premium content...' },
          { titre: 'Behavioral interviewing techniques', contenu: 'Premium content...' },
          { titre: 'Candidate assessment matrices', contenu: 'Premium content...' }
        ]
      }
    }
  });

  console.log('Seed data created successfully!');
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
