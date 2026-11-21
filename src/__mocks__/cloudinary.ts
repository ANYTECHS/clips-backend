/**
 * Jest manual mock for the Cloudinary SDK. All upload and URL methods are
 * local Jest mocks; they never make network requests.
 */
export const FAKE_SECURE_URL =
  'https://res.cloudinary.com/demo/video/upload/clips/test-clip.mp4';
export const FAKE_PUBLIC_ID = 'clips/test-clip';

export const defaultUploadResult = {
  secure_url: FAKE_SECURE_URL,
  public_id: FAKE_PUBLIC_ID,
  resource_type: 'video',
  width: 1920,
  height: 1080,
  format: 'mp4',
  duration: 30.5,
};

type UploadOptions = Record<string, unknown>;
type UploadCallback = (
  error: Error | null,
  result: Record<string, unknown> | null,
) => void;

const fakeUploadStream = { on: jest.fn(), pipe: jest.fn() };
const cloudinaryBaseUrl = 'https://res.cloudinary.com/demo';

function fakeSuccessfulUpload(
  options: UploadOptions,
  callback: UploadCallback,
) {
  const requestedId =
    typeof options.public_id === 'string' ? options.public_id : 'test-clip';
  const folder = typeof options.folder === 'string' ? options.folder : '';
  const publicId =
    folder && !requestedId.startsWith(`${folder}/`)
      ? `${folder}/${requestedId}`
      : requestedId;
  const resourceType =
    typeof options.resource_type === 'string' ? options.resource_type : 'video';
  const format = resourceType === 'video' ? 'mp4' : 'jpg';

  callback(null, {
    ...defaultUploadResult,
    public_id: publicId,
    resource_type: resourceType,
    secure_url: `${cloudinaryBaseUrl}/${resourceType}/upload/${publicId}.${format}`,
  });
  return fakeUploadStream;
}

function fakeUrl(
  publicId: string,
  options: { resource_type?: string; format?: string } = {},
): string {
  const resourceType = options.resource_type ?? 'image';
  const format = options.format ?? 'jpg';
  return `${cloudinaryBaseUrl}/${resourceType}/upload/${publicId}.${format}`;
}

export const v2 = {
  config: jest.fn(),
  uploader: {
    upload_stream: jest.fn(fakeSuccessfulUpload),
    destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
  },
  url: jest.fn(fakeUrl),
};

/** Reset SDK mocks between tests while restoring deterministic success defaults. */
export function resetCloudinaryMock(): void {
  v2.config.mockReset();
  v2.uploader.upload_stream
    .mockReset()
    .mockImplementation(fakeSuccessfulUpload);
  v2.uploader.destroy.mockReset().mockResolvedValue({ result: 'ok' });
  v2.url.mockReset().mockImplementation(fakeUrl);
}

/** Configure the next upload_stream callback to simulate an SDK failure. */
export function failNextCloudinaryUpload(error: Error): void {
  v2.uploader.upload_stream.mockImplementationOnce((_options, callback) => {
    callback(error, null);
    return fakeUploadStream;
  });
}

export default { v2 };
