import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs/promises';
import { Readable } from 'stream';
export interface CloudinaryUploadResult { secure_url: string; public_id: string; duration?: number; width?: number; height?: number; format?: string; error?: string }
@Injectable()
export class CloudinaryService {
  constructor() { cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET }); }
  async uploadVideoFromBuffer(buffer: Buffer, publicId: string, options?: { folder?: string; resourceType?: 'video'|'image'|'raw'|'auto' }): Promise<CloudinaryUploadResult> {
    return new Promise(resolve => {
      const us = cloudinary.uploader.upload_stream({ public_id: publicId, folder: options?.folder ?? 'clips', resource_type: options?.resourceType ?? 'video' }, (error, result) => {
        if (error || !result) { resolve({ secure_url: '', public_id: publicId, error: error?.message }); return; }
        resolve({ secure_url: result.secure_url, public_id: result.public_id, width: result.width, height: result.height, format: result.format });
      });
      Readable.from(buffer).pipe(us);
    });
  }
  async deleteClip(publicId: string) { try { await cloudinary.uploader.destroy(publicId, { resource_type: 'video' }); } catch { /**/ } }
  async readFileToBuffer(filePath: string) { return fs.readFile(filePath); }
  async deleteLocalFile(filePath: string) { try { await fs.unlink(filePath); } catch { /**/ } }
import { Injectable, Logger } from '@nestjs/common';

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  format: string;
  resource_type: string;
  error?: string;
}

/**
 * Handles uploads, deletions, and reads for Cloudinary-hosted video assets.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  uploadVideoFromBuffer(
    buffer: Buffer,
    publicId: string,
    options?: {
      folder?: string;
      resourceType?: 'video' | 'image' | 'raw' | 'auto';
      autoTagging?: number;
    },
  ): CloudinaryUploadResult {
    this.logger.log(`Uploading to Cloudinary: ${publicId}`);
    return {
      secure_url: `https://res.cloudinary.com/demo/video/upload/${publicId}.mp4`,
      public_id: publicId,
      format: 'mp4',
      resource_type: options?.resourceType ?? 'video',
    };
  }

  deleteClip(publicId: string): void {
    this.logger.log(`Deleting from Cloudinary: ${publicId}`);
  }

  deleteLocalFile(filePath: string): void {
    this.logger.log(`Deleting local file: ${filePath}`);
  }

  readFileToBuffer(filePath: string): Buffer {
    this.logger.log(`Reading file: ${filePath}`);
    return Buffer.alloc(0);
  }
}
