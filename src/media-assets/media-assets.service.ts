import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import * as path from 'path';
import sharp from 'sharp';
import * as mm from 'music-metadata'; // audio metadata
import * as cp from 'child_process'; // ffprobe untuk video
import { promisify } from 'util';
import { MediaType } from '@prisma/client';

const exec = promisify(cp.exec);

@Injectable()
export class MediaAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('S3') private readonly s3: any,
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

  async createFromUpload(params: { file: Express.Multer.File; type: MediaType }) {
    const { file, type } = params;
    const bucket = process.env.S3_INPUT_BUCKET!;
    const ext = this.detectExt(file.mimetype);
    const objectKey = `${type.toLowerCase()}/${Date.now()}-${cryptoRandom(6)}.${ext}`;

    // hash sha256
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // upload ke S3
    await this.s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

    // metadata dasar
    let width: number | null = null;
    let height: number | null = null;
    let durationSec: number | null = null;

    if (type === 'IMAGE') {
      try {
        const meta = await sharp(file.buffer).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch {}
    } else if (type === 'AUDIO') {
      try {
        const meta = await mm.parseBuffer(file.buffer, file.mimetype);
        durationSec = meta.format.duration ? Math.round(meta.format.duration) : null;
      } catch {}
    } else if (type === 'VIDEO') {
      // Cara cepat (akurasi baik) pakai ffprobe, tapi perlu file di disk.
      // Simpan sementara:
      // NOTE: bisa juga skip kalau tidak butuh duration.
      // (implementasi opsional)
    }

    const asset = await this.prisma.mediaAsset.create({
      data: {
        userId: /* ambil dari req.user.id */ 'REPLACE_ME',
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