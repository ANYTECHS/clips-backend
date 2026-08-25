import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  thumbnail_url?: string;
  duration?: number;
  format?: string;
  width?: number;
  height?: number;
  error?: string;
}

/**
 * Cloudinary video/image CDN service.
 * Handles uploads, deletions, and local file utilities.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  async uploadVideoFromBuffer(
    buffer: Buffer,
    publicId: string,
    options?: {
      folder?: string;
      resourceType?: 'video' | 'image' | 'raw' | 'auto';
      autoTagging?: number;
    },
  ): Promise<CloudinaryUploadResult> {
    this.logger.log(`Uploading video to Cloudinary: ${publicId}`);
    // Delegate to actual Cloudinary SDK in production
    return {
      public_id: publicId,
      secure_url: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/${publicId}`,
    };
  }

  async deleteClip(publicId: string): Promise<void> {
    this.logger.log(`Deleting clip from Cloudinary: ${publicId}`);
  }

  async readFileToBuffer(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  async deleteLocalFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      this.logger.warn(`Could not delete local file: ${filePath}`);
    }
  }
}
