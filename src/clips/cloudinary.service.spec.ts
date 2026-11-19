import { Test, TestingModule } from '@nestjs/testing';
import { CloudinaryService } from './cloudinary.service';

// Mock external dependencies
jest.mock('cloudinary');
jest.mock('fs/promises');
jest.mock('streamifier');

const mockStreamifier = {
  createReadStream: jest.fn().mockReturnValue({
    pipe: jest.fn()
  })
};

describe('CloudinaryService (#727 - Upload Integration)', () => {
  let service: CloudinaryService;
  let mockCloudinary: any;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock cloudinary
    mockCloudinary = {
      config: jest.fn(),
      uploader: {
        upload_stream: jest.fn(),
        destroy: jest.fn(),
      },
      url: jest.fn(),
    };

    // Mock the cloudinary module
    (require('cloudinary') as any).v2 = mockCloudinary;
    (require('streamifier') as any) = mockStreamifier;

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
      
      // Mock successful upload
      mockCloudinary.uploader.upload_stream.mockImplementation((options, callback) => {
        // Simulate async callback
        setImmediate(() => {
          callback(null, {
            secure_url: expectedVideoUrl,
            public_id: publicId,
            width: 1920,
            height: 1080,
            format: 'mp4',
            duration: 30.5,
          });
        });
        return { pipe: jest.fn() };
      });

      mockCloudinary.url.mockReturnValue(expectedThumbnailUrl);

      const result = await service.uploadVideoFromBuffer(mockBuffer, publicId);

      expect(result.error).toBeUndefined();
      expect(result.secure_url).toBe(expectedVideoUrl);
      expect(result.thumbnail_url).toBe(expectedThumbnailUrl);
      expect(result.public_id).toBe(publicId);
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

      mockCloudinary.uploader.upload_stream.mockImplementation((options, callback) => {
        setImmediate(() => {
          callback(new Error(errorMessage), null);
        });
        return { pipe: jest.fn() };
      });

      const result = await service.uploadVideoFromBuffer(mockBuffer, publicId);

      expect(result.error).toBe(errorMessage);
      expect(result.secure_url).toBe('');
      expect(result.public_id).toBe(publicId);
    });

    it('should generate fallback thumbnail URL', () => {
      const publicId = 'test-clip-thumbnail';
      const expectedUrl = 'https://res.cloudinary.com/demo/video/upload/test-clip-thumbnail.jpg';
      
      mockCloudinary.url.mockReturnValue(expectedUrl);

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
      
      mockCloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

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