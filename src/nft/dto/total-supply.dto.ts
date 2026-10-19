import { ApiProperty } from '@nestjs/swagger';

/** Response for GET /nfts/supply. */
export class TotalSupplyResponseDto {
  @ApiProperty({
    example: 1250,
    description: 'Total number of clip NFTs currently minted on-chain',
  })
  totalSupply!: number;

  @ApiProperty({
    example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
    description: 'Soroban NFT contract ID queried for the supply value',
  })
  contractId!: string;

  @ApiProperty({ example: 'testnet', description: 'Stellar network queried' })
  network!: string;
}