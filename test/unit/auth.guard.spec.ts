import { AuthGuard } from '../../src/common/guards/auth.guard';
import { ExecutionContext } from '@nestjs/common';

function mockContext(authHeader?: string) {
  const req: any = { headers: {} };
  if (authHeader !== undefined) {
    req.headers['x-auth-walletaccess'] = authHeader;
  }
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    req,
    res,
  };
}

describe('AuthGuard', () => {
  const guard = new AuthGuard();

  it('should allow with valid header', () => {
    const ctx = mockContext('allow');
    const result = guard.canActivate(ctx as unknown as ExecutionContext);
    expect(result).toBe(true);
  });

  it('should block with missing header', () => {
    const ctx = mockContext();
    const result = guard.canActivate(ctx as unknown as ExecutionContext);
    expect(result).toBe(false);
    expect(ctx.res.status).toHaveBeenCalledWith(401);
  });

  it('should block with invalid header value', () => {
    const ctx = mockContext('deny');
    const result = guard.canActivate(ctx as unknown as ExecutionContext);
    expect(result).toBe(false);
    expect(ctx.res.status).toHaveBeenCalledWith(401);
  });
});
