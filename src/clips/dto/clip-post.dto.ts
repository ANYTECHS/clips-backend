import { ApiProperty } from '@nestjs/swagger';
import { SUPPORTED_PLATFORMS } from '../../common/validators/is-valid-platform.validator';

export class ClipPostingAcceptedDto {
  @ApiProperty({ example: 42, description: 'ID of the clip being posted' })
  clipId: number;

  @ApiProperty({
    example: 'post-42-1730000000000',
    description: 'BullMQ posting job ID',
  })
  jobId: string;

  @ApiProperty({ example: 'queued', enum: ['queued'] })
  status: 'queued';

  @ApiProperty({
    example: ['tiktok', 'instagram'],
    enum: SUPPORTED_PLATFORMS,
    isArray: true,
    description: 'Connected platforms selected for this posting job',
  })
  platforms: string[];
}

export class ClipPostStatusDto {
  @ApiProperty({ example: 123 })
  id: number;

  @ApiProperty({ example: 42, description: 'ID of the clip being posted' })
  clipId: number;

  @ApiProperty({ example: 'instagram', enum: SUPPORTED_PLATFORMS })
  platform: string;

  @ApiProperty({
    example: 'published',
    enum: ['pending', 'published', 'failed'],
  })
  status: 'pending' | 'published' | 'failed';

  @ApiProperty({ example: 'ayrshare-post-123', nullable: true })
  postId: string | null;

  @ApiProperty({ example: 1, description: 'Number of posting attempts' })
  attempts: number;

  @ApiProperty({ example: null, nullable: true })
  error: string | null;
}
