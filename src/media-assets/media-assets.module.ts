import { Module } from '@nestjs/common';
import { MediaAssetsService } from './media-assets.service';
import { MediaAssetsController } from './media-assets.controller';
import { S3Client } from '@aws-sdk/client-s3';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { S3Module } from 'src/storage/s3.module';

@Module({
  imports: [PrismaModule, S3Module],
  controllers: [MediaAssetsController],
  providers: [
    MediaAssetsService,
    PrismaService,
    {
      provide: 'S3',

      useFactory: () => {
        return new S3Client({
          region: process.env.S3_REGION ?? 'us-east-1',
          endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
          forcePathStyle: true,
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
            secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
          },
        });
      },
    },
  ],
  exports: [MediaAssetsService],
})
export class MediaAssetsModule { }