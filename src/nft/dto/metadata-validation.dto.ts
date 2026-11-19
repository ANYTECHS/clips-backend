import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';

/**
 * Request body for POST /nfts/:id/validate-metadata.
 * Closes #848.
 */
export class ValidateNftMetadataDto {
  @ApiProperty({
    description:
      'The NFT metadata JSON object to validate. ' +
      'Required fields: name, description, image, animation_url, attributes, ' +
      'seller_fee_basis_points, royalty (with bps and percent).',
    example: {
      name: 'My Clip',
      description: 'A fun viral moment',
      image: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      animation_url: 'https://cdn.example.com/clips/clip-42.mp4',
      attributes: [
        { trait_type: 'Clip Duration', value: 30 },
        { trait_type: 'Virality Score', value: 85 },
        { trait_type: 'Platform', value: 'ClipCash' },
      ],
      seller_fee_basis_points: 1000,
      royalty: { bps: 1000, percent: 10 },
    },
  })
  @IsObject()
  metadata: Record<string, unknown>;
}

/** A single field-level validation error. */
export class MetadataValidationErrorItemDto {
  @ApiProperty({
    example: 'image',
    description: 'The metadata field path that failed validation (e.g. "image", "attributes[0].trait_type").',
  })
  field: string;

  @ApiProperty({
    example: "'image' must be a valid URI starting with: https://, http://, ipfs://, ar://",
    description: 'Human-readable description of what is wrong.',
  })
  message: string;
}

/**
 * Response body for POST /nfts/:id/validate-metadata.
 * Contains all errors found (not just the first).
 */
export class MetadataValidationResponseDto {
  @ApiProperty({
    example: false,
    description: 'True only when all validation checks pass.',
  })
  valid: boolean;

  @ApiProperty({
    type: [MetadataValidationErrorItemDto],
    description:
      'All validation errors found. Empty array when valid is true. ' +
      'Multiple errors can be returned in a single response.',
    example: [
      {
        field: 'image',
        message: "'image' must be a valid URI starting with: https://, http://, ipfs://, ar://",
      },
      {
        field: 'royalty.bps',
        message: 'royalty.bps must be a finite number',
      },
    ],
  })
  errors: MetadataValidationErrorItemDto[];
}

/** Request body for validating a metadata URI string alone. */
export class MetadataUriValidationDto {
  @ApiProperty({
    example: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    description:
      'Metadata URI to validate. Must start with one of: https://, http://, ipfs://, ar://.',
  })
  @IsString()
  uri: string;
}

/** 400 response for malformed request body. */
export class MetadataValidationBadRequestDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'metadata must be an object' })
  message: string;

  @ApiPropertyOptional({ example: 'Bad Request' })
  error?: string;
}
