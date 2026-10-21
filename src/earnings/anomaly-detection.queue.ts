export const ANOMALY_DETECTION_QUEUE = 'anomaly-detection';
export const ANOMALY_DETECTION_QUEUE_PRIORITY = 3;

export interface AnomalyDetectionJobData {
  earningId: number;
  userId: number;
  amount: number;
  clipId: number;
}

/**
 * Retry policy for anomaly detection (Issue #1235).
 * Failed jobs are retained (`removeOnFail: false`) for inspection via
 * `GET /jobs/failed` and manual retry via `POST /jobs/retry/:jobId`.
 */
export const ANOMALY_DETECTION_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: false,
  removeOnFail: false,
  priority: ANOMALY_DETECTION_QUEUE_PRIORITY,
} as const;
