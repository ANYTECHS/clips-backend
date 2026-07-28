# FFmpeg Mock Documentation

This document explains how to use the controlled FFmpeg mock in tests.

## Overview

The FFmpeg mock provides a way to test video processing code without requiring actual FFmpeg binaries or creating real video files. It allows you to:

- ✅ Simulate successful video cuts
- ✅ Simulate failed cuts with realistic error messages
- ✅ Return predictable output
- ✅ Capture FFmpeg logs/stderr
- ✅ Test error handling and retry logic

## Setup

### Automatic Setup (Recommended)

The mock is automatically imported in test files. Just ensure your test file imports the mock:

```typescript
import { 
  mockFFmpegSuccess, 
  mockFFmpegError, 
  cleanupFFmpegMockAfterTest 
} from '../test/helpers/ffmpeg-mock.helper';
```

### Manual Module Mocking

If setting up manually, ensure this is at the top of your test file (before other imports):

```typescript
jest.mock('fluent-ffmpeg', () => require('../__mocks__/fluent-ffmpeg'));
```

## Usage

### Simulating Success

```typescript
it('should cut a clip successfully', async () => {
  mockFFmpegSuccess();
  
  const result = await cutClip({
    inputPath: '/tmp/in.mp4',
    outputPath: '/tmp/out.mp4',
    startTime: 0,
    endTime: 30,
  });
  
  expect(result).toBe('/tmp/out.mp4');
});
```

### Simulating Failures

```typescript
it('should handle FFmpeg OOM error', async () => {
  mockFFmpegOOM();
  
  await expect(cutClip({
    inputPath: '/tmp/in.mp4',
    outputPath: '/tmp/out.mp4',
    startTime: 0,
    endTime: 30,
  })).rejects.toThrow(/memory|OOM/i);
});
```

### Custom Error Messages

```typescript
it('should handle codec unavailable error', async () => {
  mockFFmpegError("Unknown encoder 'libx265'");
  
  await expect(cutClip({...})).rejects.toThrow("libx265");
});
```

## Available Helpers

### `mockFFmpegSuccess(options?)`

Configure mock to succeed.

**Options:**
- `stderrLines?: string[]` - Custom stderr output (default: realistic FFmpeg progress)
- `createOutputFile?: boolean` - Actually write file to disk (default: false)
- `fileContent?: Buffer` - Content for output file (default: 'mock-video-content')

```typescript
mockFFmpegSuccess({
  stderrLines: ['frame=  100 fps= 50 q=-1.0 Lsize=N/A'],
  createOutputFile: false,
});
```

### `mockFFmpegError(message?)`

Configure mock to fail with a custom error.

```typescript
mockFFmpegError('Input/output error on file');
```

### `mockFFmpegOOM()`

Simulate out-of-memory error.

```typescript
mockFFmpegOOM();
// Equivalent to: mockFFmpegError('Cannot allocate memory: Out of memory')
```

### `mockFFmpegTimeout()`

Simulate timeout error.

```typescript
mockFFmpegTimeout();
```

### `mockFFmpegCodecError(codec?)`

Simulate unavailable codec.

```typescript
mockFFmpegCodecError('libx265');
// Or use default: mockFFmpegCodecError();
```

### `mockFFmpegProbeError(message?)`

Simulate ffprobe (metadata extraction) failure.

```typescript
mockFFmpegProbeError('ffprobe: not found');
```

### `cleanupFFmpegMockAfterTest()`

Reset mock to default state. Call in `afterEach()`.

```typescript
afterEach(() => {
  cleanupFFmpegMockAfterTest();
});
```

## Complete Test Example

```typescript
import {
  mockFFmpegSuccess,
  mockFFmpegOOM,
  mockFFmpegTimeout,
  cleanupFFmpegMockAfterTest,
} from '../test/helpers/ffmpeg-mock.helper';

describe('Video Cutting', () => {
  afterEach(() => {
    cleanupFFmpegMockAfterTest();
  });

  it('should cut a video successfully', async () => {
    mockFFmpegSuccess();
    
    const result = await cutClip({
      inputPath: '/path/to/video.mp4',
      outputPath: '/path/to/clip.mp4',
      startTime: 5.5,
      endTime: 15.5,
      videoDuration: 60,
    });
    
    expect(result).toBe('/path/to/clip.mp4');
  });

  it('should retry on OOM error', async () => {
    mockFFmpegOOM();
    
    await expect(cutClip({...})).rejects.toThrow();
  });

  it('should fail after timeout', async () => {
    mockFFmpegTimeout();
    
    await expect(cutClip({...})).rejects.toThrow(/timeout|killed/i);
  });
});
```

