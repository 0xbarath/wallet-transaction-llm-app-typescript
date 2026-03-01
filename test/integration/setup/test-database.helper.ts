import { PrismaClient } from '@prisma/client';

export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE transfers CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE wallet_sync_state CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE wallets CASCADE');
  // Don't truncate address_labels — kept for seed data
}

export async function seedAddressLabels(prisma: PrismaClient): Promise<void> {
  const labels = [
    {
      network: 'eth-mainnet',
      address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
      protocol: 'aave-v3',
      label: 'Aave V3: Pool',
      category: 'lending',
      source: 'curated',
      confidence: 0.99,
    },
    {
      network: 'eth-mainnet',
      address: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
      protocol: 'uniswap-v2',
      label: 'Uniswap V2: Router',
      category: 'dex',
      source: 'curated',
      confidence: 0.99,
    },
  ];

  for (const label of labels) {
    await prisma.addressLabel.upsert({
      where: { network_address: { network: label.network, address: label.address } },
      update: {},
      create: label,
    });
  }
}
