import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { NftCollectionService } from './nft-collection.service';
import { GetCollectionNftsQueryDto } from './dto/nft-collection-query.dto';
import {
  NftCollectionResponseDto,
  NftCollectionTokenResponseDto,
} from './dto/nft-collection.dto';

@ApiTags('nft-collections')
@Controller()
export class NftCollectionController {
  constructor(private readonly nftCollectionService: NftCollectionService) {}

  @Get('nft-collections')
  @ApiOperation({
    summary: 'List NFT collections',
    description:
      'Returns supported collection types, collection-specific metadata and configuration, and live minted supply.',
  })
  @ApiOkResponse({ type: NftCollectionResponseDto, isArray: true })
  getCollections(): Promise<NftCollectionResponseDto[]> {
    return this.nftCollectionService.getCollections();
  }

  @Get('nft-collections/:collectionId')
  @ApiOperation({
    summary: 'Get collection metadata and supply',
    description:
      'Returns the metadata and configuration for one collection, including its current live supply.',
  })
  @ApiParam({ name: 'collectionId', example: 'viral-clips' })
  @ApiOkResponse({ type: NftCollectionResponseDto })
  @ApiBadRequestResponse({
    description: 'Malformed or unsupported collection ID',
  })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  getCollection(
    @Param('collectionId') collectionId: string,
  ): Promise<NftCollectionResponseDto> {
    return this.nftCollectionService.getCollection(collectionId);
  }

  @Get('nfts')
  @ApiTags('nfts')
  @ApiOperation({
    summary: 'List minted NFTs, optionally filtered by collection',
    description:
      'Returns live minted tokens. Supply collectionId to restrict results to a supported collection.',
  })
  @ApiQuery({
    name: 'collectionId',
    required: false,
    description: 'Collection slug, for example viral-clips',
    example: 'viral-clips',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum results (1-100)',
    example: 50,
  })
  @ApiOkResponse({ type: NftCollectionTokenResponseDto, isArray: true })
  @ApiBadRequestResponse({
    description: 'Malformed or unsupported collection ID',
  })
  getNfts(
    @Query() query: GetCollectionNftsQueryDto,
  ): Promise<NftCollectionTokenResponseDto[]> {
    if (query.collectionId !== undefined && query.collectionId.length === 0) {
      throw new BadRequestException('collectionId cannot be empty');
    }
    return this.nftCollectionService.getNfts(query);
  }
}
