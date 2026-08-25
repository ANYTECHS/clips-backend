import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ANOMALY_DETECTION_QUEUE } from './anomaly-detection.queue';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { AnomalySeverity } from './earning-anomaly.entity';

@Processor(ANOMALY_DETECTION_QUEUE)
export class AnomalyDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(AnomalyDetectionProcessor.name);

  constructor(
    private readonly anomalyService: AnomalyDetectionService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { earningId, userId, amount, clipId } = job.data;
    this.logger.log(Processing anomaly detection for earning );

    const baseline = await this.anomalyService.calculateBaseline(
      userId,
      this.config.anomalyLookbackDays,
    );

    if (baseline.sampleCount < 3) {
      this.logger.log(
        Insufficient baseline data for user  ( samples),
      );
      return;
    }

    const thresholdMultiplier = this.config.anomalyThresholdMultiplier;
    const upperBound = baseline.avgAmount + thresholdMultiplier * baseline.stdDev;

    if (amount > upperBound) {
      const zScore = (amount - baseline.avgAmount) / baseline.stdDev;
      let severity: AnomalySeverity;
      if (zScore > 5) severity = AnomalySeverity.CRITICAL;
      else if (zScore > 4) severity = AnomalySeverity.HIGH;
      else if (zScore > 3) severity = AnomalySeverity.MEDIUM;
      else severity = AnomalySeverity.LOW;

      const reason =
        'Earning amount ' + amount + ' exceeds baseline (avg: ' +
        baseline.avgAmount.toFixed(2) + ', stdDev: ' +
        baseline.stdDev.toFixed(2) + ', samples: ' + baseline.sampleCount + ')';

      await this.prisma.earning.update({
        where: { id: earningId },
        data: { isAnomaly: true, anomalyReason: reason },
      });

      await this.prisma.anomalyAlert.create({
        data: {
          earningId,
          userId,
          amount,
          reason,
          severity,
          isResolved: false,
        },
      });

      this.logger.warn(
        'Anomaly detected in job: earning ' + earningId + ', user ' + userId +
        ', severity ' + severity + ', amount ' + amount,
      );
    }
  }
}