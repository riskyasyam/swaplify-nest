import { 
  IsBoolean, IsInt, IsOptional, IsString, Min 
} from 'class-validator';

export class UpdateEntitlementDto {
  @IsOptional() @IsInt() @Min(1)
  planId?: number;

  @IsOptional() @IsInt() @Min(1)
  version?: number;

  // Core limits
  @IsOptional() @IsInt() @Min(1)
  max_processors_per_job?: number;

  @IsOptional() @IsInt() @Min(1)
  max_weight_per_job?: number;

  @IsOptional() @IsInt() @Min(0)
  daily_weight_quota?: number;

  @IsOptional() @IsInt() @Min(1)
  max_video_sec?: number;

  @IsOptional() @IsString()
  max_resolution?: string; // e.g., "1920x1080", "4K"

  // New fields
  @IsOptional() @IsBoolean()
  watermark?: boolean;

  @IsOptional() @IsInt() @Min(1)
  concurrency?: number; // How many jobs can run simultaneously
}