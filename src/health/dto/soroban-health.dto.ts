import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SorobanHealthResponseDto {
  @ApiProperty({
    enum: ['healthy', 'unhealthy'],
    example: 'healthy',
  })
  status: 'healthy' | 'unhealthy';

  @ApiProperty({ example: 'testnet', description: 'Configured Stellar network' })
  network: string;

  @ApiProperty({
    example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
    description: 'Configured Soroban NFT contract ID',
  })
  contractId: string;

  @ApiPropertyOptional({
    example: '1.0.0',
    nullable: true,
    description: 'On-chain contract version from version()',
  })
  version: string | null;

  @ApiPropertyOptional({
    example: 'ClipCash NFTs',
    nullable: true,
    description: 'Collection name from name()',
  })
  collectionName?: string | null;

  @ApiProperty({ example: true })
  rpcReachable: boolean;

  @ApiPropertyOptional({
    example: 'SOROBAN_NFT_CONTRACT_ID is not configured',
    description: 'Present when status is unhealthy',
  })
  error?: string;
}
