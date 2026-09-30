import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NftCollectionService } from './nft-collection.service';

describe('NftCollectionService', () => {
  const collectionRows = [
    {
      collectionId: 'comedy-clips',
      name: 'Comedy Clips',
      description: 'Comedy moments',
      type: 'comedy',
      metadata: { category: 'comedy' },
      royaltyBps: null,
      maxSupply: null,
    },
    {
      collectionId: 'viral-clips',
      name: 'Viral Clips',
      description: 'Viral moments',
      type: 'viral',
      metadata: { category: 'viral' },
      royaltyBps: 1000,
      maxSupply: 100,
    },
  ];

  const makeService = () => {
    const prisma = {
      nftCollection: {
        findMany: jest.fn().mockResolvedValue(collectionRows),
        findUnique: jest.fn(({ where }: { where: { collectionId: string } }) =>
          Promise.resolve(
            collectionRows.find(
              (item) => item.collectionId === where.collectionId,
            ) ?? null,
          ),
        ),
      },
      clip: {
        count: jest.fn(({ where }: { where: { collectionId: string } }) =>
          Promise.resolve(where.collectionId === 'viral-clips' ? 7 : 3),
        ),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 42,
            collectionId: 'viral-clips',
            title: 'Viral moment',
            metadataUri: 'ipfs://metadata',
            mintAddress: '42',
            mintedAt: new Date('2026-09-28T12:00:00Z'),
          },
        ]),
      },
    };
    return { service: new NftCollectionService(prisma as any), prisma };
  };

  it('reports independent metadata, configuration, and supply per collection', async () => {
    const { service } = makeService();

    await expect(service.getCollections()).resolves.toEqual([
      expect.objectContaining({ collectionId: 'comedy-clips', supply: 3 }),
      expect.objectContaining({
        collectionId: 'viral-clips',
        metadata: { category: 'viral' },
        royaltyBps: 1000,
        maxSupply: 100,
        supply: 7,
      }),
    ]);
  });

  it('filters minted token queries by collectionId', async () => {
    const { service, prisma } = makeService();

    const result = await service.getNfts({
      collectionId: 'viral-clips',
      limit: 25,
    });

    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          collectionId: 'viral-clips',
          mintAddress: { not: null },
        }),
        take: 25,
      }),
    );
    expect(result[0].collectionId).toBe('viral-clips');
  });

  it('rejects unsupported collection IDs', async () => {
    const { service } = makeService();

    await expect(service.getCollection('unknown')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.getNfts({ collectionId: 'unknown', limit: 50 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns not found when a supported collection is missing from persistence', async () => {
    const { service, prisma } = makeService();
    prisma.nftCollection.findUnique.mockResolvedValue(null);

    await expect(service.getCollection('viral-clips')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
