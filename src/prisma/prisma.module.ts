import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // biar bisa dipakai di semua module tanpa import berulang
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}