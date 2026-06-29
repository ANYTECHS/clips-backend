import { Test, TestingModule } from '@nestjs/testing';
import { VideoUploadController } from './video-upload.controller';
import { VideoUploadService } from './video-upload.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

describe('VideoUploadController', () => {
  let controller: VideoUploadController;
  let videoUploadService: VideoUploadService;

  const mockVideoUploadService = {
    processUpload: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideoUploadController],
      providers: [
        { provide: VideoUploadService, useValue: mockVideoUploadService },
      ],
    }).compile();

    controller = module.get<VideoUploadController>(VideoUploadController);
    videoUploadService = module.get<VideoUploadService>(VideoUploadService);
  });

  describe('uploadVideo', () => {
    const mockFile = {
      path: '/tmp/uploads/upload-123456789-123456789.mp4',
      originalname: 'test-video.mp4',
      mimetype: 'video/mp4',
      size: 50 * 1024 * 1024, // 50 MB
      filename: 'upload-123456789-123456789.mp4',
    } as any;

    const mockRequest = (userId: number) =>
      ({
        user: { id: userId },
      } as any);

    it('should upload video successfully', async () => {
      const mockResult = {
        jobId: 'job_abc123',
        videoId: 123,
        status: 'accepted',
        message: 'Video upload accepted and queued for processing',
        estimatedProcessingTime: 600,
      };

      mockVideoUploadService.processUpload.mockResolvedValue(mockResult);

      const result = await controller.uploadVideo(
        mockFile,
        'My Test Video',
        mockRequest(1),
      );

      expect(result).toEqual(mockResult);
      expect(mockVideoUploadService.processUpload).toHaveBeenCalledWith(
        mockFile.path,
        mockFile.originalname,
        1,
        'My Test Video',
      );
    });

    it('should upload video without title', async () => {
      const mockResult = {
        jobId: 'job_def456',
        videoId: 124,
        status: 'accepted',
        message: 'Video upload accepted and queued for processing',
        estimatedProcessingTime: 300,
      };

      mockVideoUploadService.processUpload.mockResolvedValue(mockResult);

      const result = await controller.uploadVideo(mockFile, undefined, mockRequest(1));

      expect(result).toEqual(mockResult);
      expect(mockVideoUploadService.processUpload).toHaveBeenCalledWith(
        mockFile.path,
        mockFile.originalname,
        1,
        undefined,
      );
    });

    it('should throw BadRequestException when no file is uploaded', async () => {
      await expect(
        controller.uploadVideo(undefined as any, undefined, mockRequest(1)),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user is not authenticated', async () => {
      const requestWithoutUser = { user: undefined } as any;

      await expect(
        controller.uploadVideo(mockFile, undefined, requestWithoutUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle validation errors from service', async () => {
      mockVideoUploadService.processUpload.mockRejectedValue(
        new BadRequestException({
          status: 'error',
          message: 'Invalid file format',
          code: 'INVALID_FORMAT',
        }),
      );

      await expect(
        controller.uploadVideo(mockFile, undefined, mockRequest(1)),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle service errors and wrap in BadRequestException', async () => {
      mockVideoUploadService.processUpload.mockRejectedValue(
        new Error('Unexpected error'),
      );

      await expect(
        controller.uploadVideo(mockFile, undefined, mockRequest(1)),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 202 status code on success', async () => {
      const mockResult = {
        jobId: 'job_ghi789',
        videoId: 125,
        status: 'accepted',
        message: 'Video upload accepted and queued for processing',
        estimatedProcessingTime: 450,
      };

      mockVideoUploadService.processUpload.mockResolvedValue(mockResult);

      const result = await controller.uploadVideo(mockFile, 'Title', mockRequest(1));

      expect(result.status).toBe('accepted');
      expect(result.jobId).toBeDefined();
      expect(result.videoId).toBeDefined();
    });
  });
});
