import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/** POST /nfts/:id/approve — approve a spender for one token (Issue #842). */
export class ApproveNftDto {
  @ApiProperty({
    description: 'Current NFT owner Stellar address (signs the returned XDR)',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  ownerAddress!: string;

  @ApiPropertyOptional({
    description:
      'Spender address to approve. Pass empty string or omit to revoke approval.',
    example: 'GDESTINATIONADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  })
  @IsOptional()
  @IsString()
  spenderAddress?: string;
}

/** POST /nfts/approve-all — set operator approval for all tokens (Issue #842). */
export class SetApprovalForAllDto {
  @ApiProperty({
    description: 'Owner Stellar address that will sign the returned XDR',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  ownerAddress!: string;

  @ApiProperty({
    description: 'Operator address to grant or revoke',
    example: 'GDESTINATIONADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  })
  @IsString()
  @IsNotEmpty()
  operatorAddress!: string;

  @ApiProperty({
    description: 'true to enable operator, false to revoke',
    example: true,
  })
  @Type(() => Boolean)
  @IsBoolean()
  approved!: boolean;
}

export class ApproveNftResponseDto {
  @ApiProperty({ example: 'AAAAAgAAAA...' })
  xdr!: string;

  @ApiProperty({ example: 42 })
  tokenId!: number;

  @ApiProperty({ example: 'GC6X...' })
  owner!: string;

  @ApiProperty({
    example: 'GDEST...',
    description: 'Approved spender, or empty string when revoked',
  })
  spender!: string;

  @ApiProperty({ example: 'CAA...' })
  contractId!: string;

  @ApiProperty({ example: 'testnet' })
  network!: string;

  @ApiProperty({
    example: 'Approval',
    description: 'On-chain event emitted on success (Approval / ApprovalForAll)',
  })
  emits!: string;
}

export class SetApprovalForAllResponseDto {
  @ApiProperty({ example: 'AAAAAgAAAA...' })
  xdr!: string;

  @ApiProperty({ example: 'GC6X...' })
  owner!: string;

  @ApiProperty({ example: 'GDEST...' })
  operator!: string;

  @ApiProperty({ example: true })
  approved!: boolean;

  @ApiProperty({ example: 'CAA...' })
  contractId!: string;

  @ApiProperty({ example: 'testnet' })
  network!: string;

  @ApiProperty({ example: 'ApprovalForAll' })
  emits!: string;
}

export class GetApprovedResponseDto {
  @ApiProperty({ example: 42 })
  tokenId!: number;

  @ApiProperty({
    example: 'GDESTINATIONADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    nullable: true,
    description: 'Approved spender, or null if none',
  })
  approved!: string | null;

  @ApiProperty({ example: 'CAA...' })
  contractId!: string;
}

export class IsApprovedForAllResponseDto {
  @ApiProperty({ example: 'GC6X...' })
  owner!: string;

  @ApiProperty({ example: 'GDEST...' })
  operator!: string;

  @ApiProperty({ example: true })
  approved!: boolean;
}
