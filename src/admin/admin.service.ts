import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrimeAuthService } from 'src/primeauth/primeauth.service';
import { Role } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private prime: PrimeAuthService,
  ) {}

  async createUserInPrimeAuthAndLocal(params: {
    email: string;
    fullName: string;
    password?: string;
    makeAdmin?: boolean;
  }) {
    // 1) Create user di PrimeAuth Identity
    const pa = await this.prime.createIdentityUser({
      email: params.email,
      fullName: params.fullName,
      password: params.password,
      status: 'ACTIVE',
    });

    // Ambil identifier dari response (sesuaikan field-nya)
    const sub =
      pa?.data?.id ?? pa?.id ?? pa?.sub ?? pa?.user?.id ?? null;
    if (!sub) throw new BadRequestException('PrimeAuth did not return user id/sub');

    // 2) Upsert di DB lokal pakai authSub
    const user = await this.prisma.user.upsert({
      where: { authSub: sub },
      update: { email: params.email, displayName: params.fullName },
      create: {
        authSub: sub,
        email: params.email,
        displayName: params.fullName,
        role: params.makeAdmin ? Role.ADMIN : Role.USER,
      },
      select: { id: true, email: true, displayName: true, role: true, authSub: true },
    });

    return { primeauth: pa, user };
  }
}
