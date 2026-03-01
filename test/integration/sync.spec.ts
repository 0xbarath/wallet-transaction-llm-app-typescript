import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as nock from 'nock';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { createTestApp } from './setup/test-app.factory';
import { cleanDatabase } from './setup/test-database.helper';
import * as page1 from './fixtures/alchemy-transfers-page1.json';
import * as page2 from './fixtures/alchemy-transfers-page2.json';
import * as empty from './fixtures/alchemy-transfers-empty.json';

describe('Sync (Integration)', () => {
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
    // Mock IN transfers (page1 + page2)
    nock('https://eth-mainnet.g.alchemy.com')
      .post('/v2/test-api-key', (body: any) => {
        return body.method === 'alchemy_getAssetTransfers' && body.params?.[0]?.toAddress;
      })
      .reply(200, { jsonrpc: '2.0', id: 1, result: page1 })
      .post('/v2/test-api-key', (body: any) => {
        return (
          body.method === 'alchemy_getAssetTransfers' &&
          body.params?.[0]?.toAddress &&
          body.params?.[0]?.pageKey === 'page2key'
        );
      })
      .reply(200, { jsonrpc: '2.0', id: 1, result: page2 });

    // Mock OUT transfers (empty)
    nock('https://eth-mainnet.g.alchemy.com')
      .post('/v2/test-api-key', (body: any) => {
        return body.method === 'alchemy_getAssetTransfers' && body.params?.[0]?.fromAddress;
      })
      .reply(200, { jsonrpc: '2.0', id: 1, result: empty });
  }

  it('should sync transfers from Alchemy', async () => {
    const walletId = await registerWallet();
    mockAlchemyTransfers();

    const res = await request(app.getHttpServer())
      .post(`/v1/wallets/${walletId}/sync`)
      .set(authHeaders)
      .send({})
      .expect(200);

    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.transfersSynced).toBeGreaterThan(0);

    // Verify transfers in DB
    const transfers = await prisma.transfer.findMany({ where: { walletId } });
    expect(transfers.length).toBeGreaterThan(0);
  });

  it('should return 404 for non-existent wallet sync', async () => {
    await request(app.getHttpServer())
      .post('/v1/wallets/00000000-0000-0000-0000-000000000000/sync')
      .set(authHeaders)
      .send({})
      .expect(404);
  });
});
