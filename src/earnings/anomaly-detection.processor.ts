import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { ANOMALY_DETECTION_QUEUE } from './anomaly-detection.queue';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { MetricsService } from '../metrics/metrics.service';
import { AnomalySeverity } from './earning-anomaly.entity';
import { GracefulShutdownService } from '../common/shutdown/graceful-shutdown.service';
import {
  handleFailedEvent,
  handleProcessingError,
} from '../queue/processor-error.handler';

@Processor(ANOMALY_DETECTION_QUEUE)
export class AnomalyDetectionProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AnomalyDetectionProcessor.name);

  constructor(
    private readonly anomalyService: AnomalyDetectionService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly metricsService: MetricsService,
    private readonly shutdownService: GracefulShutdownService,
  ) {
    super();
  }

  onModuleInit(): void {
    this.shutdownService.register(this.worker);
  }

  async process(job: Job): Promise<void> {
    const { earningId, userId, amount, clipId } = job.data;
    const jobMetricId = `${ANOMALY_DETECTION_QUEUE}:${job.id}`;
    this.logger.log(
      `Processing anomaly detection for earning ${earningId} — attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1} ` +
        JSON.stringify({ queue: ANOMALY_DETECTION_QUEUE, jobId: job.id, earningId, userId, clipId }),
    );
    this.metricsService.recordJobStart(jobMetricId);

    try {
      if (typeof earningId !== 'number' || typeof userId !== 'number' || typeof amount !== 'number') {
        throw new UnrecoverableError(
          `[${ANOMALY_DETECTION_QUEUE}:${String(job.id)}] Invalid anomaly job payload: earningId, userId and amount must be numbers`,
        );
      }

      const baseline = await this.anomalyService.calculateBaseline(
        userId,
        this.config.anomalyLookbackDays,
      );

      if (baseline.sampleCount < 3) {
        this.logger.log(
          `Insufficient baseline data for user ${userId} (${baseline.sampleCount} samples) ` +
            JSON.stringify({ queue: ANOMALY_DETECTION_QUEUE, jobId: job.id, userId }),
        );
        this.metricsService.recordJobCompletion(jobMetricId, ANOMALY_DETECTION_QUEUE, 'success');
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
          `Anomaly detected in job ${String(job.id)}: earning ${earningId}, user ${userId}, severity ${severity}, amount ${amount} ` +
            JSON.stringify({ queue: ANOMALY_DETECTION_QUEUE, jobId: job.id, earningId, userId, severity }),
        );
      }

      this.metricsService.recordJobCompletion(jobMetricId, ANOMALY_DETECTION_QUEUE, 'success');
    } catch (error) {
      handleProcessingError(
        this.logger,
        this.metricsService,
        ANOMALY_DETECTION_QUEUE,
        job,
        jobMetricId,
        error,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    handleFailedEvent(this.logger, this.metricsService, ANOMALY_DETECTION_QUEUE, job, error, 2000);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(
      `Anomaly detection job ${String(job.id)} completed ` +
        JSON.stringify({ queue: ANOMALY_DETECTION_QUEUE, jobId: job.id }),
    );
  }
}
