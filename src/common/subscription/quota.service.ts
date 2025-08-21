import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/** Hitung awal–akhir bulan aktif (disimpan sebagai DATE di DB) */
function monthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0); // akhir bulan
  return { start, end };
}

@Injectable()
export class QuotaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ambil subscription aktif terbaru + plan + entitlements versi terbaru.
   * (Mengikuti skema baru: status/currentStart/currentEnd, entitlements versi-an JSONB)
   */
  async getActiveSubscription(userId: string) {
    return this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE', currentEnd: null },
      orderBy: { currentStart: 'desc' },
      include: {
        plan: {
          include: {
            entitlements: {
              orderBy: { version: 'desc' },
              take: 1, // hanya versi terbaru
            },
          },
        },
      },
    });
  }

  /** Ambil total pemakaian job bulan berjalan (dari usage_counters.jobs_total) */
  async getMonthlyUsage(userId: string) {
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
    return usage?.jobsTotal ?? 0;
  }

  /** Tambah pemakaian job bulan berjalan (dipanggil saat event yang benar-benar menghabiskan kuota) */
  async incrementMonthlyUsage(userId: string, increment = 1) {
    const { start, end } = monthRange();
    await this.prisma.usageCounter.upsert({
      where: {
        userId_periodStart_periodEnd: {
          userId,
          periodStart: start,
          periodEnd: end,
        },
      },
      update: { jobsTotal: { increment } },
      create: {
        userId,
        periodStart: start,
        periodEnd: end,
        jobsTotal: increment,
      },
    });
  }

  // =========================
  // Opsional: guard kuota by key (kalau entitlements JSON menyimpan limit)
  // =========================

  /**
   * Ambil limit dari entitlements JSON untuk sebuah `key`.
   * Mendukung dua bentuk umum JSON:
   * 1) { "facefusion.jobs_per_month": 100 }
   * 2) { "limits": { "facefusion.jobs_per_month": 100 } }
   */
  private getLimitFromEntitlements(entitlementsJson: any, key: string): number | null {
    if (!entitlementsJson || typeof entitlementsJson !== 'object') return null;

    // Bentuk 1
    if (Object.prototype.hasOwnProperty.call(entitlementsJson, key)) {
      const v = entitlementsJson[key];
      return typeof v === 'number' ? v : null;
    }
    // Bentuk 2
    if (entitlementsJson.limits && typeof entitlementsJson.limits === 'object') {
      const v = entitlementsJson.limits[key];
      return typeof v === 'number' ? v : null;
    }
    return null;
  }

  /**
   * Pastikan user masih dalam kuota bulanan untuk key tertentu.
   * - Tidak ada subscription aktif -> Forbidden
   * - Entitlement tidak ada / limit null -> dianggap unlimited
   * - jobsTotal >= limit -> Forbidden
   */
  async assertWithinMonthlyQuota(userId: string, key: string) {
    const sub = await this.getActiveSubscription(userId);
    if (!sub?.plan) {
      throw new ForbiddenException('No active subscription');
    }

    const latestEnt = sub.plan.entitlements[0]; // karena sudah take:1 (versi terbaru)
    const limit = this.getLimitFromEntitlements(latestEnt?.entitlements, key);

    // Tidak didefinisikan atau unlimited -> lolos
    if (limit == null) return;

    const used = await this.getMonthlyUsage(userId);
    if (used >= limit) {
      throw new ForbiddenException(`Quota exceeded for ${key}`);
    }
  }

  /**
   * Ringkasan kuota bulanan (untuk UI/diagnostik).
   * Mengembalikan plan aktif + jobsTotal bulan ini + limit (jika tersedia) untuk `key`.
   */
  async getMonthlyQuotaSummary(userId: string, key: string) {
    const sub = await this.getActiveSubscription(userId);
    const { start, end } = monthRange();

    if (!sub?.plan) {
      return {
        plan: null,
        period: { start, end },
        key,
        used: 0,
        limit: null,
        remaining: null,
      };
    }

    const latestEnt = sub.plan.entitlements[0];
    const limit = this.getLimitFromEntitlements(latestEnt?.entitlements, key);

    const used = await this.getMonthlyUsage(userId);
    const remaining = limit == null ? null : Math.max(0, limit - used);

    return {
      plan: {
        code: sub.plan.code,
        name: sub.plan.name,
        // kalau butuh billingCycle/priority, expose di sini juga
      },
      period: { start, end },
      key,
      used,
      limit,
      remaining,
    };
  }
}