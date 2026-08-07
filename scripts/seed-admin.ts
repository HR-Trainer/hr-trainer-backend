import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = 'admin@hr-trainer.com';
  const password = 'admin';

  const existingAdmin = await prisma.utilisateur.findUnique({ where: { email } });
  if (existingAdmin) {
    console.log('Admin already exists.');
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await prisma.utilisateur.create({
    data: {
      email,
      motDePasse: hashedPassword,
      nom: 'Super Admin',
      profil: 'ENTREPRISE',
      statutAcces: 'PAYANT',
      role: 'ADMIN',
      actif: true
    }
  });

  console.log('Admin created successfully:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
