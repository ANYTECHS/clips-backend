import { ForbiddenException, BadRequestException, HttpException } from '@nestjs/common';
import { NftTransferService } from './nft-transfer.service';
import { NftMetadataRefreshService } from './nft-metadata-refresh.service';
import { NftTransferHistoryService } from './nft-transfer-history.service';

const mockToXDR = jest.fn().mockReturnValue('AAAAAgAAAA-mock-transfer-xdr');
const mockGetAccount = jest.fn().mockResolvedValue({});
const mockSimulateTransaction = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const mockBuilder = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({ toXDR: mockToXDR }),
  };

  const sdkShape = {
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: mockGetAccount,
        simulateTransaction: mockSimulateTransaction,
        getEvents: jest.fn().mockResolvedValue({ events: [] }),
      })),
    },
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn((fnName: string) => ({ fnName })),
    })),
    Account: jest.fn().mockImplementation(() => ({})),
    Address: {
      fromString: jest.fn().mockReturnValue({ toScVal: jest.fn() }),
    },
    TransactionBuilder: jest.fn().mockImplementation(() => mockBuilder),
    TimeoutInfinite: 0,
    nativeToScVal: jest.fn((v) => v),
    scValToNative: jest.fn((v) => v),
    xdr: {
      ScVal: {
        fromXDR: jest.fn((xdrStr: string) => xdrStr),
      },
    },
  };

  return { __esModule: true, default: sdkShape, ...sdkShape };
});

describe('NftTransferService (Issue #843)', () => {
  const stellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    network: 'testnet',
    validateAddress: jest.fn().mockReturnValue({ valid: true }),
  };
  const nftOwnershipService = {
    verifyNFTOwnership: jest.fn(),
  };
  const royaltyConfigurationService = {
    calculateRoyalty: jest.fn().mockReturnValue(500_000_000),
    validateRoyaltyBps: jest.fn(),
    getCreatorRoyaltyBps: jest.fn().mockReturnValue(1000),
  };
  const prisma = {
    clip: { findUnique: jest.fn().mockResolvedValue({ royaltyBps: 1000 }) },
  };
  const circuitBreakerService = {
    execute: jest.fn((_c: unknown, fn: () => unknown) => fn()),
  };

  let service: NftTransferService;

  beforeEach(() => {
    jest.clearAllMocks();
    stellarService.validateAddress.mockReturnValue({ valid: true });
    mockSimulateTransaction.mockResolvedValue({
      results: [{ xdr: false }],
    });
    service = new NftTransferService(
      stellarService as any,
      nftOwnershipService as any,
      royaltyConfigurationService as any,
      prisma as any,
      circuitBreakerService as any,
    );
  });

  it('returns unsigned XDR when owner and recipient are valid', async () => {
    nftOwnershipService.verifyNFTOwnership.mockResolvedValue({ isOwner: true });

    const result = await service.prepareTransferTx(
      42,
      'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      'GBXXYQVNHHZSL3VQNNNQRXB2FHQWZYTQJ6JRYVJL7XP2KXFBH3TFQXAA',
      5_000_000_000,
    );

    expect(result.xdr).toBe('AAAAAgAAAA-mock-transfer-xdr');
    expect(result.action).toBe('transfer_with_royalty');
    expect(result.tokenId).toBe('42');
    expect(result.royaltyBreakdown.royaltyAmount).toBe(500_000_000);
  });

  it('rejects when caller does not own the NFT', async () => {
    nftOwnershipService.verifyNFTOwnership.mockResolvedValue({
      isOwner: false,
      error: 'Caller does not own the NFT on-chain',
    });

    await expect(
      service.prepareTransferTx(
        42,
        'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        'GBXXYQVNHHZSL3VQNNNQRXB2FHQWZYTQJ6JRYVJL7XP2KXFBH3TFQXAA',
        0,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects invalid recipient addresses', async () => {
    stellarService.validateAddress
      .mockReturnValueOnce({ valid: true })
      .mockReturnValueOnce({ valid: false, message: 'bad checksum' });

    await expect(
      service.prepareTransferTx(
        42,
        'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        'INVALID',
        0,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects soulbound NFTs', async () => {
    nftOwnershipService.verifyNFTOwnership.mockResolvedValue({ isOwner: true });
    mockSimulateTransaction.mockResolvedValue({
      results: [{ xdr: true }],
    });

    await expect(
      service.prepareTransferTx(
        42,
        'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        'GBXXYQVNHHZSL3VQNNNQRXB2FHQWZYTQJ6JRYVJL7XP2KXFBH3TFQXAA',
        0,
      ),
    ).rejects.toThrow('Soulbound NFTs cannot be transferred');
  });
});

describe('NftMetadataRefreshService (Issue #837)', () => {
  const prisma = {
    nftMetadataRefresh: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
    },
  };
  const adminContractService = {
    prepareRefreshMetadataTx: jest.fn().mockResolvedValue({
      xdr: 'mock-xdr',
      action: 'refresh_metadata',
      tokenId: '42',
      contractId: 'C...',
      network: 'testnet',
    }),
  };

  let service: NftMetadataRefreshService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NftMetadataRefreshService(
      prisma as any,
      adminContractService as any,
    );
  });

  it('allows refresh when no prior refresh exists', async () => {
    prisma.nftMetadataRefresh.findFirst.mockResolvedValue(null);

    const result = await service.prepareRefreshWithCooldown(42, 'GADMIN...', {
      name: 'Updated',
    });

    expect(result.xdr).toBe('mock-xdr');
    expect(prisma.nftMetadataRefresh.create).toHaveBeenCalled();
  });

  it('returns 429 when within 30-day cooldown', async () => {
    prisma.nftMetadataRefresh.findFirst.mockResolvedValue({
      refreshedAt: new Date(),
    });

    await expect(
      service.prepareRefreshWithCooldown(42, 'GADMIN...', { name: 'Updated' }),
    ).rejects.toBeInstanceOf(HttpException);

    try {
      await service.prepareRefreshWithCooldown(42, 'GADMIN...', { name: 'Updated' });
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });

  it('allows refresh after cooldown elapsed', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    prisma.nftMetadataRefresh.findFirst.mockResolvedValue({
      refreshedAt: thirtyOneDaysAgo,
    });

    const result = await service.prepareRefreshWithCooldown(42, 'GADMIN...', {
      name: 'Updated',
    });

    expect(result.action).toBe('refresh_metadata');
  });
});

