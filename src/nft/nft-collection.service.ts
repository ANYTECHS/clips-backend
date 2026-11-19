import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isSupportedNftCollectionId } from './nft-collections.constants';
import { GetCollectionNftsQueryDto } from './dto/nft-collection-query.dto';

@Injectable()
export class NftCollectionService {
  constructor(private readonly prisma: PrismaService) {}

  async getCollections() {
    const collections = await this.prisma.nftCollection.findMany({
      orderBy: { collectionId: 'asc' },
    });

    return Promise.all(
      collections.map(async (collection) => ({
        ...collection,
        metadata: collection.metadata as Record<string, unknown>,
        supply: await this.getSupply(collection.collectionId),
      })),
    );
  }

  async getCollection(collectionId: string) {
    this.validateCollectionId(collectionId);
    const collection = await this.prisma.nftCollection.findUnique({
      where: { collectionId },
    });
    if (!collection) {
      throw new NotFoundException(`NFT collection '${collectionId}' not found`);
    }

    return {
      ...collection,
      metadata: collection.metadata as Record<string, unknown>,
      supply: await this.getSupply(collectionId),
    };
  }

  async requireCollection(collectionId: string) {
    this.validateCollectionId(collectionId);
    const collection = await this.prisma.nftCollection.findUnique({
      where: { collectionId },
    });
    if (!collection) {
      throw new BadRequestException(
        `Unsupported collectionId: ${collectionId}`,
      );
    }
    return collection;
  }

  async getNfts(query: GetCollectionNftsQueryDto) {
    if (query.collectionId) {
      await this.requireCollection(query.collectionId);
    }

    const clips = await this.prisma.clip.findMany({
      where: {
        mintAddress: { not: null },
        nftStatus: { not: 'burned' },
        ...(query.collectionId ? { collectionId: query.collectionId } : {}),
      },
      select: {
        id: true,
        collectionId: true,
        title: true,
        metadataUri: true,
        mintAddress: true,
        mintedAt: true,
      },
      orderBy: { id: 'desc' },
      take: query.limit ?? 50,
    });

    return clips.map((clip) => ({
      ...clip,
      mintAddress: clip.mintAddress!,
    }));
  }

  private async getSupply(collectionId: string): Promise<number> {
    return this.prisma.clip.count({
      where: {
        collectionId,
        mintAddress: { not: null },
        nftStatus: { not: 'burned' },
      },
    });
  }

  private validateCollectionId(collectionId: string): void {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(collectionId)) {
      throw new BadRequestException('collectionId must be a lowercase slug');
    }
    if (!isSupportedNftCollectionId(collectionId)) {
      throw new BadRequestException(
        `Unsupported collectionId: ${collectionId}`,
      );
    }
  }
}
