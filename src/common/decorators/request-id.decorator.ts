import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const RequestId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.headers['x-request-id'] || '';
});
