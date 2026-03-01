import { RbacGuard } from '../../src/common/guards/rbac.guard';
import { ExecutionContext } from '@nestjs/common';

function mockContext(roleHeader?: string) {
  const req: any = { headers: {}, role: undefined };
  if (roleHeader !== undefined) {
    req.headers['x-role'] = roleHeader;
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

describe('RbacGuard', () => {
  const guard = new RbacGuard();

  it('should default to user when no header', () => {
    const ctx = mockContext();
    const result = guard.canActivate(ctx as unknown as ExecutionContext);
    expect(result).toBe(true);
    expect(ctx.req.role).toBe('user');
  });

  it('should set admin role', () => {
    const ctx = mockContext('admin');
    const result = guard.canActivate(ctx as unknown as ExecutionContext);
    expect(result).toBe(true);
    expect(ctx.req.role).toBe('admin');
  });

  it('should set user role', () => {
    const ctx = mockContext('user');
    const result = guard.canActivate(ctx as unknown as ExecutionContext);
    expect(result).toBe(true);
    expect(ctx.req.role).toBe('user');
  });

  it('should reject invalid role', () => {
    const ctx = mockContext('superadmin');
    const result = guard.canActivate(ctx as unknown as ExecutionContext);
    expect(result).toBe(false);
    expect(ctx.res.status).toHaveBeenCalledWith(400);
  });

  it('should normalize case', () => {
    const ctx = mockContext('Admin');
    const result = guard.canActivate(ctx as unknown as ExecutionContext);
    expect(result).toBe(true);
    expect(ctx.req.role).toBe('admin');
  });
});
