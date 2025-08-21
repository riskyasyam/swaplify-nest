import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

function monthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start, end };
}

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  /**
   * Kuota user (ringkas):
   * {
   *   userId, email, displayName,
   *   plan: { code, name, priority } | null,
   *   jobsThisMonth: number,
   *   planEntitlements: Json | null // versi terbaru
   * }
   */
  async getUserQuota(userId: string) {
    // subscription aktif terbaru + plan + entitlements versi terbaru
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE', currentEnd: null },
      orderBy: { currentStart: 'desc' },
      include: {
        plan: {
          include: {
            entitlements: {
              orderBy: { version: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    // info user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) return { error: 'User not found' };

    // usage bulan berjalan
    const { start, end } = monthRange();
    const usage = await this.prisma.usageCounter.findUnique({
      where: {
        userId_periodStart_periodEnd: {
          userId,
          periodStart: start,
          periodEnd: end,
        },
      },
      select: { jobsTotal: true },
    });

    // entitlements JSON versi terbaru (jika ada)
    const entJson = sub?.plan?.entitlements?.[0]?.entitlements ?? null;

    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      plan: sub
        ? {
            code: sub.plan.code,
            name: sub.plan.name,
            priority: sub.plan.priority,
          }
        : null,
      jobsThisMonth: usage?.jobsTotal ?? 0,
      planEntitlements: entJson,
    };
  }

  async getAllUser() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deleteUser(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }
}