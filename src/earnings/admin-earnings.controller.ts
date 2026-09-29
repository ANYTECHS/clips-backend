import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { Admin } from '../auth/decorators/admin.decorator';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { AnomalyDetectionService } from './anomaly-detection.service';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiForbiddenResponse({ description: 'Forbidden — admin access required' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('admin')
@Auth()
@Admin()
export class AdminEarningsController {
  constructor(
    private readonly earningsAggregationService: EarningsAggregationService,
    private readonly anomalyDetectionService: AnomalyDetectionService,
  ) {}

  @Post('earnings/:earningId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a soft-deleted earning record',
    description:
      'Clears deletedAt on an earning so it reappears in normal queries and aggregations. Admin only.',
  })
  @ApiParam({ name: 'earningId', type: Number, description: 'Earning record ID' })
  @ApiResponse({
    status: 200,
    description: 'Earning restored successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Earning restored successfully' },
        id: { type: 'number', example: 42 },
        deletedAt: { type: 'null', example: null },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Earning not found or is not soft-deleted',
  })
  async restoreEarning(@Param('earningId', ParseIntPipe) earningId: number) {
    return this.earningsAggregationService.restore(earningId);
  }

  @Get('anomalies')
  @ApiOperation({
    summary: 'Get unresolved anomaly alerts',
    description: 'Returns all unresolved earnings anomaly alerts (admin only)',
  })
  @ApiResponse({ status: 200, description: 'List of unresolved alerts' })
  async getUnresolvedAlerts() {
    return this.anomalyDetectionService.getUnresolvedAlerts();
  }

  @Post('anomalies/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve an anomaly alert',
    description: 'Marks an anomaly alert as resolved (admin only)',
  })
  @ApiParam({ name: 'id', description: 'Anomaly alert ID', type: 'number' })
  @ApiResponse({ status: 200, description: 'Alert resolved successfully' })
  @ApiNotFoundResponse({ description: 'Alert not found' })
  async resolveAlert(@Param('id') id: string) {
    await this.anomalyDetectionService.resolveAlert(parseInt(id, 10));
    return { message: 'Alert resolved successfully' };
  }
}
