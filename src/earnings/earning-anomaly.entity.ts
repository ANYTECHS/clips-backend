export enum AnomalySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AnomalyStatus {
  DETECTED = 'detected',
  REVIEWED = 'reviewed',
  FALSE_POSITIVE = 'false_positive',
  CONFIRMED = 'confirmed',
}

export interface EarningAnomaly {
  id: number;
  userId: number;
  earningId: number;
  reason: string;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  detectedAt: Date;
  reviewedAt: Date | null;
}