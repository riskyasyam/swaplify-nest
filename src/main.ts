// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // agar cookie httpOnly bisa terkirim dari FE (ubah origin sesuai FE kamu)
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true, // penting untuk cookie
  });

  // parse cookie (dipakai JwtAuthGuard membaca cookie access_token)
  app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-secret'));

  // validation pipe global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT || 3000);
}
void bootstrap();