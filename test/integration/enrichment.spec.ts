import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as nock from 'nock';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { createTestApp } from './setup/test-app.factory';
import { seedAddressLabels } from './setup/test-database.helper';
import * as receipt from './fixtures/alchemy-receipt.json';
import * as explainResponse from './fixtures/anthropic-explain-response.json';

describe('Enrichment (Integration)', () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let databaseUrl: string;

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
    app = await createTestApp(databaseUrl);
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await container?.stop();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  const adminHeaders = {
    'X-Auth-WalletAccess': 'allow',
    'X-Role': 'admin',
  };
  const userHeaders = {
    'X-Auth-WalletAccess': 'allow',
  };

  const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  it('should explain a transaction (admin)', async () => {
    // Mock Alchemy receipt
    nock('https://eth-mainnet.g.alchemy.com')
      .post('/v2/test-api-key', (body: any) => body.method === 'eth_getTransactionReceipt')
      .reply(200, { jsonrpc: '2.0', id: 1, result: receipt });

    // Mock Anthropic
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, explainResponse);

    const res = await request(app.getHttpServer())
      .post('/v1/transactions/explain')
      .set(adminHeaders)
      .send({ txHash })
      .expect(200);

    expect(res.body.txHash).toBe(txHash);
    expect(res.body.status).toBeDefined();
    expect(res.body.evidence).toBeDefined();
    expect(Array.isArray(res.body.evidence)).toBe(true);
  });

  it('should reject non-admin (403)', async () => {
    await request(app.getHttpServer())
      .post('/v1/transactions/explain')
      .set(userHeaders)
      .send({ txHash })
      .expect(403);
  });

  it('should return FAILED for non-existent receipt', async () => {
    nock('https://eth-mainnet.g.alchemy.com')
      .post('/v2/test-api-key', (body: any) => body.method === 'eth_getTransactionReceipt')
      .reply(200, { jsonrpc: '2.0', id: 1, result: null });

    const res = await request(app.getHttpServer())
      .post('/v1/transactions/explain')
      .set(adminHeaders)
      .send({ txHash })
      .expect(200);

    expect(res.body.status).toBe('FAILED');
  });

  it('should reject invalid tx hash (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/transactions/explain')
      .set(adminHeaders)
      .send({ txHash: 'invalid' })
      .expect(400);
  });

  it('should return ENRICHED without explanation when explain=false', async () => {
    // Mock Alchemy receipt only — no Anthropic mock (LLM should not be called)
    nock('https://eth-mainnet.g.alchemy.com')
      .post('/v2/test-api-key', (body: any) => body.method === 'eth_getTransactionReceipt')
      .reply(200, { jsonrpc: '2.0', id: 1, result: receipt });

    const res = await request(app.getHttpServer())
      .post('/v1/transactions/explain')
      .set(adminHeaders)
      .send({ txHash, explain: false })
      .expect(200);

    expect(res.body.status).toBe('ENRICHED');
    expect(res.body.explanation).toBeNull();
    expect(res.body.operation).toBeDefined();
    expect(res.body.evidence).toBeDefined();
    expect(Array.isArray(res.body.evidence)).toBe(true);
    expect(res.body.evidence.length).toBeGreaterThan(0);
  });

  it('should reject missing role header with default user role (403)', async () => {
    // Only send wallet access header, no X-Role → defaults to 'user' → 403
    await request(app.getHttpServer())
      .post('/v1/transactions/explain')
      .send({ txHash })
      .set({ 'X-Auth-WalletAccess': 'allow' })
      .expect(403);
  });
});
