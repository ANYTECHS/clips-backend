import { Injectable, Logger } from '@nestjs/common';
import { CloudinaryService } from '../clips/cloudinary.service';
import * as ffmpeg from '../clips/ffmpeg.util';

/**
 * Centralized video processing utilities service.
 * 
 * Consolidates common FFmpeg and Cloudinary operations to eliminate duplicate logic
 * across clips and videos modules (Issue #324).
 * 
 * @example
 * // Cut a video segment
 * const outputPath = await videoProcessingService.cutVideoSegment({
 *   inputPath: '/tmp/video.mp4',
 *   outputPath: '/tmp/clip.mp4',
 *   startTime: 10.5,
 *   endTime: 25.8
 * });
 * 
 * @example
 * // Upload processed clip to Cloudinary
 * const result = await videoProcessingService.uploadVideoToCloud(
 *   buffer,
 *   'clip-123',
 *   { folder: 'clips' }
 * );
 */
@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  constructor(private readonly cloudinaryService: CloudinaryService) {}

  /**
   * Extract metadata from a video file using FFprobe.
   * 
   * @param inputPath - Path to the video file
   * @returns Video metadata including duration, resolution, and format
   * 
   * @example
   * const metadata = await videoProcessingService.getVideoMetadata('/tmp/video.mp4');
   * console.log(`Duration: ${metadata.duration}s, Resolution: ${metadata.resolution}`);
   */
  async getVideoMetadata(inputPath: string): Promise<ffmpeg.VideoMetadata> {
    this.logger.log(`Extracting metadata from: ${inputPath}`);
    try {
      const metadata = await ffmpeg.getVideoMetadata(inputPath);
      this.logger.log(
        `Metadata extracted: ${metadata.duration}s, ${metadata.resolution}, ${metadata.format}`,
      );
      return metadata;
    } catch (error) {
      this.logger.error(`Failed to extract metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cut a segment from a video file using FFmpeg.
   * 
   * Handles float precision issues and automatically clamps times to valid ranges.
   * 
   * @param options - Cut options including input/output paths and time range
   * @returns Path to the output clip file
   * 
   * @example
   * const clipPath = await videoProcessingService.cutVideoSegment({
   *   inputPath: '/tmp/source.mp4',
   *   outputPath: '/tmp/clip.mp4',
   *   startTime: 12.5,
   *   endTime: 42.3,
   *   videoDuration: 120.0
   * });
   */
  async cutVideoSegment(
    options: ffmpeg.CutClipOptions,
  ): Promise<string> {
    const { inputPath, outputPath, startTime, endTime } = options;
    this.logger.log(
      `Cutting video segment: ${inputPath} [${startTime}s - ${endTime}s] -> ${outputPath}`,
    );

    try {
      const result = await ffmpeg.cutClip(options);
      this.logger.log(`Video segment cut successfully: ${outputPath}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to cut video segment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upload a video file to Cloudinary from a buffer.
   * 
   * Automatically handles retries, circuit breaking, and thumbnail generation.
   * 
   * @param buffer - Video file buffer
   * @param publicId - Cloudinary public ID for the video
   * @param options - Upload options (folder, resource type, etc.)
   * @returns Upload result with secure URL and thumbnail URL
   * 
   * @example
   * const buffer = await fs.promises.readFile('/tmp/clip.mp4');
   * const result = await videoProcessingService.uploadVideoToCloud(
   *   buffer,
   *   'user-123-clip-456',
   *   { folder: 'clips', autoTagging: 0.6 }
   * );
   * console.log(`Uploaded: ${result.secure_url}`);
   */
  async uploadVideoToCloud(
    buffer: Buffer,
    publicId: string,
    options?: {
      folder?: string;
      resourceType?: 'video' | 'image' | 'raw' | 'auto';
      autoTagging?: number;
    },
  ) {
    this.logger.log(`Uploading video to Cloudinary: ${publicId}`);
    try {
      const result = await this.cloudinaryService.uploadVideoFromBuffer(
        buffer,
        publicId,
        options,
      );

      if (result.error) {
        this.logger.error(`Cloudinary upload failed: ${result.error}`);
        throw new Error(result.error);
      }

      this.logger.log(`Video uploaded successfully: ${result.secure_url}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to upload video: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a video from Cloudinary by public ID.
   * 
   * @param publicId - Cloudinary public ID of the video to delete
   * 
   * @example
   * await videoProcessingService.deleteVideoFromCloud('clip-123');
   */
  async deleteVideoFromCloud(publicId: string): Promise<void> {
    this.logger.log(`Deleting video from Cloudinary: ${publicId}`);
    try {
      await this.cloudinaryService.deleteClip(publicId);
      this.logger.log(`Video deleted successfully: ${publicId}`);
    } catch (error) {
      this.logger.error(`Failed to delete video: ${error.message}`);
      throw error;
    }
  }

  /**
   * Read a local video file into a buffer.
   * 
   * @param filePath - Path to the local video file
   * @returns Buffer containing the video file data
   * 
   * @example
   * const buffer = await videoProcessingService.readFileToBuffer('/tmp/video.mp4');
   * await videoProcessingService.uploadVideoToCloud(buffer, 'video-123');
   */
  async readFileToBuffer(filePath: string): Promise<Buffer> {
    this.logger.log(`Reading file to buffer: ${filePath}`);
    try {
      const buffer = await this.cloudinaryService.readFileToBuffer(filePath);
      this.logger.log(`File read successfully: ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      this.logger.error(`Failed to read file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a local temporary file.
   * 
   * Safe to call even if the file doesn't exist (logs warning instead of throwing).
   * 
   * @param filePath - Path to the file to delete
   * 
   * @example
   * await videoProcessingService.deleteLocalFile('/tmp/clip.mp4');
   */
  async deleteLocalFile(filePath: string): Promise<void> {
    this.logger.log(`Deleting local file: ${filePath}`);
    try {
      await this.cloudinaryService.deleteLocalFile(filePath);
      this.logger.log(`Local file deleted: ${filePath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete local file: ${error.message}`);
    }
  }

  /**
   * Process a video clip end-to-end: cut segment + upload to cloud + cleanup.
   * 
   * This is a convenience method that combines common operations.
   * 
   * @param inputPath - Source video path
   * @param outputPath - Temporary output path for the cut segment
   * @param startTime - Start time in seconds
   * @param endTime - End time in seconds
   * @param publicId - Cloudinary public ID for the uploaded clip
   * @param options - Upload options
   * @returns Cloudinary upload result
   * 
   * @example
   * const result = await videoProcessingService.processAndUploadClip(
   *   '/tmp/source.mp4',
   *   '/tmp/clip.mp4',
   *   10.5,
   *   30.2,
   *   'user-123-clip-456',
   *   { folder: 'clips' }
   * );
   * console.log(`Clip URL: ${result.secure_url}`);
   */
  async processAndUploadClip(
    inputPath: string,
    outputPath: string,
    startTime: number,
    endTime: number,
    publicId: string,
    uploadOptions?: {
      folder?: string;
      resourceType?: 'video' | 'image' | 'raw' | 'auto';
      autoTagging?: number;
    },
  ) {
    this.logger.log(`Processing and uploading clip: ${publicId}`);

    try {
      // Step 1: Get video metadata for duration validation
      const metadata = await this.getVideoMetadata(inputPath);

      // Step 2: Cut the video segment
      await this.cutVideoSegment({
        inputPath,
        outputPath,
        startTime,
        endTime,
        videoDuration: metadata.duration,
      });

      // Step 3: Read the cut segment into a buffer
      const buffer = await this.readFileToBuffer(outputPath);

      // Step 4: Upload to Cloudinary
      const uploadResult = await this.uploadVideoToCloud(
        buffer,
        publicId,
        uploadOptions,
      );

      // Step 5: Clean up temporary file
      await this.deleteLocalFile(outputPath);

      this.logger.log(`Clip processed and uploaded successfully: ${publicId}`);
      return uploadResult;
    } catch (error) {
      this.logger.error(`Failed to process and upload clip: ${error.message}`);
      // Clean up on error
      await this.deleteLocalFile(outputPath);
      throw error;
    }
  }

  /**
   * Validate video file metadata against requirements.
   * 
   * @param metadata - Video metadata from getVideoMetadata
   * @param requirements - Validation requirements
   * @returns Validation result with any error messages
   * 
   * @example
   * const metadata = await videoProcessingService.getVideoMetadata('/tmp/video.mp4');
   * const validation = videoProcessingService.validateVideoMetadata(metadata, {
   *   maxDuration: 3600,
   *   minDuration: 10,
   *   minWidth: 640,
   *   minHeight: 480
   * });
   * 
   * if (!validation.valid) {
   *   console.error('Invalid video:', validation.errors);
   * }
   */
  validateVideoMetadata(
    metadata: ffmpeg.VideoMetadata,
    requirements: {
      maxDuration?: number;
      minDuration?: number;
      minWidth?: number;
      minHeight?: number;
      allowedFormats?: string[];
    } = {},
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (requirements.maxDuration && metadata.duration > requirements.maxDuration) {
      errors.push(
        `Video duration ${metadata.duration}s exceeds maximum ${requirements.maxDuration}s`,
      );
    }

    if (requirements.minDuration && metadata.duration < requirements.minDuration) {
      errors.push(
        `Video duration ${metadata.duration}s is below minimum ${requirements.minDuration}s`,
      );
    }

    if (requirements.minWidth && metadata.width < requirements.minWidth) {
      errors.push(
        `Video width ${metadata.width}px is below minimum ${requirements.minWidth}px`,
      );
    }

    if (requirements.minHeight && metadata.height < requirements.minHeight) {
      errors.push(
        `Video height ${metadata.height}px is below minimum ${requirements.minHeight}px`,
      );
    }

    if (
      requirements.allowedFormats &&
      !requirements.allowedFormats.some((fmt) =>
        metadata.format.toLowerCase().includes(fmt.toLowerCase()),
      )
    ) {
      errors.push(
        `Video format ${metadata.format} is not in allowed formats: ${requirements.allowedFormats.join(', ')}`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
