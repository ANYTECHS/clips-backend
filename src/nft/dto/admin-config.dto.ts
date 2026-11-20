import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

/** Request body for POST /nfts/admin/config/platform-fee (Issue #835). */
export class SetPlatformFeeDto {
  @ApiProperty({
    description:
      'Stellar wallet address of the contract owner that will sign the set_platform_fee transaction',
    example: 'GADMIN6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  adminAddress!: string;

  @ApiProperty({
    description: 'Platform fee in basis points (100 = 1%). Max 10_000 (100%).',
    example: 200,
    minimum: 0,
    maximum: 10_000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  platformFeeBps!: number;
}

/** Request body for POST /nfts/admin/config/default-royalty (Issue #835). */
export class SetDefaultRoyaltyDto {
  @ApiProperty({
    description:
      'Stellar wallet address of the contract owner that will sign the set_default_royalty transaction',
    example: 'GADMIN6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  adminAddress!: string;

  @ApiProperty({
    description: 'Default royalty in basis points (100 = 1%). Max 10_000 (100%).',
    example: 1000,
    minimum: 0,
    maximum: 10_000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  defaultRoyaltyBps!: number;
}

/** Response for admin config prepare endpoints (Issue #835). */
export class AdminConfigTxResponseDto {
  @ApiProperty({ example: 'AAAAAgAAAA...' })
  xdr!: string;

  @ApiProperty({
    example: 'set_platform_fee',
    description: 'Contract method invoked',
  })
  action!: string;

  @ApiProperty({
    example: 200,
    description: 'Configured value in basis points',
  })
  valueBps!: number;

  @ApiProperty({
    example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  })
  contractId!: string;

  @ApiProperty({ example: 'testnet' })
  network!: string;

  @ApiProperty({
    example: 'ConfigUpdated',
    description:
      'On-chain event emitted by the contract when this transaction succeeds. ' +
      'Also emitted locally as `soroban.config.updated` for backend listeners.',
  })
  emits!: string;
}

/** Response for GET platform-fee / default-royalty views. */
export class AdminConfigValueResponseDto {
  @ApiProperty({ example: 200, description: 'Value in basis points' })
  valueBps!: number;

  @ApiProperty({
    example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  })
  contractId!: string;
}
