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

  /**
   * Upload a video from a buffer to Cloudinary.
   *
   * @param buffer    Video data buffer
   * @param publicId  Cloudinary public ID
   * @param options   Upload options
   */
  async uploadVideoFromBuffer(
    buffer: Buffer,
    publicId: string,
    options?: {
      folder?: string;
      resourceType?: 'video' | 'image' | 'raw' | 'auto';
      autoTagging?: number;
    },
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve) => {
      const folder = options?.folder ?? 'clips';
      const resourceType = options?.resourceType ?? 'video';

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder,
          resource_type: resourceType,
          ...(options?.autoTagging ? { auto_tagging: options.autoTagging } : {}),
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error(
              `Cloudinary upload failed for ${publicId}: ${error?.message ?? 'no result'}`,
            );
            resolve({
              secure_url: '',
              public_id: publicId,
              error: error?.message ?? 'Upload failed',
            });
            return;
          }

          const thumbnailUrl = cloudinary.url(result.public_id, {
            resource_type: 'video',
            format: 'jpg',
            transformation: [{ start_offset: '0' }],
          });

          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
            duration: (result as any).duration,
            width: result.width,
            height: result.height,
            format: result.format,
            thumbnail_url: thumbnailUrl,
          });
        },
      );

      const readable = Readable.from(buffer);
      readable.pipe(uploadStream);
    });
  }

  /**
   * Delete a clip from Cloudinary by public ID.
   */
  async deleteClip(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      this.logger.log(`Deleted Cloudinary asset: ${publicId}`);
    } catch (error) {
      this.logger.warn(`Failed to delete Cloudinary asset ${publicId}: ${error.message}`);
    }
  }

  /**
   * Read a local file into a Buffer.
   */
  async readFileToBuffer(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  /**
   * Delete a local file, ignoring errors if it does not exist.
   */
  async deleteLocalFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // File may already be gone — ignore
    }
  }
}
