import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { AnomalySeverity, AnomalyStatus } from './earning-anomaly.entity';

interface BaselineResult {
  avgAmount: number;
  stdDev: number;
  sampleCount: number;
}

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async detectAnomalies(): Promise<void> {
    this.logger.log('Running earnings anomaly detection scan...');

    const thresholdMultiplier = this.config.anomalyThresholdMultiplier;
    const lookbackDays = this.config.anomalyLookbackDays;
    const minEarnings = this.config.minEarningsForAnalysis;

    const recentEarnings = await this.prisma.earning.findMany({
      where: {
        deletedAt: null,
        isAnomaly: false,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      include: {
        clip: {
          include: { video: { select: { userId: true } } },
        },
      },
    });

    for (const earning of recentEarnings) {
      const userId = earning.clip?.video?.userId;
      if (!userId) continue;

      try {
        const baseline = await this.calculateBaseline(userId, lookbackDays);
        if (baseline.sampleCount < 3 || baseline.avgAmount < minEarnings) {
          continue;
        }

        const upperBound = baseline.avgAmount + thresholdMultiplier * baseline.stdDev;

        if (earning.amount > upperBound) {
          const severity = this.classifySeverity(earning.amount, baseline);
          await this.flagAnomaly(earning.id, userId, severity, earning.amount, baseline);
        }
      } catch (error) {
        this.logger.error(
          Anomaly check failed for earning : ,
        );
      }
    }
  }

  async calculateBaseline(userId: number, lookbackDays: number): Promise<BaselineResult> {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const earnings = await this.prisma.earning.findMany({
      where: {
        clip: { video: { userId } },
        deletedAt: null,
        isAnomaly: false,
        createdAt: { gte: cutoff },
      },
      select: { amount: true },
    });

    if (earnings.length === 0) {
      return { avgAmount: 0, stdDev: 0, sampleCount: 0 };
    }

    const amounts = earnings.map((e) => e.amount);
    const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const variance =
      amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) /
      amounts.length;
    const stdDev = Math.sqrt(variance);

    return { avgAmount, stdDev, sampleCount: amounts.length };
  }

  private classifySeverity(
    amount: number,
    baseline: BaselineResult,
  ): AnomalySeverity {
    if (baseline.stdDev === 0) return AnomalySeverity.MEDIUM;

    const zScore = (amount - baseline.avgAmount) / baseline.stdDev;

    if (zScore > 5) return AnomalySeverity.CRITICAL;
    if (zScore > 4) return AnomalySeverity.HIGH;
    if (zScore > 3) return AnomalySeverity.MEDIUM;
    return AnomalySeverity.LOW;
  }

  private async flagAnomaly(
    earningId: number,
    userId: number,
    severity: AnomalySeverity,
    amount: number,
    baseline: BaselineResult,
  ): Promise<void> {
    const reason =
      Earning amount  exceeds baseline (avg: ,  +
      stdDev: , samples: );

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
      Anomaly detected: earning , user , severity , amount ,
    );
  }

  async markFalsePositive(alertId: number, reviewedBy?: number): Promise<void> {
    const alert = await this.prisma.anomalyAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new Error(Anomaly alert  not found);
    }

    await this.prisma.anomalyAlert.update({
      where: { id: alertId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      },
    });

    await this.prisma.earning.update({
      where: { id: alert.earningId },
      data: { isAnomaly: false, anomalyReason: null },
    });

    this.logger.log(
      Anomaly alert  marked as false positive for earning ,
    );
  }

  async getAnomalyAlerts(
    userId?: number,
    unresolvedOnly = true,
  ): Promise<any[]> {
    const where: any = {};
    if (userId) where.userId = userId;
    if (unresolvedOnly) where.isResolved = false;

    return this.prisma.anomalyAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
