import { LlmExplainerService } from '../../src/enrichment/llm-explainer.service';

describe('Evidence Validation (LlmExplainer)', () => {
  let service: LlmExplainerService;

  beforeEach(() => {
    const mockConfig = {
      get: jest.fn((key: string) => {
        const map: Record<string, any> = {
          'anthropic.apiKey': '',
          'anthropic.enrichmentModel': 'claude-sonnet-4-20250514',
          'anthropic.enrichmentMaxTokens': 2048,
        };
        return map[key];
      }),
    };
    service = new LlmExplainerService(mockConfig as any);
  });

  describe('validateCitations', () => {
    it('should pass with valid citations', () => {
      const explanation = {
        summary: 'test',
        steps: [{ text: 'step 1', evidenceIds: ['ev:tx', 'ev:log:0'] }],
        unknowns: [],
        safetyNotes: [],
      };
      const validIds = new Set(['ev:tx', 'ev:log:0', 'ev:label:to']);
      const result = (service as any).validateCitations(explanation, validIds);
      expect(result).toBe(true);
    });

    it('should fail with invalid citation', () => {
      const explanation = {
        summary: 'test',
        steps: [{ text: 'step 1', evidenceIds: ['ev:tx', 'ev:nonexistent'] }],
        unknowns: [],
        safetyNotes: [],
      };
      const validIds = new Set(['ev:tx', 'ev:log:0']);
      const result = (service as any).validateCitations(explanation, validIds);
      expect(result).toBe(false);
    });
  });

  describe('validateNoPhantomAddresses', () => {
    const evidenceItems = [
      {
        id: 'ev:tx',
        type: 'transaction',
        fields: {
          from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          to: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
        },
      },
      {
        id: 'ev:log:0',
        type: 'log',
        fields: {
          address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
          topics:
            '["0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61","0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]',
          data: '0x0000000000000000000000000000000000000000000000000000000000000001',
        },
      },
    ];

    const protocolHints = [
      {
        address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
        protocol: 'aave-v3',
        label: 'Aave V3: Pool',
        confidence: '0.99',
        source: 'curated',
        category: 'lending',
      },
    ];

    it('should pass when all addresses are known', () => {
      const explanation = {
        summary:
          'Transaction from 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa to 0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
        steps: [{ text: 'Step', evidenceIds: ['ev:tx'] }],
        unknowns: [],
        safetyNotes: [],
      };
      const result = (service as any).validateNoPhantomAddresses(
        explanation,
        evidenceItems,
        protocolHints,
      );
      expect(result).toBe(true);
    });

    it('should fail when phantom address detected', () => {
      const explanation = {
        summary:
          'Transaction sent to 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        steps: [{ text: 'Step', evidenceIds: ['ev:tx'] }],
        unknowns: [],
        safetyNotes: [],
      };
      const result = (service as any).validateNoPhantomAddresses(
        explanation,
        evidenceItems,
        protocolHints,
      );
      expect(result).toBe(false);
    });

    it('should handle ABI-encoded addresses in topics', () => {
      const explanation = {
        summary:
          'User 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa supplied to Aave V3',
        steps: [{ text: 'Step', evidenceIds: ['ev:log:0'] }],
        unknowns: [],
        safetyNotes: [],
      };
      const result = (service as any).validateNoPhantomAddresses(
        explanation,
        evidenceItems,
        protocolHints,
      );
      expect(result).toBe(true);
    });
  });
});
