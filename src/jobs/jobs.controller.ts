import {
  BadRequestException, Body, Controller, Post, Req,
  UseInterceptors, UploadedFiles
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { JobsService } from './jobs.service';
import { MediaAssetsService } from 'src/media-assets/media-assets.service';
import { MediaType } from '@prisma/client';

@Controller('jobs')
export class JobsUploadController {
  constructor(
    private readonly jobs: JobsService,
    private readonly media: MediaAssetsService,
  ) {}

  @Post('uploaded')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'source', maxCount: 1 },
    { name: 'target', maxCount: 1 },
    { name: 'audio',  maxCount: 1 },
  ]))
  async createUploaded(
    @UploadedFiles() files: Record<string, Express.Multer.File[]>,
    @Body('processors') processorsRaw: string | string[],
    @Body('options') optionsRaw: string | undefined,
    @Req() req: any,
  ) {
    const userId: string = req.user?.id ?? req.user?.sub ?? '00000000-0000-0000-0000-000000000001';

    const source = files?.source?.[0];
    const target = files?.target?.[0];
    const audio  = files?.audio?.[0];
    if (!source || !target) throw new BadRequestException('source & target are required');

    // Deteksi MediaType otomatis dari mimetype
    const toType = (mime: string): MediaType => {
      if (mime.startsWith('image/')) return 'IMAGE';
      if (mime.startsWith('video/')) return 'VIDEO';
      if (mime.startsWith('audio/')) return 'AUDIO';
      throw new BadRequestException(`Unsupported mime: ${mime}`);
    };

    const sourceAsset = await this.media.createFromUpload({ userId, file: source, type: toType(source.mimetype) });
    const targetAsset = await this.media.createFromUpload({ userId, file: target, type: toType(target.mimetype) });

    let audioAssetId: string | undefined;
    if (audio) {
      const audioAsset = await this.media.createFromUpload({ userId, file: audio, type: toType(audio.mimetype) });
      audioAssetId = audioAsset.id;
    }

    // Normalisasi processors/options dari string → JSON
    const processors = typeof processorsRaw === 'string' ? JSON.parse(processorsRaw) : processorsRaw;
    const options = optionsRaw ? JSON.parse(optionsRaw) : {};

    const job = await this.jobs.create({
      userId,
      sourceAssetId: sourceAsset.id,
      targetAssetId: targetAsset.id,
      audioAssetId,
      processors,
      options,
    });

    return { jobId: job.id, sourceAssetId: sourceAsset.id, targetAssetId: targetAsset.id, audioAssetId };
  }
}