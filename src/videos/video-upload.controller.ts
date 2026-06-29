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
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import type { Request } from 'express';
import { LoginGuard } from '../auth/guards/login.guard.js';
import { VideoUploadService } from './video-upload.service';
import { UploadVideoResponseDto, UploadVideoErrorDto } from './dto/upload-video.dto.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm'];
const MAX_FILE_SIZE = 500 * 1024 * 1024;

@ApiTags('videos')
@UseGuards(LoginGuard)
@Controller('videos')
export class VideoUploadController {
  constructor(private readonly videoUploadService: VideoUploadService) {}

  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Upload a video file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 202, description: 'Video upload accepted', type: UploadVideoResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid file', type: UploadVideoErrorDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: async (req, file, cb) => {
          const tempDir = path.join(os.tmpdir(), 'clipcash-uploads');
          try {
            await fs.mkdir(tempDir, { recursive: true });
            cb(null, tempDir);
          } catch (error) {
            cb(error as any, tempDir);
          }
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `upload-${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (ALLOWED_EXTENSIONS.includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Invalid file format "${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`), false);
        }
      },
    }),
  )
  async uploadVideo(
    @UploadedFile() file: any,
    @Body('title') title: string | undefined,
    @Req() req: any,
  ): Promise<UploadVideoResponseDto> {
    if (!file) {
      throw new BadRequestException({ status: 'error', message: 'No file uploaded', code: 'UPLOAD_FAILED' });
    }

    const userId = Number(req.user?.id ?? 0);
    if (!userId) {
      throw new BadRequestException({ status: 'error', message: 'User not authenticated', code: 'UPLOAD_FAILED' });
    }

    try {
      const result = await this.videoUploadService.processUpload(file.path, file.originalname, userId, title);
      return {
        jobId: result.jobId,
        videoId: result.videoId,
        status: result.status,
        message: result.message,
        estimatedProcessingTime: result.estimatedProcessingTime,
      };
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        throw new BadRequestException({ status: 'error', message: (error as Error).message || 'Upload failed', code: 'UPLOAD_FAILED' });
      }
      throw error;
    }
  }
}
