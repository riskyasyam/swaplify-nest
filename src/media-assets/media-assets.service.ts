import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { Express } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { MediaType } from '@prisma/client';

// Conditional import for music-metadata to avoid Docker issues
let mm: any = null;
try {
  mm = require('music-metadata');
} catch (error) {
  console.warn('music-metadata not available, audio duration extraction disabled');
}

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
        if (mm) {
          const meta = await mm.parseBuffer(file.buffer, file.mimetype);
          durationSec = meta.format.duration ? Math.round(meta.format.duration) : null;
        }
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

  /**
   * Find media asset by ID (for internal use)
   */
  async findById(assetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        bucket: true,
        objectKey: true,
        type: true,
        mimeType: true,
        width: true,
        height: true,
        durationSec: true,
        path: true
      }
    });

    if (!asset) {
      throw new BadRequestException(`Asset with id ${assetId} not found`);
    }

    return asset;
  }

  /**
   * Get FaceFusion output media assets for a specific user
   */
  async getFaceFusionOutputsByUserId(userId: string, options: { skip?: number; take?: number } = {}) {
    const { skip = 0, take = 20 } = options;

    // Find media assets that are outputs from FaceFusion jobs
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        userId,
        // Filter untuk media assets yang merupakan output dari job
        outputForJobs: {
          some: {
            // Bisa tambahkan filter lain jika perlu, misalnya jobType: 'FACE_SWAP'
          }
        },
        // Filter bucket untuk facefusion-output
        bucket: 'facefusion-output'
      },
      select: {
        id: true,
        type: true,
        bucket: true,
        objectKey: true,
        path: true,
        mimeType: true,
        width: true,
        height: true,
        durationSec: true,
        sizeBytes: true,
        createdAt: true,
        // Include job information untuk context
        outputForJobs: {
          select: {
            id: true,
            processors: true,
            status: true,
            createdAt: true,
            finishedAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take
    });

    // Get total count for pagination
    const total = await this.prisma.mediaAsset.count({
      where: {
        userId,
        outputForJobs: {
          some: {}
        },
        bucket: 'facefusion-output'
      }
    });

    // Convert BigInt to string untuk JSON serialization
    const assetsWithStringSize = assets.map(asset => ({
      ...asset,
      sizeBytes: asset.sizeBytes ? asset.sizeBytes.toString() : null
    }));

    return {
      data: assetsWithStringSize,
      pagination: {
        skip,
        take,
        total,
        hasMore: skip + take < total
      }
    };
  }

  /**
   * Delete FaceFusion output media asset by user (only if owned by user)
   */
  async deleteFaceFusionOutputByUser(userId: string, assetId: string) {
    // First, verify the asset exists and belongs to the user
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        userId,
        // Ensure it's a FaceFusion output
        outputForJobs: {
          some: {}
        },
        bucket: 'facefusion-output'
      },
      include: {
        outputForJobs: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    if (!asset) {
      throw new BadRequestException('Asset not found or you do not have permission to delete it');
    }

    try {
      // Delete from S3/MinIO storage
      if (asset.bucket && asset.objectKey) {
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: asset.bucket,
            Key: asset.objectKey
          })
        );
      }

      // Delete from database
      await this.prisma.mediaAsset.delete({
        where: { id: assetId }
      });

      return {
        message: 'FaceFusion output deleted successfully',
        deletedAsset: {
          id: asset.id,
          objectKey: asset.objectKey,
          type: asset.type,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes ? asset.sizeBytes.toString() : null,
          createdAt: asset.createdAt,
          relatedJobs: asset.outputForJobs.map(job => ({
            id: job.id,
            status: job.status
          }))
        }
      };
    } catch (error) {
      // If S3 deletion fails but DB deletion succeeds, log it but don't fail the request
      if (error.code === 'NoSuchKey') {
        // File already doesn't exist in S3, just delete from DB
        await this.prisma.mediaAsset.delete({
          where: { id: assetId }
        });
        
        return {
          message: 'FaceFusion output deleted successfully (file was already missing from storage)',
          deletedAsset: {
            id: asset.id,
            objectKey: asset.objectKey,
            type: asset.type,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes ? asset.sizeBytes.toString() : null,
            createdAt: asset.createdAt,
            warning: 'File was not found in storage but removed from database'
          }
        };
      }
      
      throw new BadRequestException(`Failed to delete asset: ${error.message}`);
    }
  }
}

function cryptoRandom(len = 6) {
  return Math.random().toString(36).slice(2, 2 + len);
}