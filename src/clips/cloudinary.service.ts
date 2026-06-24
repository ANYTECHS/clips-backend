import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';
import * as fs from 'fs';
import { CircuitBreakerService, CircuitBreakerConfig } from '../common/circuit-breaker/circuit-breaker.service';
import { ServiceUnavailableException } from '../common/exceptions/service-unavailable.exception';

export interface CloudinaryUploadResult {
  secure_url: string;
  thumbnail_url?: string;
  public_id: string;
  error?: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  private readonly circuitBreakerConfig: CircuitBreakerConfig = {
    name: 'cloudinary-upload',
    failureThreshold: 3,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  private readonly deleteCircuitBreakerConfig: CircuitBreakerConfig = {
    name: 'cloudinary-delete',
    failureThreshold: 3,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(private readonly circuitBreakerService: CircuitBreakerService) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadVideoFromBuffer(
    buffer: Buffer,
    publicId: string,
    options: {
      folder?: string;
      resourceType?: 'video' | 'image' | 'raw' | 'auto';
      autoTagging?: number;
    } = {},
    _retries: number = 2,
  ): Promise<CloudinaryUploadResult> {
    try {
      this.logger.log(`Starting Cloudinary upload for ${publicId}`);

      const result = await this.circuitBreakerService.execute(
        this.circuitBreakerConfig,
        () => this.performUpload(buffer, publicId, options),
      );

      this.logger.log(`Clip uploaded successfully: ${publicId} (${result.secure_url})`);
      return result;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Cloudinary upload failed for ${publicId}: ${errorMessage}`);
      return { secure_url: '', public_id: publicId, error: errorMessage };
    }
  }

  private async performUpload(
    buffer: Buffer,
    publicId: string,
    options: {
      folder?: string;
      resourceType?: 'video' | 'image' | 'raw' | 'auto';
      autoTagging?: number;
    },
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      const { folder = 'clips', resourceType = 'video', autoTagging = 0.6 } = options;

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder,
          resource_type: resourceType as any,
          auto_tagging: autoTagging,
          eager: [{ streaming_profile: 'hd', format: 'mp4' }],
        },
        (error: any, result: any) => {
          if (error) {
            reject(new Error(error.message));
          } else if (result) {
            resolve({
              secure_url: result.secure_url,
              public_id: result.public_id,
              thumbnail_url: this.generateThumbnailUrl(result.public_id, result.resource_type),
            });
          } else {
            reject(new Error('Unknown error'));
          }
        },
      );

      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  private generateThumbnailUrl(publicId: string, resourceType: string, timeRatio = 0.5): string {
    if (resourceType !== 'video') return '';
    return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/so_${Math.round(timeRatio * 100)}p/${publicId}.jpg`;
  }

  async deleteClip(publicId: string): Promise<void> {
    try {
      await this.circuitBreakerService.execute(
        this.deleteCircuitBreakerConfig,
        async () => {
          await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
          return { success: true };
        },
      );
      this.logger.log(`Clip deleted from Cloudinary: ${publicId}`);
    } catch (error) {
      if (error.name === 'ServiceUnavailableException') throw error;
      this.logger.error(`Failed to delete clip ${publicId}: ${error.message}`);
    }
  }

  async deleteLocalFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Local file deleted: ${filePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete local file ${filePath}: ${error.message}`);
    }
  }

  async readFileToBuffer(filePath: string): Promise<Buffer> {
    return fs.promises.readFile(filePath);
  }
}
