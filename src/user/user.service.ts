// src/user/user.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  // Buat user baru (password plain — di-hash di sini)
  async createUser(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    picture?: string;
  }): Promise<User> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        picture: data.picture ?? null,
      },
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