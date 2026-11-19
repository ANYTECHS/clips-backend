import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
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
      'Address to approve. Pass empty string or omit to revoke by approving the owner address.',
    example: 'GDESTINATIONADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  })
  @IsOptional()
  @IsString()
  spenderAddress?: string;

  @ApiProperty({
    description: 'Ledger through which the approval is valid (u32).',
    example: 1234567,
    minimum: 1,
    maximum: 4294967295,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4294967295)
  liveUntilLedger!: number;
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
    description:
      'Ledger through which the operator approval is valid; use 0 to revoke.',
    example: 1234567,
    minimum: 0,
    maximum: 4294967295,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4294967295)
  liveUntilLedger!: number;
}

export class RevokeNftApprovalDto {
  @ApiProperty({
    description: 'Current NFT owner Stellar address that will sign the XDR',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  ownerAddress!: string;
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
    description: 'Approved spender; the owner address indicates revocation.',
  })
  spender!: string;

  @ApiProperty({ example: 1234567, description: 'Approval expiry ledger.' })
  liveUntilLedger!: number;

  @ApiProperty({ example: 'CAA...' })
  contractId!: string;

  @ApiProperty({ example: 'testnet' })
  network!: string;

  @ApiProperty({
    example: 'Approval',
    description: 'SEP-0050 approval event topic.',
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

  @ApiProperty({
    example: 1234567,
    description: 'Approval expiry ledger; 0 means revoked.',
  })
  liveUntilLedger!: number;

  @ApiProperty({ example: 'CAA...' })
  contractId!: string;

  @ApiProperty({ example: 'testnet' })
  network!: string;

  @ApiProperty({ example: 'approve_for_all' })
  emits!: string;
}

export class RevokeNftApprovalResponseDto {
  @ApiProperty({ example: 'AAAAAgAAAA...' })
  xdr!: string;

  @ApiProperty({ example: 42, description: 'Revoked token ID (u32).' })
  tokenId!: number;

  @ApiProperty({ example: 'GC6X...' })
  owner!: string;

  @ApiProperty({ example: 'CAA...' })
  contractId!: string;

  @ApiProperty({ example: 'testnet' })
  network!: string;

  @ApiProperty({ example: 'revoke_approval' })
  emits!: string;
}

export class RevokeAllNftApprovalsResponseDto {
  @ApiProperty({ example: 'AAAAAgAAAA...' })
  xdr!: string;

  @ApiProperty({ example: 'GC6X...' })
  owner!: string;

  @ApiProperty({ example: 'CAA...' })
  contractId!: string;

  @ApiProperty({ example: 'testnet' })
  network!: string;

  @ApiProperty({ example: 'revoke_all_approvals' })
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
