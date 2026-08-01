import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { compact, intersection } from 'lodash';
import { PERMISSION_METADATA_KEY } from '../decorators/permission.decorator';

type AuthenticatedRequest = {
  user?: {
    details?: {
      roles_permissions?: Array<{ permission_id?: string }>;
    };
  };
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userPermissions = compact(
      request.user?.details?.roles_permissions?.map(
        (permission) => permission.permission_id,
      ),
    );
    const hasPermission =
      intersection(requiredPermissions, userPermissions).length > 0;

    if (!hasPermission) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    return true;
  }
}
