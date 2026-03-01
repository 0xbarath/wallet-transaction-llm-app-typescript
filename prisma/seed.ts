import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const addressLabels = [
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
    address: '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9',
    protocol: 'aave-v2',
    label: 'Aave V2: Lending Pool',
    category: 'lending',
    source: 'curated',
    confidence: 0.99,
  },
  {
    network: 'eth-mainnet',
    address: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',
    protocol: 'uniswap-v3',
    label: 'Uniswap V3: Router 2',
    category: 'dex',
    source: 'curated',
    confidence: 0.99,
  },
  {
    network: 'eth-mainnet',
    address: '0xe592427a0aece92de3edee1f18e0157c05861564',
    protocol: 'uniswap-v3',
    label: 'Uniswap V3: Router',
    category: 'dex',
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
  {
    network: 'eth-mainnet',
    address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
    protocol: 'lido',
    label: 'Lido: stETH',
    category: 'staking',
    source: 'curated',
    confidence: 0.99,
  },
  {
    network: 'eth-mainnet',
    address: '0xc3d688b66703497daa19211eedff47f25384cdc3',
    protocol: 'compound-v3',
    label: 'Compound V3: cUSDCv3',
    category: 'lending',
    source: 'curated',
    confidence: 0.99,
  },
  {
    network: 'eth-mainnet',
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    protocol: 'weth',
    label: 'WETH',
    category: 'token',
    source: 'curated',
    confidence: 0.99,
  },
];

async function main() {
  for (const label of addressLabels) {
    await prisma.addressLabel.upsert({
      where: {
        network_address: {
          network: label.network,
          address: label.address,
        },
      },
      update: {
        protocol: label.protocol,
        label: label.label,
        category: label.category,
        source: label.source,
        confidence: label.confidence,
      },
      create: label,
    });
  }
  console.log('Seeded address labels');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
