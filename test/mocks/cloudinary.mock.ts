/**
 * Reusable Cloudinary SDK and service mocks for tests under test/.
 *
 * SDK usage:
 *   jest.mock('cloudinary', () => require('./mocks/cloudinary.mock'));
 *
 * Service usage:
 *   { provide: CloudinaryService, useClass: MockCloudinaryService }
 */
import {
  FAKE_PUBLIC_ID,
  FAKE_SECURE_URL,
  defaultUploadResult,
  failNextCloudinaryUpload,
  resetCloudinaryMock,
  v2,
} from '../../src/__mocks__/cloudinary';

export {
  FAKE_PUBLIC_ID,
  FAKE_SECURE_URL,
  defaultUploadResult,
  failNextCloudinaryUpload,
  resetCloudinaryMock,
  v2,
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
      public_id: publicId || FAKE_PUBLIC_ID,
    };
  }

  async deleteLocalFile(_filePath: string): Promise<void> {
    return;
  }

  async deleteClip(_publicId: string): Promise<void> {
    return;
  }
}
