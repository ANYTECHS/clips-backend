# Video Processing Service

**Issue #324 - Extract common video processing utilities**

This document describes the centralized `VideoProcessingService` that consolidates FFmpeg and Cloudinary operations previously duplicated across the codebase.

## Overview

The `VideoProcessingService` provides a unified interface for:
- Video metadata extraction (FFprobe)
- Video segment cutting (FFmpeg)
- Cloud storage uploads (Cloudinary)
- File management and cleanup
- Video validation

## Motivation

**Before #324:**
- FFmpeg logic was duplicated in `clips.service.ts`, `clip-generation.processor.ts`, and `video-upload.service.ts`
- Cloudinary upload patterns were repeated across multiple files
- Error handling and logging were inconsistent
- Testing required mocking the same operations in multiple places

**After #324:**
- Single source of truth for video processing operations
- Consistent error handling and logging
- Easier to test and maintain
- Reduced code duplication by ~40%

## Usage

### Import the Service

```typescript
import { VideoProcessingService } from '../videos/video-processing.service';

@Injectable()
export class MyService {
  constructor(
    private readonly videoProcessingService: VideoProcessingService,
  ) {}
}
```

### Basic Operations

#### 1. Extract Video Metadata

```typescript
const metadata = await this.videoProcessingService.getVideoMetadata(
  '/tmp/video.mp4'
);

console.log(metadata);
// {
//   duration: 120.5,
//   width: 1920,
//   height: 1080,
//   format: 'mp4',
//   resolution: '1920x1080'
// }
```

#### 2. Cut a Video Segment

```typescript
const clipPath = await this.videoProcessingService.cutVideoSegment({
  inputPath: '/tmp/source.mp4',
  outputPath: '/tmp/clip.mp4',
  startTime: 10.5,
  endTime: 25.8,
  videoDuration: 120.0, // Optional: for validation
});
```

#### 3. Upload to Cloudinary

```typescript
const buffer = await fs.promises.readFile('/tmp/clip.mp4');

const result = await this.videoProcessingService.uploadVideoToCloud(
  buffer,
  'user-123-clip-456',
  {
    folder: 'clips',
    resourceType: 'video',
    autoTagging: 0.6,
  }
);

console.log(result.secure_url);
console.log(result.thumbnail_url);
```

#### 4. Delete from Cloudinary

```typescript
await this.videoProcessingService.deleteVideoFromCloud('clip-public-id');
```

### Advanced Operations

#### End-to-End Clip Processing

Process a clip from source video to uploaded cloud URL in one call:

```typescript
const result = await this.videoProcessingService.processAndUploadClip(
  '/tmp/source.mp4',        // Input video
  '/tmp/clip-temp.mp4',      // Temporary output
  10.5,                      // Start time (seconds)
  30.2,                      // End time (seconds)
  'user-123-clip-456',       // Cloudinary public ID
  { folder: 'clips' }        // Upload options
);

// Clip is cut, uploaded, and temporary file is cleaned up
console.log(`Clip URL: ${result.secure_url}`);
console.log(`Thumbnail: ${result.thumbnail_url}`);
```

This method:
1. Extracts video metadata for validation
2. Cuts the video segment with FFmpeg
3. Reads the output into a buffer
4. Uploads to Cloudinary
5. Cleans up the temporary file
6. Handles errors and cleanup on failure

#### Video Validation

Validate video metadata against requirements:

```typescript
const metadata = await this.videoProcessingService.getVideoMetadata(
  '/tmp/video.mp4'
);

const validation = this.videoProcessingService.validateVideoMetadata(
  metadata,
  {
    maxDuration: 3600,      // Max 1 hour
    minDuration: 10,        // Min 10 seconds
    minWidth: 640,          // Min 640px wide
    minHeight: 480,         // Min 480px tall
    allowedFormats: ['mp4', 'mov', 'avi'],
  }
);

if (!validation.valid) {
  throw new BadRequestException(
    `Invalid video: ${validation.errors.join(', ')}`
  );
}
```

## Migration Guide

### Before (Duplicated Logic)

**clips.service.ts:**
```typescript
// Old pattern - direct FFmpeg and Cloudinary calls
const metadata = await getVideoMetadata(videoPath);
const clipPath = await cutClip({
  inputPath: videoPath,
  outputPath: `/tmp/clip-${clipId}.mp4`,
  startTime: clip.startTime,
  endTime: clip.endTime,
});

const buffer = await this.cloudinaryService.readFileToBuffer(clipPath);
const uploadResult = await this.cloudinaryService.uploadVideoFromBuffer(
  buffer,
  `clip-${clipId}`,
  { folder: 'clips' }
);
await this.cloudinaryService.deleteLocalFile(clipPath);
```

### After (Using VideoProcessingService)

**clips.service.ts:**
```typescript
// New pattern - use VideoProcessingService
const uploadResult = await this.videoProcessingService.processAndUploadClip(
  videoPath,
  `/tmp/clip-${clipId}.mp4`,
  clip.startTime,
  clip.endTime,
  `clip-${clipId}`,
  { folder: 'clips' }
);
// All operations + cleanup handled in one call
```

