const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const invites = await prisma.spaceInvitation.findMany();
  console.log(invites);
  
  const users = await prisma.user.findMany({
    select: { email: true, vaultPublicKey: true }
  });
  console.log(users);
}

check().catch(console.error).finally(() => prisma.$disconnect());
