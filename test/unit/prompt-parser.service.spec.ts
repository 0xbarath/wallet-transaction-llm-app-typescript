import { PromptParserService } from '../../src/transaction/prompt-parser.service';
import { PromptParseException } from '../../src/common/exceptions/prompt-parse.exception';
import { ForbiddenCategoryException } from '../../src/common/exceptions/forbidden-category.exception';

describe('PromptParserService', () => {
  let service: PromptParserService;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    const mockConfig = {
      get: jest.fn((key: string) => {
        const map: Record<string, any> = {
          'anthropic.apiKey': 'test-key',
          'anthropic.promptParserModel': 'claude-sonnet-4-20250514',
          'anthropic.promptParserMaxTokens': 1024,
        };
        return map[key];
      }),
    };

    service = new PromptParserService(mockConfig as any);
    // Override the client
    (service as any).client = { messages: { create: mockCreate } };
  });

  function mockResponse(json: any) {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(json) }],
    });
  }

  it('should parse direction OUT', async () => {
    mockResponse({
      direction: 'OUT',
      categories: [],
      assets: ['ETH'],
      needsClarification: [],
    });

    const spec = await service.parse('show outgoing ETH', 'wallet-1', 'user');
    expect(spec.direction).toBe('OUT');
    expect(spec.assets).toEqual(['ETH']);
  });

  it('should parse USDC assets', async () => {
    mockResponse({
      direction: null,
      categories: [],
      assets: ['USDC'],
      needsClarification: [],
    });

    const spec = await service.parse('show USDC', 'wallet-1', 'user');
    expect(spec.assets).toEqual(['USDC']);
  });

  it('should parse amounts', async () => {
    mockResponse({
      direction: null,
      categories: [],
      assets: [],
      minValue: '10',
      maxValue: '100',
      needsClarification: [],
    });

    const spec = await service.parse('between 10 and 100', 'wallet-1', 'user');
    expect(spec.minValue).toBe('10');
    expect(spec.maxValue).toBe('100');
  });

  it('should parse categories', async () => {
    mockResponse({
      direction: null,
      categories: ['ERC20'],
      assets: [],
      needsClarification: [],
    });

    const spec = await service.parse('show ERC20 transfers', 'wallet-1', 'user');
    expect(spec.categories).toEqual(['ERC20']);
  });

  it('should parse counterparty', async () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    mockResponse({
      direction: null,
      categories: [],
      assets: [],
      counterparty: addr,
      needsClarification: [],
    });

    const spec = await service.parse(`to ${addr}`, 'wallet-1', 'user');
    expect(spec.counterparty).toBe(addr);
  });

  it('should parse time range', async () => {
    mockResponse({
      direction: null,
      categories: [],
      assets: [],
      startTime: '2024-01-01T00:00:00Z',
      endTime: '2024-01-31T23:59:59Z',
      needsClarification: [],
    });

    const spec = await service.parse('january 2024', 'wallet-1', 'user');
    expect(spec.startTime).toBe('2024-01-01T00:00:00Z');
    expect(spec.endTime).toBe('2024-01-31T23:59:59Z');
  });

  it('should throw PromptParseException for needsClarification', async () => {
    mockResponse({
      direction: null,
      categories: [],
      assets: [],
      needsClarification: ['What token?', 'What time range?'],
    });

    await expect(service.parse('show me stuff', 'wallet-1', 'user')).rejects.toThrow(
      PromptParseException,
    );
  });

  it('should throw ForbiddenCategoryException for INTERNAL as non-admin', async () => {
    mockResponse({
      direction: null,
      categories: ['INTERNAL'],
      assets: [],
      needsClarification: [],
    });

    await expect(
      service.parse('show internal transfers', 'wallet-1', 'user'),
    ).rejects.toThrow(ForbiddenCategoryException);
  });

  it('should allow INTERNAL for admin', async () => {
    mockResponse({
      direction: null,
      categories: ['INTERNAL'],
      assets: [],
      needsClarification: [],
    });

    const spec = await service.parse('show internal transfers', 'wallet-1', 'admin');
    expect(spec.categories).toEqual(['INTERNAL']);
  });

  it('should reject invalid direction', async () => {
    mockResponse({
      direction: 'SIDEWAYS',
      categories: [],
      assets: [],
      needsClarification: [],
    });

    await expect(service.parse('show sideways', 'wallet-1', 'user')).rejects.toThrow(
      PromptParseException,
    );
  });

  it('should reject too many assets', async () => {
    mockResponse({
      direction: null,
      categories: [],
      assets: Array(11).fill('ETH'),
      needsClarification: [],
    });

    await expect(service.parse('show many', 'wallet-1', 'user')).rejects.toThrow(
      PromptParseException,
    );
  });

  it('should strip markdown fences from response', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n{"direction":"IN","categories":[],"assets":[],"needsClarification":[]}\n```',
        },
      ],
    });

    const spec = await service.parse('show incoming', 'wallet-1', 'user');
    expect(spec.direction).toBe('IN');
  });
});
