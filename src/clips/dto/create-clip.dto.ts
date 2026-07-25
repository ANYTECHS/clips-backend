import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsInt,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsValidRoyaltyBps,
  CLIP_ROYALTY_BPS_MAX,
} from '../../common/validators/decorators';

/** Default creator royalty: 1000 BPS = 10% */
export const DEFAULT_CLIP_ROYALTY_BPS = 1000;

export class CreateClipDto {
  @IsString()
  @IsNotEmpty()
  videoId: string;

  @IsString()
  @IsNotEmpty()
  inputPath: string;

  @IsString()
  @IsNotEmpty()
  outputPath: string;

  /** Start time in seconds — must be >= 0 */
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  startTime: number;

  /**
   * End time in seconds — must be > startTime.
   * Clip duration (endTime - startTime) must be between 5 and 300 seconds.
   */
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ValidateIf((o: CreateClipDto) => {
    const duration = o.endTime - o.startTime;
    if (o.endTime <= o.startTime) {
      throw new Error('endTime must be greater than startTime');
    }
    if (duration < 5 || duration > 300) {
      throw new Error('Clip duration must be between 5 and 300 seconds');
    }
    return true;
  })
  endTime: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  positionRatio: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  videoDuration?: number;

  @IsOptional()
  @IsString()
  transcript?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  existingViralityScore?: number;

  /**
   * NFT royalty in Basis Points (BPS).
   * 1000 BPS = 10%. Allowed range: 0–1500 (0–15%).
   * Defaults to 1000 when omitted.
   */
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
