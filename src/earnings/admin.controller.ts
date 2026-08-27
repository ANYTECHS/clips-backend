import {
  Controller,
  Get,
  Post,
  Param,
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
import { AnomalyDetectionService } from './anomaly-detection.service';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiForbiddenResponse({ description: 'Forbidden — admin access required' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('admin/anomalies')
@Auth()
@Admin()
export class AdminAnomaliesController {
  constructor(
    private readonly anomalyDetectionService: AnomalyDetectionService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get unresolved anomaly alerts',
    description: 'Returns all unresolved earnings anomaly alerts (admin only)',
  })
  @ApiResponse({ status: 200, description: 'List of unresolved alerts' })
  async getUnresolvedAlerts() {
    return this.anomalyDetectionService.getUnresolvedAlerts();
  }

  @Post(':id/resolve')
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