describe('NftTransferHistoryService (Issue #841)', () => {
  const prisma = {
    nftTransfer: {
      count: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const stellarService = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
  };

  let service: NftTransferHistoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NFT_TRANSFER_INDEXER_DISABLED = 'true';
    service = new NftTransferHistoryService(prisma as any, stellarService as any);
  });

  it('returns transfers ordered by timestamp with pagination', async () => {
    const rows = [
      {
        id: 2,
        tokenId: 42,
        fromAddress: 'GFROM...',
        toAddress: 'GTO...',
        txHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
        transferredAt: new Date('2026-08-29T12:00:00.000Z'),
        salePrice: BigInt(1_000_000),
      },
      {
        id: 1,
        tokenId: 42,
        fromAddress: 'GMINT...',
        toAddress: 'GFROM...',
        txHash: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        transferredAt: new Date('2026-08-01T08:00:00.000Z'),
        salePrice: null,
      },
    ];
    prisma.nftTransfer.count.mockResolvedValue(2);
    prisma.nftTransfer.findMany.mockResolvedValue(rows);

    const result = await service.getTransfers(42, { limit: 20, cursor: 0 });

    expect(result.total).toBe(2);
    expect(result.transfers).toHaveLength(2);
    expect(result.transfers[0].txHash).toContain('abc123');
    expect(result.transfers[0].transferredAt).toBe('2026-08-29T12:00:00.000Z');
    expect(result.nextCursor).toBeNull();
    expect(prisma.nftTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenId: 42 },
        orderBy: { transferredAt: 'desc' },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('returns nextCursor when more pages exist', async () => {
    prisma.nftTransfer.count.mockResolvedValue(50);
    prisma.nftTransfer.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        tokenId: 42,
        fromAddress: 'GFROM...',
        toAddress: 'GTO...',
        txHash: `hash${i}`,
        transferredAt: new Date(),
        salePrice: null,
      })),
    );

    const result = await service.getTransfers(42, { limit: 20, cursor: 0 });
    expect(result.nextCursor).toBe(20);
  });
});
