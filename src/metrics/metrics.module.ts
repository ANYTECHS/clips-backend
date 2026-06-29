import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { QueueMetricsService } from './queue-metrics.service';
import { QueueCollectorService } from './queue-collector.service';

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [MetricsController],
  providers: [
    QueueMetricsService,
    QueueCollectorService,
    MetricsService,
    MetricsInterceptor,
  ],
  exports: [MetricsService, MetricsInterceptor, QueueMetricsService, QueueCollectorService],
})
export class MetricsModule {}
