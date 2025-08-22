import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { UpsertEntitlementDto } from './dto/upsert-entitlement.dto';
import { LinkFeatureDto, FeatureStatusDto } from './dto/link-feature.dto';
import { FeatureStatus } from '@prisma/client';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('plans')
export class PlansController {
  constructor(private readonly svc: PlansService) {}

  // CREATE
  @Public()
  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.svc.create(dto);
  }

  // LIST
  @Public()
  @Get()
  findAll(@Query('q') q?: string, @Query('skip') skip = '0', @Query('take') take = '20') {
    return this.svc.findAll({ q, skip: Number(skip), take: Number(take) });
  }

  // DETAIL
  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  // UPDATE
  @Public()
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanDto) {
    return this.svc.update(id, dto);
  }

  // DELETE
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // UPSERT ENTITLEMENT (JSON bebas)
  @Public()
  @Post(':id/entitlements')
  upsertEntitlement(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertEntitlementDto & Record<string, any>,
  ) {
    // sisihkan field version, sisanya adalah payload JSON
    const { version, ...rest } = dto;
    return this.svc.upsertEntitlement(id, version, rest);
  }

  // LINK FEATURE
  @Public()
  @Post(':id/features')
  linkFeature(@Param('id', ParseIntPipe) id: number, @Body() dto: LinkFeatureDto) {
    const status = dto.status as FeatureStatusDto;
    return this.svc.linkFeature(id, dto.featureId, status as unknown as FeatureStatus);
  }

  // UNLINK FEATURE
  @Public()
  @Delete(':id/features/:featureId')
  unlinkFeature(
    @Param('id', ParseIntPipe) id: number,
    @Param('featureId', ParseIntPipe) featureId: number,
  ) {
    return this.svc.unlinkFeature(id, featureId);
  }
}