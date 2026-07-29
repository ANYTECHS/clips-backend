import { ApiProperty } from '@nestjs/swagger';

export class DeploymentStatusResponseDto {
  @ApiProperty({ example: 'verified', description: 'Deployment status indicator' })
  status!: string;

  @ApiProperty({ example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4', description: 'Soroban contract ID' })
  contractId!: string;

  @ApiProperty({ example: 'ClipCash NFT', description: 'On-chain contract collection name' })
  name!: string;

  @ApiProperty({ example: 'CLIP', description: 'On-chain contract collection symbol' })
  symbol!: string;

  @ApiProperty({ example: 42, description: 'Total NFT supply on-chain' })
  totalSupply!: number;

  @ApiProperty({ example: 1000, description: 'Default contract royalty rate in basis points (BPS)' })
  defaultRoyaltyBps!: number;

  @ApiProperty({ example: '2026-07-29T16:14:57.000Z', description: 'Verification timestamp' })
  timestamp!: string;
}
