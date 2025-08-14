import { Injectable } from '@nestjs/common';
import { User } from 'generated/prisma';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
    constructor(private prisma: PrismaService) {}

    async createUser(data : {email: string, password: string}) {
        const hashedPassword = await bcrypt.hash(data.password, 10);
        return this.prisma.user.create({
            data: {
                email: data.email, 
                password: hashedPassword},
        })
    }

    async getAllUser() {
        return this.prisma.user.findMany({
            select: {
                id: true,
                email: true,
                password: true,
                createdAt: true,
            }
        });
    }

    async deleteUser(id: number) {
        return this.prisma.user.delete({
            where: { id },
        });
    }
}
