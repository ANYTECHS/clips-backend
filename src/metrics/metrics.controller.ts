import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  async getMetrics(
    @Headers('x-metrics-token') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const expected = process.env.METRICS_TOKEN;
    if (!expected || token !== expected) {
      throw new ForbiddenException('Forbidden');
    }

    const payload = await this.metricsService.getMetrics();
    res.setHeader('Content-Type', this.metricsService.getContentType());
    res.send(payload);
  }
}
