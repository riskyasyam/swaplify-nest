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

  // GET /jobs/capabilities - Get available processors and options
  @Get('capabilities')
  async getCapabilities() {
    return {
      processors: {
        face_swapper: {
          name: 'Face Swap',
          category: 'core',
          description: 'Swap faces between source and target',
          requiresModel: false,
          defaultModel: 'inswapper_128',
          models: ['blendswap_256', 'inswapper_128', 'inswapper_128_fp16', 'simswap_256', 'simswap_512', 'uniface_256'],
          options: {
            faceSwapperPixelBoost: {
              type: 'select',
              options: ['1x', '2x', '4x'],
              default: '1x'
            }
          }
        },
        face_enhancer: {
          name: 'Face Enhancement',
          category: 'enhancement',
          description: 'Improve face quality and clarity',
          requiresModel: true,
          models: ['codeformer', 'gfpgan_1.2', 'gfpgan_1.3', 'gfpgan_1.4', 'gpen_bfr_256', 'gpen_bfr_512', 'gpen_bfr_1024', 'gpen_bfr_2048', 'restoreformer_plus_plus'],
          options: {
            faceEnhancerBlend: {
              type: 'range',
              min: 0,
              max: 100,
              default: 50,
              description: 'Enhancement strength percentage'
            }
          }
        },
        frame_enhancer: {
          name: 'Frame Enhancement',
          category: 'enhancement',
          description: 'Upscale and enhance overall image/video quality',
          requiresModel: true,
          models: ['real_esrgan_x2plus', 'real_esrgan_x4plus', 'real_esrgan_x4plus_anime_6b', 'real_hatgan_x4'],
          options: {
            frameEnhancerBlend: {
              type: 'range',
              min: 0,
              max: 100,
              default: 80,
              description: 'Enhancement blend percentage'
            }
          }
        },
        age_modifier: {
          name: 'Age Modification',
          category: 'creative',
          description: 'Make faces appear younger or older',
          requiresModel: false,
          options: {
            ageModifierDirection: {
              type: 'range',
              min: -20,
              max: 20,
              default: 0,
              description: 'Age change in years (negative = younger, positive = older)'
            }
          }
        },
        expression_restorer: {
          name: 'Expression Restore',
          category: 'enhancement',
          description: 'Restore natural facial expressions',
          requiresModel: false,
          defaultModel: 'live_portrait',
          models: ['live_portrait'],
          options: {
            expressionRestorerFactor: {
              type: 'range',
              min: 0,
              max: 100,
              default: 80,
              description: 'Expression restoration strength'
            }
          }
        },
        face_editor: {
          name: 'Face Editor',
          category: 'creative',
          description: 'Fine-tune facial features and expressions',
          requiresModel: false,
          defaultModel: 'live_portrait',
          models: ['live_portrait'],
          options: {
            faceEditorParams: {
              type: 'object',
              properties: {
                eyeOpenRatio: { type: 'range', min: 0, max: 2, default: 1, description: 'Eye openness' },
                mouthSmile: { type: 'range', min: -1, max: 1, default: 0, description: 'Smile intensity' },
                headYaw: { type: 'range', min: -30, max: 30, default: 0, description: 'Head rotation left/right' },
                headPitch: { type: 'range', min: -30, max: 30, default: 0, description: 'Head tilt up/down' },
                headRoll: { type: 'range', min: -30, max: 30, default: 0, description: 'Head roll left/right' }
              }
            }
          }
        },
        frame_colorizer: {
          name: 'Frame Colorizer',
          category: 'creative',
          description: 'Colorize black and white videos',
          requiresModel: true,
          defaultModel: 'deoldify',
          models: ['deoldify', 'instacolor'],
          options: {
            frameColorizerBlend: {
              type: 'range',
              min: 0,
              max: 100,
              default: 80,
              description: 'Colorization strength'
            }
          }
        },
        lip_syncer: {
          name: 'Lip Sync',
          category: 'creative',
          description: 'Synchronize lips with audio',
          requiresModel: true,
          defaultModel: 'wav2lip_gan',
          models: ['wav2lip', 'wav2lip_gan'],
          options: {
            lipSyncerWeight: {
              type: 'range',
              min: 0,
              max: 2,
              default: 1,
              description: 'Lip sync strength'
            }
          }
        },
        deep_swapper: {
          name: 'Deep Swapper',
          category: 'core',
          description: 'Advanced face swapping with deep learning',
          requiresModel: true,
          defaultModel: 'deepface_lab',
          models: ['deepface_lab', 'simswap_512'],
          options: {
            deepSwapperMorph: {
              type: 'range',
              min: 0,
              max: 100,
              default: 80,
              description: 'Morphing strength'
            }
          }
        },
        face_debugger: {
          name: 'Face Debugger',
          category: 'debug',
          description: 'Debug face detection and processing',
          requiresModel: false,
          options: {
            faceDebuggerItems: {
              type: 'multiselect',
              options: ['bbox', 'landmark', 'face-mask'],
              default: 'bbox,landmark',
              description: 'Debug overlay items'
            }
          }
        }
      },
      globalOptions: {
        hardware: {
          useCuda: {
            type: 'boolean',
            default: true,
            description: 'Use GPU acceleration (if available)'
          },
          deviceId: {
            type: 'string',
            default: '0',
            description: 'GPU device ID'
          }
        },
        faceSelection: {
          faceSelectorMode: {
            type: 'select',
            options: ['reference', 'one', 'many', 'best-worst', 'left-right'],
            default: 'automatic',
            description: 'How to select faces'
          },
          faceSelectorGender: {
            type: 'select',
            options: ['any', 'male', 'female'],
            default: 'any',
            description: 'Filter faces by gender'
          },
          faceSelectorAgeStart: {
            type: 'range',
            min: 0,
            max: 100,
            default: 0,
            description: 'Minimum age to process'
          },
          faceSelectorAgeEnd: {
            type: 'range',
            min: 0,
            max: 100,
            default: 100,
            description: 'Maximum age to process'
          }
        },
        output: {
          outputVideoQuality: {
            type: 'range',
            min: 10,
            max: 100,
            default: 80,
            description: 'Video quality percentage'
          },
          outputVideoEncoder: {
            type: 'select',
            options: ['libx264', 'libx265', 'libvpx-vp9', 'h264_nvenc', 'hevc_nvenc'],
            default: 'libx264',
            description: 'Video encoder'
          },
          outputVideoPreset: {
            type: 'select',
            options: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'],
            default: 'medium',
            description: 'Encoding speed vs quality'
          }
        }
      },
      usagePatterns: {
        beginner: {
          name: 'Simple Face Swap',
          processors: ['face_swapper'],
          description: 'Basic face swapping with default settings'
        },
        intermediate: {
          name: 'Enhanced Quality',
          processors: ['face_swapper', 'face_enhancer'],
          description: 'Face swap with quality enhancement'
        },
        creative: {
          name: 'Creative Editing',
          processors: ['face_swapper', 'face_editor', 'age_modifier'],
          description: 'Face swap with creative modifications'
        },
        professional: {
          name: 'Professional Pipeline',
          processors: ['face_swapper', 'face_enhancer', 'expression_restorer', 'frame_enhancer'],
          description: 'Complete processing pipeline for best quality'
        }
      }
    };
  }

  // GET /jobs/quota-today - Get user's daily quota usage for today
  @Get('quota-today')
  async getQuotaToday(@Req() req: any) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated');
    }
    // Get today's usage
    const today = new Date();
    const periodStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const periodEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const usage = await this.jobs["prisma"].usageCounter.findUnique({
      where: { userId_periodStart_periodEnd: { userId: req.user.id, periodStart, periodEnd } },
    });
    // Get plan's daily quota
    const subscription = await this.jobs["prisma"].subscription.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' },
      include: { plan: { include: { entitlements: { orderBy: { version: 'desc' }, take: 1 } } } },
    });
    const ent = subscription?.plan?.entitlements?.[0]?.entitlements;
    // ent is JSON, so cast to PlanEntitlementValues
    const entValues = ent as import('../plans/plan-entitlements.type').PlanEntitlementValues;
    const dailyQuota = entValues?.daily_weight_quota ?? null;
    return {
      jobsTotal: usage?.jobsTotal ?? 0,
      daily_weight_quota: dailyQuota,
      remaining: dailyQuota != null ? Math.max(0, dailyQuota - (usage?.jobsTotal ?? 0)) : null
    };
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

  // GET /jobs/:id/internal - Get job details (for internal use)
  @Public()
  @Get(':id/internal')
  async getJobByIdInternal(@Param('id') jobId: string, @Req() req: any) {
    // Validasi internal secret
    const internalSecret = req.headers['x-internal-secret'];
    if (internalSecret !== process.env.INTERNAL_SECRET) {
      throw new BadRequestException('Invalid internal secret');
    }
    
    return this.jobs.findOneInternal(jobId);
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

  // POST /jobs/:id/requeue - Requeue failed job
  @Post(':id/requeue')
  async requeueJob(@Param('id') jobId: string, @Req() req: any) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated');
    }
    return this.jobs.requeueJob(jobId, req.user.id);
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