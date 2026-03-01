import { LlmExplainerService } from '../../src/enrichment/llm-explainer.service';
import { EvidenceItem, ProtocolHint } from '../../src/enrichment/types/evidence.types';

describe('LlmExplainerService', () => {
  let service: LlmExplainerService;
  let mockCreate: jest.Mock;

  const evidenceItems: EvidenceItem[] = [
    {
      id: 'ev:tx',
      type: 'transaction',
      fields: {
        from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        to: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
        status: '0x1',
        blockNumber: '0x112a880',
        gasUsed: '0x1e848',
        transactionHash: '0xabc',
      },
    },
    {
      id: 'ev:log:0',
      type: 'log',
      fields: {
        address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
        topics:
          '["0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61","0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]',
        data: '0x0001',
      },
    },
    {
      id: 'ev:label:to',
      type: 'label',
      fields: {
        address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
        protocol: 'aave-v3',
        label: 'Aave V3: Pool',
      },
    },
  ];

  const protocolHints: ProtocolHint[] = [
    {
      address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
      protocol: 'aave-v3',
      label: 'Aave V3: Pool',
      confidence: '0.99',
      source: 'curated',
      category: 'lending',
    },
  ];

  beforeEach(() => {
    mockCreate = jest.fn();
    const mockConfig = {
      get: jest.fn((key: string) => {
        const map: Record<string, any> = {
          'anthropic.apiKey': 'test-key',
          'anthropic.enrichmentModel': 'claude-sonnet-4-20250514',
          'anthropic.enrichmentMaxTokens': 2048,
        };
        return map[key];
      }),
    };
    service = new LlmExplainerService(mockConfig as any);
    (service as any).client = { messages: { create: mockCreate } };
  });

  it('should return valid explanation', async () => {
    const explanation = {
      summary:
        'Transaction from 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa to Aave V3 Pool at 0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
      steps: [
        {
          text: 'User supplied assets to Aave V3 Pool at 0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
          evidenceIds: ['ev:tx', 'ev:log:0', 'ev:label:to'],
        },
      ],
      unknowns: [],
      safetyNotes: ['Based on event signatures'],
    };

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(explanation) }],
    });

    const result = await service.explain(evidenceItems, protocolHints);
    expect(result).not.toBeNull();
    expect(result!.summary).toContain('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(result!.steps).toHaveLength(1);
  });

  it('should reject phantom addresses', async () => {
    const explanation = {
      summary: 'Transaction to 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      steps: [{ text: 'Step', evidenceIds: ['ev:tx'] }],
      unknowns: [],
      safetyNotes: [],
    };

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(explanation) }],
    });

    const result = await service.explain(evidenceItems, protocolHints);
    expect(result).toBeNull();
  });

  it('should reject invalid citations', async () => {
    const explanation = {
      summary: 'Test',
      steps: [{ text: 'Step', evidenceIds: ['ev:nonexistent'] }],
      unknowns: [],
      safetyNotes: [],
    };

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(explanation) }],
    });

    const result = await service.explain(evidenceItems, protocolHints);
    expect(result).toBeNull();
  });

  it('should return null when API key is empty', async () => {
    const noKeyConfig = {
      get: jest.fn((key: string) => {
        const map: Record<string, any> = {
          'anthropic.apiKey': '',
          'anthropic.enrichmentModel': 'claude-sonnet-4-20250514',
          'anthropic.enrichmentMaxTokens': 2048,
        };
        return map[key];
      }),
    };
    const noKeyService = new LlmExplainerService(noKeyConfig as any);
    const result = await noKeyService.explain(evidenceItems, protocolHints);
    expect(result).toBeNull();
  });

  it('should handle ABI-encoded topic addresses', async () => {
    const explanation = {
      summary:
        'User 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa supplied to Aave V3 at 0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
      steps: [
        {
          text: 'Supply event detected for 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          evidenceIds: ['ev:tx', 'ev:log:0'],
        },
      ],
      unknowns: [],
      safetyNotes: [],
    };

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(explanation) }],
    });

    const result = await service.explain(evidenceItems, protocolHints);
    expect(result).not.toBeNull();
  });
});
