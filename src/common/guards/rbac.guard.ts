import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';

const VALID_ROLES = ['admin', 'user'];

@Injectable()
export class RbacGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const roleHeader = req.headers['x-role'] as string | undefined;
    const role = roleHeader ? roleHeader.toLowerCase() : 'user';

    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({
        type: 'https://example.com/problems/bad-request',
        title: 'Bad Request',
        status: 400,
        detail: `Invalid role: ${roleHeader}. Must be one of: ${VALID_ROLES.join(', ')}`,
      });
      return false;
    }

    (req as any).role = role;
    return true;
  }
}
