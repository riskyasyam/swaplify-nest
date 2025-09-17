import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, FeatureStatus, FeatureType } from '@prisma/client';

@Injectable()
export class FeaturesService {
  constructor(private prisma: PrismaService) {}

  // CREATE (value selalu string; default-kan ke '' bila undefined)
  create(data: { 
    name: string; 
    value?: string; 
    type: FeatureType; 
    status: FeatureStatus; 
    weight: number;
    category?: string;
  }) {
    return this.prisma.feature.create({
      data: {
        name: data.name,
        value: data.value ?? '',     // ← Opsi A: fallback ke string kosong
        type: data.type,
        status: data.status,
        weight: data.weight,
        category: data.category
      },
    });
  }

  // LIST + filter + pagination
  async findAll(params: {
    q?: string;
    type?: FeatureType;
    status?: FeatureStatus;
    skip?: number;
    take?: number;
  } = {}) {
    const { q, type, status, skip = 0, take = 20 } = params;

    const where: Prisma.FeatureWhereInput = {
      AND: [
        q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { value: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {},
        type ? { type } : {},
        status ? { status } : {},
      ],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.feature.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.feature.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  // DETAIL
  async findOne(id: number) {
    const feature = await this.prisma.feature.findUnique({
      where: { id },
      include: { plans: true }, // relasi ke FeaturePlan
    });
    if (!feature) throw new NotFoundException('Feature not found');
    return feature;
  }

  // UPDATE (value & status opsional)
  update(
    id: number,
    data: {
      name?: string;
      value?: string;
      type?: FeatureType;
      status?: FeatureStatus;
      weight?: number;
      category?: string;
    },
  ) {
    return this.prisma.feature.update({
      where: { id },
      data,
    });
  }

  // DELETE
  async remove(id: number) {
    // hapus link ke plan dulu (FK)
    await this.prisma.featurePlan.deleteMany({ where: { featureId: id } });
    return this.prisma.feature.delete({ where: { id } });
  }

  findAllRaw() {
    return this.prisma.feature.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get only core processors (main processors like face_swapper, face_enhancer)
  async findProcessors() {
    return this.prisma.feature.findMany({
      where: { type: 'processor' },
      orderBy: { weight: 'desc' }, // heaviest first
    });
  }

  // Get only processor options (models, blend values, etc.)
  async findProcessorOptions() {
    return this.prisma.feature.findMany({
      where: { type: 'processor_option' },
      orderBy: { name: 'asc' },
    });
  }

  // Get processor options by category (for frontend dropdowns)
  async findProcessorOptionsByCategory(category: string) {
    return this.prisma.feature.findMany({
      where: { 
        type: 'processor_option',
        category: category
      },
      orderBy: { value: 'asc' },
    });
  }

  // Get all available model categories
  async findModelCategories() {
    const result = await this.prisma.feature.findMany({
      where: { 
        type: 'processor_option',
        category: { not: null }
      },
      select: { category: true },
      distinct: ['category'],
    });
    
    return result.map(item => item.category).filter(Boolean);
  }

  // Get only general features (non-processor related)
  async findGeneralFeatures() {
    return this.prisma.feature.findMany({
      where: { type: 'feature' },
      orderBy: { name: 'asc' },
    });
  }

  // Get processors with their related options
  async findProcessorsWithOptions() {
    const processors = await this.findProcessors();
    const options = await this.findProcessorOptions();
    
    return processors.map(processor => ({
      ...processor,
      options: options.filter(option => 
        option.name.startsWith(processor.name.replace('_', ''))
      )
    }));
  }
}
