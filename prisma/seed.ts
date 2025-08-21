import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1) Seed Plans
  await prisma.plan.createMany({
    data: [
      { code: 'FREE', name: 'Free', priority: 1 },
      { code: 'PREMIUM', name: 'Premium', priority: 2 },
      { code: 'PRO', name: 'Pro', priority: 3 },
    ],
    skipDuplicates: true,
  });
  console.log('Plans seeded ✅');

  // 2) Tambahkan entitlements default untuk tiap plan
  const plans = await prisma.plan.findMany();
  for (const plan of plans) {
    if (plan.code === 'FREE') {
      await prisma.planEntitlement.upsert({
        where: { planId_version: { planId: plan.id, version: 1 } },
        update: {},
        create: {
          planId: plan.id,
          version: 1,
          entitlements: {
            jobs_per_month: 20,
            resetCycle: 'monthly',
          },
        },
      });
    } else if (plan.code === 'PREMIUM') {
      await prisma.planEntitlement.upsert({
        where: { planId_version: { planId: plan.id, version: 1 } },
        update: {},
        create: {
          planId: plan.id,
          version: 1,
          entitlements: {
            jobs_per_month: 200,
            resetCycle: 'monthly',
          },
        },
      });
    } else if (plan.code === 'PRO') {
      await prisma.planEntitlement.upsert({
        where: { planId_version: { planId: plan.id, version: 1 } },
        update: {},
        create: {
          planId: plan.id,
          version: 1,
          entitlements: {
            jobs_per_month: 1000,
            resetCycle: 'monthly',
          },
        },
      });
    }
  }
  console.log('Plan entitlements seeded ✅');

  // 3) Pastikan semua user sudah punya FREE subscription aktif
  const freePlan = await prisma.plan.findUnique({ where: { code: 'FREE' } });
  if (freePlan) {
    const users = await prisma.user.findMany({ select: { id: true } });
    for (const u of users) {
      const already = await prisma.subscription.findFirst({
        where: { userId: u.id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!already) {
        await prisma.subscription.create({
          data: {
            userId: u.id,
            planId: freePlan.id,
            status: 'ACTIVE',
            currentStart: new Date(),
            currentEnd: null,
          },
        });
      }
    }
  }
  console.log('Default subscriptions seeded ✅');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });