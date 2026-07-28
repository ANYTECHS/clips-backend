import {
  Controller,
  Post,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Body,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import { LoginGuard } from '../auth/guards/login.guard.js';
import { VideoUploadService } from './video-upload.service';
import { UploadVideoResponseDto, UploadVideoErrorDto } from './dto/upload-video.dto.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm'];

// Max file size: 500 MB
const MAX_FILE_SIZE = 500 * 1024 * 1024;

@ApiTags('videos')
@ApiBearerAuth('access-token')
@UseGuards(LoginGuard)
@Controller('videos')
export class VideoUploadController {
  constructor(private readonly videoUploadService: VideoUploadService) {}

  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Upload a video file',
    description: `
Uploads a video file and enqueues it for clip generation.

**Validation:**
- File format: mp4, mov, avi, webm
- File size: max 500 MB
- Video duration: max 4 hours (verified via FFmpeg)

**Returns:**
- 202 Accepted with jobId for polling
- 400 Bad Request for invalid files

The uploaded video is stored temporarily and queued for async processing.
Temp files are automatically cleaned up after processing completes or fails.
    `,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Video file (mp4, mov, avi, webm). Max 500 MB.',
        },
        title: {
          type: 'string',
          description: 'Optional video title',
          example: 'My Awesome Video',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 202,
    description: 'Video upload accepted and queued for processing',
    type: UploadVideoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file format, size, or duration',
    type: UploadVideoErrorDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - login required',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: async (req, file, cb) => {
          // Create temp directory for uploads
          const tempDir = path.join(os.tmpdir(), 'clipcash-uploads');
          try {
            await fs.mkdir(tempDir, { recursive: true });
            cb(null, tempDir);
          } catch (error) {
            cb(error, tempDir);
          }
        },
        filename: (req, file, cb) => {
          // Generate unique filename with original extension
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `upload-${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: MAX_FILE_SIZE,
      },
      fileFilter: (req, file, cb) => {
        // Validate file extension
        const ext = extname(file.originalname).toLowerCase();
        if (ALLOWED_EXTENSIONS.includes(ext)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Invalid file format "${ext}". Allowed formats: ${ALLOWED_EXTENSIONS.join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title: string | undefined,
    @Req() req: Request,
  ): Promise<UploadVideoResponseDto> {
    if (!file) {
      throw new BadRequestException({
        status: 'error',
        message: 'No file uploaded',
        code: 'UPLOAD_FAILED',
      });
    }

    const userId = Number((req as any).user?.id ?? 0);
    if (!userId) {
      throw new BadRequestException({
        status: 'error',
        message: 'User not authenticated',
        code: 'UPLOAD_FAILED',
      });
    }

    try {
      // Process the upload
      const result = await this.videoUploadService.processUpload(
        file.path,
        file.originalname,
        userId,
        title,
      );

      return {
        jobId: result.jobId,
        videoId: result.videoId,
        status: result.status,
        message: result.message,
        estimatedProcessingTime: result.estimatedProcessingTime,
      };
    } catch (error) {
      // If it's not already a BadRequestException, wrap it
      if (!(error instanceof BadRequestException)) {
        throw new BadRequestException({
          status: 'error',
          message: error.message || 'Upload failed',
          code: 'UPLOAD_FAILED',
        });
      }
      throw error;
    }
  }
}
