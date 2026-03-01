import { OperationClassifierService } from '../../src/enrichment/operation-classifier.service';
import { AlchemyTransactionReceipt } from '../../src/alchemy/types/alchemy-transfer.type';

describe('OperationClassifierService', () => {
  const service = new OperationClassifierService();

  function makeReceipt(topic0: string): AlchemyTransactionReceipt {
    return {
      status: '0x1',
      blockNumber: '0x112a880',
      from: '0xaaaa',
      to: '0xbbbb',
      contractAddress: null,
      gasUsed: '0x1e848',
      transactionHash: '0xabc',
      logs: [
        {
          address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
          topics: [topic0],
          data: '0x00',
          logIndex: '0x0',
          removed: false,
        },
      ],
    };
  }

  it('should classify Aave V3 Supply', () => {
    const result = service.classify(
      makeReceipt('0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61'),
    );
    expect(result.name).toBe('aave_supply');
    expect(result.confidence).toBe(0.9);
    expect(result.evidenceIds).toEqual(['ev:log:0']);
  });

  it('should classify Uniswap V3 Swap', () => {
    const result = service.classify(
      makeReceipt('0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'),
    );
    expect(result.name).toBe('uniswap_swap');
    expect(result.confidence).toBe(0.9);
  });

  it('should classify Uniswap V2 Swap', () => {
    const result = service.classify(
      makeReceipt('0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822'),
    );
    expect(result.name).toBe('uniswap_swap');
  });

  it('should return unknown for unrecognized topic', () => {
    const result = service.classify(
      makeReceipt('0x0000000000000000000000000000000000000000000000000000000000000000'),
    );
    expect(result.name).toBe('unknown');
    expect(result.confidence).toBe(0.0);
    expect(result.evidenceIds).toEqual([]);
  });

  it('should return unknown for no logs', () => {
    const receipt: AlchemyTransactionReceipt = {
      status: '0x1',
      blockNumber: '0x112a880',
      from: '0xaaaa',
      to: '0xbbbb',
      contractAddress: null,
      gasUsed: '0x1e848',
      transactionHash: '0xabc',
      logs: [],
    };
    const result = service.classify(receipt);
    expect(result.name).toBe('unknown');
  });
});
