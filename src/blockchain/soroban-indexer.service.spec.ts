import StellarSdk from '@stellar/stellar-sdk';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { RoyaltyClaimHistoryService } from '../nft/royalty-claim-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { SOROBAN_NFT_EVENT_TYPES } from './event-types';
import { SorobanIndexerService } from './soroban-indexer.service';

describe('SorobanIndexerService event indexing', () => {
  const originalContractId = process.env.SOROBAN_NFT_CONTRACT_ID;
  const storedEventData: Array<{ eventType: string }> = [];
  const storedEvents = {
    create: jest.fn((input: { data: { eventType: string } }) => {
      storedEventData.push(input.data);
      return Promise.resolve({});
    }),
  };
  const indexerState = { upsert: jest.fn() };
  const claimHistory = { recordClaim: jest.fn() };
  const rpcServer = (
    StellarSdk as unknown as {
      rpc: {
        Server: {
          prototype: {
            getHealth: (...args: never[]) => Promise<unknown>;
            getEvents: (...args: never[]) => Promise<unknown>;
          };
        };
      };
    }
  ).rpc.Server.prototype;
  let service: SorobanIndexerService;

  beforeEach(() => {
    process.env.SOROBAN_NFT_CONTRACT_ID = 'C'.padEnd(56, 'A');
    storedEventData.length = 0;
    storedEvents.create.mockClear();
    indexerState.upsert
      .mockReset()
      .mockResolvedValue({ lastLedger: 0, failureCount: 0 });
    claimHistory.recordClaim.mockReset().mockResolvedValue(undefined);

    jest.spyOn(rpcServer, 'getHealth').mockResolvedValue({ latestLedger: 10 });
    jest.spyOn(rpcServer, 'getEvents').mockResolvedValue({
      events: SOROBAN_NFT_EVENT_TYPES.map((eventType, eventIndex) => ({
        txHash: `tx-${eventIndex}`,
        eventIndex,
        ledger: 10,
        topic: [eventType, eventIndex + 1],
        value: {
          recipient: 'G'.padEnd(56, 'A'),
          amount: '500',
          asset: 'C'.padEnd(56, 'B'),
        },
      })),
    });

    service = new SorobanIndexerService(
      {
        blockchainEvent: storedEvents,
        indexerState,
      } as unknown as PrismaService,
      { rpcUrl: 'https://soroban-testnet.stellar.org' } as StellarService,
      {
        execute: (_config: unknown, callback: () => Promise<unknown>) =>
          callback(),
      } as unknown as CircuitBreakerService,
      claimHistory as unknown as RoyaltyClaimHistoryService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalContractId == null) {
      delete process.env.SOROBAN_NFT_CONTRACT_ID;
    } else {
      process.env.SOROBAN_NFT_CONTRACT_ID = originalContractId;
    }
  });

  it('persists every supported contract event type', async () => {
    const result = await service.indexOnce();

    expect(result).toEqual({
      processed: SOROBAN_NFT_EVENT_TYPES.length,
      skipped: 0,
    });
    expect(storedEvents.create).toHaveBeenCalledTimes(
      SOROBAN_NFT_EVENT_TYPES.length,
    );
    expect(storedEventData.map((event) => event.eventType)).toEqual(
      SOROBAN_NFT_EVENT_TYPES,
    );
    expect(claimHistory.recordClaim).toHaveBeenCalledTimes(1);
  });
});
