import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface AnomalyConfig {
  thresholdMultiplier: number;
  minEarningsForAnalysis: number;
  lookbackDays: number;
}

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);
  private readonly config: AnomalyConfig = {
    thresholdMultiplier: parseFloat(process.env.ANOMALY_THRESHOLD_MULTIPLIER ?? '3'),
    minEarningsForAnalysis: parseFloat(process.env.MIN_EARNINGS_FOR_ANALYSIS ?? '10'),
    lookbackDays: parseInt(process.env.ANOMALY_LOOKBACK_DAYS ?? '30', 10),
  };

  constructor(private prisma: PrismaService) {}

  async detectAnomalies(earningId: number): Promise<{
    isAnomaly: boolean;
    reason?: string;
    severity?: 'low' | 'medium' | 'high';
  }> {
    const earning = await this.prisma.earning.findUnique({
      where: { id: earningId },
      include: {
        clip: {
          include: {
            video: {
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!earning) {
      this.logger.warn(`Earning ${earningId} not found for anomaly detection`);
      return { isAnomaly: false };
    }

    const userId = earning.clip.video.userId;

    const userEarnings = await this.prisma.earning.findMany({
      where: {
        clip: { video: { userId } },
        deletedAt: null,
        date: {
          gte: new Date(
            Date.now() - this.config.lookbackDays * 24 * 60 * 60 * 1000,
          ),
        },
      },
      select: { amount: true, date: true },
      orderBy: { date: 'desc' },
    });

    if (userEarnings.length < 3) {
      this.logger.log(
        `User ${userId} has insufficient earnings history for anomaly detection`,
      );
      return { isAnomaly: false };
    }

    const amounts = userEarnings.map((e) => e.amount);
    const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const variance =
      amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    const zScore = (earning.amount - mean) / (stdDev || 1);

    if (zScore > this.config.thresholdMultiplier) {
      const severity: 'low' | 'medium' | 'high' =
        zScore > 5 ? 'high' : zScore > 4 ? 'medium' : 'low';

      const reason = `Earning amount $${earning.amount.toFixed(2)} is ${zScore.toFixed(2)} standard deviations above the user's average of $${mean.toFixed(2)}`;

      await this.prisma.earning.update({
        where: { id: earningId },
        data: {
          isAnomaly: true,
          anomalyReason: reason,
        },
      });

      await this.prisma.anomalyAlert.create({
        data: {
          earningId,
          userId,
          amount: earning.amount,
          reason,
          severity,
        },
      });

      this.logger.warn(
        `Anomaly detected for earning ${earningId}: ${reason} (severity: ${severity})`,
      );

      return { isAnomaly: true, reason, severity };
    }

    return { isAnomaly: false };
  }

  async getUnresolvedAlerts(): Promise<
    Array<{
      id: number;
      earningId: number;
      userId: number;
      amount: number;
      reason: string;
      severity: string;
      createdAt: Date;
    }>
  > {
    return this.prisma.anomalyAlert.findMany({
      where: { isResolved: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveAlert(alertId: number): Promise<void> {
    await this.prisma.anomalyAlert.update({
      where: { id: alertId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      },
    });

    this.logger.log(`Anomaly alert ${alertId} resolved`);
  }
}
