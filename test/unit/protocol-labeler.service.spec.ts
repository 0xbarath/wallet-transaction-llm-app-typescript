import { ProtocolLabelerService } from '../../src/enrichment/protocol-labeler.service';
import { AlchemyTransactionReceipt } from '../../src/alchemy/types/alchemy-transfer.type';

describe('ProtocolLabelerService', () => {
  let service: ProtocolLabelerService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      addressLabel: {
        findMany: jest.fn(),
      },
    };
    service = new ProtocolLabelerService(mockPrisma);
  });

  const receipt: AlchemyTransactionReceipt = {
    status: '0x1',
    blockNumber: '0x112a880',
    from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    to: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
    contractAddress: null,
    gasUsed: '0x1e848',
    transactionHash: '0xabc123',
    logs: [
      {
        address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
        topics: ['0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61'],
        data: '0x0001',
        logIndex: '0x0',
        removed: false,
      },
    ],
  };

  it('should label known addresses', async () => {
    mockPrisma.addressLabel.findMany.mockResolvedValue([
      {
        address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
        protocol: 'aave-v3',
        label: 'Aave V3: Pool',
        confidence: { toString: () => '0.99' },
        source: 'curated',
        category: 'lending',
      },
    ]);

    const result = await service.label(receipt, 'eth-mainnet', []);
    expect(result.hints).toHaveLength(1);
    expect(result.hints[0].protocol).toBe('aave-v3');
    expect(result.hints[0].label).toBe('Aave V3: Pool');
  });

  it('should return empty for unknown addresses', async () => {
    mockPrisma.addressLabel.findMany.mockResolvedValue([]);
    const result = await service.label(receipt, 'eth-mainnet', []);
    expect(result.hints).toHaveLength(0);
  });

  it('should create ev:label:to for "to" address', async () => {
    mockPrisma.addressLabel.findMany.mockResolvedValue([
      {
        address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
        protocol: 'aave-v3',
        label: 'Aave V3: Pool',
        confidence: { toString: () => '0.99' },
        source: 'curated',
        category: 'lending',
      },
    ]);

    const result = await service.label(receipt, 'eth-mainnet', []);
    const labelEvidence = result.evidenceItems.find((e) => e.id === 'ev:label:to');
    expect(labelEvidence).toBeDefined();
    expect(labelEvidence!.fields.protocol).toBe('aave-v3');
  });
});
