import { ApiProperty } from '@nestjs/swagger';

export class UploadVideoResponseDto {
  @ApiProperty({
    description: 'Unique job ID for polling upload/processing status',
    example: 'job_abc123xyz',
  })
  jobId: string;

  @ApiProperty({
    description: 'Video ID assigned to the uploaded file',
    example: 123,
  })
  videoId: number;

  @ApiProperty({
    description: 'Upload status',
    example: 'accepted',
    enum: ['accepted', 'rejected'],
  })
  status: string;

  @ApiProperty({
    description: 'Human-readable message',
    example: 'Video upload accepted and queued for processing',
  })
  message: string;

  @ApiProperty({
    description: 'Estimated processing time in seconds',
    example: 120,
    required: false,
  })
  estimatedProcessingTime?: number;
}

export class UploadVideoErrorDto {
  @ApiProperty({
    description: 'Error status',
    example: 'error',
  })
  status: string;

  @ApiProperty({
    description: 'Error message',
    example: 'Invalid file format. Allowed: mp4, mov, avi, webm',
  })
  message: string;

  @ApiProperty({
    description: 'Error code',
    example: 'INVALID_FORMAT',
    enum: ['INVALID_FORMAT', 'FILE_TOO_LARGE', 'DURATION_EXCEEDED', 'UPLOAD_FAILED'],
  })
  code: string;
}
