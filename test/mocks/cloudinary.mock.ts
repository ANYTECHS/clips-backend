/**
 * Reusable Cloudinary mock for E2E / integration tests in the test/ directory.
 *
 * Low-level SDK mock usage:
 *   jest.mock('cloudinary', () => require('../mocks/cloudinary.mock'));
 *
 * High-level service mock usage:
 *   import { MockCloudinaryService } from '../mocks/cloudinary.mock';
 *   { provide: CloudinaryService, useClass: MockCloudinaryService }
 */

export const FAKE_SECURE_URL =
  'https://res.cloudinary.com/demo/video/upload/clips/test-clip.mp4';
export const FAKE_PUBLIC_ID = 'clips/test-clip';

export const defaultUploadResult = {
  secure_url: FAKE_SECURE_URL,
  public_id: FAKE_PUBLIC_ID,
  resource_type: 'video',
};

export const v2 = {
  config: jest.fn(),
  uploader: {
    /** Simulates a successful upload. Override per-test via mockImplementation. */
    upload_stream: jest.fn().mockImplementation((_options: unknown, callback: Function) => {
      callback(null, defaultUploadResult);
      return { on: jest.fn() };
    }),
    destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
  },
};

export default { v2 };

/** Drop-in replacement for CloudinaryService in unit and E2E tests. */
export class MockCloudinaryService {
  async readFileToBuffer(_filePath: string): Promise<Buffer> {
    return Buffer.from('mock-video-data');
  }

  async uploadVideoFromBuffer(_buf: Buffer, publicId: string) {
    return {
      secure_url: `${FAKE_SECURE_URL.replace('test-clip', publicId)}`,
      thumbnail_url: `https://res.cloudinary.com/demo/video/upload/${publicId}.jpg`,
      public_id: publicId,
    };
  }

  async deleteLocalFile(_filePath: string): Promise<void> {
    return;
  }

  async deleteClip(_publicId: string): Promise<void> {
    return;
  }
}
