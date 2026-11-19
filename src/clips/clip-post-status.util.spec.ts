import { isClipPosted } from './clip-post-status.util';

describe('isClipPosted (Issue #764)', () => {
  it('returns false for a clip that was never posted', () => {
    expect(
      isClipPosted({ postStatus: null, postedAt: null, clipPosts: [] }),
    ).toBe(false);
  });

  it('detects the bare-string postStatus shape', () => {
    expect(isClipPosted({ postStatus: 'posted' })).toBe(true);
    expect(isClipPosted({ postStatus: 'PUBLISHED' })).toBe(true);
    expect(isClipPosted({ postStatus: 'pending' })).toBe(false);
    expect(isClipPosted({ postStatus: 'failed' })).toBe(false);
  });

  it('detects the per-platform map postStatus shape', () => {
    expect(isClipPosted({ postStatus: { tiktok: 'posted' } })).toBe(true);
    expect(
      isClipPosted({ postStatus: { tiktok: 'pending', youtube: 'published' } }),
    ).toBe(true);
    expect(isClipPosted({ postStatus: { tiktok: true } })).toBe(true);
    expect(
      isClipPosted({ postStatus: { tiktok: 'pending', youtube: 'failed' } }),
    ).toBe(false);
  });

  it('treats postedAt as authoritative on its own', () => {
    expect(isClipPosted({ postStatus: null, postedAt: new Date() })).toBe(true);
  });

  it('treats a published clipPost row as authoritative on its own', () => {
    expect(
      isClipPosted({
        postStatus: null,
        postedAt: null,
        clipPosts: [{ status: 'pending' }, { status: 'published' }],
      }),
    ).toBe(true);
  });

  it('does not treat failed or pending clipPost rows as posted', () => {
    expect(
      isClipPosted({
        clipPosts: [{ status: 'pending' }, { status: 'failed' }],
      }),
    ).toBe(false);
  });

  it('handles an array postStatus without throwing', () => {
    expect(isClipPosted({ postStatus: ['pending', 'posted'] })).toBe(true);
    expect(isClipPosted({ postStatus: ['pending'] })).toBe(false);
  });

  it('handles missing fields entirely', () => {
    expect(isClipPosted({})).toBe(false);
  });
});
