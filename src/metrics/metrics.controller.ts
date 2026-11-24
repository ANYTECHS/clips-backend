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
    summary: 'Get Prometheus operational queue and application metrics',
    description:
      'Exposes operational metrics in Prometheus text format (separate from standard JSON schemas). ' +
      'Includes queue depth, active jobs, processing duration, failure rates, and worker memory usage. ' +
      'Requires x-metrics-token header to protect sensitive infrastructure and operational metrics.',
  })
  @ApiHeader({
    name: 'x-metrics-token',
    description: 'Metrics authentication token configured via METRICS_TOKEN',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description:
      'Metrics returned in Prometheus text format (text/plain; version=0.0.4; charset=utf-8). ' +
      'Consumed by Prometheus scraping agents or Grafana collectors.',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
          example:
            '# HELP clipcash_queue_job_count Current number of jobs in queue by state\n' +
            '# TYPE clipcash_queue_job_count gauge\n' +
            'clipcash_queue_job_count{queue="clip-generation",state="active"} 2\n' +
            '# HELP clipcash_queue_depth Total queue depth (waiting and delayed jobs) awaiting execution\n' +
            '# TYPE clipcash_queue_depth gauge\n' +
            'clipcash_queue_depth{queue="clip-generation"} 5\n' +
            '# HELP clipcash_queue_failure_rate Job failure rate ratio\n' +
            '# TYPE clipcash_queue_failure_rate gauge\n' +
            'clipcash_queue_failure_rate{queue="clip-generation"} 0.05',
        },
      },
    },
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
