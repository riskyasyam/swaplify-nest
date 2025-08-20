import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // 1) Seed Plans
  await prisma.plan.createMany({
    data: [
      { code: 'FREE',    name: 'Free',    maxProcessors: 1, requestsPerDay: 20,  priceCents: 0 },
      { code: 'PREMIUM', name: 'Premium', maxProcessors: 4, requestsPerDay: 200, priceCents: 9900 },
      { code: 'PRO',     name: 'Pro',     maxProcessors: 8, requestsPerDay: 1000, priceCents: 19900 },
    ],
    skipDuplicates: true,
  });
  console.log('Plans seeded ✅');

  // 2) Pastikan semua user yang ada sudah punya FREE subscription aktif
  const freePlan = await prisma.plan.findUnique({ where: { code: 'FREE' } });
  if (freePlan) {
    const users = await prisma.user.findMany({ select: { id: true } });
    for (const u of users) {
      const already = await prisma.userSubscription.findFirst({
        where: { userId: u.id, isActive: true },
        select: { id: true },
      });
      if (!already) {
        await prisma.userSubscription.create({
          data: { userId: u.id, planId: freePlan.id, isActive: true, startedAt: new Date() },
        });
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });