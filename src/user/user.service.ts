import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getUserQuota(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true,
        subscriptions: {
          where: { isActive: true },
          orderBy: { startedAt: 'desc' }, take: 1,
          select: { plan: { select: { name: true, maxProcessors: true, requestsPerDay: true } } },
        },
      },
    });
    if (!user) return { error: 'User not found' };

    // (opsional) hitung usedToday dsb…
    const activeSub = user.subscriptions[0];
    return {
      userId: user.id,
      email: user.email,
      planName: activeSub?.plan.name ?? 'No Plan',
      maxProcessors: activeSub?.plan.maxProcessors ?? 0,
      requestsPerDay: activeSub?.plan.requestsPerDay ?? 0,
    };
  }

  async getAllUser() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
  }

  async deleteUser(id: number) {
    return this.prisma.user.delete({ where: { id } });
  }
}