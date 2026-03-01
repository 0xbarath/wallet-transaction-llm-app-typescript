import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient, Direction, TransferCategory, Prisma } from '@prisma/client';
import { execSync } from 'child_process';
import { createTestApp } from './setup/test-app.factory';
import { cleanDatabase } from './setup/test-database.helper';

describe('RBAC (Integration)', () => {
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
          uniqueId: 'tx-ext-1',
          hash: '0xaaa',
          blockNum: BigInt(100),
          fromAddr: '0xfrom',
          toAddr: '0x1234567890abcdef1234567890abcdef12345678',
          direction: Direction.IN,
          asset: 'ETH',
          category: TransferCategory.EXTERNAL,
          valueDecimal: new Prisma.Decimal('1'),
        },
        {
          walletId,
          network: 'eth-mainnet',
          uniqueId: 'tx-int-1',
          hash: '0xbbb',
          blockNum: BigInt(101),
          fromAddr: '0xfrom',
          toAddr: '0x1234567890abcdef1234567890abcdef12345678',
          direction: Direction.IN,
          asset: 'ETH',
          category: TransferCategory.INTERNAL,
          valueDecimal: new Prisma.Decimal('0.01'),
        },
      ],
    });
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('should exclude INTERNAL for user role', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/transactions?walletId=${walletId}`)
      .set({ 'X-Auth-WalletAccess': 'allow' })
      .expect(200);

    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].category).toBe('EXTERNAL');
  });

  it('should include INTERNAL for admin role', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/transactions?walletId=${walletId}`)
      .set({ 'X-Auth-WalletAccess': 'allow', 'X-Role': 'admin' })
      .expect(200);

    expect(res.body.items.length).toBe(2);
  });

  it('should reject invalid role header', async () => {
    await request(app.getHttpServer())
      .get(`/v1/transactions?walletId=${walletId}`)
      .set({ 'X-Auth-WalletAccess': 'allow', 'X-Role': 'superadmin' })
      .expect(400);
  });

  it('should forbid INTERNAL-only query for user', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/transactions?walletId=${walletId}&category=INTERNAL`)
      .set({ 'X-Auth-WalletAccess': 'allow' })
      .expect(403);

    expect(res.body.status).toBe(403);
  });

  it('should allow INTERNAL query for admin', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/transactions?walletId=${walletId}&category=INTERNAL`)
      .set({ 'X-Auth-WalletAccess': 'allow', 'X-Role': 'admin' })
      .expect(200);

    expect(res.body.items.every((t: any) => t.category === 'INTERNAL')).toBe(true);
  });
});
