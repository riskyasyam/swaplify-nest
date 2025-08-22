import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: {
    userId: string;
    sourceAssetId: string;
    targetAssetId: string;
    audioAssetId?: string;
    processors: string[];
    options?: any;
  }) {
    // TODO: validasi assetId milik user yg sama
    return this.prisma.job.create({
      data: {
        userId: dto.userId,
        processors: dto.processors,
        options: dto.options ?? {},
        sourceAssetId: dto.sourceAssetId,
        targetAssetId: dto.targetAssetId,
        audioAssetId: dto.audioAssetId,
        status: 'QUEUED',
      },
    });
  }
}