import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { PlanEntitlementsController } from './plan-entitlements.controller';
import { PlanEntitlementsService } from './plan-entitlements.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlansController, PlanEntitlementsController],
  providers: [PlansService, PlanEntitlementsService],
  exports: [PlansService, PlanEntitlementsService],
})
export class PlansModule {}