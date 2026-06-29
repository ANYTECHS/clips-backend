import { Controller, Get, Req, Res, Next, Post, Body, BadRequestException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { Auth } from '../auth/decorators/auth.decorator';
import { QueueDashboardService } from './queue-dashboard.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('queues')
@ApiBearerAuth('access-token')
@Controller('admin/queues')
@Auth('admin')
export class QueueDashboardController {
  constructor(
    private readonly queueDashboardService: QueueDashboardService,
    private readonly queueCollectorService: QueueCollectorService,
  ) {}

  @Get('*')
  dashboard(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    const router = this.queueDashboardService.getRouter();
    return router(req, res, next);
  }

  @Post('pause')
  @ApiOperation({ summary: 'Pause queue processing', description: 'Pause a specific queue or all queues' })
  async pause(@Body() body: { queue?: string }) {
    if (body.queue) {
      try {
        await this.queueDashboardService.pauseQueue(body.queue);
        return { message: `Queue ${body.queue} paused successfully` };
      } catch (error) {
        throw new BadRequestException(error.message);
      }
    } else {
      await this.queueDashboardService.pauseAllQueues();
      return { message: 'All queues paused successfully' };
    }
  }

  @Post('resume')
  @ApiOperation({ summary: 'Resume queue processing', description: 'Resume a specific queue or all queues' })
  async resume(@Body() body: { queue?: string }) {
    if (body.queue) {
      try {
        await this.queueDashboardService.resumeQueue(body.queue);
        return { message: `Queue ${body.queue} resumed successfully` };
      } catch (error) {
        throw new BadRequestException(error.message);
      }
    } else {
      await this.queueDashboardService.resumeAllQueues();
      return { message: 'All queues resumed successfully' };
    }
  }
}
