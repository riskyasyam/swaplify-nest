import { IsInt, IsOptional, Min } from 'class-validator';

export class UpsertEntitlementDto {
  @IsInt() @Min(1)
  version!: number; // gunakan versi 1,2,3,...

  // bebas isi JSON saat call (body mentah) → ditangani di controller
  // tip: di Swagger gunakan @ApiBody({ schema: { example: { max_video_sec: 120, ... }}})
}