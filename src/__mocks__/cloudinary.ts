/**
 * Reusable Jest manual mock for the `cloudinary` package.
 * Place this file at src/__mocks__/cloudinary.ts so Jest auto-resolves it
 * whenever a module does `import { v2 as cloudinary } from 'cloudinary'`.
 *
 * Usage in tests:
 *   jest.mock('cloudinary');
 *   import { v2 as cloudinary } from 'cloudinary';
 *   (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(...)
 */

export const FAKE_SECURE_URL = 'https://res.cloudinary.com/demo/video/upload/clips/test-clip.mp4';
export const FAKE_PUBLIC_ID = 'clips/test-clip';

/** Default successful upload result returned by upload_stream mock. */
export const defaultUploadResult = {
  secure_url: FAKE_SECURE_URL,
  public_id: FAKE_PUBLIC_ID,
  resource_type: 'video',
};

const v2 = {
  config: jest.fn(),
  uploader: {
    /**
     * Simulates a successful upload by default.
     * Override per-test:
     *   (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
     *     (opts, cb) => { cb(new Error('fail'), null); return { on: jest.fn() }; }
     *   );
     */
    upload_stream: jest.fn().mockImplementation((_options, callback) => {
      callback(null, defaultUploadResult);
      return { on: jest.fn() };
    }),
    destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
  },
};

export { v2 };
export default { v2 };
