import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put
} from '@nestjs/common';
import { PlanEntitlementsService } from './plan-entitlements.service';
import { CreateEntitlementDto } from './dto/create-entitlement.dto';
import { UpdateEntitlementDto } from './dto/update-entitlement.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('entitlements')
export class PlanEntitlementsController {
  constructor(private readonly entitlementsService: PlanEntitlementsService) {}

  // Create new entitlement
  @Roles('ADMIN')
  @Post()
  create(@Body() createEntitlementDto: CreateEntitlementDto) {
    return this.entitlementsService.create(createEntitlementDto);
  }

  // Get all entitlements
  @Public()
  @Get()
  findAll() {
    return this.entitlementsService.findAll();
  }

  // Get entitlement by ID
  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.entitlementsService.findOne(id);
  }

  // Get entitlements by plan ID
  @Public()
  @Get('plan/:planId')
  findByPlan(@Param('planId', ParseIntPipe) planId: number) {
    return this.entitlementsService.findByPlan(planId);
  }

  // Get latest entitlement version for a plan
  @Public()
  @Get('plan/:planId/latest')
  findLatestByPlan(@Param('planId', ParseIntPipe) planId: number) {
    return this.entitlementsService.findLatestByPlan(planId);
  }

  // Update entitlement
  @Roles('ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEntitlementDto: UpdateEntitlementDto
  ) {
    return this.entitlementsService.update(id, updateEntitlementDto);
  }

  // Delete entitlement
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.entitlementsService.remove(id);
  }
}