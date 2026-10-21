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

/** BullMQ job lifecycle states surfaced by `GET /jobs/:jobId/progress`. */
export const JOB_STATES = [
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'completed',
  'failed',
  'paused',
  'stuck',
  'unknown',
] as const;

export type JobState = (typeof JOB_STATES)[number];

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
    description:
      'Current BullMQ job state. `failed` means all retry attempts are exhausted ' +
      'and the job is retained for inspection via `GET /jobs/failed`. ' +
      'Use `POST /jobs/retry/:jobId` to re-queue a failed job.',
    enum: JOB_STATES,
    example: 'active',
  })
  state?: string;

  @ApiPropertyOptional({
    description:
      'Failure reason reported by BullMQ when `state` is `failed`. ' +
      'Present only on failed jobs; mirrors `job.failedReason`.',
    example: '[clip-generation:clip-123] Cloudinary upload failed after 3 attempts: timeout',
  })
  failedReason?: string;

  @ApiPropertyOptional({
    description: 'Number of attempts made so far (1-based count of tries).',
    example: 3,
  })
  attemptsMade?: number;

  @ApiPropertyOptional({
    description: 'Configured maximum attempts for the job. No further automatic retries remain once `attemptsMade >= maxAttempts`.',
    example: 3,
  })
  maxAttempts?: number;
}

/**
 * Shape returned by `GET /jobs/failed`.
 * Failed jobs are retained (`removeOnFail: false`) so API consumers can
 * distinguish transient queue errors (retry scheduled) from permanent
 * failures (`attemptsMade >= maxAttempts`).
 */
export class FailedJobResponseDto {
  @ApiProperty({ example: 'clip-123' })
  id: string;

  @ApiProperty({ example: 'generate-clip' })
  name: string;

  @ApiProperty({ description: 'Original job payload.', example: { clipId: 42 } })
  data: Record<string, unknown>;

  @ApiProperty({
    description: 'Consistent `[queue:jobId] message` failure reason.',
    example: '[clip-generation:clip-123] Cloudinary timeout',
  })
  failedReason: string;

  @ApiPropertyOptional({ description: 'Most recent stacktrace, when available.' })
  stacktrace: string[];

  @ApiProperty({ example: 3 })
  attemptsMade: number;

  @ApiPropertyOptional({ example: 1730000000000 })
  finishedOn?: number;

  @ApiPropertyOptional({ example: 1730000000000 })
  processedOn?: number;
}
