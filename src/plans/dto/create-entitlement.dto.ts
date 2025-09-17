import { 
  IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min 
} from 'class-validator';

export class CreateEntitlementDto {
  @IsInt() @Min(1)
  planId!: number;

  @IsInt() @Min(1)
  version!: number;

  // Core limits
  @IsInt() @Min(1)
  max_processors_per_job!: number;

  @IsInt() @Min(1)
  max_weight_per_job!: number;

  @IsInt() @Min(0)
  daily_weight_quota!: number;

  @IsInt() @Min(1)
  max_video_sec!: number;

  @IsString() @IsNotEmpty()
  max_resolution!: string; // e.g., "1920x1080", "4K"

  // New fields
  @IsBoolean()
  watermark!: boolean;

  @IsInt() @Min(1)
  concurrency!: number; // How many jobs can run simultaneously
}