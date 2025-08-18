import { Body, Controller, Get, Param, Post, Req, Headers, UseGuards } from '@nestjs/common';
import { FusionService } from './fusion.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('jobs/facefusion')
export class FusionController {
  constructor(private fusion: FusionService) {}

  // Client memulai job (harus login)
  @UseGuards(JwtAuthGuard)
  @Post()
    create(
    @Req() req: any,
    @Body() b: any,  // terima bebas dulu
  ) {
    const sourceKey = b.source_key ?? b.sourceKey;
    const targetKey = b.target_key ?? b.targetKey;
    const processors = b.processors ?? 1;

    if (!sourceKey || !targetKey) {
      // balas 400 jelas, jangan diteruskan ke worker
      return { statusCode: 400, message: 'sourceKey/targetKey is required' };
    }

    return this.fusion.createJob(req.user.sub, {
      sourceKey,
      targetKey,
      processors,
    });
  }

  // Client cek status job
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.fusion.getJob(id);
  }

  // Endpoint callback dari worker (proteksi shared secret)
  @Post(':id/callback/done')
  done(@Param('id') id: string, @Body() b: { output_key: string }, @Headers('x-worker-secret') secret: string) {
    if (secret !== process.env.WORKER_SHARED_SECRET) return { ok: false, error: 'unauthorized' };
    return this.fusion.markDone(id, { outputKey: b.output_key });
  }

  @Post(':id/callback/failed')
  failed(@Param('id') id: string, @Body() b: { error: string }, @Headers('x-worker-secret') secret: string) {
    if (secret !== process.env.WORKER_SHARED_SECRET) return { ok: false, error: 'unauthorized' };
    return this.fusion.markFailed(id, { error: b.error });
  }
}