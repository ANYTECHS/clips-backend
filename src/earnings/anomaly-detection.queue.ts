export const ANOMALY_DETECTION_QUEUE = 'anomaly-detection';
export const ANOMALY_DETECTION_QUEUE_PRIORITY = 3;

export interface AnomalyDetectionJobData {
  earningId: number;
  userId: number;
  amount: number;
  clipId: number;
}