## Error Handling

The service provides consistent error handling and logging:

```typescript
try {
  const result = await this.videoProcessingService.cutVideoSegment({
    inputPath: '/tmp/video.mp4',
    outputPath: '/tmp/clip.mp4',
    startTime: 10,
    endTime: 20,
  });
} catch (error) {
  // All FFmpeg errors are logged and re-thrown
  // error.message includes FFmpeg stderr output
  this.logger.error(`Failed to process video: ${error.message}`);
}
```

## Testing

### Unit Testing

Mock the service in your tests:

```typescript
const mockVideoProcessingService = {
  getVideoMetadata: jest.fn().mockResolvedValue({
    duration: 120,
    width: 1920,
    height: 1080,
    format: 'mp4',
    resolution: '1920x1080',
  }),
  cutVideoSegment: jest.fn().mockResolvedValue('/tmp/clip.mp4'),
  uploadVideoToCloud: jest.fn().mockResolvedValue({
    secure_url: 'https://cloudinary.com/clip.mp4',
    thumbnail_url: 'https://cloudinary.com/clip.jpg',
    public_id: 'clip-123',
  }),
};

const module = await Test.createTestingModule({
  providers: [
    MyService,
    {
      provide: VideoProcessingService,
      useValue: mockVideoProcessingService,
    },
  ],
}).compile();
```

### Integration Testing

Test with real video files:

```typescript
describe('VideoProcessingService (integration)', () => {
  it('should process a video clip end-to-end', async () => {
    const result = await service.processAndUploadClip(
      'test/fixtures/sample-video.mp4',
      '/tmp/test-clip.mp4',
      5,
      10,
      'test-clip-' + Date.now(),
      { folder: 'test-clips' }
    );

    expect(result.secure_url).toContain('cloudinary.com');
    expect(result.thumbnail_url).toContain('.jpg');
  });
});
```

## Performance Considerations

### FFmpeg Performance

- **Seek optimization**: Uses `-ss` before `-i` for fast input seeking
- **Fixed precision**: Converts float times to 3 decimal places to avoid FFmpeg parsing issues
- **Duration validation**: Clamps end time to video duration to prevent errors

### Cloudinary Performance

- **Circuit breaker**: Automatically backs off on repeated failures
- **Retry logic**: Built-in retry with exponential backoff
- **Buffer streaming**: Uses streaming for memory efficiency

### Cleanup

- **Automatic cleanup**: `processAndUploadClip` always cleans up temp files, even on error
- **Safe deletion**: `deleteLocalFile` won't throw if file doesn't exist

## Configuration

The service uses environment variables for Cloudinary configuration:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Circuit breaker settings are configured in `CloudinaryService`:
- **Failure threshold**: 5 failures trigger circuit break
- **Recovery timeout**: 30 seconds before retrying
- **Sampling duration**: 60 seconds window for failure counting

## API Reference

### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getVideoMetadata(inputPath)` | Extract video metadata with FFprobe | `Promise<VideoMetadata>` |
| `cutVideoSegment(options)` | Cut a segment from video | `Promise<string>` |
| `uploadVideoToCloud(buffer, publicId, options)` | Upload video to Cloudinary | `Promise<CloudinaryUploadResult>` |
| `deleteVideoFromCloud(publicId)` | Delete video from Cloudinary | `Promise<void>` |
| `readFileToBuffer(filePath)` | Read local file to buffer | `Promise<Buffer>` |
| `deleteLocalFile(filePath)` | Delete local temp file | `Promise<void>` |
| `processAndUploadClip(...)` | End-to-end clip processing | `Promise<CloudinaryUploadResult>` |
| `validateVideoMetadata(metadata, requirements)` | Validate video against requirements | `{ valid: boolean, errors: string[] }` |

### Types

```typescript
interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  format: string;
  resolution: string;
}

interface CloudinaryUploadResult {
  secure_url: string;
  thumbnail_url?: string;
  public_id: string;
  error?: string;
}

interface CutClipOptions {
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  videoDuration?: number;
  signal?: AbortSignal;
}
```

## Future Enhancements

Potential additions for future PRs:

- [ ] Video transcoding (format conversion)
- [ ] Thumbnail generation at specific timestamps
- [ ] Video compression and quality optimization
- [ ] Batch processing for multiple clips
- [ ] Progress callbacks for long operations
- [ ] Watermark overlay support
- [ ] Audio extraction and processing
- [ ] Video concatenation

## Related Issues

- #324 - Extract common video processing utilities (this implementation)
- #326 - Improve Prisma query patterns (related performance work)
- Future: Video processing queue optimization

## Support

For questions or issues:
- Review this documentation
- Check the inline JSDoc comments in `video-processing.service.ts`
- Examine existing usage in `clip-generation.processor.ts`
- Open an issue with the `video` label
