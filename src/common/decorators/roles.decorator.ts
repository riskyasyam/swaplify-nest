import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: ('ADMIN')[]) => SetMetadata(ROLES_KEY, roles);