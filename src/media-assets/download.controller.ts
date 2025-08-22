import { Controller, Post, Body, Inject } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { MediaType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

class PresignDto {
  type!: MediaType;
  mimeType!: string;
  sizeBytes!: number;
}

@Controller('media-assets')
export class PresignController {
  constructor(
    @Inject('S3') private readonly s3: any,
    private readonly prisma: PrismaService,
  ) {}

  @Post('presign')
  async presign(@Body() dto: PresignDto) {
    const bucket = process.env.S3_INPUT_BUCKET!;
    const ext = dto.mimeType.split('/')[1] ?? 'bin';
    const objectKey = `${dto.type.toLowerCase()}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const url = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ContentType: dto.mimeType,
      }),
      { expiresIn: 60 * 5 },
    );

    return { bucket, objectKey, url };
  }

  @Post('confirm')
  async confirm(@Body() body: {
    bucket: string;
    objectKey: string;
    type: MediaType;
    mimeType?: string;
    sizeBytes?: number;
  }) {
    // (opsional) Anda bisa verifikasi keberadaan object dengan HeadObjectCommand.
    const asset = await this.prisma.mediaAsset.create({
      data: {
        userId: 'REPLACE_ME',
        type: body.type,
        bucket: body.bucket,
        objectKey: body.objectKey,
        path: `${body.bucket}/${body.objectKey}`,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes ? BigInt(body.sizeBytes) : undefined,
      },
      select: { id: true, bucket: true, objectKey: true, type: true },
    });
    return asset;
  }
}