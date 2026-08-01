import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { compact, intersection } from 'lodash';
import { ROLE_METADATA_KEY } from '../decorators/role.decorator';

/** Requires the authenticated user to own the user-scoped resource in the request. */
@Injectable()
export class ResourceOwnerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: {
        sub?: string;
        details?: { roles?: Array<{ key?: string; name?: string }> };
      };
      params?: { id?: string; userId?: string };
      body?: { userId?: string };
    }>();
    const resourceUserId =
      request.params?.id ?? request.params?.userId ?? request.body?.userId;

    const allowedRoles = this.reflector.getAllAndOverride<string[]>(
      ROLE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    // RolesGuard and the JWT payload use the role key (for example,
    // `ADMINISTRATOR`). Keep `name` as a backwards-compatible fallback for
    // tokens/data created before role keys were standardized.
    const userRoles = compact(
      request.user?.details?.roles?.map((role) => role.key),
    );
    const hasAllowedRole = allowedRoles
      ? intersection(allowedRoles, userRoles).length > 0
      : false;

    if (hasAllowedRole) {
      return true;
    }

    if (!resourceUserId || request.user?.sub !== resourceUserId) {
      throw new ForbiddenException('You can only access your own resource');
    }

    return true;
  }
}
