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

describeIfCredentials('Full Flow (LiveIT)', () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let databaseUrl: string;

  let walletId: string;

  const walletAddress = '0x7e00c573fffc25a7721fa88e098d2f3de0a1feed';

  const authHeaders = { 'X-Auth-WalletAccess': 'allow' };
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

  it('should register a wallet', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/wallets')
      .set(authHeaders)
      .send({ address: walletAddress })
      .expect(201);

    expect(res.body.id).toBeDefined();
    walletId = res.body.id;
  });

  it('should update wallet label', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/wallets/${walletId}`)
      .set(authHeaders)
      .send({ label: 'updated-live-wallet' })
      .expect(200);

    expect(res.body.label).toBe('updated-live-wallet');
  });

  it('should sync wallet', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/wallets/${walletId}/sync`)
      .set(authHeaders)
      .send({ lookbackDays: 30 })
      .expect(200);

    expect(res.body.status).toBe('COMPLETED');
    expect(typeof res.body.transfersSynced).toBe('number');
  });

  it('should query transactions', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/transactions?walletId=${walletId}`)
      .set(adminHeaders)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.querySpec.walletId).toBe(walletId);

    if (res.body.items.length > 0) {
      const item = res.body.items[0];
      expect(item.id).toBeDefined();
      expect(item.network).toBeDefined();
      expect(item.direction).toBeDefined();
      expect(item.asset).toBeDefined();
    }
  });

  it('should prompt query transactions', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/transactions:query')
      .set(adminHeaders)
      .send({ walletId, prompt: 'show me recent ETH transfers' })
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('should explain a transaction', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/transactions/explain')
      .set(adminHeaders)
      .send({
        txHash: '0x62ecf30b1bc21b15ede12076df45cfaa16bae581b1b765662c0bbbb60a847f2e',
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
