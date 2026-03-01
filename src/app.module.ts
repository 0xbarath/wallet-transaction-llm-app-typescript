import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { configModuleOptions } from './app.config';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './prisma/prisma.module';
import { WalletModule } from './wallet/wallet.module';
import { SyncModule } from './sync/sync.module';
import { AlchemyModule } from './alchemy/alchemy.module';
import { TransactionModule } from './transaction/transaction.module';
import { EnrichmentModule } from './enrichment/enrichment.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot(configModuleOptions),
    ScheduleModule.forRoot(),
    CommonModule,
    PrismaModule,
    WalletModule,
    SyncModule,
    AlchemyModule,
    TransactionModule,
    EnrichmentModule,
    HealthModule,
  ],
})
export class AppModule {}
