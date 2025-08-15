import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.plan.createMany({
    data: [
      { code: 'FREE',    name: 'Free',    maxProcessors: 1, requestsPerDay: 20,  priceCents: 0 },
      { code: 'PREMIUM', name: 'Premium', maxProcessors: 4, requestsPerDay: 200, priceCents: 9900 },
      { code: 'PRO',     name: 'Pro',     maxProcessors: 8, requestsPerDay: 1000, priceCents: 19900 },
    ],
    skipDuplicates: true, // karena code unik
  });

  console.log('Plans seeded ✅');

    // tambah di bawah seed plan
    const users = await prisma.user.findMany({ select: { id: true } });
    const freePlan = await prisma.plan.findUnique({ where: { code: 'FREE' }, select: { id: true } });

    for (const u of users) {
    const already = await prisma.userSubscription.findFirst({
        where: { userId: u.id, isActive: true },
    });
    if (!already && freePlan) {
        await prisma.userSubscription.create({
        data: { userId: u.id, planId: freePlan.id, isActive: true },
        });
    }
    }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });