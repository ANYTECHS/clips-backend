import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs/promises';
import { Readable } from 'stream';
import * as streamifier from 'streamifier';

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

/**
 * Handles uploads, deletions, and reads for Cloudinary-hosted video assets.
 * 
 * Issue #727: Enhanced to upload clips from buffer after FFmpeg cut,
 * generate auto-thumbnails, and handle upload errors with retry logic.
 */
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
   * Issue #727: Enhanced to generate auto-thumbnail at time=0.5
   * and return both video URL and thumbnail URL.
   *
   * @param buffer    Video data buffer from FFmpeg output
   * @param publicId  Cloudinary public ID for the video
   * @param options   Upload options including folder and resource type
   * @param retryAttempt Current retry attempt (for logging)
   */
  async uploadVideoFromBuffer(
    buffer: Buffer,
    publicId: string,
    options?: {
      folder?: string;
      resourceType?: 'video' | 'image' | 'raw' | 'auto';
      autoTagging?: number;
    },
    retryAttempt = 1,
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve) => {
      const folder = options?.folder ?? 'clips';
      const resourceType = options?.resourceType ?? 'video';

      this.logger.log(
        `Uploading to Cloudinary (attempt ${retryAttempt}): ${publicId} ` +
        `(${Math.round(buffer.length / 1024)}KB to folder: ${folder})`
      );

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder,
          resource_type: resourceType,
          // Auto-generate thumbnail at 0.5 seconds for videos
          ...(resourceType === 'video' && {
            eager: [
              { 
                width: 400, 
                height: 300, 
                crop: 'pad',
                start_offset: 0.5,
                format: 'jpg'
              }
            ]
          }),
          ...(options?.autoTagging ? { auto_tagging: options.autoTagging } : {}),
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error(
              `Cloudinary upload failed for ${publicId} (attempt ${retryAttempt}): ${
                error?.message ?? 'no result'
              }`,
            );
            resolve({
              secure_url: '',
              public_id: publicId,
              error: error?.message ?? 'Upload failed - no result returned',
            });
            return;
          }

          // Generate thumbnail URL from the video at 0.5s
          const thumbnailUrl = cloudinary.url(result.public_id, {
            resource_type: 'video',
            format: 'jpg',
            transformation: [
              { start_offset: '0.5' },
              { width: 400, height: 300, crop: 'pad' }
            ],
          });

          this.logger.log(
            `Cloudinary upload successful (attempt ${retryAttempt}): ${publicId} → ${result.secure_url}`
          );

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

      // Use streamifier to create readable stream from buffer
      // This is the recommended approach as mentioned in the technical hints
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  /**
   * Delete a clip from Cloudinary by public ID.
   */
  async deleteClip(publicId: string): Promise<void> {
    try {
      const result = await cloudinary.uploader.destroy(publicId, { 
        resource_type: 'video' 
      });
      this.logger.log(`Deleted Cloudinary asset: ${publicId} (result: ${result.result})`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to delete Cloudinary asset ${publicId}: ${errorMsg}`);
      throw error; // Re-throw so caller can handle
    }
  }

  /**
   * Read a local file into a Buffer.
   * Used by the clip processor to load FFmpeg output for Cloudinary upload.
   */
  async readFileToBuffer(filePath: string): Promise<Buffer> {
    try {
      const buffer = await fs.readFile(filePath);
      this.logger.log(`Read file to buffer: ${filePath} (${Math.round(buffer.length / 1024)}KB)`);
      return buffer;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to read file to buffer: ${filePath} - ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Delete a local file, used for cleanup after successful Cloudinary upload.
   * Ignores errors if file doesn't exist (idempotent operation).
   */
  async deleteLocalFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.log(`Deleted local file: ${filePath}`);
    } catch (error) {
      // File may already be gone or never existed - this is fine
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Could not delete local file ${filePath}: ${errorMsg}`);
    }
  }

  /**
   * Generate a thumbnail URL for an existing Cloudinary video.
   * Used as fallback if the eager transformation didn't work.
   */
  generateThumbnailUrl(publicId: string, timeOffset = 0.5): string {
    return cloudinary.url(publicId, {
      resource_type: 'video',
      format: 'jpg',
      transformation: [
        { start_offset: timeOffset.toString() },
        { width: 400, height: 300, crop: 'pad' }
      ],
    });
  }
}
