// plans.controller.ts
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    return this.prisma.plan.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        maxProcessors: true,
        requestsPerDay: true,
        priceCents: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
    });
  }
}