import { Injectable, HttpException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/files/s3.service';
import fetch from 'node-fetch';

@Injectable()
export class FusionService {
  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
  ) {}

  

  async createJob(userId: number, dto: { sourceKey: string; targetKey: string; processors?: number }) {
    // Optional: HEAD ke S3 untuk validasi file ada
    // (boleh diskip dulu agar cepat)

    const job = await this.prisma.fusionJob.create({
      data: {
        userId,
        sourceKey: dto.sourceKey,
        targetKey: dto.targetKey,
        processors: dto.processors ?? 1,
        status: 'QUEUED',
      },
    });

    // Trigger worker via HTTP
    const res = await fetch(`${process.env.WORKER_BASE_URL}/worker/facefusion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': process.env.WORKER_SHARED_SECRET ?? '',
      },
      body: JSON.stringify({
        jobId: job.id,
        sourceKey: job.sourceKey,
        targetKey: job.targetKey,
        processors: job.processors,
        // taruh opsi lain kalau perlu
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      // Mark FAILED jika gagal dispatch
      await this.prisma.fusionJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorMessage: `dispatch failed: ${text}` },
      });
      throw new HttpException(`Dispatch worker failed: ${text}`, 500);
    }

    return { jobId: job.id, status: job.status };
  }

  async getJob(jobId: string) {
    const job = await this.prisma.fusionJob.findUnique({ where: { id: jobId } });
    if (!job) throw new HttpException('Not found', 404);

    if (job.status === 'DONE' && job.outputKey) {
      const dl = await this.s3.presignDownload(job.outputKey, process.env.S3_OUTPUT_BUCKET);
      return { jobId: job.id, status: job.status, outputKey: job.outputKey, downloadUrl: dl.url };
    }
    return { jobId: job.id, status: job.status, error: job.errorMessage ?? undefined };
  }

  // Dipanggil worker ketika selesai
  async markDone(jobId: string, payload: { outputKey: string }) {
    await this.prisma.fusionJob.update({
      where: { id: jobId },
      data: { status: 'DONE', outputKey: payload.outputKey, errorMessage: null },
    });
    return { ok: true };
  }

  async markFailed(jobId: string, payload: { error: string }) {
    await this.prisma.fusionJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: payload.error },
    });
    return { ok: true };
  }
}