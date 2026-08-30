import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Enum representing every stage in the NFT minting lifecycle.
 *
 * Stages advance in order:
 *   none → upload → prepare → submit → confirm
 *
 * On error the stage transitions to:
 *   → fail (retryable) or fail + permanentFailure=true (exhausted)
 */
export enum MintStageEnum {
  NONE = 'none',
  UPLOAD = 'upload',
  PREPARE = 'prepare',
  SUBMIT = 'submit',
  CONFIRM = 'confirm',
  FAIL = 'fail',
}

/**
 * Full mint lifecycle status response for a clip.
 * Returned by GET /nfts/:id/mint-status.
 * Closes #849.
 */
export class MintStatusResponseDto {
  @ApiProperty({ example: 1, description: 'NftMintStatus record ID.' })
  id: number;

  @ApiProperty({ example: 42, description: 'Clip ID this status record belongs to.' })
  clipId: number;

  @ApiProperty({
    enum: MintStageEnum,
    enumName: 'MintStageEnum',
    example: MintStageEnum.UPLOAD,
    description:
      'Current lifecycle stage. Progresses: none → upload → prepare → submit → confirm. ' +
      'On failure transitions to: fail. ' +
      'When permanentFailure is true no further retries will be scheduled.',
  })
  stage: MintStageEnum;

  @ApiPropertyOptional({
    example: 'abc123txhash',
    description: 'On-chain Stellar transaction hash. Set after the submit stage.',
    nullable: true,
  })
  txHash: string | null;

  @ApiProperty({
    example: 0,
    description: 'Total number of retry attempts made so far.',
  })
  retryCount: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-01-01T00:00:00.000Z',
    description:
      'ISO 8601 timestamp of the next allowed retry attempt (exponential backoff). ' +
      'Null when no retry is scheduled.',
    nullable: true,
  })
  nextRetryAt: Date | null;

  @ApiPropertyOptional({
    example: 'Soroban RPC timeout after 30 s',
    description:
      'Human-readable failure reason. Populated when stage is "fail". ' +
      'Null for all other stages.',
    nullable: true,
  })
  failureReason: string | null;

  @ApiProperty({
    example: false,
    description:
      'True when the transaction has permanently failed and will not be retried. ' +
      'This happens when the retry limit is exhausted or a non-recoverable error occurs.',
  })
  permanentFailure: boolean;

  @ApiPropertyOptional({
    example: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    description: 'IPFS metadata URI. Set after the upload stage.',
    nullable: true,
  })
  metadataUri: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'ISO 8601 timestamp when this record was created.',
  })
  createdAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'ISO 8601 timestamp of the last update.',
  })
  updatedAt: Date;
}

/** 404 response shape for GET /nfts/:id/mint-status. */
export class MintStatusNotFoundDto {
  @ApiProperty({ example: 404 })
  statusCode: number;

  @ApiProperty({ example: 'Clip 42 not found' })
  message: string;
}
