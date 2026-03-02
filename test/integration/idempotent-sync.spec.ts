import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as nock from 'nock';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { createTestApp } from './setup/test-app.factory';
import { cleanDatabase } from './setup/test-database.helper';
import * as page1 from './fixtures/alchemy-transfers-page1.json';
import * as empty from './fixtures/alchemy-transfers-empty.json';

describe('Idempotent Sync (Integration)', () => {
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
    app = await createTestApp(databaseUrl);
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  const authHeaders = { 'X-Auth-WalletAccess': 'allow' };

  async function registerWallet(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/v1/wallets')
      .set(authHeaders)
      .send({ address: '0x1234567890abcdef1234567890abcdef12345678' });
    return res.body.id;
  }

  function mockAlchemyTransfers() {
    // Mock IN transfers (page1 → empty)
    nock('https://eth-mainnet.g.alchemy.com')
      .post('/v2/test-api-key', (body: any) => {
        return (
          body.method === 'alchemy_getAssetTransfers' &&
          body.params?.[0]?.toAddress &&
          !body.params?.[0]?.pageKey
        );
      })
      .reply(200, { jsonrpc: '2.0', id: 1, result: page1 })
      .post('/v2/test-api-key', (body: any) => {
        return (
          body.method === 'alchemy_getAssetTransfers' &&
          body.params?.[0]?.toAddress &&
          body.params?.[0]?.pageKey === 'page2key'
        );
      })
      .reply(200, { jsonrpc: '2.0', id: 1, result: empty });

    // Mock OUT transfers (empty)
    nock('https://eth-mainnet.g.alchemy.com')
      .post('/v2/test-api-key', (body: any) => {
        return body.method === 'alchemy_getAssetTransfers' && body.params?.[0]?.fromAddress;
      })
      .reply(200, { jsonrpc: '2.0', id: 1, result: empty });
  }

  it('should not create duplicate transfers on second sync', async () => {
    const walletId = await registerWallet();

    // First sync
    mockAlchemyTransfers();
    const firstRes = await request(app.getHttpServer())
      .post(`/v1/wallets/${walletId}/sync`)
      .set(authHeaders)
      .send({})
      .expect(200);

    expect(firstRes.body.status).toBe('COMPLETED');
    const firstSyncCount = firstRes.body.transfersSynced;
    expect(firstSyncCount).toBeGreaterThan(0);

    const countAfterFirst = await prisma.transfer.count({ where: { walletId } });
    expect(countAfterFirst).toBe(firstSyncCount);

    // Second sync with same data
    mockAlchemyTransfers();
    const secondRes = await request(app.getHttpServer())
      .post(`/v1/wallets/${walletId}/sync`)
      .set(authHeaders)
      .send({})
      .expect(200);

    expect(secondRes.body.status).toBe('COMPLETED');
    expect(secondRes.body.transfersSynced).toBe(0);

    // Verify no duplicates
    const countAfterSecond = await prisma.transfer.count({ where: { walletId } });
    expect(countAfterSecond).toBe(countAfterFirst);
  });
});
