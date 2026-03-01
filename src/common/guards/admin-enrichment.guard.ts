import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';

@Injectable()
export class AdminEnrichmentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    if ((req as any).role !== 'admin') {
      res.status(403).json({
        type: 'https://example.com/problems/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Admin role required',
      });
      return false;
    }
    return true;
  }
}
