import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEntitlementDto } from './dto/create-entitlement.dto';
import { UpdateEntitlementDto } from './dto/update-entitlement.dto';
import { PlanEntitlementValues } from './plan-entitlements.type';

@Injectable()
export class PlanEntitlementsService {
  constructor(private prisma: PrismaService) {}

  // Create new entitlement
  async create(createEntitlementDto: CreateEntitlementDto) {
    const { planId, version, ...entitlementData } = createEntitlementDto;

    // Convert DTO to entitlements JSON
    const entitlements: PlanEntitlementValues = {
      max_processors_per_job: entitlementData.max_processors_per_job,
      max_weight_per_job: entitlementData.max_weight_per_job,
      daily_weight_quota: entitlementData.daily_weight_quota,
      max_video_sec: entitlementData.max_video_sec,
      max_resolution: entitlementData.max_resolution,
      watermark: entitlementData.watermark,
      concurrency: entitlementData.concurrency,
    };

    return this.prisma.planEntitlement.create({
      data: {
        planId,
        version,
        entitlements: entitlements as any,
      },
      include: {
        plan: true,
      },
    });
  }

  // Get all entitlements
  async findAll() {
    return this.prisma.planEntitlement.findMany({
      include: {
        plan: true,
      },
      orderBy: [
        { planId: 'asc' },
        { version: 'desc' },
      ],
    });
  }

  // Get entitlement by ID
  async findOne(id: number) {
    const entitlement = await this.prisma.planEntitlement.findUnique({
      where: { id },
      include: {
        plan: true,
      },
    });

    if (!entitlement) {
      throw new NotFoundException(`Plan entitlement with ID ${id} not found`);
    }

    return entitlement;
  }

  // Get entitlements by plan ID
  async findByPlan(planId: number) {
    return this.prisma.planEntitlement.findMany({
      where: { planId },
      include: {
        plan: true,
      },
      orderBy: { version: 'desc' },
    });
  }

  // Get latest entitlement version for a plan
  async findLatestByPlan(planId: number) {
    const entitlement = await this.prisma.planEntitlement.findFirst({
      where: { planId },
      include: {
        plan: true,
      },
      orderBy: { version: 'desc' },
    });

    if (!entitlement) {
      throw new NotFoundException(`No entitlements found for plan ${planId}`);
    }

    return entitlement;
  }

  // Update entitlement
  async update(id: number, updateEntitlementDto: UpdateEntitlementDto) {
    const existingEntitlement = await this.findOne(id);
    
    const { planId, version, ...entitlementUpdates } = updateEntitlementDto;

    // Merge existing entitlements with updates
    const currentEntitlements = existingEntitlement.entitlements as PlanEntitlementValues;
    const updatedEntitlements: PlanEntitlementValues = {
      ...currentEntitlements,
      ...(entitlementUpdates.max_processors_per_job !== undefined && { 
        max_processors_per_job: entitlementUpdates.max_processors_per_job 
      }),
      ...(entitlementUpdates.max_weight_per_job !== undefined && { 
        max_weight_per_job: entitlementUpdates.max_weight_per_job 
      }),
      ...(entitlementUpdates.daily_weight_quota !== undefined && { 
        daily_weight_quota: entitlementUpdates.daily_weight_quota 
      }),
      ...(entitlementUpdates.max_video_sec !== undefined && { 
        max_video_sec: entitlementUpdates.max_video_sec 
      }),
      ...(entitlementUpdates.max_resolution !== undefined && { 
        max_resolution: entitlementUpdates.max_resolution 
      }),
      ...(entitlementUpdates.watermark !== undefined && { 
        watermark: entitlementUpdates.watermark 
      }),
      ...(entitlementUpdates.concurrency !== undefined && { 
        concurrency: entitlementUpdates.concurrency 
      }),
    };

    return this.prisma.planEntitlement.update({
      where: { id },
      data: {
        ...(planId !== undefined && { planId }),
        ...(version !== undefined && { version }),
        entitlements: updatedEntitlements as any,
      },
      include: {
        plan: true,
      },
    });
  }

  // Delete entitlement
  async remove(id: number) {
    await this.findOne(id); // Check if exists

    return this.prisma.planEntitlement.delete({
      where: { id },
    });
  }
}