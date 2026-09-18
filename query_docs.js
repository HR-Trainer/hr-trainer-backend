const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const modules = await prisma.module.findMany({
        where: { typeContenu: 'DOCUMENT' },
        select: { id: true, titre: true, contenuUrl: true }
    });
    console.log(modules);
}

main().catch(console.error).finally(() => prisma.$disconnect());
