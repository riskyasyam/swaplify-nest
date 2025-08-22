import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, FeatureStatus } from '@prisma/client';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  // CREATE
  async create(data: { code: string; name: string; priority?: number }) {
    return this.prisma.plan.create({ data });
  }

  // READ (list + pagination + search)
  async findAll(params: { q?: string; skip?: number; take?: number } = {}) {
    const { q, skip = 0, take = 20 } = params;
    const where: Prisma.PlanWhereInput = q
      ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.plan.findMany({ where, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], skip, take }),
      this.prisma.plan.count({ where }),
    ]);
    return { items, total, skip, take };
  }

  // READ (by id)
  async findOne(id: number) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: {
        entitlements: { orderBy: { version: 'desc' } },
        featurePlan: { include: { feature: true } },
      },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  // UPDATE
  async update(id: number, data: { name?: string; priority?: number }) {
    return this.prisma.plan.update({ where: { id }, data });
  }

  // DELETE
  async remove(id: number) {
    // optional: cek dependensi agar tidak pecah FK
    const subCount = await this.prisma.subscription.count({ where: { planId: id } });
    if (subCount > 0) {
      // Bisa pilih: throw error atau lakukan bisnis logic (misal forbid delete)
      throw new Error('Plan has active subscriptions. Reassign or delete subscriptions first.');
    }
    // hapus relasi turunan
    await this.prisma.featurePlan.deleteMany({ where: { planId: id } });
    await this.prisma.planEntitlement.deleteMany({ where: { planId: id } });

    return this.prisma.plan.delete({ where: { id } });
  }

  // ENTITLEMENT upsert
  async upsertEntitlement(id: number, version: number, entitlements: Prisma.InputJsonValue) {
    return this.prisma.planEntitlement.upsert({
      where: { planId_version: { planId: id, version } },
      update: { entitlements },
      create: { planId: id, version, entitlements },
    });
  }

  // FEATURE link/unlink
  async linkFeature(planId: number, featureId: number, status: FeatureStatus) {
    return this.prisma.featurePlan.upsert({
      where: { featureId_planId: { featureId, planId } },
      update: { status },
      create: { featureId, planId, status },
    });
  }
  async unlinkFeature(planId: number, featureId: number) {
    return this.prisma.featurePlan.delete({
      where: { featureId_planId: { featureId, planId } },
    });
  }
}