import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { Express } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import sharp from 'sharp';
import * as mm from 'music-metadata';
import { MediaType } from '@prisma/client';

@Injectable()
export class MediaAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('S3') private readonly s3: S3Client,
  ) {}

  private detectExt(mime: string) {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
    };
    return map[mime] ?? 'bin';
  }

  // ⬇️ sekarang menerima userId
  async createFromUpload(params: { userId: string; file: Express.Multer.File; type: MediaType }) {
    const { userId, file, type } = params;
    
    // Validate userId exists
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    
    // Check if user exists in database
    const userExists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });
    
    if (!userExists) {
      throw new BadRequestException(`User with id ${userId} not found`);
    }

    if (!userId) throw new BadRequestException('userId is required');
    if (!file?.buffer?.length) throw new BadRequestException('file buffer is empty');

    const bucket = process.env.S3_INPUT_BUCKET;
    if (!bucket) throw new Error('S3_INPUT_BUCKET env is missing');

    const ext = this.detectExt(file.mimetype);
    const objectKey = `${type.toLowerCase()}/${Date.now()}-${cryptoRandom(6)}.${ext}`;

    // hash sha256
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // upload ke S3 / MinIO
    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    // metadata dasar
    let width: number | null = null;
    let height: number | null = null;
    let durationSec: number | null = null;

    if (type === 'IMAGE') {
      try {
        const meta = await sharp(file.buffer).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch {
        /* ignore */
      }
    } else if (type === 'AUDIO') {
      try {
        const meta = await mm.parseBuffer(file.buffer, file.mimetype);
        durationSec = meta.format.duration ? Math.round(meta.format.duration) : null;
      } catch {
        /* ignore */
      }
    }
    // VIDEO: kalau mau akurat bisa pakai ffprobe; untuk sekarang skip

    // simpan ke DB
    console.log('Creating media asset for userId:', userId);
    const asset = await this.prisma.mediaAsset.create({
      data: {
        userId,
        type,
        bucket,
        objectKey,
        path: `${bucket}/${objectKey}`,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        width: width ?? undefined,
        height: height ?? undefined,
        durationSec: durationSec ?? undefined,
        sha256,
      },
      select: { id: true, bucket: true, objectKey: true, type: true },
    });

    return asset;
  }
}

function cryptoRandom(len = 6) {
  return Math.random().toString(36).slice(2, 2 + len);
}