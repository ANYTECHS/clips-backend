import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import {
  IsValidRoyaltyBps,
  CLIP_ROYALTY_BPS_MAX,
} from '../../common/validators/decorators';
import { DEFAULT_CLIP_ROYALTY_BPS } from './create-clip.dto';

/**
 * Body for PATCH /clips/:id/royalty
 * Allows creators to configure NFT royalty BPS (0–1500) before minting.
 */
export class UpdateClipRoyaltyDto {
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
