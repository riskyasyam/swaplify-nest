import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NsqService } from './nsq.service';

@Module({
  imports: [ConfigModule],
  providers: [NsqService],
  exports: [NsqService],
})
export class NsqModule {}
