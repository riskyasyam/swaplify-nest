// src/user/user.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { Prisma, User } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getUserQuota(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        subscriptions: {
          where: { isActive: true },
          orderBy: { startedAt: 'desc' }, // kalau ada banyak, ambil yg terbaru
          take: 1,
          select: {
            plan: {
              select: {
                name: true,
                maxProcessors: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return { error: 'User not found' };
    }

    const activeSub = user.subscriptions[0];
    return {
      userId: user.id,
      email: user.email,
      planName: activeSub?.plan.name ?? 'No Plan',
      maxProcessors: activeSub?.plan.maxProcessors ?? 0,
    };
  }
  // Buat user baru (password plain — di-hash di sini)
  async createUser(data: CreateUserDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1) hash password & create user
      const hashedPassword = await bcrypt.hash(data.password, 10);
      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          password: hashedPassword,
          firstName: data.firstName ?? null,
          lastName: data.lastName ?? null,
          picture: data.picture ?? null,
        },
      });

      // 2) pastikan plan FREE ada, kalau belum seed sekalian
      let freePlan = await tx.plan.findUnique({ where: { code: 'FREE' } });
      if (!freePlan) {
        freePlan = await tx.plan.create({
          data: {
            code: 'FREE',
            name: 'Free',
            maxProcessors: 1,
            requestsPerDay: 20,
            priceCents: 0,
          },
        });
      }

      // 3) auto-subscribe FREE (aktif)
      await tx.userSubscription.create({
        data: {
          userId: user.id,
          planId: freePlan.id,
          isActive: true,
          startedAt: new Date(),
        },
      });

      return user; // controller-mu sudah menghapus password sebelum return
    }).catch((e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // unique constraint (email sudah dipakai)
        throw new Error('Email already registered');
      }
      throw e;
    });
  }

  // Update field profil (nama/foto)
  async update(
    id: number,
    data: Partial<Pick<User, 'firstName' | 'lastName' | 'picture'>>,
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  // Pembanding password
  async comparePassword(plain: string, hashed: string) {
    return bcrypt.compare(plain, hashed);
  }

  // List user (sebaiknya tidak expose password)
  async getAllUser() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        picture: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  async deleteUser(id: number) {
    return this.prisma.user.delete({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }
}