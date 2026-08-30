import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const JOB_PROGRESS_STAGES = [
  'video_download',
  'ai_analysis',
  'ffmpeg_processing',
  'ffmpeg_cut',
  'upload',
  'done',
] as const;

export type JobProgressStage = (typeof JOB_PROGRESS_STAGES)[number];

export class JobProgressResponseDto {
  @ApiProperty({
    description: 'BullMQ job identifier.',
    example: 'clip-123',
  })
  jobId: string;

  @ApiProperty({
    description: 'Current job progress percentage in the range 0-100.',
    example: 65,
    minimum: 0,
    maximum: 100,
  })
  progress: number;

  @ApiProperty({
    description: 'Current processing stage label.',
    enum: JOB_PROGRESS_STAGES,
    example: 'ffmpeg_processing',
  })
  stage: JobProgressStage;

  @ApiPropertyOptional({
    description: 'BullMQ queue name that owns the job.',
    example: 'clip-generation',
  })
  queue?: string;

  @ApiPropertyOptional({
    description: 'Current BullMQ job state.',
    example: 'active',
  })
  state?: string;
}
