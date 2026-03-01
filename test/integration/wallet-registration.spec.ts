import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { createTestApp } from './setup/test-app.factory';
import { cleanDatabase } from './setup/test-database.helper';

describe('Wallet Registration (Integration)', () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let databaseUrl: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    // Run migrations
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
  });

  const authHeaders = { 'X-Auth-WalletAccess': 'allow' };

  it('should register a wallet (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/wallets')
      .set(authHeaders)
      .send({ address: '0x1234567890abcdef1234567890abcdef12345678' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.address).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(res.body.network).toBe('eth-mainnet');
  });

  it('should normalize address to lowercase', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/wallets')
      .set(authHeaders)
      .send({ address: '0x1234567890ABCDEF1234567890ABCDEF12345678' })
      .expect(201);

    expect(res.body.address).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });

  it('should reject duplicate wallet (409)', async () => {
    await request(app.getHttpServer())
      .post('/v1/wallets')
      .set(authHeaders)
      .send({ address: '0x1234567890abcdef1234567890abcdef12345678' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/v1/wallets')
      .set(authHeaders)
      .send({ address: '0x1234567890abcdef1234567890abcdef12345678' })
      .expect(409);

    expect(res.body.status).toBe(409);
  });

  it('should reject invalid address (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/wallets')
      .set(authHeaders)
      .send({ address: 'invalid' })
      .expect(400);

    expect(res.body.errors).toBeDefined();
  });

  it('should reject missing auth header (401)', async () => {
    await request(app.getHttpServer())
      .post('/v1/wallets')
      .send({ address: '0x1234567890abcdef1234567890abcdef12345678' })
      .expect(401);
  });

  it('should update wallet label', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/wallets')
      .set(authHeaders)
      .send({ address: '0x1234567890abcdef1234567890abcdef12345678', label: 'My Wallet' })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/v1/wallets/${created.body.id}`)
      .set(authHeaders)
      .send({ label: 'Updated Label' })
      .expect(200);

    expect(updated.body.label).toBe('Updated Label');
  });

  it('should return 404 for non-existent wallet update', async () => {
    await request(app.getHttpServer())
      .patch('/v1/wallets/00000000-0000-0000-0000-000000000000')
      .set(authHeaders)
      .send({ label: 'test' })
      .expect(404);
  });
});
