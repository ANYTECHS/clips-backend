import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs/promises';
import { Readable } from 'stream';

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  duration?: number;
  width?: number;
  height?: number;
  format?: string;
  thumbnail_url?: string;
  error?: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadVideoFromBuffer(
    buffer: Buffer,
    publicId: string,
    options?: { folder?: string; resourceType?: 'video' | 'image' | 'raw' | 'auto'; autoTagging?: number },
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: publicId, folder: options?.folder ?? 'clips', resource_type: options?.resourceType ?? 'video' },
        (error, result) => {
          if (error || !result) {
            resolve({ secure_url: '', public_id: publicId, error: error?.message ?? 'Upload failed' });
            return;
          }
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
            duration: (result as any).duration,
            width: result.width,
            height: result.height,
            format: result.format,
          });
        },
      );
      Readable.from(buffer).pipe(uploadStream);
    });
  }

  async deleteClip(publicId: string): Promise<void> {
    try { await cloudinary.uploader.destroy(publicId, { resource_type: 'video' }); } catch { /* ignore */ }
  }

  async readFileToBuffer(filePath: string): Promise<Buffer> { return fs.readFile(filePath); }

  async deleteLocalFile(filePath: string): Promise<void> {
    try { await fs.unlink(filePath); } catch { /* ignore */ }
  }
}
