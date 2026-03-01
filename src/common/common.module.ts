import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { AuthGuard } from './guards/auth.guard';
import { RbacGuard } from './guards/rbac.guard';
import { LoggingInterceptor } from './interceptors/logging.interceptor';

@Module({
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
