import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient, Direction, TransferCategory, Prisma } from '@prisma/client';
import { execSync } from 'child_process';
import { createTestApp } from './setup/test-app.factory';
import { cleanDatabase } from './setup/test-database.helper';

describe('Transaction Query (Integration)', () => {
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

    // Create wallet and insert test transfers
    const wallet = await prisma.wallet.create({
      data: {
        address: '0x1234567890abcdef1234567890abcdef12345678',
        network: 'eth-mainnet',
      },
    });
    walletId = wallet.id;
    await prisma.walletSyncState.create({ data: { walletId } });

    const transfers = [
      {
        walletId,
        network: 'eth-mainnet',
        uniqueId: 'tx-1',
        hash: '0xaaa',
        blockNum: BigInt(100),
        fromAddr: '0xfrom',
        toAddr: '0x1234567890abcdef1234567890abcdef12345678',
        direction: Direction.IN,
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
        fromAddr: '0x1234567890abcdef1234567890abcdef12345678',
        toAddr: '0xother',
        direction: Direction.OUT,
        asset: 'USDC',
        category: TransferCategory.ERC20,
        valueDecimal: new Prisma.Decimal('100'),
      },
      {
        walletId,
        network: 'eth-mainnet',
        uniqueId: 'tx-3',
        hash: '0xccc',
        blockNum: BigInt(102),
        fromAddr: '0xfrom',
        toAddr: '0x1234567890abcdef1234567890abcdef12345678',
        direction: Direction.IN,
        asset: 'ETH',
        category: TransferCategory.INTERNAL,
        valueDecimal: new Prisma.Decimal('0.01'),
      },
    ];

    await prisma.transfer.createMany({ data: transfers });
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await container?.stop();
  });

  const authHeaders = { 'X-Auth-WalletAccess': 'allow' };

  it('should query all non-INTERNAL transfers for user', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/transactions?walletId=${walletId}`)
      .set(authHeaders)
      .expect(200);

    expect(res.body.items.length).toBe(2);
    expect(res.body.items.every((t: any) => t.category !== 'INTERNAL')).toBe(true);
  });

  it('should include INTERNAL transfers for admin', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/transactions?walletId=${walletId}`)
      .set({ ...authHeaders, 'X-Role': 'admin' })
      .expect(200);

    expect(res.body.items.length).toBe(3);
  });

  it('should filter by direction', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/transactions?walletId=${walletId}&direction=IN`)
      .set(authHeaders)
      .expect(200);

    expect(res.body.items.every((t: any) => t.direction === 'IN')).toBe(true);
  });

  it('should filter by asset', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/transactions?walletId=${walletId}&asset=ETH`)
      .set(authHeaders)
      .expect(200);

    expect(res.body.items.every((t: any) => t.asset === 'ETH')).toBe(true);
  });

  it('should support cursor pagination', async () => {
    const page1 = await request(app.getHttpServer())
      .get(`/v1/transactions?walletId=${walletId}&limit=1`)
      .set({ ...authHeaders, 'X-Role': 'admin' })
      .expect(200);

    expect(page1.body.items.length).toBe(1);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await request(app.getHttpServer())
      .get(`/v1/transactions?walletId=${walletId}&limit=1&cursor=${page1.body.nextCursor}`)
      .set({ ...authHeaders, 'X-Role': 'admin' })
      .expect(200);

    expect(page2.body.items.length).toBe(1);
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
  });

  it('should reject missing walletId (400)', async () => {
    await request(app.getHttpServer()).get('/v1/transactions').set(authHeaders).expect(400);
  });
});
