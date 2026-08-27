import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ArrayNotEmpty,
  ValidateNested,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsValidRoyaltyBps,
  CLIP_ROYALTY_BPS_MAX,
} from '../../common/validators/decorators';
import { DEFAULT_CLIP_ROYALTY_BPS } from './create-clip.dto';

export class ClipUpdatesDto {
  @ApiPropertyOptional({
    description: 'Mark clips as curated/selected',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  selected?: boolean;

  @ApiPropertyOptional({
    description: 'Posting status. Simple values: pending | posted | failed, or platform-specific JSON object',
    example: { platform: 'tiktok', status: 'posted', postId: '12345' },
  })
  @IsOptional()
  postStatus?: unknown;

  @ApiPropertyOptional({
    description: 'User-editable caption to override the auto-generated one',
    example: 'Check out this amazing clip! 🎬',
  })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional({
    description:
      'NFT royalty in BPS (0–1500). 1000 = 10%. Defaults to 1000 when omitted.',
    example: 1000,
    minimum: 0,
    maximum: 1500,
    default: DEFAULT_CLIP_ROYALTY_BPS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsValidRoyaltyBps({ max: CLIP_ROYALTY_BPS_MAX })
  royaltyBps?: number;
}

export class BulkUpdateClipsDto {
  @ApiProperty({
    description: 'IDs of clips to update — must all belong to the requesting user',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Type(() => Number)
  clipIds: number[];

  @ApiProperty({
    description: 'Updates to apply to the specified clips',
    type: () => ClipUpdatesDto,
  })
  @ValidateNested()
  @Type(() => ClipUpdatesDto)
  updates: ClipUpdatesDto;
}
