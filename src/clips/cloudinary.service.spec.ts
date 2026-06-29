import { Test, TestingModule } from '@nestjs/testing';
import { CloudinaryService } from './cloudinary.service';
import { v2 as cloudinary } from 'cloudinary';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { ServiceUnavailableException } from '../common/exceptions/service-unavailable.exception';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
      destroy: jest.fn(),
    },
  },
}));

jest.mock('streamifier', () => ({
  createReadStream: jest.fn(() => ({
    pipe: jest.fn(),
  })),
}));

describe('CloudinaryService', () => {
  let service: CloudinaryService;
  let circuitBreakerService: CircuitBreakerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudinaryService,
        CircuitBreakerService,
      ],
    }).compile();

    service = module.get<CloudinaryService>(CloudinaryService);
    circuitBreakerService = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  afterEach(() => {
    // Reset circuit breaker state
    circuitBreakerService.reset('cloudinary-upload');
    circuitBreakerService.reset('cloudinary-delete');
  });

  describe('uploadVideoFromBuffer with circuit breaker', () => {
    it('succeeds when Cloudinary upload succeeds', async () => {
      const mockBuffer = Buffer.from('test-video');
      const mockResult = {
        secure_url: 'https://cloudinary.com/video.mp4',
        public_id: 'test-clip',
        resource_type: 'video',
      };

      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (options, callback) => {
          callback(null, mockResult);
          return { on: jest.fn() };
        },
      );

      const result = await service.uploadVideoFromBuffer(
        mockBuffer,
        'test-clip',
        {},
      );

      expect(result.secure_url).toBe('https://cloudinary.com/video.mp4');
      expect(result.error).toBeUndefined();
      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledTimes(1);
    });

    it('returns error result when Cloudinary returns error (circuit breaker counts as failure)', async () => {
      const mockBuffer = Buffer.from('test-video');

      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (options, callback) => {
          callback(new Error('Upload failed'), null);
          return { on: jest.fn() };
        },
      );

      const results: Awaited<ReturnType<typeof service.uploadVideoFromBuffer>>[] = [];
      for (let i = 0; i < 6; i++) {
        const result = await service.uploadVideoFromBuffer(
          mockBuffer,
          `test-clip-${i}`,
          {},
        );
        results.push(result);
      }

      expect(results[0].error).toBe('Upload failed');
      expect(results.every((r) => r.error === 'Upload failed')).toBe(true);
    });

    it('fails fast with ServiceUnavailableException when circuit is open', async () => {
      const mockBuffer = Buffer.from('test-video');
      const uploadConfig = {
        name: 'cloudinary-upload',
        failureThreshold: 5,
        recoveryTimeout: 30000,
        samplingDuration: 60000,
      };

      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreakerService.execute(uploadConfig, async () => {
            throw new Error('Upload failed');
          });
        } catch {
          // Expected
        }
      }

      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (options, callback) => {
          callback(new Error('Upload failed'), null);
          return { on: jest.fn() };
        },
      );

      await expect(
        service.uploadVideoFromBuffer(mockBuffer, 'test-clip', {}),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('tracks circuit breaker metrics', async () => {
      const uploadConfig = {
        name: 'cloudinary-upload',
        failureThreshold: 5,
        recoveryTimeout: 30000,
        samplingDuration: 60000,
      };

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreakerService.execute(uploadConfig, async () => {
            throw new Error('Network error');
          });
        } catch {
          // Expected
        }
      }

      const metrics = circuitBreakerService.getMetrics('cloudinary-upload');
      expect(metrics).toBeDefined();
      expect(metrics?.name).toBe('cloudinary-upload');
      expect(metrics?.failures).toBe(3);
    });
  });

  describe('deleteClip with circuit breaker', () => {
    it('deletes clip successfully when circuit is closed', async () => {
      (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({ result: 'ok' });

      await service.deleteClip('test-public-id');

      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
        'test-public-id',
        { resource_type: 'video' },
      );
    });

    it('handles circuit breaker open state', async () => {
      // Mock to always fail
      (cloudinary.uploader.destroy as jest.Mock).mockRejectedValue(
        new Error('Delete failed'),
      );

      // Trigger 5 failures to open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.deleteClip(`clip-${i}`);
        } catch (e) {
          // Expected
        }
      }

      // Verify circuit breaker metrics
      const metrics = circuitBreakerService.getMetrics('cloudinary-delete');
      expect(metrics?.failures).toBeGreaterThanOrEqual(5);
    });
  });
});
