import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class AuthorizeMintDto {
  @ApiProperty({ example: 42, description: 'Clip ID to mint' })
  @IsInt()
  @Min(1)
  clipId: number;

  @ApiProperty({ example: 1001, description: 'NFT token ID to assign' })
  @IsInt()
  @Min(0)
  tokenId: number;

  @ApiProperty({ example: 'GABC...XYZ', description: 'Recipient Stellar wallet (G...)' })
  @Matches(/^G[A-Z2-7]{55}$/)
  recipient: string;

  @ApiProperty({ example: 'ipfs://bafy.../metadata.json' })
  @IsString()
  metadataUri: string;

  @ApiProperty({ required: false, example: 600, description: 'Validity window in seconds (default 600, max 3600)' })
  @IsOptional()
  @IsInt()
  @Min(30)
  ttlSeconds?: number;
}

export class MintAuthorizationResponseDto {
  @ApiProperty({ example: 42 }) clipId: number;
  @ApiProperty({ example: 1001 }) tokenId: number;
  @ApiProperty({ example: 'GABC...XYZ' }) recipient: string;
  @ApiProperty({ example: 'ipfs://bafy.../metadata.json' }) metadataUri: string;
  @ApiProperty({ example: '1732000000123456', description: 'Single-use nonce (u64 as string)' }) nonce: string;
  @ApiProperty({ example: 1732000600, description: 'Unix expiration (seconds)' }) expiration: number;
  @ApiProperty({ description: 'Hex Ed25519 signature over the XDR MintAuthorization payload' }) signature: string;
  @ApiProperty({ description: 'Hex backend signer public key (never the private key)' }) signerPublicKey: string;
}

export class CooldownErrorDto {
  @ApiProperty({ example: 429 }) statusCode: number;
  @ApiProperty({ example: 'CooldownActive' }) error: string;
  @ApiProperty({ example: 12 }) code: number;
  @ApiProperty({ example: 240, description: 'Seconds until the wallet may mint again' }) retryAfter: number;
}
