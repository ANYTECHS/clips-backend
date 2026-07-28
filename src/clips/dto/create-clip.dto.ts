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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsValidRoyaltyBps,
  CLIP_ROYALTY_BPS_MAX,
} from '../../common/validators/decorators';

/** Default creator royalty: 1000 BPS = 10% */
export const DEFAULT_CLIP_ROYALTY_BPS = 1000;

export class CreateClipDto {
  @ApiProperty({
    description: 'Source video ID',
    example: '123',
  })
  @IsString()
  @IsNotEmpty()
  videoId: string;

  @ApiProperty({
    description: 'Absolute or storage path to the input video',
    example: '/tmp/uploads/source.mp4',
  })
  @IsString()
  @IsNotEmpty()
  inputPath: string;

  @ApiProperty({
    description: 'Output path for the generated clip',
    example: '/tmp/clips/clip-123.mp4',
  })
  @IsString()
  @IsNotEmpty()
  outputPath: string;

  @ApiProperty({
    description: 'Start time in seconds — must be >= 0',
    example: 10.5,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  startTime: number;

  @ApiProperty({
    description:
      'End time in seconds — must be > startTime. Duration must be 5–300 seconds.',
    example: 25.0,
    minimum: 0,
  })
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

  @ApiProperty({
    description: 'Relative position in the source video (0–1)',
    example: 0.35,
    minimum: 0,
    maximum: 1,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  positionRatio: number;

  @ApiPropertyOptional({
    description: 'Full source video duration in seconds',
    example: 600,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  videoDuration?: number;

  @ApiPropertyOptional({
    description: 'Optional transcript text for the clip',
    example: 'Welcome to the highlight of the match...',
  })
  @IsOptional()
  @IsString()
  transcript?: string;

  @ApiPropertyOptional({
    description: 'Clip title',
    example: 'Game-winning goal',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Existing clip ID when regenerating',
    example: 42,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId?: number;

  @ApiPropertyOptional({
    description: 'Existing virality score to preserve',
    example: 87.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  existingViralityScore?: number;

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
