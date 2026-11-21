import {
  Controller,
  Post,
  Req,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiPayloadTooLargeResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import type { Request } from 'express';
import {
  QueueRateLimitGuard,
  QueueRateLimit,
} from '../common/guards/queue-rate-limit.guard';
import { VideoUploadService } from './video-upload.service';
import { Auth } from '../auth/decorators/auth.decorator';
import {
  UploadVideoRequestDto,
  UploadVideoResponseDto,
  UploadVideoErrorDto,
} from './dto/upload-video.dto.js';
import * as fs from 'fs/promises';
import {
  VIDEO_UPLOAD_CONFIG,
  videoFileFilter,
  assertValidVideoFile,
} from './validators/video-file.validator';
import * as path from 'path';
import * as os from 'os';
import {
  VideoUploadMetadataDto,
  SUPPORTED_VIDEO_FORMATS,
} from './dto/video-upload-metadata.dto';


const ALLOWED_EXTENSIONS = SUPPORTED_VIDEO_FORMATS.map((f) => `.${f}`);
const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

@ApiTags('Videos')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Auth()
@Controller('videos')
export class VideoUploadController {
  constructor(private readonly videoUploadService: VideoUploadService) {}

  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(QueueRateLimitGuard)
  @QueueRateLimit({ queue: 'clip-generation', maxJobs: 5 })
  @ApiOperation({
    summary: 'Upload a video file for clip generation',
    description:
      'Accepts a multipart/form-data video file (mp4, mov, avi, webm), saves it to a ' +
      'temporary directory, validates format/size/duration, creates a Video record, and ' +
      'enqueues a clip-generation job. Returns a jobId for polling status. ' +
      'Cloudinary clip URLs are available on generated clip records after processing completes. ' +
      'Maximum file size: 500 MB. Maximum duration: 4 hours.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadVideoRequestDto })
  @ApiResponse({
    status: 202,
    description: 'Video upload accepted and queued for processing',
    type: UploadVideoResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Unsupported extension/MIME type, file content is not a real video (magic-byte check), ' +
      'empty file, or video duration exceeds 4 hours',
    type: UploadVideoErrorDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Failed to process the uploaded video',
  })
  @ApiPayloadTooLargeResponse({
    description:
      'File exceeds the configured upload limit (VIDEO_UPLOAD_MAX_SIZE_MB, default 500 MB)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiTooManyRequestsResponse({
    description:
      'Too many active clip-generation jobs for this user. Retry after the number of seconds in the Retry-After header.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: async (req, file, cb) => {
          const tempDir = path.join(os.tmpdir(), 'clipcash-uploads');
          try {
            await fs.mkdir(tempDir, { recursive: true });
            cb(null, tempDir);
          } catch (error) {
            cb(error, tempDir);
          }
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `upload-${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: VIDEO_UPLOAD_CONFIG.maxFileSize, files: 1 },
      fileFilter: videoFileFilter,
    }),
  )
  async uploadVideo(
    @UploadedFile() file: any,
    @Body() metadata: VideoUploadMetadataDto,
    @Req() req: any,
  ): Promise<UploadVideoResponseDto> {
    if (!file) {
      throw new BadRequestException({
        status: 'error',
        message: 'No file uploaded',
        code: 'UPLOAD_FAILED',
      });
    }

    // Issue #1358: verify real content (magic bytes) + size before any job is created
    await assertValidVideoFile(file);

    const userId = Number(req.user?.id ?? 0);
    if (!userId) {
      throw new BadRequestException({
        status: 'error',
        message: 'User not authenticated',
        code: 'UPLOAD_FAILED',
      });
    }

    try {
      const result = await this.videoUploadService.processUpload(
        file.path,
        file.originalname,
        userId,
        metadata.title,
      );
      return {
        jobId: result.jobId,
        videoId: result.videoId,
        status: result.status,
        message: result.message,
        estimatedProcessingTime: result.estimatedProcessingTime,
      };
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        throw new BadRequestException({
          status: 'error',
          message: (error as Error).message || 'Upload failed',
          code: 'UPLOAD_FAILED',
        });
      }
      throw error;
    }
  }
}
