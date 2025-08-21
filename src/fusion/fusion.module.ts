import { Module } from '@nestjs/common';
import { FusionController } from './fusion.controller';
import { FusionService } from './fusion.service';
import { S3Service } from 'src/files/s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FilesModule } from 'src/files/files.module';
import { SubscriptionModule } from 'src/common/subscription/subscription.module';

@Module({
  imports: [PrismaModule, FilesModule, SubscriptionModule],
  controllers: [FusionController],
  providers: [FusionService, S3Service, PrismaService],
})
export class FusionModule {}