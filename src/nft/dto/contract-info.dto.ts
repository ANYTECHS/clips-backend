import { ApiProperty } from '@nestjs/swagger';

/** Response from the read-only Soroban contract_info() view. */
export class ContractInfoDto {
  @ApiProperty({ example: 'ClipCash NFT' })
  name!: string;

  @ApiProperty({ example: 'CLIP' })
  symbol!: string;

  @ApiProperty({ example: '0.1.0' })
  version!: string;

  @ApiProperty({
    example: 'GADMIN6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  owner!: string;

  @ApiProperty({
    example: 500,
    description: 'Platform fee in basis points (500 = 5%).',
  })
  platform_fee!: number;
}
