import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { Admin } from '../auth/decorators/admin.decorator';
import { AnomalyDetectionService } from './anomaly-detection.service';

@Controller('admin/anomalies')
@Auth()
@Admin()
export class AdminAnomaliesController {
  constructor(private readonly anomalyDetectionService: AnomalyDetectionService) {}

  @Get()
  async getUnresolvedAlerts() {
    return this.anomalyDetectionService.getUnresolvedAlerts();
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveAlert(@Param('id') id: string) {
    await this.anomalyDetectionService.resolveAlert(parseInt(id, 10));
    return { message: 'Alert resolved successfully' };
  }
}
