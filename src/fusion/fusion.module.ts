import { Module } from '@nestjs/common';
import { FusionController } from './fusion.controller';
import { FusionService } from './fusion.service';
import { S3Service } from 'src/files/s3.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [FusionController],
  providers: [FusionService, S3Service, PrismaService],
})
export class FusionModule {}