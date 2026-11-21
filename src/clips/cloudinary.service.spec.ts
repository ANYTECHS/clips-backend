import { Test, TestingModule } from '@nestjs/testing';
import { CloudinaryService } from './cloudinary.service';

// Mock external dependencies
jest.mock('cloudinary');
jest.mock('fs/promises');
jest.mock('streamifier', () => ({
  createReadStream: jest.fn().mockReturnValue({ pipe: jest.fn() }),
}));

import {
  failNextCloudinaryUpload,
  resetCloudinaryMock,
} from '../../test/mocks/cloudinary.mock';

describe('CloudinaryService (#727 - Upload Integration)', () => {
  let service: CloudinaryService;
  let mockCloudinary: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    resetCloudinaryMock();
    mockCloudinary = (require('cloudinary') as any).v2;

    const module: TestingModule = await Test.createTestingModule({
      providers: [CloudinaryService],
    }).compile();

    service = module.get<CloudinaryService>(CloudinaryService);
  });

  describe('uploadVideoFromBuffer', () => {
    it('should upload video successfully with thumbnail', async () => {
      const mockBuffer = Buffer.from('fake-video-data');
      const publicId = 'test-clip-123';
      const expectedVideoUrl = 'https://res.cloudinary.com/demo/video/upload/clips/test-clip-123.mp4';
      const expectedThumbnailUrl = 'https://res.cloudinary.com/demo/video/upload/clips/test-clip-123.jpg';

      const result = await service.uploadVideoFromBuffer(mockBuffer, publicId);

      expect(jest.isMockFunction(mockCloudinary.uploader.upload_stream)).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.secure_url).toBe(expectedVideoUrl);
      expect(result.thumbnail_url).toBe(expectedThumbnailUrl);
      expect(result.public_id).toBe(`clips/${publicId}`);
      expect(result.duration).toBe(30.5);

      // Verify upload was called with correct options
      expect(mockCloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          public_id: publicId,
          folder: 'clips',
          resource_type: 'video',
          eager: expect.arrayContaining([
            expect.objectContaining({
              width: 400,
              height: 300,
              crop: 'pad',
              start_offset: 0.5,
              format: 'jpg'
            })
          ])
        }),
        expect.any(Function)
      );
    });

    it('should handle upload errors gracefully', async () => {
      const mockBuffer = Buffer.from('fake-video-data');
      const publicId = 'test-clip-error';
      const errorMessage = 'Network timeout';

      failNextCloudinaryUpload(new Error(errorMessage));

      const result = await service.uploadVideoFromBuffer(mockBuffer, publicId);

      expect(result.error).toBe(errorMessage);
      expect(result.secure_url).toBe('');
      expect(result.public_id).toBe(publicId);
    });

    it('should generate fallback thumbnail URL', () => {
      const publicId = 'test-clip-thumbnail';
      const expectedUrl = 'https://res.cloudinary.com/demo/video/upload/test-clip-thumbnail.jpg';
      const result = service.generateThumbnailUrl(publicId);

      expect(result).toBe(expectedUrl);
      expect(mockCloudinary.url).toHaveBeenCalledWith(publicId, {
        resource_type: 'video',
        format: 'jpg',
        transformation: [
          { start_offset: '0.5' },
          { width: 400, height: 300, crop: 'pad' }
        ],
      });
    });
  });

  describe('deleteClip', () => {
    it('should delete clip successfully', async () => {
      const publicId = 'test-clip-delete';
      
      await service.deleteClip(publicId);

      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith(publicId, {
        resource_type: 'video'
      });
    });

    it('should handle delete errors by rethrowing', async () => {
      const publicId = 'test-clip-delete-error';
      const error = new Error('Delete failed');
      
      mockCloudinary.uploader.destroy.mockRejectedValue(error);

      await expect(service.deleteClip(publicId)).rejects.toThrow('Delete failed');
    });
  });
});