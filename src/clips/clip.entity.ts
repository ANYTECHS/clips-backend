export type PostStatus =
  | 'pending'
  | 'posted'
  | 'failed'
  | Record<string, unknown>;

export interface Clip {
  id: string;
  videoId: string;
  /** Owner user ID — used to validate bulk-update requests */
  userId: string;
  /** Start time of the clip in seconds */
  startTime: number;
  /** End time of the clip in seconds */
  endTime: number;
  /** Actual duration of the clip in seconds (probed after cut) */
  duration: number;
  /** 0.0–1.0 — where in the source video this clip starts (0 = beginning, 1 = end) */
  positionRatio: number;
  /** Transcript text for this clip segment */
  transcript?: string;
  /**
   * Heuristic virality score (0–100).
   * Null until the clip-generation processor runs.
   * Replace with AI-model output once integrated.
   */
  viralityScore: number | null;
  /** Cloudinary secure URL for the clip video */
  clipUrl?: string;
  /** Cloudinary thumbnail URL */
  thumbnail?: string;
  /** Clip processing status: 'pending', 'processing', 'success', 'failed', 'upload_failed' */
  status?: 'pending' | 'processing' | 'success' | 'failed' | 'upload_failed' | 'upload_processed';
  /** Error message if upload/processing failed */
  error?: string;
  /** Local file path as fallback when Cloudinary upload fails */
  localFilePath?: string;
  /** Whether the user has curated/selected this clip for posting */
  selected: boolean;
  /** Freeform posting status — e.g. 'pending' | 'posted' | 'failed' or platform-specific JSON */
  postStatus: PostStatus | null;
  /**
   * Auto-generated caption placeholder derived from the clip title/transcript + emojis.
   * Editable by the user before posting.
   */
  caption?: string;
  /**
   * NFT royalty percentage in Basis Points (BPS).
   * 1000 BPS = 10%, range: 0–1500 BPS (0–15%).
   * Defaults to 1000 (10%) if not provided.
   * Used when minting clips as NFTs on Soroban/Stellar.
   */
  royaltyBps?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
