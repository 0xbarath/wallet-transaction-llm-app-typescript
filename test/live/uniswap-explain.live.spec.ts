import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import { createLiveTestApp } from './setup/live-test-app.factory';
import { hasLiveCredentials } from './setup/skip-if-no-credentials';
import { seedAddressLabels } from '../integration/setup/test-database.helper';

dotenv.config();

const describeIfCredentials = hasLiveCredentials() ? describe : describe.skip;

describeIfCredentials('Uniswap Explain (LiveIT)', () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let databaseUrl: string;

  const adminHeaders = {
    'X-Auth-WalletAccess': 'allow',
    'X-Role': 'admin',
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync(`npx prisma migrate deploy`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      cwd: process.cwd(),
    });

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    await seedAddressLabels(prisma);
    app = await createLiveTestApp(databaseUrl);
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('should explain a Uniswap swap with real APIs', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/transactions/explain')
      .set(adminHeaders)
      .send({
        txHash: '0x62ecf30b1bc21b15ede12076df45cfaa16bae581b1b765662c0bbbb60a847f2e',
        network: 'eth-mainnet',
        explain: true,
      })
      .expect(200);

    expect(res.body.status).toBe('ENRICHED');
    expect(res.body.explanation).toBeDefined();
    expect(res.body.explanation.summary).toBeTruthy();
    expect(Array.isArray(res.body.explanation.steps)).toBe(true);
    expect(res.body.explanation.steps.length).toBeGreaterThan(0);
  });
});
