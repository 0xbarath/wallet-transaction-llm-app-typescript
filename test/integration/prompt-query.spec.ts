import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as nock from 'nock';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient, Direction, TransferCategory, Prisma } from '@prisma/client';
import { execSync } from 'child_process';
import { createTestApp } from './setup/test-app.factory';
import { cleanDatabase } from './setup/test-database.helper';
import * as parseEthOut from './fixtures/anthropic-prompt-parse-outgoing-eth.json';
import * as parseUsdc from './fixtures/anthropic-prompt-parse-usdc.json';

describe('Prompt Query (Integration)', () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let databaseUrl: string;
  let walletId: string;

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

    const wallet = await prisma.wallet.create({
      data: {
        address: '0x1234567890abcdef1234567890abcdef12345678',
        network: 'eth-mainnet',
      },
    });
    walletId = wallet.id;
    await prisma.walletSyncState.create({ data: { walletId } });

    await prisma.transfer.createMany({
      data: [
        {
          walletId,
          network: 'eth-mainnet',
          uniqueId: 'tx-1',
          hash: '0xaaa',
          blockNum: BigInt(100),
          fromAddr: '0x1234567890abcdef1234567890abcdef12345678',
          toAddr: '0xother',
          direction: Direction.OUT,
          asset: 'ETH',
          category: TransferCategory.EXTERNAL,
          valueDecimal: new Prisma.Decimal('1.5'),
        },
        {
          walletId,
          network: 'eth-mainnet',
          uniqueId: 'tx-2',
          hash: '0xbbb',
          blockNum: BigInt(101),
          fromAddr: '0xother',
          toAddr: '0x1234567890abcdef1234567890abcdef12345678',
          direction: Direction.IN,
          asset: 'USDC',
          category: TransferCategory.ERC20,
          valueDecimal: new Prisma.Decimal('100'),
        },
      ],
    });
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await container?.stop();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  const authHeaders = { 'X-Auth-WalletAccess': 'allow' };

  it('should parse "show outgoing ETH" and return results', async () => {
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, parseEthOut);

    const res = await request(app.getHttpServer())
      .post('/v1/transactions/query')
      .set(authHeaders)
      .send({ walletId, prompt: 'show outgoing ETH transactions' })
      .expect(200);

    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].direction).toBe('OUT');
    expect(res.body.items[0].asset).toBe('ETH');
    expect(res.body.querySpec.direction).toBe('OUT');
    expect(res.body.querySpec.assets).toContain('ETH');
  });

  it('should parse "show USDC" and return results', async () => {
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, parseUsdc);

    const res = await request(app.getHttpServer())
      .post('/v1/transactions/query')
      .set(authHeaders)
      .send({ walletId, prompt: 'show USDC transfers' })
      .expect(200);

    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].asset).toBe('USDC');
  });

  it('should reject missing walletId (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/transactions/query')
      .set(authHeaders)
      .send({ prompt: 'show ETH' })
      .expect(400);
  });

  it('should reject empty prompt (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/transactions/query')
      .set(authHeaders)
      .send({ walletId, prompt: '' })
      .expect(400);
  });
});
