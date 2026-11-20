import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ClaimRoyaltiesDto {
  @ApiProperty({
    description: 'Stellar wallet address of the royalty recipient (must own the royalty rights)',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @ApiPropertyOptional({
    description:
      'Asset contract address (SAC) royalties are paid in. Defaults to native XLM when omitted.',
    example: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  })
  @IsString()
  @IsOptional()
  assetContractId?: string;
}

export class ClaimRoyaltiesResponseDto {
  @ApiProperty({ example: 42, description: 'Token / clip ID' })
  tokenId: number;

  @ApiProperty({
    example: '5000000',
    description: 'Unsigned Soroban transaction XDR for the frontend to sign and submit',
  })
  xdr: string;

  @ApiProperty({
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    description: 'Recipient wallet address',
  })
  recipient: string;

  @ApiProperty({
    example: 5000000,
    description: 'Claimable balance in stroops',
  })
  claimableBalance: number;

  @ApiProperty({
    example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
    description: 'NFT contract ID',
  })
  contractId: string;

  @ApiProperty({ example: 'testnet', description: 'Stellar network' })
  network: string;
}

export class ClaimRoyaltiesInsufficientBalanceDto {
  @ApiProperty({ example: 402 })
  statusCode: number;

  @ApiProperty({ example: 'No claimable royalties for token 42' })
  message: string;

  @ApiProperty({ example: 'Payment Required' })
  error: string;
}
