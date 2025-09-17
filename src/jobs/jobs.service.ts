import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobStatus } from '@prisma/client';
import { PlanEntitlementValues } from '../plans/plan-entitlements.type';
import { QuotaService } from '../common/subscription/quota.service';
import { NsqService } from '../nsq/nsq.service';
import { ConfigService } from '@nestjs/config';

interface CreateJobInput {
  userId: string;
  sourceAssetId: string;
  targetAssetId: string;
  audioAssetId?: string;
  processors: string[];
  options?: any;
}

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly nsq: NsqService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Cek apakah resolusi diizinkan berdasarkan plan
   * 480p = 854x480 max, 720p = 1280x720 max, 1080p = 1920x1080 max
   */
  private isResolutionAllowed(width: number, height: number, maxResolution: string): boolean {
    const resolutionLimits: Record<string, { maxWidth: number; maxHeight: number }> = {
      '480p': { maxWidth: 854, maxHeight: 480 },
      '720p': { maxWidth: 1280, maxHeight: 720 },
      '1080p': { maxWidth: 1920, maxHeight: 1080 },
    };

    const limit = resolutionLimits[maxResolution];
    if (!limit) return false; // Unknown resolution format

    // Allow if both width and height are within limits
    return width <= limit.maxWidth && height <= limit.maxHeight;
  }

  // Hitung weight dari processors (hanya core processors, bukan options)
  private async calculateWeight(processors: string[]) {
    const features = await this.prisma.feature.findMany({
      where: { 
        name: { in: processors },
        type: 'processor' // Only core processors, not processor_option
      },
    });
    return features.reduce((sum, f) => sum + (f.weight ?? 1), 0);
  }

  /**
   * Validate processor dependencies and options
   */
  private validateProcessorOptions(processors: string[], options: any = {}): string[] {
    const errors: string[] = [];

    // Required model validations
    const requiredModels = {
      'face_enhancer': 'faceEnhancerModel',
      'frame_enhancer': 'frameEnhancerModel', 
      'frame_colorizer': 'frameColorizerModel',
      'lip_syncer': 'lipSyncerModel',
      'deep_swapper': 'deepSwapperModel'
    };

    for (const [processor, modelField] of Object.entries(requiredModels)) {
      if (processors.includes(processor) && !options[modelField]) {
        errors.push(`${modelField} is required when using ${processor} processor`);
      }
    }

    // Face Editor validation
    if (processors.includes('face_editor') && options.faceEditorParams) {
      const params = options.faceEditorParams;
      
      if (params.eyeOpenRatio !== undefined && (params.eyeOpenRatio < 0 || params.eyeOpenRatio > 2)) {
        errors.push('faceEditorParams.eyeOpenRatio must be between 0 and 2');
      }
      
      if (params.mouthSmile !== undefined && (params.mouthSmile < -1 || params.mouthSmile > 1)) {
        errors.push('faceEditorParams.mouthSmile must be between -1 and 1');
      }
      
      if (params.headYaw !== undefined && (params.headYaw < -30 || params.headYaw > 30)) {
        errors.push('faceEditorParams.headYaw must be between -30 and 30 degrees');
      }

      if (params.headPitch !== undefined && (params.headPitch < -30 || params.headPitch > 30)) {
        errors.push('faceEditorParams.headPitch must be between -30 and 30 degrees');
      }

      if (params.headRoll !== undefined && (params.headRoll < -30 || params.headRoll > 30)) {
        errors.push('faceEditorParams.headRoll must be between -30 and 30 degrees');
      }
    }

    // Age modifier validation
    if (processors.includes('age_modifier') && options.ageModifierDirection !== undefined) {
      if (options.ageModifierDirection < -20 || options.ageModifierDirection > 20) {
        errors.push('ageModifierDirection must be between -20 and 20');
      }
    }

    // Face selector validation
    if (options.faceSelectorMode === 'reference' && !options.referenceFaceDistance) {
      errors.push('referenceFaceDistance is required when faceSelectorMode is "reference"');
    }

    // Age range validation
    if (options.faceSelectorAgeStart !== undefined && options.faceSelectorAgeEnd !== undefined) {
      if (options.faceSelectorAgeStart > options.faceSelectorAgeEnd) {
        errors.push('faceSelectorAgeStart must be less than faceSelectorAgeEnd');
      }
    }

    // Output quality validation
    if (options.outputVideoQuality !== undefined && (options.outputVideoQuality < 10 || options.outputVideoQuality > 100)) {
      errors.push('outputVideoQuality must be between 10 and 100');
    }

    // Face detector score validation
    if (options.faceDetectorScore !== undefined && (options.faceDetectorScore < 0 || options.faceDetectorScore > 1)) {
      errors.push('faceDetectorScore must be between 0 and 1');
    }

    // Face enhancer blend validation
    if (options.faceEnhancerBlend !== undefined && (options.faceEnhancerBlend < 0 || options.faceEnhancerBlend > 100)) {
      errors.push('faceEnhancerBlend must be between 0 and 100');
    }

    // Frame enhancer blend validation
    if (options.frameEnhancerBlend !== undefined && (options.frameEnhancerBlend < 0 || options.frameEnhancerBlend > 100)) {
      errors.push('frameEnhancerBlend must be between 0 and 100');
    }

    return errors;
  }

  /**
   * Apply default values for missing options
   */
  private applyDefaultOptions(processors: string[], options: any = {}): any {
    const defaults = {
      // Hardware defaults
      useCuda: true,
      deviceId: '0',
      
      // Processor defaults
      faceSwapperModel: 'inswapper_128',
      faceEnhancerBlend: 50,
      frameEnhancerBlend: 80,
      ageModifierDirection: 0,
      expressionRestorerModel: 'live_portrait',
      expressionRestorerFactor: 80,
      faceEditorModel: 'live_portrait',
      frameColorizerBlend: 80,
      lipSyncerWeight: 1.0,
      deepSwapperMorph: 80,
      
      // Global defaults
      faceSelectorMode: 'automatic',
      referenceFaceDistance: 0.3,
      faceSelectorOrder: 'left-right',
      faceSelectorGender: 'any',
      faceSelectorAgeStart: 0,
      faceSelectorAgeEnd: 100,
      faceDetectorModel: 'retinaface',
      faceDetectorScore: 0.5,
      faceMaskTypes: 'box',
      faceMaskBlur: 0.3,
      faceMaskPadding: '0,0,0,0',
      outputVideoEncoder: 'libx264',
      outputVideoQuality: 80,
      outputVideoPreset: 'medium',
      outputVideoFps: 25
    };

    // Start with provided options
    const result = { ...options };
    
    // Only apply processor-specific defaults for selected processors
    if (processors.includes('face_swapper') && !result.faceSwapperModel) {
      result.faceSwapperModel = defaults.faceSwapperModel;
    }
    
    if (processors.includes('face_enhancer') && result.faceEnhancerBlend === undefined) {
      result.faceEnhancerBlend = defaults.faceEnhancerBlend;
    }
    
    if (processors.includes('frame_enhancer') && result.frameEnhancerBlend === undefined) {
      result.frameEnhancerBlend = defaults.frameEnhancerBlend;
    }

    if (processors.includes('age_modifier') && result.ageModifierDirection === undefined) {
      result.ageModifierDirection = defaults.ageModifierDirection;
    }

    if (processors.includes('expression_restorer')) {
      if (!result.expressionRestorerModel) result.expressionRestorerModel = defaults.expressionRestorerModel;
      if (result.expressionRestorerFactor === undefined) result.expressionRestorerFactor = defaults.expressionRestorerFactor;
    }

    if (processors.includes('face_editor') && !result.faceEditorModel) {
      result.faceEditorModel = defaults.faceEditorModel;
    }

    if (processors.includes('frame_colorizer') && result.frameColorizerBlend === undefined) {
      result.frameColorizerBlend = defaults.frameColorizerBlend;
    }

    if (processors.includes('lip_syncer') && result.lipSyncerWeight === undefined) {
      result.lipSyncerWeight = defaults.lipSyncerWeight;
    }

    if (processors.includes('deep_swapper') && result.deepSwapperMorph === undefined) {
      result.deepSwapperMorph = defaults.deepSwapperMorph;
    }
    
    // Apply global defaults for undefined values
    Object.keys(defaults).forEach(key => {
      if (result[key] === undefined && !key.includes('Model') && !key.includes('Direction') && !key.includes('Factor') && !key.includes('Blend') && !key.includes('Weight') && !key.includes('Morph')) {
        result[key] = defaults[key];
      }
    });

    return result;
  }

  async create(input: CreateJobInput) {
    const { userId, sourceAssetId, targetAssetId, audioAssetId, processors, options } = input;

    // 0. Validate processor options
    const validationErrors = this.validateProcessorOptions(processors, options);
    if (validationErrors.length > 0) {
      throw new BadRequestException({
        message: 'Invalid processor options',
        errors: validationErrors
      });
    }

    // 0.1. Apply default values
    const finalOptions = this.applyDefaultOptions(processors, options);

    // 1. Ambil subscription aktif
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: {
        plan: {
          include: {
            entitlements: { orderBy: { version: 'desc' }, take: 1 },
            featurePlan: { include: { feature: true } },
          },
        },
      },
    });
    if (!subscription) {
      throw new ForbiddenException('No active subscription found');
    }

    const ent = subscription.plan.entitlements[0]?.entitlements as unknown as PlanEntitlementValues;
    if (!ent) {
      throw new NotFoundException('No entitlements found for plan');
    }

    // 2. Hitung weight job
    const jobWeight = await this.calculateWeight(processors);

    // 3. Validasi processors count
    if (processors.length > ent.max_processors_per_job) {
      throw new ForbiddenException(`Exceeds max_processors_per_job = ${ent.max_processors_per_job}`);
    }

    // 4. Validasi weight per job
    if (jobWeight > ent.max_weight_per_job) {
      throw new ForbiddenException(`Exceeds max_weight_per_job = ${ent.max_weight_per_job}`);
    }

    // 5. Ambil usage user hari ini
    const today = new Date();
    const periodStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const periodEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    let usage = await this.prisma.usageCounter.findUnique({
      where: { userId_periodStart_periodEnd: { userId, periodStart, periodEnd } },
    });

    if (!usage) {
      usage = await this.prisma.usageCounter.create({
        data: { userId, periodStart, periodEnd, jobsTotal: 0 },
      });
    }

    // 6. Validasi daily quota
    if (usage.jobsTotal + jobWeight > ent.daily_weight_quota) {
      throw new ForbiddenException('Daily quota exceeded');
    }

    // 7. Validasi resolusi/durasi (kalau ada asset video)
    if (sourceAssetId) {
      const source = await this.prisma.mediaAsset.findUnique({ where: { id: sourceAssetId } });
      if (source?.durationSec && source.durationSec > ent.max_video_sec) {
        throw new ForbiddenException('Video duration exceeds plan limit');
      }
      if (source?.width && source?.height) {
        const isResolutionAllowed = this.isResolutionAllowed(source.width, source.height, ent.max_resolution);
        if (!isResolutionAllowed) {
          throw new ForbiddenException(`Resolution exceeds plan limit. Allowed: ${ent.max_resolution}`);
        }
      }
    }

    // 8. Simpan Job
    console.log('🔄 Creating job in database...');
    const job = await this.prisma.job.create({
      data: {
        userId,
        sourceAssetId,
        targetAssetId,
        audioAssetId,
        processors,
        options: finalOptions, // Use processed options with defaults
        weightUsed: jobWeight,
        status: JobStatus.QUEUED,
      },
    });
    console.log(`✅ Job created successfully with ID: ${job.id}`);

    // 9. Update usage
    console.log('🔄 Updating usage counter...');
    await this.prisma.usageCounter.update({
      where: { userId_periodStart_periodEnd: { userId, periodStart, periodEnd } },
      data: { jobsTotal: { increment: jobWeight } },
    });
    console.log('✅ Usage counter updated');

    // 10. Publish job to NSQ
    const nsqTopic = this.configService.get('NSQ_TOPIC', 'facefusion_jobs');
    console.log(`🚦 Attempting to publish job ${job.id} to NSQ topic '${nsqTopic}'...`);
    try {
      await this.nsq.publishJob(nsqTopic, {
        jobId: job.id,
        userId: job.userId,
        sourceAssetId: job.sourceAssetId,
        targetAssetId: job.targetAssetId,
        audioAssetId: job.audioAssetId,
        processors: job.processors,
        options: job.options, // This now contains the processed options
      });
      console.log(`✅ Published job ${job.id} to NSQ topic '${nsqTopic}'`);
    } catch (err) {
      console.error(`❌ Failed to publish job ${job.id} to NSQ:`, err);
      console.error('❌ NSQ Error details:', err.message);
      // Update job status to failed if NSQ publish fails
      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          errorCode: 'NSQ_PUBLISH_ERROR',
          errorMessage: `Failed to publish to NSQ: ${err.message}`,
          finishedAt: new Date(),
        },
      });
      throw new Error(`Failed to queue job: ${err.message}`);
    }

    console.log(`🎯 Job ${job.id} creation process completed`);
    return job;
  }

  async findAll(userId: string) {
    const jobs = await this.prisma.job.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        sourceAsset: true,
        targetAsset: true,
        audioAsset: true,
        outputAsset: true
      }
    });
    
    return jobs.map(job => this.serializeJobResponse(job));
  }

  async findOne(jobId: string, userId: string) {
    const job = await this.prisma.job.findFirst({ 
      where: { id: jobId, userId },
      include: {
        sourceAsset: true,
        targetAsset: true,
        audioAsset: true,
        outputAsset: true
      }
    });
    if (!job) throw new NotFoundException('Job not found');
    return this.serializeJobResponse(job);
  }

  async findOneInternal(jobId: string) {
    const job = await this.prisma.job.findFirst({ 
      where: { id: jobId },
      include: {
        sourceAsset: true,
        targetAsset: true,
        audioAsset: true,
        outputAsset: true
      }
    });
    if (!job) throw new NotFoundException('Job not found');
    return this.serializeJobResponse(job);
  }

  /**
   * Handle worker callback (unified for success/error)
   */
  async handleWorkerCallback(jobId: string, payload: { status: string; progressPct?: number; outputKey?: string; errorMessage?: string }) {
    const { status, progressPct, outputKey, errorMessage } = payload;
    
    console.log(`🔄 Processing worker callback for job ${jobId}:`, payload);
    
    try {
      const updateData: any = {
        status,
        progressPct: progressPct ?? null,
        finishedAt: new Date()
      };
      
      // Handle success case
      if (status === 'SUCCEEDED' && outputKey) {
        console.log(`📝 Creating output asset for job ${jobId} with key: ${outputKey}`);
        
        const job = await this.prisma.job.findUnique({
          where: { id: jobId },
          include: { targetAsset: true }
        });
        
        if (!job?.targetAsset) {
          throw new Error(`Job ${jobId} or target asset not found`);
        }
        
        // Create output asset
        const outputAsset = await this.prisma.mediaAsset.create({
          data: {
            userId: job.userId,
            type: job.targetAsset.type,
            bucket: 'facefusion-output',
            objectKey: outputKey,
            path: `facefusion-output/${outputKey}`,
            mimeType: job.targetAsset.type === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
            sizeBytes: BigInt(5000000), // Placeholder
            width: job.targetAsset.width,
            height: job.targetAsset.height,
            durationSec: job.targetAsset.durationSec,
            sha256: `ff_output_${Date.now()}_${Math.random().toString(36).slice(2)}`
          }
        });
        
        updateData.outputAssetId = outputAsset.id;
        console.log(`✅ Output asset created: ${outputAsset.id}`);
      }
      
      // Handle error case
      if (status === 'FAILED' && errorMessage) {
        updateData.errorCode = 'FACEFUSION_ERROR';
        updateData.errorMessage = errorMessage;
        console.log(`❌ Job ${jobId} failed: ${errorMessage}`);
      }
      
      // Update job
      const updatedJob = await this.prisma.job.update({
        where: { id: jobId },
        data: updateData,
        include: {
          sourceAsset: true,
          targetAsset: true,
          audioAsset: true,
          outputAsset: true
        }
      });
      
      console.log(`✅ Job ${jobId} updated to status: ${status}`);
      return this.serializeJobResponse(updatedJob);
      
    } catch (error) {
      console.error(`❌ Error handling worker callback for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Update job status (for internal use)
   */
  async updateJobStatus(jobId: string, status: string, progressPct?: number) {
    console.log(`🔄 Updating job ${jobId} status to ${status}, progress: ${progressPct}%`);
    
    const updateData: any = { status };
    if (progressPct !== undefined) {
      updateData.progressPct = progressPct;
    }
    if (status === 'RUNNING' && progressPct === undefined) {
      updateData.startedAt = new Date();
    }
    
    const updatedJob = await this.prisma.job.update({
      where: { id: jobId },
      data: updateData,
      include: {
        sourceAsset: true,
        targetAsset: true,
        audioAsset: true,
        outputAsset: true
      }
    });
    
    return this.serializeJobResponse(updatedJob);
  }

  /**
   * Manual complete job (untuk debug stuck jobs)
   */
  async manualCompleteJob(jobId: string, userId: string) {
    try {
      console.log(`🔧 Manual completing job ${jobId} for user ${userId}`);
      
      const job = await this.prisma.job.findFirst({
        where: { id: jobId, userId },
        include: { outputAsset: true }
      });

      if (!job) {
        throw new NotFoundException('Job not found');
      }

      if (job.status === 'SUCCEEDED') {
        console.log(`✅ Job ${jobId} already completed`);
        return this.serializeJobResponse(job);
      }

      if (!job.outputAssetId) {
        throw new BadRequestException('Job has no output asset, cannot complete');
      }

      // Update job to SUCCEEDED
      const completedJob = await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'SUCCEEDED',
          progressPct: 100,
          finishedAt: new Date()
        },
        include: {
          sourceAsset: true,
          targetAsset: true,
          audioAsset: true,
          outputAsset: true
        }
      });

      console.log(`✅ Manually completed job ${jobId}`);
      return this.serializeJobResponse(completedJob);

    } catch (error) {
      console.error(`❌ Error manually completing job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Requeue failed job
   */
  async requeueJob(jobId: string, userId: string) {
    try {
      console.log(`🔄 Requeuing job ${jobId} for user ${userId}`);
      
      const job = await this.prisma.job.findFirst({
        where: { id: jobId, userId },
      });

      if (!job) {
        throw new NotFoundException('Job not found');
      }

      if (job.status !== 'FAILED') {
        throw new BadRequestException('Only failed jobs can be requeued');
      }

      // Update job status to QUEUED
      const updatedJob = await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.QUEUED,
          progressPct: 0,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          finishedAt: null,
        },
        include: {
          sourceAsset: true,
          targetAsset: true,
          audioAsset: true,
          outputAsset: true
        }
      });

      // Publish job to NSQ
      const nsqTopic = this.configService.get('NSQ_TOPIC', 'facefusion_jobs');
      console.log(`🚦 Publishing requeued job ${jobId} to NSQ topic '${nsqTopic}'...`);
      
      await this.nsq.publishJob(nsqTopic, {
        jobId: job.id,
        userId: job.userId,
        sourceAssetId: job.sourceAssetId,
        targetAssetId: job.targetAssetId,
        audioAssetId: job.audioAssetId,
        processors: job.processors,
        options: job.options,
      });

      console.log(`✅ Job ${jobId} requeued successfully`);
      return { message: 'Job requeued successfully', job: this.serializeJobResponse(updatedJob) };
      
    } catch (error) {
      console.error(`❌ Error requeuing job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Serialize job response dengan transformasi yang tepat
   */
  private serializeJobResponse(job: any) {
    return {
      id: job.id,
      userId: job.userId,
      status: job.status,
      processors: job.processors,
      options: job.options,
      weightUsed: job.weightUsed,
      progressPct: job.progressPct,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      sourceAsset: job.sourceAsset ? {
        id: job.sourceAsset.id,
        type: job.sourceAsset.type,
        path: job.sourceAsset.path,
        mimeType: job.sourceAsset.mimeType,
        sizeBytes: job.sourceAsset.sizeBytes?.toString(),
        width: job.sourceAsset.width,
        height: job.sourceAsset.height,
        durationSec: job.sourceAsset.durationSec,
      } : null,
      targetAsset: job.targetAsset ? {
        id: job.targetAsset.id,
        type: job.targetAsset.type,
        path: job.targetAsset.path,
        mimeType: job.targetAsset.mimeType,
        sizeBytes: job.targetAsset.sizeBytes?.toString(),
        width: job.targetAsset.width,
        height: job.targetAsset.height,
        durationSec: job.targetAsset.durationSec,
      } : null,
      audioAsset: job.audioAsset ? {
        id: job.audioAsset.id,
        type: job.audioAsset.type,
        path: job.audioAsset.path,
        mimeType: job.audioAsset.mimeType,
        sizeBytes: job.audioAsset.sizeBytes?.toString(),
        durationSec: job.audioAsset.durationSec,
      } : null,
      outputAsset: job.outputAsset ? {
        id: job.outputAsset.id,
        type: job.outputAsset.type,
        path: job.outputAsset.path,
        mimeType: job.outputAsset.mimeType,
        sizeBytes: job.outputAsset.sizeBytes?.toString(),
        width: job.outputAsset.width,
        height: job.outputAsset.height,
        durationSec: job.outputAsset.durationSec,
      } : null,
    };
  }
}
