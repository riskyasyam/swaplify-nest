import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaAssetsModule } from 'src/media-assets/media-assets.module';
import { SubscriptionModule } from 'src/common/subscription/subscription.module';

@Module({
  imports: [PrismaModule, MediaAssetsModule, SubscriptionModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService], // kalau mau dipakai di module lain
})
export class JobsModule {}