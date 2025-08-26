import {
  Controller, Post, UseInterceptors, UploadedFile, Body,
  BadRequestException, Req, UseGuards, Get, Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { MediaAssetsService } from './media-assets.service';
import { MediaType } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PrimeAuthIntrospectionGuard } from 'src/auth/primeauth-introspection.guard';
import { Public } from 'src/common/decorators/public.decorator';

class CreateAssetDto {
  type!: MediaType; // 'IMAGE' | 'VIDEO' | 'AUDIO'
}

@Controller('media-assets')
export class MediaAssetsController {
  constructor(private readonly svc: MediaAssetsService) {}

  @UseGuards(PrimeAuthIntrospectionGuard)
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateAssetDto,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('file is required');
    if (!dto?.type) throw new BadRequestException('type is required');

    const userId: string | undefined = req.user?.id; // <- dari JwtStrategy.validate
    if (!userId) throw new BadRequestException('Invalid user in token');

    return this.svc.createFromUpload({
      userId,
      file,
      type: dto.type,
    });
  }

  // GET /media-assets/:id - Get asset details (for internal use)
  @Public()
  @Get(':id')
  async getAssetById(@Param('id') assetId: string, @Req() req: any) {
    // Validasi internal secret
    const internalSecret = req.headers['x-internal-secret'];
    if (internalSecret !== process.env.INTERNAL_SECRET) {
      throw new BadRequestException('Invalid internal secret');
    }
    
    return this.svc.findById(assetId);
  }
}
