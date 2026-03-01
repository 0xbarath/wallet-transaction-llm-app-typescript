import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { RateLimiterService } from './rate-limiter.service';
import { AlchemyModule } from '../alchemy/alchemy.module';

@Module({
  imports: [AlchemyModule],
  providers: [SyncService, RateLimiterService],
  exports: [SyncService],
})
export class SyncModule {}
