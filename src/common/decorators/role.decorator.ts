import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Role = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.role || 'user';
});
