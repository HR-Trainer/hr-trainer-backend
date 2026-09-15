const fs = require('fs');
let content = fs.readFileSync('src/index.ts', 'utf8');
content = content.replace(/modules:\s*\{\s*select:\s*\{\s*id:\s*true,\s*titre:\s*true\s*\}\s*\}/, `modules: {
          select: { id: true, titre: true } 
        },
        evaluations: {
          include: {
            utilisateur: { select: { id: true, nom: true, profil: true, photo: true } }
          },
          orderBy: { createdAt: 'desc' }
        }`);
fs.writeFileSync('src/index.ts', content, 'utf8');
console.log('done');
