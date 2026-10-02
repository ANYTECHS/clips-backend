import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { LoginGuard } from '../auth/guards/login.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@UseGuards(LoginGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List job-completion notifications',
    description:
      'Returns the authenticated user\u2019s completion notifications, newest first. ' +
      'Subscribe to the `notification.created` WebSocket event on the `/video-progress` namespace ' +
      'for real-time delivery with payload {id, jobId, type, title, body, link}.',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Max items (default 20, max 100)', example: 20 })
  @ApiQuery({ name: 'unreadOnly', required: false, description: 'Only unread notifications', example: false })
  @ApiResponse({
    status: 200,
    description: 'Notifications returned with read/unread state',
    schema: {
      example: [
        {
          id: 1,
          jobId: 'abc123',
          type: 'clip-generation',
          title: 'Your clips are ready',
          body: 'Video processing finished',
          link: '/clips/9',
          readAt: null,
          createdAt: '2026-09-29T00:00:00.000Z',
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@Req() req: Request, @Query('limit') limit?: string, @Query('unreadOnly') unreadOnly?: string) {
    const userId = Number((req as any).user?.userId ?? 0);
    return this.notificationsService.listForUser(userId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Marked as read (count of updated rows)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Notification not found' })
  async markRead(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const userId = Number((req as any).user?.userId ?? 0);
    return this.notificationsService.markRead(userId, id);
  }
}