## Testing Metadata Extraction

The mock also provides `ffprobe` functionality:

```typescript
it('should extract video metadata', async () => {
  mockFFmpegSuccess();
  
  const metadata = await getVideoMetadata('/path/to/video.mp4');
  
  expect(metadata).toEqual({
    duration: expect.any(Number),
    width: 1920,
    height: 1080,
    format: 'mp4',
    resolution: '1920x1080',
  });
});

it('should handle metadata extraction failure', async () => {
  mockFFmpegProbeError('File not found');
  
  await expect(getVideoMetadata('/path/to/video.mp4')).rejects.toThrow();
});
```

## Acceptance Criteria ✅

This mock implementation satisfies all acceptance criteria:

1. **✅ Mock fluent-ffmpeg**
   - Complete mock implementation at `test/__mocks__/fluent-ffmpeg.ts`
   - Supports all relevant FFmpeg operations (seekInput, duration, output, on, run, kill)
   - Can be configured globally for test suites

2. **✅ Simulate successful and failed cuts**
   - `mockFFmpegSuccess()` for successful scenarios
   - `mockFFmpegError()`, `mockFFmpegOOM()`, `mockFFmpegTimeout()`, etc. for failures
   - Realistic stderr output simulation
   - Proper error propagation to calling code

3. **✅ Return predictable output files**
   - Mock returns expected output paths
   - Optional file creation on disk
   - Controllable file content
   - Consistent behavior across test runs

## Environment Variables

### `MOCK_FFMPEG_DEBUG`

Enable debug logging for mock operations:

```bash
MOCK_FFMPEG_DEBUG=1 npm test
```

## Integration with Existing Tests

The mock works seamlessly with existing test infrastructure:

- `FakePrisma` in E2E tests
- `CircuitBreakerService` mocks
- BullMQ queue mocks
- Cloudinary upload mocks

## Tips for Testing

1. **Always cleanup after tests:**
   ```typescript
   afterEach(() => {
     cleanupFFmpegMockAfterTest();
   });
   ```

2. **Use specific error helpers for clarity:**
   ```typescript
   // Good
   mockFFmpegOOM();
   
   // Less clear
   mockFFmpegError('Cannot allocate memory');
   ```

3. **Test both happy and sad paths:**
   ```typescript
   describe('clip generation', () => {
     it('succeeds', async () => {
       mockFFmpegSuccess();
       // test success
     });
     
     it('retries on OOM', async () => {
       mockFFmpegOOM();
       // test retry logic
     });
   });
   ```

4. **Use realistic start/end times:**
   ```typescript
   // Good - tests float precision handling
   mockFFmpegSuccess();
   await cutClip({
     startTime: 12.500000001, // FFmpeg sanitization should handle this
     endTime: 45.7,
   });
   
   // Less realistic
   await cutClip({
     startTime: 0,
     endTime: 100,
   });
   ```

## Running Tests

```bash
# Run all tests with FFmpeg mock
npm test

# Run specific test file
npm test -- video-upload.service.spec.ts

# Run with mock debug logging
MOCK_FFMPEG_DEBUG=1 npm test

# Run with watch mode
npm test -- --watch
```

## Troubleshooting

### Mock not being used

Ensure the mock import is at the TOP of the test file, before other imports:

```typescript
// ✅ Correct
jest.mock('fluent-ffmpeg', () => require('../__mocks__/fluent-ffmpeg'));
import { someService } from './service';

// ❌ Wrong - mock won't work
import { someService } from './service';
jest.mock('fluent-ffmpeg', () => require('../__mocks__/fluent-ffmpeg'));
```

### Tests failing unexpectedly

1. Check that `cleanupFFmpegMockAfterTest()` is called in `afterEach()`
2. Verify no test is setting a specific mock state that affects others
3. Run tests individually to isolate the issue:
   ```bash
   npm test -- --testNamePattern="specific test name"
   ```

### File creation issues

If you need actual files created during tests:

```typescript
mockFFmpegSuccess({
  createOutputFile: true,
  fileContent: Buffer.from('test video data'),
});
```

Note: This is rarely needed in unit tests but useful for integration tests.

## See Also

- [FFmpeg Mock Implementation](../test/__mocks__/fluent-ffmpeg.ts)
- [Helper Functions](../test/helpers/ffmpeg-mock.helper.ts)
- [E2E Test Example](../test/clip-generation.e2e-spec.ts)
