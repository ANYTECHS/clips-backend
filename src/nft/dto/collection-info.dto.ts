import { ApiProperty } from '@nestjs/swagger';

/** Response for GET /nfts/collection (Issue #679). */
export class CollectionInfoResponseDto {
  @ApiProperty({
    example: 'ClipCash NFT',
    description: 'On-chain collection name, admin-configurable via set_name',
  })
  name!: string;

  @ApiProperty({
    example: 'CLIP',
    description: 'On-chain collection symbol, admin-configurable via set_symbol',
  })
  symbol!: string;

  @ApiProperty({
    example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
    description: 'Soroban contract ID',
  })
  contractId!: string;
}
