import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { S3Service } from './s3.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly s3: S3Service) {}

  @Post('presign-upload')
  presignUpload(@Body() b: { key: string; contentType: string; bucket?: string }) {
    return this.s3.presignUpload(b.key, b.contentType, b.bucket);
  }

  @Post('presign-download')
  presignDownload(@Body() b: { key: string; bucket?: string }) {
    return this.s3.presignDownload(b.key, b.bucket);
  }
}
