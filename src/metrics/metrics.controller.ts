import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  @ApiOperation({
    summary: 'Get Prometheus metrics',
    description:
      'Returns Prometheus-formatted metrics for monitoring. Requires x-metrics-token header.',
  })
  @ApiHeader({
    name: 'x-metrics-token',
    description: 'Metrics authentication token',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Metrics returned in Prometheus format',
  })
  @ApiForbiddenResponse({ description: 'Invalid or missing metrics token' })
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
