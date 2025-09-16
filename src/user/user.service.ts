import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from '@prisma/client';
import { UpdateUserSubscriptionDto, UpdateUserRoleDto, UpdateUserProfileDto } from './dto/update-user-subscription.dto';

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

  /**
   * Get all users with their subscription details (for admin subscription management)
   */
  async getAllUsersWithSubscriptions() {
    const users = await this.prisma.user.findMany({
      include: {
        subscriptions: {
          where: { status: 'ACTIVE', currentEnd: null },
          include: {
            plan: {
              include: {
                entitlements: {
                  orderBy: { version: 'desc' },
                  take: 1
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform data untuk frontend table
    return users.map(user => {
      const activeSubscription = user.subscriptions[0] || null;
      
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
        subscription: activeSubscription ? {
          id: activeSubscription.id,
          planCode: activeSubscription.plan.code,
          planName: activeSubscription.plan.name,
          planPriority: activeSubscription.plan.priority,
          status: activeSubscription.status,
          currentStart: activeSubscription.currentStart,
          billingRef: activeSubscription.billingRef,
          entitlements: activeSubscription.plan.entitlements[0]?.entitlements || null,
          // Monthly usage info dengan type safety
          planLimits: (() => {
            const entitlements = activeSubscription.plan.entitlements[0]?.entitlements as any;
            return {
              monthlyJobs: entitlements?.monthlyJobs || 0,
              storageGB: entitlements?.storageGB || 0,
              concurrentJobs: entitlements?.concurrentJobs || 1
            };
          })()
        } : {
          // User tanpa subscription aktif
          id: null,
          planCode: 'FREE',
          planName: 'Free Plan',
          planPriority: 0,
          status: 'INACTIVE',
          currentStart: null,
          billingRef: null,
          entitlements: null,
          planLimits: {
            monthlyJobs: 0,
            storageGB: 0,
            concurrentJobs: 0
          }
        }
      };
    });
  }

  async deleteUser(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }

  // ============= CRUD SUBSCRIPTION MANAGEMENT =============

  /**
   * Update user subscription plan
   */
  async updateUserSubscription(userId: string, dto: UpdateUserSubscriptionDto) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Support both 'plan' and 'planCode' fields
    const planCode = dto.plan || dto.planCode;
    if (!planCode) {
      throw new BadRequestException('Either plan or planCode must be provided');
    }

    // Check if plan exists
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new BadRequestException(`Plan ${planCode} not found`);

    // Update subscription status if provided
    const updateData: any = {};
    if (dto.status) {
      updateData.status = dto.status;
      if (dto.status === 'CANCELLED' || dto.status === 'PAST_DUE') {
        updateData.currentEnd = new Date();
      }
    }

    // End current active subscription if changing plan
    await this.prisma.subscription.updateMany({
      where: { userId, status: 'ACTIVE', currentEnd: null },
      data: { status: 'CANCELLED', currentEnd: new Date() }
    });

    // Create new subscription
    const newSubscription = await this.prisma.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: dto.status || 'ACTIVE',
        currentStart: new Date(),
        currentEnd: dto.status === 'CANCELLED' || dto.status === 'PAST_DUE' ? new Date() : null,
        billingRef: dto.billingRef || null,
      },
      include: {
        plan: {
          include: {
            entitlements: {
              orderBy: { version: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    return {
      message: `User subscription updated to ${dto.planCode}`,
      subscription: newSubscription
    };
  }

  /**
   * Update user role (ADMIN only)
   */
  async updateUserRole(userId: string, dto: UpdateUserRoleDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { role: dto.role as Role },
      select: { id: true, email: true, displayName: true, role: true }
    });

    return {
      message: `User role updated to ${dto.role}`,
      user: updatedUser
    };
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, dto: UpdateUserProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.email && { email: dto.email }),
        ...(dto.displayName && { displayName: dto.displayName }),
      },
      select: { id: true, email: true, displayName: true, role: true }
    });

    return {
      message: 'User profile updated',
      user: updatedUser
    };
  }

  /**
   * Get user with full subscription details
   */
  async getUserWithSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: {
          where: { status: 'ACTIVE', currentEnd: null },
          include: {
            plan: {
              include: {
                entitlements: {
                  orderBy: { version: 'desc' },
                  take: 1
                }
              }
            }
          }
        }
      }
    });

    if (!user) throw new NotFoundException('User not found');

    const activeSubscription = user.subscriptions[0] || null;
    
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
      subscription: activeSubscription ? {
        id: activeSubscription.id,
        planCode: activeSubscription.plan.code,
        planName: activeSubscription.plan.name,
        status: activeSubscription.status,
        currentStart: activeSubscription.currentStart,
        billingRef: activeSubscription.billingRef,
        entitlements: activeSubscription.plan.entitlements[0]?.entitlements || null
      } : null
    };
  }

  /**
   * Get all available plans
   */
  async getAllPlans() {
    return this.prisma.plan.findMany({
      include: {
        entitlements: {
          orderBy: { version: 'desc' },
          take: 1
        }
      },
      orderBy: { priority: 'asc' }
    });
  }

  /**
   * Get current user profile (display name, role) - for bearer token endpoints
   */
  async getCurrentUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true
      }
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt
    };
  }

  /**
   * Get current user's subscription and entitlements - for bearer token endpoints
   */
  async getCurrentUserSubscription(userId: string) {
    // Get user basic info
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true
      }
    });

    if (!user) throw new NotFoundException('User not found');

    // Get active subscription with plan and entitlements
    const subscription = await this.prisma.subscription.findFirst({
      where: { 
        userId, 
        status: 'ACTIVE', 
        currentEnd: null 
      },
      orderBy: { currentStart: 'desc' },
      include: {
        plan: {
          include: {
            entitlements: {
              orderBy: { version: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    // Get usage for current month
    const { start, end } = monthRange();
    const usage = await this.prisma.usageCounter.findUnique({
      where: {
        userId_periodStart_periodEnd: {
          userId,
          periodStart: start,
          periodEnd: end,
        },
      },
      select: { jobsTotal: true }
    });

    const result = {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      },
      subscription: subscription ? {
        id: subscription.id,
        planCode: subscription.plan.code,
        planName: subscription.plan.name,
        planPriority: subscription.plan.priority,
        status: subscription.status,
        currentStart: subscription.currentStart,
        currentEnd: subscription.currentEnd,
        billingRef: subscription.billingRef,
        entitlements: subscription.plan.entitlements[0]?.entitlements || null,
        // Extract key entitlements for easy access
        planLimits: (() => {
          const entitlements = subscription.plan.entitlements[0]?.entitlements as any;
          return {
            monthlyJobs: entitlements?.monthlyJobs || 0,
            storageGB: entitlements?.storageGB || 0,
            concurrentJobs: entitlements?.concurrentJobs || 1,
            features: entitlements?.features || []
          };
        })()
      } : {
        // User without active subscription
        id: null,
        planCode: 'FREE',
        planName: 'Free Plan',
        planPriority: 0,
        status: 'INACTIVE',
        currentStart: null,
        currentEnd: null,
        billingRef: null,
        entitlements: null,
        planLimits: {
          monthlyJobs: 0,
          storageGB: 0,
          concurrentJobs: 0,
          features: []
        }
      },
      usage: {
        currentMonth: {
          jobsUsed: usage?.jobsTotal || 0,
          period: {
            start: start.toISOString(),
            end: end.toISOString()
          }
        }
      }
    };

    return result;
  }
}