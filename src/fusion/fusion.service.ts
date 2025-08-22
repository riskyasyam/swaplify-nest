import { Injectable, HttpException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/files/s3.service';
import { JobStatus, MediaType } from '@prisma/client';
import fetch from 'node-fetch';

type CreateJobDto = {
  sourceKey: string;
  targetKey: string;
  processors?: number; // tidak disimpan di DB, tapi diteruskan ke worker
};

function monthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start, end };
}

@Injectable()
export class FusionService {
  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
  ) {}

  private async ensureUsageCounter(userId: string) {
    const { start, end } = monthRange();
    await this.prisma.usageCounter.upsert({
      where: {
        userId_periodStart_periodEnd: { userId, periodStart: start, periodEnd: end },
      },
      update: {},
      create: { userId, periodStart: start, periodEnd: end, jobsTotal: 0 },
    });
  }

  private async incUsage(userId: string, n = 1) {
    const { start, end } = monthRange();
    await this.prisma.usageCounter.upsert({
      where: {
        userId_periodStart_periodEnd: { userId, periodStart: start, periodEnd: end },
      },
      update: { jobsTotal: { increment: n } },
      create: { userId, periodStart: start, periodEnd: end, jobsTotal: n },
    });
  }

  /**
   * Buat Job baru.
   * NOTE: Saat ini kita tidak memotong kuota di awal (no hard-limit),
   *        pemakaian dihitung saat job SUCCEEDED (lebih fair).
   *        Kalau mau hard-limit, tambahkan pengecekan ke subscription/entitlements di sini.
   */
  async createJob(userId: string, dto: CreateJobDto) {
    // Simpan media input sebagai MediaAsset (S3 input bucket)
    const inputBucket = process.env.S3_INPUT_BUCKET!;
    const source = await this.prisma.mediaAsset.create({
      data: {
        userId,
        type: MediaType.IMAGE, // bisa diubah dinamis jika kamu deteksi MIME
        bucket: inputBucket,
        objectKey: dto.sourceKey,
      },
    });

    const target = await this.prisma.mediaAsset.create({
      data: {
        userId,
        type: MediaType.IMAGE,
        bucket: inputBucket,
        objectKey: dto.targetKey,
      },
    });

    // Buat job status QUEUED
    const job = await this.prisma.job.create({
      data: {
        userId,
        status: JobStatus.QUEUED,
        sourceAssetId: source.id,
        targetAssetId: target.id,
      },
    });

    // Event: enqueued
    await this.prisma.jobEvent.create({
      data: {
        jobId: job.id,
        fromStatus: null,
        toStatus: JobStatus.QUEUED,
        message: 'Job enqueued',
      },
    });

    // Dispatch ke worker (tetap kirim S3 objectKey agar worker tidak perlu query DB)
    try {
      const res = await fetch(`${process.env.WORKER_BASE_URL}/worker/facefusion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Secret': process.env.WORKER_SHARED_SECRET ?? '',
        },
        body: JSON.stringify({
          jobId: job.id,
          sourceKey: dto.sourceKey,
          targetKey: dto.targetKey,
          processors: dto.processors ?? 1,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
    } catch (e: any) {
      // Mark FAILED + event
      await this.prisma.$transaction([
        this.prisma.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.FAILED,
            errorMessage: `dispatch failed: ${e?.message ?? String(e)}`,
          },
        }),
        this.prisma.jobEvent.create({
          data: {
            jobId: job.id,
            fromStatus: JobStatus.QUEUED,
            toStatus: JobStatus.FAILED,
            message: 'Dispatch worker failed',
          },
        }),
      ]);
      throw new HttpException(`Dispatch worker failed: ${e?.message ?? e}`, 500);
    }

    return { jobId: job.id, status: job.status };
  }

  /** Cek status job. Jika SUCCEEDED dan ada output asset → beri presigned URL */
  async getJob(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { outputAsset: true },
    });
    if (!job) throw new HttpException('Not found', 404);

    if (job.status === JobStatus.SUCCEEDED && job.outputAsset?.objectKey) {
      const dl = await this.s3.presignDownload(
        job.outputAsset.objectKey,
        job.outputAsset.bucket ?? process.env.S3_OUTPUT_BUCKET,
      );
      return {
        jobId: job.id,
        status: job.status,
        outputKey: job.outputAsset.objectKey,
        downloadUrl: dl.url,
      };
    }

    return { jobId: job.id, status: job.status, error: job.errorMessage ?? undefined };
  }

  /** Dipanggil worker ketika selesai sukses */
  async markDone(
    jobId: string,
    payload: { outputKey: string; bucket?: string; mimeType?: string },
  ) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new HttpException('Not found', 404);

    // Simpan output sebagai MediaAsset
    const bucket = payload.bucket ?? process.env.S3_OUTPUT_BUCKET!;
    const out = await this.prisma.mediaAsset.create({
      data: {
        userId: job.userId,
        type: MediaType.IMAGE, // sesuaikan dengan hasil worker
        bucket,
        objectKey: payload.outputKey,
        mimeType: payload.mimeType ?? undefined,
      },
    });

    await this.prisma.$transaction([
      // mark job succeeded
      this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.SUCCEEDED,
          finishedAt: new Date(),
          outputAssetId: out.id,
          errorMessage: null,
        },
      }),
      // event
      this.prisma.jobEvent.create({
        data: {
          jobId,
          fromStatus: JobStatus.RUNNING,
          toStatus: JobStatus.SUCCEEDED,
          message: 'Worker finished',
        },
      }),
    ]);

    // hitung pemakaian hanya saat sukses
    await this.incUsage(job.userId, 1);

    return { ok: true };
  }

  /** Dipanggil worker ketika gagal */
  async markFailed(jobId: string, payload: { error: string }) {
    await this.prisma.$transaction([
      this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: payload.error,
        },
      }),
      this.prisma.jobEvent.create({
        data: {
          jobId,
          fromStatus: JobStatus.RUNNING,
          toStatus: JobStatus.FAILED,
          message: payload.error?.slice(0, 500),
        },
      }),
    ]);

    return { ok: true };
  }
}