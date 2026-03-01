import { AdminEnrichmentGuard } from '../../src/common/guards/admin-enrichment.guard';
import { ExecutionContext } from '@nestjs/common';

function mockContext(role: string) {
  const req: any = { role };
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

describe('AdminEnrichmentGuard', () => {
  const guard = new AdminEnrichmentGuard();

  it('should allow admin', () => {
    const ctx = mockContext('admin');
    const result = guard.canActivate(ctx as unknown as ExecutionContext);
    expect(result).toBe(true);
  });

  it('should block non-admin', () => {
    const ctx = mockContext('user');
    const result = guard.canActivate(ctx as unknown as ExecutionContext);
    expect(result).toBe(false);
    expect(ctx.res.status).toHaveBeenCalledWith(403);
    expect(ctx.res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 403,
        detail: 'Admin role required',
      }),
    );
  });
});
