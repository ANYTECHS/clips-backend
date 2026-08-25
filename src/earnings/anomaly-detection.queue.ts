/**
 * Anomaly-detection queue — flags suspicious earnings patterns.
 * Low priority: background analytics, runs after user-facing work.
 */
export const ANOMALY_DETECTION_QUEUE = 'anomaly-detection';
export const ANOMALY_DETECTION_JOB = 'detect-anomaly';
export const ANOMALY_DETECTION_QUEUE_PRIORITY = 8;

export interface AnomalyDetectionJobData {
  earningId: number;
  userId: number;
  amount: number;
  clipId: number;
}
