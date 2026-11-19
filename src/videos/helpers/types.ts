export type ViralMoment = { start: number; end: number; reason: string };

export type VideoProcessingStatsInput = {
  momentsFound: number;
  inputQuality: string;
  durationSec: number;
  clipsGenerated: number;
  timeTakenMs: number;
  avgDurationSec?: number;
  error?: string;
  moments?: ViralMoment[];
};

export type VideoMetadataResult = {
  durationSec: number;
  inputQuality: string;
};

export type ClaudeDetectionResult = {
  moments: ViralMoment[] | null;
  provider: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  error?: string;
};
