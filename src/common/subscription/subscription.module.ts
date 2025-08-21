import { Module } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [QuotaService],
  exports: [QuotaService], // penting: agar bisa dipakai di module lain
})
export class SubscriptionModule {}