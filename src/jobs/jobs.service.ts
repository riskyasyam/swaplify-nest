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

  // Hitung weight dari processors
  private async calculateWeight(processors: string[]) {
    const features = await this.prisma.feature.findMany({
      where: { name: { in: processors } },
    });
    return features.reduce((sum, f) => sum + (f.weight ?? 1), 0);
  }

  async create(input: CreateJobInput) {
    const { userId, sourceAssetId, targetAssetId, audioAssetId, processors, options } = input;

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
    const job = await this.prisma.job.create({
      data: {
        userId,
        sourceAssetId,
        targetAssetId,
        audioAssetId,
        processors,
        options,
        weightUsed: jobWeight,
        status: JobStatus.QUEUED,
      },
    });

    // 9. Update usage
    await this.prisma.usageCounter.update({
      where: { userId_periodStart_periodEnd: { userId, periodStart, periodEnd } },
      data: { jobsTotal: { increment: jobWeight } },
    });

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

  /**
   * Process job langsung sampai complete (simulasi FaceFusion)
   */
  async processJobDirectly(jobId: string, userId: string) {
    // 1. Cek job exists dan belongs to user
    const job = await this.prisma.job.findFirst({ 
      where: { id: jobId, userId },
      include: {
        sourceAsset: true,
        targetAsset: true,
        audioAsset: true
      }
    });
    
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== 'QUEUED') {
      throw new BadRequestException(`Job status is ${job.status}, can only process QUEUED jobs`);
    }

    try {
      // 2. Update status to RUNNING
      await this.prisma.job.update({
        where: { id: jobId },
        data: { 
          status: 'RUNNING',
          startedAt: new Date(),
          progressPct: 0
        }
      });

      // 3. Simulasi progress update (untuk demo)
      for (let progress = 10; progress <= 90; progress += 20) {
        await this.prisma.job.update({
          where: { id: jobId },
          data: { progressPct: progress }
        });
        // Simulasi delay processing
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 4. Execute Real FaceFusion via FastAPI Worker
      const useRealFaceFusion = process.env.USE_REAL_FACEFUSION === 'true';
      
      console.log(`🔧 USE_REAL_FACEFUSION: ${process.env.USE_REAL_FACEFUSION}`);
      console.log(`🔧 useRealFaceFusion: ${useRealFaceFusion}`);
      
      let outputResult;
      if (useRealFaceFusion) {
        console.log(`🚀 Using REAL FaceFusion processing for job ${jobId}`);
        // Real processing via FastAPI
        outputResult = await this.executeFaceFusionAPI({
          sourceAsset: job.sourceAsset,
          targetAsset: job.targetAsset,
          audioAsset: job.audioAsset,
          processors: job.processors,
          options: job.options,
          jobId: jobId
        });
        
        // Untuk async processing, return job dengan status RUNNING
        // Output akan diupdate oleh callback
        return await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'RUNNING',
            progressPct: 50,
            startedAt: new Date()
          },
          include: {
            sourceAsset: true,
            targetAsset: true,
            audioAsset: true,
            outputAsset: true
          }
        }).then(job => this.serializeJobResponse(job));
        
      } else {
        console.log(`🎭 Using SIMULATION processing for job ${jobId}`);
        // Simulasi untuk testing
        outputResult = await this.simulateProcessing({
          sourceAsset: job.sourceAsset,
          targetAsset: job.targetAsset,
          audioAsset: job.audioAsset,
          processors: job.processors,
          options: job.options
        });
        
        // Update job sebagai SUCCEEDED (simulasi)
        const completedJob = await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'SUCCEEDED',
            progressPct: 100,
            finishedAt: new Date(),
            outputAssetId: outputResult.outputAssetId
          },
          include: {
            sourceAsset: true,
            targetAsset: true,
            audioAsset: true,
            outputAsset: true
          }
        });

        return this.serializeJobResponse(completedJob);
      }

    } catch (error) {
      // Jika error, update status ke FAILED
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorCode: 'PROCESSING_ERROR',
          errorMessage: error.message || 'Unknown error during processing'
        }
      });
      throw error;
    }
  }

  /**
   * Real FaceFusion processing dengan FastAPI worker
   */
  private async executeFaceFusionAPI(params: {
    sourceAsset: any;
    targetAsset: any;
    audioAsset?: any;
    processors: string[];
    options: any;
    jobId: string;
  }) {
    const { sourceAsset, targetAsset, processors, options, jobId } = params;

    // FastAPI worker endpoint
    const workerUrl = process.env.FACEFUSION_WORKER_URL || 'http://127.0.0.1:8081/worker/facefusion';
    const workerSecret = process.env.WORKER_SHARED_SECRET || 'supersecret';

    // Payload untuk FastAPI worker
    const payload = {
      jobId: jobId,
      sourceKey: sourceAsset.objectKey,  // key di MinIO input bucket
      targetKey: targetAsset.objectKey,
      options: {
        processors: processors,
        faceSwapperModel: this.mapFaceSwapModel(options.faceSwap?.model) || 'inswapper_128',
        useCuda: true,  // atau false untuk CPU
        deviceId: 0,
        extraArgs: []
      }
    };

    console.log(`🚀 FastAPI Worker Payload:`, JSON.stringify(payload, null, 2));

    try {
      console.log(`🚀 Sending job ${jobId} to FaceFusion worker...`);
      
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Secret': workerSecret
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`FastAPI worker failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ FaceFusion worker response:`, result);

      // Worker akan mengirim callback saat selesai
      // Untuk sekarang return temporary result
      return {
        outputAssetId: null, // akan diisi oleh callback
        message: 'Job sent to FaceFusion worker, waiting for completion...',
        workerResponse: result
      };

    } catch (error) {
      console.error(`❌ FastAPI worker error:`, error);
      throw new Error(`FaceFusion processing failed: ${error.message}`);
    }
  }

  private buildFaceFusionCommand(params: {
    sourcePath: string;
    targetPath: string; 
    outputPath: string;
    processors: string[];
    options: any;
  }) {
    const { sourcePath, targetPath, outputPath, processors, options } = params;
    
    let command = `facefusion run`;
    command += ` --source "${sourcePath}"`;
    command += ` --target "${targetPath}"`;
    command += ` --output "${outputPath}"`;
    
    // Add processor-specific options
    if (processors.includes('face_swapper')) {
      if (options.faceSwap?.model) {
        command += ` --face-swapper-model ${options.faceSwap.model}`;
      }
      if (options.faceSwap?.threshold) {
        command += ` --face-detector-score ${options.faceSwap.threshold}`;
      }
    }
    
    return command;
  }

  // Helper methods (implement these)
  private async ensureDirectory(path: string) {
    const fs = require('fs').promises;
    await fs.mkdir(path, { recursive: true });
  }

  private async downloadFromMinIO(bucket: string, key: string, localPath: string) {
    // Implement MinIO download
    // Use MinIO client to download file
    console.log(`� Downloading ${bucket}/${key} to ${localPath}`);
  }

  private async uploadToMinIO(bucket: string, key: string, localPath: string) {
    // Implement MinIO upload
    // Use MinIO client to upload file
    console.log(`📤 Uploading ${localPath} to ${bucket}/${key}`);
  }

  private async getFileSize(path: string): Promise<number> {
    const fs = require('fs').promises;
    const stats = await fs.stat(path);
    return stats.size;
  }

  private async calculateFileHash(path: string): Promise<string> {
    const crypto = require('crypto');
    const fs = require('fs');
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(path);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async cleanupTempDir(path: string) {
    const fs = require('fs').promises;
    try {
      await fs.rmdir(path, { recursive: true });
    } catch (error) {
      console.error(`Failed to cleanup ${path}:`, error);
    }
  }

  /**
   * Simulasi processing (sementara)
   */
  private async simulateProcessing(params: {
    sourceAsset: any;
    targetAsset: any;
    audioAsset?: any;
    processors: string[];
    options: any;
  }) {
    const { sourceAsset, targetAsset, processors, options } = params;

    // Simulasi create output asset
    const outputAsset = await this.prisma.mediaAsset.create({
      data: {
        userId: sourceAsset.userId,
        type: targetAsset.type,
        bucket: 'facefusion-output',
        objectKey: `output/${Date.now()}-faceswap-result.${targetAsset.type === 'VIDEO' ? 'mp4' : 'jpg'}`,
        path: `facefusion-output/output/${Date.now()}-faceswap-result.${targetAsset.type === 'VIDEO' ? 'mp4' : 'jpg'}`,
        mimeType: targetAsset.type === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
        sizeBytes: BigInt(Math.floor(Math.random() * 10000000) + 1000000),
        width: targetAsset.width,
        height: targetAsset.height,
        durationSec: targetAsset.durationSec,
        sha256: `simulated_${Date.now()}_${Math.random().toString(36).slice(2)}`
      }
    });

    console.log(`🎭 FaceFusion Simulated: ${processors.join(',')} with options:`, options);
    console.log(`📁 Source: ${sourceAsset.objectKey} → Target: ${targetAsset.objectKey}`);
    console.log(`📤 Output: ${outputAsset.objectKey}`);

    return {
      outputAssetId: outputAsset.id,
      outputAsset
    };
  }

  /**
   * Handle FaceFusion worker success callback
   */
  async handleFaceFusionSuccess(jobId: string, outputKey: string) {
    try {
      console.log(`🔄 Processing callback for job ${jobId} with output: ${outputKey}`);
      
      // Get job info
      const job = await this.prisma.job.findUnique({
        where: { id: jobId },
        include: { sourceAsset: true, targetAsset: true }
      });

      if (!job) {
        console.error(`❌ Job ${jobId} not found`);
        throw new NotFoundException(`Job ${jobId} not found`);
      }

      if (!job.targetAsset) {
        console.error(`❌ Target asset not found for job ${jobId}`);
        throw new Error(`Target asset not found for job ${jobId}`);
      }

      console.log(`📝 Creating output asset for job ${jobId}`);
      
      // Check if output asset already exists
      let outputAsset;
      if (job.outputAssetId) {
        console.log(`📝 Output asset already exists for job ${jobId}, using existing one`);
        outputAsset = await this.prisma.mediaAsset.findUnique({
          where: { id: job.outputAssetId }
        });
      }

      // Create output asset record only if not exists
      if (!outputAsset) {
        console.log(`📝 Creating new output asset for job ${jobId}`);
        outputAsset = await this.prisma.mediaAsset.create({
          data: {
            userId: job.userId,
            type: job.targetAsset.type,
            bucket: 'facefusion-output',
            objectKey: outputKey,
            path: `facefusion-output/${outputKey}`,
            mimeType: job.targetAsset.type === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
            sizeBytes: BigInt(5000000), // Placeholder, bisa diupdate jika ada info size
            width: job.targetAsset.width,
            height: job.targetAsset.height,
            durationSec: job.targetAsset.durationSec,
            sha256: `ff_output_${Date.now()}_${Math.random().toString(36).slice(2)}`
          }
        });
      }

      console.log(`📝 Updating job ${jobId} status to SUCCEEDED`);

      // Update job sebagai SUCCEEDED
      const completedJob = await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'SUCCEEDED',
          progressPct: 100,
          finishedAt: new Date(),
          outputAssetId: outputAsset.id
        },
        include: {
          sourceAsset: true,
          targetAsset: true,
          audioAsset: true,
          outputAsset: true
        }
      });

      console.log(`✅ Job ${jobId} completed successfully with output: ${outputKey}`);
      return this.serializeJobResponse(completedJob);

    } catch (error) {
      console.error(`❌ Error handling FaceFusion success for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Handle FaceFusion worker failure callback
   */
  async handleFaceFusionFailure(jobId: string, errorMessage: string) {
    try {
      // Update job sebagai FAILED
      const failedJob = await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          progressPct: 0,
          finishedAt: new Date(),
          errorCode: 'FACEFUSION_ERROR',
          errorMessage: errorMessage
        },
        include: {
          sourceAsset: true,
          targetAsset: true,
          audioAsset: true,
          outputAsset: true
        }
      });

      console.error(`❌ Job ${jobId} failed: ${errorMessage}`);
      return this.serializeJobResponse(failedJob);

    } catch (error) {
      console.error(`❌ Error handling FaceFusion failure for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Helper to serialize BigInt fields for JSON response
   */
  private serializeJobResponse(job: any) {
    const serializeAsset = (asset: any) => {
      if (!asset) return asset;
      return {
        ...asset,
        sizeBytes: asset.sizeBytes?.toString() || null,
        createdAt: asset.createdAt ? new Date(asset.createdAt.getTime() + (7 * 60 * 60 * 1000)).toISOString() : null
      };
    };

    // Convert UTC to WIB (UTC+7) for display
    const toWIB = (date: Date | null) => {
      if (!date) return null;
      return new Date(date.getTime() + (7 * 60 * 60 * 1000)).toISOString().replace('Z', '+07:00');
    };

    return {
      ...job,
      createdAt: toWIB(job.createdAt),
      startedAt: toWIB(job.startedAt), 
      finishedAt: toWIB(job.finishedAt),
      sourceAsset: serializeAsset(job.sourceAsset),
      targetAsset: serializeAsset(job.targetAsset),
      audioAsset: serializeAsset(job.audioAsset),
      outputAsset: serializeAsset(job.outputAsset)
    };
  }

  /**
   * Map face swap model from frontend to FastAPI format
   */
  private mapFaceSwapModel(model?: string): string {
    const modelMap: Record<string, string> = {
      'v1': 'inswapper_128',
      'v2': 'inswapper_128_fp16',
      'simswap': 'simswap_256',
      'blendswap': 'blendswap_256'
    };
    
    return modelMap[model || 'v1'] || 'inswapper_128';
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
}