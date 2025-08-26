import { Module } from '@nestjs/common';
import { NsqService } from './nsq.service';

@Module({
  providers: [NsqService],
  exports: [NsqService],
})
export class NsqModule {}
