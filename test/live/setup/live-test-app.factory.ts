import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from '../../../src/common/common.module';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { WalletModule } from '../../../src/wallet/wallet.module';
import { SyncModule } from '../../../src/sync/sync.module';
import { AlchemyModule } from '../../../src/alchemy/alchemy.module';
import { TransactionModule } from '../../../src/transaction/transaction.module';
import { EnrichmentModule } from '../../../src/enrichment/enrichment.module';
import { HealthModule } from '../../../src/health/health.module';
import { GlobalExceptionFilter } from '../../../src/common/filters/global-exception.filter';

export async function createLiveTestApp(databaseUrl: string): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            alchemy: {
              apiKey: process.env.ALCHEMY_API_KEY,
              rpcUrl: process.env.ALCHEMY_RPC_URL,
              maxCount: 1000,
              timeout: 60000,
            },
            anthropic: {
              apiKey: process.env.ANTHROPIC_API_KEY,
              promptParserModel: 'claude-sonnet-4-20250514',
              promptParserMaxTokens: 1024,
              enrichmentModel: 'claude-sonnet-4-20250514',
              enrichmentMaxTokens: 2048,
              timeout: 60000,
            },
            rateLimit: {
              tokensPerSecond: 2,
              capacity: 5,
            },
          }),
        ],
      }),
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
  }).compile();

  const app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  process.env.DATABASE_URL = databaseUrl;
  await app.init();

  return app;
}
