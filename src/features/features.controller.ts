import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query
} from '@nestjs/common';
import { FeaturesService } from './features.service';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { UpdateFeatureDto } from './dto/update-feature.dto';
import { FeatureStatus, FeatureType } from '@prisma/client';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('features')
export class FeaturesController {
  constructor(private readonly svc: FeaturesService) {}

  // CREATE
  @Public()
  @Post()
  create(@Body() dto: CreateFeatureDto) {
    return this.svc.create(dto);
  }

  // LIST: ?q=&type=&status=&skip=&take=
  @Public()
  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('type') type?: FeatureType,
    @Query('status') status?: FeatureStatus,
    @Query('skip') skip = '0',
    @Query('take') take = '20',
  ) {
    return this.svc.findAll({
      q,
      type: (type as FeatureType) || undefined,
      status: (status as FeatureStatus) || undefined,
      skip: Number(skip),
      take: Number(take),
    });
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
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFeatureDto) {
    return this.svc.update(id, dto);
  }

  // DELETE
  @Public()
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

}
