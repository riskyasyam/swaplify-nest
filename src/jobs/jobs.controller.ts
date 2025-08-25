import {
  Controller, Post, Body, Req, BadRequestException,
  UseInterceptors, UploadedFiles, Get, Param
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { MediaType } from '@prisma/client';
import { JobsService } from './jobs.service';
import { MediaAssetsService } from 'src/media-assets/media-assets.service';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly media: MediaAssetsService,
  ) {}

  // GET /jobs - Get all jobs for current user
  @Get()
  async getAllJobs(@Req() req: any) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated');
    }
    return this.jobs.findAll(req.user.id);
  }

  // GET /jobs/:id - Get specific job by ID
  @Get(':id')
  async getJobById(@Param('id') jobId: string, @Req() req: any) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated');
    }
    return this.jobs.findOne(jobId, req.user.id);
  }

  // POST /jobs/:id/process - Process job langsung sampai complete
  @Post(':id/process')
  async processJob(@Param('id') jobId: string, @Req() req: any) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated');
    }
    return this.jobs.processJobDirectly(jobId, req.user.id);
  }

  // POST /jobs/facefusion/:id/callback/done - Callback dari FastAPI worker (SUCCESS)
  @Public() // ✅ Allow callback without authentication
  @Post('facefusion/:id/callback/done')
  async facefusionCallbackDone(
    @Param('id') jobId: string,
    @Body() payload: { output_key: string },
    @Req() req: any
  ) {
    // Validasi worker secret
    const workerSecret = req.headers['x-worker-secret'];
    if (workerSecret !== process.env.WORKER_SHARED_SECRET) {
      throw new BadRequestException('Invalid worker secret');
    }
    
    return this.jobs.handleFaceFusionSuccess(jobId, payload.output_key);
  }

  // POST /jobs/facefusion/:id/callback/failed - Callback dari FastAPI worker (FAILED)
  @Public() // ✅ Allow callback without authentication
  @Post('facefusion/:id/callback/failed')
  async facefusionCallbackFailed(
    @Param('id') jobId: string,
    @Body() payload: { error: string },
    @Req() req: any
  ) {
    // Validasi worker secret
    const workerSecret = req.headers['x-worker-secret'];
    if (workerSecret !== process.env.WORKER_SHARED_SECRET) {
      throw new BadRequestException('Invalid worker secret');
    }
    
    return this.jobs.handleFaceFusionFailure(jobId, payload.error);
  }

  // POST /jobs/:id/manual-complete - Manual completion untuk stuck jobs (DEBUG)
  @Post(':id/manual-complete')
  async manualCompleteJob(@Param('id') jobId: string, @Req() req: any) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated');
    }
    return this.jobs.manualCompleteJob(jobId, req.user.id);
  }

  @Post('uploaded')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'source', maxCount: 1 },
    { name: 'target', maxCount: 1 },
    { name: 'audio',  maxCount: 1 },
  ]))
  async createUploaded(
    @UploadedFiles() files: Record<string, Express.Multer.File[]>,
    @Body('processors') processorsRaw: string,
    @Req() req: any,
    @Body('options') optionsRaw?: string, // optional LAST
  ) {
    // Pastikan user sudah login
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated');
    }
    
    const userId: string = req.user.id;

    const source = files?.source?.[0];
    const target = files?.target?.[0];
    const audio  = files?.audio?.[0];
    if (!source || !target) throw new BadRequestException('source & target are required');

    const toType = (mime: string): MediaType => {
      if (mime.startsWith('image/')) return 'IMAGE';
      if (mime.startsWith('video/')) return 'VIDEO';
      if (mime.startsWith('audio/')) return 'AUDIO';
      throw new BadRequestException(`Unsupported mime: ${mime}`);
    };

    // upload -> dapat asset id
    const s = await this.media.createFromUpload({ userId, file: source, type: toType(source.mimetype) });
    const t = await this.media.createFromUpload({ userId, file: target, type: toType(target.mimetype) });
    const a = audio ? await this.media.createFromUpload({ userId, file: audio, type: toType(audio.mimetype) }) : null;

    // parse processors & options (dari form-data string)
    let processors: string[];
    try {
      processors = JSON.parse(processorsRaw);
      if (!Array.isArray(processors)) throw new Error();
    } catch {
      throw new BadRequestException('processors must be a JSON array string, e.g. ["face_swapper"]');
    }

    let options: any = {};
    if (optionsRaw) {
      try { options = JSON.parse(optionsRaw); }
      catch { throw new BadRequestException('options must be a JSON object string'); }
    }

    return this.jobs.create({
      userId,
      sourceAssetId: s.id,
      targetAssetId: t.id,
      audioAssetId: a?.id,
      processors,
      options,
    });
  }

  @Post('uploaded-process')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'source', maxCount: 1 },
    { name: 'target', maxCount: 1 },
    { name: 'audio',  maxCount: 1 },
  ]))
  async createUploadedAndProcess(
    @UploadedFiles() files: Record<string, Express.Multer.File[]>,
    @Body('processors') processorsRaw: string,
    @Req() req: any,
    @Body('options') optionsRaw?: string,
  ) {
    // Pastikan user sudah login
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated');
    }
    
    const userId: string = req.user.id;

    const source = files?.source?.[0];
    const target = files?.target?.[0];
    const audio  = files?.audio?.[0];
    if (!source || !target) throw new BadRequestException('source & target are required');

    const toType = (mime: string): MediaType => {
      if (mime.startsWith('image/')) return 'IMAGE';
      if (mime.startsWith('video/')) return 'VIDEO';
      if (mime.startsWith('audio/')) return 'AUDIO';
      throw new BadRequestException(`Unsupported mime: ${mime}`);
    };

    // upload -> dapat asset id
    const s = await this.media.createFromUpload({ userId, file: source, type: toType(source.mimetype) });
    const t = await this.media.createFromUpload({ userId, file: target, type: toType(target.mimetype) });
    const a = audio ? await this.media.createFromUpload({ userId, file: audio, type: toType(audio.mimetype) }) : null;

    // parse processors & options (dari form-data string)
    let processors: string[];
    try {
      processors = JSON.parse(processorsRaw);
      if (!Array.isArray(processors)) throw new Error();
    } catch {
      throw new BadRequestException('processors must be a JSON array string, e.g. ["face_swapper"]');
    }

    let options: any = {};
    if (optionsRaw) {
      try { options = JSON.parse(optionsRaw); }
      catch { throw new BadRequestException('options must be a JSON object string'); }
    }

    // Create job
    const job = await this.jobs.create({
      userId,
      sourceAssetId: s.id,
      targetAssetId: t.id,
      audioAssetId: a?.id,
      processors,
      options,
    });

    // Process job langsung sampai selesai
    return this.jobs.processJobDirectly(job.id, userId);
  }
}