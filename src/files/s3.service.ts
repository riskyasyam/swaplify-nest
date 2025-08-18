import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private s3 = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
    forcePathStyle: true, // wajib untuk MinIO
  });

  async presignUpload(key: string, contentType: string, bucket = process.env.S3_INPUT_BUCKET!) {
    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    const url = await getSignedUrl(this.s3, cmd, { expiresIn: 3600 });
    return { method: 'PUT', url, key, bucket, contentType };
  }

  async presignDownload(key: string, bucket = process.env.S3_OUTPUT_BUCKET!) {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(this.s3, cmd, { expiresIn: 3600 });
    return { method: 'GET', url, key, bucket };
  }
}