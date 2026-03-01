import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const authHeader = req.headers['x-auth-walletaccess'];

    if (authHeader !== 'allow') {
      res.status(401).json({
        type: 'https://example.com/problems/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing or invalid X-Auth-WalletAccess header',
      });
      return false;
    }
    return true;
  }
}
