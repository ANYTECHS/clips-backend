import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';
import * as fs from 'fs/promises';

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  thumbnail_url?: string;
  duration?: number;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
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
   * Upload a video buffer to Cloudinary.
   */
  uploadVideoFromBuffer(
    buffer: Buffer,
    publicId: string,
    options: {
      folder?: string;
      resourceType?: 'video' | 'image' | 'raw' | 'auto';
      autoTagging?: number;
    } = {},
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: options.resourceType ?? 'video',
          folder: options.folder ?? 'clips',
          ...(options.autoTagging !== undefined
            ? { auto_tagging: options.autoTagging }
            : {}),
        },
        (error, result) => {
          if (error) {
            this.logger.error(`Cloudinary upload failed: ${error.message}`);
            resolve({ public_id: publicId, secure_url: '', error: error.message });
            return;
          }
          resolve({
            public_id: result!.public_id,
            secure_url: result!.secure_url,
            thumbnail_url: result!.secure_url.replace('/upload/', '/upload/f_auto,q_auto/'),
            duration: result!.duration,
            width: result!.width,
            height: result!.height,
            format: result!.format,
            bytes: result!.bytes,
          });
        },
      );

      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  /**
   * Delete a clip from Cloudinary by its public ID.
   */
  async deleteClip(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      this.logger.log(`Cloudinary asset deleted: ${publicId}`);
    } catch (err) {
      this.logger.error(`Failed to delete Cloudinary asset ${publicId}: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Read a local file into a Buffer.
   */
  async readFileToBuffer(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  /**
   * Delete a local temporary file, logging a warning on failure.
   */
  async deleteLocalFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      this.logger.warn(`Could not delete local file ${filePath}: ${(err as Error).message}`);
    }
  }
}
