import {
  buildVideo,
  buildVideoRecord,
  buildVideoRecordList,
  buildVideoWithStatus,
} from '../test/fixtures/video.fixture';
import {
  buildClip,
  buildClipList,
  buildClipRecord,
  buildClipWithStatus,
  buildClipVariant,
} from '../test/fixtures/clip.fixture';

describe('Video and Clip test factories', () => {
  it('creates videos with defaults and field overrides', () => {
    const video = buildVideo({
      id: 'video-custom',
      status: 'failed',
      processingError: 'Timeout',
    });

    expect(video.id).toBe('video-custom');
    expect(video.status).toBe('failed');
    expect(video.processingError).toBe('Timeout');
    expect(video.createdAt).toBeInstanceOf(Date);
  });

  it('creates realistic Prisma video records', () => {
    const video = buildVideoRecord({ id: 42, userId: 7, duration: 900 });

    expect(video.id).toBe(42);
    expect(video.userId).toBe(7);
    expect(video.duration).toBe(900);
    expect(video.metadata).toEqual(
      expect.objectContaining({ width: 1920, height: 1080 }),
    );
  });

  it('builds deterministic video lists and status variants', () => {
    const videos = buildVideoRecordList(3);
    const failed = buildVideoWithStatus('failed');

    expect(videos).toHaveLength(3);
    expect(videos[0].createdAt.getTime()).toBeGreaterThan(
      videos[1].createdAt.getTime(),
    );
    expect(failed.status).toBe('failed');
    expect(failed.processingError).not.toBeNull();
  });

  it('creates clips with defaults and field overrides', () => {
    const clip = buildClip({
      id: 42,
      viralityScore: 96.8,
      status: 'success',
    });

    expect(clip.id).toBe(42);
    expect(clip.viralityScore).toBe(96.8);
    expect(clip.status).toBe('success');
  });

  it('creates varied clip lists and status variants', () => {
    const clips = buildClipList(4);
    const failed = buildClipWithStatus('upload_failed', {
      error: 'Cloudinary unavailable',
    });
    const viral = buildClipVariant('viral');

    expect(clips).toHaveLength(4);
    expect(clips.map((clip) => clip.viralityScore)).toEqual([
      92.1,
      85.7,
      78.3,
      71.9,
    ]);
    expect(failed.status).toBe('upload_failed');
    expect(failed.error).toBe('Cloudinary unavailable');
    expect(viral.viralityScore).toBe(95.2);
  });

  it('creates realistic Prisma clip records', () => {
    const clip = buildClipRecord({
      id: 100,
      videoId: 10,
      status: 'pending',
    });

    expect(clip.id).toBe(100);
    expect(clip.videoId).toBe(10);
    expect(clip.status).toBe('pending');
    expect(clip.createdAt).toBeInstanceOf(Date);
  });
});
