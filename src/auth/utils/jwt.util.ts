import { BadRequestException } from '@nestjs/common';

export function decodeJwt(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new BadRequestException('Invalid JWT format');
  }
  const json = Buffer.from(parts[1], 'base64').toString('utf8');
  return JSON.parse(json);
}