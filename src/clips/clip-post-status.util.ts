/**
 * Shared "has this clip been posted?" predicate (Issue #764).
 *
 * Posted clips cannot be minted as NFTs, and that rule is enforced in two
 * places — the `NftMintGuard` (HTTP edge) and `ClipsService.preventPostedMint`
 * (service level, which also covers batch minting). Both read the answer from
 * here so they can never disagree.
 */

/** Values of `Clip.postStatus` / `ClipPost.status` that mean "live on a platform". */
const POSTED_STATES = new Set(['posted', 'published', 'live', 'complete', 'completed']);

/** Shape of the clip fields the predicate needs. */
export interface PostStatusSource {
  /** Free-form JSON column: either a bare status string or a per-platform map. */
  postStatus?: unknown;
  /** Set when the auto-poster successfully published the clip. */
  postedAt?: Date | null;
  /** Per-platform post rows, when the caller loaded them. */
  clipPosts?: { status: string }[];
}

function isPostedValue(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (typeof value === 'string') {
    return POSTED_STATES.has(value.toLowerCase());
  }
  return false;
}

/**
 * Returns true when the clip has been posted to at least one social platform.
 *
 * `postStatus` is an untyped JSON column that has been written both as a bare
 * string (`"posted"`) and as a per-platform map (`{ tiktok: "posted" }`), so
 * both shapes are accepted. `postedAt` and any published `clipPost` row are
 * treated as equally authoritative.
 */
export function isClipPosted(clip: PostStatusSource): boolean {
  if (clip.postedAt) {
    return true;
  }

  const status = clip.postStatus;
  if (isPostedValue(status)) {
    return true;
  }

  if (status && typeof status === 'object' && !Array.isArray(status)) {
    if (Object.values(status as Record<string, unknown>).some(isPostedValue)) {
      return true;
    }
  }

  if (Array.isArray(status) && status.some(isPostedValue)) {
    return true;
  }

  return (clip.clipPosts ?? []).some((post) => isPostedValue(post.status));
}

/** Error message returned (as HTTP 400) when a posted clip is submitted for minting. */
export const POSTED_CLIP_MINT_ERROR = 'Posted clips cannot be minted.';
