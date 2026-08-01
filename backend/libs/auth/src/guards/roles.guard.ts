import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { compact, intersection } from 'lodash';
import { ROLE_METADATA_KEY } from '../decorators/role.decorator';

type AuthenticatedRequest = {
  user?: {
    details?: {
      roles?: Array<{ key?: string }>;
    };
  };
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userRoles = compact(
      request.user?.details?.roles?.map((role) => role.key),
    );
    const hasRole = intersection(requiredRoles, userRoles).length > 0;

    if (!hasRole) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    return true;
  }
}
