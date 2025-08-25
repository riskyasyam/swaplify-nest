import { IsString, IsOptional, IsEnum } from 'class-validator';

export class UpdateUserSubscriptionDto {
  @IsOptional()
  @IsEnum(['FREE', 'PREMIUM', 'PRO'])
  plan?: 'FREE' | 'PREMIUM' | 'PRO';

  @IsOptional()
  @IsEnum(['FREE', 'PREMIUM', 'PRO'])
  planCode?: 'FREE' | 'PREMIUM' | 'PRO';

  @IsOptional()
  @IsEnum(['ACTIVE', 'CANCELLED', 'PAST_DUE'])
  status?: 'ACTIVE' | 'CANCELLED' | 'PAST_DUE';

  @IsOptional()
  @IsString()
  billingRef?: string; // referensi billing jika berbayar
}

export class UpdateUserRoleDto {
  @IsEnum(['USER', 'ADMIN'])
  role: 'USER' | 'ADMIN';
}

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}
