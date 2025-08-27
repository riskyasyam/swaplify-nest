import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaAssetsModule } from 'src/media-assets/media-assets.module';
import { SubscriptionModule } from 'src/common/subscription/subscription.module';
import { NsqModule } from '../nsq/nsq.module';

@Module({
  imports: [ConfigModule, PrismaModule, MediaAssetsModule, SubscriptionModule, NsqModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService], // kalau mau dipakai di module lain
})
export class JobsModule {}