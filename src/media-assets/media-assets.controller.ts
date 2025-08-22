import {
  Controller, Post, UseInterceptors, UploadedFile, Body, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaAssetsService } from 'src/media-assets/media-assets.service';
import { MediaType } from '@prisma/client';

class CreateAssetDto {
  type!: MediaType; // 'IMAGE' | 'VIDEO' | 'AUDIO'
}

@Controller('media-assets')
export class MediaAssetsController {
  constructor(private readonly svc: MediaAssetsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateAssetDto,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.svc.createFromUpload({ file, type: dto.type });
  }
}