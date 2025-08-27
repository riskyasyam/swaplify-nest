import {
  Controller, Post, Body, Req, BadRequestException,
  UseInterceptors, UploadedFiles, Get, Param, Patch
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

  // PATCH /jobs/:id/callback - Callback dari queue worker
  @Public()
  @Patch(':id/callback')
  async handleWorkerCallback(
    @Param('id') jobId: string,
    @Body() payload: { status: string; progressPct?: number; outputKey?: string; errorMessage?: string },
    @Req() req: any
  ) {
    // Validasi worker secret
    const workerSecret = req.headers['x-worker-secret'];
    if (workerSecret !== process.env.WORKER_SHARED_SECRET) {
      throw new BadRequestException('Invalid worker secret');
    }
    
    console.log(`📞 Worker callback for job ${jobId}:`, payload);
    return this.jobs.handleWorkerCallback(jobId, payload);
  }

  // POST /jobs/:id/internal-status - Internal status update (from queue service)
  @Public()
  @Post(':id/internal-status')
  async updateJobStatusInternal(
    @Param('id') jobId: string,
    @Body() payload: { status: string; progressPct?: number },
    @Req() req: any
  ) {
    // Validasi internal secret
    const internalSecret = req.headers['x-internal-secret'];
    if (internalSecret !== process.env.INTERNAL_SECRET) {
      throw new BadRequestException('Invalid internal secret');
    }
    
    console.log(`🔄 Internal status update for job ${jobId}:`, payload);
    
    const updatedJob = await this.jobs.updateJobStatus(jobId, payload.status, payload.progressPct);
    return { success: true, job: updatedJob };
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

    // Create job dan publish ke NSQ (tidak langsung process)
    const job = await this.jobs.create({
      userId,
      sourceAssetId: s.id,
      targetAssetId: t.id,
      audioAssetId: a?.id,
      processors,
      options,
    });

    console.log(`📤 Job ${job.id} created and sent to NSQ queue for processing`);
    
    // Return job yang sudah dibuat (status QUEUED)
    return {
      ...job,
      message: 'Job created and sent to queue for processing'
    };
  }
}