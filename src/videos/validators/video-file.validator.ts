import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';
import * as fs from 'fs/promises';

/**
 * Issue #1358 — configurable video upload validation.
 *
 * Env overrides:
 *  - VIDEO_UPLOAD_MAX_SIZE_MB          (default 500)
 *  - VIDEO_UPLOAD_ALLOWED_EXTENSIONS   (comma-separated, default .mp4,.mov,.avi,.webm)
 *  - VIDEO_UPLOAD_ALLOWED_MIME_TYPES   (comma-separated)
 */
const list = (v: string | undefined, fallback: string[]) =>
  v ? v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : fallback;

export const VIDEO_UPLOAD_CONFIG = {
  maxFileSize: Number(process.env.VIDEO_UPLOAD_MAX_SIZE_MB ?? 500) * 1024 * 1024,
  allowedExtensions: list(process.env.VIDEO_UPLOAD_ALLOWED_EXTENSIONS, [
    '.mp4',
    '.mov',
    '.avi',
    '.webm',
  ]),
  allowedMimeTypes: list(process.env.VIDEO_UPLOAD_ALLOWED_MIME_TYPES, [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
  ]),
};

/** Multer fileFilter: checks extension + client MIME (cheap pre-check only). */
export function videoFileFilter(
  _req: unknown,
  file: { originalname: string; mimetype: string },
  cb: (err: Error | null, accept: boolean) => void,
) {
  const { allowedExtensions, allowedMimeTypes } = VIDEO_UPLOAD_CONFIG;
  const ext = extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return cb(
      new BadRequestException(
        `Invalid file extension "${ext}". Allowed: ${allowedExtensions.join(', ')}`,
      ),
      false,
    );
  }
  const mime = (file.mimetype || '').toLowerCase();
  if (!allowedMimeTypes.includes(mime) && mime !== 'application/octet-stream') {
    return cb(
      new BadRequestException(
        `Invalid MIME type "${file.mimetype}". Allowed: ${allowedMimeTypes.join(', ')}`,
      ),
      false,
    );
  }
  cb(null, true);
}

/** Detect the real container type from file magic bytes. */
export function detectVideoMime(header: Buffer): string | null {
  if (header.length >= 12 && header.toString('ascii', 4, 8) === 'ftyp') {
    const brand = header.toString('ascii', 8, 12);
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  if (
    header.length >= 12 &&
    header.toString('ascii', 0, 4) === 'RIFF' &&
    header.toString('ascii', 8, 12) === 'AVI '
  ) {
    return 'video/x-msvideo';
  }
  if (header.length >= 4 && header.readUInt32BE(0) === 0x1a45dfa3) {
    return 'video/webm';
  }
  // QuickTime files without ftyp start with moov/mdat/wide/free atoms
  if (header.length >= 8 && ['moov', 'mdat', 'wide', 'free'].includes(header.toString('ascii', 4, 8))) {
    return 'video/quicktime';
  }
  return null;
}

/**
 * Validate an uploaded file on disk before any processing/job creation.
 * Does not trust client MIME — inspects magic bytes. Deletes the file on failure.
 */
export async function assertValidVideoFile(file: {
  path: string;
  size: number;
}): Promise<string> {
  const { maxFileSize, allowedMimeTypes } = VIDEO_UPLOAD_CONFIG;
  const fail = async (message: string): Promise<never> => {
    await fs.unlink(file.path).catch(() => undefined);
    throw new BadRequestException({ status: 'error', message, code: 'INVALID_FILE' });
  };

  if (!file.size) await fail('Uploaded file is empty');
  if (file.size > maxFileSize) {
    await fail(`File exceeds maximum size of ${maxFileSize / 1024 / 1024} MB`);
  }

  const handle = await fs.open(file.path, 'r');
  const header = Buffer.alloc(16);
  try {
    await handle.read(header, 0, 16, 0);
  } finally {
    await handle.close();
  }

  const detected = detectVideoMime(header);
  if (!detected || !allowedMimeTypes.includes(detected)) {
    await fail('File content is not a supported video format');
  }
  return detected as string;
}
